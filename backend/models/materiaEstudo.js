const mongoose = require("mongoose");

const MateriaEstudoSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  nome: { type: String, required: true },
  cor: { type: String, required: true }, // hex, ex. "#2563eb"
  icone: { type: String }, // emoji opcional
  descricao: { type: String },
  criadoEm: { type: Date, default: Date.now }
});

MateriaEstudoSchema.index({ userId: 1, criadoEm: 1 });

module.exports = mongoose.model("MateriaEstudo", MateriaEstudoSchema);
