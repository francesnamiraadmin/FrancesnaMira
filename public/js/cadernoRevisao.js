// =====================================================================
// CADERNO DE REVISÃO — página própria (migrado de public/js/conjuntos.js)
// =====================================================================

function authHeaders(json) {
  const token = localStorage.getItem('token');
  return Object.assign({ Authorization: 'Bearer ' + token }, json ? { 'Content-Type': 'application/json' } : {});
}

function renderCadernoItem(item) {
  const q = item.questao;
  const textoResposta = valor => {
    if (valor === null || valor === undefined) return '';
    return q.tipo === 'vf' ? (valor ? 'Vrai' : 'Faux') : valor;
  };
  return `<div class="q-card">
    <div class="q-head">
      <span class="q-tags">
        <span class="q-tag">${NOMES_TIPO[q.tipo]}</span>
        <span class="q-pill">${MATERIAS_LABELS[q.materia] || q.materia}</span>
      </span>
    </div>
    ${q.visual ? renderVisual(q.visual) : ''}
    ${q.texto ? `<div class="q-texto">${q.texto}</div>` : ''}
    <div class="q-enunciado">${q.enunciado}</div>
    ${q.tipo === 'vf' ? `<div class="q-enunciado" style="font-weight:600;">Afirmação: « ${q.afirmacao} »</div>` : ''}
    <p>Resposta certa: <strong>${textoResposta(q.respostaCorreta)}</strong></p>
    <div class="q-gabarito show"><strong>Explicação:</strong> ${q.explicacao}</div>
    <div class="q-actions">
      <button class="q-btn secundario" data-remover-caderno="${item.questaoId}">Remover do Caderno</button>
    </div>
  </div>`;
}

async function carregarCaderno() {
  const alvo = document.getElementById('cadernoLista');
  alvo.innerHTML = '<p class="conjuntos-vazio">Carregando...</p>';
  try {
    const url = window.CursoContexto ? window.CursoContexto.urlComCurso('/api/questoes/caderno') : '/api/questoes/caderno';
    const res = await fetch(url, { headers: authHeaders() });
    const itens = res.ok ? await res.json() : [];
    alvo.innerHTML = itens.length
      ? itens.map(renderCadernoItem).join('')
      : '<p class="conjuntos-vazio">Nenhuma questão salva no Caderno de Revisão ainda. Depois de responder um conjunto, use "Adicionar ao Caderno de Revisão" na tela de resultado.</p>';
  } catch (err) {
    alvo.innerHTML = '<p class="conjuntos-vazio">Erro ao carregar o Caderno de Revisão.</p>';
  }
}

