const express = require("express");
const router = express.Router();
const { textoSeguro } = require("../middleware/seguranca");
const Depoimento = require("../models/depoimento");
const User = require("../models/user");
const { exigirAuth, exigirAdmin } = require("../middleware/auth");

const TEXTO_CONSENTIMENTO_ATUAL =
  "Autorizo a utilização do meu nome, imagem e depoimento pela plataforma para fins institucionais e promocionais.";

// ENVIAR DEPOIMENTO — entra sempre como "pendente"; só some para moderação,
// nunca aparece automaticamente no site.
router.post("/", exigirAuth, async (req, res) => {
  try {
    const { foto, aceiteImagem } = req.body;
    const titulo = textoSeguro(req.body.titulo, 150);
    const texto = textoSeguro(req.body.texto, 3000);
    const cursoOuPlano = textoSeguro(req.body.cursoOuPlano, 100);
    const tempoUso = textoSeguro(req.body.tempoUso, 60);
    const nota = Number(req.body.nota);

    if (!titulo || !texto || !nota) {
      return res.status(400).json({ msg: "Preencha título, depoimento e avaliação." });
    }
    if (!Number.isInteger(nota) || nota < 1 || nota > 5) {
      return res.status(400).json({ msg: "A avaliação deve ser de 1 a 5 estrelas." });
    }
    if (!aceiteImagem) {
      return res.status(400).json({ msg: "É necessário aceitar o termo de autorização de uso de imagem para enviar." });
    }
    // A foto aparece no site público: só data URI de imagem (nunca URL externa/javascript:).
    if (foto && (typeof foto !== "string" || !/^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(foto))) {
      return res.status(400).json({ msg: "Formato de imagem inválido. Envie PNG, JPEG, WebP ou GIF." });
    }
    if (foto && foto.length > 1_500_000) {
      return res.status(400).json({ msg: "A imagem é muito grande. Escolha uma foto menor." });
    }

    const depoimento = new Depoimento({
      alunoId: req.userId,
      titulo, texto, nota, cursoOuPlano, tempoUso, foto,
      consentimento: { aceito: true, textoVersao: TEXTO_CONSENTIMENTO_ATUAL }
    });
    await depoimento.save();

    res.json({ msg: "Depoimento enviado! Ele passará por uma análise antes de aparecer no site.", depoimento });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor. Tente novamente." });
  }
});

// MEUS DEPOIMENTOS — histórico do próprio aluno, com status de moderação
router.get("/meus", exigirAuth, async (req, res) => {
  try {
    const depoimentos = await Depoimento.find({ alunoId: req.userId }).sort({ criadoEm: -1 });
    res.json(depoimentos);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor. Tente novamente." });
  }
});

// APROVADOS — público, consumido pela seção de Depoimentos do index
router.get("/aprovados", async (req, res) => {
  try {
    const depoimentos = await Depoimento.find({ status: "aprovado" })
      .populate("alunoId", "nome perfil.foto")
      .sort({ destaque: -1, moderadoEm: -1 })
      .limit(24)
      .select("titulo texto nota cursoOuPlano foto destaque criadoEm consentimento.aceito alunoId");

    const publicos = depoimentos.map(d => ({
      id: d._id,
      titulo: d.titulo,
      texto: d.texto,
      nota: d.nota,
      cursoOuPlano: d.cursoOuPlano,
      destaque: d.destaque,
      criadoEm: d.criadoEm,
      nome: d.alunoId?.nome || "Aluno(a)",
      // Só expõe foto (própria ou de perfil) quando o consentimento de imagem foi aceito.
      foto: d.consentimento?.aceito ? (d.foto || d.alunoId?.perfil?.foto || null) : null
    }));

    res.json(publicos);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor. Tente novamente." });
  }
});

// ---------- ADMINISTRAÇÃO ----------

// LISTAR TODOS (com filtro opcional por status) — inclui foto/nome/plano/texto/
// avaliação/data/consentimento para o painel de moderação.
router.get("/admin/todos", exigirAuth, exigirAdmin, async (req, res) => {
  try {
    const filtro = {};
    if (req.query.status && ["pendente", "aprovado", "rejeitado"].includes(req.query.status)) {
      filtro.status = req.query.status;
    }
    const depoimentos = await Depoimento.find(filtro)
      .populate("alunoId", "nome email plano perfil.foto")
      .sort({ criadoEm: -1 });
    res.json(depoimentos);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor. Tente novamente." });
  }
});

router.put("/admin/:id/aprovar", exigirAuth, exigirAdmin, async (req, res) => {
  try {
    const depoimento = await Depoimento.findByIdAndUpdate(
      req.params.id,
      { status: "aprovado", moderadoPor: req.userId, moderadoEm: new Date() },
      { new: true }
    );
    if (!depoimento) return res.status(404).json({ msg: "Depoimento não encontrado" });
    res.json({ msg: "Depoimento aprovado — já aparece na página inicial.", depoimento });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor. Tente novamente." });
  }
});

router.put("/admin/:id/rejeitar", exigirAuth, exigirAdmin, async (req, res) => {
  try {
    const depoimento = await Depoimento.findByIdAndUpdate(
      req.params.id,
      { status: "rejeitado", destaque: false, moderadoPor: req.userId, moderadoEm: new Date() },
      { new: true }
    );
    if (!depoimento) return res.status(404).json({ msg: "Depoimento não encontrado" });
    res.json({ msg: "Depoimento rejeitado.", depoimento });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor. Tente novamente." });
  }
});

router.put("/admin/:id/destacar", exigirAuth, exigirAdmin, async (req, res) => {
  try {
    const { destaque } = req.body;
    const depoimento = await Depoimento.findByIdAndUpdate(
      req.params.id,
      { destaque: !!destaque },
      { new: true }
    );
    if (!depoimento) return res.status(404).json({ msg: "Depoimento não encontrado" });
    res.json({ msg: destaque ? "Depoimento destacado." : "Depoimento removido do destaque.", depoimento });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor. Tente novamente." });
  }
});

module.exports = router;
