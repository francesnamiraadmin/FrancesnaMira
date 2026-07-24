// =====================================================================
// ESTATÍSTICAS — KPIs, pizza corretas/incorretas (filtrável por conjunto
// específico ou toda a plataforma), barras por categoria, evolução ao
// longo do tempo e histórico de tentativas. Consome GET /api/questoes/estatisticas
// (payload único — ver backend/routes/questoes.js). svgPizza/svgLinha/barList
// vêm de js/chartsSvg.js, MATERIAS_LABELS de js/questoesRender.js.
// =====================================================================

function authHeaders() {
  return { Authorization: 'Bearer ' + localStorage.getItem('token') };
}

let dadosGlobais = null;

function formatarTempo(seg) {
  if (!seg) return '—';
  const m = Math.round(seg / 60);
  return `${m} min`;
}

function renderKPIs(kpis) {
  const itens = [
    { valor: kpis.conjuntosConcluidos, rotulo: 'Conjuntos concluídos' },
    { valor: kpis.conjuntosEmAndamento, rotulo: 'Em andamento' },
    { valor: kpis.conjuntosRefeitos, rotulo: 'Refeitos' },
    { valor: kpis.mediaPercentualAcertos !== null ? kpis.mediaPercentualAcertos + '%' : '—', rotulo: 'Média de acertos' },
    { valor: kpis.maiorNota !== null ? kpis.maiorNota + '%' : '—', rotulo: 'Maior nota' },
    { valor: kpis.menorNota !== null ? kpis.menorNota + '%' : '—', rotulo: 'Menor nota' },
    { valor: formatarTempo(kpis.tempoMedioSegundos), rotulo: 'Tempo médio por conjunto' },
    { valor: `${kpis.sequenciaDiasConsecutivos}<img src="img/icones/fire.svg" alt="" style="width:0.8em;height:0.8em;vertical-align:-0.05em;">`, rotulo: 'Sequência de dias' },
    { valor: kpis.tamanhoCaderno, rotulo: 'No Caderno de Revisão' }
  ];
  document.getElementById('kpiRow').innerHTML = itens.map(i =>
    `<div class="dash-kpi"><div class="valor">${i.valor}</div><div class="rotulo">${i.rotulo}</div></div>`
  ).join('');
}

function respostasFiltradas() {
  const conjuntoId = document.getElementById('filtroConjunto').value;
  return conjuntoId ? dadosGlobais.respostas.filter(r => r.conjuntoId === conjuntoId) : dadosGlobais.respostas;
}

function renderPizza() {
  const resp = respostasFiltradas();
  const corretas = resp.filter(r => r.correta).length;
  document.getElementById('pizzaWrap').innerHTML = svgPizza(corretas, resp.length - corretas);
}

function renderBarrasCategoria() {
  const resp = respostasFiltradas();
  const porMateria = {};
  resp.forEach(r => {
    if (!r.materia) return;
    if (!porMateria[r.materia]) porMateria[r.materia] = { total: 0, corretas: 0 };
    porMateria[r.materia].total++;
    if (r.correta) porMateria[r.materia].corretas++;
  });
  const linhas = Object.entries(porMateria).map(([materia, v]) => ({
    rotulo: MATERIAS_LABELS[materia] || materia, total: v.total, taxa: Math.round((v.corretas / v.total) * 100)
  }));
  document.getElementById('barrasCategoria').innerHTML = linhas.length ? barList(linhas) : '<p class="stats-vazio">Sem dados suficientes.</p>';
}

function renderEvolucao() {
  const evo = dadosGlobais.evolucao;
  document.getElementById('evolucaoWrap').innerHTML = evo.length
    ? svgLinha(evo.map(e => ({ x: e.data.slice(5), y: e.percentualMedio, tooltip: `${e.data}: ${e.percentualMedio}% (${e.quantidade} tentativa${e.quantidade > 1 ? 's' : ''})` })))
    : '<p class="stats-vazio">Ainda não há dados de evolução.</p>';
}

function renderHistorico() {
  const tentativas = dadosGlobais.tentativas;
  document.getElementById('historicoTabela').innerHTML = tentativas.length
    ? tentativas.map(t => `
      <div class="dash-atividade-item">
        <span>${t.conjuntoNome} — ${t.numero}ª tentativa — ${new Date(t.finalizadaEm).toLocaleDateString('pt-BR')}</span>
        <span>${t.totalCorretas}/${t.totalQuestoes} (${t.percentualAcertos}%) · ${formatarTempo(t.tempoGastoSegundos)}</span>
      </div>
    `).join('')
    : '<p class="stats-vazio">Você ainda não concluiu nenhum conjunto.</p>';
}

function initFiltroConjunto() {
  const conjuntosUnicos = new Map();
  dadosGlobais.tentativas.forEach(t => { if (!conjuntosUnicos.has(t.conjuntoId)) conjuntosUnicos.set(t.conjuntoId, t.conjuntoNome); });
  const sel = document.getElementById('filtroConjunto');
  sel.insertAdjacentHTML('beforeend', [...conjuntosUnicos.entries()].map(([id, nome]) => `<option value="${id}">${nome}</option>`).join(''));
  sel.addEventListener('change', () => { renderPizza(); renderBarrasCategoria(); });
}

async function carregarEstatisticas() {
  try {
    const url = window.CursoContexto ? window.CursoContexto.urlComCurso('/api/questoes/estatisticas') : '/api/questoes/estatisticas';
    const res = await fetch(url, { headers: authHeaders() });
    if (!res.ok) throw new Error('Erro ao carregar estatísticas.');
    dadosGlobais = await res.json();
    renderKPIs(dadosGlobais.kpis);
    initFiltroConjunto();
    renderPizza();
    renderBarrasCategoria();
    renderEvolucao();
    renderHistorico();
  } catch (err) {
    document.getElementById('kpiRow').innerHTML = '<p class="stats-vazio">Erro ao carregar estatísticas.</p>';
  }
}

carregarEstatisticas();
