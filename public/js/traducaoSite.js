// =====================================================================
// SITE EM FRANCÊS (Configurações › Idioma › Français)
// Com o idioma em francês, todo texto em português da página vira francês: títulos, menus, botões,
// textos, avisos, campos (placeholder, title, aria-label) e o que aparece depois (listas, janelas,
// resultados). As traduções vêm do dicionário fixo i18n/site-fr.json e, para o que faltar, de
// POST /api/traducao/fr (traduz uma vez e guarda para todos); ficam também em cache no navegador.
// Não são tocados: o que já está em francês (questões, Ambiente de Produção, modelos), o que a
// pessoa digita (campos e editores) e o que estiver marcado com translate="no" / .notranslate.
// Carregado por js/theme-toggle.js e js/appShell.js (só quando o idioma é francês).
// =====================================================================
(function () {
  if (window.__fnmTraducao) return;
  window.__fnmTraducao = true;
  var idioma; try { idioma = localStorage.getItem("site-idioma"); } catch (e) { return; }
  if (idioma !== "fr") return;
  document.documentElement.lang = "fr";

  var CACHE = "fnm-trad-fr-v2", dic = {}, pendentes = {}, semTraducao = {}, timer = null, enviando = false, primeiraVez = true;
  // v2: o cache antigo (v1) podia ter traduções trocadas de lugar — descartado
  try { localStorage.removeItem("fnm-trad-fr-v1"); } catch (e) { /* ok */ }
  try { dic = JSON.parse(localStorage.getItem(CACHE) || "{}") || {}; } catch (e) { dic = {}; }

  var PULAR = "script,style,noscript,textarea,code,pre,[translate='no'],.notranslate,.fnm-app,[contenteditable=''],[contenteditable='true'],.ql-editor,.editor";
  var ATRIBUTOS = ["placeholder", "title", "aria-label", "alt"];
  var PT = /\b(não|nao|você|vocês|está|estão|são|também|então|para|com|uma|um|dos|das|nos|nas|pelo|pela|seu|sua|seus|suas|isso|este|esta|esse|essa|ao|aos|às|mais|já|até|quando|como|muito|aqui|agora|ainda|ou|em|na|no|do|da|de|que|se|por|sem|sobre|entre|depois|antes|cada|todo|toda|todos|meu|minha|meus|minhas)\b|ção|ções|ões|ã|õ|ê(?!t)/gi;
  var FR = /\b(le|la|les|des|du|est|et|une|un|vous|nous|pour|avec|dans|sur|pas|qui|que|ce|cette|ces|sont|au|aux|leur|leurs|très|être|avoir|il|elle|ils|elles|je|tu|mon|ma|mes|votre|vos|notre|nos|mais|où|aussi|chez|plus|moins|tout|tous|toute|fait|été)\b|è|ù|œ|ç(?!ão|ões)|«|»|qu'|l'|d'|n'|c'|j'/gi;

  function normal(t) { return t.replace(/\s+/g, " ").trim(); }
  // textos que já são traduções nossas: nunca voltam para a fila
  var saida = {};
  function registrarSaida() { for (var k in dic) saida[normal(dic[k])] = 1; }
  // vale a pena traduzir? (tem letras, não é número/e-mail/link e não parece já estar em francês)
  function traduzivel(t) {
    if (t.length < 2 || !/[A-Za-zÀ-ÿ]{2}/.test(t) || saida[t]) return false;
    if (/^[\w.+-]+@[\w-]+\.[\w.]+$/.test(t) || /^https?:\/\//.test(t)) return false;
    // marcas que só o português tem: traduz mesmo que a frase comece em francês (« Diplôme… — certificação oficial »)
    if (/ção|ções|ões|[ãõ]|(não|você|vocês|até|também|então)/i.test(t)) return true;
    var pt = (t.match(PT) || []).length, fr = (t.match(FR) || []).length;
    return !(fr > pt);
  }
  function pular(el) { return !el || (el.closest && el.closest(PULAR)); }

  var original = new WeakMap();   // nó de texto → texto original (para não retraduzir o que já mudamos)
  function tratarTexto(no) {
    var v = no.nodeValue; if (!v || !v.trim()) return;
    if (original.has(no) && original.get(no).feito === v) return;
    var pai = no.parentElement; if (pular(pai)) return;
    var chave = normal(v); if (!traduzivel(chave) || semTraducao[chave]) return;
    if (dic[chave] != null) aplicarTexto(no, v, chave);
    else { pendentes[chave] = 1; original.set(no, { orig: v, chave: chave }); agendar(); }
  }
  function aplicarTexto(no, v, chave) {
    var tr = dic[chave]; if (tr == null) return;
    var ini = (v.match(/^\s*/) || [""])[0], fim = (v.match(/\s*$/) || [""])[0];
    var novo = ini + tr + fim;
    original.set(no, { orig: v, chave: chave, feito: novo });
    if (no.nodeValue !== novo) no.nodeValue = novo;
  }
  function tratarAtributos(el) {
    if (pular(el)) return;
    for (var i = 0; i < ATRIBUTOS.length; i++) {
      var a = ATRIBUTOS[i], v = el.getAttribute(a); if (!v) continue;
      var chave = normal(v); if (!traduzivel(chave) || semTraducao[chave]) continue;
      if (dic[chave] != null) { if (v !== dic[chave]) el.setAttribute(a, dic[chave]); }   // (o observador volta aqui com o valor traduzido, que está em « saida »)
      else { pendentes[chave] = 1; agendar(); }
    }
    if (el.tagName === "INPUT" && /^(button|submit|reset)$/i.test(el.type) && el.value) {
      var c = normal(el.value); if (traduzivel(c)) { if (dic[c] != null) el.value = dic[c]; else { pendentes[c] = 1; agendar(); } }
    }
  }
  function percorrer(raiz) {
    if (!raiz) return;
    if (raiz.nodeType === 3) { tratarTexto(raiz); return; }
    if (raiz.nodeType !== 1 || pular(raiz)) return;
    tratarAtributos(raiz);
    var w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
      acceptNode: function (n) { return n.nodeType === 1 && pular(n) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT; }
    });
    var n; while ((n = w.nextNode())) { if (n.nodeType === 3) tratarTexto(n); else tratarAtributos(n); }
  }
  function titulo() {
    var t = normal(document.title || ""); if (!traduzivel(t) || semTraducao[t]) return;
    // só troca se mudar: atribuir document.title dispara o observador do <title> de novo
    if (dic[t] != null) { if (document.title !== dic[t]) document.title = dic[t]; } else { pendentes[t] = 1; agendar(); }
  }

  function agendar() { if (!timer) timer = setTimeout(enviar, primeiraVez ? 30 : 250); }
  function salvarCache() {
    try {
      var ch = Object.keys(dic);
      if (ch.length > 6000) ch.slice(0, ch.length - 6000).forEach(function (k) { delete dic[k]; });
      localStorage.setItem(CACHE, JSON.stringify(dic));
    } catch (e) { /* cheio: segue sem cache */ }
  }
  function enviar() {
    timer = null;
    if (enviando) { agendar(); return; }
    var lista = Object.keys(pendentes).filter(function (k) { return dic[k] == null && !semTraducao[k]; }).slice(0, 80);
    if (!lista.length) { mostrar(); return; }
    lista.forEach(function (k) { delete pendentes[k]; });
    enviando = true;
    fetch("/api/traducao/fr", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ textos: lista }) })
      .then(function (r) { return r.ok ? r.json() : { traducoes: {} }; })
      .then(function (d) {
        var tr = (d && d.traducoes) || {};
        // sem tradução agora (IA fora do ar, limite): fica em português nesta visita e é pedida de novo na próxima
        lista.forEach(function (k) { if (typeof tr[k] === "string") dic[k] = tr[k]; else semTraducao[k] = 1; });
        salvarCache(); registrarSaida();
        percorrer(document.body); titulo();
      })
      .catch(function () { lista.forEach(function (k) { semTraducao[k] = 1; }); })
      .then(function () { enviando = false; if (Object.keys(pendentes).length) agendar(); else mostrar(); });
  }
  // a página fica escondida só na primeira passada (no máximo 1,5 s), para não piscar em português
  function mostrar() { primeiraVez = false; document.documentElement.classList.remove("fnm-traduzindo"); }
  setTimeout(mostrar, 1500);

  function iniciar() {
    fetch("i18n/site-fr.json").then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; })
      .then(function (fixo) {
        Object.keys(fixo || {}).forEach(function (k) { if (dic[k] == null) dic[k] = fixo[k]; });
        registrarSaida();
        percorrer(document.body); titulo();
        if (!Object.keys(pendentes).length) mostrar();
        new MutationObserver(function (muts) {
          for (var i = 0; i < muts.length; i++) {
            var m = muts[i];
            if (m.type === "characterData") tratarTexto(m.target);
            else if (m.type === "attributes") tratarAtributos(m.target);
            else for (var j = 0; j < m.addedNodes.length; j++) percorrer(m.addedNodes[j]);
          }
        }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATRIBUTOS });
        new MutationObserver(titulo).observe(document.querySelector("title") || document.head, { childList: true, characterData: true, subtree: true });
      });
  }
  if (document.body) iniciar(); else document.addEventListener("DOMContentLoaded", iniciar);
})();
