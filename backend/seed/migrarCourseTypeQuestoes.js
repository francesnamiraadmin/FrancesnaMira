// =====================================================================
// MIGRAÇÃO ÚNICA — classifica o banco de questões existente (~900, sem
// nenhuma marcação de curso hoje) por `courseType`, usando `nivel` como
// mapeamento automático (A1→A1, A2→A2, B1→B1, B2→B2). Questões de nível
// C1/C2 (fora do mapeamento) ficam `pendenteRevisaoCourseType: true` — sem
// courseType nenhum, invisíveis pra qualquer curso até um admin decidir.
//
// Também deriva `Conjunto.courseType` a partir das questões que o compõem
// (só quando há um único courseType entre elas; conjuntos "mistos" de nível
// ficam `pendenteRevisao: true`, NUNCA divididos automaticamente — isso
// quebraria Tentativas antigas que referenciam o Conjunto original) e
// denormaliza `courseType` em Tentativa/SessaoResolucao/CadernoErros para
// permitir estatísticas/progresso/caderno filtráveis por curso sem join.
//
// Os passos são encadeados via mapas em memória (não por reconsulta ao
// banco) justamente para que `--dry-run` preveja fielmente o resultado de
// uma execução real, mesmo sem nada ter sido gravado ainda nesse processo.
//
// Idempotente — todo update filtra por `courseType: null`, então rodar de
// novo é no-op para o que já foi resolvido (automaticamente ou por um admin).
//
// Uso:
//   node backend/seed/migrarCourseTypeQuestoes.js --dry-run   (só loga, não grava)
//   node backend/seed/migrarCourseTypeQuestoes.js             (grava de verdade)
// =====================================================================
require("dotenv").config({ path: __dirname + "/../.env" });
const mongoose = require("mongoose");
const Questao = require("../models/questao");
const Conjunto = require("../models/conjunto");
const Tentativa = require("../models/tentativa");
const SessaoResolucao = require("../models/sessaoResolucao");
const CadernoErros = require("../models/cadernoErros");
const Modulo = require("../models/modulo");
const Tema = require("../models/tema");
const Rubrica = require("../models/rubrica");
const { TIPOS_CURSO } = require("../utils/tiposCurso");

const DRY_RUN = process.argv.includes("--dry-run");
const NIVEIS_MAPEAVEIS = ["A1", "A2", "B1", "B2"];

// Retorna o Map<questaoIdString, courseType> que estaria em vigor DEPOIS desta
// migração — combina o que já está gravado com o que este passo escreveria agora,
// pra que os passos seguintes (Conjuntos, CadernoErros) enxerguem o resultado
// correto mesmo em --dry-run, sem depender de uma escrita real ter acontecido.
async function migrarQuestoes() {
  console.log("\n--- Questões ---");
  const todas = await Questao.find({}).select("nivel courseType pendenteRevisaoCourseType");
  const mapa = new Map();
  let totalPorNivel = 0, pendentes = 0;

  const porNivel = {};
  for (const nivel of NIVEIS_MAPEAVEIS) porNivel[nivel] = 0;

  for (const q of todas) {
    if (q.courseType) { mapa.set(String(q._id), q.courseType); continue; }
    if (NIVEIS_MAPEAVEIS.includes(q.nivel)) {
      mapa.set(String(q._id), q.nivel);
      porNivel[q.nivel]++;
      totalPorNivel++;
    } else if (!q.pendenteRevisaoCourseType) {
      pendentes++;
    }
  }

  for (const nivel of NIVEIS_MAPEAVEIS) {
    if (porNivel[nivel] > 0) console.log(`nivel=${nivel}: ${porNivel[nivel]} questão(ões) → courseType=${nivel}`);
  }
  if (pendentes > 0) console.log(`nivel C1/C2 sem courseType mapeável: ${pendentes} questão(ões) → pendenteRevisaoCourseType=true`);
  console.log(`Total migrado automaticamente: ${totalPorNivel}. Total pendente de revisão: ${pendentes}.`);

  if (!DRY_RUN) {
    for (const nivel of NIVEIS_MAPEAVEIS) {
      await Questao.updateMany({ nivel, courseType: null }, { $set: { courseType: nivel } });
    }
    await Questao.updateMany(
      { nivel: { $in: ["C1", "C2"] }, courseType: null, pendenteRevisaoCourseType: false },
      { $set: { pendenteRevisaoCourseType: true } }
    );
  }

  return mapa;
}

