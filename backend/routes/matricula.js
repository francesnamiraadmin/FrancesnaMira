const express = require("express");
const router = express.Router();
const Matricula = require("../models/matricula");
const Turma = require("../models/turma");
const Disponibilidade = require("../models/disponibilidade");
const Cupom = require("../models/cupom");
const { exigirAuth } = require("../middleware/auth");
const { transmitir } = require("../utils/sse");

// ===================== INICIAR MATRÍCULA (monta o carrinho) =====================
router.post("/iniciar", exigirAuth, async (req, res) => {
  try {
    const { tipo, turmaId, professorId, horarioIds, pacote, dadosPessoais, cupomCodigo } = req.body;
    if (!tipo || !dadosPessoais?.nome || !dadosPessoais?.email || !dadosPessoais?.telefone) {
      return res.status(400).json({ msg: "Preencha os dados pessoais." });
    }

    let precoOriginal = 0;
    const matriculaData = { alunoId: req.userId, tipo, dadosPessoais };

    if (tipo === "turma") {
      const turma = await Turma.findById(turmaId);
      if (!turma || !turma.ativa) return res.status(404).json({ msg: "Turma não encontrada." });
      const ocupadas = await Matricula.countDocuments({ turmaId, status: { $in: ["pendente_pagamento", "confirmada"] } });
      if (ocupadas >= turma.maxAlunos) return res.status(409).json({ msg: "Esta turma acabou de lotar. Escolha outra ou entre na lista de espera." });
      precoOriginal = turma.preco;
      matriculaData.turmaId = turmaId;
      matriculaData.professorId = turma.professorId;
    } else if (tipo === "particular") {
      if (!Array.isArray(horarioIds) || horarioIds.length === 0) return res.status(400).json({ msg: "Selecione ao menos um horário." });
      if (!pacote?.preco) return res.status(400).json({ msg: "Selecione um pacote." });

      const slots = await Disponibilidade.find({ _id: { $in: horarioIds } });
      const validos = slots.length === horarioIds.length && slots.every(
        s => s.status === "reservado" && String(s.alunoId) === req.userId && s.holdExpiraEm && s.holdExpiraEm > new Date()
      );
      if (!validos) {
        return res.status(409).json({ msg: "Um ou mais horários não estão mais reservados para você. Selecione novamente." });
      }
      precoOriginal = pacote.preco;
      matriculaData.professorId = professorId;
      matriculaData.horarios = horarioIds;
      matriculaData.pacote = { nome: pacote.nome, horas: pacote.horas, periodicidade: pacote.periodicidade };
    } else {
      return res.status(400).json({ msg: "Tipo de matrícula inválido." });
    }

    let desconto = 0;
    let cupomValido = null;
    if (cupomCodigo) {
      const cupom = await Cupom.findOne({ codigo: cupomCodigo.toUpperCase(), ativo: true });
      if (cupom && (!cupom.validoAte || cupom.validoAte > new Date()) && (cupom.usoMaximo === null || cupom.usosAtuais < cupom.usoMaximo)) {
        desconto = Math.min(cupom.tipo === "percentual" ? precoOriginal * (cupom.valor / 100) : cupom.valor, precoOriginal);
        cupomValido = cupom;
      }
    }

    matriculaData.precoOriginal = precoOriginal;
    matriculaData.desconto = desconto;
    matriculaData.precoFinal = Math.max(0, precoOriginal - desconto);
    matriculaData.cupomCodigo = cupomValido ? cupomValido.codigo : null;
    matriculaData.expiraEm = new Date(Date.now() + 20 * 60 * 1000);

    const matricula = await Matricula.create(matriculaData);

    if (tipo === "particular") {
      await Disponibilidade.updateMany(
        { _id: { $in: horarioIds } },
        { matriculaId: matricula._id, holdExpiraEm: matricula.expiraEm }
      );
    }
    if (cupomValido) {
      cupomValido.usosAtuais += 1;
      await cupomValido.save();
    }

    res.json({ msg: "Matrícula iniciada. Conclua o pagamento para confirmar.", matricula });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// ===================== VALIDAR CUPOM (preview, sem consumir uso) =====================
router.post("/validar-cupom", exigirAuth, async (req, res) => {
  try {
    const { codigo, precoOriginal } = req.body;
    const cupom = await Cupom.findOne({ codigo: (codigo || "").toUpperCase(), ativo: true });
    if (!cupom || (cupom.validoAte && cupom.validoAte < new Date()) || (cupom.usoMaximo !== null && cupom.usosAtuais >= cupom.usoMaximo)) {
      return res.status(404).json({ msg: "Cupom inválido ou expirado." });
    }
    const desconto = Math.min(cupom.tipo === "percentual" ? precoOriginal * (cupom.valor / 100) : cupom.valor, precoOriginal);
    res.json({ valido: true, desconto, precoFinal: Math.max(0, precoOriginal - desconto) });
  } catch (err) {
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// ===================== MINHAS MATRÍCULAS (aluno) =====================
router.get("/minhas", exigirAuth, async (req, res) => {
  try {
    const matriculas = await Matricula.find({ alunoId: req.userId })
      .populate("turmaId")
      .populate("professorId", "nome perfilProfessor")
      .populate("horarios")
      .sort({ criadoEm: -1 });
    res.json(matriculas);
  } catch (err) {
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// ===================== DETALHE =====================
router.get("/:id", exigirAuth, async (req, res) => {
  try {
    const matricula = await Matricula.findById(req.params.id)
      .populate("turmaId").populate("professorId", "nome perfilProfessor").populate("horarios").populate("alunoId", "nome email");
    if (!matricula) return res.status(404).json({ msg: "Matrícula não encontrada." });
    const souDono = matricula.alunoId._id.toString() === req.userId;
    const souStaff = req.userRole === "professor" || req.userRole === "admin";
    if (!souDono && !souStaff) return res.status(403).json({ msg: "Acesso negado." });
    res.json(matricula);
  } catch (err) {
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// ===================== CANCELAR =====================
router.post("/:id/cancelar", exigirAuth, async (req, res) => {
  try {
    const matricula = await Matricula.findById(req.params.id);
    if (!matricula) return res.status(404).json({ msg: "Matrícula não encontrada." });
    const souDono = matricula.alunoId.toString() === req.userId;
    if (!souDono && req.userRole !== "admin") return res.status(403).json({ msg: "Acesso negado." });
    if (matricula.status === "cancelada") return res.status(400).json({ msg: "Esta matrícula já está cancelada." });

    matricula.status = "cancelada";
    await matricula.save();

    if (matricula.tipo === "particular" && matricula.horarios?.length) {
      await Disponibilidade.updateMany(
        { _id: { $in: matricula.horarios } },
        { status: "disponivel", alunoId: null, matriculaId: null, holdExpiraEm: null }
      );
      transmitir("disponibilidade-atualizada", { ids: matricula.horarios });
    }
    res.json({ msg: "Matrícula cancelada." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// ===================== REMARCAR (troca um horário por outro) =====================
router.post("/:id/remarcar", exigirAuth, async (req, res) => {
  try {
    const { horarioAntigoId, horarioNovoId } = req.body;
    const matricula = await Matricula.findById(req.params.id);
    if (!matricula) return res.status(404).json({ msg: "Matrícula não encontrada." });
    if (matricula.alunoId.toString() !== req.userId) return res.status(403).json({ msg: "Acesso negado." });
    if (matricula.status !== "confirmada") return res.status(400).json({ msg: "Só é possível remarcar aulas já confirmadas." });
    if (!matricula.horarios.map(String).includes(horarioAntigoId)) return res.status(400).json({ msg: "Este horário não pertence a esta matrícula." });

    const novo = await Disponibilidade.findOneAndUpdate(
      { _id: horarioNovoId, status: "disponivel" },
      { status: "reservado", alunoId: req.userId, matriculaId: matricula._id },
      { new: true }
    );
    if (!novo) return res.status(409).json({ msg: "O novo horário escolhido não está mais disponível." });

    await Disponibilidade.findByIdAndUpdate(horarioAntigoId, { status: "disponivel", alunoId: null, matriculaId: null, holdExpiraEm: null });

    matricula.horarios = matricula.horarios.map(h => String(h) === horarioAntigoId ? novo._id : h);
    await matricula.save();

    transmitir("disponibilidade-atualizada", { ids: [horarioAntigoId, novo._id] });
    res.json({ msg: "Aula remarcada com sucesso!", matricula });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

module.exports = router;
