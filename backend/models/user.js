const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  nome: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  senha: { type: String, required: true },
  telefone: { type: String },
  whatsapp: { type: String },
  verificado: { type: Boolean, default: false },
  tokenVerificacao: { type: String },
  role: { type: String, enum: ["aluno", "professor", "admin"], default: "aluno" },
  // Sessão persistente ("Manter-me conectado"): cada refresh token emitido fica
  // guardado só como hash (nunca em texto puro) para permitir revogação/rotação
  // sem expor o valor real caso o banco vaze.
  refreshTokens: [{
    tokenHash: { type: String, required: true },
    expiraEm: { type: Date, required: true },
    criadoEm: { type: Date, default: Date.now }
  }],
  resetSenhaTokenHash: { type: String },
  resetSenhaExpiraEm: { type: Date },
  // Troca de e-mail exige confirmação no endereço novo antes de valer.
  emailPendente: { type: String },
  emailPendenteTokenHash: { type: String },
  emailPendenteExpiraEm: { type: Date },
  // Preferências sincronizadas entre dispositivos (tema/idioma aplicados no
  // login e restauração de sessão; notificações usadas pela central de e-mails
  // transacionais/promocionais).
  preferencias: {
    tema: { type: String, enum: ["light", "dark"], default: "light" },
    idioma: { type: String, enum: ["pt-BR", "fr"], default: "pt-BR" },
    notificacoes: {
      lembretes: { type: Boolean, default: true },
      novosDeveres: { type: Boolean, default: true },
      correcoesDisponiveis: { type: Boolean, default: true },
      novosConteudos: { type: Boolean, default: true },
      promocoes: { type: Boolean, default: true }
    }
  },
  // Arquitetura preparada para 2FA (ver requisito 2 do produto) — desligado por
  // padrão; a verificação em si (envio/validação de código) fica para uma
  // etapa futura, mas o estado de "ativo" já existe e é consultável.
  doisFatores: {
    ativo: { type: Boolean, default: false },
    metodo: { type: String, enum: ["email"], default: "email" }
  },
  exclusaoSolicitada: {
    em: { type: Date },
    motivo: { type: String }
  },
  // Usados no perfil administrativo (Gestão de Alunos) para "último acesso"
  // e para sintetizar o evento "primeiro login" na timeline do aluno.
  ultimoAcessoEm: { type: Date },
  primeiroLoginEm: { type: Date },
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