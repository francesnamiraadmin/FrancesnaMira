// =====================================================================
// GRÁFICOS SVG COMPARTILHADOS — hand-rolled, sem biblioteca (mesmo espírito
// de todo o resto do projeto, ex. os SVGs de compreensão visual em
// questoesRender.js). Usado por minha-conta.html (histórico legado de
// Simulados) e estatisticas-questoes.html.
// =====================================================================

// pontos: [{x: rótulo do eixo, y: número 0-100, tooltip?: string}]
function svgLinha(pontos) {
  const dados = pontos.slice(-30);
  const W = Math.max(560, dados.length * 60), H = 200;
  const padL = 40, padR = 16, padT = 16, padB = 30;
  const iw = W - padL - padR, ih = H - padT - padB;
  const x = i => dados.length === 1 ? padL + iw / 2 : padL + (i / (dados.length - 1)) * iw;
  const y = v => padT + (1 - v / 100) * ih;
  const grade = [0, 25, 50, 75, 100].map(v =>
    `<line x1="${padL}" y1="${y(v)}" x2="${W - padR}" y2="${y(v)}" stroke="rgba(128,128,128,0.2)" stroke-width="1"/>
     <text x="${padL - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="var(--text-muted)">${v}</text>`
  ).join('');
  const caminho = dados.map((p, i) => (i === 0 ? 'M' : 'L') + x(i).toFixed(1) + ' ' + y(p.y).toFixed(1)).join(' ');
  const pontosSvg = dados.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.y)}" r="4" fill="var(--accent)"><title>${p.tooltip || ''}</title></circle>`).join('');
  const eixoX = dados.map((p, i) => `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" font-size="11" fill="var(--text-muted)">${p.x}</text>`).join('');
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Gráfico de evolução">
    ${grade}<path d="${caminho}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>${pontosSvg}${eixoX}
  </svg>`;
}

// linhas: [{rotulo, total, taxa (0-100 ou null se sem dados)}]
function barList(linhas) {
  return linhas.map(l => {
    if (l.taxa === null || l.taxa === undefined) {
      return `<div class="bar-list-row"><span class="bar-list-label">${l.rotulo}</span><div class="bar-list-track"></div><span class="bar-list-val" style="opacity:0.5;">sem dados</span></div>`;
    }
    return `<div class="bar-list-row" title="${l.rotulo}: ${l.taxa}% de acerto em ${l.total} questões">
      <span class="bar-list-label">${l.rotulo}</span>
      <div class="bar-list-track"><div class="bar-list-fill" style="width:${l.taxa}%;"></div></div>
      <span class="bar-list-val">${l.taxa}% · ${l.total}q</span>
    </div>`;
  }).join('');
}

// Anel de pizza de 2 fatias (corretas/incorretas) via stroke-dasharray num círculo —
// evita ter que calcular geometria de arco (só faz sentido pra exatamente 2 fatias).
function svgPizza(corretas, incorretas) {
  const total = corretas + incorretas;
  if (!total) return '<p style="text-align:center; opacity:0.7; padding:20px;">Sem dados suficientes.</p>';
  const pctCorretas = corretas / total;
  const raio = 70, circ = 2 * Math.PI * raio;
  return `<svg width="180" height="180" viewBox="0 0 180 180" role="img" aria-label="Corretas vs incorretas">
    <circle cx="90" cy="90" r="${raio}" fill="none" stroke="var(--danger-text)" stroke-width="28"/>
    <circle cx="90" cy="90" r="${raio}" fill="none" stroke="var(--success-text)" stroke-width="28"
      stroke-dasharray="${(circ * pctCorretas).toFixed(1)} ${circ.toFixed(1)}" stroke-linecap="butt"
      transform="rotate(-90 90 90)"/>
    <text x="90" y="86" text-anchor="middle" font-size="24" font-weight="700" fill="var(--text)">${Math.round(pctCorretas * 100)}%</text>
    <text x="90" y="106" text-anchor="middle" font-size="11" fill="var(--text-muted)">de acerto</text>
  </svg>`;
}

// =====================================================================
// Extensões pro Mapeador de Estudos — pizza de N fatias com cor própria por
// fatia, linha de evolução com eixo Y auto-escalado (em vez de fixo 0-100,
// que só serve pra taxas de acerto) e heatmap estilo GitHub.
// =====================================================================

// fatias: [{rotulo, valor, cor}]
function svgPizzaMultipla(fatias) {
  const validas = (fatias || []).filter(f => f.valor > 0);
  const total = validas.reduce((a, f) => a + f.valor, 0);
  if (!total) return '<p style="text-align:center; opacity:0.7; padding:20px;">Sem dados suficientes.</p>';
  const raio = 70, circ = 2 * Math.PI * raio;
  let acumulado = 0;
  const arcos = validas.map(f => {
    const frac = f.valor / total;
    const dasharray = `${(circ * frac).toFixed(1)} ${circ.toFixed(1)}`;
    const offset = (-circ * acumulado).toFixed(1);
    acumulado += frac;
    return `<circle cx="90" cy="90" r="${raio}" fill="none" stroke="${f.cor}" stroke-width="28"
      stroke-dasharray="${dasharray}" stroke-dashoffset="${offset}" stroke-linecap="butt"
      transform="rotate(-90 90 90)"><title>${f.rotulo}: ${f.valor}</title></circle>`;
  }).join('');
  const legenda = validas.map(f => `<div class="pizza-legenda-item"><span class="pizza-legenda-cor" style="background:${f.cor};"></span>${f.rotulo}</div>`).join('');
  return `<div class="pizza-multipla-wrap">
    <svg width="180" height="180" viewBox="0 0 180 180" role="img" aria-label="Distribuição">
      <circle cx="90" cy="90" r="${raio}" fill="none" stroke="rgba(128,128,128,0.15)" stroke-width="28"/>
      ${arcos}
    </svg>
    <div class="pizza-multipla-legenda">${legenda}</div>
  </div>`;
}

// pontos: [{x: rótulo, y: valor numérico, tooltip?}]. Ao contrário de svgLinha (eixo Y
// fixo 0-100, pensado pra % de acerto), aqui o eixo se ajusta ao maior valor da série —
// necessário pra séries de minutos/horas estudadas, que não têm teto natural.
function svgLinhaValores(pontos, opts = {}) {
  const dados = pontos.slice(-30);
  if (!dados.length) return '<p style="text-align:center; opacity:0.7; padding:20px;">Sem dados suficientes.</p>';
  const formatarEixoY = opts.formatarEixoY || (v => String(v));
  const maxY = Math.max(1, ...dados.map(p => p.y));
  const W = Math.max(560, dados.length * 60), H = 220;
  const padL = 56, padR = 16, padT = 16, padB = 30;
  const iw = W - padL - padR, ih = H - padT - padB;
  const x = i => dados.length === 1 ? padL + iw / 2 : padL + (i / (dados.length - 1)) * iw;
  const y = v => padT + (1 - v / maxY) * ih;
  const grade = [0, 0.25, 0.5, 0.75, 1].map(f => {
    const v = maxY * f;
    return `<line x1="${padL}" y1="${y(v)}" x2="${W - padR}" y2="${y(v)}" stroke="rgba(128,128,128,0.2)" stroke-width="1"/>
     <text x="${padL - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="var(--text-muted)">${formatarEixoY(Math.round(v))}</text>`;
  }).join('');
  const caminho = dados.map((p, i) => (i === 0 ? 'M' : 'L') + x(i).toFixed(1) + ' ' + y(p.y).toFixed(1)).join(' ');
  const pontosSvg = dados.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.y)}" r="4" fill="var(--accent)"><title>${p.tooltip || (p.x + ': ' + formatarEixoY(p.y))}</title></circle>`).join('');
  const eixoX = dados.map((p, i) => `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" font-size="11" fill="var(--text-muted)">${p.x}</text>`).join('');
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Gráfico de evolução">
    ${grade}<path d="${caminho}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>${pontosSvg}${eixoX}
  </svg>`;
}

// dias: [{data:'YYYY-MM-DD', valor}] — intensidade de cor (fill-opacity) proporcional ao
// maior valor do conjunto, mesmo espírito do calendário de contribuições do GitHub.
function heatmapCalendario(dias, opts = {}) {
  const semanas = opts.semanas || 18;
  const porData = new Map((dias || []).map(d => [d.data, d.valor]));
  const max = Math.max(1, ...(dias || []).map(d => d.valor));

  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const domingoAtual = new Date(hoje); domingoAtual.setDate(hoje.getDate() - hoje.getDay());
  const inicio = new Date(domingoAtual); inicio.setDate(domingoAtual.getDate() - (semanas - 1) * 7);

  const cel = 13, gap = 3, padL = 24, padT = 14;
  const W = padL + semanas * (cel + gap), H = padT + 7 * (cel + gap) + 4;
  const NOMES_DIA_ABREV = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  let quads = '', mesLabels = '', ultimoMes = null;
  for (let semana = 0; semana < semanas; semana++) {
    for (let dia = 0; dia < 7; dia++) {
      const data = new Date(inicio);
      data.setDate(inicio.getDate() + semana * 7 + dia);
      if (data > hoje) continue;
      const iso = data.toISOString().slice(0, 10);
      const valor = porData.get(iso) || 0;
      const opacidade = valor === 0 ? 0.08 : (0.18 + (valor / max) * 0.82).toFixed(2);
      const cx = padL + semana * (cel + gap), cy = padT + dia * (cel + gap);
      quads += `<rect x="${cx}" y="${cy}" width="${cel}" height="${cel}" rx="3" fill="var(--accent)" fill-opacity="${opacidade}"><title>${iso}: ${Math.round(valor / 60)} min</title></rect>`;
      if (dia === 0) {
        const mes = data.getMonth();
        if (mes !== ultimoMes) {
          mesLabels += `<text x="${cx}" y="${padT - 4}" font-size="10" fill="var(--text-muted)">${data.toLocaleDateString('pt-BR', { month: 'short' })}</text>`;
          ultimoMes = mes;
        }
      }
    }
  }
  const diaLabels = NOMES_DIA_ABREV.map((n, i) => i % 2 === 1 ? `<text x="2" y="${padT + i * (cel + gap) + cel - 2}" font-size="9" fill="var(--text-muted)">${n}</text>` : '').join('');

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Calendário de estudo">
    ${mesLabels}${diaLabels}${quads}
  </svg>`;
}

