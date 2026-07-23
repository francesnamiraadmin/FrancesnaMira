const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const User = require("../models/user");
const Rubrica = require("../models/rubrica");
const Producao = require("../models/producao");
const { exigirAuth, exigirAdmin } = require("../middleware/auth");
const { TIPOS_CURSO } = require("../utils/tiposCurso");

router.use(exigirAuth, exigirAdmin);

// ===================== PROFESSORES =====================
router.get("/professores", async (req, res) => {
  try {
    const professores = await User.find({ role: "professor" }).select("nome email especialidades criadoEm");
    res.json(professores);
  } catch (err) {
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.post("/professores", async (req, res) => {
  try {
    const { nome, email, senha, especialidades } = req.body;
    if (!nome || !email || !senha) return res.status(400).json({ msg: "Preencha todos os campos." });
    if (senha.length < 6) return res.status(400).json({ msg: "A senha deve ter pelo menos 6 caracteres." });

    const existente = await User.findOne({ email: email.toLowerCase() });
    if (existente) return res.status(400).json({ msg: "Já existe uma conta com esse e-mail." });

    const hash = await bcrypt.hash(senha, 10);
    const professor = await User.create({
      nome, email: email.toLowerCase(), senha: hash, verificado: true,
      role: "professor", especialidades: especialidades || []
    });
    res.json({ msg: "Professor criado com sucesso.", professor: { _id: professor._id, nome: professor.nome, email: professor.email } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.put("/professores/:id", async (req, res) => {
  try {
    const { especialidades } = req.body;
    const professor = await User.findOneAndUpdate(
      { _id: req.params.id, role: "professor" },
      { especialidades: especialidades || [] },
      { new: true }
    ).select("nome email especialidades");
    if (!professor) return res.status(404).json({ msg: "Professor não encontrado." });
    res.json(professor);
  } catch (err) {
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.delete("/professores/:id", async (req, res) => {
  try {
    const professor = await User.findOneAndUpdate({ _id: req.params.id, role: "professor" }, { role: "aluno", especialidades: [] });
    if (!professor) return res.status(404).json({ msg: "Professor não encontrado." });
    res.json({ msg: "Professor removido (a conta volta a ser de aluno)." });
  } catch (err) {
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// ===================== RUBRICAS (critérios e pesos por exame) =====================
router.get("/rubricas", async (req, res) => {
  try {
    const rubricas = await Rubrica.find();
    res.json(rubricas);
  } catch (err) {
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// :exame no path é, na prática, o courseType (TCF/DELF/DALF/TEF/A1/A2/B1/B2) — mantido
// com esse nome só por compatibilidade com o admin já existente para os 4 exames.
router.put("/rubricas/:exame", async (req, res) => {
  try {
    const { criterios, notaMaxima, modalidade } = req.body;
    if (!TIPOS_CURSO.includes(req.params.exame)) return res.status(400).json({ msg: "Curso inválido." });
    if (!criterios?.length) return res.status(400).json({ msg: "Informe ao menos um critério." });
    const modalidadeFinal = modalidade === "oral" ? "oral" : "textual";
    const exameProva = ["TCF", "TEF", "DELF", "DALF"].includes(req.params.exame) ? req.params.exame : undefined;
    const rubrica = await Rubrica.findOneAndUpdate(
      { courseType: req.params.exame, modalidade: modalidadeFinal },
      { courseType: req.params.exame, exame: exameProva, modalidade: modalidadeFinal, criterios, notaMaxima: notaMaxima || 20, atualizadoEm: new Date() },
      { new: true, upsert: true }
    );
    res.json(rubrica);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// ===================== ESTATÍSTICAS GERAIS =====================
router.get("/estatisticas", async (req, res) => {
  try {
    const total = await Producao.countDocuments();
    const statusList = ["em_fila", "em_correcao", "corrigido", "devolvido", "cancelado", "arquivado"];
    const porStatus = {};
    for (const s of statusList) porStatus[s] = await Producao.countDocuments({ status: s });

    const professores = await User.find({ role: "professor" }).select("nome");
    const porProfessor = [];
    for (const p of professores) {
      const concluidas = await Producao.find({
        professorId: p._id, status: { $in: ["corrigido", "devolvido"] },
        dataEnvio: { $ne: null }, dataCorrecao: { $ne: null }
      });
      let tempoMedioHoras = null;
      if (concluidas.length) {
        const totalMs = concluidas.reduce((acc, c) => acc + (c.dataCorrecao - c.dataEnvio), 0);
        tempoMedioHoras = Math.round((totalMs / concluidas.length / 3600000) * 10) / 10;
      }
      porProfessor.push({ nome: p.nome, concluidas: concluidas.length, tempoMedioHoras });
    }

    res.json({ total, porStatus, porProfessor });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

module.exports = router;
