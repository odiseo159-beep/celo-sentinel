import { getAddress, type Address } from "viem";
import { getContractSource, detectProxy, isContract } from "../chain.js";
import { score, type Flag } from "../scoring.js";

/** Patrones peligrosos en source verificado. Heurística estática, no exhaustiva. */
const SOURCE_PATTERNS: { re: RegExp; flag: Omit<Flag, "message"> & { message: string } }[] = [
  { re: /\bfunction\s+mint\b/i, flag: { id: "mintable", severity: "medium", message: "El contrato expone una función mint (supply inflable)." } },
  { re: /\b(blacklist|blocklist|_isBlacklisted|isBlackListed)\b/i, flag: { id: "blacklist", severity: "high", message: "El contrato puede bloquear direcciones (blacklist)." } },
  { re: /\b(pause|_pause|whenNotPaused|Pausable)\b/, flag: { id: "pausable", severity: "medium", message: "El contrato puede pausar transferencias." } },
  { re: /\bselfdestruct\b/i, flag: { id: "selfdestruct", severity: "high", message: "El contrato contiene selfdestruct." } },
  { re: /\b(setFee|setTax|_taxFee|setTaxes|updateFee)\b/i, flag: { id: "mutable_fees", severity: "high", message: "El owner puede cambiar comisiones/impuestos de transferencia." } },
  { re: /\b(setMaxTx|maxTxAmount|setMaxWallet|maxWallet)\b/i, flag: { id: "tx_limits", severity: "low", message: "El contrato impone límites de transacción/wallet configurables." } },
  { re: /\bonlyOwner\b/, flag: { id: "owner_privileges", severity: "low", message: "El contrato tiene funciones restringidas a un owner." } },
];

export type ContractReport = {
  target: string;
  score: number;
  recommendation: string;
  action: string;
  reason: string;
  flags: Flag[];
  details: {
    isContract: boolean;
    verified: boolean;
    contractName: string | null;
    proxy: { isProxy: boolean; implementation: string | null; admin: string | null };
  };
};

export async function checkContract(raw: string): Promise<ContractReport> {
  const addr = getAddress(raw) as Address;
  const flags: Flag[] = [];

  const [code, source, proxy] = await Promise.all([
    isContract(addr),
    getContractSource(addr),
    detectProxy(addr),
  ]);

  if (!code) {
    flags.push({ id: "not_a_contract", severity: "info", message: "La dirección no es un contrato (EOA)." });
  }

  const verified = !!(source?.is_verified || source?.is_fully_verified);
  if (code && source === null) {
    // Blockscout no respondió (timeout/caído) — no es lo mismo que "confirmado sin verificar".
    flags.push({ id: "source_check_unavailable", severity: "info", message: "No se pudo consultar el estado de verificación (Blockscout no respondió)." });
  } else if (code && !verified) {
    flags.push({ id: "unverified", severity: "high", message: "El código del contrato NO está verificado en Blockscout." });
  }

  if (proxy.isProxy) {
    flags.push({ id: "upgradeable_proxy", severity: "medium", message: "Es un proxy upgradeable: la lógica puede cambiar tras aprobar el uso." });
  }

  // Análisis estático del source verificado
  const src = source?.source_code ?? "";
  if (verified && src) {
    for (const { re, flag } of SOURCE_PATTERNS) {
      if (re.test(src)) flags.push({ ...flag });
    }
  }

  const s = score(flags, "El contrato");
  return {
    target: addr,
    ...s,
    flags,
    details: {
      isContract: code,
      verified,
      contractName: source?.name ?? null,
      proxy: { isProxy: proxy.isProxy, implementation: proxy.implementation, admin: proxy.admin },
    },
  };
}
