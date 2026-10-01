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
