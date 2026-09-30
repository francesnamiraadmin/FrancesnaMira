// Créditos do Ambiente de Produção Oral e Textual.
// Quem passa a ter o ambiente pela primeira vez (compra de um plano que o inclui) começa
// com 20 créditos — uma única vez por conta (flag creditosBoasVindasEm).
const User = require("../models/user");
const { cursosComAcesso } = require("../middleware/acessoCurso");

const CREDITOS_BOAS_VINDAS = 20;

async function temAmbienteProducao(userId) {
  return (await cursosComAcesso(userId, "producao")).length > 0;
}

// Roda `ativar` (que grava o plano) e, se o aluno não tinha o ambiente antes e passou a
// ter, credita as boas-vindas. Devolve true quando os créditos foram concedidos agora.
async function ativarComBoasVindas(userId, ativar) {
  const tinhaAntes = await temAmbienteProducao(userId);
  await ativar();
  if (tinhaAntes || !(await temAmbienteProducao(userId))) return false;
  const r = await User.updateOne(
    { _id: userId, creditosBoasVindasEm: null },
    { $inc: { creditosCorrecao: CREDITOS_BOAS_VINDAS }, $set: { creditosBoasVindasEm: new Date() } }
  );
  return r.modifiedCount === 1;
}

module.exports = { CREDITOS_BOAS_VINDAS, ativarComBoasVindas, temAmbienteProducao };