document.addEventListener('click', async e => {
  const btn = e.target.closest('[data-remover-caderno]');
  if (!btn) return;
  const res = await fetch(`/api/questoes/caderno/${btn.dataset.removerCaderno}`, { method: 'DELETE', headers: authHeaders() });
  if (res.ok) // Erros e palavras das produções (Ambiente de Produção, modelo "Modèles TCF"): as correções da IA
// e dos professores entram sozinhas no carnet de erros do aluno — e aparecem também aqui.
function escHtml(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
async function carregarCadernoProducao() {
  const alvo = document.getElementById('cadernoProducao');
  const curso = window.CursoContexto && window.CursoContexto.curso;
  try {
    const res = await fetch('/api/modeles/rpc/obterCarnet', { method: 'POST', headers: authHeaders(true), body: JSON.stringify({ args: [], courseType: curso || undefined }) });
    if (!res.ok) { alvo.hidden = true; return; }
    const itens = (await res.json()).r || [];
    const erros = itens.filter(x => x.tipo === 'erreur').reverse(), mots = itens.filter(x => x.tipo === 'mot'), sujets = itens.filter(x => x.tipo === 'sujet');
    const link = 'producao.html' + (curso ? '?curso=' + encodeURIComponent(curso) : '') + '#carnet';
    alvo.innerHTML = `<h2 class="cp-titulo">Erros das suas produções</h2>
      <p class="cp-sub">Correções feitas pela IA e pelos professores nas suas redações e produções orais do Ambiente de Produção. Quando não errar mais, marque como aprendido. <a href="${link}">Abrir o caderno completo →</a></p>
      ${erros.length ? erros.map(x => { const [a, b] = String(x.titre).split(' → ');
        return `<div class="q-card"><div class="cp-erro"><div><span class="cp-antes">${escHtml(a)}</span> → <span class="cp-depois">${escHtml(b || '')}</span>${x.detalhe ? `<p style="margin-top:8px;opacity:.85;">${escHtml(x.detalhe)}</p>` : ''}</div>
          <button class="q-btn secundario" data-remover-carnet="${escHtml(x.id)}">✓ Aprendido</button></div></div>`; }).join('')
        : '<p class="conjuntos-vazio">Nenhum erro de produção por enquanto. Os erros apontados nas correções aparecem aqui automaticamente.</p>'}
      ${mots.length ? `<h3 class="cp-titulo" style="font-size:1.25rem;">Palavras para lembrar</h3><div class="cp-mots">${mots.map(x => `<span class="cp-mot">${escHtml(x.titre)}${x.detalhe ? `<small>${escHtml(x.detalhe)}</small>` : ''}</span>`).join('')}</div>` : ''}
      ${sujets.length ? `<p class="cp-sub" style="margin-top:14px;">${sujets.length} modelo(s) salvo(s) para revisar no <a href="${link}">Ambiente de Produção</a>.</p>` : ''}`;
    alvo.hidden = false;
  } catch (err) { alvo.hidden = true; }
}
document.addEventListener('click', async e => {
  const btn = e.target.closest('[data-remover-carnet]');
  if (!btn) return;
  btn.disabled = true;
  const res = await fetch('/api/modeles/rpc/removerDoCarnet', { method: 'POST', headers: authHeaders(true), body: JSON.stringify({ args: [btn.dataset.removerCarnet] }) });
  if (res.ok) carregarCadernoProducao(); else btn.disabled = false;
});

carregarCaderno();
carregarCadernoProducao();
});

// Erros e palavras das produções (Ambiente de Produção, modelo "Modèles TCF"): as correções da IA
// e dos professores entram sozinhas no carnet de erros do aluno — e aparecem também aqui.
function escHtml(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
async function carregarCadernoProducao() {
  const alvo = document.getElementById('cadernoProducao');
  const curso = window.CursoContexto && window.CursoContexto.curso;
  try {
    const res = await fetch('/api/modeles/rpc/obterCarnet', { method: 'POST', headers: authHeaders(true), body: JSON.stringify({ args: [], courseType: curso || undefined }) });
    if (!res.ok) { alvo.hidden = true; return; }
    const itens = (await res.json()).r || [];
    const erros = itens.filter(x => x.tipo === 'erreur').reverse(), mots = itens.filter(x => x.tipo === 'mot'), sujets = itens.filter(x => x.tipo === 'sujet');
    const link = 'producao.html' + (curso ? '?curso=' + encodeURIComponent(curso) : '') + '#carnet';
    alvo.innerHTML = `<h2 class="cp-titulo">Erros das suas produções</h2>
      <p class="cp-sub">Correções feitas pela IA e pelos professores nas suas redações e produções orais do Ambiente de Produção. Quando não errar mais, marque como aprendido. <a href="${link}">Abrir o caderno completo →</a></p>
      ${erros.length ? erros.map(x => { const [a, b] = String(x.titre).split(' → ');
        return `<div class="q-card"><div class="cp-erro"><div><span class="cp-antes">${escHtml(a)}</span> → <span class="cp-depois">${escHtml(b || '')}</span>${x.detalhe ? `<p style="margin-top:8px;opacity:.85;">${escHtml(x.detalhe)}</p>` : ''}</div>
          <button class="q-btn secundario" data-remover-carnet="${escHtml(x.id)}">✓ Aprendido</button></div></div>`; }).join('')
        : '<p class="conjuntos-vazio">Nenhum erro de produção por enquanto. Os erros apontados nas correções aparecem aqui automaticamente.</p>'}
      ${mots.length ? `<h3 class="cp-titulo" style="font-size:1.25rem;">Palavras para lembrar</h3><div class="cp-mots">${mots.map(x => `<span class="cp-mot">${escHtml(x.titre)}${x.detalhe ? `<small>${escHtml(x.detalhe)}</small>` : ''}</span>`).join('')}</div>` : ''}
      ${sujets.length ? `<p class="cp-sub" style="margin-top:14px;">${sujets.length} modelo(s) salvo(s) para revisar no <a href="${link}">Ambiente de Produção</a>.</p>` : ''}`;
    alvo.hidden = false;
  } catch (err) { alvo.hidden = true; }
}
document.addEventListener('click', async e => {
  const btn = e.target.closest('[data-remover-carnet]');
  if (!btn) return;
  btn.disabled = true;
  const res = await fetch('/api/modeles/rpc/removerDoCarnet', { method: 'POST', headers: authHeaders(true), body: JSON.stringify({ args: [btn.dataset.removerCarnet] }) });
  if (res.ok) carregarCadernoProducao(); else btn.disabled = false;
});

carregarCaderno();
carregarCadernoProducao();
