// =====================================================================
// RENDERER COMPARTILHADO — Plataforma de Questões
// Extraído de plataforma-questoes.html (era inline) para ser reaproveitado
// tanto pela aba Simulados (que continua em plataforma-questoes.html) quanto
// pela nova tela de resolução de Conjuntos (resolver-conjunto.html).
// Script clássico (sem module/export) — define globais, mesma convenção do
// restante do projeto (public/js/*.js carregado via <script src>).
// =====================================================================

const NOMES_TIPO = { lacuna: '✏️ Complete a frase', multipla: '❓ Múltipla escolha', escuta: '🎧 Compreensão oral', vf: '✅ Verdadeiro ou falso' };

// Rótulos de matéria para páginas que NÃO carregam js/questoes.js (que já define um
// `MATERIAS` global equivalente, mas só para Simulados/plataforma-questoes.html —
// nome diferente aqui de propósito, pra nunca colidir com esse outro global na
// mesma página caso os dois scripts um dia se sobreponham).
const MATERIAS_LABELS = {
  conjugaison: 'Conjugação e tempos verbais', vocabulaire: 'Vocabulário', grammaire: 'Gramática e estruturas',
  co: 'Compreensão oral', ce: 'Compreensão escrita', expressions: 'Expressões e registros',
  visual: 'Compreensão visual', historia: 'Interpretação de textos longos'
};

// ===================== VISUAIS (compreensão visual) =====================
function renderVisual(v) {
  if (!v) return '';
  let conteudo = '';
  switch (v.tipo) {
    case 'relogio': conteudo = svgRelogio(v.h, v.m); break;
    case 'termometro': conteudo = svgTermometro(v.graus); break;
    case 'preco': conteudo = `<div class="preco-card"><div class="preco-icone">${v.icone}</div><div class="preco-valor">${v.preco}</div></div>`; break;
    case 'calendario': conteudo = `<div class="calendario-card"><div class="cal-mes">${v.mes}</div><div class="cal-dia">${v.dia}</div><div class="cal-semana">${v.diaSemana}</div></div>`; break;
    case 'clima': conteudo = svgClima(v.icone); break;
    case 'contagem': conteudo = `<div class="contagem-grid">${'<span>' + v.icone + '</span>'.repeat(v.qtd)}</div>`; break;
    case 'sinal': conteudo = svgSinal(v.forma, v.cor, v.texto); break;
    case 'grafico': conteudo = svgGraficoVisual(v.labels, v.valores, v.unidade); break;
    default: conteudo = '';
  }
  return `<div class="q-imagem">${conteudo}</div>`;
}

function svgRelogio(h, m) {
  const cx = 100, cy = 100, r = 85;
  const hourAngle = (((h % 12) + m / 60) / 12) * 360 - 90;
  const minAngle = (m / 60) * 360 - 90;
  const hx = cx + 42 * Math.cos(hourAngle * Math.PI / 180);
  const hy = cy + 42 * Math.sin(hourAngle * Math.PI / 180);
  const mx = cx + 65 * Math.cos(minAngle * Math.PI / 180);
  const my = cy + 65 * Math.sin(minAngle * Math.PI / 180);
  const marcas = [0, 3, 6, 9].map(n => {
    const a = (n / 12) * 360 - 90;
    const x1 = cx + 72 * Math.cos(a * Math.PI / 180), y1 = cy + 72 * Math.sin(a * Math.PI / 180);
    const x2 = cx + 80 * Math.cos(a * Math.PI / 180), y2 = cy + 80 * Math.sin(a * Math.PI / 180);
    return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#08203e" stroke-width="3"/>`;
  }).join('');
  return `<svg width="200" height="200" viewBox="0 0 200 200">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff" stroke="#08203e" stroke-width="4"/>
    ${marcas}
    <line x1="${cx}" y1="${cy}" x2="${hx.toFixed(1)}" y2="${hy.toFixed(1)}" stroke="#08203e" stroke-width="6" stroke-linecap="round"/>
    <line x1="${cx}" y1="${cy}" x2="${mx.toFixed(1)}" y2="${my.toFixed(1)}" stroke="#ffb300" stroke-width="4" stroke-linecap="round"/>
    <circle cx="${cx}" cy="${cy}" r="6" fill="#08203e"/>
  </svg>`;
}

function svgTermometro(graus) {
  const min = -60, max = 60;
  const pct = Math.max(0, Math.min(1, (graus - min) / (max - min)));
  const tubeTop = 20, tubeBottom = 165, tubeH = tubeBottom - tubeTop;
  const fillH = tubeH * pct;
  const fillY = tubeBottom - fillH;
  const cor = graus < 0 ? '#4dd0ff' : (graus < 20 ? '#ffb300' : '#ff5252');
  return `<svg width="100" height="220" viewBox="0 0 100 220">
    <rect x="38" y="${tubeTop}" width="24" height="150" rx="12" fill="rgba(255,255,255,0.2)" stroke="#08203e" stroke-width="3"/>
    <rect x="41" y="${fillY.toFixed(1)}" width="18" height="${(tubeBottom - fillY).toFixed(1)}" rx="9" fill="${cor}"/>
    <circle cx="50" cy="190" r="22" fill="${cor}" stroke="#08203e" stroke-width="3"/>
    <text x="50" y="212" text-anchor="middle" font-size="14" font-weight="700" fill="#08203e">°C</text>
    <text x="50" y="12" text-anchor="middle" font-size="13" font-weight="700" fill="white">${graus}°</text>
  </svg>`;
}

