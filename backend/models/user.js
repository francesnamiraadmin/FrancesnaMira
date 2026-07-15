const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  nome: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  senha: { type: String, required: true },
  verificado: { type: Boolean, default: false },
  tokenVerificacao: { type: String },
  role: { type: String, enum: ["aluno", "professor", "admin"], default: "aluno" },
  creditosCorrecao: { type: Number, default: 0 },
  especialidades: [{ type: String, enum: ["TCF", "TEF", "DELF", "DALF"] }],
  temasFavoritos: [{ type: mongoose.Schema.Types.ObjectId, ref: "Tema" }],
  aulasFavoritas: [{ type: mongoose.Schema.Types.ObjectId, ref: "Aula" }],
  plano: {
    curso: { type: String },
    tier: { type: String, enum: ["Essentiel", "Avancé", "Excellence"] },
    ativo: { type: Boolean, default: false },
    metodoPagamento: { type: String, enum: ["cartao_credito", "cartao_debito", "boleto", "pix"] },
    cartaoFinal: { type: String },
    autoRenovacao: { type: Boolean, default: false },
    dataInicio: { type: Date },
    dataVencimento: { type: Date }
  },
  // Compras avulsas do Pack Prestige (Plataforma de Questões, Ambiente de Produção Oral e
  // Textual, Aulas Especializadas Online) — independente do "plano" de curso acima, para não
  // sobrescrever uma assinatura de curso já ativa ao comprar um desses produtos avulsos.
  produtosAvulsos: {
    plataforma: { ativo: { type: Boolean, default: false }, dataVencimento: { type: Date } },
    producao: { ativo: { type: Boolean, default: false }, dataVencimento: { type: Date } },
    aulasEspecializadas: { ativo: { type: Boolean, default: false }, dataVencimento: { type: Date } }
  },
  perfil: {
    foto: { type: String },
    bio: { type: String },
    interesses: { type: String },
    provaAlvo: { type: String },
    dataProva: { type: Date }
  },
  perfilProfessor: {
    bio: { type: String },
    foto: { type: String },
    idiomas: [{ type: String }],
    corAgenda: { type: String, default: "#4F6B4A" },
    ativoParaAulas: { type: Boolean, default: true }
  },
  criadoEm: { type: Date, default: Date.now }
});

module.exports = mongoose.model("User", UserSchema);