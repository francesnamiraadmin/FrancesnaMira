// =====================================================================
// Sistema de Correção › « Correções de IA » e « Em Destaque ».
// Usa os utilitários de professor-correcoes.js (H, HJ, esc, fmtData, confirmar, mostrarView, euPronto).
//  - Correções de IA: toda produção corrigida pela IA (treinos e produções enviadas com correção
//    pela IA), com o texto do aluno, quem enviou e a correção completa.
//  - Em Destaque (administrador): por curso e mês, os temas de expressão oral e escrita em destaque.
//    Aparecem no topo do Ambiente de Produção dos alunos daquele curso e ficam liberados para eles.
// =====================================================================

// ---------------------------------------------------------------- Correções de IA
window.CorrecoesIA = (() => {
  let lista = [], atual = null, carregado = false;
  const TAREFA = { T1: 'Tâche 1 (oral)', T2: 'Tâche 2 (oral)', T3: 'Tâche 3 (oral)', ET1: 'Tâche 1 (écrite)', ET2: 'Tâche 2 (écrite)', ET3: 'Tâche 3 (écrite)' };
  const nomeTarefa = t => TAREFA[t] || t || '';
  const elLista = () => document.getElementById('ciaLista'), elDet = () => document.getElementById('ciaDetalhe');

  async function carregar(forcar) {
    if (carregado && !forcar) return desenharLista();
    elLista().innerHTML = '<div class="vazio-box">Carregando as correções…</div>';
    const mod = document.getElementById('ciaModalidade').value;
    const r = await fetch('/api/modeles/correcoes-ia' + (mod ? '?modalidade=' + mod : ''), { headers: H() });
    const d = await r.json().catch(() => []);
    if (!r.ok) { elLista().innerHTML = `<div class="vazio-box">${esc(d.msg || 'Erro ao carregar.')}</div>`; return; }
    lista = d; carregado = true;
    document.getElementById('contCorrecoesIA').textContent = lista.length;
    desenharLista();
  }
  function desenharLista() {
    const termo = document.getElementById('ciaBusca').value.trim().toLowerCase();
    const l = lista.filter(x => !termo || [x.aluno, x.email, x.sujet, nomeTarefa(x.tache)].some(v => String(v || '').toLowerCase().includes(termo)));
    elLista().innerHTML = l.map(x => `<div class="cia-item ${atual === x.id ? 'sel' : ''}" data-cia="${x.id}" tabindex="0" role="button">
        <div class="cia-topo"><b>${esc(x.aluno || x.email || 'Aluno')}</b><span class="cia-nota">${x.nota ?? '—'}<small style="display:inline;">/${x.escala}</small></span></div>
        <small>${x.modalidade === 'oral' ? '🎙️' : '✍️'} ${esc(nomeTarefa(x.tache))} · ${esc(x.origem)} · ${fmtData(x.data)}</small>
        <small>${esc(String(x.sujet || '').slice(0, 110))}</small></div>`).join('')
      || `<div class="vazio-box">${lista.length ? 'Nenhuma correção com esta busca.' : 'Nenhuma produção foi corrigida pela IA ainda.'}</div>`;
  }
  async function abrir(id) {
    atual = id; desenharLista();
    elDet().innerHTML = '<div class="vazio-box" style="border:none;">Carregando a correção…</div>';
    const r = await fetch('/api/modeles/correcoes-ia/' + id, { headers: H() });
    const c = await r.json();
    if (!r.ok) { elDet().innerHTML = `<div class="vazio-box" style="border:none;">${esc(c.msg || 'Erro ao abrir.')}</div>`; return; }
    elDet().innerHTML = html(c);
  }
  const lst = (titulo, l) => (l || []).length ? `<div><h3>${titulo}</h3><ul>${l.map(x => `<li>${esc(typeof x === 'string' ? x : (x.texte || x.texto || JSON.stringify(x)))}</li>`).join('')}</ul></div>` : '';
  function html(c) {
    const k = c.correcao || {}, escala = k.escala || 20;
    const num = v => { const m = /([\d.,]+)\s*\/\s*([\d.,]+)/.exec(String(v || '')); return m ? Number(m[1].replace(',', '.')) / Number(m[2].replace(',', '.')) : 0; };
    return `<div class="cia-det">
      <small style="color:var(--cinza-400);">${c.modalidade === 'oral' ? '🎙️ Produção oral' : '✍️ Produção escrita'} · ${esc(nomeTarefa(c.tache))} · ${c.producaoId ? 'produção enviada com correção pela IA' : 'treino corrigido pela IA'} · ${fmtData(c.data)}</small>
      <h2>${esc(c.sujet || 'Produção')}</h2>
      <p style="margin:4px 0 0;">Enviado por <b>${esc(c.aluno || '—')}</b> <span style="color:var(--cinza-400);">${esc(c.email || '')}</span></p>
      <div class="cia-bloco" style="display:flex; gap:18px; align-items:center; flex-wrap:wrap;">
        <div style="font-size:2rem; font-weight:800; color:var(--azul);">${c.nota ?? '—'}<small style="font-size:1rem; color:var(--cinza-400);">/${escala}</small></div>
        <div>${c.nclc ? '<b>NCLC ' + esc(c.nclc) + '</b><br>' : ''}${k.selo ? esc(k.selo) + '<br>' : ''}${c.mots ? c.mots + ' palavras<br>' : ''}<small>${esc(k.appreciation || '')}</small></div>
      </div>
      ${(k.criteres || []).length ? `<div class="cia-bloco"><h3>Critérios da prova</h3><div class="cia-crit">${k.criteres.map(x => `<span>${esc(x.nom || x.nome || x.critere || '')}</span><b>${esc(x.note || '')}</b>
        <div class="barra"><i style="width:${Math.round(num(x.note) * 100)}%"></i></div>${x.commentaire ? `<small style="grid-column:1/-1; margin:-4px 0 6px; color:var(--cinza-400);">${esc(x.commentaire)}</small>` : ''}`).join('')}</div></div>` : ''}
      <div class="cia-bloco"><h3>${c.modalidade === 'oral' ? 'Transcrição do aluno' : 'Texto do aluno'}</h3><div class="cia-texto" lang="fr">${esc(c.texte || '(sem texto)')}</div></div>
      ${(k.points_forts || []).length || (k.a_ameliorer || []).length ? `<div class="cia-bloco" style="display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:12px;">${lst('Pontos fortes', k.points_forts)}${lst('A melhorar', k.a_ameliorer)}</div>` : ''}
      ${(k.corrections || []).length ? `<div class="cia-bloco"><h3>Correções (${k.corrections.length})</h3>${k.corrections.map(x => `<div class="cia-corr"><s>${esc(x.original)}</s> → <ins>${esc(x.corrige)}</ins>${x.explication ? `<br><small>${esc(x.explication)}</small>` : ''}</div>`).join('')}</div>` : ''}
      ${(k.trame || []).length ? `<div class="cia-bloco"><h3>Trama Francês na Mira</h3><ul>${k.trame.map(x => `<li>${x.presente ? '✅' : '❌'} <b>${esc(x.etape)}</b>${x.commentaire ? ' · ' + esc(x.commentaire) : ''}</li>`).join('')}</ul></div>` : ''}
      ${(k.lexique || []).length ? `<div class="cia-bloco"><h3>Vocabulário sugerido</h3><ul>${k.lexique.map(x => `<li><b lang="fr">${esc(x.mot)}</b>${x.remplace ? ' (no lugar de « ' + esc(x.remplace) + ' »)' : ''}${x.exemple ? ' · <i lang="fr">' + esc(x.exemple) + '</i>' : ''}</li>`).join('')}</ul></div>` : ''}
      ${(k.connecteurs || []).length ? `<div class="cia-bloco">${lst('Conectores sugeridos', k.connecteurs)}</div>` : ''}
      ${k.version_amelioree ? `<div class="cia-bloco"><h3>Versão melhorada (IA)</h3><div class="cia-texto" lang="fr">${esc(k.version_amelioree)}</div></div>` : ''}
      ${k.conseil ? `<div class="cia-bloco"><h3>Conselho final</h3><p style="margin:0;">${esc(k.conseil)}</p></div>` : ''}
    </div>`;
  }
  document.getElementById('ciaLista').addEventListener('click', e => { const it = e.target.closest('[data-cia]'); if (it) abrir(it.dataset.cia); });
  document.getElementById('ciaLista').addEventListener('keydown', e => { const it = e.target.closest('[data-cia]'); if (it && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); abrir(it.dataset.cia); } });
  document.getElementById('ciaBusca').addEventListener('input', desenharLista);
  document.getElementById('ciaModalidade').addEventListener('change', () => carregar(true));
  document.getElementById('ciaAtualizar').addEventListener('click', () => carregar(true));
  return { carregar, abrir };
})();

