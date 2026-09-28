// =====================================================================
// ADMIN — Central de Segurança: mostra os eventos registrados pelo monitor
// (backend/utils/monitorSeguranca.js), os IPs bloqueados e permite ações de
// emergência. Atualiza sozinha a cada 20 s e, com permissão, mostra notificação
// do navegador quando surge um evento alto/crítico enquanto a página está aberta.
// =====================================================================

function authHeaders(json) {
  const token = localStorage.getItem('token');
  return Object.assign({ Authorization: 'Bearer ' + token }, json ? { 'Content-Type': 'application/json' } : {});
}

// Tudo que vem dos eventos é dado de atacante — sempre escapado antes de exibir.
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function formatarData(iso) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

const NOMES_SEVERIDADE = { critica: 'Crítica', alta: 'Alta', media: 'Média', baixa: 'Baixa', info: 'Info' };
const TITULO_ORIGINAL = document.title;

let pagina = 0;
let eventosCarregados = [];
let idsVistos = new Set();
let primeiraCarga = true;
let naoVistos = 0;

async function api(url, opcoes) {
  const res = await fetch(url, Object.assign({ headers: authHeaders(!!(opcoes && opcoes.body)) }, opcoes || {}));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.msg || 'Erro na requisição.');
  return data;
}

// ---------- RESUMO ----------
async function carregarResumo() {
  const r = await api('/api/seguranca/resumo');
  const s = r.ultimas24h || {};
  document.getElementById('kpis').innerHTML = [
    ['critica', s.critica || 0, 'Críticos (24h)'],
    ['alta', s.alta || 0, 'Altos (24h)'],
    ['media', s.media || 0, 'Médios (24h)'],
    ['baixa', s.baixa || 0, 'Baixos (24h)'],
    ['', r.bloqueiosAtivos || 0, 'IPs bloqueados agora'],
    ['', (r.memoria && r.memoria.ipsEmObservacao) || 0, 'IPs em observação']
  ].map(([cls, v, rot]) => `<div class="kpi ${cls}"><div class="valor">${esc(v)}</div><div class="rotulo">${esc(rot)}</div></div>`).join('');

  document.getElementById('porTipo').innerHTML = r.porTipo.length
    ? r.porTipo.map(t => `<div class="linha-lista"><span>${esc(t.descricao)}</span><span class="num">${esc(t.total)}</span></div>`).join('')
    : '<div class="vazio">Nenhum ataque registrado nas últimas 24h.</div>';

  document.getElementById('topIps').innerHTML = r.topIps.length
    ? r.topIps.map(i => `<div class="linha-lista">
        <span class="mono">${esc(i.ip)}</span>
        <span class="num">${esc(i.total)} evento(s)</span>
        <span>
          <button class="btn pequeno secundario" data-filtrar-ip="${esc(i.ip)}">Ver</button>
          <button class="btn pequeno perigo" data-bloquear-ip="${esc(i.ip)}">Bloquear 24h</button>
        </span>
      </div>`).join('')
    : '<div class="vazio">Nenhum IP suspeito nas últimas 24h.</div>';

  const c = r.canais || {};
  const linha = (nome, ativo, dica) => `<div class="canal"><span>${nome}</span><span class="${ativo ? 'ok' : 'nao'}">${ativo ? 'configurado' : 'não configurado — ' + dica}</span></div>`;
  document.getElementById('canais').innerHTML =
    linha('Webhook (Discord/Slack)', c.webhook, 'defina ALERTA_WEBHOOK_URL') +
    linha('Telegram', c.telegram, 'defina TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID') +
    linha('E-mail', c.email, 'defina BREVO_API_KEY e EMAIL_USER');
}

// ---------- BLOQUEIOS ----------
async function carregarBloqueios() {
  const lista = await api('/api/seguranca/bloqueios');
  document.getElementById('bloqueios').innerHTML = lista.length
    ? lista.map(b => `<tr>
        <td class="mono">${esc(b.ip)}</td>
        <td><span class="pill ${b.ativo ? 'ativo' : 'expirado'}">${b.ativo ? 'Bloqueado' : 'Expirado'}</span>${b.automatico ? '' : ' <span class="pill info">manual</span>'}</td>
        <td>${esc(formatarData(b.ate))}</td>
        <td>${esc(b.motivo || '—')}</td>
        <td>${esc(b.nivel || 1)}ª vez</td>
        <td>${b.ativo ? `<button class="btn pequeno secundario" data-desbloquear-ip="${esc(b.ip)}">Desbloquear</button>` : ''}</td>
      </tr>`).join('')
    : '<tr><td colspan="6" class="vazio">Nenhum IP bloqueado.</td></tr>';
}

