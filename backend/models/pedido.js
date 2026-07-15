const mongoose = require("mongoose");

const PedidoSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  turmaId: { type: mongoose.Schema.Types.ObjectId, ref: "Turma" },
  tipo: { type: String, enum: ["turma", "particular"], default: null },
  slotsEscolhidos: [{
    slotId: { type: mongoose.Schema.Types.ObjectId, ref: "HorarioSlot" },
    diaSemana: Number,
    horaInicio: String
  }],
  dadosPessoais: {
    nome: String, email: String, telefone: String,
    objetivo: String, nivelAtual: String, nivelDesejado: String,
    prova: String, dataExame: Date, mensagem: String
  },
  curso: { type: String, required: true },
  plano: { type: String, required: true },
  upgrades: [{ type: String }],
  valor: { type: Number, required: true },
  metodoPagamento: { type: String, enum: ["cartao_credito", "cartao_debito", "boleto", "pix"], required: true },
  cartaoFinal: { type: String },
  email: { type: String, required: true },
  status: { type: String, enum: ["pendente", "aprovado", "rejeitado", "cancelado"], default: "pendente" },
  mercadoPagoId: { type: String },
  criadoEm: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Pedido", PedidoSchema);
