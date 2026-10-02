// Simulados completos de prova (TCF Canada e TCF Tout Public). Definições em backend/data/simulados/*.json,
// geradas a partir de uma fonte com o conteúdo original. Aqui ficam o carregamento, a versão
// pública (sem gabarito) e toda a conversão de resultados para o formato oficial do TCF.
const fs = require("fs");
const path = require("path");

const DIR = path.join(__dirname, "..", "data", "simulados");
// Ordem padrão (TCF Canada). Cada definição pode trazer a sua em `ordem` — o TCF Tout
// Public, por exemplo, tem CO → Structure de la langue → CE e nenhuma expressão.
const PROVAS = ["co", "ce", "ee", "eo"];
const TODAS_PROVAS = ["co", "sl", "ce", "ee", "eo"];
const COMPREENSOES = ["co", "sl", "ce"];
const NOMES_PROVA = { co: "Compréhension orale", sl: "Structure de la langue", ce: "Compréhension écrite", ee: "Expression écrite", eo: "Expression orale" };
const ordemDe = def => (def && def.ordem) || PROVAS;
const ehCompreensao = p => COMPREENSOES.includes(p);
const temExpressoes = def => ordemDe(def).some(p => p === "ee" || p === "eo");
// Exercícios do Ambiente de Produção Oral: mesmo motor, mas fora do catálogo de simulados,
// liberados pelo módulo "producao" do curso e com notas na escala da prova do curso.
const ehExercicio = def => !!def && def.categoria === "exercicio";
const gradesProva = require("./gradesProva");
const NIVEIS_CECR = ["A1", "A2", "B1", "B2", "C1", "C2"];

let cache = null;
function todos() {
  if (!cache) {
    cache = new Map();
    for (const arq of fs.readdirSync(DIR).filter(f => f.endsWith(".json"))) {
      const def = JSON.parse(fs.readFileSync(path.join(DIR, arq), "utf8"));
      cache.set(def.slug, def);
    }
  }
  return cache;
}
const obter = slug => todos().get(slug) || null;

function listar(curso) {
  return [...todos().values()]
    // "oculto": versões retiradas do catálogo (as tentativas antigas continuam abrindo).
    .filter(d => !d.oculto && !ehExercicio(d) && (!curso || d.curso === curso))
    // Ordem natural (nº 2 antes do nº 10), não a alfabética dos arquivos.
    .sort((a, b) => a.slug.localeCompare(b.slug, "pt", { numeric: true }))
    .map(d => ({
      slug: d.slug, titulo: d.titulo, curso: d.curso, formato: d.formato, temExpressoes: temExpressoes(d),
      provas: ordemDe(d).map(p => ({ id: p, nome: d.provas[p].nome, tempoSeg: d.provas[p].tempoSeg, itens: (d.provas[p].questoes || d.provas[p].tarefas).length }))
    }));
}

function listarExercicios(curso) {
  return [...todos().values()]
    .filter(d => ehExercicio(d) && !d.oculto && (!curso || d.curso === curso))
    .sort((a, b) => a.slug.localeCompare(b.slug, "pt", { numeric: true }))
    .map(d => ({
      slug: d.slug, titulo: d.titulo, curso: d.curso, nivel: d.nivel, tema: d.tema, descricao: d.descricao,
      imagem: d.imagem || null, temExpressoes: temExpressoes(d),
      provas: ordemDe(d).map(p => ({ id: p, nome: d.provas[p].nome, tempoSeg: d.provas[p].tempoSeg, itens: (d.provas[p].questoes || d.provas[p].tarefas).length }))
    }));
}

// Remove gabarito, explicações, transcrições e a ficha do examinador (só a equipe vê).
function versaoPublica(def) {
  const c = JSON.parse(JSON.stringify(def));
  for (const p of ordemDe(def).filter(ehCompreensao)) {
    c.provas[p].questoes.forEach(q => {
      delete q.correta; delete q.explicacao; delete q.transcricao;
      // Propostas só faladas (TCF: "Écoutez les 4 propositions"): o texto não pode ir ao aluno.
      if (q.alternativasFaladas) q.alternativas = q.alternativas.map(() => "");
    });
  }
  if (c.provas.eo) c.provas.eo.tarefas.forEach(t => { delete t.fichaExaminador; });
  return c;
}

