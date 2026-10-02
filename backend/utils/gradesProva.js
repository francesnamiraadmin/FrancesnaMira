// Grades de correção por prova — fonte única para a produção textual (IA e professor) e
// para as tarefas de expressão dos exercícios do Ambiente de Produção.
//
// TCF: 4 critérios de 0 a 5 (nota /20), nível CECR e NCLC pela tabela do TCF Canada.
// DELF / DALF: grade /25 no modelo das grilles officielles (seção aprovada com 12,5/25).
// TEF: 4 critérios /20 convertidos para a escala do TEF Canada (0–450) e NCLC.
// Cursos de fluência (A1, A2, B1, B2) seguem o modelo do TCF.

const EXAMES_PROPRIOS = ["TCF", "DELF", "DALF", "TEF"];
const exameDoCurso = curso => (EXAMES_PROPRIOS.includes(curso) ? curso : "TCF");

const GRADES = {
  TCF: {
    notaMaxima: 20,
    textual: [
      { id: "tarefa", nome: "Réalisation de la tâche", max: 5, descricao: "Respeita a consigne, o gênero, o destinatário e o número de palavras; desenvolve as ideias pedidas." },
      { id: "coerencia", nome: "Cohérence et cohésion", max: 5, descricao: "Organização em parágrafos, progressão lógica e uso de articuladores." },
      { id: "lexico", nome: "Lexique", max: 5, descricao: "Variedade, precisão e adequação do vocabulário; ortografia lexical." },
      { id: "gramatica", nome: "Morphosyntaxe", max: 5, descricao: "Correção das estruturas, tempos, modos, concordâncias e ortografia gramatical." }
    ],
    oral: [
      { id: "tarefa", nome: "Réalisation de la tâche / interaction", max: 5, descricao: "Responde ao que é pedido, desenvolve e sustenta a interação." },
      { id: "lexico", nome: "Lexique", max: 5, descricao: "Variedade e adequação do vocabulário ao tema e à situação." },
      { id: "gramatica", nome: "Morphosyntaxe", max: 5, descricao: "Correção e variedade das estruturas." },
      { id: "fluencia", nome: "Aisance et phonologie", max: 5, descricao: "Fluidez, ritmo, pronúncia e entonação." }
    ]
  },
  DELF: {
    notaMaxima: 25,
    textual: [
      { id: "consigne", nome: "Respect de la consigne", max: 2, descricao: "Gênero, situação, destinatário e extensão pedidos." },
      { id: "sociolinguistique", nome: "Correction sociolinguistique", max: 2, descricao: "Registro e fórmulas adequados à situação (tu/vous, saudações, despedidas)." },
      { id: "contenu", nome: "Capacité à informer, décrire ou argumenter", max: 5, descricao: "Apresenta fatos, descreve e, nos níveis B, argumenta uma posição de forma convincente." },
      { id: "coherence", nome: "Cohérence et cohésion", max: 3, descricao: "Texto organizado, com articuladores e pontuação adequados." },
      { id: "lexique", nome: "Compétence lexicale / orthographe lexicale", max: 6, descricao: "Extensão e domínio do vocabulário, ortografia das palavras." },
      { id: "grammaire", nome: "Compétence grammaticale / orthographe grammaticale", max: 7, descricao: "Estruturas, tempos e modos, concordâncias e grau de elaboração das frases." }
    ],
    oral: [
      { id: "tache", nome: "Réalisation de la tâche (monologue)", max: 7, descricao: "Apresenta e desenvolve o tema pedido de forma clara e organizada." },
      { id: "interaction", nome: "Interaction / défense d'un point de vue", max: 6, descricao: "Reage, responde, argumenta e sustenta a troca." },
      { id: "lexique", nome: "Lexique", max: 4, descricao: "Extensão e domínio do vocabulário." },
      { id: "morphosyntaxe", nome: "Morphosyntaxe", max: 5, descricao: "Correção e variedade das estruturas gramaticais." },
      { id: "phonologie", nome: "Maîtrise du système phonologique", max: 3, descricao: "Pronúncia, ritmo e entonação." }
    ]
  },
  DALF: {
    notaMaxima: 25,
    textual: [
      { id: "consigne", nome: "Respect de la consigne et du format", max: 3, descricao: "Gênero (synthèse, essai, lettre formelle), extensão e destinatário." },
      { id: "contenu", nome: "Traitement des documents et argumentation", max: 6, descricao: "Restitui e reorganiza as informações; argumenta com nuance e exemplos." },
      { id: "coherence", nome: "Cohérence et cohésion", max: 4, descricao: "Plano claro, transições e articulação fina do discurso." },
      { id: "lexique", nome: "Compétence lexicale", max: 6, descricao: "Vocabulário amplo, preciso e idiomático; ortografia." },
      { id: "grammaire", nome: "Compétence grammaticale", max: 6, descricao: "Estruturas complexas dominadas, poucos erros." }
    ],
    oral: [
      { id: "expose", nome: "Exposé : organisation et contenu", max: 8, descricao: "Problemática, plano e desenvolvimento a partir dos documentos." },
      { id: "debat", nome: "Débat : interaction et argumentation", max: 6, descricao: "Defende, precisa e nuança suas posições diante do examinador." },
      { id: "lexique", nome: "Lexique", max: 4, descricao: "Vocabulário amplo e preciso." },
      { id: "morphosyntaxe", nome: "Morphosyntaxe", max: 4, descricao: "Domínio das estruturas complexas." },
      { id: "phonologie", nome: "Phonologie et aisance", max: 3, descricao: "Pronúncia, fluidez e prosódia." }
    ]
  },
  TEF: {
    notaMaxima: 20,
    textual: [
      { id: "tache", nome: "Respect de la tâche et structure du texte", max: 5, descricao: "Segue a consigne (continuação de fait divers ou carta argumentativa) e organiza o texto." },
      { id: "argumentation", nome: "Argumentation et cohérence", max: 5, descricao: "Ideias desenvolvidas, justificadas e bem encadeadas." },
      { id: "lexique", nome: "Richesse et précision lexicales", max: 5, descricao: "Vocabulário variado e adequado." },
      { id: "grammaire", nome: "Correction grammaticale", max: 5, descricao: "Morfossintaxe e ortografia." }
    ],
    oral: [
      { id: "tache", nome: "Réalisation de la tâche (obtenir des informations / convaincre)", max: 5, descricao: "Faz as perguntas certas (seção A) ou convence o interlocutor (seção B)." },
      { id: "interaction", nome: "Interaction et cohérence", max: 5, descricao: "Mantém a troca, reage e encadeia as ideias." },
      { id: "lexique", nome: "Lexique et correction", max: 5, descricao: "Vocabulário e gramática adequados." },
      { id: "fluidite", nome: "Fluidité et prononciation", max: 5, descricao: "Ritmo, pronúncia e naturalidade." }
    ]
  }
};

