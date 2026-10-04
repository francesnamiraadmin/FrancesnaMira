// ===================== Monitor de Segurança =====================
// Cada defesa do sistema (rate limit, sanitização, validação de token, checagem de
// preço...) chama `registrar(tipo, req, detalhes)` quando detecta algo suspeito.
// O monitor então:
//   1. grava o evento (EventoSeguranca) e loga uma linha estruturada no console;
//   2. soma a "pontuação de ameaça" do IP — passou do limite na janela, o IP é
//      BLOQUEADO automaticamente, com duração crescente a cada reincidência;
//   3. aciona os alertas para a equipe (utils/alertas.js), com anti-flood.
// Também mantém a lista de IPs bloqueados e de sessões revogadas em memória
// (sincronizada com o banco a cada minuto), consultada a cada requisição.
const mongoose = require("mongoose");
const EventoSeguranca = require("../models/eventoSeguranca");
const BloqueioIp = require("../models/bloqueioIp");
const { alertar } = require("./alertas");

// ---------- CATÁLOGO DE AMEAÇAS ----------
// peso: quanto soma na pontuação do IP (limite = LIMITE_PONTOS na janela).
// alerta: avisa a equipe imediatamente (respeitando o anti-flood).
// acumular: só alerta quando houver N ocorrências dentro de `janelaMs` (picos).
const CATALOGO = {
  path_traversal:           { severidade: "alta",    peso: 50, alerta: true,  descricao: "Tentativa de acessar arquivos fora das pastas permitidas (path traversal)" },
  injecao_nosql:            { severidade: "alta",    peso: 50, alerta: true,  descricao: "Tentativa de injeção NoSQL (operadores $ / __proto__ na requisição)" },
  tentativa_xss:            { severidade: "media",   peso: 25, alerta: true,  descricao: "Tentativa de injetar script/HTML malicioso (XSS)" },
  xss_bloqueado_navegador:  { severidade: "alta",    peso: 0,  alerta: true,  descricao: "Conteúdo malicioso já salvo no sistema foi bloqueado ao ser exibido (XSS armazenado)" },
  varredura:                { severidade: "media",   peso: 35, alerta: true,  descricao: "Varredura de vulnerabilidades (busca por arquivos/painéis conhecidos)" },
  token_invalido:           { severidade: "media",   peso: 20, alerta: false, descricao: "Token de sessão forjado ou adulterado" },
  acesso_negado_privilegio: { severidade: "alta",    peso: 25, alerta: true,  descricao: "Tentativa de acessar área de administrador/professor sem permissão" },
  acesso_negado:            { severidade: "baixa",   peso: 3,  alerta: false, descricao: "Acesso negado a um recurso específico (possível tentativa de ver dados de outro usuário)" },
  acesso_negado_equipe:     { severidade: "info",    peso: 0,  alerta: false, descricao: "Professor tentou usar uma função exclusiva de administrador" },
  rate_limit:               { severidade: "media",   peso: 30, alerta: true,  descricao: "Excesso de requisições (possível força bruta, spam ou DoS)" },
  login_falhou:             { severidade: "baixa",   peso: 5,  alerta: false, descricao: "Login com senha incorreta" },
  forca_bruta_conta:        { severidade: "alta",    peso: 40, alerta: true,  descricao: "Força bruta contra uma conta — login temporariamente travado" },
  reuso_refresh_token:      { severidade: "critica", peso: 0,  alerta: true,  descricao: "Sessão roubada: token de sessão antigo reutilizado — todas as sessões da conta foram encerradas" },
  webhook_invalido:         { severidade: "alta",    peso: 50, alerta: true,  descricao: "Notificação de pagamento com assinatura inválida (webhook forjado)" },
  adulteracao_preco:        { severidade: "alta",    peso: 60, alerta: true,  descricao: "Tentativa de pagar um valor diferente do preço oficial" },
  pagamento_recusado:       { severidade: "baixa",   peso: 10, alerta: false, descricao: "Pagamento com cartão recusado (vários seguidos indicam teste de cartões roubados)" },
  upload_rejeitado:         { severidade: "baixa",   peso: 10, alerta: false, descricao: "Upload de arquivo recusado (tipo/tamanho não permitido)" },
  conexoes_excessivas:      { severidade: "media",   peso: 30, alerta: true,  descricao: "Excesso de conexões abertas simultâneas" },
  payload_malformado:       { severidade: "baixa",   peso: 5,  alerta: false, descricao: "Requisição malformada ou grande demais" },
  api_nao_encontrada:       { severidade: "baixa",   peso: 3,  alerta: false, descricao: "Chamada a rota inexistente da API" },
  erro_servidor:            { severidade: "media",   peso: 0,  alerta: true,  acumular: { n: 10, janelaMs: 5 * 60 * 1000 }, descricao: "Pico de erros internos no servidor" },
  login_staff_novo_ip:      { severidade: "media",   peso: 0,  alerta: true,  descricao: "Conta da equipe entrou a partir de um IP nunca visto" },
  alteracao_conta_staff:    { severidade: "alta",    peso: 0,  alerta: true,  descricao: "Alteração sensível em conta da equipe (senha/e-mail)" },
  acao_administrativa:      { severidade: "info",    peso: 0,  alerta: false, descricao: "Ação administrativa registrada para auditoria" },
  privilegio_concedido:     { severidade: "alta",    peso: 0,  alerta: true,  descricao: "Nova conta com privilégio de equipe criada/alterada" },
  ip_bloqueado:             { severidade: "alta",    peso: 0,  alerta: true,  descricao: "IP bloqueado automaticamente por comportamento de ataque" },
  senha_alterada:           { severidade: "info",    peso: 0,  alerta: false, descricao: "Senha alterada pelo próprio usuário (outras sessões encerradas)" },
  sessoes_revogadas:        { severidade: "alta",    peso: 0,  alerta: true,  descricao: "Todas as sessões de uma conta foram encerradas" }
};

