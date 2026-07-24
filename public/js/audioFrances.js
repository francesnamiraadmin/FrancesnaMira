// =====================================================================
// ÁUDIO EM FRANCÊS — helper compartilhado, usado em toda leitura de texto
// francês do site (Questões Interativas, questões tipo "escuta" no Praticar/
// Dever de Casa via js/questoesRender.js#tocarAudio). Sem custo/chave de API:
// usa a Web Speech API do próprio navegador (window.speechSynthesis), mas
// escolhe ativamente a MELHOR voz francesa disponível em vez de deixar o
// navegador escolher sozinho — normalmente a diferença entre uma voz robótica
// genérica e uma voz neural de alta qualidade (ex.: "Microsoft Denise Online
// (Natural)" no Edge/Windows, "Google français" no Chrome).
// =====================================================================
(function () {
  var vozesFR = [];
  var vozEscolhida = null;

  // Pontuação heurística: motores de nuvem/neurais (nome contém "Natural"/
  // "Neural"/"Online", como as vozes do Edge no Windows 11) soam muito mais
  // naturais que o sintetizador local do SO — priorizados sempre que existem.
  // "Google" (Chrome) vem em seguida. fr-FR (França) é preferido sobre outras
  // variantes (fr-CA, fr-BE...) pra bater com o francês ensinado no site.
  function pontuarVoz(v) {
    var nome = (v.name || '').toLowerCase();
    var pontos = 0;
    if (/natural|neural|online/.test(nome)) pontos += 100;
    if (/google/.test(nome)) pontos += 60;
    if (/^fr-fr$/i.test(v.lang)) pontos += 20;
    if (v.localService === false) pontos += 5;
    return pontos;
  }

  function carregarVozes(){
    if (!window.speechSynthesis) return;
    vozesFR = speechSynthesis.getVoices().filter(function(v){ return /^fr/i.test(v.lang); });
    vozesFR.sort(function(a, b){ return pontuarVoz(b) - pontuarVoz(a); });
    vozEscolhida = vozesFR[0] || null;
  }

  carregarVozes();
  if (window.speechSynthesis && speechSynthesis.onvoiceschanged !== undefined) {
    // Em vários navegadores a lista de vozes só fica disponível de forma
    // assíncrona, depois do primeiro carregamento da página.
    speechSynthesis.onvoiceschanged = carregarVozes;
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
    u.rate = 0.85;
    if (vozEscolhida) u.voice = vozEscolhida;
    if (botao){
      botao.classList.add('tocando');
      u.onend = u.onerror = function(){ botao.classList.remove('tocando'); };
    }
    speechSynthesis.speak(u);
  }

  window.falarFrances = falarFrances;
})();
