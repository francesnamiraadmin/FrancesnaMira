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
