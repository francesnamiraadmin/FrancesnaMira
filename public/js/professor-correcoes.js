const token = localStorage.getItem('token');
const NOMES_TIPO_DOC = {
  artigo: 'Artigo', noticia: 'Notícia', estatistica: 'Estatística', infografico: 'Infográfico',
  entrevista: 'Entrevista', cartum: 'Cartum', grafico: 'Gráfico', fotografia: 'Fotografia',
  tabela: 'Tabela', documento_oficial: 'Documento Oficial'
};
const NOMES_STATUS = {
  rascunho: 'Rascunho', aguardando_envio: 'Aguardando envio', enviado: 'Enviado', em_fila: 'Em fila',
  em_correcao: 'Em correção', aguardando_revisao: 'Aguardando revisão', corrigido: 'Corrigido',
  devolvido: 'Devolvido', arquivado: 'Arquivado', cancelado: 'Cancelado'
};

let producaoAtual = null;
let rubricaAtual = null;
let notasCriterios = {};
let arquivoCorrigidoSelecionado = null;

function mostrarView(nome) {
  document.getElementById('viewFila').style.display = nome === 'fila' ? 'block' : 'none';
  document.getElementById('viewCorrecao').style.display = nome === 'correcao' ? 'block' : 'none';
}
document.getElementById('voltarFilaBtn').addEventListener('click', () => { mostrarView('fila'); carregarFila(); carregarStats(); });
document.getElementById('atualizarFilaBtn').addEventListener('click', carregarFila);
['filtroExame', 'filtroStatus', 'filtroPrioridade'].forEach(id => document.getElementById(id).addEventListener('change', carregarFila));

// ===================== CRÉDITOS =====================
document.getElementById('concederCreditosBtn').addEventListener('click', async () => {
  const email = document.getElementById('credEmail').value.trim();
  const quantidade = Number(document.getElementById('credQtd').value);
  const msgEl = document.getElementById('credMsg');
  if (!email || !quantidade) {
    msgEl.style.display = 'block'; msgEl.className = 'msg-inline erro'; msgEl.textContent = 'Informe e-mail e quantidade.';
    return;
  }
  try {
    const res = await fetch('/api/creditos', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ email, quantidade })
    });
    const data = await res.json();
    msgEl.style.display = 'block';
    msgEl.className = 'msg-inline ' + (res.ok ? 'sucesso' : 'erro');
    msgEl.textContent = data.msg;
    if (res.ok) { document.getElementById('credEmail').value = ''; document.getElementById('credQtd').value = '1'; }
  } catch (err) {
    msgEl.style.display = 'block'; msgEl.className = 'msg-inline erro'; msgEl.textContent = 'Erro ao conectar ao servidor.';
  }
});

// ===================== ESTATÍSTICAS =====================
async function carregarStats() {
  try {
    const res = await fetch('/api/producoes/professor/stats', { headers: { Authorization: 'Bearer ' + token } });
    const s = await res.json();
    document.getElementById('kpiRow').innerHTML = `
      <div class="kpi"><div class="valor">${s.pendentes}</div><div class="rotulo">Correções pendentes (fila)</div></div>
      <div class="kpi"><div class="valor">${s.emAndamento}</div><div class="rotulo">Em andamento (minhas)</div></div>
      <div class="kpi"><div class="valor">${s.concluidas}</div><div class="rotulo">Concluídas por mim</div></div>
      <div class="kpi"><div class="valor">${s.tempoMedioHoras !== null ? s.tempoMedioHoras + 'h' : '—'}</div><div class="rotulo">Tempo médio de correção</div></div>`;
  } catch (err) {}
}

