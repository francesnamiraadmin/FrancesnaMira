// ================= extensões do site =================

// ---------- áudios: arquivos Coqui pré-gerados (audio/modeles/<sha256(voz|frase)>.mp3) ----------
// A = candidat(e) / textos, B = examinateur. Frase sem arquivo ainda: voz do navegador e a
// frase fica registrada para a próxima geração (scripts_tts/gerar_audios_modeles.py).
var AUDIO_FALTA = {}, audioFaltaTimer = null;
Audios.manifest = null;
Audios.carregarManifest = function () {
  if (!Audios.manifest) Audios.manifest = fetch('audio/modeles/manifest.json', { cache: 'no-cache' })
    .then(function (r) { return r.ok ? r.json() : []; }).then(function (l) { return new Set(l); }).catch(function () { return new Set(); });
  return Audios.manifest;
};
Audios.hash = function (s) {
  if (!window.crypto || !crypto.subtle || !window.TextEncoder) return Promise.resolve(null);
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)).then(function (b) {
    return Array.prototype.map.call(new Uint8Array(b), function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
  });
};
Audios.url = function () { return Promise.resolve(null); };
Audios.obter = function (ids) { return Promise.resolve(ids.map(function () { return null; })); };
Audios.textos = function (itens) {
  return Audios.carregarManifest().then(function (m) {
    return Promise.all(itens.map(function (it) {
      if (!it || !it.texto) return null;
      var chave = (it.segunda ? 'B|' : 'A|') + String(it.texto).trim();
      return Audios.hash(chave).then(function (h) {
        if (h && m.has(h)) return 'audio/modeles/' + h + '.mp3';
        AUDIO_FALTA[chave] = 1;
        clearTimeout(audioFaltaTimer);
        audioFaltaTimer = setTimeout(function () {
          var l = Object.keys(AUDIO_FALTA); AUDIO_FALTA = {};
          if (l.length) google.script.run.registrarAudiosFaltantes(EMAIL, l.slice(0, 200));
        }, 4000);
        return null;
      });
    }));
  });
};

// ---------- transcrição da fala (Web Speech API, como na Simulação completa) ----------
var Transcricao = {
  iniciar: function (aoMudar) {
    var R = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!R) return null;
    var rec = new R(), finais = '', ativo = true;
    rec.lang = 'fr-FR'; rec.continuous = true; rec.interimResults = true;
    rec.onresult = function (e) {
      var parcial = '';
      for (var i = e.resultIndex; i < e.results.length; i++) {
        var r = e.results[i];
        if (r.isFinal) finais += r[0].transcript.trim() + ' ';
        else parcial += r[0].transcript;
      }
      aoMudar((finais + parcial).trim());
      // professor ao vivo: a fala transcrita vai para a sala (a cada ~1 s)
      if (typeof SALA !== 'undefined' && SALA && SALA.id) { var tx = (finais + parcial).trim(); clearTimeout(Transcricao.envio); Transcricao.envio = setTimeout(function () { salaEnviar({ transcricao: tx }); }, 1000); }
    };
    rec.onend = function () { if (ativo) { try { rec.start(); } catch (e) {} } };
    rec.onerror = function () {};
    try { rec.start(); } catch (e) { return null; }
    return { parar: function () { ativo = false; try { rec.stop(); } catch (e) {} return finais.trim(); } };
  }
};

// Envia uma gravação (FormData) — sessão do professor ou treino — ao Sistema de Correção.
function enviarGravacao(o) {
  var fd = new FormData();
  var ext = /mp4/.test(o.blob.type) ? '.m4a' : /ogg/.test(o.blob.type) ? '.ogg' : '.webm';
  fd.append('audio', o.blob, o.tache + ext);
  ['tache', 'sujet', 'sessao', 'duree', 'transcricao', 'modo'].forEach(function (k) { if (o[k] !== undefined && o[k] !== null) fd.append(k, o[k]); });
  if (window.FNM_CURSO) fd.append('courseType', window.FNM_CURSO);
  return fetch(o.url || '/api/modeles/oral', { method: 'POST', headers: { Authorization: 'Bearer ' + localStorage.getItem('token') }, body: fd })
    .then(function (res) { return res.json().catch(function () { return {}; }).then(function (d) { if (!res.ok) throw new Error(d.msg || 'Erreur ' + res.status); return d; }); });
}

