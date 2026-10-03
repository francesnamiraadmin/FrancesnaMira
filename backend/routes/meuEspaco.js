// « Meu Espaço »: tudo sobre o aluno num lugar só — atividade, estatísticas da Plataforma de Questões,
// caderno de erros (todas as questões erradas), simulados, redações e produções orais com as
// correções, aulas assistidas (gravadas e particulares), favoritos, deveres e tempo de estudo.
// Uma chamada só; cada parte é calculada à parte (se uma falhar, as outras continuam).
const express = require("express");
const User = require("../models/user");
const Tentativa = require("../models/tentativa");
const Questao = require("../models/questao");
const Conjunto = require("../models/conjunto");
const CadernoErros = require("../models/cadernoErros");
const SimuladoTentativa = require("../models/simuladoTentativa");
const Producao = require("../models/producao");
const ProgressoAula = require("../models/progressoAula");
const Aula = require("../models/aula");
const Modulo = require("../models/modulo");
const DeverSemanal = require("../models/deverSemanal");
const SessaoEstudo = require("../models/sessaoEstudo");
const MateriaEstudo = require("../models/materiaEstudo");
const RegistroAula = require("../models/registroAula");
const { exigirAuth } = require("../middleware/auth");
const { CorrecaoIATCF } = require("../models/modelesTCF");
const sim = require("../utils/simulados");
const CA = require("../utils/correcaoAnotada");

const router = express.Router();
router.use(exigirAuth);

const DIA = 864e5;
const dia = d => new Date(d).toISOString().slice(0, 10);
const MATERIAS = { conjugaison: "Conjugação", vocabulaire: "Vocabulário", grammaire: "Gramática", co: "Compreensão oral", ce: "Compreensão escrita", expressions: "Expressões", historia: "Histórias", visual: "Visual" };
const seguro = async (fn, padrao) => { try { return await fn(); } catch (e) { console.error("meu-espaco:", e.message); return padrao; } };

async function questoes(alunoId) {
  const tentativas = await Tentativa.find({ alunoId }).sort({ finalizadaEm: 1 }).lean();
  const ids = [...new Set(tentativas.flatMap(t => t.respostas.map(r => String(r.questaoId))))];
  const [qs, conjuntos, noCaderno] = await Promise.all([
    Questao.find({ _id: { $in: ids } }).select("tipo materia enunciado afirmacao opcoes indiceCorreta respostaVF explicacao texto courseType").lean(),
    Conjunto.find({ _id: { $in: [...new Set(tentativas.map(t => String(t.conjuntoId)))] } }).select("nome").lean(),
    CadernoErros.find({ alunoId }).select("questaoId").lean()
  ]);
  const porId = new Map(qs.map(q => [String(q._id), q]));
  const nomeConjunto = new Map(conjuntos.map(c => [String(c._id), c.nome]));
  const caderno = new Set(noCaderno.map(c => String(c.questaoId)));
  const porMateria = {}, erros = new Map();
  let total = 0, certas = 0;
  tentativas.forEach(t => t.respostas.forEach(r => {
    const q = porId.get(String(r.questaoId)); if (!q) return;
    total++; if (r.correta) certas++;
    const m = porMateria[q.materia] = porMateria[q.materia] || { materia: q.materia, nome: MATERIAS[q.materia] || q.materia, total: 0, certas: 0 };
    m.total++; if (r.correta) m.certas++;
    const k = String(q._id), e = erros.get(k) || { questaoId: k, vezesErrada: 0, vezesCerta: 0, ultimaVez: null, ultimaCorreta: null };
    if (r.correta) e.vezesCerta++; else e.vezesErrada++;
    e.ultimaVez = t.finalizadaEm; e.ultimaCorreta = !!r.correta; e.conjunto = nomeConjunto.get(String(t.conjuntoId)) || "";
    e.respostaAluno = r.respostaEscolhida;
    erros.set(k, e);
  }));
  // caderno de erros: toda questão que o aluno já errou (resolvida = acertou depois)
  const cadernoErros = [...erros.values()].filter(e => e.vezesErrada > 0).sort((a, b) => new Date(b.ultimaVez) - new Date(a.ultimaVez)).slice(0, 300).map(e => {
    const q = porId.get(e.questaoId);
    return {
      ...e, resolvida: e.ultimaCorreta, noCaderno: caderno.has(e.questaoId), materia: MATERIAS[q.materia] || q.materia, tipo: q.tipo,
      enunciado: q.tipo === "vf" ? `${q.enunciado} « ${q.afirmacao || ""} »` : q.enunciado, texto: q.texto ? String(q.texto).slice(0, 1200) : "",
      respostaCorreta: q.tipo === "vf" ? (q.respostaVF ? "Vrai" : "Faux") : (q.opcoes || [])[q.indiceCorreta || 0], explicacao: q.explicacao,
      respostaAluno: q.tipo === "vf" ? (e.respostaAluno === true ? "Vrai" : e.respostaAluno === false ? "Faux" : "") : e.respostaAluno
    };
  });
  return {
    total, certas, aproveitamento: total ? Math.round(certas / total * 100) : null, tentativas: tentativas.length,
    pontos: tentativas.reduce((s, t) => s + (t.pontosObtidos || 0), 0), pontosPossiveis: tentativas.reduce((s, t) => s + (t.pontosPossiveis || 0), 0),
    evolucao: tentativas.slice(-40).map(t => ({ data: t.finalizadaEm, valor: t.percentualAcertos, rotulo: nomeConjunto.get(String(t.conjuntoId)) || "Conjunto" })),
    porMateria: Object.values(porMateria).map(m => ({ ...m, pct: Math.round(m.certas / m.total * 100) })).sort((a, b) => b.total - a.total),
    recentes: tentativas.slice(-8).reverse().map(t => ({ id: String(t._id), nome: nomeConjunto.get(String(t.conjuntoId)) || "Conjunto", pct: t.percentualAcertos, certas: t.totalCorretas, total: t.totalQuestoes, data: t.finalizadaEm })),
    cadernoErros, datas: tentativas.map(t => t.finalizadaEm)
  };
}

