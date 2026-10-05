// =====================================================================
// Tradução do site para o francês (Configurações › Idioma › Français).
// O navegador (public/js/traducaoSite.js) junta os textos em português que aparecem na tela e pede
// a tradução aqui. Cada texto é traduzido uma única vez pela IA e fica guardado (TraducaoSite),
// valendo para todos os alunos; o dicionário fixo public/i18n/site-fr.json cobre as páginas comuns.
//   POST /api/traducao/fr  { textos: ["...", ...] }  →  { traducoes: { "<texto>": "<tradução>" } }
// =====================================================================
const express = require("express");
const crypto = require("crypto");
const mongoose = require("mongoose");
const { pedirJson, iaConfigurada } = require("../utils/claude");

const router = express.Router();

const TraducaoSite = mongoose.models.TraducaoSite || mongoose.model("TraducaoSite", new mongoose.Schema({
  chave: { type: String, unique: true, index: true },   // sha1 do texto em português
  texto: String,
  fr: String,
  criadoEm: { type: Date, default: Date.now }
}));

const MAX_TEXTOS = 80, MAX_TAMANHO = 3000, MAX_TOTAL = 24000, LOTE_IA = 40;
const chaveDe = t => crypto.createHash("sha1").update(t).digest("hex");
const emAndamento = new Map();   // chave → Promise (o mesmo texto pedido por várias pessoas ao mesmo tempo)

const SISTEMA = `Você traduz a interface e os textos de um site brasileiro de preparação para provas de francês (TCF, DELF, DALF, TEF) do português do Brasil para o francês da França.
Regras:
- Você recebe {"textos": {"1": "...", "2": "...", ...}}. Responda só com JSON: {"t": {"1": "tradução do 1", "2": "tradução do 2", ...}} — uma tradução para CADA identificador, cada uma correspondendo exatamente ao texto do mesmo identificador (nunca misture nem desloque itens).
- Nomes de idiomas numa lista de escolha de idioma (« Português (Brasil) », « Français ») ficam como estão.
- Tradução natural e idiomática, no registro de um site educativo (vouvoiement com o aluno).
- Mantenha exatamente: números, datas, horários, valores (R$), e-mails, links, emojis, símbolos (→ · ✓ ★ …), espaços nas pontas, maiúsculas de siglas.
- Não traduza: "Francês na Mira" (nome da escola), nomes de pessoas, siglas (TCF, DELF, DALF, TEF, CO, CE, EE, EO, PO, PE, NCLC, IA → IA vira "IA"), nomes de planos (Essentiel, Avancé, Excellence, Pack Prestige).
- "Meu Espaço" → "Mon Espace"; "Ambiente de Produção" → "Espace de Production"; "Plataforma de Questões" → "Plateforme de Questions"; "Aulas Especializadas" → "Cours Spécialisés"; "Dever de casa" → "Devoirs".
- Se o texto já estiver em francês (ou não tiver nada a traduzir), devolva-o igual.`;

// Cada texto vai com um identificador e a resposta volta por identificador: se a IA pular ou juntar um item,
// só aquele fica sem tradução (com uma lista simples, todos os seguintes sairiam trocados).
async function traduzirLote(textos) {
  const entrada = Object.fromEntries(textos.map((x, i) => [String(i + 1), x]));
  const { json } = await pedirJson({ sistema: SISTEMA, usuario: JSON.stringify({ textos: entrada }), maxTokens: 8000 });
  const t = json && json.t && typeof json.t === "object" && !Array.isArray(json.t) ? json.t : {};
  return textos.map((x, i) => {
    const v = t[String(i + 1)];
    if (typeof v !== "string" || !v.trim()) return null;
    // números do original precisam estar na tradução (sinal de que é a frase certa)
    const nums = s => (s.match(/\d+/g) || []).map(Number).sort((a, b) => a - b).join(",");
    if (/\d/.test(x) && nums(x) !== nums(v) && !/\b(1|um|uma)\b/i.test(x)) return null;
    return v;
  });
}

router.post("/fr", async (req, res) => {
  try {
    let textos = Array.isArray(req.body?.textos) ? req.body.textos : [];
    textos = [...new Set(textos.filter(t => typeof t === "string").map(t => t.slice(0, MAX_TAMANHO)).filter(t => /\p{L}/u.test(t)))].slice(0, MAX_TEXTOS);
    let total = 0;
    textos = textos.filter(t => (total += t.length) <= MAX_TOTAL);
    if (!textos.length) return res.json({ traducoes: {} });

    const chaves = textos.map(chaveDe);
    const salvos = await TraducaoSite.find({ chave: { $in: chaves } }).select("chave fr").lean();
    const porChave = Object.fromEntries(salvos.map(s => [s.chave, s.fr]));
    const traducoes = {};
    const faltam = [];
    textos.forEach((t, i) => { if (porChave[chaves[i]] != null) traducoes[t] = porChave[chaves[i]]; else faltam.push(t); });

    if (faltam.length && iaConfigurada()) {
      // textos já em tradução por outro pedido: espera aquele resultado
      const proprios = [], esperas = [];
      for (const t of faltam) { const k = chaveDe(t); if (emAndamento.has(k)) esperas.push([t, emAndamento.get(k)]); else proprios.push(t); }
      for (let i = 0; i < proprios.length; i += LOTE_IA) {
        const lote = proprios.slice(i, i + LOTE_IA);
        const promessa = traduzirLote(lote);
        lote.forEach((t, j) => emAndamento.set(chaveDe(t), promessa.then(r => r[j])));
        try {
          const r = await promessa;
          const docs = [];
          lote.forEach((t, j) => { if (r[j] != null) { traducoes[t] = r[j]; docs.push({ chave: chaveDe(t), texto: t, fr: r[j] }); } });
          if (docs.length) await TraducaoSite.bulkWrite(docs.map(d => ({ updateOne: { filter: { chave: d.chave }, update: { $setOnInsert: d }, upsert: true } })), { ordered: false }).catch(() => {});
        } catch (e) { console.error("Tradução (IA):", e.message); }
        finally { lote.forEach(t => emAndamento.delete(chaveDe(t))); }
      }
      for (const [t, p] of esperas) { const v = await p.catch(() => null); if (v != null) traducoes[t] = v; }
    }
    res.json({ traducoes });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro na tradução." });
  }
});

module.exports = router;
module.exports.TraducaoSite = TraducaoSite;
