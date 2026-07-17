// Editor de produção textual embutido — usado dentro de uma atividade de
// Dever de Casa. Envia pela mesma rota de entrega do dever
// (/api/deveres/minhas-semanas/:deverId/atividades/:index/enviar), que por
// baixo cria uma Producao real (backend/routes/deveres.js) — a mesma fila que
// o professor já usa em Ambiente de Produção. Inspirado em
// public/js/correcoes-texto.js, mas independente: aquele arquivo é um state
// machine de 5 telas amarrado a ids fixos, então aqui é uma reimplementação
// enxuta em vez de um reaproveitamento direto.
const ProducaoTextualEmbed = (() => {
  function authHeaders(json) {
    const token = localStorage.getItem('token');
    return { Authorization: 'Bearer ' + token, ...(json ? { 'Content-Type': 'application/json' } : {}) };
  }
  function contarPalavras(texto) {
    return texto.trim().split(/\s+/).filter(Boolean).length;
  }

  // container: onde o editor inteiro é renderizado.
  // opts: { temaId, deverId, index, entregaExistente, onEnviado }
  async function criarEditorProducao(container, opts) {
    const { temaId, deverId, index, entregaExistente, onEnviado } = opts;
    container.innerHTML = '<p style="opacity:0.7;">Carregando tema...</p>';

    const res = await fetch(`/api/temas/${temaId}`, { headers: authHeaders() });
    if (!res.ok) { container.innerHTML = '<p>Não foi possível carregar o tema desta produção.</p>'; return null; }
    const tema = await res.json();

    const jaEnviado = entregaExistente?.status === 'enviado';
    container.innerHTML = `
      <h4 class="embed-producao-titulo">${tema.titulo}</h4>
      ${tema.enunciado ? `<div class="embed-producao-enunciado">${tema.enunciado}</div>` : ''}
      <p class="embed-producao-limites">Entre ${tema.limitePalavrasMin} e ${tema.limitePalavrasMax} palavras · ${tema.creditosNecessarios} crédito${tema.creditosNecessarios === 1 ? '' : 's'} necessário${tema.creditosNecessarios === 1 ? '' : 's'}</p>
      <textarea class="embed-textarea" data-texto placeholder="Escreva sua produção aqui..."></textarea>
      <div class="embed-contador" data-contador></div>
      <button class="dash-btn pequeno" type="button" data-enviar-producao>${jaEnviado ? 'Substituir envio' : 'Enviar produção'}</button>
      <div class="msg-inline" data-msg></div>
    `;

    const textarea = container.querySelector('[data-texto]');
    const contador = container.querySelector('[data-contador]');
    function atualizarContador() {
      const n = contarPalavras(textarea.value);
      contador.textContent = `${n} palavra${n === 1 ? '' : 's'}`;
      contador.style.color = (n < tema.limitePalavrasMin || n > tema.limitePalavrasMax) ? 'var(--danger-text)' : 'var(--success-text)';
    }
    textarea.addEventListener('input', atualizarContador);
    atualizarContador();

    container.querySelector('[data-enviar-producao]').addEventListener('click', async () => {
      const btn = container.querySelector('[data-enviar-producao]');
      const msg = container.querySelector('[data-msg]');
      const texto = textarea.value.trim();
      const n = contarPalavras(texto);
      if (n < tema.limitePalavrasMin || n > tema.limitePalavrasMax) {
        msg.className = 'msg-inline erro';
        msg.textContent = `Seu texto precisa ter entre ${tema.limitePalavrasMin} e ${tema.limitePalavrasMax} palavras (está com ${n}).`;
        return;
      }
      btn.disabled = true;
      msg.className = 'msg-inline';
      msg.textContent = 'Enviando...';
      const form = new FormData();
      form.append('texto', texto);
      try {
        const envio = await fetch(`/api/deveres/minhas-semanas/${deverId}/atividades/${index}/enviar`, { method: 'POST', headers: authHeaders(), body: form });
        const data = await envio.json();
        if (!envio.ok) { msg.className = 'msg-inline erro'; msg.textContent = data.msg || 'Erro ao enviar.'; btn.disabled = false; return; }
        msg.className = 'msg-inline sucesso';
        msg.textContent = 'Produção enviada! Ela já está na fila de correção do seu professor.';
        if (onEnviado) onEnviado(data);
      } catch (err) {
        msg.className = 'msg-inline erro';
        msg.textContent = 'Erro ao conectar ao servidor.';
        btn.disabled = false;
      }
    });

    return tema;
  }

  return { criarEditorProducao };
})();
