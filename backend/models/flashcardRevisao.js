const mongoose = require("mongoose");

// Um documento por aluno — guarda só quando ele completou a última Revisão
// semanal (leque de palavras respondido inteiro corretamente), pra liberar a
// próxima somente 7 dias depois (ver GET /revisao/status).
const FlashcardRevisaoSchema = new mongoose.Schema({
  alunoId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  ultimaConclusaoEm: { type: Date }
});

module.exports = mongoose.model("FlashcardRevisao", FlashcardRevisaoSchema);
