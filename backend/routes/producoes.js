const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const fs = require("fs");
const mongoose = require("mongoose");
const Producao = require("../models/producao");
const Tema = require("../models/tema");
const User = require("../models/user");
const { exigirAuth, exigirProfessor } = require("../middleware/auth");
const { usuarioTemAcesso } = require("../middleware/acessoCurso");
const { uploadOriginal, uploadCorrigido, moverParaPastaDefinitiva, comTratamentoDeErro } = require("../middleware/upload");
const { transmitir } = require("../utils/sse");
const { validarIds, textoSeguro, ehObjectId } = require("../middleware/seguranca");
const { grade, avaliar } = require("../utils/gradesProva");
const { corrigirProducaoComIA, iaConfigurada } = require("../utils/correcaoProducaoIA");

const MAX_TEXTO_PRODUCAO = 50000;

// Ids da URL também viram pastas de upload — só aceita ObjectId válido.
for (const nome of ["id"]) {
  router.param(nome, (req, res, next, valor) => (ehObjectId(valor) ? next() : res.status(400).json({ msg: "Identificador inválido." })));
}

function gerarProtocolo() {
  const ano = new Date().getFullYear();
  const sufixo = Date.now().toString(36).toUpperCase() + crypto.randomBytes(2).toString("hex").toUpperCase();
  return `FN-${ano}-${sufixo}`;
}

function contarPalavras(texto) {
  return texto.trim().split(/\s+/).filter(Boolean).length;
}

