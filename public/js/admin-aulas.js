const token = localStorage.getItem('token');
function authHeaders(json) {
  return { Authorization: 'Bearer ' + token, ...(json ? { 'Content-Type': 'application/json' } : {}) };
}
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

const CORES = ['#2563eb', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#db2777', '#65a30d'];
const NOMES_TIPO_MATERIAL = { pdf: 'PDF', imagem: 'Imagem', audio: 'Áudio', exercicio: 'Exercício', arquivo: 'Arquivo', link: 'Link' };

let modulos = [];
let moduloSelecionadoId = null;
let aulasDoModulo = [];
let videoTipoAtual = 'url';

// ===================== TABS =====================
document.querySelectorAll('.top-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.top-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tabModulos').style.display = tab.dataset.tab === 'modulos' ? 'block' : 'none';
    document.getElementById('tabEstatisticas').style.display = tab.dataset.tab === 'estatisticas' ? 'block' : 'none';
    if (tab.dataset.tab === 'estatisticas') carregarEstatisticas();
  });
});

// ===================== DRAG AND DROP (genérico) =====================
function ativarDragAndDrop(container, itemSelector, onReordenado) {
  let arrastando = null;
  container.querySelectorAll(itemSelector).forEach(item => {
    item.addEventListener('dragstart', () => {
      arrastando = item;
      setTimeout(() => { item.style.opacity = '0.4'; }, 0);
    });
    item.addEventListener('dragend', () => {
      item.style.opacity = '';
      container.querySelectorAll(itemSelector).forEach(i => i.classList.remove('drag-over-top', 'drag-over-bottom'));
    });
    item.addEventListener('dragover', e => {
      e.preventDefault();
      if (item === arrastando) return;
      const rect = item.getBoundingClientRect();
      const meio = rect.top + rect.height / 2;
      item.classList.toggle('drag-over-top', e.clientY < meio);
      item.classList.toggle('drag-over-bottom', e.clientY >= meio);
    });
    item.addEventListener('dragleave', () => item.classList.remove('drag-over-top', 'drag-over-bottom'));
    item.addEventListener('drop', e => {
      e.preventDefault();
      container.querySelectorAll(itemSelector).forEach(i => i.classList.remove('drag-over-top', 'drag-over-bottom'));
      if (!arrastando || item === arrastando) return;
      const rect = item.getBoundingClientRect();
      const meio = rect.top + rect.height / 2;
      if (e.clientY < meio) item.parentNode.insertBefore(arrastando, item);
      else item.parentNode.insertBefore(arrastando, item.nextSibling);
      const novaOrdem = Array.from(container.querySelectorAll(itemSelector)).map(el => el.dataset.id);
      onReordenado(novaOrdem);
    });
  });
}

// ===================== MÓDULOS =====================
async function carregarModulos() {
  const res = await fetch('/api/admin-aulas/modulos', { headers: authHeaders() });
  modulos = await res.json();
  renderModulos();
}

function renderModulos() {
  const wrap = document.getElementById('modulosLista');
  if (!modulos.length) { wrap.innerHTML = '<div class="vazio-aviso">Nenhum módulo ainda. Crie o primeiro!</div>'; return; }
  wrap.innerHTML = '';
  modulos.forEach(m => {
    const div = document.createElement('div');
    div.className = 'modulo-card' + (m._id === moduloSelecionadoId ? ' selecionado' : '') + (!m.ativo ? ' inativo' : '');
    div.draggable = true;
    div.dataset.id = m._id;
    div.innerHTML = `
      <div class="icone-swatch" style="background:${m.cor}22; color:${m.cor};">${m.icone || '📘'}</div>
      <div class="info">
        <div class="titulo">${escapeHtml(m.titulo)}</div>
        <div class="meta">${m.totalAulas} aula${m.totalAulas === 1 ? '' : 's'}${m.exigeModuloAnterior ? ' · 🔒 exige anterior' : ''}${!m.ativo ? ' · inativo' : ''}</div>
      </div>
      <div class="acoes">
        <button type="button" data-editar-modulo="${m._id}" title="Editar">✏️</button>
        <button type="button" data-excluir-modulo="${m._id}" title="Excluir">🗑️</button>
      </div>`;
    div.addEventListener('click', e => {
      if (e.target.closest('.acoes')) return;
      selecionarModulo(m._id);
    });
    wrap.appendChild(div);
  });
  ativarDragAndDrop(wrap, '.modulo-card', reordenarModulos);
}

