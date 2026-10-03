// Ambiente de Produção no modelo do app "Modèles TCF" (Apps Script). O front (public/js/
// producaoApp.js) é o App.html do script portado; cada `google.script.run.<função>(email, ...)`
// vira POST /api/modeles/rpc/<função> { args, courseType } (ver public/js/gasShim.js).
// As funções abaixo são as do servidor do script (Code.gs, Suivi.gs, Generation.gs…), com o
// MongoDB no lugar das abas da planilha e o Sistema de Correção do site no lugar dos Docs.
const express = require("express");
const router = express.Router();
const fs = require("fs");
const crypto = require("crypto");
const multer = require("multer");
const mongoose = require("mongoose");
const User = require("../models/user");
const Producao = require("../models/producao");
const CadernoErros = require("../models/cadernoErros");
const T = require("../models/modelesTCF");
const M = require("../utils/modelesTCF");
const { exigirAuth } = require("../middleware/auth");
const { cursosComAcesso, usuarioTemAcesso } = require("../middleware/acessoCurso");
const { comTratamentoDeErro, pastaUpload } = require("../middleware/upload");
const { ehObjectId } = require("../middleware/seguranca");
const { iaConfigurada, pedirJson } = require("../utils/claude");
const { garantirTemaSujet, corrigirTreino, lerAudio } = require("../utils/correcaoModelesIA");
const { TIPOS_CURSO } = require("../utils/tiposCurso");
const canais = require("../utils/sseCanais");

const CANAL_EQUIPE = "modeles:equipe";
const VERSAO = "site · 2026-09-30";
const MODULOS = ["PO", "PE", "DICTEE", "MODELES", "VOCAB", "SIMULADOS"];
const ABANDONO_TREINO_HORAS = 48;
const ehEquipe = role => role === "professor" || role === "admin";
const mesAtual = () => new Date().toISOString().slice(0, 7);
const oid = v => (ehObjectId(String(v || "")) ? new mongoose.Types.ObjectId(String(v)) : null);
const erro = (msg, status = 400) => Object.assign(new Error(msg), { status });

// ------------------------------------------------------------------ contexto de cada chamada
async function contexto(req) {
  const ctx = { userId: req.userId, role: req.userRole, prof: ehEquipe(req.userRole), courseType: null, _cache: {} };
  const pedido = req.body?.courseType || req.query.courseType;
  if (pedido && !TIPOS_CURSO.includes(pedido)) throw erro("Curso inválido.");
  if (ctx.prof) ctx.courseType = pedido || "TCF";
  else {
    const cursos = await cursosComAcesso(req.userId, "producao");
    if (!cursos.length) throw erro("Você não tem acesso ao Ambiente de Produção.", 403);
    ctx.courseType = pedido && cursos.includes(pedido) ? pedido : cursos[0];
    if (pedido && !cursos.includes(pedido)) throw erro("Você não tem acesso a este curso no Ambiente de Produção.", 403);
  }
  // DELF: o aluno escolhe o nível (A1 a B2) no app; o perfil traz as tâches, os sujets e os tempos desse nível.
  ctx.nivel = ctx.courseType === "DELF" ? M.nivelDelf(req.body?.nivel || req.query.nivel) : "";
  ctx.P = M.perfil(ctx.courseType, ctx.nivel);
  return ctx;
}
async function usuario(ctx) {
  if (!ctx._cache.user) ctx._cache.user = await User.findById(ctx.userId).select("nome email creditosCorrecao role");
  return ctx._cache.user;
}
async function config() {
  return T.ConfigModelesTCF.findOneAndUpdate({ chave: "geral" }, { $setOnInsert: { chave: "geral" } }, { upsert: true, new: true });
}
const alvoDe = alunos => (alunos === "TOUS" || !alunos || !alunos.length ? { todos: true, alunos: [] } : { todos: false, alunos: alunos.map(oid).filter(Boolean) });
const alvoInclui = (alvo, userId) => !alvo || alvo.todos || (alvo.alunos || []).some(a => String(a) === String(userId));
const nomeAlvo = (alvo, nomes) => (!alvo || alvo.todos ? "TOUS" : (alvo.alunos || []).map(a => nomes[String(a)] || "élève").join(", "));

async function temasMesIds(ctx) {
  if (!ctx._cache.temasMes) {
    // « Em Destaque » do mês para o curso/perfil do aluno (os antigos, sem perfil, valem para o TCF)
    const l = await T.TemaMesTCF.find({ mes: mesAtual(), $or: [{ perfil: ctx.P.id }, ...(ctx.P.id === "TCF" ? [{ perfil: null }, { perfil: { $exists: false } }] : [])] }).lean();
    ctx._cache.temasMesLista = l;
    ctx._cache.temasMes = Object.fromEntries(l.map(t => [t.sujetId, 1]));
  }
  return ctx._cache.temasMes;
}
async function partilhasTipos(ctx) {
  if (ctx._cache.partilhas) return ctx._cache.partilhas;
  const o = {};
  if (!ctx.prof) {
    (await T.PartilhaTCF.find({}).lean()).forEach(p => {
      if (!alvoInclui(p.alvo, ctx.userId)) return;
      o[p.sujetId] = o[p.sujetId] || {};
      o[p.sujetId][p.tipo] = 1;
    });
  }
  return (ctx._cache.partilhas = o);
}
async function idsDevoirs(ctx) {
  if (ctx._cache.devoirs) return ctx._cache.devoirs;
  const o = {};
  if (!ctx.prof) (await T.DevoirTCF.find({ ativo: true }).lean()).forEach(d => { if (alvoInclui(d.alvo, ctx.userId)) o[d.modelo] = 1; });
  return (ctx._cache.devoirs = o);
}
// O aluno vê o tema? No site, todos os temas ficam abertos, exceto os que o professor
// desmarcou no quadro "Thèmes P.O. / P.E." — tema do mês, devoir e partilha abrem sempre.
const TEMAS_PADRAO = require("../data/modeles/temas-padrao.json");
// Ids dos temas liberados para o aluno no perfil atual (lista do administrador ou os 20 padrão).
async function temasLiberados(ctx) {
  if (ctx._cache.liberados) return ctx._cache.liberados;
  const doc = await T.TemasAlunoTCF.findOne({ alunoId: ctx.userId, perfil: ctx.P.id }).lean();
  const lista = doc ? doc.sujets : (TEMAS_PADRAO[ctx.P.id] || []);
  ctx._cache.liberados = new Set(lista.map(x => x.id));
  return ctx._cache.liberados;
}
async function filtroVisivel(ctx) {
  if (ctx.prof) return () => true;
  const [liberados, parts, devs, destaque] = await Promise.all([temasLiberados(ctx), partilhasTipos(ctx), idsDevoirs(ctx), temasMesIds(ctx)]);
  // os temas « Em Destaque » do mês ficam liberados automaticamente para os alunos do curso
  return (t, e, id) => liberados.has(id) || !!parts[id] || !!devs[id] || !!destaque[id];
}

async function statusIA(ctx) {
  if (!iaConfigurada()) return { ativa: false, motivo: "chave" };
  const cfg = await config();
  const limite = cfg.iaDia == null ? 10 : cfg.iaDia;
  if (limite === 0) return { ativa: false, motivo: "desligada" };
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const usadas = await T.CorrecaoIATCF.countDocuments({ alunoId: ctx.userId, criadoEm: { $gte: hoje }, producaoId: null });
  return { ativa: true, restantes: ctx.prof ? 99 : Math.max(0, limite - usadas), limite };
}

// ------------------------------------------------------------------ alunos (visão do professor)
async function alunosProducao() {
  const users = await User.find({ role: "aluno" }).select("nome email planos plano legado").lean();
  const CASC = ["Avancé", "Excellence"];
  return users.filter(u => (u.plano?.ativo && u.plano?.curso === "Acesso Total") || u.legado?.produtosAvulsos?.producao?.ativo ||
    (u.planos || []).some(p => (p.ativo && CASC.includes(p.tier)) || p.packPrestige?.ativo))
    .map(u => ({ id: String(u._id), email: u.email, nome: u.nome || u.email, cursos: [...new Set((u.planos || []).filter(p => p.ativo).map(p => p.courseType))] }))
    .sort((a, b) => a.nome.localeCompare(b.nome));
}
async function mapaNomes(ids) {
  const us = await User.find({ _id: { $in: ids.filter(Boolean) } }).select("nome email").lean();
  return Object.fromEntries(us.map(u => [String(u._id), u.nome || u.email]));
}

// ------------------------------------------------------------------ listas partilhadas (Dictée / Modèles écrits)
// Liberados por padrão para todo aluno, além dos 20 temas padrão: 10 textos de ditado e 20 modelos
// escritos, os que mais caem na prova (modelos escritos à mão da professora e do atelier).
const EXTRAS_DITADO = 10, EXTRAS_MODELOS = 20;
const cacheExtras = new Map();
function extrasPadrao(P) {
  if (cacheExtras.has(P.id)) return cacheExtras.get(P.id);
  const jaPadrao = new Set((TEMAS_PADRAO[P.id] || []).map(x => x.id));
  const cand = [];
  for (const m of P.atelier || []) cand.push({ id: m.id, tache: m.tache, f: m.f || 1, t: m });
  for (const t of P.TACHES) for (const m of P.modelosManuais(t)) if (!cand.some(c => c.id === m.id)) cand.push({ id: m.id, tache: t, f: m.f || 1, t: m });
  const ord = cand.filter(c => !jaPadrao.has(c.id)).sort((a, b) => b.f - a.f || String(a.id).localeCompare(String(b.id)));
  const modelos = ord.filter(c => /^ET/.test(c.tache)).slice(0, EXTRAS_MODELOS);
  const nosModelos = new Set(modelos.map(c => c.id));
  const dictees = ord.filter(c => !nosModelos.has(c.id)).slice(0, EXTRAS_DITADO);
  const r = { dictees, modelos, ids: new Set([...dictees, ...modelos].map(c => c.id)) };
  cacheExtras.set(P.id, r);
  return r;
}
async function listasPartilhadas(ctx) {
  const vis = await filtroVisivel(ctx);
  const tipos = await partilhasTipos(ctx);
  const item = (id, tache, t) => ({ id, tache, titre: t.titre || String(t.t || "").slice(0, 120), e: t.e, c: t.c || "", atelier: !!t.atelier });
  const dictees = [], modelos = [];
  // Atelier da professora e modelos escritos à mão: abertos para todos (salvo tema oculto).
  for (const m of ctx.P.atelier) if (vis(m.tache, m.e, m.id)) { dictees.push(item(m.id, m.tache, m)); modelos.push(item(m.id, m.tache, m)); }
  for (const t of ["ET1", "ET2", "ET3"]) for (const m of ctx.P.modelosManuais(t)) if (vis(t, m.e, m.id)) { dictees.push(item(m.id, t, m)); modelos.push(item(m.id, t, m)); }
  for (const t of ["T2", "T3"]) for (const m of ctx.P.modelosManuais(t)) if (vis(t, m.e, m.id)) dictees.push(item(m.id, t, m));
  // Partilhas individuais de sujets (com modelo IA) entram também.
  for (const id of Object.keys(tipos)) {
    if (dictees.some(d => d.id === id)) continue;
    const r = M.temaEmQualquerTache(id); if (!r || M.perfilDoSujet(r.tema) !== ctx.P) continue;
    if (tipos[id].dictee) dictees.push(item(id, r.tache, r.tema));
    if (tipos[id].modele && M.ehEscrita(r.tache)) modelos.push(item(id, r.tache, r.tema));
  }
  // os extras liberados por padrão (ditado e modelos escritos)
  if (!ctx.prof) {
    const ex = extrasPadrao(ctx.P);
    for (const c of ex.dictees) if (!dictees.some(d => d.id === c.id)) dictees.push(item(c.id, c.tache, c.t));
    for (const c of ex.modelos) if (!modelos.some(d => d.id === c.id)) modelos.push(item(c.id, c.tache, c.t));
  }
  return { dictees, modelos };
}

// ------------------------------------------------------------------ funções (aluno)
const F = {};
const PROF = new Set(), ADMIN = new Set();
const prof = (nome, fn) => { F[nome] = fn; PROF.add(nome); };
const admin = (nome, fn) => { F[nome] = fn; ADMIN.add(nome); };

F.obterBanco = async ctx => {
  const [u, vis, mes, parts, ia, lp] = await Promise.all([usuario(ctx), filtroVisivel(ctx), temasMesIds(ctx), partilhasTipos(ctx), statusIA(ctx), listasPartilhadas(ctx)]);
  const filtrar = fonte => Object.fromEntries(Object.keys(fonte).map(t => [t, (fonte[t] || []).filter(m => vis(t, m.e, m.id))]));
  const pesos = {};
  const P = ctx.P;
  for (const t of P.TACHES) for (const m of P.modelosManuais(t)) pesos[m.id] = { w: M.pesoTema(t, m, mes), tr: M.ehTendencia(t, `${m.titre} ${m.c || ""}`) ? 1 : 0 };
  const contagens = {};
  for (const t of P.TACHES) contagens[t] = P.modelosManuais(t).concat(P.sujetsDaTache(t)).filter(s => vis(t, s.e, s.id)).length;
  const todos = Object.fromEntries(P.TACHES.map(t => [t, P.eixos.slice()]));
  const partilhadasIds = Object.fromEntries(Object.keys(parts).map(k => [k, 1]));
  if (!ctx.prof) extrasPadrao(P).ids.forEach(id => { partilhadasIds[id] = 1; });
  return {
    eixosPermitidos: P.eixos, acesso: todos, modulos: MODULOS, grupo: "", email: u.email, nome: u.nome || "", professor: ctx.prof,
    temDoc: false, introLink: "", podeEnviar: true, producaoLiberada: true, restantes: null,
    eixos: M.EIXOS.eixos, ordemEixos: P.eixos, trames: P.trames, boite: M.OUTILS.boite, connecteurs: M.OUTILS.connecteurs, surlignage: M.OUTILS.surlignage,
    orale: filtrar(P.orale), ecrite: filtrar(P.ecrite), audios: {}, ttsAtivo: false,
    atelier: P.atelier.filter(m => vis(m.tache, m.e, m.id)), atelierTotal: P.atelier.length,
    partilhadas: lp, partilhadasIds, pesos, prioridadeEixos: M.EIXOS.prioridade, tendMes: M.EIXOS.tendances.mois, contagens,
    avisos: [], ia, versao: VERSAO, admin: ctx.role === "admin", courseType: ctx.courseType, creditos: u.creditosCorrecao || 0, iaCorrecaoSite: iaConfigurada(),
    perfil: { id: P.id, curso: P.curso, nivel: P.nivel, nome: P.nome, delf: P.delf, niveis: P.delf ? M.DELF.NIVEAUX : [], ordem: P.ordem, taches: P.taches, epreuve: P.epreuve,
      epreuveMin: P.epreuveMin, limites: P.LIMITES_ESCRITA, descricao: P.descricao || "" }
  };
};

