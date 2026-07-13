const express = require("express");
const router = express.Router();
const User = require("../models/user");
const Turma = require("../models/turma");
const Matricula = require("../models/matricula");
const PagamentoMatricula = require("../models/pagamentoMatricula");
const { exigirAuth, exigirAdmin } = require("../middleware/auth");

router.use(exigirAuth, exigirAdmin);

// ===================== KPIs / DASHBOARD =====================
router.get("/kpis", async (req, res) => {
  try {
    const [alunosMatriculados, turmasAtivas, pagamentosPendentes, matriculasConfirmadas] = await Promise.all([
      Matricula.distinct("alunoId", { status: { $in: ["pendente_pagamento", "confirmada"] } }),
      Turma.countDocuments({ ativa: true }),
      PagamentoMatricula.countDocuments({ status: "pendente" }),
      Matricula.find({ status: "confirmada" }).select("precoFinal tipo criadoEm")
    ]);

    const receitaTotal = matriculasConfirmadas.reduce((acc, m) => acc + (m.precoFinal || 0), 0);
    const porTipo = { turma: 0, particular: 0 };
    matriculasConfirmadas.forEach(m => { porTipo[m.tipo] = (porTipo[m.tipo] || 0) + 1; });

    // Receita dos últimos 6 meses
    const seisMeses = new Date();
    seisMeses.setMonth(seisMeses.getMonth() - 5);
    seisMeses.setDate(1);
    seisMeses.setHours(0, 0, 0, 0);
    const receitaPorMes = {};
    matriculasConfirmadas.filter(m => m.criadoEm >= seisMeses).forEach(m => {
      const chave = `${m.criadoEm.getFullYear()}-${String(m.criadoEm.getMonth() + 1).padStart(2, "0")}`;
      receitaPorMes[chave] = (receitaPorMes[chave] || 0) + (m.precoFinal || 0);
    });

    res.json({
      totalAlunosMatriculados: alunosMatriculados.length,
      turmasAtivas,
      pagamentosPendentes,
      receitaTotal,
      totalMatriculas: matriculasConfirmadas.length,
      porTipo,
      receitaPorMes
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// ===================== PAGAMENTOS =====================
router.get("/pagamentos", async (req, res) => {
  try {
    const { status } = req.query;
    const filtro = status ? { status } : {};
    const pagamentos = await PagamentoMatricula.find(filtro)
      .populate("alunoId", "nome email")
      .populate("matriculaId")
      .sort({ criadoEm: -1 })
      .limit(200);
    res.json(pagamentos);
  } catch (err) {
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// ===================== PROFESSORES (perfil de agenda) =====================
router.get("/professores", async (req, res) => {
  try {
    const professores = await User.find({ role: { $in: ["professor", "admin"] } })
      .select("nome email especialidades perfilProfessor criadoEm");
    res.json(professores);
  } catch (err) {
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.put("/professores/:id/perfil", async (req, res) => {
  try {
    const { bio, foto, idiomas, corAgenda, ativoParaAulas } = req.body;
    const professor = await User.findById(req.params.id);
    if (!professor || (professor.role !== "professor" && professor.role !== "admin")) {
      return res.status(404).json({ msg: "Professor não encontrado." });
    }
    professor.perfilProfessor = {
      bio: bio !== undefined ? bio : professor.perfilProfessor?.bio,
      foto: foto !== undefined ? foto : professor.perfilProfessor?.foto,
      idiomas: idiomas !== undefined ? idiomas : professor.perfilProfessor?.idiomas,
      corAgenda: corAgenda || professor.perfilProfessor?.corAgenda || "#4F6B4A",
      ativoParaAulas: ativoParaAulas !== undefined ? ativoParaAulas : professor.perfilProfessor?.ativoParaAulas
    };
    await professor.save();
    res.json(professor.perfilProfessor);
  } catch (err) {
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

module.exports = router;
