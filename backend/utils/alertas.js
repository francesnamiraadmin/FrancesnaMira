// Envio de alertas de segurança para a equipe, por até três canais independentes
// (qualquer combinação pode estar configurada — os que faltarem são ignorados):
//
//   • E-mail (Brevo)  — ALERTA_EMAILS="a@x.com,b@y.com"; se vazio, vai para todos os
//                        usuários com role "admin".
//   • Webhook         — ALERTA_WEBHOOK_URL (Discord ou Slack: o corpo leva "content" e
//                        "text", que cada um reconhece). É o canal mais rápido.
//   • Telegram        — TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID.
//
// Anti-flood: um atacante não pode usar os alertas para inundar a caixa da equipe.
// Cada tipo de evento tem um intervalo mínimo entre alertas; o que acontecer nesse
// meio-tempo é contado e sai num resumo periódico.
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const INTERVALO_POR_SEVERIDADE = {
  critica: 60 * 1000,
  alta: 5 * 60 * 1000,
  media: 15 * 60 * 1000,
  baixa: 60 * 60 * 1000,
  info: 60 * 60 * 1000
};
const INTERVALO_RESUMO = 15 * 60 * 1000;
const EMOJI = { critica: "🚨", alta: "🔴", media: "🟠", baixa: "🟡", info: "🔵" };

const ultimoEnvio = new Map();   // chave -> timestamp do último alerta enviado
const suprimidos = new Map();    // chave -> { tipo, severidade, descricao, total, ips:Set }

function nomeSite() {
  return process.env.SITE_URL || "Francês na Mira";
}

function linhasEvento(ev) {
  return [
    ["Tipo", ev.tipo],
    ["Severidade", ev.severidade],
    ["O que aconteceu", ev.descricao],
    ["IP", ev.ip],
    ["Usuário", ev.email || (ev.userId ? String(ev.userId) : null)],
    ["Rota", ev.rota ? `${ev.metodo || ""} ${ev.rota}`.trim() : null],
    ["Resposta automática", ev.resposta],
    ["Detalhes", ev.detalhes ? JSON.stringify(ev.detalhes).slice(0, 600) : null],
    ["Quando", new Date(ev.criadoEm || Date.now()).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })]
  ].filter(([, v]) => v !== null && v !== undefined && v !== "");
}

async function destinatariosEmail() {
  const lista = (process.env.ALERTA_EMAILS || "").split(",").map(s => s.trim()).filter(Boolean);
  if (lista.length) return lista;
  try {
    const User = require("../models/user");
    const admins = await User.find({ role: "admin" }).select("email").lean();
    return admins.map(a => a.email).filter(Boolean);
  } catch {
    return [];
  }
}

async function enviarEmail(assunto, htmlCorpo) {
  if (!process.env.BREVO_API_KEY || !process.env.EMAIL_USER) return;
  const destinos = await destinatariosEmail();
  if (!destinos.length) return;
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", "api-key": process.env.BREVO_API_KEY },
    body: JSON.stringify({
      sender: { name: "Francês na Mira — Segurança", email: process.env.EMAIL_USER },
      to: destinos.map(email => ({ email })),
      subject: assunto,
      htmlContent: htmlCorpo
    }),
    signal: AbortSignal.timeout(10000)
  });
  if (!res.ok) throw new Error(`Brevo respondeu ${res.status}`);
}

async function enviarWebhook(texto) {
  const url = process.env.ALERTA_WEBHOOK_URL;
  if (!url) return;
  const conteudo = texto.slice(0, 1900); // limite do Discord é 2000 caracteres
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: conteudo, text: conteudo, username: "Segurança · Francês na Mira" }),
    signal: AbortSignal.timeout(10000)
  });
  if (!res.ok) throw new Error(`Webhook respondeu ${res.status}`);
}

async function enviarTelegram(texto) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return;
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text: texto.slice(0, 4000), disable_web_page_preview: true }),
    signal: AbortSignal.timeout(10000)
  });
  if (!res.ok) throw new Error(`Telegram respondeu ${res.status}`);
}

// Dispara em todos os canais configurados, em paralelo; falha de um não afeta os outros.
async function dispararCanais(assunto, texto, html) {
  const resultados = await Promise.allSettled([
    enviarWebhook(texto),
    enviarTelegram(texto),
    enviarEmail(assunto, html)
  ]);
  for (const r of resultados) {
    if (r.status === "rejected") console.error("[seguranca] Falha ao enviar alerta:", r.reason?.message || r.reason);
  }
  return resultados;
}

function canaisConfigurados() {
  return {
    webhook: !!process.env.ALERTA_WEBHOOK_URL,
    telegram: !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
    email: !!(process.env.BREVO_API_KEY && process.env.EMAIL_USER)
  };
}

