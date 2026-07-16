// ===================== AuthStorage — sessão do usuário =====================
// O access token sempre vive em localStorage — todas as páginas autenticadas do
// site já leem "token" de lá diretamente, então mantemos essa convenção em vez
// de fragmentar em dois lugares. "Manter-me conectado" controla, em vez disso,
// se um refresh token (cookie httpOnly, 30 dias) é emitido no login/cadastro:
// com ele, tentarRenovarSessao() consegue devolver uma sessão válida mesmo
// depois do access token (1 dia) expirar ou do navegador ser fechado e reaberto.
(function () {
  const KEY = "token";

  function getToken() {
    return localStorage.getItem(KEY);
  }

  function setToken(token) {
    localStorage.setItem(KEY, token);
  }

  function clearToken() {
    localStorage.removeItem(KEY);
    localStorage.removeItem("nome");
    localStorage.removeItem("plano");
  }

  // Tenta trocar o refresh token (cookie httpOnly) por um novo access token —
  // só funciona para quem tinha marcado "Manter-me conectado" no login/cadastro.
  async function tentarRenovarSessao() {
    try {
      const res = await fetch("/api/auth/refresh", { method: "POST", credentials: "include" });
      if (!res.ok) return null;
      const data = await res.json();
      if (!data.token) return null;
      setToken(data.token);
      if (data.nome) localStorage.setItem("nome", data.nome);
      return data.token;
    } catch (err) {
      return null;
    }
  }

  // Retorna um token utilizável: o que já está guardado ou, na falta dele, um
  // novo obtido via refresh token — sem forçar o usuário a logar de novo só
  // porque fechou e reabriu o navegador.
  async function obterTokenValido() {
    const atual = getToken();
    if (atual) return atual;
    return await tentarRenovarSessao();
  }

  async function logout() {
    try { await fetch("/api/auth/logout", { method: "POST", credentials: "include" }); } catch (err) { /* silencioso */ }
    clearToken();
  }

  window.AuthStorage = { getToken, setToken, clearToken, tentarRenovarSessao, obterTokenValido, logout };
})();
