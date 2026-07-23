#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, Address, Env,
    String,
};

// --- Types ---

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum ShipmentStatus {
    Created = 0,
    Accepted = 1,
    Completed = 2,
    Cancelled = 3,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct Shipment {
    pub shipper: Address,
    pub driver: Address,
    pub amount: i128,
    pub status: ShipmentStatus,
    pub shipment_id: String,
    pub created_at: u64,
}

#[contracttype]
pub enum DataKey {
    Shipment(String),
    TokenAddress,
    Deployer,
}

// --- Errors ---

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    ShipmentNotFound = 1,
    InvalidStatus = 2,
    NotShipper = 3,
    NotDriver = 4,
    Unauthorized = 5,
    AlreadyExists = 6,
    InsufficientBalance = 7,
    TransferFailed = 8,
    InvalidAmount = 9,
}

// --- Events ---

#[contractevent]
pub struct ShipmentCreated {
    #[topic]
    pub shipment_id: String,
    #[topic]
    pub shipper: Address,
    pub driver: Address,
    pub amount: i128,
}

#[contractevent]
pub struct ShipmentAccepted {
    #[topic]
    pub shipment_id: String,
    #[topic]
    pub driver: Address,
}

#[contractevent]
pub struct PaymentReleased {
    #[topic]
    pub shipment_id: String,
    #[topic]
    pub driver: Address,
    pub amount: i128,
}

#[contractevent]
pub struct ShipmentCancelled {
    #[topic]
    pub shipment_id: String,
    #[topic]
    pub shipper: Address,
    pub refund_amount: i128,
}

// --- Contract ---

#[contract]
pub struct CargoNodeEscrow;

#[contractimpl]
impl CargoNodeEscrow {
    /// Constructor: set the USDC token contract address and deployer.
    pub fn __constructor(env: Env, deployer: Address, token_address: Address) {
        env.storage()
            .instance()
            .set(&DataKey::TokenAddress, &token_address);
        env.storage()
            .instance()
            .set(&DataKey::Deployer, &deployer);
    }

    /// Create a new shipment with escrowed payment.
    /// Shipper calls this to lock USDC into the contract.
    pub fn create_shipment(
        env: Env,
        shipper: Address,
        driver: Address,
        amount: i128,
        shipment_id: String,
    ) -> Result<(), Error> {
        shipper.require_auth();

        // Validate amount
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }

        // Check shipment doesn't already exist
        let key = DataKey::Shipment(shipment_id.clone());
        if env.storage().persistent().has(&key) {
            return Err(Error::AlreadyExists);
        }

        // Get token address
        let token_address: Address = env
            .storage()
            .instance()
            .get(&DataKey::TokenAddress)
            .ok_or(Error::Unauthorized)?;

        // Transfer USDC from shipper to this contract (escrow)
        // Verify transfer succeeds — if it fails, abort before creating shipment
        let token_client = soroban_sdk::token::Client::new(&env, &token_address);
        let result = token_client.try_transfer(&shipper, &env.current_contract_address(), &amount);
        if result.is_err() {
            return Err(Error::TransferFailed);
        }

        // Create shipment record
        let shipment = Shipment {
            shipper: shipper.clone(),
            driver: driver.clone(),
            amount,
            status: ShipmentStatus::Created,
            shipment_id: shipment_id.clone(),
            created_at: env.ledger().timestamp(),
        };

        env.storage().persistent().set(&key, &shipment);

        // Extend TTL so contract state is not archived
        env.storage().persistent().extend_ttl(&key, 120 * 17280, 180 * 17280);

        // Emit event
        ShipmentCreated {
            shipment_id,
            shipper,
            driver,
            amount,
        }
        .publish(&env);

