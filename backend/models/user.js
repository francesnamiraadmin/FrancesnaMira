const mongoose = require("mongoose");
const { TIPOS_CURSO } = require("../utils/tiposCurso");

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
    // Controla se a barra global do Timer de Estudos (public/js/estudoTimerGlobal.js)
    // aparece no rodapé de toda página logada — ver Mapeador de Estudos.
    exibirBarraTimer: { type: Boolean, default: true },
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
  especialidades: [{ type: String, enum: TIPOS_CURSO }],
  temasFavoritos: [{ type: mongoose.Schema.Types.ObjectId, ref: "Tema" }],
  aulasFavoritas: [{ type: mongoose.Schema.Types.ObjectId, ref: "Aula" }],
  // DEPRECIADO — substituído por `planos[]` abaixo (um curso só sobrescrevia o anterior
  // inteiro a cada compra). Mantido só para não perder histórico; nada grava aqui mais.
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
  // DEPRECIADO — substituído por `planos[].packPrestige` + `legado.produtosAvulsos` abaixo.
  // Mantido só para não perder histórico; nada grava aqui mais.
  produtosAvulsos: {
    plataforma: { ativo: { type: Boolean, default: false }, dataVencimento: { type: Date } },
    producao: { ativo: { type: Boolean, default: false }, dataVencimento: { type: Date } },
    aulasEspecializadas: { ativo: { type: Boolean, default: false }, dataVencimento: { type: Date } }
  },
  // Um plano por curso — um aluno pode ter vários cursos ativos simultaneamente (ex.:
  // TCF Excellence + B1 Essentiel). "Pack Prestige" é uma via alternativa de liberar os
  // 3 módulos (plataforma/aulas/produção) daquele curso específico, paralela ao tier,
  // não um tier acima de Excellence — ver backend/middleware/acessoCurso.js.
  planos: [{
    courseType: { type: String, enum: TIPOS_CURSO, required: true },
    tier: { type: String, enum: ["Essentiel", "Avancé", "Excellence"], default: null },
    ativo: { type: Boolean, default: false },
    metodoPagamento: { type: String, enum: ["cartao_credito", "cartao_debito", "boleto", "pix"] },
    cartaoFinal: { type: String },
    autoRenovacao: { type: Boolean, default: false },
    dataInicio: { type: Date },
    dataVencimento: { type: Date },
    packPrestige: {
      ativo: { type: Boolean, default: false },
      dataVencimento: { type: Date },
      mercadoPagoId: { type: String }
    }
  }],
  // Clientes que compraram o antigo Pack Prestige avulso (cross-curso, sem vínculo com
  // um dos 8 cursos) mantêm acesso aqui até a assinatura vencer sozinha — congelado,
  // nunca mais escrito depois da migração. Concede acesso ao módulo em QUALQUER curso
  // (não dá pra saber a qual dos 8 vincular retroativamente).
  legado: {
    produtosAvulsos: {
      plataforma: { ativo: { type: Boolean, default: false }, dataVencimento: { type: Date } },
      producao: { ativo: { type: Boolean, default: false }, dataVencimento: { type: Date } },
      aulasEspecializadas: { ativo: { type: Boolean, default: false }, dataVencimento: { type: Date } }
    }
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