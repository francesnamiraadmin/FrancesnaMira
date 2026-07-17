// Orquestrador do workspace de Dever de Casa — dado UMA atividade, decide
// qual widget embutido mostrar (player de aula, editor de produção, gravador
// de áudio, ou o formulário genérico de envio) sem sair da aba. Usado por
// public/js/meus-deveres.js. Depende de AulaPlayerEmbed, ProducaoTextualEmbed
// e GravadorAudio já carregados na página.
const DeverWorkspace = (() => {
  function authHeaders(json) {
    const token = localStorage.getItem('token');
    return { Authorization: 'Bearer ' + token, ...(json ? { 'Content-Type': 'application/json' } : {}) };
  }
  const NOMES_TIPO = (typeof DeverUI !== 'undefined') ? DeverUI.NOMES_TIPO : {};
  const NOMES_STATUS_PRODUCAO = {
    em_fila: 'Aguardando correção', em_correcao: 'Em correção', aguardando_revisao: 'Aguardando revisão',
    corrigido: 'Corrigida', devolvido: 'Devolvida', arquivado: 'Arquivada', cancelado: 'Cancelada'
  };

  function labelEntrega(a) {
    if (a.entrega?.status === 'enviado') return a.entrega.entregueComAtraso ? 'Entregue com atraso' : 'Entregue';
    return a.entrega?.atrasada ? 'Pendente em atraso' : 'Pendente';
  }

  async function baixarArquivo(url, nomeFallback) {
    const res = await fetch(url, { headers: authHeaders() });
    if (!res.ok) { alert('Não foi possível baixar o arquivo.'); return; }
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objUrl; a.download = nomeFallback;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(objUrl);
  }

  // Conteúdo informativo comum (material anexado pelo admin, link, texto de
  // leitura) — usado tanto pelo widget genérico quanto como complemento de
  // tipos ainda não integrados (questões/simulado/exercícios).
  function conteudoHtml(a) {
    const c = a.conteudo || {};
    const partes = [];
    if (c.arquivo?.nome) partes.push(`<button class="dash-btn secundario pequeno" data-baixar-material>📎 Baixar material: ${c.arquivo.nome}</button>`);
    if (c.url) partes.push(`<a href="${c.url}" target="_blank" rel="noopener" class="dash-btn secundario pequeno">Abrir link</a>`);
    if (c.texto) partes.push(`<div class="texto-box">${c.texto}</div>`);
    if (['questoes_plataforma', 'simulado', 'exercicio_lista'].includes(a.tipo)) {
      partes.push(`<p class="embed-aviso">Essa atividade ainda não abre dentro do Dever de Casa — resolva pela <a href="plataforma-questoes.html" target="_blank">Plataforma de Questões</a> e volte aqui pra marcar como concluída.</p>`);
    }
    return partes.join('');
  }

  // Widget genérico — upload/download/texto livre, o mesmo formulário usado
  // desde a Fase 2 pros tipos sem entidade própria na plataforma.
  function renderGenerico(widgetEl, a, deverId, index, onAtualizado) {
    const jaEnviado = a.entrega?.status === 'enviado';
    widgetEl.innerHTML = `
      ${conteudoHtml(a)}
      ${jaEnviado && a.entrega.arquivo?.nome ? `<button class="dash-btn secundario pequeno" data-baixar-entrega>📎 Baixar meu envio: ${a.entrega.arquivo.nome}</button>` : ''}
      ${jaEnviado && a.entrega.texto ? `<div class="texto-box">${a.entrega.texto}</div>` : ''}
      ${a.tipo !== 'questoes_plataforma' && a.tipo !== 'simulado' && a.tipo !== 'exercicio_lista' ? `
      <div class="envio-form">
        <textarea placeholder="Escreva sua resposta (opcional se for enviar arquivo)..." data-texto-input></textarea>
        <input type="file" data-arquivo-input>
        <div style="display:flex; gap:10px; align-items:center;">
          <button class="dash-btn pequeno" data-enviar-generico>${jaEnviado ? 'Substituir envio' : 'Enviar'}</button>
          <span class="msg-inline" data-msg></span>
        </div>
      </div>` : `
      <button class="dash-btn pequeno" data-marcar-concluido-manual style="margin-top:10px;">${jaEnviado ? '✓ Já marcada como feita' : 'Marcar como feita'}</button>
      <span class="msg-inline" data-msg></span>`}
    `;

    widgetEl.querySelector('[data-baixar-material]')?.addEventListener('click', () => baixarArquivo(`/api/deveres/deveres/${deverId}/atividades/${index}/material`, a.conteudo.arquivo.nome));
    widgetEl.querySelector('[data-baixar-entrega]')?.addEventListener('click', () => baixarArquivo(`/api/deveres/deveres/${deverId}/atividades/${index}/arquivo`, a.entrega.arquivo.nome));

    widgetEl.querySelector('[data-enviar-generico]')?.addEventListener('click', async () => {
      const btn = widgetEl.querySelector('[data-enviar-generico]');
      const msg = widgetEl.querySelector('[data-msg]');
      const texto = widgetEl.querySelector('[data-texto-input]').value;
      const arquivoInput = widgetEl.querySelector('[data-arquivo-input]');
      if (!texto.trim() && !arquivoInput.files[0]) { msg.className = 'msg-inline erro'; msg.textContent = 'Escreva um texto ou selecione um arquivo.'; return; }
      const form = new FormData();
      if (texto.trim()) form.append('texto', texto.trim());
      if (arquivoInput.files[0]) form.append('arquivo', arquivoInput.files[0]);
      btn.disabled = true;
      try {
        const res = await fetch(`/api/deveres/minhas-semanas/${deverId}/atividades/${index}/enviar`, { method: 'POST', headers: authHeaders(), body: form });
        const data = await res.json();
        if (!res.ok) { msg.className = 'msg-inline erro'; msg.textContent = data.msg || 'Erro ao enviar.'; btn.disabled = false; return; }
        msg.className = 'msg-inline sucesso'; msg.textContent = 'Enviado com sucesso!';
        onAtualizado(data);
      } catch (err) {
        msg.className = 'msg-inline erro'; msg.textContent = 'Erro ao conectar ao servidor.'; btn.disabled = false;
      }
    });

    // Questões/simulado/exercício ainda não têm envio real — só uma marcação
    // manual de "feita" (mesmo formulário genérico, sem texto/arquivo).
    widgetEl.querySelector('[data-marcar-concluido-manual]')?.addEventListener('click', async () => {
      const btn = widgetEl.querySelector('[data-marcar-concluido-manual]');
      if (btn.disabled) return;
      btn.disabled = true;
      const form = new FormData();
      form.append('texto', 'concluída manualmente');
      try {
        const res = await fetch(`/api/deveres/minhas-semanas/${deverId}/atividades/${index}/enviar`, { method: 'POST', headers: authHeaders(), body: form });
        const data = await res.json();
        if (res.ok) onAtualizado(data); else btn.disabled = false;
      } catch (err) { btn.disabled = false; }
    });
  }

  // Widget de "assistir um módulo inteiro" — lista as aulas do módulo, abre o
  // player embutido na própria atividade ao clicar em uma delas.
  async function renderAssistirModulo(widgetEl, a) {
    const moduloId = a.conteudo?.moduloId?._id;
    if (!moduloId) { widgetEl.innerHTML = '<p class="embed-aviso">Módulo não configurado nesta atividade.</p>'; return; }
    widgetEl.innerHTML = '<p style="opacity:0.7;">Carregando aulas do módulo...</p>';
    const res = await fetch(`/api/aulas/modulos/${moduloId}/aulas`, { headers: authHeaders() });
    const aulas = res.ok ? await res.json() : [];
    const progresso = a.progressoReal || { concluidas: 0, total: aulas.length };
    widgetEl.innerHTML = `
      <p class="embed-aviso">${progresso.concluidas}/${progresso.total} aulas concluídas</p>
      <div class="modulo-aulas-lista">${aulas.map(au => `<button class="dash-btn secundario pequeno" data-assistir-modulo="${au._id}">${au.concluida ? '✓ ' : ''}${au.titulo}</button>`).join('')}</div>
      <div data-player-modulo style="margin-top:14px;"></div>`;
    widgetEl.querySelectorAll('[data-assistir-modulo]').forEach(btn => {
      btn.addEventListener('click', () => {
        AulaPlayerEmbed.criarPlayerAula(widgetEl.querySelector('[data-player-modulo]'), btn.dataset.assistirModulo, {});
      });
    });
  }

  // container: elemento onde a atividade inteira (título, status, widget) é
  // renderizada. ctx = { deverId, onAtualizado(dadosDeverAtualizado) }.
  async function renderAtividade(container, atividade, index, ctx) {
    const { deverId, onAtualizado } = ctx;
    container.innerHTML = `
      <h4>${atividade.titulo}${atividade.obrigatoria ? '' : ' <span class="opcional-tag">(opcional)</span>'}</h4>
      <div class="meta">${NOMES_TIPO[atividade.tipo] || atividade.tipo} · ${atividade.bloqueada ? '🔒 Bloqueada' : labelEntrega(atividade)}</div>
      ${atividade.descricao ? `<p class="atividade-descricao">${atividade.descricao}</p>` : ''}
      <div data-widget></div>
      ${atividade.entrega?.comentarioProfessor ? `<div class="comentario-prof"><strong>Comentário do professor:</strong> ${atividade.entrega.comentarioProfessor}</div>` : ''}
    `;
    const widgetEl = container.querySelector('[data-widget]');

    if (atividade.bloqueada) {
      widgetEl.innerHTML = '<p class="embed-aviso">🔒 Conclua a tarefa anterior desta semana pra liberar esta.</p>';
      return;
    }

    if (atividade.tipo === 'assistir_aula' && atividade.conteudo?.aulaId?._id) {
      await AulaPlayerEmbed.criarPlayerAula(widgetEl, atividade.conteudo.aulaId._id, { onConcluida: onAtualizado });
    } else if (atividade.tipo === 'assistir_modulo') {
      await renderAssistirModulo(widgetEl, atividade);
    } else if (atividade.tipo === 'producao_textual' && atividade.conteudo?.temaId?._id) {
      if (atividade.producaoReal) {
        widgetEl.innerHTML = `<p class="embed-aviso">Produção enviada — status: <strong>${NOMES_STATUS_PRODUCAO[atividade.producaoReal.status] || atividade.producaoReal.status}</strong>${atividade.producaoReal.notaTotal != null ? ' · Nota: ' + atividade.producaoReal.notaTotal : ''}</p>`;
      } else {
        await ProducaoTextualEmbed.criarEditorProducao(widgetEl, {
          temaId: atividade.conteudo.temaId._id, deverId, index, entregaExistente: atividade.entrega, onEnviado: onAtualizado
        });
      }
    } else if (atividade.tipo === 'producao_oral') {
      GravadorAudio.criarGravadorAudio(widgetEl, { deverId, index, entregaExistente: atividade.entrega, onEnviado: onAtualizado });
    } else if (atividade.tipo === 'questoes_plataforma' && atividade.conteudo?.conjuntoId?._id) {
      const conjunto = atividade.conteudo.conjuntoId;
      if (atividade.tentativaReal) {
        widgetEl.innerHTML = `<p class="embed-aviso">Conjunto resolvido — <strong>${atividade.tentativaReal.percentualAcertos}% de acertos</strong>.</p>
          <a href="resolver-conjunto.html?id=${conjunto._id}" target="_blank" class="dash-btn secundario pequeno">Refazer conjunto</a>`;
      } else {
        widgetEl.innerHTML = `<p class="embed-aviso">${conjunto.descricao || ''} ${conjunto.quantidadeQuestoes} questões.</p>
          <a href="resolver-conjunto.html?id=${conjunto._id}" target="_blank" class="dash-btn pequeno">Abrir conjunto: ${conjunto.nome}</a>`;
      }
    } else {
      renderGenerico(widgetEl, atividade, deverId, index, onAtualizado);
    }
  }

  return { renderAtividade };
})();
