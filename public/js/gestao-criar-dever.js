// ===================== GESTÃO DE ALUNOS › CRIAR DEVER =====================
// Construtor de deveres: escolhe o curso, junta elementos de todo o site (questões da Plataforma,
// produções do Ambiente de Produção, aulas gravadas, deveres completos, orientações) e
//  - envia como um dever para os alunos escolhidos (um « lote », editável depois), ou
//  - salva como Plano-Base de várias semanas, cada semana com o seu dever (editável depois).
// O aluno faz tudo numa aba própria (dever.html). Rotas: /api/deveres/criar/*, /api/deveres/lotes.
(function () {
  const raiz = document.getElementById('viewCriar');
  if (!raiz) return;
  const H = json => Object.assign({ Authorization: 'Bearer ' + localStorage.getItem('token') }, json ? { 'Content-Type': 'application/json' } : {});
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = s => raiz.querySelector(s);
  const hoje = (d = 0) => { const x = new Date(Date.now() + d * 864e5); return new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
  const CURSOS = ['TCF', 'DELF', 'DALF', 'TEF', 'A1', 'A2', 'B1', 'B2'];
  const NIVEIS_DELF = ['A1', 'A2', 'B1', 'B2'];
  const TIPOS = {
    questoes: { ic: '❓', nome: 'Questões da Plataforma', cor: '#2563eb', sub: 'Conjuntos prontos ou questões sorteadas por nível' },
    producao: { ic: '✍️', nome: 'Produções do Ambiente', cor: '#db2777', sub: 'Temas de escrita e de oral, por tarefa e eixo' },
    aulas: { ic: '▶️', nome: 'Aulas gravadas', cor: '#16a34a', sub: 'Uma aula ou um módulo inteiro' },
    completos: { ic: '🧩', nome: 'Deveres completos', cor: '#4f46e5', sub: 'Blocos de questões corrigidos na hora' },
    orientacao: { ic: '📝', nome: 'Orientação / leitura', cor: '#f59e0b', sub: 'Um texto ou link para o aluno ler' }
  };
  const GRUPO = { questoes_plataforma: 'questoes', producao_textual: 'producao', producao_oral: 'producao', assistir_aula: 'aulas', assistir_modulo: 'aulas', exercicio_interativo: 'completos', leitura: 'orientacao', texto: 'orientacao', link_externo: 'orientacao' };
  const MIN_ESTIMADO = { questoes: 20, producao: 40, aulas: 30, completos: 35, orientacao: 10 };

  // ---------- estado ----------
  const S = {
    modo: 'dever', curso: 'TCF', nivel: 'B1', cat: null, painel: null, editando: null,
    semanas: [{ titulo: 'Semana 1', itens: [] }], semana: 0,
    alunos: null, alunosSel: new Set(), soDoCurso: true,
    filtros: { tache: '', eixo: '', busca: '', buscaConj: '', buscaAula: '', buscaComp: '' }
  };
  const itens = () => S.semanas[S.semana].itens;

  // ---------- carregamento ----------
  async function carregarCatalogo() {
    $('#cdPainel').innerHTML = '<p class="cd-vazio">Carregando o catálogo do curso…</p>';
    const r = await fetch(`/api/deveres/criar/catalogo?curso=${S.curso}&nivel=${S.curso === 'DELF' ? S.nivel : ''}`, { headers: H() });
    S.cat = r.ok ? await r.json() : null;
    S.filtros.tache = ''; S.filtros.eixo = '';
    desenharPainel();
  }
  async function carregarAlunos() {
    if (S.alunos) return;
    const [a, e] = await Promise.all(['ativo', 'expirado'].map(st => fetch('/api/equipe/alunos?status=' + st, { headers: H() }).then(r => r.ok ? r.json() : {}).catch(() => ({}))));
    S.alunos = [...(a.alunos || []).map(x => ({ ...x, ativoLista: true })), ...(e.alunos || [])];
  }

  // ---------- desenho geral ----------
  function montar() {
    raiz.innerHTML = `
      <section class="cd-heroi">
        <div><small>Gestão de Alunos</small><h2>Criar Dever</h2><p>Monte um dever com tudo o que o site oferece. O aluno faz cada elemento numa aba própria, e as respostas entram nas estatísticas dele.</p></div>
        <div class="cd-modos" role="tablist">
          <button type="button" data-modo="dever" class="${S.modo === 'dever' ? 'on' : ''}">📬 Dever para alunos</button>
          <button type="button" data-modo="plano" class="${S.modo === 'plano' ? 'on' : ''}">🗓️ Plano-Base de várias semanas</button>
          <button type="button" data-biblioteca>📚 Criados (editar)</button>
        </div>
      </section>
      ${S.editando ? `<div class="cd-editando">✏️ Editando ${S.editando.tipo === 'lote' ? 'o dever enviado' : 'o Plano-Base'} <b>${esc(S.editando.nome)}</b> <button type="button" class="btn secundario pequeno" data-cancelar-edicao>Começar um novo</button></div>` : ''}
      <div class="cd-layout">
        <div class="cd-main">
          <section class="card cd-passo"><div class="passo"><span class="n">1</span><h2>Para qual curso?</h2></div>
            <div class="cd-chips" id="cdCursos">${CURSOS.map(c => `<button type="button" data-curso="${c}" class="${S.curso === c ? 'on' : ''}">${c}</button>`).join('')}</div>
            <div class="cd-chips cd-niveis" id="cdNivel" ${S.curso === 'DELF' ? '' : 'hidden'}><span>Nível do DELF:</span>${NIVEIS_DELF.map(n => `<button type="button" data-nivel="${n}" class="${S.nivel === n ? 'on' : ''}">${n}</button>`).join('')}</div>
          </section>
          ${S.modo === 'plano' ? `<section class="card cd-passo"><div class="passo"><span class="n">2</span><h2>Semanas do plano</h2></div><div id="cdSemanas"></div></section>` : ''}
          <section class="card cd-passo"><div class="passo"><span class="n">${S.modo === 'plano' ? 3 : 2}</span><h2>O que vai ${S.modo === 'plano' ? 'nesta semana' : 'no dever'}?</h2></div>
            <div class="cd-tiles">${Object.entries(TIPOS).map(([k, t]) => `<button type="button" class="cd-tile ${S.painel === k ? 'on' : ''}" data-painel="${k}" style="--c:${t.cor}"><span class="ic">${t.ic}</span><b>${t.nome}</b><small>${t.sub}</small></button>`).join('')}</div>
            <div id="cdPainel" class="cd-painel"></div>
          </section>
          <section class="card cd-passo" id="cdFinal"></section>
        </div>
        <aside class="cd-resumo" id="cdResumo"></aside>
      </div>
      <div id="cdBiblioteca" class="cd-biblioteca" hidden></div>`;
    desenharSemanas(); desenharPainel(); desenharFinal(); desenharResumo();
  }

  function desenharSemanas() {
    const el = $('#cdSemanas'); if (!el) return;
    el.innerHTML = `<div class="cd-semanas">${S.semanas.map((s, i) => `<button type="button" data-semana="${i}" class="${i === S.semana ? 'on' : ''}">S${i + 1}<small>${s.itens.length} item(ns)</small></button>`).join('')}
        <button type="button" class="cd-mais" data-nova-semana>+ Semana</button></div>
      <div class="cd-semana-cab"><label>Título da semana ${S.semana + 1}<input type="text" id="cdTituloSemana" maxlength="150" value="${esc(S.semanas[S.semana].titulo)}"></label>
        <span>${S.semanas.length > 1 ? `<button type="button" class="btn secundario pequeno" data-duplicar-semana>Duplicar</button> <button type="button" class="btn secundario pequeno" data-apagar-semana>Apagar semana</button>` : `<button type="button" class="btn secundario pequeno" data-duplicar-semana>Duplicar</button>`}</span></div>`;
  }

  // ---------- painéis de escolha ----------
  function desenharPainel() {
    const el = $('#cdPainel'); if (!el) return;
    const c = S.cat;
    if (!S.painel) { el.innerHTML = '<p class="cd-dica">Escolha acima o tipo de elemento. Você pode misturar quantos quiser: o aluno faz tudo na mesma aba.</p>'; return; }
    if (!c) { el.innerHTML = '<p class="cd-vazio">Carregando…</p>'; return; }
    const ja = new Set(itens().map(chave));
    if (S.painel === 'questoes') {
      const l = c.conjuntos.filter(x => !S.filtros.buscaConj || (x.nome + ' ' + (x.descricao || '')).toLowerCase().includes(S.filtros.buscaConj));
      el.innerHTML = `<div class="cd-cols">
        <div><h3>Sortear questões <small>${c.provas ? 'do banco do ' + esc(c.curso) + ', por nível' : 'do curso ' + esc(c.curso)}</small></h3>
          <div class="cd-chips pequeno" id="cdSortNiveis">${c.niveis.map(n => `<button type="button" data-sn="${n}" class="${c.niveis.length === 1 ? 'on' : ''}">${n}</button>`).join('')}</div>
          ${c.provas ? '' : `<div class="cd-chips pequeno" id="cdSortMat">${Object.entries(c.materias).map(([k, n]) => `<button type="button" data-sm="${k}">${esc(n)}</button>`).join('')}</div><small class="cd-dica">Sem matéria marcada = todas.</small>`}
          <div class="cd-linha"><label>Quantidade <select id="cdSortQtd">${[10, 15, 20, 30, 40].map(q => `<option>${q}</option>`).join('')}</select></label>
            <label style="flex:1">Título <input type="text" id="cdSortTitulo" placeholder="Ex.: Revisão de gramática B1"></label></div>
          <button type="button" class="btn" data-add-sorteio>+ Adicionar questões sorteadas</button></div>
        <div><h3>Conjuntos prontos <small>${c.conjuntos.length}</small></h3><input type="search" class="cd-busca" data-f="buscaConj" placeholder="Buscar conjunto" value="${esc(S.filtros.buscaConj)}">
          <div class="cd-lista">${l.map(x => linhaItem({ tipo: 'questoes_plataforma', conteudo: { conjuntoId: x._id }, titulo: x.nome }, `<b>${esc(x.nome)}</b><small>${x.quantidadeQuestoes} questões${x.filtros && x.filtros.niveis && x.filtros.niveis.length ? ' · ' + x.filtros.niveis.join(', ') : ''}</small>`, ja)).join('') || '<p class="cd-vazio">Nenhum conjunto oficial deste curso.</p>'}</div></div></div>`;
    } else if (S.painel === 'producao') {
      const eixos = [...new Map(c.sujets.map(s => [s.e, s.eixo])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
      const l = c.sujets.filter(s => (!S.filtros.tache || s.tache === S.filtros.tache) && (!S.filtros.eixo || s.e === S.filtros.eixo) && (!S.filtros.busca || (s.t + ' ' + s.eixo).toLowerCase().includes(S.filtros.busca)));
      const nomeT = Object.fromEntries(c.taches.map(t => [t.id, t]));
      el.innerHTML = `<div class="cd-filtros"><div class="cd-chips pequeno"><button type="button" data-ft="" class="${!S.filtros.tache ? 'on' : ''}">Todas</button>${c.taches.map(t => `<button type="button" data-ft="${t.id}" class="${S.filtros.tache === t.id ? 'on' : ''}">${t.escrita ? '✍️' : '🎙️'} ${esc(t.nome)}</button>`).join('')}</div>
          <div class="cd-linha"><select data-fe><option value="">Todos os eixos</option>${eixos.map(([k, n]) => `<option value="${esc(k)}" ${S.filtros.eixo === k ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select><input type="search" class="cd-busca" data-f="busca" placeholder="Buscar tema" value="${esc(S.filtros.busca)}"></div></div>
        <p class="cd-dica">${l.length} tema(s). O aluno escreve (ou grava) na própria aba do dever; a produção vai para o Sistema de Correção.</p>
        <div class="cd-lista alta">${l.slice(0, 120).map(s => { const t = nomeT[s.tache] || {};
          return linhaItem({ tipo: t.escrita ? 'producao_textual' : 'producao_oral', conteudo: { tache: s.tache, sujetId: s.id }, titulo: `${t.nome || s.tache} · ${s.t}`.slice(0, 190) },
            `<b>${esc(s.t)}</b><small>${t.escrita ? '✍️' : '🎙️'} ${esc(t.nome || s.tache)} · ${esc(s.eixo)}${s.f > 1 ? ' · caiu ' + s.f + '×' : ''}</small>`, ja); }).join('') || '<p class="cd-vazio">Nenhum tema com estes filtros.</p>'}
          ${l.length > 120 ? `<p class="cd-dica">Mostrando 120 de ${l.length}. Use os filtros.</p>` : ''}</div>`;
    } else if (S.painel === 'aulas') {
      const b = S.filtros.buscaAula;
      const mods = c.modulos.map(m => ({ ...m, aulas: m.aulas.filter(a => !b || (a.titulo + ' ' + m.titulo).toLowerCase().includes(b)) })).filter(m => !b || m.aulas.length || m.titulo.toLowerCase().includes(b));
      el.innerHTML = `<input type="search" class="cd-busca" data-f="buscaAula" placeholder="Buscar aula ou módulo" value="${esc(b)}">${c.todosOsModulos ? '<p class="cd-dica">Nenhum módulo marcado com este curso: mostrando todos.</p>' : ''}
        <div class="cd-lista alta">${mods.map(m => `<div class="cd-modulo"><div class="cd-mod-cab"><b>🎬 ${esc(m.titulo)}</b><small>${m.aulas.length} aula(s)${m.curso ? ' · ' + esc(m.curso) : ''}</small>
          ${botaoAdd({ tipo: 'assistir_modulo', conteudo: { moduloId: m._id }, titulo: 'Assistir o módulo: ' + m.titulo }, ja, 'Módulo inteiro')}</div>
          ${m.aulas.map(a => linhaItem({ tipo: 'assistir_aula', conteudo: { aulaId: a._id }, titulo: 'Assistir: ' + a.titulo }, `<b>▶️ ${esc(a.titulo)}</b>${a.duracaoSegundos ? `<small>${Math.round(a.duracaoSegundos / 60)} min</small>` : ''}`, ja)).join('')}</div>`).join('') || '<p class="cd-vazio">Nenhuma aula encontrada.</p>'}</div>`;
    } else if (S.painel === 'completos') {
      const b = S.filtros.buscaComp;
      const l = c.exercicios.filter(x => !b || (x.titulo + ' ' + (x.nivel || '') + ' ' + (x.descricao || '')).toLowerCase().includes(b));
      el.innerHTML = `<input type="search" class="cd-busca" data-f="buscaComp" placeholder="Buscar dever completo" value="${esc(b)}">
        <div class="cd-grade-comp">${l.map(x => { const it = { tipo: 'exercicio_interativo', conteudo: { exercicioSlug: x.slug }, titulo: x.titulo };
          return `<div class="cd-comp ${ja.has(chave(it)) ? 'ja' : ''}"><span class="cd-nivel">${esc(x.nivel || '—')}</span><b>${esc(x.titulo)}</b><small>${x.questoes ? x.questoes + ' questões' : (x.regras || 0) + ' regras'} · ${x.partes.length} parte(s)${x.modo === 'prova' ? ' · prova' : ''}</small>
            <span class="cd-comp-acoes"><a href="exercicio.html?slug=${encodeURIComponent(x.slug)}" target="_blank" rel="noopener">ver ↗</a>${botaoAdd(it, ja)}</span></div>`; }).join('') || '<p class="cd-vazio">Nenhum dever completo encontrado.</p>'}</div>`;
    } else if (S.painel === 'orientacao') {
      el.innerHTML = `<div class="cd-orient"><label>Título<input type="text" id="cdOriTitulo" maxlength="150" placeholder="Ex.: Leia antes de começar"></label>
        <label>Texto para o aluno<textarea id="cdOriTexto" rows="4" placeholder="Orientações, dicas, um texto para leitura…"></textarea></label>
        <label>Link (opcional)<input type="url" id="cdOriUrl" placeholder="https://"></label>
        <button type="button" class="btn" data-add-orient>+ Adicionar orientação</button></div>`;
    }
  }
  const chave = it => { const c = it.conteudo || {}; return it.tipo + '|' + (c.conjuntoId || c.sujetId || c.aulaId || c.moduloId || c.exercicioSlug || (c.sorteio ? JSON.stringify(c.sorteio) + it.titulo : it.titulo)); };
  const guardados = new Map();
  function botaoAdd(it, ja, rotulo) {
    const k = chave(it); guardados.set(k, it);
    return ja.has(k) ? '<span class="cd-ja">✓ no dever</span>' : `<button type="button" class="cd-add" data-add="${esc(k)}">+ ${esc(rotulo || 'Adicionar')}</button>`;
  }
  const linhaItem = (it, html, ja) => `<div class="cd-linha-item ${ja.has(chave(it)) ? 'ja' : ''}"><span>${html}</span>${botaoAdd(it, ja)}</div>`;

  function adicionar(it) {
    S.msg = null;
    itens().push({ obrigatoria: true, descricao: '', ...it, conteudo: { ...(it.conteudo || {}) } });
    desenharPainel(); desenharResumo(); desenharSemanas();
    const r = $('#cdResumo .cd-itens'); if (r) r.lastElementChild?.classList.add('novo');
  }

  // ---------- passo final ----------
  function desenharFinal() {
    const el = $('#cdFinal'); if (!el) return;
    const n = S.modo === 'plano' ? 4 : 3;
    if (S.modo === 'plano') {
      const p = S.plano || (S.plano = { nome: '', descricao: '' });
      el.innerHTML = `<div class="passo"><span class="n">${n}</span><h2>Nome do Plano-Base</h2></div>
        <div class="campo-row"><div class="campo"><label>Nome</label><input type="text" id="cdPlanoNome" maxlength="150" value="${esc(p.nome)}" placeholder="Ex.: TCF Canada · 8 semanas rumo ao B2"></div></div>
        <div class="campo"><label>Descrição (opcional)</label><textarea id="cdPlanoDesc" placeholder="Para quem é este plano e como ele avança.">${esc(p.descricao)}</textarea></div>
        <p class="cd-dica">Depois de salvo, atribua o plano a um aluno (ou como Atribuição-base do curso) na aba « Atribuir Dever ». Cada semana é liberada no seu dia.</p>`;
      return;
    }
    const d = S.dever || (S.dever = { titulo: '', descricao: '', dataInicio: hoje(), dataLimite: hoje(7), prioridade: 'media', permite: false });
    el.innerHTML = `<div class="passo"><span class="n">${n}</span><h2>Para quais alunos e até quando?</h2></div>
      <div class="campo-row"><div class="campo" style="flex:2"><label>Título do dever</label><input type="text" id="cdTitulo" maxlength="150" value="${esc(d.titulo)}" placeholder="Ex.: Semana de revisão · Tâche 3"></div>
        <div class="campo"><label>Início</label><input type="date" id="cdInicio" value="${d.dataInicio}"></div><div class="campo"><label>Prazo</label><input type="date" id="cdPrazo" value="${d.dataLimite}"></div>
        <div class="campo"><label>Prioridade</label><select id="cdPrioridade">${[['media', 'Média'], ['alta', 'Alta'], ['baixa', 'Baixa']].map(([v, r]) => `<option value="${v}" ${d.prioridade === v ? 'selected' : ''}>${r}</option>`).join('')}</select></div></div>
      <div class="campo"><label>Mensagem para o aluno (opcional)</label><textarea id="cdDescricao" placeholder="Ex.: Comecem pelas questões e deixem a produção para o fim.">${esc(d.descricao)}</textarea></div>
      <label class="checkbox-row"><input type="checkbox" id="cdPermite" ${d.permite ? 'checked' : ''}> Permitir concluir com atividades obrigatórias pendentes</label>
      <div class="cd-alunos-cab"><input type="search" id="cdBuscaAluno" placeholder="Buscar aluno…"><label class="checkbox-row" style="margin:0"><input type="checkbox" id="cdSoCurso" ${S.soDoCurso ? 'checked' : ''}> Só alunos do ${esc(S.curso)}</label>
        <button type="button" class="btn secundario pequeno" data-todos-alunos>Marcar os da lista</button><button type="button" class="btn secundario pequeno" data-limpar-alunos>Limpar</button></div>
      <div class="cd-alunos" id="cdAlunos"><p class="cd-vazio">Carregando alunos…</p></div>`;
    carregarAlunos().then(desenharAlunos);
  }
  function alunosVisiveis() {
    const b = ($('#cdBuscaAluno')?.value || '').toLowerCase();
    return (S.alunos || []).filter(a => (!b || (a.nome + ' ' + a.email).toLowerCase().includes(b)) &&
      (!S.soDoCurso || (a.planos || []).some(p => String(p.curso || p.courseType || '').toUpperCase().includes(S.curso)) || a.provaAlvo === S.curso || S.alunosSel.has(String(a._id))));
  }
  function desenharAlunos() {
    const el = $('#cdAlunos'); if (!el) return;
    const l = alunosVisiveis();
    el.innerHTML = l.length ? l.map(a => `<label class="${S.alunosSel.has(String(a._id)) ? 'on' : ''}"><input type="checkbox" data-al="${a._id}" ${S.alunosSel.has(String(a._id)) ? 'checked' : ''}>
      <span class="av">${esc((a.nome || '?').trim().charAt(0).toUpperCase())}</span><span><b>${esc(a.nome)}</b><small>${esc(a.email)}${a.ativoLista ? '' : ' · plano expirado'}</small></span></label>`).join('')
      : `<p class="cd-vazio">Nenhum aluno ${S.soDoCurso ? 'do ' + esc(S.curso) + ' ' : ''}encontrado.${S.soDoCurso ? ' Desmarque « Só alunos do curso » para ver todos.' : ''}</p>`;
    desenharResumo();
  }

  // ---------- resumo lateral ----------
  function desenharResumo() {
    const el = $('#cdResumo'); if (!el) return;
    const l = itens();
    const cont = {}; l.forEach(i => { const g = GRUPO[i.tipo] || 'orientacao'; cont[g] = (cont[g] || 0) + 1; });
    const todos = S.modo === 'plano' ? S.semanas.flatMap(s => s.itens) : l;
    const min = todos.reduce((t, i) => t + (MIN_ESTIMADO[GRUPO[i.tipo] || 'orientacao'] || 15), 0);
    const pronto = S.modo === 'plano' ? S.semanas.every(s => s.itens.length) : (l.length && S.alunosSel.size);
    el.innerHTML = `<div class="cd-resumo-cab"><small>${S.modo === 'plano' ? `Semana ${S.semana + 1} de ${S.semanas.length}` : 'Seu dever'}</small><h3>${l.length} elemento(s)</h3>
        <div class="cd-contagem">${Object.entries(TIPOS).filter(([k]) => cont[k]).map(([k, t]) => `<span style="--c:${t.cor}">${t.ic} ${cont[k]}</span>`).join('') || '<span class="vazio">vazio</span>'}</div>
        <small>⏱️ cerca de ${min >= 60 ? Math.floor(min / 60) + ' h ' + (min % 60 ? min % 60 + ' min' : '') : min + ' min'}${S.modo === 'plano' ? ' no plano todo' : ''}</small></div>
      <ol class="cd-itens">${l.map((it, i) => { const g = TIPOS[GRUPO[it.tipo] || 'orientacao'];
        return `<li style="--c:${g.cor}"><span class="ic">${g.ic}</span><div><input type="text" value="${esc(it.titulo)}" data-tit="${i}" aria-label="Título do elemento ${i + 1}">
          <label><input type="checkbox" data-obr="${i}" ${it.obrigatoria !== false ? 'checked' : ''}> obrigatório</label></div>
          <span class="acoes"><button type="button" data-sobe="${i}" ${i ? '' : 'disabled'} aria-label="Subir">↑</button><button type="button" data-desce="${i}" ${i < l.length - 1 ? '' : 'disabled'} aria-label="Descer">↓</button><button type="button" data-tira="${i}" aria-label="Retirar">✕</button></span></li>`; }).join('')}</ol>
      ${l.length ? '' : '<p class="cd-vazio">Adicione elementos pelos cartões ao lado.</p>'}
      ${S.modo === 'dever' ? `<p class="cd-para">👥 ${S.alunosSel.size} aluno(s) escolhido(s)</p>` : ''}
      <button type="button" class="btn cd-salvar" data-salvar ${pronto ? '' : 'disabled'}>${S.modo === 'plano' ? (S.editando ? 'Salvar alterações do plano' : 'Salvar Plano-Base') : (S.editando ? 'Salvar alterações do dever' : `Enviar para ${S.alunosSel.size || '…'} aluno(s)`)}</button>
      <p class="cd-msg ${S.msg ? S.msg.cls : ''}" id="cdMsg">${S.msg ? esc(S.msg.txt) : ''}</p>`;
  }

  // ---------- salvar ----------
  const paraApi = it => ({ tipo: it.tipo, titulo: it.titulo, descricao: it.descricao || '', obrigatoria: it.obrigatoria !== false, conteudo: it.conteudo });
  async function salvar() {
    const msg = $('#cdMsg'), btn = raiz.querySelector('[data-salvar]');
    lerCampos();
    btn.disabled = true; msg.className = 'cd-msg'; msg.textContent = 'Salvando…'; S.msg = null;
    let url, metodo, corpo;
    if (S.modo === 'plano') {
      corpo = { nome: S.plano.nome, descricao: S.plano.descricao, curso: S.curso, nivel: S.nivel, semanas: S.semanas.map(s => ({ titulo: s.titulo, atividades: s.itens.map(paraApi) })) };
      url = S.editando ? '/api/deveres/criar/planos-base/' + S.editando.id : '/api/deveres/criar/planos-base'; metodo = S.editando ? 'PUT' : 'POST';
    } else {
      const d = S.dever;
      corpo = { titulo: d.titulo, descricao: d.descricao, dataInicio: d.dataInicio, dataLimite: d.dataLimite, prioridade: d.prioridade, permiteConclusaoManual: d.permite, curso: S.curso, nivel: S.nivel, alunoIds: [...S.alunosSel], atividades: itens().map(paraApi) };
      url = S.editando ? '/api/deveres/lotes/' + S.editando.id : '/api/deveres/lotes'; metodo = S.editando ? 'PUT' : 'POST';
    }
    try {
      const r = await fetch(url, { method: metodo, headers: H(true), body: JSON.stringify(corpo) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.msg || 'Não foi possível salvar.');
      // a mensagem fica no estado: o resumo é redesenhado (ex.: quando a lista de alunos recarrega)
      S.msg = { cls: 'ok', txt: '✓ ' + (d.msg || 'Salvo.') };
      if (!S.editando) {
        if (S.modo === 'plano' && d.plano) S.editando = { tipo: 'plano', id: d.plano._id, nome: d.plano.nome };
        if (S.modo === 'dever' && d.loteId) S.editando = { tipo: 'lote', id: d.loteId, nome: S.dever.titulo };
        montar();
      } else desenharResumo();
    } catch (e) { S.msg = { cls: 'erro', txt: e.message }; desenharResumo(); }
    finally { const b = raiz.querySelector('[data-salvar]'); if (b) b.disabled = false; }
  }
  function lerCampos() {
    if (S.modo === 'plano') { if ($('#cdPlanoNome')) { S.plano.nome = $('#cdPlanoNome').value.trim(); S.plano.descricao = $('#cdPlanoDesc').value.trim(); } return; }
    if (!$('#cdTitulo')) return;
    Object.assign(S.dever, { titulo: $('#cdTitulo').value.trim(), descricao: $('#cdDescricao').value.trim(), dataInicio: $('#cdInicio').value, dataLimite: $('#cdPrazo').value, prioridade: $('#cdPrioridade').value, permite: $('#cdPermite').checked });
  }

  // ---------- biblioteca: deveres enviados e Planos-Base, para editar ----------
  async function abrirBiblioteca() {
    const el = $('#cdBiblioteca'); el.hidden = false;
    el.innerHTML = '<p class="cd-vazio">Carregando…</p>';
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const [lotes, planos] = await Promise.all(['/api/deveres/lotes', '/api/deveres/planos-base'].map(u => fetch(u, { headers: H() }).then(r => r.ok ? r.json() : []).catch(() => [])));
    el.innerHTML = `<div class="cd-bib-cab"><h3>📚 Deveres e Planos-Base criados</h3><button type="button" class="btn secundario pequeno" data-fechar-bib>Fechar</button></div>
      <div class="cd-cols"><div><h4>Deveres enviados <small>${lotes.length}</small></h4>${lotes.map(l => `<div class="cd-bib-item"><div><b>${esc(l.titulo)}</b><small>${l.curso ? esc(l.curso) + ' · ' : ''}${l.alunos} aluno(s) · ${l.concluidos} concluíram · prazo ${new Date(l.dataLimite).toLocaleDateString('pt-BR')}</small>
          <span class="cd-bar"><i style="width:${l.alunos ? Math.round(l.concluidos / l.alunos * 100) : 0}%"></i></span></div>
          <span><button type="button" class="btn pequeno" data-editar-lote="${l.loteId}">Editar</button> <button type="button" class="btn secundario pequeno" data-apagar-lote="${l.loteId}">Apagar</button></span></div>`).join('') || '<p class="cd-vazio">Nenhum dever enviado pelo construtor ainda.</p>'}</div>
        <div><h4>Planos-Base <small>${planos.length}</small></h4>${planos.map(p => `<div class="cd-bib-item"><div><b>${esc(p.nome)}</b><small>${p.curso ? esc(p.curso) + ' · ' : ''}${p.totalSemanas} semana(s) · ${p.totalAtividades} atividade(s) · ${p.totalAlunos} aluno(s)</small></div>
          <span><button type="button" class="btn pequeno" data-editar-plano="${p._id}">Editar</button> <button type="button" class="btn secundario pequeno" data-duplicar-plano="${p._id}">Duplicar</button> <button type="button" class="btn secundario pequeno" data-apagar-plano="${p._id}">Apagar</button></span></div>`).join('') || '<p class="cd-vazio">Nenhum Plano-Base ainda.</p>'}</div></div>`;
  }
  const deApi = a => {
    const c = a.conteudo || {}, id = v => v && v._id ? v._id : v;
    const conteudo = {};
    ['conjuntoId', 'temaId', 'aulaId', 'moduloId'].forEach(k => { if (c[k]) conteudo[k] = String(id(c[k])); });
    ['exercicioSlug', 'tache', 'sujetId', 'perfil', 'url', 'texto'].forEach(k => { if (c[k]) conteudo[k] = c[k]; });
    if (conteudo.tache && conteudo.sujetId) delete conteudo.temaId;
    return { tipo: a.tipo, titulo: a.titulo, descricao: a.descricao || '', obrigatoria: a.obrigatoria !== false, conteudo };
  };
  async function editarLote(loteId) {
    const r = await fetch('/api/deveres/lotes/' + loteId, { headers: H() });
    const d = await r.json(); if (!r.ok) { (await Dialogo.aviso(d.msg || 'Erro.')); return; }
    Object.assign(S, { modo: 'dever', curso: d.curso || 'TCF', semanas: [{ titulo: 'Semana 1', itens: d.atividades.map(deApi) }], semana: 0, painel: null, soDoCurso: false,
      editando: { tipo: 'lote', id: loteId, nome: d.titulo }, alunosSel: new Set(d.alunos.map(a => a.alunoId)),
      dever: { titulo: d.titulo, descricao: d.descricao, dataInicio: String(d.dataInicio).slice(0, 10), dataLimite: String(d.dataLimite).slice(0, 10), prioridade: d.prioridade, permite: d.permiteConclusaoManual } });
    montar(); carregarCatalogo(); window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  async function editarPlano(id) {
    const r = await fetch('/api/deveres/planos-base/' + id, { headers: H() });
    const p = await r.json(); if (!r.ok) { (await Dialogo.aviso(p.msg || 'Erro.')); return; }
    const perfil = (p.semanas.flatMap(s => s.atividades).map(a => a.conteudo && a.conteudo.perfil).find(Boolean)) || '';
    Object.assign(S, { modo: 'plano', curso: p.curso || 'TCF', nivel: perfil.startsWith('DELF-') ? perfil.slice(5) : S.nivel, painel: null, semana: 0,
      semanas: p.semanas.slice().sort((a, b) => a.numero - b.numero).map(s => ({ titulo: s.titulo, itens: s.atividades.map(deApi) })),
      editando: { tipo: 'plano', id, nome: p.nome }, plano: { nome: p.nome, descricao: p.descricao || '' } });
    montar(); carregarCatalogo(); window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function novo(modo) {
    Object.assign(S, { modo, editando: null, painel: null, semana: 0, semanas: [{ titulo: 'Semana 1', itens: [] }], alunosSel: new Set(), dever: null, plano: null, soDoCurso: true });
    montar(); desenharPainel();
  }

  // ---------- eventos ----------
  raiz.addEventListener('click', async e => {
    const t = e.target.closest('button, [data-add]'); if (!t) return;
    const d = t.dataset;
    if (d.modo) { lerCampos(); if (S.editando && !(await Dialogo.confirmar('Sair da edição e começar um novo?'))) return; novo(d.modo); return; }
    if ('biblioteca' in d) { abrirBiblioteca(); return; }
    if ('fecharBib' in d) { $('#cdBiblioteca').hidden = true; return; }
    if ('cancelarEdicao' in d) { novo(S.modo); return; }
    if (d.curso) { lerCampos(); S.curso = d.curso; montar(); carregarCatalogo(); return; }
    if (d.nivel) { lerCampos(); S.nivel = d.nivel; montar(); carregarCatalogo(); return; }
    if (d.painel) { lerCampos(); S.painel = S.painel === d.painel ? null : d.painel; raiz.querySelectorAll('[data-painel]').forEach(b => b.classList.toggle('on', b.dataset.painel === S.painel)); desenharPainel(); return; }
    if (d.add) { const it = guardados.get(d.add); if (it) adicionar(it); return; }
    if ('addSorteio' in d) {
      const niveis = [...raiz.querySelectorAll('#cdSortNiveis .on')].map(b => b.dataset.sn), materias = [...raiz.querySelectorAll('#cdSortMat .on')].map(b => b.dataset.sm);
      if (!niveis.length) { (await Dialogo.aviso('Escolha pelo menos um nível.')); return; }
      const q = Number($('#cdSortQtd').value), tit = $('#cdSortTitulo').value.trim();
      adicionar({ tipo: 'questoes_plataforma', titulo: tit || `${q} questões sorteadas · ${niveis.join('+')}`, conteudo: { sorteio: { niveis, materias, quantidade: q } } });
      return;
    }
    if (d.sn || d.sm) { t.classList.toggle('on'); return; }
    if (d.ft !== undefined) { S.filtros.tache = d.ft; desenharPainel(); return; }
    if ('addOrient' in d) {
      const titulo = $('#cdOriTitulo').value.trim(), texto = $('#cdOriTexto').value.trim(), url = $('#cdOriUrl').value.trim();
      if (!titulo || (!texto && !url)) { (await Dialogo.aviso('Escreva o título e o texto (ou o link).')); return; }
      adicionar({ tipo: url && !texto ? 'link_externo' : 'leitura', titulo, conteudo: { texto, url } }); return;
    }
    if (d.semana) { lerSemana(); S.semana = Number(d.semana); desenharSemanas(); desenharPainel(); desenharResumo(); return; }
    if ('novaSemana' in d) { lerSemana(); S.semanas.push({ titulo: `Semana ${S.semanas.length + 1}`, itens: [] }); S.semana = S.semanas.length - 1; desenharSemanas(); desenharPainel(); desenharResumo(); return; }
    if ('duplicarSemana' in d) { lerSemana(); const s = S.semanas[S.semana]; S.semanas.splice(S.semana + 1, 0, { titulo: s.titulo + ' (cópia)', itens: s.itens.map(i => ({ ...i, conteudo: { ...i.conteudo } })) }); S.semana++; desenharSemanas(); desenharPainel(); desenharResumo(); return; }
    if ('apagarSemana' in d) { if (!(await Dialogo.confirmar('Apagar a semana ' + (S.semana + 1) + '?'))) return; S.semanas.splice(S.semana, 1); S.semana = Math.max(0, S.semana - 1); desenharSemanas(); desenharPainel(); desenharResumo(); return; }
    if (d.sobe || d.desce || d.tira) {
      const l = itens(), i = Number(d.sobe || d.desce || d.tira);
      if (d.tira) l.splice(i, 1); else { const j = d.sobe ? i - 1 : i + 1; [l[i], l[j]] = [l[j], l[i]]; }
      desenharResumo(); desenharPainel(); desenharSemanas(); return;
    }
    if ('todosAlunos' in d) { alunosVisiveis().forEach(a => S.alunosSel.add(String(a._id))); desenharAlunos(); return; }
    if ('limparAlunos' in d) { S.alunosSel.clear(); desenharAlunos(); return; }
    if ('salvar' in d) { salvar(); return; }
    if (d.editarLote) { editarLote(d.editarLote); return; }
    if (d.editarPlano) { editarPlano(d.editarPlano); return; }
    if (d.apagarLote) { if (!(await Dialogo.confirmar('Apagar este dever de todos os alunos? As entregas dele também somem.'))) return; await fetch('/api/deveres/lotes/' + d.apagarLote, { method: 'DELETE', headers: H() }); abrirBiblioteca(); return; }
    if (d.duplicarPlano) { await fetch('/api/deveres/planos-base/' + d.duplicarPlano + '/duplicar', { method: 'POST', headers: H() }); abrirBiblioteca(); return; }
    if (d.apagarPlano) { if (!(await Dialogo.confirmar('Apagar este Plano-Base? Quem já recebeu as semanas continua com elas.'))) return; await fetch('/api/deveres/planos-base/' + d.apagarPlano, { method: 'DELETE', headers: H() }); abrirBiblioteca(); }
  });
  const lerSemana = () => { const i = $('#cdTituloSemana'); if (i) S.semanas[S.semana].titulo = i.value.trim() || `Semana ${S.semana + 1}`; };
  raiz.addEventListener('input', e => {
    const t = e.target;
    if (t.dataset.f) { S.filtros[t.dataset.f] = t.value.toLowerCase().trim(); const pos = t.selectionStart; desenharPainel(); const n = raiz.querySelector(`[data-f="${t.dataset.f}"]`); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (x) { /* ok */ } } return; }
    if (t.dataset.tit !== undefined) { itens()[Number(t.dataset.tit)].titulo = t.value; return; }
    if (t.id === 'cdBuscaAluno') { desenharAlunos(); return; }
    if (t.id === 'cdTituloSemana') { S.semanas[S.semana].titulo = t.value; return; }
  });
  raiz.addEventListener('change', e => {
    const t = e.target;
    if (t.matches('[data-fe]')) { S.filtros.eixo = t.value; desenharPainel(); return; }
    if (t.dataset.obr !== undefined) { itens()[Number(t.dataset.obr)].obrigatoria = t.checked; return; }
    if (t.dataset.al) { if (t.checked) S.alunosSel.add(t.dataset.al); else S.alunosSel.delete(t.dataset.al); t.closest('label').classList.toggle('on', t.checked); desenharResumo(); return; }
    if (t.id === 'cdSoCurso') { S.soDoCurso = t.checked; desenharAlunos(); }
  });

  // aberto pela navegação da Gestão (gestao-alunos-ferramentas.js)
  let iniciado = false;
  window.CriarDever = {
    abrir(opcoes) {
      if (!iniciado) { iniciado = true; montar(); carregarCatalogo(); }
      if (opcoes && opcoes.alunoId) { S.modo = 'dever'; S.alunosSel = new Set([String(opcoes.alunoId)]); S.soDoCurso = false; montar(); desenharPainel(); }
      if (opcoes && opcoes.editarPlano) editarPlano(opcoes.editarPlano);
    }
  };
})();
