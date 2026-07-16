function authHeaders(json) {
  const token = localStorage.getItem('token');
  return Object.assign({ Authorization: 'Bearer ' + token }, json ? { 'Content-Type': 'application/json' } : {});
}

const STATUS_LABEL = { em_andamento: 'Em andamento', atrasado: 'Atrasado', concluido: 'Concluído' };
const NOMES_TIPO_ALUNO = DeverUI ? DeverUI.NOMES_TIPO : {};

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

function conteudoHtml(a) {
  const c = a.conteudo || {};
  if (c.url) return `<a href="${c.url}" target="_blank" rel="noopener" class="dash-btn secundario pequeno">Abrir link</a>`;
  if (c.texto) return `<div class="texto-box" style="background:var(--glass-bg); padding:12px 14px; border-radius:10px; font-size:0.88rem; white-space:pre-wrap;">${c.texto}</div>`;
  if (c.temaId?.titulo) return `<p style="font-size:0.85rem;">Tema: <strong>${c.temaId.titulo}</strong> — envie sua produção pela tela de Correções.</p>`;
  if (c.aulaId?.titulo) return `<a href="aulas-especializadas.html?aula=${c.aulaId._id}&modulo=${c.moduloId?._id || ''}" class="dash-btn secundario pequeno">Assistir: ${c.aulaId.titulo}</a>`;
  if (c.moduloId?.titulo) return `<a href="aulas-especializadas.html?modulo=${c.moduloId._id}" class="dash-btn secundario pequeno">Ver módulo: ${c.moduloId.titulo}</a>`;
  return '';
}

function labelEntrega(a) {
  if (a.entrega?.status === 'enviado') return a.entrega.entregueComAtraso ? 'Entregue com atraso' : 'Entregue';
  return a.entrega?.atrasada ? 'Pendente em atraso' : 'Pendente';
}

function renderAtividadeAluno(a, deverId, index) {
  const jaEnviado = a.entrega?.status === 'enviado';
  return `<div class="atividade-aluno">
    <h4>${a.titulo}${a.obrigatoria ? '' : ' <span style="font-weight:400; opacity:0.7; font-size:0.78rem;">(opcional)</span>'}</h4>
    <div class="meta">${NOMES_TIPO_ALUNO[a.tipo] || a.tipo} · ${labelEntrega(a)}</div>
    ${a.descricao ? `<p style="font-size:0.88rem; margin-bottom:10px;">${a.descricao}</p>` : ''}
    <div style="margin-bottom:10px;">${conteudoHtml(a)}</div>
    ${jaEnviado && a.entrega.arquivo?.nome ? `<button class="dash-btn secundario pequeno" data-baixar="${deverId}|${index}|${encodeURIComponent(a.entrega.arquivo.nome)}">📎 Baixar meu envio: ${a.entrega.arquivo.nome}</button>` : ''}
    ${jaEnviado && a.entrega.texto ? `<div class="texto-box" style="background:var(--glass-bg); padding:10px 14px; border-radius:10px; font-size:0.85rem; margin-top:8px;">${a.entrega.texto}</div>` : ''}
    ${a.entrega?.comentarioProfessor ? `<div class="comentario-prof"><strong>Comentário do professor:</strong> ${a.entrega.comentarioProfessor}</div>` : ''}

    <div class="envio-form">
      <textarea placeholder="Escreva sua resposta (opcional se for enviar arquivo)..." data-texto-input="${deverId}|${index}"></textarea>
      <input type="file" data-arquivo-input="${deverId}|${index}">
      <div style="display:flex; align-items:center; gap:10px;">
        <button class="dash-btn pequeno" data-enviar="${deverId}|${index}">${jaEnviado ? 'Substituir envio' : 'Enviar'}</button>
        <span class="msg-inline" data-msg-envio="${deverId}|${index}"></span>
      </div>
    </div>
  </div>`;
}

