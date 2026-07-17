const mongoose = require("mongoose");

// Uma pausa aberta tem fim:null — fechada ao "continuar". A soma das durações
// fechadas (+ a aberta, se a sessão for encerrada em pausa) é descontada do
// tempo bruto pra chegar em duracaoSegundos (tempo efetivamente estudado).
const PausaSchema = new mongoose.Schema({
  inicio: { type: Date, required: true },
  fim: { type: Date, default: null }
}, { _id: false });

const SessaoEstudoSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  materiaId: { type: mongoose.Schema.Types.ObjectId, ref: "MateriaEstudo", required: true },
  conteudoId: { type: mongoose.Schema.Types.ObjectId, ref: "ConteudoEstudo", required: true },

  status: { type: String, enum: ["em_andamento", "finalizada"], required: true },

  iniciadoEm: { type: Date, required: true },
  finalizadoEm: { type: Date },
  pausas: { type: [PausaSchema], default: [] },

  // Tempo efetivamente estudado (descontando pausas), em segundos — só preenchido
  // ao finalizar. Denormalizado pra listagens/estatísticas não recomputarem sempre.
  duracaoSegundos: { type: Number },

  dispositivo: { type: String },
  observacoes: { type: String },

  criadoEm: { type: Date, default: Date.now }
});

// No máximo uma sessão em andamento por usuário — checado na rota antes de criar.
SessaoEstudoSchema.index({ userId: 1, status: 1, iniciadoEm: -1 });
SessaoEstudoSchema.index({ userId: 1, materiaId: 1 });
SessaoEstudoSchema.index({ userId: 1, conteudoId: 1 });

module.exports = mongoose.model("SessaoEstudo", SessaoEstudoSchema);
