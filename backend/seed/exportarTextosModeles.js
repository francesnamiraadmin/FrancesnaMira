// Exporta as falas dos modelos do Ambiente de Produção para gerar os áudios com Coqui TTS
// (scripts_tts/gerar_audios_modeles.py). Cada item é "A|texto" (candidat(e)/textos) ou
// "B|texto" (examinateur) — exatamente as unidades que o app toca (public/js/producaoApp.js:
// falas inteiras do diálogo T2, frases dos monólogos e das produções escritas, perguntas e
// respostas do examinador). O app acha o arquivo por sha256 dessa chave.
//
// Uso: node backend/seed/exportarTextosModeles.js <saida.json> [--faltantes]
//   --faltantes: inclui também as frases que o app registrou sem áudio (modelos da IA etc.),
//                lidas do MongoDB (MONGO_URI de backend/.env).
const fs = require("fs");
const path = require("path");
const M = require("../utils/modelesTCF");

// IDÊNTICA a dividirFrases do app (e a dividirFrases_ do Audio.gs do script).
function dividirFrases(texto) {
  let saida = [];
  String(texto || "").split(/\n+/).forEach(par => {
    const frases = [];
    const partes = par.trim().match(/[^.!?…]+(?:[.!?…]+[»")\]]*)?/g) || [];
    partes.forEach(p => {
      p = p.trim();
      if (!p) return;
      if (frases.length && (/^[a-zà-ÿ,;:)»]/.test(p) || !/[A-Za-zÀ-ÿ]/.test(p))) frases[frases.length - 1] += " " + p;
      else frases.push(p);
    });
    saida = saida.concat(frases);
  });
  return saida;
}

const chaves = new Set();
const add = (voz, t) => { t = String(t || "").trim(); if (t && /[A-Za-zÀ-ÿ]/.test(t)) chaves.add(voz + "|" + t); };
const fala = (voz, t) => { add(voz, t); dividirFrases(t).forEach(f => add(voz, f)); };

function doModelo(tache, m) {
  if (tache === "T2") {
    (m.ech || []).forEach(x => { fala("A", x.q); fala("B", x.r); });
    fala("A", m.fin);
  } else if (tache === "T1" || tache === "T3") {
    (m.etapes || []).forEach(t => dividirFrases(t).forEach(f => add("A", f)));
    (m.rel || []).forEach(x => { fala("B", x.q); fala("A", x.r); });
  } else {
    String(m.p || "").split(/\n+/).map(l => l.trim()).filter(Boolean).forEach(l => dividirFrases(l).forEach(f => add("A", f)));
  }
}

async function main() {
  const saida = process.argv[2];
  if (!saida) { console.error("Uso: node backend/seed/exportarTextosModeles.js <saida.json> [--faltantes]"); process.exit(1); }
  for (const t of M.TACHES) M.modelosManuais(t).forEach(m => doModelo(t, m));
  M.MODELES.atelier.forEach(m => doModelo(m.tache, m));
  // fórmulas de abertura/fechamento da página "Attentes du professeur"
  add("A", "Bonjour Madame, aujourd'hui j'aborderai un sujet très intéressant qui porte sur [le sujet]. Alors, selon moi, c'est une discussion actuelle qui suscite, en effet, encore de nombreux débats.");
  add("A", "Je vous remercie, Madame, de votre attention. Avez-vous des questions ?");
  const antes = chaves.size;
  if (process.argv.includes("--faltantes")) {
    require("dotenv").config({ path: path.join(__dirname, "..", ".env"), quiet: true });
    const mongoose = require("mongoose");
    await mongoose.connect(process.env.MONGO_URI);
    const { ModeleIA, ConfigModelesTCF } = require("../models/modelesTCF");
    for (const x of await ModeleIA.find({}).lean()) doModelo(x.tache, x.modelo);
    const cfg = await ConfigModelesTCF.findOne({ chave: "geral" }).lean();
    Object.values(cfg?.audiosFaltantes || {}).forEach(c => chaves.add(c));
    await mongoose.disconnect();
  }
  fs.writeFileSync(saida, JSON.stringify([...chaves], null, 0));
  console.log(`${chaves.size} falas (${antes} dos modelos escritos à mão${chaves.size > antes ? `, ${chaves.size - antes} dos modelos da IA/faltantes` : ""}) → ${saida}`);
}
main().catch(e => { console.error(e); process.exit(1); });
