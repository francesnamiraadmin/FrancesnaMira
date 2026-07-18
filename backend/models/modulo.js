const mongoose = require("mongoose");

const ModuloSchema = new mongoose.Schema({
  titulo: { type: String, required: true },
  descricao: { type: String },
  // Curso ao qual este módulo pertence (ex.: "A1", "TCF", "Aulas Especializadas") —
  // usado para agrupar o progresso do aluno por curso no perfil administrativo.
  // Livre (sem enum) para casar com a convenção já usada em Matricula.curso.
  curso: { type: String, default: null },
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
