const express = require("express");
const router = express.Router();
const User = require("../models/user");
const Producao = require("../models/producao");
const Matricula = require("../models/matricula");
const Turma = require("../models/turma");
const Modulo = require("../models/modulo");
const Certificado = require("../models/certificado");
const HistoricoAluno = require("../models/historicoAluno");
const { exigirAuth, exigirProfessor } = require("../middleware/auth");
const { obterPlanosDoAluno } = require("../utils/planosAluno");
const { calcularEstatisticasAluno } = require("../utils/estatisticasAluno");

router.use(exigirAuth, exigirProfessor);

const PRODUCAO_PENDENTE_STATUS = ["em_fila", "aguardando_envio", "enviado"];
const CORRECAO_PENDENTE_STATUS = ["em_correcao", "aguardando_revisao"];

// Busca as matrículas de turma confirmadas de um conjunto de alunos, já com a
// Turma populada — usado tanto para a categorização ativo/expirado quanto
// para os filtros de curso/professor.
async function matriculasTurmaPorAluno(alunoIds) {
  const matriculas = await Matricula.find({
    alunoId: { $in: alunoIds }, tipo: "turma", status: "confirmada"
  }).populate("turmaId").lean();
  const mapa = {};
  matriculas.forEach(m => {
    const chave = String(m.alunoId);
    if (!mapa[chave]) mapa[chave] = [];
    mapa[chave].push(m);
  });
  return mapa;
}

