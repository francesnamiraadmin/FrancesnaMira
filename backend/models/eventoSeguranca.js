const mongoose = require("mongoose");

// Registro de cada evento de segurança detectado (tentativa de ataque, bloqueio
// automático, ação sensível de conta da equipe...) — ver backend/utils/monitorSeguranca.js.
// Aparece no painel admin-seguranca.html e alimenta os alertas enviados à equipe.
// Expira sozinho depois de 90 dias (índice TTL) para não crescer sem limite.
const EventoSegurancaSchema = new mongoose.Schema({
  tipo: { type: String, required: true },
  severidade: { type: String, enum: ["info", "baixa", "media", "alta", "critica"], required: true },
  descricao: { type: String },
  ip: { type: String },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  email: { type: String },
  metodo: { type: String },
  rota: { type: String },
  userAgent: { type: String },
  detalhes: { type: mongoose.Schema.Types.Mixed },
  // Resposta automática aplicada por causa deste evento (ex.: "IP bloqueado por 1h").
  resposta: { type: String },
  criadoEm: { type: Date, default: Date.now }
});

EventoSegurancaSchema.index({ criadoEm: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });
EventoSegurancaSchema.index({ severidade: 1, criadoEm: -1 });
EventoSegurancaSchema.index({ ip: 1, criadoEm: -1 });
EventoSegurancaSchema.index({ tipo: 1, criadoEm: -1 });

module.exports = mongoose.model("EventoSeguranca", EventoSegurancaSchema);