// =====================================================================
// GRÁFICOS INTERATIVOS DA ESTATÍSTICAS DO MAPEADOR — ao contrário das
// funções acima (que retornam uma string de HTML/SVG pronta), estas
// "montam" (recebem o container e cuidam de innerHTML + listeners),
// mesmo padrão já usado por colorPicker.js#montarSeletorCor — necessário
// porque têm hover/tooltip de verdade, não só um <title> nativo do
// navegador. Curva suave (Catmull-Rom → Bézier), gradiente sob a área,
// crosshair com tooltip HTML, e uma rosca com fatias arredondadas e
// vão (gap) entre elas — só usadas por mapeadorEstatisticas.js.
// =====================================================================

function _chartEscapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

// Ticks "redondos" pro eixo Y (mesma ideia do "nice numbers" do D3) — nunca
// mostra um valor tipo 137 quando dava pra mostrar 0/50/100/150.
function _eixoYNice(maxValor, passosAlvo = 4) {
  if (maxValor <= 0) return [0, 1];
  const bruto = maxValor / passosAlvo;
  const mag = Math.pow(10, Math.floor(Math.log10(bruto)));
  const normalizado = bruto / mag;
  let passo;
  if (normalizado < 1.5) passo = 1 * mag;
  else if (normalizado < 3) passo = 2 * mag;
  else if (normalizado < 7) passo = 5 * mag;
  else passo = 10 * mag;
  const ticks = [];
  for (let v = 0; v <= maxValor + passo * 0.5; v += passo) ticks.push(Math.round(v * 100) / 100);
  return ticks;
}

