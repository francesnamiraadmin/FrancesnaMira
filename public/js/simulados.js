// =====================================================================
// SIMULADOS — página própria, reaproveitando o mesmo backend real de
// Conjunto/Tentativa já usado em Praticar/Personalizados — só filtrando
// por pool="simulado". Reaproveita as funções globais de renderização já
// definidas em js/conjuntoCard.js (conjuntoCardBase/renderPrioritarioCard/
// renderRespondidoCard/formatarTempo/authHeaders) e o clique delegado em
// `document` que já existe lá (data-iniciar/continuar/refazer/revisar),
// então não precisa reimplementar nada disso aqui — só buscar e desenhar
// os cards. Não carrega js/questoes.js (só usado pelas páginas antigas) —
// por isso NIVEIS é declarado aqui localmente, e usa MATERIAS_LABELS (8
// categorias, de js/questoesRender.js) em vez do MATERIAS antigo (6).
// =====================================================================

const NIVEIS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const QUANTIDADES_SIMULADO = [10, 20, 40];
const simFiltroForm = { niveis: new Set(), materias: new Set(), quantidade: 10 };

async function carregarSimulados() {
  const prioritariosEl = document.getElementById('simuladosPrioritarios');
  const respondidosEl = document.getElementById('simuladosRespondidos');
  try {
    const res = await fetch('/api/questoes/conjuntos?pool=simulado', { headers: authHeaders() });
    if (!res.ok) throw new Error('Erro ao carregar simulados.');
    const data = await res.json();

    const naoIniciados = data.prioritarios.naoIniciados;
    const emAndamento = data.prioritarios.emAndamento;
    const todos = [...emAndamento, ...naoIniciados];

    prioritariosEl.innerHTML = todos.length
      ? todos.map(renderPrioritarioCard).join('')
      : '<p class="conjuntos-vazio">Nenhum simulado disponível ainda — gere um personalizado abaixo.</p>';

    respondidosEl.innerHTML = data.respondidos.length
      ? data.respondidos.map(renderRespondidoCard).join('')
      : '<p class="conjuntos-vazio">Você ainda não concluiu nenhum simulado.</p>';
  } catch (err) {
    prioritariosEl.innerHTML = '<p class="conjuntos-vazio">Erro ao carregar simulados.</p>';
    respondidosEl.innerHTML = '';
  }
}

function renderSimChipsNiveis() {
  document.getElementById('simChipNiveis').innerHTML = NIVEIS.map(n =>
    `<button type="button" class="chip-toggle" data-simnivel="${n}">${n}</button>`
  ).join('');
}
function renderSimChipsMaterias() {
  document.getElementById('simChipMaterias').innerHTML = Object.entries(MATERIAS_LABELS).map(([k, v]) =>
    `<button type="button" class="chip-toggle" data-simmateria="${k}">${v}</button>`
  ).join('');
}
function renderSimChipsQuantidade() {
  document.getElementById('simChipQuantidade').innerHTML = QUANTIDADES_SIMULADO.map(q =>
    `<button type="button" class="chip-toggle ${q === simFiltroForm.quantidade ? 'selecionado' : ''}" data-simquantidade="${q}">${q} questões</button>`
  ).join('');
}

function initFormularioSimulado() {
  renderSimChipsNiveis();
  renderSimChipsMaterias();
  renderSimChipsQuantidade();

  const form = document.getElementById('criarSimuladoForm');

  document.getElementById('criarSimuladoBtn').addEventListener('click', () => {
    form.style.display = form.style.display === 'none' ? 'flex' : 'none';
  });
  document.getElementById('cancelarCriarSimuladoBtn').addEventListener('click', () => { form.style.display = 'none'; });

  form.addEventListener('click', e => {
    const nivelChip = e.target.closest('[data-simnivel]');
    if (nivelChip) {
      const n = nivelChip.dataset.simnivel;
      simFiltroForm.niveis.has(n) ? simFiltroForm.niveis.delete(n) : simFiltroForm.niveis.add(n);
      nivelChip.classList.toggle('selecionado');
      return;
    }
    const materiaChip = e.target.closest('[data-simmateria]');
    if (materiaChip) {
      const m = materiaChip.dataset.simmateria;
      simFiltroForm.materias.has(m) ? simFiltroForm.materias.delete(m) : simFiltroForm.materias.add(m);
      materiaChip.classList.toggle('selecionado');
      return;
    }
    const quantidadeChip = e.target.closest('[data-simquantidade]');
    if (quantidadeChip) {
      simFiltroForm.quantidade = Number(quantidadeChip.dataset.simquantidade);
      form.querySelectorAll('[data-simquantidade]').forEach(b => b.classList.toggle('selecionado', Number(b.dataset.simquantidade) === simFiltroForm.quantidade));
    }
  });

  form.querySelectorAll('input[name="simTempoModo"]').forEach(radio => {
    radio.addEventListener('change', () => {
      document.getElementById('simTempoMinutos').style.display = document.querySelector('input[name="simTempoModo"]:checked').value === 'com' ? 'inline-block' : 'none';
    });
  });

  document.getElementById('gerarSimuladoBtn').addEventListener('click', async () => {
    const erroEl = document.getElementById('criarSimuladoErro');
    erroEl.classList.remove('show');

    if (!simFiltroForm.niveis.size) return mostrarErroFormSim('Selecione ao menos um nível.');
    if (!simFiltroForm.materias.size) return mostrarErroFormSim('Selecione ao menos uma categoria.');

    const tempoModo = document.querySelector('input[name="simTempoModo"]:checked').value;
    const minutos = Number(document.getElementById('simTempoMinutos').value);
    if (tempoModo === 'com' && (!minutos || minutos <= 0)) return mostrarErroFormSim('Informe a duração em minutos.');

    try {
      const res = await fetch('/api/questoes/conjuntos/personalizado', {
        method: 'POST', headers: authHeaders(true),
        body: JSON.stringify({
          niveis: [...simFiltroForm.niveis], materias: [...simFiltroForm.materias], quantidade: simFiltroForm.quantidade,
          tempoLimiteSegundos: tempoModo === 'com' ? minutos * 60 : null,
          pool: 'simulado'
        })
      });
      const data = await res.json();
      if (!res.ok) return mostrarErroFormSim(data.msg || 'Erro ao criar simulado.');
      window.location.href = `resolver-conjunto.html?id=${data._id}`;
    } catch (err) {
      mostrarErroFormSim('Erro ao criar simulado.');
    }
  });

  function mostrarErroFormSim(msg) {
    const el = document.getElementById('criarSimuladoErro');
    el.textContent = msg;
    el.classList.add('show');
  }
}

function initSimuladosTab() {
  initFormularioSimulado();
  carregarSimulados();
}

initSimuladosTab();
