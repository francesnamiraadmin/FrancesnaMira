// Correção das expressões escrita e oral por IA (API da Anthropic). Configuração no .env
// / Railway: ANTHROPIC_API_KEY (obrigatória) e ANTHROPIC_MODEL (opcional).
// A IA devolve a mesma grade usada pelo professor (4 critérios de 0 a 5 por tarefa),
// então a nota final sai no formato TCF (0–20 → CECR e NCLC) pelo mesmo cálculo.
const sim = require("./simulados");

const MODELO_PADRAO = "claude-sonnet-5";
const iaConfigurada = () => !!process.env.ANTHROPIC_API_KEY;

function montarPrompt(def, tentativa) {
  const tem = p => sim.ordemDe(def).includes(p);
  const ee = !tem("ee") ? "" : def.provas.ee.tarefas.map(t => {
    const texto = String(tentativa.provas.ee.respostas?.[t.id] || "").trim();
    const docs = (t.documentos || []).map(d => `${d.titulo}\n${d.texto}`).join("\n\n");
    return `### EE ${t.id} — ${t.titulo} (${t.min}–${t.max} mots)\nConsigne : ${t.consigne}${docs ? "\n\n" + docs : ""}\n\nProduction du candidat (${sim.contarPalavras(texto)} mots) :\n"""\n${texto || "(aucune réponse)"}\n"""`;
  }).join("\n\n");
  const eo = !tem("eo") ? "" : def.provas.eo.tarefas.map(t => {
    const tr = String(tentativa.provas.eo.respostas?.[t.id]?.transcricao || "").trim();
    return `### EO ${t.id} — ${t.titulo} (${Math.round(t.duracaoSeg / 60 * 10) / 10} min)\nConsigne : ${t.consigne}\n\nTranscription automatique de la réponse orale :\n"""\n${tr || "(aucune transcription disponible)"}\n"""`;
  }).join("\n\n");

  const crits = sim.criteriosDe(def);
  const crit = p => crits[p].map(c => `"${c.id}" (${c.nome})`).join(", ");
  const exame = sim.ehExercicio(def) ? ({ DELF: "DELF", DALF: "DALF", TEF: "TEF", TCF: "TCF Canada" }[def.curso] || `français niveau ${def.nivel} (grille du TCF)`) : "TCF Canada";
  return `Tu es examinateur certifié du ${exame}. Évalue les productions ci-dessous exactement comme lors de l'examen officiel${sim.ehExercicio(def) ? `, pour le niveau visé ${def.nivel}` : ""}.

Pour CHAQUE tâche, attribue une note de 0 à 5 (demi-points autorisés) à chacun des 4 critères :
- Expression écrite : ${crit("ee")}
- Expression orale : ${crit("eo")}
La somme des 4 critères donne la note de la tâche sur 20. Repères : 20/20 ≈ C2 maîtrisé ; 16 ≈ C2 ; 14 ≈ C1 ; 10–13 ≈ B2 ; 6–9 ≈ B1 ; 4–5 ≈ A2 ; 1–3 ≈ A1.
Sanctionne : le non-respect de la consigne, un nombre de mots hors limites (fortement en dessous = pénalité sur "tarefa"), le hors-sujet, l'absence de réponse (0 partout).
Pour l'oral, tu ne disposes que d'une transcription automatique : juge l'aisance à partir de la continuité et de la longueur du discours, n'invente pas d'erreurs de prononciation ; les petites fautes de transcription ne doivent pas être comptées comme des fautes du candidat.

Rédige les commentaires EN PORTUGAIS DU BRÉSIL (le candidat est brésilien), concrets : 2 points forts, 2 points à améliorer, et 1 ou 2 corrections d'erreurs réelles citées entre guillemets avec la forme correcte.

${ee}

${eo}

Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, de la forme :
${formatoJson(def, tem)}`;
}

// Exemplo do JSON esperado, só com as provas e tarefas que existem nesta definição.
function formatoJson(def, tem) {
  const zeros = p => "{" + sim.criteriosDe(def)[p].map(c => `"${c.id}":0`).join(",") + "}";
  const bloco = (p, nome) => `"${p}":{"tarefas":{${def.provas[p].tarefas.map(t => `"${t.id}":{"criterios":${zeros(p)},"comentario":"..."}`).join(",")}},"comentario":"bilan général de l'${nome}"}`;
  return "{" + [tem("ee") && bloco("ee", "expression écrite"), tem("eo") && bloco("eo", "expression orale")].filter(Boolean).join(",\n ") + "}";
}

function extrairJson(texto) {
  const ini = texto.indexOf("{");
  const fim = texto.lastIndexOf("}");
  if (ini < 0 || fim <= ini) throw new Error("Resposta da IA sem JSON.");
  return JSON.parse(texto.slice(ini, fim + 1));
}

// Devolve { ee, eo } já no formato de montarResultadoExpressao.
async function corrigirExpressoesComIA(def, tentativa) {
  if (!iaConfigurada()) throw Object.assign(new Error("Correção por IA não configurada no servidor (ANTHROPIC_API_KEY)."), { naoConfigurada: true });
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), 120000);
  try {
    const res = await fetch(`${process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com"}/v1/messages`, {
      method: "POST",
      signal: controle.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || MODELO_PADRAO,
        max_tokens: 6000,
        messages: [{ role: "user", content: montarPrompt(def, tentativa) }]
      })
    });
    if (!res.ok) {
      const corpo = await res.text().catch(() => "");
      throw new Error(`API da IA respondeu ${res.status}: ${corpo.slice(0, 300)}`);
    }
    const dados = await res.json();
    const texto = (dados.content || []).filter(b => b.type === "text").map(b => b.text).join("");
    const bruto = extrairJson(texto);
    const meta = { porIA: true, corretorNome: "Correção automática (IA)" };
    const tem = p => sim.ordemDe(def).includes(p);
    return {
      ee: tem("ee") ? sim.montarResultadoExpressao("ee", def, bruto.ee || {}, meta) : undefined,
      eo: tem("eo") ? sim.montarResultadoExpressao("eo", def, bruto.eo || {}, meta) : undefined
    };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { corrigirExpressoesComIA, iaConfigurada };
