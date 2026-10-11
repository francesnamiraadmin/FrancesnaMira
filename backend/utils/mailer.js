// Envio de e-mail via API HTTP do Brevo (https://api.brevo.com) em vez de SMTP direto.
// Motivo: a hospedagem (Railway) bloqueia conexões SMTP de saída para o Gmail
// ("Connection timeout" tanto na porta 465 quanto na 587) — a API por HTTPS não
// sofre esse bloqueio.
const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";
const { escaparHtml: esc } = require("../middleware/seguranca");

const METODO_PAGAMENTO_LABEL = {
  cartao_credito: "Cartão de crédito",
  cartao_debito: "Cartão de débito",
  pix: "Pix",
  boleto: "Boleto"
};

function fmtData(data) {
  if (!data) return "—";
  return new Date(data).toLocaleDateString("pt-BR");
}

function fmtMoeda(valor) {
  if (valor === undefined || valor === null) return "—";
  return Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Slogan da marca — aparece no cabeçalho e no rodapé de todos os e-mails.
const SLOGAN = "Acerte o alvo: fale francês com confiança.";

// Imagens dos e-mails precisam de URL pública absoluta (o cliente de e-mail busca a
// imagem fora do site). Usa SITE_URL quando é um endereço público https; senão (ambiente
// local ou variável ausente) cai no repositório público do GitHub, que serve o mesmo arquivo.
const REPO_RAW = "https://raw.githubusercontent.com/francesnamiraadmin/FrancesnaMira/master/public";
function urlPublica(caminho) {
  const site = (process.env.SITE_URL || "").replace(/\/+$/, "");
  const base = /^https:\/\//.test(site) && !/localhost|127\.0\.0\.1/.test(site) ? site : REPO_RAW;
  return `${base}${caminho}`;
}
// Links clicáveis apontam sempre para o site (nunca para o GitHub).
const urlSite = caminho => `${(process.env.SITE_URL || "").replace(/\/+$/, "")}${caminho}`;

// Fotos de Paris hospedadas no Wikimedia Commons (mesma fonte do carrossel da home).
const FOTOS = {
  boasVindas: {
    src: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/08/Seine_and_Eiffel_Tower_from_Tour_Saint_Jacques_2013-08.JPG/1280px-Seine_and_Eiffel_Tower_from_Tour_Saint_Jacques_2013-08.JPG",
    alt: "Vista de Paris com a Torre Eiffel e o rio Sena"
  },
  compra: {
    src: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/59/Pen-writing-notes-studying.jpg/960px-Pen-writing-notes-studying.jpg",
    alt: "Mão escrevendo anotações de estudo em um caderno"
  }
};

const primeiroNome = nome => String(nome || "").trim().split(/\s+/)[0] || "aluno";

// Casco visual compartilhado por todos os e-mails transacionais: cabeçalho com a
// logo (wordmark + alvo, versão branca de Imagens/header-logo.jpg) e slogan sobre o gradiente da marca, foto opcional,
// cartão branco com o conteúdo específico de cada e-mail e rodapé com o slogan.
// Feito em tabelas com estilos inline para renderizar igual no Gmail, Outlook e celular.
function casco(conteudoHtml, { preheader = "", foto = null } = {}) {
  const logoUrl = urlPublica("/img/email/logo-frances-na-mira-branco.png");
  const site = urlSite("/");
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>Francês na Mira</title></head>
<body style="margin:0; padding:0; background:#eef2f8;">
  <div style="display:none; max-height:0; overflow:hidden; opacity:0; color:transparent;">${esc(preheader)}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eef2f8;">
    <tr><td align="center" style="padding:28px 12px; font-family:Arial,Helvetica,sans-serif;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%; max-width:600px; background:#ffffff; border-radius:22px; overflow:hidden; box-shadow:0 14px 36px rgba(10,20,60,0.16);">
        <tr><td align="center" style="background-color:#0a0460; background-image:linear-gradient(135deg,#0a0460 0%,#123a9c 55%,#1fa2ff 100%); padding:34px 24px 30px;">
          <img src="${logoUrl}" width="360" alt="Francês na Mira" style="display:block; margin:0 auto; width:360px; max-width:100%; height:auto; border:0; font-family:Georgia,'Times New Roman',serif; font-size:30px; font-weight:bold; color:#ffffff;">
          <div style="margin-top:18px; font-family:Georgia,'Times New Roman',serif; font-style:italic; font-size:16px; color:#ffd700;">${SLOGAN}</div>
        </td></tr>
        ${foto ? `<tr><td style="line-height:0; font-size:0;"><img src="${foto.src}" width="600" alt="${esc(foto.alt)}" style="display:block; width:100%; max-width:600px; height:auto; border:0;"></td></tr>
        <tr><td style="height:6px; background:#ffd700; line-height:6px; font-size:0;">&nbsp;</td></tr>` : ""}
        <tr><td style="padding:36px 36px 30px; color:#16213a; font-size:16px; line-height:1.65;">
          ${conteudoHtml}
        </td></tr>
        <tr><td align="center" style="background:#0a0460; padding:26px 24px; font-size:12px; line-height:1.6; color:#aab6d6;">
          <img src="${logoUrl}" width="200" alt="Francês na Mira" style="display:block; margin:0 auto 12px; width:200px; height:auto; border:0; font-family:Georgia,'Times New Roman',serif; font-size:16px; font-weight:bold; color:#ffffff;">
          <div style="font-family:Georgia,'Times New Roman',serif; font-style:italic; font-size:14px; color:#ffd700; margin-bottom:8px;">${SLOGAN}</div>
          <a href="${esc(site)}" style="color:#ffffff; text-decoration:none; font-weight:bold;">Francês na Mira</a> · © 2026<br>
          Este é um e-mail automático, não é necessário responder.<br>
          <span style="color:#7d89ab;">Fotos: Wikimedia Commons</span>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function botao(href, texto) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:30px auto;"><tr>
    <td align="center" style="background:#ffd700; border-radius:32px; box-shadow:0 6px 16px rgba(255,190,0,0.35);">
      <a href="${esc(href)}" style="display:inline-block; padding:16px 40px; color:#0a0460; text-decoration:none; font-weight:bold; font-size:16px; font-family:Arial,Helvetica,sans-serif;">${texto}</a>
    </td>
  </tr></table>`;
}

// Selo pequeno em cima do título ("Bienvenue", "Paiement confirmé"...).
function selo(texto, cor = "#1273c9", fundo = "#e6f3ff") {
  return `<div style="display:inline-block; background:${fundo}; color:${cor}; border-radius:20px; padding:6px 14px; font-size:12px; font-weight:bold; letter-spacing:1.2px; text-transform:uppercase; margin-bottom:14px;">${texto}</div>`;
}

// Lista de itens com ícone (emoji) em círculo — usada em "o que te espera" e "próximos passos".
function listaIcones(itens) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 6px;">
    ${itens.map(([icone, titulo, texto]) => `<tr>
      <td width="52" valign="top" style="padding:10px 0;"><div style="width:42px; height:42px; line-height:42px; text-align:center; background:#eef2fb; border-radius:50%; font-size:20px;">${icone}</div></td>
      <td valign="top" style="padding:10px 0 10px 8px; font-size:15px; line-height:1.5;"><b style="color:#0a0460;">${titulo}</b><br><span style="color:#5b6478;">${texto}</span></td>
    </tr>`).join("")}
  </table>`;
}

function assinatura() {
  return `<p style="margin:28px 0 0; color:#16213a;">À bientôt,<br><b style="font-family:Georgia,'Times New Roman',serif; font-size:17px; color:#0a0460;">Equipe Francês na Mira</b> 🎯</p>`;
}

function linhaRecibo(rotulo, valor, ultima) {
  return `<tr>
    <td style="padding:10px 0; ${ultima ? "" : "border-bottom:1px solid #eee;"} color:#6b7385;">${esc(rotulo)}</td>
    <td style="padding:10px 0; ${ultima ? "" : "border-bottom:1px solid #eee;"} text-align:right; font-weight:600;">${esc(valor)}</td>
  </tr>`;
}

async function enviarViaAPI({ destinatario, nome, assunto, html }) {
  const res = await fetch(BREVO_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "api-key": process.env.BREVO_API_KEY
    },
    body: JSON.stringify({
      sender: { name: "Francês na Mira", email: process.env.EMAIL_USER },
      to: [{ email: destinatario, name: nome }],
      subject: assunto,
      htmlContent: html
    })
  });

  if (!res.ok) {
    const corpo = await res.text().catch(() => "");
    throw new Error(`Brevo respondeu ${res.status}: ${corpo}`);
  }
}

