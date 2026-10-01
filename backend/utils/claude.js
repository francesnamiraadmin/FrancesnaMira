// Cliente único da API da Anthropic (SDK oficial) para o site: correção dos simulados, correção
// das produções e modelos/correções do Ambiente de Produção. Configuração por ambiente:
// ANTHROPIC_API_KEY (obrigatória), ANTHROPIC_MODEL e ANTHROPIC_BASE_URL (opcionais).
const Anthropic = require("@anthropic-ai/sdk");

// Mesmo modelo que o site e o app "Modèles TCF" já usavam; ANTHROPIC_MODEL troca sem mexer no código.
const MODELO_PADRAO = "claude-sonnet-5";
const modeloIA = () => process.env.ANTHROPIC_MODEL || MODELO_PADRAO;
const iaConfigurada = () => !!process.env.ANTHROPIC_API_KEY;

let cliente = null;
function obterCliente() {
  if (!iaConfigurada()) throw Object.assign(new Error("Correção por IA não configurada no servidor."), { naoConfigurada: true });
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

// Uma chamada que deve devolver um objeto JSON. `sistema` é opcional.
async function pedirJson({ sistema, usuario, maxTokens = 6000 }) {
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

module.exports = { pedirJson, iaConfigurada, modeloIA, extrairJson, Anthropic };
