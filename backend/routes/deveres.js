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
for (const nome of ["id", "deverId", "alunoId"]) {
  router.param(nome, (req, res, next, valor) => (ehObjectId(valor) ? next() : res.status(400).json({ msg: "Identificador inválido." })));
}
router.param("index", (req, res, next, valor) => (/^\d{1,3}$/.test(valor) ? next() : res.status(400).json({ msg: "Índice inválido." })));

// Preenche as referências dentro de atividades.conteudo (tema/aula/módulo) com
// um título legível em vez do ObjectId cru, pro aluno/admin verem o nome real.
const POPULATE_CONTEUDO = [
  { path: "atividades.conteudo.temaId", select: "titulo" },
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

    await AtribuicaoPlanoBase.updateMany({ alunoId, ativo: true }, { ativo: false });
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
const TIPOS_SEM_ENVIO_MANUAL = ["assistir_aula", "assistir_modulo", "exercicio_interativo"];

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