function abrirSemana(id) {
  const d = minhasSemanas.find(x => x._id === id);
  if (!d) return;
  document.getElementById('detalheTitulo').textContent = `Semana ${d.numeroSemana} — ${d.titulo}`;
  document.getElementById('detalheMeta').textContent = `Prazo: ${new Date(d.dataLimite).toLocaleDateString('pt-BR')} · Status: ${STATUS_LABEL[d.status]}`;
  document.getElementById('atividadesLista').innerHTML = d.atividades.map((a, i) => renderAtividadeAluno(a, d._id, i)).join('') +
    (d.status !== 'concluido'
      ? `<button class="dash-btn" id="concluirDeverBtn" data-dever="${d._id}">Marcar semana como concluída</button><div class="msg-inline" id="concluirMsg"></div>`
      : '<p style="opacity:0.8;">✅ Você já concluiu esta semana.</p>');
  mostrarView('detalhe');
  window.scrollTo(0, 0);
}

document.getElementById('atividadesLista').addEventListener('click', async e => {
  const baixarBtn = e.target.closest('[data-baixar]');
  if (baixarBtn) {
    const [deverId, index, nome] = baixarBtn.dataset.baixar.split('|');
    const res = await fetch(`/api/deveres/deveres/${deverId}/atividades/${index}/arquivo`, { headers: authHeaders() });
    if (!res.ok) { alert('Não foi possível baixar o arquivo.'); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = decodeURIComponent(nome);
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    return;
  }

  const enviarBtn = e.target.closest('[data-enviar]');
  if (enviarBtn) {
    const [deverId, index] = enviarBtn.dataset.enviar.split('|');
    const texto = document.querySelector(`[data-texto-input="${deverId}|${index}"]`).value;
    const arquivoInput = document.querySelector(`[data-arquivo-input="${deverId}|${index}"]`);
    const msgEl = document.querySelector(`[data-msg-envio="${deverId}|${index}"]`);
    if (!texto.trim() && !arquivoInput.files[0]) {
      msgEl.className = 'msg-inline erro'; msgEl.textContent = 'Escreva um texto ou selecione um arquivo.'; return;
    }
    const form = new FormData();
    if (texto.trim()) form.append('texto', texto.trim());
    if (arquivoInput.files[0]) form.append('arquivo', arquivoInput.files[0]);
    enviarBtn.disabled = true;
    try {
      const res = await fetch(`/api/deveres/minhas-semanas/${deverId}/atividades/${index}/enviar`, {
        method: 'POST', headers: authHeaders(), body: form
      });
      const data = await res.json();
      if (!res.ok) { msgEl.className = 'msg-inline erro'; msgEl.textContent = data.msg || 'Erro ao enviar.'; return; }
      msgEl.className = 'msg-inline sucesso'; msgEl.textContent = 'Enviado com sucesso!';
      const idxSemana = minhasSemanas.findIndex(s => s._id === deverId);
      if (idxSemana >= 0) minhasSemanas[idxSemana] = data;
      setTimeout(() => abrirSemana(deverId), 800);
    } catch (err) {
      msgEl.className = 'msg-inline erro'; msgEl.textContent = 'Erro ao conectar ao servidor.';
    } finally {
      enviarBtn.disabled = false;
    }
  }
});

document.getElementById('atividadesLista').addEventListener('click', async e => {
  const btn = e.target.closest('#concluirDeverBtn');
  if (!btn) return;
  const msgEl = document.getElementById('concluirMsg');
  try {
    const res = await fetch(`/api/deveres/minhas-semanas/${btn.dataset.dever}/concluir`, { method: 'POST', headers: authHeaders() });
    const data = await res.json();
    if (!res.ok) { msgEl.className = 'msg-inline erro'; msgEl.textContent = data.msg; return; }
    const idxSemana = minhasSemanas.findIndex(s => s._id === btn.dataset.dever);
    if (idxSemana >= 0) minhasSemanas[idxSemana] = data;
    abrirSemana(btn.dataset.dever);
  } catch (err) {
    msgEl.className = 'msg-inline erro'; msgEl.textContent = 'Erro ao conectar ao servidor.';
  }
});

// ===================== INIT =====================
carregarSemanas();
