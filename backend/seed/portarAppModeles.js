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
// Aceita CRLF (arquivos salvos no Windows) e LF.
const ler = n => fs.readFileSync(path.join(DIR, n), "utf8").replace(/\r\n/g, "\n");

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
const subst = (ler("funcoes.js") + "\n" + ler("pagina-sujet.js")).split(/\n(?=\/\/@@ )/);
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
// Na página do tema a folha de resposta é « Faire ce sujet »: a reescrita do modelo só abre pelo botão.
trocar("      // o propósito dos modelos é reescrever: a folha já abre ao lado\n      raiz._abrirReescrita();\n", "");
trocar("if (!ligado) { Voz.parar(); if (raiz._abrirReescrita) raiz._abrirReescrita(); return; }", "if (!ligado) { Voz.parar(); return; }");
// Production orale: sem o cartão do cronômetro (o tempo corre na página do tema).
trocar("        (oral ? '<button class=\"hub-acao\" type=\"button\" data-hub=\"chrono\"><span></span><b>Chronomètre de l\\'oral</b><small>Préparation et prise de parole, comme à l\\'examen.</small></button>' : '') + '</div>';", "        '</div>';");
// Ao enviar a produção, a página do tema para o cronômetro.
trocar("var parar = function () { if (h) { clearInterval(h); h = null; } };", "var parar = function () { if (h) { clearInterval(h); h = null; } };\n      raiz._pararCrono = function () { parar(); desenhar(); el.fase.textContent = 'Production envoyée'; };");
// Fim da épreuve: confirmação no visual do site, com o custo em créditos quando o professor corrige.
trocar("        if (!confirm('Terminer l\\'épreuve et envoyer vos textes maintenant ?' + (vazias.length ? '\\nTâche(s) vide(s) : ' + vazias.map(function (t) { return t.slice(-1); }).join(', ') : ''))) return;\n        fecharEpreuve(false);",
  "        confirmarFimEpreuve(vazias).then(function (ok) { if (ok) fecharEpreuve(false); });");
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

// ---- telas reorganizadas para leitura (espace professeur, mon espace, boîte à outils) ----
trocar("tela.querySelectorAll('[data-aba]').forEach(function (b) { b.addEventListener('click', function () { abrirProf(b.dataset.aba); }); });",
  "tela.querySelectorAll('[data-aba]').forEach(function (b) { b.addEventListener('click', function () { abrirProf(b.dataset.aba); }); });\n        organizarProf(tela, aba);");
trocar("          $('esp-epreuves').addEventListener('click', abrirEpreuve);",
  "          $('esp-epreuves').addEventListener('click', abrirEpreuve);\n          resumoEspace(tela, pend.length, mPend.length);");
trocar("html += '<div class=\"grade-trames\">';", "html += '<h2 class=\"secao-titulo outils-secao\"><i class=\"oral\"></i>Oral</h2><div class=\"grade-trames\">';");
trocar("        var tr = B.trames[t]; if (!tr) return;", "        if (t === 'ET1') html += '</div><h2 class=\"secao-titulo outils-secao\"><i class=\"ecrit\"></i>Écrit</h2><div class=\"grade-trames\">';\n        var tr = B.trames[t]; if (!tr) return;");

// ---- perfil do curso: TCF Canada ou DELF de um nível (ver modeles-site/perfil.js) ----
const R = String.raw;
trocar("B = banco;", "B = banco; aplicarPerfil();", true);
// « Mes épreuves orales » abre a épreuve orale (antes caía na tela da épreuve escrita).
trocar(R`tela.querySelector('[data-hub="epreuve"]').addEventListener('click', abrirEpreuve);`, R`tela.querySelector('[data-hub="epreuve"]').addEventListener('click', function () { if (oral) abrirEpreuveOral(); else abrirEpreuve(); });`);
// Mes notes: cada produção leva à correção completa (texto marcado, critérios, feedback).
trocar(R`'</td><td>' + (temNota ? nclc(nota) : '') + '</td><td>' + esc(r.Commentaire || '') + '</td></tr>';`,
  R`'</td><td>' + (temNota ? nclc(nota) : '') + '</td><td>' + esc(r.Commentaire || '') + '</td><td>' + (r.ID ? '<a class="ferramenta" href="' + linkCorrecao(r.ID) + '">Voir la correction</a>' : '') + '</td></tr>';`);
