// SISTEMA DE CORREÇÃO — fila, alunos e créditos, correção pela grade oficial da prova.
const token = localStorage.getItem('token');
const H = () => ({ Authorization: 'Bearer ' + token });
const HJ = () => ({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + token });
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtData = d => d ? new Date(d).toLocaleDateString('pt-BR') : '—';
const NOMES_TIPO_DOC = {
  artigo: 'Artigo', noticia: 'Reportagem', estatistica: 'Estatística', infografico: 'Infográfico',
  entrevista: 'Entrevista', cartum: 'Cartum', grafico: 'Gráfico', fotografia: 'Fotografia',
  tabela: 'Tabela', documento_oficial: 'Documento oficial', trecho_livro: 'Trecho de livro', artigo_cientifico: 'Artigo científico'
};
const NOMES_STATUS = {
  em_fila: 'Em fila', em_correcao: 'Em correção', corrigido: 'Corrigido', devolvido: 'Devolvido',
  aguardando_revisao: 'Aguardando revisão', arquivado: 'Arquivado', cancelado: 'Cancelado'
};

let producaoAtual = null;
let gradeAtual = null;
let arquivoCorrigidoSelecionado = null;
let alunos = [];
let alunoSelecionado = null;
let voltarPara = 'fila';
let ultimaFila = [];            // fila carregada (busca e ordenação no navegador)
let navegacao = [];             // ids da lista de onde a produção foi aberta (← →)
let editorAtual = null, persistAtual = null;
const ROTULO_SALVO = { salvo: 'Tudo salvo', salvando: 'Salvando…', pendente: 'Alterações não salvas', erro: 'Erro ao salvar' };

// Tarefa (tâche) das produções do Ambiente de Produção: ET1–ET3 escritas, T1–T3 orais.
const NOMES_TAREFA = { ET1: 'Tarefa 1 escrita · Mensagem curta', ET2: 'Tarefa 2 escrita · Relato, artigo ou carta', ET3: 'Tarefa 3 escrita · Texto argumentativo',
  T1: 'Tarefa 1 oral · Entrevista dirigida', T2: 'Tarefa 2 oral · Exercício de interação', T3: 'Tarefa 3 oral · Ponto de vista' };
const tarefaDe = p => (p && p.origem && NOMES_TAREFA[p.origem.tache]) || '';
const tagTarefa = p => tarefaDe(p) ? `<span class="tag tarefa">${esc(tarefaDe(p))}</span>` : '';
const euPronto = fetch('/api/auth/me', { headers: H() }).then(r => r.ok ? r.json() : null).then(u => { window.__eu = u; }).catch(() => {});

// ===================== ABAS =====================
function mostrarView(nome) {
  document.getElementById('viewFila').style.display = nome === 'fila' ? 'block' : 'none';
  document.getElementById('viewAlunos').style.display = nome === 'alunos' ? 'block' : 'none';
  document.getElementById('viewCorrigidas').style.display = nome === 'corrigidas' ? 'block' : 'none';
  document.getElementById('viewAoVivo').style.display = nome === 'aovivo' ? 'block' : 'none';
  document.getElementById('viewCorrecao').style.display = nome === 'correcao' ? 'block' : 'none';
  document.getElementById('abasSistema').style.display = nome === 'correcao' ? 'none' : 'flex';
  document.querySelectorAll('#abasSistema .aba').forEach(a => a.classList.toggle('active', a.dataset.aba === nome));
}
document.getElementById('abasSistema').addEventListener('click', e => {
  const aba = e.target.closest('.aba');
  if (!aba) return;
  mostrarView(aba.dataset.aba);
  if (aba.dataset.aba === 'alunos') carregarAlunos();
  else if (aba.dataset.aba === 'corrigidas') carregarCorrigidas();
  else if (aba.dataset.aba === 'aovivo') { if (window.CorrecaoAoVivo) CorrecaoAoVivo.carregar(); }
  else { carregarFila(); carregarStats(); }
});
document.getElementById('voltarFilaBtn').addEventListener('click', async () => {
  await fecharEditor();
  mostrarView(voltarPara);
  if (voltarPara === 'alunos') { carregarAlunos(); if (alunoSelecionado) abrirAluno(alunoSelecionado); }
  else if (voltarPara === 'corrigidas') carregarCorrigidas();
  else { carregarFila(); carregarStats(); }
});
document.getElementById('atualizarFilaBtn').addEventListener('click', carregarFila);
['filtroCurso', 'filtroStatus', 'filtroPrioridade', 'filtroModalidade', 'filtroAluno'].forEach(id => document.getElementById(id).addEventListener('change', carregarFila));
['corrCurso', 'corrModalidade', 'corrAluno'].forEach(id => document.getElementById(id).addEventListener('change', carregarCorrigidas));
document.getElementById('atualizarCorrBtn').addEventListener('click', carregarCorrigidas);

// ===================== ESTATÍSTICAS =====================
async function carregarStats() {
  try {
    const res = await fetch('/api/producoes/professor/stats', { headers: H() });
    const s = await res.json();
    document.getElementById('kpiRow').innerHTML = `
      <div class="kpi"><div class="valor">${s.pendentes}</div><div class="rotulo">Correções pendentes (fila)</div></div>
      <div class="kpi"><div class="valor">${s.emAndamento}</div><div class="rotulo">Em andamento (minhas)</div></div>
      <div class="kpi"><div class="valor">${s.concluidas}</div><div class="rotulo">Concluídas por mim</div></div>
      <div class="kpi"><div class="valor">${s.tempoMedioHoras !== null ? s.tempoMedioHoras + 'h' : '—'}</div><div class="rotulo">Tempo médio de correção</div></div>`;
  } catch (err) { /* indicadores são opcionais */ }
}

// ===================== FILA =====================
async function carregarFila() {
  const params = new URLSearchParams();
  const curso = document.getElementById('filtroCurso').value;
  const status = document.getElementById('filtroStatus').value;
  const prioridade = document.getElementById('filtroPrioridade').value;
  if (curso) params.set('courseType', curso);
  if (status) params.set('status', status);
  if (prioridade) params.set('prioridade', prioridade);
  const modalidade = document.getElementById('filtroModalidade').value, aluno = document.getElementById('filtroAluno').value;
  if (modalidade) params.set('modalidade', modalidade);
  if (aluno) params.set('alunoId', aluno);
  const lista = document.getElementById('filaLista');
  lista.innerHTML = '<p style="opacity:0.6;">Carregando fila…</p>';
  try {
    const res = await fetch(`/api/producoes/professor/fila?${params}`, { headers: H() });
    const producoes = await res.json();
    document.getElementById('contFila').textContent = Array.isArray(producoes) ? producoes.length : 0;
    if (!Array.isArray(producoes) || producoes.length === 0) {
      lista.innerHTML = '<div class="vazio-box">Nenhuma produção nesta fila no momento.</div>';
      return;
    }
    ultimaFila = producoes;
    desenharFila();
  } catch (err) {
    lista.innerHTML = '<div class="vazio-box">Erro ao carregar a fila.</div>';
  }
}
function desenharFila() {
  const termo = (document.getElementById('filaBusca').value || '').toLowerCase().trim();
  const ordem = document.getElementById('filaOrdem').value;
  let l = ultimaFila.filter(p => !termo || [p.alunoId?.nome, p.alunoId?.email, p.temaId?.titulo, p.protocolo].some(x => String(x || '').toLowerCase().includes(termo)));
  const data = (p, k) => new Date(p[k] || 0).getTime();
  l = l.slice().sort(ordem === 'recentes' ? (x, y) => data(y, 'dataEnvio') - data(x, 'dataEnvio')
    : ordem === 'prazo' ? (x, y) => data(x, 'prazoEstimado') - data(y, 'prazoEstimado')
    : ordem === 'aluno' ? (x, y) => String(x.alunoId?.nome || '').localeCompare(String(y.alunoId?.nome || ''))
    : (x, y) => data(x, 'dataEnvio') - data(y, 'dataEnvio'));
  document.getElementById('filaLista').innerHTML = l.length ? l.map(renderFilaItem).join('') : '<div class="vazio-box">Nenhuma produção encontrada com esta busca.</div>';
}
document.getElementById('filaBusca').addEventListener('input', desenharFila);
document.getElementById('filaOrdem').addEventListener('change', desenharFila);

