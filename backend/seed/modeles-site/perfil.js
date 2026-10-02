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
