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
  const user = await User.findById(atribuicao.alunoId).select("plano.dataVencimento");
  return user?.plano?.dataVencimento || null;
}

function copiarAtividades(atividadesTemplate) {
  return (atividadesTemplate || []).map(a => ({
    tipo: a.tipo, titulo: a.titulo, descricao: a.descricao, obrigatoria: a.obrigatoria,
    dependeDe: a.dependeDe ?? null,
    conteudo: a.conteudo ? {
      url: a.conteudo.url, texto: a.conteudo.texto, arquivo: a.conteudo.arquivo,
      temaId: a.conteudo.temaId, aulaId: a.conteudo.aulaId, moduloId: a.conteudo.moduloId,
      conjuntoId: a.conteudo.conjuntoId
    } : undefined,
    entrega: { status: "pendente" }
  }));
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
  const atribuicao = await AtribuicaoPlanoBase.findOne({ alunoId, ativo: true });
  if (atribuicao) await gerarSemanasPendentes(atribuicao);
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
      ...(derivado?.tentativaReal !== undefined ? { tentativaReal: derivado.tentativaReal } : {})
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

module.exports = { gerarSemanasPendentes, atualizarSemanasDoAluno, statusDever, podeConcluir, enriquecerDever };
