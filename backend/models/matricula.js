const mongoose = require("mongoose");

const MatriculaSchema = new mongoose.Schema({
  alunoId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  tipo: { type: String, enum: ["turma", "particular"], required: true },

  turmaId: { type: mongoose.Schema.Types.ObjectId, ref: "Turma", default: null },

  professorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  horarios: [{ type: mongoose.Schema.Types.ObjectId, ref: "Disponibilidade" }],
  pacote: {
    nome: String,
    horas: Number,
    periodicidade: String
  },

  dadosPessoais: {
    nome: String, email: String, telefone: String,
    objetivo: String, nivelAtual: String, nivelDesejado: String,
    prova: String, dataExame: Date, mensagem: String
  },

  cupomCodigo: { type: String, default: null },
  desconto: { type: Number, default: 0 },
  precoOriginal: { type: Number, required: true },
  precoFinal: { type: Number, required: true },

  status: { type: String, enum: ["pendente_pagamento", "confirmada", "cancelada", "concluida"], default: "pendente_pagamento" },
  expiraEm: { type: Date, default: null }, // hold do carrinho antes do pagamento

  criadoEm: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Matricula", MatriculaSchema);
