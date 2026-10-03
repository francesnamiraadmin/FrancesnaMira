// =====================================================================
// Ambiente de Produção — app "Modèles TCF" (Google Apps Script) rodando no site.
// GERADO por backend/seed/portarAppModeles.js a partir do App.html do script: não edite
// este arquivo; mude backend/seed/modeles-site/*.js e rode o porte de novo.
// Chamadas ao servidor: js/gasShim.js (google.script.run → /api/modeles/rpc/*).
// =====================================================================
/* ============================================================
   * App.html — lógica do app "Modèles TCF".
   * Telas: login → accueil → liste (por tâche) → modèle
   *        accueil → axe (por eixo) · barra → boîte à outils
   * Recursos: destaques (SURLIGNAGE + palavras-chave), leitor com áudio
   * gravado (Audio.gs) ou voz do navegador, dictée ao lado do modelo,
   * diálogo a completar, tirage au sort.
   * ============================================================ */
  var App = (function () {
    'use strict';

    var TACHES = {
      T1:  { modo: 'orale',  nom: 'Tâche 1', sous: 'Entretien dirigé', info: '2 min · sans préparation', fonte: 'orale' },
      T2:  { modo: 'orale',  nom: 'Tâche 2', sous: 'Exercice en interaction', info: '2 min de préparation + 3 min 30', fonte: 'orale' },
      T3:  { modo: 'orale',  nom: 'Tâche 3', sous: "Expression d'un point de vue", info: '4 min 30 · sans préparation', fonte: 'orale' },
      ET1: { modo: 'ecrite', nom: 'Tâche 1', sous: 'Message court', info: '60 à 120 mots', min: 60, max: 120, fonte: 'ecrite' },
      ET2: { modo: 'ecrite', nom: 'Tâche 2', sous: 'Récit, article ou lettre', info: '120 à 150 mots', min: 120, max: 150, fonte: 'ecrite' },
      ET3: { modo: 'ecrite', nom: 'Tâche 3', sous: 'Texte argumentatif', info: '120 à 180 mots', min: 120, max: 180, fonte: 'ecrite' }
    };
    var ORDEM_TACHES = ['T1', 'T2', 'T3', 'ET1', 'ET2', 'ET3'];

    var B = null;               // banco vindo do servidor
    var EMAIL = '';
    var estado = { tache: null, filtroEixo: null, busca: '', origem: null };
    var dicionario = null, padroesGlobais = null;
    var cronometro = null;

    // ================= utilidades =================
    function $(id) { return document.getElementById(id); }
    function esc(s) {
      return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    var TEMAS_MES = [], TEMAS_MES_IDS = {};
    /** O aluno pode abrir o modelo? (acesso tâche × eixo, tema do mês ou devoir) */
    function permitido(tache, e, id) {
      if (!B || B.professor) return true;
      if (((B.acesso || {})[tache] || []).indexOf(e) !== -1) return true;
      if (id && TEMAS_MES_IDS[id]) return true;
      if (id && (B.partilhadasIds || {})[id]) return true;
      return !!id && (DEVOIRS || []).some(function (d) { return d.modelo === id; });
    }
    function eixo(ch) { return (B && B.eixos[ch]) || { nome: ch, cor: '#888', icone: '•' }; }
    function lista(tache) {
      var t = TACHES[tache]; if (!t) return [];
      var fonte = t.fonte === 'orale' ? B.orale : B.ecrite;
      return (fonte && fonte[tache]) || [];
    }
    // Todos os temas de uma tâche: modelos manuais + temas das provas (com ou sem modelo IA).
    var LISTAS = {};
    function itemDeModelo(m) {
      var p = (B && B.pesos && B.pesos[m.id]) || {};
      return { id: m.id, e: m.e, f: m.f || 1, titre: m.titre, resumo: m.c || m.p || '', k: m.k || [], tipo: 'manuel', w: p.w || 1, tr: p.tr || 0 };
    }

    // ---------- sorteio ponderado ----------
    // Peso = frequência histórica × recência × prioridade do eixo × tendência do mês (calculado no servidor, Tendances.gs).
    // Aqui: temas já vistos pesam muito menos e os eixos dos últimos sorteios são evitados.
    function chaveHistEixos() { return 'fnm_eixos_hist_' + EMAIL; }
    function registrarEixos(lista) {
      var h = lerLocal(chaveHistEixos(), []).concat(lista);
      gravarLocal(chaveHistEixos(), h.slice(-6));
    }
    function sorteioPonderado(lista, op) {
      op = op || {};
      var recentes = lerLocal(chaveHistEixos(), []).slice(-(op.memoria || 3));
      var evitar = op.evitarEixos || [];
      var pesos = lista.map(function (x) {
        var w = Number(x.w) || 1;
        if (op.vistos && op.vistos.indexOf(x.id) !== -1) w *= 0.15;
        if (evitar.indexOf(x.e) !== -1) w *= 0.02;
        else if (recentes.indexOf(x.e) !== -1) w *= 0.35;
        return w;
      });
      var total = pesos.reduce(function (a, b) { return a + b; }, 0), r = Math.random() * total;
      for (var i = 0; i < lista.length; i++) { r -= pesos[i]; if (r <= 0) return lista[i]; }
      return lista[lista.length - 1];
    }
    function tituloCurto(t) {
      var f = String(t || '').replace(/^(Je suis|Nous sommes)[^.]*\.\s*/i, '').split(/(?<=[.?!])\s/)[0];
      return f.length > 95 ? f.slice(0, 92) + '…' : f;
    }
    function carregarLista(tache, cb) {
      if (LISTAS[tache]) { cb(LISTAS[tache]); return; }
      var manuais = lista(tache).map(itemDeModelo);
      google.script.run.withSuccessHandler(function (r) {
        LISTAS[tache] = manuais.concat((r || []).map(function (x) {
          return { id: x.id, e: x.e, f: x.f, titre: tituloCurto(x.t), resumo: x.t, k: [], tipo: x.ia ? 'ia' : 'sujet', d: x.d, w: x.w || 1, tr: x.tr || 0 };
        }).sort(function (a, b) { return b.f - a.f; }));
        cb(LISTAS[tache]);
      }).withFailureHandler(function () { cb(manuais); }).obterListaTache(EMAIL, tache);
    }
    function listaNav(tache) { return LISTAS[tache] || lista(tache).map(itemDeModelo); }

    // ---------- avisos (toast + som suave + título da aba) ----------
    var tituloOriginal = document.title, piscaTitulo = null;
    function somSuave() {
      try {
        var C = window.AudioContext || window.webkitAudioContext; if (!C) return;
        var c = new C();
        [[660, 0], [880, 0.18]].forEach(function (n) {
          var o = c.createOscillator(), g = c.createGain();
          o.type = 'sine'; o.frequency.value = n[0];
          g.gain.setValueAtTime(0.0001, c.currentTime + n[1]);
          g.gain.exponentialRampToValueAtTime(0.12, c.currentTime + n[1] + 0.03);
          g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + n[1] + 0.5);
          o.connect(g); g.connect(c.destination); o.start(c.currentTime + n[1]); o.stop(c.currentTime + n[1] + 0.55);
        });
      } catch (e) {}
    }
    function avisar(op) {
      var zona = $('avisos');
      if (!zona) { zona = document.createElement('div'); zona.id = 'avisos'; zona.className = 'avisos'; zona.setAttribute('aria-live', 'assertive'); (document.getElementById('fnm-raiz') || document.body).appendChild(zona); }
      var el = document.createElement('div');
      el.className = 'aviso-toast ' + (op.tipo || 'info');
      el.innerHTML = '<div class="aviso-icone">' + (op.icone || '') + '</div><div class="aviso-corpo"><b>' + esc(op.titulo) + '</b>' + (op.texto ? '<span>' + esc(op.texto) + '</span>' : '') +
        (op.acao ? '<button type="button" class="aviso-acao">' + esc(op.acao.rotulo) + '</button>' : '') + '</div><button type="button" class="aviso-fechar" aria-label="Fermer">✕</button>' +
        '<i class="aviso-barra" style="animation-duration:' + (op.duracao || 12) + 's"></i>';
      zona.appendChild(el);
      requestAnimationFrame(function () { el.classList.add('visivel'); });
      var fechar = function () { el.classList.remove('visivel'); setTimeout(function () { el.remove(); }, 400); };
      el.querySelector('.aviso-fechar').addEventListener('click', fechar);
      if (op.acao) el.querySelector('.aviso-acao').addEventListener('click', function () { op.acao.fn(); fechar(); });
      setTimeout(fechar, (op.duracao || 12) * 1000);
      if (op.som !== false) somSuave();
      if (navigator.vibrate) try { navigator.vibrate([80, 60, 80]); } catch (e) {}
      if (document.hidden) {
        if (piscaTitulo) clearInterval(piscaTitulo);
        var alterna = false;
        piscaTitulo = setInterval(function () { alterna = !alterna; document.title = alterna ? '' + op.titulo : tituloOriginal; }, 1000);
      }
    }
    document.addEventListener('visibilitychange', function () { if (!document.hidden && piscaTitulo) { clearInterval(piscaTitulo); piscaTitulo = null; document.title = tituloOriginal; } });

    function nomeTache(t) { var i = TACHES[t]; return (i.modo === 'orale' ? 'Oral' : 'Écrit') + ' · ' + i.nom; }
    function contarPalavras(s) {
      var m = String(s || '').match(/[A-Za-zÀ-ÿœŒ0-9]+(?:['’-][A-Za-zÀ-ÿœŒ0-9]+)*/g);
      return m ? m.length : 0;
    }
    function semAcento(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
    function lerLocal(k, padrao) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : padrao; } catch (e) { return padrao; } }
    function gravarLocal(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

    function mostrar(id) {
      TELA_ATUAL_JP = '';
      if (typeof sinalizar === 'function') setTimeout(function () { sinalizar(id); }, 400);
      if (id !== 'tela-epreuve' && EP && !EP.fechada) { salvarServidor(); pararEpreuveTimers(); }
      if (id !== 'tela-epreuve') pararGravacaoTudo();
      pararChrono();
      if (TST && id !== 'tela-hub') pararTeste();
      if (VOC && VOC.sair) VOC.sair();
      pararCronometro();
      Voz.parar();
      esconderDica();
      document.querySelectorAll('.tela').forEach(function (t) { t.classList.toggle('ativa', t.id === id); });
      window.scrollTo(0, 0);
    }

    /** Fil d'Ariane: [{rotulo, fn}] — o último é a página atual. */
    function trilha(partes) {
      return '<nav class="trilha" aria-label="Vous êtes ici">' + partes.map(function (p, i) {
        return i === partes.length - 1 ? '<span aria-current="page">' + esc(p.rotulo) + '</span>'
          : '<button type="button" data-trilha="' + i + '">' + esc(p.rotulo) + '</button><span class="sep">›</span>';
      }).join('') + '</nav>';
    }
    function ligarTrilha(raiz, partes) {
      raiz.querySelectorAll('[data-trilha]').forEach(function (b) { b.addEventListener('click', partes[Number(b.dataset.trilha)].fn); });
    }
    var PARTE_ACCUEIL = function () { return { rotulo: 'Accueil', fn: irAccueil }; };

    // ================= login =================
function iniciar() {
      // No site não há login por e-mail: quem abre é identificado pelo token (js/gasShim.js).
      EMAIL = window.FNM_EU || '__eu__';
      entrar();
    }

function entrar() {
      google.script.run
        .withSuccessHandler(function (banco) {
          B = banco; aplicarPerfil();
          if (window.FNM_TRADUZIR_BANCO) window.FNM_TRADUZIR_BANCO(B);   // pt-BR: eixos (js/producaoI18n.js)
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

function sair() { window.location.href = 'producao-hub.html'; }

    // ================= accueil =================
    function htmlTirage(taches, id) {
      return '<div class="tirage" id="' + id + '"><div class="tirage-texto"><span class="tm-selo">Tirage au sort</span><h2>Un sujet, comme le jour de l\'examen</h2>' +
        '<p>Le sujet est tiré parmi ceux qui sont ouverts pour vous, en privilégiant ceux qui tombent le plus. Préparez-vous d\'abord, puis découvrez le modèle.</p></div>' +
        '<div class="tirage-campos"><label>Tâche<select data-tr="tache">' + taches.filter(function (t) { return (B.contagens && B.contagens[t]) || lista(t).length; }).map(function (t) {
          return '<option value="' + t + '">' + nomeTache(t) + ' · ' + TACHES[t].sous + '</option>';
        }).join('') + '</select></label>' +
        '<label>Axe<select data-tr="eixo"><option value="">Tous les axes ouverts</option>' +
        B.ordemEixos.map(function (ch) { return '<option value="' + ch + '">' + esc(eixo(ch).nome) + '</option>'; }).join('') + '</select></label>' +
        '<button class="tirage-bt" type="button" data-tr="ir">Tirer un sujet</button></div><p class="tirage-info" data-tr="info"></p></div>';
    }
    function ligarTirage(raiz, origem) {
      var q = function (k) { return raiz.querySelector('[data-tr="' + k + '"]'); };
      if (!q('tache').options.length) {
        raiz.querySelector('.tirage-campos').innerHTML = '<p class="tirage-info" style="margin:0">Aucun sujet n\'est encore ouvert pour vous ici. Votre professeur(e) les ouvrira au fur et à mesure.</p>';
        q('info') && (q('info').textContent = '');
        return;
      }
      var atualizar = function () {
        var t = q('tache').value, e = q('eixo').value || null;
        carregarLista(t, function () { if (q('tache').value === t) q('info').textContent = textoProgressoSorteio(t, e); });
      };
      q('tache').addEventListener('change', atualizar); q('eixo').addEventListener('change', atualizar);
      q('ir').addEventListener('click', function () { sortear(q('tache').value, q('eixo').value || null, origem); });
      atualizar();
    }

function irAccueil() {
      if (!B) return;
      var CURSOS = { TCF: 'TCF Canada', DELF: 'DELF', DALF: 'DALF', TEF: 'TEF Canada', A1: 'Français A1', A2: 'Français A2', B1: 'Français B1', B2: 'Français B2' };
      var nomeCurso = ehDelf() ? B.perfil.nome : CURSOS[B.courseType] || 'TCF Canada';
      var html = '<div class="acc-topo">' + (B.nome ? '<p class="ola">Bonjour, ' + esc(B.nome.split(' ')[0]) + '.</p>' : '') +
        '<div class="acc-titulo-linha"><h1 class="titulo-pagina">Ambiente de Produção · ' + esc(nomeCurso) + '</h1>' + (B.professor ? '' : htmlCreditos()) + '</div>' +
        '<p class="intro">Choisissez ce que vous voulez travailler. Les sujets sont classés par tâche et par axe thématique, avec modèles annotés, audio, dictée, épreuves chronométrées et correction par l\'IA ou par un professeur.</p></div>';
      html += htmlNiveisDelf();
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
        if ($('he-espace-n')) $('he-espace-n').textContent = n ? n + ' tâche' + (n > 1 ? 's' : '') + ' à faire' : 'devoirs, notes et cahier';
        if (!n || !$('acc-pendencias')) return;
        $('acc-pendencias').innerHTML = '<button class="faixa-pend" type="button" id="acc-pend">Vous avez <b>' + n + '</b> tâche' + (n > 1 ? 's' : '') + ' de votre professeur(e) à faire <span>Mon espace →</span></button>';
        $('acc-pend').addEventListener('click', abrirTarefas);
      });
      mostrar('tela-accueil');
      try { history.replaceState(null, '', '#'); } catch (e) {}
    }

    /** Página "Production orale" ou "Production écrite": tâches, épreuves, tirage, axes, boîte à outils. */
    function abrirHub(modo) {
      if (!B) return;
      var oral = modo === 'oral', taches = oral ? TS() : ETS();
      var partes = [PARTE_ACCUEIL(), { rotulo: oral ? 'Production orale' : 'Production écrite' }];
      var html = trilha(partes) + '<h1 class="titulo-pagina">' + (oral ? 'Production orale' : 'Production écrite') + '</h1>' +
        '<p class="intro">' + (ehDelf() ? introHubDelf(oral) : oral ? 'Les trois tâches de l\'expression orale : modèles avec audio, dialogue à deux voix, monologue pas à pas, enregistrement.' :
          'Les trois tâches de l\'expression écrite : modèles annotés selon la trame, épreuve de 60 minutes et correction.') + '</p>';
      html += '<div class="hub-taches">' + taches.map(function (t) {
        var n = (B.contagens && B.contagens[t]) || lista(t).length, info = TACHES[t];
        return '<button class="hub-tache" type="button" data-tache="' + t + '"' + (n ? '' : ' disabled') + '><span class="selo">' + seloTache(t) + '</span>' +
          '<b>' + info.nom + ' · ' + info.sous + '</b><small>' + info.info + '</small><em>' + (n ? n + ' sujets →' : 'bientôt') + '</em></button>';
      }).join('') + '</div>';
      html += '<div class="hub-acoes">' +
        '<button class="hub-acao" type="button" data-hub="epreuve"><span>' + (oral ? '' : '') + '</span><b>' + (oral ? 'Mes épreuves orales' : ehDelf() ? 'Prova escrita (' + minutosEpreuve() + ' min)' : 'Épreuve écrite (60 min)') + '</b><small>' +
          (oral ? 'Les tâches de l\'oral enregistrées dans les conditions de l\'examen, corrigées par l\'IA ou un professeur.' : ehDelf() ? 'A produção escrita completa, nas condições do ' + esc(nomeProva()) + '.' : 'Tâches 1, 2 et 3 dans les conditions de l\'examen.') + '</small></button>' +
        '<button class="hub-acao" type="button" data-hub="outils"><span></span><b>Boîte à outils</b><small>Connecteurs, trames et formules à réutiliser.</small></button>' +
        '</div>';
      html += htmlTirage(taches, 'hub-tirage');
      html += '<h2 class="secao-titulo">Par axe thématique</h2><div class="grade-eixos">';
      B.ordemEixos.forEach(function (ch) {
        var abertos = B.professor || taches.some(function (t) { return permitido(t, ch); });
        if (!abertos) return;   // eixo fechado: o aluno nem o vê
        var e = eixo(ch);
        html += '<button class="cartao-eixo" type="button" data-eixo="' + ch + '" style="--cor:' + e.cor + '">' +
          '<span class="ico">' + e.icone + '</span><b>' + esc(e.nome) + '</b></button>';
      });
      html += '</div>';
      var tela = $('tela-hub');
      tela.innerHTML = html;
      ligarTrilha(tela, partes);
      tela.querySelectorAll('.hub-tache').forEach(function (b) { b.addEventListener('click', function () { abrirLista(b.dataset.tache); }); });
      tela.querySelectorAll('.cartao-eixo').forEach(function (b) { b.addEventListener('click', function () { abrirEixo(b.dataset.eixo); }); });
      tela.querySelector('[data-hub="epreuve"]').addEventListener('click', function () { if (oral) abrirEpreuveOral(); else abrirEpreuve(); });
      tela.querySelector('[data-hub="outils"]').addEventListener('click', abrirOutils);
      if (tela.querySelector('[data-hub="chrono"]')) tela.querySelector('[data-hub="chrono"]').addEventListener('click', function () { abrirChrono(); });
      ligarTirage($('hub-tirage'), 'accueil');
      mostrar('tela-hub');
    }

    function contarPorEixo(ch) {
      var n = 0;
      ORDEM_TACHES.forEach(function (t) { lista(t).forEach(function (m) { if (m.e === ch) n++; }); });
      return n;
    }

    // ================= tirage au sort =================
    function candidatos(tache, filtroEixo, busca) {
      var q = semAcento((busca || '').trim());
      return listaNav(tache).filter(function (m) {
        if (filtroEixo && m.e !== filtroEixo) return false;
        return !q || semAcento(m.titre + ' ' + (m.resumo || '') + ' ' + (m.k || []).join(' ')).indexOf(q) !== -1;
      });
    }
    function chaveSorteio(tache) { return 'fnm_tirage_' + EMAIL + '_' + tache; }
    /** Candidatos ao sorteio: só temas que o aluno pode abrir (eixos liberados, devoirs, partilhas, temas do mês). */
    function candidatosSorteio(tache, filtroEixo, busca) {
      return candidatos(tache, filtroEixo, busca).filter(function (m) { return permitido(tache, m.e, m.id); });
    }
    function textoProgressoSorteio(tache, filtroEixo) {
      var c = candidatosSorteio(tache, filtroEixo), vistos = lerLocal(chaveSorteio(tache), []);
      var ja = c.filter(function (m) { return vistos.indexOf(m.id) !== -1; }).length;
      return c.length + ' sujet' + (c.length > 1 ? 's' : '') + ' possible' + (c.length > 1 ? 's' : '') + ' · ' + ja + ' déjà tiré' + (ja > 1 ? 's' : '') + '.';
    }

    /** Tira um sujet ainda não visto (reinicia quando todos já saíram). */
    function sortear(tache, filtroEixo, de, busca) {
      if (!LISTAS[tache]) { carregarLista(tache, function () { sortear(tache, filtroEixo, de, busca); }); return; }
      var c = candidatosSorteio(tache, filtroEixo, busca);
      if (!c.length) { avisar({ titulo: 'Aucun sujet débloqué', texto: 'Aucun sujet de cette tâche n\'est encore ouvert pour vous. Votre professeur(e) les débloquera au fur et à mesure.', icone: '', som: false }); return; }
      var vistos = lerLocal(chaveSorteio(tache), []);
      var novos = c.filter(function (m) { return vistos.indexOf(m.id) === -1; });
      var reiniciou = false;
      if (!novos.length) {
        var idsFiltro = c.map(function (m) { return m.id; });
        vistos = vistos.filter(function (id) { return idsFiltro.indexOf(id) === -1; });
        novos = c; reiniciou = true;
      }
      var escolhido = sorteioPonderado(novos, { vistos: vistos });
      registrarEixos([escolhido.e]);
      vistos.push(escolhido.id);
      gravarLocal(chaveSorteio(tache), vistos);
      estado.tache = tache;
      estado.filtroEixo = filtroEixo;
      abrirModelo(tache, escolhido.id, { tipo: 'sorteio', de: de, eixo: filtroEixo, busca: busca, reiniciou: reiniciou });
    }

    // ================= lista de uma tâche =================
    function abrirLista(tache, manterFiltro) {
      if (!LISTAS[tache]) {
        mostrar('tela-liste');
        $('tela-liste').innerHTML = '<p class="vazio">Chargement des sujets…</p>';
        carregarLista(tache, function () { abrirLista(tache, manterFiltro); });
        return;
      }
      if (!manterFiltro || estado.tache !== tache) { estado.filtroEixo = null; estado.busca = ''; estado.abertos = {}; }
      estado.tache = tache;
      var info = TACHES[tache];
      var itens = LISTAS[tache];
      var eixosPresentes = B.ordemEixos.filter(function (ch) { return itens.some(function (m) { return m.e === ch; }); });
      var partes = [PARTE_ACCUEIL(), { rotulo: nomeTache(tache) }];

      var html = trilha(partes);
      html += '<div class="cab-lista"><div><h1>' + nomeTache(tache) + '</h1><p>' + info.sous + ' · ' + info.info + '</p></div>' +
        '<div class="cab-acoes"><input class="busca" type="search" id="busca" placeholder="Rechercher un sujet…" value="' + esc(estado.busca) + '">' +
        '<button class="botao-sorteio" type="button" id="lista-sorteio">Tirage au sort</button></div></div>';
      html += '<div class="chips"><button class="chip" type="button" data-eixo="" aria-pressed="' + (!estado.filtroEixo) + '">Tous (' + itens.length + ')</button>';
      eixosPresentes.forEach(function (ch) {
        var n = itens.filter(function (m) { return m.e === ch; }).length;
        html += '<button class="chip" type="button" data-eixo="' + ch + '" aria-pressed="' + (estado.filtroEixo === ch) + '">' + eixo(ch).icone + ' ' + esc(eixo(ch).nome) + ' (' + n + ')</button>';
      });
      html += '</div><p class="aviso legenda-lista"><span class="selo-tipo tendance">Tombé récemment (' + esc(B.tendMes || '') + ')</span><span class="selo-tipo manuel">Modèle Français na Mira</span> <span class="selo-tipo ia">Modèle prêt</span> <span class="selo-tipo sujet">Sujet d\'examen : le modèle est rédigé à la première ouverture</span></p>' +
        '<p class="aviso" id="lista-info"></p><div id="resultado-lista"></div>';

      var tela = $('tela-liste');
      tela.innerHTML = html;
      ligarTrilha(tela, partes);
      tela.querySelectorAll('.chip').forEach(function (c) {
        c.addEventListener('click', function () {
          estado.filtroEixo = c.dataset.eixo || null;
          tela.querySelectorAll('.chip').forEach(function (x) { x.setAttribute('aria-pressed', String(x === c)); });
          desenharResultado();
        });
      });
      $('busca').addEventListener('input', function (e) { estado.busca = e.target.value; desenharResultado(); });
      $('lista-sorteio').addEventListener('click', function () { sortear(tache, estado.filtroEixo, 'liste', estado.busca); });
      desenharResultado();
      mostrar('tela-liste');
    }

    function desenharResultado() {
      var filtrados = candidatos(estado.tache, estado.filtroEixo, estado.busca);
      $('lista-info').textContent = 'Le tirage au sort choisit parmi les ' + filtrados.length + ' sujet' + (filtrados.length > 1 ? 's' : '') + ' affiché' + (filtrados.length > 1 ? 's' : '') + '.';
      var alvo = $('resultado-lista');
      if (!filtrados.length) { alvo.innerHTML = '<p class="vazio">Aucun modèle ne correspond à votre recherche.</p>'; return; }
      var html = '';
      B.ordemEixos.forEach(function (ch) {
        var grupo = filtrados.filter(function (m) { return m.e === ch; });
        if (!grupo.length) return;
        var e = eixo(ch);
        var aberto = (estado.abertos || {})[ch] || !!estado.busca;
        var visiveis = aberto ? grupo : grupo.slice(0, 12);
        html += '<div class="grupo-eixo" style="--cor:' + e.cor + '"><h3><i></i>' + e.icone + ' ' + esc(e.nome) + ' <small>(' + grupo.length + ')</small></h3><div class="lista-modelos">';
        visiveis.forEach(function (m) { html += cartaoModelo(m, estado.tache); });
        html += '</div>' + (grupo.length > visiveis.length ? '<button class="ferramenta mais" type="button" data-mais="' + ch + '">Afficher les ' + (grupo.length - visiveis.length) + ' autres sujets de cet axe</button>' : '') + '</div>';
      });
      alvo.innerHTML = html;
      ligarCartoes(alvo, { tipo: 'liste' });
      alvo.querySelectorAll('[data-mais]').forEach(function (b) {
        b.addEventListener('click', function () { estado.abertos = estado.abertos || {}; estado.abertos[b.dataset.mais] = true; desenharResultado(); });
      });
    }

    function cartaoModelo(m, tache) {
      if (!m.tipo) m = itemDeModelo(m);
      var e = eixo(m.e);
      var trancado = false;   // temas fechados não chegam ao aluno
      var selo = trancado ? '<span class="selo-tipo trancado" title="Verrouillé">' + ICO.cadeado + '</span>' : m.tipo === 'manuel' ? '<span class="selo-tipo manuel" title="Modèle de la professeure">' + ICO.caneta + '</span>' : m.tipo === 'ia' ? '<span class="selo-tipo ia" title="Modèle rédigé par l\'IA">IA</span>' : '';
      if (CARNET_IDS[m.id]) selo += '<span class="selo-tipo carnet" title="Dans mon cahier">' + ICO.livro + '</span>';
      if (m.tr) selo += '<span class="selo-tipo tendance" title="Sujet relaté ce mois-ci">Tendance</span>';
      var freq = m.f > 1 ? '<span class="freq">tombé ' + m.f + '×</span>' : '';
      return '<button class="item-modelo tipo-' + m.tipo + '" type="button" data-id="' + m.id + '" data-tache="' + tache + '" style="--cor:' + e.cor + '">' +
        '<b>' + selo + esc(m.titre) + '</b><small>' + esc(String(m.resumo || '').slice(0, 170)) + '</small>' + freq +
        (trancado ? '' : '<span class="cahier-rapido' + (CARNET_IDS[m.id] ? ' on' : '') + '" role="button" tabindex="0" data-cahier="' + esc(m.id) + '" title="Enregistrer dans mon cahier">' + ICO.livro + '</span>') + '</button>';
    }

    function ligarCartoes(raiz, origem) {
      raiz.querySelectorAll('.item-modelo').forEach(function (b) {
        b.addEventListener('click', function (ev) {
          var rap = ev.target.closest('[data-cahier]');
          if (rap) {
            ev.stopPropagation();
            var item = listaNav(b.dataset.tache).filter(function (x) { return x.id === b.dataset.id; })[0] || { titre: b.querySelector('b').textContent };
            google.script.run.withSuccessHandler(function (marcado) {
              if (marcado) CARNET_IDS[b.dataset.id] = { tache: b.dataset.tache, id: b.dataset.id }; else delete CARNET_IDS[b.dataset.id];
              rap.classList.toggle('on', marcado);
              avisar({ titulo: marcado ? 'Enregistré dans votre cahier' : 'Retiré du cahier', texto: item.titre, icone: '', som: false, duracao: 5, acao: marcado ? { rotulo: 'Ouvrir mon cahier', fn: abrirCarnet } : null });
            }).alternarCarnet(EMAIL, { tache: b.dataset.tache, id: b.dataset.id, titre: item.titre, e: item.e });
            return;
          }
          abrirModelo(b.dataset.tache, b.dataset.id, origem);
        });
      });
    }

    // ================= eixo =================
    function abrirEixo(ch) {
      var e = eixo(ch);
      var partes = [PARTE_ACCUEIL(), { rotulo: e.icone + ' ' + e.nome }];
      var html = trilha(partes);
      html += '<div class="bloco eixo-topo" style="--cor:' + e.cor + '"><div class="etiquetas"><span class="etiqueta eixo" style="--cor:' + e.cor + '">' + e.icone + ' Axe thématique</span></div>' +
        '<h1 class="modele-titulo" style="margin-bottom:8px">' + esc(e.nome) + '</h1>' +
        (e.patron ? '<p style="margin:0">' + esc(e.patron) + '</p>' : '') + '</div>';
      if (e.argumentsPour) {
        html += '<div class="bloco"><div class="args"><div><h3>Arguments pour</h3><ul>' + e.argumentsPour.map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ul></div>' +
          '<div><h3>Arguments contre</h3><ul>' + (e.argumentsContre || []).map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ul></div></div>';
        if (e.agents) {
          html += '<p class="aviso" style="margin-top:14px"><b>Conclusion type :</b> il est essentiel que ' + esc(e.agents[0]) + ', en coopération avec ' + esc(e.agents[1] || 'les citoyens') + ', ' +
            esc((e.actions || ['mettent en place'])[0]) + ' ' + esc((e.complements || ['des mesures'])[0]) + ' ' + esc(e.domaine || '') + '.</p>';
        }
        html += '</div>';
      }
      html += '<div class="bloco"><h3>Tous les sujets d\'examen de cet axe</h3><div class="ferramentas">' + ORDEM_TACHES.map(function (t) {
        return '<button class="ferramenta" type="button" data-todos="' + t + '">' + nomeTache(t) + '</button>';
      }).join('') + '</div></div>';
      if (e.lexique) html += '<div class="bloco"><h3>Lexique de l\'axe</h3><div class="mots">' + e.lexique.split('·').map(function (w) { return '<span class="mot">' + esc(w.trim()) + '</span>'; }).join('') + '</div></div>';

      ORDEM_TACHES.forEach(function (t) {
        var grupo = lista(t).filter(function (m) { return m.e === ch; });
        if (!grupo.length) return;
        html += '<div class="grupo-eixo" style="--cor:' + e.cor + '"><h3><i></i>' + nomeTache(t) + ' : ' + TACHES[t].sous +
          '<button class="ferramenta mini-link" type="button" data-todos="' + t + '">Tous les sujets →</button>' +
          '<button class="botao-sorteio mini" type="button" data-sortear="' + t + '">Au hasard</button></h3><div class="lista-modelos">';
        grupo.forEach(function (m) { html += cartaoModelo(m, t); });
        html += '</div></div>';
      });
      var tela = $('tela-axe');
      tela.innerHTML = html;
      ligarTrilha(tela, partes);
      ligarCartoes(tela, { tipo: 'eixo', eixo: ch });
      tela.querySelectorAll('[data-sortear]').forEach(function (b) {
        b.addEventListener('click', function () { sortear(b.dataset.sortear, ch, 'eixo'); });
      });
      tela.querySelectorAll('[data-todos]').forEach(function (b) {
        b.addEventListener('click', function () { carregarLista(b.dataset.todos, function () { estado.tache = b.dataset.todos; estado.filtroEixo = ch; estado.busca = ''; abrirLista(b.dataset.todos, true); }); });
      });
      mostrar('tela-axe');
    }

    // ================= destaques =================
    function padraoDe(termo) {
      var p = termo.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/['’]/g, "['’]").replace(/\s+/g, '\\s+');
      return new RegExp('(^|[^A-Za-zÀ-ÿœŒ0-9])(' + p + ')(?=[^A-Za-zÀ-ÿœŒ0-9]|$)', 'gi');
    }

    function prepararDestaques() {
      dicionario = {}; padroesGlobais = [];
      var termos = B.surlignage.termes;
      Object.keys(termos).forEach(function (cat) {
        termos[cat].forEach(function (par) {
          var t = par[0].toLowerCase().replace(/’/g, "'");
          dicionario[cat + '|' + t] = par[1];
          padroesGlobais.push({ re: padraoDe(par[0]), cat: cat, termo: t });
        });
      });
    }

    /** Lista os trechos a destacar (sem sobreposição; os mais longos têm prioridade). */
    function achar(texto, palavrasChave) {
      var padroes = padroesGlobais.slice();
      (palavrasChave || []).forEach(function (k) {
        padroes.push({ re: padraoDe(k), cat: 'mc', termo: k.toLowerCase().replace(/’/g, "'") });
      });
      var achados = [];
      padroes.forEach(function (p) {
        p.re.lastIndex = 0;
        var m;
        while ((m = p.re.exec(texto)) !== null) {
          var ini = m.index + m[1].length;
          achados.push({ ini: ini, fim: ini + m[2].length, cat: p.cat, termo: p.termo });
          p.re.lastIndex = ini + m[2].length;
        }
      });
      achados.sort(function (a, b) { return a.ini - b.ini || (b.fim - b.ini) - (a.fim - a.ini) || (a.cat === 'mc' ? -1 : 1); });
      var escolhidos = [], fim = -1;
      achados.forEach(function (a) { if (a.ini >= fim) { escolhidos.push(a); fim = a.fim; } });
      return escolhidos;
    }

    function destacar(texto, palavrasChave) {
      var out = '', cursor = 0;
      achar(texto, palavrasChave).forEach(function (a) {
        out += esc(texto.slice(cursor, a.ini));
        out += '<mark class="sl sl-' + a.cat + '" tabindex="0" data-cat="' + a.cat + '" data-termo="' + esc(a.termo) + '">' + esc(texto.slice(a.ini, a.fim)) + '</mark>';
        cursor = a.fim;
      });
      return out + esc(texto.slice(cursor));
    }

    function mostrarDica(el) {
      var cat = el.dataset.cat;
      if (document.querySelector('.modele-raiz.off-' + cat)) return;
      var c = B.surlignage.categories[cat];
      var expl = cat === 'mc' ? 'Mot-clé du thème : réutilisez-le dans votre production.' : (dicionario[cat + '|' + el.dataset.termo] || c.desc);
      var dica = $('dica');
      dica.innerHTML = '<b>' + esc(c.nom) + '</b>' + esc(expl);
      dica.hidden = false;
      var r = el.getBoundingClientRect();
      var larg = dica.offsetWidth, alt = dica.offsetHeight;
      dica.style.left = Math.max(8, Math.min(r.left + r.width / 2 - larg / 2, window.innerWidth - larg - 8)) + 'px';
      var topo = r.top - alt - 8;
      dica.style.top = (topo < 60 ? r.bottom + 8 : topo) + 'px';
    }
    function esconderDica() { var d = $('dica'); if (d) d.hidden = true; }

    function ligarDicas(raiz) {
      raiz.addEventListener('mouseover', function (e) { var m = e.target.closest('mark.sl'); if (m) mostrarDica(m); });
      raiz.addEventListener('mouseout', function (e) { if (e.target.closest('mark.sl')) esconderDica(); });
      raiz.addEventListener('focusin', function (e) { var m = e.target.closest('mark.sl'); if (m) mostrarDica(m); });
      raiz.addEventListener('focusout', esconderDica);
      raiz.addEventListener('click', function (e) { var m = e.target.closest('mark.sl'); if (m) mostrarDica(m); });
    }

    // ================= áudio =================
    /** Busca os mp3 no servidor em lotes e guarda em memória: id → Promise(dataURL). */
    var Audios = {
      cache: {},
      obter: function (ids) {
        var faltam = ids.filter(function (id) { return id && !Audios.cache[id]; });
        for (var i = 0; i < faltam.length; i += 6) {
          (function (lote) {
            var p = new Promise(function (resolve, reject) {
              google.script.run.withSuccessHandler(resolve).withFailureHandler(reject).obterAudios(EMAIL, lote);
            });
            lote.forEach(function (id) {
              Audios.cache[id] = p.then(function (r) { if (!r[id]) throw new Error('audio'); return r[id]; })
                .catch(function (e) { delete Audios.cache[id]; throw e; });
            });
          })(faltam.slice(i, i + 6));
        }
        return Promise.all(ids.map(function (id) { return id ? Audios.cache[id] : Promise.resolve(null); }));
      },
      url: function (id) { return Audios.obter([id]).then(function (r) { return r[0]; }); },
      // Modelos IA: áudio gravado sob demanda a partir do texto (Audio.gs · obterAudiosTexto).
      porTexto: {},
      chaveTexto: function (texto, segunda) { return (segunda ? 'B|' : 'A|') + texto; },
      textos: function (itens) {
        var faltam = itens.filter(function (it) { return it && !Audios.porTexto[Audios.chaveTexto(it.texto, it.segunda)]; });
        for (var i = 0; i < faltam.length; i += 4) {
          (function (lote) {
            var p = new Promise(function (resolve, reject) {
              google.script.run.withSuccessHandler(resolve).withFailureHandler(reject)
                .obterAudiosTexto(EMAIL, lote.map(function (it) { return { t: it.texto, v: it.segunda ? 'B' : 'A' }; }));
            });
            lote.forEach(function (it, j) {
              var k = Audios.chaveTexto(it.texto, it.segunda);
              Audios.porTexto[k] = p.then(function (r) { if (!r[j]) throw new Error('audio'); return r[j]; })
                .catch(function (e) { delete Audios.porTexto[k]; throw e; });
            });
          })(faltam.slice(i, i + 4));
        }
        return Promise.all(itens.map(function (it) { return it ? Audios.porTexto[Audios.chaveTexto(it.texto, it.segunda)] : null; }));
      }
    };

    /** Toca um trecho: arquivo gravado se existir, senão voz do navegador. */
    var Voz = {
      token: 0, nivel: 2, atual: null,
      // 0 = très lente · 1 = lente · 2 = normale · 3 = rapide
      RITMO_ARQUIVO: [0.6, 0.8, 1, 1.15], RITMO_TTS: [0.55, 0.75, 0.95, 1.1],
      /** Pausa entre frases: mais longa nas velocidades lentas. */
      pausaNivel: function (base) { return base * (Voz.nivel === 0 ? 3 : Voz.nivel === 1 ? 2 : 1); },
      /** Pede os próximos áudios antes de precisar deles (evita espera no clique). */
      preparar: function (itens) {
        itens = (itens || []).filter(Boolean);
        var ids = itens.map(function (it) { return it.id; }).filter(Boolean);
        if (ids.length) Audios.obter(ids).catch(function () {});
        var semId = itens.filter(function (it) { return !it.id && it.texto; });
        if (semId.length && B && B.ttsAtivo) Audios.textos(semId).catch(function () {});
      },
      vozesNavegador: function () {
        var todas = ('speechSynthesis' in window) ? window.speechSynthesis.getVoices() : [];
        var fr = todas.filter(function (v) { return /^fr/i.test(v.lang); });
        var ca = fr.filter(function (v) { return /CA/i.test(v.lang); });
        var a = ca[0] || fr[0] || null;
        return { a: a, b: fr.filter(function (v) { return v !== a; })[0] || a };
      },
      tocar: function (item, nivel) {
        var eu = Voz.token;
        nivel = nivel == null ? Voz.nivel : nivel;
        var fonte = item.id ? Audios.url(item.id) : (B && B.ttsAtivo && item.texto) ? Audios.textos([item]).then(function (r) { return r[0]; }) : null;
        if (fonte) {
          // a voz profissional pode levar alguns segundos na 1ª vez (a frase é gravada na hora): espera por ela,
          // para não trocar de voz no meio da leitura; só usa a voz do computador se o servidor falhar ou passar de 15 s
          var limite = Voz.pausa(15000).then(function () { return null; });
          return Promise.race([fonte, limite]).then(function (url) {
            if (eu !== Voz.token) return;
            if (!url) return Voz.falarNavegador(item, nivel, eu);
            return new Promise(function (resolve) {
              var a = new window.Audio(url);
              a.preservesPitch = true; a.mozPreservesPitch = true; a.webkitPreservesPitch = true;
              a.playbackRate = Voz.RITMO_ARQUIVO[nivel];
              Voz.atual = a;
              a.onended = resolve; a.onerror = resolve;
              a.play().catch(resolve);
            });
          }).catch(function () { return Voz.falarNavegador(item, nivel, eu); });
        }
        return Voz.falarNavegador(item, nivel, eu);
      },
      /** As vozes do navegador chegam aos poucos: espera até 2 s por elas antes de decidir. */
      esperarVozes: function () {
        return new Promise(function (resolve) {
          if (!('speechSynthesis' in window)) { resolve(); return; }
          if (window.speechSynthesis.getVoices().length) { resolve(); return; }
          var feito = false, fim = function () { if (!feito) { feito = true; resolve(); } };
          window.speechSynthesis.addEventListener && window.speechSynthesis.addEventListener('voiceschanged', fim);
          setTimeout(fim, 2000);
        });
      },
      /**
       * Voz do computador, SÓ se for francesa. Sem voz francesa no aparelho, não lê nada
       * (nunca uma voz portuguesa ou inglesa lendo francês) e avisa o aluno.
       */
      falarNavegador: function (item, nivel, eu) {
        return Voz.esperarVozes().then(function () {
          return new Promise(function (resolve) {
            if (!('speechSynthesis' in window) || eu !== Voz.token) { resolve(); return; }
            var v = Voz.vozesNavegador(), voz = item.segunda ? v.b : v.a;
            if (!voz || !/^fr/i.test(voz.lang)) {
              if (!Voz.avisouSemFr) {
                Voz.avisouSemFr = true;
                avisar({ titulo: 'Pas de voix française sur cet appareil', texto: 'Pour ne pas entendre le français avec un accent étranger, la lecture est désactivée ici. Utilisez Chrome ou Edge sur ordinateur, ou installez une voix française dans les réglages de votre téléphone.', icone: '', som: false, duracao: 12 });
              }
              resolve(); return;
            }
            var u = new SpeechSynthesisUtterance(item.texto);
            u.voice = voz; u.lang = voz.lang;
            u.rate = Voz.RITMO_TTS[nivel];
            u.pitch = item.segunda && v.a === v.b ? 0.8 : 1;
            u.onend = resolve; u.onerror = resolve;
            window.speechSynthesis.speak(u);
          });
        });
      },
      parar: function () {
        Voz.token++;
        if (Voz.atual) { try { Voz.atual.pause(); } catch (e) {} Voz.atual = null; }
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      },
      pausa: function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
    };
    if ('speechSynthesis' in window) window.speechSynthesis.onvoiceschanged = function () {};

    function controlesLeitor(rotulo, temAudio) {
      return '<div class="leitor"><button class="ferramenta destaque" type="button" data-leitor="tocar">▶ ' + rotulo + '</button>' +
        '<button class="ferramenta" type="button" data-leitor="parar" hidden>Arrêter</button>' +
        '<label class="velocidade">Vitesse <select data-leitor="vel"><option value="0">très lente</option><option value="1">lente</option><option value="2" selected>normale</option><option value="3">rapide</option></select></label>' +
        '<span class="fonte-audio">' + (temAudio || (B && B.ttsAtivo) ? 'Voix professionnelle, identique pour tous' : 'Voix de l\'ordinateur') + '</span></div>';
    }

    /** Lê em sequência os elementos [data-aud] visíveis, marcando o que está sendo lido. */
    function ligarLeitor(raiz, itensFn) {
      var tocar = raiz.querySelector('[data-leitor="tocar"]'), parar = raiz.querySelector('[data-leitor="parar"]');
      if (!tocar) return;
      var vel = raiz.querySelector('[data-leitor="vel"]');
      vel.value = String(Voz.nivel);
      vel.addEventListener('change', function () { Voz.nivel = Number(vel.value); });
      var fim = function () {
        tocar.hidden = false; parar.hidden = true;
        raiz.querySelectorAll('.lendo').forEach(function (x) { x.classList.remove('lendo'); });
      };
      parar.addEventListener('click', function () { Voz.parar(); fim(); });
      tocar.addEventListener('click', async function () {
        Voz.parar();
        var meu = Voz.token;
        tocar.hidden = true; parar.hidden = false;
        var itens = itensFn().filter(function (it) { return it.el && !it.el.closest('[hidden]'); });
        Voz.preparar(itens.slice(0, 4));
        for (var i = 0; i < itens.length; i++) {
          if (meu !== Voz.token) return;
          Voz.preparar([itens[i + 1], itens[i + 2], itens[i + 3]]);
          raiz.querySelectorAll('.lendo').forEach(function (x) { x.classList.remove('lendo'); });
          itens[i].el.classList.add('lendo');
          var rc = itens[i].el.getBoundingClientRect();
          if (rc.top < 80 || rc.bottom > window.innerHeight - 40) itens[i].el.scrollIntoView({ block: 'center', behavior: 'smooth' });
          await Voz.tocar(itens[i]);
          await Voz.pausa(Voz.pausaNivel(itens[i].pausa || 250));
        }
        if (meu === Voz.token) fim();
      });
    }

    function idAudio(m, i) { var ids = B.audios[m.id]; return ids ? ids[i] : null; }

    // ================= frases e dictée =================
    /** IDÊNTICA a dividirFrases_ (Audio.gs): a frase N corresponde ao áudio N. */
    function dividirFrases(texto) {
      var saida = [];
      String(texto || '').split(/\n+/).forEach(function (par) {
        var frases = [];
        var partes = par.trim().match(/[^.!?…]+(?:[.!?…]+[»")\]]*)?/g) || [];
        partes.forEach(function (p) {
          p = p.trim();
          if (!p) return;
          if (frases.length && (/^[a-zà-ÿ,;:)»]/.test(p) || !/[A-Za-zÀ-ÿ]/.test(p))) frases[frases.length - 1] += ' ' + p;
          else frases.push(p);
        });
        saida = saida.concat(frases);
      });
      return saida;
    }

    function tokens(s) {
      return (String(s).replace(/’/g, "'").match(/[A-Za-zÀ-ÿœŒ0-9]+(?:['-][A-Za-zÀ-ÿœŒ0-9]+)*|[.,;:!?…«»()"]/g) || []);
    }

    /** Compara a frase escrita com a original: { html, erros, total }. */
    function corrigir(ref, dado) {
      var a = tokens(ref), b = tokens(dado);
      var na = a.map(semAcento), nb = b.map(semAcento);
      var n = a.length, m = b.length, dp = [], i, j;
      for (i = 0; i <= n; i++) dp.push(new Array(m + 1).fill(0));
      for (i = n - 1; i >= 0; i--) for (j = m - 1; j >= 0; j--)
        dp[i][j] = na[i] === nb[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      var html = '', erros = 0, dificeis = []; i = 0; j = 0;
      while (i < n || j < m) {
        if (i < n && j < m && na[i] === nb[j]) {
          if (a[i] === b[j]) html += '<span class="d-ok">' + esc(b[j]) + '</span> ';
          else { erros++; dificeis.push(a[i]); html += '<span class="d-acc">' + esc(b[j]) + '</span><span class="d-cor">(' + esc(a[i]) + ')</span> '; }
          i++; j++;
        } else if (j < m && (i >= n || dp[i][j + 1] >= dp[i + 1][j])) {
          erros++; html += '<span class="d-extra">' + esc(b[j]) + '</span> '; j++;
        } else {
          erros++; if (/[A-Za-zÀ-ÿ]/.test(a[i])) dificeis.push(a[i]); html += '<span class="d-omis">' + esc(a[i]) + '</span> '; i++;
        }
      }
      return { html: html, erros: erros, total: n, dificeis: dificeis };
    }

    /** Painel de dictée (fica ao lado do modelo). frases = [{texto, id}] */
    function painelDictee() {
      return '<aside class="painel-dictee" id="painel-dictee" hidden><div class="bloco">' +
        '<div class="dictee-topo"><h3>Dictée</h3><button class="fechar" type="button" data-d="fechar" aria-label="Fermer la dictée">✕</button></div>' +
        '<div id="dictee"></div></div></aside>';
    }

    function ligarDictee(raiz, frases, idModelo) {
      var botoes = raiz.querySelectorAll('[data-abrir-dictee]'), painel = raiz.querySelector('#painel-dictee'), caixa = raiz.querySelector('#dictee');
      if (!painel) return;
      var atual = 0, resultados = [], conclusaoAvisada = false;
      var ler = async function (nivel) {
        Voz.parar();
        var item = frases[atual];
        await Voz.tocar(item, nivel);
        await Voz.pausa(Voz.pausaNivel(800));
        await Voz.tocar(item, nivel);
      };
      var desenhar = function () {
        var feitas = resultados.filter(Boolean);
        var pontos = feitas.reduce(function (s, r) { return s + Math.max(0, r.total - r.erros); }, 0);
        var total = feitas.reduce(function (s, r) { return s + r.total; }, 0);
        caixa.innerHTML =
          '<div class="dictee-progresso"><b>Phrase ' + (atual + 1) + ' / ' + frases.length + '</b>' +
          (total ? '<span class="contador">' + pontos + ' / ' + total + ' points</span>' : '') + '</div>' +
          '<div class="barra-prog"><i style="width:' + Math.round(100 * (atual + 1) / frases.length) + '%"></i></div>' +
          '<div class="ferramentas"><button class="ferramenta destaque" type="button" data-d="ouvir">Écouter</button>' +
          '<button class="ferramenta" type="button" data-d="lent">Très lentement</button>' +
          '<label class="velocidade">Vitesse <select data-d="vel"><option value="0">très lente</option><option value="1">lente</option><option value="2">normale</option><option value="3">rapide</option></select></label>' +
          '<button class="ferramenta" type="button" data-d="cacher" aria-pressed="' + raiz.classList.contains('texto-oculto') + '">' + (raiz.classList.contains('texto-oculto') ? 'Afficher le modèle' : 'Masquer le modèle') + '</button></div>' +
          '<textarea class="dictee-campo" spellcheck="false" autocomplete="off" placeholder="Écrivez la phrase entendue, avec la ponctuation…">' + esc((resultados[atual] && resultados[atual].dado) || '') + '</textarea>' +
          '<div class="dictee-correcao">' + (resultados[atual] ? resultados[atual].html : '') + '</div>' +
          '<div class="ferramentas" style="margin-top:10px"><button class="ferramenta" type="button" data-d="ant"' + (atual ? '' : ' disabled') + '>← Précédente</button>' +
          '<button class="ferramenta destaque" type="button" data-d="verif">Vérifier</button>' +
          '<button class="ferramenta" type="button" data-d="prox"' + (atual < frases.length - 1 ? '' : ' disabled') + '>Suivante →</button></div>' +
          '<p class="aviso">Astuce : Ctrl + Espace pour réécouter sans quitter le champ.</p>';
        var campo = caixa.querySelector('.dictee-campo');
        campo.addEventListener('paste', function (e) { e.preventDefault(); });
        campo.addEventListener('keydown', function (e) { if (e.ctrlKey && (e.code === 'Space' || e.key === ' ')) { e.preventDefault(); ler(); } });
        caixa.querySelector('[data-d="ouvir"]').onclick = function () { ler(); };
        caixa.querySelector('[data-d="lent"]').onclick = function () { ler(0); };
        var selVel = caixa.querySelector('[data-d="vel"]'); selVel.value = String(Voz.nivel);
        selVel.onchange = function () { Voz.nivel = Number(selVel.value); raiz.querySelectorAll('[data-leitor="vel"]').forEach(function (s) { s.value = selVel.value; }); };
        caixa.querySelector('[data-d="cacher"]').onclick = function () { raiz.classList.toggle('texto-oculto'); if (raiz._atualizarOcultar) raiz._atualizarOcultar(); desenhar(); };
        caixa.querySelector('[data-d="ant"]').onclick = function () { atual--; desenhar(); };
        caixa.querySelector('[data-d="prox"]').onclick = function () { atual++; desenhar(); ler(); };
        caixa.querySelector('[data-d="verif"]').onclick = function () {
          if (!campo.value.trim()) { campo.focus(); return; }
          var r = corrigir(frases[atual].texto, campo.value);
          r.dado = campo.value;
          r.html = '<div class="d-linha">' + r.html + '</div>' + (r.erros ? '<p class="aviso">Phrase correcte : « ' + esc(frases[atual].texto) + ' »</p>' : '<p class="aviso ok">Parfait ! </p>') +
            (r.dificeis.length ? '<button class="ferramenta mini-carnet" type="button" data-mots="' + esc(JSON.stringify(r.dificeis.slice(0, 8))) + '" data-frase="' + esc(frases[atual].texto) + '">Ajouter ces mots à mon cahier</button>' : '');
          resultados[atual] = r;
          desenhar();
          var bm = caixa.querySelector('[data-mots]');
          if (bm) bm.addEventListener('click', function () {
            var mots = JSON.parse(bm.dataset.mots).map(function (w) { return { mot: w, detalhe: bm.dataset.frase }; });
            bm.disabled = true;
            google.script.run.withSuccessHandler(function (n) { bm.textContent = '✓ ' + n + ' mot' + (n > 1 ? 's' : '') + ' ajouté' + (n > 1 ? 's' : '') + ' au cahier'; carregarCarnet(); }).adicionarPalavrasCarnet(EMAIL, mots);
          });
          var feitas = frases.filter(function (_, k) { return resultados[k]; }).length;
          if (feitas === frases.length && !conclusaoAvisada) {
            conclusaoAvisada = true;
            var pts = resultados.reduce(function (s2, x) { return s2 + Math.max(0, x.total - x.erros); }, 0), tot = resultados.reduce(function (s2, x) { return s2 + x.total; }, 0);
            avisar({ titulo: 'Dictée terminée : ' + pts + ' / ' + tot + ' points', texto: Math.round(100 * pts / Math.max(tot, 1)) + ' % de réussite.', icone: '', som: false });
            if (idModelo) registrarRecorde(idModelo, 'd', Math.round(100 * pts / Math.max(tot, 1)), caixa.querySelector('.dictee-correcao'));
            if (estado.devoirAtual && estado.devoirAtual.tipo === 'dictee') {
              var dv = estado.devoirAtual;
              google.script.run.withSuccessHandler(function () { dv.feito = true; avisar({ titulo: 'Devoir validé', texto: dv.titre, icone: '', som: false, duracao: 6 }); }).concluirDevoir(EMAIL, dv.id, pts, tot);
            }
          }
        };
        Voz.preparar([frases[atual], frases[atual + 1], frases[atual + 2]]);
      };
      var abrir = function (ligado) {
        botoes.forEach(function (b) { b.setAttribute('aria-pressed', String(ligado)); });
        painel.hidden = !ligado;
        raiz.classList.toggle('com-dictee', ligado);
        if (!ligado) { Voz.parar(); return; }
        if (raiz._fecharReescrita) raiz._fecharReescrita();
        desenhar();
        painel.scrollIntoView && window.innerWidth < 960 && painel.scrollIntoView({ block: 'start' });
        caixa.querySelector('.dictee-campo').focus();
      };
      botoes.forEach(function (b) { b.addEventListener('click', function () { abrir(b.getAttribute('aria-pressed') !== 'true'); }); });
      painel.querySelector('[data-d="fechar"]').addEventListener('click', function () { abrir(false); });
      raiz._fecharDictee = function () { if (!painel.hidden) abrir(false); };
    }

    // ================= esconder o texto do modelo (treino) =================
    /** Liga os botões [data-ocultar]: borra o texto; clicar numa frase borrada mostra só ela por alguns segundos. */
    function ligarOcultar(raiz) {
      var bts = raiz.querySelectorAll('[data-ocultar]');
      var atualizar = function () {
        var on = raiz.classList.contains('texto-oculto');
        bts.forEach(function (b) { b.setAttribute('aria-pressed', String(on)); b.textContent = on ? 'Afficher le texte' : 'Masquer le texte'; });
      };
      bts.forEach(function (b) { b.addEventListener('click', function () { raiz.classList.toggle('texto-oculto'); atualizar(); }); });
      raiz.addEventListener('click', function (e) {
        if (!raiz.classList.contains('texto-oculto')) return;
        var f = e.target.closest('.texto-modelo .frase');
        if (!f) return;
        f.classList.add('espiar');
        setTimeout(function () { f.classList.remove('espiar'); }, 3500);
      });
      raiz._atualizarOcultar = atualizar;
    }

    // ================= reescrita do modelo com correção =================
    var MIN_EXAME_ESCRITO = { ET1: 10, ET2: 15, ET3: 25 };
    /** Folha de resposta da reescrita, no estilo da épreuve écrite (aberta por padrão ao lado do modelo). */
    function painelReescrita(info, tache, m) {
      var min = MIN_EXAME_ESCRITO[tache] || 10;
      return '<aside class="painel-reescrita" id="painel-reescrita" hidden>' +
        '<div class="rs-cab"><div><small class="mira-marca">' + esc(nomeProva()) + ' · Expression écrite · réécriture</small><h3>' + nomeTache(tache) + ' · ' + esc(info.sous) + '</h3></div>' +
        '<div class="rs-relogio"><span class="tempo" id="rs-tempo">' + min + ':00</span><span>temps restant · ' + min + ' min</span></div>' +
        '<button class="fechar" type="button" data-r="fechar" aria-label="Fermer la feuille">✕</button></div>' +
        (m.c ? '<div class="consigne-folha rs-consigne"><p>' + esc(m.c) + '</p></div>' : '') +
        '<div class="rs-instr"><span>1. Lisez et écoutez le modèle</span><span>2. Masquez-le</span><span>3. Réécrivez-le de mémoire</span><span>4. Corrigez</span>' +
        '<button class="ferramenta" type="button" data-ocultar aria-pressed="false">Masquer le texte</button></div>' +
        // exatamente o editor da épreuve écrite (barra de formatação, linhas numeradas, folha com margens, contador)
        editorHtml(tache) +
        '<p class="rs-letras" id="rs-letras">0 lettre · 0 caractère</p>' +
        '<div class="rs-acoes"><button class="botao-principal" type="button" data-r="corrigir">Corriger ma réécriture</button>' +
        '<button class="ferramenta" type="button" data-r="limpar">Effacer</button></div>' +
        '<div id="reescrita-res" class="rs-res"></div>' + botaoIA('rascunho-ia') + '<div class="ia-resultado" id="rascunho-ia-res"></div>' + htmlEnvioSistema('rs') + '</aside>';
    }

    function distancia(a, b) {
      var m = a.length, n = b.length, d = [], i, j;
      for (i = 0; i <= m; i++) { d[i] = [i]; }
      for (j = 1; j <= n; j++) d[0][j] = j;
      for (i = 1; i <= m; i++) for (j = 1; j <= n; j++)
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      return d[m][n];
    }
    var eMarca = function (t) { return !/[A-Za-zÀ-ÿœŒ0-9]/.test(t); };

    /**
     * Compara o texto do aluno com o modelo: operações classificadas
     * ok · acc (acento) · maj (maiúscula) · orth (ortografia) · mot (palavra trocada) · omis · extra · ponct
     * e o que ficou por escrever no fim (texto não terminado).
     */
    function compararReescrita(ref, dado) {
      var a = tokens(ref), b = tokens(dado);
      var na = a.map(semAcento), nb = b.map(semAcento);
      var n = a.length, m = b.length, dp = [], i, j;
      for (i = 0; i <= n; i++) dp.push(new Int16Array(m + 1));
      for (i = n - 1; i >= 0; i--) for (j = m - 1; j >= 0; j--)
        dp[i][j] = na[i] === nb[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      var ops = []; i = 0; j = 0;
      while (i < n || j < m) {
        if (i < n && j < m && na[i] === nb[j]) {
          var t = a[i] === b[j] ? 'ok' : a[i].toLowerCase() === b[j].toLowerCase() ? 'maj' : 'acc';
          ops.push({ t: t, a: a[i], b: b[j] }); i++; j++;
        } else if (j < m && (i >= n || dp[i][j + 1] >= dp[i + 1][j])) { ops.push({ t: 'extra', b: b[j] }); j++; }
        else { ops.push({ t: 'omis', a: a[i] }); i++; }
      }
      // o que ficou sem escrever no fim não é erro: o texto só não foi terminado
      var fimEscrito = -1;
      ops.forEach(function (o, k) { if (o.t !== 'omis') fimEscrito = k; });
      var resto = ops.slice(fimEscrito + 1).filter(function (o) { return !eMarca(o.a); }).length;
      ops = ops.slice(0, fimEscrito + 1);
      // junta omissão + palavra a mais vizinhas em « palavra trocada » ou « ortografia »
      var saida = [], k = 0;
      while (k < ops.length) {
        if (ops[k].t !== 'omis' && ops[k].t !== 'extra') { saida.push(ops[k]); k++; continue; }
        var bloco = [];
        while (k < ops.length && (ops[k].t === 'omis' || ops[k].t === 'extra')) bloco.push(ops[k++]);
        var faltam = bloco.filter(function (o) { return o.t === 'omis'; }), sobram = bloco.filter(function (o) { return o.t === 'extra'; });
        var fp = faltam.filter(function (o) { return !eMarca(o.a); }), sp = sobram.filter(function (o) { return !eMarca(o.b); });
        var usadoS = [], parOrth = {};
        // 1º: palavra quase igual (ortografia), pela menor distância
        fp.forEach(function (o, x) {
          var melhor = -1, dm = 99;
          sp.forEach(function (s2, y) { if (usadoS[y]) return; var d = distancia(semAcento(o.a), semAcento(s2.b)); if (d < dm) { dm = d; melhor = y; } });
          if (melhor !== -1 && dm <= Math.max(1, Math.round(o.a.length * 0.34))) { usadoS[melhor] = true; parOrth[x] = sp[melhor]; }
        });
        var restF = fp.filter(function (o, x) { return !parOrth[x]; }), restS = sp.filter(function (s2, y) { return !usadoS[y]; });
        var juntos = function (l, k2) { return l.map(function (o) { return o[k2]; }).join(' '); };
        var bl = [], pos = function (o) { var i2 = fp.indexOf(o); return i2 === -1 ? 999 + sp.indexOf(o) : i2; };
        fp.forEach(function (o, x) { if (parOrth[x]) bl.push({ k: x, op: { t: 'orth', a: o.a, b: parOrth[x].b } }); });
        // 2º: o resto vira « mot différent » (uma palavra por várias: car → parce que)
        if (restF.length && restS.length) {
          if (restF.length === 1 || restS.length === 1) bl.push({ k: pos(restF[0]), op: { t: 'mot', a: juntos(restF, 'a'), b: juntos(restS, 'b') } });
          else {
            var nPar = Math.min(restF.length, restS.length);
            for (var x2 = 0; x2 < nPar; x2++) bl.push({ k: pos(restF[x2]), op: { t: 'mot', a: restF[x2].a, b: restS[x2].b } });
            restF.slice(nPar).forEach(function (o) { bl.push({ k: pos(o), op: o }); });
            restS.slice(nPar).forEach(function (o) { bl.push({ k: pos(o), op: o }); });
          }
        } else { restF.forEach(function (o) { bl.push({ k: pos(o), op: o }); }); restS.forEach(function (o) { bl.push({ k: pos(o), op: o }); }); }
        bl.sort(function (u, v) { return u.k - v.k; }).forEach(function (x3) { saida.push(x3.op); });
        faltam.filter(function (o) { return eMarca(o.a); }).forEach(function (o) { saida.push({ t: 'ponct', a: o.a }); });
        sobram.filter(function (o) { return eMarca(o.b); }).forEach(function (o) { saida.push({ t: 'ponct', b: o.b }); });
      }
      var palavrasRef = a.filter(function (w) { return !eMarca(w); }).length - resto;
      var certas = saida.filter(function (o) { return o.t === 'ok' && !eMarca(o.a); }).length;
      return { ops: saida, resto: resto, palavras: Math.max(palavrasRef, 0), certas: certas };
    }

    var CATS_REESCRITA = [
      { t: 'acc', nome: 'Accents', icone: '´', dica: 'Même mot, mauvais accent. Relisez é · è · ê · à · ù · ç.' },
      { t: 'orth', nome: 'Orthographe', icone: '✎', dica: 'Mot presque juste : une lettre en trop, en moins ou inversée.' },
      { t: 'mot', nome: 'Mots différents', icone: '⇄', dica: 'Vous avez utilisé un autre mot que le modèle.' },
      { t: 'omis', nome: 'Mots oubliés', icone: '＋', dica: 'Mots du modèle qui manquent dans votre texte.' },
      { t: 'extra', nome: 'Mots en trop', icone: '－', dica: 'Mots qui ne sont pas dans le modèle.' },
      { t: 'ponct', nome: 'Ponctuation', icone: '¶', dica: 'Virgules, points, guillemets : ils font partie de la correction au TCF.' },
      { t: 'maj', nome: 'Majuscules', icone: 'Aa', dica: 'Majuscule en début de phrase et aux noms propres.' }
    ];

    function relatorioReescrita(r) {
      var cont = {}; r.ops.forEach(function (o) { if (o.t !== 'ok') cont[o.t] = (cont[o.t] || 0) + 1; });
      var total = Object.keys(cont).reduce(function (s, k) { return s + cont[k]; }, 0);
      var pct = r.palavras ? Math.round(100 * r.certas / r.palavras) : 0;
      var texto = r.ops.map(function (o) {
        if (o.t === 'ok') return esc(o.b);
        if (o.t === 'omis') return '<ins class="r-omis" title="Mot oublié">' + esc(o.a) + '</ins>';
        if (o.t === 'extra') return '<del class="r-extra" title="Mot en trop">' + esc(o.b) + '</del>';
        if (o.t === 'ponct') return o.a ? '<ins class="r-omis r-ponct" title="Ponctuation oubliée">' + esc(o.a) + '</ins>' : '<del class="r-extra r-ponct" title="Ponctuation en trop">' + esc(o.b) + '</del>';
        return '<span class="r-err r-' + o.t + '"><del>' + esc(o.b) + '</del><ins>' + esc(o.a) + '</ins></span>';
      }).join(' ').replace(/ ([.,)…])/g, '$1').replace(/« /g, '« ');
      var secoes = CATS_REESCRITA.filter(function (c) { return cont[c.t]; }).map(function (c) {
        var vistos = {}, itens = [];
        r.ops.forEach(function (o) {
          if (o.t !== c.t) return;
          var k = (o.b || '') + '→' + (o.a || '');
          if (vistos[k]) { vistos[k].n++; return; }
          vistos[k] = { o: o, n: 1 }; itens.push(vistos[k]);
        });
        return '<details class="r-secao"' + (c.t === 'acc' || c.t === 'orth' || c.t === 'mot' ? ' open' : '') + '><summary><span class="r-ico r-' + c.t + '">' + c.icone + '</span><b>' + c.nome + '</b><em>' + cont[c.t] + '</em></summary>' +
          '<p class="r-dica">' + c.dica + '</p><ul>' + itens.map(function (x) {
            var o = x.o, rep2 = x.n > 1 ? ' <small>×' + x.n + '</small>' : '';
            if (c.t === 'omis' || (c.t === 'ponct' && o.a)) return '<li>Il manque <b>« ' + esc(o.a) + ' »</b>' + rep2 + '</li>';
            if (c.t === 'extra' || (c.t === 'ponct' && o.b)) return '<li>En trop : <s>« ' + esc(o.b) + ' »</s>' + rep2 + '</li>';
            return '<li><s>' + esc(o.b) + '</s> → <b>' + esc(o.a) + '</b>' + rep2 + '</li>';
          }).join('') + '</ul></details>';
      }).join('');
      var mots = [];
      r.ops.forEach(function (o) { if ((o.t === 'acc' || o.t === 'orth' || o.t === 'mot' || o.t === 'omis') && o.a && !eMarca(o.a) && mots.indexOf(o.a) === -1) mots.push(o.a); });
      return '<div class="r-relatorio"><div class="r-placar"><div class="r-pct' + (pct >= 90 ? ' bom' : pct >= 70 ? ' medio' : '') + '"><b>' + pct + '%</b><span>des mots corrects</span></div>' +
        '<div><b>' + total + '</b> erreur' + (total > 1 ? 's' : '') + ' à revoir' + (r.resto ? '<br><small>Texte non terminé : ' + r.resto + ' mots du modèle restent à écrire (ce n\'est pas compté comme erreur).</small>' : '') + '</div></div>' +
        (total ? '<div class="r-chips">' + CATS_REESCRITA.filter(function (c) { return cont[c.t]; }).map(function (c) { return '<span class="r-chip r-' + c.t + '">' + c.nome + ' <b>' + cont[c.t] + '</b></span>'; }).join('') + '</div>' : '<p class="aviso ok">Parfait : votre texte est identique au modèle ! </p>') +
        '<h4>Votre texte corrigé</h4><div class="r-texto">' + texto + '</div>' +
        '<p class="r-legenda"><span class="r-err"><del>écrit</del><ins>correct</ins></span> <ins class="r-omis">oublié</ins> <del class="r-extra">en trop</del></p>' +
        (secoes ? '<h4>Détail des erreurs</h4>' + secoes : '') +
        (mots.length ? '<button class="ferramenta mini-carnet" type="button" id="r-carnet" data-mots="' + esc(JSON.stringify(mots.slice(0, 15))) + '">Ajouter ces mots à mon cahier (' + Math.min(mots.length, 15) + ')</button>' : '') + '</div>';
    }

    function ligarReescrita(raiz, m, tache) {
      var painel = raiz.querySelector('#painel-reescrita');
      if (!painel) return;
      var ed = painel.querySelector('.editor'), res = painel.querySelector('#reescrita-res');
      var letras = painel.querySelector('#rs-letras'), relogio = painel.querySelector('#rs-tempo');
      var limite = (MIN_EXAME_ESCRITO[tache] || 10) * 60, inicio = null, tick = null, texto = '';
      // contagem regressiva, como na prova: 10 min (T1), 15 min (T2), 25 min (T3); depois disso, tempo extra em vermelho
      var mostrarTempo = function () {
        if (!relogio.isConnected) { if (tick) clearInterval(tick); tick = null; return; }
        var s = inicio ? Math.floor((Date.now() - inicio) / 1000) : 0, r = limite - s, abs = Math.abs(r);
        relogio.textContent = (r < 0 ? '+' : '') + Math.floor(abs / 60) + ':' + ('0' + abs % 60).slice(-2);
        relogio.classList.toggle('fim', r < 0);
        relogio.classList.toggle('alerta-t', r >= 0 && r <= 60);
      };
      var botoes = raiz.querySelectorAll('[data-abrir-reescrita]');
      var abrir = function (ligado) {
        botoes.forEach(function (b) { b.setAttribute('aria-pressed', String(ligado)); });
        painel.hidden = !ligado;
        raiz.classList.toggle('com-reescrita', ligado);
        if (!ligado) return;
        if (raiz._fecharDictee) raiz._fecharDictee();
        if (window.innerWidth < 1100) painel.scrollIntoView({ block: 'start' });
        ed.focus();
      };
      raiz._fecharReescrita = function () { if (!painel.hidden) abrir(false); };
      raiz._abrirReescrita = function () { if (painel.hidden) { painel.hidden = false; raiz.classList.add('com-reescrita'); botoes.forEach(function (b) { b.setAttribute('aria-pressed', 'true'); }); } };
      botoes.forEach(function (b) { b.addEventListener('click', function () { abrir(b.getAttribute('aria-pressed') !== 'true'); }); });
      painel.querySelector('[data-r="fechar"]').addEventListener('click', function () { abrir(false); });
      ligarEditor(ed, '', '', function (t) {
        texto = t;
        var l = (t.match(/[A-Za-zÀ-ÿœŒ]/g) || []).length;
        letras.textContent = l + ' lettre' + (l > 1 ? 's' : '') + ' · ' + t.length + ' caractère' + (t.length > 1 ? 's' : '');
        if (!inicio && t) { inicio = Date.now(); tick = setInterval(mostrarTempo, 1000); }
      });
      painel.querySelector('[data-r="limpar"]').addEventListener('click', function () {
        if (texto && !confirm('Effacer votre texte ?')) return;
        ed.innerHTML = ''; texto = ''; res.innerHTML = ''; inicio = null; if (tick) { clearInterval(tick); tick = null; } mostrarTempo();
        ed.dispatchEvent(new Event('input')); ed.focus();
      });
      painel.querySelector('[data-r="corrigir"]').addEventListener('click', function () {
        texto = textoDoEditor(ed);
        if (!texto.trim()) { ed.focus(); return; }
        var cmp = compararReescrita(m.p, texto);
        res.innerHTML = '<div id="r-recorde"></div>' + relatorioReescrita(cmp);
        registrarRecorde(m.id, 'r', Math.round(100 * cmp.certas / Math.max(cmp.palavras + cmp.resto, 1)), $('r-recorde'));
        var bm = res.querySelector('#r-carnet');
        if (bm) bm.addEventListener('click', function () {
          var mots = JSON.parse(bm.dataset.mots).map(function (w) { return { mot: w, detalhe: m.titre }; });
          bm.disabled = true;
          google.script.run.withSuccessHandler(function (n) { bm.textContent = n + ' mot' + (n > 1 ? 's' : '') + ' ajouté' + (n > 1 ? 's' : '') + ' au cahier'; carregarCarnet(); }).adicionarPalavrasCarnet(EMAIL, mots);
        });
        res.scrollIntoView({ block: 'start', behavior: 'smooth' });
      });
      if ($('rascunho-ia')) $('rascunho-ia').addEventListener('click', function () { pedirCorrecaoIA(tache, m.id, textoDoEditor(ed), $('rascunho-ia-res'), $('rascunho-ia')); });
      ligarEnvioSistema(raiz.querySelector('[data-envio="rs"]'), function () { return { tache: tache, sujet: m.id, texte: textoDoEditor(ed) }; });
    }


    // ================= página de um modelo =================
    // ícones de linha (SVG) no lugar de emojis: discretos e profissionais
    var ICO = {
      som: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>',
      lixo: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
      cadeado: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
      livro: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11"/></svg>',
      caneta: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20l4-1 11-11-3-3L5 16z"/></svg>',
      giro: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6"/></svg>',
      fim: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/></svg>'
    };

    // ================= proteção do conteúdo (todo o app, para alunos) =================
    /** Sem copiar, recortar, arrastar, selecionar com o mouse nem imprimir. Campos de escrita continuam livres. */
    function protegerTudo() {
      if (document.body.classList.contains('protegido-global')) return;
      document.body.classList.add('protegido-global');
      var livre = function (t) { return t && t.closest && t.closest('input, textarea, select, [contenteditable="true"]'); };
      ['copy', 'cut', 'contextmenu', 'dragstart', 'selectstart'].forEach(function (ev) {
        document.addEventListener(ev, function (e) { if (!livre(e.target)) e.preventDefault(); }, true);
      });
      document.addEventListener('keydown', function (e) {
        if (!(e.ctrlKey || e.metaKey) || livre(e.target)) return;
        if (['a', 'c', 'x', 'p', 's', 'u'].indexOf(String(e.key).toLowerCase()) !== -1) e.preventDefault();
      }, true);
    }

    // ================= Attentes du professeur =================
    var ATTENTES = {
      cap: [
        { id: 'con', n: 1, t: 'Les connecteurs logiques', s: 'Le squelette de l\'argumentation : à varier d\'un paragraphe à l\'autre', quiz: 'Connecteurs logiques' },
        { id: 'mots', n: 2, t: 'Mots simples à remplacer', s: 'Le niveau se juge autant à ce qu\'on évite qu\'à ce qu\'on emploie' },
        { id: 'gram', n: 3, t: 'Grammaire à maîtriser', s: 'Check-list des structures attendues' },
        { id: 'trad', n: 4, t: 'Pièges de traduction', s: 'Les tournures à ne jamais calquer du portugais' },
        { id: 'oral', n: 5, t: 'Formules pour l\'oral', s: 'Ouverture et clôture obligatoires de l\'exposé' },
        { id: 'avis', n: 6, t: 'Donner son avis', s: 'Varier l\'introduction de l\'opinion personnelle' },
        { id: 'voc', n: 7, t: 'Vocabulaire clé', s: 'Répertoire lexical à réactiver régulièrement', quiz: 'Expressions de l\'argumentation' },
        { id: 'plan', n: 8, t: 'Structure d\'une rédaction ou d\'un exposé', s: 'Le plan-type attendu', quiz: 'Adaptation et interculturalité' },
        { id: 'rappel', n: 9, t: 'Avant de rendre', s: 'La vérification finale, à chaque production' }
      ],
      con: [
        ['La cause', [['Parce que', '', '✓'], ['Comme', 'en début de phrase', '✓'], ['Puisque', 'cause déjà évidente pour l\'interlocuteur', '✓'], ['Car', 'pois', '♥'], ['En effet', 'de fato', '♥'], ['À cause de', 'connotation négative'], ['Grâce à', 'connotation positive']]],
        ['La conséquence', [['Alors', 'então', '✓'], ['Donc', 'portanto', '✓'], ['Par conséquent', ''], ['De sorte que', 'de modo que'], ['Si bien que', 'de modo que', '♥'], ['C\'est la raison pour laquelle', 'à l\'écrit'], ['C\'est pourquoi', '', '♥'], ['C\'est pour ça que', 'à éviter à l\'écrit soutenu', '✗']]],
        ['Le but', [['Pour faire face à cet enjeu, il est crucial que', '+ subjonctif']]],
        ['L\'opposition', [['Mais', '', '✓'], ['Par contre', 'registre neutre'], ['En revanche', 'registre soutenu'], ['Tandis que / alors que', 'comparaison']]],
        ['La concession', [['Pourtant', 'l\'écart entre l\'attendu et la réalité', '✓'], ['Néanmoins', '', '♥'], ['Cependant', ''], ['Toutefois', ''], ['Bien que', '+ subjonctif : embora'], ['Malgré', 'apesar de']]],
        ['L\'addition', [['De plus', '', '✓'], ['En plus', '', '✓'], ['En outre', '', '♥'], ['De surcroît', '', '♥'], ['D\'ailleurs', 'registre plutôt épistolaire']]]
      ],
      mots: [
        ['parler (de)', 'évoquer · il s\'agit de · qui porte sur / portant sur'],
        ['beaucoup · trop · très', 'davantage · énormément · largement · vraiment'],
        ['personnes · gens', 'individu · citoyen · consommateurs · interlocuteur · utilisateur · la société'],
        ['il(s) / elle(s) répétés', 'celui-ci / celle-ci · ce dernier · ceux qui · les partisans / les opposants'],
        ['comme (exemple)', 'tel(s) que / telle(s) que · par exemple'],
        ['chose · truc', 'article · objet · mesure · sujet · réflexion · événement · phénomène · une approche'],
        ['problème · souci', 'défi · contrainte · enjeu · trouble'],
        ['quelques', 'des / de (selon le contexte)'],
        ['seulement', 'ne + verbe + que (je ne bois que du café noir) · juste'],
        ['aussi (au sens d\'« également »)', 'également (garder « aussi » pour le comparatif : aussi… que)'],
        ['principalement', 'surtout · notamment']
      ],
      gram: ['Présent · passé composé · imparfait · plus-que-parfait · futur simple · conditionnel', 'Pronoms relatifs simples : que, qui, où, dont', 'Pronoms relatifs composés (lequel, auquel, duquel…)', 'Pronoms COD / COI', 'Pronoms EN / Y', 'Participe présent / gérondif',
        'Subjonctif (après les structures impersonnelles et de but)', '7 à 8 connecteurs logiques par paragraphe, jamais répétés', '« qui porte sur » / « portant sur » pour introduire un sujet à l\'oral',
        'Varier les démonstratifs, les possessifs et les articles indéfinis d\'une phrase à l\'autre'],
      trad: [
        ['« eu estou estudando » → je suis étudiant(e)', 'je suis en train d\'étudier', 'être (présent) + en train de + infinitif'],
        ['« acabo de acordar » traduit mot à mot', 'je viens de me réveiller', 'venir (présent) + de + infinitif : passé récent'],
        ['« eu vou lavar roupa » traduit mot à mot', 'je vais faire la lessive', 'aller (présent) + infinitif : futur proche']
      ],
      avis: [
        ['je crois / je pense que… (à chaque phrase)', 'à mes yeux… · selon moi… · d\'après moi… · à mon sens…'],
        ['à mon avis (systématique)', 'je pense / je crois + infinitif : je pense être capable de réussir'],
        ['eu acho que é importante', 'je pense qu\'il est important / je crois qu\'il est important']
      ],
      voc: ['il s\'agit de', 'aborder', 'qui porte sur / portant sur', 'évoquer', 'susciter', 'mentionner', 'saisir', 'mener à', 'aboutir à', 'cela représente', 'constituer', 'consister à', 'prendre conscience de', 'mettre en place', 'mettre en évidence', 'mettre en avant',
        'vu que', 'étant donné que', 'subir', 'face à cette réalité', 'issu(e) de', 'parvenir à', 'la hausse / l\'accroissement', 'prôner', 'remettre en question', 'axé sur / ancré dans', 'percevoir', 'le biais', 'pousser à', 'fournir / garantir',
        'la livraison', 'envisager de', 'avoir l\'intention de', 'toucher (concerner)', 'répandu', 'constater', 'une approche', 'incontournable', 'dû à', 'demeurer', 'surmonter', 'franchir'],
      loc: ['apparemment', 'effectivement', 'notamment / surtout', 'nuire à / nuisible', 'au-delà de', 'forcément', 'c\'est-à-dire', 'par rapport à', 'à l\'égard de', 'en ce qui concerne', 'voire', 'quoique', 'cibler', 'lors de / lorsque',
        'or', 'permettant ainsi', 'ainsi que', 'davantage', 'à l\'instar de', 'autrefois', 'en guise de', 'en raison de', 'désormais ♥', 'plutôt que', 'constamment', 'à plusieurs reprises', 'certes', 'une tranche d\'âge', 'pourvu que', 'à défaut de', 'à cet égard'],
      rappel: ['J\'ai varié mes connecteurs logiques (7 à 8 par paragraphe, jamais répétés).', 'J\'ai remplacé les mots trop simples (gens, chose, beaucoup, problème…).', 'J\'ai utilisé au moins un subjonctif après « il est important / urgent / crucial que ».',
        'J\'ai évité les tournures calquées du portugais (« estar fazendo », « acabar de »…).', 'À l\'oral, j\'ai suivi la formule d\'ouverture et de clôture.', 'J\'ai varié les formules d\'opinion (selon moi, à mes yeux, d\'après moi…).']
    };
    var ORAL_ABRE = 'Bonjour Madame, aujourd\'hui j\'aborderai un sujet très intéressant qui porte sur [le sujet]. Alors, selon moi, c\'est une discussion actuelle qui suscite, en effet, encore de nombreux débats.';
    var ORAL_FECHA = 'Je vous remercie, Madame, de votre attention. Avez-vous des questions ?';

    function abrirAttentes(focoId) {
      if (!B) return;
      var tela = $('tela-hub'), partes = [PARTE_ACCUEIL(), { rotulo: 'Attentes du professeur' }], A = ATTENTES;
      var selo = function (s) { return s === '✓' ? '<i class="at-selo ess" title="Essentiel">✓</i>' : s === '♥' ? '<i class="at-selo fav" title="Préféré de la professeure">♥</i>' : s === '✗' ? '<i class="at-selo evit" title="À éviter à l\'écrit">✗</i>' : ''; };
      var quiz = function (c) { return c.quiz && temModulo('VOCAB') ? '<button class="ferramenta at-quiz" type="button" data-at-quiz="' + esc(c.quiz) + '">S\'entraîner avec le quiz</button>' : ''; };
      var cab = function (c) { return '<header class="at-cab"><span class="at-num">' + c.n + '</span><div><h2>' + esc(c.t) + '</h2><p>' + esc(c.s) + '</p></div>' + quiz(c) + '</header>'; };
      var marcados = lerLocal('fnm_rappel_' + EMAIL, {});
      var corpo = {
        con: '<div class="at-destaque">Objectif : <b>7 à 8 connecteurs logiques par paragraphe</b> au minimum, et <b>jamais deux fois le même</b> dans un texte.</div><div class="at-con">' +
          A.con.map(function (g) { return '<div class="at-grupo"><h4>' + esc(g[0]) + '</h4><ul>' + g[1].map(function (x) { return '<li><b>' + esc(x[0]) + '</b>' + selo(x[2]) + (x[1] ? '<small>' + esc(x[1]) + '</small>' : '') + '</li>'; }).join('') + '</ul></div>'; }).join('') + '</div>',
        mots: '<p>Chaque fois qu\'un de ces mots vient à l\'esprit, cherchez réflexivement l\'alternative.</p><table class="at-tab"><thead><tr><th>✗ Éviter</th><th>✓ Préférer</th></tr></thead><tbody>' +
          A.mots.map(function (x) { return '<tr><td class="evitar">' + esc(x[0]) + '</td><td>' + esc(x[1]) + '</td></tr>'; }).join('') + '</tbody></table>' +
          '<div class="at-box"><h4>« C\'est » ou « il est » ?</h4><p><b>C\'est</b> introduit un commentaire générique ou une identification. <b>Il est</b> (impersonnel) sert aux jugements de valeur et aux recommandations.</p>' +
          '<p class="at-formula">Il est important / évident / urgent / crucial / essentiel <b>que + subjonctif</b></p><ul><li>Il faut + infinitif : <i>il faut étudier davantage.</i></li><li>Il faut que + subjonctif : <i>il faut que le gouvernement fasse…</i></li></ul></div>',
        gram: '<ul class="at-check">' + A.gram.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>',
        trad: '<p>Le français n\'exprime pas la simultanéité, le passé récent ou le futur proche comme le portugais : utilisez les structures dédiées.</p><table class="at-tab"><thead><tr><th>✗ Calque du portugais</th><th>✓ En français</th></tr></thead><tbody>' +
          A.trad.map(function (x) { return '<tr><td class="evitar">' + esc(x[0]) + '</td><td><b>' + esc(x[1]) + '</b><small>' + esc(x[2]) + '</small></td></tr>'; }).join('') + '</tbody></table>' +
          '<p class="at-ex">Exemples : <i>Il est nécessaire de créer de nouvelles mesures. · Il faut savoir vivre. · Il est préconisé que le gouvernement crée de nouvelles lois d\'inclusion.</i></p>',
        oral: '<div class="at-formula-bloco"><h4>1. Ouverture <button class="ferramenta sutil" type="button" data-at-ouvir="abre">' + ICO.som + '</button></h4><p>Bonjour Madame / Monsieur, aujourd\'hui <b>je présenterai / j\'aborderai</b> un sujet très intéressant / polémique / urgent / paradoxal <b>qui porte sur / portant sur</b> « [sujet] ». Alors, <b>selon moi</b>, c\'est une discussion actuelle qui <b>suscite</b>, en effet, encore de nombreux débats…</p></div>' +
          '<h4>Structure attendue de l\'exposé</h4><ol class="at-passos"><li><b>Description</b> : de quoi s\'agit-il, quel est le rôle social du sujet</li><li><b>Arguments</b> pour et contre</li><li><b>Un argument avec une solution</b> (au subjonctif)</li><li><b>Conclusion</b> : argument de synthèse ou anecdote</li></ol>' +
          '<div class="at-formula-bloco"><h4>2. Clôture <button class="ferramenta sutil" type="button" data-at-ouvir="fecha">' + ICO.som + '</button></h4><p>Je vous remercie, Madame / Monsieur, de votre attention. <b>Avez-vous des questions ?</b></p></div>',
        avis: '<table class="at-tab"><thead><tr><th>✗ Éviter (trop répété)</th><th>✓ Préférer</th></tr></thead><tbody>' + A.avis.map(function (x) { return '<tr><td class="evitar">' + esc(x[0]) + '</td><td>' + esc(x[1]) + '</td></tr>'; }).join('') + '</tbody></table>' +
          '<ul><li><b>c\'est / ce sont</b> : commentaire générique, identification (registre neutre)</li><li><b>il est important / évident / urgent / crucial que</b> : recommandation formelle</li></ul>',
        voc: '<h4>Verbes et expressions pour nuancer, introduire ou illustrer</h4><div class="at-chips">' + A.voc.map(function (x) { return '<span>' + esc(x) + '</span>'; }).join('') + '</div>' +
          '<h4>Adverbes, connecteurs et locutions de précision</h4><div class="at-chips">' + A.loc.map(function (x) { return '<span>' + esc(x) + '</span>'; }).join('') + '</div>' +
          (temModulo('VOCAB') ? '<p class="aviso">Chaque mot est dans le Vocabulaire, avec sa traduction, son origine latine et un exemple. <button class="ferramenta" type="button" data-at-quiz="Adverbes et locutions">Quiz des adverbes et locutions</button></p>' : ''),
        plan: '<ol class="at-passos"><li><b>Introduction</b></li><li><b>Mon avis</b></li><li><b>Rôle / définition</b> du sujet</li><li><b>Les droits</b> concernés</li><li><b>Conséquences</b> (« mener à… »)</li><li><b>Anecdote</b> ou exemple concret</li></ol>' +
          '<div class="at-box"><h4>Exemple d\'anecdote</h4><p><i>Donc, à mes yeux, cela est inconcevable : le sujet obéit à une logique du profit plutôt qu\'à celle d\'un droit. À l\'instar du musée du Louvre, tous les musées devraient offrir une journée gratuite au moins une fois par semaine. En outre…</i></p></div>' +
          '<div class="at-box"><h4>Exemple travaillé : l\'intégration linguistique</h4><p><i>C\'est pourquoi il est essentiel d\'acquérir des compétences linguistiques visant l\'intégration sociale, culturelle, politique et professionnelle au sein de la communauté locale. En effet, la maîtrise de la langue locale nous permet de mieux jouir de nos droits et de nos devoirs en tant que citoyen ou qu\'immigrant.</i></p>' +
          '<p><i>Sans la maîtrise de la langue locale, nous sommes désormais exposés aux injustices sociales, ce qui mène ainsi à de grandes difficultés d\'intégration au sein de la communauté locale.</i></p></div>' +
          '<div class="at-box at-assoc"><h4>Vocabulaire associé</h4><p>s\'adapter à une nouvelle réalité · aux codes sociaux · aux codes vestimentaires · aux codes alimentaires · s\'adapter à une nouvelle culture, à une nouvelle langue · élargir ses centres d\'intérêt · acquérir de nouvelles compétences linguistiques · développer de nouveaux savoir-faire et savoir-vivre · multiculturel · pluriethnique</p></div>',
        rappel: '<p>Cochez avant de rendre une rédaction ou de passer à l\'oral. Vos coches restent sur cet appareil.</p><div class="at-rappel">' +
          A.rappel.map(function (x, k) { return '<label class="pm-linha' + (marcados[k] ? ' on' : '') + '"><input type="checkbox" data-rap="' + k + '"' + (marcados[k] ? ' checked' : '') + '><span class="lib-box"></span><span class="pm-tit">' + esc(x) + '</span></label>'; }).join('') +
          '</div><button class="ferramenta" type="button" id="at-rap-zero">↺ Tout décocher</button>'
      };
      tela.innerHTML = trilha(partes) + '<div class="bloco at-capa"><div class="mira-faixa"></div><div class="mira-res-topo"><span class="mira-alvo" aria-hidden="true"></span><div><small class="mira-marca">Français na Mira · guide</small><h1 class="titulo-pagina" style="margin:0">Attentes du professeur</h1></div></div>' +
        '<p class="intro">Tout ce que votre professeure attend de vos productions écrites et orales, en un seul endroit : les connecteurs, les mots à remplacer, la grammaire, les pièges de traduction et les formules.</p>' +
        '<div class="at-legenda"><span><i class="at-selo ess">✓</i> essentiel</span><span><i class="at-selo fav">♥</i> préféré de la professeure</span><span><i class="at-selo evit">✗</i> à éviter à l\'écrit</span></div>' +
        '<div class="at-chaves"><div><b>7 à 8</b><span>connecteurs par paragraphe</span></div><div><b>0</b><span>connecteur répété</span></div><div><b>1+</b><span>subjonctif par production</span></div></div>' +
        '<nav class="at-indice">' + A.cap.map(function (c) { return '<button type="button" data-at-ir="' + c.id + '"><span>' + c.n + '</span>' + esc(c.t) + '</button>'; }).join('') + '</nav></div>' +
        A.cap.map(function (c) { return '<section class="bloco at-cap" id="at-' + c.id + '">' + cab(c) + corpo[c.id] + '</section>'; }).join('');
      ligarTrilha(tela, partes);
      tela.querySelectorAll('[data-at-ir]').forEach(function (b) { b.addEventListener('click', function () { var s = $('at-' + b.dataset.atIr); if (s) s.scrollIntoView({ behavior: 'smooth', block: 'start' }); }); });
      tela.querySelectorAll('[data-at-quiz]').forEach(function (b) { b.addEventListener('click', function () { VOC_SEL = {}; VOC_SEL[b.dataset.atQuiz] = true; abrirVocab(); }); });
      tela.querySelectorAll('[data-at-ouvir]').forEach(function (b) { b.addEventListener('click', function () { falar({ texto: b.dataset.atOuvir === 'abre' ? ORAL_ABRE : ORAL_FECHA }); }); });
      tela.querySelectorAll('[data-rap]').forEach(function (cb) { cb.addEventListener('change', function () { marcados[cb.dataset.rap] = cb.checked; gravarLocal('fnm_rappel_' + EMAIL, marcados); cb.closest('.pm-linha').classList.toggle('on', cb.checked); }); });
      $('at-rap-zero').addEventListener('click', function () { marcados = {}; gravarLocal('fnm_rappel_' + EMAIL, {}); abrirAttentes('rappel'); });
      mostrar('tela-hub');
      if (focoId && $('at-' + focoId)) $('at-' + focoId).scrollIntoView({ block: 'start' }); else window.scrollTo(0, 0);
    }

    // ================= Introduction personnelle (link próprio de cada aluno) =================
    function linkPreview(u) {
      var m = String(u).match(/docs\.google\.com\/(document|presentation|spreadsheets)\/d\/([\w-]+)/);
      if (m) return 'https://docs.google.com/' + m[1] + '/d/' + m[2] + '/preview';
      var f = String(u).match(/drive\.google\.com\/file\/d\/([\w-]+)/) || String(u).match(/[?&]id=([\w-]+)/);
      if (f) return 'https://drive.google.com/file/d/' + f[1] + '/preview';
      return '';
    }
    function abrirIntro() {
      if (!B) return;
      var tela = $('tela-hub'), partes = [PARTE_ACCUEIL(), { rotulo: 'Introduction personnelle' }], u = B.introLink || '', pv = linkPreview(u);
      tela.innerHTML = trilha(partes) + '<div class="bloco intro-pagina"><div class="mira-faixa"></div><div class="mira-res-topo"><span class="mira-alvo" aria-hidden="true"></span><div><small class="mira-marca">Français na Mira</small><h1 class="titulo-pagina" style="margin:0">Mon introduction personnelle</h1></div></div>' +
        (u ? '<p class="intro">Votre présentation personnelle, préparée avec votre professeure : c\'est la base de la Tâche 1 de l\'oral (« Présentez-vous »). Relisez-la, écoutez-vous et entraînez-vous à la dire sans lire.</p>' +
          '<p><a class="botao-principal" style="display:inline-block;width:auto;padding:13px 26px;text-decoration:none" href="' + esc(u) + '" target="_blank" rel="noopener">Ouvrir mon introduction</a></p>' +
          (pv ? '<div class="intro-doc"><iframe src="' + esc(pv) + '" title="Mon introduction personnelle" loading="lazy"></iframe></div>' : '')
          : '<p class="aviso">Votre professeure n\'a pas encore ajouté votre introduction personnelle. Elle apparaîtra ici dès qu\'elle sera prête.</p>') + '</div>';
      ligarTrilha(tela, partes);
      mostrar('tela-hub'); window.scrollTo(0, 0);
    }

    var CACHE_MODELOS = {};
    function abrirModelo(tache, id, origem) {
      var manual = lista(tache).filter(function (x) { return x.id === id; })[0];
      if (manual) { renderizarModelo(tache, manual, origem); return; }
      mostrar('tela-modele');
      var chaveM = tache + '|' + id;
      if (CACHE_MODELOS[chaveM]) { renderizarModelo(tache, CACHE_MODELOS[chaveM], origem); return; }
      $('tela-modele').innerHTML = '<p class="vazio">Chargement du sujet…</p>';
      google.script.run.withSuccessHandler(function (r) {
        if (r.modelo && !r.modelo.guia) CACHE_MODELOS[chaveM] = r.modelo;
        if (r.bloqueado) telaBloqueada(tache, r.sujet);
        else if (r.modelo) renderizarModelo(tache, r.modelo, origem);
        else telaGerarModelo(tache, id, r, origem);
      }).withFailureHandler(function (e) { $('tela-modele').innerHTML = '<p class="vazio erro">' + esc(e.message || e) + '</p>'; })
        .obterModeleIA(EMAIL, tache, id);
    }

    function telaBloqueada(tache, sj) {
      var e = eixo(sj.e);
      var partes = [PARTE_ACCUEIL(), { rotulo: nomeTache(tache), fn: function () { abrirLista(tache, true); } }, { rotulo: '' + e.nome }];
      $('tela-modele').innerHTML = trilha(partes) + '<div class="bloco trancado-bloco"><div class="cadeado">' + ICO.cadeado + '</div><h2>Axe « ' + esc(e.nome) + ' » verrouillé</h2>' +
        '<p>Les modèles de cet axe ne sont pas encore ouverts pour vous. Demandez la clé à votre professeur(e), puis saisissez-la ici.</p>' +
        '<div class="chave-campo"><input id="chave-input2" placeholder="Clé de l\'axe" autocomplete="off"><button class="ferramenta destaque" type="button" id="chave-bt2">Débloquer</button></div><p class="aviso" id="chave-msg2"></p>' +
        '<p class="aviso">Sujet : ' + esc(sj.t) + '</p></div>' +
        '<nav class="rodape-nav"><button class="ferramenta" type="button" data-ir="lista">← Retour</button><button class="ferramenta" type="button" data-ir="accueil">Accueil</button></nav>';
      var tela = $('tela-modele');
      ligarTrilha(tela, partes);
      tela.querySelector('[data-ir="lista"]').addEventListener('click', function () { abrirLista(tache, true); });
      tela.querySelector('[data-ir="accueil"]').addEventListener('click', irAccueil);
      $('chave-bt2').addEventListener('click', function () {
        $('chave-msg2').textContent = 'Vérification…';
        google.script.run.withSuccessHandler(function (r) {
          recarregarBanco(function () { avisar({ titulo: 'Axe débloqué', texto: r.nome, icone: '', som: false }); abrirModelo(tache, sj.id); });
        }).withFailureHandler(function (e2) { $('chave-msg2').textContent = '' + (e2.message || e2); }).desbloquearEixo(EMAIL, $('chave-input2').value);
      });
    }

    /** Recarrega os dados depois de desbloquear um eixo. */
    function recarregarBanco(cb) {
      google.script.run.withSuccessHandler(function (banco) {
        B = banco; aplicarPerfil(); B.audios = B.audios || {}; LISTAS = {}; prepararDestaques(); cb();
      }).obterBanco(EMAIL);
    }

    /** Tema ainda sem modelo: mostra a consigne e gera o modelo com a IA (uma única vez, para todos). */
    function telaGerarModelo(tache, id, r, origem) {
      var sj = r.sujet, e = eixo(sj.e);
      var partes = [PARTE_ACCUEIL(), { rotulo: nomeTache(tache), fn: function () { abrirLista(tache, true); } }, { rotulo: tituloCurto(sj.t) }];
      var html = trilha(partes) + '<div class="etiquetas"><span class="etiqueta">' + nomeTache(tache) + ' · ' + TACHES[tache].sous + '</span>' +
        '<span class="etiqueta eixo" style="--cor:' + e.cor + '">' + e.icone + ' ' + esc(e.nome) + '</span>' + (sj.f > 1 ? '<span class="etiqueta">tombé ' + sj.f + ' fois</span>' : '') + '</div>' +
        '<h1 class="modele-titulo">' + esc(tituloCurto(sj.t)) + '</h1>' +
        '<div class="bloco consigne"><h3>' + (tache === 'T3' ? 'Sujet' : 'Consigne') + '</h3><p>' + esc(sj.t) + '</p></div>' +
        (sj.d1 ? '<div class="bloco"><div class="docs"><div class="doc"><h4>Document 1</h4><p>' + esc(sj.d1) + '</p></div><div class="doc"><h4>Document 2</h4><p>' + esc(sj.d2) + '</p></div></div></div>' : '');
      if (r.podeGerar && r.iaAtiva) {
        html += '<div class="bloco gerar-bloco"><h3>Modèle Français na Mira</h3><p>Ce sujet n\'a pas encore de modèle. L\'IA va le rédiger en suivant la trame, les connecteurs et la méthode Français na Mira' +
          (tache.indexOf('ET') === 0 ? ', dans la limite de mots de la tâche' : ', avec le contexte culturel et social du sujet') + '. Il sera ensuite disponible pour tous les élèves, avec l\'audio.</p>' +
          '<button class="botao-ia" type="button" id="gerar-modelo"><span class="ia-brilho"></span>Rédiger le modèle<small>environ 30 à 60 secondes</small></button><div id="gerar-status"></div></div>';
      } else {
        html += '<div class="bloco"><p class="aviso" style="margin:0">Le modèle de ce sujet sera bientôt disponible. En attendant, entraînez-vous avec la consigne et le chronomètre.</p>' +
          (B.professor ? '<p class="alerta" style="margin:10px 0 0">Professeure : ce message signifie que la version publiée de l\'application est ancienne (sans les modèles-guides). Publiez une nouvelle version : Implanter → Gérer les implantations → → Version : « Nouvelle version » → Implanter.</p>' : '') + '</div>';
      }
      html += '<nav class="rodape-nav"><button class="ferramenta" type="button" data-ir="lista">← Retour</button><button class="ferramenta" type="button" data-ir="accueil">Accueil</button></nav>';
      var tela = $('tela-modele');
      tela.innerHTML = html;
      ligarTrilha(tela, partes);
      tela.querySelector('[data-ir="lista"]').addEventListener('click', function () { abrirLista(tache, true); });
      tela.querySelector('[data-ir="accueil"]').addEventListener('click', irAccueil);
      var bt = $('gerar-modelo');
      var autoGerar = bt && (tache === 'T3' || tache === 'ET3');
      if (bt) bt.addEventListener('click', function () {
        bt.disabled = true;
        $('gerar-status').innerHTML = '<div class="ia-carregando"><i></i><i></i><i></i><span>Rédaction du modèle selon la trame Français na Mira…</span></div>';
        google.script.run.withSuccessHandler(function (m) {
          (LISTAS[tache] || []).forEach(function (x) { if (x.id === id) x.tipo = 'ia'; });
          renderizarModelo(tache, m, origem);
        }).withFailureHandler(function (e) {
          bt.disabled = false;
          $('gerar-status').innerHTML = '<div class="alerta">' + esc(e.message || e) + '</div>';
        }).gerarModeloIA(EMAIL, tache, id);
      });
      // Tâche 3 (oral e escrita): o modelo desenvolvido é preparado sem precisar clicar.
      if (autoGerar) bt.click();
    }

// Página do sujet, na ordem de estudo: título → « Faire ce sujet » (cronômetro, correção, escrita
    // ou gravação, professor ao vivo) → Sujet (enunciado, documentos, dossiê de leitura com imagem)
    // → Pistes pour compléter (dicas + trame) → Réponse modèle (legenda ao lado). Pistas e modelo ficam
    // sempre abertos; o ditado não aparece nesta página.
    function renderizarModelo(tache, m, origem) {
      origem = origem || { tipo: 'liste' };
      if (origem.tipo === 'atelier') origem.tipo = 'modeles-page';
      var pagPart = origem.tipo === 'dictee-page' || origem.tipo === 'modeles-page';
      var noAtelier = pagPart && !!m.atelier;
      var itens = noAtelier ? (B.atelier || []) : listaNav(tache);
      var pos = -1;
      itens.forEach(function (x, i) { if (x.id === m.id) pos = i; });
      estado.origem = origem;
      var info = TACHES[tache], e = eixo(m.e), oral = tache.indexOf('ET') !== 0;
      var sorteio = origem.tipo === 'sorteio';
    
      var partes = [PARTE_ACCUEIL()];
      if (origem.tipo === 'dictee-page') partes.push({ rotulo: 'Dictée', fn: abrirDicteePage });
      else if (origem.tipo === 'modeles-page') partes.push({ rotulo: 'Modèles de production écrite', fn: abrirModelesEcrits });
      else if (origem.tipo === 'carnet') partes.push({ rotulo: 'Mon espace', fn: abrirCarnet });
      else if (origem.tipo === 'devoir') partes.push({ rotulo: 'Mon espace', fn: abrirTarefas });
      else if (origem.tipo === 'eixo' || (sorteio && origem.de === 'eixo')) partes.push({ rotulo: e.icone + ' ' + e.nome, fn: function () { abrirEixo(m.e); } });
      else partes.push({ rotulo: nomeTache(tache), fn: function () { abrirLista(tache, true); } });
      partes.push({ rotulo: m.titre });
    
      // Peças do script, montadas e redistribuídas nos blocos da nova ordem.
      var corpo = tache === 'T2' ? corpoDialogo(m) : (tache === 'T3' || tache === 'T1') ? corpoT3(m, tache) : corpoEscrito(m, tache);
      var tmp = document.createElement('div');
      tmp.innerHTML = corpo;
      var tirar = function (sel) { var el = tmp.querySelector(sel); if (el) el.remove(); return el ? el.outerHTML : ''; };
      var htmlCrono = tirar('.crono-bloco'), htmlContexto = tirar('.contexto'), htmlGravador = tirar('.gravador-livre');
      tmp.querySelectorAll('[data-abrir-dictee]').forEach(function (b) { b.remove(); });   // sem ditado nesta página
      var htmlDocsModelo = '';
      Array.prototype.slice.call(tmp.querySelectorAll('.bloco')).forEach(function (b) {
        if (b.querySelector('.docs') && !b.classList.contains('modelo-conteudo')) { htmlDocsModelo = b.querySelector('.docs').outerHTML; b.remove(); }
      });
      Array.prototype.slice.call(tmp.children).forEach(function (p) { if (p.tagName === 'P' && /tombé/.test(p.textContent)) p.remove(); });
      var htmlModelo = tmp.innerHTML;
      var lat = document.createElement('div');
      lat.innerHTML = lateral(m, tache);
      var blocosLat = lat.querySelectorAll('.lateral > .bloco');
      var htmlLegenda = blocosLat[0] ? blocosLat[0].outerHTML : '', htmlVocab = '', htmlTrame = '';
      for (var bi = 1; bi < blocosLat.length; bi++) { if (blocosLat[bi].querySelector('.trame-lista')) htmlTrame = blocosLat[bi].outerHTML; else htmlVocab += blocosLat[bi].outerHTML; }
    
      var html = trilha(partes);
      if (sorteio) {
        html += '<div class="faixa-sorteio"><span>Sujet tiré au sort' + (origem.eixo ? ' · ' + esc(eixo(origem.eixo).nome) : '') +
          (origem.reiniciou ? ' · tous les sujets avaient déjà été tirés, on recommence' : '') + '</span>' +
          '<button class="botao-sorteio" type="button" data-nav="sortear">Un autre sujet</button></div>';
      }
      html += '<div class="modele-grade modele-raiz tm-pagina" id="modele-raiz"><div class="coluna-principal">';
      html += '<header class="tm-cab"><div class="etiquetas"><span class="etiqueta">' + nomeTache(tache) + ' · ' + info.sous + '</span>' +
        '<span class="etiqueta eixo" style="--cor:' + e.cor + '">' + e.icone + ' ' + esc(e.nome) + '</span>' +
        (m.reg ? '<span class="etiqueta">' + (m.reg === 'tu' ? 'Registre familier (tu)' : 'Registre formel (vous)') + '</span>' : '') +
        (m.f > 1 ? '<span class="etiqueta">tombé ' + m.f + ' fois</span>' : '') + '</div>' +
        '<h1 class="modele-titulo">' + esc(m.titre) + '</h1>' +
        '<div class="tm-acoes"><button class="tm-fazer-bt" type="button" id="tm-fazer-bt"><span class="tm-play">▶</span><span><b>Faire ce sujet</b><small>Lance le chronomètre et ouvre ' + (oral ? 'l\'enregistrement' : 'la feuille de réponse') + '</small></span></button>' +
        '<button class="botao-cahier' + (CARNET_IDS[m.id] ? ' marcado' : '') + '" type="button" id="bt-carnet">' +
        (CARNET_IDS[m.id] ? 'Enregistré dans mon cahier <small>toucher pour retirer</small>' : 'Enregistrer dans mon cahier <small>pour le réviser plus tard (dictée, oral, écrit)</small>') + '</button>' +
        (B.professor ? '<button class="ferramenta" type="button" id="bt-devoir">Proposer en devoir</button><button class="ferramenta" type="button" id="bt-partilhar">Partager ce modèle</button>' : '') + '</div>' +
        (B.professor ? '<div id="painel-partilha" hidden></div>' : '') + '</header>';
      if (origem && origem.tipo === 'devoir') {
        var dv = origem.devoir;
        html += '<div class="faixa-devoir"><div><b>Devoir : ' + esc(dv.tipoNome) + '</b>' + (dv.mensagem ? '<span>« ' + esc(dv.mensagem) + ' »</span>' : '') + '</div>' +
          (dv.feito ? '<em>✓ Fait' + (dv.score !== '' ? ' · ' + dv.score + '/' + dv.total : '') + '</em>' : dv.tipo === 'dictee' ? '<em>Terminez la dictée : le devoir sera validé automatiquement.</em>' : '<button class="ferramenta destaque" type="button" id="bt-devoir-feito">✓ J\'ai terminé</button>') + '</div>';
      }
    
      // Faire ce sujet (aparece ao clicar no botão do topo)
      html += '<section class="tm-bloco tm-fazer" id="tm-fazer" hidden><div class="tm-bloco-cab"><span class="tm-num">✎</span><div><h2>Faire ce sujet</h2><p>Choisissez qui corrigera votre production, puis ' + (oral ? 'enregistrez-vous' : 'écrivez') + '. Vous pouvez ouvrir les pistes et le modèle en même temps.</p></div></div>' +
        htmlCrono + htmlEscolhaFazer(oral) + '<div id="tm-aovivo" hidden></div>' +
        (oral ? htmlGravador : '<div class="tm-escrita">' + editorHtml(tache) + '<div class="tm-escrita-acoes"><button class="botao-principal" type="button" id="tm-enviar">Faire corriger</button><span class="aviso" id="tm-enviar-st"></span></div><div class="ia-resultado" id="tm-ia-res"></div></div>') +
        '</section>';
    
      // 1. Sujet
      html += '<section class="tm-bloco tm-sujet"><div class="tm-bloco-cab"><span class="tm-num">1</span><div><h2>' + (tache === 'T3' || tache === 'T1' ? 'Sujet' : 'Consigne') + '</h2><p>Lisez le sujet et les documents pour bien comprendre le thème avant de commencer.</p></div></div>' +
        (m.c ? '<div class="bloco consigne"><p>' + esc(m.c) + '</p></div>' : '') +
        (m.d1 ? '<div class="docs"><div class="doc"><h4>Document 1</h4><p>' + destacar(m.d1, m.k) + '</p></div><div class="doc"><h4>Document 2</h4><p>' + destacar(m.d2, m.k) + '</p></div></div>' : htmlDocsModelo) +
        '<div class="tm-dossier" id="tm-dossier"><p class="aviso">Chargement des lectures sur le thème…</p></div></section>';
      if (sorteio) html += '<div class="bloco revelar"><p>Préparez-vous avec la consigne et le chronomètre, puis découvrez le modèle.</p><button class="botao-principal" type="button" data-nav="revelar">Voir le modèle</button></div>';
    
      // 2. Pistes (dicas) + trame, ao clicar
      var pistas = '';
      if (m.guia && m.pistes && (m.pistes.pour.length || m.pistes.docs.length)) pistas += '<div class="bloco guia-pistes">' +
        (m.pistes.docs.length ? '<p><b>Dans les documents :</b> ' + m.pistes.docs.map(function (d) { return '« ' + esc(d) + ' »'; }).join(' · ') + '</p>' : '') +
        (m.pistes.pour.length ? '<p><b>Arguments possibles pour :</b> ' + m.pistes.pour.map(esc).join(' · ') + '</p>' : '') +
        (m.pistes.contre.length ? '<p><b>Arguments possibles contre :</b> ' + m.pistes.contre.map(esc).join(' · ') + '</p>' : '') + '</div>';
      else if (e.argumentsPour) pistas += '<div class="bloco guia-pistes"><p><b>Arguments possibles pour :</b> ' + e.argumentsPour.map(esc).join(' · ') + '</p>' +
        '<p><b>Arguments possibles contre :</b> ' + (e.argumentsContre || []).map(esc).join(' · ') + '</p></div>';
      html += '<section class="tm-bloco tm-dicas" id="tm-dicas"><div class="tm-bloco-cab"><span class="tm-num">2</span><div><h2>Pistes pour compléter</h2><p>Idées, contexte, vocabulaire clé et la trame de la tâche.</p></div></div>' +
        '<div class="tm-dicas-corpo">' + pistas + htmlContexto + htmlVocab + htmlTrame + '</div></section>';
    
      // 3. Réponse modèle (+ légende ao lado), ao clicar
      // No sorteio o modelo só aparece depois de « Voir le modèle ».
      html += '<section class="tm-bloco tm-modele" id="tm-modele"' + (sorteio ? ' hidden' : '') + '><div class="tm-bloco-cab"><span class="tm-num">3</span><div><h2>Réponse modèle</h2><p>' +
        (oral ? 'Le modèle avec l\'audio, à écouter, masquer et répéter.' : 'La production modèle commentée, à lire, écouter et réécrire.') + '</p></div></div>';
      if (m.guia) html += '<div class="guia-faixa"><b>Modèle-guide</b><span>Construit avec la trame et les formules Français na Mira pour ce sujet : complétez les parties entre [crochets] avec vos idées.' +
        (B.professor ? ' La version entièrement rédigée apparaîtra ici dès qu\'elle sera générée (Espace professeur → Modèles de tous les sujets).' : '') + '</span>' +
        (B.professor ? '<button class="ferramenta destaque" type="button" id="bt-redigir-ia">Rédiger la version complète</button>' : '') + '</div>';
      else if (m.gerado) html += '<p class="aviso selo-gerado">Modèle rédigé par l\'IA selon la méthode Français na Mira</p>';
      html += '<div class="tm-modele-grade"><div class="tm-modele-corpo">' + htmlModelo + '</div><aside class="lateral tm-legenda">' + htmlLegenda + '</aside></div></section>';
    
      html += navegacaoRodape(pos, itens.length);
      html += '</div>' + '<div hidden>' + painelDictee() + '</div>' +(/^ET/.test(tache) ? painelReescrita(info, tache, m) : '') + '</div>';
    
      var tela = $('tela-modele');
      tela.innerHTML = html;
      ligarTrilha(tela, partes);
      var raiz = $('modele-raiz');
      ligarDicas(raiz);
      if (!B.professor) protegerConteudo(raiz);
      $('bt-carnet').addEventListener('click', function () {
        var bt = this; bt.disabled = true;
        google.script.run.withSuccessHandler(function (marcado) {
          bt.disabled = false;
          if (marcado) CARNET_IDS[m.id] = { tache: tache, id: m.id, titre: m.titre, e: m.e }; else delete CARNET_IDS[m.id];
          bt.classList.toggle('marcado', marcado);
          bt.innerHTML = marcado ? 'Enregistré dans mon cahier <small>toucher pour retirer</small>' : 'Enregistrer dans mon cahier <small>pour le réviser plus tard (dictée, oral, écrit)</small>';
          avisar({ titulo: marcado ? 'Enregistré dans votre cahier' : 'Retiré du cahier', texto: m.titre, icone: '', som: false, duracao: 6, acao: marcado ? { rotulo: 'Ouvrir mon cahier', fn: abrirCarnet } : null });
        }).withFailureHandler(function () { bt.disabled = false; }).alternarCarnet(EMAIL, { tache: tache, id: m.id, titre: m.titre, e: m.e });
      });
      if ($('bt-redigir-ia')) $('bt-redigir-ia').addEventListener('click', function () {
        var bt = this; bt.disabled = true; bt.textContent = 'Rédaction… (30 à 60 s)';
        google.script.run.withSuccessHandler(function (m2) { renderizarModelo(tache, m2, origem); })
          .withFailureHandler(function (er) { bt.disabled = false; bt.textContent = 'Rédiger la version complète'; avisar({ titulo: 'Impossible de rédiger', texto: er.message || er, icone: '', som: false, duracao: 12 }); })
          .gerarModeloIA(EMAIL, tache, m.id);
      });
      if ($('bt-devoir')) $('bt-devoir').addEventListener('click', function () { PREFILL_DEVOIR = { tache: tache, id: m.id }; abrirProf('devoirs'); });
      if ($('bt-partilhar')) $('bt-partilhar').addEventListener('click', function () {
        var p = $('painel-partilha'); p.hidden = !p.hidden;
        if (!p.hidden) painelPartilha(p, { id: m.id, tipo: tache.indexOf('ET') === 0 ? 'ambos' : 'dictee', titre: m.titre });
      });
      estado.devoirAtual = origem && origem.tipo === 'devoir' && !origem.devoir.feito ? origem.devoir : null;
      if ($('bt-devoir-feito')) $('bt-devoir-feito').addEventListener('click', function () {
        var bt = this; bt.disabled = true;
        google.script.run.withSuccessHandler(function () { bt.outerHTML = '<em>✓ Fait</em>'; origem.devoir.feito = true; avisar({ titulo: 'Devoir terminé', texto: 'Bravo !', icone: '', som: false, duracao: 5 }); })
          .concluirDevoir(EMAIL, origem.devoir.id, '', '');
      });
      raiz.querySelectorAll('.legenda-item').forEach(function (b) {
        b.addEventListener('click', function () {
          var ativo = b.getAttribute('aria-pressed') === 'true';
          b.setAttribute('aria-pressed', String(!ativo));
          raiz.classList.toggle('off-' + b.dataset.cat, ativo);
        });
      });
      var voltar = partes[partes.length - 2].fn;
      tela.querySelectorAll('[data-nav]').forEach(function (b) {
        b.addEventListener('click', function () {
          var acao = b.dataset.nav;
          if (acao === 'voltar') voltar();
          else if (acao === 'accueil') irAccueil();
          else if (acao === 'topo') window.scrollTo({ top: 0, behavior: 'smooth' });
          else if (acao === 'sortear' && noAtelier) { var outro = itens[Math.floor(Math.random() * itens.length)]; renderizarModelo(outro.tache, outro, { tipo: 'atelier', foco: origem.foco }); }
          else if (acao === 'sortear') sortear(tache, origem.eixo || (origem.tipo === 'eixo' ? origem.eixo : estado.filtroEixo), origem.de || origem.tipo, origem.busca);
          else if (acao === 'revelar') { $('tm-modele').hidden = false; b.closest('.revelar').hidden = true; $('tm-modele').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
          else if (acao === 'ant' || acao === 'prox') {
            var alvoNav = itens[pos + (acao === 'prox' ? 1 : -1)];
            if (alvoNav && noAtelier) renderizarModelo(alvoNav.tache, alvoNav, { tipo: 'atelier', foco: origem.foco });
            else if (alvoNav) abrirModelo(tache, alvoNav.id, origem.tipo === 'sorteio' ? { tipo: 'liste' } : origem);
          }
        });
      });
    
      if (tache === 'T2') ligarDialogo(m);
      else if (tache === 'T3' || tache === 'T1') ligarT3(m, tache);
      else ligarEscrito(m, tache);
      if (oral) ligarGravadorLivre(raiz, tache, m);
      ligarFazer(raiz, tache, m, oral);
      carregarDossier($('tm-dossier'), tache, m);
      mostrar('tela-modele');
      // Devoir / carnet: vai direto para a atividade pedida.
      var foco = origem && (origem.foco || (origem.tipo === 'devoir' && origem.devoir.tipo));
      if (foco === 'oral' || foco === 'ecrit') $('tm-fazer-bt').click();
      else if (foco === 'etude' || foco === 'dictee' || (origem && origem.tipo === 'modeles-page')) $('tm-modele').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function navegacaoRodape(pos, total) {
      return '<nav class="rodape-nav" aria-label="Navigation">' +
        '<button class="ferramenta" type="button" data-nav="voltar">← Retour</button>' +
        '<button class="ferramenta" type="button" data-nav="accueil">Accueil</button>' +
        '<span class="rodape-meio"><button class="ferramenta" type="button" data-nav="ant"' + (pos > 0 ? '' : ' disabled') + '>‹ Sujet précédent</button>' +
        '<button class="ferramenta" type="button" data-nav="prox"' + (pos < total - 1 ? '' : ' disabled') + '>Sujet suivant ›</button></span>' +
        '<button class="ferramenta" type="button" data-nav="sortear">Au hasard</button>' +
        '<button class="ferramenta" type="button" data-nav="topo">↑ Haut</button></nav>';
    }

    function lateral(m, tache) {
      var cats = B.surlignage.categories;
      var ordem = tache === 'T2' ? ['mc', 'pol', 'cond', 'con', 'sub'] : tache === 'T3' ? ['mc', 'arg', 'con', 'pol', 'sub', 'cond'] : ['mc', 'con', 'arg', 'pol', 'cond', 'sub'];
      var html = '<aside class="lateral"><div class="bloco"><h3>Légende</h3><p class="aviso" style="margin:-4px 0 8px">Touchez une catégorie pour l\'afficher ou la masquer.</p>';
      ordem.forEach(function (c) {
        var k = cats[c];
        html += '<button class="legenda-item" type="button" data-cat="' + c + '" aria-pressed="true" style="--cor:' + k.cor + ';--fundo:' + k.fundo + '">' +
          '<span class="amostra"></span><span><b>' + esc(k.nom) + '</b><small>' + esc(k.desc) + '</small></span></button>';
      });
      html += '</div>';
      if (m.k && m.k.length) html += '<div class="bloco"><h3>Vocabulaire clé</h3><div class="mots">' + m.k.map(function (w) { return '<span class="mot">' + esc(w) + '</span>'; }).join('') + '</div></div>';
      var tr = B.trames[tache];
      if (tr && tr.etapes) {
        html += '<div class="bloco"><h3>La trame</h3><ul class="trame-lista">' + tr.etapes.map(function (p) {
          return '<li style="--c:' + p.cor + '"><b>' + esc(p.rotulo) + '</b>' + esc(p.texte) + '</li>';
        }).join('') + '</ul></div>';
      }
      return html + '</aside>';
    }

    // ---------- cronômetro dos modelos: livre (progressivo) ou modo exame (regressivo) ----------
    var TEMPOS_EXAME = {
      T1:  [{ nome: 'Entretien dirigé', seg: 120 }],
      T2:  [{ nome: 'Préparation', seg: 120 }, { nome: "Échange avec l'examinateur", seg: 210 }],
      T3:  [{ nome: 'Monologue et questions', seg: 270 }],
      ET1: [{ nome: 'Rédaction de la tâche 1', seg: 600 }],
      ET2: [{ nome: 'Rédaction de la tâche 2', seg: 900 }],
      ET3: [{ nome: 'Rédaction de la tâche 3', seg: 1500 }]
    };

    function formatarTempo(s) {
      s = Math.max(0, Math.round(s));
      return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    }
    function totalExame(t) { return TEMPOS_EXAME[t].reduce(function (a, f) { return a + f.seg; }, 0); }
    function descreverExame(t) {
      var f = TEMPOS_EXAME[t];
      return f.length > 1 ? f.map(function (x) { return x.nome.toLowerCase() + ' ' + formatarTempo(x.seg); }).join(' + ') : formatarTempo(f[0].seg) + ' min';
    }
    function bip() {
      try {
        var C = window.AudioContext || window.webkitAudioContext; if (!C) return;
        var c = new C(), o = c.createOscillator(), g = c.createGain();
        o.frequency.value = 880; o.connect(g); g.connect(c.destination); g.gain.value = 0.15;
        o.start(); o.stop(c.currentTime + 0.6);
      } catch (e) {}
    }

    function blocoCronometro(tache) {
      return '<div class="bloco crono-bloco"><div class="crono-topo"><h3>Chronomètre</h3>' +
        '<label class="interruptor"><input type="checkbox" data-crono="exame"><span></span>Mode examen (' + descreverExame(tache) + ')</label></div>' +
        '<div class="cronometro"><span class="tempo" data-crono="tempo">0:00</span><span class="fase" data-crono="fase"></span>' +
        '<button class="ferramenta destaque" type="button" data-crono="play">▶ Démarrer</button>' +
        '<button class="ferramenta" type="button" data-crono="reset">↺ Remettre à zéro</button></div>' +
        '<p class="aviso" data-crono="dica"></p></div>';
    }

    /**
     * Modo livre: conta o tempo que o aluno leva (pode pausar e retomar) e avisa quando passa do tempo da prova.
     * Modo examen: contagem regressiva com o tempo oficial, sem pausa, com sinal sonoro no fim.
     */
    function criarCronoModelo(raiz, tache) {
      var q = function (k) { return raiz.querySelector('[data-crono="' + k + '"]'); };
      var el = { tempo: q('tempo'), fase: q('fase'), play: q('play'), reset: q('reset'), exame: q('exame'), dica: q('dica') };
      if (!el.tempo) return;
      var fases = TEMPOS_EXAME[tache], limite = totalExame(tache);
      var h = null, decorrido = 0, terminou = false;
      var exame = function () { return el.exame.checked; };
      var faseAtual = function () {
        var acc = 0;
        for (var i = 0; i < fases.length; i++) { acc += fases[i].seg; if (decorrido < acc) return { i: i, resta: acc - decorrido }; }
        return { i: fases.length - 1, resta: 0 };
      };
      var desenhar = function () {
        if (exame()) {
          var f = faseAtual();
          el.tempo.textContent = formatarTempo(f.resta);
          el.fase.textContent = terminou ? 'Temps écoulé !' : fases[f.i].nome + (fases.length > 1 ? ' (' + (f.i + 1) + '/' + fases.length + ')' : '');
          el.play.textContent = h ? 'Arrêter' : terminou ? '↺ Recommencer' : '▶ Commencer pour de vrai';
          el.reset.hidden = !!h;
          el.dica.textContent = h ? 'Comme à l\'examen : pas de pause possible.' : 'Le temps officiel est décompté sans pause, avec un signal sonore à la fin.';
        } else {
          el.tempo.textContent = formatarTempo(decorrido);
          el.fase.textContent = decorrido > limite ? 'Au-delà du temps de l\'examen (+' + formatarTempo(decorrido - limite) + ')' : (h ? 'En cours' : decorrido ? 'En pause' : 'Temps libre');
          el.play.textContent = h ? 'Pause' : decorrido ? '▶ Reprendre' : '▶ Démarrer';
          el.reset.hidden = false;
          el.dica.textContent = 'Le chronomètre mesure votre temps. À l\'examen, vous auriez ' + descreverExame(tache) + '.';
        }
        el.tempo.classList.toggle('pausado', !h && decorrido > 0 && !terminou);
        el.tempo.classList.toggle('fim', terminou || (!exame() && decorrido > limite) || (exame() && !!h && faseAtual().resta <= 30));
        el.exame.disabled = !!h;
      };
      var parar = function () { if (h) { clearInterval(h); h = null; } };
      raiz._pararCrono = function () { parar(); desenhar(); el.fase.textContent = 'Production envoyée'; };
      var tick = function () {
        decorrido++;
        if (exame() && limite - decorrido === 120 && limite > 300) avisar({ titulo: 'Plus que 2 minutes', texto: 'Pensez à conclure.', icone: '' });
        if (exame() && decorrido >= limite) { parar(); terminou = true; bip(); avisar({ titulo: 'Temps écoulé', texto: 'À l\'examen, vous devriez passer à la suite.', icone: '', tipo: 'urgente', som: false }); }
        else if (exame() && fases.length > 1 && decorrido === fases[0].seg) bip();
        desenhar();
      };
      el.play.addEventListener('click', function () {
        if (h) {
          if (exame() && !confirm('Arrêter la simulation ? Le temps sera remis à zéro.')) return;
          parar();
          if (exame()) { decorrido = 0; terminou = false; }
          desenhar(); return;
        }
        if (terminou) { decorrido = 0; terminou = false; }
        h = setInterval(tick, 1000);
        desenhar();
      });
      el.reset.addEventListener('click', function () { parar(); decorrido = 0; terminou = false; desenhar(); });
      el.exame.addEventListener('change', function () { parar(); decorrido = 0; terminou = false; desenhar(); });
      desenhar();
      cronometro = { pausar: function () { parar(); desenhar(); } };
    }
    function pararCronometro() { if (cronometro) cronometro.pausar(); cronometro = null; }

    function falar(item) { Voz.parar(); Voz.tocar(item); }
    function botaoOuvir(i) { return '<button class="ouvir" type="button" aria-label="Écouter" data-aud="' + i + '">' + ICO.som + '</button>'; }

    // ================= T2 oral =================
    function corpoDialogo(m) {
      var html = blocoCronometro('T2');
      if (m.ctx) html += '<div class="bloco contexto"><h3>Contexte culturel</h3><p>' + esc(m.ctx) + '</p></div>';
      html += '<div class="bloco modelo-conteudo"><h3>Dialogue modèle</h3>' + controlesLeitor('Écouter tout le dialogue', !!B.audios[m.id]) +
        '<div class="ferramentas">' +
        '<button class="ferramenta" type="button" data-cobrir="exam" aria-pressed="false">Masquer les réponses</button>' +
        '<button class="ferramenta" type="button" data-cobrir="cand" aria-pressed="false">Masquer mes questions</button>' +
        '<button class="ferramenta" type="button" id="modo-lacunas" aria-pressed="false">Compléter le dialogue</button>' +
        '<button class="ferramenta" type="button" data-abrir-dictee aria-pressed="false">Dictée à côté</button></div>' +
        '<div class="lacunas-barra" id="lacunas-barra" hidden><span>Complétez les expressions manquantes dans vos répliques.</span>' +
        '<button class="ferramenta" type="button" id="lacunas-verificar">Vérifier</button>' +
        '<button class="ferramenta" type="button" id="lacunas-respostas">Voir les réponses</button>' +
        '<button class="ferramenta" type="button" id="lacunas-limpar">Recommencer</button>' +
        '<span class="contador" id="lacunas-placar" hidden></span></div>' +
        '<p class="aviso" style="margin-top:-4px">Touchez une bulle floutée pour la révéler, ou pour l\'écouter seule.</p><div class="dialogo">';
      var n = 0;
      m.ech.forEach(function (x) {
        html += fala('cand', 'Vous (candidat)', x.q, m.k, n++);
        html += fala('exam', "L'examinateur", x.r, m.k, n++);
      });
      html += fala('cand', 'Vous (candidat)', m.fin, m.k, n);
      return html + '</div></div>' + htmlGravadorLivre('T2');
    }

    function fala(tipo, quem, texto, k, i) {
      return '<div class="fala ' + tipo + '" data-aud="' + i + '" data-texto="' + esc(texto) + '"><span class="quem">' + quem + '</span>' + botaoOuvir(i) +
        '<div class="conteudo">' + destacar(texto, k) + '</div>' +
        (tipo === 'cand' ? '<div class="conteudo-lacunas" hidden>' + lacunas(texto, k) + '</div>' : '') + '</div>';
    }

    function lacunas(texto, k) {
      var alvo = { pol: 1, cond: 1, con: 1, sub: 1 };
      var out = '', cursor = 0;
      achar(texto, k).forEach(function (a) {
        if (!alvo[a.cat]) return;
        var resp = texto.slice(a.ini, a.fim);
        out += esc(texto.slice(cursor, a.ini)) +
          '<input class="lacuna" type="text" autocomplete="off" spellcheck="false" data-resp="' + esc(resp) + '" style="width:' + Math.max(4, resp.length * 0.62 + 1.5) + 'em" aria-label="Expression manquante">';
        cursor = a.fim;
      });
      return out + esc(texto.slice(cursor));
    }
    function normalizarResposta(s) { return String(s || '').replace(/’/g, "'").replace(/\s+/g, ' ').trim().toLowerCase(); }

    function ligarDialogo(m) {
      var raiz = $('modele-raiz');
      var falas = Array.prototype.slice.call(raiz.querySelectorAll('.fala'));
      var item = function (f) { var i = Number(f.dataset.aud); return { texto: f.dataset.texto, el: f, id: idAudio(m, i), segunda: f.classList.contains('exam'), pausa: 450 }; };

      raiz.querySelectorAll('[data-cobrir]').forEach(function (b) {
        b.addEventListener('click', function () {
          var ligado = b.getAttribute('aria-pressed') !== 'true';
          b.setAttribute('aria-pressed', String(ligado));
          raiz.querySelectorAll('.fala.' + b.dataset.cobrir).forEach(function (f) { f.classList.toggle('coberta', ligado); });
        });
      });
      falas.forEach(function (f) {
        f.addEventListener('click', function (e) {
          if (f.classList.contains('coberta') && !e.target.closest('.ouvir')) { f.classList.remove('coberta'); e.stopPropagation(); }
        });
        f.querySelector('.ouvir').addEventListener('click', function (e) { e.stopPropagation(); falar(item(f)); });
      });
      criarCronoModelo(raiz, 'T2');
      ligarLeitor(raiz, function () { return falas.map(item); });
      var frasesDialogo = [];
      falas.forEach(function (f) {
        var sg = f.classList.contains('exam');
        dividirFrases(f.dataset.texto).forEach(function (fr) { frasesDialogo.push({ texto: fr, segunda: sg }); });
      });
      ligarDictee(raiz, frasesDialogo);

      var botaoLac = $('modo-lacunas'), barra = $('lacunas-barra');
      botaoLac.addEventListener('click', function () {
        var ligado = botaoLac.getAttribute('aria-pressed') !== 'true';
        botaoLac.setAttribute('aria-pressed', String(ligado));
        barra.hidden = !ligado;
        raiz.querySelectorAll('.fala.cand').forEach(function (f) {
          f.querySelector('.conteudo').hidden = ligado;
          f.querySelector('.conteudo-lacunas').hidden = !ligado;
        });
        if (ligado) { var p = raiz.querySelector('.lacuna'); if (p) p.focus(); }
      });
      $('lacunas-verificar').addEventListener('click', function () {
        var campos = raiz.querySelectorAll('.lacuna'), certos = 0;
        campos.forEach(function (c) {
          var dado = normalizarResposta(c.value), resp = normalizarResposta(c.dataset.resp);
          c.classList.remove('ok', 'quase', 'erro');
          if (dado === resp) { c.classList.add('ok'); certos++; }
          else if (dado && semAcento(dado) === semAcento(resp)) { c.classList.add('quase'); c.title = 'Attention aux accents : ' + c.dataset.resp; }
          else { c.classList.add('erro'); c.title = 'Réponse : ' + c.dataset.resp; }
        });
        var placar = $('lacunas-placar');
        placar.hidden = false;
        placar.textContent = certos + ' / ' + campos.length + ' correct' + (certos > 1 ? 's' : '');
      });
      $('lacunas-respostas').addEventListener('click', function () {
        raiz.querySelectorAll('.lacuna').forEach(function (c) {
          if (!c.classList.contains('ok')) { c.value = c.dataset.resp; c.classList.remove('erro', 'quase'); c.classList.add('revelada'); }
        });
      });
      $('lacunas-limpar').addEventListener('click', function () {
        raiz.querySelectorAll('.lacuna').forEach(function (c) { c.value = ''; c.className = 'lacuna'; c.title = ''; });
        $('lacunas-placar').hidden = true;
      });
    }

    // ================= T3 oral =================
    var CORES_ETAPAS = ['#94C4EC', '#E4C043', '#8FBFA9', '#C9A62E', '#7FB0DC', '#D51E28'];
    function corpoT3(m, tache) {
      tache = tache || 'T3';
      var etapas = m.rotulos ? m.rotulos.map(function (r, i) { return { rotulo: r, cor: CORES_ETAPAS[i % CORES_ETAPAS.length], texte: '' }; })
        : ((B.trames[tache] && B.trames[tache].etapes) || []);
      var html = blocoCronometro(tache);
      if (m.f > 1) html += '<p class="aviso">Ce sujet est tombé ' + m.f + ' fois aux examens de 2023 à 2026.</p>';
      if (m.ctx) {
        html += '<div class="bloco contexto"><h3>Comprendre le contexte</h3><p>' + esc(m.ctx.r) + '</p><div class="aspectos">' +
          (m.ctx.a || []).map(function (a) { return '<div><b>' + esc(a[0]) + '</b><span>' + esc(a[1]) + '</span></div>'; }).join('') +
          '</div><p class="aviso">Réutilisez un ou deux de ces éléments dans votre thèse ou vos arguments : ils montrent à l\'examinateur que vous maîtrisez le sujet.</p></div>';
      }

      var n = 0;
      html += '<div class="bloco modelo-conteudo"><h3>' + (tache === 'T1' ? 'La réponse modèle, étape par étape' : 'Le monologue modèle, étape par étape') + '</h3>' +
        '<div class="ferramentas"><button class="ferramenta" type="button" data-vista="tudo" aria-pressed="true">Texte complet</button>' +
        '<button class="ferramenta" type="button" data-vista="passo" aria-pressed="false">Pas à pas</button>' +
        '<button class="ferramenta" type="button" data-abrir-dictee aria-pressed="false">Dictée à côté</button></div>' +
        controlesLeitor('Écouter le monologue', !!B.audios[m.id]) + '<div class="passos">';
      m.etapes.forEach(function (t, i) {
        var et = etapas[i] || { rotulo: 'Étape ' + (i + 1), cor: '#ddd', texte: '' };
        html += '<section class="passo-t3" data-i="' + i + '" style="--c:' + et.cor + '">' +
          '<span class="rotulo-trame" style="--c:' + et.cor + '">' + (i + 1) + ' · ' + esc(et.rotulo) + '</span>' +
          (et.texte ? '<details class="passo-dica"><summary>Comment construire cette étape ?</summary><p>' + esc(et.texte) + '</p></details>' : '') +
          '<p class="passo-texto">' + dividirFrases(t).map(function (f) {
            return '<span class="frase" data-aud="' + (n++) + '" data-texto="' + esc(f) + '">' + destacar(f, m.k) + '</span>';
          }).join(' ') + '</p></section>';
      });
      html += '</div><div class="ferramentas navega-passo" id="navega-passo" hidden>' +
        '<button class="ferramenta" type="button" data-passo="-1">← Étape précédente</button>' +
        '<span class="contador" id="passo-num"></span>' +
        '<button class="ferramenta" type="button" data-passo="1">Étape suivante →</button></div></div>';

      html += '<div class="bloco modelo-conteudo"><h3>Les questions de l\'examinateur</h3><p class="aviso" style="margin-top:0">Après votre monologue, l\'examinateur vous pose des questions. Répondez à voix haute avant d\'afficher la réponse.</p><div class="dialogo">';
      (m.rel || []).forEach(function (x) {
        html += fala('exam', "L'examinateur", x.q, m.k, n++).replace('<div class="conteudo-lacunas" hidden></div>', '');
        html += '<div class="fala cand coberta" data-aud="' + n + '" data-texto="' + esc(x.r) + '"><span class="quem">Réponse possible (touchez pour afficher)</span>' + botaoOuvir(n) +
          '<div class="conteudo">' + destacar(x.r, m.k) + '</div></div>';
        n++;
      });
      return html + '</div></div>' + htmlGravadorLivre(tache);
    }

    function ligarT3(m, tache) {
      var raiz = $('modele-raiz');
      criarCronoModelo(raiz, tache || 'T3');
      var passos = Array.prototype.slice.call(raiz.querySelectorAll('.passo-t3'));
      var atual = 0, modo = 'tudo';
      var aplicar = function () {
        passos.forEach(function (p, i) { p.hidden = modo === 'passo' && i !== atual; });
        $('navega-passo').hidden = modo !== 'passo';
        $('passo-num').textContent = (atual + 1) + ' / ' + passos.length;
        raiz.querySelector('[data-passo="-1"]').disabled = atual === 0;
        raiz.querySelector('[data-passo="1"]').disabled = atual === passos.length - 1;
      };
      raiz.querySelectorAll('[data-vista]').forEach(function (b) {
        b.addEventListener('click', function () {
          modo = b.dataset.vista;
          raiz.querySelectorAll('[data-vista]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
          Voz.parar(); aplicar();
        });
      });
      raiz.querySelectorAll('[data-passo]').forEach(function (b) {
        b.addEventListener('click', function () { atual += Number(b.dataset.passo); Voz.parar(); aplicar(); });
      });
      var item = function (el) { return { texto: el.dataset.texto, el: el, id: idAudio(m, Number(el.dataset.aud)), segunda: el.classList.contains('exam') }; };
      ligarLeitor(raiz, function () { return Array.prototype.slice.call(raiz.querySelectorAll('.passo-t3 .frase')).map(item); });
      raiz.querySelectorAll('.fala').forEach(function (f) {
        f.addEventListener('click', function (e) { if (f.classList.contains('coberta') && !e.target.closest('.ouvir')) f.classList.remove('coberta'); });
        f.querySelector('.ouvir').addEventListener('click', function (e) { e.stopPropagation(); falar(item(f)); });
      });
      ligarDictee(raiz, Array.prototype.slice.call(raiz.querySelectorAll('.passo-t3 .frase')).map(function (el) { return { texto: el.dataset.texto, id: idAudio(m, Number(el.dataset.aud)) }; }));
      aplicar();
    }

    // ================= escrita =================
    function ehTitulo(linha, total) {
      return total > 2 && contarPalavras(linha) <= 16 && !/[.!…:,;]$/.test(linha.trim());
    }
    function rotulosET3(n) {
      var et = (B.trames.ET3 && B.trames.ET3.etapes) || [];
      if (n < 3 || et.length < 4) return [];
      var r = [et[0]];
      for (var i = 1; i < n - 1; i++) r.push(i === 1 ? et[1] : et[2]);
      r.push(et[3]);
      return r;
    }

    function corpoEscrito(m, tache) {
      var info = TACHES[tache];
      var html = blocoCronometro(tache);
      if (m.d1) {
        html += '<div class="bloco"><h3>Les documents</h3><div class="docs">' +
          '<div class="doc"><h4>Document 1</h4><p>' + destacar(m.d1, m.k) + '</p></div>' +
          '<div class="doc"><h4>Document 2</h4><p>' + destacar(m.d2, m.k) + '</p></div></div>' +
          (m.docsNovos ? '<p class="aviso">Documents rédigés par Français na Mira à partir du sujet.</p>' : '') + '</div>';
      }
      var nPal = contarPalavras(m.p), alto = !m.atelier && info.max && nPal > info.max;
      html += '<div class="bloco modelo-conteudo"><div class="ferramentas" style="justify-content:space-between;align-items:center">' +
        '<h3 style="margin:0">Production modèle</h3>' +
        '<span class="contador' + (alto ? ' alto' : '') + '">' + nPal + ' mots · attendu : ' + info.min + ' à ' + info.max + '</span></div>';
      if (alto) html += '<p class="aviso" style="margin-top:0">Ce modèle dépasse la limite : à l\'examen, gardez la structure et raccourcissez les exemples.</p>';
      if (m.prodNova) html += '<p class="aviso" style="margin-top:0">Production rédigée par Français na Mira à partir des documents.</p>';
      html += '<div class="ferramentas"><button class="ferramenta" type="button" data-abrir-dictee aria-pressed="false">Dictée à côté</button>' +
        '<button class="ferramenta" type="button" data-abrir-reescrita aria-pressed="false">Feuille de réécriture</button>' +
        '<button class="ferramenta" type="button" data-ocultar aria-pressed="false">Masquer le texte</button></div>';
      if (!B.professor) html += '<div class="recordes" data-rec="' + esc(m.id) + '"></div>';
      html += controlesLeitor('Écouter la production', !!B.audios[m.id]);
      html += '<div class="texto-modelo">';
      var linhas = m.p.split(/\n+/).map(function (l) { return l.trim(); }).filter(Boolean);
      var inicio = 0, n = 0;
      var frasesHtml = function (linha) {
        return dividirFrases(linha).map(function (f) { return '<span class="frase" data-aud="' + (n++) + '" data-texto="' + esc(f) + '">' + destacar(f, m.k) + '</span>'; }).join(' ');
      };
      if (tache === 'ET3' && ehTitulo(linhas[0], linhas.length)) { html += '<p class="titulo-prod">' + frasesHtml(linhas[0]) + '</p>'; inicio = 1; }
      var rot = tache === 'ET3' ? rotulosET3(linhas.length - inicio) : [];
      linhas.slice(inicio).forEach(function (l, i) {
        var r = rot[i];
        html += '<p>' + (r ? '<span class="rotulo-trame" style="--c:' + r.cor + '">' + esc(r.rotulo) + '</span>' : '') + frasesHtml(l) + '</p>';
      });
      html += '</div></div>';
      return html;
    }

    function ligarEscrito(m, tache) {
      var info = TACHES[tache];
      var raiz = $('modele-raiz');
      criarCronoModelo(raiz, tache);
      var item = function (el) { return { texto: el.dataset.texto, el: el, id: idAudio(m, Number(el.dataset.aud)) }; };
      var frases = Array.prototype.slice.call(raiz.querySelectorAll('.texto-modelo .frase'));
      ligarLeitor(raiz, function () { return frases.map(item); });
      ligarDictee(raiz, frases.map(item), m.id);
      ligarOcultar(raiz);
      ligarReescrita(raiz, m, tache);
      carregarRecordes(function () { raiz.querySelectorAll('[data-rec]').forEach(function (el) { el.innerHTML = htmlRecordes(m.id); }); });
      // prepara os primeiros áudios já na abertura: o primeiro clique em « Écouter » responde na hora
      setTimeout(function () { Voz.preparar(frases.slice(0, 3).map(item)); }, 400);
    }


    // ================= épreuve écrite (60 min, fechada e enviada no fim) =================
    var SUJETS = null;
    var LIMITES = { ET1: [60, 120], ET2: [120, 150], ET3: [120, 180] };
    var ETAPAS_EPREUVE = [{ t: 'Tâche 1', min: 10 }, { t: 'Tâche 2', min: 15 }, { t: 'Tâche 3', min: 25 }, { t: 'Relecture', min: 10 }];
    var EP = null;          // { inicio, fim, sujets, textes, sessao, delta, fechada }
    var epTimer = null, epSalvar = null, epSujo = false;

    function nclc(n) {
      n = Number(n);
      if (n >= 16) return 10; if (n >= 14) return 9; if (n >= 12) return 8; if (n >= 10) return 7;
      if (n >= 7) return 6; if (n >= 6) return 5; if (n >= 4) return 4; return '< 4';
    }
    function sujetPorId(t, id) { return (SUJETS[t] || []).filter(function (x) { return x.id === id; })[0]; }
    function sujetAleatorio(t, filtroEixo, evitar, eixosUsados) {
      var abertos = SUJETS[t].filter(function (x) { return permitido(t, x.e, x.id); });
      if (!abertos.length) return null;
      var l = abertos.filter(function (x) { return (!filtroEixo || x.e === filtroEixo) && x.id !== evitar; });
      if (!l.length) l = abertos;
      return sorteioPonderado(l, { evitarEixos: filtroEixo ? [] : (eixosUsados || []), memoria: 6 });
    }
    /** Tira as 3 tâches com eixos todos diferentes (e diferentes das últimas provas). */
    function tirarProva(filtroEixo) {
      var p = {}, usados = [];
      ETS().reverse().forEach(function (t) { p[t] = sujetAleatorio(t, filtroEixo, null, usados); if (p[t]) usados.push(p[t].e); });
      return p;
    }
    function pararEpreuveTimers() { if (epTimer) clearInterval(epTimer); if (epSalvar) clearInterval(epSalvar); epTimer = epSalvar = null; }

    function abrirEpreuve() {
      if (!B) return;
      mostrar('tela-epreuve');
      var tela = $('tela-epreuve');
      tela.innerHTML = '<p class="vazio">Chargement…</p>';
      var depois = function () {
        google.script.run.withSuccessHandler(function (st) {
          if (st.emCurso) iniciarEpreuveLocal(st.emCurso, st.agora);
          else telaEscolhaEpreuve(st);
        }).withFailureHandler(function (e) { tela.innerHTML = '<p class="vazio erro">' + esc(e.message || e) + '</p>'; }).obterEstadoEpreuve(EMAIL);
      };
      if (SUJETS) depois();
      else google.script.run.withSuccessHandler(function (s) { SUJETS = s; depois(); })
        .withFailureHandler(function (e) { tela.innerHTML = '<p class="vazio erro">' + esc(e.message || e) + '</p>'; }).obterSujetsEntrainement(EMAIL);
    }

    function avisoPermissao(st) {
      if (st.podeEnviar) return st.restantes !== null && st.restantes !== undefined ? '<p class="aviso">Épreuves restantes pour votre compte : <b>' + st.restantes + '</b>.</p>' : '';
      return '<div class="alerta">' + (st.producaoLiberada ? 'Vous avez atteint le nombre maximum d\'entraînements envoyés.' : 'L\'entraînement libre n\'est pas envoyé à votre professeur(e).') +
        ' Les épreuves proposées par votre professeur(e) sont toujours envoyées.' + (B.ia && B.ia.ativa ? ' En entraînement libre, l\'IA corrige vos textes.' : '') + '</div>';
    }

    /** Antes de começar: provas do professor + treino livre com sorteio. */
    function telaEscolhaEpreuve(st) {
      var partes = [PARTE_ACCUEIL(), { rotulo: 'Épreuves' }];
      var livre = tirarProva(null);
      var html = trilha(partes) + '<h1 class="titulo-pagina">Épreuve d\'expression écrite</h1>' +
        '<p class="intro">' + (ehDelf() ? introEpreuveDelf() : 'Trois tâches en <b>60 minutes</b>, comme le jour du TCF Canada : Tâche 1 (≈ 10 min), Tâche 2 (≈ 15 min), Tâche 3 (≈ 25 min) et 10 minutes de relecture. ') +
        'Une fois commencée, l\'épreuve ne peut pas être mise en pause. À la fin du temps, elle se ferme et vos textes sont envoyés automatiquement, même si vous quittez la page.</p>' + avisoPermissao(st);

      var sess = st.sessoes || [];
      if (sess.length) {
        html += '<h2 class="secao-titulo">Épreuves proposées par votre professeur(e)</h2><div class="lista-sessoes">' + sess.map(function (x) {
          var linhas = '';
          if (x.escrita) {
            linhas += '<div class="sessao-tarefa"><span>Expression écrite · 60 min</span>' +
              (x.feita ? '<em>✓ Envoyée</em>' : '<button class="botao-principal" type="button" data-sessao="' + esc(x.id) + '">Commencer l\'écrit</button>') + '</div>';
          }
          (x.orais || []).forEach(function (o) {
            linhas += '<div class="sessao-tarefa"><span>Expression orale · ' + TACHES[o.tache].nom + ' · ' + TACHES[o.tache].sous + '</span>' +
              (o.feita ? '<em>✓ Envoyée</em>' : '<button class="botao-principal" type="button" data-gravar="' + esc(x.id) + '|' + o.tache + '">S\'enregistrer</button>') + '</div>';
          });
          return '<div class="bloco sessao"><div class="sessao-cab"><b>' + esc(x.nome) + '</b><small>Sujets choisis par votre professeur(e) · découverts au début de chaque tâche · envoyés automatiquement</small></div>' + linhas + '</div>';
        }).join('') + '</div>';
      }
      html += '<h2 class="secao-titulo">Entraînement libre</h2><div class="bloco"><p class="aviso" style="margin-top:0">Les sujets sont tirés au sort. Vous pouvez en changer avant de commencer.</p>' +
        '<label class="campo-eixo">Axe thématique<select id="ep-eixo"><option value="">Tous les axes</option>' +
        B.ordemEixos.map(function (ch) { return '<option value="' + ch + '">' + eixo(ch).icone + ' ' + esc(eixo(ch).nome) + '</option>'; }).join('') + '</select></label>' +
        '<div class="previa">' + ETS().map(function (t) {
          return '<div class="previa-item"><span class="selo">' + seloTache(t) + '</span><span data-previa="' + t + '"></span><button class="ferramenta" type="button" data-trocar="' + t + '" title="Tirer un autre sujet pour cette tâche">' + ICO.giro + '</button></div>';
        }).join('') + '</div><p class="aviso">Les sujets les plus fréquents et ceux tombés récemment ont plus de chances de sortir, et les trois tâches portent toujours sur des axes différents.</p>' +
        htmlEscolhaCorrecao(st) + '<div class="ferramentas"><button class="botao-principal" type="button" id="ep-comecar" style="width:auto;padding:13px 30px">' + (ehDelf() ? 'Começar a prova (' + minutosEpreuve() + ' min)' : 'Commencer l\'épreuve (60 min)') + '</button>' +
        '<button class="botao-sorteio" type="button" id="ep-retirar">Tirer une autre épreuve</button></div></div>';
      html += '<nav class="rodape-nav"><button class="ferramenta" type="button" data-ir="accueil">Accueil</button></nav>';
      var tela = $('tela-epreuve');
      tela.innerHTML = html;
      ligarTrilha(tela, partes);
      var desenharPrevia = function () {
        var faltam = ETS().filter(function (t) { return !livre[t]; });
        $('ep-comecar').disabled = !!faltam.length;
        ETS().forEach(function (t) {
          if (!livre[t]) { tela.querySelector('[data-previa="' + t + '"]').innerHTML = '<b>' + TACHES[t].sous + '</b><br>Aucun sujet débloqué pour cette tâche. Votre professeur(e) l\'ouvrira bientôt.'; return; }
          var e = eixo(livre[t].e);
          tela.querySelector('[data-previa="' + t + '"]').innerHTML = '<b>' + TACHES[t].sous + '</b> · <span class="etiqueta eixo" style="--cor:' + e.cor + '">' + e.icone + ' ' + esc(e.nome) + '</span>' +
            (livre[t].tr ? ' <span class="selo-tipo tendance">Tendance</span>' : '') + '<br>' + esc(livre[t].t.slice(0, 140)) + (livre[t].t.length > 140 ? '…' : '');
        });
      };
      $('ep-eixo').addEventListener('change', function () { livre = tirarProva($('ep-eixo').value || null); desenharPrevia(); });
      $('ep-retirar').addEventListener('click', function () { livre = tirarProva($('ep-eixo').value || null); desenharPrevia(); });
      tela.querySelectorAll('[data-trocar]').forEach(function (b) {
        b.addEventListener('click', function () {
          var t = b.dataset.trocar;
          if (!livre[t]) return;
          var outros = ETS().filter(function (x) { return x !== t && livre[x]; }).map(function (x) { return livre[x].e; });
          livre[t] = sujetAleatorio(t, $('ep-eixo').value || null, livre[t].id, outros.concat([livre[t].e]));
          desenharPrevia();
        });
      });
      var comecar = function (pedido, botao) {
        if (!confirm(ehDelf() ? 'A prova dura ' + minutosEpreuve() + ' minutos e não pode ser pausada. Começar agora?' : 'L\'épreuve dure 60 minutes et ne peut pas être mise en pause. Commencer maintenant ?')) return;
        botao.disabled = true; botao.textContent = 'Préparation…';
        google.script.run.withSuccessHandler(function (st2) { iniciarEpreuveLocal(st2.emCurso, st2.agora); })
          .withFailureHandler(function (e) { botao.disabled = false; botao.textContent = 'Commencer'; alert(e.message || e); })
          .commencerEpreuve(EMAIL, pedido);
      };
      $('ep-comecar').addEventListener('click', function () { registrarEixos(ETS().map(function (t) { return livre[t].e; })); comecar({ sujets: sujetsLivres(livre), correcao: correcaoEscolhida() }, $('ep-comecar')); });
      tela.querySelectorAll('[data-sessao]').forEach(function (b) { b.addEventListener('click', function () { comecar({ sessao: b.dataset.sessao }, b); }); });
      tela.querySelectorAll('[data-gravar]').forEach(function (b) {
        b.addEventListener('click', function () {
          var partesId = b.dataset.gravar.split('|');
          var sessao = sess.filter(function (x) { return x.id === partesId[0]; })[0];
          var tarefa = sessao.orais.filter(function (o) { return o.tache === partesId[1]; })[0];
          abrirGravacao(sessao, tarefa);
        });
      });
      tela.querySelector('[data-ir="accueil"]').addEventListener('click', irAccueil);
      desenharPrevia();
    }

    /** Prova em andamento: o tempo vem do servidor (retomar após recarregar a página). */
    function iniciarEpreuveLocal(emCurso, agoraServidor) {
      var SEG_EP = minutosEpreuve() * 60;
      pararEpreuveTimers();
      var local = lerLocal('fnm_ep_' + EMAIL, null);
      EP = { id: emCurso.id, correcao: emCurso.correcao, inicio: emCurso.inicio, fim: emCurso.fim, sujets: emCurso.sujets, textes: emCurso.textes || {}, sessao: emCurso.sessao, delta: agoraServidor - Date.now(), fechada: false,
        pausavel: !!emCurso.pausavel, consumidoInicial: emCurso.consumido || 0, alertas: {} };
      var retomada = (emCurso.consumido || 0) > 20 || ETS().some(function (t) { return (emCurso.textes || {})[t]; });
      if (local && local.inicio === EP.inicio) ETS().forEach(function (t) { if ((local.textes[t] || '').length > (EP.textes[t] || '').length) EP.textes[t] = local.textes[t]; });

      var html = '<div class="ep-barra"><div class="ep-relogio"><span class="tempo" id="ep-tempo">' + minutosEpreuve() + ':00</span><span id="ep-fase">Épreuve en cours</span></div>' +
        '<div class="ep-etapas" id="ep-etapas">' + ETAPAS_EPREUVE.map(function (e) { return '<span style="flex:' + e.min + '"><i></i>' + e.t + ' · ' + e.min + ' min</span>'; }).join('') + '<b id="ep-cursor"></b></div>' +
        '<span class="aviso" id="ep-salvo">Brouillon enregistré</span>' +
        '<button class="botao-principal ep-enviar" type="button" id="ep-enviar">Terminer et envoyer</button></div>';
      html += '<h1 class="titulo-pagina" style="margin-top:18px">Épreuve d\'expression écrite</h1>' +
        (EP.sessao ? '<p class="aviso">Épreuve proposée par votre professeur(e).</p>' : '');
      ETS().forEach(function (t) {
        var sj = EP.sujets[t], lim = LIMITES[t];
        if (!sj) return;
        html += '<section class="ep-tache" data-t="' + t + '"><div class="ep-cab"><span class="selo">' + seloTache(t) + '</span><div><h2>' + TACHES[t].nom + ' · ' + TACHES[t].sous + '</h2>' +
          '<small>' + lim[0] + ' mots minimum · ' + (ehDelf() ? '' : lim[1] + ' mots maximum · ') + 'temps conseillé : ' + (MIN_EXAME_ESCRITO[t] || 10) + ' min</small></div></div>' +
          '<div class="consigne-folha"><p>' + esc((t === 'ET3' ? 'Sujet : ' : '') + (sj.t || sj.c || sj.titre)) + '</p>' +
          (sj.d1 ? '<p class="aviso">Rédigez un texte argumentatif : résumez les deux points de vue, puis donnez votre opinion en vous appuyant sur les documents.</p><div class="docs"><div class="doc"><h4>Document 1</h4><p>' + esc(sj.d1) + '</p></div><div class="doc"><h4>Document 2</h4><p>' + esc(sj.d2) + '</p></div></div>' : '') +
          '</div>' + htmlMetodo(t, !EP.sessao) + editorHtml(t) + '</section>';
      });
      html += '<div id="ep-resultado"></div>';
      var tela = $('tela-epreuve');
      tela.innerHTML = html;
      mostrar('tela-epreuve');

      tela.querySelectorAll('.editor').forEach(function (ed) {
        var t = ed.dataset.editor;
        ligarEditor(ed, EP.textes[t] || '', (local && local.inicio === EP.inicio && local.html) ? local.html[t] : '', function (texto, html) {
          EP.textes[t] = texto; EP.html = EP.html || {}; EP.html[t] = html; epSujo = true;
          gravarLocal('fnm_ep_' + EMAIL, { inicio: EP.inicio, textes: EP.textes, html: EP.html });
          $('ep-salvo').textContent = 'Modifications non enregistrées…';
        });
      });

      // Alertas: 2 min antes do fim de cada etapa (10, 15 e 25 min), na troca de etapa e no fim da prova.
      var irPara = function (t) { var c = document.querySelector('#tela-epreuve [data-caixa="' + t + '"]'); if (c) { c.scrollIntoView({ behavior: 'smooth', block: 'center' }); c.classList.add('destaque-proximo'); setTimeout(function () { c.classList.remove('destaque-proximo'); }, 4000); var ed = c.querySelector('.editor'); if (ed) ed.focus(); } };
      var ALERTAS = alertasEpreuve(irPara);
      var decorridoInicial = SEG_EP - Math.round((EP.fim - (Date.now() + EP.delta)) / 1000);
      ALERTAS.forEach(function (a) { if (a.em <= decorridoInicial) EP.alertas[a.em] = true; });
      if (retomada) avisar({ titulo: 'Épreuve reprise là où vous l\'aviez laissée', icone: '↺', som: false,
        texto: 'Il vous reste ' + formatarTempo(SEG_EP - decorridoInicial) + '. Vos textes ont été restaurés' + (EP.pausavel ? ' (le temps était en pause pendant votre absence).' : '.') });

      var relogio = function () {
        var resta = Math.round((EP.fim - (Date.now() + EP.delta)) / 1000);
        var decorrido = SEG_EP - resta;
        EP.consumido = Math.max(0, Math.min(SEG_EP, decorrido));
        ALERTAS.forEach(function (a) {
          if (!EP.alertas[a.em] && decorrido >= a.em) { EP.alertas[a.em] = true; avisar(a); $('ep-tempo').classList.add('pulsar'); setTimeout(function () { var t = $('ep-tempo'); if (t) t.classList.remove('pulsar'); }, 3000); }
        });
        $('ep-tempo').textContent = formatarTempo(resta);
        $('ep-tempo').classList.toggle('fim', resta <= 300);
        var acc = 0, etapa = ETAPAS_EPREUVE[0].t;
        for (var i = 0; i < ETAPAS_EPREUVE.length; i++) { acc += ETAPAS_EPREUVE[i].min * 60; if (decorrido < acc) { etapa = ETAPAS_EPREUVE[i].t; break; } }
        $('ep-fase').textContent = resta > 0 ? 'Étape conseillée : ' + etapa : 'Temps écoulé';
        $('ep-cursor').style.left = Math.min(100, Math.max(0, 100 * decorrido / SEG_EP)) + '%';
        if (resta <= 0) fecharEpreuve(true);
      };
      relogio();
      epTimer = setInterval(relogio, 1000);
      epSalvar = setInterval(function () { if (epSujo) salvarServidor(); }, 20000);
      $('ep-enviar').addEventListener('click', function () {
        var vazias = ETS().filter(function (t) { return !(EP.textes[t] || '').trim(); });
        confirmarFimEpreuve(vazias).then(function (ok) { if (ok) fecharEpreuve(false); });
      });
    }

    // ---------- correção por inteligência artificial ----------
    function botaoIA(id) {
      if (!B.ia || !B.ia.ativa) return '';
      return '<button class="botao-ia" type="button" id="' + id + '"><span class="ia-brilho"></span>Corriger avec l\'IA' +
        '<small>' + B.ia.restantes + ' correction' + (B.ia.restantes > 1 ? 's' : '') + ' restante' + (B.ia.restantes > 1 ? 's' : '') + ' aujourd\'hui</small></button>';
    }

    /** Corrige as tâches uma depois da outra (sem clique), mostrando cada resultado sob o texto. */
    function corrigirEmSequencia(tarefas) {
      var i = 0;
      var proxima = function () {
        if (i >= tarefas.length || !EP) return;
        var t = tarefas[i++];
        var bt = $('ia-' + t), res = $('ia-res-' + t);
        if (!bt || !res) { proxima(); return; }
        pedirCorrecaoIA(t, EP.sujets[t].id, EP.textes[t], res, bt, proxima, i === 1);
      };
      proxima();
    }

    function pedirCorrecaoIA(tache, sujetId, texto, alvo, botao, depois, rolar) {
      if (rolar === undefined) rolar = true;
      if (contarPalavras(texto) < 15) { alert('Écrivez au moins quelques phrases avant de demander une correction.'); if (depois) depois(); return; }
      botao.disabled = true;
      var original = botao.innerHTML;
      botao.innerHTML = '<span class="ia-brilho"></span>Analyse en cours…<small>Environ 20 à 40 secondes</small>';
      alvo.innerHTML = '<div class="ia-carregando"><i></i><i></i><i></i><span>L\'IA relit votre texte, vérifie la trame et prépare vos conseils…</span></div>';
      google.script.run.withSuccessHandler(function (r) {
        B.ia.restantes = r.restantes;
        alvo.innerHTML = cartaoCorrecaoIA(r, tache);
        ligarLexicoCarnet(alvo);
        botao.disabled = r.restantes <= 0;
        botao.innerHTML = original.replace(/\d+ correction[^<]*/, r.restantes + ' correction' + (r.restantes > 1 ? 's' : '') + ' restante' + (r.restantes > 1 ? 's' : '') + ' aujourd\'hui');
        ligarDicas(alvo);
        if (rolar) alvo.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (depois) depois();
      }).withFailureHandler(function (e) {
        botao.disabled = false; botao.innerHTML = original;
        alvo.innerHTML = '<div class="alerta">' + esc(e.message || e) + '</div>';
        if (depois) depois();
      }).corrigirComIA(EMAIL, { tache: tache, sujet: sujetId, texte: texto });
    }

    function ligarLexicoCarnet(raiz) {
      raiz.querySelectorAll('[data-mot-ia]').forEach(function (b) {
        b.addEventListener('click', function () {
          b.disabled = true;
          google.script.run.withSuccessHandler(function () { b.textContent = '✓'; carregarCarnet(); }).adicionarPalavrasCarnet(EMAIL, [{ mot: b.dataset.motIa, detalhe: b.dataset.ex }]);
        });
      });
    }

    function cartaoCorrecaoIA(r, tache) {
      var lista = function (l) { return (l || []).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join(''); };
      var html = '<div class="ia-cartao"><div class="ia-topo"><div class="ia-nota"><b>' + r.note + '</b><span>/' + (r.escala || 20) + '</span></div>' +
        '<div><span class="ia-selo">Correction par l\'IA · ' + (r.selo ? esc(r.selo) : 'NCLC estimé ' + r.nclc) + '</span><p class="ia-apreciacao">' + esc(r.appreciation || '') + '</p>' +
        '<small>' + r.mots + ' mots écrits · attendu : ' + r.limites[0] + ' à ' + r.limites[1] + '</small></div></div>';
      if (r.criteres && r.criteres.length) {
        html += '<div class="ia-criterios">' + r.criteres.map(function (c) {
          return '<div><span>' + esc(c.nom) + '</span><b>' + esc(c.note) + '</b><p>' + esc(c.commentaire) + '</p></div>';
        }).join('') + '</div>';
      }
      if (r.trame && r.trame.length) {
        html += '<h4>La trame</h4><ul class="ia-trame">' + r.trame.map(function (t) {
          return '<li class="' + (t.presente ? 'sim' : 'nao') + '"><b>' + (t.presente ? '✓' : '✗') + ' ' + esc(t.etape) + '</b> ' + esc(t.commentaire || '') + '</li>';
        }).join('') + '</ul>';
      }
      html += '<div class="ia-duas"><div><h4>Points forts</h4><ul>' + lista(r.points_forts) + '</ul></div><div><h4>À améliorer</h4><ul>' + lista(r.a_ameliorer) + '</ul></div></div>';
      if (r.corrections && r.corrections.length) {
        html += '<h4>Corrections</h4><div class="ia-correcoes">' + r.corrections.map(function (c) {
          return '<div><span class="ia-antes">' + esc(c.original) + '</span><span class="ia-seta">→</span><span class="ia-depois">' + esc(c.corrige) + '</span><p>' + esc(c.explication) + '</p></div>';
        }).join('') + '</div>';
      }
      if (r.lexique && r.lexique.length) {
        html += '<h4>Enrichir le lexique</h4><div class="ia-lexico">' + r.lexique.map(function (l) {
          return '<div><b>' + esc(l.mot) + '</b>' + (l.remplace ? '<small>au lieu de « ' + esc(l.remplace) + ' »</small>' : '') + '<p>' + esc(l.exemple || '') + '</p>' +
            '<button class="mini-carnet" type="button" data-mot-ia="' + esc(l.mot) + '" data-ex="' + esc(l.exemple || '') + '">Cahier</button></div>';
        }).join('') + '</div>';
      }
      if (r.connecteurs && r.connecteurs.length) html += '<h4>Connecteurs à ajouter</h4><ul>' + lista(r.connecteurs) + '</ul>';
      if (r.version_amelioree) {
        var n = r.mots_version || contarPalavras(r.version_amelioree), fora = n > r.limites[1] || n < r.limites[0];
        html += '<h4>Votre texte, version améliorée <span class="contador' + (fora ? ' alto' : '') + '">' + n + ' mots</span></h4>' +
          '<div class="ia-versao">' + r.version_amelioree.split(/\n+/).filter(function (p) { return p.trim(); }).map(function (p) { return '<p>' + destacar(p.trim(), []) + '</p>'; }).join('') + '</div>' +
          '<p class="aviso">Les connecteurs et structures de la trame sont surlignés : survolez-les pour les comprendre.</p>';
      }
      if (r.conseil) html += '<div class="ia-conselho">' + esc(r.conseil) + '</div>';
      return html + '<p class="aviso">Correction automatique à titre d\'entraînement : elle ne remplace pas l\'évaluation de votre professeur(e).</p></div>';
    }

    // ---------- editor da prova (barra de formatação, numeração de linhas, folha de documento) ----------
    var PLACEHOLDER = { ET1: 'Salut …,', ET2: 'Madame, Monsieur, …', ET3: 'Titre de votre texte…' };
    var BOTOES_EDITOR = [
      ['bold', '<b>G</b>', 'Gras (Ctrl+B)'], ['italic', '<i>I</i>', 'Italique (Ctrl+I)'], ['underline', '<u>S</u>', 'Souligné (Ctrl+U)'], null,
      ['justifyLeft', '<svg viewBox="0 0 16 16"><path d="M2 3h12M2 6.5h8M2 10h12M2 13.5h8"/></svg>', 'Aligner à gauche'],
      ['justifyCenter', '<svg viewBox="0 0 16 16"><path d="M2 3h12M4 6.5h8M2 10h12M4 13.5h8"/></svg>', 'Centrer'],
      ['justifyRight', '<svg viewBox="0 0 16 16"><path d="M2 3h12M6 6.5h8M2 10h12M6 13.5h8"/></svg>', 'Aligner à droite'],
      ['justifyFull', '<svg viewBox="0 0 16 16"><path d="M2 3h12M2 6.5h12M2 10h12M2 13.5h12"/></svg>', 'Justifier'], null,
      ['undo', '<svg viewBox="0 0 16 16"><path d="M5 4 2 7l3 3M2 7h8a4 4 0 0 1 0 8H7"/></svg>', 'Annuler (Ctrl+Z)'],
      ['redo', '<svg viewBox="0 0 16 16"><path d="m11 4 3 3-3 3M14 7H6a4 4 0 0 0 0 8h3"/></svg>', 'Rétablir (Ctrl+Y)']
    ];

    function editorHtml(t) {
      var lim = LIMITES[t];
      return '<div class="editor-caixa" data-caixa="' + t + '">' +
        '<div class="editor-barra" role="toolbar" aria-label="Mise en forme">' +
          BOTOES_EDITOR.map(function (b) {
            return b ? '<button type="button" class="ed-bt" data-cmd="' + b[0] + '" title="' + b[2] + '" aria-label="' + b[2] + '">' + b[1] + '</button>' : '<span class="ed-sep"></span>';
          }).join('') +
          '<span class="ed-status"><i></i>Tâche ' + t.slice(-1) + '</span></div>' +
        '<div class="editor-corpo"><div class="editor-linhas" aria-hidden="true"></div>' +
          '<div class="editor-folha"><div class="editor" data-editor="' + t + '" contenteditable="true" spellcheck="false" autocorrect="off" autocapitalize="off" data-gramm="false" ' +
          'role="textbox" aria-multiline="true" aria-label="Votre texte pour la tâche ' + t.slice(-1) + '" data-placeholder="' + PLACEHOLDER[t] + '"></div></div></div>' +
        '<div class="editor-rodape"><div class="ed-medidor"><i></i><b class="ed-min" style="left:' + Math.round(100 * lim[0] / lim[1] / 1.25) + '%"></b><b class="ed-max" style="left:' + Math.round(100 / 1.25) + '%"></b></div>' +
          '<span class="ed-contagem"></span></div></div>';
    }

    function textoDoEditor(ed) {
      var t = ed.innerText;
      if (typeof t !== 'string') t = ed.textContent;
      return t.replace(/\u00a0/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    }

    /** Liga um editor: formatação, numeração de linhas, contagem de palavras, bloqueio de colar. */
    function ligarEditor(ed, textoInicial, htmlInicial, aoMudar) {
      var caixa = ed.closest('.editor-caixa'), t = ed.dataset.editor, lim = LIMITES[t];
      var linhas = caixa.querySelector('.editor-linhas'), contagem = caixa.querySelector('.ed-contagem');
      var medidor = caixa.querySelector('.ed-medidor i');
      if (htmlInicial) ed.innerHTML = htmlInicial;
      else if (textoInicial) ed.innerHTML = textoInicial.split('\n').map(function (l) { return '<div>' + (esc(l) || '<br>') + '</div>'; }).join('');
      var alturaLinha = function () { var lh = parseFloat(getComputedStyle(ed).lineHeight); return isNaN(lh) ? 22 : lh; };
      var numerar = function () {
        var n = Math.max(24, Math.round(ed.scrollHeight / alturaLinha()) + 1);
        if (linhas.childElementCount !== n) {
          var h = ''; for (var i = 1; i <= n; i++) h += '<span>' + i + '</span>';
          linhas.innerHTML = h;
        }
      };
      var atualizar = function () {
        var texto = textoDoEditor(ed), n = contarPalavras(texto);
        ed.classList.toggle('vazio', !texto);
        contagem.textContent = n + ' mot' + (n > 1 ? 's' : '') + ' (min. ' + lim[0] + ', max. ' + lim[1] + ')';
        var estado = n > lim[1] ? 'alto' : n >= lim[0] ? 'ok' : n ? 'baixo' : '';
        caixa.dataset.estado = estado;
        medidor.style.width = Math.min(100, 100 * n / (lim[1] * 1.25)) + '%';
        numerar();
        return texto;
      };
      caixa.querySelectorAll('.ed-bt').forEach(function (b) {
        b.addEventListener('mousedown', function (e) { e.preventDefault(); });
        b.addEventListener('click', function () {
          if (ed.getAttribute('contenteditable') !== 'true') return;
          ed.focus();
          try { document.execCommand(b.dataset.cmd, false, null); } catch (e) {}
          aoMudar(atualizar(), ed.innerHTML);
          atualizarBotoes();
        });
      });
      var atualizarBotoes = function () {
        caixa.querySelectorAll('.ed-bt').forEach(function (b) {
          var ativo = false;
          try { ativo = /bold|italic|underline|justify/.test(b.dataset.cmd) && document.queryCommandState(b.dataset.cmd); } catch (e) {}
          b.classList.toggle('ativo', !!ativo);
        });
      };
      ed.addEventListener('input', function () { aoMudar(atualizar(), ed.innerHTML); });
      ed.addEventListener('keyup', atualizarBotoes);
      ed.addEventListener('mouseup', atualizarBotoes);
      ed.addEventListener('focus', function () { caixa.classList.add('foco'); });
      ed.addEventListener('blur', function () { caixa.classList.remove('foco'); });
      ed.addEventListener('paste', function (e) { e.preventDefault(); });
      ed.addEventListener('drop', function (e) { e.preventDefault(); });
      window.addEventListener('resize', numerar);
      atualizar();
    }

    function bloquearEditores() {
      document.querySelectorAll('#tela-epreuve .editor').forEach(function (ed) {
        ed.setAttribute('contenteditable', 'false');
        ed.closest('.editor-caixa').classList.add('bloqueado');
      });
    }

    function salvarServidor() {
      if (!EP || EP.fechada) return;
      epSujo = false;
      google.script.run.withSuccessHandler(function (r) {
        if (r && r.fechada) { mostrarResultadoEpreuve(r, true); return; }
        var s = $('ep-salvo'); if (s) s.textContent = 'Brouillon enregistré à ' + new Date().toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' });
      }).withFailureHandler(function () { epSujo = true; var s = $('ep-salvo'); if (s) s.textContent = 'Connexion perdue : nouvel essai dans 20 s (brouillon gardé sur cet appareil)'; })
        .salvarRascunhoEpreuve(EMAIL, EP.textes, EP.consumido || 0);
    }

    function fecharEpreuve(automatico) {
      if (!EP || EP.fechada) return;
      EP.fechada = true;
      pararEpreuveTimers();
      bloquearEditores();
      var b = $('ep-enviar'); if (b) { b.disabled = true; b.textContent = 'Envoi en cours…'; }
      if (automatico) { bip(); $('ep-fase').textContent = 'Temps écoulé : l\'épreuve est fermée et vos textes sont envoyés.'; }
      var tentar = function (n) {
        google.script.run.withSuccessHandler(function (r) { mostrarResultadoEpreuve(r, automatico); })
          .withFailureHandler(function (e) {
            if (n < 3) { setTimeout(function () { tentar(n + 1); }, 4000); return; }
            $('ep-resultado').innerHTML = '<div class="alerta">' + esc(e.message || e) + '. Ne vous inquiétez pas : l\'épreuve sera envoyée automatiquement par le serveur dans quelques minutes.</div>';
          }).terminerEpreuve(EMAIL, EP.textes);
      };
      tentar(0);
    }

    function mostrarResultadoEpreuve(r, automatico) {
      pararEpreuveTimers();
      if (EP) EP.fechada = true;
      try { localStorage.removeItem('fnm_ep_' + EMAIL); } catch (e) {}
      var b = $('ep-enviar'); if (b) { b.disabled = true; b.textContent = r.bloqueada ? 'Non envoyée' : '✓ Envoyée'; }
      bloquearEditores();
      var alvo = $('ep-resultado'); if (!alvo) return;
      alvo.innerHTML = '<div class="bloco ep-ok' + (r.bloqueada ? ' bloqueada' : '') + '"><h3>' +
        (r.bloqueada ? 'Entraînement terminé' : r.quantidade ? '✓ Épreuve envoyée' + (automatico ? ' automatiquement' : '') + ' (' + r.quantidade + ' tâche' + (r.quantidade > 1 ? 's' : '') + ')' : 'Épreuve terminée') + '</h3>' +
        (r.doc ? '<p><a href="' + esc(r.doc) + '" target="_blank" rel="noopener">Ouvrir mon document</a></p>' : '') +
        (r.aviso ? '<p class="aviso">' + esc(r.aviso) + '</p>' : '') +
        '<div class="ferramentas"><button class="ferramenta destaque" type="button" id="ep-outra">Nouvelle épreuve</button><button class="ferramenta" type="button" id="ep-notas">Mes notes</button><button class="ferramenta" type="button" id="ep-accueil">Accueil</button></div></div>';
      if (EP && !EP.sessao) alvo.innerHTML += htmlEnvioEpreuve(r);
      // Treino livre: a IA corrige cada tâche (a prova da professora é corrigida por ela).
      // Se o aluno não está autorizado a enviar, a correção começa sozinha; senão, fica disponível num botão.
      ligarEnvioEpreuve(r);
      if (EP && !EP.sessao && EP.correcao !== 'professor') {
        var comTexto = ETS().filter(function (t) { return EP.sujets[t] && contarPalavras(EP.textes[t] || '') >= 15; });
        if (!B.ia || !B.ia.ativa) {
          alvo.innerHTML += '<div class="alerta">La correction automatique par l\'IA n\'est pas encore activée' +
            (B.ia && B.ia.motivo === 'desligada' ? ' (désactivée dans la configuration).' : '.') + ' Parlez-en à votre professeur(e).</div>';
        } else if (comTexto.length) {
          alvo.innerHTML += '<div class="bloco ia-convite"><h3>' + 'Correction de vos textes par l\'IA' + '</h3>' +
            '<p class="aviso" style="margin-top:0">Note sur 20, commentaires, corrections, lexique et une version améliorée qui suit la trame de chaque tâche. ' +
            'La correction apparaît sous chacun de vos textes.' + '</p></div>';
          comTexto.forEach(function (t) {
            var caixa = document.querySelector('#tela-epreuve [data-caixa="' + t + '"]');
            if (!caixa) return;
            var zona = document.createElement('div');
            zona.className = 'ia-zona';
            zona.innerHTML = botaoIA('ia-' + t) + '<div class="ia-resultado" id="ia-res-' + t + '"></div>';
            caixa.parentNode.insertBefore(zona, caixa.nextSibling);
            $('ia-' + t).addEventListener('click', function () { pedirCorrecaoIA(t, EP.sujets[t].id, EP.textes[t], $('ia-res-' + t), $('ia-' + t)); });
          });
          corrigirEmSequencia(comTexto);
        }
      }
      $('ep-outra').addEventListener('click', function () { EP = null; abrirEpreuve(); });
      $('ep-notas').addEventListener('click', abrirNotes);
      $('ep-accueil').addEventListener('click', irAccueil);
      alvo.scrollIntoView({ behavior: 'smooth' });
    }

    // ================= produção oral gravada (tarefa da professora) =================
    var GRAV = null;   // { rec, stream, chunks, ctx, anim, timer }
    var PREP_ORAL = { T1: 0, T2: 120, T3: 0 };

    function pararGravacaoTudo() {
      if (!GRAV) return;
      try { if (GRAV.rec && GRAV.rec.state !== 'inactive') GRAV.rec.stop(); } catch (e) {}
      try { GRAV.stream && GRAV.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
      try { GRAV.ctx && GRAV.ctx.close(); } catch (e) {}
      if (GRAV.timer) clearInterval(GRAV.timer);
      if (GRAV.anim) cancelAnimationFrame(GRAV.anim);
      GRAV = null;
    }

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
          $('gravador').innerHTML = '<div class="bloco ep-ok"><h3>✓ Enregistrement envoyé</h3><p class="aviso">Votre professeur(e) va l\'écouter et le corriger dans le Sistema de Correção. La note et la correction apparaîtront dans « Mes notes ».</p>' +
            '<div class="ferramentas"><button class="ferramenta destaque" type="button" id="grav-volta">← Mes épreuves</button></div></div>';
          $('grav-volta').addEventListener('click', abrirEpreuve);
        }).catch(function (e) {
          bt.disabled = false; bt.textContent = 'Envoyer à mon professeur';
          msg('' + (e.message || e) + '. Votre enregistrement est toujours là, réessayez.');
        });
      });
    }

    // ================= proteção dos modelos =================
    function protegerConteudo(raiz) {
      raiz.classList.add('protegido');
      var txt = B.email || EMAIL;
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="360" height="160"><text x="10" y="90" fill="rgba(28,43,58,0.07)" font-size="15" font-family="Arial" transform="rotate(-18 180 80)">' +
        txt.replace(/[<>&"]/g, '') + ' · Français na Mira</text></svg>';
      raiz.style.setProperty('--marca-agua', 'url("data:image/svg+xml;utf8,' + encodeURIComponent(svg) + '")');
      var livre = function (t) { return t.closest && t.closest('input, textarea, [contenteditable="true"], .painel-dictee, .rascunho'); };
      ['copy', 'cut', 'contextmenu', 'dragstart'].forEach(function (ev) {
        raiz.addEventListener(ev, function (e) {
          if (livre(e.target)) return;
          e.preventDefault();
          if (ev === 'copy' || ev === 'cut') avisar({ titulo: 'Copie désactivée', texto: 'Les modèles Français na Mira sont réservés à votre entraînement personnel.', icone: '', som: false, duracao: 5 });
        });
      });
    }

    // ================= gravador pessoal (treino oral, não enviado) =================
    /** Guia da trame da tâche (e, no treino, um exemplo de produção). */
    function htmlMetodo(tache, comExemplo) {
      var tr = B.trames[tache]; if (!tr) return '';
      var html = '<details class="metodo"><summary>Méthode pas à pas : ' + esc(tr.titulo || 'la trame') + '</summary>' +
        (tr.sousTitre ? '<p class="aviso">' + esc(tr.sousTitre) + '</p>' : '') + '<ol class="metodo-passos">' +
        (tr.etapes || []).map(function (e) { return '<li style="--c:' + (e.cor || '#E4C043') + '"><b>' + esc(e.rotulo) + '</b><span>' + esc(e.texte) + '</span></li>'; }).join('') + '</ol>' +
        (tr.conseil ? '<p class="metodo-conselho">' + esc(tr.conseil) + '</p>' : '');
      if (comExemplo) {
        var fonte = (tache.indexOf('ET') === 0 ? (B.ecrite[tache] || []) : (B.orale[tache] || [])).concat((B.atelier || []).filter(function (a) { return a.tache === tache; }));
        var ex = fonte[Math.floor(Math.random() * fonte.length)];
        if (ex) {
          var texto = ex.p || (ex.etapes || []).join('\n') || [ex.c].concat((ex.ech || []).map(function (x) { return 'Candidat : ' + x.q + '\nExaminateur : ' + x.r; })).join('\n');
          html += '<details class="metodo-exemplo"><summary>Voir un exemple de production (' + esc(ex.titre) + ')</summary><div class="ia-versao">' +
            String(texto).split(/\n+/).filter(function (x) { return x.trim(); }).map(function (x) { return '<p>' + destacar(x.trim(), ex.k || []) + '</p>'; }).join('') + '</div></details>';
        }
      }
      return html + '</details>';
    }

function htmlGravadorLivre(tache) {
      var lim = { T1: 120, T2: 210, T3: 270 }[tache];
      return '<div class="bloco gravador-livre" id="grav-livre"><h3>M\'entraîner à l\'oral</h3>' +
        '<p class="aviso" style="margin-top:0">Enregistrez-vous (' + formatarTempo(lim) + ' max.), réécoutez-vous et comparez avec le modèle. Votre parole est transcrite : vous pouvez la corriger, puis envoyer l\'enregistrement et la transcription à la correction choisie ci-dessus (IA ou professeur).</p>' +
        '<div class="gl-linha"><button class="ferramenta destaque" type="button" data-gl="gravar">● Enregistrer</button><button class="ferramenta" type="button" data-gl="parar" hidden>■ Arrêter</button>' +
        '<span class="gl-tempo" data-gl="tempo">0:00 / ' + formatarTempo(lim) + '</span></div><p class="gl-viva" data-gl="viva" hidden></p><div data-gl="lista"></div></div>';
    }
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
              '<div class="gl-acoes"><button class="botao-principal" type="button" data-gl-enviar>Envoyer l\'enregistrement et la transcription</button><span class="aviso" data-gl-st></span></div><div class="ia-resultado" data-gl-res></div>';
            q('lista').insertBefore(item, q('lista').firstChild);
            var ta = item.querySelector('textarea');
            // Um só envio: áudio + transcrição para quem o aluno escolheu em « Qui corrige ? ».
            item.querySelector('[data-gl-enviar]').addEventListener('click', function () {
              enviarEssaiOral(this, { blob: blob, tache: tache, m: m, duree: dur, transcricao: ta.value, st: item.querySelector('[data-gl-st]'), res: item.querySelector('[data-gl-res]') });
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

    // ================= devoirs (aluno) =================
    var DEVOIRS = [];
    function htmlDevoirs(lista) {
      return '<div class="devoirs-lista">' + lista.map(function (d) {
        return '<button class="devoir-item' + (d.feito ? ' feito' : '') + '" type="button" data-dv-id="' + esc(d.id) + '"><span class="dv-tipo">' + esc(d.tipoNome) + '</span>' +
          '<b>' + esc(d.titre) + '</b><small>' + nomeTache(d.tache) + (d.mensagem ? ' · « ' + esc(d.mensagem.slice(0, 90)) + ' »' : '') + '</small>' +
          '<em>' + (d.feito ? '✓ Fait' + (d.score !== '' ? ' · ' + d.score + '/' + d.total : '') : 'À faire →') + '</em></button>';
      }).join('') + '</div>';
    }
    function ligarDevoirs(raiz) {
      raiz.querySelectorAll('[data-dv-id]').forEach(function (b) {
        b.addEventListener('click', function () {
          var d = DEVOIRS.filter(function (x) { return x.id === b.dataset.dvId; })[0];
          abrirModelo(d.tache, d.modelo, { tipo: 'devoir', devoir: d });
        });
      });
    }

    /** Selo no menu "Mes tâches" com o número de tarefas pendentes (devoirs + épreuves). */
    function atualizarSeloTarefas(cb) {
      if (!B || B.professor) return;
      var feitos = 0, devs = null, sess = null;
      var fim = function () {
        if (++feitos < 2) return;
        var n = devs.filter(function (d) { return !d.feito; }).length + (MENSAGENS || []).filter(function (m) { return !m.feito; }).length;
        var selo = $('selo-tarefas');
        selo.textContent = n; selo.hidden = !n;
        if (cb) cb(devs, sess);
      };
      google.script.run.withSuccessHandler(function (l) { DEVOIRS = devs = l || []; fim(); }).withFailureHandler(function () { devs = []; fim(); }).meusDevoirs(EMAIL);
      google.script.run.withSuccessHandler(function (l) { MENSAGENS = l || []; sess = []; fim(); }).withFailureHandler(function () { sess = []; fim(); }).mesMessages(EMAIL);
    }

    function carregarDevoirsAccueil() {
      if (B.professor) return;
      google.script.run.withSuccessHandler(function (l) {
        DEVOIRS = l || [];
        var alvo = $('acc-devoirs'); if (!alvo) return;
        var pend = DEVOIRS.filter(function (d) { return !d.feito; });
        alvo.innerHTML = '<div class="bloco devoirs-bloco compacto"><h2>Mes devoirs <small>' + (pend.length ? pend.length + ' à faire' : 'rien en attente') + '</small></h2>' +
          (pend.length ? htmlDevoirs(pend.slice(0, 3)) : '<p class="aviso" style="margin:0">Les devoirs donnés par votre professeur(e) apparaîtront ici.</p>') +
          '<button class="ferramenta" type="button" id="acc-ver-tarefas" style="margin-top:10px">Ouvrir mes devoirs →</button></div>';
        ligarDevoirs(alvo);
        $('acc-ver-tarefas').addEventListener('click', abrirTarefas);
      }).meusDevoirs(EMAIL);
    }

    /** Destaque da tela inicial: temas do mês escolhidos pela professora (abertos para todos). */
    function carregarTemasDoMes() {
      google.script.run.withSuccessHandler(function (l) {
        TEMAS_MES = l || []; TEMAS_MES_IDS = {};
        TEMAS_MES.forEach(function (t) { TEMAS_MES_IDS[t.id] = 1; });
        carregarDestaques();
      }).obterTemasDoMes(EMAIL);
    }

    // Ilustrações do blog (cores Français na Mira). A professora pode trocar por uma foto (link) no painel "Blog".
    var ILUSTRACOES = {
      etude: '<svg viewBox="0 0 400 220" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="gE" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1C2B3A"/><stop offset="1" stop-color="#2d4660"/></linearGradient></defs>' +
        '<rect width="400" height="220" fill="url(#gE)"/><circle cx="335" cy="48" r="26" fill="none" stroke="#E4C043" stroke-width="3" opacity=".7"/><circle cx="335" cy="48" r="14" fill="none" stroke="#E4C043" stroke-width="3" opacity=".7"/><circle cx="335" cy="48" r="5" fill="#D51E28"/>' +
        '<rect x="0" y="170" width="400" height="50" fill="#E4C043"/><rect x="0" y="166" width="400" height="6" fill="#c9a62e"/>' +
        '<rect x="205" y="112" width="110" height="58" rx="6" fill="#dfe8f0"/><rect x="212" y="119" width="96" height="44" rx="3" fill="#94C4EC"/><rect x="190" y="166" width="140" height="6" rx="3" fill="#9aa9b8"/>' +
        '<rect x="220" y="128" width="60" height="4" rx="2" fill="#fff" opacity=".9"/><rect x="220" y="137" width="72" height="4" rx="2" fill="#fff" opacity=".7"/><rect x="220" y="146" width="48" height="4" rx="2" fill="#fff" opacity=".7"/>' +
        '<circle cx="128" cy="74" r="22" fill="#f1c9a5"/><path d="M106 70c2-18 38-22 44-2-8-8-26-10-44 2z" fill="#3b2a20"/><path d="M92 170c0-44 16-66 36-66s36 22 36 66z" fill="#D51E28"/>' +
        '<path d="M100 150l58 -8 22 22-60 8z" fill="#fff"/><path d="M129 146v26" stroke="#c9d3dc" stroke-width="2"/><rect x="330" y="120" width="10" height="50" fill="#8a6d4f"/><circle cx="335" cy="112" r="16" fill="#3f8f4f"/><circle cx="324" cy="120" r="10" fill="#4fa35f"/></svg>',
      oral: '<svg viewBox="0 0 400 220" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="gO" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1C2B3A"/><stop offset="1" stop-color="#3b5a78"/></linearGradient></defs>' +
        '<rect width="400" height="220" fill="url(#gO)"/><rect x="0" y="178" width="400" height="42" fill="#E4C043"/>' +
        '<circle cx="150" cy="78" r="24" fill="#c98f6b"/><path d="M126 72c0-22 48-24 48 0-10-8-38-8-48 0z" fill="#1f1a17"/><path d="M110 178c0-48 18-72 40-72s40 24 40 72z" fill="#94C4EC"/>' +
        '<rect x="196" y="112" width="12" height="28" rx="6" fill="#1C2B3A" stroke="#E4C043" stroke-width="2"/><path d="M202 140v22" stroke="#E4C043" stroke-width="3"/><path d="M172 132l26-8" stroke="#c98f6b" stroke-width="8" stroke-linecap="round"/>' +
        '<g><rect x="232" y="34" width="132" height="46" rx="14" fill="#fff"/><path d="M246 80l-8 16 22-16z" fill="#fff"/><text x="298" y="63" text-anchor="middle" font-family="Georgia,serif" font-size="17" fill="#1C2B3A">Bonjour !</text></g>' +
        '<g><rect x="262" y="96" width="104" height="38" rx="12" fill="#D51E28"/><text x="314" y="120" text-anchor="middle" font-family="Georgia,serif" font-size="15" fill="#fff">À mon avis…</text></g>' +
        '<path d="M60 60q10 10 0 20M48 52q18 18 0 36" stroke="#E4C043" stroke-width="3" fill="none" stroke-linecap="round" opacity=".8"/></svg>',
      ecrit: '<svg viewBox="0 0 400 220" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="gW" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2d4660"/><stop offset="1" stop-color="#1C2B3A"/></linearGradient></defs>' +
        '<rect width="400" height="220" fill="url(#gW)"/><rect x="0" y="176" width="400" height="44" fill="#E4C043"/>' +
        '<g transform="rotate(-6 150 120)"><rect x="80" y="44" width="150" height="140" rx="4" fill="#fff"/><rect x="96" y="62" width="90" height="6" rx="3" fill="#1C2B3A"/>' +
        '<rect x="96" y="80" width="118" height="4" rx="2" fill="#c9d3dc"/><rect x="96" y="92" width="110" height="4" rx="2" fill="#c9d3dc"/><rect x="96" y="104" width="118" height="4" rx="2" fill="#c9d3dc"/>' +
        '<rect x="96" y="116" width="84" height="4" rx="2" fill="#E4C043"/><rect x="96" y="128" width="116" height="4" rx="2" fill="#c9d3dc"/><rect x="96" y="140" width="100" height="4" rx="2" fill="#c9d3dc"/><rect x="96" y="152" width="70" height="4" rx="2" fill="#D51E28"/></g>' +
        '<g transform="rotate(35 250 120)"><rect x="236" y="60" width="14" height="104" rx="4" fill="#D51E28"/><path d="M236 164h14l-7 18z" fill="#f1c9a5"/><rect x="236" y="60" width="14" height="14" fill="#1C2B3A"/></g>' +
        '<rect x="276" y="104" width="100" height="62" rx="6" fill="#dfe8f0"/><rect x="283" y="111" width="86" height="46" rx="3" fill="#94C4EC"/><rect x="262" y="164" width="128" height="6" rx="3" fill="#9aa9b8"/>' +
        '<text x="326" y="140" text-anchor="middle" font-family="Georgia,serif" font-size="14" fill="#1C2B3A">150 mots</text></svg>'
    };
    function imagemBlog(x) {
      if (x.imagem) return '<img src="' + esc(x.imagem) + '" alt="" loading="lazy" referrerpolicy="no-referrer">';
      return ILUSTRACOES[!x.tache ? 'etude' : x.tache.indexOf('ET') === 0 ? 'ecrit' : x.tache === 'T3' ? 'etude' : 'oral'];
    }

    /** Página inicial: "À la une" — os temas em destaque de cada tâche, em formato de blog. */
function carregarDestaques() {
      var alvo = $('acc-temas-mes'); if (!alvo) return;
      alvo.innerHTML = '<section class="alu alu2"><p class="aviso">Chargement…</p></section>';
      google.script.run.withSuccessHandler(function (r) {
        if (!$('acc-temas-mes')) return;
        var posts = (r && r.posts) || [], sujets = (r && r.sujets) || [];
        if (!posts.length && !sujets.length) { alvo.innerHTML = ''; return; }
        var mes = new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
        // Administrador: ✕ em cada item (artigo apagado; sujet sai do destaque).
        var apagar = function (tipo, ref) { return B.admin ? '<button class="alu-apagar" type="button" data-une-del="' + tipo + '|' + esc(ref) + '" title="Retirer de « À la une »" aria-label="Retirer de « À la une »">✕</button>' : ''; };
        var html = '<section class="alu alu2"><header class="alu-cab"><div><span class="tm-selo">À la une</span><h2>' + esc(mes.charAt(0).toUpperCase() + mes.slice(1)) + '</h2></div>' +
          '<p>Les sujets à travailler en priorité ce mois-ci : un par tâche, choisis par votre professeure ou parmi ceux qui tombent le plus.' +
          (B.admin && r.ocultos ? ' <button class="alu-restaurar" type="button" id="alu-restaurar">Réafficher ' + r.ocultos + ' sujet' + (r.ocultos > 1 ? 's' : '') + ' retiré' + (r.ocultos > 1 ? 's' : '') + '</button>' : '') + '</p></header>';
        if (posts.length) {
          var p0 = posts[0];
          html += '<article class="alu-post alu-destaque" ' + (p0.tache && p0.id ? 'data-bl-t="' + p0.tache + '" data-bl-id="' + esc(p0.id) + '" tabindex="0" role="button"' : '') + '>' +
            apagar('post', p0.ref) + '<div class="alu-post-img">' + imagemBlog(p0) + '</div><div class="alu-post-txt"><span class="alu-rot">Le mot de votre professeure</span><h3>' + esc(p0.titre) + '</h3>' +
            (p0.texto ? '<p>' + esc(String(p0.texto).slice(0, 320)) + '</p>' : '') + (p0.tache && p0.id ? '<b class="alu-link">Lire le modèle →</b>' : '') + '</div></article>';
          if (posts.length > 1) html += '<div class="alu-mini">' + posts.slice(1, 4).map(function (p) {
            return '<article ' + (p.tache && p.id ? 'data-bl-t="' + p.tache + '" data-bl-id="' + esc(p.id) + '" tabindex="0" role="button"' : '') + '>' + apagar('post', p.ref) + '<div class="alu-mini-img">' + imagemBlog(p) + '</div><div><b>' + esc(p.titre) + '</b>' + (p.texto ? '<small>' + esc(String(p.texto).slice(0, 110)) + '</small>' : '') + '</div></article>';
          }).join('') + '</div>';
        }
        var linha = function (rotulo, taches, classe) {
          var itens = taches.map(function (t) { return sujets.filter(function (x) { return x.tache === t; })[0] || { tache: t, vazio: 1 }; });
          return '<div class="alu-linha ' + classe + '"><h4><i></i>' + rotulo + '</h4><div class="alu-grade">' + itens.map(function (x) {
            var info = TACHES[x.tache];
            if (x.vazio) return '<div class="alu-card vazio"><span class="alu-tache">' + info.nom + ' · ' + info.sous + '</span><p>Aucun sujet ouvert pour cette tâche.</p></div>';
            var e = eixo(x.e), titulo = x.titre && x.tache !== 'T2' ? x.titre : tituloCurto(x.texto || x.titre);
            return '<article class="alu-card" style="--cor:' + (e.cor || '#E4C043') + '" data-bl-t="' + x.tache + '" data-bl-id="' + esc(x.id) + '" tabindex="0" role="button">' +
              apagar('sujet', x.id) + '<div class="alu-card-topo"><span class="alu-num">' + info.nom.slice(-1) + '</span><span class="alu-tache">' + info.sous + '</span><span class="alu-ico">' + (e.icone || '') + '</span></div>' +
              '<h5>' + esc(titulo) + '</h5>' +
              '<div class="alu-meta">' + (x.mes ? '<em class="alu-chip mes">Thème du mois</em>' : x.tr ? '<em class="alu-chip tr">Tendance</em>' : '') +
              '<span>' + esc(e.nome || '') + (x.f > 1 ? ' · tombé ' + x.f + '×' : '') + '</span></div><b class="alu-link">Lire le modèle →</b></article>';
          }).join('') + '</div></div>';
        };
        html += '<div class="alu-sujets">' + linha('Expression orale', TS(), 'oral') + linha('Expression écrite', ETS(), 'ecrit') + '</div></section>';
        alvo.innerHTML = html;
        alvo.querySelectorAll('[data-une-del]').forEach(function (b) {
          b.addEventListener('click', function (ev) {
            ev.stopPropagation();
            var p = b.dataset.uneDel.split('|'), tipo = p[0], ref = p.slice(1).join('|');
            if (!confirm(tipo === 'post' ? 'Supprimer cet article du blog « À la une » ?' : 'Retirer ce sujet de « À la une » ? Le sujet suivant le plus fréquent de cette tâche prendra sa place.')) return;
            b.disabled = true;
            google.script.run.withSuccessHandler(function () { carregarDestaques(); avisar({ titulo: 'Retiré de « À la une »', icone: '', som: false, duracao: 4 }); })
              .withFailureHandler(function (e) { b.disabled = false; alert(e.message || e); }).removerDaUne(EMAIL, tipo, ref);
          });
        });
        if ($('alu-restaurar')) $('alu-restaurar').addEventListener('click', function () {
          this.disabled = true;
          google.script.run.withSuccessHandler(function () { carregarDestaques(); }).restaurarUne(EMAIL);
        });
        alvo.querySelectorAll('[data-bl-id]').forEach(function (c) {
          var abrir = function () { abrirModelo(c.dataset.blT, c.dataset.blId, { tipo: 'liste' }); };
          c.addEventListener('click', abrir);
          c.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); abrir(); } });
        });
      }).withFailureHandler(function () { alvo.innerHTML = ''; }).obterDestaques(EMAIL);
    }

    // ---------- mensagens da professora (to-do: fait / pas fait) ----------
    var MENSAGENS = [];
    function htmlMensagens(l) {
      return '<div class="msgs-lista">' + l.map(function (m) {
        return '<div class="msg-item' + (m.feito ? ' feito' : '') + '"><label class="msg-check"><input type="checkbox" data-msg="' + esc(m.id) + '"' + (m.feito ? ' checked' : '') + '><span></span></label>' +
          '<div><p>' + esc(m.texto).replace(/\n/g, '<br>') + '</p><small>' + esc(m.de) + ' · ' + new Date(m.data).toLocaleDateString('fr-CA') + (m.feito ? ' · ✓ fait' : '') + '</small></div></div>';
      }).join('') + '</div>';
    }
    function ligarMensagens(raiz, depois) {
      raiz.querySelectorAll('[data-msg]').forEach(function (c) {
        c.addEventListener('change', function () {
          var item = c.closest('.msg-item');
          item.classList.toggle('feito', c.checked);
          google.script.run.withSuccessHandler(function () {
            MENSAGENS.forEach(function (m) { if (m.id === c.dataset.msg) m.feito = c.checked; });
            if (depois) depois();
          }).marcarMensagem(EMAIL, c.dataset.msg, c.checked);
        });
      });
    }
    function carregarMensagensAccueil() {
      if (B.professor) return;
      google.script.run.withSuccessHandler(function (l) {
        MENSAGENS = l || [];
        var alvo = $('acc-msgs'); if (!alvo) return;
        var pend = MENSAGENS.filter(function (m) { return !m.feito; });
        if (!pend.length) { alvo.innerHTML = ''; return; }
        alvo.innerHTML = '<div class="bloco msgs-bloco compacto"><h2>Messages <small>' + pend.length + ' à faire</small></h2>' + htmlMensagens(pend.slice(0, 3)) +
          '<p class="aviso" style="margin:8px 0 0">Cochez la case quand c\'est fait.</p></div>';
        ligarMensagens(alvo, atualizarSeloTarefas);
      }).mesMessages(EMAIL);
    }

    // ================= JOURNAL DE CLASSE (pacotes de aulas) =================
    var ETATS_ABO = {
      valide: ['FORFAIT : EN COURS', 'ok'], dernier: ['FORFAIT : DERNIER COURS', 'aviso'], termine: ['FORFAIT TERMINÉ : À RENOUVELER', 'erro'],
      bloque: ['FORFAIT NON RENOUVELÉ : ACCÈS SUSPENDU', 'erro'], sans: ['AUCUN FORFAIT ENREGISTRÉ', 'neutro']
    };
    var COR_STATUT = { 'prévu': 'prevu', 'donné': 'presente', 'absent': 'ausente', 'absence justifiée': 'justif', 'annulé (professeur)': 'profabs', 'reposition': 'repo', 'remboursé (professeur)': 'remb' };
    var ROT_STATUT = { 'prévu': 'Prévu', 'donné': 'Cours donné', 'absent': 'Élève absent', 'absence justifiée': 'Élève absent (justifié)', 'annulé (professeur)': 'Professeur absent',
      'reposition': 'Reposition donnée', 'remboursé (professeur)': 'Professeur absent · remboursé' };
    function temModulo(m) { return !B || B.professor || (B.modulos || []).indexOf(m) !== -1; }

    /** Aulas agrupadas por pacote: como cada pacote foi usado, do mais recente ao mais antigo. */
    function htmlPacotes(j, prof) {
      var ps = j.pacotes || [];
      if (!ps.length) return '<p class="aviso" style="margin:0">Aucun forfait pour le moment.</p>';
      var hoje = new Date(); hoje.setHours(0, 0, 0, 0);
      return ps.map(function (p, pi) {
        var r = p.resumo, pct = r && p.cours ? Math.round(100 * (p.cours - r.restants) / p.cours) : 0;
        var aberto = pi === 0 || p.etat === 'en cours';
        var cab = '<summary><div class="pk-cab"><div><span class="pk-num">' + (p.numero ? 'Forfait ' + p.numero : '') + '</span><b>' + esc(p.nome) + '</b>' +
          '<small>' + (p.cours ? p.cours + ' cours' : '') + (p.prix ? ' · ' + (p.remise ? '<s>' + moeda(p.prix) + '</s> ' + moeda(p.total) + ' (remise ' + moeda(p.remise) + (p.motif ? ' : ' + esc(p.motif) : '') + ')' : moeda(p.prix)) : '') + (p.payeLe ? ' · payé le ' + dataFr(p.payeLe) : p.achat ? ' · demandé le ' + dataFr(p.achat) : '') + '</small></div>' +
          '<em class="pk-etat ' + (p.etat === 'en cours' ? 'ok' : p.etat === 'terminé' ? 'fim' : 'pend') + '">' + esc(p.etat) + '</em></div>' +
          (r ? '<div class="pk-prog"><div class="jr-barra"><i style="width:' + pct + '%"></i></div><span>' + (p.cours - r.restants) + ' / ' + p.cours + ' utilisés · <b>' + r.restants + ' restant' + (r.restants > 1 ? 's' : '') + '</b></span></div>' +
            '<div class="pk-chips">' + [['presente', r.donnes, 'donnés'], ['prevu', r.prevus, 'prévus'], ['ausente', r.absences, 'absences élève'], ['justif', r.justifiees, 'absences justifiées'],
              ['profabs', r.profAbsent, 'professeur absent'], ['remb', r.rembourses, 'remboursés'], ['justif', r.aConfirmer, 'à confirmer']].filter(function (x) { return x[1]; }).map(function (x) {
              return '<span class="jr-st ' + x[0] + '">' + x[1] + ' ' + x[2] + '</span>';
            }).join('') + '</div>' : '') +
          // aluno: forfait pendente sem comprovante → pode anexar agora (opcional)
          (!prof && semAcento(p.paiement) !== 'paye' ? (p.justificatif ? '<div class="pk-comp ok">Justificatif envoyé</div>' :
            '<div class="pk-comp"><label>Joindre le justificatif de paiement (facultatif)<input type="file" accept="image/*,application/pdf" data-pk-comp="' + p.linha + '"></label></div>') : '') +
          (prof && p.justificatif ? '<div class="pk-comp ok"><a href="' + esc(p.justificatif) + '" target="_blank" rel="noopener">Voir le justificatif de paiement</a></div>' : '') +
          '</summary>';
        var linhas = p.aulas.map(function (c, i) {
          var st = c.statut || 'prévu', passado = c.data < hoje.getTime() && st === 'prévu';
          var resol = st === 'annulé (professeur)' ? (c.reposition ? '→ reposition le ' + dataFr(c.reposition) : '<b class="pk-resol">→ à résoudre : reposition ou remboursement</b>') :
            st === 'remboursé (professeur)' ? '→ cours remboursé' : st === 'absence justifiée' && c.reposition ? '→ reposition le ' + dataFr(c.reposition) : '';
          if (prof) {
            return '<div class="jr-lin' + (passado ? ' confirmar' : '') + '" data-lin="' + c.linha + '"><span>' + (i + 1) + '</span>' +
              '<span><input type="date" value="' + dataIso(c.data) + '" data-c="data"><input type="time" value="' + esc(c.hora || '') + '" data-c="hora"></span>' +
              '<span><select data-c="statut">' + j.statuts.map(function (x) { return '<option value="' + x + '"' + (x === st ? ' selected' : '') + '>' + (ROT_STATUT[x] || x) + '</option>'; }).join('') + '</select>' +
              (passado ? '<small class="jr-conf">à confirmer</small>' : '') + (resol ? '<small class="pk-sub">' + resol + '</small>' : '') + '</span>' +
              '<span><input type="date" value="' + dataIso(c.reposition) + '" data-c="reposition" title="Date de reposition (crée le cours)"></span>' +
              '<span><input type="url" placeholder="certificat (lien)" value="' + esc(c.certificat || '') + '" data-c="certificat">' + (c.certificat ? '<a class="cert-ver" href="' + esc(c.certificat) + '" target="_blank" rel="noopener">Voir le certificat</a>' : '') + '</span>' +
              '<span class="jr-acoes"><input type="text" placeholder="obs. (ex. : remboursé par Pix)" value="' + esc(c.obs || '') + '" data-c="obs"><button class="ferramenta destaque" type="button" data-c-salvar title="Enregistrer">✓</button><button class="ferramenta perigo" type="button" data-c-del title="Supprimer">' + ICO.lixo + '</button></span></div>';
          }
          var podeCert = (st === 'absent' || st === 'absence justifiée') && !c.certificat;
          return '<div class="jr-lin"><span>' + (i + 1) + '</span><span><b>' + dataFr(c.data, { weekday: 'short', day: '2-digit', month: '2-digit', year: '2-digit' }) + '</b> ' + esc(c.hora || '') + '</span>' +
            '<span><em class="jr-st ' + (passado ? 'justif' : (COR_STATUT[st] || 'prevu')) + '">' + esc(passado ? 'à confirmer' : (ROT_STATUT[st] || st)) + '</em>' + (resol ? '<small class="pk-sub">' + resol + '</small>' : '') + (c.obs ? '<small class="pk-sub">' + esc(c.obs) + '</small>' : '') + '</span>' +
            '<span>' + (c.certificat ? '<a href="' + esc(c.certificat) + '" target="_blank" rel="noopener">certificat</a>' : podeCert ? '<button class="ferramenta" type="button" data-cert="' + c.linha + '">Joindre le certificat médical</button><button class="ferramenta sutil" type="button" data-cert-link="' + c.linha + '" title="Coller un lien Google Drive">ou un lien</button>' : '') + '</span></div>';
        }).join('');
        return '<details class="pk"' + (aberto ? ' open' : '') + '>' + cab + (p.aulas.length ? '<div class="jr-tab pk-tab' + (prof ? ' prof' : '') + '">' +
          (prof ? '<div class="jr-cab"><span>N°</span><span>Date</span><span>Statut</span><span>Reposition</span><span>Certificat</span><span></span></div>' : '') + linhas + '</div>' :
          '<p class="aviso" style="margin:8px 0 0">' + (p.etat === 'en attente de paiement' ? 'Les cours seront planifiés dès la confirmation du paiement.' : 'Aucun cours.') + '</p>') + '</details>';
      }).join('');
    }
    function dataFr(ms, op) { if (!ms) return '-'; return new Date(ms).toLocaleDateString('fr-FR', op || { day: '2-digit', month: '2-digit', year: 'numeric' }); }
    function dataIso(ms) { if (!ms) return ''; var d = new Date(ms); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
    function moeda(v) { return v === '' || v === null || v === undefined ? '-' : 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

    // ---------- horários (dias + hora) e cálculo automático das aulas ----------
    var DIAS_FR = [['lun', 'Lun', 1], ['mar', 'Mar', 2], ['mer', 'Mer', 3], ['jeu', 'Jeu', 4], ['ven', 'Ven', 5], ['sam', 'Sam', 6], ['dim', 'Dim', 0]];
    var MAPA_DIA = { dim: 0, dom: 0, lun: 1, seg: 1, mar: 2, ter: 2, mer: 3, qua: 3, jeu: 4, qui: 4, ven: 5, sex: 5, sam: 6, sab: 6 };
    function parseHorariosCli(txt) {
      return String(txt || '').split(/[;\n,]+/).map(function (p) {
        var t = semAcento(p), d = t.match(/\b(dim|dom|lun|seg|mar|ter|mer|qua|jeu|qui|ven|sex|sam|sab)/), h = t.match(/(\d{1,2})\s*(?:[:h]\s*(\d{2})?)?/);
        return d && h ? { dia: MAPA_DIA[d[1]], hora: ('0' + h[1]).slice(-2) + ':' + (h[2] || '00') } : null;
      }).filter(Boolean);
    }
    /** Próximas n aulas depois de "depoisMs" (exclusivo), pelos horários. */
    function proxAulasCli(txt, depoisMs, n) {
      var hs = parseHorariosCli(txt).sort(function (a, b) { return a.dia - b.dia || a.hora.localeCompare(b.hora); }), saida = [];
      if (!hs.length) return saida;
      var d = new Date(depoisMs); d.setHours(0, 0, 0, 0);
      for (var g = 0; saida.length < n && g < 800; g++) {
        d.setDate(d.getDate() + 1);
        hs.forEach(function (h) { if (saida.length < n && d.getDay() === h.dia) saida.push({ data: d.getTime(), hora: h.hora }); });
      }
      return saida;
    }
    function htmlEditorHorarios(txt) {
      var atuais = parseHorariosCli(txt);
      return '<div class="ed-hor">' + DIAS_FR.map(function (d) {
        var h = atuais.filter(function (x) { return x.dia === d[2]; })[0];
        return '<div class="ed-dia' + (h ? ' on' : '') + '" data-dia="' + d[1] + '"><button type="button" class="ed-dia-bt" aria-pressed="' + !!h + '">' + d[1] + '</button>' +
          '<input type="time" value="' + (h ? h.hora : '19:00') + '"' + (h ? '' : ' hidden') + ' aria-label="Heure ' + d[1] + '"></div>';
      }).join('') + '</div>';
    }
    function ligarEditorHorarios(raiz, aoMudar) {
      raiz.querySelectorAll('.ed-dia').forEach(function (d) {
        d.querySelector('.ed-dia-bt').addEventListener('click', function () {
          d.classList.toggle('on'); this.setAttribute('aria-pressed', d.classList.contains('on'));
          d.querySelector('input').hidden = !d.classList.contains('on');
          if (aoMudar) aoMudar();
        });
        d.querySelector('input').addEventListener('change', function () { if (aoMudar) aoMudar(); });
      });
    }
    function lerEditorHorarios(raiz) {
      return Array.prototype.slice.call(raiz.querySelectorAll('.ed-dia.on')).map(function (d) { return d.dataset.dia + ' ' + d.querySelector('input').value; }).join('; ');
    }
    function htmlDatas(l) {
      return l.length ? '<div class="renov-datas">' + l.map(function (a) { return '<span>' + dataFr(a.data, { weekday: 'short', day: '2-digit', month: '2-digit' }) + ' · ' + a.hora + '</span>'; }).join('') + '</div>' : '';
    }
    /** Nota de compra: abre numa janela elegante, pronta para imprimir ou salvar em PDF. */
    function verNotaCompra(linha, alunoEmail) {
      google.script.run.withSuccessHandler(function (r) {
        var fundo = document.createElement('div');
        fundo.className = 'nota-modal';
        fundo.innerHTML = '<div class="nota-caixa"><div class="nota-barra"><b>Nota de compra ' + esc(r.numero) + '</b><span><button class="ferramenta destaque" type="button" data-imp>Imprimer / PDF</button>' +
          '<button class="ferramenta" type="button" data-fechar aria-label="Fermer">✕</button></span></div><iframe title="Nota de compra"></iframe></div>';
        (document.getElementById('fnm-raiz') || document.body).appendChild(fundo);
        var fr = fundo.querySelector('iframe');
        fr.srcdoc = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Nota ' + r.numero + '</title></head><body style="margin:24px;background:#f4f7fa">' + r.html + '</body></html>';
        fundo.querySelector('[data-fechar]').addEventListener('click', function () { fundo.remove(); });
        fundo.addEventListener('click', function (e) { if (e.target === fundo) fundo.remove(); });
        fundo.querySelector('[data-imp]').addEventListener('click', function () { try { fr.contentWindow.focus(); fr.contentWindow.print(); } catch (e) {} });
      }).withFailureHandler(function (e) { alert(e.message || e); }).obterNotaCompra(EMAIL, linha, alunoEmail || '');
    }

    function htmlSituacao(j) {
      var s2 = j.situacao, e = ETATS_ABO[s2.etat] || ETATS_ABO.sans;
      var html = '<div class="jr-faixa ' + e[1] + '">' + e[0] + '</div>';
      if (s2.etat !== 'sans') {
        var pct = s2.comprados ? Math.min(100, Math.round(100 * (s2.consumidos + s2.aConfirmar) / s2.comprados)) : 0;
        html += '<div class="jr-abo"><div><span>Cours du forfait</span><b>' + Math.max(0, s2.restantes) + ' restant' + (s2.restantes > 1 ? 's' : '') + ' sur ' + s2.comprados + '</b><div class="jr-barra"><i style="width:' + pct + '%"></i></div></div>' +
          '<div><span>Prochain cours</span><b>' + (s2.proximaAula ? dataFr(s2.proximaAula, { weekday: 'long', day: '2-digit', month: '2-digit' }) : '-') + '</b><small>' + s2.agendados + ' cours planifié' + (s2.agendados > 1 ? 's' : '') + '</small></div>' +
          '<div><span>Renouvellement</span><b>' + (s2.prazoRenovacao ? 'avant le ' + dataFr(s2.prazoRenovacao) : '-') + '</b><small>' + (s2.prolongadoAte ? 'accès prolongé jusqu\'au ' + dataFr(s2.prolongadoAte) : 'date du cours qui suivrait le forfait') + '</small></div></div>';
      }
      if (s2.pendentes && s2.pendentes.length) html += '<p class="aviso">Paiement en attente : ' + s2.pendentes.map(function (p) { return esc(p.nome) + ' (' + p.cours + ' cours · ' + moeda(p.prix) + ')'; }).join(', ') + '.</p>';
      return html;
    }

    /** Aulas agrupadas por mês, numeradas como no journal da planilha. */
    function htmlCours(j, prof) {
      if (!j.cours.length) return '<p class="aviso" style="margin:0">Aucun cours planifié pour le moment.</p>';
      var hoje = new Date(); hoje.setHours(0, 0, 0, 0);
      var porMes = {}, ordem = [];
      j.cours.forEach(function (c, n) {
        c.n = n + 1;
        var k = new Date(c.data).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
        if (!porMes[k]) { porMes[k] = []; ordem.push(k); }
        porMes[k].push(c);
      });
      var mesAtual = new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
      if (ordem.indexOf(mesAtual) === -1) mesAtual = ordem.filter(function (m) { return porMes[m].some(function (c) { return c.data >= hoje.getTime(); }); })[0] || ordem[ordem.length - 1];
      return ordem.map(function (mes, mi) {
        var resumoMes = porMes[mes].filter(function (c) { return c.statut === 'donné' || c.statut === 'reposition'; }).length + ' donné(s) · ' + porMes[mes].length + ' cours';
        return '<details class="jr-mes"' + (mes === mesAtual ? ' open' : '') + '><summary><h4>Mois ' + (mi + 1) + ' · <span>' + esc(mes) + '</span>' + (mes === mesAtual ? ' <em class="jr-mini ok">mois en cours</em>' : '') +
          ' <small>' + resumoMes + '</small></h4></summary><div class="jr-tab' + (prof ? ' prof' : '') + '">' +
          '<div class="jr-cab"><span>N°</span><span>Classe</span><span>Statut</span><span>Reposition</span><span>Certificat</span>' + (prof ? '<span></span>' : '') + '</div>' +
          porMes[mes].map(function (c) {
            var st = c.statut || 'prévu', passado = c.data < hoje.getTime() && st === 'prévu';
            if (prof) {
              return '<div class="jr-lin' + (passado ? ' confirmar' : '') + '" data-lin="' + c.linha + '"><span>' + c.n + '</span>' +
                '<span><input type="date" value="' + dataIso(c.data) + '" data-c="data"><input type="time" value="' + esc(c.hora || '') + '" data-c="hora"></span>' +
                '<span><select data-c="statut">' + j.statuts.map(function (x) { return '<option' + (x === st ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select>' + (passado ? '<small class="jr-conf">à confirmer</small>' : '') + '</span>' +
                '<span><input type="date" value="' + dataIso(c.reposition) + '" data-c="reposition" title="Date de reposition (crée le cours)"></span>' +
                '<span><input type="url" placeholder="lien" value="' + esc(c.certificat || '') + '" data-c="certificat"></span>' +
                '<span class="jr-acoes"><input type="text" placeholder="obs." value="' + esc(c.obs || '') + '" data-c="obs"><button class="ferramenta destaque" type="button" data-c-salvar title="Enregistrer">✓</button><button class="ferramenta perigo" type="button" data-c-del title="Supprimer">' + ICO.lixo + '</button></span></div>';
            }
            var podeCert = (st === 'absent' || st === 'absence justifiée') && !c.certificat;
            return '<div class="jr-lin"><span>' + c.n + '</span><span><b>' + dataFr(c.data, { weekday: 'short', day: '2-digit', month: '2-digit' }) + '</b> ' + esc(c.hora || '') + '</span>' +
              '<span><em class="jr-st ' + (passado ? 'justif' : (COR_STATUT[st] || 'prevu')) + '">' + esc(passado ? 'à confirmer' : st) + '</em></span>' +
              '<span>' + (c.reposition ? dataFr(c.reposition) : '-') + '</span>' +
              '<span>' + (c.certificat ? '<a href="' + esc(c.certificat) + '" target="_blank" rel="noopener">lien</a>' : podeCert ? '<button class="ferramenta" type="button" data-cert="' + c.linha + '">Joindre</button>' : '-') + '</span></div>';
          }).join('') + '</div></details>';
      }).join('');
    }

    /**
     * Gráfico de linhas elegante (SVG): curvas suaves, área em degradê, pontos com dica ao passar o mouse,
     * linha da meta tracejada e resumo (último · melhor · progressão) acima.
     * series = [{ nome, cor, pts: [{ i: posição, v: valor, rot: 'texto da dica' }] }] · op = { max, rotulosX: [], meta, metaRot }
     */
    function graficoElegante(series, op) {
      var W = 680, H = 250, E = 44, D = 24, T = 22, Bm = 34, max = op.max || 10, n = Math.max(op.rotulosX.length, 2);
      var X = function (i) { return E + (n === 1 ? (W - E - D) / 2 : i * (W - E - D) / (n - 1)); };
      var Y = function (v) { return T + (1 - v / max) * (H - T - Bm); };
      var uid = 'g' + Math.random().toString(36).slice(2, 7);
      var suave = function (pts) {
        if (pts.length < 2) return '';
        var d = 'M' + X(pts[0].i) + ',' + Y(pts[0].v);
        for (var k = 0; k < pts.length - 1; k++) {
          var p0 = pts[k - 1] || pts[k], p1 = pts[k], p2 = pts[k + 1], p3 = pts[k + 2] || p2;
          var c1x = X(p1.i) + (X(p2.i) - X(p0.i)) / 6, c1y = Y(p1.v) + (Y(p2.v) - Y(p0.v)) / 6;
          var c2x = X(p2.i) - (X(p3.i) - X(p1.i)) / 6, c2y = Y(p2.v) - (Y(p3.v) - Y(p1.v)) / 6;
          d += ' C' + c1x.toFixed(1) + ',' + c1y.toFixed(1) + ' ' + c2x.toFixed(1) + ',' + c2y.toFixed(1) + ' ' + X(p2.i) + ',' + Y(p2.v);
        }
        return d;
      };
      var passo = max <= 10 ? 2 : 5, grade = '';
      for (var g = 0; g <= max; g += passo) grade += '<line x1="' + E + '" x2="' + (W - D) + '" y1="' + Y(g) + '" y2="' + Y(g) + '" class="gr-linha"/><text x="' + (E - 10) + '" y="' + (Y(g) + 4) + '" class="gr-y">' + g + '</text>';
      var cada = Math.ceil(op.rotulosX.length / 8);
      var rotX = op.rotulosX.map(function (r, i) { return i % cada && i !== op.rotulosX.length - 1 ? '' : '<text x="' + X(i) + '" y="' + (H - 10) + '" class="gr-x">' + esc(r) + '</text>'; }).join('');
      var meta = op.meta ? '<line x1="' + E + '" x2="' + (W - D) + '" y1="' + Y(op.meta) + '" y2="' + Y(op.meta) + '" class="gr-meta"/><text x="' + (E + 6) + '" y="' + (Y(op.meta) - 6) + '" class="gr-meta-rot">' + esc(op.metaRot || ('Objectif ' + op.meta)) + '</text>' : '';
      var defs = '', corpo = '', rotulosUlt = [];
      series.forEach(function (s, k) {
        if (!s.pts.length) return;
        var linha = suave(s.pts), id = uid + k;
        defs += '<linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + s.cor + '" stop-opacity=".13"/><stop offset="1" stop-color="' + s.cor + '" stop-opacity="0"/></linearGradient>';
        if (linha) corpo += '<path d="' + linha + ' L' + X(s.pts[s.pts.length - 1].i) + ',' + Y(0) + ' L' + X(s.pts[0].i) + ',' + Y(0) + ' Z" fill="url(#' + id + ')"/>' +
          '<path d="' + linha + '" fill="none" stroke="' + s.cor + '" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>';
        corpo += s.pts.map(function (p, q) {
          var ult = q === s.pts.length - 1;
          return '<g class="gr-ponto"><circle cx="' + X(p.i) + '" cy="' + Y(p.v) + '" r="' + (ult ? 6 : 4.2) + '" fill="#fff" stroke="' + s.cor + '" stroke-width="2.6"/>' +
            '<circle cx="' + X(p.i) + '" cy="' + Y(p.v) + '" r="14" fill="transparent"><title>' + esc(s.nome + ' · ' + (p.rot || '') + ' : ' + p.v) + '</title></circle>' +
            (ult ? (function () {
              // dois últimos pontos colados: o segundo rótulo vai para baixo do ponto
              var yy = Y(p.v) - 12, choca = rotulosUlt.some(function (r) { return Math.abs(r.x - X(p.i)) < 30 && Math.abs(r.y - yy) < 18; }) ||
                series.some(function (o) { var lp = o !== s && o.pts[o.pts.length - 1]; return lp && Math.abs(X(lp.i) - X(p.i)) < 20 && Y(lp.v) < Y(p.v) && Y(p.v) - Y(lp.v) < 32; });
              if (choca) yy = Y(p.v) + 22;
              rotulosUlt.push({ x: X(p.i), y: yy });
              return '<text x="' + X(p.i) + '" y="' + yy + '" class="gr-valor" fill="' + s.cor + '">' + p.v + '</text>';
            })() : '') + '</g>';
        }).join('');
      });
      var resumo = series.filter(function (s) { return s.pts.length; }).map(function (s) {
        var v = s.pts.map(function (p) { return p.v; }), ult = v[v.length - 1], melhor = Math.max.apply(null, v), dif = v.length > 1 ? ult - v[0] : 0;
        return '<div class="gr-kpi" style="--c:' + s.cor + '"><span class="gr-kpi-nome"><i></i>' + esc(s.nome) + '</span><b>' + ult + '<small>' + (op.unidade || '') + '</small></b>' +
          '<span class="gr-kpi-det">meilleur ' + melhor + (v.length > 1 ? ' · <em class="' + (dif > 0 ? 'sobe' : dif < 0 ? 'desce' : '') + '">' + (dif > 0 ? '▲ +' : dif < 0 ? '▼ ' : '= ') + dif + '</em> depuis le début' : '') + '</span></div>';
      }).join('');
      return '<div class="gr-card"><div class="gr-kpis">' + resumo + '</div><svg viewBox="0 0 ' + W + ' ' + H + '" class="gr-svg" role="img" aria-label="' + esc(op.titulo || 'Graphique') + '"><defs>' + defs + '</defs>' + grade + meta + corpo + rotX + '</svg></div>';
    }

    var COR_ECRIT = '#1F5F93', COR_ORAL = '#C8912A';
    function htmlGraficoNclc(comp) {
      var pts = [];
      ['PE', 'PO'].forEach(function (ep) { ((comp[ep] || {}).historico || []).forEach(function (h) { pts.push({ d: h.data, t: Number(h.total), ep: ep }); }); });
      if (!pts.length) return '<p class="gr-vazio">Le graphique apparaîtra après vos premières évaluations.</p>';
      pts.sort(function (a, b) { return a.d - b.d; });
      pts = pts.slice(-24);
      var s = { PE: { nome: 'Écrit', cor: COR_ECRIT, pts: [] }, PO: { nome: 'Oral', cor: COR_ORAL, pts: [] } };
      pts.forEach(function (p, i) { var n = nclc(p.t); s[p.ep].pts.push({ i: i, v: typeof n === 'number' ? n : 3, rot: dataFr(p.d) }); });
      return graficoElegante([s.PE, s.PO], { max: 10, meta: 7, metaRot: 'Objectif NCLC 7', unidade: ' NCLC', titulo: 'Évolution NCLC', rotulosX: pts.map(function (p) { return dataFr(p.d, { day: '2-digit', month: '2-digit' }); }) });
    }

function abrirForfait() { abrirTarefas(); }

    // ---------- Journal de classe: programa de videoaulas (J1, J2…) ----------
    var SEMANAS = ['Première', 'Deuxième', 'Troisième', 'Quatrième', 'Cinquième', 'Sixième', 'Septième', 'Huitième', 'Neuvième', 'Dixième', 'Onzième', 'Douzième'];
    function htmlPrograma(pg, prof) {
      var html = '', dias = pg.dias;
      for (var i = 0; i < dias.length; i += 7) {
        html += '<div class="jp-semana"><h4>' + (SEMANAS[i / 7] || ((i / 7 + 1) + 'e')) + ' semaine</h4><div class="jp-dias">' + dias.slice(i, i + 7).map(function (d) {
          var trancado = !d.liberado && !prof;
          return '<div class="jp-dia' + (trancado ? ' trancado' : '') + (d.pct === 100 ? ' completo' : '') + '"><div class="jp-dia-cab"><b>' + esc(d.jour) + '</b><span>' + d.pct + '%</span></div>' +
            '<div class="jp-barra"><i style="width:' + d.pct + '%"></i></div>' +
            (trancado ? '<p class="jp-lock">Disponible après ' + esc(dias[dias.indexOf(d) - 1].jour) + ' (100 %)</p>' : '') +
            '<ul>' + d.itens.map(function (it) {
              return '<li><label class="jp-item"><input type="checkbox" data-licao="' + esc(it.rotulo) + '"' + (it.feito ? ' checked' : '') + (trancado ? ' disabled' : '') + '><span></span></label>' +
                (it.lien && !trancado ? '<a href="' + esc(it.lien) + '" target="_blank" rel="noopener">' + esc(it.titre) + '</a>' : '<em>' + esc(it.titre) + '</em>') + '</li>';
            }).join('') + '</ul></div>';
        }).join('') + '</div></div>';
      }
      return html;
    }
    function htmlNotasJournal(l, editavel, quem) {
      return '<div class="jp-notas" data-quem="' + quem + '">' + (l.length ? l.map(function (n) {
        return '<div class="jp-nota' + (n.feito ? ' feito' : '') + '"><label class="jp-item"><input type="checkbox" data-nota="' + n.linha + '"' + (n.feito ? ' checked' : '') + (editavel ? '' : ' disabled') + '><span></span></label>' +
          '<p>' + esc(n.texto) + '</p>' + (editavel ? '<button class="ferramenta sutil" type="button" data-nota-del="' + n.linha + '" aria-label="Supprimer">✕</button>' : '') + '</div>';
      }).join('') : '<p class="aviso" style="margin:0">-</p>') +
        (editavel ? '<div class="jp-add"><input placeholder="Ajouter une note…" data-nota-nova><button class="ferramenta destaque" type="button" data-nota-add>+</button></div>' : '') + '</div>';
    }
    function htmlRendimento(pj) {
      var sims = pj.simulados || [];
      var comp = pj.competencias || {};
      var html = '';
      if (sims.length) {
        var se = { nome: 'Écrit', cor: COR_ECRIT, pts: [] }, so = { nome: 'Oral', cor: COR_ORAL, pts: [] };
        sims.forEach(function (sm, i) {
          var rot = String(sm.nome || ('Simulado ' + (i + 1)));
          if (sm.ecrit !== '' && sm.ecrit !== null && sm.ecrit !== undefined) se.pts.push({ i: i, v: Number(sm.ecrit), rot: rot });
          if (sm.oral !== '' && sm.oral !== null && sm.oral !== undefined) so.pts.push({ i: i, v: Number(sm.oral), rot: rot });
        });
        html += '<h4 class="jp-sub">Simulados <small>NCLC par simulado</small></h4>' +
          graficoElegante([se, so], { max: 10, meta: 7, metaRot: 'Objectif NCLC 7', unidade: ' NCLC', titulo: 'Simulados', rotulosX: sims.map(function (sm, i) { return String(sm.nome || '').replace(/Simulado\s*/i, 'S') || 'S' + (i + 1); }) });
      }
      html += '<h4 class="jp-sub">Évaluations de votre professeure <small>NCLC estimé par évaluation</small></h4>' + htmlGraficoNclc(comp);
      return html;
    }

    var JP_CACHE = null, TELA_ATUAL_JP = '';
function abrirJournal() { abrirTarefas(); }

    /** Quadro panorâmico: exercícios feitos, notas atribuídas e desempenho. */
    function htmlPainel(p, pg) {
      var nota = function (v) { return v === null || v === undefined ? '-' : v + '<small>/20</small>'; };
      var cards = [
        ['', 'Programme', pg.pctGeral + '%', 'des leçons faites'],
        ['', 'Assiduité', p.assiduite === null || p.assiduite === undefined ? '-' : p.assiduite + '%', (p.coursDonnes || 0) + ' cours suivis'],
        ['', 'Écrit', nota(p.mediaPE), (p.ecrits || 0) + ' production' + (p.ecrits > 1 ? 's' : '') + ' notée' + (p.ecrits > 1 ? 's' : '')],
        ['', 'Oral', nota(p.mediaPO), (p.oraux || 0) + ' enregistrement' + (p.oraux > 1 ? 's' : '')],
        ['', 'Entraînement IA', nota(p.mediaIA), (p.ia || 0) + ' texte' + (p.ia > 1 ? 's' : '') + ' corrigé' + (p.ia > 1 ? 's' : '')],
        ['', 'Dictées', p.dicteeTaux === null || p.dicteeTaux === undefined ? '-' : p.dicteeTaux + '%', (p.dictees || 0) + ' dictée' + (p.dictees > 1 ? 's' : '') + ' · ' + (p.devoirs || 0) + ' devoir' + (p.devoirs > 1 ? 's' : '')],
        ['', 'Épreuves', String(p.epreuves || 0), 'épreuve' + (p.epreuves > 1 ? 's' : '') + ' écrite' + (p.epreuves > 1 ? 's' : '') + ' passée' + (p.epreuves > 1 ? 's' : '')]
      ];
      return '<div class="bloco painel"><h3>Tableau de bord</h3><div class="painel-grade">' + cards.map(function (c) {
        return '<div class="painel-card"><span class="pc-ico">' + c[0] + '</span><span class="pc-rot">' + c[1] + '</span><b>' + c[2] + '</b><small>' + c[3] + '</small></div>';
      }).join('') + '</div>' +
        ((p.ultimas || []).length ? '<details class="painel-det"' + (lerLocal('fnm_ult_aberto', false) ? ' open' : '') + '><summary><span>Dernières notes</span><em>' + p.ultimas.length + '</em><i class="painel-seta">▾</i></summary><div class="painel-ult">' + p.ultimas.map(function (u) {
          var tem = u.note !== '' && u.note !== null && u.note !== undefined;
          return '<div><span class="jr-st ' + (tem ? 'presente' : 'justif') + '">' + (tem ? u.note + '/20' : 'à corriger') + '</span><b>' + esc(u.tipo) + '</b><small>' + esc(String(u.sujet || '').slice(0, 70)) + ' · ' + dataFr(u.data) + '</small></div>';
        }).join('') + '</div></details>' : '') + '</div>';
    }

    function ligarNotasJournal(raiz, quem, aluno, depois) {
      if (!raiz) return;
      var enviar = function (dados) { dados.quem = quem; if (aluno) dados.aluno = aluno; google.script.run.withSuccessHandler(depois).withFailureHandler(function (e) { alert(e.message || e); }).salvarNotaJournal(EMAIL, dados); };
      raiz.querySelectorAll('[data-nota]').forEach(function (c) {
        c.addEventListener('change', function () { enviar({ linha: c.dataset.nota, feito: c.checked }); });
      });
      raiz.querySelectorAll('[data-nota-del]').forEach(function (b) { b.addEventListener('click', function () { enviar({ linha: b.dataset.notaDel, apagar: true }); }); });
      var add = raiz.querySelector('[data-nota-add]');
      if (add) add.addEventListener('click', function () { var t = raiz.querySelector('[data-nota-nova]').value.trim(); if (t) enviar({ texto: t, feito: false }); });
    }

    /** Professora, na ficha do aluno: programa (marcar lições), notas do professor e simulados. */
    function carregarProgramaProf(alvo, a) {
      alvo.innerHTML = '<p class="aviso">Chargement…</p>';
      google.script.run.withSuccessHandler(function (pj) {
        var pg = pj.programa;
        alvo.innerHTML = htmlPainel(pj.painel || {}, pg) +
          '<div class="jp-anot"><div><h4>Anotações aluno</h4>' + htmlNotasJournal(pj.notasAluno, true, 'eleve') + '</div><div><h4>Anotações professor (visibles par l\'élève)</h4>' + htmlNotasJournal(pj.notasProf, true, 'prof') + '</div></div>' +
          '<details class="mi-grupo"><summary>Programme J1…J' + pg.dias.length + ' (vous pouvez cocher pour l\'élève)</summary><div class="jp-programa prof">' + htmlPrograma(pg, true) + '</div></details>' +
          '<h4>Simulados</h4><div class="tabela-rolagem"><table class="tabela"><thead><tr><th>Simulado</th><th>Date</th><th>NCLC écrit</th><th>NCLC oral</th><th></th></tr></thead><tbody>' +
          pj.simulados.map(function (sm) {
            return '<tr><td>' + esc(sm.nome) + '</td><td>' + dataFr(sm.data) + '</td><td>' + esc(String(sm.ecrit)) + '</td><td>' + esc(String(sm.oral)) + '</td><td><button class="ferramenta perigo" type="button" data-sim-del="' + sm.linha + '">' + ICO.lixo + '</button></td></tr>';
          }).join('') + '</tbody></table></div>' +
          '<div class="form-oral"><label>Simulado<input id="sm-nome" placeholder="Simulado ' + (pj.simulados.length + 1) + '" style="width:130px"></label><label>Date<input id="sm-data" type="date" value="' + dataIso(Date.now()) + '"></label>' +
          '<label>NCLC écrit<input id="sm-e" type="number" min="0" max="12" style="width:80px"></label><label>NCLC oral<input id="sm-o" type="number" min="0" max="12" style="width:80px"></label>' +
          '<button class="ferramenta destaque" type="button" id="sm-add">+ Ajouter</button></div>';
        var recarregar = function () { carregarProgramaProf(alvo, a); };
        alvo.querySelectorAll('[data-licao]').forEach(function (c) {
          c.addEventListener('change', function () { google.script.run.withSuccessHandler(recarregar).marcarLicao(EMAIL, c.dataset.licao, c.checked, a.email); });
        });
        ligarNotasJournal(alvo.querySelector('.jp-notas[data-quem="eleve"]'), 'eleve', a.email, recarregar);
        ligarNotasJournal(alvo.querySelector('.jp-notas[data-quem="prof"]'), 'prof', a.email, recarregar);
        $('sm-add').addEventListener('click', function () {
          google.script.run.withSuccessHandler(recarregar).withFailureHandler(function (e) { alert(e.message || e); })
            .salvarSimulado(EMAIL, { aluno: a.email, nome: $('sm-nome').value, data: $('sm-data').value, ecrit: $('sm-e').value, oral: $('sm-o').value });
        });
        alvo.querySelectorAll('[data-sim-del]').forEach(function (b) { b.addEventListener('click', function () { google.script.run.withSuccessHandler(recarregar).salvarSimulado(EMAIL, { aluno: a.email, linha: b.dataset.simDel, apagar: true }); }); });
      }).withFailureHandler(function (e) { alvo.innerHTML = '<p class="aviso">' + esc(e.message || e) + '</p>'; }).obterJournalProgramaAluno(EMAIL, a.email);
    }

    // ---------- avisos no meio da tela (impossível não ver) ----------
    var FILA_MODAIS = [], MODAL_ABERTO = false;
    function modalCentral(op) { FILA_MODAIS.push(op); if (!MODAL_ABERTO) proximoModal(); }
    function proximoModal() {
      var op = FILA_MODAIS.shift();
      if (!op) { MODAL_ABERTO = false; return; }
      MODAL_ABERTO = true;
      var f = document.createElement('div');
      f.className = 'mc-fundo'; f.setAttribute('role', 'dialog'); f.setAttribute('aria-modal', 'true');
      f.innerHTML = '<div class="mc ' + (op.tipo || '') + '"><div class="mc-ico">' + (op.icone || '') + '</div><h2>' + esc(op.titulo) + '</h2><p>' + esc(op.texto).replace(/\n/g, '<br>') + '</p>' +
        (op.de ? '<small>' + esc(op.de) + '</small>' : '') + '<div class="mc-bts">' + (op.botoes || [{ rotulo: 'J\'ai compris', principal: true }]).map(function (b, i) {
          return '<button type="button" class="' + (b.principal ? 'botao-principal' : 'ferramenta') + '" data-mb="' + i + '">' + esc(b.rotulo) + '</button>';
        }).join('') + '</div></div>';
      (document.getElementById('fnm-raiz') || document.body).appendChild(f);
      var bts = f.querySelectorAll('[data-mb]');
      bts.forEach(function (b) {
        b.addEventListener('click', function () {
          var bo = (op.botoes || [{}])[Number(b.dataset.mb)];
          f.remove();
          if (bo && bo.fn) bo.fn();
          if (op.aoFechar) op.aoFechar();
          setTimeout(proximoModal, 250);
        });
      });
      bts[0].focus();
    }
    /** No login: aviso de renovação (sempre) e avisos enviados pela professora (até serem lidos). */
    function mostrarAvisosCentrais() {
      if (!B || B.professor) return;
      var rs = (B.avisos || []).filter(function (a) { return a.tipo === 'urgente' || a.tipo === 'auto'; });
      var prof = (B.avisos || []).filter(function (a) { return a.tipo === 'prof'; });
      if (rs.length) modalCentral({ titulo: B.bloqueadoPagamento ? 'Votre forfait doit être renouvelé' : 'Renouvellement de votre forfait', tipo: 'urgente', icone: '',
        texto: rs.map(function (a) { return a.texto; }).join('\n\n'),
        botoes: [{ rotulo: 'Renouveler maintenant', principal: true, fn: abrirForfait }].concat(B.bloqueadoPagamento ? [] : [{ rotulo: 'Plus tard' }]) });
      prof.forEach(function (a) { modalCentral({ titulo: 'Message de votre professeure', texto: a.texto, icone: '' }); });
      google.script.run.withSuccessHandler(function (l) {
        (l || []).forEach(function (a) { modalCentral({ titulo: a.titre, texto: a.message, de: a.de, icone: '', aoFechar: function () { google.script.run.marcarAvisoLido(EMAIL, a.id); } }); });
      }).meusAvisos(EMAIL);
    }

    /** Aviso em destaque, visível em todas as páginas do aluno. */
    function mostrarAvisosGlobais() {
      var alvo = $('avisos-globais'); if (!alvo) return;
      var l = (B && B.avisos) || [];
      alvo.hidden = !l.length;
      alvo.innerHTML = l.map(function (a) {
        return '<div class="aviso-global ' + a.tipo + '"><span>' + (a.tipo === 'prof' ? '' : a.tipo === 'urgente' ? '' : '') + '</span><p>' + esc(a.texto) + '</p>' +
          '<button type="button" class="ag-bt" data-ag>Mon journal →</button></div>';
      }).join('');
      alvo.querySelectorAll('[data-ag]').forEach(function (b) { b.addEventListener('click', abrirForfait); });
    }

    // ---------- journal na ficha do aluno (professora) ----------
    function carregarJournalProf(alvo, a) {
      alvo.innerHTML = '<p class="aviso">Chargement…</p>';
      var desenhar = function (j) {
        var hoje = dataIso(Date.now());
        alvo.innerHTML = htmlSituacao(j) +
          (j.abaUrl ? '<p class="aviso">Toutes ces informations sont dans l\'onglet <a href="' + esc(j.abaUrl) + '" target="_blank" rel="noopener"><b>' + esc(j.aba) + '</b></a> de la feuille : vous pouvez modifier là-bas ou ici.</p>' : '') +
          '<div class="jr-prof-grade"><div><h4>Horaires et avis</h4>' +
          '<div class="campo"><span>Jours et heures des cours (toujours les mêmes)</span>' + htmlEditorHorarios(j.horarios) + '</div>' +
          (j.horarios ? '' : '<p class="alerta" style="margin:6px 0">Choisissez les jours et l\'heure : c\'est avec eux que les cours de chaque forfait sont planifiés automatiquement.</p>') +
          '<label class="check"><input type="checkbox" id="jp-replan" checked> Si les horaires changent, replanifier les cours à venir</label>' +
          '<label class="campo">Avis en évidence sur toutes les pages de l\'élève<textarea id="jp-aviso" rows="2" class="campo-msg" placeholder="Ex. : Votre forfait se termine. Merci de renouveler avant le prochain cours.">' + esc(j.aviso || '') + '</textarea></label>' +
          '<label class="campo">Accès prolongé jusqu\'au (facultatif)<input id="jp-prol" type="date" value="' + dataIso(j.prolongado) + '"></label>' +
          '<button class="ferramenta destaque" type="button" id="jp-salvar-dados">Enregistrer</button> ' +
          '<button class="ferramenta" type="button" id="jp-pedir-renov">Demander le renouvellement</button></div>' +
          '<div><h4>Nouveau forfait</h4><div class="form-oral"><label>Forfait<select id="jp-form">' + j.formules.map(function (f) { return '<option value="' + esc(f.nome) + '" data-prix="' + f.prix + '" data-c="' + f.cours + '">' + esc(f.nome) + ' · ' + f.cours + ' cours · ' + moeda(f.prix) + '</option>'; }).join('') + '<option value="Autre">Autre</option></select></label>' +
          '<label>Cours<input id="jp-cours" type="number" min="1" style="width:80px"></label><label>Prix (tarif)<input id="jp-prix" type="number" min="0" step="0.01" style="width:110px"></label></div>' +
          '<div class="form-oral remise-linha"><label>Remise (R$)<input id="jp-remise" type="number" min="0" step="0.01" value="0" style="width:110px"></label><label class="largo">Motif de la remise (apparaît sur la nota)<input id="jp-motif" placeholder="Ex. : fidélité, parrainage, promotion…"></label>' +
          '<div class="remise-total">Total à payer <b id="jp-total">-</b></div></div>' +
          '<div class="form-oral"><label>Achat<input id="jp-achat" type="date" value="' + hoje + '"></label><label>Paiement<select id="jp-pag"><option value="payé">payé</option><option value="en attente">en attente</option></select></label>' +
          '<label class="check"><input type="checkbox" id="jp-agendar" checked> Planifier les cours automatiquement</label></div><div id="jp-prev-datas"></div>' +
          '<div class="form-oral"><label class="largo">Nota fiscal (n° ou lien, facultatif)<input id="jp-nf"></label><label class="check"><input type="checkbox" id="jp-recibo" checked> Envoyer le reçu par e-mail</label></div>' +
          '<button class="ferramenta destaque" type="button" id="jp-add-pack">Ajouter le forfait</button></div></div>' +
          '<details class="jp-antigo"><summary>Ajouter un forfait déjà payé avant l\'application</summary>' +
          '<p class="aviso">Pour un élève qui avait déjà un forfait en cours. Indiquez ce qu\'il a payé et combien de cours ont déjà eu lieu : l\'application note ces cours comme « donné » et planifie ceux qui restent.</p>' +
          '<div class="form-oral"><label>Forfait<select id="ja-form">' + j.formules.map(function (f) { return '<option value="' + esc(f.nome) + '" data-prix="' + f.prix + '" data-c="' + f.cours + '">' + esc(f.nome) + '</option>'; }).join('') + '<option value="Autre">Autre</option></select></label>' +
          '<label>Nombre de cours<input id="ja-cours" type="number" min="1" style="width:80px"></label><label>Prix (tarif)<input id="ja-prix" type="number" min="0" step="0.01" style="width:100px"></label><label>Remise (R$)<input id="ja-remise" type="number" min="0" step="0.01" value="0" style="width:90px"></label><label>Motif<input id="ja-motif" style="width:160px"></label><label>Payé le<input id="ja-pago" type="date" value="' + hoje + '"></label></div>' +
          '<div class="form-oral"><label>Cours déjà donnés<input id="ja-feitas" type="number" min="0" value="0" style="width:80px"></label>' +
          '<label class="check"><input type="checkbox" id="ja-agendar" checked> Planifier les cours restants selon les horaires</label>' +
          '<label class="check"><input type="checkbox" id="ja-recibo"> Envoyer la nota de compra par e-mail</label></div>' +
          '<p class="ja-resumo" id="ja-resumo"></p><button class="ferramenta destaque" type="button" id="ja-add">Ajouter ce forfait</button></details>' +
          (j.packs.length ? '<div class="tabela-rolagem"><table class="tabela"><thead><tr><th>Forfait</th><th>Cours</th><th>Tarif</th><th>Remise</th><th>Total</th><th>Achat</th><th>Paiement</th><th>Justificatif</th><th></th></tr></thead><tbody>' + j.packs.map(function (p) {
            return '<tr><td>' + esc(p.nome) + '</td><td>' + p.cours + '</td><td>' + moeda(p.prix) + '</td><td>' + (p.remise ? '− ' + moeda(p.remise) + (p.motif ? '<br><small>' + esc(p.motif) + '</small>' : '') : '-') + '</td><td><b>' + moeda(p.total) + '</b></td><td>' + dataFr(p.achat) + '</td><td><em class="jr-st ' + (p.paiement === 'payé' ? 'presente' : 'justif') + '">' + esc(p.paiement || '-') + '</em></td>' +
              '<td>' + (p.justificatif ? '<a href="' + esc(p.justificatif) + '" target="_blank" rel="noopener">Voir</a>' : '-') + '</td>' +
              '<td class="acoes-linha"><button class="ferramenta" type="button" data-pk-rem="' + p.linha + '" data-rem="' + (p.remise || 0) + '" data-motif="' + esc(p.motif || '') + '">Remise</button>' + (p.paiement === 'payé' ? '<button class="ferramenta" type="button" data-pk-nota="' + p.linha + '">Nota</button><button class="ferramenta" type="button" data-pk-recibo="' + p.linha + '">Renvoyer</button>' : '<button class="ferramenta destaque" type="button" data-pk-pago="' + p.linha + '">✓ Payé + planifier</button>') + '<button class="ferramenta perigo" type="button" data-pk-del="' + p.linha + '">' + ICO.lixo + '</button></td></tr>';
          }).join('') + '</tbody></table></div>' : '') +
          '<h4>Forfaits et cours</h4><div class="form-oral"><label>Planifier<input id="jp-n" type="number" min="1" value="1" style="width:70px"></label><button class="ferramenta" type="button" id="jp-agendar-n">cours de plus selon les horaires</button>' +
          '<label>Cours ponctuel<input id="jp-c-data" type="date" value="' + hoje + '"></label><label>Heure<input id="jp-c-hora" type="time"></label><button class="ferramenta" type="button" id="jp-c-add">+ Ajouter</button></div>' +
          '<span class="aviso" id="jp-st-msg"></span>' + htmlPacotes(j, true);
        var msg = function (t) { $('jp-st-msg').textContent = t; };
        var rodar = function (fn, args) {
          msg('Enregistrement…');
          google.script.run.withSuccessHandler(function (j2) { desenhar(j2); var t = []; if (j2.feitas) t.push(j2.feitas + ' cours déjà donnés enregistrés'); if (j2.criadas !== undefined) t.push(j2.criadas + ' cours planifiés'); if (j2.emailEnviado) t.push('nota de compra envoyée par e-mail'); if (j2.emailErro) t.push('e-mail : ' + j2.emailErro); if (t.length) $('jp-st-msg').textContent = '✓ ' + t.join(' · '); })
            .withFailureHandler(function (e) { msg('' + (e.message || e)); })[fn].apply(null, [EMAIL].concat(args));
        };
        var ultimaAula = j.cours.length ? Math.max(j.cours[j.cours.length - 1].data, Date.now() - 86400000) : Date.now() - 86400000;
        var previa = function () {
          var hor = lerEditorHorarios(alvo), n = Number($('jp-cours').value) || 0;
          var l = proxAulasCli(hor, ultimaAula, n);
          $('jp-prev-datas').innerHTML = !hor ? '<p class="aviso">Choisissez les jours pour voir les dates des cours.</p>' : (l.length ? '<p class="aviso" style="margin:4px 0">Cours qui seront planifiés :</p>' + htmlDatas(l) : '');
        };
        var totalRemise = function () { var t = Math.max(0, (Number($('jp-prix').value) || 0) - (Number($('jp-remise').value) || 0)); $('jp-total').textContent = moeda(t); };
        var preencher = function () { var o = $('jp-form').selectedOptions[0]; if (o && o.dataset.c) { $('jp-cours').value = o.dataset.c; $('jp-prix').value = o.dataset.prix; } totalRemise(); previa(); };
        ['jp-prix', 'jp-remise'].forEach(function (k) { $(k).addEventListener('input', totalRemise); });
        $('jp-form').addEventListener('change', preencher); preencher();
        var resumoAntigo = function () {
          var c = Number($('ja-cours').value) || 0, f = Math.min(c, Number($('ja-feitas').value) || 0), r = c - f;
          $('ja-resumo').innerHTML = c ? '<b>' + c + ' cours</b> : ' + f + ' déjà donné' + (f > 1 ? 's' : '') + ' (marqué' + (f > 1 ? 's' : '') + ' « donné ») · <b>' + r + ' restant' + (r > 1 ? 's' : '') + '</b>' +
            (r && $('ja-agendar').checked ? ', planifié' + (r > 1 ? 's' : '') + ' à partir d\'aujourd\'hui selon les horaires.' : r ? ', à planifier plus tard.' : '.') : '';
        };
        var preencherAntigo = function () { var o = $('ja-form').selectedOptions[0]; if (o && o.dataset.c) { $('ja-cours').value = o.dataset.c; $('ja-prix').value = o.dataset.prix; } resumoAntigo(); };
        $('ja-form').addEventListener('change', preencherAntigo); preencherAntigo();
        ['ja-cours', 'ja-feitas', 'ja-agendar'].forEach(function (k) { $(k).addEventListener(k === 'ja-agendar' ? 'change' : 'input', resumoAntigo); });
        $('ja-add').addEventListener('click', function () {
          var hor = lerEditorHorarios(alvo);
          if ($('ja-agendar').checked && !hor && !j.horarios) { msg('Choisissez d\'abord les jours et l\'heure des cours (plus haut).'); return; }
          var go = function () { rodar('salvarPackAnterior', [{ aluno: a.email, pack: $('ja-form').value, cours: $('ja-cours').value, prix: $('ja-prix').value, remise: $('ja-remise').value, motif: $('ja-motif').value, payeLe: $('ja-pago').value, feitas: $('ja-feitas').value, agendar: $('ja-agendar').checked, recibo: $('ja-recibo').checked }]); };
          if (hor && hor !== String(j.horarios || '').trim()) {
            msg('Enregistrement…');
            google.script.run.withSuccessHandler(go).withFailureHandler(function (e) { msg('' + (e.message || e)); }).salvarDadosJournal(EMAIL, a.email, { horarios: hor, replanejar: false });
          } else go();
        });
        $('jp-cours').addEventListener('input', previa);
        ligarEditorHorarios(alvo, previa);
        $('jp-pedir-renov').addEventListener('click', function () {
          var m = prompt('Message à l\'élève (affiché en évidence dans son journal et envoyé par e-mail) :', 'Merci de renouveler votre forfait : choisissez-le dans Mon espace → Forfait et cours, et payez par Pix avec le QR code affiché.');
          if (m === null) return;
          rodar('pedirRenovacao', [a.email, m]);
        });
        $('jp-salvar-dados').addEventListener('click', function () {
          var hor = lerEditorHorarios(alvo), mudou = hor !== String(j.horarios || '').trim();
          rodar('salvarDadosJournal', [a.email, { horarios: hor, aviso: $('jp-aviso').value, prolongado: $('jp-prol').value, replanejar: mudou && $('jp-replan').checked }]);
        });
        $('jp-add-pack').addEventListener('click', function () {
          var hor = lerEditorHorarios(alvo);
          if ($('jp-agendar').checked && !hor) { msg('Choisissez d\'abord les jours et l\'heure des cours.'); return; }
          var dadosPack = { aluno: a.email, pack: $('jp-form').value, cours: $('jp-cours').value, prix: $('jp-prix').value, remise: $('jp-remise').value, motif: $('jp-motif').value, achat: $('jp-achat').value, paiement: $('jp-pag').value, agendar: $('jp-agendar').checked, nf: $('jp-nf').value, recibo: $('jp-recibo').checked };
          if ((Number($('jp-remise').value) || 0) > (Number($('jp-prix').value) || 0)) { msg('La remise ne peut pas dépasser le prix.'); return; }
          if (hor !== String(j.horarios || '').trim()) {
            msg('Enregistrement…');
            google.script.run.withSuccessHandler(function () { rodar('salvarPack', [dadosPack]); }).withFailureHandler(function (e) { msg('' + (e.message || e)); })
              .salvarDadosJournal(EMAIL, a.email, { horarios: hor, replanejar: false });
          } else rodar('salvarPack', [dadosPack]);
        });
        alvo.querySelectorAll('[data-pk-pago]').forEach(function (b) { b.addEventListener('click', function () { var nf = prompt('Nota fiscal (n° ou lien), facultatif :', '') || ''; rodar('marcarPackPago', [a.email, b.dataset.pkPago, true, nf, true]); }); });
        alvo.querySelectorAll('[data-pk-rem]').forEach(function (b) { b.addEventListener('click', function () {
          var v = prompt('Remise en R$ pour ce forfait (0 pour retirer) :', b.dataset.rem || '0'); if (v === null) return;
          var mo = Number(String(v).replace(',', '.')) ? (prompt('Motif de la remise (apparaît sur la nota) :', b.dataset.motif || '') || '') : '';
          rodar('definirRemisePack', [a.email, b.dataset.pkRem, String(v).replace(',', '.'), mo]);
        }); });
        alvo.querySelectorAll('[data-pk-recibo]').forEach(function (b) { b.addEventListener('click', function () { rodar('reenviarRecibo', [a.email, b.dataset.pkRecibo]); }); });
        alvo.querySelectorAll('[data-pk-nota]').forEach(function (b) { b.addEventListener('click', function () { verNotaCompra(b.dataset.pkNota, a.email); }); });
        alvo.querySelectorAll('[data-pk-del]').forEach(function (b) { b.addEventListener('click', function () { if (confirm('Supprimer ce forfait ?')) rodar('apagarPack', [a.email, b.dataset.pkDel]); }); });
        $('jp-agendar-n').addEventListener('click', function () { rodar('agendarAulas', [a.email, $('jp-n').value]); });
        $('jp-c-add').addEventListener('click', function () { rodar('salvarCours', [{ aluno: a.email, data: $('jp-c-data').value, hora: $('jp-c-hora').value, statut: 'prévu' }]); });
        alvo.querySelectorAll('.jr-lin[data-lin]').forEach(function (l) {
          var v = function (k) { return l.querySelector('[data-c="' + k + '"]').value; };
          l.querySelector('[data-c-salvar]').addEventListener('click', function () {
            rodar('salvarCours', [{ aluno: a.email, linha: l.dataset.lin, data: v('data'), hora: v('hora'), statut: v('statut'), reposition: v('reposition'), certificat: v('certificat'), obs: v('obs') }]);
          });
          l.querySelectorAll('select, input').forEach(function (x) { x.addEventListener('change', function () { l.querySelector('[data-c-salvar]').classList.add('pulsa'); }); });
          l.querySelector('[data-c-del]').addEventListener('click', function () { if (confirm('Supprimer ce cours ?')) rodar('apagarCours', [a.email, l.dataset.lin]); });
        });
      };
      google.script.run.withSuccessHandler(desenhar).withFailureHandler(function (e) { alvo.innerHTML = '<p class="aviso">' + esc(e.message || e) + '</p>'; }).obterJournalAluno(EMAIL, a.email);
    }

    // ---------- professora: avisos no meio da tela ----------
    function ligarAvisProf() {
      var sel = seletorAlunos($('av-seletor'));
      var desenhar = function (l) {
        $('av-lista').innerHTML = l.length ? l.map(function (a) {
          return '<div class="sessao-prof"><div><b>' + esc(a.titre) + '</b><small>' + esc(String(a.message).slice(0, 160)) + '<br>' + dataFr(a.data) + ' · ' + esc(String(a.alvo)) + ' · <b>lu par ' + a.lidos + ' / ' + a.total + '</b></small></div>' +
            '<button class="ferramenta perigo" type="button" data-av-del="' + esc(a.id) + '">' + ICO.lixo + '</button></div>';
        }).join('') : '<p class="vazio">Aucun avis.</p>';
        $('av-lista').querySelectorAll('[data-av-del]').forEach(function (b) { b.addEventListener('click', function () { if (confirm('Supprimer cet avis ?')) google.script.run.withSuccessHandler(desenhar).apagarAviso(EMAIL, b.dataset.avDel); }); });
      };
      $('av-enviar').addEventListener('click', function () {
        var alunos = sel.valor();
        if (alunos !== 'TOUS' && !alunos.length) { $('av-st').textContent = 'Choisissez au moins un élève.'; return; }
        $('av-st').textContent = 'Publication…';
        google.script.run.withSuccessHandler(function (l) { $('av-st').textContent = '✓ Publié'; $('av-msg').value = ''; $('av-titre').value = ''; desenhar(l); })
          .withFailureHandler(function (e) { $('av-st').textContent = '' + (e.message || e); }).criarAviso(EMAIL, { titre: $('av-titre').value, message: $('av-msg').value, alunos: alunos });
      });
      google.script.run.withSuccessHandler(desenhar).listarAvisosProf(EMAIL);
    }

    /** Quadro de todos os temas: a professora marca os que ficam disponíveis. */
    function ligarQuadroTemas() {
      var tache = 'T2', dados = [];
      var visiveis = function () {
        var q = semAcento($('qt-busca').value), e = $('qt-eixo').value, st = $('qt-estado').value;
        return dados.filter(function (x) { return (!q || semAcento(x.t).indexOf(q) !== -1) && (!e || x.e === e) && (st === '' || String(+x.pub) === st); });
      };
      var desenhar = function () {
        var l = visiveis(), pub = dados.filter(function (x) { return x.pub; }).length;
        $('qt-st').textContent = pub + ' / ' + dados.length + ' thèmes cochés · ' + l.length + ' affichés';
        $('qt-lista').innerHTML = l.length ? '<div class="qt-tab">' + l.slice(0, 900).map(function (x) {
          var ex = eixo(x.e);
          return '<label class="qt-linha' + (x.pub ? ' on' : '') + '"><input type="checkbox" data-qt="' + esc(x.id) + '"' + (x.pub ? ' checked' : '') + '>' +
            '<span class="qt-t">' + esc(x.t) + '</span><span class="qt-meta">' + ex.icone + ' ' + esc(ex.nome) + (x.f > 1 ? ' · ' + x.f + '×' : '') + '</span>' +
            '<em class="qt-tipo ' + x.tipo + '">' + (x.tipo === 'manuel' ? 'modèle' : x.tipo === 'ia' ? 'modèle IA' : 'guide') + '</em></label>';
        }).join('') + '</div>' : '<p class="vazio">Aucun thème.</p>';
        $('qt-lista').querySelectorAll('[data-qt]').forEach(function (c) {
          c.addEventListener('change', function () { enviar([c.dataset.qt], c.checked); });
        });
      };
      var enviar = function (ids, pub) {
        $('qt-st').textContent = 'Enregistrement…';
        google.script.run.withSuccessHandler(function (l) { dados = l; desenhar(); }).withFailureHandler(function (e) { $('qt-st').textContent = '' + (e.message || e); }).publicarTemas(EMAIL, tache, ids, pub);
      };
      var carregar = function () {
        $('qt-lista').innerHTML = '<p class="vazio">Chargement…</p>';
        google.script.run.withSuccessHandler(function (l) { dados = l; desenhar(); }).quadroTemas(EMAIL, tache);
      };
      document.querySelectorAll('[data-qt-t]').forEach(function (b) {
        b.addEventListener('click', function () { tache = b.dataset.qtT; document.querySelectorAll('[data-qt-t]').forEach(function (x) { x.setAttribute('aria-pressed', x === b); }); carregar(); });
      });
      ['qt-busca', 'qt-eixo', 'qt-estado'].forEach(function (k) { $(k).addEventListener(k === 'qt-busca' ? 'input' : 'change', desenhar); });
      $('qt-marcar').addEventListener('click', function () { var l = visiveis(); if (l.length && confirm('Cocher ' + l.length + ' thèmes ?')) enviar(l.map(function (x) { return x.id; }), true); });
      $('qt-desmarcar').addEventListener('click', function () { var l = visiveis(); if (l.length && confirm('Décocher ' + l.length + ' thèmes ?')) enviar(l.map(function (x) { return x.id; }), false); });
      carregar();
    }

    /**
     * Liberar épreuves com caixinhas: escolhe para quem (todos, grupo, aluno) e clica nas épreuves.
     * Marcada = aberta. Cada clique grava na hora. alvoFixo = e-mail (na ficha do aluno) para não mostrar o seletor.
     */
    var LIB_TIPO = 'CE';
    function painelLiberacao(caixa, alvoInicial, alvoFixo) {
      var st = null, ocupado = false;
      var chamar = function (fn, args) {
        if (ocupado) return; ocupado = true;
        var s = caixa.querySelector('.lib-st'); if (s) s.textContent = 'Enregistrement…';
        google.script.run.withSuccessHandler(function (x) { ocupado = false; st = x; desenhar('✓ Enregistré'); })
          .withFailureHandler(function (e) { ocupado = false; var s2 = caixa.querySelector('.lib-st'); if (s2) s2.textContent = '' + (e.message || e); })[fn].apply(null, [EMAIL].concat(args));
      };
      var nomeAlvo = function (v) {
        if (v === 'TOUS') return 'tous les élèves';
        if (/^GROUPE: /.test(v)) return 'le groupe « ' + v.slice(8) + ' »';
        var al = st.alunos.filter(function (x) { return x.email === v; })[0]; return al ? al.nome : v;
      };
      var desenhar = function (msg) {
        if (!caixa.isConnected) return;
        var casas = st.testes[LIB_TIPO], prontas = casas.filter(function (c) { return c.pronto; });
        var abertas = prontas.filter(function (c) { return c.estado; }).length;
        var opcoes = '<option value="TOUS"' + (st.alvo === 'TOUS' ? ' selected' : '') + '>Tous les élèves</option>' +
          (st.grupos.length ? '<optgroup label="Groupes">' + st.grupos.map(function (g) { var v = 'GROUPE: ' + g; return '<option value="' + esc(v) + '"' + (st.alvo === v ? ' selected' : '') + '>Groupe ' + esc(g) + '</option>'; }).join('') + '</optgroup>' : '') +
          '<optgroup label="Élèves">' + st.alunos.map(function (x) { return '<option value="' + esc(x.email) + '"' + (st.alvo === x.email ? ' selected' : '') + '>' + esc(x.nome) + '</option>'; }).join('') + '</optgroup>';
        var mod = st.modulo, faltaMod = mod.total && mod.com < mod.total;
        caixa.innerHTML = '<div class="lib">' +
          (alvoFixo ? '' : '<label class="lib-alvo">Pour qui ?<select class="lib-sel">' + opcoes + '</select></label>') +
          (faltaMod ? '<div class="lib-mod">La partie <b>Simulados</b> est fermée pour ' + (mod.total === 1 ? 'cet élève' : (mod.total - mod.com) + ' élève(s) sur ' + mod.total) + ' : même cochées, les épreuves restent invisibles.' +
            ' <button class="ferramenta destaque" type="button" data-lib="mod">Ouvrir la partie Simulados</button></div>' :
            (mod.total ? '<p class="lib-ok">✓ Partie Simulados ouverte' + (mod.total > 1 ? ' pour les ' + mod.total + ' élèves' : '') + '.</p>' : '')) +
          abasTG(LIB_TIPO).replace(/data-tg-tipo/g, 'data-lib-tipo') +
          '<div class="lib-cab"><p><b>' + abertas + '</b> épreuve' + (abertas > 1 ? 's' : '') + ' ouverte' + (abertas > 1 ? 's' : '') + ' pour ' + esc(nomeAlvo(st.alvo)) + ' · cochez pour ouvrir, décochez pour fermer.</p>' +
          '<span class="acoes-linha"><button class="ferramenta" type="button" data-lib="tudo">Tout ouvrir</button><button class="ferramenta" type="button" data-lib="nada">Tout fermer</button></span></div>' +
          '<div class="lib-grade">' + casas.map(function (c) {
            var her = c.estado === 'herdado', on = !!c.estado;
            var info = !c.pronto ? 'Vide' : her ? 'via tous' : on ? 'Ouverte' : 'Fermée';
            return '<label class="lib-card' + (on ? ' on' : '') + (her ? ' her' : '') + (!c.pronto ? ' vide' : '') + '" title="' + (her ? 'Déjà ouverte pour tous ou pour le groupe : fermez-la là-bas.' : '') + '">' +
              '<input type="checkbox" data-lib-id="' + c.id + '"' + (on ? ' checked' : '') + (!c.pronto || her ? ' disabled' : '') + '><span class="lib-box"></span><b>' + c.n + '</b><small>' + info + '</small></label>';
          }).join('') + '</div><p class="aviso lib-st">' + (msg || '') + '</p></div>';
        if (caixa.querySelector('.lib-sel')) caixa.querySelector('.lib-sel').addEventListener('change', function () { carregar(this.value); });
        caixa.querySelectorAll('[data-lib-tipo]').forEach(function (b) { b.addEventListener('click', function () { LIB_TIPO = b.dataset.libTipo; desenhar(); }); });
        caixa.querySelectorAll('[data-lib-id]').forEach(function (cb) {
          cb.addEventListener('change', function () {
            cb.closest('.lib-card').classList.toggle('on', cb.checked);
            chamar('definirLiberacaoSimulados', [st.alvo, [cb.dataset.libId], cb.checked]);
          });
        });
        var lote = function (ativo) {
          var ids = casas.filter(function (c) { return c.pronto && c.estado !== 'herdado' && (ativo ? !c.estado : c.estado === 'direto'); }).map(function (c) { return c.id; });
          if (!ids.length) { caixa.querySelector('.lib-st').textContent = 'Rien à changer.'; return; }
          if (!ativo && !confirm('Fermer ' + ids.length + ' épreuve(s) pour ' + nomeAlvo(st.alvo) + ' ?')) return;
          chamar('definirLiberacaoSimulados', [st.alvo, ids, ativo]);
        };
        caixa.querySelector('[data-lib="tudo"]').addEventListener('click', function () { lote(true); });
        caixa.querySelector('[data-lib="nada"]').addEventListener('click', function () { lote(false); });
        if (caixa.querySelector('[data-lib="mod"]')) caixa.querySelector('[data-lib="mod"]').addEventListener('click', function () { chamar('abrirParteSimulados', [st.alvo]); });
      };
      var carregar = function (alvo) {
        caixa.innerHTML = '<p class="aviso">Chargement…</p>';
        google.script.run.withSuccessHandler(function (x) { st = x; desenhar(); })
          .withFailureHandler(function (e) { caixa.innerHTML = '<p class="aviso">' + esc(e.message || e) + '</p>'; }).liberacaoSimulados(EMAIL, alvo);
      };
      carregar(alvoFixo || alvoInicial || 'TOUS');
    }

    /**
     * Professora: marca os modelos que aparecem em « Modèles écrits » para um aluno, um grupo ou todos.
     * Catálogo = modelos da professora (atelier) + todos os sujets de production écrite do app.
     */
    var PM_TACHE = 'ET1';
    function painelModelos(caixa, alvoInicial, alvoFixo) {
      var st = null, busca = '', ocupado = false;
      var catalogo = {};
      // catálogo = modelos da professora + todos os temas da tâche (a lista completa vem do servidor na 1ª vez)
      var montar = function (t) {
        var vistos = {};
        catalogo[t] = (B.atelier || []).filter(function (m) { return m.tache === t; }).map(function (m) { vistos[m.id] = 1; return { id: m.id, titre: m.titre, atelier: true, busca: semAcento(m.titre + ' ' + (m.c || '')) }; })
          .concat(listaNav(t).filter(function (m) { return !vistos[m.id]; }).map(function (m) { vistos[m.id] = 1; return { id: m.id, titre: m.titre || m.id, e: m.e, busca: semAcento((m.titre || '') + ' ' + (m.resumo || '')) }; }));
      };
      ETS().forEach(montar);
      var completas = {};
      var nomeAlvo = function (v) {
        if (v === 'TOUS') return 'tous les élèves';
        if (/^GROUPE: /.test(v)) return 'le groupe « ' + v.slice(8) + ' »';
        var al = (st.alunos || []).filter(function (x) { return x.email === v; })[0]; return al ? al.nome : v;
      };
      var chamar = function (fn, args) {
        if (ocupado) return; ocupado = true;
        var s = caixa.querySelector('.lib-st'); if (s) s.textContent = 'Enregistrement…';
        google.script.run.withSuccessHandler(function (x) { ocupado = false; x.alunos = st.alunos; x.grupos = st.grupos; st = x; desenhar('✓ Enregistré'); })
          .withFailureHandler(function (e) { ocupado = false; var s2 = caixa.querySelector('.lib-st'); if (s2) s2.textContent = '' + (e.message || e); })[fn].apply(null, [EMAIL].concat(args));
      };
      var linha = function (x) {
        var e = st.estado[x.id] || '', her = e === 'herdado';
        return '<label class="pm-linha' + (e ? ' on' : '') + (her ? ' her' : '') + '"' + (her ? ' title="Déjà choisi pour tous ou pour le groupe"' : '') + '><input type="checkbox" data-pm="' + esc(x.id) + '"' + (e ? ' checked' : '') + (her ? ' disabled' : '') + '>' +
          '<span class="lib-box"></span><span class="pm-tit">' + esc(x.titre) + '</span>' + (x.atelier ? '<em class="pm-selo">de la professeure</em>' : '') + (her ? '<em class="pm-selo">via tous</em>' : '') + '</label>';
      };
      var desenhar = function (msg) {
        if (!caixa.isConnected) return;
        if (!completas[PM_TACHE]) { var tt = PM_TACHE; completas[tt] = 1; carregarLista(tt, function () { montar(tt); if (PM_TACHE === tt) desenhar(msg); }); }
        var l = catalogo[PM_TACHE], marcados = l.filter(function (x) { return st.estado[x.id]; });
        var nBusca = semAcento(busca.trim()), achados = nBusca.length >= 2 ? l.filter(function (x) { return !st.estado[x.id] && x.busca.indexOf(nBusca) !== -1; }).slice(0, 40) : [];
        var atelierLivres = l.filter(function (x) { return x.atelier && !st.estado[x.id]; });
        var mod = st.modulo;
        var opcoes = alvoFixo ? '' : '<label class="lib-alvo">Pour qui ?<select class="lib-sel"><option value="TOUS"' + (st.alvo === 'TOUS' ? ' selected' : '') + '>Tous les élèves</option>' +
          ((st.grupos || []).length ? '<optgroup label="Groupes">' + st.grupos.map(function (g) { var v = 'GROUPE: ' + g; return '<option value="' + esc(v) + '"' + (st.alvo === v ? ' selected' : '') + '>Groupe ' + esc(g) + '</option>'; }).join('') + '</optgroup>' : '') +
          '<optgroup label="Élèves">' + (st.alunos || []).map(function (x) { return '<option value="' + esc(x.email) + '"' + (st.alvo === x.email ? ' selected' : '') + '>' + esc(x.nome) + '</option>'; }).join('') + '</optgroup></select></label>';
        caixa.innerHTML = '<div class="lib">' + opcoes +
          (mod.total && mod.com < mod.total ? '<div class="lib-mod">La partie <b>Modèles écrits</b> est fermée pour ' + (mod.total === 1 ? 'cet élève' : (mod.total - mod.com) + ' élève(s) sur ' + mod.total) + ' : les modèles cochés restent invisibles. <button class="ferramenta destaque" type="button" data-pm-mod>Ouvrir la partie Modèles écrits</button></div>' :
            (mod.total ? '<p class="lib-ok">✓ Partie Modèles écrits ouverte' + (mod.total > 1 ? ' pour les ' + mod.total + ' élèves' : '') + '. Elle est indépendante de la Production écrite.</p>' : '')) +
          '<div class="tg-abas" role="tablist">' + ETS().map(function (t) { var n = catalogo[t].filter(function (x) { return st.estado[x.id]; }).length; return '<button type="button" role="tab" class="tg-aba" data-pm-t="' + t + '" aria-selected="' + (t === PM_TACHE) + '">' + nomeTache(t) + (n ? ' · ' + n : '') + '</button>'; }).join('') + '</div>' +
          '<p class="lib-cab" style="display:block">Cochez pour faire apparaître le modèle dans les <b>Modèles écrits</b> de ' + esc(nomeAlvo(st.alvo)) + ', décochez pour le retirer. Le sujet reste aussi disponible en Production écrite.</p>' +
          '<h4 class="pm-sub">✓ Modèles choisis (' + marcados.length + ')</h4>' + (marcados.length ? '<div class="pm-lista">' + marcados.map(linha).join('') + '</div>' : '<p class="aviso">Aucun modèle choisi pour cette tâche.</p>') +
          (atelierLivres.length ? '<h4 class="pm-sub">Vos modèles (atelier)</h4><div class="pm-lista">' + atelierLivres.map(linha).join('') + '</div>' : '') +
          '<h4 class="pm-sub">Chercher parmi les ' + l.length + ' sujets</h4><input type="search" class="pm-busca" placeholder="Tapez un mot du sujet : voisin, fête, télétravail…" value="' + esc(busca) + '">' +
          (achados.length ? '<div class="pm-lista">' + achados.map(linha).join('') + '</div>' : nBusca.length >= 2 ? '<p class="aviso">Aucun sujet trouvé.</p>' : '') +
          '<p class="aviso lib-st">' + (msg || '') + '</p></div>';
        if (caixa.querySelector('.lib-sel')) caixa.querySelector('.lib-sel').addEventListener('change', function () { carregar(this.value); });
        caixa.querySelectorAll('[data-pm-t]').forEach(function (b) { b.addEventListener('click', function () { PM_TACHE = b.dataset.pmT; busca = ''; desenhar(); }); });
        var campo = caixa.querySelector('.pm-busca'), tBusca = null;
        campo.addEventListener('input', function () { busca = campo.value; clearTimeout(tBusca); tBusca = setTimeout(function () { desenhar(); var c2 = caixa.querySelector('.pm-busca'); c2.focus(); c2.setSelectionRange(c2.value.length, c2.value.length); }, 250); });
        caixa.querySelectorAll('[data-pm]').forEach(function (cb) {
          cb.addEventListener('change', function () {
            var x = l.filter(function (y) { return y.id === cb.dataset.pm; })[0];
            cb.closest('.pm-linha').classList.toggle('on', cb.checked);
            chamar('definirModelosMarcados', [st.alvo, [{ id: x.id, titre: x.titre }], cb.checked]);
          });
        });
        if (caixa.querySelector('[data-pm-mod]')) caixa.querySelector('[data-pm-mod]').addEventListener('click', function () { chamar('abrirParteModeles', [st.alvo]); });
      };
      var carregar = function (alvo) {
        caixa.innerHTML = '<p class="aviso">Chargement…</p>';
        google.script.run.withSuccessHandler(function (x) {
          st = x;
          if (alvoFixo) { desenhar(); return; }
          google.script.run.withSuccessHandler(function (y) { st.alunos = y.alunos; st.grupos = y.grupos; desenhar(); }).liberacaoSimulados(EMAIL, 'TOUS');
        }).withFailureHandler(function (e) { caixa.innerHTML = '<p class="aviso">' + esc(e.message || e) + '</p>'; }).modelosMarcados(EMAIL, alvo);
      };
      carregar(alvoFixo || alvoInicial || 'TOUS');
    }

    // ---- melhores resultados do aluno (só ele vê) ----
    var MR = null;
    function carregarRecordes(cb) {
      if (!B || B.professor) return;
      if (MR) { cb(); return; }
      google.script.run.withSuccessHandler(function (r) { MR = r || {}; cb(); }).withFailureHandler(function () {}).obterMelhoresResultados(EMAIL);
    }
    function htmlRecordes(id, curto) {
      var x = (MR || {})[id];
      if (!x || (!x.r && !x.d)) return curto ? '' : '<span class="rec-vazio">Pas encore de résultat : faites la réécriture ou la dictée.</span>';
      var bloco = function (r, nome) {
        if (!r) return '';
        var ganho = r.m - r.p;
        return '<span class="rec-chip"><b>' + nome + ' ' + r.m + ' %</b>' + (ganho > 0 ? '<small>+' + ganho + ' depuis la 1re fois</small>' : '') + (curto ? '' : '<small>' + r.n + ' essai' + (r.n > 1 ? 's' : '') + '</small>') + '</span>';
      };
      return '' + bloco(x.r, 'Réécriture') + bloco(x.d, 'Dictée');
    }
    function registrarRecorde(id, tipo, pct, alvo) {
      if (!B || B.professor || !id) return;
      google.script.run.withSuccessHandler(function (r) {
        MR = MR || {}; MR[id] = MR[id] || {};
        MR[id][tipo] = { m: r.melhor, p: r.primeiro, n: r.tentativas, d: Date.now() };
        document.querySelectorAll('[data-rec="' + id + '"]').forEach(function (el) { el.innerHTML = htmlRecordes(id); });
        if (alvo) alvo.innerHTML = r.recorde && r.antes !== null ? '<div class="rec-novo">Nouveau record : <b>' + r.pct + ' %</b> (avant : ' + r.antes + ' %). Bravo, vous progressez !</div>' :
          r.antes === null ? '<div class="rec-novo">Premier résultat enregistré : <b>' + r.pct + ' %</b>. Refaites l\'exercice plus tard pour voir votre progrès.</div>' :
          '<div class="rec-info">Votre meilleur résultat reste <b>' + r.melhor + ' %</b> (cette fois : ' + r.pct + ' %).</div>';
      }).withFailureHandler(function () {}).salvarMelhorResultado(EMAIL, id, tipo, pct);
    }

    /** Diagnóstico: ida e volta ao Google (ping) + cada etapa pesada do servidor. */
    function ligarVitesse() {
      var res = $('vl-res');
      $('vl-go').addEventListener('click', function () {
        var bt = this; bt.disabled = true;
        var pings = [], tabela = function (linhas) {
          var max = Math.max.apply(null, linhas.map(function (l) { return l.ms; }).concat([1000]));
          return '<table class="vl-tab"><tbody>' + linhas.map(function (l) {
            var cls = l.ms >= 1500 ? 'lento' : l.ms >= 600 ? 'medio' : 'rapido';
            return '<tr class="' + cls + '"><td>' + esc(l.nome) + '<small>' + esc(l.info || '') + '</small></td><td class="vl-ms">' + (l.ms / 1000).toFixed(2) + ' s</td><td class="vl-barra"><i style="width:' + Math.max(2, Math.round(100 * l.ms / max)) + '%"></i></td></tr>';
          }).join('') + '</tbody></table>';
        };
        var umPing = function (n) {
          if (n >= 3) { etapa2(); return; }
          var t = Date.now();
          res.innerHTML = '<p class="aviso">Aller-retour vers Google : essai ' + (n + 1) + ' / 3…</p>';
          google.script.run.withSuccessHandler(function () { pings.push(Date.now() - t); umPing(n + 1); }).withFailureHandler(function () { pings.push(Date.now() - t); umPing(n + 1); }).ping();
        };
        var etapa2 = function () {
          var mediaPing = Math.round(pings.reduce(function (x, y) { return x + y; }, 0) / pings.length);
          res.innerHTML = '<p class="aviso">Aller-retour vers Google : ' + (mediaPing / 1000).toFixed(2) + ' s en moyenne. Mesure des étapes du serveur…</p>';
          var t = Date.now();
          google.script.run.withSuccessHandler(function (l) {
            bt.disabled = false;
            var total = Date.now() - t;
            var lentas = l.filter(function (x) { return x.ms >= 1500; });
            res.innerHTML = '<div class="vl-resumo"><div><b>' + (mediaPing / 1000).toFixed(2) + ' s</b><span>aller-retour minimal vers Google (sans rien calculer)</span></div>' +
              '<div><b>' + lentas.length + '</b><span>étape' + (lentas.length > 1 ? 's' : '') + ' lente' + (lentas.length > 1 ? 's' : '') + ' (plus de 1,5 s)</span></div></div>' +
              '<p class="aviso">Chaque clic qui va au serveur coûte au moins l\'aller-retour, plus les étapes qu\'il utilise. En rouge : ce qu\'il faut accélérer.</p>' +
              tabela([{ nome: 'Aller-retour vers Google (moyenne de 3)', ms: mediaPing, info: pings.map(function (p) { return (p / 1000).toFixed(2) + ' s'; }).join(' · ') }].concat(l)) +
              '<p class="aviso">Mesure totale : ' + (total / 1000).toFixed(1) + ' s · ' + new Date().toLocaleString('fr-FR') + ' · version ' + esc(B.versao || '') + '</p>';
          }).withFailureHandler(function (e) { bt.disabled = false; res.innerHTML = '<p class="aviso">' + esc(e.message || e) + '</p>'; }).diagnosticoVelocidade(EMAIL);
        };
        umPing(0);
      });
    }

    // ================= FINANCES (só a professora) =================
    var MESES = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
    function graficoBarras(vals, sel, rot) {
      var W = 680, H = 220, E = 56, D = 12, T = 16, Bm = 30, max = Math.max.apply(null, vals.concat([1])) * 1.15, n = vals.length, bw = (W - E - D) / n;
      var passo = Math.pow(10, Math.floor(Math.log10(max))) || 1; if (max / passo < 3) passo /= 2;
      var g = '';
      for (var v = 0; v <= max; v += passo) { var y = T + (1 - v / max) * (H - T - Bm); g += '<line x1="' + E + '" x2="' + (W - D) + '" y1="' + y + '" y2="' + y + '" class="gr-linha"/><text x="' + (E - 8) + '" y="' + (y + 4) + '" class="gr-y">' + Math.round(v).toLocaleString('fr-FR') + '</text>'; }
      var barras = vals.map(function (v, i) {
        var h = (H - T - Bm) * v / max, x = E + i * bw + bw * 0.18, y = H - Bm - h;
        return '<g><rect x="' + x + '" y="' + y + '" width="' + (bw * 0.64) + '" height="' + Math.max(h, v ? 2 : 0) + '" rx="5" class="fin-barra' + (i === sel ? ' sel' : '') + '"><title>' + rot[i] + ' : ' + moeda(v) + '</title></rect>' +
          '<text x="' + (x + bw * 0.32) + '" y="' + (H - 10) + '" class="gr-x">' + rot[i] + '</text>' + (v && i === sel ? '<text x="' + (x + bw * 0.32) + '" y="' + (y - 6) + '" class="gr-valor" fill="#1F5F93">' + Math.round(v).toLocaleString('fr-FR') + '</text>' : '') + '</g>';
      }).join('');
      return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="gr-svg" role="img" aria-label="Chiffre d\'affaires par mois">' + g + barras + '</svg>';
    }
    function ligarFinances() {
      var caixa = $('fin'), dados = null, hoje = new Date();
      var F = { ano: hoje.getFullYear(), mes: hoje.getMonth(), status: 'payes', busca: '' };
      var desenhar = function () {
        if (!caixa.isConnected) return;
        var L = dados.lancamentos, anos = {};
        L.forEach(function (x) { var d = x.payeLe || x.achat; if (d) anos[new Date(d).getFullYear()] = 1; }); anos[hoje.getFullYear()] = 1;
        var noPeriodo = function (x) {
          var d = x.pago ? x.payeLe : x.achat; if (!d) return false; d = new Date(d);
          return d.getFullYear() === F.ano && (F.mes === -1 || d.getMonth() === F.mes);
        };
        var pagos = L.filter(function (x) { return x.pago && noPeriodo(x); });
        var receita = pagos.reduce(function (s, x) { return s + x.total; }, 0), remises = pagos.reduce(function (s, x) { return s + x.remise; }, 0);
        var pend = L.filter(function (x) { return !x.pago; }), pendTotal = pend.reduce(function (s, x) { return s + x.total; }, 0);
        var porMes = MESES.map(function (m, i) { return L.filter(function (x) { return x.pago && x.payeLe && new Date(x.payeLe).getFullYear() === F.ano && new Date(x.payeLe).getMonth() === i; }).reduce(function (s, x) { return s + x.total; }, 0); });
        var totalAno = porMes.reduce(function (s, v) { return s + v; }, 0);
        var q = semAcento(F.busca.trim());
        var lista = L.filter(function (x) { return (F.status === 'tous' || (F.status === 'payes') === x.pago) && (F.status === 'attente' ? true : noPeriodo(x)) && (!q || semAcento(x.nome + ' ' + x.aluno + ' ' + x.pack + ' ' + (x.nota || '')).indexOf(q) !== -1); });
        var periodo = F.mes === -1 ? 'en ' + F.ano : MESES[F.mes] + ' ' + F.ano;
        caixa.innerHTML = '<div class="bloco fin-bloco"><div class="fin-topo"><div><small class="mira-marca">Confidentiel · visible uniquement par la professeure</small><h2>Finances</h2></div>' +
          '<div class="fin-filtros"><select data-f="ano">' + Object.keys(anos).sort().reverse().map(function (y) { return '<option' + (Number(y) === F.ano ? ' selected' : '') + '>' + y + '</option>'; }).join('') + '</select>' +
          '<select data-f="mes"><option value="-1"' + (F.mes === -1 ? ' selected' : '') + '>Toute l\'année</option>' + MESES.map(function (m, i) { return '<option value="' + i + '"' + (i === F.mes ? ' selected' : '') + '>' + m + '</option>'; }).join('') + '</select></div></div>' +
          '<div class="fin-kpis"><div class="fin-kpi destaque"><span>Chiffre d\'affaires ' + esc(periodo) + '</span><b>' + moeda(receita) + '</b><small>' + pagos.length + ' paiement' + (pagos.length > 1 ? 's' : '') + '</small></div>' +
          '<div class="fin-kpi"><span>Ticket moyen</span><b>' + moeda(pagos.length ? receita / pagos.length : 0) + '</b><small>par forfait payé</small></div>' +
          '<div class="fin-kpi"><span>Remises accordées</span><b>' + moeda(remises) + '</b><small>' + pagos.filter(function (x) { return x.remise; }).length + ' forfait(s) avec remise</small></div>' +
          '<div class="fin-kpi"><span>En attente de confirmation</span><b>' + moeda(pendTotal) + '</b><small>' + pend.length + ' forfait(s) déclaré(s)</small></div></div>' +
          '<div class="gr-card"><div class="fin-graf-cab"><b>' + F.ano + '</b><span>Total de l\'année : <b>' + moeda(totalAno) + '</b></span></div>' + graficoBarras(porMes, F.mes, MESES) + '</div>' +
          '<div class="fin-lista-cab"><h3>Lancements</h3><div class="fin-filtros"><select data-f="status"><option value="payes"' + (F.status === 'payes' ? ' selected' : '') + '>Payés (période)</option><option value="attente"' + (F.status === 'attente' ? ' selected' : '') + '>En attente</option><option value="tous"' + (F.status === 'tous' ? ' selected' : '') + '>Tous (période)</option></select>' +
          '<input type="search" data-f="busca" placeholder="Élève, forfait, n° de nota…" value="' + esc(F.busca) + '"><button class="ferramenta" type="button" id="fin-csv">Exporter (CSV)</button></div></div>' +
          (lista.length ? '<div class="tabela-rolagem"><table class="tabela fin-tab"><thead><tr><th>Paiement</th><th>Élève</th><th>Forfait</th><th>Cours</th><th>Tarif</th><th>Remise</th><th>Total payé</th><th>N° nota</th><th>Justificatif</th><th>Statut</th></tr></thead><tbody>' +
            lista.map(function (x) {
              return '<tr><td>' + (x.pago ? dataFr(x.payeLe) : '<small>déclaré le ' + dataFr(x.achat) + '</small>') + '</td><td><b>' + esc(x.nome) + '</b><br><small>' + esc(x.aluno) + '</small></td><td>' + esc(x.pack) + '</td><td>' + x.cours + '</td>' +
                '<td>' + moeda(x.prix) + '</td><td>' + (x.remise ? '− ' + moeda(x.remise) + (x.motif ? '<br><small>' + esc(x.motif) + '</small>' : '') : '-') + '</td><td><b>' + moeda(x.total) + '</b></td>' +
                '<td>' + esc(x.nota || '-') + '</td><td>' + (x.justificatif ? '<a href="' + esc(x.justificatif) + '" target="_blank" rel="noopener">Voir</a>' : '-') + '</td>' +
                '<td><em class="jr-st ' + (x.pago ? 'presente' : 'justif') + '">' + (x.pago ? 'payé' : 'en attente') + '</em></td></tr>';
            }).join('') + '</tbody><tfoot><tr><td colspan="4">Total (' + lista.length + ' lancement' + (lista.length > 1 ? 's' : '') + ')</td><td>' + moeda(lista.reduce(function (s, x) { return s + x.prix; }, 0)) + '</td><td>− ' + moeda(lista.reduce(function (s, x) { return s + x.remise; }, 0)) + '</td><td><b>' + moeda(lista.reduce(function (s, x) { return s + x.total; }, 0)) + '</b></td><td colspan="3"></td></tr></tfoot></table></div>'
            : '<p class="aviso">Aucun lancement pour ce filtre.</p>') +
          '<p class="aviso">Chiffre d\'affaires = total payé (tarif − remise) des forfaits confirmés, selon la date de paiement. Données lues dans les journaux des élèves au moment de l\'ouverture de cet onglet.</p></div>';
        caixa.querySelectorAll('[data-f]').forEach(function (el) {
          el.addEventListener(el.tagName === 'INPUT' ? 'input' : 'change', function () {
            var k = el.dataset.f; F[k] = k === 'busca' || k === 'status' ? el.value : Number(el.value);
            if (k === 'busca') { clearTimeout(el._t); el._t = setTimeout(function () { desenhar(); var c = caixa.querySelector('[data-f="busca"]'); c.focus(); c.setSelectionRange(c.value.length, c.value.length); }, 250); } else desenhar();
          });
        });
        $('fin-csv').addEventListener('click', function () {
          var cab = ['Date de paiement', 'Date de demande', 'Élève', 'E-mail', 'Forfait', 'Cours', 'Tarif', 'Remise', 'Motif', 'Total payé', 'N° nota', 'Statut', 'Justificatif'];
          var fmt = function (v) { return '"' + String(v === undefined || v === null ? '' : v).replace(/"/g, '""') + '"'; };
          var num = function (v) { return String((Number(v) || 0).toFixed(2)).replace('.', ','); };
          var csv = [cab.map(fmt).join(';')].concat(lista.map(function (x) {
            return [x.pago ? dataFr(x.payeLe) : '', dataFr(x.achat), x.nome, x.aluno, x.pack, x.cours, num(x.prix), num(x.remise), x.motif, num(x.total), x.nota, x.pago ? 'payé' : 'en attente', x.justificatif].map(fmt).join(';');
          })).join('\r\n');
          var aTag = document.createElement('a');
          aTag.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent('\ufeff' + csv);
          aTag.download = 'finances-' + F.ano + (F.mes === -1 ? '' : '-' + ('0' + (F.mes + 1)).slice(-2)) + '.csv';
          (document.getElementById('fnm-raiz') || document.body).appendChild(aTag); aTag.click(); aTag.remove();
        });
      };
      google.script.run.withSuccessHandler(function (d) { dados = d; desenhar(); })
        .withFailureHandler(function (e) { caixa.innerHTML = '<p class="aviso">' + esc(e.message || e) + '</p>'; }).financas(EMAIL);
    }

    function ligarTestesProf() {
      var alvo = $('tt-prof');
      var desenhar = function (st) {
        if (!$('tt-prof')) return;
        var prontos = st.testes.filter(function (x) { return x.pronto && x.n; }).length;
        alvo.innerHTML = '<div class="gm-total"><b>' + prontos + ' / 80</b><span>tests prêts</span></div>' +
          (!st.iaConfigurada ? '<p class="aviso">Facultatif : avec la clé de l\'IA (configurarChaveIA), l\'app peut rédiger les épreuves encore vides.</p>' :
            st.ativa ? '<p class="gm-ativa">Rédaction des tests en arrière-plan…</p>' : (prontos < 80 ? '<button class="botao-principal" type="button" id="tt-gerar" style="width:auto;padding:12px 24px">Rédiger les tests manquants</button>' : '')) +
          '<div class="tg-bloco-prof">' + abasTG(GRADE_TIPO) +
          '<div class="tg-cab"><h3>' + (GRADE_TIPO === 'CE' ? 'Compréhension écrite' : 'Compréhension orale') + ' <small>épreuves 1 à 40</small></h3>' +
          legendaTG([['vide', 'Vide'], ['incomplet', 'En rédaction'], ['pret', 'Prêt, non partagé'], ['partage', 'Partagé']]) + '</div>' +
          '<div class="tg-grade">' + st.testes.filter(function (x) { return x.tipo === GRADE_TIPO && x.n; }).map(function (x) {
            var est = x.pronto ? (x.partilhas.length ? 'partage' : 'pret') : x.partes ? 'incomplet' : 'vide';
            var info = est === 'vide' ? 'Vide' : est === 'incomplet' ? x.partes + '/3 parties' : est === 'pret' ? (x.meu ? x.questoes + ' questions' : 'IA') : 'Partagé (' + x.partilhas.length + ')';
            return '<button type="button" class="tg-card ' + est + '" data-tgp="' + x.id + '"' + (est === 'vide' || est === 'incomplet' ? ' disabled' : '') + '><b>' + x.n + '</b><i class="tg-dot ' + est + '"></i><small>' + info + '</small>' + (x.meu ? '<em class="tg-meu" title="Vos questions">✎</em>' : '') + '</button>';
          }).join('') + '</div><div class="tg-acao" id="tgp-acao" hidden></div>' +
          '<p class="tg-sub">Pour remplir une épreuve : ajoutez ses questions dans l\'onglet « Mes tests TCF » (Test = numéro de 1 à 40, Type = CE ou CO) ou dans les fichiers Provas_CE du code. ✎ = vos questions.</p></div>' +
          '<div class="bloco lib-bloco"><h3>Ouvrir les épreuves aux élèves</h3><div id="lib-prof"></div></div>';
        alvo.querySelectorAll('[data-tg-tipo]').forEach(function (b) { b.addEventListener('click', function () { GRADE_TIPO = b.dataset.tgTipo; desenhar(st); }); });
        if ($('lib-prof')) painelLiberacao($('lib-prof'), 'TOUS');
        if ($('tt-gerar')) $('tt-gerar').addEventListener('click', function () { this.disabled = true; google.script.run.withSuccessHandler(desenhar).withFailureHandler(function (e) { alert(e.message || e); }).iniciarGeracaoTestes(EMAIL); });
        alvo.querySelectorAll('[data-tgp]').forEach(function (b) {
          b.addEventListener('click', function () {
            var x = st.testes.filter(function (y) { return y.id === b.dataset.tgp; })[0];
            alvo.querySelectorAll('.tg-card').forEach(function (c) { c.classList.toggle('sel', c === b); });
            var p = $('tgp-acao'); p.hidden = false;
            p.innerHTML = '<div><b>Épreuve ' + x.n + '</b> · ' + (x.tipo === 'CE' ? 'Compréhension écrite' : 'Compréhension orale') + '<br><small>' + (x.meu ? 'Vos questions (' + x.questoes + ')' : 'Rédigé par l\'IA') +
              ' · ' + (x.partilhas.length ? 'Partagé avec : ' + esc(x.partilhas.join(' · ')) : 'Pas encore partagé') + (x.feitos ? ' · ' + x.feitos + ' passage(s)' : '') + '</small></div>' +
              '<span class="acoes-linha"><button class="ferramenta destaque" type="button" id="tgp-ver">Voir la correction</button><button class="ferramenta" type="button" id="tgp-passer">▶ Passer</button><button class="ferramenta" type="button" id="tgp-pt">Partager</button></span><div class="pt-painel" id="tgp-painel" hidden></div>';
            $('tgp-ver').addEventListener('click', function () { abrirCorrecaoProf(x.id); });
            $('tgp-passer').addEventListener('click', function () { abrirTeste(x.id); });
            $('tgp-pt').addEventListener('click', function () {
              var pn = $('tgp-painel'); pn.hidden = !pn.hidden;
              if (!pn.hidden) painelPartilha(pn, { id: x.id, tipo: 'simulado', titre: x.id }, function () { google.script.run.withSuccessHandler(desenhar).statusTestes(EMAIL); });
            });
            p.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          });
        });
      };
      var atualizar = function () { google.script.run.withSuccessHandler(function (st) { desenhar(st); if (st.ativa && $('tt-prof')) setTimeout(atualizar, 30000); }).statusTestes(EMAIL); };
      atualizar();
    }
    function ligarVocabProf() {
      var desenhar = function (l) {
        var decks = {};
        l.forEach(function (c) { (decks[c.deck] = decks[c.deck] || []).push(c); });
        $('vp-lista').innerHTML = Object.keys(decks).map(function (d) {
          return '<details class="mi-grupo"' + (d === 'Mots de la semaine' ? ' open' : '') + '><summary>' + esc(d) + ' <small>(' + decks[d].length + ')</small></summary><div class="mi-tab">' + decks[d].map(function (c) {
            return '<div class="vp-linha"><b>' + esc(c.mot) + '</b><span>' + esc(c.trad || '') + '</span><small>' + esc(c.ex || '') + (c.dica ? '<br>' + esc(c.dica) : '') + '</small><button class="ferramenta sutil" type="button" data-vp-del="' + c.linha + '">' + ICO.lixo + '</button></div>';
          }).join('') + '</div></details>';
        }).join('');
        $('vp-lista').querySelectorAll('[data-vp-del]').forEach(function (b) { b.addEventListener('click', function () { if (confirm('Supprimer cette carte ?')) google.script.run.withSuccessHandler(desenhar).apagarCarta(EMAIL, b.dataset.vpDel); }); });
      };
      $('vp-add').addEventListener('click', function () {
        $('vp-st').textContent = 'Enregistrement…';
        google.script.run.withSuccessHandler(function (l) { $('vp-st').textContent = '✓ Ajouté'; $('vp-mot').value = ''; $('vp-trad').value = ''; $('vp-ex').value = ''; $('vp-dica').value = ''; VOC = null; desenhar(l); })
          .withFailureHandler(function (e) { $('vp-st').textContent = '' + (e.message || e); }).adicionarCarta(EMAIL, { deck: $('vp-deck').value, mot: $('vp-mot').value, trad: $('vp-trad').value, ex: $('vp-ex').value, dica: $('vp-dica').value });
      });
      google.script.run.withSuccessHandler(desenhar).listarCartasProf(EMAIL);
    }

    // ================= SIMULADOS =================
function abrirSimulados() {
      if (!B) return;
      var partes = [PARTE_ACCUEIL(), { rotulo: 'Simulados' }];
      var tela = $('tela-hub');
      tela.innerHTML = trilha(partes) + '<h1 class="titulo-pagina">Simulados</h1>' +
        '<p class="intro">Passez les épreuves dans les conditions de l\'examen. L\'épreuve écrite de 60 minutes présente les trois tâches en même temps, avec le chronomètre en haut de l\'écran.</p>' +
        '<div class="hub-acoes"><button class="hub-acao" type="button" id="sm-ep"><span></span><b>Épreuve écrite et enregistrements</b><small>Écrit (60 min, 3 tâches simultanées) et tâches orales, dont les épreuves proposées par votre professeur(e).</small></button>' +
        '<a class="hub-acao" href="simulado-tcf.html?curso=' + encodeURIComponent(B.courseType) + '"><span></span><b>Simulation complète de l\'examen</b><small>Compréhension orale et écrite, expression écrite et orale, avec correction et suivi en direct.</small></a></div>';
      ligarTrilha(tela, partes);
      mostrar('tela-hub');
      $('sm-ep').addEventListener('click', abrirEpreuve);
    }

    // ================= GRADE DAS ÉPREUVES (40 C.E. + 40 C.O.) =================
    var GRADE_TIPO = 'CE', PROG_LOCAL = {}, GRADE_CACHE = null;
    var ESTADOS_TG = { afaire: 'À faire', encours: 'En cours', reussi: 'Réussi', nonreussi: 'Non réussi', bientot: 'Bientôt' };
    function legendaTG(itens) {
      return '<div class="tg-legenda">' + itens.map(function (k) { return '<span><i class="tg-dot ' + k[0] + '"></i>' + k[1] + '</span>'; }).join('') + '</div>';
    }
    function abasTG(tipo) {
      return '<div class="tg-abas" role="tablist"><button type="button" role="tab" class="tg-aba" data-tg-tipo="CE" aria-selected="' + (tipo === 'CE') + '">Compréhension écrite</button>' +
        '<button type="button" role="tab" class="tg-aba" data-tg-tipo="CO" aria-selected="' + (tipo === 'CO') + '">Compréhension orale</button></div>';
    }
    /** Grade do aluno: 40 casas por tipo, cor conforme o estado; clique abre, retoma ou mostra a correção. */
    function grelhaEpreuves(alvo) {
      if (!alvo) return;
      var dados = null;
      var desenhar = function () {
        if (!alvo.isConnected) return;
        var casas = dados[GRADE_TIPO], nome = GRADE_TIPO === 'CE' ? 'Compréhension écrite' : 'Compréhension orale';
        var abertas = casas.filter(function (c) { return c.estado !== 'bientot'; }).length;
        alvo.innerHTML = abasTG(GRADE_TIPO) +
          '<div class="tg-cab"><h3>' + nome + ' <small>épreuves 1 à 40</small></h3>' + legendaTG([['afaire', 'À faire'], ['encours', 'En cours'], ['reussi', 'Réussi'], ['nonreussi', 'Non réussi']]) + '</div>' +
          '<p class="tg-sub">' + abertas + ' épreuve' + (abertas > 1 ? 's' : '') + ' ouverte' + (abertas > 1 ? 's' : '') + ' · « Réussi » à partir du NCLC ' + dados.seuil + '</p>' +
          '<div class="tg-grade">' + casas.map(function (c) {
            var info = c.estado === 'bientot' ? 'Bientôt' : c.estado === 'encours' ? 'En cours' :
              c.score !== undefined ? c.score + ' pts' : 'À faire';
            return '<button type="button" class="tg-card ' + c.estado + '" data-tg="' + c.id + '"' + (c.estado === 'bientot' ? ' disabled title="Pas encore disponible"' : '') + '>' +
              '<b>' + c.n + '</b><i class="tg-dot ' + c.estado + '"></i><small>' + info + '</small></button>';
          }).join('') + '</div><div class="tg-acao" id="tg-acao" hidden></div>' +
          (dados.demo[GRADE_TIPO] ? '<p class="tg-demo"><button type="button" class="ferramenta" data-tg-demo="' + dados.demo[GRADE_TIPO] + '">Essayer le test de démonstration</button></p>' : '');
        alvo.querySelectorAll('[data-tg-tipo]').forEach(function (b) { b.addEventListener('click', function () { GRADE_TIPO = b.dataset.tgTipo; desenhar(); }); });
        alvo.querySelectorAll('[data-tg-demo]').forEach(function (b) { b.addEventListener('click', function () { abrirTeste(b.dataset.tgDemo); }); });
        alvo.querySelectorAll('[data-tg]').forEach(function (b) {
          b.addEventListener('click', function () {
            var c = casas.filter(function (x) { return x.id === b.dataset.tg; })[0];
            if (!c || c.estado === 'bientot') return;
            if (B && B.professor) { abrirCorrecaoProf(c.id); return; }
            if (c.estado === 'afaire' || c.estado === 'encours' && !c.tentativas) { abrirTeste(c.id); return; }
            alvo.querySelectorAll('.tg-card').forEach(function (x) { x.classList.toggle('sel', x === b); });
            var p = $('tg-acao'); p.hidden = false;
            p.innerHTML = '<div><b>Épreuve ' + c.n + '</b> · ' + nome + '<br><small>' + (c.score !== undefined ? 'Meilleur résultat : ' + c.score + '/699 · NCLC ' + c.nclc + ' · ' + esc(String(c.bonnes || '')) + ' · ' : '') + c.tentativas + ' passage' + (c.tentativas > 1 ? 's' : '') + '</small></div>' +
              '<span class="acoes-linha">' + (c.estado === 'encours' ? '<button class="ferramenta destaque" type="button" data-tg-ir="abrir">▶ Reprendre</button>' : '') +
              '<button class="ferramenta' + (c.estado === 'encours' ? '' : ' destaque') + '" type="button" data-tg-ir="cor">Voir ma dernière correction</button>' +
              (c.estado === 'encours' ? '' : '<button class="ferramenta" type="button" data-tg-ir="abrir">↺ Refaire l\'épreuve</button>') + '</span>';
            p.querySelectorAll('[data-tg-ir]').forEach(function (x) { x.addEventListener('click', function () { if (x.dataset.tgIr === 'cor') verUltimaCorrecao(c.id); else abrirTeste(c.id); }); });
            p.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          });
        });
      };
      var chegou = false, falhou = function (msg) {
        if (!alvo.isConnected) return;
        alvo.innerHTML = '<div class="alerta">Les épreuves n\'ont pas pu être chargées.<br><small>' + esc(msg) + '</small></div>' +
          '<p style="text-align:center"><button class="ferramenta destaque" type="button" id="tg-retry">↻ Réessayer</button></p>';
        $('tg-retry').addEventListener('click', function () { alvo.innerHTML = '<p class="aviso">Chargement…</p>'; grelhaEpreuves(alvo); });
      };
      // mostra na hora a última grade conhecida e atualiza em segundo plano
      if (GRADE_CACHE) { dados = GRADE_CACHE; desenhar(); }
      setTimeout(function () { if (!chegou && !GRADE_CACHE) falhou('Le serveur ne répond pas (délai dépassé).'); }, 30000);
      google.script.run.withSuccessHandler(function (d) {
        chegou = true; dados = d; GRADE_CACHE = d;
        ['CE', 'CO'].forEach(function (tp) { d[tp].forEach(function (c) {   // progresso ainda a caminho do servidor
          if (PROG_LOCAL[c.id] && c.estado !== 'bientot' && !c.encours) { c.estado = 'encours'; c.encours = true; c.feitas = PROG_LOCAL[c.id]; }
        }); });
        desenhar();
      }).withFailureHandler(function (e) { chegou = true; if (!GRADE_CACHE) falhou(e && e.message || String(e)); }).grelhaTestes(EMAIL);
    }
    function verUltimaCorrecao(id) {
      pararTeste();
      var tela = $('tela-hub'); tela.innerHTML = '<p class="vazio">Chargement de la correction…</p>'; mostrar('tela-hub');
      google.script.run.withSuccessHandler(function (x) { mostrarResultadoTeste(x.t, x.resp, x.r); })
        .withFailureHandler(function (e) { tela.innerHTML = '<p class="vazio erro">' + esc(e.message || e) + '</p>'; }).ultimaCorrecao(EMAIL, id);
    }

    // ================= TESTS TCF (C.O. / C.E.) =================
    var TST = null;
    function salvarProgresso(imediato) {
      if (!TST || TST.enviando || TST.revisao) return;
      clearTimeout(TST.tSalvar);
      PROG_LOCAL[TST.t.id] = Object.keys(TST.resp).length;
      var envia = function () {
        if (!TST || TST.enviando) return;
        google.script.run.withFailureHandler(function () {}).salvarProgressoTeste(EMAIL, TST.t.id, TST.resp, TST.i, Math.round((TST.fim - Date.now()) / 1000), TST.escutas);
      };
      if (imediato) envia(); else TST.tSalvar = setTimeout(envia, 1500);
    }
    function pararTeste() { if (TST && !TST.enviando && Object.keys(TST.resp).length) salvarProgresso(true); if (TST && TST.timer) clearInterval(TST.timer); if (TST && TST.audioAtual) try { TST.audioAtual.pause(); } catch (e) {} Voz.parar && Voz.parar(); TST = null; }
    /** Lê o "script" da C.O. com duas vozes (linhas de homem/jornalista na segunda voz). */
    function tocarScript(script, aoFim) {
      var linhas = String(script).split(/\n+/).filter(function (l) { return l.trim(); }).map(function (l) {
        var m = l.match(/^([^:]{2,25})\s*:\s*(.*)$/), falante = m ? semAcento(m[1]) : '';
        return { texto: m ? m[2] : l, segunda: /homme|journaliste|animateur|professeur|chercheur|philosophe|client|guide/.test(falante) };
      });
      Voz.parar && Voz.parar();
      var i = 0, prox = function () { if (i >= linhas.length) { if (aoFim) aoFim(); return; } Promise.resolve(Voz.tocar(linhas[i++])).then(prox); };
      prox();
    }
    function abrirTeste(id) {
      pararTeste();
      var tela = $('tela-hub');
      tela.innerHTML = '<p class="vazio">Chargement du test…</p>';
      mostrar('tela-hub');
      google.script.run.withSuccessHandler(function (t) {
        TST = { t: t, resp: {}, i: 0, inicio: Date.now(), escutas: {}, fim: Date.now() + t.duracao * 60000 };
        var pg = t.progresso;
        if (pg && Object.keys(pg.r || {}).length) {
          if (confirm('Vous avez déjà commencé cette épreuve (' + Object.keys(pg.r).length + ' réponse(s), ' + formatarTempo(pg.s) + ' restantes).\n\nOK = reprendre là où vous vous étiez arrêté(e)\nAnnuler = recommencer à zéro')) {
            TST.resp = {}; Object.keys(pg.r).forEach(function (k) { TST.resp[k] = Number(pg.r[k]); });
            TST.i = Math.min(pg.i || 0, t.questoes.length - 1); TST.escutas = pg.e || {};
            TST.fim = Date.now() + Math.max(60, pg.s) * 1000; TST.inicio = Date.now() - (t.duracao * 60 - pg.s) * 1000;
          } else { delete PROG_LOCAL[t.id]; google.script.run.abandonarTeste(EMAIL, t.id); }
        }
        var partes = [PARTE_ACCUEIL(), { rotulo: 'Simulados', fn: abrirSimulados }, { rotulo: (t.tipo === 'CO' ? 'Compréhension orale' : 'Compréhension écrite') }];
        var desenhar = function () {
          if (!TST) return;
          var q = t.questoes[TST.i];
          tela.innerHTML = trilha(partes) + '<div class="tt-barra"><b>' + (t.tipo === 'CO' ? 'Compréhension orale' : 'Compréhension écrite') + '</b><span class="tt-tempo" id="tt-tempo"></span>' +
            '<button class="ferramenta destaque" type="button" id="tt-fim">Terminer et corriger</button></div>' +
            '<div class="tt-pontos">' + t.questoes.map(function (x, k) { return '<button type="button" class="tt-p' + (k === TST.i ? ' atual' : '') + (TST.resp[x.n] !== undefined ? ' feito' : '') + '" data-ir="' + k + '">' + x.n + '</button>'; }).join('') + '</div>' +
            '<div class="bloco tt-q"><div class="tt-cab"><span>Question ' + q.n + ' / ' + t.questoes[t.questoes.length - 1].n + '</span><em class="alu-chip">' + q.nivel + '</em></div>' +
            (t.tipo === 'CO' ? '<button class="botao-principal" type="button" id="tt-ouvir" style="width:auto;padding:12px 24px"' + ((TST.escutas[q.n] || 0) >= 2 ? ' disabled' : '') + '>▶ Écouter le document' + ((TST.escutas[q.n] || 0) ? ' (encore ' + (2 - TST.escutas[q.n]) + ' fois)' : '') + '</button>' :
              q.imagem ? '<div class="tt-img"><img src="' + esc(q.imagem) + '" alt="Document" referrerpolicy="no-referrer"></div>' + (q.texte ? '<div class="tt-texto">' + esc(q.texte) + '</div>' : '') :
              '<div class="tt-texto">' + esc(q.texte || '').replace(/\n/g, '<br>') + '</div>') +
            '<p class="tt-perg">' + esc(q.q) + '</p><div class="tt-opts">' + q.o.map(function (o, k) {
              return '<label class="tt-opt' + (TST.resp[q.n] === k ? ' on' : '') + '"><input type="radio" name="tt" value="' + k + '"' + (TST.resp[q.n] === k ? ' checked' : '') + '><span class="tt-letra">' + 'ABCD'[k] + '</span>' + esc(o) + '</label>';
            }).join('') + '</div><div class="tt-nav"><button class="ferramenta" type="button" id="tt-ant"' + (TST.i ? '' : ' disabled') + '>← Précédente</button>' +
            '<button class="ferramenta destaque" type="button" id="tt-prox">' + (TST.i < t.questoes.length - 1 ? 'Suivante →' : 'Terminer') + '</button></div></div>';
          ligarTrilha(tela, partes);
          tela.querySelectorAll('[data-ir]').forEach(function (b) { b.addEventListener('click', function () { TST.i = Number(b.dataset.ir); desenhar(); }); });
          tela.querySelectorAll('input[name="tt"]').forEach(function (r) { r.addEventListener('change', function () { TST.resp[q.n] = Number(r.value); salvarProgresso(); desenhar(); }); });
          if ($('tt-ouvir')) $('tt-ouvir').addEventListener('click', function () {
            TST.escutas[q.n] = (TST.escutas[q.n] || 0) + 1; salvarProgresso(); this.disabled = true; this.textContent = 'Écoute en cours…';
            if (!q.audio) { tocarScript(q.script, desenhar); return; }
            var tocar = function (url) { var au = new window.Audio(url); TST.audioAtual = au; au.onended = desenhar; au.onerror = desenhar; au.play().catch(desenhar); };
            TST.cacheAudio = TST.cacheAudio || {};
            if (TST.cacheAudio[q.n]) tocar(TST.cacheAudio[q.n]);
            else google.script.run.withSuccessHandler(function (url) { if (!TST) return; TST.cacheAudio[q.n] = url; tocar(url); })
              .withFailureHandler(function (e) { alert(e.message || e); desenhar(); }).obterAudioTeste(EMAIL, t.id, q.n);
          });
          $('tt-ant').addEventListener('click', function () { TST.i--; desenhar(); });
          $('tt-prox').addEventListener('click', function () { if (TST.i < t.questoes.length - 1) { TST.i++; desenhar(); } else terminar(); });
          $('tt-fim').addEventListener('click', terminar);
          relogio();
        };
        var relogio = function () { if (!TST || !$('tt-tempo')) return; var r = Math.round((TST.fim - Date.now()) / 1000); $('tt-tempo').textContent = '' + formatarTempo(Math.max(0, r)); $('tt-tempo').classList.toggle('fim', r <= 300); if (r <= 0) terminar(true); };
        var terminar = function (auto) {
          if (!TST || TST.enviando) return;
          var falta = t.questoes.filter(function (x) { return TST.resp[x.n] === undefined; }).length;
          if (!auto && falta && !confirm(falta + ' question(s) sans réponse. Terminer quand même ?')) return;
          TST.enviando = true; clearInterval(TST.timer); Voz.parar && Voz.parar();
          delete PROG_LOCAL[t.id];
          google.script.run.withSuccessHandler(function (r) {
            if (GRADE_CACHE && GRADE_CACHE[t.tipo]) GRADE_CACHE[t.tipo].forEach(function (c) {
              if (c.id !== t.id) return;
              c.tentativas = (c.tentativas || 0) + 1; c.encours = false;
              if (c.score === undefined || r.score > c.score) { c.score = r.score; c.nclc = r.nclc; c.bonnes = r.bonnes + ' / ' + r.total; }
              c.estado = c.nclc >= GRADE_CACHE.seuil ? 'reussi' : 'nonreussi';
            });
            mostrarResultadoTeste(t, TST ? TST.resp : {}, r); TST = null;
          })
            .withFailureHandler(function (e) { TST.enviando = false; alert(e.message || e); }).corrigirTeste(EMAIL, t.id, TST.resp, Math.round((Date.now() - TST.inicio) / 1000));
        };
        TST.timer = setInterval(relogio, 1000);
        desenhar();
      }).withFailureHandler(function (e) { tela.innerHTML = '<p class="vazio erro">' + esc(e.message || e) + '</p>'; }).obterTeste(EMAIL, id);
    }
    /**
     * Tela de correção no estilo Français na Mira: resumo + quadradinhos (verde = certa, vermelho = errada,
     * sem cor = pulada) e, abaixo, a questão escolhida com a resposta certa e a explicação.
     * r.professor = visão da professora (sem respostas de aluno, sem score).
     */
    function mostrarResultadoTeste(t, resp, r) {
      pararTeste();
      var tela = $('tela-hub'), prof = !!r.professor, atual = 0;
      var nomeTipo = t.tipo === 'CO' ? 'Compréhension orale' : 'Compréhension écrite';
      var num = Number(String(t.id).slice(-2)) || 0;
      var partes = [PARTE_ACCUEIL(), { rotulo: 'Simulados', fn: abrirSimulados }, { rotulo: prof ? 'Correction · épreuve ' + num : 'Résultat' }];
      var det = function (q) { return r.detalhes.filter(function (x) { return x.n === q.n; })[0] || {}; };
      var estado = function (q) { var d = det(q); return prof ? 'neutro' : d.resposta === null || d.resposta === undefined ? 'pulada' : d.ok ? 'ok' : 'ko'; };
      var puladas = prof ? 0 : t.questoes.filter(function (q) { return estado(q) === 'pulada'; }).length;
      var erradas = prof ? 0 : t.questoes.filter(function (q) { return estado(q) === 'ko'; }).length;
      var cab = '<div class="bloco mira-res">' + '<div class="mira-faixa"></div>' +
        '<div class="mira-res-topo"><span class="mira-alvo" aria-hidden="true"></span><div><small class="mira-marca">Français na Mira · TCF Canada</small>' +
        '<h2>' + nomeTipo + (num ? ', épreuve ' + num : ', démonstration') + '</h2></div></div>' +
        (prof ? '<p class="aviso">Vue professeure : toutes les réponses et explications, sans passer l\'épreuve. Rien n\'est enregistré.</p>' :
          '<div class="mira-placar"><div class="mira-score"><b>' + r.score + '</b><span>/ 699</span></div>' +
          '<div class="mira-dados"><span class="mira-nclc">NCLC ' + r.nclc + '</span><span><i class="tg-dot reussi"></i>' + r.bonnes + ' bonnes</span><span><i class="tg-dot nonreussi"></i>' + erradas + ' erreurs</span><span><i class="tg-dot vide"></i>' + puladas + ' sans réponse</span></div></div>' +
          (r.revisao ? '<p class="aviso">Correction de votre dernière tentative' + (r.data ? ' (' + dataFr(r.data) + ')' : '') + '.</p>' : '<p class="aviso">Score calculé comme au TCF (points croissants de A1 à C2). Estimation à titre d\'entraînement.</p>') +
          (r.entraram ? '<p class="alerta mira-cad">' + r.entraram + ' question' + (r.entraram > 1 ? 's' : '') + ' ajoutée' + (r.entraram > 1 ? 's' : '') + ' à votre cahier d\'erreurs (' + r.noCaderno + ' au total).</p>' : '')) +
        '<div class="ferramentas"><button class="ferramenta destaque" type="button" id="tt-volta">← Toutes les épreuves</button>' +
        (prof ? '<button class="ferramenta" type="button" id="tt-refaz">▶ Passer l\'épreuve comme un élève</button>' : '<button class="ferramenta" type="button" id="tt-refaz">↺ Refaire l\'épreuve</button>') + '</div></div>';
      var desenhar = function () {
        var q = t.questoes[atual], d = det(q), st = estado(q);
        var doc = t.tipo === 'CO' ? '<button class="botao-principal" type="button" id="cr-ouvir" style="width:auto;padding:11px 22px">▶ Écouter le document</button>' +
            (d.script ? '<details class="mira-trans"><summary>Transcription</summary><div class="tt-texto">' + esc(d.script) + '</div></details>' : '') :
          (q.imagem ? '<div class="tt-img"><img src="' + esc(q.imagem) + '" alt="Document" referrerpolicy="no-referrer"></div>' : '') + (q.texte ? '<div class="tt-texto">' + esc(q.texte) + '</div>' : '');
        var selo = prof ? '' : st === 'ok' ? '<span class="mira-selo ok">✓ Bonne réponse</span>' : st === 'ko' ? '<span class="mira-selo ko">✗ Réponse incorrecte</span>' : '<span class="mira-selo pulada">Sans réponse</span>';
        tela.innerHTML = trilha(partes) + cab +
          '<div class="bloco mira-cor"><div class="mira-cor-cab"><h3>Correction</h3>' + (prof ? '' : '<div class="tg-legenda"><span><i class="tg-dot reussi"></i>Correcte</span><span><i class="tg-dot nonreussi"></i>Incorrecte</span><span><i class="tg-dot vide"></i>Sans réponse</span></div>') + '</div>' +
          '<div class="mira-quadros">' + t.questoes.map(function (x, k) { return '<button type="button" class="mira-q ' + estado(x) + (k === atual ? ' atual' : '') + '" data-cq="' + k + '" title="Question ' + x.n + '">' + x.n + '</button>'; }).join('') + '</div>' +
          '<article class="mira-card"><header><b>Question ' + q.n + '</b>' + selo + '<em class="mira-niv">' + esc(q.nivel || d.nivel || '') + '</em></header><div class="mira-corpo">' + doc +
          '<p class="tt-perg">' + esc(q.q) + '</p><ul class="mira-ops">' + q.o.map(function (o, k) {
            var c = k === d.certa ? 'certa' : k === d.resposta ? 'errada' : '';
            return '<li class="' + c + '"><span class="tt-letra">' + 'ABCD'[k] + '</span><span>' + esc(o) + '</span>' + (k === d.certa ? '<i>✔</i>' : k === d.resposta ? '<i>votre réponse</i>' : '') + '</li>';
          }).join('') + '</ul>' +
          (d.x ? '<div class="mira-exp"><span class="mira-letra">' + 'ABCD'.charAt(d.certa) + '</span><p>' + esc(d.x) + '</p></div>' : '') +
          '<div class="tt-nav"><button class="ferramenta" type="button" id="cr-ant"' + (atual ? '' : ' disabled') + '>← Précédente</button>' +
          '<button class="ferramenta destaque" type="button" id="cr-prox"' + (atual < t.questoes.length - 1 ? '' : ' disabled') + '>Suivante →</button></div></div></article>' +
          (r.pieges ? '<div class="mira-pieges"><h4>Les pièges de cette épreuve</h4><p>' + esc(r.pieges).replace(/\n/g, '<br>') + '</p></div>' : '') + '</div>';
        ligarTrilha(tela, partes);
        $('tt-volta').addEventListener('click', abrirSimulados);
        $('tt-refaz').addEventListener('click', function () { abrirTeste(t.id, true); });
        tela.querySelectorAll('[data-cq]').forEach(function (b) { b.addEventListener('click', function () { atual = Number(b.dataset.cq); desenhar(); $('tela-hub').querySelector('.mira-card').scrollIntoView({ behavior: 'smooth', block: 'start' }); }); });
        $('cr-ant').addEventListener('click', function () { atual--; desenhar(); });
        $('cr-prox').addEventListener('click', function () { atual++; desenhar(); });
        if ($('cr-ouvir')) $('cr-ouvir').addEventListener('click', function () {
          var bt = this, fim = function () { bt.disabled = false; bt.textContent = '▶ Réécouter'; };
          bt.disabled = true; bt.textContent = 'Écoute en cours…';
          if (!q.audio) { tocarScript(q.script || d.script, fim); return; }
          google.script.run.withSuccessHandler(function (url) { var au = new window.Audio(url); au.onended = fim; au.onerror = fim; au.play().catch(fim); })
            .withFailureHandler(function (e) { alert(e.message || e); fim(); }).obterAudioTeste(EMAIL, t.id, q.n);
        });
      };
      // começa na primeira questão errada (aluno) ou na primeira (professora)
      if (!prof) { var k0 = -1; t.questoes.some(function (q, k) { if (estado(q) === 'ko') { k0 = k; return true; } }); atual = Math.max(0, k0); }
      desenhar();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    /** Professora: abre a correção completa de uma épreuve sem passar por ela. */
    function abrirCorrecaoProf(id) {
      pararTeste();
      var tela = $('tela-hub'); tela.innerHTML = '<p class="vazio">Chargement de la correction…</p>'; mostrar('tela-hub');
      google.script.run.withSuccessHandler(function (x) { mostrarResultadoTeste(x.t, {}, x.r); })
        .withFailureHandler(function (e) { tela.innerHTML = '<p class="vazio erro">' + esc(e.message || e) + '</p>'; }).correcaoProf(EMAIL, id);
    }

    /** Revisão do caderno de erros do TCF: uma questão por vez, correção imediata, 4 acertos seguidos para sair. */
    function abrirCadernoTCF(lista) {
      pararTeste();
      var fila = lista.slice().sort(function () { return Math.random() - 0.5; }), tela = $('tela-hub'), acertos = 0, saidas = 0;
      var partes = [PARTE_ACCUEIL(), { rotulo: 'Simulados', fn: abrirSimulados }, { rotulo: 'Cahier d\'erreurs' }];
      TST = { t: { id: 'cad' }, timer: null };
      var pontos = function (n) { var h = ''; for (var i = 0; i < 4; i++) h += '<i class="' + (i < n ? 'on' : '') + '"></i>'; return '<span class="cad-serie" title="' + n + ' / 4">' + h + '</span>'; };
      var mostrarQ = function () {
        if (!fila.length) {
          tela.innerHTML = trilha(partes) + '<div class="bloco vazio-bloco"><div class="cadeado">' + ICO.fim + '</div><h2>Session terminée</h2><p>' + acertos + ' bonne' + (acertos > 1 ? 's' : '') + ' réponse' + (acertos > 1 ? 's' : '') +
            (saidas ? ' · <b>' + saidas + ' question' + (saidas > 1 ? 's' : '') + ' sortie' + (saidas > 1 ? 's' : '') + ' du cahier</b>' : '') + '.</p><button class="ferramenta destaque" type="button" id="cad-volta">← Simulados</button></div>';
          ligarTrilha(tela, partes); $('cad-volta').addEventListener('click', abrirSimulados); return;
        }
        var q = fila[0], escolha = null;
        tela.innerHTML = trilha(partes) + '<div class="tt-barra"><b>Cahier d\'erreurs</b><span>' + fila.length + ' question' + (fila.length > 1 ? 's' : '') + ' dans cette session</span><button class="ferramenta" type="button" id="cad-sair">Quitter</button></div>' +
          '<div class="bloco tt-q"><div class="tt-cab"><span>' + (q.tipo === 'CO' ? '' : '') + ' ' + esc(q.id.replace('TCF-', '').replace('-', ' · Test ')) + ' · question ' + q.n + '</span><span>' + pontos(q.serie) + ' <em class="alu-chip">' + q.nivel + '</em></span></div>' +
          (q.tipo === 'CO' ? '<button class="botao-principal" type="button" id="cad-ouvir" style="width:auto;padding:12px 24px">▶ Écouter le document</button>' :
            (q.imagem ? '<div class="tt-img"><img src="' + esc(q.imagem) + '" alt="Document" referrerpolicy="no-referrer"></div>' : '') + (q.texte ? '<div class="tt-texto">' + esc(q.texte).replace(/\n/g, '<br>') + '</div>' : '')) +
          '<p class="tt-perg">' + esc(q.q) + '</p><div class="tt-opts">' + q.o.map(function (o, k) {
            return '<label class="tt-opt"><input type="radio" name="cad" value="' + k + '"><span class="tt-letra">' + 'ABCD'[k] + '</span>' + esc(o) + '</label>';
          }).join('') + '</div><div id="cad-fb"></div><div class="tt-nav"><span></span><button class="ferramenta destaque" type="button" id="cad-ok" disabled>Valider</button></div></div>';
        ligarTrilha(tela, partes);
        $('cad-sair').addEventListener('click', abrirSimulados);
        tela.querySelectorAll('input[name="cad"]').forEach(function (r) { r.addEventListener('change', function () { escolha = Number(r.value); tela.querySelectorAll('.tt-opt').forEach(function (l, k) { l.classList.toggle('on', k === escolha); }); $('cad-ok').disabled = false; }); });
        if ($('cad-ouvir')) $('cad-ouvir').addEventListener('click', function () {
          var bt = this; bt.disabled = true; bt.textContent = 'Écoute en cours…';
          var fim = function () { bt.disabled = false; bt.textContent = '▶ Réécouter'; };
          if (!q.audio) { tocarScript(q.script, fim); return; }
          google.script.run.withSuccessHandler(function (url) { var au = new window.Audio(url); au.onended = fim; au.onerror = fim; au.play().catch(fim); }).withFailureHandler(function (e) { alert(e.message || e); fim(); }).obterAudioTeste(EMAIL, q.id, q.n);
        });
        $('cad-ok').addEventListener('click', function () {
          var bt = this;
          if (bt.dataset.fase === 'prox') { mostrarQ(); return; }
          bt.disabled = true;
          google.script.run.withSuccessHandler(function (r) {
            fila.shift();
            tela.querySelectorAll('.tt-opt').forEach(function (l, k) { l.classList.toggle('certa', k === r.certa); l.classList.toggle('errada', k === escolha && !r.ok); l.querySelector('input').disabled = true; });
            if (r.ok) acertos++;
            if (r.saiu) saidas++;
            else { q.serie = r.serie; fila.push(q); }
            $('cad-fb').innerHTML = '<div class="cad-fb ' + (r.ok ? 'ok' : 'ko') + '"><b>' + (r.saiu ? 'Bravo ! Cette question sort de votre cahier.' : r.ok ? '✓ Bonne réponse · ' + r.serie + ' / 4 d\'affilée' : '✗ Pas encore : la série repart à zéro.') + '</b>' +
              (r.x ? '<p>' + esc(r.x) + '</p>' : '') + (r.script && q.tipo === 'CO' ? '<details><summary>Transcription</summary><p>' + esc(r.script).replace(/\n/g, '<br>') + '</p></details>' : '') + '</div>';
            bt.disabled = false; bt.dataset.fase = 'prox'; bt.textContent = fila.length ? 'Question suivante →' : 'Terminer';
          }).withFailureHandler(function (e) { bt.disabled = false; alert(e.message || e); }).responderCaderno(EMAIL, q.id, q.n, escolha);
        });
      };
      mostrarQ();
    }

    // ================= VOCABULAIRE « HEBDOMADAIRE » (quiz por temas) =================
    var VOC = null, VOC_SEL = {};
    var VOC_LOTE = 20;
    function vocTodas() { return [].concat.apply([], VOC.temas.map(function (t) { return t.cartas.map(function (c) { c.tema = t.nome; return c; }); })); }
    function vocDoTema(nome) { var t = VOC.temas.filter(function (x) { return x.nome === nome; })[0]; return t ? t.cartas : []; }
    function vocSelecionadas() {
      var nomes = Object.keys(VOC_SEL).filter(function (k) { return VOC_SEL[k]; });
      return nomes.length ? [].concat.apply([], nomes.map(vocDoTema)) : vocTodas();
    }
    function vocErros() { var e = VOC.progresso.__err; return vocTodas().filter(function (c) { return e[c.id] !== undefined; }); }
    function vocEnviar(pend, cb) {
      if (!pend.length) { if (cb) cb(); return; }
      var l = pend.splice(0, pend.length);
      google.script.run.withSuccessHandler(function (p) { VOC.progresso.__err = p.__err; VOC.progresso.__vu = p.__vu; if (cb) cb(); })
        .withFailureHandler(function () { if (cb) cb(); }).salvarQuizVocab(EMAIL, l);
    }
    function abrirVocab() {
      if (!B) return;
      var tela = $('tela-hub'), partes = [PARTE_ACCUEIL(), { rotulo: 'Vocabulaire' }];
      if (!temModulo('VOCAB')) { tela.innerHTML = trilha(partes) + '<div class="bloco vazio-bloco"><div class="cadeado">' + ICO.cadeado + '</div><p>Le vocabulaire n\'est pas encore ouvert pour vous.</p></div>'; ligarTrilha(tela, partes); mostrar('tela-hub'); return; }
      var desenhar = function () {
        var err = VOC.progresso.__err, vu = VOC.progresso.__vu;
        var sel = Object.keys(VOC_SEL).filter(function (k) { return VOC_SEL[k]; }), cartas = vocSelecionadas();
        var disp = cartas.filter(function (c) { return err[c.id] === undefined; }), novas = disp.filter(function (c) { return !vu[c.id]; }).length;
        var nErr = vocErros().length, grupos = [];
        VOC.temas.forEach(function (t) { if (grupos.indexOf(t.grupo) === -1) grupos.push(t.grupo); });
        tela.innerHTML = trilha(partes) + '<div class="bloco voc-cab"><div class="mira-faixa"></div><div class="mira-res-topo"><span class="mira-alvo" aria-hidden="true"></span><div><small class="mira-marca">Français na Mira · Hebdomadaire</small><h2>Vocabulaire</h2></div></div>' +
          '<p class="intro">Choisissez tout ou seulement les thèmes qui vous intéressent. Chaque question montre un mot en français et 4 traductions possibles.</p></div>' +
          '<div class="bloco"><div class="voc-tudo"><button type="button" class="voc-tema tudo' + (sel.length ? '' : ' on') + '" data-voc-tudo><span></span><b>Tout</b><small>' + vocTodas().length + ' mots</small></button></div>' +
          grupos.map(function (g) {
            return '<h4 class="voc-grupo">' + esc(g) + '</h4><div class="voc-temas">' + VOC.temas.filter(function (t) { return t.grupo === g; }).map(function (t) {
              var vistos = t.cartas.filter(function (c) { return vu[c.id]; }).length;
              return '<button type="button" class="voc-tema' + (VOC_SEL[t.nome] ? ' on' : '') + '" data-voc-t="' + esc(t.nome) + '"><b>' + esc(t.nome) + '</b><small>' + vistos + ' / ' + t.cartas.length + ' vus</small></button>';
            }).join('') + '</div>';
          }).join('') +
          '<p class="voc-cont">' + (sel.length ? sel.length + ' thème' + (sel.length > 1 ? 's' : '') + ' choisi' + (sel.length > 1 ? 's' : '') + ' · ' : 'Tous les thèmes · ') + '<b>' + disp.length + '</b> mots disponibles' + (novas ? ' dont ' + novas + ' jamais vus' : '') + '</p>' +
          '<div class="voc-acoes"><button class="botao-principal" type="button" id="voc-go"' + (disp.length ? '' : ' disabled') + '>Commencer</button>' +
          '<button class="ferramenta" type="button" id="voc-cad">Cahier d\'erreurs <b class="voc-badge">' + nErr + '</b></button></div></div>';
        ligarTrilha(tela, partes);
        tela.querySelector('[data-voc-tudo]').addEventListener('click', function () { VOC_SEL = {}; desenhar(); });
        tela.querySelectorAll('[data-voc-t]').forEach(function (b) { b.addEventListener('click', function () { VOC_SEL[b.dataset.vocT] = !VOC_SEL[b.dataset.vocT]; desenhar(); }); });
        $('voc-go').addEventListener('click', function () {
          var nao = disp.filter(function (c) { return !vu[c.id]; }), ja = disp.filter(function (c) { return vu[c.id]; });
          var emb = function (l) { return l.slice().sort(function () { return Math.random() - 0.5; }); };
          vocQuiz(emb(nao).concat(emb(ja)), false);
        });
        $('voc-cad').addEventListener('click', vocCaderno);
      };
      if (VOC) { desenhar(); mostrar('tela-hub'); return; }
      tela.innerHTML = '<p class="vazio">Chargement…</p>'; mostrar('tela-hub');
      google.script.run.withSuccessHandler(function (v) { VOC = v; VOC.temas.forEach(function (t) { t.cartas.forEach(function (c) { c.tema = t.nome; }); }); desenhar(); })
        .withFailureHandler(function (e) { tela.innerHTML = '<p class="vazio erro">' + esc(e.message || e) + '</p>'; }).obterVocab(EMAIL);
    }
    /** Caderno de erros do vocabulário: lotes de 20 palavras. */
    function vocCaderno() {
      var tela = $('tela-hub'), partes = [PARTE_ACCUEIL(), { rotulo: 'Vocabulaire', fn: abrirVocab }, { rotulo: 'Cahier d\'erreurs' }];
      var l = vocErros(), lotes = [];
      for (var i = 0; i < l.length; i += VOC_LOTE) lotes.push(l.slice(i, i + VOC_LOTE));
      tela.innerHTML = trilha(partes) + '<div class="bloco"><h2>Cahier d\'erreurs</h2><p class="aviso">Les mots sont regroupés par lots de 20. Une erreur remet le compteur à zéro : il faut répondre correctement <b>' + VOC.meta + ' fois de suite</b> pour qu\'un mot sorte du cahier.</p>' +
        (lotes.length ? '<div class="voc-lotes">' + lotes.map(function (lo, k) { return '<button type="button" class="voc-lote" data-lote="' + k + '"><b>Lot ' + (k + 1) + '</b><span class="voc-badge">' + lo.length + ' mots</span></button>'; }).join('') + '</div>' : '<p class="gm-ativa">Aucune erreur pour le moment, félicitations !</p>') +
        '<button class="ferramenta" type="button" id="voc-volta">← Retour</button></div>';
      ligarTrilha(tela, partes);
      $('voc-volta').addEventListener('click', abrirVocab);
      tela.querySelectorAll('[data-lote]').forEach(function (b) { b.addEventListener('click', function () { vocQuiz(lotes[Number(b.dataset.lote)].slice().sort(function () { return Math.random() - 0.5; }), true); }); });
      mostrar('tela-hub');
    }
    /** Quiz: palavra em francês, 4 traduções, dica « Pour vous en souvenir ». Sessões de 20 perguntas. */
    function vocQuiz(fila, modoErros) {
      var tela = $('tela-hub'), partes = [PARTE_ACCUEIL(), { rotulo: 'Vocabulaire', fn: function () { vocEnviar(pend); abrirVocab(); } }, { rotulo: modoErros ? 'Cahier d\'erreurs' : 'Quiz' }];
      var pend = [], idx = 0, certas = 0, erradas = 0, sessao = fila.slice(0, VOC_LOTE), resto = fila.slice(VOC_LOTE);
      var err = VOC.progresso.__err, vu = VOC.progresso.__vu;
      // palavras de cada tradução (sem acento, 4+ letras): distrator que compartilha uma palavra com a resposta
      // seria quase sinônimo (ex.: « contudo », « além disso ») e deixaria a pergunta ambígua
      var toks = function (t) { return String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z]+/).filter(function (w) { return w.length > 3; }); };
      var opcoes = function (c) {
        // conectores da mesma função (duas causas, duas concessões…) também não podem concorrer entre si
        var funcao = function (x) { var m = String(x.dica || '').match(/(?:^|\n)(Causa|Consequência|Finalidade|Oposição|Concessão|Adição)\./); return m ? m[1] : ''; };
        var tc = toks(c.trad), fc = funcao(c), valido = function (x) { return x.id !== c.id && x.trad !== c.trad && !(fc && funcao(x) === fc) && !toks(x.trad).some(function (w) { return tc.indexOf(w) !== -1; }); };
        var pool = (c.tema ? vocDoTema(c.tema) : []).filter(valido);
        if (pool.length < 3) pool = vocTodas().filter(valido);
        var d = [], vistos = {};
        pool.slice().sort(function () { return Math.random() - 0.5; }).forEach(function (x) { if (d.length < 3 && !vistos[x.trad]) { vistos[x.trad] = 1; d.push(x); } });
        return d.concat([c]).sort(function () { return Math.random() - 0.5; });
      };
      var resumo = function () {
        vocEnviar(pend);
        var restantes = modoErros ? vocErros().length : resto.length;
        tela.innerHTML = trilha(partes) + '<div class="bloco voc-resumo"><h2>Résultat de la session</h2><div class="voc-nums"><div><b>' + certas + '</b><span>Correctes</span></div><div><b>' + erradas + '</b><span>Erreurs</span></div><div><b>' + restantes + '</b><span>Restantes</span></div></div>' +
          '<div class="voc-acoes">' + (restantes ? '<button class="botao-principal" type="button" id="voc-cont">Continuer</button>' : '') + '<button class="ferramenta" type="button" id="voc-menu">Retour au menu</button></div></div>';
        ligarTrilha(tela, partes);
        if ($('voc-cont')) $('voc-cont').addEventListener('click', function () { if (modoErros) vocCaderno(); else vocQuiz(resto, false); });
        $('voc-menu').addEventListener('click', abrirVocab);
      };
      var mostrarQ = function () {
        if (idx >= sessao.length) { resumo(); return; }
        var c = sessao[idx], ops = opcoes(c), serie = err[c.id];
        tela.innerHTML = trilha(partes) + '<div class="bloco voc-quiz"><div class="voc-barra"><i style="width:' + Math.round(100 * idx / sessao.length) + '%"></i></div>' +
          '<div class="voc-q-topo"><small>' + esc(c.tema || '') + '</small><span>' + (idx + 1) + ' / ' + sessao.length + '</span></div>' +
          '<p class="voc-rot">Choisissez la bonne traduction</p><div class="voc-palavra"><b>' + esc(c.mot) + '</b><button type="button" class="ferramenta sutil" id="voc-som" aria-label="Écouter">' + ICO.som + '</button></div>' +
          (serie !== undefined ? '<p class="voc-serie">' + [0, 1, 2, 3].map(function (k) { return '<i class="' + (k < serie ? 'on' : '') + '"></i>'; }).join('') + ' <small>' + serie + ' / ' + VOC.meta + ' pour sortir du cahier</small></p>' : '') +
          '<div class="voc-ops">' + ops.map(function (o) { return '<button type="button" class="voc-op" data-op="' + o.id + '">' + esc(o.trad) + '</button>'; }).join('') + '</div>' +
          '<p class="voc-fb" id="voc-fb"></p><div id="voc-dica"></div><button class="botao-principal" type="button" id="voc-prox" hidden>Suivant →</button></div>';
        ligarTrilha(tela, partes);
        $('voc-som').addEventListener('click', function () { falar({ texto: String(c.mot).replace(/\s*\/.*$/, '').replace(/\(.*?\)/g, '') }); });
        tela.querySelectorAll('[data-op]').forEach(function (b) {
          b.addEventListener('click', function () {
            var ok = b.dataset.op === c.id;
            tela.querySelectorAll('[data-op]').forEach(function (x) { x.disabled = true; if (x.dataset.op === c.id) x.classList.add('certa'); });
            if (!ok) b.classList.add('errada');
            vu[c.id] = 1; pend.push({ id: c.id, ok: ok });
            var fb = $('voc-fb');
            if (ok) {
              certas++;
              if (err[c.id] !== undefined) {
                err[c.id]++;
                if (err[c.id] >= VOC.meta) { delete err[c.id]; fb.textContent = 'Correct ! Ce mot sort du cahier d\'erreurs. '; }
                else fb.textContent = 'Correct ! ' + err[c.id] + ' sur ' + VOC.meta + ' pour sortir du cahier.';
              } else fb.textContent = 'Correct !';
              fb.className = 'voc-fb ok';
            } else {
              erradas++; err[c.id] = 0;
              fb.textContent = 'Incorrect. La réponse était : ' + c.trad; fb.className = 'voc-fb ko';
            }
            $('voc-dica').innerHTML = (c.dica || c.ex) ? '<div class="voc-dica"><span>Pour vous en souvenir</span>' + (c.dica ? String(c.dica).split('\n').map(function (l, k) { var cls = /^Português:/.test(l) ? 'voc-pt' : (k === 0 && /^(Latim|Grego|Origem|Vem|Pense|Árabe|Chinês|Náuatle|Italiano|Germânico|Palavra|Mistura|De franc)/.test(l) ? 'voc-etim' : '');
                return '<p' + (cls ? ' class="' + cls + '"' : '') + '>' + (cls === 'voc-pt' ? '<b>Em português:</b> ' + esc(l.replace(/^Português:\s*/, '')) : esc(l)) + '</p>'; }).join('') : '') + (c.ex ? '<p class="voc-ex">« ' + esc(c.ex) + ' »</p>' : '') + '</div>' : '';
            $('voc-prox').hidden = false; $('voc-prox').focus();
            if (pend.length >= 5) vocEnviar(pend);
          });
        });
        $('voc-prox').addEventListener('click', function () { idx++; mostrarQ(); });
      };
      mostrar('tela-hub');
      mostrarQ();
      VOC.sair = function () { vocEnviar(pend); };
    }

    // ================= CHRONOMÈTRE DE L'ORAL =================
    var CHRONO_TACHES = {
      T1: { nome: 'Tâche 1 · Entretien dirigé', fases: [{ nome: 'Parlez', seg: 120, fala: true }], info: '2 min, sans préparation' },
      T2: { nome: 'Tâche 2 · Exercice en interaction', fases: [{ nome: 'Préparation', seg: 120 }, { nome: 'Interaction', seg: 210, fala: true }], info: '2 min de préparation + 3 min 30' },
      T3: { nome: 'Tâche 3 · Expression d\'un point de vue', fases: [{ nome: 'Parlez', seg: 270, fala: true }], info: '4 min 30, sans préparation' }
    };
    var CHR = null;
    function pararChrono() { if (CHR && CHR.timer) clearInterval(CHR.timer); if (CHR && CHR.rec && CHR.rec.state !== 'inactive') try { CHR.rec.stop(); } catch (e) {} if (CHR && CHR.stream) CHR.stream.getTracks().forEach(function (t) { t.stop(); }); CHR = null; }

    function abrirChrono(tache, sujet) {
      pararChrono();
      tache = tache || 'T2';
      var cfg = CHRONO_TACHES[tache];
      var partes = [PARTE_ACCUEIL(), { rotulo: 'Simulados', fn: abrirSimulados }, { rotulo: 'Chronomètre de l\'oral' }];
      var tela = $('tela-hub');
      tela.innerHTML = trilha(partes) + '<h1 class="titulo-pagina">Chronomètre de l\'oral</h1>' +
        '<div class="ch-taches">' + TS().map(function (t) { return '<button type="button" class="chip" data-ch-t="' + t + '" aria-pressed="' + (t === tache) + '">' + CHRONO_TACHES[t].nome + '<small>' + CHRONO_TACHES[t].info + '</small></button>'; }).join('') + '</div>' +
        '<div class="ch-grade"><div class="bloco ch-sujet"><h3>Sujet</h3><div id="ch-sujet-txt">' + (sujet ? '<p class="ch-s">' + esc(sujet.t) + '</p><small>' + esc(sujet.origem || '') + '</small>' : '<p class="aviso">Choisissez un sujet ou tirez-le au sort.</p>') + '</div>' +
        '<div class="ch-fontes"><button class="ferramenta" type="button" id="ch-prof">Sujets de ma professeure</button><button class="ferramenta destaque" type="button" id="ch-sorte">Tirer au hasard</button></div><div id="ch-lista"></div>' +
        (tache === 'T3' ? '<label class="check"><input type="checkbox" id="ch-prep"> Ajouter 1 min de préparation (entraînement)</label>' : '') +
        '<label class="check"><input type="checkbox" id="ch-grav"> M\'enregistrer pendant la prise de parole</label></div>' +
        '<div class="bloco ch-relogio"><svg viewBox="0 0 220 220" class="ch-anel"><circle cx="110" cy="110" r="96" class="ch-fundo-anel"/><circle cx="110" cy="110" r="96" class="ch-prog" id="ch-prog"/></svg>' +
        '<div class="ch-centro"><span id="ch-fase">Prêt(e) ?</span><b id="ch-tempo">' + formatarTempo(cfg.fases[0].seg) + '</b><small id="ch-etapa">' + cfg.info + '</small></div>' +
        '<div class="ch-bts"><button class="botao-principal" type="button" id="ch-go" style="width:auto;padding:12px 26px">▶ Commencer</button><button class="ferramenta" type="button" id="ch-pular" hidden>Passer la préparation</button>' +
        '<button class="ferramenta" type="button" id="ch-reset">↺</button></div><div id="ch-audio"></div></div></div>';
      ligarTrilha(tela, partes);
      mostrar('tela-hub');
      tela.querySelectorAll('[data-ch-t]').forEach(function (b) { b.addEventListener('click', function () { abrirChrono(b.dataset.chT); }); });
      var escolher = function (x, origem) { abrirChrono(tache, { t: x.t || x.resumo || x.titre, origem: origem }); };
      $('ch-sorte').addEventListener('click', function () {
        carregarLista(tache, function () {
          var c = candidatosSorteio(tache, null, '');
          if (!c.length) { avisar({ titulo: 'Aucun sujet ouvert', texto: 'Votre professeure ouvrira bientôt des sujets pour cette tâche.', icone: '', som: false }); return; }
          var x = sorteioPonderado ? sorteioPonderado(c, { memoria: 6 }) : c[Math.floor(Math.random() * c.length)];
          escolher(x, 'Tiré au sort');
        });
      });
      $('ch-prof').addEventListener('click', function () {
        var alvo = $('ch-lista'); alvo.innerHTML = '<p class="aviso">Chargement…</p>';
        var itens = TEMAS_MES.filter(function (x) { return x.tache === tache; }).map(function (x) { return { t: x.titre, origem: 'Thème du mois' }; });
        google.script.run.withSuccessHandler(function (st) {
          (st.sessoes || []).forEach(function (s2) { (s2.orais || []).forEach(function (o) { if (o.tache === tache) itens.unshift({ t: o.sujet.t, origem: '' + s2.nome }); }); });
          alvo.innerHTML = itens.length ? '<div class="ch-l">' + itens.map(function (x, i) { return '<button type="button" class="ch-item" data-i="' + i + '"><b>' + esc(String(x.t).slice(0, 140)) + '</b><small>' + esc(x.origem) + '</small></button>'; }).join('') + '</div>'
            : '<p class="aviso">Votre professeure n\'a pas encore choisi de sujet pour cette tâche.</p>';
          alvo.querySelectorAll('.ch-item').forEach(function (b) { b.addEventListener('click', function () { escolher(itens[Number(b.dataset.i)], itens[Number(b.dataset.i)].origem); }); });
        }).withFailureHandler(function () {
          alvo.innerHTML = itens.length ? '<div class="ch-l">' + itens.map(function (x, i) { return '<button type="button" class="ch-item" data-i="' + i + '"><b>' + esc(x.t) + '</b><small>' + esc(x.origem) + '</small></button>'; }).join('') + '</div>' : '<p class="aviso">Aucun sujet choisi par votre professeure.</p>';
          alvo.querySelectorAll('.ch-item').forEach(function (b) { b.addEventListener('click', function () { escolher(itens[Number(b.dataset.i)], itens[Number(b.dataset.i)].origem); }); });
        }).obterEstadoEpreuve(EMAIL);
      });
      var circ = 2 * Math.PI * 96, prog = $('ch-prog');
      prog.style.strokeDasharray = circ; prog.style.strokeDashoffset = 0;
      var fases = function () { var f = cfg.fases.slice(); if (tache === 'T3' && $('ch-prep') && $('ch-prep').checked) f.unshift({ nome: 'Préparation', seg: 60 }); return f; };
      var desenhar = function () {
        if (!CHR) return;
        var f = CHR.fases[CHR.i], resta = f.seg - CHR.dec;
        $('ch-tempo').textContent = formatarTempo(Math.max(0, resta));
        $('ch-fase').textContent = f.nome + (CHR.pausa ? ' · en pause' : '');
        $('ch-etapa').textContent = 'Étape ' + (CHR.i + 1) + ' / ' + CHR.fases.length;
        prog.style.strokeDashoffset = circ * (CHR.dec / f.seg);
        prog.classList.toggle('fala', !!f.fala); prog.classList.toggle('fim', resta <= 30);
        $('ch-pular').hidden = !!f.fala;
        $('ch-go').textContent = CHR.pausa ? '▶ Reprendre' : 'Pause';
      };
      var gravar = function () {
        if (!$('ch-grav') || !$('ch-grav').checked || !navigator.mediaDevices || !window.MediaRecorder) return;
        navigator.mediaDevices.getUserMedia({ audio: true }).then(function (st) {
          if (!CHR) { st.getTracks().forEach(function (t) { t.stop(); }); return; }
          CHR.stream = st; var partes2 = [];
          CHR.rec = new MediaRecorder(st);
          CHR.rec.ondataavailable = function (e) { if (e.data && e.data.size) partes2.push(e.data); };
          CHR.rec.onstop = function () {
            st.getTracks().forEach(function (t) { t.stop(); });
            var au = $('ch-audio'); if (au) au.innerHTML = '<p class="aviso">Votre enregistrement :</p><audio controls src="' + URL.createObjectURL(new Blob(partes2, { type: 'audio/webm' })) + '"></audio>';
          };
          CHR.rec.start(1000);
        }).catch(function () {});
      };
      var mudarFase = function () {
        CHR.i++; CHR.dec = 0; bip();
        if (CHR.i >= CHR.fases.length) {
          clearInterval(CHR.timer); CHR.timer = null;
          if (CHR.rec && CHR.rec.state !== 'inactive') CHR.rec.stop();
          $('ch-fase').textContent = 'Terminé !'; $('ch-tempo').textContent = '0:00'; $('ch-go').textContent = '↺ Recommencer'; $('ch-pular').hidden = true;
          avisar({ titulo: 'Temps écoulé', texto: 'Bravo, vous avez terminé la ' + cfg.nome + '.', icone: '', som: false });
          CHR.fim = true; return;
        }
        var f = CHR.fases[CHR.i];
        avisar({ titulo: f.fala ? 'À vous de parler !' : f.nome, texto: formatarTempo(f.seg), icone: f.fala ? '' : '', som: false, duracao: 5 });
        if (f.fala) gravar();
        desenhar();
      };
      var tick = function () {
        if (!CHR || CHR.pausa) return;
        CHR.dec++;
        var f = CHR.fases[CHR.i];
        if (f.seg - CHR.dec === 30) avisar({ titulo: 'Plus que 30 secondes', texto: f.nome, icone: '', som: true, duracao: 4 });
        if (CHR.dec >= f.seg) mudarFase(); else desenhar();
      };
      $('ch-go').addEventListener('click', function () {
        if (!CHR || CHR.fim) {
          pararChrono();
          CHR = { fases: fases(), i: 0, dec: 0, pausa: false };
          CHR.timer = setInterval(tick, 1000);
          if (CHR.fases[0].fala) gravar();
          desenhar(); return;
        }
        CHR.pausa = !CHR.pausa; desenhar();
      });
      $('ch-pular').addEventListener('click', function () { if (CHR && !CHR.fases[CHR.i].fala) mudarFase(); });
      $('ch-reset').addEventListener('click', function () { abrirChrono(tache, sujet); });
    }

    // ---------- professora: geração dos modelos de todos os temas ----------
    function ligarGeracao() {
      var alvo = $('gm-conteudo');
      var desenhar = function (st) {
        if (!$('gm-conteudo')) return;
        var tot = 0, pr = 0;
        var linhas = ORDEM_TACHES.map(function (t) {
          var x = st.taches[t]; tot += x.total; pr += x.prontos;
          var pct = x.total ? Math.round(100 * x.prontos / x.total) : 0;
          return '<div class="gm-linha"><span>' + nomeTache(t) + ' · ' + TACHES[t].sous + '</span><div class="gm-barra"><i style="width:' + pct + '%"></i></div><b>' + x.prontos + ' / ' + x.total + '</b></div>';
        }).join('');
        var pctT = tot ? Math.round(100 * pr / tot) : 0;
        alvo.innerHTML = '<div class="gm-total"><b>' + pctT + '%</b><span>' + pr + ' modèles prêts sur ' + tot + ' sujets</span></div>' + linhas +
          (st.ultimo ? '<p class="aviso">Dernier passage : ' + new Date(st.ultimo.quando).toLocaleString('fr-FR') + ' · ' + st.ultimo.feitos + ' modèles rédigés' + (st.ultimo.erros ? ' · ' + st.ultimo.erros + ' à refaire' : '') + '</p>' : '') +
          (!st.iaConfigurada ? '<div class="alerta">La clé de l\'IA n\'est pas configurée : exécutez configurarChaveIA() dans l\'éditeur.</div>' :
            st.ativa ? '<p class="gm-ativa">Génération en cours en arrière-plan…</p><button class="ferramenta perigo" type="button" id="gm-parar">Arrêter</button>' :
            (pr < tot ? '<button class="botao-principal" type="button" id="gm-iniciar" style="width:auto;padding:12px 26px">Rédiger tous les modèles manquants</button>' : '<p class="gm-ativa">Tous les sujets ont un modèle.</p>'));
        if ($('gm-iniciar')) $('gm-iniciar').addEventListener('click', function () { this.disabled = true; google.script.run.withSuccessHandler(desenhar).withFailureHandler(function (e) { alert(e.message || e); }).iniciarGeracaoApp(EMAIL); });
        if ($('gm-parar')) $('gm-parar').addEventListener('click', function () { google.script.run.withSuccessHandler(desenhar).pararGeracaoApp(EMAIL); });
      };
      var atualizar = function () { if ($('gm-conteudo')) google.script.run.withSuccessHandler(function (st) { desenhar(st); if (st.ativa) setTimeout(atualizar, 30000); }).statusGeracaoApp(EMAIL); };
      atualizar();
    }

    /** Envia o comprovante (imagem ou PDF, até 8 Mo) para o pacote da linha indicada. */
    function enviarComprovante(arq, linha, fim, alunoEmail) {
      if (arq.size > 8 * 1024 * 1024) { alert('Fichier trop lourd (8 Mo maximum).'); fim(); return; }
      var lr = new FileReader();
      lr.onload = function () {
        var b64 = String(lr.result).split(',')[1];
        google.script.run.withSuccessHandler(function () { avisar({ titulo: 'Justificatif envoyé', texto: arq.name, icone: '', som: false }); fim(); })
          .withFailureHandler(function (e) { alert('Le justificatif n\'a pas pu être envoyé : ' + (e.message || e)); fim(); })
          .anexarComprovante(EMAIL, linha, arq.name, arq.type || 'application/octet-stream', b64, alunoEmail || '');
      };
      lr.readAsDataURL(arq);
    }

    // ---------- professora: cours à confirmer ----------
    function ligarAConfirmar() {
      google.script.run.withSuccessHandler(function (l) {
        var ap = $('pg-pend'); if (!ap) return;
        ap.innerHTML = l.length ? l.map(function (p, i) {
          return '<div class="ac-item pag" data-i="' + i + '"><div><b>' + esc(p.nome) + '</b><small>' + esc(p.pack) + ' · ' + p.cours + ' cours · ' + moeda(p.remise ? p.total : p.prix) + (p.remise ? ' (tarif ' + moeda(p.prix) + ')' : '') + ' · déclaré le ' + dataFr(p.achat) + (p.horarios ? ' · horaires : ' + esc(p.horarios) : '') + '</small>' +
            (p.datas.length ? '' : '<div class="pg-hor"><small class="aviso">Pas encore d\'horaires pour cet élève : choisissez les jours et l\'heure, les dates sont calculées tout de suite.</small>' + htmlEditorHorarios('') + '</div>') +
            '<div class="pg-datas" data-datas></div><small class="aviso">Dates calculées automatiquement : modifiez-les si nécessaire avant de confirmer.</small></div>' +
            '<div class="ac-bts">' + (p.justificatif ? '<a class="ferramenta" href="' + esc(p.justificatif) + '" target="_blank" rel="noopener">Voir le justificatif</a>' : '<small class="aviso">Pas de justificatif joint</small>') +
            '<label class="ac-rem">Remise (R$)<input type="number" min="0" step="0.01" data-rem value="' + (p.remise || 0) + '"></label><input placeholder="Motif de la remise" data-motif value="' + esc(p.motif || '') + '">' +
            '<input placeholder="Nota fiscal (facultatif)" data-nf><button class="ferramenta destaque" type="button" data-ok>✓ Paiement reçu</button></div></div>';
        }).join('') : '<p class="vazio">Aucun paiement en attente.</p>';
        ap.querySelectorAll('.ac-item').forEach(function (it) {
          var p = l[Number(it.dataset.i)];
          var desenharDatas = function (lista) {
            it.querySelector('[data-datas]').innerHTML = lista.map(function (d, k) {
              return '<label><span>Cours ' + (k + 1) + '</span><input type="date" data-d="' + k + '" value="' + dataIso(d.data) + '"><input type="time" data-h="' + k + '" value="' + esc(d.hora) + '"></label>';
            }).join('');
            p.datas = lista;
          };
          desenharDatas(p.datas);
          var ed = it.querySelector('.pg-hor');
          if (ed) ligarEditorHorarios(ed, function () { p.horariosNovos = lerEditorHorarios(ed); desenharDatas(proxAulasCli(p.horariosNovos, Date.now() - 86400000, p.cours)); });
          it.querySelector('[data-ok]').addEventListener('click', function () {
            it.classList.add('feito');
            var confirmar = function () { google.script.run.withSuccessHandler(function (r) {
              it.remove();
              avisar({ titulo: 'Forfait confirmé', texto: p.nome + ' · ' + (r.criadas || 0) + ' cours planifiés' + (r.emailEnviado ? ' · nota de compra envoyée' : ''), icone: '', som: false });
              if (r.emailErro) avisar({ titulo: 'Le comprovante n\'a pas été envoyé', texto: r.emailErro, icone: '', tipo: 'urgente', som: false, duracao: 20 });
            })
              .withFailureHandler(function (e) { it.classList.remove('feito'); alert(e.message || e); })
              .marcarPackPago(EMAIL, p.aluno, p.linha, !p.datas.length, it.querySelector('[data-nf]').value, true,
                p.datas.map(function (d, k) { return { data: it.querySelector('[data-d="' + k + '"]').value, hora: it.querySelector('[data-h="' + k + '"]').value }; })); };
            var comHorario = function () {
              if (p.horariosNovos) google.script.run.withSuccessHandler(confirmar).withFailureHandler(function (e) { it.classList.remove('feito'); alert(e.message || e); })
                .salvarDadosJournal(EMAIL, p.aluno, { horarios: p.horariosNovos, replanejar: false });
              else confirmar();
            };
            // desconto dado na confirmação: grava antes de marcar como pago (a nota já sai com o desconto)
            var rem = Number(String(it.querySelector('[data-rem]').value).replace(',', '.')) || 0, mot = it.querySelector('[data-motif]').value;
            if (rem !== (Number(p.remise) || 0) || mot !== (p.motif || '')) {
              if (rem > p.prix) { it.classList.remove('feito'); alert('La remise ne peut pas dépasser le prix.'); return; }
              google.script.run.withSuccessHandler(comHorario).withFailureHandler(function (e) { it.classList.remove('feito'); alert(e.message || e); }).definirRemisePack(EMAIL, p.aluno, p.linha, rem, mot);
            } else comHorario();
          });
        });
      }).listarPagamentosPendentes(EMAIL);
      var alvo = $('ac-lista');
      alvo.innerHTML = '<p class="vazio">Chargement…</p>';
      google.script.run.withSuccessHandler(function (l) {
        if (!l.length) { alvo.innerHTML = '<p class="vazio">Tous les cours sont confirmés. </p>'; return; }
        alvo.innerHTML = l.map(function (c, i) {
          return '<div class="ac-item" data-i="' + i + '"><div><b>' + esc(c.nome) + '</b><small>' + dataFr(c.data, { weekday: 'long', day: '2-digit', month: '2-digit' }) + ' · ' + esc(c.hora || '') + (c.grupo ? ' · ' + esc(c.grupo) : '') + (c.obs ? ' · ' + esc(c.obs) : '') + '</small></div>' +
            '<div class="ac-bts"><button class="ferramenta destaque" type="button" data-st="donné">✓ Donné</button><button class="ferramenta" type="button" data-st="absent">Absent</button>' +
            '<button class="ferramenta" type="button" data-st="absence justifiée">Absence justifiée</button><button class="ferramenta" type="button" data-st="annulé (professeur)">Annulé (moi)</button></div></div>';
        }).join('');
        alvo.querySelectorAll('.ac-item').forEach(function (it) {
          var c = l[Number(it.dataset.i)];
          it.querySelectorAll('[data-st]').forEach(function (b) {
            b.addEventListener('click', function () {
              var st = b.dataset.st, repo = '';
              if (st === 'absence justifiée' || st === 'annulé (professeur)') {
                repo = prompt('Date de la reposition (AAAA-MM-JJ). Laissez vide s\'il n\'y a pas de reposition :', '') || '';
              }
              it.classList.add('feito');
              google.script.run.withSuccessHandler(function () { it.remove(); if (!alvo.children.length) alvo.innerHTML = '<p class="vazio">Tous les cours sont confirmés. </p>'; })
                .withFailureHandler(function (e) { it.classList.remove('feito'); alert(e.message || e); }).confirmarCours(EMAIL, c.aluno, c.linha, st, repo);
            });
          });
        });
      }).withFailureHandler(function (e) { alvo.innerHTML = '<p class="vazio erro">' + esc(e.message || e) + '</p>'; }).listarAConfirmar(EMAIL);
    }

function abasEspace(ativa) {
      var abas = [['taches', 'Mes tâches', 'abrirTarefas'], ['notes', 'Mes notes', 'abrirNotes'], ['cahier', 'Cahier d\'erreurs', 'abrirCarnet']];
      return '<div class="abas-espace" role="tablist">' + abas.map(function (a) {
        return '<button class="aba-esp' + (a[0] === ativa ? ' on' : '') + '" type="button" role="tab" aria-selected="' + (a[0] === ativa) + '" data-esp="' + a[2] + '">' + a[1] + '</button>';
      }).join('') + '</div>';
    }
    function ligarAbasEspace(raiz) {
      raiz.querySelectorAll('[data-esp]').forEach(function (b) {
        b.addEventListener('click', function () { ({ abrirJournal: abrirJournal, abrirForfait: abrirForfait, abrirTarefas: abrirTarefas, abrirNotes: abrirNotes, abrirCarnet: abrirCarnet })[b.dataset.esp](); });
      });
    }
    var PARTE_ESPACE = function () { return { rotulo: 'Mon espace', fn: abrirTarefas }; };

    /** Página "Mes devoirs": só as tarefas de casa e as mensagens da professora. */
    function abrirTarefas() {
      if (!B) return;
      mostrar('tela-taches');
      var tela = $('tela-taches');
      tela.innerHTML = '<p class="vazio">Chargement…</p>';
      google.script.run.withSuccessHandler(function (msgs) {
        MENSAGENS = msgs || [];
        atualizarSeloTarefas(function (devs) {
          var partes = [PARTE_ACCUEIL(), PARTE_ESPACE(), { rotulo: 'Mes tâches' }];
          var pend = devs.filter(function (d) { return !d.feito; }), feitos = devs.filter(function (d) { return d.feito; });
          var mPend = MENSAGENS.filter(function (m) { return !m.feito; }), mFeitas = MENSAGENS.filter(function (m) { return m.feito; });
          var html = trilha(partes) + '<h1 class="titulo-pagina">Mon espace</h1>' + abasEspace('taches') +
            '<p class="intro">Les devoirs, les messages et les épreuves proposés par votre professeur(e).</p>' +
            '<button class="hub-acao largura" type="button" id="esp-epreuves"><span></span><b>Mes épreuves</b><small>Écrit (60 min) et enregistrements oraux demandés par votre professeur(e).</small></button>' +
            '<div class="bloco chave-bloco"><div><b>Débloquer un axe</b><small>Votre professeur(e) peut vous donner une clé pour ouvrir un axe thématique.</small></div>' +
            '<div class="chave-campo"><input id="chave-input" placeholder="Clé (ex. : IMM-7K2Q)" autocomplete="off"><button class="ferramenta destaque" type="button" id="chave-bt">Débloquer</button></div><span class="aviso" id="chave-msg"></span></div>';
          html += '<div class="bloco"><h2 class="secao-titulo">À faire <small>(' + pend.length + ')</small></h2>' + (pend.length ? htmlDevoirs(pend) : '<p class="aviso" style="margin:0">Aucun devoir en attente. </p>') + '</div>';
          html += '<div class="bloco"><h2 class="secao-titulo">Messages de votre professeur(e) <small>(' + mPend.length + ' à faire)</small></h2>' +
            (MENSAGENS.length ? htmlMensagens(mPend.concat(mFeitas)) : '<p class="aviso" style="margin:0">Aucun message.</p>') + '</div>';
          if (feitos.length) html += '<div class="bloco"><h2 class="secao-titulo">✓ Devoirs terminés <small>(' + feitos.length + ')</small></h2>' + htmlDevoirs(feitos) + '</div>';
          tela.innerHTML = html;
          ligarTrilha(tela, partes);
          ligarDevoirs(tela);
          ligarMensagens(tela, atualizarSeloTarefas);
          ligarAbasEspace(tela);
          $('esp-epreuves').addEventListener('click', abrirEpreuve);
          resumoEspace(tela, pend.length, mPend.length);
          $('chave-bt').addEventListener('click', function () {
            var msg = $('chave-msg'); msg.textContent = 'Vérification…';
            google.script.run.withSuccessHandler(function (r) {
              recarregarBanco(function () { avisar({ titulo: 'Axe débloqué', texto: r.nome, icone: '', som: false }); abrirTarefas(); });
            }).withFailureHandler(function (e) { msg.textContent = '' + (e.message || e); }).desbloquearEixo(EMAIL, $('chave-input').value);
          });
        });
      }).mesMessages(EMAIL);
    }

    // ================= carnet de révision =================
    var CARNET = [], CARNET_IDS = {};
    function carregarCarnet(cb) {
      google.script.run.withSuccessHandler(function (l) {
        CARNET = l || []; CARNET_IDS = {};
        CARNET.forEach(function (x) { if (x.tipo === 'sujet') CARNET_IDS[x.id] = x; });
        if (cb) cb();
      }).obterCarnet(EMAIL);
    }
    function abrirCarnet() {
      if (!B) return;
      mostrar('tela-carnet');
      var tela = $('tela-carnet');
      tela.innerHTML = '<p class="vazio">Chargement…</p>';
      carregarCarnet(function () {
        var partes = [PARTE_ACCUEIL(), PARTE_ESPACE(), { rotulo: 'Cahier d\'erreurs' }];
        var sujets = CARNET.filter(function (x) { return x.tipo === 'sujet'; }), mots = CARNET.filter(function (x) { return x.tipo === 'mot'; });
        var erros = CARNET.filter(function (x) { return x.tipo === 'erreur'; });
        var html = trilha(partes) + '<h1 class="titulo-pagina">Mon espace</h1>' + abasEspace('cahier') + '<div id="carnet-plataforma"></div>' +
          '<div class="bloco"><h2 class="secao-titulo">Mes erreurs <small>(' + erros.length + ')</small></h2>' +
          (erros.length ? '<div class="erros-lista">' + erros.slice().reverse().map(function (x) {
            var par = String(x.titre).split(' → ');
            return '<div class="erro-item"><div><span class="ia-antes">' + esc(par[0]) + '</span><span class="ia-seta">→</span><span class="ia-depois">' + esc(par[1] || '') + '</span>' +
              (x.detalhe ? '<small>' + esc(x.detalhe) + '</small>' : '') + '</div><button class="ferramenta sutil" type="button" data-rm="' + esc(x.id) + '" aria-label="Retirer">✓ Acquis</button></div>';
          }).join('') + '</div>' : '<p class="aviso" style="margin:0">Les fautes relevées par la correction de l\'IA apparaîtront ici automatiquement. Quand vous ne les faites plus, touchez « ✓ Acquis ».</p>') + '</div>' +
          '<p class="intro">Les modèles que vous avez enregistrés avec « Enregistrer dans mon cahier » et les mots à retenir. Pour chaque modèle, choisissez comment réviser : dictée, oral ou écrit.</p>';
        html += '<div class="bloco"><h2 class="secao-titulo">★ Sujets à réviser <small>(' + sujets.length + ')</small></h2>';
        if (!sujets.length) html += '<p class="vazio">Votre cahier est vide. Ouvrez un modèle et touchez le bouton « Enregistrer dans mon cahier », juste sous le titre.</p>';
        ORDEM_TACHES.forEach(function (t) {
          var l = sujets.filter(function (x) { return x.tache === t; });
          if (!l.length) return;
          html += '<h3 class="carnet-tache">' + nomeTache(t) + ' · ' + TACHES[t].sous + '</h3><div class="carnet-lista">' + l.map(function (x) {
            var e = eixo(x.e), oral = t.indexOf('ET') !== 0;
            return '<div class="carnet-item" style="--cor:' + e.cor + '"><div><b>' + esc(x.titre) + '</b><small>' + e.icone + ' ' + esc(e.nome) + '</small></div><div class="carnet-acoes">' +
              '<button class="ferramenta" type="button" data-cx="etude" data-t="' + t + '" data-id="' + esc(x.id) + '">Étudier</button>' +
              '<button class="ferramenta" type="button" data-cx="dictee" data-t="' + t + '" data-id="' + esc(x.id) + '">Dictée</button>' +
              (oral ? '<button class="ferramenta" type="button" data-cx="oral" data-t="' + t + '" data-id="' + esc(x.id) + '">Oral</button>'
                : '<button class="ferramenta" type="button" data-cx="ecrit" data-t="' + t + '" data-id="' + esc(x.id) + '">Écrire</button>') +
              '<button class="ferramenta sutil" type="button" data-rm="' + esc(x.id) + '" aria-label="Retirer">✕</button></div></div>';
          }).join('') + '</div>';
        });
        html += '</div><div class="bloco"><h2 class="secao-titulo">Mes mots <small>(' + mots.length + ')</small></h2>' +
          (mots.length ? '<div class="mots-carnet">' + mots.map(function (x) {
            return '<div class="mot-carnet"><div><b>' + esc(x.titre) + '</b>' + (x.detalhe ? '<small>' + esc(x.detalhe) + '</small>' : '') + '</div>' +
              '<div><button class="ferramenta sutil" type="button" data-ouvir-mot="' + esc(x.titre) + '" aria-label="Écouter">' + ICO.som + '</button><button class="ferramenta sutil" type="button" data-rm="' + esc(x.id) + '" aria-label="Retirer">✕</button></div></div>';
          }).join('') + '</div>' : '<p class="vazio">Les mots difficiles de vos dictées et le lexique proposé par l\'IA peuvent être ajoutés ici avec « ★ ».</p>') + '</div>';
        tela.innerHTML = html;
        ligarTrilha(tela, partes);
        ligarAbasEspace(tela);
        carregarCadernoPlataforma($('carnet-plataforma'));
        tela.querySelectorAll('[data-cx]').forEach(function (b) { b.addEventListener('click', function () { abrirModelo(b.dataset.t, b.dataset.id, { tipo: 'carnet', foco: b.dataset.cx === 'etude' ? null : b.dataset.cx }); }); });
        tela.querySelectorAll('[data-rm]').forEach(function (b) { b.addEventListener('click', function () { b.disabled = true; google.script.run.withSuccessHandler(function () { abrirCarnet(); }).removerDoCarnet(EMAIL, b.dataset.rm); }); });
        tela.querySelectorAll('[data-ouvir-mot]').forEach(function (b) { b.addEventListener('click', function () { falar({ texto: b.dataset.ouvirMot }); }); });
      });
    }

    // ================= seletor de alunos (busca, grupos, seleção em massa) =================
    function seletorAlunos(alvo) {
      var grupos = [];
      ALUNOS.forEach(function (a) { if (a.grupo && grupos.indexOf(a.grupo) === -1) grupos.push(a.grupo); });
      grupos.sort();
      var sel = {}, gruposSel = {}, todos = true;
      alvo.innerHTML = '<div class="seletor"><label class="check"><input type="checkbox" data-sa="todos" checked> <b>Tous les élèves (' + ALUNOS.length + ')</b></label>' +
        '<div class="sa-detalhe" hidden>' +
        (grupos.length ? '<div class="sa-grupos"><span>Groupes :</span>' + grupos.map(function (g) {
          var n = ALUNOS.filter(function (a) { return a.grupo === g; }).length;
          return '<button class="chip" type="button" data-grupo="' + esc(g) + '" aria-pressed="false">' + esc(g) + ' (' + n + ')</button>';
        }).join('') + '</div>' : '') +
        '<div class="sa-barra"><input type="search" data-sa="busca" placeholder="Rechercher un nom ou un e-mail…"><button class="ferramenta" type="button" data-sa="marcar">Tout cocher</button>' +
        '<button class="ferramenta" type="button" data-sa="limpar">Tout décocher</button><span class="contador" data-sa="n">0 sélectionné</span></div>' +
        '<div class="sa-lista" data-sa="lista"></div></div></div>';
      var q = function (k) { return alvo.querySelector('[data-sa="' + k + '"]'); };
      var desenhar = function () {
        var busca = semAcento(q('busca').value);
        var l = ALUNOS.filter(function (a) { return !busca || semAcento(a.nome + ' ' + a.email + ' ' + (a.grupo || '')).indexOf(busca) !== -1; });
        var porGrupo = {};
        l.forEach(function (a) { var g = a.grupo || 'Sans groupe'; (porGrupo[g] = porGrupo[g] || []).push(a); });
        q('lista').innerHTML = Object.keys(porGrupo).sort().map(function (g) {
          return '<div class="sa-grupo"><h5>' + esc(g) + '</h5><div class="sa-grade">' + porGrupo[g].map(function (a) {
            var marcado = sel[a.email] || gruposSel[a.grupo];
            return '<label class="sa-aluno' + (marcado ? ' on' : '') + '"><input type="checkbox" value="' + esc(a.email) + '"' + (marcado ? ' checked' : '') + (gruposSel[a.grupo] ? ' disabled' : '') + '>' +
              '<span><b>' + esc(a.nome) + '</b><small>' + esc(a.email) + '</small></span></label>';
          }).join('') + '</div></div>';
        }).join('') || '<p class="vazio">Aucun élève trouvé.</p>';
        q('lista').querySelectorAll('input').forEach(function (c) {
          c.addEventListener('change', function () { if (c.checked) sel[c.value] = true; else delete sel[c.value]; contar(); c.closest('.sa-aluno').classList.toggle('on', c.checked); });
        });
        contar();
      };
      var contar = function () {
        var n = ALUNOS.filter(function (a) { return sel[a.email] || gruposSel[a.grupo]; }).length;
        q('n').textContent = n + ' sélectionné' + (n > 1 ? 's' : '');
      };
      q('todos').addEventListener('change', function () { todos = q('todos').checked; alvo.querySelector('.sa-detalhe').hidden = todos; });
      q('busca').addEventListener('input', desenhar);
      q('marcar').addEventListener('click', function () { q('lista').querySelectorAll('input:not(:disabled)').forEach(function (c) { sel[c.value] = true; }); desenhar(); });
      q('limpar').addEventListener('click', function () { sel = {}; gruposSel = {}; alvo.querySelectorAll('[data-grupo]').forEach(function (b) { b.setAttribute('aria-pressed', 'false'); }); desenhar(); });
      alvo.querySelectorAll('[data-grupo]').forEach(function (b) {
        b.addEventListener('click', function () {
          var g = b.dataset.grupo, on = b.getAttribute('aria-pressed') !== 'true';
          b.setAttribute('aria-pressed', String(on));
          if (on) gruposSel[g] = true; else delete gruposSel[g];
          desenhar();
        });
      });
      desenhar();
      return {
        valor: function () {
          if (todos) return 'TOUS';
          var l = Object.keys(gruposSel).map(function (g) { return 'GROUPE: ' + g; });
          Object.keys(sel).forEach(function (e) { var a = ALUNOS.filter(function (x) { return x.email === e; })[0]; if (!a || !gruposSel[a.grupo]) l.push(e); });
          return l;
        }
      };
    }

    // ================= partages: liberar um modelo para alunos, turmas ou todos =================
    function garantirAlunos(cb) {
      if (ALUNOS) { cb(); return; }
      google.script.run.withSuccessHandler(function (l) { ALUNOS = l; cb(); }).listarAlunos(EMAIL);
    }
    function painelPartilha(alvo, item, depois) {
      alvo.innerHTML = '<p class="aviso">Chargement…</p>';
      garantirAlunos(function () {
        alvo.innerHTML = '<div class="bloco partilha"><h4>Partager « ' + esc(item.titre) + ' »</h4>' +
          '<p class="aviso" style="margin-top:0">Choisissez qui peut voir ce modèle. Vous pouvez partager à nouveau plus tard avec d\'autres élèves, au rythme de votre progression.</p>' +
          (item.tipo === 'simulado' ? '<div class="pt-tipos" hidden><input type="checkbox" data-pt-tipo="simulado" checked></div>' :
          '<div class="pt-tipos"><span>Partager comme :</span><label class="check"><input type="checkbox" data-pt-tipo="dictee"' + (item.tipo !== 'modele' ? ' checked' : '') + '> Dictée</label>' +
          '<label class="check"><input type="checkbox" data-pt-tipo="modele"' + (item.tipo !== 'dictee' ? ' checked' : '') + '> Modèle (lecture)</label></div>') +
          '<div data-pt="seletor"></div><button class="ferramenta destaque" type="button" data-pt="ok">Partager</button> <span class="aviso" data-pt="st"></span>' +
          '<h5>Déjà partagé avec</h5><div data-pt="lista"></div></div>';
        var q = function (k) { return alvo.querySelector('[data-pt="' + k + '"]'); };
        var sel = seletorAlunos(q('seletor'));
        var desenhar = function (l) {
          q('lista').innerHTML = l.length ? l.map(function (p) {
            var tl = semAcento(p.tipo) === 'dictee' ? 'Dictée' : semAcento(p.tipo) === 'modele' ? 'Modèle' : semAcento(p.tipo) === 'simulado' ? 'Test' : '';
            return '<div class="pt-item"><span class="pt-tipo">' + tl + '</span><span>' + (String(p.alvo).toUpperCase() === 'TOUS' ? 'Tous les élèves' : esc(p.alvo)) + '</span><small>' + new Date(p.data).toLocaleDateString('fr-CA') + '</small>' +
              '<button class="ferramenta sutil" type="button" data-pt-del="' + esc(p.ref) + '" aria-label="Retirer">✕ Retirer</button></div>';
          }).join('') : '<p class="aviso" style="margin:0">Personne pour le moment : le modèle est verrouillé pour les élèves.</p>';
          q('lista').querySelectorAll('[data-pt-del]').forEach(function (b) {
            b.addEventListener('click', function () {
              google.script.run.withSuccessHandler(function () { google.script.run.withSuccessHandler(function (l2) { desenhar(l2); if (depois) depois(l2); }).listarPartilhas(EMAIL, item.id); }).removerPartilha(EMAIL, b.dataset.ptDel);
            });
          });
        };
        q('ok').addEventListener('click', function () {
          var alunos = sel.valor();
          if (alunos !== 'TOUS' && !alunos.length) { q('st').textContent = 'Choisissez au moins un élève.'; return; }
          var tipos = Array.prototype.slice.call(alvo.querySelectorAll('[data-pt-tipo]:checked')).map(function (c) { return c.dataset.ptTipo; });
          if (!tipos.length) { q('st').textContent = 'Choisissez « Dictée » et/ou « Modèle ».'; return; }
          q('st').textContent = 'Partage…';
          var i2 = 0, ultimo = null;
          var prox = function (l) {
            if (l) ultimo = l;
            if (i2 >= tipos.length) { q('st').textContent = '✓ Partagé'; desenhar(ultimo); if (depois) depois(ultimo); return; }
            google.script.run.withSuccessHandler(prox).withFailureHandler(function (e) { q('st').textContent = '' + (e.message || e); })
              .partilhar(EMAIL, { id: item.id, tipo: tipos[i2++], titre: item.titre, alunos: alunos });
          };
          prox();
        });
        google.script.run.withSuccessHandler(desenhar).listarPartilhas(EMAIL, item.id);
      });
    }

    // ================= atelier dictée =================
    /** modo 'dictee' ou 'modele': lista só o que a professora partilhou (a professora vê tudo e partilha). */
    function paginaPartilhada(modo) {
      if (!B) return;
      var dictee = modo === 'dictee';
      if (!dictee && !temModulo('MODELES')) {
        var pb = [PARTE_ACCUEIL(), { rotulo: 'Modèles écrits' }], tb = $('tela-atelier');
        tb.innerHTML = trilha(pb) + '<div class="bloco vazio-bloco"><div class="cadeado">' + ICO.cadeado + '</div><p>Les modèles écrits ne sont pas encore ouverts pour vous. Votre professeure les ouvrira bientôt.</p></div>';
        ligarTrilha(tb, pb); mostrar('tela-atelier'); return;
      }
      var lista2 = ((B.partilhadas || {})[dictee ? 'dictees' : 'modelos']) || [];
      var partes = [PARTE_ACCUEIL(), { rotulo: dictee ? 'Dictée' : 'Modèles de production écrite' }];
      var html = trilha(partes) + '<h1 class="titulo-pagina">' + (dictee ? 'Dictée' : 'Modèles de production écrite') + '</h1>' +
        '<p class="intro">' + (dictee ? 'Écoutez chaque phrase avec la voix professionnelle et écrivez-la. La correction montre les accents, les mots oubliés et les fautes.' :
          'Les modèles choisis par votre professeure pour vous. Lisez-les, écoutez-les, masquez le texte et réécrivez-les : la correction montre chaque erreur et votre meilleur résultat reste enregistré.') + '</p>';
      if (B.professor && !dictee) html += '<div class="bloco lib-bloco"><h3>Choisir les modèles de chaque élève</h3><div id="pm-prof"></div></div>';
      if (B.professor) html += '<p class="aviso">Chaque ' + (dictee ? 'dictée' : 'modèle') + ' reste verrouillé(e) pour les élèves jusqu\'à ce que vous le partagiez (). Pour proposer un autre modèle de l\'application ' + (dictee ? 'en dictée' : '') + ', ouvrez-le et utilisez « Partager ce modèle ».</p>';
      var grupos = dictee ? ORDEM_TACHES : ETS();
      var algum = false;
      grupos.forEach(function (t) {
        var l = lista2.filter(function (x) { return x.tache === t; });
        if (!l.length) return;
        algum = true;
        html += '<h3 class="grupo-titulo">' + nomeTache(t) + ' · ' + TACHES[t].sous + '</h3><div class="part-grade">' + l.map(function (x) {
          return '<article class="part-card"><div class="part-topo"><span class="part-tache">' + nomeTache(t) + '</span>' + (x.atelier ? '<span class="part-selo">Modèle de la professeure</span>' : '') + '</div>' +
            '<h4>' + esc(x.titre) + '</h4>' + (x.c ? '<p>' + esc(String(x.c).slice(0, 170)) + (String(x.c).length > 170 ? '…' : '') + '</p>' : '') +
            (dictee || B.professor ? '' : '<div class="part-recordes" data-rec="' + esc(x.id) + '"></div>') +
            '<div class="part-acoes"><button class="ferramenta destaque" type="button" data-pa="' + esc(x.id) + '" data-t="' + t + '" data-foco="' + (dictee ? 'dictee' : '') + '">' + (dictee ? 'Commencer la dictée' : 'Lire et écouter') + '</button>' +
            (dictee ? '' : '<button class="ferramenta" type="button" data-pa="' + esc(x.id) + '" data-t="' + t + '" data-foco="ecrit">Réécrire</button>') +
            (B.professor ? '<button class="ferramenta" type="button" data-pa-pt="' + esc(x.id) + '" data-t="' + t + '">Partager</button>' : '') + '</div>' +
            (B.professor ? '<span class="pt-resumo" data-pt-resumo="' + esc(x.id) + '"></span><div class="pt-painel" data-pt-painel="' + esc(x.id) + '" hidden></div>' : '') + '</article>';
        }).join('') + '</div>';
      });
      if (!algum) html += '<div class="bloco vazio-bloco"><div class="cadeado">' + ICO.cadeado + '</div><p>' + (dictee ? 'Aucune dictée partagée pour le moment.' : 'Aucun modèle partagé pour le moment.') + ' Votre professeure les partagera avec vous au fur et à mesure de votre progression.</p></div>';
      var tela = $('tela-atelier');
      tela.innerHTML = html;
      ligarTrilha(tela, partes);
      var resumo = function (id, l) {
        var r = tela.querySelector('[data-pt-resumo="' + id + '"]'); if (!r) return;
        var ps = l.filter(function (p) { return p.id === id && (semAcento(p.tipo) === (dictee ? 'dictee' : 'modele') || p.tipo === 'atelier'); });
        r.textContent = ps.length ? 'Partagé : ' + ps.map(function (p) { return String(p.alvo).toUpperCase() === 'TOUS' ? 'tous' : p.alvo; }).join(' · ') : 'Non partagé';
      };
      if (B.professor) {
        google.script.run.withSuccessHandler(function (l) { lista2.forEach(function (x) { resumo(x.id, l); }); }).listarPartilhas(EMAIL, '');
        tela.querySelectorAll('[data-pa-pt]').forEach(function (b) {
          b.addEventListener('click', function () {
            var x = lista2.filter(function (y) { return y.id === b.dataset.paPt; })[0];
            var p = tela.querySelector('[data-pt-painel="' + x.id + '"]');
            p.hidden = !p.hidden;
            if (!p.hidden) painelPartilha(p, { id: x.id, tipo: modo, titre: x.titre }, function (l) { resumo(x.id, l.map(function (q2) { q2.id = x.id; return q2; })); });
          });
        });
      }
      tela.querySelectorAll('[data-pa]').forEach(function (b) {
        b.addEventListener('click', function () {
          var at = (B.atelier || []).filter(function (y) { return y.id === b.dataset.pa; })[0];
          var origem = { tipo: dictee ? 'dictee-page' : 'modeles-page', foco: b.dataset.foco || null };
          if (at) renderizarModelo(at.tache, at, origem); else abrirModelo(b.dataset.t, b.dataset.pa, origem);
        });
      });
      if (!dictee && B.professor && $('pm-prof')) painelModelos($('pm-prof'), 'TOUS');
      if (!dictee && !B.professor) carregarRecordes(function () {
        tela.querySelectorAll('[data-rec]').forEach(function (el) { el.innerHTML = htmlRecordes(el.dataset.rec, true); });
      });
      mostrar('tela-atelier');
    }
    function abrirDicteePage() { paginaPartilhada('dictee'); }
    function abrirModelesEcrits() { paginaPartilhada('modele'); }
    function abrirAtelier() { paginaPartilhada('modele'); }

    // ================= presença (só a professora vê quem está online) =================
    var presTimer = null, presUltima = 0, presTela = '';
    function sinalizar(tela) {
      if (!B || B.professor) return;
      presTela = tela || presTela;
      var agora = Date.now();
      if (agora - presUltima < 15000 && !tela) return;
      presUltima = agora;
      var det = presTela === 'tela-modele' ? (document.querySelector('#tela-modele .modele-titulo') || {}).textContent || '' : '';
      google.script.run.withSuccessHandler(function (r) {
        // o forfait terminou com o aluno na página: recarrega no modo "renouvellement"
        if (r && r.bloqueado && !B.bloqueadoPagamento) recarregarBloqueado();
      }).withFailureHandler(function () {}).sinalizarPresenca(EMAIL, presTela, det);
    }
    /** Esconde o que a professora não liberou (Journal, Simulados, P.O., P.E., Dictée). */
    function aplicarModulos() {
      var mapa = { 'App.abrirOral()': 'PO', 'App.abrirEcrit()': 'PE', 'App.abrirDictee()': 'DICTEE', 'App.abrirModeles()': 'MODELES', 'App.abrirSimulados()': 'SIMULADOS', 'App.abrirVocab()': 'VOCAB' };
      document.querySelectorAll('#barra-nav button').forEach(function (b) { var m = mapa[b.getAttribute('onclick')]; if (m && !temModulo(m)) b.hidden = true; });
    }
    function recarregarBloqueado() {
      google.script.run.withSuccessHandler(function (banco) {
        B = banco; aplicarPerfil(); B.audios = B.audios || {}; LISTAS = {};
        mostrarAvisosGlobais();
        document.querySelectorAll('#barra-nav button').forEach(function (b) { if (b.id !== 'nav-taches' && !b.classList.contains('sair')) b.hidden = true; });
        $('nav-taches').setAttribute('onclick', 'App.abrirForfait()');
        abrirForfait();
      }).obterBanco(EMAIL);
    }
    function iniciarPresenca() {
      if (!B || B.professor || presTimer) return;
      presTimer = setInterval(function () { if (!document.hidden) sinalizar(); }, 60000);
      sinalizar('tela-accueil');
    }

    var onlineTimer = null;
    function ligarOnline() {
      var alvo = $('online-lista');
      var atualizar = function () {
        if (!$('online-lista')) { clearInterval(onlineTimer); onlineTimer = null; return; }
        google.script.run.withSuccessHandler(function (l) {
          if (!$('online-lista')) return;
          $('online-n').textContent = l.length;
          alvo.innerHTML = l.length ? '<div class="online-grade">' + l.map(function (u) {
            return '<div class="online-item"><i class="pulso"></i><div><b>' + esc(u.n) + '</b><small>' + esc(u.email) + (u.g ? ' · ' + esc(u.g) : '') + '</small>' +
              '<span>' + esc(u.tela) + (u.det ? ' · ' + esc(u.det) : '') + '</span><small>connecté(e) depuis ' + u.min + ' min · signal il y a ' + u.ha + ' s</small></div></div>';
          }).join('') + '</div>' : '<p class="vazio">Personne en ligne pour le moment.</p>';
        }).listarOnline(EMAIL);
      };
      atualizar();
      if (onlineTimer) clearInterval(onlineTimer);
      onlineTimer = setInterval(atualizar, 30000);
    }

    // ================= mes notes =================
    function tabelaNotas(linhas, escrita) {
      if (!linhas.length) return '<p class="vazio">' + (escrita ? 'Aucune production envoyée pour le moment.' : 'Aucune note orale pour le moment.') + '</p>';
      return '<div class="tabela-rolagem"><table class="tabela"><thead><tr><th>Date</th><th>Tâche</th><th>Sujet</th>' + (escrita ? '<th>Mots</th>' : '') +
        '<th>Note</th><th>NCLC</th><th>Commentaire</th><th></th></tr></thead><tbody>' +
        linhas.map(function (r) {
          var nota = r['Note /20'], temNota = nota !== '' && nota !== null && nota !== undefined;
          return '<tr><td>' + new Date(r.Date).toLocaleDateString('fr-CA') + '</td><td>' + esc(String(r['Tâche']).replace('ET', 'T')) + '</td><td>' + esc(r.Sujet) + '</td>' +
            (escrita ? '<td>' + r.Mots + '</td>' : '') +
            '<td>' + (temNota ? '<b>' + nota + '</b>/20' : '<span class="aviso">à corriger</span>') + '</td><td>' + (temNota ? nclc(nota) : '') + '</td><td>' + esc(r.Commentaire || '') + '</td><td>' + (r.ID ? '<a class="ferramenta" href="' + linkCorrecao(r.ID) + '">Voir la correction</a>' : '') + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    function media(linhas) {
      var n = linhas.map(function (r) { return r['Note /20']; }).filter(function (x) { return x !== '' && x !== null && !isNaN(Number(x)); }).map(Number);
      return n.length ? Math.round(10 * n.reduce(function (a, b) { return a + b; }, 0) / n.length) / 10 : null;
    }

    function abrirNotes() {
      if (!B) return;
      mostrar('tela-notes');
      var tela = $('tela-notes');
      tela.innerHTML = '<p class="vazio">Chargement…</p>';
      google.script.run.withSuccessHandler(function (r) {
        var partes = [PARTE_ACCUEIL(), PARTE_ESPACE(), { rotulo: 'Mes notes' }];
        var mPE = media(r.pe), mPO = media(r.po);
        var html = trilha(partes) + '<h1 class="titulo-pagina">Mon espace</h1>' + abasEspace('notes') +
          '<div class="resumo-notas"><div class="bloco"><small>Expression écrite</small><b>' + (mPE !== null ? mPE + '/20' : '-') + '</b><span>' + (mPE !== null ? 'NCLC estimé : ' + nclc(mPE) : 'pas encore de note') + '</span></div>' +
          '<div class="bloco"><small>Expression orale</small><b>' + (mPO !== null ? mPO + '/20' : '-') + '</b><span>' + (mPO !== null ? 'NCLC estimé : ' + nclc(mPO) : 'pas encore de note') + '</span></div></div>' +
          '<div class="bloco"><h3>Mes compétences</h3><div id="notas-comp"><p class="aviso">Chargement…</p></div></div>' +
          '<div class="bloco"><h3>Productions écrites</h3>' + tabelaNotas(r.pe, true) + '</div>' +
          '<div class="bloco"><h3>Productions orales</h3>' + tabelaNotas(r.po, false) + '</div>' +
          '<div class="bloco"><h3>Corrections par l\'IA (entraînement)</h3><div id="notas-ia"><p class="aviso">Chargement…</p></div></div>' +
          '<p class="aviso">L\'estimation NCLC suit la grille du TCF Canada pour les notes sur 20 (ex. : 10-11 = NCLC 7, 12-13 = NCLC 8, 14-15 = NCLC 9).</p>';
        tela.innerHTML = html;
        ligarTrilha(tela, partes);
        ligarAbasEspace(tela);
        google.script.run.withSuccessHandler(function (c) {
          $('notas-comp').innerHTML = '<div class="ficha-duas"><div><h4>Expression écrite</h4>' + barrasCompetencias(c.resumo, 'PE') + '</div><div><h4>Expression orale</h4>' + barrasCompetencias(c.resumo, 'PO') + '</div></div>';
        }).mesCompetencias(EMAIL);
        google.script.run.withSuccessHandler(function (l) {
          $('notas-ia').innerHTML = l.length ? '<div class="tabela-rolagem"><table class="tabela"><thead><tr><th>Date</th><th>Tâche</th><th>Sujet</th><th>Mots</th><th>Note IA</th><th>NCLC</th><th></th></tr></thead><tbody>' +
            l.map(function (x) { return '<tr><td>' + new Date(x.Date).toLocaleDateString('fr-CA') + '</td><td>' + esc(String(x['Tâche']).replace('ET', 'T')) + '</td><td>' + esc(x.Sujet) + '</td><td>' + x.Mots + '</td><td><b>' + x['Note /20'] + '</b>/20</td><td>' + x.NCLC +
              '</td><td><button class="ferramenta" type="button" data-ver-ia="' + x.linha + '">Voir</button></td></tr>'; }).join('') +
            '</tbody></table></div><div id="notas-ia-detalhe"></div>' : '<p class="vazio">Aucune correction par l\'IA pour le moment.</p>';
          $('notas-ia').querySelectorAll('[data-ver-ia]').forEach(function (b) {
            b.addEventListener('click', function () {
              var det = $('notas-ia-detalhe');
              det.innerHTML = '<div class="ia-carregando"><i></i><i></i><i></i><span>Chargement de la correction…</span></div>';
              google.script.run.withSuccessHandler(function (c) {
                det.innerHTML = '<h4 class="ia-reaberta">' + esc(String(c.tache).replace('ET', 'Tâche ')) + ' · ' + esc(c.sujet) + '</h4>' +
                  '<details class="ia-texto-aluno"><summary>Votre texte</summary><div class="prod-texto">' + esc(c.texteEleve || '').replace(/\n/g, '<br>') + '</div></details>' +
                  cartaoCorrecaoIA(c, c.tache);
                ligarDicas(det);
                det.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }).withFailureHandler(function (e) { det.innerHTML = '<div class="alerta">' + esc(e.message || e) + '</div>'; })
                .obterDetalheCorrecaoIA(EMAIL, b.dataset.verIa);
            });
          });
        }).withFailureHandler(function () { $('notas-ia').innerHTML = ''; }).obterCorrecoesIA(EMAIL);
      }).withFailureHandler(function (e) { tela.innerHTML = '<p class="vazio erro">' + esc(e.message || e) + '</p>'; }).obterMesNotes(EMAIL);
    }

    // ================= espace professeur =================
    var ALUNOS = null;
    function abrirProf(aba) {
      if (!B || !B.professor) return;
      aba = aba || 'aovivo';
      mostrar('tela-prof');
      var tela = $('tela-prof');
      var carregar = function (fn) {
        if (ALUNOS) { fn(); return; }
        tela.innerHTML = '<p class="vazio">Chargement…</p>';
        google.script.run.withSuccessHandler(function (l) { ALUNOS = l; fn(); })
          .withFailureHandler(function (e) { tela.innerHTML = '<p class="vazio erro">' + esc(e.message || e) + '</p>'; }).listarAlunos(EMAIL);
      };
      var carregarTudo = function (fn) {
        carregar(function () {
          if (aba !== 'sessoes' && aba !== 'devoirs' && aba !== 'temas' && aba !== 'blog') { fn(); return; }
          if (aba === 'devoirs' || aba === 'temas' || aba === 'blog') { var pd = 6, ud = function () { if (--pd === 0) fn(); }; ORDEM_TACHES.forEach(function (t) { carregarLista(t, ud); }); return; }
          var pendentes = 4;
          var um = function () { if (--pendentes === 0) fn(); };
          if (SUJETS) um(); else google.script.run.withSuccessHandler(function (x) { SUJETS = x; um(); }).obterSujetsEntrainement(EMAIL);
          TS().forEach(function (t) { carregarLista(t, um); });
        });
      };
      carregarTudo(function () {
        var partes = [PARTE_ACCUEIL(), { rotulo: 'Espace professeur' }];
        var opcoes = '<option value="">Tous les élèves</option>' + ALUNOS.map(function (a) { return '<option value="' + esc(a.email) + '">' + esc(a.nome) + (a.doc ? '' : ' (sans document)') + '</option>'; }).join('');
        var html = trilha(partes) + '<h1 class="titulo-pagina">Espace professeur</h1>' +
          '<div class="abas-prof"><button class="chip" type="button" data-aba="aovivo" aria-pressed="' + (aba === 'aovivo') + '">● En direct</button><button class="chip" type="button" data-aba="ecrit" aria-pressed="' + (aba === 'ecrit') + '">Corriger l\'écrit</button>' +
          '<button class="chip" type="button" data-aba="oral" aria-pressed="' + (aba === 'oral') + '">Noter l\'oral</button>' +
          '<button class="chip" type="button" data-aba="sessoes" aria-pressed="' + (aba === 'sessoes') + '">Préparer une épreuve</button>' +
          '<button class="chip" type="button" data-aba="devoirs" aria-pressed="' + (aba === 'devoirs') + '">Devoirs</button>' +
          '<button class="chip" type="button" data-aba="suivi" aria-pressed="' + (aba === 'suivi') + '">Suivi des élèves</button>' +
          '<button class="chip" type="button" data-aba="temas" aria-pressed="' + (aba === 'temas') + '">Thèmes du mois</button>' +
          '<button class="chip" type="button" data-aba="blog" aria-pressed="' + (aba === 'blog') + '">Blog (À la une)</button>' +
          '<button class="chip" type="button" data-aba="geracao" aria-pressed="' + (aba === 'geracao') + '">Modèles de tous les sujets</button>' +
          '<button class="chip" type="button" data-aba="avis" aria-pressed="' + (aba === 'avis') + '">Avis aux élèves</button>' +
          '<button class="chip" type="button" data-aba="quadro" aria-pressed="' + (aba === 'quadro') + '">Thèmes P.O. / P.E.</button>' +
          '<button class="chip" type="button" data-aba="vocab" aria-pressed="' + (aba === 'vocab') + '">Vocabulaire</button>' +
          '<button class="chip" type="button" data-aba="online" aria-pressed="' + (aba === 'online') + '">En ligne</button>' + '</div>' + htmlAtalhosEquipe() + '<div class="abas-prof" hidden>' +
          '</div>';
        if (aba === 'aovivo') {
          html += '<div id="aovivo"><p class="vazio">Chargement…</p></div>';
        } else if (aba === 'devoirs') {
          html += '<div class="bloco"><h3>Nouveau devoir</h3><p class="aviso" style="margin-top:0">Proposez un modèle précis : l\'élève le verra dans « Mes devoirs » sur sa page d\'accueil, et vous saurez qui l\'a fait.</p>' +
            '<div class="form-oral"><label>Tâche<select id="dv-tache">' + ORDEM_TACHES.map(function (t) { return '<option value="' + t + '">' + nomeTache(t) + ' · ' + TACHES[t].sous + '</option>'; }).join('') + '</select></label>' +
            '<label>Activité<select id="dv-tipo"><option value="dictee">Dictée</option><option value="etude">Étudier le modèle</option><option value="oral">S\'entraîner à l\'oral</option><option value="ecrit">Réécrire et faire corriger</option></select></label></div>' +
            '<div class="ss-linha" style="margin:10px 0"><input type="search" id="dv-busca" placeholder="Filtrer les modèles…"><select id="dv-modelo"></select></div>' +
            '<label class="largo campo">Message pour l\'élève (facultatif)<input id="dv-msg" placeholder="Ex. : Refaites la dictée jusqu\'à 90 % de réussite."></label>' +
            '<div class="ss-tache"><b>Élèves</b><div id="dv-seletor"></div></div>' +
            '<button class="botao-principal" type="button" id="dv-criar" style="width:auto;padding:12px 28px">Publier le devoir</button> <span class="aviso" id="dv-msg-st"></span></div>' +
            '<div class="bloco"><h3>Devoirs publiés</h3><div id="dv-lista"></div></div>';
        } else if (aba === 'finances') {
          html += '<div id="fin"><p class="vazio">Chargement des finances…</p></div>';
        } else if (aba === 'vitesse') {
          html += '<div class="bloco"><h3>Diagnostic de vitesse</h3><p class="aviso" style="margin-top:0">Mesure le temps de chaque étape du serveur pour trouver ce qui rend les clics lents. Rien n\'est modifié. Durée : environ 30 secondes. Envoyez une capture de l\'écran du résultat.</p>' +
            '<button class="botao-principal" type="button" id="vl-go" style="width:auto;padding:12px 26px">▶ Lancer le diagnostic</button><div id="vl-res"></div></div>';
        } else if (aba === 'online') {
          html += '<div class="bloco"><h3>Élèves en ligne : <span id="online-n">…</span></h3><p class="aviso" style="margin-top:0">Mis à jour toutes les 30 secondes. Les élèves ne voient pas qui est connecté, et votre présence n\'apparaît nulle part.</p><div id="online-lista"></div></div>';
        } else if (aba === 'quadro') {
          html += '<div class="bloco"><h3>Tous les thèmes</h3><p class="aviso" style="margin-top:0">Seuls les thèmes <b>cochés</b> sont disponibles pour les élèves, et uniquement si l\'axe du thème est ouvert pour l\'élève. ' +
            'Les devoirs, les thèmes du mois et les modèles partagés individuellement restent des exceptions.</p>' +
            '<div class="qt-filtros"><div class="ch-taches">' + ORDEM_TACHES.map(function (t) { return '<button type="button" class="chip" data-qt-t="' + t + '" aria-pressed="' + (t === 'T2') + '">' + nomeTache(t) + '</button>'; }).join('') + '</div>' +
            '<div class="ss-linha"><input type="search" id="qt-busca" placeholder="Rechercher…"><select id="qt-eixo"><option value="">Tous les axes</option>' + B.ordemEixos.map(function (k) { return '<option value="' + k + '">' + esc(eixo(k).nome) + '</option>'; }).join('') + '</select>' +
            '<select id="qt-estado"><option value="">Tous</option><option value="1">Cochés</option><option value="0">Non cochés</option></select></div>' +
            '<div class="ferramentas"><button class="ferramenta" type="button" id="qt-marcar">Cocher la sélection affichée</button><button class="ferramenta" type="button" id="qt-desmarcar">Décocher la sélection affichée</button><span class="aviso" id="qt-st"></span></div></div>' +
            '<div id="qt-lista"><p class="vazio">Chargement…</p></div></div>';
        } else if (aba === 'testes') {
          html += '<div class="bloco"><h3>Tests TCF : compréhension orale et écrite</h3><p class="aviso" style="margin-top:0">40 tests de compréhension orale (35 min) et 40 de compréhension écrite (60 min), 39 questions de A1 à C2. ' +
            'Chaque test n\'apparaît chez l\'élève qu\'après votre partage (). Le « Test 0 » est une démonstration courte.</p>' +
            '<p class="aviso"><b>Vos propres épreuves :</b> collez-les dans l\'onglet « Mes tests TCF » de la feuille (une ligne par question : test, CO/CE, n°, document ou lien audio/image du Drive, question, A-D, bonne réponse, explication). Elles remplacent automatiquement celles de l\'IA.</p><div id="tt-prof"><p class="vazio">Chargement…</p></div></div>';
        } else if (aba === 'vocab') {
          html += '<div class="bloco"><h3>Ajouter un mot</h3><p class="aviso" style="margin-top:0">Choisissez un thème de la liste ou écrivez un nouveau thème : il apparaîtra pour les élèves dans « Autres thèmes ».</p><div class="form-oral"><label>Thème<input id="vp-deck" list="vp-decks" value="Mots de la semaine"><datalist id="vp-decks"><option>Mots de la semaine</option><option>Connecteurs logiques</option><option>Expressions de l\'argumentation</option><option>Adverbes et locutions</option><option>Formules de la méthode</option><option>Adaptation et interculturalité</option><option>Ville et commerces</option><option>Tâches ménagères</option><option>Famille</option><option>Relations</option><option>Alimentation</option><option>Boissons</option><option>Politique</option><option>Loisirs et sport</option><option>Marché du travail</option><option>Verbes du 1er groupe</option><option>Verbes du 2e groupe</option><option>Verbes du 3e groupe</option><option>Prépositions</option></datalist></label>' +
            '<label class="largo">Mot ou expression<input id="vp-mot"></label><label class="largo">Traduction<input id="vp-trad"></label></div><label class="largo campo">Exemple<input id="vp-ex"></label><label class="largo campo">Pour vous en souvenir (astuce, facultatif)<input id="vp-dica" placeholder="Ex. : Vem do latim… / ♥ Favorito da professora"></label>' +
            '<button class="ferramenta destaque" type="button" id="vp-add">+ Ajouter</button> <span class="aviso" id="vp-st"></span><p class="aviso">Vous pouvez aussi modifier les cartes dans l\'onglet « Vocabulaire » de la feuille.</p></div><div class="bloco"><h3>Cartes</h3><div id="vp-lista"></div></div>';
        } else if (aba === 'avis') {
          html += '<div class="bloco"><h3>Nouvel avis</h3><p class="aviso" style="margin-top:0">L\'avis s\'affiche au milieu de l\'écran de l\'élève à sa prochaine connexion, jusqu\'à ce qu\'il touche « J\'ai compris ».</p>' +
            '<label class="largo campo">Titre<input id="av-titre" placeholder="Ex. : Cours du lundi déplacé"></label>' +
            '<label class="largo campo">Message<textarea id="av-msg" rows="4" class="campo-msg"></textarea></label><div class="ss-tache"><b>Élèves</b><div id="av-seletor"></div></div>' +
            '<button class="botao-principal" type="button" id="av-enviar" style="width:auto;padding:12px 26px">Publier l\'avis</button> <span class="aviso" id="av-st"></span></div>' +
            '<div class="bloco"><h3>Avis publiés</h3><div id="av-lista"></div></div>';
        } else if (aba === 'geracao') {
          html += '<div class="bloco"><h3>Un modèle pour chaque sujet</h3><p class="aviso" style="margin-top:0">Chaque sujet (oral et écrit, T1, T2, T3) reçoit un modèle rédigé selon la méthode Français na Mira : ' +
            'trame complète, formules d\'ouverture et de clôture, connecteurs, contexte, limite de mots. Les sujets qui tombent le plus sont traités en premier. La génération tourne en arrière-plan : vous pouvez fermer l\'application.</p><div id="gm-conteudo"><p class="vazio">Chargement…</p></div></div>';
        } else if (aba === 'aconf') {
          html += '<div class="bloco"><h3>Paiements à confirmer</h3><p class="aviso" style="margin-top:0">Forfaits choisis par les élèves (paiement déclaré). En confirmant : le forfait est marqué payé, les cours sont planifiés selon les horaires et le reçu part par e-mail.</p><div id="pg-pend"></div></div>' +
            '<div class="bloco"><h3>Cours à confirmer</h3><p class="aviso" style="margin-top:0">Les cours d\'aujourd\'hui et les cours passés encore « prévus ». Ils sont déjà décomptés du forfait ; confirmez ce qui s\'est réellement passé. ' +
            'Pour une absence justifiée ou un cours annulé par vous, indiquez la date de reposition s\'il y en a une : le cours est ajouté au planning.</p><div id="ac-lista"></div></div>';
        } else if (aba === 'suivi') {
          html += '<div id="suivi-conteudo"><p class="vazio">Chargement…</p></div>';
        } else if (aba === 'blog') {
          html += '<div class="bloco"><h3>Article pour la page d\'accueil</h3><p class="aviso" style="margin-top:0">Vous choisissez ce qui s\'affiche dans « À la une ». Sans article, la page d\'accueil montre automatiquement les sujets les plus fréquents. ' +
            'Image : collez le lien d\'une photo (Google Drive partagé « tous les utilisateurs disposant du lien », ou toute image https). Sans image, une illustration Français na Mira est utilisée.</p>' +
            '<input type="hidden" id="bl-ref"><div class="form-oral"><label class="largo">Titre<input id="bl-titre" placeholder="Ex. : Le sujet qui tombe le plus ce mois-ci"></label>' +
            '<label>Ordre<input id="bl-ordem" type="number" min="1" value="1" style="width:80px"></label></div>' +
            '<label class="largo campo">Texte (chapeau)<textarea id="bl-texto" rows="3" class="campo-msg"></textarea></label>' +
            '<label class="largo campo">Image (lien)<input id="bl-img" placeholder="https://drive.google.com/file/d/…"></label>' +
            '<div class="form-oral"><label>Lien vers un sujet (facultatif)<select id="bl-tache"><option value="">Aucun</option>' + ORDEM_TACHES.map(function (t) { return '<option value="' + t + '">' + nomeTache(t) + '</option>'; }).join('') + '</select></label>' +
            '<label class="largo">Sujet<input type="search" id="bl-busca" placeholder="Filtrer…"><select id="bl-sujet"></select></label></div>' +
            '<label class="check"><input type="checkbox" id="bl-vis" checked> Visible</label> ' +
            '<button class="ferramenta destaque" type="button" id="bl-salvar">Publier</button> <button class="ferramenta" type="button" id="bl-novo">Nouvel article</button> <span class="aviso" id="bl-st"></span>' +
            '<div id="bl-previa" class="bl-previa"></div></div><div class="bloco"><h3>Articles</h3><div id="bl-lista"></div></div>';
        } else if (aba === 'temas') {
          html += '<div class="bloco"><h3>Thèmes du mois</h3><p class="aviso" style="margin-top:0">Ces sujets apparaissent en vedette sur la page d\'accueil de tous les élèves ce mois-ci et sont ouverts à tous, même si l\'axe est verrouillé.</p>' +
            '<div class="form-oral"><label>Tâche<select id="tm-tache">' + ORDEM_TACHES.map(function (t) { return '<option value="' + t + '">' + nomeTache(t) + ' · ' + TACHES[t].sous + '</option>'; }).join('') + '</select></label></div>' +
            '<div class="ss-linha" style="margin:10px 0"><input type="search" id="tm-busca" placeholder="Filtrer les sujets…"><select id="tm-sujet"></select><button class="ferramenta destaque" type="button" id="tm-add">+ Ajouter</button></div>' +
            '<button class="ferramenta" type="button" id="tm-sugerir">Suggérer les sujets les plus fréquents</button><div id="tm-sugestoes"></div></div>' +
            '<div class="bloco"><h3>Sélection du mois</h3><div id="tm-lista"></div></div>';
        } else if (aba === 'eleves') {
          html += '<div class="bloco"><h3>Élèves, groupes et axes thématiques</h3><p class="aviso" style="margin-top:0">Ces réglages modifient directement la feuille « Acesso ». Un axe décoché cache les modèles de cet axe pour l\'élève (les sujets restent visibles, verrouillés).</p>' +
            '<div class="sa-barra"><input type="search" id="el-busca" placeholder="Rechercher un élève…"><select id="el-grupo"><option value="">Tous les groupes</option></select></div>' +
            '<div id="el-lista" class="el-lista"></div></div>' +
            '<div class="bloco"><h3>Clés des axes</h3><p class="aviso" style="margin-top:0">Donnez une clé à l\'élève : il débloque lui-même l\'axe correspondant. Les clés se trouvent aussi dans l\'onglet « Configuration » de la feuille.</p><div id="el-chaves" class="el-chaves"></div></div>';
        } else if (aba === 'sessoes') {
          html += '<div class="bloco"><h3>Nouvelle épreuve pour vos élèves</h3>' +
            '<p class="aviso" style="margin-top:0">Choisissez les tâches écrites et/ou orales : pour chacune, sélectionnez le sujet vous-même ou tirez-le au sort. Laissez « aucune » pour ne pas l\'inclure. ' +
            'Tous les élèves choisis recevront les mêmes sujets ; chacun commence quand il veut. Les productions sont envoyées automatiquement.</p>' +
            '<label class="largo campo">Nom de l\'épreuve<input id="ss-nome" placeholder="Ex. : Simulation du 12 octobre"></label>' +
            '<h4 class="ss-secao">Expression écrite (60 minutes)</h4>' +
            ETS().concat(TS()).map(function (t) {
              return (t === 'T1' ? '<h4 class="ss-secao">Expression orale (enregistrement)</h4>' : '') +
                '<div class="ss-tache"><b>' + (t.indexOf('ET') === 0 ? 'Écrit' : 'Oral') + ' · Tâche ' + t.slice(-1) + ' · ' + TACHES[t].sous + '</b>' +
                '<div class="ss-linha"><input type="search" class="ss-busca" data-busca="' + t + '" placeholder="Filtrer les sujets…">' +
                '<select data-ss="' + t + '"></select><button class="ferramenta" type="button" data-ss-sortear="' + t + '">Au hasard</button></div>' +
                '<p class="aviso ss-previa" data-ss-previa="' + t + '"></p></div>';
            }).join('') +
            '<div class="ss-tache"><b>Élèves</b><div id="ss-seletor"></div></div>' +
            '<button class="botao-principal" type="button" id="ss-criar" style="width:auto;padding:12px 28px">Publier l\'épreuve</button> <span class="aviso" id="ss-msg"></span></div>' +
            '<div class="bloco"><h3>Épreuves publiées</h3><div id="ss-lista"></div></div>';
        } else if (aba === 'ecrit') {
          html += '<div class="bloco prof-filtros"><label>Élève<select id="pf-aluno">' + opcoes + '</select></label>' +
            '<label class="check"><input type="checkbox" id="pf-pend" checked> Seulement les textes à corriger</label></div><div id="pf-lista"></div>';
        } else {
          html += '<div class="bloco"><h3>Enregistrements à écouter</h3><div class="prof-filtros"><label>Élève<select id="pg-aluno">' + opcoes + '</select></label>' +
            '<label class="check"><input type="checkbox" id="pg-pend" checked> Seulement les enregistrements à noter</label></div><div id="pg-lista"></div></div>' +
            '<div class="bloco"><h3>Nouvelle note d\'expression orale (sans enregistrement)</h3><div class="form-oral">' +
            '<label>Élève<select id="po-aluno">' + opcoes.replace('Tous les élèves', 'Choisir…') + '</select></label>' +
            '<label>Tâche<select id="po-tache"><option value="T1">Tâche 1 · Entretien dirigé</option><option value="T2">Tâche 2 · Interaction</option><option value="T3">Tâche 3 · Point de vue</option></select></label>' +
            '<label class="largo">Sujet<input id="po-sujet" list="po-sujets" placeholder="Choisissez ou écrivez le sujet"><datalist id="po-sujets"></datalist></label>' +
            '<label>Note /20<input id="po-nota" type="number" min="0" max="20" step="0.5"></label>' +
            '<label class="largo">Commentaire<textarea id="po-com" rows="3" placeholder="Points forts, points à améliorer…"></textarea></label></div>' +
            '<button class="botao-principal" type="button" id="po-salvar" style="width:auto;padding:12px 28px">Enregistrer la note</button> <span class="aviso" id="po-msg"></span></div>' +
            '<div class="bloco"><h3>Dernières notes orales</h3><div id="po-lista"></div></div>';
        }
        tela.innerHTML = html;
        ligarTrilha(tela, partes);
        tela.querySelectorAll('[data-aba]').forEach(function (b) { b.addEventListener('click', function () { abrirProf(b.dataset.aba); }); });
        organizarProf(tela, aba);
        if (aba === 'aovivo') ligarAoVivo(); else if (aba === 'ecrit') ligarProfEscrita(); else if (aba === 'oral') ligarProfOral(); else if (aba === 'devoirs') ligarProfDevoirs(); else if (aba === 'eleves') ligarProfEleves();
        else if (aba === 'suivi') ligarSuivi(); else if (aba === 'online') ligarOnline(); else if (aba === 'temas') ligarTemasMes(); else if (aba === 'blog') ligarBlogProf(); else if (aba === 'aconf') ligarAConfirmar(); else if (aba === 'geracao') ligarGeracao(); else if (aba === 'avis') ligarAvisProf(); else if (aba === 'testes') ligarTestesProf(); else if (aba === 'quadro') ligarQuadroTemas(); else if (aba === 'vocab') ligarVocabProf(); else if (aba === 'vitesse') ligarVitesse(); else if (aba === 'finances') ligarFinances(); else ligarProfSessoes();
      });
    }

    var CRITERES = {
      PE: ['Réalisation de la tâche', 'Cohérence', 'Cohésion', 'Lexique', 'Grammaire', 'Orthographe'],
      PO: ['Réalisation de la tâche', 'Cohérence', 'Lexique', 'Grammaire', 'Prononciation', 'Fluidité et interaction']
    };
    function totalComp(notas) { var s2 = notas.reduce(function (a, n) { return a + n; }, 0); return Math.round(s2 / (notas.length * 10) * 20 * 2) / 2; }
    /** Notas por competência (0 a 5, meio ponto) com total /20 e NCLC ao vivo. */
    function htmlCompetencias(ep, valores) {
      return '<div class="comp" data-ep="' + ep + '"><div class="comp-grade">' + CRITERES[ep].map(function (c, i) {
        var v = valores && valores[i] !== undefined && valores[i] !== '' ? valores[i] : 5;
        return '<div class="comp-cel"><div class="comp-topo"><span>' + c + '</span><b data-v>' + v + '</b></div>' +
          '<input type="range" min="0" max="10" step="0.5" value="' + v + '" data-c="' + i + '" aria-label="' + c + ' sur 10"></div>';
      }).join('') + '</div><div class="comp-total"><span>Note finale</span><b data-total>-</b><small>/20 · NCLC <b data-nclc>-</b></small></div></div>';
    }
    function ligarCompetencias(raiz) {
      var comp = raiz.querySelector('.comp'); if (!comp) return null;
      var ler = function () { return Array.prototype.slice.call(comp.querySelectorAll('input[type=range]')).map(function (x) { return Number(x.value); }); };
      var atualizar = function () {
        comp.querySelectorAll('input[type=range]').forEach(function (x) {
          x.closest('.comp-cel').querySelector('[data-v]').textContent = x.value;
          x.style.setProperty('--p', (x.value / 10 * 100) + '%');
        });
        var t = totalComp(ler());
        comp.querySelector('[data-total]').textContent = t;
        comp.querySelector('[data-nclc]').textContent = nclc(t);
      };
      comp.querySelectorAll('input[type=range]').forEach(function (x) { x.addEventListener('input', atualizar); });
      atualizar();
      return { notas: ler, ep: comp.dataset.ep };
    }

    var PREFILL_DEVOIR = null;
    function ligarProfDevoirs() {
      var seletor = seletorAlunos($('dv-seletor'));
      var preencher = function () {
        var t = $('dv-tache').value, q = semAcento($('dv-busca').value);
        var l = listaNav(t).filter(function (x) { return !q || semAcento(x.titre + ' ' + (x.resumo || '')).indexOf(q) !== -1; }).slice(0, 500);
        $('dv-modelo').innerHTML = l.map(function (x) {
          return '<option value="' + esc(x.id) + '">' + (x.tipo === 'manuel' ? '' : x.tipo === 'ia' ? '' : '') + eixo(x.e).icone + ' ' + esc(String(x.titre).slice(0, 110)) + '</option>';
        }).join('');
      };
      $('dv-tache').addEventListener('change', preencher);
      $('dv-busca').addEventListener('input', preencher);
      if (PREFILL_DEVOIR) { $('dv-tache').value = PREFILL_DEVOIR.tache; preencher(); $('dv-modelo').value = PREFILL_DEVOIR.id; PREFILL_DEVOIR = null; } else preencher();
      var listar = function () {
        google.script.run.withSuccessHandler(function (l) {
          $('dv-lista').innerHTML = l.length ? l.map(function (d) {
            var ativo = String(d.Active).toUpperCase() === 'SIM';
            return '<div class="sessao-prof' + (ativo ? '' : ' inativa') + '"><div><b>' + esc(d.Titre) + '</b> <span class="etiqueta">' + esc(d.tipoNome) + '</span> <span class="etiqueta">' + esc(String(d['Tâche']).replace('ET', 'Écrit T').replace(/^T/, 'Oral T')) + '</span>' +
              '<div class="dv-progresso"><i style="width:' + (d.alvo ? Math.round(100 * d.feitos.length / d.alvo) : 0) + '%"></i></div>' +
              '<small>' + d.feitos.length + ' / ' + d.alvo + ' élève' + (d.alvo > 1 ? 's' : '') + ' ont terminé' + (d.Message ? ' · « ' + esc(d.Message) + ' »' : '') + '</small>' +
              (d.faltam.length ? '<details><summary>Qui n\'a pas encore fait ce devoir ? (' + d.faltam.length + ')</summary><small>' + d.faltam.map(esc).join(', ') + '</small></details>' : '') + '</div>' +
              '<div class="acoes-linha"><button class="ferramenta" type="button" data-dv-alt="' + esc(d.ID) + '" data-ativo="' + (ativo ? '0' : '1') + '">' + (ativo ? 'Désactiver' : 'Réactiver') + '</button>' +
              '<button class="ferramenta perigo" type="button" data-dv-del="' + esc(d.ID) + '">Supprimer</button></div></div>';
          }).join('') : '<p class="vazio">Aucun devoir publié.</p>';
          $('dv-lista').querySelectorAll('[data-dv-alt]').forEach(function (b) {
            b.addEventListener('click', function () { google.script.run.withSuccessHandler(listar).alternarDevoir(EMAIL, b.dataset.dvAlt, b.dataset.ativo === '1'); });
          });
          $('dv-lista').querySelectorAll('[data-dv-del]').forEach(function (b) {
            b.addEventListener('click', function () {
              if (!confirm('Supprimer définitivement ce devoir ? Il disparaîtra aussi chez les élèves.')) return;
              b.disabled = true;
              google.script.run.withSuccessHandler(listar).apagarDevoir(EMAIL, b.dataset.dvDel);
            });
          });
        }).listarDevoirsProf(EMAIL);
      };
      $('dv-criar').addEventListener('click', function () {
        var msg = $('dv-msg-st');
        var dados = { tache: $('dv-tache').value, modelo: $('dv-modelo').value, tipo: $('dv-tipo').value, mensagem: $('dv-msg').value, alunos: seletor.valor() };
        if (!dados.modelo) { msg.textContent = 'Choisissez un modèle.'; return; }
        if (dados.alunos !== 'TOUS' && !dados.alunos.length) { msg.textContent = 'Choisissez au moins un élève.'; return; }
        msg.textContent = 'Publication…';
        google.script.run.withSuccessHandler(function () { msg.textContent = '✓ Devoir publié.'; $('dv-msg').value = ''; listar(); })
          .withFailureHandler(function (e) { msg.textContent = '' + (e.message || e); }).criarDevoir(EMAIL, dados);
      });
      listar();
    }

    function barrasCompetencias(res, ep) {
      var r = res[ep];
      if (!r || !r.n) return '<p class="aviso" style="margin:0">Pas encore d\'évaluation.</p>';
      return '<div class="barras-comp">' + r.criterios.map(function (c) {
        var v = c.media === null ? 0 : c.media;
        return '<div class="bc-linha"><span>' + esc(c.nome) + '</span><div class="bc-barra"><i style="width:' + Math.min(100, v / 10 * 100) + '%"></i></div><b>' + (c.media === null ? '-' : c.media) + '<small>/10</small></b></div>';
      }).join('') + '</div><p class="bc-total">Moyenne : <b>' + r.total + '/20</b> · NCLC ' + nclc(r.total) + ' · ' + r.n + ' évaluation' + (r.n > 1 ? 's' : '') + '</p>';
    }

    function ligarSuivi() {
      var alvo = $('suivi-conteudo');
      google.script.run.withSuccessHandler(function (l) {
        var grupos = [];
        l.forEach(function (a) { if (a.grupo && grupos.indexOf(a.grupo) === -1) grupos.push(a.grupo); });
        alvo.innerHTML = '<div class="bloco"><div class="sa-barra"><input type="search" id="sv-busca" placeholder="Rechercher un élève…"><select id="sv-grupo"><option value="">Tous les groupes</option>' +
          grupos.sort().map(function (g) { return '<option>' + esc(g) + '</option>'; }).join('') + '</select></div>' +
          '<div class="tabela-rolagem"><table class="tabela suivi-tab"><thead><tr><th>Élève</th><th>Groupe</th><th>Forfait</th><th>Accès</th><th>À corriger</th><th>Messages</th><th>Moy. écrit</th><th>Moy. oral</th><th></th></tr></thead><tbody id="sv-corpo"></tbody></table></div></div>' +
          '<div class="bloco"><h3>Clés des axes</h3><p class="aviso" style="margin-top:0">Une clé ouvre un axe pour les 6 tâches. Pour un réglage plus fin (ex. : seulement « Famille » en T1), ouvrez la fiche de l\'élève.</p><div id="el-chaves" class="el-chaves"></div></div>';
        var desenhar = function () {
          var q = semAcento($('sv-busca').value), g = $('sv-grupo').value;
          $('sv-corpo').innerHTML = l.filter(function (a) { return (!g || a.grupo === g) && (!q || semAcento(a.nome + ' ' + a.email).indexOf(q) !== -1); }).map(function (a) {
            var eab = ETATS_ABO[a.abonnement] || ETATS_ABO.sans;
            return '<tr' + (a.ativo ? '' : ' class="inativo"') + '><td><b>' + esc(a.nome) + '</b><br><small>' + esc(a.email) + '</small></td><td>' + esc(a.grupo || '-') + '</td>' +
              '<td><em class="jr-mini ' + eab[1] + '">' + ({ valide: 'en cours', dernier: 'dernier cours', termine: 'à renouveler', bloque: 'suspendu', sans: '-' })[a.abonnement || 'sans'] + '</em>' +
                (a.abonnement && a.abonnement !== 'sans' ? '<br><small>' + Math.max(0, a.restantes || 0) + ' cours restants' + (a.aConfirmar ? ' · ' + a.aConfirmar + ' à confirmer' : '') + '</small>' : '') + '</td>' +
              '<td><div class="mini-barra"><i style="width:' + Math.round(100 * a.liberados / a.total) + '%"></i></div><small>' + a.liberados + ' / ' + a.total + '</small></td>' +
              '<td>' + (a.aCorrigir ? '<span class="selo-nav">' + a.aCorrigir + '</span>' : '-') + '</td><td>' + (a.mensagens ? a.mensagens + ' en attente' : '-') + '</td>' +
              '<td>' + (a.mediaPE !== null ? a.mediaPE + '/20' : '-') + '</td><td>' + (a.mediaPO !== null ? a.mediaPO + '/20' : '-') + '</td>' +
              '<td><button class="ferramenta destaque" type="button" data-ficha="' + esc(a.email) + '">Ouvrir la fiche</button></td></tr>';
          }).join('') || '<tr><td colspan="9" class="vazio">Aucun élève.</td></tr>';
          $('sv-corpo').querySelectorAll('[data-ficha]').forEach(function (b) { b.addEventListener('click', function () { abrirFicha(b.dataset.ficha); }); });
        };
        $('sv-busca').addEventListener('input', desenhar);
        $('sv-grupo').addEventListener('change', desenhar);
        desenhar();
        google.script.run.withSuccessHandler(function (ch) {
          $('el-chaves').innerHTML = B.ordemEixos.map(function (k) { return '<div><span>' + eixo(k).icone + ' ' + esc(eixo(k).nome) + '</span><code>' + esc(ch[k] || '-') + '</code></div>'; }).join('');
        }).listarChavesEixos(EMAIL);
      }).withFailureHandler(function (e) { alvo.innerHTML = '<p class="vazio erro">' + esc(e.message || e) + '</p>'; }).listarSuivi(EMAIL);
    }

    function abrirFicha(alunoEmail) {
      var alvo = $('suivi-conteudo');
      alvo.innerHTML = '<p class="vazio">Chargement de la fiche…</p>';
      google.script.run.withSuccessHandler(function (f) {
        var a = f.aluno, acesso = f.acesso;
        var html = '<button class="voltar" type="button" id="fi-voltar">← Tous les élèves</button>' +
          '<div class="bloco ficha-cab"><div><h2>' + esc(a.nome) + '</h2><small>' + esc(a.email) + (a.doc ? ' · document associé' : '') + '</small></div>' +
          '<div class="ficha-ctrl"><label>Groupe<input id="fi-grupo" value="' + esc(a.grupo || '') + '"></label>' +
          '<label class="interruptor"><input type="checkbox" id="fi-ativo"' + (a.ativo ? ' checked' : '') + '><span></span>Accès actif</label>' +
          '<label class="interruptor"><input type="checkbox" id="fi-prod"' + (a.producao ? ' checked' : '') + '><span></span>Envoi des productions</label>' +
          '<div class="fi-mods"><span>Parties ouvertes :</span>' + [['JOURNAL', 'Journal'], ['SIMULADOS', 'Simulados'], ['PO', 'P.O.'], ['PE', 'P.E.'], ['MODELES', 'Modèles écrits'], ['DICTEE', 'Dictée'], ['VOCAB', 'Vocabulaire']].map(function (m) {
            var on = (a.modulos || []).indexOf(m[0]) !== -1;
            return '<button type="button" class="fi-mod' + (on ? ' on' : '') + '" data-mod="' + m[0] + '" aria-pressed="' + on + '">' + m[1] + '</button>';
          }).join('') + '</div>' +
          '<button class="ferramenta" type="button" id="fi-ver-journal">Voir l\'avancement du journal</button>' +
          '<label>Épreuves max<input id="fi-max" type="number" min="0" value="' + (a.max === null || a.max === undefined ? '' : a.max) + '" placeholder="∞"></label>' +
          '<span class="aviso" id="fi-st"></span></div></div>';
        // acesso: quadro tâche × eixo
        html += '<div class="bloco"><h3>Modèles accessibles</h3><p class="aviso" style="margin-top:0">Cochez ce que cet élève peut consulter. Touchez un titre de colonne ou de ligne pour tout cocher. Les devoirs et les thèmes du mois restent toujours ouverts.</p>' +
          '<div class="tabela-rolagem"><table class="matriz"><thead><tr><th></th>' + ORDEM_TACHES.map(function (t) {
            return '<th><button type="button" data-col="' + t + '">' + (t.indexOf('ET') === 0 ? 'Écrit' : 'Oral') + '<br>' + TACHES[t].nom.replace('Tâche ', 'T') + '</button></th>';
          }).join('') + '</tr></thead><tbody>' + B.ordemEixos.map(function (k) {
            return '<tr><th><button type="button" data-lin="' + k + '">' + eixo(k).icone + ' ' + esc(eixo(k).nome) + '</button></th>' + ORDEM_TACHES.map(function (t) {
              return '<td><input type="checkbox" data-t="' + t + '" data-k="' + k + '"' + ((acesso[t] || []).indexOf(k) !== -1 ? ' checked' : '') + ' aria-label="' + esc(eixo(k).nome) + ' ' + t + '"></td>';
            }).join('') + '</tr>';
          }).join('') + '</tbody></table></div>' +
          '<div class="ferramentas" style="margin-top:10px"><button class="ferramenta" type="button" id="fi-tudo">Tout ouvrir</button><button class="ferramenta" type="button" id="fi-nada">Tout fermer</button>' +
          '<button class="ferramenta destaque" type="button" id="fi-salvar-acesso">Enregistrer l\'accès</button>' +
          (a.grupo ? '<button class="ferramenta" type="button" id="fi-copiar">Appliquer au groupe « ' + esc(a.grupo) + ' »</button>' : '') + '<span class="aviso" id="fi-acesso-st"></span></div></div>';
        html += '<div class="bloco"><h3>Introduction personnelle</h3><p class="aviso" style="margin-top:0">Collez le lien du document d\'introduction de cet élève (Google Docs, PDF du Drive…). Il apparaîtra pour lui dans le menu « Introduction ». Pensez à partager le document avec l\'élève.</p>' +
          '<div class="intro-campo"><input type="url" id="fi-intro" placeholder="https://docs.google.com/document/d/…" value="' + esc(a.intro || '') + '"><button class="ferramenta destaque" type="button" id="fi-intro-salvar">Enregistrer</button>' +
          (a.intro ? '<a class="ferramenta" href="' + esc(a.intro) + '" target="_blank" rel="noopener">Ouvrir ↗</a>' : '') + '</div><p class="aviso" id="fi-intro-st"></p></div>';
        html += '<div class="bloco"><h3>Modèles écrits de cet élève</h3><div id="fi-mod-esc"></div></div>';
        html += '<div class="bloco"><h3>Épreuves de compréhension ouvertes pour cet élève</h3><div id="fi-lib"></div></div>';
        html += '<div class="bloco"><h3>Journal de classe : programme, annotations et simulados</h3><div id="fi-programa"></div></div>';
        html += '<div class="bloco"><h3>Forfait, horaires et cours</h3><div id="fi-journal"></div></div>';

        // modelos liberados um a um
        var mi = f.modelosIndiv || [];
        var estadoTxt = function (v) { return v === 'tous' ? 'partagé avec tous' : v === 'groupe' ? 'partagé avec le groupe' : ''; };
        var grupoMi = function (titulo, filtro) {
          var l2 = mi.filter(filtro);
          if (!l2.length) return '';
          return '<details class="mi-grupo"' + (titulo.indexOf('écrite') !== -1 ? ' open' : '') + '><summary>' + titulo + ' <small>(' + l2.length + ')</small></summary><div class="mi-tab">' +
            '<div class="mi-cab"><span>Modèle</span><span>Lecture</span><span>Dictée</span></div>' + l2.map(function (x) {
              var bloqueadoPeloEixo = !x.viaEixo;
              var chk = function (tipo) {
                var v = x[tipo], herdado = v === 'tous' || v === 'groupe';
                return '<label class="mi-chk' + (herdado ? ' herdado' : '') + '" title="' + (herdado ? estadoTxt(v) : '') + '"><input type="checkbox" data-mi="' + esc(x.id) + '" data-tipo="' + tipo + '"' +
                  (v ? ' checked' : '') + (herdado ? ' disabled' : '') + '><span></span>' + (herdado ? '<small>' + estadoTxt(v) + '</small>' : '') + '</label>';
              };
              return '<div class="mi-linha" data-busca="' + esc(semAcento(x.titre + ' ' + nomeTache(x.tache))) + '"><div><b>' + esc(x.titre) + '</b><small>' + nomeTache(x.tache) + ' · ' + esc(eixo(x.e).nome) +
                (x.viaEixo ? ' · <span class="mi-eixo">ouvert par l\'axe</span>' : '') + '</small></div>' + chk('modele') + chk('dictee') + '</div>';
            }).join('') + '</div></details>';
        };
        html += '<div class="bloco"><h3>Modèles ouverts un par un</h3><p class="aviso" style="margin-top:0">Cochez pour ouvrir un modèle précis à cet élève seulement (ex. : uniquement « Un cadeau commun pour l\'anniversaire »), ' +
          'même si son axe reste fermé. « Lecture » = le modèle complet ; « Dictée » = il apparaît dans sa page Dictée. L\'enregistrement est immédiat.</p>' +
          '<input type="search" class="mi-busca" id="mi-busca" placeholder="Rechercher un modèle…">' +
          grupoMi('Production écrite : modèles de la professeure', function (x) { return x.origem === 'professeure'; }) +
          grupoMi('Production écrite : Tâches 1, 2 et 3', function (x) { return x.origem === 'ecrit'; }) +
          grupoMi('Production orale : Tâches 2 et 3', function (x) { return x.origem === 'oral'; }) +
          '<span class="aviso" id="mi-st"></span></div>';

        // competências
        html += '<div class="bloco"><h3>Compétences</h3><div class="ficha-duas"><div><h4>Expression écrite</h4>' + barrasCompetencias(f.competencias, 'PE') + '</div>' +
          '<div><h4>Expression orale</h4>' + barrasCompetencias(f.competencias, 'PO') + '</div></div>' +
          (f.ia.n ? '<p class="aviso">Entraînement libre corrigé par l\'IA : ' + f.ia.n + ' texte' + (f.ia.n > 1 ? 's' : '') + ', moyenne ' + f.ia.media + '/20.</p>' : '') +
          '<details class="nova-aval"><summary>Nouvelle évaluation par compétences</summary><div class="form-oral"><label>Épreuve<select id="na-ep"><option value="PE">Expression écrite</option><option value="PO">Expression orale</option></select></label>' +
          '<label>Tâche<select id="na-tache"><option value="T1">T1</option><option value="T2">T2</option><option value="T3" selected>T3</option></select></label>' +
          '<label class="largo">Sujet<input id="na-sujet" placeholder="Sujet travaillé"></label></div><div id="na-comp">' + htmlCompetencias('PE') + '</div>' +
          '<label class="largo campo">Commentaire<textarea id="na-com" rows="3"></textarea></label><button class="ferramenta destaque" type="button" id="na-salvar">Enregistrer</button> <span class="aviso" id="na-st"></span></div></details></div>';
        // notas e produções (tudo o que o aluno enviou, para avaliar aqui mesmo)
        var prods = f.producoesEscritas.map(function (r) { return { tipo: 'PE', r: r }; }).concat(f.producoesOrais.map(function (r) { return { tipo: 'PO', r: r }; }))
          .sort(function (a, b) { return b.r.Date - a.r.Date; });
        var pendentes = prods.filter(function (x) { return x.r['Note /20'] === '' || x.r['Note /20'] === null; }).length;
        html += '<div class="bloco"><h3>Notes et productions <small class="fi-sub">' + prods.length + ' production' + (prods.length > 1 ? 's' : '') + (pendentes ? ' · <b>' + pendentes + ' à noter</b>' : '') + '</small></h3>' +
          (prods.length ? '<div class="fi-prods">' + prods.map(function (x, i) {
            var r = x.r, temNota = r['Note /20'] !== '' && r['Note /20'] !== null, t = String(r['Tâche']);
            return '<div class="fi-prod' + (temNota ? '' : ' pendente') + '" data-i="' + i + '"><div class="fi-prod-cab">' +
              '<span class="fi-tipo ' + x.tipo + '">' + (x.tipo === 'PE' ? 'Écrit ' + t.replace('ET', 'T') : 'Oral ' + t) + '</span>' +
              '<div class="fi-prod-tit"><b>' + esc(String(r.Sujet).slice(0, 110)) + '</b><small>' + new Date(r.Date).toLocaleDateString('fr-CA') +
              (x.tipo === 'PE' ? ' · ' + r.Mots + ' mots' : ' · ' + formatarTempo(r['Durée (s)'] || 0)) + (r.Session ? ' · épreuve' : ' · entraînement') + '</small></div>' +
              '<span class="fi-nota">' + (temNota ? r['Note /20'] + '<small>/20</small>' : 'à noter') + '</span>' +
              '<div class="fi-acoes"><button class="ferramenta" type="button" data-fi-ver>' + (x.tipo === 'PE' ? 'Lire' : '▶ Écouter') + '</button>' +
              '<button class="ferramenta destaque" type="button" data-fi-noter>' + (temNota ? 'Réévaluer' : 'Noter') + '</button>' +
              '<button class="ferramenta perigo" type="button" data-fi-del-prod aria-label="Supprimer">' + ICO.lixo + '</button></div></div>' +
              (temNota && r.Commentaire ? '<p class="fi-com">' + esc(r.Commentaire) + '</p>' : '') +
              '<div class="fi-ver" hidden></div><div class="fi-noter" hidden></div></div>';
          }).join('') + '</div>' : '<p class="aviso" style="margin:0">Aucune production envoyée par cet élève.</p>') + '</div>';

        // mensagens
        html += '<div class="bloco"><h3>Messages et consignes</h3><p class="aviso" style="margin-top:0">L\'élève voit le message sur sa page d\'accueil et le coche quand c\'est fait.</p>' +
          '<textarea id="fi-msg" rows="3" class="campo-msg" placeholder="Ex. : Refaites la dictée du modèle « Voyager seul(e) » et envoyez-moi un enregistrement."></textarea>' +
          '<button class="ferramenta destaque" type="button" id="fi-enviar-msg">Envoyer le message</button><span class="aviso" id="fi-msg-st"></span>' +
          '<div class="fi-msgs">' + (f.mensagens.length ? f.mensagens.map(function (m) {
            return '<div class="fi-msg' + (m.feito ? ' feito' : '') + '"><span class="fi-msg-st">' + (m.feito ? '✓ Fait' : 'À faire') + '</span><p>' + esc(m.texto) + '</p><small>' + new Date(m.data).toLocaleDateString('fr-CA') + '</small>' +
              '<button class="ferramenta sutil" type="button" data-del-msg="' + esc(m.id) + '" aria-label="Supprimer">' + ICO.lixo + '</button></div>';
          }).join('') : '<p class="aviso">Aucun message envoyé.</p>') + '</div></div>';
        // devoirs, provas, produções
        html += '<div class="bloco"><h3>Devoirs</h3>' + (f.devoirs.length ? '<div class="fi-tab">' + f.devoirs.map(function (d) {
          return '<div class="fi-linha"><span>' + (d.feito ? '' : '') + '</span><div><b>' + esc(d.titre) + '</b><small>' + esc(d.tipoNome) + (d.feito && d.score !== '' ? ' · ' + d.score + '/' + d.total : '') + '</small></div>' +
            '<button class="ferramenta perigo" type="button" data-fi-del-dv="' + esc(d.id) + '">Supprimer</button></div>';
        }).join('') + '</div>' : '<p class="aviso" style="margin:0">Aucun devoir.</p>') + '</div>';
        html += '<div class="bloco"><h3>Épreuves proposées</h3>' + (f.sessoes.length ? '<div class="fi-tab">' + f.sessoes.map(function (x) {
          var p2 = []; if (x.escrita) p2.push('écrit ' + (x.feita ? '' : '')); (x.orais || []).forEach(function (o) { p2.push('oral ' + o.tache + ' ' + (o.feita ? '' : '')); });
          return '<div class="fi-linha"><span></span><div><b>' + esc(x.nome) + '</b><small>' + p2.join(' · ') + '</small></div>' +
            '<button class="ferramenta perigo" type="button" data-fi-del-ss="' + esc(x.id) + '">Supprimer</button></div>';
        }).join('') + '</div>' : '<p class="aviso" style="margin:0">Aucune épreuve.</p>') + '</div>';
        alvo.innerHTML = html;
        window.scrollTo({ top: 0, behavior: 'smooth' });

        $('fi-voltar').addEventListener('click', ligarSuivi);
        alvo.querySelectorAll('.fi-prod').forEach(function (c) {
          var x = prods[Number(c.dataset.i)], r = x.r;
          c.querySelector('[data-fi-ver]').addEventListener('click', function () {
            var v = c.querySelector('.fi-ver'); v.hidden = !v.hidden;
            if (v.hidden || v.innerHTML) return;
            if (x.tipo === 'PE') { v.innerHTML = '<div class="prod-texto">' + esc(r.Texte || '').replace(/\n/g, '<br>') + '</div>'; return; }
            v.innerHTML = '<p class="aviso">Chargement…</p>';
            google.script.run.withSuccessHandler(function (url) { v.innerHTML = '<audio controls autoplay src="' + url + '"></audio>'; })
              .withFailureHandler(function (e) { v.innerHTML = '<p class="aviso">' + esc(e.message || e) + '</p>'; }).obterAudioAluno(EMAIL, r.ID);
          });
          c.querySelector('[data-fi-noter]').addEventListener('click', function () {
            var n = c.querySelector('.fi-noter'); n.hidden = !n.hidden;
            if (n.hidden || n.innerHTML) return;
            n.innerHTML = htmlCompetencias(x.tipo) + '<textarea class="campo-msg" rows="2" placeholder="Commentaire pour l\'élève (facultatif)"></textarea>' +
              '<button class="ferramenta destaque" type="button" data-fi-salvar>Enregistrer la note</button> <span class="aviso" data-fi-st></span>';
            var cw = ligarCompetencias(n);
            n.querySelector('[data-fi-salvar]').addEventListener('click', function () {
              var st2 = n.querySelector('[data-fi-st]'); st2.textContent = 'Enregistrement…';
              google.script.run.withSuccessHandler(function (res) {
                st2.textContent = '✓';
                c.classList.remove('pendente');
                c.querySelector('.fi-nota').innerHTML = res.total + '<small>/20</small>';
                n.hidden = true; n.innerHTML = '';
              }).withFailureHandler(function (e) { st2.textContent = '' + (e.message || e); })
                .salvarAvaliacaoCompetencias(EMAIL, { aluno: a.email, epreuve: x.tipo, tache: r['Tâche'], sujet: r.Sujet, ref: r.ID, notas: cw.notas(), comentario: n.querySelector('textarea').value });
            });
          });
          c.querySelector('[data-fi-del-prod]').addEventListener('click', function () {
            if (!confirm('Supprimer définitivement cette production ?')) return;
            google.script.run.withSuccessHandler(function () { c.remove(); }).apagarProducao(EMAIL, x.tipo, r.ID);
          });
        });
        alvo.querySelectorAll('[data-fi-del-dv]').forEach(function (b) {
          b.addEventListener('click', function () {
            if (!confirm('Supprimer ce devoir ? Il sera supprimé pour TOUS les élèves qui l\'ont reçu.')) return;
            google.script.run.withSuccessHandler(function () { abrirFicha(a.email); }).apagarDevoir(EMAIL, b.dataset.fiDelDv);
          });
        });
        alvo.querySelectorAll('[data-fi-del-ss]').forEach(function (b) {
          b.addEventListener('click', function () {
            if (!confirm('Supprimer cette épreuve ? Elle sera supprimée pour TOUS les élèves (les productions déjà envoyées sont conservées).')) return;
            google.script.run.withSuccessHandler(function () { abrirFicha(a.email); }).apagarSessao(EMAIL, b.dataset.fiDelSs);
          });
        });
        var st = $('fi-st');
        var salvar = function (campos, el) {
          (el || st).textContent = 'Enregistrement…';
          google.script.run.withSuccessHandler(function () { (el || st).textContent = '✓ Enregistré'; setTimeout(function () { (el || st).textContent = ''; }, 2500); })
            .withFailureHandler(function (e) { (el || st).textContent = '' + (e.message || e); }).atualizarAluno(EMAIL, a.email, campos);
        };
        $('fi-grupo').addEventListener('change', function () { salvar({ grupo: this.value }); });
        $('fi-ativo').addEventListener('change', function () { salvar({ ativo: this.checked }); });
        $('fi-prod').addEventListener('change', function () { salvar({ producao: this.checked }); });
        alvo.querySelectorAll('[data-mod]').forEach(function (b) {
          b.addEventListener('click', function () {
            b.classList.toggle('on'); b.setAttribute('aria-pressed', b.classList.contains('on'));
            salvar({ modulos: Array.prototype.slice.call(alvo.querySelectorAll('[data-mod].on')).map(function (x) { return x.dataset.mod; }) });
            if (b.dataset.mod === 'SIMULADOS' && $('fi-lib')) setTimeout(function () { painelLiberacao($('fi-lib'), a.email, a.email); }, 1800);
            if (b.dataset.mod === 'MODELES' && $('fi-mod-esc')) setTimeout(function () { painelModelos($('fi-mod-esc'), a.email, a.email); }, 1800);
          });
        });
        $('fi-ver-journal').addEventListener('click', function () { var sec = $('fi-programa'); if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
        $('fi-max').addEventListener('change', function () { salvar({ max: this.value }); });
        var caixas = function () { return Array.prototype.slice.call(alvo.querySelectorAll('.matriz input[type=checkbox]')); };
        alvo.querySelectorAll('[data-col]').forEach(function (b) {
          b.addEventListener('click', function () { var cs = caixas().filter(function (c) { return c.dataset.t === b.dataset.col; }); var todos = cs.every(function (c) { return c.checked; }); cs.forEach(function (c) { c.checked = !todos; }); });
        });
        alvo.querySelectorAll('[data-lin]').forEach(function (b) {
          b.addEventListener('click', function () { var cs = caixas().filter(function (c) { return c.dataset.k === b.dataset.lin; }); var todos = cs.every(function (c) { return c.checked; }); cs.forEach(function (c) { c.checked = !todos; }); });
        });
        $('fi-tudo').addEventListener('click', function () { caixas().forEach(function (c) { c.checked = true; }); });
        $('fi-nada').addEventListener('click', function () { caixas().forEach(function (c) { c.checked = false; }); });
        $('fi-salvar-acesso').addEventListener('click', function () {
          var o = {}; ORDEM_TACHES.forEach(function (t) { o[t] = []; });
          caixas().forEach(function (c) { if (c.checked) o[c.dataset.t].push(c.dataset.k); });
          salvar({ acesso: o }, $('fi-acesso-st'));
        });
        carregarJournalProf($('fi-journal'), a);
        carregarProgramaProf($('fi-programa'), a);
        if ($('fi-lib')) painelLiberacao($('fi-lib'), a.email, a.email);
        if ($('fi-mod-esc')) painelModelos($('fi-mod-esc'), a.email, a.email);
        if ($('fi-intro-salvar')) $('fi-intro-salvar').addEventListener('click', function () {
          var v = $('fi-intro').value.trim(), st2 = $('fi-intro-st');
          if (v && !/^https?:\/\//.test(v)) { st2.textContent = 'Le lien doit commencer par https://'; return; }
          st2.textContent = 'Enregistrement…';
          google.script.run.withSuccessHandler(function () { st2.textContent = v ? '✓ Lien enregistré : l\'élève le verra à sa prochaine connexion.' : '✓ Lien retiré.'; })
            .withFailureHandler(function (e) { st2.textContent = '' + (e.message || e); }).atualizarAluno(EMAIL, a.email, { intro: v });
        });
        alvo.querySelectorAll('[data-mi]').forEach(function (c) {
          c.addEventListener('change', function () {
            var st = $('mi-st'); st.textContent = 'Enregistrement…';
            google.script.run.withSuccessHandler(function () { st.textContent = '✓ ' + (c.checked ? 'Ouvert' : 'Fermé') + ' pour ' + a.nome; setTimeout(function () { st.textContent = ''; }, 2500); })
              .withFailureHandler(function (e) { c.checked = !c.checked; st.textContent = '' + (e.message || e); })
              .definirPartilhaAluno(EMAIL, a.email, c.dataset.mi, c.dataset.tipo, c.checked);
          });
        });
        $('mi-busca').addEventListener('input', function () {
          var q = semAcento(this.value);
          alvo.querySelectorAll('.mi-linha').forEach(function (l) { l.hidden = q && l.dataset.busca.indexOf(q) === -1; });
          if (q) alvo.querySelectorAll('.mi-grupo').forEach(function (g) { g.open = true; });
        });
        if ($('fi-copiar')) $('fi-copiar').addEventListener('click', function () {
          if (!confirm('Appliquer cet accès à tous les élèves du groupe « ' + a.grupo + ' » ? (Enregistrez d\'abord l\'accès de cet élève.)')) return;
          google.script.run.withSuccessHandler(function (n) { $('fi-acesso-st').textContent = '✓ Appliqué à ' + n + ' élève' + (n > 1 ? 's' : ''); })
            .withFailureHandler(function (e) { $('fi-acesso-st').textContent = '' + (e.message || e); }).copiarAcessoParaGrupo(EMAIL, a.email);
        });
        var comp = ligarCompetencias($('na-comp'));
        $('na-ep').addEventListener('change', function () { $('na-comp').innerHTML = htmlCompetencias(this.value); comp = ligarCompetencias($('na-comp')); });
        $('na-salvar').addEventListener('click', function () {
          $('na-st').textContent = 'Enregistrement…';
          google.script.run.withSuccessHandler(function (r) { $('na-st').textContent = '✓ ' + r.total + '/20 · NCLC ' + r.nclc; setTimeout(function () { abrirFicha(a.email); }, 900); })
            .withFailureHandler(function (e) { $('na-st').textContent = '' + (e.message || e); })
            .salvarAvaliacaoCompetencias(EMAIL, { aluno: a.email, epreuve: $('na-ep').value, tache: $('na-ep').value === 'PE' ? 'E' + $('na-tache').value : $('na-tache').value, sujet: $('na-sujet').value, notas: comp.notas(), comentario: $('na-com').value });
        });
        $('fi-enviar-msg').addEventListener('click', function () {
          var t = $('fi-msg').value.trim(); if (!t) return;
          $('fi-msg-st').textContent = 'Envoi…';
          google.script.run.withSuccessHandler(function () { abrirFicha(a.email); }).withFailureHandler(function (e) { $('fi-msg-st').textContent = '' + (e.message || e); }).enviarMensagem(EMAIL, a.email, t);
        });
        alvo.querySelectorAll('[data-del-msg]').forEach(function (b) {
          b.addEventListener('click', function () { if (!confirm('Supprimer ce message ?')) return; google.script.run.withSuccessHandler(function () { abrirFicha(a.email); }).apagarMensagem(EMAIL, b.dataset.delMsg); });
        });
      }).withFailureHandler(function (e) { alvo.innerHTML = '<p class="vazio erro">' + esc(e.message || e) + '</p>'; }).obterFicheEleve(EMAIL, alunoEmail);
    }

    // ---------- blog (professora) ----------
    function ligarBlogProf() {
      var preencher = function () {
        var t = $('bl-tache').value, q = semAcento($('bl-busca').value);
        $('bl-sujet').innerHTML = t ? '<option value="">Choisir…</option>' + listaNav(t).filter(function (x) { return !q || semAcento(x.titre + ' ' + (x.resumo || '')).indexOf(q) !== -1; }).slice(0, 400).map(function (x) {
          return '<option value="' + esc(x.id) + '">' + esc(String(x.titre).slice(0, 110)) + '</option>';
        }).join('') : '';
      };
      var previa = function () {
        $('bl-previa').innerHTML = '<p class="aviso">Aperçu :</p><div class="blog">' + '<article class="blog-card heroi sem-link"><div class="bl-img">' +
          imagemBlog({ imagem: /^https:/.test($('bl-img').value) && !/drive\.google/.test($('bl-img').value) ? $('bl-img').value : '', tache: $('bl-tache').value }) +
          '</div><div class="bl-corpo"><h3>' + esc($('bl-titre').value || 'Titre de l\'article') + '</h3><p>' + esc($('bl-texto').value) + '</p></div></article></div>';
      };
      var limpar = function () { ['bl-ref', 'bl-titre', 'bl-texto', 'bl-img', 'bl-busca'].forEach(function (k) { $(k).value = ''; }); $('bl-tache').value = ''; $('bl-ordem').value = 1; $('bl-vis').checked = true; preencher(); previa(); };
      var desenhar = function (l) {
        $('bl-lista').innerHTML = l.length ? l.map(function (p, i) {
          return '<div class="sessao-prof' + (p.visivel ? '' : ' inativa') + '"><div><span class="etiqueta">#' + p.ordem + '</span> <b>' + esc(p.titre) + '</b>' + (p.visivel ? '' : ' <span class="etiqueta">masqué</span>') +
            '<small>' + esc(String(p.texto || '').slice(0, 120)) + (p.tache ? ' · lien : ' + nomeTache(p.tache) : '') + (p.imagem ? ' · image' : '') + '</small></div>' +
            '<div class="acoes-linha"><button class="ferramenta" type="button" data-bl-ed="' + i + '">Modifier</button><button class="ferramenta perigo" type="button" data-bl-del="' + esc(p.ref) + '">' + ICO.lixo + '</button></div></div>';
        }).join('') : '<p class="vazio">Aucun article : la page d\'accueil affiche les sujets automatiquement.</p>';
        $('bl-lista').querySelectorAll('[data-bl-del]').forEach(function (b) { b.addEventListener('click', function () { if (confirm('Supprimer cet article ?')) google.script.run.withSuccessHandler(desenhar).apagarPostBlog(EMAIL, b.dataset.blDel); }); });
        $('bl-lista').querySelectorAll('[data-bl-ed]').forEach(function (b) {
          b.addEventListener('click', function () {
            var p = l[Number(b.dataset.blEd)];
            $('bl-ref').value = p.ref; $('bl-titre').value = p.titre; $('bl-texto').value = p.texto || ''; $('bl-img').value = p.imagemBruta || ''; $('bl-ordem').value = p.ordem; $('bl-vis').checked = p.visivel;
            $('bl-tache').value = p.tache || ''; preencher(); $('bl-sujet').value = p.id || ''; previa();
            window.scrollTo({ top: 0, behavior: 'smooth' });
          });
        });
      };
      $('bl-tache').addEventListener('change', preencher);
      $('bl-busca').addEventListener('input', preencher);
      $('bl-sujet').addEventListener('change', function () {
        var x = listaNav($('bl-tache').value).filter(function (y) { return y.id === $('bl-sujet').value; })[0];
        if (x && !$('bl-titre').value) $('bl-titre').value = x.titre;
        if (x && !$('bl-texto').value) $('bl-texto').value = String(x.resumo || '').slice(0, 300);
        previa();
      });
      ['bl-titre', 'bl-texto', 'bl-img'].forEach(function (k) { $(k).addEventListener('input', previa); });
      $('bl-novo').addEventListener('click', limpar);
      $('bl-salvar').addEventListener('click', function () {
        $('bl-st').textContent = 'Enregistrement…';
        google.script.run.withSuccessHandler(function (l) { $('bl-st').textContent = '✓ Publié'; desenhar(l); limpar(); })
          .withFailureHandler(function (e) { $('bl-st').textContent = '' + (e.message || e); })
          .salvarPostBlog(EMAIL, { ref: $('bl-ref').value, titre: $('bl-titre').value, texto: $('bl-texto').value, imagem: $('bl-img').value, tache: $('bl-tache').value, id: $('bl-sujet').value, ordem: $('bl-ordem').value, visivel: $('bl-vis').checked });
      });
      preencher(); previa();
      google.script.run.withSuccessHandler(desenhar).listarBlog(EMAIL);
    }

    // ---------- temas do mês (professora) ----------
    function ligarTemasMes() {
      var preencher = function () {
        var t = $('tm-tache').value, q = semAcento($('tm-busca').value);
        $('tm-sujet').innerHTML = listaNav(t).filter(function (x) { return !q || semAcento(x.titre + ' ' + (x.resumo || '')).indexOf(q) !== -1; }).slice(0, 400).map(function (x) {
          return '<option value="' + esc(x.id) + '">' + (x.tipo === 'manuel' ? '' : '') + eixo(x.e).icone + ' ' + esc(String(x.titre).slice(0, 110)) + (x.f > 1 ? ' (' + x.f + '×)' : '') + '</option>';
        }).join('');
      };
      var desenhar = function (l) {
        TEMAS_MES = l; TEMAS_MES_IDS = {}; l.forEach(function (t) { TEMAS_MES_IDS[t.id] = 1; });
        $('tm-lista').innerHTML = l.length ? l.map(function (t) {
          return '<div class="sessao-prof"><div><span class="etiqueta">' + nomeTache(t.tache) + '</span> <b>' + esc(t.titre) + '</b><small>' + eixo(t.e).icone + ' ' + esc(eixo(t.e).nome) + '</small></div>' +
            '<button class="ferramenta perigo" type="button" data-tm-del="' + esc(t.id) + '">Retirer</button></div>';
        }).join('') : '<p class="vazio">Aucun thème ce mois-ci.</p>';
        $('tm-lista').querySelectorAll('[data-tm-del]').forEach(function (b) { b.addEventListener('click', function () { google.script.run.withSuccessHandler(desenhar).removerTemaDoMes(EMAIL, b.dataset.tmDel); }); });
      };
      $('tm-tache').addEventListener('change', preencher);
      $('tm-busca').addEventListener('input', preencher);
      $('tm-add').addEventListener('click', function () {
        var id = $('tm-sujet').value; if (!id) return;
        google.script.run.withSuccessHandler(desenhar).withFailureHandler(function (e) { alert(e.message || e); }).adicionarTemaDoMes(EMAIL, { tache: $('tm-tache').value, id: id });
      });
      $('tm-sugerir').addEventListener('click', function () {
        google.script.run.withSuccessHandler(function (sug) {
          $('tm-sugestoes').innerHTML = '<div class="tm-sug">' + sug.map(function (x) {
            return '<label class="check"><input type="checkbox" checked data-sg-t="' + x.tache + '" value="' + esc(x.id) + '"> <span class="etiqueta">' + x.tache + '</span> ' + esc(String(x.titre).slice(0, 90)) + ' <small>(' + x.f + '×)</small></label>';
          }).join('') + '<button class="ferramenta destaque" type="button" id="tm-add-sug">+ Ajouter la sélection</button></div>';
          $('tm-add-sug').addEventListener('click', function () {
            var marcados = Array.prototype.slice.call($('tm-sugestoes').querySelectorAll('input:checked'));
            var i = 0;
            var prox = function (l2) { if (l2) desenhar(l2); if (i >= marcados.length) { $('tm-sugestoes').innerHTML = ''; return; } var c = marcados[i++]; google.script.run.withSuccessHandler(prox).adicionarTemaDoMes(EMAIL, { tache: c.dataset.sgT, id: c.value }); };
            prox();
          });
        }).sugerirTemasDoMes(EMAIL, 2);
      });
      preencher();
      google.script.run.withSuccessHandler(desenhar).obterTemasDoMes(EMAIL);
    }

    function ligarProfEleves() {
      var grupos = [];
      ALUNOS.forEach(function (a) { if (a.grupo && grupos.indexOf(a.grupo) === -1) grupos.push(a.grupo); });
      $('el-grupo').innerHTML += grupos.sort().map(function (g) { return '<option>' + esc(g) + '</option>'; }).join('');
      var desenhar = function () {
        var q = semAcento($('el-busca').value), g = $('el-grupo').value;
        var l = ALUNOS.filter(function (a) { return (!g || a.grupo === g) && (!q || semAcento(a.nome + ' ' + a.email).indexOf(q) !== -1); });
        $('el-lista').innerHTML = l.length ? l.map(function (a) {
          return '<div class="el-aluno" data-email="' + esc(a.email) + '"><div class="el-id"><b>' + esc(a.nome) + '</b><small>' + esc(a.email) + '</small>' +
            '<input class="el-grupo-in" value="' + esc(a.grupo || '') + '" placeholder="Groupe"></div>' +
            '<label class="interruptor"><input type="checkbox" class="el-prod"' + (a.producao ? ' checked' : '') + '><span></span>Envoi des productions</label>' +
            '<div class="el-eixos">' + B.ordemEixos.map(function (k) {
              var on = (a.eixos || []).indexOf(k) !== -1;
              return '<button type="button" class="el-eixo' + (on ? ' on' : '') + '" data-k="' + k + '" title="' + esc(eixo(k).nome) + '" aria-pressed="' + on + '">' + eixo(k).icone + '</button>';
            }).join('') + '<button type="button" class="ferramenta sutil" data-todos-eixos>Tous</button><button type="button" class="ferramenta sutil" data-nenhum-eixo>Aucun</button></div>' +
            '<span class="aviso el-st"></span></div>';
        }).join('') : '<p class="vazio">Aucun élève.</p>';
        $('el-lista').querySelectorAll('.el-aluno').forEach(function (linha) {
          var a = ALUNOS.filter(function (x) { return x.email === linha.dataset.email; })[0];
          var st = linha.querySelector('.el-st');
          var salvar = function (campos) {
            st.textContent = 'Enregistrement…';
            google.script.run.withSuccessHandler(function () { st.textContent = '✓'; setTimeout(function () { st.textContent = ''; }, 2000); })
              .withFailureHandler(function (e) { st.textContent = '' + (e.message || e); }).atualizarAluno(EMAIL, a.email, campos);
          };
          var eixosAtuais = function () { return Array.prototype.slice.call(linha.querySelectorAll('.el-eixo.on')).map(function (b) { return b.dataset.k; }); };
          linha.querySelectorAll('.el-eixo').forEach(function (b) {
            b.addEventListener('click', function () { b.classList.toggle('on'); b.setAttribute('aria-pressed', String(b.classList.contains('on'))); a.eixos = eixosAtuais(); salvar({ eixos: a.eixos }); });
          });
          linha.querySelector('[data-todos-eixos]').addEventListener('click', function () { linha.querySelectorAll('.el-eixo').forEach(function (b) { b.classList.add('on'); }); a.eixos = eixosAtuais(); salvar({ eixos: a.eixos }); });
          linha.querySelector('[data-nenhum-eixo]').addEventListener('click', function () { linha.querySelectorAll('.el-eixo').forEach(function (b) { b.classList.remove('on'); }); a.eixos = []; salvar({ eixos: [] }); });
          linha.querySelector('.el-prod').addEventListener('change', function () { a.producao = this.checked; salvar({ producao: this.checked }); });
          linha.querySelector('.el-grupo-in').addEventListener('change', function () { a.grupo = this.value.trim(); salvar({ grupo: a.grupo }); });
        });
      };
      $('el-busca').addEventListener('input', desenhar);
      $('el-grupo').addEventListener('change', desenhar);
      desenhar();
      google.script.run.withSuccessHandler(function (ch) {
        $('el-chaves').innerHTML = B.ordemEixos.map(function (k) {
          return '<div><span>' + eixo(k).icone + ' ' + esc(eixo(k).nome) + '</span><code>' + esc(ch[k] || 'exécutez configurarPlanilha()') + '</code></div>';
        }).join('');
      }).listarChavesEixos(EMAIL);
    }

    function ligarProfSessoes() {
      var fonte = function (t) {
        return t.indexOf('ET') === 0 ? SUJETS[t].map(function (x) { return { id: x.id, e: x.e, f: x.f, t: x.t }; })
          : listaNav(t).map(function (x) { return { id: x.id, e: x.e, f: x.f, t: (x.tipo === 'manuel' ? '' : '') + (x.resumo || x.titre) }; });
      };
      var sujetDe = function (t, id) { return fonte(t).filter(function (x) { return x.id === id; })[0]; };
      var preencher = function (t) {
        var sel = document.querySelector('[data-ss="' + t + '"]'), q = semAcento(document.querySelector('[data-busca="' + t + '"]').value);
        var atual = sel.value;
        var l = fonte(t).filter(function (x) { return !q || semAcento(x.t).indexOf(q) !== -1; });
        sel.innerHTML = '<option value="">Aucune (' + l.length + ' sujets disponibles)</option>' + l.map(function (x) {
          return '<option value="' + x.id + '">' + eixo(x.e).icone + ' ' + esc(String(x.t).slice(0, 120)) + (x.f > 1 ? ' (' + x.f + '×)' : '') + '</option>';
        }).join('');
        if (atual && l.some(function (x) { return x.id === atual; })) sel.value = atual;
        previa(t);
      };
      var previa = function (t) {
        var id = document.querySelector('[data-ss="' + t + '"]').value, sj = id && sujetDe(t, id);
        var comp = id && t.indexOf('ET') === 0 ? sujetPorId(t, id) : null;
        document.querySelector('[data-ss-previa="' + t + '"]').textContent = sj ? sj.t + (comp && comp.d1 ? ' (avec documents 1 et 2)' : '') : '';
      };
      ETS().concat(TS()).forEach(function (t) {
        preencher(t);
        document.querySelector('[data-busca="' + t + '"]').addEventListener('input', function () { preencher(t); });
        document.querySelector('[data-ss="' + t + '"]').addEventListener('change', function () { previa(t); });
        document.querySelector('[data-ss-sortear="' + t + '"]').addEventListener('click', function () {
          document.querySelector('[data-busca="' + t + '"]').value = '';
          preencher(t);
          var l = fonte(t);
          document.querySelector('[data-ss="' + t + '"]').value = l[Math.floor(Math.random() * l.length)].id;
          previa(t);
        });
      });
      var seletor = seletorAlunos($('ss-seletor'));
      var listar = function () {
        google.script.run.withSuccessHandler(function (l) {
          $('ss-lista').innerHTML = l.length ? l.map(function (x) {
            var ativa = String(x.Active).toUpperCase() === 'SIM';
            return '<div class="sessao-prof' + (ativa ? '' : ' inativa') + '"><div><b>' + esc(x.Nom) + '</b> <span class="etiqueta">' + (ativa ? 'active' : 'désactivée') + '</span>' +
              '<small>' + x.titulos.map(function (tt, i) { return tt ? 'T' + (i + 1) + ' : ' + esc(String(tt).slice(0, 70)) : ''; })
                .concat((x.orais || []).map(function (tt, i) { return tt ? 'T' + (i + 1) + ' : ' + esc(String(tt).slice(0, 70)) : ''; })).filter(String).join('<br>') +
              '<br>Élèves : ' + esc(x['Élèves']) + '</small></div>' +
              '<div class="acoes-linha"><button class="ferramenta" type="button" data-alternar="' + esc(x.ID) + '" data-ativa="' + (ativa ? '0' : '1') + '">' + (ativa ? 'Désactiver' : 'Réactiver') + '</button>' +
              '<button class="ferramenta perigo" type="button" data-ss-del="' + esc(x.ID) + '">Supprimer</button></div></div>';
          }).join('') : '<p class="vazio">Aucune épreuve publiée.</p>';
          $('ss-lista').querySelectorAll('[data-ss-del]').forEach(function (b) {
            b.addEventListener('click', function () {
              if (!confirm('Supprimer définitivement cette épreuve ? (Les productions déjà envoyées sont conservées.)')) return;
              b.disabled = true;
              google.script.run.withSuccessHandler(listar).apagarSessao(EMAIL, b.dataset.ssDel);
            });
          });
          $('ss-lista').querySelectorAll('[data-alternar]').forEach(function (b) {
            b.addEventListener('click', function () {
              google.script.run.withSuccessHandler(listar).alternarSessao(EMAIL, b.dataset.alternar, b.dataset.ativa === '1');
            });
          });
        }).listarSessoes(EMAIL);
      };
      $('ss-criar').addEventListener('click', function () {
        var dados = { nome: $('ss-nome').value.trim() };
        ETS().concat(TS()).forEach(function (t) { dados[t] = document.querySelector('[data-ss="' + t + '"]').value; });
        dados.alunos = seletor.valor();
        var msg = $('ss-msg');
        if (!ETS().concat(TS()).some(function (t) { return dados[t]; })) { msg.textContent = 'Choisissez au moins une tâche.'; return; }
        if (dados.alunos !== 'TOUS' && !dados.alunos.length) { msg.textContent = 'Choisissez au moins un élève.'; return; }
        msg.textContent = 'Publication…';
        google.script.run.withSuccessHandler(function () { msg.textContent = '✓ Épreuve publiée : elle apparaît maintenant dans la page « Épreuves » des élèves.'; listar(); })
          .withFailureHandler(function (e) { msg.textContent = '' + (e.message || e); }).criarSessao(EMAIL, dados);
      });
      listar();
    }

    function ligarProfEscrita() {
      var carregarLista = function () {
        var alvo = $('pf-lista');
        alvo.innerHTML = '<p class="vazio">Chargement…</p>';
        google.script.run.withSuccessHandler(function (l) {
          if (!l.length) { alvo.innerHTML = '<p class="vazio">Aucune production à afficher. </p>'; return; }
          alvo.innerHTML = l.map(function (r) {
            var t = r['Tâche'], lim = LIMITES[t] || [0, 999], fora = r.Mots > lim[1] || r.Mots < lim[0];
            var temNota = r['Note /20'] !== '' && r['Note /20'] !== null;
            return '<div class="bloco prod" data-id="' + esc(r.ID) + '"><div class="prod-cab"><b>' + esc(r.Nom || r['E-mail']) + '</b>' +
              '<span class="etiqueta">' + esc(String(t).replace('ET', 'Tâche ')) + '</span><span class="aviso">' + new Date(r.Date).toLocaleString('fr-CA') + '</span>' +
              '<span class="contador' + (fora ? ' alto' : '') + '">' + r.Mots + ' mots (' + lim[0] + ' à ' + lim[1] + ')</span>' +
              (r.Document ? '<a href="' + esc(r.Document) + '" target="_blank" rel="noopener">Document</a>' : '') + '</div>' +
              '<p class="prod-sujet">' + esc(r.Sujet) + '</p><details><summary>Lire le texte</summary><div class="prod-texto">' + esc(r.Texte).replace(/\n/g, '<br>') + '</div></details>' +
              (temNota ? '<p class="nota-atual">Note actuelle : <b>' + r['Note /20'] + '/20</b>' + (r.Commentaire ? ' · ' + esc(r.Commentaire) : '') + '</p>' : '') +
              '<div class="prod-nota">' + htmlCompetencias('PE') +
              '<label class="largo">Commentaire pour l\'élève<textarea rows="3"></textarea></label>' +
              '<button class="ferramenta destaque" type="button">' + (temNota ? 'Réévaluer' : 'Enregistrer l\'évaluation') + '</button><span class="aviso msg"></span></div></div>';
          }).join('');
          alvo.querySelectorAll('.prod').forEach(function (c) {
            var cw = ligarCompetencias(c), linhaR = l.filter(function (x) { return x.ID === c.dataset.id; })[0];
            c.querySelector('.prod-nota button').addEventListener('click', function () {
              var com = c.querySelector('.prod-nota textarea').value, msg = c.querySelector('.msg');
              msg.textContent = 'Enregistrement…';
              google.script.run.withSuccessHandler(function (r) { msg.textContent = '✓ ' + r.total + '/20 · NCLC ' + r.nclc; c.classList.add('corrigido'); })
                .withFailureHandler(function (e) { msg.textContent = '' + (e.message || e); })
                .salvarAvaliacaoCompetencias(EMAIL, { aluno: linhaR['E-mail'], epreuve: 'PE', tache: linhaR['Tâche'], sujet: linhaR.Sujet, ref: linhaR.ID, notas: cw.notas(), comentario: com });
            });
          });
        }).withFailureHandler(function (e) { alvo.innerHTML = '<p class="vazio erro">' + esc(e.message || e) + '</p>'; })
          .listarProducoes(EMAIL, { aluno: $('pf-aluno').value, pendentes: $('pf-pend').checked });
      };
      $('pf-aluno').addEventListener('change', carregarLista);
      $('pf-pend').addEventListener('change', carregarLista);
      carregarLista();
    }

    function ligarProfOral() {
      var preencherSujets = function () {
        var t = $('po-tache').value;
        carregarLista(t, function (l) { $('po-sujets').innerHTML = l.slice(0, 400).map(function (m) { return '<option value="' + esc(m.titre) + '">'; }).join(''); });
      };
      var carregarNotas = function () {
        google.script.run.withSuccessHandler(function (l) {
          $('po-lista').innerHTML = tabelaNotas(l.map(function (r) { r.Sujet = (r.Nom ? r.Nom + ' · ' : '') + r.Sujet; return r; }), false);
        }).listarNotasOrais(EMAIL, $('po-aluno').value);
      };
      $('po-tache').addEventListener('change', preencherSujets);
      $('po-aluno').addEventListener('change', carregarNotas);
      $('po-salvar').addEventListener('click', function () {
        var msg = $('po-msg');
        if (!$('po-aluno').value) { msg.textContent = 'Choisissez un élève.'; return; }
        if ($('po-nota').value === '') { msg.textContent = 'Indiquez une note.'; return; }
        msg.textContent = 'Enregistrement…';
        google.script.run.withSuccessHandler(function (r) {
          msg.textContent = '✓ Note enregistrée · NCLC ' + r.nclc;
          $('po-nota').value = ''; $('po-com').value = ''; $('po-sujet').value = '';
          carregarNotas();
        }).withFailureHandler(function (e) { msg.textContent = '' + (e.message || e); })
          .salvarNotaOral(EMAIL, $('po-aluno').value, $('po-tache').value, $('po-sujet').value, $('po-nota').value, $('po-com').value);
      });
      preencherSujets();
      carregarNotas();

      var carregarGravacoes = function () {
        var alvo = $('pg-lista');
        alvo.innerHTML = '<p class="vazio">Chargement…</p>';
        google.script.run.withSuccessHandler(function (l) {
          if (!l.length) { alvo.innerHTML = '<p class="vazio">Aucun enregistrement à afficher.</p>'; return; }
          alvo.innerHTML = l.map(function (r) {
            var temNota = r['Note /20'] !== '' && r['Note /20'] !== null;
            return '<div class="bloco prod' + (temNota ? ' corrigido' : '') + '" data-id="' + esc(r.ID) + '"><div class="prod-cab"><b>' + esc(r.Nom || r['E-mail']) + '</b>' +
              '<span class="etiqueta">Oral · ' + esc(String(r['Tâche']).replace('T', 'Tâche ')) + '</span><span class="aviso">' + new Date(r.Date).toLocaleString('fr-CA') + '</span>' +
              '<span class="contador">' + formatarTempo(r['Durée (s)'] || 0) + '</span>' + (r.Audio ? '<a href="' + esc(r.Audio) + '" target="_blank" rel="noopener">Drive</a>' : '') + '</div>' +
              '<p class="prod-sujet">' + esc(r.Sujet) + '</p>' +
              '<div class="ferramentas"><button class="ferramenta destaque" type="button" data-ouvir-grav>▶ Écouter</button></div><div class="grav-player"></div>' +
              (temNota ? '<p class="nota-atual">Note actuelle : <b>' + r['Note /20'] + '/20</b>' + (r.Commentaire ? ' · ' + esc(r.Commentaire) : '') + '</p>' : '') +
              '<div class="prod-nota">' + htmlCompetencias('PO') +
              '<label class="largo">Commentaire pour l\'élève<textarea rows="3"></textarea></label>' +
              '<button class="ferramenta destaque" type="button" data-salvar-grav>' + (temNota ? 'Réévaluer' : 'Enregistrer l\'évaluation') + '</button><span class="aviso msg"></span></div></div>';
          }).join('');
          alvo.querySelectorAll('.prod').forEach(function (c) {
            c.querySelector('[data-ouvir-grav]').addEventListener('click', function () {
              var bt = this; bt.disabled = true; bt.textContent = 'Chargement…';
              google.script.run.withSuccessHandler(function (url) {
                c.querySelector('.grav-player').innerHTML = '<audio controls autoplay src="' + url + '"></audio>';
                bt.hidden = true;
              }).withFailureHandler(function (e) { bt.disabled = false; bt.textContent = '▶ Écouter'; c.querySelector('.msg').textContent = '' + (e.message || e); })
                .obterAudioAluno(EMAIL, c.dataset.id);
            });
            var cw2 = ligarCompetencias(c), linhaG = l.filter(function (x) { return x.ID === c.dataset.id; })[0];
            c.querySelector('[data-salvar-grav]').addEventListener('click', function () {
              var com = c.querySelector('.prod-nota textarea').value, msg = c.querySelector('.msg');
              msg.textContent = 'Enregistrement…';
              google.script.run.withSuccessHandler(function (r) { msg.textContent = '✓ ' + r.total + '/20 · NCLC ' + r.nclc; c.classList.add('corrigido'); })
                .withFailureHandler(function (e) { msg.textContent = '' + (e.message || e); })
                .salvarAvaliacaoCompetencias(EMAIL, { aluno: linhaG['E-mail'], epreuve: 'PO', tache: linhaG['Tâche'], sujet: linhaG.Sujet, ref: linhaG.ID, notas: cw2.notas(), comentario: com });
            });
          });
        }).withFailureHandler(function (e) { alvo.innerHTML = '<p class="vazio erro">' + esc(e.message || e) + '</p>'; })
          .listarProducoesOrais(EMAIL, { aluno: $('pg-aluno').value, pendentes: $('pg-pend').checked });
      };
      $('pg-aluno').addEventListener('change', carregarGravacoes);
      $('pg-pend').addEventListener('change', carregarGravacoes);
      carregarGravacoes();
    }

    // ================= boîte à outils =================
    function abrirOutils() {
      if (!B) return;
      var partes = [PARTE_ACCUEIL(), { rotulo: 'Boîte à outils' }];
      var html = trilha(partes);
      html += '<h1 class="titulo-pagina">Boîte à outils</h1><p class="intro">Les trames des six tâches, les connecteurs clés et la formule de conclusion utilisés dans tous les modèles.</p>';
      html += '<h2 class="secao-titulo outils-secao"><i class="oral"></i>Oral</h2><div class="grade-trames">';
      ORDEM_TACHES.forEach(function (t) {
        if (t === ETS()[0]) html += '</div><h2 class="secao-titulo outils-secao"><i class="ecrit"></i>Écrit</h2><div class="grade-trames">';
        var tr = B.trames[t]; if (!tr) return;
        html += '<div class="bloco"><div class="etiquetas"><span class="etiqueta">' + nomeTache(t) + '</span></div>' +
          '<h3>' + esc(tr.titulo) + '</h3>' + (tr.sousTitre ? '<p class="aviso" style="margin-top:0">' + esc(tr.sousTitre) + '</p>' : '') +
          (tr.etapes || []).map(function (p) { return '<div class="passo" style="--c:' + p.cor + '"><b>' + esc(p.rotulo) + '</b><span>' + esc(p.texte) + '</span></div>'; }).join('') +
          (tr.conseil ? '<p class="aviso">' + esc(tr.conseil) + '</p>' : '') + '</div>';
      });
      html += '</div>';
      html += '<div class="bloco"><h3>Mémo : connecteurs clés</h3><div class="boite">' + B.connecteurs.map(function (c) {
        return '<div style="border-top:4px solid ' + c.cor + '"><b>' + esc(c.rotulo) + '</b>' + c.itens.map(esc).join('<br>') + '</div>';
      }).join('') + '</div></div>';
      var bo = B.boite;
      html += '<div class="bloco"><h3>Boîte à outils : la conclusion</h3><p class="aviso" style="margin-top:0">Il est essentiel que [agent] + [action au subjonctif] + [complément] + [domaine].</p><div class="boite">' +
        '<div><b>Agents</b>' + bo.agents.map(esc).join(', ') + '</div>' +
        '<div><b>Actions</b>' + bo.actions.map(esc).join(', ') + '</div>' +
        '<div><b>Compléments</b>' + bo.complements.map(esc).join(', ') + '</div>' +
        '<div><b>Domaines</b>' + bo.domaines.map(esc).join(', ') + '</div></div></div>';
      html += '<nav class="rodape-nav"><button class="ferramenta" type="button" data-ir="accueil">Accueil</button><button class="ferramenta" type="button" data-ir="topo">↑ Haut</button></nav>';
      var tela = $('tela-outils');
      tela.innerHTML = html;
      ligarTrilha(tela, partes);
      tela.querySelector('[data-ir="accueil"]').addEventListener('click', irAccueil);
      tela.querySelector('[data-ir="topo"]').addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });
      mostrar('tela-outils');
    }

    // ================= perfil do curso: TCF Canada ou DELF de um nível =================
    // O servidor manda B.perfil. No DELF, as tâches existentes, os nomes (Partie / Exercice), os
    // tempos do oral, os limites de palavras e a épreuve escrita mudam conforme o nível (A1 a B2).
    // O app continua usando os lugares T1..T3 / ET1..ET3; TS() e ETS() devolvem os do perfil.
    var TACHES_TCF = JSON.parse(JSON.stringify(TACHES)), ORDEM_TCF = ORDEM_TACHES.slice();
    var LIMITES_TCF = JSON.parse(JSON.stringify(LIMITES)), TEMPOS_TCF = JSON.parse(JSON.stringify(TEMPOS_EXAME));
    var MIN_ESCRITO_TCF = JSON.parse(JSON.stringify(MIN_EXAME_ESCRITO)), ETAPAS_TCF = JSON.parse(JSON.stringify(ETAPAS_EPREUVE));
    var NIVEL_DELF_CHAVE = 'fnm_delf_nivel';
    
    function ehDelf() { return !!(B && B.perfil && B.perfil.delf); }
    function nomeProva() { return ehDelf() ? B.perfil.nome : 'TCF Canada'; }
    function minutosEpreuve() { return (B && B.perfil && B.perfil.epreuveMin) || 60; }
    function TS() { return ORDEM_TACHES.filter(function (t) { return t.indexOf('ET') !== 0; }); }
    function ETS() { return ORDEM_TACHES.filter(function (t) { return t.indexOf('ET') === 0; }); }
    function seloTache(t) { var i = TACHES[t] || {}; return i.selo || String(i.nom || t).slice(-1); }
    function sujetsLivres(livre) { var o = {}; ETS().forEach(function (t) { if (livre[t]) o[t] = livre[t].id; }); return o; }
    
    function trocarConteudo(alvo, novo) {
      if (Array.isArray(alvo)) { alvo.length = 0; novo.forEach(function (x) { alvo.push(x); }); return; }
      Object.keys(alvo).forEach(function (k) { delete alvo[k]; });
      Object.keys(novo).forEach(function (k) { alvo[k] = novo[k]; });
    }
    
    /** Ajusta as tabelas do app ao perfil recebido do servidor (chamado a cada carga do banco). */
    function aplicarPerfil() {
      var copia = function (o) { return JSON.parse(JSON.stringify(o)); };
      trocarConteudo(TACHES, copia(TACHES_TCF)); trocarConteudo(ORDEM_TACHES, ORDEM_TCF.slice());
      trocarConteudo(LIMITES, copia(LIMITES_TCF)); trocarConteudo(TEMPOS_EXAME, copia(TEMPOS_TCF));
      trocarConteudo(MIN_EXAME_ESCRITO, copia(MIN_ESCRITO_TCF)); trocarConteudo(ETAPAS_EPREUVE, copia(ETAPAS_TCF));
      var p = B && B.perfil;
      if (!p || !p.delf) return;
      var taches = {}, limites = {}, tempos = {}, minutos = {};
      p.ordem.forEach(function (t) {
        var x = p.taches[t], oral = t.indexOf('ET') !== 0;
        taches[t] = { modo: oral ? 'orale' : 'ecrite', nom: x.nom, sous: x.sous, info: x.info, fonte: oral ? 'orale' : 'ecrite', selo: x.selo || '' };
        if (oral) tempos[t] = x.fases;
        else {
          taches[t].min = x.min; taches[t].max = x.max;
          limites[t] = [x.min, x.max]; minutos[t] = x.minutos;
          tempos[t] = [{ nome: 'Rédaction', seg: x.minutos * 60 }];
        }
      });
      trocarConteudo(TACHES, taches); trocarConteudo(ORDEM_TACHES, p.ordem.slice());
      trocarConteudo(LIMITES, limites); trocarConteudo(TEMPOS_EXAME, tempos);
      trocarConteudo(MIN_EXAME_ESCRITO, minutos); trocarConteudo(ETAPAS_EPREUVE, copia(p.epreuve.etapas));
    }
    
    /** Escolha do nível do DELF (A1 a B2) no topo do Ambiente de Produção. */
    function htmlNiveisDelf() {
      if (!ehDelf()) return '';
      return '<div class="niveis-delf" role="group" aria-label="Nível do DELF"><span>Nível do DELF</span>' + B.perfil.niveis.map(function (n) {
        return '<button type="button" class="chip" data-nivel-delf="' + n + '" aria-pressed="' + (n === B.perfil.nivel) + '">' + n + '</button>';
      }).join('') + '<small>' + esc(B.perfil.descricao || '') + '</small></div>';
    }
    document.addEventListener('click', function (ev) {
      var b = ev.target.closest && ev.target.closest('[data-nivel-delf]');
      if (!b || !B || b.dataset.nivelDelf === B.perfil.nivel) return;
      try { localStorage.setItem(NIVEL_DELF_CHAVE, b.dataset.nivelDelf); } catch (e) {}
      window.FNM_NIVEL = b.dataset.nivelDelf;
      b.closest('.niveis-delf').classList.add('carregando');
      location.hash = '';
      location.reload();
    });
    
    function introHubDelf(oral) {
      var n = (oral ? TS() : ETS()).length;
      return (oral ? 'Produção oral do ' : 'Produção escrita do ') + esc(nomeProva()) + ' : ' + n + (oral ? ' parte' : ' exercício') + (n > 1 ? 's' : '') + ', na ordem da prova. ' +
        (oral ? 'Modelos, trames e gravação com correção pela IA ou por um professor.' : 'Modelos segundo a trame, prova de ' + minutosEpreuve() + ' minutos e correção na grade do DELF (/25).');
    }
    function introEpreuveDelf() {
      return 'Produção escrita do ' + esc(nomeProva()) + ' em <b>' + minutosEpreuve() + ' minutos</b>, como no dia do exame : ' +
        ETAPAS_EPREUVE.map(function (e) { return esc(e.t) + ' (≈ ' + e.min + ' min)'; }).join(', ') + '. ';
    }
    
    /** Alertas da épreuve: a lista do TCF ou, no DELF, montada com as etapas do nível. */
    function alertasEpreuve(irPara) {
      if (!ehDelf()) return [
        { em: 480, titulo: 'Plus que 2 minutes pour la Tâche 1', texto: 'Terminez votre message et vérifiez le nombre de mots.', icone: '' },
        { em: 600, titulo: 'Temps conseillé écoulé : passez à la Tâche 2', texto: 'Vous avez 15 minutes pour la Tâche 2.', acao: { rotulo: 'Aller à la Tâche 2', fn: function () { irPara('ET2'); } } },
        { em: 1380, titulo: 'Plus que 2 minutes pour la Tâche 2', texto: 'Concluez votre texte.', icone: '' },
        { em: 1500, titulo: 'Passez à la Tâche 3', texto: 'Vous avez 25 minutes pour le texte argumentatif.', acao: { rotulo: 'Aller à la Tâche 3', fn: function () { irPara('ET3'); } } },
        { em: 2880, titulo: 'Plus que 2 minutes pour la Tâche 3', texto: 'Écrivez votre conclusion.', icone: '' },
        { em: 3000, titulo: 'Relecture : 10 minutes', texto: 'Vérifiez les accords, les accents, la ponctuation et le nombre de mots.', icone: '' },
        { em: 3300, titulo: 'Plus que 5 minutes', texto: 'Terminez votre relecture.', icone: '' },
        { em: 3540, titulo: 'Dernière minute !', texto: 'L\'épreuve se ferme et vos textes seront envoyés automatiquement.', icone: '', tipo: 'urgente' }
      ];
      var l = [], acc = 0, escritas = ETS(), total = minutosEpreuve() * 60;
      ETAPAS_EPREUVE.forEach(function (e, i) {
        var fim = acc + e.min * 60, prox = ETAPAS_EPREUVE[i + 1], t = escritas[i];
        if (t && e.min >= 5) l.push({ em: fim - 120, titulo: 'Faltam 2 minutos para : ' + e.t, texto: 'Conclua o texto e confira o número de palavras.', icone: '' });
        if (prox && escritas[i + 1]) {
          var t2 = escritas[i + 1];
          l.push({ em: fim, titulo: 'Tempo aconselhado esgotado : passe para ' + prox.t, texto: 'Você tem ' + prox.min + ' minutos para ' + prox.t + '.', acao: { rotulo: 'Ir para ' + prox.t, fn: function () { irPara(t2); } } });
        } else if (prox) l.push({ em: fim, titulo: prox.t + ' : ' + prox.min + ' minutos', texto: 'Confira as concordâncias, os acentos, a pontuação e o número de palavras.', icone: '' });
        acc = fim;
      });
      if (total >= 600) l.push({ em: total - 300, titulo: 'Faltam 5 minutos', texto: 'Termine a revisão.', icone: '' });
      l.push({ em: total - 60, titulo: 'Último minuto !', texto: 'A prova vai fechar e os seus textos serão enviados automaticamente.', icone: '', tipo: 'urgente' });
      return l.filter(function (a) { return a.em > 0 && a.em < total; }).sort(function (a, b) { return a.em - b.em; });
    }
    
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
    function linkCorrecao(id) { return 'producao-textual.html?curso=' + encodeURIComponent(B.courseType || 'TCF') + '&producao=' + encodeURIComponent(id); }
    
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
        '<div class="ferramentas"><button class="ferramenta destaque" type="button" id="eo-nova">Nouvelle épreuve orale</button><button class="ferramenta" type="button" id="eo-notas">Mes notes</button><button class="ferramenta" type="button" id="eo-accueil">Accueil</button></div></div>' +
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
      // DELF: textos do nível; ditado e modelos escritos à mão são do TCF (somem quando vazios).
      var escolhas = !ehDelf() ? HUB_ESCOLHAS : HUB_ESCOLHAS.filter(function (h) { return h.id !== 'dictee' && h.id !== 'modeles' || parseInt(extra[h.id], 10) > 0; }).map(function (h) {
        var x = JSON.parse(JSON.stringify(h));
        if (h.id === 'ecrit') x.texto = 'Produção escrita do ' + nomeProva() + ' por eixo temático : modelos segundo a trame e prova de ' + minutosEpreuve() + ' minutos.';
        if (h.id === 'oral') x.texto = 'As ' + TS().length + ' parte' + (TS().length > 1 ? 's' : '') + ' da produção oral do ' + nomeProva() + ' : modelos, gravação e transcrição.';
        return x;
      });
      return '<nav class="hub-escolhas" aria-label="Que voulez-vous travailler ?">' + escolhas.concat([espaco]).map(function (h) {
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
    
    // « Vos sujets »: os temas liberados para o aluno, por tâche (o servidor já filtra a lista dele).
    function carregarMeusSujets(taches) {
      var alvo = $('meus-sujets-lista'); if (!alvo) return;
      var res = {}, faltam = taches.length;
      var desenhar = function () {
        if (--faltam > 0) return;
        var total = taches.reduce(function (n, t) { return n + (res[t] || []).length; }, 0);
        if (!total) { alvo.innerHTML = '<p class="aviso">Aucun sujet ouvert pour vous pour le moment.</p>'; return; }
        alvo.innerHTML = taches.filter(function (t) { return (res[t] || []).length; }).map(function (t) {
          return '<div class="grupo-eixo meus-sujets-grupo"><h3><i></i>' + esc(TACHES[t].nom + ' · ' + TACHES[t].sous) + ' <small>(' + res[t].length + ')</small></h3><div class="lista-modelos">' +
            res[t].map(function (x) {
              var e = eixo(x.e);
              return '<button class="item-modelo" type="button" style="--cor:' + e.cor + '" data-meu-t="' + t + '" data-meu-id="' + esc(x.id) + '"><b>' + esc(String(x.t || '').slice(0, 150)) + '</b>' +
                '<small>' + (e.icone || '') + ' ' + esc(e.nome) + '</small></button>';
            }).join('') + '</div></div>';
        }).join('');
        alvo.querySelectorAll('[data-meu-id]').forEach(function (b) { b.addEventListener('click', function () { abrirModelo(b.dataset.meuT, b.dataset.meuId); }); });
      };
      taches.forEach(function (t) {
        // modelos escritos à mão (já filtrados no banco) + sujets de exame liberados
        var manuais = lista(t).map(function (m) { return { id: m.id, e: m.e, t: m.titre || m.c || '' }; });
        var juntar = function (l) { res[t] = manuais.concat((l || []).filter(function (x) { return !manuais.some(function (m) { return m.id === x.id; }); })); desenhar(); };
        google.script.run.withSuccessHandler(juntar).withFailureHandler(function () { juntar([]); }).obterListaTache(EMAIL, t);
      });
    }
    
    // Production écrite / orale: além das tâches do TCF, os temas e exercícios do curso, por eixo.
    var abrirHubDoScript = abrirHub;
    abrirHub = function (modo) {
      abrirHubDoScript(modo);
      var tela = $('tela-hub');
      // A tela dos temas por eixo temático é só do administrador; o aluno vê os temas que o
      // administrador liberou para ele no Sistema de Correção (por padrão, 20 temas).
      if (!B.admin) {
        var tit = [].filter.call(tela.querySelectorAll('h2.secao-titulo'), function (h) { return /axe thématique/i.test(h.textContent); })[0];
        var grade = tela.querySelector('.grade-eixos');
        var meus = document.createElement('div');
        meus.id = 'hub-meus-sujets';
        meus.innerHTML = '<h2 class="secao-titulo">Vos sujets</h2><p class="aviso" style="margin-top:0">Les sujets choisis pour vous par votre équipe pédagogique.</p><div id="meus-sujets-lista"><p class="aviso">Chargement…</p></div>';
        if (tit) tit.parentNode.insertBefore(meus, tit); else tela.appendChild(meus);
        if (tit) tit.remove();
        if (grade) grade.remove();
        carregarMeusSujets(modo === 'oral' ? TS() : ETS());
      }
      var bloco = document.createElement('div');
      bloco.id = 'hub-curso';
      tela.appendChild(bloco);
      if (modo === 'oral') {
        bloco.innerHTML = '<h2 class="secao-titulo">Exercices oraux au format de l\'examen</h2><div class="hub-acoes">' +
          '<a class="hub-acao" href="producao-oral-exercicios.html?curso=' + encodeURIComponent(B.courseType) + '"><span></span><b>Compréhension et expression orales</b><small>Documents sonores, questions et une tâche à enregistrer, avec professeur en direct si vous le souhaitez.</small></a>' +
          '<a class="hub-acao" href="simulado-tcf.html?curso=' + encodeURIComponent(B.courseType) + '"><span></span><b>Simulation complète de l\'examen</b><small>Les quatre épreuves, dont l\'expression orale enregistrée et transcrite.</small></a></div>';
        return;
      }
      if (!B.admin) { bloco.remove(); return; }
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
          var porIA = b.dataset.envioModo === 'ia';
          confirmarEnvio({ titulo: porIA ? 'Envoyer à la correction par l\'IA' : 'Envoyer à un professeur', custo: 1,
            texto: porIA ? 'Correction complète sur la grille de l\'examen, dans « Mes notes ».' : 'Votre texte entre dans la file du Sistema de Correção. Vous suivrez la correction dans « Mes notes ».' }).then(function (ok) {
            if (!ok) return;
            d.modo = b.dataset.envioModo;
            b.disabled = true; st.textContent = 'Envoi…';
            google.script.run.withSuccessHandler(function (r) {
              atualizarCreditos(r.creditos);
              st.innerHTML = '✓ Envoyé · protocole ' + esc(r.protocolo) + (r.id ? ' · <a href="' + linkCorrecao(r.id) + '">suivre la correction</a>' : '');
            }).withFailureHandler(function (e) { b.disabled = false; st.textContent = e.message || e; }).enviarTextoCorrecao(EMAIL, d);
          });
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
      if (r.correcao === 'professor') return r.quantidade ? '<div class="bloco envio-sistema"><b>✓ Envoyée au Sistema de Correção</b><small>Suivez la correction de chaque tâche dans « Mon espace › Mes notes ».</small></div>' : '';
      if (!r.id || r.status === 'vazia') return '';
      return '<div class="bloco envio-sistema" id="ep-envio"><b>Envoyer aussi à un professeur</b><small>En plus de la correction par l\'IA ci-dessous, vous pouvez envoyer vos textes au Sistema de Correção (1 crédit par tâche).</small>' +
        '<div class="ferramentas">' + ETS().map(function (t) { return '<label class="check"><input type="checkbox" data-ep-t="' + t + '" checked> Tâche ' + t.slice(-1) + '</label>'; }).join('') +
        '<button class="ferramenta destaque" type="button" id="ep-envio-bt">Envoyer au professeur</button></div><span class="aviso" id="ep-envio-st"></span></div>';
    }
    function ligarEnvioEpreuve(r) {
      var bt = $('ep-envio-bt'); if (!bt) return;
      bt.addEventListener('click', function () {
        var ts = Array.prototype.map.call(document.querySelectorAll('[data-ep-t]:checked'), function (c) { return c.dataset.epT; });
        if (!ts.length) return;
        confirmarEnvio({ titulo: 'Envoyer l\'épreuve à un professeur', custo: ts.length,
          texto: 'Tâche(s) ' + ts.map(function (t) { return t.slice(-1); }).join(', ') + ' : chaque texte entre dans la file du Sistema de Correção (1 crédit par tâche).' }).then(function (ok) {
          if (!ok) return;
          bt.disabled = true; $('ep-envio-st').textContent = 'Envoi…';
          google.script.run.withSuccessHandler(function (x) {
            if (typeof x.creditos === 'number') atualizarCreditos(x.creditos); else atualizarCreditos(Math.max(0, (B.creditos || 0) - (x.enviadas || 0)));
            $('ep-envio-st').innerHTML = '✓ ' + x.enviadas + ' tâche(s) envoyée(s). ' + esc(x.aviso || '') + ' Suivez la correction dans « Mes notes ».';
          }).withFailureHandler(function (e) { bt.disabled = false; $('ep-envio-st').textContent = e.message || e; }).enviarEpreuveCorrecao(EMAIL, r.id, ts, 'professor');
        });
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
              ETS().map(function (t) {
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
    
    // ---------- créditos de correção: no topo do hub e na confirmação de envio ----------
    function htmlCreditos() {
      var n = B.creditos || 0;
      return '<a class="creditos-pill' + (n ? '' : ' zero') + '" href="pagamento-correcoes.html" title="Comprar mais créditos" data-creditos>' +
        '<span class="cp-ico" aria-hidden="true">✦</span><span class="cp-num">' + n + '</span><span class="cp-rot">' + (n === 1 ? 'crédit de correction' : 'crédits de correction') + '</span></a>';
    }
    // Depois de um envio, o saldo novo aparece em todos os lugares que mostram créditos.
    function atualizarCreditos(n) {
      if (typeof n === 'number') B.creditos = n;
      document.querySelectorAll('[data-creditos]').forEach(function (el) { el.outerHTML = htmlCreditos(); });
    }
    
    // Confirmação de envio no visual do site (não a caixa do navegador): custo, saldo e saldo depois.
    // o: { titulo, texto, custo, rotulo }. Devolve uma Promise<boolean>.
    function confirmarEnvio(o) {
      return new Promise(function (resolve) {
        var saldo = B.creditos || 0, custo = o.custo || 0, falta = custo > saldo;
        var raiz = document.getElementById('fnm-raiz') || document.body;
        var fundo = document.createElement('div');
        fundo.className = 'fnm-modal-fundo';
        fundo.innerHTML = '<div class="fnm-modal" role="dialog" aria-modal="true" aria-labelledby="fm-tit">' +
          '<div class="fm-ico" aria-hidden="true">' + (falta ? '!' : '✉') + '</div>' +
          '<h3 id="fm-tit">' + esc(o.titulo || 'Envoyer pour correction') + '</h3>' +
          (o.texto ? '<p class="fm-texto">' + esc(o.texto) + '</p>' : '') +
          (custo ? '<div class="fm-creditos"><div><span>Coût de l\'envoi</span><b>' + custo + '</b><small>' + (custo > 1 ? 'crédits' : 'crédit') + '</small></div>' +
            '<div><span>Vos crédits</span><b>' + saldo + '</b><small>' + (saldo === 1 ? 'crédit' : 'crédits') + '</small></div>' +
            '<div class="' + (falta ? 'neg' : 'pos') + '"><span>Après l\'envoi</span><b>' + (falta ? '—' : saldo - custo) + '</b><small>' + (falta ? 'insuffisant' : (saldo - custo === 1 ? 'crédit' : 'crédits')) + '</small></div></div>' : '') +
          (falta ? '<p class="fm-alerta">Vous n\'avez pas assez de crédits pour cet envoi. Achetez des crédits ou choisissez la correction par l\'IA.</p>' : '') +
          '<div class="fm-acoes"><button type="button" class="ferramenta" data-fm="nao">Annuler</button>' +
          (falta ? '<a class="botao-principal" href="pagamento-correcoes.html">Acheter des crédits</a>' : '<button type="button" class="botao-principal" data-fm="sim">' + esc(o.rotulo || 'Confirmer l\'envoi') + '</button>') + '</div></div>';
        raiz.appendChild(fundo);
        requestAnimationFrame(function () { fundo.classList.add('aberto'); });
        var fechar = function (ok) {
          document.removeEventListener('keydown', tecla);
          fundo.classList.remove('aberto');
          setTimeout(function () { fundo.remove(); }, 180);
          resolve(ok);
        };
        var tecla = function (e) { if (e.key === 'Escape') fechar(false); };
        document.addEventListener('keydown', tecla);
        fundo.addEventListener('click', function (e) { if (e.target === fundo) fechar(false); });
        fundo.querySelector('[data-fm="nao"]').addEventListener('click', function () { fechar(false); });
        var sim = fundo.querySelector('[data-fm="sim"]');
        if (sim) { sim.addEventListener('click', function () { fechar(true); }); setTimeout(function () { sim.focus(); }, 50); }
      });
    }
    
    // « Terminer et envoyer » da épreuve de 60 min: com correção do professor, mostra o custo
    // (1 crédito por tâche escrita) e o saldo; com a IA, só confirma o fim.
    function confirmarFimEpreuve(vazias) {
      var prof = EP && EP.correcao === 'professor' && !EP.sessao;
      var feitas = 3 - vazias.length;
      return confirmarEnvio({
        titulo: 'Terminer l\'épreuve et envoyer',
        texto: (vazias.length ? 'Tâche(s) vide(s) : ' + vazias.map(function (t) { return t.slice(-1); }).join(', ') + '. ' : '') +
          (prof ? 'Vos textes entrent dans la file du Sistema de Correção (1 crédit par tâche).' : 'Vos textes seront corrigés par l\'IA dès la fin de l\'épreuve.'),
        custo: prof ? feitas : 0,
        rotulo: 'Terminer et envoyer'
      });
    }
    
    // ================= página do sujet: « Faire ce sujet », dossiê e professor ao vivo =================
    
    // Escolha de quem corrige (aparece dentro de « Faire ce sujet »): IA, professor (fila do Sistema de
    // Correção) ou professor ao vivo (acompanha e, no envio, recebe a produção na mesma fila).
    function htmlEscolhaFazer(oral) {
      var ia = !!(B.ia && B.ia.ativa);
      return '<fieldset class="escolha-correcao tm-correcao"><legend>Qui corrige ?</legend>' +
        '<label' + (ia ? '' : ' class="indisponivel"') + '><input type="radio" name="tm-correcao" value="ia"' + (ia ? ' checked' : ' disabled') + '><span><b>L\'IA</b><small>' +
          (ia ? 'Correction immédiate : note sur 20, trame, corrections et version améliorée' + (oral ? ', à partir de l\'enregistrement et de la transcription' : '') + '. Sans crédit.' : 'Indisponible pour le moment.') + '</small></span></label>' +
        '<label><input type="radio" name="tm-correcao" value="professor"' + (ia ? '' : ' checked') + '><span><b>Attendre la correction d\'un professeur</b><small>La production entre dans la file du Sistema de Correção et est corrigée sur la grille de l\'examen. Vous la retrouvez dans « Mes notes ». 1 crédit · vous en avez ' + (B.creditos || 0) + '.</small></span></label>' +
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
        confirmarEnvio({ titulo: 'Envoyer votre texte au professeur', custo: 1, rotulo: 'Envoyer au professeur',
          texto: 'Votre texte (' + contarPalavras(texto) + ' mots) entre dans la file du Sistema de Correção et sera corrigé sur la grille de l\'examen. Vous suivrez la correction dans « Mes notes ».' }).then(function (ok) {
          if (!ok) return;
          b.disabled = true; st.textContent = 'Envoi…';
          google.script.run.withSuccessHandler(function (r) {
            atualizarCreditos(r.creditos);
            st.innerHTML = '✓ Envoyé · protocole ' + esc(r.protocolo) + (r.id ? ' · <a href="' + linkCorrecao(r.id) + '">suivre la correction</a>' : '');
            if (SALA && SALA.id) salaEnviar({ texto: texto, fim: true });
            finalizarFazer();
            b.disabled = false;
          }).withFailureHandler(function (er) { b.disabled = false; st.textContent = er.message || er; }).enviarTextoCorrecao(EMAIL, { tache: tache, sujet: m.id, texte: texto, modo: 'professor' });
        });
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
      confirmarEnvio({ titulo: 'Envoyer votre enregistrement au professeur', custo: 1, rotulo: 'Envoyer au professeur',
        texto: 'L\'enregistrement (' + formatarTempo(Math.round(d.duree || 0)) + ') et sa transcription entrent dans la file du Sistema de Correção. Vous suivrez la correction dans « Mes notes ».' }).then(function (ok) {
        if (!ok) return;
        b.disabled = true; d.st.textContent = 'Envoi…';
        enviarGravacao({ blob: d.blob, tache: d.tache, sujet: d.m.id, duree: d.duree, transcricao: d.transcricao, modo: 'professor' }).then(function (r) {
          atualizarCreditos(r.creditos);
          d.st.innerHTML = '✓ Envoyé (protocole ' + esc(r.protocolo) + ')' + (r.id ? ' · <a href="' + linkCorrecao(r.id) + '">suivre la correction</a>' : '');
          if (SALA && SALA.id) salaEnviar({ transcricao: d.transcricao, fim: true });
          finalizarFazer();
        }).catch(function (e) { b.disabled = false; d.st.textContent = e.message || e; });
      });
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
    
    // ================= Espace professeur: correção = Sistema de Correção =================
    // As abas « Corriger l'écrit » e « Noter l'oral » mostram a mesma fila do Sistema de Correção do
    // painel da equipe (Producao): corrigir aqui ou lá dá no mesmo. Corrigida, a produção sai da fila
    // e vai para « Corrigées ».
    var NOMES_TAREFA_EQ = { ET1: 'Tâche 1 écrite', ET2: 'Tâche 2 écrite', ET3: 'Tâche 3 écrite', T1: 'Tâche 1 orale', T2: 'Tâche 2 orale', T3: 'Tâche 3 orale' };
    var FILA_EQ = { situacao: 'pendentes', alunoId: '' };
    
    function painelCorrecaoEquipe(modalidade) {
      var alvo = document.querySelector('#tela-prof .prof-conteudo');
      if (!alvo) return;
      var oral = modalidade === 'oral';
      alvo.innerHTML = '<div class="bloco ce-cab"><h3>' + (oral ? 'Productions orales à corriger' : 'Productions écrites à corriger') + '</h3>' +
        '<p class="aviso" style="margin-top:0">C\'est la même file que le Sistema de Correção du panneau de l\'équipe : corriger ici ou là-bas revient au même. Une production corrigée quitte la file et passe dans « Corrigées ».</p>' +
        '<div class="ce-filtros"><div class="ce-abas" role="tablist"><button type="button" class="aba-esp" data-ce="pendentes">À corriger</button><button type="button" class="aba-esp" data-ce="corrigidas">Corrigées</button></div>' +
        '<label class="ce-aluno">Élève <select id="ce-aluno"><option value="">Tous les élèves</option></select></label>' +
        '<a class="ferramenta" href="professor-correcoes.html" target="_blank" rel="noopener">Ouvrir le Sistema de Correção ↗</a></div></div>' +
        '<div id="ce-lista"><p class="vazio">Chargement…</p></div>';
      var desenharAbas = function () { alvo.querySelectorAll('[data-ce]').forEach(function (b) { b.classList.toggle('on', b.dataset.ce === FILA_EQ.situacao); }); };
      var carregar = function () {
        desenharAbas();
        $('ce-lista').innerHTML = '<p class="vazio">Chargement…</p>';
        google.script.run.withSuccessHandler(function (l) {
          var corr = FILA_EQ.situacao === 'corrigidas';
          $('ce-lista').innerHTML = l.length ? '<div class="ce-grade">' + l.map(function (p) {
            var estado = corr ? '<span class="ce-nota">' + (p.nota !== null ? p.nota + '/' + p.notaMax : '✓') + '</span>' :
              p.minha ? '<span class="etiqueta ce-minha">Prise par moi</span>' : p.outro ? '<span class="etiqueta">Avec ' + esc(p.outro) + '</span>' : '<span class="etiqueta ce-fila">En file</span>';
            var acao = corr ? 'Voir la correction' : p.minha ? 'Continuer la correction' : p.outro ? 'Voir' : 'Prendre et corriger';
            return '<div class="ce-item' + (corr ? ' corrigida' : '') + '"><div class="ce-topo"><b>' + esc(p.aluno) + '</b>' + estado + '</div>' +
              '<div class="ce-tags">' + (p.tache ? '<span class="etiqueta ce-tarefa">' + esc(NOMES_TAREFA_EQ[p.tache] || p.tache) + '</span>' : '') +
              '<span class="etiqueta">' + esc(p.curso) + (p.nivel ? ' · ' + esc(p.nivel) : '') + '</span>' + (p.modalidade === 'oral' ? '<span class="etiqueta">Oral</span>' : p.palavras ? '<span class="etiqueta">' + p.palavras + ' mots</span>' : '') + '</div>' +
              '<p class="ce-titulo">' + esc(p.titulo) + '</p>' +
              '<small>Envoyée le ' + new Date(p.data).toLocaleDateString('fr-CA') + (corr && p.dataCorrecao ? ' · corrigée le ' + new Date(p.dataCorrecao).toLocaleDateString('fr-CA') + (p.corretor ? ' par ' + esc(p.corretor) : '') : '') + '</small>' +
              '<a class="' + (corr ? 'ferramenta' : 'botao-principal') + '" href="professor-correcoes.html?producao=' + p.id + (!corr && !p.minha && !p.outro ? '&assumir=1' : '') + '">' + acao + '</a></div>';
          }).join('') + '</div>' : '<p class="vazio">' + (corr ? 'Aucune production corrigée avec ces filtres.' : 'Aucune production à corriger pour le moment.') + '</p>';
        }).withFailureHandler(function (e) { $('ce-lista').innerHTML = '<p class="alerta">' + esc(e.message || e) + '</p>'; })
          .filaCorrecao(EMAIL, { modalidade: modalidade, situacao: FILA_EQ.situacao, alunoId: FILA_EQ.alunoId });
      };
      alvo.querySelectorAll('[data-ce]').forEach(function (b) { b.addEventListener('click', function () { FILA_EQ.situacao = b.dataset.ce; carregar(); }); });
      google.script.run.withSuccessHandler(function (l) {
        var sel = $('ce-aluno'); if (!sel) return;
        sel.innerHTML = '<option value="">Tous les élèves</option>' + l.map(function (a) { return '<option value="' + a.id + '"' + (a.id === FILA_EQ.alunoId ? ' selected' : '') + '>' + esc(a.nome) + '</option>'; }).join('');
      }).alunosCorrecao(EMAIL);
      $('ce-aluno').addEventListener('change', function () { FILA_EQ.alunoId = this.value; carregar(); });
      carregar();
    }
    ligarProfEscrita = function () { painelCorrecaoEquipe('textual'); };
    ligarProfOral = function () { painelCorrecaoEquipe('oral'); };
    
    // Só começa depois que a página confirmou o acesso e o curso (window.FNM_PRONTO).
    (window.FNM_PRONTO || Promise.resolve()).then(function () { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar(); });
    document.addEventListener('visibilitychange', function () { if (document.hidden && EP && !EP.fechada) salvarServidor(); });
    window.addEventListener('pagehide', function () { if (EP && !EP.fechada) salvarServidor(); });
    window.addEventListener('scroll', esconderDica, { passive: true });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && B && !document.querySelector('#tela-accueil.ativa') && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) irAccueil();
    });

    return { irAccueil: irAccueil, abrirOutils: abrirOutils, sair: sair, abrirEpreuve: abrirEpreuve, abrirNotes: abrirNotes, abrirProf: function () { abrirProf(); }, abrirCarnet: abrirCarnet, abrirTarefas: abrirTarefas, abrirJournal: abrirJournal, abrirForfait: abrirForfait,
      abrirOral: function () { abrirHub('oral'); }, abrirDestino: abrirDestino, abrirSimulados: abrirSimulados, abrirVocab: abrirVocab, abrirChrono: function () { abrirChrono(); }, abrirEcrit: function () { abrirHub('ecrit'); }, abrirDictee: abrirDicteePage, abrirModeles: abrirModelesEcrits, abrirAtelier: abrirAtelier, abrirAttentes: abrirAttentes, abrirIntro: abrirIntro };
  })();
