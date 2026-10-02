const token = localStorage.getItem('token');
function authHeaders(json) {
  const h = { Authorization: 'Bearer ' + token };
  if (json) h['Content-Type'] = 'application/json';
  return h;
}
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

const DIAS_LABEL = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const ORDEM_DIAS = [1, 2, 3, 4, 5, 6, 0]; // Seg..Dom
const HORAS_POR_PERIODO = {
  diurno: ["06:00", "07:00", "08:00", "09:00", "10:00", "11:00"],
  vespertino: ["12:00", "13:00", "14:00", "15:00", "16:00", "17:00"],
  noturno: ["18:00", "19:00", "20:00", "21:00", "22:00", "23:00", "00:00"]
};
HORAS_POR_PERIODO.todos = HORAS_POR_PERIODO.diurno.concat(HORAS_POR_PERIODO.vespertino, HORAS_POR_PERIODO.noturno);
const NOME_MODALIDADE = { particular: 'Particular', turma: 'Turma' };

// Grade única: aula particular e aula em turma juntas (um horário só pode ter uma das duas).
let modalidadeAtual = 'particular';   // padrão do modal « novo horário »
let periodoAtual = 'todos';
let verModalidade = 'todas';
let gradeCompleta = [];
let slotSelecionado = null;

// ===================== TIPOS DE AULA (filtro por curso) =====================
const TIPOS_CURSO = ["TCF", "DELF", "DALF", "TEF", "A1", "A2", "B1", "B2"];

function montarTiposChips(containerId) {
  document.getElementById(containerId).innerHTML = TIPOS_CURSO.map(t =>
    '<label class="tipo-chip"><input type="checkbox" value="' + t + '"> ' + t + '</label>'
  ).join('');
}
function marcarCursos(containerId, cursos) {
  const set = new Set(cursos || []);
  document.querySelectorAll('#' + containerId + ' input').forEach(inp => {
    inp.checked = set.has(inp.value);
    inp.closest('.tipo-chip').classList.toggle('checked', inp.checked);
  });
}
function lerCursosMarcados(containerId) {
  return Array.from(document.querySelectorAll('#' + containerId + ' input:checked')).map(i => i.value);
}
document.addEventListener('change', e => {
  const chip = e.target.closest('.tipo-chip');
  if (!chip) return;
  chip.classList.toggle('checked', e.target.checked);
});
montarTiposChips('novoCursosGrid');
montarTiposChips('detalheCursosGrid');

// ===================== FILTROS =====================
document.getElementById('guModalidade').addEventListener('click', e => {
  const btn = e.target.closest('[data-ver]');
  if (!btn) return;
  document.querySelectorAll('#guModalidade .periodo-tab').forEach(b => b.classList.toggle('active', b === btn));
  verModalidade = btn.dataset.ver;
  renderGrade();
});

