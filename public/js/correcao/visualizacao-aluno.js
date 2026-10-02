// =====================================================================
// Correção anotada — visão do aluno (somente leitura).
// Correcao.Aluno.montar(raiz, producao) → Promise<boolean: há anotações> · busca as anotações devolvidas e mostra:
// legenda das categorias usadas, o texto (ou a transcrição + o áudio) com os trechos marcados,
// e a lista de comentários (clicar leva ao trecho / ao momento do áudio).
// A nota, os critérios e o feedback global continuam na tela de resultado de cada página.
// =====================================================================
(function () {
  var C = window.Correcao;

  function montar(raiz, p) {
    if (!raiz || !p) return Promise.resolve();
    var oral = p.modalidade === 'oral';
    var texto = (oral ? p.transcricao : p.textoDigitado) || '';
    raiz.classList.add('ca', 'ca-aluno');
    raiz.innerHTML = '<div class="ca-vazio">Carregando a correção…</div>';
    return Promise.all([
      C.categorias.carregar(),
      fetch('/api/producoes/' + p._id + '/anotacoes', { headers: C.headers() }).then(function (r) { return r.ok ? r.json() : { anotacoes: [] }; })
    ]).then(function (res) {
      var lista = res[1].anotacoes || [];
      if (!lista.length) { raiz.innerHTML = ''; raiz.hidden = true; return false; }
      raiz.hidden = false;
      var cont = {};
      lista.forEach(function (a) { cont[a.categoria] = (cont[a.categoria] || 0) + 1; });
      var legenda = Object.keys(cont).map(function (id) {
        var v = C.visualDe(lista.filter(function (a) { return a.categoria === id; })[0]);
        var cat = C.categorias.porId(id);
        return '<span class="ca-cat" style="--c:' + C.esc(v.cor) + '" title="' + C.esc((cat && cat.descricao) || '') + '"><i></i>' + C.esc(v.nome) + ' <span class="ca-n">' + cont[id] + '</span></span>';
      }).join('');
      raiz.innerHTML = '<div class="ca-area">' +
        '<div class="ca-folha"><div class="ca-folha-cab"><div><h3>' + (oral ? 'Sua produção oral corrigida' : 'Seu texto corrigido') + '</h3>' +
        '<small>' + lista.length + ' comentário' + (lista.length > 1 ? 's' : '') + ' do professor · passe o mouse ou toque num trecho marcado</small></div></div>' +
        '<div class="ca-legenda" aria-label="Legenda das cores">' + legenda + '</div>' +
        (oral ? '<div data-al="player"></div>' + (texto ? '<div class="ca-transcricao-tit">Transcrição da sua fala</div>' : '') : '') +
        (texto ? '<div class="ca-texto" data-al="texto" lang="fr"></div>' : '') + '</div>' +
        '<div data-al="painel"></div></div>';
      var elTexto = raiz.querySelector('[data-al="texto"]');
      var player = null;
      var painel = C.Painel.criar(raiz.querySelector('[data-al="painel"]'), {
        editavel: false, modalidade: oral ? 'oral' : 'textual',
        onIr: function (a) {
          if (player && a.tempo != null) { player.ir(a.tempo, true); player.ativar(a._id); }
          if (elTexto && a.trecho) C.TextoAnotado.focar(elTexto, a._id);
        }
      });
      if (oral && p.arquivoOriginal && p.arquivoOriginal.nome) {
        var audio = new Audio();
        fetch('/api/producoes/' + p._id + '/arquivo/original', { headers: C.headers() })
          .then(function (r) { return r.ok ? r.blob() : null; })
          .then(function (b) { if (b) audio.src = URL.createObjectURL(b); });
        player = C.Player.criar(raiz.querySelector('[data-al="player"]'), audio, {
          duracao: p.duracaoSegundos,
          onMarcador: function (a) { painel.ativar(a._id, false); player.ativar(a._id); }
        });
        player.marcadores(lista);
      }
      var orfas = [];
      if (elTexto) orfas = C.TextoAnotado.render(elTexto, texto, lista.filter(function (a) { return a.alvo !== 'audio'; }), {
        onClicar: function (ids) { painel.ativar(ids[0], false); C.TextoAnotado.focar(elTexto, ids[0]); }
      }).orfas;
      painel.atualizar(lista, orfas);
      return true;
    }).catch(function () { raiz.innerHTML = ''; raiz.hidden = true; return false; });
  }

  C.Aluno = { montar: montar };
})();
