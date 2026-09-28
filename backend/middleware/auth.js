const jwt = require("jsonwebtoken");
const { registrar, sessaoRevogada } = require("../utils/monitorSeguranca");

// Algoritmo fixo (impede tokens "alg: none"/troca de algoritmo) e só aceita
// access tokens de login — tickets de vídeo e afins usam o mesmo segredo mas
// carregam "type" e não podem ser usados como sessão. Tokens emitidos antes de
// uma revogação de sessões (senha trocada, sessão roubada, ação de admin) caem.
function verificarAccessToken(token) {
  const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
  if (payload.type || !payload.id) throw Object.assign(new Error("Token não é de sessão"), { suspeito: true });
  if (sessaoRevogada(payload.id, payload.iat)) throw Object.assign(new Error("Sessão revogada"), { revogado: true });
  return payload;
}

// Expirado ou revogado é rotina; assinatura inválida/formato estranho é adulteração.
function tokenAdulterado(err) {
  return err.suspeito || (err.name === "JsonWebTokenError");
}

// Exige um token válido. Usado em rotas que precisam saber quem é o usuário.
function exigirAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) return res.status(401).json({ msg: "Faça login para continuar" });

  try {
    const payload = verificarAccessToken(token);
    req.userId = String(payload.id);
    req.userRole = payload.role || "aluno";
    next();
  } catch (err) {
    if (tokenAdulterado(err)) registrar("token_invalido", req, { erro: err.message });
    res.status(401).json({ msg: "Sessão expirada, faça login novamente" });
  }
}

// Exige que o usuário autenticado tenha o papel de professor (ou admin, que herda acesso).
function exigirProfessor(req, res, next) {
  if (req.userRole !== "professor" && req.userRole !== "admin") {
    registrar("acesso_negado_privilegio", req, { exigido: "professor", papel: req.userRole });
    return res.status(403).json({ msg: "Acesso restrito a professores." });
  }
  next();
}

// Exige que o usuário autenticado tenha o papel de administrador.
function exigirAdmin(req, res, next) {
  if (req.userRole !== "admin") {
    // Professor em função de admin é engano de interface, não ataque (ex.: gestao-alunos
    // carrega catálogos de admin); aluno/visitante tentando é escalada de privilégio.
    registrar(req.userRole === "professor" ? "acesso_negado_equipe" : "acesso_negado_privilegio", req, { exigido: "admin", papel: req.userRole });
    return res.status(403).json({ msg: "Acesso restrito a administradores." });
  }
  next();
}

// Não bloqueia se não houver token, mas identifica o usuário se houver.
function authOpcional(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (token) {
    try {
      const payload = verificarAccessToken(token);
      req.userId = String(payload.id);
    } catch (err) {
      // token inválido/expirado: segue sem usuário identificado
      if (tokenAdulterado(err)) registrar("token_invalido", req, { erro: err.message });
    }
  }
  next();
}

module.exports = { exigirAuth, authOpcional, exigirProfessor, exigirAdmin, verificarAccessToken };
