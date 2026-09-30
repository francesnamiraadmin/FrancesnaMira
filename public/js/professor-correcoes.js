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
const euPronto = fetch('/api/auth/me', { headers: H() }).then(r => r.ok ? r.json() : null).then(u => { window.__eu = u; }).catch(() => {});

// ===================== ABAS =====================
function mostrarView(nome) {
  document.getElementById('viewFila').style.display = nome === 'fila' ? 'block' : 'none';
  document.getElementById('viewAlunos').style.display = nome === 'alunos' ? 'block' : 'none';
  document.getElementById('viewCorrecao').style.display = nome === 'correcao' ? 'block' : 'none';
  document.getElementById('abasSistema').style.display = nome === 'correcao' ? 'none' : 'flex';
  document.querySelectorAll('#abasSistema .aba').forEach(a => a.classList.toggle('active', a.dataset.aba === nome));
}
document.getElementById('abasSistema').addEventListener('click', e => {
  const aba = e.target.closest('.aba');
  if (!aba) return;
  mostrarView(aba.dataset.aba);
  if (aba.dataset.aba === 'alunos') carregarAlunos();
  else { carregarFila(); carregarStats(); }
});
document.getElementById('voltarFilaBtn').addEventListener('click', () => {
  mostrarView(voltarPara);
  if (voltarPara === 'alunos') { carregarAlunos(); if (alunoSelecionado) abrirAluno(alunoSelecionado); }
  else { carregarFila(); carregarStats(); }
});
document.getElementById('atualizarFilaBtn').addEventListener('click', carregarFila);
['filtroCurso', 'filtroStatus', 'filtroPrioridade'].forEach(id => document.getElementById(id).addEventListener('change', carregarFila));

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
    lista.innerHTML = producoes.map(renderFilaItem).join('');
  } catch (err) {
    lista.innerHTML = '<div class="vazio-box">Erro ao carregar a fila.</div>';
  }
}

function renderFilaItem(p) {
  const urgente = p.prazoEstimado && (new Date(p.prazoEstimado).getTime() - Date.now()) < 2 * 24 * 60 * 60 * 1000;
  const minha = p.status === 'em_correcao';
  const t = p.temaId || {};
  return `<div class="fila-item" data-id="${p._id}" data-status="${p.status}">
    <div>
      <h4>${esc(t.titulo || 'Tema')}</h4>
      <div class="meta">Aluno: ${esc(p.alunoId?.nome || '—')} · Enviado em ${fmtData(p.dataEnvio)} · Prazo: ${fmtData(p.prazoEstimado)}</div>
      <div style="margin-top:8px; display:flex; gap:6px; flex-wrap:wrap;">
        <span class="tag exame">${esc(t.courseType || t.exame || '')} · ${esc(t.nivel || '')}</span>
        <span class="tag status">${p.modalidade === 'oral' ? 'Produção oral' : 'Redação'}</span>
        ${p.ia?.status === 'erro' ? '<span class="tag ia">IA indisponível → professor</span>' : ''}
        ${urgente ? '<span class="tag urgente">Urgente</span>' : ''}
        ${minha ? '<span class="tag minha">Assumida por mim</span>' : ''}
      </div>
    </div>
    <button class="btn pequeno" data-abrir="${p._id}">${minha ? 'Continuar correção' : 'Assumir e corrigir'}</button>
  </div>`;
}
document.getElementById('filaLista').addEventListener('click', e => {
  const btn = e.target.closest('[data-abrir]');
  if (btn) { voltarPara = 'fila'; abrirProducao(btn.dataset.abrir, btn.closest('.fila-item')?.dataset.status === 'em_fila'); }
});

