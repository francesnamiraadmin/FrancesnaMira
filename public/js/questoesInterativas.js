// =====================================================================
// QUESTÕES INTERATIVAS — motor do jogo de arrastar-e-soltar (vocabulário
// "La ville, les commerces et les loisirs"). Adaptado de um protótipo feito
// originalmente pra rodar como HTML standalone dentro do Google Apps Script
// (usava `google.script.run.salvarResultado` e `<?= aluno ?>`) — aqui roda
// direto na página, sem persistência de resultado no backend (não existe um
// modelo de dados equivalente a isso ainda; o resultado fica só na tela ao
// final de cada rodada).
//
// Dados (vocabulário + ícones SVG) vêm de js/questoesInterativasDados.js
// (window.QI_VOCAB / window.QI_ICONES), carregado antes deste script.
// =====================================================================
(function () {
  var POR_RODADA = 6;

  // Vocabulário e categorias vêm de questoesInterativasDados.js (nível A1, sem
  // campo `nivel` explícito nas categorias — tratado como A1 abaixo) mais os
  // arquivos por nível carregados em seguida (A2/B1/B2/TCF/DELF, ver
  // questoesInterativasDadosA2.js e os demais). window.QI_VOCAB já vem com
  // `v.n` (nível) em cada termo; CATEGORIAS_TODAS abaixo espelha isso pra cada
  // família temática, pra filtrar pelo curso resolvido em aplicarFiltroNivel().
  var VOCAB_TODAS = window.QI_VOCAB;
  var CATEGORIAS_TODAS = [
    { id:'todas', rot:'Tudo' },

    // --- A1 (vocabulário original "La ville, les commerces et les loisirs") ---
    { id:'lieux',           rot:'📍 Les lieux',           nivel:'A1' },
    { id:'commerces',       rot:'🏪 Les commerces',       nivel:'A1' },
    { id:'batiments',       rot:'🏛️ Les bâtiments',       nivel:'A1' },
    { id:'transports',      rot:'🚗 Les transports',      nivel:'A1' },
    { id:'circulation',     rot:'🚦 La circulation',      nivel:'A1' },
    { id:'deplacements',    rot:'🚶 Les déplacements',    nivel:'A1' },
    { id:'infrastructures', rot:'🏢 Infrastructures',     nivel:'A1' },
    { id:'loisirs',         rot:'🌳 Les loisirs',         nivel:'A1' },
    { id:'problemes',       rot:'🚨 Les problèmes',       nivel:'A1' },

    // --- A2 ---
    { id:'a2-familia',     rot:'👪 La famille',       nivel:'A2' },
    { id:'a2-corpo',       rot:'🧍 Le corps',          nivel:'A2' },
    { id:'a2-vestimentas', rot:'👕 Les vêtements',     nivel:'A2' },
    { id:'a2-comida',      rot:'🍞 La nourriture',     nivel:'A2' },
    { id:'a2-casa',        rot:'🏠 La maison',         nivel:'A2' },
    { id:'a2-meteo',       rot:'⛅ La météo',          nivel:'A2' },
    { id:'a2-cores',       rot:'🎨 Les couleurs',      nivel:'A2' },
    { id:'a2-animais',     rot:'🐶 Les animaux',       nivel:'A2' },
    { id:'a2-lazer',       rot:'🎯 Les loisirs',       nivel:'A2' },
    { id:'a2-adjetivos',   rot:'✨ Les adjectifs',     nivel:'A2' },
    { id:'a2-verbos',      rot:'🔁 Les verbes',        nivel:'A2' },

    // --- B1 ---
    { id:'b1-sentimentos',   rot:'😊 Les sentiments',            nivel:'B1' },
    { id:'b1-personalidade', rot:'🧠 La personnalité',           nivel:'B1' },
    { id:'b1-viagem',        rot:'🧳 Le voyage',                 nivel:'B1' },
    { id:'b1-midia',         rot:'📰 Médias et communication',   nivel:'B1' },
    { id:'b1-ambiente',      rot:"🌳 L'environnement",           nivel:'B1' },
    { id:'b1-trabalho',      rot:'💼 Le travail',                nivel:'B1' },
    { id:'b1-tecnologia',    rot:'💻 La technologie',            nivel:'B1' },
    { id:'b1-sociedade',     rot:'⚖️ La société',                nivel:'B1' },
    { id:'b1-verbos',        rot:'🔁 Verbes et expressions',     nivel:'B1' },
    { id:'b1-opiniao',       rot:"💬 L'opinion",                 nivel:'B1' },

    // --- B2 ---
    { id:'b2-ambiente',   rot:'🌍 Climat et environnement',    nivel:'B2' },
    { id:'b2-sociedade',  rot:'🤝 Inégalités sociales',        nivel:'B2' },
    { id:'b2-midia',      rot:'📡 Médias et désinformation',   nivel:'B2' },
    { id:'b2-economia',   rot:'💰 Économie et consommation',   nivel:'B2' },
    { id:'b2-saude',      rot:'🧘 Santé et bien-être',         nivel:'B2' },
    { id:'b2-educacao',   rot:'🎓 Éducation',                  nivel:'B2' },
    { id:'b2-politica',   rot:'🏛️ Politique et citoyenneté',   nivel:'B2' },
    { id:'b2-ciencia',    rot:'🔬 Science et innovation',      nivel:'B2' },
    { id:'b2-conectores', rot:'🔗 Connecteurs logiques',       nivel:'B2' },
    { id:'b2-verbos',     rot:'🔁 Verbes et expressions',      nivel:'B2' },

    // --- TCF ---
    { id:'tcf-administrativo', rot:'📋 Vie administrative',     nivel:'TCF' },
    { id:'tcf-profissional',   rot:'💼 Vie professionnelle',    nivel:'TCF' },
    { id:'tcf-educacao',       rot:'🎓 Éducation et formation', nivel:'TCF' },
    { id:'tcf-cotidiano',      rot:'🏘️ Quotidien avancé',       nivel:'TCF' },
    { id:'tcf-atualidades',    rot:'📺 Actualités et médias',   nivel:'TCF' },
    { id:'tcf-urbano',         rot:'🏙️ Environnement urbain',   nivel:'TCF' },
    { id:'tcf-consumo',        rot:'🛒 Consommation',           nivel:'TCF' },
    { id:'tcf-saude',          rot:'🩺 Santé et bien-être',     nivel:'TCF' },
    { id:'tcf-expressoes',     rot:'🗣️ Expressions utiles',     nivel:'TCF' },
    { id:'tcf-conectores',     rot:'🔗 Connecteurs',            nivel:'TCF' },

    // --- DELF ---
    { id:'delf-argumentacao', rot:'🗣️ Argumentation et opinion',    nivel:'DELF' },
    { id:'delf-ambiente',     rot:'🌍 Environnement et écologie',   nivel:'DELF' },
    { id:'delf-educacao',     rot:'🎓 Éducation et savoir',         nivel:'DELF' },
    { id:'delf-trabalho',     rot:'💼 Monde du travail',            nivel:'DELF' },
    { id:'delf-sociedade',    rot:'🤝 Société et solidarité',       nivel:'DELF' },
    { id:'delf-cultura',      rot:'🎭 Culture et médias',           nivel:'DELF' },
    { id:'delf-saude',        rot:'🧘 Santé et bien-être',          nivel:'DELF' },
    { id:'delf-tecnologia',   rot:'💻 Technologie et innovation',   nivel:'DELF' },
    { id:'delf-expressoes',   rot:'💬 Expressions DELF',            nivel:'DELF' },
    { id:'delf-conectores',   rot:'🔗 Connecteurs DELF',            nivel:'DELF' }
  ];

  // Cursos que têm vocabulário dedicado — DALF e TEF (e qualquer curso não
  // resolvido) caem no fallback "sem filtro": mostram o acervo inteiro em vez
  // de uma tela vazia, já que não foi pedido conteúdo específico pra eles.
  var NIVEIS_COM_CONTEUDO = ['A1', 'A2', 'B1', 'B2', 'TCF', 'DELF'];

  var VOCAB = VOCAB_TODAS;
  var CATEGORIAS = CATEGORIAS_TODAS;

  function aplicarFiltroNivel(){
    var nivel = window.CursoContexto && window.CursoContexto.curso;
    if (nivel && NIVEIS_COM_CONTEUDO.indexOf(nivel) !== -1) {
      VOCAB = VOCAB_TODAS.filter(function(v){ return v.n === nivel; });
      CATEGORIAS = CATEGORIAS_TODAS.filter(function(c){ return c.id === 'todas' || c.nivel === nivel; });
    } else {
      VOCAB = VOCAB_TODAS;
      CATEGORIAS = CATEGORIAS_TODAS;
    }
  }

  var MODOS = [
    { id:'imagem',   rot:'🖼️ Imagem → francês',    dica:'Arraste o desenho até a palavra francesa.' },
    { id:'traducao', rot:'🇧🇷 Francês → português', dica:'Arraste o termo francês até a tradução.' },
    { id:'categoria',rot:'🗂️ Termo → categoria',    dica:'Arraste cada termo até a família a que pertence.' },
    { id:'audio',    rot:'🔊 Áudio → escrita',      dica:'Ouça e arraste o som até a palavra escrita.' },
    { id:'misto',    rot:'🎲 Misto',                dica:'As quatro mecânicas embaralhadas.' }
  ];

  // O modo é escolhido no hub (questoes-interativas.html) e chega pela URL — esta
  // página (questoes-interativas-jogo.html) não tem mais seletor de mecânica; se o
  // parâmetro faltar ou for inválido, volta pro hub em vez de quebrar.
  var MODOS_VALIDOS = MODOS.map(function(m){ return m.id; });
  var modoDaUrl = new URLSearchParams(window.location.search).get('modo');
  if (MODOS_VALIDOS.indexOf(modoDaUrl) === -1) {
    window.location.href = 'questoes-interativas.html';
    return;
  }

  var E = {
    cat:'todas', modo:modoDaUrl, pool:[], rodada:0, totalRodadas:1, atual:[],
    modoRodada:modoDaUrl, acertos:0, erros:0, feitos:0, listaErros:[],
    audio:true, t0:null, cron:null, arrastado:null
  };

  /* =========================================================
     ÁUDIO — delega pro helper compartilhado (js/audioFrances.js), que toca
     o áudio real gerado com Coqui TTS (ou cai pra Web Speech API).
     ========================================================= */
  function falar(texto, botao){
    if (!E.audio || !window.falarFrances) return;
    falarFrances(texto, botao);
  }

  /* =========================================================
     UTILITÁRIOS
     ========================================================= */
  function baralhar(a){
    a = a.slice();
    for (var i=a.length-1;i>0;i--){
      var j = Math.floor(Math.random()*(i+1));
      var t=a[i]; a[i]=a[j]; a[j]=t;
    }
    return a;
  }
  function el(id){ return document.getElementById(id); }
  function porId(id){
    for (var i=0;i<VOCAB.length;i++) if (VOCAB[i].id===id) return VOCAB[i];
    return null;
  }
  function mmss(s){ return Math.floor(s/60)+':'+('0'+(s%60)).slice(-2); }
  function rotuloCat(c){
    for (var i=0;i<CATEGORIAS.length;i++) if (CATEGORIAS[i].id===c) return CATEGORIAS[i].rot;
    return c;
  }
  /** separa artigo do substantivo, para destacar o gênero */
  function partirArtigo(fr){
    var m = fr.match(/^(le |la |les |l'|un |une )/);
    return m ? { art:m[1], resto:fr.slice(m[1].length) } : { art:'', resto:fr };
  }
  function escapar(s){
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
                    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* =========================================================
     MONTAGEM
     ========================================================= */
  /** separa o emoji do resto do rótulo, pra desenhar o card com o emoji em destaque */
  function partirEmoji(rot){
    var m = rot.match(/^(\S+)\s(.+)$/);
    return m ? { emoji:m[1], nome:m[2] } : { emoji:'', nome:rot };
  }

  function montarCartoesCategoria(){
    el('qiCatGrid').innerHTML = CATEGORIAS.map(function(c){
      var n = c.id==='todas' ? VOCAB.length
            : VOCAB.filter(function(v){ return v.c===c.id; }).length;
      var part = partirEmoji(c.rot);
      return '<div class="qi-cat-card" data-cat="'+c.id+'">'+
               '<div class="qi-cat-emoji">'+(part.emoji||'📚')+'</div>'+
               '<div class="qi-cat-nome">'+escapar(part.nome)+'</div>'+
               '<div class="qi-cat-qt">'+n+' termo'+(n===1?'':'s')+'</div>'+
             '</div>';
    }).join('');
    [].forEach.call(document.querySelectorAll('.qi-cat-card'), function(card){
      card.onclick = function(){
        E.cat = card.dataset.cat;
        el('qiCatWrap').style.display = 'none';
        el('qiWrap').style.display = '';
        iniciar();
      };
    });
  }

  function aplicarSubtitulo(){
    var infoModo = MODOS.filter(function(x){ return x.id===E.modo; })[0];
    var sub = el('qiSubtitulo');
    if (infoModo && sub) sub.textContent = infoModo.rot.replace(/^[^\s]+\s/, '') + ' — ' + infoModo.dica;
  }

  function iniciar(){
    aplicarSubtitulo();
    E.pool = baralhar(
      E.cat==='todas' ? VOCAB.slice() : VOCAB.filter(function(v){ return v.c===E.cat; })
    );
    E.totalRodadas = Math.max(1, Math.ceil(E.pool.length / POR_RODADA));
    E.rodada = 0; E.acertos = 0; E.erros = 0; E.feitos = 0; E.listaErros = [];
    E.t0 = Date.now();
    clearInterval(E.cron);
    E.cron = setInterval(function(){
      el('qiTempo').textContent = mmss(Math.floor((Date.now()-E.t0)/1000));
    }, 1000);
    proximaRodada();
  }

  function proximaRodada(){
    el('qiResultado').classList.remove('ver');
    var ini = E.rodada * POR_RODADA;
    E.atual = E.pool.slice(ini, ini + POR_RODADA);
    if (!E.atual.length){ finalizar(); return; }
    E.rodada++;

    // no modo misto, cada rodada sorteia uma mecânica
    if (E.modo === 'misto'){
      var op = ['imagem','traducao','categoria','audio'];
      E.modoRodada = op[Math.floor(Math.random()*op.length)];
    } else {
      E.modoRodada = E.modo;
    }

    desenhar();
    atualizarStatus();
  }

  /* =========================================================
     DESENHO DAS QUATRO MECÂNICAS
     ========================================================= */
  function desenhar(){
    var m = E.modoRodada;
    var infoModo = MODOS.filter(function(x){ return x.id===m; })[0] || MODOS[0];
    el('qiDicaModo').textContent = infoModo.dica;
    el('qiRotuloEsq').textContent = ({
      imagem:'🖼️ Images', traducao:'🇫🇷 Français',
      categoria:'🏷️ Termes', audio:'🔊 Sons'
    })[m];
    el('qiRotuloDir').textContent = ({
      imagem:'🇫🇷 Vocabulaire', traducao:'🇧🇷 Português',
      categoria:'🗂️ Familles', audio:'✍️ Mots écrits'
    })[m];

    var fichas = baralhar(E.atual);
    var fichasEl = el('qiFichas');

    /* ---- lado esquerdo: o que se arrasta ---- */
    if (m === 'imagem'){
      fichasEl.className = 'qi-fichas grade';
      fichasEl.innerHTML = fichas.map(function(it){
        return '<div class="qi-ficha" draggable="true" data-id="'+it.id+'">'+
                 '<button type="button" class="qi-som" data-fala="'+escapar(it.f)+'">🔊</button>'+
                 it.icone +
                 '<div class="qi-pt">'+escapar(it.p)+'</div>'+
               '</div>';
      }).join('');

    } else if (m === 'traducao' || m === 'categoria'){
      fichasEl.className = 'qi-fichas coluna';
      fichasEl.innerHTML = fichas.map(function(it){
        var pa = partirArtigo(it.f);
        return '<div class="qi-ficha texto" draggable="true" data-id="'+it.id+'">'+
                 '<span class="qi-mini">'+escapar(pa.art)+'</span>'+escapar(pa.resto)+
                 '<button type="button" class="qi-som" data-fala="'+escapar(it.f)+'">🔊</button>'+
               '</div>';
      }).join('');

    } else { // audio
      fichasEl.className = 'qi-fichas grade';
      fichasEl.innerHTML = fichas.map(function(it, i){
        return '<div class="qi-ficha audio" draggable="true" data-id="'+it.id+'">'+
                 '<div class="qi-ondas">🔊</div>'+
                 '<div class="qi-pt">som '+(i+1)+'</div>'+
                 '<button type="button" class="qi-som grande" data-fala="'+escapar(it.f)+'">▶</button>'+
               '</div>';
      }).join('');
    }

    /* ---- lado direito: os alvos ---- */
    var alvosEl = el('qiAlvos');
    if (m === 'categoria'){
      // alvos = famílias presentes nesta rodada
      var fams = [];
      E.atual.forEach(function(it){ if (fams.indexOf(it.c)<0) fams.push(it.c); });

      // Se a rodada só tem uma família (acontece sempre ao filtrar por
      // categoria), o exercício não teria escolha. Acrescenta distratoras
      // até haver ao menos três opções.
      if (fams.length < 3){
        var outras = CATEGORIAS
          .filter(function(c){ return c.id!=='todas' && fams.indexOf(c.id)<0; })
          .map(function(c){ return c.id; });
        outras = baralhar(outras);
        while (fams.length < 3 && outras.length) fams.push(outras.pop());
      }

      alvosEl.innerHTML = baralhar(fams).map(function(f){
        var n = E.atual.filter(function(x){ return x.c===f; }).length;
        // O contador fica oculto até o primeiro acerto: exibir "0/3" ao lado de
        // uma família e nada ao lado de outra entregaria quais são as corretas.
        return '<div class="qi-alvo familia" data-cat="'+f+'" data-faltam="'+n+'">'+
                 '<div class="qi-fr">'+rotuloCat(f)+'</div>'+
                 '<div class="qi-contador oculto"><b>0</b>/'+n+'</div>'+
                 '<div class="qi-recebidos"></div>'+
               '</div>';
      }).join('');

    } else if (m === 'traducao'){
      alvosEl.innerHTML = baralhar(E.atual).map(function(it){
        return '<div class="qi-alvo" data-id="'+it.id+'">'+
                 '<div class="qi-encaixe"></div>'+
                 '<div class="qi-fr">'+escapar(it.p)+'</div>'+
               '</div>';
      }).join('');

    } else { // imagem e audio: alvo é a palavra francesa escrita
      alvosEl.innerHTML = baralhar(E.atual).map(function(it){
        var pa = partirArtigo(it.f);
        return '<div class="qi-alvo" data-id="'+it.id+'">'+
                 '<div class="qi-encaixe"></div>'+
                 '<div class="qi-fr"><span class="qi-art">'+escapar(pa.art)+'</span>'+escapar(pa.resto)+'</div>'+
                 '<button type="button" class="qi-mini-som" data-fala="'+escapar(it.f)+'">🔊</button>'+
               '</div>';
      }).join('');
    }

    ligarEventos();
  }

  /* =========================================================
     ARRASTAR E SOLTAR (mouse + toque)
     ========================================================= */
  function ligarEventos(){
    [].forEach.call(document.querySelectorAll('.qi-som,.qi-mini-som'), function(b){
      b.onclick = function(ev){ ev.stopPropagation(); falar(b.dataset.fala, b); };
      b.ondragstart = function(ev){ ev.preventDefault(); };
    });

    [].forEach.call(document.querySelectorAll('.qi-ficha'), function(f){
      f.ondragstart = function(ev){
        E.arrastado = f;
        f.classList.add('arrastando');
        ev.dataTransfer.effectAllowed = 'move';
        ev.dataTransfer.setData('text/plain', f.dataset.id);
      };
      f.ondragend = function(){ f.classList.remove('arrastando'); };

      var fantasma = null;
      f.addEventListener('touchstart', function(){
        E.arrastado = f;
        f.classList.add('arrastando');
        fantasma = f.cloneNode(true);
        fantasma.style.cssText = 'position:fixed;z-index:999;pointer-events:none;'+
          'opacity:.92;width:'+f.offsetWidth+'px;box-shadow:0 10px 28px rgba(0,0,0,.35)';
        document.body.appendChild(fantasma);
      }, { passive:true });

      f.addEventListener('touchmove', function(ev){
        if (!fantasma) return;
        var t = ev.touches[0];
        fantasma.style.left = (t.clientX - fantasma.offsetWidth/2) + 'px';
        fantasma.style.top  = (t.clientY - 40) + 'px';
        var sob = document.elementFromPoint(t.clientX, t.clientY);
        var alvo = sob && sob.closest ? sob.closest('.qi-alvo') : null;
        [].forEach.call(document.querySelectorAll('.qi-alvo'), function(a){
          a.classList.toggle('sobre', a === alvo);
        });
        ev.preventDefault();
      }, { passive:false });

      f.addEventListener('touchend', function(ev){
        if (fantasma){ fantasma.remove(); fantasma = null; }
        f.classList.remove('arrastando');
        var t = ev.changedTouches[0];
        var sob = document.elementFromPoint(t.clientX, t.clientY);
        var alvo = sob && sob.closest ? sob.closest('.qi-alvo') : null;
        [].forEach.call(document.querySelectorAll('.qi-alvo'), function(a){
          a.classList.remove('sobre');
        });
        if (alvo) soltar(alvo);
      });
    });

    [].forEach.call(document.querySelectorAll('.qi-alvo'), function(a){
      a.ondragover  = function(ev){ ev.preventDefault(); a.classList.add('sobre'); };
      a.ondragleave = function(){ a.classList.remove('sobre'); };
      a.ondrop      = function(ev){ ev.preventDefault(); a.classList.remove('sobre'); soltar(a); };
    });
  }

  function soltar(alvo){
    if (!E.arrastado) return;
    var ficha = E.arrastado;
    var it = porId(ficha.dataset.id);
    if (!it) return;

    var acertou;
    if (E.modoRodada === 'categoria'){
      if (alvo.dataset.cat === undefined) return;
      acertou = (alvo.dataset.cat === it.c);
    } else {
      if (alvo.classList.contains('certo')) return;
      acertou = (alvo.dataset.id === it.id);
    }

    if (acertou){
      if (E.modoRodada === 'categoria'){
        var box = alvo.querySelector('.qi-recebidos');
        var pa = partirArtigo(it.f);
        box.insertAdjacentHTML('beforeend',
          '<span class="qi-pilula">'+escapar(pa.art+pa.resto)+'</span>');
        var caixaCont = alvo.querySelector('.qi-contador');
        caixaCont.classList.remove('oculto');
        var cont = caixaCont.querySelector('b');
        cont.textContent = parseInt(cont.textContent,10) + 1;
        var faltam = parseInt(alvo.dataset.faltam,10) - 1;
        alvo.dataset.faltam = faltam;
        if (faltam === 0) alvo.classList.add('certo');
      } else {
        var enc = alvo.querySelector('.qi-encaixe');
        if (enc){
          if (E.modoRodada === 'traducao'){
            enc.innerHTML = it.icone;   // revela o desenho como reforço
          } else {
            var svg = ficha.querySelector('svg');
            enc.innerHTML = svg ? svg.outerHTML : it.icone;
          }
        }
        alvo.classList.add('certo');
      }
      ficha.classList.add('usada');
      E.acertos++; E.feitos++;
      falar(it.f);

    } else {
      alvo.classList.add('errado');
      setTimeout(function(){ alvo.classList.remove('errado'); }, 400);
      E.erros++;
      var reg = it.p + ' = ' + it.f;
      if (E.listaErros.indexOf(reg) < 0) E.listaErros.push(reg);
    }

    E.arrastado = null;
    atualizarStatus();

    if (document.querySelectorAll('.qi-ficha:not(.usada)').length === 0){
      setTimeout(fimDaRodada, 550);
    }
  }

  function atualizarStatus(){
    el('qiRodada').textContent  = E.rodada + '/' + E.totalRodadas;
    el('qiAcertos').textContent = E.acertos;
    el('qiErros').textContent   = E.erros;
    el('qiBarra').style.width   = Math.round((E.feitos / E.pool.length) * 100) + '%';
  }

  function fimDaRodada(){
    if (E.rodada < E.totalRodadas){
      el('qiBtnProxima').style.display = 'inline-block';
      mostrarResultado('Rodada ' + E.rodada + ' terminada !');
    } else {
      finalizar();
    }
  }

  function finalizar(){
    clearInterval(E.cron);
    el('qiBtnProxima').style.display = 'none';
    mostrarResultado('Bravo, c\'est terminé !');
  }

  function mostrarResultado(titulo){
    var tent = E.acertos + E.erros;
    var prec = tent ? Math.round((E.acertos / tent) * 100) : 0;
    var tempo = Math.floor((Date.now() - E.t0) / 1000);

    el('qiRTitulo').textContent = titulo;
    el('qiRNota').textContent = prec + '%';
    el('qiRDetalhe').innerHTML =
      '<b>'+E.acertos+'</b> acertos · <b>'+E.erros+'</b> erros · tempo: <b>'+mmss(tempo)+'</b><br>'+
      (prec >= 90 ? 'Excellent ! Vocabulário dominado.' :
       prec >= 70 ? 'Très bien. Revise os itens abaixo antes de seguir.' :
       'Pas mal. Ouça o áudio de cada termo e refaça a rodada.');

    if (E.listaErros.length){
      el('qiRErros').style.display = 'block';
      el('qiRErros').innerHTML = '<b>À réviser</b><ul>' +
        E.listaErros.map(function(x){ return '<li>'+escapar(x)+'</li>'; }).join('') + '</ul>';
    } else {
      el('qiRErros').style.display = 'none';
    }
    el('qiResultado').classList.add('ver');
    el('qiResultado').scrollIntoView({ behavior:'smooth', block:'nearest' });
  }

  /* =========================================================
     BOTÕES
     ========================================================= */
  el('qiBtnProxima').onclick   = proximaRodada;
  el('qiBtnReiniciar').onclick = iniciar;
  el('qiBtnSom').onclick = function(){
    E.audio = !E.audio;
    el('qiBtnSom').innerHTML = E.audio
      ? '<img class="titulo-icone-inline pequeno" src="img/icones/headphones.svg" alt="">Áudio: ligado'
      : '<img class="titulo-icone-inline pequeno" src="img/icones/no-entry.svg" alt="">Áudio: desligado';
    if (!E.audio && window.speechSynthesis) speechSynthesis.cancel();
  };
  el('qiTrocarCat').onclick = function(ev){
    ev.preventDefault();
    clearInterval(E.cron);
    el('qiWrap').style.display = 'none';
    el('qiCatWrap').style.display = '';
  };

  // O nível (A1/A2/.../DELF) só fica disponível depois que js/plataformaGate.js
  // resolve o acesso e js/cursoContexto.js resolve o curso — ambos assíncronos,
  // então espera o <body> sair de visibility:hidden (sinal de que o gate já
  // terminou, com sucesso ou não) antes de montar a tela de categorias filtrada.
  // Se o acesso foi negado, o gate substitui todo o body.innerHTML — o guard
  // abaixo evita tentar montar o jogo em cima de um DOM que não existe mais.
  function iniciarQuandoPronto(){
    if (!el('qiCatGrid')) return;
    aplicarFiltroNivel();
    montarCartoesCategoria();
  }
  if (document.body.style.visibility !== 'hidden') {
    iniciarQuandoPronto();
  } else {
    var obsGate = new MutationObserver(function(){
      if (document.body.style.visibility !== 'hidden') {
        obsGate.disconnect();
        iniciarQuandoPronto();
      }
    });
    obsGate.observe(document.body, { attributes:true, attributeFilter:['style'] });
  }
})();
