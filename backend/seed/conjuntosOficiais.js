// =====================================================================
// SEED — catálogo de Conjuntos Oficiais pré-montados (diferentes níveis
// e diferentes categorias), pra a tela inicial da Plataforma de Questões
// nunca ficar vazia. Execute manualmente com:
//   node backend/seed/conjuntosOficiais.js
// Não é carregado automaticamente pelo servidor. Idempotente — pula
// conjuntos cujo nome já existe como oficial, então pode ser reexecutado
// com segurança (ex.: depois de rodar backend/seed/questoes.js de novo).
// =====================================================================
require("dotenv").config({ path: __dirname + "/../.env" });
const mongoose = require("mongoose");
const User = require("../models/user");
const Questao = require("../models/questao");
const Conjunto = require("../models/conjunto");
const { derivarDificuldade, sortearQuestoes } = require("../utils/gerarConjunto");

const NIVEIS = ["A1", "A2", "B1", "B2", "C1", "C2"];
const CATEGORIAS_ROBUSTAS = [
  { materia: "grammaire", label: "Gramática", alvo: 10 },
  { materia: "co", label: "Compreensão Oral", alvo: 10 },
  { materia: "ce", label: "Compreensão Escrita", alvo: 10 },
  { materia: "visual", label: "Compreensão Visual", alvo: 20 },
  { materia: "historia", label: "Interpretação de Textos Longos", alvo: 20 }
];
// vocabulaire/conjugaison/expressions têm poucas questões por nível (2-4) — não dá pra
// montar um conjunto só de um nível, então viram um único conjunto combinado cruzando
// todos os níveis (ver montarDefinicoes).
const CATEGORIAS_ESPARSAS = ["vocabulaire", "conjugaison", "expressions"];

let contador = 0;
function proximoNome(sufixo) {
  contador++;
  return `Conjunto ${String(contador).padStart(2, "0")} – ${sufixo}`;
}

function montarDefinicoes() {
  const defs = [];

  for (const nivel of NIVEIS) {
    defs.push({
      nome: proximoNome(`Nível ${nivel}`),
      descricao: `Questões variadas de gramática, vocabulário, compreensão oral e escrita no nível ${nivel}.`,
      niveis: [nivel], materias: null, alvo: 20
    });
    for (const cat of CATEGORIAS_ROBUSTAS) {
      defs.push({
        nome: proximoNome(`${cat.label} ${nivel}`),
        descricao: `Questões de ${cat.label.toLowerCase()} no nível ${nivel}.`,
        niveis: [nivel], materias: [cat.materia], alvo: cat.alvo
      });
    }
  }

  defs.push({
    nome: proximoNome("Vocabulário, Conjugação e Expressões (Todos os Níveis)"),
    descricao: "Questões de vocabulário, conjugação verbal e expressões idiomáticas, misturando todos os níveis.",
    niveis: NIVEIS, materias: CATEGORIAS_ESPARSAS, alvo: 20
  });

  defs.push({
    nome: proximoNome("Revisão Geral (Todos os Níveis)"),
    descricao: "Revisão ampla, misturando todos os níveis e todas as categorias — para praticar sem foco específico.",
    niveis: NIVEIS, materias: null, alvo: 40
  });

  return defs;
}

async function contarDisponiveis(niveis, materias) {
  const filtro = { pool: "praticar", ativo: true, nivel: { $in: niveis } };
  if (materias) filtro.materia = { $in: materias };
  return Questao.countDocuments(filtro);
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI);

  const admin = await User.findOne({ role: { $in: ["admin", "professor"] } }).sort({ criadoEm: 1 });
  if (!admin) throw new Error("Nenhum usuário admin/professor encontrado para ser o criadoPor dos conjuntos.");

  const definicoes = montarDefinicoes();
  let criados = 0, pulados = 0, ignoradosPorPoucasQuestoes = 0;

  for (const def of definicoes) {
    const jaExiste = await Conjunto.findOne({ nome: def.nome, tipo: "oficial" });
    if (jaExiste) { pulados++; continue; }

    const disponivel = await contarDisponiveis(def.niveis, def.materias);
    if (disponivel < 4) { // conjunto de 1-3 questões não agrega valor pedagógico
      console.log(`Ignorado (só ${disponivel} questões disponíveis): ${def.nome}`);
      ignoradosPorPoucasQuestoes++;
      continue;
    }
    const quantidade = Math.min(def.alvo, disponivel);

    const questoes = await sortearQuestoes({ niveis: def.niveis, materias: def.materias || [], quantidade, pool: "praticar" });
    await Conjunto.create({
      nome: def.nome, descricao: def.descricao, tipo: "oficial", pool: "praticar", criadoPor: admin._id,
      filtros: { niveis: def.niveis, materias: def.materias || [] },
      dificuldade: derivarDificuldade(def.niveis),
      questoes, quantidadeQuestoes: questoes.length, tempoLimiteSegundos: null
    });
    criados++;
  }

  console.log(`\nConcluído: ${criados} conjunto(s) criado(s), ${pulados} já existiam, ${ignoradosPorPoucasQuestoes} ignorado(s) por falta de questões.`);
  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch(err => { console.error(err); process.exit(1); });
}
