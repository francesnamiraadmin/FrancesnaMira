const express = require("express");
const router = express.Router();
const { MercadoPagoConfig, Payment } = require("mercadopago");
const Matricula = require("../models/matricula");
const PagamentoMatricula = require("../models/pagamentoMatricula");
const Disponibilidade = require("../models/disponibilidade");
const { exigirAuth } = require("../middleware/auth");
const { transmitir } = require("../utils/sse");
const { enviarEmailMatriculaConfirmada, enviarEmailPagamentoRejeitado } = require("../utils/mailer");

const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
const payment = new Payment(client);

async function confirmarMatricula(pagamento) {
  const matricula = await Matricula.findById(pagamento.matriculaId);
  if (!matricula || matricula.status === "confirmada") return;

  matricula.status = "confirmada";
  matricula.expiraEm = null;
  await matricula.save();

  if (matricula.tipo === "particular" && matricula.horarios?.length) {
    await Disponibilidade.updateMany({ _id: { $in: matricula.horarios } }, { holdExpiraEm: null });
    transmitir("disponibilidade-atualizada", { ids: matricula.horarios });
  }

  const detalhes = matricula.tipo === "turma"
    ? `Sua vaga na turma foi confirmada. Valor pago: R$ ${pagamento.valor.toFixed(2)}.`
    : `Pacote: ${matricula.pacote?.nome} (${matricula.pacote?.horas}h). Valor pago: R$ ${pagamento.valor.toFixed(2)}.`;

  try {
    await enviarEmailMatriculaConfirmada(matricula.dadosPessoais.email, matricula.dadosPessoais.nome, detalhes);
  } catch (e) {
    console.error("Falha ao enviar e-mail de confirmação:", e.message);
  }
}

async function rejeitarMatricula(pagamento) {
  const matricula = await Matricula.findById(pagamento.matriculaId);
  if (!matricula) return;
  try {
    await enviarEmailPagamentoRejeitado(matricula.dadosPessoais.email, matricula.dadosPessoais.nome);
  } catch (e) {
    console.error("Falha ao enviar e-mail de rejeição:", e.message);
  }
}

function podePagar(matricula, userId) {
  if (matricula.alunoId.toString() !== userId) return "Acesso negado.";
  if (matricula.status !== "pendente_pagamento") return "Esta matrícula não está aguardando pagamento.";
  if (matricula.expiraEm && matricula.expiraEm < new Date()) return "O tempo para concluir esta matrícula expirou. Reinicie o processo.";
  return null;
}