document.getElementById('periodoTabsAdmin').addEventListener('click', e => {
  const btn = e.target.closest('.periodo-tab');
  if (!btn) return;
  document.querySelectorAll('#periodoTabsAdmin .periodo-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  periodoAtual = btn.dataset.periodo;
  renderGrade();
});

// ===================== GRADE =====================
async function carregarGrade() {
  const tabela = document.getElementById('gradeAdmin');
  tabela.innerHTML = '<tr><td class="vazio-aviso">Carregando…</td></tr>';
  try {
    const res = await fetch('/api/horarios/admin/grade', { headers: authHeaders() });
    gradeCompleta = res.ok ? await res.json() : [];
    renderGrade();
  } catch (e) {
    tabela.innerHTML = '<tr><td class="vazio-aviso">Não foi possível carregar a grade.</td></tr>';
  }
}

function chaveHorario(dia, hora) { return dia + '|' + hora; }

function renderGrade() {
  const tabela = document.getElementById('gradeAdmin');
  const horas = HORAS_POR_PERIODO[periodoAtual];
  const porCelula = {};
  gradeCompleta.forEach(s => { (porCelula[chaveHorario(s.diaSemana, s.horaInicio)] = porCelula[chaveHorario(s.diaSemana, s.horaInicio)] || []).push(s); });

  let conflitos = 0, part = 0, turma = 0;
  let html = '<thead><tr><th>Horário</th>' + ORDEM_DIAS.map(d => '<th>' + DIAS_LABEL[d] + '</th>').join('') + '</tr></thead><tbody>';
  horas.forEach(hora => {
    html += '<tr><th class="ha-hora" scope="row">' + hora + ' – ' + proximaHora(hora) + '</th>';
    ORDEM_DIAS.forEach(dia => {
      const todos = (porCelula[chaveHorario(dia, hora)] || []).slice().sort((a, b) => a.modalidade.localeCompare(b.modalidade));
      const ativos = todos.filter(s => s.ativo !== false);
      const conflito = new Set(ativos.map(s => s.modalidade)).size > 1;
      if (conflito) conflitos++;
      todos.forEach(s => { if (s.modalidade === 'turma') turma++; else part++; });
      const visiveis = todos.filter(s => verModalidade === 'todas' || s.modalidade === verModalidade);
      html += '<td class="gu-cel' + (conflito ? ' conflito' : '') + '"' + (conflito ? ' title="Conflito: aula particular e em turma no mesmo horário. Desative ou remova uma delas."' : '') + '>';
      html += visiveis.map(s => {
        const cheio = s.ocupadas >= s.capacidadeMaxima;
        const tipos = s.cursos && s.cursos.length ? s.cursos.join(', ') : 'todos os cursos';
        return '<button type="button" class="gu-slot ' + s.modalidade + (cheio ? ' cheio' : '') + (s.ativo === false ? ' inativo' : '') + '" data-slot-id="' + s._id + '"' +
          ' title="' + NOME_MODALIDADE[s.modalidade] + ' · ' + s.ocupadas + '/' + s.capacidadeMaxima + ' · ' + escapeHtml(tipos) + (s.ativo === false ? ' · inativo' : '') + '">' +
          '<span>' + NOME_MODALIDADE[s.modalidade] + '<small>' + escapeHtml(tipos) + '</small></span><b>' + s.ocupadas + '/' + s.capacidadeMaxima + '</b></button>';
      }).join('');
      if (!todos.length) html += '<button type="button" class="gu-add" data-novo-dia="' + dia + '" data-novo-hora="' + hora + '" aria-label="Criar horário ' + DIAS_LABEL[dia] + ' ' + hora + '">+</button>';
      html += '</td>';
    });
    html += '</tr>';
  });
  html += '</tbody>';
  tabela.innerHTML = html;
  const resumo = document.getElementById('guResumo');
  if (resumo) resumo.innerHTML = part + ' horário(s) de aula particular · ' + turma + ' de aula em turma' +
    (conflitos ? ' · <b style="color:var(--vermelho);">' + conflitos + ' conflito(s): resolva desativando ou removendo uma das aulas</b>' : ' · sem conflitos');
}

function proximaHora(h) {
  const n = (parseInt(h, 10) + 1) % 24;
  return String(n).padStart(2, '0') + ':00';
}

document.getElementById('gradeAdmin').addEventListener('click', e => {
  const slot = e.target.closest('.gu-slot');
  if (slot) { abrirDetalheHorario(slot.dataset.slotId); return; }
  const novo = e.target.closest('.gu-add');
  if (novo) abrirNovoHorario({ dia: novo.dataset.novoDia, hora: novo.dataset.novoHora });
});

// ===================== MODAL: NOVO HORÁRIO =====================
function atualizarHorasDisponiveis() {
  const periodo = document.getElementById('novoPeriodo').value;
  const sel = document.getElementById('novoHoraInicio');
  const atual = sel.value;
  sel.innerHTML = HORAS_POR_PERIODO[periodo].map(h => '<option value="' + h + '">' + h + '</option>').join('');
  if (HORAS_POR_PERIODO[periodo].includes(atual)) sel.value = atual;
}
document.getElementById('novoPeriodo').addEventListener('change', atualizarHorasDisponiveis);
document.getElementById('novoModalidade').addEventListener('change', e => {
  document.getElementById('novoCapacidadeWrap').style.display = e.target.value === 'turma' ? 'flex' : 'none';
});

function periodoDaHora(hora) {
  if (!hora) return 'noturno';
  return Object.keys(HORAS_POR_PERIODO).find(p => p !== 'todos' && HORAS_POR_PERIODO[p].includes(hora)) || 'noturno';
}

function abrirNovoHorario(pre) {
  document.getElementById('novoHorarioErro').style.display = 'none';
  document.getElementById('novoModalidade').value = modalidadeAtual;
  document.getElementById('novoModalidade').dispatchEvent(new Event('change'));
  document.getElementById('novoPeriodo').value = periodoAtual === 'todos' ? periodoDaHora(pre && pre.hora) : periodoAtual;
  atualizarHorasDisponiveis();
  if (pre?.dia !== undefined) document.getElementById('novoDiaSemana').value = pre.dia;
  if (pre?.hora) document.getElementById('novoHoraInicio').value = pre.hora;
  document.getElementById('novoCapacidade').value = 8;
  marcarCursos('novoCursosGrid', []);
  document.getElementById('modalNovoHorario').classList.add('show');
}
document.getElementById('novoHorarioBtn').addEventListener('click', () => abrirNovoHorario(null));
document.getElementById('fecharNovoHorarioBtn').addEventListener('click', () => document.getElementById('modalNovoHorario').classList.remove('show'));

document.getElementById('salvarNovoHorarioBtn').addEventListener('click', async () => {
  const erroEl = document.getElementById('novoHorarioErro');
  const payload = {
    modalidade: document.getElementById('novoModalidade').value,
    diaSemana: Number(document.getElementById('novoDiaSemana').value),
    periodo: document.getElementById('novoPeriodo').value,
    horaInicio: document.getElementById('novoHoraInicio').value,
    capacidadeMaxima: Number(document.getElementById('novoCapacidade').value) || 1,
    cursos: lerCursosMarcados('novoCursosGrid')
  };
  const res = await fetch('/api/horarios/admin/slots', { method: 'POST', headers: authHeaders(true), body: JSON.stringify(payload) });
  const data = await res.json();
  if (!res.ok) { erroEl.textContent = data.msg || 'Erro ao criar horário.'; erroEl.style.display = 'block'; return; }
  document.getElementById('modalNovoHorario').classList.remove('show');
  modalidadeAtual = payload.modalidade;
  await carregarGrade();
});

// ===================== MODAL: DETALHE DO HORÁRIO =====================
async function abrirDetalheHorario(slotId) {
  const slot = gradeCompleta.find(s => s._id === slotId);
  if (!slot) return;
  slotSelecionado = slot;
  document.getElementById('detalheTitulo').textContent = DIAS_LABEL[slot.diaSemana] + ' ' + slot.horaInicio + ' — ' + (slot.modalidade === 'turma' ? 'Turma' : 'Particular');
  document.getElementById('detalheCapacidadeWrap').style.display = slot.modalidade === 'turma' ? 'flex' : 'none';
  document.getElementById('detalheCapacidade').value = slot.capacidadeMaxima;
  document.getElementById('detalheAtivo').checked = slot.ativo !== false;
  marcarCursos('detalheCursosGrid', slot.cursos);
  document.getElementById('detalheErro').style.display = 'none';
  document.getElementById('detalheOcupantes').innerHTML = 'Carregando…';
  document.getElementById('modalDetalheHorario').classList.add('show');

  try {
    const res = await fetch('/api/horarios/admin/slots/' + slotId + '/ocupantes', { headers: authHeaders() });
    renderOcupantes(res.ok ? await res.json() : []);
  } catch (e) {
    document.getElementById('detalheOcupantes').innerHTML = '<p style="color:var(--vermelho); font-size:0.85rem;">Não foi possível carregar os alunos.</p>';
  }
}

function renderOcupantes(ocupantes) {
  const wrap = document.getElementById('detalheOcupantes');
  if (!ocupantes.length) { wrap.innerHTML = '<p style="color:var(--cinza-400); font-size:0.85rem;">Nenhum aluno neste horário.</p>'; return; }
  wrap.innerHTML = ocupantes.map(o => (
    '<div class="ocupante-item">' +
      '<div class="info"><strong>' + escapeHtml(o.nome || '—') + '</strong><span>' + escapeHtml(o.email || '') + '</span></div>' +
      '<button type="button" class="btn perigo pequeno" data-cancelar-matricula="' + o.matriculaId + '">Cancelar / liberar vaga</button>' +
    '</div>'
  )).join('');
}

document.getElementById('detalheOcupantes').addEventListener('click', async e => {
  const btn = e.target.closest('[data-cancelar-matricula]');
  if (!btn) return;
  if (!confirm('Cancelar esta matrícula e liberar a vaga?')) return;
  btn.disabled = true;
  btn.textContent = 'Cancelando…';
  const res = await fetch('/api/matricula/' + btn.dataset.cancelarMatricula + '/cancelar', { method: 'POST', headers: authHeaders() });
  await carregarGrade();
  if (res.ok && slotSelecionado) abrirDetalheHorario(slotSelecionado._id);
  else { btn.disabled = false; btn.textContent = 'Cancelar / liberar vaga'; }
});

document.getElementById('fecharDetalheBtn').addEventListener('click', () => document.getElementById('modalDetalheHorario').classList.remove('show'));

document.getElementById('salvarDetalheBtn').addEventListener('click', async () => {
  const erroEl = document.getElementById('detalheErro');
  const payload = { ativo: document.getElementById('detalheAtivo').checked, cursos: lerCursosMarcados('detalheCursosGrid') };
  if (slotSelecionado.modalidade === 'turma') payload.capacidadeMaxima = Number(document.getElementById('detalheCapacidade').value) || 1;
  const res = await fetch('/api/horarios/admin/slots/' + slotSelecionado._id, { method: 'PUT', headers: authHeaders(true), body: JSON.stringify(payload) });
  const data = await res.json();
  if (!res.ok) { erroEl.textContent = data.msg || 'Erro ao salvar.'; erroEl.style.display = 'block'; return; }
  document.getElementById('modalDetalheHorario').classList.remove('show');
  await carregarGrade();
});

document.getElementById('removerHorarioBtn').addEventListener('click', async () => {
  if (!slotSelecionado) return;
  if (!confirm('Remover este horário? Ele deixará de aparecer para os alunos.')) return;
  await fetch('/api/horarios/admin/slots/' + slotSelecionado._id, { method: 'DELETE', headers: authHeaders() });
  document.getElementById('modalDetalheHorario').classList.remove('show');
  await carregarGrade();
});

// ===================== INIT =====================
document.getElementById('novoModalidade').dispatchEvent(new Event('change'));
atualizarHorasDisponiveis();
carregarGrade();
