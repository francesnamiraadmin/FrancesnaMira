const token = localStorage.getItem('token');
function authHeaders(json) {
  return { Authorization: 'Bearer ' + token, ...(json ? { 'Content-Type': 'application/json' } : {}) };
}
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

const NOMES_TIPO_MATERIAL = { pdf: 'PDF', imagem: 'Imagem', audio: 'Áudio', exercicio: 'Exercício', arquivo: 'Arquivo', link: 'Link' };
const ICONES_TIPO_MATERIAL = { pdf: '📄', imagem: '🖼️', audio: '🎵', exercicio: '📝', arquivo: '📎', link: '🔗' };

let modulos = [];
let aulasCache = {}; // moduloId -> [aulas resumidas]
let moduloExpandidoId = null;
let aulaAtual = null; // detalhe completo da aula aberta
let aulaAtualModuloId = null;
let favoritosIds = new Set();

// ===================== VIEWS =====================
function mostrarView(nome) {
  document.getElementById('viewAula').style.display = nome === 'aula' ? 'block' : 'none';
  document.getElementById('viewFavoritos').style.display = nome === 'favoritos' ? 'block' : 'none';
  document.getElementById('viewHistorico').style.display = nome === 'historico' ? 'block' : 'none';
  document.getElementById('viewCertificado').style.display = nome === 'certificado' ? 'block' : 'none';
  renderTopoProgresso();
}

// O anel de progresso passa a refletir o módulo selecionado (não o curso inteiro);
// o link "continuar de onde parei" continua sendo global, então os dois controlam
// a visibilidade do container em conjunto — ele aparece se qualquer um tiver conteúdo.
function renderTopoProgresso() {
  const anel = document.getElementById('anelProgresso');
  const modulo = modulos.find(m => m._id === moduloExpandidoId);
  if (modulo) {
    document.getElementById('progressoResumoTexto').textContent = `Progresso do módulo: ${modulo.aulasConcluidas} de ${modulo.totalAulas} aulas`;
    document.getElementById('progressoResumoPct').textContent = modulo.percentual + '%';
    document.getElementById('progressoResumoBarra').style.width = modulo.percentual + '%';
    anel.style.display = 'block';
  } else {
    anel.style.display = 'none';
  }

  const topo = document.getElementById('topoProgresso');
  const emCertificado = document.getElementById('viewCertificado').style.display === 'block';
  const continuarVisivel = document.getElementById('continuarWrap').style.display !== 'none';
  topo.style.display = (!emCertificado && (modulo || continuarVisivel)) ? 'flex' : 'none';
}

// ===================== MÓDULOS (sidebar) =====================
async function carregarModulos() {
  const res = await fetch('/api/aulas/modulos', { headers: authHeaders() });
  if (!res.ok) return;
  modulos = await res.json();
  renderModulosSidebar();
  checarNotificacoes();
}

function renderModulosSidebar() {
  const wrap = document.getElementById('modulosLista');
  if (!modulos.length) { wrap.innerHTML = '<p style="opacity:0.7; font-size:0.85rem;">Nenhum módulo publicado ainda.</p>'; return; }
  wrap.innerHTML = modulos.map(m => `
    <div class="modulo-item${m._id === moduloExpandidoId ? ' expandido' : ''}${m.bloqueado ? ' bloqueado' : ''}" data-modulo-id="${m._id}">
      <div class="modulo-cabecalho" data-toggle-modulo="${m._id}">
        <div class="modulo-icone" style="background:${m.cor}22; color:${m.cor};">${m.bloqueado ? '🔒' : (m.icone || '📘')}</div>
        <div class="modulo-info">
          <div class="titulo">${escapeHtml(m.titulo)}</div>
          <div class="meta">${m.bloqueado ? 'Conclua o módulo anterior para desbloquear' : `${m.aulasConcluidas} de ${m.totalAulas} aulas · ${m.percentual}%`}</div>
          ${!m.bloqueado ? `<div class="barra-progresso"><div class="preenchimento" style="width:${m.percentual}%"></div></div>` : ''}
        </div>
      </div>
    </div>`).join('');
}

