// =====================================================================
// PERSONALIZAR CONJUNTO — página própria (migrado de public/js/conjuntos.js).
// =====================================================================

function authHeaders(json) {
  const token = localStorage.getItem('token');
  return Object.assign({ Authorization: 'Bearer ' + token }, json ? { 'Content-Type': 'application/json' } : {});
}

// "Níveis" mostra um chip por curso de fluência (A1/A2/B1/B2) que a conta realmente possui —
// não só o do contexto atual (js/cursoContexto.js): quem tem A1+A2 vê A1 e A2; quem tem só B2
// vê só B2. C1/C2 aparecem como bônus só pra quem tem os 4 cursos de fluência completos (o
// combo "A1 ao B2") ou qualquer uma das provas TCF/DELF/DALF/TEF — B2 sozinho NÃO libera C1/C2
// — mesma regra do backend, ver backend/routes/questoes.js#elegivelParaNiveisAvancados.
// `window.__planosConta` é exposto por js/plataformaGate.js depois que a conta é carregada.
const NIVEIS_FLUENCIA = ['A1', 'A2', 'B1', 'B2'];
const NIVEIS_AVANCADOS = ['C1', 'C2'];
const CURSOS_ELEGIVEIS_AVANCADO_EXAME = ['TCF', 'DELF', 'DALF', 'TEF'];

function possuiCursoPlataforma(curso) {
  return (window.__planosConta || []).some(p => p.courseType === curso && (p.ativo || p.packPrestige?.ativo));
}

function niveisPermitidos() {
  const permitidos = NIVEIS_FLUENCIA.filter(possuiCursoPlataforma);
  const comboCompleto = NIVEIS_FLUENCIA.every(possuiCursoPlataforma);
  const viaExame = CURSOS_ELEGIVEIS_AVANCADO_EXAME.some(possuiCursoPlataforma);
  if (comboCompleto || viaExame) permitidos.push(...NIVEIS_AVANCADOS);
  return permitidos;
}

const QUANTIDADES_CONJUNTO = [10, 20, 40];
const filtroForm = { niveis: new Set(), materias: new Set(), quantidade: 10 };

function renderChipsNiveis() {
  const permitidos = niveisPermitidos();
  document.getElementById('chipNiveis').innerHTML = permitidos.length
    ? permitidos.map(n => `<button type="button" class="chip-toggle ${filtroForm.niveis.has(n) ? 'selecionado' : ''}" data-nivel="${n}">${n}</button>`).join('')
    : '<p style="opacity:0.75; font-size:0.88rem;">Nenhum nível disponível para o curso atual ainda.</p>';
}

const TODAS_MATERIAS = Object.keys(MATERIAS_LABELS);

function renderChipsMaterias() {
  const chipTodos = `<button type="button" class="chip-toggle" data-materia-todos>Todos os conteúdos</button>`;
  const chipsIndividuais = Object.entries(MATERIAS_LABELS).map(([k, v]) =>
    `<button type="button" class="chip-toggle" data-materia="${k}">${v}</button>`
  ).join('');
  document.getElementById('chipMaterias').innerHTML = chipTodos + chipsIndividuais;
}

// Mantém o chip "Todos os conteúdos" marcado só quando as 8 categorias estiverem
// selecionadas de fato — reflete o estado real em vez de ser um botão independente.
function sincronizarChipTodos(form) {
  const todasSelecionadas = TODAS_MATERIAS.every(m => filtroForm.materias.has(m));
  form.querySelector('[data-materia-todos]')?.classList.toggle('selecionado', todasSelecionadas);
}

function renderChipsQuantidade() {
  document.getElementById('chipQuantidade').innerHTML = QUANTIDADES_CONJUNTO.map(q =>
    `<button type="button" class="chip-toggle ${q === filtroForm.quantidade ? 'selecionado' : ''}" data-quantidade="${q}">${q} questões</button>`
  ).join('');
}

function mostrarErroForm(msg) {
  const el = document.getElementById('criarConjuntoErro');
  el.textContent = msg;
  el.classList.add('show');
}

// ===================== MEUS CONJUNTOS PERSONALIZADOS =====================
// Reaproveita os MESMOS cards visuais de Sugeridos/Respondidos
// (renderPrioritarioCard/renderRespondidoCard, de js/conjuntoCard.js — a rota
// GET /conjuntos/meus-personalizados devolve o mesmo formato que essas funções
// esperam) — só acrescenta um botão "Excluir" dentro do card via DOM (não por
// concatenação de string, pra não depender da formatação exata do template
// dessas funções). Os botões Começar/Continuar/Refazer/Revisar já funcionam
// sozinhos: o clique delegado deles é registrado globalmente por
// conjuntoCard.js (document.addEventListener), não precisa de nada aqui.

function renderPersonalizadoCard(c) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = c.status === 'concluido' ? renderRespondidoCard(c) : renderPrioritarioCard(c);
  const card = wrapper.firstElementChild;
  const btnExcluir = document.createElement('button');
  btnExcluir.type = 'button';
  btnExcluir.className = 'q-btn perigo';
  btnExcluir.dataset.excluirPersonalizado = c._id;
  btnExcluir.textContent = 'Excluir';
  card.querySelector('.conjunto-acoes').appendChild(btnExcluir);
  return card.outerHTML;
}

