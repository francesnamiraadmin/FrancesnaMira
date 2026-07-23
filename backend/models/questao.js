const mongoose = require("mongoose");
const { TIPOS_CURSO } = require("../utils/tiposCurso");

const NIVEIS = ["A1", "A2", "B1", "B2", "C1", "C2"];
const MATERIAS = ["conjugaison", "vocabulaire", "grammaire", "co", "ce", "expressions", "historia", "visual"];
const TIPOS_QUESTAO = ["lacuna", "multipla", "escuta", "vf"];

// Migrado do banco estático em public/js/questoes*.js (ver backend/seed/questoes.js).
// `codigo` preserva o `id` original do arquivo-fonte — usado como chave de upsert
// na reimportação e como referência estável em Conjunto/SessaoResolucao/Tentativa/CadernoErros.
const QuestaoSchema = new mongoose.Schema({
  codigo: { type: String, required: true, unique: true },
  origem: { type: String }, // arquivo-fonte (questoes.js..questoes6.js), só para auditoria
  pool: { type: String, enum: ["praticar", "simulado"], required: true },
  nivel: { type: String, enum: NIVEIS, required: true },
  materia: { type: String, enum: MATERIAS, required: true },
  tipo: { type: String, enum: TIPOS_QUESTAO, required: true },

  enunciado: { type: String, required: true },
  texto: { type: String }, // passagem de leitura (compreensão escrita/histórias)
  audio: { type: String }, // transcrição lida via speechSynthesis (tipo "escuta") — nunca é um arquivo real
  // Formato heterogêneo por tipo de visual (relógio/termômetro/preço/calendário/clima/
  // sinal/gráfico), opaco ao backend e interpretado só pelo renderer SVG do front —
  // mesmo padrão de campo Mixed usado em DocumentoApoioSchema.dadosGrafico (tema.js).
  visual: { type: mongoose.Schema.Types.Mixed },

  opcoes: [{ type: String }], // tipos lacuna/multipla/escuta
  // Índice dentro de `opcoes` que é a resposta correta. Guardado explicitamente (em vez
  // de depender implicitamente de "opcoes[0] é sempre a correta") para permitir reordenar
  // opções no futuro sem quebrar a correção — a migração sempre grava 0.
  indiceCorreta: { type: Number, default: 0 },
  afirmacao: { type: String }, // tipo vf
  respostaVF: { type: Boolean }, // tipo vf — renomeado do `resposta` da fonte para não colidir
                                  // semanticamente com "resposta do aluno" em Sessão/Tentativa

  explicacao: { type: String, required: true },
  ativo: { type: Boolean, default: true }, // desativar sem quebrar Tentativas antigas que referenciam o id

  // Curso ao qual esta questão pertence — segrega o banco por tipo de aula. `null` +
  // `pendenteRevisaoCourseType` distingue "aguardando classificação do admin" de
  // "nunca migrado" (ver backend/seed/migrarCourseTypeQuestoes.js).
  courseType: { type: String, enum: TIPOS_CURSO, default: null },
  pendenteRevisaoCourseType: { type: Boolean, default: false },

  criadoEm: { type: Date, default: Date.now }
});

// Filtro principal usado no sorteio de conjunto personalizado e na busca de curadoria manual.
QuestaoSchema.index({ courseType: 1, pool: 1, ativo: 1, nivel: 1, materia: 1 });

const Questao = mongoose.model("Questao", QuestaoSchema);
Questao.NIVEIS = NIVEIS;
Questao.MATERIAS = MATERIAS;
Questao.TIPOS_QUESTAO = TIPOS_QUESTAO;
Questao.TIPOS_CURSO = TIPOS_CURSO;

module.exports = Questao;
