// =====================================================================
// Janelas do próprio site no lugar das do navegador (alert/confirm/prompt).
//   await Dialogo.aviso("Mensagem")                       → fecha no OK
//   await Dialogo.confirmar("Apagar?", { ok: "Apagar" })  → true / false
//   await Dialogo.pedir("Seu nome:", "valor inicial")     → texto / null (cancelou)
// Carregado logo depois do htmlSeguro.js em todas as páginas. As chamadas antigas
// alert()/confirm()/prompt() do código foram convertidas para estas (ver
// backend/seed/dialogosSite.js); window.alert também passa a abrir a janela do site,
// para o caso de algum script de terceiros ainda chamá-lo.
// =====================================================================
(function () {
  if (window.Dialogo) return;
  var fila = Promise.resolve();
  var CSS = [
    ".dlg-fundo{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(15,23,42,.45);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);animation:dlgFundo .15s ease}",
    ".dlg-caixa{width:min(440px,100%);max-height:calc(100vh - 36px);overflow:auto;padding:24px 24px 20px;border-radius:22px;background:#fff;color:#1c2b3a;border:1px solid var(--glass-border,rgba(28,43,58,.12));box-shadow:0 30px 60px -20px rgba(15,23,42,.45);font-family:'Poppins',system-ui,sans-serif;animation:dlgCaixa .18s ease}",
    ".dlg-topo{display:flex;align-items:center;gap:12px;margin-bottom:10px}",
    ".dlg-ic{flex:none;width:40px;height:40px;border-radius:12px;display:grid;place-items:center;font-size:1.2rem;background:var(--dlg-c-fundo,rgba(37,99,235,.12))}",
    ".dlg-titulo{margin:0;font:700 1.18rem/1.25 'Playfair Display',Georgia,serif;color:inherit}",
    ".dlg-msg{margin:0 0 6px;font-size:.93rem;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere;opacity:.92}",
    ".dlg-campo{width:100%;box-sizing:border-box;margin-top:10px;padding:11px 14px;border-radius:12px;border:1px solid var(--glass-border,#cbd5e1);background:var(--glass-input,#fff);color:inherit;font:500 .95rem 'Poppins',system-ui,sans-serif}",
    ".dlg-campo:focus{outline:2px solid var(--dlg-c,#2563eb);outline-offset:1px}",
    ".dlg-acoes{display:flex;justify-content:flex-end;gap:10px;margin-top:18px;flex-wrap:wrap}",
    ".dlg-btn{border:0;border-radius:999px;padding:10px 20px;font:700 .88rem 'Poppins',system-ui,sans-serif;cursor:pointer;transition:transform .12s,filter .12s}",
    ".dlg-btn:hover{transform:translateY(-1px);filter:brightness(1.06)}",
    ".dlg-btn:focus-visible{outline:2px solid var(--dlg-c,#2563eb);outline-offset:2px}",
    ".dlg-ok{background:var(--dlg-c,#1c2b3a);color:#fff}",
    ".dlg-cancelar{background:transparent;color:inherit;border:1px solid var(--glass-border,#cbd5e1)}",
    "@keyframes dlgFundo{from{opacity:0}to{opacity:1}}@keyframes dlgCaixa{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:none}}",
    "[data-theme=dark] .dlg-caixa{background:#1e2433;color:#e8ecf5;border-color:rgba(255,255,255,.12)}[data-theme=dark] .dlg-campo{background:#161b28;color:#e8ecf5;border-color:#3a4358}[data-theme=dark] .dlg-ok{background:var(--dlg-c-escuro,#3b82f6)}",
    "@media (max-width:480px){.dlg-acoes{flex-direction:column-reverse}.dlg-btn{width:100%}}"
  ].join("");

  function estilo() {
    if (document.getElementById("dlgEstilo")) return;
    var s = document.createElement("style");
    s.id = "dlgEstilo"; s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }
  function quandoPronto(fn) {
    if (document.body) fn(); else document.addEventListener("DOMContentLoaded", fn, { once: true });
  }
  // tom da janela pelo conteúdo: apagar/remover = vermelho; erro = vermelho; senão o azul-escuro do site
  function tom(msg, tipo, opcoes) {
    if (opcoes && opcoes.perigo) return "perigo";
    var t = String(msg || "").toLowerCase();
    if (tipo !== "aviso" && /\b(apagar|excluir|remover|retirer|supprimer|effacer|deletar|definitivamente|definitivement)\b/.test(t)) return "perigo";
    if (/\b(erro|falha|não foi possível|impossible|erreur)\b/.test(t)) return "erro";
    return "normal";
  }
  var TONS = {
    normal: { c: "#1c2b3a", fundo: "rgba(37,99,235,.12)", ic: { aviso: "ℹ️", confirmar: "❔", pedir: "✏️" } },
    perigo: { c: "#dc2626", fundo: "rgba(220,38,38,.12)", ic: { aviso: "⚠️", confirmar: "🗑️", pedir: "✏️" } },
    erro: { c: "#dc2626", fundo: "rgba(220,38,38,.12)", ic: { aviso: "⚠️", confirmar: "⚠️", pedir: "⚠️" } }
  };
  var TITULOS = { aviso: "Aviso", confirmar: "Confirmar", pedir: "Responda" };

  function abrir(tipo, msg, opcoes) {
    opcoes = opcoes || {};
    return new Promise(function (resolver) {
      quandoPronto(function () {
        estilo();
        var t = TONS[tom(msg, tipo, opcoes)];
        var anterior = document.activeElement;
        var fundo = document.createElement("div");
        fundo.className = "dlg-fundo";
        fundo.style.setProperty("--dlg-c", t.c);
        fundo.style.setProperty("--dlg-c-fundo", t.fundo);
        if (t.c !== "#1c2b3a") fundo.style.setProperty("--dlg-c-escuro", t.c);
        var caixa = document.createElement("div");
        caixa.className = "dlg-caixa";
        caixa.setAttribute("role", tipo === "aviso" ? "alertdialog" : "dialog");
        caixa.setAttribute("aria-modal", "true");
        var topo = document.createElement("div"); topo.className = "dlg-topo";
        var ic = document.createElement("span"); ic.className = "dlg-ic"; ic.setAttribute("aria-hidden", "true"); ic.textContent = opcoes.icone || t.ic[tipo];
        var titulo = document.createElement("h2"); titulo.className = "dlg-titulo"; titulo.id = "dlgTitulo" + Date.now(); titulo.textContent = opcoes.titulo || TITULOS[tipo];
        topo.appendChild(ic); topo.appendChild(titulo);
        var p = document.createElement("p"); p.className = "dlg-msg"; p.textContent = msg == null ? "" : String(msg);
        caixa.setAttribute("aria-labelledby", titulo.id);
        caixa.appendChild(topo); caixa.appendChild(p);
        var campo = null;
        if (tipo === "pedir") {
          campo = document.createElement("input"); campo.className = "dlg-campo"; campo.type = "text";
          campo.value = opcoes.padrao == null ? "" : String(opcoes.padrao);
          campo.setAttribute("aria-label", String(msg || "Resposta"));
          caixa.appendChild(campo);
        }
        var acoes = document.createElement("div"); acoes.className = "dlg-acoes";
        var cancelar = null;
        if (tipo !== "aviso") {
          cancelar = document.createElement("button"); cancelar.type = "button"; cancelar.className = "dlg-btn dlg-cancelar";
          cancelar.textContent = opcoes.cancelar || "Cancelar";
          acoes.appendChild(cancelar);
        }
        var ok = document.createElement("button"); ok.type = "button"; ok.className = "dlg-btn dlg-ok";
        ok.textContent = opcoes.ok || (tipo === "confirmar" && tom(msg, tipo, opcoes) === "perigo" ? "Sim, continuar" : "OK");
        acoes.appendChild(ok);
        caixa.appendChild(acoes);
        fundo.appendChild(caixa);
        document.body.appendChild(fundo);

        function fechar(valor) {
          document.removeEventListener("keydown", teclas, true);
          fundo.remove();
          try { if (anterior && anterior.focus) anterior.focus(); } catch (e) { /* ok */ }
          resolver(valor);
        }
        var respostaOk = function () { fechar(tipo === "confirmar" ? true : tipo === "pedir" ? campo.value : undefined); };
        var respostaCancela = function () { fechar(tipo === "confirmar" ? false : tipo === "pedir" ? null : undefined); };
        function teclas(e) {
          if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); respostaCancela(); }
          else if (e.key === "Enter" && (tipo !== "pedir" || document.activeElement === campo || document.activeElement === ok)) { e.preventDefault(); e.stopPropagation(); respostaOk(); }
          else if (e.key === "Tab") {
            // foco preso dentro da janela
            var foco = [campo, cancelar, ok].filter(Boolean), i = foco.indexOf(document.activeElement);
            e.preventDefault();
            foco[(i + (e.shiftKey ? foco.length - 1 : 1)) % foco.length].focus();
          }
        }
        document.addEventListener("keydown", teclas, true);
        ok.addEventListener("click", respostaOk);
        if (cancelar) cancelar.addEventListener("click", respostaCancela);
        fundo.addEventListener("mousedown", function (e) { if (e.target === fundo && tipo !== "aviso") respostaCancela(); });
        setTimeout(function () { (campo || ok).focus(); if (campo) campo.select(); }, 20);
      });
    });
  }
  // uma janela de cada vez, na ordem em que foram pedidas
  function enfileirar(tipo, msg, opcoes) {
    var p = fila.then(function () { return abrir(tipo, msg, opcoes); });
    fila = p.catch(function () {});
    return p;
  }

  window.Dialogo = {
    aviso: function (msg, opcoes) { return enfileirar("aviso", msg, opcoes); },
    confirmar: function (msg, opcoes) { return enfileirar("confirmar", msg, opcoes); },
    pedir: function (msg, padrao, opcoes) { return enfileirar("pedir", msg, Object.assign({ padrao: padrao }, opcoes || {})); }
  };
  // segurança: algum alert() que tenha escapado também usa a janela do site
  window.alert = function (msg) { window.Dialogo.aviso(msg); };
})();
