// Camada central de proteção do backend: cabeçalhos HTTP de segurança,
// sanitização de toda entrada (body/params/query) contra injeção NoSQL,
// prototype pollution e HTML/script, rate limiting em memória e validadores
// reaproveitados pelas rotas. Nada aqui depende de pacote externo.
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const querystring = require("querystring");

const EH_PRODUCAO = process.env.NODE_ENV === "production";

// Carregado sob demanda: o monitor depende de modelos do banco e este arquivo é
// importado por muitos módulos — evita dependência circular na inicialização.
function registrarEvento(tipo, req, detalhes, extra) {
  try {
    return require("../utils/monitorSeguranca").registrar(tipo, req, detalhes, extra);
  } catch (err) {
    console.error("[seguranca] Falha ao registrar evento:", err.message);
  }
}

// Conteúdo removido que indica ataque de verdade (não um simples <b> colado).
const HTML_MALICIOSO = /<\s*(script|iframe|object|embed|svg|math|base|meta|link|style)\b|\bon[a-z]+\s*=|javascript\s*:|vbscript\s*:|srcdoc\s*=/i;

// ---------- CABEÇALHOS DE SEGURANÇA ----------
// CSP propositalmente sem restringir script-src: o site usa scripts inline e SDKs
// externos (Mercado Pago, YouTube). As diretivas abaixo bloqueiam clickjacking,
// <object>/<embed> e sequestro de <base> sem quebrar nenhuma página.
function cabecalhosSeguranca(req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), geolocation=(), payment=(self), microphone=(self)");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  res.setHeader("Content-Security-Policy", "frame-ancestors 'self'; object-src 'none'; base-uri 'self'");
  if (EH_PRODUCAO) res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  // Respostas da API carregam dados pessoais/tokens — nunca devem ficar em cache.
  if (req.path.startsWith("/api/")) res.setHeader("Cache-Control", "no-store");
  next();
}

// ---------- SANITIZAÇÃO DE ENTRADA ----------
const CHAVES_PROIBIDAS = new Set(["__proto__", "constructor", "prototype"]);
const PROFUNDIDADE_MAX = 20;

// Campos cujo conteúdo precisa chegar intacto (senhas, tokens de cartão/sessão,
// imagens em data URI) — neles só removemos caracteres nulos, nunca "tags".
const CAMPOS_LITERAIS = new Set([
  "senha", "confirmarSenha", "senhaAtual", "novaSenha", "token", "ticket", "foto"
]);

// Remove tags HTML completas e neutraliza aberturas soltas ("<img ..." sem ">"),
// que o navegador ainda fecharia usando o ">" de um HTML vizinho. Preserva
// comparações de texto comuns como "a < b".
function removerTags(str) {
  return str
    .replace(/<\/?[a-zA-Z!?][^>]*>/g, "")
    .replace(/<(?=[a-zA-Z!/?])/g, "");
}

// Limpa recursivamente um objeto vindo do cliente: descarta chaves de operador
// MongoDB ($gt, $where, $ne...), chaves com "." (acesso a subcampos) e chaves de
// prototype pollution; remove bytes nulos; opcionalmente remove HTML.
// `coletor` (opcional) recebe o que foi removido, para o monitor de segurança
// registrar a tentativa de ataque.
function limparValor(valor, { html, chave, profundidade = 0, permitirPonto = false, coletor = null }) {
  if (profundidade > PROFUNDIDADE_MAX) return undefined;

  if (typeof valor === "string") {
    let limpo = valor.replace(/\0/g, "");
    if (html && !CAMPOS_LITERAIS.has(chave)) {
      const semTags = removerTags(limpo);
      if (coletor && semTags !== limpo && HTML_MALICIOSO.test(limpo) && coletor.xss.length < 3) {
        coletor.xss.push({ campo: chave, amostra: limpo.slice(0, 200) });
      }
      limpo = semTags;
    }
    return limpo;
  }
  if (Array.isArray(valor)) {
    return valor.map(v => limparValor(v, { html, chave, profundidade: profundidade + 1, permitirPonto, coletor }));
  }
  if (valor && typeof valor === "object") {
    const limpo = {};
    for (const [k, v] of Object.entries(valor)) {
      if (CHAVES_PROIBIDAS.has(k) || k.startsWith("$") || (!permitirPonto && k.includes("."))) {
        if (coletor && (CHAVES_PROIBIDAS.has(k) || k.startsWith("$")) && coletor.injecao.length < 5) coletor.injecao.push(k.slice(0, 40));
        continue;
      }
      const r = limparValor(v, { html, chave: k, profundidade: profundidade + 1, permitirPonto, coletor });
      if (r !== undefined) limpo[k] = r;
    }
    return limpo;
  }
  return valor;
}

