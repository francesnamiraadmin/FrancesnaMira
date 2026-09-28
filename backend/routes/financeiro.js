const express = require("express");
const router = express.Router();
const User = require("../models/user");
const Pedido = require("../models/pedido");
const PagamentoMatricula = require("../models/pagamentoMatricula");
require("../models/matricula"); // registrado para o populate de matriculaId
const { exigirAuth, exigirAdmin } = require("../middleware/auth");

router.use(exigirAuth, exigirAdmin);

// Pendência mais velha que isto quase certamente expirou (Pix vence em 24h, boleto em
// ~3 dias úteis) — o Mercado Pago nem sempre avisa por webhook, então o status fica
// "pendente" para sempre. Separado do "a receber" para não inflar a previsão.
const PENDENCIA_ANTIGA_MS = 7 * 24 * 60 * 60 * 1000;

// Cada fluxo grava o curso de um jeito ("TCF", "TCF – Canadá", "Francês A1"...). Para os
// rankings não dividirem o mesmo curso em dois, reduz ao código quando há exatamente um
// na descrição; nomes com vários (ex.: "Do A1 ao B2") ficam como vieram.
const CODIGOS_CURSO = ["TCF", "DELF", "DALF", "TEF", "A1", "A2", "B1", "B2"];
function normalizarCurso(nome) {
  if (!nome) return "—";
  const achados = CODIGOS_CURSO.filter(c => new RegExp(`(^|[^A-Z0-9])${c}([^A-Z0-9]|$)`).test(String(nome).toUpperCase()));
  return achados.length === 1 ? achados[0] : String(nome);
}

// ===================== TRANSAÇÕES (balanço financeiro) =====================
// Junta as duas fontes de compra num formato único — Pedido (planos Essentiel/Avancé/
// Excellence e Pack Prestige) e PagamentoMatricula (matrículas em turma/particular) —
// e devolve também os cadastros de alunos. Toda a análise temporal (dia/semana/mês/ano,
// horários, rankings) é feita no navegador em public/js/admin-financeiro.js: o volume é
// pequeno e assim o admin troca filtros sem nova ida ao servidor.
router.get("/transacoes", async (req, res) => {
  try {
    const [pedidos, pagamentosMatricula, alunos] = await Promise.all([
      Pedido.find({}).populate("userId", "nome email").sort({ criadoEm: -1 }).lean(),
      PagamentoMatricula.find({})
        .populate("alunoId", "nome email")
        .populate("matriculaId", "tipo curso cupomCodigo desconto precoOriginal dadosPessoais")
        .sort({ criadoEm: -1 }).lean(),
      User.find({ role: "aluno" }).select("criadoEm").lean()
    ]);

    const agora = Date.now();
    const normalizar = (t) => {
      const antiga = t.status === "pendente" && agora - new Date(t.data).getTime() > PENDENCIA_ANTIGA_MS;
      return { ...t, pendenciaAntiga: antiga };
    };

    const deplanos = pedidos.map(p => normalizar({
      id: String(p._id),
      origem: "plano",
      data: p.criadoEm,
      aluno: {
        id: p.userId?._id ? String(p.userId._id) : null,
        nome: p.userId?.nome || p.dadosPessoais?.nome || p.email || "—",
        email: p.userId?.email || p.email || ""
      },
      curso: normalizarCurso(p.curso),
      produto: p.plano || "—",
      tipoAula: p.tipo || null,
      valor: p.valor || 0,
      metodo: p.metodoPagamento,
      parcelas: p.parcelas || 1,
      status: p.status,
      cupom: null,
      desconto: 0,
      mercadoPagoId: p.mercadoPagoId || null
    }));

    const dematriculas = pagamentosMatricula.map(p => {
      const m = p.matriculaId || {};
      const tipo = m.tipo || null;
      return normalizar({
        id: String(p._id),
        origem: "matricula",
        data: p.criadoEm,
        aluno: {
          id: p.alunoId?._id ? String(p.alunoId._id) : null,
          nome: p.alunoId?.nome || m.dadosPessoais?.nome || "—",
          email: p.alunoId?.email || m.dadosPessoais?.email || ""
        },
        curso: normalizarCurso(m.curso || m.dadosPessoais?.prova),
        produto: tipo === "turma" ? "Matrícula em turma" : tipo === "particular" ? "Aulas particulares" : "Matrícula",
        tipoAula: tipo,
        valor: p.valor || 0,
        metodo: p.metodoPagamento,
        parcelas: p.parcelas || 1,
        status: p.status,
        cupom: m.cupomCodigo || null,
        desconto: m.desconto || 0,
        mercadoPagoId: p.mercadoPagoId || null
      });
    });

    const transacoes = [...deplanos, ...dematriculas]
      .sort((a, b) => new Date(b.data) - new Date(a.data));

    res.json({
      geradoEm: new Date(),
      transacoes,
      cadastros: alunos.map(a => a.criadoEm).filter(Boolean)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

module.exports = router;
