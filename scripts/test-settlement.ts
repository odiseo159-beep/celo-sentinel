/**
 * Primer settlement x402 REAL end-to-end: paga $0.001 USDT por un check
 * del sentinel en producción y muestra el settlement on-chain.
 *
 * Prerrequisitos:
 *  1. X402_API_KEY configurada en Vercel (paywall activo — GET /health debe decir "x402": true)
 *  2. Wallet payer fondeada con USDT en Celo mainnet (~$5 = 5000 checks)
 *
 * Uso: PAYER_PRIVATE_KEY=0x... npx tsx scripts/test-settlement.ts [url-base]
 */
import { wrapFetchWithPaymentFromConfig, decodePaymentResponseHeader } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm";
import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient, http, parseAbi, formatUnits } from "viem";
import { celo } from "viem/chains";

const BASE = process.argv[2] ?? "https://celo-sentinel.vercel.app";
const USDT = "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e";
const TEST_TOKEN = USDT; // check sobre el propio USDT: target conocido y SAFE

const pk = process.env.PAYER_PRIVATE_KEY as `0x${string}` | undefined;
if (!pk) { console.error("Falta PAYER_PRIVATE_KEY"); process.exit(1); }
const account = privateKeyToAccount(pk);

const publicClient = createPublicClient({ chain: celo, transport: http("https://forno.celo.org") });
const erc20 = parseAbi(["function balanceOf(address) view returns (uint256)"]);

// --- pre-flight ---
const health = await (await fetch(`${BASE}/health`)).json();
console.log(`sentinel: ${BASE} · x402 activo: ${health.x402}`);
if (!health.x402) {
  console.error("⛔ El paywall NO está activo (falta X402_API_KEY en el server). Sin eso no hay settlement.");
  process.exit(1);
}
const balance = await publicClient.readContract({ address: USDT, abi: erc20, functionName: "balanceOf", args: [account.address] });
console.log(`payer ${account.address} · USDT: ${formatUnits(balance, 6)}`);
if (balance < 1000n) {
  console.error("⛔ El payer no tiene USDT suficiente (mínimo 0.001). Fondear primero.");
  process.exit(1);
}

// --- pago real ---
console.log(`\nllamando GET /check/token/${TEST_TOKEN} con pago x402…`);
const fetchWithPay = wrapFetchWithPaymentFromConfig(fetch, {
  schemes: [{ network: "eip155:42220", client: new ExactEvmScheme(account) }],
});
const started = Date.now();
const res = await fetchWithPay(`${BASE}/check/token/${TEST_TOKEN}`);
const elapsed = Date.now() - started;

console.log(`HTTP ${res.status} en ${elapsed}ms`);
if (!res.ok) {
  console.error("⛔ Falló:", await res.text());
  process.exit(1);
}
const report = await res.json();
console.log(`✅ check recibido: ${report.recommendation} (score ${report.score}) — ${report.details?.name}`);

// header de settlement (tx on-chain que movió los $0.001)
const payRes = res.headers.get("PAYMENT-RESPONSE") ?? res.headers.get("X-PAYMENT-RESPONSE");
if (payRes) {
  try {
    const decoded = decodePaymentResponseHeader(payRes);
    console.log("settlement:", JSON.stringify(decoded, null, 2));
    const txHash = (decoded as { transaction?: string }).transaction;
    if (txHash) console.log(`\n🎉 SETTLEMENT ON-CHAIN: https://celoscan.io/tx/${txHash}`);
  } catch {
    console.log("settlement header (raw):", payRes);
  }
} else {
  console.log("(sin header de settlement en la respuesta — revisar en celoscan las txs del payTo)");
}
console.log("\nSiguiente: verificar que aparece en el leaderboard Dune (~minutos de delay):");
console.log("https://dune.com/celo/agentic-payments-defai-hackathon");