// ---------------------------------------------------------------- Em Destaque (admin)
window.EmDestaqueAdm = (() => {
  let dados = null, perfil = 'TCF', mes = new Date().toISOString().slice(0, 7);
  const filtro = { tache: '', busca: '' }, marcados = new Set();
  const raiz = () => document.getElementById('destaqueEditor');
  const nomeMes = m => { const [a, n] = m.split('-').map(Number); const s = new Date(a, n - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }); return s.charAt(0).toUpperCase() + s.slice(1); };

  async function carregar(msg) {
    raiz().innerHTML = '<div class="vazio-box" style="border:none;">Carregando…</div>';
    const r = await fetch(`/api/modeles/destaques-admin?perfil=${encodeURIComponent(perfil)}&mes=${mes}`, { headers: H() });
    const d = await r.json();
    if (!r.ok) { raiz().innerHTML = `<div class="vazio-box" style="border:none;">${esc(d.msg || 'Erro ao carregar.')}</div>`; return; }
    dados = d; marcados.clear();
    desenhar(msg);
  }
  function desenhar(msg) {
    const d = dados, ja = new Set(d.itens.map(x => x.sujetId));
    const escrita = new Set(d.taches.filter(t => t.escrita).map(t => t.id));
    const nomeT = t => (d.taches.find(x => x.id === t) || {}).nome || t;
    const col = (titulo, l) => `<div class="emd-adm-col"><h3>${titulo} <small style="opacity:.7;">(${l.length})</small></h3>${l.map(x => `<div class="emd-adm-item"><span><b>${esc(x.titre || x.sujetId)}</b><small>${esc(nomeT(x.tache))}${x.eixo ? ' · ' + esc(x.eixo) : ''}${x.por ? ' · por ' + esc(x.por) : ''}</small></span><button type="button" data-emd-del="${x.id}" title="Tirar do destaque">Tirar</button></div>`).join('') || '<p style="opacity:.75; font-size:.84rem; margin:0;">Nenhum tema em destaque.</p>'}</div>`;
    const cat = d.catalogo.filter(x => !ja.has(x.id) && (!filtro.tache || x.tache === filtro.tache) && (!filtro.busca || (x.t + ' ' + x.eixo + ' ' + x.id).toLowerCase().includes(filtro.busca)));
    const grupos = d.taches.map(t => { const g = cat.filter(x => x.tache === t.id).slice(0, 150); return g.length ? `<div class="tm-grupo">${esc(t.nome)} (${g.length})</div>` + g.map(x => `<label class="tm-tema ${marcados.has(x.id) ? 'marcado' : ''}"><input type="checkbox" class="tm-check" data-emd-marca="${esc(x.id)}" ${marcados.has(x.id) ? 'checked' : ''}><span class="tm-tema-txt"><b>${esc(x.t)}</b><small>${esc(x.eixo)}${x.f > 1 ? ' · caiu ' + x.f + '×' : ''}</small></span></label>`).join('') : ''; }).join('');
    raiz().innerHTML = `
      <div class="tm-cab"><div><h2 style="margin:0;">★ Em Destaque</h2><small style="color:var(--cinza-400);">Os temas em destaque aparecem no topo do Ambiente de Produção dos alunos do curso escolhido, acima do sorteio, e ficam liberados automaticamente para eles durante o mês.</small></div></div>
      <div class="emd-adm-topo">
        <label>Curso<select data-emd-perfil>${d.perfis.map(p => `<option value="${esc(p.id)}" ${p.id === d.perfil ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}</select></label>
        <label>Mês<input type="month" data-emd-mes value="${esc(d.mes)}"></label>
      </div>
      <p class="msg-inline ${msg && msg.erro ? 'erro' : 'sucesso'}" style="display:${msg ? 'block' : 'none'};">${msg ? esc(msg.texto) : ''}</p>
      <h3 style="margin:0 0 8px;">Em destaque em ${esc(nomeMes(d.mes))} · ${esc(d.nomePerfil)}</h3>
      <div class="emd-adm-atual">${col('🎙 Expression orale', d.itens.filter(x => !escrita.has(x.tache)))}${col('✍ Expression écrite', d.itens.filter(x => escrita.has(x.tache)))}</div>
      <div class="tm-col"><h3>Adicionar temas ao destaque <small style="font-weight:400; color:var(--cinza-400);">${cat.length} disponível(is)</small></h3>
        <div class="tm-filtros"><select data-emd-ft aria-label="Tarefa"><option value="">Todas as tarefas</option>${d.taches.map(t => `<option value="${t.id}" ${filtro.tache === t.id ? 'selected' : ''}>${esc(t.nome)}</option>`).join('')}</select>
          <input type="search" data-emd-busca placeholder="Buscar tema" value="${esc(filtro.busca)}"></div>
        <div class="tm-barra ${marcados.size ? 'on' : ''}"><span>${marcados.size ? `<b>${marcados.size}</b> tema(s) marcado(s)` : 'Marque os temas (orais e escritos) e coloque todos em destaque de uma vez.'}</span>
          ${marcados.size ? '<button class="btn secundario pequeno" type="button" data-emd-limpar>Desmarcar</button><button class="btn pequeno" type="button" data-emd-add>Pôr ' + marcados.size + ' em destaque</button>' : ''}</div>
        <div class="tm-lista" id="emdCatalogo">${grupos || '<p style="padding:10px; opacity:.7;">Nenhum tema com estes filtros.</p>'}</div></div>`;
  }
  const el = () => raiz();
  el().addEventListener('change', e => {
    if (e.target.matches('[data-emd-perfil]')) { perfil = e.target.value; carregar(); return; }
    if (e.target.matches('[data-emd-mes]')) { if (/^\d{4}-\d{2}$/.test(e.target.value)) { mes = e.target.value; carregar(); } return; }
    if (e.target.matches('[data-emd-ft]')) { filtro.tache = e.target.value; desenhar(); return; }
    if (e.target.matches('[data-emd-marca]')) {
      e.target.checked ? marcados.add(e.target.dataset.emdMarca) : marcados.delete(e.target.dataset.emdMarca);
      const pos = document.getElementById('emdCatalogo').scrollTop; desenhar(); document.getElementById('emdCatalogo').scrollTop = pos;
    }
  });
  el().addEventListener('input', e => {
    if (!e.target.matches('[data-emd-busca]')) return;
    filtro.busca = e.target.value.toLowerCase().trim(); desenhar();
    const n = el().querySelector('[data-emd-busca]'); n.focus(); n.setSelectionRange(n.value.length, n.value.length);
  });
  el().addEventListener('click', async e => {
    const b = e.target.closest('[data-emd-add],[data-emd-limpar],[data-emd-del]');
    if (!b) return;
    e.preventDefault();
    if (b.hasAttribute('data-emd-limpar')) { marcados.clear(); return desenhar(); }
    b.disabled = true;
    if (b.hasAttribute('data-emd-add')) {
      const porId = new Map(dados.catalogo.map(x => [x.id, x]));
      const sujets = [...marcados].map(id => ({ tache: porId.get(id).tache, id }));
      const r = await fetch('/api/modeles/destaques-admin', { method: 'POST', headers: HJ(), body: JSON.stringify({ perfil: dados.perfil, mes: dados.mes, sujets }) });
      const out = await r.json();
      return r.ok ? carregar({ texto: out.msg }) : desenhar({ erro: true, texto: out.msg || 'Erro ao salvar.' });
    }
    if (b.dataset.emdDel) {
      if (!(await confirmar('Tirar do destaque?', 'O tema sai do « Em Destaque » deste mês. Se ele não estiver liberado de outro jeito, o aluno deixa de vê-lo.', 'Tirar'))) { b.disabled = false; return; }
      const r = await fetch('/api/modeles/destaques-admin/' + b.dataset.emdDel, { method: 'DELETE', headers: H() });
      return r.ok ? carregar({ texto: 'Tema retirado do destaque.' }) : desenhar({ erro: true, texto: 'Erro ao retirar.' });
    }
  });
  return { carregar };
})();

euPronto.then(() => {
  if (window.__eu?.role === 'admin') document.getElementById('abaDestaque').hidden = false;
  if (location.hash === '#correcoes-ia') mostrarView('correcoesia');
  if (location.hash === '#destaque' && window.__eu?.role === 'admin') mostrarView('destaque');
});
