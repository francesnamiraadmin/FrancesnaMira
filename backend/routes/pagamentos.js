const express = require("express");
const router = express.Router();
const { MercadoPagoConfig, Payment } = require("mercadopago");
const Pedido = require("../models/pedido");
const User = require("../models/user");
const Turma = require("../models/turma");
const Matricula = require("../models/matricula");
const { exigirAuth } = require("../middleware/auth");

const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
const payment = new Payment(client);

const CREDITOS_CORRECAO_POR_TIER = { Essentiel: 2, "Avancé": 5, Excellence: 10 };

async function ativarPlano(userId, curso, plano, metodoPagamento, cartaoFinal, turmaId) {
  if (!userId) return;
  const dataInicio = new Date();
  const dataVencimento = new Date(dataInicio.getTime() + 30 * 24 * 60 * 60 * 1000);
  const creditosGanhos = CREDITOS_CORRECAO_POR_TIER[plano] || 0;
  await User.findByIdAndUpdate(userId, {
    plano: {
      curso, tier: plano, ativo: true,
      metodoPagamento, cartaoFinal,
      autoRenovacao: false,
      dataInicio, dataVencimento
    },
    $inc: { creditosCorrecao: creditosGanhos }
  });

  if (turmaId) {
    try {
      const turma = await Turma.findById(turmaId);
      const user = await User.findById(userId).select("nome email");
      if (turma && user) {
        const jaMatriculado = await Matricula.findOne({ turmaId, alunoId: userId, status: { $in: ["pendente_pagamento", "confirmada"] } });
        const ocupadas = await Matricula.countDocuments({ turmaId, status: { $in: ["pendente_pagamento", "confirmada"] } });
        if (!jaMatriculado && ocupadas < turma.maxAlunos) {
          await Matricula.create({
            alunoId: userId, tipo: "turma", turmaId, professorId: turma.professorId,
            dadosPessoais: { nome: user.nome, email: user.email, telefone: "" },
            precoOriginal: 0, desconto: 0, precoFinal: 0, status: "confirmada"
          });
        }
      }
    } catch (err) {
      console.error("Erro ao vincular turma ao plano:", err.message);
    }
  }
}

// Config pública para o front-end inicializar o SDK do Mercado Pago
router.get("/config", (req, res) => {
  res.json({ publicKey: process.env.MP_PUBLIC_KEY });
});

