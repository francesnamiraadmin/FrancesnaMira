// =====================================================================
// Popula FlashcardPalavra a partir de backend/seed/vocabFlashcardsSeed.js.
// Idempotente: pula qualquer termo (comparando por `fr`, case-insensitive)
// que já exista na coleção — seguro rodar de novo.
//
// Uso:
//   node backend/seed/seedFlashcards.js
// =====================================================================
require("dotenv").config({ path: __dirname + "/../.env" });
const mongoose = require("mongoose");
const FlashcardPalavra = require("../models/flashcardPalavra");
const {
  VOCAB_SEED,
  VOCAB_SEED_VIDA_COTIDIANA,
  VOCAB_SEED_VERBOS_ESSENCIAIS,
  VOCAB_SEED_NUMEROS
} = require("./vocabFlashcardsSeed");

async function main() {
  await mongoose.connect(process.env.MONGO_URI);

  const todas = VOCAB_SEED.concat(VOCAB_SEED_VIDA_COTIDIANA, VOCAB_SEED_VERBOS_ESSENCIAIS, VOCAB_SEED_NUMEROS);
  const existentes = new Set((await FlashcardPalavra.find().select("fr").lean()).map(p => p.fr.trim().toLowerCase()));

  const novas = todas.filter(w => !existentes.has(w.fr.trim().toLowerCase()));

  if (novas.length) {
    await FlashcardPalavra.insertMany(novas);
  }

  console.log(`${todas.length} termos na lista | ${existentes.size} já existiam | ${novas.length} inserido(s)`);

  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