async function enviarEmailConfirmacao(destinatario, nome, link) {
  const pn = esc(primeiroNome(nome));
  await enviarViaAPI({
    destinatario,
    nome,
    assunto: `Bienvenue, ${primeiroNome(nome)}! Confirme seu e-mail - Francês na Mira`,
    html: casco(`
      ${selo("Bienvenue")}
      <h1 style="margin:0 0 16px; font-family:Georgia,'Times New Roman',serif; font-size:28px; line-height:1.25; color:#0a0460;">Que alegria ter você aqui, ${pn}!</h1>
      <p style="margin:0 0 14px;">Você acaba de dar um passo importante. Cada pessoa que chega ao Francês na Mira traz um objetivo — uma prova, um novo país, uma carreira, um sonho antigo — e nós levamos o seu tão a sério quanto você.</p>
      <p style="margin:0;">Para ativar sua conta e garantir que tudo chegue certinho até você, só falta confirmar seu e-mail:</p>
      ${botao(link, "Confirmar meu e-mail")}
      <div style="background:#f6f8fd; border-radius:16px; padding:20px 22px; margin:6px 0 4px;">
        <div style="font-family:Georgia,'Times New Roman',serif; font-size:18px; font-weight:bold; color:#0a0460; margin-bottom:4px;">O que te espera por aqui</div>
        ${listaIcones([
          ["🎯", "Plataforma de Questões", "Milhares de questões no estilo das provas oficiais, com explicações."],
          ["✍️", "Ambiente de Produção", "Escreva e grave suas respostas e receba correções detalhadas."],
          ["📅", "Meu Espaço", "Seu plano de estudos, metas e progresso, tudo em um só lugar."]
        ])}
      </div>
      ${assinatura()}
      <p style="margin:26px 0 0; font-size:12px; line-height:1.5; color:#8892a6;">Se o botão não funcionar, copie e cole este endereço no navegador:<br><a href="${esc(link)}" style="color:#1273c9; word-break:break-all;">${esc(link)}</a></p>
      <p style="margin:12px 0 0; font-size:12px; color:#8892a6;">Se você não criou esta conta, pode ignorar este e-mail com segurança.</p>
    `, { preheader: "Falta só um clique para ativar sua conta e começar a estudar.", foto: FOTOS.boasVindas })
  });
}

