const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const { MercadoPagoConfig, Payment } = require("mercadopago");
const Pedido = require("../models/pedido");
const User = require("../models/user");
const Turma = require("../models/turma");
const Matricula = require("../models/matricula");
const HorarioSlot = require("../models/horarioSlot");
const PagamentoMatricula = require("../models/pagamentoMatricula");
const { exigirAuth } = require("../middleware/auth");
const { transmitir } = require("../utils/sse");
const { confirmarMatricula, rejeitarMatricula } = require("./pagamentoMatricula");
const { precoPorTier } = require("../utils/precoMatricula");
const { PRODUTOS_PACK_PRESTIGE, precoPackPrestige, chavesLiberadas } = require("../utils/precoPackPrestige");

const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
const payment = new Payment(client);

const CREDITOS_CORRECAO_POR_TIER = { Essentiel: 2, "Avancé": 5, Excellence: 10 };
const NOMES_DIA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

// Recalcula o valor no servidor sempre que a matrícula vier acompanhada de horários
// escolhidos (fluxo novo de Particular/Turma) — nunca confia no `valor` mandado pelo
// cliente nesse caso. Para os planos sem agenda (Correções, Plataforma, Aulas Gravadas),
// que não mandam slotsEscolhidos, o comportamento antigo (valor do cliente) é mantido.
function valorAutoritativo(valorCliente, plano, slotsEscolhidos, curso, upgrades) {
  if (PRODUTOS_PACK_PRESTIGE[curso]) return precoPackPrestige(curso, upgrades);
  if (!Array.isArray(slotsEscolhidos) || slotsEscolhidos.length === 0) return Number(valorCliente);
  if (slotsEscolhidos.length > 4) throw new Error("Você pode selecionar no máximo quatro horários semanais.");
  return precoPorTier(slotsEscolhidos.length, plano);
}

// Checagem rápida (não atômica) só pra evitar cobrar o aluno por um horário já visivelmente
// lotado antes mesmo de chamar o Mercado Pago. A garantia de verdade é a transação em
// criarMatriculaDeHorarios(), rodada só depois do pagamento aprovado.
async function validarSlotsDisponiveis(slotsEscolhidos) {
  if (!Array.isArray(slotsEscolhidos) || !slotsEscolhidos.length) return;
  const slots = await HorarioSlot.find({ _id: { $in: slotsEscolhidos.map(s => s.slotId) }, ativo: true });
  if (slots.length !== slotsEscolhidos.length) throw new Error("Um dos horários escolhidos não existe mais. Selecione novamente.");
  for (const s of slots) {
    const ocupadas = await Matricula.countDocuments({ status: "confirmada", "slotsEscolhidos.slotId": s._id });
    if (ocupadas >= s.capacidadeMaxima) {
      throw new Error(`O horário de ${NOMES_DIA[s.diaSemana]} às ${s.horaInicio} acabou de ficar indisponível. Selecione outro.`);
    }
  }
}

// Gate final e atômico, chamado só depois do pagamento já aprovado. Se algum horário
// lotou nesse meio-tempo (janela rara entre a pré-checagem e a confirmação do pagamento),
// a assinatura do plano já foi ativada normalmente, mas a matrícula do horário não é criada
// — fica registrado no log pra acompanhamento manual, já que o pagamento não pode mais ser
// interrompido nesse ponto.
async function criarMatriculaDeHorarios(userId, curso, plano, tipo, slotsEscolhidos, precoFinal, dadosPessoais) {
  const user = await User.findById(userId).select("nome email");
  const session = await mongoose.startSession();
  try {
    let matricula = null;
    await session.withTransaction(async () => {
      const slots = await HorarioSlot.find({ _id: { $in: slotsEscolhidos.map(s => s.slotId) } }).session(session);
      for (const s of slots) {
        const ocupadas = await Matricula.countDocuments({ status: "confirmada", "slotsEscolhidos.slotId": s._id }).session(session);
        if (ocupadas >= s.capacidadeMaxima) {
          throw new Error(`O horário de ${NOMES_DIA[s.diaSemana]} às ${s.horaInicio} foi ocupado por outro aluno enquanto seu pagamento era processado.`);
        }
      }
      const [criada] = await Matricula.create([{
        alunoId: userId, tipo, curso, slotsEscolhidos,
        dadosPessoais: {
          nome: dadosPessoais?.nome || user?.nome,
          email: dadosPessoais?.email || user?.email,
          telefone: dadosPessoais?.telefone || "",
          objetivo: dadosPessoais?.objetivo, nivelAtual: dadosPessoais?.nivelAtual,
          nivelDesejado: dadosPessoais?.nivelDesejado, prova: dadosPessoais?.prova,
          dataExame: dadosPessoais?.dataExame || undefined, mensagem: dadosPessoais?.mensagem
        },
        precoOriginal: precoFinal, precoFinal, status: "confirmada"
      }], { session });
      matricula = criada;
    });
    return matricula;
  } catch (err) {
    console.error("Não foi possível confirmar os horários da matrícula:", err.message);
    return null;
  } finally {
    session.endSession();
  }
}

