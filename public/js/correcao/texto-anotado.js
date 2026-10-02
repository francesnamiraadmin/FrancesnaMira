// =====================================================================
// Correção anotada — texto com marcações (professor e aluno).
// Correcao.TextoAnotado.render(raiz, texto, anotacoes, { onClicar(ids), ativo })
// O texto é cortado nos limites das anotações; cada pedaço marcado vira um <mark> com a cor da
// categoria (a anotação mais curta por cima, quando há sobreposição). A raiz contém só o texto,
// para a seleção do professor virar posição exata no texto original.
// =====================================================================
(function () {
  var C = window.Correcao;
  var tip = null;

  function mostrarTip(mark, anots) {
    if (!tip) { tip = document.createElement('div'); tip.className = 'ca-tip ca'; tip.setAttribute('role', 'tooltip'); document.body.appendChild(tip); }
    tip.innerHTML = anots.map(function (a) {
      var v = C.visualDe(a);
      return '<div style="--c:' + C.esc(v.cor) + '"><b><i></i>' + C.esc(v.nome) + (a.tempo != null ? ' · ' + C.fmtTempo(a.tempo) : '') + '</b>' +
        '<q>' + C.esc(a.trecho.length > 120 ? a.trecho.slice(0, 117) + '…' : a.trecho) + '</q>' +
        (a.comentario ? '<div>' + C.esc(a.comentario) + '</div>' : '') +
        (a.sugestao ? '<div class="ca-sug">→ ' + C.esc(a.sugestao) + '</div>' : '') + '</div>';
    }).join('<hr style="border:0;border-top:1px solid var(--ca-borda);margin:8px 0;">');
    tip.style.display = 'block';
    var r = mark.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
    var x = Math.min(window.innerWidth - w - 10, Math.max(10, r.left + r.width / 2 - w / 2));
    var y = r.top - h - 10 < 8 ? r.bottom + 10 : r.top - h - 10;
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  }
  function esconderTip() { if (tip) tip.style.display = 'none'; }

  function render(raiz, texto, anotacoes, op) {
    op = op || {};
    var posicoes = [], orfas = [];
    anotacoes.forEach(function (a) {
      var p = C.localizar(texto, a);
      if (p) posicoes.push({ a: a, ini: p.inicio, fim: p.fim }); else orfas.push(a);
    });
    var cortes = [0, texto.length];
    posicoes.forEach(function (p) { cortes.push(p.ini, p.fim); });
    cortes = cortes.filter(function (v, i, l) { return l.indexOf(v) === i; }).sort(function (x, y) { return x - y; });
    var html = '';
    for (var i = 0; i < cortes.length - 1; i++) {
      var de = cortes[i], ate = cortes[i + 1], pedaco = texto.slice(de, ate);
      if (!pedaco) continue;
      var sobre = posicoes.filter(function (p) { return p.ini <= de && p.fim >= ate; })
        .sort(function (x, y) { return (x.fim - x.ini) - (y.fim - y.ini); });
      if (!sobre.length) { html += '<span>' + C.esc(pedaco) + '</span>'; continue; }
      var topo = C.visualDe(sobre[0].a);
      var ids = sobre.map(function (p) { return p.a._id; });
      var rotulo = sobre.map(function (p) { var v = C.visualDe(p.a); return v.nome + (p.a.comentario ? ': ' + p.a.comentario : ''); }).join(' | ');
      html += '<mark class="ca-marca' + (sobre.length > 1 ? ' multi' : '') + (op.ativo && ids.indexOf(op.ativo) >= 0 ? ' ativa' : '') + '" data-ids="' + ids.join(' ') + '" style="--c:' + C.esc(topo.cor) + '"' +
        ' tabindex="0" aria-label="' + C.esc(rotulo) + '">' + C.esc(pedaco) + '</mark>';
    }
    raiz.innerHTML = html || '<span></span>';
    raiz._anotacoes = anotacoes;
    if (!raiz._ligado) {
      raiz._ligado = true;
      var porIds = function (m) { var ids = m.dataset.ids.split(' '); return (raiz._anotacoes || []).filter(function (a) { return ids.indexOf(String(a._id)) >= 0; }); };
      raiz.addEventListener('mouseover', function (e) { var m = e.target.closest('.ca-marca'); if (m) mostrarTip(m, porIds(m)); });
      raiz.addEventListener('mouseout', function (e) { if (e.target.closest('.ca-marca')) esconderTip(); });
      raiz.addEventListener('focusin', function (e) { var m = e.target.closest('.ca-marca'); if (m) mostrarTip(m, porIds(m)); });
      raiz.addEventListener('focusout', esconderTip);
      raiz.addEventListener('click', function (e) {
        var m = e.target.closest('.ca-marca');
        // clique numa marcação sem arrastar: abre o comentário (arrastar = nova seleção)
        if (!m || (window.getSelection() && !window.getSelection().isCollapsed)) return;
        if (raiz._onClicar) raiz._onClicar(m.dataset.ids.split(' '));
      });
      raiz.addEventListener('keydown', function (e) {
        var m = e.target.closest('.ca-marca');
        if (m && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); if (raiz._onClicar) raiz._onClicar(m.dataset.ids.split(' ')); }
      });
      window.addEventListener('scroll', esconderTip, true);
    }
    raiz._onClicar = op.onClicar;
    return { orfas: orfas };
  }

  // Destaca e rola até a marcação de uma anotação.
  function focar(raiz, id) {
    raiz.querySelectorAll('.ca-marca.ativa').forEach(function (m) { m.classList.remove('ativa'); });
    var alvo = null;
    raiz.querySelectorAll('.ca-marca').forEach(function (m) {
      if (m.dataset.ids.split(' ').indexOf(String(id)) >= 0) { m.classList.add('ativa'); if (!alvo) alvo = m; }
    });
    if (alvo) {
      alvo.scrollIntoView({ behavior: 'smooth', block: 'center' });
      alvo.classList.remove('pulsar'); void alvo.offsetWidth; alvo.classList.add('pulsar');
    }
    return !!alvo;
  }

  C.TextoAnotado = { render: render, focar: focar, esconderTip: esconderTip };
})();
