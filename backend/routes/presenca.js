// Sinal de presença das páginas do site (public/js/presencaSite.js). Só alunos são registrados.
const express = require("express");
const router = express.Router();
const { exigirAuth } = require("../middleware/auth");
const { registrar } = require("../utils/presencaSite");

router.post("/", exigirAuth, (req, res) => {
  if (req.userRole === "aluno") registrar(req.userId, req.body || {});
  res.status(204).end();
});

module.exports = router;
