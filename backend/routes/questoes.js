const express = require("express");
const router = express.Router();
const Questao = require("../models/questao");
const Conjunto = require("../models/conjunto");
const SessaoResolucao = require("../models/sessaoResolucao");
const Tentativa = require("../models/tentativa");
const CadernoErros = require("../models/cadernoErros");
const { exigirAuth, exigirProfessor } = require("../middleware/auth");
const { derivarDificuldade, sortearQuestoes } = require("../utils/gerarConjunto");

router.use(exigirAuth);

// ===================== HELPERS =====================

// Remove os campos de gabarito antes de expor uma questão durante a resolução
// (o aluno nunca deve receber indiceCorreta/respostaVF/explicacao até enviar o conjunto).
function questaoSemGabarito(q) {
  return {
    _id: q._id, tipo: q.tipo, nivel: q.nivel, materia: q.materia,
    enunciado: q.enunciado, texto: q.texto, audio: q.audio, visual: q.visual, opcoes: q.opcoes
  };
}

function questaoCorreta(questao, respostaEscolhida) {
  if (respostaEscolhida === null || respostaEscolhida === undefined) return false;
  if (questao.tipo === "vf") return respostaEscolhida === questao.respostaVF;
  return respostaEscolhida === questao.opcoes[questao.indiceCorreta];
}

// Monta a resposta pública de uma sessão em andamento (sem gabarito), na mesma
// ordem em que as questões foram fixadas no Conjunto.
async function montarSessaoPublica(sessao, conjunto) {
  const questoes = await Questao.find({ _id: { $in: sessao.respostas.map(r => r.questaoId) } });
  const porId = new Map(questoes.map(q => [String(q._id), q]));

  return {
    _id: sessao._id,
    conjuntoId: sessao.conjuntoId,
    conjuntoNome: conjunto.nome,
    tempoLimiteSegundos: conjunto.tempoLimiteSegundos,
    tempoDecorridoSegundos: Math.floor((Date.now() - sessao.iniciadoEm.getTime()) / 1000),
    questaoAtualIndex: sessao.questaoAtualIndex,
    iniciadoEm: sessao.iniciadoEm,
    questoes: sessao.respostas.map((r, index) => ({
      index,
      ...questaoSemGabarito(porId.get(String(r.questaoId))),
      respostaEscolhida: r.respostaEscolhida,
      marcadaRevisao: r.marcadaRevisao,
      respondida: r.respostaEscolhida !== null && r.respostaEscolhida !== undefined
    }))
  };
}

// Monta o resultado completo (com gabarito) de uma Tentativa já finalizada.
async function montarResultadoTentativa(tentativa) {
  const questoes = await Questao.find({ _id: { $in: tentativa.respostas.map(r => r.questaoId) } });
  const porId = new Map(questoes.map(q => [String(q._id), q]));

  return {
    _id: tentativa._id, conjuntoId: tentativa.conjuntoId, numero: tentativa.numero,
    totalQuestoes: tentativa.totalQuestoes, totalCorretas: tentativa.totalCorretas,
    percentualAcertos: tentativa.percentualAcertos, tempoGastoSegundos: tentativa.tempoGastoSegundos,
    expirouPorTempo: tentativa.expirouPorTempo, iniciadaEm: tentativa.iniciadaEm, finalizadaEm: tentativa.finalizadaEm,
    respostas: tentativa.respostas.map((r, index) => {
      const q = porId.get(String(r.questaoId));
      return {
        index, questaoId: r.questaoId, respostaEscolhida: r.respostaEscolhida, correta: r.correta,
        marcadaRevisao: r.marcadaRevisao,
        respostaCorreta: q.tipo === "vf" ? q.respostaVF : q.opcoes[q.indiceCorreta],
        explicacao: q.explicacao,
        tipo: q.tipo, nivel: q.nivel, materia: q.materia,
        enunciado: q.enunciado, texto: q.texto, audio: q.audio, visual: q.visual, opcoes: q.opcoes, afirmacao: q.afirmacao
      };
    })
  };
}

async function derivarFiltrosDeQuestoes(questaoIds) {
  const questoes = await Questao.find({ _id: { $in: questaoIds } }).select("nivel materia");
  return {
    niveis: [...new Set(questoes.map(q => q.nivel))],
    materias: [...new Set(questoes.map(q => q.materia))]
  };
}

