const token = localStorage.getItem('token');
const API = '';

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

let temaAtual = null;
let producaoAtual = null;
let modoEnvio = 'arquivo';
let arquivoSelecionado = null;

function creditosDisponiveis() { return window.__creditosCorrecao || 0; }
function formatarDuracao(seg) {
  const m = Math.floor((seg || 0) / 60), s = (seg || 0) % 60;
  return s ? `${m}min ${s}s` : `${m} min`;
}

// ===================== NAVEGAÇÃO ENTRE VIEWS =====================
function mostrarView(nome) {
  ['Catalogo', 'Tema', 'Envio', 'Historico', 'Producao'].forEach(v => {
    document.getElementById('view' + v).style.display = (v.toLowerCase() === nome) ? 'block' : 'none';
  });
}

document.querySelectorAll('.top-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.top-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    mostrarView(tab.dataset.view);
    if (tab.dataset.view === 'historico') carregarHistorico();
  });
});

document.getElementById('voltarCatalogoBtn').addEventListener('click', () => {
  document.querySelectorAll('.top-tab').forEach(t => t.classList.remove('active'));
  document.querySelector('[data-view="catalogo"]').classList.add('active');
  mostrarView('catalogo');
});
document.getElementById('voltarTemaBtn').addEventListener('click', () => mostrarView('tema'));
document.getElementById('voltarHistoricoBtn').addEventListener('click', () => { mostrarView('historico'); carregarHistorico(); });

// ===================== CATÁLOGO =====================
async function carregarTemas() {
  const params = new URLSearchParams();
  const exame = document.getElementById('filtroExame').value;
  const nivel = document.getElementById('filtroNivel').value;
  const dificuldade = document.getElementById('filtroDificuldade').value;
  const modalidade = document.getElementById('filtroModalidade').value;
  const busca = document.getElementById('filtroBusca').value.trim();
  if (exame) params.set('exame', exame);
  if (nivel) params.set('nivel', nivel);
  if (dificuldade) params.set('dificuldade', dificuldade);
  if (modalidade) params.set('modalidade', modalidade);
  if (busca) params.set('busca', busca);

  const grid = document.getElementById('temasGrid');
  grid.innerHTML = '<p style="opacity:0.6;">Carregando temas...</p>';

  try {
    const res = await fetch(`${API}/api/temas?${params}`, { headers: { Authorization: 'Bearer ' + token } });
    const temas = await res.json();
    if (!Array.isArray(temas) || temas.length === 0) {
      grid.innerHTML = '<div class="vazio-box">Nenhum tema encontrado para esses filtros.</div>';
      return;
    }
    grid.innerHTML = temas.map(renderTemaCard).join('');
  } catch (err) {
    grid.innerHTML = '<div class="vazio-box">Erro ao carregar os temas. Tente novamente.</div>';
  }
}

function renderTemaCard(t) {
  const favoritado = (window.__favoritos || []).includes(t._id);
  const oral = t.modalidade === 'oral';
  return `<div class="tema-card" data-id="${t._id}">
    <button class="fav-btn ${favoritado ? 'ativo' : ''}" data-fav="${t._id}" title="Favoritar tema"><img src="img/icones/${favoritado ? 'star-filled' : 'star-empty'}.svg" alt="" style="width:1em; height:1em;"></button>
    <div class="tema-tags">
      <span class="tag exame">${t.exame}</span>
      <span class="tag nivel">${t.nivel}</span>
      <span class="tag dificuldade-${t.dificuldade}">${t.dificuldade}</span>
      <span class="tag">${oral ? '<img class="titulo-icone-inline pequeno" src="img/icones/mic.svg" alt="">Oral' : '<img class="titulo-icone-inline pequeno" src="img/icones/writing-hand.svg" alt="">Textual'}</span>
    </div>
    <h3>${t.titulo}</h3>
    <p class="desc">${t.descricao}</p>
    <div class="tema-meta">
      <span><img class="titulo-icone-inline pequeno" src="img/icones/tempo.svg" alt=""><strong>${t.tempoSugerido} min</strong></span>
      <span>${oral ? `<img class="titulo-icone-inline pequeno" src="img/icones/mic.svg" alt=""><strong>${Math.round(t.tempoMinimoSegundos / 60)}-${Math.round(t.tempoMaximoSegundos / 60)} min de fala</strong>` : `<img class="titulo-icone-inline pequeno" src="img/icones/edit-pencil.svg" alt=""><strong>${t.limitePalavrasMin}-${t.limitePalavrasMax} palavras</strong>`}</span>
      <span class="creditos-pill">${t.creditosNecessarios} crédito${t.creditosNecessarios > 1 ? 's' : ''}</span>
    </div>
  </div>`;
}

