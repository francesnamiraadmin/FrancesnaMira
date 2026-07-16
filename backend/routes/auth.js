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

// Expira plano de curso e produtos avulsos do Pack Prestige vencidos — chamada
// em login/register/refresh/me para que a página inicial calculada logo a
// seguir (destinoInicial) já reflita um plano que acabou de vencer.
async function expirarSeVencido(user) {
  let alterou = false;
  if (user.plano?.ativo && user.plano.dataVencimento && user.plano.dataVencimento < new Date()) {
    user.plano.ativo = false;
    alterou = true;
  }
  for (const chave of ["plataforma", "producao", "aulasEspecializadas"]) {
    const produto = user.produtosAvulsos?.[chave];
    if (produto?.ativo && produto.dataVencimento && produto.dataVencimento < new Date()) {
      produto.ativo = false;
      alterou = true;
    }
  }
  if (alterou) await user.save();
}

// Usuário com plano de curso ativo tem a área do aluno como página inicial;
// sem plano ativo, continua caindo no index — recalculado a cada login e a
// cada restauração de sessão (refresh), então um plano vencido reverte
// automaticamente para o index na próxima vez que a sessão for validada.
function destinoInicial(user) {
  return user.plano?.ativo ? "minha-conta.html" : "index.html";
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
      token, nome: user.nome, role: user.role, manterConectado: sessaoPersistente,
      preferencias: user.preferencias, destinoInicial: destinoInicial(user)
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

    await expirarSeVencido(user);

    const token = assinarAccessToken(user);
    let sessaoPersistente = false;
    if (manterConectado) {
      const raw = await emitirRefreshToken(user);
      res.cookie(REFRESH_COOKIE, raw, cookieRefreshOpts);
      sessaoPersistente = true;
    } else {
      res.clearCookie(REFRESH_COOKIE, { path: "/api/auth" });
    }

    res.json({
      token, nome: user.nome, role: user.role, manterConectado: sessaoPersistente,
      preferencias: user.preferencias, destinoInicial: destinoInicial(user)
    });
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

    await expirarSeVencido(user);

    // Rotação: descarta o token usado e emite um novo, para que um refresh token
    // roubado pare de funcionar assim que o dono legítimo o usar de novo.
    user.refreshTokens = user.refreshTokens.filter(rt => rt.tokenHash !== hash);
    const novoRaw = await emitirRefreshToken(user);
    res.cookie(REFRESH_COOKIE, novoRaw, cookieRefreshOpts);

    res.json({
      token: assinarAccessToken(user), nome: user.nome, role: user.role,
      preferencias: user.preferencias, destinoInicial: destinoInicial(user)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor. Tente novamente." });
  }
});

// SESSÕES ATIVAS ("Manter-me conectado" em outros dispositivos) — cada refresh
// token válido representa um dispositivo/navegador que continua conectado
// mesmo depois de fechado. Não guardamos nome de dispositivo/IP (não são
// coletados hoje), então a listagem é por data de criação/expiração.
router.get("/sessoes", exigirAuth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("refreshTokens");
    if (!user) return res.status(404).json({ msg: "Usuário não encontrado" });

    const rawAtual = req.cookies?.[REFRESH_COOKIE];
    const hashAtual = rawAtual ? hashToken(rawAtual) : null;

    const sessoes = (user.refreshTokens || [])
      .filter(rt => rt.expiraEm > new Date())
      .sort((a, b) => b.criadoEm - a.criadoEm)
      .map(rt => ({
        id: rt._id,
        criadoEm: rt.criadoEm,
        expiraEm: rt.expiraEm,
        atual: rt.tokenHash === hashAtual
      }));

    res.json(sessoes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor. Tente novamente." });
  }
});

// ENCERRAR UMA SESSÃO ESPECÍFICA
router.delete("/sessoes/:id", exigirAuth, async (req, res) => {
  try {
    await User.updateOne(
      { _id: req.userId },
      { $pull: { refreshTokens: { _id: req.params.id } } }
    );
    res.json({ msg: "Sessão encerrada." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor. Tente novamente." });
  }
});

// ENCERRAR TODAS AS OUTRAS SESSÕES (mantém só a do dispositivo atual, se houver)
router.post("/sessoes/encerrar-outras", exigirAuth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("refreshTokens");
    if (!user) return res.status(404).json({ msg: "Usuário não encontrado" });

    const rawAtual = req.cookies?.[REFRESH_COOKIE];
    const hashAtual = rawAtual ? hashToken(rawAtual) : null;
    user.refreshTokens = hashAtual ? user.refreshTokens.filter(rt => rt.tokenHash === hashAtual) : [];
    await user.save();

    res.json({ msg: "As demais sessões foram encerradas." });
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
    const user = await User.findById(req.userId).select("nome email telefone whatsapp plano produtosAvulsos perfil role creditosCorrecao especialidades temasFavoritos preferencias doisFatores criadoEm");
    if (!user) return res.status(404).json({ msg: "Usuário não encontrado" });

    await expirarSeVencido(user);

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
      preferencias: user.preferencias || { tema: "light", idioma: "pt-BR" },
      doisFatores: user.doisFatores || { ativo: false },
      destinoInicial: destinoInicial(user),
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
    const { foto, bio, interesses, provaAlvo, dataProva, nome, telefone, whatsapp } = req.body;

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
    if (nome !== undefined && nome.trim()) user.nome = nome.trim();
    if (telefone !== undefined) user.telefone = telefone;
    if (whatsapp !== undefined) user.whatsapp = whatsapp;
    await user.save();

    res.json({ msg: "Perfil atualizado com sucesso!", perfil: user.perfil, nome: user.nome, telefone: user.telefone, whatsapp: user.whatsapp });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor. Tente novamente." });
  }
});

