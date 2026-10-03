const mongoose = require("mongoose");

// Ajustes feitos à mão na aba « Horários Atuais » do Sistema de Aulas:
//  - manual: um nome colocado num horário (aluno sem matrícula no site, reposição, aula combinada…);
//  - oculto: um nome que vem de uma matrícula e foi retirado da grade (sem mexer na matrícula).
const HorarioAtualAjusteSchema = new mongoose.Schema({
  tipo: { type: String, enum: ["manual", "oculto"], required: true },
  diaSemana: { type: Number, min: 0, max: 6, required: true },   // 0=Domingo .. 6=Sábado
  horaInicio: { type: String, required: true },                   // "HH:MM"
  nome: { type: String, trim: true, maxlength: 120 },             // manual
  // manual: conta do site a que o nome está vinculado (opcional). No Registro de Aulas, os horários
  // vinculados à mesma conta aparecem como uma pessoa só.
  alunoId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  modalidade: { type: String, enum: ["particular", "turma"], default: "particular" },
  chave: { type: String },                                        // oculto: o item automático retirado
  criadoPor: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  criadoEm: { type: Date, default: Date.now }
});

HorarioAtualAjusteSchema.index({ diaSemana: 1, horaInicio: 1 });

module.exports = mongoose.model("HorarioAtualAjuste", HorarioAtualAjusteSchema);
