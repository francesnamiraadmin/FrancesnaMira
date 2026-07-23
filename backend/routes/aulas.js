const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const Modulo = require("../models/modulo");
const Aula = require("../models/aula");
const ProgressoAula = require("../models/progressoAula");
const Certificado = require("../models/certificado");
const User = require("../models/user");
const DeverSemanal = require("../models/deverSemanal");
const { exigirAuth } = require("../middleware/auth");
const { exigirAcessoCurso, usuarioTemAcesso } = require("../middleware/acessoCurso");
const { TIPOS_CURSO } = require("../utils/tiposCurso");
const { transmitir } = require("../utils/sse");

// Uma aula atribuída como Dever de Casa (backend/routes/deveres.js, atividade tipo
// "assistir_aula") deve poder ser assistida mesmo sem a entitlement de "Aulas
// Especializadas" — é atribuída pelo professor como parte do plano de estudos, não é
// uma escolha livre do catálogo avulso.
async function aulaAtribuidaComoDever(alunoId, aulaId) {
  return !!(await DeverSemanal.exists({ alunoId, "atividades.conteudo.aulaId": aulaId }));
}

// Mesma ideia para o dever tipo "assistir_modulo" (conjunto inteiro de aulas atribuído).
async function moduloAtribuidoComoDever(alunoId, moduloId) {
  return !!(await DeverSemanal.exists({ alunoId, "atividades.conteudo.moduloId": moduloId }));
}

// Carrega uma Aula por id e confere acesso pelo courseType do Modulo dela — nunca
// aceitar courseType vindo do cliente aqui, o registro já existe e já sabe a que curso
// pertence. Escreve a resposta de erro e retorna null quando bloqueado/não encontrado,
// pra rota chamadora só fazer `if (!ctx) return;`.
async function carregarAulaAutorizada(req, res, aulaId) {
  const aula = await Aula.findOne({ _id: aulaId, ativo: true });
  if (!aula) { res.status(404).json({ msg: "Aula não encontrada." }); return null; }
  const modulo = await Modulo.findById(aula.moduloId).select("courseType ativo");
  const viaEntitlement = modulo?.courseType && (await usuarioTemAcesso(req.userId, "aulas", modulo.courseType));
  const viaDever = !viaEntitlement && (
    (await aulaAtribuidaComoDever(req.userId, aula._id)) || (await moduloAtribuidoComoDever(req.userId, aula.moduloId))
  );
  if (!viaEntitlement && !viaDever) {
    res.status(403).json({ msg: "Você não tem acesso a esta aula." });
    return null;
  }
  return { aula, modulo };
}

// Mesma lógica de extração de ID usada em public/js/aulas-especializadas.js (normalizarUrlYoutube),
// aqui só para montar a URL pública da thumbnail oficial do YouTube (sem custo de processamento).
function extrairIdYoutube(url) {
  const padroes = [
    /youtube\.com\/watch\?(?:.*&)?v=([\w-]{6,})/i,
    /youtube\.com\/shorts\/([\w-]{6,})/i,
    /youtube\.com\/embed\/([\w-]{6,})/i,
    /youtu\.be\/([\w-]{6,})/i
  ];
  for (const re of padroes) {
    const match = (url || "").match(re);
    if (match) return match[1];
  }
  return null;
}

function serializarMaterial(m) {
  return {
    _id: m._id,
    nome: m.nome,
    tipo: m.tipo,
    url: m.tipo === "link" ? m.url : undefined,
    temArquivo: !!(m.arquivo && m.arquivo.caminho),
    tamanho: m.arquivo ? m.arquivo.tamanho : undefined
  };
}

function serializarAula(aula, progresso) {
  return {
    _id: aula._id,
    moduloId: aula.moduloId,
    titulo: aula.titulo,
    descricao: aula.descricao,
    observacoesProfessor: aula.observacoesProfessor,
    ordem: aula.ordem,
    video: aula.video ? {
      tipo: aula.video.tipo,
      url: aula.video.tipo === "url" ? aula.video.url : undefined,
      temArquivo: aula.video.tipo === "upload" && !!(aula.video.arquivo && aula.video.arquivo.caminho),
      duracaoSegundos: aula.video.duracaoSegundos
    } : null,
    materiais: (aula.materiais || []).map(serializarMaterial),
    concluida: !!(progresso && progresso.concluida),
    ultimaPosicaoSegundos: progresso ? progresso.ultimaPosicaoSegundos : 0
  };
}

