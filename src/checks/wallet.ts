import { getAddress, formatEther, type Address } from "viem";
import { getAddressInfo, getAddressCounters, isContract } from "../chain.js";
import { score, type Flag } from "../scoring.js";

export type WalletReport = {
  target: string;
  score: number;
  recommendation: string;
  action: string;
  reason: string;
  flags: Flag[];
  details: {
    isContract: boolean;
    txCount: number | null;
    tokenTransfers: number | null;
    celoBalance: string | null;
  };
};

/**
 * Reputación de una wallet contraparte. Heurística por actividad: una wallet sin
 * historial (recién creada, 0 txs) es una señal de precaución para pagos/aprobaciones.
 */
export async function checkWallet(raw: string): Promise<WalletReport> {
  const addr = getAddress(raw) as Address;
  const flags: Flag[] = [];

  const [code, info, counters] = await Promise.all([
    isContract(addr),
    getAddressInfo(addr),
    getAddressCounters(addr),
  ]);

  const txCount = counters?.transactions_count ? Number(counters.transactions_count) : null;
  const tokenTransfers = counters?.token_transfers_count ? Number(counters.token_transfers_count) : null;
  const balanceWei = info?.coin_balance ? BigInt(info.coin_balance) : null;

  if (code) {
    flags.push({ id: "is_contract", severity: "info", message: "La dirección es un contrato, no una wallet EOA." });
  }

  if (txCount === 0) {
    flags.push({ id: "no_history", severity: "high", message: "La wallet no tiene historial de transacciones (recién creada o durmiente)." });
  } else if (txCount !== null && txCount < 5) {
    flags.push({ id: "low_activity", severity: "medium", message: "La wallet tiene muy poca actividad histórica." });
  }

  if (balanceWei === 0n && txCount === 0) {
    flags.push({ id: "empty_wallet", severity: "medium", message: "Wallet vacía y sin actividad." });
  }

  const s = score(flags, "La wallet");
  return {
    target: addr,
    ...s,
    flags,
    details: {
      isContract: code,
      txCount,
      tokenTransfers,
      celoBalance: balanceWei !== null ? formatEther(balanceWei) : null,
    },
  };
}
