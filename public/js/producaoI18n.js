// =====================================================================
// Ambiente de Produção em português (padrão do site) ou em francês (modo "Français" das
// Configurações). O app vem do script em francês: aqui a interface é traduzida na tela
// (textos de botões, títulos, instruções, avisos), pelo dicionário i18n/producao-pt.json
// e pelas regras abaixo. O que o aluno usa EM francês fica em francês: modelos, enunciados,
// documentos, trames e repertório, vocabulário, correções e tudo o que ele escreve ou grava
// (ver PRESERVAR). No modo francês nada é tocado.
// =====================================================================
(function () {
  var idioma = (window.I18n && window.I18n.idioma) || localStorage.getItem("site-idioma") || "pt-BR";
  window.FNM_IDIOMA = idioma === "fr" ? "fr" : "pt";
  if (window.FNM_IDIOMA === "fr") { window.FNM_I18N_PRONTO = Promise.resolve(); return; }

  // Áreas de conteúdo em francês: nunca traduzidas.
  var PRESERVAR = [
    ".passo-texto", ".texto-modelo", ".fala .conteudo", ".consigne p", ".consigne-folha", ".doc p", ".docs p", ".trame-lista li span",
    ".passo span", ".metodo-passos span", ".metodo-exemplo .ia-versao", ".boite div", ".mots", ".ia-versao", ".ia-correcoes", ".ia-lexico",
    ".ia-apreciacao", ".ia-criterios p", ".ia-trame li", ".ia-conselho", ".prod-texto", ".editor", "textarea", "input", "select option[data-fr]",
    ".frase", ".at-con li", ".at-tab td", ".at-chips", ".at-formula", ".at-formula-bloco p", ".at-box p", ".at-ex", ".at-rappel .pm-tit",
    ".item-modelo b", ".item-modelo small", ".alu-card h5", ".alu-post h3", ".alu-post p", ".alu-mini b", ".alu-mini small", ".modele-titulo",
    ".contexto p", ".aspectos span", ".guia-pistes p", ".grav-consigne p", ".previa-item span[data-previa]", ".voc-pergunta", ".voc-mot",
    ".mot-carnet b", ".erro-item", ".carnet-item b", ".dica", ".lacuna", ".conteudo-lacunas", ".av-tache .prod-texto", ".gl-viva",
    ".grav-transcricao p", ".passo-dica p", ".painel-dictee .dt-texto", ".rs-consigne", ".mot",
    ".tm-leitura h4", ".tm-leitura p", ".tm-leitura small", ".av-m span", ".av-sala-tit", ".av-roteiro p", ".av-roteiro li", ".av-sala-topo small"
  ].join(",");
  window.FNM_PRESERVAR = PRESERVAR;
  // Títulos dentro de blocos preservados (o conteúdo segue em francês, o título é traduzido).
  var SEMPRE = ".boite > div > b";

  // Nomes dos eixos temáticos (o dado vem do script, em francês).
  var EIXOS = {
    imm: "Imigração", mondial: "Globalização", edu: "Educação", trav: "Trabalho", tech: "Tecnologia", medias: "Mídia", env: "Meio ambiente",
    ville: "Cidade", transports: "Transportes", sante: "Saúde", alim: "Alimentação", sport: "Esporte", fam: "Família", relations: "Relações",
    soc: "Sociedade", conso: "Consumo", loisirs: "Lazer", voyages: "Viagens", culture: "Cultura", log: "Moradia", services: "Serviços"
  };
  var TAREFA = { "Entretien dirigé": "Entrevista dirigida", "Exercice en interaction": "Exercício de interação", "Expression d'un point de vue": "Expressão de um ponto de vista",
    "Message court": "Mensagem curta", "Récit, article ou lettre": "Relato, artigo ou carta", "Texte argumentatif": "Texto argumentativo" };
  var plural = function (n, um, varios) { return Number(n) > 1 ? varios : um; };

  // Textos montados com números/nomes: [regex, substituição]. Testadas no texto inteiro do nó.
  var REGRAS = [
    [/^(Oral|Écrit) · Tâche (\d)$/, function (m, a, n) { return (a === "Oral" ? "Oral" : "Escrita") + " · Tarefa " + n; }],
    [/^(Oral|Écrit) · Tâche (\d) · (.+)$/, function (m, a, n, s) { return (a === "Oral" ? "Oral" : "Escrita") + " · Tarefa " + n + " · " + (TAREFA[s] || s); }],
    [/^Tâche (\d)$/, "Tarefa $1"],
    [/^Lecture (\d)$/, "Leitura $1"],
    [/^Tombé récemment \((.+)\)$/, "Caiu recentemente ($1)"],
    [/^(\d+) \/ (\d+) thèmes cochés · (\d+) affichés$/, "$1 / $2 temas marcados · $3 exibidos"],
    [/^Les trois textes partent dans le Sistema de Correção à la fin de l'épreuve \(1 crédit par tâche · vous avez (\d+) crédits?\)\.$/, "Os três textos vão para o Sistema de Correção no fim da prova (1 crédito por tarefa · você tem $1 crédito(s))."],
    [/^Autres thèmes$/, "Outros temas"],
    [/^La production entre dans la file du Sistema de Correção et est corrigée sur la grille de l'examen\. Vous la retrouvez dans « Mes corrections »\. 1 crédit · vous en avez (\d+)\.$/, "A produção entra na fila do Sistema de Correção e é corrigida com a grade da prova. Você a encontra em « Minhas correções ». 1 crédito · você tem $1."],
    [/^Envoyer cet enregistrement et sa transcription à un professeur \? 1 crédit de correction sera utilisé \(vous en avez (\d+)\)\.$/, "Enviar esta gravação e a transcrição a um professor? Será usado 1 crédito de correção (você tem $1)."],
    [/^✓ Envoyé \(protocole (.+)\) ·$/, "✓ Enviado (protocolo $1) ·"],
    [/^Envoyée le (.+) · corrigée le (.+) par (.+)$/, "Enviada em $1 · corrigida em $2 por $3"],
    [/^Envoyée le (.+) · corrigée le (.+)$/, "Enviada em $1 · corrigida em $2"],
    [/^Envoyée le (.+)$/, "Enviada em $1"],
    [/^Avec (.+)$/, "Com $1"],
    [/^(\S+) L'axe thématique : (.+)$/, function (m, ic, e) { return ic + " O eixo temático: " + e; }],
    [/^(\S+) Article de presse$/, "$1 Matéria de jornal"],
    [/^(\S+) Article scientifique$/, "$1 Artigo científico"],
    [/^(\S+) Extrait de livre$/, "$1 Trecho de livro"],
    [/^(\S+) Encyclopédie$/, "$1 Enciclopédia"],
    [/^En attente d'un professeur… (\d+:\d\d) · Vous pouvez commencer : il verra tout dès qu'il entrera\.$/, "Aguardando um professor… $1 · Você já pode começar: ele verá tudo assim que entrar."],
    [/^(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre) (\d{4})$/i, function (m, mes, ano) {
      var pt = { janvier: "Janeiro", "février": "Fevereiro", mars: "Março", avril: "Abril", mai: "Maio", juin: "Junho", juillet: "Julho", "août": "Agosto", septembre: "Setembro", octobre: "Outubro", novembre: "Novembro", "décembre": "Dezembro" };
      return pt[mes.toLowerCase()] + " de " + ano;
    }],
    [/^\((\d+) à faire\)$/, "($1 a fazer)"],
    [/^avec (.+)$/, "com $1"],
    [/^Élèves qui demandent un professeur en direct : (\d+)$/, "Alunos pedindo um professor ao vivo: $1"],
    [/^(.+) suit votre production en direct\.$/, "$1 está acompanhando sua produção ao vivo."],
    [/^Correction détaillée sur la grille de l'examen, dans « Mes corrections »\. 1 crédit · vous en avez (\d+)\.$/, "Correção detalhada com a grade do exame, em « Minhas correções ». 1 crédito · você tem $1."],
    [/^Envoyer ce texte à un professeur \? 1 crédit sera utilisé \(vous en avez (\d+)\)\.$/, "Enviar este texto a um professor? Será usado 1 crédito (você tem $1)."],
    [/^Tâche (\d) · (.+)$/, function (m, n, s) { return "Tarefa " + n + " · " + (TAREFA[s] || s); }],
    [/^T(\d) · (.+)$/, function (m, n, s) { return "T" + n + " · " + (TAREFA[s] || s); }],
    [/^(\d+) sujets? →$/, "$1 temas →"],
    [/^(\d+) sujets? possibles? · (\d+) déjà tirés?\.$/, function (m, a, b) { return a + plural(a, " tema possível", " temas possíveis") + " · " + b + plural(b, " já sorteado.", " já sorteados."); }],
    [/^Le tirage au sort choisit parmi les (\d+) sujets? affichés?\.$/, "O sorteio escolhe entre os $1 temas exibidos."],
    [/^Tous \((\d+)\)$/, "Todos ($1)"],
    [/^tombé (\d+)×$/, "caiu $1×"],
    [/^tombé (\d+) fois$/, "caiu $1 vezes"],
    [/^Afficher les (\d+) autres sujets de cet axe$/, "Mostrar os outros $1 temas deste eixo"],
    [/^(\d+) mots? \(min\. (\d+), max\. (\d+)\)$/, "$1 palavras (mín. $2, máx. $3)"],
    [/^(\d+) mots?$/, "$1 palavras"],
    [/^(\d+) mots? · attendu : (\d+) à (\d+)$/, "$1 palavras · esperado: $2 a $3"],
    [/^(\d+) mots? \((\d+) à (\d+)\)$/, "$1 palavras ($2 a $3)"],
    [/^(\d+) mots? minimum · (\d+) mots? maximum · temps conseillé : (\d+) min$/, "$1 palavras no mínimo · $2 no máximo · tempo recomendado: $3 min"],
    [/^(\d+) mots? minimum · (\d+) mots? maximum$/, "$1 palavras no mínimo · $2 no máximo"],
    [/^tâches? de votre professeur\(e\) à faire$/, "tarefa(s) do seu professor para fazer"],
    [/^(\d+) tâches? à faire$/, function (m, n) { return n + plural(n, " tarefa a fazer", " tarefas a fazer"); }],
    [/^(\d+) à faire$/, "$1 a fazer"],
    [/^(\d+) textes?( →)?$/, "$1 textos$2"],
    [/^(\d+) modèles?( →)?$/, "$1 modelos$2"],
    [/^(\d+) sujets?$/, "$1 temas"],
    [/^(.+) · tombé (\d+)×$/, "$1 · caiu $2×"],
    [/^Tous les élèves \((\d+)\)$/, "Todos os alunos ($1)"],
    [/^Étape conseillée : Tâche (\d)$/, "Etapa recomendada: Tarefa $1"],
    [/^Étape conseillée : Relecture$/, "Etapa recomendada: Revisão"],
    [/^Tâche (\d) · (\d+) min$/, "Tarefa $1 · $2 min"],
    [/^Relecture · (\d+) min$/, "Revisão · $1 min"],
    [/^Brouillon enregistré à (.+)$/, "Rascunho salvo às $1"],
    [/^Il vous reste (.+)\. Vos textes ont été restaurés(.*)$/, function (m, t, r) { return "Você ainda tem " + t + ". Seus textos foram restaurados" + (r.indexOf("pause") >= 0 ? " (o tempo ficou pausado enquanto você estava fora)." : "."); }],
    [/^✓ Épreuve envoyée( automatiquement)? \((\d+) tâches?\)$/, function (m, a, n) { return "✓ Prova enviada" + (a ? " automaticamente" : "") + " (" + n + plural(n, " tarefa)", " tarefas)"); }],
    [/^(\d+) corrections? restantes? aujourd'hui$/, function (m, n) { return n + plural(n, " correção restante hoje", " correções restantes hoje"); }],
    [/^Correction par l'IA · NCLC estimé (.+)$/, "Correção pela IA · NCLC estimado $1"],
    [/^(\d+) mots écrits · attendu : (\d+) à (\d+)$/, "$1 palavras escritas · esperado: $2 a $3"],
    [/^Enregistrement terminé · (.+)$/, "Gravação concluída · $1"],
    [/^Essai (\d+) · (.+)$/, "Tentativa $1 · $2"],
    [/^Mes devoirs$/, "Minhas tarefas"],
    [/^Ce sujet est tombé (\d+) fois aux examens de 2023 à 2026\.$/, "Este tema caiu $1 vezes nas provas de 2023 a 2026."],
    [/^Mode examen \((.+)\)$/, "Modo prova ($1)"],
    [/^Dictée terminée : (\d+) ?% de réussite\.$/, "Ditado concluído: $1% de acerto."],
    [/^Phrase (\d+) \/ (\d+)$/, "Frase $1 / $2"],
    [/^(\d+) lettres? · (\d+) caractères?$/, "$1 letras · $2 caracteres"],
    [/^Messages de votre professeur\(e\) \((\d+) à faire\)$/, "Mensagens do seu professor ($1 a fazer)"],
    [/^À faire \((\d+)\)$/, "A fazer ($1)"],
    [/^Mes erreurs \((\d+)\)$/, "Meus erros ($1)"],
    [/^★ Sujets à réviser \((\d+)\)$/, "★ Temas para revisar ($1)"],
    [/^Mes mots \((\d+)\)$/, "Minhas palavras ($1)"],
    [/^✓ Devoirs terminés \((\d+)\)$/, "✓ Tarefas concluídas ($1)"],
    [/^Épreuves écrites en cours : (\d+)$/, "Provas escritas em andamento: $1"],
    [/^Élèves en ligne : (\d+)$/, "Alunos on-line: $1"],
    [/^(\d+) questions? à revoir\. (.*)$/, function (m, n) { return n + plural(n, " questão para revisar.", " questões para revisar.") + " Seus erros de produção (abaixo) também aparecem lá."; }],
    [/^Réafficher (\d+) sujets? retirés?$/, "Mostrar de novo $1 tema(s) retirado(s)"],
    [/^Retirer de « À la une »$/, "Retirar do « À la une »"],
    [/^Les sujets à travailler en priorité ce mois-ci : un par tâche, choisis par votre professeure ou parmi ceux qui tombent le plus\.(.*)$/, "Os temas para treinar primeiro neste mês: um por tarefa, escolhidos pela sua professora ou entre os que mais caem."],
    [/^Bonjour, (.+)\.$/, "Olá, $1."],
    [/^Ambiente de Produção · (.+)$/, function (m, c) { return "Ambiente de Produção · " + c.replace("Français", "Francês"); }],
    [/^\((\d+) sujets? disponibles?\)$/, "($1 temas disponíveis)"],
    [/^Il est essentiel que .*$/, null]   // fórmula: fica em francês
  ];

  var dic = {}, fragmentos = [];
  var feito = typeof WeakSet !== "undefined" ? new WeakSet() : null;

  function traduzirTexto(t) {
    var nucleo = t.replace(/\s+/g, " ").trim();
    if (!nucleo || !/[A-Za-zÀ-ÿ]/.test(nucleo)) return null;
    if (Object.prototype.hasOwnProperty.call(dic, nucleo)) return t.replace(nucleo.length === t.length ? t : t.trim(), dic[nucleo]);
    for (var i = 0; i < REGRAS.length; i++) {
      var r = REGRAS[i];
      if (r[0].test(nucleo)) return r[1] === null ? null : t.replace(t.trim(), nucleo.replace(r[0], r[1]));
    }
    // Trechos longos conhecidos dentro de um texto maior (frases montadas com variáveis).
    var mudou = false, novo = t;
    for (var j = 0; j < fragmentos.length; j++) {
      if (novo.indexOf(fragmentos[j]) >= 0) { novo = novo.split(fragmentos[j]).join(dic[fragmentos[j]]); mudou = true; }
    }
    return mudou ? novo : null;
  }

  function preservado(el) { return el && el.closest && !!el.closest(PRESERVAR) && !el.closest(SEMPRE); }

  function traduzirNo(no) {
    if (no.nodeType === 3) {
      if (feito && feito.has(no)) return;
      var pai = no.parentElement;
      if (!pai || preservado(pai) || pai.tagName === "SCRIPT" || pai.tagName === "STYLE") return;
      var t = traduzirTexto(no.nodeValue);
      if (t !== null && t !== no.nodeValue) { no.nodeValue = t; if (feito) feito.add(no); }
      return;
    }
    if (no.nodeType !== 1 || no.tagName === "SCRIPT" || no.tagName === "STYLE") return;
    if (no.matches && no.matches(PRESERVAR)) { if (no.querySelectorAll) no.querySelectorAll(SEMPRE).forEach(function (t) { for (var c = t.firstChild; c; c = c.nextSibling) traduzirNo(c); }); return; }
    ["placeholder", "title", "aria-label"].forEach(function (a) {
      var v = no.getAttribute && no.getAttribute(a);
      if (v && !no.hasAttribute("data-fr-" + a)) {
        var t = traduzirTexto(v);
        if (t !== null) { no.setAttribute("data-fr-" + a, v); no.setAttribute(a, t); }
      }
    });
    if (no.tagName === "OPTION" && preservado(no)) return;
    for (var c = no.firstChild; c; c = c.nextSibling) traduzirNo(c);
  }

  // Eixos e nomes das tarefas: traduzidos nos dados, assim todos os rótulos já saem em pt.
  window.FNM_TRADUZIR_BANCO = function (B) {
    if (!B || !B.eixos) return;
    Object.keys(EIXOS).forEach(function (k) { if (B.eixos[k]) B.eixos[k].nome = EIXOS[k]; });
  };

  window.FNM_I18N_PRONTO = fetch("i18n/producao-pt.json", { cache: "no-cache" })
    .then(function (r) { return r.ok ? r.json() : {}; })
    .catch(function () { return {}; })
    .then(function (d) {
      dic = d;
      fragmentos = Object.keys(d).filter(function (k) { return k.length >= 18; }).sort(function (a, b) { return b.length - a.length; });
      // confirm/alert/prompt do app também em português
      ["confirm", "alert", "prompt"].forEach(function (f) {
        var orig = window[f].bind(window);
        window[f] = function (msg) {
          var args = Array.prototype.slice.call(arguments);
          if (typeof msg === "string") args[0] = msg.split("\n").map(function (l) { var t = traduzirTexto(l); return t === null ? l : t; }).join("\n");
          return orig.apply(window, args);
        };
      });
      var raiz = document.getElementById("fnm-raiz") || document.body;
      traduzirNo(raiz);
      new MutationObserver(function (lista) {
        lista.forEach(function (m) {
          if (m.type === "characterData") { if (feito) feito.delete(m.target); traduzirNo(m.target); }
          else m.addedNodes.forEach(traduzirNo);
        });
      }).observe(raiz, { childList: true, subtree: true, characterData: true });
    });
})();
