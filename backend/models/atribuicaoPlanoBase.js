const mongoose = require("mongoose");

// O "vínculo ativo" que orienta a geração automática de semanas (ver
// backend/utils/gerarDeveres.js): a partir daqui sabemos desde quando contar
// as semanas e onde buscar a data de fim de matrícula (Turma ou plano de
// curso), já que o projeto não tem um campo único de "fim de matrícula".
const AtribuicaoPlanoBaseSchema = new mongoose.Schema({
  alunoId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  planoBaseId: { type: mongoose.Schema.Types.ObjectId, ref: "PlanoBase", required: true },
  dataInicio: { type: Date, required: true },
  vinculoTipo: { type: String, enum: ["turma", "plano_curso"], required: true },
  turmaId: { type: mongoose.Schema.Types.ObjectId, ref: "Turma", default: null },
  ativo: { type: Boolean, default: true },
  // curso do plano a que a atribuição se liga (o fim vem do plano deste curso) e a origem:
  // "base" = Atribuição-base do curso (automática ao entrar no plano), "manual" = pela equipe.
  curso: { type: String, default: null },
  origem: { type: String, enum: ["manual", "base"], default: "manual" },
  criadoEm: { type: Date, default: Date.now }
});

module.exports = mongoose.model("AtribuicaoPlanoBase", AtribuicaoPlanoBaseSchema);
