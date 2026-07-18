const token = localStorage.getItem('token');
const NOMES_TIPO_DOC = {
  artigo: 'Artigo', noticia: 'Notícia', estatistica: 'Estatística', infografico: 'Infográfico',
  entrevista: 'Entrevista', cartum: 'Cartum', grafico: 'Gráfico', fotografia: 'Fotografia',
  tabela: 'Tabela', documento_oficial: 'Documento Oficial'
};

document.querySelectorAll('.top-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.top-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    ['professores', 'temas', 'creditos', 'rubricas', 'estatisticas'].forEach(v => {
      document.getElementById('tab' + v[0].toUpperCase() + v.slice(1)).style.display = v === tab.dataset.tab ? 'block' : 'none';
    });
    if (tab.dataset.tab === 'temas') carregarTemas();
    if (tab.dataset.tab === 'rubricas') carregarRubrica();
    if (tab.dataset.tab === 'estatisticas') carregarEstatisticas();
  });
});

function mostrarMsg(id, texto, erro) {
  const el = document.getElementById(id);
  el.style.display = 'block';
  el.className = 'msg-inline ' + (erro ? 'erro' : 'sucesso');
  el.textContent = texto;
}

// ===================== PROFESSORES =====================
async function carregarProfessores() {
  try {
    const res = await fetch('/api/admin/professores', { headers: { Authorization: 'Bearer ' + token } });
    const professores = await res.json();
    document.getElementById('professoresTbody').innerHTML = professores.map(p => `
      <tr>
        <td>${p.nome}</td>
        <td>${p.email}</td>
        <td>${(p.especialidades || []).map(e => `<span class="pill">${e}</span>`).join('') || '—'}</td>
        <td><button class="btn perigo pequeno" data-remover-prof="${p._id}">Remover</button></td>
      </tr>`).join('');
  } catch (err) {}
}

document.getElementById('criarProfessorBtn').addEventListener('click', async () => {
  const nome = document.getElementById('profNome').value.trim();
  const email = document.getElementById('profEmail').value.trim();
  const senha = document.getElementById('profSenha').value;
  const especialidades = Array.from(document.querySelectorAll('.profEsp:checked')).map(c => c.value);

  if (!nome || !email || !senha) { mostrarMsg('profMsg', 'Preencha nome, e-mail e senha.', true); return; }

  try {
    const res = await fetch('/api/admin/professores', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ nome, email, senha, especialidades })
    });
    const data = await res.json();
    mostrarMsg('profMsg', data.msg, !res.ok);
    if (res.ok) {
      document.getElementById('profNome').value = '';
      document.getElementById('profEmail').value = '';
      document.getElementById('profSenha').value = '';
      document.querySelectorAll('.profEsp').forEach(c => c.checked = false);
      carregarProfessores();
    }
  } catch (err) { mostrarMsg('profMsg', 'Erro ao conectar ao servidor.', true); }
});

document.getElementById('professoresTbody').addEventListener('click', async e => {
  const btn = e.target.closest('[data-remover-prof]');
  if (!btn) return;
  if (!confirm('Remover este professor? A conta voltará a ser de aluno.')) return;
  try {
    await fetch(`/api/admin/professores/${btn.dataset.removerProf}`, { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } });
    carregarProfessores();
  } catch (err) {}
});

// ===================== TEMAS =====================
let docCount = 0;
function novoDocForm() {
  const idx = docCount++;
  const div = document.createElement('div');
  div.className = 'doc-form-item';
  div.dataset.idx = idx;
  div.innerHTML = `
    <button type="button" class="remover-doc" data-remover-doc="${idx}"><img src="img/icones/x-mark.svg" alt="" style="width:0.9em; height:0.9em;"></button>
    <div class="campo-row">
      <div class="campo"><label>Tipo</label><select class="docTipo">${Object.entries(NOMES_TIPO_DOC).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
      <div class="campo"><label>Título</label><input type="text" class="docTitulo"></div>
      <div class="campo"><label>Fonte</label><input type="text" class="docFonte"></div>
      <div class="campo"><label>Autor</label><input type="text" class="docAutor"></div>
      <div class="campo"><label>Data</label><input type="text" class="docData" placeholder="2025"></div>
    </div>
    <div class="campo"><label>Conteúdo (texto completo)</label><textarea class="docConteudo"></textarea></div>`;
  document.getElementById('coletaneaForm').appendChild(div);
}
document.getElementById('addDocBtn').addEventListener('click', novoDocForm);
document.getElementById('coletaneaForm').addEventListener('click', e => {
  const btn = e.target.closest('[data-remover-doc]');
  if (btn) btn.closest('.doc-form-item').remove();
});
novoDocForm(); novoDocForm();

