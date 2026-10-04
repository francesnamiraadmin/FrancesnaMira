const express = require("express");
const router = express.Router();
const fs = require("fs");
const PlanoBase = require("../models/planoBase");
const DeverSemanal = require("../models/deverSemanal");
const AtribuicaoPlanoBase = require("../models/atribuicaoPlanoBase");
const Turma = require("../models/turma");
const { exigirAuth, exigirProfessor } = require("../middleware/auth");
const { uploadEntregaDever, comTratamentoDeErro } = require("../middleware/uploadDeveres");
const { gerarSemanasPendentes, atualizarSemanasDoAluno, statusDever, enriquecerDever } = require("../utils/gerarDeveres");
const { montarNovaProducao } = require("./producoes");
const { transmitir } = require("../utils/sse");
const { ehObjectId } = require("../middleware/seguranca");
const User = require("../models/user");
const exerciciosUtil = require("../utils/exercicios");

router.use(exigirAuth);

// Ids e índices de atividade chegam na URL e são usados para indexar arrays e
// montar pastas de upload — só aceita ObjectId / inteiro pequeno.
for (const nome of ["id", "deverId", "alunoId", "loteId"]) {
  router.param(nome, (req, res, next, valor) => (ehObjectId(valor) ? next() : res.status(400).json({ msg: "Identificador inválido." })));
}
router.param("index", (req, res, next, valor) => (/^\d{1,3}$/.test(valor) ? next() : res.status(400).json({ msg: "Índice inválido." })));

// Preenche as referências dentro de atividades.conteudo (tema/aula/módulo) com
// um título legível em vez do ObjectId cru, pro aluno/admin verem o nome real.
const POPULATE_CONTEUDO = [
  { path: "atividades.conteudo.temaId", select: "titulo courseType origemModeles" },
  { path: "atividades.conteudo.aulaId", select: "titulo" },
  { path: "atividades.conteudo.moduloId", select: "titulo" },
  { path: "atividades.conteudo.conjuntoId", select: "nome descricao quantidadeQuestoes" }
];

