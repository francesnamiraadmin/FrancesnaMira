// Cliente único de IA do site: correção dos simulados, correção das produções e modelos/correções do
// Ambiente de Produção. Dois provedores, escolhidos por ambiente:
//  - Google Gemini (chave gratuita do Google AI Studio): GEMINI_API_KEY, GEMINI_MODEL (opcional).
//    Ouve também o áudio das produções orais.
//  - Anthropic (SDK oficial): ANTHROPIC_API_KEY, ANTHROPIC_MODEL e ANTHROPIC_BASE_URL (opcionais).
// IA_PROVEDOR=gemini|anthropic força um deles; sem ele, a chave gratuita (Gemini) tem preferência.
const Anthropic = require("@anthropic-ai/sdk");

// Mesmo modelo que o site e o app "Modèles TCF" já usavam; ANTHROPIC_MODEL troca sem mexer no código.
const MODELO_PADRAO = "claude-sonnet-5";
const GEMINI_PADRAO = "gemini-2.5-flash";

function provedor() {
  const forcado = String(process.env.IA_PROVEDOR || "").toLowerCase();
  if (forcado === "gemini" && process.env.GEMINI_API_KEY) return "gemini";
  if (forcado === "anthropic" && process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return null;
}
const iaConfigurada = () => !!provedor();
const iaOuveAudio = () => provedor() === "gemini";
const modeloIA = () => (provedor() === "gemini" ? process.env.GEMINI_MODEL || GEMINI_PADRAO : process.env.ANTHROPIC_MODEL || MODELO_PADRAO);

let cliente = null;
function obterCliente() {
  if (!cliente) cliente = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, baseURL: process.env.ANTHROPIC_BASE_URL || undefined, timeout: 180000, maxRetries: 2 });
  return cliente;
}

// Objeto JSON do primeiro "{" ao último "}" (tolera ```json e texto em volta).
function extrairJson(texto) {
  const limpo = String(texto || "").replace(/```json|```/g, "");
  const ini = limpo.indexOf("{"), fim = limpo.lastIndexOf("}");
  if (ini < 0 || fim <= ini) throw new Error("Resposta da IA sem JSON.");
  return JSON.parse(limpo.slice(ini, fim + 1));
}

async function pedirGemini({ sistema, usuario, maxTokens, audio }) {
  const partes = [{ text: usuario }];
  if (audio && audio.base64) partes.push({ inlineData: { mimeType: audio.mime || "audio/webm", data: audio.base64 } });
  const corpo = {
    contents: [{ role: "user", parts: partes }],
    generationConfig: { maxOutputTokens: Math.max(maxTokens, 8192), responseMimeType: "application/json", temperature: 0.4 }
  };
  if (sistema) corpo.systemInstruction = { parts: [{ text: sistema }] };
  const modelo = modeloIA();
  let ultimoErro = null;
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(180000)
    });
    const dados = await res.json().catch(() => ({}));
    if (res.ok) {
      const cand = (dados.candidates || [])[0];
      if (!cand || cand.finishReason === "SAFETY" || cand.finishReason === "PROHIBITED_CONTENT") throw new Error("A IA recusou este pedido.");
      const texto = (cand.content?.parts || []).map(p => p.text || "").join("");
      return { json: extrairJson(texto), modelo };
    }
    ultimoErro = new Error(dados.error?.message || `Gemini respondeu ${res.status}.`);
    // limite da cota gratuita (429) ou instabilidade (5xx): espera e tenta de novo
    if (res.status !== 429 && res.status < 500) break;
    await new Promise(r => setTimeout(r, 4000 * (tentativa + 1)));
  }
  throw ultimoErro;
}

// Uma chamada que deve devolver um objeto JSON. `sistema` é opcional; `audio` ({ mime, base64 })
// só é enviado ao Gemini (o outro provedor corrige pela transcrição).
async function pedirJson({ sistema, usuario, maxTokens = 6000, audio }) {
  const qual = provedor();
  if (!qual) throw Object.assign(new Error("Correção por IA não configurada no servidor."), { naoConfigurada: true });
  if (qual === "gemini") return pedirGemini({ sistema, usuario, maxTokens, audio });
  const resposta = await obterCliente().messages.create({
    model: modeloIA(),
    max_tokens: maxTokens,
    ...(sistema ? { system: sistema } : {}),
    messages: [{ role: "user", content: usuario }]
  });
  if (resposta.stop_reason === "refusal") throw new Error("A IA recusou este pedido.");
  const texto = resposta.content.filter(b => b.type === "text").map(b => b.text).join("");
  return { json: extrairJson(texto), modelo: resposta.model };
}

module.exports = { pedirJson, iaConfigurada, iaOuveAudio, modeloIA, provedor, extrairJson, Anthropic };
