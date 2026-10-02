// Correção anotada das produções (Sistema de Correção):
//  - AnotacaoCorrecao: cada marcação/comentário do professor, um documento por anotação
//    (edição granular, milhares de produções sem documentos gigantes);
//  - HistoricoCorrecao: linha do tempo da correção (versões: iniciou, comentou, mudou a nota…);
//  - ConfigCorrecao: categorias de marcação configuráveis (nome, cor, significado pedagógico).
const mongoose = require("mongoose");
const { Schema } = mongoose;

// Âncora de texto robusta (modelo W3C Web Annotation): posição (inicio/fim no texto original)
// + citação (trecho) + contexto (prefixo/sufixo). Se o texto mudar, a citação e o contexto
// reencontram o trecho; nunca depende de coordenadas da tela.
const AnotacaoCorrecaoSchema = new Schema({
  producaoId: { type: Schema.Types.ObjectId, ref: "Producao", required: true },
  alunoId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  autorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  autorNome: { type: String, default: "" },
  // "texto": produção escrita · "transcricao": transcrição da produção oral · "audio": só um momento do áudio
  alvo: { type: String, enum: ["texto", "transcricao", "audio"], required: true },
  inicio: { type: Number, min: 0 },
  fim: { type: Number, min: 0 },
  trecho: { type: String, default: "", maxlength: 2000 },
  prefixo: { type: String, default: "", maxlength: 64 },
  sufixo: { type: String, default: "", maxlength: 64 },
  // momento do áudio/vídeo (segundos) — anotações do áudio e trechos da transcrição ligados ao áudio
  tempo: { type: Number, min: 0 },
  tempoFim: { type: Number, min: 0 },
  categoria: { type: String, required: true, maxlength: 40 },
  // cópia do nome e da cor da categoria no momento da anotação (a correção antiga continua legível
  // mesmo se a categoria for renomeada ou desativada depois)
  categoriaNome: { type: String, default: "" },
  cor: { type: String, default: "#2563eb", maxlength: 9 },
  comentario: { type: String, default: "", maxlength: 4000 },
  // forma correta sugerida (vai para o caderno de erros do aluno quando a correção é devolvida)
  sugestao: { type: String, default: "", maxlength: 1000 },
  removido: { type: Boolean, default: false },
  criadoEm: { type: Date, default: Date.now },
  atualizadoEm: { type: Date, default: Date.now }
});
AnotacaoCorrecaoSchema.index({ producaoId: 1, removido: 1, inicio: 1 });
AnotacaoCorrecaoSchema.index({ alunoId: 1, criadoEm: -1 });

const HistoricoCorrecaoSchema = new Schema({
  producaoId: { type: Schema.Types.ObjectId, ref: "Producao", required: true, index: true },
  versao: { type: Number, default: 1 },
  autorId: { type: Schema.Types.ObjectId, ref: "User" },
  autorNome: { type: String, default: "" },
  acao: {
    type: String, required: true,
    enum: ["iniciou", "anotou", "editou_anotacao", "removeu_anotacao", "restaurou_anotacao", "salvou_avaliacao", "alterou_nota", "concluiu", "devolveu", "reabriu"]
  },
  resumo: { type: String, default: "", maxlength: 500 },
  // retrato pequeno no momento (nota, nº de anotações) para comparar versões
  dados: { type: Schema.Types.Mixed },
  em: { type: Date, default: Date.now }
});

const CategoriaSchema = new Schema({
  id: { type: String, required: true, maxlength: 40 },
  nome: { type: String, required: true, maxlength: 60 },
  cor: { type: String, required: true, maxlength: 9 },
  descricao: { type: String, default: "", maxlength: 200 },
  // em que produções a categoria aparece
  modalidades: { type: [String], default: ["textual", "oral"] },
  ativa: { type: Boolean, default: true },
  ordem: { type: Number, default: 0 }
}, { _id: false });

const ConfigCorrecaoSchema = new Schema({
  _id: { type: String },
  categorias: [CategoriaSchema],
  atualizadoEm: { type: Date, default: Date.now },
  atualizadoPor: { type: Schema.Types.ObjectId, ref: "User" }
});

module.exports = {
  AnotacaoCorrecao: mongoose.model("AnotacaoCorrecao", AnotacaoCorrecaoSchema),
  HistoricoCorrecao: mongoose.model("HistoricoCorrecao", HistoricoCorrecaoSchema),
  ConfigCorrecao: mongoose.model("ConfigCorrecao", ConfigCorrecaoSchema)
};
