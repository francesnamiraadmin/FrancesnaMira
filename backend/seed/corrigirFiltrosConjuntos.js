// =====================================================================
// MIGRAÇÃO ÚNICA — recalcula `filtros.{niveis,materias}` de todos os
// Conjuntos oficiais a partir das questões reais que os compõem.
// Corrige um bug do seed original (backend/seed/conjuntosOficiais.js
// gravava o filtro de ENTRADA da definição em vez da união real das
// questões sorteadas — conjuntos "mistos" como "Conjunto 01 – Nível A1"
// ficaram com filtros.materias: [] no banco). Idempotente — pode rodar
// de novo sem problema. Execute manualmente com:
//   node backend/seed/corrigirFiltrosConjuntos.js
// =====================================================================
require("dotenv").config({ path: __dirname + "/../.env" });
const mongoose = require("mongoose");
const Conjunto = require("../models/conjunto");
const { derivarFiltrosDeQuestoes } = require("../utils/gerarConjunto");

async function main() {
  await mongoose.connect(process.env.MONGO_URI);

  const conjuntos = await Conjunto.find({ tipo: "oficial" });
  let corrigidos = 0;

  for (const c of conjuntos) {
    const filtrosReais = await derivarFiltrosDeQuestoes(c.questoes.map(q => q.questaoId));
    const igual = JSON.stringify([...c.filtros.niveis].sort()) === JSON.stringify([...filtrosReais.niveis].sort())
      && JSON.stringify([...c.filtros.materias].sort()) === JSON.stringify([...filtrosReais.materias].sort());
    if (igual) continue;

    console.log(`${c.nome}: materias ${JSON.stringify(c.filtros.materias)} → ${JSON.stringify(filtrosReais.materias)}`);
    c.filtros = filtrosReais;
    await c.save();
    corrigidos++;
  }

  console.log(`\nConcluído: ${corrigidos}/${conjuntos.length} conjunto(s) corrigido(s).`);
  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch(err => { console.error(err); process.exit(1); });
}
