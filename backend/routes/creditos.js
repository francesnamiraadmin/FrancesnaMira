const express = require("express");
const router = express.Router();
const User = require("../models/user");
const { exigirAuth, exigirProfessor } = require("../middleware/auth");

// CONCEDER CRÉDITOS DE CORREÇÃO — acessível a professores e administradores
router.post("/", exigirAuth, exigirProfessor, async (req, res) => {
  try {
    const { email, quantidade } = req.body;
    if (!email || !quantidade) return res.status(400).json({ msg: "Informe e-mail e quantidade." });
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(404).json({ msg: "Usuário não encontrado." });
    user.creditosCorrecao = (user.creditosCorrecao || 0) + Number(quantidade);
    await user.save();
    res.json({ msg: `Créditos atualizados. Saldo atual de ${user.nome}: ${user.creditosCorrecao}.`, creditos: user.creditosCorrecao });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

module.exports = router;
