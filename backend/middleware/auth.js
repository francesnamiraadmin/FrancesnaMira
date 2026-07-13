const jwt = require("jsonwebtoken");

// Exige um token válido. Usado em rotas que precisam saber quem é o usuário.
function exigirAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) return res.status(401).json({ msg: "Faça login para continuar" });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = payload.id;
    req.userRole = payload.role || "aluno";
    next();
  } catch (err) {
    res.status(401).json({ msg: "Sessão expirada, faça login novamente" });
  }
}

// Exige que o usuário autenticado tenha o papel de professor (ou admin, que herda acesso).
function exigirProfessor(req, res, next) {
  if (req.userRole !== "professor" && req.userRole !== "admin") {
    return res.status(403).json({ msg: "Acesso restrito a professores." });
  }
  next();
}

// Exige que o usuário autenticado tenha o papel de administrador.
function exigirAdmin(req, res, next) {
  if (req.userRole !== "admin") {
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
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      req.userId = payload.id;
    } catch (err) {
      // token inválido/expirado: segue sem usuário identificado
    }
  }
  next();
}

module.exports = { exigirAuth, authOpcional, exigirProfessor, exigirAdmin };
