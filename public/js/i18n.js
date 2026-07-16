// ===================== I18n — internacionalização (pt-BR / fr) =====================
// Sistema baseado em chaves de tradução: nenhum texto fixo no HTML marcado com
// data-i18n/data-i18n-placeholder, tudo resolvido a partir de public/i18n/*.json.
// Preparado para novos idiomas — basta adicionar um novo dicionário e incluir o
// código na lista IDIOMAS_SUPORTADOS.
(function () {
  const STORAGE_KEY = "site-idioma";
  const IDIOMAS_SUPORTADOS = ["pt-BR", "fr"];
  const IDIOMA_PADRAO = "pt-BR";

  let dicionario = {};
  let idiomaAtual = IDIOMA_PADRAO;

  function t(chave, vars) {
    let texto = dicionario[chave];
    if (texto === undefined) return chave;
    if (vars) Object.keys(vars).forEach(k => { texto = texto.replace(new RegExp("\\{" + k + "\\}", "g"), vars[k]); });
    return texto;
  }

  function aplicar() {
    document.querySelectorAll("[data-i18n]").forEach(el => {
      const chave = el.getAttribute("data-i18n");
      const texto = t(chave);
      if (el.hasAttribute("data-i18n-html")) el.innerHTML = texto;
      else el.textContent = texto;
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
      el.setAttribute("placeholder", t(el.getAttribute("data-i18n-placeholder")));
    });
    document.querySelectorAll("[data-i18n-title]").forEach(el => {
      el.setAttribute("title", t(el.getAttribute("data-i18n-title")));
    });
    document.documentElement.setAttribute("lang", idiomaAtual);
    document.dispatchEvent(new CustomEvent("i18n:aplicado", { detail: { idioma: idiomaAtual } }));
  }

  async function carregarDicionario(idioma) {
    try {
      const res = await fetch("i18n/" + idioma + ".json");
      dicionario = res.ok ? await res.json() : {};
    } catch (err) {
      dicionario = {};
    }
  }

  // opts.sincronizar (padrão true) manda a escolha para /api/auth/preferencias
  // quando há sessão — desligar ao aplicar um idioma que acabou de vir do
  // próprio servidor, pra não regravar o que já está salvo.
  async function setLocale(idioma, opts) {
    if (!IDIOMAS_SUPORTADOS.includes(idioma)) return;
    idiomaAtual = idioma;
    localStorage.setItem(STORAGE_KEY, idioma);
    await carregarDicionario(idioma);
    aplicar();

    const sincronizar = !opts || opts.sincronizar !== false;
    const token = localStorage.getItem("token");
    if (sincronizar && token) {
      fetch("/api/auth/preferencias", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ idioma })
      }).catch(() => { /* silencioso — próxima sincronização tenta de novo */ });
    }
  }

  async function iniciar() {
    idiomaAtual = localStorage.getItem(STORAGE_KEY) || IDIOMA_PADRAO;
    await carregarDicionario(idiomaAtual);
    aplicar();
  }

  window.I18n = {
    t,
    aplicar,
    setLocale,
    idiomasSuportados: IDIOMAS_SUPORTADOS,
    get idioma() { return idiomaAtual; }
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})();
