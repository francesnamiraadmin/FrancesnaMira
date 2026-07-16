const mongoose = require("mongoose");

// Log de eventos que não são deriváveis de outras coleções (ex.: o plano do
// aluno é sobrescrito no lugar em User.plano, então uma mudança/renovação só
// fica registrada se alguém a anotar aqui no momento em que acontece.
const HistoricoAlunoSchema = new mongoose.Schema({
  alunoId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  tipo: { type: String, enum: ["mudanca_plano", "renovacao"], required: true },
  titulo: { type: String, required: true },
  descricao: { type: String },
  data: { type: Date, default: Date.now }
});

module.exports = mongoose.model("HistoricoAluno", HistoricoAlunoSchema);
