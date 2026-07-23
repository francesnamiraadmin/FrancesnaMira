const express = require("express");
const router = express.Router();
const Tema = require("../models/tema");
const User = require("../models/user");
const Rubrica = require("../models/rubrica");
const DeverSemanal = require("../models/deverSemanal");
const { exigirAuth, exigirAdmin } = require("../middleware/auth");
const { exigirAcessoCurso, usuarioTemAcesso } = require("../middleware/acessoCurso");

// Um tema atribuído como Dever de Casa (producao_textual/producao_oral) deve poder ser
// visto/enviado mesmo sem a entitlement de Produção Textual — mesma lógica de
// questoes.js#conjuntoAtribuidoComoDever e aulas.js#aulaAtribuidaComoDever.
async function temaAtribuidoComoDever(alunoId, temaId) {
  return !!(await DeverSemanal.exists({ alunoId, "atividades.conteudo.temaId": temaId }));
}

// RUBRICA DE UM CURSO (critérios oficiais) — usada pelo professor na correção. O
// parâmetro de rota continua se chamando :exame por compatibilidade (TCF/DELF/DALF/TEF
// são o mesmo valor em courseType e exame), mas a consulta é sempre por courseType.
router.get("/rubrica/:exame", exigirAuth, async (req, res) => {
  try {
    const modalidade = req.query.modalidade === "oral" ? "oral" : "textual";
    const rubrica = await Rubrica.findOne({ courseType: req.params.exame, modalidade });
    if (!rubrica) return res.status(404).json({ msg: "Rubrica não encontrada para este curso." });
    res.json(rubrica);
  } catch (err) {
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// LISTAR TEMAS (com filtros) — exige acesso ao módulo de Produção Textual do curso pedido
// quando quem pergunta é aluno. Admin/professor usam esta MESMA rota pra popular seletores
// de conteúdo (ex.: editor de Dever de Casa) e não têm `planos[]` próprio — precisam ver
// temas de qualquer curso, então pulam o gate (podem filtrar por courseType à vontade).
router.get("/", exigirAuth, (req, res, next) => {
  if (req.userRole === "admin" || req.userRole === "professor") return next();
  return exigirAcessoCurso("producao")(req, res, next);
}, async (req, res) => {
  try {
    const { exame, nivel, tipoProducao, dificuldade, modalidade, busca, todos, courseType } = req.query;
    const filtro = {};
    if (req.courseType) filtro.courseType = req.courseType;
    else if (courseType) filtro.courseType = courseType;
    if (!(todos === "1" && req.userRole === "admin")) filtro.ativo = true;
    if (exame) filtro.exame = exame;
    if (nivel) filtro.nivel = nivel;
    if (tipoProducao) filtro.tipoProducao = tipoProducao;
    if (dificuldade) filtro.dificuldade = dificuldade;
    if (modalidade) filtro.modalidade = modalidade;
    if (busca) filtro.titulo = { $regex: busca, $options: "i" };

    const temas = await Tema.find(filtro).select("-coletanea").sort({ criadoEm: -1 });
    res.json(temas);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// DETALHE DE UM TEMA (com coletânea completa) — courseType vem do próprio documento,
// nunca do cliente.
router.get("/:id", exigirAuth, async (req, res) => {
  try {
    const tema = await Tema.findById(req.params.id);
    if (!tema) return res.status(404).json({ msg: "Tema não encontrado." });
    const viaEntitlement = tema.courseType && (await usuarioTemAcesso(req.userId, "producao", tema.courseType));
    const viaDever = !viaEntitlement && (await temaAtribuidoComoDever(req.userId, tema._id));
    const ehStaff = req.userRole === "admin" || req.userRole === "professor";
    if (!viaEntitlement && !viaDever && !ehStaff) {
      return res.status(403).json({ msg: "Você não tem acesso a este tema." });
    }
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
