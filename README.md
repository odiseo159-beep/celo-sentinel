# celo-sentinel 🛡️

**On-chain security checks for Celo, paid per request via [x402](https://x402.org).**

The token-safety API Celo doesn't have. GoPlus Security — the industry standard for honeypot / token-safety detection — [doesn't support Celo](https://api.gopluslabs.io/api/v1/supported_chains) (43 chains, Celo/42220 absent). Any agent transacting on Celo is flying blind. `celo-sentinel` fills that gap: it returns a **0–100 score, risk flags, and an actionable recommendation** (`SAFE` / `CAUTION` / `AVOID`) that another agent can consume before it trades, pays, or approves.

Built for the **Agentic Payments & DeFAI Hackathon** (Track 2 — Most x402 Payments).

## Endpoints

| Endpoint | Price | What it checks |
|---|---|---|
| `GET /check/token/:addr` | $0.001 | honeypot-sim (buy+sell via Uniswap V3), source flags (mint/blacklist/mutable-fees), liquidity, ERC20 metadata |
| `GET /check/contract/:addr` | $0.001 | verified on Blockscout?, upgradeable proxy (EIP-1967)?, owner privileges |
| `GET /check/wallet/:addr` | $0.001 | age, tx count, balance, reputation heuristic |
| `GET /` | free | machine-readable service descriptor for agents |
| `GET /health` | free | liveness |

### Response shape

```json
{
  "target": "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e",
  "score": 85,
  "recommendation": "SAFE",
  "action": "proceed",
  "reason": "El token no presenta señales de riesgo relevantes.",
  "flags": [{ "id": "upgradeable", "severity": "medium", "message": "..." }],
  "details": { "name": "Tether USD", "symbol": "USD₮", "liquidity": { "canBuy": true, "canSell": true } }
}
```

`recommendation` maps to `action`: `SAFE → proceed`, `CAUTION → proceed_with_limits`, `AVOID → do_not_proceed`.

## How agents pay (x402)

Payments settle on Celo through the official facilitator (`api.x402.celo.org`), gasless via EIP-3009. Wrap `fetch` with a funded Celo wallet:

```ts
import { wrapFetchWithPayment } from "@x402/fetch";
import { privateKeyToAccount } from "viem/accounts";

const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
const fetchWithPay = wrapFetchWithPayment(fetch, account);

const res = await fetchWithPay("https://<sentinel-host>/check/token/0xTokenAddr");
const report = await res.json();
if (report.recommendation === "AVOID") return; // don't trade
```

Pay in **USDT** (`0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e`, 6 decimals). Each call = one x402 settlement of $0.001.

## Run locally

```bash
cp .env.example .env      # set PAY_TO_ADDRESS (and X402_API_KEY when you have it)
npm install
npm run dev
```

Without `X402_API_KEY` the server runs in **free mode** (checks work, no paywall) — useful for developing against the check logic. Set the key (obtained by signing at [x402.celo.org](https://x402.celo.org)) to activate the paywall.

## Stack

TypeScript · Express · viem · `@x402/{core,evm,express}` v2 · Blockscout + Forno RPC (no database — checks read on-chain live).

## Limitations (honest)

The honeypot signal is a **liquidity + exit-route heuristic** via the Uniswap V3 quoter (buy quotes but sell doesn't → strong honeypot signal). A quoter computes over pool reserves, so it won't catch every transfer-tax honeypot; deep transfer-simulation with state overrides is a planned v2. Source-flag detection is static pattern-matching over verified source and only runs when the contract is verified.

## License

MIT