// Bloco de destaque da compra: valor em evidência + linhas do comprovante.
function cartaoRecibo(titulo, valor, linhas) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 6px; border:1px solid #e3e8f3; border-radius:16px; border-collapse:separate; overflow:hidden;">
    <tr><td style="background:#f6f8fd; padding:18px 22px; border-bottom:1px solid #e3e8f3;">
      <div style="font-size:12px; letter-spacing:1.2px; text-transform:uppercase; color:#6b7385; font-weight:bold;">${esc(titulo)}</div>
      ${valor ? `<div style="font-family:Georgia,'Times New Roman',serif; font-size:30px; font-weight:bold; color:#0a0460; margin-top:4px;">${esc(valor)}</div>` : ""}
    </td></tr>
    <tr><td style="padding:6px 22px 10px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size:14px;">${linhas}</table>
    </td></tr>
  </table>`;
}

async function enviarEmailMatriculaConfirmada(destinatario, nome, detalhes) {
  const pn = esc(primeiroNome(nome));
  await enviarViaAPI({
    destinatario,
    nome,
    assunto: `Félicitations, ${primeiroNome(nome)}! Matrícula confirmada - Francês na Mira`,
    html: casco(`
      ${selo("✓ Matrícula confirmada", "#13804a", "#e5f6ec")}
      <h1 style="margin:0 0 16px; font-family:Georgia,'Times New Roman',serif; font-size:28px; line-height:1.25; color:#0a0460;">Félicitations, ${pn}! Alvo atingido 🎉</h1>
      <p style="margin:0 0 14px;">Seu pagamento foi aprovado e sua vaga está garantida. Obrigado pela confiança — é uma honra fazer parte da sua caminhada no francês.</p>
      <div style="background:#fff9db; border-left:5px solid #ffd700; border-radius:12px; padding:16px 20px; margin:20px 0; color:#16213a;">${esc(detalhes)}</div>
      <p style="margin:0;">Na sua área do aluno você encontra todos os detalhes, horários e materiais da turma.</p>
      ${botao(`${urlSite("/minhas-matriculas.html")}`, "Ver minha matrícula")}
      ${assinatura()}
    `, { preheader: "Sua vaga está garantida. Bem-vindo(a) à turma!", foto: FOTOS.compra })
  });
}

// Comprovante de pagamento aprovado para assinaturas de plano de curso (Essentiel/Avancé/
// Excellence) ou produtos avulsos do Pack Prestige — disparado a partir de ativarPlano()/
// ativarPackPrestige() em routes/pagamentos.js, tanto na aprovação imediata (cartão) quanto
// na aprovação assíncrona via webhook (Pix/boleto).
async function enviarEmailPagamentoAprovado(destinatario, nome, detalhes) {
  const {
    curso, plano, valor, metodoPagamento, dataInicio, dataVencimento, mercadoPagoId
  } = detalhes;
  const pn = esc(primeiroNome(nome));
  const produto = plano ? `${curso} — ${plano}` : curso;

  const linhas = [
    linhaRecibo("Produto", produto),
    linhaRecibo("Forma de pagamento", METODO_PAGAMENTO_LABEL[metodoPagamento] || metodoPagamento || "—"),
    linhaRecibo("Data da inscrição", fmtData(dataInicio)),
    linhaRecibo("Válido até", fmtData(dataVencimento)),
    linhaRecibo("Comprovante", mercadoPagoId || "—", true)
  ].join("");

  await enviarViaAPI({
    destinatario,
    nome,
    assunto: `Félicitations, ${primeiroNome(nome)}! Seu plano está ativo - Francês na Mira`,
    html: casco(`
      ${selo("✓ Pagamento aprovado", "#13804a", "#e5f6ec")}
      <h1 style="margin:0 0 16px; font-family:Georgia,'Times New Roman',serif; font-size:28px; line-height:1.25; color:#0a0460;">Félicitations, ${pn}! Sua jornada começa agora 🎉</h1>
      <p style="margin:0 0 14px;">Obrigado por escolher o Francês na Mira. Investir no seu francês é investir em você — e a partir de hoje a gente caminha junto, de cada exercício até o dia da prova.</p>
      <p style="margin:0;">Seu acesso já está liberado. Aqui está o resumo da sua compra:</p>
      ${cartaoRecibo("Valor pago", fmtMoeda(valor), linhas)}
      ${botao(`${urlSite("/meu-espaco.html")}`, "Começar a estudar agora")}
      <div style="background:#f6f8fd; border-radius:16px; padding:20px 22px; margin:6px 0 4px;">
        <div style="font-family:Georgia,'Times New Roman',serif; font-size:18px; font-weight:bold; color:#0a0460; margin-bottom:4px;">Seus próximos passos</div>
        ${listaIcones([
          ["1️⃣", "Entre no Meu Espaço", "É a sua central: plano, metas, deveres e mensagens."],
          ["2️⃣", "Faça sua primeira atividade", "Comece pela Plataforma de Questões para medir seu nível."],
          ["3️⃣", "Mantenha o ritmo", "Pouco por dia, todo dia: é assim que se acerta o alvo."]
        ])}
      </div>
      ${assinatura()}
      <p style="margin:24px 0 0; font-size:12px; color:#8892a6;">Guarde este e-mail como comprovante da sua compra.</p>
    `, { preheader: `Pagamento aprovado: ${produto} já está ativo na sua conta.`, foto: FOTOS.compra })
  });
}

async function enviarEmailPagamentoRejeitado(destinatario, nome) {
  await enviarViaAPI({
    destinatario,
    nome,
    assunto: "Pagamento não aprovado - Francês na Mira",
    html: casco(`
      <h2 style="margin-top:0; color:#b33;">Olá, ${esc(nome)}</h2>
      <p>Infelizmente não conseguimos confirmar seu pagamento para a matrícula solicitada.</p>
      <p>Você pode tentar novamente com outro método de pagamento a qualquer momento.</p>
      ${botao(`${urlSite("/matricula.html")}`, "Tentar novamente")}
    `)
  });
}

async function enviarEmailRedefinicaoSenha(destinatario, nome, link) {
  await enviarViaAPI({
    destinatario,
    nome,
    assunto: "Redefinição de senha - Francês na Mira",
    html: casco(`
      <h2 style="margin-top:0;">Olá, ${esc(nome)}!</h2>
      <p>Recebemos um pedido para redefinir a senha da sua conta.</p>
      ${botao(link, "Redefinir minha senha")}
      <p style="font-size:13px; color:#8892a6;">Este link expira em 1 hora e só pode ser usado uma vez. Se você não pediu essa redefinição, pode ignorar este e-mail com segurança — sua senha continua a mesma.</p>
    `)
  });
}

// Aviso de segurança: a senha da conta foi trocada (pela própria pessoa, nas Configurações).
async function enviarEmailSenhaAlterada(destinatario, nome, { quando, ip, link }) {
  const data = new Date(quando || Date.now()).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  await enviarViaAPI({
    destinatario,
    nome,
    assunto: "Sua senha foi alterada - Francês na Mira",
    html: casco(`
      <h2 style="margin-top:0;">Olá, ${esc(nome)}!</h2>
      <p>A senha da sua conta foi alterada em <b>${esc(data)}</b>${ip ? ` (IP ${esc(ip)})` : ""}. Por segurança, encerramos as sessões abertas nos outros dispositivos.</p>
      <p>Se foi você, não precisa fazer nada.</p>
      <p><b>Se não foi você</b>, redefina sua senha agora pelo « Esqueci minha senha » na página de login e fale com a nossa equipe.</p>
      ${botao(link, "Ir para o login")}
    `)
  });
}

// Encaminha o formulário de "Reclame Aqui" (canal próprio do site) para o e-mail da
// administração — não tem relação com o serviço externo reclameaqui.com.br.
async function enviarEmailReclamacao({ nome, email, assunto, mensagem }) {
  await enviarViaAPI({
    destinatario: process.env.EMAIL_USER,
    nome: "Equipe Francês na Mira",
    assunto: `Reclame Aqui: ${String(assunto || "Nova mensagem").replace(/[\r\n]+/g, " ").slice(0, 150)}`,
    html: casco(`
      <h2 style="margin-top:0;">Nova mensagem em Reclame Aqui</h2>
      <table role="presentation" style="width:100%; border-collapse:collapse; margin:16px 0; font-size:14px;">
        ${linhaRecibo("Nome", nome || "—")}
        ${linhaRecibo("E-mail", email || "—", true)}
      </table>
      <p style="white-space:pre-wrap; background:#f6f4ee; border-radius:12px; padding:16px 18px;">${esc(mensagem || "")}</p>
    `)
  });
}

module.exports = {
  enviarEmailConfirmacao,
  enviarEmailRedefinicaoSenha,
  enviarEmailSenhaAlterada,
  enviarEmailMatriculaConfirmada,
  enviarEmailPagamentoAprovado,
  enviarEmailPagamentoRejeitado,
  enviarEmailReclamacao
};