async function simulados(alunoId) {
  const ts = await SimuladoTentativa.find({ alunoId }).sort({ criadoEm: -1 }).limit(60).lean();
  return ts.map(t => {
    const def = sim.obter(t.simuladoSlug) || {};
    const provas = {};
    for (const p of ["co", "ce", "ee", "eo"]) {
      const e = t.provas && t.provas[p];
      if (!e || !def.provas || !def.provas[p]) continue;
      const r = e.resultado;
      const visivel = r && (sim.ehCompreensao(p) ? t.status !== "em_andamento" : !!t.publicadoEm);
      provas[p] = visivel ? { valor: r.pontos ?? r.notaProva ?? r.nota ?? null, escala: r.escala || r.notaMaximaProva || (sim.ehCompreensao(p) ? 699 : 20), nivel: r.nivel || "", nclc: r.nclc || "" } : { pendente: true };
    }
    return { id: String(t._id), slug: t.simuladoSlug, titulo: def.titulo || t.simuladoSlug, curso: def.curso || "TCF", formato: def.formato || "", status: t.status, data: t.criadoEm, provas };
  });
}

async function producoes(alunoId) {
  const [ps, ia] = await Promise.all([
    Producao.find({ alunoId }).populate("temaId", "titulo courseType nivel").sort({ dataEnvio: -1 }).limit(200).lean(),
    CorrecaoIATCF.find({ alunoId, producaoId: null }).sort({ criadoEm: -1 }).limit(100).select("tache sujet modalidade note mots criadoEm correcao.escala").lean()
  ]);
  const reenviadas = new Set(ps.filter(p => p.origemId).map(p => String(p.origemId)));
  const lista = ps.map(p => {
    const devolvida = CA.STATUS_DEVOLVIDA.includes(p.status), av = devolvida ? p.avaliacao || {} : {};
    return {
      id: String(p._id), titulo: p.temaId?.titulo || "Produção", curso: p.temaId?.courseType || "", modalidade: p.modalidade, tache: p.origem?.tache || "",
      estado: CA.estadoCorrecao(p, { reenviada: reenviadas.has(String(p._id)), paraAluno: true }), data: p.dataEnvio,
      nota: av.notaTotal ?? null, notaMaxima: av.notaMaxima || null, corretor: av.corretor || "", palavras: p.contagemPalavras || null, duracao: p.duracaoSegundos || null,
      anotacoes: devolvida ? (p.correcao?.anotacoes || 0) : 0, comentario: devolvida ? String(av.comentarioGeral || "").slice(0, 220) : ""
    };
  });
  const comNota = lista.filter(p => p.nota != null && p.notaMaxima);
  const criterios = {};
  ps.filter(p => CA.STATUS_DEVOLVIDA.includes(p.status)).forEach(p => (p.avaliacao?.criterios || []).forEach(c => {
    if (c.nota == null || !c.max) return;
    const k = c.nome; criterios[k] = criterios[k] || { nome: k, soma: 0, n: 0 };
    criterios[k].soma += c.nota / c.max; criterios[k].n++;
  }));
  return {
    lista, total: lista.length, escritas: lista.filter(p => p.modalidade !== "oral").length, orais: lista.filter(p => p.modalidade === "oral").length,
    corrigidas: comNota.length, mediaPct: comNota.length ? Math.round(comNota.reduce((s, p) => s + p.nota / p.notaMaxima, 0) / comNota.length * 100) : null,
    evolucao: comNota.slice().reverse().map(p => ({ data: p.data, valor: Math.round(p.nota / p.notaMaxima * 100), rotulo: p.titulo })),
    criterios: Object.values(criterios).map(c => ({ nome: c.nome, pct: Math.round(c.soma / c.n * 100) })).sort((a, b) => b.pct - a.pct),
    treinoIA: ia.map(x => ({ tache: x.tache, sujet: x.sujet, modalidade: x.modalidade, nota: x.note, escala: x.correcao?.escala || 20, data: x.criadoEm, palavras: x.mots })),
    datas: ps.map(p => p.dataEnvio).concat(ia.map(x => x.criadoEm))
  };
}

