// ================= página do sujet: « Faire ce sujet », dossiê e professor ao vivo =================

// Escolha de quem corrige (aparece dentro de « Faire ce sujet »): IA, professor (fila do Sistema de
// Correção) ou professor ao vivo (acompanha e, no envio, recebe a produção na mesma fila).
function htmlEscolhaFazer(oral) {
  var ia = !!(B.ia && B.ia.ativa);
  return '<fieldset class="escolha-correcao tm-correcao"><legend>Qui corrige ?</legend>' +
    '<label' + (ia ? '' : ' class="indisponivel"') + '><input type="radio" name="tm-correcao" value="ia"' + (ia ? ' checked' : ' disabled') + '><span><b>L\'IA</b><small>' +
      (ia ? 'Correction immédiate : note sur 20, trame, corrections et version améliorée' + (oral ? ', à partir de l\'enregistrement et de la transcription' : '') + '. Sans crédit.' : 'Indisponible pour le moment.') + '</small></span></label>' +
    '<label><input type="radio" name="tm-correcao" value="professor"' + (ia ? '' : ' checked') + '><span><b>Attendre la correction d\'un professeur</b><small>La production entre dans la file du Sistema de Correção et est corrigée sur la grille de l\'examen. Vous la retrouvez dans « Mes corrections ». 1 crédit · vous en avez ' + (B.creditos || 0) + '.</small></span></label>' +
    '<label><input type="radio" name="tm-correcao" value="aovivo"><span><b>Un professeur en direct</b><small>Il suit votre ' + (oral ? 'parole (transcription)' : 'texte pendant que vous écrivez') + ' et peut vous parler par la voix. À l\'envoi, la production lui est envoyée pour la correction (1 crédit).</small></span></label></fieldset>';
}
function correcaoFazer() { var r = document.querySelector('input[name="tm-correcao"]:checked'); return r ? r.value : 'professor'; }
function rotuloEnviar(oral) {
  return oral ? 'Envoyer l\'enregistrement et la transcription' : correcaoFazer() === 'ia' ? 'Corriger avec l\'IA' : 'Envoyer au professeur';
}

// Produção enviada: o cronômetro para e o tema deixa de estar « en cours ».
var FAZER = { emCurso: false };
function finalizarFazer() {
  FAZER.emCurso = false;
  var raiz = $('modele-raiz');
  if (raiz && raiz._pararCrono) raiz._pararCrono();
  var bt = $('tm-fazer-bt');
  if (bt) {
    bt.classList.remove('ativo');
    bt.classList.add('enviado');
    bt.querySelector('b').textContent = 'Production envoyée';
    bt.querySelector('small').textContent = 'Cliquez pour refaire ce sujet';
  }
}

