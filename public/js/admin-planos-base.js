const token = localStorage.getItem('token');
const authHeaders = (json) => Object.assign({ Authorization: 'Bearer ' + token }, json ? { 'Content-Type': 'application/json' } : {});

let planoIdAtual = null;

function mostrarView(nome) {
  document.getElementById('viewLista').style.display = nome === 'lista' ? 'block' : 'none';
  document.getElementById('viewEditor').style.display = nome === 'editor' ? 'block' : 'none';
}

const escHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ===================== LISTA =====================
let planosCache = [];
async function carregarPlanos() {
  const lista = document.getElementById('planosLista');
  lista.innerHTML = '<p style="opacity:0.6;">Carregando...</p>';
  try {
    const res = await fetch('/api/deveres/planos-base', { headers: authHeaders() });
    planosCache = await res.json();
    renderPlanos();
  } catch (err) {
    lista.innerHTML = '<div class="vazio-box">Erro ao carregar os planos-base.</div>';
  }
}
function renderPlanos() {
  const lista = document.getElementById('planosLista');
  const filtro = (document.getElementById('buscaPlano').value || '').toLowerCase();
  const planos = (Array.isArray(planosCache) ? planosCache : []).filter(p => (p.nome + ' ' + (p.curso || '')).toLowerCase().includes(filtro));
  if (!planos.length) {
    lista.innerHTML = `<div class="vazio-box" style="grid-column:1/-1;">${planosCache.length ? 'Nenhum plano com esse nome.' : 'Nenhum Plano-Base criado ainda.'}</div>`;
    return;
  }
  lista.innerHTML = planos.map(p => `
    <div class="plano-item">
      <div>
        <h4>${escHtml(p.nome)}</h4>
        <div class="meta">${p.curso ? escHtml(p.curso) + ' · ' : ''}criado em ${new Date(p.criadoEm).toLocaleDateString('pt-BR')}</div>
      </div>
      ${p.descricao ? `<div class="desc">${escHtml(p.descricao)}</div>` : ''}
      <div class="plano-stats">
        <div><strong>${p.totalSemanas}</strong><span>semanas</span></div>
        <div><strong>${p.totalAtividades ?? '—'}</strong><span>atividades</span></div>
        <div><strong>${p.totalDeveresCompletos ?? '—'}</strong><span>deveres completos</span></div>
        <div><strong>${p.totalAlunos ?? '—'}</strong><span>alunos usando</span></div>
      </div>
      <ul class="plano-previa" id="previa${p._id}">
        ${(p.semanas || []).map(s => `<li><span class="sem">Semana ${s.numero}${s.titulo ? ' · ' + escHtml(s.titulo) : ''}</span><br>${s.atividades.map(a => escHtml(a.titulo) + (a.tipo === 'exercicio_interativo' ? '<span class="tag-dc">dever completo</span>' : '')).join(' · ') || '<em>sem atividades</em>'}</li>`).join('')}
      </ul>
      <div class="plano-acoes">
        <button class="btn pequeno" data-editar="${p._id}">Editar</button>
        <button class="btn secundario pequeno" data-previa="${p._id}">Ver semanas</button>
        <button class="btn secundario pequeno" data-duplicar="${p._id}">Duplicar</button>
        <button class="btn perigo pequeno" data-excluir="${p._id}">Excluir</button>
      </div>
    </div>`).join('');
}
document.getElementById('buscaPlano').addEventListener('input', renderPlanos);
document.getElementById('planosLista').addEventListener('click', async e => {
  const previaBtn = e.target.closest('[data-previa]');
  if (previaBtn) {
    const el = document.getElementById('previa' + previaBtn.dataset.previa);
    el.classList.toggle('show');
    previaBtn.textContent = el.classList.contains('show') ? 'Ocultar semanas' : 'Ver semanas';
    return;
  }
  const duplicarBtn = e.target.closest('[data-duplicar]');
  if (duplicarBtn) {
    duplicarBtn.disabled = true;
    const res = await fetch('/api/deveres/planos-base/' + duplicarBtn.dataset.duplicar + '/duplicar', { method: 'POST', headers: authHeaders() });
    if (res.ok) { const copia = await res.json(); await carregarPlanos(); abrirEditor(copia._id); }
    else { duplicarBtn.disabled = false; (await Dialogo.aviso('Não foi possível duplicar.')); }
    return;
  }
  const editarBtn = e.target.closest('[data-editar]');
  if (editarBtn) return abrirEditor(editarBtn.dataset.editar);
  const excluirBtn = e.target.closest('[data-excluir]');
  if (excluirBtn) {
    if (!(await Dialogo.confirmar('Remover este Plano-Base? Alunos que já tiverem deveres gerados a partir dele não são afetados.'))) return;
    await fetch('/api/deveres/planos-base/' + excluirBtn.dataset.excluir, { method: 'DELETE', headers: authHeaders() });
    carregarPlanos();
  }
});
document.getElementById('novoPlanoBtn').addEventListener('click', () => abrirEditor(null));
document.getElementById('voltarListaBtn').addEventListener('click', () => { mostrarView('lista'); carregarPlanos(); });