// Spline suave via Catmull-Rom convertida pra curvas Bézier cúbicas — a
// mesma sequência de pontos que antes virava uma linha "de canudo" (só
// segmentos retos) agora faz uma curva contínua, muito mais agradável.
function _caminhoSuave(pontosXY) {
  if (!pontosXY.length) return '';
  if (pontosXY.length === 1) return `M${pontosXY[0].x},${pontosXY[0].y}`;
  if (pontosXY.length === 2) return `M${pontosXY[0].x},${pontosXY[0].y} L${pontosXY[1].x},${pontosXY[1].y}`;
  let d = `M${pontosXY[0].x},${pontosXY[0].y}`;
  for (let i = 0; i < pontosXY.length - 1; i++) {
    const p0 = pontosXY[i - 1] || pontosXY[i];
    const p1 = pontosXY[i];
    const p2 = pontosXY[i + 1];
    const p3 = pontosXY[i + 2] || p2;
    const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}

let _contadorGraficoId = 0;

// pontos: [{x: rótulo, y: número, tooltip?}]. opts: { tipo: 'linha'|'area'|'barras',
// cor (hex/var), formatarEixoY(v) }.
function montarGraficoEvolucao(containerEl, pontos, opts = {}) {
  const tipo = opts.tipo || 'linha';
  const cor = opts.cor || 'var(--accent)';
  const formatarEixoY = opts.formatarEixoY || (v => String(v));

  if (!pontos || !pontos.length) {
    containerEl.innerHTML = '<p class="vazio-msg">Sem dados suficientes para este período.</p>';
    return;
  }

  const dados = pontos.length > 60 ? pontos.slice(-60) : pontos;
  const maxY = Math.max(1, ...dados.map(p => p.y));
  const ticksY = _eixoYNice(maxY);
  const maxEscala = ticksY[ticksY.length - 1] || 1;

  const W = Math.max(560, dados.length * 46), H = 280;
  const padL = 54, padR = 20, padT = 20, padB = 36;
  const iw = W - padL - padR, ih = H - padT - padB;
  const x = i => dados.length === 1 ? padL + iw / 2 : padL + (i / Math.max(1, dados.length - 1)) * iw;
  const y = v => padT + (1 - v / maxEscala) * ih;
  const baseY = y(0);

  const grade = ticksY.map(v => `
    <line x1="${padL}" y1="${y(v).toFixed(1)}" x2="${W - padR}" y2="${y(v).toFixed(1)}" stroke="var(--glass-border)" stroke-width="1"/>
    <text x="${padL - 10}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="var(--text-muted)">${formatarEixoY(v)}</text>`).join('');

  const maxRotulos = Math.max(4, Math.floor(iw / 56));
  const pulo = Math.max(1, Math.ceil(dados.length / maxRotulos));
  const eixoX = dados.map((p, i) => (i % pulo === 0 || i === dados.length - 1)
    ? `<text x="${x(i).toFixed(1)}" y="${H - 10}" text-anchor="middle" font-size="11" fill="var(--text-muted)">${_chartEscapeHtml(p.x)}</text>` : '').join('');

  let marcas = '';
  if (tipo === 'barras') {
    const larguraBarra = Math.min(24, iw / dados.length * 0.55);
    marcas = dados.map((p, i) => {
      const cx = x(i), yTop = y(p.y);
      const xEsq = cx - larguraBarra / 2, xDir = cx + larguraBarra / 2;
      const r = Math.min(4, (baseY - yTop) / 2, larguraBarra / 2);
      const caminho = (baseY - yTop) <= r
        ? `M${xEsq.toFixed(1)},${baseY.toFixed(1)} L${xEsq.toFixed(1)},${yTop.toFixed(1)} L${xDir.toFixed(1)},${yTop.toFixed(1)} L${xDir.toFixed(1)},${baseY.toFixed(1)} Z`
        : `M${xEsq.toFixed(1)},${baseY.toFixed(1)} L${xEsq.toFixed(1)},${(yTop + r).toFixed(1)} Q${xEsq.toFixed(1)},${yTop.toFixed(1)} ${(xEsq + r).toFixed(1)},${yTop.toFixed(1)} L${(xDir - r).toFixed(1)},${yTop.toFixed(1)} Q${xDir.toFixed(1)},${yTop.toFixed(1)} ${xDir.toFixed(1)},${(yTop + r).toFixed(1)} L${xDir.toFixed(1)},${baseY.toFixed(1)} Z`;
      return `<path d="${caminho}" fill="${cor}" class="grafico-marca" data-idx="${i}"/>`;
    }).join('');
  } else {
    const pontosXY = dados.map((p, i) => ({ x: x(i), y: y(p.y) }));
    const caminho = _caminhoSuave(pontosXY);
    if (tipo === 'area') {
      const idGrad = 'gradEvo' + (_contadorGraficoId++);
      const areaPath = `${caminho} L${pontosXY[pontosXY.length - 1].x.toFixed(1)},${baseY.toFixed(1)} L${pontosXY[0].x.toFixed(1)},${baseY.toFixed(1)} Z`;
      marcas += `<defs><linearGradient id="${idGrad}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${cor}" stop-opacity="0.3"/>
        <stop offset="100%" stop-color="${cor}" stop-opacity="0.02"/>
      </linearGradient></defs>
      <path d="${areaPath}" fill="url(#${idGrad})" stroke="none"/>`;
    }
    marcas += `<path d="${caminho}" fill="none" stroke="${cor}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
    marcas += pontosXY.map((p, i) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.5" fill="var(--glass-bg-2)" stroke="${cor}" stroke-width="2" class="grafico-marca" data-idx="${i}"/>`).join('');
  }

  containerEl.innerHTML = `
    <div class="grafico-evolucao-wrap">
      <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Gráfico de evolução" class="grafico-evolucao-svg" preserveAspectRatio="xMinYMid meet">
        ${grade}
        <line x1="${padL}" y1="${baseY.toFixed(1)}" x2="${W - padR}" y2="${baseY.toFixed(1)}" stroke="var(--glass-border-strong)" stroke-width="1"/>
        ${marcas}
        ${eixoX}
        <line class="grafico-crosshair" x1="0" y1="${padT}" x2="0" y2="${baseY.toFixed(1)}" opacity="0"/>
        <rect class="grafico-hitarea" x="${padL}" y="${padT}" width="${iw}" height="${ih}" fill="transparent"/>
      </svg>
      <div class="grafico-tooltip" style="display:none;"></div>
    </div>`;

  const svgEl = containerEl.querySelector('.grafico-evolucao-svg');
  const hitArea = containerEl.querySelector('.grafico-hitarea');
  const crosshair = containerEl.querySelector('.grafico-crosshair');
  const tooltip = containerEl.querySelector('.grafico-tooltip');
  const wrap = containerEl.querySelector('.grafico-evolucao-wrap');

  function indiceMaisProximo(clientX) {
    const rect = svgEl.getBoundingClientRect();
    const escala = rect.width / W;
    const xLocal = (clientX - rect.left) / escala;
    let melhorIdx = 0, melhorDist = Infinity;
    dados.forEach((_, i) => { const d = Math.abs(x(i) - xLocal); if (d < melhorDist) { melhorDist = d; melhorIdx = i; } });
    return melhorIdx;
  }
  function mostrarTooltip(idx) {
    const p = dados[idx];
    crosshair.setAttribute('x1', x(idx).toFixed(1));
    crosshair.setAttribute('x2', x(idx).toFixed(1));
    crosshair.setAttribute('opacity', '1');
    containerEl.querySelectorAll('.grafico-marca').forEach(m => m.classList.toggle('ativa', Number(m.dataset.idx) === idx));
    const wrapRect = wrap.getBoundingClientRect();
    const escala = wrapRect.width / W;
    tooltip.style.display = 'block';
    tooltip.innerHTML = `<strong></strong><span></span>`;
    tooltip.querySelector('strong').textContent = formatarEixoY(p.y);
    tooltip.querySelector('span').textContent = p.tooltip || String(p.x);
    let left = x(idx) * escala;
    left = Math.min(Math.max(left, 62), Math.max(62, wrapRect.width - 62));
    tooltip.style.left = left + 'px';
  }
  function esconderTooltip() {
    crosshair.setAttribute('opacity', '0');
    tooltip.style.display = 'none';
    containerEl.querySelectorAll('.grafico-marca').forEach(m => m.classList.remove('ativa'));
  }
  hitArea.addEventListener('pointermove', e => mostrarTooltip(indiceMaisProximo(e.clientX)));
  hitArea.addEventListener('pointerleave', esconderTooltip);
  containerEl.querySelectorAll('.grafico-marca').forEach(m => {
    m.addEventListener('pointerenter', () => mostrarTooltip(Number(m.dataset.idx)));
    m.addEventListener('pointerleave', esconderTooltip);
  });
}

