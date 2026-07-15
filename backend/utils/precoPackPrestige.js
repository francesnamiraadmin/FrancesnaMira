// Fórmula única de preço para o Pack Prestige (Plataforma de Questões, Ambiente de Produção
// Oral e Textual, Aulas Especializadas Online) — fonte de verdade no servidor.

const PRODUTOS_PACK_PRESTIGE = {
  "Plataforma de Questões": { chave: "plataforma", preco: 65 },
  "Ambiente de Produção Oral e Textual": { chave: "producao", preco: 65 },
  "Aulas Especializadas Online": { chave: "aulasEspecializadas", preco: 110 }
};

// O preço de upgrade da Plataforma e da Produção é R$55 (não R$30) para que o total feche
// igual não importa qual produto é o principal — ver backend/utils/precoPackPrestige.test
// mentalmente: 2-a-2 e os 3 juntos dão sempre o mesmo valor combinando com qualquer um
// como principal (ex.: Plataforma+Aulas = Aulas+Plataforma = R$165; os 3 juntos = R$220).
const PRECO_UPGRADE = { plataforma: 55, producao: 55, aulasEspecializadas: 100 };

function precoPackPrestige(produtoPrincipal, upgrades) {
  const principal = PRODUTOS_PACK_PRESTIGE[produtoPrincipal];
  if (!principal) throw new Error("Produto inválido para o Pack Prestige.");

  const chavesUpgrade = Array.from(new Set(upgrades || [])).filter(k => k !== principal.chave);
  let total = principal.preco;
  for (const k of chavesUpgrade) {
    if (PRECO_UPGRADE[k] === undefined) throw new Error("Upgrade inválido.");
    total += PRECO_UPGRADE[k];
  }
  return total;
}

// Chaves de entitlement liberadas por essa compra (produto principal + upgrades escolhidos).
function chavesLiberadas(produtoPrincipal, upgrades) {
  const principal = PRODUTOS_PACK_PRESTIGE[produtoPrincipal];
  if (!principal) throw new Error("Produto inválido para o Pack Prestige.");
  const chavesUpgrade = Array.from(new Set(upgrades || [])).filter(k => k !== principal.chave && PRECO_UPGRADE[k] !== undefined);
  return Array.from(new Set([principal.chave, ...chavesUpgrade]));
}

module.exports = { PRODUTOS_PACK_PRESTIGE, PRECO_UPGRADE, precoPackPrestige, chavesLiberadas };
