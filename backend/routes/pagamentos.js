const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const crypto = require("crypto");
const { MercadoPagoConfig, Payment } = require("mercadopago");
const Pedido = require("../models/pedido");
const User = require("../models/user");
const Turma = require("../models/turma");
const Matricula = require("../models/matricula");
const HorarioSlot = require("../models/horarioSlot");
const PagamentoMatricula = require("../models/pagamentoMatricula");
const HistoricoAluno = require("../models/historicoAluno");
const { exigirAuth } = require("../middleware/auth");
const { horariosTomados, tomadoPelaOutra } = require("../utils/conflitoHorario");
const { transmitir } = require("../utils/sse");
const { confirmarMatricula, rejeitarMatricula } = require("./pagamentoMatricula");
const { precoPorTier } = require("../utils/precoMatricula");
const { precoPackPrestige, CURSO_COMBO_FLUENCIA, CURSOS_DO_COMBO_FLUENCIA } = require("../utils/precoPackPrestige");
const { TIPOS_CURSO } = require("../utils/tiposCurso");
const { enviarEmailPagamentoAprovado } = require("../utils/mailer");
const { ehObjectId, normalizarEmail, textoSeguro, limitarTaxa } = require("../middleware/seguranca");
const { registrar } = require("../utils/monitorSeguranca");
const Cupom = require("../models/cupom");
const { aplicarCupom } = require("../utils/cupons");
const { ativarComBoasVindas } = require("../utils/creditosProducao");

// O front sempre manda o mesmo preço que o servidor calcula; divergência significa
// requisição editada à mão tentando pagar menos. A cobrança já usa o valor do servidor —
// aqui só registramos a tentativa (pontua o IP e avisa a equipe).
function verificarAdulteracaoPreco(req, valorFinal) {
  const enviado = Number(req.body.valor);
  if (req.body.valor !== undefined && Number.isFinite(enviado) && enviado > 0 && Math.abs(enviado - valorFinal) > 0.01) {
    registrar("adulteracao_preco", req, { curso: req.body.curso, plano: req.body.plano, valorEnviado: enviado, valorOficial: valorFinal });
  }
}

// Criar cobranças é caro e abusável (teste de cartões roubados) — limite por IP.
const limitePagamento = limitarTaxa({
  nome: "pagamento", janelaMs: 15 * 60 * 1000, max: 15,
  msg: "Muitas tentativas de pagamento. Aguarde alguns minutos e tente novamente."
});

// Preço mensal dos planos por curso quando NÃO há horários escolhidos. Espelha o "a partir
// de" dos cards de preço (index.html e páginas de cada curso): 1 aula por semana.
const PRECO_PLANO_FIXO = Object.fromEntries(TIPOS_CURSO.map(curso => [curso, {
  Essentiel: precoPorTier(1, "Essentiel"), "Avancé": precoPorTier(1, "Avancé"), Excellence: precoPorTier(1, "Excellence")
}]));
const TIERS = ["Essentiel", "Avancé", "Excellence"];