async function aulas(alunoId, favoritasIds) {
  const prog = await ProgressoAula.find({ userId: alunoId }).sort({ ultimoAcessoEm: -1 }).lean();
  const aulaIds = [...new Set(prog.map(p => String(p.aulaId)).concat((favoritasIds || []).map(String)))];
  const as = await Aula.find({ _id: { $in: aulaIds } }).select("titulo moduloId duracaoSegundos").lean();
  const mods = await Modulo.find({ _id: { $in: [...new Set(as.map(a => String(a.moduloId)))] } }).select("titulo curso").lean();
  const aulaPor = new Map(as.map(a => [String(a._id), a])), modPor = new Map(mods.map(m => [String(m._id), m]));
  const info = id => { const a = aulaPor.get(String(id)); const m = a && modPor.get(String(a.moduloId)); return a ? { id: String(a._id), titulo: a.titulo, modulo: m?.titulo || "", curso: m?.curso || "" } : null; };
  return {
    assistidas: prog.filter(p => p.concluida).length, emAndamento: prog.filter(p => !p.concluida).length,
    tempoSeg: prog.reduce((s, p) => s + (p.ultimaPosicaoSegundos || 0), 0),
    historico: prog.slice(0, 30).map(p => ({ ...info(p.aulaId), concluida: p.concluida, data: p.ultimoAcessoEm, posicao: p.ultimaPosicaoSegundos || 0 })).filter(x => x.id),
    favoritas: (favoritasIds || []).map(info).filter(Boolean),
    datas: prog.map(p => p.ultimoAcessoEm)
  };
}

async function aulasParticulares(alunoId) {
  const rs = await RegistroAula.find({ alunoId }).sort({ data: -1 }).limit(120).lean();
  const cont = e => rs.filter(r => r.estado === e).length;
  return {
    realizadas: cont("realizada"), faltas: cont("falta"), justificadas: cont("falta_justificada"),
    historico: rs.filter(r => new Date(r.data) <= new Date()).slice(0, 20).map(r => ({ data: r.data, estado: r.estado, conteudo: r.conteudo || "", professor: r.professor || "" })),
    proximas: rs.filter(r => new Date(r.data) > new Date()).slice(-5).reverse().map(r => ({ data: r.data, estado: r.estado })),
    datas: rs.filter(r => r.estado === "realizada").map(r => r.data)
  };
}