// ---------------- níveis e equivalências ----------------
const NCLC_TCF_EXPR = [[16, "10+"], [14, "9"], [12, "8"], [10, "7"], [7, "6"], [6, "5"], [4, "4"]];
const NCLC_TEF_EXPR = [[393, "10+"], [371, "9"], [349, "8"], [310, "7"], [271, "6"], [226, "5"], [181, "4"]];
const NCLC_TEF_CO = [[316, "10+"], [298, "9"], [280, "8"], [249, "7"], [217, "6"], [181, "5"], [145, "4"]];
const NCLC_TCF_CO = [[549, "10+"], [523, "9"], [503, "8"], [458, "7"], [398, "6"], [369, "5"], [331, "4"]];
const nclc = (tabela, v) => (tabela.find(([min]) => v >= min) || [0, "< 4"])[1];

function cecrTcfExpressao(nota) {
  if (nota >= 16) return "C2";
  if (nota >= 14) return "C1";
  if (nota >= 10) return "B2";
  if (nota >= 6) return "B1";
  if (nota >= 4) return "A2";
  if (nota >= 1) return "A1";
  return "Inférieur à A1";
}
function cecrTcfCompreensao(p) {
  if (p >= 600) return "C2";
  if (p >= 500) return "C1";
  if (p >= 400) return "B2";
  if (p >= 300) return "B1";
  if (p >= 200) return "A2";
  if (p >= 100) return "A1";
  return "Inférieur à A1";
}

const arred = (v, casas = 1) => Math.round(v * 10 ** casas) / 10 ** casas;
// Número de uma nota vinda da IA, em qualquer forma: 9, "9", "9/20", "8,5", "8.5 points".
function numeroDaIA(v) {
  if (typeof v === "number") return isFinite(v) ? v : 0;
  const m = String(v ?? "").replace(",", ".").match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : 0;
}
const limitar = (v, min, max) => Math.min(max, Math.max(min, numeroDaIA(v)));