// ---------- EVENTOS ----------
function renderEvento(ev, novo) {
  const detalhes = ev.detalhes ? JSON.stringify(ev.detalhes, null, 2) : '';
  return `<div class="evento ${esc(ev.severidade)} ${novo ? 'novo' : ''}">
    <div class="evento-topo">
      <span><span class="pill ${esc(ev.severidade)}">${esc(NOMES_SEVERIDADE[ev.severidade] || ev.severidade)}</span> <strong>${esc(ev.descricao || ev.tipo)}</strong></span>
      <span style="color:var(--cinza-600); font-size:0.78rem;">${esc(formatarData(ev.criadoEm))}</span>
    </div>
    <div class="evento-meta">
      ${ev.ip ? `<span>IP: <span class="mono">${esc(ev.ip)}</span></span>` : ''}
      ${ev.email ? `<span>Conta: ${esc(ev.email)}</span>` : ''}
      ${ev.rota ? `<span class="mono">${esc(ev.metodo || '')} ${esc(ev.rota)}</span>` : ''}
      ${ev.resposta ? `<span class="resposta">Resposta: ${esc(ev.resposta)}</span>` : ''}
    </div>
    ${detalhes ? `<details><summary>Detalhes técnicos</summary><pre>${esc(detalhes)}${ev.userAgent ? '\n\nNavegador: ' + esc(ev.userAgent) : ''}</pre></details>` : ''}
  </div>`;
}

function parametrosFiltro() {
  const p = new URLSearchParams();
  const sev = document.getElementById('fSeveridade').value;
  const tipo = document.getElementById('fTipo').value;
  const ip = document.getElementById('fIp').value.trim();
  if (sev) p.set('severidade', sev);
  if (tipo) p.set('tipo', tipo);
  if (ip) p.set('ip', ip);
  return p;
}

async function carregarEventos({ acrescentar } = {}) {
  const p = parametrosFiltro();
  p.set('pagina', acrescentar ? pagina : 0);
  const eventos = await api('/api/seguranca/eventos?' + p.toString());
  if (!acrescentar) { pagina = 0; eventosCarregados = eventos; } else { eventosCarregados = eventosCarregados.concat(eventos); }

  const novos = eventos.filter(e => !idsVistos.has(e._id));
  if (!primeiraCarga && !acrescentar) avisarNovos(novos);
  eventos.forEach(e => idsVistos.add(e._id));

  const novosIds = new Set(primeiraCarga ? [] : novos.map(e => e._id));
  document.getElementById('eventos').innerHTML = eventosCarregados.length
    ? eventosCarregados.map(e => renderEvento(e, novosIds.has(e._id))).join('')
    : '<div class="vazio">Nenhum evento para esse filtro. Tudo tranquilo por aqui.</div>';
  document.getElementById('btnMais').style.display = eventos.length === 50 ? '' : 'none';
  primeiraCarga = false;
}

// Notificação do navegador + contador no título da aba para eventos graves novos.
function avisarNovos(novos) {
  const graves = novos.filter(e => e.severidade === 'critica' || e.severidade === 'alta');
  if (!graves.length) return;
  if (document.hidden) {
    naoVistos += graves.length;
    document.title = `(${naoVistos}) 🚨 ${TITULO_ORIGINAL}`;
  }
  if ('Notification' in window && Notification.permission === 'granted') {
    const ev = graves[0];
    new Notification(`Segurança: ${NOMES_SEVERIDADE[ev.severidade]}`, {
      body: `${ev.descricao || ev.tipo}${ev.ip ? ' · IP ' + ev.ip : ''}${graves.length > 1 ? ` (+${graves.length - 1})` : ''}`,
      tag: 'seguranca-fnm'
    });
  }
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) { naoVistos = 0; document.title = TITULO_ORIGINAL; }
});

async function carregarCatalogo() {
  const tipos = await api('/api/seguranca/catalogo');
  document.getElementById('fTipo').innerHTML = '<option value="">Todos os tipos</option>' +
    tipos.map(t => `<option value="${esc(t.tipo)}">${esc(t.descricao)}</option>`).join('');
}

