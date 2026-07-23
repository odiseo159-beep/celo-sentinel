import { createPublicClient, http, getAddress, type Address } from "viem";
import { celo } from "viem/chains";
import {
  config,
  QUOTER_V2,
  USDT,
  POOL_FEES,
  EIP1967_IMPL_SLOT,
  EIP1967_ADMIN_SLOT,
} from "./config.js";

export const publicClient = createPublicClient({
  chain: celo,
  transport: http(config.rpcUrl),
});

const ZERO = "0x0000000000000000000000000000000000000000";

// --- ABIs mínimos ---
const ERC20_ABI = [
  { name: "name", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { name: "symbol", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { name: "decimals", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { name: "totalSupply", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;

// Uniswap V3 QuoterV2: quoteExactInputSingle es non-view (revert-based), se llama vía eth_call.
const QUOTER_ABI = [
  {
    name: "quoteExactInputSingle",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      {
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "fee", type: "uint24" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "sqrtPriceX96After", type: "uint160" },
      { name: "initializedTicksCrossed", type: "uint32" },
      { name: "gasEstimate", type: "uint256" },
    ],
  },
] as const;

export type Erc20Meta = {
  name: string | null;
  symbol: string | null;
  decimals: number | null;
  totalSupply: bigint | null;
  isErc20: boolean;
};

export async function readErc20Meta(addr: Address): Promise<Erc20Meta> {
  const read = async <T>(fn: "name" | "symbol" | "decimals" | "totalSupply"): Promise<T | null> => {
    try {
      return (await publicClient.readContract({ address: addr, abi: ERC20_ABI, functionName: fn })) as T;
    } catch {
      return null;
    }
  };
  const [name, symbol, decimals, totalSupply] = await Promise.all([
    read<string>("name"),
    read<string>("symbol"),
    read<number>("decimals"),
    read<bigint>("totalSupply"),
  ]);
  // Un ERC20 mínimo responde al menos decimals + totalSupply.
  const isErc20 = decimals !== null && totalSupply !== null;
  return { name, symbol, decimals, totalSupply, isErc20 };
}

/** Lee un storage slot crudo y lo interpreta como address (últimos 20 bytes). */
export async function readSlotAddress(addr: Address, slot: `0x${string}`): Promise<Address | null> {
  const raw = await publicClient.getStorageAt({ address: addr, slot });
  if (!raw || raw === "0x" || /^0x0+$/.test(raw)) return null;
  const candidate = getAddress(("0x" + raw.slice(-40)) as Address);
  return candidate === ZERO ? null : candidate;
}

export type ProxyInfo = { isProxy: boolean; implementation: Address | null; admin: Address | null };

/** Detecta proxy EIP-1967 (upgradeable) leyendo los slots estándar. */
export async function detectProxy(addr: Address): Promise<ProxyInfo> {
  const [implementation, admin] = await Promise.all([
    readSlotAddress(addr, EIP1967_IMPL_SLOT),
    readSlotAddress(addr, EIP1967_ADMIN_SLOT),
  ]);
  return { isProxy: implementation !== null, implementation, admin };
}

export async function isContract(addr: Address): Promise<boolean> {
  const code = await publicClient.getCode({ address: addr });
  return !!code && code !== "0x";
}

export type SwapQuote = { ok: boolean; amountOut: bigint | null; fee: number | null };

/**
 * Cotiza un swap simple probando los fee tiers comunes. Devuelve el primero que
 * responde. Sirve para el honeypot-sim: si se puede comprar pero no vender, alerta.
 */
export async function quote(tokenIn: Address, tokenOut: Address, amountIn: bigint): Promise<SwapQuote> {
  for (const fee of POOL_FEES) {
    try {
      const { result } = await publicClient.simulateContract({
        address: QUOTER_V2,
        abi: QUOTER_ABI,
        functionName: "quoteExactInputSingle",
        args: [{ tokenIn, tokenOut, amountIn, fee, sqrtPriceLimitX96: 0n }],
      });
      const amountOut = (result as readonly bigint[])[0];
      if (amountOut > 0n) return { ok: true, amountOut, fee };
    } catch {
      // este fee tier no tiene pool o revierte; probar el siguiente
    }
  }
  return { ok: false, amountOut: null, fee: null };
}

/**
 * Honeypot-sim heurístico: intenta comprar el token con USDT y luego revender.
 * Si la compra cotiza pero la venta no, es señal fuerte de honeypot / trampa de salida.
 * Nota: un quoter calcula sobre reservas del pool, no captura transfer-taxes ocultos;
 * esto es una heurística de liquidez + ruta de salida, no una garantía.
 */
export type HoneypotSim = {
  hasLiquidity: boolean;
  canBuy: boolean;
  canSell: boolean;
  buyFee: number | null;
  sellFee: number | null;
};

export async function honeypotSim(token: Address): Promise<HoneypotSim> {
  if (getAddress(token) === getAddress(USDT)) {
    // USDT contra sí mismo no aplica
    return { hasLiquidity: true, canBuy: true, canSell: true, buyFee: null, sellFee: null };
  }
  const oneUsdt = 1_000_000n; // 1 USDT (6 dec)
  const buy = await quote(USDT, token, oneUsdt);
  let sell: SwapQuote = { ok: false, amountOut: null, fee: null };
  if (buy.ok && buy.amountOut) {
    sell = await quote(token, USDT, buy.amountOut);
  }
  return {
    hasLiquidity: buy.ok || sell.ok,
    canBuy: buy.ok,
    canSell: sell.ok,
    buyFee: buy.fee,
    sellFee: sell.fee,
  };
}

// --- Blockscout REST helpers ---
// Timeout propio y corto: Vercel corta la función entera a los 10s (plan Hobby),
// mejor degradar (flag "no se pudo verificar") que arrastrar un fetch colgado hasta ahí.
const BLOCKSCOUT_TIMEOUT_MS = 6_000;

async function blockscout<T>(path: string): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BLOCKSCOUT_TIMEOUT_MS);
  try {
    const res = await fetch(`${config.blockscoutUrl}${path}`, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export type ContractSource = {
  is_verified?: boolean;
  name?: string;
  source_code?: string;
  is_fully_verified?: boolean;
  proxy_type?: string | null;
  implementations?: { address: string; name?: string }[];
};

export async function getContractSource(addr: Address): Promise<ContractSource | null> {
  return blockscout<ContractSource>(`/api/v2/smart-contracts/${addr}`);
}

export type AddressInfo = {
  hash?: string;
  is_contract?: boolean;
  coin_balance?: string;
  creation_tx_hash?: string | null;
  is_verified?: boolean;
};

export async function getAddressInfo(addr: Address): Promise<AddressInfo | null> {
  return blockscout<AddressInfo>(`/api/v2/addresses/${addr}`);
}

export type AddressCounters = {
  transactions_count?: string;
  token_transfers_count?: string;
  gas_usage_count?: string;
};

export async function getAddressCounters(addr: Address): Promise<AddressCounters | null> {
  return blockscout<AddressCounters>(`/api/v2/addresses/${addr}/counters`);
}

type TokenTransfer = { from: { hash: string }; total: { value: string }; timestamp: string };

/** Pagos x402 reales liquidados: transferencias ERC20 entrantes al payTo del sentinel. */
export async function getIncomingSettlements(payTo: Address): Promise<{ count: number; volumeRaw: bigint; payers: number; lastAt: string | null }> {
  const res = await blockscout<{ items: TokenTransfer[] }>(`/api/v2/addresses/${payTo}/token-transfers?type=ERC-20`);
  const items = res?.items ?? [];
  const incoming = items.filter((t) => t.from?.hash?.toLowerCase() !== payTo.toLowerCase());
  const volumeRaw = incoming.reduce((sum, t) => sum + BigInt(t.total?.value ?? "0"), 0n);
  const payers = new Set(incoming.map((t) => t.from.hash.toLowerCase())).size;
  return { count: incoming.length, volumeRaw, payers, lastAt: incoming[0]?.timestamp ?? null };
}
