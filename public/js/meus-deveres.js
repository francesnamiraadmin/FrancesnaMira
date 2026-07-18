function authHeaders(json) {
  const token = localStorage.getItem('token');
  return Object.assign({ Authorization: 'Bearer ' + token }, json ? { 'Content-Type': 'application/json' } : {});
}

const STATUS_LABEL = { em_andamento: 'Em andamento', atrasado: 'Atrasado', concluido: 'Concluído' };

let minhasSemanas = [];

function mostrarView(nome) {
  document.getElementById('viewLista').style.display = nome === 'lista' ? 'block' : 'none';
  document.getElementById('viewDetalhe').style.display = nome === 'detalhe' ? 'block' : 'none';
}
document.getElementById('voltarListaBtn').addEventListener('click', () => { mostrarView('lista'); carregarSemanas(); });

async function carregarSemanas() {
  const grid = document.getElementById('semanasGrid');
  try {
    const res = await fetch('/api/deveres/minhas-semanas', { headers: authHeaders() });
    minhasSemanas = res.ok ? await res.json() : [];
    if (!minhasSemanas.length) {
      grid.innerHTML = '<div class="vazio-box">Você ainda não tem nenhum dever de casa atribuído. Fale com seu professor.</div>';
      return;
    }
    grid.innerHTML = minhasSemanas.map(renderSemanaCard).join('');
  } catch (err) {
    grid.innerHTML = '<div class="vazio-box">Erro ao carregar seus deveres.</div>';
  }
}

function renderSemanaCard(d) {
  const totalObrig = d.atividades.filter(a => a.obrigatoria).length;
  const feitasObrig = d.atividades.filter(a => a.obrigatoria && a.entrega?.status === 'enviado').length;
  const pct = totalObrig ? Math.round((feitasObrig / totalObrig) * 100) : 100;
  const diasRestantes = Math.ceil((new Date(d.dataLimite) - new Date()) / (24 * 60 * 60 * 1000));
  const tempoTexto = d.status === 'concluido' ? 'Concluído' : diasRestantes >= 0 ? `${diasRestantes} dia${diasRestantes === 1 ? '' : 's'} restante${diasRestantes === 1 ? '' : 's'}` : `Atrasado há ${Math.abs(diasRestantes)} dia${Math.abs(diasRestantes) === 1 ? '' : 's'}`;
  return `<div class="semana-card-aluno">
    <span class="status-tag ${d.status}">${STATUS_LABEL[d.status]}</span>
    <h3>Semana ${d.numeroSemana}</h3>
    <div class="meta">${d.titulo}</div>
    <div class="progress-track"><div class="progress-fill" style="width:${pct}%;"></div></div>
    <div class="meta">${pct}% concluído · Prazo: ${new Date(d.dataLimite).toLocaleDateString('pt-BR')} · ${tempoTexto}</div>
    <button class="dash-btn pequeno" style="margin-top:12px;" data-abrir="${d._id}">Abrir</button>
  </div>`;
}
document.getElementById('semanasGrid').addEventListener('click', e => {
  const btn = e.target.closest('[data-abrir]');
  if (btn) abrirSemana(btn.dataset.abrir);
});

let semanaAbertaId = null;

// Qualquer widget embutido (player/editor/gravador/formulário genérico) chama
// isso quando algo muda — em vez de tentar reaproveitar o formato de resposta
// de cada um (são todos diferentes), só rebusca a semana atual da API e
// redesenha. Simples e sempre correto.
async function recarregarSemanaAberta() {
  if (!semanaAbertaId) return;
  const res = await fetch(`/api/deveres/minhas-semanas/${semanaAbertaId}`, { headers: authHeaders() });
  if (!res.ok) return;
  const dever = await res.json();
  const idx = minhasSemanas.findIndex(s => s._id === semanaAbertaId);
  if (idx >= 0) minhasSemanas[idx] = dever;
  renderDetalheSemana(dever);
}

function renderDetalheSemana(d) {
  document.getElementById('detalheTitulo').textContent = `Semana ${d.numeroSemana} — ${d.titulo}`;
  document.getElementById('detalheMeta').textContent = `Prazo: ${new Date(d.dataLimite).toLocaleDateString('pt-BR')} · Status: ${STATUS_LABEL[d.status]}`;

  const lista = document.getElementById('atividadesLista');
  lista.innerHTML = '';
  d.atividades.forEach((a, i) => {
    const card = document.createElement('div');
    card.className = 'atividade-aluno';
    lista.appendChild(card);
    DeverWorkspace.renderAtividade(card, a, i, { deverId: d._id, onAtualizado: recarregarSemanaAberta });
  });

  const rodape = document.createElement('div');
  rodape.style.marginTop = '10px';
  if (d.status !== 'concluido') {
    rodape.innerHTML = `<button class="dash-btn" id="concluirDeverBtn">${d.podeConcluir ? 'Marcar semana como concluída' : 'Conclua as atividades obrigatórias primeiro'}</button><div class="msg-inline" id="concluirMsg"></div>`;
    if (!d.podeConcluir) rodape.querySelector('#concluirDeverBtn').disabled = true;
  } else {
    rodape.innerHTML = '<p style="opacity:0.8;"><img class="titulo-icone-inline pequeno" src="img/icones/check.svg" alt="">Você já concluiu esta semana.</p>';
  }
  lista.appendChild(rodape);
}

function abrirSemana(id) {
  const d = minhasSemanas.find(x => x._id === id);
  if (!d) return;
  semanaAbertaId = id;
  renderDetalheSemana(d);
  mostrarView('detalhe');
  window.scrollTo(0, 0);
}

document.getElementById('atividadesLista').addEventListener('click', async e => {
  const btn = e.target.closest('#concluirDeverBtn');
  if (!btn || btn.disabled) return;
  const msgEl = document.getElementById('concluirMsg');
  try {
    const res = await fetch(`/api/deveres/minhas-semanas/${semanaAbertaId}/concluir`, { method: 'POST', headers: authHeaders() });
    const data = await res.json();
    if (!res.ok) { msgEl.className = 'msg-inline erro'; msgEl.textContent = data.msg; return; }
    const idxSemana = minhasSemanas.findIndex(s => s._id === semanaAbertaId);
    if (idxSemana >= 0) minhasSemanas[idxSemana] = data;
    renderDetalheSemana(data);
  } catch (err) {
    msgEl.className = 'msg-inline erro'; msgEl.textContent = 'Erro ao conectar ao servidor.';
  }
});

// ===================== TEMPO REAL =====================
// Se o aluno assistir uma aula ou uma produção for corrigida em outra aba (ou
// pelo player embutido aqui mesmo), atualiza sem precisar recarregar a página.
DeverRealtime.escutar({
  'dever-atualizado': dados => { if (dados.alunoId === DeverRealtime.meuUserId()) semanaAbertaId ? recarregarSemanaAberta() : carregarSemanas(); },
  'aula-progresso-atualizado': dados => { if (dados.userId === DeverRealtime.meuUserId()) semanaAbertaId ? recarregarSemanaAberta() : carregarSemanas(); },
  'producao-atualizada': dados => { if (dados.alunoId === DeverRealtime.meuUserId()) semanaAbertaId ? recarregarSemanaAberta() : carregarSemanas(); }
});

// ===================== INIT =====================
carregarSemanas();
