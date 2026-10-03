// Sistema de Aulas → « Registro de Aulas »: todas as aulas particulares mapeadas por data (da grade
// semanal e as avulsas), com estado (prevista, realizada, falta, falta justificada, cancelada pelo
// professor, remarcada), conteúdo da aula, observações, justificativa e atestado. Só o administrador.
const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const mongoose = require("mongoose");
const Matricula = require("../models/matricula");
const HorarioAtualAjuste = require("../models/horarioAtualAjuste");
const RegistroAula = require("../models/registroAula");
const User = require("../models/user");
const { exigirAuth, exigirAdmin } = require("../middleware/auth");
const { comTratamentoDeErro, pastaUpload } = require("../middleware/upload");

const router = express.Router();
router.use(exigirAuth, exigirAdmin);

const ESTADOS = RegistroAula.ESTADOS;
const FUSO_MIN = 180;                        // horário de Brasília (UTC−3, sem horário de verão)
const DIA_MS = 864e5;
const DATA_OK = /^\d{4}-\d{2}-\d{2}$/;
const HORA_OK = /^([01]\d|2[0-3]):[0-5]\d$/;

// "2026-10-05" + "19:00" (Brasília) → Date
function instante(dia, hora) {
  const [y, m, d] = dia.split("-").map(Number), [h, mi] = hora.split(":").map(Number);
  return new Date(Date.UTC(y, m - 1, d, h, mi) + FUSO_MIN * 60000);
}
// Date → "AAAA-MM-DD" no horário de Brasília
const diaDe = dt => new Date(dt.getTime() - FUSO_MIN * 60000).toISOString().slice(0, 10);
const diaSemanaDe = dia => new Date(dia + "T12:00:00Z").getUTCDay();

async function nomeDe(req) {
  const u = await User.findById(req.userId).select("nome").lean();
  return (u && u.nome) || "Administração";
}

// Fontes das aulas particulares semanais: matrículas confirmadas e nomes colocados à mão.
async function fontes() {
  const [mats, ajustes] = await Promise.all([
    Matricula.find({ tipo: "particular", status: { $in: ["confirmada", "concluida"] }, "slotsEscolhidos.0": { $exists: true } })
      .populate("alunoId", "nome email").select("alunoId dadosPessoais curso slotsEscolhidos criadoEm status").lean(),
    HorarioAtualAjuste.find().lean()
  ]);
  const ocultos = new Map(ajustes.filter(a => a.tipo === "oculto").map(a => [a.chave, a.criadoEm]));
  const l = [];
  mats.forEach(m => {
    const nome = m.alunoId?.nome || m.dadosPessoais?.nome || m.alunoId?.email || "Aluno";
    m.slotsEscolhidos.forEach(sl => {
      if (sl.diaSemana == null || !HORA_OK.test(String(sl.horaInicio))) return;
      const chave = "m:" + m._id;
      // retirado dos Horários Atuais: deixa de gerar aulas a partir da retirada
      const fim = ocultos.get(`${chave}|${sl.diaSemana}|${sl.horaInicio}`) || null;
      l.push({ chave, alunoId: m.alunoId?._id || null, nome, curso: m.curso || "", diaSemana: sl.diaSemana, hora: sl.horaInicio, inicio: m.criadoEm, fim, finalizada: m.status === "concluida" });
    });
  });
  // nomes colocados à mão; vinculados a uma conta, contam como a mesma pessoa da conta
  ajustes.filter(a => a.tipo === "manual" && a.modalidade !== "turma").forEach(a =>
    l.push({ chave: "a:" + a._id, alunoId: a.alunoId || null, nome: a.nome, curso: "", diaSemana: a.diaSemana, hora: a.horaInicio, inicio: a.criadoEm, fim: null }));
  return l;
}

// Ocorrências semanais de cada fonte entre `de` e `ate` (dias, inclusive).
function ocorrencias(fs, de, ate) {
  const out = [];
  for (let t = new Date(de + "T12:00:00Z").getTime(); t <= new Date(ate + "T12:00:00Z").getTime(); t += DIA_MS) {
    const dia = new Date(t).toISOString().slice(0, 10), dow = diaSemanaDe(dia);
    fs.forEach(f => {
      if (f.diaSemana !== dow) return;
      const quando = instante(dia, f.hora);
      if (f.inicio && quando < new Date(new Date(f.inicio).getTime() - DIA_MS)) return;   // antes de começar
      if (f.fim && quando >= new Date(f.fim)) return;
      out.push({ chave: f.chave, alunoId: f.alunoId, nome: f.nome, curso: f.curso, data: quando, origem: "grade" });
    });
  }
  return out;
}

