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
const {
  limitarTaxa, falhasExcedidas, registrarFalha, limparFalhas, validarIds,
  normalizarEmail, textoSeguro, origemSite
} = require("../middleware/seguranca");
const { registrar, revogarSessoes } = require("../utils/monitorSeguranca");

const ehEquipe = user => user && (user.role === "admin" || user.role === "professor");
// Janela em que reapresentar um refresh token recém-rotacionado é tratado como corrida
// legítima (duas abas renovando ao mesmo tempo), e não como roubo de sessão.
const TOLERANCIA_REUSO_MS = 30 * 1000;

// ---------- PROTEÇÕES CONTRA ABUSO ----------
const QUINZE_MIN = 15 * 60 * 1000;
const limiteLogin = limitarTaxa({ nome: "login", janelaMs: QUINZE_MIN, max: 10, msg: "Muitas tentativas de login. Aguarde 15 minutos e tente novamente." });
const limiteCadastro = limitarTaxa({ nome: "cadastro", janelaMs: 60 * 60 * 1000, max: 5, msg: "Muitos cadastros a partir desta rede. Tente novamente mais tarde." });
const limiteEnvioEmail = limitarTaxa({ nome: "envio-email", janelaMs: QUINZE_MIN, max: 5, msg: "Muitas solicitações. Aguarde alguns minutos antes de pedir outro e-mail." });
const limiteToken = limitarTaxa({ nome: "token", janelaMs: QUINZE_MIN, max: 20 });
const limiteRefresh = limitarTaxa({ nome: "refresh", janelaMs: QUINZE_MIN, max: 60 });
const limiteSenha = limitarTaxa({ nome: "senha", janelaMs: QUINZE_MIN, max: 10 });
// Bloqueio por conta: mesmo vindo de muitos IPs, no máximo 8 senhas erradas a cada 15 min.
const MAX_FALHAS_POR_CONTA = 8;

// bcrypt trunca em 72 bytes e senhas enormes custam CPU — limitamos o tamanho.
const SENHA_MIN = 8;
const SENHA_MAX = 128;
function erroSenha(senha) {
  if (typeof senha !== "string" || senha.length < SENHA_MIN) return `A senha deve ter pelo menos ${SENHA_MIN} caracteres`;
  if (senha.length > SENHA_MAX) return `A senha deve ter no máximo ${SENHA_MAX} caracteres`;
  return null;
}

// Comparação feita mesmo quando o e-mail não existe, para que o tempo de resposta
// não revele quais e-mails têm conta.
const HASH_FALSO = bcrypt.hashSync("senha-inexistente-para-tempo-constante", 10);
const MSG_LOGIN_INVALIDO = "E-mail ou senha incorretos";

// Tokens de e-mail/redefinição são sempre 64 caracteres hex (randomBytes(32)).
const ehTokenHex = t => typeof t === "string" && /^[a-f0-9]{64}$/.test(t);
const TELEFONE_VALIDO = /^[0-9+()\-\s]{0,30}$/;
const FOTO_VALIDA = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/;

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
  const agora = new Date();

  // Campos depreciados (plano/produtosAvulsos únicos) — mantidos vivos só até não
  // restar mais nenhum código lendo-os fora daqui.
  if (user.plano?.ativo && user.plano.dataVencimento && user.plano.dataVencimento < agora) {
    user.plano.ativo = false;
    alterou = true;
  }
  for (const chave of ["plataforma", "producao", "aulasEspecializadas"]) {
    const produto = user.produtosAvulsos?.[chave];
    if (produto?.ativo && produto.dataVencimento && produto.dataVencimento < agora) {
      produto.ativo = false;
      alterou = true;
    }
  }

  // planos[] — um plano por curso, cada um com sua própria data de vencimento.
  for (const plano of user.planos || []) {
    if (plano.ativo && plano.dataVencimento && plano.dataVencimento < agora) {
      plano.ativo = false;
      alterou = true;
    }
    if (plano.packPrestige?.ativo && plano.packPrestige.dataVencimento && plano.packPrestige.dataVencimento < agora) {
      plano.packPrestige.ativo = false;
      alterou = true;
    }
  }

  // Grandfather do Pack Prestige avulso antigo (cross-curso) — expira sozinho, igual
  // ao resto, sem precisar de nenhuma ação manual.
  for (const chave of ["plataforma", "producao", "aulasEspecializadas"]) {
    const produto = user.legado?.produtosAvulsos?.[chave];
    if (produto?.ativo && produto.dataVencimento && produto.dataVencimento < agora) {
      produto.ativo = false;
      alterou = true;
    }
  }

  if (alterou) await user.save();
}

