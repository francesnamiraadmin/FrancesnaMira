// Cliente único de IA do site: correção dos simulados, correção das produções e modelos/correções do
// Ambiente de Produção. Dois provedores, escolhidos por ambiente:
//  - Google Gemini (chave gratuita do Google AI Studio): GEMINI_API_KEY, GEMINI_MODEL (opcional).
//    Ouve também o áudio das produções orais.
//  - Anthropic (SDK oficial): ANTHROPIC_API_KEY, ANTHROPIC_MODEL e ANTHROPIC_BASE_URL (opcionais).
// IA_PROVEDOR=gemini|anthropic força um deles; sem ele, a chave gratuita (Gemini) tem preferência.
const Anthropic = require("@anthropic-ai/sdk");

// Mesmo modelo que o site e o app "Modèles TCF" já usavam; ANTHROPIC_MODEL troca sem mexer no código.
const MODELO_PADRAO = "claude-sonnet-5";
// Ordem medida com o prompt real de correção (chave gratuita, out/2026): os « lite » respondem em
// 4–10 s; os Flash maiores ficam em « high demand » (30–70 s e erro) ou sem cota gratuita.
// GEMINI_MODEL, se definido, entra na frente da lista.
const GEMINI_PADRAO = "gemini-flash-lite-latest";
const GEMINI_RESERVAS = ["gemini-3.1-flash-lite", "gemini-flash-latest", "gemini-3.5-flash"];
// Sem resposta do primeiro modelo neste tempo, o próximo começa em paralelo (vale o que chegar antes).
const GEMINI_PARALELO_MS = 12000;
// Modelo que acabou de falhar por sobrecarga/cota vai para o fim da fila por 2 minutos.
const GEMINI_CASTIGO_MS = 2 * 60 * 1000;
const castigo = new Map();

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

// Uma chamada a um modelo. Erros classificados: aposentado (modelo não existe mais para a chave),
// passageiro (sobrecarga, cota, tempo, JSON quebrado) ou definitivo (chave inválida, pedido recusado).
async function chamarGemini(modelo, corpo, sinal) {
  let res, dados;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
      body: JSON.stringify(corpo),
      signal: sinal
    });
    dados = await res.json().catch(() => ({}));
  } catch (e) {
    throw Object.assign(new Error(`${modelo}: ${e.name === "AbortError" || e.name === "TimeoutError" ? "sem resposta a tempo" : e.message}`), { tipo: "passageiro", cancelado: e.name === "AbortError" });
  }
  if (res.ok) {
    const cand = (dados.candidates || [])[0];
    if (!cand || cand.finishReason === "SAFETY" || cand.finishReason === "PROHIBITED_CONTENT") throw Object.assign(new Error("A IA recusou este pedido."), { tipo: "definitivo" });
    const texto = (cand.content?.parts || []).map(p => p.text || "").join("");
    try { return { json: extrairJson(texto), modelo }; }
    catch (e) { throw Object.assign(new Error(`${modelo}: resposta sem JSON válido`), { tipo: "passageiro" }); }
  }
  const msg = dados.error?.message || `Gemini respondeu ${res.status}.`;
  if (res.status === 404 || /no longer available|not found|is not supported/i.test(msg)) throw Object.assign(new Error(`${modelo}: ${msg}`), { tipo: "aposentado" });
  if (res.status === 429 || res.status >= 500 || /high demand|overloaded|unavailable|quota/i.test(msg)) throw Object.assign(new Error(`${modelo}: ${msg}`), { tipo: "passageiro" });
  throw Object.assign(new Error(msg), { tipo: "definitivo" });
}

// Pedido com reserva e corrida: começa pelo modelo mais rápido; se ele falhar, passa ao próximo na
// hora; se demorar mais de GEMINI_PARALELO_MS, o próximo começa junto e vale a primeira resposta.
function pedirGemini({ sistema, usuario, maxTokens, audio }) {
  const partes = [{ text: usuario }];
  if (audio && audio.base64) partes.push({ inlineData: { mimeType: audio.mime || "audio/webm", data: audio.base64 } });
  const corpo = {
    contents: [{ role: "user", parts: partes }],
    generationConfig: { maxOutputTokens: Math.max(maxTokens, 8192), responseMimeType: "application/json", temperature: 0.4 }
  };
  if (sistema) corpo.systemInstruction = { parts: [{ text: sistema }] };
  const agora = Date.now();
  const lista = [...new Set([process.env.GEMINI_MODEL, GEMINI_PADRAO, ...GEMINI_RESERVAS].filter(Boolean))];
  const modelos = [...lista.filter(m => !(castigo.get(m) > agora)), ...lista.filter(m => castigo.get(m) > agora)];

  return new Promise((resolve, reject) => {
    const controles = [];
    let proximo = 0, ativos = 0, terminou = false, ultimoErro = null, relogio = null, rodada = 1;
    const inicio = Date.now();
    const fimGeral = setTimeout(() => acabar(null, ultimoErro || Object.assign(new Error("A IA não respondeu a tempo."), { tipo: "passageiro" })), 150000);
    function acabar(ok, erro) {
      if (terminou) return;
      terminou = true;
      clearTimeout(relogio); clearTimeout(fimGeral);
      controles.forEach(c => c.abort());
      if (ok) resolve(ok); else reject(erro);
    }
    function iniciar() {
      if (terminou) return;
      if (proximo >= modelos.length) {
        if (ativos) return;
        // Todos falharam por sobrecarga/tempo: nova rodada pela lista (a demanda costuma passar em segundos),
        // enquanto houver tempo; erro definitivo já terminou antes.
        if (rodada < 3 && Date.now() - inicio < 100000) { rodada++; proximo = 0; clearTimeout(relogio); relogio = setTimeout(iniciar, 1500 * rodada); return; }
        acabar(null, ultimoErro); return;
      }
      const modelo = modelos[proximo++];
      const ctrl = new AbortController();
      controles.push(ctrl);
      ativos++;
      clearTimeout(relogio);
      relogio = setTimeout(iniciar, GEMINI_PARALELO_MS);   // demorou: o próximo começa em paralelo
      const limite = setTimeout(() => ctrl.abort(), 60000);
      chamarGemini(modelo, corpo, ctrl.signal).then(r => { clearTimeout(limite); acabar(r); }, e => {
        clearTimeout(limite);
        ativos--;
        if (terminou || e.cancelado && terminou) return;
        ultimoErro = e;
        if (e.tipo === "definitivo") return acabar(null, e);
        castigo.set(modelo, Date.now() + GEMINI_CASTIGO_MS);
        iniciar();                                           // falhou: o próximo começa já
      });
    }
    iniciar();
  });
}

// Uma chamada que deve devolver um objeto JSON. `sistema` é opcional; `audio` ({ mime, base64 })
// só é enviado ao Gemini (o outro provedor corrige pela transcrição).
async function pedirJson({ sistema, usuario, maxTokens = 6000, audio }) {
  const qual = provedor();
  if (!qual) throw Object.assign(new Error("Correção por IA não configurada no servidor."), { naoConfigurada: true });
  // falhas do provedor ficam marcadas (err.ia) para a rota responder com uma mensagem clara
  if (qual === "gemini") return pedirGemini({ sistema, usuario, maxTokens, audio }).catch(e => { e.ia = true; throw e; });
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