F.obterListaTache = async (ctx, tache) => {
  if (!ctx.P.TACHES.includes(tache)) throw erro("Tâche invalide.");
  const [vis, mes] = await Promise.all([filtroVisivel(ctx), temasMesIds(ctx)]);
  const prontos = new Set((await T.ModeleIA.find({ tache }).select("sujetId").lean()).map(x => x.sujetId));
  return ctx.P.sujetsDaTache(tache).filter(s => vis(tache, s.e, s.id)).map(s => ({
    id: s.id, e: s.e, f: s.f || 1, t: String(s.t || "").slice(0, 1500), ia: prontos.has(s.id) ? 1 : 0, d: s.d1 ? 1 : 0,
    w: M.pesoTema(tache, s, mes), tr: M.ehTendencia(tache, s.t) ? 1 : 0
  }));
};

async function lerModeloIA(id) {
  const x = await T.ModeleIA.findOne({ sujetId: id }).lean();
  return x ? M.semTravessaoObj(x.modelo) : null;
}

F.obterModeleIA = async (ctx, tache, id) => {
  const sujet = M.acharTema(tache, id);
  if (!sujet) throw erro("Sujet introuvable.", 404);
  const vis = await filtroVisivel(ctx);
  if (!vis(tache, sujet.e, id) && !extrasPadrao(ctx.P).ids.has(id)) return { bloqueado: true, sujet: { id: sujet.id, e: sujet.e, t: M.consigneDe(sujet) } };
  if (M.ehManual(tache, id)) return { modelo: sujet, sujet };
  let pronto = await lerModeloIA(id);
  if (pronto) pronto.e = sujet.e;
  const cfg = await config();
  const iaAtiva = iaConfigurada(), podeGerar = ctx.prof || cfg.geracaoAlunos !== false;
  if (!pronto && !(podeGerar && iaAtiva && (tache === "T3" || tache === "ET3"))) pronto = M.modeloGuia(tache, sujet);
  return { modelo: pronto, sujet, podeGerar, iaAtiva };
};

const gerando = new Map();
async function gerarModelo(tache, sujet, userId) {
  const p = M.promptModelo(tache, sujet);
  let ultimo;
  for (let i = 0; i < 2; i++) {
    try {
      const { json } = await pedirJson({ sistema: p.sistema, usuario: p.usuario, maxTokens: 6000 });
      const m = M.normalizarModelo(tache, sujet, json);
      await T.ModeleIA.updateOne({ sujetId: sujet.id }, { $setOnInsert: { sujetId: sujet.id, tache, sujet: String(sujet.t || "").slice(0, 300), modelo: m, pedidoPor: userId || null } }, { upsert: true });
      return m;
    } catch (e) { ultimo = e; }
  }
  throw ultimo;
}

F.gerarModeloIA = async (ctx, tache, id) => {
  const sujet = M.acharTema(tache, id);
  if (!sujet) throw erro("Sujet introuvable.", 404);
  const vis = await filtroVisivel(ctx);
  if (!vis(tache, sujet.e, id)) throw erro("Ce sujet est verrouillé. Demandez à votre professeur(e) de l'ouvrir.");
  const existente = await lerModeloIA(id);
  if (existente) { existente.e = sujet.e; return existente; }
  if (!iaConfigurada()) throw erro("L'IA n'est pas configurée sur le serveur.");
  const cfg = await config();
  if (!ctx.prof && cfg.geracaoAlunos === false) throw erro("La génération de modèles n'est pas activée. Demandez à votre professeur(e).");
  // Dois alunos abrindo o mesmo tema ao mesmo tempo esperam a mesma geração.
  if (!gerando.has(id)) gerando.set(id, gerarModelo(tache, sujet, ctx.userId).finally(() => gerando.delete(id)));
  const m = await gerando.get(id);
  m.e = sujet.e;
  return m;
};

F.obterSujetsEntrainement = async ctx => {
  const [vis, mes] = await Promise.all([filtroVisivel(ctx), temasMesIds(ctx)]);
  const o = {};
  for (const t of ["ET1", "ET2", "ET3"]) {
    o[t] = ctx.P.sujetsDaTache(t).filter(s => vis(t, s.e, s.id)).map(s => ({ ...s, w: M.pesoTema(t, s, mes), tr: M.ehTendencia(t, s.t) ? 1 : 0 }));
  }
  return o;
};

// ---------------- épreuve écrite de 60 minutes ----------------
async function sessoesDoAluno(ctx) {
  const [sessoes, feitas, orais] = await Promise.all([
    T.SessaoTCF.find({ ativa: true }).sort({ criadoEm: -1 }).lean(),
    T.EpreuveTCF.find({ alunoId: ctx.userId, sessaoId: { $ne: null } }).select("sessaoId status").lean(),
    Producao.find({ alunoId: ctx.userId, "origem.sessaoId": { $ne: null }, modalidade: "oral" }).select("origem").lean()
  ]);
  const st = Object.fromEntries(feitas.map(e => [String(e.sessaoId), e.status]));
  const oraisFeitas = new Set(orais.map(o => String(o.origem.sessaoId) + "|" + o.origem.tache));
  return sessoes.filter(s => alvoInclui(s.alvo, ctx.userId)).map(s => {
    const escrita = !!(s.ET1 || s.ET2 || s.ET3);
    const orais2 = ["T1", "T2", "T3"].filter(t => s[t]).map(t => {
      const sj = M.acharTema(t, s[t]) || { id: s[t], t: s[t] };
      return { tache: t, sujet: { id: sj.id, t: M.consigneDe(sj) }, feita: oraisFeitas.has(String(s._id) + "|" + t) };
    });
    const e = st[String(s._id)];
    return { id: String(s._id), nome: s.nome, escrita, feita: escrita && !!e && e !== "em_curso", emCurso: e === "em_curso", orais: orais2 };
  });
}
const sujetsCompletos = ids => Object.fromEntries(["ET1", "ET2", "ET3"].map(t => [t, ids[t] ? M.acharTema(t, ids[t]) : null]));
const duracaoEp = e => e.duracaoMin || M.DURACAO_EPREUVE_MIN;
const fimEfetivo = (e, agora) => (e.sessaoId ? e.fim.getTime() : agora + Math.max(0, duracaoEp(e) * 60 - (e.consumido || 0)) * 1000);
function expirou(e, agora) {
  if (e.sessaoId) return agora > e.fim.getTime() + 60 * 1000;
  const ultimo = (e.ultimoSinal || e.inicio).getTime();
  return (e.consumido || 0) >= duracaoEp(e) * 60 + 30 || agora - ultimo > ABANDONO_TREINO_HORAS * 3600 * 1000;
}

function avisarEquipe(evento, dados) { canais.enviar(CANAL_EQUIPE, evento, dados); }

async function estadoEpreuve(ctx) {
  const agora = Date.now();
  let emCurso = await T.EpreuveTCF.findOne({ alunoId: ctx.userId, status: "em_curso" }).sort({ inicio: -1 });
  if (emCurso && expirou(emCurso, agora)) { await finalizar(emCurso, emCurso.textes, true); emCurso = null; }
  const u = await usuario(ctx);
  return {
    agora, sessoes: await sessoesDoAluno(ctx), podeEnviar: true, producaoLiberada: true, restantes: null, temDoc: false, creditos: u.creditosCorrecao || 0,
    emCurso: emCurso ? {
      id: String(emCurso._id), inicio: emCurso.inicio.getTime(), fim: fimEfetivo(emCurso, agora), consumido: emCurso.consumido || 0, pausavel: !emCurso.sessaoId,
      sessao: emCurso.sessaoId ? String(emCurso.sessaoId) : "", sujets: sujetsCompletos(emCurso.sujets || {}), textes: emCurso.textes || {}, correcao: emCurso.correcao
    } : null
  };
}
F.obterEstadoEpreuve = ctx => estadoEpreuve(ctx);

// pedido = { sessao: id } ou { sujets: {ET1, ET2, ET3}, correcao: "ia"|"professor" }
F.commencerEpreuve = async (ctx, pedido) => {
  pedido = pedido || {};
  const existente = await T.EpreuveTCF.findOne({ alunoId: ctx.userId, status: "em_curso" });
  if (existente && !expirou(existente, Date.now())) return estadoEpreuve(ctx);
  if (existente) await finalizar(existente, existente.textes, true);
  let ids, sessaoId = null;
  if (pedido.sessao) {
    const s = (await sessoesDoAluno(ctx)).find(x => x.id === pedido.sessao);
    if (!s) throw erro("Cette épreuve n'est pas disponible.");
    if (s.feita) throw erro("Vous avez déjà fait cette épreuve.");
    if (!s.escrita) throw erro("Cette épreuve n'a pas de partie écrite.");
    const linha = await T.SessaoTCF.findById(pedido.sessao).lean();
    ids = { ET1: linha.ET1 || "", ET2: linha.ET2 || "", ET3: linha.ET3 || "" };
    sessaoId = linha._id;
  } else ids = pedido.sujets || {};
  for (const t of ["ET1", "ET2", "ET3"]) {
    if (!ids[t] && (sessaoId || !ctx.P.TACHES.includes(t))) continue;
    if (!M.acharTema(t, ids[t])) throw erro("Sujet invalide.");
  }
  const primeiro = ["ET1", "ET2", "ET3"].map(t => ids[t] && M.acharTema(t, ids[t])).find(Boolean);
  const duracaoMin = M.perfilDoSujet(primeiro).epreuveMin;
  const inicio = new Date();
  const ep = await T.EpreuveTCF.create({
    alunoId: ctx.userId, courseType: ctx.courseType, sessaoId, inicio, fim: new Date(inicio.getTime() + duracaoMin * 60000), duracaoMin,
    sujets: ids, status: "em_curso", ultimoSinal: inicio, correcao: sessaoId ? "professor" : (pedido.correcao === "professor" ? "professor" : "ia")
  });
  const u = await usuario(ctx);
  avisarEquipe("epreuve", { id: String(ep._id), alunoId: ctx.userId, nome: u.nome, acao: "inicio" });
  return estadoEpreuve(ctx);
};

const limparTextes = textes => Object.fromEntries(["ET1", "ET2", "ET3"].map(t => [t, String((textes || {})[t] || "").slice(0, 6000)]));

F.salvarRascunhoEpreuve = async (ctx, textes, consumido) => {
  const e = await T.EpreuveTCF.findOne({ alunoId: ctx.userId, status: "em_curso" }).sort({ inicio: -1 });
  if (!e) return { fechada: true };
  const agora = Date.now();
  if (!e.sessaoId) {
    // O tempo consumido só avança o tempo real decorrido desde o último sinal (sem trapaça).
    const antes = e.consumido || 0, ultimo = (e.ultimoSinal || e.inicio).getTime();
    e.consumido = Math.max(antes, Math.min(Number(consumido) || 0, antes + Math.ceil((agora - ultimo) / 1000) + 5));
  }
  e.ultimoSinal = new Date(agora);
  e.textes = limparTextes(textes);
  await e.save();
  const u = await usuario(ctx);
  avisarEquipe("epreuve", { id: String(e._id), alunoId: ctx.userId, nome: u.nome, acao: "rascunho", consumido: e.consumido, fim: fimEfetivo(e, agora), sessao: !!e.sessaoId,
    textes: e.textes, sujets: e.sujets });
  if (expirou(e, agora)) { const r = await finalizar(e, e.textes, true); r.fechada = true; return r; }
  return { ok: true, agora };
};

F.terminerEpreuve = async (ctx, textes) => {
  const e = await T.EpreuveTCF.findOne({ alunoId: ctx.userId, status: "em_curso" }).sort({ inicio: -1 });
  if (!e) throw erro("Aucune épreuve en cours.");
  if (!e.sessaoId || Date.now() <= e.fim.getTime() + 90000) e.textes = limparTextes(textes);
  return finalizar(e, e.textes, false);
};

// Fecha a épreuve. Épreuve do professor (ou treino com correção "professor"): cada tâche escrita
// vira uma Producao no Sistema de Correção. Treino com correção "ia": a correção é pedida pelo
// aluno na tela (uma por tâche), e ele ainda pode mandar ao professor depois.
async function finalizar(e, textes, automatico) {
  const atual = await T.EpreuveTCF.findOneAndUpdate({ _id: e._id, status: "em_curso" }, { $set: { status: "so_ia", enviadaEm: new Date(), textes: limparTextes(textes) } }, { new: true });
  if (!atual) return { ok: true, jaEnviada: true };
  const itens = ["ET1", "ET2", "ET3"].filter(t => String(atual.textes[t] || "").trim() && atual.sujets[t]);
  let status = !itens.length ? "vazia" : automatico ? "enviada_auto" : "enviada";
  let quantidade = 0, aviso = "";
  if (itens.length && (atual.sessaoId || atual.correcao === "professor")) {
    const r = await enviarTachesAoProfessor(atual, itens, { semCredito: !!atual.sessaoId });
    quantidade = r.enviadas; aviso = r.aviso;
  } else if (itens.length) status = "so_ia";
  atual.status = status;
  await atual.save();
  avisarEquipe("epreuve", { id: String(atual._id), alunoId: String(atual.alunoId), acao: "fim", status });
  return { ok: true, id: String(atual._id), quantidade, aviso: aviso || (!itens.length ? "Aucun texte écrit : rien n'a été envoyé." : ""), status, correcao: atual.correcao, sessao: !!atual.sessaoId };
}

async function enviarTachesAoProfessor(ep, taches, { semCredito, modoCorrecao = "professor" } = {}) {
  const { montarNovaProducao, processarCorrecaoIA } = require("./producoes");
  let enviadas = 0; const erros = [];
  for (const t of taches) {
    try {
      const tema = await garantirTemaSujet(ep.courseType || "TCF", t, ep.sujets[t]);
      const p = await montarNovaProducao({
        userId: ep.alunoId, temaId: String(tema._id), textoDigitado: ep.textes[t], pularChecagemAcesso: true, modoCorrecao,
        origem: { tipo: "modeles", tache: t, sujetId: ep.sujets[t], eixo: (M.acharTema(t, ep.sujets[t]) || {}).e, epreuveId: ep._id, sessaoId: ep.sessaoId || undefined },
        semCredito, aceitarForaDoLimite: true
      });
      ep.producoes.push(p._id);
      enviadas++;
    } catch (err) { erros.push(`${t.replace("ET", "Tâche ")} : ${err.msg || err.message}`); }
  }
  await ep.save();
  void processarCorrecaoIA;
  const u = await User.findById(ep.alunoId).select("creditosCorrecao").lean();
  return { enviadas, aviso: erros.length ? "Non envoyé : " + erros.join(" · ") : "", creditos: u?.creditosCorrecao || 0 };
}

// Depois de uma épreuve de treino: manda ao Sistema de Correção as tâches escolhidas.
F.enviarEpreuveCorrecao = async (ctx, epreuveId, taches, modo) => {
  const ep = await T.EpreuveTCF.findOne({ _id: oid(epreuveId), alunoId: ctx.userId });
  if (!ep || ep.status === "em_curso") throw erro("Épreuve introuvable.");
  const ja = new Set((await Producao.find({ _id: { $in: ep.producoes } }).select("origem.tache").lean()).map(p => p.origem.tache));
  const lista = (taches || []).filter(t => ["ET1", "ET2", "ET3"].includes(t) && !ja.has(t) && String(ep.textes[t] || "").trim());
  if (!lista.length) throw erro("Rien à envoyer (tâches vides ou déjà envoyées).");
  const r = await enviarTachesAoProfessor(ep, lista, { semCredito: !!ep.sessaoId, modoCorrecao: modo === "ia" ? "ia" : "professor" });
  const u = await User.findById(ctx.userId).select("creditosCorrecao");
  return { ...r, creditos: u.creditosCorrecao || 0 };
};

