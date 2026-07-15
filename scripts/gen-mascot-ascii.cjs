/**
 * Genera el mascot ASCII del sentinel a partir de assets/mascot-source.png.
 * Chroma-key del fondo magenta -> recorta al bounding box del personaje ->
 * muestrea en grilla -> emite <pre> con spans coloreados (terminal-style:
 * luminancia alta = glyph denso, no la convención tinta-sobre-papel).
 *
 * Uso: node scripts/gen-mascot-ascii.cjs
 * Escribe: src/mascot.ts (export const MASCOT_ASCII_HTML)
 */
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "..", "assets", "mascot-source.png");
const OUT = path.join(__dirname, "..", "src", "mascot.ts");
const BG = { r: 245, g: 3, b: 117 };
const BG_THRESHOLD = 55; // distancia euclidiana en RGB para considerar "fondo"
const COLS = 96;
const CHAR_ASPECT = 0.55; // ancho/alto aprox. de un glyph monospace
const RAMP = " .`'\":-,^~;+iltIcv?%*U#O0@██"; // rampa larga -> más gradación tonal a mayor resolución

// Paleta del sitio (Mission Control): recolorea por luminancia en vez de preservar
// el rosa/azul original, para que el mascot combine con el resto del dashboard.
const STOPS = [
  { t: 0.00, c: [13, 17, 21] },    // --panel, casi invisible: se funde con el fondo
  { t: 0.22, c: [29, 37, 46] },    // --line
  { t: 0.42, c: [102, 115, 127] }, // --dim
  { t: 0.60, c: [45, 130, 90] },   // verde oscuro intermedio
  { t: 0.76, c: [74, 222, 128] },  // --green
  { t: 0.90, c: [251, 191, 36] },  // --amber
  { t: 1.00, c: [252, 255, 82] },  // --yellow (máximo brillo)
];
function paletteColor(t) {
  for (let i = 0; i < STOPS.length - 1; i++) {
    const a = STOPS[i], b = STOPS[i + 1];
    if (t >= a.t && t <= b.t) {
      const f = (t - a.t) / (b.t - a.t || 1);
      return [
        Math.round(a.c[0] + (b.c[0] - a.c[0]) * f),
        Math.round(a.c[1] + (b.c[1] - a.c[1]) * f),
        Math.round(a.c[2] + (b.c[2] - a.c[2]) * f),
      ];
    }
  }
  return STOPS[STOPS.length - 1].c;
}

function dist(r, g, b) {
  return Math.sqrt((r - BG.r) ** 2 + (g - BG.g) ** 2 + (b - BG.b) ** 2);
}


async function main() {
  const img = sharp(SRC);
  const { width, height } = await img.metadata();
  const { data: raw } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  // 1) chroma-key: alpha=0 donde el color cae cerca del magenta de fondo
  const keyed = Buffer.from(raw);
  for (let i = 0; i < keyed.length; i += 4) {
    const d = dist(keyed[i], keyed[i + 1], keyed[i + 2]);
    if (d < BG_THRESHOLD) keyed[i + 3] = 0;
  }

  // 2) bounding box del contenido no-fondo (con margen)
  let minX = width, minY = height, maxX = 0, maxY = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      if (keyed[idx + 3] > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const pad = 6;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(width - 1, maxX + pad);
  maxY = Math.min(height - 1, maxY + pad);
  const cropW = maxX - minX + 1;
  const cropH = maxY - minY + 1;

  // 3) resize (con alpha, sharp premultiplica para evitar fringing del magenta) a la grilla objetivo
  const rows = Math.max(1, Math.round(COLS * (cropH / cropW) * CHAR_ASPECT));
  const resized = await sharp(keyed, { raw: { width, height, channels: 4 } })
    .extract({ left: minX, top: minY, width: cropW, height: cropH })
    .resize(COLS, rows, { fit: "fill" })
    .raw()
    .toBuffer();

  // 4) luminancia cruda por celda + stretch de contraste (min/max SOLO del personaje,
  //    no del lienzo completo) para sacar más gradación tonal de zonas planas como la piel
  const cellLum = new Float32Array(COLS * rows).fill(-1);
  let lumMin = 1, lumMax = 0;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < COLS; x++) {
      const idx = (y * COLS + x) * 4;
      if (resized[idx + 3] < 40) continue;
      const l = (0.299 * resized[idx] + 0.587 * resized[idx + 1] + 0.114 * resized[idx + 2]) / 255;
      cellLum[y * COLS + x] = l;
      if (l < lumMin) lumMin = l;
      if (l > lumMax) lumMax = l;
    }
  }
  const GAMMA = 0.82; // <1 levanta medios tonos, más textura visible
  const range = Math.max(0.001, lumMax - lumMin);
  const normLum = (l) => Math.pow(Math.min(1, Math.max(0, (l - lumMin) / range)), GAMMA);

  // 5) emitir <pre> con spans: 1 por celda visible, agrupando color+char consecutivos por fila
  let html = "";
  for (let y = 0; y < rows; y++) {
    let row = "";
    let runColor = null;
    let runText = "";
    const flush = () => {
      if (!runText) return;
      if (runColor === null) row += runText.replace(/ /g, "&nbsp;");
      else row += `<span style="color:rgb(${runColor})">${runText}</span>`;
      runText = "";
    };
    for (let x = 0; x < COLS; x++) {
      const raw = cellLum[y * COLS + x];
      if (raw < 0) {
        if (runColor !== null) flush();
        runColor = null;
        runText += " ";
        continue;
      }
      const t = normLum(raw);
      const [r, g, b] = paletteColor(t);
      const ch = RAMP[Math.min(RAMP.length - 1, Math.floor(t * RAMP.length))];
      const colorKey = `${r},${g},${b}`;
      if (colorKey !== runColor) { flush(); runColor = colorKey; }
      runText += ch;
    }
    flush();
    html += row + "\n";
  }

  const ts = `// AUTO-GENERADO por scripts/gen-mascot-ascii.cjs — no editar a mano.
// Fuente: assets/mascot-source.png (${COLS}x${rows} celdas, chroma-key del fondo magenta)
export const MASCOT_ASCII_HTML = ${JSON.stringify(html)};
`;
  fs.writeFileSync(OUT, ts);
  console.log(`OK: ${COLS}x${rows} celdas -> ${OUT} (${(ts.length / 1024).toFixed(1)} KB)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
