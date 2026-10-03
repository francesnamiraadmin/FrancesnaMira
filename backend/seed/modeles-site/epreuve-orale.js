// ================= épreuve orale (« Mes épreuves orales ») =================
// As tâches orais do perfil (TCF: 3; DELF: as partes do nível) em sequência, nas condições do exame:
// o sujet aparece no começo de cada tâche, preparação (quando a prova tem) e fala com tempo-limite,
// gravação + transcrição ao vivo. No fim, o aluno envia tudo ao professor (Sistema de Correção,
// 1 crédito por tâche) ou recebe a correção da IA de cada tâche.
var EO = null;   // { sujets: {t: sujet}, ordem: [t], i, correcao, grav: {t: {blob, duree, transcricao}}, stream }

function fasesOral(t) {
  var f = TEMPOS_EXAME[t] || [{ nome: 'Prise de parole', seg: 120 }];
  var prep = f.filter(function (x) { return /^Préparation/.test(x.nome); }).reduce(function (s, x) { return s + x.seg; }, 0);
  var fala = f.filter(function (x) { return !/^Préparation/.test(x.nome); }).reduce(function (s, x) { return s + x.seg; }, 0);
  return { prep: prep, fala: fala || 120 };
}
function pararEpreuveOral() {
  if (!EO) return;
  if (EO.timer) clearInterval(EO.timer);
  if (EO.rec && EO.rec.state !== 'inactive') { EO.rec.onstop = null; EO.rec.stop(); }
  if (EO.trans) EO.trans.parar();
  if (EO.stream) EO.stream.getTracks().forEach(function (tr) { tr.stop(); });
  EO.stream = null;
}
function linkCorrecao(id) { return 'minha-correcao.html?producao=' + encodeURIComponent(id); }

// Sorteio: um sujet por tâche oral, eixos diferentes, entre os liberados para o aluno.
function tirarEpreuveOral(pools) {
  var p = {}, usados = [];
  TS().forEach(function (t) {
    var l = (pools[t] || []).filter(function (x) { return usados.indexOf(x.e) < 0; });
    if (!l.length) l = pools[t] || [];
    if (!l.length) return;
    p[t] = sorteioPonderado(l, { evitarEixos: usados, memoria: 6 }) || l[Math.floor(Math.random() * l.length)];
    usados.push(p[t].e);
  });
  return p;
}

function abrirEpreuveOral() {
  if (!B) return;
  pararEpreuveOral();
  mostrar('tela-epreuve');
  var tela = $('tela-epreuve');
  tela.innerHTML = '<p class="vazio">Chargement…</p>';
  var pools = {}, faltam = TS().length, st = null;
  var pronto = function () { if (--faltam <= 0 && st) telaEscolhaOral(st, pools); };
  google.script.run.withSuccessHandler(function (r) { st = r; if (faltam <= 0) telaEscolhaOral(st, pools); })
    .withFailureHandler(function (e) { tela.innerHTML = '<p class="vazio erro">' + esc(e.message || e) + '</p>'; }).obterEstadoEpreuve(EMAIL);
  TS().forEach(function (t) {
    google.script.run.withSuccessHandler(function (l) { pools[t] = (l || []).filter(function (x) { return permitido(t, x.e, x.id); }); pronto(); })
      .withFailureHandler(function () { pools[t] = []; pronto(); }).obterListaTache(EMAIL, t);
  });
}

