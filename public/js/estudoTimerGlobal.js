// =====================================================================
// MAPEADOR DE ESTUDOS — barra de timer persistente (estilo mini-player),
// serviço global incluído em toda página logada, sempre depois de
// appShell.js. Só aparece quando existe uma sessão de estudo em
// andamento; sobrevive à navegação entre páginas porque o estado real
// mora no backend (GET /sessoes/ativa) — o elapsed é sempre matemática
// pura sobre timestamps do servidor, nunca um contador local (mesmo
// princípio de resiliência já usado no Timer, ver mapeadorTimer.js).
// Expõe window.EstudoTimerGlobal.iniciarSessao(materiaId, conteudoId)
// pra mapeador-timer.html iniciar uma sessão sem precisar recarregar a
// página nem duplicar a lógica da barra.
// =====================================================================
window.EstudoTimerGlobal = (() => {
  function authHeaders(json) {
    const token = localStorage.getItem('token');
    return { Authorization: 'Bearer ' + token, ...(json ? { 'Content-Type': 'application/json' } : {}) };
  }
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }
  function formatarHMS(ms) {
    const totalSeg = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(totalSeg / 3600);
    const m = Math.floor((totalSeg % 3600) / 60);
    const s = totalSeg % 60;
    const pad = n => String(n).padStart(2, '0');
    return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }
  function detectarDispositivo() {
    const ua = navigator.userAgent || '';
    if (/Mobi|Android/i.test(ua)) return 'Celular';
    if (/Tablet|iPad/i.test(ua)) return 'Tablet';
    return 'Computador';
  }

  // Mesma matemática de mapeadorTimer.js — elapsed nunca é um contador
  // incremental, sempre recalculado a partir de iniciadoEm/pausas.
  function pausaAbertaMs(sessao, agora) {
    const aberta = (sessao.pausas || []).find(p => !p.fim);
    return aberta ? agora - new Date(aberta.inicio).getTime() : 0;
  }
  function pausasFechadasMs(sessao) {
    return (sessao.pausas || []).filter(p => p.fim).reduce((acc, p) => acc + (new Date(p.fim) - new Date(p.inicio)), 0);
  }
  function calcularElapsedMs(sessao) {
    const agora = Date.now();
    const bruto = agora - new Date(sessao.iniciadoEm).getTime();
    const pausasMs = pausasFechadasMs(sessao) + pausaAbertaMs(sessao, agora);
    return Math.max(0, bruto - pausasMs);
  }
  function estaPausada(sessao) {
    return (sessao.pausas || []).some(p => !p.fim);
  }

  let sessaoAtiva = null;
  let intervaloId = null;
  let barraEl = null;
  let materiaAtual = null;
  let conteudoAtual = null;

  async function buscarNomes(sessao) {
    try {
      const [resM, resC] = await Promise.all([
        fetch('/api/estudos/materias', { headers: authHeaders() }),
        fetch('/api/estudos/conteudos?materiaId=' + sessao.materiaId, { headers: authHeaders() })
      ]);
      const materias = resM.ok ? await resM.json() : [];
      const conteudos = resC.ok ? await resC.json() : [];
      materiaAtual = materias.find(m => m._id === sessao.materiaId) || null;
      conteudoAtual = conteudos.find(c => c._id === sessao.conteudoId) || null;
    } catch (err) { materiaAtual = null; conteudoAtual = null; }
  }

  // ===================== BARRA =====================

  function montarBarra() {
    if (barraEl) return;
    barraEl = document.createElement('div');
    barraEl.className = 'estudo-timer-bar';
    barraEl.innerHTML = `
      <div class="estudo-timer-bar-inner">
        <div class="estudo-timer-info">
          <span class="estudo-timer-dot" id="estudoTimerDot"></span>
          <div class="estudo-timer-labels">
            <span class="estudo-timer-materia" id="estudoTimerMateria">—</span>
            <span class="estudo-timer-conteudo" id="estudoTimerConteudo">—</span>
          </div>
        </div>
        <div class="estudo-timer-tempo" id="estudoTimerTempo">00:00</div>
        <div class="estudo-timer-acoes">
          <button type="button" class="estudo-timer-btn" id="estudoTimerPausar" title="Pausar">⏸</button>
          <button type="button" class="estudo-timer-btn" id="estudoTimerContinuar" title="Continuar" style="display:none;">▶</button>
          <button type="button" class="estudo-timer-btn principal" id="estudoTimerFinalizar" title="Finalizar">✔</button>
          <button type="button" class="estudo-timer-btn perigo" id="estudoTimerCancelar" title="Cancelar">✕</button>
        </div>
      </div>`;
    document.body.appendChild(barraEl);
    document.body.classList.add('tem-timer-ativo');
    // Força um reflow antes de adicionar .show, pra garantir que a transição de
    // entrada rode de verdade — requestAnimationFrame não é confiável aqui porque
    // esta barra pode ser montada com a aba em segundo plano (ex.: verificarSessaoAtiva
    // rodando ao carregar uma página que não está em foco no momento).
    void barraEl.offsetHeight;
    barraEl.classList.add('show');

    barraEl.querySelector('#estudoTimerPausar').addEventListener('click', pausar);
    barraEl.querySelector('#estudoTimerContinuar').addEventListener('click', continuar);
    barraEl.querySelector('#estudoTimerFinalizar').addEventListener('click', abrirModalFinalizar);
    barraEl.querySelector('#estudoTimerCancelar').addEventListener('click', abrirModalCancelar);
  }

  function removerBarra() {
    if (!barraEl) return;
    barraEl.classList.remove('show');
    document.body.classList.remove('tem-timer-ativo');
    const el = barraEl;
    barraEl = null;
    setTimeout(() => el.remove(), 250);
  }

  function atualizarInfo() {
    if (!barraEl) return;
    barraEl.querySelector('#estudoTimerDot').style.background = materiaAtual ? materiaAtual.cor : 'var(--accent)';
    barraEl.querySelector('#estudoTimerMateria').textContent = materiaAtual ? materiaAtual.nome : '—';
    barraEl.querySelector('#estudoTimerConteudo').textContent = conteudoAtual ? conteudoAtual.nome : '—';
  }

  function atualizarTempo() {
    if (!barraEl || !sessaoAtiva) return;
    barraEl.querySelector('#estudoTimerTempo').textContent = formatarHMS(calcularElapsedMs(sessaoAtiva));
  }

  function atualizarBotoesPausa() {
    if (!barraEl || !sessaoAtiva) return;
    const pausada = estaPausada(sessaoAtiva);
    barraEl.querySelector('#estudoTimerPausar').style.display = pausada ? 'none' : 'inline-flex';
    barraEl.querySelector('#estudoTimerContinuar').style.display = pausada ? 'inline-flex' : 'none';
    barraEl.classList.toggle('pausado', pausada);
  }

  function pararRelogio() { clearInterval(intervaloId); intervaloId = null; }
  function ligarRelogio() { pararRelogio(); intervaloId = setInterval(atualizarTempo, 1000); }

  async function pausar() {
    const res = await fetch(`/api/estudos/sessoes/${sessaoAtiva._id}/pausar`, { method: 'POST', headers: authHeaders() });
    if (res.ok) { sessaoAtiva = await res.json(); atualizarBotoesPausa(); atualizarTempo(); }
  }
  async function continuar() {
    const res = await fetch(`/api/estudos/sessoes/${sessaoAtiva._id}/continuar`, { method: 'POST', headers: authHeaders() });
    if (res.ok) { sessaoAtiva = await res.json(); atualizarBotoesPausa(); atualizarTempo(); }
  }

  // ===================== MODAIS (criados/anexados sob demanda, mesmo
  // padrão de montarModalFoto em appShell.js) =====================

  function abrirModalFinalizar() {
    const overlay = document.createElement('div');
    overlay.className = 'app-modal-overlay';
    overlay.innerHTML = `
      <div class="app-modal">
        <h3>Finalizar sessão</h3>
        <p style="text-align:center; opacity:0.9;">Deseja registrar esta sessão de estudo?</p>
        <p style="text-align:center; font-family:'Playfair Display',serif; font-size:1.8rem; color:var(--accent); margin:10px 0 4px;">${formatarHMS(calcularElapsedMs(sessaoAtiva))}</p>
        <label>Observações (opcional)</label>
        <textarea id="estudoModalFinalizarObs" placeholder="O que você estudou nesta sessão?" style="width:100%; min-height:70px; padding:11px 14px; border-radius:10px; border:1px solid var(--glass-border); background:var(--glass-input); color:var(--text); font-family:'Poppins',sans-serif; resize:vertical;"></textarea>
        <p class="app-modal-msg" id="estudoModalFinalizarMsg" style="color:var(--danger-text);"></p>
        <div class="app-modal-actions">
          <button class="dash-btn secundario" id="estudoModalFinalizarCancelar" type="button">Cancelar</button>
          <button class="dash-btn" id="estudoModalFinalizarConfirmar" type="button">Registrar</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('show'));

    function fechar() { overlay.classList.remove('show'); setTimeout(() => overlay.remove(), 200); }
    overlay.querySelector('#estudoModalFinalizarCancelar').addEventListener('click', fechar);
    overlay.addEventListener('click', e => { if (e.target === overlay) fechar(); });

    overlay.querySelector('#estudoModalFinalizarConfirmar').addEventListener('click', async () => {
      const observacoes = overlay.querySelector('#estudoModalFinalizarObs').value.trim();
      try {
        const res = await fetch(`/api/estudos/sessoes/${sessaoAtiva._id}/finalizar`, {
          method: 'POST', headers: authHeaders(true),
          body: JSON.stringify({ observacoes, dispositivo: detectarDispositivo() })
        });
        const data = await res.json();
        if (!res.ok) { overlay.querySelector('#estudoModalFinalizarMsg').textContent = data.msg || 'Erro ao finalizar.'; return; }
        fechar();
        pararRelogio();
        sessaoAtiva = null; materiaAtual = null; conteudoAtual = null;
        removerBarra();
        // O SSE ("sessao-estudo-finalizada", ver backend/utils/sse.js) atualiza
        // histórico/estatísticas/cards em qualquer aba aberta, incluindo esta.
      } catch (err) {
        overlay.querySelector('#estudoModalFinalizarMsg').textContent = 'Erro ao conectar ao servidor.';
      }
    });
  }

  function abrirModalCancelar() {
    const overlay = document.createElement('div');
    overlay.className = 'app-modal-overlay';
    overlay.innerHTML = `
      <div class="app-modal">
        <h3>Cancelar sessão</h3>
        <p style="text-align:center; opacity:0.9;">Deseja realmente cancelar esta sessão? O tempo registrado será perdido.</p>
        <div class="app-modal-actions">
          <button class="dash-btn secundario" id="estudoModalCancelarVoltar" type="button">Cancelar ação</button>
          <button class="dash-btn perigo" id="estudoModalCancelarConfirmar" type="button">Sim, descartar sessão</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('show'));

    function fechar() { overlay.classList.remove('show'); setTimeout(() => overlay.remove(), 200); }
    overlay.querySelector('#estudoModalCancelarVoltar').addEventListener('click', fechar);
    overlay.addEventListener('click', e => { if (e.target === overlay) fechar(); });

    overlay.querySelector('#estudoModalCancelarConfirmar').addEventListener('click', async () => {
      try { await fetch(`/api/estudos/sessoes/${sessaoAtiva._id}/cancelar`, { method: 'POST', headers: authHeaders() }); } catch (err) { /* segue removendo a barra mesmo assim */ }
      fechar();
      pararRelogio();
      sessaoAtiva = null; materiaAtual = null; conteudoAtual = null;
      removerBarra();
    });
  }

  // ===================== API PÚBLICA =====================

  // Chamado por mapeador-timer.html ao clicar "Iniciar" num subcard de Conteúdo.
  async function iniciarSessao(materiaId, conteudoId) {
    try {
      const res = await fetch('/api/estudos/sessoes/iniciar', {
        method: 'POST', headers: authHeaders(true),
        body: JSON.stringify({ materiaId, conteudoId })
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409 && data.sessaoAtiva) return { ok: false, conflito: true, sessaoAtiva: data.sessaoAtiva };
        return { ok: false, msg: data.msg || 'Erro ao iniciar sessão.' };
      }
      sessaoAtiva = data;
      await buscarNomes(sessaoAtiva);
      montarBarra();
      atualizarInfo();
      atualizarTempo();
      atualizarBotoesPausa();
      ligarRelogio();
      return { ok: true, sessao: data };
    } catch (err) {
      return { ok: false, msg: 'Erro ao conectar ao servidor.' };
    }
  }

  function sessaoAtivaAtual() { return sessaoAtiva; }

  async function verificarSessaoAtiva() {
    try {
      const res = await fetch('/api/estudos/sessoes/ativa', { headers: authHeaders() });
      const sessao = res.ok ? await res.json() : null;
      if (!sessao) return;
      sessaoAtiva = sessao;
      await buscarNomes(sessaoAtiva);
      montarBarra();
      atualizarInfo();
      atualizarTempo();
      atualizarBotoesPausa();
      ligarRelogio();
    } catch (err) { /* sem barra se a checagem falhar — não é crítico */ }
  }

  document.addEventListener('appshell:ready', verificarSessaoAtiva);

  return { iniciarSessao, sessaoAtivaAtual };
})();
