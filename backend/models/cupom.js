const mongoose = require("mongoose");

const CupomSchema = new mongoose.Schema({
  codigo: { type: String, required: true, unique: true, uppercase: true, trim: true },
  descricao: { type: String, default: "" },
  tipo: { type: String, enum: ["percentual", "valor_fixo"], required: true },
  valor: { type: Number, required: true },
  validoAte: { type: Date },
  usoMaximo: { type: Number, default: null },
  usosAtuais: { type: Number, default: 0 },
  // Restrições opcionais: vazio = vale para qualquer curso / plano.
  cursos: [{ type: String }],
  planos: [{ type: String }],
  ativo: { type: Boolean, default: true },
  criadoPor: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  criadoEm: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Cupom", CupomSchema);