trocar(R`'<th>Note</th><th>NCLC</th><th>Commentaire</th></tr></thead><tbody>'`, R`'<th>Note</th><th>NCLC</th><th>Commentaire</th><th></th></tr></thead><tbody>'`);
trocar("      var nomeCurso = CURSOS[B.courseType] || 'TCF Canada';", "      var nomeCurso = ehDelf() ? B.perfil.nome : CURSOS[B.courseType] || 'TCF Canada';");
trocar("      html += htmlHubEscolhas();", "      html += htmlNiveisDelf();\n      html += htmlHubEscolhas();");
trocar(R`'<p class="intro">' + (oral ? 'Les trois tâches de l\'expression orale`, R`'<p class="intro">' + (ehDelf() ? introHubDelf(oral) : oral ? 'Les trois tâches de l\'expression orale`);
trocar(R`<span class="selo">' + info.nom.slice(-1) + '</span>'`, R`<span class="selo">' + seloTache(t) + '</span>'`);
trocar(R`(oral ? 'Mes épreuves orales' : 'Épreuve écrite (60 min)')`, R`(oral ? 'Mes épreuves orales' : ehDelf() ? 'Prova escrita (' + minutosEpreuve() + ' min)' : 'Épreuve écrite (60 min)')`);
trocar(R`(oral ? 'Les enregistrements demandés par votre professeur(e).' : 'Tâches 1, 2 et 3 dans les conditions de l\'examen.')`,
  R`(oral ? 'Les tâches de l\'oral enregistrées dans les conditions de l\'examen, corrigées par l\'IA ou un professeur.' : ehDelf() ? 'A produção escrita completa, nas condições do ' + esc(nomeProva()) + '.' : 'Tâches 1, 2 et 3 dans les conditions de l\'examen.')`);
trocar(R`<small class="mira-marca">TCF Canada · Expression écrite · réécriture</small>`, R`<small class="mira-marca">' + esc(nomeProva()) + ' · Expression écrite · réécriture</small>`);
trocar(R`'<p class="intro">Trois tâches en <b>60 minutes</b>, comme le jour du TCF Canada : Tâche 1 (≈ 10 min), Tâche 2 (≈ 15 min), Tâche 3 (≈ 25 min) et 10 minutes de relecture. ' +`,
  R`'<p class="intro">' + (ehDelf() ? introEpreuveDelf() : 'Trois tâches en <b>60 minutes</b>, comme le jour du TCF Canada : Tâche 1 (≈ 10 min), Tâche 2 (≈ 15 min), Tâche 3 (≈ 25 min) et 10 minutes de relecture. ') +`);
trocar(R`if (!confirm('L\'épreuve dure 60 minutes et ne peut pas être mise en pause. Commencer maintenant ?')) return;`,
  R`if (!confirm(ehDelf() ? 'A prova dura ' + minutosEpreuve() + ' minutos e não pode ser pausada. Começar agora?' : 'L\'épreuve dure 60 minutes et ne peut pas être mise en pause. Commencer maintenant ?')) return;`);
trocar(R`>Commencer l\'épreuve (60 min)</button>'`, R`>' + (ehDelf() ? 'Começar a prova (' + minutosEpreuve() + ' min)' : 'Commencer l\'épreuve (60 min)') + '</button>'`);
trocar(R`registrarEixos([livre.ET1.e, livre.ET2.e, livre.ET3.e]); comecar({ sujets: { ET1: livre.ET1.id, ET2: livre.ET2.id, ET3: livre.ET3.id }, correcao: correcaoEscolhida() }`,
  R`registrarEixos(ETS().map(function (t) { return livre[t].e; })); comecar({ sujets: sujetsLivres(livre), correcao: correcaoEscolhida() }`);
