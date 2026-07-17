// =====================================================================
// MAPEADOR DE ESTUDOS — Timer. Elapsed calculado sempre por matemática de
// timestamps do servidor (iniciadoEm + pausas), nunca por contagem local —
// resiliente a refresh/fechar aba: reabrir a página busca GET /sessoes/ativa
// e recalcula a partir dos timestamps, sem perder nem adiantar tempo.
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

let sessaoAtiva = null;
let materias = [];
let conteudosDaMateria = [];
let materiaEscolhidaId = null;
let conteudoEscolhidoId = null;
let intervaloId = null;

function formatarHMS(ms) {
  const totalSeg = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeg / 3600);
  const m = Math.floor((totalSeg % 3600) / 60);
  const s = totalSeg % 60;
  const pad = n => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

async function iniciarPagina() {
  const res = await fetch('/api/estudos/materias', { headers: authHeaders() });
  materias = res.ok ? await res.json() : [];

  const ativaRes = await fetch('/api/estudos/sessoes/ativa', { headers: authHeaders() });
  sessaoAtiva = ativaRes.ok ? await ativaRes.json() : null;

  if (sessaoAtiva) mostrarTimerAtivo();
  else mostrarSelecao();
}

function mostrarSelecao() {
  document.getElementById('timerSelecao').style.display = 'block';
  document.getElementById('timerAtivo').style.display = 'none';
  document.getElementById('timerSucesso').style.display = 'none';
  renderMateriasSelecao();
}

function renderMateriasSelecao() {
  const el = document.getElementById('selecaoMaterias');
  if (!materias.length) {
    el.innerHTML = '<p class="vazio-msg">Você ainda não tem matérias. <a href="mapeador-materias.html">Crie uma primeiro</a>.</p>';
    return;
  }
  el.innerHTML = materias.map(m => `
    <button type="button" class="chip-materia ${m._id === materiaEscolhidaId ? 'ativo' : ''}" style="--cor-item:${m.cor};" data-id="${m._id}">
      ${m.icone ? escapeHtml(m.icone) + ' ' : ''}${escapeHtml(m.nome)}
    </button>`).join('');
}

async function escolherMateria(id) {
  materiaEscolhidaId = id;
  conteudoEscolhidoId = null;
  renderMateriasSelecao();
  document.getElementById('selecaoConteudosWrap').style.display = 'block';
  const res = await fetch('/api/estudos/conteudos?materiaId=' + id, { headers: authHeaders() });
  conteudosDaMateria = res.ok ? await res.json() : [];
  renderConteudosSelecao();
  atualizarBotaoIniciar();
}

function renderConteudosSelecao() {
  const el = document.getElementById('selecaoConteudos');
  if (!conteudosDaMateria.length) {
    el.innerHTML = '<p class="vazio-msg">Esta matéria ainda não tem conteúdos. <a href="mapeador-materias.html">Crie um primeiro</a>.</p>';
    return;
  }
  el.innerHTML = conteudosDaMateria.map(c => `
    <button type="button" class="chip-materia ${c._id === conteudoEscolhidoId ? 'ativo' : ''}" style="--cor-item:${c.cor};" data-id="${c._id}">${escapeHtml(c.nome)}</button>`).join('');
}

function escolherConteudo(id) {
  conteudoEscolhidoId = id;
  renderConteudosSelecao();
  atualizarBotaoIniciar();
}

function atualizarBotaoIniciar() {
  document.getElementById('btnIniciarTimer').disabled = !(materiaEscolhidaId && conteudoEscolhidoId);
}

async function iniciarTimer() {
  const res = await fetch('/api/estudos/sessoes/iniciar', {
    method: 'POST', headers: authHeaders(true),
    body: JSON.stringify({ materiaId: materiaEscolhidaId, conteudoId: conteudoEscolhidoId })
  });
  const data = await res.json();
  if (!res.ok) {
    if (res.status === 409 && data.sessaoAtiva) { sessaoAtiva = data.sessaoAtiva; mostrarTimerAtivo(); return; }
    alert(data.msg || 'Erro ao iniciar.');
    return;
  }
  sessaoAtiva = data;
  mostrarTimerAtivo();
}

function materiaPorId(id) { return materias.find(m => m._id === id); }

function mostrarTimerAtivo() {
  document.getElementById('timerSelecao').style.display = 'none';
  document.getElementById('timerSucesso').style.display = 'none';
  document.getElementById('timerAtivo').style.display = 'block';
  renderInfoSessao();
  atualizarDisplayTempo();
  clearInterval(intervaloId);
  intervaloId = setInterval(atualizarDisplayTempo, 1000);
  atualizarBotoesPausa();
}