function grade(curso, modalidade) {
  const exame = exameDoCurso(curso);
  const g = GRADES[exame];
  return { exame, curso, modalidade: modalidade === "oral" ? "oral" : "textual", notaMaxima: g.notaMaxima, criterios: g[modalidade === "oral" ? "oral" : "textual"] };
}

// Descrição do resultado de uma expressão (nota já somada) no formato da prova.
function interpretarExpressao(curso, nota, notaMaxima, nivelAlvo) {
  const exame = exameDoCurso(curso);
  if (exame === "DELF" || exame === "DALF") {
    const aprovado = nota >= notaMaxima / 2;
    return {
      escala: `${notaMaxima}`, aprovado,
      nivel: nivelAlvo ? `${exame} ${nivelAlvo} · ${aprovado ? "seção aprovada" : "abaixo de 12,5/25"}` : (aprovado ? "Seção aprovada" : "Abaixo de 12,5/25"),
      nclc: null, pontuacaoOficial: null
    };
  }
  if (exame === "TEF") {
    const oficial = Math.round((nota / notaMaxima) * 450);
    return { escala: "20", aprovado: null, nivel: `TEF ${oficial}/450`, nclc: nclc(NCLC_TEF_EXPR, oficial), pontuacaoOficial: oficial };
  }
  const n20 = (nota / notaMaxima) * 20;
  return { escala: "20", aprovado: null, nivel: cecrTcfExpressao(n20), nclc: curso === "TCF" ? nclc(NCLC_TCF_EXPR, n20) : null, pontuacaoOficial: null };
}

// Monta a avaliação a partir das notas por critério ({id: valor}). Valores são limitados ao
// máximo de cada critério (meio ponto). `notaFinal` (opcional) substitui a soma.
function avaliar(curso, modalidade, notas = {}, { nivelAlvo, notaFinal, comentarios = {} } = {}) {
  const g = grade(curso, modalidade);
  const criterios = g.criterios.map(c => ({
    id: c.id, nome: c.nome, max: c.max,
    nota: Math.round(limitar(notas[c.id], 0, c.max) * 2) / 2,
    comentario: String(comentarios[c.id] || "").slice(0, 2000)
  }));
  const soma = arred(criterios.reduce((t, c) => t + c.nota, 0));
  const notaTotal = notaFinal !== undefined && notaFinal !== null && notaFinal !== "" ? arred(limitar(notaFinal, 0, g.notaMaxima)) : soma;
  return { exame: g.exame, criterios, notaTotal, notaMaxima: g.notaMaxima, ...interpretarExpressao(curso, notaTotal, g.notaMaxima, nivelAlvo) };
}

// Compreensão (questões de múltipla escolha ponderadas) na escala de cada prova.
// nivelTeto: nível mais alto entre as questões do exercício. No modelo TCF, 5 questões de
// nível A1 não demonstram um C2: a pontuação é proporcional até o topo da faixa desse nível.
const TETO_TCF = { A1: 199, A2: 299, B1: 399, B2: 499, C1: 599, C2: 699 };
function resultadoCompreensao(curso, pontos, maximo, nivelAlvo, nivelTeto) {
  const exame = exameDoCurso(curso);
  const prop = maximo ? pontos / maximo : 0;
  if (exame === "DELF" || exame === "DALF") {
    const nota = arred(prop * 25);
    return { escala: 25, pontos: nota, aprovado: nota >= 12.5, nivel: nivelAlvo ? `${exame} ${nivelAlvo} · ${nota >= 12.5 ? "seção aprovada" : "abaixo de 12,5/25"}` : null, nclc: null };
  }
  if (exame === "TEF") {
    const p = Math.round(prop * 360);
    return { escala: 360, pontos: p, aprovado: null, nivel: `TEF ${p}/360`, nclc: nclc(NCLC_TEF_CO, p) };
  }
  const p = Math.round(prop * (TETO_TCF[nivelTeto] || 699));
  return { escala: 699, pontos: p, aprovado: null, nivel: cecrTcfCompreensao(p), nclc: curso === "TCF" ? nclc(NCLC_TCF_CO, p) : null };
}

module.exports = { numeroDaIA, GRADES, grade, avaliar, interpretarExpressao, resultadoCompreensao, exameDoCurso };
