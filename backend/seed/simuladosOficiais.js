// =====================================================================
// SEED — catálogo de 20 Simulados Sugeridos pré-montados, pra "Simulados
// Sugeridos" (simulados.html) nunca ficar vazia — mesmo espírito de
// backend/seed/conjuntosOficiais.js, mas gerando `Conjunto`s com
// pool:"simulado" (sorteando de Questao.pool==="simulado", não de "praticar")
// e SEMPRE cronometrados (tempoLimiteSegundos definido), já que um Simulado
// é descrito no próprio produto como "cronometrado, em ambiente semelhante
// às provas oficiais" (ver a intro de simulados.html) — diferente de um
// Conjunto de Praticar comum, que fica sem limite de tempo por padrão.
//
// "Padrões" usados = as 3 quantidades já fixas em toda a Plataforma de
// Questões (QUANTIDADES_PERMITIDAS no backend, QUANTIDADES_SIMULADO no
// front): 10/20/40 questões. O tempo por padrão segue o mesmo ritmo que já
// era o default sugerido no formulário de simulado personalizado (60min
// para 40 questões = 1.5min/questão) — só replicado pros outros dois
// tamanhos: 10→15min, 20→30min, 40→60min.
//
// 6 níveis × 3 padrões (curto/médio/completo) = 18, + 2 "Revisão Geral"
// (todos os níveis misturados, só médio e completo — 10 questões
// misturando os 6 níveis renderia um simulado pouco coerente) = 20 total.
//
// Nomeado com prefixo "Simulado NN – " (não "Conjunto NN – ") de propósito:
// backend/seed/renumerarConjuntosOficiais.js casa só o prefixo "Conjunto
// NN – " e reordena TODOS os oficiais (de qualquer pool) que baterem com
// ele — usar um prefixo diferente aqui garante que esse script de
// renumeração (pensado só pro catálogo de Praticar) nunca mexa nos nomes
// dos Simulados.
//
// Execute manualmente com:
//   node backend/seed/simuladosOficiais.js
// Idempotente — pula simulados cujo nome já existe como oficial.
// =====================================================================
require("dotenv").config({ path: __dirname + "/../.env" });
const mongoose = require("mongoose");
const User = require("../models/user");
const Questao = require("../models/questao");
const Conjunto = require("../models/conjunto");
const { derivarDificuldade, sortearQuestoes, derivarFiltrosDeQuestoes } = require("../utils/gerarConjunto");

const NIVEIS = ["A1", "A2", "B1", "B2", "C1", "C2"];
const PADROES = [
  { quantidade: 10, sufixo: "Curto (10 questões)", tempoLimiteSegundos: 15 * 60 },
  { quantidade: 20, sufixo: "Médio (20 questões)", tempoLimiteSegundos: 30 * 60 },
  { quantidade: 40, sufixo: "Completo (40 questões)", tempoLimiteSegundos: 60 * 60 }
];

let contador = 0;
function proximoNome(sufixo) {
  contador++;
  return `Simulado ${String(contador).padStart(2, "0")} – ${sufixo}`;
}

function montarDefinicoes() {
  const defs = [];

  for (const nivel of NIVEIS) {
    for (const padrao of PADROES) {
      defs.push({
        nome: proximoNome(`Nível ${nivel} – ${padrao.sufixo}`),
        descricao: `Simulado cronometrado de nível ${nivel}, misturando categorias, em ambiente semelhante às provas oficiais.`,
        niveis: [nivel], materias: null, alvo: padrao.quantidade, tempoLimiteSegundos: padrao.tempoLimiteSegundos
      });
    }
  }

  for (const padrao of PADROES.slice(1)) {
    defs.push({
      nome: proximoNome(`Revisão Geral (Todos os Níveis) – ${padrao.sufixo}`),
      descricao: "Simulado cronometrado misturando todos os níveis e categorias — para uma avaliação ampla.",
      niveis: NIVEIS, materias: null, alvo: padrao.quantidade, tempoLimiteSegundos: padrao.tempoLimiteSegundos
    });
  }

  return defs;
}

async function contarDisponiveis(niveis, materias) {
  const filtro = { pool: "simulado", ativo: true, nivel: { $in: niveis } };
  if (materias) filtro.materia = { $in: materias };
  return Questao.countDocuments(filtro);
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI);

  const admin = await User.findOne({ role: { $in: ["admin", "professor"] } }).sort({ criadoEm: 1 });
  if (!admin) throw new Error("Nenhum usuário admin/professor encontrado para ser o criadoPor dos simulados.");

  const definicoes = montarDefinicoes();
  let criados = 0, pulados = 0, ignoradosPorPoucasQuestoes = 0;

  for (const def of definicoes) {
    const jaExiste = await Conjunto.findOne({ nome: def.nome, tipo: "oficial" });
    if (jaExiste) { pulados++; continue; }

    const disponivel = await contarDisponiveis(def.niveis, def.materias);
    if (disponivel < 4) {
      console.log(`Ignorado (só ${disponivel} questões disponíveis): ${def.nome}`);
      ignoradosPorPoucasQuestoes++;
      continue;
    }
    const quantidade = Math.min(def.alvo, disponivel);

    const questoes = await sortearQuestoes({ niveis: def.niveis, materias: def.materias || [], quantidade, pool: "simulado" });
    const filtrosReais = await derivarFiltrosDeQuestoes(questoes.map(q => q.questaoId));
    await Conjunto.create({
      nome: def.nome, descricao: def.descricao, tipo: "oficial", pool: "simulado", criadoPor: admin._id,
      filtros: filtrosReais,
      dificuldade: derivarDificuldade(def.niveis),
      questoes, quantidadeQuestoes: questoes.length, tempoLimiteSegundos: def.tempoLimiteSegundos
    });
    criados++;
  }

  console.log(`\nConcluído: ${criados} simulado(s) criado(s), ${pulados} já existiam, ${ignoradosPorPoucasQuestoes} ignorado(s) por falta de questões.`);
  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch(err => { console.error(err); process.exit(1); });
}
