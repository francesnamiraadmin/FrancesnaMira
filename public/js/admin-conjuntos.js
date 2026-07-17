// =====================================================================
// ADMIN — Conjuntos de Questões (Fase 1)
// CRUD de conjuntos oficiais com curadoria manual de questões (busca/filtro
// no banco de questões + montagem de uma lista ordenada).
// =====================================================================

function authHeaders(json) {
  const token = localStorage.getItem('token');
  return Object.assign({ Authorization: 'Bearer ' + token }, json ? { 'Content-Type': 'application/json' } : {});
}

const NIVEIS_ADMIN = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

let conjuntoEditandoId = null;
let selecionadas = []; // [{ _id, codigo, enunciado, nivel, materia, tipo }] na ordem de curadoria

function mostrarView(nome) {
  document.getElementById('viewLista').style.display = nome === 'lista' ? 'block' : 'none';
  document.getElementById('viewEditor').style.display = nome === 'editor' ? 'block' : 'none';
}

// ===================== LISTA =====================

async function carregarConjuntos() {
  const lista = document.getElementById('conjuntosLista');
  try {
    const res = await fetch('/api/questoes/admin/conjuntos', { headers: authHeaders() });
    const conjuntos = res.ok ? await res.json() : [];
    if (!conjuntos.length) {
      lista.innerHTML = '<div class="vazio-box">Nenhum conjunto oficial criado ainda.</div>';
      return;
    }
    lista.innerHTML = conjuntos.map(c => `
      <div class="conjunto-item ${c.ativo ? '' : 'inativo'}">
        <div>
          <h4>${c.nome}${c.ativo ? '' : ' (inativo)'}${c.pool === 'simulado' ? ' <span class="pill">Simulado</span>' : ''}</h4>
          <div class="meta">${c.quantidadeQuestoes} questões · ${(c.filtros?.niveis || []).join('+') || '—'} · ${c.dificuldade || 'automática'}</div>
        </div>
        <button class="btn secundario pequeno" data-editar="${c._id}">Editar</button>
      </div>
    `).join('');
  } catch (err) {
    lista.innerHTML = '<div class="vazio-box">Erro ao carregar conjuntos.</div>';
  }
}

document.getElementById('conjuntosLista').addEventListener('click', e => {
  const btn = e.target.closest('[data-editar]');
  if (btn) abrirEditor(btn.dataset.editar);
});

document.getElementById('novoConjuntoBtn').addEventListener('click', () => abrirEditor(null));
document.getElementById('voltarListaBtn').addEventListener('click', () => { mostrarView('lista'); carregarConjuntos(); });

// ===================== EDITOR =====================

function preencherSelectsFiltro() {
  document.getElementById('filtroNivel').insertAdjacentHTML('beforeend', NIVEIS_ADMIN.map(n => `<option value="${n}">${n}</option>`).join(''));
  document.getElementById('filtroMateria').insertAdjacentHTML('beforeend', Object.entries(MATERIAS_LABELS).map(([k, v]) => `<option value="${k}">${v}</option>`).join(''));
}

async function abrirEditor(id) {
  conjuntoEditandoId = id;
  selecionadas = [];
  document.getElementById('conjuntoErro').style.display = 'none';
  document.getElementById('editorTitulo').textContent = id ? 'Editar Conjunto Oficial' : 'Novo Conjunto Oficial';
  document.getElementById('removerConjuntoBtn').style.display = id ? 'inline-block' : 'none';
  document.getElementById('conjuntoNome').value = '';
  document.getElementById('conjuntoDescricao').value = '';
  document.getElementById('conjuntoPool').value = 'praticar';
  document.getElementById('conjuntoDificuldade').value = '';
  document.getElementById('conjuntoTempo').value = '';
  document.getElementById('conjuntoAtivo').checked = true;
  document.getElementById('pickerLista').innerHTML = '';

  if (id) {
    const res = await fetch(`/api/questoes/admin/conjuntos/${id}`, { headers: authHeaders() });
    if (res.ok) {
      const c = await res.json();
      document.getElementById('conjuntoNome').value = c.nome;
      document.getElementById('conjuntoDescricao').value = c.descricao || '';
      document.getElementById('conjuntoPool').value = c.pool || 'praticar';
      document.getElementById('conjuntoDificuldade').value = c.dificuldade || '';
      document.getElementById('conjuntoTempo').value = c.tempoLimiteSegundos ? Math.round(c.tempoLimiteSegundos / 60) : '';
      document.getElementById('conjuntoAtivo').checked = c.ativo;
      selecionadas = c.questoes
        .slice().sort((a, b) => a.ordem - b.ordem)
        .map(q => ({ _id: q.questaoId._id, codigo: q.questaoId.codigo, enunciado: q.questaoId.enunciado, nivel: q.questaoId.nivel, materia: q.questaoId.materia, tipo: q.questaoId.tipo }));
    }
  }

  renderSelecionadas();
  mostrarView('editor');
}

