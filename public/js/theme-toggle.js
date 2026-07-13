(function () {
  const STORAGE_KEY = "site-theme";

  function aplicarTema(tema) {
    document.documentElement.setAttribute("data-theme", tema);
    const btn = document.getElementById("themeToggleBtn");
    if (btn) btn.textContent = tema === "dark" ? "☀️" : "🌙";
  }

  const salvo = localStorage.getItem(STORAGE_KEY) || "dark";
  aplicarTema(salvo);

  function criarBotao() {
    if (document.getElementById("themeToggleBtn")) return;
    const btn = document.createElement("button");
    btn.id = "themeToggleBtn";
    btn.type = "button";
    btn.setAttribute("aria-label", "Alternar tema claro/escuro");
    btn.title = "Alternar tema claro/escuro";
    btn.textContent = (localStorage.getItem(STORAGE_KEY) || "dark") === "dark" ? "☀️" : "🌙";
    btn.addEventListener("click", () => {
      const atual = document.documentElement.getAttribute("data-theme") || "dark";
      const proximo = atual === "dark" ? "light" : "dark";
      localStorage.setItem(STORAGE_KEY, proximo);
      aplicarTema(proximo);
    });
    document.body.appendChild(btn);
  }

  if (document.body) {
    criarBotao();
  } else {
    document.addEventListener("DOMContentLoaded", criarBotao);
  }
})();