function renderFilaItem(p) {
  const urgente = p.prazoEstimado && (new Date(p.prazoEstimado).getTime() - Date.now()) < 2 * 24 * 60 * 60 * 1000;
  const minha = p.status === 'em_correcao' || p.status === 'aguardando_revisao';
  const est = p.estadoCorrecao || {};
  const t = p.temaId || {};
  return `<div class="fila-item" data-id="${p._id}" data-status="${p.status}">
    <div>
      <h4>${esc(t.titulo || 'Tema')}</h4>
      <div class="meta">Aluno: ${esc(p.alunoId?.nome || '—')} · Enviado em ${fmtData(p.dataEnvio)} · Prazo: ${fmtData(p.prazoEstimado)}</div>
      <div style="margin-top:8px; display:flex; gap:6px; flex-wrap:wrap;">
        <span class="tag exame">${esc(t.courseType || t.exame || '')} · ${esc(t.nivel || '')}</span>
        <span class="tag status">${p.modalidade === 'oral' ? 'Produção oral' : 'Redação'}</span>
        ${tagTarefa(p)}
        ${p.ia?.status === 'erro' ? '<span class="tag ia">IA indisponível → professor</span>' : ''}
        ${urgente ? '<span class="tag urgente">Urgente</span>' : ''}
        ${minha ? '<span class="tag minha">Assumida por mim</span>' : ''}
        ${est.rotulo ? `<span class="ca-estado" data-estado="${esc(est.estado)}">${esc(est.rotulo)}</span>` : ''}
        ${p.correcao?.anotacoes ? `<span class="tag status">${p.correcao.anotacoes} comentário(s)</span>` : ''}
      </div>
    </div>
    <button class="btn pequeno" data-abrir="${p._id}">${minha ? 'Continuar correção' : 'Assumir e corrigir'}</button>
  </div>`;
}
document.getElementById('filaLista').addEventListener('click', e => {
  const btn = e.target.closest('[data-abrir]');
  if (btn) { voltarPara = 'fila'; navegacao = [...document.querySelectorAll('#filaLista .fila-item')].map(x => x.dataset.id); abrirProducao(btn.dataset.abrir, btn.closest('.fila-item')?.dataset.status === 'em_fila'); }
});

// ===================== CORRIGIDAS =====================
async function carregarCorrigidas() {
  const params = new URLSearchParams();
  const curso = document.getElementById('corrCurso').value, modalidade = document.getElementById('corrModalidade').value, aluno = document.getElementById('corrAluno').value;
  if (curso) params.set('courseType', curso);
  if (modalidade) params.set('modalidade', modalidade);
  if (aluno) params.set('alunoId', aluno);
  const lista = document.getElementById('corrLista');
  lista.innerHTML = '<p style="opacity:0.6;">Carregando…</p>';
  try {
    const res = await fetch(`/api/producoes/professor/corrigidas?${params}`, { headers: H() });
    const producoes = res.ok ? await res.json() : [];
    document.getElementById('contCorrigidas').textContent = producoes.length;
    lista.innerHTML = producoes.length ? producoes.map(p => {
      const t = p.temaId || {};
      const quem = p.avaliacao?.corretor === 'ia' || p.modoCorrecao === 'ia' ? 'IA' : (p.avaliacao?.corretorNome || p.professorId?.nome || 'professor');
      return `<div class="fila-item corrigida" data-id="${p._id}">
        <div>
          <h4>${esc(t.titulo || 'Tema')}</h4>
          <div class="meta">Aluno: ${esc(p.alunoId?.nome || '—')} · Enviado em ${fmtData(p.dataEnvio)} · Corrigido em ${fmtData(p.dataCorrecao)} por ${esc(quem)}</div>
          <div style="margin-top:8px; display:flex; gap:6px; flex-wrap:wrap;">
            <span class="tag exame">${esc(t.courseType || t.exame || '')} · ${esc(t.nivel || '')}</span>
            <span class="tag status">${p.modalidade === 'oral' ? 'Produção oral' : 'Redação'}</span>
            ${tagTarefa(p)}
            ${p.avaliacao?.notaTotal !== undefined ? `<span class="nota-pill">${p.avaliacao.notaTotal}/${p.avaliacao.notaMaxima || 20}</span>` : ''}
          </div>
        </div>
        <button class="btn secundario pequeno" data-ver="${p._id}">Ver correção</button>
      </div>`;
    }).join('') : '<div class="vazio-box">Nenhuma produção corrigida com estes filtros.</div>';
  } catch (err) {
    lista.innerHTML = '<div class="vazio-box">Erro ao carregar as corrigidas.</div>';
  }
}
document.getElementById('corrLista').addEventListener('click', e => {
  const btn = e.target.closest('[data-ver]');
  if (btn) { voltarPara = 'corrigidas'; navegacao = [...document.querySelectorAll('#corrLista .fila-item')].map(x => x.dataset.id); abrirProducao(btn.dataset.ver, false); }
});

// Filtros « Aluno » (fila e corrigidas) com a mesma lista da aba Alunos.
function preencherFiltrosAluno() {
  document.querySelectorAll('select.filtro-aluno').forEach(sel => {
    const atual = sel.value;
    sel.innerHTML = '<option value="">Todos os alunos</option>' + alunos.map(a => `<option value="${a._id}" ${a._id === atual ? 'selected' : ''}>${esc(a.nome)}${a.producoes?.pendentes ? ' · ' + a.producoes.pendentes + ' aguardando' : ''}</option>`).join('');
  });
}

// ===================== ALUNOS E CRÉDITOS =====================
async function carregarAlunos() {
  const el = document.getElementById('listaAlunos');
  if (!alunos.length) el.innerHTML = '<p style="opacity:0.6;">Carregando alunos…</p>';
  try {
    const res = await fetch('/api/creditos/alunos', { headers: H() });
    alunos = res.ok ? await res.json() : [];
  } catch (err) { alunos = []; }
  document.getElementById('contAlunos').textContent = alunos.length;
  preencherFiltrosAluno();
  renderAlunos();
}
function renderAlunos() {
  const termo = document.getElementById('buscaAluno').value.trim().toLowerCase();
  const lista = alunos.filter(a => !termo || [a.nome, a.email, ...a.cursos].some(v => String(v || '').toLowerCase().includes(termo)));
  const el = document.getElementById('listaAlunos');
  if (!lista.length) { el.innerHTML = `<div class="vazio-box">${alunos.length ? 'Nenhum aluno encontrado.' : 'Nenhum aluno com o Ambiente de Produção ativo.'}</div>`; return; }
  el.innerHTML = lista.map(a => `
    <div class="aluno-item ${alunoSelecionado === a._id ? 'sel' : ''}" data-aluno="${a._id}">
      <div><div class="nome">${esc(a.nome)}</div><div class="email">${esc(a.email)}</div></div>
      <div class="creditos-badge ${a.creditos ? '' : 'zero'}"><strong>${a.creditos}</strong><span>crédito${a.creditos === 1 ? '' : 's'}</span></div>
      <div class="cursos">${a.cursos.map(c => `<span class="tag exame">${esc(c)}</span>`).join('')}</div>
      <div class="mini-stats">${a.producoes.total} produção(ões) · ${a.producoes.pendentes} aguardando · ${a.producoes.corrigidas} corrigida(s)${a.producoes.ultima ? ' · última em ' + fmtData(a.producoes.ultima) : ''}</div>
    </div>`).join('');
}
document.getElementById('buscaAluno').addEventListener('input', renderAlunos);
document.getElementById('listaAlunos').addEventListener('click', e => {
  const item = e.target.closest('[data-aluno]');
  if (item) abrirAluno(item.dataset.aluno);
});

