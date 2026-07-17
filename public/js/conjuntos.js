// =====================================================================
// ABA PRATICAR — Conjuntos de Questões (Fase 1)
// Lista Conjuntos Prioritários (não iniciados/em andamento) e Respondidos,
// e o formulário de criação de conjunto personalizado por filtro.
// Depende dos globais NIVEIS/MATERIAS definidos em js/questoes.js (já
// carregado antes deste script) e é chamado por plataforma-questoes.html
// via `initConjuntosTab()`.
// =====================================================================

function authHeaders(json) {
  const token = localStorage.getItem('token');
  return Object.assign({ Authorization: 'Bearer ' + token }, json ? { 'Content-Type': 'application/json' } : {});
}

const QUANTIDADES_CONJUNTO = [10, 20, 40];
const filtroForm = { niveis: new Set(), materias: new Set(), quantidade: 10 };

function badgeFiltros(c) {
  const niveis = (c.filtros?.niveis || []).join('+');
  const materias = (c.filtros?.materias || []).map(m => MATERIAS[m] || m).join(', ');
  return [niveis, materias].filter(Boolean).join(' · ');
}

function formatarTempo(seg) {
  if (!seg) return null;
  const m = Math.round(seg / 60);
  return `${m} min`;
}

function conjuntoCardBase(c) {
  return `
    <span class="conjunto-status ${c.status}">${{ nao_iniciado: 'Não iniciado', em_andamento: 'Em andamento', concluido: 'Concluído' }[c.status]}</span>
    <h3>${c.nome}</h3>
    ${c.descricao ? `<p class="conjunto-desc">${c.descricao}</p>` : ''}
    <div class="conjunto-tags">
      <span class="q-pill">${c.quantidadeQuestoes} questões</span>
      ${c.dificuldade ? `<span class="q-pill">${c.dificuldade}</span>` : ''}
      ${c.tempoLimiteSegundos ? `<span class="q-pill">⏱️ ${formatarTempo(c.tempoLimiteSegundos)}</span>` : '<span class="q-pill">Sem limite de tempo</span>'}
    </div>
    <p class="conjunto-desc">${badgeFiltros(c)}</p>
    ${c.mediaPercentualAcertos !== null && c.mediaPercentualAcertos !== undefined ? `<p class="conjunto-desc">Média de acertos dos alunos: <strong>${c.mediaPercentualAcertos}%</strong></p>` : ''}
  `;
}

function renderPrioritarioCard(c) {
  const acao = c.status === 'em_andamento'
    ? `<button class="q-btn" data-continuar="${c._id}">Continuar</button>`
    : `<button class="q-btn" data-iniciar="${c._id}">Iniciar</button>`;
  return `<div class="conjunto-card destaque">
    ${conjuntoCardBase(c)}
    ${c.status === 'em_andamento' ? `<p class="conjunto-desc">${c.questoesRespondidas}/${c.quantidadeQuestoes} respondidas</p>` : ''}
    <div class="conjunto-acoes">${acao}</div>
  </div>`;
}

function renderRespondidoCard(c) {
  const t = c.ultimaTentativa;
  const data = new Date(t.finalizadaEm).toLocaleDateString('pt-BR');
  return `<div class="conjunto-card">
    ${conjuntoCardBase(c)}
    <div class="conjunto-resultado">
      Nota: <strong>${t.totalCorretas}/${t.totalQuestoes}</strong> (${t.percentualAcertos}%) — ${data}
      ${t.tempoGastoSegundos ? ` — ${formatarTempo(t.tempoGastoSegundos)}` : ''}
      ${c.totalTentativas > 1 ? ` — ${c.totalTentativas}ª tentativas` : ''}
    </div>
    <div class="conjunto-acoes">
      <button class="q-btn secundario" data-revisar="${t._id}">Revisar</button>
      <button class="q-btn" data-refazer="${c._id}">Refazer</button>
    </div>
  </div>`;
}

