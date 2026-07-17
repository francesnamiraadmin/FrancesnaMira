// =====================================================================
// MAPEADOR DE ESTUDOS — Dashboard de estatísticas. Um único GET traz tudo
// já agregado pelo backend (kpis + séries prontas) — nenhum recálculo
// pesado no cliente, só formatação e escolha de qual gráfico popular.
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

function formatarDuracaoLonga(seg) {
  const totalSeg = seg || 0;
  const h = Math.floor(totalSeg / 3600);
  const m = Math.floor((totalSeg % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}min`;
  if (m > 0) return `${m} min`;
  return `${totalSeg}s`;
}

function renderBarrasTempo(linhas) {
  const validas = linhas.filter(l => l.totalSegundos > 0);
  if (!validas.length) return '<p class="vazio-msg">Sem dados suficientes.</p>';
  const max = Math.max(1, ...validas.map(l => l.totalSegundos));
  return validas.map(l => `
    <div class="bar-list-row" title="${escapeHtml(l.rotulo)}: ${formatarDuracaoLonga(l.totalSegundos)}">
      <span class="bar-list-label">${escapeHtml(l.rotulo)}</span>
      <div class="bar-list-track"><div class="bar-list-fill" style="width:${Math.round(l.totalSegundos / max * 100)}%; ${l.cor ? `background:${l.cor};` : ''}"></div></div>
      <span class="bar-list-val">${formatarDuracaoLonga(l.totalSegundos)}</span>
    </div>`).join('');
}

function renderKpis(kpis) {
  const itens = [
    { valor: formatarDuracaoLonga(kpis.tempoTotalSegundos), rotulo: 'Tempo total' },
    { valor: formatarDuracaoLonga(kpis.tempoHojeSegundos), rotulo: 'Hoje' },
    { valor: formatarDuracaoLonga(kpis.tempoSemanaSegundos), rotulo: 'Esta semana' },
    { valor: formatarDuracaoLonga(kpis.tempoMesSegundos), rotulo: 'Este mês' },
    { valor: formatarDuracaoLonga(kpis.maiorSessaoSegundos), rotulo: 'Maior sessão' },
    { valor: formatarDuracaoLonga(kpis.menorSessaoSegundos), rotulo: 'Menor sessão' },
    { valor: formatarDuracaoLonga(kpis.tempoMedioSegundos), rotulo: 'Média por sessão' },
    { valor: kpis.numeroSessoes, rotulo: 'Sessões' },
    { valor: kpis.numeroMaterias, rotulo: 'Matérias' },
    { valor: kpis.numeroConteudos, rotulo: 'Conteúdos' },
    { valor: kpis.sequenciaDiasAtual, rotulo: 'Sequência atual' },
    { valor: kpis.recordeSequenciaDias, rotulo: 'Recorde de sequência' }
  ];
  document.getElementById('kpiRow').innerHTML = itens.map(i => `<div class="dash-kpi"><div class="valor">${i.valor}</div><div class="rotulo">${i.rotulo}</div></div>`).join('');
}

function renderPizzaConteudo() {
  const materiaId = document.getElementById('filtroPizzaMateria').value;
  const el = document.getElementById('graficoPizzaConteudo');
  if (!materiaId) { el.innerHTML = '<p class="vazio-msg">Selecione uma matéria acima para ver a distribuição por conteúdo.</p>'; return; }
  const fatias = dadosEstatisticas.porConteudo
    .filter(c => c.materiaId === materiaId)
    .map(c => ({ rotulo: c.nome, valor: c.totalSegundos, cor: c.cor }));
  el.innerHTML = svgPizzaMultipla(fatias);
}

function renderTudo() {
  const d = dadosEstatisticas;
  renderKpis(d.kpis);

  const pontosDia = d.porDia.map(x => ({ x: x.data.slice(5), y: Math.round(x.totalSegundos / 60), tooltip: `${x.data}: ${formatarDuracaoLonga(x.totalSegundos)}` }));
  document.getElementById('graficoPorDia').innerHTML = svgLinhaValores(pontosDia, { formatarEixoY: v => v + 'm' });

  const pontosSemana = d.porSemana.map(x => ({ x: x.semana, y: Math.round(x.totalSegundos / 60), tooltip: `${x.semana}: ${formatarDuracaoLonga(x.totalSegundos)}` }));
  document.getElementById('graficoPorSemana').innerHTML = svgLinhaValores(pontosSemana, { formatarEixoY: v => v + 'm' });

  const pontosMes = d.porMes.map(x => ({ x: x.mes, y: Math.round(x.totalSegundos / 60), tooltip: `${x.mes}: ${formatarDuracaoLonga(x.totalSegundos)}` }));
  document.getElementById('graficoPorMes').innerHTML = svgLinhaValores(pontosMes, { formatarEixoY: v => v + 'm' });

  const pontosAcum = d.evolucaoAcumulada.map(x => ({ x: x.data.slice(5), y: Math.round(x.totalSegundosAcumulado / 60), tooltip: `${x.data}: ${formatarDuracaoLonga(x.totalSegundosAcumulado)} acumulados` }));
  document.getElementById('graficoAcumulado').innerHTML = svgLinhaValores(pontosAcum, { formatarEixoY: v => v + 'm' });

  document.getElementById('graficoPizzaMateria').innerHTML = svgPizzaMultipla(d.porMateria.map(m => ({ rotulo: m.nome, valor: m.totalSegundos, cor: m.cor })));

  const sel = document.getElementById('filtroPizzaMateria');
  if (!sel.dataset.populado) {
    sel.innerHTML = '<option value="">Selecione uma matéria</option>' + d.porMateria.map(m => `<option value="${m.materiaId}">${escapeHtml(m.nome)}</option>`).join('');
    sel.dataset.populado = '1';
  }
  renderPizzaConteudo();

  document.getElementById('graficoBarrasConteudo').innerHTML = renderBarrasTempo(d.porConteudo.map(c => ({ rotulo: c.nome, totalSegundos: c.totalSegundos, cor: c.cor })));

  document.getElementById('graficoHeatmap').innerHTML = heatmapCalendario(d.porDia.map(x => ({ data: x.data, valor: x.totalSegundos })));

  document.getElementById('graficoPorHora').innerHTML = renderBarrasTempo(d.porHoraDoDia.map(h => ({ rotulo: `${h.hora}h`, totalSegundos: h.totalSegundos })));

  document.getElementById('graficoPorDiaSemana').innerHTML = renderBarrasTempo(d.porDiaDaSemana.map(ds => ({ rotulo: ds.nome, totalSegundos: ds.mediaSegundos })));
}

async function carregar() {
  const res = await fetch('/api/estudos/estatisticas', { headers: authHeaders() });
  if (!res.ok) return;
  dadosEstatisticas = await res.json();
  renderTudo();
}

document.getElementById('filtroPizzaMateria').addEventListener('change', renderPizzaConteudo);

carregar();

DeverRealtime.escutar({
  'sessao-estudo-finalizada': d => { if (d.alunoId === DeverRealtime.meuUserId()) carregar(); }
});
