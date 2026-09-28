const express = require("express");
const router = express.Router();
const net = require("net");
const EventoSeguranca = require("../models/eventoSeguranca");
const BloqueioIp = require("../models/bloqueioIp");
const User = require("../models/user");
const { exigirAuth, exigirAdmin } = require("../middleware/auth");
const { limitarTaxa, normalizarEmail, textoSeguro } = require("../middleware/seguranca");
const {
  CATALOGO, registrar, bloquearIp, desbloquearIp, revogarSessoes, resumoMemoria
} = require("../utils/monitorSeguranca");
const { enviarTeste, canaisConfigurados } = require("../utils/alertas");

// ===================== RELATO DO NAVEGADOR (público) =====================
// public/js/htmlSeguro.js avisa aqui quando bloqueia conteúdo malicioso ao exibir
// uma página — sinal de que há XSS armazenado no banco. Quem relata é a VÍTIMA,
// então o evento não pontua o IP; só alerta a equipe (com anti-flood).
const limiteRelato = limitarTaxa({ nome: "relato-navegador", janelaMs: 60 * 60 * 1000, max: 20 });
router.post("/relato-navegador", limiteRelato, (req, res) => {
  const pagina = textoSeguro(req.body.pagina, 200);
  const amostra = textoSeguro(req.body.amostra, 300);
  const motivo = textoSeguro(req.body.motivo, 60);
  if (pagina && amostra) registrar("xss_bloqueado_navegador", req, { pagina, motivo, amostra });
  res.status(204).end();
});

router.use(exigirAuth, exigirAdmin);

// ===================== RESUMO (cards do painel) =====================
router.get("/resumo", async (req, res) => {
  try {
    const desde = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [porSeveridade, porTipo, topIps, bloqueiosAtivos] = await Promise.all([
      EventoSeguranca.aggregate([{ $match: { criadoEm: { $gte: desde } } }, { $group: { _id: "$severidade", total: { $sum: 1 } } }]),
      EventoSeguranca.aggregate([
        { $match: { criadoEm: { $gte: desde }, severidade: { $ne: "info" } } },
        { $group: { _id: "$tipo", total: { $sum: 1 } } }, { $sort: { total: -1 } }, { $limit: 8 }
      ]),
      EventoSeguranca.aggregate([
        { $match: { criadoEm: { $gte: desde }, ip: { $ne: null }, severidade: { $in: ["media", "alta", "critica"] } } },
        { $group: { _id: "$ip", total: { $sum: 1 }, ultimo: { $max: "$criadoEm" } } }, { $sort: { total: -1 } }, { $limit: 8 }
      ]),
      BloqueioIp.countDocuments({ ate: { $gt: new Date() } })
    ]);
    res.json({
      ultimas24h: Object.fromEntries(porSeveridade.map(s => [s._id, s.total])),
      porTipo: porTipo.map(t => ({ tipo: t._id, descricao: CATALOGO[t._id]?.descricao || t._id, total: t.total })),
      topIps: topIps.map(i => ({ ip: i._id, total: i.total, ultimo: i.ultimo })),
      bloqueiosAtivos,
      canais: canaisConfigurados(),
      memoria: resumoMemoria()
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// ===================== EVENTOS =====================
router.get("/eventos", async (req, res) => {
  try {
    const filtro = {};
    const { severidade, tipo, ip } = req.query;
    if (typeof severidade === "string" && severidade) filtro.severidade = severidade;
    else filtro.severidade = { $ne: "info" };
    if (req.query.incluirInfo === "1" && !severidade) delete filtro.severidade;
    if (typeof tipo === "string" && CATALOGO[tipo]) filtro.tipo = tipo;
    if (typeof ip === "string" && ip) filtro.ip = ip.slice(0, 60);
    const pagina = Math.max(0, Math.min(200, parseInt(req.query.pagina, 10) || 0));

    const eventos = await EventoSeguranca.find(filtro)
      .sort({ criadoEm: -1 }).skip(pagina * 50).limit(50).lean();
    res.json(eventos);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.get("/catalogo", (req, res) => {
  res.json(Object.entries(CATALOGO).map(([tipo, d]) => ({ tipo, severidade: d.severidade, descricao: d.descricao })));
});

// ===================== BLOQUEIOS DE IP =====================
router.get("/bloqueios", async (req, res) => {
  try {
    const bloqueios = await BloqueioIp.find().sort({ ate: -1 }).limit(100).lean();
    const agora = new Date();
    res.json(bloqueios.map(b => ({ ...b, ativo: b.ate > agora })));
  } catch (err) {
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.post("/bloqueios", async (req, res) => {
  try {
    const ip = textoSeguro(req.body.ip, 60);
    const horas = Number(req.body.horas);
    const motivo = textoSeguro(req.body.motivo, 200) || "Bloqueio manual";
    if (!ip || !net.isIP(ip)) return res.status(400).json({ msg: "Informe um IP válido." });
    if (!Number.isFinite(horas) || horas <= 0 || horas > 24 * 365) return res.status(400).json({ msg: "Duração inválida." });
    if (ip === req.ip) return res.status(400).json({ msg: "Você não pode bloquear o seu próprio IP." });

    const b = await bloquearIp(ip, { motivo, duracaoMs: horas * 60 * 60 * 1000, adminId: req.userId });
    res.json({ msg: `IP ${ip} bloqueado até ${b.ate.toLocaleString("pt-BR")}.` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.delete("/bloqueios/:ip", async (req, res) => {
  try {
    const ip = req.params.ip;
    if (!net.isIP(ip)) return res.status(400).json({ msg: "IP inválido." });
    await desbloquearIp(ip, req.userId);
    res.json({ msg: `IP ${ip} desbloqueado.` });
  } catch (err) {
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// ===================== REVOGAR SESSÕES DE UMA CONTA =====================
// Para conta comprometida: derruba login em todos os dispositivos imediatamente.
router.post("/revogar-sessoes", async (req, res) => {
  try {
    const email = normalizarEmail(req.body.email);
    if (!email) return res.status(400).json({ msg: "Informe um e-mail válido." });
    const user = await User.findOne({ email }).select("_id email");
    if (!user) return res.status(404).json({ msg: "Usuário não encontrado." });
    await revogarSessoes(user._id, { motivo: "Revogação manual pelo painel de segurança", req, adminId: req.userId });
    res.json({ msg: `Todas as sessões de ${email} foram encerradas. A pessoa precisará entrar de novo.` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// ===================== TESTE DOS CANAIS DE ALERTA =====================
const limiteTeste = limitarTaxa({ nome: "teste-alerta", janelaMs: 10 * 60 * 1000, max: 3 });
router.post("/teste-alerta", limiteTeste, async (req, res) => {
  try {
    const admin = await User.findById(req.userId).select("email");
    const resultado = await enviarTeste(admin?.email);
    res.json({ msg: "Teste concluído.", resultado });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro ao enviar o teste." });
  }
});

module.exports = router;
