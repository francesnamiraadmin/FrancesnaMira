const mongoose = require("mongoose");

// Uma linha por (aluno, palavra) — criada na primeira resposta em "Nova rodada"
// (o que marca a palavra como "estudada": ela some do pool de palavras novas
// dali em diante, ver rota POST /rodada). `dominada` só vira true quando a
// palavra é respondida corretamente na Revisão semanal (ver POST /revisao/responder)
// — a rodada normal introduz a palavra, a revisão espaçada confirma retenção.
const FlashcardProgressoSchema = new mongoose.Schema({
  alunoId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  palavraId: { type: mongoose.Schema.Types.ObjectId, ref: "FlashcardPalavra", required: true },
  acertos: { type: Number, default: 0 },
  erros: { type: Number, default: 0 },
  dominada: { type: Boolean, default: false },
  ultimaRespostaEm: { type: Date, default: Date.now }
});

FlashcardProgressoSchema.index({ alunoId: 1, palavraId: 1 }, { unique: true });
FlashcardProgressoSchema.index({ alunoId: 1, dominada: 1 });

module.exports = mongoose.model("FlashcardProgresso", FlashcardProgressoSchema);
