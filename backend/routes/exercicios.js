const express = require("express");
const router = express.Router();
const DeverSemanal = require("../models/deverSemanal");
const { exigirAuth } = require("../middleware/auth");
const { ehObjectId } = require("../middleware/seguranca");
const { transmitir } = require("../utils/sse");
const { enriquecerDever } = require("../utils/gerarDeveres");
const ex = require("../utils/exercicios");

router.use(exigirAuth);

const slugValido = s => typeof s === "string" && /^[a-z0-9-]{2,60}$/.test(s);

// Catálogo — usado no editor de Plano-Base/dever para escolher o exercício.
router.get("/", (req, res) => res.json(ex.listar()));

router.get("/:slug", (req, res) => {
  const def = slugValido(req.params.slug) && ex.obter(req.params.slug);
  if (!def) return res.status(404).json({ msg: "Exercício não encontrado." });
  res.json(ex.versaoPublica(def));
});

// Corrige. Com `secao`, corrige só aquela aba (treino, não registra nada).
// Com `deverId` + `atividadeIndex`, registra a entrega da atividade do dever
// (só se a atividade for deste aluno e apontar para este mesmo exercício).
router.post("/:slug/corrigir", async (req, res) => {
  try {
    const def = slugValido(req.params.slug) && ex.obter(req.params.slug);
    if (!def) return res.status(404).json({ msg: "Exercício não encontrado." });

    const respostas = req.body?.respostas && typeof req.body.respostas === "object" ? req.body.respostas : {};
    const secao = typeof req.body?.secao === "string" ? req.body.secao : null;
    const resultado = ex.corrigir(def, respostas, secao);
    if (secao) return res.json({ resultado });

    // Regulamento: o aceite só vale com todas as regras confirmadas.
    const secReg = def.secoes.find(s => s.tipo === "regulamento");
    let extra = null;
    if (secReg) {
      const confirmadas = Array.isArray(req.body?.confirmacoes) ? req.body.confirmacoes.filter(i => Number.isInteger(i)) : [];
      const todas = secReg.regras.every((_, i) => confirmadas.includes(i));
      if (!todas) return res.status(400).json({ msg: "Confirme a leitura de todas as regras antes de enviar." });
      extra = `Regulamento lido e aceito: ${secReg.regras.length}/${secReg.regras.length} regras confirmadas em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}.`;
    }

    const { deverId, atividadeIndex } = req.body || {};
    let dever = null;
    if (deverId != null && atividadeIndex != null) {
      if (!ehObjectId(deverId) || !Number.isInteger(atividadeIndex) || atividadeIndex < 0 || atividadeIndex > 200) {
        return res.status(400).json({ msg: "Dever inválido." });
      }
      const doc = await DeverSemanal.findOne({ _id: deverId, alunoId: req.userId });
      const atividade = doc?.atividades?.[atividadeIndex];
      if (!atividade || atividade.tipo !== "exercicio_interativo" || atividade.conteudo?.exercicioSlug !== def.slug) {
        return res.status(404).json({ msg: "Atividade do dever não encontrada." });
      }
      const antes = await enriquecerDever(doc);
      if (antes.atividades[atividadeIndex].bloqueada) {
        return res.status(400).json({ msg: "Conclua a tarefa anterior desta semana antes desta." });
      }
      atividade.entrega.status = "enviado";
      atividade.entrega.enviadoEm = new Date();
      atividade.entrega.texto = ex.resumoEntrega(def, resultado, extra).slice(0, 20000);
      await doc.save();
      transmitir("dever-atualizado", { alunoId: req.userId });
      dever = await enriquecerDever(doc);
    }
    res.json({ resultado, registrado: !!dever, dever });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

module.exports = router;