async function abrirAluno(id) {
  alunoSelecionado = id;
  renderAlunos();
  const painel = document.getElementById('painelAluno');
  painel.innerHTML = '<p style="opacity:0.6;">Carregando…</p>';
  try {
    const res = await fetch('/api/creditos/alunos/' + id, { headers: H() });
    if (!res.ok) throw new Error();
    renderPainelAluno(await res.json());
  } catch (err) { painel.innerHTML = '<div class="vazio-box">Não foi possível carregar o aluno.</div>'; }
}
function renderPainelAluno(a) {
  const painel = document.getElementById('painelAluno');
  painel.innerHTML = `
    <h2 style="margin-bottom:2px;">${esc(a.nome)}</h2>
    <div style="font-size:.82rem; color:var(--cinza-400);">${esc(a.email)} · ${a.cursos.map(esc).join(', ') || 'sem curso'}</div>
    <div class="total-box" style="margin-top:14px;"><span>Créditos disponíveis</span><span class="valor-total" id="saldoAluno">${a.creditos}</span></div>
    <div style="font-weight:700; font-size:.85rem;">Adicionar créditos</div>
    <div class="add-creditos">
      <input type="number" id="qtdCreditos" min="1" max="1000" step="1" value="5">
      <button class="chip-rapido" data-rapido="5" type="button">+5</button>
      <button class="chip-rapido" data-rapido="10" type="button">+10</button>
      <button class="chip-rapido" data-rapido="20" type="button">+20</button>
      <button class="btn pequeno" id="addCreditosBtn" type="button">Adicionar</button>
    </div>
    <div class="msg-inline" id="credMsg" style="display:none;"></div>
    <h2 style="margin-top:20px;">Redações e produções (${a.producoes.length})</h2>
    <p style="font-size:.85rem; color:var(--cinza-400); margin-bottom:8px;">${a.producoes.filter(p => ['em_fila', 'em_correcao'].includes(p.status)).length} aguardando correção · ${a.producoes.filter(p => ['corrigido', 'devolvido'].includes(p.status)).length} corrigida(s)
      · <a href="#" data-fila-aluno="${a._id}">ver na fila</a> · <a href="#" data-corr-aluno="${a._id}">ver corrigidas</a></p>
    ${a.producoes.length ? a.producoes.map(p => `
      <div class="prod-linha" data-prod="${p._id}" data-status="${p.status}">
        <div><strong>${esc(p.temaId?.titulo || 'Tema')}</strong>
          <small>${esc(p.temaId?.courseType || '')} ${esc(p.temaId?.nivel || '')} · ${p.modalidade === 'oral' ? 'oral' : 'redação'}${tarefaDe(p) ? ' · ' + esc(tarefaDe(p)) : ''} · ${fmtData(p.dataEnvio)} · ${NOMES_STATUS[p.status] || p.status}${p.modoCorrecao === 'ia' ? ' · corrigida pela IA' : ''}</small></div>
        ${p.avaliacao?.notaTotal !== undefined && ['corrigido', 'devolvido'].includes(p.status)
          ? `<span class="nota-pill">${p.avaliacao.notaTotal}/${p.avaliacao.notaMaxima || 20}</span>`
          : `<span class="tag status">${NOMES_STATUS[p.status] || p.status}</span>`}
      </div>`).join('') : '<p style="font-size:.85rem; color:var(--cinza-400);">Este aluno ainda não enviou produções.</p>'}`;
}
document.getElementById('painelAluno').addEventListener('click', async e => {
  const rapido = e.target.closest('[data-rapido]');
  if (rapido) { document.getElementById('qtdCreditos').value = rapido.dataset.rapido; return; }
  if (e.target.closest('#addCreditosBtn')) { adicionarCreditos(); return; }
  const fa = e.target.closest('[data-fila-aluno]'), ca = e.target.closest('[data-corr-aluno]');
  if (fa) { e.preventDefault(); document.getElementById('filtroAluno').value = fa.dataset.filaAluno; mostrarView('fila'); carregarFila(); return; }
  if (ca) { e.preventDefault(); document.getElementById('corrAluno').value = ca.dataset.corrAluno; mostrarView('corrigidas'); carregarCorrigidas(); return; }
  const prod = e.target.closest('[data-prod]');
  if (prod) { voltarPara = 'alunos'; abrirProducao(prod.dataset.prod, false); }
});
async function adicionarCreditos() {
  const quantidade = Number(document.getElementById('qtdCreditos').value);
  const msg = document.getElementById('credMsg');
  msg.style.display = 'block';
  if (!Number.isInteger(quantidade) || quantidade < 1) { msg.className = 'msg-inline erro'; msg.textContent = 'Informe quantos créditos quer adicionar.'; return; }
  const btn = document.getElementById('addCreditosBtn');
  btn.disabled = true;
  try {
    const res = await fetch('/api/creditos', { method: 'POST', headers: HJ(), body: JSON.stringify({ alunoId: alunoSelecionado, quantidade }) });
    const data = await res.json();
    msg.className = 'msg-inline ' + (res.ok ? 'sucesso' : 'erro');
    msg.textContent = data.msg;
    if (res.ok) {
      document.getElementById('saldoAluno').textContent = data.creditos;
      const a = alunos.find(x => x._id === alunoSelecionado);
      if (a) { a.creditos = data.creditos; renderAlunos(); }
    }
  } catch (err) { msg.className = 'msg-inline erro'; msg.textContent = 'Erro ao conectar ao servidor.'; }
  btn.disabled = false;
}

// ===================== ABRIR PRODUÇÃO =====================
async function abrirProducao(id, assumir) {
  try {
    await euPronto;
    await fecharEditor();
    if (assumir) {
      const r = await fetch(`/api/producoes/${id}/assumir`, { method: 'POST', headers: H() });
      if (!r.ok) { const d = await r.json(); alert(d.msg || 'Não foi possível assumir esta produção.'); carregarFila(); return; }
    }
    const res = await fetch(`/api/producoes/${id}`, { headers: H() });
    if (!res.ok) { alert('Não foi possível abrir esta produção.'); return; }
    producaoAtual = await res.json();
    const curso = producaoAtual.temaId.courseType || producaoAtual.temaId.exame;
    const rg = await fetch(`/api/producoes/grade/${encodeURIComponent(curso)}?modalidade=${producaoAtual.modalidade || 'textual'}`, { headers: H() });
    gradeAtual = await rg.json();
    renderCorrecao(producaoAtual);
    mostrarView('correcao');
    window.scrollTo(0, 0);
  } catch (err) { alert('Erro ao abrir a produção.'); }
}