// ===================== ALUNOS E CRÉDITOS =====================
async function carregarAlunos() {
  const el = document.getElementById('listaAlunos');
  if (!alunos.length) el.innerHTML = '<p style="opacity:0.6;">Carregando alunos…</p>';
  try {
    const res = await fetch('/api/creditos/alunos', { headers: H() });
    alunos = res.ok ? await res.json() : [];
  } catch (err) { alunos = []; }
  document.getElementById('contAlunos').textContent = alunos.length;
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
    ${a.producoes.length ? a.producoes.map(p => `
      <div class="prod-linha" data-prod="${p._id}" data-status="${p.status}">
        <div><strong>${esc(p.temaId?.titulo || 'Tema')}</strong>
          <small>${esc(p.temaId?.courseType || '')} ${esc(p.temaId?.nivel || '')} · ${p.modalidade === 'oral' ? 'oral' : 'redação'} · ${fmtData(p.dataEnvio)} · ${NOMES_STATUS[p.status] || p.status}${p.modoCorrecao === 'ia' ? ' · corrigida pela IA' : ''}</small></div>
        ${p.avaliacao?.notaTotal !== undefined && ['corrigido', 'devolvido'].includes(p.status)
          ? `<span class="nota-pill">${p.avaliacao.notaTotal}/${p.avaliacao.notaMaxima || 20}</span>`
          : `<span class="tag status">${NOMES_STATUS[p.status] || p.status}</span>`}
      </div>`).join('') : '<p style="font-size:.85rem; color:var(--cinza-400);">Este aluno ainda não enviou produções.</p>'}`;
}
document.getElementById('painelAluno').addEventListener('click', async e => {
  const rapido = e.target.closest('[data-rapido]');
  if (rapido) { document.getElementById('qtdCreditos').value = rapido.dataset.rapido; return; }
  if (e.target.closest('#addCreditosBtn')) { adicionarCreditos(); return; }
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
  if (p.modalidade === 'oral' && p.arquivoOriginal?.nome) {
    producaoHtml = `<div style="font-weight:700; margin-bottom:8px;">Gravação do aluno${p.duracaoSegundos ? ' — ' + formatarDuracao(p.duracaoSegundos) : ''}</div><audio controls id="audioProducaoOriginal" style="width:100%;"></audio>`;
  } else if (p.arquivoOriginal?.nome) {
    producaoHtml = `<div class="arquivo-baixar-box"><img src="img/icones/document.svg" alt="" style="width:1.6rem; height:1.6rem;"><div style="flex:1;"><div style="font-weight:700;">${esc(p.arquivoOriginal.nome)}</div><div style="font-size:0.8rem; color:var(--cinza-400);">${(p.arquivoOriginal.tamanho / 1024).toFixed(0)} KB</div></div><button class="btn pequeno" id="baixarOriginalBtn">Baixar</button></div>`;
  } else if (p.textoDigitado) {
    producaoHtml = `<div class="texto-enviado-box">${esc(p.textoDigitado)}</div><div style="margin-top:8px; font-size:0.8rem; color:var(--cinza-400);">${p.contagemPalavras} palavras (pedido: ${tema.limitePalavrasMin}–${tema.limitePalavrasMax})</div>`;
  }
  document.getElementById('producaoEnviadaBox').innerHTML = producaoHtml;
  const baixarBtn = document.getElementById('baixarOriginalBtn');
  if (baixarBtn) baixarBtn.addEventListener('click', () => baixarArquivo(p._id, 'original', p.arquivoOriginal.nome));
  const audioEl = document.getElementById('audioProducaoOriginal');
  if (audioEl) carregarAudioPlayer(audioEl, p._id, 'original');

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
  document.getElementById('correcoesLista').innerHTML = '';
  (av.correcoes || []).forEach(adicionarLinhaCorrecao);
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

function adicionarLinhaCorrecao(c = {}) {
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
document.getElementById('addCorrecaoBtn').addEventListener('click', () => adicionarLinhaCorrecao());
document.getElementById('correcoesLista').addEventListener('click', e => {
  if (e.target.closest('.remover')) e.target.closest('.correcao-linha').remove();
});
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
    correcoes: [...document.querySelectorAll('#correcoesLista .correcao-linha')].map(l => ({
      trecho: l.querySelector('[data-c="trecho"]').value.trim(),
      correcao: l.querySelector('[data-c="correcao"]').value.trim(),
      explicacao: l.querySelector('[data-c="explicacao"]').value.trim()
    })).filter(c => c.trecho)
  };
}
function mostrarCorrecaoMsg(texto, erro) {
  const el = document.getElementById('correcaoMsg');
  el.style.display = 'block';
  el.className = 'msg-inline ' + (erro ? 'erro' : 'sucesso');
  el.textContent = texto;
}

document.getElementById('salvarRascunhoBtn').addEventListener('click', async () => {
  try {
    const res = await fetch(`/api/producoes/${producaoAtual._id}/avaliacao`, { method: 'PUT', headers: HJ(), body: JSON.stringify(montarAvaliacao()) });
    const data = await res.json();
    mostrarCorrecaoMsg(res.ok ? data.msg : (data.msg || 'Erro ao salvar rascunho.'), !res.ok);
  } catch (err) { mostrarCorrecaoMsg('Erro ao conectar ao servidor.', true); }
});

document.getElementById('devolverBtn').addEventListener('click', async () => {
  const avaliacao = montarAvaliacao();
  if (!avaliacao.criterios.some(c => c.nota > 0) && !confirm('Todos os critérios estão com nota 0. Devolver mesmo assim?')) return;
  if (!avaliacao.comentarioGeral.trim()) { mostrarCorrecaoMsg('Escreva um comentário geral para o aluno antes de devolver.', true); return; }
  if (!confirm('Devolver esta correção ao aluno? Ele verá o resultado imediatamente.')) return;
  const formData = new FormData();
  formData.append('avaliacao', JSON.stringify(avaliacao));
  if (arquivoCorrigidoSelecionado) formData.append('arquivo', arquivoCorrigidoSelecionado);
  document.getElementById('devolverBtn').disabled = true;
  try {
    const res = await fetch(`/api/producoes/${producaoAtual._id}/corrigir`, { method: 'POST', headers: H(), body: formData });
    const data = await res.json();
    if (res.ok) {
      mostrarCorrecaoMsg(data.msg, false);
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

// ===================== INIT =====================
carregarStats();
carregarFila();
carregarAlunos();
if (location.hash === '#alunos') mostrarView('alunos');
