const express = require("express");
const router = express.Router();
const Cupom = require("../models/cupom");
const { exigirAuth, exigirAdmin } = require("../middleware/auth");

router.use(exigirAuth, exigirAdmin);

router.get("/", async (req, res) => {
  try {
    const cupons = await Cupom.find().sort({ criadoEm: -1 });
    res.json(cupons);
  } catch (err) {
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.post("/", async (req, res) => {
  try {
    const { codigo, tipo, valor, validoAte, usoMaximo } = req.body;
    if (!codigo || !tipo || !valor) return res.status(400).json({ msg: "Preencha código, tipo e valor." });
    const cupom = await Cupom.create({ codigo, tipo, valor, validoAte: validoAte || null, usoMaximo: usoMaximo || null });
    res.json(cupom);
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ msg: "Já existe um cupom com esse código." });
    res.status(400).json({ msg: err.message });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const { codigo, tipo, valor, validoAte, usoMaximo, ativo } = req.body;
    const cupom = await Cupom.findByIdAndUpdate(
      req.params.id,
      { codigo, tipo, valor, validoAte: validoAte || null, usoMaximo: usoMaximo ?? null, ativo },
      { new: true, runValidators: true }
    );
    if (!cupom) return res.status(404).json({ msg: "Cupom não encontrado." });
    res.json(cupom);
  } catch (err) {
    res.status(400).json({ msg: err.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    await Cupom.findByIdAndUpdate(req.params.id, { ativo: false });
    res.json({ msg: "Cupom desativado." });
  } catch (err) {
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

module.exports = router;
