const mongoose = require("mongoose");

// Vocabulário do módulo Flashcards (ver backend/seed/vocabFlashcardsSeed.js) —
// independente de courseType, disponível pra qualquer aluno com acesso à
// Plataforma de Questões (mesmo gate de Questões Interativas).
const FlashcardPalavraSchema = new mongoose.Schema({
  fr: { type: String, required: true, unique: true },
  pt: { type: String, required: true },
  classe: { type: String, required: true },
  categoria: { type: String, required: true },
  frase: { type: String, required: true }
});

FlashcardPalavraSchema.index({ categoria: 1 });

module.exports = mongoose.model("FlashcardPalavra", FlashcardPalavraSchema);