// ===================== TELA DE CORREÇÃO =====================
function renderCorrecao(p) {
  const tema = p.temaId;
  // Editável só quando a correção é do professor, já foi assumida e é minha (ou sou admin).
  const idProf = p.professorId ? String(p.professorId._id || p.professorId) : null;
  const editavel = p.status === 'em_correcao' && p.modoCorrecao !== 'ia' && (idProf === String(window.__eu?._id) || window.__eu?.role === 'admin');
  document.getElementById('viewCorrecao').classList.toggle('somente-leitura', !editavel);
  document.getElementById('avisoLeitura').textContent = ['corrigido', 'devolvido'].includes(p.status)
    ? `Esta produção já foi corrigida${p.avaliacao?.corretor === 'ia' ? ' pela IA' : p.avaliacao?.corretorNome ? ' por ' + p.avaliacao.corretorNome : ''} — você está vendo a avaliação enviada ao aluno.`
    : p.status === 'em_fila' ? 'Esta produção está na fila — assuma-a pela aba “Fila de correção” para corrigir.'
    : p.modoCorrecao === 'ia' ? 'Esta produção está sendo corrigida pela IA.'
    : 'Esta produção foi assumida por outro professor.';

  document.getElementById('dadosAluno').innerHTML = `
    <div class="dado-linha"><span class="rotulo">Nome</span><span class="valor">${esc(p.alunoId.nome)}</span></div>
    <div class="dado-linha"><span class="rotulo">E-mail</span><span class="valor">${esc(p.alunoId.email)}</span></div>
    <div class="dado-linha"><span class="rotulo">Protocolo</span><span class="valor">${esc(p.protocolo)}</span></div>
    <div class="dado-linha"><span class="rotulo">Tema</span><span class="valor">${esc(tema.titulo)}</span></div>
    ${tarefaDe(p) ? `<div class="dado-linha"><span class="rotulo">Tarefa</span><span class="valor">${esc(tarefaDe(p))}</span></div>` : ''}
    <div class="dado-linha"><span class="rotulo">Curso / nível</span><span class="valor">${esc(tema.courseType || tema.exame)} · ${esc(tema.nivel)}</span></div>
    <div class="dado-linha"><span class="rotulo">Correção pedida</span><span class="valor">${p.modoCorrecao === 'ia' ? 'IA' : 'Professor'}</span></div>
    <div class="dado-linha"><span class="rotulo">Enviado em</span><span class="valor">${new Date(p.dataEnvio).toLocaleString('pt-BR')}</span></div>
    ${p.observacoesAluno ? `<div class="dado-linha"><span class="rotulo">Observações do aluno</span><span class="valor">${esc(p.observacoesAluno)}</span></div>` : ''}`;
  document.getElementById('instrucaoBox').textContent = tema.instrucoes;
  document.getElementById('coletaneaCorrecao').innerHTML = (tema.coletanea || []).map((d, i) => `
    <div class="doc-item">
      <div class="doc-head" data-doc="${i}">${esc(NOMES_TIPO_DOC[d.tipo] || d.tipo)} — ${esc(d.titulo)}</div>
      <div class="doc-corpo" id="profDocCorpo${i}">${esc(d.conteudo).replace(/\n/g, '<br>')}${d.fonte ? `<p style="margin-top:8px; font-size:.78rem; opacity:.8;">${esc(d.fonte)}</p>` : ''}</div>
    </div>`).join('') || '<p style="font-size:.85rem; color:var(--cinza-400);">Sem coletânea.</p>';

  let producaoHtml = '';
  if (false) {
    producaoHtml = `<div style="font-weight:700; margin-bottom:8px;">Gravação do aluno${p.duracaoSegundos ? ' — ' + formatarDuracao(p.duracaoSegundos) : ''}</div><audio controls id="audioProducaoOriginal" style="width:100%;"></audio>` +
      (p.transcricao ? `<div style="font-weight:700; margin:14px 0 6px;">Transcrição automática (revisada pelo aluno)</div><div class="texto-enviado-box" lang="fr">${esc(p.transcricao)}</div>` : '');
  } else if (p.arquivoOriginal?.nome) {
    producaoHtml = `<div class="arquivo-baixar-box"><img src="img/icones/document.svg" alt="" style="width:1.6rem; height:1.6rem;"><div style="flex:1;"><div style="font-weight:700;">${esc(p.arquivoOriginal.nome)}</div><div style="font-size:0.8rem; color:var(--cinza-400);">${(p.arquivoOriginal.tamanho / 1024).toFixed(0)} KB</div></div><button class="btn pequeno" id="baixarOriginalBtn">Baixar</button></div>`;
  } else if (p.textoDigitado) {
    producaoHtml = `<div class="texto-enviado-box">${esc(p.textoDigitado)}</div><div style="margin-top:8px; font-size:0.8rem; color:var(--cinza-400);">${p.contagemPalavras} palavras (pedido: ${tema.limitePalavrasMin}–${tema.limitePalavrasMax})</div>`;
  }
  void producaoHtml;
  renderAnaliseIA(p, editavel);
  abrirEditor(p, editavel);

  // Grade da prova
  const av = p.avaliacao || {};
  const porId = Object.fromEntries((av.criterios || []).filter(c => c.id).map(c => [c.id, c]));
  document.getElementById('tituloGrade').textContent = `Grade oficial — ${gradeAtual.exame}${gradeAtual.exame !== (tema.courseType || '') ? ' (modelo usado para ' + (tema.courseType || '') + ')' : ''}`;
  document.getElementById('criteriosLista').innerHTML = gradeAtual.criterios.map(c => {
    const v = porId[c.id]?.nota ?? '';
    return `<div class="crit-grade">
      <div class="crit-topo"><span class="nome">${esc(c.nome)}</span><span><input type="number" min="0" max="${c.max}" step="0.5" data-crit="${c.id}" value="${v}"> / ${c.max}</span></div>
      <div class="crit-desc">${esc(c.descricao)}</div>
      <div class="crit-barra"><span id="barra-${c.id}" style="width:${v ? (v / c.max) * 100 : 0}%"></span></div>
      <textarea data-crit-coment="${c.id}" rows="2" placeholder="Comentário sobre este critério…">${esc(porId[c.id]?.comentario || '')}</textarea>
    </div>`;
  }).join('');
  document.getElementById('notaMaximaView').textContent = '/ ' + gradeAtual.notaMaxima;
  document.getElementById('notaFinalInput').max = gradeAtual.notaMaxima;
  document.getElementById('notaFinalInput').value = '';
  document.getElementById('comentarioGeralInput').value = av.comentarioGeral || '';
  document.getElementById('pontosFortesInput').value = (av.pontosFortes || []).join('\n');
  document.getElementById('aMelhorarInput').value = (av.aMelhorar || []).join('\n');
  document.getElementById('recomendacoesInput').value = (av.recomendacoes || []).join('\n');
  document.getElementById('feedbackFinalInput').value = av.feedbackFinal || '';
  if (av.notaFinal != null) document.getElementById('notaFinalInput').value = av.notaFinal;
  atualizarTotal();
  if (['corrigido', 'devolvido'].includes(p.status)) {
    document.getElementById('notaTotalView').textContent = av.notaTotal ?? '—';
    if (av.nivelEstimado) document.getElementById('notaMaximaView').textContent = `/ ${av.notaMaxima || gradeAtual.notaMaxima} · ${av.nivelEstimado}${av.nclc ? ' · NCLC ' + av.nclc : ''}`;
  }
  document.getElementById('correcaoMsg').style.display = 'none';
  document.getElementById('devolverBtn').disabled = false;
  arquivoCorrigidoSelecionado = null;
  document.getElementById('uploadCorrigidoTexto').textContent = 'Clique para anexar o arquivo corrigido (PDF, DOCX ou ODT)';
  document.getElementById('uploadCorrigidoBox').classList.remove('tem-arquivo');
}

