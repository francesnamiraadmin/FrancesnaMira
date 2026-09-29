// Simulação completa de prova (TCF Canada): CO → CE → EE → EO, relógio no servidor,
// correção por IA ou por professor, e conexão ao vivo aluno ↔ professor que pode ser
// pedida a qualquer momento (chat, acompanhamento em tempo real, chamada de voz WebRTC
// para a Expression orale e lançamento de notas no formato TCF).
const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const multer = require("multer");
const router = express.Router();

const SimuladoTentativa = require("../models/simuladoTentativa");
const User = require("../models/user");
const { exigirAuth } = require("../middleware/auth");
const { ehObjectId } = require("../middleware/seguranca");
const { usuarioTemAcesso } = require("../middleware/acessoCurso");
const { pastaUpload, comTratamentoDeErro } = require("../middleware/upload");
const sim = require("../utils/simulados");
const canais = require("../utils/sseCanais");
const { corrigirExpressoesComIA, iaConfigurada } = require("../utils/correcaoIA");

router.use(exigirAuth);

const ehEquipe = req => req.userRole === "professor" || req.userRole === "admin";
const CANAL_EQUIPE = "simulados:equipe";
const canalTentativa = id => "simulado:" + id;
const GRACA_MS = 8000;
const slugValido = s => typeof s === "string" && /^[a-z0-9-]{2,60}$/.test(s);
const tarefaValida = (def, prova, id) => def.provas[prova].tarefas.some(t => t.id === id);

function exigirEquipe(req, res, next) {
  if (!ehEquipe(req)) return res.status(403).json({ msg: "Acesso restrito à equipe." });
  next();
}

async function nomeDe(userId) {
  const u = await User.findById(userId).select("nome");
  return u?.nome || "";
}

// ---------------- relógio ----------------
function prazo(def, t, prova) {
  const e = t.provas[prova];
  if (!e.inicio) return null;
  return new Date(e.inicio.getTime() + (def.provas[prova].tempoSeg + (e.tempoExtraSeg || 0)) * 1000);
}

function finalizarProva(def, t, prova) {
  const e = t.provas[prova];
  if (e.status === "finalizada") return;
  e.status = "finalizada";
  e.fim = new Date();
  if (sim.ehCompreensao(prova)) e.resultado = sim.corrigirCompreensao(def, prova, e.respostas || {});
  const ordem = sim.ordemDe(def);
  const prox = ordem[ordem.indexOf(prova) + 1];
  t.provaAtual = prox || null;
  if (!prox) {
    // Sem expressões, não há o que esperar: o resultado sai completo na hora.
    if (sim.temExpressoes(def)) t.status = "aguardando_correcao";
    else { t.status = "corrigido"; t.publicadoEm = new Date(); }
  }
  t.markModified("provas");
}

// Fecha a prova em andamento se o tempo acabou (o aluno pode ter fechado a aba).
function aplicarRelogio(def, t) {
  const p = t.provaAtual;
  if (!p || t.provas[p].status !== "em_andamento") return false;
  const fim = prazo(def, t, p);
  if (fim && Date.now() > fim.getTime() + GRACA_MS) {
    finalizarProva(def, t, p);
    return true;
  }
  return false;
}

// ---------------- serialização ----------------
function serializar(def, t, req) {
  const o = t.toObject();
  const equipe = ehEquipe(req);
  const concluido = t.status !== "em_andamento";
  const agora = Date.now();
  for (const p of sim.ordemDe(def)) {
    const fim = prazo(def, t, p);
    o.provas[p].prazo = fim;
    o.provas[p].restanteSeg = fim && o.provas[p].status === "em_andamento" ? Math.max(0, Math.round((fim.getTime() - agora) / 1000)) : null;
    o.provas[p].audios = Object.fromEntries(Object.keys(o.provas[p].audios || {}).map(k => [k, true]));
    // Aluno: notas das compreensões só depois da prova inteira; expressões só depois de publicadas.
    if (!equipe) {
      if (sim.ehCompreensao(p) && !concluido) o.provas[p].resultado = null;
      if ((p === "ee" || p === "eo") && !t.publicadoEm) o.provas[p].resultado = null;
    }
  }
  if (!equipe) delete o.sugestaoIA;
  else o.eu = req.userId;
  o.definicao = equipe || concluido ? def : sim.versaoPublica(def);
  o.criterios = sim.CRITERIOS;
  o.iaDisponivel = iaConfigurada();
  return o;
}

