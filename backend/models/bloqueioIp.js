const mongoose = require("mongoose");

// IP bloqueado (automaticamente pelo monitor de segurança ou manualmente por um admin).
// `nivel` guarda quantas vezes o IP já foi bloqueado: cada reincidência aumenta a
// duração do próximo bloqueio. O registro é apagado 30 dias depois do fim do último
// bloqueio (TTL em `limparEm`), zerando o histórico de reincidência.
const BloqueioIpSchema = new mongoose.Schema({
  ip: { type: String, required: true, unique: true },
  motivo: { type: String },
  ate: { type: Date, required: true },
  nivel: { type: Number, default: 1 },
  automatico: { type: Boolean, default: true },
  criadoPor: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  criadoEm: { type: Date, default: Date.now },
  limparEm: { type: Date, required: true }
});

BloqueioIpSchema.index({ limparEm: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("BloqueioIp", BloqueioIpSchema);