document.getElementById('modulosLista').addEventListener('click', e => {
  const toggle = e.target.closest('[data-toggle-modulo]');
  if (!toggle) return;
  const moduloId = toggle.dataset.toggleModulo;
  const modulo = modulos.find(m => m._id === moduloId);
  if (modulo && modulo.bloqueado) return;
  selecionarModulo(moduloId);
});

document.getElementById('gradeAulas').addEventListener('click', e => {
  const item = e.target.closest('[data-abrir-aula]');
  if (item) abrirAula(item.dataset.abrirAula, item.dataset.moduloId);
});

async function selecionarModulo(moduloId) {
  moduloExpandidoId = moduloId;
  await carregarAulasSidebar(moduloId);
  renderModulosSidebar();

  // Se a aula aberta no momento não é deste módulo, mostra a aula em andamento
  // deste módulo (se houver) — senão fica só a grade, sem player de outro módulo.
  if (!(aulaAtual && aulaAtualModuloId === moduloId)) {
    const emAndamento = (aulasCache[moduloId] || []).find(a => a.emAndamento);
    if (emAndamento) {
      await abrirAula(emAndamento._id, moduloId);
      return;
    }
    aulaAtual = null;
    aulaAtualModuloId = null;
  }

  mostrarView('aula');
  renderConteudoPrincipal();
}

async function carregarAulasSidebar(moduloId) {
  if (!aulasCache[moduloId]) {
    const res = await fetch('/api/aulas/modulos/' + moduloId + '/aulas', { headers: authHeaders() });
    aulasCache[moduloId] = res.ok ? await res.json() : [];
  }
}

