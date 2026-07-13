const token = localStorage.getItem('token');
const NOMES_STATUS = {
  rascunho: 'Rascunho', aguardando_envio: 'Aguardando envio', enviado: 'Enviado', em_fila: 'Em fila',
  em_correcao: 'Em correção', aguardando_revisao: 'Aguardando revisão', corrigido: 'Corrigido',
  devolvido: 'Devolvido', arquivado: 'Arquivado', cancelado: 'Cancelado'
};

let alunoAtual = null;

function mostrarView(nome) {
  document.getElementById('viewLista').style.display = nome === 'lista' ? 'block' : 'none';
  document.getElementById('viewDetalhe').style.display = nome === 'detalhe' ? 'block' : 'none';
}
document.getElementById('voltarListaBtn').addEventListener('click', () => { mostrarView('lista'); carregarAlunos(); });

// ===================== LISTA DE ALUNOS =====================
async function carregarAlunos() {
  const params = new URLSearchParams();
  const busca = document.getElementById('buscaInput').value.trim();
  if (busca) params.set('busca', busca);

  const lista = document.getElementById('alunosLista');
  lista.innerHTML = '<p style="opacity:0.6;">Carregando alunos...</p>';
  try {
    const res = await fetch(`/api/equipe/alunos?${params}`, { headers: { Authorization: 'Bearer ' + token } });
    const alunos = await res.json();
    if (!Array.isArray(alunos) || alunos.length === 0) {
      lista.innerHTML = '<div class="vazio-box">Nenhum aluno encontrado.</div>';
      return;
    }
    lista.innerHTML = alunos.map(renderAlunoItem).join('');
  } catch (err) {
    lista.innerHTML = '<div class="vazio-box">Erro ao carregar os alunos.</div>';
  }
}
let buscaTimeout;
document.getElementById('buscaInput').addEventListener('input', () => { clearTimeout(buscaTimeout); buscaTimeout = setTimeout(carregarAlunos, 300); });

function renderAlunoItem(a) {
  const planoTag = a.plano?.ativo
    ? `<span class="pill">Plano ${a.plano.tier}</span>`
    : `<span class="pill sem-plano">Sem plano ativo</span>`;
  return `<div class="aluno-item" data-id="${a._id}">
    <div>
      <h4>${a.nome}</h4>
      <div class="meta">${a.email} · Cadastrado em ${new Date(a.criadoEm).toLocaleDateString('pt-BR')}${a.provaAlvo ? ' · Prova alvo: ' + a.provaAlvo : ''}</div>
    </div>
    <div>
      ${planoTag}
      <span class="pill creditos">${a.creditosCorrecao || 0} crédito${a.creditosCorrecao === 1 ? '' : 's'}</span>
      <span class="pill">${a.totalProducoes} ${a.totalProducoes === 1 ? 'produção' : 'produções'}</span>
    </div>
  </div>`;
}
document.getElementById('alunosLista').addEventListener('click', e => {
  const item = e.target.closest('.aluno-item');
  if (item) abrirAluno(item.dataset.id);
});

// ===================== DETALHE DO ALUNO =====================
async function abrirAluno(id) {
  try {
    const res = await fetch(`/api/equipe/alunos/${id}`, { headers: { Authorization: 'Bearer ' + token } });
    if (!res.ok) { alert('Não foi possível carregar este aluno.'); return; }
    const data = await res.json();
    alunoAtual = data.aluno;
    renderDetalhe(data);
    mostrarView('detalhe');
    window.scrollTo(0, 0);
  } catch (err) { alert('Erro ao carregar o aluno.'); }
}

