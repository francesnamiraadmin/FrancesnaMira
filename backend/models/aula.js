const mongoose = require("mongoose");

const ArquivoAulaSchema = new mongoose.Schema({
  caminho: { type: String },
  tamanho: { type: Number },
  mimetype: { type: String }
}, { _id: false });

const VideoSchema = new mongoose.Schema({
  tipo: { type: String, enum: ["url", "upload"], default: "url" },
  url: { type: String },
  arquivo: ArquivoAulaSchema,
  duracaoSegundos: { type: Number }
}, { _id: false });

const MaterialSchema = new mongoose.Schema({
  nome: { type: String, required: true },
  tipo: { type: String, enum: ["pdf", "imagem", "audio", "exercicio", "link", "arquivo"], required: true },
  url: { type: String },
  arquivo: ArquivoAulaSchema
});

// tipo "gerado" (frame capturado do vídeo) e "upload" (imagem enviada manualmente)
// são armazenados e servidos exatamente da mesma forma — a distinção é só informativa.
const ThumbnailSchema = new mongoose.Schema({
  tipo: { type: String, enum: ["upload", "gerado", "nenhum"], default: "nenhum" },
  arquivo: ArquivoAulaSchema,
  timestampSegundos: { type: Number }
}, { _id: false });

const AulaSchema = new mongoose.Schema({
  moduloId: { type: mongoose.Schema.Types.ObjectId, ref: "Modulo", required: true, index: true },
  titulo: { type: String, required: true },
  descricao: { type: String },
  video: VideoSchema,
  thumbnail: ThumbnailSchema,
  materiais: [MaterialSchema],
  observacoesProfessor: { type: String },
  ordem: { type: Number, default: 0 },
  ativo: { type: Boolean, default: true },
  criadoEm: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Aula", AulaSchema);