function telaEscolhaOral(st, pools) {
  var partes = [PARTE_ACCUEIL(), { rotulo: 'Production orale', fn: function () { abrirHub('oral'); } }, { rotulo: 'Épreuve orale' }];
  var sorteio = tirarEpreuveOral(pools);
  var ts = TS(), ia = !!(B.ia && B.ia.ativa), cred = st.creditos != null ? st.creditos : B.creditos || 0;
  var html = trilha(partes) + '<h1 class="titulo-pagina">Épreuve d\'expression orale</h1>' +
    '<p class="intro">Les tâches de l\'oral, l\'une après l\'autre, comme le jour de l\'examen. Le sujet apparaît au début de chaque tâche ; votre parole est enregistrée et transcrite.</p>';
  var sess = (st.sessoes || []).filter(function (x) { return (x.orais || []).length; });
  if (sess.length) {
    html += '<h2 class="secao-titulo">Épreuves proposées par votre professeur(e)</h2><div class="lista-sessoes">' + sess.map(function (x) {
      return '<div class="bloco sessao"><div class="sessao-cab"><b>' + esc(x.nome) + '</b></div>' + x.orais.map(function (o) {
        return '<div class="sessao-tarefa"><span>' + esc(TACHES[o.tache] ? TACHES[o.tache].nom + ' · ' + TACHES[o.tache].sous : o.tache) + '</span>' +
          (o.feita ? '<em>✓ Envoyée</em>' : '<button class="botao-principal" type="button" data-eo-sessao="' + esc(x.id) + '|' + o.tache + '">S\'enregistrer</button>') + '</div>';
      }).join('') + '</div>';
    }).join('') + '</div>';
  }
  html += '<h2 class="secao-titulo">Entraînement : épreuve orale complète</h2><div class="bloco">' +
    '<div class="eo-taches">' + ts.map(function (t, i) {
      var f = fasesOral(t), s = sorteio[t];
      return '<div class="eo-tache"><span class="selo">' + (i + 1) + '</span><div><b>' + esc(TACHES[t].nom + ' · ' + TACHES[t].sous) + '</b>' +
        '<small>' + (f.prep ? formatarTempo(f.prep) + ' de préparation · ' : '') + formatarTempo(f.fala) + ' de parole' + (s ? ' · ' + esc(eixo(s.e).icone + ' ' + eixo(s.e).nome) : '') + '</small></div></div>';
    }).join('') + '</div>' +
    '<p class="aviso">Les sujets sont tirés au sort parmi ceux qui sont ouverts pour vous, sur des axes différents, et découverts au début de chaque tâche.</p>' +
    '<fieldset class="escolha-correcao"><legend>Qui corrige ?</legend>' +
      '<label' + (ia ? '' : ' class="indisponivel"') + '><input type="radio" name="eo-correcao" value="ia"' + (ia ? ' checked' : ' disabled') + '><span><b>L\'IA, dès la fin</b><small>' +
        (ia ? 'Note, critères, corrections et version améliorée pour chaque tâche, à partir de l\'enregistrement et de la transcription. Sans crédit.' : 'Indisponible pour le moment.') + '</small></span></label>' +
      '<label><input type="radio" name="eo-correcao" value="professor"' + (ia ? '' : ' checked') + '><span><b>Par un professeur</b><small>Les enregistrements et les transcriptions partent dans le Sistema de Correção (1 crédit par tâche).</small></span></label></fieldset>' +
    '<div class="ferramentas"><button class="botao-principal" type="button" id="eo-comecar" style="width:auto;padding:13px 30px"' + (Object.keys(sorteio).length ? '' : ' disabled') + '>Commencer l\'épreuve orale</button>' +
    '<button class="botao-sorteio" type="button" id="eo-retirar">Tirer d\'autres sujets</button></div>' +
    (Object.keys(sorteio).length ? '' : '<p class="aviso">Aucun sujet ouvert pour vous à l\'oral pour le moment.</p>') +
    '<p class="aviso">Crédits de correction : <b>' + cred + '</b></p></div>' +
    '<nav class="rodape-nav"><button class="ferramenta" type="button" data-ir="accueil">Accueil</button></nav>';
  var tela = $('tela-epreuve');
  tela.innerHTML = html;
  ligarTrilha(tela, partes);
  tela.querySelector('[data-ir="accueil"]').addEventListener('click', irAccueil);
  $('eo-retirar').addEventListener('click', function () { telaEscolhaOral(st, pools); });
  tela.querySelectorAll('[data-eo-sessao]').forEach(function (b) {
    b.addEventListener('click', function () {
      var p2 = b.dataset.eoSessao.split('|'), s = sess.filter(function (x) { return x.id === p2[0]; })[0];
      abrirGravacao(s, s.orais.filter(function (o) { return o.tache === p2[1]; })[0]);
    });
  });
  $('eo-comecar').addEventListener('click', function () {
    var r = document.querySelector('input[name="eo-correcao"]:checked');
    var ordem = ts.filter(function (t) { return sorteio[t]; });
    if (!navigator.mediaDevices || !window.MediaRecorder) { avisar({ titulo: 'Enregistrement impossible', texto: 'Utilisez Chrome, Edge ou Firefox récent.', icone: '', som: false }); return; }
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      EO = { sujets: sorteio, ordem: ordem, i: 0, correcao: r ? r.value : 'professor', grav: {}, stream: stream, creditos: cred };
      registrarEixos(ordem.map(function (t) { return sorteio[t].e; }));
      tarefaOral();
    }).catch(function () { avisar({ titulo: 'Micro non autorisé', texto: 'Autorisez l\'accès au micro puis réessayez.', icone: '', som: false }); });
  });
}

