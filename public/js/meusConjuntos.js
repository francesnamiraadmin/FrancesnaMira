// =====================================================================
// EM ANDAMENTO / RESPONDIDOS — página própria (antes vivia dentro de
// Praticar, junto com Sugeridos; agora Praticar só mostra Sugeridos).
// Usa os renderers compartilhados de js/conjuntoCard.js.
// =====================================================================

async function carregarConjuntos() {
  const emAndamentoEl = document.getElementById('conjuntosEmAndamento');
  const respondidosEl = document.getElementById('conjuntosRespondidos');
  try {
    const res = await fetch('/api/questoes/conjuntos', { headers: authHeaders() });
    if (!res.ok) throw new Error('Erro ao carregar conjuntos.');
    const data = await res.json();

    emAndamentoEl.innerHTML = data.prioritarios.emAndamento.length
      ? data.prioritarios.emAndamento.map(renderEmAndamentoCard).join('')
      : '<p class="conjuntos-vazio">Nenhum conjunto em andamento no momento.</p>';

    respondidosEl.innerHTML = data.respondidos.length
      ? data.respondidos.map(renderRespondidoCard).join('')
      : '<p class="conjuntos-vazio">Você ainda não concluiu nenhum conjunto.</p>';
  } catch (err) {
    emAndamentoEl.innerHTML = '<p class="conjuntos-vazio">Erro ao carregar conjuntos.</p>';
    respondidosEl.innerHTML = '';
  }
}

carregarConjuntos();