// ===================== BASE DE ANÁLISE DA IA (só equipe) =====================
// Quando o aluno pede a correção de um professor, a IA corrige em segundo plano; o professor vê a
// sugestão aqui e pode usá-la como ponto de partida. O aluno nunca recebe esta análise.
let esperaAnalise = null;
function renderAnaliseIA(p, editavel) {
  clearTimeout(esperaAnalise);
  const card = document.getElementById('analiseIACard'), box = document.getElementById('analiseIABox');
  // correção feita pela própria IA (pedido do aluno): não há « base » separada
  if (p.modoCorrecao === 'ia') { card.style.display = 'none'; return; }
  card.style.display = 'block';
  const a = p.analiseIA;
  const gerar = rotulo => `<button class="btn secundario pequeno" type="button" id="gerarAnaliseBtn">${rotulo}</button>`;
  if (!a || a.status === 'gerando') {
    box.innerHTML = '<div class="ia-sug-espera"><i></i>A IA está analisando a produção… (cerca de 10 segundos)</div>';
    // confere de novo em alguns segundos
    esperaAnalise = setTimeout(async () => {
      if (!producaoAtual || producaoAtual._id !== p._id) return;
      try {
        const r = await fetch(`/api/producoes/${p._id}`, { headers: H() });
        if (r.ok) { const novo = await r.json(); producaoAtual.analiseIA = novo.analiseIA; renderAnaliseIA(producaoAtual, editavel); }
      } catch (e) {}
    }, 5000);
    if (!a) fetch(`/api/producoes/${p._id}/analise-ia`, { method: 'POST', headers: H() }).catch(() => {});
    return;
  }
  if (a.status !== 'pronta') {
    const motivo = { indisponivel: 'A correção por IA não está configurada no servidor.', sem_texto: 'A produção foi enviada como arquivo (sem texto digitado nem transcrição): a IA não tem o que ler.', erro: 'A IA não conseguiu analisar agora' + (a.erro ? ' (' + a.erro + ')' : '') + '.' }[a.status] || 'Análise indisponível.';
    box.innerHTML = `<p style="font-size:.88rem; color:var(--cinza-600);">${esc(motivo)}</p>${a.status !== 'sem_texto' && a.status !== 'indisponivel' ? '<div class="ia-sug-acoes">' + gerar('Tentar de novo') + '</div>' : ''}`;
    ligarGerar(p, editavel);
    return;
  }
  const av = a.avaliacao || {};
  const ex = av.extras || {};
  box.innerHTML = `
    <div class="ia-sug-nota"><b>${av.notaTotal ?? '—'}</b><span>/ ${av.notaMaxima || 20}${av.nivelEstimado ? ' · ' + esc(av.nivelEstimado) : ''}${av.nclc ? ' · NCLC ' + esc(av.nclc) : ''}</span></div>
    ${av.comentarioGeral ? `<p style="font-size:.9rem; margin-bottom:8px;" lang="fr">${esc(av.comentarioGeral)}</p>` : ''}
    ${(av.criterios || []).map(c => `<div class="ia-sug-crit"><span>${esc(c.nome || c.id)}</span><b>${c.nota ?? '—'} / ${c.max ?? ''}</b>${c.comentario ? `<small lang="fr">${esc(c.comentario)}</small>` : ''}</div>`).join('')}
    ${(av.pontosFortes || []).length ? `<div style="font-weight:700; margin-top:10px; font-size:.86rem;">Pontos fortes</div><ul class="ia-sug-lista" lang="fr">${av.pontosFortes.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    ${(av.aMelhorar || []).length ? `<div style="font-weight:700; font-size:.86rem;">A melhorar</div><ul class="ia-sug-lista" lang="fr">${av.aMelhorar.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    ${(av.correcoes || []).length ? `<div style="font-weight:700; font-size:.86rem;">Correções sugeridas (${av.correcoes.length})</div>${av.correcoes.map(c => `<div class="ia-sug-corr" lang="fr"><del>${esc(c.trecho)}</del> → <ins>${esc(c.correcao)}</ins>${c.explicacao ? `<br><small>${esc(c.explicacao)}</small>` : ''}</div>`).join('')}` : ''}
    ${ex.version_amelioree ? `<details style="margin-top:10px;"><summary style="cursor:pointer; font-weight:700; font-size:.86rem;">Versão melhorada sugerida pela IA</summary><div class="texto-enviado-box" lang="fr" style="margin-top:6px;">${esc(ex.version_amelioree)}</div></details>` : ''}
    <div style="font-size:.74rem; color:var(--cinza-400); margin-top:10px;">Gerada em ${new Date(a.em).toLocaleString('pt-BR')}${a.modelo ? ' · ' + esc(a.modelo) : ''}. É só uma sugestão: confira antes de usar.</div>
    <div class="ia-sug-acoes">
      ${editavel ? '<button class="btn pequeno" type="button" id="usarAnaliseBtn">Usar como ponto de partida</button>' : ''}
      ${gerar('Refazer a análise')}
    </div>`;
  ligarGerar(p, editavel);
  const usar = document.getElementById('usarAnaliseBtn');
  if (usar) usar.addEventListener('click', () => usarAnaliseIA(av));
}
function ligarGerar(p, editavel) {
  const b = document.getElementById('gerarAnaliseBtn');
  if (!b) return;
  b.addEventListener('click', async () => {
    b.disabled = true; b.textContent = 'Analisando…';
    try {
      const r = await fetch(`/api/producoes/${p._id}/analise-ia`, { method: 'POST', headers: H() });
      producaoAtual.analiseIA = r.ok ? await r.json() : { status: 'erro', erro: 'servidor' };
    } catch (e) { producaoAtual.analiseIA = { status: 'erro', erro: e.message }; }
    renderAnaliseIA(producaoAtual, editavel);
  });
}
// Copia a sugestão da IA para a grade (só os campos vazios ou zerados; o professor revisa tudo).
function usarAnaliseIA(av) {
  const porId = Object.fromEntries((av.criterios || []).filter(c => c.id).map(c => [c.id, c]));
  document.querySelectorAll('#criteriosLista [data-crit]').forEach(inp => {
    const c = porId[inp.dataset.crit];
    if (c && c.nota != null) inp.value = c.nota;
  });
  document.querySelectorAll('#criteriosLista [data-crit-coment]').forEach(t => {
    const c = porId[t.dataset.critComent];
    if (c && c.comentario && !t.value.trim()) t.value = c.comentario;
  });
  const preencher = (id, v) => { const el = document.getElementById(id); if (el && !el.value.trim() && v) el.value = v; };
  preencher('comentarioGeralInput', av.comentarioGeral || '');
  preencher('pontosFortesInput', (av.pontosFortes || []).join('\n'));
  preencher('aMelhorarInput', (av.aMelhorar || []).join('\n'));
  atualizarTotal();
  if (persistAtual) persistAtual.agendar(montarAvaliacao);
  const importar = editorAtual && (av.correcoes || []).length ? editorAtual.importar(av.correcoes) : Promise.resolve(0);
  importar.then(n => mostrarCorrecaoMsg('Sugestão da IA copiada para a grade' + (n ? ` e ${n} correção(ões) marcadas no texto` : '') + '. Revise as notas e os comentários antes de devolver ao aluno.', false));
  document.getElementById('criteriosLista').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function adicionarLinhaCorrecaoAntiga(c = {}) {
  const div = document.createElement('div');
  div.className = 'correcao-linha';
  div.innerHTML = `<input type="text" data-c="trecho" placeholder="Trecho do aluno" maxlength="400">
    <input type="text" data-c="correcao" placeholder="Forma correta" maxlength="400">
    <textarea data-c="explicacao" placeholder="Explicação (opcional)" maxlength="600"></textarea>
    <button type="button" class="remover editavel">Remover</button>`;
  div.querySelector('[data-c="trecho"]').value = c.trecho || '';
  div.querySelector('[data-c="correcao"]').value = c.correcao || '';
  div.querySelector('[data-c="explicacao"]').value = c.explicacao || '';
  document.getElementById('correcoesLista').appendChild(div);
}
void adicionarLinhaCorrecaoAntiga;
document.getElementById('coletaneaCorrecao').addEventListener('click', e => {
  const head = e.target.closest('[data-doc]');
  if (head) document.getElementById('profDocCorpo' + head.dataset.doc).classList.toggle('show');
});

function lerNotas() {
  const notas = {};
  document.querySelectorAll('#criteriosLista [data-crit]').forEach(inp => {
    const max = Number(inp.max);
    let v = inp.value === '' ? 0 : Math.round(Number(inp.value) * 2) / 2;
    v = Math.min(max, Math.max(0, v || 0));
    notas[inp.dataset.crit] = v;
  });
  return notas;
}
function atualizarTotal() {
  const notas = lerNotas();
  gradeAtual.criterios.forEach(c => { const b = document.getElementById('barra-' + c.id); if (b) b.style.width = (notas[c.id] / c.max) * 100 + '%'; });
  const soma = Object.values(notas).reduce((t, v) => t + v, 0);
  const ajuste = document.getElementById('notaFinalInput').value;
  document.getElementById('notaTotalView').textContent = ajuste !== '' ? ajuste : Math.round(soma * 10) / 10;
}
document.getElementById('criteriosLista').addEventListener('input', atualizarTotal);
document.getElementById('notaFinalInput').addEventListener('input', atualizarTotal);

async function baixarArquivo(producaoId, tipo, nomeArquivo) {
  try {
    const res = await fetch(`/api/producoes/${producaoId}/arquivo/${tipo}`, { headers: H() });
    if (!res.ok) { alert('Não foi possível baixar o arquivo.'); return; }
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    a.href = url; a.download = nomeArquivo || 'arquivo';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  } catch (err) { alert('Erro ao baixar o arquivo.'); }
}
function formatarDuracao(seg) {
  const m = Math.floor((seg || 0) / 60), s = (seg || 0) % 60;
  return s ? `${m}min ${s}s` : `${m} min`;
}
async function carregarAudioPlayer(audioEl, producaoId, tipo) {
  try {
    const res = await fetch(`/api/producoes/${producaoId}/arquivo/${tipo}`, { headers: H() });
    if (res.ok) audioEl.src = URL.createObjectURL(await res.blob());
  } catch (err) { /* player fica sem áudio se falhar */ }
}

// ===================== ARQUIVO CORRIGIDO (opcional) =====================
const uploadBox = document.getElementById('uploadCorrigidoBox');
const arquivoCorrigidoInput = document.getElementById('arquivoCorrigidoInput');
uploadBox.addEventListener('click', () => arquivoCorrigidoInput.click());
arquivoCorrigidoInput.addEventListener('change', () => {
  const file = arquivoCorrigidoInput.files[0];
  if (!file) return;
  const ext = '.' + file.name.split('.').pop().toLowerCase();
  if (!['.pdf', '.docx', '.odt'].includes(ext)) { alert('Formato não aceito. Envie PDF, DOCX ou ODT.'); return; }
  arquivoCorrigidoSelecionado = file;
  document.getElementById('uploadCorrigidoTexto').textContent = '✓ ' + file.name;
  uploadBox.classList.add('tem-arquivo');
});

function montarAvaliacao() {
  const notas = lerNotas();
  document.querySelectorAll('#criteriosLista [data-crit]').forEach(inp => { if (inp.value === '') notas[inp.dataset.crit] = undefined; });
  const linhas = v => v.split('\n').map(x => x.trim()).filter(Boolean);
  return {
    criterios: gradeAtual.criterios.map(c => ({
      id: c.id, nome: c.nome, nota: notas[c.id],
      comentario: document.querySelector(`[data-crit-coment="${c.id}"]`).value
    })),
    notaTotal: Number(document.getElementById('notaTotalView').textContent) || 0,
    notaFinal: document.getElementById('notaFinalInput').value === '' ? undefined : Number(document.getElementById('notaFinalInput').value),
    comentarioGeral: document.getElementById('comentarioGeralInput').value,
    pontosFortes: linhas(document.getElementById('pontosFortesInput').value),
    aMelhorar: linhas(document.getElementById('aMelhorarInput').value),
    recomendacoes: linhas(document.getElementById('recomendacoesInput').value),
    feedbackFinal: document.getElementById('feedbackFinalInput').value,
    // as correções pontuais agora são as anotações no texto (o servidor as junta ao devolver)
    correcoes: []
  };
}
function mostrarCorrecaoMsg(texto, erro) {
  const el = document.getElementById('correcaoMsg');
  el.style.display = 'block';
  el.className = 'msg-inline ' + (erro ? 'erro' : 'sucesso');
  el.textContent = texto;
}

document.getElementById('salvarRascunhoBtn').addEventListener('click', () => salvarAgora());

document.getElementById('devolverBtn').addEventListener('click', async () => {
  const avaliacao = montarAvaliacao();
  if (avaliacao.criterios.some(c => c.nota === undefined)) { mostrarCorrecaoMsg('Dê uma nota a todos os critérios da grade antes de devolver.', true); document.getElementById('criteriosLista').scrollIntoView({ behavior: 'smooth' }); return; }
  if (!avaliacao.comentarioGeral.trim()) { mostrarCorrecaoMsg('Escreva a avaliação geral para o aluno antes de devolver.', true); document.getElementById('comentarioGeralInput').focus(); return; }
  const nAnot = editorAtual ? editorAtual.anotacoes().length : 0;
  if (!(await confirmar('Devolver ao aluno?', `O aluno verá a nota ${document.getElementById('notaTotalView').textContent}${document.getElementById('notaMaximaView').textContent}, ${nAnot} comentário(s) no texto e o feedback global imediatamente.`, 'Devolver ao aluno'))) return;
  try { await persistAtual?.descarregar(); } catch (e) { /* o envio abaixo leva a avaliação completa */ }
  const formData = new FormData();
  formData.append('avaliacao', JSON.stringify(avaliacao));
  if (arquivoCorrigidoSelecionado) formData.append('arquivo', arquivoCorrigidoSelecionado);
  document.getElementById('devolverBtn').disabled = true;
  try {
    const res = await fetch(`/api/producoes/${producaoAtual._id}/corrigir`, { method: 'POST', headers: H(), body: formData });
    const data = await res.json();
    if (res.ok) {
      mostrarCorrecaoMsg(data.msg, false);
      persistAtual?.descartarCopiaLocal();
      await fecharEditor(true);
      setTimeout(() => { mostrarView(voltarPara); if (voltarPara === 'alunos') { carregarAlunos(); abrirAluno(alunoSelecionado); } else { carregarFila(); carregarStats(); } }, 1200);
    } else {
      mostrarCorrecaoMsg(data.msg || 'Erro ao devolver.', true);
      document.getElementById('devolverBtn').disabled = false;
    }
  } catch (err) {
    mostrarCorrecaoMsg('Erro ao conectar ao servidor.', true);
    document.getElementById('devolverBtn').disabled = false;
  }
});

// ===================== CORREÇÃO ANOTADA (js/correcao/*) =====================
// Texto/áudio → marcações e comentários → critérios → feedback global → devolver.
// Tudo salva sozinho (anotações na hora; avaliação após uma pausa na digitação).
function mostrarEstado(est) {
  const el = document.getElementById('caEstado');
  if (!est) return;
  el.dataset.estado = est.estado;
  el.textContent = est.rotulo;
}
function mostrarSalvo(estado, detalhe) {
  const el = document.getElementById('caSalvo');
  el.dataset.s = estado;
  el.querySelector('span').textContent = estado === 'erro' ? 'Erro ao salvar' + (detalhe ? ': ' + detalhe : '') : ROTULO_SALVO[estado];
}

async function abrirEditor(p, editavel) {
  p.editavel = editavel;
  const t = p.temaId || {};
  document.getElementById('caAluno').textContent = p.alunoId?.nome || 'Aluno';
  document.getElementById('caTema').textContent = [t.titulo, tarefaDe(p), `${t.courseType || t.exame || ''} ${t.nivel || ''}`.trim(), p.protocolo].filter(Boolean).join(' · ');
  mostrarEstado(p.estadoCorrecao);
  const devolvida = ['corrigido', 'devolvido', 'aguardando_revisao'].includes(p.status);
  const dono = String(p.professorId?._id || p.professorId || '') === String(window.__eu?._id) || window.__eu?.role === 'admin';
  document.getElementById('caReabrirBtn').hidden = !(devolvida && dono && p.modoCorrecao !== 'ia' && !editavel);
  document.getElementById('caConcluirBtn').hidden = !editavel || p.status === 'aguardando_revisao';
  const i = navegacao.indexOf(String(p._id));
  document.getElementById('caAnterior').disabled = i <= 0;
  document.getElementById('caProxima').disabled = i < 0 || i >= navegacao.length - 1;
  mostrarSalvo('salvo');

  persistAtual = Correcao.Persistencia.criar(p._id, {
    onEstado: mostrarSalvo,
    // algo foi gravado: a correção em andamento passa a « Correção salva »
    onGravado: () => { if (producaoAtual?.status === 'em_correcao') mostrarEstado({ estado: 'salva', rotulo: 'Correção salva' }); },
    onAvaliacaoSalva: d => { if (d.estado) mostrarEstado(d.estado); if (producaoAtual) producaoAtual.correcao = Object.assign(producaoAtual.correcao || {}, { salvaEm: d.salvaEm }); }
  });
  persistAtual.definirDados(montarAvaliacao);
  // cópia local mais nova que o servidor (queda de conexão, aba fechada): oferece recuperar
  const copia = editavel && persistAtual.copiaLocal(p.correcao?.salvaEm);
  if (copia && await confirmar('Recuperar alterações não salvas?', `Há uma versão desta avaliação guardada neste navegador em ${new Date(copia.em).toLocaleString('pt-BR')}, mais nova que a do servidor.`, 'Recuperar', 'Descartar')) {
    aplicarAvaliacaoNaTela(copia.dados);
    persistAtual.agendar(montarAvaliacao);
  } else if (copia) persistAtual.descartarCopiaLocal();

  await Correcao.categorias.carregar();
  let audio = null;
  if (p.modalidade === 'oral' && p.arquivoOriginal?.nome) {
    audio = new Audio();
    audio.preload = 'metadata';
    carregarAudioPlayer(audio, p._id, 'original');
  }
  const folha = document.getElementById('caFolha'), painel = document.getElementById('caPainel');
  folha.className = ''; painel.className = '';
  editorAtual = Correcao.Editor.abrir({
    producao: p, folha, painel, editavel, persist: persistAtual, audio,
    onErro: msg => mostrarCorrecaoMsg(msg, true),
    onAviso: (msg, acao, fn) => avisoRapido(msg, acao, fn)
  });
  // arquivo anexo (sem texto digitado): botão de download dentro da folha
  if (p.modalidade !== 'oral' && p.arquivoOriginal?.nome) {
    const b = document.createElement('div');
    b.className = 'ca-dica';
    b.innerHTML = `Arquivo enviado: <b>${esc(p.arquivoOriginal.nome)}</b> · <button type="button" class="ca-mini" id="baixarOriginalBtn">Baixar</button>`;
    folha.appendChild(b);
    b.querySelector('#baixarOriginalBtn').addEventListener('click', () => baixarArquivo(p._id, 'original', p.arquivoOriginal.nome));
  }
}
function aplicarAvaliacaoNaTela(av) {
  const porId = Object.fromEntries((av.criterios || []).filter(c => c.id).map(c => [c.id, c]));
  document.querySelectorAll('#criteriosLista [data-crit]').forEach(inp => { const c = porId[inp.dataset.crit]; inp.value = c && c.nota != null ? c.nota : ''; });
  document.querySelectorAll('#criteriosLista [data-crit-coment]').forEach(tx => { const c = porId[tx.dataset.critComent]; tx.value = (c && c.comentario) || ''; });
  document.getElementById('notaFinalInput').value = av.notaFinal ?? '';
  document.getElementById('comentarioGeralInput').value = av.comentarioGeral || '';
  document.getElementById('pontosFortesInput').value = (av.pontosFortes || []).join('\n');
  document.getElementById('aMelhorarInput').value = (av.aMelhorar || []).join('\n');
  document.getElementById('recomendacoesInput').value = (av.recomendacoes || []).join('\n');
  document.getElementById('feedbackFinalInput').value = av.feedbackFinal || '';
  atualizarTotal();
}
async function fecharEditor(semSalvar) {
  if (persistAtual && !semSalvar) { try { await persistAtual.descarregar(); } catch (e) { /* a cópia local continua guardada */ } }
  if (editorAtual) editorAtual.fechar();
  if (persistAtual) persistAtual.parar();
  editorAtual = null; persistAtual = null;
}
function salvarAgora() {
  if (!persistAtual || !producaoAtual?.editavel) return;
  persistAtual.salvarAgora({ registrar: true }).then(() => mostrarCorrecaoMsg('Avaliação salva.', false)).catch(e => mostrarCorrecaoMsg(e.message, true));
}

// qualquer alteração da avaliação → salvamento automático
['criteriosLista', 'notaFinalInput', 'comentarioGeralInput', 'pontosFortesInput', 'aMelhorarInput', 'recomendacoesInput', 'feedbackFinalInput'].forEach(id => {
  document.getElementById(id).addEventListener('input', () => { if (persistAtual && producaoAtual?.editavel) persistAtual.agendar(montarAvaliacao); });
});

// Concluir: pronta para revisão (ainda não vai ao aluno)
document.getElementById('caConcluirBtn').addEventListener('click', async () => {
  try {
    await persistAtual.descarregar();
    const d = await persistAtual.concluir();
    producaoAtual.status = d.status;
    mostrarEstado(d.estado);
    document.getElementById('caConcluirBtn').hidden = true;
    mostrarCorrecaoMsg('Correção concluída. Revise quando quiser e devolva ao aluno.', false);
  } catch (e) { mostrarCorrecaoMsg(e.message, true); }
});
// Reabrir: volta a editar uma correção concluída ou já devolvida
document.getElementById('caReabrirBtn').addEventListener('click', async () => {
  const devolvida = ['corrigido', 'devolvido'].includes(producaoAtual.status);
  if (devolvida && !(await confirmar('Reabrir a correção?', 'O aluno passa a ver « correção em revisão » até você devolver de novo. Todas as alterações ficam no histórico.', 'Reabrir'))) return;
  try {
    const r = await fetch(`/api/producoes/${producaoAtual._id}/reabrir`, { method: 'POST', headers: H() });
    const d = await r.json();
    if (!r.ok) throw new Error(d.msg || 'Não foi possível reabrir.');
    abrirProducao(producaoAtual._id, false);
  } catch (e) { mostrarCorrecaoMsg(e.message, true); }
});

// Histórico de versões
const ROTULO_ACAO = { iniciou: 'Iniciou a correção', anotou: 'Comentou', editou_anotacao: 'Editou um comentário', removeu_anotacao: 'Excluiu um comentário', restaurou_anotacao: 'Restaurou um comentário',
  salvou_avaliacao: 'Salvou a avaliação', alterou_nota: 'Alterou a nota', concluiu: 'Concluiu', devolveu: 'Devolveu ao aluno', reabriu: 'Reabriu' };
document.getElementById('caHistoricoBtn').addEventListener('click', async () => {
  const id = producaoAtual._id;
  const r = await fetch(`/api/producoes/${id}/historico`, { headers: H() });
  const d = r.ok ? await r.json() : { historico: [] };
  const m = document.createElement('div');
  m.className = 'ca-modal ca';
  m.innerHTML = `<div role="dialog" aria-label="Histórico da correção"><h3>Histórico da correção <button type="button" class="ca-mini" data-f>Fechar ✕</button></h3>
    <p style="font-size:.84rem; margin:0 0 10px; opacity:.75;">Versão atual: ${d.versao || 0}. Cada marco (iniciar, mudar a nota, concluir, devolver, reabrir) cria uma nova versão.</p>
    <div class="ca-historico">${(d.historico || []).map(h => `<div class="ca-hist-item"><span class="v">Versão ${h.versao}</span><div><b>${esc(ROTULO_ACAO[h.acao] || h.acao)}</b>${h.resumo ? ' · ' + esc(h.resumo) : ''}<small>${esc(h.autorNome || '')} · ${new Date(h.em).toLocaleString('pt-BR')}</small></div></div>`).join('') || '<p>Nenhuma alteração registrada ainda.</p>'}</div></div>`;
  document.body.appendChild(m);
  const fechar = () => m.remove();
  m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-f]')) fechar(); });
  m.addEventListener('keydown', e => { if (e.key === 'Escape') fechar(); });
  m.querySelector('[data-f]').focus();
});

// Navegação entre produções da lista de origem
function irPara(passo) {
  const i = navegacao.indexOf(String(producaoAtual?._id));
  const id = navegacao[i + passo];
  if (i < 0 || !id) return;
  abrirProducao(id, false);
}
document.getElementById('caAnterior').addEventListener('click', () => irPara(-1));
document.getElementById('caProxima').addEventListener('click', () => irPara(1));
document.addEventListener('keydown', e => {
  if (document.getElementById('viewCorrecao').style.display === 'none') return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); salvarAgora(); }
  else if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); irPara(-1); }
  else if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); irPara(1); }
});
// Nunca perder a correção: avisa ao sair da página com algo pendente
window.addEventListener('beforeunload', e => { if (persistAtual && persistAtual.temPendencias()) { e.preventDefault(); e.returnValue = ''; } });