function ligarFazer(raiz, tache, m, oral) {
  if (SALA) { google.script.run.encerrarSala(EMAIL, SALA.id); salaFim(); }   // outra página de sujet: fecha a sala anterior
  FAZER = { emCurso: false };
  var bt = $('tm-fazer-bt'), sec = $('tm-fazer');
  bt.addEventListener('click', function () {
    sec.hidden = false;
    if (!FAZER.emCurso) {
      FAZER.emCurso = true;
      bt.classList.remove('enviado');
      bt.classList.add('ativo');
      bt.querySelector('b').textContent = 'Sujet en cours';
      // cronômetro no modo prova, ligado ao começar
      var ex = sec.querySelector('[data-crono="exame"]'), play = sec.querySelector('[data-crono="play"]');
      if (ex && !ex.checked) { ex.checked = true; ex.dispatchEvent(new Event('change', { bubbles: true })); }
      if (play && !/Pause|Arrêter/.test(play.textContent)) play.click();
    }
    sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    var ed = sec.querySelector('.editor'); if (ed) setTimeout(function () { ed.focus(); }, 500);
  });
  var atualizarRotulos = function () {
    var env = $('tm-enviar'); if (env) env.textContent = rotuloEnviar(false);
    sec.querySelectorAll('[data-gl-enviar]').forEach(function (b) { b.textContent = rotuloEnviar(true); });
  };
  sec.querySelectorAll('input[name="tm-correcao"]').forEach(function (r) {
    r.addEventListener('change', function () {
      var vivo = correcaoFazer() === 'aovivo';
      $('tm-aovivo').hidden = !vivo;
      if (vivo && !SALA) desenharSalaAluno(tache, m);
      atualizarRotulos();
    });
  });
  atualizarRotulos();
  if (oral) return;
  // Escrita: o editor da épreuve (contador, linhas), com rascunho guardado neste aparelho.
  var ed = sec.querySelector('.editor'), chave = 'fnm_rasc_' + EMAIL + '_' + m.id, envioTimer = null;
  var salvo = lerLocal(chave, null);
  ligarEditor(ed, salvo ? salvo.t : '', salvo ? salvo.h : '', function (texto, html) {
    gravarLocal(chave, { t: texto, h: html });
    if (SALA && SALA.id) { clearTimeout(envioTimer); envioTimer = setTimeout(function () { salaEnviar({ texto: texto }); }, 1200); }
  });
  $('tm-enviar').addEventListener('click', function () {
    var texto = textoDoEditor(ed), b = this, st = $('tm-enviar-st');
    if (contarPalavras(texto) < 15) { st.textContent = 'Écrivez votre texte avant de le faire corriger.'; return; }
    if (correcaoFazer() === 'ia') {
      var res = $('tm-ia-res');
      pedirCorrecaoIA(tache, m.id, texto, res, b, function () { if (!res.querySelector('.alerta')) finalizarFazer(); });
      return;
    }
    if (!confirm('Envoyer ce texte à un professeur ? 1 crédit sera utilisé (vous en avez ' + (B.creditos || 0) + ').')) return;
    b.disabled = true; st.textContent = 'Envoi…';
    google.script.run.withSuccessHandler(function (r) {
      B.creditos = r.creditos;
      st.innerHTML = '✓ Envoyé · protocole ' + esc(r.protocolo) + ' · <a href="correcoes.html">suivre la correction</a>';
      if (SALA && SALA.id) salaEnviar({ texto: texto, fim: true });
      finalizarFazer();
      b.disabled = false;
    }).withFailureHandler(function (er) { b.disabled = false; st.textContent = er.message || er; }).enviarTextoCorrecao(EMAIL, { tache: tache, sujet: m.id, texte: texto, modo: 'professor' });
  });
}

// Oral: o essai gravado (áudio + transcrição) vai para a correção escolhida.
function enviarEssaiOral(b, d) {
  var escolha = correcaoFazer();
  if (escolha === 'ia') {
    b.disabled = true;
    var original = b.innerHTML;
    b.innerHTML = '<span class="ia-brilho"></span>Analyse en cours…<small>Environ 20 à 40 secondes</small>';
    d.res.innerHTML = '<div class="ia-carregando"><i></i><i></i><i></i><span>L\'IA écoute votre enregistrement, relit la transcription et prépare vos conseils…</span></div>';
    enviarGravacao({ url: '/api/modeles/oral-ia', blob: d.blob, tache: d.tache, sujet: d.m.id, duree: d.duree, transcricao: d.transcricao }).then(function (r) {
      if (B.ia) B.ia.restantes = r.restantes;
      d.res.innerHTML = cartaoCorrecaoIA(r, d.tache);
      ligarLexicoCarnet(d.res);
      ligarDicas(d.res);
      b.innerHTML = original; b.disabled = false;
      d.st.textContent = '✓ Corrigé par l\'IA';
      d.res.scrollIntoView({ behavior: 'smooth', block: 'start' });
      finalizarFazer();
    }).catch(function (e) {
      b.innerHTML = original; b.disabled = false;
      d.res.innerHTML = '<div class="alerta">' + esc(e.message || e) + '</div>';
    });
    return;
  }
  if (!confirm('Envoyer cet enregistrement et sa transcription à un professeur ? 1 crédit de correction sera utilisé (vous en avez ' + (B.creditos || 0) + ').')) return;
  b.disabled = true; d.st.textContent = 'Envoi…';
  enviarGravacao({ blob: d.blob, tache: d.tache, sujet: d.m.id, duree: d.duree, transcricao: d.transcricao, modo: 'professor' }).then(function (r) {
    B.creditos = r.creditos;
    d.st.innerHTML = '✓ Envoyé (protocole ' + esc(r.protocolo) + ') · <a href="correcoes.html">suivre la correction</a>';
    if (SALA && SALA.id) salaEnviar({ transcricao: d.transcricao, fim: true });
    finalizarFazer();
  }).catch(function (e) { b.disabled = false; d.st.textContent = e.message || e; });
}

