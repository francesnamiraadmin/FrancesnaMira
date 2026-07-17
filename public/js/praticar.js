// =====================================================================
// PRATICAR — só Conjuntos Sugeridos (oficiais, não iniciados, ordenados
// por prioridade). Em Andamento/Respondidos viraram página própria,
// meus-conjuntos.html + js/meusConjuntos.js. Usa os renderers
// compartilhados de js/conjuntoCard.js (authHeaders, renderSugeridoCard,
// e o delegated click de iniciar/continuar/refazer/revisar).
// Não carrega js/questoes.js (só usado por Simulados) — NIVEIS é
// declarado aqui localmente.
// =====================================================================

const NIVEIS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const CHAVE_FILTRO_SESSAO = 'praticar_filtro_sugeridos';

let sugeridosRaw = []; // conjuntos oficiais não iniciados, já vêm ordenados por prioridade do backend

function salvarFiltro() {
  sessionStorage.setItem(CHAVE_FILTRO_SESSAO, JSON.stringify({
    nivel: document.getElementById('filtroSugeridoNivel').value,
    materia: document.getElementById('filtroSugeridoMateria').value,
    busca: document.getElementById('filtroSugeridoBusca').value
  }));
}

function restaurarFiltro() {
  try {
    const salvo = JSON.parse(sessionStorage.getItem(CHAVE_FILTRO_SESSAO) || 'null');
    if (!salvo) return;
    document.getElementById('filtroSugeridoNivel').value = salvo.nivel || '';
    document.getElementById('filtroSugeridoMateria').value = salvo.materia || '';
    document.getElementById('filtroSugeridoBusca').value = salvo.busca || '';
  } catch (err) { /* sessionStorage corrompido — ignora e segue sem filtro salvo */ }
}

function passaFiltroSugerido(c) {
  const nivel = document.getElementById('filtroSugeridoNivel').value;
  const materia = document.getElementById('filtroSugeridoMateria').value;
  const busca = document.getElementById('filtroSugeridoBusca').value.trim().toLowerCase();
  if (nivel && !(c.filtros?.niveis || []).includes(nivel)) return false;
  if (materia && !(c.filtros?.materias || []).includes(materia)) return false;
  if (busca && !c.nome.toLowerCase().includes(busca)) return false;
  return true;
}

function renderSugeridos() {
  const el = document.getElementById('conjuntosSugeridos');
  const filtrados = sugeridosRaw.filter(passaFiltroSugerido);
  el.innerHTML = filtrados.length
    ? filtrados.map(renderSugeridoCard).join('')
    : '<p class="conjuntos-vazio">Nenhum conjunto encontrado para esse filtro.</p>';
}

function initFiltroSugeridos() {
  document.getElementById('filtroSugeridoNivel').insertAdjacentHTML('beforeend', NIVEIS.map(n => `<option value="${n}">${n}</option>`).join(''));
  document.getElementById('filtroSugeridoMateria').insertAdjacentHTML('beforeend', Object.entries(MATERIAS_LABELS).map(([k, v]) => `<option value="${k}">${v}</option>`).join(''));
  restaurarFiltro();
  document.getElementById('filtroSugeridoNivel').addEventListener('change', () => { salvarFiltro(); renderSugeridos(); });
  document.getElementById('filtroSugeridoMateria').addEventListener('change', () => { salvarFiltro(); renderSugeridos(); });
  document.getElementById('filtroSugeridoBusca').addEventListener('input', () => { salvarFiltro(); renderSugeridos(); });
}

async function carregarConjuntos() {
  try {
    const res = await fetch('/api/questoes/conjuntos', { headers: authHeaders() });
    if (!res.ok) throw new Error('Erro ao carregar conjuntos.');
    const data = await res.json();

    sugeridosRaw = data.prioritarios.naoIniciados.filter(c => c.tipo === 'oficial');
    renderSugeridos();
  } catch (err) {
    document.getElementById('conjuntosSugeridos').innerHTML = '<p class="conjuntos-vazio">Erro ao carregar conjuntos.</p>';
  }
}

initFiltroSugeridos();
carregarConjuntos();