function renderDetalhe(data) {
  const a = data.aluno;
  document.getElementById('detalheNome').textContent = a.nome;
  document.getElementById('detalheEmail').textContent = a.email;
  document.getElementById('credMsg').style.display = 'none';

  const planoTag = a.plano?.ativo
    ? `<span class="pill">Plano ${a.plano.tier} · ${a.plano.curso || ''}</span>`
    : `<span class="pill sem-plano">Sem plano ativo</span>`;
  document.getElementById('detalhePills').innerHTML = `
    ${planoTag}
    <span class="pill creditos">${a.creditosCorrecao || 0} créditos disponíveis</span>
    ${a.perfil?.provaAlvo ? `<span class="pill">Prova alvo: ${a.perfil.provaAlvo}</span>` : ''}
    ${a.perfil?.dataProva ? `<span class="pill">Data da prova: ${new Date(a.perfil.dataProva).toLocaleDateString('pt-BR')}</span>` : ''}`;

  const s = data.estatisticas;
  document.getElementById('statsKpiRow').innerHTML = `
    <div class="kpi"><div class="valor">${s.total}</div><div class="rotulo">Produções enviadas</div></div>
    <div class="kpi"><div class="valor">${s.porStatus.corrigido || 0}</div><div class="rotulo">Corrigidas</div></div>
    <div class="kpi"><div class="valor">${(s.porStatus.em_fila || 0) + (s.porStatus.em_correcao || 0)}</div><div class="rotulo">Em andamento</div></div>
    <div class="kpi"><div class="valor">${s.notaMedia !== null ? s.notaMedia : '—'}</div><div class="rotulo">Nota média</div></div>`;

  let graficosHtml = '';
  if (s.evolucaoNotas?.length) {
    graficosHtml += `<h3 style="font-size:0.95rem; margin:16px 0 10px;">Evolução das notas</h3><div class="chart-scroll">${svgEvolucaoNotas(s.evolucaoNotas)}</div>`;
  }
  if (s.porCriterio?.length) {
    graficosHtml += `<h3 style="font-size:0.95rem; margin:20px 0 10px;">Média por critério</h3>` +
      s.porCriterio.map(c => `<div class="bar-list-row">
        <span class="bar-list-label">${c.nome}</span>
        <div class="bar-list-track"><div class="bar-list-fill" style="width:${(c.media / 5) * 100}%;"></div></div>
        <span class="bar-list-val">${c.media}/5</span>
      </div>`).join('');
  }
  document.getElementById('statsGraficos').innerHTML = graficosHtml || '<p style="color:var(--cinza-400); font-size:0.9rem;">Ainda não há produções corrigidas para gerar estatísticas.</p>';

  document.getElementById('producoesLista').innerHTML = data.producoes.length
    ? data.producoes.map(renderProducaoItem).join('')
    : '<div class="vazio-box">Este aluno ainda não enviou nenhuma produção.</div>';
}

function svgEvolucaoNotas(pontos) {
  const W = Math.max(400, pontos.length * 80), H = 180;
  const padL = 36, padR = 16, padT = 16, padB = 34;
  const iw = W - padL - padR, ih = H - padT - padB;
  const x = i => pontos.length === 1 ? padL + iw / 2 : padL + (i / (pontos.length - 1)) * iw;
  const y = v => padT + (1 - v / 20) * ih;
  const caminho = pontos.map((p, i) => (i === 0 ? 'M' : 'L') + x(i).toFixed(1) + ' ' + y(p.nota).toFixed(1)).join(' ');
  const pontosSvg = pontos.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.nota)}" r="4" fill="#2563eb"><title>${p.tema}: ${p.nota}/20</title></circle>
    <text x="${x(i)}" y="${y(p.nota) - 10}" text-anchor="middle" font-size="11" font-weight="700" fill="#1e293b">${p.nota}</text>
    <text x="${x(i)}" y="${H - 12}" text-anchor="middle" font-size="10" fill="#94a3b8">${new Date(p.data).toLocaleDateString('pt-BR')}</text>`).join('');
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + ih}" stroke="#e2e8f0" stroke-width="1.5"/>
    <line x1="${padL}" y1="${padT + ih}" x2="${W - padR}" y2="${padT + ih}" stroke="#e2e8f0" stroke-width="1.5"/>
    <path d="${caminho}" fill="none" stroke="#2563eb" stroke-width="2" stroke-linejoin="round"/>
    ${pontosSvg}
  </svg>`;
}

function estrelasHtml(nota) {
  let html = '<span class="estrelas">';
  for (let i = 1; i <= 5; i++) html += `<span class="${i <= nota ? 'cheia' : ''}">★</span>`;
  return html + '</span>';
}

