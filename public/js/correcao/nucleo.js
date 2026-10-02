// =====================================================================
// Correção anotada — núcleo comum (professor e aluno):
//  - utilitários (escape, tempo, data);
//  - categorias de marcação (vindas do servidor, configuráveis);
//  - âncoras de texto: posição + citação + contexto (nunca coordenadas da tela).
// Os outros módulos (texto-anotado, painel, player, persistência, editor, visão do aluno)
// penduram-se em window.Correcao.
// =====================================================================
(function () {
  var C = window.Correcao = window.Correcao || {};
  var token = function () { return localStorage.getItem('token'); };

  C.esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  C.fmtTempo = function (s) {
    s = Math.max(0, Math.floor(Number(s) || 0));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  };
  C.fmtData = function (d) {
    if (!d) return '';
    var x = new Date(d);
    return x.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + x.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };
  C.headers = function (json) {
    var h = { Authorization: 'Bearer ' + token() };
    if (json) h['Content-Type'] = 'application/json';
    return h;
  };

  // ---------------- categorias ----------------
  var cats = null, promessa = null;
  C.categorias = {
    carregar: function () {
      if (cats) return Promise.resolve(cats);
      if (!promessa) promessa = fetch('/api/correcao/categorias', { headers: C.headers() })
        .then(function (r) { return r.ok ? r.json() : { categorias: [] }; })
        .then(function (d) { cats = d.categorias || []; return cats; })
        .catch(function () { cats = []; return cats; });
      return promessa;
    },
    definir: function (lista) { cats = lista; promessa = null; },
    todas: function () { return cats || []; },
    porId: function (id) { return (cats || []).filter(function (c) { return c.id === id; })[0] || null; },
    // ativas para a modalidade da produção, na ordem configurada (atalhos 1..9)
    ativas: function (modalidade) {
      return (cats || []).filter(function (c) { return c.ativa !== false && (!c.modalidades || c.modalidades.indexOf(modalidade) >= 0); })
        .sort(function (a, b) { return (a.ordem || 0) - (b.ordem || 0); });
    }
  };
  // Nome e cor de uma anotação: a cópia gravada nela (vale mesmo se a categoria mudou depois).
  C.visualDe = function (a) {
    var c = C.categorias.porId(a.categoria);
    return { nome: a.categoriaNome || (c && c.nome) || a.categoria, cor: a.cor || (c && c.cor) || '#2563eb' };
  };

  // ---------------- âncoras ----------------
  // Reencontra o trecho de uma anotação no texto: a posição gravada se ela ainda confere,
  // senão a citação (desempatando pelo contexto antes/depois).
  C.localizar = function (texto, a) {
    if (a.inicio != null && a.fim != null && texto.slice(a.inicio, a.fim) === a.trecho && a.trecho) return { inicio: a.inicio, fim: a.fim };
    if (!a.trecho) return null;
    var melhor = -1, nota = -1, i = texto.indexOf(a.trecho);
    while (i >= 0) {
      var n = 0;
      if (a.prefixo && texto.slice(Math.max(0, i - a.prefixo.length), i) === a.prefixo) n += 2;
      if (a.sufixo && texto.slice(i + a.trecho.length, i + a.trecho.length + a.sufixo.length) === a.sufixo) n += 2;
      if (a.inicio != null) n -= Math.min(1, Math.abs(i - a.inicio) / 1000);
      if (n > nota) { nota = n; melhor = i; }
      i = texto.indexOf(a.trecho, i + 1);
    }
    return melhor < 0 ? null : { inicio: melhor, fim: melhor + a.trecho.length };
  };

  // Caracteres do texto original antes de um nó: a raiz contém só o texto (em <span>/<mark>),
  // então somar os nós de texto dá o deslocamento exato no texto da produção.
  function antesDe(raiz, alvo) {
    var w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT), n, total = 0;
    while ((n = w.nextNode())) {
      if (n === alvo || (alvo.nodeType === 1 && alvo.contains(n))) return total;
      total += n.nodeValue.length;
    }
    return total;
  }
  // Seleção atual → { inicio, fim, trecho } no texto (sem espaços nas pontas), ou null.
  C.selecaoNoTexto = function (raiz, texto) {
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount || sel.isCollapsed) return null;
    var r = sel.getRangeAt(0);
    if (!raiz.contains(r.startContainer) || !raiz.contains(r.endContainer)) return null;
    var ini = r.startContainer.nodeType === 3 ? antesDe(raiz, r.startContainer) + r.startOffset : antesDe(raiz, r.startContainer.childNodes[r.startOffset] || r.startContainer) ;
    var fim = r.endContainer.nodeType === 3 ? antesDe(raiz, r.endContainer) + r.endOffset : antesDe(raiz, r.endContainer.childNodes[r.endOffset] || r.endContainer);
    if (r.endContainer.nodeType !== 3 && !r.endContainer.childNodes[r.endOffset]) fim = antesDe(raiz, r.endContainer) + (r.endContainer.textContent || '').length;
    ini = Math.max(0, Math.min(ini, texto.length)); fim = Math.max(0, Math.min(fim, texto.length));
    while (ini < fim && /\s/.test(texto[ini])) ini++;
    while (fim > ini && /\s/.test(texto[fim - 1])) fim--;
    if (fim <= ini) return null;
    return { inicio: ini, fim: fim, trecho: texto.slice(ini, fim), prefixo: texto.slice(Math.max(0, ini - 32), ini), sufixo: texto.slice(fim, fim + 32), rect: r.getBoundingClientRect() };
  };
})();
