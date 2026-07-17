const Questao = require("../models/questao");

const ORDEM_NIVEL = { A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6 };

// Deriva a dificuldade do conjunto a partir do nível mais alto presente na seleção —
// usado só na criação de conjuntos personalizados (admin define manualmente em oficiais).
function derivarDificuldade(niveis) {
  const maisAlto = niveis.reduce((max, n) => (ORDEM_NIVEL[n] > ORDEM_NIVEL[max] ? n : max), niveis[0]);
  if (["A1", "A2"].includes(maisAlto)) return "facil";
  if (["B1", "B2"].includes(maisAlto)) return "medio";
  return "dificil";
}

// Embaralha uma cópia do array (Fisher-Yates) sem mutar o original.
function embaralhar(lista) {
  const copia = lista.slice();
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

// Sorteia `quantidade` questões do pool "praticar" que atendam aos filtros de
// níveis/matérias e fixa a ordem — usado na criação de um Conjunto personalizado.
// Lança um erro com `.status = 422` se o pool filtrado tiver menos questões que o pedido,
// pra rota poder devolver esse status sem criar um conjunto incompleto silenciosamente.
async function sortearQuestoes({ niveis, materias, quantidade, pool = "praticar" }) {
  const filtro = { pool, ativo: true };
  if (niveis?.length) filtro.nivel = { $in: niveis };
  if (materias?.length) filtro.materia = { $in: materias };

  const candidatas = await Questao.find(filtro).select("_id");
  if (candidatas.length < quantidade) {
    const erro = new Error(`Só há ${candidatas.length} questão(ões) disponível(is) para esses filtros — peça uma quantidade menor ou amplie os filtros.`);
    erro.status = 422;
    throw erro;
  }

  const sorteadas = embaralhar(candidatas).slice(0, quantidade);
  return sorteadas.map((q, i) => ({ questaoId: q._id, ordem: i }));
}

module.exports = { derivarDificuldade, sortearQuestoes };