async function renderInfoSessao() {
  let materia = materiaPorId(sessaoAtiva.materiaId);
  if (!materia) {
    const res = await fetch('/api/estudos/materias', { headers: authHeaders() });
    materias = res.ok ? await res.json() : materias;
    materia = materiaPorId(sessaoAtiva.materiaId);
  }
  document.getElementById('timerMateriaNome').textContent = materia ? materia.nome : '—';
  document.getElementById('timerMateriaNome').style.color = materia ? materia.cor : 'inherit';

  const resC = await fetch('/api/estudos/conteudos?materiaId=' + sessaoAtiva.materiaId, { headers: authHeaders() });
  const lista = resC.ok ? await resC.json() : [];
  const conteudo = lista.find(c => c._id === sessaoAtiva.conteudoId);
  document.getElementById('timerConteudoNome').textContent = conteudo ? conteudo.nome : '—';
}

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

function atualizarDisplayTempo() {
  if (!sessaoAtiva) return;
  document.getElementById('timerDisplay').textContent = formatarHMS(calcularElapsedMs(sessaoAtiva));
}

function atualizarBotoesPausa() {
  const pausada = estaPausada(sessaoAtiva);
  document.getElementById('btnPausar').style.display = pausada ? 'none' : 'inline-block';
  document.getElementById('btnContinuar').style.display = pausada ? 'inline-block' : 'none';
  const tag = document.getElementById('timerStatusTag');
  tag.textContent = pausada ? 'Pausado' : 'Em andamento';
  tag.className = 'timer-status-tag ' + (pausada ? 'pausado' : 'ativo');
}

async function pausar() {
  const res = await fetch(`/api/estudos/sessoes/${sessaoAtiva._id}/pausar`, { method: 'POST', headers: authHeaders() });
  if (res.ok) { sessaoAtiva = await res.json(); atualizarBotoesPausa(); atualizarDisplayTempo(); }
}
async function continuar() {
  const res = await fetch(`/api/estudos/sessoes/${sessaoAtiva._id}/continuar`, { method: 'POST', headers: authHeaders() });
  if (res.ok) { sessaoAtiva = await res.json(); atualizarBotoesPausa(); atualizarDisplayTempo(); }
}

function abrirModalFinalizar() {
  document.getElementById('finalizarObservacoes').value = '';
  document.getElementById('modalFinalizarErro').textContent = '';
  document.getElementById('modalFinalizarResumoTempo').textContent = formatarHMS(calcularElapsedMs(sessaoAtiva));
  document.getElementById('modalFinalizar').classList.add('show');
}
function fecharModalFinalizar() { document.getElementById('modalFinalizar').classList.remove('show'); }

function detectarDispositivo() {
  const ua = navigator.userAgent || '';
  if (/Mobi|Android/i.test(ua)) return 'Celular';
  if (/Tablet|iPad/i.test(ua)) return 'Tablet';
  return 'Computador';
}

async function confirmarFinalizar() {
  const observacoes = document.getElementById('finalizarObservacoes').value.trim();
  const res = await fetch(`/api/estudos/sessoes/${sessaoAtiva._id}/finalizar`, {
    method: 'POST', headers: authHeaders(true),
    body: JSON.stringify({ observacoes, dispositivo: detectarDispositivo() })
  });
  const data = await res.json();
  if (!res.ok) { document.getElementById('modalFinalizarErro').textContent = data.msg || 'Erro ao finalizar.'; return; }
  fecharModalFinalizar();
  clearInterval(intervaloId);
  mostrarSucessoFinalizado(data);
}

function mostrarSucessoFinalizado(sessao) {
  sessaoAtiva = null;
  document.getElementById('timerAtivo').style.display = 'none';
  document.getElementById('timerSucesso').style.display = 'block';
  document.getElementById('sucessoTempo').textContent = formatarHMS((sessao.duracaoSegundos || 0) * 1000);
}

async function cancelarSessao() {
  if (!confirm('Cancelar esta sessão? O tempo não será registrado.')) return;
  await fetch(`/api/estudos/sessoes/${sessaoAtiva._id}/cancelar`, { method: 'POST', headers: authHeaders() });
  clearInterval(intervaloId);
  sessaoAtiva = null;
  materiaEscolhidaId = null; conteudoEscolhidoId = null;
  mostrarSelecao();
}

function novaSessao() {
  materiaEscolhidaId = null; conteudoEscolhidoId = null;
  mostrarSelecao();
}

// ===================== EVENTOS =====================

document.getElementById('selecaoMaterias').addEventListener('click', e => {
  const btn = e.target.closest('.chip-materia');
  if (btn) escolherMateria(btn.dataset.id);
});
document.getElementById('selecaoConteudos').addEventListener('click', e => {
  const btn = e.target.closest('.chip-materia');
  if (btn) escolherConteudo(btn.dataset.id);
});
document.getElementById('btnIniciarTimer').addEventListener('click', iniciarTimer);
document.getElementById('btnPausar').addEventListener('click', pausar);
document.getElementById('btnContinuar').addEventListener('click', continuar);
document.getElementById('btnFinalizar').addEventListener('click', abrirModalFinalizar);
document.getElementById('btnCancelarFinalizar').addEventListener('click', fecharModalFinalizar);
document.getElementById('btnConfirmarFinalizar').addEventListener('click', confirmarFinalizar);
document.getElementById('btnCancelar').addEventListener('click', cancelarSessao);
document.getElementById('btnNovaSessao').addEventListener('click', novaSessao);

iniciarPagina();
