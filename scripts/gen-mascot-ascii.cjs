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
const COLS = 60;
const CHAR_ASPECT = 0.55; // ancho/alto aprox. de un glyph monospace
const RAMP = " .:-=+*#%@█"; // luminancia baja -> alta (convención terminal, no tinta)

function dist(r, g, b) {
  return Math.sqrt((r - BG.r) ** 2 + (g - BG.g) ** 2 + (b - BG.b) ** 2);
}

// El arte fue diseñado sobre fondo magenta claro; contra negro terminal las sombras
// (navy oscuro) casi desaparecen. Elevamos un piso de luminosidad en HSL para que
// todo "brille" tenue (efecto glow de terminal) sin perder el matiz original.
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  const d = max - min;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r: h = ((g - b) / d) % 6; break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h *= 60; if (h < 0) h += 360;
  }
  return [h, s, l];
}
function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}
const MIN_L = 0.32, MAX_L = 0.94, SAT_BOOST = 1.18;
function glow(r, g, b) {
  const [h, s, l] = rgbToHsl(r, g, b);
  const l2 = MIN_L + l * (MAX_L - MIN_L);
  const s2 = Math.min(1, s * SAT_BOOST);
  return hslToRgb(h, s2, l2);
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

  // 4) emitir <pre> con spans: 1 por celda visible, agrupando color+char consecutivos por fila
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
      const idx = (y * COLS + x) * 4;
      const a = resized[idx + 3];
      if (a < 40) {
        if (runColor !== null) flush();
        runColor = null;
        runText += " ";
        continue;
      }
      const [r, g, b] = glow(resized[idx], resized[idx + 1], resized[idx + 2]);
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      const ch = RAMP[Math.min(RAMP.length - 1, Math.floor(lum * RAMP.length))];
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
