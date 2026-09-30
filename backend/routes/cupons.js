const express = require("express");
const router = express.Router();
const Cupom = require("../models/cupom");
const Pedido = require("../models/pedido");
const { exigirAuth, exigirAdmin } = require("../middleware/auth");
const { normalizarCodigo } = require("../utils/cupons");
const { TIPOS_CURSO } = require("../utils/tiposCurso");

router.use(exigirAuth, exigirAdmin);

const CURSOS_VALIDOS = [...TIPOS_CURSO, "A1-B2"];
const PLANOS_VALIDOS = ["Essentiel", "Avancé", "Excellence", "Pack Prestige"];

// "2026-10-31" (campo de data do painel) vale até o fim desse dia no horário de Brasília.
function fimDoDia(v) {
  if (!v) return null;
  const s = String(v);
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + "T23:59:59-03:00") : new Date(s);
  return isNaN(d) ? undefined : d;
}

function lerCupom(body, parcial) {
  const dados = {};
  if (!parcial || body.codigo !== undefined) {
    dados.codigo = normalizarCodigo(body.codigo);
    if (dados.codigo.length < 3) throw new Error("O código precisa ter ao menos 3 letras ou números.");
  }
  if (!parcial || body.tipo !== undefined) {
    if (!["percentual", "valor_fixo"].includes(body.tipo)) throw new Error("Tipo de desconto inválido.");
    dados.tipo = body.tipo;
  }
  if (!parcial || body.valor !== undefined) {
    const valor = Number(body.valor);
    const tipo = dados.tipo || body.tipo;
    if (!(valor > 0)) throw new Error("Informe um valor de desconto maior que zero.");
    if (tipo === "percentual" && valor > 100) throw new Error("O desconto percentual vai de 1% a 100%.");
    dados.valor = Math.round(valor * 100) / 100;
  }
  if (body.validoAte !== undefined) {
    const d = fimDoDia(body.validoAte);
    if (d === undefined) throw new Error("Data de validade inválida.");
    dados.validoAte = d;
  }
  if (body.usoMaximo !== undefined) {
    const u = body.usoMaximo === null || body.usoMaximo === "" ? null : Number(body.usoMaximo);
    if (u !== null && !(Number.isInteger(u) && u > 0)) throw new Error("O limite de usos deve ser um número inteiro positivo.");
    dados.usoMaximo = u;
  }
  if (body.cursos !== undefined) dados.cursos = (Array.isArray(body.cursos) ? body.cursos : []).filter(c => CURSOS_VALIDOS.includes(c));
  if (body.planos !== undefined) dados.planos = (Array.isArray(body.planos) ? body.planos : []).filter(p => PLANOS_VALIDOS.includes(p));
  if (body.descricao !== undefined) dados.descricao = String(body.descricao || "").slice(0, 200);
  if (body.ativo !== undefined) dados.ativo = !!body.ativo;
  return dados;
}

// Lista com estatísticas de uso real (pagamentos aprovados com o cupom).
router.get("/", async (req, res) => {
  try {
    const cupons = await Cupom.find().sort({ criadoEm: -1 }).lean();
    const stats = await Pedido.aggregate([
      { $match: { cupomCodigo: { $ne: null }, status: "aprovado" } },
      { $group: { _id: "$cupomCodigo", pedidos: { $sum: 1 }, descontoTotal: { $sum: "$desconto" }, receita: { $sum: "$valor" } } }
    ]);
    const porCodigo = Object.fromEntries(stats.map(s => [s._id, s]));
    res.json(cupons.map(c => ({ ...c, estatisticas: porCodigo[c.codigo] || { pedidos: 0, descontoTotal: 0, receita: 0 } })));
  } catch (err) {
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.post("/", async (req, res) => {
  try {
    const dados = lerCupom(req.body, false);
    const cupom = await Cupom.create({ ...dados, criadoPor: req.userId });
    res.json(cupom);
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ msg: "Já existe um cupom com esse código." });
    res.status(400).json({ msg: err.message });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const dados = lerCupom(req.body, true);
    const cupom = await Cupom.findByIdAndUpdate(req.params.id, dados, { new: true, runValidators: true });
    if (!cupom) return res.status(404).json({ msg: "Cupom não encontrado." });
    res.json(cupom);
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ msg: "Já existe um cupom com esse código." });
    res.status(400).json({ msg: err.name === "CastError" ? "Cupom não encontrado." : err.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    await Cupom.findByIdAndUpdate(req.params.id, { ativo: false });
    res.json({ msg: "Cupom desativado." });
  } catch (err) {
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

module.exports = router;
