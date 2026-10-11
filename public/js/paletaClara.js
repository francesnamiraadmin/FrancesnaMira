// =====================================================================
// Paleta do tema claro: azul, amarelo e branco no site inteiro.
// As páginas têm cores próprias espalhadas pelo CSS e pelo HTML gerado em JS (roxo, rosa,
// verde-água, laranja…). No tema claro, este script troca cada cor fora da paleta pelo tom
// equivalente de azul (cores frias e textos) ou de amarelo (fundos e bordas quentes), mantendo
// a claridade e a transparência originais. Ficam como estão:
//  - neutros (branco, cinzas, preto) e o próprio fundo da página (--bg-gradient);
//  - as cores que já são azuis ou amarelas;
//  - o vermelho e o verde de certo/errado, sucesso/erro, atraso etc. (o significado importa).
// No tema escuro tudo volta ao original. Carregado por js/theme-toggle.js (e direto nas páginas
// sem o botão de tema).
// =====================================================================
(function () {
  if (window.PaletaClara) return;

  var AZUL_H = 222, AMARELO_H = 45;
  // Seletores/classes com significado de estado: o vermelho e o verde deles ficam.
  var SEMANTICO = /(erro|error|errad|incorret|wrong|invalid|danger|perig|alerta|alert|atras|negat|falha|fail|reprov|rejeit|cancel|apagar|excluir|remov|del\b|sair|sucesso|success|corret|certo|acert|valid|positiv|conclu|feito|aprov|pago|online|ok\b|\bon\b|vivo|ponto|nota-chip|alta|baixa|media|ins\b|ca-cat|marca|grifo|realce|surlign|legenda|cat-|diff)/i;
  var FUNDO_INTOCADO = /^--bg-gradient$/;
  // o fundo da página (html/body e o gradiente da marca) não muda
  var SEL_FUNDO = /^\s*(html|body|:root)(\[[^\]]*\])?(\s*,\s*(html|body|:root)(\[[^\]]*\])?)*\s*$/i;
  var PROP_FUNDO = /^background/;

  // ---------- conversões ----------
  function hexRgb(h) {
    h = h.slice(1);
    if (h.length === 3 || h.length === 4) h = h.split("").map(function (c) { return c + c; }).join("");
    var n = parseInt(h.slice(0, 6), 16);
    return [n >> 16 & 255, n >> 8 & 255, n & 255, h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1];
  }
  function rgbHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, h = 0, s = 0;
    if (mx !== mn) {
      var d = mx - mn;
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h *= 60;
    }
    return [h, s, l];
  }
  function hsl(h, s, l, a) {
    var t = "hsl(" + Math.round(h) + " " + Math.round(s * 100) + "% " + Math.round(l * 100) + "%";
    return t + (a < 1 ? " / " + (Math.round(a * 1000) / 1000) : "") + ")";
  }

  // Cor fora da paleta → tom da paleta (ou null para manter).
  function mapear(r, g, b, a, ehTexto, semantico) {
    var x = rgbHsl(r, g, b), h = x[0], s = x[1], l = x[2];
    if (s < 0.12 || l < 0.1 || l > 0.97) return null;                 // neutros
    if (h >= 195 && h <= 250) return null;                             // já é azul
    if (h >= 38 && h <= 62) return null;                               // já é amarelo/dourado
    var verde = h > 80 && h < 170, vermelho = h < 20 || h > 340;
    if (semantico && (verde || vermelho)) return null;                 // certo/errado
    var quente = h < 38 || h > 290;
    if (ehTexto || !quente || l < 0.42) {
      // azul: textos, cores frias e tons escuros (um vermelho-escuro vira azul-marinho)
      return hsl(AZUL_H, Math.min(0.88, Math.max(0.62, s)), Math.min(0.94, Math.max(0.2, l)), a);
    }
    return hsl(AMARELO_H, 0.96, Math.min(0.92, Math.max(0.5, l)), a);  // amarelo: fundos e bordas quentes
  }

  var RE_COR = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b|rgba?\(\s*\d+(?:\.\d+)?%?\s*[, ]\s*\d+(?:\.\d+)?%?\s*[, ]\s*\d+(?:\.\d+)?%?\s*(?:[,/]\s*[\d.]+%?\s*)?\)/gi;
  function trocarValor(valor, ehTexto, semantico) {
    if (!valor || valor.indexOf("var(") === 0 && valor.indexOf(",") < 0) return null;
    var mudou = false;
    var novo = valor.replace(RE_COR, function (c) {
      var rgba;
      if (c[0] === "#") rgba = hexRgb(c);
      else {
        var n = c.match(/[\d.]+%?/g).map(function (v, i) { return /%$/.test(v) ? (i < 3 ? parseFloat(v) * 2.55 : parseFloat(v) / 100) : parseFloat(v); });
        rgba = [n[0], n[1], n[2], n.length > 3 ? n[3] : 1];
      }
      var m = mapear(rgba[0], rgba[1], rgba[2], rgba[3], ehTexto, semantico);
      if (!m) return c;
      mudou = true;
      return m;
    });
    return mudou ? novo : null;
  }
  var RE_TEM_COR = new RegExp(RE_COR.source, "i");
  // Textos e variáveis (uma variável pode virar cor de texto em outro lugar) sempre em azul:
  // amarelo só em fundos e bordas, onde ele não some sobre o branco.
  var PROP_TEXTO = /^(color|-webkit-text-fill-color|caret-color|--.*)$/;
  var PROP_COR = /color|background|border|outline|shadow|fill|stroke|^--|gradient|decoration|column-rule/;

  // ---------- folhas de estilo (arquivos .css e <style> da página) ----------
  var alteracoes = [];   // [estilo, propriedade, valor original, prioridade]
  function percorrerRegras(regras, dentroEscuro) {
    for (var i = 0; i < regras.length; i++) {
      var r = regras[i];
      if (r.cssRules && !r.selectorText) {   // @media, @supports, @layer…
        var escuro = dentroEscuro || (r.media && /prefers-color-scheme:\s*dark/.test(r.media.mediaText));
        percorrerRegras(r.cssRules, escuro);
        continue;
      }
      if (!r.style || !r.selectorText || dentroEscuro) continue;
      var sel = r.selectorText;
      if (/data-theme=["']?dark/.test(sel)) continue;
      var semantico = SEMANTICO.test(sel), ehFundo = SEL_FUNDO.test(sel.replace(/:root\[data-theme=["']?light["']?\]/g, ":root"));
      for (var k = r.style.length - 1; k >= 0; k--) {
        var p = r.style[k];
        if (!PROP_COR.test(p) || FUNDO_INTOCADO.test(p) || (ehFundo && PROP_FUNDO.test(p))) continue;
        var v = r.style.getPropertyValue(p);
        var novo = trocarValor(v, PROP_TEXTO.test(p), semantico || /--(verde|vermelho|erro|sucesso|danger|success|ok|red|green)/i.test(p));
        if (novo === null) continue;
        var pri = r.style.getPropertyPriority(p);
        alteracoes.push([r.style, p, v, pri]);
        r.style.setProperty(p, novo, pri);
      }
    }
  }
  var folhasVistas = typeof WeakSet === "function" ? new WeakSet() : null;
  function aplicarFolhas() {
    for (var i = 0; i < document.styleSheets.length; i++) {
      var f = document.styleSheets[i];
      if (folhasVistas && folhasVistas.has(f)) continue;
      var regras;
      try { regras = f.cssRules; } catch (e) { continue; }   // folhas de outro domínio (Google Fonts)
      if (!regras) continue;
      if (folhasVistas) folhasVistas.add(f);
      percorrerRegras(regras, false);
    }
  }

  // ---------- estilos inline e atributos fill/stroke (HTML gerado em JS, gráficos) ----------
  var ATR = "data-pc-orig";
  function semanticoEl(el) {
    for (var n = el, i = 0; n && n.nodeType === 1 && i < 3; n = n.parentNode, i++) {
      if (SEMANTICO.test((n.getAttribute("class") || "") + " " + (n.id || ""))) return true;
    }
    return false;
  }
  function aplicarElemento(el) {
    if (el.nodeType !== 1 || el.id === "themeToggleBtn" || el === document.body || el === document.documentElement) return;
    var sem = null;
    var st = el.getAttribute("style");
    if (st && RE_TEM_COR.test(st) && el.getAttribute(ATR + "-style") !== st) {
      sem = semanticoEl(el);
      var partes = st.split(";").map(function (dec) {
        var i = dec.indexOf(":"); if (i < 0) return dec;
        var p = dec.slice(0, i).trim().toLowerCase();
        if (!PROP_COR.test(p) || FUNDO_INTOCADO.test(p)) return dec;
        var novo = trocarValor(dec.slice(i + 1), PROP_TEXTO.test(p), sem);
        return novo === null ? dec : dec.slice(0, i + 1) + novo;
      }).join(";");
      if (partes !== st) {
        el.setAttribute(ATR + "-style0", st);   // o original mais recente (o app pode ter mudado o estilo)
        el.setAttribute(ATR + "-style", partes);
        el.setAttribute("style", partes);
      }
    }
    ["fill", "stroke", "stop-color"].forEach(function (a) {
      var v = el.getAttribute(a);
      if (!v || v.charAt(0) !== "#" && v.indexOf("rgb") !== 0) return;
      sem = sem === null ? semanticoEl(el) : sem;
      var novo = trocarValor(v, false, sem);
      if (novo === null) return;
      if (!el.hasAttribute(ATR + "-" + a)) el.setAttribute(ATR + "-" + a, v);
      el.setAttribute(a, novo);
    });
  }
  function aplicarArvore(raiz) {
    if (!raiz || !raiz.querySelectorAll) return;
    if (raiz.nodeType === 1) aplicarElemento(raiz);
    var l = raiz.querySelectorAll("[style], [fill], [stroke], [stop-color]");
    for (var i = 0; i < l.length; i++) aplicarElemento(l[i]);
  }
  function restaurarElementos() {
    var l = document.querySelectorAll("[" + ATR + "-style0], [" + ATR + "-fill], [" + ATR + "-stroke], [" + ATR + "-stop-color]");
    for (var i = 0; i < l.length; i++) {
      var el = l[i];
      if (el.hasAttribute(ATR + "-style0")) { el.setAttribute("style", el.getAttribute(ATR + "-style0")); el.removeAttribute(ATR + "-style0"); el.removeAttribute(ATR + "-style"); }
      ["fill", "stroke", "stop-color"].forEach(function (a) { if (el.hasAttribute(ATR + "-" + a)) { el.setAttribute(a, el.getAttribute(ATR + "-" + a)); el.removeAttribute(ATR + "-" + a); } });
    }
  }

  // ---------- liga/desliga conforme o tema ----------
  var ativo = false, observador = null, pendentes = [], agendado = false;
  function processarPendentes() {
    agendado = false;
    if (!ativo) { pendentes = []; return; }
    aplicarFolhas();   // <style>/<link> que chegaram depois
    var l = pendentes; pendentes = [];
    for (var i = 0; i < l.length; i++) aplicarArvore(l[i]);
  }
  function agendar(n) {
    pendentes.push(n);
    if (!agendado) { agendado = true; (window.requestAnimationFrame || setTimeout)(processarPendentes); }
  }
  function ligar() {
    if (ativo) return;
    ativo = true;
    aplicarFolhas();
    aplicarArvore(document.documentElement);
    if (!observador && window.MutationObserver) {
      observador = new MutationObserver(function (regs) {
        for (var i = 0; i < regs.length; i++) {
          var r = regs[i];
          if (r.type === "attributes") { if (r.target.getAttribute(ATR + "-style") !== r.target.getAttribute("style")) agendar(r.target); }
          else for (var j = 0; j < r.addedNodes.length; j++) if (r.addedNodes[j].nodeType === 1) agendar(r.addedNodes[j]);
        }
      });
    }
    if (observador) observador.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["style", "fill", "stroke", "stop-color"] });
  }
  function desligar() {
    if (!ativo) return;
    ativo = false;
    if (observador) observador.disconnect();
    for (var i = alteracoes.length - 1; i >= 0; i--) { var a = alteracoes[i]; a[0].setProperty(a[1], a[2], a[3]); }
    alteracoes = [];
    if (folhasVistas) folhasVistas = new WeakSet();
    restaurarElementos();
  }
  function aplicar(tema) {
    if (/[?&]paleta=0(&|$)/.test(location.search)) return;   // comparação com as cores originais
    tema = tema || document.documentElement.getAttribute("data-theme") || "light";
    document.documentElement.classList.toggle("paleta-clara", tema !== "dark");
    if (tema === "dark") desligar(); else ligar();
  }

  window.PaletaClara = { aplicar: aplicar };
  // a página termina de carregar as folhas de estilo; depois, o tema trocado pelo botão
  // folhas que terminam de carregar depois (<link> lento, CSS injetado): passa nelas também
  var revisarFolhas = function () { if (ativo) aplicarFolhas(); };
  document.addEventListener("load", function (e) { if (e.target && e.target.tagName === "LINK") revisarFolhas(); }, true);
  window.addEventListener("load", function () { aplicar(); revisarFolhas(); });
  if (document.readyState !== "loading") aplicar(); else document.addEventListener("DOMContentLoaded", function () { aplicar(); });
  if (window.MutationObserver) new MutationObserver(function () { aplicar(); }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
})();
