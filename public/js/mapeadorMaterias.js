// =====================================================================
// MAPEADOR DE ESTUDOS — CRUD de Matérias e Conteúdos, com seletor de cor
// (colorPicker.js) em cada formulário. Uma matéria selecionada na grade de
// cima filtra os conteúdos exibidos embaixo.
// =====================================================================

function authHeaders(json) {
  const token = localStorage.getItem('token');
  return { Authorization: 'Bearer ' + token, ...(json ? { 'Content-Type': 'application/json' } : {}) };
}
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

let materias = [];
let conteudos = [];
let materiaSelecionadaId = null;
let editandoMateriaId = null;
let editandoConteudoId = null;
let corPickerMateria = null;
let corPickerConteudo = null;

async function carregarMaterias() {
  const res = await fetch('/api/estudos/materias', { headers: authHeaders() });
  materias = res.ok ? await res.json() : [];
  renderMateriasGrid();
}

function renderMateriasGrid() {
  const el = document.getElementById('materiasGrid');
  if (!materias.length) {
    el.innerHTML = '<p class="vazio-msg">Nenhuma matéria criada ainda. Comece criando a primeira.</p>';
    return;
  }
  el.innerHTML = materias.map(m => `
    <div class="materia-card ${m._id === materiaSelecionadaId ? 'selecionada' : ''}" style="--cor-item:${m.cor};" data-id="${m._id}">
      <div class="materia-card-topo">
        ${m.icone ? `<span class="icone-materia">${escapeHtml(m.icone)}</span>` : ''}
        <h3>${escapeHtml(m.nome)}</h3>
      </div>
      ${m.descricao ? `<p>${escapeHtml(m.descricao)}</p>` : ''}
      <div class="card-acoes">
        <button type="button" class="editar" data-id="${m._id}">Editar</button>
        <button type="button" class="apagar" data-id="${m._id}">Apagar</button>
      </div>
    </div>`).join('');
}

async function carregarConteudos(materiaId) {
  const res = await fetch('/api/estudos/conteudos?materiaId=' + materiaId, { headers: authHeaders() });
  conteudos = res.ok ? await res.json() : [];
  renderConteudosGrid();
}

function renderConteudosGrid() {
  const el = document.getElementById('conteudosGrid');
  if (!conteudos.length) {
    el.innerHTML = '<p class="vazio-msg">Nenhum conteúdo criado nesta matéria ainda.</p>';
    return;
  }
  el.innerHTML = conteudos.map(c => `
    <div class="conteudo-card" style="--cor-item:${c.cor};" data-id="${c._id}">
      <h3>${escapeHtml(c.nome)}</h3>
      ${c.descricao ? `<p>${escapeHtml(c.descricao)}</p>` : ''}
      <div class="card-acoes">
        <button type="button" class="editar" data-id="${c._id}">Editar</button>
        <button type="button" class="apagar" data-id="${c._id}">Apagar</button>
      </div>
    </div>`).join('');
}

function selecionarMateria(id) {
  materiaSelecionadaId = id;
  const materia = materias.find(m => m._id === id);
  document.getElementById('conteudosTituloRow').style.display = 'flex';
  document.getElementById('conteudosTitulo').textContent = `Conteúdos de ${materia ? materia.nome : ''}`;
  renderMateriasGrid();
  carregarConteudos(id);
}

// ===================== MODAL MATÉRIA =====================

function abrirModalMateria(materia) {
  editandoMateriaId = materia ? materia._id : null;
  document.getElementById('modalMateriaTitulo').textContent = materia ? 'Editar Matéria' : 'Nova Matéria';
  document.getElementById('materiaNome').value = materia ? materia.nome : '';
  document.getElementById('materiaIcone').value = materia ? (materia.icone || '') : '';
  document.getElementById('materiaDescricao').value = materia ? (materia.descricao || '') : '';
  document.getElementById('modalMateriaErro').textContent = '';
  corPickerMateria = montarSeletorCor(document.getElementById('materiaCorPicker'), { corInicial: materia ? materia.cor : undefined });
  document.getElementById('modalMateria').classList.add('show');
}
function fecharModalMateria() { document.getElementById('modalMateria').classList.remove('show'); }

async function salvarMateria() {
  const nome = document.getElementById('materiaNome').value.trim();
  const icone = document.getElementById('materiaIcone').value.trim();
  const descricao = document.getElementById('materiaDescricao').value.trim();
  const cor = corPickerMateria.getCor();
  const erroEl = document.getElementById('modalMateriaErro');
  if (!nome) { erroEl.textContent = 'Informe o nome da matéria.'; return; }

  const url = editandoMateriaId ? `/api/estudos/materias/${editandoMateriaId}` : '/api/estudos/materias';
  const res = await fetch(url, {
    method: editandoMateriaId ? 'PUT' : 'POST',
    headers: authHeaders(true),
    body: JSON.stringify({ nome, icone, descricao, cor })
  });
  const data = await res.json();
  if (!res.ok) { erroEl.textContent = data.msg || 'Erro ao salvar.'; return; }

  fecharModalMateria();
  await carregarMaterias();
}

