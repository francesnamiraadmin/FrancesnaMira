const express = require("express");
const router = express.Router();
const Turma = require("../models/turma");
const Matricula = require("../models/matricula");
const { exigirAuth, exigirAdmin } = require("../middleware/auth");

async function comVagas(turma) {
  const ocupadas = await Matricula.countDocuments({
    turmaId: turma._id,
    status: { $in: ["pendente_pagamento", "confirmada"] }
  });
  const obj = turma.toObject();
  obj.vagasRestantes = Math.max(0, turma.maxAlunos - ocupadas);
  obj.lotada = obj.vagasRestantes <= 0;
  return obj;
}

// ===================== LISTAR TURMAS (público/autenticado) =====================
router.get("/", exigirAuth, async (req, res) => {
  try {
    const { todos } = req.query;
    const filtro = {};
    if (!(todos === "1" && req.userRole === "admin")) filtro.ativa = true;

    const turmas = await Turma.find(filtro).populate("professorId", "nome").sort({ dataInicio: 1 });
    const comContagem = await Promise.all(turmas.map(comVagas));
    res.json(comContagem);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.get("/:id", exigirAuth, async (req, res) => {
  try {
    const turma = await Turma.findById(req.params.id).populate("professorId", "nome perfilProfessor");
    if (!turma) return res.status(404).json({ msg: "Turma não encontrada." });
    res.json(await comVagas(turma));
  } catch (err) {
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// Entrar na lista de espera de uma turma lotada
router.post("/:id/lista-espera", exigirAuth, async (req, res) => {
  try {
    const { nome, email, telefone } = req.body;
    if (!nome || !email) return res.status(400).json({ msg: "Informe nome e e-mail." });
    const turma = await Turma.findById(req.params.id);
    if (!turma) return res.status(404).json({ msg: "Turma não encontrada." });
    turma.listaEspera.push({ nome, email, telefone });
    await turma.save();
    res.json({ msg: "Você entrou na lista de espera. Avisaremos assim que houver vaga." });
  } catch (err) {
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// ===================== ADMIN =====================
router.post("/", exigirAuth, exigirAdmin, async (req, res) => {
  try {
    const turma = await Turma.create(req.body);
    res.json(turma);
  } catch (err) {
    res.status(400).json({ msg: err.message });
  }
});

router.put("/:id", exigirAuth, exigirAdmin, async (req, res) => {
  try {
    const turma = await Turma.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!turma) return res.status(404).json({ msg: "Turma não encontrada." });
    res.json(turma);
  } catch (err) {
    res.status(400).json({ msg: err.message });
  }
});

router.delete("/:id", exigirAuth, exigirAdmin, async (req, res) => {
  try {
    await Turma.findByIdAndUpdate(req.params.id, { ativa: false });
    res.json({ msg: "Turma desativada." });
  } catch (err) {
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.get("/:id/matriculados", exigirAuth, exigirAdmin, async (req, res) => {
  try {
    const matriculas = await Matricula.find({ turmaId: req.params.id, status: { $in: ["pendente_pagamento", "confirmada"] } })
      .populate("alunoId", "nome email")
      .sort({ criadoEm: 1 });
    res.json(matriculas);
  } catch (err) {
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

module.exports = router;
