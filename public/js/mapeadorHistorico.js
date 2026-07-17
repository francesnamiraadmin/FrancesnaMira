// =====================================================================
// MAPEADOR DE ESTUDOS — Histórico. Carrega todas as sessões finalizadas
// uma vez (mesmo espírito de "sem paginação" do resto do projeto — volume
// por aluno é pequeno) e filtra/ordena tudo no cliente.
// =====================================================================

function authHeaders(json) {
  const token = localStorage.getItem('token');
  return { Authorization: 'Bearer ' + token, ...(json ? { 'Content-Type': 'application/json' } : {}) };
}
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

let sessoes = [];
let materias = [];
let conteudos = [];
let sessaoSelecionada = null;

function formatarDuracao(seg) {
  const totalSeg = seg || 0;
  const h = Math.floor(totalSeg / 3600);
  const m = Math.floor((totalSeg % 3600) / 60);
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}min`;
  if (m > 0) return `${m} min`;
  return `${totalSeg}s`;
}
function formatarDataHora(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

async function carregarFiltros() {
  const [resM, resC] = await Promise.all([
    fetch('/api/estudos/materias', { headers: authHeaders() }),
    fetch('/api/estudos/conteudos', { headers: authHeaders() })
  ]);
  materias = resM.ok ? await resM.json() : [];
  conteudos = resC.ok ? await resC.json() : [];
  const selM = document.getElementById('filtroMateria');
  materias.forEach(m => selM.insertAdjacentHTML('beforeend', `<option value="${m._id}">${escapeHtml(m.nome)}</option>`));
  atualizarOpcoesConteudoFiltro();
}

function atualizarOpcoesConteudoFiltro() {
  const materiaId = document.getElementById('filtroMateria').value;
  const selC = document.getElementById('filtroConteudo');
  const atual = selC.value;
  const lista = materiaId ? conteudos.filter(c => c.materiaId === materiaId) : conteudos;
  selC.innerHTML = '<option value="">Todos os conteúdos</option>' + lista.map(c => `<option value="${c._id}">${escapeHtml(c.nome)}</option>`).join('');
  if (lista.some(c => c._id === atual)) selC.value = atual;
}

async function carregarSessoes() {
  const res = await fetch('/api/estudos/sessoes', { headers: authHeaders() });
  sessoes = res.ok ? await res.json() : [];
  renderLista();
}

function renderLista() {
  const busca = document.getElementById('filtroBusca').value.trim().toLowerCase();
  const materiaId = document.getElementById('filtroMateria').value;
  const conteudoId = document.getElementById('filtroConteudo').value;
  const ordenar = document.getElementById('filtroOrdenar').value;

  let lista = sessoes.filter(s => {
    if (materiaId && s.materia._id !== materiaId) return false;
    if (conteudoId && s.conteudo._id !== conteudoId) return false;
    if (busca && !(s.observacoes || '').toLowerCase().includes(busca)) return false;
    return true;
  });

  lista = lista.slice().sort((a, b) => {
    if (ordenar === 'antigas') return new Date(a.iniciadoEm) - new Date(b.iniciadoEm);
    if (ordenar === 'maior') return (b.duracaoSegundos || 0) - (a.duracaoSegundos || 0);
    if (ordenar === 'menor') return (a.duracaoSegundos || 0) - (b.duracaoSegundos || 0);
    return new Date(b.iniciadoEm) - new Date(a.iniciadoEm);
  });

  const el = document.getElementById('sessoesLista');
  if (!lista.length) {
    el.innerHTML = '<p class="vazio-msg">Nenhuma sessão encontrada. <a href="mapeador-timer.html">Inicie uma sessão de estudo</a>.</p>';
    return;
  }
  el.innerHTML = lista.map(s => `
    <div class="sessao-card" style="--cor-item:${s.materia.cor};" data-id="${s._id}">
      <div class="badges">
        <span class="materia" style="color:${s.materia.cor};">${escapeHtml(s.materia.nome)}</span>
        <span class="conteudo">${escapeHtml(s.conteudo.nome)}</span>
      </div>
      <span class="data">${formatarDataHora(s.iniciadoEm)}</span>
      <span class="duracao">${formatarDuracao(s.duracaoSegundos)}</span>
      ${s.observacoes ? `<span class="obs-preview">"${escapeHtml(s.observacoes)}"</span>` : ''}
    </div>`).join('');
}

function abrirDetalhe(id) {
  sessaoSelecionada = sessoes.find(s => s._id === id);
  if (!sessaoSelecionada) return;
  document.getElementById('detalheMateria').textContent = sessaoSelecionada.materia.nome;
  document.getElementById('detalheConteudo').textContent = sessaoSelecionada.conteudo.nome;
  document.getElementById('detalheInicio').textContent = formatarDataHora(sessaoSelecionada.iniciadoEm);
  document.getElementById('detalheFim').textContent = formatarDataHora(sessaoSelecionada.finalizadoEm);
  document.getElementById('detalheDuracao').textContent = formatarDuracao(sessaoSelecionada.duracaoSegundos);
  document.getElementById('detalheDispositivo').textContent = sessaoSelecionada.dispositivo || '—';
  document.getElementById('editObservacoes').value = sessaoSelecionada.observacoes || '';
  document.getElementById('modalDetalheErro').textContent = '';
  document.getElementById('modalDetalhe').classList.add('show');
}
function fecharDetalhe() { document.getElementById('modalDetalhe').classList.remove('show'); }

async function salvarDetalhe() {
  const observacoes = document.getElementById('editObservacoes').value.trim();
  const res = await fetch(`/api/estudos/sessoes/${sessaoSelecionada._id}`, {
    method: 'PUT', headers: authHeaders(true), body: JSON.stringify({ observacoes })
  });
  const data = await res.json();
  if (!res.ok) { document.getElementById('modalDetalheErro').textContent = data.msg || 'Erro ao salvar.'; return; }
  fecharDetalhe();
  await carregarSessoes();
}

async function apagarSessaoSelecionada() {
  if (!confirm('Apagar esta sessão do histórico? Essa ação não pode ser desfeita.')) return;
  const res = await fetch(`/api/estudos/sessoes/${sessaoSelecionada._id}`, { method: 'DELETE', headers: authHeaders() });
  if (!res.ok) { alert('Erro ao apagar.'); return; }
  fecharDetalhe();
  await carregarSessoes();
}

// ===================== EVENTOS =====================

document.getElementById('filtroBusca').addEventListener('input', renderLista);
document.getElementById('filtroMateria').addEventListener('change', () => { atualizarOpcoesConteudoFiltro(); renderLista(); });
document.getElementById('filtroConteudo').addEventListener('change', renderLista);
document.getElementById('filtroOrdenar').addEventListener('change', renderLista);

document.getElementById('sessoesLista').addEventListener('click', e => {
  const card = e.target.closest('.sessao-card');
  if (card) abrirDetalhe(card.dataset.id);
});

document.getElementById('btnFecharDetalhe').addEventListener('click', fecharDetalhe);
document.getElementById('btnSalvarDetalhe').addEventListener('click', salvarDetalhe);
document.getElementById('btnApagarSessao').addEventListener('click', apagarSessaoSelecionada);

(async function init() {
  await carregarFiltros();
  await carregarSessoes();
})();
