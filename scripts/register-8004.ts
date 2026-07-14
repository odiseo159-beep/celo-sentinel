/**
 * Registra el agente en el IdentityRegistry ERC-8004 de Celo (mint ERC-721).
 * Requiere: REGISTRAR_PRIVATE_KEY con algo de CELO para gas, y AGENT_URI público.
 *
 * Uso: AGENT_URI=https://<host>/registration.json REGISTRAR_PRIVATE_KEY=0x... npx tsx scripts/register-8004.ts
 */
import "dotenv/config";
import { createPublicClient, createWalletClient, http, parseAbi, parseEventLogs } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";

// Proxy verificado en Blockscout (impl: IdentityRegistryUpgradeable) — docs.celo.org/build-on-celo/build-with-ai/8004
const IDENTITY_REGISTRY = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" as const;

const ABI = parseAbi([
  "function register(string agentURI) returns (uint256)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
]);

const agentUri = process.env.AGENT_URI;
const pk = process.env.REGISTRAR_PRIVATE_KEY as `0x${string}` | undefined;
if (!agentUri || !pk) {
  console.error("Faltan AGENT_URI y/o REGISTRAR_PRIVATE_KEY");
  process.exit(1);
}

const account = privateKeyToAccount(pk);
const publicClient = createPublicClient({ chain: celo, transport: http("https://forno.celo.org") });
const walletClient = createWalletClient({ account, chain: celo, transport: http("https://forno.celo.org") });

console.log(`Registrando agente con URI: ${agentUri}`);
console.log(`Registrar: ${account.address}`);

const { request } = await publicClient.simulateContract({
  account,
  address: IDENTITY_REGISTRY,
  abi: ABI,
  functionName: "register",
  args: [agentUri],
});
const hash = await walletClient.writeContract(request);
console.log(`tx: ${hash}`);
const receipt = await publicClient.waitForTransactionReceipt({ hash });

const transfers = parseEventLogs({ abi: ABI, logs: receipt.logs, eventName: "Transfer" });
const tokenId = transfers[0]?.args?.tokenId;
console.log(`✅ Agente registrado. ERC-8004 ID: ${tokenId}`);
console.log(`   Ver en: https://www.8004scan.io/agents/celo/${tokenId}`);
