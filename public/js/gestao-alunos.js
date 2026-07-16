const token = localStorage.getItem('token');
const NOMES_STATUS = {
  rascunho: 'Rascunho', aguardando_envio: 'Aguardando envio', enviado: 'Enviado', em_fila: 'Em fila',
  em_correcao: 'Em correção', aguardando_revisao: 'Aguardando revisão', corrigido: 'Corrigido',
  devolvido: 'Devolvido', arquivado: 'Arquivado', cancelado: 'Cancelado'
};
const NOMES_HISTORICO_ICONE = {
  conta_criada: '👤', primeiro_login: '🔑', primeira_producao: '✍️',
  conclusao_curso: '🎓', mudanca_plano: '🔄', renovacao: '♻️'
};

let alunoAtual = null;
let abaAtual = 'ativo';
let filtrosOpcoesCarregadas = false;

function mostrarView(nome) {
  document.getElementById('viewLista').style.display = nome === 'lista' ? 'block' : 'none';
  document.getElementById('viewDetalhe').style.display = nome === 'detalhe' ? 'block' : 'none';
}
document.getElementById('voltarListaBtn').addEventListener('click', () => { mostrarView('lista'); carregarAlunos(); });

// ===================== FILTROS =====================
async function carregarFiltrosOpcoes() {
  try {
    const res = await fetch('/api/equipe/filtros-opcoes', { headers: { Authorization: 'Bearer ' + token } });
    if (!res.ok) return;
    const data = await res.json();
    preencherSelect('filtroPlano', data.tiers);
    preencherSelect('filtroCurso', data.cursos);
    preencherSelect('filtroTipoProva', data.tiposProva);
    preencherSelect('filtroProfessor', data.professores.map(p => ({ value: p._id, label: p.nome })));
    filtrosOpcoesCarregadas = true;
  } catch (err) { /* filtros ficam com só "Todos" se isso falhar */ }
}
function preencherSelect(id, itens) {
  const sel = document.getElementById(id);
  itens.forEach(item => {
    const opt = document.createElement('option');
    if (typeof item === 'string') { opt.value = item; opt.textContent = item; }
    else { opt.value = item.value; opt.textContent = item.label; }
    sel.appendChild(opt);
  });
}

document.getElementById('toggleFiltrosBtn').addEventListener('click', () => {
  document.getElementById('filtrosPainel').classList.toggle('show');
});
['filtroPlano', 'filtroCurso', 'filtroTipoProva', 'filtroProfessor'].forEach(id => {
  document.getElementById(id).addEventListener('change', carregarAlunos);
});
['filtroProducaoPendente', 'filtroCorrecaoPendente'].forEach(id => {
  document.getElementById(id).addEventListener('change', carregarAlunos);
});
document.getElementById('tabsRow').addEventListener('click', e => {
  const pill = e.target.closest('.tab-pill');
  if (!pill) return;
  abaAtual = pill.dataset.tab;
  document.querySelectorAll('.tab-pill').forEach(p => p.classList.toggle('active', p === pill));
  carregarAlunos();
});

