const mongoose = require("mongoose");
const { criarAtividadeSchema } = require("./atividadeSchema");

// Instância real de uma semana de dever de casa para UM aluno. Pode nascer de
// um Plano-Base (planoBaseId setado, atividades copiadas do template — editar
// aqui nunca mexe no template original) ou ser criada manualmente pelo admin
// (planoBaseId null).
const DeverSemanalSchema = new mongoose.Schema({
  alunoId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  planoBaseId: { type: mongoose.Schema.Types.ObjectId, ref: "PlanoBase", default: null },
  numeroSemana: { type: Number, required: true },
  titulo: { type: String, required: true },
  descricao: { type: String },
  dataInicio: { type: Date, required: true },
  dataLimite: { type: Date, required: true },
  prioridade: { type: String, enum: ["baixa", "media", "alta"], default: "media" },
  professorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  observacoes: { type: String },
  // Se true, o aluno pode clicar "concluído" mesmo com atividades obrigatórias
  // pendentes — decisão do admin por dever, não uma regra global do sistema.
  permiteConclusaoManual: { type: Boolean, default: false },
  atividades: [criarAtividadeSchema(true)],
  concluidoEm: { type: Date },
  criadoEm: { type: Date, default: Date.now }
});

DeverSemanalSchema.index({ alunoId: 1, numeroSemana: 1 });

module.exports = mongoose.model("DeverSemanal", DeverSemanalSchema);
