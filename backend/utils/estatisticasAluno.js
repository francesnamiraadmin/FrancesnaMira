const ProgressoAula = require("../models/progressoAula");
const Aula = require("../models/aula");
const Modulo = require("../models/modulo");
const Producao = require("../models/producao");

// Maior sequência de dias consecutivos com pelo menos uma atividade (assistir
// aula ou enviar produção). Não existe log de atividade dedicado — isso é uma
// aproximação a partir dos timestamps que já existem nessas duas coleções.
function calcularStreak(datas) {
  const diasUnicos = [...new Set(datas.filter(Boolean).map(d => new Date(d).toISOString().slice(0, 10)))].sort();
  if (!diasUnicos.length) return 0;
  let maior = 1, atual = 1;
  for (let i = 1; i < diasUnicos.length; i++) {
    const diffDias = Math.round((new Date(diasUnicos[i]) - new Date(diasUnicos[i - 1])) / (24 * 60 * 60 * 1000));
    if (diffDias === 1) { atual++; maior = Math.max(maior, atual); }
    else if (diffDias > 1) { atual = 1; }
  }
  return maior;
}

async function estatisticasAulas(userId) {
  const progresso = await ProgressoAula.find({ userId }).lean();
  if (!progresso.length) {
    return {
      aulasAssistidas: 0, tempoAssistidoSegundos: 0, progressaoPorCurso: [],
      ultimaAula: null, proximaAulaRecomendada: null, datasAtividade: []
    };
  }

  const aulaIds = progresso.map(p => p.aulaId);
  const aulas = await Aula.find({ _id: { $in: aulaIds } }).select("titulo moduloId").lean();
  const aulaMap = Object.fromEntries(aulas.map(a => [String(a._id), a]));

  const moduloIds = [...new Set(aulas.map(a => String(a.moduloId)))];
  const modulos = await Modulo.find({ _id: { $in: moduloIds } }).select("titulo curso").lean();
  const moduloMap = Object.fromEntries(modulos.map(m => [String(m._id), m]));

  const aulasAssistidas = progresso.filter(p => p.concluida).length;
  const tempoAssistidoSegundos = progresso.reduce((acc, p) => acc + (p.ultimaPosicaoSegundos || 0), 0);

  const cursos = [...new Set(modulos.map(m => m.curso).filter(Boolean))];
  const progressaoPorCurso = [];
  for (const curso of cursos) {
    const modulosDoCurso = modulos.filter(m => m.curso === curso).map(m => m._id);
    const totalAulasCurso = await Aula.countDocuments({ moduloId: { $in: modulosDoCurso }, ativo: true });
    const concluidasCurso = progresso.filter(p => p.concluida && moduloMap[String(p.moduloId)]?.curso === curso).length;
    progressaoPorCurso.push({
      curso, concluidas: concluidasCurso, total: totalAulasCurso,
      percentual: totalAulasCurso ? Math.round((concluidasCurso / totalAulasCurso) * 100) : 0
    });
  }

  const maisRecente = progresso.slice().sort((a, b) => new Date(b.ultimoAcessoEm) - new Date(a.ultimoAcessoEm))[0];
  const ultimaAula = maisRecente ? {
    titulo: aulaMap[String(maisRecente.aulaId)]?.titulo || "Aula removida",
    data: maisRecente.ultimoAcessoEm,
    concluida: maisRecente.concluida
  } : null;

  const moduloIdsEnvolvidos = [...new Set(progresso.map(p => String(p.moduloId)))];
  const aulasEnvolvidas = await Aula.find({ moduloId: { $in: moduloIdsEnvolvidos }, ativo: true })
    .select("titulo moduloId ordem").sort({ moduloId: 1, ordem: 1 }).lean();
  const concluidaSet = new Set(progresso.filter(p => p.concluida).map(p => String(p.aulaId)));
  const proxima = aulasEnvolvidas.find(a => !concluidaSet.has(String(a._id)));
  const proximaAulaRecomendada = proxima ? {
    titulo: proxima.titulo, moduloTitulo: moduloMap[String(proxima.moduloId)]?.titulo || null
  } : null;

  return {
    aulasAssistidas, tempoAssistidoSegundos, progressaoPorCurso, ultimaAula, proximaAulaRecomendada,
    datasAtividade: progresso.map(p => p.ultimoAcessoEm)
  };
}

async function estatisticasProducoes(userId) {
  const producoes = await Producao.find({ alunoId: userId })
    .populate("temaId", "titulo exame nivel")
    .populate("professorId", "nome")
    .sort({ criadoEm: -1 });

  const corrigidas = producoes.filter(p => p.avaliacao?.notaTotal !== undefined);
  const evolucaoNotas = corrigidas
    .filter(p => p.dataCorrecao)
    .sort((a, b) => new Date(a.dataCorrecao) - new Date(b.dataCorrecao))
    .map(p => ({ data: p.dataCorrecao, nota: p.avaliacao.notaTotal, tema: p.temaId?.titulo }));

  const mediaPorCriterio = {};
  corrigidas.forEach(p => {
    (p.avaliacao.criterios || []).forEach(c => {
      if (!mediaPorCriterio[c.nome]) mediaPorCriterio[c.nome] = { soma: 0, n: 0 };
      mediaPorCriterio[c.nome].soma += c.nota;
      mediaPorCriterio[c.nome].n += 1;
    });
  });
  const porCriterio = Object.entries(mediaPorCriterio).map(([nome, v]) => ({
    nome, media: Math.round((v.soma / v.n) * 10) / 10
  }));

  const porStatus = {};
  producoes.forEach(p => { porStatus[p.status] = (porStatus[p.status] || 0) + 1; });

  const notaMedia = corrigidas.length
    ? Math.round((corrigidas.reduce((acc, p) => acc + p.avaliacao.notaTotal, 0) / corrigidas.length) * 10) / 10
    : null;

  return {
    producoes, total: producoes.length, porStatus, notaMedia, evolucaoNotas, porCriterio,
    datasEnvio: producoes.map(p => p.dataEnvio)
  };
}

async function calcularEstatisticasAluno(userId) {
  const [aulas, producoes] = await Promise.all([estatisticasAulas(userId), estatisticasProducoes(userId)]);
  const streakDias = calcularStreak([...aulas.datasAtividade, ...producoes.datasEnvio]);

  return {
    aulasAssistidas: aulas.aulasAssistidas,
    tempoAssistidoSegundos: aulas.tempoAssistidoSegundos,
    progressaoPorCurso: aulas.progressaoPorCurso,
    ultimaAula: aulas.ultimaAula,
    proximaAulaRecomendada: aulas.proximaAulaRecomendada,
    streakDias,
    redacoesEnviadas: producoes.total,
    corrigidas: producoes.porStatus.corrigido || 0,
    emAndamento: (producoes.porStatus.em_fila || 0) + (producoes.porStatus.em_correcao || 0) + (producoes.porStatus.aguardando_revisao || 0),
    notaMedia: producoes.notaMedia,
    evolucaoNotas: producoes.evolucaoNotas,
    porCriterio: producoes.porCriterio,
    producoes: producoes.producoes,
    porStatusProducoes: producoes.porStatus
  };
}

module.exports = { calcularEstatisticasAluno, estatisticasAulas, estatisticasProducoes };
