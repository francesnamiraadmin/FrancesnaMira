// Coletânea de um sujet do Ambiente de Produção: um texto sobre o EIXO temático e dois textos sobre
// o PRÓPRIO TEMA, de fontes variadas e reais, sempre com autor, fonte, licença e link:
//  - eixo: introdução do artigo da Wikipédia em francês sobre o eixo (CC BY-SA);
//  - tema (dois tipos diferentes, nesta ordem de preferência):
//      · matéria de jornal: The Conversation France (jornalismo escrito por pesquisadores, licença
//        Creative Commons, que permite reproduzir com crédito) — os primeiros parágrafos;
//      · artigo científico: resumo em francês do HAL (arquivo aberto da pesquisa francesa) ou do OpenAlex;
//      · trecho de livro: Google Livros (apresentação do livro) ou Wikisource (obras em domínio público);
//      · se faltar: Wikipédia sobre o tema;
//  - « na imprensa »: manchetes recentes sobre o tema (Google Notícias), só título, veículo e link.
// Cada resultado passa por um teste de relevância com as palavras do tema. A IA (quando configurada)
// escolhe as palavras-chave de busca. O resultado fica em DossierSujetTCF (versão 2): as fontes só são
// consultadas na primeira abertura do tema.
const { DossierSujetTCF } = require("../models/modelesTCF");
const { pedirJson, iaConfigurada } = require("./claude");
const M = require("./modelesTCF");

const VERSAO = 2;
const UA = { "User-Agent": "FrancesNaMira/1.0 (francesnamira.com.br; ambiente de produção)" };
const NAVEGADOR = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36", "Accept": "text/html,application/xhtml+xml", "Accept-Language": "fr-FR,fr;q=0.9" };
const WIKI = "https://fr.wikipedia.org/w/api.php";
const WIKISOURCE = "https://fr.wikisource.org/w/api.php";

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

// Vocabulário de cada eixo (radicais sem acento): o texto do tema também precisa falar do eixo
// (« plastique » + pollution/déchets, e não cirurgia plástica).
const TERMOS_EIXO = {
  imm: ["immigr", "migra", "integr", "etranger", "refugi", "exil"], mondial: ["mondialis", "internation", "global", "expatri", "echange"],
  edu: ["educ", "ecole", "eleve", "enseign", "scolai", "apprentiss", "etudiant", "universit"], trav: ["travail", "emploi", "salari", "entrepris", "profession", "chomag"],
  tech: ["technolog", "numeriq", "internet", "ecran", "intelligence artific", "reseau", "digital"], medias: ["media", "presse", "journal", "televis", "informat", "reseau"],
  env: ["environn", "ecolog", "pollu", "dechet", "climat", "recycl", "planete", "durable"], ville: ["ville", "urbain", "quartier", "citadin", "metropol"],
  transports: ["transport", "mobilit", "voiture", "velo", "trafic", "deplacem"], sante: ["sante", "medic", "malad", "soin", "hopital", "bien-etre"],
  alim: ["aliment", "nourrit", "repas", "cuisine", "nutrition", "gaspill"], sport: ["sport", "activite physique", "exercice", "athlet"],
  fam: ["famill", "parent", "enfant", "couple", "foyer"], relations: ["ami", "relation", "social", "solitude", "lien"], soc: ["societ", "social", "citoyen", "solidar", "benevol"],
  conso: ["consomm", "achat", "acheter", "magasin", "publicit"], loisirs: ["loisir", "temps libre", "vacance", "divertiss"], voyages: ["voyag", "touris", "vacance", "destination"],
  culture: ["cultur", "musee", "art", "lecture", "livre", "patrimoine"], log: ["logement", "habita", "loyer", "appartement", "maison"], services: ["service", "public", "administr", "client"]
};

// ---------- rede: uma fila por servidor, respeitando o ritmo de cada um ----------
const filas = {};
const esperar = ms => new Promise(r => setTimeout(r, ms));
function pedir(url, { json = true, headers = UA, intervalo = 500, timeout = 12000 } = {}) {
  const host = new URL(url).host;
  const fila = filas[host] || Promise.resolve();
  const tarefa = fila.then(async () => {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(timeout) });
    const txt = await res.text();
    await esperar(intervalo);
    if (!res.ok) throw new Error(host + " " + res.status);
    if (!json) return txt;
    if (!/^\s*[{[]/.test(txt)) throw new Error(host + " sem JSON");
    return JSON.parse(txt);
  });
  filas[host] = tarefa.catch(() => {});
  return tarefa;
}