function renderProducaoItem(p) {
  const tema = p.temaId || {};
  return `<div class="producao-item">
    <div class="producao-head" data-prod="${p._id}">
      <div>
        <h4>${tema.titulo || 'Tema removido'}</h4>
        <div class="meta">${tema.exame || ''} ${tema.nivel || ''} · Protocolo ${p.protocolo} · Enviado em ${new Date(p.dataEnvio).toLocaleDateString('pt-BR')}${p.professorId ? ' · Prof. ' + p.professorId.nome : ''}</div>
      </div>
      <div style="display:flex; align-items:center; gap:10px;">
        ${p.avaliacao?.notaTotal !== undefined ? `<strong style="color:var(--azul-escuro);">${p.avaliacao.notaTotal}/20</strong>` : ''}
        <span class="status-badge ${p.status}">${NOMES_STATUS[p.status] || p.status}</span>
      </div>
    </div>
    <div class="producao-corpo" id="prodCorpo${p._id}">
      ${p.textoDigitado ? `<div class="texto-box">${p.textoDigitado}</div>` : ''}
      <div class="arquivo-btn-row">
        ${p.arquivoOriginal?.nome ? `<button class="btn secundario pequeno" data-baixar="${p._id}|original|${encodeURIComponent(p.arquivoOriginal.nome)}">📄 Baixar original</button>` : ''}
        ${p.arquivoCorrigido?.nome ? `<button class="btn secundario pequeno" data-baixar="${p._id}|corrigido|${encodeURIComponent(p.arquivoCorrigido.nome)}">✅ Baixar corrigido</button>` : ''}
      </div>
      ${p.observacoesAluno ? `<p style="font-size:0.86rem; color:var(--cinza-600); margin-bottom:10px;"><strong>Observações do aluno:</strong> ${p.observacoesAluno}</p>` : ''}
      ${p.avaliacao?.criterios?.length ? `
        <h4 style="font-size:0.9rem; margin-bottom:8px;">Avaliação (nível estimado: ${p.avaliacao.nivelEstimado || '—'})</h4>
        ${p.avaliacao.criterios.map(c => `<div class="criterio-mini"><span>${c.nome}</span>${estrelasHtml(c.nota)}</div>`).join('')}
        ${p.avaliacao.comentarioGeral ? `<p style="font-size:0.86rem; color:var(--cinza-600); margin-top:10px;"><strong>Comentário geral:</strong> ${p.avaliacao.comentarioGeral}</p>` : ''}
      ` : '<p style="font-size:0.86rem; color:var(--cinza-400);">Ainda não avaliado.</p>'}
    </div>
  </div>`;
}

document.getElementById('producoesLista').addEventListener('click', e => {
  const head = e.target.closest('[data-prod]');
  if (head) { document.getElementById('prodCorpo' + head.dataset.prod).classList.toggle('show'); return; }
  const baixarBtn = e.target.closest('[data-baixar]');
  if (baixarBtn) {
    const [id, tipo, nome] = baixarBtn.dataset.baixar.split('|');
    baixarArquivo(id, tipo, decodeURIComponent(nome));
  }
});

async function baixarArquivo(producaoId, tipo, nomeArquivo) {
  try {
    const res = await fetch(`/api/producoes/${producaoId}/arquivo/${tipo}`, { headers: { Authorization: 'Bearer ' + token } });
    if (!res.ok) { alert('Não foi possível baixar o arquivo.'); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nomeArquivo || 'arquivo';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  } catch (err) { alert('Erro ao baixar o arquivo.'); }
}

// ===================== CONCEDER CRÉDITOS =====================
document.getElementById('concederCreditosBtn').addEventListener('click', async () => {
  const quantidade = Number(document.getElementById('credQtd').value);
  const msgEl = document.getElementById('credMsg');
  if (!quantidade || quantidade <= 0) {
    msgEl.style.display = 'block'; msgEl.className = 'msg-inline erro'; msgEl.textContent = 'Informe uma quantidade válida.';
    return;
  }
  try {
    const res = await fetch('/api/creditos', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ email: alunoAtual.email, quantidade })
    });
    const data = await res.json();
    msgEl.style.display = 'block';
    msgEl.className = 'msg-inline ' + (res.ok ? 'sucesso' : 'erro');
    msgEl.textContent = data.msg;
    if (res.ok) abrirAluno(alunoAtual._id);
  } catch (err) {
    msgEl.style.display = 'block'; msgEl.className = 'msg-inline erro'; msgEl.textContent = 'Erro ao conectar ao servidor.';
  }
});

// ===================== INIT =====================
carregarAlunos();