// Recebe o mapa de courseType "efetivo" das questões (já incluindo o que migrarQuestoes
// acabou de resolver) e retorna o Map<conjuntoIdString, courseType> resultante, pelo
// mesmo motivo: os passos seguintes precisam do resultado real, não de uma reconsulta.
async function migrarConjuntos(mapaQuestoes) {
  console.log("\n--- Conjuntos ---");
  const conjuntos = await Conjunto.find({}).select("nome courseType pendenteRevisao questoes");
  const mapaConjuntos = new Map();
  let resolvidos = 0, marcadosPendentes = 0, jaOk = 0;

  for (const c of conjuntos) {
    const courseTypes = c.questoes.map(q => mapaQuestoes.get(String(q.questaoId))).filter(Boolean);
    const distintos = [...new Set(courseTypes)];

    if (distintos.length === 1) {
      mapaConjuntos.set(String(c._id), distintos[0]);
      if (c.courseType === distintos[0] && !c.pendenteRevisao) { jaOk++; continue; }
      console.log(`[resolvido] ${c.nome}: courseType=${distintos[0]}`);
      if (!DRY_RUN) await Conjunto.updateOne({ _id: c._id }, { $set: { courseType: distintos[0], pendenteRevisao: false } });
      resolvidos++;
    } else {
      if (c.pendenteRevisao) { jaOk++; continue; }
      console.log(`[pendente] ${c.nome}: ${distintos.length === 0 ? "nenhuma questão classificada ainda" : `courseTypes divergentes (${distintos.join(", ")})`} → pendenteRevisao=true`);
      if (!DRY_RUN) await Conjunto.updateOne({ _id: c._id }, { $set: { pendenteRevisao: true } });
      marcadosPendentes++;
    }
  }

  console.log(`Conjuntos resolvidos: ${resolvidos}. Marcados pendentes: ${marcadosPendentes}. Já estavam corretos: ${jaOk}.`);
  return mapaConjuntos;
}

async function denormalizarTentativasSessoes(mapaConjuntos) {
  console.log("\n--- Tentativa / SessaoResolucao (denormalização de courseType) ---");
  for (const [Model, nome] of [[Tentativa, "Tentativa"], [SessaoResolucao, "SessaoResolucao"]]) {
    const docs = await Model.find({ courseType: null }).select("conjuntoId");
    const ops = [];
    for (const d of docs) {
      const courseType = mapaConjuntos.get(String(d.conjuntoId));
      if (courseType) ops.push({ updateOne: { filter: { _id: d._id }, update: { $set: { courseType } } } });
    }
    console.log(`${nome}: ${ops.length}/${docs.length} documento(s) com courseType resolvido a denormalizar.`);
    if (!DRY_RUN && ops.length) await Model.bulkWrite(ops);
  }
}

async function denormalizarCadernoErros(mapaQuestoes) {
  console.log("\n--- CadernoErros (denormalização de courseType) ---");
  const docs = await CadernoErros.find({ courseType: null }).select("questaoId");
  const ops = [];
  for (const d of docs) {
    const courseType = mapaQuestoes.get(String(d.questaoId));
    if (courseType) ops.push({ updateOne: { filter: { _id: d._id }, update: { $set: { courseType } } } });
  }
  console.log(`CadernoErros: ${ops.length}/${docs.length} documento(s) com courseType resolvido a denormalizar.`);
  if (!DRY_RUN && ops.length) await CadernoErros.bulkWrite(ops);
}

async function migrarModulos() {
  console.log("\n--- Módulos (Aulas Especializadas) ---");
  const modulos = await Modulo.find({ courseType: null }).select("titulo curso");
  let migrados = 0, semCorrespondencia = 0;

  for (const m of modulos) {
    const candidato = (m.curso || "").trim().toUpperCase();
    const match = TIPOS_CURSO.find(t => t === candidato);
    if (match) {
      console.log(`[resolvido] "${m.titulo}": curso="${m.curso}" → courseType=${match}`);
      if (!DRY_RUN) await Modulo.updateOne({ _id: m._id }, { $set: { courseType: match } });
      migrados++;
    } else {
      semCorrespondencia++;
    }
  }

  console.log(`Módulos migrados: ${migrados}. Sem correspondência clara (ficam invisíveis até um admin classificar): ${semCorrespondencia}.`);
}

async function migrarTemasRubricas() {
  console.log("\n--- Temas / Rubricas (courseType = exame, determinístico) ---");
  for (const [Model, nome] of [[Tema, "Tema"], [Rubrica, "Rubrica"]]) {
    const docs = await Model.find({ courseType: null, exame: { $ne: null } }).select("exame");
    if (docs.length === 0) { console.log(`${nome}: nada pendente.`); continue; }
    console.log(`${nome}: ${docs.length} documento(s) → courseType = exame`);
    if (!DRY_RUN) {
      const ops = docs.map(d => ({ updateOne: { filter: { _id: d._id }, update: { $set: { courseType: d.exame } } } }));
      await Model.bulkWrite(ops);
    }
  }
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log(DRY_RUN ? "=== DRY RUN — nenhuma escrita será feita ===" : "=== EXECUÇÃO REAL — gravando no banco ===");

  const mapaQuestoes = await migrarQuestoes();
  const mapaConjuntos = await migrarConjuntos(mapaQuestoes);
  await denormalizarTentativasSessoes(mapaConjuntos);
  await denormalizarCadernoErros(mapaQuestoes);
  await migrarModulos();
  await migrarTemasRubricas();

  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch(err => { console.error(err); process.exit(1); });
}