function resumoPainel(t, aluno) {
  const def = sim.obter(t.simuladoSlug);
  return {
    _id: t._id, aluno: aluno ? { _id: aluno._id, nome: aluno.nome, email: aluno.email } : null,
    simuladoSlug: t.simuladoSlug, modoCorrecao: t.modoCorrecao, status: t.status, provaAtual: t.provaAtual,
    questaoAtual: t.provaAtual ? t.provas[t.provaAtual].questaoAtual : null,
    titulo: def?.titulo || t.simuladoSlug, ordem: sim.ordemDe(def),
    provasStatus: Object.fromEntries(sim.ordemDe(def).map(p => [p, t.provas[p].status])),
    conexao: t.conexao, ultimaAtividade: t.ultimaAtividade, criadoEm: t.criadoEm, publicadoEm: t.publicadoEm,
    temSugestaoIA: !!t.sugestaoIA, erroIA: t.ia?.erro || ""
  };
}

async function avisarEquipe(t, tipo) {
  const aluno = await User.findById(t.alunoId).select("nome email");
  canais.enviar(CANAL_EQUIPE, "tentativa", { tipo, tentativa: resumoPainel(t, aluno) });
}

function avisarTentativa(t, evento, dados = {}) {
  canais.enviar(canalTentativa(t._id), evento, { tentativaId: String(t._id), ...dados });
}

// Carrega a tentativa checando dono (aluno) ou equipe, e aplica o relógio.
async function carregar(req, res) {
  if (!ehObjectId(req.params.id)) { res.status(400).json({ msg: "Tentativa inválida." }); return null; }
  const t = await SimuladoTentativa.findById(req.params.id);
  if (!t || (!ehEquipe(req) && String(t.alunoId) !== req.userId)) { res.status(404).json({ msg: "Simulado não encontrado." }); return null; }
  const def = sim.obter(t.simuladoSlug);
  if (!def) { res.status(404).json({ msg: "Definição do simulado não encontrada." }); return null; }
  if (aplicarRelogio(def, t)) {
    await t.save();
    await posFinalizacao(def, t);
  }
  return { t, def };
}

// ---------------- correção por IA ----------------
const iaEmCurso = new Set();
async function rodarIA(def, t, { publicar }) {
  const id = String(t._id);
  if (iaEmCurso.has(id)) return;
  iaEmCurso.add(id);
  try {
    if (publicar && iaConfigurada()) { t.status = "corrigindo_ia"; await t.save(); avisarTentativa(t, "status", { status: t.status }); }
    const r = await corrigirExpressoesComIA(def, t);
    const atual = await SimuladoTentativa.findById(id);
    atual.ia = { erro: "", tentativas: (atual.ia?.tentativas || 0) + 1, geradoEm: new Date() };
    if (publicar && atual.modoCorrecao === "ia") {
      atual.provas.ee.resultado = r.ee;
      atual.provas.eo.resultado = r.eo;
      atual.status = "corrigido";
      atual.publicadoEm = new Date();
      atual.markModified("provas");
    } else {
      atual.sugestaoIA = r;
      if (atual.status === "corrigindo_ia") atual.status = "aguardando_correcao";
    }
    await atual.save();
    avisarTentativa(atual, "corrigido", { status: atual.status });
    await avisarEquipe(atual, "ia");
  } catch (err) {
    console.error("Correção IA:", err.message);
    const atual = await SimuladoTentativa.findById(id);
    if (atual) {
      atual.ia = { erro: err.naoConfigurada ? "A correção por IA ainda não está configurada no servidor. Um professor pode corrigir seu simulado." : "Não foi possível concluir a correção por IA agora. Tente novamente em alguns minutos.", tentativas: (atual.ia?.tentativas || 0) + 1, geradoEm: null };
      if (atual.status === "corrigindo_ia") atual.status = "aguardando_correcao";
      await atual.save();
      avisarTentativa(atual, "status", { status: atual.status, erroIA: atual.ia.erro });
      await avisarEquipe(atual, "ia");
    }
  } finally {
    iaEmCurso.delete(id);
  }
}