// ===================== LISTA DE ALUNOS =====================
async function carregarAlunos() {
  const params = new URLSearchParams();
  const busca = document.getElementById('buscaInput').value.trim();
  if (busca) params.set('busca', busca);
  params.set('status', abaAtual);

  const plano = document.getElementById('filtroPlano').value;
  const curso = document.getElementById('filtroCurso').value;
  const tipoProva = document.getElementById('filtroTipoProva').value;
  const professorId = document.getElementById('filtroProfessor').value;
  if (plano) params.set('plano', plano);
  if (curso) params.set('curso', curso);
  if (tipoProva) params.set('tipoProva', tipoProva);
  if (professorId) params.set('professorId', professorId);
  if (document.getElementById('filtroProducaoPendente').checked) params.set('producaoPendente', 'true');
  if (document.getElementById('filtroCorrecaoPendente').checked) params.set('correcaoPendente', 'true');

  const lista = document.getElementById('alunosLista');
  lista.innerHTML = '<p style="opacity:0.6;">Carregando alunos...</p>';
  try {
    const res = await fetch(`/api/equipe/alunos?${params}`, { headers: { Authorization: 'Bearer ' + token } });
    const data = await res.json();
    const alunos = data.alunos || [];

    document.getElementById('tabCountAtivo').textContent = `(${data.totalAtivos ?? 0})`;
    document.getElementById('tabCountExpirado').textContent = `(${data.totalExpirados ?? 0})`;
    document.getElementById('listaKpiRow').innerHTML = `
      <div class="kpi"><div class="valor">${data.total ?? 0}</div><div class="rotulo">Total de alunos</div></div>
      <div class="kpi"><div class="valor">${data.totalAtivos ?? 0}</div><div class="rotulo">Ativos</div></div>
      <div class="kpi"><div class="valor">${data.totalExpirados ?? 0}</div><div class="rotulo">Expirados</div></div>`;

    if (!alunos.length) {
      lista.innerHTML = `<div class="vazio-box">Nenhum aluno ${abaAtual === 'ativo' ? 'ativo' : 'expirado'} encontrado.</div>`;
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
      ${a.temProducaoPendente ? '<span class="pill sem-plano">Produção pendente</span>' : ''}
      ${a.temCorrecaoPendente ? '<span class="pill creditos">Correção pendente</span>' : ''}
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

function formatarTempo(segundos) {
  if (!segundos) return '0h';
  const horas = Math.floor(segundos / 3600);
  const minutos = Math.round((segundos % 3600) / 60);
  return horas ? `${horas}h ${minutos}min` : `${minutos}min`;
}

function renderDetalhe(data) {
  const a = data.aluno;
  document.getElementById('detalheNome').textContent = a.nome;
  document.getElementById('detalheEmail').textContent = a.email;
  document.getElementById('credMsg').style.display = 'none';

  document.getElementById('detalheDadosPessoais').innerHTML = `
    ${a.telefone ? `Telefone: ${a.telefone}` : ''}${a.whatsapp ? ` · WhatsApp: ${a.whatsapp}` : ''}<br>
    Cadastrado em ${new Date(a.criadoEm).toLocaleDateString('pt-BR')}
    ${a.ultimoAcessoEm ? ` · Último acesso em ${new Date(a.ultimoAcessoEm).toLocaleDateString('pt-BR')}` : ''}
    ${a.idioma ? ` · Idioma: ${a.idioma}` : ''}${a.tema ? ` · Tema: ${a.tema}` : ''}`;

  const planoTag = a.plano?.ativo
    ? `<span class="pill">Plano ${a.plano.tier} · ${a.plano.curso || ''}</span>`
    : `<span class="pill sem-plano">Sem plano ativo</span>`;
  document.getElementById('detalhePills').innerHTML = `
    ${planoTag}
    <span class="pill creditos">${a.creditosCorrecao || 0} créditos disponíveis</span>
    ${a.provaAlvo ? `<span class="pill">Prova alvo: ${a.provaAlvo}</span>` : ''}
    ${a.dataProva ? `<span class="pill">Data da prova: ${new Date(a.dataProva).toLocaleDateString('pt-BR')}</span>` : ''}`;

  // ===== Planos ativos =====
  const planosEl = document.getElementById('planosLista');
  planosEl.innerHTML = data.planos.length ? data.planos.map(p => `
    <div class="plano-card ${p.ativo ? '' : 'expirado'}">
      <div>
        <h4>${p.nome}</h4>
        <div class="meta">
          ${p.dataInicio ? 'Início: ' + new Date(p.dataInicio).toLocaleDateString('pt-BR') + ' · ' : ''}
          ${p.dataVencimento ? 'Vencimento: ' + new Date(p.dataVencimento).toLocaleDateString('pt-BR') : 'Sem data de vencimento'}
        </div>
      </div>
      <span class="status-badge ${p.ativo ? 'corrigido' : 'cancelado'}">
        ${p.ativo ? (p.tempoRestanteDias !== null ? p.tempoRestanteDias + ' dias restantes' : 'Ativo') : 'Expirado'}
      </span>
    </div>`).join('') : '<div class="vazio-box">Nenhum plano registrado.</div>';

  // ===== Estatísticas =====
  const s = data.estatisticas;
  document.getElementById('statsKpiRow').innerHTML = `
    <div class="kpi"><div class="valor">${s.redacoesEnviadas}</div><div class="rotulo">Redações enviadas</div></div>
    <div class="kpi"><div class="valor">${s.corrigidas}</div><div class="rotulo">Corrigidas</div></div>
    <div class="kpi"><div class="valor">${s.emAndamento}</div><div class="rotulo">Em andamento</div></div>
    <div class="kpi"><div class="valor">${s.notaMedia !== null ? s.notaMedia : '—'}</div><div class="rotulo">Nota média</div></div>
    <div class="kpi"><div class="valor">${s.aulasAssistidas}</div><div class="rotulo">Aulas assistidas</div></div>
    <div class="kpi"><div class="valor">${formatarTempo(s.tempoAssistidoSegundos)}</div><div class="rotulo">Tempo estudado</div></div>
    <div class="kpi"><div class="valor">${s.streakDias}</div><div class="rotulo">Maior sequência (dias)</div></div>`;

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

  // ===== Progressão nas Aulas =====
  const progEl = document.getElementById('progressaoAulasBox');
  let progHtml = '';
  if (data.progressaoAulas?.length) {
    progHtml += data.progressaoAulas.map(p => `<div class="bar-list-row">
      <span class="bar-list-label">${p.curso}</span>
      <div class="bar-list-track"><div class="bar-list-fill" style="width:${p.percentual}%;"></div></div>
      <span class="bar-list-val">${p.percentual}%</span>
    </div>`).join('');
  } else {
    progHtml += '<p style="color:var(--cinza-400); font-size:0.9rem;">Este aluno ainda não assistiu nenhuma aula.</p>';
  }
  if (s.ultimaAula) {
    progHtml += `<p style="font-size:0.86rem; margin-top:14px;"><strong>Última aula assistida:</strong> ${s.ultimaAula.titulo} (${new Date(s.ultimaAula.data).toLocaleDateString('pt-BR')})</p>`;
  }
  if (s.proximaAulaRecomendada) {
    progHtml += `<p style="font-size:0.86rem; margin-top:6px;"><strong>Próxima aula recomendada:</strong> ${s.proximaAulaRecomendada.titulo}${s.proximaAulaRecomendada.moduloTitulo ? ' — ' + s.proximaAulaRecomendada.moduloTitulo : ''}</p>`;
  }
  progEl.innerHTML = progHtml;

  // ===== Produções =====
  document.getElementById('producoesLista').innerHTML = data.producoes.length
    ? data.producoes.map(renderProducaoItem).join('')
    : '<div class="vazio-box">Este aluno ainda não enviou nenhuma produção.</div>';

  // ===== Histórico =====
  const histEl = document.getElementById('historicoLista');
  histEl.innerHTML = data.historico.length ? data.historico.map(h => `
    <div class="timeline-item">
      <div class="timeline-titulo">${NOMES_HISTORICO_ICONE[h.tipo] || '•'} ${h.titulo}</div>
      ${h.descricao ? `<div class="timeline-desc">${h.descricao}</div>` : ''}
      <div class="timeline-data">${new Date(h.data).toLocaleDateString('pt-BR')}</div>
    </div>`).join('') : '<div class="vazio-box">Sem eventos registrados.</div>';
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
carregarFiltrosOpcoes();
carregarAlunos();
