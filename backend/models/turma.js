const mongoose = require("mongoose");

const TurmaSchema = new mongoose.Schema({
  nome: { type: String, required: true },
  nivel: { type: String, required: true },
  professorId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  dias: [{ type: String }],
  horario: { type: String, required: true },
  dataInicio: { type: Date, required: true },
  maxAlunos: { type: Number, required: true, default: 8 },
  preco: { type: Number, required: true },
  descricao: { type: String },
  materialUrl: { type: String },
  zoomLink: { type: String },
  listaEspera: [{
    nome: String, email: String, telefone: String, criadoEm: { type: Date, default: Date.now }
  }],
  ativa: { type: Boolean, default: true },
  criadoEm: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Turma", TurmaSchema);