// ===================== GRADE DE AULAS (cards com thumbnail) =====================
function formatarDuracaoCurta(segundos) {
  if (!segundos) return null;
  const m = Math.floor(segundos / 60);
  const s = Math.floor(segundos % 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}:${String(m % 60).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function renderAulasGrade(moduloId) {
  const wrap = document.getElementById('gradeAulas');
  const tituloEl = document.getElementById('gradeAulasTitulo');
  const modulo = modulos.find(m => m._id === moduloId);
  tituloEl.textContent = modulo ? `Aulas — ${modulo.titulo}` : 'Aulas';

  const aulas = aulasCache[moduloId] || [];
  if (!aulas.length) {
    wrap.innerHTML = '<p style="opacity:0.7; font-size:0.85rem;">Nenhuma aula neste módulo ainda.</p>';
    return;
  }

  const agora = Date.now();
  wrap.innerHTML = aulas.map((a, i) => {
    const ativa = aulaAtual && aulaAtual._id === a._id;
    const statusIcone = a.concluida ? '✓' : (a.emAndamento ? '⏳' : '▶');
    const statusClasse = a.concluida ? 'assistida' : (a.emAndamento ? 'andamento' : '');
    const nova = a.criadoEm && (agora - new Date(a.criadoEm).getTime()) < 14 * 24 * 60 * 60 * 1000;
    const duracao = formatarDuracaoCurta(a.duracaoSegundos);
    const progressoPct = (a.emAndamento && a.duracaoSegundos) ? Math.min(100, Math.round((a.ultimaPosicaoSegundos / a.duracaoSegundos) * 100)) : 0;

    return `
    <div class="aula-card${ativa ? ' ativa' : ''}" data-abrir-aula="${a._id}" data-modulo-id="${moduloId}">
      <div class="aula-card-thumb" data-thumb-tipo="${a.thumbnailTipo}" data-thumb-valor="${escapeHtml(a.thumbnailValor || '')}" data-aula-id="${a._id}">
        <div class="aula-card-thumb-placeholder" style="background:linear-gradient(160deg, ${modulo ? modulo.cor : '#2563eb'}33, ${modulo ? modulo.cor : '#2563eb'}11);">${modulo ? (modulo.icone || '📘') : '📘'}</div>
        <div class="aula-card-overlay-play">▶</div>
        <span class="aula-card-badge-status ${statusClasse}">${statusIcone}</span>
        ${nova ? '<span class="aula-card-badge-novo">Novo</span>' : ''}
        ${duracao ? `<span class="aula-card-badge-duracao">${duracao}</span>` : ''}
        ${progressoPct > 0 ? `<div class="aula-card-mini-progresso"><div style="width:${progressoPct}%"></div></div>` : ''}
      </div>
      <div class="aula-card-info">
        <div class="aula-card-meta">Aula ${a.ordem + 1}${modulo ? ' · ' + escapeHtml(modulo.titulo) : ''}</div>
        <div class="aula-card-titulo">${escapeHtml(a.titulo)}</div>
        ${a.descricao ? `<div class="aula-card-desc">${escapeHtml(a.descricao)}</div>` : ''}
      </div>
    </div>`;
  }).join('');

  carregarThumbnailsGrade(aulas);
}

// Thumbnails "internas" (upload/gerado) exigem Authorization, então são buscadas via
// fetch()+blob() e viram object URL; thumbnails do YouTube já são uma URL pública direta.
function carregarThumbnailsGrade(aulas) {
  aulas.forEach(a => {
    const thumbEl = document.querySelector(`.aula-card-thumb[data-aula-id="${a._id}"]`);
    if (!thumbEl) return;
    if (a.thumbnailTipo === 'youtube' && a.thumbnailValor) {
      inserirImagemThumb(thumbEl, a.thumbnailValor);
    } else if (a.thumbnailTipo === 'interno') {
      fetch(`/api/aulas/aulas/${a._id}/thumbnail`, { headers: authHeaders() })
        .then(res => res.ok ? res.blob() : null)
        .then(blob => { if (blob) inserirImagemThumb(thumbEl, URL.createObjectURL(blob)); })
        .catch(() => {});
    }
  });
}

function inserirImagemThumb(thumbEl, src) {
  if (thumbEl.querySelector('img')) return;
  const img = document.createElement('img');
  img.loading = 'lazy';
  img.alt = '';
  img.src = src;
  thumbEl.querySelector('.aula-card-thumb-placeholder').replaceWith(img);
}

// ===================== ESTADO DA ÁREA PRINCIPAL (vazio / grade / player) =====================
function renderConteudoPrincipal() {
  const temModulo = !!moduloExpandidoId;
  const temAula = !!aulaAtual;

  document.getElementById('vazioInicial').style.display = temModulo ? 'none' : 'block';
  document.getElementById('aulaCard').style.display = temAula ? 'block' : 'none';
  document.getElementById('gradeAulasWrap').style.display = temModulo ? 'block' : 'none';

  if (temModulo) renderAulasGrade(moduloExpandidoId);
}

// ===================== AULA (conteúdo principal) =====================
async function abrirAula(aulaId, moduloId) {
  const res = await fetch('/api/aulas/aulas/' + aulaId, { headers: authHeaders() });
  if (!res.ok) return;
  aulaAtual = await res.json();
  aulaAtualModuloId = moduloId || aulaAtual.moduloId;
  moduloExpandidoId = aulaAtualModuloId;

  await carregarAulasSidebar(aulaAtualModuloId);
  renderModulosSidebar();

  mostrarView('aula');
  renderConteudoPrincipal();
  renderAulaPrincipal();
  document.getElementById('aulaCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderAulaPrincipal() {
  document.getElementById('aulaTitulo').textContent = aulaAtual.titulo;
  document.getElementById('aulaDescricao').textContent = aulaAtual.descricao || '';

  const btnConcluir = document.getElementById('btnConcluir');
  btnConcluir.textContent = aulaAtual.concluida ? '✓ Assistida' : '✓ Marcar como assistida';
  btnConcluir.classList.toggle('concluida', aulaAtual.concluida);

  atualizarBotaoFavorito();

  const obsWrap = document.getElementById('observacoesWrap');
  if (aulaAtual.observacoesProfessor) {
    obsWrap.style.display = 'block';
    document.getElementById('observacoesTexto').textContent = aulaAtual.observacoesProfessor;
  } else {
    obsWrap.style.display = 'none';
  }

  renderMateriais();
  renderPlayer();
  atualizarBotoesNavegacao();
}

function atualizarBotaoFavorito() {
  const btn = document.getElementById('btnFavoritar');
  const fav = favoritosIds.has(aulaAtual._id);
  btn.textContent = fav ? '⭐ Favoritada' : '☆ Favoritar';
  btn.classList.toggle('favoritada', fav);
}

document.getElementById('btnFavoritar').addEventListener('click', async () => {
  if (!aulaAtual) return;
  const res = await fetch(`/api/aulas/aulas/${aulaAtual._id}/favoritar`, { method: 'POST', headers: authHeaders() });
  if (!res.ok) return;
  const data = await res.json();
  if (data.favoritado) favoritosIds.add(aulaAtual._id); else favoritosIds.delete(aulaAtual._id);
  atualizarBotaoFavorito();
});

document.getElementById('btnConcluir').addEventListener('click', () => {
  if (!aulaAtual) return;
  marcarConcluida(!aulaAtual.concluida);
});

async function marcarConcluida(valor) {
  if (!aulaAtual) return;
  const res = await fetch(`/api/aulas/aulas/${aulaAtual._id}/progresso`, {
    method: 'POST', headers: authHeaders(true), body: JSON.stringify({ concluida: valor })
  });
  if (!res.ok) return;
  const data = await res.json();
  aulaAtual.concluida = data.concluida;
  const item = (aulasCache[aulaAtualModuloId] || []).find(a => a._id === aulaAtual._id);
  if (item) { item.concluida = data.concluida; if (data.concluida) item.emAndamento = false; }

  renderAulaPrincipal();
  if (moduloExpandidoId === aulaAtualModuloId) renderAulasGrade(aulaAtualModuloId);
  await carregarModulos();
  await carregarResumoProgresso();
}

// ---------- materiais ----------
function renderMateriais() {
  const secao = document.getElementById('materiaisSecao');
  const lista = document.getElementById('materiaisLista');
  const materiais = aulaAtual.materiais || [];
  if (!materiais.length) { secao.style.display = 'none'; return; }
  secao.style.display = 'block';
  lista.innerHTML = materiais.map(m => {
    if (m.tipo === 'link') {
      return `<a class="material-item-aluno" href="${escapeHtml(m.url)}" target="_blank" rel="noopener">
        <span class="icone">${ICONES_TIPO_MATERIAL[m.tipo] || '📎'}</span>
        <span><span class="nome">${escapeHtml(m.nome)}</span><br><span class="tipo">${NOMES_TIPO_MATERIAL[m.tipo]}</span></span>
      </a>`;
    }
    const tamanho = m.tamanho ? ' · ' + (m.tamanho / 1024 / 1024).toFixed(1) + ' MB' : '';
    return `<div class="material-item-aluno" data-baixar-material="${m._id}">
      <span class="icone">${ICONES_TIPO_MATERIAL[m.tipo] || '📎'}</span>
      <span><span class="nome">${escapeHtml(m.nome)}</span><br><span class="tipo">${NOMES_TIPO_MATERIAL[m.tipo]}${tamanho}</span></span>
    </div>`;
  }).join('');
}

document.getElementById('materiaisLista').addEventListener('click', async e => {
  const item = e.target.closest('[data-baixar-material]');
  if (!item || !aulaAtual) return;
  const materialId = item.dataset.baixarMaterial;
  const res = await fetch(`/api/aulas/aulas/${aulaAtual._id}/materiais/${materialId}`, { headers: authHeaders() });
  if (!res.ok) return;
  const blob = await res.blob();
  const nomeArquivo = (aulaAtual.materiais.find(m => m._id === materialId) || {}).nome || 'material';
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

// ---------- player ----------
function detectarTipoEmbed(url) {
  if (/youtube\.com|youtu\.be|player\.vimeo\.com|iframe\.mediadelivery\.net|cloudflarestream\.com\/.+\/iframe/i.test(url || '')) return 'iframe';
  return 'video';
}

// Aceita qualquer link de YouTube colado pelo professor (watch?v=, youtu.be/, shorts/, embed/)
// e converte para o formato /embed/ID, que é o único que o YouTube permite carregar em iframe.
function normalizarUrlYoutube(url) {
  const padroes = [
    /youtube\.com\/watch\?(?:.*&)?v=([\w-]{6,})/i,
    /youtube\.com\/shorts\/([\w-]{6,})/i,
    /youtube\.com\/embed\/([\w-]{6,})/i,
    /youtu\.be\/([\w-]{6,})/i
  ];
  for (const re of padroes) {
    const match = (url || '').match(re);
    if (match) return `https://www.youtube.com/embed/${match[1]}`;
  }
  return url;
}

async function renderPlayer() {
  const wrap = document.getElementById('playerWrap');
  wrap.innerHTML = '';
  const video = aulaAtual.video;

  if (!video || (!video.url && !video.temArquivo)) {
    wrap.innerHTML = '<div class="player-vazio">Esta aula ainda não tem vídeo.</div>';
    return;
  }

  if (video.tipo === 'url') {
    if (detectarTipoEmbed(video.url) === 'iframe') {
      const urlEmbed = /youtube\.com|youtu\.be/i.test(video.url) ? normalizarUrlYoutube(video.url) : video.url;
      wrap.innerHTML = `<iframe src="${escapeHtml(urlEmbed)}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>`;
    } else {
      wrap.innerHTML = `<video controls src="${escapeHtml(video.url)}"></video>`;
      ligarEventosVideo(wrap.querySelector('video'));
    }
    return;
  }

  const res = await fetch(`/api/aulas/aulas/${aulaAtual._id}/video-ticket`, { method: 'POST', headers: authHeaders() });
  if (!res.ok) { wrap.innerHTML = '<div class="player-vazio">Não foi possível carregar o vídeo.</div>'; return; }
  const { ticket } = await res.json();
  wrap.innerHTML = `<video controls src="/api/aulas/aulas/${aulaAtual._id}/video?ticket=${ticket}"></video>`;
  ligarEventosVideo(wrap.querySelector('video'));
}

function ligarEventosVideo(videoEl) {
  if (!videoEl) return;
  const aulaId = aulaAtual._id;
  if (aulaAtual.ultimaPosicaoSegundos) {
    videoEl.addEventListener('loadedmetadata', () => { videoEl.currentTime = aulaAtual.ultimaPosicaoSegundos; }, { once: true });
  }
  let ultimoEnvio = 0;
  videoEl.addEventListener('timeupdate', () => {
    if (aulaAtual._id !== aulaId) return;
    const agora = Date.now();
    if (agora - ultimoEnvio > 15000) {
      ultimoEnvio = agora;
      fetch(`/api/aulas/aulas/${aulaId}/progresso`, {
        method: 'POST', headers: authHeaders(true), body: JSON.stringify({ posicaoSegundos: Math.floor(videoEl.currentTime) })
      }).catch(() => {});
    }
  });
  videoEl.addEventListener('ended', () => { if (aulaAtual._id === aulaId) marcarConcluida(true); });
}

// ---------- navegação anterior/próxima ----------
function atualizarBotoesNavegacao() {
  const lista = aulasCache[aulaAtualModuloId] || [];
  const idx = lista.findIndex(a => a._id === aulaAtual._id);
  document.getElementById('btnAulaAnterior').disabled = idx <= 0;
  document.getElementById('btnProximaAula').disabled = idx < 0 || idx >= lista.length - 1;
}
document.getElementById('btnAulaAnterior').addEventListener('click', () => navegarAula(-1));
document.getElementById('btnProximaAula').addEventListener('click', () => navegarAula(1));
function navegarAula(delta) {
  const lista = aulasCache[aulaAtualModuloId] || [];
  const idx = lista.findIndex(a => a._id === aulaAtual._id);
  const alvo = lista[idx + delta];
  if (alvo) abrirAula(alvo._id, aulaAtualModuloId);
}

// ===================== PROGRESSO GERAL / CERTIFICADO =====================
async function carregarResumoProgresso() {
  const res = await fetch('/api/aulas/progresso/resumo', { headers: authHeaders() });
  if (!res.ok) return;
  const r = await res.json();

  document.getElementById('progressoGeralTexto').textContent = r.percentual + '%';
  document.getElementById('progressoGeralBarra').style.width = r.percentual + '%';

  const continuarWrap = document.getElementById('continuarWrap');
  if (r.ultimaAula && r.percentual < 100) {
    continuarWrap.style.display = 'block';
    const link = document.getElementById('continuarLink');
    link.textContent = `Continuar: ${r.ultimaAula.titulo} →`;
    link.onclick = e => { e.preventDefault(); abrirAula(r.ultimaAula.aulaId, r.ultimaAula.moduloId); };
  } else {
    continuarWrap.style.display = 'none';
  }
  renderTopoProgresso();

  atualizarCertificadoBanner(r.percentual, r.totalAulas);
}

function atualizarCertificadoBanner(percentual, totalAulas) {
  const banner = document.getElementById('certificadoBanner');
  if (percentual >= 100 && totalAulas > 0) {
    banner.style.display = 'flex';
    banner.className = 'certificado-banner';
    banner.innerHTML = `<span>🎓 Parabéns! Você concluiu todas as aulas.</span><button type="button" id="btnVerCertificado">Ver certificado</button>`;
    document.getElementById('btnVerCertificado').addEventListener('click', abrirCertificado);
  } else {
    banner.style.display = 'none';
  }
}

async function abrirCertificado() {
  mostrarView('certificado');
  const conteudo = document.getElementById('certificadoConteudo');
  conteudo.innerHTML = '<p>Carregando...</p>';
  const res = await fetch('/api/aulas/certificado/emitir', { method: 'POST', headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) { conteudo.innerHTML = `<p>${escapeHtml(data.msg || 'Não foi possível emitir o certificado.')}</p>`; return; }
  const dataFormatada = new Date(data.emitidoEm).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  conteudo.innerHTML = `
    <div class="selo">🎓</div>
    <h1>Certificado de Conclusão</h1>
    <div class="nome-aluno">${escapeHtml(data.nome)}</div>
    <p>concluiu com êxito todas as ${data.totalAulas} aulas da plataforma</p>
    <p><strong>Aulas Especializadas — Francês na Mira</strong></p>
    <div class="data">Emitido em ${dataFormatada}</div>`;
}
document.getElementById('voltarDoCertificado').addEventListener('click', () => mostrarView('aula'));
document.getElementById('btnImprimirCertificado').addEventListener('click', () => window.print());

// ===================== FAVORITOS =====================
async function carregarFavoritosIds() {
  const res = await fetch('/api/aulas/favoritos', { headers: authHeaders() });
  if (!res.ok) return;
  const lista = await res.json();
  favoritosIds = new Set(lista.map(f => f._id));
}

document.getElementById('btnFavoritos').addEventListener('click', async () => {
  mostrarView('favoritos');
  const res = await fetch('/api/aulas/favoritos', { headers: authHeaders() });
  const lista = res.ok ? await res.json() : [];
  favoritosIds = new Set(lista.map(f => f._id));
  const wrap = document.getElementById('favoritosLista');
  wrap.innerHTML = lista.length ? lista.map(f => `
    <div class="lista-simples-item" data-abrir-fav="${f._id}" data-modulo-fav="${f.moduloId || ''}">
      <span class="icone">${f.moduloIcone || '📘'}</span>
      <div class="info"><div class="titulo">${escapeHtml(f.titulo)}</div><div class="meta">${escapeHtml(f.moduloTitulo || '')}</div></div>
    </div>`).join('') : '<p style="opacity:0.7;">Você ainda não favoritou nenhuma aula.</p>';
});
document.getElementById('favoritosLista').addEventListener('click', e => {
  const item = e.target.closest('[data-abrir-fav]');
  if (item) abrirAula(item.dataset.abrirFav, item.dataset.moduloFav);
});

// ===================== HISTÓRICO =====================
document.getElementById('btnHistorico').addEventListener('click', async () => {
  mostrarView('historico');
  const res = await fetch('/api/aulas/progresso/historico', { headers: authHeaders() });
  const lista = res.ok ? await res.json() : [];
  const wrap = document.getElementById('historicoLista');
  wrap.innerHTML = lista.length ? lista.map(h => `
    <div class="lista-simples-item" data-abrir-hist="${h.aulaId}" data-modulo-hist="${h.moduloId || ''}">
      <span class="icone">${h.concluida ? '✅' : (h.moduloIcone || '📘')}</span>
      <div class="info"><div class="titulo">${escapeHtml(h.aulaTitulo)}</div><div class="meta">${escapeHtml(h.moduloTitulo || '')} · ${new Date(h.ultimoAcessoEm).toLocaleDateString('pt-BR')}</div></div>
    </div>`).join('') : '<p style="opacity:0.7;">Nenhum histórico ainda.</p>';
});
document.getElementById('historicoLista').addEventListener('click', e => {
  const item = e.target.closest('[data-abrir-hist]');
  if (item) abrirAula(item.dataset.abrirHist, item.dataset.moduloHist);
});

// ===================== BUSCA =====================
let buscaTimeout;
document.getElementById('buscaInput').addEventListener('input', e => {
  clearTimeout(buscaTimeout);
  const q = e.target.value.trim();
  const resultadosEl = document.getElementById('buscaResultados');
  if (!q) { resultadosEl.classList.remove('show'); return; }
  buscaTimeout = setTimeout(async () => {
    const res = await fetch('/api/aulas/buscar?q=' + encodeURIComponent(q), { headers: authHeaders() });
    const lista = res.ok ? await res.json() : [];
    resultadosEl.innerHTML = lista.length
      ? lista.map(a => `<div class="busca-resultado-item" data-abrir-busca="${a._id}" data-modulo-busca="${a.moduloId}">${escapeHtml(a.titulo)}<span class="modulo-nome">${escapeHtml(a.moduloTitulo)}</span></div>`).join('')
      : '<div class="busca-resultado-item">Nenhum resultado.</div>';
    resultadosEl.classList.add('show');
  }, 350);
});
document.getElementById('buscaResultados').addEventListener('click', e => {
  const item = e.target.closest('[data-abrir-busca]');
  if (!item) return;
  document.getElementById('buscaResultados').classList.remove('show');
  document.getElementById('buscaInput').value = '';
  abrirAula(item.dataset.abrirBusca, item.dataset.moduloBusca);
});
document.addEventListener('click', e => {
  if (!e.target.closest('.busca-wrap')) document.getElementById('buscaResultados').classList.remove('show');
});

// ===================== NOTIFICAÇÕES (localStorage) =====================
function checarNotificacoes() {
  const chave = 'aulas-ultimo-acesso';
  const ultimo = parseInt(localStorage.getItem(chave) || '0', 10);
  const novos = modulos.filter(m => new Date(m.publicadoEm).getTime() > ultimo);
  const btn = document.getElementById('btnNotificacoes');
  const badgeAntigo = btn.querySelector('.badge-novidade');
  if (badgeAntigo) badgeAntigo.remove();
  btn.classList.toggle('tem-novidade', novos.length > 0);
  if (novos.length > 0) {
    const badge = document.createElement('span');
    badge.className = 'badge-novidade';
    badge.textContent = String(novos.length);
    btn.appendChild(badge);
  }
}
document.getElementById('btnNotificacoes').addEventListener('click', () => {
  localStorage.setItem('aulas-ultimo-acesso', String(Date.now()));
  checarNotificacoes();
});

// ===================== DEEP LINK (?aula=ID&modulo=ID) =====================
// Permite que outra tela (ex.: uma atividade de dever de casa) linke direto
// pra uma aula específica, sem precisar navegar pelos módulos manualmente.
function abrirDeepLinkDaUrl() {
  const params = new URLSearchParams(window.location.search);
  const aulaId = params.get('aula');
  if (aulaId) abrirAula(aulaId, params.get('modulo'));
}

// ===================== INIT =====================
carregarModulos().then(abrirDeepLinkDaUrl);
carregarResumoProgresso();
carregarFavoritosIds();
