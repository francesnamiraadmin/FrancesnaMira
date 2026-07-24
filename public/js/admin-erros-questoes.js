// =====================================================================
// ADMIN — Erros de Questões: lista os relatos enviados por alunos
// (public/js/conjuntoResolverEmbed.js, botão "Relatar erro" no resultado de
// um conjunto) e permite marcar como resolvido.
// =====================================================================

function authHeaders(json) {
  const token = localStorage.getItem('token');
  return Object.assign({ Authorization: 'Bearer ' + token }, json ? { 'Content-Type': 'application/json' } : {});
}

let filtroAtual = 'aberto';

function formatarData(iso) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderRelato(r) {
  const questao = r.questaoId || {};
  const aluno = r.alunoId || {};
  const resolvido = r.status === 'resolvido';
  return `
    <div class="relato-item ${resolvido ? 'resolvido' : ''}">
      <div class="relato-cabecalho">
        <div>
          <div class="relato-aluno">${escapeHtml(aluno.nome || 'Aluno removido')}</div>
          <div class="relato-data">${escapeHtml(aluno.email || '')} · ${formatarData(r.criadoEm)}</div>
        </div>
        <span class="pill status-${r.status}">${resolvido ? 'Resolvido' : 'Aberto'}</span>
      </div>
      <div class="relato-questao">
        ${questao.courseType ? `<span class="pill">${escapeHtml(questao.courseType)}</span>` : ''}
        ${questao.nivel ? `<span class="pill">${escapeHtml(questao.nivel)}</span>` : ''}
        ${questao.materia ? `<span class="pill">${escapeHtml(questao.materia)}</span>` : ''}
        <div style="margin-top:6px;">${escapeHtml(questao.enunciado || 'Questão não encontrada (pode ter sido removida).')}</div>
      </div>
      <div class="relato-mensagem">${escapeHtml(r.mensagem)}</div>
      ${!resolvido ? `<button class="btn pequeno" data-resolver="${r._id}">Marcar como resolvido</button>` : ''}
    </div>`;
}

async function carregarRelatos() {
  const lista = document.getElementById('relatosLista');
  lista.innerHTML = '<div class="vazio-box">Carregando...</div>';
  try {
    const params = filtroAtual ? `?status=${filtroAtual}` : '';
    const res = await fetch(`/api/erros-questoes${params}`, { headers: authHeaders() });
    if (!res.ok) { lista.innerHTML = '<div class="vazio-box">Erro ao carregar relatos.</div>'; return; }
    const relatos = await res.json();
    lista.innerHTML = relatos.length
      ? relatos.map(renderRelato).join('')
      : '<div class="vazio-box">Nenhum relato encontrado.</div>';
  } catch (err) {
    lista.innerHTML = '<div class="vazio-box">Erro ao carregar relatos.</div>';
  }
}

document.getElementById('relatosLista').addEventListener('click', async e => {
  const btn = e.target.closest('[data-resolver]');
  if (!btn) return;
  btn.disabled = true;
  btn.textContent = 'Salvando...';
  const res = await fetch(`/api/erros-questoes/${btn.dataset.resolver}`, {
    method: 'PATCH', headers: authHeaders(true), body: JSON.stringify({ status: 'resolvido' })
  });
  if (res.ok) carregarRelatos();
  else { btn.disabled = false; btn.textContent = 'Marcar como resolvido'; alert('Não foi possível salvar.'); }
});

document.querySelectorAll('.filtro-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.filtro-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    filtroAtual = tab.dataset.filtro;
    carregarRelatos();
  });
});

carregarRelatos();
