// ===================== GESTÃO DE ALUNOS — FERRAMENTAS =====================
// Navegação entre as abas (Alunos, Acompanhamento ao vivo, Criar Dever, Atribuir Dever, Deveres
// Completos) e a aba « Acompanhamento »: quem está no site agora (em cartões, por área), as
// últimas entregas e quem precisa de atenção. Criar Dever, Atribuir Dever e Deveres Completos
// moram em js/gestao-criar-dever.js, js/gestao-atribuir-dever.js e js/gestao-deveres-completos.js.
// Usa mostrarView/abrirAluno/alunoAtual de js/gestao-alunos.js, carregado antes.
(function () {
  const headers = json => Object.assign({ Authorization: 'Bearer ' + localStorage.getItem('token') }, json ? { 'Content-Type': 'application/json' } : {});
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = id => document.getElementById(id);
  const quando = d => {
    if (!d) return '—';
    const min = Math.round((Date.now() - new Date(d)) / 60000);
    if (min < 1) return 'agora';
    if (min < 60) return `há ${min} min`;
    if (min < 1440) return `há ${Math.round(min / 60)} h`;
    return new Date(d).toLocaleDateString('pt-BR');
  };
  const chip = p => p == null ? '<span style="color:var(--cinza-400)">—</span>'
    : `<span class="nota-chip ${p >= 80 ? 'alta' : p >= 50 ? 'media' : 'baixa'}">${p}%</span>`;

  // ---------- navegação principal ----------
  $('navPrincipal').addEventListener('click', e => {
    const b = e.target.closest('[data-nav]');
    if (!b) return;
    const alvo = b.dataset.nav;
    mostrarView(alvo);
    if (alvo === 'lista') carregarAlunos();
    if (alvo === 'acompanhamento') carregarAcompanhamento();
    if (alvo === 'criar' && window.CriarDever) CriarDever.abrir();
    if (alvo === 'atribuirDever' && window.AtribuirDever) AtribuirDever.abrir();
    if (alvo === 'completos' && window.DeveresCompletos) DeveresCompletos.abrir();
    try { history.replaceState(null, '', alvo === 'lista' ? location.pathname : '#' + alvo); } catch (x) { /* ok */ }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  // gestao-alunos.html#criar (#atribuirDever, #completos, #acompanhamento) abre direto a aba
  const abaInicial = location.hash.slice(1);
  if (['acompanhamento', 'criar', 'atribuirDever', 'completos'].includes(abaInicial)) setTimeout(() => { const b = document.querySelector(`#navPrincipal [data-nav="${abaInicial}"]`); if (b) b.click(); }, 0);

  // ===================== PRESENÇA AO VIVO =====================
  // Todos os alunos com plano ativo e a área do site em que estão (backend/utils/presencaSite.js).
  const CORES_AREA = {
    'Plataforma de Questões': ['#1e40af', '#e3ebff'], 'Simulação Completa': ['#7A5AF8', '#efeaff'], 'Ambiente de Produção': ['#b45309', '#fff1dc'],
    'Aulas Especializadas': ['#047857', '#dcf5ea'], 'Dever de Casa': ['#be185d', '#fde7f1'], 'Minha conta': ['#475569', '#eef1f5'],
    'Matrícula e compras': ['#475569', '#eef1f5'], 'Página inicial e cursos': ['#475569', '#eef1f5'], 'Site': ['#475569', '#eef1f5']
  };
  const tagArea = a => { const c = CORES_AREA[a] || CORES_AREA.Site; return `<span class="area-tag" style="color:${c[0]}; background:${c[1]};">${esc(a)}</span>`; };
  const duracao = d => { if (!d) return ''; const min = Math.max(0, Math.round((Date.now() - new Date(d)) / 60000)); return min < 1 ? 'menos de 1 min' : min < 60 ? min + ' min' : Math.floor(min / 60) + ' h ' + (min % 60) + ' min'; };
  let presenca = null, filtroArea = '', tPresenca = null;

  async function carregarPresenca() {
    try {
      const r = await fetch('/api/equipe/presenca', { headers: headers() });
      presenca = r.ok ? await r.json() : { alunos: [] };
    } catch (e) { presenca = presenca || { alunos: [] }; }
    renderPresenca();
  }
  const ICONE_AREA = { 'Plataforma de Questões': '❓', 'Simulação Completa': '🏆', 'Ambiente de Produção': '✍️', 'Aulas Especializadas': '▶️', 'Dever de Casa': '📚' };
  const iniciais = n => String(n || '?').trim().split(/\s+/).slice(0, 2).map(x => x.charAt(0).toUpperCase()).join('');
  function renderPresenca() {
    if (!presenca) return;
    const online = presenca.alunos.filter(a => a.online);
    const contagem = {};
    online.forEach(a => { contagem[a.area] = (contagem[a.area] || 0) + 1; });
    const principais = ['Plataforma de Questões', 'Ambiente de Produção', 'Aulas Especializadas', 'Simulação Completa', 'Dever de Casa'];
    const outras = Object.keys(contagem).filter(a => !principais.includes(a));
    $('avOnline').textContent = online.length;
    $('avAtivos').textContent = presenca.alunos.length;
    const max = Math.max(1, ...principais.map(a => contagem[a] || 0));
    const blocos = [['__online', 'Todos online', online.length, '#2E9E63', '🟢']]
      .concat(principais.map(a => [a, a, contagem[a] || 0, (CORES_AREA[a] || CORES_AREA.Site)[0], ICONE_AREA[a]]))
      .concat([['__outras', 'Outras páginas', outras.reduce((n, a) => n + contagem[a], 0), '#475569', '🧭']]);
    $('presencaAreas').innerHTML = blocos.map(([v, r, n, cor, ic]) => {
      const rostos = online.filter(a => v === '__online' || (v === '__outras' ? !principais.includes(a.area) : a.area === v)).slice(0, 4);
      return `<button type="button" data-area="${esc(v)}" class="av-area ${filtroArea === v ? 'ativa' : ''} ${n ? '' : 'zero'}" style="--c:${cor}">
        <span class="av-area-ic">${ic}</span><span class="av-area-n">${n}</span><span class="av-area-nome">${esc(r)}</span>
        <span class="av-area-barra"><i style="width:${v.startsWith('__') ? 100 : Math.round(n / max * 100)}%"></i></span>
        <span class="av-rostos">${rostos.map(a => `<i title="${esc(a.nome)}">${esc(iniciais(a.nome))}</i>`).join('')}</span></button>`;
    }).join('');
    const busca = ($('presencaBusca').value || '').toLowerCase();
    const casa = a => !busca || (a.nome + ' ' + a.email).toLowerCase().includes(busca);
    const lista = online.filter(a => casa(a) && (!filtroArea || filtroArea === '__online' || (filtroArea === '__outras' ? !principais.includes(a.area) : a.area === filtroArea)))
      .sort((a, b) => (a.abaOculta ? 1 : 0) - (b.abaOculta ? 1 : 0) || new Date(a.atividadeDesde || 0) - new Date(b.atividadeDesde || 0));
    $('avTituloLista').textContent = filtroArea && !filtroArea.startsWith('__') ? filtroArea + ' agora' : 'Online agora';
    $('presencaGrade').innerHTML = lista.length ? lista.map(a => {
      const cor = (CORES_AREA[a.area] || CORES_AREA.Site);
      return `<button type="button" class="av-aluno ${a.abaOculta ? 'ausente' : ''}" data-aluno="${a._id}" style="--c:${cor[0]}; --f:${cor[1]}">
        <span class="av-foto">${a.foto ? `<img src="${esc(a.foto)}" alt="">` : esc(iniciais(a.nome))}<i class="av-st" title="${a.abaOculta ? 'Online, com a aba em segundo plano' : 'Online'}"></i></span>
        <span class="av-quem"><b>${esc(a.nome)}</b><small>${esc(a.email)}</small></span>
        <span class="av-onde">${ICONE_AREA[a.area] || '🧭'} ${esc(a.area)}</span>
        <span class="av-oque">${esc(a.atividade || a.pagina || '—')}</span>
        <span class="av-tempo">${a.atividadeDesde ? '⏱️ ' + duracao(a.atividadeDesde) + ' nesta atividade' : ''}${a.onlineDesde ? ` · online há ${duracao(a.onlineDesde)}` : ''}${a.abaOculta ? ' · aba em segundo plano' : ''}</span>
        <span class="av-planos">${(a.planos || []).slice(0, 3).map(x => `<em>${esc(x)}</em>`).join('')}</span></button>`;
    }).join('') : `<div class="av-ninguem"><span>🌙</span><p>${online.length ? 'Ninguém nesta área agora.' : 'Nenhum aluno online agora.'}</p></div>`;
    const off = presenca.alunos.filter(a => !a.online && casa(a)).sort((a, b) => new Date(b.vistoEm || 0) - new Date(a.vistoEm || 0));
    $('avOffN').textContent = off.length;
    $('presencaOff').innerHTML = off.map(a => `<button type="button" class="av-off-item" data-aluno="${a._id}"><span class="av-foto mini">${esc(iniciais(a.nome))}</span><span><b>${esc(a.nome)}</b>
      <small>${a.vistoEm ? 'visto ' + quando(a.vistoEm) : 'ainda não entrou'}${a.area ? ' · ' + esc(a.area) + (a.atividade ? ' · ' + esc(a.atividade) : '') : ''}</small></span></button>`).join('') || '<p class="cd-vazio">Todos estão online.</p>';
  }
  $('presencaAreas').addEventListener('click', e => { const b = e.target.closest('[data-area]'); if (!b) return; filtroArea = filtroArea === b.dataset.area ? '' : b.dataset.area; renderPresenca(); });
  $('presencaBusca').addEventListener('input', renderPresenca);
  // enquanto a aba Acompanhamento estiver aberta, atualiza a cada 15 s
  function vigiarPresenca() {
    clearInterval(tPresenca);
    carregarPresenca();
    tPresenca = setInterval(() => { if ($('viewAcompanhamento').hidden || document.hidden) return; carregarPresenca(); }, 15000);
  }

  // ===================== ACOMPANHAMENTO =====================
  let dadosAcomp = null, ordem = { campo: 'ultima', dir: -1 };
  const idsFeedVistos = new Set();

  async function carregarAcompanhamento() {
    vigiarPresenca();
    try {
      const [rA, rD] = await Promise.all([
        fetch('/api/deveres/acompanhamento', { headers: headers() }),
        fetch('/api/deveres/dashboard', { headers: headers() })
      ]);
      dadosAcomp = rA.ok ? await rA.json() : { feed: [], alunos: [] };
      const d = rD.ok ? await rD.json() : {};
      const semana = dadosAcomp.feed.filter(f => f.enviadoEm && Date.now() - new Date(f.enviadoEm) < 7 * 864e5).length;
      $('avEntregas').textContent = dadosAcomp.feed.filter(f => f.enviadoEm && new Date(f.enviadoEm).toDateString() === new Date().toDateString()).length;
      $('acompKpis').innerHTML = [
        [dadosAcomp.alunos.length, 'Alunos com dever'], [semana, 'Entregas nos últimos 7 dias'],
        [d.atrasados ?? 0, 'Semanas atrasadas'], [(d.taxaMediaConclusao ?? 0) + '%', 'Taxa de conclusão'],
        [d.quantidadeAlunosComAtraso ?? 0, 'Alunos com atraso']
      ].map(([v, r]) => `<div class="kpi"><div class="valor">${v}</div><div class="rotulo">${r}</div></div>`).join('');
      renderFeed();
      renderAlertas();
      renderTabela();
    } catch (err) {
      $('acompFeed').innerHTML = '<li>Erro ao carregar o acompanhamento.</li>';
    }
  }

  function renderFeed() {
    const feed = dadosAcomp.feed;
    if (!feed.length) { $('acompFeed').innerHTML = '<li style="display:block; color:var(--cinza-400);">Nenhuma entrega ainda.</li>'; return; }
    const primeiraVez = !idsFeedVistos.size;
    $('acompFeed').innerHTML = feed.map(f => {
      const chave = f.deverId + f.atividade + f.enviadoEm;
      const novo = !primeiraVez && !idsFeedVistos.has(chave);
      idsFeedVistos.add(chave);
      const completo = f.tipo === 'exercicio_interativo';
      return `<li class="${novo ? 'novo' : ''}">
        <span class="ic ${completo ? 'completo' : ''}">${completo ? '✏️' : '📄'}</span>
        <span><span class="quem" data-aluno="${f.alunoId}">${esc(f.aluno)}</span> entregou <strong>${esc(f.atividade)}</strong>
          <span class="o-que"><br>Semana ${f.semana} · ${esc(f.dever)}${f.atrasada ? ' · <span class="alerta-txt">com atraso</span>' : ''}</span></span>
        <span class="quando">${completo && f.nota ? chip(f.nota.percentual) + '<br>' : ''}${quando(f.enviadoEm)}</span>
      </li>`;
    }).join('');
  }

  function renderAlertas() {
    const semEntrega = dadosAcomp.alunos.filter(a => !a.ultimaEntrega || Date.now() - new Date(a.ultimaEntrega) > 7 * 864e5);
    const atrasados = dadosAcomp.alunos.filter(a => a.atrasados > 0);
    const notaBaixa = dadosAcomp.alunos.filter(a => a.mediaDeveresCompletos != null && a.mediaDeveresCompletos < 60);
    const bloco = (titulo, lista, detalhe) => `<h3 style="font-size:0.9rem; margin:14px 0 6px;">${titulo} <span style="color:var(--cinza-400); font-weight:400;">(${lista.length})</span></h3>` +
      (lista.length ? lista.slice(0, 6).map(a => `<div class="plano-card" style="cursor:pointer; padding:10px 14px;" data-aluno="${a.alunoId}"><strong style="font-size:0.86rem;">${esc(a.nome)}</strong><span style="font-size:0.78rem; color:var(--cinza-600);">${detalhe(a)}</span></div>`).join('')
        : '<p style="font-size:0.82rem; color:var(--cinza-400);">Ninguém aqui. 👍</p>');
    $('acompAlertas').innerHTML =
      bloco('Com semanas atrasadas', atrasados, a => `${a.atrasados} semana(s)`) +
      bloco('Sem entregas há mais de 7 dias', semEntrega, a => a.ultimaEntrega ? 'última ' + quando(a.ultimaEntrega) : 'nunca entregou') +
      bloco('Média baixa nos deveres completos', notaBaixa, a => a.mediaDeveresCompletos + '%');
  }

  function renderTabela() {
    const filtro = ($('acompBusca').value || '').toLowerCase();
    const val = {
      nome: a => a.nome.toLowerCase(), semana: a => a.semanaAtual?.numero || 0, progresso: a => a.progresso,
      atrasados: a => a.atrasados, media: a => a.mediaDeveresCompletos ?? -1, ultima: a => a.ultimaEntrega ? new Date(a.ultimaEntrega).getTime() : 0
    }[ordem.campo];
    const linhas = dadosAcomp.alunos.filter(a => a.nome.toLowerCase().includes(filtro))
      .sort((a, b) => (val(a) > val(b) ? 1 : val(a) < val(b) ? -1 : 0) * ordem.dir);
    $('acompTabela').innerHTML = linhas.length ? linhas.map(a => `<tr data-aluno="${a.alunoId}">
      <td><strong>${esc(a.nome)}</strong><br><span style="font-size:0.74rem; color:var(--cinza-400);">${esc(a.email)}</span></td>
      <td>${a.semanaAtual ? `Semana ${a.semanaAtual.numero}<br><span style="font-size:0.74rem; color:var(--cinza-400);">${esc(a.semanaAtual.titulo)}</span>` : '—'}</td>
      <td><span class="mini-barra"><span style="width:${a.progresso}%"></span></span>${a.progresso}% <span style="font-size:0.74rem; color:var(--cinza-400);">(${a.entregues}/${a.atividades})</span></td>
      <td>${a.atrasados ? `<span class="alerta-txt">${a.atrasados}</span>` : '0'}</td>
      <td>${chip(a.mediaDeveresCompletos)}</td>
      <td>${quando(a.ultimaEntrega)}</td>
    </tr>`).join('') : '<tr><td colspan="6" style="text-align:center; color:var(--cinza-400); cursor:default;">Nenhum aluno com dever de casa ainda.</td></tr>';
  }
  $('acompBusca').addEventListener('input', () => dadosAcomp && renderTabela());
  document.querySelector('table.acomp thead').addEventListener('click', e => {
    const th = e.target.closest('[data-ord]'); if (!th || !dadosAcomp) return;
    ordem = { campo: th.dataset.ord, dir: ordem.campo === th.dataset.ord ? -ordem.dir : (th.dataset.ord === 'nome' ? 1 : -1) };
    renderTabela();
  });
  $('viewAcompanhamento').addEventListener('click', e => {
    const alvo = e.target.closest('[data-aluno]');
    if (alvo) abrirAluno(alvo.dataset.aluno);
  });

  // ao vivo: qualquer entrega de dever recarrega a aba, se ela estiver aberta
  let tRecarga = null;
  DeverRealtime.escutar({
    'dever-atualizado': () => {
      if ($('viewAcompanhamento').hidden) return;
      clearTimeout(tRecarga); tRecarga = setTimeout(carregarAcompanhamento, 800);
    }
  });

  // ===================== FICHA DO ALUNO → CRIAR / ATRIBUIR DEVER =====================
  $('atribuirDcAlunoBtn').addEventListener('click', () => {
    if (!alunoAtual) return;
    mostrarView('criar');
    window.CriarDever && CriarDever.abrir({ alunoId: alunoAtual._id });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  $('atribuirDeverAlunoBtn').addEventListener('click', () => {
    if (!alunoAtual) return;
    mostrarView('atribuirDever');
    window.AtribuirDever && AtribuirDever.abrir(alunoAtual._id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
})();
