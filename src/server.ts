import express, { type Request, type Response } from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { config, x402Enabled, CELO_NETWORK, USDT, USDT_EIP712 } from "./config.js";
import { checkToken } from "./checks/token.js";
import { checkContract } from "./checks/contract.js";
import { checkWallet } from "./checks/wallet.js";
import { dashboardHtml } from "./dashboard.js";
import { getIncomingSettlements } from "./chain.js";
import { formatUnits } from "viem";

const PRICE = { asset: USDT, amount: config.checkPriceUsdt, extra: { ...USDT_EIP712 } };

function paidRoute(description: string) {
  return { accepts: { scheme: "exact" as const, network: CELO_NETWORK, payTo: config.payTo, price: PRICE }, description };
}

export function buildServer() {
  const app = express();
  app.use(express.json());

  // CORS abierto: cualquier agente puede llamar desde cualquier origen.
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", req.headers.origin ?? "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-PAYMENT, PAYMENT-SIGNATURE");
    res.setHeader("Access-Control-Expose-Headers", "PAYMENT-REQUIRED, PAYMENT-RESPONSE, X-PAYMENT-RESPONSE");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  // --- Paywall x402 (solo si hay API key; si no, MODO FREE para desarrollo) ---
  if (x402Enabled) {
    const facilitatorClient = new HTTPFacilitatorClient({
      url: config.facilitatorUrl,
      createAuthHeaders: async () => ({
        verify: { "X-API-Key": config.x402ApiKey },
        settle: { "X-API-Key": config.x402ApiKey },
        supported: { "X-API-Key": config.x402ApiKey },
      }),
    });
    const resourceServer = new x402ResourceServer(facilitatorClient)
      .register(CELO_NETWORK, new ExactEvmScheme())
      .onSettleFailure(async (ctx: { error?: { message?: string } }) => {
        console.error("[x402] settle FAILED:", ctx.error?.message ?? ctx.error);
      });

    app.use(
      paymentMiddleware(
        {
          "GET /check/token/:addr": paidRoute("celo-sentinel — token safety check (honeypot, flags, liquidez)"),
          "GET /check/contract/:addr": paidRoute("celo-sentinel — contract safety check (verificado, proxy, privilegios)"),
          "GET /check/wallet/:addr": paidRoute("celo-sentinel — wallet reputation check"),
        },
        resourceServer,
      ),
    );
    console.log("[x402] paywall ACTIVO — cada check cuesta", config.checkPriceUsdt, "base units USDT → payTo", config.payTo);
  } else {
    console.warn("[x402] ⚠️  MODO FREE (sin X402_API_KEY): los checks responden SIN cobro. Solo para desarrollo.");
  }

  // --- Handlers de los checks (envueltos para errores limpios) ---
  const handle = (fn: (addr: string) => Promise<unknown>) => async (req: Request, res: Response) => {
    try {
      res.json(await fn(String(req.params.addr)));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      res.status(400).json({ error: "check_failed", message: msg });
    }
  };

  app.get("/check/token/:addr", handle(checkToken));
  app.get("/check/contract/:addr", handle(checkContract));
  app.get("/check/wallet/:addr", handle(checkWallet));

  app.get("/health", (_req, res) => res.json({ ok: true, service: "celo-sentinel", x402: x402Enabled }));

  // Prueba en vivo de uso real: cuántos pagos x402 se liquidaron de verdad contra
  // el payTo, y cuánto volumen — leído directo de Blockscout, no de un contador local.
  app.get("/stats", async (_req, res) => {
    const s = await getIncomingSettlements(config.payTo);
    res.json({
      settlements: s.count,
      volumeUsdt: formatUnits(s.volumeRaw, 6),
      uniquePayers: s.payers,
      lastSettlementAt: s.lastAt,
    });
  });

  // Archivo de registro ERC-8004 (agentURI apunta aquí al registrar en el IdentityRegistry)
  const registrationHandler = (req: Request, res: Response) => {
    const base = `${req.protocol}://${req.headers.host}`;
    res.json({
      type: "Agent",
      name: "celo-sentinel",
      description:
        "On-chain security checks for Celo, paid per request via x402. Token/contract/wallet safety with actionable recommendations (SAFE/CAUTION/AVOID). The token-safety API Celo doesn't have.",
      image: "",
      endpoints: [
        { type: "a2a", url: `${base}/` },
        { type: "wallet", address: config.payTo, chainId: 42220 },
      ],
      supportedTrust: ["reputation"],
    });
  };
  app.get("/registration.json", registrationHandler);
  app.get("/.well-known/agent.json", registrationHandler);

  // GET /: humanos (Accept: text/html) ven el dashboard; agentes reciben el descriptor JSON.
  app.get("/", (req, res, next) => {
    if (req.accepts(["json", "html"]) === "html") {
      res.type("html").send(dashboardHtml(config.payTo, config.checkPriceUsdt, x402Enabled));
      return;
    }
    next();
  });

  // Descriptor del servicio para agentes: cómo usar el sentinel sin permiso de nadie.
  app.get("/", (_req, res) => {
    res.json({
      name: "celo-sentinel",
      description:
        "On-chain security checks for Celo, paid per request via x402. The token-safety API Celo doesn't have (GoPlus doesn't cover Celo). Returns a 0-100 score, flags, and an actionable recommendation (SAFE / CAUTION / AVOID) any agent can consume before transacting.",
      network: CELO_NETWORK,
      payment: {
        protocol: "x402",
        facilitator: config.facilitatorUrl,
        asset: USDT,
        pricePerCheck: `${config.checkPriceUsdt} base units USDT (0.001 USDT)`,
        payTo: config.payTo,
      },
      endpoints: {
        "GET /check/token/:addr": "honeypot-sim + source flags + liquidity + ERC20 metadata",
        "GET /check/contract/:addr": "verified? + upgradeable proxy? + owner privileges",
        "GET /check/wallet/:addr": "age + tx count + balance + reputation heuristic",
        "GET /health": "free",
      },
      responseShape: {
        target: "0x...",
        score: "0-100",
        recommendation: "SAFE | CAUTION | AVOID",
        action: "proceed | proceed_with_limits | do_not_proceed",
        reason: "string",
        flags: "[{ id, severity, message }]",
        details: "object",
      },
      integrate:
        "Use @x402/fetch: wrap fetch with a funded Celo wallet and call GET /check/token/<addr>. Payment settles automatically.",
    });
  });

  return app;
}
