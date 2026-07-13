const mongoose = require("mongoose");

const CriterioSchema = new mongoose.Schema({
  nome: { type: String, required: true },
  peso: { type: Number, default: 1 },
  descricao: { type: String }
}, { _id: false });

const RubricaSchema = new mongoose.Schema({
  exame: { type: String, enum: ["TCF", "TEF", "DELF", "DALF"], required: true, unique: true },
  criterios: [CriterioSchema],
  notaMaxima: { type: Number, default: 20 },
  atualizadoEm: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Rubrica", RubricaSchema);