// Valida e normaliza tudo que vem do cliente num pedido de pagamento. Lança erro
// com mensagem amigável; nunca deixa objeto/operador chegar ao banco ou ao MP.
function validarPedido(body) {
  const { curso, plano, turmaId, tipoMatricula, slotsEscolhidos } = body;
  const cursoValido = curso === CURSO_COMBO_FLUENCIA ? plano === "Pack Prestige" : TIPOS_CURSO.includes(curso);
  if (!cursoValido) throw new Error("Curso inválido.");
  if (plano !== "Pack Prestige" && !TIERS.includes(plano)) throw new Error("Plano inválido.");

  const email = normalizarEmail(body.email);
  if (!email) throw new Error("Informe um e-mail válido.");
  const cpf = String(body.cpf || "").replace(/\D/g, "");
  if (cpf.length !== 11) throw new Error("Informe um CPF válido.");

  if (turmaId !== undefined && turmaId !== null && turmaId !== "" && !ehObjectId(turmaId)) throw new Error("Turma inválida.");
  if (tipoMatricula !== undefined && !["particular", "turma"].includes(tipoMatricula)) throw new Error("Tipo de matrícula inválido.");

  let slots;
  if (slotsEscolhidos !== undefined && slotsEscolhidos !== null) {
    if (!Array.isArray(slotsEscolhidos) || slotsEscolhidos.length > 4) throw new Error("Você pode selecionar no máximo quatro horários semanais.");
    slots = slotsEscolhidos.map(sl => {
      if (!sl || !ehObjectId(sl.slotId)) throw new Error("Horário inválido.");
      return { slotId: sl.slotId, diaSemana: Number(sl.diaSemana), horaInicio: textoSeguro(sl.horaInicio, 5) };
    });
    if (new Set(slots.map(sl => sl.slotId)).size !== slots.length) throw new Error("Horário repetido na seleção.");
  }

  const dp = body.dadosPessoais && typeof body.dadosPessoais === "object" ? body.dadosPessoais : null;
  const dadosPessoais = dp ? {
    nome: textoSeguro(dp.nome, 120), email: normalizarEmail(dp.email) || undefined,
    telefone: textoSeguro(dp.telefone, 30), objetivo: textoSeguro(dp.objetivo, 300),
    nivelAtual: textoSeguro(dp.nivelAtual, 30), nivelDesejado: textoSeguro(dp.nivelDesejado, 30),
    prova: textoSeguro(dp.prova, 60), dataExame: textoSeguro(dp.dataExame, 30), mensagem: textoSeguro(dp.mensagem, 2000)
  } : undefined;

  return {
    curso, plano, email, cpf, dadosPessoais,
    turmaId: turmaId || undefined,
    tipoMatricula,
    slotsEscolhidos: slots && slots.length ? slots : undefined
  };
}

const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
const payment = new Payment(client);

const CREDITOS_CORRECAO_POR_TIER = { Essentiel: 2, "Avancé": 5, Excellence: 10 };
const NOMES_DIA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

// O valor cobrado é SEMPRE calculado no servidor — o `valor` mandado pelo cliente é
// ignorado (antes, nos planos sem agenda, ele era usado direto e bastava editar a
// requisição para pagar R$ 1 por qualquer plano). Pack Prestige tem preço fixo por
// curso; com horários escolhidos vale a fórmula progressiva; com turma, o preço da
// turma no banco; sem nada disso, a tabela fixa de planos por curso.
async function valorAutoritativo(plano, slotsEscolhidos, curso, turmaId) {
  if (plano === "Pack Prestige") return precoPackPrestige(curso);
  if (Array.isArray(slotsEscolhidos) && slotsEscolhidos.length > 0) {
    if (slotsEscolhidos.length > 4) throw new Error("Você pode selecionar no máximo quatro horários semanais.");
    return precoPorTier(slotsEscolhidos.length, plano);
  }
  if (turmaId) {
    const turma = await Turma.findOne({ _id: turmaId, ativa: true }).select("preco");
    if (!turma || !(turma.preco > 0)) throw new Error("Turma indisponível.");
    return turma.preco;
  }
  const preco = PRECO_PLANO_FIXO[curso]?.[plano];
  if (!preco) throw new Error("Plano indisponível para este curso.");
  return preco;
}

// Preço final com cupom (se houver). `verificarAdulteracaoPreco` compara com o preço
// cheio — o navegador manda o valor antes do desconto.
async function precoDoPedido(req, dados) {
  const valorOriginal = await valorAutoritativo(dados.plano, dados.slotsEscolhidos, dados.curso, dados.turmaId);
  verificarAdulteracaoPreco(req, valorOriginal);
  const { cupom, desconto, valorFinal } = await aplicarCupom(req.body.cupomCodigo, valorOriginal, dados.curso, dados.plano);
  return { valorOriginal, valorFinal, desconto, cupomCodigo: cupom ? cupom.codigo : null };
}

// Conta o uso do cupom uma única vez, quando o pagamento é aprovado (o webhook pode chegar
// repetido; o flag no pedido garante que não conta duas vezes).
async function contabilizarCupom(pedido) {
  if (!pedido?.cupomCodigo) return;
  const r = await Pedido.updateOne({ _id: pedido._id, cupomContabilizado: { $ne: true } }, { $set: { cupomContabilizado: true } });
  if (r.modifiedCount) await Cupom.updateOne({ codigo: pedido.cupomCodigo }, { $inc: { usosAtuais: 1 } });
}

