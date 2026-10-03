const PlanoBase = require("../models/planoBase");
const DeverSemanal = require("../models/deverSemanal");
const Turma = require("../models/turma");
const User = require("../models/user");
const AtribuicaoPlanoBase = require("../models/atribuicaoPlanoBase");
const Aula = require("../models/aula");
const Producao = require("../models/producao");
const ProgressoAula = require("../models/progressoAula");
const Tentativa = require("../models/tentativa");

const DIA_MS = 24 * 60 * 60 * 1000;

// Não existe um campo único de "fim de matrícula" no projeto — turma e plano
// de curso guardam isso em lugares diferentes. Ler "ao vivo" (não congelado no
// momento da atribuição) significa que uma renovação de plano libera mais
// semanas automaticamente, sem precisar readequar a atribuição.
async function dataFimMatricula(atribuicao) {
  if (atribuicao.vinculoTipo === "turma") {
    if (!atribuicao.turmaId) return null;
    const turma = await Turma.findById(atribuicao.turmaId).select("dataFim");
    return turma?.dataFim || null;
  }
  const user = await User.findById(atribuicao.alunoId).select("plano.dataVencimento planos");
  // atribuição ligada a um curso: termina com o plano daquele curso
  if (atribuicao.curso) {
    const p = (user?.planos || []).filter(x => x.courseType === atribuicao.curso).sort((a, b) => new Date(b.expiraEm || b.dataVencimento || 0) - new Date(a.expiraEm || a.dataVencimento || 0))[0];
    return p ? (p.expiraEm || p.dataVencimento || null) : null;
  }
  return user?.plano?.dataVencimento || null;
}

// Copia o conteúdo inteiro de cada atividade (tema, aula, conjunto, sujet do Ambiente, perfil…).
function copiarAtividades(atividadesTemplate) {
  return (atividadesTemplate || []).map(a => {
    const c = a.conteudo ? (a.conteudo.toObject ? a.conteudo.toObject() : { ...a.conteudo }) : undefined;
    return {
      tipo: a.tipo, titulo: a.titulo, descricao: a.descricao, obrigatoria: a.obrigatoria,
      dependeDe: a.dependeDe ?? null, conteudo: c, entrega: { status: "pendente" }
    };
  });
}

// Atribuição-base: quem tem plano ativo de um curso com Atribuição-base recebe aquele Plano-Base
// (uma vez só, a partir do dia em que é aplicada).
function cursosAtivos(user) {
  const agora = Date.now();
  return [...new Set((user?.planos || []).filter(p => p.ativo !== false && (!(p.expiraEm || p.dataVencimento) || new Date(p.expiraEm || p.dataVencimento).getTime() > agora)).map(p => p.courseType).filter(Boolean))];
}
async function aplicarAtribuicoesBase(alunoId) {
  const AtribuicaoBaseCurso = require("../models/atribuicaoBaseCurso");
  const user = await User.findById(alunoId).select("planos role").lean();
  if (!user || (user.role && user.role !== "aluno")) return 0;
  const cursos = cursosAtivos(user);
  if (!cursos.length) return 0;
  const bases = await AtribuicaoBaseCurso.find({ curso: { $in: cursos } }).lean();
  let n = 0;
  for (const b of bases) {
    const ja = await AtribuicaoPlanoBase.findOne({ alunoId, origem: "base", curso: b.curso, planoBaseId: b.planoBaseId }).select("_id").lean();
    if (ja) continue;
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    await AtribuicaoPlanoBase.create({ alunoId, planoBaseId: b.planoBaseId, dataInicio: hoje, vinculoTipo: "plano_curso", curso: b.curso, origem: "base" });
    n++;
  }
  return n;
}

// Materializa (cria no banco) toda semana do Plano-Base cuja hora já chegou e
// que ainda não existe para este aluno — chamada sob demanda (sem cron) no
// início das rotas de listagem, tanto do admin quanto do aluno.
async function gerarSemanasPendentes(atribuicao) {
  if (!atribuicao || !atribuicao.ativo) return [];

  const planoBase = await PlanoBase.findById(atribuicao.planoBaseId);
  if (!planoBase) return [];

  const fimMatricula = await dataFimMatricula(atribuicao);
  const hoje = new Date();

  const existentes = await DeverSemanal.find({ alunoId: atribuicao.alunoId, planoBaseId: atribuicao.planoBaseId })
    .select("numeroSemana").sort({ numeroSemana: -1 }).limit(1);
  const ultimaGerada = existentes[0]?.numeroSemana || 0;

  const semanasTemplate = planoBase.semanas.slice().sort((a, b) => a.numero - b.numero);
  const criadas = [];

  for (const semana of semanasTemplate) {
    if (semana.numero <= ultimaGerada) continue;

    const dataInicio = new Date(atribuicao.dataInicio.getTime() + (semana.numero - 1) * 7 * DIA_MS);
    if (dataInicio > hoje) break; // ainda não chegou a hora desta semana

    if (fimMatricula && dataInicio > fimMatricula) {
      atribuicao.ativo = false;
      await atribuicao.save();
      break;
    }

    const dataLimite = new Date(dataInicio.getTime() + 6 * DIA_MS);
    const dever = await DeverSemanal.create({
      alunoId: atribuicao.alunoId,
      planoBaseId: atribuicao.planoBaseId,
      numeroSemana: semana.numero,
      titulo: semana.titulo,
      curso: planoBase.curso || atribuicao.curso || null,
      dataInicio, dataLimite,
      atividades: copiarAtividades(semana.atividades)
    });
    criadas.push(dever);
  }

  return criadas;
}