function renderSelecionadas() {
  document.getElementById('selecionadasCount').textContent = selecionadas.length;
  const lista = document.getElementById('selecionadasLista');
  lista.innerHTML = selecionadas.length
    ? selecionadas.map((q, i) => `
      <div class="selecionada-item">
        <span class="ordem">${i + 1}.</span>
        <span class="enunciado" style="flex:1;">${q.enunciado}</span>
        <span class="tags">${q.nivel} · ${MATERIAS_LABELS[q.materia] || q.materia}</span>
        <button class="btn perigo pequeno" data-remover="${q._id}">Remover</button>
      </div>
    `).join('')
    : '<div class="vazio-box">Nenhuma questão selecionada ainda.</div>';
}

document.getElementById('selecionadasLista').addEventListener('click', e => {
  const btn = e.target.closest('[data-remover]');
  if (!btn) return;
  selecionadas = selecionadas.filter(q => q._id !== btn.dataset.remover);
  renderSelecionadas();
});

async function buscarQuestoes() {
  const nivel = document.getElementById('filtroNivel').value;
  const materia = document.getElementById('filtroMateria').value;
  const busca = document.getElementById('filtroBusca').value.trim();
  const qs = new URLSearchParams();
  if (nivel) qs.set('nivel', nivel);
  if (materia) qs.set('materia', materia);
  if (busca) qs.set('busca', busca);

  const lista = document.getElementById('pickerLista');
  lista.innerHTML = '<div class="vazio-box">Buscando...</div>';
  try {
    const res = await fetch(`/api/questoes/admin/questoes?${qs.toString()}`, { headers: authHeaders() });
    const questoes = res.ok ? await res.json() : [];
    const idsSelecionados = new Set(selecionadas.map(q => q._id));
    lista.innerHTML = questoes.length
      ? questoes.map(q => `
        <div class="picker-item">
          <span class="enunciado">${q.enunciado}</span>
          <span class="tags">${q.nivel} · ${NOMES_TIPO[q.tipo] || q.tipo}</span>
          <button class="btn secundario pequeno" data-adicionar="${q._id}" ${idsSelecionados.has(q._id) ? 'disabled' : ''}>${idsSelecionados.has(q._id) ? 'Adicionada' : '+ Adicionar'}</button>
        </div>
      `).join('')
      : '<div class="vazio-box">Nenhuma questão encontrada para este filtro.</div>';
    lista.dataset.resultado = JSON.stringify(questoes);
  } catch (err) {
    lista.innerHTML = '<div class="vazio-box">Erro ao buscar questões.</div>';
  }
}
document.getElementById('buscarQuestoesBtn').addEventListener('click', buscarQuestoes);

document.getElementById('pickerLista').addEventListener('click', e => {
  const btn = e.target.closest('[data-adicionar]');
  if (!btn || btn.disabled) return;
  const questoes = JSON.parse(document.getElementById('pickerLista').dataset.resultado || '[]');
  const q = questoes.find(x => x._id === btn.dataset.adicionar);
  if (q && !selecionadas.some(s => s._id === q._id)) {
    selecionadas.push({ _id: q._id, codigo: q.codigo, enunciado: q.enunciado, nivel: q.nivel, materia: q.materia, tipo: q.tipo });
    renderSelecionadas();
    buscarQuestoes();
  }
});

function mostrarErroConjunto(msg) {
  const el = document.getElementById('conjuntoErro');
  el.textContent = msg;
  el.style.display = 'block';
}

document.getElementById('salvarConjuntoBtn').addEventListener('click', async () => {
  document.getElementById('conjuntoErro').style.display = 'none';
  const nome = document.getElementById('conjuntoNome').value.trim();
  if (!nome) return mostrarErroConjunto('Informe o nome do conjunto.');
  if (!selecionadas.length) return mostrarErroConjunto('Selecione ao menos uma questão.');

  const tempoMin = Number(document.getElementById('conjuntoTempo').value);
  const payload = {
    nome, descricao: document.getElementById('conjuntoDescricao').value.trim(),
    pool: document.getElementById('conjuntoPool').value,
    dificuldade: document.getElementById('conjuntoDificuldade').value || undefined,
    tempoLimiteSegundos: tempoMin > 0 ? tempoMin * 60 : null,
    ativo: document.getElementById('conjuntoAtivo').checked,
    questoes: selecionadas.map(q => q._id)
  };

  const url = conjuntoEditandoId ? `/api/questoes/admin/conjuntos/${conjuntoEditandoId}` : '/api/questoes/admin/conjuntos';
  const metodo = conjuntoEditandoId ? 'PUT' : 'POST';
  try {
    const res = await fetch(url, { method: metodo, headers: authHeaders(true), body: JSON.stringify(payload) });
    const data = await res.json();
    if (!res.ok) return mostrarErroConjunto(data.msg || 'Erro ao salvar conjunto.');
    mostrarView('lista');
    carregarConjuntos();
  } catch (err) {
    mostrarErroConjunto('Erro ao salvar conjunto.');
  }
});

document.getElementById('removerConjuntoBtn').addEventListener('click', async () => {
  if (!conjuntoEditandoId || !confirm('Remover este conjunto? Ele deixará de ser visível para os alunos.')) return;
  await fetch(`/api/questoes/admin/conjuntos/${conjuntoEditandoId}`, { method: 'DELETE', headers: authHeaders() });
  mostrarView('lista');
  carregarConjuntos();
});

// ===================== INIT =====================
preencherSelectsFiltro();
carregarConjuntos();