// ===================== FILA =====================
async function carregarFila() {
  const params = new URLSearchParams();
  const exame = document.getElementById('filtroExame').value;
  const status = document.getElementById('filtroStatus').value;
  const prioridade = document.getElementById('filtroPrioridade').value;
  if (exame) params.set('exame', exame);
  if (status) params.set('status', status);
  if (prioridade) params.set('prioridade', prioridade);

  const lista = document.getElementById('filaLista');
  lista.innerHTML = '<p style="opacity:0.6;">Carregando fila...</p>';
  try {
    const res = await fetch(`/api/producoes/professor/fila?${params}`, { headers: { Authorization: 'Bearer ' + token } });
    const producoes = await res.json();
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
  return `<div class="fila-item" data-id="${p._id}" data-status="${p.status}">
    <div>
      <h4>${p.temaId?.titulo || 'Tema'}</h4>
      <div class="meta">Aluno: ${p.alunoId?.nome || '—'} · Enviado em ${new Date(p.dataEnvio).toLocaleDateString('pt-BR')} · Prazo: ${p.prazoEstimado ? new Date(p.prazoEstimado).toLocaleDateString('pt-BR') : '—'}</div>
      <div style="margin-top:8px; display:flex; gap:6px; flex-wrap:wrap;">
        <span class="tag exame">${p.temaId?.exame} · ${p.temaId?.nivel}</span>
        ${urgente ? '<span class="tag urgente">Urgente</span>' : ''}
        ${minha ? '<span class="tag minha">Assumida por mim</span>' : ''}
      </div>
    </div>
    <button class="btn pequeno" data-abrir="${p._id}">${minha ? 'Continuar correção' : 'Assumir e corrigir'}</button>
  </div>`;
}

document.getElementById('filaLista').addEventListener('click', e => {
  const btn = e.target.closest('[data-abrir]');
  if (btn) abrirProducaoParaCorrecao(btn.dataset.abrir);
});

async function abrirProducaoParaCorrecao(id) {
  try {
    const item = document.querySelector(`.fila-item[data-id="${id}"]`);
    if (item && item.dataset.status === 'em_fila') {
      const resAssumir = await fetch(`/api/producoes/${id}/assumir`, { method: 'POST', headers: { Authorization: 'Bearer ' + token } });
      if (!resAssumir.ok) { const d = await resAssumir.json(); alert(d.msg || 'Não foi possível assumir esta produção.'); carregarFila(); return; }
    }
    const res = await fetch(`/api/producoes/${id}`, { headers: { Authorization: 'Bearer ' + token } });
    if (!res.ok) { alert('Não foi possível abrir esta produção.'); return; }
    producaoAtual = await res.json();

    const resRubrica = await fetch(`/api/temas/rubrica/${producaoAtual.temaId.exame}?modalidade=${producaoAtual.modalidade || 'textual'}`, { headers: { Authorization: 'Bearer ' + token } });
    rubricaAtual = resRubrica.ok ? await resRubrica.json() : { criterios: [] };

    renderCorrecao(producaoAtual);
    mostrarView('correcao');
    window.scrollTo(0, 0);
  } catch (err) {
    alert('Erro ao abrir a produção.');
  }
}

// ===================== TELA DE CORREÇÃO =====================
function renderCorrecao(p) {
  const tema = p.temaId;

  document.getElementById('dadosAluno').innerHTML = `
    <div class="dado-linha"><span class="rotulo">Nome</span><span class="valor">${p.alunoId.nome}</span></div>
    <div class="dado-linha"><span class="rotulo">E-mail</span><span class="valor">${p.alunoId.email}</span></div>
    <div class="dado-linha"><span class="rotulo">Protocolo</span><span class="valor">${p.protocolo}</span></div>
    <div class="dado-linha"><span class="rotulo">Tema</span><span class="valor">${tema.titulo}</span></div>
    <div class="dado-linha"><span class="rotulo">Exame / Nível</span><span class="valor">${tema.exame} · ${tema.nivel}</span></div>
    <div class="dado-linha"><span class="rotulo">Enviado em</span><span class="valor">${new Date(p.dataEnvio).toLocaleString('pt-BR')}</span></div>
    ${p.observacoesAluno ? `<div class="dado-linha"><span class="rotulo">Observações do aluno</span><span class="valor">${p.observacoesAluno}</span></div>` : ''}`;

  document.getElementById('instrucaoBox').textContent = tema.instrucoes;

  document.getElementById('coletaneaCorrecao').innerHTML = (tema.coletanea || []).map((d, i) => `
    <div class="doc-item">
      <div class="doc-head" data-doc="${i}">${NOMES_TIPO_DOC[d.tipo] || d.tipo} — ${d.titulo}</div>
      <div class="doc-corpo" id="profDocCorpo${i}">${d.conteudo}</div>
    </div>`).join('');

  let producaoHtml = '';
  if (p.modalidade === 'oral' && p.arquivoOriginal?.nome) {
    producaoHtml = `<div style="font-weight:700; margin-bottom:8px;">🎤 Gravação do aluno${p.duracaoSegundos ? ' — ' + formatarDuracao(p.duracaoSegundos) : ''}</div><audio controls id="audioProducaoOriginal" style="width:100%;"></audio>`;
  } else if (p.arquivoOriginal?.nome) {
    producaoHtml = `<div class="arquivo-baixar-box"><span style="font-size:1.6rem;">📄</span><div style="flex:1;"><div style="font-weight:700;">${p.arquivoOriginal.nome}</div><div style="font-size:0.8rem; color:var(--cinza-400);">${(p.arquivoOriginal.tamanho / 1024).toFixed(0)} KB</div></div><button class="btn pequeno" id="baixarOriginalBtn">Baixar</button></div>`;
  } else if (p.textoDigitado) {
    producaoHtml = `<div class="texto-enviado-box">${p.textoDigitado}</div><div style="margin-top:8px; font-size:0.8rem; color:var(--cinza-400);">${p.contagemPalavras} palavras</div>`;
  }
  document.getElementById('producaoEnviadaBox').innerHTML = producaoHtml;
  const baixarBtn = document.getElementById('baixarOriginalBtn');
  if (baixarBtn) baixarBtn.addEventListener('click', () => baixarArquivo(p._id, 'original', p.arquivoOriginal.nome));
  const audioEl = document.getElementById('audioProducaoOriginal');
  if (audioEl) carregarAudioPlayer(audioEl, p._id, 'original');

  document.getElementById('historicoAluno').innerHTML = `<div class="hist-item">Protocolo atual: ${p.protocolo} — status ${NOMES_STATUS[p.status]}</div>` +
    (p.historicoStatus || []).map(h => `<div class="hist-item">${NOMES_STATUS[h.status] || h.status} em ${new Date(h.data).toLocaleString('pt-BR')}</div>`).join('');

  // Critérios
  notasCriterios = {};
  const avaliacaoExistente = p.avaliacao?.criterios || [];
  document.getElementById('criteriosLista').innerHTML = (rubricaAtual.criterios || []).map(c => {
    const existente = avaliacaoExistente.find(a => a.nome === c.nome);
    notasCriterios[c.nome] = { nota: existente?.nota || 0, comentario: existente?.comentario || '' };
    return `<div class="criterio-card" data-criterio="${c.nome}">
      <div class="nome">${c.nome}</div>
      <div class="desc">${c.descricao || ''}</div>
      <div class="estrelas-input" data-criterio-estrelas="${c.nome}">
        ${[1, 2, 3, 4, 5].map(n => `<button type="button" data-nota="${n}" class="${n <= (existente?.nota || 0) ? 'cheia' : ''}">★</button>`).join('')}
      </div>
      <textarea data-criterio-comentario="${c.nome}" placeholder="Comentário sobre este critério...">${existente?.comentario || ''}</textarea>
    </div>`;
  }).join('');

  document.getElementById('notaTotalInput').value = p.avaliacao?.notaTotal ?? '';
  document.getElementById('nivelEstimadoInput').value = p.avaliacao?.nivelEstimado || tema.nivel;
  document.getElementById('comentarioGeralInput').value = p.avaliacao?.comentarioGeral || '';
  document.getElementById('correcaoMsg').style.display = 'none';
  arquivoCorrigidoSelecionado = null;
  document.getElementById('uploadCorrigidoTexto').textContent = 'Clique para anexar o arquivo corrigido (PDF, DOCX ou ODT)';
  document.getElementById('uploadCorrigidoBox').classList.remove('tem-arquivo');
}

document.getElementById('coletaneaCorrecao').addEventListener('click', e => {
  const head = e.target.closest('[data-doc]');
  if (!head) return;
  document.getElementById('profDocCorpo' + head.dataset.doc).classList.toggle('show');
});

document.getElementById('criteriosLista').addEventListener('click', e => {
  const btn = e.target.closest('[data-nota]');
  if (!btn) return;
  const wrap = btn.closest('[data-criterio-estrelas]');
  const nome = wrap.dataset.criterioEstrelas;
  const nota = Number(btn.dataset.nota);
  notasCriterios[nome].nota = nota;
  wrap.querySelectorAll('button').forEach(b => b.classList.toggle('cheia', Number(b.dataset.nota) <= nota));
});
document.getElementById('criteriosLista').addEventListener('input', e => {
  const el = e.target.closest('[data-criterio-comentario]');
  if (!el) return;
  notasCriterios[el.dataset.criterioComentario].comentario = el.value;
});

document.getElementById('calcularNotaBtn').addEventListener('click', () => {
  const notas = Object.values(notasCriterios).map(c => c.nota).filter(n => n > 0);
  if (notas.length === 0) { alert('Avalie ao menos um critério antes de calcular.'); return; }
  const media = notas.reduce((a, b) => a + b, 0) / notas.length;
  const notaMaxima = rubricaAtual.notaMaxima || 20;
  document.getElementById('notaTotalInput').value = Math.round((media / 5) * notaMaxima * 10) / 10;
});

async function baixarArquivo(producaoId, tipo, nomeArquivo) {
  try {
    const res = await fetch(`/api/producoes/${producaoId}/arquivo/${tipo}`, { headers: { Authorization: 'Bearer ' + token } });
    if (!res.ok) { alert('Não foi possível baixar o arquivo.'); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
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

// Mesmo padrão de fetch+blob de baixarArquivo, só que aponta pro <audio> em
// vez de disparar um download — a rota exige Authorization.
async function carregarAudioPlayer(audioEl, producaoId, tipo) {
  try {
    const res = await fetch(`/api/producoes/${producaoId}/arquivo/${tipo}`, { headers: { Authorization: 'Bearer ' + token } });
    if (!res.ok) return;
    const blob = await res.blob();
    audioEl.src = URL.createObjectURL(blob);
  } catch (err) { /* player fica sem áudio se falhar */ }
}

// ===================== UPLOAD DO ARQUIVO CORRIGIDO =====================
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
  return {
    criterios: Object.entries(notasCriterios).map(([nome, v]) => ({ nome, nota: v.nota, comentario: v.comentario })),
    notaTotal: Number(document.getElementById('notaTotalInput').value),
    nivelEstimado: document.getElementById('nivelEstimadoInput').value,
    comentarioGeral: document.getElementById('comentarioGeralInput').value
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
    const res = await fetch(`/api/producoes/${producaoAtual._id}/avaliacao`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify(montarAvaliacao())
    });
    const data = await res.json();
    mostrarCorrecaoMsg(res.ok ? data.msg : (data.msg || 'Erro ao salvar rascunho.'), !res.ok);
  } catch (err) { mostrarCorrecaoMsg('Erro ao conectar ao servidor.', true); }
});

document.getElementById('devolverBtn').addEventListener('click', async () => {
  const avaliacao = montarAvaliacao();
  if (!avaliacao.criterios.some(c => c.nota > 0)) { mostrarCorrecaoMsg('Avalie ao menos um critério antes de devolver.', true); return; }
  if (!avaliacao.notaTotal && avaliacao.notaTotal !== 0) { mostrarCorrecaoMsg('Informe a nota total antes de devolver.', true); return; }
  if (!arquivoCorrigidoSelecionado) { mostrarCorrecaoMsg('Anexe o arquivo corrigido antes de devolver ao aluno.', true); return; }
  if (!confirm('Devolver esta correção ao aluno? Ele receberá acesso imediato ao resultado.')) return;

  const formData = new FormData();
  formData.append('avaliacao', JSON.stringify(avaliacao));
  formData.append('arquivo', arquivoCorrigidoSelecionado);

  document.getElementById('devolverBtn').disabled = true;
  try {
    const res = await fetch(`/api/producoes/${producaoAtual._id}/corrigir`, {
      method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: formData
    });
    const data = await res.json();
    if (res.ok) {
      mostrarCorrecaoMsg(data.msg, false);
      setTimeout(() => { mostrarView('fila'); carregarFila(); carregarStats(); }, 1200);
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