const LIMITE_PONTOS = 100;
const JANELA_PONTOS = 10 * 60 * 1000;
// Duração do bloqueio por reincidência: 15 min, 1 h, 24 h, 7 dias.
const DURACOES_BLOQUEIO = [15 * 60e3, 60 * 60e3, 24 * 60 * 60e3, 7 * 24 * 60 * 60e3];
const EH_PRODUCAO = process.env.NODE_ENV === "production";

// IPs que nunca são bloqueados automaticamente (ex.: IP fixo do escritório).
const IPS_CONFIAVEIS = new Set((process.env.IPS_CONFIAVEIS || "").split(",").map(s => s.trim()).filter(Boolean));
function ipConfiavel(ip) {
  if (IPS_CONFIAVEIS.has(ip)) return true;
  // Em desenvolvimento, não bloqueia a própria máquina.
  return !EH_PRODUCAO && /^(::1|127\.0\.0\.1|::ffff:127\.0\.0\.1)$/.test(ip || "");
}

const pontos = new Map();        // ip -> [{ t, peso }]
const bloqueados = new Map();    // ip -> { ate, motivo }
const revogacoes = new Map();    // userId -> timestamp (ms)
const acumulados = new Map();    // tipo -> [timestamps]

const bancoPronto = () => mongoose.connection.readyState === 1;

function contexto(req) {
  if (!req) return {};
  return {
    ip: req.ip,
    userId: req.userId && mongoose.Types.ObjectId.isValid(req.userId) ? req.userId : undefined,
    metodo: req.method,
    rota: String(req.originalUrl || req.url || "").split("?")[0].slice(0, 300),
    userAgent: String(req.headers?.["user-agent"] || "").slice(0, 300)
  };
}

