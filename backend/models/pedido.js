const mongoose = require("mongoose");

const PedidoSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  turmaId: { type: mongoose.Schema.Types.ObjectId, ref: "Turma" },
  curso: { type: String, required: true },
  plano: { type: String, required: true },
  valor: { type: Number, required: true },
  metodoPagamento: { type: String, enum: ["cartao_credito", "cartao_debito", "boleto", "pix"], required: true },
  cartaoFinal: { type: String },
  email: { type: String, required: true },
  status: { type: String, enum: ["pendente", "aprovado", "rejeitado", "cancelado"], default: "pendente" },
  mercadoPagoId: { type: String },
  criadoEm: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Pedido", PedidoSchema);