async function carregarConjuntos() {
  const prioritariosEl = document.getElementById('conjuntosPrioritarios');
  const respondidosEl = document.getElementById('conjuntosRespondidos');
  try {
    const res = await fetch('/api/questoes/conjuntos', { headers: authHeaders() });
    if (!res.ok) throw new Error('Erro ao carregar conjuntos.');
    const data = await res.json();

    const prioritarios = [...data.prioritarios.emAndamento, ...data.prioritarios.naoIniciados];
    prioritariosEl.innerHTML = prioritarios.length
      ? prioritarios.map(renderPrioritarioCard).join('')
      : '<p class="conjuntos-vazio">Nenhum conjunto pendente — crie um conjunto personalizado para começar a praticar.</p>';

    respondidosEl.innerHTML = data.respondidos.length
      ? data.respondidos.map(renderRespondidoCard).join('')
      : '<p class="conjuntos-vazio">Você ainda não concluiu nenhum conjunto.</p>';
  } catch (err) {
    prioritariosEl.innerHTML = '<p class="conjuntos-vazio">Erro ao carregar conjuntos.</p>';
    respondidosEl.innerHTML = '';
  }
}

document.addEventListener('click', e => {
  const iniciar = e.target.closest('[data-iniciar]');
  if (iniciar) return window.location.href = `resolver-conjunto.html?id=${iniciar.dataset.iniciar}`;

  const continuar = e.target.closest('[data-continuar]');
  if (continuar) return window.location.href = `resolver-conjunto.html?id=${continuar.dataset.continuar}`;

  const refazer = e.target.closest('[data-refazer]');
  if (refazer) return window.location.href = `resolver-conjunto.html?id=${refazer.dataset.refazer}`;

  const revisar = e.target.closest('[data-revisar]');
  if (revisar) return window.location.href = `resolver-conjunto.html?tentativaId=${revisar.dataset.revisar}`;
});

// ===================== FORMULÁRIO DE CRIAÇÃO =====================

function renderChipsNiveis() {
  document.getElementById('chipNiveis').innerHTML = NIVEIS.map(n =>
    `<button type="button" class="chip-toggle" data-nivel="${n}">${n}</button>`
  ).join('');
}

function renderChipsMaterias() {
  document.getElementById('chipMaterias').innerHTML = Object.entries(MATERIAS).map(([k, v]) =>
    `<button type="button" class="chip-toggle" data-materia="${k}">${v}</button>`
  ).join('');
}

function renderChipsQuantidade() {
  document.getElementById('chipQuantidade').innerHTML = QUANTIDADES_CONJUNTO.map(q =>
    `<button type="button" class="chip-toggle ${q === filtroForm.quantidade ? 'selecionado' : ''}" data-quantidade="${q}">${q} questões</button>`
  ).join('');
}

function initFormularioConjunto() {
  renderChipsNiveis();
  renderChipsMaterias();
  renderChipsQuantidade();

  const form = document.getElementById('criarConjuntoForm');

  document.getElementById('criarConjuntoBtn').addEventListener('click', () => {
    form.style.display = form.style.display === 'none' ? 'flex' : 'none';
  });
  document.getElementById('cancelarCriarConjuntoBtn').addEventListener('click', () => { form.style.display = 'none'; });

  form.addEventListener('click', e => {
    const nivelChip = e.target.closest('[data-nivel]');
    if (nivelChip) {
      const n = nivelChip.dataset.nivel;
      filtroForm.niveis.has(n) ? filtroForm.niveis.delete(n) : filtroForm.niveis.add(n);
      nivelChip.classList.toggle('selecionado');
      return;
    }
    const materiaChip = e.target.closest('[data-materia]');
    if (materiaChip) {
      const m = materiaChip.dataset.materia;
      filtroForm.materias.has(m) ? filtroForm.materias.delete(m) : filtroForm.materias.add(m);
      materiaChip.classList.toggle('selecionado');
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
          tempoLimiteSegundos: tempoModo === 'com' ? minutos * 60 : null
        })
      });
      const data = await res.json();
      if (!res.ok) return mostrarErroForm(data.msg || 'Erro ao criar conjunto.');
      window.location.href = `resolver-conjunto.html?id=${data._id}`;
    } catch (err) {
      mostrarErroForm('Erro ao criar conjunto.');
    }
  });

  function mostrarErroForm(msg) {
    erroFormEl().textContent = msg;
    erroFormEl().classList.add('show');
  }
  function erroFormEl() { return document.getElementById('criarConjuntoErro'); }
}

function initConjuntosTab() {
  initFormularioConjunto();
  carregarConjuntos();
}
