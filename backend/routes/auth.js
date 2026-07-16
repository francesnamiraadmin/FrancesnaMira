const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const User = require("../models/user");
const Matricula = require("../models/matricula");
const Pedido = require("../models/pedido");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { enviarEmailConfirmacao, enviarEmailRedefinicaoSenha } = require("../utils/mailer");
const { exigirAuth } = require("../middleware/auth");

// ---------- SESSÃO PERSISTENTE ("Manter-me conectado") ----------
// Access token de vida curta (assinado a cada login/refresh) + refresh token de
// vida longa guardado como cookie httpOnly (nunca acessível via JS) e cujo hash
// (nunca o valor puro) fica salvo no usuário, permitindo revogar/rotacionar sem
// expor nada reaproveitável caso o banco vaze.
const REFRESH_COOKIE = "refreshToken";
const REFRESH_DIAS = 30;
const cookieRefreshOpts = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/api/auth",
  maxAge: REFRESH_DIAS * 24 * 60 * 60 * 1000
};

function assinarAccessToken(user) {
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "1d" });
}

function hashToken(raw) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

async function emitirRefreshToken(user) {
  const raw = crypto.randomBytes(40).toString("hex");
  const expiraEm = new Date(Date.now() + REFRESH_DIAS * 24 * 60 * 60 * 1000);
  // Mantém no máximo os 4 tokens mais recentes ainda válidos (multi-dispositivo
  // sem deixar o array crescer indefinidamente).
  user.refreshTokens = (user.refreshTokens || []).filter(rt => rt.expiraEm > new Date()).slice(-4);
  user.refreshTokens.push({ tokenHash: hashToken(raw), expiraEm });
  await user.save();
  return raw;
}

// CADASTRO
router.post("/register", async (req, res) => {
  try {
    const { nome, sobrenome, email, senha, confirmarSenha, telefone, whatsapp, manterConectado } = req.body;
    const nomeCompleto = (sobrenome ? `${nome || ""} ${sobrenome}` : (nome || "")).trim();

    if (!nomeCompleto || !email || !senha) {
      return res.status(400).json({ msg: "Preencha todos os campos" });
    }
    if (confirmarSenha !== undefined && senha !== confirmarSenha) {
      return res.status(400).json({ msg: "As senhas não coincidem" });
    }
    if (senha.length < 6) {
      return res.status(400).json({ msg: "A senha deve ter pelo menos 6 caracteres" });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) return res.status(400).json({ msg: "Usuário já existe" });

    const hash = await bcrypt.hash(senha, 10);
    const tokenVerificacao = crypto.randomBytes(32).toString("hex");

    const user = new User({
      nome: nomeCompleto,
      email: email.toLowerCase(),
      senha: hash,
      telefone: telefone || undefined,
      whatsapp: whatsapp || undefined,
      tokenVerificacao
    });
    await user.save();

    const link = `${req.protocol}://${req.get("host")}/api/auth/confirmar/${tokenVerificacao}`;
    try {
      await enviarEmailConfirmacao(user.email, user.nome, link);
    } catch (mailErr) {
      console.error("Erro ao enviar e-mail de confirmação:", mailErr.message);
    }

    // Login automático logo após o cadastro — um fluxo de matrícula/checkout não
    // deve travar esperando a confirmação do e-mail, que continua pendente e
    // pode ser cobrada em outros pontos do produto.
    const token = assinarAccessToken(user);
    let sessaoPersistente = false;
    if (manterConectado) {
      const raw = await emitirRefreshToken(user);
      res.cookie(REFRESH_COOKIE, raw, cookieRefreshOpts);
      sessaoPersistente = true;
    }

    res.json({
      msg: "Cadastro realizado! Verifique seu e-mail para confirmar a conta.",
      token, nome: user.nome, role: user.role, manterConectado: sessaoPersistente
    });
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
    const { email, senha, manterConectado } = req.body;

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

    const token = assinarAccessToken(user);
    let sessaoPersistente = false;
    if (manterConectado) {
      const raw = await emitirRefreshToken(user);
      res.cookie(REFRESH_COOKIE, raw, cookieRefreshOpts);
      sessaoPersistente = true;
    } else {
      res.clearCookie(REFRESH_COOKIE, { path: "/api/auth" });
    }

    res.json({ token, nome: user.nome, role: user.role, manterConectado: sessaoPersistente });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor. Tente novamente." });
  }
});