async function carregarMeusPersonalizados() {
  const lista = document.getElementById('meusPersonalizadosLista');
  lista.innerHTML = '<p class="meus-personalizados-vazio">Carregando...</p>';
  try {
    const urlBase = '/api/questoes/conjuntos/meus-personalizados';
    const url = window.CursoContexto ? window.CursoContexto.urlComCurso(urlBase) : urlBase;
    const res = await fetch(url, { headers: authHeaders() });
    if (!res.ok) throw new Error();
    const conjuntos = await res.json();
    lista.innerHTML = conjuntos.length
      ? conjuntos.map(renderPersonalizadoCard).join('')
      : '<p class="meus-personalizados-vazio">Você ainda não criou nenhum conjunto personalizado.</p>';
  } catch (err) {
    lista.innerHTML = '<p class="meus-personalizados-vazio">Erro ao carregar seus conjuntos personalizados.</p>';
  }
}

function initMeusPersonalizados() {
  document.getElementById('meusPersonalizadosLista').addEventListener('click', async e => {
    const btn = e.target.closest('[data-excluir-personalizado]');
    if (!btn) return;
    const item = btn.closest('.conjunto-card');
    const nome = item.querySelector('h3').textContent;
    if (!confirm(`Excluir o conjunto personalizado "${nome}"? Isso não pode ser desfeito.`)) return;
    btn.disabled = true;
    try {
      const res = await fetch(`/api/questoes/conjuntos/${btn.dataset.excluirPersonalizado}`, { method: 'DELETE', headers: authHeaders() });
      if (!res.ok) { btn.disabled = false; alert('Não foi possível excluir este conjunto.'); return; }
      item.remove();
      if (!document.getElementById('meusPersonalizadosLista').children.length) carregarMeusPersonalizados();
    } catch (err) {
      btn.disabled = false;
      alert('Erro ao conectar ao servidor.');
    }
  });
  carregarMeusPersonalizados();
}

function initFormularioConjunto() {
  renderChipsNiveis();
  renderChipsMaterias();
  renderChipsQuantidade();

  const form = document.getElementById('criarConjuntoForm');

  form.addEventListener('click', e => {
    const nivelChip = e.target.closest('[data-nivel]');
    if (nivelChip) {
      const n = nivelChip.dataset.nivel;
      filtroForm.niveis.has(n) ? filtroForm.niveis.delete(n) : filtroForm.niveis.add(n);
      nivelChip.classList.toggle('selecionado');
      return;
    }
    const materiaTodosChip = e.target.closest('[data-materia-todos]');
    if (materiaTodosChip) {
      const todasJaSelecionadas = TODAS_MATERIAS.every(m => filtroForm.materias.has(m));
      if (todasJaSelecionadas) filtroForm.materias.clear();
      else TODAS_MATERIAS.forEach(m => filtroForm.materias.add(m));
      form.querySelectorAll('[data-materia]').forEach(chip => chip.classList.toggle('selecionado', filtroForm.materias.has(chip.dataset.materia)));
      sincronizarChipTodos(form);
      return;
    }
    const materiaChip = e.target.closest('[data-materia]');
    if (materiaChip) {
      const m = materiaChip.dataset.materia;
      filtroForm.materias.has(m) ? filtroForm.materias.delete(m) : filtroForm.materias.add(m);
      materiaChip.classList.toggle('selecionado');
      sincronizarChipTodos(form);
      return;
    }
    const quantidadeChip = e.target.closest('[data-quantidade]');
    if (quantidadeChip) {
      filtroForm.quantidade = Number(quantidadeChip.dataset.quantidade);
      form.querySelectorAll('[data-quantidade]').forEach(b => b.classList.toggle('selecionado', Number(b.dataset.quantidade) === filtroForm.quantidade));
    }
  });

  form.querySelectorAll('input[name="tempoModo"]').forEach(radio => {
    radio.addEventListener('change', () => {
      document.getElementById('tempoMinutos').style.display = document.querySelector('input[name="tempoModo"]:checked').value === 'com' ? 'inline-block' : 'none';
    });
  });

  document.getElementById('gerarConjuntoBtn').addEventListener('click', async () => {
    const erroEl = document.getElementById('criarConjuntoErro');
    erroEl.classList.remove('show');

    if (!filtroForm.niveis.size) return mostrarErroForm('Selecione ao menos um nível.');
    if (!filtroForm.materias.size) return mostrarErroForm('Selecione ao menos uma categoria.');

    const tempoModo = document.querySelector('input[name="tempoModo"]:checked').value;
    const minutos = Number(document.getElementById('tempoMinutos').value);
    if (tempoModo === 'com' && (!minutos || minutos <= 0)) return mostrarErroForm('Informe a duração em minutos.');

    try {
      const res = await fetch('/api/questoes/conjuntos/personalizado', {
        method: 'POST', headers: authHeaders(true),
        body: JSON.stringify({
          niveis: [...filtroForm.niveis], materias: [...filtroForm.materias], quantidade: filtroForm.quantidade,
          tempoLimiteSegundos: tempoModo === 'com' ? minutos * 60 : null,
          courseType: window.CursoContexto ? window.CursoContexto.curso : undefined
        })
      });
      const data = await res.json();
      if (!res.ok) return mostrarErroForm(data.msg || 'Erro ao criar conjunto.');
      window.location.href = `resolver-conjunto.html?id=${data._id}`;
    } catch (err) {
      mostrarErroForm('Erro ao criar conjunto.');
    }
  });
}

// Só inicializa depois que js/plataformaGate.js confirmou acesso E resolveu o curso —
// niveisPermitidos() depende de window.CursoContexto.curso e window.__planosConta,
// que só existem depois disso (ver o hook window.aoResolverCurso, chamado pelo gate).
window.aoResolverCurso = function () {
  initFormularioConjunto();
  initMeusPersonalizados();
};
