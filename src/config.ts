import "dotenv/config";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export const config = {
  rpcUrl: process.env.RPC_URL ?? "https://forno.celo.org",
  blockscoutUrl: process.env.BLOCKSCOUT_URL ?? "https://celo.blockscout.com",

  // Address pública (no secreta) — default permite deploy sin env vars
  payTo: (process.env.PAY_TO_ADDRESS ?? "0x444519D8149176ed817228B11dFB9695c3f1c877") as `0x${string}`,
  facilitatorUrl: process.env.X402_FACILITATOR_URL ?? "https://api.x402.celo.org",
  // Sin key => modo free (checks sin paywall). Con key => paywall x402 activo.
  x402ApiKey: process.env.X402_API_KEY ?? "",
  checkPriceUsdt: process.env.CHECK_PRICE_USDT ?? "1000", // 0.001 USDT (6 dec)

  port: Number(process.env.PORT ?? 8080),
} as const;

/** true cuando hay API key => cobramos vía x402. false => modo free para desarrollo. */
export const x402Enabled = config.x402ApiKey.length > 0;

// --- Constantes canónicas de Celo mainnet (verificadas, ver ../PLAN.md §5) ---
export const CELO_NETWORK = "eip155:42220" as const;
export const USDT = "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e" as const; // 6 dec
export const USDT_EIP712 = { name: "Tether USD", version: "1" } as const;
export const QUOTER_V2 = "0x82825d0554fA07f7FC52Ab63c961F330fdEFa8E8" as const; // Uniswap V3
export const POOL_FEES = [500, 3000, 10000] as const; // fees a probar en el honeypot-sim

// Slot EIP-1967 de la dirección de implementación (proxies upgradeables)
export const EIP1967_IMPL_SLOT =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc" as const;
// Slot EIP-1967 del admin del proxy
export const EIP1967_ADMIN_SLOT =
  "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103" as const;
