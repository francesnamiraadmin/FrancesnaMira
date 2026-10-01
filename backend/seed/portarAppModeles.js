// Porta o App.html do app "Modèles TCF" (Apps Script) para public/js/producaoApp.js.
// O código do script é mantido; aqui só se trocam, por nome, as funções que dependiam do
// Apps Script (login por e-mail, áudios do Drive, Docs, journal de pagamento) ou que o site
// redesenhou (hub do Ambiente de Produção, gravação com transcrição, envio ao Sistema de
// Correção, À la une, espace professeur com acompanhamento ao vivo).
// As substituições ficam em backend/seed/modeles-site/*.js — este arquivo só as aplica.
//
// Uso: node backend/seed/portarAppModeles.js <pasta-do-clone-clasp>
const fs = require("fs");
const path = require("path");

const origem = process.argv[2];
let js = fs.readFileSync(path.join(origem, "App.html"), "utf8");
js = js.replace(/^\s*<script>\s*/, "").replace(/\s*<\/script>\s*$/, "\n");

const DIR = path.join(__dirname, "modeles-site");
const ler = n => fs.readFileSync(path.join(DIR, n), "utf8");

// Acha "function nome(" no nível do App e devolve [início, fim] (até a chave que fecha).
function limitesFuncao(src, nome) {
  const re = new RegExp("\\n(    )function " + nome + "\\s*\\(");
  const m = re.exec(src);
  if (!m) throw new Error("Função não encontrada: " + nome);
  const ini = m.index + 1;
  let i = src.indexOf("{", ini), prof = 0;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === "'" || c === '"' || c === "`") { // pula strings
      const q = c; i++;
      while (i < src.length && src[i] !== q) { if (src[i] === "\\") i++; i++; }
      continue;
    }
    if (c === "/" && src[i + 1] === "/") { i = src.indexOf("\n", i); continue; }
    if (c === "/" && src[i + 1] === "*") { i = src.indexOf("*/", i) + 1; continue; }
    if (c === "{") prof++;
    else if (c === "}") { prof--; if (prof === 0) return [ini, i + 1]; }
  }
  throw new Error("Fim da função não encontrado: " + nome);
}
function trocarFuncao(nome, novo) {
  const [a, b] = limitesFuncao(js, nome);
  js = js.slice(0, a) + novo.trim() + js.slice(b);
}
function trocar(de, para, todas) {
  if (!js.includes(de)) throw new Error("Trecho não encontrado: " + de.slice(0, 80));
  js = todas ? js.split(de).join(para) : js.replace(de, para);
}

// ---- funções substituídas (uma por arquivo, com o mesmo nome) ----
const subst = ler("funcoes.js").split(/\n(?=\/\/@@ )/);
for (const bloco of subst) {
  const m = bloco.match(/^\/\/@@ (\w+)\n([\s\S]*)$/);
  if (!m) continue;
  trocarFuncao(m[1], m[2].replace(/^/gm, "    "));
}

// ---- trechos pontuais ----
// Avisos, modais e dicas ficam dentro do app (o CSS do app é escopado em .fnm-app).
trocar("document.body.appendChild(", "(document.getElementById('fnm-raiz') || document.body).appendChild(", true);
// "Mon espace" começa nas tarefas (o journal de aulas/pagamento do script não existe no site).
trocar("var PARTE_ESPACE = function () { return { rotulo: 'Mon espace', fn: abrirJournal }; };",
  "var PARTE_ESPACE = function () { return { rotulo: 'Mon espace', fn: abrirTarefas }; };");
// O gravador livre precisa do modelo aberto (para enviar a gravação sobre o sujet certo).
trocar("if (tache.indexOf('ET') !== 0) ligarGravadorLivre(raiz, tache);", "if (tache.indexOf('ET') !== 0) ligarGravadorLivre(raiz, tache, m);");
// Réécriture: além da correção de treino pela IA, pode ir ao Sistema de Correção.
trocar("'<div id=\"reescrita-res\" class=\"rs-res\"></div>' + botaoIA('rascunho-ia') + '<div class=\"ia-resultado\" id=\"rascunho-ia-res\"></div></aside>';",
  "'<div id=\"reescrita-res\" class=\"rs-res\"></div>' + botaoIA('rascunho-ia') + '<div class=\"ia-resultado\" id=\"rascunho-ia-res\"></div>' + htmlEnvioSistema('rs') + '</aside>';");
trocar("if ($('rascunho-ia')) $('rascunho-ia').addEventListener('click', function () { pedirCorrecaoIA(tache, m.id, textoDoEditor(ed), $('rascunho-ia-res'), $('rascunho-ia')); });",
  "if ($('rascunho-ia')) $('rascunho-ia').addEventListener('click', function () { pedirCorrecaoIA(tache, m.id, textoDoEditor(ed), $('rascunho-ia-res'), $('rascunho-ia')); });\n" +
  "      ligarEnvioSistema(raiz.querySelector('[data-envio=\"rs\"]'), function () { return { tache: tache, sujet: m.id, texte: textoDoEditor(ed) }; });");
// Espace professeur: aba "Ao vivo" e atalhos para as páginas da equipe que já existem no site.
trocar("'<div class=\"abas-prof\"><button class=\"chip\" type=\"button\" data-aba=\"ecrit\"",
  "'<div class=\"abas-prof\"><button class=\"chip\" type=\"button\" data-aba=\"aovivo\" aria-pressed=\"' + (aba === 'aovivo') + '\">● En direct</button><button class=\"chip\" type=\"button\" data-aba=\"ecrit\"");
