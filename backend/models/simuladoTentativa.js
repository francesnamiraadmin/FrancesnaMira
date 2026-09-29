const mongoose = require("mongoose");

// Uma tentativa de simulado completo (CO → CE → EE → EO). Respostas ficam salvas
// continuamente (autosave), então o aluno pode fechar a aba e retomar — o relógio de
// cada prova continua correndo no servidor, como na prova real.
const ProvaEstadoSchema = new mongoose.Schema({
  status: { type: String, enum: ["pendente", "em_andamento", "finalizada"], default: "pendente" },
  inicio: { type: Date, default: null },
  fim: { type: Date, default: null },
  tempoExtraSeg: { type: Number, default: 0 },
  questaoAtual: { type: Number, default: 0 },
  // co/ce: { "<n>": índice da alternativa }; ee: { t1: "texto" }; eo: { t1: { transcricao } }
  respostas: { type: mongoose.Schema.Types.Mixed, default: {} },
  // co: números dos áudios já ouvidos (cada áudio toca uma única vez).
  ouvidos: { type: [Number], default: [] },
  // eo: áudio gravado por tarefa (caminho no disco).
  audios: { type: mongoose.Schema.Types.Mixed, default: {} },
  resultado: { type: mongoose.Schema.Types.Mixed, default: null }
}, { _id: false });

const MensagemSchema = new mongoose.Schema({
  autor: { type: String, enum: ["aluno", "professor", "sistema"], required: true },
  autorNome: { type: String },
  texto: { type: String, required: true },
  data: { type: Date, default: Date.now }
}, { _id: false });

const SimuladoTentativaSchema = new mongoose.Schema({
  alunoId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  simuladoSlug: { type: String, required: true },
  curso: { type: String, default: "TCF" },
  modoCorrecao: { type: String, enum: ["ia", "professor"], required: true },
  status: { type: String, enum: ["em_andamento", "aguardando_correcao", "corrigindo_ia", "corrigido"], default: "em_andamento", index: true },
  provaAtual: { type: String, enum: ["co", "ce", "ee", "eo", null], default: "co" },
  provas: {
    co: { type: ProvaEstadoSchema, default: () => ({}) },
    ce: { type: ProvaEstadoSchema, default: () => ({}) },
    ee: { type: ProvaEstadoSchema, default: () => ({}) },
    eo: { type: ProvaEstadoSchema, default: () => ({}) }
  },
  // Conexão com professor/administrador: pode ser pedida a qualquer momento da prova.
  conexao: {
    status: { type: String, enum: ["nenhuma", "solicitada", "ativa", "encerrada"], default: "nenhuma" },
    solicitadaEm: { type: Date, default: null },
    motivo: { type: String, default: "" },
    professorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    professorNome: { type: String, default: "" },
    conectadoEm: { type: Date, default: null }
  },
  mensagens: { type: [MensagemSchema], default: [] },
  ia: {
    erro: { type: String, default: "" },
    tentativas: { type: Number, default: 0 },
    geradoEm: { type: Date, default: null }
  },
  // No modo professor, a IA pode gerar uma sugestão de notas que só a equipe vê
  // ({ ee, eo }); o professor ajusta e publica. O aluno só vê ee/eo depois de publicadoEm.
  sugestaoIA: { type: mongoose.Schema.Types.Mixed, default: null },
  publicadoEm: { type: Date, default: null },
  ultimaAtividade: { type: Date, default: Date.now }
}, { timestamps: { createdAt: "criadoEm", updatedAt: "atualizadoEm" }, minimize: false });

module.exports = mongoose.model("SimuladoTentativa", SimuladoTentativaSchema);
