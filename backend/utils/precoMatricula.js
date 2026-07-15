// Fórmula única de preço para o fluxo de matrícula por horários (Particular/Turma).
// Fonte de verdade no servidor — nunca confiar num valor calculado no cliente.

const VALOR_BASE_AULA = 400; // R$ por aula semanal/mês, plano Essentiel
const DESCONTO_POR_QTD = { 1: 0, 2: 0.05, 3: 0.10, 4: 0.15 };
const ADICIONAL_AVANCE = 90;
const ADICIONAL_EXCELLENCE = 100;

function precoEssentiel(numAulas) {
  const desconto = DESCONTO_POR_QTD[numAulas];
  if (desconto === undefined) throw new Error("Quantidade de aulas semanais inválida (permitido: 1 a 4).");
  return Math.ceil(numAulas * VALOR_BASE_AULA - desconto * VALOR_BASE_AULA);
}

function precoPorTier(numAulas, tier) {
  const essentiel = precoEssentiel(numAulas);
  if (tier === "Essentiel") return essentiel;
  const avance = essentiel + ADICIONAL_AVANCE;
  if (tier === "Avancé") return avance;
  if (tier === "Excellence") return avance + ADICIONAL_EXCELLENCE;
  throw new Error("Plano inválido.");
}

module.exports = { VALOR_BASE_AULA, DESCONTO_POR_QTD, ADICIONAL_AVANCE, ADICIONAL_EXCELLENCE, precoEssentiel, precoPorTier };