// Uma tâche: sujet → (préparation) → fala gravada → revisão da transcrição.
function tarefaOral() {
  var t = EO.ordem[EO.i], sj = EO.sujets[t], info = TACHES[t], f = fasesOral(t);
  var ultima = EO.i === EO.ordem.length - 1;
  var html = '<div class="eo-barra"><span>Tâche ' + (EO.i + 1) + ' / ' + EO.ordem.length + '</span><b>' + esc(info.nom + ' · ' + info.sous) + '</b></div>' +
    '<h1 class="titulo-pagina">Épreuve d\'expression orale</h1>' +
    '<div class="gravador" id="eo-grav"><div class="grav-consigne"><h3>' + (t === 'T2' ? 'Consigne' : 'Sujet') + '</h3><p>' + esc(sj.t) + '</p></div>' +
    '<div class="grav-painel"><div class="grav-relogio"><span class="tempo" id="eo-tempo">' + formatarTempo(f.prep || f.fala) + '</span><span id="eo-fase">' + (f.prep ? 'Préparation' : 'Prêt(e) ?') + '</span></div>' +
    '<div class="grav-botoes"><button class="grav-bt principal" type="button" id="eo-acao">' + (f.prep ? 'Passer la préparation et parler' : '● Commencer à parler') + '</button>' +
    '<button class="grav-bt parar" type="button" id="eo-parar" hidden>■ Terminer cette tâche</button></div>' +
    '<div class="grav-transcricao" id="eo-viva" hidden><small>Transcription en direct</small><p id="eo-viva-txt"></p></div>' +
    '<div id="eo-revisao" hidden><audio id="eo-audio" controls></audio>' +
    '<label class="grav-trans-edit">Transcription (corrigez ce que la reconnaissance vocale a mal compris, sans améliorer votre français)<textarea id="eo-trans" rows="5"></textarea></label>' +
    '<div class="grav-botoes"><button class="grav-bt" type="button" id="eo-refazer">↺ Recommencer cette tâche</button>' +
    '<button class="grav-bt principal" type="button" id="eo-proxima">' + (ultima ? 'Terminer l\'épreuve →' : 'Tâche suivante →') + '</button></div></div>' +
    '<p class="aviso" id="eo-msg"></p></div></div>' +
    '<nav class="rodape-nav"><button class="ferramenta" type="button" id="eo-sair">Abandonner l\'épreuve</button></nav>';
  var tela = $('tela-epreuve');
  tela.innerHTML = html;
  window.scrollTo(0, 0);
  var relogio = function (seg, fase) { $('eo-tempo').textContent = formatarTempo(Math.max(0, seg)); $('eo-fase').textContent = fase; };
  var falar = function () {
    if (EO.timer) clearInterval(EO.timer);
    var tipos = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
    var tipo = tipos.filter(function (x) { return MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(x); })[0];
    var partes = [], dur = 0;
    EO.rec = tipo ? new MediaRecorder(EO.stream, { mimeType: tipo }) : new MediaRecorder(EO.stream);
    EO.rec.ondataavailable = function (e) { if (e.data && e.data.size) partes.push(e.data); };
    EO.rec.onstop = function () {
      clearInterval(EO.timer);
      var blob = new Blob(partes, { type: EO.rec.mimeType || 'audio/webm' });
      var texto = EO.trans ? EO.trans.parar() : '';
      EO.trans = null;
      EO.grav[t] = { blob: blob, duree: dur, transcricao: texto };
      $('eo-audio').src = URL.createObjectURL(blob);
      $('eo-trans').value = texto;
      $('eo-viva').hidden = true; $('eo-parar').hidden = true; $('eo-revisao').hidden = false;
      $('eo-grav').classList.remove('gravando');
      relogio(dur, 'Enregistrement terminé · ' + formatarTempo(dur));
    };
    EO.rec.start(1000);
    EO.trans = Transcricao.iniciar(function (txt) { var v = $('eo-viva'), x = $('eo-viva-txt'); if (!v || !x) return; v.hidden = false; x.textContent = txt; });
    if (!EO.trans) $('eo-msg').textContent = 'Votre navigateur ne transcrit pas la parole : l\'audio est envoyé quand même. Pour la transcription, utilisez Chrome ou Edge.';
    $('eo-acao').hidden = true; $('eo-parar').hidden = false;
    $('eo-grav').classList.add('gravando');
    relogio(f.fala, '● Enregistrement en cours');
    EO.timer = setInterval(function () {
      dur++;
      relogio(f.fala - dur, '● Enregistrement en cours');
      if (dur >= f.fala) { bip(); EO.rec.stop(); }
    }, 1000);
  };
  if (f.prep) {
    var resta = f.prep;
    EO.timer = setInterval(function () {
      resta--;
      relogio(resta, 'Préparation');
      if (resta <= 0) { bip(); falar(); }
    }, 1000);
  }
  $('eo-acao').addEventListener('click', falar);
  $('eo-parar').addEventListener('click', function () { if (EO.rec && EO.rec.state !== 'inactive') EO.rec.stop(); });
  $('eo-refazer').addEventListener('click', function () { delete EO.grav[t]; tarefaOral(); });
  $('eo-proxima').addEventListener('click', function () {
    EO.grav[t].transcricao = $('eo-trans').value;
    if (ultima) { pararEpreuveOral(); resultadoOral(); } else { EO.i++; tarefaOral(); }
  });
  $('eo-sair').addEventListener('click', function () {
    confirmarEnvio({ titulo: 'Abandonner l\'épreuve ?', texto: 'Les enregistrements de cette épreuve ne seront pas envoyés.', custo: 0, rotulo: 'Abandonner' }).then(function (ok) {
      if (ok) { pararEpreuveOral(); EO = null; abrirEpreuveOral(); }
    });
  });
}

