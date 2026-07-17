// Gravador de áudio ao vivo — usado na atividade "Produção oral" do Dever de
// Casa. Não existe nenhuma correção rica de produção oral na plataforma ainda
// (decisão registrada no plano da Fase 2/3A), então o áudio gravado aqui vai
// pra mesma entrega genérica das outras atividades — só a captura em si é
// nova (getUserMedia/MediaRecorder), sem nada reaproveitável antes disso.
const GravadorAudio = (() => {
  function authHeaders(json) {
    const token = localStorage.getItem('token');
    return { Authorization: 'Bearer ' + token, ...(json ? { 'Content-Type': 'application/json' } : {}) };
  }
  function formatarTempo(seg) {
    const m = Math.floor(seg / 60), s = Math.floor(seg % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  // container: onde o gravador inteiro é renderizado.
  // opts: { deverId, index, entregaExistente, onEnviado }
  function criarGravadorAudio(container, opts) {
    const { deverId, index, entregaExistente, onEnviado } = opts;

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      container.innerHTML = `
        <p class="embed-aviso">Seu navegador não permite gravar áudio diretamente aqui. Envie um arquivo de áudio já gravado:</p>
        <input type="file" accept="audio/*" data-arquivo-audio>
        <button class="dash-btn pequeno" type="button" data-enviar-arquivo-audio disabled>Enviar</button>
        <div class="msg-inline" data-msg></div>`;
      const input = container.querySelector('[data-arquivo-audio]');
      const btn = container.querySelector('[data-enviar-arquivo-audio]');
      input.addEventListener('change', () => { btn.disabled = !input.files[0]; });
      btn.addEventListener('click', () => enviarBlob(input.files[0], container, deverId, index, onEnviado));
      return;
    }

    let mediaRecorder = null, chunks = [], streamAtual = null, timerId = null, segundos = 0, blobGravado = null;

    function renderInicial() {
      container.innerHTML = `
        <p class="embed-aviso">${entregaExistente?.status === 'enviado' ? 'Você já enviou uma gravação. Grave de novo pra substituir.' : 'Clique em gravar e fale sua resposta.'}</p>
        <div class="gravador-controles">
          <button class="dash-btn pequeno" type="button" data-gravar>🎙️ Gravar</button>
          <span class="gravador-tempo" data-tempo style="display:none;"></span>
        </div>
        <div class="msg-inline" data-msg></div>`;
      container.querySelector('[data-gravar]').addEventListener('click', iniciarGravacao);
    }

    async function iniciarGravacao() {
      const msg = container.querySelector('[data-msg]');
      try {
        streamAtual = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (err) {
        msg.className = 'msg-inline erro';
        msg.textContent = 'Não foi possível acessar o microfone. Verifique a permissão do navegador.';
        return;
      }
      chunks = [];
      segundos = 0;
      mediaRecorder = new MediaRecorder(streamAtual);
      mediaRecorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
      mediaRecorder.onstop = () => {
        blobGravado = new Blob(chunks, { type: 'audio/webm' });
        streamAtual.getTracks().forEach(t => t.stop());
        clearInterval(timerId);
        renderPreview();
      };
      mediaRecorder.start();

      const tempoEl = container.querySelector('[data-tempo]');
      tempoEl.style.display = 'inline';
      timerId = setInterval(() => { segundos++; tempoEl.textContent = formatarTempo(segundos); }, 1000);

      container.querySelector('[data-gravar]').outerHTML = `<button class="dash-btn perigo pequeno" type="button" data-parar>⏹ Parar</button>`;
      container.querySelector('[data-parar]').addEventListener('click', () => mediaRecorder.stop());
    }

    function renderPreview() {
      const url = URL.createObjectURL(blobGravado);
      container.innerHTML = `
        <p class="embed-aviso">Gravação de ${formatarTempo(segundos)} pronta. Ouça antes de enviar:</p>
        <audio controls src="${url}"></audio>
        <div class="gravador-controles">
          <button class="dash-btn secundario pequeno" type="button" data-regravar>Regravar</button>
          <button class="dash-btn pequeno" type="button" data-enviar-gravacao>Enviar gravação</button>
        </div>
        <div class="msg-inline" data-msg></div>`;
      container.querySelector('[data-regravar]').addEventListener('click', renderInicial);
      container.querySelector('[data-enviar-gravacao]').addEventListener('click', () => {
        const arquivo = new File([blobGravado], 'gravacao.webm', { type: 'audio/webm' });
        enviarBlob(arquivo, container, deverId, index, onEnviado);
      });
    }

    renderInicial();
  }

  async function enviarBlob(arquivo, container, deverId, index, onEnviado) {
    const btn = container.querySelector('[data-enviar-gravacao], [data-enviar-arquivo-audio]');
    const msg = container.querySelector('[data-msg]');
    if (btn) btn.disabled = true;
    msg.className = 'msg-inline';
    msg.textContent = 'Enviando...';
    const form = new FormData();
    form.append('arquivo', arquivo);
    try {
      const res = await fetch(`/api/deveres/minhas-semanas/${deverId}/atividades/${index}/enviar`, { method: 'POST', headers: authHeaders(), body: form });
      const data = await res.json();
      if (!res.ok) { msg.className = 'msg-inline erro'; msg.textContent = data.msg || 'Erro ao enviar.'; if (btn) btn.disabled = false; return; }
      msg.className = 'msg-inline sucesso';
      msg.textContent = 'Áudio enviado!';
      if (onEnviado) onEnviado(data);
    } catch (err) {
      msg.className = 'msg-inline erro';
      msg.textContent = 'Erro ao conectar ao servidor.';
      if (btn) btn.disabled = false;
    }
  }

  return { criarGravadorAudio };
})();
