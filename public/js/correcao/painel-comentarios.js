// =====================================================================
// Correção anotada — painel lateral com todos os comentários (professor e aluno).
// Correcao.Painel.criar(raiz, { editavel, onIr(a), onEditar(a, dados), onExcluir(a), orfas })
//   .atualizar(anotacoes) · .ativar(id) · .proximo(+1/-1) · .editar(id)
// Ordem: posição no texto e, no oral, momento do áudio. Filtro por categoria.
// =====================================================================
(function () {
  var C = window.Correcao;

  function ordenar(l) {
    return l.slice().sort(function (a, b) {
      var pa = a.inicio != null ? a.inicio : (a.tempo || 0) * 1e6, pb = b.inicio != null ? b.inicio : (b.tempo || 0) * 1e6;
      if (a.alvo !== b.alvo) return a.alvo === 'audio' ? 1 : b.alvo === 'audio' ? -1 : 0;
      return pa - pb;
    });
  }

  function criar(raiz, op) {
    var estado = { lista: [], filtro: '', ativo: null, editando: null, orfas: [] };
    raiz.classList.add('ca-painel');
    raiz.innerHTML = '<div class="ca-painel-cab"><h3><span>Comentários <span class="ca-n" data-total></span></span>' +
      '<span class="ca-nav"><button type="button" class="ca-mini" data-nav="-1" title="Comentário anterior (K)" aria-label="Comentário anterior">▲</button>' +
      '<span data-pos></span><button type="button" class="ca-mini" data-nav="1" title="Próximo comentário (J)" aria-label="Próximo comentário">▼</button></span></h3>' +
      '<div class="ca-filtros" data-filtros></div></div><div class="ca-lista" data-lista role="list"></div>';
    var $ = function (s) { return raiz.querySelector(s); };

    function visiveis() { return estado.lista.filter(function (a) { return !estado.filtro || a.categoria === estado.filtro; }); }

    function desenharFiltros() {
      var cont = {};
      estado.lista.forEach(function (a) { cont[a.categoria] = (cont[a.categoria] || 0) + 1; });
      var usadas = Object.keys(cont);
      $('[data-filtros]').innerHTML = usadas.length < 2 ? '' : '<button type="button" class="ca-cat" style="--c:#64748b" data-filtro="" aria-pressed="' + (!estado.filtro) + '"><i></i>Todos<span class="ca-n">' + estado.lista.length + '</span></button>' +
        usadas.map(function (id) {
          var a = estado.lista.filter(function (x) { return x.categoria === id; })[0], v = C.visualDe(a);
          return '<button type="button" class="ca-cat" style="--c:' + C.esc(v.cor) + '" data-filtro="' + C.esc(id) + '" aria-pressed="' + (estado.filtro === id) + '"><i></i>' + C.esc(v.nome) + '<span class="ca-n">' + cont[id] + '</span></button>';
        }).join('');
    }

    function htmlItem(a) {
      var v = C.visualDe(a), orfa = estado.orfas.indexOf(String(a._id)) >= 0;
      if (estado.editando === String(a._id)) {
        var cats = C.categorias.ativas(op.modalidade || 'textual');
        if (!cats.some(function (c) { return c.id === a.categoria; })) cats = cats.concat([{ id: a.categoria, nome: v.nome }]);
        return '<div class="ca-item ca-item-edit ativo" style="--c:' + C.esc(v.cor) + '" data-id="' + a._id + '">' +
          '<label>Categoria</label><select data-e="categoria">' + cats.map(function (c) { return '<option value="' + C.esc(c.id) + '"' + (c.id === a.categoria ? ' selected' : '') + '>' + C.esc(c.nome) + '</option>'; }).join('') + '</select>' +
          '<label>Comentário</label><textarea data-e="comentario" rows="3">' + C.esc(a.comentario) + '</textarea>' +
          (a.alvo !== 'audio' ? '<label>Forma correta (opcional)</label><input type="text" data-e="sugestao" value="' + C.esc(a.sugestao) + '">' : '') +
          '<div class="ca-pop-acoes"><button type="button" class="ca-btn" data-acao="cancelar">Cancelar</button><button type="button" class="ca-btn primario" data-acao="gravar">Salvar <kbd>Ctrl+Enter</kbd></button></div></div>';
      }
      return '<div class="ca-item' + (estado.ativo === String(a._id) ? ' ativo' : '') + (orfa ? ' ca-orfa' : '') + '" style="--c:' + C.esc(v.cor) + '" data-id="' + a._id + '" role="listitem" tabindex="0">' +
        '<div class="ca-item-topo"><span class="ca-item-cat">' + C.esc(v.nome) + '</span>' +
        (a.tempo != null ? '<span class="ca-item-tempo" title="Ir para este momento do áudio">' + C.fmtTempo(a.tempo) + '</span>' : '') +
        (op.editavel ? '<span class="ca-item-acoes"><button type="button" class="ca-mini" data-acao="editar" title="Editar">Editar</button><button type="button" class="ca-mini perigo" data-acao="excluir" title="Excluir (pode desfazer)">Excluir</button></span>' : '') + '</div>' +
        (a.trecho ? '<q>' + C.esc(a.trecho.length > 160 ? a.trecho.slice(0, 157) + '…' : a.trecho) + '</q>' : '') +
        (a.comentario ? '<p>' + C.esc(a.comentario) + '</p>' : '') +
        (a.sugestao ? '<div class="ca-sug">→ ' + C.esc(a.sugestao) + '</div>' : '') +
        '<small>' + C.esc(a.autorNome || 'Professor') + ' · ' + C.fmtData(a.atualizadoEm || a.criadoEm) + (a.atualizadoEm && a.criadoEm && new Date(a.atualizadoEm) - new Date(a.criadoEm) > 2000 ? ' (editado)' : '') + '</small></div>';
    }

    function desenhar() {
      var l = visiveis();
      $('[data-total]').textContent = estado.lista.length ? '(' + estado.lista.length + ')' : '';
      var idx = l.findIndex(function (a) { return String(a._id) === estado.ativo; });
      $('[data-pos]').textContent = l.length ? (idx >= 0 ? idx + 1 : '–') + ' / ' + l.length : '';
      desenharFiltros();
      $('[data-lista]').innerHTML = l.length ? l.map(htmlItem).join('') :
        '<div class="ca-vazio">' + (op.editavel ? 'Nenhum comentário ainda.<br><small>Selecione um trecho do texto' + (op.modalidade === 'oral' ? ' ou marque um momento do áudio' : '') + ' e escolha uma categoria.</small>' : 'Nenhum comentário nesta correção.') + '</div>';
      var ed = estado.editando && raiz.querySelector('.ca-item-edit [data-e="comentario"]');
      if (ed) { ed.focus(); ed.setSelectionRange(ed.value.length, ed.value.length); }
    }

    function porId(id) { return estado.lista.filter(function (a) { return String(a._id) === String(id); })[0]; }

    raiz.addEventListener('click', function (e) {
      var f = e.target.closest('[data-filtro]');
      if (f) { estado.filtro = f.dataset.filtro; desenhar(); return; }
      var n = e.target.closest('[data-nav]');
      if (n) { api.proximo(Number(n.dataset.nav)); return; }
      var item = e.target.closest('.ca-item'); if (!item) return;
      var a = porId(item.dataset.id), acao = e.target.closest('[data-acao]');
      if (acao && acao.dataset.acao === 'editar') { estado.editando = String(a._id); desenhar(); return; }
      if (acao && acao.dataset.acao === 'excluir') { if (op.onExcluir) op.onExcluir(a); return; }
      if (acao && acao.dataset.acao === 'cancelar') { estado.editando = null; desenhar(); return; }
      if (acao && acao.dataset.acao === 'gravar') { gravar(item, a); return; }
      if (item.classList.contains('ca-item-edit')) return;
      api.ativar(a._id, true);
    });
    raiz.addEventListener('keydown', function (e) {
      var item = e.target.closest('.ca-item');
      if (!item) return;
      if (item.classList.contains('ca-item-edit')) {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); gravar(item, porId(item.dataset.id)); }
        if (e.key === 'Escape') { estado.editando = null; desenhar(); }
        return;
      }
      if (e.key === 'Enter') { api.ativar(item.dataset.id, true); }
      if ((e.key === 'Delete' || e.key === 'Backspace') && op.editavel && op.onExcluir) { e.preventDefault(); op.onExcluir(porId(item.dataset.id)); }
    });
    function gravar(item, a) {
      var dados = {};
      item.querySelectorAll('[data-e]').forEach(function (x) { dados[x.dataset.e] = x.value; });
      estado.editando = null;
      if (op.onEditar) op.onEditar(a, dados);
      desenhar();
    }

    var api = {
      atualizar: function (lista, orfas) {
        estado.lista = ordenar(lista);
        estado.orfas = (orfas || []).map(function (a) { return String(a._id); });
        if (estado.filtro && !estado.lista.some(function (a) { return a.categoria === estado.filtro; })) estado.filtro = '';
        desenhar();
      },
      // destaca no painel; `irAoTexto` também leva ao trecho / momento do áudio
      ativar: function (id, irAoTexto) {
        estado.ativo = id == null ? null : String(id);
        desenhar();
        var el = raiz.querySelector('.ca-item[data-id="' + estado.ativo + '"]');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        if (irAoTexto && op.onIr && porId(id)) op.onIr(porId(id));
      },
      proximo: function (passo) {
        var l = visiveis(); if (!l.length) return;
        var i = l.findIndex(function (a) { return String(a._id) === estado.ativo; });
        i = i < 0 ? (passo > 0 ? 0 : l.length - 1) : (i + passo + l.length) % l.length;
        api.ativar(l[i]._id, true);
      },
      editar: function (id) { estado.editando = String(id); estado.ativo = String(id); desenhar(); },
      ativo: function () { return estado.ativo; }
    };
    return api;
  }

  C.Painel = { criar: criar };
})();
