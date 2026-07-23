const User = require("../models/user");
const { TIPOS_CURSO } = require("../utils/tiposCurso");

// Mesma cascata que já existia (duplicada) em backend/routes/aulas.js (checarAcesso) e
// em public/js/appShell.js (CASCATA_POR_TIER, client-side) — agora com uma única fonte
// de verdade, reparametrizada por curso.
const CASCATA_POR_TIER = {
  producao: ["Essentiel", "Avancé", "Excellence"],
  aulas: ["Avancé", "Excellence"],
  plataforma: ["Excellence"]
};

const CHAVE_LEGADO_POR_MODULO = {
  plataforma: "plataforma",
  aulas: "aulasEspecializadas",
  producao: "producao"
};

// Conta com `plano.curso === "Acesso Total"` é um bypass administrativo concedido
// manualmente antes deste courseType existir — preservado aqui pra não trancar essa
// conta fora da plataforma; concede acesso irrestrito a qualquer módulo/curso.
function temAcessoTotalLegado(user) {
  return !!(user.plano?.ativo && user.plano?.curso === "Acesso Total");
}

// Lista todos os courseTypes em que o usuário tem acesso a este módulo — base tanto de
// usuarioTemAcesso (curso já conhecido) quanto do fallback de auto-resolução usado
// quando a requisição não informa courseType (ver exigirAcessoCurso).
async function cursosComAcesso(userId, modulo) {
  if (!CASCATA_POR_TIER[modulo]) throw new Error(`Módulo de acesso desconhecido: ${modulo}`);
  const user = await User.findById(userId).select("plano planos legado");
  if (!user) return [];

  if (temAcessoTotalLegado(user)) return [...TIPOS_CURSO];

  const resultado = new Set();
  for (const plano of user.planos || []) {
    const viaCascata = !!(plano.ativo && CASCATA_POR_TIER[modulo].includes(plano.tier));
    const viaPackPrestige = !!plano.packPrestige?.ativo;
    if (viaCascata || viaPackPrestige) resultado.add(plano.courseType);
  }

  // Clientes do antigo Pack Prestige avulso (cross-curso, sem vínculo a um curso
  // específico) têm acesso em QUALQUER curso até a assinatura vencer sozinha.
  const viaLegado = !!user.legado?.produtosAvulsos?.[CHAVE_LEGADO_POR_MODULO[modulo]]?.ativo;
  if (viaLegado) TIPOS_CURSO.forEach(c => resultado.add(c));

  return [...resultado];
}

// Núcleo único de autorização: substitui a lógica duplicada e inconsistente hoje
// espalhada em aulas.js (checarAcesso), appShell.js, plataformaGate.js e no gate
// embutido de correcoes.html — e cria a checagem que hoje NÃO EXISTE em
// questoes.js/producoes.js (só têm exigirAuth).
async function usuarioTemAcesso(userId, modulo, courseType) {
  const cursos = await cursosComAcesso(userId, modulo);
  return cursos.includes(courseType);
}

// Middleware para rotas onde courseType pode vir na própria requisição (listagem,
// criação). Se a requisição não informar courseType, tenta auto-resolver: se o usuário
// tiver acesso a exatamente UM curso para este módulo, usa esse (mantém as telas atuais,
// que ainda não têm um seletor de curso, funcionando sem mudança nenhuma pro caso comum
// de hoje — um aluno só tem um curso ativo). Com 0 ou 2+ cursos possíveis, exige que o
// cliente informe courseType explicitamente (ambíguo demais pra adivinhar).
//
// Para rotas por :id (o registro já existe), NÃO usar isto — carregar o documento
// primeiro e chamar usuarioTemAcesso() inline com o courseType do próprio documento,
// nunca confiando em courseType vindo do cliente.
function exigirAcessoCurso(modulo) {
  return async (req, res, next) => {
    try {
      let courseType = req.params.courseType || req.query.courseType || req.body?.courseType;
      if (!courseType) {
        const cursos = await cursosComAcesso(req.userId, modulo);
        if (cursos.length !== 1) {
          return res.status(400).json({ msg: "Informe o curso (courseType)." });
        }
        courseType = cursos[0];
      } else if (!TIPOS_CURSO.includes(courseType)) {
        return res.status(400).json({ msg: "Curso inválido." });
      } else if (!(await usuarioTemAcesso(req.userId, modulo, courseType))) {
        return res.status(403).json({ msg: "Você não tem acesso a este módulo para este curso." });
      }
      req.courseType = courseType;
      next();
    } catch (err) {
      console.error(err);
      res.status(500).json({ msg: "Erro no servidor." });
    }
  };
}

module.exports = { usuarioTemAcesso, cursosComAcesso, exigirAcessoCurso, CASCATA_POR_TIER };