async function deveres(alunoId) {
  const ds = await DeverSemanal.find({ alunoId }).sort({ criadoEm: -1 }).limit(20).lean();
  // a lista completa dos deveres (os 60 mais recentes), com o andamento real de cada atividade
  const { enriquecerDever, atualizarSemanasDoAluno } = require("../utils/gerarDeveres");
  await atualizarSemanasDoAluno(alunoId).catch(() => {});
  const todos = await DeverSemanal.find({ alunoId }).sort({ dataInicio: -1, criadoEm: -1 }).limit(60);
  const GRUPO = { questoes_plataforma: "questoes", exercicio_lista: "questoes", simulado: "questoes", producao_textual: "producao", producao_oral: "producao", producao_ambiente: "producao", assistir_aula: "aulas", assistir_modulo: "aulas", exercicio_interativo: "completos" };
  const lista = [];
  for (const d of todos) {
    const e = await enriquecerDever(d);
    const feitas = e.atividades.filter(a => a.entrega?.status === "enviado").length;
    const tipos = {};
    e.atividades.forEach(a => { const g = GRUPO[a.tipo] || "outros"; tipos[g] = (tipos[g] || 0) + 1; });
    lista.push({ id: String(d._id), titulo: d.titulo, curso: d.curso || "", numeroSemana: d.numeroSemana, dataInicio: d.dataInicio, dataLimite: d.dataLimite, concluidoEm: d.concluidoEm || null,
      status: e.status, total: e.atividades.length, feitas, tipos, noPrazo: d.concluidoEm ? new Date(d.concluidoEm) <= new Date(d.dataLimite) : null, prioridade: d.prioridade });
  }
  // notas dos deveres completos (exercícios corrigidos na hora, feitos dentro do dever)
  const notas = [];
  (await DeverSemanal.find({ alunoId, "atividades.tipo": "exercicio_interativo" }).select("atividades.tipo atividades.titulo atividades.entrega").lean()).forEach(d => d.atividades.forEach(a => {
    const m = a.tipo === "exercicio_interativo" && a.entrega?.status === "enviado" && /Nota automática: [^(]*\((\d+)%\)/.exec(a.entrega.texto || "");
    if (m) notas.push({ titulo: a.titulo, pct: Number(m[1]), data: a.entrega.enviadoEm });
  }));
  return {
    lista,
    atividadesEntregues: lista.reduce((t, d) => t + d.feitas, 0),
    deveresCompletos: { feitos: notas.length, media: notas.length ? Math.round(notas.reduce((t, n) => t + n.pct, 0) / notas.length) : null, ultimos: notas.sort((a, b) => new Date(b.data) - new Date(a.data)).slice(0, 6) },
    total: ds.length, concluidos: ds.filter(d => d.concluidoEm).length,
    recentes: ds.slice(0, 6).map(d => {
      const atv = d.atividades || [];
      return { id: String(d._id), titulo: d.titulo, concluido: !!d.concluidoEm, feitas: atv.filter(a => a.concluida || a.status === "enviado" || a.concluidaEm).length, total: atv.length };
    })
  };
}

// Caderno de Revisão: as questões que o aluno salvou na tela de resultado (todas as provas).
async function revisao(alunoId) {
  const itens = await CadernoErros.find({ alunoId }).sort({ adicionadoEm: -1 }).limit(200).lean();
  const qs = await Questao.find({ _id: { $in: itens.map(i => i.questaoId) } })
    .select("tipo nivel materia enunciado texto visual opcoes indiceCorreta respostaVF afirmacao explicacao courseType").lean();
  const porId = new Map(qs.map(q => [String(q._id), q]));
  return itens.map(i => {
    const q = porId.get(String(i.questaoId));
    if (!q) return null; // questão desativada
    return {
      questaoId: String(i.questaoId), adicionadoEm: i.adicionadoEm, curso: i.courseType || q.courseType || "", materia: MATERIAS[q.materia] || q.materia, tipo: q.tipo,
      enunciado: q.enunciado, texto: q.texto || "", visual: q.visual || null, afirmacao: q.afirmacao || "",
      respostaCorreta: q.tipo === "vf" ? (q.respostaVF ? "Vrai" : "Faux") : (q.opcoes || [])[q.indiceCorreta], explicacao: q.explicacao || ""
    };
  }).filter(Boolean);
}

// O que era o « Mon espace » do Ambiente de Produção: devoirs e mensagens do professor e o
// caderno das produções (erros apontados nas correções, palavras e sujets salvos).
async function ambienteProducao(alunoId) {
  const F = require("./modeles").funcoes;
  const ctx = { userId: String(alunoId), _cache: {} };
  const [devoirs, mensagens, carnet] = await Promise.all([
    seguro(() => F.meusDevoirs(ctx), []), seguro(() => F.mesMessages(ctx), []), seguro(() => F.obterCarnet(ctx), [])
  ]);
  return { devoirs, mensagens, carnet };
}

// Assinatura: os planos de cada curso (tier, datas, módulos incluídos, renovação), o Pack Prestige,
// os acessos avulsos antigos, as matrículas de aulas e os créditos de correção.
const MODULOS_TIER = { Essentiel: [], "Avancé": ["aulas", "producao"], Excellence: ["aulas", "producao", "plataforma"] };
async function assinatura(u) {
  const agora = Date.now(), dias = d => d ? Math.ceil((new Date(d) - agora) / DIA) : null;
  const planos = (u.planos || []).map(p => {
    const venc = p.dataVencimento || p.expiraEm || null;
    const ativo = !!p.ativo && (!venc || new Date(venc).getTime() > agora);
    const pack = p.packPrestige && p.packPrestige.ativo && (!p.packPrestige.dataVencimento || new Date(p.packPrestige.dataVencimento).getTime() > agora);
    const modulos = [...new Set([...(MODULOS_TIER[p.tier] || []), ...(pack ? ["aulas", "producao", "plataforma"] : [])])];
    return { curso: p.courseType, tier: p.tier || null, ativo, dataInicio: p.dataInicio || null, dataVencimento: venc, diasRestantes: dias(venc),
      totalDias: p.dataInicio && venc ? Math.max(1, Math.round((new Date(venc) - new Date(p.dataInicio)) / DIA)) : null,
      autoRenovacao: !!p.autoRenovacao, metodoPagamento: p.metodoPagamento || null, cartaoFinal: p.cartaoFinal || null,
      packPrestige: p.packPrestige && p.packPrestige.dataVencimento ? { ativo: !!pack, dataVencimento: p.packPrestige.dataVencimento, diasRestantes: dias(p.packPrestige.dataVencimento) } : null, modulos };
  }).sort((a, b) => (b.ativo - a.ativo) || new Date(b.dataVencimento || 0) - new Date(a.dataVencimento || 0));
  const avulsos = [];
  [[u.legado && u.legado.produtosAvulsos, "acesso antigo"], [u.produtosAvulsos, "avulso"]].forEach(([obj, origem]) => Object.entries(obj || {}).forEach(([mod, v]) => {
    if (v && v.ativo && v.dataVencimento) avulsos.push({ modulo: mod, origem, dataVencimento: v.dataVencimento, diasRestantes: dias(v.dataVencimento), ativo: new Date(v.dataVencimento).getTime() > agora });
  }));
  const Matricula = require("../models/matricula");
  const mats = await Matricula.find({ alunoId: u._id, status: { $in: ["confirmada", "concluida", "pendente_pagamento"] } }).populate("turmaId", "nome dataFim").sort({ criadoEm: -1 }).limit(10).lean();
  const DS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  return {
    planos, avulsos, creditos: u.creditosCorrecao || 0,
    legado: u.plano && u.plano.ativo && u.plano.dataVencimento ? { curso: u.plano.curso || "", tier: u.plano.tier || "", dataVencimento: u.plano.dataVencimento, diasRestantes: dias(u.plano.dataVencimento) } : null,
    matriculas: mats.map(m => ({ tipo: m.tipo, curso: m.curso || "", status: m.status, turma: m.turmaId ? m.turmaId.nome : "", fim: m.turmaId ? m.turmaId.dataFim : null,
      horarios: (m.slotsEscolhidos || []).map(s => (DS[s.diaSemana] || "") + " " + (s.horaInicio || "")).filter(x => x.trim()) }))
  };
}

async function estudo(alunoId) {
  const ss = await SessaoEstudo.find({ userId: alunoId, status: "finalizada" }).select("materiaId duracaoSegundos iniciadoEm").lean();
  const mats = await MateriaEstudo.find({ _id: { $in: [...new Set(ss.map(s => String(s.materiaId)))] } }).select("nome cor icone").lean();
  const porMat = {};
  ss.forEach(s => { const k = String(s.materiaId); porMat[k] = (porMat[k] || 0) + (s.duracaoSegundos || 0); });
  return {
    totalSeg: ss.reduce((t, s) => t + (s.duracaoSegundos || 0), 0), sessoes: ss.length,
    porMateria: mats.map(m => ({ nome: m.nome, cor: m.cor, icone: m.icone || "", seg: porMat[String(m._id)] || 0 })).sort((a, b) => b.seg - a.seg),
    datas: ss.map(s => s.iniciadoEm)
  };
}

// Sequência atual de dias seguidos com atividade (termina hoje ou ontem) e o recorde.
function sequencias(dias) {
  const set = new Set(dias);
  let atual = 0, cursor = set.has(dia(Date.now())) ? Date.now() : Date.now() - DIA;
  while (set.has(dia(cursor))) { atual++; cursor -= DIA; }
  const ord = [...set].sort();
  let rec = ord.length ? 1 : 0, cor = 1;
  for (let i = 1; i < ord.length; i++) { cor = (new Date(ord[i]) - new Date(ord[i - 1])) / DIA === 1 ? cor + 1 : 1; rec = Math.max(rec, cor); }
  return { atual, recorde: rec };
}

router.get("/", async (req, res) => {
  try {
    const u = await User.findById(req.userId).select("nome email role perfil creditosCorrecao plano planos produtosAvulsos legado aulasFavoritas criadoEm").lean();
    if (!u) return res.status(404).json({ msg: "Conta não encontrada." });
    const [q, s, p, a, ap, dv, est, rv, amb, ass] = await Promise.all([
      seguro(() => questoes(u._id), null), seguro(() => simulados(u._id), []), seguro(() => producoes(u._id), null),
      seguro(() => aulas(u._id, u.aulasFavoritas), null), seguro(() => aulasParticulares(u._id), null), seguro(() => deveres(u._id), null), seguro(() => estudo(u._id), null),
      seguro(() => revisao(u._id), []), seguro(() => ambienteProducao(u._id), { devoirs: [], mensagens: [], carnet: [] }),
      seguro(() => assinatura(u), null)
    ]);
    // mapa de atividade: um ano de dias com qualquer atividade (questões, produções, simulados, aulas, estudo)
    const todas = [].concat(q?.datas || [], p?.datas || [], s.map(x => x.data), a?.datas || [], ap?.datas || [], est?.datas || []).filter(Boolean).map(dia);
    const porDia = {};
    todas.forEach(d => { porDia[d] = (porDia[d] || 0) + 1; });
    const desde = dia(Date.now() - 370 * DIA);
    const atividade = Object.entries(porDia).filter(([d]) => d >= desde).map(([d, n]) => ({ dia: d, n }));
    if (q) delete q.datas; if (p) delete p.datas; if (a) delete a.datas; if (ap) delete ap.datas; if (est) delete est.datas;
    res.json({
      aluno: {
        nome: u.nome, email: u.email, foto: u.perfil?.foto || "", papel: u.role || "aluno", provaAlvo: u.perfil?.provaAlvo || "", dataProva: u.perfil?.dataProva || null,
        creditos: u.creditosCorrecao || 0, desde: u.criadoEm, cursos: [...new Set((u.planos || []).filter(x => x.ativo).map(x => x.courseType))]
      },
      sequencia: sequencias(Object.keys(porDia)), diasAtivos: Object.keys(porDia).length, atividade,
      questoes: q, simulados: s, producoes: p, aulas: a, aulasParticulares: ap, deveres: dv, estudo: est, revisao: rv, ambiente: amb, assinatura: ass
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

module.exports = router;
