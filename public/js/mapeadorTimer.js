// =====================================================================
// MAPEADOR DE ESTUDOS — Timer/Matérias. Central única de organização:
// cada Matéria é um card na cor escolhida pelo usuário, com os Conteúdos
// dela como subcards dentro — clicar "Iniciar" num subcard delega pro
// serviço global (public/js/estudoTimerGlobal.js), que cuida da barra
// fixa persistente e sobrevive à navegação. Esta página só mostra/edita
// a hierarquia Matéria→Conteúdo e dispara o início da sessão; o
// cronômetro em si nunca vive aqui.
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
function formatarDuracaoLonga(seg) {
  const totalSeg = seg || 0;
  const h = Math.floor(totalSeg / 3600);
  const m = Math.floor((totalSeg % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}min`;
  if (m > 0) return `${m} min`;
  return `${totalSeg}s`;
}

// Mesma matemática de estudoTimerGlobal.js — pra somar ao tempo já registrado
// o quanto a sessão em andamento (se houver) já acumulou, ao vivo, sem
// esperar ela ser finalizada pra atualizar o card.
function pausaAbertaMs(sessao, agora) {
  const aberta = (sessao.pausas || []).find(p => !p.fim);
  return aberta ? agora - new Date(aberta.inicio).getTime() : 0;
}
function pausasFechadasMs(sessao) {
  return (sessao.pausas || []).filter(p => p.fim).reduce((acc, p) => acc + (new Date(p.fim) - new Date(p.inicio)), 0);
}
function calcularElapsedSeg(sessao) {
  const agora = Date.now();
  const bruto = agora - new Date(sessao.iniciadoEm).getTime();
  const pausasMs = pausasFechadasMs(sessao) + pausaAbertaMs(sessao, agora);
  return Math.max(0, Math.floor((bruto - pausasMs) / 1000));
}

let materias = [];
let conteudosPorMateria = new Map();
let sessaoAtivaExiste = false;
let editandoMateriaId = null;
let editandoConteudoId = null;
let materiaParaNovoConteudo = null;
let corPickerMateria = null;
let corPickerConteudo = null;
let intervaloTemposAoVivo = null;

async function carregarTudo() {
  const [resM, resC, resAtiva] = await Promise.all([
    fetch('/api/estudos/materias', { headers: authHeaders() }),
    fetch('/api/estudos/conteudos', { headers: authHeaders() }),
    fetch('/api/estudos/sessoes/ativa', { headers: authHeaders() })
  ]);
  materias = resM.ok ? await resM.json() : [];
  const conteudos = resC.ok ? await resC.json() : [];
  const sessaoAtiva = resAtiva.ok ? await resAtiva.json() : null;
  sessaoAtivaExiste = !!sessaoAtiva;

  conteudosPorMateria = new Map();
  conteudos.forEach(c => {
    const chave = c.materiaId;
    if (!conteudosPorMateria.has(chave)) conteudosPorMateria.set(chave, []);
    conteudosPorMateria.get(chave).push(c);
  });

  renderAviso();
  renderMateriasGrid();
}

function renderAviso() {
  const el = document.getElementById('avisoSessaoAtiva');
  if (sessaoAtivaExiste) {
    el.style.display = 'block';
    el.textContent = 'Você já tem uma sessão de estudo em andamento — veja a barra no rodapé da tela. Finalize ou cancele antes de iniciar outra.';
  } else {
    el.style.display = 'none';
  }
}

function renderMateriasGrid() {
  const el = document.getElementById('materiasGrid');
  if (!materias.length) {
    el.innerHTML = '<p class="vazio-msg">Você ainda não tem matérias. Clique em "+ Nova Matéria" para começar a organizar seus estudos.</p>';
    return;
  }
  el.innerHTML = materias.map(renderMateriaCard).join('');
}

function renderMateriaCard(m) {
  const conteudos = conteudosPorMateria.get(m._id) || [];
  const subcards = conteudos.length
    ? conteudos.map(c => renderConteudoSubcard(c)).join('')
    : '<p class="conteudos-vazio-msg">Nenhum conteúdo ainda.</p>';
  return `
    <div class="materia-card-grande" style="--cor-item:${m.cor};" data-id="${m._id}">
      <div class="materia-card-topo">
        <div class="materia-card-titulo">
          ${m.icone ? `<span class="icone-materia">${escapeHtml(m.icone)}</span>` : ''}
          <h3 title="${escapeHtml(m.nome)}">${escapeHtml(m.nome)}</h3>
        </div>
        <div class="card-acoes-icone">
          <button type="button" class="icone-btn editar-materia" data-id="${m._id}" title="Editar matéria"><img src="img/icones/edit-pencil.svg" alt="" style="width:1em; height:1em;"></button>
          <button type="button" class="icone-btn apagar-materia" data-id="${m._id}" title="Excluir matéria"><img src="img/icones/trash.svg" alt="" style="width:1em; height:1em;"></button>
        </div>
      </div>
      ${m.descricao ? `<p class="materia-descricao">${escapeHtml(m.descricao)}</p>` : ''}
      <div class="materia-meta-row">
        <span>${m.qtdConteudos} conteúdo${m.qtdConteudos === 1 ? '' : 's'}</span>
        <span class="materia-tempo-total" data-materia-id="${m._id}">${formatarDuracaoLonga(m.tempoTotalSegundos)}</span>
      </div>
      <div class="conteudos-subgrid">${subcards}</div>
      <button type="button" class="btn-add-conteudo" data-materia-id="${m._id}">+ Adicionar Conteúdo</button>
    </div>`;
}

function renderConteudoSubcard(c) {
  const desabilitar = sessaoAtivaExiste ? 'disabled' : '';
  return `
    <div class="conteudo-subcard" style="--cor-item:${c.cor};" data-id="${c._id}">
      <div class="conteudo-subcard-topo">
        <span class="conteudo-nome">${escapeHtml(c.nome)}</span>
        <div class="card-acoes-icone">
          <button type="button" class="icone-btn editar-conteudo" data-id="${c._id}" title="Editar conteúdo"><img src="img/icones/edit-pencil.svg" alt="" style="width:1em; height:1em;"></button>
          <button type="button" class="icone-btn apagar-conteudo" data-id="${c._id}" title="Excluir conteúdo"><img src="img/icones/trash.svg" alt="" style="width:1em; height:1em;"></button>
        </div>
      </div>
      <span class="badge-ao-vivo" data-ao-vivo-de="${c._id}" style="display:none;"><span class="ponto"></span>Ao vivo</span>
      <div class="conteudo-meta-row">
        <span class="conteudo-tempo-total" data-conteudo-id="${c._id}">${formatarDuracaoLonga(c.tempoTotalSegundos)}</span>
        <span>${c.numeroSessoes} ${c.numeroSessoes === 1 ? 'sessão' : 'sessões'}</span>
      </div>
      <button type="button" class="btn-iniciar-conteudo" data-materia-id="${c.materiaId}" data-conteudo-id="${c._id}" ${desabilitar}><img src="img/icones/chevron-right.svg" alt="" style="width:0.9em; height:0.9em; vertical-align:-0.05em; margin-right:3px;">Iniciar</button>
    </div>`;
}

// Roda a cada segundo (independente de qualquer re-render da grade): soma ao
// tempo já registrado o quanto a sessão em andamento (se houver, e for de um
// conteúdo desta página) já acumulou, sem esperar ela ser finalizada — antes
// disso o card ficava parado no total antigo (0s numa primeira sessão) até o
// fim, dando a impressão de cronômetro travado.
function atualizarTemposAoVivo() {
  const sessao = window.EstudoTimerGlobal && window.EstudoTimerGlobal.sessaoAtivaAtual();
  const elapsedSeg = sessao ? calcularElapsedSeg(sessao) : 0;

  document.querySelectorAll('.conteudo-tempo-total').forEach(el => {
    const id = el.dataset.conteudoId;
    const c = conteudoPorId(id);
    if (!c) return;
    const extra = (sessao && sessao.conteudoId === id) ? elapsedSeg : 0;
    el.textContent = formatarDuracaoLonga(c.tempoTotalSegundos + extra);
  });
  document.querySelectorAll('.materia-tempo-total').forEach(el => {
    const id = el.dataset.materiaId;
    const m = materias.find(x => x._id === id);
    if (!m) return;
    const extra = (sessao && sessao.materiaId === id) ? elapsedSeg : 0;
    el.textContent = formatarDuracaoLonga(m.tempoTotalSegundos + extra);
  });

  document.querySelectorAll('.conteudo-subcard').forEach(card => {
    const ativo = !!sessao && sessao.conteudoId === card.dataset.id;
    card.classList.toggle('tem-sessao-ativa', ativo);
  });
  document.querySelectorAll('.materia-card-grande').forEach(card => {
    const ativo = !!sessao && sessao.materiaId === card.dataset.id;
    card.classList.toggle('tem-sessao-ativa', ativo);
  });
  document.querySelectorAll('.badge-ao-vivo').forEach(badge => {
    badge.style.display = (sessao && sessao.conteudoId === badge.dataset.aoVivoDe) ? 'inline-flex' : 'none';
  });
}

function ligarAtualizacaoAoVivo() {
  clearInterval(intervaloTemposAoVivo);
  intervaloTemposAoVivo = setInterval(atualizarTemposAoVivo, 1000);
}

// ===================== INICIAR SESSÃO (delega pra EstudoTimerGlobal) =====================

async function iniciarConteudo(materiaId, conteudoId, botao) {
  if (sessaoAtivaExiste) return;
  botao.disabled = true;
  botao.textContent = 'Iniciando...';
  const resultado = await window.EstudoTimerGlobal.iniciarSessao(materiaId, conteudoId);
  if (!resultado.ok) {
    if (resultado.conflito) {
      sessaoAtivaExiste = true;
      renderAviso();
      renderMateriasGrid();
    } else {
      alert(resultado.msg || 'Erro ao iniciar sessão.');
      botao.disabled = false;
      botao.innerHTML = '<img src="img/icones/chevron-right.svg" alt="" style="width:0.9em; height:0.9em; vertical-align:-0.05em; margin-right:3px;">Iniciar';
    }
    return;
  }
  sessaoAtivaExiste = true;
  renderAviso();
  renderMateriasGrid();
  atualizarTemposAoVivo();
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
  await carregarTudo();
}

async function apagarMateria(id) {
  if (!confirm('Apagar esta matéria? Isso só é possível se ela não tiver conteúdos.')) return;
  const res = await fetch(`/api/estudos/materias/${id}`, { method: 'DELETE', headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) { alert(data.msg || 'Erro ao apagar.'); return; }
  await carregarTudo();
}

// ===================== MODAL CONTEÚDO =====================

function abrirModalConteudo(materiaId, conteudo) {
  materiaParaNovoConteudo = materiaId;
  editandoConteudoId = conteudo ? conteudo._id : null;
  document.getElementById('modalConteudoTitulo').textContent = conteudo ? 'Editar Conteúdo' : 'Novo Conteúdo';
  document.getElementById('conteudoNome').value = conteudo ? conteudo.nome : '';
  document.getElementById('conteudoDescricao').value = conteudo ? (conteudo.descricao || '') : '';
  document.getElementById('modalConteudoErro').textContent = '';
  const materia = materias.find(m => m._id === materiaId);
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
    body: JSON.stringify({ materiaId: materiaParaNovoConteudo, nome, descricao, cor })
  });
  const data = await res.json();
  if (!res.ok) { erroEl.textContent = data.msg || 'Erro ao salvar.'; return; }

  fecharModalConteudo();
  await carregarTudo();
}

async function apagarConteudo(id) {
  if (!confirm('Apagar este conteúdo? Isso só é possível se ele não tiver sessões de estudo registradas.')) return;
  const res = await fetch(`/api/estudos/conteudos/${id}`, { method: 'DELETE', headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) { alert(data.msg || 'Erro ao apagar.'); return; }
  await carregarTudo();
}

function conteudoPorId(id) {
  for (const lista of conteudosPorMateria.values()) {
    const c = lista.find(x => x._id === id);
    if (c) return c;
  }
  return null;
}

// ===================== EVENTOS =====================

document.getElementById('btnNovaMateria').addEventListener('click', () => abrirModalMateria(null));
document.getElementById('btnCancelarMateria').addEventListener('click', fecharModalMateria);
document.getElementById('btnSalvarMateria').addEventListener('click', salvarMateria);

document.getElementById('btnCancelarConteudo').addEventListener('click', fecharModalConteudo);
document.getElementById('btnSalvarConteudo').addEventListener('click', salvarConteudo);

document.getElementById('materiasGrid').addEventListener('click', e => {
  const btnEditarMateria = e.target.closest('button.editar-materia');
  if (btnEditarMateria) { abrirModalMateria(materias.find(m => m._id === btnEditarMateria.dataset.id)); return; }

  const btnApagarMateria = e.target.closest('button.apagar-materia');
  if (btnApagarMateria) { apagarMateria(btnApagarMateria.dataset.id); return; }

  const btnAddConteudo = e.target.closest('button.btn-add-conteudo');
  if (btnAddConteudo) { abrirModalConteudo(btnAddConteudo.dataset.materiaId, null); return; }

  const btnEditarConteudo = e.target.closest('button.editar-conteudo');
  if (btnEditarConteudo) {
    const conteudo = conteudoPorId(btnEditarConteudo.dataset.id);
    if (conteudo) abrirModalConteudo(conteudo.materiaId, conteudo);
    return;
  }

  const btnApagarConteudo = e.target.closest('button.apagar-conteudo');
  if (btnApagarConteudo) { apagarConteudo(btnApagarConteudo.dataset.id); return; }

  const btnIniciar = e.target.closest('button.btn-iniciar-conteudo');
  if (btnIniciar && !btnIniciar.disabled) { iniciarConteudo(btnIniciar.dataset.materiaId, btnIniciar.dataset.conteudoId, btnIniciar); return; }
});

// Quando uma sessão é finalizada (nesta aba ou em outra), tempos/contagens
// mudam e os botões "Iniciar" voltam a ficar disponíveis — reaproveita o
// mesmo canal SSE já usado pelo resto da plataforma (ver deverRealtime.js).
if (window.DeverRealtime) {
  DeverRealtime.escutar({
    'sessao-estudo-finalizada': d => { if (d.alunoId === DeverRealtime.meuUserId()) carregarTudo(); }
  });
}

carregarTudo();
ligarAtualizacaoAoVivo();
