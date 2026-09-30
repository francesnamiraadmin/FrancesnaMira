// Sincroniza os temas versionados (backend/data/temas/*.json) com a coleção Tema, na subida
// do servidor. Cada tema tem `slug` estável: cria se não existe, atualiza o conteúdo se
// mudou. As produções dos alunos apontam para o _id do Tema, que nunca muda aqui.
// Temas criados pelo admin (sem slug) não são tocados.
const fs = require("fs");
const path = require("path");
const Tema = require("../models/tema");

const DIR = path.join(__dirname, "..", "data", "temas");

function lerTemas() {
  if (!fs.existsSync(DIR)) return [];
  return fs.readdirSync(DIR).filter(f => f.endsWith(".json"))
    .flatMap(f => JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")));
}

async function sincronizarTemas() {
  const temas = lerTemas();
  if (!temas.length) return { total: 0 };
  const ops = temas.map(t => ({
    updateOne: { filter: { slug: t.slug }, update: { $set: { ...t, ativo: t.ativo !== false } }, upsert: true }
  }));
  const r = await Tema.bulkWrite(ops, { ordered: false });
  return { total: temas.length, criados: r.upsertedCount, atualizados: r.modifiedCount };
}

module.exports = { sincronizarTemas, lerTemas };
