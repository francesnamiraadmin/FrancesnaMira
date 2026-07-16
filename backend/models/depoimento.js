const mongoose = require("mongoose");

// Consentimento de uso de imagem/depoimento embutido no próprio documento —
// é sempre 1-para-1 com o depoimento (não faz sentido reaproveitar ou
// consultar separadamente), então vive aqui como subdocumento em vez de uma
// coleção própria.
const ConsentimentoSchema = new mongoose.Schema({
  aceito: { type: Boolean, required: true },
  textoVersao: { type: String, required: true },
  aceitoEm: { type: Date, default: Date.now }
}, { _id: false });

const DepoimentoSchema = new mongoose.Schema({
  alunoId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  titulo: { type: String, required: true },
  texto: { type: String, required: true },
  nota: { type: Number, required: true, min: 1, max: 5 },
  cursoOuPlano: { type: String },
  tempoUso: { type: String },
  foto: { type: String },
  consentimento: { type: ConsentimentoSchema, required: true },
  status: { type: String, enum: ["pendente", "aprovado", "rejeitado"], default: "pendente" },
  destaque: { type: Boolean, default: false },
  moderadoPor: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  moderadoEm: { type: Date },
  criadoEm: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Depoimento", DepoimentoSchema);