// Professores/admins cadastram conteúdo didático que pode conter marcação
// legítima; para qualquer outro remetente (aluno ou visitante) o HTML é
// removido na entrada, como camada extra além do escape feito no front-end.
function remetenteEhStaff(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) return false;
  try {
    const payload = jwt.verify(auth.slice(7), process.env.JWT_SECRET, { algorithms: ["HS256"] });
    return !payload.type && (payload.role === "professor" || payload.role === "admin");
  } catch {
    return false;
  }
}

// Operadores MongoDB / prototype pollution escondidos na query string (?x[$ne]=, ?__proto__=).
const INJECAO_NA_QUERY = /(^|[?&])[^=&]*(\$|%24)(ne|gt|gte|lt|lte|in|nin|regex|where|expr|or|and|exists)\b|__proto__|constructor%5B|constructor\[/i;

// Rotas cujo corpo carrega HTML de ataque como EVIDÊNCIA (o relato do navegador
// sobre XSS bloqueado) — guardado como texto e sempre exibido escapado no painel.
const ROTAS_EVIDENCIA = new Set(["/api/seguranca/relato-navegador"]);

function sanitizarEntrada(req, res, next) {
  const html = !remetenteEhStaff(req) && !ROTAS_EVIDENCIA.has(req.originalUrl.split("?")[0]);
  const coletor = { injecao: [], xss: [] };
  if (req.body && typeof req.body === "object") {
    req.body = limparValor(req.body, { html, coletor });
  }
  const query = String(req.originalUrl || "").split("?")[1];
  if (query && INJECAO_NA_QUERY.test(query)) coletor.injecao.push("query:" + query.slice(0, 120));

  if (coletor.injecao.length) registrarEvento("injecao_nosql", req, { chaves: coletor.injecao });
  if (coletor.xss.length) registrarEvento("tentativa_xss", req, { campos: coletor.xss });
  next();
}

// Query string: parser próprio (sem objetos aninhados) + mesma limpeza de chaves.
// Chaves com "." são mantidas aqui (o webhook do Mercado Pago envia "data.id") —
// como o parser é plano, elas nunca viram subdocumentos/operadores.
// Registrado via app.set("query parser", ...), já que no Express 5 req.query é
// um getter recalculado a cada acesso e não pode ser reatribuído.
function parserQuerySeguro(str) {
  return limparValor(querystring.parse(str || ""), { html: false, permitirPonto: true });
}

// Parâmetros de rota: o Express decodifica cada segmento da URL, então
// "%2e%2e%2f" viraria "../" dentro de req.params — e alguns params viram parte
// de caminhos no disco (uploads). Bloqueia isso antes de qualquer handler.
function bloquearTraversal(req, res, next) {
  for (const seg of req.path.split("/")) {
    let decodificado;
    try { decodificado = decodeURIComponent(seg); } catch {
      registrarEvento("payload_malformado", req, { motivo: "URL com codificação inválida" });
      return res.status(400).json({ msg: "URL inválida." });
    }
    if (/[\0/\\]/.test(decodificado) || decodificado === ".." || decodificado === ".") {
      registrarEvento("path_traversal", req, { segmento: decodificado.slice(0, 100) });
      return res.status(400).json({ msg: "URL inválida." });
    }
  }
  next();
}

// ---------- RATE LIMITING (em memória, por processo) ----------
const baldes = new Map();

setInterval(() => {
  const agora = Date.now();
  for (const [chave, b] of baldes) if (b.reiniciaEm <= agora) baldes.delete(chave);
}, 60 * 1000).unref();

function consumir(chave, janelaMs) {
  const agora = Date.now();
  let b = baldes.get(chave);
  if (!b || b.reiniciaEm <= agora) {
    b = { total: 0, reiniciaEm: agora + janelaMs };
    baldes.set(chave, b);
  }
  b.total++;
  return b;
}

function limitarTaxa({ nome, janelaMs, max, msg }) {
  return (req, res, next) => {
    const b = consumir(`${nome}:${req.ip}`, janelaMs);
    if (b.total > max) {
      // Registra na 1ª violação da janela e depois a cada 100 insistências (sem inundar o log).
      if ((b.total - max - 1) % 100 === 0) registrarEvento("rate_limit", req, { limite: nome, max, tentativas: b.total });
      res.setHeader("Retry-After", Math.ceil((b.reiniciaEm - Date.now()) / 1000));
      return res.status(429).json({ msg: msg || "Muitas tentativas. Aguarde alguns minutos e tente novamente." });
    }
    next();
  };
}

// Contador de falhas por identificador (ex.: e-mail no login) — protege contra
// força bruta distribuída em vários IPs mirando a mesma conta.
function falhasExcedidas(chave, max) {
  const b = baldes.get(`falha:${chave}`);
  return !!b && b.reiniciaEm > Date.now() && b.total >= max;
}
function registrarFalha(chave, janelaMs) { consumir(`falha:${chave}`, janelaMs); }
function limparFalhas(chave) { baldes.delete(`falha:${chave}`); }

// ---------- VALIDADORES / HELPERS ----------
function ehObjectId(valor) {
  return typeof valor === "string" && mongoose.Types.ObjectId.isValid(valor) && /^[a-f0-9]{24}$/i.test(valor);
}

// Middleware: exige que os params listados sejam ObjectIds válidos.
function validarIds(...nomes) {
  return (req, res, next) => {
    for (const n of nomes) {
      if (req.params[n] !== undefined && !ehObjectId(req.params[n])) {
        return res.status(400).json({ msg: "Identificador inválido." });
      }
    }
    next();
  };
}

// Middleware: exige que os params listados sejam inteiros não negativos pequenos.
function validarIndices(...nomes) {
  return (req, res, next) => {
    for (const n of nomes) {
      if (req.params[n] !== undefined && !/^\d{1,4}$/.test(req.params[n])) {
        return res.status(400).json({ msg: "Índice inválido." });
      }
    }
    next();
  };
}

const REGEX_EMAIL = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[a-z]{2,}$/i;

function normalizarEmail(valor) {
  if (typeof valor !== "string") return null;
  const email = valor.trim().toLowerCase();
  if (email.length > 254 || !REGEX_EMAIL.test(email)) return null;
  return email;
}

// Garante string (nunca objeto/array vindo do JSON) com tamanho máximo.
function textoSeguro(valor, max) {
  if (valor === undefined || valor === null) return undefined;
  if (typeof valor !== "string" && typeof valor !== "number") return undefined;
  return String(valor).trim().slice(0, max);
}

function escaparRegex(valor) {
  return String(valor).slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escaparHtml(valor) {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Origem usada em links enviados por e-mail. Nunca confia no header Host em
// produção (um Host forjado faria o link de redefinição de senha apontar para o
// domínio do atacante, vazando o token).
function origemSite(req) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/+$/, "");
  if (EH_PRODUCAO) {
    console.error("SITE_URL não configurada em produção — defina-a no ambiente para gerar links seguros.");
  }
  return `${req.protocol}://${req.get("host")}`;
}

// Origens autorizadas a chamar a API a partir de outro domínio (CORS). O site é
// servido pelo próprio Express (mesma origem), então por padrão nenhuma outra.
function origensCors() {
  const lista = (process.env.CORS_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
  if (process.env.SITE_URL) lista.push(process.env.SITE_URL.replace(/\/+$/, ""));
  return lista;
}

// ---------- TRATAMENTO FINAL DE ERROS ----------
// Nunca devolve stack trace nem mensagem interna ao cliente.
// eslint-disable-next-line no-unused-vars
function tratadorErros(err, req, res, next) {
  if (err.type === "entity.parse.failed" || err.type === "entity.too.large") {
    registrarEvento("payload_malformado", req, { motivo: err.type });
    return err.type === "entity.too.large"
      ? res.status(413).json({ msg: "Conteúdo grande demais." })
      : res.status(400).json({ msg: "Requisição inválida." });
  }
  console.error(err);
  res.status(err.status && err.status < 500 ? err.status : 500).json({ msg: "Erro no servidor. Tente novamente." });
}

module.exports = {
  cabecalhosSeguranca, sanitizarEntrada, parserQuerySeguro, bloquearTraversal,
  limitarTaxa, falhasExcedidas, registrarFalha, limparFalhas,
  ehObjectId, validarIds, validarIndices, normalizarEmail, textoSeguro,
  escaparRegex, escaparHtml, origemSite, origensCors, tratadorErros, removerTags, registrarEvento
};
