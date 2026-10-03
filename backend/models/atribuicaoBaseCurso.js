const mongoose = require("mongoose");
const { TIPOS_CURSO } = require("../utils/tiposCurso");

// « Atribuição-base » de um curso (Gestão de Alunos › Atribuir Dever): o Plano-Base que todo aluno
// que entra no plano daquele curso recebe automaticamente (ver aplicarAtribuicoesBase em
// backend/utils/gerarDeveres.js).
const AtribuicaoBaseCursoSchema = new mongoose.Schema({
  curso: { type: String, enum: TIPOS_CURSO, required: true, unique: true },
  planoBaseId: { type: mongoose.Schema.Types.ObjectId, ref: "PlanoBase", required: true },
  atualizadoPor: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  atualizadoEm: { type: Date, default: Date.now }
});

module.exports = mongoose.model("AtribuicaoBaseCurso", AtribuicaoBaseCursoSchema);
