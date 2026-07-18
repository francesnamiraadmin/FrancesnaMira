// Player de aula reutilizável — usado tanto em aulas-especializadas.js quanto
// embutido dentro de uma atividade de Dever de Casa (deverWorkspace.js). Fala
// direto com a mesma API de progresso (/api/aulas/aulas/:id/progresso), então
// assistir por aqui ou pela tela de Aulas Especializadas é exatamente o mesmo
// dado (ProgressoAula) — nada fica duplicado.
const AulaPlayerEmbed = (() => {
  function authHeaders(json) {
    const token = localStorage.getItem('token');
    return { Authorization: 'Bearer ' + token, ...(json ? { 'Content-Type': 'application/json' } : {}) };
  }
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  const NOMES_TIPO_MATERIAL = { pdf: 'PDF', imagem: 'Imagem', audio: 'Áudio', exercicio: 'Exercício', arquivo: 'Arquivo', link: 'Link' };
  const ICONES_TIPO_MATERIAL = { pdf: 'document', imagem: 'image', audio: 'audio-file', exercicio: 'exercise-list', arquivo: 'paperclip', link: 'link' };

  function detectarTipoEmbed(url) {
    if (/youtube\.com|youtu\.be|player\.vimeo\.com|iframe\.mediadelivery\.net|cloudflarestream\.com\/.+\/iframe/i.test(url || '')) return 'iframe';
    return 'video';
  }

  // Aceita qualquer link de YouTube colado pelo professor (watch?v=, youtu.be/,
  // shorts/, embed/) e converte pro formato /embed/ID, o único que o YouTube
  // permite carregar em iframe.
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

  function ligarEventosVideo(videoEl, aula, onConcluida) {
    if (aula.ultimaPosicaoSegundos) {
      videoEl.addEventListener('loadedmetadata', () => { videoEl.currentTime = aula.ultimaPosicaoSegundos; }, { once: true });
    }
    let ultimoEnvio = 0;
    videoEl.addEventListener('timeupdate', () => {
      const agora = Date.now();
      if (agora - ultimoEnvio > 15000) {
        ultimoEnvio = agora;
        fetch(`/api/aulas/aulas/${aula._id}/progresso`, {
          method: 'POST', headers: authHeaders(true), body: JSON.stringify({ posicaoSegundos: Math.floor(videoEl.currentTime) })
        }).catch(() => {});
      }
    });
    videoEl.addEventListener('ended', async () => {
      try {
        const res = await fetch(`/api/aulas/aulas/${aula._id}/progresso`, {
          method: 'POST', headers: authHeaders(true), body: JSON.stringify({ concluida: true })
        });
        if (res.ok && onConcluida) onConcluida(await res.json());
      } catch (err) { /* falha silenciosa — o aluno pode marcar concluído de novo depois */ }
    });
  }

  async function renderPlayerNoWrap(wrap, aula, onConcluida) {
    wrap.innerHTML = '';
    const video = aula.video;
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
        ligarEventosVideo(wrap.querySelector('video'), aula, onConcluida);
      }
      return;
    }
    const res = await fetch(`/api/aulas/aulas/${aula._id}/video-ticket`, { method: 'POST', headers: authHeaders() });
    if (!res.ok) { wrap.innerHTML = '<div class="player-vazio">Não foi possível carregar o vídeo.</div>'; return; }
    const { ticket } = await res.json();
    wrap.innerHTML = `<video controls src="/api/aulas/aulas/${aula._id}/video?ticket=${ticket}"></video>`;
    ligarEventosVideo(wrap.querySelector('video'), aula, onConcluida);
  }

  function renderMateriaisNoWrap(wrap, aula) {
    const materiais = aula.materiais || [];
    if (!materiais.length) { wrap.innerHTML = ''; return; }
    wrap.innerHTML = materiais.map(m => {
      if (m.tipo === 'link') {
        return `<a class="material-item-aluno" href="${escapeHtml(m.url)}" target="_blank" rel="noopener">
          <img class="icone" src="img/icones/${ICONES_TIPO_MATERIAL[m.tipo] || 'paperclip'}.svg" alt="">
          <span><span class="nome">${escapeHtml(m.nome)}</span><br><span class="tipo">${NOMES_TIPO_MATERIAL[m.tipo]}</span></span>
        </a>`;
      }
      const tamanho = m.tamanho ? ' · ' + (m.tamanho / 1024 / 1024).toFixed(1) + ' MB' : '';
      return `<div class="material-item-aluno" data-baixar-material="${m._id}">
        <img class="icone" src="img/icones/${ICONES_TIPO_MATERIAL[m.tipo] || 'paperclip'}.svg" alt="">
        <span><span class="nome">${escapeHtml(m.nome)}</span><br><span class="tipo">${NOMES_TIPO_MATERIAL[m.tipo]}${tamanho}</span></span>
      </div>`;
    }).join('');
    wrap.addEventListener('click', async e => {
      const item = e.target.closest('[data-baixar-material]');
      if (!item) return;
      const materialId = item.dataset.baixarMaterial;
      const res = await fetch(`/api/aulas/aulas/${aula._id}/materiais/${materialId}`, { headers: authHeaders() });
      if (!res.ok) return;
      const blob = await res.blob();
      const nomeArquivo = (materiais.find(m => m._id === materialId) || {}).nome || 'material';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = nomeArquivo;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    });
  }

  // container: elemento onde o player inteiro (título, vídeo, materiais) vai
  // ser renderizado. opts.onConcluida(dados) é chamado quando o vídeo termina
  // e a conclusão foi salva de verdade em ProgressoAula.
  async function criarPlayerAula(container, aulaId, opts = {}) {
    container.innerHTML = '<div class="player-vazio">Carregando aula...</div>';
    const res = await fetch(`/api/aulas/aulas/${aulaId}`, { headers: authHeaders() });
    if (!res.ok) {
      container.innerHTML = res.status === 403
        ? '<div class="player-vazio">Esta aula é liberada a partir do plano Avancé.</div>'
        : '<div class="player-vazio">Não foi possível carregar esta aula.</div>';
      return null;
    }
    const aula = await res.json();
    container.innerHTML = `
      <h4 class="embed-aula-titulo">${escapeHtml(aula.titulo)}</h4>
      ${aula.descricao ? `<p class="embed-aula-descricao">${escapeHtml(aula.descricao)}</p>` : ''}
      <div class="player-wrap" data-player></div>
      <div class="materiais-embed" data-materiais></div>
    `;
    await renderPlayerNoWrap(container.querySelector('[data-player]'), aula, opts.onConcluida);
    renderMateriaisNoWrap(container.querySelector('[data-materiais]'), aula);
    return aula;
  }

  return {
    criarPlayerAula, detectarTipoEmbed, normalizarUrlYoutube,
    // Peças soltas — pra páginas que já têm seu próprio layout de título/
    // materiais (aulas-especializadas.js) e só querem a lógica de vídeo/progresso.
    renderVideo: renderPlayerNoWrap, ligarEventosVideo
  };
})();