// Texto livre (réécriture, tâche treinada fora da épreuve) → Sistema de Correção.
F.enviarTextoCorrecao = async (ctx, dados) => {
  const t = dados?.tache;
  if (!["ET1", "ET2", "ET3"].includes(t) || !M.acharTema(t, dados.sujet)) throw erro("Sujet invalide.");
  const { montarNovaProducao } = require("./producoes");
  const tema = await garantirTemaSujet(ctx.courseType, t, dados.sujet);
  const p = await montarNovaProducao({
    userId: ctx.userId, temaId: String(tema._id), textoDigitado: String(dados.texte || ""), modoCorrecao: dados.modo === "ia" ? "ia" : "professor",
    origem: { tipo: "modeles", tache: t, sujetId: dados.sujet, eixo: (M.acharTema(t, dados.sujet) || {}).e }, aceitarForaDoLimite: true
  });
  await concluirDevoirsDoSujet(ctx, t, dados.sujet).catch(() => {});
  const u = await User.findById(ctx.userId).select("creditosCorrecao");
  return { ok: true, protocolo: p.protocolo, id: String(p._id), creditos: u.creditosCorrecao || 0 };
};

// ---------------- correção de treino pela IA ----------------
// A correção pela IA também custa 1 crédito de correção (como a do professor). Confere o saldo
// antes de chamar a IA e só desconta depois que a correção deu certo; a equipe não paga.
const CUSTO_IA = 1;
async function conferirCreditoIA(ctx) {
  if (ctx.prof) return;
  const u = await User.findById(ctx.userId).select("creditosCorrecao").lean();
  if ((u?.creditosCorrecao || 0) < CUSTO_IA) throw erro("Vous n'avez plus de crédit de correction. La correction par l'IA coûte 1 crédit : achetez-en dans « Crédits de correction ».", 402);
}
async function cobrarCreditoIA(ctx) {
  if (ctx.prof) return null;
  await User.updateOne({ _id: ctx.userId, creditosCorrecao: { $gte: CUSTO_IA } }, { $inc: { creditosCorrecao: -CUSTO_IA } });
  const u = await User.findById(ctx.userId).select("creditosCorrecao").lean();
  return u?.creditosCorrecao || 0;
}
F.statusIA = ctx => statusIA(ctx);
F.corrigirComIA = async (ctx, pedido) => {
  const st = await statusIA(ctx);
  if (!st.ativa) throw erro("La correction par l'IA n'est pas activée. Demandez à votre professeur(e).");
  if (st.restantes <= 0) throw erro(`Vous avez utilisé vos ${st.limite} corrections par l'IA aujourd'hui. Revenez demain !`);
  const texte = String(pedido?.texte || "").trim().slice(0, 6000);
  if (M.contarPalavras(texte) < 15) throw erro("Écrivez au moins quelques phrases avant de demander une correction.");
  if (!M.TACHES.includes(pedido.tache)) throw erro("Tâche invalide.");
  await conferirCreditoIA(ctx);
  const r = await corrigirTreino({ alunoId: ctx.userId, tache: pedido.tache, sujetId: pedido.sujet, texte, courseType: ctx.courseType });
  r.restantes = Math.max(0, st.restantes - 1);
  const saldo = await cobrarCreditoIA(ctx);
  if (saldo != null) { r.creditos = saldo; r.custo = CUSTO_IA; }
  return r;
};
F.obterCorrecoesIA = async ctx => (await T.CorrecaoIATCF.find({ alunoId: ctx.userId }).sort({ criadoEm: -1 }).limit(30).select("-correcao -texte").lean())
  .map(r => ({ linha: String(r._id), Date: r.criadoEm, "Tâche": r.tache, Sujet: r.sujet, Mots: r.mots, "Note /20": r.note, NCLC: r.nclc }));
F.obterDetalheCorrecaoIA = async (ctx, id) => {
  const r = await T.CorrecaoIATCF.findOne({ _id: oid(id), alunoId: ctx.userId }).lean();
  if (!r) throw erro("Correction introuvable.", 404);
  return { ...r.correcao, texteEleve: r.texte, tache: r.tache, sujet: r.sujet };
};

// ---------------- carnet de révision ----------------
F.obterCarnet = async ctx => (await T.CarnetProducao.find({ alunoId: ctx.userId }).sort({ data: 1 }).lean())
  .map(r => ({ tipo: r.tipo, tache: r.tache, id: r.tipo === "sujet" ? r.refId : String(r._id), titre: r.titre, detalhe: r.detalhe, e: r.eixo, data: r.data, revisado: r.revisado, producaoId: r.producaoId, curso: r.courseType || "" }));
F.alternarCarnet = async (ctx, item) => {
  const ex = await T.CarnetProducao.findOne({ alunoId: ctx.userId, tipo: "sujet", refId: item.id });
  if (ex) { await ex.deleteOne(); return false; }
  await T.CarnetProducao.create({ alunoId: ctx.userId, tipo: "sujet", tache: item.tache, refId: item.id, titre: String(item.titre || "").slice(0, 200), eixo: item.e || "", courseType: ctx.courseType });
  return true;
};
F.adicionarPalavrasCarnet = async (ctx, mots) => {
  const ja = new Set((await T.CarnetProducao.find({ alunoId: ctx.userId, tipo: "mot" }).select("titre").lean()).map(r => M.semAcento(r.titre)));
  let n = 0;
  for (const m of (mots || []).slice(0, 30)) {
    const mot = String(m.mot || "").trim().slice(0, 80);
    if (!mot || ja.has(M.semAcento(mot))) continue;
    ja.add(M.semAcento(mot));
    await T.CarnetProducao.create({ alunoId: ctx.userId, tipo: "mot", tache: m.tache || "", titre: mot, detalhe: String(m.detalhe || "").slice(0, 300), eixo: m.e || "", courseType: ctx.courseType });
    n++;
  }
  return n;
};
F.removerDoCarnet = async (ctx, id) => {
  await T.CarnetProducao.deleteOne({ alunoId: ctx.userId, $or: [{ tipo: "sujet", refId: id }, ...(oid(id) ? [{ _id: oid(id) }] : [])] });
  return true;
};
F.marcarCarnetRevisado = async (ctx, id, revisado) => {
  await T.CarnetProducao.updateOne({ _id: oid(id), alunoId: ctx.userId }, { revisado: !!revisado });
  return true;
};
// Resumo do Caderno de Revisão da Plataforma de Questões (os dois cadernos se mostram um ao outro).
F.obterCadernoErros = async ctx => ({
  questoes: await CadernoErros.countDocuments({ alunoId: ctx.userId, ...(ctx.courseType ? { courseType: ctx.courseType } : {}) }),
  link: "caderno-revisao.html" + (ctx.courseType ? "?curso=" + ctx.courseType : "")
});

// ---------------- devoirs, mensagens, avisos ----------------
async function meusDevoirs(ctx) {
  const ds = await T.DevoirTCF.find({ ativo: true }).sort({ criadoEm: -1 }).lean();
  return ds.filter(d => alvoInclui(d.alvo, ctx.userId)).map(d => {
    const f = (d.feitos || []).find(x => String(x.alunoId) === String(ctx.userId));
    return { id: String(d._id), titre: d.titre, tache: d.tache, modelo: d.modelo, tipo: d.tipo, tipoNome: M.TIPOS_DEVOIR[d.tipo] || d.tipo, mensagem: d.mensagem, data: d.criadoEm, feito: !!f, score: f ? f.score : "", total: f ? f.total : "" };
  });
}
// « Mes devoirs » do app: os devoirs + as atividades de produção do Dever de Casa do site
// (produção textual/oral de um tema do catálogo). Essas são entregues na página do dever,
// onde a Producao fica ligada à atividade.
F.meusDevoirs = async ctx => {
  const lista = await meusDevoirs(ctx);
  const DeverSemanal = require("../models/deverSemanal");
  const deveres = await DeverSemanal.find({ alunoId: ctx.userId, "atividades.tipo": { $in: ["producao_textual", "producao_oral"] } })
    .populate("atividades.conteudo.temaId", "titulo").sort({ dataInicio: -1 }).limit(8).lean();
  deveres.forEach(dv => dv.atividades.forEach((a, i) => {
    if (!["producao_textual", "producao_oral"].includes(a.tipo)) return;
    const tema = a.conteudo?.temaId;
    lista.push({ id: "site:" + dv._id + ":" + i, titre: a.titulo || tema?.titulo || "Produção", tache: a.tipo === "producao_oral" ? "T3" : "ET3",
      modelo: "", tipo: a.tipo === "producao_oral" ? "oral" : "ecrit", tipoNome: "Dever de Casa · " + (a.tipo === "producao_oral" ? "Produção oral" : "Produção escrita"),
      mensagem: dv.titulo, data: dv.dataInicio, feito: a.entrega?.status === "enviado", score: "", total: "", link: "meus-deveres.html" });
  }));
  return lista;
};
F.concluirDevoir = async (ctx, id, score, total) => {
  const d = await T.DevoirTCF.findById(oid(id));
  if (!d || !alvoInclui(d.alvo, ctx.userId)) throw erro("Devoir introuvable.");
  const f = d.feitos.find(x => String(x.alunoId) === String(ctx.userId));
  const s = score === "" || score == null ? undefined : Number(score), tt = total === "" || total == null ? undefined : Number(total);
  if (f) { if (s === undefined || s >= (f.score || 0)) { f.score = s; f.total = tt; f.data = new Date(); } }
  else d.feitos.push({ alunoId: ctx.userId, score: s, total: tt, data: new Date() });
  await d.save();
  await require("../utils/devoirsSync").marcarFeitoNoSite(d._id, ctx.userId);
  return true;
};
// Produção enviada sobre um sujet que é devoir do aluno (escrita/oral) → devoir feito nos dois lados.
async function concluirDevoirsDoSujet(ctx, tache, sujetId) {
  const tipo = M.ehEscrita(tache) ? "ecrit" : "oral";
  const ds = await T.DevoirTCF.find({ ativo: true, modelo: sujetId, tipo }).select("_id alvo feitos").lean();
  for (const d of ds) {
    if (alvoInclui(d.alvo, ctx.userId) && !(d.feitos || []).some(f => String(f.alunoId) === String(ctx.userId))) await F.concluirDevoir(ctx, String(d._id));
  }
}
const fmtMsg = m => ({ id: String(m._id), data: m.criadoEm, texto: m.texto, de: m.de, feito: m.feito, atualizado: m.atualizadoEm });
F.mesMessages = async ctx => (await T.MensagemTCF.find({ alunoId: ctx.userId }).sort({ criadoEm: -1 }).lean()).map(fmtMsg);
F.marcarMensagem = async (ctx, id, feito) => {
  const r = await T.MensagemTCF.updateOne({ _id: oid(id), alunoId: ctx.userId }, { feito: !!feito, atualizadoEm: new Date() });
  if (!r.matchedCount) throw erro("Message introuvable.");
  return true;
};
F.meusAvisos = async ctx => (await T.AvisoTCF.find({ ativo: true, lidos: { $ne: ctx.userId } }).sort({ criadoEm: -1 }).lean())
  .filter(a => alvoInclui(a.alvo, ctx.userId)).map(a => ({ id: String(a._id), titre: a.titre, message: a.message, data: a.criadoEm, de: a.de }));
F.marcarAvisoLido = async (ctx, id) => { await T.AvisoTCF.updateOne({ _id: oid(id) }, { $addToSet: { lidos: ctx.userId } }); return true; };

// ---------------- temas do mês e À la une ----------------
async function temasDoMes(ctx) {
  await temasMesIds(ctx);
  return ctx._cache.temasMesLista.map(r => ({ tache: r.tache, id: r.sujetId, titre: r.titre, e: r.eixo, linha: String(r._id) }));
}
F.obterTemasDoMes = ctx => temasDoMes(ctx);

F.obterDestaques = async ctx => {
  const vis = await filtroVisivel(ctx);
  const posts = await T.PostBlogTCF.find({ visivel: true }).sort({ ordem: 1, criadoEm: -1 }).lean();
  const postsOut = posts.map(p => {
    let tema = p.tache && p.sujetId ? M.acharTema(p.tache, p.sujetId) : null;
    if (tema && !vis(p.tache, tema.e, p.sujetId)) tema = null;
    return { ref: String(p._id), tache: tema ? p.tache : "", id: tema ? p.sujetId : "", titre: p.titre, texto: p.texto || (tema ? M.consigneDe(tema) : ""), e: tema ? tema.e : "", f: tema ? (tema.f || 1) : 1, imagem: imagemBlog(p.imagem), post: 1 };
  });
  const temas = await temasDoMes(ctx), idsMes = await temasMesIds(ctx);
  const ocultosUne = (await config()).ocultosUne || {};
  const saida = [];
  for (const t of ctx.P.TACHES) {
    let esc = temas.filter(x => x.tache === t && !ocultosUne[x.id]).slice(0, 1).map(x => {
      const s = M.acharTema(t, x.id) || {};
      return { tache: t, id: x.id, titre: x.titre, texto: M.consigneDe(s), e: x.e, f: s.f || 1, mes: 1, tr: M.ehTendencia(t, `${s.t || ""} ${s.titre || ""}`) ? 1 : 0 };
    });
    if (!esc.length) {
      const pool = ctx.P.modelosManuais(t).concat(ctx.P.sujetsDaTache(t)).filter(s => vis(t, s.e, s.id) && !ocultosUne[s.id]);
      pool.sort((a, b) => M.pesoTema(t, b, idsMes) - M.pesoTema(t, a, idsMes));
      esc = pool.slice(0, 1).map(s => ({ tache: t, id: s.id, titre: s.titre || "", texto: M.consigneDe(s), e: s.e, f: s.f || 1, mes: 0, tr: M.ehTendencia(t, `${s.t || ""} ${s.titre || ""} ${s.c || ""}`) ? 1 : 0 }));
    }
    saida.push(...esc);
  }
  // « Em Destaque »: todos os temas do mês definidos pelo administrador para o curso do aluno
  // sem destaque definido no mês: os temas que mais caem (um por tarefa), escolhidos automaticamente
  const automatico = !temas.length;
  const emDestaque = (automatico ? saida : temas).map(x => { const sj = M.acharTema(x.tache, x.id) || {}; const ex = M.EIXOS.eixos[x.e] || {};
    return { tache: x.tache, id: x.id, titre: x.titre || sj.titre || "", texto: M.consigneDe(sj), e: x.e, eixo: ex.nome || x.e || "", escrita: M.ehEscrita(x.tache), f: sj.f || 1 }; });
  return { posts: postsOut, sujets: saida, ocultos: Object.keys(ocultosUne).length, emDestaque, automatico, mes: mesAtual(), curso: ctx.P.nome };
};

