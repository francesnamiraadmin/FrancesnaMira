const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const mongoose = require("mongoose");
const Disponibilidade = require("../models/disponibilidade");
const User = require("../models/user");
const { exigirAuth, exigirProfessor } = require("../middleware/auth");
const { registrarCliente, transmitir } = require("../utils/sse");

const HOLD_MINUTOS = 10;

function podeGerenciar(req, slotProfessorId) {
  return req.userRole === "admin" || String(slotProfessorId) === req.userId;
}

// ===================== SSE: ATUALIZAÇÃO EM TEMPO REAL =====================
router.get("/stream", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no"
  });
  res.write("retry: 3000\n\n");
  const remover = registrarCliente(res);
  const heartbeat = setInterval(() => res.write(": ping\n\n"), 25000);
  req.on("close", () => { clearInterval(heartbeat); remover(); });
});

// ===================== LISTAR PROFESSORES DISPONÍVEIS PARA AULA PARTICULAR =====================
router.get("/professores", exigirAuth, async (req, res) => {
  try {
    const professores = await User.find({
      role: { $in: ["professor", "admin"] },
      "perfilProfessor.ativoParaAulas": { $ne: false }
    }).select("nome perfilProfessor");
    res.json(professores);
  } catch (err) {
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// ===================== LISTAR HORÁRIOS DISPONÍVEIS (aluno) =====================
router.get("/", exigirAuth, async (req, res) => {
  try {
    const { professorId, de, ate, todos } = req.query;
    const filtro = {};
    if (professorId) filtro.professorId = professorId;
    if (de || ate) {
      filtro.dataHoraInicio = {};
      if (de) filtro.dataHoraInicio.$gte = new Date(de);
      if (ate) filtro.dataHoraInicio.$lte = new Date(ate);
    }
    // Alunos só veem disponíveis; staff (professor/admin) com ?todos=1 vê tudo para gerenciar a agenda
    const souStaff = req.userRole === "professor" || req.userRole === "admin";
    if (!(todos === "1" && souStaff)) filtro.status = "disponivel";

    const slots = await Disponibilidade.find(filtro)
      .populate("professorId", "nome perfilProfessor.corAgenda")
      .sort({ dataHoraInicio: 1 });
    res.json(slots);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// ===================== RESERVAR TEMPORARIAMENTE (hold do carrinho) =====================
router.post("/reservar-temp", exigirAuth, async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ msg: "Selecione ao menos um horário." });

  const session = await mongoose.startSession();
  try {
    const reservados = [];
    await session.withTransaction(async () => {
      for (const id of ids) {
        const slot = await Disponibilidade.findOneAndUpdate(
          { _id: id, status: "disponivel" },
          { status: "reservado", alunoId: req.userId, holdExpiraEm: new Date(Date.now() + HOLD_MINUTOS * 60 * 1000) },
          { new: true, session }
        );
        if (!slot) {
          const erro = new Error("CONFLITO");
          erro.conflitoId = id;
          throw erro;
        }
        reservados.push(slot);
      }
    });
    transmitir("disponibilidade-atualizada", { ids });
    res.json({ msg: `Horário(s) reservado(s) por ${HOLD_MINUTOS} minutos para você concluir o pagamento.`, slots: reservados, expiraEm: reservados[0]?.holdExpiraEm });
  } catch (err) {
    if (err.message === "CONFLITO") {
      return res.status(409).json({ msg: "Um dos horários escolhidos acabou de ser reservado por outro aluno. Atualize e escolha novamente." });
    }
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  } finally {
    session.endSession();
  }
});

// ===================== LIBERAR HOLD (aluno desiste antes de pagar) =====================
router.post("/:id/liberar-hold", exigirAuth, async (req, res) => {
  try {
    const slot = await Disponibilidade.findOneAndUpdate(
      { _id: req.params.id, alunoId: req.userId, status: "reservado", matriculaId: null },
      { status: "disponivel", alunoId: null, holdExpiraEm: null },
      { new: true }
    );
    if (slot) transmitir("disponibilidade-atualizada", { ids: [slot._id] });
    res.json({ msg: "Horário liberado." });
  } catch (err) {
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// ===================== ADMIN/PROFESSOR: GERENCIAR AGENDA =====================
router.post("/", exigirAuth, exigirProfessor, async (req, res) => {
  try {
    const { professorId, dataHoraInicio, duracaoMinutos } = req.body;
    const profFinal = req.userRole === "admin" ? (professorId || req.userId) : req.userId;
    const slot = await Disponibilidade.create({
      professorId: profFinal, dataHoraInicio, duracaoMinutos: duracaoMinutos || 60, status: "disponivel"
    });
    transmitir("disponibilidade-atualizada", { ids: [slot._id] });
    res.json(slot);
  } catch (err) {
    console.error(err);
    res.status(400).json({ msg: err.message });
  }
});

// Cria horários recorrentes: mesmo dia da semana e hora, durante N semanas
router.post("/recorrente", exigirAuth, exigirProfessor, async (req, res) => {
  try {
    const { professorId, diaSemana, hora, duracaoMinutos, semanas, dataInicial } = req.body;
    if (diaSemana === undefined || !hora || !semanas) return res.status(400).json({ msg: "Preencha dia da semana, hora e número de semanas." });

    const profFinal = req.userRole === "admin" ? (professorId || req.userId) : req.userId;
    const recorrenciaId = crypto.randomUUID();
    const [horaN, minN] = hora.split(":").map(Number);

    const base = dataInicial ? new Date(dataInicial) : new Date();
    let atual = new Date(base);
    // avança até o próximo dia da semana desejado (0=domingo ... 6=sábado)
    while (atual.getDay() !== Number(diaSemana)) atual.setDate(atual.getDate() + 1);

    const criados = [];
    for (let i = 0; i < Number(semanas); i++) {
      const dataHora = new Date(atual);
      dataHora.setDate(atual.getDate() + i * 7);
      dataHora.setHours(horaN, minN, 0, 0);
      criados.push({
        professorId: profFinal, dataHoraInicio: dataHora, duracaoMinutos: duracaoMinutos || 60,
        status: "disponivel", recorrenciaId
      });
    }
    const inseridos = await Disponibilidade.insertMany(criados);
    transmitir("disponibilidade-atualizada", { ids: inseridos.map(s => s._id) });
    res.json({ msg: `${inseridos.length} horários criados.`, slots: inseridos });
  } catch (err) {
    console.error(err);
    res.status(400).json({ msg: err.message });
  }
});

router.put("/:id", exigirAuth, exigirProfessor, async (req, res) => {
  try {
    const slot = await Disponibilidade.findById(req.params.id);
    if (!slot) return res.status(404).json({ msg: "Horário não encontrado." });
    if (!podeGerenciar(req, slot.professorId)) return res.status(403).json({ msg: "Você só pode editar sua própria agenda." });

    const { dataHoraInicio, duracaoMinutos } = req.body;
    if (dataHoraInicio) slot.dataHoraInicio = dataHoraInicio;
    if (duracaoMinutos) slot.duracaoMinutos = duracaoMinutos;
    await slot.save();
    transmitir("disponibilidade-atualizada", { ids: [slot._id] });
    res.json(slot);
  } catch (err) {
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.post("/:id/mover", exigirAuth, exigirProfessor, async (req, res) => {
  try {
    const slot = await Disponibilidade.findById(req.params.id);
    if (!slot) return res.status(404).json({ msg: "Horário não encontrado." });
    if (!podeGerenciar(req, slot.professorId)) return res.status(403).json({ msg: "Sem permissão." });
    if (slot.status === "reservado") return res.status(400).json({ msg: "Não é possível mover um horário já reservado por um aluno." });

    slot.dataHoraInicio = req.body.dataHoraInicio;
    await slot.save();
    transmitir("disponibilidade-atualizada", { ids: [slot._id] });
    res.json(slot);
  } catch (err) {
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.post("/:id/duplicar", exigirAuth, exigirProfessor, async (req, res) => {
  try {
    const slot = await Disponibilidade.findById(req.params.id);
    if (!slot) return res.status(404).json({ msg: "Horário não encontrado." });
    if (!podeGerenciar(req, slot.professorId)) return res.status(403).json({ msg: "Sem permissão." });

    const nova = await Disponibilidade.create({
      professorId: slot.professorId,
      dataHoraInicio: req.body.dataHoraInicio || slot.dataHoraInicio,
      duracaoMinutos: slot.duracaoMinutos,
      status: "disponivel"
    });
    transmitir("disponibilidade-atualizada", { ids: [nova._id] });
    res.json(nova);
  } catch (err) {
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.post("/:id/bloquear", exigirAuth, exigirProfessor, async (req, res) => {
  try {
    const slot = await Disponibilidade.findById(req.params.id);
    if (!slot) return res.status(404).json({ msg: "Horário não encontrado." });
    if (!podeGerenciar(req, slot.professorId)) return res.status(403).json({ msg: "Sem permissão." });
    slot.status = "bloqueado";
    await slot.save();
    transmitir("disponibilidade-atualizada", { ids: [slot._id] });
    res.json(slot);
  } catch (err) {
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.post("/:id/liberar", exigirAuth, exigirProfessor, async (req, res) => {
  try {
    const slot = await Disponibilidade.findById(req.params.id);
    if (!slot) return res.status(404).json({ msg: "Horário não encontrado." });
    if (!podeGerenciar(req, slot.professorId)) return res.status(403).json({ msg: "Sem permissão." });
    slot.status = "disponivel";
    slot.alunoId = null;
    slot.matriculaId = null;
    slot.holdExpiraEm = null;
    await slot.save();
    transmitir("disponibilidade-atualizada", { ids: [slot._id] });
    res.json(slot);
  } catch (err) {
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.delete("/:id", exigirAuth, exigirProfessor, async (req, res) => {
  try {
    const slot = await Disponibilidade.findById(req.params.id);
    if (!slot) return res.status(404).json({ msg: "Horário não encontrado." });
    if (!podeGerenciar(req, slot.professorId)) return res.status(403).json({ msg: "Sem permissão." });
    if (slot.status === "reservado") return res.status(400).json({ msg: "Não é possível excluir um horário reservado. Libere-o primeiro." });
    await slot.deleteOne();
    transmitir("disponibilidade-atualizada", { ids: [slot._id] });
    res.json({ msg: "Horário removido." });
  } catch (err) {
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

module.exports = router;
