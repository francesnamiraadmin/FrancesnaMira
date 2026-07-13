const mongoose = require("mongoose");

const ProgressoAulaSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  aulaId: { type: mongoose.Schema.Types.ObjectId, ref: "Aula", required: true },
  moduloId: { type: mongoose.Schema.Types.ObjectId, ref: "Modulo", required: true },
  concluida: { type: Boolean, default: false },
  concluidaEm: { type: Date },
  ultimaPosicaoSegundos: { type: Number, default: 0 },
  ultimoAcessoEm: { type: Date, default: Date.now }
});

ProgressoAulaSchema.index({ userId: 1, aulaId: 1 }, { unique: true });
ProgressoAulaSchema.index({ userId: 1, ultimoAcessoEm: -1 });
ProgressoAulaSchema.index({ aulaId: 1, concluida: 1 });
ProgressoAulaSchema.index({ moduloId: 1, userId: 1 });

module.exports = mongoose.model("ProgressoAula", ProgressoAulaSchema);
