// ================= navegação: voltar para a tela anterior =================
// Cada tela aberta entra numa pilha. Em todas as telas aparece « ← Retour : <tela anterior> »
// (ex.: na Tâche 1, volta para Production écrite), e o botão « voltar » do navegador/celular
// também volta para a tela anterior do app em vez de sair dele. A trilha (Accueil › …) ganha
// o nível « Production écrite / orale » quando ele faltava.
var NAV = { pilha: [], voltando: false, modo: null, botao: null };

var NAV_ROTULO = {
  irAccueil: function () { return 'Accueil'; },
  abrirHub: function (m) { return m === 'oral' ? 'Production orale' : 'Production écrite'; },
  abrirLista: function (t) { return TACHES[t] ? nomeTache(t) + ' · ' + TACHES[t].sous : 'Sujets'; },
  abrirEixo: function (e) { var x = eixo(e); return x && x.nome ? x.nome : 'Axe thématique'; },
  abrirModelo: function () { return 'Sujet'; },
  abrirEpreuve: function () { return 'Épreuves'; },
  abrirEpreuveOral: function () { return 'Épreuve orale'; },
  abrirOutils: function () { return 'Boîte à outils'; },
  abrirNotes: function () { return 'Mes notes'; },
  abrirTarefas: function () { return 'Mes tâches'; },
  abrirCarnet: function () { return 'Cahier d\'erreurs'; },
  abrirAtelier: function () { return 'Atelier'; },
  abrirAttentes: function () { return 'Attentes du professeur'; },
  abrirCadernoTCF: function () { return 'Révision'; },
  abrirDicteePage: function () { return 'Dictée'; },
  abrirModelesEcrits: function () { return 'Modèles écrits'; },
  abrirVocab: function () { return 'Vocabulaire'; },
  abrirTeste: function () { return 'Test'; },
  abrirProf: function () { return 'Espace professeur'; },
  abrirCorrecaoProf: function () { return 'Correction'; }
};

function navChave(e) { try { return e.nome + '|' + JSON.stringify(e.args); } catch (x) { return e.nome + '|?'; } }

function navegavel(nome, fn) {
  return function () {
    if ((nome === 'abrirTarefas' || nome === 'abrirNotes' || nome === 'abrirCarnet') && !(B && B.professor)) return fn.apply(this, arguments);
    var args = Array.prototype.slice.call(arguments).filter(function (a) { return typeof a !== 'function' && !(a && a.nodeType) && !(typeof Event !== 'undefined' && a instanceof Event); });
    if (nome === 'abrirHub') NAV.modo = args[0] === 'oral' ? 'oral' : 'ecrit';
    if (!NAV.voltando) {
      var e = { nome: nome, args: args, fn: null }, k = navChave(e);
      // voltou para uma tela que já está na pilha (pela trilha, por ex.): corta a pilha ali
      var i = -1;
      for (var j = NAV.pilha.length - 1; j >= 0; j--) if (navChave(NAV.pilha[j]) === k) { i = j; break; }
      if (i >= 0) NAV.pilha.length = i + 1;
      else {
        NAV.pilha.push(e);
        if (NAV.pilha.length > 40) NAV.pilha.shift();
        if (nome === 'irAccueil') NAV.pilha = [e];
        else try { history.pushState({ fnmNav: NAV.pilha.length }, ''); } catch (x) { /* ok */ }
      }
    }
    var r = fn.apply(this, arguments);
    setTimeout(navAtualizarBotao, 0);
    return r;
  };
}

function navVoltar() {
  if (NAV.pilha.length < 2) { NAV.voltando = true; try { irAccueil(); } finally { NAV.voltando = false; } NAV.pilha = NAV.pilha.slice(0, 1); navAtualizarBotao(); return; }
  NAV.pilha.pop();
  var ant = NAV.pilha[NAV.pilha.length - 1];
  NAV.voltando = true;
  try { NAV_FUNCOES[ant.nome].apply(null, ant.args); } finally { NAV.voltando = false; }
  navAtualizarBotao();
}

