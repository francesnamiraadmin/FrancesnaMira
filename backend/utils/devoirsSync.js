// Ligação entre o Dever de Casa do site (DeverSemanal) e os devoirs do Ambiente de Produção
// (DevoirTCF, modelo "Modèles TCF"):
//  - devoir criado no Espace professeur → atividade "producao_ambiente" no dever da semana de
//    cada aluno (cria a semana se não houver uma aberta);
//  - atividade "producao_ambiente" criada no Dever de Casa → devoir só para aquele aluno;
//  - feito no app → atividade marcada como enviada no site (o status real sai do devoir).
const DeverSemanal = require("../models/deverSemanal");
const { DevoirTCF } = require("../models/modelesTCF");
const M = require("./modelesTCF");

const ROTULO = { dictee: "Ditado", etude: "Estudar o modelo", oral: "Treinar o oral", ecrit: "Reescrever e pedir correção" };
const DIA = 24 * 3600 * 1000;

function atividadeDoDevoir(devoir) {
  return {
    tipo: "producao_ambiente",
    titulo: `${ROTULO[devoir.tipo] || "Tarefa"} · ${devoir.titre}`.slice(0, 200),
    descricao: [devoir.mensagem, `Ambiente de Produção · ${M.NOMES_TACHE[devoir.tache] || devoir.tache}`].filter(Boolean).join(" — ").slice(0, 600),
    obrigatoria: true,
    conteudo: { tache: devoir.tache, sujetId: devoir.modelo, atividadeTcf: devoir.tipo, devoirProducaoId: devoir._id, url: `producao.html#devoir=${devoir._id}` },
    entrega: { status: "pendente" }
  };
}

// Semana aberta do aluno (dentro do prazo e não concluída) ou uma nova, de 7 dias.
async function deverDaSemana(alunoId) {
  const agora = new Date();
  const aberto = await DeverSemanal.findOne({ alunoId, dataInicio: { $lte: agora }, dataLimite: { $gte: agora }, concluidoEm: null }).sort({ dataInicio: -1 });
  if (aberto) return aberto;
  const ultimo = await DeverSemanal.findOne({ alunoId }).sort({ numeroSemana: -1 }).select("numeroSemana");
  return new DeverSemanal({
    alunoId, numeroSemana: (ultimo?.numeroSemana || 0) + 1, titulo: "Tarefas do Ambiente de Produção",
    descricao: "Tarefas passadas pelo professor no Ambiente de Produção.", dataInicio: agora, dataLimite: new Date(agora.getTime() + 7 * DIA),
    atividades: []
  });
}

async function espelharDevoirNoSite(devoir, alunoIds) {
  if (devoir.origem === "site") return 0;
  let n = 0;
  for (const alunoId of alunoIds) {
    const ja = await DeverSemanal.exists({ alunoId, "atividades.conteudo.devoirProducaoId": devoir._id });
    if (ja) continue;
    const dever = await deverDaSemana(alunoId);
    dever.atividades.push(atividadeDoDevoir(devoir));
    await dever.save();
    n++;
  }
  return n;
}

// Devoir apagado/desativado: tira as atividades ainda pendentes do Dever de Casa.
async function removerEspelho(devoirId) {
  await DeverSemanal.updateMany({ "atividades.conteudo.devoirProducaoId": devoirId },
    { $pull: { atividades: { "conteudo.devoirProducaoId": devoirId, "entrega.status": "pendente" } } });
}

async function marcarFeitoNoSite(devoirId, alunoId) {
  await DeverSemanal.updateMany({ alunoId, "atividades.conteudo.devoirProducaoId": devoirId },
    { $set: { "atividades.$[a].entrega.status": "enviado", "atividades.$[a].entrega.enviadoEm": new Date() } },
    { arrayFilters: [{ "a.conteudo.devoirProducaoId": devoirId }] });
}

// Gancho do DeverSemanal: atividade "producao_ambiente" nova → devoir do aluno no app.
async function criarDevoirsDasAtividades(dever) {
  for (const a of dever.atividades || []) {
    if (a.tipo !== "producao_ambiente" || !a.conteudo || a.conteudo.devoirProducaoId) continue;
    const { tache, sujetId } = a.conteudo;
    const tema = M.acharTema(tache, sujetId);
    if (!tema) continue;
    const tipo = ["etude", "dictee", "oral", "ecrit"].includes(a.conteudo.atividadeTcf) ? a.conteudo.atividadeTcf : (M.ehEscrita(tache) ? "ecrit" : "oral");
    const d = await DevoirTCF.create({
      titre: String(a.titulo || tema.titre || M.temaCurto(M.consigneDe(tema))).slice(0, 160), tache, modelo: sujetId, tipo, mensagem: a.descricao || "",
      eixo: tema.e, alvo: { todos: false, alunos: [dever.alunoId] }, origem: "site", criadoPorNome: "Dever de Casa"
    });
    a.conteudo.devoirProducaoId = d._id;
    if (!a.conteudo.url) a.conteudo.url = `producao.html#devoir=${d._id}`;
  }
}

// Status real de uma atividade "producao_ambiente" (para enriquecerDever).
async function statusAtividade(atividade, alunoId) {
  const id = atividade.conteudo?.devoirProducaoId;
  if (!id) return null;
  const d = await DevoirTCF.findById(id).select("feitos ativo").lean();
  if (!d) return null;
  const f = (d.feitos || []).find(x => String(x.alunoId) === String(alunoId));
  return { status: f ? "enviado" : "pendente", devoirReal: { feito: !!f, score: f?.score ?? null, total: f?.total ?? null } };
}

module.exports = { espelharDevoirNoSite, removerEspelho, marcarFeitoNoSite, criarDevoirsDasAtividades, statusAtividade };
