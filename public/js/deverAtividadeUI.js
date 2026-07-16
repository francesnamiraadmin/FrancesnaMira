// Componente compartilhado de edição de "atividades" de dever de casa —
// usado tanto no editor de Plano-Base (admin-planos-base.js) quanto na
// criação/edição manual de um dever específico (gestao-alunos.js), pra não
// duplicar a lógica de tipo+conteúdo condicional dos dois lugares.
const DeverUI = (() => {
  const NOMES_TIPO = {
    upload_arquivo: 'Upload de arquivo (PDF/Word/Imagem)', video: 'Vídeo', imagem: 'Imagem',
    link_externo: 'Link externo', texto: 'Texto', leitura: 'Leitura obrigatória',
    exercicio_lista: 'Lista de exercícios', questoes_plataforma: 'Questões da plataforma',
    producao_textual: 'Produção textual', producao_oral: 'Produção oral (áudio)',
    assistir_aula: 'Assistir aula gravada', assistir_modulo: 'Assistir conjunto de aulas',
    simulado: 'Fazer simulado', recurso_generico: 'Outro recurso da plataforma'
  };

  let modulosDisponiveis = [];
  let temasDisponiveis = [];

  async function carregarAuxiliares(authHeadersFn) {
    try {
      const [resModulos, resTemas] = await Promise.all([
        fetch('/api/admin-aulas/modulos', { headers: authHeadersFn() }),
        fetch('/api/temas?todos=0', { headers: authHeadersFn() })
      ]);
      modulosDisponiveis = resModulos.ok ? await resModulos.json() : [];
      temasDisponiveis = resTemas.ok ? await resTemas.json() : [];
    } catch (err) { /* selects ficam vazios se isso falhar */ }
  }

  function opcoesModulo(selecionado) {
    return '<option value="">Selecione...</option>' + modulosDisponiveis.map(m =>
      `<option value="${m._id}" ${String(selecionado) === String(m._id) ? 'selected' : ''}>${m.titulo}</option>`).join('');
  }
  function opcoesTema(selecionado) {
    return '<option value="">Selecione...</option>' + temasDisponiveis.map(t =>
      `<option value="${t._id}" ${String(selecionado) === String(t._id) ? 'selected' : ''}>${t.titulo}</option>`).join('');
  }
  function opcoesTipo(selecionado) {
    return Object.entries(NOMES_TIPO).map(([valor, nome]) =>
      `<option value="${valor}" ${selecionado === valor ? 'selected' : ''}>${nome}</option>`).join('');
  }

  function atividadeBoxHtml(a) {
    a = a || { tipo: 'texto', titulo: '', descricao: '', obrigatoria: true, conteudo: {} };
    const c = a.conteudo || {};
    return `<div class="atividade-box" data-atividade-box>
      <div class="atividade-box-header">
        <strong style="font-size:0.85rem;">Atividade</strong>
        <button type="button" class="btn perigo pequeno" data-remover-atividade>Remover</button>
      </div>
      <div class="campo-row">
        <div class="campo"><label>Tipo</label><select data-campo="tipo">${opcoesTipo(a.tipo)}</select></div>
        <div class="campo"><label>Título</label><input type="text" data-campo="titulo" value="${a.titulo || ''}" placeholder="Ex.: Assistir aula 12"></div>
      </div>
      <div class="campo"><label>Descrição</label><textarea data-campo="descricao">${a.descricao || ''}</textarea></div>
      <label class="checkbox-row"><input type="checkbox" data-campo="obrigatoria" ${a.obrigatoria !== false ? 'checked' : ''}> Obrigatória</label>

      <div class="campo campo-conteudo campo-url" style="display:none;"><label>Link/URL</label><input type="text" data-conteudo="url" value="${c.url || ''}" placeholder="https://..."></div>
      <div class="campo campo-conteudo campo-texto" style="display:none;"><label>Texto</label><textarea data-conteudo="texto">${c.texto || ''}</textarea></div>
      <div class="campo campo-conteudo campo-tema" style="display:none;"><label>Tema (produção textual)</label><select data-conteudo="temaId">${opcoesTema(c.temaId)}</select></div>
      <div class="campo campo-conteudo campo-modulo" style="display:none;"><label>Módulo</label><select data-conteudo="moduloId">${opcoesModulo(c.moduloId)}</select></div>
      <div class="campo campo-conteudo campo-aula" style="display:none;"><label>Aula</label><select data-conteudo="aulaId"><option value="">Selecione o módulo primeiro</option></select></div>
    </div>`;
  }

  function atualizarCamposConteudo(box) {
    const tipo = box.querySelector('[data-campo="tipo"]').value;
    box.querySelectorAll('.campo-conteudo').forEach(el => el.style.display = 'none');
    const mostrar = cls => { const el = box.querySelector(cls); if (el) el.style.display = 'flex'; };
    if (['link_externo', 'video', 'upload_arquivo', 'imagem'].includes(tipo)) mostrar('.campo-url');
    if (['texto', 'leitura'].includes(tipo)) mostrar('.campo-texto');
    if (tipo === 'producao_textual') mostrar('.campo-tema');
    if (tipo === 'assistir_modulo') mostrar('.campo-modulo');
    if (tipo === 'assistir_aula') { mostrar('.campo-modulo'); mostrar('.campo-aula'); }
  }

  async function preencherAulasDoModulo(box, moduloId, aulaSelecionada, authHeadersFn) {
    const selectAula = box.querySelector('[data-conteudo="aulaId"]');
    if (!moduloId) { selectAula.innerHTML = '<option value="">Selecione o módulo primeiro</option>'; return; }
    selectAula.innerHTML = '<option value="">Carregando...</option>';
    try {
      const res = await fetch('/api/admin-aulas/aulas?moduloId=' + moduloId, { headers: authHeadersFn() });
      const aulas = res.ok ? await res.json() : [];
      selectAula.innerHTML = '<option value="">Selecione...</option>' + aulas.map(a =>
        `<option value="${a._id}" ${String(aulaSelecionada) === String(a._id) ? 'selected' : ''}>${a.titulo}</option>`).join('');
    } catch (err) { selectAula.innerHTML = '<option value="">Erro ao carregar aulas</option>'; }
  }

  function adicionarAtividadeBox(atividadesWrap, atividadeData, authHeadersFn) {
    atividadesWrap.insertAdjacentHTML('beforeend', atividadeBoxHtml(atividadeData));
    const atBox = atividadesWrap.lastElementChild;
    atualizarCamposConteudo(atBox);
    if (atividadeData?.tipo === 'assistir_aula' && atividadeData.conteudo?.moduloId) {
      preencherAulasDoModulo(atBox, atividadeData.conteudo.moduloId, atividadeData.conteudo.aulaId, authHeadersFn);
    }
    return atBox;
  }

  // Registra os listeners de "tipo muda" / "módulo muda" num container que
  // engloba uma ou mais atividade-box (delegação de evento).
  function ligarEventosConteudo(container, authHeadersFn) {
    container.addEventListener('change', e => {
      const atBox = e.target.closest('[data-atividade-box]');
      if (!atBox) return;
      if (e.target.dataset.campo === 'tipo') atualizarCamposConteudo(atBox);
      if (e.target.dataset.conteudo === 'moduloId') preencherAulasDoModulo(atBox, e.target.value, null, authHeadersFn);
    });
  }

  function coletarAtividades(wrapEl) {
    return [...wrapEl.querySelectorAll('[data-atividade-box]')].map(atBox => {
      const tipo = atBox.querySelector('[data-campo="tipo"]').value;
      const conteudo = {};
      atBox.querySelectorAll('[data-conteudo]').forEach(el => { if (el.value) conteudo[el.dataset.conteudo] = el.value; });
      return {
        tipo,
        titulo: atBox.querySelector('[data-campo="titulo"]').value.trim(),
        descricao: atBox.querySelector('[data-campo="descricao"]').value.trim(),
        obrigatoria: atBox.querySelector('[data-campo="obrigatoria"]').checked,
        conteudo
      };
    });
  }

  return {
    NOMES_TIPO, carregarAuxiliares, opcoesModulo, opcoesTema, opcoesTipo,
    atividadeBoxHtml, atualizarCamposConteudo, preencherAulasDoModulo,
    adicionarAtividadeBox, ligarEventosConteudo, coletarAtividades
  };
})();