// Confirmação no estilo do site (no lugar da caixa do navegador)
function confirmar(titulo, texto, ok, cancelar) {
  return new Promise(res => {
    const m = document.createElement('div');
    m.className = 'ca-modal ca';
    m.innerHTML = `<div role="alertdialog" aria-label="${esc(titulo)}"><h3>${esc(titulo)}</h3><p style="line-height:1.55; margin:0 0 16px;">${esc(texto)}</p>
      <div class="ca-pop-acoes"><button type="button" class="ca-btn" data-r="0">${esc(cancelar || 'Cancelar')}</button><button type="button" class="ca-btn primario" data-r="1">${esc(ok || 'Confirmar')}</button></div></div>`;
    document.body.appendChild(m);
    const fim = v => { m.remove(); res(v); };
    m.addEventListener('click', e => { const b = e.target.closest('[data-r]'); if (b) fim(b.dataset.r === '1'); else if (e.target === m) fim(false); });
    m.addEventListener('keydown', e => { if (e.key === 'Escape') fim(false); });
    m.querySelector('[data-r="1"]').focus();
  });
}
// Aviso rápido no rodapé, com ação (ex.: « Desfazer »)
function avisoRapido(msg, acao, fn) {
  let el = document.getElementById('caAvisoRapido');
  if (!el) {
    el = document.createElement('div'); el.id = 'caAvisoRapido'; el.className = 'ca'; el.setAttribute('role', 'status');
    el.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:1300;display:flex;gap:12px;align-items:center;padding:10px 16px;border-radius:999px;background:#1c2b3a;color:#fff;font:600 .86rem Poppins,sans-serif;box-shadow:0 12px 30px -10px rgba(0,0,0,.5)';
    document.body.appendChild(el);
  }
  el.innerHTML = esc(msg) + (acao ? ` <button type="button" style="border:0;background:#ffd60a;color:#16213a;border-radius:999px;padding:5px 12px;font:700 .8rem Poppins,sans-serif;cursor:pointer">${esc(acao)}</button>` : '');
  el.style.display = 'flex';
  const b = el.querySelector('button'); if (b) b.addEventListener('click', () => { el.style.display = 'none'; fn(); });
  clearTimeout(el._t); el._t = setTimeout(() => { el.style.display = 'none'; }, 6000);
}

