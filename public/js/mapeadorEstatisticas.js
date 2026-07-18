// =====================================================================
// MAPEADOR DE ESTUDOS — Dashboard de estatísticas. O painel de filtros
// (período/matéria) refaz o fetch em /api/estudos/estatisticas com query
// params — o backend já devolve tudo pré-agregado e escopado (ver
// backend/routes/estudos.js). Os demais controles (granularidade, tipo de
// gráfico, acumulado) só reformatam o mesmo payload já em memória, sem
// precisar de outro round-trip.
// =====================================================================

function authHeaders() {
  return { Authorization: 'Bearer ' + localStorage.getItem('token') };
}
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

let dadosEstatisticas = null;
let materiasDisponiveis = [];
const filtros = { periodo: 'tudo', materiaId: '', granularidade: 'dia', tipoEvolucao: 'area', tipoDistribuicao: 'rosca', acumulado: false };

function formatarDuracaoLonga(seg) {
  const totalSeg = seg || 0;
  const h = Math.floor(totalSeg / 3600);
  const m = Math.floor((totalSeg % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}min`;
  if (m > 0) return `${m} min`;
  return `${totalSeg}s`;
}
// Versão compacta pro eixo Y do gráfico de evolução (espaço é curto ali).
function formatarDuracaoEixo(seg) {
  const totalSeg = seg || 0;
  const h = Math.floor(totalSeg / 3600);
  const m = Math.floor((totalSeg % 3600) / 60);
  if (h > 0) return m > 0 ? `${h}h${m}m` : `${h}h`;
  return `${m}m`;
}

function renderKpis(kpis) {
  const itens = [
    { valor: formatarDuracaoLonga(kpis.tempoTotalSegundos), rotulo: 'Tempo total no período' },
    { valor: kpis.numeroSessoes, rotulo: 'Sessões' },
    { valor: formatarDuracaoLonga(kpis.tempoMedioSegundos), rotulo: 'Média por sessão' },
    { valor: formatarDuracaoLonga(kpis.maiorSessaoSegundos), rotulo: 'Maior sessão' },
    { valor: formatarDuracaoLonga(kpis.tempoHojeSegundos), rotulo: 'Hoje' },
    { valor: formatarDuracaoLonga(kpis.tempoSemanaSegundos), rotulo: 'Esta semana' },
    { valor: kpis.sequenciaDiasAtual, rotulo: 'Sequência atual 🔥' },
    { valor: kpis.recordeSequenciaDias, rotulo: 'Recorde de sequência' }
  ];
  document.getElementById('kpiRow').innerHTML = itens.map(i => `<div class="dash-kpi"><div class="valor">${i.valor}</div><div class="rotulo">${i.rotulo}</div></div>`).join('');
}

function serieEvolucaoBase() {
  const d = dadosEstatisticas;
  if (filtros.granularidade === 'semana') return d.porSemana.map(x => ({ x: x.semana, y: x.totalSegundos, rotulo: 'Semana ' + x.semana }));
  if (filtros.granularidade === 'mes') return d.porMes.map(x => ({ x: x.mes, y: x.totalSegundos, rotulo: x.mes }));
  return d.porDia.map(x => ({ x: x.data.slice(5), y: x.totalSegundos, rotulo: x.data }));
}

function renderEvolucao() {
  let serie = serieEvolucaoBase();
  if (filtros.acumulado) {
    let acumulado = 0;
    serie = serie.map(p => { acumulado += p.y; return { ...p, y: acumulado }; });
  }
  // strong da tooltip = valor formatado (via formatarEixoY, feito no chartsSvg.js);
  // span = o rótulo completo (data/semana/mês) — não pode ser outra cópia do valor.
  const pontos = serie.map(p => ({ x: p.x, y: Math.round(p.y / 60), tooltip: p.rotulo }));
  document.getElementById('tituloEvolucao').textContent = filtros.acumulado ? 'Tempo estudado (acumulado)' : 'Tempo estudado';
  montarGraficoEvolucao(document.getElementById('graficoEvolucao'), pontos, {
    tipo: filtros.tipoEvolucao, cor: 'var(--accent)', formatarEixoY: v => formatarDuracaoEixo(v * 60)
  });
}

function renderDistribuicao() {
  const d = dadosEstatisticas;
  const escopoMateria = !!filtros.materiaId;
  document.getElementById('tituloDistribuicao').textContent = escopoMateria
    ? 'Por conteúdo — ' + (materiasDisponiveis.find(m => m._id === filtros.materiaId)?.nome || '')
    : 'Por matéria';
  const fonte = escopoMateria ? d.porConteudo : d.porMateria;
  const fatias = fonte.map(item => ({ rotulo: item.nome, valor: item.totalSegundos, cor: item.cor }));
  montarGraficoDistribuicao(document.getElementById('graficoDistribuicao'), fatias, {
    tipo: filtros.tipoDistribuicao, formatarValor: formatarDuracaoLonga
  });
}

function renderRotina() {
  const d = dadosEstatisticas;
  document.getElementById('graficoHeatmap').innerHTML = heatmapCalendario(d.porDia.map(x => ({ data: x.data, valor: x.totalSegundos })));

  const porHora = d.porHoraDoDia.filter(h => h.totalSegundos > 0).map(h => ({ rotulo: `${h.hora}h`, valor: h.totalSegundos, cor: 'var(--accent)' }));
  montarGraficoDistribuicao(document.getElementById('graficoPorHora'), porHora, { tipo: 'barras', formatarValor: formatarDuracaoLonga });

  const porDiaSemana = d.porDiaDaSemana.filter(ds => ds.mediaSegundos > 0).map(ds => ({ rotulo: ds.nome, valor: ds.mediaSegundos, cor: 'var(--accent)' }));
  montarGraficoDistribuicao(document.getElementById('graficoPorDiaSemana'), porDiaSemana, { tipo: 'barras', formatarValor: formatarDuracaoLonga });
}

function renderTudo() {
  if (!dadosEstatisticas) return;
  renderKpis(dadosEstatisticas.kpis);
  renderEvolucao();
  renderDistribuicao();
  renderRotina();
}

function marcarCarregando(carregando) {
  document.querySelectorAll('.chart-card').forEach(c => c.classList.toggle('carregando', carregando));
}

async function carregarMateriasFiltro() {
  try {
    const res = await fetch('/api/estudos/materias', { headers: authHeaders() });
    materiasDisponiveis = res.ok ? await res.json() : [];
    const sel = document.getElementById('filtroMateriaEscopo');
    materiasDisponiveis.forEach(m => sel.insertAdjacentHTML('beforeend', `<option value="${m._id}">${escapeHtml(m.nome)}</option>`));
  } catch (err) { /* filtro fica só com "Todas as Matérias" se falhar */ }
}

async function carregar() {
  marcarCarregando(true);
  try {
    const params = new URLSearchParams();
    if (filtros.periodo && filtros.periodo !== 'tudo') params.set('periodo', filtros.periodo);
    if (filtros.materiaId) params.set('materiaId', filtros.materiaId);
    const res = await fetch('/api/estudos/estatisticas?' + params.toString(), { headers: authHeaders() });
    if (!res.ok) return;
    dadosEstatisticas = await res.json();
    renderTudo();
  } finally {
    marcarCarregando(false);
  }
}

// Filtros que precisam de um novo fetch (mudam o escopo dos dados no servidor).
['filtroPeriodo', 'filtroMateriaEscopo'].forEach(id => {
  document.getElementById(id).addEventListener('change', e => {
    const chave = id === 'filtroPeriodo' ? 'periodo' : 'materiaId';
    filtros[chave] = e.target.value;
    carregar();
  });
});
// Controles que só reformatam o payload já carregado — sem round-trip.
document.getElementById('filtroGranularidade').addEventListener('change', e => { filtros.granularidade = e.target.value; renderEvolucao(); });
document.getElementById('filtroTipoEvolucao').addEventListener('change', e => { filtros.tipoEvolucao = e.target.value; renderEvolucao(); });
document.getElementById('filtroTipoDistribuicao').addEventListener('change', e => { filtros.tipoDistribuicao = e.target.value; renderDistribuicao(); });
document.getElementById('toggleAcumulado').addEventListener('change', e => { filtros.acumulado = e.target.checked; renderEvolucao(); });

(async function iniciar() {
  await carregarMateriasFiltro();
  await carregar();
})();

DeverRealtime.escutar({
  'sessao-estudo-finalizada': d => { if (d.alunoId === DeverRealtime.meuUserId()) carregar(); }
});