// ===================== ALUNO: LISTAGEM DE CONJUNTOS =====================

router.get("/conjuntos", async (req, res) => {
  try {
    const conjuntos = await Conjunto.find({
      ativo: true,
      $or: [{ tipo: "oficial" }, { tipo: "personalizado", criadoPor: req.userId }]
    }).sort({ criadoEm: -1 });

    const sessoes = await SessaoResolucao.find({ alunoId: req.userId });
    const sessaoPorConjunto = new Map(sessoes.map(s => [String(s.conjuntoId), s]));

    const tentativas = await Tentativa.find({ alunoId: req.userId }).sort({ finalizadaEm: -1 });
    const tentativasPorConjunto = new Map();
    tentativas.forEach(t => {
      const chave = String(t.conjuntoId);
      if (!tentativasPorConjunto.has(chave)) tentativasPorConjunto.set(chave, []);
      tentativasPorConjunto.get(chave).push(t);
    });

    const resumoBase = c => ({
      _id: c._id, nome: c.nome, descricao: c.descricao, tipo: c.tipo, pool: c.pool,
      filtros: c.filtros, dificuldade: c.dificuldade, quantidadeQuestoes: c.quantidadeQuestoes,
      tempoLimiteSegundos: c.tempoLimiteSegundos,
      mediaPercentualAcertos: c.estatisticas.tentativasTotais
        ? Math.round(c.estatisticas.somaPercentualAcertos / c.estatisticas.tentativasTotais)
        : null
    });

    const naoIniciados = [], emAndamento = [], respondidos = [];

    for (const c of conjuntos) {
      const chave = String(c._id);
      const sessao = sessaoPorConjunto.get(chave);
      const tentativasDoConjunto = tentativasPorConjunto.get(chave);

      if (sessao) {
        emAndamento.push({ ...resumoBase(c), status: "em_andamento", sessaoId: sessao._id, questoesRespondidas: sessao.respostas.filter(r => r.respostaEscolhida !== null).length });
      } else if (tentativasDoConjunto?.length) {
        const ultima = tentativasDoConjunto[0];
        respondidos.push({
          ...resumoBase(c), status: "concluido", totalTentativas: tentativasDoConjunto.length,
          ultimaTentativa: {
            _id: ultima._id, numero: ultima.numero, totalCorretas: ultima.totalCorretas,
            totalQuestoes: ultima.totalQuestoes, percentualAcertos: ultima.percentualAcertos,
            tempoGastoSegundos: ultima.tempoGastoSegundos, finalizadaEm: ultima.finalizadaEm
          }
        });
      } else {
        naoIniciados.push({ ...resumoBase(c), status: "nao_iniciado" });
      }
    }

    res.json({
      prioritarios: { naoIniciados, emAndamento, recomendados: [], atribuidosComoDever: [] },
      respondidos
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.get("/conjuntos/:id", async (req, res) => {
  try {
    const conjunto = await Conjunto.findOne({ _id: req.params.id, ativo: true });
    if (!conjunto) return res.status(404).json({ msg: "Conjunto não encontrado." });

    const sessao = await SessaoResolucao.findOne({ alunoId: req.userId, conjuntoId: conjunto._id });
    const tentativas = await Tentativa.find({ alunoId: req.userId, conjuntoId: conjunto._id }).sort({ finalizadaEm: -1 });

    res.json({
      conjunto,
      sessaoEmAndamentoId: sessao?._id || null,
      tentativas: tentativas.map(t => ({
        _id: t._id, numero: t.numero, totalCorretas: t.totalCorretas, totalQuestoes: t.totalQuestoes,
        percentualAcertos: t.percentualAcertos, tempoGastoSegundos: t.tempoGastoSegundos, finalizadaEm: t.finalizadaEm
      }))
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// ===================== ALUNO: CRIAÇÃO DE CONJUNTO PERSONALIZADO =====================

const QUANTIDADES_PERMITIDAS = [10, 20, 40];

router.post("/conjuntos/personalizado", async (req, res) => {
  try {
    const { nome, niveis, materias, quantidade, tempoLimiteSegundos } = req.body;

    if (!Array.isArray(niveis) || !niveis.length) return res.status(400).json({ msg: "Selecione ao menos um nível." });
    if (!Array.isArray(materias) || !materias.length) return res.status(400).json({ msg: "Selecione ao menos uma categoria." });
    if (!QUANTIDADES_PERMITIDAS.includes(quantidade)) return res.status(400).json({ msg: "Quantidade deve ser 10, 20 ou 40." });

    let questoes;
    try {
      questoes = await sortearQuestoes({ niveis, materias, quantidade, pool: "praticar" });
    } catch (err) {
      if (err.status === 422) return res.status(422).json({ msg: err.message });
      throw err;
    }

    const conjunto = await Conjunto.create({
      nome: nome?.trim() || `Conjunto personalizado — ${niveis.join("+")}`,
      tipo: "personalizado",
      pool: "praticar",
      criadoPor: req.userId,
      filtros: { niveis, materias },
      dificuldade: derivarDificuldade(niveis),
      questoes,
      quantidadeQuestoes: questoes.length,
      tempoLimiteSegundos: tempoLimiteSegundos || null
    });

    res.json(conjunto);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// ===================== ADMIN/PROFESSOR: BANCO DE QUESTÕES (curadoria) =====================

router.get("/admin/questoes", exigirProfessor, async (req, res) => {
  try {
    const { nivel, materia, tipo, pool, busca } = req.query;
    const filtro = { ativo: true };
    if (nivel) filtro.nivel = nivel;
    if (materia) filtro.materia = materia;
    if (tipo) filtro.tipo = tipo;
    if (pool) filtro.pool = pool;
    if (busca) filtro.enunciado = { $regex: busca, $options: "i" };

    const questoes = await Questao.find(filtro).select("codigo pool nivel materia tipo enunciado").sort({ nivel: 1, materia: 1 }).limit(200);
    res.json(questoes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// ===================== ADMIN/PROFESSOR: CONJUNTOS OFICIAIS =====================

router.get("/admin/conjuntos", exigirProfessor, async (req, res) => {
  try {
    const conjuntos = await Conjunto.find({ tipo: "oficial" }).sort({ criadoEm: -1 });
    res.json(conjuntos);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.get("/admin/conjuntos/:id", exigirProfessor, async (req, res) => {
  try {
    const conjunto = await Conjunto.findOne({ _id: req.params.id, tipo: "oficial" }).populate("questoes.questaoId");
    if (!conjunto) return res.status(404).json({ msg: "Conjunto não encontrado." });
    res.json(conjunto);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.post("/admin/conjuntos", exigirProfessor, async (req, res) => {
  try {
    const { nome, descricao, questoes: questaoIds, tempoLimiteSegundos, dificuldade } = req.body;
    if (!nome?.trim()) return res.status(400).json({ msg: "Informe o nome do conjunto." });
    if (!Array.isArray(questaoIds) || !questaoIds.length) return res.status(400).json({ msg: "Selecione ao menos uma questão." });

    const encontradas = await Questao.countDocuments({ _id: { $in: questaoIds } });
    if (encontradas !== questaoIds.length) return res.status(400).json({ msg: "Uma ou mais questões selecionadas não existem." });

    const filtros = await derivarFiltrosDeQuestoes(questaoIds);
    const conjunto = await Conjunto.create({
      nome: nome.trim(), descricao, tipo: "oficial", pool: "praticar", criadoPor: req.userId,
      filtros, dificuldade: dificuldade || derivarDificuldade(filtros.niveis),
      questoes: questaoIds.map((id, i) => ({ questaoId: id, ordem: i })),
      quantidadeQuestoes: questaoIds.length,
      tempoLimiteSegundos: tempoLimiteSegundos || null
    });

    res.json(conjunto);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.put("/admin/conjuntos/:id", exigirProfessor, async (req, res) => {
  try {
    const conjunto = await Conjunto.findOne({ _id: req.params.id, tipo: "oficial" });
    if (!conjunto) return res.status(404).json({ msg: "Conjunto não encontrado." });

    const { nome, descricao, ativo, tempoLimiteSegundos, dificuldade, questoes: questaoIds } = req.body;
    if (nome !== undefined) conjunto.nome = nome;
    if (descricao !== undefined) conjunto.descricao = descricao;
    if (ativo !== undefined) conjunto.ativo = !!ativo;
    if (tempoLimiteSegundos !== undefined) conjunto.tempoLimiteSegundos = tempoLimiteSegundos || null;
    if (dificuldade !== undefined) conjunto.dificuldade = dificuldade;

    if (questaoIds !== undefined) {
      if (!Array.isArray(questaoIds) || !questaoIds.length) return res.status(400).json({ msg: "Selecione ao menos uma questão." });
      const encontradas = await Questao.countDocuments({ _id: { $in: questaoIds } });
      if (encontradas !== questaoIds.length) return res.status(400).json({ msg: "Uma ou mais questões selecionadas não existem." });
      conjunto.questoes = questaoIds.map((id, i) => ({ questaoId: id, ordem: i }));
      conjunto.quantidadeQuestoes = questaoIds.length;
      conjunto.filtros = await derivarFiltrosDeQuestoes(questaoIds);
    }

    await conjunto.save();
    res.json(conjunto);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.delete("/admin/conjuntos/:id", exigirProfessor, async (req, res) => {
  try {
    await Conjunto.findOneAndUpdate({ _id: req.params.id, tipo: "oficial" }, { ativo: false });
    res.json({ msg: "Conjunto removido." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// ===================== ALUNO: SESSÃO DE RESOLUÇÃO =====================

router.post("/conjuntos/:id/sessao", async (req, res) => {
  try {
    const conjunto = await Conjunto.findOne({ _id: req.params.id, ativo: true });
    if (!conjunto) return res.status(404).json({ msg: "Conjunto não encontrado." });

    let sessao = await SessaoResolucao.findOne({ alunoId: req.userId, conjuntoId: conjunto._id });
    if (!sessao) {
      const questoesOrdenadas = conjunto.questoes.slice().sort((a, b) => a.ordem - b.ordem);
      sessao = await SessaoResolucao.create({
        alunoId: req.userId, conjuntoId: conjunto._id,
        respostas: questoesOrdenadas.map(q => ({ questaoId: q.questaoId, respostaEscolhida: null, marcadaRevisao: false }))
      });
    }

    res.json(await montarSessaoPublica(sessao, conjunto));
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.get("/sessoes/:id", async (req, res) => {
  try {
    const sessao = await SessaoResolucao.findOne({ _id: req.params.id, alunoId: req.userId });
    if (!sessao) return res.status(404).json({ msg: "Sessão não encontrada." });
    const conjunto = await Conjunto.findById(sessao.conjuntoId);
    if (!conjunto) return res.status(404).json({ msg: "Conjunto não encontrado." });
    res.json(await montarSessaoPublica(sessao, conjunto));
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.patch("/sessoes/:id/atual", async (req, res) => {
  try {
    const sessao = await SessaoResolucao.findOne({ _id: req.params.id, alunoId: req.userId });
    if (!sessao) return res.status(404).json({ msg: "Sessão não encontrada." });

    const { index } = req.body;
    if (typeof index !== "number" || index < 0 || index >= sessao.respostas.length) {
      return res.status(400).json({ msg: "Índice de questão inválido." });
    }
    sessao.questaoAtualIndex = index;
    sessao.ultimaAtividadeEm = new Date();
    await sessao.save();

    const conjunto = await Conjunto.findById(sessao.conjuntoId);
    res.json(await montarSessaoPublica(sessao, conjunto));
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.put("/sessoes/:id/questoes/:index", async (req, res) => {
  try {
    const sessao = await SessaoResolucao.findOne({ _id: req.params.id, alunoId: req.userId });
    if (!sessao) return res.status(404).json({ msg: "Sessão não encontrada." });

    const index = Number(req.params.index);
    const item = sessao.respostas[index];
    if (!item) return res.status(404).json({ msg: "Questão não encontrada na sessão." });

    const { respostaEscolhida, marcadaRevisao } = req.body;
    if (respostaEscolhida !== undefined) {
      item.respostaEscolhida = respostaEscolhida;
      item.respondidaEm = new Date();
    }
    if (marcadaRevisao !== undefined) item.marcadaRevisao = !!marcadaRevisao;
    sessao.ultimaAtividadeEm = new Date();
    await sessao.save();

    const conjunto = await Conjunto.findById(sessao.conjuntoId);
    res.json(await montarSessaoPublica(sessao, conjunto));
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.post("/sessoes/:id/finalizar", async (req, res) => {
  try {
    const sessao = await SessaoResolucao.findOne({ _id: req.params.id, alunoId: req.userId });
    if (!sessao) return res.status(404).json({ msg: "Sessão não encontrada." });
    const conjunto = await Conjunto.findById(sessao.conjuntoId);
    if (!conjunto) return res.status(404).json({ msg: "Conjunto não encontrado." });

    const tempoDecorridoSegundos = Math.floor((Date.now() - sessao.iniciadoEm.getTime()) / 1000);
    const expirouPorTempo = !!conjunto.tempoLimiteSegundos && tempoDecorridoSegundos >= conjunto.tempoLimiteSegundos;

    const pendentesIndex = sessao.respostas
      .map((r, index) => ({ r, index }))
      .filter(({ r }) => r.respostaEscolhida === null || r.respostaEscolhida === undefined)
      .map(({ index }) => index);

    if (pendentesIndex.length && !expirouPorTempo) {
      return res.status(400).json({ msg: "Ainda há questões sem resposta.", questoesPendentes: pendentesIndex });
    }

    const questoes = await Questao.find({ _id: { $in: sessao.respostas.map(r => r.questaoId) } });
    const porId = new Map(questoes.map(q => [String(q._id), q]));

    const respostasTentativa = sessao.respostas.map(r => {
      const questao = porId.get(String(r.questaoId));
      return {
        questaoId: r.questaoId,
        respostaEscolhida: r.respostaEscolhida ?? null,
        correta: questaoCorreta(questao, r.respostaEscolhida),
        marcadaRevisao: r.marcadaRevisao
      };
    });

    const totalQuestoes = respostasTentativa.length;
    const totalCorretas = respostasTentativa.filter(r => r.correta).length;
    const percentualAcertos = Math.round((totalCorretas / totalQuestoes) * 100);
    const numero = (await Tentativa.countDocuments({ alunoId: req.userId, conjuntoId: conjunto._id })) + 1;
    const tempoGastoSegundos = expirouPorTempo ? conjunto.tempoLimiteSegundos : tempoDecorridoSegundos;

    const tentativa = await Tentativa.create({
      alunoId: req.userId, conjuntoId: conjunto._id, numero,
      respostas: respostasTentativa, totalQuestoes, totalCorretas, percentualAcertos,
      expirouPorTempo, tempoGastoSegundos, iniciadaEm: sessao.iniciadoEm
    });

    await Conjunto.findByIdAndUpdate(conjunto._id, {
      $inc: { "estatisticas.tentativasTotais": 1, "estatisticas.somaPercentualAcertos": percentualAcertos }
    });

    await SessaoResolucao.deleteOne({ _id: sessao._id });

    res.json(await montarResultadoTentativa(tentativa));
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// ===================== ALUNO: RESULTADO/GABARITO DE UMA TENTATIVA =====================

router.get("/tentativas/:id", async (req, res) => {
  try {
    const tentativa = await Tentativa.findById(req.params.id);
    if (!tentativa) return res.status(404).json({ msg: "Tentativa não encontrada." });
    if (String(tentativa.alunoId) !== req.userId && req.userRole !== "admin" && req.userRole !== "professor") {
      return res.status(403).json({ msg: "Acesso negado." });
    }
    res.json(await montarResultadoTentativa(tentativa));
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// ===================== CADERNO DE REVISÃO (toggle durante a resolução) =====================

router.post("/sessoes/:id/questoes/:questaoId/caderno", async (req, res) => {
  try {
    const sessao = await SessaoResolucao.findOne({ _id: req.params.id, alunoId: req.userId });
    if (!sessao) return res.status(404).json({ msg: "Sessão não encontrada." });

    await CadernoErros.findOneAndUpdate(
      { alunoId: req.userId, questaoId: req.params.questaoId },
      { alunoId: req.userId, questaoId: req.params.questaoId, motivo: "revisao_manual", origem: { conjuntoId: sessao.conjuntoId } },
      { upsert: true, setDefaultsOnInsert: true }
    );
    res.json({ msg: "Adicionada ao Caderno de Revisão." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.delete("/sessoes/:id/questoes/:questaoId/caderno", async (req, res) => {
  try {
    const sessao = await SessaoResolucao.findOne({ _id: req.params.id, alunoId: req.userId });
    if (!sessao) return res.status(404).json({ msg: "Sessão não encontrada." });

    await CadernoErros.deleteOne({ alunoId: req.userId, questaoId: req.params.questaoId });
    res.json({ msg: "Removida do Caderno de Revisão." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

module.exports = router;
