const mongoose = require("mongoose");

const ArquivoSchema = new mongoose.Schema({
  nome: { type: String },
  caminho: { type: String },
  tamanho: { type: Number },
  mimetype: { type: String },
  enviadoEm: { type: Date }
}, { _id: false });

const CriterioAvaliadoSchema = new mongoose.Schema({
  nome: { type: String, required: true },
  nota: { type: Number, min: 0, max: 5 },
  comentario: { type: String }
}, { _id: false });

const MensagemSchema = new mongoose.Schema({
  autor: { type: String, enum: ["aluno", "professor"], required: true },
  autorId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  texto: { type: String, required: true },
  data: { type: Date, default: Date.now }
}, { _id: false });

const HistoricoStatusSchema = new mongoose.Schema({
  status: { type: String, required: true },
  data: { type: Date, default: Date.now }
}, { _id: false });

const ProducaoSchema = new mongoose.Schema({
  protocolo: { type: String, required: true, unique: true },
  alunoId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  temaId: { type: mongoose.Schema.Types.ObjectId, ref: "Tema", required: true },
  professorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  status: {
    type: String,
    enum: ["rascunho", "aguardando_envio", "enviado", "em_fila", "em_correcao", "aguardando_revisao", "corrigido", "devolvido", "arquivado", "cancelado"],
    default: "em_fila"
  },
  origemId: { type: mongoose.Schema.Types.ObjectId, ref: "Producao", default: null },

  arquivoOriginal: ArquivoSchema,
  textoDigitado: { type: String },
  contagemPalavras: { type: Number },
  observacoesAluno: { type: String },

  creditosUtilizados: { type: Number, default: 1 },
  prazoEstimado: { type: Date },
  dataEnvio: { type: Date, default: Date.now },
  dataCorrecao: { type: Date },

  arquivoCorrigido: ArquivoSchema,
  avaliacao: {
    criterios: [CriterioAvaliadoSchema],
    notaTotal: { type: Number },
    nivelEstimado: { type: String },
    comentarioGeral: { type: String }
  },

  mensagens: [MensagemSchema],
  historicoStatus: [HistoricoStatusSchema],

  criadoEm: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Producao", ProducaoSchema);
