// Correção por IA das produções textuais do Ambiente de Produção, com a grade da prova do
// curso (TCF, DELF, DALF, TEF; A1–B2 no modelo TCF). Mesma API/configuração da correção
// dos simulados (ANTHROPIC_API_KEY, ANTHROPIC_MODEL, ANTHROPIC_BASE_URL).
const { grade, avaliar } = require("./gradesProva");

const MODELO_PADRAO = "claude-sonnet-5";
const iaConfigurada = () => !!process.env.ANTHROPIC_API_KEY;

const NOME_EXAME = {
  TCF: "TCF (France Éducation international)",
  DELF: "DELF (France Éducation international)",
  DALF: "DALF (France Éducation international)",
  TEF: "TEF (Chambre de commerce et d'industrie de Paris Île-de-France)"
};

function montarPrompt(tema, texto) {
  const g = grade(tema.courseType, "textual");
  const nPalavras = (String(texto).match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || []).length;
  const crit = g.criterios.map(c => `- "${c.id}" — ${c.nome} (0 à ${c.max}) : ${c.descricao}`).join("\n");
  const docs = (tema.coletanea || []).map((d, i) => `Document ${i + 1} — ${d.titulo}${d.fonte ? " (" + d.fonte + ")" : ""}`).join("\n");
  const fluencia = !["TCF", "DELF", "DALF", "TEF"].includes(tema.courseType);
  return `Tu es examinateur certifié du ${NOME_EXAME[g.exame]}${fluencia ? `, et tu évalues ici un apprenant de niveau ${tema.nivel} avec la grille du TCF` : ""}. Évalue la production écrite ci-dessous exactement comme lors de l'examen officiel, pour le niveau visé ${tema.nivel}.

Sujet : ${tema.titulo}
Consigne : ${tema.instrucoes}
Nombre de mots demandé : ${tema.limitePalavrasMin} à ${tema.limitePalavrasMax}. Nombre de mots du candidat : ${nPalavras}.
${docs ? "Documents d'appui mis à disposition du candidat :\n" + docs + "\n" : ""}
Grille (note maximale ${g.notaMaxima}) — attribue une note à chaque critère, demi-points autorisés :
${crit}

Sanctionne le non-respect de la consigne, le hors-sujet, un texte nettement plus court que demandé et le recopiage des documents. Une production vide ou sans rapport vaut 0 partout.

Rédige tous les commentaires EN PORTUGAIS DU BRÉSIL (le candidat est brésilien), de manière concrète et bienveillante.
"correcoes" : 4 à 10 erreurs RÉELLES du texte, avec le passage exact entre "trecho" (copié tel quel), la forme correcte en "correcao" et une explication courte en portugais.

Production du candidat :
"""
${texto}
"""

Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour :
{"criterios":{${g.criterios.map(c => `"${c.id}":0`).join(",")}},"comentarios":{${g.criterios.map(c => `"${c.id}":"..."`).join(",")}},"comentarioGeral":"...","pontosFortes":["...","..."],"aMelhorar":["...","..."],"correcoes":[{"trecho":"...","correcao":"...","explicacao":"..."}]}`;
}

function extrairJson(texto) {
  const ini = texto.indexOf("{");
  const fim = texto.lastIndexOf("}");
  if (ini < 0 || fim <= ini) throw new Error("Resposta da IA sem JSON.");
  return JSON.parse(texto.slice(ini, fim + 1));
}

const lista = (v, n, tam) => (Array.isArray(v) ? v : []).slice(0, n).map(x => String(x || "").slice(0, tam)).filter(Boolean);

// Devolve o objeto `avaliacao` pronto para gravar na Producao.
async function corrigirProducaoComIA(tema, texto) {
  if (!iaConfigurada()) throw Object.assign(new Error("Correção por IA não configurada no servidor."), { naoConfigurada: true });
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), 120000);
  try {
    const res = await fetch(`${process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com"}/v1/messages`, {
      method: "POST",
      signal: controle.signal,
      headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || MODELO_PADRAO,
        max_tokens: 4000,
        messages: [{ role: "user", content: montarPrompt(tema, texto) }]
      })
    });
    if (!res.ok) throw new Error(`API da IA respondeu ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`);
    const dados = await res.json();
    const bruto = extrairJson((dados.content || []).filter(b => b.type === "text").map(b => b.text).join(""));
    const av = avaliar(tema.courseType, "textual", bruto.criterios || {}, { nivelAlvo: tema.nivel, comentarios: bruto.comentarios || {} });
    return {
      exame: av.exame, criterios: av.criterios, notaTotal: av.notaTotal, notaMaxima: av.notaMaxima,
      nivelEstimado: av.nivel, nclc: av.nclc, aprovado: av.aprovado, pontuacaoOficial: av.pontuacaoOficial,
      comentarioGeral: String(bruto.comentarioGeral || "").slice(0, 5000),
      pontosFortes: lista(bruto.pontosFortes, 5, 500), aMelhorar: lista(bruto.aMelhorar, 5, 500),
      correcoes: (Array.isArray(bruto.correcoes) ? bruto.correcoes : []).slice(0, 15).map(c => ({
        trecho: String(c?.trecho || "").slice(0, 400), correcao: String(c?.correcao || "").slice(0, 400), explicacao: String(c?.explicacao || "").slice(0, 600)
      })).filter(c => c.trecho),
      corretor: "ia", corretorNome: "Correção automática (IA)",
      modelo: process.env.ANTHROPIC_MODEL || MODELO_PADRAO
    };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { corrigirProducaoComIA, iaConfigurada, montarPrompt };
