const express = require("express");
const router = express.Router();
const User = require("../models/user");
const Producao = require("../models/producao");
const { exigirAuth, exigirProfessor } = require("../middleware/auth");

router.use(exigirAuth, exigirProfessor);

// ===================== LISTAR ALUNOS (roster) =====================
router.get("/alunos", async (req, res) => {
  try {
    const { busca } = req.query;
    const filtro = { role: "aluno" };
    if (busca) {
      filtro.$or = [
        { nome: { $regex: busca, $options: "i" } },
        { email: { $regex: busca, $options: "i" } }
      ];
    }
    const alunos = await User.find(filtro)
      .select("nome email plano creditosCorrecao perfil.provaAlvo perfil.dataProva criadoEm")
      .sort({ nome: 1 });

    // Conta rápida de produções por aluno para exibir na lista
    const contagens = await Producao.aggregate([
      { $group: { _id: "$alunoId", total: { $sum: 1 } } }
    ]);
    const mapaContagem = {};
    contagens.forEach(c => { mapaContagem[c._id.toString()] = c.total; });

    res.json(alunos.map(a => ({
      _id: a._id, nome: a.nome, email: a.email, plano: a.plano, creditosCorrecao: a.creditosCorrecao,
      provaAlvo: a.perfil?.provaAlvo, dataProva: a.perfil?.dataProva, criadoEm: a.criadoEm,
      totalProducoes: mapaContagem[a._id.toString()] || 0
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// ===================== DETALHE DE UM ALUNO =====================
router.get("/alunos/:id", async (req, res) => {
  try {
    const aluno = await User.findOne({ _id: req.params.id, role: "aluno" })
      .select("nome email plano perfil creditosCorrecao criadoEm");
    if (!aluno) return res.status(404).json({ msg: "Aluno não encontrado." });

    const producoes = await Producao.find({ alunoId: aluno._id })
      .populate("temaId", "titulo exame nivel")
      .populate("professorId", "nome")
      .sort({ criadoEm: -1 });

    const corrigidas = producoes.filter(p => p.avaliacao?.notaTotal !== undefined);
    const evolucaoNotas = corrigidas
      .filter(p => p.dataCorrecao)
      .sort((a, b) => new Date(a.dataCorrecao) - new Date(b.dataCorrecao))
      .map(p => ({ data: p.dataCorrecao, nota: p.avaliacao.notaTotal, tema: p.temaId?.titulo }));

    const mediaPorCriterio = {};
    corrigidas.forEach(p => {
      (p.avaliacao.criterios || []).forEach(c => {
        if (!mediaPorCriterio[c.nome]) mediaPorCriterio[c.nome] = { soma: 0, n: 0 };
        mediaPorCriterio[c.nome].soma += c.nota;
        mediaPorCriterio[c.nome].n += 1;
      });
    });
    const porCriterio = Object.entries(mediaPorCriterio).map(([nome, v]) => ({
      nome, media: Math.round((v.soma / v.n) * 10) / 10
    }));

    const porStatus = {};
    producoes.forEach(p => { porStatus[p.status] = (porStatus[p.status] || 0) + 1; });

    const notaMedia = corrigidas.length
      ? Math.round((corrigidas.reduce((acc, p) => acc + p.avaliacao.notaTotal, 0) / corrigidas.length) * 10) / 10
      : null;

    res.json({
      aluno,
      producoes,
      estatisticas: { total: producoes.length, porStatus, notaMedia, evolucaoNotas, porCriterio }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

module.exports = router;
