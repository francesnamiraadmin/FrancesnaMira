// =====================================================================
// CADERNO DE REVISÃO — página própria (migrado de public/js/conjuntos.js)
// =====================================================================

function authHeaders(json) {
  const token = localStorage.getItem('token');
  return Object.assign({ Authorization: 'Bearer ' + token }, json ? { 'Content-Type': 'application/json' } : {});
}

function renderCadernoItem(item) {
  const q = item.questao;
  const textoResposta = valor => {
    if (valor === null || valor === undefined) return '';
    return q.tipo === 'vf' ? (valor ? 'Vrai' : 'Faux') : valor;
  };
  return `<div class="q-card">
    <div class="q-head">
      <span class="q-tags">
        <span class="q-tag">${NOMES_TIPO[q.tipo]}</span>
        <span class="q-pill">${q.nivel}</span>
        <span class="q-pill">${MATERIAS_LABELS[q.materia] || q.materia}</span>
      </span>
    </div>
    ${q.visual ? renderVisual(q.visual) : ''}
    ${q.texto ? `<div class="q-texto">${q.texto}</div>` : ''}
    <div class="q-enunciado">${q.enunciado}</div>
    ${q.tipo === 'vf' ? `<div class="q-enunciado" style="font-weight:600;">Afirmação: « ${q.afirmacao} »</div>` : ''}
    <p>Resposta certa: <strong>${textoResposta(q.respostaCorreta)}</strong></p>
    <div class="q-gabarito show"><strong>Explicação:</strong> ${q.explicacao}</div>
    <div class="q-actions">
      <button class="q-btn secundario" data-remover-caderno="${item.questaoId}">Remover do Caderno</button>
    </div>
  </div>`;
}

async function carregarCaderno() {
  const alvo = document.getElementById('cadernoLista');
  alvo.innerHTML = '<p class="conjuntos-vazio">Carregando...</p>';
  try {
    const url = window.CursoContexto ? window.CursoContexto.urlComCurso('/api/questoes/caderno') : '/api/questoes/caderno';
    const res = await fetch(url, { headers: authHeaders() });
    const itens = res.ok ? await res.json() : [];
    alvo.innerHTML = itens.length
      ? itens.map(renderCadernoItem).join('')
      : '<p class="conjuntos-vazio">Nenhuma questão salva no Caderno de Revisão ainda. Depois de responder um conjunto, use "Adicionar ao Caderno de Revisão" na tela de resultado.</p>';
  } catch (err) {
    alvo.innerHTML = '<p class="conjuntos-vazio">Erro ao carregar o Caderno de Revisão.</p>';
  }
}

document.addEventListener('click', async e => {
  const btn = e.target.closest('[data-remover-caderno]');
  if (!btn) return;
  const res = await fetch(`/api/questoes/caderno/${btn.dataset.removerCaderno}`, { method: 'DELETE', headers: authHeaders() });
  if (res.ok) carregarCaderno();
});

carregarCaderno();