function navAtualizarBotao() {
  if (!NAV.botao) {
    var primeira = document.querySelector('.tela');
    if (!primeira) return;
    NAV.botao = document.createElement('button');
    NAV.botao.type = 'button';
    NAV.botao.className = 'volta-tela';
    NAV.botao.hidden = true;
    NAV.botao.innerHTML = '<span aria-hidden="true">←</span> <span class="vt-txt">Retour</span> <b class="vt-dest"></b>';
    NAV.botao.addEventListener('click', function () {
      if (history.state && history.state.fnmNav) history.back(); else navVoltar();
    });
    primeira.parentNode.insertBefore(NAV.botao, primeira);
  }
  var ant = NAV.pilha.length > 1 ? NAV.pilha[NAV.pilha.length - 2] : null;
  var naInicial = !NAV.pilha.length || NAV.pilha[NAV.pilha.length - 1].nome === 'irAccueil';
  if (naInicial || !ant) { NAV.botao.hidden = true; return; }
  var rot = (NAV_ROTULO[ant.nome] || function () { return 'Page précédente'; }).apply(null, ant.args);
  NAV.botao.querySelector('.vt-dest').textContent = rot;
  NAV.botao.setAttribute('aria-label', 'Retour : ' + rot);
  NAV.botao.hidden = false;
}

// botão « voltar » do navegador / do celular
window.addEventListener('popstate', function (ev) {
  void ev;
  if (NAV.pilha.length > 1) navVoltar();
});

// Trilha: acrescenta « Production écrite / orale » entre Accueil e a tâche (ou o eixo).
var trilhaDoScript = trilha;
trilha = function (partes) {
  if (partes && partes.length >= 2 && partes[0].rotulo === 'Accueil' && !partes.some(function (p) { return /^Production (écrite|orale)$/.test(p.rotulo); })) {
    var m = /^Oral\b/.test(partes[1].rotulo) ? 'oral' : /^Écrit\b/.test(partes[1].rotulo) ? 'ecrit' : null;
    if (!m && NAV.modo && NAV.pilha.some(function (e) { return e.nome === 'abrirEixo' || e.nome === 'abrirLista'; })) m = NAV.modo;
    if (m) partes.splice(1, 0, { rotulo: m === 'oral' ? 'Production orale' : 'Production écrite', fn: function () { abrirHub(m); } });
  }
  return trilhaDoScript(partes);
};

// Telas que entram na pilha (as funções do app passam a registrar a navegação).
irAccueil = navegavel('irAccueil', irAccueil);
abrirHub = navegavel('abrirHub', abrirHub);
abrirLista = navegavel('abrirLista', abrirLista);
abrirEixo = navegavel('abrirEixo', abrirEixo);
abrirModelo = navegavel('abrirModelo', abrirModelo);
abrirEpreuve = navegavel('abrirEpreuve', abrirEpreuve);
abrirEpreuveOral = navegavel('abrirEpreuveOral', abrirEpreuveOral);
abrirOutils = navegavel('abrirOutils', abrirOutils);
abrirNotes = navegavel('abrirNotes', abrirNotes);
abrirTarefas = navegavel('abrirTarefas', abrirTarefas);
abrirCarnet = navegavel('abrirCarnet', abrirCarnet);
abrirAtelier = navegavel('abrirAtelier', abrirAtelier);
abrirAttentes = navegavel('abrirAttentes', abrirAttentes);
abrirCadernoTCF = navegavel('abrirCadernoTCF', abrirCadernoTCF);
abrirDicteePage = navegavel('abrirDicteePage', abrirDicteePage);
abrirModelesEcrits = navegavel('abrirModelesEcrits', abrirModelesEcrits);
abrirVocab = navegavel('abrirVocab', abrirVocab);
abrirTeste = navegavel('abrirTeste', abrirTeste);
abrirProf = navegavel('abrirProf', abrirProf);
abrirCorrecaoProf = navegavel('abrirCorrecaoProf', abrirCorrecaoProf);
var NAV_FUNCOES = {
  irAccueil: irAccueil, abrirHub: abrirHub, abrirLista: abrirLista, abrirEixo: abrirEixo, abrirModelo: abrirModelo, abrirEpreuve: abrirEpreuve,
  abrirEpreuveOral: abrirEpreuveOral, abrirOutils: abrirOutils, abrirNotes: abrirNotes, abrirTarefas: abrirTarefas, abrirCarnet: abrirCarnet,
  abrirAtelier: abrirAtelier, abrirAttentes: abrirAttentes, abrirCadernoTCF: abrirCadernoTCF, abrirDicteePage: abrirDicteePage,
  abrirModelesEcrits: abrirModelesEcrits, abrirVocab: abrirVocab, abrirTeste: abrirTeste, abrirProf: abrirProf, abrirCorrecaoProf: abrirCorrecaoProf
};
