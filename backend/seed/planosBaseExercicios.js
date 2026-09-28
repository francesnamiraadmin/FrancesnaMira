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
    nome: "Deveres completos · Parcours A1 (8 semanas)",
    curso: "A1",
    descricao: "Programa J1 a J8 do journal de classe: regulamento, fonética, être et avoir, o tempo, preposições, números, pronomes, família, simulado DELF A2, interrogativos, possessivos, adjetivos, negação, a cidade, c'est/il est e artigos.",
    semanas: [
      { numero: 1, titulo: "J1 · Règlement, phonétique, être et avoir", atividades: [
        atividade("j1-reglement"),
        atividade("phonetique", { dependeDe: 0 }),
        atividade("j1-etre-et-avoir", { dependeDe: 0 }),
        atividade("vocabulaire-hebdomadaire", { dependeDe: 0 })
      ] },
      { numero: 2, titulo: "J2 · Le temps et les prépositions", atividades: [atividade("le-calendrier"), atividade("les-prepositions")] },
      { numero: 3, titulo: "J3 · Les nombres et les pronoms toniques", atividades: [atividade("les-nombres"), atividade("les-pronoms")] },
      { numero: 4, titulo: "J4 · La famille et simulation DELF", atividades: [atividade("la-famille"), atividade("simulation-delf-a2-1")] },
      { numero: 5, titulo: "J5 · Les mots interrogatifs et les possessifs", atividades: [atividade("les-interrogatifs"), atividade("les-possessifs")] },
      { numero: 6, titulo: "J6 · Les adjectifs et la négation", atividades: [atividade("les-adjectifs"), atividade("la-negation")] },
      { numero: 7, titulo: "J7 · La ville, les loisirs et c'est / il est", atividades: [atividade("la-ville"), atividade("cest-vs-il-est")] },
      { numero: 8, titulo: "J8 · Les articles", atividades: [atividade("les-articles")] }
    ]
  },
  {
    nome: "Deveres completos · Atelier Dictée TCF",
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