// Verifica (e materializa, se preciso) as semanas pendentes da atribuição
// ativa de um aluno — usado no topo das rotas de listagem.
async function atualizarSemanasDoAluno(alunoId) {
  await aplicarAtribuicoesBase(alunoId);
  // um aluno pode ter mais de um Plano-Base ativo (ex.: o da Atribuição-base do TCF e um extra)
  const atribuicoes = await AtribuicaoPlanoBase.find({ alunoId, ativo: true });
  for (const a of atribuicoes) await gerarSemanasPendentes(a);
}

function statusDever(dever) {
  if (dever.concluidoEm) return "concluido";
  if (new Date(dever.dataLimite) < new Date()) return "atrasado";
  return "em_andamento";
}

function podeConcluir(dever) {
  if (dever.permiteConclusaoManual) return true;
  return dever.atividades.filter(a => a.obrigatoria).every(a => a.entrega?.status === "enviado");
}

// Pro princípio "não duplicar dados" (ver plano da Fase 3A): atividades
// ligadas a uma entidade real da plataforma não guardam seu próprio status —
// ele é calculado aqui, na leitura, a partir de ProgressoAula/Producao.
// Retorna null quando o tipo não tem entidade real (usa o `entrega` gravado
// normalmente).
async function statusEntregaReal(atividade, alunoId) {
  if (atividade.tipo === "assistir_aula" && atividade.conteudo?.aulaId) {
    const aulaId = atividade.conteudo.aulaId._id || atividade.conteudo.aulaId;
    const progresso = await ProgressoAula.findOne({ userId: alunoId, aulaId }).select("concluida ultimaPosicaoSegundos");
    return {
      status: progresso?.concluida ? "enviado" : "pendente",
      progressoReal: progresso ? { concluida: progresso.concluida, ultimaPosicaoSegundos: progresso.ultimaPosicaoSegundos } : null
    };
  }
  if (atividade.tipo === "assistir_modulo" && atividade.conteudo?.moduloId) {
    const moduloId = atividade.conteudo.moduloId._id || atividade.conteudo.moduloId;
    const aulas = await Aula.find({ moduloId, ativo: true }).select("_id");
    if (!aulas.length) return { status: "pendente", progressoReal: { concluidas: 0, total: 0 } };
    const concluidas = await ProgressoAula.countDocuments({ userId: alunoId, aulaId: { $in: aulas.map(a => a._id) }, concluida: true });
    return { status: concluidas >= aulas.length ? "enviado" : "pendente", progressoReal: { concluidas, total: aulas.length } };
  }
  if (["producao_textual", "producao_oral"].includes(atividade.tipo) && atividade.entrega?.linkProducaoId) {
    const producao = await Producao.findById(atividade.entrega.linkProducaoId).select("status avaliacao.notaTotal");
    if (!producao) return null;
    return { status: "enviado", producaoReal: { status: producao.status, notaTotal: producao.avaliacao?.notaTotal ?? null } };
  }
  if (atividade.tipo === "producao_ambiente") return require("./devoirsSync").statusAtividade(atividade, alunoId);
  if (["questoes_plataforma", "exercicio_lista", "simulado"].includes(atividade.tipo) && atividade.conteudo?.conjuntoId) {
    const conjuntoId = atividade.conteudo.conjuntoId._id || atividade.conteudo.conjuntoId;
    const tentativa = await Tentativa.findOne({ alunoId, conjuntoId }).sort({ finalizadaEm: -1 }).select("percentualAcertos finalizadaEm");
    return {
      status: tentativa ? "enviado" : "pendente",
      tentativaReal: tentativa ? { _id: tentativa._id, percentualAcertos: tentativa.percentualAcertos, finalizadaEm: tentativa.finalizadaEm } : null
    };
  }
  return null;
}

