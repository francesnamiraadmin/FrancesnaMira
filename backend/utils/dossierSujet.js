// Dossiê de leitura de um sujet do Ambiente de Produção: dois textos de referência reais
// (introdução de artigos da Wikipédia em francês, CC BY-SA, com link) e uma imagem livre do
// Wikimedia Commons com autor e licença. Escolha dos artigos, nesta ordem:
//   1) títulos sugeridos pela IA para o sujet (quando a IA está configurada);
//   2) palavras-chave do modelo (m.k) buscadas na Wikipédia;
//   3) dois artigos de referência do eixo temático (lista fixa abaixo).
// O resultado fica em DossierSujetTCF: a Wikipédia só é consultada na primeira abertura.
const { DossierSujetTCF } = require("../models/modelesTCF");
const { pedirJson, iaConfigurada } = require("./claude");
const M = require("./modelesTCF");

const UA = { "User-Agent": "FrancesNaMira/1.0 (francesnamira.com.br; ambiente de produção)" };
const WIKI = "https://fr.wikipedia.org/w/api.php";
const COMMONS = "https://commons.wikimedia.org/w/api.php";

// Artigos de referência por eixo (conferidos na Wikipédia em francês).
const ARTIGOS_EIXO = {
  imm: ["Immigration", "Intégration (sociologie)"], mondial: ["Mondialisation", "Expatriation"], edu: ["Éducation", "Apprentissage"],
  trav: ["Travail", "Télétravail"], tech: ["Technologie", "Réseau social"], medias: ["Média", "Télévision"],
  env: ["Environnement", "Développement durable"], ville: ["Ville", "Urbanisme"], transports: ["Transport", "Transport en commun"],
  sante: ["Santé", "Activité physique"], alim: ["Alimentation humaine", "Gaspillage alimentaire"], sport: ["Sport", "Activité physique"],
  fam: ["Famille", "Parentalité"], relations: ["Amitié", "Relation sociale"], soc: ["Société", "Bénévolat"],
  conso: ["Consommation", "Société de consommation"], loisirs: ["Loisir", "Temps libre"], voyages: ["Tourisme", "Voyage"],
  culture: ["Culture", "Musée"], log: ["Logement", "Colocation"], services: ["Service public", "Service (économie)"]
};

// A API da Wikipédia limita o ritmo: uma chamada por vez, com intervalo.
let fila = Promise.resolve();
const esperar = ms => new Promise(r => setTimeout(r, ms));
function api(url, params) {
  const q = new URLSearchParams({ format: "json", origin: "*", ...params });
  const tarefa = fila.then(async () => {
    const res = await fetch(`${url}?${q}`, { headers: UA, signal: AbortSignal.timeout(12000) });
    const txt = await res.text();
    // limite de ritmo da Wikimedia (429 / "You are making too many requests"): pausa a fila
    if (res.status === 429 || !/^s*[{[]/.test(txt)) { await esperar(5000); throw new Error("wikimedia " + res.status); }
    await esperar(400);
    return JSON.parse(txt);
  });
  fila = tarefa.catch(() => {});
  return tarefa;
}

const limpar = t => String(t || "").replace(/\s*\([^)]*(?:prononcé|API|écouter)[^)]*\)/gi, "").replace(/\s+/g, " ").trim();

// Busca por palavra-chave às vezes cai numa obra homônima (« Pour gagner sa vie » é um filme de
// Chaplin): artigos sobre filmes, músicas, livros etc. não servem como texto de contexto.
const OBRA = /\b(film|comédie|drame|western|documentaire|long[- ]métrage|dessin animé|œuvre|téléfilm|court[- ]métrage|album|chanson|single|série télévisée|feuilleton|roman|nouvelle|pièce de théâtre|groupe (de musique|musical)|jeu vidéo|personnage|émission|bande dessinée|manga|chanteu|acteur|actrice|footballeur|homonymie)\b/i;
const ehObra = p => OBRA.test(String(p.extract || "").slice(0, 220)) || /homonymie/i.test(p.title);

async function paginasPorTitulo(titulos) {
  if (!titulos.length) return [];
  const j = await api(WIKI, { action: "query", redirects: "1", titles: titulos.join("|"), prop: "extracts|pageimages|info", exintro: "1", explaintext: "1", exsentences: "6", piprop: "name|original", inprop: "url" });
  const ps = Object.values(j.query?.pages || {}).filter(p => p.missing === undefined && p.extract && p.extract.length > 120 && !ehObra(p));
  // mantém a ordem pedida
  const ordem = titulos.map(t => t.toLowerCase());
  return ps.sort((a, b) => ordem.indexOf(a.title.toLowerCase()) - ordem.indexOf(b.title.toLowerCase()));
}
async function buscarTitulo(termo) {
  // alguns resultados, para pular as obras homônimas (filtradas em paginasPorTitulo)
  const j = await api(WIKI, { action: "query", list: "search", srsearch: termo, srlimit: "3", srnamespace: "0" });
  return (j.query?.search || []).map(r => r.title);
}