// ---------------- Escalas oficiais ----------------
// Compreensões: 39 itens ponderados pela dificuldade, total 0–699.
function nivelCompreensao(pontos) {
  if (pontos >= 600) return "C2";
  if (pontos >= 500) return "C1";
  if (pontos >= 400) return "B2";
  if (pontos >= 300) return "B1";
  if (pontos >= 200) return "A2";
  if (pontos >= 100) return "A1";
  return "Inférieur à A1";
}
// Tabelas de equivalência TCF Canada → NCLC (IRCC).
const NCLC_CO = [[549, "10+"], [523, "9"], [503, "8"], [458, "7"], [398, "6"], [369, "5"], [331, "4"]];
const NCLC_CE = [[549, "10+"], [524, "9"], [499, "8"], [453, "7"], [406, "6"], [375, "5"], [342, "4"]];
const NCLC_EXPR = [[16, "10+"], [14, "9"], [12, "8"], [10, "7"], [7, "6"], [6, "5"], [4, "4"]];
const nclc = (tabela, v) => (tabela.find(([min]) => v >= min) || [0, "< 4"])[1];

function nivelExpressao(nota) {
  if (nota >= 16) return "C2";
  if (nota >= 14) return "C1";
  if (nota >= 10) return "B2";
  if (nota >= 6) return "B1";
  if (nota >= 4) return "A2";
  if (nota >= 1) return "A1";
  return "Inférieur à A1";
}

function corrigirCompreensao(def, prova, respostas = {}) {
  const questoes = def.provas[prova].questoes;
  let pontos = 0, acertos = 0, maximo = 0;
  const porNivel = {};
  const detalhes = questoes.map(q => {
    const r = respostas[q.n];
    const certo = Number.isInteger(r) && r === q.correta;
    maximo += q.pontos;
    if (certo) { pontos += q.pontos; acertos++; }
    porNivel[q.nivel] = porNivel[q.nivel] || { acertos: 0, total: 0 };
    porNivel[q.nivel].total++;
    if (certo) porNivel[q.nivel].acertos++;
    return { n: q.n, resposta: Number.isInteger(r) ? r : null, correta: q.correta, certo };
  });
  // TCF Canada: 39 itens somam exatamente 699. Livrets mais curtos (TCF Tout Public)
  // convertem a proporção de pontos obtidos para a mesma escala 0–699.
  // (também por prova: a CE com lacunas de "structure de la langue" tem 49 itens).
  if (ehExercicio(def)) {
    const teto = NIVEIS_CECR.filter(n => questoes.some(q => q.nivel === n)).pop();
    const r = gradesProva.resultadoCompreensao(def.curso, pontos, maximo, def.nivel, teto);
    return {
      pontos: r.pontos, escala: r.escala, acertos, total: questoes.length, nivel: r.nivel || nivelCompreensao(r.pontos),
      nclc: r.nclc, aprovado: r.aprovado, porNivel, detalhes
    };
  }
  if (def.escala === "proporcional" || def.provas[prova].escala === "proporcional") pontos = Math.round((pontos / maximo) * 699);
  const tabelaNclc = def.formato === "TCF Canada" ? (prova === "co" ? NCLC_CO : prova === "ce" ? NCLC_CE : null) : null;
  return {
    pontos, acertos, total: questoes.length, nivel: nivelCompreensao(pontos),
    nclc: tabelaNclc ? nclc(tabelaNclc, pontos) : null, porNivel, detalhes
  };
}

// ---------------- Expressões: grade de 4 critérios (0–5) por tarefa ----------------
const CRITERIOS = {
  ee: [
    { id: "tarefa", nome: "Réalisation de la tâche" },
    { id: "coerencia", nome: "Cohérence et cohésion" },
    { id: "lexico", nome: "Lexique" },
    { id: "gramatica", nome: "Morphosyntaxe" }
  ],
  eo: [
    { id: "tarefa", nome: "Réalisation de la tâche / interaction" },
    { id: "lexico", nome: "Lexique" },
    { id: "gramatica", nome: "Morphosyntaxe" },
    { id: "fluencia", nome: "Aisance et phonologie" }
  ]
};