// Administrador: tira um item do "À la une". Artigo → apagado do blog; sujet → sai do destaque
// (e da seleção do mês, se estava nela) e o próximo sujet da tâche toma o lugar.
admin("removerDaUne", async (ctx, tipo, ref) => {
  if (tipo === "post") {
    if (!oid(ref)) throw erro("Article introuvable.");
    await T.PostBlogTCF.deleteOne({ _id: oid(ref) });
  } else {
    const id = String(ref || "").slice(0, 40);
    if (!id) throw erro("Sujet introuvable.");
    const cfg = await config();
    cfg.ocultosUne = { ...(cfg.ocultosUne || {}), [id]: 1 };
    cfg.markModified("ocultosUne");
    await cfg.save();
    await T.TemaMesTCF.deleteOne({ mes: mesAtual(), sujetId: id });
  }
  ctx._cache = {};
  return F.obterDestaques(ctx);
});
admin("restaurarUne", async ctx => {
  const cfg = await config();
  cfg.ocultosUne = {}; cfg.markModified("ocultosUne");
  await cfg.save();
  return F.obterDestaques(ctx);
});
function imagemBlog(v) {
  v = String(v || "").trim();
  if (!v) return "";
  const m = v.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?.*id=)([-\w]{20,})/);
  if (m) return "https://drive.google.com/thumbnail?id=" + m[1] + "&sz=w1200";
  return /^https:\/\//.test(v) || /^img\//.test(v) ? v : "";
}

// ---------------- notas e competências ----------------
function linhaProducao(p, nomes) {
  const tache = p.origem?.tache || (p.modalidade === "oral" ? "T" : "ET");
  return {
    ID: String(p._id), Date: p.dataEnvio || p.criadoEm, "E-mail": String(p.alunoId), Nom: nomes ? nomes[String(p.alunoId)] || "" : "", "Tâche": tache,
    Sujet: p.temaId?.titulo || "", Mots: p.contagemPalavras || "", Texte: p.textoDigitado || "", Transcription: p.transcricao || "",
    "Note /20": p.avaliacao?.notaTotal != null && p.avaliacao.notaMaxima ? Math.round(p.avaliacao.notaTotal / p.avaliacao.notaMaxima * 20 * 2) / 2 : "",
    Commentaire: p.avaliacao?.comentarioGeral || "", "Corrigé le": p.dataCorrecao || "", Statut: p.status, Protocole: p.protocolo, Correcteur: p.avaliacao?.corretor || p.modoCorrecao,
    Session: p.origem?.sessaoId ? String(p.origem.sessaoId) : "", "Durée (s)": p.duracaoSegundos || "", Audio: p.arquivoOriginal?.caminho ? "/api/modeles/audio/" + p._id : "", NCLC: p.avaliacao?.nclc || ""
  };
}
F.obterMesNotes = async ctx => {
  const ps = await Producao.find({ alunoId: ctx.userId, "origem.tipo": "modeles" }).populate("temaId", "titulo").sort({ dataEnvio: -1 }).limit(160).lean();
  const notasOrais = await T.CompetenciaTCF.find({ alunoId: ctx.userId, epreuve: "PO", producaoId: null }).sort({ criadoEm: -1 }).limit(40).lean();
  return {
    pe: ps.filter(p => p.modalidade !== "oral").map(p => linhaProducao(p)),
    po: ps.filter(p => p.modalidade === "oral").map(p => linhaProducao(p)).concat(notasOrais.map(n => ({ Date: n.criadoEm, "Tâche": n.tache, Sujet: n.sujet, "Note /20": n.total, Commentaire: n.comentario })))
  };
};
async function resumoCompetencias(alunoId) {
  const linhas = await T.CompetenciaTCF.find({ alunoId }).sort({ criadoEm: -1 }).lean();
  const o = {};
  for (const ep of ["PE", "PO"]) {
    const l = linhas.filter(r => r.epreuve === ep);
    o[ep] = {
      n: l.length,
      criterios: M.CRITERES[ep].map((c, i) => { const v = l.map(r => r.notas[i]).filter(x => typeof x === "number"); return { nome: c, media: v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length * 10) / 10 : null }; }),
      total: l.length ? Math.round(l.reduce((a, r) => a + (r.total || 0), 0) / l.length * 10) / 10 : null,
      historico: l.slice(0, 20).map(r => ({ data: r.criadoEm, tache: r.tache, sujet: r.sujet, total: r.total, notas: r.notas, comentario: r.comentario }))
    };
  }
  return o;
}
F.mesCompetencias = async ctx => ({ resumo: await resumoCompetencias(ctx.userId), criterios: M.CRITERES });
F.obterCriterios = () => M.CRITERES;

// ---------------- vocabulário ----------------
const VOCAB = require("../data/modeles/vocab.json");
const idCarta = (deck, mot) => "V" + crypto.createHash("sha256").update(deck + "|" + mot).digest("hex").slice(0, 10);
async function cartas() {
  const extras = await T.CartaVocabTCF.find({ ativo: true }).lean();
  const base = VOCAB.cartas.map(c => ({ deck: VOCAB.renomear[c[0]] || c[0], mot: c[1], trad: c[2], ex: c[3], dica: c[4] || "" }));
  return base.concat(extras.map(c => ({ deck: c.deck, mot: c.mot, trad: c.traduction, ex: c.exemple, dica: c.astuce || "", prof: String(c._id) })))
    .map(c => ({ ...c, id: idCarta(c.deck, c.mot) }));
}
// No formato que a tela do app espera: temas { nome, icone, grupo, cartas[] } e o progresso
// { __err: { id: acertos desde o erro }, __vu: { id: 1 } }; meta = acertos para sair do caderno.
F.obterVocab = async ctx => {
  const [cs, prog] = await Promise.all([cartas(), T.ProgressoVocabTCF.findOne({ alunoId: ctx.userId }).lean()]);
  const dados = prog?.dados || {};
  const carta = c => ({ id: c.id, mot: c.mot, trad: c.trad, ex: c.ex, dica: c.dica, prof: c.prof });
  const temas = VOCAB.temas.map(([nome, icone, grupo]) => ({ nome, icone, grupo: grupo || "Vocabulaire", cartas: cs.filter(c => c.deck === nome).map(carta) }));
  // decks criados pela professora que não estão na lista fixa
  const conhecidos = new Set(temas.map(t => t.nome));
  [...new Set(cs.map(c => c.deck))].filter(d => !conhecidos.has(d)).forEach(d => temas.push({ nome: d, icone: "⭐", grupo: "De la professeure", cartas: cs.filter(c => c.deck === d).map(carta) }));
  return { temas: temas.filter(t => t.cartas.length), progresso: { __err: dados.__err || {}, __vu: dados.__vu || {} }, meta: VOCAB.acertosSair || 4, novasPorDia: VOCAB.novasPorDia };
};
async function salvarProgresso(ctx, fn) {
  const doc = await T.ProgressoVocabTCF.findOne({ alunoId: ctx.userId }) || new T.ProgressoVocabTCF({ alunoId: ctx.userId, dados: {} });
  const dados = doc.dados || {};
  fn(dados);
  doc.dados = dados; doc.markModified("dados"); doc.atualizadoEm = new Date();
  await doc.save();
  return dados;
}
// lista = [{ id, ok }] — mesma regra do script: acerto sobe a caixa, erro volta para a 1.
// lista = [{ id, ok }]. Errou: entra no caderno de erros (__err[id] = 0); no caderno, cada acerto
// conta e, com « acertosSair » acertos, a carta sai. Devolve { __err, __vu } para a tela.
F.salvarQuizVocab = async (ctx, lista) => {
  const meta = VOCAB.acertosSair || 4;
  const dados = await salvarProgresso(ctx, d => {
    d.__err = d.__err || {}; d.__vu = d.__vu || {};
    for (const x of (lista || []).slice(0, 200)) {
      if (!x || !x.id) continue;
      d.__vu[x.id] = 1;
      if (!x.ok) d.__err[x.id] = 0;
      else if (d.__err[x.id] !== undefined) { d.__err[x.id]++; if (d.__err[x.id] >= meta) delete d.__err[x.id]; }
    }
  });
  return { __err: dados.__err || {}, __vu: dados.__vu || {} };
};
F.salvarRevisoes = F.salvarQuizVocab;

// ---------------- recordes (dictée / réécriture) ----------------
F.obterMelhoresResultados = async ctx => (await T.RecordeTCF.findOne({ alunoId: ctx.userId }).lean())?.dados || {};
F.salvarMelhorResultado = async (ctx, id, tipo, pct) => {
  tipo = tipo === "d" ? "d" : "r";
  pct = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
  if (!id) throw erro("Modèle introuvable.");
  const doc = await T.RecordeTCF.findOne({ alunoId: ctx.userId }) || new T.RecordeTCF({ alunoId: ctx.userId, dados: {} });
  const tudo = doc.dados || {}, x = (tudo[id] = tudo[id] || {});
  let r = x[tipo]; const antes = r ? r.m : null;
  if (!r) r = x[tipo] = { m: pct, p: pct, n: 0, d: Date.now() };
  r.n++;
  if (pct > r.m) { r.m = pct; r.d = Date.now(); }
  doc.dados = tudo; doc.markModified("dados");
  await doc.save();
  return { melhor: r.m, primeiro: r.p, tentativas: r.n, antes, recorde: antes === null || pct > antes, pct };
};

// ---------------- presença (só a equipe vê quem está online) ----------------
const presenca = new Map();
const ROTULOS_TELA = { "tela-accueil": "Accueil", "tela-liste": "Liste des sujets", "tela-modele": "Modèle", "tela-axe": "Axe thématique", "tela-epreuve": "Épreuve",
  "tela-notes": "Mes notes", "tela-carnet": "Mon cahier", "tela-taches": "Mes devoirs", "tela-atelier": "Atelier dictée", "tela-outils": "Boîte à outils", "tela-hub": "Hub" };
// Nomes das telas do app em português, para o Acompanhamento da Gestão de Alunos.
const TELAS_PT = { "tela-accueil": "Início", "tela-liste": "Lista de temas", "tela-modele": "Tema", "tela-axe": "Eixo temático", "tela-epreuve": "Prova escrita de 60 min",
  "tela-notes": "Minhas notas", "tela-carnet": "Meu caderno", "tela-taches": "Minhas tarefas", "tela-atelier": "Ditado", "tela-outils": "Caixa de ferramentas", "tela-hub": "Hub" };
F.sinalizarPresenca = async (ctx, tela, detalhe) => {
  if (ctx.prof) return false;
  const u = await usuario(ctx);
  const ant = presenca.get(ctx.userId);
  presenca.set(ctx.userId, { n: u.nome || u.email, email: u.email, curso: ctx.courseType, tela: ROTULOS_TELA[tela] || tela || "", det: String(detalhe || "").slice(0, 120), t: Date.now(), desde: ant ? ant.desde : Date.now() });
  // presença do site inteiro (Gestão de Alunos → Acompanhamento): a tela exata do app
  const telaPt = TELAS_PT[tela] || ROTULOS_TELA[tela] || tela || "";
  require("../utils/presencaSite").registrar(ctx.userId, { area: "Ambiente de Produção", pagina: telaPt, atividade: [telaPt, detalhe].filter(Boolean).join(" · "), doApp: true });
  const [avisos, msgs] = await Promise.all([F.meusAvisos(ctx), T.MensagemTCF.countDocuments({ alunoId: ctx.userId, feito: false })]);
  return { bloqueado: false, avisos: avisos.length, mensagens: msgs };
};

// Frases sem áudio Coqui: guardadas para scripts_tts/gerar_audios_modeles.py gerar depois.
F.registrarAudiosFaltantes = async (ctx, chaves) => {
  const novas = (Array.isArray(chaves) ? chaves : []).slice(0, 200).map(c => String(c).slice(0, 600)).filter(c => /^[AB]\|./.test(c));
  if (!novas.length) return 0;
  const cfg = await config();
  const f = cfg.audiosFaltantes || {};
  if (Object.keys(f).length > 20000) return 0;
  // chave do Mongo não pode ter "." nem começar com "$": guarda o texto como valor, indexado pelo hash
  for (const c of novas) f[crypto.createHash("sha256").update(c).digest("hex")] = c;
  cfg.audiosFaltantes = f; cfg.markModified("audiosFaltantes");
  await cfg.save();
  return novas.length;
};

// ---------------- dossiê de leitura do sujet ----------------
F.obterDossierSujet = async (ctx, tache, id) => {
  const sujet = M.acharTema(tache, id);
  if (!sujet) throw erro("Sujet introuvable.", 404);
  const modelo = M.ehManual(tache, id) ? sujet : await lerModeloIA(id);
  const { obterDossier } = require("../utils/dossierSujet");
  const d = await obterDossier(tache, sujet, (modelo && modelo.k) || []);
  return { textos: d.textos || [], imprensa: d.imprensa || [] };
};

// ---------------- sala ao vivo (aluno faz o sujet com um professor acompanhando) ----------------
const canalSala = id => "modeles:sala:" + id;
const fmtSala = (s, nomes) => ({ id: String(s._id), alunoId: String(s.alunoId), nome: nomes ? nomes[String(s.alunoId)] || "" : "", curso: s.courseType, tache: s.tache, sujetId: s.sujetId,
  titulo: s.titulo, status: s.status, motivoFim: s.motivoFim || "", expiraEm: s.status === "aguardando" ? new Date(new Date(s.inicio).getTime() + PRAZO_SALA_MS) : null, professorNome: s.professorNome || "", texto: s.texto, transcricao: s.transcricao, mensagens: s.mensagens || [], marcas: (s.marcas || []).map(m => ({ id: m.id, trecho: m.trecho, ocorrencia: m.ocorrencia || 0, categoria: m.categoria, nome: m.nome, cor: m.cor, comentario: m.comentario || "", por: m.por || "" })), inicio: s.inicio, atualizadoEm: s.atualizadoEm });
