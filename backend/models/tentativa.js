const mongoose = require("mongoose");
const { TIPOS_CURSO } = require("../utils/tiposCurso");

// Snapshot IMUTÁVEL de uma resolução concluída. `correta` é calculado uma única vez,
// no momento da finalização, comparando com Questao.indiceCorreta/respostaVF vigentes
// naquele instante — nunca recalculado depois, mesmo que a questão seja editada ou
// desativada no futuro (mesmo espírito de "congelar o que foi entregue" já usado em
// DeverSemanal.atividades ao preservar a entrega do aluno).
const RespostaTentativaSchema = new mongoose.Schema({
  questaoId: { type: mongoose.Schema.Types.ObjectId, ref: "Questao", required: true },
  // Mesmo formato de SessaoResolucao.respostas.respostaEscolhida (texto da opção ou
  // boolean para vf) — null = deixada em branco (auto-envio por timeout).
  respostaEscolhida: { type: mongoose.Schema.Types.Mixed, default: null },
  correta: { type: Boolean, required: true },
  marcadaRevisao: { type: Boolean, default: false } // herdado da sessão, útil pro Caderno de Erros (Fase 2)
}, { _id: false });

const TentativaSchema = new mongoose.Schema({
  alunoId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  conjuntoId: { type: mongoose.Schema.Types.ObjectId, ref: "Conjunto", required: true },
  // Copiado de Conjunto.courseType no momento da criação — evita join pra filtrar
  // estatísticas/progresso por curso. `null` em tentativas antigas (ver migração).
  courseType: { type: String, enum: TIPOS_CURSO, default: null },
  numero: { type: Number, required: true }, // 1ª, 2ª... tentativa do aluno nesse Conjunto

  respostas: { type: [RespostaTentativaSchema], required: true },
  totalQuestoes: { type: Number, required: true },
  totalCorretas: { type: Number, required: true },
  percentualAcertos: { type: Number, required: true }, // denormalizado para listagem sem recomputar

  expirouPorTempo: { type: Boolean, default: false }, // true quando o auto-envio foi disparado pelo cronômetro

  tempoGastoSegundos: { type: Number, required: true },
  iniciadaEm: { type: Date, required: true },
  finalizadaEm: { type: Date, default: Date.now }
});

TentativaSchema.index({ alunoId: 1, conjuntoId: 1, finalizadaEm: -1 });
TentativaSchema.index({ conjuntoId: 1 });
TentativaSchema.index({ alunoId: 1, courseType: 1 });

module.exports = mongoose.model("Tentativa", TentativaSchema);