async function posFinalizacao(def, t) {
  avisarTentativa(t, "status", { status: t.status, provaAtual: t.provaAtual });
  await avisarEquipe(t, "progresso");
  if (t.status === "aguardando_correcao" && t.modoCorrecao === "ia" && !t.publicadoEm && sim.temExpressoes(def)) {
    rodarIA(def, t, { publicar: true }); // assíncrono: o aluno recebe o evento "corrigido"
  }
}

// =====================================================================
// ALUNO
// =====================================================================
async function podeUsar(req) {
  if (ehEquipe(req)) return true;
  return usuarioTemAcesso(req.userId, "plataforma", "TCF");
}

router.get("/", async (req, res) => {
  try {
    if (!(await podeUsar(req))) return res.status(403).json({ msg: "Simulados disponíveis no plano Excellence do TCF." });
    const tentativas = await SimuladoTentativa.find({ alunoId: req.userId })
      .select("simuladoSlug modoCorrecao status provaAtual provas conexao criadoEm publicadoEm")
      .sort({ criadoEm: -1 }).limit(30).lean();
    const resumo = tentativas.map(t => ({
      _id: t._id, simuladoSlug: t.simuladoSlug, modoCorrecao: t.modoCorrecao, status: t.status, provaAtual: t.provaAtual,
      criadoEm: t.criadoEm, publicadoEm: t.publicadoEm,
      resultados: t.status === "em_andamento" ? null : Object.fromEntries(sim.ordemDe(sim.obter(t.simuladoSlug)).map(p => {
        const r = t.provas?.[p]?.resultado;
        if (!r || ((p === "ee" || p === "eo") && !t.publicadoEm)) return [p, null];
        return [p, { pontos: r.pontos, nota: r.nota, nivel: r.nivel, nclc: r.nclc }];
      }))
    }));
    res.json({ simulados: sim.listar("TCF"), tentativas: resumo, iaDisponivel: iaConfigurada() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.post("/:slug/iniciar", async (req, res) => {
  try {
    if (!(await podeUsar(req))) return res.status(403).json({ msg: "Simulados disponíveis no plano Excellence do TCF." });
    const def = slugValido(req.params.slug) && sim.obter(req.params.slug);
    if (!def) return res.status(404).json({ msg: "Simulado não encontrado." });
    const modo = !sim.temExpressoes(def) ? "automatica" : req.body?.modoCorrecao === "professor" ? "professor" : "ia";
    const aberta = await SimuladoTentativa.findOne({ alunoId: req.userId, simuladoSlug: def.slug, status: "em_andamento" });
    if (aberta) return res.status(409).json({ msg: "Você já tem este simulado em andamento.", tentativaId: aberta._id });
    const t = await SimuladoTentativa.create({ alunoId: req.userId, simuladoSlug: def.slug, curso: def.curso, modoCorrecao: modo });
    if (modo === "professor") {
      // Escolher correção por professor já avisa a equipe, que pode acompanhar desde o início.
      t.conexao = { status: "solicitada", solicitadaEm: new Date(), motivo: "Correção por professor escolhida no início do simulado." };
      await t.save();
    }
    await avisarEquipe(t, "nova");
    res.status(201).json({ tentativaId: t._id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.get("/tentativas/:id", async (req, res) => {
  try {
    const c = await carregar(req, res);
    if (!c) return;
    const o = serializar(c.def, c.t, req);
    if (ehEquipe(req)) o.aluno = await User.findById(c.t.alunoId).select("nome email").lean();
    res.json(o);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// Abre (inicia o relógio de) uma prova. Só a prova atual; ordem fixa como no exame.
router.post("/tentativas/:id/provas/:prova/abrir", async (req, res) => {
  try {
    const c = await carregar(req, res);
    if (!c) return;
    const { t, def } = c;
    const prova = req.params.prova;
    if (String(t.alunoId) !== req.userId) return res.status(403).json({ msg: "Só o candidato inicia as provas." });
    if (t.provaAtual !== prova) return res.status(400).json({ msg: "Esta prova não está disponível agora." });
    if (t.provas[prova].status === "pendente") {
      t.provas[prova].status = "em_andamento";
      t.provas[prova].inicio = new Date();
      t.ultimaAtividade = new Date();
      t.markModified("provas");
      await t.save();
      avisarTentativa(t, "status", { status: t.status, provaAtual: prova });
      await avisarEquipe(t, "progresso");
    }
    res.json(serializar(def, t, req));
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// Autosave: respostas parciais + posição atual. Também alimenta a tela ao vivo do professor.
router.patch("/tentativas/:id/progresso", async (req, res) => {
  try {
    const c = await carregar(req, res);
    if (!c) return;
    const { t, def } = c;
    if (String(t.alunoId) !== req.userId) return res.status(403).json({ msg: "Apenas o candidato responde." });
    const prova = req.body?.prova;
    if (prova !== t.provaAtual || t.provas[prova]?.status !== "em_andamento") {
      return res.status(409).json({ msg: "Esta prova já foi encerrada.", estado: serializar(def, t, req) });
    }
    const e = t.provas[prova];
    const resp = req.body?.respostas && typeof req.body.respostas === "object" ? req.body.respostas : {};
    e.respostas = e.respostas || {};
    if (sim.ehCompreensao(prova)) {
      for (const [n, v] of Object.entries(resp)) {
        const q = def.provas[prova].questoes.find(x => String(x.n) === String(n));
        if (q && Number.isInteger(v) && v >= 0 && v < q.alternativas.length) e.respostas[q.n] = v;
      }
      if (prova === "co" && Number.isInteger(req.body?.ouvido) && !e.ouvidos.includes(req.body.ouvido)) e.ouvidos.push(req.body.ouvido);
    } else if (prova === "ee") {
      for (const [id, texto] of Object.entries(resp)) {
        if (tarefaValida(def, "ee", id) && typeof texto === "string") e.respostas[id] = texto.slice(0, 8000);
      }
    }
    if (Number.isInteger(req.body?.questaoAtual) && req.body.questaoAtual >= 0 && req.body.questaoAtual < 60) e.questaoAtual = req.body.questaoAtual;
    t.ultimaAtividade = new Date();
    t.markModified("provas");
    await t.save();
    avisarTentativa(t, "progresso", {
      prova, questaoAtual: e.questaoAtual, respostas: e.respostas, ouvidos: e.ouvidos,
      etapaEO: typeof req.body?.etapaEO === "string" ? req.body.etapaEO.slice(0, 80) : undefined,
      perguntaEO: Number.isInteger(req.body?.perguntaEO) && req.body.perguntaEO >= 0 && req.body.perguntaEO < 20 ? req.body.perguntaEO : undefined
    });
    res.json({ ok: true, restanteSeg: Math.max(0, Math.round((prazo(def, t, prova).getTime() - Date.now()) / 1000)) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.post("/tentativas/:id/provas/:prova/finalizar", async (req, res) => {
  try {
    const c = await carregar(req, res);
    if (!c) return;
    const { t, def } = c;
    const prova = req.params.prova;
    if (String(t.alunoId) !== req.userId) return res.status(403).json({ msg: "Apenas o candidato finaliza." });
    if (t.provas[prova]?.status === "em_andamento") {
      finalizarProva(def, t, prova);
      t.ultimaAtividade = new Date();
      await t.save();
      await posFinalizacao(def, t);
    }
    res.json(serializar(def, t, req));
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// Áudio da Expression orale (MediaRecorder) + transcrição do navegador.
const TIPOS_AUDIO = { "audio/webm": ".webm", "audio/ogg": ".ogg", "audio/mp4": ".m4a", "audio/mpeg": ".mp3", "audio/wav": ".wav" };
const uploadAudio = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => { try { cb(null, pastaUpload("simulados", req.params.id)); } catch (err) { cb(err); } },
    filename: (req, file, cb) => cb(null, `eo-${crypto.randomUUID()}${TIPOS_AUDIO[file.mimetype.split(";")[0]] || ".webm"}`)
  }),
  fileFilter: (req, file, cb) => TIPOS_AUDIO[file.mimetype.split(";")[0]] ? cb(null, true) : cb(new Error("Formato de áudio não aceito.")),
  limits: { fileSize: 25 * 1024 * 1024 }
});

router.post("/tentativas/:id/eo/:tarefa", (req, res, next) => {
  if (!ehObjectId(req.params.id)) return res.status(400).json({ msg: "Tentativa inválida." });
  next();
}, comTratamentoDeErro(uploadAudio.single("audio")), async (req, res) => {
  try {
    const c = await carregar(req, res);
    if (!c) { if (req.file) fs.unlink(req.file.path, () => {}); return; }
    const { t, def } = c;
    const tarefa = req.params.tarefa;
    const e = t.provas.eo;
    if (String(t.alunoId) !== req.userId || t.provaAtual !== "eo" || e.status !== "em_andamento" || !tarefaValida(def, "eo", tarefa)) {
      if (req.file) fs.unlink(req.file.path, () => {});
      return res.status(400).json({ msg: "Não é possível enviar esta gravação agora." });
    }
    if (req.file) {
      const anterior = e.audios?.[tarefa];
      if (anterior) fs.unlink(anterior, () => {});
      e.audios = { ...(e.audios || {}), [tarefa]: req.file.path };
    }
    e.respostas = { ...(e.respostas || {}), [tarefa]: { transcricao: String(req.body?.transcricao || "").slice(0, 10000), enviadoEm: new Date() } };
    t.ultimaAtividade = new Date();
    t.markModified("provas");
    await t.save();
    avisarTentativa(t, "eo-audio", { tarefa });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.get("/tentativas/:id/eo/:tarefa/audio", async (req, res) => {
  try {
    const c = await carregar(req, res);
    if (!c) return;
    const caminho = c.t.provas.eo.audios?.[req.params.tarefa];
    if (!caminho || !fs.existsSync(caminho)) return res.status(404).json({ msg: "Gravação não encontrada." });
    res.sendFile(path.resolve(caminho));
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// Aluno com correção por IA: tentar de novo se a primeira falhou.
router.post("/tentativas/:id/corrigir-ia", async (req, res) => {
  try {
    const c = await carregar(req, res);
    if (!c) return;
    const { t, def } = c;
    if (t.status === "em_andamento") return res.status(400).json({ msg: "Finalize o simulado antes." });
    if (!iaConfigurada()) return res.status(503).json({ msg: "A correção por IA não está configurada no servidor." });
    if (ehEquipe(req)) {
      // Equipe: gera uma sugestão (não publica) — ou publica direto se o modo for IA.
      rodarIA(def, t, { publicar: t.modoCorrecao === "ia" && !t.publicadoEm });
      return res.json({ ok: true, emAndamento: true });
    }
    if (t.modoCorrecao !== "ia" || t.publicadoEm) return res.status(400).json({ msg: "Este simulado é corrigido por um professor." });
    rodarIA(def, t, { publicar: true });
    res.json({ ok: true, emAndamento: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// ---------------- conexão ao vivo (qualquer momento) ----------------
router.post("/tentativas/:id/chamar-professor", async (req, res) => {
  try {
    const c = await carregar(req, res);
    if (!c) return;
    const { t, def } = c;
    if (String(t.alunoId) !== req.userId) return res.status(403).json({ msg: "Apenas o candidato pode chamar." });
    if (t.conexao.status !== "ativa") {
      t.conexao.status = "solicitada";
      t.conexao.solicitadaEm = new Date();
      t.conexao.motivo = String(req.body?.motivo || "").slice(0, 300);
      t.markModified("conexao");
      t.mensagens.push({ autor: "sistema", texto: "O candidato pediu a conexão com um professor." + (t.conexao.motivo ? ` Motivo: ${t.conexao.motivo}` : "") });
      await t.save();
      await avisarEquipe(t, "chamado");
      avisarTentativa(t, "conexao", { conexao: t.conexao, mensagens: t.mensagens.slice(-1) });
    }
    res.json(serializar(def, t, req));
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.post("/tentativas/:id/cancelar-chamado", async (req, res) => {
  try {
    const c = await carregar(req, res);
    if (!c) return;
    const { t, def } = c;
    if (String(t.alunoId) !== req.userId) return res.status(403).json({ msg: "Apenas o candidato." });
    if (t.conexao.status === "solicitada") {
      t.conexao.status = "nenhuma";
      t.markModified("conexao");
      await t.save();
      await avisarEquipe(t, "chamado");
      avisarTentativa(t, "conexao", { conexao: t.conexao });
    }
    res.json(serializar(def, t, req));
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.post("/tentativas/:id/mensagens", async (req, res) => {
  try {
    const c = await carregar(req, res);
    if (!c) return;
    const { t } = c;
    const texto = String(req.body?.texto || "").trim().slice(0, 2000);
    if (!texto) return res.status(400).json({ msg: "Mensagem vazia." });
    const msg = { autor: ehEquipe(req) && String(t.alunoId) !== req.userId ? "professor" : "aluno", autorNome: await nomeDe(req.userId), texto, data: new Date() };
    t.mensagens.push(msg);
    if (t.mensagens.length > 300) t.mensagens = t.mensagens.slice(-300);
    await t.save();
    avisarTentativa(t, "mensagem", { mensagem: msg });
    if (msg.autor === "aluno") await avisarEquipe(t, "mensagem");
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// Sinalização WebRTC (oferta/resposta/ICE) — só repassa pelo canal, nada é gravado.
router.post("/tentativas/:id/sinal", async (req, res) => {
  try {
    if (!ehObjectId(req.params.id)) return res.status(400).json({ msg: "Tentativa inválida." });
    const t = await SimuladoTentativa.findById(req.params.id).select("alunoId conexao");
    if (!t || (!ehEquipe(req) && String(t.alunoId) !== req.userId)) return res.status(404).json({ msg: "Simulado não encontrado." });
    const dados = req.body?.dados;
    if (!dados || typeof dados !== "object" || JSON.stringify(dados).length > 20000) return res.status(400).json({ msg: "Sinal inválido." });
    const de = String(t.alunoId) === req.userId ? "aluno" : "professor";
    canais.enviar(canalTentativa(t._id), "sinal", { de, dados });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.get("/tentativas/:id/stream", async (req, res) => {
  try {
    if (!ehObjectId(req.params.id)) return res.status(400).json({ msg: "Tentativa inválida." });
    const t = await SimuladoTentativa.findById(req.params.id).select("alunoId");
    if (!t || (!ehEquipe(req) && String(t.alunoId) !== req.userId)) return res.status(404).json({ msg: "Simulado não encontrado." });
    canais.abrir(req, res, canalTentativa(t._id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// =====================================================================
// EQUIPE
// =====================================================================
router.get("/equipe/painel", exigirEquipe, async (req, res) => {
  try {
    const limiteAtivo = new Date(Date.now() - 6 * 3600 * 1000);
    const [ativos, aguardando, corrigidos] = await Promise.all([
      SimuladoTentativa.find({ status: "em_andamento", ultimaAtividade: { $gte: limiteAtivo } }).sort({ ultimaAtividade: -1 }).limit(100),
      SimuladoTentativa.find({ status: { $in: ["aguardando_correcao", "corrigindo_ia"] } }).sort({ atualizadoEm: 1 }).limit(100),
      SimuladoTentativa.find({ status: "corrigido" }).sort({ publicadoEm: -1 }).limit(30)
    ]);
    const todos = [...ativos, ...aguardando, ...corrigidos];
    const alunos = await User.find({ _id: { $in: todos.map(t => t.alunoId) } }).select("nome email");
    const mapa = new Map(alunos.map(a => [String(a._id), a]));
    const r = t => resumoPainel(t, mapa.get(String(t.alunoId)));
    res.json({ ativos: ativos.map(r), aguardando: aguardando.map(r), corrigidos: corrigidos.map(r), iaDisponivel: iaConfigurada() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.get("/equipe/stream", exigirEquipe, (req, res) => canais.abrir(req, res, CANAL_EQUIPE));

router.post("/tentativas/:id/conectar", exigirEquipe, async (req, res) => {
  try {
    const c = await carregar(req, res);
    if (!c) return;
    const { t, def } = c;
    const nome = await nomeDe(req.userId);
    t.conexao = { ...t.toObject().conexao, status: "ativa", professorId: req.userId, professorNome: nome, conectadoEm: new Date() };
    // Quem conecta assume a correção (a IA ainda pode gerar uma sugestão para o professor).
    const mudouModo = sim.temExpressoes(def) && t.modoCorrecao !== "professor" && !t.publicadoEm;
    if (mudouModo) t.modoCorrecao = "professor";
    t.mensagens.push({ autor: "sistema", texto: `${nome || "Um professor"} conectou-se ao seu simulado.${mudouModo ? " A correção das expressões passa a ser feita por ele(a)." : ""}` });
    t.markModified("conexao");
    await t.save();
    avisarTentativa(t, "conexao", { conexao: t.conexao, modoCorrecao: t.modoCorrecao, mensagens: t.mensagens.slice(-1) });
    await avisarEquipe(t, "conexao");
    res.json(serializar(def, t, req));
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.post("/tentativas/:id/desconectar", exigirEquipe, async (req, res) => {
  try {
    const c = await carregar(req, res);
    if (!c) return;
    const { t, def } = c;
    if (t.conexao.status === "ativa") {
      t.conexao.status = "encerrada";
      t.mensagens.push({ autor: "sistema", texto: `${t.conexao.professorNome || "O professor"} encerrou a conexão.` });
      t.markModified("conexao");
      await t.save();
      avisarTentativa(t, "conexao", { conexao: t.conexao, mensagens: t.mensagens.slice(-1) });
      await avisarEquipe(t, "conexao");
    }
    res.json(serializar(def, t, req));
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// Ajustes do professor durante a prova: tempo extra ou encerrar a prova atual.
router.post("/tentativas/:id/controle", exigirEquipe, async (req, res) => {
  try {
    const c = await carregar(req, res);
    if (!c) return;
    const { t, def } = c;
    const p = t.provaAtual;
    const acao = req.body?.acao;
    if (!p || t.provas[p].status !== "em_andamento") return res.status(400).json({ msg: "Nenhuma prova em andamento." });
    if (acao === "tempoExtra") {
      const min = Math.min(30, Math.max(1, parseInt(req.body?.minutos, 10) || 0));
      t.provas[p].tempoExtraSeg = (t.provas[p].tempoExtraSeg || 0) + min * 60;
      t.mensagens.push({ autor: "sistema", texto: `O professor adicionou ${min} min à ${sim.NOMES_PROVA[p]}.` });
    } else if (acao === "encerrarProva") {
      finalizarProva(def, t, p);
      t.mensagens.push({ autor: "sistema", texto: `O professor encerrou a ${sim.NOMES_PROVA[p]}.` });
    } else {
      return res.status(400).json({ msg: "Ação inválida." });
    }
    t.markModified("provas");
    await t.save();
    avisarTentativa(t, "controle", { acao, mensagens: t.mensagens.slice(-1) });
    if (acao === "encerrarProva") await posFinalizacao(def, t);
    res.json(serializar(def, t, req));
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// Notas do professor no formato TCF. `prova`: "ee" | "eo". Com `publicar: true` (e as
// duas expressões avaliadas), libera o resultado completo para o aluno.
router.post("/tentativas/:id/notas", exigirEquipe, async (req, res) => {
  try {
    const c = await carregar(req, res);
    if (!c) return;
    const { t, def } = c;
    if (!sim.temExpressoes(def)) return res.status(400).json({ msg: "Este simulado não tem expressões para corrigir." });
    const nome = await nomeDe(req.userId);
    for (const prova of ["ee", "eo"]) {
      const entrada = req.body?.[prova];
      if (!entrada || typeof entrada !== "object") continue;
      t.provas[prova].resultado = sim.montarResultadoExpressao(prova, def, entrada, { corretor: req.userId, corretorNome: nome });
    }
    t.markModified("provas");
    if (req.body?.publicar) {
      if (t.status === "em_andamento") return res.status(400).json({ msg: "O aluno ainda não terminou o simulado — salve como rascunho e publique ao final." });
      if (!t.provas.ee.resultado || !t.provas.eo.resultado) return res.status(400).json({ msg: "Avalie a Expression écrite e a Expression orale antes de publicar." });
      t.status = "corrigido";
      t.publicadoEm = new Date();
      t.mensagens.push({ autor: "sistema", texto: `${nome || "O professor"} publicou a correção do simulado.` });
    }
    await t.save();
    if (req.body?.publicar) avisarTentativa(t, "corrigido", { status: t.status });
    await avisarEquipe(t, "notas");
    res.json(serializar(def, t, req));
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.post("/tentativas/:id/modo", exigirEquipe, async (req, res) => {
  try {
    const c = await carregar(req, res);
    if (!c) return;
    const { t, def } = c;
    if (t.publicadoEm) return res.status(400).json({ msg: "A correção já foi publicada." });
    if (!sim.temExpressoes(def)) return res.status(400).json({ msg: "Este simulado é corrigido automaticamente." });
    t.modoCorrecao = req.body?.modoCorrecao === "ia" ? "ia" : "professor";
    await t.save();
    avisarTentativa(t, "conexao", { conexao: t.conexao, modoCorrecao: t.modoCorrecao });
    if (t.modoCorrecao === "ia" && t.status === "aguardando_correcao") rodarIA(def, t, { publicar: true });
    await avisarEquipe(t, "modo");
    res.json(serializar(def, t, req));
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

module.exports = router;
