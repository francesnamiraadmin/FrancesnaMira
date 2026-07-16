(function () {
  const token = localStorage.getItem('token');
  function authHeaders() { return { Authorization: 'Bearer ' + token }; }
  function fmtMoeda(v) { return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
  function fmtData(d) { return d ? new Date(d).toLocaleDateString('pt-BR') : '—'; }

  const ESTILOS_PLANO = {
    Essentiel: { background: "rgba(205,127,50,0.35)", border: "#cd7f32", color: "#ffffff" },
    "Avancé": { background: "rgba(210,210,210,0.35)", border: "#c0c0c0", color: "#08203e" },
    Excellence: { background: "rgba(255,215,0,0.35)", border: "#ffd700", color: "#08203e" }
  };
  const METODOS_LABEL = {
    cartao_credito: 'Cartão de Crédito', cartao_debito: 'Cartão de Débito',
    boleto: 'Boleto Bancário', pix: 'Pix'
  };
  const STATUS_LABEL = { aprovado: 'Aprovado', pendente: 'Pendente', rejeitado: 'Rejeitado', cancelado: 'Cancelado' };
  const PRODUTOS_AVULSOS_NOMES = {
    plataforma: 'Plataforma de Questões', producao: 'Ambiente de Produção Oral e Textual', aulasEspecializadas: 'Aulas Especializadas Online'
  };

  function renderPlanoAtual(dados) {
    const alvo = document.getElementById('planoAtualCards');
    const plano = dados.plano || { ativo: false };
    const produtos = dados.produtosAvulsos || {};

    let planoCardHtml;
    if (plano.ativo && plano.tier) {
      const estilo = ESTILOS_PLANO[plano.tier];
      planoCardHtml = `<div class="dash-summary-card">
        <div class="icone">🎓</div>
        <h3>Plano ${plano.tier} — ${plano.curso || ''}</h3>
        <span class="dash-status-tag ativo" style="background:${estilo.background}; color:${estilo.color};">Ativo</span>
        <p style="font-size:0.85rem; color:var(--text-muted); margin-top:8px;">
          Início: ${fmtData(plano.dataInicio)}<br>
          Vencimento: ${fmtData(plano.dataVencimento)}<br>
          Renovação: ${plano.autoRenovacao ? 'Automática' : 'Manual'}
        </p>
        <a class="upgrade-btn" href="cursos.html">Ver planos</a>
      </div>`;
    } else {
      planoCardHtml = `<div class="dash-summary-card">
        <div class="icone">🎓</div>
        <h3>Nenhum plano de curso ativo</h3>
        <span class="dash-status-tag bloqueado">Sem assinatura</span>
        <p style="font-size:0.85rem; color:var(--text-muted); margin-top:8px;">Assine um plano para matricular-se em turmas ou aulas particulares.</p>
        <a class="upgrade-btn" href="cursos.html">Ver planos</a>
      </div>`;
    }

    const produtosCards = Object.entries(PRODUTOS_AVULSOS_NOMES).map(([chave, nome]) => {
      const info = produtos[chave] || {};
      const acesso = window.AppShell.detalhesAcesso(chave);
      const tagTexto = acesso.ativo
        ? (acesso.viaCascata && !acesso.viaAvulso ? `✓ Ativo · incluído no plano ${plano.tier}` : '✓ Ativo')
        : (info.dataVencimento ? '✗ Expirado' : '🔒 Não adquirido');
      return `<div class="dash-summary-card">
        <div class="icone">📦</div>
        <h3>${nome}</h3>
        <span class="dash-status-tag ${acesso.ativo ? 'ativo' : (info.dataVencimento ? 'expirado' : 'bloqueado')}">${tagTexto}</span>
        ${info.dataVencimento ? `<p style="font-size:0.85rem; color:var(--text-muted); margin-top:8px;">Vencimento: ${fmtData(info.dataVencimento)}</p>` : ''}
      </div>`;
    }).join('');

    alvo.innerHTML = planoCardHtml + produtosCards;
  }

  // Toda ativação (plano de curso ou Pack Prestige) concede exatamente 30 dias a partir da
  // aprovação — mesma regra usada em ativarPlano()/ativarPackPrestige() no backend. Como o
  // pedido não guarda essa data, ela é estimada aqui a partir de quando a compra foi criada.
  function fmtVencimento(p) {
    if (p.status !== 'aprovado') return '—';
    const vencimento = new Date(p.criadoEm).getTime() + 30 * 24 * 60 * 60 * 1000;
    return fmtData(vencimento);
  }

  function renderHistorico(pedidos) {
    const corpo = document.getElementById('corpoHistorico');
    if (!pedidos.length) {
      corpo.innerHTML = '<tr><td colspan="8" style="text-align:center; color:var(--text-muted); padding:24px;">Nenhuma compra registrada ainda.</td></tr>';
      return;
    }
    corpo.innerHTML = pedidos.map(p => {
      const incluidos = (p.upgrades && p.upgrades.length)
        ? p.upgrades.map(u => PRODUTOS_AVULSOS_NOMES[u] || u).join(', ')
        : '—';
      return `<tr>
        <td>${fmtData(p.criadoEm)}</td>
        <td>${p.curso || '—'}</td>
        <td>${p.plano || '—'}</td>
        <td>${fmtMoeda(p.valor)}</td>
        <td>${METODOS_LABEL[p.metodoPagamento] || p.metodoPagamento || '—'}</td>
        <td><span class="status-badge ${p.status}">${STATUS_LABEL[p.status] || p.status}</span></td>
        <td style="font-size:0.85rem; color:var(--text-muted);">${incluidos}</td>
        <td>${fmtVencimento(p)}</td>
      </tr>`;
    }).join('');
  }

  document.addEventListener('appshell:ready', async dados_evt => {
    const dados = dados_evt.detail;
    renderPlanoAtual(dados);
    try {
      const res = await fetch('/api/pagamentos/minhas', { headers: authHeaders() });
      const pedidos = res.ok ? await res.json() : [];
      renderHistorico(pedidos);
    } catch (err) {
      document.getElementById('corpoHistorico').innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--danger-text);">Não foi possível carregar seu histórico.</td></tr>';
    }
  });
})();
