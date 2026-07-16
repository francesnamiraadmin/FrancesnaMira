// Envio de e-mail via API HTTP do Brevo (https://api.brevo.com) em vez de SMTP direto.
// Motivo: a hospedagem (Railway) bloqueia conexões SMTP de saída para o Gmail
// ("Connection timeout" tanto na porta 465 quanto na 587) — a API por HTTPS não
// sofre esse bloqueio.
const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

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

// Casco visual compartilhado por todos os e-mails transacionais: cabeçalho com o
// símbolo da mira + wordmark sobre o gradiente da marca, cartão branco com o
// conteúdo específico de cada e-mail, rodapé discreto.
function casco(conteudoHtml) {
  const logoUrl = `${process.env.SITE_URL || ""}/img/logo-mira.png`;
  return `
  <div style="background:#eef2f8; padding:32px 12px; font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:520px; margin:0 auto; background:#ffffff; border-radius:20px; overflow:hidden; box-shadow:0 12px 30px rgba(10,20,60,0.15);">
      <div style="background:linear-gradient(135deg,#0a0460,#1fa2ff); padding:30px 28px; text-align:center;">
        <table role="presentation" align="center" style="margin:0 auto;"><tr>
          <td style="padding-right:10px;"><img src="${logoUrl}" width="42" height="42" alt="" style="display:block;"></td>
          <td><span style="font-family:Georgia,'Times New Roman',serif; font-size:26px; font-weight:bold; color:#ffffff;">Francês na Mira</span></td>
        </tr></table>
      </div>
      <div style="padding:32px 30px; color:#16213a; font-size:15px; line-height:1.6;">
        ${conteudoHtml}
      </div>
      <div style="background:#f4f6fb; padding:18px 28px; text-align:center; font-size:12px; color:#8892a6;">
        © 2026 Francês na Mira · Este é um e-mail automático, não é necessário responder.
      </div>
    </div>
  </div>`;
}

function botao(href, texto) {
  return `<p style="text-align:center; margin:32px 0;">
    <a href="${href}" style="background:#ffd700; color:#16213a; padding:14px 34px; border-radius:30px; text-decoration:none; font-weight:bold; font-size:15px; display:inline-block;">${texto}</a>
  </p>`;
}