async function imagemCommons(nomeArquivo) {
  if (!nomeArquivo || !/\.(jpe?g|png|webp)$/i.test(nomeArquivo)) return null;
  const j = await api(COMMONS, { action: "query", titles: "File:" + nomeArquivo, prop: "imageinfo", iiprop: "url|extmetadata", iiurlwidth: "960" });
  const p = Object.values(j.query?.pages || {})[0];
  const info = p?.imageinfo?.[0];
  if (!info) return null;   // arquivo local da Wikipédia (às vezes não livre): não usa
  const meta = info.extmetadata || {};
  const tirarTags = s => String(s || "").replace(/<[^>]+>/g, "").trim();
  const licenca = tirarTags(meta.LicenseShortName?.value);
  if (!licenca || /fair use|non-free/i.test(licenca)) return null;
  return { src: info.thumburl || info.url, autor: tirarTags(meta.Artist?.value).slice(0, 120) || "Wikimedia Commons", licenca, url: info.descriptionurl,
    legenda: tirarTags(meta.ImageDescription?.value).slice(0, 160) };
}

async function titulosPelaIA(sujet) {
  if (!iaConfigurada()) return [];
  try {
    const { json } = await pedirJson({
      usuario: `Sujet d'examen (TCF) : « ${M.consigneDe(sujet)} »\nDonne les titres EXACTS de 3 articles de la Wikipédia en français qui aident un apprenant à comprendre le contexte et le vocabulaire de ce sujet (du plus pertinent au moins pertinent). Réponds uniquement en JSON : {"titres": ["...", "...", "..."]}`,
      maxTokens: 300
    });
    return (json.titres || []).map(String).slice(0, 3);
  } catch (e) { return []; }
}

async function montarDossier(tache, sujet, chaves) {
  const usados = new Set();
  let paginas = [], origem = "eixo";
  const titulosIA = await titulosPelaIA(sujet);
  if (titulosIA.length) { paginas = await paginasPorTitulo(titulosIA); if (paginas.length) origem = "ia"; }
  if (paginas.length < 2 && chaves.length) {
    for (const k of chaves.slice(0, 3)) {
      if (paginas.length >= 2) break;
      const ts = (await buscarTitulo(k).catch(() => [])).filter(t => !paginas.some(p => p.title === t));
      const [achada] = ts.length ? await paginasPorTitulo(ts) : [];
      if (achada) paginas.push(achada);
      if (paginas.length) origem = origem === "ia" ? "ia" : "modelo";
    }
  }
  if (paginas.length < 2) {
    const extra = await paginasPorTitulo((ARTIGOS_EIXO[sujet.e] || ARTIGOS_EIXO.soc).filter(t => !paginas.some(p => p.title === t)));
    paginas.push(...extra);
  }
  paginas = paginas.filter(p => !usados.has(p.title) && usados.add(p.title)).slice(0, 2);
  const textos = paginas.map(p => ({ titulo: p.title, texto: limpar(p.extract).slice(0, 1400), url: p.fullurl || `https://fr.wikipedia.org/wiki/${encodeURIComponent(p.title)}`,
    fonte: "Wikipédia", licenca: "CC BY-SA 4.0" }));
  let imagem = null;
  for (const p of paginas) { imagem = await imagemCommons(p.pageimage).catch(() => null); if (imagem) break; }
  if (!imagem) {
    for (const t of ARTIGOS_EIXO[sujet.e] || []) {
      const [p] = await paginasPorTitulo([t]).catch(() => []);
      imagem = p && await imagemCommons(p.pageimage).catch(() => null);
      if (imagem) break;
    }
  }
  return { textos, imagem: imagem || undefined, origem };
}

const montando = new Map();
async function obterDossier(tache, sujet, chaves = []) {
  const pronto = await DossierSujetTCF.findOne({ sujetId: sujet.id }).lean();
  if (pronto) return pronto;
  if (!montando.has(sujet.id)) {
    montando.set(sujet.id, montarDossier(tache, sujet, chaves).catch(() => ({ textos: [] })).then(async d => {
      if (!d.textos.length) return d;   // Wikipédia fora do ar: tenta de novo na próxima abertura
      return (await DossierSujetTCF.findOneAndUpdate({ sujetId: sujet.id }, { $setOnInsert: { sujetId: sujet.id, tache, ...d } }, { upsert: true, new: true })).toObject();
    }).finally(() => montando.delete(sujet.id)));
  }
  return montando.get(sujet.id);
}

module.exports = { obterDossier, ARTIGOS_EIXO };
