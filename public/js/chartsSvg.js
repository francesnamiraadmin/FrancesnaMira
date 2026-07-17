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
