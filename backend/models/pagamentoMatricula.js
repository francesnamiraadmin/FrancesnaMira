const mongoose = require("mongoose");

const PagamentoMatriculaSchema = new mongoose.Schema({
  matriculaId: { type: mongoose.Schema.Types.ObjectId, ref: "Matricula", required: true },
  alunoId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  metodoPagamento: { type: String, enum: ["cartao_credito", "cartao_debito", "pix", "boleto"], required: true },
  valor: { type: Number, required: true },
  status: { type: String, enum: ["pendente", "aprovado", "rejeitado", "cancelado"], default: "pendente" },
  mercadoPagoId: { type: String },
  pixQrCodeBase64: { type: String },
  pixCopiaCola: { type: String },
  boletoUrl: { type: String },
  criadoEm: { type: Date, default: Date.now }
});

module.exports = mongoose.model("PagamentoMatricula", PagamentoMatriculaSchema);
