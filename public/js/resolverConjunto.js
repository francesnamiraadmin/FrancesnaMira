// =====================================================================
// TELA DE RESOLUÇÃO DE CONJUNTO (Fase 1)
// Dois modos via query string: ?id=<conjuntoId> (sessão de resolução ao vivo,
// cria ou retoma) e ?tentativaId=<id> (modo leitura — gabarito de uma
// tentativa já concluída, usado por "Revisar" e pela tela pós-envio).
// =====================================================================

function authHeaders(json) {
  const token = localStorage.getItem('token');
  return Object.assign({ Authorization: 'Bearer ' + token }, json ? { 'Content-Type': 'application/json' } : {});
}

const params = new URLSearchParams(window.location.search);
const conjuntoIdParam = params.get('id');
const tentativaIdParam = params.get('tentativaId');
const wrap = document.getElementById('resolverWrap');

let sessao = null;
let timerInterval = null;
let enviando = false;

// O backend sempre devolve `opcoes` na ordem original (índice 0 é a correta na fonte),
// já que a correção agora compara pelo TEXTO da opção, não pelo índice — então o
// embaralhamento de exibição é responsabilidade só do front. Determinístico por id da
// questão (mesma técnica já usada em Simulados) pra não reordenar a cada re-render.
function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) >>> 0; } return h; }
function opcoesEmbaralhadas(q) {
  if (!q.opcoes) return [];
  const idx = q.opcoes.map((_, i) => i);
  let seed = hashStr(q._id);
  for (let i = idx.length - 1; i > 0; i--) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    const j = seed % (i + 1);
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx.map(i => q.opcoes[i]);
}

function erroTela(msg) {
  wrap.innerHTML = `<p style="text-align:center; opacity:0.8; padding:40px;">${msg}</p>`;
}

// ===================== SESSÃO (resolução ao vivo) =====================

async function iniciarOuRetomarSessao() {
  const res = await fetch(`/api/questoes/conjuntos/${conjuntoIdParam}/sessao`, { method: 'POST', headers: authHeaders() });
  if (!res.ok) return erroTela('Não foi possível carregar este conjunto.');
  sessao = await res.json();
  renderSessao();
  iniciarTimerSeNecessario();
}

function tempoRestanteSegundos() {
  if (!sessao.tempoLimiteSegundos) return null;
  return Math.max(0, sessao.tempoLimiteSegundos - sessao.tempoDecorridoSegundos);
}

function iniciarTimerSeNecessario() {
  clearInterval(timerInterval);
  if (!sessao.tempoLimiteSegundos) return;
  timerInterval = setInterval(() => {
    sessao.tempoDecorridoSegundos++;
    const restante = tempoRestanteSegundos();
    const el = document.getElementById('resolverTimer');
    if (el) {
      el.textContent = '⏱️ ' + formatarMMSS(restante);
      el.classList.toggle('alerta', restante <= 60);
    }
    if (restante <= 0) { clearInterval(timerInterval); finalizarConjunto(true); }
  }, 1000);
}