// Fim: envia ao professor ou pede a correção da IA de cada tâche.
function resultadoOral() {
  var ts = EO.ordem.filter(function (t) { return EO.grav[t]; });
  var tela = $('tela-epreuve');
  tela.innerHTML = '<h1 class="titulo-pagina">Épreuve orale terminée</h1>' +
    '<div class="bloco ep-ok"><h3>' + (EO.correcao === 'ia' ? 'Correction de vos enregistrements par l\'IA' : 'Envoi au Sistema de Correção') + '</h3><p class="aviso" id="eo-status"></p>' +
    '<div class="ferramentas"><button class="ferramenta destaque" type="button" id="eo-nova">Nouvelle épreuve orale</button><button class="ferramenta" type="button" id="eo-notas">Meu espaço</button><button class="ferramenta" type="button" id="eo-accueil">Accueil</button></div></div>' +
    ts.map(function (t) {
      var g = EO.grav[t];
      return '<div class="bloco eo-res" data-eo-t="' + t + '"><h3>' + esc(TACHES[t].nom + ' · ' + TACHES[t].sous) + '</h3><p class="aviso">' + esc(EO.sujets[t].t.slice(0, 220)) + '</p>' +
        '<audio controls src="' + URL.createObjectURL(g.blob) + '"></audio><p class="aviso">' + formatarTempo(g.duree) + ' · <span data-eo-st></span></p><div class="ia-resultado" data-eo-res></div></div>';
    }).join('');
  $('eo-nova').addEventListener('click', function () { EO = null; abrirEpreuveOral(); });
  $('eo-notas').addEventListener('click', abrirNotes);
  $('eo-accueil').addEventListener('click', irAccueil);
  var caixa = function (t) { return tela.querySelector('[data-eo-t="' + t + '"]'); };
  var status = function (txt) { $('eo-status').textContent = txt; };

  if (EO.correcao === 'professor') {
    confirmarEnvio({ titulo: 'Envoyer l\'épreuve orale au professeur', custo: ts.length, rotulo: 'Envoyer au professeur',
      texto: 'Les enregistrements et leurs transcriptions entrent dans la file du Sistema de Correção et seront corrigés sur la grille de l\'examen.' }).then(function (ok) {
      if (!ok) { status('Épreuve non envoyée.'); return; }
      var i = 0, enviadas = 0;
      var proxima = function () {
        if (i >= ts.length) { status(enviadas + ' / ' + ts.length + ' tâche(s) envoyée(s) au Sistema de Correção.'); return; }
        var t = ts[i++], g = EO.grav[t], c = caixa(t);
        c.querySelector('[data-eo-st]').textContent = 'Envoi…';
        enviarGravacao({ blob: g.blob, tache: t, sujet: EO.sujets[t].id, duree: g.duree, transcricao: g.transcricao, modo: 'professor' }).then(function (r) {
          enviadas++;
          atualizarCreditos(r.creditos);
          c.querySelector('[data-eo-st]').innerHTML = '✓ Envoyée · protocole ' + esc(r.protocolo) + ' · <a href="' + linkCorrecao(r.id) + '">suivre la correction</a>';
          proxima();
        }).catch(function (e) { c.querySelector('[data-eo-st]').textContent = e.message || e; proxima(); });
      };
      proxima();
    });
    return;
  }
  // IA: uma tâche de cada vez (a IA ouve a gravação e lê a transcrição); « Réessayer » refaz só aquela.
  var corrigirUm = function (t) {
    var g = EO.grav[t], c = caixa(t), res = c.querySelector('[data-eo-res]');
    res.innerHTML = '<div class="ia-carregando"><i></i><i></i><i></i><span>L\'IA écoute votre enregistrement, relit la transcription et prépare vos conseils…</span></div>';
    return enviarGravacao({ url: '/api/modeles/oral-ia', blob: g.blob, tache: t, sujet: EO.sujets[t].id, duree: g.duree, transcricao: g.transcricao }).then(function (r) {
      if (B.ia) B.ia.restantes = r.restantes;
      res.innerHTML = cartaoCorrecaoIA(r, t);
      ligarLexicoCarnet(res); ligarDicas(res);
      c.querySelector('[data-eo-st]').textContent = '✓ Corrigée par l\'IA';
    }).catch(function (e) {
      res.innerHTML = '<div class="alerta">' + esc(e.message || e) + '</div><div class="ferramentas"><button class="ferramenta" type="button" data-eo-retentar>Réessayer</button>' +
        '<button class="ferramenta" type="button" data-eo-prof>Envoyer au professeur</button></div>';
      res.querySelector('[data-eo-retentar]').addEventListener('click', function () { corrigirUm(t); });
      res.querySelector('[data-eo-prof]').addEventListener('click', function () {
        confirmarEnvio({ titulo: 'Envoyer au professeur', custo: 1, rotulo: 'Envoyer', texto: 'L\'enregistrement et sa transcription entrent dans la file du Sistema de Correção.' }).then(function (ok) {
          if (!ok) return;
          enviarGravacao({ blob: g.blob, tache: t, sujet: EO.sujets[t].id, duree: g.duree, transcricao: g.transcricao, modo: 'professor' }).then(function (r) {
            atualizarCreditos(r.creditos);
            res.innerHTML = '<p class="aviso">✓ Envoyée · protocole ' + esc(r.protocolo) + ' · <a href="' + linkCorrecao(r.id) + '">suivre la correction</a></p>';
          }).catch(function (er) { var a = res.querySelector('.alerta'); if (a) a.textContent = er.message || er; });
        });
      });
    });
  };
  var seq = Promise.resolve();
  ts.forEach(function (t, k) { seq = seq.then(function () { status('Correction de la tâche ' + (k + 1) + ' / ' + ts.length + '…'); return corrigirUm(t); }); });
  seq.then(function () { status('Correction terminée.'); });
}
