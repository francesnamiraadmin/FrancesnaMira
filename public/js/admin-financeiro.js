// ===================== BALANÇO FINANCEIRO (admin) =====================
// Busca todas as transações uma vez em /api/financeiro/transacoes (planos + matrículas,
// já normalizadas no backend) e faz toda a análise no navegador: trocar período, curso
// ou agrupamento só recalcula e redesenha, sem nova ida ao servidor.
(function () {
  const token = localStorage.getItem('token');

  const METODOS = { pix: 'Pix', cartao_credito: 'Cartão de crédito', cartao_debito: 'Cartão de débito', boleto: 'Boleto' };
  const STATUS = { aprovado: 'Aprovado', pendente: 'Pendente', rejeitado: 'Recusado', cancelado: 'Cancelado' };
  const ORIGENS = { plano: 'Plano', matricula: 'Matrícula' };
  const DIAS_CURTOS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
  const DIAS_LONGOS = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];
  const POR_PAGINA = 25;
  const MAX_INTERVALOS = 400;

  const estado = {
    dados: null,
    periodo: '30d', de: null, ate: null, grupo: 'dia',
    curso: '', metodo: '', origem: '',
    busca: '', status: '', ordem: 'data', direcao: -1, pagina: 0
  };
  const graficos = {};

  // ---------- utilidades ----------
  const moeda = v => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const moedaCurta = v => 'R$ ' + (v || 0).toLocaleString('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });
  const inteiro = v => (v || 0).toLocaleString('pt-BR');
  const pct = v => (isFinite(v) ? v : 0).toLocaleString('pt-BR', { style: 'percent', maximumFractionDigits: 1 });
  const dataHora = d => new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const dataCurta = d => new Date(d).toLocaleDateString('pt-BR');
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cssVar = nome => getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
  const inicioDoDia = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const fimDoDia = d => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
  const chaveAluno = t => t.aluno.id || (t.aluno.email || '').toLowerCase() || t.aluno.nome;
  // getDay() começa no domingo; a análise usa semana de segunda a domingo.
  const diaSemana = d => (new Date(d).getDay() + 6) % 7;

  // ---------- período ----------
  function intervalo() {
    const hoje = new Date();
    switch (estado.periodo) {
      case 'hoje': return { inicio: inicioDoDia(hoje), fim: fimDoDia(hoje) };
      case '7d': { const i = inicioDoDia(hoje); i.setDate(i.getDate() - 6); return { inicio: i, fim: fimDoDia(hoje) }; }
      case '30d': { const i = inicioDoDia(hoje); i.setDate(i.getDate() - 29); return { inicio: i, fim: fimDoDia(hoje) }; }
      case 'mes': return { inicio: new Date(hoje.getFullYear(), hoje.getMonth(), 1), fim: fimDoDia(hoje) };
      case 'ano': return { inicio: new Date(hoje.getFullYear(), 0, 1), fim: fimDoDia(hoje) };
      case 'custom': {
        const inicio = estado.de ? inicioDoDia(estado.de + 'T00:00') : inicioDoDia(hoje);
        const fim = estado.ate ? fimDoDia(estado.ate + 'T00:00') : fimDoDia(hoje);
        return inicio <= fim ? { inicio, fim } : { inicio: inicioDoDia(fim), fim: fimDoDia(inicio) };
      }
      default: { // tudo
        const datas = [...estado.dados.transacoes.map(t => new Date(t.data)), ...estado.dados.cadastros.map(d => new Date(d))];
        const menor = datas.length ? new Date(Math.min(...datas)) : hoje;
        return { inicio: inicioDoDia(menor), fim: fimDoDia(hoje), tudo: true };
      }
    }
  }
  function intervaloAnterior({ inicio, fim }) {
    const duracao = fim - inicio;
    return { inicio: new Date(inicio - duracao - 1), fim: new Date(inicio - 1) };
  }
  const dentro = (d, { inicio, fim }) => { const t = new Date(d); return t >= inicio && t <= fim; };

  // Filtros que não são de data (curso, pagamento, origem).
  function baseFiltrada() {
    return estado.dados.transacoes.filter(t =>
      (!estado.curso || t.curso === estado.curso) &&
      (!estado.metodo || t.metodo === estado.metodo) &&
      (!estado.origem || t.origem === estado.origem));
  }

  // ---------- intervalos (dia / semana / mês / ano) ----------
  function inicioIntervalo(d, grupo) {
    const x = inicioDoDia(d);
    if (grupo === 'semana') x.setDate(x.getDate() - diaSemana(x));
    else if (grupo === 'mes') x.setDate(1);
    else if (grupo === 'ano') { x.setMonth(0); x.setDate(1); }
    return x;
  }
  function proximoIntervalo(d, grupo) {
    const x = new Date(d);
    if (grupo === 'dia') x.setDate(x.getDate() + 1);
    else if (grupo === 'semana') x.setDate(x.getDate() + 7);
    else if (grupo === 'mes') x.setMonth(x.getMonth() + 1);
    else x.setFullYear(x.getFullYear() + 1);
    return x;
  }
  function rotuloIntervalo(d, grupo) {
    if (grupo === 'dia') return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    if (grupo === 'semana') return 'Sem. ' + d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    if (grupo === 'mes') return d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', '');
    return String(d.getFullYear());
  }
  // Agrupamento pedido, subindo de nível se geraria intervalos demais (ex.: "Tudo" por dia).
  function grupoEfetivo(periodo) {
    const ordem = ['dia', 'semana', 'mes', 'ano'];
    let g = estado.grupo;
    const dias = (periodo.fim - periodo.inicio) / 86400000;
    const aprox = { dia: 1, semana: 7, mes: 30, ano: 365 };
    while (dias / aprox[g] > MAX_INTERVALOS && g !== 'ano') g = ordem[ordem.indexOf(g) + 1];
    return g;
  }
  function montarIntervalos(periodo, grupo) {
    const lista = [];
    for (let d = inicioIntervalo(periodo.inicio, grupo); d <= periodo.fim; d = proximoIntervalo(d, grupo)) {
      lista.push({ chave: d.getTime(), rotulo: rotuloIntervalo(d, grupo) });
    }
    return lista;
  }

  // ---------- métricas ----------
  function resumo(lista, periodo) {
    const aprovadas = lista.filter(t => t.status === 'aprovado');
    const aReceber = lista.filter(t => t.status === 'pendente' && !t.pendenciaAntiga);
    const antigas = lista.filter(t => t.status === 'pendente' && t.pendenciaAntiga);
    const perdidas = lista.filter(t => t.status === 'rejeitado' || t.status === 'cancelado');
    const soma = arr => arr.reduce((s, t) => s + (t.valor || 0), 0);
    const recebido = soma(aprovadas);
    return {
      aprovadas, aReceber, antigas, perdidas, recebido,
      valorReceber: soma(aReceber), valorAntigas: soma(antigas), valorPerdido: soma(perdidas),
      ticket: aprovadas.length ? recebido / aprovadas.length : 0,
      pagantes: new Set(aprovadas.map(chaveAluno)).size,
      taxaAprovacao: (aprovadas.length + perdidas.length) ? aprovadas.length / (aprovadas.length + perdidas.length) : 0,
      cadastros: estado.dados.cadastros.filter(d => dentro(d, periodo)).length,
      descontos: aprovadas.reduce((s, t) => s + (t.desconto || 0), 0)
    };
  }

  function variacao(atual, anterior, tudo) {
    if (tudo) return '';
    if (!anterior) return atual ? '<span class="variacao sobe">novo</span> vs. período anterior' : 'sem movimento no período anterior';
    const v = (atual - anterior) / anterior;
    const cls = v >= 0 ? 'sobe' : 'desce';
    return `<span class="variacao ${cls}">${v >= 0 ? '▲' : '▼'} ${pct(Math.abs(v))}</span> vs. período anterior`;
  }

  // ---------- render: KPIs ----------
  function renderKpis(r, ant, tudo) {
    const kpi = (cor, rotulo, valor, detalhe) =>
      `<div class="kpi" style="--kpi-cor:${cor}"><div class="rotulo">${rotulo}</div><div class="valor">${valor}</div><div class="detalhe">${detalhe}</div></div>`;
    document.getElementById('kpis').innerHTML = [
      kpi('var(--verde)', 'Recebido', moeda(r.recebido), variacao(r.recebido, ant.recebido, tudo)),
      kpi('var(--amarelo)', 'A receber', moeda(r.valorReceber), `${inteiro(r.aReceber.length)} Pix/boleto aguardando pagamento`),
      kpi('var(--azul)', 'Compras aprovadas', inteiro(r.aprovadas.length), variacao(r.aprovadas.length, ant.aprovadas.length, tudo)),
      kpi('var(--azul)', 'Ticket médio', moeda(r.ticket), variacao(r.ticket, ant.ticket, tudo)),
      kpi('var(--roxo)', 'Alunos pagantes', inteiro(r.pagantes), variacao(r.pagantes, ant.pagantes, tudo)),
      kpi('var(--roxo)', 'Novos cadastros', inteiro(r.cadastros), variacao(r.cadastros, ant.cadastros, tudo)),
      kpi('var(--verde)', 'Taxa de aprovação', pct(r.taxaAprovacao), `${inteiro(r.perdidas.length)} recusadas/canceladas (${moeda(r.valorPerdido)})`),
      kpi('var(--cinza-400)', 'Pendências expiradas', moeda(r.valorAntigas), `${inteiro(r.antigas.length)} pendentes há mais de 7 dias`)
    ].join('');
  }

  // ---------- gráficos (Chart.js) ----------
  function temaGraficos() {
    const texto = cssVar('--cinza-600'), grade = cssVar('--cinza-200');
    Chart.defaults.color = texto;
    Chart.defaults.borderColor = grade;
    Chart.defaults.font.family = "'Poppins', sans-serif";
    Chart.defaults.font.size = 11;
    Chart.defaults.plugins.legend.labels.boxWidth = 12;
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.maintainAspectRatio = false;
  }
  function desenhar(id, config) {
    if (graficos[id]) graficos[id].destroy();
    graficos[id] = new Chart(document.getElementById(id), config);
  }
  const eixoMoeda = { ticks: { callback: v => moedaCurta(v) }, beginAtZero: true };
  const tooltipMoeda = { callbacks: { label: c => `${c.dataset.label}: ${moeda(c.parsed.y ?? c.parsed.x ?? c.parsed)}` } };

  function renderTempo(lista, periodo) {
    const grupo = grupoEfetivo(periodo);
    const intervalos = montarIntervalos(periodo, grupo);
    const idx = new Map(intervalos.map((b, i) => [b.chave, i]));
    const recebido = new Array(intervalos.length).fill(0);
    const receber = new Array(intervalos.length).fill(0);
    const qtd = new Array(intervalos.length).fill(0);
    lista.forEach(t => {
      const i = idx.get(inicioIntervalo(t.data, grupo).getTime());
      if (i === undefined) return;
      if (t.status === 'aprovado') { recebido[i] += t.valor; qtd[i]++; }
      else if (t.status === 'pendente' && !t.pendenciaAntiga) receber[i] += t.valor;
    });
    const nomes = { dia: 'dia', semana: 'semana', mes: 'mês', ano: 'ano' };
    document.getElementById('dicaTempo').textContent =
      `Valor recebido e a receber por ${nomes[grupo]}, com a quantidade de compras aprovadas.` +
      (grupo !== estado.grupo ? ` (Agrupado por ${nomes[grupo]} porque o período é longo demais para ${nomes[estado.grupo]}.)` : '');
    desenhar('gTempo', {
      data: {
        labels: intervalos.map(b => b.rotulo),
        datasets: [
          { type: 'bar', label: 'Recebido', data: recebido, backgroundColor: cssVar('--serie-recebido'), stack: 'v', borderRadius: 4, yAxisID: 'y' },
          { type: 'bar', label: 'A receber', data: receber, backgroundColor: cssVar('--serie-receber'), stack: 'v', borderRadius: 4, yAxisID: 'y' },
          { type: 'line', label: 'Compras aprovadas', data: qtd, borderColor: cssVar('--serie-qtd'), backgroundColor: cssVar('--serie-qtd'), tension: 0.3, pointRadius: intervalos.length > 60 ? 0 : 3, yAxisID: 'y2' }
        ]
      },
      options: {
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: { stacked: true, grid: { display: false } },
          y: { ...eixoMoeda, stacked: true },
          y2: { position: 'right', beginAtZero: true, grid: { display: false }, ticks: { precision: 0 } }
        },
        plugins: { tooltip: { callbacks: { label: c => c.dataset.yAxisID === 'y2' ? `${c.dataset.label}: ${c.parsed.y}` : `${c.dataset.label}: ${moeda(c.parsed.y)}` } } }
      }
    });
    return { grupo, intervalos, idx };
  }

  function agrupar(lista, chave) {
    const mapa = new Map();
    lista.forEach(t => {
      const k = chave(t);
      const g = mapa.get(k) || { chave: k, valor: 0, qtd: 0, alunos: new Set() };
      g.valor += t.valor || 0; g.qtd++; g.alunos.add(chaveAluno(t));
      mapa.set(k, g);
    });
    return [...mapa.values()];
  }

  function renderCursos(aprovadas) {
    const grupos = agrupar(aprovadas, t => t.curso).sort((a, b) => b.valor - a.valor);
    const destaque = document.getElementById('destaqueCurso');
    if (!grupos.length) {
      destaque.innerHTML = '';
    } else {
      const maisInscritos = [...grupos].sort((a, b) => b.alunos.size - a.alunos.size || b.valor - a.valor)[0];
      const maisReceita = grupos[0];
      destaque.innerHTML = `<div class="destaque">
        <div class="medalha">${esc(maisInscritos.chave)}</div>
        <div class="txt"><strong>Curso com mais inscritos: ${esc(maisInscritos.chave)}</strong><br>
        ${inteiro(maisInscritos.alunos.size)} aluno(s) · ${moeda(maisInscritos.valor)}.
        ${maisReceita.chave !== maisInscritos.chave ? `Maior faturamento: <strong>${esc(maisReceita.chave)}</strong> (${moeda(maisReceita.valor)}).` : 'Também é o de maior faturamento.'}</div>
      </div>`;
    }
    desenhar('gCursos', {
      type: 'bar',
      data: {
        labels: grupos.map(g => g.chave),
        datasets: [
          { label: 'Receita', data: grupos.map(g => g.valor), backgroundColor: cssVar('--serie-recebido'), borderRadius: 4, xAxisID: 'x' },
          { label: 'Alunos inscritos', data: grupos.map(g => g.alunos.size), backgroundColor: cssVar('--serie-qtd'), borderRadius: 4, xAxisID: 'x2' }
        ]
      },
      options: {
        indexAxis: 'y',
        scales: {
          x: { ...eixoMoeda, position: 'bottom' },
          x2: { position: 'top', beginAtZero: true, grid: { display: false }, ticks: { precision: 0 } },
          y: { grid: { display: false } }
        },
        plugins: { tooltip: { callbacks: { label: c => c.dataset.xAxisID === 'x2' ? `Alunos inscritos: ${c.parsed.x}` : `Receita: ${moeda(c.parsed.x)}` } } }
      }
    });
  }

  function listaRanking(alvo, itens, vazio) {
    const el = document.getElementById(alvo);
    if (!itens.length) { el.innerHTML = `<li class="vazio" style="display:block;">${vazio}</li>`; return; }
    const max = Math.max(...itens.map(i => i.barra)) || 1;
    el.innerHTML = itens.map(i => `<li>
      <span>${i.titulo}${i.sub ? `<br><span class="sub">${i.sub}</span>` : ''}</span>
      <span class="num">${i.valor}</span>
      <span class="barra"><span style="width:${Math.max(2, (i.barra / max) * 100)}%"></span></span>
    </li>`).join('');
  }

  function renderProdutos(aprovadas) {
    const total = aprovadas.reduce((s, t) => s + t.valor, 0) || 1;
    const itens = agrupar(aprovadas, t => t.produto).sort((a, b) => b.valor - a.valor).map(g => ({
      titulo: esc(g.chave),
      sub: `${inteiro(g.qtd)} venda(s) · ${inteiro(g.alunos.size)} aluno(s) · ${pct(g.valor / total)} da receita`,
      valor: moeda(g.valor), barra: g.valor
    }));
    listaRanking('rankProdutos', itens, 'Nenhuma venda aprovada no período.');
  }

  function renderMetodos(lista, aprovadas) {
    const cores = { pix: '#10b981', cartao_credito: '#3b82f6', cartao_debito: '#8b5cf6', boleto: '#f59e0b' };
    const grupos = agrupar(aprovadas, t => t.metodo).sort((a, b) => b.valor - a.valor);
    const total = grupos.reduce((s, g) => s + g.valor, 0) || 1;
    desenhar('gMetodos', {
      type: 'doughnut',
      data: {
        labels: grupos.map(g => METODOS[g.chave] || g.chave),
        datasets: [{ data: grupos.map(g => g.valor), backgroundColor: grupos.map(g => cores[g.chave] || '#94a3b8'), borderColor: cssVar('--branco'), borderWidth: 2 }]
      },
      options: { cutout: '62%', plugins: { legend: { position: 'right' }, tooltip: { callbacks: { label: c => `${c.label}: ${moeda(c.parsed)} (${pct(c.parsed / total)})` } } } }
    });
    listaRanking('rankMetodos', grupos.map(g => ({
      titulo: METODOS[g.chave] || esc(g.chave), sub: `${inteiro(g.qtd)} compra(s) · ticket ${moeda(g.valor / g.qtd)}`,
      valor: pct(g.valor / total), barra: g.valor
    })), 'Sem vendas aprovadas.');

    // aprovação por método — todas as tentativas do período
    const metodos = Object.keys(METODOS);
    const contar = (m, filtro) => lista.filter(t => t.metodo === m && filtro(t)).length;
    desenhar('gAprovacao', {
      type: 'bar',
      data: {
        labels: metodos.map(m => METODOS[m]),
        datasets: [
          { label: 'Aprovadas', data: metodos.map(m => contar(m, t => t.status === 'aprovado')), backgroundColor: cssVar('--serie-recebido') },
          { label: 'Pendentes', data: metodos.map(m => contar(m, t => t.status === 'pendente')), backgroundColor: cssVar('--serie-receber') },
          { label: 'Recusadas/canceladas', data: metodos.map(m => contar(m, t => t.status === 'rejeitado' || t.status === 'cancelado')), backgroundColor: cssVar('--vermelho') }
        ]
      },
      options: { indexAxis: 'y', scales: { x: { stacked: true, beginAtZero: true, ticks: { precision: 0 } }, y: { stacked: true, grid: { display: false } } } }
    });

    // parcelamento no crédito
    const credito = aprovadas.filter(t => t.metodo === 'cartao_credito');
    const parcelas = Array.from({ length: 12 }, (_, i) => credito.filter(t => (t.parcelas || 1) === i + 1).length);
    const ultima = Math.max(3, parcelas.reduce((u, v, i) => (v ? i + 1 : u), 0));
    desenhar('gParcelas', {
      type: 'bar',
      data: { labels: parcelas.slice(0, ultima).map((_, i) => `${i + 1}x`), datasets: [{ label: 'Compras', data: parcelas.slice(0, ultima), backgroundColor: '#3b82f6', borderRadius: 4 }] },
      options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { grid: { display: false } } } }
    });
  }

  function renderHorarios(aprovadas) {
    // mapa de calor dia × hora (quantidade de compras)
    const matriz = Array.from({ length: 7 }, () => new Array(24).fill(0));
    aprovadas.forEach(t => { const d = new Date(t.data); matriz[diaSemana(d)][d.getHours()]++; });
    const max = Math.max(1, ...matriz.flat());
    let html = '<div></div>' + Array.from({ length: 24 }, (_, h) => `<div class="cab">${h % 3 === 0 ? h + 'h' : ''}</div>`).join('');
    matriz.forEach((linha, d) => {
      html += `<div class="dia">${DIAS_CURTOS[d]}</div>`;
      linha.forEach((n, h) => {
        const alfa = n ? 0.15 + 0.85 * (n / max) : 0;
        const fundo = n ? `background: rgba(5,150,105,${alfa.toFixed(2)});` : '';
        html += `<div class="cel" style="${fundo}" title="${DIAS_LONGOS[d]}, ${h}h–${h + 1}h: ${n} compra(s)"></div>`;
      });
    });
    document.getElementById('mapaCalor').innerHTML = html;
    let pico = null;
    matriz.forEach((linha, d) => linha.forEach((n, h) => { if (n && (!pico || n > pico.n)) pico = { d, h, n }; }));
    document.getElementById('picoTexto').textContent = pico ? `Pico: ${DIAS_LONGOS[pico.d]} às ${pico.h}h (${pico.n} compra(s))` : 'Sem compras aprovadas no período';

    const porHora = new Array(24).fill(0), porDia = new Array(7).fill(0);
    aprovadas.forEach(t => { const d = new Date(t.data); porHora[d.getHours()] += t.valor; porDia[diaSemana(d)] += t.valor; });
    const barras = (id, labels, dados) => desenhar(id, {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Receita', data: dados, backgroundColor: cssVar('--serie-recebido'), borderRadius: 4 }] },
      options: { plugins: { legend: { display: false }, tooltip: tooltipMoeda }, scales: { y: eixoMoeda, x: { grid: { display: false } } } }
    });
    barras('gHoras', Array.from({ length: 24 }, (_, h) => h + 'h'), porHora);
    barras('gDias', DIAS_CURTOS, porDia);
  }

  function renderAlunos(base, periodo, tempo) {
    const { grupo, intervalos, idx } = tempo;
    const cadastros = new Array(intervalos.length).fill(0);
    estado.dados.cadastros.forEach(d => {
      if (!dentro(d, periodo)) return;
      const i = idx.get(inicioIntervalo(d, grupo).getTime());
      if (i !== undefined) cadastros[i]++;
    });
    // primeira compra aprovada de cada aluno (em todo o histórico, respeitando curso/pagamento/origem)
    const primeira = new Map();
    base.filter(t => t.status === 'aprovado').forEach(t => {
      const k = chaveAluno(t), d = new Date(t.data);
      if (!primeira.has(k) || d < primeira.get(k)) primeira.set(k, d);
    });
    const novosPagantes = new Array(intervalos.length).fill(0);
    primeira.forEach(d => {
      if (!dentro(d, periodo)) return;
      const i = idx.get(inicioIntervalo(d, grupo).getTime());
      if (i !== undefined) novosPagantes[i]++;
    });
    desenhar('gAlunos', {
      data: {
        labels: intervalos.map(b => b.rotulo),
        datasets: [
          { type: 'bar', label: 'Novos cadastros', data: cadastros, backgroundColor: cssVar('--azul-claro'), borderColor: cssVar('--serie-qtd'), borderWidth: 1, borderRadius: 4 },
          { type: 'line', label: 'Primeira compra', data: novosPagantes, borderColor: cssVar('--serie-recebido'), backgroundColor: cssVar('--serie-recebido'), tension: 0.3, pointRadius: intervalos.length > 60 ? 0 : 3 }
        ]
      },
      options: { interaction: { mode: 'index', intersect: false }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { grid: { display: false } } } }
    });
  }

  function renderTopAlunos(aprovadas) {
    const mapa = new Map();
    aprovadas.forEach(t => {
      const k = chaveAluno(t);
      const g = mapa.get(k) || { nome: t.aluno.nome, email: t.aluno.email, valor: 0, qtd: 0, ultima: null, cursos: new Set() };
      g.valor += t.valor; g.qtd++; g.cursos.add(t.curso);
      if (!g.ultima || new Date(t.data) > g.ultima) g.ultima = new Date(t.data);
      mapa.set(k, g);
    });
    const itens = [...mapa.values()].sort((a, b) => b.valor - a.valor).slice(0, 10).map(g => ({
      titulo: `<strong>${esc(g.nome)}</strong>`,
      sub: `${esc(g.email)} · ${inteiro(g.qtd)} compra(s) · ${esc([...g.cursos].join(', '))} · última em ${dataCurta(g.ultima)}`,
      valor: moeda(g.valor), barra: g.valor
    }));
    listaRanking('rankAlunos', itens, 'Nenhum pagamento aprovado no período.');
  }

  function renderReceber(lista) {
    const pendentes = lista.filter(t => t.status === 'pendente')
      .sort((a, b) => (a.pendenciaAntiga - b.pendenciaAntiga) || (new Date(b.data) - new Date(a.data)));
    const corpo = document.getElementById('corpoReceber');
    if (!pendentes.length) { corpo.innerHTML = '<tr><td colspan="7" class="vazio">Nada pendente no período.</td></tr>'; return; }
    corpo.innerHTML = pendentes.slice(0, 50).map(t => `<tr>
      <td>${dataHora(t.data)}</td>
      <td>${esc(t.aluno.nome)}<span class="aluno-email">${esc(t.aluno.email)}</span></td>
      <td>${esc(t.curso)}</td><td>${esc(t.produto)}</td>
      <td>${METODOS[t.metodo] || esc(t.metodo)}</td>
      <td class="num">${moeda(t.valor)}</td>
      <td>${t.pendenciaAntiga ? '<span class="pill antiga">Provavelmente expirado</span>' : '<span class="pill pendente">Aguardando pagamento</span>'}</td>
    </tr>`).join('') + (pendentes.length > 50 ? `<tr><td colspan="7" class="vazio">Mostrando 50 de ${inteiro(pendentes.length)} pendências — use a tabela de transações abaixo para ver todas.</td></tr>` : '');
  }

  // ---------- tabela de transações ----------
  let linhasTabela = [];
  function linhasFiltradas(lista) {
    const termo = estado.busca.trim().toLowerCase();
    const valorOrdem = {
      data: t => new Date(t.data).getTime(), valor: t => t.valor,
      aluno: t => (t.aluno.nome || '').toLowerCase(), curso: t => t.curso.toLowerCase(),
      metodo: t => t.metodo, status: t => t.status
    }[estado.ordem];
    return lista
      .filter(t => !estado.status || t.status === estado.status)
      .filter(t => !termo || [t.aluno.nome, t.aluno.email, t.curso, t.produto, t.mercadoPagoId].some(v => String(v || '').toLowerCase().includes(termo)))
      .sort((a, b) => { const x = valorOrdem(a), y = valorOrdem(b); return (x > y ? 1 : x < y ? -1 : 0) * estado.direcao; });
  }
  function renderTabela() {
    const total = linhasTabela.length;
    const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
    estado.pagina = Math.min(estado.pagina, paginas - 1);
    const fatia = linhasTabela.slice(estado.pagina * POR_PAGINA, (estado.pagina + 1) * POR_PAGINA);
    const corpo = document.getElementById('corpoTransacoes');
    corpo.innerHTML = fatia.length ? fatia.map(t => {
      const pill = t.status === 'pendente' && t.pendenciaAntiga ? 'antiga' : t.status;
      const parcelas = t.metodo === 'cartao_credito' && t.parcelas > 1 ? ` · ${t.parcelas}x` : '';
      const cupom = t.cupom ? `<span class="aluno-email">cupom ${esc(t.cupom)} (−${moeda(t.desconto)})</span>` : '';
      return `<tr>
        <td>${dataHora(t.data)}</td>
        <td>${esc(t.aluno.nome)}<span class="aluno-email">${esc(t.aluno.email)}</span></td>
        <td>${esc(t.curso)}</td>
        <td>${esc(t.produto)}${cupom}</td>
        <td><span class="pill origem">${ORIGENS[t.origem]}</span></td>
        <td>${METODOS[t.metodo] || esc(t.metodo)}${parcelas}</td>
        <td class="num">${moeda(t.valor)}</td>
        <td><span class="pill ${pill}">${STATUS[t.status] || esc(t.status)}${t.status === 'pendente' && t.pendenciaAntiga ? ' (antiga)' : ''}</span></td>
        <td style="font-size:0.74rem; color:var(--cinza-600);">${esc(t.mercadoPagoId || '—')}</td>
      </tr>`;
    }).join('') : '<tr><td colspan="9" class="vazio">Nenhuma transação encontrada.</td></tr>';
    const soma = linhasTabela.filter(t => t.status === 'aprovado').reduce((s, t) => s + t.valor, 0);
    document.getElementById('infoPagina').textContent =
      `${inteiro(total)} transação(ões) · ${moeda(soma)} aprovados · página ${estado.pagina + 1} de ${paginas}`;
    document.getElementById('pagAnt').disabled = estado.pagina === 0;
    document.getElementById('pagProx').disabled = estado.pagina >= paginas - 1;
    document.querySelectorAll('th.ordenavel').forEach(th => {
      const base = th.textContent.replace(/ [↑↓]$/, '');
      th.textContent = th.dataset.ordem === estado.ordem ? `${base} ${estado.direcao === 1 ? '↑' : '↓'}` : base;
    });
  }

  // ---------- render geral ----------
  let listaPeriodo = [];
  function render() {
    if (!estado.dados) return;
    temaGraficos();
    const periodo = intervalo();
    const base = baseFiltrada();
    listaPeriodo = base.filter(t => dentro(t.data, periodo));
    const anterior = base.filter(t => dentro(t.data, intervaloAnterior(periodo)));
    const r = resumo(listaPeriodo, periodo);
    const ant = resumo(anterior, intervaloAnterior(periodo));

    document.getElementById('periodoTexto').textContent = `${dataCurta(periodo.inicio)} a ${dataCurta(periodo.fim)}`;
    renderKpis(r, ant, periodo.tudo);
    const tempo = renderTempo(listaPeriodo, periodo);
    renderCursos(r.aprovadas);
    renderProdutos(r.aprovadas);
    renderMetodos(listaPeriodo, r.aprovadas);
    renderHorarios(r.aprovadas);
    renderAlunos(base, periodo, tempo);
    renderTopAlunos(r.aprovadas);
    renderReceber(listaPeriodo);
    atualizarTabela();
  }
  function atualizarTabela() {
    linhasTabela = linhasFiltradas(listaPeriodo);
    renderTabela();
  }

  // ---------- CSV ----------
  function exportarCsv() {
    const cab = ['Data', 'Aluno', 'E-mail', 'Curso', 'Produto', 'Origem', 'Pagamento', 'Parcelas', 'Valor', 'Status', 'Cupom', 'Desconto', 'ID Mercado Pago'];
    const campo = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const num = v => (v || 0).toFixed(2).replace('.', ',');
    const linhas = linhasTabela.map(t => [
      dataHora(t.data), t.aluno.nome, t.aluno.email, t.curso, t.produto, ORIGENS[t.origem],
      METODOS[t.metodo] || t.metodo, t.parcelas || 1, num(t.valor),
      (STATUS[t.status] || t.status) + (t.status === 'pendente' && t.pendenciaAntiga ? ' (antiga)' : ''),
      t.cupom || '', num(t.desconto), t.mercadoPagoId || ''
    ].map(campo).join(';'));
    // BOM + ";" para o Excel em português abrir com acentos e colunas certas.
    const blob = new Blob(['﻿' + [cab.map(campo).join(';'), ...linhas].join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `balanco-financeiro-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ---------- carga ----------
  async function carregar() {
    const status = document.getElementById('statusCarga');
    status.textContent = 'Carregando…';
    try {
      const res = await fetch('/api/financeiro/transacoes', { headers: { Authorization: 'Bearer ' + token } });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).msg || 'Falha ao carregar.');
      estado.dados = await res.json();
      const cursos = [...new Set(estado.dados.transacoes.map(t => t.curso))].filter(c => c && c !== '—').sort();
      const sel = document.getElementById('fCurso');
      sel.innerHTML = '<option value="">Todos</option>' + cursos.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
      sel.value = cursos.includes(estado.curso) ? estado.curso : '';
      status.textContent = `Atualizado às ${new Date(estado.dados.geradoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · ${inteiro(estado.dados.transacoes.length)} transações no total.`;
      render();
    } catch (err) {
      status.textContent = 'Erro: ' + err.message;
    }
  }

  // ---------- eventos ----------
  function ativarSegmento(container, botao) {
    container.querySelectorAll('button').forEach(b => b.classList.toggle('ativo', b === botao));
  }
  document.getElementById('segPeriodo').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    ativarSegmento(e.currentTarget, b);
    estado.periodo = b.dataset.periodo;
    document.getElementById('datasCustom').hidden = estado.periodo !== 'custom';
    // agrupamento sugerido para cada período (o admin pode trocar depois)
    const sugerido = { hoje: 'dia', '7d': 'dia', '30d': 'dia', mes: 'dia', ano: 'mes', tudo: 'mes' }[estado.periodo];
    if (sugerido) {
      estado.grupo = sugerido;
      ativarSegmento(document.getElementById('segGrupo'), document.querySelector(`#segGrupo [data-grupo="${sugerido}"]`));
    }
    estado.pagina = 0; render();
  });
  document.getElementById('segGrupo').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    ativarSegmento(e.currentTarget, b);
    estado.grupo = b.dataset.grupo; render();
  });
  document.getElementById('dataDe').addEventListener('change', e => { estado.de = e.target.value || null; render(); });
  document.getElementById('dataAte').addEventListener('change', e => { estado.ate = e.target.value || null; render(); });
  [['fCurso', 'curso'], ['fMetodo', 'metodo'], ['fOrigem', 'origem']].forEach(([id, chave]) => {
    document.getElementById(id).addEventListener('change', e => { estado[chave] = e.target.value; estado.pagina = 0; render(); });
  });
  document.getElementById('busca').addEventListener('input', e => { estado.busca = e.target.value; estado.pagina = 0; atualizarTabela(); });
  document.getElementById('fStatus').addEventListener('change', e => { estado.status = e.target.value; estado.pagina = 0; atualizarTabela(); });
  document.querySelectorAll('th.ordenavel').forEach(th => th.addEventListener('click', () => {
    if (estado.ordem === th.dataset.ordem) estado.direcao *= -1;
    else { estado.ordem = th.dataset.ordem; estado.direcao = th.dataset.ordem === 'data' || th.dataset.ordem === 'valor' ? -1 : 1; }
    estado.pagina = 0; atualizarTabela();
  }));
  document.getElementById('pagAnt').addEventListener('click', () => { estado.pagina--; renderTabela(); });
  document.getElementById('pagProx').addEventListener('click', () => { estado.pagina++; renderTabela(); });
  document.getElementById('btnAtualizar').addEventListener('click', carregar);
  document.getElementById('btnCsv').addEventListener('click', exportarCsv);

  // Gráficos leem as cores do tema na hora de desenhar: redesenha ao alternar claro/escuro.
  new MutationObserver(() => render()).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  if (window.acessoLiberado) carregar();
  else window.addEventListener('acesso-liberado', carregar, { once: true });
})();
