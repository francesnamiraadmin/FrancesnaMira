// Correção anotada: marcações e comentários ligados ao texto (ou ao momento do áudio),
// categorias configuráveis, histórico de versões e o fluxo concluir → devolver → reabrir.
// Montado em /api/producoes (rotas /:id/anotacoes…) e /api/correcao (categorias).
const express = require("express");
const Producao = require("../models/producao");
const User = require("../models/user");
const { AnotacaoCorrecao, HistoricoCorrecao } = require("../models/correcaoAnotada");
const { exigirAuth, exigirProfessor, exigirAdmin } = require("../middleware/auth");
const { ehObjectId } = require("../middleware/seguranca");
const { transmitir } = require("../utils/sse");
const C = require("../utils/correcaoAnotada");

const producoes = express.Router();
const config = express.Router();

for (const nome of ["id", "aid"]) {
  producoes.param(nome, (req, res, next, valor) => (ehObjectId(valor) ? next() : res.status(400).json({ msg: "Identificador inválido." })));
}

const erro = (res, err) => {
  if (err && err.status) return res.status(err.status).json({ msg: err.msg });
  console.error(err);
  res.status(500).json({ msg: "Erro no servidor." });
};
async function autor(req) {
  const u = await User.findById(req.userId).select("nome").lean();
  return { autorId: req.userId, autorNome: (u && u.nome) || (req.userRole === "admin" ? "Administração" : "Professor") };
}
// Carrega a produção e confere a permissão pedida ("ver" | "editar").
async function carregar(req, res, modo) {
  const p = await Producao.findById(req.params.id);
  if (!p) { res.status(404).json({ msg: "Produção não encontrada." }); return null; }
  if (modo === "editar") {
    if (!C.podeEditar(p, req)) {
      res.status(403).json({ msg: C.ehStaff(req) ? "Esta correção não está aberta para você (assuma a produção ou reabra a correção)." : "Acesso negado." });
      return null;
    }
  } else if (!C.podeVer(p, req) || (!C.ehStaff(req) && !C.alunoVeCorrecao(p, req))) {
    res.status(403).json({ msg: "Você não tem acesso a esta correção." });
    return null;
  }
  return p;
}
async function contarESalvar(p) {
  p.correcao = p.correcao || {};
  p.correcao.anotacoes = await C.contarAnotacoes(p._id);
  p.correcao.salvaEm = new Date();
  await p.save();
}

// ===================== CATEGORIAS =====================
config.get("/categorias", exigirAuth, async (req, res) => {
  try { res.json({ categorias: await C.categorias(), padrao: C.CATEGORIAS_PADRAO }); } catch (err) { erro(res, err); }
});
config.put("/categorias", exigirAuth, exigirAdmin, async (req, res) => {
  try { res.json({ categorias: await C.salvarCategorias(req.body && req.body.categorias, req.userId) }); } catch (err) { erro(res, err); }
});

// ===================== ANOTAÇÕES =====================
producoes.get("/:id/anotacoes", exigirAuth, async (req, res) => {
  try {
    const p = await carregar(req, res, "ver");
    if (!p) return;
    const lista = await AnotacaoCorrecao.find({ producaoId: p._id, removido: false }).sort({ alvo: 1, inicio: 1, tempo: 1, criadoEm: 1 }).lean();
    res.json({ anotacoes: lista.map(C.publicaAnotacao), versao: (p.correcao && p.correcao.versao) || 0 });
  } catch (err) { erro(res, err); }
});

producoes.post("/:id/anotacoes", exigirAuth, exigirProfessor, async (req, res) => {
  try {
    const p = await carregar(req, res, "editar");
    if (!p) return;
    if (await AnotacaoCorrecao.countDocuments({ producaoId: p._id, removido: false }) >= 300) return res.status(400).json({ msg: "Limite de 300 anotações por produção." });
    const dados = C.normalizarAnotacao(req.body || {}, p, await C.categorias());
    const quem = await autor(req);
    const a = await AnotacaoCorrecao.create({ ...dados, producaoId: p._id, alunoId: p.alunoId, autorId: quem.autorId, autorNome: quem.autorNome });
    await C.registrarHistorico(p, quem, "anotou", `${a.categoriaNome}${a.trecho ? ` · « ${a.trecho.slice(0, 60)} »` : a.tempo !== undefined ? ` · ${Math.floor(a.tempo / 60)}:${String(Math.floor(a.tempo % 60)).padStart(2, "0")}` : ""}`, { anotacaoId: a._id });
    await contarESalvar(p);
    res.status(201).json({ anotacao: C.publicaAnotacao(a), salvaEm: p.correcao.salvaEm, versao: p.correcao.versao });
  } catch (err) { erro(res, err); }
});

