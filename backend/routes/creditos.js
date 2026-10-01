// Sistema de Correção — alunos do Ambiente de Produção, créditos e produções.
const express = require("express");
const router = express.Router();
const User = require("../models/user");
const Producao = require("../models/producao");
const { exigirAuth, exigirProfessor } = require("../middleware/auth");
const { normalizarEmail, ehObjectId } = require("../middleware/seguranca");
const { registrar } = require("../utils/monitorSeguranca");
const { CASCATA_POR_TIER } = require("../middleware/acessoCurso");
const { TIPOS_CURSO } = require("../utils/tiposCurso");

router.use(exigirAuth, exigirProfessor);

// Mesma regra de backend/middleware/acessoCurso.js (cursosComAcesso), feita em lote.
function cursosComProducao(u) {
  if (u.plano?.ativo && u.plano?.curso === "Acesso Total") return [...TIPOS_CURSO];
  const set = new Set();
  for (const p of u.planos || []) {
    if ((p.ativo && CASCATA_POR_TIER.producao.includes(p.tier)) || p.packPrestige?.ativo) set.add(p.courseType);
  }
  if (u.legado?.produtosAvulsos?.producao?.ativo) TIPOS_CURSO.forEach(c => set.add(c));
  return [...set];
}

const FILTRO_COM_PRODUCAO = {
  role: { $nin: ["admin", "professor"] },
  $or: [
    { planos: { $elemMatch: { ativo: true, tier: { $in: CASCATA_POR_TIER.producao } } } },
    { "planos.packPrestige.ativo": true },
    { "legado.produtosAvulsos.producao.ativo": true },
    { "plano.ativo": true, "plano.curso": "Acesso Total" }
  ]
};

// LISTA — cada aluno com o ambiente ativo, seus créditos e o resumo das produções.
router.get("/alunos", async (req, res) => {
  try {
    const alunos = await User.find(FILTRO_COM_PRODUCAO)
      .select("nome email creditosCorrecao planos plano legado creditosBoasVindasEm").lean();
    const ids = alunos.map(a => a._id);
    const stats = await Producao.aggregate([
      { $match: { alunoId: { $in: ids } } },
      { $group: {
        _id: "$alunoId",
        total: { $sum: 1 },
        pendentes: { $sum: { $cond: [{ $in: ["$status", ["em_fila", "em_correcao"]] }, 1, 0] } },
        corrigidas: { $sum: { $cond: [{ $in: ["$status", ["corrigido", "devolvido"]] }, 1, 0] } },
        ultima: { $max: "$dataEnvio" }
      } }
    ]);
    const porAluno = Object.fromEntries(stats.map(s => [String(s._id), s]));
    res.json(alunos.map(a => {
      const s = porAluno[String(a._id)] || { total: 0, pendentes: 0, corrigidas: 0, ultima: null };
      return {
        _id: a._id, nome: a.nome, email: a.email, creditos: a.creditosCorrecao || 0,
        cursos: cursosComProducao(a), producoes: { total: s.total, pendentes: s.pendentes, corrigidas: s.corrigidas, ultima: s.ultima }
      };
    }).sort((x, y) => (y.producoes.ultima ? new Date(y.producoes.ultima) : 0) - (x.producoes.ultima ? new Date(x.producoes.ultima) : 0) || x.nome.localeCompare(y.nome)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// DETALHE — todas as produções (redações e produções orais) do aluno.
router.get("/alunos/:id", async (req, res) => {
  try {
    if (!ehObjectId(req.params.id)) return res.status(400).json({ msg: "Aluno inválido." });
    const aluno = await User.findById(req.params.id).select("nome email creditosCorrecao planos plano legado").lean();
    if (!aluno) return res.status(404).json({ msg: "Aluno não encontrado." });
    const producoes = await Producao.find({ alunoId: aluno._id })
      .populate("temaId", "titulo courseType nivel tipoProducao")
      .populate("professorId", "nome")
      .select("protocolo temaId professorId modalidade status origem.tache modoCorrecao contagemPalavras dataEnvio dataCorrecao avaliacao.notaTotal avaliacao.notaMaxima avaliacao.nivelEstimado creditosUtilizados")
      .sort({ dataEnvio: -1 }).lean();
    res.json({ _id: aluno._id, nome: aluno.nome, email: aluno.email, creditos: aluno.creditosCorrecao || 0, cursos: cursosComProducao(aluno), producoes });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// ADICIONAR CRÉDITOS — pelo aluno selecionado (alunoId) ou por e-mail.
// Valor negativo permite estorno; o saldo nunca fica abaixo de zero.
router.post("/", async (req, res) => {
  try {
    const quantidade = Number(req.body.quantidade);
    if (!Number.isInteger(quantidade) || quantidade === 0 || Math.abs(quantidade) > 1000) {
      return res.status(400).json({ msg: "Informe uma quantidade inteira (até 1000)." });
    }
    let user;
    if (req.body.alunoId !== undefined) {
      if (!ehObjectId(req.body.alunoId)) return res.status(400).json({ msg: "Aluno inválido." });
      user = await User.findById(req.body.alunoId);
    } else {
      const email = normalizarEmail(req.body.email);
      if (!email) return res.status(400).json({ msg: "Selecione um aluno ou informe o e-mail." });
      user = await User.findOne({ email });
    }
    if (!user) return res.status(404).json({ msg: "Aluno não encontrado." });
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
