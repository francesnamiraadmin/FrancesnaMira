// Correção pela IA no formato do app "Modèles TCF" (nota /20, critérios, trame, correções, léxico,
// connecteurs, versão melhorada, conselho) e a ponte com o Sistema de Correção do site:
//  - corrigirTreino: correção de treino pedida na hora (limite diário, sem crédito);
//  - corrigirProducaoModeles: correção de uma Producao enviada à IA (fila do Sistema de Correção);
//  - garantirTemaSujet: Tema oculto (um por curso × sujet) para a produção seguir o fluxo normal.
// As correções mais importantes vão para o carnet de erros do aluno.
const Tema = require("../models/tema");
const { CorrecaoIATCF, CarnetProducao } = require("../models/modelesTCF");
const M = require("./modelesTCF");
const { pedirJson, iaOuveAudio } = require("./claude");
const fs = require("fs");

// Áudio de um arquivo gravado, para a IA ouvir (até 15 MB, o limite do envio direto).
function lerAudio(caminho, mime) {
  try {
    if (!caminho || !iaOuveAudio()) return undefined;
    const st = fs.statSync(caminho);
    if (!st.size || st.size > 15 * 1024 * 1024) return undefined;
    return { mime: String(mime || "audio/webm").split(";")[0], base64: fs.readFileSync(caminho).toString("base64") };
  } catch (e) { return undefined; }
}
const { avaliar, numeroDaIA } = require("./gradesProva");

const NIVEL_CURSO = { TCF: "B2", DELF: "B2", DALF: "C1", TEF: "B2", A1: "A1", A2: "A2", B1: "B1", B2: "B2" };

async function garantirTemaSujet(courseType, tache, sujetId) {
  const sujet = M.acharTema(tache, sujetId);
  if (!sujet) throw { status: 404, msg: "Sujet introuvable." };
  const slug = `mod-${courseType}-${tache}-${sujetId}`.toLowerCase();
  const existente = await Tema.findOne({ slug });
  if (existente) return existente;
  const oral = !M.ehEscrita(tache);
  const lim = M.LIMITES_ESCRITA[tache];
  const consigne = M.consigneDe(sujet);
  const dados = {
    slug, courseType, catalogo: false, ativo: true, eixo: sujet.e,
    origemModeles: { tache, sujetId },
    titulo: String(sujet.titre || M.temaCurto(consigne) || consigne).slice(0, 160),
    exame: ["TCF", "DELF", "DALF", "TEF"].includes(courseType) ? courseType : undefined,
    nivel: NIVEL_CURSO[courseType] || "B2",
    modalidade: oral ? "oral" : "textual",
    tipoProducao: M.NOMES_TACHE[tache],
    descricao: `${M.NOMES_TACHE[tache]} · axe ${(M.EIXOS.eixos[sujet.e] || {}).nome || sujet.e}`,
    instrucoes: consigne,
    tempoSugerido: oral ? Math.ceil(M.DURACAO_ORAL[tache] / 60) : { ET1: 10, ET2: 15, ET3: 25 }[tache],
    creditosNecessarios: 1,
    coletanea: sujet.d1 ? [
      { tipo: "artigo", titulo: "Document 1", conteudo: sujet.d1 },
      { tipo: "artigo", titulo: "Document 2", conteudo: sujet.d2 }
    ] : []
  };
  if (oral) { dados.tempoMinimoSegundos = 30; dados.tempoMaximoSegundos = M.DURACAO_ORAL[tache] + 60; }
  else { dados.limitePalavrasMin = lim[0]; dados.limitePalavrasMax = lim[1]; }
  try {
    return await Tema.create(dados);
  } catch (err) {
    if (err.code === 11000) return Tema.findOne({ slug }); // outro pedido criou ao mesmo tempo
    throw err;
  }
}

// Chama a IA e devolve a correção no formato do script (r.note, r.criteres, r.corrections…).
// `audio` ({ mime, base64 }): a gravação da produção oral, ouvida pela IA quando o provedor aceita áudio.
async function corrigirTexto(tache, sujet, texte, audio) {
  const comAudio = !!(audio && iaOuveAudio());
  const p = M.promptCorrecao(tache, sujet, texte, comAudio);
  const { json: r, modelo } = await pedirJson({ sistema: p.sistema, usuario: p.usuario, maxTokens: 4000, audio: comAudio ? audio : undefined });
  r.ouviuAudio = comAudio;
  r.note = Math.max(0, Math.min(20, Math.round(numeroDaIA(r.note) * 2) / 2));
  r.nclc = M.nclc(r.note);
  r.mots = p.mots;
  r.limites = p.limites;
  if (r.version_amelioree) r.mots_version = M.contarPalavras(r.version_amelioree);
  r.modelo = modelo;
  return M.semTravessaoObj(r);
}

