const mongoose = require("mongoose");

const DocumentoApoioSchema = new mongoose.Schema({
  tipo: {
    type: String,
    enum: ["artigo", "noticia", "estatistica", "infografico", "entrevista", "cartum", "grafico", "fotografia", "tabela", "documento_oficial"],
    required: true
  },
  titulo: { type: String, required: true },
  fonte: { type: String },
  autor: { type: String },
  data: { type: String },
  conteudo: { type: String, required: true },
  dadosGrafico: { type: mongoose.Schema.Types.Mixed },
  permiteDownload: { type: Boolean, default: false }
}, { _id: false });

const TemaSchema = new mongoose.Schema({
  titulo: { type: String, required: true },
  exame: { type: String, enum: ["TCF", "TEF", "DELF", "DALF"], required: true },
  nivel: { type: String, enum: ["A1", "A2", "B1", "B2", "C1", "C2"], required: true },
  tipoProducao: { type: String, required: true },
  dificuldade: { type: String, enum: ["facil", "medio", "dificil"], default: "medio" },
  descricao: { type: String, required: true },
  objetivos: [{ type: String }],
  instrucoes: { type: String, required: true },
  criteriosResumo: [{ type: String }],
  tempoSugerido: { type: Number, required: true },
  limitePalavrasMin: { type: Number, required: true },
  limitePalavrasMax: { type: Number, required: true },
  creditosNecessarios: { type: Number, default: 1 },
  competenciasAvaliadas: [{ type: String }],
  coletanea: [DocumentoApoioSchema],
  ativo: { type: Boolean, default: true },
  criadoPor: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  criadoEm: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Tema", TemaSchema);