// ===================== MÓDULOS =====================
router.get("/modulos", exigirAuth, exigirAcessoCurso("aulas"), async (req, res) => {
  try {
    const modulos = await Modulo.find({ ativo: true, courseType: req.courseType }).sort({ ordem: 1 });
    const moduloIds = modulos.map(m => m._id);
    const uid = new mongoose.Types.ObjectId(req.userId);

    const totalPorModulo = await Aula.aggregate([
      { $match: { moduloId: { $in: moduloIds }, ativo: true } },
      { $group: { _id: "$moduloId", total: { $sum: 1 } } }
    ]);
    const totalMap = Object.fromEntries(totalPorModulo.map(t => [String(t._id), t.total]));

    const concluidasPorModulo = await ProgressoAula.aggregate([
      { $match: { userId: uid, moduloId: { $in: moduloIds }, concluida: true } },
      { $group: { _id: "$moduloId", total: { $sum: 1 } } }
    ]);
    const concluidasMap = Object.fromEntries(concluidasPorModulo.map(t => [String(t._id), t.total]));

    let moduloAnteriorCompleto = true;
    const resultado = modulos.map(m => {
      const total = totalMap[String(m._id)] || 0;
      const concluidas = concluidasMap[String(m._id)] || 0;
      const percentual = total > 0 ? Math.round((concluidas / total) * 100) : 0;
      const bloqueado = !!(m.exigeModuloAnterior && !moduloAnteriorCompleto);
      moduloAnteriorCompleto = total > 0 && concluidas === total;
      return {
        _id: m._id, titulo: m.titulo, descricao: m.descricao, icone: m.icone, cor: m.cor,
        ordem: m.ordem, publicadoEm: m.publicadoEm, totalAulas: total, aulasConcluidas: concluidas,
        percentual, bloqueado
      };
    });

    res.json(resultado);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.get("/modulos/:id/aulas", exigirAuth, async (req, res) => {
  try {
    const modulo = await Modulo.findOne({ _id: req.params.id, ativo: true });
    if (!modulo) return res.status(404).json({ msg: "Módulo não encontrado." });
    const viaEntitlement = modulo.courseType && (await usuarioTemAcesso(req.userId, "aulas", modulo.courseType));
    const viaDever = !viaEntitlement && (await moduloAtribuidoComoDever(req.userId, modulo._id));
    if (!viaEntitlement && !viaDever) {
      return res.status(403).json({ msg: "Você não tem acesso a este módulo." });
    }

    const aulas = await Aula.find({ moduloId: req.params.id, ativo: true }).sort({ ordem: 1 });
    const progresso = await ProgressoAula.find({ userId: req.userId, moduloId: req.params.id });
    const progressoMap = Object.fromEntries(progresso.map(p => [String(p.aulaId), p]));

    res.json(aulas.map(a => {
      const prog = progressoMap[String(a._id)];
      const concluida = !!(prog && prog.concluida);
      const emAndamento = !concluida && !!(prog && prog.ultimaPosicaoSegundos > 0);

      let thumbnailTipo = "nenhum";
      let thumbnailValor = null;
      if (a.thumbnail && a.thumbnail.arquivo && a.thumbnail.arquivo.caminho) {
        thumbnailTipo = "interno";
      } else if (a.video && a.video.tipo === "url" && a.video.url) {
        const idYoutube = extrairIdYoutube(a.video.url);
        if (idYoutube) {
          thumbnailTipo = "youtube";
          thumbnailValor = `https://img.youtube.com/vi/${idYoutube}/hqdefault.jpg`;
        }
      }

      return {
        _id: a._id, titulo: a.titulo, descricao: a.descricao, ordem: a.ordem,
        criadoEm: a.criadoEm,
        duracaoSegundos: a.video ? a.video.duracaoSegundos : undefined,
        temVideo: !!(a.video && (a.video.url || (a.video.arquivo && a.video.arquivo.caminho))),
        concluida, emAndamento,
        ultimaPosicaoSegundos: prog ? prog.ultimaPosicaoSegundos : 0,
        thumbnailTipo, thumbnailValor
      };
    }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// ===================== AULA (detalhe) =====================
router.get("/aulas/:id", exigirAuth, async (req, res) => {
  try {
    const ctx = await carregarAulaAutorizada(req, res, req.params.id);
    if (!ctx) return;

    const progresso = await ProgressoAula.findOneAndUpdate(
      { userId: req.userId, aulaId: ctx.aula._id },
      { $set: { ultimoAcessoEm: new Date(), moduloId: ctx.aula.moduloId } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json(serializarAula(ctx.aula, progresso));
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.post("/aulas/:id/progresso", exigirAuth, async (req, res) => {
  try {
    const ctx = await carregarAulaAutorizada(req, res, req.params.id);
    if (!ctx) return;

    const { concluida, posicaoSegundos } = req.body;
    const set = { ultimoAcessoEm: new Date(), moduloId: ctx.aula.moduloId };
    if (typeof posicaoSegundos === "number") set.ultimaPosicaoSegundos = posicaoSegundos;
    if (typeof concluida === "boolean") {
      set.concluida = concluida;
      set.concluidaEm = concluida ? new Date() : null;
    }

    const progresso = await ProgressoAula.findOneAndUpdate(
      { userId: req.userId, aulaId: ctx.aula._id },
      { $set: set },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Só avisa em tempo real quando algo muda de fato (conclusão), não a cada
    // ping de posição do vídeo (evita barulho no canal SSE global).
    if (typeof concluida === "boolean") transmitir("aula-progresso-atualizado", { userId: req.userId, aulaId: ctx.aula._id });

    res.json({ concluida: progresso.concluida, ultimaPosicaoSegundos: progresso.ultimaPosicaoSegundos });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// ===================== VÍDEO (upload local, streaming por range-request) =====================
// A tag <video> nativa não manda header Authorization nas requisições de
// range, então o acesso ao streaming é protegido por um ticket JWT de vida
// curta em vez do login normal (que fica só na primeira chamada, autenticada).
router.post("/aulas/:id/video-ticket", exigirAuth, async (req, res) => {
  try {
    const ctx = await carregarAulaAutorizada(req, res, req.params.id);
    if (!ctx) return;
    const { aula } = ctx;
    if (!aula.video || aula.video.tipo !== "upload" || !aula.video.arquivo || !aula.video.arquivo.caminho) {
      return res.status(404).json({ msg: "Vídeo não encontrado." });
    }

    const ticket = jwt.sign(
      { aulaId: String(aula._id), userId: req.userId, type: "video-ticket" },
      process.env.JWT_SECRET,
      { expiresIn: "2m" }
    );
    res.json({ ticket });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.get("/aulas/:id/video", async (req, res) => {
  try {
    const { ticket } = req.query;
    if (!ticket) return res.status(401).json({ msg: "Ticket ausente." });

    let payload;
    try {
      payload = jwt.verify(ticket, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ msg: "Ticket inválido ou expirado." });
    }
    if (payload.type !== "video-ticket" || payload.aulaId !== req.params.id) {
      return res.status(401).json({ msg: "Ticket inválido." });
    }

    const aula = await Aula.findOne({ _id: req.params.id, ativo: true });
    if (!aula || !aula.video || aula.video.tipo !== "upload" || !aula.video.arquivo || !aula.video.arquivo.caminho) {
      return res.status(404).json({ msg: "Vídeo não encontrado." });
    }

    const filePath = aula.video.arquivo.caminho;
    let stat;
    try {
      stat = fs.statSync(filePath);
    } catch (err) {
      return res.status(404).json({ msg: "Arquivo de vídeo não encontrado." });
    }

    const mimetype = aula.video.arquivo.mimetype || "video/mp4";
    const range = req.headers.range;

    if (!range) {
      res.writeHead(200, { "Content-Length": stat.size, "Content-Type": mimetype, "Accept-Ranges": "bytes" });
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    const partes = range.replace(/bytes=/, "").split("-");
    const start = parseInt(partes[0], 10);
    const end = partes[1] ? parseInt(partes[1], 10) : stat.size - 1;
    if (Number.isNaN(start) || Number.isNaN(end) || start > end || end >= stat.size) {
      res.writeHead(416, { "Content-Range": `bytes */${stat.size}` });
      return res.end();
    }

    const chunkSize = end - start + 1;
    res.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${stat.size}`,
      "Accept-Ranges": "bytes",
      "Content-Length": chunkSize,
      "Content-Type": mimetype
    });
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// ===================== THUMBNAIL (imagem autenticada, mesmo gate de acesso do resto do conteúdo) =====================
router.get("/aulas/:id/thumbnail", exigirAuth, async (req, res) => {
  try {
    const ctx = await carregarAulaAutorizada(req, res, req.params.id);
    if (!ctx) return;
    const { aula } = ctx;
    if (!aula.thumbnail || !aula.thumbnail.arquivo || !aula.thumbnail.arquivo.caminho) {
      return res.status(404).json({ msg: "Thumbnail não encontrada." });
    }
    res.setHeader("Content-Type", aula.thumbnail.arquivo.mimetype || "image/jpeg");
    fs.createReadStream(aula.thumbnail.arquivo.caminho).pipe(res);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// ===================== PROGRESSO GERAL / HISTÓRICO (por curso) =====================
router.get("/progresso/resumo", exigirAuth, exigirAcessoCurso("aulas"), async (req, res) => {
  try {
    const moduloIds = await Modulo.find({ courseType: req.courseType }).distinct("_id");
    const totalAulas = await Aula.countDocuments({ ativo: true, moduloId: { $in: moduloIds } });
    const concluidas = await ProgressoAula.countDocuments({ userId: req.userId, concluida: true, moduloId: { $in: moduloIds } });
    const percentual = totalAulas > 0 ? Math.round((concluidas / totalAulas) * 100) : 0;

    const ultima = await ProgressoAula.findOne({ userId: req.userId, moduloId: { $in: moduloIds } }).sort({ ultimoAcessoEm: -1 });
    let ultimaAula = null;
    if (ultima) {
      const aula = await Aula.findOne({ _id: ultima.aulaId, ativo: true }).select("titulo moduloId");
      if (aula) {
        ultimaAula = {
          aulaId: aula._id, moduloId: aula.moduloId, titulo: aula.titulo,
          ultimaPosicaoSegundos: ultima.ultimaPosicaoSegundos, concluida: ultima.concluida
        };
      }
    }

    res.json({ totalAulas, concluidas, percentual, ultimaAula });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.get("/progresso/historico", exigirAuth, exigirAcessoCurso("aulas"), async (req, res) => {
  try {
    const moduloIds = await Modulo.find({ courseType: req.courseType }).distinct("_id");
    const historico = await ProgressoAula.find({ userId: req.userId, moduloId: { $in: moduloIds } })
      .sort({ ultimoAcessoEm: -1 })
      .limit(50)
      .populate("aulaId", "titulo ativo")
      .populate("moduloId", "titulo icone cor");

    res.json(
      historico
        .filter(h => h.aulaId && h.aulaId.ativo)
        .map(h => ({
          aulaId: h.aulaId._id,
          aulaTitulo: h.aulaId.titulo,
          moduloId: h.moduloId ? h.moduloId._id : null,
          moduloTitulo: h.moduloId ? h.moduloId.titulo : null,
          moduloIcone: h.moduloId ? h.moduloId.icone : null,
          concluida: h.concluida,
          ultimoAcessoEm: h.ultimoAcessoEm
        }))
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// ===================== FAVORITOS =====================
router.post("/aulas/:id/favoritar", exigirAuth, async (req, res) => {
  try {
    const ctx = await carregarAulaAutorizada(req, res, req.params.id);
    if (!ctx) return;

    const user = await User.findById(req.userId);
    const idx = user.aulasFavoritas.findIndex(a => a.toString() === req.params.id);
    let favoritado;
    if (idx >= 0) { user.aulasFavoritas.splice(idx, 1); favoritado = false; }
    else { user.aulasFavoritas.push(req.params.id); favoritado = true; }
    await user.save();
    res.json({ favoritado });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.get("/favoritos", exigirAuth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).populate({
      path: "aulasFavoritas",
      match: { ativo: true },
      populate: { path: "moduloId", select: "titulo icone cor courseType" }
    });
    const favoritas = user.aulasFavoritas || [];

    // Um favorito de um curso que o aluno não tem mais acesso (assinatura vencida,
    // ou nunca teve) não deve aparecer — mesma regra de acesso do resto do módulo.
    const cursosDistintos = [...new Set(favoritas.map(a => a.moduloId?.courseType).filter(Boolean))];
    const acessoPorCurso = new Map();
    for (const curso of cursosDistintos) acessoPorCurso.set(curso, await usuarioTemAcesso(req.userId, "aulas", curso));

    res.json(
      favoritas
        .filter(a => a.moduloId && acessoPorCurso.get(a.moduloId.courseType))
        .map(a => ({
          _id: a._id, titulo: a.titulo,
          moduloId: a.moduloId._id, moduloTitulo: a.moduloId.titulo, moduloIcone: a.moduloId.icone
        }))
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// ===================== BUSCA =====================
router.get("/buscar", exigirAuth, exigirAcessoCurso("aulas"), async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    if (!q) return res.json([]);

    const moduloIds = await Modulo.find({ courseType: req.courseType, ativo: true }).distinct("_id");
    const aulas = await Aula.find({ ativo: true, moduloId: { $in: moduloIds }, titulo: { $regex: q, $options: "i" } })
      .select("titulo moduloId")
      .limit(30)
      .populate("moduloId", "titulo icone cor ativo");

    res.json(
      aulas
        .filter(a => a.moduloId && a.moduloId.ativo)
        .map(a => ({ _id: a._id, titulo: a.titulo, moduloId: a.moduloId._id, moduloTitulo: a.moduloId.titulo }))
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// ===================== CERTIFICADO (um por curso) =====================
router.get("/certificado", exigirAuth, async (req, res) => {
  try {
    let { courseType } = req.query;
    // Ver um certificado já emitido não exige acesso ATUAL ao curso (histórico não
    // deveria sumir se a assinatura vencer depois) — só identifica QUAL certificado,
    // com o mesmo fallback de auto-resolução das demais rotas pra telas que ainda não
    // mandam courseType: se o aluno só tem um certificado emitido, usa esse.
    if (!courseType) {
      const cursos = await Certificado.find({ userId: req.userId }).distinct("courseType");
      if (cursos.length !== 1) return res.status(400).json({ msg: "Informe o curso (courseType)." });
      courseType = cursos[0];
    } else if (!TIPOS_CURSO.includes(courseType)) {
      return res.status(400).json({ msg: "Curso inválido." });
    }

    const cert = await Certificado.findOne({ userId: req.userId, courseType });
    if (!cert) return res.status(404).json({ msg: "Certificado ainda não emitido." });
    const user = await User.findById(req.userId).select("nome");
    res.json({ emitidoEm: cert.emitidoEm, totalAulas: cert.totalAulasNaEmissao, nome: user.nome });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.post("/certificado/emitir", exigirAuth, exigirAcessoCurso("aulas"), async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("nome");
    const existente = await Certificado.findOne({ userId: req.userId, courseType: req.courseType });
    if (existente) {
      return res.json({ emitidoEm: existente.emitidoEm, totalAulas: existente.totalAulasNaEmissao, nome: user.nome });
    }

    const moduloIds = await Modulo.find({ courseType: req.courseType }).distinct("_id");
    const totalAulas = await Aula.countDocuments({ ativo: true, moduloId: { $in: moduloIds } });
    if (totalAulas === 0) return res.status(400).json({ msg: "Nenhuma aula publicada ainda para este curso." });

    const concluidas = await ProgressoAula.countDocuments({ userId: req.userId, concluida: true, moduloId: { $in: moduloIds } });
    if (concluidas < totalAulas) return res.status(400).json({ msg: "Você ainda não concluiu todas as aulas deste curso." });

    const cert = await Certificado.create({ userId: req.userId, courseType: req.courseType, totalAulasNaEmissao: totalAulas });
    res.json({ emitidoEm: cert.emitidoEm, totalAulas: cert.totalAulasNaEmissao, nome: user.nome });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// ===================== MATERIAIS (download autenticado) =====================
router.get("/aulas/:id/materiais/:materialId", exigirAuth, async (req, res) => {
  try {
    const ctx = await carregarAulaAutorizada(req, res, req.params.id);
    if (!ctx) return;

    const material = ctx.aula.materiais.id(req.params.materialId);
    if (!material || !material.arquivo || !material.arquivo.caminho) {
      return res.status(404).json({ msg: "Material não encontrado." });
    }
    res.download(material.arquivo.caminho, material.nome);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

module.exports = router;
