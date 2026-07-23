const mongoose = require("mongoose");
const { TIPOS_CURSO } = require("../utils/tiposCurso");

const CriterioSchema = new mongoose.Schema({
  nome: { type: String, required: true },
  peso: { type: Number, default: 1 },
  descricao: { type: String }
}, { _id: false });

const RubricaSchema = new mongoose.Schema({
  // Chave real da rubrica agora é o curso (cobre A1-B2 também). Ver nota em tema.js
  // sobre `exame` continuar existindo separado, só para os 4 cursos de prova.
  courseType: { type: String, enum: TIPOS_CURSO, required: true },
  exame: { type: String, enum: ["TCF", "TEF", "DELF", "DALF"] },
  // Uma rubrica oral e uma textual do mesmo curso são critérios diferentes —
  // por isso a chave única é composta em vez de só `courseType`.
  modalidade: { type: String, enum: ["textual", "oral"], default: "textual" },
  criterios: [CriterioSchema],
  notaMaxima: { type: Number, default: 20 },
  atualizadoEm: { type: Date, default: Date.now }
});

// Substitui o antigo índice único `{exame:1, modalidade:1}` — o índice antigo precisa
// de um `dropIndex` manual em produção (Mongoose não substitui índices únicos sozinho).
RubricaSchema.index({ courseType: 1, modalidade: 1 }, { unique: true });

module.exports = mongoose.model("Rubrica", RubricaSchema);
