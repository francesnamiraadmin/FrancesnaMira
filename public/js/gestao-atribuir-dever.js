// ===================== GESTÃO DE ALUNOS › ATRIBUIR DEVER =====================
// No alto, a « Atribuição-base » de cada curso: o Plano-Base que todo aluno que entra no plano
// daquele curso recebe sozinho. Embaixo, um aluno de cada vez: os Planos-Base ativos dele, os
// deveres já atribuídos (com remover) e « Adicionar dever » (um Plano-Base inteiro, uma semana
// de um plano, ou um dever novo pelo construtor).
(function () {
  const raiz = document.getElementById('viewAtribuirDever');
  if (!raiz) return;
  const H = json => Object.assign({ Authorization: 'Bearer ' + localStorage.getItem('token') }, json ? { 'Content-Type': 'application/json' } : {});
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = s => raiz.querySelector(s);
  const hoje = (d = 0) => { const x = new Date(Date.now() + d * 864e5); return new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
  const fmt = d => d ? new Date(d).toLocaleDateString('pt-BR') : '—';
  const CORES = { TCF: '#2563eb', DELF: '#db2777', DALF: '#7c3aed', TEF: '#0d9488', A1: '#16a34a', A2: '#65a30d', B1: '#f59e0b', B2: '#ea580c' };
  const STATUS = { em_andamento: ['Em andamento', 'and'], atrasado: ['Atrasado', 'atr'], concluido: ['Concluído', 'ok'] };
  let alunos = null, planos = [], bases = [], sel = null;

  async function json(url, op) { const r = await fetch(url, Object.assign({ headers: H(op && op.body) }, op || {})); const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.msg || 'Erro.'); return d; }
  function aviso(txt, erro) { const el = $('#adAviso'); el.textContent = txt; el.className = 'ad-aviso ' + (erro ? 'erro' : 'ok'); el.hidden = false; clearTimeout(aviso.t); aviso.t = setTimeout(() => { el.hidden = true; }, 6000); }

  function montar() {
    raiz.innerHTML = `
      <section class="card ad-bases"><div class="ad-cab"><div><h2>Atribuição-base por curso</h2><p>O aluno que entra no plano do curso já recebe estes deveres: as semanas do Plano-Base vão sendo liberadas uma por semana, a partir do dia em que ele entra.</p></div>
        <button type="button" class="btn secundario pequeno" data-ir-criar>+ Criar Plano-Base</button></div>
        <div class="ad-grade-bases" id="adBases"><p class="cd-vazio">Carregando…</p></div></section>
      <p class="ad-aviso" id="adAviso" hidden></p>
      <div class="ad-layout">
        <section class="card ad-lista"><h2>Alunos</h2><input type="search" id="adBusca" placeholder="Buscar aluno…"><div id="adAlunos"><p class="cd-vazio">Carregando…</p></div></section>
        <section class="card ad-aluno" id="adAluno"><div class="ad-vazio"><span>👈</span><p>Escolha um aluno para ver, remover e adicionar deveres.</p></div></section>
      </div>`;
  }
  function desenharBases() {
    $('#adBases').innerHTML = bases.map(b => `<div class="ad-base" style="--c:${CORES[b.curso] || '#475569'}">
      <div class="ad-base-cab"><b>${esc(b.curso)}</b><small>${b.plano ? `${b.alunos} aluno(s) recebendo` : 'sem Atribuição-base'}</small></div>
      <select data-base="${b.curso}" aria-label="Plano-Base do ${esc(b.curso)}"><option value="">— nenhum —</option>${planos.map(p => `<option value="${p._id}" ${b.plano && String(b.plano._id) === String(p._id) ? 'selected' : ''}>${esc(p.nome)} (${p.totalSemanas} sem.)</option>`).join('')}</select>
      <div class="ad-base-acoes"><button type="button" class="btn pequeno" data-salvar-base="${b.curso}">Salvar</button>${b.plano ? `<button type="button" class="btn secundario pequeno" data-aplicar-base="${b.curso}" title="Atribuir agora a quem já tem o plano ${esc(b.curso)}">Aplicar aos alunos atuais</button>` : ''}</div></div>`).join('');
  }
  function desenharAlunos() {
    const b = ($('#adBusca').value || '').toLowerCase();
    const l = (alunos || []).filter(a => !b || (a.nome + ' ' + a.email).toLowerCase().includes(b));
    $('#adAlunos').innerHTML = l.map(a => `<button type="button" class="ad-al ${sel && String(sel._id) === String(a._id) ? 'on' : ''}" data-aluno="${a._id}">
      <span class="av">${esc((a.nome || '?').trim().charAt(0).toUpperCase())}</span><span><b>${esc(a.nome)}</b><small>${esc(a.email)}${a.ativoLista ? '' : ' · expirado'}</small></span></button>`).join('') || '<p class="cd-vazio">Nenhum aluno encontrado.</p>';
  }
  async function abrirAluno(id) {
    sel = (alunos || []).find(a => String(a._id) === String(id)) || { _id: id, nome: '', email: '' };
    desenharAlunos();
    const el = $('#adAluno');
    el.innerHTML = '<p class="cd-vazio">Carregando os deveres do aluno…</p>';
    // os deveres primeiro: a rota aplica a Atribuição-base do curso e libera as semanas que já chegaram
    const dev = await json(`/api/deveres/alunos/${id}/deveres`).catch(() => []);
    const atr = await json(`/api/deveres/alunos/${id}/atribuicoes`).catch(() => []);
    const deveres = (Array.isArray(dev) ? dev : dev.deveres || []).slice().sort((a, b) => new Date(b.dataInicio) - new Date(a.dataInicio));
    el.innerHTML = `<div class="ad-aluno-cab"><span class="av grande">${esc((sel.nome || '?').charAt(0).toUpperCase())}</span><div><h2>${esc(sel.nome)}</h2><small>${esc(sel.email)}</small>
        <div class="ad-cursos">${(sel.planos || []).filter(p => p.ativo).map(p => `<span>${esc(p.curso || p.nome || '')}</span>`).join('')}</div></div></div>
      <h3>➕ Adicionar dever</h3>
      <div class="ad-add">
        <div class="ad-add-op"><b>Um Plano-Base inteiro</b><small>As semanas chegam uma por semana a partir do início.</small>
          <select id="adPlano"><option value="">Escolha o Plano-Base…</option>${planos.map(p => `<option value="${p._id}">${esc(p.nome)} · ${p.totalSemanas} sem.${p.curso ? ' · ' + esc(p.curso) : ''}</option>`).join('')}</select>
          <label>Início <input type="date" id="adPlanoIni" value="${hoje()}"></label><button type="button" class="btn pequeno" data-atribuir-plano>Atribuir plano</button></div>
        <div class="ad-add-op"><b>Uma semana de um plano</b><small>Vira um dever avulso, com o prazo que você escolher.</small>
          <select id="adPlanoSem"><option value="">Escolha o Plano-Base…</option>${planos.map(p => `<option value="${p._id}">${esc(p.nome)}</option>`).join('')}</select>
          <select id="adSemana"><option value="">Semana…</option></select>
          <span class="ad-datas"><label>Início <input type="date" id="adSemIni" value="${hoje()}"></label><label>Prazo <input type="date" id="adSemFim" value="${hoje(7)}"></label></span>
          <button type="button" class="btn pequeno" data-atribuir-semana>Atribuir semana</button></div>
        <div class="ad-add-op destaque"><b>Um dever novo</b><small>Monte no construtor, já com este aluno marcado.</small><button type="button" class="btn pequeno" data-criar-para="${id}">Abrir o Criar Dever →</button></div>
      </div>
      <h3>🗓️ Planos-Base ativos <small>${atr.length}</small></h3>
      ${atr.length ? `<div class="ad-planos">${atr.map(a => `<div class="ad-plano"><div><b>${esc(a.plano ? a.plano.nome : 'Plano removido')}</b><small>${a.origem === 'base' ? `<span class="ad-tag">Atribuição-base ${esc(a.curso)}</span> · ` : ''}desde ${fmt(a.dataInicio)}${a.plano ? ' · ' + a.plano.semanas + ' semana(s)' : ''}</small></div>
        <button type="button" class="btn secundario pequeno" data-parar="${a._id}">Interromper</button></div>`).join('')}</div>` : '<p class="cd-vazio">Nenhum Plano-Base ativo.</p>'}
      <h3>📋 Deveres atribuídos <small>${deveres.length}</small></h3>
      ${deveres.length ? `<div class="ad-deveres">${deveres.map(d => { const tot = d.atividades.length, f = d.atividades.filter(a => a.entrega && a.entrega.status === 'enviado').length, st = STATUS[d.status] || ['', ''];
        return `<div class="ad-dever"><div class="ad-dever-txt"><b>${esc(d.titulo)}</b><small>${d.curso ? esc(d.curso) + ' · ' : ''}${fmt(d.dataInicio)} → ${fmt(d.dataLimite)} · ${tot} atividade(s)${d.loteId ? ' · enviado pelo construtor' : d.planoBaseId ? ' · Plano-Base' : ''}</small>
          <span class="cd-bar"><i style="width:${tot ? Math.round(f / tot * 100) : 0}%"></i></span></div><span class="ad-st ${st[1]}">${st[0]} · ${f}/${tot}</span>
          <button type="button" class="btn secundario pequeno" data-remover="${d._id}" data-titulo="${esc(d.titulo)}">Remover</button></div>`; }).join('')}</div>` : '<p class="cd-vazio">Nenhum dever atribuído.</p>'}`;
  }

  raiz.addEventListener('click', async e => {
    const t = e.target.closest('button'); if (!t) return;
    const d = t.dataset;
    try {
      if (d.aluno) { abrirAluno(d.aluno); return; }
      if ('irCriar' in d) { document.querySelector('#navPrincipal [data-nav="criar"]').click(); return; }
      if (d.criarPara) { document.querySelector('#navPrincipal [data-nav="criar"]').click(); window.CriarDever && window.CriarDever.abrir({ alunoId: d.criarPara }); return; }
      if (d.salvarBase) {
        const v = raiz.querySelector(`[data-base="${d.salvarBase}"]`).value;
        const r = await json('/api/deveres/atribuicoes-base/' + d.salvarBase, { method: 'PUT', body: JSON.stringify({ planoBaseId: v || null }) });
        aviso(r.msg); await carregarBases(); return;
      }
      if (d.aplicarBase) { t.disabled = true; const r = await json(`/api/deveres/atribuicoes-base/${d.aplicarBase}/aplicar`, { method: 'POST', body: '{}' }); aviso(r.msg); await carregarBases(); if (sel) abrirAluno(sel._id); return; }
      if ('atribuirPlano' in d) {
        const p = $('#adPlano').value; if (!p) { aviso('Escolha o Plano-Base.', true); return; }
        const r = await json(`/api/deveres/alunos/${sel._id}/atribuir-modelo`, { method: 'POST', body: JSON.stringify({ planoBaseId: p, modo: 'plano', dataInicio: $('#adPlanoIni').value }) });
        aviso(r.msg); abrirAluno(sel._id); return;
      }
      if ('atribuirSemana' in d) {
        const p = $('#adPlanoSem').value, s = $('#adSemana').value; if (!p || !s) { aviso('Escolha o Plano-Base e a semana.', true); return; }
        const r = await json(`/api/deveres/alunos/${sel._id}/atribuir-modelo`, { method: 'POST', body: JSON.stringify({ planoBaseId: p, modo: 'semana', semana: Number(s), dataInicio: $('#adSemIni').value, dataLimite: $('#adSemFim').value }) });
        aviso(r.msg); abrirAluno(sel._id); return;
      }
      if (d.parar) { if (!(await Dialogo.confirmar('Interromper este Plano-Base para o aluno? As semanas já liberadas continuam com ele.'))) return; const r = await json('/api/deveres/atribuicoes/' + d.parar, { method: 'DELETE' }); aviso(r.msg); abrirAluno(sel._id); return; }
      if (d.remover) { if (!(await Dialogo.confirmar(`Remover « ${d.titulo} » deste aluno? As entregas deste dever também somem.`))) return; const r = await json('/api/deveres/deveres/' + d.remover, { method: 'DELETE' }); aviso(r.msg); abrirAluno(sel._id); }
    } catch (err) { aviso(err.message, true); t.disabled = false; }
  });
  raiz.addEventListener('input', e => { if (e.target.id === 'adBusca') desenharAlunos(); });
  raiz.addEventListener('change', async e => {
    if (e.target.id !== 'adPlanoSem') return;
    const s = $('#adSemana'); s.innerHTML = '<option value="">Semana…</option>';
    if (!e.target.value) return;
    const p = await json('/api/deveres/planos-base/' + e.target.value).catch(() => null);
    if (p) s.innerHTML = '<option value="">Semana…</option>' + p.semanas.slice().sort((a, b) => a.numero - b.numero).map(x => `<option value="${x.numero}">Semana ${x.numero} · ${esc(x.titulo)} (${x.atividades.length})</option>`).join('');
  });

  async function carregarBases() {
    [planos, bases] = await Promise.all([json('/api/deveres/planos-base').catch(() => []), json('/api/deveres/atribuicoes-base').catch(() => [])]);
    desenharBases();
  }
  async function carregar() {
    montar();
    await carregarBases();
    const [a, x] = await Promise.all(['ativo', 'expirado'].map(st => json('/api/equipe/alunos?status=' + st).catch(() => ({}))));
    alunos = [...(a.alunos || []).map(v => ({ ...v, ativoLista: true })), ...(x.alunos || [])];
    desenharAlunos();
  }
  window.AtribuirDever = { abrir(alunoId) { carregar().then(() => { if (alunoId) abrirAluno(alunoId); }); } };
})();