async function reordenarModulos(idsOrdenados) {
  const ordens = idsOrdenados.map((id, i) => ({ id, ordem: i }));
  await fetch('/api/admin-aulas/modulos/reordenar', { method: 'PUT', headers: authHeaders(true), body: JSON.stringify({ ordens }) });
  carregarModulos();
}

document.getElementById('modulosLista').addEventListener('click', e => {
  const editar = e.target.closest('[data-editar-modulo]');
  if (editar) return abrirModalModulo(editar.dataset.editarModulo);
  const excluir = e.target.closest('[data-excluir-modulo]');
  if (excluir) return excluirModulo(excluir.dataset.excluirModulo);
});

async function excluirModulo(id) {
  if (!confirm('Desativar este módulo? Ele deixará de aparecer para os alunos.')) return;
  await fetch('/api/admin-aulas/modulos/' + id, { method: 'DELETE', headers: authHeaders() });
  if (moduloSelecionadoId === id) {
    moduloSelecionadoId = null;
    document.getElementById('aulasLista').innerHTML = '';
    document.getElementById('aulasCardTitulo').textContent = 'Selecione um módulo';
    document.getElementById('novaAulaBtn').disabled = true;
  }
  carregarModulos();
}

function selecionarModulo(id) {
  moduloSelecionadoId = id;
  renderModulos();
  document.getElementById('novaAulaBtn').disabled = false;
  const m = modulos.find(x => x._id === id);
  document.getElementById('aulasCardTitulo').textContent = m ? `Aulas — ${m.titulo}` : 'Aulas';
  carregarAulasDoModulo(id);
}

// ===================== AULAS (lista) =====================
async function carregarAulasDoModulo(moduloId) {
  if (!moduloId) return;
  const res = await fetch('/api/admin-aulas/aulas?moduloId=' + moduloId, { headers: authHeaders() });
  aulasDoModulo = await res.json();
  renderAulas();
}

function renderAulas() {
  const wrap = document.getElementById('aulasLista');
  if (!aulasDoModulo.length) { wrap.innerHTML = '<div class="vazio-aviso">Nenhuma aula neste módulo ainda.</div>'; return; }
  wrap.innerHTML = '';
  aulasDoModulo.forEach(a => {
    const div = document.createElement('div');
    div.className = 'aula-row' + (!a.ativo ? ' inativa' : '');
    div.draggable = true;
    div.dataset.id = a._id;
    const temVideo = a.video && (a.video.url || (a.video.arquivo && a.video.arquivo.caminho));
    div.innerHTML = `
      <span class="ordem-handle">⠿</span>
      <div class="info">
        <div class="titulo">${escapeHtml(a.titulo)}</div>
        <div class="meta">
          <span>${temVideo ? '🎬 com vídeo' : '⚠️ sem vídeo'}</span>
          <span>📎 ${(a.materiais || []).length} material(is)</span>
          ${!a.ativo ? '<span>inativa</span>' : ''}
        </div>
      </div>
      <select class="mover-select" data-mover="${a._id}">
        ${modulos.map(m => `<option value="${m._id}" ${m._id === a.moduloId ? 'selected' : ''}>${escapeHtml(m.titulo)}</option>`).join('')}
      </select>
      <div class="acoes">
        <button type="button" data-editar-aula="${a._id}" title="Editar">✏️</button>
        <button type="button" data-excluir-aula="${a._id}" title="Excluir">🗑️</button>
      </div>`;
    wrap.appendChild(div);
  });
  ativarDragAndDrop(wrap, '.aula-row', reordenarAulas);
}

async function reordenarAulas(idsOrdenados) {
  const ordens = idsOrdenados.map((id, i) => ({ id, ordem: i }));
  await fetch('/api/admin-aulas/aulas/reordenar', { method: 'PUT', headers: authHeaders(true), body: JSON.stringify({ ordens }) });
  carregarAulasDoModulo(moduloSelecionadoId);
}

document.getElementById('aulasLista').addEventListener('click', e => {
  const editar = e.target.closest('[data-editar-aula]');
  if (editar) return abrirModalAula(editar.dataset.editarAula);
  const excluir = e.target.closest('[data-excluir-aula]');
  if (excluir) return excluirAula(excluir.dataset.excluirAula);
});

