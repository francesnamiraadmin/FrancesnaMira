const nodemailer = require("nodemailer");

// host/porta explícitos (587 + STARTTLS) em vez do atalho service:"gmail" (que usa a
// porta 465/SSL) — alguns provedores de hospedagem bloqueiam a 465 e liberam a 587.
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  requireTLS: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

async function enviarEmailConfirmacao(destinatario, nome, link) {
  await transporter.sendMail({
    from: `"Francês na Mira" <${process.env.EMAIL_USER}>`,
    to: destinatario,
    subject: "Confirme seu cadastro - Francês na Mira",
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
  await transporter.sendMail({
    from: `"Francês na Mira" <${process.env.EMAIL_USER}>`,
    to: destinatario,
    subject: "Matrícula confirmada - Francês na Mira",
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
  await transporter.sendMail({
    from: `"Francês na Mira" <${process.env.EMAIL_USER}>`,
    to: destinatario,
    subject: "Pagamento não aprovado - Francês na Mira",
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
