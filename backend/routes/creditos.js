const express = require("express");
const router = express.Router();
const User = require("../models/user");
const { exigirAuth, exigirProfessor } = require("../middleware/auth");
const { normalizarEmail } = require("../middleware/seguranca");
const { registrar } = require("../utils/monitorSeguranca");

// CONCEDER CRÉDITOS DE CORREÇÃO — acessível a professores e administradores
router.post("/", exigirAuth, exigirProfessor, async (req, res) => {
  try {
    const email = normalizarEmail(req.body.email);
    const quantidade = Number(req.body.quantidade);
    if (!email || !quantidade) return res.status(400).json({ msg: "Informe e-mail e quantidade." });
    // Inteiro dentro de uma faixa sensata (permite estorno com valor negativo).
    if (!Number.isInteger(quantidade) || Math.abs(quantidade) > 1000) {
      return res.status(400).json({ msg: "Quantidade inválida." });
    }
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ msg: "Usuário não encontrado." });
    user.creditosCorrecao = Math.max(0, (user.creditosCorrecao || 0) + quantidade);
    await user.save();
    registrar("acao_administrativa", req, { acao: "créditos de correção ajustados", alunoEmail: user.email, quantidade });
    res.json({ msg: `Créditos atualizados. Saldo atual de ${user.nome}: ${user.creditosCorrecao}.`, creditos: user.creditosCorrecao });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

module.exports = router;
