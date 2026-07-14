/**
 * Dashboard Mission Control — HTML embebido (string) para que el bundle
 * serverless de Vercel no dependa de leer archivos del filesystem.
 * Humanos ven esto en GET / ; los agentes (Accept: json) reciben el descriptor.
 */
export function dashboardHtml(payTo: string, price: string, x402Active: boolean): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>CELO-SENTINEL · on-chain security, paid per request</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
<style>
  :root {
    --bg: #07090b;
    --panel: #0d1115;
    --panel-2: #11161c;
    --line: #1d252e;
    --ink: #d7e0e8;
    --dim: #66737f;
    --yellow: #fcff52;
    --green: #4ade80;
    --amber: #fbbf24;
    --red: #f87171;
    --mono: "IBM Plex Mono", monospace;
    --display: "Chakra Petch", monospace;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html { scroll-behavior: smooth; }
  body {
    background: var(--bg); color: var(--ink); font-family: var(--mono);
    font-size: 15px; line-height: 1.6; overflow-x: hidden;
  }
  /* fondo: grid + scanline */
  body::before {
    content: ""; position: fixed; inset: 0; pointer-events: none; z-index: 0;
    background-image:
      linear-gradient(rgba(252,255,82,.025) 1px, transparent 1px),
      linear-gradient(90deg, rgba(252,255,82,.025) 1px, transparent 1px);
    background-size: 44px 44px;
  }
  body::after {
    content: ""; position: fixed; left: 0; right: 0; height: 120px; z-index: 0;
    background: linear-gradient(180deg, transparent, rgba(252,255,82,.03), transparent);
    animation: scan 9s linear infinite; pointer-events: none;
  }
  @keyframes scan { from { top: -140px; } to { top: 100vh; } }

  .wrap { position: relative; z-index: 1; max-width: 1060px; margin: 0 auto; padding: 0 24px 96px; }

  /* status bar */
  .statusbar {
    display: flex; align-items: center; gap: 18px; flex-wrap: wrap;
    padding: 14px 0; border-bottom: 1px solid var(--line);
    font-size: 12px; letter-spacing: .08em; color: var(--dim); text-transform: uppercase;
  }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--green); display: inline-block;
    box-shadow: 0 0 8px var(--green); animation: pulse 2s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity: .35; } }
  .statusbar .right { margin-left: auto; display: flex; gap: 18px; }
  .statusbar a { color: var(--dim); text-decoration: none; }
  .statusbar a:hover { color: var(--yellow); }

  /* hero */
  .hero { padding: 84px 0 64px; }
  .kicker { color: var(--yellow); font-size: 12px; letter-spacing: .28em; text-transform: uppercase; margin-bottom: 18px; opacity: 0; animation: rise .6s .1s forwards; }
  h1 {
    font-family: var(--display); font-weight: 700; font-size: clamp(42px, 7.5vw, 84px);
    line-height: .98; letter-spacing: -.01em; text-transform: uppercase;
    opacity: 0; animation: rise .6s .2s forwards;
  }
  h1 .hollow { color: transparent; -webkit-text-stroke: 1.5px var(--yellow); }
  .sub { max-width: 640px; margin-top: 22px; color: var(--dim); opacity: 0; animation: rise .6s .35s forwards; }
  .sub b { color: var(--ink); font-weight: 500; }
  .cursor { display: inline-block; width: .55em; height: 1.05em; background: var(--yellow); vertical-align: text-bottom; animation: blink 1.1s steps(1) infinite; }
  @keyframes blink { 50% { opacity: 0; } }
  @keyframes rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }

  .heromtr { display: flex; gap: 40px; margin-top: 44px; flex-wrap: wrap; opacity: 0; animation: rise .6s .5s forwards; }
  .mtr .n { font-family: var(--display); font-size: 30px; font-weight: 600; color: var(--yellow); }
  .mtr .l { font-size: 11px; letter-spacing: .18em; text-transform: uppercase; color: var(--dim); }

  /* section titles */
  h2 { font-family: var(--display); font-size: 13px; font-weight: 600; letter-spacing: .3em;
    text-transform: uppercase; color: var(--dim); margin: 72px 0 22px; display: flex; align-items: center; gap: 14px; }
  h2::before { content: "//"; color: var(--yellow); }
  h2::after { content: ""; flex: 1; height: 1px; background: var(--line); }

  /* endpoint cards */
  .grid3 { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 14px; }
  .card {
    background: var(--panel); border: 1px solid var(--line); padding: 22px 20px 20px;
    position: relative; transition: border-color .2s, transform .2s;
  }
  .card:hover { border-color: rgba(252,255,82,.45); transform: translateY(-2px); }
  .card .route { font-size: 13px; color: var(--yellow); word-break: break-all; }
  .card .price { position: absolute; top: 16px; right: 16px; font-size: 11px; color: var(--bg);
    background: var(--yellow); padding: 2px 8px; font-weight: 600; }
  .card p { color: var(--dim); font-size: 13px; margin-top: 12px; }
  .card ul { list-style: none; margin-top: 12px; font-size: 12.5px; color: var(--dim); }
  .card li { padding: 3px 0; }
  .card li::before { content: "▸ "; color: var(--yellow); }

  /* verdict chips */
  .verdicts { display: flex; gap: 10px; margin-top: 26px; flex-wrap: wrap; }
  .chip { font-size: 12px; letter-spacing: .12em; padding: 6px 14px; border: 1px solid; font-weight: 600; }
  .chip.safe { color: var(--green); border-color: var(--green); background: rgba(74,222,128,.07); }
  .chip.caution { color: var(--amber); border-color: var(--amber); background: rgba(251,191,36,.07); }
  .chip.avoid { color: var(--red); border-color: var(--red); background: rgba(248,113,113,.07); }

  /* terminal */
  .term { background: var(--panel-2); border: 1px solid var(--line); }
  .term-head { display: flex; align-items: center; gap: 8px; padding: 10px 16px; border-bottom: 1px solid var(--line);
    font-size: 11px; color: var(--dim); letter-spacing: .1em; }
  .term-head .b { width: 10px; height: 10px; border-radius: 50%; background: var(--line); }
  .term pre { padding: 20px; overflow-x: auto; font-size: 13px; line-height: 1.7; }
  .tk-k { color: var(--dim); } .tk-s { color: var(--yellow); } .tk-g { color: var(--green); }
  .tk-n { color: #7dd3fc; } .tk-c { color: #4a5560; }

  /* live check */
  .live { display: flex; gap: 10px; margin-top: 16px; flex-wrap: wrap; }
  .live input {
    flex: 1; min-width: 280px; background: var(--panel); border: 1px solid var(--line); color: var(--ink);
    font-family: var(--mono); font-size: 13px; padding: 12px 14px; outline: none;
  }
  .live input:focus { border-color: var(--yellow); }
  .btn {
    font-family: var(--display); font-weight: 600; letter-spacing: .12em; text-transform: uppercase;
    background: var(--yellow); color: #0a0a05; border: 0; padding: 12px 26px; font-size: 13px; cursor: pointer;
    transition: transform .15s, box-shadow .15s;
  }
  .btn:hover { transform: translateY(-1px); box-shadow: 0 0 24px rgba(252,255,82,.25); }
  #liveout { margin-top: 14px; display: none; }

  footer { margin-top: 90px; border-top: 1px solid var(--line); padding-top: 22px;
    display: flex; gap: 24px; flex-wrap: wrap; font-size: 12px; color: var(--dim); }
  footer a { color: var(--dim); text-decoration: none; }
  footer a:hover { color: var(--yellow); }
  .pay { color: var(--dim); font-size: 12px; margin-top: 14px; word-break: break-all; }
  .pay b { color: var(--ink); font-weight: 500; }
</style>
</head>
<body>
<div class="wrap">
  <div class="statusbar">
    <span><span class="dot"></span>&nbsp; SYSTEM ${x402Active ? "ARMED · X402 LIVE" : "ONLINE · FREE MODE"}</span>
    <span>NET&nbsp;EIP155:42220</span>
    <div class="right">
      <a href="https://github.com/odiseo159-beep/celo-sentinel" target="_blank" rel="noopener">GITHUB</a>
      <a href="/registration.json">ERC-8004</a>
      <a href="/health">HEALTH</a>
    </div>
  </div>

  <section class="hero">
    <div class="kicker">on-chain security · pay per request · x402</div>
    <h1>CELO<span class="hollow">-SENTINEL</span></h1>
    <p class="sub">The token-safety API <b>Celo doesn't have</b>. GoPlus covers 43 chains — Celo isn't one of them.
    One <b>$0.001 micropayment</b> buys your agent a honeypot simulation, risk flags and an actionable verdict
    <b>before</b> it trades.<span class="cursor"></span></p>
    <div class="heromtr">
      <div class="mtr"><div class="n">$0.001</div><div class="l">per check</div></div>
      <div class="mtr"><div class="n">~1s</div><div class="l">x402 settlement</div></div>
      <div class="mtr"><div class="n">0 gas</div><div class="l">EIP-3009 · facilitator pays</div></div>
      <div class="mtr"><div class="n" id="statmtr">—</div><div class="l">status</div></div>
    </div>
  </section>

  <h2>Endpoints</h2>
  <div class="grid3">
    <div class="card">
      <span class="price">$0.001</span>
      <div class="route">GET /check/token/:addr</div>
      <p>Is this token safe to trade?</p>
      <ul><li>honeypot sim (buy + sell route)</li><li>mint / blacklist / mutable-fee flags</li><li>liquidity + ERC20 metadata</li></ul>
    </div>
    <div class="card">
      <span class="price">$0.001</span>
      <div class="route">GET /check/contract/:addr</div>
      <p>Is this contract safe to call?</p>
      <ul><li>verified on Blockscout?</li><li>upgradeable proxy (EIP-1967)?</li><li>owner privileges</li></ul>
    </div>
    <div class="card">
      <span class="price">$0.001</span>
      <div class="route">GET /check/wallet/:addr</div>
      <p>Is this counterparty trustworthy?</p>
      <ul><li>age + activity history</li><li>balance</li><li>reputation heuristic</li></ul>
    </div>
  </div>
  <div class="verdicts">
    <span class="chip safe">SAFE → proceed</span>
    <span class="chip caution">CAUTION → proceed_with_limits</span>
    <span class="chip avoid">AVOID → do_not_proceed</span>
  </div>

  <h2>Live probe</h2>
  <div class="live">
    <input id="addr" spellcheck="false" placeholder="0x… token address on Celo (try USDT: 0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e)" />
    <button class="btn" onclick="probe()">RUN CHECK</button>
  </div>
  <div class="term" id="liveout"><div class="term-head"><span class="b"></span><span class="b"></span><span class="b"></span>sentinel://check/token</div><pre id="livepre"></pre></div>

  <h2>Integrate — 5 lines</h2>
  <div class="term">
    <div class="term-head"><span class="b"></span><span class="b"></span><span class="b"></span>agent.ts</div>
<pre><span class="tk-c">// your agent pays $0.001 per call — gasless, settles on Celo in ~1s</span>
<span class="tk-k">import</span> { wrapFetchWithPaymentFromConfig } <span class="tk-k">from</span> <span class="tk-s">"@x402/fetch"</span>;
<span class="tk-k">import</span> { ExactEvmScheme } <span class="tk-k">from</span> <span class="tk-s">"@x402/evm"</span>;

<span class="tk-k">const</span> pay = wrapFetchWithPaymentFromConfig(fetch, {
  schemes: [{ network: <span class="tk-s">"eip155:42220"</span>, client: <span class="tk-k">new</span> ExactEvmScheme(account) }],
});
<span class="tk-k">const</span> report = <span class="tk-k">await</span> (<span class="tk-k">await</span> pay(BASE + <span class="tk-s">"/check/token/"</span> + token)).json();
<span class="tk-k">if</span> (report.recommendation === <span class="tk-s">"AVOID"</span>) <span class="tk-k">return</span>; <span class="tk-c">// funds saved</span></pre>
  </div>
  <p class="pay">payTo <b>${payTo}</b> · asset USDT (Celo) · facilitator api.x402.celo.org · price ${price} base units</p>

  <footer>
    <span>CELO-SENTINEL · Agentic Payments &amp; DeFAI Hackathon · Track 2</span>
    <a href="https://github.com/odiseo159-beep/celo-sentinel" target="_blank" rel="noopener">source</a>
    <a href="https://dune.com/celo/agentic-payments-defai-hackathon" target="_blank" rel="noopener">leaderboard</a>
  </footer>
</div>
<script>
  fetch("/health").then(r => r.json()).then(h => {
    document.getElementById("statmtr").textContent = h.ok ? (h.x402 ? "ARMED" : "FREE") : "DOWN";
  }).catch(() => document.getElementById("statmtr").textContent = "DOWN");

  const COLORS = { SAFE: "var(--green)", CAUTION: "var(--amber)", AVOID: "var(--red)" };
  async function probe() {
    const addr = document.getElementById("addr").value.trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) { alert("Dirección inválida"); return; }
    const out = document.getElementById("liveout"), pre = document.getElementById("livepre");
    out.style.display = "block"; pre.textContent = "… querying chain (free-tier probe)";
    try {
      const r = await fetch("/check/token/" + addr);
      if (r.status === 402) {
        pre.innerHTML = '<span class="tk-g">402 Payment Required</span> — this endpoint is x402-gated.\\nPoint your agent (with a funded wallet) at it — see the snippet above.';
        return;
      }
      const j = await r.json();
      pre.innerHTML = JSON.stringify(j, null, 2)
        .replace(/"(SAFE|CAUTION|AVOID)"/g, (m, v) => '"<b style="color:' + COLORS[v] + '">' + v + "</b>\\"");
    } catch (e) { pre.textContent = "error: " + e.message; }
  }
</script>
</body>
</html>`;
}
