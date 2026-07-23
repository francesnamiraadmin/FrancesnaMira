const { TIPOS_CURSO } = require("./tiposCurso");

// Pack Prestige por curso — R$300 fixo por curso, mesmos 3 benefícios (Plataforma de
// Questões, Aulas Especializadas gravadas, Ambiente de Produção Textual) escopados a UM
// curso só. Substitui o antigo Pack Prestige avulso/cross-curso (produto único, vendido
// fora de qualquer curso, com upgrades entre 3 produtos a R$65/R$65/R$110) — quem já
// tinha o avulso mantém acesso via User.legado.produtosAvulsos (ver migrarPlanosUsuarios.js).
const PRECO_PACK_PRESTIGE_POR_CURSO = Object.fromEntries(TIPOS_CURSO.map(c => [c, 300]));

// Pseudo-curso especial: combo "Do A1 ao B2" — um único Pack Prestige que libera A1, A2,
// B1 e B2 simultaneamente (ver backend/routes/pagamentos.js#ativarPackPrestigeCombo).
// Não é um courseType real, nunca aparece em TIPOS_CURSO nem em User.planos[].courseType.
const CURSO_COMBO_FLUENCIA = "A1-B2";
const CURSOS_DO_COMBO_FLUENCIA = ["A1", "A2", "B1", "B2"];
const PRECO_PACK_PRESTIGE_COMBO = 500;

function precoPackPrestige(curso) {
  if (curso === CURSO_COMBO_FLUENCIA) return PRECO_PACK_PRESTIGE_COMBO;
  const preco = PRECO_PACK_PRESTIGE_POR_CURSO[curso];
  if (preco === undefined) throw new Error("Curso inválido para o Pack Prestige.");
  return preco;
}

module.exports = {
  PRECO_PACK_PRESTIGE_POR_CURSO, precoPackPrestige,
  CURSO_COMBO_FLUENCIA, CURSOS_DO_COMBO_FLUENCIA, PRECO_PACK_PRESTIGE_COMBO
};