// Correções da IA → carnet de erros (as 5 mais importantes, como no script) e léxico sugerido.
async function registrarNoCarnet(alunoId, tache, r, { courseType, producaoId, eixo, origem = "ia" } = {}) {
  const itens = (r.corrections || []).filter(c => c && c.original && c.corrige).slice(0, 5).map(c => ({
    alunoId, tipo: "erreur", tache, refId: "E" + Math.random().toString(36).slice(2, 10),
    titre: `${String(c.original).slice(0, 120)} → ${String(c.corrige).slice(0, 120)}`,
    detalhe: String(c.explication || "").slice(0, 300), eixo, courseType, producaoId, origem
  }));
  if (itens.length) await CarnetProducao.insertMany(itens);
}

async function corrigirTreino({ alunoId, tache, sujetId, texte, courseType, modalidade, audio }) {
  const sujet = M.acharTema(tache, sujetId);
  if (!sujet) throw { status: 404, msg: "Sujet introuvable." };
  const r = await corrigirTexto(tache, sujet, texte, audio);
  await CorrecaoIATCF.create({ alunoId, tache, sujetId, sujet: String(sujet.titre || sujet.t || "").slice(0, 300), modalidade: modalidade || (M.ehEscrita(tache) ? "textual" : "oral"),
    mots: r.mots, note: r.note, nclc: r.nclc, texte: String(texte).slice(0, 12000), correcao: r });
  await registrarNoCarnet(alunoId, tache, r, { courseType, eixo: sujet.e });
  return r;
}

// Avaliação de uma Producao do Ambiente de Produção (formato do Sistema de Correção + extras).
async function corrigirProducaoModeles(producao, tema) {
  const tache = producao.origem.tache;
  const sujet = M.acharTema(tache, producao.origem.sujetId);
  if (!sujet) throw new Error("Sujet introuvable.");
  const oral = producao.modalidade === "oral";
  const texte = oral ? (producao.transcricao || "") : (producao.textoDigitado || "");
  const audio = oral ? lerAudio(producao.arquivoOriginal?.caminho, producao.arquivoOriginal?.mimetype) : undefined;
  const r = await corrigirTexto(tache, sujet, texte, audio);
  // Critérios do script ("x/5", na ordem da grade) → grade TCF do site.
  const nota = c => numeroDaIA((c || {}).note);
  const cr = r.criteres || [];
  const ids = oral ? ["tarefa", "coerencia_oral", "lexico", "gramatica"] : ["tarefa", "coerencia", "lexico", "gramatica"];
  const notas = {}, comentarios = {};
  ids.forEach((id, i) => { notas[id] = nota(cr[i]); comentarios[id] = (cr[i] || {}).commentaire || ""; });
  if (oral) { notas.fluencia = notas.coerencia_oral; comentarios.fluencia = (r.ouviuAudio ? "Évalué à partir de l'enregistrement et de la transcription. " : "Estimé à partir de la transcription (la prononciation n'est pas évaluée par l'IA). ") + (comentarios.coerencia_oral || ""); }
  const av = avaliar("TCF", oral ? "oral" : "textual", notas, { nivelAlvo: tema.nivel, notaFinal: r.note, comentarios });
  await CorrecaoIATCF.create({ alunoId: producao.alunoId, tache, sujetId: sujet.id, sujet: String(sujet.titre || sujet.t || "").slice(0, 300), modalidade: producao.modalidade,
    mots: r.mots, note: r.note, nclc: r.nclc, texte: texte.slice(0, 12000), correcao: r, producaoId: producao._id });
  await registrarNoCarnet(producao.alunoId, tache, r, { courseType: tema.courseType, producaoId: producao._id, eixo: sujet.e });
  return {
    exame: av.exame, criterios: av.criterios, notaTotal: av.notaTotal, notaMaxima: av.notaMaxima,
    nivelEstimado: av.nivel, nclc: tema.courseType === "TCF" ? av.nclc : r.nclc, aprovado: av.aprovado, pontuacaoOficial: av.pontuacaoOficial,
    comentarioGeral: String(r.appreciation || "").slice(0, 5000),
    pontosFortes: (r.points_forts || []).slice(0, 5).map(String), aMelhorar: (r.a_ameliorer || []).slice(0, 5).map(String),
    correcoes: (r.corrections || []).slice(0, 15).map(c => ({ trecho: String(c.original || "").slice(0, 400), correcao: String(c.corrige || "").slice(0, 400), explicacao: String(c.explication || "").slice(0, 600) })).filter(c => c.trecho),
    corretor: "ia", corretorNome: "Correção automática (IA)", modelo: r.modelo,
    extras: { trame: r.trame || [], lexique: r.lexique || [], connecteurs: r.connecteurs || [], version_amelioree: r.version_amelioree || "", mots_version: r.mots_version, conseil: r.conseil || "", criteres: cr, note: r.note, limites: r.limites, mots: r.mots }
  };
}

module.exports = { lerAudio, garantirTemaSujet, corrigirTreino, corrigirProducaoModeles, registrarNoCarnet };
