const mongoose = require("mongoose");

// Registro das aulas particulares (Sistema de Aulas → « Registro de Aulas »).
// Cada aula semanal da grade (matrícula particular ou nome colocado à mão nos Horários Atuais) vira
// uma ocorrência por data. Só as ocorrências com algo registrado ficam no banco; as demais aparecem
// como « prevista » (ou « a registrar », se já passou). Aulas avulsas (reposição, aula extra) também.
const ESTADOS = ["prevista", "realizada", "falta", "falta_justificada", "cancelada_professor", "remarcada"];

const ArquivoSchema = new mongoose.Schema({
  nome: String, caminho: String, mimetype: String, tamanho: Number, enviadoEm: Date
}, { _id: false });

const RegistroAulaSchema = new mongoose.Schema({
  // de onde vem a aula: "m:<matrícula>" (matrícula particular), "a:<ajuste>" (nome à mão), "x:<id>" (avulsa)
  chave: { type: String, required: true },
  origem: { type: String, enum: ["grade", "avulsa"], default: "grade" },
  alunoId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  nome: { type: String, required: true, maxlength: 120 },
  curso: { type: String, default: "" },
  data: { type: Date, required: true },              // início da aula (horário de Brasília)
  duracaoMin: { type: Number, default: 60 },
  estado: { type: String, enum: ESTADOS, default: "prevista" },
  professor: { type: String, default: "", maxlength: 120 },
  conteudo: { type: String, default: "", maxlength: 2000 },      // o que foi trabalhado na aula
  observacao: { type: String, default: "", maxlength: 2000 },
  justificativa: { type: String, default: "", maxlength: 2000 },
  atestado: ArquivoSchema,
  reposicaoDe: { type: Date, default: null },                     // avulsa que repõe uma falta
  historico: [{
    _id: false, estado: String, nota: String, porId: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, porNome: String, em: { type: Date, default: Date.now }
  }],
  criadoEm: { type: Date, default: Date.now },
  atualizadoEm: { type: Date, default: Date.now }
});
RegistroAulaSchema.index({ chave: 1, data: 1 }, { unique: true });
RegistroAulaSchema.index({ data: 1 });

module.exports = mongoose.model("RegistroAula", RegistroAulaSchema);
module.exports.ESTADOS = ESTADOS;