function atualizarCamposModalidadeTema() {
  const oral = document.getElementById('temaModalidade').value === 'oral';
  document.getElementById('campoMinPalavras').style.display = oral ? 'none' : 'flex';
  document.getElementById('campoMaxPalavras').style.display = oral ? 'none' : 'flex';
  document.getElementById('campoTempoMinimo').style.display = oral ? 'flex' : 'none';
  document.getElementById('campoTempoMaximo').style.display = oral ? 'flex' : 'none';
}
document.getElementById('temaModalidade').addEventListener('change', atualizarCamposModalidadeTema);

document.getElementById('criarTemaBtn').addEventListener('click', async () => {
  const coletanea = Array.from(document.querySelectorAll('.doc-form-item')).map(item => ({
    tipo: item.querySelector('.docTipo').value,
    titulo: item.querySelector('.docTitulo').value.trim(),
    fonte: item.querySelector('.docFonte').value.trim(),
    autor: item.querySelector('.docAutor').value.trim(),
    data: item.querySelector('.docData').value.trim(),
    conteudo: item.querySelector('.docConteudo').value.trim()
  })).filter(d => d.titulo && d.conteudo);

  const modalidade = document.getElementById('temaModalidade').value;
  const corpo = {
    titulo: document.getElementById('temaTitulo').value.trim(),
    exame: document.getElementById('temaExame').value,
    nivel: document.getElementById('temaNivel').value,
    modalidade,
    dificuldade: document.getElementById('temaDificuldade').value,
    tipoProducao: document.getElementById('temaTipoProducao').value.trim(),
    descricao: document.getElementById('temaDescricao').value.trim(),
    objetivos: document.getElementById('temaObjetivos').value.split('\n').map(s => s.trim()).filter(Boolean),
    instrucoes: document.getElementById('temaInstrucoes').value.trim(),
    criteriosResumo: document.getElementById('temaCriteriosResumo').value.split('\n').map(s => s.trim()).filter(Boolean),
    competenciasAvaliadas: document.getElementById('temaCompetencias').value.split('\n').map(s => s.trim()).filter(Boolean),
    tempoSugerido: Number(document.getElementById('temaTempo').value),
    creditosNecessarios: Number(document.getElementById('temaCreditos').value),
    coletanea
  };
  if (modalidade === 'oral') {
    corpo.tempoMinimoSegundos = Number(document.getElementById('temaTempoMinimo').value);
    corpo.tempoMaximoSegundos = Number(document.getElementById('temaTempoMaximo').value);
  } else {
    corpo.limitePalavrasMin = Number(document.getElementById('temaMinPalavras').value);
    corpo.limitePalavrasMax = Number(document.getElementById('temaMaxPalavras').value);
  }

  if (!corpo.titulo || !corpo.descricao || !corpo.instrucoes || !corpo.tipoProducao) {
    mostrarMsg('temaMsg', 'Preencha ao menos título, tipo de produção, descrição e instruções.', true);
    return;
  }

  try {
    const res = await fetch('/api/temas', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify(corpo)
    });
    const data = await res.json();
    if (res.ok) {
      mostrarMsg('temaMsg', 'Tema criado com sucesso!', false);
      carregarTemas();
    } else {
      mostrarMsg('temaMsg', data.msg || 'Erro ao criar tema.', true);
    }
  } catch (err) { mostrarMsg('temaMsg', 'Erro ao conectar ao servidor.', true); }
});

async function carregarTemas() {
  try {
    const res = await fetch('/api/temas?todos=1', { headers: { Authorization: 'Bearer ' + token } });
    const temas = await res.json();
    document.getElementById('temasTbody').innerHTML = temas.map(t => `
      <tr>
        <td>${t.titulo} <span class="pill">${t.modalidade === 'oral' ? '<img class="titulo-icone-inline pequeno" src="img/icones/mic.svg" alt="">Oral' : '<img class="titulo-icone-inline pequeno" src="img/icones/writing-hand.svg" alt="">Textual'}</span></td>
        <td>${t.exame} · ${t.nivel}</td>
        <td><span class="pill ${t.ativo ? '' : 'inativo'}">${t.ativo ? 'Ativo' : 'Inativo'}</span></td>
        <td>${t.ativo ? `<button class="btn perigo pequeno" data-desativar-tema="${t._id}">Desativar</button>` : ''}</td>
      </tr>`).join('');
  } catch (err) {}
}
document.getElementById('temasTbody').addEventListener('click', async e => {
  const btn = e.target.closest('[data-desativar-tema]');
  if (!btn) return;
  if (!confirm('Desativar este tema? Ele deixará de aparecer no catálogo do aluno.')) return;
  try {
    await fetch(`/api/temas/${btn.dataset.desativarTema}`, { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } });
    carregarTemas();
  } catch (err) {}
});