function formatarMMSS(seg) {
  const m = Math.floor(seg / 60).toString().padStart(2, '0');
  const s = (seg % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function renderSessao() {
  const q = sessao.questoes[sessao.questaoAtualIndex];
  const todasRespondidas = sessao.questoes.every(x => x.respondida);

  wrap.innerHTML = `
    <div class="resolver-header">
      <h1>${sessao.conjuntoNome}</h1>
      <div class="resolver-progress">Questão ${sessao.questaoAtualIndex + 1} de ${sessao.questoes.length}</div>
      ${sessao.tempoLimiteSegundos ? `<div class="resolver-timer" id="resolverTimer">⏱️ ${formatarMMSS(tempoRestanteSegundos())}</div>` : ''}
    </div>
    <div class="resolver-layout">
      <div>
        <div class="qnav-grid" id="qnavGrid">
          ${sessao.questoes.map((x, i) => `<button class="qnav-btn ${x.respondida ? 'respondida' : ''} ${x.marcadaRevisao ? 'marcada' : ''} ${i === sessao.questaoAtualIndex ? 'atual' : ''}" data-ir="${i}">${i + 1}</button>`).join('')}
        </div>
        <div class="qnav-legenda">🟩 respondida &nbsp; ★ marcada para revisão &nbsp; contorno = atual</div>
      </div>
      <div>
        ${renderQuestaoCard(q)}
        <div class="resolver-rodape">
          <div style="display:flex; gap:10px;">
            <button class="q-btn secundario" id="btnAnterior" ${sessao.questaoAtualIndex === 0 ? 'disabled' : ''}>‹ Anterior</button>
            <button class="q-btn secundario" id="btnProxima" ${sessao.questaoAtualIndex === sessao.questoes.length - 1 ? 'disabled' : ''}>Próxima ›</button>
          </div>
          <button class="q-btn" id="btnEnviar" ${todasRespondidas ? '' : 'disabled'}>Enviar Conjunto</button>
        </div>
      </div>
    </div>
  `;

  ligarEventosSessao();
}

function renderQuestaoCard(q) {
  let corpo = '';
  if (q.tipo === 'escuta') corpo += `<button class="q-audio-btn" id="btnAudio">🔊 Ouvir áudio</button>`;
  if (q.visual) corpo += renderVisual(q.visual);
  if (q.texto) corpo += `<div class="q-texto">${q.texto}</div>`;
  corpo += `<div class="q-enunciado">${q.enunciado}</div>`;

  if (q.tipo === 'vf') {
    corpo += `<div class="q-vf-btns" id="respostaArea">
      <button data-valor="true" class="${q.respostaEscolhida === true ? 'selecionada' : ''}">Vrai</button>
      <button data-valor="false" class="${q.respostaEscolhida === false ? 'selecionada' : ''}">Faux</button>
    </div>`;
  } else {
    corpo += `<div class="q-opcoes" id="respostaArea">` + opcoesEmbaralhadas(q).map(op =>
      `<button class="q-opcao ${q.respostaEscolhida === op ? 'selecionada' : ''}" data-valor="${encodeURIComponent(op)}">${op}</button>`
    ).join('') + `</div>`;
  }

  corpo += `<div class="q-actions">
    <button class="q-btn secundario ${q.marcadaRevisao ? 'ativo' : ''}" id="btnMarcarRevisao">${q.marcadaRevisao ? '★ Marcada para revisão' : '☆ Marcar para revisão'}</button>
  </div>`;

  return `<div class="q-card">
    <div class="q-head">
      <span class="q-tags">
        <span class="q-tag">${NOMES_TIPO[q.tipo]}</span>
        <span class="q-pill">${q.nivel}</span>
        <span class="q-pill">${MATERIAS_LABELS[q.materia] || q.materia}</span>
      </span>
    </div>
    ${corpo}
  </div>`;
}

function ligarEventosSessao() {
  document.getElementById('qnavGrid').addEventListener('click', e => {
    const btn = e.target.closest('[data-ir]');
    if (btn) irParaQuestao(Number(btn.dataset.ir));
  });
  document.getElementById('btnAnterior').addEventListener('click', () => irParaQuestao(sessao.questaoAtualIndex - 1));
  document.getElementById('btnProxima').addEventListener('click', () => irParaQuestao(sessao.questaoAtualIndex + 1));
  document.getElementById('btnEnviar').addEventListener('click', () => tentarFinalizar());

  const audioBtn = document.getElementById('btnAudio');
  if (audioBtn) audioBtn.addEventListener('click', () => tocarAudio(sessao.questoes[sessao.questaoAtualIndex].audio));

  document.getElementById('respostaArea').addEventListener('click', e => {
    const opcaoBtn = e.target.closest('.q-opcao');
    if (opcaoBtn) return responderAtual(decodeURIComponent(opcaoBtn.dataset.valor));
    const vfBtn = e.target.closest('.q-vf-btns button');
    if (vfBtn) return responderAtual(vfBtn.dataset.valor === 'true');
  });

  document.getElementById('btnMarcarRevisao').addEventListener('click', () => marcarRevisaoAtual());
}

async function irParaQuestao(index) {
  if (index < 0 || index >= sessao.questoes.length) return;
  const res = await fetch(`/api/questoes/sessoes/${sessao._id}/atual`, {
    method: 'PATCH', headers: authHeaders(true), body: JSON.stringify({ index })
  });
  if (res.ok) { sessao = await res.json(); renderSessao(); }
}

async function responderAtual(valor) {
  const index = sessao.questaoAtualIndex;
  const res = await fetch(`/api/questoes/sessoes/${sessao._id}/questoes/${index}`, {
    method: 'PUT', headers: authHeaders(true), body: JSON.stringify({ respostaEscolhida: valor })
  });
  if (res.ok) { sessao = await res.json(); renderSessao(); }
}

async function marcarRevisaoAtual() {
  const index = sessao.questaoAtualIndex;
  const atual = sessao.questoes[index].marcadaRevisao;
  const res = await fetch(`/api/questoes/sessoes/${sessao._id}/questoes/${index}`, {
    method: 'PUT', headers: authHeaders(true), body: JSON.stringify({ marcadaRevisao: !atual })
  });
  if (res.ok) { sessao = await res.json(); renderSessao(); }
}

async function tentarFinalizar() {
  const res = await fetch(`/api/questoes/sessoes/${sessao._id}/finalizar`, { method: 'POST', headers: authHeaders() });
  const data = await res.json();
  if (res.status === 400 && data.questoesPendentes) {
    alert(`Ainda há ${data.questoesPendentes.length} questão(ões) sem resposta. Você será levado até a primeira pendente.`);
    return irParaQuestao(data.questoesPendentes[0]);
  }
  if (!res.ok) return alert(data.msg || 'Erro ao enviar o conjunto.');
  clearInterval(timerInterval);
  renderResultado(data);
}

async function finalizarConjunto(porTempo) {
  if (enviando) return;
  enviando = true;
  const res = await fetch(`/api/questoes/sessoes/${sessao._id}/finalizar`, { method: 'POST', headers: authHeaders() });
  const data = await res.json();
  if (res.ok) renderResultado(data);
  else erroTela(data.msg || 'Erro ao enviar o conjunto.');
}

// ===================== RESULTADO (gabarito) =====================

async function carregarResultado(tentativaId) {
  const res = await fetch(`/api/questoes/tentativas/${tentativaId}`, { headers: authHeaders() });
  if (!res.ok) return erroTela('Tentativa não encontrada.');
  renderResultado(await res.json());
}

function renderResultado(t) {
  const minutos = Math.round(t.tempoGastoSegundos / 60);
  wrap.innerHTML = `
    <div class="resultado-resumo">
      <h1 style="font-family:'Playfair Display', serif;">Resultado</h1>
      <div class="nota">${t.totalCorretas}/${t.totalQuestoes}</div>
      <p>${t.percentualAcertos}% de aproveitamento — ${minutos} min ${t.expirouPorTempo ? '(tempo esgotado)' : ''}</p>
      <div class="conjunto-acoes" style="justify-content:center; margin-top:16px;">
        <a class="q-btn secundario" href="plataforma-questoes.html">Voltar aos Conjuntos</a>
      </div>
    </div>
    <div class="resultado-lista">
      ${t.respostas.map((r, i) => renderItemResultado(r, i, t._id)).join('')}
    </div>
  `;
}

function renderItemResultado(r, i, tentativaId) {
  const textoResposta = valor => {
    if (valor === null || valor === undefined) return '<em>não respondida</em>';
    return r.tipo === 'vf' ? (valor ? 'Vrai' : 'Faux') : valor;
  };
  return `<div class="q-card">
    <div class="q-head">
      <span class="q-tags">
        <span class="q-tag">${NOMES_TIPO[r.tipo]}</span>
        <span class="q-pill">${r.nivel}</span>
        <span class="q-pill">${MATERIAS_LABELS[r.materia] || r.materia}</span>
      </span>
      <span class="q-status ${r.correta ? 'correta' : 'incorreta'}">${r.correta ? '✓ Acertou' : '✗ Errou'}</span>
    </div>
    ${r.visual ? renderVisual(r.visual) : ''}
    ${r.texto ? `<div class="q-texto">${r.texto}</div>` : ''}
    <div class="q-enunciado">${i + 1}. ${r.enunciado}</div>
    ${r.tipo === 'vf' ? `<div class="q-enunciado" style="font-weight:600;">Afirmação: « ${r.afirmacao} »</div>` : ''}
    <p>Sua resposta: ${textoResposta(r.respostaEscolhida)}</p>
    <p>Resposta certa: <strong>${textoResposta(r.respostaCorreta)}</strong></p>
    <div class="q-gabarito"><strong>Explicação:</strong> ${r.explicacao}</div>
    <div class="q-actions">
      <button class="q-btn secundario ${r.noCaderno ? 'ativo' : ''}" data-caderno-questao="${r.questaoId}" data-caderno-tentativa="${tentativaId}">${r.noCaderno ? '✓ No Caderno de Revisão' : '+ Adicionar ao Caderno de Revisão'}</button>
    </div>
  </div>`;
}

wrap.addEventListener('click', async e => {
  const btn = e.target.closest('[data-caderno-questao]');
  if (!btn) return;
  const questaoId = btn.dataset.cadernoQuestao;
  const tentativaId = btn.dataset.cadernoTentativa;
  const jaEsta = btn.classList.contains('ativo');
  const url = jaEsta ? `/api/questoes/caderno/${questaoId}` : `/api/questoes/tentativas/${tentativaId}/questoes/${questaoId}/caderno`;
  const res = await fetch(url, { method: jaEsta ? 'DELETE' : 'POST', headers: authHeaders() });
  if (res.ok) {
    btn.classList.toggle('ativo');
    btn.textContent = jaEsta ? '+ Adicionar ao Caderno de Revisão' : '✓ No Caderno de Revisão';
  }
});

// ===================== INIT =====================

if (tentativaIdParam) carregarResultado(tentativaIdParam);
else if (conjuntoIdParam) iniciarOuRetomarSessao();
else erroTela('Conjunto não especificado.');
