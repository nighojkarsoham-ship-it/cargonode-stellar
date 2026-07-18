import * as StellarSdk from "@stellar/stellar-sdk";

// --- Environment ---

const NETWORK = process.env.STELLAR_NETWORK || "testnet";

const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
};

// --- Config ---

type NetworkConfig = {
  rpcUrl: string;
  horizonUrl: string;
  networkPassphrase: string;
  contractId: string;
  usdcContractId: string;
};

function getConfig(network: string): NetworkConfig {
  if (network === "mainnet") {
    return {
      rpcUrl: requireEnv("STELLAR_MAINNET_RPC_URL"),
      horizonUrl: "https://horizon.stellar.org",
      networkPassphrase: StellarSdk.Networks.PUBLIC,
      contractId: requireEnv("ESCROW_CONTRACT_ID"),
      usdcContractId: requireEnv("USDC_CONTRACT_ID"),
    };
  }
  // Default to testnet
  return {
    rpcUrl: "https://soroban-testnet.stellar.org",
    horizonUrl: "https://horizon-testnet.stellar.org",
    networkPassphrase: StellarSdk.Networks.TESTNET,
    contractId: process.env.ESCROW_CONTRACT_ID || "",
    usdcContractId: process.env.USDC_CONTRACT_ID || "",
  };
}

export const config = getConfig(NETWORK);

// --- Clients ---

export const rpc = new StellarSdk.rpc.Server(config.rpcUrl);
export const horizon = new StellarSdk.Horizon.Server(config.horizonUrl);

// --- Helpers ---

export async function buildContractInvocation(
  sourceAddress: string,
  method: string,
  args: StellarSdk.xdr.ScVal[]
): Promise<StellarSdk.TransactionBuilder> {
  const contract = new StellarSdk.Contract(config.contractId);
  const sourceAccount = await rpc.getAccount(sourceAddress);

  return new StellarSdk.TransactionBuilder(sourceAccount, {
      fee: StellarSdk.BASE_FEE,
      networkPassphrase: config.networkPassphrase,
    }
  ).addOperation(contract.call(method, ...args));
}

export async function simulateAndAssemble(
  txBuilder: StellarSdk.TransactionBuilder
): Promise<string> {
  const tx = txBuilder.setTimeout(180).build();

  const simulation = await rpc.simulateTransaction(tx);

  if (StellarSdk.rpc.Api.isSimulationError(simulation)) {
    throw new Error(`Simulation failed: ${simulation.error}`);
  }

  const assembled = StellarSdk.rpc.assembleTransaction(
    tx,
    simulation
  ).build();

  return assembled.toXDR();
}

const MAX_POLL_ATTEMPTS = 30;
const POLL_INTERVAL_MS = 2000;

export async function submitSignedTx(signedXdr: string) {
  const tx = StellarSdk.TransactionBuilder.fromXDR(
    signedXdr,
    config.networkPassphrase
  );

  const response = await rpc.sendTransaction(tx as StellarSdk.Transaction);

  if (response.status === "ERROR") {
    throw new Error(
      `Transaction failed: ${JSON.stringify(response.errorResult)}`
    );
  }

  // Poll via Horizon (more reliable across SDK versions)
  let attempts = 0;
  while (attempts < MAX_POLL_ATTEMPTS) {
    try {
      const txResult = await horizon
        .transactions()
        .transaction(response.hash)
        .call();
      if (txResult) {
        if (!txResult.successful) {
          throw new Error(`Transaction failed on-chain: ${response.hash}`);
        }
        return {
          hash: response.hash,
          status: "SUCCESS",
          returnValue: null,
        };
      }
    } catch (e: any) {
      // Not found yet, keep polling
      if (e?.response?.status === 404 || e?.name === "NotFoundError") {
        // expected while pending
      } else {
        throw e;
      }
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    attempts++;
  }

  throw new Error(
    `Transaction timed out after ${MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS / 1000}s. Hash: ${response.hash}`
  );
}

// --- ScVal Builders ---

export function toAddress(address: string): StellarSdk.xdr.ScVal {
  return StellarSdk.Address.fromString(address).toScVal();
}

export function toI128(amount: bigint): StellarSdk.xdr.ScVal {
  return StellarSdk.nativeToScVal(amount, { type: "i128" });
}

export function toSymbol(symbol: string): StellarSdk.xdr.ScVal {
  return StellarSdk.nativeToScVal(symbol, { type: "symbol" });
}

export function toStringScVal(str: string): StellarSdk.xdr.ScVal {
  return StellarSdk.nativeToScVal(str, { type: "string" });
}
