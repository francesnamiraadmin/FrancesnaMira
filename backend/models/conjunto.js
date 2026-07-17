const mongoose = require("mongoose");

// Lista de questões FIXADA no momento da criação do Conjunto (sorteada uma vez para
// personalizado, curada manualmente para oficial, nunca re-sorteada depois) — necessário
// pra retomar uma sessão vendo sempre as mesmas questões e pra que a % média de acertos
// seja comparável entre tentativas/alunos. Nunca duplica o conteúdo da questão, só referencia.
const QuestaoRefSchema = new mongoose.Schema({
  questaoId: { type: mongoose.Schema.Types.ObjectId, ref: "Questao", required: true },
  ordem: { type: Number, required: true }
}, { _id: false });

const ConjuntoSchema = new mongoose.Schema({
  nome: { type: String, required: true },
  descricao: { type: String },
  tipo: { type: String, enum: ["oficial", "personalizado"], required: true },
  // "praticar" é o único pool suportado nesta fase — campo já existe para a Fase 3
  // (unificação de Simulados) poder reaproveitar a mesma entidade sem migração de schema.
  pool: { type: String, enum: ["praticar", "simulado"], default: "praticar" },
  criadoPor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

  // Metadados de exibição ("B1-B2 · Gramática, Vocabulário"): para oficial, derivado
  // automaticamente da união de nível/matéria das questões curadas manualmente; para
  // personalizado, os filtros que o próprio aluno escolheu antes do sorteio.
  filtros: {
    niveis: [{ type: String, enum: ["A1", "A2", "B1", "B2", "C1", "C2"] }],
    materias: [{ type: String }]
  },
  // Derivada do nível mais alto presente no conjunto para personalizado; editável
  // livremente pelo admin/professor em conjuntos oficiais.
  dificuldade: { type: String, enum: ["facil", "medio", "dificil"] },

  questoes: { type: [QuestaoRefSchema], required: true },
  quantidadeQuestoes: { type: Number, required: true }, // = questoes.length no momento da criação

  tempoLimiteSegundos: { type: Number, default: null }, // null = sem limite de tempo

  // Contadores atualizados via $inc atômico no momento em que uma Tentativa é finalizada —
  // evita agregar sobre todas as Tentativas toda vez que a listagem de conjuntos é carregada.
  estatisticas: {
    tentativasTotais: { type: Number, default: 0 },
    somaPercentualAcertos: { type: Number, default: 0 } // média = somaPercentualAcertos / tentativasTotais
  },

  ativo: { type: Boolean, default: true }, // soft-delete: nunca remover de fato (Tentativas referenciam o Conjunto)
  criadoEm: { type: Date, default: Date.now }
});

ConjuntoSchema.index({ tipo: 1, pool: 1, ativo: 1 });
ConjuntoSchema.index({ criadoPor: 1, tipo: 1 });

module.exports = mongoose.model("Conjunto", ConjuntoSchema);
