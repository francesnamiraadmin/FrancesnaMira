const mongoose = require("mongoose");

const CupomSchema = new mongoose.Schema({
  codigo: { type: String, required: true, unique: true, uppercase: true, trim: true },
  tipo: { type: String, enum: ["percentual", "valor_fixo"], required: true },
  valor: { type: Number, required: true },
  validoAte: { type: Date },
  usoMaximo: { type: Number, default: null },
  usosAtuais: { type: Number, default: 0 },
  ativo: { type: Boolean, default: true },
  criadoEm: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Cupom", CupomSchema);
