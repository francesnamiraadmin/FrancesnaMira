// =====================================================================
// MOTOR DE RESOLUÇÃO DE CONJUNTO — compartilhado entre a página standalone
// (resolver-conjunto.html, via resolverConjunto.js) e o widget embutido numa
// atividade do Dever de Casa (deverWorkspace.js), pra que o aluno consiga
// responder um conjunto de questões inteiro (incl. simulado/exercício de
// lista) SEM sair da aba de Dever de Casa.
//
// Todo estado fica em closures por instância (não em variáveis de módulo) e
// toda leitura/escrita do DOM é escopada a `container` (nunca getElementById
// nem um `wrap` fixo), pra permitir montar o motor dentro de outro widget
// sem colidir ids e sem quebrar se o container acabar sendo desmontado (ex.:
// o aluno troca de atividade dentro do Dever de Casa enquanto um cronômetro
// de tempo limite ainda está correndo em segundo plano).
//
// Responder uma questão, marcar revisão e navegar entre questões atualizam a
// tela NA HORA a partir do estado já carregado no cliente — a chamada de
// rede que persiste a mudança roda em paralelo, sem travar a UI (só desfaz o
// que apareceu na tela se o servidor de fato recusar). Antes, cada clique
// esperava o round-trip inteiro terminar pra só então re-renderizar, o que é
// a causa do "lag" ao responder.
// =====================================================================
const ConjuntoResolverEmbed = (() => {
  function authHeaders(json) {
    const token = localStorage.getItem('token');
    return Object.assign({ Authorization: 'Bearer ' + token }, json ? { 'Content-Type': 'application/json' } : {});
  }

  // O backend sempre devolve `opcoes` na ordem original (índice 0 é a correta na fonte),
  // já que a correção compara pelo TEXTO da opção, não pelo índice — então o embaralhamento
  // de exibição é responsabilidade só do front. Determinístico por id da questão pra não
  // reordenar a cada re-render.
  function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) >>> 0; } return h; }
  function opcoesEmbaralhadas(q) {
    if (!q.opcoes) return [];
    const idx = q.opcoes.map((_, i) => i);
    let seed = hashStr(q._id);
    for (let i = idx.length - 1; i > 0; i--) {
      seed = (seed * 1103515245 + 12345) >>> 0;
      const j = seed % (i + 1);
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    return idx.map(i => q.opcoes[i]);
  }
  function formatarMMSS(seg) {
    const m = Math.floor(seg / 60).toString().padStart(2, '0');
    const s = (seg % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  // container: elemento onde tudo é renderizado (o motor toma conta do innerHTML dele).
  // opts: { conjuntoId, tentativaId, embed (bool — esconde "voltar" pro hub da
  //         Plataforma de Questões, já que faz sentido só na página standalone),
  //         onFinalizado(tentativa) }
  // Retorna { destruir() } pra quem montou poder parar o cronômetro se o container
  // for descartado antes do fim (ex.: navegação pra outra atividade do dever).
  function criarResolver(container, opts) {
    const { conjuntoId, tentativaId, embed, onFinalizado } = opts || {};
    let sessao = null;
    let timerInterval = null;
    let enviando = false;

    function erroTela(msg) {
      clearInterval(timerInterval);
      container.innerHTML = `<p style="text-align:center; opacity:0.8; padding:40px;">${msg}</p>`;
    }

    // ===================== SESSÃO (resolução ao vivo) =====================

    async function iniciarOuRetomarSessao() {
      container.innerHTML = '<p style="text-align:center; opacity:0.7; padding:30px;">Carregando conjunto...</p>';
      const res = await fetch(`/api/questoes/conjuntos/${conjuntoId}/sessao`, { method: 'POST', headers: authHeaders() });
      if (!res.ok) return erroTela('Não foi possível carregar este conjunto.');
      sessao = await res.json();
      renderSessao();
      iniciarTimerSeNecessario();
    }

    function tempoRestanteSegundos() {
      if (!sessao.tempoLimiteSegundos) return null;
      return Math.max(0, sessao.tempoLimiteSegundos - sessao.tempoDecorridoSegundos);
    }

    function iniciarTimerSeNecessario() {
      clearInterval(timerInterval);
      if (!sessao.tempoLimiteSegundos) return;
      timerInterval = setInterval(() => {
        sessao.tempoDecorridoSegundos++;
        const restante = tempoRestanteSegundos();
        const el = container.querySelector('[data-resolver-timer]');
        if (el) {
          el.innerHTML = '<img class="titulo-icone-inline pequeno" src="img/icones/tempo.svg" alt="">' + formatarMMSS(restante);
          el.classList.toggle('alerta', restante <= 60);
        }
        if (restante <= 0) { clearInterval(timerInterval); finalizarConjunto(); }
      }, 1000);
    }

    function renderSessao() {
      const q = sessao.questoes[sessao.questaoAtualIndex];
      const todasRespondidas = sessao.questoes.every(x => x.respondida);

      container.innerHTML = `
        <div class="resolver-header">
          <h1>${sessao.conjuntoNome}</h1>
          <div class="resolver-progress">Questão ${sessao.questaoAtualIndex + 1} de ${sessao.questoes.length}</div>
          ${sessao.tempoLimiteSegundos ? `<div class="resolver-timer" data-resolver-timer><img class="titulo-icone-inline pequeno" src="img/icones/tempo.svg" alt="">${formatarMMSS(tempoRestanteSegundos())}</div>` : ''}
        </div>
        <div class="resolver-layout">
          <div>
            <div class="qnav-grid" data-qnav-grid>
              ${sessao.questoes.map((x, i) => `<button class="qnav-btn ${x.respondida ? 'respondida' : ''} ${x.marcadaRevisao ? 'marcada' : ''} ${i === sessao.questaoAtualIndex ? 'atual' : ''}" data-ir="${i}">${i + 1}</button>`).join('')}
            </div>
            <div class="qnav-legenda"><span style="display:inline-block; width:11px; height:11px; border-radius:3px; background:var(--success-bg); border:1px solid var(--success-text); vertical-align:-1px;"></span> respondida &nbsp; <img src="img/icones/star-filled.svg" alt="" style="width:0.9em; height:0.9em; vertical-align:-0.1em;"> marcada para revisão &nbsp; contorno = atual</div>
          </div>
          <div>
            ${renderQuestaoCard(q)}
            <div class="resolver-rodape">
              <div style="display:flex; gap:10px;">
                <button class="q-btn secundario" data-anterior ${sessao.questaoAtualIndex === 0 ? 'disabled' : ''}>‹ Anterior</button>
                <button class="q-btn secundario" data-proxima ${sessao.questaoAtualIndex === sessao.questoes.length - 1 ? 'disabled' : ''}>Próxima ›</button>
              </div>
              <button class="q-btn" data-enviar ${todasRespondidas ? '' : 'disabled'}>Enviar Conjunto</button>
            </div>
          </div>
        </div>
      `;

      ligarEventosSessao();
    }

    function renderQuestaoCard(q) {
      let corpo = '';
      if (q.tipo === 'escuta') corpo += `<button class="q-audio-btn" data-audio><img class="titulo-icone-inline pequeno" src="img/icones/headphones.svg" alt="">Ouvir áudio</button>`;
      if (q.visual) corpo += renderVisual(q.visual);
      if (q.texto) corpo += `<div class="q-texto">${q.texto}</div>`;
      corpo += `<div class="q-enunciado">${q.enunciado}</div>`;

      if (q.tipo === 'vf') {
        corpo += `<div class="q-vf-btns" data-resposta-area>
          <button data-valor="true" class="${q.respostaEscolhida === true ? 'selecionada' : ''}">Vrai</button>
          <button data-valor="false" class="${q.respostaEscolhida === false ? 'selecionada' : ''}">Faux</button>
        </div>`;
      } else {
        corpo += `<div class="q-opcoes" data-resposta-area>` + opcoesEmbaralhadas(q).map(op =>
          `<button class="q-opcao ${q.respostaEscolhida === op ? 'selecionada' : ''}" data-valor="${encodeURIComponent(op)}">${op}</button>`
        ).join('') + `</div>`;
      }

      corpo += `<div class="q-actions">
        <button class="q-btn secundario ${q.marcadaRevisao ? 'ativo' : ''}" data-marcar-revisao>${q.marcadaRevisao ? '<img class="titulo-icone-inline pequeno" src="img/icones/star-filled.svg" alt="">Marcada para revisão' : '<img class="titulo-icone-inline pequeno" src="img/icones/star-empty.svg" alt="">Marcar para revisão'}</button>
      </div>`;

      return `<div class="q-card">
        <div class="q-head">
          <span class="q-tags">
            <span class="q-tag">${NOMES_TIPO[q.tipo]}</span>
            <span class="q-pill">${q.nivel}</span>
            <span class="q-pill">${MATERIAS_LABELS[q.materia] || q.materia}</span>
          </span>
        </div>
        ${corpo}
      </div>`;
    }

    function ligarEventosSessao() {
      container.querySelector('[data-qnav-grid]').addEventListener('click', e => {
        const btn = e.target.closest('[data-ir]');
        if (btn) irParaQuestao(Number(btn.dataset.ir));
      });
      container.querySelector('[data-anterior]').addEventListener('click', () => irParaQuestao(sessao.questaoAtualIndex - 1));
      container.querySelector('[data-proxima]').addEventListener('click', () => irParaQuestao(sessao.questaoAtualIndex + 1));
      container.querySelector('[data-enviar]').addEventListener('click', () => tentarFinalizar());

      const audioBtn = container.querySelector('[data-audio]');
      if (audioBtn) audioBtn.addEventListener('click', () => tocarAudio(sessao.questoes[sessao.questaoAtualIndex].audio));

      container.querySelector('[data-resposta-area]').addEventListener('click', e => {
        const opcaoBtn = e.target.closest('.q-opcao');
        if (opcaoBtn) return responderAtual(decodeURIComponent(opcaoBtn.dataset.valor));
        const vfBtn = e.target.closest('.q-vf-btns button');
        if (vfBtn) return responderAtual(vfBtn.dataset.valor === 'true');
      });

      container.querySelector('[data-marcar-revisao]').addEventListener('click', () => marcarRevisaoAtual());
    }

    // Navegar entre questões já carregadas localmente não depende do servidor —
    // re-renderiza na hora e persiste o índice em paralelo (é só bookkeeping pra
    // retomar de onde parou depois, não afeta o que a tela mostra agora).
    function irParaQuestao(index) {
      if (!sessao || index < 0 || index >= sessao.questoes.length) return;
      sessao.questaoAtualIndex = index;
      renderSessao();
      fetch(`/api/questoes/sessoes/${sessao._id}/atual`, {
        method: 'PATCH', headers: authHeaders(true), body: JSON.stringify({ index })
      }).catch(() => {});
    }

    // Estado otimista: marca a resposta na tela imediatamente, confirma com o
    // servidor em paralelo. Só desfaz e avisa se o servidor de fato recusar.
    function responderAtual(valor) {
      const index = sessao.questaoAtualIndex;
      const item = sessao.questoes[index];
      const anterior = { respostaEscolhida: item.respostaEscolhida, respondida: item.respondida };
      item.respostaEscolhida = valor;
      item.respondida = true;
      renderSessao();
      fetch(`/api/questoes/sessoes/${sessao._id}/questoes/${index}`, {
        method: 'PUT', headers: authHeaders(true), body: JSON.stringify({ respostaEscolhida: valor })
      }).then(res => {
        if (!res.ok) desfazerResposta(index, anterior);
      }).catch(() => desfazerResposta(index, anterior));
    }

    function desfazerResposta(index, anterior) {
      if (!sessao || !sessao.questoes[index]) return;
      Object.assign(sessao.questoes[index], anterior);
      if (sessao.questaoAtualIndex === index) renderSessao();
    }

    function marcarRevisaoAtual() {
      const index = sessao.questaoAtualIndex;
      const novoValor = !sessao.questoes[index].marcadaRevisao;
      sessao.questoes[index].marcadaRevisao = novoValor;
      renderSessao();
      fetch(`/api/questoes/sessoes/${sessao._id}/questoes/${index}`, {
        method: 'PUT', headers: authHeaders(true), body: JSON.stringify({ marcadaRevisao: novoValor })
      }).then(res => {
        if (!res.ok && sessao?.questoes[index]) { sessao.questoes[index].marcadaRevisao = !novoValor; if (sessao.questaoAtualIndex === index) renderSessao(); }
      }).catch(() => {
        if (sessao?.questoes[index]) { sessao.questoes[index].marcadaRevisao = !novoValor; if (sessao.questaoAtualIndex === index) renderSessao(); }
      });
    }

    async function tentarFinalizar() {
      const res = await fetch(`/api/questoes/sessoes/${sessao._id}/finalizar`, { method: 'POST', headers: authHeaders() });
      const data = await res.json();
      if (res.status === 400 && data.questoesPendentes) {
        alert(`Ainda há ${data.questoesPendentes.length} questão(ões) sem resposta. Você será levado até a primeira pendente.`);
        return irParaQuestao(data.questoesPendentes[0]);
      }
      if (!res.ok) return alert(data.msg || 'Erro ao enviar o conjunto.');
      clearInterval(timerInterval);
      renderResultado(data);
      if (onFinalizado) onFinalizado(data);
    }

    async function finalizarConjunto() {
      if (enviando) return;
      enviando = true;
      const res = await fetch(`/api/questoes/sessoes/${sessao._id}/finalizar`, { method: 'POST', headers: authHeaders() });
      const data = await res.json();
      if (res.ok) { renderResultado(data); if (onFinalizado) onFinalizado(data); }
      else erroTela(data.msg || 'Erro ao enviar o conjunto.');
    }

    // ===================== RESULTADO (gabarito) =====================

    async function carregarResultado(id) {
      container.innerHTML = '<p style="text-align:center; opacity:0.7; padding:30px;">Carregando resultado...</p>';
      const res = await fetch(`/api/questoes/tentativas/${id}`, { headers: authHeaders() });
      if (!res.ok) return erroTela('Tentativa não encontrada.');
      renderResultado(await res.json());
    }

    function renderResultado(t) {
      const minutos = Math.round(t.tempoGastoSegundos / 60);
      const voltar = !embed ? (t.pool === 'simulado'
        ? `<a class="q-btn secundario" href="simulados.html">Voltar aos Simulados</a>`
        : `<a class="q-btn secundario" href="praticar.html">Voltar aos Conjuntos</a>`) : '';
      container.innerHTML = `
        <div class="resultado-resumo">
          <h1 style="font-family:'Playfair Display', serif;">Resultado</h1>
          <div class="nota">${t.totalCorretas}/${t.totalQuestoes}</div>
          <p>${t.percentualAcertos}% de aproveitamento — ${minutos} min ${t.expirouPorTempo ? '(tempo esgotado)' : ''}</p>
          ${voltar ? `<div class="conjunto-acoes" style="justify-content:center; margin-top:16px;">${voltar}</div>` : ''}
        </div>
        <div class="resultado-lista">
          ${t.respostas.map((r, i) => renderItemResultado(r, i, t._id)).join('')}
        </div>
      `;
      container.querySelectorAll('[data-caderno-questao]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const questaoId = btn.dataset.cadernoQuestao;
          const idTentativa = btn.dataset.cadernoTentativa;
          const jaEsta = btn.classList.contains('ativo');
          const url = jaEsta ? `/api/questoes/caderno/${questaoId}` : `/api/questoes/tentativas/${idTentativa}/questoes/${questaoId}/caderno`;
          const res = await fetch(url, { method: jaEsta ? 'DELETE' : 'POST', headers: authHeaders() });
          if (res.ok) {
            btn.classList.toggle('ativo');
            btn.innerHTML = jaEsta ? '+ Adicionar ao Caderno de Revisão' : '<img class="titulo-icone-inline pequeno" src="img/icones/check.svg" alt="">No Caderno de Revisão';
          }
        });
      });
    }

    function renderItemResultado(r, i, idTentativa) {
      const textoResposta = valor => {
        if (valor === null || valor === undefined) return '<em>não respondida</em>';
        return r.tipo === 'vf' ? (valor ? 'Vrai' : 'Faux') : valor;
      };
      return `<div class="q-card">
        <div class="q-head">
          <span class="q-tags">
            <span class="q-tag">${NOMES_TIPO[r.tipo]}</span>
            <span class="q-pill">${r.nivel}</span>
            <span class="q-pill">${MATERIAS_LABELS[r.materia] || r.materia}</span>
          </span>
          <span class="q-status ${r.correta ? 'correta' : 'incorreta'}">${r.correta ? '<img class="titulo-icone-inline pequeno" src="img/icones/check.svg" alt="">Acertou' : '<img class="titulo-icone-inline pequeno" src="img/icones/x-mark.svg" alt="">Errou'}</span>
        </div>
        ${r.visual ? renderVisual(r.visual) : ''}
        ${r.texto ? `<div class="q-texto">${r.texto}</div>` : ''}
        <div class="q-enunciado">${i + 1}. ${r.enunciado}</div>
        ${r.tipo === 'vf' ? `<div class="q-enunciado" style="font-weight:600;">Afirmação: « ${r.afirmacao} »</div>` : ''}
        <p>Sua resposta: ${textoResposta(r.respostaEscolhida)}</p>
        <p>Resposta certa: <strong>${textoResposta(r.respostaCorreta)}</strong></p>
        <div class="q-gabarito"><strong>Explicação:</strong> ${r.explicacao}</div>
        <div class="q-actions">
          <button class="q-btn secundario ${r.noCaderno ? 'ativo' : ''}" data-caderno-questao="${r.questaoId}" data-caderno-tentativa="${idTentativa}">${r.noCaderno ? '<img class="titulo-icone-inline pequeno" src="img/icones/check.svg" alt="">No Caderno de Revisão' : '+ Adicionar ao Caderno de Revisão'}</button>
        </div>
      </div>`;
    }

    if (tentativaId) carregarResultado(tentativaId);
    else if (conjuntoId) iniciarOuRetomarSessao();
    else erroTela('Conjunto não especificado.');

    return { destruir: () => clearInterval(timerInterval) };
  }

  return { criarResolver };
})();
