// =====================================================================
// FLASHCARDS — Nova rodada (temas + quantidade escolhidos pelo aluno),
// Revisão semanal (leque de palavras que só libera de novo depois de dias)
// e Meu progresso. Adaptado de um protótipo Google Apps Script (Sheets +
// google.script.run) para rodar contra a API REST do site (backend/routes/
// flashcards.js) — mesmo estilo visual "glass" do resto da Plataforma de
// Questões, mesmo helper de áudio (js/audioFrances.js) usado em Questões
// Interativas.
// =====================================================================
(function () {
  function authHeaders(json) {
    var token = localStorage.getItem('token');
    var h = { Authorization: 'Bearer ' + token };
    if (json) h['Content-Type'] = 'application/json';
    return h;
  }

  function api(metodo, caminho, corpo) {
    return fetch('/api/flashcards' + caminho, {
      method: metodo,
      headers: authHeaders(!!corpo),
      body: corpo ? JSON.stringify(corpo) : undefined
    }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, dados: d }; }); });
  }

  function escapar(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function falar(texto, botao) {
    if (window.falarFrances) falarFrances(texto, botao);
  }

  function el(id) { return document.getElementById(id); }

  /* =========================================================
     ABAS
     ========================================================= */
  var VIEWS = ['rodada', 'revisao', 'progresso'];
  function mudarAba(view) {
    VIEWS.forEach(function (v) {
      el('fcView' + v.charAt(0).toUpperCase() + v.slice(1)).style.display = v === view ? '' : 'none';
    });
    [].forEach.call(document.querySelectorAll('.fc-tab'), function (b) {
      b.classList.toggle('on', b.dataset.view === view);
    });
    if (view === 'rodada') carregarTemasRodada();
    if (view === 'revisao') carregarRevisao();
    if (view === 'progresso') carregarProgresso();
  }
  [].forEach.call(document.querySelectorAll('.fc-tab'), function (b) {
    b.onclick = function () { mudarAba(b.dataset.view); };
  });

  /* =========================================================
     NOVA RODADA
     ========================================================= */
  var R = { temasSelecionados: [], tamanho: 20, fila: [], indice: 0, acertos: 0 };

  function carregarTemasRodada() {
    var alvo = el('fcViewRodada');
    alvo.innerHTML = '<div class="fc-card-painel"><p class="fc-hint">Carregando temas…</p></div>';
    api('GET', '/temas').then(function (res) {
      if (!res.ok) { alvo.innerHTML = '<div class="fc-card-painel"><p class="fc-vazio">Erro ao carregar os temas.</p></div>'; return; }
      renderConfigRodada(res.dados);
    });
  }

  function renderConfigRodada(opcoes) {
    var alvo = el('fcViewRodada');
    if (!opcoes.temas.length) {
      alvo.innerHTML = '<div class="fc-card-painel"><p class="fc-vazio">Nenhuma palavra cadastrada ainda.</p></div>';
      return;
    }
    R.tamanho = opcoes.tamanhoPadrao;

    var chipsTemas = opcoes.temas.map(function (t) {
      return '<label class="fc-tema-chip' + (t.novas === 0 ? ' sem-novas' : '') + '" data-tema="' + escapar(t.tema) + '">' +
        '<input type="checkbox" value="' + escapar(t.tema) + '" style="accent-color:var(--accent);margin:0;">' +
        '<span>' + escapar(t.tema) + '</span>' +
        '<span class="fc-qtd">' + t.novas + ' nova' + (t.novas === 1 ? '' : 's') + '</span>' +
      '</label>';
    }).join('');

    var chipsTamanho = opcoes.tamanhos.map(function (n) {
      return '<button type="button" class="fc-tam-chip' + (n === R.tamanho ? ' on' : '') + '" data-tamanho="' + n + '">' + n + '</button>';
    }).join('');

    alvo.innerHTML =
      '<div class="fc-card-painel">' +
        '<h2>Monte sua rodada</h2>' +
        '<p class="fc-hint">Escolha os temas e quantas palavras novas quer estudar agora.</p>' +
        '<div class="fc-secao-rot fc-secao-header">Temas' +
          '<button type="button" class="fc-link-btn" id="fcMarcarTodos">Marcar todos</button>' +
          '<button type="button" class="fc-link-btn" id="fcLimparTodos">Limpar</button>' +
        '</div>' +
        '<div class="fc-temas" id="fcTemas">' + chipsTemas + '</div>' +
        '<div class="fc-secao-rot">Quantidade de palavras</div>' +
        '<div class="fc-tamanhos" id="fcTamanhos">' + chipsTamanho + '</div>' +
        '<button type="button" class="fc-btn destaque" id="fcComecar" style="margin-top:20px;">Começar rodada</button>' +
      '</div>';

    [].forEach.call(document.querySelectorAll('#fcTemas .fc-tema-chip'), function (chip) {
      var cb = chip.querySelector('input');
      cb.onchange = function () { chip.classList.toggle('on', cb.checked); };
    });
    el('fcMarcarTodos').onclick = function () {
      [].forEach.call(document.querySelectorAll('#fcTemas .fc-tema-chip'), function (chip) {
        chip.querySelector('input').checked = true; chip.classList.add('on');
      });
    };
    el('fcLimparTodos').onclick = function () {
      [].forEach.call(document.querySelectorAll('#fcTemas .fc-tema-chip'), function (chip) {
        chip.querySelector('input').checked = false; chip.classList.remove('on');
      });
    };
    [].forEach.call(document.querySelectorAll('#fcTamanhos .fc-tam-chip'), function (b) {
      b.onclick = function () {
        R.tamanho = Number(b.dataset.tamanho);
        [].forEach.call(document.querySelectorAll('#fcTamanhos .fc-tam-chip'), function (x) { x.classList.remove('on'); });
        b.classList.add('on');
      };
    });
    el('fcComecar').onclick = iniciarRodada;
  }

  function iniciarRodada() {
    var temas = [].map.call(document.querySelectorAll('#fcTemas input:checked'), function (cb) { return cb.value; });
    if (!temas.length) { alert('Selecione ao menos um tema.'); return; }
    R.temasSelecionados = temas;

    var alvo = el('fcViewRodada');
    alvo.innerHTML = '<div class="fc-card-painel"><p class="fc-hint">Carregando novas palavras…</p></div>';
    api('POST', '/rodada', { temas: temas, quantidade: R.tamanho }).then(function (res) {
      if (!res.ok) { alvo.innerHTML = '<div class="fc-card-painel"><p class="fc-vazio">Erro ao montar a rodada.</p></div>'; return; }
      R.fila = res.dados; R.indice = 0; R.acertos = 0;
      if (!R.fila.length) {
        alvo.innerHTML = '<div class="fc-card-painel"><p class="fc-vazio">🎉 Não há mais palavras novas nos temas escolhidos. Tente marcar outros temas.</p>' +
          '<button type="button" class="fc-btn destaque" id="fcOutrosTemas" style="margin-top:14px;">Escolher outros temas</button></div>';
        el('fcOutrosTemas').onclick = carregarTemasRodada;
        return;
      }
      renderRodada();
    });
  }

  function renderRodada() {
    var alvo = el('fcViewRodada');
    if (R.indice >= R.fila.length) {
      alvo.innerHTML = '<div class="fc-card-painel" style="text-align:center;">' +
        '<p class="fc-vazio">✅ Rodada concluída! Você acertou <b>' + R.acertos + '</b> de <b>' + R.fila.length + '</b>.</p>' +
        '<div style="display:flex; gap:12px; justify-content:center; flex-wrap:wrap;">' +
          '<button type="button" class="fc-btn destaque" id="fcProxRodada" style="width:auto;">Próxima rodada (mesmos temas)</button>' +
          '<button type="button" class="fc-btn" id="fcTrocarTemas">Alterar temas/quantidade</button>' +
        '</div></div>';
      el('fcProxRodada').onclick = iniciarRodada;
      el('fcTrocarTemas').onclick = carregarTemasRodada;
      return;
    }
    var w = R.fila[R.indice];
    var pct = Math.round((R.indice / R.fila.length) * 100);

    alvo.innerHTML =
      '<div class="fc-status">' +
        '<div class="fc-chip">Palavra <b>' + (R.indice + 1) + '</b>/' + R.fila.length + '</div>' +
        '<div class="fc-barra"><i style="width:' + pct + '%"></i></div>' +
      '</div>' +
      montarFlashcardHtml(w, 'fcRodadaCard');

    ligarFlashcard(w, 'fcRodadaCard', function (correto) {
      api('POST', '/responder', { palavraId: w._id, correto: correto });
      if (correto) R.acertos++;
      R.indice++;
      renderRodada();
    });
  }

  /* =========================================================
     FICHA (compartilhada entre Nova rodada e Revisão semanal)
     ========================================================= */
  function montarFlashcardHtml(w, idCard) {
    return '<div class="fc-flash-wrap">' +
      '<div class="fc-flash-card" id="' + idCard + '">' +
        '<div class="fc-flash-frente">' +
          '<span class="fc-classe-tag">' + escapar(w.classe) + '</span>' +
          '<span class="fc-cat-tag">' + escapar(w.categoria) + '</span>' +
          '<div class="fc-flash-termo">' + escapar(w.fr) + '</div>' +
          '<button type="button" class="fc-som" data-fala="' + escapar(w.fr) + '">🔊</button>' +
          '<div class="fc-flash-toque">Toque pra virar</div>' +
        '</div>' +
        '<div class="fc-flash-verso" style="display:none;">' +
          '<span class="fc-classe-tag">' + escapar(w.classe) + '</span>' +
          '<span class="fc-cat-tag">' + escapar(w.categoria) + '</span>' +
          '<div class="fc-flash-trad">' + escapar(w.pt) + '</div>' +
          '<div class="fc-flash-frase">"' + escapar(w.frase) + '"</div>' +
          '<div class="fc-flash-botoes">' +
            '<button type="button" class="fc-btn errado" data-resp="nao">Não sabia</button>' +
            '<button type="button" class="fc-btn certo" data-resp="sim">Sabia</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function ligarFlashcard(w, idCard, aoResponder) {
    var card = el(idCard);
    var frente = card.querySelector('.fc-flash-frente');
    var verso = card.querySelector('.fc-flash-verso');
    var som = card.querySelector('.fc-som');

    card.onclick = function (ev) {
      if (ev.target.closest('button')) return;
      if (verso.style.display !== 'none') return;
      frente.style.display = 'none';
      verso.style.display = '';
      falar(w.fr);
    };
    som.onclick = function (ev) { ev.stopPropagation(); falar(w.fr, som); };
    card.querySelector('[data-resp="nao"]').onclick = function (ev) { ev.stopPropagation(); aoResponder(false); };
    card.querySelector('[data-resp="sim"]').onclick = function (ev) { ev.stopPropagation(); aoResponder(true); };
  }

  /* =========================================================
     REVISÃO SEMANAL
     ========================================================= */
  var V = { fila: [], totalUnicas: 0 };

  function carregarRevisao() {
    var alvo = el('fcViewRevisao');
    alvo.innerHTML = '<div class="fc-card-painel"><p class="fc-hint">Verificando disponibilidade…</p></div>';
    api('GET', '/revisao/status').then(function (res) {
      if (!res.ok) { alvo.innerHTML = '<div class="fc-card-painel"><p class="fc-vazio">Erro ao verificar a revisão.</p></div>'; return; }
      var status = res.dados;
      if (!status.disponivel) {
        var msg = status.palavrasElegiveis < status.minimoNecessario
          ? 'Estude pelo menos ' + status.minimoNecessario + ' palavras em "Nova rodada" pra desbloquear a revisão semanal (você já estudou ' + status.palavrasElegiveis + ').'
          : 'Sua próxima revisão semanal libera em ' + status.diasRestantes + ' dia(s). Volte em breve!';
        alvo.innerHTML = '<div class="fc-card-painel"><p class="fc-vazio">📅 ' + escapar(msg) + '</p></div>';
        return;
      }
      iniciarRevisao();
    });
  }

  function iniciarRevisao() {
    var alvo = el('fcViewRevisao');
    alvo.innerHTML = '<div class="fc-card-painel"><p class="fc-hint">Montando seu leque de palavras…</p></div>';
    api('GET', '/revisao').then(function (res) {
      if (!res.ok || !res.dados.length) { alvo.innerHTML = '<div class="fc-card-painel"><p class="fc-vazio">Erro ao montar a revisão.</p></div>'; return; }
      V.fila = res.dados.slice();
      V.totalUnicas = res.dados.length;
      renderRevisao();
    });
  }

  function renderRevisao() {
    var alvo = el('fcViewRevisao');
    if (!V.fila.length) {
      api('POST', '/revisao/completar');
      alvo.innerHTML = '<div class="fc-card-painel" style="text-align:center;">' +
        '<p class="fc-vazio">🏆 Leque completo! Você acertou as ' + V.totalUnicas + ' palavras da revisão desta semana.</p>' +
      '</div>';
      return;
    }
    var w = V.fila[0];
    var restantes = V.fila.length;

    alvo.innerHTML =
      '<p class="fc-progresso-legenda">Faltam <b>' + restantes + '</b> palavra(s) pra completar o leque</p>' +
      montarFlashcardHtml(w, 'fcRevisaoCard');

    ligarFlashcard(w, 'fcRevisaoCard', function (correto) {
      api('POST', '/revisao/responder', { palavraId: w._id, correto: correto });
      if (correto) {
        V.fila.shift();
      } else {
        V.fila.push(V.fila.shift());
      }
      renderRevisao();
    });
  }

  /* =========================================================
     MEU PROGRESSO
     ========================================================= */
  function carregarProgresso() {
    var alvo = el('fcViewProgresso');
    alvo.innerHTML = '<div class="fc-card-painel"><p class="fc-hint">Carregando seu progresso…</p></div>';
    api('GET', '/progresso').then(function (res) {
      if (!res.ok) { alvo.innerHTML = '<div class="fc-card-painel"><p class="fc-vazio">Erro ao carregar seu progresso.</p></div>'; return; }
      var s = res.dados;
      var piores = s.piores.map(function (p) {
        return '<div class="fc-palavra-row">' +
          '<div><div class="fc-fr">' + escapar(p.word.fr) + '</div><div class="fc-pt">' + escapar(p.word.pt) + '</div></div>' +
          '<span class="fc-badge-erro">' + Math.round(p.indiceErro * 100) + '% de erro</span>' +
        '</div>';
      }).join('') || '<p class="fc-hint">Ainda não há dados de erro suficientes.</p>';

      alvo.innerHTML =
        '<div class="fc-card-painel">' +
          '<h2>Olá' + (s.nome ? ', ' + escapar(s.nome) : '') + '</h2>' +
          '<div class="fc-stats-grid">' +
            '<div class="fc-stat-box"><div class="fc-num">' + s.estudadas + '</div><div class="fc-label">palavras estudadas</div></div>' +
            '<div class="fc-stat-box"><div class="fc-num">' + s.totalPalavras + '</div><div class="fc-label">total no baralho</div></div>' +
            '<div class="fc-stat-box"><div class="fc-num">' + s.dominadas + '</div><div class="fc-label">dominadas</div></div>' +
            '<div class="fc-stat-box"><div class="fc-num">' + s.taxaAcerto + '%</div><div class="fc-label">taxa de acerto</div></div>' +
          '</div>' +
        '</div>' +
        '<div class="fc-card-painel">' +
          '<h2>Palavras que mais te desafiam</h2>' +
          piores +
        '</div>';
    });
  }

  mudarAba('rodada');
})();
