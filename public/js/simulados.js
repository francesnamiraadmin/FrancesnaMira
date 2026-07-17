// =====================================================================
// SIMULADOS — página própria, reaproveitando o mesmo backend real de
// Conjunto/Tentativa já usado em Praticar/Personalizados — só filtrando
// por pool="simulado". Reaproveita as funções globais de renderização já
// definidas em js/conjuntoCard.js (conjuntoCardBase/renderPrioritarioCard/
// renderRespondidoCard/formatarTempo/authHeaders) e o clique delegado em
// `document` que já existe lá (data-iniciar/continuar/refazer/revisar),
// então não precisa reimplementar nada disso aqui — só buscar e desenhar
// os cards. A criação de simulado personalizado saiu desta página — virou
// só mais uma opção de pool em personalizar-conjunto.html (junto com
// Praticar), pra não duplicar o mesmo formulário em dois lugares.
//
// Filtro (nível/categoria/busca por nome) segue o mesmo padrão já usado em
// praticar.js (mesmas classes .conjuntos-filtro-row/.filtro-select),
// persistido em sessionStorage — mas aqui filtra as DUAS listas (Sugeridos
// E Respondidos), já que as duas vivem nesta mesma página (Praticar
// filtra só Sugeridos porque Em Andamento/Respondidos é outra página).
// =====================================================================

const NIVEIS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const CHAVE_FILTRO_SESSAO = 'simulados_filtro';

let sugeridosRaw = [];
let respondidosRaw = [];

function salvarFiltro() {
  sessionStorage.setItem(CHAVE_FILTRO_SESSAO, JSON.stringify({
    nivel: document.getElementById('filtroSimuladoNivel').value,
    materia: document.getElementById('filtroSimuladoMateria').value,
    busca: document.getElementById('filtroSimuladoBusca').value
  }));
}

function restaurarFiltro() {
  try {
    const salvo = JSON.parse(sessionStorage.getItem(CHAVE_FILTRO_SESSAO) || 'null');
    if (!salvo) return;
    document.getElementById('filtroSimuladoNivel').value = salvo.nivel || '';
    document.getElementById('filtroSimuladoMateria').value = salvo.materia || '';
    document.getElementById('filtroSimuladoBusca').value = salvo.busca || '';
  } catch (err) { /* sessionStorage corrompido — ignora e segue sem filtro salvo */ }
}

function passaFiltroSimulado(c) {
  const nivel = document.getElementById('filtroSimuladoNivel').value;
  const materia = document.getElementById('filtroSimuladoMateria').value;
  const busca = document.getElementById('filtroSimuladoBusca').value.trim().toLowerCase();
  if (nivel && !(c.filtros?.niveis || []).includes(nivel)) return false;
  if (materia && !(c.filtros?.materias || []).includes(materia)) return false;
  if (busca && !c.nome.toLowerCase().includes(busca)) return false;
  return true;
}

function renderListas() {
  const prioritariosEl = document.getElementById('simuladosPrioritarios');
  const respondidosEl = document.getElementById('simuladosRespondidos');

  const filtradosSugeridos = sugeridosRaw.filter(passaFiltroSimulado);
  prioritariosEl.innerHTML = filtradosSugeridos.length
    ? filtradosSugeridos.map(renderPrioritarioCard).join('')
    : sugeridosRaw.length
      ? '<p class="conjuntos-vazio">Nenhum simulado encontrado para esse filtro.</p>'
      : '<p class="conjuntos-vazio">Nenhum simulado disponível ainda — <a href="personalizar-conjunto.html">crie um personalizado</a>.</p>';

  const filtradosRespondidos = respondidosRaw.filter(passaFiltroSimulado);
  respondidosEl.innerHTML = filtradosRespondidos.length
    ? filtradosRespondidos.map(renderRespondidoCard).join('')
    : respondidosRaw.length
      ? '<p class="conjuntos-vazio">Nenhum simulado encontrado para esse filtro.</p>'
      : '<p class="conjuntos-vazio">Você ainda não concluiu nenhum simulado.</p>';
}

function initFiltroSimulado() {
  document.getElementById('filtroSimuladoNivel').insertAdjacentHTML('beforeend', NIVEIS.map(n => `<option value="${n}">${n}</option>`).join(''));
  document.getElementById('filtroSimuladoMateria').insertAdjacentHTML('beforeend', Object.entries(MATERIAS_LABELS).map(([k, v]) => `<option value="${k}">${v}</option>`).join(''));
  restaurarFiltro();
  document.getElementById('filtroSimuladoNivel').addEventListener('change', () => { salvarFiltro(); renderListas(); });
  document.getElementById('filtroSimuladoMateria').addEventListener('change', () => { salvarFiltro(); renderListas(); });
  document.getElementById('filtroSimuladoBusca').addEventListener('input', () => { salvarFiltro(); renderListas(); });
}

async function carregarSimulados() {
  const prioritariosEl = document.getElementById('simuladosPrioritarios');
  const respondidosEl = document.getElementById('simuladosRespondidos');
  try {
    const res = await fetch('/api/questoes/conjuntos?pool=simulado', { headers: authHeaders() });
    if (!res.ok) throw new Error('Erro ao carregar simulados.');
    const data = await res.json();

    sugeridosRaw = [...data.prioritarios.emAndamento, ...data.prioritarios.naoIniciados];
    respondidosRaw = data.respondidos;
    renderListas();
  } catch (err) {
    prioritariosEl.innerHTML = '<p class="conjuntos-vazio">Erro ao carregar simulados.</p>';
    respondidosEl.innerHTML = '';
  }
}

initFiltroSimulado();
carregarSimulados();