async function apagarMateria(id) {
  if (!confirm('Apagar esta matéria? Isso só é possível se ela não tiver conteúdos.')) return;
  const res = await fetch(`/api/estudos/materias/${id}`, { method: 'DELETE', headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) { alert(data.msg || 'Erro ao apagar.'); return; }
  if (materiaSelecionadaId === id) {
    materiaSelecionadaId = null;
    document.getElementById('conteudosTituloRow').style.display = 'none';
    document.getElementById('conteudosGrid').innerHTML = '';
  }
  await carregarMaterias();
}

// ===================== MODAL CONTEÚDO =====================

function abrirModalConteudo(conteudo) {
  if (!materiaSelecionadaId) { alert('Selecione uma matéria primeiro.'); return; }
  editandoConteudoId = conteudo ? conteudo._id : null;
  document.getElementById('modalConteudoTitulo').textContent = conteudo ? 'Editar Conteúdo' : 'Novo Conteúdo';
  document.getElementById('conteudoNome').value = conteudo ? conteudo.nome : '';
  document.getElementById('conteudoDescricao').value = conteudo ? (conteudo.descricao || '') : '';
  document.getElementById('modalConteudoErro').textContent = '';
  const materia = materias.find(m => m._id === materiaSelecionadaId);
  corPickerConteudo = montarSeletorCor(document.getElementById('conteudoCorPicker'), { corInicial: conteudo ? conteudo.cor : (materia ? materia.cor : undefined) });
  document.getElementById('modalConteudo').classList.add('show');
}
function fecharModalConteudo() { document.getElementById('modalConteudo').classList.remove('show'); }

async function salvarConteudo() {
  const nome = document.getElementById('conteudoNome').value.trim();
  const descricao = document.getElementById('conteudoDescricao').value.trim();
  const cor = corPickerConteudo.getCor();
  const erroEl = document.getElementById('modalConteudoErro');
  if (!nome) { erroEl.textContent = 'Informe o nome do conteúdo.'; return; }

  const url = editandoConteudoId ? `/api/estudos/conteudos/${editandoConteudoId}` : '/api/estudos/conteudos';
  const res = await fetch(url, {
    method: editandoConteudoId ? 'PUT' : 'POST',
    headers: authHeaders(true),
    body: JSON.stringify({ materiaId: materiaSelecionadaId, nome, descricao, cor })
  });
  const data = await res.json();
  if (!res.ok) { erroEl.textContent = data.msg || 'Erro ao salvar.'; return; }

  fecharModalConteudo();
  await carregarConteudos(materiaSelecionadaId);
}

async function apagarConteudo(id) {
  if (!confirm('Apagar este conteúdo? Isso só é possível se ele não tiver sessões de estudo registradas.')) return;
  const res = await fetch(`/api/estudos/conteudos/${id}`, { method: 'DELETE', headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) { alert(data.msg || 'Erro ao apagar.'); return; }
  await carregarConteudos(materiaSelecionadaId);
}

// ===================== EVENTOS =====================

document.getElementById('btnNovaMateria').addEventListener('click', () => abrirModalMateria(null));
document.getElementById('btnCancelarMateria').addEventListener('click', fecharModalMateria);
document.getElementById('btnSalvarMateria').addEventListener('click', salvarMateria);

document.getElementById('btnNovoConteudo').addEventListener('click', () => abrirModalConteudo(null));
document.getElementById('btnCancelarConteudo').addEventListener('click', fecharModalConteudo);
document.getElementById('btnSalvarConteudo').addEventListener('click', salvarConteudo);

document.getElementById('materiasGrid').addEventListener('click', e => {
  const btnEditar = e.target.closest('button.editar');
  const btnApagar = e.target.closest('button.apagar');
  if (btnEditar) { abrirModalMateria(materias.find(m => m._id === btnEditar.dataset.id)); return; }
  if (btnApagar) { apagarMateria(btnApagar.dataset.id); return; }
  const card = e.target.closest('.materia-card');
  if (card) selecionarMateria(card.dataset.id);
});

document.getElementById('conteudosGrid').addEventListener('click', e => {
  const btnEditar = e.target.closest('button.editar');
  const btnApagar = e.target.closest('button.apagar');
  if (btnEditar) { abrirModalConteudo(conteudos.find(c => c._id === btnEditar.dataset.id)); return; }
  if (btnApagar) { apagarConteudo(btnApagar.dataset.id); return; }
});

carregarMaterias();