function linhaRecibo(rotulo, valor, ultima) {
  return `<tr>
    <td style="padding:10px 0; ${ultima ? "" : "border-bottom:1px solid #eee;"} color:#6b7385;">${rotulo}</td>
    <td style="padding:10px 0; ${ultima ? "" : "border-bottom:1px solid #eee;"} text-align:right; font-weight:600;">${valor}</td>
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
  await enviarViaAPI({
    destinatario,
    nome,
    assunto: "Confirme seu cadastro - Francês na Mira",
    html: casco(`
      <h2 style="margin-top:0;">Olá, ${nome}! 👋</h2>
      <p>Estamos muito felizes em ter você na nossa comunidade de estudantes de francês.</p>
      <p>Falta só um passo para ativar sua conta e começar a estudar:</p>
      ${botao(link, "Confirmar meu e-mail")}
      <p style="font-size:13px; color:#8892a6;">Se você não criou essa conta, pode ignorar este e-mail com segurança.</p>
    `)
  });
}

async function enviarEmailMatriculaConfirmada(destinatario, nome, detalhes) {
  await enviarViaAPI({
    destinatario,
    nome,
    assunto: "Matrícula confirmada - Francês na Mira",
    html: casco(`
      <h2 style="margin-top:0;">Parabéns, ${nome}! 🎉</h2>
      <p>Seu pagamento foi aprovado e sua matrícula está confirmada.</p>
      <p style="background:#f6f4ee; border-radius:12px; padding:16px 18px;">${detalhes}</p>
      <p>Acesse sua área do aluno para ver todos os detalhes, horários e materiais.</p>
      ${botao(`${process.env.SITE_URL || ""}/minhas-matriculas.html`, "Ver minha matrícula")}
    `)
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

  const linhas = [
    linhaRecibo("Produto", plano ? `${curso} — ${plano}` : curso),
    linhaRecibo("Valor pago", fmtMoeda(valor)),
    linhaRecibo("Forma de pagamento", METODO_PAGAMENTO_LABEL[metodoPagamento] || metodoPagamento || "—"),
    linhaRecibo("Data da inscrição", fmtData(dataInicio)),
    linhaRecibo("Válido até", fmtData(dataVencimento)),
    linhaRecibo("Comprovante", mercadoPagoId || "—", true)
  ].join("");

  await enviarViaAPI({
    destinatario,
    nome,
    assunto: "Pagamento aprovado - Francês na Mira",
    html: casco(`
      <h2 style="margin-top:0;">Pagamento aprovado! 🎉</h2>
      <p>Olá, ${nome}. Recebemos a confirmação do seu pagamento e sua assinatura já está ativa.</p>
      <table role="presentation" style="width:100%; border-collapse:collapse; margin:24px 0; font-size:14px;">
        ${linhas}
      </table>
      ${botao(`${process.env.SITE_URL || ""}/minha-conta.html`, "Acessar minha conta")}
      <p style="font-size:13px; color:#8892a6;">Guarde este e-mail como comprovante da sua compra.</p>
    `)
  });
}

async function enviarEmailPagamentoRejeitado(destinatario, nome) {
  await enviarViaAPI({
    destinatario,
    nome,
    assunto: "Pagamento não aprovado - Francês na Mira",
    html: casco(`
      <h2 style="margin-top:0; color:#b33;">Olá, ${nome}</h2>
      <p>Infelizmente não conseguimos confirmar seu pagamento para a matrícula solicitada.</p>
      <p>Você pode tentar novamente com outro método de pagamento a qualquer momento.</p>
      ${botao(`${process.env.SITE_URL || ""}/matricula.html`, "Tentar novamente")}
    `)
  });
}

async function enviarEmailRedefinicaoSenha(destinatario, nome, link) {
  await enviarViaAPI({
    destinatario,
    nome,
    assunto: "Redefinição de senha - Francês na Mira",
    html: casco(`
      <h2 style="margin-top:0;">Olá, ${nome}!</h2>
      <p>Recebemos um pedido para redefinir a senha da sua conta.</p>
      ${botao(link, "Redefinir minha senha")}
      <p style="font-size:13px; color:#8892a6;">Este link expira em 1 hora e só pode ser usado uma vez. Se você não pediu essa redefinição, pode ignorar este e-mail com segurança — sua senha continua a mesma.</p>
    `)
  });
}

// Encaminha o formulário de "Reclame Aqui" (canal próprio do site) para o e-mail da
// administração — não tem relação com o serviço externo reclameaqui.com.br.
async function enviarEmailReclamacao({ nome, email, assunto, mensagem }) {
  await enviarViaAPI({
    destinatario: process.env.EMAIL_USER,
    nome: "Equipe Francês na Mira",
    assunto: `Reclame Aqui: ${assunto || "Nova mensagem"}`,
    html: casco(`
      <h2 style="margin-top:0;">Nova mensagem em Reclame Aqui</h2>
      <table role="presentation" style="width:100%; border-collapse:collapse; margin:16px 0; font-size:14px;">
        ${linhaRecibo("Nome", nome || "—")}
        ${linhaRecibo("E-mail", email || "—", true)}
      </table>
      <p style="white-space:pre-wrap; background:#f6f4ee; border-radius:12px; padding:16px 18px;">${mensagem || ""}</p>
    `)
  });
}

module.exports = {
  enviarEmailConfirmacao,
  enviarEmailRedefinicaoSenha,
  enviarEmailMatriculaConfirmada,
  enviarEmailPagamentoAprovado,
  enviarEmailPagamentoRejeitado,
  enviarEmailReclamacao
};