// ===================== ADMIN/PROFESSOR: PLANOS-BASE (templates) =====================
router.get("/planos-base", exigirProfessor, async (req, res) => {
  try {
    const [planos, atribuicoes] = await Promise.all([
      PlanoBase.find({ ativo: true }).select("nome curso descricao semanas.numero semanas.titulo semanas.atividades.tipo semanas.atividades.titulo criadoEm").sort({ nome: 1 }).lean(),
      AtribuicaoPlanoBase.aggregate([{ $match: { ativo: true } }, { $group: { _id: "$planoBaseId", n: { $sum: 1 } } }])
    ]);
    const alunosPorPlano = Object.fromEntries(atribuicoes.map(a => [String(a._id), a.n]));
    res.json(planos.map(p => {
      const atividades = p.semanas.flatMap(s => s.atividades || []);
      return {
        _id: p._id, nome: p.nome, curso: p.curso, descricao: p.descricao, criadoEm: p.criadoEm,
        totalSemanas: p.semanas.length,
        totalAtividades: atividades.length,
        totalDeveresCompletos: atividades.filter(a => a.tipo === "exercicio_interativo").length,
        totalAlunos: alunosPorPlano[String(p._id)] || 0,
        semanas: p.semanas.map(s => ({ numero: s.numero, titulo: s.titulo, atividades: (s.atividades || []).map(a => ({ tipo: a.tipo, titulo: a.titulo })) }))
      };
    }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.get("/planos-base/:id", exigirProfessor, async (req, res) => {
  try {
    const plano = await PlanoBase.findById(req.params.id);
    if (!plano) return res.status(404).json({ msg: "Plano-base não encontrado." });
    res.json(plano);
  } catch (err) {
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.post("/planos-base", exigirProfessor, async (req, res) => {
  try {
    const { nome, curso, descricao, semanas } = req.body;
    if (!nome || !Array.isArray(semanas) || !semanas.length) {
      return res.status(400).json({ msg: "Informe o nome e ao menos uma semana." });
    }
    const plano = await PlanoBase.create({ nome, curso, descricao, semanas, criadoPor: req.userId });
    res.json(plano);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.put("/planos-base/:id", exigirProfessor, async (req, res) => {
  try {
    const { nome, curso, descricao, semanas } = req.body;
    const plano = await PlanoBase.findByIdAndUpdate(
      req.params.id,
      { ...(nome && { nome }), curso, descricao, ...(semanas && { semanas }) },
      { new: true, runValidators: true }
    );
    if (!plano) return res.status(404).json({ msg: "Plano-base não encontrado." });
    res.json(plano);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// Cópia editável de um Plano-Base (mesmas semanas e atividades, nome "(cópia)").
router.post("/planos-base/:id/duplicar", exigirProfessor, async (req, res) => {
  try {
    const plano = await PlanoBase.findById(req.params.id).lean();
    if (!plano) return res.status(404).json({ msg: "Plano-base não encontrado." });
    const semanas = plano.semanas.map(({ _id, ...s }) => ({ ...s, atividades: (s.atividades || []).map(({ _id: _a, ...a }) => a) }));
    const copia = await PlanoBase.create({ nome: plano.nome + " (cópia)", curso: plano.curso, descricao: plano.descricao, semanas, criadoPor: req.userId });
    res.json(copia);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.delete("/planos-base/:id", exigirProfessor, async (req, res) => {
  try {
    await PlanoBase.findByIdAndUpdate(req.params.id, { ativo: false });
    res.json({ msg: "Plano-base removido." });
  } catch (err) {
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// ===================== ADMIN/PROFESSOR: ATRIBUIÇÃO =====================
router.get("/alunos/:alunoId/atribuicao", exigirProfessor, async (req, res) => {
  try {
    const atribuicao = await AtribuicaoPlanoBase.findOne({ alunoId: req.params.alunoId, ativo: true }).populate("planoBaseId", "nome curso");
    res.json(atribuicao || null);
  } catch (err) {
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.post("/atribuir", exigirProfessor, async (req, res) => {
  try {
    const { alunoId, planoBaseId, dataInicio, vinculoTipo, turmaId } = req.body;
    if (!alunoId || !planoBaseId || !dataInicio || !vinculoTipo) {
      return res.status(400).json({ msg: "Preencha aluno, plano-base, data de início e vínculo." });
    }
    if (vinculoTipo === "turma" && !turmaId) {
      return res.status(400).json({ msg: "Selecione a turma para calcular o fim da matrícula." });
    }
    if (vinculoTipo === "turma") {
      const turma = await Turma.findById(turmaId);
      if (!turma) return res.status(404).json({ msg: "Turma não encontrada." });
    }

    // um aluno pode ter vários Planos-Base ativos (ex.: o da Atribuição-base do curso): só substitui o mesmo plano
    await AtribuicaoPlanoBase.updateMany({ alunoId, planoBaseId, ativo: true }, { ativo: false });
    const atribuicao = await AtribuicaoPlanoBase.create({
      alunoId, planoBaseId, dataInicio: new Date(dataInicio), vinculoTipo, turmaId: turmaId || null
    });

    const criadas = await gerarSemanasPendentes(atribuicao);
    res.json({ atribuicao, semanasGeradas: criadas.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// ===================== ADMIN/PROFESSOR: DEVER MANUAL / EDIÇÃO =====================
router.post("/alunos/:alunoId/deveres", exigirProfessor, async (req, res) => {
  try {
    const { numeroSemana, titulo, descricao, dataInicio, dataLimite, prioridade, professorId, observacoes, permiteConclusaoManual, atividades } = req.body;
    if (!numeroSemana || !titulo || !dataInicio || !dataLimite) {
      return res.status(400).json({ msg: "Preencha número da semana, título, data de início e data limite." });
    }
    const dever = await DeverSemanal.create({
      alunoId: req.params.alunoId, planoBaseId: null, numeroSemana, titulo, descricao,
      dataInicio: new Date(dataInicio), dataLimite: new Date(dataLimite),
      prioridade, professorId: professorId || null, observacoes, permiteConclusaoManual: !!permiteConclusaoManual,
      atividades: (atividades || []).map(a => ({ ...a, entrega: { status: "pendente" } }))
    });
    res.json(await enriquecerDever(dever));
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.put("/deveres/:id", exigirProfessor, async (req, res) => {
  try {
    const { titulo, descricao, dataInicio, dataLimite, prioridade, professorId, observacoes, permiteConclusaoManual, atividades } = req.body;
    const dever = await DeverSemanal.findById(req.params.id).populate(POPULATE_CONTEUDO);
    if (!dever) return res.status(404).json({ msg: "Dever não encontrado." });

    if (titulo !== undefined) dever.titulo = titulo;
    if (descricao !== undefined) dever.descricao = descricao;
    if (dataInicio !== undefined) dever.dataInicio = new Date(dataInicio);
    if (dataLimite !== undefined) dever.dataLimite = new Date(dataLimite);
    if (prioridade !== undefined) dever.prioridade = prioridade;
    if (professorId !== undefined) dever.professorId = professorId || null;
    if (observacoes !== undefined) dever.observacoes = observacoes;
    if (permiteConclusaoManual !== undefined) dever.permiteConclusaoManual = !!permiteConclusaoManual;
    if (atividades !== undefined) {
      // Preserva a entrega já feita pelo aluno quando a atividade continua existindo
      // (mesmo índice); atividades novas nascem "pendente".
      dever.atividades = atividades.map((a, i) => ({ ...a, entrega: dever.atividades[i]?.entrega || { status: "pendente" } }));
    }
    await dever.save();
    res.json(await enriquecerDever(dever));
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// Comentário do professor numa entrega específica (sem mexer no restante do dever)
router.put("/deveres/:id/atividades/:index/comentario", exigirProfessor, async (req, res) => {
  try {
    const { comentario } = req.body;
    const dever = await DeverSemanal.findById(req.params.id).populate(POPULATE_CONTEUDO);
    if (!dever) return res.status(404).json({ msg: "Dever não encontrado." });
    const atividade = dever.atividades[req.params.index];
    if (!atividade) return res.status(404).json({ msg: "Atividade não encontrada." });
    atividade.entrega.comentarioProfessor = comentario || "";
    await dever.save();
    transmitir("dever-atualizado", { alunoId: String(dever.alunoId) });
    res.json(await enriquecerDever(dever));
  } catch (err) {
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// Admin anexa um arquivo real (PDF/Word/imagem/etc.) como conteúdo de uma
// atividade "upload_arquivo" — o aluno baixa pela rota de material abaixo.
router.post("/deveres/:deverId/atividades/:index/material", exigirProfessor, comTratamentoDeErro(uploadEntregaDever.single("arquivo")), async (req, res) => {
  const limparTemp = () => { if (req.file) fs.unlink(req.file.path, () => {}); };
  try {
    const dever = await DeverSemanal.findById(req.params.deverId).populate(POPULATE_CONTEUDO);
    if (!dever) { limparTemp(); return res.status(404).json({ msg: "Dever não encontrado." }); }
    const atividade = dever.atividades[req.params.index];
    if (!atividade) { limparTemp(); return res.status(404).json({ msg: "Atividade não encontrada." }); }
    if (!req.file) return res.status(400).json({ msg: "Envie um arquivo." });

    atividade.conteudo = atividade.conteudo || {};
    atividade.conteudo.arquivo = {
      nome: req.file.originalname, caminho: req.file.path, tamanho: req.file.size,
      mimetype: req.file.mimetype, enviadoEm: new Date()
    };
    await dever.save();
    res.json(await enriquecerDever(dever));
  } catch (err) {
    limparTemp();
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// Download autenticado do material anexado pelo admin (paralelo à rota de
// entrega abaixo, que baixa o que o ALUNO enviou).
router.get("/deveres/:id/atividades/:index/material", async (req, res) => {
  try {
    const dever = await DeverSemanal.findById(req.params.id);
    if (!dever) return res.status(404).json({ msg: "Dever não encontrado." });
    if (String(dever.alunoId) !== req.userId && req.userRole !== "admin" && req.userRole !== "professor") {
      return res.status(403).json({ msg: "Acesso negado." });
    }
    const arquivo = dever.atividades[req.params.index]?.conteudo?.arquivo;
    if (!arquivo?.caminho) return res.status(404).json({ msg: "Arquivo não encontrado." });
    res.download(arquivo.caminho, arquivo.nome);
  } catch (err) {
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// ===================== ADMIN/PROFESSOR: LISTAGEM DE UM ALUNO =====================
router.get("/alunos/:alunoId/deveres", exigirProfessor, async (req, res) => {
  try {
    await atualizarSemanasDoAluno(req.params.alunoId);
    const deveres = await DeverSemanal.find({ alunoId: req.params.alunoId }).populate(POPULATE_CONTEUDO).sort({ numeroSemana: 1 });
    res.json(await Promise.all(deveres.map(enriquecerDever)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// ===================== ADMIN/PROFESSOR: DASHBOARD =====================
router.get("/dashboard", exigirProfessor, async (req, res) => {
  try {
    const deveres = await DeverSemanal.find().select("numeroSemana dataInicio dataLimite concluidoEm atividades.obrigatoria atividades.entrega alunoId").lean();

    let concluidos = 0, atrasados = 0, emAndamento = 0, uploads = 0;
    let somaDiasConclusao = 0, totalConcluidosComTempo = 0;
    const alunosComAtraso = new Set();
    const porSemana = {};

    deveres.forEach(d => {
      const status = statusDever(d);
      if (status === "concluido") {
        concluidos++;
        const dias = (new Date(d.concluidoEm) - new Date(d.dataInicio)) / (24 * 60 * 60 * 1000);
        if (dias >= 0) { somaDiasConclusao += dias; totalConcluidosComTempo++; }
      } else if (status === "atrasado") {
        atrasados++;
        alunosComAtraso.add(String(d.alunoId));
      } else {
        emAndamento++;
      }

      (d.atividades || []).forEach(a => { if (a.entrega?.arquivo?.nome) uploads++; });

      if (!porSemana[d.numeroSemana]) porSemana[d.numeroSemana] = { total: 0, atrasados: 0 };
      porSemana[d.numeroSemana].total++;
      if (status === "atrasado") porSemana[d.numeroSemana].atrasados++;
    });

    const semanasMaisCriticas = Object.entries(porSemana)
      .map(([numero, v]) => ({ numero: Number(numero), taxaAtraso: v.total ? Math.round((v.atrasados / v.total) * 100) : 0, total: v.total }))
      .filter(s => s.total >= 1)
      .sort((a, b) => b.taxaAtraso - a.taxaAtraso)
      .slice(0, 5);

    res.json({
      total: deveres.length, concluidos, atrasados, emAndamento,
      taxaMediaConclusao: deveres.length ? Math.round((concluidos / deveres.length) * 100) : 0,
      tempoMedioConclusaoDias: totalConcluidosComTempo ? Math.round((somaDiasConclusao / totalConcluidosComTempo) * 10) / 10 : null,
      quantidadeUploads: uploads,
      quantidadeAlunosComAtraso: alunosComAtraso.size,
      semanasMaisCriticas
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// ===================== ADMIN/PROFESSOR: ACOMPANHAMENTO =====================
// O que os alunos estão fazendo: feed das últimas entregas de todos os deveres
// e um resumo por aluno (semana atual, progresso, atrasos, média nos deveres
// completos). Tudo calculado a partir dos DeverSemanal já existentes.
const notaDeverCompleto = texto => {
  const m = /Nota automática: (\d+)\/(\d+) \((\d+)%\)/.exec(texto || "");
  return m ? { pontos: Number(m[1]), total: Number(m[2]), percentual: Number(m[3]) } : null;
};
router.get("/acompanhamento", exigirProfessor, async (req, res) => {
  try {
    const deveres = await DeverSemanal.find()
      .select("alunoId numeroSemana titulo dataInicio dataLimite concluidoEm atividades.tipo atividades.titulo atividades.obrigatoria atividades.conteudo.exercicioSlug atividades.entrega")
      .populate("alunoId", "nome email").lean();
    const hoje = new Date();
    const feed = [];
    const porAluno = new Map();
    deveres.forEach(d => {
      if (!d.alunoId) return;
      const id = String(d.alunoId._id);
      const r = porAluno.get(id) || { alunoId: id, nome: d.alunoId.nome, email: d.alunoId.email,
        deveres: 0, concluidos: 0, atrasados: 0, atividades: 0, entregues: 0, notas: [], ultimaEntrega: null, semanaAtual: null };
      r.deveres++;
      const status = statusDever(d);
      if (status === "concluido") r.concluidos++;
      if (status === "atrasado") r.atrasados++;
      if (new Date(d.dataInicio) <= hoje && (!r.semanaAtual || d.numeroSemana > r.semanaAtual.numero)) r.semanaAtual = { numero: d.numeroSemana, titulo: d.titulo };
      (d.atividades || []).forEach(a => {
        r.atividades++;
        if (a.entrega?.status !== "enviado") return;
        r.entregues++;
        const nota = a.tipo === "exercicio_interativo" ? notaDeverCompleto(a.entrega.texto) : null;
        if (nota) r.notas.push(nota.percentual);
        const quando = a.entrega.enviadoEm ? new Date(a.entrega.enviadoEm) : null;
        if (quando && (!r.ultimaEntrega || quando > r.ultimaEntrega)) r.ultimaEntrega = quando;
        feed.push({ alunoId: id, aluno: d.alunoId.nome, deverId: String(d._id), semana: d.numeroSemana, dever: d.titulo,
          atividade: a.titulo, tipo: a.tipo, slug: a.conteudo?.exercicioSlug || null, enviadoEm: quando, nota,
          atrasada: !!(quando && quando > new Date(d.dataLimite)) });
      });
      porAluno.set(id, r);
    });
    const alunos = [...porAluno.values()].map(r => ({
      ...r, notas: undefined,
      progresso: r.atividades ? Math.round((r.entregues / r.atividades) * 100) : 0,
      mediaDeveresCompletos: r.notas.length ? Math.round(r.notas.reduce((a, b) => a + b, 0) / r.notas.length) : null
    })).sort((a, b) => (b.ultimaEntrega || 0) - (a.ultimaEntrega || 0));
    feed.sort((a, b) => (b.enviadoEm || 0) - (a.enviadoEm || 0));
    res.json({ feed: feed.slice(0, 60), alunos });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// Atribuição rápida: cria, para um ou vários alunos, um dever de casa feito só de
// deveres completos (backend/data/exercicios), na próxima semana livre de cada um.
router.post("/deveres-completos/atribuir", exigirProfessor, async (req, res) => {
  try {
    const { alunoIds, slugs, titulo, descricao, dataInicio, dataLimite, prioridade } = req.body || {};
    const ids = [...new Set((Array.isArray(alunoIds) ? alunoIds : []).filter(ehObjectId))];
    const lista = (Array.isArray(slugs) ? slugs : []).filter(s => typeof s === "string" && exerciciosUtil.obter(s));
    if (!ids.length || !lista.length) return res.status(400).json({ msg: "Escolha ao menos um aluno e um dever completo." });
    if (!dataInicio || !dataLimite || new Date(dataLimite) < new Date(dataInicio)) return res.status(400).json({ msg: "Informe datas válidas (o prazo não pode ser antes do início)." });
    const alunos = await User.find({ _id: { $in: ids } }).select("_id").lean();
    const atividades = lista.map(slug => {
      const def = exerciciosUtil.obter(slug);
      return { tipo: "exercicio_interativo", titulo: def.titulo, descricao: def.descricao, obrigatoria: true, dependeDe: null, conteudo: { exercicioSlug: slug }, entrega: { status: "pendente" } };
    });
    const criados = [];
    for (const a of alunos) {
      const ultimo = await DeverSemanal.findOne({ alunoId: a._id }).sort({ numeroSemana: -1 }).select("numeroSemana").lean();
      const dever = await DeverSemanal.create({
        alunoId: a._id, planoBaseId: null, numeroSemana: (ultimo?.numeroSemana || 0) + 1,
        titulo: String(titulo || "Deveres completos").slice(0, 150), descricao: descricao ? String(descricao).slice(0, 2000) : undefined,
        dataInicio: new Date(dataInicio), dataLimite: new Date(dataLimite),
        prioridade: ["baixa", "media", "alta"].includes(prioridade) ? prioridade : "media",
        professorId: req.userId, atividades
      });
      criados.push(String(dever._id));
      transmitir("dever-atualizado", { alunoId: String(a._id) });
    }
    res.json({ msg: `Dever criado para ${criados.length} aluno(s).`, criados });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// ===================== CRIAR DEVER (Gestão de Alunos › Criar Dever) =====================
// O construtor monta um dever com atividades de todo o site (questões, produções do Ambiente,
// aulas gravadas, deveres completos) para um curso. Pode ser enviado a alunos (um « lote »: o
// mesmo dever, uma cópia por aluno, editável de uma vez) ou virar um Plano-Base de várias semanas.
const criarDever = require("../utils/criarDever");
const AtribuicaoBaseCurso = require("../models/atribuicaoBaseCurso");
const { TIPOS_CURSO } = require("../utils/tiposCurso");
const mongooseLib = require("mongoose");
const { aplicarAtribuicoesBase, copiarAtividades, cursosAtivos } = require("../utils/gerarDeveres");
const DIA = 864e5;
const erroStatus = (res, err) => {
  if (err && err.status) return res.status(err.status).json({ msg: err.msg || err.message });
  console.error(err); return res.status(500).json({ msg: "Erro no servidor." });
};
const datasValidas = (ini, fim) => ini && fim && !isNaN(new Date(ini)) && !isNaN(new Date(fim)) && new Date(fim) >= new Date(ini);

router.get("/criar/catalogo", exigirProfessor, async (req, res) => {
  try { res.json(await criarDever.catalogo(String(req.query.curso || "TCF"), String(req.query.nivel || ""))); }
  catch (err) { erroStatus(res, err); }
});

// Chave de uma atividade para reaproveitar a entrega quando o dever é editado.
const chaveAtividade = a => {
  const c = a.conteudo || {};
  const ref = c.conjuntoId || c.temaId || c.aulaId || c.moduloId || c.exercicioSlug || c.sujetId || a.titulo;
  return a.tipo + "|" + String(ref && ref._id ? ref._id : ref);
};

// Enviar um dever novo a vários alunos.
router.post("/lotes", exigirProfessor, async (req, res) => {
  try {
    const b = req.body || {};
    const ids = [...new Set((Array.isArray(b.alunoIds) ? b.alunoIds : []).filter(ehObjectId))];
    if (!ids.length) return res.status(400).json({ msg: "Escolha pelo menos um aluno." });
    if (!String(b.titulo || "").trim()) return res.status(400).json({ msg: "Dê um título ao dever." });
    if (!datasValidas(b.dataInicio, b.dataLimite)) return res.status(400).json({ msg: "Informe datas válidas (o prazo não pode ser antes do início)." });
    const curso = TIPOS_CURSO.includes(b.curso) ? b.curso : null;
    const atividades = await criarDever.prepararAtividades(b.atividades, { curso, nivel: b.nivel, userId: req.userId });
    const alunos = await User.find({ _id: { $in: ids } }).select("_id").lean();
    const loteId = new mongooseLib.Types.ObjectId();
    for (const a of alunos) {
      const ultimo = await DeverSemanal.findOne({ alunoId: a._id }).sort({ numeroSemana: -1 }).select("numeroSemana").lean();
      await DeverSemanal.create({
        alunoId: a._id, planoBaseId: null, numeroSemana: (ultimo?.numeroSemana || 0) + 1, loteId, curso,
        titulo: String(b.titulo).trim().slice(0, 150), descricao: b.descricao ? String(b.descricao).slice(0, 4000) : undefined,
        dataInicio: new Date(b.dataInicio), dataLimite: new Date(b.dataLimite),
        prioridade: ["baixa", "media", "alta"].includes(b.prioridade) ? b.prioridade : "media",
        permiteConclusaoManual: !!b.permiteConclusaoManual, professorId: req.userId,
        atividades: copiarAtividades(atividades)
      });
      transmitir("dever-atualizado", { alunoId: String(a._id) });
    }
    res.json({ msg: `Dever enviado para ${alunos.length} aluno(s).`, loteId: String(loteId), alunos: alunos.length });
  } catch (err) { erroStatus(res, err); }
});

// Deveres já enviados (por lote), do mais novo para o mais antigo.
router.get("/lotes", exigirProfessor, async (req, res) => {
  try {
    const g = await DeverSemanal.aggregate([
      { $match: { loteId: { $ne: null } } },
      { $group: { _id: "$loteId", titulo: { $first: "$titulo" }, curso: { $first: "$curso" }, alunos: { $sum: 1 }, concluidos: { $sum: { $cond: [{ $ifNull: ["$concluidoEm", false] }, 1, 0] } },
        dataInicio: { $first: "$dataInicio" }, dataLimite: { $first: "$dataLimite" }, criadoEm: { $min: "$criadoEm" }, atividades: { $first: { $size: "$atividades" } }, tipos: { $first: "$atividades.tipo" } } },
      { $sort: { criadoEm: -1 } }, { $limit: 200 }
    ]);
    res.json(g.map(x => ({ ...x, loteId: String(x._id) })));
  } catch (err) { erroStatus(res, err); }
});

router.get("/lotes/:loteId", exigirProfessor, async (req, res) => {
  try {
    const deveres = await DeverSemanal.find({ loteId: req.params.loteId }).populate("alunoId", "nome email").populate(POPULATE_CONTEUDO).sort({ criadoEm: 1 });
    if (!deveres.length) return res.status(404).json({ msg: "Dever não encontrado." });
    const d0 = deveres[0];
    const alunos = await Promise.all(deveres.map(async d => {
      const e = await enriquecerDever(d);
      const feitas = e.atividades.filter(a => a.entrega?.status === "enviado").length;
      return { deverId: String(d._id), alunoId: String(d.alunoId?._id || d.alunoId), nome: d.alunoId?.nome || "", email: d.alunoId?.email || "", feitas, total: e.atividades.length, status: e.status };
    }));
    const ref = v => v && v._id ? { _id: v._id, titulo: v.titulo || v.nome } : v;
    res.json({
      loteId: req.params.loteId, curso: d0.curso, titulo: d0.titulo, descricao: d0.descricao || "", dataInicio: d0.dataInicio, dataLimite: d0.dataLimite,
      prioridade: d0.prioridade, permiteConclusaoManual: d0.permiteConclusaoManual,
      atividades: d0.atividades.map(a => {
        const c = a.conteudo || {};
        return { tipo: a.tipo, titulo: a.titulo, descricao: a.descricao || "", obrigatoria: a.obrigatoria, dependeDe: a.dependeDe,
          conteudo: { conjuntoId: ref(c.conjuntoId), temaId: ref(c.temaId), aulaId: ref(c.aulaId), moduloId: ref(c.moduloId), exercicioSlug: c.exercicioSlug, tache: c.tache, sujetId: c.sujetId, perfil: c.perfil, sorteio: c.sorteio, url: c.url, texto: c.texto } };
      }),
      alunos
    });
  } catch (err) { erroStatus(res, err); }
});

// Editar um dever enviado: vale para todos os alunos do lote. As entregas das atividades que
// continuam no dever são mantidas; alunos novos recebem uma cópia; os retirados perdem a cópia.
router.put("/lotes/:loteId", exigirProfessor, async (req, res) => {
  try {
    const b = req.body || {};
    const deveres = await DeverSemanal.find({ loteId: req.params.loteId });
    if (!deveres.length) return res.status(404).json({ msg: "Dever não encontrado." });
    if (!String(b.titulo || "").trim()) return res.status(400).json({ msg: "Dê um título ao dever." });
    if (!datasValidas(b.dataInicio, b.dataLimite)) return res.status(400).json({ msg: "Informe datas válidas (o prazo não pode ser antes do início)." });
    const curso = TIPOS_CURSO.includes(b.curso) ? b.curso : deveres[0].curso;
    const atividades = await criarDever.prepararAtividades(b.atividades, { curso, nivel: b.nivel, userId: req.userId });
    const campos = {
      titulo: String(b.titulo).trim().slice(0, 150), descricao: b.descricao ? String(b.descricao).slice(0, 4000) : undefined, curso,
      dataInicio: new Date(b.dataInicio), dataLimite: new Date(b.dataLimite),
      prioridade: ["baixa", "media", "alta"].includes(b.prioridade) ? b.prioridade : "media", permiteConclusaoManual: !!b.permiteConclusaoManual
    };
    const querAlunos = Array.isArray(b.alunoIds) ? new Set(b.alunoIds.filter(ehObjectId).map(String)) : null;
    let atualizados = 0, removidos = 0, novos = 0;
    for (const d of deveres) {
      if (querAlunos && !querAlunos.has(String(d.alunoId))) { await d.deleteOne(); removidos++; transmitir("dever-atualizado", { alunoId: String(d.alunoId) }); continue; }
      const antigas = new Map(d.atividades.map(a => [chaveAtividade(a), a]));
      Object.assign(d, campos);
      d.atividades = copiarAtividades(atividades).map(a => {
        const velha = antigas.get(chaveAtividade(a));
        return velha && velha.entrega ? { ...a, entrega: velha.entrega.toObject ? velha.entrega.toObject() : velha.entrega } : a;
      });
      await d.save(); atualizados++;
      transmitir("dever-atualizado", { alunoId: String(d.alunoId) });
    }
    if (querAlunos) {
      const ja = new Set(deveres.map(d => String(d.alunoId)));
      for (const id of querAlunos) {
        if (ja.has(id)) continue;
        const ultimo = await DeverSemanal.findOne({ alunoId: id }).sort({ numeroSemana: -1 }).select("numeroSemana").lean();
        await DeverSemanal.create({ alunoId: id, planoBaseId: null, numeroSemana: (ultimo?.numeroSemana || 0) + 1, loteId: deveres[0].loteId, professorId: req.userId, ...campos, atividades: copiarAtividades(atividades) });
        novos++; transmitir("dever-atualizado", { alunoId: id });
      }
    }
    res.json({ msg: `Dever atualizado: ${atualizados} aluno(s)${novos ? `, ${novos} novo(s)` : ""}${removidos ? `, ${removidos} retirado(s)` : ""}.`, atualizados, novos, removidos });
  } catch (err) { erroStatus(res, err); }
});

router.delete("/lotes/:loteId", exigirProfessor, async (req, res) => {
  try {
    const deveres = await DeverSemanal.find({ loteId: req.params.loteId }).select("alunoId").lean();
    await DeverSemanal.deleteMany({ loteId: req.params.loteId });
    deveres.forEach(d => transmitir("dever-atualizado", { alunoId: String(d.alunoId) }));
    res.json({ msg: `Dever apagado de ${deveres.length} aluno(s).` });
  } catch (err) { erroStatus(res, err); }
});

// Plano-Base pelo construtor: cada semana passa pela mesma preparação das atividades.
async function semanasDoConstrutor(semanas, curso, nivel, userId) {
  if (!Array.isArray(semanas) || !semanas.length) throw Object.assign(new Error("x"), { status: 400, msg: "Crie pelo menos uma semana." });
  if (semanas.length > 104) throw Object.assign(new Error("x"), { status: 400, msg: "No máximo 104 semanas." });
  const out = [];
  for (const [i, s] of semanas.entries()) {
    try {
      out.push({ numero: i + 1, titulo: String(s.titulo || `Semana ${i + 1}`).trim().slice(0, 150), atividades: (await criarDever.prepararAtividades(s.atividades, { curso, nivel, userId })).map(({ entrega, ...a }) => a) });
    } catch (err) { if (err.status) err.msg = `Semana ${i + 1}: ${err.msg}`; throw err; }
  }
  return out;
}
router.post("/criar/planos-base", exigirProfessor, async (req, res) => {
  try {
    const b = req.body || {};
    if (!String(b.nome || "").trim()) return res.status(400).json({ msg: "Dê um nome ao Plano-Base." });
    const curso = TIPOS_CURSO.includes(b.curso) ? b.curso : null;
    const semanas = await semanasDoConstrutor(b.semanas, curso, b.nivel, req.userId);
    const plano = await PlanoBase.create({ nome: String(b.nome).trim().slice(0, 150), curso, descricao: b.descricao ? String(b.descricao).slice(0, 4000) : undefined, semanas, criadoPor: req.userId });
    res.json({ msg: `Plano-Base criado com ${semanas.length} semana(s).`, plano });
  } catch (err) { erroStatus(res, err); }
});
router.put("/criar/planos-base/:id", exigirProfessor, async (req, res) => {
  try {
    const b = req.body || {};
    const plano = await PlanoBase.findById(req.params.id);
    if (!plano || !plano.ativo) return res.status(404).json({ msg: "Plano-Base não encontrado." });
    if (!String(b.nome || "").trim()) return res.status(400).json({ msg: "Dê um nome ao Plano-Base." });
    const curso = TIPOS_CURSO.includes(b.curso) ? b.curso : plano.curso;
    plano.semanas = await semanasDoConstrutor(b.semanas, curso, b.nivel, req.userId);
    plano.nome = String(b.nome).trim().slice(0, 150); plano.curso = curso; plano.descricao = b.descricao ? String(b.descricao).slice(0, 4000) : undefined;
    await plano.save();
    res.json({ msg: "Plano-Base atualizado. As próximas semanas geradas para os alunos já seguem a nova versão.", plano });
  } catch (err) { erroStatus(res, err); }
});

// ===================== ATRIBUIR DEVER (Gestão de Alunos › Atribuir Dever) =====================
// Os Planos-Base ativos de um aluno (manuais e da Atribuição-base) e as ações sobre eles.
router.get("/alunos/:alunoId/atribuicoes", exigirProfessor, async (req, res) => {
  try {
    const l = await AtribuicaoPlanoBase.find({ alunoId: req.params.alunoId, ativo: true }).populate("planoBaseId", "nome curso semanas.numero").sort({ criadoEm: -1 }).lean();
    res.json(l.map(a => ({ _id: a._id, origem: a.origem || "manual", curso: a.curso || a.planoBaseId?.curso || "", dataInicio: a.dataInicio, plano: a.planoBaseId ? { _id: a.planoBaseId._id, nome: a.planoBaseId.nome, semanas: (a.planoBaseId.semanas || []).length } : null })));
  } catch (err) { erroStatus(res, err); }
});
// Parar um Plano-Base de um aluno (as semanas já geradas continuam; não gera as próximas).
router.delete("/atribuicoes/:id", exigirProfessor, async (req, res) => {
  try {
    const a = await AtribuicaoPlanoBase.findByIdAndUpdate(req.params.id, { ativo: false });
    if (!a) return res.status(404).json({ msg: "Atribuição não encontrada." });
    res.json({ msg: "Plano-Base interrompido para este aluno." });
  } catch (err) { erroStatus(res, err); }
});
// Atribuir um modelo do construtor a um aluno: o Plano-Base inteiro (as semanas vão sendo
// liberadas uma por semana, a partir da data) ou só uma das semanas, como dever avulso.
router.post("/alunos/:alunoId/atribuir-modelo", exigirProfessor, async (req, res) => {
  try {
    const b = req.body || {};
    if (!ehObjectId(b.planoBaseId)) return res.status(400).json({ msg: "Escolha o Plano-Base." });
    const plano = await PlanoBase.findById(b.planoBaseId);
    if (!plano || !plano.ativo) return res.status(404).json({ msg: "Plano-Base não encontrado." });
    const aluno = await User.findById(req.params.alunoId).select("_id").lean();
    if (!aluno) return res.status(404).json({ msg: "Aluno não encontrado." });
    const inicio = b.dataInicio && !isNaN(new Date(b.dataInicio)) ? new Date(b.dataInicio) : new Date();
    if (b.modo === "semana") {
      const s = plano.semanas.find(x => x.numero === Number(b.semana));
      if (!s) return res.status(400).json({ msg: "Semana não encontrada neste Plano-Base." });
      const fim = b.dataLimite && !isNaN(new Date(b.dataLimite)) ? new Date(b.dataLimite) : new Date(inicio.getTime() + 6 * DIA);
      if (fim < inicio) return res.status(400).json({ msg: "O prazo não pode ser antes do início." });
      const ultimo = await DeverSemanal.findOne({ alunoId: aluno._id }).sort({ numeroSemana: -1 }).select("numeroSemana").lean();
      const d = await DeverSemanal.create({ alunoId: aluno._id, planoBaseId: null, numeroSemana: (ultimo?.numeroSemana || 0) + 1, curso: plano.curso || null,
        titulo: s.titulo, dataInicio: inicio, dataLimite: fim, professorId: req.userId, atividades: copiarAtividades(s.atividades) });
      transmitir("dever-atualizado", { alunoId: String(aluno._id) });
      return res.json({ msg: `« ${s.titulo} » atribuído.`, deverId: d._id });
    }
    await AtribuicaoPlanoBase.updateMany({ alunoId: aluno._id, planoBaseId: plano._id, ativo: true }, { ativo: false });
    const atr = await AtribuicaoPlanoBase.create({ alunoId: aluno._id, planoBaseId: plano._id, dataInicio: inicio, vinculoTipo: "plano_curso", curso: plano.curso || null, origem: "manual" });
    const criadas = await gerarSemanasPendentes(atr);
    transmitir("dever-atualizado", { alunoId: String(aluno._id) });
    res.json({ msg: `Plano-Base « ${plano.nome} » atribuído: ${criadas.length} semana(s) já liberada(s), as outras chegam uma por semana.`, semanasGeradas: criadas.length });
  } catch (err) { erroStatus(res, err); }
});
// Remover um dever atribuído a um aluno.
router.delete("/deveres/:id", exigirProfessor, async (req, res) => {
  try {
    const d = await DeverSemanal.findByIdAndDelete(req.params.id);
    if (!d) return res.status(404).json({ msg: "Dever não encontrado." });
    transmitir("dever-atualizado", { alunoId: String(d.alunoId) });
    res.json({ msg: "Dever removido do aluno." });
  } catch (err) { erroStatus(res, err); }
});

// Atribuição-base de cada curso.
router.get("/atribuicoes-base", exigirProfessor, async (req, res) => {
  try {
    const l = await AtribuicaoBaseCurso.find().populate("planoBaseId", "nome curso semanas.numero").lean();
    const contagem = await AtribuicaoPlanoBase.aggregate([{ $match: { origem: "base", ativo: true } }, { $group: { _id: "$curso", n: { $sum: 1 } } }]);
    const porCurso = Object.fromEntries(contagem.map(c => [c._id, c.n]));
    res.json(TIPOS_CURSO.map(curso => {
      const b = l.find(x => x.curso === curso);
      return { curso, plano: b && b.planoBaseId ? { _id: b.planoBaseId._id, nome: b.planoBaseId.nome, semanas: (b.planoBaseId.semanas || []).length } : null, alunos: porCurso[curso] || 0, atualizadoEm: b ? b.atualizadoEm : null };
    }));
  } catch (err) { erroStatus(res, err); }
});
router.put("/atribuicoes-base/:curso", exigirProfessor, async (req, res) => {
  try {
    const curso = req.params.curso;
    if (!TIPOS_CURSO.includes(curso)) return res.status(400).json({ msg: "Curso inválido." });
    if (!req.body?.planoBaseId) { await AtribuicaoBaseCurso.deleteOne({ curso }); return res.json({ msg: `O curso ${curso} ficou sem Atribuição-base.` }); }
    if (!ehObjectId(req.body.planoBaseId)) return res.status(400).json({ msg: "Plano-Base inválido." });
    const plano = await PlanoBase.findById(req.body.planoBaseId).select("nome ativo").lean();
    if (!plano || !plano.ativo) return res.status(404).json({ msg: "Plano-Base não encontrado." });
    await AtribuicaoBaseCurso.findOneAndUpdate({ curso }, { planoBaseId: plano._id, atualizadoPor: req.userId, atualizadoEm: new Date() }, { upsert: true });
    res.json({ msg: `Atribuição-base do ${curso}: « ${plano.nome} ». Quem entrar no plano ${curso} já recebe estes deveres.` });
  } catch (err) { erroStatus(res, err); }
});
// Aplicar já a Atribuição-base a quem tem o plano do curso hoje.
router.post("/atribuicoes-base/:curso/aplicar", exigirProfessor, async (req, res) => {
  try {
    const curso = req.params.curso;
    if (!TIPOS_CURSO.includes(curso)) return res.status(400).json({ msg: "Curso inválido." });
    const alunos = await User.find({ role: "aluno", "planos.courseType": curso }).select("_id planos role").lean();
    let n = 0;
    for (const u of alunos) {
      if (!cursosAtivos(u).includes(curso)) continue;
      if (await aplicarAtribuicoesBase(u._id)) { n++; await atualizarSemanasDoAluno(u._id); transmitir("dever-atualizado", { alunoId: String(u._id) }); }
    }
    res.json({ msg: n ? `Atribuição-base aplicada a ${n} aluno(s) do ${curso}.` : `Todos os alunos com plano ${curso} já tinham a Atribuição-base.`, aplicados: n });
  } catch (err) { erroStatus(res, err); }
});

// ===================== ALUNO: MINHAS SEMANAS =====================
router.get("/minhas-semanas", async (req, res) => {
  try {
    await atualizarSemanasDoAluno(req.userId);
    const deveres = await DeverSemanal.find({ alunoId: req.userId }).populate(POPULATE_CONTEUDO).sort({ numeroSemana: 1 });
    res.json(await Promise.all(deveres.map(enriquecerDever)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.get("/minhas-semanas/:id", async (req, res) => {
  try {
    const dever = await DeverSemanal.findOne({ _id: req.params.id, alunoId: req.userId }).populate(POPULATE_CONTEUDO);
    if (!dever) return res.status(404).json({ msg: "Dever não encontrado." });
    res.json(await enriquecerDever(dever));
  } catch (err) {
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// "assistir_aula"/"assistir_modulo" não têm envio manual — o progresso vem só
// do player embutido, direto na API real de aulas (ver public/js/aulaPlayerEmbed.js),
// pra nunca duplicar o dado que já mora em ProgressoAula.
// exercicio_interativo registra a entrega sozinho em POST /api/exercicios/:slug/corrigir.
// "producao_ambiente" é feita (e concluída) no Ambiente de Produção.
const TIPOS_SEM_ENVIO_MANUAL = ["assistir_aula", "assistir_modulo", "exercicio_interativo", "producao_ambiente"];

router.post("/minhas-semanas/:deverId/atividades/:index/enviar", comTratamentoDeErro(uploadEntregaDever.single("arquivo")), async (req, res) => {
  const limparTemp = () => { if (req.file) fs.unlink(req.file.path, () => {}); };
  try {
    const dever = await DeverSemanal.findOne({ _id: req.params.deverId, alunoId: req.userId });
    if (!dever) { limparTemp(); return res.status(404).json({ msg: "Dever não encontrado." }); }
    const atividade = dever.atividades[req.params.index];
    if (!atividade) { limparTemp(); return res.status(404).json({ msg: "Atividade não encontrada." }); }

    if (TIPOS_SEM_ENVIO_MANUAL.includes(atividade.tipo)) {
      limparTemp();
      return res.status(400).json({ msg: atividade.tipo === "exercicio_interativo" ? "Essa atividade é entregue pelo próprio exercício, ao clicar em Entregar." : "Essa atividade é concluída automaticamente ao assistir a aula — não precisa enviar nada aqui." });
    }

    const enriquecidoAntes = await enriquecerDever(dever);
    if (enriquecidoAntes.atividades[req.params.index].bloqueada) {
      limparTemp();
      return res.status(400).json({ msg: "Conclua a tarefa anterior desta semana antes desta." });
    }

    const { texto, duracaoSegundos } = req.body;
    if (!req.file && !texto?.trim()) return res.status(400).json({ msg: "Envie um arquivo ou um texto." });

    // Produção textual/oral não duplica o texto/arquivo no dever — cria uma Producao
    // de verdade (mesma fila de correção do Ambiente de Produção) e só guarda o vínculo.
    if (["producao_textual", "producao_oral"].includes(atividade.tipo)) {
      if (!atividade.conteudo?.temaId) { limparTemp(); return res.status(400).json({ msg: "Esta atividade não tem um tema de produção configurado." }); }
      const producao = await montarNovaProducao({
        userId: req.userId, temaId: atividade.conteudo.temaId, textoDigitado: texto,
        observacoesAluno: undefined, file: req.file, origemId: null, duracaoSegundos,
        pularChecagemAcesso: true
      });
      atividade.entrega.status = "enviado";
      atividade.entrega.enviadoEm = new Date();
      atividade.entrega.linkProducaoId = producao._id;
    } else {
      atividade.entrega.status = "enviado";
      atividade.entrega.enviadoEm = new Date();
      if (texto?.trim()) atividade.entrega.texto = texto.trim();
      if (req.file) {
        atividade.entrega.arquivo = {
          nome: req.file.originalname, caminho: req.file.path, tamanho: req.file.size,
          mimetype: req.file.mimetype, enviadoEm: new Date()
        };
      }
    }
    await dever.save();
    transmitir("dever-atualizado", { alunoId: req.userId });
    res.json(await enriquecerDever(dever));
  } catch (err) {
    limparTemp();
    if (err.status) return res.status(err.status).json({ msg: err.msg });
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// « Adiantar Dever »: a próxima semana de um Plano-Base, liberada antes da data.
router.get("/minhas-semanas-adiantaveis", async (req, res) => {
  try { res.json(await require("../utils/gerarDeveres").semanasAdiantaveis(req.userId)); }
  catch (err) { console.error(err); res.status(500).json({ msg: "Erro no servidor." }); }
});
router.post("/minhas-semanas/adiantar", async (req, res) => {
  try {
    if (!ehObjectId(req.body?.atribuicaoId)) return res.status(400).json({ msg: "Plano inválido." });
    const d = await require("../utils/gerarDeveres").adiantarSemana(req.userId, req.body.atribuicaoId);
    transmitir("dever-atualizado", { alunoId: req.userId });
    res.json({ msg: `« ${d.titulo} » liberado. Bom trabalho!`, deverId: String(d._id) });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ msg: err.msg });
    console.error(err); res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.post("/minhas-semanas/:id/concluir", async (req, res) => {
  try {
    const dever = await DeverSemanal.findOne({ _id: req.params.id, alunoId: req.userId }).populate(POPULATE_CONTEUDO);
    if (!dever) return res.status(404).json({ msg: "Dever não encontrado." });

    const enriquecido = await enriquecerDever(dever);
    if (!enriquecido.podeConcluir) {
      return res.status(400).json({ msg: "Ainda há atividades obrigatórias pendentes." });
    }
    dever.concluidoEm = new Date();
    await dever.save();
    transmitir("dever-atualizado", { alunoId: req.userId });
    res.json(await enriquecerDever(dever));
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// Download autenticado do arquivo enviado pelo aluno (segue o mesmo padrão de
// GET /api/producoes/:id/arquivo/:tipo)
router.get("/deveres/:id/atividades/:index/arquivo", async (req, res) => {
  try {
    const dever = await DeverSemanal.findById(req.params.id);
    if (!dever) return res.status(404).json({ msg: "Dever não encontrado." });
    if (String(dever.alunoId) !== req.userId && req.userRole !== "admin" && req.userRole !== "professor") {
      return res.status(403).json({ msg: "Acesso negado." });
    }
    const arquivo = dever.atividades[req.params.index]?.entrega?.arquivo;
    if (!arquivo?.caminho) return res.status(404).json({ msg: "Arquivo não encontrado." });
    res.download(arquivo.caminho, arquivo.nome);
  } catch (err) {
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

module.exports = router;
