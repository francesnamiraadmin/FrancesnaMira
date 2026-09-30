// Regras únicas de cupom de desconto: usadas na prévia da matrícula (validar-cupom) e na
// cobrança de verdade (/api/pagamentos). O valor com desconto é sempre calculado aqui, no
// servidor — nunca a partir do que o navegador mandou.
const Cupom = require("../models/cupom");

// O Mercado Pago não cobra valores menores que isso; um cupom de 100% vira R$ 1,00.
const VALOR_MINIMO_COBRANCA = 1;
const CURSOS_DO_COMBO = ["A1", "A2", "B1", "B2"];

const normalizarCodigo = c => String(c || "").toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 30);
const arred = v => Math.round(v * 100) / 100;

function motivoInvalido(cupom, curso, plano) {
  if (!cupom || !cupom.ativo) return "Cupom inválido.";
  if (cupom.validoAte && cupom.validoAte < new Date()) return "Este cupom expirou.";
  if (cupom.usoMaximo !== null && cupom.usoMaximo !== undefined && cupom.usosAtuais >= cupom.usoMaximo) return "Este cupom já atingiu o limite de usos.";
  if (cupom.cursos?.length && curso) {
    // O combo "Do A1 ao B2" aceita cupons de qualquer um dos seus níveis.
    const cursosPedido = curso === "A1-B2" ? ["A1-B2", ...CURSOS_DO_COMBO] : [curso];
    if (!cursosPedido.some(c => cupom.cursos.includes(c))) return "Este cupom não vale para este curso.";
  }
  if (cupom.planos?.length && plano && !cupom.planos.includes(plano)) return "Este cupom não vale para este plano.";
  return null;
}

function calcularDesconto(cupom, preco) {
  const bruto = cupom.tipo === "percentual" ? preco * (cupom.valor / 100) : cupom.valor;
  const desconto = arred(Math.max(0, Math.min(bruto, preco)));
  const valorFinal = preco > 0 ? arred(Math.max(VALOR_MINIMO_COBRANCA, preco - desconto)) : 0;
  return { desconto: arred(preco - valorFinal), valorFinal };
}

// Devolve { cupom, desconto, valorFinal }; sem código, devolve o preço cheio.
// Lança Error com mensagem amigável quando o código não é aceito.
async function aplicarCupom(codigo, preco, curso, plano) {
  const cod = normalizarCodigo(codigo);
  if (!cod) return { cupom: null, desconto: 0, valorFinal: preco };
  const cupom = await Cupom.findOne({ codigo: cod });
  const motivo = motivoInvalido(cupom, curso, plano);
  if (motivo) throw new Error(motivo);
  return { cupom, ...calcularDesconto(cupom, preco) };
}

module.exports = { aplicarCupom, calcularDesconto, motivoInvalido, normalizarCodigo, VALOR_MINIMO_COBRANCA };