// ===================== EDITOR =====================
async function abrirEditor(id) {
  planoIdAtual = id;
  document.getElementById('planoErro').style.display = 'none';
  document.getElementById('editorTitulo').textContent = id ? 'Editar Plano-Base' : 'Novo Plano-Base';
  document.getElementById('semanasWrap').innerHTML = '';

  if (id) {
    const res = await fetch('/api/deveres/planos-base/' + id, { headers: authHeaders() });
    const plano = await res.json();
    document.getElementById('planoNome').value = plano.nome || '';
    document.getElementById('planoCurso').value = plano.curso || '';
    document.getElementById('planoDescricao').value = plano.descricao || '';
    plano.semanas.forEach(s => adicionarSemanaBox(s));
  } else {
    document.getElementById('planoNome').value = '';
    document.getElementById('planoCurso').value = '';
    document.getElementById('planoDescricao').value = '';
    adicionarSemanaBox(null);
  }
  mostrarView('editor');
}

// Catálogo de deveres completos (blocos de questões) para o botão "+ Dever completo".
let catalogoDeveres = [];
fetch('/api/exercicios', { headers: authHeaders() }).then(r => r.ok ? r.json() : []).then(l => { catalogoDeveres = l; }).catch(() => {});

function semanaBoxHtml(numero) {
  return `<div class="semana-box" data-semana-box>
    <div class="semana-box-header">
      <h3 style="cursor:pointer;" data-recolher title="Clique para recolher/expandir">▾ Semana <span data-numero-semana>${numero}</span><span class="resumo-semana" data-resumo-semana></span></h3>
      <button type="button" class="btn perigo pequeno" data-remover-semana>Remover semana</button>
    </div>
    <div class="campo"><label>Título da semana</label><input type="text" data-campo="titulo" placeholder="Ex.: Introdução à argumentação"></div>
    <div data-atividades-wrap></div>
    <div class="dc-picker" data-dc-picker>
      <select data-dc-select></select>
      <div style="display:flex; gap:8px;"><button type="button" class="btn pequeno" data-dc-confirmar>Adicionar à semana</button><button type="button" class="btn secundario pequeno" data-dc-cancelar>Cancelar</button></div>
    </div>
    <div class="acoes-semana">
      <button type="button" class="btn pequeno" data-add-dever-completo>+ Dever completo</button>
      <button type="button" class="btn secundario pequeno" data-add-atividade>+ Outra atividade</button>
    </div>
  </div>`;
}

function atualizarResumoSemana(box) {
  const n = box.querySelectorAll('[data-atividade-box]').length;
  const titulo = box.querySelector('[data-campo="titulo"]').value.trim();
  box.querySelector('[data-resumo-semana]').textContent = `${titulo ? '· ' + titulo + ' · ' : '· '}${n} atividade${n === 1 ? '' : 's'}`;
}

function renumerarSemanas() {
  document.querySelectorAll('[data-semana-box]').forEach((box, i) => {
    box.querySelector('[data-numero-semana]').textContent = i + 1;
  });
}

function adicionarSemanaBox(semanaData) {
  const wrap = document.getElementById('semanasWrap');
  wrap.insertAdjacentHTML('beforeend', semanaBoxHtml((semanaData?.numero) || (wrap.children.length + 1)));
  const box = wrap.lastElementChild;
  if (semanaData) {
    box.querySelector('[data-campo="titulo"]').value = semanaData.titulo || '';
    const atividadesWrap = box.querySelector('[data-atividades-wrap]');
    (semanaData.atividades || []).forEach(a => DeverUI.adicionarAtividadeBox(atividadesWrap, a, authHeaders));
    DeverUI.resolverDependenciasIniciais(atividadesWrap);
  }
  renumerarSemanas();
}

document.getElementById('addSemanaBtn').addEventListener('click', () => adicionarSemanaBox(null));

