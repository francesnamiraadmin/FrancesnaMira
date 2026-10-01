// Importa o conteúdo pedagógico do app "Modèles TCF" (Google Apps Script, clonado com
// `clasp clone 1MJCDyTtoG9hXPwMAuzeX7XGmWE3CLhdXWeEKd-yZzUgrW_ZaZszFCuS4`) para
// backend/data/modeles/*.json, que é o que o Ambiente de Produção do site lê.
// Os .gs são JS puro que só declaram variáveis: rodam num sandbox e os valores são salvos.
//
// Uso: node backend/seed/importarModelesTCF.js <pasta-do-clone-clasp>
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const origem = process.argv[2];
if (!origem || !fs.existsSync(path.join(origem, "Outils.js"))) {
  console.error("Uso: node backend/seed/importarModelesTCF.js <pasta do clone do Apps Script>");
  process.exit(1);
}
const destino = path.join(__dirname, "..", "data", "modeles");
fs.mkdirSync(destino, { recursive: true });

const ARQUIVOS = ["Outils.js", "Orale.js", "Ecrite.js", "Sujets_orale_T1T2.js", "Sujets_Orale_T3.js", "Entrainement.js", "Atleier.js", "Vocbulaire.js", "Tendances.js"];
const ctx = vm.createContext({ console });
for (const f of ARQUIVOS) {
  // `var X = ...` no topo vira propriedade do contexto; funções que dependem do Apps Script
  // (SpreadsheetApp etc.) só são declaradas, nunca chamadas.
  vm.runInContext(fs.readFileSync(path.join(origem, f), "utf8"), ctx, { filename: f });
}

const salvar = (nome, dados) => {
  fs.writeFileSync(path.join(destino, nome), JSON.stringify(dados, null, 1) + "\n");
  console.log(`${nome}: ${(JSON.stringify(dados).length / 1024).toFixed(0)} KB`);
};
const v = k => JSON.parse(JSON.stringify(ctx[k]));

salvar("eixos.json", { eixos: v("EIXOS_TCF"), ordem: v("ORDEM_EIXOS"), prioridade: v("PRIORIDADE_EIXOS"), tendances: v("TENDANCES") });
salvar("outils.json", { boite: v("BOITE_OUTILS"), connecteurs: v("CONNECTEURS"), trames: v("TRAMES_TCF"), surlignage: v("SURLIGNAGE") });
salvar("sujets.json", { orale: v("SUJETS_ORALE"), ecrite: v("SUJETS_ENTRAINEMENT") });
salvar("modeles.json", { orale: v("MODELES_ORALE"), ecrite: v("MODELES_ECRITE"), atelier: v("ATELIER_DICTEE") });
salvar("vocab.json", { temas: v("TEMAS_VOCAB"), renomear: v("RENOMEAR_TEMAS"), cartas: v("VOCAB_INICIAL"), novasPorDia: v("NOVAS_POR_DIA"), acertosSair: v("ACERTOS_SAIR_VOCAB") });
