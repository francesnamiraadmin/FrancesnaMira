// =====================================================================
// Correção por cores ao vivo (sala ao vivo do Ambiente de Produção): desenha o texto do aluno com os
// trechos grifados pelo professor. Usado pelo Sistema de Correção (professor) e pelo app (aluno).
// Cada marca é { id, trecho, ocorrencia, cor, nome, comentario }: o trecho é procurado no texto atual
// (a « ocorrencia »-ésima vez que aparece), então a marca acompanha o texto enquanto o aluno escreve.
// Marcas cujo trecho sumiu do texto ficam « soltas » (listadas à parte).
// =====================================================================
(function () {
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  /** Posição da n-ésima ocorrência (0 = primeira) de trecho em texto; -1 se não houver. */
  function posicao(texto, trecho, n) {
    var i = -1, k = 0;
    while (k <= n) { i = texto.indexOf(trecho, i + 1); if (i === -1) return -1; k++; }
    return i;
  }
  /** Quantas vezes o trecho aparece antes da posição (para ancorar uma marca nova). */
  function ocorrenciaEm(texto, trecho, inicio) {
    var n = 0, i = texto.indexOf(trecho);
    while (i !== -1 && i < inicio) { n++; i = texto.indexOf(trecho, i + 1); }
    return n;
  }
  /** Intervalos das marcas no texto atual, sem sobreposição (a marca mais antiga ganha). */
  function intervalos(texto, marcas) {
    var ok = [], soltas = [];
    (marcas || []).forEach(function (m) {
      var i = m.trecho ? posicao(texto, m.trecho, m.ocorrencia || 0) : -1;
      if (i === -1 && m.trecho) i = texto.indexOf(m.trecho);   // a ocorrência mudou: usa a primeira
      if (i === -1) { soltas.push(m); return; }
      var f = i + m.trecho.length;
      if (ok.some(function (x) { return i < x.f && f > x.i; })) { soltas.push(m); return; }
      ok.push({ i: i, f: f, m: m });
    });
    ok.sort(function (a, b) { return a.i - b.i; });
    return { ok: ok, soltas: soltas };
  }
  /** HTML do texto com as marcas (white-space: pre-wrap no contêiner preserva as quebras de linha). */
  function html(texto, marcas, opts) {
    texto = String(texto || ''); opts = opts || {};
    var r = intervalos(texto, marcas), out = '', pos = 0;
    r.ok.forEach(function (x, k) {
      out += esc(texto.slice(pos, x.i));
      out += '<mark class="mav" data-mav="' + esc(x.m.id) + '" style="--mav:' + esc(x.m.cor || '#dc2626') + '" title="' + esc((x.m.nome || '') + (x.m.comentario ? ' · ' + x.m.comentario : '')) + '">' +
        esc(texto.slice(x.i, x.f)) + (opts.numeros ? '<sup>' + (k + 1) + '</sup>' : '') + '</mark>';
      pos = x.f;
    });
    out += esc(texto.slice(pos));
    return { html: out, ordem: r.ok.map(function (x) { return x.m; }), soltas: r.soltas };
  }
  /** Lista das marcas (legenda com cor, categoria e comentário). */
  function lista(res, opts) {
    opts = opts || {};
    var item = function (m, n) {
      return '<li class="mav-item" style="--mav:' + esc(m.cor || '#dc2626') + '"><span class="mav-n">' + (n || '·') + '</span><div><b>' + esc(m.nome || 'Marque') + '</b> <q lang="fr">' + esc(m.trecho) + '</q>' +
        (m.comentario ? '<p>' + esc(m.comentario) + '</p>' : '') + '</div>' + (opts.remover ? '<button type="button" class="mav-del" data-mav-del="' + esc(m.id) + '" title="' + esc(opts.remover) + '" aria-label="' + esc(opts.remover) + '">✕</button>' : '') + '</li>';
    };
    var h = res.ordem.map(function (m, k) { return item(m, k + 1); }).join('') + res.soltas.map(function (m) { return item(m, ''); }).join('');
    return h ? '<ol class="mav-lista">' + h + '</ol>' : '';
  }
  /** Deslocamento (em caracteres do texto) de um ponto da seleção dentro do contêiner. */
  function deslocamento(raiz, no, off) {
    var r = document.createRange();
    r.setStart(raiz, 0); r.setEnd(no, off);
    var frag = r.cloneContents(), tmp = document.createElement('div');
    tmp.appendChild(frag);
    tmp.querySelectorAll('sup').forEach(function (s) { s.remove(); });   // números das marcas não contam
    return tmp.textContent.length;
  }
  window.MarcasAoVivo = { html: html, lista: lista, ocorrenciaEm: ocorrenciaEm, deslocamento: deslocamento };
})();