// Usuário com algum plano de curso ativo (novo modelo por curso, ou o antigo singular
// pra quem ainda não migrou) tem a área do aluno como página inicial; sem nenhum plano
// ativo, continua caindo no index — recalculado a cada login e a cada restauração de
// sessão (refresh), então um plano vencido reverte automaticamente pro index na próxima
// vez que a sessão for validada.
function destinoInicial(user) {
  const temPlanoNovo = (user.planos || []).some(p => p.ativo || p.packPrestige?.ativo);
  return (temPlanoNovo || user.plano?.ativo) ? "minha-conta.html" : "index.html";
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
router.post("/register", limiteCadastro, async (req, res) => {
  try {
    const { senha, confirmarSenha, manterConectado } = req.body;
    const nome = textoSeguro(req.body.nome, 60) || "";
    const sobrenome = textoSeguro(req.body.sobrenome, 60);
    const nomeCompleto = (sobrenome ? `${nome} ${sobrenome}` : nome).trim();
    const email = normalizarEmail(req.body.email);
    const telefone = textoSeguro(req.body.telefone, 30);
    const whatsapp = textoSeguro(req.body.whatsapp, 30);

    if (!nomeCompleto || !req.body.email || !senha) {
      return res.status(400).json({ msg: "Preencha todos os campos" });
    }
    if (!email) return res.status(400).json({ msg: "Informe um e-mail válido" });
    if ((telefone && !TELEFONE_VALIDO.test(telefone)) || (whatsapp && !TELEFONE_VALIDO.test(whatsapp))) {
      return res.status(400).json({ msg: "Telefone inválido" });
    }
    if (confirmarSenha !== undefined && senha !== confirmarSenha) {
      return res.status(400).json({ msg: "As senhas não coincidem" });
    }
    const problemaSenha = erroSenha(senha);
    if (problemaSenha) return res.status(400).json({ msg: problemaSenha });

    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ msg: "Usuário já existe" });

    const hash = await bcrypt.hash(senha, 10);
    const tokenVerificacao = crypto.randomBytes(32).toString("hex");

    const user = new User({
      nome: nomeCompleto,
      email,
      senha: hash,
      telefone: telefone || undefined,
      whatsapp: whatsapp || undefined,
      tokenVerificacao,
      primeiroLoginEm: new Date(),
      ultimoAcessoEm: new Date()
    });
    await user.save();

    const link = `${origemSite(req)}/api/auth/confirmar/${tokenVerificacao}`;
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
router.post("/reenviar-confirmacao", limiteEnvioEmail, async (req, res) => {
  try {
    const email = normalizarEmail(req.body.email);
    if (!email) return res.status(400).json({ msg: "Informe um e-mail válido" });

    // Resposta idêntica exista ou não a conta (evita enumeração de e-mails).
    const user = await User.findOne({ email });
    if (user && !user.verificado) {
      const tokenVerificacao = crypto.randomBytes(32).toString("hex");
      user.tokenVerificacao = tokenVerificacao;
      await user.save();

      const link = `${origemSite(req)}/api/auth/confirmar/${tokenVerificacao}`;
      try {
        await enviarEmailConfirmacao(user.email, user.nome, link);
      } catch (mailErr) {
        console.error("Erro ao reenviar e-mail de confirmação:", mailErr.message);
      }
    }

    res.json({ msg: "Se houver uma conta pendente de confirmação com esse e-mail, reenviamos o link. Verifique sua caixa de entrada." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro ao reenviar o e-mail. Tente novamente." });
  }
});

// CONFIRMAÇÃO DE E-MAIL
router.get("/confirmar/:token", limiteToken, async (req, res) => {
  try {
    if (!ehTokenHex(req.params.token)) return res.redirect("/login.html?confirmado=erro");
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
router.post("/login", limiteLogin, async (req, res) => {
  try {
    const { senha, manterConectado } = req.body;

    if (!req.body.email || !senha) {
      return res.status(400).json({ msg: "Preencha todos os campos" });
    }
    const email = normalizarEmail(req.body.email);
    if (!email || typeof senha !== "string" || senha.length > SENHA_MAX) {
      return res.status(400).json({ msg: MSG_LOGIN_INVALIDO });
    }

    if (falhasExcedidas(email, MAX_FALHAS_POR_CONTA)) {
      registrar("forca_bruta_conta", req, { email }, { email });
      return res.status(429).json({ msg: "Muitas tentativas de login para esta conta. Aguarde 15 minutos e tente novamente." });
    }

    const user = await User.findOne({ email });
    const isMatch = await bcrypt.compare(senha, user ? user.senha : HASH_FALSO);
    if (!user || !isMatch) {
      registrarFalha(email, QUINZE_MIN);
      registrar("login_falhou", req, { contaExiste: !!user }, { email, userId: user?._id });
      return res.status(400).json({ msg: MSG_LOGIN_INVALIDO });
    }
    limparFalhas(email);

    if (!user.verificado) {
      return res.status(403).json({ msg: "Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada." });
    }

    await expirarSeVencido(user);

    if (!user.primeiroLoginEm) user.primeiroLoginEm = new Date();
    user.ultimoAcessoEm = new Date();
    // Conta da equipe entrando de um IP nunca visto: avisa (pode ser invasão da conta).
    if (ehEquipe(user) && req.ip && !(user.ipsConhecidos || []).includes(req.ip)) {
      if ((user.ipsConhecidos || []).length) {
        registrar("login_staff_novo_ip", req, { papel: user.role }, { email: user.email, userId: user._id });
      }
      user.ipsConhecidos = [...(user.ipsConhecidos || []), req.ip].slice(-20);
    }
    await user.save();

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
router.post("/refresh", limiteRefresh, async (req, res) => {
  try {
    const raw = req.cookies?.[REFRESH_COOKIE];
    if (!raw || typeof raw !== "string" || raw.length > 200) return res.status(401).json({ msg: "Sessão não encontrada" });

    const hash = hashToken(raw);
    const user = await User.findOne({ "refreshTokens.tokenHash": hash });
    const entrada = user?.refreshTokens.find(rt => rt.tokenHash === hash);

    if (!user || !entrada || entrada.expiraEm < new Date()) {
      res.clearCookie(REFRESH_COOKIE, { path: "/api/auth" });
      if (!user) {
        // Token já rotacionado sendo reapresentado = cópia roubada em uso (ou o dono
        // usando depois do ladrão). Resposta: derruba TODAS as sessões da conta.
        const vitima = await User.findOne({ "refreshTokensUsados.tokenHash": hash }).select("email refreshTokensUsados");
        const usado = vitima?.refreshTokensUsados.find(rt => rt.tokenHash === hash);
        if (vitima && usado && Date.now() - new Date(usado.usadoEm).getTime() > TOLERANCIA_REUSO_MS) {
          await revogarSessoes(vitima._id, { motivo: "Reuso de token de sessão (possível roubo)", req });
          registrar("reuso_refresh_token", req, {}, { userId: vitima._id, email: vitima.email, resposta: "Todas as sessões da conta encerradas" });
        }
      }
      return res.status(401).json({ msg: "Sessão expirada, faça login novamente" });
    }

    await expirarSeVencido(user);

    user.ultimoAcessoEm = new Date();

    // Rotação: descarta o token usado e emite um novo, para que um refresh token
    // roubado pare de funcionar assim que o dono legítimo o usar de novo.
    user.refreshTokens = user.refreshTokens.filter(rt => rt.tokenHash !== hash);
    user.refreshTokensUsados = [
      ...(user.refreshTokensUsados || []).filter(rt => rt.expiraEm > new Date()),
      { tokenHash: hash, expiraEm: entrada.expiraEm, usadoEm: new Date() }
    ].slice(-20);
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
router.delete("/sessoes/:id", exigirAuth, validarIds("id"), async (req, res) => {
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
    if (raw && typeof raw === "string") {
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
router.post("/esqueci-senha", limiteEnvioEmail, async (req, res) => {
  try {
    if (!req.body.email) return res.status(400).json({ msg: "Informe o e-mail" });
    const email = normalizarEmail(req.body.email);
    if (!email) return res.status(400).json({ msg: "Informe um e-mail válido" });

    const user = await User.findOne({ email });
    if (user) {
      if (ehEquipe(user)) registrar("alteracao_conta_staff", req, { acao: "pedido de redefinição de senha" }, { email: user.email, userId: user._id });
      const raw = crypto.randomBytes(32).toString("hex");
      user.resetSenhaTokenHash = hashToken(raw);
      user.resetSenhaExpiraEm = new Date(Date.now() + 60 * 60 * 1000);
      await user.save();

      const link = `${origemSite(req)}/redefinir-senha.html?token=${raw}`;
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
router.post("/redefinir-senha", limiteToken, async (req, res) => {
  try {
    const { token, novaSenha } = req.body;
    if (!token || !novaSenha) return res.status(400).json({ msg: "Preencha todos os campos" });
    if (!ehTokenHex(token)) return res.status(400).json({ msg: "Link inválido ou expirado. Solicite uma nova redefinição." });
    const problemaSenha = erroSenha(novaSenha);
    if (problemaSenha) return res.status(400).json({ msg: problemaSenha });

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
    limparFalhas(user.email);
    // Derruba também os access tokens ainda válidos (quem invadiu perde o acesso na hora).
    await revogarSessoes(user._id, { motivo: "Senha redefinida por e-mail", req, silencioso: true });
    if (ehEquipe(user)) registrar("alteracao_conta_staff", req, { acao: "senha redefinida" }, { email: user.email, userId: user._id });

    res.json({ msg: "Senha redefinida com sucesso! Você já pode entrar com a nova senha." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor. Tente novamente." });
  }
});

// DADOS DO USUÁRIO LOGADO (nome, email, plano ativo, perfil, papel, créditos)
router.get("/me", exigirAuth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("nome email telefone whatsapp plano produtosAvulsos planos legado perfil role creditosCorrecao especialidades temasFavoritos preferencias doisFatores criadoEm");
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
      planos: user.planos || [],
      legado: user.legado || {},
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
    const { foto, dataProva } = req.body;
    const bio = textoSeguro(req.body.bio, 1000);
    const interesses = textoSeguro(req.body.interesses, 500);
    const provaAlvo = textoSeguro(req.body.provaAlvo, 60);
    const nome = textoSeguro(req.body.nome, 120);
    const telefone = textoSeguro(req.body.telefone, 30);
    const whatsapp = textoSeguro(req.body.whatsapp, 30);

    // Só aceita imagem em data URI — impede "javascript:"/URLs externas no <img src>.
    if (foto !== undefined && foto !== null && foto !== "") {
      if (typeof foto !== "string" || !FOTO_VALIDA.test(foto)) {
        return res.status(400).json({ msg: "Formato de imagem inválido. Envie PNG, JPEG, WebP ou GIF." });
      }
      if (foto.length > 1_500_000) {
        return res.status(400).json({ msg: "A imagem é muito grande. Escolha uma foto menor." });
      }
    }
    if ((telefone && !TELEFONE_VALIDO.test(telefone)) || (whatsapp && !TELEFONE_VALIDO.test(whatsapp))) {
      return res.status(400).json({ msg: "Telefone inválido" });
    }
    if (dataProva && Number.isNaN(new Date(dataProva).getTime())) {
      return res.status(400).json({ msg: "Data da prova inválida" });
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
    if (nome) user.nome = nome;
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
    const { tema, idioma, notificacoes, exibirBarraTimer } = req.body;
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ msg: "Usuário não encontrado" });

    if (!user.preferencias) user.preferencias = {};
    if (tema && ["light", "dark"].includes(tema)) user.preferencias.tema = tema;
    if (idioma && ["pt-BR", "fr"].includes(idioma)) user.preferencias.idioma = idioma;
    if (typeof exibirBarraTimer === "boolean") user.preferencias.exibirBarraTimer = exibirBarraTimer;
    if (notificacoes && typeof notificacoes === "object" && !Array.isArray(notificacoes)) {
      const atuais = user.preferencias.notificacoes || {};
      for (const chave of ["lembretes", "novosDeveres", "correcoesDisponiveis", "novosConteudos", "promocoes"]) {
        if (typeof notificacoes[chave] === "boolean") atuais[chave] = notificacoes[chave];
      }
      user.preferencias.notificacoes = atuais;
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
router.post("/trocar-email", exigirAuth, limiteEnvioEmail, async (req, res) => {
  try {
    const { senhaAtual } = req.body;
    if (!req.body.novoEmail) return res.status(400).json({ msg: "Informe o novo e-mail" });
    const novoEmail = normalizarEmail(req.body.novoEmail);
    if (!novoEmail) return res.status(400).json({ msg: "Informe um e-mail válido" });
    if (typeof senhaAtual !== "string" || !senhaAtual) {
      return res.status(400).json({ msg: "Confirme sua senha atual para trocar o e-mail." });
    }

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ msg: "Usuário não encontrado" });

    // Exige a senha: um token de sessão roubado sozinho não pode transferir a conta.
    if (senhaAtual.length > SENHA_MAX || !(await bcrypt.compare(senhaAtual, user.senha))) {
      registrar("login_falhou", req, { contexto: "troca de e-mail" }, { email: user.email });
      return res.status(400).json({ msg: "Senha atual incorreta" });
    }

    if (ehEquipe(user)) registrar("alteracao_conta_staff", req, { acao: "pedido de troca de e-mail", novoEmail }, { email: user.email, userId: user._id });
    const existente = await User.findOne({ email: novoEmail });
    if (existente) return res.status(400).json({ msg: "Este e-mail já está em uso por outra conta." });

    const raw = crypto.randomBytes(32).toString("hex");
    user.emailPendente = novoEmail;
    user.emailPendenteTokenHash = hashToken(raw);
    user.emailPendenteExpiraEm = new Date(Date.now() + 60 * 60 * 1000);
    await user.save();

    const link = `${origemSite(req)}/api/auth/confirmar-troca-email/${raw}`;
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

router.get("/confirmar-troca-email/:token", limiteToken, async (req, res) => {
  try {
    if (!ehTokenHex(req.params.token)) return res.redirect("/configuracoes.html?trocaEmail=erro");
    const user = await User.findOne({ emailPendenteTokenHash: hashToken(req.params.token), emailPendenteExpiraEm: { $gt: new Date() } });
    if (!user) return res.redirect("/configuracoes.html?trocaEmail=erro");
    // Outra conta pode ter ocupado o endereço depois do pedido — não sobrescreve.
    if (await User.exists({ email: user.emailPendente, _id: { $ne: user._id } })) {
      return res.redirect("/configuracoes.html?trocaEmail=erro");
    }

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
    const user = await User.findById(req.userId).select("-senha -refreshTokens -resetSenhaTokenHash -resetSenhaExpiraEm -emailPendenteTokenHash -tokenVerificacao");
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
    const motivo = textoSeguro(req.body.motivo, 1000);
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
router.put("/senha", exigirAuth, limiteSenha, async (req, res) => {
  try {
    const { senhaAtual, novaSenha } = req.body;
    if (!senhaAtual || !novaSenha) return res.status(400).json({ msg: "Preencha todos os campos" });
    if (typeof senhaAtual !== "string" || senhaAtual.length > SENHA_MAX) return res.status(400).json({ msg: "Senha atual incorreta" });
    const problemaSenha = erroSenha(novaSenha);
    if (problemaSenha) return res.status(400).json({ msg: problemaSenha });

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ msg: "Usuário não encontrado" });

    const isMatch = await bcrypt.compare(senhaAtual, user.senha);
    if (!isMatch) {
      registrar("login_falhou", req, { contexto: "troca de senha" }, { email: user.email });
      return res.status(400).json({ msg: "Senha atual incorreta" });
    }
    if (ehEquipe(user)) registrar("alteracao_conta_staff", req, { acao: "senha alterada" }, { email: user.email, userId: user._id });

    user.senha = await bcrypt.hash(novaSenha, 10);
    // Encerra as sessões persistentes dos outros dispositivos (mantém a atual).
    const rawAtual = req.cookies?.[REFRESH_COOKIE];
    const hashAtual = typeof rawAtual === "string" ? hashToken(rawAtual) : null;
    user.refreshTokens = (user.refreshTokens || []).filter(rt => rt.tokenHash === hashAtual);
    await user.save();

    res.json({ msg: "Senha alterada com sucesso!" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor. Tente novamente." });
  }
});

module.exports = router;