// `pularChecagemAcesso` existe só para backend/routes/deveres.js: uma atividade de
// Dever de Casa (producao_textual/producao_oral) é atribuída pelo professor como parte
// do plano de estudos do aluno, não é uma escolha livre dele dentro do catálogo do
// Ambiente de Produção — não faz sentido negar o envio de um dever já atribuído por
// causa da entitlement do módulo avulso. O fluxo de auto-atendimento (POST / e
// POST /:id/reenviar aqui embaixo) sempre passa pela checagem normal.
// Opções do Ambiente de Produção (modelo "Modèles TCF"): `origem` (sujet/épreuve de onde veio),
// `transcricao` (produção oral), `semCredito` (épreuve proposta pelo professor não consome
// crédito) e `aceitarForaDoLimite` (na épreuve cronometrada o texto vai como está, curto ou longo).
async function montarNovaProducao({ userId, temaId, textoDigitado, observacoesAluno, file, origemId, duracaoSegundos, pularChecagemAcesso, modoCorrecao,
  origem, transcricao, semCredito, aceitarForaDoLimite }) {
  const porIA = modoCorrecao === "ia";
  if (textoDigitado !== undefined && typeof textoDigitado !== "string") throw { status: 400, msg: "Texto inválido." };
  if (textoDigitado && textoDigitado.length > MAX_TEXTO_PRODUCAO) throw { status: 400, msg: "Seu texto é longo demais." };
  observacoesAluno = textoSeguro(observacoesAluno, 2000);
  const tema = await Tema.findById(temaId);
  if (!tema || !tema.ativo) throw { status: 404, msg: "Tema não encontrado." };

  // courseType nunca vem do cliente aqui — deriva sempre do Tema, exatamente como já
  // acontece com `modalidade" logo abaixo. Fecha o vazamento que existia antes: qualquer
  // plano ativo liberava produção pra qualquer Tema de qualquer curso, sem checagem.
  if (!pularChecagemAcesso && (!tema.courseType || !(await usuarioTemAcesso(userId, "producao", tema.courseType)))) {
    throw { status: 403, msg: "Você não tem acesso ao módulo de Produção Textual para este curso." };
  }

  // Modalidade nunca vem do cliente — deriva sempre do Tema, pra nunca
  // divergir de qual rubrica/validação se aplica.
  const modalidade = tema.modalidade === "oral" ? "oral" : "textual";

  if (modalidade === "oral") {
    if (!file) throw { status: 400, msg: "Envie o áudio da sua produção oral." };
    if (!file.mimetype.startsWith("audio/")) throw { status: 400, msg: "Envie um arquivo de áudio (MP3, WAV ou WebM)." };
  } else if (!file && !textoDigitado?.trim()) {
    throw { status: 400, msg: "Envie um arquivo ou digite seu texto." };
  }
  transcricao = typeof transcricao === "string" ? transcricao.trim().slice(0, 10000) : "";
  // A IA lê o texto digitado (ou a transcrição da fala); arquivos anexados vão para o professor.
  if (porIA) {
    const temTexto = modalidade === "textual" ? !!textoDigitado?.trim() : !!transcricao;
    if (!temTexto) throw { status: 400, msg: modalidade === "oral" ? "A correção por IA da produção oral usa a transcrição da sua fala. Grave pelo Chrome ou Edge (que transcrevem) ou escolha a correção por professor." : "A correção por IA vale para redações digitadas na plataforma. Para arquivo ou áudio, escolha a correção por professor." };
    if (!iaConfigurada()) throw { status: 503, msg: "A correção por IA está indisponível no momento. Escolha a correção por professor." };
  }

  const user = await User.findById(userId);
  const custo = semCredito ? 0 : tema.creditosNecessarios;
  if ((user.creditosCorrecao || 0) < custo) {
    throw { status: 400, msg: "Você não tem créditos suficientes para esta correção." };
  }

  let contagemPalavras = null;
  if (modalidade === "textual" && textoDigitado?.trim()) {
    contagemPalavras = contarPalavras(textoDigitado);
    if (!aceitarForaDoLimite && contagemPalavras < tema.limitePalavrasMin) {
      throw { status: 400, msg: `Seu texto tem ${contagemPalavras} palavras. O mínimo exigido é ${tema.limitePalavrasMin}.` };
    }
    if (!aceitarForaDoLimite && contagemPalavras > tema.limitePalavrasMax) {
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
    status: porIA ? "em_correcao" : "em_fila",
    modoCorrecao: porIA ? "ia" : "professor",
    ia: porIA ? { status: "pendente" } : undefined,
    modalidade,
    arquivoOriginal,
    textoDigitado: modalidade === "textual" ? (textoDigitado?.trim() || undefined) : undefined,
    contagemPalavras,
    duracaoSegundos: modalidade === "oral" ? (Number(duracaoSegundos) || undefined) : undefined,
    transcricao: modalidade === "oral" ? (transcricao || undefined) : undefined,
    observacoesAluno,
    origem: origem || { tipo: "tema" },
    creditosUtilizados: custo,
    prazoEstimado: new Date(Date.now() + (porIA ? 10 * 60 * 1000 : 5 * 24 * 60 * 60 * 1000)),
    dataEnvio: new Date(),
    historicoStatus: [{ status: porIA ? "em_correcao" : "em_fila", data: new Date() }]
  });

  if (custo) {
    user.creditosCorrecao -= custo;
    await user.save();
  }

  transmitir("producao-atualizada", { alunoId: String(userId), producaoId: String(producao._id) });
  if (porIA) setImmediate(() => processarCorrecaoIA(producao._id).catch(err => console.error("Correção IA:", err.message)));
  return producao;
}

