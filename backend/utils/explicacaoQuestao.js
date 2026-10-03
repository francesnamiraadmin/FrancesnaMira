// Gabarito comentado das questões (Praticar e Simulação Completa): por que a alternativa certa está
// certa, as pegadinhas de cada alternativa errada e dicas para questões parecidas. Gerado pela IA na
// primeira vez que um aluno abre o gabarito e guardado (uma vez por questão, para todos os alunos).
const mongoose = require("mongoose");
const { pedirJson, iaConfigurada } = require("./claude");

const ExplicacaoQuestao = mongoose.models.ExplicacaoQuestao || mongoose.model("ExplicacaoQuestao", new mongoose.Schema({
  chave: { type: String, required: true, unique: true },   // "q:<id>" (Praticar) ou "s:<slug>:<prova>:<n>" (simulado)
  dados: { type: mongoose.Schema.Types.Mixed, required: true },
  modelo: String,
  criadoEm: { type: Date, default: Date.now }
}));

const emAndamento = new Map();   // dois alunos pedindo a mesma questão ao mesmo tempo: uma chamada só
const LETRAS = ["A", "B", "C", "D", "E"];

// q: { enunciado, texto, transcricao, alternativas[], correta (índice), explicacao, nivel, prova }
async function explicar(chave, q) {
  const pronta = await ExplicacaoQuestao.findOne({ chave }).lean();
  if (pronta) return pronta.dados;
  if (!iaConfigurada()) throw Object.assign(new Error("A explicação detalhada usa a IA, que não está configurada."), { status: 503 });
  if (emAndamento.has(chave)) return emAndamento.get(chave);
  const p = (async () => {
    const alts = (q.alternativas || []).map((a, i) => `${LETRAS[i]}. ${a}`).join("\n");
    const sistema = "Tu es professeur de FLE chez Français na Mira, spécialiste des examens (TCF, TEF, DELF, DALF). Tu expliques le corrigé d'une question à choix multiple à un apprenant brésilien. " +
      "Tu écris en portugais du Brésil (les mots et phrases français restent en français, entre guillemets). Tu es précis, bienveillant et concret. Dans les textes, cite les alternatives par leur contenu entre guillemets, jamais seulement par la lettre (l'élève peut les voir dans un autre ordre). Réponds UNIQUEMENT avec un objet JSON valide.";
    const usuario = [
      q.prova ? `Épreuve : ${q.prova}${q.nivel ? " · niveau " + q.nivel : ""}.` : q.nivel ? `Niveau : ${q.nivel}.` : "",
      q.texto ? "DOCUMENT :\n" + String(q.texto).slice(0, 4000) : "",
      q.transcricao ? "TRANSCRIPTION DE L'AUDIO :\n" + String(q.transcricao).slice(0, 4000) : "",
      "QUESTION : " + (q.enunciado || ""),
      alts ? "ALTERNATIVES :\n" + alts : "",
      `BONNE RÉPONSE : ${q.alternativas && q.alternativas.length ? LETRAS[q.correta] + ". " + q.alternativas[q.correta] : String(q.respostaCorreta)}`,
      q.explicacao ? "EXPLICATION COURTE EXISTANTE : " + q.explicacao : "",
      "Réponds avec ce JSON (en portugais) :",
      '{"porque": "por que a alternativa certa está certa, citando o trecho do documento/áudio que prova (2 a 4 frases)",',
      ' "pegadinhas": [{"alternativa": "letra", "motivo": "por que é tentadora e por que está errada"}] (uma para cada alternativa errada),',
      ' "dicas": ["dica prática para acertar questões parecidas na prova"] (2 ou 3)}'
    ].filter(Boolean).join("\n\n");
    const { json, modelo } = await pedirJson({ sistema, usuario, maxTokens: 1500 });
    const dados = {
      porque: String(json.porque || "").slice(0, 1500),
      pegadinhas: (Array.isArray(json.pegadinhas) ? json.pegadinhas : []).slice(0, 5)
        .map(x => {
          const letra = String(x?.alternativa || "").trim().slice(0, 1).toUpperCase(), i = LETRAS.indexOf(letra);
          // o texto da alternativa acompanha a letra (no Praticar as alternativas aparecem embaralhadas e sem letra)
          return { alternativa: letra, texto: i >= 0 && q.alternativas ? String(q.alternativas[i] || "").slice(0, 300) : "", motivo: String(x?.motivo || "").slice(0, 600) };
        }).filter(x => x.motivo),
      dicas: (Array.isArray(json.dicas) ? json.dicas : []).slice(0, 4).map(x => String(x).slice(0, 400)).filter(Boolean)
    };
    if (!dados.porque) throw new Error("Explicação incompleta.");
    await ExplicacaoQuestao.updateOne({ chave }, { $setOnInsert: { chave, dados, modelo } }, { upsert: true });
    return dados;
  })();
  emAndamento.set(chave, p);
  try { return await p; } finally { emAndamento.delete(chave); }
}

module.exports = { explicar, ExplicacaoQuestao };
