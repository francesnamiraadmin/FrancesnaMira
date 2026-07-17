// =====================================================================
// SEED — migra as ~900 questões estáticas de public/js/questoes*.js para
// a coleção Questao no MongoDB. Execute manualmente com:
//   node backend/seed/questoes.js
// Não é carregado automaticamente pelo servidor. Idempotente (upsert por
// `codigo`) — pode ser reexecutado sempre que os arquivos-fonte mudarem.
// =====================================================================
require("dotenv").config({ path: __dirname + "/../.env" });
const vm = require("vm");
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const Questao = require("../models/questao");

const PASTA_FONTE = path.join(__dirname, "../../public/js");
// Mesma ordem de carregamento usada pelos <script src> em plataforma-questoes.html —
// cada arquivo faz `QUESTOES.push(...)` no final, dependendo do array já existir.
const ARQUIVOS = ["questoes.js", "questoes2.js", "questoes3.js", "questoes4.js", "questoes5.js", "questoes6.js"];

const NIVEIS = ["A1", "A2", "B1", "B2", "C1", "C2"];
const MATERIAS = ["conjugaison", "vocabulaire", "grammaire", "co", "ce", "expressions", "historia", "visual"];
const TIPOS = ["lacuna", "multipla", "escuta", "vf"];

// Os arquivos-fonte não são módulos CommonJS: dependem de escopo global compartilhado
// (só funcionam no navegador porque são carregados em sequência no mesmo documento).
// Recriamos esse comportamento com vm.createContext, reaproveitando o mesmo contexto
// global entre as 6 execuções — e usamos vm.runInContext (não acesso de propriedade)
// pra ler `QUESTOES` de volta, porque `const`/`let` de topo-de-arquivo não vira
// propriedade enumerável do objeto sandbox visto de fora do contexto.
function carregarQuestoesBrutas() {
  const sandbox = {};
  vm.createContext(sandbox);
  const porOrigem = [];

  for (const arquivo of ARQUIVOS) {
    const antes = vm.runInContext("typeof QUESTOES !== 'undefined' ? QUESTOES.length : 0", sandbox);
    const codigoFonte = fs.readFileSync(path.join(PASTA_FONTE, arquivo), "utf8");
    vm.runInContext(codigoFonte, sandbox, { filename: arquivo });
    const novos = vm.runInContext(`QUESTOES.slice(${antes})`, sandbox);
    novos.forEach(item => porOrigem.push({ origem: arquivo, item }));
  }

  return porOrigem;
}

function validar(item) {
  const erros = [];
  if (!item.id) erros.push("sem id");
  if (!item.enunciado) erros.push("sem enunciado");
  if (!item.explicacao) erros.push("sem explicacao");
  if (!["praticar", "simulado"].includes(item.pool)) erros.push(`pool inválido: ${item.pool}`);
  if (!NIVEIS.includes(item.nivel)) erros.push(`nível inválido: ${item.nivel}`);
  if (!MATERIAS.includes(item.materia)) erros.push(`matéria inválida: ${item.materia}`);
  if (!TIPOS.includes(item.tipo)) erros.push(`tipo inválido: ${item.tipo}`);
  if (["lacuna", "multipla", "escuta"].includes(item.tipo) && (!Array.isArray(item.opcoes) || item.opcoes.length < 2)) {
    erros.push("opções insuficientes para o tipo");
  }
  if (item.tipo === "vf" && (typeof item.resposta !== "boolean" || !item.afirmacao)) {
    erros.push("tipo vf sem afirmacao/resposta booleana");
  }
  if (item.tipo === "escuta" && !item.audio) erros.push("tipo escuta sem audio");
  if (item.materia === "visual" && !item.visual) erros.push("matéria visual sem campo visual");
  return erros;
}

function normalizar(origem, item) {
  return {
    codigo: item.id,
    origem,
    pool: item.pool,
    nivel: item.nivel,
    materia: item.materia,
    tipo: item.tipo,
    enunciado: item.enunciado,
    texto: item.texto,
    audio: item.audio,
    visual: item.visual,
    opcoes: item.opcoes || [],
    indiceCorreta: 0, // convenção confirmada em todos os arquivos-fonte: opcoes[0] é sempre a correta
    afirmacao: item.afirmacao,
    respostaVF: typeof item.resposta === "boolean" ? item.resposta : undefined,
    explicacao: item.explicacao,
    ativo: true
  };
}

async function main() {
  const brutas = carregarQuestoesBrutas();
  console.log(`Lidas ${brutas.length} questões de ${ARQUIVOS.length} arquivos-fonte.`);

  // 1. Unicidade de id entre os 6 arquivos combinados
  const origemPorId = new Map();
  const duplicados = [];
  for (const { origem, item } of brutas) {
    if (origemPorId.has(item.id)) {
      duplicados.push({ id: item.id, origens: [origemPorId.get(item.id), origem] });
    } else {
      origemPorId.set(item.id, origem);
    }
  }
  if (duplicados.length) {
    console.error(`Abortando: ${duplicados.length} id(s) duplicado(s) entre arquivos-fonte:`);
    duplicados.forEach(d => console.error(`  ${d.id} — ${d.origens.join(" e ")}`));
    process.exit(1);
  }

  // 2. Validação por tipo — aborta sem importar nada se houver problema
  const problemas = [];
  for (const { origem, item } of brutas) {
    const erros = validar(item);
    if (erros.length) problemas.push({ id: item.id, origem, erros });
  }
  if (problemas.length) {
    console.error(`Abortando: ${problemas.length} questão(ões) com erro de validação:`);
    problemas.forEach(p => console.error(`  ${p.id} (${p.origem}): ${p.erros.join(", ")}`));
    process.exit(1);
  }

  // 3. Normalização para o schema Questao
  const normalizadas = brutas.map(({ origem, item }) => normalizar(origem, item));

  // 4. Escrita idempotente (upsert por codigo)
  await mongoose.connect(process.env.MONGO_URI);
  const resultado = await Questao.bulkWrite(
    normalizadas.map(q => ({
      updateOne: { filter: { codigo: q.codigo }, update: { $set: q }, upsert: true }
    }))
  );

  // 5. Resumo
  const contarPor = campo => normalizadas.reduce((acc, q) => {
    acc[q[campo]] = (acc[q[campo]] || 0) + 1;
    return acc;
  }, {});

  console.log(`\nImportação concluída: ${normalizadas.length} questões processadas.`);
  console.log(`Inseridas: ${resultado.upsertedCount}. Atualizadas: ${resultado.modifiedCount}.`);
  console.log("Por pool:", contarPor("pool"));
  console.log("Por nível:", contarPor("nivel"));
  console.log("Por matéria:", contarPor("materia"));

  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch(err => { console.error(err); process.exit(1); });
}

module.exports = { carregarQuestoesBrutas, validar, normalizar };