// fatias: [{rotulo, valor, cor}]. opts: { tipo: 'rosca'|'barras', formatarValor(v) }.
// Mais de 6 fatias numa rosca vira ilegível (anti-padrão conhecido) — quando
// isso acontece, a função força barras sozinha, mesmo que 'rosca' tenha sido
// pedido, e avisa na tela por quê.
function montarGraficoDistribuicao(containerEl, fatias, opts = {}) {
  let tipo = opts.tipo || 'rosca';
  const formatarValor = opts.formatarValor || (v => String(v));
  const validas = (fatias || []).filter(f => f.valor > 0);
  if (!validas.length) { containerEl.innerHTML = '<p class="vazio-msg">Sem dados suficientes.</p>'; return; }

  let avisoFallback = '';
  if (tipo === 'rosca' && validas.length > 6) {
    tipo = 'barras';
    avisoFallback = '<p class="grafico-aviso-fallback">Muitos itens para uma rosca legível — mostrando como barras.</p>';
  }

  const total = validas.reduce((a, f) => a + f.valor, 0);
  const ordenadas = validas.slice().sort((a, b) => b.valor - a.valor);

  if (tipo === 'barras') {
    const max = ordenadas[0].valor;
    const linhas = ordenadas.map(f => `
      <div class="grafico-barra-h-row" title="${_chartEscapeHtml(f.rotulo)}: ${_chartEscapeHtml(formatarValor(f.valor))}">
        <span class="grafico-barra-h-label">${_chartEscapeHtml(f.rotulo)}</span>
        <div class="grafico-barra-h-track"><div class="grafico-barra-h-fill" style="width:${Math.max(3, Math.round(f.valor / max * 100))}%; background:${f.cor};"></div></div>
        <span class="grafico-barra-h-val">${_chartEscapeHtml(formatarValor(f.valor))}</span>
      </div>`).join('');
    containerEl.innerHTML = avisoFallback + `<div class="grafico-barras-h-wrap">${linhas}</div>`;
    return;
  }

  const raio = 72, espessura = 26, circ = 2 * Math.PI * raio;
  const gapGraus = validas.length > 1 ? 2.2 : 0;
  let acumuladoGraus = 0;
  const arcos = ordenadas.map((f, i) => {
    const fracaoBruta = f.valor / total;
    const grausUteis = Math.max(0, fracaoBruta * 360 - gapGraus);
    const inicio = acumuladoGraus + gapGraus / 2;
    acumuladoGraus += fracaoBruta * 360;
    const dash = `${(circ * grausUteis / 360).toFixed(1)} ${circ.toFixed(1)}`;
    const offset = (-circ * inicio / 360).toFixed(1);
    return `<circle cx="90" cy="90" r="${raio}" fill="none" stroke="${f.cor}" stroke-width="${espessura}"
      stroke-dasharray="${dash}" stroke-dashoffset="${offset}" stroke-linecap="round"
      transform="rotate(-90 90 90)" class="grafico-fatia" data-idx="${i}"><title>${_chartEscapeHtml(f.rotulo)}: ${_chartEscapeHtml(formatarValor(f.valor))}</title></circle>`;
  }).join('');

  const legenda = ordenadas.map((f, i) => `
    <div class="grafico-legenda-item" data-idx="${i}">
      <span class="grafico-legenda-cor" style="background:${f.cor};"></span>
      <span class="grafico-legenda-nome">${_chartEscapeHtml(f.rotulo)}</span>
      <span class="grafico-legenda-val">${_chartEscapeHtml(formatarValor(f.valor))} · ${Math.round(f.valor / total * 100)}%</span>
    </div>`).join('');

  containerEl.innerHTML = `
    <div class="grafico-rosca-wrap">
      <svg width="180" height="180" viewBox="0 0 180 180" role="img" aria-label="Distribuição">
        <circle cx="90" cy="90" r="${raio}" fill="none" stroke="var(--glass-border)" stroke-width="${espessura}"/>
        ${arcos}
        <text x="90" y="84" text-anchor="middle" font-size="19" font-weight="700" fill="var(--text)">${_chartEscapeHtml(formatarValor(total))}</text>
        <text x="90" y="102" text-anchor="middle" font-size="10.5" fill="var(--text-muted)">total</text>
      </svg>
      <div class="grafico-legenda">${legenda}</div>
    </div>`;

  const svgFatias = containerEl.querySelectorAll('.grafico-fatia');
  const legendaItens = containerEl.querySelectorAll('.grafico-legenda-item');
  function destacar(idx) {
    svgFatias.forEach(f => f.classList.toggle('esmaecida', idx !== null && Number(f.dataset.idx) !== idx));
    legendaItens.forEach(l => l.classList.toggle('ativa', Number(l.dataset.idx) === idx));
  }
  svgFatias.forEach(f => {
    f.addEventListener('pointerenter', () => destacar(Number(f.dataset.idx)));
    f.addEventListener('pointerleave', () => destacar(null));
  });
  legendaItens.forEach(l => {
    l.addEventListener('pointerenter', () => destacar(Number(l.dataset.idx)));
    l.addEventListener('pointerleave', () => destacar(null));
  });
}