// Corrige em segundo plano. Se a IA falhar, a produção vai para a fila do professor
// (o crédito já pago continua valendo) e o aluno é avisado no histórico.
async function processarCorrecaoIA(producaoId) {
  const producao = await Producao.findById(producaoId);
  if (!producao || producao.modoCorrecao !== "ia" || producao.status === "corrigido") return;
  const tema = await Tema.findById(producao.temaId);
  try {
    // Sujets do Ambiente de Produção: correção no formato do app de modelos (trame, léxico,
    // versão melhorada), que também alimenta o carnet de erros do aluno.
    const avaliacao = producao.origem?.tipo === "modeles"
      ? await require("../utils/correcaoModelesIA").corrigirProducaoModeles(producao, tema)
      : await corrigirProducaoComIA(tema, producao.textoDigitado || "");
    producao.avaliacao = avaliacao;
    producao.status = "corrigido";
    producao.dataCorrecao = new Date();
    producao.ia = { status: "concluida", modelo: avaliacao.modelo, em: new Date() };
    producao.historicoStatus.push({ status: "corrigido", data: new Date() });
  } catch (err) {
    producao.modoCorrecao = "professor";
    producao.status = "em_fila";
    producao.prazoEstimado = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    producao.ia = { status: "erro", erro: String(err.message || err).slice(0, 300), em: new Date() };
    producao.historicoStatus.push({ status: "em_fila", data: new Date() });
    producao.mensagens.push({ autor: "professor", texto: "A correção automática não pôde ser concluída agora. Sua redação foi encaminhada a um professor, sem custo adicional.", data: new Date() });
  }
  await producao.save();
  transmitir("producao-atualizada", { alunoId: String(producao.alunoId), producaoId: String(producao._id) });
}

