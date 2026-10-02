// =====================================================================
// Correção anotada — editor do professor: junta texto anotado, painel, player e persistência.
// Correcao.Editor.abrir({ producao, folha, painel, editavel, persist, audio })
//   → { anotacoes(), importar(correcoes), desfazer(), refazer(), fechar() }
// Fluxo: selecionar um trecho (ou « Comentar este momento » no áudio) → escolher a categoria
// (clique ou tecla 1–9) → escrever o comentário e, se quiser, a forma correta → Ctrl+Enter.
// =====================================================================
(function () {
  var C = window.Correcao;

  function abrir(o) {
    var p = o.producao, oral = p.modalidade === 'oral';
    var alvoTexto = oral ? 'transcricao' : 'texto';
    var texto = (oral ? p.transcricao : p.textoDigitado) || '';
    var cats = C.categorias.ativas(oral ? 'oral' : 'textual');
    var lista = [], pilha = [], refazer = [], ultimaCat = cats[0] && cats[0].id, pop = null, player = null, orfas = [];

    // ---------- estrutura da folha ----------
    var palavras = texto ? (texto.trim().match(/\S+/g) || []).length : 0;
    o.folha.classList.add('ca-folha');
    o.folha.innerHTML = '<div class="ca-folha-cab"><div><h3>' + (oral ? 'Produção oral' : 'Produção escrita') + '</h3><small>' +
      (oral ? (p.duracaoSegundos ? 'Gravação de ' + C.fmtTempo(p.duracaoSegundos) : 'Gravação') + (texto ? ' · transcrição com ' + palavras + ' palavras' : ' · sem transcrição') : palavras + ' palavras') + '</small></div>' +
      '<div class="ca-acoes">' + (o.editavel ? '<button type="button" class="ca-btn icone" data-ed="desfazer" title="Desfazer (Ctrl+Z)" aria-label="Desfazer" disabled>↶</button>' +
        '<button type="button" class="ca-btn icone" data-ed="refazer" title="Refazer (Ctrl+Shift+Z)" aria-label="Refazer" disabled>↷</button>' : '') +
      '<button type="button" class="ca-btn icone" data-ed="atalhos" title="Atalhos de teclado (?)" aria-label="Atalhos de teclado">⌨</button></div></div>' +
      (o.editavel && cats.length ? '<div class="ca-paleta" data-ed="paleta" aria-label="Categorias de marcação">' + cats.map(function (c, i) {
        return '<button type="button" class="ca-cat" style="--c:' + C.esc(c.cor) + '" data-cat="' + C.esc(c.id) + '" title="' + C.esc(c.descricao || c.nome) + '"><i></i>' + C.esc(c.nome) + (i < 9 ? '<span class="ca-kbd">' + (i + 1) + '</span>' : '') + '</button>';
      }).join('') + '</div>' : '') +
      (oral ? '<div data-ed="player"></div>' + (texto ? '<div class="ca-transcricao-tit">Transcrição automática (revisada pelo aluno)</div>' : '') : '') +
      (texto ? '<div class="ca-texto' + (o.editavel ? ' editavel' : '') + '" data-ed="texto" lang="fr"></div>' :
        '<div class="ca-vazio">' + (oral ? 'Sem transcrição: comente direto nos momentos do áudio.' : 'O aluno enviou um arquivo anexo, sem texto digitado para anotar. Baixe o arquivo e use a avaliação abaixo.') + '</div>') +
      (o.editavel ? '<div class="ca-dica">' + (texto ? 'Selecione um trecho e escolha a categoria (teclas 1–9). ' : '') + (oral ? 'No áudio, use « Comentar este momento » (tecla M). ' : '') + 'Clique numa marcação para ver o comentário.</div>' : '');
    var elTexto = o.folha.querySelector('[data-ed="texto"]');

    // ---------- painel ----------
    var painel = C.Painel.criar(o.painel, {
      editavel: o.editavel, modalidade: oral ? 'oral' : 'textual',
      onIr: function (a) {
        if (player && a.tempo != null) { player.ir(a.tempo, false); player.ativar(a._id); }
        if (elTexto && a.trecho) C.TextoAnotado.focar(elTexto, a._id);
      },
      onEditar: function (a, dados) { editar(a, dados, true); },
      onExcluir: function (a) { remover(a, true); }
    });

    // ---------- player ----------
    if (oral && o.audio) {
      player = C.Player.criar(o.folha.querySelector('[data-ed="player"]'), o.audio, {
        duracao: p.duracaoSegundos, podeMarcar: o.editavel,
        onMarcador: function (a) { painel.ativar(a._id, false); player.ativar(a._id); },
        onMarcar: function (t, botao) { abrirPop({ alvo: 'audio', tempo: t, ancora: botao.getBoundingClientRect() }); }
      });
    } else if (oral) {
      o.folha.querySelector('[data-ed="player"]').innerHTML = '<div class="ca-vazio">Áudio indisponível.</div>';
    }

    function desenhar() {
      if (elTexto) {
        var r = C.TextoAnotado.render(elTexto, texto, lista.filter(function (a) { return a.alvo !== 'audio'; }), {
          ativo: painel.ativo(),
          onClicar: function (ids) { painel.ativar(ids[0], false); C.TextoAnotado.focar(elTexto, ids[0]); var a = porId(ids[0]); if (player && a && a.tempo != null) player.ir(a.tempo, false); }
        });
        orfas = r.orfas;
      }
      painel.atualizar(lista, orfas);
      if (player) player.marcadores(lista);
      var cont = {};
      lista.forEach(function (a) { cont[a.categoria] = (cont[a.categoria] || 0) + 1; });
      o.folha.querySelectorAll('.ca-paleta .ca-cat').forEach(function (b) {
        var n = b.querySelector('.ca-n'); if (!n) { n = document.createElement('span'); n.className = 'ca-n'; b.insertBefore(n, b.querySelector('.ca-kbd')); }
        n.textContent = cont[b.dataset.cat] ? '· ' + cont[b.dataset.cat] : '';
      });
      var d = o.folha.querySelector('[data-ed="desfazer"]'), f = o.folha.querySelector('[data-ed="refazer"]');
      if (d) d.disabled = !pilha.length; if (f) f.disabled = !refazer.length;
      if (o.onMudou) o.onMudou(lista);
    }
    function porId(id) { return lista.filter(function (a) { return String(a._id) === String(id); })[0]; }
    function erro(e) { if (o.onErro) o.onErro(e.message || 'Não foi possível salvar a anotação.'); }

    // ---------- operações (com desfazer/refazer) ----------
    function criar(dados) {
      return o.persist.criar(dados).then(function (a) {
        lista.push(a); pilha.push({ tipo: 'criar', id: a._id }); refazer = []; ultimaCat = a.categoria;
        desenhar(); painel.ativar(a._id, false);
        return a;
      }).catch(erro);
    }
    function editar(a, dados, registrar) {
      var antes = { categoria: a.categoria, comentario: a.comentario, sugestao: a.sugestao };
      return o.persist.atualizar(a._id, dados).then(function (novo) {
        lista = lista.map(function (x) { return String(x._id) === String(a._id) ? novo : x; });
        if (registrar) { pilha.push({ tipo: 'editar', id: a._id, antes: antes, depois: dados }); refazer = []; }
        desenhar();
      }).catch(erro);
    }
    function remover(a, registrar) {
      return o.persist.remover(a._id).then(function () {
        lista = lista.filter(function (x) { return String(x._id) !== String(a._id); });
        if (registrar) { pilha.push({ tipo: 'remover', id: a._id }); refazer = []; }
        desenhar();
        if (o.onAviso && registrar) o.onAviso('Comentário excluído.', 'Desfazer', desfazer);
      }).catch(erro);
    }
    function restaurar(id) {
      return o.persist.restaurar(id).then(function (a) { lista.push(a); desenhar(); }).catch(erro);
    }
    function desfazer() {
      var op = pilha.pop(); if (!op) return;
      var feito = op.tipo === 'criar' ? remover(porId(op.id) || { _id: op.id }, false)
        : op.tipo === 'remover' ? restaurar(op.id)
        : editar(porId(op.id), op.antes, false);
      Promise.resolve(feito).then(function () { refazer.push(op); desenhar(); });
    }
    function refazerUm() {
      var op = refazer.pop(); if (!op) return;
      var feito = op.tipo === 'criar' ? restaurar(op.id)
        : op.tipo === 'remover' ? remover(porId(op.id) || { _id: op.id }, false)
        : editar(porId(op.id), op.depois, false);
      Promise.resolve(feito).then(function () { pilha.push(op); desenhar(); });
    }

    // ---------- popover de criação ----------
    function fecharPop() { if (pop) { pop.remove(); pop = null; } }
    function abrirPop(alvo, catInicial) {
      fecharPop();
      var cat = catInicial || ultimaCat;
      var tempoAtual = player ? player.tempo() : 0;
      pop = document.createElement('div');
      pop.className = 'ca-pop ca';
      pop.setAttribute('role', 'dialog');
      pop.setAttribute('aria-label', 'Novo comentário');
      pop.innerHTML = (alvo.alvo === 'audio' ? '<div class="ca-pop-trecho">Momento do áudio: <b>' + C.fmtTempo(alvo.tempo) + '</b></div>' : '<div class="ca-pop-trecho">« ' + C.esc(alvo.trecho) + ' »</div>') +
        '<div class="ca-paleta">' + cats.map(function (c, i) {
          return '<button type="button" class="ca-cat" style="--c:' + C.esc(c.cor) + '" data-pcat="' + C.esc(c.id) + '" aria-pressed="' + (c.id === cat) + '"><i></i>' + C.esc(c.nome) + (i < 9 ? '<span class="ca-kbd">' + (i + 1) + '</span>' : '') + '</button>';
        }).join('') + '</div>' +
        '<label for="ca-pop-com">Comentário para o aluno</label><textarea id="ca-pop-com" placeholder="Explique o problema ou o que está bom…"></textarea>' +
        '<label for="ca-pop-sug">Forma correta (opcional)</label><input type="text" id="ca-pop-sug" placeholder="Ex.: il y a deux ans">' +
        (alvo.alvo !== 'audio' && player && tempoAtual > 0.5 ? '<label class="ca-check"><input type="checkbox" id="ca-pop-tempo" checked> Ligar ao momento atual do áudio (' + C.fmtTempo(tempoAtual) + ')</label>' : '') +
        '<div class="ca-pop-acoes"><button type="button" class="ca-btn" data-pop="cancelar">Cancelar <kbd>Esc</kbd></button><button type="button" class="ca-btn primario" data-pop="salvar">Salvar <kbd>Ctrl+Enter</kbd></button></div>';
      document.body.appendChild(pop);
      var r = alvo.ancora || alvo.rect;
      var x = Math.min(window.innerWidth - pop.offsetWidth - 12, Math.max(12, (r ? r.left : 100)));
      var y = (r ? r.bottom : 100) + 10;
      if (y + pop.offsetHeight > window.innerHeight - 8) {
        // não cabe embaixo: tenta acima do trecho; senão rola a página para mostrar o trecho e o comentário
        if ((r ? r.top : 100) - pop.offsetHeight - 10 >= 8) y = (r ? r.top : 100) - pop.offsetHeight - 10;
        else { window.scrollBy(0, y + pop.offsetHeight - window.innerHeight + 16); y = window.innerHeight - pop.offsetHeight - 8; }
      }
      pop.style.left = (x + window.scrollX) + 'px'; pop.style.top = (y + window.scrollY) + 'px';
      var com = pop.querySelector('#ca-pop-com');
      setTimeout(function () { com.focus(); }, 0);
      function escolher(id) { cat = id; pop.querySelectorAll('[data-pcat]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.pcat === id)); }); }
      function salvar() {
        var dados = { alvo: alvo.alvo === 'audio' ? 'audio' : alvoTexto, categoria: cat, comentario: com.value, sugestao: pop.querySelector('#ca-pop-sug').value };
        if (alvo.alvo === 'audio') dados.tempo = alvo.tempo;
        else {
          dados.inicio = alvo.inicio; dados.fim = alvo.fim; dados.trecho = alvo.trecho; dados.prefixo = alvo.prefixo; dados.sufixo = alvo.sufixo;
          var lig = pop.querySelector('#ca-pop-tempo'); if (lig && lig.checked) dados.tempo = tempoAtual;
        }
        fecharPop();
        window.getSelection() && window.getSelection().removeAllRanges();
        criar(dados);
      }
      pop.addEventListener('click', function (e) {
        var b = e.target.closest('[data-pcat]'); if (b) { escolher(b.dataset.pcat); com.focus(); return; }
        var a = e.target.closest('[data-pop]'); if (!a) return;
        if (a.dataset.pop === 'salvar') salvar(); else fecharPop();
      });
      pop.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { e.preventDefault(); fecharPop(); }
        else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); salvar(); }
        else if (/^[1-9]$/.test(e.key) && e.altKey && cats[Number(e.key) - 1]) { e.preventDefault(); escolher(cats[Number(e.key) - 1].id); }
      });
    }

    // ---------- seleção no texto ----------
    var selecaoAtual = null;
    if (elTexto && o.editavel) {
      elTexto.addEventListener('mouseup', function () {
        setTimeout(function () {
          selecaoAtual = C.selecaoNoTexto(elTexto, texto);
          if (selecaoAtual) abrirPop(selecaoAtual);
        }, 0);
      });
      elTexto.addEventListener('keyup', function (e) { if (e.shiftKey) selecaoAtual = C.selecaoNoTexto(elTexto, texto); });
    }
    o.folha.addEventListener('click', function (e) {
      var b = e.target.closest('[data-cat]');
      if (b) {
        ultimaCat = b.dataset.cat;
        var s = elTexto && C.selecaoNoTexto(elTexto, texto);
        if (s) abrirPop(s, b.dataset.cat);
        else o.folha.querySelectorAll('.ca-paleta [data-cat]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        return;
      }
      var a = e.target.closest('[data-ed]');
      if (!a) return;
      if (a.dataset.ed === 'desfazer') desfazer();
      if (a.dataset.ed === 'refazer') refazerUm();
      if (a.dataset.ed === 'atalhos') mostrarAtalhos();
    });
    document.addEventListener('mousedown', fora, true);
    function fora(e) { if (pop && !pop.contains(e.target) && !(elTexto && elTexto.contains(e.target)) && !e.target.closest('[data-cat],[data-p="marcar"]')) fecharPop(); }

    // ---------- atalhos de teclado ----------
    function digitando(el) { return el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)); }
    function teclas(e) {
      if (pop && pop.contains(e.target)) return;
      if (digitando(e.target)) return;
      var k = e.key;
      if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'z' && o.editavel) { e.preventDefault(); if (e.shiftKey) refazerUm(); else desfazer(); return; }
      if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'y' && o.editavel) { e.preventDefault(); refazerUm(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (/^[1-9]$/.test(k) && o.editavel && cats[Number(k) - 1]) {
        var s = elTexto && C.selecaoNoTexto(elTexto, texto);
        if (s) { e.preventDefault(); abrirPop(s, cats[Number(k) - 1].id); }
        return;
      }
      if (k === 'j' || k === 'J') { e.preventDefault(); painel.proximo(1); }
      else if (k === 'k' || k === 'K') { e.preventDefault(); painel.proximo(-1); }
      else if (k === '?') { e.preventDefault(); mostrarAtalhos(); }
      else if (player && k === ' ' && !e.target.closest('button')) { e.preventDefault(); player.alternar(); }
      else if (player && k === 'ArrowLeft' && !e.target.closest('.ca-trilho')) { e.preventDefault(); player.pular(-5); }
      else if (player && k === 'ArrowRight' && !e.target.closest('.ca-trilho')) { e.preventDefault(); player.pular(5); }
      else if (player && (k === 'm' || k === 'M') && o.editavel) { e.preventDefault(); player.marcar(); }
    }
    document.addEventListener('keydown', teclas);

    function mostrarAtalhos() {
      var m = document.createElement('div');
      m.className = 'ca-modal ca';
      m.innerHTML = '<div role="dialog" aria-label="Atalhos de teclado"><h3>Atalhos de teclado <button type="button" class="ca-mini" data-f>Fechar ✕</button></h3><div class="ca-atalhos">' +
        (o.editavel ? '<kbd>1 – 9</kbd><span>Marcar o trecho selecionado com a categoria</span><kbd>Ctrl+Enter</kbd><span>Salvar o comentário</span><kbd>Esc</kbd><span>Fechar o comentário sem salvar</span>' +
          '<kbd>Ctrl+Z</kbd><span>Desfazer</span><kbd>Ctrl+Shift+Z</kbd><span>Refazer</span><kbd>Ctrl+S</kbd><span>Salvar a avaliação agora</span>' : '') +
        '<kbd>J / K</kbd><span>Próximo / comentário anterior</span>' +
        (oral ? '<kbd>Espaço</kbd><span>Tocar / pausar o áudio</span><kbd>← / →</kbd><span>Voltar / avançar 5 s</span>' + (o.editavel ? '<kbd>M</kbd><span>Comentar o momento atual do áudio</span>' : '') : '') +
        '<kbd>?</kbd><span>Mostrar estes atalhos</span></div></div>';
      document.body.appendChild(m);
      var fechar = function () { m.remove(); document.removeEventListener('keydown', esc, true); };
      var esc = function (e) { if (e.key === 'Escape') { e.stopPropagation(); fechar(); } };
      document.addEventListener('keydown', esc, true);
      m.addEventListener('click', function (e) { if (e.target === m || e.target.closest('[data-f]')) fechar(); });
      m.querySelector('[data-f]').focus();
    }

    // ---------- carga inicial ----------
    var pronto = o.persist.listar().then(function (l) { lista = l; desenhar(); }).catch(function (e) { erro(e); desenhar(); });

    return {
      pronto: pronto,
      anotacoes: function () { return lista.slice(); },
      // Transforma as correções sugeridas (ex.: pela IA) em anotações no texto.
      importar: function (correcoes, categoria) {
        var cat = categoria || (cats.filter(function (c) { return c.id === 'gramatica'; })[0] || cats[0] || {}).id;
        var seq = Promise.resolve(), n = 0;
        (correcoes || []).forEach(function (c) {
          var pos = C.localizar(texto, { trecho: String(c.trecho || '').trim() });
          if (!pos || lista.some(function (a) { return a.inicio === pos.inicio && a.fim === pos.fim; })) return;
          seq = seq.then(function () {
            return criar({ alvo: alvoTexto, inicio: pos.inicio, fim: pos.fim, trecho: texto.slice(pos.inicio, pos.fim), categoria: cat, comentario: c.explicacao || '', sugestao: c.correcao || '' })
              .then(function (a) { if (a) n++; });
          });
        });
        return seq.then(function () { return n; });
      },
      desfazer: desfazer, refazer: refazerUm,
      fechar: function () {
        fecharPop();
        C.TextoAnotado.esconderTip();
        document.removeEventListener('keydown', teclas);
        document.removeEventListener('mousedown', fora, true);
        if (o.audio) o.audio.pause();
      }
    };
  }

  C.Editor = { abrir: abrir };
})();
