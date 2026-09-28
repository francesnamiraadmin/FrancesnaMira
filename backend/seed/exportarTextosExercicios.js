// =====================================================================
// Lista todo texto em francês dos exercícios interativos
// (backend/data/exercicios/*.json) que precisa de áudio gerado com Coqui:
// item.audio, item.audioCorrecao, palavras de "associar" com audioEsquerda,
// parágrafos de leitura e os trechos marcados com data-fr nas aulas.
// Uso:
//   node backend/seed/exportarTextosExercicios.js <saida.json>
//   .venv-tts/Scripts/python.exe scripts_tts/gerar_audios_exercicios.py <saida.json>
// =====================================================================
const fs = require("fs");
const path = require("path");

const saida = process.argv[2];
if (!saida) {
  console.error("Uso: node backend/seed/exportarTextosExercicios.js <saida.json>");
  process.exit(1);
}

// Mesma limpeza de espaço que o navegador aplica antes de calcular o hash.
const limpar = t => String(t || "").replace(/\s+/g, " ").trim();
const desescapar = s => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

const PASTA = path.join(__dirname, "../data/exercicios");
const textos = new Set();
const add = t => { t = limpar(t); if (t) textos.add(t); };

fs.readdirSync(PASTA).filter(f => f.endsWith(".json")).forEach(f => {
  const def = JSON.parse(fs.readFileSync(path.join(PASTA, f), "utf8"));
  def.secoes.forEach(sec => {
    if (sec.tipo === "leitura") sec.paragrafos.forEach(add);
    for (const html of [sec.html, sec.texto, sec.instrucao]) {
      if (typeof html === "string") for (const m of html.matchAll(/data-fr="([^"]*)"/g)) add(desescapar(m[1]));
    }
    (sec.itens || []).forEach(item => {
      add(item.audio); add(item.audioCorrecao);
      if (item.tipo === "associar" && item.audioEsquerda) item.pares.forEach(p => add(p.a));
    });
  });
});

fs.writeFileSync(saida, JSON.stringify([...textos], null, 1));
console.log(`${textos.size} textos exportados para ${saida}`);