async function atualizarTudo() {
  try {
    await Promise.all([carregarResumo(), carregarBloqueios(), carregarEventos()]);
    document.getElementById('statusVivo').textContent = 'Atualizado às ' + new Date().toLocaleTimeString('pt-BR');
  } catch (err) {
    document.getElementById('statusVivo').textContent = 'Falha ao atualizar: ' + err.message;
  }
}

// ---------- AÇÕES ----------
function mostrarMsg(id, texto, erro) {
  const el = document.getElementById(id);
  el.textContent = texto;
  el.style.color = erro ? 'var(--vermelho)' : 'var(--verde)';
}

async function bloquear(ip, horas) {
  if (!ip) return;
  if (!confirm(`Bloquear o IP ${ip} por ${horas} hora(s)?`)) return;
  try {
    const r = await api('/api/seguranca/bloqueios', { method: 'POST', body: JSON.stringify({ ip, horas, motivo: 'Bloqueio manual pelo painel' }) });
    mostrarMsg('msgAcoes', r.msg);
    atualizarTudo();
  } catch (err) { mostrarMsg('msgAcoes', err.message, true); }
}

document.addEventListener('click', async e => {
  const alvo = e.target.closest('[data-bloquear-ip],[data-desbloquear-ip],[data-filtrar-ip]');
  if (!alvo) return;
  if (alvo.dataset.bloquearIp) return bloquear(alvo.dataset.bloquearIp, 24);
  if (alvo.dataset.filtrarIp) {
    document.getElementById('fIp').value = alvo.dataset.filtrarIp;
    document.getElementById('fSeveridade').value = '';
    carregarEventos();
    document.getElementById('eventos').scrollIntoView({ behavior: 'smooth' });
    return;
  }
  if (alvo.dataset.desbloquearIp) {
    const ip = alvo.dataset.desbloquearIp;
    if (!confirm(`Desbloquear o IP ${ip}?`)) return;
    try {
      const r = await api('/api/seguranca/bloqueios/' + encodeURIComponent(ip), { method: 'DELETE' });
      mostrarMsg('msgAcoes', r.msg);
      atualizarTudo();
    } catch (err) { mostrarMsg('msgAcoes', err.message, true); }
  }
});

document.getElementById('btnBloquear').addEventListener('click', () => {
  bloquear(document.getElementById('bloqIp').value.trim(), Number(document.getElementById('bloqHoras').value) || 24);
});

document.getElementById('btnRevogar').addEventListener('click', async () => {
  const email = document.getElementById('revEmail').value.trim();
  if (!email || !confirm(`Encerrar TODAS as sessões de ${email}? A pessoa será desconectada em todos os dispositivos.`)) return;
  try {
    const r = await api('/api/seguranca/revogar-sessoes', { method: 'POST', body: JSON.stringify({ email }) });
    mostrarMsg('msgAcoes', r.msg);
    document.getElementById('revEmail').value = '';
  } catch (err) { mostrarMsg('msgAcoes', err.message, true); }
});

document.getElementById('btnTeste').addEventListener('click', async () => {
  const btn = document.getElementById('btnTeste');
  btn.disabled = true;
  mostrarMsg('msgTeste', 'Enviando…');
  try {
    const r = await api('/api/seguranca/teste-alerta', { method: 'POST', body: '{}' });
    const res = r.resultado || {};
    mostrarMsg('msgTeste', `Webhook: ${res.webhook} · Telegram: ${res.telegram} · E-mail: ${res.email}`);
  } catch (err) { mostrarMsg('msgTeste', err.message, true); }
  finally { btn.disabled = false; }
});

document.getElementById('btnFiltrar').addEventListener('click', () => carregarEventos());
document.getElementById('btnMais').addEventListener('click', () => { pagina++; carregarEventos({ acrescentar: true }); });

const btnNotif = document.getElementById('btnNotificacoes');
function atualizarBotaoNotificacao() {
  if (!('Notification' in window)) { btnNotif.style.display = 'none'; return; }
  if (Notification.permission === 'granted') { btnNotif.disabled = true; btnNotif.lastChild.textContent = 'Notificações ativas'; }
}
btnNotif.addEventListener('click', async () => {
  if ('Notification' in window) await Notification.requestPermission();
  atualizarBotaoNotificacao();
});

function iniciar() {
  atualizarBotaoNotificacao();
  carregarCatalogo().catch(() => {});
  atualizarTudo();
  setInterval(atualizarTudo, 20000);
}
// A verificação de acesso (script inline da página) pode terminar antes ou depois deste arquivo carregar.
if (window.acessoLiberado) iniciar(); else window.addEventListener('acesso-liberado', iniciar, { once: true });
