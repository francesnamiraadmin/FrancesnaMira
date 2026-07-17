const Questao = require("../models/questao");
const Tentativa = require("../models/tentativa");

const ORDEM_NIVEL = { A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6 };
const TOTAL_MATERIAS = Questao.MATERIAS.length; // 8 categorias possíveis hoje

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
//
// Quando `alunoId` é passado (só a rota de personalizado tem esse contexto — o seed de
// conjuntos oficiais não tem aluno nenhum), o sorteio PRIORIZA questões que esse aluno
// ainda não respondeu em nenhuma Tentativa finalizada (de qualquer Conjunto, não só
// deste — a mesma questão pode aparecer sorteada em conjuntos diferentes). Só entram
// questões já respondidas se não houver inéditas suficientes pra completar a quantidade
// pedida, pra nunca devolver menos questões do que o aluno escolheu.
async function sortearQuestoes({ niveis, materias, quantidade, pool = "praticar", alunoId }) {
  const filtro = { pool, ativo: true };
  if (niveis?.length) filtro.nivel = { $in: niveis };
  if (materias?.length) filtro.materia = { $in: materias };

  const candidatas = await Questao.find(filtro).select("_id");
  if (candidatas.length < quantidade) {
    const erro = new Error(`Só há ${candidatas.length} questão(ões) disponível(is) para esses filtros — peça uma quantidade menor ou amplie os filtros.`);
    erro.status = 422;
    throw erro;
  }

  let ineditas = candidatas, jaRespondidas = [];
  if (alunoId) {
    const respondidasIds = new Set(
      (await Tentativa.find({ alunoId }).distinct("respostas.questaoId")).map(String)
    );
    ineditas = candidatas.filter(q => !respondidasIds.has(String(q._id)));
    jaRespondidas = candidatas.filter(q => respondidasIds.has(String(q._id)));
  }

  const sorteadas = embaralhar(ineditas).concat(embaralhar(jaRespondidas)).slice(0, quantidade);
  return sorteadas.map((q, i) => ({ questaoId: q._id, ordem: i }));
}

// Deriva `filtros.{niveis,materias}` a partir da união real de nível/matéria das
// questões que compõem o conjunto — usado tanto na curadoria manual de conjuntos
// oficiais (admin) quanto no seed/migração do catálogo pré-montado. Nunca confiar no
// filtro de ENTRADA que gerou o sorteio (ex.: "todas as matérias" = filtro vazio na
// busca, mas a união real das questões sorteadas quase sempre tem só um subconjunto
// das 8 categorias) — foi exatamente essa confusão que gerou o bug de `filtros.materias`
// vazio nos conjuntos "Nível X" do catálogo inicial.
async function derivarFiltrosDeQuestoes(questaoIds) {
  const questoes = await Questao.find({ _id: { $in: questaoIds } }).select("nivel materia");
  return {
    niveis: [...new Set(questoes.map(q => q.nivel))],
    materias: [...new Set(questoes.map(q => q.materia))]
  };
}

// Classifica um Conjunto oficial em 3 níveis de prioridade de exibição na aba
// Sugeridos, a partir de `filtros` (que precisa refletir a união REAL de
// nível/matéria das questões — ver derivarFiltrosDeQuestoes acima):
//   1 = um nível só, categorias variadas (ex. "Conjunto 01 – Nível A1")
//   2 = múltiplos níveis, categorias variadas (ex. "A1+A2" misto)
//   3 = tema único, qualquer quantidade de níveis (ex. "Gramática A1")
// "Variada" = 4 ou mais das 8 categorias possíveis presentes — limiar arbitrário mas
// deliberadamente conservador, pra não confundir um conjunto de 2-3 temas correlatos
// (ex. "Vocabulário + Conjugação + Expressões") com um conjunto de prática geral.
function classificarPrioridade(conjunto) {
  const nivelCount = conjunto.filtros?.niveis?.length || 0;
  const materiaCount = conjunto.filtros?.materias?.length || 0;
  const variada = materiaCount >= Math.min(4, TOTAL_MATERIAS);
  if (nivelCount === 1 && variada) return 1;
  if (nivelCount >= 2 && variada) return 2;
  return 3;
}

module.exports = { derivarDificuldade, sortearQuestoes, derivarFiltrosDeQuestoes, classificarPrioridade };
