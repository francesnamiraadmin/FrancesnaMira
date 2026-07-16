const express = require("express");
const router = express.Router();
const { enviarEmailReclamacao } = require("../utils/mailer");

// Canal próprio de reclamações/feedback do site ("Reclame Aqui") — encaminha por
// e-mail para a administração. Sem autenticação: qualquer visitante pode enviar.
router.post("/", async (req, res) => {
  try {
    const { nome, email, assunto, mensagem } = req.body;
    if (!nome || !email || !mensagem) {
      return res.status(400).json({ msg: "Preencha nome, e-mail e mensagem." });
    }

    await enviarEmailReclamacao({ nome, email, assunto, mensagem });
    res.json({ msg: "Recebemos sua mensagem! Nossa equipe vai analisar e retornar o quanto antes." });
  } catch (err) {
    console.error("Erro ao enviar reclamação:", err.message);
    res.status(500).json({ msg: "Não foi possível enviar sua mensagem agora. Tente novamente em instantes." });
  }
});

module.exports = router;