trocar(R`<span class="tempo" id="ep-tempo">60:00</span>`, R`<span class="tempo" id="ep-tempo">' + minutosEpreuve() + ':00</span>`);
trocar(R`<span class="selo">' + t.slice(-1) + '</span>`, R`<span class="selo">' + seloTache(t) + '</span>`, true);
trocar(R`<h2>Tâche ' + t.slice(-1) + ' · ' + TACHES[t].sous + '</h2>'`, R`<h2>' + TACHES[t].nom + ' · ' + TACHES[t].sous + '</h2>'`);
trocar(R`lim[0] + ' mots minimum · ' + lim[1] + ' mots maximum · temps conseillé : ' + ETAPAS_EPREUVE[Number(t.slice(-1)) - 1].min + ' min</small>`,
  R`lim[0] + ' mots minimum · ' + (ehDelf() ? '' : lim[1] + ' mots maximum · ') + 'temps conseillé : ' + (MIN_EXAME_ESCRITO[t] || 10) + ' min</small>`);
trocar(R`<b>' + r.note + '</b><span>/20</span>`, R`<b>' + r.note + '</b><span>/' + (r.escala || 20) + '</span>`);
trocar(R`'<div><span class="ia-selo">Correction par l\'IA · NCLC estimé ' + r.nclc + '</span>`, R`'<div><span class="ia-selo">Correction par l\'IA · ' + (r.selo ? esc(r.selo) : 'NCLC estimé ' + r.nclc) + '</span>`);
trocar(R`if (t === 'ET1') html += '</div><h2 class="secao-titulo outils-secao">`, R`if (t === ETS()[0]) html += '</div><h2 class="secao-titulo outils-secao">`);
// Épreuve escrita: duração do perfil (TCF 60 min; DELF 25 a 60 min) e alertas das etapas do nível.
{
  const [a, b] = limitesFuncao(js, "iniciarEpreuveLocal");
  let f = js.slice(a, b);
  const i = f.indexOf("      var ALERTAS = [");
  const j = f.indexOf("      ];\n", i);
  if (i < 0 || j < 0) throw new Error("ALERTAS não encontrado");
  f = f.slice(0, i) + "      var ALERTAS = alertasEpreuve(irPara);\n" + f.slice(j + "      ];\n".length);
  if (!/3600/.test(f)) throw new Error("3600 não encontrado");
  f = f.replace("{\n", "{\n      var SEG_EP = minutosEpreuve() * 60;\n").split("3600").join("SEG_EP");
  js = js.slice(0, a) + f + js.slice(b);
}

// ---- extensões do site (dentro do mesmo escopo do App) ----
trocar("    document.addEventListener('DOMContentLoaded', iniciar);", (ler("perfil.js") + "\n" + ler("epreuve-orale.js") + "\n" + ler("extensoes.js") + "\n" + ler("fazer-sujet.js") + "\n" + ler("correcao-equipe.js") + "\n" + ler("navegacao.js")).replace(/^/gm, "    ") +
  "\n    // Só começa depois que a página confirmou o acesso e o curso (window.FNM_PRONTO).\n" +
  "    (window.FNM_PRONTO || Promise.resolve()).then(function () { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar(); });");
trocar("abrirOral: function () { abrirHub('oral'); },", "abrirOral: function () { abrirHub('oral'); }, abrirDestino: abrirDestino,");

// Listas fixas de tâches → as do perfil (no DELF, só as partes do nível, na ordem da prova).
js = js.split("['ET1', 'ET2', 'ET3', 'T1', 'T2', 'T3']").join("ETS().concat(TS())")
  .split("['ET1', 'ET2', 'ET3']").join("ETS()").split("['T1', 'T2', 'T3']").join("TS()")
  .split("['ET3', 'ET2', 'ET1']").join("ETS().reverse()");
// « Mes notes » / « Mon espace » saíram do app: as notas e correções ficam no « Meu Espaço » do site.
js = js.split("« Mes notes » et dans « Mes corrections »").join("« Meu Espaço »").split("« Mon espace › Mes notes »").join("« Meu Espaço »").split("« Mes notes »").join("« Meu Espaço »");

const cab = `// =====================================================================
// Ambiente de Produção — app "Modèles TCF" (Google Apps Script) rodando no site.
// GERADO por backend/seed/portarAppModeles.js a partir do App.html do script: não edite
// este arquivo; mude backend/seed/modeles-site/*.js e rode o porte de novo.
// Chamadas ao servidor: js/gasShim.js (google.script.run → /api/modeles/rpc/*).
// =====================================================================
`;
fs.writeFileSync(path.join(__dirname, "..", "..", "public", "js", "producaoApp.js"), cab + js);
console.log("ok", js.length);
