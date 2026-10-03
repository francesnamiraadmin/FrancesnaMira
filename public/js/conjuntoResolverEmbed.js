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
// Responder uma questão e navegar entre questões atualizam a
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
              ${sessao.questoes.map((x, i) => `<button class="qnav-btn ${x.respondida ? 'respondida' : ''} ${i === sessao.questaoAtualIndex ? 'atual' : ''}" data-ir="${i}">${i + 1}</button>`).join('')}
            </div>
            <div class="qnav-legenda"><span style="display:inline-block; width:11px; height:11px; border-radius:3px; background:rgba(37,99,235,.16); border:1px solid #2563eb; vertical-align:-1px;"></span> respondida &nbsp; contorno = atual</div>
          </div>
          <div>
            ${renderQuestaoCard(q)}
            <div class="resolver-rodape">
              <div style="display:flex; gap:10px;">
                <button class="q-btn secundario" data-anterior ${sessao.questaoAtualIndex === 0 ? 'disabled' : ''}>‹ Anterior</button>
                <button class="q-btn secundario" data-proxima ${sessao.questaoAtualIndex === sessao.questoes.length - 1 ? 'disabled' : ''}>Próxima ›</button>
              </div>
              <button class="q-btn" data-enviar ${todasRespondidas ? '' : 'disabled'}>Finalizar a prova</button>
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

      return `<div class="q-card">
        <div class="q-head">
          <span class="q-tags">
            <span class="q-tag">${NOMES_TIPO[q.tipo]}</span>
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

    // Resultado: painel com todas as questões (verde = acertou, vermelho = errou); clicar mostra
    // uma questão por vez, com o gabarito comentado (por que a certa, pegadinhas, dicas).
    function renderResultado(t) {
      const minutos = Math.round(t.tempoGastoSegundos / 60);
      // Simulado saiu da Plataforma de Questões — uma Tentativa antiga com pool="simulado"
      // ainda pode existir (histórico preservado), mas volta pra Praticar como qualquer outra.
      const voltar = !embed ? `<a class="q-btn secundario" href="praticar.html">Voltar aos Conjuntos</a>` : '';
      const erradas = t.respostas.filter(r => !r.correta).length, certas = t.respostas.length - erradas;
      const pond = t.pontosPossiveis ? Math.round(t.pontosObtidos / t.pontosPossiveis * 100) : null;
      let filtro = erradas ? 'erradas' : 'todas';
      let atual = t.respostas.findIndex(r => !r.correta);
      if (atual < 0) atual = 0;
      container.innerHTML = `
        <div class="resultado-resumo">
          <h1 style="font-family:'Playfair Display', serif;">Resultado</h1>
          <div class="nota">${t.totalCorretas}/${t.totalQuestoes}</div>
          <p>${t.percentualAcertos}% de aproveitamento — ${minutos} min ${t.expirouPorTempo ? '(tempo esgotado)' : ''}</p>
          ${pond !== null ? `<p class="res-ponderada" title="Cada questão vale conforme o nível, como na prova do TCF">Nota ponderada pelo nível: <b>${t.pontosObtidos} / ${t.pontosPossiveis} pts</b> (${pond}%)</p>` : ''}
          ${voltar ? `<div class="conjunto-acoes" style="justify-content:center; margin-top:16px;">${voltar}</div>` : ''}
        </div>
        <div class="res-painel">
          <div class="res-filtros" role="tablist">
            <button type="button" data-res-filtro="todas">Todas <b>${t.respostas.length}</b></button>
            <button type="button" data-res-filtro="erradas" class="errada">Erradas <b>${erradas}</b></button>
            <button type="button" data-res-filtro="certas" class="certa">Certas <b>${certas}</b></button>
          </div>
          <div class="res-grade" data-res-grade></div>
          <p class="res-legenda"><i class="certa"></i> acertou &nbsp; <i class="errada"></i> errou &nbsp; · clique numa questão para vê-la</p>
        </div>
        <div data-res-questao></div>`;
      const grade = container.querySelector('[data-res-grade]'), alvo = container.querySelector('[data-res-questao]');
      const visiveis = () => t.respostas.map((r, i) => i).filter(i => filtro === 'todas' || (filtro === 'erradas' ? !t.respostas[i].correta : t.respostas[i].correta));
      const desenharGrade = () => {
        container.querySelectorAll('[data-res-filtro]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.resFiltro === filtro)));
        grade.innerHTML = visiveis().map(i => `<button type="button" class="res-q ${t.respostas[i].correta ? 'certa' : 'errada'} ${i === atual ? 'atual' : ''}" data-res-i="${i}" aria-label="Questão ${i + 1}: ${t.respostas[i].correta ? 'acertou' : 'errou'}">${i + 1}</button>`).join('')
          || '<p style="opacity:.7;">Nenhuma questão neste filtro.</p>';
      };
      const mostrar = (i, rolar) => {
        atual = i;
        desenharGrade();
        const lista = visiveis(), pos = lista.indexOf(i);
        alvo.innerHTML = renderItemResultado(t.respostas[i], i, t._id) +
          `<div class="res-nav"><button type="button" class="q-btn secundario" data-res-passo="-1" ${pos <= 0 ? 'disabled' : ''}>‹ Anterior</button>
           <span>${pos >= 0 ? pos + 1 : '–'} de ${lista.length}</span>
           <button type="button" class="q-btn secundario" data-res-passo="1" ${pos < 0 || pos >= lista.length - 1 ? 'disabled' : ''}>Próxima ›</button></div>`;
        ligarItem(alvo);
        carregarExplicacao(alvo, t.respostas[i]);
        if (rolar) alvo.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
      container.querySelector('.res-filtros').addEventListener('click', e => {
        const b = e.target.closest('[data-res-filtro]'); if (!b) return;
        filtro = b.dataset.resFiltro;
        const l = visiveis();
        mostrar(l.includes(atual) ? atual : (l[0] ?? atual), false);
      });
      grade.addEventListener('click', e => { const b = e.target.closest('[data-res-i]'); if (b) mostrar(Number(b.dataset.resI), true); });
      alvo.addEventListener('click', e => {
        const b = e.target.closest('[data-res-passo]'); if (!b) return;
        const l = visiveis(), pos = l.indexOf(atual) + Number(b.dataset.resPasso);
        if (l[pos] !== undefined) mostrar(l[pos], false);
      });
      mostrar(atual, false);

      function ligarItem(raiz) {
        raiz.querySelectorAll('[data-caderno-questao]').forEach(btn => {
          btn.addEventListener('click', async () => {
            const questaoId = btn.dataset.cadernoQuestao;
            const idTentativa = btn.dataset.cadernoTentativa;
            const jaEsta = btn.classList.contains('ativo');
            const url = jaEsta ? `/api/questoes/caderno/${questaoId}` : `/api/questoes/tentativas/${idTentativa}/questoes/${questaoId}/caderno`;
            const res = await fetch(url, { method: jaEsta ? 'DELETE' : 'POST', headers: authHeaders() });
            if (res.ok) {
              btn.classList.toggle('ativo');
              const r = t.respostas.find(x => String(x.questaoId) === questaoId); if (r) r.noCaderno = !jaEsta;
              btn.innerHTML = jaEsta ? '+ Adicionar ao Caderno de Revisão' : '<img class="titulo-icone-inline pequeno" src="img/icones/check.svg" alt="">No Caderno de Revisão';
            }
          });
        });
        raiz.querySelectorAll('[data-relatar-erro]').forEach(btn => {
          btn.addEventListener('click', () => {
            const wrap = raiz.querySelector(`[data-relato-wrap="${btn.dataset.relatarErro}"]`);
            if (wrap) wrap.style.display = wrap.style.display === 'none' ? 'block' : 'none';
          });
        });
        raiz.querySelectorAll('[data-relato-cancelar]').forEach(btn => {
          btn.addEventListener('click', () => {
            const wrap = raiz.querySelector(`[data-relato-wrap="${btn.dataset.relatoCancelar}"]`);
            if (wrap) wrap.style.display = 'none';
          });
        });
        raiz.querySelectorAll('[data-relato-enviar]').forEach(btn => {
          btn.addEventListener('click', async () => {
            const questaoId = btn.dataset.relatoEnviar;
            const idTentativa = btn.dataset.relatoTentativa;
            const wrap = raiz.querySelector(`[data-relato-wrap="${questaoId}"]`);
            const textarea = wrap.querySelector('textarea');
            const msgEl = wrap.querySelector('[data-relato-msg]');
            const mensagem = textarea.value.trim();
            if (!mensagem) {
              msgEl.textContent = 'Escreva uma mensagem descrevendo o erro.';
              msgEl.className = 'q-relato-msg erro';
              return;
            }
            btn.disabled = true;
            try {
              const res = await fetch('/api/erros-questoes', {
                method: 'POST', headers: authHeaders(true),
                body: JSON.stringify({ questaoId, tentativaId: idTentativa, mensagem })
              });
              const data = await res.json();
              if (!res.ok) {
                msgEl.textContent = data.msg || 'Erro ao enviar o relato.';
                msgEl.className = 'q-relato-msg erro';
                btn.disabled = false;
                return;
              }
              wrap.innerHTML = '<p class="q-relato-msg sucesso"><img class="titulo-icone-inline pequeno" src="img/icones/check.svg" alt="">Relato enviado — obrigado por ajudar a melhorar as questões!</p>';
            } catch (err) {
              msgEl.textContent = 'Erro ao conectar ao servidor.';
              msgEl.className = 'q-relato-msg erro';
              btn.disabled = false;
            }
          });
        });
      }
    }

    // Gabarito comentado da questão (gerado uma vez e guardado; as próximas aberturas são imediatas).
    const cacheExplicacao = {};
    function htmlExplicacao(d) {
      return `<div class="q-explica"><h4>Por que esta é a resposta certa</h4><p>${escapar(d.porque)}</p>` +
        (d.pegadinhas.length ? `<h4>Pegadinhas</h4><ul>${d.pegadinhas.map(p => `<li><b>${p.texto ? '« ' + escapar(p.texto) + ' »' : escapar(p.alternativa)}</b> ${escapar(p.motivo)}</li>`).join('')}</ul>` : '') +
        (d.dicas.length ? `<h4>Dicas para a prova</h4><ul class="dicas">${d.dicas.map(x => `<li>${escapar(x)}</li>`).join('')}</ul>` : '') + '</div>';
    }
    function carregarExplicacao(raiz, r) {
      const el = raiz.querySelector('[data-explica]'); if (!el) return;
      const id = String(r.questaoId);
      if (cacheExplicacao[id]) { el.innerHTML = htmlExplicacao(cacheExplicacao[id]); return; }
      el.innerHTML = '<div class="q-explica carregando"><span></span>Preparando o gabarito comentado (pegadinhas e dicas)…</div>';
      fetch(`/api/questoes/${id}/explicacao-detalhada`, { headers: authHeaders() })
        .then(res => res.json().then(d => ({ ok: res.ok, d })))
        .then(({ ok, d }) => {
          if (!el.isConnected) return;
          if (!ok) { el.innerHTML = `<div class="q-explica erro">${escapar(d.msg || 'Gabarito comentado indisponível agora.')} <button type="button" class="q-btn secundario" data-explica-de-novo>Tentar de novo</button></div>`;
            el.querySelector('[data-explica-de-novo]').addEventListener('click', () => carregarExplicacao(raiz, r)); return; }
          cacheExplicacao[id] = d;
          el.innerHTML = htmlExplicacao(d);
        }).catch(() => { if (el.isConnected) el.innerHTML = '<div class="q-explica erro">Gabarito comentado indisponível agora.</div>'; });
    }
    function escapar(v) { return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

    function renderItemResultado(r, i, idTentativa) {
      const textoResposta = valor => {
        if (valor === null || valor === undefined) return '<em>não respondida</em>';
        return r.tipo === 'vf' ? (valor ? 'Vrai' : 'Faux') : valor;
      };
      return `<div class="q-card">
        <div class="q-head">
          <span class="q-tags">
            <span class="q-tag">${NOMES_TIPO[r.tipo]}</span>
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
        <div data-explica></div>
        <div class="q-actions">
          <button class="q-btn secundario ${r.noCaderno ? 'ativo' : ''}" data-caderno-questao="${r.questaoId}" data-caderno-tentativa="${idTentativa}">${r.noCaderno ? '<img class="titulo-icone-inline pequeno" src="img/icones/check.svg" alt="">No Caderno de Revisão' : '+ Adicionar ao Caderno de Revisão'}</button>
          <button class="q-btn secundario" data-relatar-erro="${r.questaoId}"><img class="titulo-icone-inline pequeno" src="img/icones/warning.svg" alt="">Relatar erro</button>
        </div>
        <div class="q-relato-erro" data-relato-wrap="${r.questaoId}" style="display:none;">
          <textarea placeholder="Descreva o que você encontrou de errado nesta questão..."></textarea>
          <div class="q-relato-acoes">
            <button class="q-btn" data-relato-enviar="${r.questaoId}" data-relato-tentativa="${idTentativa}">Enviar relato</button>
            <button class="q-btn secundario" data-relato-cancelar="${r.questaoId}">Cancelar</button>
          </div>
          <p class="q-relato-msg" data-relato-msg></p>
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