// Reduz detalhes a algo pequeno e seguro para gravar/enviar (nunca senhas/tokens).
function resumirDetalhes(det) {
  if (!det) return undefined;
  try {
    const json = JSON.stringify(det, (k, v) => (/senha|token|password|secret/i.test(k) ? "[omitido]" : v));
    return json.length > 2000 ? { resumo: json.slice(0, 2000) } : JSON.parse(json);
  } catch {
    return { resumo: String(det).slice(0, 2000) };
  }
}

// ---------- REGISTRO DE EVENTOS ----------
function registrar(tipo, req, detalhes = {}, extra = {}) {
  const def = CATALOGO[tipo] || { severidade: "media", peso: 10, alerta: true, descricao: tipo };
  const ctx = { ...contexto(req), ...extra };
  if (req) req.eventoSegurancaRegistrado = true;

  const ev = {
    tipo, severidade: def.severidade, descricao: def.descricao,
    ...ctx, detalhes: resumirDetalhes(detalhes), criadoEm: new Date()
  };

  // Resposta automática por pontuação do IP.
  if (def.peso > 0 && ctx.ip && !ipConfiavel(ctx.ip)) {
    const resposta = somarPontos(ctx.ip, def.peso, def.descricao);
    if (resposta) ev.resposta = resposta;
  }

  console.warn(`[seguranca] ${JSON.stringify({ tipo, severidade: ev.severidade, ip: ev.ip, userId: ev.userId, rota: ev.rota, resposta: ev.resposta })}`);
  if (bancoPronto()) EventoSeguranca.create(ev).catch(err => console.error("[seguranca] Falha ao gravar evento:", err.message));

  if (def.alerta) {
    if (def.acumular) {
      const agora = Date.now();
      const lista = (acumulados.get(tipo) || []).filter(t => agora - t < def.acumular.janelaMs);
      lista.push(agora);
      acumulados.set(tipo, lista);
      if (lista.length >= def.acumular.n) {
        acumulados.set(tipo, []);
        alertar({ ...ev, detalhes: { ...(ev.detalhes || {}), ocorrencias: lista.length, janelaMinutos: def.acumular.janelaMs / 60000 } });
      }
    } else {
      alertar(ev);
    }
  }
  return ev;
}

// ---------- PONTUAÇÃO E BLOQUEIO DE IP ----------
function somarPontos(ip, peso, motivo) {
  if (estaBloqueado(ip)) return null;
  const agora = Date.now();
  const lista = (pontos.get(ip) || []).filter(p => agora - p.t < JANELA_PONTOS);
  lista.push({ t: agora, peso });
  pontos.set(ip, lista);
  const total = lista.reduce((s, p) => s + p.peso, 0);
  if (total < LIMITE_PONTOS) return null;

  pontos.delete(ip);
  // Barra já na memória (síncrono) — bloquearIp ajusta a duração pela reincidência em seguida.
  bloqueados.set(ip, { ate: agora + DURACOES_BLOQUEIO[0], motivo });
  bloquearIp(ip, { motivo: `Pontuação de ameaça ${total} em 10 min — último evento: ${motivo}` })
    .catch(err => console.error("[seguranca] Falha ao bloquear IP:", err.message));
  return "IP bloqueado automaticamente";
}

// Bloqueia um IP. Sem `duracaoMs`, usa a escada de reincidência.
async function bloquearIp(ip, { motivo, duracaoMs, adminId } = {}) {
  let nivel = 1;
  if (bancoPronto()) {
    const anterior = await BloqueioIp.findOne({ ip }).lean();
    if (anterior) nivel = (anterior.nivel || 1) + 1;
  }
  const duracao = duracaoMs || DURACOES_BLOQUEIO[Math.min(nivel, DURACOES_BLOQUEIO.length) - 1];
  const ate = new Date(Date.now() + duracao);
  bloqueados.set(ip, { ate: ate.getTime(), motivo });

  if (bancoPronto()) {
    await BloqueioIp.findOneAndUpdate(
      { ip },
      { ip, motivo, ate, nivel, automatico: !adminId, criadoPor: adminId, criadoEm: new Date(), limparEm: new Date(ate.getTime() + 30 * 24 * 60 * 60e3) },
      { upsert: true }
    );
  }

  const duracaoTexto = formatarDuracao(duracao);
  if (!adminId) {
    registrar("ip_bloqueado", null, { motivo, reincidencia: nivel }, { ip, resposta: `IP bloqueado por ${duracaoTexto}` });
  } else {
    registrar("acao_administrativa", null, { acao: "bloqueio_manual_ip", ip, motivo, duracao: duracaoTexto }, { ip, userId: adminId });
  }
  return { ip, ate, nivel };
}

