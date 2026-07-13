const mongoose = require("mongoose");

const CertificadoSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  emitidoEm: { type: Date, default: Date.now },
  totalAulasNaEmissao: { type: Number, required: true }
});

module.exports = mongoose.model("Certificado", CertificadoSchema);