document.getElementById('temasGrid').addEventListener('click', e => {
  const favBtn = e.target.closest('[data-fav]');
  if (favBtn) { favoritarTema(favBtn.dataset.fav); return; }
  const card = e.target.closest('.tema-card');
  if (card) abrirTema(card.dataset.id);
});

async function favoritarTema(id) {
  try {
    const res = await fetch(`${API}/api/temas/${id}/favoritar`, { method: 'POST', headers: { Authorization: 'Bearer ' + token } });
    const data = await res.json();
    window.__favoritos = window.__favoritos || [];
    if (data.favoritado) window.__favoritos.push(id);
    else window.__favoritos = window.__favoritos.filter(f => f !== id);
    carregarTemas();
  } catch (err) { /* silencioso */ }
}

['filtroExame', 'filtroNivel', 'filtroDificuldade', 'filtroModalidade'].forEach(id => document.getElementById(id).addEventListener('change', carregarTemas));
let buscaTimeout;
document.getElementById('filtroBusca').addEventListener('input', () => { clearTimeout(buscaTimeout); buscaTimeout = setTimeout(carregarTemas, 350); });

// ===================== DETALHE DO TEMA =====================
async function abrirTema(id) {
  try {
    const res = await fetch(`${API}/api/temas/${id}`, { headers: { Authorization: 'Bearer ' + token } });
    if (!res.ok) return;
    temaAtual = await res.json();
    renderTemaDetalhe(temaAtual);
    mostrarView('tema');
    window.scrollTo(0, 0);
  } catch (err) { alert('Não foi possível carregar o tema.'); }
}

function renderTemaDetalhe(t) {
  const oral = t.modalidade === 'oral';
  document.getElementById('temaDetalheHead').innerHTML = `
    <div class="tema-tags" style="margin-bottom:12px;">
      <span class="tag exame">${t.exame}</span>
      <span class="tag nivel">Nível ${t.nivel}</span>
      <span class="tag dificuldade-${t.dificuldade}">${t.dificuldade}</span>
      <span class="tag" style="background:var(--cinza-100); color:var(--cinza-600);">${t.tipoProducao}</span>
      <span class="tag">${oral ? '<img class="titulo-icone-inline pequeno" src="img/icones/mic.svg" alt="">Produção oral' : '<img class="titulo-icone-inline pequeno" src="img/icones/writing-hand.svg" alt="">Produção textual'}</span>
    </div>
    <h1>${t.titulo}</h1>
    <p style="color:var(--cinza-600); margin-top:8px;">${t.descricao}</p>
    <div class="info-grid">
      <div class="info-item"><div class="rotulo">Tempo sugerido</div><div class="valor">${t.tempoSugerido} min</div></div>
      ${oral ? `
      <div class="info-item"><div class="rotulo">Duração mínima</div><div class="valor">${formatarDuracao(t.tempoMinimoSegundos)}</div></div>
      <div class="info-item"><div class="rotulo">Duração máxima</div><div class="valor">${formatarDuracao(t.tempoMaximoSegundos)}</div></div>
      ` : `
      <div class="info-item"><div class="rotulo">Mínimo de palavras</div><div class="valor">${t.limitePalavrasMin}</div></div>
      <div class="info-item"><div class="rotulo">Máximo de palavras</div><div class="valor">${t.limitePalavrasMax}</div></div>
      `}
      <div class="info-item"><div class="rotulo">Créditos</div><div class="valor">${t.creditosNecessarios}</div></div>
    </div>`;

  document.getElementById('temaObjetivosCard').innerHTML = `
    <h2>Objetivos da atividade</h2>
    <ul class="lista-objetivos">${(t.objetivos || []).map(o => `<li>${o}</li>`).join('')}</ul>
    <h2 style="margin-top:24px;">Instruções da produção</h2>
    <div class="instrucoes-box">${t.instrucoes}</div>
    <h2 style="margin-top:24px;">Critérios de avaliação</h2>
    <ul class="lista-objetivos">${(t.criteriosResumo || []).map(c => `<li>${c}</li>`).join('')}</ul>
    <h2 style="margin-top:24px;">Competências avaliadas</h2>
    <div class="competencias-chips">${(t.competenciasAvaliadas || []).map(c => `<span class="competencia-chip">${c}</span>`).join('')}</div>`;

  document.getElementById('temaColetaneaCard').innerHTML = `
    <h2>Coletânea de textos de apoio</h2>
    <div class="doc-lista">${(t.coletanea || []).map((d, i) => renderDocItem(d, i)).join('')}</div>`;
}

