const mongoose = require("mongoose");

// Mesmo arquivo genérico usado em Producao/Aula (nome/caminho/tamanho/mimetype).
const ArquivoDeverSchema = new mongoose.Schema({
  nome: { type: String }, caminho: { type: String }, tamanho: { type: Number },
  mimetype: { type: String }, enviadoEm: { type: Date }
}, { _id: false });

const TIPOS_ATIVIDADE = [
  "upload_arquivo", "video", "imagem", "link_externo", "texto", "leitura",
  "exercicio_lista", "questoes_plataforma", "producao_textual", "producao_oral",
  "assistir_aula", "assistir_modulo", "simulado", "recurso_generico"
];

// Mesmo padrão de "tipo enum + campos opcionais por tipo" já usado em
// MaterialSchema (backend/models/aula.js) — só os campos relevantes ao
// `tipo` escolhido são preenchidos, o resto fica vazio.
const ConteudoAtividadeSchema = new mongoose.Schema({
  url: { type: String },
  texto: { type: String },
  arquivo: ArquivoDeverSchema,
  temaId: { type: mongoose.Schema.Types.ObjectId, ref: "Tema" },
  aulaId: { type: mongoose.Schema.Types.ObjectId, ref: "Aula" },
  moduloId: { type: mongoose.Schema.Types.ObjectId, ref: "Modulo" }
}, { _id: false });

// `comEntrega: true` para o dever real (instância por aluno) — o Plano-Base
// (template) não precisa desse bloco, já que ninguém entrega nada nele.
function criarAtividadeSchema(comEntrega) {
  const campos = {
    tipo: { type: String, enum: TIPOS_ATIVIDADE, required: true },
    titulo: { type: String, required: true },
    descricao: { type: String },
    obrigatoria: { type: Boolean, default: true },
    conteudo: ConteudoAtividadeSchema
  };
  if (comEntrega) {
    // Só "pendente"/"enviado" ficam gravados — "atrasada" é sempre calculado
    // na leitura a partir de dataLimite/enviadoEm (backend/utils/gerarDeveres.js),
    // pra nunca ficar desatualizado por falta de um job rodando no momento certo.
    campos.entrega = {
      status: { type: String, enum: ["pendente", "enviado"], default: "pendente" },
      arquivo: ArquivoDeverSchema,
      texto: { type: String },
      linkProducaoId: { type: mongoose.Schema.Types.ObjectId, ref: "Producao" },
      comentarioProfessor: { type: String },
      enviadoEm: { type: Date }
    };
  }
  return new mongoose.Schema(campos);
}

module.exports = { criarAtividadeSchema, ArquivoDeverSchema, TIPOS_ATIVIDADE };
