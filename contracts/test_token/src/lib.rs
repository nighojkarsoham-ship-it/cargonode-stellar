#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, Symbol};

const ADMIN: Symbol = symbol_short!("ADMIN");
const BALANCE: Symbol = symbol_short!("BAL");
const TOTAL: Symbol = symbol_short!("TOTAL");
const NAME: Symbol = symbol_short!("NAME");
const SYMBOL: Symbol = symbol_short!("SYMB");
const DECIMALS: Symbol = symbol_short!("DEC");

#[contracttype]
pub enum DataKey {
    Balance(Address),
    Admin,
    TotalSupply,
    Name,
    Symbol,
    Decimals,
}

#[contract]
pub struct TestToken;

#[contractimpl]
impl TestToken {
    pub fn initialize(e: Env, admin: Address, name: Symbol, symbol: Symbol, decimals: u32) {
        if e.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        e.storage().instance().set(&DataKey::Admin, &admin);
        e.storage().instance().set(&DataKey::Name, &name);
        e.storage().instance().set(&DataKey::Symbol, &symbol);
        e.storage().instance().set(&DataKey::Decimals, &decimals);
        e.storage().instance().set(&DataKey::TotalSupply, &0i128);
    }

    pub fn mint(e: Env, to: Address, amount: i128) {
        let admin: Address = e.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();

        let current = e
            .storage()
            .persistent()
            .get::<DataKey, i128>(&DataKey::Balance(to.clone()))
            .unwrap_or(0);
        e.storage()
            .persistent()
            .set(&DataKey::Balance(to), &(current + amount));

        let total: i128 = e
            .storage()
            .instance()
            .get(&DataKey::TotalSupply)
            .unwrap_or(0);
        e.storage()
            .instance()
            .set(&DataKey::TotalSupply, &(total + amount));
    }

    pub fn balance(e: Env, id: Address) -> i128 {
        e.storage()
            .persistent()
            .get::<DataKey, i128>(&DataKey::Balance(id))
            .unwrap_or(0)
    }

    pub fn transfer(e: Env, from: Address, to: Address, amount: i128) {
        from.require_auth();

        let from_balance = e
            .storage()
            .persistent()
            .get::<DataKey, i128>(&DataKey::Balance(from.clone()))
            .unwrap_or(0);
        assert!(from_balance >= amount, "insufficient balance");

        e.storage()
            .persistent()
            .set(&DataKey::Balance(from.clone()), &(from_balance - amount));

        let to_balance = e
            .storage()
            .persistent()
            .get::<DataKey, i128>(&DataKey::Balance(to.clone()))
            .unwrap_or(0);
        e.storage()
            .persistent()
            .set(&DataKey::Balance(to), &(to_balance + amount));
    }

    pub fn total_supply(e: Env) -> i128 {
        e.storage()
            .instance()
            .get(&DataKey::TotalSupply)
            .unwrap_or(0)
    }

    pub fn name(e: Env) -> Symbol {
        e.storage().instance().get(&DataKey::Name).unwrap()
    }

    pub fn symbol(e: Env) -> Symbol {
        e.storage().instance().get(&DataKey::Symbol).unwrap()
    }

    pub fn decimals(e: Env) -> u32 {
        e.storage().instance().get(&DataKey::Decimals).unwrap()
    }
}