// ===================== CATEGORIAS DE MARCAÇÃO (admin) =====================
// Cada cor tem um significado pedagógico. O admin renomeia, recolore, descreve, liga/desliga,
// escolhe se vale para a escrita e/ou o oral, reordena (a ordem define as teclas 1–9) e cria novas.
async function abrirConfigCategorias() {
  const d = await (await fetch('/api/correcao/categorias', { headers: H() })).json();
  let lista = JSON.parse(JSON.stringify(d.categorias || []));
  const m = document.createElement('div');
  m.className = 'ca-modal ca';
  const linha = (c, i) => `<div class="cat-cfg" data-i="${i}" style="display:grid; grid-template-columns:auto 44px 1fr auto; gap:8px; align-items:start; padding:10px 0; border-bottom:1px solid var(--ca-borda);">
      <div style="display:flex; flex-direction:column; gap:2px;"><button type="button" class="ca-mini" data-mov="-1" aria-label="Subir" ${i === 0 ? 'disabled' : ''}>▲</button><button type="button" class="ca-mini" data-mov="1" aria-label="Descer" ${i === lista.length - 1 ? 'disabled' : ''}>▼</button></div>
      <input type="color" data-k="cor" value="${esc(c.cor)}" aria-label="Cor" style="width:44px; height:38px; border:0; background:none; cursor:pointer;">
      <div><input type="text" data-k="nome" value="${esc(c.nome)}" maxlength="60" aria-label="Nome" style="width:100%; padding:8px 10px; border-radius:10px; border:1px solid var(--ca-borda); font-weight:600;">
        <input type="text" data-k="descricao" value="${esc(c.descricao || '')}" maxlength="200" placeholder="Significado pedagógico" aria-label="Descrição" style="width:100%; margin-top:6px; padding:7px 10px; border-radius:10px; border:1px solid var(--ca-borda); font-size:.82rem;">
        <div style="display:flex; gap:14px; margin-top:6px; font-size:.78rem;">
          <label><input type="checkbox" data-mod="textual" ${!c.modalidades || c.modalidades.includes('textual') ? 'checked' : ''}> Escrita</label>
          <label><input type="checkbox" data-mod="oral" ${!c.modalidades || c.modalidades.includes('oral') ? 'checked' : ''}> Oral</label>
          <label><input type="checkbox" data-k="ativa" ${c.ativa !== false ? 'checked' : ''}> Ativa</label>
          ${i < 9 ? `<span style="opacity:.6;">tecla ${i + 1}</span>` : ''}</div></div>
      <span style="font:700 .7rem Poppins,sans-serif; opacity:.5;">${esc(c.id)}</span></div>`;
  const ler = () => {
    m.querySelectorAll('.cat-cfg').forEach(el => {
      const c = lista[Number(el.dataset.i)];
      c.cor = el.querySelector('[data-k="cor"]').value; c.nome = el.querySelector('[data-k="nome"]').value; c.descricao = el.querySelector('[data-k="descricao"]').value;
      c.ativa = el.querySelector('[data-k="ativa"]').checked;
      c.modalidades = [...el.querySelectorAll('[data-mod]:checked')].map(x => x.dataset.mod);
    });
  };
  const desenhar = () => {
    m.innerHTML = `<div role="dialog" aria-label="Categorias de marcação" style="width:min(680px,100%);"><h3>Categorias de marcação <button type="button" class="ca-mini" data-f>Fechar ✕</button></h3>
      <p style="font-size:.84rem; opacity:.8; margin:0 0 6px;">As cores aparecem para o professor ao corrigir e para o aluno na correção devolvida. Correções já feitas guardam o nome e a cor da época.</p>
      <div>${lista.map(linha).join('')}</div>
      <div class="ca-pop-acoes" style="justify-content:space-between;"><button type="button" class="ca-btn" data-nova>+ Nova categoria</button>
        <span><button type="button" class="ca-btn" data-padrao>Restaurar padrão</button> <button type="button" class="ca-btn primario" data-salvar>Salvar categorias</button></span></div>
      <p class="msg-inline" data-msg style="display:none;"></p></div>`;
  };
  desenhar();
  document.body.appendChild(m);
  m.addEventListener('click', async e => {
    if (e.target === m || e.target.closest('[data-f]')) { m.remove(); return; }
    const mov = e.target.closest('[data-mov]');
    if (mov) { ler(); const i = Number(mov.closest('.cat-cfg').dataset.i), j = i + Number(mov.dataset.mov); [lista[i], lista[j]] = [lista[j], lista[i]]; desenhar(); return; }
    if (e.target.closest('[data-nova]')) { ler(); lista.push({ id: 'cat' + Date.now().toString(36).slice(-5), nome: 'Nova categoria', cor: '#475569', descricao: '', ativa: true, modalidades: ['textual', 'oral'] }); desenhar(); return; }
    if (e.target.closest('[data-padrao]')) { lista = JSON.parse(JSON.stringify(d.padrao || [])); desenhar(); return; }
    if (e.target.closest('[data-salvar]')) {
      ler();
      const r = await fetch('/api/correcao/categorias', { method: 'PUT', headers: HJ(), body: JSON.stringify({ categorias: lista }) });
      const out = await r.json();
      const msg = m.querySelector('[data-msg]');
      msg.style.display = 'block'; msg.className = 'msg-inline ' + (r.ok ? 'sucesso' : 'erro');
      msg.textContent = r.ok ? 'Categorias salvas. Elas valem nas próximas correções abertas.' : (out.msg || 'Erro ao salvar.');
      if (r.ok) Correcao.categorias.definir(out.categorias);
    }
  });
}
euPronto.then(() => {
  if (window.__eu?.role !== 'admin') return;
  const alvo = document.getElementById('atualizarFilaBtn');
  if (!alvo || document.getElementById('configCategoriasBtn')) return;
  const b = document.createElement('button');
  b.className = 'btn secundario'; b.id = 'configCategoriasBtn'; b.type = 'button';
  b.textContent = 'Cores e categorias';
  b.title = 'Configurar as categorias de marcação (cores e significados)';
  b.addEventListener('click', abrirConfigCategorias);
  alvo.after(b);
});

// ===================== INIT =====================
carregarStats();
carregarFila();
carregarAlunos();
if (location.hash === '#alunos') mostrarView('alunos');
if (location.hash === '#corrigidas') { mostrarView('corrigidas'); carregarCorrigidas(); }
if (location.hash === '#aovivo') mostrarView('aovivo');
const idPedido = new URLSearchParams(location.search).get('producao');
if (idPedido) {
  const assumir = new URLSearchParams(location.search).get('assumir') === '1';
  voltarPara = 'fila';
  euPronto.then(() => abrirProducao(idPedido, assumir));
}