// Faz upsert (match-then-push) de uma entrada em User.planos por courseType, dentro de
// uma transação curta — evita duas entradas duplicadas pro mesmo curso se dois webhooks
// do Mercado Pago pro mesmo pagamento chegarem quase simultaneamente (o MP reenvia
// notificação). Não cria índice único sobre planos.courseType (seria multikey único por
// COLEÇÃO inteira, bloquearia todo mundo depois do primeiro usuário) — a unicidade "um
// courseType por usuário" é garantida só por este caminho de escrita.
async function upsertPlanoCurso(userId, courseType, patch) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const setPrefixado = Object.fromEntries(Object.entries(patch).map(([k, v]) => [`planos.$.${k}`, v]));
      const res = await User.updateOne(
        { _id: userId, "planos.courseType": courseType },
        { $set: setPrefixado },
        { session }
      );
      if (res.matchedCount === 0) {
        await User.updateOne({ _id: userId }, { $push: { planos: { courseType, ...patch } } }, { session });
      }
    });
  } finally {
    session.endSession();
  }
}

// Checagem rápida (não atômica) só pra evitar cobrar o aluno por um horário já visivelmente
// lotado antes mesmo de chamar o Mercado Pago. A garantia de verdade é a transação em
// criarMatriculaDeHorarios(), rodada só depois do pagamento aprovado.
async function validarSlotsDisponiveis(slotsEscolhidos) {
  if (!Array.isArray(slotsEscolhidos) || !slotsEscolhidos.length) return;
  const slots = await HorarioSlot.find({ _id: { $in: slotsEscolhidos.map(s => s.slotId) }, ativo: true });
  if (slots.length !== slotsEscolhidos.length) throw new Error("Um dos horários escolhidos não existe mais. Selecione novamente.");
  const tomados = await horariosTomados();
  for (const s of slots) {
    const ocupadas = await Matricula.countDocuments({ status: "confirmada", "slotsEscolhidos.slotId": s._id });
    if (ocupadas >= s.capacidadeMaxima || tomadoPelaOutra(tomados, s)) {
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
      const tomados = await horariosTomados(session);
      for (const s of slots) {
        const ocupadas = await Matricula.countDocuments({ status: "confirmada", "slotsEscolhidos.slotId": s._id }).session(session);
        if (ocupadas >= s.capacidadeMaxima || tomadoPelaOutra(tomados, s)) {
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

// Ativa o Pack Prestige de UM curso (Plataforma de Questões + Aulas Especializadas +
// Produção Textual, escopados a esse courseType) — não mexe em `tier`/`ativo` da
// assinatura normal do mesmo curso, os dois convivem lado a lado (ver acessoCurso.js).
async function ativarPackPrestige(userId, curso, metodoPagamento, precoFinal, mercadoPagoId) {
  if (!userId) return;
  const dataInicio = new Date();
  const dataVencimento = new Date(dataInicio.getTime() + 30 * 24 * 60 * 60 * 1000);

  await ativarComBoasVindas(userId, () => upsertPlanoCurso(userId, curso, { packPrestige: { ativo: true, dataVencimento, mercadoPagoId } }));

  const user = await User.findById(userId).select("nome email");
  if (user?.email) {
    enviarEmailPagamentoAprovado(user.email, user.nome, {
      curso, plano: "Pack Prestige", valor: precoFinal, metodoPagamento, dataInicio, dataVencimento, mercadoPagoId
    }).catch(err => console.error("Erro ao enviar e-mail de pagamento aprovado:", err.message));
  }

  HistoricoAluno.create({
    alunoId: userId, tipo: "mudanca_plano",
    titulo: `Pack Prestige ativado: ${curso}`,
    descricao: `Válido até ${dataVencimento.toLocaleDateString("pt-BR")}.`
  }).catch(err => console.error("Erro ao registrar histórico do aluno:", err.message));
}

// Combo "Do A1 ao B2" — um único Pack Prestige que ativa A1, A2, B1 e B2 de uma vez.
// Reaproveita upsertPlanoCurso por curso (mesmo caminho de escrita do Pack Prestige
// normal), só que em loop — cada um dos 4 cursos fica com seu próprio packPrestige.ativo,
// então o middleware de acesso (acessoCurso.js) não precisa saber que isso é um combo.
async function ativarPackPrestigeCombo(userId, metodoPagamento, precoFinal, mercadoPagoId) {
  if (!userId) return;
  const dataInicio = new Date();
  const dataVencimento = new Date(dataInicio.getTime() + 30 * 24 * 60 * 60 * 1000);

  await ativarComBoasVindas(userId, async () => {
    for (const curso of CURSOS_DO_COMBO_FLUENCIA) {
      await upsertPlanoCurso(userId, curso, { packPrestige: { ativo: true, dataVencimento, mercadoPagoId } });
    }
  });

  const user = await User.findById(userId).select("nome email");
  if (user?.email) {
    enviarEmailPagamentoAprovado(user.email, user.nome, {
      curso: "A1, A2, B1 e B2", plano: "Pack Prestige", valor: precoFinal, metodoPagamento, dataInicio, dataVencimento, mercadoPagoId
    }).catch(err => console.error("Erro ao enviar e-mail de pagamento aprovado:", err.message));
  }

  HistoricoAluno.create({
    alunoId: userId, tipo: "mudanca_plano",
    titulo: "Pack Prestige ativado: A1 ao B2",
    descricao: `Válido até ${dataVencimento.toLocaleDateString("pt-BR")} para A1, A2, B1 e B2.`
  }).catch(err => console.error("Erro ao registrar histórico do aluno:", err.message));
}

async function ativarPlano(userId, curso, plano, metodoPagamento, cartaoFinal, turmaId, tipo, slotsEscolhidos, precoFinal, dadosPessoais, mercadoPagoId) {
  if (!userId) return;

  if (curso === CURSO_COMBO_FLUENCIA && plano === "Pack Prestige") {
    await ativarPackPrestigeCombo(userId, metodoPagamento, precoFinal, mercadoPagoId);
    return;
  }

  if (!TIPOS_CURSO.includes(curso)) {
    console.error(`ativarPlano: curso "${curso}" não é um dos 8 códigos canônicos — pagamento aprovado mas plano não ativado, verificar manualmente (userId=${userId}).`);
    return;
  }

  if (plano === "Pack Prestige") {
    await ativarPackPrestige(userId, curso, metodoPagamento, precoFinal, mercadoPagoId);
    return;
  }

  const dataInicio = new Date();
  const dataVencimento = new Date(dataInicio.getTime() + 30 * 24 * 60 * 60 * 1000);
  const creditosGanhos = CREDITOS_CORRECAO_POR_TIER[plano] || 0;

  const existente = await User.findOne({ _id: userId, "planos.courseType": curso }, { "planos.$": 1 });
  const ehRenovacao = existente?.planos?.[0]?.tier === plano;

  // Primeira vez com o Ambiente de Produção: 20 créditos de boas-vindas (no lugar dos
  // créditos mensais do plano nesse primeiro mês). Renovações seguem com os do plano.
  const boasVindas = await ativarComBoasVindas(userId, () => upsertPlanoCurso(userId, curso, {
    tier: plano, ativo: true, metodoPagamento, cartaoFinal, autoRenovacao: false, dataInicio, dataVencimento
  }));
  if (creditosGanhos && !boasVindas) await User.updateOne({ _id: userId }, { $inc: { creditosCorrecao: creditosGanhos } });

  const user = await User.findById(userId).select("nome email");
  if (user?.email) {
    enviarEmailPagamentoAprovado(user.email, user.nome, {
      curso, plano, valor: precoFinal, metodoPagamento, dataInicio, dataVencimento, mercadoPagoId
    }).catch(err => console.error("Erro ao enviar e-mail de pagamento aprovado:", err.message));
  }

  HistoricoAluno.create({
    alunoId: userId,
    tipo: ehRenovacao ? "renovacao" : "mudanca_plano",
    titulo: ehRenovacao ? `Renovação do plano ${plano} · ${curso}` : `Novo plano: ${plano} · ${curso}`,
    descricao: `Válido até ${dataVencimento.toLocaleDateString("pt-BR")}.`
  }).catch(err => console.error("Erro ao registrar histórico do aluno:", err.message));

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
router.post("/cartao", exigirAuth, limitePagamento, async (req, res) => {
  try {
    // "tipo" aqui é débito/crédito (bandeira do cartão) — não confundir com "tipoMatricula"
    // (particular/turma), que é o novo campo do fluxo de horários.
    const { token, paymentMethodId, installments, tipo } = req.body;

    if (!token || !paymentMethodId || !req.body.curso || !req.body.plano || !req.body.email || !req.body.cpf) {
      return res.status(400).json({ msg: "Preencha todos os campos" });
    }
    if (typeof token !== "string" || typeof paymentMethodId !== "string" || !/^[a-z_]{2,30}$/.test(paymentMethodId)) {
      return res.status(400).json({ msg: "Dados do cartão inválidos." });
    }
    const parcelas = Number(installments) || 1;
    if (!Number.isInteger(parcelas) || parcelas < 1 || parcelas > 12) return res.status(400).json({ msg: "Número de parcelas inválido." });

    let dados, valorFinal, preco;
    try {
      dados = validarPedido(req.body);
      preco = await precoDoPedido(req, dados);
      valorFinal = preco.valorFinal;
      await validarSlotsDisponiveis(dados.slotsEscolhidos);
    } catch (err) {
      return res.status(409).json({ msg: err.message });
    }
    const { curso, plano, email, cpf, turmaId, tipoMatricula, slotsEscolhidos, dadosPessoais } = dados;

    const resultado = await payment.create({
      body: {
        transaction_amount: valorFinal,
        token,
        description: `${curso} - Plano ${plano}`,
        installments: parcelas,
        payment_method_id: paymentMethodId,
        payer: {
          email,
          identification: { type: "CPF", number: cpf }
        }
      }
    });

    const aprovado = resultado.status === "approved";
    if (resultado.status === "rejected") registrar("pagamento_recusado", req, { motivo: resultado.status_detail });
    const metodoPagamento = tipo === "debito" ? "cartao_debito" : "cartao_credito";
    const cartaoFinal = resultado.card?.last_four_digits;

    const pedido = await Pedido.create({
      userId: req.userId,
      turmaId: turmaId || undefined,
      tipo: (tipoMatricula === "particular" || tipoMatricula === "turma") ? tipoMatricula : undefined,
      slotsEscolhidos: slotsEscolhidos || undefined,
      dadosPessoais: dadosPessoais || undefined,
      curso, plano, valor: valorFinal, email,
      valorOriginal: preco.valorOriginal, cupomCodigo: preco.cupomCodigo, desconto: preco.desconto,
      metodoPagamento, cartaoFinal, parcelas,
      status: aprovado ? "aprovado" : "rejeitado",
      mercadoPagoId: resultado.id
    });

    if (aprovado) {
      await contabilizarCupom(pedido);
      await ativarPlano(req.userId, curso, plano, metodoPagamento, cartaoFinal, turmaId, pedido.tipo, slotsEscolhidos, valorFinal, dadosPessoais, resultado.id);
    }

    res.json({ status: resultado.status, statusDetail: resultado.status_detail, pedidoId: pedido._id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro ao processar pagamento" });
  }
});

// PIX — gera QR Code real
router.post("/pix", exigirAuth, limitePagamento, async (req, res) => {
  try {
    if (!req.body.curso || !req.body.plano || !req.body.email || !req.body.cpf) {
      return res.status(400).json({ msg: "Preencha todos os campos" });
    }

    let dados, valorFinal, preco;
    try {
      dados = validarPedido(req.body);
      preco = await precoDoPedido(req, dados);
      valorFinal = preco.valorFinal;
      await validarSlotsDisponiveis(dados.slotsEscolhidos);
    } catch (err) {
      return res.status(409).json({ msg: err.message });
    }
    const { curso, plano, email, cpf, turmaId, tipoMatricula, slotsEscolhidos, dadosPessoais } = dados;

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
      curso, plano, valor: valorFinal, email,
      valorOriginal: preco.valorOriginal, cupomCodigo: preco.cupomCodigo, desconto: preco.desconto,
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
    res.status(500).json({ msg: "Erro ao gerar Pix" });
  }
});

// BOLETO
router.post("/boleto", exigirAuth, limitePagamento, async (req, res) => {
  try {
    const nome = textoSeguro(req.body.nome, 120);
    const cep = textoSeguro(req.body.cep, 10);
    const rua = textoSeguro(req.body.rua, 150);
    const numero = textoSeguro(req.body.numero, 20);
    const bairro = textoSeguro(req.body.bairro, 100);
    const cidade = textoSeguro(req.body.cidade, 100);
    const estado = textoSeguro(req.body.estado, 2);

    if (!req.body.curso || !req.body.plano || !req.body.email || !req.body.cpf || !nome || !cep || !rua || !numero || !bairro || !cidade || !estado) {
      return res.status(400).json({ msg: "Preencha todos os campos, incluindo o endereço (exigido pelo Mercado Pago para gerar o boleto)." });
    }

    let dados, valorFinal, preco;
    try {
      dados = validarPedido(req.body);
      preco = await precoDoPedido(req, dados);
      valorFinal = preco.valorFinal;
      await validarSlotsDisponiveis(dados.slotsEscolhidos);
    } catch (err) {
      return res.status(409).json({ msg: err.message });
    }
    const { curso, plano, email, cpf, turmaId, tipoMatricula, slotsEscolhidos, dadosPessoais } = dados;

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
      curso, plano, valor: valorFinal, email,
      valorOriginal: preco.valorOriginal, cupomCodigo: preco.cupomCodigo, desconto: preco.desconto,
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
    res.status(500).json({ msg: "Erro ao gerar boleto" });
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
    const pedido = await Pedido.findOne({ mercadoPagoId: String(req.params.mercadoPagoId), userId: req.userId });
    if (!pedido) return res.status(404).json({ msg: "Pedido não encontrado." });
    res.json({ status: pedido.status });
  } catch (err) {
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// Validação opcional da assinatura do webhook (header x-signature do Mercado Pago).
// Ativa quando MP_WEBHOOK_SECRET estiver configurado no ambiente — recomendado.
function assinaturaWebhookValida(req) {
  const segredo = process.env.MP_WEBHOOK_SECRET;
  if (!segredo) return true;
  const assinatura = String(req.headers["x-signature"] || "");
  const requestId = String(req.headers["x-request-id"] || "");
  const partes = Object.fromEntries(assinatura.split(",").map(p => p.trim().split("=")));
  if (!partes.ts || !partes.v1) return false;
  const dataId = String(req.query["data.id"] || req.body?.data?.id || "").toLowerCase();
  const manifesto = `id:${dataId};request-id:${requestId};ts:${partes.ts};`;
  const esperado = crypto.createHmac("sha256", segredo).update(manifesto).digest("hex");
  const a = Buffer.from(esperado), b = Buffer.from(String(partes.v1));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// WEBHOOK — Mercado Pago avisa aqui quando o status do pagamento muda (confirma Pix/Boleto)
// Único URL de notificação cadastrado no Mercado Pago para toda a conta: trata tanto os
// pagamentos de curso/plano (Pedido) quanto os de matrícula (PagamentoMatricula), já que o
// Mercado Pago só permite configurar uma URL de webhook por aplicação.
router.post("/webhook", async (req, res) => {
  try {
    if (!assinaturaWebhookValida(req)) {
      registrar("webhook_invalido", req, { assinatura: String(req.headers["x-signature"] || "").slice(0, 80) });
      return res.sendStatus(401);
    }
    const { type, data } = req.body;

    // O status nunca é lido do corpo: é sempre consultado na API do Mercado Pago.
    if (type === "payment" && data?.id && /^\d{1,20}$/.test(String(data.id))) {
      const info = await payment.get({ id: String(data.id) });
      const novoStatus = info.status === "approved" ? "aprovado" : info.status === "rejected" ? "rejeitado" : "pendente";

      // Devolve o pedido ANTES da atualização: o plano só é ativado na transição para
      // "aprovado". O MP reenvia a notificação e também notifica pagamentos de cartão já
      // aprovados na hora — sem isso o plano (e os créditos de correção) seriam somados de novo.
      const pedido = await Pedido.findOneAndUpdate(
        { mercadoPagoId: String(data.id) },
        { status: novoStatus },
        { returnDocument: "before" }
      );

      if (pedido) {
        if (novoStatus === "aprovado" && pedido.status !== "aprovado") {
          await contabilizarCupom(pedido);
          await ativarPlano(pedido.userId, pedido.curso, pedido.plano, pedido.metodoPagamento, pedido.cartaoFinal, pedido.turmaId, pedido.tipo, pedido.slotsEscolhidos, pedido.valor, pedido.dadosPessoais, pedido.mercadoPagoId);
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