async function desbloquearIp(ip, adminId) {
  bloqueados.delete(ip);
  pontos.delete(ip);
  if (bancoPronto()) await BloqueioIp.updateOne({ ip }, { ate: new Date() });
  registrar("acao_administrativa", null, { acao: "desbloqueio_ip", ip }, { userId: adminId });
}

function estaBloqueado(ip) {
  const b = bloqueados.get(ip);
  if (!b) return null;
  if (b.ate <= Date.now()) { bloqueados.delete(ip); return null; }
  return b;
}

function formatarDuracao(ms) {
  if (ms >= 24 * 60 * 60e3) return `${Math.round(ms / (24 * 60 * 60e3))} dia(s)`;
  if (ms >= 60 * 60e3) return `${Math.round(ms / (60 * 60e3))} hora(s)`;
  return `${Math.round(ms / 60e3)} minuto(s)`;
}

// Primeiro middleware da aplicação: IP bloqueado não chega a nenhuma rota.
function barrarIpsBloqueados(req, res, next) {
  const b = estaBloqueado(req.ip);
  if (!b) return next();
  const segundos = Math.max(1, Math.ceil((b.ate - Date.now()) / 1000));
  res.setHeader("Retry-After", segundos);
  if (req.path.startsWith("/api/")) {
    return res.status(403).json({ msg: "Acesso temporariamente bloqueado por atividade suspeita. Se isso for um engano, entre em contato com o suporte." });
  }
  res.status(403).type("text/plain; charset=utf-8").send("Acesso temporariamente bloqueado por atividade suspeita. Se isso for um engano, entre em contato com o suporte.");
}

// ---------- REVOGAÇÃO DE SESSÕES ----------
// Encerra todas as sessões de um usuário: apaga os refresh tokens e faz o middleware
// de autenticação recusar qualquer access token emitido antes deste instante.
// `silencioso`: revogação de rotina (ex.: aluno redefiniu a senha) — não gera alerta.
async function revogarSessoes(userId, { motivo, req, adminId, silencioso } = {}) {
  const User = require("../models/user");
  const agora = new Date();
  revogacoes.set(String(userId), agora.getTime());
  const user = await User.findByIdAndUpdate(userId, { sessoesRevogadasEm: agora, refreshTokens: [] }, { new: true }).select("email");
  if (!silencioso) registrar("sessoes_revogadas", req || null, { motivo, porAdmin: !!adminId }, { userId, email: user?.email });
  return user;
}

function sessaoRevogada(userId, iatSegundos) {
  const t = revogacoes.get(String(userId));
  return !!t && iatSegundos * 1000 < t - 1000;
}

