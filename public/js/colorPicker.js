// =====================================================================
// SELETOR DE COR REUTILIZÁVEL — usado por Matérias/Conteúdos do Mapeador
// de Estudos. Combina: swatch nativo (<input type="color">), campo hex,
// 3 campos RGB e uma paleta rápida — todos sincronizados entre si.
// Marcação/CSS esperados no HTML da página (classes usadas por este
// arquivo): .seletor-cor, .seletor-cor-preview, .seletor-cor-nativo,
// .seletor-cor-hex, .seletor-cor-rgb input, .seletor-cor-paleta,
// .seletor-cor-swatch (+ .selecionada).
// =====================================================================

const PALETA_CORES_ESTUDO = [
  '#2563eb', '#16a34a', '#d97706', '#dc2626',
  '#7c3aed', '#0891b2', '#db2777', '#65a30d',
  '#ea580c', '#0d9488', '#9333ea', '#475569'
];

function hexValido(hex) {
  return /^#[0-9a-f]{6}$/i.test(hex);
}

function hexParaRgb(hex) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return { r: 0, g: 0, b: 0 };
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

function rgbParaHex(r, g, b) {
  const c = n => Math.max(0, Math.min(255, Number(n) || 0)).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

// containerEl: elemento onde o markup do seletor será injetado.
// opcoes: { corInicial?: string, onChange?: (hex: string) => void }
// Retorna { getCor(), setCor(hex) }.
function montarSeletorCor(containerEl, opcoes = {}) {
  const corInicial = hexValido(opcoes.corInicial) ? opcoes.corInicial : PALETA_CORES_ESTUDO[0];
  const onChange = opcoes.onChange || (() => {});

  containerEl.innerHTML = `
    <div class="seletor-cor">
      <div class="seletor-cor-linha">
        <input type="color" class="seletor-cor-nativo" value="${corInicial}">
        <div class="seletor-cor-preview" style="background:${corInicial};"></div>
        <input type="text" class="seletor-cor-hex" value="${corInicial}" maxlength="7" placeholder="#2563eb">
      </div>
      <div class="seletor-cor-rgb">
        <label>R<input type="number" min="0" max="255" data-canal="r"></label>
        <label>G<input type="number" min="0" max="255" data-canal="g"></label>
        <label>B<input type="number" min="0" max="255" data-canal="b"></label>
      </div>
      <div class="seletor-cor-paleta">
        ${PALETA_CORES_ESTUDO.map(c => `<button type="button" class="seletor-cor-swatch" data-cor="${c}" style="background:${c};" title="${c}"></button>`).join('')}
      </div>
    </div>`;

  const nativo = containerEl.querySelector('.seletor-cor-nativo');
  const preview = containerEl.querySelector('.seletor-cor-preview');
  const hexInput = containerEl.querySelector('.seletor-cor-hex');
  const rgbInputs = {
    r: containerEl.querySelector('[data-canal="r"]'),
    g: containerEl.querySelector('[data-canal="g"]'),
    b: containerEl.querySelector('[data-canal="b"]')
  };
  const swatches = containerEl.querySelectorAll('.seletor-cor-swatch');

  let corAtual = corInicial;

  function marcarSwatchAtiva() {
    swatches.forEach(sw => sw.classList.toggle('selecionada', sw.dataset.cor.toLowerCase() === corAtual.toLowerCase()));
  }

  function aplicar(hex, { disparar = true } = {}) {
    if (!hexValido(hex)) return;
    corAtual = hex.toLowerCase();
    nativo.value = corAtual;
    preview.style.background = corAtual;
    hexInput.value = corAtual;
    const { r, g, b } = hexParaRgb(corAtual);
    rgbInputs.r.value = r; rgbInputs.g.value = g; rgbInputs.b.value = b;
    marcarSwatchAtiva();
    if (disparar) onChange(corAtual);
  }

  nativo.addEventListener('input', () => aplicar(nativo.value));

  hexInput.addEventListener('input', () => {
    let v = hexInput.value.trim();
    if (v && !v.startsWith('#')) v = '#' + v;
    if (hexValido(v)) aplicar(v);
  });

  Object.values(rgbInputs).forEach(input => {
    input.addEventListener('input', () => {
      aplicar(rgbParaHex(rgbInputs.r.value, rgbInputs.g.value, rgbInputs.b.value));
    });
  });

  swatches.forEach(sw => sw.addEventListener('click', () => aplicar(sw.dataset.cor)));

  aplicar(corInicial, { disparar: false });

  return {
    getCor: () => corAtual,
    setCor: hex => aplicar(hex, { disparar: false })
  };
}