function montarMensagem(ev, extraSuprimidos) {
  const linhas = linhasEvento(ev);
  const titulo = `${EMOJI[ev.severidade] || "⚠️"} [${ev.severidade.toUpperCase()}] ${ev.descricao || ev.tipo}`;
  const rodape = extraSuprimidos ? `\n(+${extraSuprimidos} ocorrência(s) deste tipo desde o último alerta)` : "";
  const texto = `${titulo}\n${nomeSite()}\n\n${linhas.map(([k, v]) => `• ${k}: ${v}`).join("\n")}${rodape}\n\nPainel: ${(process.env.SITE_URL || "")}/admin-seguranca.html`;
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif; max-width:560px; margin:0 auto;">
      <h2 style="color:${ev.severidade === "critica" || ev.severidade === "alta" ? "#b91c1c" : "#b45309"};">${esc(titulo)}</h2>
      <table style="width:100%; border-collapse:collapse; font-size:14px;">
        ${linhas.map(([k, v]) => `<tr><td style="padding:6px 8px; color:#555; border-bottom:1px solid #eee; vertical-align:top;">${esc(k)}</td><td style="padding:6px 8px; border-bottom:1px solid #eee; word-break:break-all;">${esc(v)}</td></tr>`).join("")}
      </table>
      ${extraSuprimidos ? `<p style="color:#555;">+${extraSuprimidos} ocorrência(s) deste tipo desde o último alerta.</p>` : ""}
      <p><a href="${esc((process.env.SITE_URL || "") + "/admin-seguranca.html")}">Abrir o painel de segurança</a></p>
    </div>`;
  return { assunto: titulo.slice(0, 150), texto, html };
}

// Ponto de entrada usado pelo monitor: decide se alerta agora ou acumula no resumo.
function alertar(ev) {
  const chave = ev.severidade === "critica" ? `${ev.tipo}:${ev.ip || ""}` : ev.tipo;
  const intervalo = INTERVALO_POR_SEVERIDADE[ev.severidade] ?? INTERVALO_POR_SEVERIDADE.media;
  const agora = Date.now();

  if (agora - (ultimoEnvio.get(chave) || 0) < intervalo) {
    const acc = suprimidos.get(chave) || { tipo: ev.tipo, severidade: ev.severidade, descricao: ev.descricao, total: 0, ips: new Set() };
    acc.total++;
    if (ev.ip && acc.ips.size < 20) acc.ips.add(ev.ip);
    suprimidos.set(chave, acc);
    return;
  }

  ultimoEnvio.set(chave, agora);
  const anteriores = suprimidos.get(chave)?.total || 0;
  suprimidos.delete(chave);
  const { assunto, texto, html } = montarMensagem(ev, anteriores);
  dispararCanais(assunto, texto, html).catch(() => {});
}

// Resumo periódico do que foi suprimido pelo anti-flood.
setInterval(() => {
  if (!suprimidos.size) return;
  const itens = [...suprimidos.values()];
  suprimidos.clear();
  const total = itens.reduce((s, i) => s + i.total, 0);
  const titulo = `📋 Resumo de segurança: ${total} evento(s) nos últimos minutos`;
  const linhas = itens.map(i => `• ${i.descricao || i.tipo} [${i.severidade}] — ${i.total}x${i.ips.size ? ` · IPs: ${[...i.ips].join(", ")}` : ""}`);
  const texto = `${titulo}\n${nomeSite()}\n\n${linhas.join("\n")}\n\nPainel: ${(process.env.SITE_URL || "")}/admin-seguranca.html`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;"><h2>${esc(titulo)}</h2><ul>${linhas.map(l => `<li>${esc(l.slice(2))}</li>`).join("")}</ul></div>`;
  dispararCanais(titulo, texto, html).catch(() => {});
}, INTERVALO_RESUMO).unref();

// Alerta de teste disparado pelo painel — ignora o anti-flood e informa o resultado por canal.
async function enviarTeste(adminEmail) {
  const ev = {
    tipo: "teste_alerta", severidade: "info", descricao: "Alerta de teste disparado pelo painel de segurança",
    email: adminEmail, criadoEm: new Date()
  };
  const { assunto, texto, html } = montarMensagem(ev, 0);
  const canais = canaisConfigurados();
  const [webhook, telegram, email] = await dispararCanais(assunto, texto, html);
  const status = (ativo, r) => (!ativo ? "não configurado" : r.status === "fulfilled" ? "enviado" : `falhou: ${r.reason?.message || "erro"}`);
  return { webhook: status(canais.webhook, webhook), telegram: status(canais.telegram, telegram), email: status(canais.email, email) };
}

module.exports = { alertar, enviarTeste, canaisConfigurados };