function svgClima(icone) {
  const cenas = {
    sol: `<circle cx="100" cy="100" r="35" fill="#ffd54f"/>${[0,45,90,135,180,225,270,315].map(a=>{const x1=100+45*Math.cos(a*Math.PI/180),y1=100+45*Math.sin(a*Math.PI/180),x2=100+62*Math.cos(a*Math.PI/180),y2=100+62*Math.sin(a*Math.PI/180);return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#ffd54f" stroke-width="5" stroke-linecap="round"/>`;}).join('')}`,
    nuvem: `<ellipse cx="85" cy="110" rx="40" ry="28" fill="#e0e0e0"/><ellipse cx="130" cy="100" rx="32" ry="24" fill="#e0e0e0"/><ellipse cx="105" cy="90" rx="30" ry="22" fill="#e0e0e0"/>`,
    chuva: `<ellipse cx="85" cy="90" rx="40" ry="28" fill="#bcc6cc"/><ellipse cx="125" cy="85" rx="30" ry="22" fill="#bcc6cc"/><line x1="80" y1="130" x2="70" y2="160" stroke="#4dd0ff" stroke-width="5" stroke-linecap="round"/><line x1="105" y1="130" x2="95" y2="160" stroke="#4dd0ff" stroke-width="5" stroke-linecap="round"/><line x1="130" y1="130" x2="120" y2="160" stroke="#4dd0ff" stroke-width="5" stroke-linecap="round"/>`,
    neve: `<ellipse cx="85" cy="90" rx="40" ry="28" fill="#dbe7f0"/><ellipse cx="125" cy="85" rx="30" ry="22" fill="#dbe7f0"/><circle cx="75" cy="150" r="4" fill="white"/><circle cx="100" cy="160" r="4" fill="white"/><circle cx="125" cy="150" r="4" fill="white"/><circle cx="90" cy="175" r="4" fill="white"/><circle cx="115" cy="175" r="4" fill="white"/>`,
    vento: `<path d="M40,90 h90 a12,12 0 1 0 -12,-12" stroke="#b0bec5" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M40,120 h110 a12,12 0 1 1 -12,12" stroke="#b0bec5" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M40,150 h80 a10,10 0 1 0 -10,-10" stroke="#b0bec5" stroke-width="5" fill="none" stroke-linecap="round"/>`,
    tempestade: `<ellipse cx="100" cy="90" rx="45" ry="28" fill="#78909c"/><polygon points="105,120 90,155 105,155 92,185 125,140 108,140" fill="#ffd54f"/>`
  };
  return `<svg width="200" height="200" viewBox="0 0 200 200">${cenas[icone] || cenas.sol}</svg>`;
}

function svgSinal(forma, cor, texto) {
  const cores = { vermelho: '#e53935', azul: '#1e88e5', amarelo: '#fdd835', verde: '#43a047' };
  const fill = cores[cor] || '#e53935';
  const txtColor = cor === 'amarelo' ? '#08203e' : '#fff';
  let shape = '';
  if (forma === 'octogono') {
    const pts = [];
    for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4; pts.push((100 + 75 * Math.cos(a)).toFixed(1) + ',' + (100 + 75 * Math.sin(a)).toFixed(1)); }
    shape = `<polygon points="${pts.join(' ')}" fill="${fill}" stroke="#fff" stroke-width="4"/>`;
  } else if (forma === 'circulo') {
    shape = `<circle cx="100" cy="100" r="80" fill="${fill}" stroke="#fff" stroke-width="6"/>`;
  } else if (forma === 'triangulo') {
    shape = `<polygon points="100,20 180,175 20,175" fill="${fill}" stroke="#08203e" stroke-width="4"/>`;
  } else {
    shape = `<rect x="25" y="25" width="150" height="150" rx="12" fill="${fill}" stroke="#fff" stroke-width="6"/>`;
  }
  const fs = texto.length > 4 ? 26 : 40;
  const ty = forma === 'triangulo' ? 140 : 112;
  return `<svg width="200" height="200" viewBox="0 0 200 200">
    ${shape}
    <text x="100" y="${ty}" text-anchor="middle" font-size="${fs}" font-weight="700" fill="${txtColor}">${texto}</text>
  </svg>`;
}

function svgGraficoVisual(labels, valores, unidade) {
  const W = Math.max(400, labels.length * 90), H = 220;
  const padL = 45, padR = 16, padT = 20, padB = 46;
  const iw = W - padL - padR, ih = H - padT - padB;
  const maxV = Math.max(...valores) * 1.15;
  const bw = Math.min(48, iw / labels.length - 14);
  const barras = labels.map((lb, i) => {
    const cx = padL + (i + 0.5) / labels.length * iw;
    const h = (valores[i] / maxV) * ih;
    const yTopo = padT + ih - h;
    return `<rect x="${(cx - bw / 2).toFixed(1)}" y="${yTopo.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="5" fill="#ffeb3b"/>
      <text x="${cx}" y="${yTopo - 8}" text-anchor="middle" font-size="13" font-weight="700" fill="#08203e">${valores[i]}</text>
      <text x="${cx}" y="${H - 12}" text-anchor="middle" font-size="12" fill="#08203e">${lb}</text>`;
  }).join('');
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="background:#fff; border-radius:10px;">
    <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + ih}" stroke="#08203e" stroke-width="2"/>
    <line x1="${padL}" y1="${padT + ih}" x2="${W - padR}" y2="${padT + ih}" stroke="#08203e" stroke-width="2"/>
    ${barras}
    <text x="${padL}" y="14" font-size="11" fill="#08203e" font-weight="700">${unidade}</text>
  </svg>`;
}

function tocarAudio(texto) {
  if (!window.speechSynthesis) { alert('Seu navegador não é compatível com leitura de áudio.'); return; }
  speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(texto);
  utter.lang = 'fr-FR';
  utter.rate = 0.95;
  speechSynthesis.speak(utter);
}
