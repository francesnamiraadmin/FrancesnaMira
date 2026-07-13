const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const User = require("../models/user");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { enviarEmailConfirmacao } = require("../utils/mailer");
const { exigirAuth } = require("../middleware/auth");

// CADASTRO
router.post("/register", async (req, res) => {
  try {
    const { nome, email, senha } = req.body;

    if (!nome || !email || !senha) {
      return res.status(400).json({ msg: "Preencha todos os campos" });
    }
    if (senha.length < 6) {
      return res.status(400).json({ msg: "A senha deve ter pelo menos 6 caracteres" });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) return res.status(400).json({ msg: "Usuário já existe" });

    const hash = await bcrypt.hash(senha, 10);
    const tokenVerificacao = crypto.randomBytes(32).toString("hex");

    const user = new User({
      nome,
      email: email.toLowerCase(),
      senha: hash,
      tokenVerificacao
    });
    await user.save();

    const link = `${req.protocol}://${req.get("host")}/api/auth/confirmar/${tokenVerificacao}`;
    try {
      await enviarEmailConfirmacao(user.email, user.nome, link);
    } catch (mailErr) {
      console.error("Erro ao enviar e-mail de confirmação:", mailErr.message);
    }

    res.json({ msg: "Cadastro realizado! Verifique seu e-mail para confirmar a conta." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor. Tente novamente." });
  }
});

// REENVIAR E-MAIL DE CONFIRMAÇÃO
router.post("/reenviar-confirmacao", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ msg: "Informe o e-mail" });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(400).json({ msg: "Não encontramos uma conta com esse e-mail" });

    if (user.verificado) {
      return res.status(400).json({ msg: "Este e-mail já está confirmado. Você já pode entrar." });
    }

    const tokenVerificacao = crypto.randomBytes(32).toString("hex");
    user.tokenVerificacao = tokenVerificacao;
    await user.save();

    const link = `${req.protocol}://${req.get("host")}/api/auth/confirmar/${tokenVerificacao}`;
    await enviarEmailConfirmacao(user.email, user.nome, link);

    res.json({ msg: "E-mail de confirmação reenviado! Verifique sua caixa de entrada." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro ao reenviar o e-mail. Tente novamente." });
  }
});

// CONFIRMAÇÃO DE E-MAIL
router.get("/confirmar/:token", async (req, res) => {
  try {
    const user = await User.findOne({ tokenVerificacao: req.params.token });
    if (!user) {
      return res.redirect("/login.html?confirmado=erro");
    }

    user.verificado = true;
    user.tokenVerificacao = undefined;
    await user.save();

    res.redirect("/login.html?confirmado=1");
  } catch (err) {
    console.error(err);
    res.redirect("/login.html?confirmado=erro");
  }
});

// LOGIN
router.post("/login", async (req, res) => {
  try {
    const { email, senha } = req.body;

    if (!email || !senha) {
      return res.status(400).json({ msg: "Preencha todos os campos" });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(400).json({ msg: "Usuário não encontrado" });

    const isMatch = await bcrypt.compare(senha, user.senha);
    if (!isMatch) return res.status(400).json({ msg: "Senha incorreta" });

    if (!user.verificado) {
      return res.status(403).json({ msg: "Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada." });
    }

    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "1d" });
    res.json({ token, nome: user.nome, role: user.role });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor. Tente novamente." });
  }
});

// DADOS DO USUÁRIO LOGADO (nome, email, plano ativo, perfil, papel, créditos)
router.get("/me", exigirAuth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("nome email plano perfil role creditosCorrecao especialidades temasFavoritos");
    if (!user) return res.status(404).json({ msg: "Usuário não encontrado" });

    // Expira o plano automaticamente 30 dias após a ativação
    if (user.plano?.ativo && user.plano.dataVencimento && user.plano.dataVencimento < new Date()) {
      user.plano.ativo = false;
      await user.save();
    }

    res.json({
      nome: user.nome,
      email: user.email,
      plano: user.plano || { ativo: false },
      perfil: user.perfil || {},
      role: user.role || "aluno",
      creditosCorrecao: user.creditosCorrecao || 0,
      especialidades: user.especialidades || [],
      temasFavoritos: user.temasFavoritos || []
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor. Tente novamente." });
  }
});

// ATUALIZAR PERFIL (foto, bio, interesses, prova alvo, data da prova)
router.put("/perfil", exigirAuth, async (req, res) => {
  try {
    const { foto, bio, interesses, provaAlvo, dataProva } = req.body;

    if (foto && foto.length > 1_500_000) {
      return res.status(400).json({ msg: "A imagem é muito grande. Escolha uma foto menor." });
    }

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ msg: "Usuário não encontrado" });

    user.perfil = {
      foto: foto !== undefined ? foto : user.perfil?.foto,
      bio: bio !== undefined ? bio : user.perfil?.bio,
      interesses: interesses !== undefined ? interesses : user.perfil?.interesses,
      provaAlvo: provaAlvo !== undefined ? provaAlvo : user.perfil?.provaAlvo,
      dataProva: dataProva !== undefined ? (dataProva || null) : user.perfil?.dataProva
    };
    await user.save();

    res.json({ msg: "Perfil atualizado com sucesso!", perfil: user.perfil });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor. Tente novamente." });
  }
});

module.exports = router;