document.getElementById('aulasLista').addEventListener('change', async e => {
  const sel = e.target.closest('[data-mover]');
  if (!sel) return;
  const aulaId = sel.dataset.mover;
  const novoModuloId = sel.value;
  if (novoModuloId === moduloSelecionadoId) return;
  const resContagem = await fetch('/api/admin-aulas/aulas?moduloId=' + novoModuloId, { headers: authHeaders() });
  const aulasDestino = await resContagem.json();
  await fetch('/api/admin-aulas/aulas/reordenar', {
    method: 'PUT', headers: authHeaders(true),
    body: JSON.stringify({ ordens: [{ id: aulaId, ordem: aulasDestino.length, moduloId: novoModuloId }] })
  });
  carregarAulasDoModulo(moduloSelecionadoId);
  carregarModulos();
});

async function excluirAula(id) {
  if (!confirm('Desativar esta aula? Ela deixará de aparecer para os alunos.')) return;
  await fetch('/api/admin-aulas/aulas/' + id, { method: 'DELETE', headers: authHeaders() });
  carregarAulasDoModulo(moduloSelecionadoId);
  carregarModulos();
}

// ===================== MODAL MÓDULO =====================
function renderCorSwatches(selecionada) {
  const wrap = document.getElementById('moduloCorSwatches');
  wrap.innerHTML = CORES.map(c => `<div class="cor-swatch${c === selecionada ? ' selecionada' : ''}" style="background:${c}" data-cor="${c}"></div>`).join('');
}
document.getElementById('moduloCorSwatches').addEventListener('click', e => {
  const sw = e.target.closest('.cor-swatch');
  if (!sw) return;
  document.getElementById('moduloCor').value = sw.dataset.cor;
  renderCorSwatches(sw.dataset.cor);
});

function abrirModalModulo(id) {
  const m = id ? modulos.find(x => x._id === id) : null;
  document.getElementById('modalModuloTitulo').textContent = m ? 'Editar módulo' : 'Novo módulo';
  document.getElementById('moduloId').value = m ? m._id : '';
  document.getElementById('moduloTitulo').value = m ? m.titulo : '';
  document.getElementById('moduloDescricao').value = m ? (m.descricao || '') : '';
  document.getElementById('moduloIcone').value = m ? (m.icone || '📘') : '📘';
  document.getElementById('moduloCor').value = m ? (m.cor || CORES[0]) : CORES[0];
  renderCorSwatches(document.getElementById('moduloCor').value);
  document.getElementById('moduloExigeAnterior').checked = m ? !!m.exigeModuloAnterior : false;
  document.getElementById('moduloAtivo').checked = m ? m.ativo !== false : true;
  document.getElementById('moduloErro').style.display = 'none';
  document.getElementById('modalModulo').classList.add('show');
}
document.getElementById('novoModuloBtn').addEventListener('click', () => abrirModalModulo(null));
document.getElementById('fecharModuloBtn').addEventListener('click', () => document.getElementById('modalModulo').classList.remove('show'));

document.getElementById('salvarModuloBtn').addEventListener('click', async () => {
  const id = document.getElementById('moduloId').value;
  const erroEl = document.getElementById('moduloErro');
  const payload = {
    titulo: document.getElementById('moduloTitulo').value.trim(),
    descricao: document.getElementById('moduloDescricao').value.trim(),
    icone: document.getElementById('moduloIcone').value.trim() || '📘',
    cor: document.getElementById('moduloCor').value,
    exigeModuloAnterior: document.getElementById('moduloExigeAnterior').checked,
    ativo: document.getElementById('moduloAtivo').checked
  };
  if (!payload.titulo) { erroEl.textContent = 'Informe o título do módulo.'; erroEl.style.display = 'block'; return; }

  const url = id ? '/api/admin-aulas/modulos/' + id : '/api/admin-aulas/modulos';
  const res = await fetch(url, { method: id ? 'PUT' : 'POST', headers: authHeaders(true), body: JSON.stringify(payload) });
  const data = await res.json();
  if (!res.ok) { erroEl.textContent = data.msg || 'Erro ao salvar módulo.'; erroEl.style.display = 'block'; return; }

  document.getElementById('modalModulo').classList.remove('show');
  await carregarModulos();
  if (id) selecionarModulo(id);
});