// ===================== CARTÃO (crédito ou débito) =====================
router.post("/cartao", exigirAuth, async (req, res) => {
  try {
    const { matriculaId, token, paymentMethodId, installments, cpf, tipo } = req.body;
    if (!matriculaId || !token || !paymentMethodId || !cpf) return res.status(400).json({ msg: "Dados incompletos." });

    const matricula = await Matricula.findById(matriculaId);
    if (!matricula) return res.status(404).json({ msg: "Matrícula não encontrada." });
    const erro = podePagar(matricula, req.userId);
    if (erro) return res.status(erro === "Acesso negado." ? 403 : 400).json({ msg: erro });

    const resultado = await payment.create({
      body: {
        transaction_amount: Number(matricula.precoFinal),
        token,
        installments: Number(installments) || 1,
        payment_method_id: paymentMethodId,
        description: `Matrícula Francês na Mira - ${matricula.dadosPessoais.nome}`,
        payer: { email: matricula.dadosPessoais.email, identification: { type: "CPF", number: cpf } }
      }
    });

    const aprovado = resultado.status === "approved";
    const metodoPagamento = tipo === "debito" ? "cartao_debito" : "cartao_credito";

    const pagamento = await PagamentoMatricula.create({
      matriculaId: matricula._id, alunoId: req.userId, metodoPagamento,
      valor: matricula.precoFinal, status: aprovado ? "aprovado" : "rejeitado",
      mercadoPagoId: String(resultado.id)
    });

    if (aprovado) await confirmarMatricula(pagamento);
    else await rejeitarMatricula(pagamento);

    res.json({
      status: resultado.status, statusDetail: resultado.status_detail,
      pagamentoId: pagamento._id, matriculaStatus: aprovado ? "confirmada" : matricula.status
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro ao processar pagamento", detalhe: err.message });
  }
});

// ===================== PIX =====================
router.post("/pix", exigirAuth, async (req, res) => {
  try {
    const { matriculaId, cpf } = req.body;
    if (!matriculaId || !cpf) return res.status(400).json({ msg: "Dados incompletos." });

    const matricula = await Matricula.findById(matriculaId);
    if (!matricula) return res.status(404).json({ msg: "Matrícula não encontrada." });
    const erro = podePagar(matricula, req.userId);
    if (erro) return res.status(erro === "Acesso negado." ? 403 : 400).json({ msg: erro });

    const resultado = await payment.create({
      body: {
        transaction_amount: Number(matricula.precoFinal),
        payment_method_id: "pix",
        description: `Matrícula Francês na Mira - ${matricula.dadosPessoais.nome}`,
        payer: { email: matricula.dadosPessoais.email, identification: { type: "CPF", number: cpf } }
      }
    });

    const txData = resultado.point_of_interaction?.transaction_data;
    const pagamento = await PagamentoMatricula.create({
      matriculaId: matricula._id, alunoId: req.userId, metodoPagamento: "pix",
      valor: matricula.precoFinal, status: "pendente", mercadoPagoId: String(resultado.id),
      pixQrCodeBase64: txData?.qr_code_base64, pixCopiaCola: txData?.qr_code
    });

    res.json({ pagamentoId: pagamento._id, qrCodeBase64: txData?.qr_code_base64, copiaECola: txData?.qr_code });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro ao gerar Pix", detalhe: err.message });
  }
});

// ===================== BOLETO =====================
router.post("/boleto", exigirAuth, async (req, res) => {
  try {
    const { matriculaId, cpf, cep, rua, numero, bairro, cidade, estado } = req.body;
    if (!matriculaId || !cpf || !cep || !rua || !numero || !bairro || !cidade || !estado) {
      return res.status(400).json({ msg: "Preencha todos os campos, incluindo o endereço (exigido pelo Mercado Pago para gerar o boleto)." });
    }

    const matricula = await Matricula.findById(matriculaId);
    if (!matricula) return res.status(404).json({ msg: "Matrícula não encontrada." });
    const erro = podePagar(matricula, req.userId);
    if (erro) return res.status(erro === "Acesso negado." ? 403 : 400).json({ msg: erro });

    const [firstName, ...rest] = matricula.dadosPessoais.nome.trim().split(" ");
    const lastName = rest.join(" ") || firstName;

    const resultado = await payment.create({
      body: {
        transaction_amount: Number(matricula.precoFinal),
        payment_method_id: "bolbradesco",
        description: `Matrícula Francês na Mira - ${matricula.dadosPessoais.nome}`,
        payer: {
          email: matricula.dadosPessoais.email, first_name: firstName, last_name: lastName,
          identification: { type: "CPF", number: cpf },
          address: { zip_code: cep.replace(/\D/g, ""), street_name: rua, street_number: numero, neighborhood: bairro, city: cidade, federal_unit: estado }
        }
      }
    });

    const pagamento = await PagamentoMatricula.create({
      matriculaId: matricula._id, alunoId: req.userId, metodoPagamento: "boleto",
      valor: matricula.precoFinal, status: "pendente", mercadoPagoId: String(resultado.id),
      boletoUrl: resultado.transaction_details?.external_resource_url
    });

    res.json({ pagamentoId: pagamento._id, boletoUrl: resultado.transaction_details?.external_resource_url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro ao gerar boleto", detalhe: err.message });
  }
});

// ===================== CONSULTAR STATUS (polling de apoio ao SSE) =====================
router.get("/:id/status", exigirAuth, async (req, res) => {
  try {
    const pagamento = await PagamentoMatricula.findById(req.params.id);
    if (!pagamento) return res.status(404).json({ msg: "Pagamento não encontrado." });
    if (pagamento.alunoId.toString() !== req.userId) return res.status(403).json({ msg: "Acesso negado." });
    res.json({ status: pagamento.status });
  } catch (err) {
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// ===================== PAGAMENTOS DE UMA MATRÍCULA (aluno dono) =====================
router.get("/matricula/:matriculaId", exigirAuth, async (req, res) => {
  try {
    const matricula = await Matricula.findById(req.params.matriculaId);
    if (!matricula) return res.status(404).json({ msg: "Matrícula não encontrada." });
    const souStaff = req.userRole === "professor" || req.userRole === "admin";
    if (matricula.alunoId.toString() !== req.userId && !souStaff) return res.status(403).json({ msg: "Acesso negado." });
    const pagamentos = await PagamentoMatricula.find({ matriculaId: matricula._id }).sort({ criadoEm: -1 });
    res.json(pagamentos);
  } catch (err) {
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// ===================== WEBHOOK — Mercado Pago avisa mudanças de status =====================
router.post("/webhook", async (req, res) => {
  try {
    const { type, data } = req.body;
    if (type === "payment" && data?.id) {
      const info = await payment.get({ id: data.id });
      const novoStatus = info.status === "approved" ? "aprovado" : info.status === "rejected" ? "rejeitado" : "pendente";

      const pagamento = await PagamentoMatricula.findOneAndUpdate(
        { mercadoPagoId: String(data.id) }, { status: novoStatus }, { new: true }
      );

      if (pagamento) {
        transmitir("pagamento-atualizado", { pagamentoId: pagamento._id, matriculaId: pagamento.matriculaId, status: novoStatus });
        if (novoStatus === "aprovado") await confirmarMatricula(pagamento);
        else if (novoStatus === "rejeitado") await rejeitarMatricula(pagamento);
      }
    }
    res.sendStatus(200);
  } catch (err) {
    console.error("Erro no webhook de matrícula:", err.message);
    res.sendStatus(200);
  }
});

module.exports = router;
// Exportados à parte para o webhook único em routes/pagamentos.js poder
// tratar também os pagamentos de matrícula (o Mercado Pago só aceita uma
// URL de notificação por aplicação).
module.exports.confirmarMatricula = confirmarMatricula;
module.exports.rejeitarMatricula = rejeitarMatricula;