// ===================== ALUNO: ENVIAR PRODUÇÃO =====================
router.post("/", exigirAuth, comTratamentoDeErro(uploadOriginal.single("arquivo")), async (req, res) => {
  const limparTemp = () => { if (req.file) fs.unlink(req.file.path, () => {}); };
  try {
    const { temaId, textoDigitado, observacoesAluno, duracaoSegundos, modoCorrecao } = req.body;
    if (!temaId || typeof temaId !== "string" || !/^[a-f0-9]{24}$/i.test(temaId)) {
      limparTemp(); return res.status(400).json({ msg: "Selecione um tema." });
    }

    const producao = await montarNovaProducao({
      userId: req.userId, temaId, textoDigitado, observacoesAluno, file: req.file, duracaoSegundos, modoCorrecao
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
    const { status, busca, courseType } = req.query;
    const filtro = { alunoId: req.userId };
    if (status) filtro.status = status;

    let producoes = await Producao.find(filtro)
      .populate("temaId", "titulo exame courseType nivel")
      .populate("professorId", "nome")
      .sort({ criadoEm: -1 });

    if (courseType) producoes = producoes.filter(p => p.temaId?.courseType === courseType);
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
    const { exame, courseType, tema: temaFiltro, status, prioridade } = req.query;

    let producoes = await Producao.find({ status: { $in: ["em_fila", "em_correcao"] } })
      .populate("temaId", "titulo exame courseType nivel tempoSugerido")
      .populate("alunoId", "nome")
      .sort({ dataEnvio: 1 });

    producoes = producoes.filter(p => {
      if (p.status === "em_correcao" && (!p.professorId || p.professorId.toString() !== req.userId)) return false;
      return true;
    });

    if (exame) producoes = producoes.filter(p => p.temaId?.exame === exame);
    if (courseType) producoes = producoes.filter(p => p.temaId?.courseType === courseType);
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

// ===================== CONFIGURAÇÃO E GRADE DA PROVA =====================
router.get("/config", exigirAuth, (req, res) => {
  res.json({ iaDisponivel: iaConfigurada() });
});

// Grade oficial usada na correção (critérios e pontuação máxima) — para o aluno ver
// como será avaliado e para o professor lançar a nota.
router.get("/grade/:curso", exigirAuth, (req, res) => {
  res.json(grade(String(req.params.curso), req.query.modalidade === "oral" ? "oral" : "textual"));
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
    const texto = textoSeguro(req.body.texto, 5000);
    if (!texto) return res.status(400).json({ msg: "Escreva uma mensagem." });

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
router.post("/:id/corrigir", exigirAuth, exigirProfessor, validarIds("id"), comTratamentoDeErro(uploadCorrigido.single("arquivo")), async (req, res) => {
  const limparArquivo = () => { if (req.file) fs.unlink(req.file.path, () => {}); };
  try {
    const producao = await Producao.findById(req.params.id);
    if (!producao) { limparArquivo(); return res.status(404).json({ msg: "Produção não encontrada." }); }
    if (producao.professorId?.toString() !== req.userId && req.userRole !== "admin") {
      limparArquivo();
      return res.status(403).json({ msg: "Esta produção não está atribuída a você." });
    }

    let avaliacao;
    try { avaliacao = JSON.parse(typeof req.body.avaliacao === "string" ? req.body.avaliacao : "{}"); }
    catch { limparArquivo(); return res.status(400).json({ msg: "Avaliação inválida." }); }

    if (!avaliacao || typeof avaliacao !== "object" || !Array.isArray(avaliacao.criterios) || !avaliacao.criterios.length || avaliacao.notaTotal === undefined) {
      limparArquivo();
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
    // Critérios com id = grade da prova (gradesProva): o total, o nível e o NCLC são
    // recalculados aqui. Avaliações no formato antigo (só nome/nota) passam como vieram.
    if (avaliacao.criterios.every(c => c && c.id)) {
      const tema = await Tema.findById(producao.temaId).select("courseType nivel");
      const notas = Object.fromEntries(avaliacao.criterios.map(c => [c.id, c.nota]));
      const comentarios = Object.fromEntries(avaliacao.criterios.map(c => [c.id, c.comentario]));
      const av = avaliar(tema?.courseType, producao.modalidade, notas, { nivelAlvo: tema?.nivel, comentarios, notaFinal: avaliacao.notaFinal });
      const professor = await User.findById(req.userId).select("nome");
      avaliacao = {
        exame: av.exame, criterios: av.criterios, notaTotal: av.notaTotal, notaMaxima: av.notaMaxima,
        nivelEstimado: av.nivel, nclc: av.nclc, aprovado: av.aprovado, pontuacaoOficial: av.pontuacaoOficial,
        comentarioGeral: textoSeguro(avaliacao.comentarioGeral, 5000),
        pontosFortes: (Array.isArray(avaliacao.pontosFortes) ? avaliacao.pontosFortes : []).slice(0, 5).map(x => textoSeguro(x, 500)).filter(Boolean),
        aMelhorar: (Array.isArray(avaliacao.aMelhorar) ? avaliacao.aMelhorar : []).slice(0, 5).map(x => textoSeguro(x, 500)).filter(Boolean),
        correcoes: (Array.isArray(avaliacao.correcoes) ? avaliacao.correcoes : []).slice(0, 20).map(c => ({
          trecho: textoSeguro(c?.trecho, 400), correcao: textoSeguro(c?.correcao, 400), explicacao: textoSeguro(c?.explicacao, 600)
        })).filter(c => c.trecho),
        corretor: "professor", corretorNome: professor?.nome || "Professor"
      };
    }
    producao.avaliacao = avaliacao;
    producao.status = "corrigido";
    producao.dataCorrecao = new Date();
    producao.historicoStatus.push({ status: "corrigido", data: new Date() });
    await producao.save();
    transmitir("producao-atualizada", { alunoId: String(producao.alunoId), producaoId: String(producao._id) });
    // As correções pontuais do professor entram no carnet de erros do aluno (Caderno de Revisão).
    if (avaliacao?.correcoes?.length) {
      const tema = await Tema.findById(producao.temaId).select("courseType eixo");
      require("../utils/correcaoModelesIA").registrarNoCarnet(producao.alunoId, producao.origem?.tache || "",
        { corrections: avaliacao.correcoes.map(c => ({ original: c.trecho, corrige: c.correcao, explication: c.explicacao })) },
        { courseType: tema?.courseType, producaoId: producao._id, eixo: producao.origem?.eixo || tema?.eixo, origem: "professor" }).catch(e => console.error("carnet:", e.message));
    }

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
module.exports.processarCorrecaoIA = processarCorrecaoIA;
