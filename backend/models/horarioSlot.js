const mongoose = require("mongoose");

// Representa uma célula fixa e recorrente da grade semanal (não uma data específica).
// A ocupação não é armazenada aqui — é sempre recomputada a partir de Matriculas
// confirmadas que referenciam este slot (mesmo padrão já usado em Turma/comVagas()).
const HorarioSlotSchema = new mongoose.Schema({
  modalidade: { type: String, enum: ["particular", "turma"], required: true },
  diaSemana: { type: Number, min: 0, max: 6, required: true }, // 0=Domingo .. 6=Sábado (Date.getDay())
  horaInicio: { type: String, required: true }, // "HH:MM", bloco de 1h
  periodo: { type: String, enum: ["diurno", "vespertino", "noturno"], required: true },
  capacidadeMaxima: { type: Number, default: 1, min: 1 },
  ativo: { type: Boolean, default: true },
  criadoEm: { type: Date, default: Date.now }
});

HorarioSlotSchema.index({ modalidade: 1, diaSemana: 1, horaInicio: 1 }, { unique: true });

module.exports = mongoose.model("HorarioSlot", HorarioSlotSchema);
