// =====================================================================
// Cria/atualiza os Planos-Base que usam os exercícios interativos
// (backend/data/exercicios). Idempotente: procura cada plano pelo nome e
// só substitui as semanas — nunca mexe em outros planos nem nos deveres já
// gerados para alunos. Rode com --simular para só mostrar o que faria.
// Uso:
//   node backend/seed/planosBaseExercicios.js [--simular]
// =====================================================================
require("dotenv").config({ path: __dirname + "/../.env" });
const mongoose = require("mongoose");
const PlanoBase = require("../models/planoBase");
const ex = require("../utils/exercicios");

const simular = process.argv.includes("--simular");

// Atividade do tipo exercício interativo, com o título e a descrição do próprio exercício.
function atividade(slug, extra = {}) {
  const def = ex.obter(slug);
  if (!def) throw new Error("Exercício inexistente: " + slug);
  return {
    tipo: "exercicio_interativo", titulo: def.titulo, descricao: def.descricao,
    obrigatoria: true, dependeDe: null, conteudo: { exercicioSlug: slug }, ...extra
  };
}

const PLANOS = [
  {
    nome: "Parcours A1 · Francês na Mira",
    curso: "A1",
    descricao: "Programa das primeiras semanas (J1 a J5): regulamento, être et avoir, números, vocabulário, preposições, artigos, a cidade e um simulado DELF A2.",
    semanas: [
      { numero: 1, titulo: "J1 · Règlement, être et avoir", atividades: [
        atividade("j1-reglement"),
        atividade("j1-etre-et-avoir", { dependeDe: 0 }),
        atividade("vocabulaire-hebdomadaire", { dependeDe: 0 })
      ] },
      { numero: 2, titulo: "J2 · Les nombres et les prépositions", atividades: [
        atividade("les-nombres"),
        atividade("les-prepositions")
      ] },
      { numero: 3, titulo: "J3 · Les articles", atividades: [atividade("les-articles")] },
      { numero: 4, titulo: "J4 · La ville, les commerces et les loisirs", atividades: [atividade("la-ville")] },
      { numero: 5, titulo: "J5 · Simulation DELF A2", atividades: [atividade("simulation-delf-a2-1")] }
    ]
  },
  {
    nome: "Atelier Dictée · TCF",
    curso: "TCF",
    descricao: "Ditado frase a frase de textos modelo do TCF (tâches 1, 2 e 3), com as expressões-chave anotadas.",
    semanas: [
      { numero: 1, titulo: "Dictée · Modèles TCF", atividades: [atividade("dictee-tcf")] }
    ]
  }
];

(async () => {
  if (simular) {
    PLANOS.forEach(p => {
      console.log(`\n${p.nome} [${p.curso}] — ${p.semanas.length} semana(s)`);
      p.semanas.forEach(s => console.log(`  Semana ${s.numero}: ${s.titulo} → ${s.atividades.map(a => a.conteudo.exercicioSlug).join(", ")}`));
    });
    return;
  }
  await mongoose.connect(process.env.MONGO_URI);
  for (const p of PLANOS) {
    const existente = await PlanoBase.findOne({ nome: p.nome });
    if (existente) {
      existente.set({ curso: p.curso, descricao: p.descricao, semanas: p.semanas, ativo: true });
      await existente.save();
      console.log("Atualizado:", p.nome);
    } else {
      await PlanoBase.create(p);
      console.log("Criado:", p.nome);
    }
  }
  await mongoose.disconnect();
})().catch(err => { console.error(err); process.exit(1); });