// ---------- hub de escolhas do Ambiente de Produção ----------
var HUB_ESCOLHAS = [
  { id: 'ecrit', titulo: 'Production écrite', texto: 'Tâches 1, 2 et 3 par axe thématique, modèles annotés, épreuve de 60 minutes.', cor: '#E4C043', svg: '<path d="M4 20h4l10-10-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>' },
  { id: 'oral', titulo: 'Production orale', texto: 'Entretien, interaction et point de vue : dialogues à deux voix, enregistrement et transcription.', cor: '#94C4EC', svg: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>' },
  { id: 'dictee', titulo: 'Dictée', texto: 'Écoutez les modèles phrase par phrase et écrivez : correction mot à mot.', cor: '#8FBFA9', svg: '<path d="M4 6h16M4 12h10M4 18h7"/><path d="M17 14l3 3-3 3"/>' },
  { id: 'modeles', titulo: 'Modèles écrits', texto: 'Les productions modèles de la professeure, à lire, écouter et réécrire de mémoire.', cor: '#C9A62E', svg: '<path d="M5 4h10l4 4v12H5z"/><path d="M15 4v4h4M8 12h8M8 16h6"/>' },
  { id: 'vocab', titulo: 'Vocabulaire', texto: 'Cartes et quiz par thème : connecteurs, argumentation, lexique des axes.', cor: '#7FB0DC', svg: '<path d="M4 5h7a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H4z"/><path d="M20 5h-5a3 3 0 0 0-3 3"/><path d="M20 5v13h-6"/>' },
  { id: 'attentes', titulo: 'Attentes du professeur', texto: 'Connecteurs, mots à éviter, grammaire, pièges de traduction et formules.', cor: '#D51E28', svg: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1" fill="currentColor"/>' }
];
function htmlHubEscolhas() {
  var n = function (t) { return (B.contagens && B.contagens[t]) || 0; };
  var extra = {
    ecrit: (n('ET1') + n('ET2') + n('ET3')) + ' sujets',
    oral: (n('T1') + n('T2') + n('T3')) + ' sujets',
    dictee: ((B.partilhadas && B.partilhadas.dictees) || []).length + ' textes',
    modeles: ((B.partilhadas && B.partilhadas.modelos) || []).length + ' modèles',
    vocab: 'quiz et cartes', attentes: 'le guide de la méthode'
  };
  var espaco = B.professor
    ? { id: 'prof', titulo: 'Espace professeur', texto: 'Épreuves en direct, corrections, devoirs, suivi des élèves, thèmes du mois et À la une.', cor: '#1C2B3A', extra: 'ouvrir →', svg: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7"/>' }
    : { id: 'espace', titulo: 'Mon espace', texto: 'Mes tâches et messages de la professeure, mes notes, mes corrections et mon cahier d\'erreurs.', cor: '#1C2B3A', extra: '<span id="he-espace-n">devoirs, notes et cahier</span> →', svg: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7"/>' };
  return '<nav class="hub-escolhas" aria-label="Que voulez-vous travailler ?">' + HUB_ESCOLHAS.concat([espaco]).map(function (h) {
    return '<button class="hub-escolha' + (h.id === 'espace' || h.id === 'prof' ? ' hub-escolha-espace' : '') + '" type="button" data-hub-ir="' + h.id + '" style="--cor:' + h.cor + '">' +
      '<span class="he-ico"><svg viewBox="0 0 24 24" aria-hidden="true">' + h.svg + '</svg></span>' +
      '<b>' + h.titulo + '</b><small>' + h.texto + '</small><em>' + (h.extra || extra[h.id] + ' →') + '</em></button>';
  }).join('') + '</nav>';
}
function ligarHubEscolhas(raiz) {
  raiz.querySelectorAll('[data-hub-ir]').forEach(function (b) { b.addEventListener('click', function () { abrirDestino(b.dataset.hubIr); }); });
}
function abrirDestino(d) {
  var mapa = {
    ecrit: function () { abrirHub('ecrit'); }, oral: function () { abrirHub('oral'); }, dictee: abrirDicteePage, modeles: abrirModelesEcrits,
    vocab: abrirVocab, attentes: function () { abrirAttentes(); }, espace: abrirTarefas, notes: abrirNotes, carnet: abrirCarnet,
    epreuve: abrirEpreuve, simulados: abrirSimulados, outils: abrirOutils, prof: function () { abrirProf(); }
  };
  if (/^devoir=/.test(d)) { abrirDevoirPorId(d.slice(7)); return; }
  if (mapa[d]) mapa[d](); else if (B && B.professor && window.FNM_ABRIR === 'prof') abrirProf(); else irAccueil();
}
window.addEventListener('hashchange', function () { if (B) abrirDestino(location.hash.replace(/^#/, '')); });

// Production écrite / orale: além das tâches do TCF, os temas e exercícios do curso, por eixo.
var abrirHubDoScript = abrirHub;
abrirHub = function (modo) {
  abrirHubDoScript(modo);
  var tela = $('tela-hub');
  var bloco = document.createElement('div');
  bloco.id = 'hub-curso';
  tela.appendChild(bloco);
  if (modo === 'oral') {
    bloco.innerHTML = '<h2 class="secao-titulo">Exercices oraux au format de l\'examen</h2><div class="hub-acoes">' +
      '<a class="hub-acao" href="producao-oral-exercicios.html?curso=' + encodeURIComponent(B.courseType) + '"><span></span><b>Compréhension et expression orales</b><small>Documents sonores, questions et une tâche à enregistrer, avec professeur en direct si vous le souhaitez.</small></a>' +
      '<a class="hub-acao" href="simulado-tcf.html"><span></span><b>Simulation complète de l\'examen</b><small>Les quatre épreuves, dont l\'expression orale enregistrée et transcrite.</small></a></div>';
    return;
  }
  bloco.innerHTML = '<h2 class="secao-titulo">Thèmes du cours avec dossier documentaire</h2><div id="hub-temas-curso"><p class="aviso">Chargement…</p></div>';
  fetch('/api/temas?modalidade=textual&courseType=' + encodeURIComponent(B.courseType), { headers: { Authorization: 'Bearer ' + localStorage.getItem('token') } })
    .then(function (r) { return r.ok ? r.json() : []; }).then(function (temas) {
      var alvo = $('hub-temas-curso'); if (!alvo) return;
      if (!temas.length) { alvo.innerHTML = '<p class="aviso">Aucun thème pour ce cours pour le moment.</p>'; return; }
      var grupos = {};
      temas.forEach(function (t) { var k = t.eixo || 'soc'; (grupos[k] = grupos[k] || []).push(t); });
      alvo.innerHTML = '<p class="aviso" style="margin-top:0">Sujets au format de votre examen, avec textes et images d\'appui. Correction par l\'IA ou par un professeur.</p>' +
        B.ordemEixos.concat(Object.keys(grupos).filter(function (k) { return B.ordemEixos.indexOf(k) === -1; })).filter(function (k) { return grupos[k]; }).map(function (k) {
          var e = eixo(k);
          return '<div class="grupo-eixo" style="--cor:' + e.cor + '"><h3><i></i>' + (e.icone || '') + ' ' + esc(e.nome) + ' <small>(' + grupos[k].length + ')</small></h3><div class="lista-modelos">' +
            grupos[k].map(function (t) {
              return '<a class="item-modelo" style="--cor:' + e.cor + '" href="producao-textual.html?curso=' + encodeURIComponent(B.courseType) + '&tema=' + t._id + '"><b>' + esc(t.titulo) + '</b><small>' + esc(t.tipoProducao || '') + ' · ' + t.limitePalavrasMin + ' à ' + t.limitePalavrasMax + ' mots</small></a>';
            }).join('') + '</div></div>';
        }).join('');
    }).catch(function () { var a = $('hub-temas-curso'); if (a) a.innerHTML = ''; });
};

// ---------- envio ao Sistema de Correção (texto) ----------
function htmlEnvioSistema(id) {
  return '<div class="envio-sistema" data-envio="' + id + '"><b>Faire corriger ce texte</b><small>Correction complète sur la grille de l\'examen, dans « Mes corrections ».</small>' +
    '<div class="ferramentas">' + (B.iaCorrecaoSite ? '<button class="ferramenta" type="button" data-envio-modo="ia">Par l\'IA · 1 crédit</button>' : '') +
    '<button class="ferramenta destaque" type="button" data-envio-modo="professor">Par un professeur · 1 crédit</button></div><span class="aviso" data-envio-st></span></div>';
}
function ligarEnvioSistema(caixa, dadosFn) {
  if (!caixa) return;
  caixa.querySelectorAll('[data-envio-modo]').forEach(function (b) {
    b.addEventListener('click', function () {
      var d = dadosFn(), st = caixa.querySelector('[data-envio-st]');
      if (contarPalavras(d.texte) < 15) { st.textContent = 'Écrivez votre texte avant de l\'envoyer.'; return; }
      if (!confirm('Envoyer ce texte pour correction ' + (b.dataset.envioModo === 'ia' ? 'par l\'IA' : 'par un professeur') + ' ? 1 crédit sera utilisé (vous en avez ' + (B.creditos || 0) + ').')) return;
      d.modo = b.dataset.envioModo;
      b.disabled = true; st.textContent = 'Envoi…';
      google.script.run.withSuccessHandler(function (r) {
        B.creditos = r.creditos;
        st.innerHTML = '✓ Envoyé · protocole ' + esc(r.protocolo) + ' · <a href="correcoes.html">suivre la correction</a>';
      }).withFailureHandler(function (e) { b.disabled = false; st.textContent = e.message || e; }).enviarTextoCorrecao(EMAIL, d);
    });
  });
}

// ---------- épreuve écrite: escolha de quem corrige ----------
function htmlEscolhaCorrecao(st) {
  return '<fieldset class="escolha-correcao"><legend>Correction de l\'épreuve</legend>' +
    '<label><input type="radio" name="ep-correcao" value="ia" checked><span><b>Par l\'IA, dès la fin</b><small>Note sur 20, trame, corrections, lexique et version améliorée pour chaque tâche (entraînement, sans crédit).</small></span></label>' +
    '<label><input type="radio" name="ep-correcao" value="professor"><span><b>Par un professeur</b><small>Les trois textes partent dans le Sistema de Correção à la fin de l\'épreuve (1 crédit par tâche · vous avez ' + (st.creditos || 0) + ' crédit' + ((st.creditos || 0) > 1 ? 's' : '') + ').</small></span></label></fieldset>';
}
function correcaoEscolhida() { var r = document.querySelector('input[name="ep-correcao"]:checked'); return r ? r.value : 'ia'; }
function htmlEnvioEpreuve(r) {
  if (r.correcao === 'professor') return r.quantidade ? '<div class="bloco envio-sistema"><b>✓ Envoyée au Sistema de Correção</b><small>Suivez la correction de chaque tâche dans <a href="correcoes.html">« Mes corrections »</a>.</small></div>' : '';
  if (!r.id || r.status === 'vazia') return '';
  return '<div class="bloco envio-sistema" id="ep-envio"><b>Envoyer aussi à un professeur</b><small>En plus de la correction par l\'IA ci-dessous, vous pouvez envoyer vos textes au Sistema de Correção (1 crédit par tâche).</small>' +
    '<div class="ferramentas">' + ['ET1', 'ET2', 'ET3'].map(function (t) { return '<label class="check"><input type="checkbox" data-ep-t="' + t + '" checked> Tâche ' + t.slice(-1) + '</label>'; }).join('') +
    '<button class="ferramenta destaque" type="button" id="ep-envio-bt">Envoyer au professeur</button></div><span class="aviso" id="ep-envio-st"></span></div>';
}
function ligarEnvioEpreuve(r) {
  var bt = $('ep-envio-bt'); if (!bt) return;
  bt.addEventListener('click', function () {
    var ts = Array.prototype.map.call(document.querySelectorAll('[data-ep-t]:checked'), function (c) { return c.dataset.epT; });
    if (!ts.length) return;
    if (!confirm('Envoyer ' + ts.length + ' tâche(s) au professeur ? ' + ts.length + ' crédit(s) seront utilisés.')) return;
    bt.disabled = true; $('ep-envio-st').textContent = 'Envoi…';
    google.script.run.withSuccessHandler(function (x) {
      $('ep-envio-st').innerHTML = '✓ ' + x.enviadas + ' tâche(s) envoyée(s). ' + esc(x.aviso || '') + ' <a href="correcoes.html">Suivre la correction</a>';
    }).withFailureHandler(function (e) { bt.disabled = false; $('ep-envio-st').textContent = e.message || e; }).enviarEpreuveCorrecao(EMAIL, r.id, ts, 'professor');
  });
}

// ---------- carnet ↔ Caderno de Revisão da Plataforma de Questões ----------
function carregarCadernoPlataforma(alvo) {
  if (!alvo) return;
  google.script.run.withSuccessHandler(function (c) {
    alvo.innerHTML = '<a class="bloco caderno-ponte" href="' + esc(c.link) + '"><span class="cp-ico">' + ICO.livro + '</span><div><b>Caderno de Revisão da Plataforma de Questões</b>' +
      '<small>' + c.questoes + ' question' + (c.questoes > 1 ? 's' : '') + ' à revoir. Vos erreurs de production (ci-dessous) apparaissent aussi là-bas.</small></div><em>Ouvrir →</em></a>';
  }).withFailureHandler(function () { alvo.innerHTML = ''; }).obterCadernoErros(EMAIL);
}

// ---------- espace professeur: atalhos para as páginas da equipe do site ----------
function htmlAtalhosEquipe() {
  var l = [['professor-correcoes.html', 'Sistema de Correção'], ['admin-simulados.html', 'Simulados ao vivo'], ['gestao-alunos.html', 'Gestão de Alunos'], ['admin-horarios.html', 'Sistema de Aulas'], ['admin-financeiro.html', 'Financeiro']];
  return '<div class="atalhos-equipe">' + l.map(function (x) { return '<a class="chip" href="' + x[0] + '">' + x[1] + ' ↗</a>'; }).join('') + '</div>';
}

// ---------- espace professeur: ao vivo (salas com professor + épreuves de 60 min) ----------
var AO_VIVO = null;
function ligarAoVivo() {
  var alvo = $('aovivo'); if (!alvo) return;
  if (AO_VIVO && AO_VIVO.parar) AO_VIVO.parar();
  alvo.innerHTML = '<div id="av-salas"></div><div id="av-sala-aberta"></div><div id="av-epreuves"></div>';
  var estado = {}, salas = {}, relTimer = null, salaAberta = null;

  var desenharSalas = function () {
    var box = $('av-salas'); if (!box) return;
    var l = Object.keys(salas).map(function (k) { return salas[k]; }).sort(function (a, b) { return new Date(a.inicio) - new Date(b.inicio); });
    box.innerHTML = '<div class="bloco av-salas-bloco"><h3>Élèves qui demandent un professeur en direct : ' + l.length + '</h3>' +
      '<p class="aviso" style="margin-top:0">L\'élève fait un sujet du Ambiente de Produção et vous suivez son texte ou sa parole (transcription) en temps réel, avec le roteiro du sujet. Vous pouvez lui écrire et l\'appeler par la voix.</p>' +
      (l.length ? '<div class="av-grade">' + l.map(function (s) {
        return '<div class="av-card sala ' + s.status + '"><div class="av-cab"><b>' + esc(s.nome || '') + '</b><span class="av-status">' + (s.status === 'aguardando' ? '● en attente' : 'avec ' + esc(s.professorNome || '')) + '</span></div>' +
          '<small>' + esc(nomeTache(s.tache)) + (s.curso ? ' · ' + esc(s.curso) : '') + '</small><p class="av-sala-tit">' + esc(s.titulo || '') + '</p>' +
          '<button class="botao-principal" type="button" data-av-entrar="' + s.id + '">' + (s.status === 'aguardando' ? 'Entrer dans la salle' : 'Ouvrir la salle') + '</button></div>';
      }).join('') + '</div>' : '<p class="vazio">Personne n\'attend pour le moment.</p>') + '</div>';
    box.querySelectorAll('[data-av-entrar]').forEach(function (b) { b.addEventListener('click', function () { abrirSalaProf(b.dataset.avEntrar); }); });
  };

  var desenhar = function () {
    var box = $('av-epreuves'); if (!box) { if (relTimer) clearInterval(relTimer); return; }
    var l = Object.keys(estado).map(function (k) { return estado[k]; }).sort(function (a, b) { return (a.nome || '').localeCompare(b.nome || ''); });
    box.innerHTML = '<div class="bloco"><h3>Épreuves écrites en cours : ' + l.length + '</h3><p class="aviso" style="margin-top:0">Les textes s\'actualisent à chaque enregistrement automatique (environ toutes les 20 secondes). Les productions orales envoyées arrivent dans « Noter l\'oral » et dans le Sistema de Correção.</p>' +
      (l.length ? '<div class="av-grade">' + l.map(function (e) {
        var resta = Math.max(0, Math.round((e.fim - Date.now()) / 1000));
        return '<div class="av-card"><div class="av-cab"><b>' + esc(e.nome || '') + '</b><span class="av-tempo' + (resta < 300 ? ' fim' : '') + '">' + formatarTempo(resta) + '</span></div>' +
          '<small>' + (e.sessao ? 'Épreuve du professeur' : 'Entraînement libre') + (e.curso ? ' · ' + esc(e.curso) : '') + '</small>' +
          ['ET1', 'ET2', 'ET3'].map(function (t) {
            var tx = (e.textes || {})[t] || '', n = contarPalavras(tx), lim = LIMITES[t];
            return '<details class="av-tache"><summary><span>Tâche ' + t.slice(-1) + '</span><em class="' + (n > lim[1] ? 'alto' : n >= lim[0] ? 'ok' : '') + '">' + n + ' mots</em></summary>' +
              '<div class="prod-texto">' + (esc(tx).replace(/\n/g, '<br>') || '<span class="aviso">(vide)</span>') + '</div></details>';
          }).join('') +
          '<div class="av-msg"><input placeholder="Message à l\'élève…" data-av-msg="' + esc(e.alunoId) + '"><button class="ferramenta" type="button" data-av-env="' + esc(e.alunoId) + '">Envoyer</button></div></div>';
      }).join('') + '</div>' : '<p class="vazio">Aucune épreuve en cours pour le moment.</p>') + '</div>';
    box.querySelectorAll('[data-av-env]').forEach(function (b) {
      b.addEventListener('click', function () {
        var inp = box.querySelector('[data-av-msg="' + b.dataset.avEnv + '"]');
        if (!inp.value.trim()) return;
        b.disabled = true;
        google.script.run.withSuccessHandler(function () { inp.value = ''; b.disabled = false; avisar({ titulo: 'Message envoyé', icone: '', som: false, duracao: 4 }); })
          .withFailureHandler(function (er) { b.disabled = false; alert(er.message || er); }).enviarMensagem(EMAIL, b.dataset.avEnv, inp.value);
      });
    });
  };

  // Sala aberta: roteiro do sujet + produção ao vivo + chat + chamada de voz.
  var abrirSalaProf = function (id) {
    google.script.run.withSuccessHandler(function (s) {
      if (salaAberta) salaAberta.fechar();
      salas[s.id] = s; desenharSalas();
      var box = $('av-sala-aberta'), oral = s.tache.indexOf('ET') !== 0;
      box.innerHTML = '<div class="bloco av-sala-prof"><div class="av-sala-topo"><div><span class="tm-selo">Salle en direct</span><h3>' + esc(s.nome || '') + ' · ' + esc(nomeTache(s.tache)) + '</h3><small>' + esc(s.titulo || '') + '</small></div>' +
        '<div class="av-sala-bts"><button class="botao-principal" type="button" id="avp-ligar">📞 Appeler l\'élève</button><button class="ferramenta" type="button" id="avp-desligar" hidden>Raccrocher</button><button class="ferramenta sutil" type="button" id="avp-fim">Terminer la séance</button></div></div>' +
        '<span class="aviso" id="avp-chamada"></span>' +
        '<div class="av-sala-grade"><div><h4>' + (oral ? 'Ce que dit l\'élève (transcription en direct)' : 'Ce que l\'élève écrit (en direct)') + '</h4><div class="av-ao-vivo prod-texto" id="avp-texto">' + esc(oral ? s.transcricao : s.texto).replace(/\n/g, '<br>') + '</div>' +
        '<small id="avp-contagem"></small><div class="av-msgs" id="avp-msgs"></div><div class="av-msg-linha"><input id="avp-msg" placeholder="Écrire à l\'élève…"><button class="ferramenta" type="button" id="avp-msg-bt">Envoyer</button></div></div>' +
        '<div class="av-roteiro"><h4>Roteiro du sujet</h4><div id="avp-roteiro"><p class="aviso">Chargement…</p></div></div></div></div>';
      box.scrollIntoView({ behavior: 'smooth', block: 'start' });
      var contar = function () { var t = $('avp-texto').innerText; $('avp-contagem').textContent = contarPalavras(t) + ' mots'; };
      contar();
      var addMsg = function (de, nome, texto) { var l = $('avp-msgs'); if (!l) return; l.insertAdjacentHTML('beforeend', '<div class="av-m ' + de + '"><b>' + esc(de === 'aluno' ? (s.nome || 'Élève') : 'Vous') + '</b><span>' + esc(texto) + '</span></div>'); l.scrollTop = l.scrollHeight; };
      (s.mensagens || []).forEach(function (mm) { addMsg(mm.de, '', mm.texto); });
      google.script.run.withSuccessHandler(function (r) { $('avp-roteiro').innerHTML = htmlRoteiro(r); }).roteiroSujet(EMAIL, s.tache, s.sujetId);
      var ch = null;
      if (window.SimuladoAoVivo && SimuladoAoVivo.Chamada) {
        ch = new SimuladoAoVivo.Chamada(s.id, 'professor', {
          onEstado: function (e2, d) {
            var st = $('avp-chamada'); if (!st) return;
            st.textContent = { chamando: 'Appel en cours… l\'élève doit répondre.', conectando: 'Connexion…', conectada: '🔊 En communication avec l\'élève', instavel: 'Connexion instable…', falhou: d || 'Échec de l\'appel.', erro: d || 'Erreur.', livre: '' }[e2] || '';
            $('avp-desligar').hidden = !(e2 === 'chamando' || e2 === 'conectando' || e2 === 'conectada' || e2 === 'instavel');
          },
          onRemoto: function (stream) { var au = document.getElementById('avp-audio') || document.body.appendChild(Object.assign(document.createElement('audio'), { id: 'avp-audio', autoplay: true })); au.srcObject = stream; }
        });
        ch._enviar = function (dados) { return fetch('/api/modeles/salas/' + s.id + '/sinal', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('token') }, body: JSON.stringify({ dados: dados }) }).catch(function () {}); };
      }
      $('avp-ligar').addEventListener('click', function () { if (ch) ch.ligar(); });
      $('avp-desligar').addEventListener('click', function () { if (ch) ch.encerrar(true); });
      $('avp-msg-bt').addEventListener('click', function () { var i = $('avp-msg'); if (!i.value.trim()) return; var t = i.value; i.value = ''; addMsg('professor', '', t); google.script.run.mensagemSala(EMAIL, s.id, t); });
      $('avp-msg').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('avp-msg-bt').click(); });
      var stream = SimuladoAoVivo.stream('/api/modeles/salas/' + s.id + '/stream', function (ev, d) {
        if (!$('avp-texto')) { stream.fechar(); return; }
        if (ev === 'conteudo') { $('avp-texto').innerHTML = esc(oral ? d.transcricao : d.texto).replace(/\n/g, '<br>'); contar(); }
        else if (ev === 'msg' && d.de === 'aluno') { addMsg('aluno', d.nome, d.texto); somSuave(); }
        else if (ev === 'sinal' && ch) ch.receber(d);
        else if (ev === 'estado' && d.status === 'encerrada') { $('avp-chamada').textContent = 'L\'élève a terminé la séance.'; if (ch) ch.encerrar(false); }
      });
      salaAberta = { fechar: function () { try { stream.fechar(); } catch (e) {} try { ch && ch.encerrar(false); } catch (e) {} } };
      $('avp-fim').addEventListener('click', function () {
        if (!confirm('Terminer la séance en direct ?')) return;
        google.script.run.encerrarSala(EMAIL, s.id);
        salaAberta.fechar(); salaAberta = null; delete salas[s.id];
        $('av-sala-aberta').innerHTML = ''; desenharSalas();
      });
    }).withFailureHandler(function (e) { alert(e.message || e); }).entrarSala(EMAIL, id);
  };

  google.script.run.withSuccessHandler(function (l) { (l || []).forEach(function (s) { salas[s.id] = s; }); desenharSalas(); }).listarSalasAoVivo(EMAIL);
  google.script.run.withSuccessHandler(function (l) {
    (l || []).forEach(function (e) { estado[e.id] = e; });
    desenhar();
    relTimer = setInterval(function () { if (!$('aovivo')) { clearInterval(relTimer); return; } if ($('av-epreuves') && $('av-epreuves').querySelectorAll('.av-tempo').length) desenhar(); }, 15000);
  }).listarEpreuvesAoVivo(EMAIL);
  if (window.SimuladoAoVivo && SimuladoAoVivo.stream) {
    var ctrl = SimuladoAoVivo.stream('/api/modeles/equipe/stream', function (ev, d) {
      if (!$('aovivo')) { if (AO_VIVO && AO_VIVO.parar) AO_VIVO.parar(); return; }
      if (ev === 'epreuve') {
        if (d.acao === 'fim') delete estado[d.id];
        else if (d.acao === 'rascunho' || d.acao === 'inicio') estado[d.id] = Object.assign(estado[d.id] || {}, { id: d.id, alunoId: d.alunoId, nome: d.nome, fim: d.fim || Date.now() + 3600000, sessao: d.sessao, textes: d.textes || (estado[d.id] || {}).textes || {} });
        desenhar();
      } else if (ev === 'sala') {
        if (d.acao === 'nova') { salas[d.id] = d; avisar({ titulo: 'Un élève demande un professeur en direct', texto: (d.nome || '') + ' · ' + nomeTache(d.tache), icone: '', som: true, duracao: 12, acao: { rotulo: 'Entrer', fn: function () { abrirSalaProf(d.id); } } }); }
        else if (d.acao === 'fim') delete salas[d.id];
        else if (d.acao === 'atendimento' && salas[d.id]) { salas[d.id].status = 'atendimento'; salas[d.id].professorNome = d.professorNome; }
        if (d.acao !== 'conteudo') desenharSalas();
      } else if (ev === 'oral') avisar({ titulo: 'Nouvel enregistrement', texto: (d.nome || '') + ' · ' + d.tache, icone: '', som: true, duracao: 8 });
    });
    AO_VIVO = { parar: function () { if (ctrl && ctrl.fechar) ctrl.fechar(); if (salaAberta) salaAberta.fechar(); } };
  }
}

// Roteiro do professor para uma sala: enunciado, documentos, modelo, trame e argumentos do eixo.
function htmlRoteiro(r) {
  var m = r.modelo || {}, partes = [];
  partes.push('<div class="ro-bloco"><b>' + esc(r.nomeTache) + ' · ' + esc(r.eixo) + '</b><p>' + esc(r.consigne) + '</p>' + (r.d1 ? '<details><summary>Documents 1 et 2</summary><p>' + esc(r.d1) + '</p><p>' + esc(r.d2) + '</p></details>' : '') + '</div>');
  if (r.tache === 'T2' && m.ech) partes.push('<details class="ro-bloco" open><summary>Questions modèles du candidat</summary><ol>' + m.ech.map(function (x) { return '<li>' + esc(x.q) + '<small>' + esc(x.r) + '</small></li>'; }).join('') + '</ol></details>');
  else if (m.etapes) partes.push('<details class="ro-bloco" open><summary>Réponse modèle, étape par étape</summary><ol>' + m.etapes.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ol>' +
    (m.rel && m.rel.length ? '<b>Questions de relance</b><ul>' + m.rel.map(function (x) { return '<li>' + esc(x.q) + '</li>'; }).join('') + '</ul>' : '') + '</details>');
  else if (m.p) partes.push('<details class="ro-bloco"><summary>Production modèle</summary>' + String(m.p).split(/\n+/).map(function (x) { return '<p>' + esc(x) + '</p>'; }).join('') + '</details>');
  if (r.trame && r.trame.etapes) partes.push('<details class="ro-bloco"><summary>La trame</summary><ol>' + r.trame.etapes.map(function (e) { return '<li><b>' + esc(e.rotulo) + '</b> ' + esc(e.texte) + '</li>'; }).join('') + '</ol></details>');
  if (r.argumentos.pour.length) partes.push('<details class="ro-bloco"><summary>Arguments de l\'axe</summary><b>Pour</b><ul>' + r.argumentos.pour.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul><b>Contre</b><ul>' + r.argumentos.contre.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></details>');
  return partes.join('');
}

// ---------- espace professeur: menu lateral agrupado ----------
var GRUPOS_PROF = [
  ['Suivre', ['aovivo', 'online', 'suivi']],
  ['Corriger', ['ecrit', 'oral']],
  ['Proposer aux élèves', ['sessoes', 'devoirs', 'avis']],
  ['Contenus', ['temas', 'blog', 'quadro', 'geracao', 'vocab']]
];
function organizarProf(tela, aba) {
  var abas = tela.querySelector('.abas-prof'), atalhos = tela.querySelector('.atalhos-equipe');
  if (!abas || tela.querySelector('.prof-layout')) return;
  var menu = document.createElement('nav');
  menu.className = 'prof-menu';
  menu.setAttribute('aria-label', 'Espace professeur');
  GRUPOS_PROF.forEach(function (g) {
    var bloco = document.createElement('div');
    bloco.className = 'prof-grupo';
    bloco.innerHTML = '<span class="prof-grupo-tit">' + g[0] + '</span>';
    g[1].forEach(function (id) { var b = abas.querySelector('[data-aba="' + id + '"]'); if (b) { b.className = 'prof-item'; bloco.appendChild(b); } });
    if (bloco.children.length > 1) menu.appendChild(bloco);
  });
  if (atalhos) {
    var out = document.createElement('div');
    out.className = 'prof-grupo';
    out.innerHTML = "<span class=\"prof-grupo-tit\">Autres pages de l’équipe</span>";
    Array.prototype.slice.call(atalhos.querySelectorAll('a')).forEach(function (a) { a.className = 'prof-item link'; out.appendChild(a); });
    menu.appendChild(out);
    atalhos.remove();
  }
  var principal = document.createElement('div');
  principal.className = 'prof-conteudo';
  var depois = abas.nextSibling;
  while (depois) { var prox = depois.nextSibling; if (!(depois.classList && depois.classList.contains('abas-prof'))) principal.appendChild(depois); else depois.remove(); depois = prox; }
  var layout = document.createElement('div');
  layout.className = 'prof-layout';
  layout.appendChild(menu);
  layout.appendChild(principal);
  abas.replaceWith(layout);
}

// ---------- mon espace: resumo no topo ----------
function resumoEspace(tela, devoirs, mensagens) {
  var h = tela.querySelector('.abas-espace');
  if (!h) return;
  var r = document.createElement('div');
  r.className = 'espace-resumo';
  r.innerHTML = [[devoirs, 'devoirs à faire', 'abrirTarefas'], [mensagens, 'messages à lire', 'abrirTarefas'], [CARNET.filter(function (x) { return x.tipo === 'erreur'; }).length, 'erreurs dans mon cahier', 'abrirCarnet']]
    .map(function (x) { return '<button type="button" class="er-item' + (x[0] ? ' on' : '') + '" data-er="' + x[2] + '"><b>' + x[0] + '</b><span>' + x[1] + '</span></button>'; }).join('');
  h.insertAdjacentElement('afterend', r);
  r.querySelectorAll('[data-er]').forEach(function (b) { b.addEventListener('click', function () { if (b.dataset.er === 'abrirCarnet') abrirCarnet(); else { var alvo = tela.querySelector('.devoirs-lista, .msgs-lista, .secao-titulo'); if (alvo) alvo.scrollIntoView({ behavior: 'smooth', block: 'center' }); } }); });
}