async function salaDoAluno(ctx, id) {
  const s = await T.SalaAoVivoTCF.findOne({ _id: oid(id), alunoId: ctx.userId });
  if (!s) throw erro("Salle introuvable.", 404);
  return s;
}
// Pedido de professor ao vivo: se ninguém aceitar em 3 minutos, é cancelado (o aluno é avisado
// e a sala some das listas da equipe). Vale também depois de um reinício do servidor.
const PRAZO_SALA_MS = 3 * 60 * 1000;
async function expirarSala(id) {
  const s = await T.SalaAoVivoTCF.findOneAndUpdate({ _id: id, status: "aguardando" }, { status: "encerrada", motivoFim: "expirou", atualizadoEm: new Date() }, { new: true });
  if (!s) return false;
  canais.enviar(canalSala(s._id), "estado", { status: "encerrada", motivo: "expirou" });
  avisarEquipe("sala", { id: String(s._id), acao: "fim", motivo: "expirou" });
  return true;
}
async function expirarSalasVencidas() {
  const vencidas = await T.SalaAoVivoTCF.find({ status: "aguardando", inicio: { $lt: new Date(Date.now() - PRAZO_SALA_MS) } }).select("_id").lean();
  for (const s of vencidas) await expirarSala(s._id);
}
F.chamarProfessorAoVivo = async (ctx, tache, sujetId) => {
  const sujet = M.acharTema(tache, sujetId);
  if (!sujet) throw erro("Sujet introuvable.", 404);
  await T.SalaAoVivoTCF.updateMany({ alunoId: ctx.userId, status: { $ne: "encerrada" } }, { status: "encerrada" });
  const u = await usuario(ctx);
  const s = await T.SalaAoVivoTCF.create({ alunoId: ctx.userId, courseType: ctx.courseType, tache, sujetId, titulo: String(sujet.titre || M.temaCurto(M.consigneDe(sujet))).slice(0, 160) });
  avisarEquipe("sala", { ...fmtSala(s, { [ctx.userId]: u.nome }), acao: "nova" });
  const t = setTimeout(() => expirarSala(s._id).catch(() => {}), PRAZO_SALA_MS);
  if (t.unref) t.unref();
  return fmtSala(s);
};
F.atualizarSalaAoVivo = async (ctx, id, dados) => {
  const s = await salaDoAluno(ctx, id);
  if (s.status === "aguardando" && Date.now() - new Date(s.inicio).getTime() > PRAZO_SALA_MS) { await expirarSala(s._id); return { encerrada: true, motivo: "expirou" }; }
  if (s.status === "encerrada") return { encerrada: true, motivo: s.motivoFim || "" };
  if (typeof dados?.texto === "string") s.texto = dados.texto.slice(0, 8000);
  if (typeof dados?.transcricao === "string") s.transcricao = dados.transcricao.slice(0, 8000);
  s.atualizadoEm = new Date();
  await s.save();
  const evt = { id: String(s._id), texto: s.texto, transcricao: s.transcricao, tempo: dados?.tempo || "" };
  canais.enviar(canalSala(s._id), "conteudo", evt);
  avisarEquipe("sala", { ...evt, acao: "conteudo" });
  return { ok: true, status: s.status, professorNome: s.professorNome };
};
F.mensagemSala = async (ctx, id, texto) => {
  texto = String(texto || "").trim().slice(0, 1000);
  if (!texto) return false;
  const s = ctx.prof ? await T.SalaAoVivoTCF.findById(oid(id)) : await salaDoAluno(ctx, id);
  if (!s) throw erro("Salle introuvable.", 404);
  const u = await usuario(ctx);
  const m = { de: ctx.prof ? "professor" : "aluno", texto, data: new Date() };
  s.mensagens.push(m); s.atualizadoEm = new Date();
  await s.save();
  canais.enviar(canalSala(s._id), "msg", { ...m, nome: u.nome });
  return true;
};
F.encerrarSala = async (ctx, id) => {
  const s = ctx.prof ? await T.SalaAoVivoTCF.findById(oid(id)) : await salaDoAluno(ctx, id);
  if (!s) return true;
  if (s.status === "encerrada") return true;
  s.status = "encerrada"; s.motivoFim = ctx.prof ? "professor" : "aluno"; s.atualizadoEm = new Date();
  await s.save();
  canais.enviar(canalSala(s._id), "estado", { status: "encerrada", motivo: s.motivoFim });
  avisarEquipe("sala", { id: String(s._id), acao: "fim" });
  return true;
};

// ------------------------------------------------------------------ funções (professor)
prof("listarAlunos", async () => (await alunosProducao()).map(a => ({ email: a.id, nome: a.nome, doc: true, ativo: true, grupo: a.cursos.join(" · "), eixos: M.EIXOS.ordem, acesso: {}, emailReal: a.email })));

// Chaves de eixo do script: no site todos os eixos ficam abertos (o professor oculta temas no quadro).
prof("listarChavesEixos", async () => []);

prof("listarSessoes", async () => {
  const ss = await T.SessaoTCF.find({}).sort({ criadoEm: -1 }).lean();
  const nomes = await mapaNomes(ss.flatMap(s => s.alvo?.alunos || []));
  return ss.map(s => ({
    ID: String(s._id), Nom: s.nome, "Tâche 1": s.ET1 || "", "Tâche 2": s.ET2 || "", "Tâche 3": s.ET3 || "", "Élèves": nomeAlvo(s.alvo, nomes), Active: s.ativa ? "SIM" : "NÃO",
    "Créée le": s.criadoEm, "Créée par": s.criadoPorNome, "Oral T1": s.T1 || "", "Oral T2": s.T2 || "", "Oral T3": s.T3 || "",
    titulos: ["ET1", "ET2", "ET3"].map(t => { const sj = s[t] && M.acharTema(t, s[t]); return sj ? (sj.t || sj.titre) : (s[t] || ""); }),
    orais: ["T1", "T2", "T3"].map(t => { const sj = s[t] && M.acharTema(t, s[t]); return sj ? (sj.titre || sj.t) : (s[t] || ""); })
  }));
});
prof("criarSessao", async (ctx, dados) => {
  let algum = false;
  for (const t of M.TACHES) { if (dados[t]) { if (!M.acharTema(t, dados[t])) throw erro(`Sujet invalide (${t}).`); algum = true; } else dados[t] = ""; }
  if (!algum) throw erro("Choisissez au moins une tâche (écrite ou orale).");
  const u = await usuario(ctx);
  const s = await T.SessaoTCF.create({ nome: dados.nome || "Épreuve du " + new Date().toLocaleDateString("fr-CA"), ET1: dados.ET1, ET2: dados.ET2, ET3: dados.ET3, T1: dados.T1, T2: dados.T2, T3: dados.T3,
    alvo: alvoDe(dados.alunos), criadoPor: ctx.userId, criadoPorNome: u.nome });
  return String(s._id);
});
prof("alternarSessao", async (ctx, id, ativa) => { await T.SessaoTCF.updateOne({ _id: oid(id) }, { ativa: !!ativa }); return true; });
prof("apagarSessao", async (ctx, id) => { await T.SessaoTCF.deleteOne({ _id: oid(id) }); return true; });

prof("criarDevoir", async (ctx, dados) => {
  const tema = M.acharTema(dados.tache, dados.modelo);
  if (!tema) throw erro("Modèle introuvable.");
  if (!M.TIPOS_DEVOIR[dados.tipo]) throw erro("Type de devoir invalide.");
  const u = await usuario(ctx);
  const d = await T.DevoirTCF.create({ titre: dados.titre || tema.titre || String(tema.t).slice(0, 90), tache: dados.tache, modelo: dados.modelo, tipo: dados.tipo,
    mensagem: String(dados.mensagem || "").slice(0, 500), eixo: tema.e, alvo: alvoDe(dados.alunos), criadoPor: ctx.userId, criadoPorNome: u.nome });
  // Também aparece no Dever de Casa do site de cada aluno.
  const ids = d.alvo.todos ? (await alunosProducao()).map(a => a.id) : d.alvo.alunos.map(String);
  await require("../utils/devoirsSync").espelharDevoirNoSite(d, ids).catch(e => console.error("devoir→dever:", e.message));
  return String(d._id);
});
prof("listarDevoirsProf", async () => {
  const [ds, alunos] = await Promise.all([T.DevoirTCF.find({}).sort({ criadoEm: -1 }).lean(), alunosProducao()]);
  return ds.map(d => {
    const alvo = alunos.filter(a => alvoInclui(d.alvo, a.id));
    const quem = new Set((d.feitos || []).map(f => String(f.alunoId)));
    return { ID: String(d._id), Titre: d.titre, "Tâche": d.tache, "Modèle": d.modelo, Type: d.tipo, Message: d.mensagem, "Élèves": d.alvo?.todos ? "TOUS" : `${alvo.length} élève(s)`,
      Active: d.ativo ? "SIM" : "NÃO", "Créé le": d.criadoEm, Par: d.criadoPorNome, Axe: d.eixo, alvo: alvo.length,
      feitos: alvo.filter(a => quem.has(a.id)).map(a => a.nome), faltam: alvo.filter(a => !quem.has(a.id)).map(a => a.nome), tipoNome: M.TIPOS_DEVOIR[d.tipo] || d.tipo };
  });
});
prof("alternarDevoir", async (ctx, id, ativo) => {
  const d = await T.DevoirTCF.findByIdAndUpdate(oid(id), { ativo: !!ativo }, { new: true });
  const sync = require("../utils/devoirsSync");
  if (d && !ativo) await sync.removerEspelho(d._id);
  if (d && ativo) await sync.espelharDevoirNoSite(d, d.alvo.todos ? (await alunosProducao()).map(a => a.id) : d.alvo.alunos.map(String));
  return true;
});
prof("apagarDevoir", async (ctx, id) => { await T.DevoirTCF.deleteOne({ _id: oid(id) }); await require("../utils/devoirsSync").removerEspelho(oid(id)); return true; });

prof("adicionarTemaDoMes", async (ctx, item) => {
  const tema = M.acharTema(item.tache, item.id);
  if (!tema) throw erro("Sujet introuvable.");
  if (!(await T.TemaMesTCF.exists({ mes: mesAtual(), sujetId: item.id }))) {
    const u = await usuario(ctx);
    await T.TemaMesTCF.create({ mes: mesAtual(), tache: item.tache, sujetId: item.id, titre: tema.titre || String(tema.t).slice(0, 160), eixo: tema.e, por: u.nome });
  }
  ctx._cache = {};
  return temasDoMes(ctx);
});
prof("removerTemaDoMes", async (ctx, id) => { await T.TemaMesTCF.deleteOne({ mes: mesAtual(), sujetId: id }); ctx._cache = {}; return temasDoMes(ctx); });
prof("sugerirTemasDoMes", async (ctx, porTache) => {
  porTache = Math.min(Number(porTache) || 2, 5);
  const usados = new Set((await T.TemaMesTCF.find({}).select("sujetId").lean()).map(r => r.sujetId));
  const sug = [];
  for (const t of M.TACHES) {
    M.modelosManuais(t).concat(M.sujetsDaTache(t)).filter(x => !usados.has(x.id)).sort((a, b) => (b.f || 1) - (a.f || 1)).slice(0, porTache)
      .forEach(x => sug.push({ tache: t, id: x.id, titre: x.titre || String(x.t).slice(0, 160), e: x.e, f: x.f || 1 }));
  }
  return sug;
});

const fmtPost = p => ({ ordem: p.ordem, titre: p.titre, texto: p.texto, imagem: imagemBlog(p.imagem), imagemBruta: p.imagem, tache: p.tache, id: p.sujetId, visivel: p.visivel, ref: String(p._id) });
prof("listarBlog", async () => (await T.PostBlogTCF.find({}).sort({ ordem: 1, criadoEm: -1 }).lean()).map(fmtPost));
prof("salvarPostBlog", async (ctx, d) => {
  if (!String(d.titre || "").trim()) throw erro("Donnez un titre à l'article.");
  const campos = { ordem: Number(d.ordem) || 1, titre: String(d.titre).slice(0, 160), texto: String(d.texto || "").slice(0, 600), imagem: String(d.imagem || "").slice(0, 600),
    tache: d.tache || "", sujetId: d.id || "", visivel: d.visivel !== false };
  if (d.ref && oid(d.ref)) await T.PostBlogTCF.updateOne({ _id: oid(d.ref) }, campos); else await T.PostBlogTCF.create(campos);
  return F.listarBlog(ctx);
});
prof("apagarPostBlog", async (ctx, ref) => { await T.PostBlogTCF.deleteOne({ _id: oid(ref) }); return F.listarBlog(ctx); });

prof("criarAviso", async (ctx, d) => {
  if (!String(d.message || "").trim()) throw erro("Écrivez le message.");
  const u = await usuario(ctx);
  await T.AvisoTCF.create({ titre: String(d.titre || "Avis de votre professeure").slice(0, 120), message: String(d.message).slice(0, 1500), alvo: alvoDe(d.alunos), de: u.nome });
  return F.listarAvisosProf(ctx);
});
prof("listarAvisosProf", async () => {
  const [as, alunos] = await Promise.all([T.AvisoTCF.find({}).sort({ criadoEm: -1 }).lean(), alunosProducao()]);
  return as.map(a => {
    const alvo = alunos.filter(x => alvoInclui(a.alvo, x.id)), lidos = new Set((a.lidos || []).map(String));
    return { id: String(a._id), data: a.criadoEm, titre: a.titre, message: a.message, ativo: a.ativo, alvo: a.alvo?.todos ? "TOUS" : `${alvo.length} élève(s)`, total: alvo.length, lidos: alvo.filter(x => lidos.has(x.id)).length };
  });
});
prof("apagarAviso", async (ctx, id) => { await T.AvisoTCF.deleteOne({ _id: oid(id) }); return F.listarAvisosProf(ctx); });

prof("enviarMensagem", async (ctx, alunoId, texto) => {
  texto = String(texto || "").trim().slice(0, 1500);
  if (!texto) throw erro("Écrivez un message.");
  if (!oid(alunoId) || !(await User.exists({ _id: oid(alunoId) }))) throw erro("Élève introuvable.");
  const u = await usuario(ctx);
  await T.MensagemTCF.create({ alunoId: oid(alunoId), texto, de: u.nome });
  return true;
});
prof("apagarMensagem", async (ctx, id) => { await T.MensagemTCF.deleteOne({ _id: oid(id) }); return true; });

// Quadro "Thèmes P.O. / P.E.": o que está marcado fica visível para os alunos.
prof("quadroTemas", async (ctx, tache) => {
  const cfg = await config(), ocultos = cfg.ocultos || {};
  const prontos = new Set((await T.ModeleIA.find({ tache }).select("sujetId").lean()).map(x => x.sujetId));
  return ctx.P.modelosManuais(tache).map(m => ({ id: m.id, e: m.e, t: m.titre, f: m.f || 1, manual: 1, pub: ocultos[m.id] ? 0 : 1, ia: 1 }))
    .concat(ctx.P.sujetsDaTache(tache).map(s => ({ id: s.id, e: s.e, t: String(s.t || "").slice(0, 200), f: s.f || 1, pub: ocultos[s.id] ? 0 : 1, ia: prontos.has(s.id) ? 1 : 0 })));
});
prof("publicarTemas", async (ctx, tache, ids, publicar) => {
  const cfg = await config();
  const ocultos = { ...(cfg.ocultos || {}) };
  for (const id of ids || []) { if (publicar) delete ocultos[id]; else ocultos[id] = 1; }
  cfg.ocultos = ocultos; cfg.markModified("ocultos");
  await cfg.save();
  return { n: (ids || []).length };
});

prof("listarCartasProf", async () => (await T.CartaVocabTCF.find({}).sort({ criadoEm: -1 }).lean())
  .map(c => ({ linha: String(c._id), deck: c.deck, mot: c.mot, trad: c.traduction, ex: c.exemple, dica: c.astuce, ativo: c.ativo })));
prof("adicionarCarta", async (ctx, d) => {
  if (!String(d.mot || "").trim()) throw erro("Écrivez le mot.");
  await T.CartaVocabTCF.create({ deck: String(d.deck || "Mots de la semaine").slice(0, 80), mot: String(d.mot).slice(0, 120), traduction: String(d.trad || "").slice(0, 200), exemple: String(d.ex || "").slice(0, 300), astuce: String(d.dica || "").slice(0, 400) });
  return F.listarCartasProf(ctx);
});
prof("apagarCarta", async (ctx, linha) => { await T.CartaVocabTCF.deleteOne({ _id: oid(linha) }); return F.listarCartasProf(ctx); });

prof("listarOnline", async () => {
  const agora = Date.now(), vivos = [];
  for (const [id, d] of presenca) {
    if (agora - d.t > 3 * 60 * 1000) { presenca.delete(id); continue; }
    vivos.push({ ...d, id, ha: Math.round((agora - d.t) / 1000), min: Math.round((agora - d.desde) / 60000), g: d.curso });
  }
  return vivos.sort((a, b) => a.n.localeCompare(b.n));
});

