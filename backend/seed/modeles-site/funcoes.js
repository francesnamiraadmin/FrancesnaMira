//@@ iniciar
function iniciar() {
  // No site não há login por e-mail: quem abre é identificado pelo token (js/gasShim.js).
  EMAIL = window.FNM_EU || '__eu__';
  entrar();
}
//@@ entrar
function entrar() {
  google.script.run
    .withSuccessHandler(function (banco) {
      B = banco;
      B.audios = B.audios || {};
      B.ttsAtivo = true;   // áudios Coqui pré-gerados (audio/modeles), ver extensões
      prepararDestaques();
      carregarCarnet();
      $('barra-nav').hidden = false;
      $('nav-prof').hidden = !B.professor;
      $('nav-taches').hidden = !!B.professor;
      mostrarAvisosGlobais();
      mostrarAvisosCentrais();
      aplicarModulos();
      if (!B.professor) protegerTudo();
      atualizarSeloTarefas();
      iniciarPresenca();
      abrirDestino((location.hash || '').replace(/^#/, '') || window.FNM_ABRIR || '');
    })
    .withFailureHandler(function (e) {
      $('tela-accueil').innerHTML = '<div class="bloco"><h2>Ambiente de Produção indisponível</h2><p class="aviso">' + esc(e.message || e) + '</p></div>';
      mostrar('tela-accueil');
    })
    .obterBanco(EMAIL);
}
//@@ sair
function sair() { window.location.href = 'producao-hub.html'; }
//@@ irAccueil
function irAccueil() {
  if (!B) return;
  var CURSOS = { TCF: 'TCF Canada', DELF: 'DELF', DALF: 'DALF', TEF: 'TEF Canada', A1: 'Français A1', A2: 'Français A2', B1: 'Français B1', B2: 'Français B2' };
  var nomeCurso = CURSOS[B.courseType] || 'TCF Canada';
  var html = '<div class="acc-topo">' + (B.nome ? '<p class="ola">Bonjour, ' + esc(B.nome.split(' ')[0]) + '.</p>' : '') +
    '<h1 class="titulo-pagina">Ambiente de Produção · ' + esc(nomeCurso) + '</h1>' +
    '<p class="intro">Choisissez ce que vous voulez travailler. Les sujets sont classés par tâche et par axe thématique, avec modèles annotés, audio, dictée, épreuves chronométrées et correction par l\'IA ou par un professeur.</p></div>';
  html += htmlHubEscolhas();
  html += '<div id="acc-pendencias"></div>';
  html += '<h2 class="secao-titulo acc-secao">Accueil</h2>';
  html += '<div class="acc-duas"><div id="acc-devoirs"></div><div id="acc-msgs"></div></div>';
  html += htmlTirage(ORDEM_TACHES, 'acc-tirage');
  html += '<div id="acc-temas-mes"></div>';
  html += '<div id="acc-cursos"></div>';
  var tela = $('tela-accueil');
  tela.innerHTML = html;
  ligarHubEscolhas(tela);
  ligarTirage($('acc-tirage'), 'accueil');
  carregarTemasDoMes();
  carregarDevoirsAccueil();
  carregarMensagensAccueil();
  if (!B.professor) atualizarSeloTarefas(function (devs) {
    var n = devs.filter(function (d) { return !d.feito; }).length + (MENSAGENS || []).filter(function (m) { return !m.feito; }).length;
    if (!n || !$('acc-pendencias')) return;
    $('acc-pendencias').innerHTML = '<button class="faixa-pend" type="button" id="acc-pend">Vous avez <b>' + n + '</b> tâche' + (n > 1 ? 's' : '') + ' de votre professeur(e) à faire <span>Mon espace →</span></button>';
    $('acc-pend').addEventListener('click', abrirTarefas);
  });
  mostrar('tela-accueil');
  try { history.replaceState(null, '', '#'); } catch (e) {}
}
//@@ abasEspace
function abasEspace(ativa) {
  var abas = [['taches', 'Mes tâches', 'abrirTarefas'], ['notes', 'Mes notes', 'abrirNotes'], ['cahier', 'Cahier d\'erreurs', 'abrirCarnet']];
  return '<div class="abas-espace" role="tablist">' + abas.map(function (a) {
    return '<button class="aba-esp' + (a[0] === ativa ? ' on' : '') + '" type="button" role="tab" aria-selected="' + (a[0] === ativa) + '" data-esp="' + a[2] + '">' + a[1] + '</button>';
  }).join('') + '<a class="aba-esp link" href="correcoes.html">Mes corrections ↗</a></div>';
}
//@@ abrirJournal
function abrirJournal() { abrirTarefas(); }
//@@ abrirForfait
function abrirForfait() { abrirTarefas(); }
//@@ abrirSimulados
function abrirSimulados() {
  if (!B) return;
  var partes = [PARTE_ACCUEIL(), { rotulo: 'Simulados' }];
  var tela = $('tela-hub');
  tela.innerHTML = trilha(partes) + '<h1 class="titulo-pagina">Simulados</h1>' +
    '<p class="intro">Passez les épreuves dans les conditions de l\'examen. L\'épreuve écrite de 60 minutes présente les trois tâches en même temps, avec le chronomètre en haut de l\'écran.</p>' +
    '<div class="hub-acoes"><button class="hub-acao" type="button" id="sm-ep"><span></span><b>Épreuve écrite et enregistrements</b><small>Écrit (60 min, 3 tâches simultanées) et tâches orales, dont les épreuves proposées par votre professeur(e).</small></button>' +
    '<button class="hub-acao" type="button" id="sm-chrono"><span></span><b>Chronomètre de l\'oral</b><small>Tâches 1, 2 et 3 avec le temps de préparation et de parole de l\'examen.</small></button>' +
    '<a class="hub-acao" href="simulado-tcf.html"><span></span><b>Simulation complète de l\'examen</b><small>Compréhension orale et écrite, expression écrite et orale, avec correction et suivi en direct.</small></a></div>';
  ligarTrilha(tela, partes);
  mostrar('tela-hub');
  $('sm-ep').addEventListener('click', abrirEpreuve);
  $('sm-chrono').addEventListener('click', function () { abrirChrono(); });
}
//@@ abrirGravacao
function abrirGravacao(sessao, tarefa) {
  pararGravacaoTudo();
  var t = tarefa.tache, info = TACHES[t], limite = { T1: 120, T2: 210, T3: 270 }[t], prep = PREP_ORAL[t];
  var partes = [PARTE_ACCUEIL(), { rotulo: 'Épreuves', fn: abrirEpreuve }, { rotulo: 'Oral · ' + info.nom }];
  var html = trilha(partes) + '<h1 class="titulo-pagina">Expression orale · ' + info.nom + '</h1>' +
    '<p class="intro">' + info.sous + ' · ' + (prep ? '2 minutes de préparation, puis ' : '') + formatarTempo(limite) + ' d\'enregistrement. ' +
    'L\'enregistrement s\'arrête tout seul à la fin du temps. Votre parole est transcrite pendant l\'enregistrement : relisez et corrigez la transcription avant d\'envoyer.</p>' +
    htmlMetodo(t, false) +
    '<div class="gravador" id="gravador"><div class="grav-consigne" id="grav-consigne" hidden><h3>' + (t === 'T2' ? 'Consigne' : 'Sujet') + '</h3><p>' + esc(tarefa.sujet.t) + '</p></div>' +
    '<div class="grav-painel"><div class="grav-relogio"><span class="tempo" id="grav-tempo">' + formatarTempo(prep || limite) + '</span><span id="grav-fase">Prêt(e) ?</span></div>' +
    '<canvas class="grav-onda" id="grav-onda" width="640" height="90" aria-hidden="true"></canvas>' +
    '<div class="grav-botoes"><button class="grav-bt principal" type="button" id="grav-comecar">' + (prep ? '▶ Découvrir le sujet et préparer' : '● Découvrir le sujet et enregistrer') + '</button>' +
    '<button class="grav-bt" type="button" id="grav-pular" hidden>Passer la préparation →</button>' +
    '<button class="grav-bt parar" type="button" id="grav-parar" hidden>■ Terminer</button></div>' +
    '<div class="grav-transcricao" id="grav-trans-viva" hidden><small>Transcription en direct</small><p id="grav-trans-txt"></p></div>' +
    '<div id="grav-revisao" hidden><audio id="grav-audio" controls></audio>' +
    '<label class="grav-trans-edit">Transcription (corrigez ce que la reconnaissance vocale a mal compris, sans améliorer votre français)<textarea id="grav-trans" rows="6"></textarea></label>' +
    '<div class="grav-botoes"><button class="grav-bt" type="button" id="grav-refazer">↺ Recommencer</button><button class="grav-bt principal" type="button" id="grav-enviar">Envoyer à mon professeur</button></div></div>' +
    '<p class="aviso" id="grav-msg"></p></div></div>' +
    '<nav class="rodape-nav"><button class="ferramenta" type="button" data-ir="voltar">← Retour aux épreuves</button><button class="ferramenta" type="button" data-ir="accueil">Accueil</button></nav>';
  var tela = $('tela-epreuve');
  tela.innerHTML = html;
  mostrar('tela-epreuve');
  ligarTrilha(tela, partes);
  tela.querySelector('[data-ir="voltar"]').addEventListener('click', function () { pararGravacaoTudo(); abrirEpreuve(); });
  tela.querySelector('[data-ir="accueil"]').addEventListener('click', function () { pararGravacaoTudo(); irAccueil(); });

  var blob = null, duracao = 0, trans = null;
  var msg = function (t2) { $('grav-msg').textContent = t2 || ''; };
  var relogio = function (seg, fase) { $('grav-tempo').textContent = formatarTempo(seg); $('grav-fase').textContent = fase; };
  var desenharOnda = function (analisador) {
    var cv = $('grav-onda'); if (!cv) return;
    var g = cv.getContext('2d'), dados = new Uint8Array(analisador.frequencyBinCount);
    var passo = function () {
      if (!GRAV) return;
      analisador.getByteFrequencyData(dados);
      g.clearRect(0, 0, cv.width, cv.height);
      var n = 48, larg = cv.width / n;
      for (var i = 0; i < n; i++) {
        var v = dados[Math.floor(i * dados.length / n / 2)] / 255, h = Math.max(4, v * cv.height);
        g.fillStyle = i % 2 ? '#E4C043' : '#7FB0DC';
        g.fillRect(i * larg + 2, (cv.height - h) / 2, larg - 4, h);
      }
      GRAV.anim = requestAnimationFrame(passo);
    };
    passo();
  };
  var gravar = function () {
    $('grav-pular').hidden = true;
    if (!GRAV || !GRAV.stream) return;
    var tipos = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
    var tipo = tipos.filter(function (x) { return window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(x); })[0];
    GRAV.chunks = [];
    GRAV.rec = tipo ? new MediaRecorder(GRAV.stream, { mimeType: tipo, audioBitsPerSecond: 48000 }) : new MediaRecorder(GRAV.stream);
    GRAV.rec.ondataavailable = function (e) { if (e.data && e.data.size) GRAV.chunks.push(e.data); };
    GRAV.rec.onstop = function () {
      if (!GRAV) return;
      blob = new Blob(GRAV.chunks, { type: GRAV.rec.mimeType || 'audio/webm' });
      $('grav-audio').src = URL.createObjectURL(blob);
      var texto = trans ? trans.parar() : '';
      $('grav-trans').value = texto;
      $('grav-trans-viva').hidden = true;
      $('grav-revisao').hidden = false; $('grav-parar').hidden = true;
      relogio(duracao, 'Enregistrement terminé · ' + formatarTempo(duracao));
      if (GRAV.timer) clearInterval(GRAV.timer);
      GRAV.stream.getTracks().forEach(function (tr) { tr.stop(); });
      if (GRAV.anim) cancelAnimationFrame(GRAV.anim);
    };
    GRAV.rec.start(1000);
    trans = Transcricao.iniciar(function (txt) { $('grav-trans-viva').hidden = false; $('grav-trans-txt').textContent = txt; });
    if (!trans) msg('Votre navigateur ne transcrit pas la parole : l\'audio est envoyé quand même et votre professeur(e) l\'écoutera. Pour la transcription, utilisez Chrome ou Edge.');
    duracao = 0;
    $('grav-parar').hidden = false;
    $('gravador').classList.add('gravando');
    relogio(limite, '● Enregistrement en cours');
    GRAV.timer = setInterval(function () {
      duracao++;
      relogio(limite - duracao, '● Enregistrement en cours');
      if (duracao >= limite) { bip(); GRAV.rec.stop(); $('gravador').classList.remove('gravando'); }
    }, 1000);
  };
  var comecar = function () {
    if (!navigator.mediaDevices || !window.MediaRecorder) { msg('Votre navigateur ne permet pas d\'enregistrer. Utilisez Chrome, Edge ou Firefox récent.'); return; }
    $('grav-comecar').disabled = true;
    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }).then(function (stream) {
      GRAV = { stream: stream };
      try {
        var C = window.AudioContext || window.webkitAudioContext;
        GRAV.ctx = new C();
        var an = GRAV.ctx.createAnalyser(); an.fftSize = 256;
        GRAV.ctx.createMediaStreamSource(stream).connect(an);
        desenharOnda(an);
      } catch (e) {}
      $('grav-comecar').hidden = true;
      $('grav-consigne').hidden = false;
      $('grav-revisao').hidden = true;
      blob = null;
      if (prep) {
        var resta = prep;
        $('grav-pular').hidden = false;
        relogio(resta, 'Préparation');
        GRAV.timer = setInterval(function () {
          resta--; relogio(resta, 'Préparation');
          if (resta <= 0) { clearInterval(GRAV.timer); bip(); gravar(); }
        }, 1000);
      } else gravar();
    }).catch(function () {
      $('grav-comecar').disabled = false;
      msg('Autorisez l\'accès au micro (icône du cadenas dans la barre d\'adresse), puis réessayez.');
    });
  };
  $('grav-comecar').addEventListener('click', comecar);
  $('grav-pular').addEventListener('click', function () { if (GRAV && GRAV.timer) clearInterval(GRAV.timer); gravar(); });
  $('grav-parar').addEventListener('click', function () {
    if (duracao < 10 && !confirm('Votre enregistrement dure moins de 10 secondes. Terminer quand même ?')) return;
    if (GRAV && GRAV.rec && GRAV.rec.state !== 'inactive') GRAV.rec.stop();
    $('gravador').classList.remove('gravando');
  });
  $('grav-refazer').addEventListener('click', function () {
    if (!confirm('Effacer cet enregistrement et recommencer ?')) return;
    pararGravacaoTudo();
    $('grav-comecar').hidden = false; $('grav-comecar').disabled = false; $('grav-comecar').textContent = '● Enregistrer à nouveau';
    prep = 0;
    $('grav-revisao').hidden = true;
    relogio(limite, 'Prêt(e) ?');
  });
  $('grav-enviar').addEventListener('click', function () {
    if (!blob) return;
    var bt = $('grav-enviar');
    bt.disabled = true; bt.textContent = 'Envoi en cours…';
    enviarGravacao({ blob: blob, tache: t, sujet: tarefa.sujet.id, sessao: sessao.id, duree: duracao, transcricao: $('grav-trans').value, modo: 'professor' }).then(function () {
      pararGravacaoTudo();
      $('gravador').innerHTML = '<div class="bloco ep-ok"><h3>✓ Enregistrement envoyé</h3><p class="aviso">Votre professeur(e) va l\'écouter et le corriger dans le Sistema de Correção. La note apparaîtra dans « Mes notes » et dans « Mes corrections ».</p>' +
        '<div class="ferramentas"><button class="ferramenta destaque" type="button" id="grav-volta">← Mes épreuves</button></div></div>';
      $('grav-volta').addEventListener('click', abrirEpreuve);
    }).catch(function (e) {
      bt.disabled = false; bt.textContent = 'Envoyer à mon professeur';
      msg('' + (e.message || e) + '. Votre enregistrement est toujours là, réessayez.');
    });
  });
}
//@@ htmlGravadorLivre
function htmlGravadorLivre(tache) {
  var lim = { T1: 120, T2: 210, T3: 270 }[tache];
  return '<div class="bloco gravador-livre" id="grav-livre"><h3>M\'entraîner à l\'oral</h3>' +
    '<p class="aviso" style="margin-top:0">Enregistrez-vous (' + formatarTempo(lim) + ' max.), réécoutez-vous et comparez avec le modèle. Votre parole est transcrite : vous pouvez corriger la transcription et faire corriger l\'essai par l\'IA (entraînement) ou l\'envoyer à un professeur (Sistema de Correção).</p>' +
    '<div class="gl-linha"><button class="ferramenta destaque" type="button" data-gl="gravar">● Enregistrer</button><button class="ferramenta" type="button" data-gl="parar" hidden>■ Arrêter</button>' +
    '<span class="gl-tempo" data-gl="tempo">0:00 / ' + formatarTempo(lim) + '</span></div><p class="gl-viva" data-gl="viva" hidden></p><div data-gl="lista"></div></div>';
}
//@@ ligarGravadorLivre
function ligarGravadorLivre(raiz, tache, m) {
  var caixa = raiz.querySelector('.gravador-livre'); if (!caixa) return;
  var lim = { T1: 120, T2: 210, T3: 270 }[tache];
  var q = function (k) { return caixa.querySelector('[data-gl="' + k + '"]'); };
  var rec = null, stream = null, timer = null, seg = 0, n = 0, trans = null;
  var parar = function () { if (rec && rec.state !== 'inactive') rec.stop(); };
  q('gravar').addEventListener('click', function () {
    if (!navigator.mediaDevices || !window.MediaRecorder) { avisar({ titulo: 'Enregistrement impossible', texto: 'Utilisez Chrome, Edge ou Firefox récent.', icone: '', som: false }); return; }
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (st) {
      stream = st; var partes = [];
      rec = new MediaRecorder(st);
      rec.ondataavailable = function (e) { if (e.data && e.data.size) partes.push(e.data); };
      rec.onstop = function () {
        clearInterval(timer); stream.getTracks().forEach(function (t) { t.stop(); });
        var blob = new Blob(partes, { type: rec.mimeType || 'audio/webm' }), url = URL.createObjectURL(blob);
        var texto = trans ? trans.parar() : '', dur = seg;
        n++;
        q('viva').hidden = true;
        var item = document.createElement('div');
        item.className = 'gl-item';
        item.innerHTML = '<div class="gl-cab"><span>Essai ' + n + ' · ' + formatarTempo(dur) + '</span><audio controls src="' + url + '"></audio></div>' +
          '<label class="grav-trans-edit">Transcription<textarea rows="4">' + esc(texto) + '</textarea></label>' +
          '<div class="gl-acoes">' + (B.ia && B.ia.ativa ? '<button class="ferramenta destaque" type="button" data-gl-ia>Corriger avec l\'IA (entraînement)</button>' : '') +
          '<button class="ferramenta" type="button" data-gl-prof>Envoyer à un professeur <small>(1 crédit)</small></button><span class="aviso" data-gl-st></span></div><div class="ia-resultado" data-gl-res></div>';
        q('lista').insertBefore(item, q('lista').firstChild);
        var ta = item.querySelector('textarea'), st2 = item.querySelector('[data-gl-st]');
        var bIA = item.querySelector('[data-gl-ia]');
        if (bIA) bIA.addEventListener('click', function () { pedirCorrecaoIA(tache, m.id, ta.value, item.querySelector('[data-gl-res]'), bIA); });
        item.querySelector('[data-gl-prof]').addEventListener('click', function () {
          var b = this;
          if (!confirm('Envoyer cet enregistrement à un professeur ? 1 crédit de correction sera utilisé.')) return;
          b.disabled = true; st2.textContent = 'Envoi…';
          enviarGravacao({ blob: blob, tache: tache, sujet: m.id, duree: dur, transcricao: ta.value, modo: 'professor' }).then(function (r) {
            st2.textContent = '✓ Envoyé (protocole ' + r.protocolo + '). Suivez la correction dans « Mes corrections ».';
            B.creditos = r.creditos;
          }).catch(function (e) { b.disabled = false; st2.textContent = e.message || e; });
        });
        q('gravar').hidden = false; q('parar').hidden = true; caixa.classList.remove('gravando-livre');
      };
      rec.start(1000); seg = 0;
      trans = Transcricao.iniciar(function (txt) { q('viva').hidden = false; q('viva').textContent = txt; });
      q('gravar').hidden = true; q('parar').hidden = false; caixa.classList.add('gravando-livre');
      timer = setInterval(function () { seg++; q('tempo').textContent = formatarTempo(seg) + ' / ' + formatarTempo(lim); if (seg >= lim) { bip(); parar(); } }, 1000);
    }).catch(function () { avisar({ titulo: 'Micro non autorisé', texto: 'Autorisez l\'accès au micro puis réessayez.', icone: '', som: false }); });
  });
  q('parar').addEventListener('click', parar);
}
//@@ carregarDestaques
function carregarDestaques() {
  var alvo = $('acc-temas-mes'); if (!alvo) return;
  alvo.innerHTML = '<section class="alu alu2"><p class="aviso">Chargement…</p></section>';
  google.script.run.withSuccessHandler(function (r) {
    if (!$('acc-temas-mes')) return;
    var posts = (r && r.posts) || [], sujets = (r && r.sujets) || [];
    if (!posts.length && !sujets.length) { alvo.innerHTML = ''; return; }
    var mes = new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    var html = '<section class="alu alu2"><header class="alu-cab"><div><span class="tm-selo">À la une</span><h2>' + esc(mes.charAt(0).toUpperCase() + mes.slice(1)) + '</h2></div>' +
      '<p>Les sujets à travailler en priorité ce mois-ci : un par tâche, choisis par votre professeure ou parmi ceux qui tombent le plus.</p></header>';
    if (posts.length) {
      var p0 = posts[0];
      html += '<article class="alu-post alu-destaque" ' + (p0.tache && p0.id ? 'data-bl-t="' + p0.tache + '" data-bl-id="' + esc(p0.id) + '" tabindex="0" role="button"' : '') + '>' +
        '<div class="alu-post-img">' + imagemBlog(p0) + '</div><div class="alu-post-txt"><span class="alu-rot">Le mot de votre professeure</span><h3>' + esc(p0.titre) + '</h3>' +
        (p0.texto ? '<p>' + esc(String(p0.texto).slice(0, 320)) + '</p>' : '') + (p0.tache && p0.id ? '<b class="alu-link">Lire le modèle →</b>' : '') + '</div></article>';
      if (posts.length > 1) html += '<div class="alu-mini">' + posts.slice(1, 4).map(function (p) {
        return '<article ' + (p.tache && p.id ? 'data-bl-t="' + p.tache + '" data-bl-id="' + esc(p.id) + '" tabindex="0" role="button"' : '') + '><div class="alu-mini-img">' + imagemBlog(p) + '</div><div><b>' + esc(p.titre) + '</b>' + (p.texto ? '<small>' + esc(String(p.texto).slice(0, 110)) + '</small>' : '') + '</div></article>';
      }).join('') + '</div>';
    }
    var linha = function (rotulo, taches, classe) {
      var itens = taches.map(function (t) { return sujets.filter(function (x) { return x.tache === t; })[0] || { tache: t, vazio: 1 }; });
      return '<div class="alu-linha ' + classe + '"><h4><i></i>' + rotulo + '</h4><div class="alu-grade">' + itens.map(function (x) {
        var info = TACHES[x.tache];
        if (x.vazio) return '<div class="alu-card vazio"><span class="alu-tache">' + info.nom + ' · ' + info.sous + '</span><p>Aucun sujet ouvert pour cette tâche.</p></div>';
        var e = eixo(x.e), titulo = x.titre && x.tache !== 'T2' ? x.titre : tituloCurto(x.texto || x.titre);
        return '<article class="alu-card" style="--cor:' + (e.cor || '#E4C043') + '" data-bl-t="' + x.tache + '" data-bl-id="' + esc(x.id) + '" tabindex="0" role="button">' +
          '<div class="alu-card-topo"><span class="alu-num">' + info.nom.slice(-1) + '</span><span class="alu-tache">' + info.sous + '</span><span class="alu-ico">' + (e.icone || '') + '</span></div>' +
          '<h5>' + esc(titulo) + '</h5>' +
          '<div class="alu-meta">' + (x.mes ? '<em class="alu-chip mes">Thème du mois</em>' : x.tr ? '<em class="alu-chip tr">Tendance</em>' : '') +
          '<span>' + esc(e.nome || '') + (x.f > 1 ? ' · tombé ' + x.f + '×' : '') + '</span></div><b class="alu-link">Lire le modèle →</b></article>';
      }).join('') + '</div></div>';
    };
    html += '<div class="alu-sujets">' + linha('Expression orale', ['T1', 'T2', 'T3'], 'oral') + linha('Expression écrite', ['ET1', 'ET2', 'ET3'], 'ecrit') + '</div></section>';
    alvo.innerHTML = html;
    alvo.querySelectorAll('[data-bl-id]').forEach(function (c) {
      var abrir = function () { abrirModelo(c.dataset.blT, c.dataset.blId, { tipo: 'liste' }); };
      c.addEventListener('click', abrir);
      c.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); abrir(); } });
    });
  }).withFailureHandler(function () { alvo.innerHTML = ''; }).obterDestaques(EMAIL);
}