// RENOVAR ACCESS TOKEN A PARTIR DO REFRESH TOKEN (cookie httpOnly)
// Chamado no carregamento da página quando não há (ou expirou) o access token
// em memória, para restaurar a sessão de quem marcou "Manter-me conectado".
router.post("/refresh", async (req, res) => {
  try {
    const raw = req.cookies?.[REFRESH_COOKIE];
    if (!raw) return res.status(401).json({ msg: "Sessão não encontrada" });

    const hash = hashToken(raw);
    const user = await User.findOne({ "refreshTokens.tokenHash": hash });
    const entrada = user?.refreshTokens.find(rt => rt.tokenHash === hash);

    if (!user || !entrada || entrada.expiraEm < new Date()) {
      res.clearCookie(REFRESH_COOKIE, { path: "/api/auth" });
      return res.status(401).json({ msg: "Sessão expirada, faça login novamente" });
    }

    // Rotação: descarta o token usado e emite um novo, para que um refresh token
    // roubado pare de funcionar assim que o dono legítimo o usar de novo.
    user.refreshTokens = user.refreshTokens.filter(rt => rt.tokenHash !== hash);
    const novoRaw = await emitirRefreshToken(user);
    res.cookie(REFRESH_COOKIE, novoRaw, cookieRefreshOpts);

    res.json({ token: assinarAccessToken(user), nome: user.nome, role: user.role });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor. Tente novamente." });
  }
});

// LOGOUT — revoga o refresh token atual (não afeta outros dispositivos/sessões)
router.post("/logout", async (req, res) => {
  try {
    const raw = req.cookies?.[REFRESH_COOKIE];
    if (raw) {
      const hash = hashToken(raw);
      await User.updateOne({ "refreshTokens.tokenHash": hash }, { $pull: { refreshTokens: { tokenHash: hash } } });
    }
  } catch (err) {
    console.error(err);
  }
  res.clearCookie(REFRESH_COOKIE, { path: "/api/auth" });
  res.json({ msg: "Sessão encerrada" });
});

// ESQUECI MINHA SENHA — gera token de uso único (1h) e envia link por e-mail
router.post("/esqueci-senha", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ msg: "Informe o e-mail" });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (user) {
      const raw = crypto.randomBytes(32).toString("hex");
      user.resetSenhaTokenHash = hashToken(raw);
      user.resetSenhaExpiraEm = new Date(Date.now() + 60 * 60 * 1000);
      await user.save();

      const origem = process.env.SITE_URL || `${req.protocol}://${req.get("host")}`;
      const link = `${origem}/redefinir-senha.html?token=${raw}`;
      try {
        await enviarEmailRedefinicaoSenha(user.email, user.nome, link);
      } catch (mailErr) {
        console.error("Erro ao enviar e-mail de redefinição:", mailErr.message);
      }
    }

    // Mensagem sempre genérica, para não revelar se o e-mail existe na base.
    res.json({ msg: "Se houver uma conta com esse e-mail, enviamos um link de redefinição de senha." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor. Tente novamente." });
  }
});