trocar("'<button class=\"chip\" type=\"button\" data-aba=\"vitesse\" aria-pressed=\"' + (aba === 'vitesse') + '\">Vitesse</button></div>';", "'</div>';");
for (const a of ["aconf", "testes", "finances"]) {
  const re = new RegExp("\\s*'<button class=\"chip\" type=\"button\" data-aba=\"" + a + "\" aria-pressed=\"' \\+ \\(aba === '" + a + "'\\) \\+ '\">[^<]*</button>'\\s*\\+");
  if (!re.test(js)) throw new Error("Aba não encontrada: " + a);
  js = js.replace(re, "");
}
trocar("'<button class=\"chip\" type=\"button\" data-aba=\"online\" aria-pressed=\"' + (aba === 'online') + '\">En ligne</button>' +",
  "'<button class=\"chip\" type=\"button\" data-aba=\"online\" aria-pressed=\"' + (aba === 'online') + '\">En ligne</button>' + '</div>' + htmlAtalhosEquipe() + '<div class=\"abas-prof\" hidden>' +");
trocar("        if (aba === 'devoirs') {\n          html += '<div class=\"bloco\"><h3>Nouveau devoir</h3>",
  "        if (aba === 'aovivo') {\n          html += '<div id=\"aovivo\"><p class=\"vazio\">Chargement…</p></div>';\n        } else if (aba === 'devoirs') {\n          html += '<div class=\"bloco\"><h3>Nouveau devoir</h3>");
trocar("if (aba === 'ecrit') ligarProfEscrita();", "if (aba === 'aovivo') ligarAoVivo(); else if (aba === 'ecrit') ligarProfEscrita();");
trocar("aba = aba || 'ecrit';", "aba = aba || 'aovivo';");
trocar("if (aba !== 'sessoes' && aba !== 'devoirs' && aba !== 'temas' && aba !== 'blog') { fn(); return; }",
  "if (aba !== 'sessoes' && aba !== 'devoirs' && aba !== 'temas' && aba !== 'blog') { fn(); return; }");
// Carnet: mostra também o Caderno de Revisão da Plataforma de Questões.
trocar("var html = trilha(partes) + '<h1 class=\"titulo-pagina\">Mon espace</h1>' + abasEspace('cahier') +",
  "var html = trilha(partes) + '<h1 class=\"titulo-pagina\">Mon espace</h1>' + abasEspace('cahier') + '<div id=\"carnet-plataforma\"></div>' +");
trocar("        ligarAbasEspace(tela);\n        tela.querySelectorAll('[data-cx]')",
  "        ligarAbasEspace(tela);\n        carregarCadernoPlataforma($('carnet-plataforma'));\n        tela.querySelectorAll('[data-cx]')");
// Épreuve: o aluno escolhe quem corrige (IA na hora ou professor pelo Sistema de Correção).
trocar("'<div class=\"ferramentas\"><button class=\"botao-principal\" type=\"button\" id=\"ep-comecar\" style=\"width:auto;padding:13px 30px\">Commencer l\\'épreuve (60 min)</button>' +",
  "htmlEscolhaCorrecao(st) + '<div class=\"ferramentas\"><button class=\"botao-principal\" type=\"button\" id=\"ep-comecar\" style=\"width:auto;padding:13px 30px\">Commencer l\\'épreuve (60 min)</button>' +");
trocar("comecar({ sujets: { ET1: livre.ET1.id, ET2: livre.ET2.id, ET3: livre.ET3.id } }, $('ep-comecar'));",
  "comecar({ sujets: { ET1: livre.ET1.id, ET2: livre.ET2.id, ET3: livre.ET3.id }, correcao: correcaoEscolhida() }, $('ep-comecar'));");
trocar("EP = { inicio: emCurso.inicio,", "EP = { id: emCurso.id, correcao: emCurso.correcao, inicio: emCurso.inicio,");
trocar("      // Treino livre: a IA corrige cada tâche (a prova da professora é corrigida por ela).",
  "      if (EP && !EP.sessao) alvo.innerHTML += htmlEnvioEpreuve(r);\n      // Treino livre: a IA corrige cada tâche (a prova da professora é corrigida por ela).");
trocar("      if (EP && !EP.sessao) {\n        var comTexto",
  "      ligarEnvioEpreuve(r);\n      if (EP && !EP.sessao && EP.correcao !== 'professor') {\n        var comTexto");

// ---- extensões do site (dentro do mesmo escopo do App) ----
trocar("    document.addEventListener('DOMContentLoaded', iniciar);", ler("extensoes.js").replace(/^/gm, "    ") +
  "\n    // Só começa depois que a página confirmou o acesso e o curso (window.FNM_PRONTO).\n" +
  "    (window.FNM_PRONTO || Promise.resolve()).then(function () { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar(); });");
trocar("abrirOral: function () { abrirHub('oral'); },", "abrirOral: function () { abrirHub('oral'); }, abrirDestino: abrirDestino,");

const cab = `// =====================================================================
// Ambiente de Produção — app "Modèles TCF" (Google Apps Script) rodando no site.
// GERADO por backend/seed/portarAppModeles.js a partir do App.html do script: não edite
// este arquivo; mude backend/seed/modeles-site/*.js e rode o porte de novo.
// Chamadas ao servidor: js/gasShim.js (google.script.run → /api/modeles/rpc/*).
// =====================================================================
`;
fs.writeFileSync(path.join(__dirname, "..", "..", "public", "js", "producaoApp.js"), cab + js);
console.log("ok", js.length);