// ===================== CRÉDITOS =====================
document.getElementById('concederCreditosBtn').addEventListener('click', async () => {
  const email = document.getElementById('credEmail').value.trim();
  const quantidade = Number(document.getElementById('credQtd').value);
  if (!email || !quantidade) { mostrarMsg('credMsg', 'Informe e-mail e quantidade.', true); return; }
  try {
    const res = await fetch('/api/creditos', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ email, quantidade })
    });
    const data = await res.json();
    mostrarMsg('credMsg', data.msg, !res.ok);
  } catch (err) { mostrarMsg('credMsg', 'Erro ao conectar ao servidor.', true); }
});

// ===================== RUBRICAS =====================
function novoCriterioForm(nome, peso, descricao) {
  const div = document.createElement('div');
  div.className = 'criterio-edit-row';
  div.innerHTML = `
    <input type="text" class="critNome" placeholder="Nome do critério" value="${nome || ''}">
    <input type="number" class="critPeso" placeholder="Peso" value="${peso || 1}">
    <input type="text" class="critDesc" placeholder="Descrição" value="${descricao || ''}">
    <button type="button" class="btn perigo pequeno" data-remover-criterio><img src="img/icones/x-mark.svg" alt="" style="width:0.9em; height:0.9em;"></button>`;
  document.getElementById('criteriosRubricaForm').appendChild(div);
}
document.getElementById('addCriterioBtn').addEventListener('click', () => novoCriterioForm());
document.getElementById('criteriosRubricaForm').addEventListener('click', e => {
  const btn = e.target.closest('[data-remover-criterio]');
  if (btn) btn.closest('.criterio-edit-row').remove();
});
document.getElementById('rubricaExameSelect').addEventListener('change', carregarRubrica);
document.getElementById('rubricaModalidadeSelect').addEventListener('change', carregarRubrica);

async function carregarRubrica() {
  document.getElementById('criteriosRubricaForm').innerHTML = '';
  try {
    const exame = document.getElementById('rubricaExameSelect').value;
    const modalidade = document.getElementById('rubricaModalidadeSelect').value;
    const res = await fetch(`/api/temas/rubrica/${exame}?modalidade=${modalidade}`, { headers: { Authorization: 'Bearer ' + token } });
    if (res.ok) {
      const r = await res.json();
      (r.criterios || []).forEach(c => novoCriterioForm(c.nome, c.peso, c.descricao));
      document.getElementById('rubricaNotaMaxima').value = r.notaMaxima || 20;
    } else {
      novoCriterioForm();
    }
  } catch (err) {}
}

document.getElementById('salvarRubricaBtn').addEventListener('click', async () => {
  const exame = document.getElementById('rubricaExameSelect').value;
  const criterios = Array.from(document.querySelectorAll('.criterio-edit-row')).map(row => ({
    nome: row.querySelector('.critNome').value.trim(),
    peso: Number(row.querySelector('.critPeso').value) || 1,
    descricao: row.querySelector('.critDesc').value.trim()
  })).filter(c => c.nome);

  if (criterios.length === 0) { mostrarMsg('rubricaMsg', 'Adicione ao menos um critério.', true); return; }

  try {
    const modalidade = document.getElementById('rubricaModalidadeSelect').value;
    const res = await fetch(`/api/admin/rubricas/${exame}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ criterios, notaMaxima: Number(document.getElementById('rubricaNotaMaxima').value) || 20, modalidade })
    });
    const data = await res.json();
    mostrarMsg('rubricaMsg', res.ok ? 'Rubrica salva com sucesso!' : (data.msg || 'Erro ao salvar.'), !res.ok);
  } catch (err) { mostrarMsg('rubricaMsg', 'Erro ao conectar ao servidor.', true); }
});

// ===================== ESTATÍSTICAS =====================
const NOMES_STATUS = {
  rascunho: 'Rascunho', aguardando_envio: 'Aguardando envio', enviado: 'Enviado', em_fila: 'Em fila',
  em_correcao: 'Em correção', aguardando_revisao: 'Aguardando revisão', corrigido: 'Corrigido',
  devolvido: 'Devolvido', arquivado: 'Arquivado', cancelado: 'Cancelado'
};
async function carregarEstatisticas() {
  try {
    const res = await fetch('/api/admin/estatisticas', { headers: { Authorization: 'Bearer ' + token } });
    const s = await res.json();
    document.getElementById('statsKpiRow').innerHTML = `
      <div class="kpi"><div class="valor">${s.total}</div><div class="rotulo">Total de produções</div></div>
      ${Object.entries(s.porStatus).map(([k, v]) => `<div class="kpi"><div class="valor">${v}</div><div class="rotulo">${NOMES_STATUS[k] || k}</div></div>`).join('')}`;
    document.getElementById('statsProfessorTbody').innerHTML = s.porProfessor.map(p => `
      <tr><td>${p.nome}</td><td>${p.concluidas}</td><td>${p.tempoMedioHoras !== null ? p.tempoMedioHoras + 'h' : '—'}</td></tr>`).join('') || '<tr><td colspan="3">Nenhum professor cadastrado.</td></tr>';
  } catch (err) {}
}

// ===================== INIT =====================
carregarProfessores();
