const express = require("express");
const router = express.Router();
const fs = require("fs");
const jwt = require("jsonwebtoken");
const Modulo = require("../models/modulo");
const Aula = require("../models/aula");
const ProgressoAula = require("../models/progressoAula");
const User = require("../models/user");
const { exigirAuth, exigirAdmin } = require("../middleware/auth");
const { uploadVideo, uploadThumbnail, uploadMaterial, comTratamentoDeErro } = require("../middleware/uploadAulas");

router.use(exigirAuth, exigirAdmin);

// ===================== MÓDULOS =====================
router.get("/modulos", async (req, res) => {
  try {
    const modulos = await Modulo.find({}).sort({ ordem: 1 });
    const contagens = await Aula.aggregate([{ $group: { _id: "$moduloId", total: { $sum: 1 } } }]);
    const mapa = Object.fromEntries(contagens.map(c => [String(c._id), c.total]));
    res.json(modulos.map(m => ({ ...m.toObject(), totalAulas: mapa[String(m._id)] || 0 })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.post("/modulos", async (req, res) => {
  try {
    const total = await Modulo.countDocuments({});
    const modulo = await Modulo.create({ ...req.body, ordem: total, criadoPor: req.userId });
    res.json(modulo);
  } catch (err) {
    res.status(400).json({ msg: err.message });
  }
});

// Precisa vir antes de "/modulos/:id" — senão o Express casa "reordenar" como :id.
router.put("/modulos/reordenar", async (req, res) => {
  try {
    const { ordens } = req.body;
    if (!Array.isArray(ordens) || !ordens.length) return res.status(400).json({ msg: "Lista de ordens inválida." });
    await Modulo.bulkWrite(ordens.map(o => ({
      updateOne: { filter: { _id: o.id }, update: { $set: { ordem: o.ordem } } }
    })));
    res.json({ msg: "Ordem atualizada." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.put("/modulos/:id", async (req, res) => {
  try {
    const modulo = await Modulo.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!modulo) return res.status(404).json({ msg: "Módulo não encontrado." });
    res.json(modulo);
  } catch (err) {
    res.status(400).json({ msg: err.message });
  }
});

router.delete("/modulos/:id", async (req, res) => {
  try {
    await Modulo.findByIdAndUpdate(req.params.id, { ativo: false });
    res.json({ msg: "Módulo desativado." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// ===================== AULAS =====================
router.get("/aulas", async (req, res) => {
  try {
    const filtro = {};
    if (req.query.moduloId) filtro.moduloId = req.query.moduloId;
    const aulas = await Aula.find(filtro).sort({ ordem: 1 });
    res.json(aulas);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.get("/aulas/:id", async (req, res) => {
  try {
    const aula = await Aula.findById(req.params.id);
    if (!aula) return res.status(404).json({ msg: "Aula não encontrada." });
    res.json(aula);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.post("/aulas", async (req, res) => {
  try {
    const total = await Aula.countDocuments({ moduloId: req.body.moduloId });
    const aula = await Aula.create({ ...req.body, ordem: total });
    res.json(aula);
  } catch (err) {
    res.status(400).json({ msg: err.message });
  }
});

// Precisa vir antes de "/aulas/:id" — senão o Express casa "reordenar" como :id.
router.put("/aulas/reordenar", async (req, res) => {
  try {
    const { ordens } = req.body;
    if (!Array.isArray(ordens) || !ordens.length) return res.status(400).json({ msg: "Lista de ordens inválida." });
    await Aula.bulkWrite(ordens.map(o => ({
      updateOne: {
        filter: { _id: o.id },
        update: { $set: { ordem: o.ordem, ...(o.moduloId ? { moduloId: o.moduloId } : {}) } }
      }
    })));
    res.json({ msg: "Ordem atualizada." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.put("/aulas/:id", async (req, res) => {
  try {
    // Materiais são geridos por rotas próprias (upload). Vídeo tipo "upload" também
    // (precisa do arquivo) — mas vídeo tipo "url" é só texto, dá pra editar aqui direto.
    const { video, materiais, ...resto } = req.body;
    const update = { ...resto };

    if (video && video.tipo === "url") {
      const aulaAtual = await Aula.findById(req.params.id);
      if (!aulaAtual) return res.status(404).json({ msg: "Aula não encontrada." });
      if (aulaAtual.video && aulaAtual.video.tipo === "upload" && aulaAtual.video.arquivo && aulaAtual.video.arquivo.caminho) {
        fs.unlink(aulaAtual.video.arquivo.caminho, () => {});
      }
      update.video = { tipo: "url", url: video.url, duracaoSegundos: video.duracaoSegundos };
    }

    const aula = await Aula.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!aula) return res.status(404).json({ msg: "Aula não encontrada." });
    res.json(aula);
  } catch (err) {
    res.status(400).json({ msg: err.message });
  }
});

router.delete("/aulas/:id", async (req, res) => {
  try {
    await Aula.findByIdAndUpdate(req.params.id, { ativo: false });
    res.json({ msg: "Aula desativada." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// ===================== VÍDEO =====================
router.post("/aulas/:id/video", comTratamentoDeErro(uploadVideo.single("video")), async (req, res) => {
  try {
    const aula = await Aula.findById(req.params.id);
    if (!aula) return res.status(404).json({ msg: "Aula não encontrada." });
    if (!req.file) return res.status(400).json({ msg: "Nenhum arquivo enviado." });

    // Substituição: apaga o arquivo antigo antes de gravar a referência do novo.
    if (aula.video && aula.video.tipo === "upload" && aula.video.arquivo && aula.video.arquivo.caminho) {
      fs.unlink(aula.video.arquivo.caminho, () => {});
    }

    aula.video = {
      tipo: "upload",
      arquivo: { caminho: req.file.path, tamanho: req.file.size, mimetype: req.file.mimetype },
      duracaoSegundos: req.body.duracaoSegundos ? Number(req.body.duracaoSegundos) : undefined
    };
    await aula.save();
    res.json(aula);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.delete("/aulas/:id/video", async (req, res) => {
  try {
    const aula = await Aula.findById(req.params.id);
    if (!aula) return res.status(404).json({ msg: "Aula não encontrada." });
    if (aula.video && aula.video.tipo === "upload" && aula.video.arquivo && aula.video.arquivo.caminho) {
      fs.unlink(aula.video.arquivo.caminho, () => {});
    }
    aula.video = undefined;
    await aula.save();
    res.json(aula);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// ===================== THUMBNAIL =====================
// GET autenticado (só admin) pra pré-visualização no painel — img src não manda
// Authorization, então o front busca via fetch()+blob() com esse endpoint.
router.get("/aulas/:id/thumbnail", async (req, res) => {
  try {
    const aula = await Aula.findById(req.params.id);
    if (!aula || !aula.thumbnail || !aula.thumbnail.arquivo || !aula.thumbnail.arquivo.caminho) {
      return res.status(404).json({ msg: "Thumbnail não encontrada." });
    }
    res.setHeader("Content-Type", aula.thumbnail.arquivo.mimetype || "image/jpeg");
    fs.createReadStream(aula.thumbnail.arquivo.caminho).pipe(res);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// Ticket de vídeo pro admin usar no <video> de captura de frame — mesmo mecanismo
// (e mesma rota de streaming, GET /api/aulas/aulas/:id/video) do player do aluno;
// a verificação do ticket lá não checa plano, só validade/aulaId, então reaproveita.
router.post("/aulas/:id/video-ticket", async (req, res) => {
  try {
    const aula = await Aula.findById(req.params.id);
    if (!aula || !aula.video || aula.video.tipo !== "upload" || !aula.video.arquivo || !aula.video.arquivo.caminho) {
      return res.status(404).json({ msg: "Vídeo não encontrado." });
    }
    const ticket = jwt.sign(
      { aulaId: String(aula._id), userId: req.userId, type: "video-ticket" },
      process.env.JWT_SECRET,
      { expiresIn: "5m" }
    );
    res.json({ ticket });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.post("/aulas/:id/thumbnail", comTratamentoDeErro(uploadThumbnail.single("thumbnail")), async (req, res) => {
  try {
    const aula = await Aula.findById(req.params.id);
    if (!aula) return res.status(404).json({ msg: "Aula não encontrada." });
    if (!req.file) return res.status(400).json({ msg: "Nenhuma imagem enviada." });

    // Substituição: apaga o arquivo antigo antes de gravar a referência do novo.
    if (aula.thumbnail && aula.thumbnail.arquivo && aula.thumbnail.arquivo.caminho) {
      fs.unlink(aula.thumbnail.arquivo.caminho, () => {});
    }

    aula.thumbnail = {
      tipo: req.body.tipo === "gerado" ? "gerado" : "upload",
      arquivo: { caminho: req.file.path, tamanho: req.file.size, mimetype: req.file.mimetype },
      timestampSegundos: req.body.timestampSegundos ? Number(req.body.timestampSegundos) : undefined
    };
    await aula.save();
    res.json(aula);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.delete("/aulas/:id/thumbnail", async (req, res) => {
  try {
    const aula = await Aula.findById(req.params.id);
    if (!aula) return res.status(404).json({ msg: "Aula não encontrada." });
    if (aula.thumbnail && aula.thumbnail.arquivo && aula.thumbnail.arquivo.caminho) {
      fs.unlink(aula.thumbnail.arquivo.caminho, () => {});
    }
    aula.thumbnail = undefined;
    await aula.save();
    res.json(aula);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// ===================== MATERIAIS =====================
router.post("/aulas/:id/materiais", comTratamentoDeErro(uploadMaterial.single("arquivo")), async (req, res) => {
  try {
    const aula = await Aula.findById(req.params.id);
    if (!aula) return res.status(404).json({ msg: "Aula não encontrada." });

    const { nome, tipo, url } = req.body;
    if (!nome || !tipo) return res.status(400).json({ msg: "Informe nome e tipo do material." });

    const material = { nome, tipo };
    if (tipo === "link") {
      if (!url) return res.status(400).json({ msg: "Informe a URL do link." });
      material.url = url;
    } else {
      if (!req.file) return res.status(400).json({ msg: "Envie um arquivo para este tipo de material." });
      material.arquivo = { caminho: req.file.path, tamanho: req.file.size, mimetype: req.file.mimetype };
    }

    aula.materiais.push(material);
    await aula.save();
    res.json(aula);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.delete("/aulas/:id/materiais/:materialId", async (req, res) => {
  try {
    const aula = await Aula.findById(req.params.id);
    if (!aula) return res.status(404).json({ msg: "Aula não encontrada." });
    const material = aula.materiais.id(req.params.materialId);
    if (!material) return res.status(404).json({ msg: "Material não encontrado." });
    if (material.arquivo && material.arquivo.caminho) fs.unlink(material.arquivo.caminho, () => {});
    aula.materiais.pull(req.params.materialId);
    await aula.save();
    res.json(aula);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// ===================== ESTATÍSTICAS =====================
router.get("/estatisticas", async (req, res) => {
  try {
    const usuariosElegiveis = await User.find({ "plano.ativo": true, "plano.tier": { $in: ["Avancé", "Excellence"] } }).select("_id");
    const uids = usuariosElegiveis.map(u => u._id);

    const alunosComProgresso = (await ProgressoAula.distinct("userId")).length;
    const totalAulasAtivas = await Aula.countDocuments({ ativo: true });

    // vídeos mais assistidos
    const contagemPorAula = await ProgressoAula.aggregate([
      { $group: { _id: "$aulaId", total: { $sum: 1 } } },
      { $sort: { total: -1 } },
      { $limit: 10 }
    ]);
    const aulasDetalhe = await Aula.find({ _id: { $in: contagemPorAula.map(c => c._id) } }).select("titulo moduloId");
    const aulaMap = Object.fromEntries(aulasDetalhe.map(a => [String(a._id), a]));
    const videosMaisAssistidos = contagemPorAula
      .filter(c => aulaMap[String(c._id)])
      .map(c => ({ aulaId: c._id, titulo: aulaMap[String(c._id)].titulo, visualizacoes: c.total }));

    // aulas nunca assistidas
    const aulaIdsComProgresso = await ProgressoAula.distinct("aulaId");
    const aulasNuncaAssistidas = await Aula.countDocuments({ ativo: true, _id: { $nin: aulaIdsComProgresso } });

    // módulos mais concluídos
    const modulos = await Modulo.find({ ativo: true }).sort({ ordem: 1 });
    const moduloIds = modulos.map(m => m._id);
    const totalPorModulo = await Aula.aggregate([
      { $match: { moduloId: { $in: moduloIds }, ativo: true } },
      { $group: { _id: "$moduloId", total: { $sum: 1 } } }
    ]);
    const totalModuloMap = Object.fromEntries(totalPorModulo.map(t => [String(t._id), t.total]));
    const concluidasPorModuloUser = await ProgressoAula.aggregate([
      { $match: { moduloId: { $in: moduloIds }, concluida: true } },
      { $group: { _id: { moduloId: "$moduloId", userId: "$userId" }, total: { $sum: 1 } } }
    ]);
    const modulosMaisConcluidos = modulos
      .map(m => {
        const total = totalModuloMap[String(m._id)] || 0;
        const alunosCompletos = total
          ? concluidasPorModuloUser.filter(c => String(c._id.moduloId) === String(m._id) && c.total === total).length
          : 0;
        return { moduloId: m._id, titulo: m.titulo, icone: m.icone, alunosCompletos };
      })
      .sort((a, b) => b.alunosCompletos - a.alunosCompletos);

    // % médio de progresso (entre alunos elegíveis)
    const concluidasPorUsuario = await ProgressoAula.aggregate([
      { $match: { userId: { $in: uids }, concluida: true } },
      { $group: { _id: "$userId", total: { $sum: 1 } } }
    ]);
    const somaPercentuais = concluidasPorUsuario.reduce(
      (acc, c) => acc + (totalAulasAtivas > 0 ? c.total / totalAulasAtivas : 0), 0
    );
    const percentualMedio = uids.length > 0 ? Math.round((somaPercentuais / uids.length) * 100) : 0;

    // tempo médio de estudo (aulas concluídas com duração cadastrada)
    const aulasComDuracao = await Aula.find({ ativo: true, "video.duracaoSegundos": { $gt: 0 } }).select("video.duracaoSegundos");
    const duracaoMap = Object.fromEntries(aulasComDuracao.map(a => [String(a._id), a.video.duracaoSegundos]));
    const progressoConcluido = await ProgressoAula.find({ concluida: true, userId: { $in: uids } }).select("userId aulaId");
    const tempoPorUsuario = {};
    progressoConcluido.forEach(p => {
      const dur = duracaoMap[String(p.aulaId)];
      if (dur) tempoPorUsuario[String(p.userId)] = (tempoPorUsuario[String(p.userId)] || 0) + dur;
    });
    const valoresTempo = Object.values(tempoPorUsuario);
    const tempoMedioSegundos = valoresTempo.length ? Math.round(valoresTempo.reduce((a, b) => a + b, 0) / valoresTempo.length) : 0;

    res.json({
      alunosElegiveis: uids.length,
      alunosComProgresso,
      totalAulasAtivas,
      videosMaisAssistidos,
      aulasNuncaAssistidas,
      modulosMaisConcluidos,
      percentualMedio,
      tempoMedioSegundos
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

module.exports = router;
