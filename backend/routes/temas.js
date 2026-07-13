const express = require("express");
const router = express.Router();
const Tema = require("../models/tema");
const User = require("../models/user");
const Rubrica = require("../models/rubrica");
const { exigirAuth, exigirAdmin } = require("../middleware/auth");

// RUBRICA DE UM EXAME (critérios oficiais) — usada pelo professor na correção
router.get("/rubrica/:exame", exigirAuth, async (req, res) => {
  try {
    const rubrica = await Rubrica.findOne({ exame: req.params.exame });
    if (!rubrica) return res.status(404).json({ msg: "Rubrica não encontrada para este exame." });
    res.json(rubrica);
  } catch (err) {
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// LISTAR TEMAS (com filtros) — qualquer usuário autenticado
router.get("/", exigirAuth, async (req, res) => {
  try {
    const { exame, nivel, tipoProducao, dificuldade, busca, todos } = req.query;
    const filtro = {};
    if (!(todos === "1" && req.userRole === "admin")) filtro.ativo = true;
    if (exame) filtro.exame = exame;
    if (nivel) filtro.nivel = nivel;
    if (tipoProducao) filtro.tipoProducao = tipoProducao;
    if (dificuldade) filtro.dificuldade = dificuldade;
    if (busca) filtro.titulo = { $regex: busca, $options: "i" };

    const temas = await Tema.find(filtro).select("-coletanea").sort({ criadoEm: -1 });
    res.json(temas);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// DETALHE DE UM TEMA (com coletânea completa)
router.get("/:id", exigirAuth, async (req, res) => {
  try {
    const tema = await Tema.findById(req.params.id);
    if (!tema) return res.status(404).json({ msg: "Tema não encontrado." });
    res.json(tema);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// FAVORITAR / DESFAVORITAR
router.post("/:id/favoritar", exigirAuth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    const idx = user.temasFavoritos.findIndex(t => t.toString() === req.params.id);
    let favoritado;
    if (idx >= 0) { user.temasFavoritos.splice(idx, 1); favoritado = false; }
    else { user.temasFavoritos.push(req.params.id); favoritado = true; }
    await user.save();
    res.json({ favoritado });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// ===================== ADMIN =====================
router.post("/", exigirAuth, exigirAdmin, async (req, res) => {
  try {
    const tema = await Tema.create({ ...req.body, criadoPor: req.userId });
    res.json(tema);
  } catch (err) {
    res.status(400).json({ msg: err.message });
  }
});

router.put("/:id", exigirAuth, exigirAdmin, async (req, res) => {
  try {
    const tema = await Tema.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!tema) return res.status(404).json({ msg: "Tema não encontrado." });
    res.json(tema);
  } catch (err) {
    res.status(400).json({ msg: err.message });
  }
});

router.delete("/:id", exigirAuth, exigirAdmin, async (req, res) => {
  try {
    await Tema.findByIdAndUpdate(req.params.id, { ativo: false });
    res.json({ msg: "Tema desativado." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

module.exports = router;
