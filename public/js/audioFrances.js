// =====================================================================
// ÁUDIO EM FRANCÊS — helper compartilhado, usado em toda leitura de texto
// francês do site (Questões Interativas, questões tipo "escuta" no Praticar/
// Dever de Casa via js/questoesRender.js#tocarAudio). Toca um áudio real,
// pré-gerado com Coqui TTS (scripts_tts/gerar_audios.py), servido como
// estático em /audio/tts/<sha256(texto)>.mp3 — o hash é recalculado aqui no
// navegador (Web Crypto, mesmo algoritmo usado na geração) pra achar o
// arquivo certo. Se o texto não tiver áudio gerado (ou o navegador não
// suportar Web Crypto/fetch), cai de volta na Web Speech API do navegador
// (window.speechSynthesis), como fazia antes.
// =====================================================================
(function () {
  var PASTA_AUDIO = 'audio/tts/';

  var manifestPromise = (window.fetch ? fetch(PASTA_AUDIO + 'manifest.json') : Promise.reject())
    .then(function(r){ return r.ok ? r.json() : []; })
    .then(function(lista){ return new Set(lista); })
    .catch(function(){ return new Set(); });

  var vozFR = null;

  function carregarVoz(){
    if (!window.speechSynthesis) return;
    var vs = speechSynthesis.getVoices();
    vozFR = vs.filter(function(v){ return /^fr/i.test(v.lang); })[0] || null;
  }

  carregarVoz();
  if (window.speechSynthesis && speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = carregarVoz;
  }

  function falarComVozDoNavegador(texto, botao){
    if (!window.speechSynthesis) {
      if (botao) alert('Seu navegador não é compatível com leitura de áudio.');
      return;
    }
    speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(texto);
    u.lang = 'fr-FR';
    u.rate = 0.82;
    if (vozFR) u.voice = vozFR;
    if (botao){
      botao.classList.add('tocando');
      u.onend = u.onerror = function(){ botao.classList.remove('tocando'); };
    }
    speechSynthesis.speak(u);
  }

  function sha256Hex(texto){
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto)).then(function(buffer){
      var bytes = new Uint8Array(buffer);
      var hex = '';
      for (var i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
      return hex;
    });
  }

  // texto: o que falar. botao (opcional): elemento que ganha a classe
  // "tocando" enquanto o áudio está em andamento (mesmo padrão visual usado
  // nos ícones 🔊 espalhados pelo site).
  function falarFrances(texto, botao){
    if (!window.crypto || !window.crypto.subtle) {
      falarComVozDoNavegador(texto, botao);
      return;
    }
    manifestPromise.then(function(manifest){
      return sha256Hex(texto).then(function(hash){
        if (!manifest.has(hash)) {
          falarComVozDoNavegador(texto, botao);
          return;
        }
        var audio = new Audio(PASTA_AUDIO + hash + '.mp3');
        if (botao){
          botao.classList.add('tocando');
          audio.onended = audio.onerror = function(){ botao.classList.remove('tocando'); };
        }
        audio.play().catch(function(){ falarComVozDoNavegador(texto, botao); });
      });
    });
  }

  window.falarFrances = falarFrances;
})();