        Ok(())
    }

    /// Driver accepts the shipment. Locks driver to the shipment.
    pub fn accept_shipment(env: Env, driver: Address, shipment_id: String) -> Result<(), Error> {
        driver.require_auth();

        let key = DataKey::Shipment(shipment_id.clone());
        let mut shipment: Shipment = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::ShipmentNotFound)?;

        if shipment.status != ShipmentStatus::Created {
            return Err(Error::InvalidStatus);
        }

        if shipment.driver != driver {
            return Err(Error::NotDriver);
        }

        shipment.status = ShipmentStatus::Accepted;
        env.storage().persistent().set(&key, &shipment);

        // Extend TTL
        env.storage().persistent().extend_ttl(&key, 120 * 17280, 180 * 17280);

        ShipmentAccepted {
            shipment_id,
            driver,
        }
        .publish(&env);

        Ok(())
    }

    /// Shipper confirms delivery. This triggers payment release to driver.
    pub fn confirm_delivery(
        env: Env,
        shipper: Address,
        shipment_id: String,
    ) -> Result<(), Error> {
        shipper.require_auth();

        let key = DataKey::Shipment(shipment_id.clone());
        let mut shipment: Shipment = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::ShipmentNotFound)?;

        if shipment.status != ShipmentStatus::Accepted {
            return Err(Error::InvalidStatus);
        }

        if shipment.shipper != shipper {
            return Err(Error::NotShipper);
        }

        // Get token address
        let token_address: Address = env
            .storage()
            .instance()
            .get(&DataKey::TokenAddress)
            .ok_or(Error::Unauthorized)?;

        // Verify contract holds sufficient balance before releasing
        let token_client = soroban_sdk::token::Client::new(&env, &token_address);
        let contract_balance = token_client.balance(&env.current_contract_address());
        if contract_balance < shipment.amount {
            return Err(Error::InsufficientBalance);
        }

        // Release payment to driver — verify transfer succeeds
        let result = token_client.try_transfer(
            &env.current_contract_address(),
            &shipment.driver,
            &shipment.amount,
        );
        if result.is_err() {
            return Err(Error::TransferFailed);
        }

        shipment.status = ShipmentStatus::Completed;
        env.storage().persistent().set(&key, &shipment);

        // Extend TTL
        env.storage().persistent().extend_ttl(&key, 120 * 17280, 180 * 17280);

        PaymentReleased {
            shipment_id,
            driver: shipment.driver,
            amount: shipment.amount,
        }
        .publish(&env);

        Ok(())
    }

    /// Shipper cancels shipment. Refund only if status is Created or Accepted.
    pub fn cancel_shipment(
        env: Env,
        shipper: Address,
        shipment_id: String,
    ) -> Result<(), Error> {
        shipper.require_auth();

        let key = DataKey::Shipment(shipment_id.clone());
        let mut shipment: Shipment = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::ShipmentNotFound)?;

        if shipment.shipper != shipper {
            return Err(Error::NotShipper);
        }

        // Only allow cancellation before delivery is confirmed
        if shipment.status != ShipmentStatus::Created
            && shipment.status != ShipmentStatus::Accepted
        {
            return Err(Error::InvalidStatus);
        }

        // Get token address
        let token_address: Address = env
            .storage()
            .instance()
            .get(&DataKey::TokenAddress)
            .ok_or(Error::Unauthorized)?;

        // Verify contract holds sufficient balance before refunding
        let token_client = soroban_sdk::token::Client::new(&env, &token_address);
        let contract_balance = token_client.balance(&env.current_contract_address());
        if contract_balance < shipment.amount {
            return Err(Error::InsufficientBalance);
        }

        // Refund to shipper — verify transfer succeeds
        let result = token_client.try_transfer(
            &env.current_contract_address(),
            &shipment.shipper,
            &shipment.amount,
        );
        if result.is_err() {
            return Err(Error::TransferFailed);
        }

        let refund_amount = shipment.amount;
        shipment.status = ShipmentStatus::Cancelled;
        env.storage().persistent().set(&key, &shipment);

        // Extend TTL
        env.storage().persistent().extend_ttl(&key, 120 * 17280, 180 * 17280);

        ShipmentCancelled {
            shipment_id,
            shipper,
            refund_amount,
        }
        .publish(&env);

        Ok(())
    }

    /// Read shipment details
    pub fn get_shipment(env: Env, shipment_id: String) -> Result<Shipment, Error> {
        let key = DataKey::Shipment(shipment_id);
        env.storage()
            .persistent()
            .get(&key)
            .ok_or(Error::ShipmentNotFound)
    }
}

