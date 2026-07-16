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

router.use(exigirAuth);

// Preenche as referências dentro de atividades.conteudo (tema/aula/módulo) com
// um título legível em vez do ObjectId cru, pro aluno/admin verem o nome real.
const POPULATE_CONTEUDO = [
  { path: "atividades.conteudo.temaId", select: "titulo" },
  { path: "atividades.conteudo.aulaId", select: "titulo" },
  { path: "atividades.conteudo.moduloId", select: "titulo" }
];

// ===================== ADMIN/PROFESSOR: PLANOS-BASE (templates) =====================
router.get("/planos-base", exigirProfessor, async (req, res) => {
  try {
    const planos = await PlanoBase.find({ ativo: true }).select("nome curso descricao semanas.numero criadoEm").sort({ nome: 1 });
    res.json(planos.map(p => ({ _id: p._id, nome: p.nome, curso: p.curso, descricao: p.descricao, totalSemanas: p.semanas.length, criadoEm: p.criadoEm })));
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
    res.json(enriquecerDever(dever));
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.put("/deveres/:id", exigirProfessor, async (req, res) => {
  try {
    const { titulo, descricao, dataInicio, dataLimite, prioridade, professorId, observacoes, permiteConclusaoManual, atividades } = req.body;
    const dever = await DeverSemanal.findById(req.params.id);
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
    res.json(enriquecerDever(dever));
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// Comentário do professor numa entrega específica (sem mexer no restante do dever)
router.put("/deveres/:id/atividades/:index/comentario", exigirProfessor, async (req, res) => {
  try {
    const { comentario } = req.body;
    const dever = await DeverSemanal.findById(req.params.id);
    if (!dever) return res.status(404).json({ msg: "Dever não encontrado." });
    const atividade = dever.atividades[req.params.index];
    if (!atividade) return res.status(404).json({ msg: "Atividade não encontrada." });
    atividade.entrega.comentarioProfessor = comentario || "";
    await dever.save();
    res.json(enriquecerDever(dever));
  } catch (err) {
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// ===================== ADMIN/PROFESSOR: LISTAGEM DE UM ALUNO =====================
router.get("/alunos/:alunoId/deveres", exigirProfessor, async (req, res) => {
  try {
    await atualizarSemanasDoAluno(req.params.alunoId);
    const deveres = await DeverSemanal.find({ alunoId: req.params.alunoId }).populate(POPULATE_CONTEUDO).sort({ numeroSemana: 1 });
    res.json(deveres.map(enriquecerDever));
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

// ===================== ALUNO: MINHAS SEMANAS =====================
router.get("/minhas-semanas", async (req, res) => {
  try {
    await atualizarSemanasDoAluno(req.userId);
    const deveres = await DeverSemanal.find({ alunoId: req.userId }).populate(POPULATE_CONTEUDO).sort({ numeroSemana: 1 });
    res.json(deveres.map(enriquecerDever));
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.get("/minhas-semanas/:id", async (req, res) => {
  try {
    const dever = await DeverSemanal.findOne({ _id: req.params.id, alunoId: req.userId }).populate(POPULATE_CONTEUDO);
    if (!dever) return res.status(404).json({ msg: "Dever não encontrado." });
    res.json(enriquecerDever(dever));
  } catch (err) {
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.post("/minhas-semanas/:deverId/atividades/:index/enviar", comTratamentoDeErro(uploadEntregaDever.single("arquivo")), async (req, res) => {
  const limparTemp = () => { if (req.file) fs.unlink(req.file.path, () => {}); };
  try {
    const dever = await DeverSemanal.findOne({ _id: req.params.deverId, alunoId: req.userId });
    if (!dever) { limparTemp(); return res.status(404).json({ msg: "Dever não encontrado." }); }
    const atividade = dever.atividades[req.params.index];
    if (!atividade) { limparTemp(); return res.status(404).json({ msg: "Atividade não encontrada." }); }

    const { texto } = req.body;
    if (!req.file && !texto?.trim()) return res.status(400).json({ msg: "Envie um arquivo ou um texto." });

    atividade.entrega.status = "enviado";
    atividade.entrega.enviadoEm = new Date();
    if (texto?.trim()) atividade.entrega.texto = texto.trim();
    if (req.file) {
      atividade.entrega.arquivo = {
        nome: req.file.originalname, caminho: req.file.path, tamanho: req.file.size,
        mimetype: req.file.mimetype, enviadoEm: new Date()
      };
    }
    await dever.save();
    res.json(enriquecerDever(dever));
  } catch (err) {
    limparTemp();
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.post("/minhas-semanas/:id/concluir", async (req, res) => {
  try {
    const dever = await DeverSemanal.findOne({ _id: req.params.id, alunoId: req.userId });
    if (!dever) return res.status(404).json({ msg: "Dever não encontrado." });

    const { podeConcluir } = require("../utils/gerarDeveres");
    if (!podeConcluir(dever)) {
      return res.status(400).json({ msg: "Ainda há atividades obrigatórias pendentes." });
    }
    dever.concluidoEm = new Date();
    await dever.save();
    res.json(enriquecerDever(dever));
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
