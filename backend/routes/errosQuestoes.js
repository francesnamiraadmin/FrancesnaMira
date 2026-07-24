const express = require("express");
const router = express.Router();
const Tentativa = require("../models/tentativa");
const ErroQuestao = require("../models/erroQuestao");
const { exigirAuth, exigirProfessor } = require("../middleware/auth");

router.use(exigirAuth);

// ===================== ALUNO: RELATAR ERRO NUMA QUESTÃO =====================
// Só é possível relatar a partir do resultado (gabarito) de uma Tentativa já finalizada —
// mesma amarração de segurança já usada em POST /tentativas/:id/questoes/:id/caderno
// (backend/routes/questoes.js): a questão precisa pertencer de fato à tentativa do próprio
// aluno, nunca confiar em questaoId vindo solto do cliente.
router.post("/", async (req, res) => {
  try {
    const { questaoId, tentativaId, mensagem } = req.body;
    if (!mensagem || !mensagem.trim()) return res.status(400).json({ msg: "Escreva uma mensagem descrevendo o erro." });
    if (!questaoId || !tentativaId) return res.status(400).json({ msg: "Questão ou tentativa não informada." });

    const tentativa = await Tentativa.findOne({ _id: tentativaId, alunoId: req.userId });
    if (!tentativa) return res.status(404).json({ msg: "Tentativa não encontrada." });
    const pertence = tentativa.respostas.some(r => String(r.questaoId) === questaoId);
    if (!pertence) return res.status(400).json({ msg: "Esta questão não pertence a esta tentativa." });

    const erro = await ErroQuestao.create({
      questaoId, alunoId: req.userId, tentativaId, mensagem: mensagem.trim()
    });
    res.json(erro);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// ===================== ADMIN/PROFESSOR: LISTAR / RESOLVER =====================

router.get("/", exigirProfessor, async (req, res) => {
  try {
    const filtro = {};
    if (req.query.status && ["aberto", "resolvido"].includes(req.query.status)) filtro.status = req.query.status;

    const relatos = await ErroQuestao.find(filtro)
      .sort({ criadoEm: -1 })
      .populate("questaoId", "codigo enunciado nivel materia courseType")
      .populate("alunoId", "nome email");

    res.json(relatos);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.patch("/:id", exigirProfessor, async (req, res) => {
  try {
    const { status } = req.body;
    if (!["aberto", "resolvido"].includes(status)) return res.status(400).json({ msg: "Status inválido." });

    const erro = await ErroQuestao.findByIdAndUpdate(
      req.params.id,
      { status, resolvidoEm: status === "resolvido" ? new Date() : null },
      { new: true }
    );
    if (!erro) return res.status(404).json({ msg: "Relato não encontrado." });
    res.json(erro);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

module.exports = router;