// Anota cada atividade com status real (quando aplicável), rótulo de atraso
// (calculado na leitura a partir de dataLimite/enviadoEm — nunca gravado) e
// se está bloqueada por dependência. Usado pra montar a resposta das rotas
// de listagem/detalhe, tanto do admin quanto do aluno.
async function enriquecerDever(deverDoc) {
  const dever = deverDoc.toObject ? deverDoc.toObject() : deverDoc;
  const venceu = new Date(dever.dataLimite) < new Date();

  const atividades = await Promise.all(dever.atividades.map(async a => {
    const derivado = await statusEntregaReal(a, dever.alunoId);
    const status = derivado?.status ?? a.entrega?.status ?? "pendente";
    return {
      ...a,
      entrega: {
        ...a.entrega,
        status,
        atrasada: status === "pendente" && venceu,
        entregueComAtraso: status === "enviado" && a.entrega?.enviadoEm && new Date(a.entrega.enviadoEm) > new Date(dever.dataLimite)
      },
      ...(derivado?.progressoReal !== undefined ? { progressoReal: derivado.progressoReal } : {}),
      ...(derivado?.producaoReal !== undefined ? { producaoReal: derivado.producaoReal } : {}),
      ...(derivado?.tentativaReal !== undefined ? { tentativaReal: derivado.tentativaReal } : {}),
      ...(derivado?.devoirReal !== undefined ? { devoirReal: derivado.devoirReal } : {})
    };
  }));

  atividades.forEach((a, i) => {
    a.bloqueada = a.dependeDe != null && atividades[a.dependeDe]?.entrega?.status !== "enviado";
  });

  dever.atividades = atividades;
  dever.status = statusDever(dever);
  dever.podeConcluir = podeConcluir(dever);
  return dever;
}

// « Adiantar Dever »: em cada Plano-Base ativo do aluno, se todas as semanas já liberadas estão
// concluídas e ainda há semanas no plano, a próxima pode ser feita antes da data.
async function semanasAdiantaveis(alunoId) {
  const atribuicoes = await AtribuicaoPlanoBase.find({ alunoId, ativo: true }).lean();
  const out = [];
  for (const a of atribuicoes) {
    const plano = await PlanoBase.findById(a.planoBaseId).select("nome curso semanas.numero semanas.titulo semanas.atividades.tipo").lean();
    if (!plano || !plano.semanas || !plano.semanas.length) continue;
    const geradas = await DeverSemanal.find({ alunoId, planoBaseId: a.planoBaseId }).select("numeroSemana concluidoEm").lean();
    if (geradas.some(d => !d.concluidoEm)) continue;
    const ultima = geradas.reduce((m, d) => Math.max(m, d.numeroSemana || 0), 0);
    const prox = plano.semanas.slice().sort((x, y) => x.numero - y.numero).find(s => s.numero > ultima);
    if (!prox) continue;
    out.push({ atribuicaoId: String(a._id), plano: plano.nome, curso: plano.curso || a.curso || "", numero: prox.numero, titulo: prox.titulo, atividades: (prox.atividades || []).length,
      dataPrevista: new Date(new Date(a.dataInicio).getTime() + (prox.numero - 1) * 7 * DIA_MS) });
  }
  return out;
}
async function adiantarSemana(alunoId, atribuicaoId) {
  const lista = await semanasAdiantaveis(alunoId);
  const alvo = lista.find(x => x.atribuicaoId === String(atribuicaoId));
  if (!alvo) throw Object.assign(new Error("x"), { status: 400, msg: "Não há semana para adiantar: conclua as semanas já liberadas primeiro." });
  const a = await AtribuicaoPlanoBase.findById(atribuicaoId);
  const plano = await PlanoBase.findById(a.planoBaseId);
  const semana = plano.semanas.find(s => s.numero === alvo.numero);
  const agora = new Date();
  const limitePrevisto = new Date(new Date(a.dataInicio).getTime() + ((semana.numero - 1) * 7 + 6) * DIA_MS);
  return DeverSemanal.create({
    alunoId, planoBaseId: a.planoBaseId, numeroSemana: semana.numero, titulo: semana.titulo, curso: plano.curso || a.curso || null,
    dataInicio: agora, dataLimite: limitePrevisto > agora ? limitePrevisto : new Date(agora.getTime() + 6 * DIA_MS),
    atividades: copiarAtividades(semana.atividades)
  });
}

module.exports = { semanasAdiantaveis, adiantarSemana, gerarSemanasPendentes, atualizarSemanasDoAluno, statusDever, podeConcluir, enriquecerDever, aplicarAtribuicoesBase, copiarAtividades, cursosAtivos };
