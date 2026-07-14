# celo-sentinel — Track 2 (Most x402 Payments)

Contexto persistente del proyecto. Se carga al inicio de cada sesión. El plan maestro vive en `../PLAN.md`.

## Por qué existe

API de seguridad on-chain para Celo, cobrada por request vía **x402** (micropagos pay-per-request). Cada agente DeFi necesita verificar un token/contrato/wallet ANTES de operar. **GoPlus Security —el estándar de token-safety— no soporta Celo** (verificado: 43 chains, 42220 ausente). El sentinel llena ese hueco.

Objetivo de negocio: **ganar Track 2** = mayor número de pagos x402 liquidados en Celo durante el hackathon (deadline 20 jul 09:00 GMT). El bar actual del líder es ~211 pagos. Se gana con **volumen de llamadas EXTERNAS** de otros builders, no con un loop de auto-pago (eso es farming, ver `../PLAN.md §2`).

## Qué se construye

Servicio HTTP que expone checks de seguridad. Devuelve score 0-100 + flags + **recomendación accionable** (`SAFE` / `CAUTION` / `AVOID`) directamente consumible por otro agente.

```
GET /check/token/:addr     $0.001  honeypot-sim + flags de source + liquidez + metadata ERC20
GET /check/contract/:addr  $0.001  verificado? + proxy upgradeable? + privilegios de owner
GET /check/wallet/:addr    $0.001  edad + nº txs + balance + reputación
GET /                      free    descriptor del servicio para agentes
GET /health                free
```

## Stack (decidido — no proponer alternativas)

- **TypeScript + Express + viem**, ESM (`"type": "module"`, imports con `.js`)
- **x402 v2**: `@x402/express`, `@x402/core`, `@x402/evm` (^2.17). NUNCA `x402-express` v1 (deprecado, solo Base).
- Facilitator: `https://api.x402.celo.org` (gasless EIP-3009, exige `X-API-Key`)
- RPC: `https://forno.celo.org` · Blockscout: `https://celo.blockscout.com`
- Sin base de datos en el MVP (los checks son stateless, leen on-chain en vivo).

## Wiring x402 (patrón exacto — ground truth de comprabtc)

```ts
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";

const facilitatorClient = new HTTPFacilitatorClient({
  url: config.facilitatorUrl,
  createAuthHeaders: async () => ({
    verify:    { "X-API-Key": config.x402ApiKey },
    settle:    { "X-API-Key": config.x402ApiKey },
    supported: { "X-API-Key": config.x402ApiKey },
  }),
});
const resourceServer = new x402ResourceServer(facilitatorClient)
  .register(CELO_NETWORK, new ExactEvmScheme());   // CELO_NETWORK = "eip155:42220"

app.use(paymentMiddleware({
  "GET /check/token/:addr": {
    accepts: { scheme: "exact", network: CELO_NETWORK, payTo: config.payTo,
      price: { asset: USDT, amount: "1000", extra: { ...USDT_EIP712 } } }, // 0.001 USDT (6 dec)
    description: "...",
  },
}, resourceServer));
```

## Constantes Celo mainnet (verificadas)

```
CELO_NETWORK = "eip155:42220"
USDT         = 0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e  (6 dec)
USDT_EIP712  = { name: "Tether USD", version: "1" }
QUOTER_V2    = 0x82825d0554fA07f7FC52Ab63c961F330fdEFa8E8  (Uniswap V3, honeypot-sim)
EIP1967_IMPL_SLOT = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc
```

## Convenciones

- **Código en inglés** (clases, funciones, variables). Comentarios narrativos y strings de dominio en español.
- **`payTo`** = wallet sentinel `0x444519D8149176ed817228B11dFB9695c3f1c877`.
- Precios en **base units string** (0.001 USDT → `"1000"`).
- Secretos SIEMPRE por env var. `X402_API_KEY` nunca en código ni commiteado.
- **Modo free**: si `X402_API_KEY` no está en el env, el server corre SIN paywall (para desarrollar la lógica de checks antes de tener la key). Con la key, el paywall se activa. Warning ruidoso en modo free.
- Respuestas de check: `{ target, score, recommendation, action, reason, flags[], details{} }`.

## Anti-patrones — evitar

- `x402-express` v1 (deprecado, no soporta Celo).
- `data = toDataSuffix(...)` en llamadas a contrato → hay que APPENDear al calldata.
- cUSD/USDm para x402 (no tienen EIP-3009).
- Loop de auto-pago para inflar métricas de Track 2 → farming, riesgo de DQ. El volumen viene de callers externos.
- Meter la private key del payer en el repo del sentinel (el sentinel solo necesita la address `payTo`).

## Cómo trabajar

- Una funcionalidad a la vez. Lógica de checks primero (modo free), luego paywall x402, luego probar 1 settlement real.
- Antes de escalar: probar UN pago real ($0.001 → 200) end-to-end.
- Consultar `../PLAN.md` para estado global y decisiones abiertas.