// A pessoa da aula: a conta do site (matrícula ou nome vinculado) ou, sem conta, o nome escrito.
const pessoaDe = r => r.alunoId ? "u:" + r.alunoId : "n:" + String(r.nome || "").trim().toLowerCase();
const DIAS_CURTOS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const publico = (r, agora) => {
  const passou = new Date(r.data).getTime() + (r.duracaoMin || 60) * 60000 < agora;
  return {
    id: r._id ? String(r._id) : null, chave: r.chave, origem: r.origem || "grade", alunoId: r.alunoId ? String(r.alunoId) : null, pessoa: pessoaDe(r), nome: r.nome, curso: r.curso || "",
    data: r.data, dia: diaDe(new Date(r.data)), hora: new Date(new Date(r.data).getTime() - FUSO_MIN * 60000).toISOString().slice(11, 16),
    estado: r.estado || "prevista", aRegistrar: (r.estado || "prevista") === "prevista" && passou,
    professor: r.professor || "", conteudo: r.conteudo || "", observacao: r.observacao || "", justificativa: r.justificativa || "",
    atestado: r.atestado && r.atestado.nome ? { nome: r.atestado.nome, enviadoEm: r.atestado.enviadoEm } : null,
    historico: (r.historico || []).slice(-12), reposicaoDe: r.reposicaoDe || null
  };
};

// Lista das aulas no período: as da grade (registradas ou não) e as avulsas, com resumo por aluno.
router.get("/", async (req, res) => {
  try {
    const hoje = diaDe(new Date());
    let de = DATA_OK.test(req.query.de) ? req.query.de : diaDe(new Date(Date.now() - 6 * DIA_MS));
    let ate = DATA_OK.test(req.query.ate) ? req.query.ate : diaDe(new Date(Date.now() + 7 * DIA_MS));
    if (ate < de) [de, ate] = [ate, de];
    if ((new Date(ate) - new Date(de)) / DIA_MS > 400) return res.status(400).json({ msg: "Escolha um período de até 13 meses." });
    const fs2 = await fontes();
    const previstas = ocorrencias(fs2, de, ate);
    const registros = await RegistroAula.find({ data: { $gte: instante(de, "00:00"), $lte: instante(ate, "23:59") } }).lean();
    const porChave = new Map(registros.map(r => [r.chave + "|" + new Date(r.data).getTime(), r]));
    const agora = Date.now();
    const itens = previstas.map(p => {
      const r = porChave.get(p.chave + "|" + p.data.getTime());
      if (r) porChave.delete(p.chave + "|" + p.data.getTime());
      return publico(r ? { ...p, ...r, alunoId: r.alunoId || p.alunoId } : p, agora);
    });
    // registradas que já não estão na grade (aluno saiu, horário mudou) e as avulsas continuam no histórico
    porChave.forEach(r => itens.push(publico(r, agora)));
    itens.sort((a, b) => new Date(a.data) - new Date(b.data) || a.nome.localeCompare(b.nome));
    // resumo por pessoa (no período): os horários da mesma conta (matrícula e nomes vinculados) juntos
    const horariosDe = {};
    fs2.forEach(f => {
      const k = pessoaDe(f);
      const h = horariosDe[k] = horariosDe[k] || { nome: f.nome, chaves: [], lista: [] };
      if (!h.chaves.includes(f.chave)) h.chaves.push(f.chave);
      const rot = DIAS_CURTOS[f.diaSemana] + " " + f.hora;
      if (!h.lista.includes(rot)) h.lista.push(rot);
    });
    const alunos = {};
    itens.forEach(i => {
      const k = i.pessoa;
      const a = alunos[k] = alunos[k] || { pessoa: k, chave: i.chave, alunoId: i.alunoId, nome: (horariosDe[k] && horariosDe[k].nome) || i.nome, curso: i.curso, horarios: horariosDe[k] ? horariosDe[k].lista : [],
        total: 0, realizadas: 0, faltas: 0, justificadas: 0, canceladas: 0, aRegistrar: 0, previstas: 0 };
      if (!a.curso && i.curso) a.curso = i.curso;
      a.total++;
      if (i.estado === "realizada") a.realizadas++;
      else if (i.estado === "falta") a.faltas++;
      else if (i.estado === "falta_justificada") a.justificadas++;
      else if (i.estado === "cancelada_professor" || i.estado === "remarcada") a.canceladas++;
      else if (i.aRegistrar) a.aRegistrar++; else a.previstas++;
    });
    const lista = Object.values(alunos).map(a => ({ ...a, presenca: a.realizadas + a.faltas + a.justificadas ? Math.round(a.realizadas / (a.realizadas + a.faltas + a.justificadas) * 100) : null }))
      .sort((x, y) => x.nome.localeCompare(y.nome));
    const soma = k => lista.reduce((t, a) => t + a[k], 0);
    res.json({
      de, ate, hoje, itens, alunos: lista, estados: ESTADOS,
      resumo: { total: itens.length, realizadas: soma("realizadas"), faltas: soma("faltas"), justificadas: soma("justificadas"), canceladas: soma("canceladas"), aRegistrar: soma("aRegistrar"), previstas: soma("previstas") }
    });
  } catch (err) { console.error(err); res.status(500).json({ msg: "Erro no servidor." }); }
});

