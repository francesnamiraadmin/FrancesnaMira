// =====================================================================
// PERSONALIZAR CONJUNTO — página própria (migrado de public/js/conjuntos.js).
// Não carrega js/questoes.js (só usado por Simulados) — por isso NIVEIS é
// declarado aqui localmente, em vez de reaproveitar o global de lá.
// =====================================================================

function authHeaders(json) {
  const token = localStorage.getItem('token');
  return Object.assign({ Authorization: 'Bearer ' + token }, json ? { 'Content-Type': 'application/json' } : {});
}

const NIVEIS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const QUANTIDADES_CONJUNTO = [10, 20, 40];
const POOLS = [
  { valor: 'praticar', label: 'Praticar' },
  { valor: 'simulado', label: 'Simulado' }
];
const filtroForm = { pool: 'praticar', niveis: new Set(), materias: new Set(), quantidade: 10 };

function renderChipsPool() {
  document.getElementById('chipPool').innerHTML = POOLS.map(p =>
    `<button type="button" class="chip-toggle ${p.valor === filtroForm.pool ? 'selecionado' : ''}" data-pool="${p.valor}">${p.label}</button>`
  ).join('');
}

// Simulado é sempre cronometrado por padrão (ver backend/seed/simuladosOficiais.js —
// mesmo "padrão" já usado no catálogo oficial: 60min sugerido), Praticar não.
function aplicarPadraoTempoPool(form) {
  const tempoModoInput = form.querySelector(`input[name="tempoModo"][value="${filtroForm.pool === 'simulado' ? 'com' : 'sem'}"]`);
  tempoModoInput.checked = true;
  const minutosInput = document.getElementById('tempoMinutos');
  minutosInput.style.display = filtroForm.pool === 'simulado' ? 'inline-block' : 'none';
  if (filtroForm.pool === 'simulado' && !minutosInput.value) minutosInput.value = 60;
}

function renderChipsNiveis() {
  document.getElementById('chipNiveis').innerHTML = NIVEIS.map(n =>
    `<button type="button" class="chip-toggle" data-nivel="${n}">${n}</button>`
  ).join('');
}

const TODAS_MATERIAS = Object.keys(MATERIAS_LABELS);

function renderChipsMaterias() {
  const chipTodos = `<button type="button" class="chip-toggle" data-materia-todos>Todos os conteúdos</button>`;
  const chipsIndividuais = Object.entries(MATERIAS_LABELS).map(([k, v]) =>
    `<button type="button" class="chip-toggle" data-materia="${k}">${v}</button>`
  ).join('');
  document.getElementById('chipMaterias').innerHTML = chipTodos + chipsIndividuais;
}

// Mantém o chip "Todos os conteúdos" marcado só quando as 8 categorias estiverem
// selecionadas de fato — reflete o estado real em vez de ser um botão independente.
function sincronizarChipTodos(form) {
  const todasSelecionadas = TODAS_MATERIAS.every(m => filtroForm.materias.has(m));
  form.querySelector('[data-materia-todos]')?.classList.toggle('selecionado', todasSelecionadas);
}

function renderChipsQuantidade() {
  document.getElementById('chipQuantidade').innerHTML = QUANTIDADES_CONJUNTO.map(q =>
    `<button type="button" class="chip-toggle ${q === filtroForm.quantidade ? 'selecionado' : ''}" data-quantidade="${q}">${q} questões</button>`
  ).join('');
}

function mostrarErroForm(msg) {
  const el = document.getElementById('criarConjuntoErro');
  el.textContent = msg;
  el.classList.add('show');
}

// ===================== MEUS CONJUNTOS PERSONALIZADOS =====================

const STATUS_LABEL_PERSONALIZADO = { nao_iniciado: 'Não iniciado', em_andamento: 'Em andamento', concluido: 'Concluído' };

function formatarTempoLimite(segundos) {
  if (!segundos) return 'sem limite de tempo';
  return `${Math.round(segundos / 60)} min`;
}

function atualizarTituloMeusPersonalizados() {
  const label = POOLS.find(p => p.valor === filtroForm.pool).label;
  document.getElementById('meusPersonalizadosTitulo').textContent = `Meus conjuntos personalizados — ${label}`;
}

async function carregarMeusPersonalizados() {
  const lista = document.getElementById('meusPersonalizadosLista');
  lista.innerHTML = '<p class="meus-personalizados-vazio">Carregando...</p>';
  try {
    const res = await fetch(`/api/questoes/conjuntos/meus-personalizados?pool=${filtroForm.pool}`, { headers: authHeaders() });
    if (!res.ok) throw new Error();
    const conjuntos = await res.json();
    if (!conjuntos.length) {
      lista.innerHTML = '<p class="meus-personalizados-vazio">Você ainda não criou nenhum conjunto personalizado.</p>';
      return;
    }
    lista.innerHTML = conjuntos.map(c => `
      <div class="personalizado-item">
        <div class="info">
          <span class="nome">${c.nome}</span>
          <span class="meta">
            <span class="q-status-pill ${c.status}">${STATUS_LABEL_PERSONALIZADO[c.status]}</span>
            &nbsp;${c.quantidadeQuestoes} questões · ${formatarTempoLimite(c.tempoLimiteSegundos)}${c.ultimaTentativa ? ` · última tentativa: ${c.ultimaTentativa.percentualAcertos}% de acertos` : ''}
          </span>
        </div>
        <div class="acoes">
          <a class="q-btn secundario" href="resolver-conjunto.html?id=${c._id}">${c.status === 'nao_iniciado' ? 'Começar' : c.status === 'em_andamento' ? 'Continuar' : 'Refazer'}</a>
          <button type="button" class="q-btn perigo" data-excluir-personalizado="${c._id}">Excluir</button>
        </div>
      </div>`).join('');
  } catch (err) {
    lista.innerHTML = '<p class="meus-personalizados-vazio">Erro ao carregar seus conjuntos personalizados.</p>';
  }
}