// ---------- texto ----------
const limpar = t => String(t || "").replace(/\s*\([^)]*(?:prononcé|API|écouter)[^)]*\)/gi, "").replace(/\s+/g, " ").trim();
const semTags = t => String(t || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, "\"").replace(/&#0?39;|&rsquo;|&#8217;/g, "’")
  .replace(/&laquo;/g, "«").replace(/&raquo;/g, "»").replace(/&hellip;/g, "…").replace(/&[a-z]+;/g, " ").replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
const tirarAcentos = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
// Corta no fim de uma frase, perto do tamanho pedido.
function cortar(t, max) {
  t = String(t || "").trim();
  if (t.length <= max) return t;
  const parte = t.slice(0, max), fim = Math.max(parte.lastIndexOf(". "), parte.lastIndexOf("! "), parte.lastIndexOf("? "));
  return (fim > max * 0.5 ? parte.slice(0, fim + 1) : parte.replace(/\s+\S*$/, "") + " […]").trim();
}

const PARADAS = new Set(("alors aucun aussi autre autres avec avoir cela ces cette ceux chaque comme comment dans donc dont elle elles encore entre etre "
  + "faire fait faut leur leurs mais meme mes moi nos notre nous parce peut plus pour pourquoi quand quel quelle quelles quels sans selon sont sous toutes tous tout toute tres "
  + "vous votre vos vouloir voulez veux pensez etes avez etait sera seront contre avantages inconvenients opinion doit doivent faudrait devrait chose choses fois aujourd "
  + "amie amis souhaitez posez questions question sujet theme expliquez donnez exemple exemples redigez texte lettre message mots document documents ecrivez partagez "
  + "racontez decrivez presentez proposez semaine prochain prochaine dernier derniere quelques beaucoup permet permettent permettre "
  + "facilement nouveau nouveaux nouvelle nouvelles devenir devient deviennent rendre rendent important importante importants grande grandes grand "
  + "toujours souvent jamais certains certaines personnes gens monde aujourdhui actuellement pensez-vous qu'en quen d'accord daccord accord "
  + "utilisation usage utiliser developpement developper pratique pratiques faut-il faudrait-il doit-on peut-on "
  + "article articles blog forum courriel email raconter raconte decrire ecrire ecrivez ecrit invitez inviter invitation organiser organisez informer informez demander demandez "
  + "repondez reponse destinataire experience donnant donner donnez conseils conseil personnelle personnel compris cherche annee")
  .split(" "));
// Palavras do tema (para buscar e para testar a relevância).
function palavrasDoTema(sujet, chaves) {
  const fonte = [M.consigneDe(sujet), sujet.titre, (chaves || []).join(" ")].join(" ");
  const vistas = new Set(), lista = [];
  String(fonte).split(/[^A-Za-zÀ-ÿœŒæÆ'’-]+/).forEach(p => {
    p = p.replace(/^(l|d|qu|j|n|s|c|m|t)['’]/i, "").replace(/['’-]+$/, "");
    const k = tirarAcentos(p);
    if (k.length < 5 || PARADAS.has(k) || vistas.has(k)) return;
    // formas verbais (« cherchons », « avez », « acheté ») não descrevem o tema
    if (/(ons|ez)$/.test(k) || (/[^e]e$/.test(k) && /é$/.test(p)) || /és$/.test(p)) return;
    vistas.add(k); lista.push(p.toLowerCase());
  });
  return lista;
}
// Relevância: quantas das palavras PRINCIPAIS do tema (as 4 primeiras) aparecem no título ou no texto
// (cobertura), quantas no título, e uma pontuação para ordenar.
const radical = p => tirarAcentos(p).slice(0, Math.max(4, Math.min(7, p.length - 1)));
function relevancia(item, palavras) {
  const titulo = tirarAcentos(item.titulo), texto = tirarAcentos(item.texto);
  let pontos = 0, cobertura = 0, noTitulo = 0;
  palavras.slice(0, 8).forEach((p, i) => {
    const r = radical(p), principal = i < 4;
    const t = titulo.includes(r), x = texto.includes(r);
    if (principal && (t || x)) cobertura++;
    if (principal && t) noTitulo++;
    pontos += t ? (principal ? 4 : 2) : x ? (principal ? 2 : 1) : 0;
  });
  return { pontos, cobertura, noTitulo };
}
// Um texto serve se cobre as palavras principais do tema (ver as regras abaixo) e fala do eixo.
function serve(item, palavras, eixo, leniente) {
  const r = relevancia(item, palavras), precisa = Math.min(2, Math.min(4, palavras.length));
  if (r.cobertura < precisa || r.noTitulo < 1) return -1;
  // com 2+ palavras: duas delas no título, ou uma no título e três no texto todo
  if (!leniente && palavras.length >= 2 && !(r.noTitulo >= 2 || r.cobertura >= 3)) return -1;
  // o texto também precisa falar do eixo (evita homônimos: « plastique » da cirurgia, « histoires » da literatura)
  if (eixo && TERMOS_EIXO[eixo]) {
    const tudo = tirarAcentos(item.titulo + " " + item.texto);
    if (!TERMOS_EIXO[eixo].some(t => tudo.includes(t))) return -1;
  }
  return r.pontos;
}

// ---------- IA: palavras-chave de busca para o tema ----------
async function buscasPelaIA(sujet) {
  if (!iaConfigurada()) return null;
  try {
    const { json } = await pedirJson({
      sistema: "Tu aides un professeur de français à trouver des lectures (presse, recherche, livres) sur le thème d'un sujet d'examen. Tu réponds uniquement en JSON.",
      usuario: `Sujet d'examen (TCF / TEF / DELF) : « ${M.consigneDe(sujet)} »\nDonne : 1) "requete" : 2 à 4 mots-clés EN FRANÇAIS qui décrivent précisément le thème (pas des mots génériques comme « avantages » ou « opinion ») pour chercher des articles de presse et des articles scientifiques ; 2) "mots" : 3 à 6 mots-clés importants du thème ; 3) "wikipedia" : les titres EXACTS de 2 articles de la Wikipédia en français sur ce thème précis.\nRéponds avec ce JSON : {"requete": "...", "mots": ["..."], "wikipedia": ["...", "..."]}`,
      maxTokens: 400
    });
    return { requete: String(json.requete || "").slice(0, 80), mots: (json.mots || []).map(String).slice(0, 6), wikipedia: (json.wikipedia || []).map(String).slice(0, 2) };
  } catch (e) { return null; }
}

// ---------- fontes ----------
const OBRA = /\b(film|comédie|drame|western|documentaire|long[- ]métrage|dessin animé|œuvre|téléfilm|court[- ]métrage|album|chanson|single|série télévisée|feuilleton|roman|nouvelle|pièce de théâtre|groupe (de musique|musical)|jeu vidéo|personnage|émission|bande dessinée|manga|chanteu|acteur|actrice|footballeur|homonymie)\b/i;
const ehObra = p => OBRA.test(String(p.extract || "").slice(0, 220)) || /homonymie/i.test(p.title);

async function wikipedia(titulos) {
  if (!titulos.length) return [];
  const j = await pedir(`${WIKI}?${new URLSearchParams({ action: "query", format: "json", redirects: "1", titles: titulos.join("|"), prop: "extracts|info", exintro: "1", explaintext: "1", exsentences: "6", inprop: "url" })}`, { intervalo: 400 });
  const ps = Object.values(j.query?.pages || {}).filter(p => p.missing === undefined && p.extract && p.extract.length > 120 && !ehObra(p));
  const ordem = titulos.map(t => t.toLowerCase());
  return ps.sort((a, b) => ordem.indexOf(a.title.toLowerCase()) - ordem.indexOf(b.title.toLowerCase()))
    .map(p => ({ titulo: p.title, texto: cortar(limpar(p.extract), 1100), url: p.fullurl || `https://fr.wikipedia.org/wiki/${encodeURIComponent(p.title)}`, fonte: "Wikipédia", autor: "Contributeurs de Wikipédia", data: "", licenca: "CC BY-SA 4.0" }));
}
async function wikipediaBusca(termo) {
  const j = await pedir(`${WIKI}?${new URLSearchParams({ action: "query", format: "json", list: "search", srsearch: termo, srlimit: "3", srnamespace: "0" })}`, { intervalo: 400 });
  return wikipedia((j.query?.search || []).map(r => r.title));
}

// Matéria de jornal: The Conversation France (licença Creative Commons, reprodução com crédito).
async function theConversation(requete) {
  const html = await pedir(`https://theconversation.com/fr/search?q=${encodeURIComponent(requete)}`, { json: false, headers: NAVEGADOR, intervalo: 1000 });
  const links = [...new Set([...html.matchAll(/href="(\/[a-z0-9-]+-\d{5,7})"/g)].map(m => m[1]))].slice(0, 3);
  const itens = [];
  for (const l of links) {
    try {
      const pg = await pedir("https://theconversation.com" + l, { json: false, headers: NAVEGADOR, intervalo: 1000 });
      const meta = n => semTags((pg.match(new RegExp(`<meta (?:property|name)="${n}" content="([^"]*)"`)) || [])[1] || "");
      const i = pg.indexOf('itemprop="articleBody"');
      const paragrafos = i < 0 ? [] : [...pg.slice(i, i + 40000).matchAll(/<p>([\s\S]*?)<\/p>/g)].map(m => semTags(m[1])).filter(p => p.length > 80);
      const licenca = pg.match(/creativecommons\.org\/licenses\/([a-z-]+)\/([\d.]+)/) || [];
      const data = (pg.match(/<time[^>]*datetime="([^"]+)"/) || [])[1];
      if (!paragrafos.length) continue;
      itens.push({ titulo: meta("og:title"), texto: cortar(paragrafos.slice(0, 4).join("\n\n"), 1300), autor: meta("author"), data: data ? data.slice(0, 10) : "",
        url: "https://theconversation.com" + l, fonte: "The Conversation France", licenca: licenca[1] ? `CC ${licenca[1].toUpperCase()} ${licenca[2]}` : "Creative Commons" });
    } catch (e) { /* próximo link */ }
  }
  return itens;
}

// Artigo científico: resumo em francês do HAL; se não houver, do OpenAlex.
async function hal(requete) {
  // todas as palavras precisam aparecer (AND), em qualquer campo do documento
  const termos = requete.split(/s+/).filter(Boolean).map(t => t.replace(/[^p{L}p{N}'’-]/gu, "")).filter(Boolean);
  const q = new URLSearchParams({ q: termos.join(" AND "), wt: "json", rows: "6", fl: "title_s,authFullName_s,fr_abstract_s,uri_s,producedDateY_i,journalTitle_s,docType_s" });
  q.append("fq", "language_s:fr"); q.append("fq", "fr_abstract_s:*");
  const j = await pedir(`https://api.archives-ouvertes.fr/search/?${q}`, { intervalo: 300 });
  const TIPOS = { ART: "Article de revue", COUV: "Chapitre d'ouvrage", OUV: "Ouvrage", THESE: "Thèse", COMM: "Communication", REPORT: "Rapport" };
  return (j.response?.docs || []).map(d => ({
    titulo: (d.title_s || [])[0] || "", texto: cortar(semTags((d.fr_abstract_s || [])[0]), 1200),
    autor: (d.authFullName_s || []).slice(0, 3).join(", ") + ((d.authFullName_s || []).length > 3 ? " et al." : ""),
    data: d.producedDateY_i ? String(d.producedDateY_i) : "", url: d.uri_s,
    fonte: [TIPOS[d.docType_s] || "Publication scientifique", d.journalTitle_s].filter(Boolean).join(" · ") + " (HAL)", licenca: "Résumé des auteurs, cité avec la source"
  })).filter(x => x.titulo && x.texto.length > 150);
}
async function openAlex(requete) {
  const j = await pedir(`https://api.openalex.org/works?${new URLSearchParams({ search: requete, filter: "language:fr,has_abstract:true", "per-page": "6", mailto: "contato@francesnamira.com.br" })}`, { intervalo: 300 });
  return (j.results || []).map(w => {
    const pos = [];
    Object.entries(w.abstract_inverted_index || {}).forEach(([p, ix]) => ix.forEach(i => { pos[i] = p; }));
    return { titulo: w.title || "", texto: cortar(pos.filter(Boolean).join(" "), 1200), autor: (w.authorships || []).slice(0, 3).map(a => a.author?.display_name).filter(Boolean).join(", "),
      data: w.publication_year ? String(w.publication_year) : "", url: w.doi || w.id, fonte: [w.primary_location?.source?.display_name, "OpenAlex"].filter(Boolean).join(" · "), licenca: "Résumé des auteurs, cité avec la source" };
  }).filter(x => x.titulo && x.texto.length > 150);
}

// Trecho de livro: Google Livros (apresentação do livro) ou, em domínio público, o Wikisource.
async function googleLivros(requete) {
  const chave = process.env.GOOGLE_BOOKS_API_KEY ? `&key=${process.env.GOOGLE_BOOKS_API_KEY}` : "";
  const j = await pedir(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(requete)}&langRestrict=fr&maxResults=6&printType=books${chave}`, { intervalo: 800 });
  return (j.items || []).map(v => v.volumeInfo || {}).filter(v => v.description && v.description.length > 200).map(v => ({
    titulo: v.title + (v.subtitle ? " : " + v.subtitle : ""), texto: cortar(semTags(v.description), 1000), autor: (v.authors || []).join(", "),
    data: String(v.publishedDate || "").slice(0, 4), url: v.infoLink || v.canonicalVolumeLink, fonte: [v.publisher, "Google Livres"].filter(Boolean).join(" · "), licenca: "Présentation de l'éditeur, citée avec la source"
  }));
}
async function wikisource(palavras) {
  const j = await pedir(`${WIKISOURCE}?${new URLSearchParams({ action: "query", format: "json", list: "search", srsearch: palavras.slice(0, 3).join(" "), srlimit: "4", srnamespace: "0" })}`, { intervalo: 400 });
  const itens = [];
  for (const r of (j.query?.search || []).slice(0, 3)) {
    try {
      const pg = await pedir(`${WIKISOURCE}?${new URLSearchParams({ action: "parse", format: "json", page: r.title, prop: "text", redirects: "1" })}`, { intervalo: 400 });
      const html = pg.parse?.text?.["*"] || "";
      const paragrafos = [...html.matchAll(/<p>([\s\S]*?)<\/p>/g)].map(m => semTags(m[1])).filter(p => p.length > 120);
      const radicais = palavras.slice(0, 4).map(p => tirarAcentos(p).slice(0, 6));
      const idx = paragrafos.findIndex(p => radicais.some(rd => tirarAcentos(p).includes(rd)));
      if (idx < 0) continue;
      itens.push({ titulo: r.title.split("/")[0], texto: cortar(paragrafos.slice(idx, idx + 2).join("\n\n"), 1100), autor: "", data: "",
        url: `https://fr.wikisource.org/wiki/${encodeURIComponent(r.title.replace(/ /g, "_"))}`, fonte: "Wikisource (œuvre du domaine public)", licenca: "Domaine public" });
    } catch (e) { /* próxima página */ }
  }
  return itens;
}

// Manchetes recentes (Google Notícias): só título, veículo, data e link.
async function imprensa(requete) {
  const xml = await pedir(`https://news.google.com/rss/search?q=${encodeURIComponent(requete)}&hl=fr&gl=FR&ceid=FR:fr`, { json: false, headers: NAVEGADOR, intervalo: 800 });
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 6).map(m => {
    const i = m[1], tag = n => semTags((i.match(new RegExp(`<${n}[^>]*>([\\s\\S]*?)</${n}>`)) || [])[1] || "");
    const fonte = tag("source"), titulo = tag("title");
    const pub = tag("pubDate");
    return { titulo: fonte && titulo.endsWith(" - " + fonte) ? titulo.slice(0, -(fonte.length + 3)) : titulo, fonte, data: pub && !isNaN(new Date(pub)) ? new Date(pub).toISOString().slice(0, 10) : "", url: tag("link") };
  }).filter(x => x.titulo && /^https?:/.test(x.url));
}

// Tenta uma fonte sem deixar o erro dela derrubar a coletânea.
const tentar = (fn, ...a) => fn(...a).catch(() => []);

async function montarDossier(tache, sujet, chaves) {
  const eixo = ((M.EIXOS && M.EIXOS.eixos) || {})[sujet.e] || {};
  const ia = await buscasPelaIA(sujet);
  const palavras = [...new Set([...(ia?.mots || []).map(p => p.toLowerCase()), ...palavrasDoTema(sujet, chaves)])];
  const requete = ia?.requete || palavras.slice(0, 3).join(" ");
  const textos = [];

  // 1) o eixo
  const [doEixo] = await tentar(wikipedia, (ARTIGOS_EIXO[sujet.e] || ARTIGOS_EIXO.soc).slice(0, 1));
  if (doEixo) textos.push({ tipo: "eixo", rotulo: "L'axe thématique" + (eixo.nome ? " : " + eixo.nome : ""), ...doEixo });

  // 2) o tema: matéria de jornal, artigo científico e livro — os dois mais relevantes, de tipos diferentes
  const melhor = lista => lista.map(x => ({ x, p: serve(x, palavras, sujet.e) })).filter(o => o.p >= 0).sort((a, b) => b.p - a.p)[0]?.x;
  const curta = palavras.slice(0, 2).join(" ");
  const candidatos = [];
  const noticia = melhor(await tentar(theConversation, requete)) || (curta !== requete ? melhor(await tentar(theConversation, curta)) : null);
  if (noticia) candidatos.push({ tipo: "noticia", rotulo: "Article de presse", ...noticia });
  const ciencia = melhor(await tentar(hal, requete)) || (curta !== requete ? melhor(await tentar(hal, curta)) : null) || melhor(await tentar(openAlex, requete));
  if (ciencia) candidatos.push({ tipo: "cientifico", rotulo: "Article scientifique", ...ciencia });
  if (candidatos.length < 2) {
    const livro = melhor(await tentar(googleLivros, requete)) || melhor(await tentar(wikisource, palavras));
    if (livro) candidatos.push({ tipo: "livro", rotulo: "Extrait de livre", ...livro });
  }
  if (candidatos.length < 2) {
    const ws = ia?.wikipedia?.length ? await tentar(wikipedia, ia.wikipedia) : await tentar(wikipediaBusca, requete);
    ws.filter(w => w.titulo !== doEixo?.titulo && serve(w, palavras, sujet.e, true) >= 0).slice(0, 2 - candidatos.length).forEach(w => candidatos.push({ tipo: "enciclopedia", rotulo: "Encyclopédie", ...w }));
  }
  textos.push(...candidatos.slice(0, 2));

  const manchetes = (await tentar(imprensa, requete)).filter(x => relevancia({ titulo: x.titulo, texto: "" }, palavras).cobertura >= Math.min(2, palavras.length)).slice(0, 3);
  return { textos, imprensa: manchetes, origem: ia ? "ia" : "palavras", requete, versao: VERSAO };
}

const montando = new Map();
async function obterDossier(tache, sujet, chaves = []) {
  const pronto = await DossierSujetTCF.findOne({ sujetId: sujet.id }).lean();
  if (pronto && (pronto.versao || 1) >= VERSAO) return pronto;
  if (!montando.has(sujet.id)) {
    montando.set(sujet.id, montarDossier(tache, sujet, chaves).catch(() => ({ textos: [], imprensa: [] })).then(async d => {
      // incompleta (fonte fora do ar ou limitando pedidos): mostra o que tiver e tenta de novo na próxima abertura
      if (d.textos.filter(t => t.tipo !== "eixo").length < 2 || !d.textos.some(t => t.tipo === "eixo")) return d;
      return (await DossierSujetTCF.findOneAndUpdate({ sujetId: sujet.id }, { $set: { tache, ...d, criadoEm: new Date() } }, { upsert: true, new: true })).toObject();
    }).finally(() => montando.delete(sujet.id)));
  }
  return montando.get(sujet.id);
}

module.exports = { obterDossier, montarDossier, ARTIGOS_EIXO, palavrasDoTema, relevancia, serve };
