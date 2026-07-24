// =====================================================================
// Exporta, para um JSON, a lista única de textos em francês que precisam
// de áudio gerado via Coqui TTS: os 127 termos de vocabulário de
// Questões Interativas (public/js/questoesInterativasDados.js#QI_VOCAB)
// e a transcrição (campo `audio`) de toda Questao com tipo "escuta".
// Uso:
//   node backend/seed/exportarTextosAudio.js <caminho-saida.json>
// =====================================================================
require("dotenv").config({ path: __dirname + "/../.env" });
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const mongoose = require("mongoose");
const Questao = require("../models/questao");

const saida = process.argv[2];
if (!saida) {
  console.error("Uso: node backend/seed/exportarTextosAudio.js <caminho-saida.json>");
  process.exit(1);
}

function lerVocab() {
  const codigo = fs.readFileSync(
    path.join(__dirname, "../../public/js/questoesInterativasDados.js"),
    "utf8"
  );
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(codigo, sandbox);
  return sandbox.window.QI_VOCAB.map((v) => v.f);
}

async function main() {
  const textosVocab = lerVocab();

  await mongoose.connect(process.env.MONGO_URI);
  const questoesEscuta = await Questao.find({ tipo: "escuta", audio: { $nin: [null, ""] } })
    .select("audio")
    .lean();
  await mongoose.disconnect();

  const textosEscuta = questoesEscuta.map((q) => q.audio);

  const unicos = Array.from(new Set([...textosVocab, ...textosEscuta]));

  fs.writeFileSync(saida, JSON.stringify(unicos, null, 2), "utf8");
  console.log(
    `Vocabulário: ${textosVocab.length} termos | Escuta: ${textosEscuta.length} questões | Únicos: ${unicos.length} textos`
  );
  console.log(`Salvo em ${saida}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