// Compras avulsas do Pack Prestige (Plataforma de Questões, Ambiente de Produção Oral e
// Textual, Aulas Especializadas Online) não mexem no "plano" de curso do usuário — apenas
// liberam as chaves compradas (produto principal + upgrades) em produtosAvulsos.
async function ativarPackPrestige(userId, curso, upgrades) {
  if (!userId) return;
  const dataVencimento = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const chaves = chavesLiberadas(curso, upgrades);
  const set = {};
  chaves.forEach(chave => {
    set[`produtosAvulsos.${chave}.ativo`] = true;
    set[`produtosAvulsos.${chave}.dataVencimento`] = dataVencimento;
  });
  await User.findByIdAndUpdate(userId, { $set: set });
}

async function ativarPlano(userId, curso, plano, metodoPagamento, cartaoFinal, turmaId, tipo, slotsEscolhidos, precoFinal, dadosPessoais, upgrades) {
  if (!userId) return;

  if (PRODUTOS_PACK_PRESTIGE[curso]) {
    await ativarPackPrestige(userId, curso, upgrades);
    return;
  }

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

  if (Array.isArray(slotsEscolhidos) && slotsEscolhidos.length && tipo) {
    await criarMatriculaDeHorarios(userId, curso, plano, tipo, slotsEscolhidos, precoFinal, dadosPessoais);
    return;
  }

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
    // "tipo" aqui é débito/crédito (bandeira do cartão) — não confundir com "tipoMatricula"
    // (particular/turma), que é o novo campo do fluxo de horários.
    const { token, paymentMethodId, installments, curso, plano, valor, email, cpf, tipo, turmaId, tipoMatricula, slotsEscolhidos, dadosPessoais, upgrades } = req.body;

    if (!token || !paymentMethodId || !curso || !plano || !valor || !email || !cpf) {
      return res.status(400).json({ msg: "Preencha todos os campos" });
    }

    let valorFinal;
    try {
      valorFinal = valorAutoritativo(valor, plano, slotsEscolhidos, curso, upgrades);
      await validarSlotsDisponiveis(slotsEscolhidos);
    } catch (err) {
      return res.status(409).json({ msg: err.message });
    }

    const resultado = await payment.create({
      body: {
        transaction_amount: valorFinal,
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
      tipo: (tipoMatricula === "particular" || tipoMatricula === "turma") ? tipoMatricula : undefined,
      slotsEscolhidos: slotsEscolhidos || undefined,
      dadosPessoais: dadosPessoais || undefined,
      upgrades: upgrades || undefined,
      curso, plano, valor: valorFinal, email,
      metodoPagamento, cartaoFinal,
      status: aprovado ? "aprovado" : "rejeitado",
      mercadoPagoId: resultado.id
    });

    if (aprovado) {
      await ativarPlano(req.userId, curso, plano, metodoPagamento, cartaoFinal, turmaId, pedido.tipo, slotsEscolhidos, valorFinal, dadosPessoais, upgrades);
    }

    res.json({ status: resultado.status, statusDetail: resultado.status_detail, pedidoId: pedido._id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro ao processar pagamento", detalhe: err.message });
  }
});

// PIX — gera QR Code real
router.post("/pix", exigirAuth, async (req, res) => {
  try {
    const { curso, plano, valor, email, cpf, turmaId, tipoMatricula, slotsEscolhidos, dadosPessoais, upgrades } = req.body;

    if (!curso || !plano || !valor || !email || !cpf) {
      return res.status(400).json({ msg: "Preencha todos os campos" });
    }

    let valorFinal;
    try {
      valorFinal = valorAutoritativo(valor, plano, slotsEscolhidos, curso, upgrades);
      await validarSlotsDisponiveis(slotsEscolhidos);
    } catch (err) {
      return res.status(409).json({ msg: err.message });
    }

    const resultado = await payment.create({
      body: {
        transaction_amount: valorFinal,
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
      tipo: (tipoMatricula === "particular" || tipoMatricula === "turma") ? tipoMatricula : undefined,
      slotsEscolhidos: slotsEscolhidos || undefined,
      dadosPessoais: dadosPessoais || undefined,
      upgrades: upgrades || undefined,
      curso, plano, valor: valorFinal, email,
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
    const { curso, plano, valor, email, cpf, nome, turmaId, cep, rua, numero, bairro, cidade, estado, tipoMatricula, slotsEscolhidos, dadosPessoais, upgrades } = req.body;

    if (!curso || !plano || !valor || !email || !cpf || !nome || !cep || !rua || !numero || !bairro || !cidade || !estado) {
      return res.status(400).json({ msg: "Preencha todos os campos, incluindo o endereço (exigido pelo Mercado Pago para gerar o boleto)." });
    }

    let valorFinal;
    try {
      valorFinal = valorAutoritativo(valor, plano, slotsEscolhidos, curso, upgrades);
      await validarSlotsDisponiveis(slotsEscolhidos);
    } catch (err) {
      return res.status(409).json({ msg: err.message });
    }

    const [firstName, ...rest] = nome.trim().split(" ");
    const lastName = rest.join(" ") || firstName;

    const resultado = await payment.create({
      body: {
        transaction_amount: valorFinal,
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
      tipo: (tipoMatricula === "particular" || tipoMatricula === "turma") ? tipoMatricula : undefined,
      slotsEscolhidos: slotsEscolhidos || undefined,
      dadosPessoais: dadosPessoais || undefined,
      upgrades: upgrades || undefined,
      curso, plano, valor: valorFinal, email,
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

// HISTÓRICO DE COMPRAS DO ALUNO (planos de curso + Pack Prestige) — usado em Minhas Inscrições
router.get("/minhas", exigirAuth, async (req, res) => {
  try {
    const pedidos = await Pedido.find({ userId: req.userId }).sort({ criadoEm: -1 });
    res.json(pedidos);
  } catch (err) {
    res.status(500).json({ msg: "Erro no servidor." });
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
// Único URL de notificação cadastrado no Mercado Pago para toda a conta: trata tanto os
// pagamentos de curso/plano (Pedido) quanto os de matrícula (PagamentoMatricula), já que o
// Mercado Pago só permite configurar uma URL de webhook por aplicação.
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

      if (pedido) {
        if (novoStatus === "aprovado") {
          await ativarPlano(pedido.userId, pedido.curso, pedido.plano, pedido.metodoPagamento, pedido.cartaoFinal, pedido.turmaId, pedido.tipo, pedido.slotsEscolhidos, pedido.valor, pedido.dadosPessoais, pedido.upgrades);
        }
      } else {
        const pagamentoMatricula = await PagamentoMatricula.findOneAndUpdate(
          { mercadoPagoId: String(data.id) },
          { status: novoStatus },
          { new: true }
        );
        if (pagamentoMatricula) {
          transmitir("pagamento-atualizado", { pagamentoId: pagamentoMatricula._id, matriculaId: pagamentoMatricula.matriculaId, status: novoStatus });
          if (novoStatus === "aprovado") await confirmarMatricula(pagamentoMatricula);
          else if (novoStatus === "rejeitado") await rejeitarMatricula(pagamentoMatricula);
        }
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("Erro no webhook:", err.message);
    res.sendStatus(200); // sempre 200 para o MP não ficar reenviando
  }
});

module.exports = router;