// Fila do Sistema de Correção vista do Espace professeur (as mesmas Producao: corrigir aqui ou lá
// dá no mesmo). situacao: "pendentes" (em fila / em correção) ou "corrigidas".
prof("filaCorrecao", async (ctx, filtro) => {
  const f = filtro || {};
  const q = { status: f.situacao === "corrigidas" ? { $in: ["corrigido", "devolvido"] } : { $in: ["em_fila", "em_correcao"] } };
  if (f.modalidade === "oral") q.modalidade = "oral";
  else if (f.modalidade === "textual") q.modalidade = { $ne: "oral" };
  if (f.alunoId && oid(f.alunoId)) q.alunoId = oid(f.alunoId);
  const ps = await Producao.find(q).populate("temaId", "titulo courseType nivel").populate("alunoId", "nome email").populate("professorId", "nome")
    .select("protocolo temaId alunoId professorId modalidade status modoCorrecao contagemPalavras dataEnvio dataCorrecao origem avaliacao.notaTotal avaliacao.notaMaxima avaliacao.corretor avaliacao.corretorNome")
    .sort(f.situacao === "corrigidas" ? { dataCorrecao: -1 } : { dataEnvio: 1 }).limit(200).lean();
  return ps.map(p => ({
    id: String(p._id), protocolo: p.protocolo, aluno: p.alunoId?.nome || p.alunoId?.email || "", alunoId: String(p.alunoId?._id || ""),
    titulo: p.temaId?.titulo || "", curso: p.temaId?.courseType || "", nivel: p.temaId?.nivel || "", tache: p.origem?.tache || "",
    modalidade: p.modalidade || "textual", status: p.status, minha: p.status === "em_correcao" && String(p.professorId?._id || "") === ctx.userId,
    outro: p.status === "em_correcao" && String(p.professorId?._id || "") !== ctx.userId ? (p.professorId?.nome || "outro professor") : "",
    data: p.dataEnvio, dataCorrecao: p.dataCorrecao, palavras: p.contagemPalavras || 0,
    nota: p.avaliacao?.notaTotal ?? null, notaMax: p.avaliacao?.notaMaxima || 20,
    corretor: p.avaliacao?.corretor === "ia" || p.modoCorrecao === "ia" ? "IA" : (p.avaliacao?.corretorNome || p.professorId?.nome || "")
  }));
});
prof("alunosCorrecao", async () => (await alunosProducao()).map(a => ({ id: a.id, nome: a.nome })));

prof("listarSalasAoVivo", async () => {
  await expirarSalasVencidas();
  const ss = await T.SalaAoVivoTCF.find({ status: { $ne: "encerrada" }, atualizadoEm: { $gte: new Date(Date.now() - 3 * 3600 * 1000) } }).sort({ inicio: -1 }).lean();
  const nomes = await mapaNomes(ss.map(s => s.alunoId));
  return ss.map(s => fmtSala(s, nomes));
});
prof("entrarSala", async (ctx, id) => {
  const s = await T.SalaAoVivoTCF.findById(oid(id));
  if (s && s.status === "aguardando" && Date.now() - new Date(s.inicio).getTime() > PRAZO_SALA_MS) { await expirarSala(s._id); throw erro("Cette demande a expiré : personne ne l'a acceptée en 3 minutes."); }
  if (!s || s.status === "encerrada") throw erro("Cette salle est fermée.");
  const u = await usuario(ctx);
  s.status = "atendimento"; s.professorId = ctx.userId; s.professorNome = u.nome; s.atualizadoEm = new Date();
  await s.save();
  canais.enviar(canalSala(s._id), "estado", { status: "atendimento", professorNome: u.nome });
  avisarEquipe("sala", { id: String(s._id), acao: "atendimento", professorNome: u.nome });
  const nomes = await mapaNomes([s.alunoId]);
  return fmtSala(s, nomes);
});
// Roteiro do professor: consigne, documentos, modelo (manual, IA ou guia) e trame da tâche.
// Correção por cores ao vivo: o professor grifa um trecho com uma categoria (cor) e um comentário;
// o aluno e a equipe na sala recebem a lista atualizada na hora (evento « marcas »).
const fmtMarca = m => ({ id: m.id, trecho: m.trecho, ocorrencia: m.ocorrencia || 0, categoria: m.categoria, nome: m.nome, cor: m.cor, comentario: m.comentario || "", por: m.por || "" });
prof("marcarSala", async (ctx, id, marca) => {
  const s = await T.SalaAoVivoTCF.findById(oid(id));
  if (!s || s.status === "encerrada") throw erro("Cette salle est fermée.");
  const trecho = String(marca?.trecho || "").slice(0, 600);
  if (!trecho.trim()) throw erro("Sélectionnez un passage du texte.");
  const cor = /^#[0-9a-f]{6}$/i.test(String(marca?.cor || "")) ? marca.cor : "#dc2626";
  const u = await usuario(ctx);
  s.marcas.push({ id: Math.random().toString(36).slice(2, 10), trecho, ocorrencia: Math.max(0, Math.min(500, Number(marca?.ocorrencia) || 0)),
    categoria: String(marca?.categoria || "").slice(0, 40), nome: String(marca?.nome || "").slice(0, 80), cor, comentario: String(marca?.comentario || "").slice(0, 600), por: u.nome || "" });
  if (s.marcas.length > 300) s.marcas = s.marcas.slice(-300);
  s.atualizadoEm = new Date();
  await s.save();
  const marcas = s.marcas.map(fmtMarca);
  canais.enviar(canalSala(s._id), "marcas", { marcas });
  return marcas;
});
prof("desmarcarSala", async (ctx, id, marcaId) => {
  const s = await T.SalaAoVivoTCF.findById(oid(id));
  if (!s) throw erro("Salle introuvable.", 404);
  s.marcas = s.marcas.filter(m => m.id !== String(marcaId || ""));
  s.atualizadoEm = new Date();
  await s.save();
  const marcas = s.marcas.map(fmtMarca);
  canais.enviar(canalSala(s._id), "marcas", { marcas });
  return marcas;
});
prof("roteiroSujet", async (ctx, tache, id) => {
  const sujet = M.acharTema(tache, id);
  if (!sujet) throw erro("Sujet introuvable.", 404);
  const modelo = M.ehManual(tache, id) ? sujet : (await lerModeloIA(id)) || M.modeloGuia(tache, sujet);
  return { tache, nomeTache: M.nomeTacheDe(tache, sujet), consigne: M.consigneDe(sujet), d1: sujet.d1 || "", d2: sujet.d2 || "", modelo, trame: M.trameDe(tache, sujet),
    eixo: (M.EIXOS.eixos[sujet.e] || {}).nome || sujet.e, argumentos: { pour: (M.EIXOS.eixos[sujet.e] || {}).argumentsPour || [], contre: (M.EIXOS.eixos[sujet.e] || {}).argumentsContre || [] } };
});

// Épreuves em andamento agora (acompanhamento ao vivo pela equipe).
prof("listarEpreuvesAoVivo", async () => {
  const eps = await T.EpreuveTCF.find({ status: "em_curso", ultimoSinal: { $gte: new Date(Date.now() - 3 * 3600 * 1000) } }).sort({ ultimoSinal: -1 }).lean();
  const nomes = await mapaNomes(eps.map(e => e.alunoId));
  const agora = Date.now();
  return eps.map(e => ({ id: String(e._id), alunoId: String(e.alunoId), nome: nomes[String(e.alunoId)] || "", curso: e.courseType, sessao: !!e.sessaoId, consumido: e.consumido,
    fim: fimEfetivo(e, agora), inicio: e.inicio, textes: e.textes, sujets: sujetsCompletos(e.sujets || {}), ultimoSinal: e.ultimoSinal }));
});

// Produções escritas / orais do Ambiente de Produção (ligadas ao Sistema de Correção).
async function listarProducoesModeles(filtro, modalidade) {
  const q = { "origem.tipo": "modeles", modalidade };
  if (filtro?.aluno && oid(filtro.aluno)) q.alunoId = oid(filtro.aluno);
  if (filtro?.pendentes) q.status = { $in: ["em_fila", "em_correcao", "aguardando_revisao"] };
  const ps = await Producao.find(q).populate("temaId", "titulo").sort({ dataEnvio: -1 }).limit(120).lean();
  const nomes = await mapaNomes(ps.map(p => p.alunoId));
  return ps.map(p => linhaProducao(p, nomes));
}
prof("listarProducoes", (ctx, filtro) => listarProducoesModeles(filtro, "textual"));
prof("listarProducoesOrais", (ctx, filtro) => listarProducoesModeles(filtro, "oral"));
prof("obterAudioAluno", async (ctx, id) => "/api/modeles/audio/" + id);
prof("apagarProducao", async (ctx, tipo, id) => {
  const p = await Producao.findOne({ _id: oid(id), "origem.tipo": "modeles" });
  if (!p) throw erro("Production introuvable.");
  p.status = "arquivado"; p.historicoStatus.push({ status: "arquivado", data: new Date() });
  await p.save();
  return true;
});

// Nota por competência (6 critérios 0–10 → /20). Com `ref` (uma Producao), também corrige a
// produção no Sistema de Correção e manda as correções para o carnet do aluno.
prof("salvarAvaliacaoCompetencias", async (ctx, dados) => {
  const crit = M.CRITERES[dados.epreuve];
  if (!crit) throw erro("Épreuve invalide.");
  const notas = (dados.notas || []).slice(0, crit.length).map(n => {
    n = Number(String(n).replace(",", "."));
    if (isNaN(n) || n < 0 || n > 10) throw erro("Chaque compétence est notée de 0 à 10.");
    return n;
  });
  if (notas.length !== crit.length) throw erro("Notez toutes les compétences.");
  const alunoId = oid(dados.aluno);
  if (!alunoId) throw erro("Élève introuvable.");
  const total = Math.round(notas.reduce((a, n) => a + n, 0) / (notas.length * 10) * 20 * 2) / 2;
  const comentario = String(dados.comentario || "").trim();
  const u = await usuario(ctx);
  const producaoId = oid(dados.ref);
  await T.CompetenciaTCF.create({ alunoId, epreuve: dados.epreuve, tache: dados.tache || "", sujet: dados.sujet || "", producaoId, notas, total, comentario, professor: u.nome });
  if (producaoId) {
    const p = await Producao.findById(producaoId);
    if (p) {
      const { avaliar } = require("../utils/gradesProva");
      const av = avaliar("TCF", p.modalidade === "oral" ? "oral" : "textual", {}, { notaFinal: total });
      p.avaliacao = { ...av, criterios: crit.map((c, i) => ({ id: "c" + (i + 1), nome: c, max: 10, nota: notas[i] })), comentarioGeral: comentario,
        corretor: "professor", corretorNome: u.nome, pontosFortes: [], aMelhorar: [], correcoes: [] };
      p.status = "corrigido"; p.dataCorrecao = new Date(); p.professorId = ctx.userId;
      p.historicoStatus.push({ status: "corrigido", data: new Date() });
      await p.save();
      require("../utils/sse").transmitir("producao-atualizada", { alunoId: String(p.alunoId), producaoId: String(p._id) });
    }
  }
  return { ok: true, total, nclc: M.nclc(total) };
});
prof("listarNotasOrais", async (ctx, alunoId) => {
  const q = { epreuve: "PO" };
  if (oid(alunoId)) q.alunoId = oid(alunoId);
  const l = await T.CompetenciaTCF.find(q).sort({ criadoEm: -1 }).limit(60).lean();
  const nomes = await mapaNomes(l.map(x => x.alunoId));
  return l.map(r => ({ Date: r.criadoEm, "E-mail": String(r.alunoId), Nom: nomes[String(r.alunoId)] || "", "Tâche": r.tache, Sujet: r.sujet, "Note /20": r.total, Commentaire: r.comentario, Professeur: r.professor, ID: String(r._id) }));
});
prof("salvarNotaOral", async (ctx, alunoId, tache, sujet, nota, comentario) => {
  nota = Number(String(nota).replace(",", "."));
  if (isNaN(nota) || nota < 0 || nota > 20) throw erro("La note doit être comprise entre 0 et 20.");
  const u = await usuario(ctx);
  await T.CompetenciaTCF.create({ alunoId: oid(alunoId), epreuve: "PO", tache, sujet, notas: [], total: nota, comentario, professor: u.nome });
  return { ok: true, nclc: M.nclc(nota) };
});

prof("listarSuivi", async () => {
  const alunos = await alunosProducao();
  const ids = alunos.map(a => oid(a.id));
  const [pend, msgs, comp] = await Promise.all([
    Producao.aggregate([{ $match: { alunoId: { $in: ids }, "origem.tipo": "modeles", status: { $in: ["em_fila", "em_correcao"] } } }, { $group: { _id: "$alunoId", n: { $sum: 1 } } }]),
    T.MensagemTCF.aggregate([{ $match: { alunoId: { $in: ids }, feito: false } }, { $group: { _id: "$alunoId", n: { $sum: 1 } } }]),
    T.CompetenciaTCF.aggregate([{ $match: { alunoId: { $in: ids } } }, { $group: { _id: { a: "$alunoId", e: "$epreuve" }, m: { $avg: "$total" } } }])
  ]);
  const mp = Object.fromEntries(pend.map(x => [String(x._id), x.n])), mm = Object.fromEntries(msgs.map(x => [String(x._id), x.n]));
  const media = (id, ep) => { const x = comp.find(c => String(c._id.a) === id && c._id.e === ep); return x ? Math.round(x.m * 10) / 10 : null; };
  return alunos.map(a => ({ email: a.id, emailReal: a.email, nome: a.nome, grupo: a.cursos.join(" · "), ativo: true, liberados: M.TACHES.length * M.EIXOS.ordem.length, total: M.TACHES.length * M.EIXOS.ordem.length,
    abonnement: "actif", aCorrigir: mp[a.id] || 0, mensagens: mm[a.id] || 0, mediaPE: media(a.id, "PE"), mediaPO: media(a.id, "PO") }));
});
prof("obterFicheEleve", async (ctx, alunoId) => {
  const u = await User.findById(oid(alunoId)).select("nome email creditosCorrecao").lean();
  if (!u) throw erro("Élève introuvable.");
  const actx = { userId: String(u._id), prof: false, _cache: {}, courseType: ctx.courseType };
  const ps = await Producao.find({ alunoId: u._id, "origem.tipo": "modeles" }).populate("temaId", "titulo").sort({ dataEnvio: -1 }).limit(70).lean();
  const ia = await T.CorrecaoIATCF.find({ alunoId: u._id }).select("note").lean();
  const [devoirs, sessoes, msgs, carnet] = await Promise.all([meusDevoirs(actx), sessoesDoAluno(actx), T.MensagemTCF.find({ alunoId: u._id }).sort({ criadoEm: -1 }).lean(), T.CarnetProducao.countDocuments({ alunoId: u._id })]);
  const nomes = { [String(u._id)]: u.nome };
  return {
    aluno: { email: String(u._id), emailReal: u.email, nome: u.nome || u.email, grupo: "", ativo: true, producao: "SIM", doc: false, modulos: MODULOS, intro: "", creditos: u.creditosCorrecao || 0, carnet },
    acesso: {}, competencias: await resumoCompetencias(u._id), criterios: M.CRITERES,
    producoesEscritas: ps.filter(p => p.modalidade !== "oral").map(p => linhaProducao(p, nomes)),
    producoesOrais: ps.filter(p => p.modalidade === "oral").map(p => linhaProducao(p, nomes)),
    ia: { n: ia.length, media: ia.length ? Math.round(ia.reduce((a, r) => a + (r.note || 0), 0) / ia.length * 10) / 10 : null },
    devoirs, sessoes, mensagens: msgs.map(fmtMsg), modelosIndiv: []
  };
});