// ===================== MODAL AULA =====================
function setVideoTipo(tipo) {
  videoTipoAtual = tipo;
  document.getElementById('tabVideoUrl').classList.toggle('active', tipo === 'url');
  document.getElementById('tabVideoUpload').classList.toggle('active', tipo === 'upload');
  document.getElementById('videoUrlWrap').style.display = tipo === 'url' ? 'block' : 'none';
  document.getElementById('videoUploadWrap').style.display = tipo === 'upload' ? 'block' : 'none';
}
document.getElementById('tabVideoUrl').addEventListener('click', () => setVideoTipo('url'));
document.getElementById('tabVideoUpload').addEventListener('click', () => setVideoTipo('upload'));

function atualizarSelectModulo() {
  const sel = document.getElementById('aulaModuloId');
  sel.innerHTML = modulos.map(m => `<option value="${m._id}">${escapeHtml(m.titulo)}</option>`).join('');
}

function renderMateriaisModal(materiais) {
  const wrap = document.getElementById('materiaisLista');
  if (!materiais.length) { wrap.innerHTML = '<p style="color:var(--cinza-400); font-size:0.85rem; margin-bottom:10px;">Nenhum material ainda.</p>'; return; }
  wrap.innerHTML = materiais.map(m => `
    <div class="material-item">
      <div class="info"><strong>${escapeHtml(m.nome)}</strong><span>${NOMES_TIPO_MATERIAL[m.tipo] || m.tipo}${m.tipo === 'link' ? ' · ' + escapeHtml(m.url || '') : ''}</span></div>
      <button type="button" class="btn perigo pequeno" data-remover-material="${m._id}">Remover</button>
    </div>`).join('');
}

async function abrirModalAula(id) {
  const editando = !!id;
  let aula = null;
  if (editando) {
    const res = await fetch('/api/admin-aulas/aulas/' + id, { headers: authHeaders() });
    aula = await res.json();
  }

  document.getElementById('modalAulaTitulo').textContent = editando ? 'Editar aula' : 'Nova aula';
  document.getElementById('aulaId').value = editando ? aula._id : '';
  atualizarSelectModulo();
  document.getElementById('aulaModuloId').value = editando ? aula.moduloId : moduloSelecionadoId;
  document.getElementById('aulaTitulo').value = editando ? aula.titulo : '';
  document.getElementById('aulaDescricao').value = editando ? (aula.descricao || '') : '';
  document.getElementById('aulaObservacoes').value = editando ? (aula.observacoesProfessor || '') : '';
  document.getElementById('aulaAtivo').checked = editando ? aula.ativo !== false : true;
  document.getElementById('aulaVideoDuracao').value = editando && aula.video ? (aula.video.duracaoSegundos || '') : '';
  document.getElementById('aulaVideoArquivo').value = '';

  const tipoVideo = editando && aula.video ? aula.video.tipo : 'url';
  setVideoTipo(tipoVideo);
  document.getElementById('aulaVideoUrl').value = editando && aula.video && aula.video.tipo === 'url' ? (aula.video.url || '') : '';

  document.getElementById('aulaErro').style.display = 'none';
  document.getElementById('videoErro').style.display = 'none';
  document.getElementById('materialErro').style.display = 'none';

  if (editando) {
    document.getElementById('videoUploadBloqueado').style.display = 'none';
    document.getElementById('videoUploadArea').style.display = 'block';
    document.getElementById('materiaisBloqueado').style.display = 'none';
    document.getElementById('materiaisArea').style.display = 'block';
    const temUpload = aula.video && aula.video.tipo === 'upload' && aula.video.arquivo && aula.video.arquivo.caminho;
    document.getElementById('videoAtualInfo').textContent = temUpload
      ? `Vídeo atual: ${(aula.video.arquivo.tamanho / 1024 / 1024).toFixed(1)} MB`
      : 'Nenhum vídeo enviado ainda.';
    renderMateriaisModal(aula.materiais || []);
  } else {
    document.getElementById('videoUploadBloqueado').style.display = 'block';
    document.getElementById('videoUploadArea').style.display = 'none';
    document.getElementById('materiaisBloqueado').style.display = 'block';
    document.getElementById('materiaisArea').style.display = 'none';
  }

  document.getElementById('modalAula').classList.add('show');
}

