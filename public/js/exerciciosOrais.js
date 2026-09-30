// PRODUÇÃO ORAL — galeria dos exercícios do curso (producao-oral-exercicios.html).
// A execução de cada exercício é do motor dos simulados (js/simuladoTcf.js, modo exercício):
// áudios da compreensão oral tocados uma vez, tarefa de fala (e às vezes de escrita), professor
// ao vivo pelo painel lateral e correção por IA ou por professor.
(function () {
  const { api, esc } = window.SimuladoAoVivo;
  const $ = id => document.getElementById(id);
  const NOMES_CURSO = { TCF: "TCF", DELF: "DELF", DALF: "DALF", TEF: "TEF", A1: "Francês A1", A2: "Francês A2", B1: "Francês B1", B2: "Francês B2" };
  const SIGLA = { co: "Compreensão oral", ee: "Produção escrita", eo: "Produção oral" };

  async function galeria() {
    const { curso } = await window.ProducaoGate.pronto;
    let dados;
    try { dados = await api("/api/simulados/exercicios?curso=" + encodeURIComponent(curso)); }
    catch (err) { $("vInicio").innerHTML = `<div class="sm-card"><div class="sm-erro">${esc(err.message)}</div></div>`; return mostrar(); }
    const escolhido = new URLSearchParams(location.search).get("s");
    const ex = dados.exercicios.find(e => e.slug === escolhido);
    $("vInicio").innerHTML = ex ? detalhe(ex, dados, curso) : lista(dados, curso);
    ligar(dados, curso);
    mostrar();
  }

  function mostrar() {
    $("carregando").hidden = true;
    ["vProva", "vResultado"].forEach(id => { $(id).hidden = true; });
    $("vInicio").hidden = false;
    $("barra").hidden = true;
    window.scrollTo(0, 0);
  }

  function formato(e) {
    return e.provas.map(p => p.id === "co" ? `${p.itens} questões de ${SIGLA.co.toLowerCase()}` : `${p.itens} tarefa${p.itens > 1 ? "s" : ""} de ${SIGLA[p.id].toLowerCase()}`).join(" · ");
  }
  const minutos = e => Math.round(e.provas.reduce((t, p) => t + p.tempoSeg, 0) / 60);

  function lista(dados, curso) {
    const feitos = dados.exercicios.filter(e => e.feito).length;
    return `<div class="pr-wrap" style="padding:0;">
      <a class="pr-voltar" href="producao.html?curso=${encodeURIComponent(curso)}">← Ambiente de Produção</a>
      <div class="pr-hero">
        <div class="eyebrow">Produção oral · ${esc(NOMES_CURSO[curso] || curso)}</div>
        <h1>Ouça, responda e fale</h1>
        <p>Cada exercício segue o formato dos simulados: documentos sonoros ouvidos uma única vez, questões de múltipla escolha e uma tarefa para falar sobre o tema — gravada no seu navegador. Escolha a correção por IA ou chame um professor, que pode acompanhar ao vivo e ser o seu examinador.</p>
        <div class="pr-stats"><div class="pr-stat"><strong>${dados.exercicios.length}</strong><span>exercícios</span></div><div class="pr-stat"><strong>${feitos}</strong><span>feitos</span></div></div>
      </div>
      ${dados.exercicios.length ? `<div class="pr-grade">${dados.exercicios.map((e, i) => `
        <button class="pr-tema${e.disponivel === false ? " em-preparo" : ""}" data-ex="${esc(e.slug)}">
          <div class="capa">${e.imagem ? `<img class="a" src="${esc(e.imagem.src)}" alt="" loading="lazy"><img class="b" src="${esc(e.imagem.src)}" alt="" loading="lazy">` : ""}
            <div class="chips"><span class="chip nivel">${esc(e.nivel)}</span><span class="chip">≈ ${minutos(e)} min</span></div>
            <span class="tipo-sobre">Exercício ${i + 1}</span></div>
          <div class="corpo"><h3>${esc(e.tema || e.titulo)}</h3><p class="desc">${esc(e.descricao || "")}</p>
            <div class="meta"><span>${esc(formato(e))}</span>${e.disponivel === false ? '<span class="pr-status novo">Em preparação</span>' : e.emAndamento ? '<span class="pr-status andamento">Em andamento</span>' : e.feito ? `<span class="pr-status feito">${e.resultadoCO ? `CO ${e.resultadoCO.acertos}/${e.resultadoCO.total}` : "Feito"}${e.corrigido ? " · corrigido" : ""}</span>` : '<span class="pr-status novo">Novo</span>'}</div></div>
        </button>`).join("")}</div>` : `<div class="pr-vazio">Os exercícios deste curso estão sendo preparados. Volte em breve!</div>`}
    </div>`;
  }

  function detalhe(e, dados, curso) {
    return `<div class="pr-wrap" style="padding:0;">
      <a class="pr-voltar" href="?curso=${encodeURIComponent(curso)}" data-voltar>← Todos os exercícios</a>
      <div class="pr-topo-tema">
        <div class="titulo-box"><div class="pr-filtros" style="margin-bottom:0;"><span class="pr-chip active">${esc(e.nivel)}</span><span class="pr-chip">≈ ${minutos(e)} min</span></div>
          <h1>${esc(e.tema || e.titulo)}</h1><p style="line-height:1.6; opacity:.88;">${esc(e.descricao || "")}</p></div>
        ${e.imagem ? `<div class="pr-duas-imgs" style="grid-template-columns:1fr;"><figure><img src="${esc(e.imagem.src)}" alt=""><figcaption>Foto: ${esc(e.imagem.credito?.autor || "")} · ${esc(e.imagem.credito?.licenca || "")} · Wikimedia Commons</figcaption></figure></div>` : ""}
      </div>
      <div class="sm-card">
        <h2>Como funciona</h2>
        <div class="sm-formato">${e.provas.map(p => `<div><strong>${esc(p.nome)}</strong><span>${p.id === "co" ? `${p.itens} questões · ${Math.round(p.tempoSeg / 60)} min` : `${p.itens} tarefa${p.itens > 1 ? "s" : ""} · ${Math.round(p.tempoSeg / 60)} min`}</span></div>`).join("")}</div>
        <p class="sm-muted" style="margin-top:10px;">Como na prova: cada áudio toca <strong>uma única vez</strong> e não é possível voltar. Para a fala, use fone de ouvido e um navegador com microfone liberado (Chrome ou Edge também transcrevem sua fala).</p>
        ${e.disponivel === false && !e.emAndamento ? `<div class="sm-aviso" style="margin-top:12px;">Os áudios deste exercício ainda estão sendo preparados. Volte em breve!</div>` : e.emAndamento ? `<button class="sm-btn" type="button" data-abrir="${esc(e.emAndamento)}" style="margin-top:12px;">Retomar exercício</button>` : `
        <h3 style="margin-top:14px;">Como você quer ser corrigido?</h3>
        <div class="sm-modos">
          <label class="sm-modo selecionado"><input type="radio" name="modoEx" value="ia" checked><strong>Inteligência Artificial</strong><p>A compreensão é corrigida na hora; sua fala (pela transcrição) é avaliada pela IA com a grade da prova em poucos minutos.</p></label>
          <label class="sm-modo"><input type="radio" name="modoEx" value="professor"><strong>Professor ao vivo</strong><p>Um professor acompanha o exercício em tempo real, pode conversar com você, ser seu examinador por chamada de voz e dar a nota.</p></label>
        </div>
        ${dados.iaDisponivel ? "" : `<div class="sm-aviso">A correção por IA ainda está sendo configurada. Se escolher IA, um professor poderá corrigir no lugar dela.</div>`}
        <div style="margin-top:14px;"><button class="sm-btn" type="button" data-comecar="${esc(e.slug)}">Começar o exercício</button></div>
        <div id="erroInicio"></div>`}
        ${e.ultimaTentativa ? `<p style="margin-top:12px;"><a class="sm-btn secundario pequeno" href="?curso=${encodeURIComponent(curso)}&t=${esc(e.ultimaTentativa)}">Ver meu último resultado</a></p>` : ""}
      </div>
    </div>`;
  }

  function irPara(params) {
    const url = new URL(location.href);
    ["s", "t"].forEach(k => url.searchParams.delete(k));
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    history.pushState(null, "", url);
  }

  function ligar(dados, curso) {
    document.querySelectorAll("[data-ex]").forEach(b => b.addEventListener("click", () => { irPara({ curso, s: b.dataset.ex }); galeria(); }));
    const voltar = document.querySelector("[data-voltar]");
    if (voltar) voltar.addEventListener("click", ev => { ev.preventDefault(); irPara({ curso }); galeria(); });
    document.querySelectorAll(".sm-modo input").forEach(r => r.addEventListener("change", () => {
      document.querySelectorAll(".sm-modo input").forEach(x => x.closest(".sm-modo").classList.toggle("selecionado", x.checked));
    }));
    document.querySelectorAll("[data-abrir]").forEach(b => b.addEventListener("click", () => { irPara({ curso, t: b.dataset.abrir }); window.SimuladoRunner.abrirTentativa(b.dataset.abrir); }));
    const comecar = document.querySelector("[data-comecar]");
    if (comecar) comecar.addEventListener("click", async () => {
      comecar.disabled = true;
      const modo = document.querySelector('input[name="modoEx"]:checked')?.value || "ia";
      try {
        const r = await api(`/api/simulados/${comecar.dataset.comecar}/iniciar`, { method: "POST", body: { modoCorrecao: modo } });
        irPara({ curso, t: r.tentativaId });
        window.SimuladoRunner.abrirTentativa(r.tentativaId);
      } catch (err) {
        if (err.dados?.tentativaId) { irPara({ curso, t: err.dados.tentativaId }); return window.SimuladoRunner.abrirTentativa(err.dados.tentativaId); }
        $("erroInicio").innerHTML = `<div class="sm-erro">${esc(err.message)}</div>`;
        comecar.disabled = false;
      }
    });
  }

  window.ExerciciosOrais = { galeria };
})();
