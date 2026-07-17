// =====================================================================
// RENDERERS COMPARTILHADOS — cards de Conjunto (Sugerido/Em Andamento/Respondido)
// Usado por praticar.js (as 3 seções). Depende de MATERIAS_LABELS (definida em
// js/questoesRender.js, carregado antes deste script).
// =====================================================================

function authHeaders(json) {
  const token = localStorage.getItem('token');
  return Object.assign({ Authorization: 'Bearer ' + token }, json ? { 'Content-Type': 'application/json' } : {});
}

function formatarTempo(seg) {
  if (!seg) return null;
  const m = Math.round(seg / 60);
  return `${m} min`;
}

// Diferente de formatarTempo: 0 segundos é um valor válido aqui (sessão recém-criada),
// não deve virar "sem limite" — usado só pro "tempo já utilizado" de Em Andamento.
function formatarTempoDecorrido(seg) {
  const m = Math.floor((seg || 0) / 60);
  const s = (seg || 0) % 60;
  return m > 0 ? `${m} min` : `${s}s`;
}

function badgeFiltros(c) {
  const niveis = (c.filtros?.niveis || []).join('+');
  const materias = (c.filtros?.materias || []).map(m => MATERIAS_LABELS[m] || m).join(', ');
  return [niveis, materias].filter(Boolean).join(' · ');
}

function conjuntoCardBase(c) {
  const rotuloStatus = { nao_iniciado: 'Não iniciado', em_andamento: 'Em andamento', concluido: 'Concluído' }[c.status];
  return `
    <span class="conjunto-status ${c.status}">${rotuloStatus}</span>
    <h3>${c.nome}</h3>
    ${c.descricao ? `<p class="conjunto-desc">${c.descricao}</p>` : ''}
    <div class="conjunto-tags">
      ${c.tipo === 'personalizado' ? '<span class="q-pill personalizado">Personalizado</span>' : ''}
      <span class="q-pill">${c.quantidadeQuestoes} questões</span>
      ${c.dificuldade ? `<span class="q-pill">${c.dificuldade}</span>` : ''}
      ${c.tempoLimiteSegundos ? `<span class="q-pill">⏱️ ${formatarTempo(c.tempoLimiteSegundos)}</span>` : '<span class="q-pill">Sem limite de tempo</span>'}
    </div>
    <p class="conjunto-desc">${badgeFiltros(c)}</p>
    ${c.mediaPercentualAcertos !== null && c.mediaPercentualAcertos !== undefined ? `<p class="conjunto-desc">Média de acertos dos alunos: <strong>${c.mediaPercentualAcertos}%</strong></p>` : ''}
  `;
}

function renderSugeridoCard(c) {
  return `<div class="conjunto-card destaque">
    ${conjuntoCardBase(c)}
    <div class="conjunto-acoes"><button class="q-btn" data-iniciar="${c._id}">Iniciar</button></div>
  </div>`;
}

// Versão "mista" (não-iniciado OU em-andamento no mesmo card) — Praticar usa as 3
// seções separadas acima, mas Simulados (public/js/simulados.js) continua com só 2
// blocos (Sugeridos + Respondidos, sem seção "Em Andamento" própria), então precisa
// deste renderer que decide a ação pelo status.
function renderPrioritarioCard(c) {
  const acao = c.status === 'em_andamento'
    ? `<button class="q-btn" data-continuar="${c._id}">Continuar</button>`
    : `<button class="q-btn" data-iniciar="${c._id}">Iniciar</button>`;
  return `<div class="conjunto-card destaque">
    ${conjuntoCardBase(c)}
    ${c.status === 'em_andamento' ? `<p class="conjunto-desc">${c.questoesRespondidas}/${c.quantidadeQuestoes} respondidas</p>` : ''}
    <div class="conjunto-acoes">${acao}</div>
  </div>`;
}

function renderEmAndamentoCard(c) {
  const pct = Math.round((c.questoesRespondidas / c.quantidadeQuestoes) * 100);
  return `<div class="conjunto-card destaque">
    ${conjuntoCardBase(c)}
    <div class="conjunto-resultado">
      ${pct}% concluído — ${c.questoesRespondidas}/${c.quantidadeQuestoes} questões respondidas<br>
      Tempo utilizado: ${formatarTempoDecorrido(c.tempoDecorridoSegundos)}
    </div>
    <div class="conjunto-acoes"><button class="q-btn" data-continuar="${c._id}">Continuar</button></div>
  </div>`;
}

function renderRespondidoCard(c) {
  const t = c.ultimaTentativa;
  const data = new Date(t.finalizadaEm).toLocaleDateString('pt-BR');
  return `<div class="conjunto-card">
    ${conjuntoCardBase(c)}
    <div class="conjunto-resultado">
      Nota: <strong>${t.totalCorretas}/${t.totalQuestoes}</strong> (${t.percentualAcertos}%) — ${data}
      ${t.tempoGastoSegundos ? ` — ${formatarTempo(t.tempoGastoSegundos)}` : ''}
      ${c.totalTentativas > 1 ? ` — ${c.totalTentativas}ª tentativas` : ''}
    </div>
    <div class="conjunto-acoes">
      <button class="q-btn secundario" data-revisar="${t._id}">Revisar</button>
      <button class="q-btn" data-refazer="${c._id}">Refazer</button>
    </div>
  </div>`;
}

// Delegado no document — vale pra qualquer página que carregue este script.
document.addEventListener('click', e => {
  const iniciar = e.target.closest('[data-iniciar]');
  if (iniciar) return window.location.href = `resolver-conjunto.html?id=${iniciar.dataset.iniciar}`;

  const continuar = e.target.closest('[data-continuar]');
  if (continuar) return window.location.href = `resolver-conjunto.html?id=${continuar.dataset.continuar}`;

  const refazer = e.target.closest('[data-refazer]');
  if (refazer) return window.location.href = `resolver-conjunto.html?id=${refazer.dataset.refazer}`;

  const revisar = e.target.closest('[data-revisar]');
  if (revisar) return window.location.href = `resolver-conjunto.html?tentativaId=${revisar.dataset.revisar}`;
});
