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
  return fetch('/api/modeles/oral', { method: 'POST', headers: { Authorization: 'Bearer ' + localStorage.getItem('token') }, body: fd })
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
  return '<nav class="hub-escolhas" aria-label="Que voulez-vous travailler ?">' + HUB_ESCOLHAS.map(function (h) {
    return '<button class="hub-escolha" type="button" data-hub-ir="' + h.id + '" style="--cor:' + h.cor + '">' +
      '<span class="he-ico"><svg viewBox="0 0 24 24" aria-hidden="true">' + h.svg + '</svg></span>' +
      '<b>' + h.titulo + '</b><small>' + h.texto + '</small><em>' + extra[h.id] + ' →</em></button>';
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

// ---------- espace professeur: acompanhamento ao vivo das épreuves ----------
var AO_VIVO = null;
function ligarAoVivo() {
  var alvo = $('aovivo'); if (!alvo) return;
  if (AO_VIVO && AO_VIVO.parar) AO_VIVO.parar();
  var estado = {}, relTimer = null;
  var desenhar = function () {
    if (!$('aovivo')) { if (relTimer) clearInterval(relTimer); return; }
    var l = Object.keys(estado).map(function (k) { return estado[k]; }).sort(function (a, b) { return (a.nome || '').localeCompare(b.nome || ''); });
    alvo.innerHTML = '<div class="bloco"><h3>Épreuves écrites en cours : ' + l.length + '</h3><p class="aviso" style="margin-top:0">Les textes s\'actualisent à chaque enregistrement automatique (environ toutes les 20 secondes). Les productions orales envoyées arrivent dans « Noter l\'oral » et dans le Sistema de Correção.</p>' +
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
    alvo.querySelectorAll('[data-av-env]').forEach(function (b) {
      b.addEventListener('click', function () {
        var inp = alvo.querySelector('[data-av-msg="' + b.dataset.avEnv + '"]');
        if (!inp.value.trim()) return;
        b.disabled = true;
        google.script.run.withSuccessHandler(function () { inp.value = ''; b.disabled = false; avisar({ titulo: 'Message envoyé', icone: '', som: false, duracao: 4 }); })
          .withFailureHandler(function (er) { b.disabled = false; alert(er.message || er); }).enviarMensagem(EMAIL, b.dataset.avEnv, inp.value);
      });
    });
  };
  google.script.run.withSuccessHandler(function (l) {
    (l || []).forEach(function (e) { estado[e.id] = e; });
    desenhar();
    relTimer = setInterval(function () { if (!$('aovivo')) { clearInterval(relTimer); return; } alvo.querySelectorAll('.av-tempo').length && desenhar(); }, 15000);
  }).listarEpreuvesAoVivo(EMAIL);
  if (window.SimuladoAoVivo && SimuladoAoVivo.stream) {
    var ctrl = SimuladoAoVivo.stream('/api/modeles/equipe/stream', function (ev, d) {
      if (!$('aovivo')) { if (AO_VIVO && AO_VIVO.parar) AO_VIVO.parar(); return; }
      if (ev === 'epreuve') {
        if (d.acao === 'fim') delete estado[d.id];
        else if (d.acao === 'rascunho' || d.acao === 'inicio') estado[d.id] = Object.assign(estado[d.id] || {}, { id: d.id, alunoId: d.alunoId, nome: d.nome, fim: d.fim || Date.now() + 3600000, sessao: d.sessao, textes: d.textes || (estado[d.id] || {}).textes || {} });
        desenhar();
      } else if (ev === 'oral') avisar({ titulo: 'Nouvel enregistrement', texto: (d.nome || '') + ' · ' + d.tache, icone: '', som: true, duracao: 8 });
    });
    AO_VIVO = { parar: function () { if (ctrl && ctrl.fechar) ctrl.fechar(); } };
  }
}