prof("partilhar", async (ctx, d) => {
  if (!d.id) throw erro("Modèle introuvable.");
  const u = await usuario(ctx);
  await T.PartilhaTCF.create({ sujetId: d.id, tipo: d.tipo === "dictee" ? "dictee" : "modele", titre: String(d.titre || "").slice(0, 150), alvo: alvoDe(d.alunos), por: u.nome });
  if (d.tipo === "ambos") await T.PartilhaTCF.create({ sujetId: d.id, tipo: "dictee", titre: String(d.titre || "").slice(0, 150), alvo: alvoDe(d.alunos), por: u.nome });
  return F.listarPartilhas(ctx, d.id);
});
prof("listarPartilhas", async (ctx, id) => {
  const l = await T.PartilhaTCF.find(id ? { sujetId: id } : {}).sort({ criadoEm: -1 }).lean();
  const nomes = await mapaNomes(l.flatMap(p => p.alvo?.alunos || []));
  return l.map(p => ({ id: p.sujetId, tipo: p.tipo, titre: p.titre, alvo: nomeAlvo(p.alvo, nomes), data: p.criadoEm, ref: String(p._id) }));
});
prof("removerPartilha", async (ctx, ref) => { await T.PartilhaTCF.deleteOne({ _id: oid(ref) }); return true; });

// ---------------- geração em lote ("Modèles de tous les sujets") ----------------
let lote = null;
prof("statusGeracaoApp", async () => {
  const prontos = await T.ModeleIA.countDocuments({});
  let total = 0;
  for (const t of M.TACHES) total += M.sujetsDaTache(t).length;
  const cfg = await config();
  return { prontos, total, ativa: !!lote, feitos: lote?.feitos || 0, erros: lote?.erros || 0, iaAtiva: iaConfigurada(), geracaoAlunos: cfg.geracaoAlunos !== false, iaDia: cfg.iaDia };
});
prof("iniciarGeracaoApp", async ctx => {
  if (!iaConfigurada()) throw erro("L'IA n'est pas configurée sur le serveur (GEMINI_API_KEY ou ANTHROPIC_API_KEY).");
  if (lote) return F.statusGeracaoApp(ctx);
  const prontos = new Set((await T.ModeleIA.find({}).select("sujetId").lean()).map(x => x.sujetId));
  const fila = [];
  for (const t of M.TACHES) for (const s of M.sujetsDaTache(t)) if (!prontos.has(s.id)) fila.push({ t, s });
  fila.sort((a, b) => (b.s.f || 1) - (a.s.f || 1));
  lote = { feitos: 0, erros: 0, parar: false };
  const trabalhar = async () => {
    while (fila.length && !lote.parar) {
      const { t, s } = fila.shift();
      try { await gerarModelo(t, s, ctx.userId); lote.feitos++; } catch (e) { lote.erros++; }
    }
  };
  Promise.all([trabalhar(), trabalhar(), trabalhar()]).finally(() => { lote = null; });
  return F.statusGeracaoApp(ctx);
});
prof("pararGeracaoApp", async ctx => { if (lote) lote.parar = true; return F.statusGeracaoApp(ctx); });
prof("salvarConfigModeles", async (ctx, d) => {
  const cfg = await config();
  if (d.iaDia !== undefined) cfg.iaDia = Math.max(0, Math.min(50, Number(d.iaDia) || 0));
  if (d.geracaoAlunos !== undefined) cfg.geracaoAlunos = !!d.geracaoAlunos;
  await cfg.save();
  return F.statusGeracaoApp(ctx);
});

// ------------------------------------------------------------------ rotas HTTP
router.use(exigirAuth);

// ---------------- temas liberados por aluno (administrador) ----------------
const { exigirAdmin, exigirProfessor } = require("../middleware/auth");
// Perfis em que o aluno tem Ambiente de Produção: TCF e/ou os níveis do DELF.
async function perfisDoAluno(alunoId) {
  const cursos = await cursosComAcesso(alunoId, "producao");
  const perfis = [];
  if (cursos.some(c => c !== "DELF")) perfis.push("TCF");
  if (cursos.includes("DELF")) M.DELF.NIVEAUX.forEach(n => perfis.push("DELF-" + n));
  return perfis.length ? perfis : ["TCF"];
}
router.get("/temas-aluno/:alunoId", exigirAdmin, async (req, res) => {
  try {
    if (!ehObjectId(req.params.alunoId)) return res.status(400).json({ msg: "Aluno inválido." });
    const aluno = await User.findById(req.params.alunoId).select("nome email").lean();
    if (!aluno) return res.status(404).json({ msg: "Aluno não encontrado." });
    const perfis = await perfisDoAluno(aluno._id);
    const perfil = M.PERFIS[req.query.perfil] && perfis.includes(req.query.perfil) ? req.query.perfil : perfis[0];
    const P = M.PERFIS[perfil];
    const doc = await T.TemasAlunoTCF.findOne({ alunoId: aluno._id, perfil }).lean();
    const padrao = (TEMAS_PADRAO[perfil] || []).map(x => x.id);
    const catalogo = [];
    for (const t of P.TACHES) {
      const vistos = new Set();
      const manuais = new Set(P.modelosManuais(t).map(m => m.id));
      for (const s of P.modelosManuais(t).concat(P.sujetsDaTache(t))) {
        if (vistos.has(s.id)) continue; vistos.add(s.id);
        catalogo.push({ tache: t, id: s.id, e: s.e, eixo: (M.EIXOS.eixos[s.e] || {}).nome || s.e, t: String(s.titre || s.t || "").slice(0, 220), f: s.f || 1, manual: manuais.has(s.id) ? 1 : 0 });
      }
    }
    res.json({
      aluno: { id: String(aluno._id), nome: aluno.nome, email: aluno.email }, perfis, perfil, nomePerfil: P.nome,
      taches: P.TACHES.map(t => ({ id: t, nome: P.NOMES_TACHE[t] })), catalogo,
      selecionados: doc ? doc.sujets.map(x => x.id) : padrao, padrao, personalizado: !!doc, atualizadoEm: doc?.atualizadoEm || null,
      liberacoes: (await T.LiberacaoTemasTCF.find({ alunoId: aluno._id, perfil }).sort({ criadoEm: -1 }).limit(60).lean()).map(l => ({ id: String(l._id), data: l.criadoEm, por: l.porNome || "", retiradoEm: l.retiradoEm, sujets: l.sujets })),
      // temas que o aluno também vê por serem dever dele (liberados pelo dever, mesmo fora da lista)
      viaDever: [...new Set((await T.DevoirTCF.find({ ativo: true, modelo: { $ne: "" } }).select("modelo alvo").lean()).filter(dv => alvoInclui(dv.alvo, aluno._id)).map(dv => dv.modelo))]
    });
  } catch (err) { console.error(err); res.status(500).json({ msg: "Erro no servidor." }); }
});
// Designar / retirar temas (Sistema de Correção › Temas dos alunos): o tema designado fica liberado
// na hora para o aluno, que recebe um aviso em « Tarefas do professor ». Enquanto a equipe não mexe,
// o aluno vê os 20 temas padrão; a primeira designação parte deles.
router.post("/temas-aluno/:alunoId/designar", exigirAdmin, async (req, res) => {
  try {
    if (!ehObjectId(req.params.alunoId)) return res.status(400).json({ msg: "Aluno inválido." });
    const perfil = String(req.body?.perfil || ""), retirar = req.body?.acao === "retirar";
    if (!M.PERFIS[perfil]) return res.status(400).json({ msg: "Perfil inválido." });
    if (!(await perfisDoAluno(req.params.alunoId)).includes(perfil)) return res.status(400).json({ msg: "Este aluno não tem o Ambiente de Produção deste curso." });
    const P = M.PERFIS[perfil];
    const pedidos = (Array.isArray(req.body?.sujets) ? req.body.sujets : []).slice(0, 300).map(x => ({ tache: String(x?.tache || ""), id: String(x?.id || "") }));
    if (!pedidos.length) return res.status(400).json({ msg: "Escolha pelo menos um tema." });
    for (const x of pedidos) {
      if (!P.TACHES.includes(x.tache) || !M.acharTema(x.tache, x.id) || M.perfilDoSujet(M.acharTema(x.tache, x.id)) !== P) return res.status(400).json({ msg: `Tema inválido: ${x.id}` });
    }
    const doc = await T.TemasAlunoTCF.findOne({ alunoId: req.params.alunoId, perfil }).lean();
    let lista = (doc ? doc.sujets : (TEMAS_PADRAO[perfil] || [])).map(x => ({ tache: x.tache, id: x.id }));
    const ja = new Set(lista.map(x => x.id));
    const novos = [];
    if (!retirar) pedidos.forEach(x => { if (!ja.has(x.id)) { ja.add(x.id); novos.push(x); } });
    if (retirar) { const fora = new Set(pedidos.map(x => x.id)); lista = lista.filter(x => !fora.has(x.id)); }
    else lista = lista.concat(novos);
    await T.TemasAlunoTCF.findOneAndUpdate({ alunoId: req.params.alunoId, perfil }, { sujets: lista, atualizadoPor: req.userId, atualizadoEm: new Date() }, { upsert: true });
    if (novos.length) {
      const quem = await User.findById(req.userId).select("nome").lean();
      await T.LiberacaoTemasTCF.create({ alunoId: req.params.alunoId, perfil, sujets: novos, porId: req.userId, porNome: quem?.nome || "" });
      const nomes = novos.slice(0, 5).map(x => `« ${String(M.acharTema(x.tache, x.id).t || M.acharTema(x.tache, x.id).titre || x.id).slice(0, 90)} » (${P.NOMES_TACHE[x.tache] || x.tache})`);
      await T.MensagemTCF.create({ alunoId: req.params.alunoId, de: quem?.nome || "Equipe Francês na Mira",
        texto: `${novos.length === 1 ? "Novo tema liberado" : novos.length + " novos temas liberados"} para você no Ambiente de Produção (${P.nome}): ${nomes.join("; ")}${novos.length > 5 ? "…" : ""}.` });
    }
    res.json({ ok: true, personalizado: true, total: lista.length, novos: novos.length, selecionados: lista.map(x => x.id) });
  } catch (err) { console.error(err); res.status(500).json({ msg: "Erro no servidor." }); }
});
// Retira exatamente os temas de um envio do histórico (os que ainda estão liberados).
router.post("/temas-aluno/:alunoId/liberacoes/:libId/retirar", exigirAdmin, async (req, res) => {
  try {
    if (!ehObjectId(req.params.alunoId) || !ehObjectId(req.params.libId)) return res.status(400).json({ msg: "Pedido inválido." });
    const lib = await T.LiberacaoTemasTCF.findOne({ _id: req.params.libId, alunoId: req.params.alunoId });
    if (!lib) return res.status(404).json({ msg: "Liberação não encontrada." });
    if (lib.retiradoEm) return res.status(400).json({ msg: "Este envio já foi retirado." });
    const doc = await T.TemasAlunoTCF.findOne({ alunoId: req.params.alunoId, perfil: lib.perfil });
    const fora = new Set(lib.sujets.map(x => x.id));
    let n = 0;
    if (doc) { const antes = doc.sujets.length; doc.sujets = doc.sujets.filter(x => !fora.has(x.id)); n = antes - doc.sujets.length; doc.atualizadoEm = new Date(); await doc.save(); }
    lib.retiradoEm = new Date(); await lib.save();
    res.json({ ok: true, retirados: n, selecionados: doc ? doc.sujets.map(x => x.id) : [] });
  } catch (err) { console.error(err); res.status(500).json({ msg: "Erro no servidor." }); }
});

// ===================== EM DESTAQUE (Sistema de Correção, administrador) =====================
// O administrador escolhe, para cada curso/perfil e mês, os temas em destaque de expressão escrita
// e oral. Eles aparecem no topo do Ambiente de Produção dos alunos e ficam liberados para eles.
function catalogoPerfil(perfil) {
  const P = M.PERFIS[perfil], catalogo = [];
  for (const t of P.TACHES) {
    const vistos = new Set();
    for (const s of P.modelosManuais(t).concat(P.sujetsDaTache(t))) {
      if (vistos.has(s.id)) continue; vistos.add(s.id);
      catalogo.push({ tache: t, id: s.id, e: s.e, eixo: (M.EIXOS.eixos[s.e] || {}).nome || s.e, t: String(s.titre || s.t || "").slice(0, 220), f: s.f || 1 });
    }
  }
  return catalogo;
}
router.get("/destaques-admin", exigirAdmin, async (req, res) => {
  try {
    const perfil = M.PERFIS[req.query.perfil] ? req.query.perfil : "TCF";
    const mes = /^\d{4}-\d{2}$/.test(String(req.query.mes || "")) ? req.query.mes : mesAtual();
    const P = M.PERFIS[perfil];
    const itens = await T.TemaMesTCF.find({ mes, $or: [{ perfil }, ...(perfil === "TCF" ? [{ perfil: null }, { perfil: { $exists: false } }] : [])] }).sort({ criadoEm: 1 }).lean();
    res.json({
      perfil, mes, nomePerfil: P.nome, perfis: Object.keys(M.PERFIS).map(k => ({ id: k, nome: M.PERFIS[k].nome })),
      taches: P.TACHES.map(t => ({ id: t, nome: P.NOMES_TACHE[t], escrita: M.ehEscrita(t) })),
      itens: itens.map(x => ({ id: String(x._id), tache: x.tache, sujetId: x.sujetId, titre: x.titre, eixo: (M.EIXOS.eixos[x.eixo] || {}).nome || x.eixo || "", por: x.por || "" })),
      catalogo: catalogoPerfil(perfil)
    });
  } catch (err) { console.error(err); res.status(500).json({ msg: "Erro no servidor." }); }
});
router.post("/destaques-admin", exigirAdmin, async (req, res) => {
  try {
    const perfil = String(req.body?.perfil || ""), mes = String(req.body?.mes || "");
    if (!M.PERFIS[perfil] || !/^\d{4}-\d{2}$/.test(mes)) return res.status(400).json({ msg: "Curso ou mês inválido." });
    const P = M.PERFIS[perfil];
    const pedidos = (Array.isArray(req.body?.sujets) ? req.body.sujets : []).slice(0, 100);
    if (!pedidos.length) return res.status(400).json({ msg: "Escolha pelo menos um tema." });
    const quem = await User.findById(req.userId).select("nome").lean();
    const ja = new Set((await T.TemaMesTCF.find({ mes, perfil }).select("sujetId").lean()).map(x => x.sujetId));
    let n = 0;
    for (const x of pedidos) {
      const t = String(x?.tache || ""), id = String(x?.id || ""), tema = M.acharTema(t, id);
      if (!P.TACHES.includes(t) || !tema || M.perfilDoSujet(tema) !== P) return res.status(400).json({ msg: `Tema inválido: ${id}` });
      if (ja.has(id)) continue; ja.add(id);
      await T.TemaMesTCF.create({ mes, perfil, tache: t, sujetId: id, titre: String(tema.titre || tema.t || "").slice(0, 200), eixo: tema.e, por: quem?.nome || "" });
      n++;
    }
    res.json({ ok: true, adicionados: n, msg: n ? `${n} tema(s) em destaque em ${mes} para ${P.nome}.` : "Esses temas já estavam em destaque." });
  } catch (err) { console.error(err); res.status(500).json({ msg: "Erro no servidor." }); }
});
router.delete("/destaques-admin/:id", exigirAdmin, async (req, res) => {
  try {
    if (!ehObjectId(req.params.id)) return res.status(400).json({ msg: "Destaque inválido." });
    await T.TemaMesTCF.deleteOne({ _id: req.params.id });
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ msg: "Erro no servidor." }); }
});

