// ===================== GESTÃO DE ALUNOS › DEVERES COMPLETOS =====================
// O catálogo dos deveres completos (blocos de questões corrigidos na hora, com explicação e áudio
// Coqui), que antes ficava numa página própria do Painel da equipe. « Ver » abre como o aluno vê;
// « Usar num dever » leva ao Criar Dever.
(function () {
  const raiz = document.getElementById('viewCompletos');
  if (!raiz) return;
  const H = () => ({ Authorization: 'Bearer ' + localStorage.getItem('token') });
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const CORES = { A1: '#16a34a', A2: '#65a30d', B1: '#f59e0b', B2: '#ea580c', C1: '#db2777', C2: '#7c3aed' };
  let lista = null, nivel = '', busca = '';

  function desenhar() {
    const niveis = [...new Set(lista.map(x => x.nivel).filter(Boolean))].sort();
    const l = lista.filter(x => (!nivel || x.nivel === nivel) && (!busca || (x.titulo + ' ' + (x.descricao || '')).toLowerCase().includes(busca)));
    raiz.innerHTML = `<section class="card dc-cab"><div><h2>Deveres completos</h2><p>Blocos de questões corrigidos na hora, com explicação em cada questão e áudio. Use-os no <b>Criar Dever</b>: o aluno faz o exercício dentro da aba do dever e a nota fica registrada.</p></div>
        <div class="dc-filtros"><div class="cd-chips pequeno"><button type="button" data-nv="" class="${!nivel ? 'on' : ''}">Todos ${lista.length}</button>${niveis.map(n => `<button type="button" data-nv="${n}" class="${nivel === n ? 'on' : ''}">${n} ${lista.filter(x => x.nivel === n).length}</button>`).join('')}</div>
        <input type="search" id="dcBusca" placeholder="Buscar dever completo" value="${esc(busca)}"></div></section>
      <div class="dc-galeria">${l.map(x => `<article class="dc-item" style="--c:${CORES[x.nivel] || '#4f46e5'}">
        <div class="dc-topo"><span class="dc-nv">${esc(x.nivel || '—')}</span>${x.modo === 'prova' ? '<span class="dc-prova">prova</span>' : ''}</div>
        <h3>${esc(x.titulo)}</h3>${x.descricao ? `<p>${esc(String(x.descricao).slice(0, 180))}${String(x.descricao).length > 180 ? '…' : ''}</p>` : ''}
        <div class="dc-meta"><span>📝 ${x.questoes ? x.questoes + ' questões' : (x.regras || 0) + ' regras'}</span><span>📑 ${x.partes.length} parte(s)</span></div>
        <div class="dc-partes">${x.partes.slice(0, 5).map(p => `<span>${esc(p)}</span>`).join('')}${x.partes.length > 5 ? `<span>+${x.partes.length - 5}</span>` : ''}</div>
        <div class="dc-acoes"><a class="btn secundario pequeno" href="exercicio.html?slug=${encodeURIComponent(x.slug)}" target="_blank" rel="noopener">Ver como o aluno ↗</a><button type="button" class="btn pequeno" data-usar="${esc(x.slug)}">Usar num dever</button></div>
      </article>`).join('') || '<p class="cd-vazio">Nenhum dever completo com estes filtros.</p>'}</div>`;
  }
  raiz.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.nv !== undefined) { nivel = b.dataset.nv; desenhar(); return; }
    if (b.dataset.usar) {
      document.querySelector('#navPrincipal [data-nav="criar"]').click();
      setTimeout(() => { const t = document.querySelector('#viewCriar [data-painel="completos"]'); if (t && !t.classList.contains('on')) t.click(); }, 50);
    }
  });
  raiz.addEventListener('input', e => {
    if (e.target.id !== 'dcBusca') return;
    busca = e.target.value.toLowerCase().trim(); const pos = e.target.selectionStart;
    desenhar(); const n = document.getElementById('dcBusca'); n.focus(); try { n.setSelectionRange(pos, pos); } catch (x) { /* ok */ }
  });
  window.DeveresCompletos = {
    async abrir() {
      if (!lista) {
        raiz.innerHTML = '<p class="cd-vazio">Carregando…</p>';
        const r = await fetch('/api/exercicios', { headers: H() });
        lista = r.ok ? await r.json() : [];
      }
      desenhar();
    }
  };
})();