// PREFERÊNCIAS (tema, idioma, notificações) — sincronizadas entre dispositivos
router.put("/preferencias", exigirAuth, async (req, res) => {
  try {
    const { tema, idioma, notificacoes } = req.body;
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ msg: "Usuário não encontrado" });

    if (!user.preferencias) user.preferencias = {};
    if (tema && ["light", "dark"].includes(tema)) user.preferencias.tema = tema;
    if (idioma && ["pt-BR", "fr"].includes(idioma)) user.preferencias.idioma = idioma;
    if (notificacoes && typeof notificacoes === "object") {
      user.preferencias.notificacoes = { ...(user.preferencias.notificacoes || {}), ...notificacoes };
    }
    await user.save();

    res.json({ msg: "Preferências salvas!", preferencias: user.preferencias });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor. Tente novamente." });
  }
});

// AUTENTICAÇÃO EM DOIS FATORES — liga/desliga o estado; o fluxo de envio e
// validação de código fica para uma etapa futura (arquitetura preparada).
router.put("/dois-fatores", exigirAuth, async (req, res) => {
  try {
    const { ativo } = req.body;
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ msg: "Usuário não encontrado" });

    if (!user.doisFatores) user.doisFatores = {};
    user.doisFatores.ativo = !!ativo;
    user.doisFatores.metodo = "email";
    await user.save();

    res.json({ msg: ativo ? "Autenticação em dois fatores ativada." : "Autenticação em dois fatores desativada.", doisFatores: user.doisFatores });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor. Tente novamente." });
  }
});

// TROCA DE E-MAIL — exige confirmação no endereço novo antes de valer, para
// evitar trocas indevidas caso a conta seja acessada por outra pessoa.
router.post("/trocar-email", exigirAuth, async (req, res) => {
  try {
    const { novoEmail } = req.body;
    if (!novoEmail) return res.status(400).json({ msg: "Informe o novo e-mail" });

    const existente = await User.findOne({ email: novoEmail.toLowerCase() });
    if (existente) return res.status(400).json({ msg: "Este e-mail já está em uso por outra conta." });

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ msg: "Usuário não encontrado" });

    const raw = crypto.randomBytes(32).toString("hex");
    user.emailPendente = novoEmail.toLowerCase();
    user.emailPendenteTokenHash = hashToken(raw);
    user.emailPendenteExpiraEm = new Date(Date.now() + 60 * 60 * 1000);
    await user.save();

    const origem = process.env.SITE_URL || `${req.protocol}://${req.get("host")}`;
    const link = `${origem}/api/auth/confirmar-troca-email/${raw}`;
    try {
      await enviarEmailConfirmacao(novoEmail, user.nome, link);
    } catch (mailErr) {
      console.error("Erro ao enviar e-mail de confirmação de troca:", mailErr.message);
    }

    res.json({ msg: "Enviamos um link de confirmação para o novo e-mail. Ele só passa a valer depois de confirmado." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor. Tente novamente." });
  }
});

router.get("/confirmar-troca-email/:token", async (req, res) => {
  try {
    const user = await User.findOne({ emailPendenteTokenHash: hashToken(req.params.token), emailPendenteExpiraEm: { $gt: new Date() } });
    if (!user) return res.redirect("/configuracoes.html?trocaEmail=erro");

    user.email = user.emailPendente;
    user.emailPendente = undefined;
    user.emailPendenteTokenHash = undefined;
    user.emailPendenteExpiraEm = undefined;
    await user.save();

    res.redirect("/configuracoes.html?trocaEmail=1");
  } catch (err) {
    console.error(err);
    res.redirect("/configuracoes.html?trocaEmail=erro");
  }
});

// EXPORTAR DADOS DA CONTA (perfil + matrículas + pedidos) em JSON
router.get("/exportar-dados", exigirAuth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("-senha -refreshTokens -resetSenhaTokenHash -emailPendenteTokenHash");
    if (!user) return res.status(404).json({ msg: "Usuário não encontrado" });

    const [matriculas, pedidos] = await Promise.all([
      Matricula.find({ alunoId: req.userId }).lean(),
      Pedido.find({ $or: [{ userId: req.userId }, { email: user.email }] }).lean()
    ]);

    res.setHeader("Content-Disposition", "attachment; filename=meus-dados.json");
    res.json({ exportadoEm: new Date(), conta: user, matriculas, pedidos });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor. Tente novamente." });
  }
});

// SOLICITAR EXCLUSÃO DA CONTA — não apaga na hora; marca para revisão
// administrativa (evita perda de dados por acesso indevido ou clique errado).
router.post("/solicitar-exclusao", exigirAuth, async (req, res) => {
  try {
    const { motivo } = req.body;
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ msg: "Usuário não encontrado" });

    user.exclusaoSolicitada = { em: new Date(), motivo: motivo || "" };
    await user.save();

    res.json({ msg: "Solicitação registrada. Nossa equipe vai analisar e entrar em contato antes de excluir sua conta." });
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