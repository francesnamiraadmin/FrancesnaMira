const mongoose = require("mongoose");
const { TIPOS_CURSO } = require("../utils/tiposCurso");

// Um certificado por curso agora (era um único por usuário, no modelo antigo em que
// "Aulas Especializadas" era um módulo global só). O índice único antigo em `userId`
// sozinho precisa de um `dropIndex` manual em produção antes deste substituir.
const CertificadoSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  courseType: { type: String, enum: TIPOS_CURSO, required: true },
  emitidoEm: { type: Date, default: Date.now },
  totalAulasNaEmissao: { type: Number, required: true }
});

CertificadoSchema.index({ userId: 1, courseType: 1 }, { unique: true });

module.exports = mongoose.model("Certificado", CertificadoSchema);
