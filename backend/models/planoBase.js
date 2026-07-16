const mongoose = require("mongoose");
const { criarAtividadeSchema } = require("./atividadeSchema");

const SemanaTemplateSchema = new mongoose.Schema({
  numero: { type: Number, required: true },
  titulo: { type: String, required: true },
  atividades: [criarAtividadeSchema(false)]
});

const PlanoBaseSchema = new mongoose.Schema({
  nome: { type: String, required: true },
  curso: { type: String },
  descricao: { type: String },
  semanas: [SemanaTemplateSchema],
  ativo: { type: Boolean, default: true },
  criadoPor: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  criadoEm: { type: Date, default: Date.now }
});

module.exports = mongoose.model("PlanoBase", PlanoBaseSchema);