// ===================== OPÇÕES DE FILTRO =====================
router.get("/filtros-opcoes", async (req, res) => {
  try {
    const [cursosModulo, cursosPlano, cursosMatricula, niveisTurma, provasPerfil, provasTurma, professores] = await Promise.all([
      Modulo.distinct("curso", { curso: { $ne: null } }),
      User.distinct("plano.curso", { "plano.curso": { $ne: null } }),
      Matricula.distinct("curso", { curso: { $ne: null } }),
      Turma.distinct("nivel"),
      User.distinct("perfil.provaAlvo", { "perfil.provaAlvo": { $ne: null } }),
      Turma.distinct("tipoProva", { tipoProva: { $ne: "" } }),
      User.find({ role: { $in: ["professor", "admin"] } }).select("nome").sort({ nome: 1 })
    ]);

    const cursos = [...new Set([...cursosModulo, ...cursosPlano, ...cursosMatricula, ...niveisTurma])].filter(Boolean).sort();
    const tiposProva = [...new Set([...provasPerfil, ...provasTurma])].filter(Boolean).sort();

    res.json({
      cursos, tiposProva,
      tiers: ["Essentiel", "Avancé", "Excellence"],
      professores: professores.map(p => ({ _id: p._id, nome: p.nome }))
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// ===================== LISTAR ALUNOS (roster) =====================
router.get("/alunos", async (req, res) => {
  try {
    const { busca, status, plano, curso, tipoProva, professorId, producaoPendente, correcaoPendente } = req.query;

    const filtro = { role: "aluno" };
    if (busca) {
      filtro.$or = [
        { nome: { $regex: busca, $options: "i" } },
        { email: { $regex: busca, $options: "i" } },
        { telefone: { $regex: busca, $options: "i" } },
        { whatsapp: { $regex: busca, $options: "i" } }
      ];
    }

    const alunos = await User.find(filtro)
      .select("nome email telefone whatsapp plano produtosAvulsos creditosCorrecao perfil.provaAlvo perfil.dataProva perfil.foto criadoEm ultimoAcessoEm")
      .sort({ nome: 1 })
      .lean();

    const alunoIds = alunos.map(a => a._id);
    const [matriculasPorAluno, matriculasParticularPorAluno, contagensProducoes, pendentesIds, correcaoIds] = await Promise.all([
      matriculasTurmaPorAluno(alunoIds),
      Matricula.find({ alunoId: { $in: alunoIds }, tipo: "particular", status: "confirmada", professorId: { $ne: null } })
        .select("alunoId professorId").lean(),
      Producao.aggregate([{ $match: { alunoId: { $in: alunoIds } } }, { $group: { _id: "$alunoId", total: { $sum: 1 } } }]),
      Producao.distinct("alunoId", { alunoId: { $in: alunoIds }, status: { $in: PRODUCAO_PENDENTE_STATUS } }),
      Producao.distinct("alunoId", { alunoId: { $in: alunoIds }, status: { $in: CORRECAO_PENDENTE_STATUS } })
    ]);

    const mapaContagem = {};
    contagensProducoes.forEach(c => { mapaContagem[String(c._id)] = c.total; });
    const pendentesSet = new Set(pendentesIds.map(String));
    const correcaoSet = new Set(correcaoIds.map(String));
    const professorParticularPorAluno = {};
    matriculasParticularPorAluno.forEach(m => {
      const chave = String(m.alunoId);
      if (!professorParticularPorAluno[chave]) professorParticularPorAluno[chave] = [];
      professorParticularPorAluno[chave].push(String(m.professorId));
    });

    let enriquecidos = alunos.map(a => {
      const chave = String(a._id);
      const turmasDoAluno = matriculasPorAluno[chave] || [];
      const planos = obterPlanosDoAluno(a, turmasDoAluno);
      const ativo = planos.some(p => p.ativo);
      const cursosDoAluno = new Set(planos.map(p => p.curso).filter(Boolean));
      if (a.perfil?.provaAlvo) cursosDoAluno.add(a.perfil.provaAlvo);
      const professoresDoAluno = new Set(professorParticularPorAluno[chave] || []);
      turmasDoAluno.forEach(m => { if (m.turmaId?.professorId) professoresDoAluno.add(String(m.turmaId.professorId)); });

      return {
        _id: a._id, nome: a.nome, email: a.email, telefone: a.telefone, whatsapp: a.whatsapp,
        plano: a.plano, creditosCorrecao: a.creditosCorrecao,
        provaAlvo: a.perfil?.provaAlvo, dataProva: a.perfil?.dataProva, foto: a.perfil?.foto || null, criadoEm: a.criadoEm,
        ultimoAcessoEm: a.ultimoAcessoEm,
        totalProducoes: mapaContagem[chave] || 0,
        ativo, planos,
        temProducaoPendente: pendentesSet.has(chave),
        temCorrecaoPendente: correcaoSet.has(chave),
        _cursos: cursosDoAluno, _professores: professoresDoAluno
      };
    });

    if (plano) enriquecidos = enriquecidos.filter(a => a.plano?.tier === plano);
    if (curso) enriquecidos = enriquecidos.filter(a => a._cursos.has(curso));
    if (tipoProva) enriquecidos = enriquecidos.filter(a => a.provaAlvo === tipoProva || a._cursos.has(tipoProva));
    if (professorId) enriquecidos = enriquecidos.filter(a => a._professores.has(professorId));
    if (producaoPendente === "true") enriquecidos = enriquecidos.filter(a => a.temProducaoPendente);
    if (correcaoPendente === "true") enriquecidos = enriquecidos.filter(a => a.temCorrecaoPendente);

    const totalAtivos = enriquecidos.filter(a => a.ativo).length;
    const totalExpirados = enriquecidos.filter(a => !a.ativo).length;

    if (status === "ativo") enriquecidos = enriquecidos.filter(a => a.ativo);
    else if (status === "expirado") enriquecidos = enriquecidos.filter(a => !a.ativo);

    const resultado = enriquecidos.map(({ _cursos, _professores, ...resto }) => resto);
    res.json({ alunos: resultado, totalAtivos, totalExpirados, total: totalAtivos + totalExpirados });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// ===================== DETALHE DE UM ALUNO =====================
router.get("/alunos/:id", async (req, res) => {
  try {
    const aluno = await User.findOne({ _id: req.params.id, role: "aluno" })
      .select("nome email telefone whatsapp plano produtosAvulsos perfil preferencias creditosCorrecao criadoEm ultimoAcessoEm primeiroLoginEm");
    if (!aluno) return res.status(404).json({ msg: "Aluno não encontrado." });

    const turmasDoAluno = (await matriculasTurmaPorAluno([aluno._id]))[String(aluno._id)] || [];
    const planos = obterPlanosDoAluno(aluno, turmasDoAluno);

    const [estatisticas, certificado, eventos] = await Promise.all([
      calcularEstatisticasAluno(aluno._id),
      Certificado.findOne({ userId: aluno._id }),
      HistoricoAluno.find({ alunoId: aluno._id }).sort({ data: 1 })
    ]);

    const historico = [
      { tipo: "conta_criada", titulo: "Conta criada", data: aluno.criadoEm }
    ];
    if (aluno.primeiroLoginEm) historico.push({ tipo: "primeiro_login", titulo: "Primeiro login", data: aluno.primeiroLoginEm });
    if (estatisticas.producoes.length) {
      const primeira = estatisticas.producoes[estatisticas.producoes.length - 1];
      historico.push({
        tipo: "primeira_producao", titulo: "Primeira redação enviada",
        descricao: primeira.temaId?.titulo, data: primeira.dataEnvio
      });
    }
    if (certificado) historico.push({ tipo: "conclusao_curso", titulo: "Curso concluído", data: certificado.emitidoEm });
    eventos.forEach(e => historico.push({ tipo: e.tipo, titulo: e.titulo, descricao: e.descricao, data: e.data }));
    historico.sort((a, b) => new Date(a.data) - new Date(b.data));

    res.json({
      aluno: {
        _id: aluno._id, nome: aluno.nome, email: aluno.email, telefone: aluno.telefone, whatsapp: aluno.whatsapp,
        criadoEm: aluno.criadoEm, ultimoAcessoEm: aluno.ultimoAcessoEm,
        idioma: aluno.preferencias?.idioma, tema: aluno.preferencias?.tema,
        foto: aluno.perfil?.foto, provaAlvo: aluno.perfil?.provaAlvo, dataProva: aluno.perfil?.dataProva,
        bio: aluno.perfil?.bio, interesses: aluno.perfil?.interesses,
        creditosCorrecao: aluno.creditosCorrecao, plano: aluno.plano
      },
      planos,
      estatisticas: {
        aulasAssistidas: estatisticas.aulasAssistidas,
        tempoAssistidoSegundos: estatisticas.tempoAssistidoSegundos,
        streakDias: estatisticas.streakDias,
        redacoesEnviadas: estatisticas.redacoesEnviadas,
        corrigidas: estatisticas.corrigidas,
        emAndamento: estatisticas.emAndamento,
        notaMedia: estatisticas.notaMedia,
        evolucaoNotas: estatisticas.evolucaoNotas,
        porCriterio: estatisticas.porCriterio,
        porStatus: estatisticas.porStatusProducoes,
        ultimaAula: estatisticas.ultimaAula,
        proximaAulaRecomendada: estatisticas.proximaAulaRecomendada
      },
      progressaoAulas: estatisticas.progressaoPorCurso,
      producoes: estatisticas.producoes,
      historico
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

module.exports = router;