// ---------- SINCRONIZAÇÃO COM O BANCO ----------
// Carrega bloqueios ativos e revogações recentes (as de até 1 dia atrás, validade
// máxima do access token) — mantém tudo coerente após reinício ou entre instâncias.
async function sincronizar() {
  if (!bancoPronto()) return;
  try {
    const User = require("../models/user");
    const agora = new Date();
    const [ativos, revogados] = await Promise.all([
      BloqueioIp.find({ ate: { $gt: agora } }).select("ip ate motivo").lean(),
      User.find({ sessoesRevogadasEm: { $gt: new Date(agora - 24 * 60 * 60e3) } }).select("sessoesRevogadasEm").lean()
    ]);
    for (const b of ativos) bloqueados.set(b.ip, { ate: new Date(b.ate).getTime(), motivo: b.motivo });
    // Desbloqueios feitos em outra instância: remove o que não está mais ativo no banco.
    const ipsAtivos = new Set(ativos.map(b => b.ip));
    for (const ip of bloqueados.keys()) if (!ipsAtivos.has(ip)) bloqueados.delete(ip);
    for (const u of revogados) revogacoes.set(String(u._id), new Date(u.sessoesRevogadasEm).getTime());
  } catch (err) {
    console.error("[seguranca] Falha ao sincronizar bloqueios:", err.message);
  }
}

function iniciarMonitor() {
  mongoose.connection.on("connected", sincronizar);
  if (bancoPronto()) sincronizar();
  setInterval(sincronizar, 60 * 1000).unref();
  // Limpa pontuações velhas da memória.
  setInterval(() => {
    const agora = Date.now();
    for (const [ip, lista] of pontos) {
      const vivas = lista.filter(p => agora - p.t < JANELA_PONTOS);
      if (vivas.length) pontos.set(ip, vivas); else pontos.delete(ip);
    }
  }, 5 * 60 * 1000).unref();
}

// ---------- DETECÇÃO GENÉRICA NA RESPOSTA ----------
// Observa o status final de toda resposta da API: 403 (acesso a dado de outro
// usuário), 404 em /api (sondagem de rotas) e 5xx (picos de erro) — sem precisar
// instrumentar cada rota individualmente.
function observarRespostas(req, res, next) {
  res.on("finish", () => {
    if (req.eventoSegurancaRegistrado) return;
    const s = res.statusCode;
    // Só 403 sobre um recurso identificado (id na URL) — conteúdo bloqueado por plano
    // (listas de módulos etc.) é uso normal de aluno e não deve pontuar.
    if (s === 403 && req.userId && /\/[a-f0-9]{24}(\/|$)/i.test(req.originalUrl.split("?")[0])) registrar("acesso_negado", req);
    else if (s === 404 && req.originalUrl.startsWith("/api/") && res.getHeader("X-Rota-Inexistente")) registrar("api_nao_encontrada", req);
    else if (s >= 500) registrar("erro_servidor", req, { status: s });
  });
  next();
}

// Caminhos que só scanners de vulnerabilidade procuram neste site (Node, sem PHP/WordPress).
const PADRAO_VARREDURA = /(^|\/)(\.env|\.git|\.svn|\.htaccess|\.DS_Store|wp-admin|wp-login|wp-content|wp-includes|xmlrpc\.php|phpmyadmin|pma|cgi-bin|server-status|actuator|\.aws|id_rsa|etc\/passwd|web\.config|config\.json|backup\.(zip|sql|tar)|dump\.sql|vendor\/phpunit)|\.(php\d?|asp|aspx|jsp|cgi)(\?|$)/i;

function detectarVarredura(req, res, next) {
  let caminho = req.path;
  try { caminho = decodeURIComponent(req.path); } catch { /* segue com o bruto */ }
  if (PADRAO_VARREDURA.test(caminho)) {
    registrar("varredura", req, { caminho: caminho.slice(0, 200) });
    return res.status(404).type("text/plain").send("Not found");
  }
  next();
}

function resumoMemoria() {
  return {
    ipsBloqueadosAgora: [...bloqueados.entries()].filter(([, b]) => b.ate > Date.now()).length,
    ipsEmObservacao: pontos.size,
    limitePontos: LIMITE_PONTOS
  };
}

module.exports = {
  CATALOGO, registrar, bloquearIp, desbloquearIp, estaBloqueado, barrarIpsBloqueados,
  revogarSessoes, sessaoRevogada, iniciarMonitor, observarRespostas, detectarVarredura,
  resumoMemoria, formatarDuracao
};
