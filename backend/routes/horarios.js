const express = require("express");
const router = express.Router();
const HorarioSlot = require("../models/horarioSlot");
const Matricula = require("../models/matricula");
const { exigirAuth, exigirAdmin } = require("../middleware/auth");
const { slotConcorrente, mensagemConflito, horariosTomados, tomadoPelaOutra } = require("../utils/conflitoHorario");

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

// Sistema de Aulas: matrículas confirmadas por horário + resumo de ocupação e receita mensal.
router.get("/admin/matriculas", exigirAuth, exigirAdmin, async (req, res) => {
  try {
    const [matriculas, slots] = await Promise.all([
      Matricula.find({ status: "confirmada", "slotsEscolhidos.0": { $exists: true } })
        .populate("alunoId", "nome email")
        .select("alunoId dadosPessoais tipo curso slotsEscolhidos precoFinal cupomCodigo criadoEm")
        .sort({ criadoEm: -1 }).lean(),
      HorarioSlot.find({ ativo: true }).select("modalidade capacidadeMaxima").lean()
    ]);
    const vagas = slots.reduce((t, s) => t + (s.modalidade === "turma" ? s.capacidadeMaxima : 1), 0);
    const ocupadas = matriculas.reduce((t, m) => t + m.slotsEscolhidos.length, 0);
    res.json({
      resumo: {
        alunos: new Set(matriculas.map(m => String(m.alunoId?._id || m.dadosPessoais?.email))).size,
        matriculas: matriculas.length,
        horariosAtivos: slots.length,
        vagas, ocupadas,
        receitaMensal: matriculas.reduce((t, m) => t + (m.precoFinal || 0), 0)
      },
      matriculas: matriculas.map(m => ({
        matriculaId: m._id,
        nome: m.alunoId?.nome || m.dadosPessoais?.nome,
        email: m.alunoId?.email || m.dadosPessoais?.email,
        telefone: m.dadosPessoais?.telefone || "",
        tipo: m.tipo, curso: m.curso,
        horarios: m.slotsEscolhidos.map(s => ({ diaSemana: s.diaSemana, horaInicio: s.horaInicio })),
        precoFinal: m.precoFinal, cupomCodigo: m.cupomCodigo || null, criadoEm: m.criadoEm
      }))
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// ===================== HORÁRIOS ATUAIS (quem tem aula em cada horário) =====================
// Grade da semana com o nome de quem comprou cada horário (matrículas confirmadas), « Turma - CURSO »
// para as aulas em turma (e as turmas do sistema antigo), mais os nomes colocados ou retirados à mão.
const HorarioAtualAjuste = require("../models/horarioAtualAjuste");
const Turma = require("../models/turma");
const User = require("../models/user");
const { escaparRegex } = require("../middleware/seguranca");
const HORA_OK = /^([01]\d|2[0-3]):[0-5]\d$/;
const DIAS_TEXTO = [["dom", 0], ["seg", 1], ["ter", 2], ["qua", 3], ["qui", 4], ["sex", 5], ["sab", 6], ["sáb", 6],
  ["sun", 0], ["mon", 1], ["tue", 2], ["wed", 3], ["thu", 4], ["fri", 5], ["sat", 6]];
const diaDoTexto = t => { const k = String(t || "").trim().toLowerCase(); const d = DIAS_TEXTO.find(([p]) => k.startsWith(p)); return d ? d[1] : null; };
const horaDoTexto = t => { const m = String(t || "").match(/(\d{1,2})\s*[:hH]\s*(\d{2})?/); return m ? String(Math.min(23, Number(m[1]))).padStart(2, "0") + ":" + (m[2] || "00") : null; };

router.get("/admin/atuais", exigirAuth, exigirAdmin, async (req, res) => {
  try {
    const agora = new Date();
    const [matriculas, turmas, ajustes] = await Promise.all([
      Matricula.find({ status: "confirmada", "slotsEscolhidos.0": { $exists: true } })
        .populate("alunoId", "nome email").select("alunoId dadosPessoais tipo curso slotsEscolhidos").lean(),
      Turma.find({ ativa: true, dataFim: { $gte: agora } }).select("nome nivel tipoProva dias horario").lean(),
      HorarioAtualAjuste.find().lean()
    ]);
    const ocultos = new Map(ajustes.filter(a => a.tipo === "oculto").map(a => [a.chave, a]));
    const celulas = {};
    const celula = (dia, hora) => (celulas[dia + "|" + hora] = celulas[dia + "|" + hora] || { diaSemana: dia, horaInicio: hora, itens: [] });
    const retirados = [];
    const por = (dia, hora, item) => {
      const chave = `${item.chave}|${dia}|${hora}`;
      const oc = ocultos.get(chave);
      if (oc) { retirados.push({ ...item, chave, diaSemana: dia, horaInicio: hora, ajusteId: String(oc._id) }); return; }
      celula(dia, hora).itens.push({ ...item, chave });
    };
    // aulas particulares: o nome do aluno; aulas em turma: « Turma - CURSO », com os alunos
    const turmasNovas = {};
    matriculas.forEach(m => {
      const nome = m.alunoId?.nome || m.dadosPessoais?.nome || m.alunoId?.email || "Aluno";
      m.slotsEscolhidos.forEach(sl => {
        if (sl.diaSemana == null || !sl.horaInicio) return;
        if (m.tipo === "turma") {
          const k = `${sl.diaSemana}|${sl.horaInicio}|${m.curso || ""}`;
          (turmasNovas[k] = turmasNovas[k] || { dia: sl.diaSemana, hora: sl.horaInicio, curso: m.curso || "", alunos: [] }).alunos.push(nome);
        } else por(sl.diaSemana, sl.horaInicio, { tipo: "aluno", texto: nome, modalidade: "particular", curso: m.curso || "", chave: "m:" + m._id });
      });
    });
    Object.values(turmasNovas).forEach(t => por(t.dia, t.hora, { tipo: "turma", texto: "Turma - " + (t.curso || "Francês"), modalidade: "turma", curso: t.curso, alunos: t.alunos, chave: "t:" + t.curso }));
    // turmas do sistema antigo (dias e horário em texto)
    turmas.forEach(t => {
      const hora = horaDoTexto(t.horario);
      if (!hora) return;
      (t.dias || []).map(diaDoTexto).filter(d => d !== null).forEach(dia =>
        por(dia, hora, { tipo: "turma", texto: "Turma - " + (t.tipoProva || t.nivel || t.nome), modalidade: "turma", curso: t.tipoProva || t.nivel || "", detalhe: t.nome, chave: "T:" + t._id }));
    });
    // nomes colocados à mão
    const contas = new Map((await User.find({ _id: { $in: ajustes.filter(a => a.alunoId).map(a => a.alunoId) } }).select("nome email").lean()).map(u => [String(u._id), u]));
    ajustes.filter(a => a.tipo === "manual").forEach(a => {
      const c = a.alunoId && contas.get(String(a.alunoId));
      celula(a.diaSemana, a.horaInicio).itens.push({ tipo: "manual", texto: a.nome, modalidade: a.modalidade, ajusteId: String(a._id), chave: "a:" + a._id,
        conta: c ? { id: String(c._id), nome: c.nome || "", email: c.email } : null });
    });
    res.json({ atualizadoEm: agora, celulas: Object.values(celulas), retirados });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// Colocar um nome num horário.
router.post("/admin/atuais/manual", exigirAuth, exigirAdmin, async (req, res) => {
  try {
    const { diaSemana, horaInicio, modalidade, alunoId } = req.body || {};
    const dia = Number(diaSemana);
    // vínculo opcional com uma conta do site; sem nome escrito, vale o nome da conta
    const conta = alunoId ? await contaParaVinculo(alunoId) : null;
    if (alunoId && !conta) return res.status(400).json({ msg: "Conta não encontrada." });
    const nome = String(req.body?.nome || "").trim() || conta?.nome || conta?.email || "";
    if (!(dia >= 0 && dia <= 6) || !HORA_OK.test(String(horaInicio)) || !nome) return res.status(400).json({ msg: "Informe o dia, o horário e o nome." });
    const a = await HorarioAtualAjuste.create({ tipo: "manual", diaSemana: dia, horaInicio, nome: nome.slice(0, 120), modalidade: modalidade === "turma" ? "turma" : "particular", alunoId: conta?._id || null, criadoPor: req.userId });
    res.json({ ok: true, id: a._id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

async function contaParaVinculo(id) {
  if (!/^[a-f0-9]{24}$/i.test(String(id))) return null;
  return User.findById(id).select("nome email").lean();
}
// Contas do site para vincular a um nome dos Horários Atuais (busca por nome ou e-mail).
router.get("/admin/atuais/contas", exigirAuth, exigirAdmin, async (req, res) => {
  try {
    const q = String(req.query.q || "").trim().slice(0, 80);
    if (q.length < 2) return res.json([]);
    const rx = { $regex: escaparRegex(q), $options: "i" };
    const us = await User.find({ $or: [{ nome: rx }, { email: rx }] }).select("nome email role").sort({ nome: 1 }).limit(8).lean();
    res.json(us.map(u => ({ id: String(u._id), nome: u.nome || "", email: u.email, role: u.role })));
  } catch (err) { console.error(err); res.status(500).json({ msg: "Erro no servidor." }); }
});
// Vincular (ou desvincular, com alunoId vazio) um nome já colocado à mão a uma conta do site.
router.put("/admin/atuais/ajuste/:id/vinculo", exigirAuth, exigirAdmin, async (req, res) => {
  try {
    if (!/^[a-f0-9]{24}$/i.test(req.params.id)) return res.status(400).json({ msg: "Ajuste inválido." });
    const conta = req.body?.alunoId ? await contaParaVinculo(req.body.alunoId) : null;
    if (req.body?.alunoId && !conta) return res.status(400).json({ msg: "Conta não encontrada." });
    const a = await HorarioAtualAjuste.findOneAndUpdate({ _id: req.params.id, tipo: "manual" }, { alunoId: conta?._id || null }, { new: true });
    if (!a) return res.status(404).json({ msg: "Nome não encontrado." });
    // aulas já registradas deste nome passam para a conta (aparecem no Meu Espaço do aluno)
    await require("../models/registroAula").updateMany({ chave: "a:" + a._id }, { alunoId: conta?._id || null });
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ msg: "Erro no servidor." }); }
});

// Retirar da grade um nome que vem de matrícula/turma (a matrícula não muda).
router.post("/admin/atuais/retirar", exigirAuth, exigirAdmin, async (req, res) => {
  try {
    const { chave } = req.body || {};
    const m = String(chave || "").match(/^([mtT]:[^|]*)\|([0-6])\|(\d{2}:\d{2})$/);
    if (!m) return res.status(400).json({ msg: "Item inválido." });
    const existe = await HorarioAtualAjuste.findOne({ tipo: "oculto", chave });
    if (!existe) await HorarioAtualAjuste.create({ tipo: "oculto", chave, diaSemana: Number(m[2]), horaInicio: m[3], criadoPor: req.userId });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// Apagar um ajuste: tira um nome colocado à mão, ou devolve à grade um nome retirado.
router.delete("/admin/atuais/ajuste/:id", exigirAuth, exigirAdmin, async (req, res) => {
  try {
    if (!/^[a-f0-9]{24}$/i.test(req.params.id)) return res.status(400).json({ msg: "Ajuste inválido." });
    await HorarioAtualAjuste.deleteOne({ _id: req.params.id });
    res.json({ ok: true });
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
    const outro = await slotConcorrente({ diaSemana, horaInicio, modalidade });
    if (outro) return res.status(409).json({ msg: mensagemConflito(outro), conflito: true });

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
    if (ativo !== undefined && !!ativo && slot.ativo === false) {
      const outro = await slotConcorrente(slot, slot._id);
      if (outro) return res.status(409).json({ msg: mensagemConflito(outro), conflito: true });
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
    const [mapa, tomados] = await Promise.all([ocupacaoPorSlot(slots.map(s => s._id)), horariosTomados()]);

    res.json(slots.map(s => {
      const ocupadas = mapa[String(s._id)] || 0;
      return {
        _id: s._id,
        diaSemana: s.diaSemana,
        horaInicio: s.horaInicio,
        capacidadeMaxima: s.capacidadeMaxima,
        // indisponível também quando o horário já é de um aluno da outra modalidade
        disponivel: ocupadas < s.capacidadeMaxima && !tomadoPelaOutra(tomados, s)
      };
    }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

module.exports = router;