// Coletânea do sujet: um texto sobre o eixo e dois sobre o próprio tema (imprensa, artigo científico,
// livro), cada um com autor, fonte, data, licença e link; depois, manchetes recentes sobre o tema.
var ICONES_LEITURA = { eixo: '🧭', noticia: '📰', cientifico: '🔬', livro: '📖', enciclopedia: '📚' };
function cartaoLeitura(t) {
  var credito = [t.autor, t.fonte, t.data].filter(Boolean).map(esc).join(' · ');
  return '<article class="tm-leitura tipo-' + esc(t.tipo || 'enciclopedia') + '"><span class="tm-leitura-n">' + (ICONES_LEITURA[t.tipo] || '📄') + ' ' + esc(t.rotulo || 'Lecture') + '</span>' +
    '<h4>' + esc(t.titulo) + '</h4>' + String(t.texto || '').split(/\n{2,}/).map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('') +
    '<small>' + credito + (t.licenca ? ' · ' + esc(t.licenca) : '') + ' · <a href="' + esc(t.url) + '" target="_blank" rel="noopener">lire à la source ↗</a></small></article>';
}
function carregarDossier(alvo, tache, m) {
  if (!alvo) return;
  google.script.run.withSuccessHandler(function (d) {
    if (!d || !d.textos.length) { alvo.innerHTML = ''; return; }
    var eixoT = d.textos.filter(function (t) { return t.tipo === 'eixo'; }), temaT = d.textos.filter(function (t) { return t.tipo !== 'eixo'; });
    alvo.innerHTML = '<h3 class="tm-sub">Pour mieux comprendre le thème</h3>' +
      (temaT.length ? '<p class="tm-sub2">Sur ce sujet</p><div class="tm-leituras">' + temaT.map(cartaoLeitura).join('') + '</div>' : '') +
      (eixoT.length ? '<p class="tm-sub2">Sur l\'axe thématique</p><div class="tm-leituras um">' + eixoT.map(function (t) { return cartaoLeitura(Object.assign({}, t, { rotulo: 'L\'axe thématique : ' + eixo(m.e).nome })); }).join('') + '</div>' : '') +
      ((d.imprensa || []).length ? '<div class="tm-imprensa"><p class="tm-sub2">Dans la presse en ce moment</p><ul>' + d.imprensa.map(function (n) {
        return '<li><a href="' + esc(n.url) + '" target="_blank" rel="noopener">' + esc(n.titulo) + '</a><small>' + [n.fonte, n.data].filter(Boolean).map(esc).join(' · ') + '</small></li>';
      }).join('') + '</ul></div>' : '');
  }).withFailureHandler(function () { alvo.innerHTML = ''; }).obterDossierSujet(EMAIL, tache, m.id);
}