function initMeusPersonalizados() {
  document.getElementById('meusPersonalizadosLista').addEventListener('click', async e => {
    const btn = e.target.closest('[data-excluir-personalizado]');
    if (!btn) return;
    const item = btn.closest('.personalizado-item');
    const nome = item.querySelector('.nome').textContent;
    if (!confirm(`Excluir o conjunto personalizado "${nome}"? Isso não pode ser desfeito.`)) return;
    btn.disabled = true;
    try {
      const res = await fetch(`/api/questoes/conjuntos/${btn.dataset.excluirPersonalizado}`, { method: 'DELETE', headers: authHeaders() });
      if (!res.ok) { btn.disabled = false; alert('Não foi possível excluir este conjunto.'); return; }
      item.remove();
      if (!document.getElementById('meusPersonalizadosLista').children.length) carregarMeusPersonalizados();
    } catch (err) {
      btn.disabled = false;
      alert('Erro ao conectar ao servidor.');
    }
  });
  atualizarTituloMeusPersonalizados();
  carregarMeusPersonalizados();
}

function initFormularioConjunto() {
  renderChipsPool();
  renderChipsNiveis();
  renderChipsMaterias();
  renderChipsQuantidade();

  const form = document.getElementById('criarConjuntoForm');
  aplicarPadraoTempoPool(form);

  form.addEventListener('click', e => {
    const poolChip = e.target.closest('[data-pool]');
    if (poolChip) {
      filtroForm.pool = poolChip.dataset.pool;
      form.querySelectorAll('[data-pool]').forEach(chip => chip.classList.toggle('selecionado', chip.dataset.pool === filtroForm.pool));
      aplicarPadraoTempoPool(form);
      atualizarTituloMeusPersonalizados();
      carregarMeusPersonalizados();
      return;
    }
    const nivelChip = e.target.closest('[data-nivel]');
    if (nivelChip) {
      const n = nivelChip.dataset.nivel;
      filtroForm.niveis.has(n) ? filtroForm.niveis.delete(n) : filtroForm.niveis.add(n);
      nivelChip.classList.toggle('selecionado');
      return;
    }
    const materiaTodosChip = e.target.closest('[data-materia-todos]');
    if (materiaTodosChip) {
      const todasJaSelecionadas = TODAS_MATERIAS.every(m => filtroForm.materias.has(m));
      if (todasJaSelecionadas) filtroForm.materias.clear();
      else TODAS_MATERIAS.forEach(m => filtroForm.materias.add(m));
      form.querySelectorAll('[data-materia]').forEach(chip => chip.classList.toggle('selecionado', filtroForm.materias.has(chip.dataset.materia)));
      sincronizarChipTodos(form);
      return;
    }
    const materiaChip = e.target.closest('[data-materia]');
    if (materiaChip) {
      const m = materiaChip.dataset.materia;
      filtroForm.materias.has(m) ? filtroForm.materias.delete(m) : filtroForm.materias.add(m);
      materiaChip.classList.toggle('selecionado');
      sincronizarChipTodos(form);
      return;
    }
    const quantidadeChip = e.target.closest('[data-quantidade]');
    if (quantidadeChip) {
      filtroForm.quantidade = Number(quantidadeChip.dataset.quantidade);
      form.querySelectorAll('[data-quantidade]').forEach(b => b.classList.toggle('selecionado', Number(b.dataset.quantidade) === filtroForm.quantidade));
    }
  });

  form.querySelectorAll('input[name="tempoModo"]').forEach(radio => {
    radio.addEventListener('change', () => {
      document.getElementById('tempoMinutos').style.display = document.querySelector('input[name="tempoModo"]:checked').value === 'com' ? 'inline-block' : 'none';
    });
  });

  document.getElementById('gerarConjuntoBtn').addEventListener('click', async () => {
    const erroEl = document.getElementById('criarConjuntoErro');
    erroEl.classList.remove('show');

    if (!filtroForm.niveis.size) return mostrarErroForm('Selecione ao menos um nível.');
    if (!filtroForm.materias.size) return mostrarErroForm('Selecione ao menos uma categoria.');

    const tempoModo = document.querySelector('input[name="tempoModo"]:checked').value;
    const minutos = Number(document.getElementById('tempoMinutos').value);
    if (tempoModo === 'com' && (!minutos || minutos <= 0)) return mostrarErroForm('Informe a duração em minutos.');

    try {
      const res = await fetch('/api/questoes/conjuntos/personalizado', {
        method: 'POST', headers: authHeaders(true),
        body: JSON.stringify({
          niveis: [...filtroForm.niveis], materias: [...filtroForm.materias], quantidade: filtroForm.quantidade,
          tempoLimiteSegundos: tempoModo === 'com' ? minutos * 60 : null,
          pool: filtroForm.pool
        })
      });
      const data = await res.json();
      if (!res.ok) return mostrarErroForm(data.msg || 'Erro ao criar conjunto.');
      window.location.href = `resolver-conjunto.html?id=${data._id}`;
    } catch (err) {
      mostrarErroForm('Erro ao criar conjunto.');
    }
  });
}

initFormularioConjunto();
initMeusPersonalizados();
