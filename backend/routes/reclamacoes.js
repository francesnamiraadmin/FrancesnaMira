const express = require("express");
const router = express.Router();
const { enviarEmailReclamacao } = require("../utils/mailer");
const { limitarTaxa, normalizarEmail, textoSeguro } = require("../middleware/seguranca");

// Rota pública que dispara e-mail — limitada por IP para não virar canal de spam.
const limiteReclamacoes = limitarTaxa({
  nome: "reclamacoes", janelaMs: 60 * 60 * 1000, max: 5,
  msg: "Você já enviou várias mensagens recentemente. Tente novamente mais tarde."
});

// Canal próprio de reclamações/feedback do site ("Reclame Aqui") — encaminha por
// e-mail para a administração. Sem autenticação: qualquer visitante pode enviar.
router.post("/", limiteReclamacoes, async (req, res) => {
  try {
    const nome = textoSeguro(req.body.nome, 120);
    const assunto = textoSeguro(req.body.assunto, 150);
    const mensagem = textoSeguro(req.body.mensagem, 5000);
    if (!nome || !req.body.email || !mensagem) {
      return res.status(400).json({ msg: "Preencha nome, e-mail e mensagem." });
    }
    const email = normalizarEmail(req.body.email);
    if (!email) return res.status(400).json({ msg: "Informe um e-mail válido." });

    await enviarEmailReclamacao({ nome, email, assunto, mensagem });
    res.json({ msg: "Recebemos sua mensagem! Nossa equipe vai analisar e retornar o quanto antes." });
  } catch (err) {
    console.error("Erro ao enviar reclamação:", err.message);
    res.status(500).json({ msg: "Não foi possível enviar sua mensagem agora. Tente novamente em instantes." });
  }
});

module.exports = router;
