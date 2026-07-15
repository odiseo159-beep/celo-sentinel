import { getAddress, formatUnits, type Address } from "viem";
import { readErc20Meta, honeypotSim, getContractSource, detectProxy, isContract } from "../chain.js";
import { score, type Flag } from "../scoring.js";

/** Reutiliza los patrones del contract-check sobre el source del token. */
const SOURCE_PATTERNS: { re: RegExp; flag: Flag }[] = [
  { re: /\bfunction\s+mint\b/i, flag: { id: "mintable", severity: "medium", message: "El token expone mint (supply inflable por el owner)." } },
  { re: /\b(blacklist|blocklist|_isBlacklisted|isBlackListed)\b/i, flag: { id: "blacklist", severity: "high", message: "El token puede bloquear direcciones (blacklist)." } },
  { re: /\b(pause|whenNotPaused|Pausable)\b/, flag: { id: "pausable", severity: "medium", message: "El token puede pausar transferencias." } },
  { re: /\b(setFee|setTax|_taxFee|setTaxes|updateFee)\b/i, flag: { id: "mutable_fees", severity: "high", message: "El owner puede cambiar el impuesto de transferencia (posible trampa)." } },
];

export type TokenReport = {
  target: string;
  score: number;
  recommendation: string;
  action: string;
  reason: string;
  flags: Flag[];
  details: {
    name: string | null;
    symbol: string | null;
    decimals: number | null;
    totalSupply: string | null;
    verified: boolean;
    upgradeable: boolean;
    liquidity: { hasLiquidity: boolean; canBuy: boolean; canSell: boolean };
  };
};

export async function checkToken(raw: string): Promise<TokenReport> {
  const addr = getAddress(raw) as Address;
  const flags: Flag[] = [];

  const [code, meta, source, proxy, honey] = await Promise.all([
    isContract(addr),
    readErc20Meta(addr),
    getContractSource(addr),
    detectProxy(addr),
    honeypotSim(addr),
  ]);

  if (!code) {
    flags.push({ id: "not_a_contract", severity: "critical", message: "La dirección no es un contrato: no es un token válido." });
  } else if (!meta.isErc20) {
    flags.push({ id: "not_erc20", severity: "high", message: "El contrato no responde a la interfaz ERC20 estándar." });
  }

  const verified = !!(source?.is_verified || source?.is_fully_verified);
  if (code && source === null) {
    flags.push({ id: "source_check_unavailable", severity: "info", message: "No se pudo consultar el estado de verificación (Blockscout no respondió)." });
  } else if (code && !verified) {
    flags.push({ id: "unverified", severity: "high", message: "El código del token NO está verificado." });
  }

  if (proxy.isProxy) {
    flags.push({ id: "upgradeable", severity: "medium", message: "Token con lógica upgradeable (proxy): puede cambiar tras aprobarlo." });
  }

  // Honeypot / liquidez
  if (!honey.hasLiquidity) {
    flags.push({ id: "no_liquidity", severity: "high", message: "No se encontró liquidez en Uniswap V3 para este token." });
  } else if (honey.canBuy && !honey.canSell) {
    flags.push({ id: "honeypot_suspect", severity: "critical", message: "Se puede comprar pero NO vender: fuerte señal de honeypot." });
  } else if (!honey.canBuy && honey.canSell) {
    flags.push({ id: "asymmetric_liquidity", severity: "medium", message: "Ruta de venta disponible pero no de compra: liquidez asimétrica." });
  }

  const src = source?.source_code ?? "";
  if (verified && src) {
    for (const { re, flag } of SOURCE_PATTERNS) {
      if (re.test(src)) flags.push({ ...flag });
    }
  }

  const s = score(flags, "El token");
  return {
    target: addr,
    ...s,
    flags,
    details: {
      name: meta.name,
      symbol: meta.symbol,
      decimals: meta.decimals,
      totalSupply: meta.totalSupply !== null && meta.decimals !== null
        ? formatUnits(meta.totalSupply, meta.decimals)
        : null,
      verified,
      upgradeable: proxy.isProxy,
      liquidity: { hasLiquidity: honey.hasLiquidity, canBuy: honey.canBuy, canSell: honey.canSell },
    },
  };
}
