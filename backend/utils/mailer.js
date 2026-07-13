// Envio de e-mail via API HTTP do Brevo (https://api.brevo.com) em vez de SMTP direto.
// Motivo: a hospedagem (Railway) bloqueia conexões SMTP de saída para o Gmail
// ("Connection timeout" tanto na porta 465 quanto na 587) — a API por HTTPS não
// sofre esse bloqueio.
const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

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
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: auto;">
        <h2 style="color:#08203e;">Olá, ${nome}!</h2>
        <p>Obrigado por se cadastrar na plataforma <strong>Francês na Mira</strong>.</p>
        <p>Clique no botão abaixo para confirmar seu e-mail e ativar sua conta:</p>
        <p style="text-align:center; margin: 30px 0;">
          <a href="${link}" style="background:#ffeb3b; color:#08203e; padding:12px 28px; border-radius:8px; text-decoration:none; font-weight:bold;">Confirmar e-mail</a>
        </p>
        <p style="font-size: 0.85rem; color: #666;">Se você não criou essa conta, apenas ignore este e-mail.</p>
      </div>
    `
  });
}

async function enviarEmailMatriculaConfirmada(destinatario, nome, detalhes) {
  await enviarViaAPI({
    destinatario,
    nome,
    assunto: "Matrícula confirmada - Francês na Mira",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: auto;">
        <h2 style="color:#3f5d3a;">Parabéns, ${nome}!</h2>
        <p>Seu pagamento foi aprovado e sua matrícula está confirmada.</p>
        <p style="background:#f6f4ee; border-radius:8px; padding:16px;">${detalhes}</p>
        <p>Acesse sua área do aluno para ver todos os detalhes, horários e materiais.</p>
        <p style="text-align:center; margin: 30px 0;">
          <a href="${process.env.SITE_URL || ""}/minhas-matriculas.html" style="background:#c8a548; color:#1f2a1c; padding:12px 28px; border-radius:8px; text-decoration:none; font-weight:bold;">Ver minha matrícula</a>
        </p>
      </div>
    `
  });
}

async function enviarEmailPagamentoRejeitado(destinatario, nome) {
  await enviarViaAPI({
    destinatario,
    nome,
    assunto: "Pagamento não aprovado - Francês na Mira",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: auto;">
        <h2 style="color:#a33;">Olá, ${nome}</h2>
        <p>Infelizmente não conseguimos confirmar seu pagamento para a matrícula solicitada.</p>
        <p>Você pode tentar novamente com outro método de pagamento a qualquer momento.</p>
      </div>
    `
  });
}

module.exports = { enviarEmailConfirmacao, enviarEmailMatriculaConfirmada, enviarEmailPagamentoRejeitado };
