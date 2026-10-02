// =====================================================================
// Correção anotada — player da produção oral (professor e aluno).
// Correcao.Player.criar(raiz, audio, { onMarcador(a), onMarcar(tempo), podeMarcar })
//   .marcadores(anotacoes) · .ir(segundos, tocar) · .tempo() · .alternar() · .pular(±s)
// Controles: tocar/pausar, ±5 s, velocidade, posição/duração, linha do tempo com marcadores
// das anotações (clicar leva ao momento e ao comentário).
// =====================================================================
(function () {
  var C = window.Correcao;
  var ICONE = {
    play: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
    pause: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>'
  };

  function criar(raiz, audio, op) {
    op = op || {};
    var marcas = [];
    raiz.classList.add('ca-player');
    raiz.innerHTML = '<div class="ca-player-linha">' +
      '<button type="button" class="ca-play" data-p="play" aria-label="Tocar (Espaço)">' + ICONE.play + '</button>' +
      '<button type="button" class="ca-btn icone" data-p="-5" title="Voltar 5 s (←)" aria-label="Voltar 5 segundos">−5 s</button>' +
      '<button type="button" class="ca-btn icone" data-p="5" title="Avançar 5 s (→)" aria-label="Avançar 5 segundos">+5 s</button>' +
      '<span class="ca-tempo" data-p="tempo" aria-live="off">0:00 / 0:00</span>' +
      '<div class="ca-trilho" data-p="trilho" role="slider" tabindex="0" aria-label="Posição do áudio" aria-valuemin="0" aria-valuemax="0" aria-valuenow="0">' +
        '<div class="ca-fundo"></div><div class="ca-prog" data-p="prog"></div><div data-p="marcas"></div><div class="ca-cabeca" data-p="cabeca"></div></div>' +
      '<select data-p="vel" aria-label="Velocidade"><option value="0.75">0,75×</option><option value="1" selected>1×</option><option value="1.25">1,25×</option><option value="1.5">1,5×</option></select>' +
      (op.podeMarcar ? '<button type="button" class="ca-btn primario" data-p="marcar" title="Comentar este momento do áudio (M)">+ Comentar este momento</button>' : '') +
      '</div>';
    var $ = function (s) { return raiz.querySelector('[data-p="' + s + '"]'); };
    var dur = function () { return isFinite(audio.duration) && audio.duration > 0 ? audio.duration : (op.duracao || 0); };

    function atualizar() {
      var d = dur(), t = audio.currentTime || 0, pct = d ? Math.min(100, (t / d) * 100) : 0;
      $('prog').style.width = pct + '%'; $('cabeca').style.left = pct + '%';
      $('tempo').textContent = C.fmtTempo(t) + ' / ' + C.fmtTempo(d);
      var tr = $('trilho'); tr.setAttribute('aria-valuemax', Math.round(d)); tr.setAttribute('aria-valuenow', Math.round(t)); tr.setAttribute('aria-valuetext', C.fmtTempo(t));
      $('play').innerHTML = audio.paused ? ICONE.play : ICONE.pause;
      $('play').setAttribute('aria-label', audio.paused ? 'Tocar (Espaço)' : 'Pausar (Espaço)');
    }
    function desenharMarcas() {
      var d = dur();
      $('marcas').innerHTML = !d ? '' : marcas.map(function (a) {
        var v = C.visualDe(a);
        return '<span class="ca-marcador" data-id="' + a._id + '" style="left:' + Math.min(100, (a.tempo / d) * 100) + '%;--c:' + C.esc(v.cor) + '" title="' + C.fmtTempo(a.tempo) + ' · ' + C.esc(v.nome) + (a.comentario ? ': ' + C.esc(a.comentario.slice(0, 80)) : '') + '"></span>';
      }).join('');
    }
    ['timeupdate', 'play', 'pause', 'loadedmetadata', 'durationchange', 'ended'].forEach(function (ev) { audio.addEventListener(ev, function () { atualizar(); if (ev !== 'timeupdate') desenharMarcas(); }); });

    function irPara(s, tocar) {
      var d = dur();
      audio.currentTime = Math.max(0, d ? Math.min(d, s) : s);
      if (tocar) audio.play().catch(function () {});
      atualizar();
    }
    function posDoClique(e) { var r = $('trilho').getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * dur(); }
    var arrastando = false;
    $('trilho').addEventListener('pointerdown', function (e) {
      var m = e.target.closest('.ca-marcador');
      if (m) { var a = marcas.filter(function (x) { return String(x._id) === m.dataset.id; })[0]; if (a) { irPara(a.tempo, false); if (op.onMarcador) op.onMarcador(a); } return; }
      arrastando = true; $('trilho').setPointerCapture(e.pointerId); irPara(posDoClique(e));
    });
    $('trilho').addEventListener('pointermove', function (e) { if (arrastando) irPara(posDoClique(e)); });
    $('trilho').addEventListener('pointerup', function () { arrastando = false; });
    $('trilho').addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); irPara(audio.currentTime - 5); }
      if (e.key === 'ArrowRight') { e.preventDefault(); irPara(audio.currentTime + 5); }
      if (e.key === 'Home') { e.preventDefault(); irPara(0); }
      if (e.key === 'End') { e.preventDefault(); irPara(dur()); }
    });
    raiz.addEventListener('click', function (e) {
      var b = e.target.closest('[data-p]'); if (!b) return;
      var k = b.dataset.p;
      if (k === 'play') api.alternar();
      else if (k === '-5' || k === '5') api.pular(Number(k));
      else if (k === 'marcar' && op.onMarcar) { audio.pause(); op.onMarcar(audio.currentTime || 0, b); }
    });
    $('vel').addEventListener('change', function () { audio.playbackRate = Number($('vel').value) || 1; });

    var api = {
      marcadores: function (lista) { marcas = (lista || []).filter(function (a) { return a.tempo != null; }); desenharMarcas(); },
      ativar: function (id) { raiz.querySelectorAll('.ca-marcador').forEach(function (m) { m.classList.toggle('ativo', m.dataset.id === String(id)); }); },
      ir: irPara,
      tempo: function () { return audio.currentTime || 0; },
      alternar: function () { if (audio.paused) audio.play().catch(function () {}); else audio.pause(); },
      pular: function (s) { irPara((audio.currentTime || 0) + s); },
      marcar: function () { if (op.onMarcar) { audio.pause(); op.onMarcar(audio.currentTime || 0, $('marcar')); } }
    };
    atualizar();
    return api;
  }

  C.Player = { criar: criar };
})();