document.getElementById('novaAulaBtn').addEventListener('click', () => abrirModalAula(null));
document.getElementById('fecharAulaBtn').addEventListener('click', () => {
  document.getElementById('modalAula').classList.remove('show');
  carregarAulasDoModulo(moduloSelecionadoId);
  carregarModulos();
});

document.getElementById('salvarAulaBtn').addEventListener('click', async () => {
  const id = document.getElementById('aulaId').value;
  const erroEl = document.getElementById('aulaErro');
  const titulo = document.getElementById('aulaTitulo').value.trim();
  const moduloId = document.getElementById('aulaModuloId').value;
  if (!titulo) { erroEl.textContent = 'Informe o título da aula.'; erroEl.style.display = 'block'; return; }
  if (!moduloId) { erroEl.textContent = 'Selecione um módulo.'; erroEl.style.display = 'block'; return; }

  const payload = {
    moduloId,
    titulo,
    descricao: document.getElementById('aulaDescricao').value.trim(),
    observacoesProfessor: document.getElementById('aulaObservacoes').value.trim(),
    ativo: document.getElementById('aulaAtivo').checked
  };
  const duracao = document.getElementById('aulaVideoDuracao').value;
  if (videoTipoAtual === 'url') {
    payload.video = {
      tipo: 'url',
      url: document.getElementById('aulaVideoUrl').value.trim(),
      duracaoSegundos: duracao ? Number(duracao) : undefined
    };
  }

  const url = id ? '/api/admin-aulas/aulas/' + id : '/api/admin-aulas/aulas';
  const res = await fetch(url, { method: id ? 'PUT' : 'POST', headers: authHeaders(true), body: JSON.stringify(payload) });
  const data = await res.json();
  if (!res.ok) { erroEl.textContent = data.msg || 'Erro ao salvar aula.'; erroEl.style.display = 'block'; return; }
  erroEl.style.display = 'none';

  await carregarModulos();
  await abrirModalAula(data._id);
  carregarAulasDoModulo(moduloSelecionadoId);
});

// ---------- upload de vídeo ----------
document.getElementById('aulaVideoArquivo').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const urlTemp = URL.createObjectURL(file);
  const videoTemp = document.createElement('video');
  videoTemp.preload = 'metadata';
  videoTemp.onloadedmetadata = () => {
    URL.revokeObjectURL(urlTemp);
    if (videoTemp.duration && isFinite(videoTemp.duration)) {
      document.getElementById('aulaVideoDuracao').value = Math.round(videoTemp.duration);
    }
  };
  videoTemp.src = urlTemp;
});

document.getElementById('enviarVideoBtn').addEventListener('click', async () => {
  const id = document.getElementById('aulaId').value;
  const fileInput = document.getElementById('aulaVideoArquivo');
  const erroEl = document.getElementById('videoErro');
  if (!fileInput.files[0]) { erroEl.textContent = 'Selecione um arquivo de vídeo.'; erroEl.style.display = 'block'; return; }

  const form = new FormData();
  form.append('video', fileInput.files[0]);
  const duracao = document.getElementById('aulaVideoDuracao').value;
  if (duracao) form.append('duracaoSegundos', duracao);

  const btn = document.getElementById('enviarVideoBtn');
  btn.disabled = true;
  btn.textContent = 'Enviando...';
  try {
    const res = await fetch(`/api/admin-aulas/aulas/${id}/video`, { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: form });
    const data = await res.json();
    if (!res.ok) { erroEl.textContent = data.msg || 'Erro ao enviar vídeo.'; erroEl.style.display = 'block'; return; }
    erroEl.style.display = 'none';
    setVideoTipo('upload');
    document.getElementById('videoAtualInfo').textContent = `Vídeo atual: ${(data.video.arquivo.tamanho / 1024 / 1024).toFixed(1)} MB`;
    fileInput.value = '';
    carregarAulasDoModulo(moduloSelecionadoId);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Enviar vídeo';
  }
});

document.getElementById('removerVideoBtn').addEventListener('click', async () => {
  const id = document.getElementById('aulaId').value;
  if (!id) return;
  if (!confirm('Remover o vídeo desta aula?')) return;
  await fetch(`/api/admin-aulas/aulas/${id}/video`, { method: 'DELETE', headers: authHeaders() });
  document.getElementById('videoAtualInfo').textContent = 'Nenhum vídeo enviado ainda.';
  carregarAulasDoModulo(moduloSelecionadoId);
});

