// =====================================================================
// ÁUDIO EM FRANCÊS — helper compartilhado, usado em toda leitura de texto
// francês do site (Questões Interativas, questões tipo "escuta" no Praticar/
// Dever de Casa via js/questoesRender.js#tocarAudio). Mesmo mecanismo, literal,
// do protótipo de Questões Interativas (Google Apps Script) que foi adaptado
// pro site — Web Speech API do navegador (window.speechSynthesis), sem custo
// nem chave de API: pega a primeira voz cujo idioma comece com "fr".
// =====================================================================
(function () {
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

  // texto: o que falar. botao (opcional): elemento que ganha a classe
  // "tocando" enquanto a fala está em andamento (mesmo padrão visual usado
  // nos ícones 🔊 espalhados pelo site).
  function falarFrances(texto, botao){
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

  window.falarFrances = falarFrances;
})();
