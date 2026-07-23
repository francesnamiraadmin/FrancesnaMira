const express = require("express");
const router = express.Router();
const HorarioSlot = require("../models/horarioSlot");
const Matricula = require("../models/matricula");
const { exigirAuth, exigirAdmin } = require("../middleware/auth");

const MODALIDADES = ["particular", "turma"];
const PERIODOS = ["diurno", "vespertino", "noturno"];
const TIPOS_CURSO = HorarioSlot.TIPOS_CURSO;

function normalizarCursos(cursos) {
  if (!Array.isArray(cursos)) return [];
  return [...new Set(cursos.filter(c => TIPOS_CURSO.includes(c)))];
}

async function ocupacaoPorSlot(slotIds) {
  const grupos = await Matricula.aggregate([
    { $match: { status: "confirmada", "slotsEscolhidos.slotId": { $in: slotIds } } },
    { $unwind: "$slotsEscolhidos" },
    { $match: { "slotsEscolhidos.slotId": { $in: slotIds } } },
    { $group: { _id: "$slotsEscolhidos.slotId", total: { $sum: 1 } } }
  ]);
  return Object.fromEntries(grupos.map(g => [String(g._id), g.total]));
}

// ===================== ADMIN — precisa vir antes das rotas genéricas =====================
router.get("/admin/grade", exigirAuth, exigirAdmin, async (req, res) => {
  try {
    const { modalidade } = req.query;
    const filtro = {};
    if (modalidade) filtro.modalidade = modalidade;
    const slots = await HorarioSlot.find(filtro).sort({ modalidade: 1, periodo: 1, diaSemana: 1, horaInicio: 1 });
    const mapa = await ocupacaoPorSlot(slots.map(s => s._id));
    res.json(slots.map(s => ({ ...s.toObject(), ocupadas: mapa[String(s._id)] || 0 })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.get("/admin/slots/:id/ocupantes", exigirAuth, exigirAdmin, async (req, res) => {
  try {
    const matriculas = await Matricula.find({ status: "confirmada", "slotsEscolhidos.slotId": req.params.id })
      .populate("alunoId", "nome email")
      .select("alunoId dadosPessoais precoFinal criadoEm");
    res.json(matriculas.map(m => ({
      matriculaId: m._id,
      nome: m.alunoId?.nome || m.dadosPessoais?.nome,
      email: m.alunoId?.email || m.dadosPessoais?.email,
      precoFinal: m.precoFinal,
      criadoEm: m.criadoEm
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.post("/admin/slots", exigirAuth, exigirAdmin, async (req, res) => {
  try {
    const { modalidade, diaSemana, horaInicio, periodo, capacidadeMaxima, cursos } = req.body;
    if (!MODALIDADES.includes(modalidade)) return res.status(400).json({ msg: "Modalidade inválida." });
    if (!PERIODOS.includes(periodo)) return res.status(400).json({ msg: "Período inválido." });
    if (diaSemana === undefined || diaSemana < 0 || diaSemana > 6) return res.status(400).json({ msg: "Dia da semana inválido." });
    if (!horaInicio) return res.status(400).json({ msg: "Informe o horário." });

    const slot = await HorarioSlot.create({
      modalidade, diaSemana, horaInicio, periodo,
      capacidadeMaxima: modalidade === "particular" ? 1 : Math.max(1, Number(capacidadeMaxima) || 1),
      cursos: normalizarCursos(cursos)
    });
    res.json(slot);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ msg: "Já existe um horário igual para essa modalidade." });
    console.error(err);
    res.status(400).json({ msg: err.message || "Erro ao criar horário." });
  }
});

router.put("/admin/slots/:id", exigirAuth, exigirAdmin, async (req, res) => {
  try {
    const slot = await HorarioSlot.findById(req.params.id);
    if (!slot) return res.status(404).json({ msg: "Horário não encontrado." });

    const { capacidadeMaxima, ativo, cursos } = req.body;
    if (capacidadeMaxima !== undefined) {
      slot.capacidadeMaxima = slot.modalidade === "particular" ? 1 : Math.max(1, Number(capacidadeMaxima) || 1);
    }
    if (ativo !== undefined) slot.ativo = !!ativo;
    if (cursos !== undefined) slot.cursos = normalizarCursos(cursos);
    await slot.save();
    res.json(slot);
  } catch (err) {
    console.error(err);
    res.status(400).json({ msg: err.message || "Erro ao editar horário." });
  }
});

// Remove definitivamente: a célula volta ao estado original (nunca configurado) e pode
// ser recriada livremente. Matrículas já confirmadas guardam diaSemana/horaInicio de forma
// independente do HorarioSlot, então o histórico de quem ocupou o horário não é afetado.
router.delete("/admin/slots/:id", exigirAuth, exigirAdmin, async (req, res) => {
  try {
    const slot = await HorarioSlot.findByIdAndDelete(req.params.id);
    if (!slot) return res.status(404).json({ msg: "Horário não encontrado." });
    res.json({ msg: "Horário removido." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// ===================== ALUNO =====================
router.get("/:modalidade/:periodo", exigirAuth, async (req, res) => {
  try {
    const { modalidade, periodo } = req.params;
    const { curso } = req.query;
    if (!MODALIDADES.includes(modalidade)) return res.status(400).json({ msg: "Modalidade inválida." });
    if (!PERIODOS.includes(periodo)) return res.status(400).json({ msg: "Período inválido." });

    const filtro = { modalidade, periodo, ativo: true };
    // Um horário sem "cursos" definido fica liberado para todos os tipos; só restringe
    // quando o admin marcou tipos específicos e nenhum deles bate com o curso da matrícula.
    if (curso && TIPOS_CURSO.includes(curso)) {
      filtro.$or = [{ cursos: { $exists: false } }, { cursos: { $size: 0 } }, { cursos: curso }];
    }

    const slots = await HorarioSlot.find(filtro).sort({ diaSemana: 1, horaInicio: 1 });
    const mapa = await ocupacaoPorSlot(slots.map(s => s._id));

    res.json(slots.map(s => {
      const ocupadas = mapa[String(s._id)] || 0;
      return {
        _id: s._id,
        diaSemana: s.diaSemana,
        horaInicio: s.horaInicio,
        capacidadeMaxima: s.capacidadeMaxima,
        disponivel: ocupadas < s.capacidadeMaxima
      };
    }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

module.exports = router;
