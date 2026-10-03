// Quadro embutido: abre uma página da equipe dentro de outra (iframe com ?embed=1) e faz o iframe
// crescer com o conteúdo (a página embutida manda a altura — ver o fim de js/painelEquipe.js).
// Uso: QuadroEmbutido.criar(elemento, "admin-simulados.html")
window.QuadroEmbutido = {
  criar(alvo, url, opcoes) {
    if (!alvo) return null;
    if (alvo.querySelector("iframe.quadro-embutido")) return alvo.querySelector("iframe.quadro-embutido");
    const frame = document.createElement("iframe");
    frame.className = "quadro-embutido";
    frame.src = url + (url.includes("?") ? "&" : "?") + "embed=1";
    frame.title = (opcoes && opcoes.titulo) || "Página da equipe";
    // chamada de voz com o aluno (Simulados ao Vivo) e áudio automático
    frame.allow = "microphone; autoplay";
    frame.style.cssText = "width:100%; border:0; display:block; min-height:640px; background:transparent;";
    alvo.appendChild(frame);
    window.addEventListener("message", ev => {
      if (ev.origin !== location.origin || ev.source !== frame.contentWindow || !ev.data || !ev.data.fnmQuadro) return;
      if (ev.data.altura) frame.style.height = Math.max(640, ev.data.altura + 4) + "px";
    });
    return frame;
  }
};
