// =====================================================================
// MIGRAÇÃO ÚNICA — renumera o prefixo "Conjunto NN" dos Conjuntos Oficiais
// pra seguir a ORDEM DE EXIBIÇÃO real (prioridade calculada por
// classificarPrioridade, mesmo critério usado em GET /conjuntos pra
// montar a aba Sugeridos), em vez da ordem de criação original.
// Só mexe em nomes que já começam com "Conjunto <número> – " — conjuntos
// curados manualmente pelo admin com outro nome não são tocados.
// Idempotente — pode rodar de novo sem problema. Execute manualmente com:
//   node backend/seed/renumerarConjuntosOficiais.js
//
// ATENÇÃO: depois de rodar isto, reexecutar backend/seed/conjuntosOficiais.js
// criaria conjuntos DUPLICADOS — aquele script identifica "já existe" pelo
// `nome` original (ex. "Conjunto 07 – Nível A2"), que este script já
// renomeou. Não é um problema no uso normal (o seed do catálogo já rodou
// uma vez e não deveria rodar de novo), só um risco a ter em mente.
// =====================================================================
require("dotenv").config({ path: __dirname + "/../.env" });
const mongoose = require("mongoose");
const Conjunto = require("../models/conjunto");
const { classificarPrioridade } = require("../utils/gerarConjunto");

const PREFIXO_REGEX = /^Conjunto\s+\d+\s*–\s*/;

async function main() {
  await mongoose.connect(process.env.MONGO_URI);

  const todos = await Conjunto.find({ tipo: "oficial" }).sort({ criadoEm: 1 });
  const numerados = todos.filter(c => PREFIXO_REGEX.test(c.nome));
  const naoNumerados = todos.filter(c => !PREFIXO_REGEX.test(c.nome));
  if (naoNumerados.length) {
    console.log(`Ignorados (nome não segue o padrão "Conjunto NN – ...", provavelmente curados manualmente): ${naoNumerados.map(c => c.nome).join(", ")}`);
  }

  const ordenados = numerados
    .map(c => ({ c, prioridade: classificarPrioridade(c) }))
    .sort((a, b) => a.prioridade - b.prioridade || a.c.criadoEm - b.c.criadoEm);

  let renomeados = 0;
  for (let i = 0; i < ordenados.length; i++) {
    const { c } = ordenados[i];
    const numero = String(i + 1).padStart(2, "0");
    const resto = c.nome.replace(PREFIXO_REGEX, "");
    const novoNome = `Conjunto ${numero} – ${resto}`;
    if (novoNome === c.nome) continue;
    console.log(`${c.nome} → ${novoNome}`);
    await Conjunto.updateOne({ _id: c._id }, { nome: novoNome });
    renomeados++;
  }

  console.log(`\nConcluído: ${renomeados}/${ordenados.length} conjunto(s) renomeado(s).`);
  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch(err => { console.error(err); process.exit(1); });
}
