// ===================== GESTÃO DE ALUNOS — FERRAMENTAS =====================
// Abas "Acompanhamento" (o que os alunos estão fazendo, ao vivo) e "Atribuir
// deveres completos" (criar, para um ou vários alunos, um dever de casa com os
// blocos de questões de backend/data/exercicios). Usa mostrarView/abrirAluno/
// alunoAtual de js/gestao-alunos.js, carregado antes.
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
    if (alvo === 'atribuir') prepararAtribuir();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

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
  function renderPresenca() {
    if (!presenca) return;
    const online = presenca.alunos.filter(a => a.online);
    const contagem = {};
    online.forEach(a => { contagem[a.area] = (contagem[a.area] || 0) + 1; });
    const principais = ['Plataforma de Questões', 'Ambiente de Produção', 'Aulas Especializadas', 'Simulação Completa', 'Dever de Casa'];
    const outras = Object.keys(contagem).filter(a => !principais.includes(a));
    const botoes = [['', 'Todos com plano ativo', presenca.alunos.length, '#94a3b8'], ['__online', 'Online agora', online.length, '#2E9E63']]
      .concat(principais.map(a => [a, a, contagem[a] || 0, (CORES_AREA[a] || CORES_AREA.Site)[0]]))
      .concat(outras.length ? [['__outras', 'Outras páginas', outras.reduce((n, a) => n + contagem[a], 0), '#475569']] : []);
    $('presencaAreas').innerHTML = botoes.map(([v, r, n, cor]) => `<button type="button" data-area="${esc(v)}" class="${filtroArea === v ? 'ativa' : ''}"><i style="background:${cor}"></i>${esc(r)} <b>${n}</b></button>`).join('');
    const busca = ($('presencaBusca').value || '').toLowerCase();
    const lista = presenca.alunos.filter(a => {
      if (busca && !(a.nome + ' ' + a.email).toLowerCase().includes(busca)) return false;
      if (!filtroArea) return true;
      if (filtroArea === '__online') return a.online;
      if (filtroArea === '__outras') return a.online && !principais.includes(a.area);
      return a.online && a.area === filtroArea;
    });
    $('presencaTabela').innerHTML = lista.length ? lista.map(a => {
      const st = a.online ? (a.abaOculta ? 'ausente' : 'on') : '';
      return `<tr data-aluno="${a._id}" class="${a.online ? '' : 'off'}">
        <td><span class="st-dot ${st}" title="${a.online ? (a.abaOculta ? 'Online, com a aba em segundo plano' : 'Online') : 'Offline'}"></span><strong>${esc(a.nome)}</strong><br><span style="font-size:0.72rem; color:var(--cinza-400);">${esc(a.email)}</span></td>
        <td>${a.online ? tagArea(a.area) + (a.abaOculta ? '<br><small style="font-size:.72rem; color:var(--cinza-400);">aba em segundo plano</small>' : '') : '<span style="font-size:.8rem;">Offline</span>'}</td>
        <td class="ativ">${a.online ? esc(a.atividade || a.pagina || '—') : (a.area ? `<small>Última atividade: ${esc(a.area)}${a.atividade ? ' · ' + esc(a.atividade) : ''}</small>` : '—')}</td>
        <td style="font-size:.82rem;">${a.online ? (a.atividadeDesde ? duracao(a.atividadeDesde) + ' nesta atividade' : '') + (a.onlineDesde ? `<br><small style="color:var(--cinza-400);">online há ${duracao(a.onlineDesde)}</small>` : '') : 'visto ' + quando(a.vistoEm)}</td>
        <td class="planos-mini">${a.planos.map(esc).join('<br>')}</td>
      </tr>`;
    }).join('') : '<tr><td colspan="5" style="text-align:center; color:var(--cinza-400); cursor:default;">Nenhum aluno com estes filtros.</td></tr>';
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

  // ===================== ATRIBUIR DEVERES COMPLETOS =====================
  let catalogo = null, alunosLista = null;
  const escolhidos = new Set(), alunosEscolhidos = new Set();
  const hojeISO = (dias = 0) => new Date(Date.now() + dias * 864e5).toISOString().slice(0, 10);

  async function prepararAtribuir(preSelecionarAlunoId) {
    if (!$('atribInicio').value) { $('atribInicio').value = hojeISO(); $('atribPrazo').value = hojeISO(7); }
    if (preSelecionarAlunoId) { alunosEscolhidos.clear(); alunosEscolhidos.add(preSelecionarAlunoId); }
    try {
      if (!catalogo) {
        const r = await fetch('/api/exercicios', { headers: headers() });
        catalogo = r.ok ? await r.json() : [];
      }
      renderCatalogo();
      if (!alunosLista) {
        const r = await fetch('/api/equipe/alunos?status=ativo', { headers: headers() });
        const d = r.ok ? await r.json() : {};
        const rE = await fetch('/api/equipe/alunos?status=expirado', { headers: headers() });
        const dE = rE.ok ? await rE.json() : {};
        alunosLista = [...(d.alunos || []).map(a => ({ ...a, ativoLista: true })), ...(dE.alunos || [])];
      }
      renderAlunos();
      atualizarResumo();
    } catch (err) {
      $('dcGrid').innerHTML = 'Erro ao carregar.';
    }
  }

  function renderCatalogo() {
    $('dcGrid').innerHTML = catalogo.map(x => `
      <label class="dc-card${escolhidos.has(x.slug) ? ' marcado' : ''}">
        <input type="checkbox" data-dc="${x.slug}" ${escolhidos.has(x.slug) ? 'checked' : ''}>
        <span><h4><span class="dc-nivel">${esc(x.nivel || '')}</span>${esc(x.titulo)}</h4>
          <span class="meta">${x.questoes ? x.questoes + ' questões' : x.regras + ' regras'} · ${x.partes.length} partes${x.modo === 'prova' ? ' · prova' : ''}</span><br>
          <a class="ver" href="exercicio.html?slug=${encodeURIComponent(x.slug)}" target="_blank" rel="noopener">ver ↗</a></span>
      </label>`).join('');
  }
  $('dcGrid').addEventListener('change', e => {
    const cb = e.target.closest('[data-dc]'); if (!cb) return;
    if (cb.checked) escolhidos.add(cb.dataset.dc); else escolhidos.delete(cb.dataset.dc);
    cb.closest('.dc-card').classList.toggle('marcado', cb.checked);
    atualizarResumo();
  });

  function renderAlunos() {
    const filtro = ($('atribBusca').value || '').toLowerCase();
    const lista = alunosLista.filter(a => (a.nome + ' ' + a.email).toLowerCase().includes(filtro));
    $('atribAlunos').innerHTML = lista.length ? lista.map(a => `
      <label><input type="checkbox" data-al="${a._id}" ${alunosEscolhidos.has(a._id) ? 'checked' : ''}>
        <span><strong>${esc(a.nome)}</strong> <span style="color:var(--cinza-400); font-size:0.78rem;">${esc(a.email)}${a.ativoLista ? '' : ' · expirado'}</span></span></label>`).join('')
      : '<p style="padding:14px; color:var(--cinza-400);">Nenhum aluno encontrado.</p>';
  }
  $('atribBusca').addEventListener('input', () => alunosLista && renderAlunos());
  $('atribAlunos').addEventListener('change', e => {
    const cb = e.target.closest('[data-al]'); if (!cb) return;
    if (cb.checked) alunosEscolhidos.add(cb.dataset.al); else alunosEscolhidos.delete(cb.dataset.al);
    atualizarResumo();
  });
  $('atribTodos').addEventListener('click', () => { alunosLista.filter(a => a.ativoLista).forEach(a => alunosEscolhidos.add(a._id)); renderAlunos(); atualizarResumo(); });
  $('atribNenhum').addEventListener('click', () => { alunosEscolhidos.clear(); renderAlunos(); atualizarResumo(); });

  function atualizarResumo() {
    const n = escolhidos.size, m = alunosEscolhidos.size;
    $('atribResumo').textContent = n || m
      ? `${n} dever(es) completo(s) para ${m} aluno(s).`
      : 'Nenhum dever completo selecionado.';
    $('atribEnviar').disabled = !n || !m;
  }

  $('atribEnviar').addEventListener('click', async () => {
    const btn = $('atribEnviar'), msg = $('atribMsg');
    btn.disabled = true; msg.textContent = 'Enviando...';
    try {
      const res = await fetch('/api/deveres/deveres-completos/atribuir', {
        method: 'POST', headers: headers(true),
        body: JSON.stringify({
          alunoIds: [...alunosEscolhidos], slugs: catalogo.filter(x => escolhidos.has(x.slug)).map(x => x.slug),
          titulo: $('atribTitulo').value.trim() || 'Deveres completos', descricao: $('atribDescricao').value.trim(),
          dataInicio: $('atribInicio').value, dataLimite: $('atribPrazo').value, prioridade: $('atribPrioridade').value
        })
      });
      const data = await res.json();
      msg.textContent = data.msg || (res.ok ? 'Pronto!' : 'Erro ao atribuir.');
      if (res.ok) {
        escolhidos.clear(); renderCatalogo();
        // voltou de uma ficha de aluno? reabre a ficha para ver o dever novo
        if (voltarParaAluno) { const id = voltarParaAluno; voltarParaAluno = null; alunosEscolhidos.clear(); setTimeout(() => abrirAluno(id), 600); }
      }
    } catch (err) { msg.textContent = 'Erro ao conectar ao servidor.'; }
    finally { atualizarResumo(); }
  });

  // botão na ficha do aluno: abre a aba já com o aluno marcado
  let voltarParaAluno = null;
  $('atribuirDcAlunoBtn').addEventListener('click', () => {
    if (!alunoAtual) return;
    voltarParaAluno = alunoAtual._id;
    mostrarView('atribuir');
    prepararAtribuir(alunoAtual._id);
    $('atribMsg').textContent = `Aluno: ${alunoAtual.nome}`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
})();
