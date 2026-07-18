// Gravador de áudio ao vivo — usado tanto na atividade "Produção oral" do
// Dever de Casa quanto no envio de produção oral no Ambiente de Produção
// (correcoes-texto.html). A captura (getUserMedia/MediaRecorder) é sempre a
// mesma; quem muda é ONDE o áudio gravado é enviado — por isso o upload em
// si fica a cargo de `opts.enviarArquivo`, passado por quem usa o widget,
// em vez de fixar uma rota aqui dentro.
const GravadorAudio = (() => {
  function formatarTempo(seg) {
    const m = Math.floor(seg / 60), s = Math.floor(seg % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  // container: onde o gravador inteiro é renderizado.
  // opts: { jaEnviado (bool), onEnviado(data), enviarArquivo(file) => Promise<{ok, data}> }
  function criarGravadorAudio(container, opts) {
    const { jaEnviado, onEnviado, enviarArquivo } = opts;

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      container.innerHTML = `
        <p class="embed-aviso">Seu navegador não permite gravar áudio diretamente aqui. Envie um arquivo de áudio já gravado:</p>
        <input type="file" accept="audio/*" data-arquivo-audio>
        <button class="dash-btn pequeno" type="button" data-enviar-arquivo-audio disabled>Enviar</button>
        <div class="msg-inline" data-msg></div>`;
      const input = container.querySelector('[data-arquivo-audio]');
      const btn = container.querySelector('[data-enviar-arquivo-audio]');
      input.addEventListener('change', () => { btn.disabled = !input.files[0]; });
      btn.addEventListener('click', () => enviar(input.files[0], container, opts));
      return;
    }

    let mediaRecorder = null, chunks = [], streamAtual = null, timerId = null, segundos = 0, blobGravado = null;

    function renderInicial() {
      container.innerHTML = `
        <p class="embed-aviso">${jaEnviado ? 'Você já enviou uma gravação. Grave de novo pra substituir.' : 'Clique em gravar e fale sua resposta.'}</p>
        <div class="gravador-controles">
          <button class="dash-btn pequeno" type="button" data-gravar><img src="img/icones/mic.svg" alt="" style="width:0.9em; height:0.9em; vertical-align:-0.12em; margin-right:4px;">Gravar</button>
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

      container.querySelector('[data-gravar]').outerHTML = `<button class="dash-btn perigo pequeno" type="button" data-parar><img src="img/icones/stop.svg" alt="" style="width:0.9em; height:0.9em; vertical-align:-0.12em; margin-right:4px;">Parar</button>`;
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
        enviar(arquivo, container, opts, segundos);
      });
    }

    renderInicial();
  }

  async function enviar(arquivo, container, opts, duracaoSegundos) {
    const btn = container.querySelector('[data-enviar-gravacao], [data-enviar-arquivo-audio]');
    const msg = container.querySelector('[data-msg]');
    if (btn) btn.disabled = true;
    msg.className = 'msg-inline';
    msg.textContent = 'Enviando...';
    try {
      const resultado = await opts.enviarArquivo(arquivo, duracaoSegundos);
      if (!resultado.ok) { msg.className = 'msg-inline erro'; msg.textContent = resultado.data?.msg || 'Erro ao enviar.'; if (btn) btn.disabled = false; return; }
      msg.className = 'msg-inline sucesso';
      msg.textContent = 'Áudio enviado!';
      if (opts.onEnviado) opts.onEnviado(resultado.data);
    } catch (err) {
      msg.className = 'msg-inline erro';
      msg.textContent = 'Erro ao conectar ao servidor.';
      if (btn) btn.disabled = false;
    }
  }

  return { criarGravadorAudio };
})();