document.getElementById('semanasWrap').addEventListener('click', async e => {
  if (e.target.closest('[data-recolher]')) {
    const box = e.target.closest('[data-semana-box]');
    atualizarResumoSemana(box);
    box.classList.toggle('recolhida');
    return;
  }
  if (e.target.closest('[data-add-dever-completo]')) {
    const box = e.target.closest('[data-semana-box]');
    const picker = box.querySelector('[data-dc-picker]');
    box.querySelector('[data-dc-select]').innerHTML = catalogoDeveres.length
      ? catalogoDeveres.map(d => `<option value="${d.slug}">[${escHtml(d.nivel || '')}] ${escHtml(d.titulo)} · ${d.questoes ? d.questoes + ' questões' : d.regras + ' regras'}</option>`).join('')
      : '<option value="">Carregando catálogo…</option>';
    picker.classList.add('show');
    return;
  }
  if (e.target.closest('[data-dc-cancelar]')) { e.target.closest('[data-dc-picker]').classList.remove('show'); return; }
  if (e.target.closest('[data-dc-confirmar]')) {
    const box = e.target.closest('[data-semana-box]');
    const slug = box.querySelector('[data-dc-select]').value;
    const def = catalogoDeveres.find(d => d.slug === slug);
    if (!def) return;
    const atividadesWrap = box.querySelector('[data-atividades-wrap]');
    DeverUI.adicionarAtividadeBox(atividadesWrap, {
      tipo: 'exercicio_interativo', titulo: def.titulo, descricao: def.descricao, obrigatoria: true, conteudo: { exercicioSlug: slug }
    }, authHeaders);
    DeverUI.atualizarOpcoesDependeDe(atividadesWrap);
    box.querySelector('[data-dc-picker]').classList.remove('show');
    atualizarResumoSemana(box);
    return;
  }
  if (e.target.closest('[data-remover-semana]')) {
    if (!(await Dialogo.confirmar('Remover esta semana do template?'))) return;
    e.target.closest('[data-semana-box]').remove();
    renumerarSemanas();
    return;
  }
  if (e.target.closest('[data-add-atividade]')) {
    const semanaBox = e.target.closest('[data-semana-box]');
    const atividadesWrap = semanaBox.querySelector('[data-atividades-wrap]');
    DeverUI.adicionarAtividadeBox(atividadesWrap, null, authHeaders);
    DeverUI.atualizarOpcoesDependeDe(atividadesWrap);
    return;
  }
  if (e.target.closest('[data-remover-atividade]')) {
    if (!(await Dialogo.confirmar('Remover esta atividade?'))) return;
    const atBox = e.target.closest('[data-atividade-box]');
    const atividadesWrap = atBox.closest('[data-atividades-wrap]');
    atBox.remove();
    DeverUI.atualizarOpcoesDependeDe(atividadesWrap);
  }
});
DeverUI.ligarEventosConteudo(document.getElementById('semanasWrap'), authHeaders);

// ===================== COLETAR ESTADO DO DOM E SALVAR =====================
function coletarSemanas() {
  return [...document.querySelectorAll('[data-semana-box]')].map((box, i) => ({
    numero: i + 1,
    titulo: box.querySelector('[data-campo="titulo"]').value.trim(),
    atividades: DeverUI.coletarAtividades(box)
  }));
}

document.getElementById('salvarPlanoBtn').addEventListener('click', async () => {
  const erroEl = document.getElementById('planoErro');
  const nome = document.getElementById('planoNome').value.trim();
  const semanas = coletarSemanas();
  if (!nome) { erroEl.textContent = 'Informe o nome do plano-base.'; erroEl.style.display = 'block'; return; }
  if (!semanas.length) { erroEl.textContent = 'Adicione ao menos uma semana.'; erroEl.style.display = 'block'; return; }

  const payload = {
    nome, curso: document.getElementById('planoCurso').value.trim(),
    descricao: document.getElementById('planoDescricao').value.trim(),
    semanas
  };
  const url = planoIdAtual ? '/api/deveres/planos-base/' + planoIdAtual : '/api/deveres/planos-base';
  const res = await fetch(url, { method: planoIdAtual ? 'PUT' : 'POST', headers: authHeaders(true), body: JSON.stringify(payload) });
  const data = await res.json();
  if (!res.ok) { erroEl.textContent = data.msg || 'Erro ao salvar.'; erroEl.style.display = 'block'; return; }
  mostrarView('lista');
  carregarPlanos();
});

// ===================== INIT =====================
DeverUI.carregarAuxiliares(authHeaders);
carregarPlanos();
