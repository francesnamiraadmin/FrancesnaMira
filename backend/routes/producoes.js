const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const fs = require("fs");
const mongoose = require("mongoose");
const Producao = require("../models/producao");
const Tema = require("../models/tema");
const User = require("../models/user");
const { exigirAuth, exigirProfessor } = require("../middleware/auth");
const { uploadOriginal, uploadCorrigido, moverParaPastaDefinitiva, comTratamentoDeErro } = require("../middleware/upload");
const { transmitir } = require("../utils/sse");

function gerarProtocolo() {
  const ano = new Date().getFullYear();
  const sufixo = Date.now().toString(36).toUpperCase() + crypto.randomBytes(2).toString("hex").toUpperCase();
  return `FN-${ano}-${sufixo}`;
}

function contarPalavras(texto) {
  return texto.trim().split(/\s+/).filter(Boolean).length;
}

async function montarNovaProducao({ userId, temaId, textoDigitado, observacoesAluno, file, origemId, duracaoSegundos }) {
  const tema = await Tema.findById(temaId);
  if (!tema || !tema.ativo) throw { status: 404, msg: "Tema não encontrado." };

  // Modalidade nunca vem do cliente — deriva sempre do Tema, pra nunca
  // divergir de qual rubrica/validação se aplica.
  const modalidade = tema.modalidade === "oral" ? "oral" : "textual";

  if (modalidade === "oral") {
    if (!file) throw { status: 400, msg: "Envie o áudio da sua produção oral." };
    if (!file.mimetype.startsWith("audio/")) throw { status: 400, msg: "Envie um arquivo de áudio (MP3, WAV ou WebM)." };
  } else if (!file && !textoDigitado?.trim()) {
    throw { status: 400, msg: "Envie um arquivo ou digite seu texto." };
  }

  const user = await User.findById(userId);
  if ((user.creditosCorrecao || 0) < tema.creditosNecessarios) {
    throw { status: 400, msg: "Você não tem créditos suficientes para esta correção." };
  }

  let contagemPalavras = null;
  if (modalidade === "textual" && textoDigitado?.trim()) {
    contagemPalavras = contarPalavras(textoDigitado);
    if (contagemPalavras < tema.limitePalavrasMin) {
      throw { status: 400, msg: `Seu texto tem ${contagemPalavras} palavras. O mínimo exigido é ${tema.limitePalavrasMin}.` };
    }
    if (contagemPalavras > tema.limitePalavrasMax) {
      throw { status: 400, msg: `Seu texto tem ${contagemPalavras} palavras. O máximo permitido é ${tema.limitePalavrasMax}.` };
    }
  }

  const producaoId = new mongoose.Types.ObjectId();
  let arquivoOriginal;
  if (file) {
    const destino = moverParaPastaDefinitiva(file.path, producaoId, "original", file.originalname, file.mimetype);
    arquivoOriginal = { nome: file.originalname, caminho: destino, tamanho: file.size, mimetype: file.mimetype, enviadoEm: new Date() };
  }

  const producao = await Producao.create({
    _id: producaoId,
    protocolo: gerarProtocolo(),
    alunoId: userId,
    temaId,
    origemId: origemId || null,
    status: "em_fila",
    modalidade,
    arquivoOriginal,
    textoDigitado: modalidade === "textual" ? (textoDigitado?.trim() || undefined) : undefined,
    contagemPalavras,
    duracaoSegundos: modalidade === "oral" ? (Number(duracaoSegundos) || undefined) : undefined,
    observacoesAluno,
    creditosUtilizados: tema.creditosNecessarios,
    prazoEstimado: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    dataEnvio: new Date(),
    historicoStatus: [{ status: "em_fila", data: new Date() }]
  });

  user.creditosCorrecao -= tema.creditosNecessarios;
  await user.save();

  transmitir("producao-atualizada", { alunoId: String(userId), producaoId: String(producao._id) });
  return producao;
}

// ===================== ALUNO: ENVIAR PRODUÇÃO =====================
router.post("/", exigirAuth, comTratamentoDeErro(uploadOriginal.single("arquivo")), async (req, res) => {
  const limparTemp = () => { if (req.file) fs.unlink(req.file.path, () => {}); };
  try {
    const { temaId, textoDigitado, observacoesAluno, duracaoSegundos } = req.body;
    if (!temaId) { limparTemp(); return res.status(400).json({ msg: "Selecione um tema." }); }

    const producao = await montarNovaProducao({
      userId: req.userId, temaId, textoDigitado, observacoesAluno, file: req.file, duracaoSegundos
    });
    res.json({ msg: "Produção enviada com sucesso! Protocolo: " + producao.protocolo, producao });
  } catch (err) {
    limparTemp();
    if (err.status) return res.status(err.status).json({ msg: err.msg });
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor. Tente novamente." });
  }
});

