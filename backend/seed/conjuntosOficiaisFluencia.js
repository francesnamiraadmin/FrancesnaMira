// =====================================================================
// SEED — catálogo de Conjuntos Oficiais para os cursos de fluência (A1/A2/B1/B2),
// escopados por courseType e juntando as duas metades do banco de questões (antigo
// pool praticar/simulado, que perdeu sentido pro aluno depois que Simulado saiu da
// Plataforma de Questões — ver backend/utils/gerarConjunto.js#sortearQuestoes).
//
// Pressupõe que backend/seed/migrarCourseTypeQuestoes.js já rodou (Questao.courseType
// preenchido pra A1/A2/B1/B2 a partir do nível). C1/C2 não geram conjunto nenhum aqui —
// ficam disponíveis só via Personalizar Conjunto, pra contas elegíveis (ver
// backend/routes/questoes.js#POST /conjuntos/personalizado).
//
// Nomes com prefixo "Fluência X – " de propósito, pra não colidir com o catálogo antigo
// (que backend/seed/migrarCourseTypeQuestoes.js já resolveu por courseType, quando dava)
// nem com o de backend/seed/conjuntosOficiais.js.
//
// Execute manualmente com:
//   node backend/seed/conjuntosOficiaisFluencia.js
// Idempotente — pula conjuntos cujo nome já existe como oficial.
// =====================================================================
require("dotenv").config({ path: __dirname + "/../.env" });
const mongoose = require("mongoose");
const User = require("../models/user");
const Questao = require("../models/questao");
const Conjunto = require("../models/conjunto");
const { derivarDificuldade, sortearQuestoes, derivarFiltrosDeQuestoes } = require("../utils/gerarConjunto");

const CURSOS_FLUENCIA = ["A1", "A2", "B1", "B2"];
const CATEGORIAS_ROBUSTAS = [
  { materia: "grammaire", label: "Gramática", alvo: 15 },
  { materia: "co", label: "Compreensão Oral", alvo: 15 },
  { materia: "ce", label: "Compreensão Escrita", alvo: 15 },
  { materia: "visual", label: "Compreensão Visual", alvo: 25 },
  { materia: "historia", label: "Interpretação de Textos Longos", alvo: 25 }
];
// vocabulaire/conjugaison/expressions têm poucas questões por nível — viram um único
// conjunto combinado por curso (mesmo espírito de backend/seed/conjuntosOficiais.js, mas
// sem cruzar níveis, já que aqui cada curso é um nível só).
const CATEGORIAS_ESPARSAS = ["vocabulaire", "conjugaison", "expressions"];

function montarDefinicoes(curso) {
  const defs = [];

  defs.push({
    nome: `Fluência ${curso} – Nível Geral`,
    descricao: `Questões variadas de gramática, vocabulário, compreensão oral e escrita do curso de Francês ${curso}.`,
    courseType: curso, niveis: [curso], materias: null, alvo: 30
  });

  for (const cat of CATEGORIAS_ROBUSTAS) {
    defs.push({
      nome: `Fluência ${curso} – ${cat.label}`,
      descricao: `Questões de ${cat.label.toLowerCase()} do curso de Francês ${curso}.`,
      courseType: curso, niveis: [curso], materias: [cat.materia], alvo: cat.alvo
    });
  }

  defs.push({
    nome: `Fluência ${curso} – Vocabulário, Conjugação e Expressões`,
    descricao: `Questões de vocabulário, conjugação verbal e expressões idiomáticas do curso de Francês ${curso}.`,
    courseType: curso, niveis: [curso], materias: CATEGORIAS_ESPARSAS, alvo: 20
  });

  return defs;
}

async function contarDisponiveis(courseType, niveis, materias) {
  const filtro = { ativo: true, courseType, nivel: { $in: niveis } };
  if (materias) filtro.materia = { $in: materias };
  return Questao.countDocuments(filtro);
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI);

  const admin = await User.findOne({ role: { $in: ["admin", "professor"] } }).sort({ criadoEm: 1 });
  if (!admin) throw new Error("Nenhum usuário admin/professor encontrado para ser o criadoPor dos conjuntos.");

  let criados = 0, pulados = 0, ignoradosPorPoucasQuestoes = 0;

  for (const curso of CURSOS_FLUENCIA) {
    for (const def of montarDefinicoes(curso)) {
      const jaExiste = await Conjunto.findOne({ nome: def.nome, tipo: "oficial" });
      if (jaExiste) { pulados++; continue; }

      const disponivel = await contarDisponiveis(def.courseType, def.niveis, def.materias);
      if (disponivel < 4) { // conjunto de 1-3 questões não agrega valor pedagógico
        console.log(`Ignorado (só ${disponivel} questões disponíveis): ${def.nome}`);
        ignoradosPorPoucasQuestoes++;
        continue;
      }
      const quantidade = Math.min(def.alvo, disponivel);

      const questoes = await sortearQuestoes({ niveis: def.niveis, materias: def.materias || [], quantidade, courseType: def.courseType });
      const filtrosReais = await derivarFiltrosDeQuestoes(questoes.map(q => q.questaoId));
      await Conjunto.create({
        nome: def.nome, descricao: def.descricao, tipo: "oficial", pool: "praticar", criadoPor: admin._id,
        courseType: def.courseType,
        filtros: filtrosReais,
        dificuldade: derivarDificuldade(def.niveis),
        questoes, quantidadeQuestoes: questoes.length, tempoLimiteSegundos: null
      });
      console.log(`[criado] ${def.nome}: ${questoes.length} questões`);
      criados++;
    }
  }

  console.log(`\nConcluído: ${criados} conjunto(s) criado(s), ${pulados} já existiam, ${ignoradosPorPoucasQuestoes} ignorado(s) por falta de questões.`);
  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch(err => { console.error(err); process.exit(1); });
}
