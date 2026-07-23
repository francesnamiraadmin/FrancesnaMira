// =====================================================================
// MIGRAÇÃO ÚNICA — remove os índices únicos antigos que colidem com o novo
// modelo por courseType. Mongoose cria os índices novos automaticamente (via
// autoIndex) mas NUNCA remove os antigos sozinho, então isso precisa rodar
// manualmente antes/depois do deploy.
//
// Sem isso, dois problemas reais em produção:
//   1. Rubrica: o índice antigo único {exame:1,modalidade:1} trata todo
//      documento sem `exame` (novas rubricas de A1-B2) como tendo o mesmo
//      valor (null) — a SEGUNDA rubrica de fluência da mesma modalidade
//      falharia por duplicidade, mesmo tendo courseType diferente.
//   2. Certificado: o índice antigo único {userId:1} permitia só UM
//      certificado por aluno na vida — um aluno que já tem certificado de um
//      curso nunca conseguiria emitir o certificado de um segundo curso.
//
// Idempotente — se o índice antigo já não existir (rodou antes, ou instância
// nova sem esse legado), só loga e segue.
//
// Uso: node backend/seed/dropIndicesAntigos.js
// =====================================================================
require("dotenv").config({ path: __dirname + "/../.env" });
const mongoose = require("mongoose");
const Rubrica = require("../models/rubrica");
const Certificado = require("../models/certificado");

async function dropSeExistir(Model, nomeIndice, descricao) {
  const indices = await Model.collection.indexes();
  const existe = indices.some(i => i.name === nomeIndice);
  if (!existe) {
    console.log(`${Model.modelName}: índice "${nomeIndice}" não existe (nada a fazer) — ${descricao}`);
    return;
  }
  await Model.collection.dropIndex(nomeIndice);
  console.log(`${Model.modelName}: índice "${nomeIndice}" removido — ${descricao}`);
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI);

  await dropSeExistir(Rubrica, "exame_1_modalidade_1", "substituído por courseType_1_modalidade_1");
  await dropSeExistir(Certificado, "userId_1", "substituído por userId_1_courseType_1 (agora 1 certificado por curso)");

  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch(err => { console.error(err); process.exit(1); });
}
