// Porta o Style.html do app "Modèles TCF" para public/css/producao-app.css:
//  - escopa cada regra em .fnm-app (não vaza para o resto do site);
//  - troca branco fixo por variáveis (papel, inverso, branco-rgb) para o tema escuro funcionar;
//  - acrescenta a paleta do tema escuro do site.
// Uso: node backend/seed/portarEstiloModeles.js <pasta-do-clone-clasp>
const fs = require("fs");
const path = require("path");
const origem = process.argv[2];
let css = fs.readFileSync(path.join(origem, "Style.html"), "utf8").replace(/<\/?style>/g, "");

function escopar(seletores) {
  return seletores.split(",").map(s => {
    s = s.trim();
    if (!s) return s;
    if (/^(:root|html|body|html,\s*body)$/.test(s)) return ".fnm-app";
    if (/^(html|body)\b/.test(s)) return ".fnm-app" + s.replace(/^(html|body)/, "");
    if (/^\*/.test(s)) return ".fnm-app " + s + ", .fnm-app";
    return ".fnm-app " + s;
  }).join(", ");
}
// Percorre o CSS bloco a bloco (aceita @media aninhado; @keyframes fica intacto).
function processar(txt) {
  let out = "", i = 0;
  while (i < txt.length) {
    const abre = txt.indexOf("{", i);
    if (abre < 0) { out += txt.slice(i); break; }
    const cab = txt.slice(i, abre);
    let prof = 1, j = abre + 1;
    while (j < txt.length && prof) { if (txt[j] === "{") prof++; else if (txt[j] === "}") prof--; j++; }
    const corpo = txt.slice(abre + 1, j - 1);
    const cabT = cab.trim();
    const comentario = cab.match(/^\s*(\/\*[\s\S]*?\*\/\s*)*/)[0];
    const sel = cab.slice(comentario.length).trim();
    if (/^@(media|supports)/.test(sel)) out += comentario + sel + " {" + processar(corpo) + "}";
    else if (/^@/.test(sel)) out += comentario + sel + " {" + corpo + "}";
    else out += comentario + escopar(sel) + " {" + corpo + "}";
    i = j;
    void cabT;
  }
  return out;
}
css = processar(css);
// branco fixo → variáveis
css = css.replace(/rgba\(\s*255\s*,\s*255\s*,\s*255\s*,/g, "rgba(var(--branco-rgb),");
css = css.replace(/(^|[;{\s])(color\s*:\s*)(#fff\b|#ffffff\b|white\b)/gi, "$1$2var(--inverso)");
css = css.replace(/#fff\b|#ffffff\b|#FFF\b/g, "var(--papel)");
// Cores fixas claras de fundo/borda e escuras de texto → variáveis com um equivalente escuro
// calculado (mesmo matiz): no tema escuro, fundo pastel vira tom escuro e texto escuro vira claro.
const hexRgb = h => { h = h.replace("#", ""); if (h.length === 3) h = h.split("").map(c => c + c).join(""); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255); };
const lum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
function hsl([r, g, b]) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
const cssHsl = (h, s, l) => `hsl(${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`;
const escuros = {};
css = css.replace(/((?:background(?:-color)?|border(?:-(?:top|right|bottom|left))?(?:-color)?|outline|box-shadow)\s*:)([^;{}]*)/gi, (m, prop, val) =>
  prop + val.replace(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g, hex => {
    const rgb = hexRgb(hex);
    if (lum(rgb) < 0.8) return hex;
    const [h, s] = hsl(rgb), k = "cl-" + hex.slice(1).toLowerCase();
    escuros[k] = cssHsl(h, Math.min(s, 0.35) * 0.8, 0.14 + (lum(rgb) - 0.8) * 0.2);
    return `var(--${k}, ${hex})`;
  }));
css = css.replace(/((?:^|[;{\s])color\s*:)([^;{}]*)/gi, (m, prop, val) =>
  prop + val.replace(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g, hex => {
    const rgb = hexRgb(hex);
    if (lum(rgb) > 0.35) return hex;
    const [h, s] = hsl(rgb), k = "cd-" + hex.slice(1).toLowerCase();
    escuros[k] = cssHsl(h, Math.min(s, 0.45), 0.84);
    return `var(--${k}, ${hex})`;
  }));
const paletaEscura = ':root[data-theme="dark"] .fnm-app {\n' + Object.keys(escuros).sort().map(k => `  --${k}: ${escuros[k]};`).join("\n") + "\n}\n";

// o fundo do app acompanha o tema do site (o gradiente claro já é o do app)
css = css.replace(/background:\s*linear-gradient\(125deg, #9AC7ED 0%, #BFD8E4 32%, #D8E2DE 58%, #E7D6A2 100%\) fixed;/, "background: transparent;");

const cabecalho = `/* Gerado por backend/seed/portarEstiloModeles.js a partir do Style.html do app "Modèles TCF".
   Não edite à mão: ajustes do site ficam em css/producao-app-site.css. */
.fnm-app { --papel: #fff; --inverso: #fff; --branco-rgb: 255,255,255; }
:root[data-theme="dark"] .fnm-app {
  --papel: #17191d; --inverso: #0b0c0e; --branco-rgb: 30,32,37;
  --tinta: #e7e9ec; --tinta-suave: #a9b1bb; --marinho: #f2f4f6; --linha: rgba(255,255,255,.1);
  --vidro: rgba(30,32,37,.72); --vidro-forte: rgba(30,32,37,.94); --sombra: 0 12px 40px -20px rgba(0,0,0,.8);
  --dourado: #ffd60a; --dourado-escuro: #e0b800;
}
`;
fs.writeFileSync(path.join(__dirname, "..", "..", "public", "css", "producao-app.css"), cabecalho + paletaEscura + css);
console.log("ok", css.length);