// Nomes dos 4 critérios conforme a prova do exercício (os ids não mudam: professor, IA e
// tela de resultado continuam iguais). DELF/DALF/TEF convertem a nota /20 para a própria escala.
const NOMES_CRITERIOS = {
  DELF: {
    ee: { tarefa: "Respect de la consigne et capacité à informer / argumenter", coerencia: "Cohérence et cohésion", lexico: "Compétence lexicale", gramatica: "Compétence grammaticale" },
    eo: { tarefa: "Réalisation de la tâche (monologue et interaction)", lexico: "Lexique", gramatica: "Morphosyntaxe", fluencia: "Maîtrise du système phonologique" }
  },
  DALF: {
    ee: { tarefa: "Respect de la consigne et argumentation", coerencia: "Cohérence et cohésion", lexico: "Compétence lexicale", gramatica: "Compétence grammaticale" },
    eo: { tarefa: "Exposé et débat", lexico: "Lexique", gramatica: "Morphosyntaxe", fluencia: "Phonologie et aisance" }
  },
  TEF: {
    ee: { tarefa: "Respect de la tâche et structure", coerencia: "Argumentation et cohérence", lexico: "Richesse lexicale", gramatica: "Correction grammaticale" },
    eo: { tarefa: "Obtenir des informations / convaincre", lexico: "Lexique et correction", gramatica: "Interaction et cohérence", fluencia: "Fluidité et prononciation" }
  }
};
function criteriosDe(def) {
  const nomes = ehExercicio(def) ? NOMES_CRITERIOS[def.curso] : null;
  if (!nomes) return CRITERIOS;
  return Object.fromEntries(Object.entries(CRITERIOS).map(([p, lista]) => [p, lista.map(c => ({ ...c, nome: nomes[p]?.[c.id] || c.nome }))]));
}

// a nota pode vir da IA como "4/5" ou "3,5": numeroDaIA lê qualquer forma
const limitar = (v, min, max) => Math.min(max, Math.max(min, require("./gradesProva").numeroDaIA(v)));

// Recebe {tarefas: {t1: {criterios: {tarefa: 0–5, ...}, comentario}}, nota?, comentario}
// e devolve o resultado normalizado: nota por tarefa (0–20), nota final 0–20 (média das
// tarefas, ou a nota final informada pelo corretor) + nível CECR e NCLC.
function montarResultadoExpressao(prova, def, entrada = {}, meta = {}) {
  const tarefasDef = def.provas[prova].tarefas;
  const tarefas = {};
  const notas = [];
  for (const t of tarefasDef) {
    const e = entrada.tarefas?.[t.id] || {};
    const criterios = {};
    let soma = 0;
    for (const c of CRITERIOS[prova]) {
      const v = Math.round(limitar(e.criterios?.[c.id], 0, 5) * 2) / 2;
      criterios[c.id] = v;
      soma += v;
    }
    const notaTarefa = Math.round(soma * 10) / 10; // 4 critérios × 5 = 20
    notas.push(notaTarefa);
    tarefas[t.id] = { criterios, nota: notaTarefa, comentario: String(e.comentario || "").slice(0, 3000) };
  }
  const media = Math.round(notas.reduce((s, n) => s + n, 0) / notas.length);
  const nota = entrada.nota != null && entrada.nota !== "" ? Math.round(limitar(entrada.nota, 0, 20)) : media;
  if (ehExercicio(def) && def.curso !== "TCF") {
    // Nota interna /20 → escala da prova do curso (DELF/DALF /25, TEF 0–450, A1–B2 modelo TCF).
    const exame = gradesProva.exameDoCurso(def.curso);
    const max = exame === "DELF" || exame === "DALF" ? 25 : 20;
    const notaProva = Math.round((nota / 20) * max * 2) / 2;
    const conv = gradesProva.interpretarExpressao(def.curso, notaProva, max, def.nivel);
    const tef = exame === "TEF"; // TEF: mostra direto a pontuação oficial 0–450
    return {
      tarefas, nota, media, notaProva: tef ? conv.pontuacaoOficial : notaProva, notaMaximaProva: tef ? 450 : max, pontuacaoOficial: conv.pontuacaoOficial, aprovado: conv.aprovado,
      nivel: exame === "TCF" ? nivelExpressao(nota) : conv.nivel, nclc: conv.nclc,
      comentario: String(entrada.comentario || "").slice(0, 5000),
      corretor: meta.corretor || null, corretorNome: meta.corretorNome || null, porIA: !!meta.porIA,
      corrigidoEm: new Date()
    };
  }
  return {
    tarefas, nota, media, nivel: nivelExpressao(nota), nclc: nclc(NCLC_EXPR, nota),
    comentario: String(entrada.comentario || "").slice(0, 5000),
    corretor: meta.corretor || null, corretorNome: meta.corretorNome || null, porIA: !!meta.porIA,
    corrigidoEm: new Date()
  };
}

const contarPalavras = t => (String(t || "").match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || []).length;

module.exports = {
  PROVAS, TODAS_PROVAS, NOMES_PROVA, CRITERIOS, criteriosDe, ordemDe, ehCompreensao, temExpressoes, ehExercicio,
  obter, listar, listarExercicios, versaoPublica, corrigirCompreensao,
  montarResultadoExpressao, nivelCompreensao, nivelExpressao, contarPalavras
};