// CARTÃO (débito ou crédito) — recebe o token já gerado no navegador pelo SDK do MP
router.post("/cartao", exigirAuth, async (req, res) => {
  try {
    const { token, paymentMethodId, installments, curso, plano, valor, email, cpf, tipo, turmaId } = req.body;

    if (!token || !paymentMethodId || !curso || !plano || !valor || !email || !cpf) {
      return res.status(400).json({ msg: "Preencha todos os campos" });
    }

    const resultado = await payment.create({
      body: {
        transaction_amount: Number(valor),
        token,
        description: `${curso} - Plano ${plano}`,
        installments: Number(installments) || 1,
        payment_method_id: paymentMethodId,
        payer: {
          email,
          identification: { type: "CPF", number: cpf }
        }
      }
    });

    const aprovado = resultado.status === "approved";
    const metodoPagamento = tipo === "debito" ? "cartao_debito" : "cartao_credito";
    const cartaoFinal = resultado.card?.last_four_digits;

    const pedido = await Pedido.create({
      userId: req.userId,
      turmaId: turmaId || undefined,
      curso, plano, valor, email,
      metodoPagamento, cartaoFinal,
      status: aprovado ? "aprovado" : "rejeitado",
      mercadoPagoId: resultado.id
    });

    if (aprovado) await ativarPlano(req.userId, curso, plano, metodoPagamento, cartaoFinal, turmaId);

    res.json({ status: resultado.status, statusDetail: resultado.status_detail, pedidoId: pedido._id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro ao processar pagamento", detalhe: err.message });
  }
});

// PIX — gera QR Code real
router.post("/pix", exigirAuth, async (req, res) => {
  try {
    const { curso, plano, valor, email, cpf, turmaId } = req.body;

    if (!curso || !plano || !valor || !email || !cpf) {
      return res.status(400).json({ msg: "Preencha todos os campos" });
    }

    const resultado = await payment.create({
      body: {
        transaction_amount: Number(valor),
        description: `${curso} - Plano ${plano}`,
        payment_method_id: "pix",
        payer: {
          email,
          identification: { type: "CPF", number: cpf }
        }
      }
    });

    await Pedido.create({
      userId: req.userId,
      turmaId: turmaId || undefined,
      curso, plano, valor, email,
      metodoPagamento: "pix",
      status: "pendente",
      mercadoPagoId: resultado.id
    });

    const txData = resultado.point_of_interaction?.transaction_data;
    res.json({
      pedidoId: resultado.id,
      qrCodeBase64: txData?.qr_code_base64,
      copiaECola: txData?.qr_code
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro ao gerar Pix", detalhe: err.message });
  }
});

// BOLETO
router.post("/boleto", exigirAuth, async (req, res) => {
  try {
    const { curso, plano, valor, email, cpf, nome, turmaId, cep, rua, numero, bairro, cidade, estado } = req.body;

    if (!curso || !plano || !valor || !email || !cpf || !nome || !cep || !rua || !numero || !bairro || !cidade || !estado) {
      return res.status(400).json({ msg: "Preencha todos os campos, incluindo o endereço (exigido pelo Mercado Pago para gerar o boleto)." });
    }

    const [firstName, ...rest] = nome.trim().split(" ");
    const lastName = rest.join(" ") || firstName;

    const resultado = await payment.create({
      body: {
        transaction_amount: Number(valor),
        description: `${curso} - Plano ${plano}`,
        payment_method_id: "bolbradesco",
        payer: {
          email,
          first_name: firstName,
          last_name: lastName,
          identification: { type: "CPF", number: cpf },
          address: {
            zip_code: cep.replace(/\D/g, ""),
            street_name: rua,
            street_number: numero,
            neighborhood: bairro,
            city: cidade,
            federal_unit: estado
          }
        }
      }
    });

    await Pedido.create({
      userId: req.userId,
      turmaId: turmaId || undefined,
      curso, plano, valor, email,
      metodoPagamento: "boleto",
      status: "pendente",
      mercadoPagoId: resultado.id
    });

    res.json({
      pedidoId: resultado.id,
      boletoUrl: resultado.transaction_details?.external_resource_url
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro ao gerar boleto", detalhe: err.message });
  }
});

// CONSULTAR STATUS (polling de apoio para Pix/Boleto) — usa o mercadoPagoId retornado como "pedidoId"
router.get("/status/:mercadoPagoId", exigirAuth, async (req, res) => {
  try {
    const pedido = await Pedido.findOne({ mercadoPagoId: req.params.mercadoPagoId, userId: req.userId });
    if (!pedido) return res.status(404).json({ msg: "Pedido não encontrado." });
    res.json({ status: pedido.status });
  } catch (err) {
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// WEBHOOK — Mercado Pago avisa aqui quando o status do pagamento muda (confirma Pix/Boleto)
router.post("/webhook", async (req, res) => {
  try {
    const { type, data } = req.body;

    if (type === "payment" && data?.id) {
      const info = await payment.get({ id: data.id });
      const novoStatus = info.status === "approved" ? "aprovado" : info.status === "rejected" ? "rejeitado" : "pendente";

      const pedido = await Pedido.findOneAndUpdate(
        { mercadoPagoId: String(data.id) },
        { status: novoStatus },
        { new: true }
      );

      if (pedido && novoStatus === "aprovado") {
        await ativarPlano(pedido.userId, pedido.curso, pedido.plano, pedido.metodoPagamento, pedido.cartaoFinal, pedido.turmaId);
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("Erro no webhook:", err.message);
    res.sendStatus(200); // sempre 200 para o MP não ficar reenviando
  }
});

module.exports = router;
