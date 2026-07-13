const mongoose = require("mongoose");

const ModuloSchema = new mongoose.Schema({
  titulo: { type: String, required: true },
  descricao: { type: String },
  icone: { type: String, default: "📘" },
  cor: { type: String, default: "#2563eb" },
  ordem: { type: Number, default: 0 },
  ativo: { type: Boolean, default: true },
  publicadoEm: { type: Date, default: Date.now },
  exigeModuloAnterior: { type: Boolean, default: false },
  criadoPor: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  criadoEm: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Modulo", ModuloSchema);