function renderDocItem(d, i) {
  let corpoExtra = '';
  if (d.dadosGrafico) corpoExtra = `<div class="doc-chart-wrap">${svgGraficoDoc(d.dadosGrafico)}</div>`;
  return `<div class="doc-item">
    <div class="doc-head" data-doc="${i}">
      <div class="doc-titulo-wrap">
        <span class="doc-tipo-tag">${NOMES_TIPO_DOC[d.tipo] || d.tipo}</span>
        <h4>${d.titulo}</h4>
        <span class="doc-meta">${d.fonte || ''}${d.autor ? ' · ' + d.autor : ''}${d.data ? ' · ' + d.data : ''}</span>
      </div>
      <span style="color:var(--azul); font-weight:700;">Ler ▾</span>
    </div>
    <div class="doc-corpo" id="docCorpo${i}">${d.conteudo}${corpoExtra}</div>
  </div>`;
}

document.getElementById('temaColetaneaCard').addEventListener('click', e => {
  const head = e.target.closest('[data-doc]');
  if (!head) return;
  document.getElementById('docCorpo' + head.dataset.doc).classList.toggle('show');
});

function svgGraficoDoc(g) {
  const labels = g.labels, valores = g.valores;
  const W = Math.max(360, labels.length * 90), H = 200;
  const padL = 44, padR = 16, padT = 20, padB = 44;
  const iw = W - padL - padR, ih = H - padT - padB;
  const maxV = Math.max(...valores) * 1.15;
  const bw = Math.min(46, iw / labels.length - 14);
  const barras = labels.map((lb, i) => {
    const cx = padL + (i + 0.5) / labels.length * iw;
    const h = (valores[i] / maxV) * ih;
    const yTopo = padT + ih - h;
    return `<rect x="${(cx - bw / 2).toFixed(1)}" y="${yTopo.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="5" fill="#2563eb"/>
      <text x="${cx}" y="${yTopo - 8}" text-anchor="middle" font-size="12" font-weight="700" fill="#1e293b">${valores[i]}</text>
      <text x="${cx}" y="${H - 14}" text-anchor="middle" font-size="11" fill="#475569">${lb}</text>`;
  }).join('');
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + ih}" stroke="#cbd5e1" stroke-width="1.5"/>
    <line x1="${padL}" y1="${padT + ih}" x2="${W - padR}" y2="${padT + ih}" stroke="#cbd5e1" stroke-width="1.5"/>
    ${barras}
    <text x="${padL}" y="14" font-size="10" fill="#475569" font-weight="700">${g.unidade || ''}</text>
  </svg>`;
}

// ===================== ENVIO =====================
document.getElementById('iniciarProducaoBtn').addEventListener('click', () => prepararEnvio(temaAtual));

function prepararEnvio(t, urlEnvio) {
  document.getElementById('envioTitulo').textContent = 'Enviar produção — ' + t.titulo;
  document.getElementById('envioResumo').innerHTML = `
    <div class="resumo-item"><div class="rotulo">Tema</div><div class="valor">${t.titulo}</div></div>
    <div class="resumo-item"><div class="rotulo">Exame</div><div class="valor">${t.exame} · ${t.nivel}</div></div>
    <div class="resumo-item"><div class="rotulo">Prazo estimado</div><div class="valor">5 dias úteis</div></div>
    <div class="resumo-item"><div class="rotulo">Créditos necessários</div><div class="valor">${t.creditosNecessarios}</div></div>`;

  const suficiente = creditosDisponiveis() >= t.creditosNecessarios;
  document.getElementById('avisoCreditos').innerHTML = suficiente
    ? `<img class="titulo-icone-inline pequeno" src="img/icones/warning.svg" alt="">Este envio consumirá <strong>${t.creditosNecessarios} crédito${t.creditosNecessarios > 1 ? 's' : ''}</strong> do seu saldo (você tem ${creditosDisponiveis()}).`
    : `<img class="titulo-icone-inline pequeno" src="img/icones/no-entry.svg" alt="">Você não tem créditos suficientes (precisa de ${t.creditosNecessarios}, tem ${creditosDisponiveis()}). Assine ou aguarde a renovação do seu plano para receber mais créditos.`;
  document.getElementById('enviarProducaoBtn').disabled = !suficiente;

  arquivoSelecionado = null;
  document.getElementById('arquivoSelecionado').style.display = 'none';
  document.getElementById('dropzone').style.display = 'block';
  document.getElementById('textoProducao').value = '';
  document.getElementById('obsInput').value = '';
  document.getElementById('envioMsg').style.display = 'none';
  atualizarContadorPalavras();

  const oral = t.modalidade === 'oral';
  document.getElementById('modoToggle').style.display = oral ? 'none' : 'flex';
  document.getElementById('modoArquivoWrap').style.display = oral ? 'none' : (modoEnvio === 'arquivo' ? 'block' : 'none');
  document.getElementById('modoTextoWrap').style.display = oral ? 'none' : (modoEnvio === 'texto' ? 'block' : 'none');
  document.getElementById('envioBtnWrap').style.display = oral ? 'none' : 'block';
  document.getElementById('modoOralWrap').style.display = oral ? 'block' : 'none';
  if (oral) iniciarGravadorEnvio(t, urlEnvio || urlEnvioPadrao);

  mostrarView('envio');
  window.scrollTo(0, 0);
}

// URL de envio padrão (nova produção). abrirReenvio() substitui por outra função pra reenviar.
function urlEnvioPadrao() { return '/api/producoes'; }

function iniciarGravadorEnvio(t, obterUrl) {
  const suficiente = creditosDisponiveis() >= t.creditosNecessarios;
  const container = document.getElementById('gravadorOralContainer');
  if (!suficiente) {
    container.innerHTML = '<p class="embed-aviso"><img class="titulo-icone-inline pequeno" src="img/icones/no-entry.svg" alt="">Você não tem créditos suficientes para enviar esta produção.</p>';
    return;
  }
  GravadorAudio.criarGravadorAudio(container, {
    jaEnviado: false,
    enviarArquivo: async (arquivo, duracaoSegundos) => {
      const formData = new FormData();
      formData.append('temaId', t._id);
      formData.append('observacoesAluno', document.getElementById('obsInput').value);
      formData.append('duracaoSegundos', duracaoSegundos || 0);
      const res = await fetch(obterUrl(), { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: formData });
      const data = await res.json();
      return { ok: res.ok, data };
    },
    onEnviado: data => {
      window.__creditosCorrecao = creditosDisponiveis() - t.creditosNecessarios;
      document.getElementById('creditosValor').textContent = creditosDisponiveis();
      setTimeout(() => {
        document.querySelectorAll('.top-tab').forEach(tb => tb.classList.remove('active'));
        document.querySelector('[data-view="historico"]').classList.add('active');
        mostrarView('historico');
        carregarHistorico();
      }, 1200);
    }
  });
}

document.querySelectorAll('.modo-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.modo-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    modoEnvio = btn.dataset.modo;
    document.getElementById('modoArquivoWrap').style.display = modoEnvio === 'arquivo' ? 'block' : 'none';
    document.getElementById('modoTextoWrap').style.display = modoEnvio === 'texto' ? 'block' : 'none';
  });
});

const dropzone = document.getElementById('dropzone');
const arquivoInput = document.getElementById('arquivoInput');
dropzone.addEventListener('click', () => arquivoInput.click());
dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('dragover'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
dropzone.addEventListener('drop', e => {
  e.preventDefault();
  dropzone.classList.remove('dragover');
  if (e.dataTransfer.files[0]) selecionarArquivo(e.dataTransfer.files[0]);
});
arquivoInput.addEventListener('change', () => { if (arquivoInput.files[0]) selecionarArquivo(arquivoInput.files[0]); });

const EXTENSOES_ACEITAS = ['.pdf', '.docx', '.odt'];
function selecionarArquivo(file) {
  const ext = '.' + file.name.split('.').pop().toLowerCase();
  if (!EXTENSOES_ACEITAS.includes(ext)) { alert('Formato não aceito. Envie um arquivo PDF, DOCX ou ODT.'); return; }
  if (file.size > 10 * 1024 * 1024) { alert('O arquivo excede o limite de 10 MB.'); return; }
  arquivoSelecionado = file;
  document.getElementById('arquivoNome').textContent = file.name;
  document.getElementById('arquivoTamanho').textContent = (file.size / 1024 / 1024).toFixed(2) + ' MB';
  document.getElementById('arquivoSelecionado').style.display = 'flex';
  document.getElementById('dropzone').style.display = 'none';
}
document.getElementById('removerArquivoBtn').addEventListener('click', () => {
  arquivoSelecionado = null;
  arquivoInput.value = '';
  document.getElementById('arquivoSelecionado').style.display = 'none';
  document.getElementById('dropzone').style.display = 'block';
});

function contarPalavras(texto) { return texto.trim().split(/\s+/).filter(Boolean).length; }
document.getElementById('textoProducao').addEventListener('input', atualizarContadorPalavras);
function atualizarContadorPalavras() {
  const n = contarPalavras(document.getElementById('textoProducao').value);
  const el = document.getElementById('contadorPalavras');
  el.textContent = `${n} palavras`;
  if (!temaAtual) return;
  if (n === 0) { el.className = 'contador-palavras'; return; }
  const dentro = n >= temaAtual.limitePalavrasMin && n <= temaAtual.limitePalavrasMax;
  el.className = 'contador-palavras ' + (dentro ? 'ok' : 'erro');
  el.textContent = `${n} palavras (limite: ${temaAtual.limitePalavrasMin}–${temaAtual.limitePalavrasMax})`;
}

document.getElementById('enviarProducaoBtn').addEventListener('click', async () => {
  if (modoEnvio === 'arquivo' && !arquivoSelecionado) { mostrarEnvioMsg('Selecione um arquivo antes de enviar.', true); return; }
  if (modoEnvio === 'texto' && !document.getElementById('textoProducao').value.trim()) { mostrarEnvioMsg('Escreva seu texto antes de enviar.', true); return; }

  if (!confirm(`Confirmar envio? Isso consumirá ${temaAtual.creditosNecessarios} crédito(s) do seu saldo.`)) return;

  const formData = new FormData();
  formData.append('temaId', temaAtual._id);
  formData.append('observacoesAluno', document.getElementById('obsInput').value);
  if (modoEnvio === 'arquivo') formData.append('arquivo', arquivoSelecionado);
  else formData.append('textoDigitado', document.getElementById('textoProducao').value);

  document.getElementById('enviarProducaoBtn').disabled = true;
  document.getElementById('progressWrap').style.display = 'block';

  try {
    const resultado = await enviarComProgresso('/api/producoes', formData);
    if (resultado.ok) {
      mostrarEnvioMsg(resultado.data.msg, false);
      window.__creditosCorrecao = creditosDisponiveis() - temaAtual.creditosNecessarios;
      document.getElementById('creditosValor').textContent = creditosDisponiveis();
      setTimeout(() => {
        document.querySelectorAll('.top-tab').forEach(t => t.classList.remove('active'));
        document.querySelector('[data-view="historico"]').classList.add('active');
        mostrarView('historico');
        carregarHistorico();
      }, 1400);
    } else {
      mostrarEnvioMsg(resultado.data.msg || 'Erro ao enviar.', true);
      document.getElementById('enviarProducaoBtn').disabled = false;
    }
  } catch (err) {
    mostrarEnvioMsg('Erro ao conectar ao servidor.', true);
    document.getElementById('enviarProducaoBtn').disabled = false;
  } finally {
    document.getElementById('progressWrap').style.display = 'none';
    document.getElementById('progressFill').style.width = '0%';
  }
});

function mostrarEnvioMsg(texto, erro) {
  const el = document.getElementById('envioMsg');
  el.style.display = 'block';
  el.className = 'msg-inline ' + (erro ? 'erro' : 'sucesso');
  el.textContent = texto;
}

function enviarComProgresso(url, formData) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.setRequestHeader('Authorization', 'Bearer ' + token);
    xhr.upload.addEventListener('progress', e => {
      if (e.lengthComputable) document.getElementById('progressFill').style.width = Math.round((e.loaded / e.total) * 100) + '%';
    });
    xhr.onload = () => {
      let data = {};
      try { data = JSON.parse(xhr.responseText); } catch (err) {}
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, data });
    };
    xhr.onerror = reject;
    xhr.send(formData);
  });
}

// ===================== HISTÓRICO =====================
async function carregarHistorico() {
  const params = new URLSearchParams();
  const status = document.getElementById('histStatus').value;
  const busca = document.getElementById('histBusca').value.trim();
  if (status) params.set('status', status);
  if (busca) params.set('busca', busca);

  const lista = document.getElementById('historicoLista');
  lista.innerHTML = '<p style="opacity:0.6;">Carregando...</p>';

  try {
    const res = await fetch(`${API}/api/producoes/minhas?${params}`, { headers: { Authorization: 'Bearer ' + token } });
    const producoes = await res.json();
    if (!Array.isArray(producoes) || producoes.length === 0) {
      lista.innerHTML = '<div class="vazio-box">Nenhuma produção encontrada. Escolha um tema para começar!</div>';
      return;
    }
    lista.innerHTML = producoes.map(renderProducaoItem).join('');
  } catch (err) {
    lista.innerHTML = '<div class="vazio-box">Erro ao carregar seu histórico.</div>';
  }
}
document.getElementById('histStatus').addEventListener('change', carregarHistorico);
let histBuscaTimeout;
document.getElementById('histBusca').addEventListener('input', () => { clearTimeout(histBuscaTimeout); histBuscaTimeout = setTimeout(carregarHistorico, 350); });

function renderProducaoItem(p) {
  return `<div class="producao-item" data-id="${p._id}">
    <div class="producao-info">
      <h4>${p.temaId?.titulo || 'Tema removido'}</h4>
      <div class="meta">${p.temaId?.exame || ''} · Protocolo ${p.protocolo} · Enviado em ${new Date(p.dataEnvio).toLocaleDateString('pt-BR')}${p.professorId ? ' · Prof. ' + p.professorId.nome : ''}</div>
    </div>
    <div style="display:flex; align-items:center; gap:14px;">
      ${p.avaliacao?.notaTotal !== undefined ? `<span class="nota-pill">${p.avaliacao.notaTotal}/20</span>` : ''}
      <span class="status-badge ${p.status}">${NOMES_STATUS[p.status] || p.status}</span>
    </div>
  </div>`;
}
document.getElementById('historicoLista').addEventListener('click', e => {
  const item = e.target.closest('.producao-item');
  if (item) abrirProducao(item.dataset.id);
});

// ===================== DETALHE DA PRODUÇÃO / FEEDBACK =====================
async function abrirProducao(id) {
  try {
    const res = await fetch(`${API}/api/producoes/${id}`, { headers: { Authorization: 'Bearer ' + token } });
    if (!res.ok) return;
    producaoAtual = await res.json();
    renderProducaoDetalhe(producaoAtual);
    mostrarView('producao');
    window.scrollTo(0, 0);
  } catch (err) { alert('Não foi possível carregar esta produção.'); }
}

function estrelas(nota) {
  let html = '<span class="estrelas">';
  for (let i = 1; i <= 5; i++) html += `<span class="${i <= nota ? 'cheia' : ''}"><img src="img/icones/${i <= nota ? 'star-filled' : 'star-empty'}.svg" alt="" style="width:1em; height:1em;"></span>`;
  return html + '</span>';
}

function renderProducaoDetalhe(p) {
  const tema = p.temaId || {};
  const concluida = p.status === 'corrigido' || p.status === 'devolvido';

  let html = `
    <div class="feedback-header">
      <div>
        <h1 style="font-family:'Playfair Display',serif; font-size:1.7rem; color:var(--cinza-800);">${tema.titulo || 'Tema'}</h1>
        <p style="color:var(--cinza-400); font-size:0.9rem; margin-top:4px;">Protocolo ${p.protocolo} · ${tema.exame} ${tema.nivel} · Enviado em ${new Date(p.dataEnvio).toLocaleDateString('pt-BR')}</p>
        <span class="status-badge ${p.status}" style="margin-top:10px; display:inline-block;">${NOMES_STATUS[p.status] || p.status}</span>
      </div>
      ${concluida && p.avaliacao?.notaTotal !== undefined ? `<div class="nota-grande"><div class="num">${p.avaliacao.notaTotal}/20</div><div class="nivel">Nível estimado: ${p.avaliacao.nivelEstimado || '—'}</div></div>` : ''}
    </div>

    <div class="arquivos-row">
      ${p.modalidade !== 'oral' && p.arquivoOriginal?.nome ? `<div class="arquivo-download-card"><img class="icone" src="img/icones/document.svg" alt=""><div class="info"><div class="nome">${p.arquivoOriginal.nome}</div><div class="tipo">Seu arquivo original</div></div><button class="btn secundario pequeno" data-baixar="original">Baixar</button></div>` : ''}
      ${p.textoDigitado ? `<div class="arquivo-download-card" style="flex:2;"><img class="icone" src="img/icones/keyboard.svg" alt=""><div class="info"><div class="nome">Texto digitado (${p.contagemPalavras} palavras)</div><div class="tipo">Sua produção original</div></div></div>` : ''}
      ${p.arquivoCorrigido?.nome ? `<div class="arquivo-download-card"><img class="icone" src="img/icones/check.svg" alt=""><div class="info"><div class="nome">${p.arquivoCorrigido.nome}</div><div class="tipo">Arquivo corrigido</div></div><button class="btn pequeno" data-baixar="corrigido">Baixar</button></div>` : ''}
    </div>

    ${p.modalidade === 'oral' && p.arquivoOriginal?.nome ? `<div class="card"><h2>Sua gravação${p.duracaoSegundos ? ' — ' + formatarDuracao(p.duracaoSegundos) : ''}</h2><audio controls id="audioOriginalPlayer" style="width:100%;"></audio></div>` : ''}
    ${p.textoDigitado ? `<div class="card"><h2>Seu texto enviado</h2><div class="comentario-geral-box" style="white-space:pre-wrap;">${p.textoDigitado}</div></div>` : ''}
  `;

  if (concluida && p.avaliacao) {
    html += `<div class="card">
      <h2>Avaliação detalhada</h2>
      ${(p.avaliacao.criterios || []).map(c => `
        <div class="criterio-row">
          <div class="criterio-head"><span class="criterio-nome">${c.nome}</span>${estrelas(c.nota)}</div>
          ${c.comentario ? `<div class="comentario">${c.comentario}</div>` : ''}
        </div>`).join('')}
      <h2 style="margin-top:24px;">Comentário geral</h2>
      <div class="comentario-geral-box">${p.avaliacao.comentarioGeral || 'Sem comentário adicional.'}</div>
    </div>
    <div style="text-align:center; margin-bottom:22px;">
      <button class="btn secundario" id="reenviarBtn"><img class="titulo-icone-inline pequeno" src="img/icones/repeat.svg" alt="">Reenviar novo texto para este tema (consome novo crédito)</button>
    </div>`;
  } else {
    html += `<div class="card"><p style="color:var(--cinza-600);">Sua produção está com o status <strong>${NOMES_STATUS[p.status]}</strong>. Assim que o professor concluir a correção, o resultado aparecerá aqui.</p>
      ${p.prazoEstimado ? `<p style="margin-top:8px; color:var(--cinza-400); font-size:0.9rem;">Prazo estimado de devolução: ${new Date(p.prazoEstimado).toLocaleDateString('pt-BR')}</p>` : ''}
    </div>`;
  }

  html += `<div class="card">
    <h2>Mensagens com o professor</h2>
    <div class="mensagens-lista" id="mensagensLista" style="flex-direction:column; display:flex;">
      ${(p.mensagens || []).map(m => `<div class="mensagem-bubble ${m.autor}">${m.texto}<div class="data">${new Date(m.data).toLocaleString('pt-BR')}</div></div>`).join('') || '<p style="color:var(--cinza-400); font-size:0.9rem;">Nenhuma mensagem ainda.</p>'}
    </div>
    <form class="mensagens-form" id="mensagemForm">
      <input type="text" id="mensagemInput" placeholder="Escreva uma mensagem para o professor...">
      <button type="submit" class="btn pequeno">Enviar</button>
    </form>
  </div>`;

  document.getElementById('producaoConteudo').innerHTML = html;

  document.querySelectorAll('[data-baixar]').forEach(btn => {
    btn.addEventListener('click', () => baixarArquivo(p._id, btn.dataset.baixar, btn.dataset.baixar === 'corrigido' ? p.arquivoCorrigido.nome : p.arquivoOriginal.nome));
  });

  const audioPlayer = document.getElementById('audioOriginalPlayer');
  if (audioPlayer) carregarAudioPlayer(audioPlayer, p._id, 'original');

  const reenviarBtn = document.getElementById('reenviarBtn');
  if (reenviarBtn) reenviarBtn.addEventListener('click', () => abrirReenvio(p));

  document.getElementById('mensagemForm').addEventListener('submit', async e => {
    e.preventDefault();
    const input = document.getElementById('mensagemInput');
    if (!input.value.trim()) return;
    try {
      const res = await fetch(`${API}/api/producoes/${p._id}/mensagens`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ texto: input.value.trim() })
      });
      if (res.ok) { input.value = ''; abrirProducao(p._id); }
    } catch (err) {}
  });
}

// Mesmo padrão de fetch+blob de baixarArquivo, só que aponta pro <audio> em
// vez de disparar um download — a rota exige Authorization, então não dá pra
// simplesmente apontar o `src` pra URL.
async function carregarAudioPlayer(audioEl, producaoId, tipo) {
  try {
    const res = await fetch(`${API}/api/producoes/${producaoId}/arquivo/${tipo}`, { headers: { Authorization: 'Bearer ' + token } });
    if (!res.ok) return;
    const blob = await res.blob();
    audioEl.src = URL.createObjectURL(blob);
  } catch (err) { /* player fica sem áudio se falhar */ }
}

async function baixarArquivo(producaoId, tipo, nomeArquivo) {
  try {
    const res = await fetch(`${API}/api/producoes/${producaoId}/arquivo/${tipo}`, { headers: { Authorization: 'Bearer ' + token } });
    if (!res.ok) { alert('Não foi possível baixar o arquivo.'); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nomeArquivo || 'arquivo';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  } catch (err) { alert('Erro ao baixar o arquivo.'); }
}

function abrirReenvio(p) {
  if (creditosDisponiveis() < (p.temaId?.creditosNecessarios || 1)) {
    alert('Você não tem créditos suficientes para reenviar.');
    return;
  }
  temaAtual = p.temaId;
  const urlReenvio = () => `/api/producoes/${p._id}/reenviar`;
  prepararEnvio(temaAtual, urlReenvio);
  if (temaAtual.modalidade === 'oral') return; // gravador já foi conectado à rota de reenvio dentro de prepararEnvio

  // Sobrescreve o botão de envio para usar a rota de reenvio nesta sessão
  const btn = document.getElementById('enviarProducaoBtn');
  const novoBtn = btn.cloneNode(true);
  btn.parentNode.replaceChild(novoBtn, btn);
  novoBtn.addEventListener('click', async () => {
    if (modoEnvio === 'arquivo' && !arquivoSelecionado) { mostrarEnvioMsg('Selecione um arquivo antes de enviar.', true); return; }
    if (modoEnvio === 'texto' && !document.getElementById('textoProducao').value.trim()) { mostrarEnvioMsg('Escreva seu texto antes de enviar.', true); return; }
    if (!confirm(`Confirmar reenvio? Isso consumirá ${temaAtual.creditosNecessarios} crédito(s) do seu saldo.`)) return;

    const formData = new FormData();
    formData.append('observacoesAluno', document.getElementById('obsInput').value);
    if (modoEnvio === 'arquivo') formData.append('arquivo', arquivoSelecionado);
    else formData.append('textoDigitado', document.getElementById('textoProducao').value);

    novoBtn.disabled = true;
    try {
      const resultado = await enviarComProgresso(`/api/producoes/${p._id}/reenviar`, formData);
      if (resultado.ok) {
        mostrarEnvioMsg(resultado.data.msg, false);
        window.__creditosCorrecao = creditosDisponiveis() - temaAtual.creditosNecessarios;
        document.getElementById('creditosValor').textContent = creditosDisponiveis();
        setTimeout(() => {
          document.querySelectorAll('.top-tab').forEach(t => t.classList.remove('active'));
          document.querySelector('[data-view="historico"]').classList.add('active');
          mostrarView('historico'); carregarHistorico();
        }, 1400);
      } else {
        mostrarEnvioMsg(resultado.data.msg || 'Erro ao reenviar.', true);
        novoBtn.disabled = false;
      }
    } catch (err) {
      mostrarEnvioMsg('Erro ao conectar ao servidor.', true);
      novoBtn.disabled = false;
    }
  });
}

// ===================== INIT =====================
window.__favoritos = [];
(async function initUsuario() {
  try {
    const res = await fetch(`${API}/api/auth/me`, { headers: { Authorization: 'Bearer ' + token } });
    const data = await res.json();
    window.__favoritos = (data.temasFavoritos || []).map(String);
    window.__creditosCorrecao = data.creditosCorrecao || 0;
  } catch (err) {}
  document.getElementById('creditosValor').textContent = creditosDisponiveis();
  carregarTemas();
})();

document.querySelectorAll('.nav-item').forEach(item => {
  const dropdown = item.querySelector('.dropdown');
  if (!dropdown) return;
  let timeout;
  item.addEventListener('mouseenter', () => { clearTimeout(timeout); dropdown.classList.add('show'); });
  item.addEventListener('mouseleave', () => { timeout = setTimeout(() => { dropdown.classList.remove('show'); }, 150); });
});