// ---------- materiais ----------
document.getElementById('novoMaterialTipo').addEventListener('change', e => {
  const isLink = e.target.value === 'link';
  document.getElementById('novoMaterialArquivoWrap').style.display = isLink ? 'none' : 'block';
  document.getElementById('novoMaterialUrlWrap').style.display = isLink ? 'block' : 'none';
});

document.getElementById('materiaisLista').addEventListener('click', async e => {
  const btn = e.target.closest('[data-remover-material]');
  if (!btn) return;
  const aulaId = document.getElementById('aulaId').value;
  if (!confirm('Remover este material?')) return;
  const res = await fetch(`/api/admin-aulas/aulas/${aulaId}/materiais/${btn.dataset.removerMaterial}`, { method: 'DELETE', headers: authHeaders() });
  const data = await res.json();
  renderMateriaisModal(data.materiais || []);
  carregarAulasDoModulo(moduloSelecionadoId);
});

document.getElementById('addMaterialBtn').addEventListener('click', async () => {
  const aulaId = document.getElementById('aulaId').value;
  const erroEl = document.getElementById('materialErro');
  const nome = document.getElementById('novoMaterialNome').value.trim();
  const tipo = document.getElementById('novoMaterialTipo').value;
  if (!nome) { erroEl.textContent = 'Informe o nome do material.'; erroEl.style.display = 'block'; return; }

  const form = new FormData();
  form.append('nome', nome);
  form.append('tipo', tipo);
  if (tipo === 'link') {
    const url = document.getElementById('novoMaterialUrl').value.trim();
    if (!url) { erroEl.textContent = 'Informe a URL do link.'; erroEl.style.display = 'block'; return; }
    form.append('url', url);
  } else {
    const arquivo = document.getElementById('novoMaterialArquivo').files[0];
    if (!arquivo) { erroEl.textContent = 'Selecione um arquivo.'; erroEl.style.display = 'block'; return; }
    form.append('arquivo', arquivo);
  }

  const res = await fetch(`/api/admin-aulas/aulas/${aulaId}/materiais`, { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: form });
  const data = await res.json();
  if (!res.ok) { erroEl.textContent = data.msg || 'Erro ao adicionar material.'; erroEl.style.display = 'block'; return; }
  erroEl.style.display = 'none';
  document.getElementById('novoMaterialNome').value = '';
  document.getElementById('novoMaterialUrl').value = '';
  document.getElementById('novoMaterialArquivo').value = '';
  renderMateriaisModal(data.materiais || []);
  carregarAulasDoModulo(moduloSelecionadoId);
});

// ===================== ESTATÍSTICAS =====================
function formatarDuracao(segundos) {
  if (!segundos) return '—';
  const h = Math.floor(segundos / 3600);
  const m = Math.round((segundos % 3600) / 60);
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

async function carregarEstatisticas() {
  const res = await fetch('/api/admin-aulas/estatisticas', { headers: authHeaders() });
  const s = await res.json();
  const kpi = (rotulo, valor) => `<div class="kpi"><div class="valor">${valor}</div><div class="rotulo">${rotulo}</div></div>`;
  document.getElementById('statsKpiRow').innerHTML = [
    kpi('Alunos elegíveis', s.alunosElegiveis),
    kpi('Alunos com progresso', s.alunosComProgresso),
    kpi('Aulas publicadas', s.totalAulasAtivas),
    kpi('Progresso médio', s.percentualMedio + '%'),
    kpi('Aulas nunca assistidas', s.aulasNuncaAssistidas),
    kpi('Tempo médio de estudo', formatarDuracao(s.tempoMedioSegundos))
  ].join('');

  document.getElementById('statsVideosTbody').innerHTML = s.videosMaisAssistidos.length
    ? s.videosMaisAssistidos.map(v => `<tr><td>${escapeHtml(v.titulo)}</td><td>${v.visualizacoes}</td></tr>`).join('')
    : '<tr><td colspan="2">Sem dados ainda.</td></tr>';

  document.getElementById('statsModulosTbody').innerHTML = s.modulosMaisConcluidos.length
    ? s.modulosMaisConcluidos.map(m => `<tr><td>${m.icone || ''} ${escapeHtml(m.titulo)}</td><td>${m.alunosCompletos}</td></tr>`).join('')
    : '<tr><td colspan="2">Sem dados ainda.</td></tr>';
}

carregarModulos();
