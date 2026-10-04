// =====================================================================
// Carregado no <head> de todas as páginas, logo depois de js/dialogos.js.
// Site em francês (Configurações › Idioma): carrega o tradutor em todas as páginas; a página fica
// invisível só na primeira passada para não aparecer em português. Idioma trocado em outra aba ou num
// quadro embutido (Configurações dentro do Meu Espaço): a página recarrega no novo idioma.
(function () {
  var idioma; try { idioma = localStorage.getItem("site-idioma"); } catch (e) { return; }
  if (!window.__fnmIdiomaRecarga) {
    window.__fnmIdiomaRecarga = true;
    window.addEventListener("storage", function (e) { if (e.key === "site-idioma" && e.oldValue !== e.newValue) location.reload(); });
  }
  if (idioma !== "fr" || window.__fnmTraducaoCarregando) return;
  window.__fnmTraducaoCarregando = true;
  document.documentElement.classList.add("fnm-traduzindo");
  var st = document.createElement("style");
  st.textContent = "html.fnm-traduzindo body{opacity:0!important}";
  (document.head || document.documentElement).appendChild(st);
  setTimeout(function () { document.documentElement.classList.remove("fnm-traduzindo"); }, 2000);
  var s = document.createElement("script");
  s.src = "js/traducaoSite.js";
  (document.head || document.documentElement).appendChild(s);
})();