// ===================== ALUNO: HISTÓRICO =====================
router.get("/minhas", exigirAuth, async (req, res) => {
  try {
    const { status, busca } = req.query;
    const filtro = { alunoId: req.userId };
    if (status) filtro.status = status;

    let producoes = await Producao.find(filtro)
      .populate("temaId", "titulo exame nivel")
      .populate("professorId", "nome")
      .sort({ criadoEm: -1 });

    if (busca) {
      const termo = busca.toLowerCase();
      producoes = producoes.filter(p =>
        p.temaId?.titulo?.toLowerCase().includes(termo) || p.protocolo.toLowerCase().includes(termo)
      );
    }
    res.json(producoes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// ===================== PROFESSOR: FILA =====================
router.get("/professor/fila", exigirAuth, exigirProfessor, async (req, res) => {
  try {
    const { exame, tema: temaFiltro, status, prioridade } = req.query;

    let producoes = await Producao.find({ status: { $in: ["em_fila", "em_correcao"] } })
      .populate("temaId", "titulo exame nivel tempoSugerido")
      .populate("alunoId", "nome")
      .sort({ dataEnvio: 1 });

    producoes = producoes.filter(p => {
      if (p.status === "em_correcao" && (!p.professorId || p.professorId.toString() !== req.userId)) return false;
      return true;
    });

    if (exame) producoes = producoes.filter(p => p.temaId?.exame === exame);
    if (temaFiltro) producoes = producoes.filter(p => p.temaId?._id.toString() === temaFiltro);
    if (status) producoes = producoes.filter(p => p.status === status);
    if (prioridade === "urgente") {
      const agora = Date.now();
      producoes = producoes.filter(p => p.prazoEstimado && (new Date(p.prazoEstimado).getTime() - agora) < 2 * 24 * 60 * 60 * 1000);
    }

    res.json(producoes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// ===================== PROFESSOR: ESTATÍSTICAS PESSOAIS =====================
router.get("/professor/stats", exigirAuth, exigirProfessor, async (req, res) => {
  try {
    const pendentes = await Producao.countDocuments({ status: "em_fila" });
    const emAndamento = await Producao.countDocuments({ status: "em_correcao", professorId: req.userId });
    const concluidas = await Producao.find({ status: { $in: ["corrigido", "devolvido"] }, professorId: req.userId });

    let tempoMedioHoras = null;
    const comTempos = concluidas.filter(p => p.dataEnvio && p.dataCorrecao);
    if (comTempos.length) {
      const totalMs = comTempos.reduce((acc, p) => acc + (p.dataCorrecao - p.dataEnvio), 0);
      tempoMedioHoras = Math.round((totalMs / comTempos.length / 3600000) * 10) / 10;
    }

    res.json({ pendentes, emAndamento, concluidas: concluidas.length, tempoMedioHoras });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// ===================== DETALHE DE UMA PRODUÇÃO =====================
router.get("/:id", exigirAuth, async (req, res) => {
  try {
    const producao = await Producao.findById(req.params.id)
      .populate("temaId")
      .populate("professorId", "nome")
      .populate("alunoId", "nome email");
    if (!producao) return res.status(404).json({ msg: "Produção não encontrada." });

    const souDono = producao.alunoId._id.toString() === req.userId;
    const souStaff = req.userRole === "professor" || req.userRole === "admin";
    if (!souDono && !souStaff) {
      return res.status(403).json({ msg: "Você não tem acesso a esta produção." });
    }
    res.json(producao);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// ===================== DOWNLOAD DE ARQUIVO (autenticado) =====================
router.get("/:id/arquivo/:tipo", exigirAuth, async (req, res) => {
  try {
    const producao = await Producao.findById(req.params.id);
    if (!producao) return res.status(404).json({ msg: "Produção não encontrada." });

    const souDono = producao.alunoId.toString() === req.userId;
    const souStaff = req.userRole === "professor" || req.userRole === "admin";
    if (!souDono && !souStaff) {
      return res.status(403).json({ msg: "Acesso negado." });
    }

    const campo = req.params.tipo === "corrigido" ? "arquivoCorrigido" : "arquivoOriginal";
    const arquivo = producao[campo];
    if (!arquivo || !arquivo.caminho) return res.status(404).json({ msg: "Arquivo não disponível." });

    res.download(arquivo.caminho, arquivo.nome);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// ===================== MENSAGENS =====================
router.post("/:id/mensagens", exigirAuth, async (req, res) => {
  try {
    const { texto } = req.body;
    if (!texto?.trim()) return res.status(400).json({ msg: "Escreva uma mensagem." });

    const producao = await Producao.findById(req.params.id);
    if (!producao) return res.status(404).json({ msg: "Produção não encontrada." });

    const souDono = producao.alunoId.toString() === req.userId;
    const souStaff = req.userRole === "professor" || req.userRole === "admin";
    if (!souDono && !souStaff) {
      return res.status(403).json({ msg: "Acesso negado." });
    }

    producao.mensagens.push({
      autor: souStaff ? "professor" : "aluno",
      autorId: req.userId,
      texto: texto.trim(),
      data: new Date()
    });
    await producao.save();
    res.json({ msg: "Mensagem enviada.", mensagens: producao.mensagens });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// ===================== REENVIAR (consome novo crédito) =====================
router.post("/:id/reenviar", exigirAuth, comTratamentoDeErro(uploadOriginal.single("arquivo")), async (req, res) => {
  const limparTemp = () => { if (req.file) fs.unlink(req.file.path, () => {}); };
  try {
    const original = await Producao.findById(req.params.id);
    if (!original || original.alunoId.toString() !== req.userId) {
      limparTemp();
      return res.status(404).json({ msg: "Produção não encontrada." });
    }

    const { textoDigitado, observacoesAluno, duracaoSegundos } = req.body;
    const nova = await montarNovaProducao({
      userId: req.userId, temaId: original.temaId, textoDigitado, observacoesAluno,
      file: req.file, origemId: original._id, duracaoSegundos
    });

    res.json({ msg: "Reenviado com sucesso! Novo protocolo: " + nova.protocolo, producao: nova });
  } catch (err) {
    limparTemp();
    if (err.status) return res.status(err.status).json({ msg: err.msg });
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// ===================== PROFESSOR: ASSUMIR PRODUÇÃO =====================
router.post("/:id/assumir", exigirAuth, exigirProfessor, async (req, res) => {
  try {
    const producao = await Producao.findById(req.params.id);
    if (!producao) return res.status(404).json({ msg: "Produção não encontrada." });
    if (producao.status !== "em_fila") return res.status(400).json({ msg: "Esta produção já foi assumida ou não está disponível." });

    producao.professorId = req.userId;
    producao.status = "em_correcao";
    producao.historicoStatus.push({ status: "em_correcao", data: new Date() });
    await producao.save();
    res.json({ msg: "Produção assumida.", producao });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// ===================== PROFESSOR: SALVAR RASCUNHO DE AVALIAÇÃO =====================
router.put("/:id/avaliacao", exigirAuth, exigirProfessor, async (req, res) => {
  try {
    const producao = await Producao.findById(req.params.id);
    if (!producao) return res.status(404).json({ msg: "Produção não encontrada." });
    if (producao.professorId?.toString() !== req.userId && req.userRole !== "admin") {
      return res.status(403).json({ msg: "Esta produção não está atribuída a você." });
    }
    producao.avaliacao = { ...(producao.avaliacao?.toObject ? producao.avaliacao.toObject() : producao.avaliacao), ...req.body };
    await producao.save();
    res.json({ msg: "Rascunho salvo.", producao });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// ===================== PROFESSOR: DEVOLVER CORRIGIDO =====================
router.post("/:id/corrigir", exigirAuth, exigirProfessor, comTratamentoDeErro(uploadCorrigido.single("arquivo")), async (req, res) => {
  try {
    const producao = await Producao.findById(req.params.id);
    if (!producao) return res.status(404).json({ msg: "Produção não encontrada." });
    if (producao.professorId?.toString() !== req.userId && req.userRole !== "admin") {
      return res.status(403).json({ msg: "Esta produção não está atribuída a você." });
    }

    let avaliacao;
    try { avaliacao = JSON.parse(req.body.avaliacao || "{}"); }
    catch { return res.status(400).json({ msg: "Avaliação inválida." }); }

    if (!avaliacao.criterios?.length || avaliacao.notaTotal === undefined) {
      return res.status(400).json({ msg: "Preencha a avaliação completa antes de devolver." });
    }

    if (req.file) {
      producao.arquivoCorrigido = {
        nome: req.file.originalname,
        caminho: req.file.path,
        tamanho: req.file.size,
        mimetype: req.file.mimetype,
        enviadoEm: new Date()
      };
    }
    producao.avaliacao = avaliacao;
    producao.status = "corrigido";
    producao.dataCorrecao = new Date();
    producao.historicoStatus.push({ status: "corrigido", data: new Date() });
    await producao.save();
    transmitir("producao-atualizada", { alunoId: String(producao.alunoId), producaoId: String(producao._id) });

    res.json({ msg: "Correção enviada ao aluno!", producao });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// Reaproveitado por backend/routes/deveres.js — uma atividade de dever de casa
// do tipo "producao_textual" cria uma Producao real em vez de duplicar a
// lógica de validação/criação aqui.
module.exports = router;
module.exports.montarNovaProducao = montarNovaProducao;