// ---------- professor ao vivo (lado do aluno) ----------
var SALA = null;   // { id, stream, chamada, ultimoEnvio }
function salaEnviar(dados) {
  if (!SALA || !SALA.id) return;
  google.script.run.withSuccessHandler(function (r) { if (r && r.encerrada) salaFim(r.motivo); }).atualizarSalaAoVivo(EMAIL, SALA.id, dados);
}
// Pedido sem resposta em 3 minutos: o servidor cancela (motivo "expirou") e o aluno pode chamar de novo.
var SALA_CTX = null;   // { tache, m } do último pedido, para « Appeler à nouveau »
function salaFim(motivo) {
  if (!SALA) return;
  try { SALA.stream && SALA.stream.fechar(); } catch (e) {}
  try { SALA.chamada && SALA.chamada.encerrar(false); } catch (e) {}
  clearInterval(SALA.relogio);
  SALA = null;
  var a = $('tm-aovivo'); if (!a) return;
  if (motivo === 'expirou') {
    a.innerHTML = '<div class="av-sala-fim expirou"><b>Aucun professeur n\'a accepté votre demande en 3 minutes.</b><span>La demande a été annulée. Vous pouvez continuer seul, choisir une autre correction ou appeler à nouveau.</span>' +
      '<button class="botao-principal" type="button" id="av-rechamar">Appeler à nouveau</button></div>';
    $('av-rechamar').addEventListener('click', function () { if (SALA_CTX) { desenharSalaAluno(SALA_CTX.tache, SALA_CTX.m); $('av-chamar').click(); } });
    avisar({ titulo: 'Demande annulée', texto: 'Aucun professeur disponible en 3 minutes.', icone: '', som: true, duracao: 8 });
  } else a.innerHTML = '<div class="av-sala-fim">La séance en direct est terminée.</div>';
}
function desenharSalaAluno(tache, m) {
  SALA_CTX = { tache: tache, m: m };
  var a = $('tm-aovivo');
  a.innerHTML = '<div class="av-sala"><div class="av-sala-cab"><span class="av-ponto"></span><div><b>Professeur en direct</b><small id="av-estado">Appelez un professeur : il verra votre ' + (tache.indexOf('ET') === 0 ? 'texte' : 'transcription') + ' en temps réel.</small></div>' +
    '<button class="botao-principal" type="button" id="av-chamar">Appeler un professeur</button></div>' +
    '<div class="av-chamada" id="av-chamada" hidden></div><div class="av-chat" id="av-chat" hidden><div class="av-msgs" id="av-msgs"></div>' +
    '<div class="av-msg-linha"><input id="av-msg" placeholder="Écrire au professeur…"><button class="ferramenta" type="button" id="av-msg-bt">Envoyer</button><button class="ferramenta sutil" type="button" id="av-fim">Terminer la séance</button></div></div></div>';
  $('av-chamar').addEventListener('click', function () {
    var b = this; b.disabled = true; b.textContent = 'Appel…';
    google.script.run.withSuccessHandler(function (s) {
      SALA = { id: s.id, aguardando: true };
      b.remove();
      // contagem regressiva dos 3 minutos do pedido
      var fim = s.expiraEm ? new Date(s.expiraEm).getTime() : Date.now() + 180000;
      var mostrarEspera = function () {
        if (!SALA || !SALA.aguardando || !$('av-estado')) { if (SALA) clearInterval(SALA.relogio); return; }
        var resta = Math.max(0, Math.round((fim - Date.now()) / 1000));
        $('av-estado').textContent = 'En attente d\'un professeur… ' + Math.floor(resta / 60) + ':' + ('0' + resta % 60).slice(-2) + ' · Vous pouvez commencer : il verra tout dès qu\'il entrera.';
        if (resta <= 0 && !SALA.confirmando) { SALA.confirmando = true; salaEnviar({}); }   // o servidor confirma o cancelamento
      };
      mostrarEspera();
      SALA.relogio = setInterval(mostrarEspera, 1000);
      $('av-chat').hidden = false;
      ligarSalaAluno();
      var ed = document.querySelector('#tm-fazer .editor');
      if (ed) salaEnviar({ texto: textoDoEditor(ed) });
    }).withFailureHandler(function (e) { b.disabled = false; b.textContent = 'Appeler un professeur'; avisar({ titulo: 'Appel impossible', texto: e.message || e, icone: '', som: false }); })
      .chamarProfessorAoVivo(EMAIL, tache, m.id);
  });
}
function ligarSalaAluno() {
  var addMsg = function (de, nome, texto) {
    var l = $('av-msgs'); if (!l) return;
    l.insertAdjacentHTML('beforeend', '<div class="av-m ' + de + '"><b>' + esc(de === 'professor' ? (nome || 'Professeur') : 'Vous') + '</b><span>' + esc(texto) + '</span></div>');
    l.scrollTop = l.scrollHeight;
  };
  // Chamada de voz: a mesma de « Simulação completa », com a sinalização desta sala.
  if (window.SimuladoAoVivo && SimuladoAoVivo.Chamada) {
    var ch = new SimuladoAoVivo.Chamada(SALA.id, 'aluno', {
      onEstado: function (e2) { var c = $('av-chamada'); if (c && e2 === 'livre') c.hidden = true; if (c && e2 === 'conectada') c.innerHTML = '<span>🔊 En communication avec le professeur</span><button class="ferramenta" type="button" id="av-desligar">Raccrocher</button>', $('av-desligar') && $('av-desligar').addEventListener('click', function () { ch.encerrar(true); }); },
      onRemoto: function (stream) { var au = document.getElementById('av-audio') || document.body.appendChild(Object.assign(document.createElement('audio'), { id: 'av-audio', autoplay: true })); au.srcObject = stream; },
      onConvite: function () {
        var c = $('av-chamada'); c.hidden = false;
        c.innerHTML = '<span>📞 Le professeur vous appelle</span><button class="botao-principal" type="button" id="av-aceitar">Répondre</button><button class="ferramenta" type="button" id="av-recusar">Refuser</button>';
        $('av-aceitar').addEventListener('click', function () { ch.aceitar(); c.innerHTML = '<span>Connexion…</span>'; });
        $('av-recusar').addEventListener('click', function () { ch.recusar(); c.hidden = true; });
        somSuave();
      }
    });
    ch._enviar = function (dados) {
      return fetch('/api/modeles/salas/' + SALA.id + '/sinal', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('token') }, body: JSON.stringify({ dados: dados }) }).catch(function () {});
    };
    SALA.chamada = ch;
  }
  SALA.stream = SimuladoAoVivo.stream('/api/modeles/salas/' + SALA.id + '/stream', function (ev, d) {
    if (ev === 'estado') {
      if (d.status === 'atendimento') { SALA.aguardando = false; clearInterval(SALA.relogio); $('av-estado').textContent = (d.professorNome || 'Un professeur') + ' suit votre production en direct.'; avisar({ titulo: 'Professeur connecté', texto: d.professorNome || '', icone: '', som: true, duracao: 6 }); }
      if (d.status === 'encerrada') salaFim(d.motivo);
    } else if (ev === 'msg') { if (d.de === 'professor') { addMsg('professor', d.nome, d.texto); somSuave(); } }
    else if (ev === 'sinal' && SALA && SALA.chamada) SALA.chamada.receber(d);
  });
  $('av-msg-bt').addEventListener('click', function () {
    var i = $('av-msg'); if (!i.value.trim()) return;
    var t = i.value; i.value = '';
    addMsg('aluno', '', t);
    google.script.run.mensagemSala(EMAIL, SALA.id, t);
  });
  $('av-msg').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('av-msg-bt').click(); });
  $('av-fim').addEventListener('click', function () {
    if (!confirm('Terminer la séance en direct ?')) return;
    google.script.run.encerrarSala(EMAIL, SALA.id);
    salaFim();
  });
}

// ---------- devoirs: também os do Dever de Casa do site ----------
// Item com `link` (tema do catálogo do site) abre a página do dever; os demais abrem o sujet.
ligarDevoirs = function (raiz) {
  raiz.querySelectorAll('[data-dv-id]').forEach(function (b) {
    b.addEventListener('click', function () {
      var d = DEVOIRS.filter(function (x) { return x.id === b.dataset.dvId; })[0];
      if (!d) return;
      if (d.link || !d.modelo) { window.location.href = d.link || 'meus-deveres.html'; return; }
      abrirModelo(d.tache, d.modelo, { tipo: 'devoir', devoir: d });
    });
  });
};
// producao.html#devoir=<id>: vindo do Dever de Casa do site, abre direto o devoir.
function abrirDevoirPorId(id) {
  google.script.run.withSuccessHandler(function (l) {
    DEVOIRS = l || [];
    var d = DEVOIRS.filter(function (x) { return x.id === id; })[0];
    if (d && d.modelo) abrirModelo(d.tache, d.modelo, { tipo: 'devoir', devoir: d });
    else abrirTarefas();
  }).withFailureHandler(function () { abrirTarefas(); }).meusDevoirs(EMAIL);
}
