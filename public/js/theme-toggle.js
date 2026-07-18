(function () {
  const STORAGE_KEY = "site-theme";

  function iconeTema(tema) {
    return tema === "dark"
      ? '<img src="img/icones/sun.svg" alt="" style="width:20px; height:20px;">'
      : '<img src="img/icones/moon.svg" alt="" style="width:20px; height:20px;">';
  }

  function aplicarTema(tema) {
    document.documentElement.setAttribute("data-theme", tema);
    const btn = document.getElementById("themeToggleBtn");
    if (btn) btn.innerHTML = iconeTema(tema);
  }

  const salvo = localStorage.getItem(STORAGE_KEY) || "light";
  aplicarTema(salvo);

  // opts.sincronizar (padrão true) manda a escolha para /api/auth/preferencias
  // quando há sessão, pra restaurar o mesmo tema em outro dispositivo no
  // próximo login — desligar ao aplicar um tema que acabou de vir do servidor.
  function setTema(tema, opts) {
    if (tema !== "light" && tema !== "dark") return;
    localStorage.setItem(STORAGE_KEY, tema);
    aplicarTema(tema);

    const sincronizar = !opts || opts.sincronizar !== false;
    const token = localStorage.getItem("token");
    if (sincronizar && token) {
      fetch("/api/auth/preferencias", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ tema })
      }).catch(() => { /* silencioso */ });
    }
  }

  function criarBotao() {
    if (document.getElementById("themeToggleBtn")) return;
    const btn = document.createElement("button");
    btn.id = "themeToggleBtn";
    btn.type = "button";
    btn.setAttribute("aria-label", "Alternar tema claro/escuro");
    btn.title = "Alternar tema claro/escuro";
    btn.innerHTML = iconeTema(localStorage.getItem(STORAGE_KEY) || "light");
    btn.addEventListener("click", () => {
      const atual = document.documentElement.getAttribute("data-theme") || "light";
      setTema(atual === "dark" ? "light" : "dark");
    });
    document.body.appendChild(btn);
  }

  if (document.body) {
    criarBotao();
  } else {
    document.addEventListener("DOMContentLoaded", criarBotao);
  }

  window.ThemeToggle = { setTema, get tema() { return document.documentElement.getAttribute("data-theme") || "light"; } };
})();