// --- Tests ---

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env, String};

    fn create_test_token(env: &Env, to: &Address, amount: i128) -> Address {
        let admin = Address::generate(env);
        let sac = env.register_stellar_asset_contract_v2(admin);
        let client = soroban_sdk::token::StellarAssetClient::new(env, &sac.address());
        client.mint(to, &amount);
        sac.address()
    }

    #[test]
    fn test_create_shipment() {
        let env = Env::default();
        env.mock_all_auths();

        let shipper = Address::generate(&env);
        let driver = Address::generate(&env);
        let token = create_test_token(&env, &shipper, 10000);

        let contract_id = env.register(CargoNodeEscrow, (shipper.clone(), token));
        let client = CargoNodeEscrowClient::new(&env, &contract_id);

        let shipment_id = String::from_str(&env, "SHIP001");

        client.create_shipment(&shipper, &driver, &1000, &shipment_id);

        let shipment = client.get_shipment(&shipment_id);
        assert_eq!(shipment.status, ShipmentStatus::Created);
        assert_eq!(shipment.amount, 1000);
        assert_eq!(shipment.shipper, shipper);
        assert_eq!(shipment.driver, driver);
    }

    #[test]
    fn test_accept_shipment() {
        let env = Env::default();
        env.mock_all_auths();

        let shipper = Address::generate(&env);
        let driver = Address::generate(&env);
        let token = create_test_token(&env, &shipper, 10000);

        let contract_id = env.register(CargoNodeEscrow, (shipper.clone(), token));
        let client = CargoNodeEscrowClient::new(&env, &contract_id);

        let shipment_id = String::from_str(&env, "SHIP001");
        client.create_shipment(&shipper, &driver, &1000, &shipment_id);
        client.accept_shipment(&driver, &shipment_id);

        let shipment = client.get_shipment(&shipment_id);
        assert_eq!(shipment.status, ShipmentStatus::Accepted);
    }

    #[test]
    fn test_confirm_delivery_releases_payment() {
        let env = Env::default();
        env.mock_all_auths();

        let shipper = Address::generate(&env);
        let driver = Address::generate(&env);
        let token = create_test_token(&env, &shipper, 10000);

        let contract_id = env.register(CargoNodeEscrow, (shipper.clone(), token));
        let client = CargoNodeEscrowClient::new(&env, &contract_id);

        let shipment_id = String::from_str(&env, "SHIP001");
        client.create_shipment(&shipper, &driver, &1000, &shipment_id);
        client.accept_shipment(&driver, &shipment_id);
        client.confirm_delivery(&shipper, &shipment_id);

        let shipment = client.get_shipment(&shipment_id);
        assert_eq!(shipment.status, ShipmentStatus::Completed);
    }

    #[test]
    fn test_cancel_shipment() {
        let env = Env::default();
        env.mock_all_auths();

        let shipper = Address::generate(&env);
        let driver = Address::generate(&env);
        let token = create_test_token(&env, &shipper, 10000);

        let contract_id = env.register(CargoNodeEscrow, (shipper.clone(), token));
        let client = CargoNodeEscrowClient::new(&env, &contract_id);

        let shipment_id = String::from_str(&env, "SHIP001");
        client.create_shipment(&shipper, &driver, &1000, &shipment_id);
        client.cancel_shipment(&shipper, &shipment_id);

        let shipment = client.get_shipment(&shipment_id);
        assert_eq!(shipment.status, ShipmentStatus::Cancelled);
    }

    #[test]
    fn test_cannot_cancel_after_delivery() {
        let env = Env::default();
        env.mock_all_auths();

        let shipper = Address::generate(&env);
        let driver = Address::generate(&env);
        let token = create_test_token(&env, &shipper, 10000);

        let contract_id = env.register(CargoNodeEscrow, (shipper.clone(), token));
        let client = CargoNodeEscrowClient::new(&env, &contract_id);

        let shipment_id = String::from_str(&env, "SHIP001");
        client.create_shipment(&shipper, &driver, &1000, &shipment_id);
        client.accept_shipment(&driver, &shipment_id);
        client.confirm_delivery(&shipper, &shipment_id);

        let result = client.try_cancel_shipment(&shipper, &shipment_id);
        assert!(result.is_err());
    }

    #[test]
    fn test_duplicate_shipment_fails() {
        let env = Env::default();
        env.mock_all_auths();

        let shipper = Address::generate(&env);
        let driver = Address::generate(&env);
        let token = create_test_token(&env, &shipper, 10000);

        let contract_id = env.register(CargoNodeEscrow, (shipper.clone(), token));
        let client = CargoNodeEscrowClient::new(&env, &contract_id);

        let shipment_id = String::from_str(&env, "SHIP001");
        client.create_shipment(&shipper, &driver, &1000, &shipment_id);

        let result = client.try_create_shipment(&shipper, &driver, &1000, &shipment_id);
        assert!(result.is_err());
    }

    #[test]
    fn test_zero_amount_fails() {
        let env = Env::default();
        env.mock_all_auths();

        let shipper = Address::generate(&env);
        let driver = Address::generate(&env);
        let token = create_test_token(&env, &shipper, 10000);

        let contract_id = env.register(CargoNodeEscrow, (shipper.clone(), token));
        let client = CargoNodeEscrowClient::new(&env, &contract_id);

        let shipment_id = String::from_str(&env, "SHIP001");
        let result = client.try_create_shipment(&shipper, &driver, &0, &shipment_id);
        assert!(result.is_err());
    }

    #[test]
    fn test_wrong_driver_cannot_accept() {
        let env = Env::default();
        env.mock_all_auths();

        let shipper = Address::generate(&env);
        let driver = Address::generate(&env);
        let wrong_driver = Address::generate(&env);
        let token = create_test_token(&env, &shipper, 10000);

        let contract_id = env.register(CargoNodeEscrow, (shipper.clone(), token));
        let client = CargoNodeEscrowClient::new(&env, &contract_id);

        let shipment_id = String::from_str(&env, "SHIP001");
        client.create_shipment(&shipper, &driver, &1000, &shipment_id);

        let result = client.try_accept_shipment(&wrong_driver, &shipment_id);
        assert!(result.is_err());
    }

    #[test]
    fn test_wrong_shipper_cannot_confirm() {
        let env = Env::default();
        env.mock_all_auths();

        let shipper = Address::generate(&env);
        let driver = Address::generate(&env);
        let wrong_shipper = Address::generate(&env);
        let token = create_test_token(&env, &shipper, 10000);

        let contract_id = env.register(CargoNodeEscrow, (shipper.clone(), token));
        let client = CargoNodeEscrowClient::new(&env, &contract_id);

        let shipment_id = String::from_str(&env, "SHIP001");
        client.create_shipment(&shipper, &driver, &1000, &shipment_id);
        client.accept_shipment(&driver, &shipment_id);

        let result = client.try_confirm_delivery(&wrong_shipper, &shipment_id);
        assert!(result.is_err());
    }
}
