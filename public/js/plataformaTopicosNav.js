// =====================================================================
// Faixa de navegação entre os tópicos da Plataforma de Questões, inserida
// acima do título de cada página do módulo (abaixo da navbar) — mesma
// lista/ordem/ícones do submenu da navbar (PRODUTOS_NAV[0].submenu em
// appShell.js). Duplicada aqui de propósito: appShell.js não expõe esse
// array como global (fica preso numa IIFE) — mesmo padrão de duplicação
// já usado pra NIVEIS/MATERIAS entre páginas deste módulo (ver memória do
// projeto). Se um tópico for renomeado/adicionado, atualizar os dois
// lugares.
//
// Auto-inicializa detectando o arquivo atual pela URL — cada página só
// precisa de um <div id="plataformaTopicosNav"></div> logo após a navbar
// e este script carregado (em qualquer ordem depois do div existir no
// DOM). O próprio tópico atual nunca aparece na lista.
// =====================================================================
(function () {
  const TOPICOS = [
    { arquivo: 'praticar.html', nome: 'Praticar', icone: '📝' },
    { arquivo: 'meus-conjuntos.html', nome: 'Em Andamento / Respondidos', icone: '✅' },
    { arquivo: 'simulados.html', nome: 'Simulados', icone: '⏱️' },
    { arquivo: 'personalizar-conjunto.html', nome: 'Personalize', icone: '🎯' },
    { arquivo: 'caderno-revisao.html', nome: 'Caderno de Revisão', icone: '📓' },
    { arquivo: 'estatisticas-questoes.html', nome: 'Estatísticas', icone: '📊' }
  ];

  const el = document.getElementById('plataformaTopicosNav');
  if (!el) return;

  const atual = location.pathname.split('/').pop();
  const outros = TOPICOS.filter(t => t.arquivo !== atual);
  el.innerHTML = outros.map(t =>
    `<a class="topico-card" href="${t.arquivo}"><span class="icone">${t.icone}</span><span class="nome">${t.nome}</span></a>`
  ).join('');
})();
