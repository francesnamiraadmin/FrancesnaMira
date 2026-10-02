// =====================================================================
// Painel da equipe: barra de navegação comum a todas as páginas da equipe.
//  - « Painel da equipe » volta para o painel (minha-conta.html, já aberto);
//  - mostra a página e a aba atual;
//  - « Aba principal » volta para a primeira aba da página (atalho: Alt+Home).
// Uso: <link rel="stylesheet" href="css/painel-equipe.css"> depois do <style> da página
//      e <script src="js/painelEquipe.js" defer></script>.
// =====================================================================
(function () {
  var URL_PAINEL = "minha-conta.html#painel-equipe";
  // Grupos de abas, do mais importante ao menos: o primeiro encontrado é o da página.
  var GRUPOS_ABAS = ["#secaoNav", ".secao-nav", ".abas", ".tabs-row", ".top-tabs", "nav.tabs", ".tabs", ".filtro-tabs"];

  function grupoDeAbas() {
    for (var i = 0; i < GRUPOS_ABAS.length; i++) {
      var g = document.querySelector(GRUPOS_ABAS[i]);
      if (g && g.querySelectorAll("button, a").length > 1 && g.offsetParent !== null) return g;
    }
    return null;
  }
  function abas(g) { return Array.prototype.slice.call(g.querySelectorAll("button, a")); }
  function ativa(b) {
    return b.classList.contains("active") || b.classList.contains("ativa") || b.classList.contains("ativo") ||
      b.getAttribute("aria-selected") === "true" || b.getAttribute("aria-pressed") === "true" || b.getAttribute("aria-current") === "page";
  }
  function texto(el) { return (el && el.textContent || "").replace(/\s+/g, " ").trim(); }

  function nomePagina() {
    var h = document.querySelector(".painel-header h1, main h1, .wrap h1, h1:not(header h1)");
    var t = texto(h) || document.title.split(/\s[—–-]\s/)[0];
    return t.slice(0, 60);
  }

  function montar() {
    if (document.querySelector(".pe-barra")) return;
    var barra = document.createElement("nav");
    barra.className = "pe-barra";
    barra.setAttribute("aria-label", "Navegação do Painel da equipe");
    barra.innerHTML =
      '<a class="pe-painel" href="' + URL_PAINEL + '" title="Voltar ao Painel da equipe">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>Painel da equipe</a>' +
      '<span class="pe-trilha"><span class="pe-sep">›</span><span class="pe-pagina"></span><span class="pe-sep pe-sep-aba" hidden>›</span><span class="pe-aba-atual" hidden></span></span>' +
      '<button type="button" class="pe-principal" hidden title="Voltar à aba principal da página (Alt+Home)">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></svg>' +
        '<span class="pe-principal-txt">Aba principal</span><kbd>Alt+Home</kbd></button>';
    barra.querySelector(".pe-pagina").textContent = nomePagina();

    // logo abaixo do cabeçalho da página (ou da barra do site)
    var navSite = document.getElementById("app-navbar");
    var header = document.querySelector("body > header");
    var ref = navSite || header;
    if (navSite) document.body.classList.add("pe-com-navbar");
    if (ref && ref.parentNode) ref.parentNode.insertBefore(barra, ref.nextSibling);
    else document.body.insertBefore(barra, document.body.firstChild);

    var botao = barra.querySelector(".pe-principal");
    var atual = barra.querySelector(".pe-aba-atual"), sep = barra.querySelector(".pe-sep-aba");
    // só mexe no que mudou (a barra não pode disparar o próprio observador sem fim)
    var pr = function (el, k, v) { if (el[k] !== v) el[k] = v; };
    function atualizar() {
      var g = grupoDeAbas();
      if (!g) { pr(botao, "hidden", true); pr(atual, "hidden", true); pr(sep, "hidden", true); return; }
      var l = abas(g), a = l.filter(ativa)[0] || null;
      pr(atual, "textContent", a ? texto(a).slice(0, 40) : "");
      pr(atual, "hidden", !a); pr(sep, "hidden", !a);
      pr(botao, "hidden", !a || a === l[0]);
      pr(botao.querySelector(".pe-principal-txt"), "textContent", "Aba principal: " + texto(l[0]).slice(0, 30));
    }
    function irPrincipal() {
      var g = grupoDeAbas(); if (!g) return;
      var primeira = abas(g)[0];
      if (primeira) primeira.click();
      window.scrollTo({ top: 0, behavior: "smooth" });
      setTimeout(atualizar, 50);
    }
    botao.addEventListener("click", irPrincipal);
    document.addEventListener("keydown", function (e) { if (e.altKey && e.key === "Home") { e.preventDefault(); irPrincipal(); } });
    document.addEventListener("click", function () { setTimeout(atualizar, 30); }, true);
    new MutationObserver(function (regs) { if (regs.some(function (r) { return !barra.contains(r.target); })) atualizar(); }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ["class", "aria-selected", "aria-pressed", "hidden"] });
    atualizar();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", montar);
  else montar();
})();
