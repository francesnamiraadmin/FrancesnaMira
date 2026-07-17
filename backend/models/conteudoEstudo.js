const mongoose = require("mongoose");

const ConteudoEstudoSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  materiaId: { type: mongoose.Schema.Types.ObjectId, ref: "MateriaEstudo", required: true },
  nome: { type: String, required: true },
  cor: { type: String, required: true }, // hex, ex. "#16a34a"
  descricao: { type: String },
  criadoEm: { type: Date, default: Date.now }
});

ConteudoEstudoSchema.index({ materiaId: 1, criadoEm: 1 });
ConteudoEstudoSchema.index({ userId: 1 });

module.exports = mongoose.model("ConteudoEstudo", ConteudoEstudoSchema);