// ===================== CORREÇÕES DE IA (Sistema de Correção) =====================
// Todas as correções feitas pela IA (treinos e produções corrigidas pela IA): texto, aluno e a correção.
router.get("/correcoes-ia", exigirProfessor, async (req, res) => {
  try {
    const filtro = {};
    if (req.query.alunoId && ehObjectId(req.query.alunoId)) filtro.alunoId = req.query.alunoId;
    if (["textual", "oral"].includes(req.query.modalidade)) filtro.modalidade = req.query.modalidade;
    const l = await T.CorrecaoIATCF.find(filtro).sort({ criadoEm: -1 }).limit(300).select("alunoId tache sujet modalidade note mots criadoEm correcao.escala producaoId").lean();
    const nomes = await mapaNomes(l.map(x => x.alunoId));
    const emails = Object.fromEntries((await User.find({ _id: { $in: [...new Set(l.map(x => String(x.alunoId)))] } }).select("email").lean()).map(u => [String(u._id), u.email]));
    res.json(l.map(x => ({ id: String(x._id), alunoId: String(x.alunoId), aluno: nomes[String(x.alunoId)] || "", email: emails[String(x.alunoId)] || "", tache: x.tache, nomeTache: (M.PERFIS.TCF.NOMES_TACHE || {})[x.tache] || x.tache,
      sujet: x.sujet || "", modalidade: x.modalidade, nota: x.note, escala: x.correcao?.escala || 20, mots: x.mots, data: x.criadoEm, origem: x.producaoId ? "produção enviada" : "treino" })));
  } catch (err) { console.error(err); res.status(500).json({ msg: "Erro no servidor." }); }
});
router.get("/correcoes-ia/:id", exigirProfessor, async (req, res) => {
  try {
    if (!ehObjectId(req.params.id)) return res.status(400).json({ msg: "Correção inválida." });
    const c = await T.CorrecaoIATCF.findById(req.params.id).lean();
    if (!c) return res.status(404).json({ msg: "Correção não encontrada." });
    const u = await User.findById(c.alunoId).select("nome email").lean();
    res.json({ id: String(c._id), aluno: u ? u.nome : "", email: u ? u.email : "", alunoId: String(c.alunoId), tache: c.tache, sujet: c.sujet, modalidade: c.modalidade, nota: c.note, nclc: c.nclc || "",
      mots: c.mots, texte: c.texte || "", data: c.criadoEm, correcao: c.correcao || {}, producaoId: c.producaoId ? String(c.producaoId) : null });
  } catch (err) { console.error(err); res.status(500).json({ msg: "Erro no servidor." }); }
});

// Salva a lista (ou, com « padrao: true », volta aos 20 temas padrão).
router.put("/temas-aluno/:alunoId", exigirAdmin, async (req, res) => {
  try {
    if (!ehObjectId(req.params.alunoId)) return res.status(400).json({ msg: "Aluno inválido." });
    const perfil = String(req.body?.perfil || "");
    if (!M.PERFIS[perfil]) return res.status(400).json({ msg: "Perfil inválido." });
    if (!(await perfisDoAluno(req.params.alunoId)).includes(perfil)) return res.status(400).json({ msg: "Este aluno não tem o Ambiente de Produção deste curso." });
    if (req.body?.padrao) {
      await T.TemasAlunoTCF.deleteOne({ alunoId: req.params.alunoId, perfil });
      return res.json({ ok: true, personalizado: false, total: (TEMAS_PADRAO[perfil] || []).length });
    }
    const P = M.PERFIS[perfil];
    const pedidos = Array.isArray(req.body?.sujets) ? req.body.sujets.slice(0, 300) : [];
    const sujets = [];
    for (const x of pedidos) {
      const t = String(x?.tache || ""), id = String(x?.id || "");
      if (!P.TACHES.includes(t) || !M.acharTema(t, id) || M.perfilDoSujet(M.acharTema(t, id)) !== P) return res.status(400).json({ msg: `Tema inválido: ${id}` });
      if (!sujets.some(s => s.id === id)) sujets.push({ tache: t, id });
    }
    if (!sujets.length) return res.status(400).json({ msg: "Escolha pelo menos um tema." });
    await T.TemasAlunoTCF.findOneAndUpdate({ alunoId: req.params.alunoId, perfil }, { sujets, atualizadoPor: req.userId, atualizadoEm: new Date() }, { upsert: true });
    res.json({ ok: true, personalizado: true, total: sujets.length });
  } catch (err) { console.error(err); res.status(500).json({ msg: "Erro no servidor." }); }
});

router.post("/rpc/:fn", async (req, res) => {
  const nome = req.params.fn;
  const fn = Object.prototype.hasOwnProperty.call(F, nome) ? F[nome] : null;
  if (!fn) return res.status(404).json({ msg: "Fonction inconnue : " + nome });
  if (PROF.has(nome) && !ehEquipe(req.userRole)) return res.status(403).json({ msg: "Réservé à l'équipe pédagogique." });
  if (ADMIN.has(nome) && req.userRole !== "admin") return res.status(403).json({ msg: "Réservé aux administrateurs." });
  try {
    const ctx = await contexto(req);
    const args = Array.isArray(req.body?.args) ? req.body.args : [];
    const r = await fn(ctx, ...args);
    res.json({ r: r === undefined ? null : r });
  } catch (err) {
    if (err.status || err.msg) return res.status(err.status || 400).json({ msg: err.msg || err.message });
    console.error(`modeles/${nome}:`, err);
    if (err.ia) return res.status(503).json({ msg: "L'IA est momentanément indisponible (forte demande). Réessayez dans un instant ou envoyez votre production à un professeur." });
    res.status(500).json({ msg: err.naoConfigurada ? "L'IA n'est pas configurée sur le serveur." : "Erreur du serveur. Réessayez." });
  }
});

// Gravação oral (sessão do professor ou treino livre) + transcrição → Producao oral.
const TIPOS_AUDIO = { "audio/webm": ".webm", "audio/ogg": ".ogg", "audio/mp4": ".m4a", "audio/mpeg": ".mp3", "audio/wav": ".wav" };
const uploadAudio = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => { try { cb(null, pastaUpload("modeles", req.userId)); } catch (err) { cb(err); } },
    filename: (req, file, cb) => cb(null, `po-${crypto.randomUUID()}${TIPOS_AUDIO[file.mimetype.split(";")[0]] || ".webm"}`)
  }),
  fileFilter: (req, file, cb) => TIPOS_AUDIO[file.mimetype.split(";")[0]] ? cb(null, true) : cb(new Error("Formato de áudio não aceito.")),
  limits: { fileSize: 25 * 1024 * 1024 }
});
router.post("/oral", comTratamentoDeErro(uploadAudio.single("audio")), async (req, res) => {
  const limpar = () => { if (req.file) fs.unlink(req.file.path, () => {}); };
  try {
    const ctx = await contexto(req);
    const { tache, sujet, sessao, duree, transcricao, modo } = req.body || {};
    if (!["T1", "T2", "T3"].includes(tache) || !M.acharTema(tache, sujet)) { limpar(); return res.status(400).json({ msg: "Sujet invalide." }); }
    if (!req.file) return res.status(400).json({ msg: "Enregistrement manquant." });
    let sessaoId = null;
    if (sessao) {
      const s = (await sessoesDoAluno(ctx)).find(x => x.id === sessao);
      const tarefa = s && s.orais.find(o => o.tache === tache);
      if (!tarefa || tarefa.sujet.id !== sujet) { limpar(); return res.status(400).json({ msg: "Cette tâche orale n'est pas prévue dans l'épreuve." }); }
      if (tarefa.feita) { limpar(); return res.status(400).json({ msg: "Vous avez déjà envoyé cette tâche." }); }
      sessaoId = oid(sessao);
    }
    const { montarNovaProducao } = require("./producoes");
    const tema = await garantirTemaSujet(ctx.courseType, tache, sujet);
    const file = { ...req.file, originalname: `${tache}-orale${TIPOS_AUDIO[req.file.mimetype.split(";")[0]] || ".webm"}`, mimetype: req.file.mimetype.split(";")[0] };
    const p = await montarNovaProducao({
      userId: ctx.userId, temaId: String(tema._id), file, duracaoSegundos: Math.min(Math.round(Number(duree) || 0), 900), transcricao,
      modoCorrecao: sessaoId ? "professor" : (modo === "ia" ? "ia" : "professor"), pularChecagemAcesso: !!sessaoId, semCredito: !!sessaoId,
      origem: { tipo: "modeles", tache, sujetId: sujet, eixo: M.acharTema(tache, sujet).e, sessaoId: sessaoId || undefined }
    });
    await concluirDevoirsDoSujet(ctx, tache, sujet).catch(() => {});
    const u = await User.findById(ctx.userId).select("creditosCorrecao nome");
    avisarEquipe("oral", { alunoId: ctx.userId, nome: u.nome, tache, producaoId: String(p._id) });
    res.json({ ok: true, protocolo: p.protocolo, id: String(p._id), creditos: u.creditosCorrecao || 0 });
  } catch (err) {
    limpar();
    if (err.status || err.msg) return res.status(err.status || 400).json({ msg: err.msg || err.message });
    console.error("modeles/oral:", err);
    res.status(500).json({ msg: "Erreur du serveur. Réessayez." });
  }
});

// Correção de treino de um essai oral pela IA: transcrição + gravação (a IA ouve o áudio quando o
// provedor aceita; senão corrige pela transcrição). O arquivo não fica guardado.
router.post("/oral-ia", comTratamentoDeErro(uploadAudio.single("audio")), async (req, res) => {
  const limpar = () => { if (req.file) fs.unlink(req.file.path, () => {}); };
  try {
    const ctx = await contexto(req);
    const { tache, sujet, transcricao } = req.body || {};
    if (!["T1", "T2", "T3"].includes(tache) || !M.acharTema(tache, sujet)) { limpar(); return res.status(400).json({ msg: "Sujet invalide." }); }
    const st = await statusIA(ctx);
    if (!st.ativa) { limpar(); return res.status(400).json({ msg: "La correction par l'IA n'est pas activée. Demandez à votre professeur(e)." }); }
    if (st.restantes <= 0) { limpar(); return res.status(400).json({ msg: `Vous avez utilisé vos ${st.limite} corrections par l'IA aujourd'hui. Revenez demain !` }); }
    const texte = String(transcricao || "").trim().slice(0, 6000);
    const audio = req.file ? lerAudio(req.file.path, req.file.mimetype) : undefined;
    if (M.contarPalavras(texte) < 15 && !audio) { limpar(); return res.status(400).json({ msg: "La transcription est trop courte : parlez un peu plus ou complétez-la avant l'envoi." }); }
    await conferirCreditoIA(ctx);
    const r = await corrigirTreino({ alunoId: ctx.userId, tache, sujetId: sujet, texte: texte || "(transcription vide : écoute l'enregistrement)", courseType: ctx.courseType, modalidade: "oral", audio });
    limpar();
    r.restantes = Math.max(0, st.restantes - 1);
    const saldo = await cobrarCreditoIA(ctx);
    if (saldo != null) { r.creditos = saldo; r.custo = CUSTO_IA; }
    res.json(r);
  } catch (err) {
    limpar();
    if (err.status || err.msg) return res.status(err.status || 400).json({ msg: err.msg || err.message });
    console.error("modeles/oral-ia:", err);
    res.status(err.ia ? 503 : 500).json({ msg: err.ia ? "L'IA est momentanément indisponible (forte demande). Réessayez dans un instant ou envoyez votre production à un professeur." : "La correction par l'IA a échoué. Réessayez dans un instant." });
  }
});

// Áudio de uma produção oral (o próprio aluno ou a equipe).
router.get("/audio/:id", async (req, res) => {
  try {
    if (!ehObjectId(req.params.id)) return res.status(400).end();
    const p = await Producao.findById(req.params.id).select("alunoId arquivoOriginal modalidade");
    if (!p || !p.arquivoOriginal?.caminho || (!ehEquipe(req.userRole) && String(p.alunoId) !== req.userId)) return res.status(404).end();
    res.type(p.arquivoOriginal.mimetype || "audio/webm");
    res.sendFile(p.arquivoOriginal.caminho, err => { if (err && !res.headersSent) res.status(404).end(); });
  } catch (err) { res.status(500).end(); }
});

// Canal de uma sala ao vivo (o aluno dono e a equipe) + sinalização da chamada de voz (WebRTC).
router.get("/salas/:id/stream", async (req, res) => {
  try {
    if (!ehObjectId(req.params.id)) return res.status(400).end();
    const s = await T.SalaAoVivoTCF.findById(req.params.id).select("alunoId");
    if (!s || (!ehEquipe(req.userRole) && String(s.alunoId) !== req.userId)) return res.status(404).json({ msg: "Salle introuvable." });
    canais.abrir(req, res, canalSala(s._id));
  } catch (err) { res.status(500).end(); }
});
router.post("/salas/:id/sinal", async (req, res) => {
  try {
    if (!ehObjectId(req.params.id)) return res.status(400).end();
    const s = await T.SalaAoVivoTCF.findById(req.params.id).select("alunoId status");
    if (!s || s.status === "encerrada" || (!ehEquipe(req.userRole) && String(s.alunoId) !== req.userId)) return res.status(404).json({ msg: "Salle introuvable." });
    const dados = req.body?.dados;
    if (!dados || typeof dados !== "object" || JSON.stringify(dados).length > 20000) return res.status(400).json({ msg: "Signal invalide." });
    canais.enviar(canalSala(s._id), "sinal", { de: ehEquipe(req.userRole) ? "professor" : "aluno", dados });
    res.json({ ok: true });
  } catch (err) { res.status(500).end(); }
});

// Canal ao vivo da equipe (épreuves e gravações em andamento).
router.get("/equipe/stream", (req, res) => {
  if (!ehEquipe(req.userRole)) return res.status(403).json({ msg: "Réservé à l'équipe pédagogique." });
  canais.abrir(req, res, CANAL_EQUIPE);
});

// Fecha as épreuves de treino abandonadas e as de sessão cujo tempo acabou (a cada 5 min).
setInterval(async () => {
  try {
    if (mongoose.connection.readyState !== 1) return;
    const agora = Date.now();
    for (const e of await T.EpreuveTCF.find({ status: "em_curso" })) if (expirou(e, agora)) await finalizar(e, e.textes, true).catch(() => {});
  } catch (err) { console.error("modeles: fechar épreuves:", err.message); }
}, 5 * 60 * 1000).unref();

module.exports = router;
module.exports.funcoes = F;
