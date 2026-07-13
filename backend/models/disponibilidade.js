const mongoose = require("mongoose");

// Cada documento representa UM horário específico e datado (não uma regra
// abstrata) — quando o admin cria uma recorrência, vários documentos são
// materializados de uma vez. Isso mantém a consulta de conflito simples e
// atômica: reservar é sempre um findOneAndUpdate sobre um único _id.
const DisponibilidadeSchema = new mongoose.Schema({
  professorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  dataHoraInicio: { type: Date, required: true },
  duracaoMinutos: { type: Number, required: true, default: 60 },
  status: { type: String, enum: ["disponivel", "reservado", "bloqueado", "concluido"], default: "disponivel" },
  alunoId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  matriculaId: { type: mongoose.Schema.Types.ObjectId, ref: "Matricula", default: null },
  holdExpiraEm: { type: Date, default: null }, // reserva temporária durante o checkout
  recorrenciaId: { type: String, default: null }, // agrupa horários gerados pela mesma regra recorrente
  criadoEm: { type: Date, default: Date.now }
});

DisponibilidadeSchema.index({ professorId: 1, dataHoraInicio: 1 });

module.exports = mongoose.model("Disponibilidade", DisponibilidadeSchema);
