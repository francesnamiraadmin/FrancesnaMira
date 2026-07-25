// =====================================================================
// Exporta, para um JSON, a lista única de textos em francês que precisam
// de áudio gerado via Coqui TTS: os 640 termos de vocabulário de Questões
// Interativas — public/js/questoesInterativasDados.js#QI_VOCAB (A1) mais
// os arquivos por nível (A2/B1/B2/TCF/DELF, mesmo padrão de carregamento
// de questoes-interativas-jogo.html) —, a transcrição (campo `audio`) de
// toda Questao com tipo "escuta", e o campo `fr` de todo FlashcardPalavra
// (módulo Flashcards).
// Uso:
//   node backend/seed/exportarTextosAudio.js <caminho-saida.json>
// =====================================================================
require("dotenv").config({ path: __dirname + "/../.env" });
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const mongoose = require("mongoose");
const Questao = require("../models/questao");
const FlashcardPalavra = require("../models/flashcardPalavra");

const saida = process.argv[2];
if (!saida) {
  console.error("Uso: node backend/seed/exportarTextosAudio.js <caminho-saida.json>");
  process.exit(1);
}

const ARQUIVOS_VOCAB_QI = [
  "questoesInterativasDados.js",
  "questoesInterativasDadosA2.js",
  "questoesInterativasDadosB1.js",
  "questoesInterativasDadosB2.js",
  "questoesInterativasDadosTCF.js",
  "questoesInterativasDadosDELF.js"
];

function lerVocab() {
  const sandbox = {};
  sandbox.window = sandbox; // top-level `var`/função em <script> vira propriedade de `window` no navegador
  vm.createContext(sandbox);
  ARQUIVOS_VOCAB_QI.forEach((nome) => {
    const codigo = fs.readFileSync(path.join(__dirname, "../../public/js", nome), "utf8");
    vm.runInContext(codigo, sandbox);
  });
  return sandbox.window.QI_VOCAB.map((v) => v.f);
}

async function main() {
  const textosVocab = lerVocab();

  await mongoose.connect(process.env.MONGO_URI);
  const questoesEscuta = await Questao.find({ tipo: "escuta", audio: { $nin: [null, ""] } })
    .select("audio")
    .lean();
  const flashcards = await FlashcardPalavra.find().select("fr").lean();
  await mongoose.disconnect();

  const textosEscuta = questoesEscuta.map((q) => q.audio);
  const textosFlashcards = flashcards.map((f) => f.fr);

  const unicos = Array.from(new Set([...textosVocab, ...textosEscuta, ...textosFlashcards]));

  fs.writeFileSync(saida, JSON.stringify(unicos, null, 2), "utf8");
  console.log(
    `Vocabulário QI: ${textosVocab.length} | Escuta: ${textosEscuta.length} | Flashcards: ${textosFlashcards.length} | Únicos: ${unicos.length} textos`
  );
  console.log(`Salvo em ${saida}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
