const mongoose = require("mongoose");

const ArquivoSchema = new mongoose.Schema({
  nome: { type: String },
  caminho: { type: String },
  tamanho: { type: Number },
  mimetype: { type: String },
  enviadoEm: { type: Date }
}, { _id: false });

// Critério da grade da prova (ver backend/utils/gradesProva.js): cada um tem seu máximo
// (TCF 0–5; DELF/DALF até 8 pontos). Avaliações antigas só têm nome/nota/comentario.
const CriterioAvaliadoSchema = new mongoose.Schema({
  id: { type: String },
  nome: { type: String, required: true },
  max: { type: Number },
  nota: { type: Number, min: 0 },
  comentario: { type: String }
}, { _id: false });

const CorrecaoPontualSchema = new mongoose.Schema({
  trecho: { type: String },
  correcao: { type: String },
  explicacao: { type: String }
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
  // Espelha Tema.modalidade — evita um join extra pra decidir como renderizar
  // (áudio vs. texto) na fila do professor e no histórico do aluno.
  modalidade: { type: String, enum: ["textual", "oral"], default: "textual" },
  status: {
    type: String,
    enum: ["rascunho", "aguardando_envio", "enviado", "em_fila", "em_correcao", "aguardando_revisao", "corrigido", "devolvido", "arquivado", "cancelado"],
    default: "em_fila"
  },
  origemId: { type: mongoose.Schema.Types.ObjectId, ref: "Producao", default: null },

  arquivoOriginal: ArquivoSchema,
  textoDigitado: { type: String },
  contagemPalavras: { type: Number },
  duracaoSegundos: { type: Number },
  // Produção oral: transcrição automática do navegador (o aluno pode corrigi-la antes de enviar).
  transcricao: { type: String },
  observacoesAluno: { type: String },
  // De onde veio: envio direto de um tema ou um sujet do Ambiente de Produção (modelo "Modèles TCF"),
  // numa épreuve de 60 min, numa épreuve preparada pelo professor ou numa gravação livre.
  origem: {
    tipo: { type: String, enum: ["tema", "modeles"], default: "tema" },
    tache: { type: String },
    sujetId: { type: String },
    eixo: { type: String },
    epreuveId: { type: mongoose.Schema.Types.ObjectId, ref: "EpreuveTCF" },
    sessaoId: { type: mongoose.Schema.Types.ObjectId, ref: "SessaoTCF" }
  },

  creditosUtilizados: { type: Number, default: 1 },
  // Quem corrige: professor (fila do Sistema de Correção, alguns dias) ou IA (na hora).
  modoCorrecao: { type: String, enum: ["professor", "ia"], default: "professor" },
  ia: {
    status: { type: String, enum: ["pendente", "concluida", "erro"] },
    erro: { type: String },
    modelo: { type: String },
    em: { type: Date }
  },
  prazoEstimado: { type: Date },
  dataEnvio: { type: Date, default: Date.now },
  dataCorrecao: { type: Date },

  arquivoCorrigido: ArquivoSchema,
  avaliacao: {
    exame: { type: String },
    criterios: [CriterioAvaliadoSchema],
    notaTotal: { type: Number },
    notaMaxima: { type: Number },
    nivelEstimado: { type: String },
    nclc: { type: String },
    aprovado: { type: Boolean },
    pontuacaoOficial: { type: Number },
    comentarioGeral: { type: String },
    pontosFortes: [{ type: String }],
    aMelhorar: [{ type: String }],
    correcoes: [CorrecaoPontualSchema],
    corretor: { type: String, enum: ["professor", "ia"] },
    corretorNome: { type: String },
    // Correção no formato do app de modelos: trame, léxico, connecteurs, versão melhorada, conselho.
    extras: { type: mongoose.Schema.Types.Mixed }
  },

  mensagens: [MensagemSchema],
  historicoStatus: [HistoricoStatusSchema],

  criadoEm: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Producao", ProducaoSchema);