// Garante o registro de uma ocorrência (da grade ou avulsa) para gravar alterações.
async function registroDe(chave, dataISO) {
  const data = new Date(dataISO);
  if (!/^[mxa]:[a-f0-9]{24}$/i.test(String(chave)) || isNaN(data)) throw { status: 400, msg: "Aula inválida." };
  let r = await RegistroAula.findOne({ chave, data });
  if (r) return r;
  if (chave.startsWith("x:")) throw { status: 404, msg: "Aula avulsa não encontrada." };
  const f = (await fontes()).find(x => x.chave === chave && x.diaSemana === new Date(data.getTime() - FUSO_MIN * 60000).getUTCDay());
  if (!f) throw { status: 404, msg: "Esta aula não está na grade." };
  return new RegistroAula({ chave, origem: "grade", alunoId: f.alunoId, nome: f.nome, curso: f.curso, data });
}
const limpar = (v, n) => String(v == null ? "" : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, n);
const ROTULO = { prevista: "Prevista", realizada: "Realizada", falta: "Falta", falta_justificada: "Falta justificada", cancelada_professor: "Cancelada pelo professor", remarcada: "Remarcada" };

function aplicar(r, corpo, quem) {
  const antes = r.estado;
  if (corpo.estado !== undefined) {
    if (!ESTADOS.includes(corpo.estado)) throw { status: 400, msg: "Estado inválido." };
    r.estado = corpo.estado;
  }
  for (const [k, n] of [["professor", 120], ["conteudo", 2000], ["observacao", 2000], ["justificativa", 2000]]) if (corpo[k] !== undefined) r[k] = limpar(corpo[k], n);
  r.atualizadoEm = new Date();
  const nota = corpo.estado !== undefined && corpo.estado !== antes ? `${ROTULO[antes] || antes} → ${ROTULO[r.estado]}` : "Detalhes atualizados";
  r.historico.push({ estado: r.estado, nota, porId: quem.id, porNome: quem.nome, em: new Date() });
}

// Alterar o estado e os detalhes de uma aula.
router.put("/", async (req, res) => {
  try {
    const r = await registroDe(req.body?.chave, req.body?.data);
    aplicar(r, req.body || {}, { id: req.userId, nome: await nomeDe(req) });
    await r.save();
    res.json({ ok: true, aula: publico(r.toObject(), Date.now()) });
  } catch (err) { if (err.status) return res.status(err.status).json({ msg: err.msg }); console.error(err); res.status(500).json({ msg: "Erro no servidor." }); }
});

// Várias aulas de uma vez (ex.: « marcar a semana como realizada »).
router.post("/lote", async (req, res) => {
  try {
    const itens = Array.isArray(req.body?.itens) ? req.body.itens.slice(0, 200) : [];
    const estado = req.body?.estado;
    if (!ESTADOS.includes(estado) || !itens.length) return res.status(400).json({ msg: "Escolha as aulas e o estado." });
    const quem = { id: req.userId, nome: await nomeDe(req) };
    let n = 0;
    for (const it of itens) {
      const r = await registroDe(it.chave, it.data);
      aplicar(r, { estado }, quem);
      await r.save(); n++;
    }
    res.json({ ok: true, alteradas: n });
  } catch (err) { if (err.status) return res.status(err.status).json({ msg: err.msg }); console.error(err); res.status(500).json({ msg: "Erro no servidor." }); }
});

