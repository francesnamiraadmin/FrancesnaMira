const token = localStorage.getItem('token');
const authHeaders = (json) => Object.assign({ Authorization: 'Bearer ' + token }, json ? { 'Content-Type': 'application/json' } : {});

let planoIdAtual = null;

function mostrarView(nome) {
  document.getElementById('viewLista').style.display = nome === 'lista' ? 'block' : 'none';
  document.getElementById('viewEditor').style.display = nome === 'editor' ? 'block' : 'none';
}

// ===================== LISTA =====================
async function carregarPlanos() {
  const lista = document.getElementById('planosLista');
  lista.innerHTML = '<p style="opacity:0.6;">Carregando...</p>';
  try {
    const res = await fetch('/api/deveres/planos-base', { headers: authHeaders() });
    const planos = await res.json();
    if (!Array.isArray(planos) || !planos.length) {
      lista.innerHTML = '<div class="vazio-box">Nenhum Plano-Base criado ainda.</div>';
      return;
    }
    lista.innerHTML = planos.map(p => `
      <div class="plano-item">
        <div>
          <h4>${p.nome}</h4>
          <div class="meta">${p.curso ? p.curso + ' · ' : ''}${p.totalSemanas} semana${p.totalSemanas === 1 ? '' : 's'}</div>
        </div>
        <div style="display:flex; gap:8px;">
          <button class="btn secundario pequeno" data-editar="${p._id}">Editar</button>
          <button class="btn perigo pequeno" data-excluir="${p._id}">Excluir</button>
        </div>
      </div>`).join('');
  } catch (err) {
    lista.innerHTML = '<div class="vazio-box">Erro ao carregar os planos-base.</div>';
  }
}
document.getElementById('planosLista').addEventListener('click', async e => {
  const editarBtn = e.target.closest('[data-editar]');
  if (editarBtn) return abrirEditor(editarBtn.dataset.editar);
  const excluirBtn = e.target.closest('[data-excluir]');
  if (excluirBtn) {
    if (!confirm('Remover este Plano-Base? Alunos que já tiverem deveres gerados a partir dele não são afetados.')) return;
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

function semanaBoxHtml(numero) {
  return `<div class="semana-box" data-semana-box>
    <div class="semana-box-header">
      <h3>Semana <span data-numero-semana>${numero}</span></h3>
      <button type="button" class="btn perigo pequeno" data-remover-semana>Remover semana</button>
    </div>
    <div class="campo"><label>Título da semana</label><input type="text" data-campo="titulo" placeholder="Ex.: Introdução à argumentação"></div>
    <div data-atividades-wrap></div>
    <button type="button" class="btn secundario pequeno" data-add-atividade>+ Adicionar atividade</button>
  </div>`;
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

document.getElementById('semanasWrap').addEventListener('click', e => {
  if (e.target.closest('[data-remover-semana]')) {
    if (!confirm('Remover esta semana do template?')) return;
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
    if (!confirm('Remover esta atividade?')) return;
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
