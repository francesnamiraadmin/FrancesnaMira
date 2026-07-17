// =====================================================================
// PLATAFORMA DE QUESTÕES — Conjuntos + Caderno de Revisão
// Aba Praticar = Conjuntos Sugeridos (oficiais, com filtro); aba
// Personalizados = conjuntos criados pelo próprio aluno via filtro; aba
// Caderno de Revisão = questões salvas (só é possível adicionar depois de
// responder um conjunto, na tela de resultado — ver resolverConjunto.js).
// Depende dos globais NIVEIS/MATERIAS/NOMES_TIPO/renderVisual definidos em
// js/questoes.js e js/questoesRender.js (carregados antes deste script) e
// é chamado por plataforma-questoes.html via `initConjuntosTab()`.
// =====================================================================

function authHeaders(json) {
  const token = localStorage.getItem('token');
  return Object.assign({ Authorization: 'Bearer ' + token }, json ? { 'Content-Type': 'application/json' } : {});
}

const QUANTIDADES_CONJUNTO = [10, 20, 40];
const filtroForm = { niveis: new Set(), materias: new Set(), quantidade: 10 };

let sugeridosRaw = []; // conjuntos oficiais (não iniciados + em andamento), antes do filtro

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
  const personalizadosEl = document.getElementById('conjuntosPersonalizados');
  const respondidosEl = document.getElementById('conjuntosRespondidos');
  try {
    const res = await fetch('/api/questoes/conjuntos', { headers: authHeaders() });
    if (!res.ok) throw new Error('Erro ao carregar conjuntos.');
    const data = await res.json();

    const todos = [...data.prioritarios.emAndamento, ...data.prioritarios.naoIniciados];
    sugeridosRaw = todos.filter(c => c.tipo === 'oficial');
    const personalizados = todos.filter(c => c.tipo === 'personalizado');

    renderSugeridos();

    personalizadosEl.innerHTML = personalizados.length
      ? personalizados.map(renderPrioritarioCard).join('')
      : '<p class="conjuntos-vazio">Você ainda não criou nenhum conjunto personalizado.</p>';

    respondidosEl.innerHTML = data.respondidos.length
      ? data.respondidos.map(renderRespondidoCard).join('')
      : '<p class="conjuntos-vazio">Você ainda não concluiu nenhum conjunto.</p>';
  } catch (err) {
    prioritariosEl.innerHTML = '<p class="conjuntos-vazio">Erro ao carregar conjuntos.</p>';
    personalizadosEl.innerHTML = '';
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

// ===================== FILTRO — CONJUNTOS SUGERIDOS =====================

function passaFiltroSugerido(c) {
  const nivel = document.getElementById('filtroSugeridoNivel').value;
  const materia = document.getElementById('filtroSugeridoMateria').value;
  const busca = document.getElementById('filtroSugeridoBusca').value.trim().toLowerCase();
  if (nivel && !(c.filtros?.niveis || []).includes(nivel)) return false;
  if (materia && !(c.filtros?.materias || []).includes(materia)) return false;
  if (busca && !c.nome.toLowerCase().includes(busca)) return false;
  return true;
}

function renderSugeridos() {
  const el = document.getElementById('conjuntosPrioritarios');
  const filtrados = sugeridosRaw.filter(passaFiltroSugerido);
  el.innerHTML = filtrados.length
    ? filtrados.map(renderPrioritarioCard).join('')
    : '<p class="conjuntos-vazio">Nenhum conjunto encontrado para esse filtro.</p>';
}

function initFiltroSugeridos() {
  document.getElementById('filtroSugeridoNivel').insertAdjacentHTML('beforeend', NIVEIS.map(n => `<option value="${n}">${n}</option>`).join(''));
  document.getElementById('filtroSugeridoMateria').insertAdjacentHTML('beforeend', Object.entries(MATERIAS).map(([k, v]) => `<option value="${k}">${v}</option>`).join(''));
  document.getElementById('filtroSugeridoNivel').addEventListener('change', renderSugeridos);
  document.getElementById('filtroSugeridoMateria').addEventListener('change', renderSugeridos);
  document.getElementById('filtroSugeridoBusca').addEventListener('input', renderSugeridos);
}

// ===================== CADERNO DE REVISÃO =====================

function renderCadernoItem(item) {
  const q = item.questao;
  const textoResposta = valor => {
    if (valor === null || valor === undefined) return '';
    return q.tipo === 'vf' ? (valor ? 'Vrai' : 'Faux') : valor;
  };
  return `<div class="q-card" style="margin-bottom:16px;">
    <div class="q-head">
      <span class="q-tags">
        <span class="q-tag">${NOMES_TIPO[q.tipo]}</span>
        <span class="q-pill">${q.nivel}</span>
        <span class="q-pill">${MATERIAS[q.materia] || q.materia}</span>
      </span>
    </div>
    ${q.visual ? renderVisual(q.visual) : ''}
    ${q.texto ? `<div class="q-texto">${q.texto}</div>` : ''}
    <div class="q-enunciado">${q.enunciado}</div>
    ${q.tipo === 'vf' ? `<div class="q-enunciado" style="font-weight:600;">Afirmação: « ${q.afirmacao} »</div>` : ''}
    <p>Resposta certa: <strong>${textoResposta(q.respostaCorreta)}</strong></p>
    <div class="q-gabarito show"><strong>Explicação:</strong> ${q.explicacao}</div>
    <div class="q-actions">
      <button class="q-btn secundario" data-remover-caderno="${item.questaoId}">Remover do Caderno</button>
    </div>
  </div>`;
}

async function carregarCaderno() {
  const alvo = document.getElementById('cadernoLista');
  alvo.innerHTML = '<p class="conjuntos-vazio">Carregando...</p>';
  try {
    const res = await fetch('/api/questoes/caderno', { headers: authHeaders() });
    const itens = res.ok ? await res.json() : [];
    alvo.innerHTML = itens.length
      ? itens.map(renderCadernoItem).join('')
      : '<p class="conjuntos-vazio">Nenhuma questão salva no Caderno de Revisão ainda. Depois de responder um conjunto, use "Adicionar ao Caderno de Revisão" na tela de resultado.</p>';
  } catch (err) {
    alvo.innerHTML = '<p class="conjuntos-vazio">Erro ao carregar o Caderno de Revisão.</p>';
  }
}
window.carregarCaderno = carregarCaderno;

document.addEventListener('click', async e => {
  const btn = e.target.closest('[data-remover-caderno]');
  if (!btn) return;
  const res = await fetch(`/api/questoes/caderno/${btn.dataset.removerCaderno}`, { method: 'DELETE', headers: authHeaders() });
  if (res.ok) carregarCaderno();
});

// ===================== FORMULÁRIO DE CRIAÇÃO (aba Personalizados) =====================

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
  initFiltroSugeridos();
  initFormularioConjunto();
  carregarConjuntos();
}