// Aula avulsa (reposição ou aula extra) para um aluno da grade ou um nome livre.
router.post("/avulsa", async (req, res) => {
  try {
    const { dia, hora, chave, nome, estado, observacao, reposicaoDe } = req.body || {};
    if (!DATA_OK.test(String(dia)) || !HORA_OK.test(String(hora))) return res.status(400).json({ msg: "Informe a data e o horário." });
    let base = null;
    if (chave) base = (await fontes()).find(f => f.chave === chave);
    const nomeFinal = base ? base.nome : limpar(nome, 120);
    if (!nomeFinal) return res.status(400).json({ msg: "Escolha o aluno ou escreva o nome." });
    const id = new mongoose.Types.ObjectId();
    const r = new RegistroAula({
      chave: "x:" + id, origem: "avulsa", alunoId: base?.alunoId || null, nome: nomeFinal, curso: base?.curso || "",
      data: instante(dia, hora), estado: ESTADOS.includes(estado) ? estado : "prevista", observacao: limpar(observacao, 2000),
      reposicaoDe: reposicaoDe && !isNaN(new Date(reposicaoDe)) ? new Date(reposicaoDe) : null
    });
    r.historico.push({ estado: r.estado, nota: "Aula avulsa criada" + (r.reposicaoDe ? " (reposição)" : ""), porId: req.userId, porNome: await nomeDe(req) });
    await r.save();
    res.json({ ok: true, aula: publico(r.toObject(), Date.now()) });
  } catch (err) { console.error(err); res.status(500).json({ msg: "Erro no servidor." }); }
});
router.delete("/avulsa/:id", async (req, res) => {
  try {
    if (!/^[a-f0-9]{24}$/i.test(req.params.id)) return res.status(400).json({ msg: "Aula inválida." });
    const r = await RegistroAula.findOneAndDelete({ _id: req.params.id, origem: "avulsa" });
    if (!r) return res.status(404).json({ msg: "Aula avulsa não encontrada." });
    if (r.atestado?.caminho) fs.unlink(r.atestado.caminho, () => {});
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ msg: "Erro no servidor." }); }
});

// Atestado (PDF ou imagem, até 8 MB): anexado à aula; uma falta passa a « falta justificada ».
const TIPOS = { "application/pdf": ".pdf", "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => { try { cb(null, pastaUpload("atestados")); } catch (e) { cb(e); } },
    filename: (req, file, cb) => cb(null, "atestado-" + crypto.randomUUID() + (TIPOS[file.mimetype] || ".bin"))
  }),
  fileFilter: (req, file, cb) => TIPOS[file.mimetype] ? cb(null, true) : cb(new Error("Envie um PDF ou uma imagem (JPG, PNG).")),
  limits: { fileSize: 8 * 1024 * 1024 }
});
router.post("/atestado", comTratamentoDeErro(upload.single("arquivo")), async (req, res) => {
  const descartar = () => { if (req.file) fs.unlink(req.file.path, () => {}); };
  try {
    if (!req.file) return res.status(400).json({ msg: "Escolha o arquivo do atestado." });
    const r = await registroDe(req.body?.chave, req.body?.data);
    if (r.atestado?.caminho) fs.unlink(r.atestado.caminho, () => {});
    r.atestado = { nome: limpar(req.file.originalname, 160) || "atestado", caminho: req.file.path, mimetype: req.file.mimetype, tamanho: req.file.size, enviadoEm: new Date() };
    const corpo = { justificativa: req.body?.justificativa !== undefined ? req.body.justificativa : r.justificativa || "Atestado apresentado." };
    if (r.estado === "falta" || r.estado === "prevista") corpo.estado = "falta_justificada";
    aplicar(r, corpo, { id: req.userId, nome: await nomeDe(req) });
    r.historico[r.historico.length - 1].nota += " · atestado anexado";
    await r.save();
    res.json({ ok: true, aula: publico(r.toObject(), Date.now()) });
  } catch (err) { descartar(); if (err.status) return res.status(err.status).json({ msg: err.msg }); console.error(err); res.status(500).json({ msg: "Erro no servidor." }); }
});
router.get("/atestado/:id", async (req, res) => {
  try {
    if (!/^[a-f0-9]{24}$/i.test(req.params.id)) return res.status(400).json({ msg: "Aula inválida." });
    const r = await RegistroAula.findById(req.params.id).lean();
    if (!r?.atestado?.caminho || !fs.existsSync(r.atestado.caminho)) return res.status(404).json({ msg: "Atestado não encontrado." });
    res.download(r.atestado.caminho, r.atestado.nome || path.basename(r.atestado.caminho));
  } catch (err) { console.error(err); res.status(500).json({ msg: "Erro no servidor." }); }
});

module.exports = router;
