const mongoose = require("mongoose");

const CriterioSchema = new mongoose.Schema({
  nome: { type: String, required: true },
  peso: { type: Number, default: 1 },
  descricao: { type: String }
}, { _id: false });

const RubricaSchema = new mongoose.Schema({
  exame: { type: String, enum: ["TCF", "TEF", "DELF", "DALF"], required: true },
  // Uma rubrica oral e uma textual do mesmo exame são critérios diferentes —
  // por isso a chave única passa a ser composta em vez de só `exame`.
  modalidade: { type: String, enum: ["textual", "oral"], default: "textual" },
  criterios: [CriterioSchema],
  notaMaxima: { type: Number, default: 20 },
  atualizadoEm: { type: Date, default: Date.now }
});

RubricaSchema.index({ exame: 1, modalidade: 1 }, { unique: true });

module.exports = mongoose.model("Rubrica", RubricaSchema);
