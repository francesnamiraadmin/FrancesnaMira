(function () {
  const token = localStorage.getItem('token');
  function authHeaders() { return { Authorization: 'Bearer ' + token }; }
  const moeda = v => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const fmtData = d => d ? new Date(d).toLocaleDateString('pt-BR') : '—';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const DIA_MS = 24 * 60 * 60 * 1000;

  // Mesmas cores/nomes dos cards do hub de cursos (js/cursoHub.js).
  const CURSOS = {
    TCF: { nome: 'TCF', cor: '#3b82f6', pagina: 'tcf.html' },
    DELF: { nome: 'DELF', cor: '#10b981', pagina: 'delf.html' },
    DALF: { nome: 'DALF', cor: '#a855f7', pagina: 'dalf.html' },
    TEF: { nome: 'TEF', cor: '#06b6d4', pagina: 'tef.html' },
    A1: { nome: 'Francês A1', cor: '#f59e0b', pagina: 'a1.html' },
    A2: { nome: 'Francês A2', cor: '#f97316', pagina: 'a2.html' },
    B1: { nome: 'Francês B1', cor: '#ef4444', pagina: 'b1.html' },
    B2: { nome: 'Francês B2', cor: '#ec4899', pagina: 'b2.html' }
  };
  const METODOS = { cartao_credito: 'Cartão de crédito', cartao_debito: 'Cartão de débito', boleto: 'Boleto', pix: 'Pix' };
  const STATUS = { aprovado: 'Aprovado', pendente: 'Pendente', rejeitado: 'Recusado', cancelado: 'Cancelado' };
  // O que cada tier libera por curso — mesma cascata de backend/middleware/acessoCurso.js.
  const MODULOS = [
    { chave: 'producao', nome: 'Ambiente de Produção Oral e Textual', tiers: ['Essentiel', 'Avancé', 'Excellence'], href: 'producao-hub.html', icone: 'img/icones/writing-hand.svg' },
    { chave: 'aulasEspecializadas', nome: 'Aulas Especializadas', tiers: ['Avancé', 'Excellence'], href: 'aulas-hub.html', icone: 'img/icones/video.svg' },
    { chave: 'plataforma', nome: 'Plataforma de Questões', tiers: ['Excellence'], href: 'plataforma-hub.html', icone: 'img/icones/estatisticas.svg' }
  ];
  const ICONE_OK = '<img src="img/icones/check.svg" alt="">';
  const ICONE_NAO = '<img src="img/icones/x-mark.svg" alt="">';

  // Pedidos antigos gravam o curso como "TCF – Canadá", "Francês A1"...: reduz ao código.
  function codigoCurso(nome) {
    const up = String(nome || '').toUpperCase();
    const achados = Object.keys(CURSOS).filter(c => new RegExp(`(^|[^A-Z0-9])${c}([^A-Z0-9]|$)`).test(up));
    return achados.length === 1 ? achados[0] : null;
  }

  // ---------- estado do plano ----------
  function situacao(p) {
    const venc = p.dataVencimento ? new Date(p.dataVencimento) : null;
    const packVenc = p.packPrestige?.dataVencimento ? new Date(p.packPrestige.dataVencimento) : null;
    const tierAtivo = !!(p.ativo && p.tier);
    const packAtivo = !!p.packPrestige?.ativo;
    const ativo = tierAtivo || packAtivo;
    // vencimento que manda no card: o mais distante entre plano e Pack Prestige ativos
    const fim = [tierAtivo && venc, packAtivo && packVenc].filter(Boolean).sort((a, b) => b - a)[0] || venc || packVenc;
    const inicio = p.dataInicio ? new Date(p.dataInicio) : (fim ? new Date(fim - 30 * DIA_MS) : null);
    const restantes = fim ? Math.ceil((fim - Date.now()) / DIA_MS) : null;
    const progresso = inicio && fim ? Math.min(1, Math.max(0, (Date.now() - inicio) / (fim - inicio))) : 0;
    return { ativo, tierAtivo, packAtivo, fim, inicio, restantes, progresso };
  }

  function cardCurso(p) {
    const info = CURSOS[p.courseType] || { nome: p.courseType, cor: '#64748b', pagina: 'cursos.html' };
    const s = situacao(p);
    const chips = [];
    if (p.tier) chips.push(`<span class="chip tier-${esc(p.tier)}">${esc(p.tier)}</span>`);
    if (p.packPrestige?.ativo || p.packPrestige?.dataVencimento) chips.push('<span class="chip prestige">Pack Prestige</span>');
    chips.push(s.ativo ? '<span class="chip ok">Ativo</span>' : '<span class="chip off">Expirado</span>');

    let ciclo = '';
    if (s.fim) {
      const texto = s.ativo
        ? (s.restantes <= 0 ? 'Vence hoje' : `Faltam <strong>${s.restantes} dia${s.restantes === 1 ? '' : 's'}</strong>`)
        : `Venceu em <strong>${fmtData(s.fim)}</strong>`;
      const alerta = s.ativo && s.restantes <= 5 ? ' alerta' : '';
      ciclo = `<div class="ciclo">
        <div class="linha"><span>${texto}</span><span>${fmtData(s.inicio)} → ${fmtData(s.fim)}</span></div>
        <div class="barra${alerta}"><span style="width:${s.ativo ? Math.round(s.progresso * 100) : 100}%"></span></div>
      </div>`;
    }

    const inclui = MODULOS.map(m => {
      const libera = s.packAtivo || (s.tierAtivo && m.tiers.includes(p.tier));
      return `<li class="${libera ? '' : 'nao'}">${libera ? ICONE_OK : ICONE_NAO}${m.nome}</li>`;
    }).join('');

    const pagamento = p.metodoPagamento
      ? `${METODOS[p.metodoPagamento] || esc(p.metodoPagamento)}${p.cartaoFinal ? ` •••• ${esc(p.cartaoFinal)}` : ''}`
      : '—';
    const renovar = `matricula.html?curso=${encodeURIComponent(p.courseType)}${p.tier ? '&plano=' + encodeURIComponent(p.tier) : ''}`;

    return `<article class="curso-insc${s.ativo ? '' : ' expirado'}" style="--cor:${info.cor}">
      <div class="curso-topo">
        <div class="curso-sigla">${esc(p.courseType)}</div>
        <div><h3>${esc(info.nome)}</h3><div class="chips">${chips.join('')}</div></div>
      </div>
      <div class="curso-corpo">
        ${ciclo}
        <div class="detalhes">
          <div><span>Pagamento</span>${pagamento}</div>
          <div><span>Renovação</span>${p.autoRenovacao ? 'Automática' : 'Manual'}</div>
        </div>
        <ul class="inclui">${inclui}</ul>
        <div class="acoes">
          <a class="btn-insc primario" href="${s.ativo ? 'producao-hub.html' : renovar}">${s.ativo ? 'Acessar' : 'Renovar'}</a>
          <a class="btn-insc secundario" href="${info.pagina}">${s.ativo && p.tier !== 'Excellence' ? 'Fazer upgrade' : 'Ver planos'}</a>
        </div>
      </div>
    </article>`;
  }

  function renderCursos(dados) {
    const grid = document.getElementById('cursosGrid');
    const planos = (dados.planos || []).filter(p => p.courseType)
      .sort((a, b) => situacao(b).ativo - situacao(a).ativo || (situacao(b).fim || 0) - (situacao(a).fim || 0));
    const ativos = planos.filter(p => situacao(p).ativo).length;
    document.getElementById('contagemCursos').textContent = planos.length ? `${ativos} ativo${ativos === 1 ? '' : 's'} de ${planos.length}` : '';

    const cards = planos.map(cardCurso);
    // Acessos concedidos fora do modelo por curso (bypass administrativo / Pack Prestige antigo).
    if (dados.plano?.ativo && dados.plano.curso === 'Acesso Total') {
      cards.unshift(`<article class="curso-insc" style="--cor:#d9a300"><div class="curso-topo"><div class="curso-sigla">★</div>
        <div><h3>Acesso Total</h3><div class="chips"><span class="chip ok">Ativo</span></div></div></div>
        <div class="curso-corpo"><p style="font-size:0.85rem; color:var(--text-muted);">Sua conta tem acesso liberado a todos os cursos e módulos.</p></div></article>`);
    }
    grid.innerHTML = cards.length ? cards.join('') : `<div class="vazio-card" style="grid-column:1/-1;">
      <img src="img/icones/cap.svg" alt="">
      <h3>Você ainda não tem cursos</h3>
      <p>Escolha um curso e um plano para liberar produção de textos, aulas especializadas e a plataforma de questões.</p>
      <a class="btn-insc primario" href="cursos.html">Conhecer os cursos</a>
    </div>`;
    return planos;
  }

  function renderAcessos() {
    document.getElementById('acessos').innerHTML = MODULOS.slice().reverse().map(m => {
      const a = window.AppShell.detalhesAcesso(m.chave);
      return `<a class="acesso" href="${a.ativo ? m.href : 'cursos.html'}">
        <span class="ic"><img src="${m.icone}" alt=""></span>
        <span><strong>${m.nome}</strong><small class="${a.ativo ? 'ok' : 'off'}">${a.ativo ? 'Liberado' : 'Não incluído nos seus planos'}</small></span>
        <span class="seta">›</span>
      </a>`;
    }).join('');
  }

  function renderResumo(planos, pedidos) {
    const aprovados = pedidos.filter(p => p.status === 'aprovado');
    const investido = aprovados.reduce((s, p) => s + (p.valor || 0), 0);
    const ativos = planos.map(p => ({ p, s: situacao(p) })).filter(x => x.s.ativo && x.s.fim);
    const proximo = ativos.sort((a, b) => a.s.fim - b.s.fim)[0];
    const item = (rotulo, valor, detalhe) => `<div class="resumo-item"><div class="rotulo">${rotulo}</div><div class="valor">${valor}</div><div class="detalhe">${detalhe}</div></div>`;
    document.getElementById('resumo').innerHTML = [
      item('Cursos ativos', ativos.length, planos.length ? `${planos.length} no total` : 'nenhum ainda'),
      item('Total investido', moeda(investido), `${aprovados.length} compra${aprovados.length === 1 ? '' : 's'} aprovada${aprovados.length === 1 ? '' : 's'}`),
      item('Pendentes', pedidos.filter(p => p.status === 'pendente').length, 'Pix ou boleto aguardando pagamento'),
      item('Próximo vencimento', proximo ? fmtData(proximo.s.fim) : '—', proximo ? `${esc(CURSOS[proximo.p.courseType]?.nome || proximo.p.courseType)} · ${proximo.s.restantes} dia(s)` : 'sem planos ativos')
    ].join('');
  }

  // ---------- histórico ----------
  let pedidosCache = [];
  let filtroStatus = '';
  function renderHistorico() {
    const lista = pedidosCache.filter(p => !filtroStatus || p.status === filtroStatus || (filtroStatus === 'rejeitado' && p.status === 'cancelado'));
    const alvo = document.getElementById('compras');
    const aprovados = pedidosCache.filter(p => p.status === 'aprovado');
    document.getElementById('histTotal').innerHTML = pedidosCache.length
      ? `<strong>${moeda(aprovados.reduce((s, p) => s + (p.valor || 0), 0))}</strong> em ${aprovados.length} compra(s) aprovada(s)`
      : '';
    if (!lista.length) {
      alvo.innerHTML = `<div class="hist-vazio">${pedidosCache.length ? 'Nenhuma compra com esse status.' : 'Nenhuma compra registrada ainda.'}</div>`;
      return;
    }
    alvo.innerHTML = lista.map(p => {
      const d = new Date(p.criadoEm);
      const codigo = codigoCurso(p.curso);
      const nomeCurso = codigo ? CURSOS[codigo].nome : (p.curso || '—');
      const metodo = `${METODOS[p.metodoPagamento] || esc(p.metodoPagamento || '—')}${p.cartaoFinal ? ` •••• ${esc(p.cartaoFinal)}` : ''}${p.parcelas > 1 ? ` · ${p.parcelas}x` : ''}`;
      // Toda ativação vale 30 dias a partir da aprovação (ativarPlano no backend); o pedido
      // não guarda essa data, então é estimada a partir da compra.
      const validade = p.status === 'aprovado' ? `<span>Válido até ${fmtData(d.getTime() + 30 * DIA_MS)}</span>` : '';
      return `<div class="compra">
        <div class="data"><b>${String(d.getDate()).padStart(2, '0')}</b><span>${d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')} ${String(d.getFullYear()).slice(2)}</span></div>
        <div class="info">
          <strong>${esc(nomeCurso)} · ${esc(p.plano || '—')}</strong>
          <div class="meta"><span>${metodo}</span><span>${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>${validade}</div>
        </div>
        <div class="lado"><div class="preco">${moeda(p.valor)}</div><span class="status-badge ${esc(p.status)}">${STATUS[p.status] || esc(p.status)}</span></div>
      </div>`;
    }).join('');
  }
  document.getElementById('filtroHist').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    e.currentTarget.querySelectorAll('button').forEach(x => x.classList.toggle('ativo', x === b));
    filtroStatus = b.dataset.status;
    renderHistorico();
  });

  document.addEventListener('appshell:ready', async evt => {
    const dados = evt.detail;
    const planos = renderCursos(dados);
    renderAcessos();
    try {
      const res = await fetch('/api/pagamentos/minhas', { headers: authHeaders() });
      pedidosCache = res.ok ? await res.json() : [];
    } catch (err) {
      document.getElementById('compras').innerHTML = '<div class="hist-vazio" style="color:var(--danger-text);">Não foi possível carregar seu histórico.</div>';
    }
    renderResumo(planos, pedidosCache);
    renderHistorico();
  });
})();