// REDEFINIR SENHA — valida o token de uso único e troca a senha
router.post("/redefinir-senha", async (req, res) => {
  try {
    const { token, novaSenha } = req.body;
    if (!token || !novaSenha) return res.status(400).json({ msg: "Preencha todos os campos" });
    if (novaSenha.length < 6) return res.status(400).json({ msg: "A nova senha deve ter pelo menos 6 caracteres" });

    const user = await User.findOne({
      resetSenhaTokenHash: hashToken(token),
      resetSenhaExpiraEm: { $gt: new Date() }
    });
    if (!user) return res.status(400).json({ msg: "Link inválido ou expirado. Solicite uma nova redefinição." });

    user.senha = await bcrypt.hash(novaSenha, 10);
    user.resetSenhaTokenHash = undefined;
    user.resetSenhaExpiraEm = undefined;
    user.refreshTokens = []; // revoga sessões persistentes antigas por segurança
    await user.save();

    res.json({ msg: "Senha redefinida com sucesso! Você já pode entrar com a nova senha." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor. Tente novamente." });
  }
});

// DADOS DO USUÁRIO LOGADO (nome, email, plano ativo, perfil, papel, créditos)
router.get("/me", exigirAuth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("nome email telefone whatsapp plano produtosAvulsos perfil role creditosCorrecao especialidades temasFavoritos criadoEm");
    if (!user) return res.status(404).json({ msg: "Usuário não encontrado" });

    // Expira o plano automaticamente 30 dias após a ativação
    if (user.plano?.ativo && user.plano.dataVencimento && user.plano.dataVencimento < new Date()) {
      user.plano.ativo = false;
      await user.save();
    }

    // Expira compras avulsas do Pack Prestige automaticamente 30 dias após a ativação
    let produtosAlterados = false;
    for (const chave of ["plataforma", "producao", "aulasEspecializadas"]) {
      const produto = user.produtosAvulsos?.[chave];
      if (produto?.ativo && produto.dataVencimento && produto.dataVencimento < new Date()) {
        produto.ativo = false;
        produtosAlterados = true;
      }
    }
    if (produtosAlterados) await user.save();

    // Telefone não é salvo no cadastro — recupera da matrícula/pedido mais recente
    // com esse dado preenchido (informado ao pagar um plano).
    let telefone = user.telefone || null;
    const matriculaComTelefone = telefone ? null : await Matricula.findOne({
      alunoId: req.userId,
      "dadosPessoais.telefone": { $exists: true, $ne: "" }
    }).sort({ criadoEm: -1 }).select("dadosPessoais.telefone");
    if (matriculaComTelefone) telefone = matriculaComTelefone.dadosPessoais.telefone;

    if (!telefone) {
      const pedidoComTelefone = await Pedido.findOne({
        $or: [{ userId: req.userId }, { email: user.email }],
        "dadosPessoais.telefone": { $exists: true, $ne: "" }
      }).sort({ criadoEm: -1 }).select("dadosPessoais.telefone");
      if (pedidoComTelefone) telefone = pedidoComTelefone.dadosPessoais.telefone;
    }

    res.json({
      nome: user.nome,
      email: user.email,
      telefone,
      whatsapp: user.whatsapp || null,
      plano: user.plano || { ativo: false },
      produtosAvulsos: user.produtosAvulsos || {},
      perfil: user.perfil || {},
      role: user.role || "aluno",
      creditosCorrecao: user.creditosCorrecao || 0,
      especialidades: user.especialidades || [],
      temasFavoritos: user.temasFavoritos || [],
      criadoEm: user.criadoEm
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

// ALTERAR SENHA
router.put("/senha", exigirAuth, async (req, res) => {
  try {
    const { senhaAtual, novaSenha } = req.body;
    if (!senhaAtual || !novaSenha) return res.status(400).json({ msg: "Preencha todos os campos" });
    if (novaSenha.length < 6) return res.status(400).json({ msg: "A nova senha deve ter pelo menos 6 caracteres" });

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ msg: "Usuário não encontrado" });

    const isMatch = await bcrypt.compare(senhaAtual, user.senha);
    if (!isMatch) return res.status(400).json({ msg: "Senha atual incorreta" });

    user.senha = await bcrypt.hash(novaSenha, 10);
    await user.save();

    res.json({ msg: "Senha alterada com sucesso!" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor. Tente novamente." });
  }
});

module.exports = router;