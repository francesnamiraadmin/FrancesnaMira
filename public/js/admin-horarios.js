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

let modalidadeAtual = 'particular';
let periodoAtual = 'diurno';
let gradeCompleta = [];
let slotSelecionado = null;

// ===================== TABS =====================
document.querySelectorAll('.top-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.top-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    modalidadeAtual = tab.dataset.modalidade;
    carregarGrade();
  });
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
    const res = await fetch('/api/horarios/admin/grade?modalidade=' + modalidadeAtual, { headers: authHeaders() });
    gradeCompleta = res.ok ? await res.json() : [];
    renderGrade();
  } catch (e) {
    tabela.innerHTML = '<tr><td class="vazio-aviso">Não foi possível carregar a grade.</td></tr>';
  }
}

function renderGrade() {
  const tabela = document.getElementById('gradeAdmin');
  const slots = gradeCompleta.filter(s => s.periodo === periodoAtual);
  const porHora = {};
  slots.forEach(s => { (porHora[s.horaInicio] = porHora[s.horaInicio] || {})[s.diaSemana] = s; });

  let html = '<thead><tr><th>Horário</th>' + ORDEM_DIAS.map(d => '<th>' + DIAS_LABEL[d] + '</th>').join('') + '</tr></thead><tbody>';
  HORAS_POR_PERIODO[periodoAtual].forEach(hora => {
    html += '<tr><td class="hora-label">' + hora + '</td>';
    ORDEM_DIAS.forEach(dia => {
      const slot = porHora[hora] && porHora[hora][dia];
      if (!slot) {
        html += '<td class="slot-cel vazio" data-novo-dia="' + dia + '" data-novo-hora="' + hora + '">+</td>';
        return;
      }
      const classe = slot.ativo === false ? 'inativo' : (slot.ocupadas >= slot.capacidadeMaxima ? 'ocupado' : 'livre');
      html += '<td class="slot-cel ' + classe + '" data-slot-id="' + slot._id + '">' + slot.ocupadas + '/' + slot.capacidadeMaxima + '</td>';
    });
    html += '</tr>';
  });
  html += '</tbody>';
  tabela.innerHTML = html;
}

document.getElementById('gradeAdmin').addEventListener('click', e => {
  const ocupado = e.target.closest('.slot-cel:not(.vazio)');
  if (ocupado) { abrirDetalheHorario(ocupado.dataset.slotId); return; }
  const vazio = e.target.closest('.slot-cel.vazio');
  if (vazio) abrirNovoHorario({ dia: vazio.dataset.novoDia, hora: vazio.dataset.novoHora });
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

function abrirNovoHorario(pre) {
  document.getElementById('novoHorarioErro').style.display = 'none';
  document.getElementById('novoModalidade').value = modalidadeAtual;
  document.getElementById('novoModalidade').dispatchEvent(new Event('change'));
  document.getElementById('novoPeriodo').value = periodoAtual;
  atualizarHorasDisponiveis();
  if (pre?.dia !== undefined) document.getElementById('novoDiaSemana').value = pre.dia;
  if (pre?.hora) document.getElementById('novoHoraInicio').value = pre.hora;
  document.getElementById('novoCapacidade').value = 8;
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
    capacidadeMaxima: Number(document.getElementById('novoCapacidade').value) || 1
  };
  const res = await fetch('/api/horarios/admin/slots', { method: 'POST', headers: authHeaders(true), body: JSON.stringify(payload) });
  const data = await res.json();
  if (!res.ok) { erroEl.textContent = data.msg || 'Erro ao criar horário.'; erroEl.style.display = 'block'; return; }
  document.getElementById('modalNovoHorario').classList.remove('show');
  if (payload.modalidade === modalidadeAtual) await carregarGrade();
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
  const payload = { ativo: document.getElementById('detalheAtivo').checked };
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
