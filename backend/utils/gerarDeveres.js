const PlanoBase = require("../models/planoBase");
const DeverSemanal = require("../models/deverSemanal");
const Turma = require("../models/turma");
const User = require("../models/user");
const AtribuicaoPlanoBase = require("../models/atribuicaoPlanoBase");

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
    conteudo: a.conteudo ? {
      url: a.conteudo.url, texto: a.conteudo.texto, arquivo: a.conteudo.arquivo,
      temaId: a.conteudo.temaId, aulaId: a.conteudo.aulaId, moduloId: a.conteudo.moduloId
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

// Anota cada atividade com o rótulo de atraso, calculado na leitura (nunca
// gravado) a partir de dataLimite/enviadoEm: "pendente em atraso" (nunca
// entregue e o prazo já venceu) ou "entregue com atraso" (entregou depois do
// prazo). Usado pra montar a resposta das rotas de listagem/detalhe.
function enriquecerDever(deverDoc) {
  const dever = deverDoc.toObject ? deverDoc.toObject() : deverDoc;
  const venceu = new Date(dever.dataLimite) < new Date();
  dever.status = statusDever(dever);
  dever.podeConcluir = podeConcluir(dever);
  dever.atividades = dever.atividades.map(a => ({
    ...a,
    entrega: {
      ...a.entrega,
      atrasada: a.entrega?.status === "pendente" && venceu,
      entregueComAtraso: a.entrega?.status === "enviado" && a.entrega?.enviadoEm && new Date(a.entrega.enviadoEm) > new Date(dever.dataLimite)
    }
  }));
  return dever;
}

module.exports = { gerarSemanasPendentes, atualizarSemanasDoAluno, statusDever, podeConcluir, enriquecerDever };
