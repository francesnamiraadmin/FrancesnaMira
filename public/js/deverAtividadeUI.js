// Componente compartilhado de edição de "atividades" de dever de casa —
// usado tanto no editor de Plano-Base (admin-planos-base.js) quanto na
// criação/edição manual de um dever específico (gestao-alunos.js), pra não
// duplicar a lógica de tipo+conteúdo condicional, arrastar-e-soltar,
// duplicar e dependência entre atividades dos dois lugares.
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
  let contadorBoxId = 0;
  function novoBoxId() { return 'box' + (++contadorBoxId) + '_' + Date.now(); }

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

  function atividadeBoxHtml(a, boxId, comMaterialUpload) {
    a = a || { tipo: 'texto', titulo: '', descricao: '', obrigatoria: true, conteudo: {} };
    const c = a.conteudo || {};
    return `<div class="atividade-box" data-atividade-box data-box-id="${boxId}" draggable="true">
      <div class="atividade-box-header">
        <span class="drag-handle" title="Arraste pra reordenar">⠿⠿</span>
        <strong style="font-size:0.85rem; flex:1;">Atividade</strong>
        <button type="button" class="btn secundario pequeno" data-duplicar-atividade>Duplicar</button>
        <button type="button" class="btn perigo pequeno" data-remover-atividade>Remover</button>
      </div>
      <div class="campo-row">
        <div class="campo"><label>Tipo</label><select data-campo="tipo">${opcoesTipo(a.tipo)}</select></div>
        <div class="campo"><label>Título</label><input type="text" data-campo="titulo" value="${a.titulo || ''}" placeholder="Ex.: Assistir aula 12"></div>
      </div>
      <div class="campo"><label>Descrição</label><textarea data-campo="descricao">${a.descricao || ''}</textarea></div>
      <div class="campo-row">
        <label class="checkbox-row" style="margin-top:20px;"><input type="checkbox" data-campo="obrigatoria" ${a.obrigatoria !== false ? 'checked' : ''}> Obrigatória</label>
        <div class="campo"><label>Depende de</label><select data-campo="dependeDe"><option value="">Nenhuma</option></select></div>
      </div>

      <div class="campo campo-conteudo campo-url" style="display:none;"><label>Link/URL</label><input type="text" data-conteudo="url" value="${c.url || ''}" placeholder="https://..."></div>
      <div class="campo campo-conteudo campo-texto" style="display:none;"><label>Texto</label><textarea data-conteudo="texto">${c.texto || ''}</textarea></div>
      <div class="campo campo-conteudo campo-tema" style="display:none;"><label>Tema (produção textual)</label><select data-conteudo="temaId">${opcoesTema(c.temaId)}</select></div>
      <div class="campo campo-conteudo campo-modulo" style="display:none;"><label>Módulo</label><select data-conteudo="moduloId">${opcoesModulo(c.moduloId)}</select></div>
      <div class="campo campo-conteudo campo-aula" style="display:none;"><label>Aula</label><select data-conteudo="aulaId"><option value="">Selecione o módulo primeiro</option></select></div>
      ${comMaterialUpload ? `<div class="campo campo-conteudo campo-material-upload" style="display:none;">
        <label>Arquivo do material${c.arquivo?.nome ? ' (atual: ' + c.arquivo.nome + ')' : ''}</label>
        <div style="display:flex; gap:8px; align-items:center;">
          <input type="file" data-material-input>
          <button type="button" class="btn secundario pequeno" data-enviar-material>Enviar</button>
        </div>
        <span class="msg-inline" data-material-msg></span>
      </div>` : ''}
    </div>`;
  }

  function atualizarCamposConteudo(box) {
    const tipo = box.querySelector('[data-campo="tipo"]').value;
    box.querySelectorAll('.campo-conteudo').forEach(el => el.style.display = 'none');
    const mostrar = cls => { const el = box.querySelector(cls); if (el) el.style.display = 'flex'; };
    if (['link_externo', 'video', 'imagem'].includes(tipo)) mostrar('.campo-url');
    if (tipo === 'upload_arquivo') { mostrar('.campo-url'); mostrar('.campo-material-upload'); }
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

  // Reconstrói as opções de "Depende de" de TODAS as atividades do wrap, com
  // base no título e na ordem atual — chamado sempre que a lista muda
  // (adicionar/remover/reordenar/editar título). A dependência é guardada
  // pelo id interno do box (não pelo índice), então sobrevive a reordenação.
  function atualizarOpcoesDependeDe(wrapEl) {
    const boxes = [...wrapEl.querySelectorAll('[data-atividade-box]')];
    boxes.forEach((box, i) => {
      const select = box.querySelector('[data-campo="dependeDe"]');
      if (!select) return;
      const atual = select.value;
      const opcoes = boxes
        .filter(b => b !== box)
        .map(b => {
          const titulo = b.querySelector('[data-campo="titulo"]').value.trim() || '(sem título)';
          const idx = boxes.indexOf(b);
          return `<option value="${b.dataset.boxId}">${idx + 1}. ${titulo}</option>`;
        }).join('');
      select.innerHTML = '<option value="">Nenhuma</option>' + opcoes;
      if ([...select.options].some(o => o.value === atual)) select.value = atual;
    });
  }

  function adicionarAtividadeBox(atividadesWrap, atividadeData, authHeadersFn, materialCtx) {
    const boxId = novoBoxId();
    atividadesWrap.insertAdjacentHTML('beforeend', atividadeBoxHtml(atividadeData, boxId, !!materialCtx));
    const atBox = atividadesWrap.lastElementChild;
    if (atividadeData && typeof atividadeData.dependeDe === 'number') {
      atBox.dataset.pendingDependeDeIndex = String(atividadeData.dependeDe);
    }
    atualizarCamposConteudo(atBox);
    if (atividadeData?.tipo === 'assistir_aula' && atividadeData.conteudo?.moduloId) {
      preencherAulasDoModulo(atBox, atividadeData.conteudo.moduloId, atividadeData.conteudo.aulaId, authHeadersFn);
    }
    if (materialCtx) ligarUploadMaterial(atBox, atividadesWrap, materialCtx);
    return atBox;
  }

  // Resolve os "pendingDependeDeIndex" (índices salvos no banco) pra ids de
  // box — precisa rodar DEPOIS que todas as atividades de uma semana/dever já
  // foram adicionadas ao wrap, senão o índice apontaria pro box errado.
  function resolverDependenciasIniciais(wrapEl) {
    const boxes = [...wrapEl.querySelectorAll('[data-atividade-box]')];
    boxes.forEach(box => {
      const idx = box.dataset.pendingDependeDeIndex;
      if (idx === undefined) return;
      const alvo = boxes[Number(idx)];
      delete box.dataset.pendingDependeDeIndex;
      if (!alvo) return;
      atualizarOpcoesDependeDe(wrapEl);
      const select = box.querySelector('[data-campo="dependeDe"]');
      if (select) select.value = alvo.dataset.boxId;
    });
    atualizarOpcoesDependeDe(wrapEl);
  }

  function ligarUploadMaterial(atBox, atividadesWrap, materialCtx) {
    const btn = atBox.querySelector('[data-enviar-material]');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      const input = atBox.querySelector('[data-material-input]');
      const msg = atBox.querySelector('[data-material-msg]');
      if (!input.files[0]) { msg.className = 'msg-inline erro'; msg.textContent = 'Selecione um arquivo.'; return; }
      const index = [...atividadesWrap.querySelectorAll('[data-atividade-box]')].indexOf(atBox);
      const form = new FormData();
      form.append('arquivo', input.files[0]);
      btn.disabled = true;
      msg.className = 'msg-inline'; msg.textContent = 'Enviando...';
      try {
        const res = await fetch(`/api/deveres/deveres/${materialCtx.deverId}/atividades/${index}/material`, {
          method: 'POST', headers: materialCtx.authHeadersFn(), body: form
        });
        const data = await res.json();
        if (!res.ok) { msg.className = 'msg-inline erro'; msg.textContent = data.msg || 'Erro ao enviar.'; btn.disabled = false; return; }
        msg.className = 'msg-inline sucesso'; msg.textContent = 'Material enviado!';
      } catch (err) {
        msg.className = 'msg-inline erro'; msg.textContent = 'Erro ao conectar ao servidor.';
      } finally {
        btn.disabled = false;
      }
    });
  }

  // Arrasta-e-solta nativo (sem lib externa) — reordena os `.atividade-box`
  // dentro do wrap pela posição do mouse. Chamar uma vez por wrap.
  function ligarDragReorder(wrapEl) {
    let arrastando = null;
    wrapEl.addEventListener('dragstart', e => {
      const box = e.target.closest('[data-atividade-box]');
      if (!box || !e.target.closest('.drag-handle')) { e.preventDefault(); return; }
      arrastando = box;
      box.classList.add('arrastando');
      e.dataTransfer.effectAllowed = 'move';
    });
    wrapEl.addEventListener('dragend', () => {
      arrastando?.classList.remove('arrastando');
      arrastando = null;
      atualizarOpcoesDependeDe(wrapEl);
    });
    wrapEl.addEventListener('dragover', e => {
      if (!arrastando) return;
      e.preventDefault();
      const alvo = e.target.closest('[data-atividade-box]');
      if (!alvo || alvo === arrastando) return;
      const rect = alvo.getBoundingClientRect();
      const depois = (e.clientY - rect.top) > rect.height / 2;
      alvo.parentNode.insertBefore(arrastando, depois ? alvo.nextSibling : alvo);
    });
  }

  // Registra os listeners de "tipo muda" / "módulo muda" / "título muda" /
  // duplicar / remover num container que engloba uma ou mais atividade-box.
  // `materialCtx` pode ser um objeto fixo ou uma função — usar função quando
  // o contexto (ex.: deverId) só é conhecido depois que o form já abriu.
  function ligarEventosConteudo(container, authHeadersFn, materialCtx) {
    container.addEventListener('change', e => {
      const atBox = e.target.closest('[data-atividade-box]');
      if (!atBox) return;
      if (e.target.dataset.campo === 'tipo') atualizarCamposConteudo(atBox);
      if (e.target.dataset.conteudo === 'moduloId') preencherAulasDoModulo(atBox, e.target.value, null, authHeadersFn);
    });
    container.addEventListener('input', e => {
      if (e.target.dataset.campo === 'titulo') atualizarOpcoesDependeDe(container);
    });
    container.addEventListener('click', e => {
      const dupBtn = e.target.closest('[data-duplicar-atividade]');
      if (dupBtn) {
        const atBox = dupBtn.closest('[data-atividade-box]');
        const dados = {
          tipo: atBox.querySelector('[data-campo="tipo"]').value,
          titulo: atBox.querySelector('[data-campo="titulo"]').value + ' (cópia)',
          descricao: atBox.querySelector('[data-campo="descricao"]').value,
          obrigatoria: atBox.querySelector('[data-campo="obrigatoria"]').checked,
          conteudo: {}
        };
        atBox.querySelectorAll('[data-conteudo]').forEach(el => { if (el.value) dados.conteudo[el.dataset.conteudo] = el.value; });
        const ctxAtual = typeof materialCtx === 'function' ? materialCtx() : materialCtx;
        const novoBox = adicionarAtividadeBox(container, dados, authHeadersFn, ctxAtual);
        atBox.after(novoBox);
        atualizarOpcoesDependeDe(container);
      }
    });
    ligarDragReorder(container);
  }

  function coletarAtividades(wrapEl) {
    const boxes = [...wrapEl.querySelectorAll('[data-atividade-box]')];
    const boxIdParaIndice = {};
    boxes.forEach((b, i) => { boxIdParaIndice[b.dataset.boxId] = i; });
    return boxes.map(atBox => {
      const tipo = atBox.querySelector('[data-campo="tipo"]').value;
      const conteudo = {};
      atBox.querySelectorAll('[data-conteudo]').forEach(el => { if (el.value) conteudo[el.dataset.conteudo] = el.value; });
      const dependeBoxId = atBox.querySelector('[data-campo="dependeDe"]')?.value || '';
      const dependeDe = dependeBoxId && boxIdParaIndice[dependeBoxId] !== undefined ? boxIdParaIndice[dependeBoxId] : null;
      return {
        tipo,
        titulo: atBox.querySelector('[data-campo="titulo"]').value.trim(),
        descricao: atBox.querySelector('[data-campo="descricao"]').value.trim(),
        obrigatoria: atBox.querySelector('[data-campo="obrigatoria"]').checked,
        dependeDe,
        conteudo
      };
    });
  }

  return {
    NOMES_TIPO, carregarAuxiliares, opcoesModulo, opcoesTema, opcoesTipo,
    atividadeBoxHtml, atualizarCamposConteudo, preencherAulasDoModulo,
    adicionarAtividadeBox, resolverDependenciasIniciais, atualizarOpcoesDependeDe,
    ligarEventosConteudo, ligarDragReorder, coletarAtividades
  };
})();
