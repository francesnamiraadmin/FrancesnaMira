const mongoose = require("mongoose");
const { TIPOS_CURSO } = require("../utils/tiposCurso");

const ModuloSchema = new mongoose.Schema({
  titulo: { type: String, required: true },
  descricao: { type: String },
  // DEPRECIADO — substituído por `courseType` abaixo (era texto livre, só decorativo,
  // nunca filtrava nada na rota do aluno). Mantido para não perder o rótulo histórico.
  curso: { type: String, default: null },
  // Curso ao qual este módulo pertence de verdade — filtra o que o aluno enxerga em
  // GET /aulas/modulos. `null` = módulo ainda não migrado/classificado, fica invisível
  // para o aluno até um admin reabrir e salvar com um courseType válido.
  courseType: { type: String, enum: TIPOS_CURSO, default: null },
  // Chave de um ícone fixo (ver public/js/moduloIcones.js — MODULO_ICONES), não mais um
  // emoji livre digitado pelo admin. Registros antigos podem ter um emoji cru salvo aqui
  // de antes dessa mudança; o front trata isso como "não reconhecido" e cai no ícone
  // padrão (caminhoIconeModulo), então não foi preciso migrar dados existentes.
  icone: { type: String, default: "book" },
  cor: { type: String, default: "#2563eb" },
  ordem: { type: Number, default: 0 },
  ativo: { type: Boolean, default: true },
  publicadoEm: { type: Date, default: Date.now },
  exigeModuloAnterior: { type: Boolean, default: false },
  criadoPor: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  criadoEm: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Modulo", ModuloSchema);
