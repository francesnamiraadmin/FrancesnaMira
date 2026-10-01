// Conteúdo e regras do Ambiente de Produção no modelo do app "Modèles TCF" (Apps Script):
// eixos, trames, sujets de exame, modelos escritos à mão, pesos do sorteio (Tendances.gs),
// modèle-guide e os prompts de geração de modelo e de correção (Generation.gs / Code.gs).
// Os dados vêm de backend/data/modeles/*.json (backend/seed/importarModelesTCF.js).
const path = require("path");

const DIR = path.join(__dirname, "..", "data", "modeles");
const EIXOS = require(path.join(DIR, "eixos.json"));
const OUTILS = require(path.join(DIR, "outils.json"));
const SUJETS = require(path.join(DIR, "sujets.json"));
const MODELES = require(path.join(DIR, "modeles.json"));

const TACHES = ["T1", "T2", "T3", "ET1", "ET2", "ET3"];
const LIMITES_ESCRITA = { ET1: [60, 120], ET2: [120, 150], ET3: [120, 180] };
const DURACAO_ORAL = { T1: 120, T2: 210, T3: 270 };
const DURACAO_EPREUVE_MIN = 60;
const NOMES_TACHE = {
  T1: "Tâche 1 orale · Entretien dirigé", T2: "Tâche 2 orale · Exercice en interaction", T3: "Tâche 3 orale · Expression d'un point de vue",
  ET1: "Tâche 1 écrite · Message court", ET2: "Tâche 2 écrite · Récit, article ou lettre", ET3: "Tâche 3 écrite · Texte argumentatif"
};
const TIPOS_DEVOIR = { dictee: "Dictée", etude: "Étudier le modèle", oral: "S'entraîner à l'oral", ecrit: "Réécrire et faire corriger" };
const CRITERES = {
  PE: ["Réalisation de la tâche", "Cohérence", "Cohésion", "Lexique", "Grammaire", "Orthographe"],
  PO: ["Réalisation de la tâche", "Cohérence", "Lexique", "Grammaire", "Prononciation", "Fluidité et interaction"]
};

