// =====================================================================
// Ponte google.script.run → API do site, para o app "Modèles TCF" (Apps Script) rodar aqui
// sem reescrever as chamadas: `google.script.run.withSuccessHandler(ok).withFailureHandler(erro)
// .funcao(EMAIL, a, b)` vira POST /api/modeles/rpc/funcao { args: [a, b], courseType }.
// O primeiro argumento (o e-mail do app) é descartado: quem chama é identificado pelo token.
// =====================================================================
(function () {
  var EU = "__eu__";

  function chamar(nome, args) {
    if (args.length && args[0] === EU) args = args.slice(1);
    return fetch("/api/modeles/rpc/" + encodeURIComponent(nome), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + localStorage.getItem("token") },
      body: JSON.stringify({ args: args, courseType: window.FNM_CURSO || undefined })
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (d) {
        if (res.status === 401) { window.location.href = "login.html"; throw new Error("Session expirée."); }
        if (!res.ok) throw new Error(d.msg || "Erreur " + res.status);
        return d.r;
      });
    });
  }

  function cadeia(ok, falha) {
    return new Proxy({}, {
      get: function (_, nome) {
        if (nome === "withSuccessHandler") return function (f) { return cadeia(f, falha); };
        if (nome === "withFailureHandler") return function (f) { return cadeia(ok, f); };
        if (nome === "withUserObject") return function () { return cadeia(ok, falha); };
        return function () {
          chamar(String(nome), Array.prototype.slice.call(arguments))
            .then(function (r) { if (ok) ok(r); })
            .catch(function (e) {
              if (falha) falha(e);
              else if (window.console) console.warn("modeles/" + String(nome) + ":", e.message);
            });
        };
      }
    });
  }

  window.google = window.google || {};
  window.google.script = { run: cadeia(null, null) };
  window.FNM_EU = EU;
  window.FNM_RPC = chamar;
})();
