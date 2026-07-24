const mongoose = require("mongoose");

// Relato de um aluno sobre uma questão específica, feito na tela de resultado (gabarito) de
// uma Tentativa — ver botão "Relatar erro" em public/js/conjuntoResolverEmbed.js. Aparece pra
// quem administra em admin-erros-questoes.html.
const ErroQuestaoSchema = new mongoose.Schema({
  questaoId: { type: mongoose.Schema.Types.ObjectId, ref: "Questao", required: true },
  alunoId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  // Contexto de onde foi relatado — não usado pra controle de acesso (isso é checado na
  // criação, ver backend/routes/errosQuestoes.js), só pra o admin conseguir abrir a tentativa
  // original se precisar.
  tentativaId: { type: mongoose.Schema.Types.ObjectId, ref: "Tentativa" },
  mensagem: { type: String, required: true },
  status: { type: String, enum: ["aberto", "resolvido"], default: "aberto" },
  criadoEm: { type: Date, default: Date.now },
  resolvidoEm: { type: Date }
});

ErroQuestaoSchema.index({ status: 1, criadoEm: -1 });

module.exports = mongoose.model("ErroQuestao", ErroQuestaoSchema);
