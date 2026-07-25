const express = require("express");
const router = express.Router();
const FlashcardPalavra = require("../models/flashcardPalavra");
const FlashcardProgresso = require("../models/flashcardProgresso");
const FlashcardRevisao = require("../models/flashcardRevisao");
const User = require("../models/user");
const { exigirAuth } = require("../middleware/auth");
const { cursosComAcesso } = require("../middleware/acessoCurso");

// Tamanho fixo do "leque" da Revisão semanal e intervalo mínimo entre
// revisões concluídas — mesmos valores usados no protótipo original.
const TAMANHO_REVISAO = 15;
const DIAS_ENTRE_REVISOES = 7;

router.use(exigirAuth);

// Mesmo gate de acesso da Plataforma de Questões (plataformaGate.js no
// front-end), mas independente de courseType — Flashcards não é filtrado
// por curso, é um vocabulário único disponível a quem tem Excellence em
// qualquer curso (ou Pack Prestige).
router.use(async (req, res, next) => {
  try {
    const cursos = await cursosComAcesso(req.userId, "plataforma");
    if (!cursos.length) return res.status(403).json({ msg: "Acesso restrito ao plano Excellence." });
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

function indiceErro(p) {
  const tentativas = p.acertos + p.erros;
  return tentativas ? p.erros / tentativas : 0;
}

// ===================== NOVA RODADA =====================

// Temas disponíveis + quantas palavras "novas" (ainda não estudadas por
// este aluno) cada um tem — igual ao chip "N nova(s)" do protótipo.
router.get("/temas", async (req, res) => {
  try {
    const palavras = await FlashcardPalavra.find().select("categoria").lean();
    const progressos = await FlashcardProgresso.find({ alunoId: req.userId }).select("palavraId").lean();
    const estudadas = new Set(progressos.map(p => String(p.palavraId)));

    const porTema = new Map();
    for (const p of palavras) {
      const atual = porTema.get(p.categoria) || { tema: p.categoria, total: 0, novas: 0 };
      atual.total++;
      if (!estudadas.has(String(p._id))) atual.novas++;
      porTema.set(p.categoria, atual);
    }

    res.json({
      temas: [...porTema.values()].sort((a, b) => a.tema.localeCompare(b.tema, "fr")),
      tamanhos: [10, 20, 30, 50, 80, 100],
      tamanhoPadrao: 20
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// Monta uma rodada com palavras NUNCA estudadas por este aluno, dentro dos
// temas escolhidos. Responder uma palavra aqui (POST /responder) é o que a
// marca como "estudada" — ela não volta a aparecer numa rodada futura, só
// na Revisão semanal.
router.post("/rodada", async (req, res) => {
  try {
    const temas = Array.isArray(req.body.temas) ? req.body.temas : [];
    if (!temas.length) return res.status(400).json({ msg: "Selecione ao menos um tema." });
    const quantidade = Math.min(Math.max(Number(req.body.quantidade) || 20, 1), 100);

    const progressos = await FlashcardProgresso.find({ alunoId: req.userId }).select("palavraId").lean();
    const estudadasIds = progressos.map(p => p.palavraId);

    const palavras = await FlashcardPalavra.aggregate([
      { $match: { categoria: { $in: temas }, _id: { $nin: estudadasIds } } },
      { $sample: { size: quantidade } }
    ]);

    res.json(palavras);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// Registra a resposta de uma palavra nova (cria o FlashcardProgresso na
// primeira vez — upsert). Não mexe em `dominada`: isso só acontece na
// Revisão semanal.
router.post("/responder", async (req, res) => {
  try {
    const { palavraId, correto } = req.body;
    if (!palavraId || typeof correto !== "boolean") return res.status(400).json({ msg: "Dados inválidos." });

    await FlashcardProgresso.updateOne(
      { alunoId: req.userId, palavraId },
      { $inc: correto ? { acertos: 1 } : { erros: 1 }, $set: { ultimaRespostaEm: new Date() } },
      { upsert: true }
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// ===================== REVISÃO SEMANAL =====================

router.get("/revisao/status", async (req, res) => {
  try {
    const palavrasElegiveis = await FlashcardProgresso.countDocuments({ alunoId: req.userId });
    if (palavrasElegiveis < TAMANHO_REVISAO) {
      return res.json({ disponivel: false, palavrasElegiveis, minimoNecessario: TAMANHO_REVISAO });
    }

    const revisao = await FlashcardRevisao.findOne({ alunoId: req.userId }).lean();
    if (revisao?.ultimaConclusaoEm) {
      const diasDesde = (Date.now() - new Date(revisao.ultimaConclusaoEm).getTime()) / 86400000;
      if (diasDesde < DIAS_ENTRE_REVISOES) {
        return res.json({
          disponivel: false,
          palavrasElegiveis,
          minimoNecessario: TAMANHO_REVISAO,
          diasRestantes: Math.max(1, Math.ceil(DIAS_ENTRE_REVISOES - diasDesde))
        });
      }
    }

    res.json({ disponivel: true, palavrasElegiveis, minimoNecessario: TAMANHO_REVISAO });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// Monta o "leque" de até 15 palavras: prioriza as ainda não dominadas (pior
// taxa de erro primeiro), completando com as já dominadas há mais tempo se
// sobrar espaço — assim a revisão sempre tem TAMANHO_REVISAO palavras
// mesmo que o aluno já tenha dominado quase tudo.
router.get("/revisao", async (req, res) => {
  try {
    const progressos = await FlashcardProgresso.find({ alunoId: req.userId }).populate("palavraId").lean();

    const naoDominadas = progressos.filter(p => !p.dominada)
      .sort((a, b) => indiceErro(b) - indiceErro(a) || new Date(a.ultimaRespostaEm) - new Date(b.ultimaRespostaEm));
    const dominadas = progressos.filter(p => p.dominada)
      .sort((a, b) => new Date(a.ultimaRespostaEm) - new Date(b.ultimaRespostaEm));

    const selecionadas = naoDominadas.concat(dominadas)
      .slice(0, TAMANHO_REVISAO)
      .filter(p => p.palavraId)
      .map(p => p.palavraId);

    res.json(selecionadas);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// Acertar na revisão é o que marca a palavra como `dominada`; errar não
// desfaz uma dominação anterior, só volta pro fim da fila no cliente.
router.post("/revisao/responder", async (req, res) => {
  try {
    const { palavraId, correto } = req.body;
    if (!palavraId || typeof correto !== "boolean") return res.status(400).json({ msg: "Dados inválidos." });

    const update = { $inc: correto ? { acertos: 1 } : { erros: 1 }, $set: { ultimaRespostaEm: new Date() } };
    if (correto) update.$set.dominada = true;

    await FlashcardProgresso.updateOne({ alunoId: req.userId, palavraId }, update, { upsert: true });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.post("/revisao/completar", async (req, res) => {
  try {
    await FlashcardRevisao.updateOne(
      { alunoId: req.userId },
      { $set: { ultimaConclusaoEm: new Date() } },
      { upsert: true }
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// ===================== MEU PROGRESSO =====================

router.get("/progresso", async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("nome").lean();
    const progressos = await FlashcardProgresso.find({ alunoId: req.userId }).populate("palavraId").lean();
    const totalPalavras = await FlashcardPalavra.countDocuments();

    const totalAcertos = progressos.reduce((soma, p) => soma + p.acertos, 0);
    const totalErros = progressos.reduce((soma, p) => soma + p.erros, 0);

    const piores = progressos
      .filter(p => p.erros > 0 && p.palavraId)
      .map(p => ({ word: p.palavraId, indiceErro: indiceErro(p) }))
      .sort((a, b) => b.indiceErro - a.indiceErro)
      .slice(0, 8);

    res.json({
      nome: user?.nome || "",
      estudadas: progressos.length,
      totalPalavras,
      dominadas: progressos.filter(p => p.dominada).length,
      taxaAcerto: (totalAcertos + totalErros) ? Math.round((totalAcertos / (totalAcertos + totalErros)) * 100) : 0,
      piores
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

module.exports = router;
