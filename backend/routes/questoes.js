const express = require("express");
const router = express.Router();
const Questao = require("../models/questao");
const Conjunto = require("../models/conjunto");
const SessaoResolucao = require("../models/sessaoResolucao");
const Tentativa = require("../models/tentativa");
const CadernoErros = require("../models/cadernoErros");
const DeverSemanal = require("../models/deverSemanal");
const { exigirAuth, exigirProfessor } = require("../middleware/auth");
const { exigirAcessoCurso, usuarioTemAcesso, cursosComAcesso } = require("../middleware/acessoCurso");
const { derivarDificuldade, sortearQuestoes, derivarFiltrosDeQuestoes, classificarPrioridade } = require("../utils/gerarConjunto");
const { TIPOS_CURSO } = require("../utils/tiposCurso");

router.use(exigirAuth);

// ===================== HELPERS =====================

// Um conjunto atribuído como Dever de Casa (backend/routes/deveres.js) deve poder ser
// resolvido mesmo que o aluno não tenha a entitlement de "Plataforma de Questões" —
// dever de casa é atribuído pelo professor como parte do plano de estudos, não é uma
// escolha livre do catálogo avulso da Plataforma.
async function conjuntoAtribuidoComoDever(alunoId, conjuntoId) {
  return !!(await DeverSemanal.exists({ alunoId, "atividades.conteudo.conjuntoId": conjuntoId }));
}

async function podeAcessarConjunto(userId, conjunto) {
  if (conjunto.courseType && (await usuarioTemAcesso(userId, "plataforma", conjunto.courseType))) return true;
  return conjuntoAtribuidoComoDever(userId, conjunto._id);
}

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

// Monta o resultado completo (com gabarito) de uma Tentativa já finalizada. `noCaderno`
// só é conhecido aqui (depois da resposta certa ter sido revelada) — é por isso que
// adicionar ao Caderno de Revisão só é possível a partir desta tela, nunca durante a
// resolução ao vivo (ver rotas de Caderno de Revisão mais abaixo).
async function montarResultadoTentativa(tentativa) {
  const questaoIds = tentativa.respostas.map(r => r.questaoId);
  const [questoes, noCaderno, conjunto] = await Promise.all([
    Questao.find({ _id: { $in: questaoIds } }),
    CadernoErros.find({ alunoId: tentativa.alunoId, questaoId: { $in: questaoIds } }).select("questaoId"),
    Conjunto.findById(tentativa.conjuntoId).select("pool nome")
  ]);
  const porId = new Map(questoes.map(q => [String(q._id), q]));
  const idsNoCaderno = new Set(noCaderno.map(c => String(c.questaoId)));

  return {
    _id: tentativa._id, conjuntoId: tentativa.conjuntoId, conjuntoNome: conjunto?.nome,
    pool: conjunto?.pool || "praticar", numero: tentativa.numero,
    totalQuestoes: tentativa.totalQuestoes, totalCorretas: tentativa.totalCorretas,
    percentualAcertos: tentativa.percentualAcertos, tempoGastoSegundos: tentativa.tempoGastoSegundos,
    expirouPorTempo: tentativa.expirouPorTempo, iniciadaEm: tentativa.iniciadaEm, finalizadaEm: tentativa.finalizadaEm,
    respostas: tentativa.respostas.map((r, index) => {
      const q = porId.get(String(r.questaoId));
      return {
        index, questaoId: r.questaoId, respostaEscolhida: r.respostaEscolhida, correta: r.correta,
        marcadaRevisao: r.marcadaRevisao, noCaderno: idsNoCaderno.has(String(r.questaoId)),
        respostaCorreta: q.tipo === "vf" ? q.respostaVF : q.opcoes[q.indiceCorreta],
        explicacao: q.explicacao,
        tipo: q.tipo, nivel: q.nivel, materia: q.materia,
        enunciado: q.enunciado, texto: q.texto, audio: q.audio, visual: q.visual, opcoes: q.opcoes, afirmacao: q.afirmacao
      };
    })
  };
}

