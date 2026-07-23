const mongoose = require("mongoose");
const { TIPOS_CURSO } = require("../utils/tiposCurso");

// Estado mutável de uma resolução em andamento. Ao finalizar, este documento é
// APAGADO e seus dados viram uma Tentativa imutável — não existe campo "status" aqui
// porque a própria existência do documento já significa "em andamento" (ver índice único).
const RespostaSessaoSchema = new mongoose.Schema({
  questaoId: { type: mongoose.Schema.Types.ObjectId, ref: "Questao", required: true },
  // String com o TEXTO da opção escolhida (não o índice) para lacuna/multipla/escuta, ou
  // Boolean para vf. Guardar o texto em vez do índice permite ao front embaralhar a ordem
  // de exibição das opções livremente sem precisar sincronizar mapeamento com o backend —
  // a correção compara o texto escolhido com `questao.opcoes[questao.indiceCorreta]`.
  respostaEscolhida: { type: mongoose.Schema.Types.Mixed, default: null },
  marcadaRevisao: { type: Boolean, default: false },
  respondidaEm: { type: Date }
}, { _id: false });

const SessaoResolucaoSchema = new mongoose.Schema({
  alunoId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  conjuntoId: { type: mongoose.Schema.Types.ObjectId, ref: "Conjunto", required: true },
  // Copiado de Conjunto.courseType na criação — mesmo motivo de Tentativa.courseType.
  courseType: { type: String, enum: TIPOS_CURSO, default: null },

  // Pré-populado a partir de conjunto.questoes na criação (mesma ordem, mesmo tamanho) —
  // permite navegação por índice sem merge no front.
  respostas: { type: [RespostaSessaoSchema], required: true },
  questaoAtualIndex: { type: Number, default: 0 }, // ponteiro de navegação ("questão atual")

  iniciadoEm: { type: Date, default: Date.now },
  ultimaAtividadeEm: { type: Date, default: Date.now }
});

// Uma sessão em andamento por aluno+conjunto — reabrir o conjunto sempre retoma a mesma.
SessaoResolucaoSchema.index({ alunoId: 1, conjuntoId: 1 }, { unique: true });

module.exports = mongoose.model("SessaoResolucao", SessaoResolucaoSchema);