producoes.put("/:id/anotacoes/:aid", exigirAuth, exigirProfessor, async (req, res) => {
  try {
    const p = await carregar(req, res, "editar");
    if (!p) return;
    const a = await AnotacaoCorrecao.findOne({ _id: req.params.aid, producaoId: p._id });
    if (!a) return res.status(404).json({ msg: "Anotação não encontrada." });
    const quem = await autor(req);
    if (req.body && req.body.removido === false && a.removido) {
      a.removido = false; a.atualizadoEm = new Date(); await a.save();
      await C.registrarHistorico(p, quem, "restaurou_anotacao", a.categoriaNome, { anotacaoId: a._id });
    } else {
      Object.assign(a, C.normalizarAnotacao(req.body || {}, p, await C.categorias(), { parcial: true }), { atualizadoEm: new Date() });
      await a.save();
      await C.registrarHistorico(p, quem, "editou_anotacao", a.categoriaNome, { anotacaoId: a._id });
    }
    await contarESalvar(p);
    res.json({ anotacao: C.publicaAnotacao(a), salvaEm: p.correcao.salvaEm, versao: p.correcao.versao });
  } catch (err) { erro(res, err); }
});

// Exclusão reversível (o « desfazer » restaura a anotação).
producoes.delete("/:id/anotacoes/:aid", exigirAuth, exigirProfessor, async (req, res) => {
  try {
    const p = await carregar(req, res, "editar");
    if (!p) return;
    const a = await AnotacaoCorrecao.findOneAndUpdate({ _id: req.params.aid, producaoId: p._id }, { removido: true, atualizadoEm: new Date() }, { new: true });
    if (!a) return res.status(404).json({ msg: "Anotação não encontrada." });
    await C.registrarHistorico(p, await autor(req), "removeu_anotacao", `${a.categoriaNome}${a.trecho ? ` · « ${a.trecho.slice(0, 60)} »` : ""}`, { anotacaoId: a._id });
    await contarESalvar(p);
    res.json({ ok: true, salvaEm: p.correcao.salvaEm, versao: p.correcao.versao });
  } catch (err) { erro(res, err); }
});

// ===================== HISTÓRICO (só equipe) =====================
producoes.get("/:id/historico", exigirAuth, exigirProfessor, async (req, res) => {
  try {
    const p = await carregar(req, res, "ver");
    if (!p) return;
    const h = await HistoricoCorrecao.find({ producaoId: p._id }).sort({ em: -1 }).limit(300).lean();
    res.json({ historico: h, versao: (p.correcao && p.correcao.versao) || 0 });
  } catch (err) { erro(res, err); }
});

// ===================== FLUXO: CONCLUIR / REABRIR =====================
// Concluir: a correção fica pronta para revisão, ainda sem ir para o aluno.
producoes.post("/:id/concluir", exigirAuth, exigirProfessor, async (req, res) => {
  try {
    const p = await carregar(req, res, "editar");
    if (!p) return;
    if (p.status !== "aguardando_revisao") {
      p.status = "aguardando_revisao";
      p.historicoStatus.push({ status: "aguardando_revisao", data: new Date() });
    }
    p.correcao = p.correcao || {};
    p.correcao.concluidaEm = new Date();
    await C.registrarHistorico(p, await autor(req), "concluiu", "Correção concluída (pronta para devolver)", { notaTotal: p.avaliacao && p.avaliacao.notaTotal, anotacoes: p.correcao.anotacoes }, { novaVersao: true });
    await p.save();
    res.json({ ok: true, status: p.status, estado: C.estadoCorrecao(p), versao: p.correcao.versao });
  } catch (err) { erro(res, err); }
});

// Reabrir: volta a correção para edição (antes ou depois de devolvida). Depois de devolvida, o aluno
// vê « correção em revisão » até o professor devolver de novo; tudo fica no histórico.
producoes.post("/:id/reabrir", exigirAuth, exigirProfessor, async (req, res) => {
  try {
    const p = await Producao.findById(req.params.id);
    if (!p) return res.status(404).json({ msg: "Produção não encontrada." });
    const dono = req.userRole === "admin" || String(p.professorId || "") === String(req.userId);
    if (!dono || p.modoCorrecao === "ia" || !["aguardando_revisao", "corrigido", "devolvido"].includes(p.status)) {
      return res.status(403).json({ msg: "Só o professor desta correção pode reabri-la." });
    }
    p.status = "em_correcao";
    p.historicoStatus.push({ status: "em_correcao", data: new Date() });
    p.correcao = p.correcao || {};
    p.correcao.reabertaEm = new Date();
    await C.registrarHistorico(p, await autor(req), "reabriu", "Correção reaberta para revisão", null, { novaVersao: true });
    await p.save();
    transmitir("producao-atualizada", { alunoId: String(p.alunoId), producaoId: String(p._id) });
    res.json({ ok: true, status: p.status, estado: C.estadoCorrecao(p), versao: p.correcao.versao });
  } catch (err) { erro(res, err); }
});

module.exports = { producoes, config };