const ehEscrita = t => String(t).indexOf("ET") === 0;
const semAcento = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const contarPalavras = s => (String(s || "").match(/[A-Za-zÀ-ÿœŒ0-9]+(?:['’-][A-Za-zÀ-ÿœŒ0-9]+)*/g) || []).length;
const semTravessao = t => String(t || "").replace(/\s*[—–]\s*/g, ", ").replace(/,\s*,/g, ",");
function semTravessaoObj(o) {
  if (typeof o === "string") return semTravessao(o);
  if (Array.isArray(o)) return o.map(semTravessaoObj);
  if (o && typeof o === "object") { const r = {}; for (const k of Object.keys(o)) r[k] = semTravessaoObj(o[k]); return r; }
  return o;
}

function nclc(nota) {
  nota = Number(nota);
  if (isNaN(nota)) return "";
  if (nota >= 16) return "10"; if (nota >= 14) return "9"; if (nota >= 12) return "8";
  if (nota >= 10) return "7"; if (nota >= 7) return "6"; if (nota >= 6) return "5"; if (nota >= 4) return "4";
  return "< 4";
}

const sujetsDaTache = t => (ehEscrita(t) ? SUJETS.ecrite[t] : SUJETS.orale[t]) || [];
const modelosManuais = t => (ehEscrita(t) ? MODELES.ecrite[t] : MODELES.orale[t]) || [];
const atelierDaTache = t => MODELES.atelier.filter(m => m.tache === t);

// Índice id → { tache, tema } (modelos manuais, atelier e sujets de exame).
const INDICE = new Map();
for (const t of TACHES) {
  for (const m of modelosManuais(t)) INDICE.set(t + "|" + m.id, { tache: t, tema: m, manual: true });
  for (const m of atelierDaTache(t)) INDICE.set(t + "|" + m.id, { tache: t, tema: m, manual: true });
  for (const s of sujetsDaTache(t)) if (!INDICE.has(t + "|" + s.id)) INDICE.set(t + "|" + s.id, { tache: t, tema: s });
}
const acharTema = (t, id) => (INDICE.get(t + "|" + id) || {}).tema || null;
const ehManual = (t, id) => !!(INDICE.get(t + "|" + id) || {}).manual;
function temaEmQualquerTache(id) {
  for (const t of TACHES) { const x = acharTema(t, id); if (x) return { tache: t, tema: x }; }
  return null;
}
// Consigne de um tema, qualquer que seja a origem.
const consigneDe = tema => (tema && (tema.c || tema.t || tema.titre)) || "";

// ---------------- sorteio (Tendances.gs) ----------------
const REGEX_TEND = {};
for (const t of Object.keys(EIXOS.tendances)) if (Array.isArray(EIXOS.tendances[t])) REGEX_TEND[t] = EIXOS.tendances[t].map(p => new RegExp(p, "i"));
const ehTendencia = (t, texto) => (REGEX_TEND[t] || []).some(rx => rx.test(texto || ""));
function pesoTema(t, s, temasMes) {
  const f = Number(s.f) || 1, anos = s.a || [];
  const recencia = anos.includes(2026) ? 1.5 : anos.includes(2025) ? 1.2 : 1;
  const eixo = EIXOS.prioridade[s.e] || 1;
  const tend = ehTendencia(t, `${s.t || ""} ${s.titre || ""} ${s.c || ""}`) ? 2.5 : 1;
  const mes = temasMes && temasMes[s.id] ? 2 : 1;
  return Math.round((1 + Math.log(1 + f)) * recencia * eixo * tend * mes * 100) / 100;
}

// ---------------- modèle-guide (Generation.gs) ----------------
function subjPlural(v) {
  v = String(v || "agir").trim();
  const irreg = { promouvoir: "promeuvent", garantir: "garantissent", agir: "agissent", rendre: "rendent", mettre: "mettent", "réguler": "régulent" };
  const p = v.split(" "), verbo = p[0];
  p[0] = irreg[verbo] || (/er$/.test(verbo) ? verbo.replace(/er$/, "ent") : /ir$/.test(verbo) ? verbo.replace(/ir$/, "issent") : verbo);
  return p.join(" ");
}
function trecho(t, n) {
  const frase = String(t || "").replace(/\s+/g, " ").split(/(?<=[.!?])\s/)[0] || "";
  const p = frase.split(" ");
  return p.length > n ? p.slice(0, n).join(" ") + "…" : frase.replace(/[.!?]$/, "");
}
function temaCurto(t) {
  t = String(t || "").split(/\s(?=(Rédigez|Écrivez|Vous |Donnez|Présentez|Expliquez)\b)/)[0];
  t = t.split(/(?<=[.?!])\s/)[0];
  if (t.length > 100) t = t.slice(0, 97).replace(/\s+\S*$/, "") + "…";
  return t.replace(/\s*\(.*?\)\s*$/, "").replace(/[?.!]+\s*$/, "").replace(/,?\s*(pour ou contre|avantages et inconvénients)\s*$/i, "").trim();
}

function modeloGuia(tache, sujet) {
  const e = EIXOS.eixos[sujet.e] || EIXOS.eixos.soc || {};
  const pour = (e.argumentsPour || []).slice(0, 3), contre = (e.argumentsContre || []).slice(0, 3), ag = e.agents || ["les pouvoirs publics", "les associations", "les citoyens"];
  const tema = temaCurto(sujet.t).replace(/\s*:\s*$/, "");
  const m = { id: sujet.id, e: sujet.e, f: sujet.f || 1, gerado: true, guia: true, titre: tema.slice(0, 110), c: sujet.t, k: [] };
  const concl = verboBase => `${ag[0] || "les pouvoirs publics"}, en coopération avec ${ag[1] || "les associations"}${ag[2] ? " et " + ag[2] : ""}, ${subjPlural(verboBase || (e.actions || ["mettre en œuvre"])[0])} ${(e.complements || ["des politiques"])[0]} ${e.domaine || "adaptées"}`;
  m.pistes = { pour, contre, docs: [sujet.d1 ? trecho(sujet.d1, 25) : "", sujet.d2 ? trecho(sujet.d2, 25) : ""].filter(Boolean), patron: e.patron || "" };
  if (tache === "ET3") {
    m.d1 = sujet.d1; m.d2 = sujet.d2;
    m.p = [tema,
      `Dans un contexte marqué par les profondes mutations des sociétés contemporaines, [le thème : ${tema.toLowerCase()}] connaît d'importantes transformations. Dès lors, le débat portant sur [la question du sujet] suscite aujourd'hui de vives discussions, tant sur le plan économique que social et culturel.`,
      "À cet égard, il convient de mettre en avant que [X] comporte plusieurs avantages, notamment en matière de [idée principale du document 1], tout en contribuant à [bénéfice concret].",
      "Néanmoins, il convient également de souligner que [X] présente certaines limites, notamment en ce qui concerne [idée a], [idée b] et [idée c du document 2].",
      `Pour répondre durablement à cet enjeu, il est essentiel que ${concl()}. Parvenant ainsi à une société éthique, morale et respectueuse.`].join("\n");
  } else if (tache === "ET2") {
    m.p = ["Madame, Monsieur,", "Je me permets de vous écrire afin de [objet de la lettre, en reprenant les mots de la consigne].",
      "Tout d'abord, [premier élément : faits, lieu, date]. Par ailleurs, [deuxième élément, avec un exemple concret]. De surcroît, [troisième élément qui renforce votre demande ou votre avis].",
      "Compte tenu de ces éléments, [demande précise ou proposition].",
      "Dans l'attente d'une réponse favorable, veuillez agréer, Madame, Monsieur, l'expression de mes salutations distinguées."].join("\n");
  } else if (tache === "ET1") {
    m.p = ["Salut à tous, j'espère que vous allez bien !", "Je vous écris car [objet du message, en reprenant les mots de la consigne].",
      "Voici ce que je vous propose : [lieu], [date et heure], [programme ou description]. Afin de faciliter l'organisation, [détail pratique : prix, transport, ce qu'il faut apporter].",
      "N'hésitez pas à me confirmer votre présence avant [date].", "Qu'en pensez-vous ? À très bientôt !"].join("\n");
  } else if (tache === "T3") {
    m.etapes = [
      `Le sujet qui m'a été proposé est le suivant : « ${tema} ». C'est une question qui [pourquoi elle est actuelle : société, mondialisation, technologie…].`,
      "À mon avis, [votre position claire, en une phrase], même si cette question mérite d'être nuancée.",
      "D'une part, [premier argument favorable + exemple]. De plus, [deuxième argument favorable].",
      "D'autre part, il faut reconnaître que [première limite + exemple]. Par ailleurs, [deuxième limite].",
      `Pour répondre durablement à cet enjeu, il est crucial que ${concl()}. Parvenant ainsi à [résultat attendu].`,
      "Personnellement, [expérience vécue en lien avec le sujet : où, quand, ce que vous avez appris]."];
    m.rel = [{ q: "Et dans votre pays d'origine, comment cette question est-elle vue ?", r: "Dans mon pays, [comparaison avec le Canada]. C'est pourquoi je pense que [conclusion personnelle]." },
      { q: "Pensez-vous que la situation va changer dans les prochaines années ?", r: "Oui, je pense que [évolution possible], surtout grâce à [acteur ou raison]." }];
    m.ctx = { r: e.patron || "Structurez votre avis : position, arguments pour, arguments contre, solution, anecdote.", a: [["Arguments possibles « pour »", pour.join(" · ")], ["Arguments possibles « contre »", contre.join(" · ")]] };
  } else if (tache === "T1") {
    m.rotulos = ["Réponse directe", "Explication", "Exemple concret", "Ouverture"];
    m.etapes = ["Pour répondre à votre question, [réponse directe en une phrase].", "C'est important pour moi parce que [raison 1] et aussi parce que [raison 2].",
      "Par exemple, [situation vécue : où, quand, avec qui].", "D'ailleurs, au Canada, j'aimerais [projet lié à la question]."];
    m.rel = [];
  } else if (tache === "T2") {
    m.reg = "vous";
    m.ech = [
      { q: "Bonjour Madame, je fais appel à vos services car j'ai l'intention de [votre objectif]. Plus précisément, [précision]. Donc, j'aimerais avoir des renseignements concernant [le sujet]. Tout d'abord, pourriez-vous m'expliquer en quoi consiste exactement votre offre ?", r: "Bonjour ! Bien sûr, avec plaisir. Nous proposons [description de l'offre]." },
      { q: "En ce qui concerne les tarifs, combien cela coûte-t-il ?", r: "Le tarif est de [prix] dollars, taxes incluses." },
      { q: "J'aimerais également avoir des précisions concernant les horaires.", r: "Nous sommes ouverts du lundi au vendredi, de 9 h à 18 h." },
      { q: "Étant donné que je n'ai pas de voiture, comment peut-on s'y rendre ?", r: "C'est très simple : le métro est à cinq minutes à pied." },
      { q: "Puisque c'est la première fois, y a-t-il des conditions particulières ?", r: "Il suffit de présenter une pièce d'identité et de réserver à l'avance." },
      { q: "J'avoue que j'hésite encore : est-il possible d'annuler ou de modifier la réservation ?", r: "Oui, sans frais jusqu'à 48 heures avant." },
      { q: "Est-ce que je pourrais payer par carte ?", r: "Tout à fait, nous acceptons les cartes de crédit et de débit." },
      { q: "Une dernière question : comment puis-je réserver ?", r: "Directement sur notre site Internet ou par téléphone." }];
    m.fin = "Parfait, je vous remercie infiniment, madame, de votre attention. Je vais [décision concrète]. Je n'hésiterai pas à vous contacter si j'ai d'autres questions. Je vous souhaite une excellente journée. Au revoir !";
  }
  return m;
}

// ---------------- prompts (Generation.gs / Code.gs) ----------------
function trameEmTexto(tache) {
  const tr = OUTILS.trames[tache];
  if (!tr || !tr.etapes) return "";
  return tr.titulo + (tr.sousTitre ? " : " + tr.sousTitre : "") + "\n" + tr.etapes.map((e, i) => `${i + 1}. ${e.rotulo} : ${e.texte}`).join("\n") + (tr.conseil ? "\nConseil : " + tr.conseil : "");
}
function exemploManual(tache, eixo) {
  const l = modelosManuais(tache);
  const m = l.find(x => x.e === eixo) || l[0];
  if (!m) return "";
  const c = JSON.parse(JSON.stringify(m));
  for (const k of ["id", "e", "f", "docsNovos", "prodNova"]) delete c[k];
  return JSON.stringify(c);
}

function promptModelo(tache, sujet) {
  const eixo = (EIXOS.eixos[sujet.e] || {}).nome || sujet.e;
  let sistema = "Tu es professeur de FLE chez Français na Mira et spécialiste du TCF Canada. Tu rédiges des productions modèles de niveau B2-C1, naturelles, " +
    "idiomatiques et adaptées au contexte canadien (québécois quand c'est pertinent), en suivant STRICTEMENT la méthode et la trame Français na Mira. " +
    "Tu réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, sans Markdown.";
  const comum = ["AXE THÉMATIQUE : " + eixo, "TRAME FRANÇAIS NA MIRA DE LA TÂCHE :\n" + trameEmTexto(tache)];
  const ex = exemploManual(tache, sujet.e);
  let formato;
  if (tache === "T2") {
    formato = [
      "SUJET (consigne de l'examen) : " + sujet.t,
      "Écris le dialogue modèle de la Tâche 2 (exercice en interaction) : le candidat pose 8 questions à l'examinateur, qui répond.",
      "Règles : 1re réplique = ouverture Français na Mira : « Bonjour Madame, je fais appel à vos services car j'ai l'intention de …, plus précisément … Donc, j'aimerais avoir des renseignements concernant … » (ou « Salut ! Je fais appel à tes conseils… » si le registre est tu) + 1re question ;",
      "relances variées : « En ce qui concerne… », « J'aimerais également avoir des précisions concernant… », « Étant donné que… », « Puisque… », « J'avoue que… », « Une dernière question : … » ;",
      "conditionnel de politesse ; registre tu ou vous selon le rôle ; réponses de l'examinateur naturelles, concrètes (prix en dollars, lieux, horaires), 1 à 3 phrases ;",
      "clôture Français na Mira : « Parfait, je vous remercie infiniment, madame, de votre attention. Je vais [décision concrète]. Je n'hésiterai pas à vous contacter si j'ai d'autres questions. Je vous souhaite une excellente journée. Au revoir ! » (adapter tu/vous).",
      'JSON : {"titre": "titre court en français", "reg": "tu" ou "vous", "c": "la consigne reformulée comme à l\'examen (Je suis… Vous… Vous me posez des questions…)",',
      ' "ech": [{"q": "question du candidat", "r": "réponse de l\'examinateur"}] (exactement 8), "fin": "réplique de clôture du candidat",',
      ' "ctx": "note culturelle canadienne utile pour ce sujet (1 ou 2 phrases)", "k": ["8 à 12 mots-clés du thème présents mot pour mot dans le dialogue"]}'];
  } else if (tache === "T3" || tache === "T1") {
    const t1 = tache === "T1";
    formato = [
      (t1 ? "QUESTION DE L'ENTRETIEN DIRIGÉ : " : "SUJET : ") + sujet.t,
      t1 ? "Écris la réponse modèle du candidat (1 min 30 à 2 min, environ 180 à 230 mots), personnelle, au présent, passé composé et futur proche, en 4 étapes : Réponse directe, Explication, Exemple concret, Ouverture. Si la question demande une présentation, suis l'introduction personnelle Français na Mira : prénom et âge, origine et lieu de vie, études et profession, famille, loisirs, projet au Canada."
        : "Écris le monologue modèle de la Tâche 3 (environ 280 à 320 mots) en 6 étapes, exactement dans l'ordre de la trame : Ouverture, Thèse, Arguments +, Arguments −, Conclusion (boîte à outils : « Pour répondre durablement à cet enjeu, il est crucial que [agent], en coopération avec [agent], [action au subjonctif] [complément] [domaine]. Parvenant ainsi à … »), Anecdote personnelle.",
      "Explique aussi le contexte du sujet (culturel, politique, économique, social, mondialisation, mobilité, inégalités… selon le cas) pour que l'élève comprenne les enjeux.",
      `JSON : {"titre": "titre court", "etapes": ["texte de chaque étape"] (${t1 ? "4" : "6"} éléments), ${t1 ? '"rotulos": ["Réponse directe", "Explication", "Exemple concret", "Ouverture"], ' : ""}` +
      '"rel": [{"q": "question de relance de l\'examinateur", "r": "réponse possible du candidat"}] (2 éléments),',
      ' "ctx": {"r": "résumé du contexte en 1 ou 2 phrases", "a": [["aspect (ex. Politique)", "explication"]] (4 éléments)}, "k": ["10 à 14 mots-clés présents mot pour mot dans le texte"]}'];
  } else {
    const lim = LIMITES_ESCRITA[tache];
    formato = [
      "CONSIGNE : " + sujet.t,
      sujet.d1 ? "DOCUMENT 1 : " + sujet.d1 + "\nDOCUMENT 2 : " + sujet.d2 : "",
      `Écris la production modèle en respectant la trame, le registre (tu/vous, formules d'ouverture et de clôture) et STRICTEMENT entre ${lim[0]} et ${lim[1]} mots (vise ${Math.round(lim[1] * 0.88)} mots).`,
      tache === "ET3" ? "Tâche 3 : un titre, puis EXACTEMENT 4 paragraphes selon le modèle Français na Mira :\n" +
        "1) Introduction : « Dans un contexte marqué par les profondes mutations des sociétés contemporaines, [X] connaît d'importantes transformations. Dès lors, le débat portant sur [sujet] suscite aujourd'hui de vives discussions, tant sur le plan économique que social et culturel. »\n" +
        "2) Thèse : « À cet égard, il convient de mettre en avant que [X] comporte plusieurs avantages, notamment en matière de …, tout en contribuant à … » (arguments du document favorable)\n" +
        "3) Antithèse : « Néanmoins, il convient également de souligner que [X] présente certaines limites, notamment en ce qui concerne a, b et c. » (arguments du document critique)\n" +
        "4) Conclusion : « Pour répondre durablement à cet enjeu, il est essentiel que les [AGENT], en coopération avec [AGENT 2] et [AGENT 3], mettent en œuvre [mesure]… Parvenant ainsi à … »\n" +
        "Reprends les mots-clés des deux documents." :
      tache === "ET2" ? "Tâche 2 (lettre, article ou message de 120 à 150 mots) : formule d'appel adaptée (« Madame, Monsieur, » pour une lettre formelle), « Je me permets de vous écrire… / Je vous écris afin de… », organisation « Tout d'abord… Par ailleurs / De surcroît… Compte tenu de… », formule finale (« Dans l'attente d'une réponse favorable, veuillez agréer, Madame, Monsieur, l'expression de mes salutations distinguées. » ou « Bien cordialement »)." :
      "Tâche 1 (message de 60 à 120 mots) : salutation (« Salut à tous, j'espère que vous allez bien. » / « Bonjour Thomas, »), objet du message (« Je vous écris car… »), détails concrets (lieu, date, prix, organisation), « Afin de faciliter… », « N'hésitez pas à… », question ou formule finale (« Qu'en pensez-vous ? », « Bien cordialement, »).",
      `JSON : {"titre": "titre court du sujet", "c": "la consigne", "p": "la production, paragraphes séparés par \\n", "k": ["8 à 14 mots-clés présents mot pour mot dans la production${sujet.d1 ? " ou les documents" : ""}"]}`];
  }
  const usuario = comum.concat(formato).concat(ex ? ["EXEMPLE D'UN MODÈLE FRANÇAIS NA MIRA DE LA MÊME TÂCHE (même format JSON, à imiter pour le style, sans le recopier) :\n" + ex] : []).filter(Boolean).join("\n\n");
  sistema += " Style : n'utilise jamais de tiret cadratin (—) ni de tiret demi-cadratin (–) ; préfère la virgule, les deux-points ou une nouvelle phrase.";
  return { sistema, usuario };
}

function textoDoModelo(tache, m) {
  if (tache === "T2") return [m.c].concat((m.ech || []).map(x => x.q + " " + x.r)).concat([m.fin]).join(" ");
  if (tache === "T1" || tache === "T3") return (m.etapes || []).join(" ") + " " + (m.rel || []).map(x => x.q + " " + x.r).join(" ");
  return [m.p, m.d1, m.d2].join(" ");
}

// Garante o formato dos modelos manuais (lança erro se a IA devolveu algo incompleto).
function normalizarModelo(tache, sujet, r) {
  const m = { id: sujet.id, e: sujet.e, f: sujet.f || 1, gerado: true, titre: String(r.titre || sujet.t).slice(0, 120) };
  const s = x => String(x || "").trim();
  if (tache === "T2") {
    m.reg = r.reg === "vous" ? "vous" : "tu";
    m.c = s(r.c) || sujet.t;
    m.ech = (r.ech || []).filter(x => x && x.q && x.r).slice(0, 10).map(x => ({ q: s(x.q), r: s(x.r) }));
    m.fin = s(r.fin);
    m.ctx = s(r.ctx);
    if (m.ech.length < 5 || !m.fin) throw new Error("Dialogue incomplet.");
  } else if (tache === "T1" || tache === "T3") {
    m.c = sujet.t;
    m.etapes = (r.etapes || []).map(s).filter(Boolean);
    if (tache === "T1") m.rotulos = (r.rotulos || ["Réponse directe", "Explication", "Exemple concret", "Ouverture"]).map(s);
    m.rel = (r.rel || []).filter(x => x && x.q && x.r).map(x => ({ q: s(x.q), r: s(x.r) }));
    if (r.ctx && r.ctx.r) m.ctx = { r: s(r.ctx.r), a: (r.ctx.a || []).filter(a => a && a.length === 2).map(a => [s(a[0]), s(a[1])]) };
    if (m.etapes.length < (tache === "T1" ? 3 : 5)) throw new Error("Monologue incomplet.");
  } else {
    m.c = sujet.t;
    if (sujet.d1) { m.d1 = sujet.d1; m.d2 = sujet.d2; }
    m.p = s(r.p).replace(/\n{3,}/g, "\n\n");
    const n = contarPalavras(m.p);
    if (n < LIMITES_ESCRITA[tache][0] * 0.85) throw new Error("Production trop courte.");
    if (n > LIMITES_ESCRITA[tache][1] + (tache === "ET3" ? 8 : 4)) throw new Error(`Production trop longue (${n} mots).`);
  }
  const tudo = semAcento(textoDoModelo(tache, m)).replace(/’/g, "'");
  m.k = (r.k || []).map(s).filter(k => k && tudo.includes(semAcento(k).replace(/’/g, "'"))).slice(0, 14);
  return semTravessaoObj(m);
}

function modeloReferencia(tache, eixoAlvo) {
  const l = MODELES.ecrite[tache] || [];
  const m = l.find(x => x.e === eixoAlvo) || l[0];
  return m ? m.p : "";
}

// Correção de treino (corrigirComIA do script). Escrita: texto digitado. Oral: a transcrição
// automática da gravação, avaliada como production orale (fluidez e pronúncia não são ouvidas).
function promptCorrecao(tache, sujet, texte) {
  const oral = !ehEscrita(tache);
  const lim = LIMITES_ESCRITA[tache];
  const mots = contarPalavras(texte);
  const connecteurs = OUTILS.connecteurs.map(c => c.rotulo + " : " + c.itens.join(", ")).join("\n");
  const b = OUTILS.boite;
  const boite = `Il est essentiel que [agent : ${b.agents.slice(0, 6).join(", ")}] + [action au subjonctif : ${b.actions.slice(0, 6).join(", ")}] + [complément : ${b.complements.join(", ")}] + [domaine]. Parvenant ainsi à…`;
  const sistema = [
    `Tu es un correcteur expert du TCF Canada (expression ${oral ? "orale" : "écrite"}) et professeur de FLE chez Français na Mira.`,
    "Tu corriges avec bienveillance mais avec exigence, selon la grille du TCF Canada (note sur 20).",
    oral ? "Critères : 1) réalisation de la tâche (respect de la consigne et de la durée) ; 2) cohérence et organisation du discours ; 3) étendue et maîtrise du lexique ; 4) morphosyntaxe ; 5) respect de la trame Français na Mira. Tu évalues une TRANSCRIPTION automatique : ne pénalise ni la ponctuation ni les petites erreurs de reconnaissance vocale évidentes, et ne note pas la prononciation."
      : "Critères : 1) réalisation de la tâche (respect de la consigne, du type de texte et du nombre de mots) ; 2) cohérence et cohésion (plan, paragraphes, connecteurs) ; 3) étendue et maîtrise du lexique ; 4) morphosyntaxe et orthographe ; 5) respect de la trame Français na Mira.",
    `Tu t'appuies TOUJOURS sur la trame de la tâche fournie : la version améliorée doit suivre exactement cette trame, réutiliser les mots-clés de la consigne${ehEscrita(tache) ? " (et des documents pour la tâche 3), rester dans la limite de mots indiquée" : ""} et garder les idées de l'élève autant que possible.`,
    "Tu écris tous les commentaires en français simple (niveau B1-B2), avec, pour chaque correction, une courte explication.",
    "Tu réponds UNIQUEMENT avec un objet JSON valide, sans texte avant ou après, sans balises Markdown."
  ].join(" ");
  const usuario = [
    oral ? `TÂCHE : ${NOMES_TACHE[tache]}, durée ${Math.round(DURACAO_ORAL[tache] / 6) / 10} min.` : `TÂCHE : ${tache.replace("ET", "Tâche ")}, ${lim[0]} mots minimum, ${lim[1]} mots maximum.`,
    "CONSIGNE : " + consigneDe(sujet),
    sujet.d1 ? "DOCUMENT 1 : " + sujet.d1 + "\nDOCUMENT 2 : " + sujet.d2 : "",
    "TRAME FRANÇAIS NA MIRA POUR CETTE TÂCHE :\n" + trameEmTexto(tache),
    "CONNECTEURS À PRIVILÉGIER :\n" + connecteurs,
    tache === "ET3" || tache === "T3" ? "FORMULE DE CONCLUSION (boîte à outils) : " + boite : "",
    ehEscrita(tache) ? "EXEMPLE DE PRODUCTION MODÈLE (même tâche, pour le style et la structure, à ne pas recopier) :\n" + modeloReferencia(tache, sujet.e) : "",
    `${oral ? "TRANSCRIPTION DE LA PRODUCTION ORALE DE L'ÉLÈVE" : "TEXTE DE L'ÉLÈVE"} (${mots} mots), entre les balises <texte> :\n<texte>\n${texte}\n</texte>`,
    "Réponds avec ce JSON exact :",
    '{"note": nombre sur 20 (demi-points possibles), "appreciation": "une phrase de synthèse",',
    oral ? ' "criteres": [{"nom": "Réalisation de la tâche", "note": "x/5", "commentaire": "..."}, {"nom": "Cohérence", ...}, {"nom": "Lexique", ...}, {"nom": "Grammaire", ...}],'
      : ' "criteres": [{"nom": "Réalisation de la tâche", "note": "x/5", "commentaire": "..."}, {"nom": "Cohérence et cohésion", ...}, {"nom": "Lexique", ...}, {"nom": "Grammaire et orthographe", ...}],',
    ' "trame": [{"etape": "nom de l\'étape de la trame", "presente": true ou false, "commentaire": "..."}],',
    ' "points_forts": ["..."], "a_ameliorer": ["..."],',
    ' "corrections": [{"original": "extrait fautif", "corrige": "version correcte", "explication": "..."}] (les 8 erreurs les plus importantes au maximum),',
    ' "lexique": [{"mot": "mot ou expression plus riche", "remplace": "mot simple de l\'élève ou vide", "exemple": "phrase d\'exemple"}] (6 à 10 éléments liés au thème),',
    ' "connecteurs": ["connecteur à ajouter, et à quel endroit"],',
    ehEscrita(tache) ? ` "version_amelioree": "le texte réécrit en suivant la trame, entre ${lim[0]} et ${lim[1]} mots, paragraphes séparés par \\n",`
      : ' "version_amelioree": "ce que l\'élève aurait pu dire, en suivant la trame, paragraphes séparés par \\n",',
    ' "conseil": "le conseil le plus utile pour la prochaine fois"}'
  ].filter(Boolean).join("\n\n");
  return { sistema, usuario, mots, limites: lim || [0, 0] };
}

module.exports = {
  EIXOS, OUTILS, SUJETS, MODELES, TACHES, LIMITES_ESCRITA, DURACAO_ORAL, DURACAO_EPREUVE_MIN, NOMES_TACHE, TIPOS_DEVOIR, CRITERES,
  ehEscrita, semAcento, contarPalavras, semTravessaoObj, nclc, sujetsDaTache, modelosManuais, atelierDaTache, acharTema, ehManual,
  temaEmQualquerTache, consigneDe, ehTendencia, pesoTema, modeloGuia, trameEmTexto, promptModelo, normalizarModelo, promptCorrecao, temaCurto
};