// ===================== ALUNO: LISTAGEM DE CONJUNTOS =====================

router.get("/conjuntos", exigirAcessoCurso("plataforma"), async (req, res) => {
  try {
    // Oficiais em ordem crescente de criação (Conjunto 01, 02, 03...) — é a ordem em que
    // o catálogo pré-montado foi pensado para ser navegado. Personalizados em ordem
    // decrescente (o conjunto que o próprio aluno acabou de montar aparece primeiro).
    const [oficiais, personalizados] = await Promise.all([
      Conjunto.find({ ativo: true, tipo: "oficial", pool: "praticar", courseType: req.courseType }).sort({ criadoEm: 1 }),
      Conjunto.find({ ativo: true, tipo: "personalizado", pool: "praticar", courseType: req.courseType, criadoPor: req.userId }).sort({ criadoEm: -1 })
    ]);
    const conjuntos = [...oficiais, ...personalizados];

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
        emAndamento.push({
          ...resumoBase(c), status: "em_andamento", sessaoId: sessao._id,
          questoesRespondidas: sessao.respostas.filter(r => r.respostaEscolhida !== null).length,
          tempoDecorridoSegundos: Math.floor((Date.now() - sessao.iniciadoEm.getTime()) / 1000)
        });
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

    // Aba Sugeridos = só oficiais não iniciados, ordenados por prioridade (1 = nível
    // único + categorias variadas, 2 = múltiplos níveis + variadas, 3 = tema único).
    // Personalizados praticamente nunca chegam aqui (criar um já leva direto pra uma
    // sessão em andamento), mas se acontecer ficam ao final, sem entrar na prioridade.
    const sugeridosOficiais = naoIniciados
      .filter(c => c.tipo === "oficial")
      .map((c, indiceOriginal) => ({ c, prioridade: classificarPrioridade(c), indiceOriginal }))
      .sort((a, b) => a.prioridade - b.prioridade || a.indiceOriginal - b.indiceOriginal)
      .map(({ c }) => c);
    const naoIniciadosOrdenados = [...sugeridosOficiais, ...naoIniciados.filter(c => c.tipo !== "oficial")];

    res.json({
      prioritarios: { naoIniciados: naoIniciadosOrdenados, emAndamento, recomendados: [], atribuidosComoDever: [] },
      respondidos
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// Lista compacta (sem os buckets de Sugeridos/Em Andamento/Respondidos que GET /conjuntos
// monta) só dos conjuntos PERSONALIZADOS que o próprio aluno criou — usada pela tela
// "Personalizar Conjunto" pra mostrar o histórico do que ele já montou, com opção de
// excluir. Precisa vir ANTES de "GET /conjuntos/:id" nesta ordem de registro, senão o
// Express casaria "meus-personalizados" com o parâmetro :id daquela rota.
// Formato devolvido é compatível com renderPrioritarioCard/renderRespondidoCard de
// conjuntoCard.js (mesmos campos que GET /conjuntos usa) — pra "Meus conjuntos
// personalizados" reaproveitar os MESMOS cards visuais de Sugeridos/Respondidos, ver
// personalizarConjunto.js#renderPersonalizadoCard.
router.get("/conjuntos/meus-personalizados", exigirAcessoCurso("plataforma"), async (req, res) => {
  try {
    const conjuntos = await Conjunto.find({ ativo: true, tipo: "personalizado", pool: "praticar", courseType: req.courseType, criadoPor: req.userId }).sort({ criadoEm: -1 });
    const ids = conjuntos.map(c => c._id);

    const [sessoes, tentativas] = await Promise.all([
      SessaoResolucao.find({ alunoId: req.userId, conjuntoId: { $in: ids } }).select("conjuntoId respostas"),
      Tentativa.find({ alunoId: req.userId, conjuntoId: { $in: ids } })
        .select("conjuntoId percentualAcertos finalizadaEm totalCorretas totalQuestoes tempoGastoSegundos")
        .sort({ finalizadaEm: -1 })
    ]);
    const sessaoPorConjunto = new Map(sessoes.map(s => [String(s.conjuntoId), s]));
    const tentativasPorConjunto = new Map();
    tentativas.forEach(t => {
      const chave = String(t.conjuntoId);
      if (!tentativasPorConjunto.has(chave)) tentativasPorConjunto.set(chave, []);
      tentativasPorConjunto.get(chave).push(t);
    });

    res.json(conjuntos.map(c => {
      const chave = String(c._id);
      const sessao = sessaoPorConjunto.get(chave);
      const tentativasDoConjunto = tentativasPorConjunto.get(chave) || [];
      const ultima = tentativasDoConjunto[0];
      return {
        _id: c._id, nome: c.nome, descricao: c.descricao, tipo: "personalizado",
        filtros: c.filtros, dificuldade: c.dificuldade,
        quantidadeQuestoes: c.quantidadeQuestoes, tempoLimiteSegundos: c.tempoLimiteSegundos, criadoEm: c.criadoEm,
        status: sessao ? "em_andamento" : (ultima ? "concluido" : "nao_iniciado"),
        questoesRespondidas: sessao ? sessao.respostas.filter(r => r.respostaEscolhida !== null).length : undefined,
        totalTentativas: tentativasDoConjunto.length,
        ultimaTentativa: ultima ? {
          _id: ultima._id, percentualAcertos: ultima.percentualAcertos, finalizadaEm: ultima.finalizadaEm,
          totalCorretas: ultima.totalCorretas, totalQuestoes: ultima.totalQuestoes, tempoGastoSegundos: ultima.tempoGastoSegundos
        } : null
      };
    }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.get("/conjuntos/:id", async (req, res) => {
  try {
    const conjunto = await Conjunto.findOne({ _id: req.params.id, ativo: true });
    if (!conjunto) return res.status(404).json({ msg: "Conjunto não encontrado." });
    if (!(await podeAcessarConjunto(req.userId, conjunto))) {
      return res.status(403).json({ msg: "Você não tem acesso a este conjunto." });
    }

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
const NIVEIS_FLUENCIA = ["A1", "A2", "B1", "B2"];
const NIVEIS_AVANCADOS = ["C1", "C2"];
// C1/C2 não têm curso próprio (não existe courseType "C1"/"C2" — ver backend/utils/tiposCurso.js)
// — são um bônus liberado só pra quem tem os 4 cursos de fluência (o combo "A1 ao B2" — ver
// backend/utils/precoPackPrestige.js#ativarPackPrestigeCombo, que ativa packPrestige nos 4 de
// uma vez) ou qualquer uma das provas TCF/DELF/DALF/TEF. B2 sozinho NÃO libera C1/C2.
const CURSOS_ELEGIVEIS_AVANCADO_EXAME = ["TCF", "DELF", "DALF", "TEF"];
function elegivelParaNiveisAvancados(cursosComAcessoPlataforma) {
  const comboCompleto = NIVEIS_FLUENCIA.every(c => cursosComAcessoPlataforma.includes(c));
  const viaExame = CURSOS_ELEGIVEIS_AVANCADO_EXAME.some(c => cursosComAcessoPlataforma.includes(c));
  return comboCompleto || viaExame;
}

router.post("/conjuntos/personalizado", exigirAcessoCurso("plataforma"), async (req, res) => {
  try {
    const { nome, niveis, materias, quantidade, tempoLimiteSegundos } = req.body;

    if (!Array.isArray(niveis) || !niveis.length) return res.status(400).json({ msg: "Selecione ao menos um nível." });
    if (!Array.isArray(materias) || !materias.length) return res.status(400).json({ msg: "Selecione ao menos uma categoria." });
    if (!QUANTIDADES_PERMITIDAS.includes(quantidade)) return res.status(400).json({ msg: "Quantidade deve ser 10, 20 ou 40." });

    // Cada nível de fluência (A1/A2/B1/B2) pedido precisa que a conta tenha Plataforma
    // liberada NAQUELE curso específico — não só no curso do contexto atual (req.courseType),
    // já que o Personalize agora deixa escolher entre todos os cursos de fluência que a conta
    // possui. C1/C2 têm sua própria checagem (não têm curso próprio, ver acima).
    const cursosComAcessoPlataforma = await cursosComAcesso(req.userId, "plataforma");
    const niveisForaDeAcesso = niveis.filter(n => NIVEIS_FLUENCIA.includes(n) && !cursosComAcessoPlataforma.includes(n));
    if (niveisForaDeAcesso.length) {
      return res.status(403).json({ msg: `Você não tem acesso ao(s) curso(s): ${niveisForaDeAcesso.join(", ")}.` });
    }
    if (niveis.some(n => NIVEIS_AVANCADOS.includes(n)) && !elegivelParaNiveisAvancados(cursosComAcessoPlataforma)) {
      return res.status(403).json({ msg: "Questões de nível C1/C2 são exclusivas para quem tem os 4 cursos de fluência (A1 ao B2) ou TCF/DELF/DALF/TEF." });
    }

    let questoes;
    try {
      questoes = await sortearQuestoes({ niveis, materias, quantidade, alunoId: req.userId });
    } catch (err) {
      if (err.status === 422) return res.status(422).json({ msg: err.message });
      throw err;
    }

    const conjunto = await Conjunto.create({
      nome: nome?.trim() || `Conjunto personalizado — ${niveis.join("+")}`,
      tipo: "personalizado",
      pool: "praticar",
      courseType: req.courseType,
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

// Exclusão (soft-delete, mesmo padrão de DELETE /admin/conjuntos/:id) restrita ao
// próprio aluno e só pra conjuntos que ELE criou — nunca deixa excluir um oficial. A
// query já filtra tipo+criadoPor no mesmo findOneAndUpdate, então tentar excluir um
// conjunto de outra pessoa (ou oficial) só devolve 404, sem vazar se o id existe.
router.delete("/conjuntos/:id", async (req, res) => {
  try {
    const conjunto = await Conjunto.findOneAndUpdate(
      { _id: req.params.id, tipo: "personalizado", criadoPor: req.userId, ativo: true },
      { ativo: false }
    );
    if (!conjunto) return res.status(404).json({ msg: "Conjunto personalizado não encontrado." });
    res.json({ msg: "Conjunto excluído." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// ===================== ADMIN/PROFESSOR: BANCO DE QUESTÕES (curadoria) =====================

router.get("/admin/questoes", exigirProfessor, async (req, res) => {
  try {
    const { nivel, materia, tipo, pool, busca, courseType, pendenteRevisao } = req.query;
    const filtro = { ativo: true };
    if (nivel) filtro.nivel = nivel;
    if (materia) filtro.materia = materia;
    if (tipo) filtro.tipo = tipo;
    if (pool) filtro.pool = pool;
    if (busca) filtro.enunciado = { $regex: busca, $options: "i" };
    if (pendenteRevisao === "1") filtro.pendenteRevisaoCourseType = true;
    else if (courseType) filtro.courseType = courseType;

    const questoes = await Questao.find(filtro).select("codigo pool nivel materia tipo courseType pendenteRevisaoCourseType enunciado").sort({ nivel: 1, materia: 1 }).limit(200);
    res.json(questoes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// ===================== ADMIN/PROFESSOR: CONJUNTOS OFICIAIS =====================

router.get("/admin/conjuntos", exigirProfessor, async (req, res) => {
  try {
    const filtro = { tipo: "oficial" };
    if (req.query.pendenteRevisao === "1") filtro.pendenteRevisao = true;
    else if (req.query.courseType) filtro.courseType = req.query.courseType;
    const conjuntos = await Conjunto.find(filtro).sort({ criadoEm: -1 });
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
    const { nome, descricao, questoes: questaoIds, tempoLimiteSegundos, dificuldade, pool, courseType } = req.body;
    if (!nome?.trim()) return res.status(400).json({ msg: "Informe o nome do conjunto." });
    if (!Array.isArray(questaoIds) || !questaoIds.length) return res.status(400).json({ msg: "Selecione ao menos uma questão." });
    if (courseType && !TIPOS_CURSO.includes(courseType)) return res.status(400).json({ msg: "Curso inválido." });

    const encontradas = await Questao.countDocuments({ _id: { $in: questaoIds } });
    if (encontradas !== questaoIds.length) return res.status(400).json({ msg: "Uma ou mais questões selecionadas não existem." });

    const filtros = await derivarFiltrosDeQuestoes(questaoIds);
    const conjunto = await Conjunto.create({
      nome: nome.trim(), descricao, tipo: "oficial", pool: pool === "simulado" ? "simulado" : "praticar", criadoPor: req.userId,
      courseType: courseType || null,
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

    const { nome, descricao, ativo, tempoLimiteSegundos, dificuldade, questoes: questaoIds, pool, courseType } = req.body;
    if (courseType !== undefined && courseType && !TIPOS_CURSO.includes(courseType)) return res.status(400).json({ msg: "Curso inválido." });
    if (nome !== undefined) conjunto.nome = nome;
    if (descricao !== undefined) conjunto.descricao = descricao;
    if (ativo !== undefined) conjunto.ativo = !!ativo;
    if (tempoLimiteSegundos !== undefined) conjunto.tempoLimiteSegundos = tempoLimiteSegundos || null;
    if (dificuldade !== undefined) conjunto.dificuldade = dificuldade;
    if (pool !== undefined) conjunto.pool = pool === "simulado" ? "simulado" : "praticar";
    if (courseType !== undefined) { conjunto.courseType = courseType || null; conjunto.pendenteRevisao = false; }

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
    if (!(await podeAcessarConjunto(req.userId, conjunto))) {
      return res.status(403).json({ msg: "Você não tem acesso a este conjunto." });
    }

    let sessao = await SessaoResolucao.findOne({ alunoId: req.userId, conjuntoId: conjunto._id });
    if (!sessao) {
      const questoesOrdenadas = conjunto.questoes.slice().sort((a, b) => a.ordem - b.ordem);
      sessao = await SessaoResolucao.create({
        alunoId: req.userId, conjuntoId: conjunto._id, courseType: conjunto.courseType,
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
    if (!(await podeAcessarConjunto(req.userId, conjunto))) {
      return res.status(403).json({ msg: "Você não tem acesso a este conjunto." });
    }
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
    const conjunto = await Conjunto.findById(sessao.conjuntoId);
    if (!conjunto || !(await podeAcessarConjunto(req.userId, conjunto))) {
      return res.status(403).json({ msg: "Você não tem acesso a este conjunto." });
    }

    const { index } = req.body;
    if (typeof index !== "number" || index < 0 || index >= sessao.respostas.length) {
      return res.status(400).json({ msg: "Índice de questão inválido." });
    }
    sessao.questaoAtualIndex = index;
    sessao.ultimaAtividadeEm = new Date();
    await sessao.save();

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
    const conjunto = await Conjunto.findById(sessao.conjuntoId);
    if (!conjunto || !(await podeAcessarConjunto(req.userId, conjunto))) {
      return res.status(403).json({ msg: "Você não tem acesso a este conjunto." });
    }

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
    if (!(await podeAcessarConjunto(req.userId, conjunto))) {
      return res.status(403).json({ msg: "Você não tem acesso a este conjunto." });
    }

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
      alunoId: req.userId, conjuntoId: conjunto._id, courseType: conjunto.courseType, numero,
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

// ===================== CADERNO DE REVISÃO =====================
// Só é possível adicionar uma questão DEPOIS que o conjunto foi respondido — por isso
// a rota de adicionar é presa a uma Tentativa (que só existe após "Enviar Conjunto"),
// nunca a uma SessaoResolucao em andamento. Remover não precisa desse contexto.

router.post("/tentativas/:tentativaId/questoes/:questaoId/caderno", async (req, res) => {
  try {
    const tentativa = await Tentativa.findOne({ _id: req.params.tentativaId, alunoId: req.userId });
    if (!tentativa) return res.status(404).json({ msg: "Tentativa não encontrada." });
    const pertence = tentativa.respostas.some(r => String(r.questaoId) === req.params.questaoId);
    if (!pertence) return res.status(400).json({ msg: "Esta questão não pertence a esta tentativa." });

    await CadernoErros.findOneAndUpdate(
      { alunoId: req.userId, questaoId: req.params.questaoId },
      { alunoId: req.userId, questaoId: req.params.questaoId, courseType: tentativa.courseType, motivo: "revisao_manual", origem: { tentativaId: tentativa._id, conjuntoId: tentativa.conjuntoId } },
      { upsert: true, setDefaultsOnInsert: true }
    );
    res.json({ msg: "Adicionada ao Caderno de Revisão." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.delete("/caderno/:questaoId", async (req, res) => {
  try {
    await CadernoErros.deleteOne({ alunoId: req.userId, questaoId: req.params.questaoId });
    res.json({ msg: "Removida do Caderno de Revisão." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.get("/caderno", async (req, res) => {
  try {
    const filtro = { alunoId: req.userId };
    if (req.query.courseType && TIPOS_CURSO.includes(req.query.courseType)) filtro.courseType = req.query.courseType;
    const itens = await CadernoErros.find(filtro).sort({ adicionadoEm: -1 });
    const questoes = await Questao.find({ _id: { $in: itens.map(i => i.questaoId) } });
    const porId = new Map(questoes.map(q => [String(q._id), q]));

    res.json(itens.map(item => {
      const q = porId.get(String(item.questaoId));
      return {
        _id: item._id, questaoId: item.questaoId, motivo: item.motivo, adicionadoEm: item.adicionadoEm,
        questao: q && {
          tipo: q.tipo, nivel: q.nivel, materia: q.materia, enunciado: q.enunciado, texto: q.texto,
          audio: q.audio, visual: q.visual, opcoes: q.opcoes, afirmacao: q.afirmacao,
          respostaCorreta: q.tipo === "vf" ? q.respostaVF : q.opcoes[q.indiceCorreta],
          explicacao: q.explicacao
        }
      };
    }).filter(item => item.questao)); // questão pode ter sido desativada — não quebra a listagem
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// ===================== ALUNO: ESTATÍSTICAS RESUMIDAS (usadas em minha-conta.html) =====================

// Mesmo algoritmo que já existia em minha-conta.html (client-side, sobre pq_eventos) —
// maior sequência de dias consecutivos terminando hoje ou ontem (não zera à meia-noite
// se o aluno já estudou hoje mas ainda não abriu a página de novo).
function diaISO(data) { return new Date(data).toISOString().slice(0, 10); }
function calcularSequenciaDiaria(dias) {
  const hoje = diaISO(Date.now());
  const ontem = diaISO(Date.now() - 86400000);
  if (!dias.includes(hoje) && !dias.includes(ontem)) return 0;
  const diasSet = new Set(dias);
  let cursor = dias.includes(hoje) ? new Date() : new Date(Date.now() - 86400000);
  let seq = 0;
  while (diasSet.has(diaISO(cursor.getTime()))) {
    seq++;
    cursor = new Date(cursor.getTime() - 86400000);
  }
  return seq;
}

router.get("/estatisticas", async (req, res) => {
  try {
    const filtroCurso = {};
    if (req.query.courseType && TIPOS_CURSO.includes(req.query.courseType)) filtroCurso.courseType = req.query.courseType;

    const [tentativas, conjuntosEmAndamento, tamanhoCaderno] = await Promise.all([
      Tentativa.find({ alunoId: req.userId, ...filtroCurso }).sort({ finalizadaEm: -1 }),
      SessaoResolucao.countDocuments({ alunoId: req.userId, ...filtroCurso }),
      CadernoErros.countDocuments({ alunoId: req.userId, ...filtroCurso })
    ]);

    const conjuntoIds = [...new Set(tentativas.map(t => String(t.conjuntoId)))];
    const questaoIds = [...new Set(tentativas.flatMap(t => t.respostas.map(r => String(r.questaoId))))];
    const [conjuntosDocs, questoesDocs] = await Promise.all([
      Conjunto.find({ _id: { $in: conjuntoIds } }).select("nome"),
      Questao.find({ _id: { $in: questaoIds } }).select("materia")
    ]);
    const nomePorConjunto = new Map(conjuntosDocs.map(c => [String(c._id), c.nome]));
    const materiaPorQuestao = new Map(questoesDocs.map(q => [String(q._id), q.materia]));

    const porConjunto = new Map();
    tentativas.forEach(t => {
      const chave = String(t.conjuntoId);
      if (!porConjunto.has(chave)) porConjunto.set(chave, []);
      porConjunto.get(chave).push(t);
    });
    const conjuntosRefeitos = [...porConjunto.values()].filter(lista => lista.length > 1).length;

    const percentuais = tentativas.map(t => t.percentualAcertos);
    const tempos = tentativas.map(t => t.tempoGastoSegundos);
    const diasComAtividade = [...new Set(tentativas.map(t => diaISO(t.finalizadaEm)))];

    const kpis = {
      conjuntosConcluidos: conjuntoIds.length, conjuntosEmAndamento, conjuntosRefeitos,
      totalTentativas: tentativas.length,
      mediaPercentualAcertos: percentuais.length ? Math.round(percentuais.reduce((a, b) => a + b, 0) / percentuais.length) : null,
      maiorNota: percentuais.length ? Math.max(...percentuais) : null,
      menorNota: percentuais.length ? Math.min(...percentuais) : null,
      tempoMedioSegundos: tempos.length ? Math.round(tempos.reduce((a, b) => a + b, 0) / tempos.length) : null,
      sequenciaDiasConsecutivos: calcularSequenciaDiaria(diasComAtividade),
      tamanhoCaderno
    };

    // Granular (1 linha por resposta, todas as tentativas) — é o que permite a pizza E
    // as barras por categoria serem filtráveis pelo mesmo seletor de conjunto no
    // cliente, sem precisar de mais endpoints nem reagregar no servidor a cada filtro.
    const respostas = tentativas.flatMap(t => {
      const conjuntoNome = nomePorConjunto.get(String(t.conjuntoId)) || "Conjunto removido";
      return t.respostas.map(r => ({
        conjuntoId: t.conjuntoId, conjuntoNome,
        materia: materiaPorQuestao.get(String(r.questaoId)) || null,
        correta: r.correta
      }));
    });

    const tentativasResumo = tentativas.map(t => ({
      _id: t._id, conjuntoId: t.conjuntoId, conjuntoNome: nomePorConjunto.get(String(t.conjuntoId)) || "Conjunto removido",
      numero: t.numero, totalCorretas: t.totalCorretas, totalQuestoes: t.totalQuestoes,
      percentualAcertos: t.percentualAcertos, tempoGastoSegundos: t.tempoGastoSegundos, finalizadaEm: t.finalizadaEm
    }));

    const porDia = new Map();
    tentativas.forEach(t => {
      const dia = diaISO(t.finalizadaEm);
      if (!porDia.has(dia)) porDia.set(dia, []);
      porDia.get(dia).push(t.percentualAcertos);
    });
    const evolucao = [...porDia.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-30)
      .map(([data, valores]) => ({ data, percentualMedio: Math.round(valores.reduce((a, b) => a + b, 0) / valores.length), quantidade: valores.length }));

    res.json({ kpis, tentativas: tentativasResumo, respostas, evolucao });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

module.exports = router;
