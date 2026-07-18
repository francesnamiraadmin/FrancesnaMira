// =====================================================================
// MAPEADOR DE ESTUDOS — barra de timer persistente (estilo mini-player),
// serviço global incluído em toda página logada, sempre depois de
// appShell.js. Funciona como uma pequena máquina de estados:
//   oculta       → preferência "exibir barra do timer" desligada, nunca
//                  monta nada (o timer continua funcionando por trás —
//                  ver nota sobre sessaoAtivaAtual() mais abaixo).
//   preparação   → sem sessão ativa: mostra Matéria/Conteúdo/Iniciar,
//                  pronta pra começar uma sessão de qualquer página.
//   executando/
//   pausado      → sessão ativa, igual ao comportamento original.
// O estado real da sessão mora sempre no backend (GET /sessoes/ativa) —
// elapsed é sempre matemática pura sobre timestamps do servidor, nunca um
// contador local. Expõe:
//   iniciarSessao(materiaId, conteudoId) — usado tanto pelos subcards de
//     mapeador-timer.html quanto pelo botão Iniciar da própria barra (o
//     mesmo caminho de código garante que a transição preparação→
//     executando sempre liga o relógio na hora, sem travar em 00:00:00).
//   sessaoAtivaAtual() — getter usado por mapeadorTimer.js pra somar o
//     elapsed ao vivo nos cards, funciona mesmo com a barra oculta.
//   definirVisibilidade(bool) — chamado pelo checkbox "Exibir barra do
//     timer" em mapeador-timer.html; aplica na hora e sincroniza com
//     /api/auth/preferencias.
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
  // Sempre HH:MM:SS — mesmo com 0 horas, pra deixar claro que a hora também
  // está sendo contada (antes só aparecia depois de passar de 1h).
  function formatarHMS(ms) {
    const totalSeg = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(totalSeg / 3600);
    const m = Math.floor((totalSeg % 3600) / 60);
    const s = totalSeg % 60;
    const pad = n => String(n).padStart(2, '0');
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }
  function detectarDispositivo() {
    const ua = navigator.userAgent || '';
    if (/Mobi|Android/i.test(ua)) return 'Celular';
    if (/Tablet|iPad/i.test(ua)) return 'Tablet';
    return 'Computador';
  }

  // Diferença entre o relógio do servidor e o deste navegador — calibrada a
  // cada resposta HTTP (o cabeçalho "Date" já vem de graça em toda resposta,
  // sem precisar de nenhum campo novo no backend). Sem isso, se o processo
  // Node estiver com o relógio alguns minutos à frente do navegador (comum em
  // WSL2, cujo relógio virtual atrasa depois que a máquina hiberna), o
  // elapsed dava negativo, ficava travado em 00:00:00 pelo Math.max(0, ...)
  // até o tempo real alcançar essa diferença — daí "destravava" sozinho.
  let offsetServidorMs = 0;
  function calibrarOffsetServidor(res) {
    const dataHeader = res && res.headers && res.headers.get('date');
    if (!dataHeader) return;
    const horaServidor = new Date(dataHeader).getTime();
    if (!isNaN(horaServidor)) offsetServidorMs = horaServidor - Date.now();
  }
  function agoraServidor() { return Date.now() + offsetServidorMs; }

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
    const agora = agoraServidor();
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

  // Preferência do usuário (default true — nasce ligado, mesmo
  // comportamento de antes de existir a preferência). Independente dela,
  // sessaoAtiva continua sendo rastreada normalmente: é o que mantém
  // sessaoAtivaAtual() funcionando pros cards ao vivo de mapeadorTimer.js
  // quando o usuário desliga a barra.
  let exibirBarra = true;

  // Dados do estado "preparação" — carregados uma vez no appshell:ready
  // (independente de exibirBarra, pra ligar o checkbox mostrar a barra na
  // hora, sem esperar um fetch) e cacheados por matéria.
  let materiasDisponiveis = [];
  const conteudosPorMateriaCache = new Map();
  let materiaSelecionadaId = null;
  let conteudoSelecionadoId = null;

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

  async function carregarMaterias() {
    try {
      const res = await fetch('/api/estudos/materias', { headers: authHeaders() });
      materiasDisponiveis = res.ok ? await res.json() : [];
    } catch (err) { materiasDisponiveis = []; }
  }

  async function carregarConteudosDe(materiaId) {
    if (conteudosPorMateriaCache.has(materiaId)) return conteudosPorMateriaCache.get(materiaId);
    try {
      const res = await fetch('/api/estudos/conteudos?materiaId=' + materiaId, { headers: authHeaders() });
      const lista = res.ok ? await res.json() : [];
      conteudosPorMateriaCache.set(materiaId, lista);
      return lista;
    } catch (err) { return []; }
  }

  // ===================== CONTAINER (comum aos estados) =====================

  function garantirContainer() {
    if (barraEl) return;
    barraEl = document.createElement('div');
    barraEl.className = 'estudo-timer-bar';
    document.body.appendChild(barraEl);
    document.body.classList.add('tem-timer-ativo');
    // Força um reflow antes de adicionar .show, pra garantir que a transição de
    // entrada rode de verdade — requestAnimationFrame não é confiável aqui porque
    // esta barra pode ser montada com a aba em segundo plano (ex.: verificarSessaoAtiva
    // rodando ao carregar uma página que não está em foco no momento).
    void barraEl.offsetHeight;
    barraEl.classList.add('show');
  }

  function removerBarra() {
    pararRelogio();
    if (!barraEl) return;
    barraEl.classList.remove('show');
    document.body.classList.remove('tem-timer-ativo');
    const el = barraEl;
    barraEl = null;
    setTimeout(() => el.remove(), 250);
  }

  // Decide o que desenhar dado o estado atual (chamado sempre que algo
  // muda: preferência, sessão iniciada/pausada/finalizada/cancelada).
  async function aplicarEstadoVisual() {
    if (!exibirBarra) { removerBarra(); return; }
    if (sessaoAtiva) {
      montarBarraSessao();
    } else {
      await montarBarraPreparacao();
    }
  }

  // ===================== ESTADO: EXECUTANDO / PAUSADO =====================

  function montarBarraSessao() {
    garantirContainer();
    pararRelogio();
    barraEl.classList.remove('pausado');
    barraEl.innerHTML = `
      <div class="estudo-timer-bar-inner">
        <div class="estudo-timer-info">
          <span class="estudo-timer-dot" id="estudoTimerDot"></span>
          <div class="estudo-timer-labels">
            <span class="estudo-timer-materia" id="estudoTimerMateria">—</span>
            <span class="estudo-timer-conteudo" id="estudoTimerConteudo">—</span>
          </div>
        </div>
        <div class="estudo-timer-tempo" id="estudoTimerTempo">00:00:00</div>
        <div class="estudo-timer-acoes">
          <button type="button" class="estudo-timer-btn" id="estudoTimerPausar" title="Pausar"><img src="img/icones/pause.svg" alt="" style="width:16px; height:16px;"><span>Pausar</span></button>
          <button type="button" class="estudo-timer-btn" id="estudoTimerContinuar" title="Continuar" style="display:none;"><img src="img/icones/play.svg" alt="" style="width:16px; height:16px;"><span>Continuar</span></button>
          <button type="button" class="estudo-timer-btn principal" id="estudoTimerFinalizar" title="Registrar"><img src="img/icones/check.svg" alt="" style="width:16px; height:16px;"><span>Registrar</span></button>
          <button type="button" class="estudo-timer-btn perigo" id="estudoTimerCancelar" title="Cancelar"><img src="img/icones/x-mark.svg" alt="" style="width:16px; height:16px;"><span>Cancelar</span></button>
        </div>
      </div>`;

    barraEl.querySelector('#estudoTimerPausar').addEventListener('click', pausar);
    barraEl.querySelector('#estudoTimerContinuar').addEventListener('click', continuar);
    barraEl.querySelector('#estudoTimerFinalizar').addEventListener('click', abrirModalFinalizar);
    barraEl.querySelector('#estudoTimerCancelar').addEventListener('click', abrirModalCancelar);

    atualizarInfo();
    atualizarTempo();
    atualizarBotoesPausa();
    ligarRelogio();
  }

  function atualizarInfo() {
    if (!barraEl) return;
    const dot = barraEl.querySelector('#estudoTimerDot');
    const materiaEl = barraEl.querySelector('#estudoTimerMateria');
    const conteudoEl = barraEl.querySelector('#estudoTimerConteudo');
    if (!dot || !materiaEl || !conteudoEl) return;
    dot.style.background = materiaAtual ? materiaAtual.cor : 'var(--accent)';
    materiaEl.textContent = materiaAtual ? materiaAtual.nome : '—';
    conteudoEl.textContent = conteudoAtual ? conteudoAtual.nome : '—';
  }

  function atualizarTempo() {
    if (!barraEl || !sessaoAtiva) return;
    const tempoEl = barraEl.querySelector('#estudoTimerTempo');
    if (tempoEl) tempoEl.textContent = formatarHMS(calcularElapsedMs(sessaoAtiva));
  }

  function atualizarBotoesPausa() {
    if (!barraEl || !sessaoAtiva) return;
    const pausada = estaPausada(sessaoAtiva);
    const btnPausar = barraEl.querySelector('#estudoTimerPausar');
    const btnContinuar = barraEl.querySelector('#estudoTimerContinuar');
    if (!btnPausar || !btnContinuar) return;
    btnPausar.style.display = pausada ? 'none' : 'inline-flex';
    btnContinuar.style.display = pausada ? 'inline-flex' : 'none';
    barraEl.classList.toggle('pausado', pausada);
  }

  function pararRelogio() { clearInterval(intervaloId); intervaloId = null; }
  function ligarRelogio() { pararRelogio(); intervaloId = setInterval(atualizarTempo, 1000); }

  async function pausar() {
    const res = await fetch(`/api/estudos/sessoes/${sessaoAtiva._id}/pausar`, { method: 'POST', headers: authHeaders() });
    calibrarOffsetServidor(res);
    if (res.ok) { sessaoAtiva = await res.json(); atualizarBotoesPausa(); atualizarTempo(); }
  }
  async function continuar() {
    const res = await fetch(`/api/estudos/sessoes/${sessaoAtiva._id}/continuar`, { method: 'POST', headers: authHeaders() });
    calibrarOffsetServidor(res);
    if (res.ok) { sessaoAtiva = await res.json(); atualizarBotoesPausa(); atualizarTempo(); }
  }

  // ===================== ESTADO: PREPARAÇÃO =====================

  async function montarBarraPreparacao() {
    garantirContainer();
    pararRelogio();
    barraEl.classList.remove('pausado');

    if (!materiasDisponiveis.length) await carregarMaterias();
    if (materiaSelecionadaId && !materiasDisponiveis.some(m => m._id === materiaSelecionadaId)) materiaSelecionadaId = null;
    if (!materiaSelecionadaId && materiasDisponiveis.length) materiaSelecionadaId = materiasDisponiveis[0]._id;

    if (!materiasDisponiveis.length) {
      barraEl.innerHTML = `
        <div class="estudo-timer-bar-inner preparo">
          <span class="estudo-timer-preparo-vazio">Crie uma matéria no Timer de Estudos para começar.</span>
          <div class="estudo-timer-tempo">00:00:00</div>
          <button type="button" class="estudo-timer-btn-iniciar" disabled>Iniciar</button>
        </div>`;
      return;
    }

    const conteudos = await carregarConteudosDe(materiaSelecionadaId);
    if (conteudoSelecionadoId && !conteudos.some(c => c._id === conteudoSelecionadoId)) conteudoSelecionadoId = null;
    if (!conteudoSelecionadoId && conteudos.length) conteudoSelecionadoId = conteudos[0]._id;

    const opcoesMateria = materiasDisponiveis
      .map(m => `<option value="${m._id}" ${m._id === materiaSelecionadaId ? 'selected' : ''}>${escapeHtml(m.nome)}</option>`)
      .join('');
    const opcoesConteudo = conteudos.length
      ? conteudos.map(c => `<option value="${c._id}" ${c._id === conteudoSelecionadoId ? 'selected' : ''}>${escapeHtml(c.nome)}</option>`).join('')
      : `<option value="">Sem conteúdos</option>`;

    barraEl.innerHTML = `
      <div class="estudo-timer-bar-inner preparo">
        <div class="estudo-timer-preparo-selects">
          <select class="estudo-timer-select" id="estudoTimerSelectMateria">${opcoesMateria}</select>
          <select class="estudo-timer-select" id="estudoTimerSelectConteudo">${opcoesConteudo}</select>
        </div>
        <div class="estudo-timer-tempo">00:00:00</div>
        <button type="button" class="estudo-timer-btn-iniciar" id="estudoTimerBtnIniciar" ${conteudos.length ? '' : 'disabled'}>Iniciar</button>
      </div>`;

    barraEl.querySelector('#estudoTimerSelectMateria').addEventListener('change', async e => {
      materiaSelecionadaId = e.target.value;
      conteudoSelecionadoId = null;
      await montarBarraPreparacao();
    });
    const selectConteudo = barraEl.querySelector('#estudoTimerSelectConteudo');
    if (selectConteudo && conteudos.length) {
      selectConteudo.addEventListener('change', e => { conteudoSelecionadoId = e.target.value; });
    }
    const btnIniciar = barraEl.querySelector('#estudoTimerBtnIniciar');
    if (btnIniciar) {
      btnIniciar.addEventListener('click', async () => {
        btnIniciar.disabled = true;
        btnIniciar.textContent = 'Iniciando...';
        const resultado = await iniciarSessao(materiaSelecionadaId, conteudoSelecionadoId);
        if (!resultado.ok) {
          alert(resultado.msg || 'Erro ao iniciar sessão.');
          btnIniciar.disabled = false;
          btnIniciar.textContent = 'Iniciar';
        }
      });
    }
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
        sessaoAtiva = null; materiaAtual = null; conteudoAtual = null;
        await aplicarEstadoVisual();
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
      sessaoAtiva = null; materiaAtual = null; conteudoAtual = null;
      await aplicarEstadoVisual();
    });
  }

  // ===================== API PÚBLICA =====================

  // Chamado por mapeador-timer.html (subcard de Conteúdo) E pelo botão
  // Iniciar do estado "preparação" da própria barra — único caminho de
  // código pra criar uma sessão, garantindo que o relógio sempre liga na
  // hora, sem depender de duas implementações separadas.
  async function iniciarSessao(materiaId, conteudoId) {
    try {
      const res = await fetch('/api/estudos/sessoes/iniciar', {
        method: 'POST', headers: authHeaders(true),
        body: JSON.stringify({ materiaId, conteudoId })
      });
      calibrarOffsetServidor(res);
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409 && data.sessaoAtiva) return { ok: false, conflito: true, sessaoAtiva: data.sessaoAtiva };
        return { ok: false, msg: data.msg || 'Erro ao iniciar sessão.' };
      }
      sessaoAtiva = data;
      await buscarNomes(sessaoAtiva);
      await aplicarEstadoVisual();
      return { ok: true, sessao: data };
    } catch (err) {
      return { ok: false, msg: 'Erro ao conectar ao servidor.' };
    }
  }

  function sessaoAtivaAtual() { return sessaoAtiva; }

  // Chamado pelo checkbox "Exibir barra do timer" (mapeador-timer.html).
  // Aplica na hora — mostra/esconde a barra sem esperar reload nem round-trip
  // — e sincroniza a preferência com a conta em paralelo (mesmo padrão
  // local-apply-then-sync de theme-toggle.js).
  async function definirVisibilidade(ligado) {
    exibirBarra = !!ligado;
    aplicarEstadoVisual();
    try {
      await fetch('/api/auth/preferencias', {
        method: 'PUT', headers: authHeaders(true),
        body: JSON.stringify({ exibirBarraTimer: exibirBarra })
      });
    } catch (err) { /* silencioso */ }
  }

  async function verificarSessaoAtiva() {
    try {
      const res = await fetch('/api/estudos/sessoes/ativa', { headers: authHeaders() });
      calibrarOffsetServidor(res);
      sessaoAtiva = res.ok ? await res.json() : null;
      if (sessaoAtiva) await buscarNomes(sessaoAtiva);
    } catch (err) { sessaoAtiva = null; /* sem barra se a checagem falhar — não é crítico */ }
  }

  document.addEventListener('appshell:ready', async e => {
    const prefs = (e.detail && e.detail.preferencias) || {};
    exibirBarra = prefs.exibirBarraTimer !== false;
    // Sempre carrega sessão ativa e matérias, independente da preferência —
    // é o que deixa o checkbox "ligar" instantâneo em qualquer página, e
    // mantém sessaoAtivaAtual() funcionando pros cards ao vivo de
    // mapeadorTimer.js mesmo com a barra oculta.
    await Promise.all([verificarSessaoAtiva(), carregarMaterias()]);
    await aplicarEstadoVisual();
  });

  // agoraServidor() também é usado por mapeadorTimer.js — mesmo relógio
  // calibrado, pra não haver dois offsets diferentes entre a barra e os
  // cards "ao vivo" da grade de Matéria/Conteúdo.
  return { iniciarSessao, sessaoAtivaAtual, definirVisibilidade, agoraServidor };
})();
