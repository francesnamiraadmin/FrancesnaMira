// =====================================================================
// SIMULAÇÃO COMPLETA DE PROVA — TCF (simulado-tcf.html), lado do aluno.
// CO (39 q., 35 min, cada áudio uma única vez, sem voltar) → CE (39 q., 60 min)
// → EE (3 tarefas, 60 min) → EO (3 tarefas gravadas, ~12 min). O relógio de cada
// prova corre no servidor; respostas são salvas continuamente. A qualquer momento o
// aluno pode chamar um professor (chat, acompanhamento ao vivo e chamada de voz).
// =====================================================================
(function () {
  const { api, stream, Chamada, esc, contarPalavras, mmss, INSTRUCOES, enunciado, numero } = window.SimuladoAoVivo;
  const $ = id => document.getElementById(id);
  const NOMES = { co: "Compréhension orale", sl: "Structure de la langue", ce: "Compréhension écrite", ee: "Expression écrite", eo: "Expression orale" };
  const SIGLAS = { co: "CO", sl: "SL", ce: "CE", ee: "EE", eo: "EO" };
  // Ordem das épreuves do simulado aberto (TCF Canada: CO→CE→EE→EO; Tout Public: CO→SL→CE).
  const ordem = () => (S.def && S.def.ordem) || ["co", "ce", "ee", "eo"];
  const LETRAS = ["A", "B", "C", "D"];
  // Modo exercício (producao-oral-exercicios.html): mesmo motor, mas a galeria é da própria
  // página e as notas saem na escala da prova do curso do exercício.
  const MODO_EXERCICIO = window.SIMULADO_MODO === "exercicio";
  const urlVoltar = () => MODO_EXERCICIO ? `producao-oral-exercicios.html?curso=${encodeURIComponent(S.def?.curso || "")}` : "simulado-tcf.html";

  const S = {
    t: null, def: null, meuId: null,
    prazo: null, relogio: null, finalizando: false,
    idx: 0, salvarEE: null, eeSujas: {}, painelEE: null,
    stream: null, chamada: null, naoLidas: 0,
    eo: null // estado local da gravação
  };

  // ---------------- utilidades de tela ----------------
  function mostrar(view) {
    ["vInicio", "vProva", "vResultado", "carregando"].forEach(v => { $(v).hidden = v !== view; });
    $("barra").hidden = view !== "vProva";
    window.scrollTo({ top: 0 });
  }

  function modal(titulo, corpoHtml, acoes) {
    $("modalTitulo").textContent = titulo;
    $("modalCorpo").innerHTML = corpoHtml;
    const box = $("modalAcoes");
    box.innerHTML = "";
    acoes.forEach(a => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "sm-btn " + (a.classe || "");
      b.textContent = a.texto;
      b.addEventListener("click", async () => { if (a.fn && (await a.fn()) === false) return; $("modal").hidden = true; });
      box.appendChild(b);
    });
    $("modal").hidden = false;
  }
  const fecharModal = () => { $("modal").hidden = true; };

  function erroTela(msg) {
    mostrar("vInicio");
    $("vInicio").innerHTML = `<div class="sm-card"><div class="sm-erro">${esc(msg)}</div><a class="sm-btn secundario" href="plataforma-questoes.html">Voltar à Plataforma de Questões</a></div>`;
  }

  // =====================================================================
  // INÍCIO: formato, modo de correção, histórico
  // =====================================================================
  async function carregarInicio() {
    let dados;
    try { dados = await api("/api/simulados"); }
    catch (err) { return erroTela(err.message); }
    if (!dados.simulados.length) return erroTela("Nenhum simulado disponível no momento.");
    const tempo = s => `${Math.round(s / 60)} min`;
    const emAndamento = slug => dados.tentativas.find(t => t.status === "em_andamento" && t.simuladoSlug === slug);

    const cartao = def => {
      const aberto = emAndamento(def.slug);
      const canada = def.formato === "TCF Canada";
      const descricao = canada
        ? "O TCF Canada completo, na ordem e no tempo da prova oficial: as quatro épreuves, com notas no formato do TCF (0–699 e 0–20), nível CECR e equivalência NCLC."
        : "No formato do livret d'entraînement do TCF Tout Public: compreensão oral com imagens e propostas faladas, estrutura da língua e compreensão escrita com documentos reais, folha de respostas e corrigé. Correção automática, com score de 0 a 699 e nível CECR.";
      const modos = def.temExpressoes ? `
        <h3>Como você quer ser corrigido?</h3>
        <p class="sm-muted">As compreensões são corrigidas na hora. A escolha vale para a expressão escrita e a expressão oral.</p>
        <div class="sm-modos">
          <label class="sm-modo selecionado"><input type="radio" name="modo-${def.slug}" value="ia" checked>
            <strong>Inteligência Artificial</strong>
            <p>Suas redações e as transcrições da sua fala são avaliadas pela IA com a grade do TCF assim que você termina. Resultado em poucos minutos, com comentários por tarefa.</p>
          </label>
          <label class="sm-modo"><input type="radio" name="modo-${def.slug}" value="professor">
            <strong>Professor ao vivo</strong>
            <p>Um professor acompanha seu simulado em tempo real, pode conversar com você, é seu examinador na expressão oral (chamada de voz) e lança as notas no formato TCF.</p>
          </label>
        </div>
        ${dados.iaDisponivel ? "" : `<div class="sm-aviso">A correção por IA ainda está sendo configurada. Se escolher IA, um professor poderá corrigir no lugar dela.</div>`}` : "";
      return `<div class="sm-card" data-simulado="${esc(def.slug)}">
        <h2>Formato da prova</h2>
        <p class="sm-muted">${descricao}</p>
        <div class="sm-formato">
          ${def.provas.map(p => `<div><strong>${esc(p.nome)}</strong><span>${p.id === "eo" ? "3 tarefas · ~12 min + preparação" : p.id === "ee" ? `3 tarefas · ${tempo(p.tempoSeg)}` : `${p.itens} questões · ${tempo(p.tempoSeg)}`}</span></div>`).join("")}
        </div>
        <p class="sm-muted" style="margin-top:10px;">Como na prova real: as questões vão do A1 ao C2, cada áudio da compreensão oral toca <strong>uma única vez</strong> e não é possível voltar à questão anterior; o relógio continua correndo mesmo se você fechar a página.${def.temExpressoes ? " Para a expressão oral, use fone de ouvido e um navegador com microfone liberado (Chrome ou Edge transcrevem sua fala automaticamente)." : ""}</p>
        ${aberto ? `
          <div class="sm-aviso" style="margin-top:14px;">Você tem este simulado em andamento: parou em <strong>${esc(NOMES[aberto.provaAtual] || "")}</strong>.</div>
          <button class="sm-btn" type="button" data-abrir="${aberto._id}">Retomar simulado</button>` : `
          ${modos}
          <p class="sm-muted" style="margin-top:10px;">Em qualquer momento da prova você pode tocar em <strong>Chamar professor</strong> para pedir ajuda${def.temExpressoes ? " ou que ele assuma a correção" : ""}.</p>
          <div style="margin-top:14px;"><button class="sm-btn" type="button" data-comecar="${esc(def.slug)}">Começar este simulado</button></div>
          <div data-erro="${esc(def.slug)}"></div>`}
      </div>`;
    };

    // Hub: primeiro o aluno escolhe o simulado (?s=<slug> abre a página dele).
    const escolhido = new URLSearchParams(location.search).get("s");
    const def = dados.simulados.find(d => d.slug === escolhido);
    const ultimo = slug => dados.tentativas.find(t => t.simuladoSlug === slug && t.status !== "em_andamento");
    const minutos = d => Math.round(d.provas.reduce((s, p) => s + p.tempoSeg, 0) / 60);
    const siglas = d => d.provas.map(p => `${SIGLAS[p.id]} ${p.id === "ee" || p.id === "eo" ? `${p.itens} tarefas` : p.itens}`).join(" · ");

    const cardHub = (d, i) => {
      const aberto = emAndamento(d.slug);
      const fim = ultimo(d.slug);
      const selo = aberto ? `<span class="sm-chip alerta">Em andamento — ${esc(NOMES[aberto.provaAtual] || "")}</span>`
        : fim ? `<span class="sm-chip ok">Já realizado · ${fim.resultados && Object.values(fim.resultados).filter(Boolean).map(r => esc(r.nivel)).join(" / ") || "em correção"}</span>`
        : `<span class="sm-chip">Novo</span>`;
      return `<a class="sm-hub-card" href="?curso=TCF&s=${esc(d.slug)}" data-escolher="${esc(d.slug)}">
        <span class="sm-hub-num">${i + 1}</span>
        <h2>${esc(d.titulo)}</h2>
        <p class="sm-muted">${esc(d.formato)} · ${siglas(d)}</p>
        <p class="sm-muted">≈ ${minutos(d)} min de prova</p>
        ${selo}
        <span class="sm-btn pequeno">${aberto ? "Retomar" : fim ? "Fazer de novo" : "Escolher"}</span>
      </a>`;
    };

    if (!def) {
      $("vInicio").innerHTML = `
        <div class="sm-hero">
          <h1>Simulação Completa de Prova</h1>
          <p>Escolha o simulado que você quer fazer. Cada um é uma prova completa do TCF, no tempo e no formato oficiais, com temas diferentes e resultado no formato TCF (0–699, 0–20, nível CECR e NCLC).</p>
        </div>
        <div class="sm-hub">${dados.simulados.map(cardHub).join("")}</div>
        <div class="sm-card">
          <h2>Meus simulados</h2>
          ${dados.tentativas.length ? `<div class="sm-hist">${dados.tentativas.map(t => itemHistorico(t, dados.simulados)).join("")}</div>` : `<p class="sm-muted">Você ainda não fez nenhum simulado completo.</p>`}
        </div>`;
      document.querySelectorAll("[data-escolher]").forEach(a => a.addEventListener("click", ev => {
        ev.preventDefault();
        const url = new URL(location.href);
        url.searchParams.set("s", a.dataset.escolher);
        history.pushState(null, "", url);
        carregarInicio();
      }));
    } else {
      const historico = dados.tentativas.filter(t => t.simuladoSlug === def.slug);
      $("vInicio").innerHTML = `
        <p style="margin:6px 0 4px;"><a class="sm-btn secundario pequeno" href="?curso=TCF" id="btnHub">← Todos os simulados</a></p>
        <div class="sm-hero" style="padding-top:14px;">
          <h1>${esc(def.titulo)}</h1>
        </div>
        ${cartao(def)}
        ${historico.length ? `<div class="sm-card"><h2>Suas tentativas neste simulado</h2><div class="sm-hist">${historico.map(t => itemHistorico(t, dados.simulados)).join("")}</div></div>` : ""}`;
      $("btnHub").addEventListener("click", ev => {
        ev.preventDefault();
        const url = new URL(location.href);
        url.searchParams.delete("s");
        history.pushState(null, "", url);
        carregarInicio();
      });
    }

    document.querySelectorAll(".sm-modo input").forEach(r => r.addEventListener("change", () => {
      document.querySelectorAll(`input[name="${r.name}"]`).forEach(x => x.closest(".sm-modo").classList.toggle("selecionado", x.checked));
    }));
    document.querySelectorAll("[data-comecar]").forEach(btn => btn.addEventListener("click", async () => {
      const slug = btn.dataset.comecar;
      btn.disabled = true;
      const marcado = document.querySelector(`input[name="modo-${slug}"]:checked`);
      try {
        const r = await api(`/api/simulados/${slug}/iniciar`, { method: "POST", body: { modoCorrecao: marcado ? marcado.value : "ia" } });
        abrirTentativa(r.tentativaId);
      } catch (err) {
        if (err.dados?.tentativaId) return abrirTentativa(err.dados.tentativaId);
        document.querySelector(`[data-erro="${slug}"]`).innerHTML = `<div class="sm-erro">${esc(err.message)}</div>`;
        btn.disabled = false;
      }
    }));
    document.querySelectorAll("[data-abrir]").forEach(b => b.addEventListener("click", () => abrirTentativa(b.dataset.abrir)));
    mostrar("vInicio");
  }

  const ehCompreensao = p => p === "co" || p === "sl" || p === "ce";

  function chipResultado(p, r) {
    if (!r) return `<span class="sm-chip">${SIGLAS[p]} · em correção</span>`;
    const v = ehCompreensao(p) ? `${r.pontos}` : `${r.nota}/20`;
    return `<span class="sm-chip ok">${SIGLAS[p]} ${v} · ${esc(r.nivel)}${r.nclc ? ` · NCLC ${esc(r.nclc)}` : ""}</span>`;
  }

  function itemHistorico(t, simulados) {
    const data = new Date(t.criadoEm).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
    const status = { em_andamento: "Em andamento", aguardando_correcao: "Aguardando correção", corrigindo_ia: "IA corrigindo", corrigido: "Corrigido" }[t.status];
    const def = simulados.find(s => s.slug === t.simuladoSlug);
    const correcao = { ia: "correção por IA", professor: "correção por professor", automatica: "correção automática" }[t.modoCorrecao];
    return `<div class="sm-hist-item">
      <div class="info"><strong>${esc(def ? def.titulo : "Simulado")}</strong><br><small>${data} · ${status} · ${correcao}</small></div>
      <div class="sm-chips">${t.resultados ? Object.keys(t.resultados).map(p => chipResultado(p, t.resultados[p])).join("") : ""}</div>
      <button class="sm-btn secundario pequeno" type="button" data-abrir="${t._id}">${t.status === "em_andamento" ? "Retomar" : "Ver resultado"}</button>
    </div>`;
  }

  // =====================================================================
  // TENTATIVA
  // =====================================================================
  async function abrirTentativa(id) {
    mostrar("carregando");
    try {
      aplicarEstado(await api(`/api/simulados/tentativas/${id}`));
    } catch (err) { return erroTela(err.message); }
    const url = new URL(location.href);
    url.searchParams.set("t", id);
    history.replaceState(null, "", url);
    ligarTempoReal();
    renderizar();
  }

  function aplicarEstado(t) {
    S.t = t;
    S.def = t.definicao;
    const p = t.provaAtual;
    S.prazo = p && t.provas[p].status === "em_andamento" && t.provas[p].restanteSeg != null ? Date.now() + t.provas[p].restanteSeg * 1000 : null;
    atualizarConexao();
  }

  async function recarregar() {
    aplicarEstado(await api(`/api/simulados/tentativas/${S.t._id}`));
    renderizar();
  }

  function renderizar() {
    if (S.t.status === "em_andamento") renderProva();
    else renderResultado();
  }

  // ---------------- relógio ----------------
  function iniciarRelogio() {
    clearInterval(S.relogio);
    const tick = () => {
      const el = $("relogio");
      if (!S.prazo) { el.textContent = "--:--"; el.classList.remove("pouco"); return; }
      const rest = (S.prazo - Date.now()) / 1000;
      el.textContent = mmss(rest);
      el.classList.toggle("pouco", rest <= 300);
      if (rest <= 0 && !S.finalizando) finalizarProva(true);
    };
    tick();
    S.relogio = setInterval(tick, 1000);
  }

  async function salvar(parcial) {
    try {
      const r = await api(`/api/simulados/tentativas/${S.t._id}/progresso`, { method: "PATCH", body: { prova: S.t.provaAtual, ...parcial } });
      if (r.restanteSeg != null) S.prazo = Date.now() + r.restanteSeg * 1000;
    } catch (err) {
      if (err.status === 409) { await recarregar(); }
    }
  }

  async function finalizarProva(porTempo) {
    if (S.finalizando) return;
    S.finalizando = true;
    const p = S.t.provaAtual;
    try {
      if (p === "ee") await salvarTextoEE(true);
      if (p === "eo" && S.eo?.gravando) await pararGravacao(true);
      aplicarEstado(await api(`/api/simulados/tentativas/${S.t._id}/provas/${p}/finalizar`, { method: "POST" }));
      if (porTempo) modal("Tempo esgotado", `<p>O tempo da ${esc(NOMES[p])} terminou. Suas respostas foram registradas.</p>`, [{ texto: "Continuar" }]);
    } catch (err) {
      modal("Erro", `<p>${esc(err.message)}</p>`, [{ texto: "Fechar" }]);
    } finally {
      S.finalizando = false;
      renderizar();
    }
  }

  function confirmarFim(extra) {
    const p = S.t.provaAtual;
    modal(`Terminar a ${NOMES[p]}?`, `<p>${extra || ""}</p><p style="margin-top:8px;">Depois de terminar, não é possível voltar a esta épreuve.</p>`, [
      { texto: "Continuar respondendo", classe: "secundario" },
      { texto: "Terminar épreuve", fn: () => { finalizarProva(false); } }
    ]);
  }

  // =====================================================================
  // PROVA
  // =====================================================================
  function renderBarra() {
    const p = S.t.provaAtual;
    $("barraProva").textContent = NOMES[p];
    $("barraEtapas").innerHTML = ordem().map(x => `<span class="${x === p ? "atual" : S.t.provas[x].status === "finalizada" ? "feita" : ""}">${SIGLAS[x]}</span>`).join("");
  }

  function renderProva() {
    const p = S.t.provaAtual;
    const e = S.t.provas[p];
    mostrar("vProva");
    renderBarra();
    if (e.status === "pendente") return renderIntroProva(p);
    iniciarRelogio();
    if (p === "co") { S.idx = Math.min(e.questaoAtual || 0, S.def.provas.co.questoes.length - 1); renderCO(); }
    else if (p === "ce" || p === "sl") { S.idx = Math.min(e.questaoAtual || 0, S.def.provas[p].questoes.length - 1); renderLista(p); }
    else if (p === "ee") renderEE();
    else renderEO();
  }

  function renderIntroProva(p) {
    clearInterval(S.relogio);
    $("relogio").textContent = mmss(S.def.provas[p].tempoSeg);
    $("barraSub").textContent = "Aguardando início";
    const nq = S.def.provas[p].questoes ? S.def.provas[p].questoes.length : 0;
    const min = sg => { const m = Math.floor(sg / 60), r = sg % 60; return r ? `${m} min ${String(r).padStart(2, "0")}` : `${m} min`; };
    const tarefas = S.def.provas[p].tarefas || [];
    const regrasExercicio = {
      ee: `${tarefas.length === 1 ? "1 tarefa" : `${tarefas.length} tarefas`}: ${tarefas.map(t => `${esc(t.titulo)} (${t.min}–${t.max} palavras)`).join("; ")}. Seu texto é salvo automaticamente.`,
      eo: `${tarefas.length === 1 ? "1 tarefa gravada" : `${tarefas.length} tarefas gravadas`}: ${tarefas.map(t => `${esc(t.titulo)} (${t.preparacaoSeg ? `${min(t.preparacaoSeg)} de preparação + ` : ""}${min(t.duracaoSeg)})`).join("; ")}. Use fone de ouvido. Se um professor estiver conectado, ele será seu examinador pela chamada de voz.`
    };
    const regras = MODO_EXERCICIO && regrasExercicio[p] ? regrasExercicio[p] : {
      co: `${nq} questões de múltipla escolha${MODO_EXERCICIO ? "" : ", do A1 ao C2"}. Cada documento sonoro é ouvido <strong>uma única vez</strong>. ${S.def.provas.co.questoes.some(q => q.alternativasFaladas) ? (MODO_EXERCICIO ? "Em algumas questões" : "Nas primeiras questões") + ", as quatro propostas são apenas faladas: ouça e marque a letra. " : "Leia a pergunta, ouça o áudio e escolha a alternativa. "}Você pode navegar livremente entre as questões pelo painel, mas cada áudio só pode ser ouvido uma vez.`,
      sl: `${nq} frases com uma lacuna: escolha a palavra ou expressão que completa corretamente a frase. Você pode navegar livremente entre as questões.`,
      ce: `${nq} questões de múltipla escolha, do A1 ao C2, sobre documentos escritos (avisos, anúncios, artigos, textos argumentativos)${S.def.provas.ce?.questoes.some(q => q.tipo === "lacuna") ? ", com frases para completar ao longo da prova" : ""}. Você pode navegar livremente entre as questões.`,
      ee: "3 tarefas: uma mensagem (60–120 palavras), um artigo ou relato (120–150 palavras) e um texto argumentativo a partir de dois documentos (120–180 palavras). Seu texto é salvo automaticamente.",
      eo: "3 tarefas gravadas: entrevista dirigida (2 min), exercício em interação com 2 min de preparação (5 min 30) e expressão de um ponto de vista (4 min 30). Use fone de ouvido. Se um professor estiver conectado, ele será seu examinador pela chamada de voz."
    }[p];
    $("vProva").innerHTML = `<div class="sm-card" style="text-align:center;">
      <p class="sm-oral-fase">Épreuve ${ordem().indexOf(p) + 1} de ${ordem().length}</p>
      <h2 style="font-size:1.8rem;margin:6px 0 10px;">${NOMES[p]}</h2>
      <p class="sm-muted" style="max-width:620px;margin:0 auto;">${regras}</p>
      <p style="margin:14px 0;font-weight:700;">Duração: ${Math.round(S.def.provas[p].tempoSeg / 60)} minutos</p>
      ${p === "co" && S.def.audioConsignes?.co ? `<div class="sm-player" style="justify-content:center;margin:0 auto 14px;max-width:520px;"><button class="sm-btn secundario pequeno" type="button" id="btnConsignes">🔊 Ouvir as consignes gerais</button><small>Antes de começar; o relógio ainda não corre.</small></div>` : ""}
      ${p === "eo" ? `<div id="testeMic" class="sm-muted" style="margin-bottom:12px;"></div><button class="sm-btn secundario" id="btnTestarMic" type="button" style="margin-bottom:12px;">Testar microfone</button><br>` : ""}
      <button class="sm-btn" id="btnAbrirProva" type="button">Começar a épreuve</button>
    </div>`;
    $("btnAbrirProva").addEventListener("click", async ev => {
      ev.target.disabled = true;
      try {
        if (p === "eo") await pedirMicrofone();
        aplicarEstado(await api(`/api/simulados/tentativas/${S.t._id}/provas/${p}/abrir`, { method: "POST" }));
        renderizar();
      } catch (err) {
        ev.target.disabled = false;
        modal("Não foi possível começar", `<p>${esc(err.message)}</p>`, [{ texto: "Fechar" }]);
      }
    });
    const bt = $("btnTestarMic");
    if (bt) bt.addEventListener("click", testarMicrofone);
    const bc = $("btnConsignes");
    if (bc) bc.addEventListener("click", () => {
      pararAudioCO();
      audioCO = new Audio(S.def.audioConsignes.co);
      bc.textContent = "Tocando…";
      audioCO.addEventListener("ended", () => { bc.textContent = "🔊 Ouvir de novo"; });
      audioCO.play().catch(() => { bc.textContent = "Erro ao tocar o áudio"; });
    });
  }

  // ---------------- CO ----------------
  function renderCO() {
    const qs = S.def.provas.co.questoes;
    const q = qs[S.idx];
    const e = S.t.provas.co;
    const resp = e.respostas || {};
    const ouvido = (e.ouvidos || []).includes(q.n);
    $("barraSub").textContent = `Questão ${S.idx + 1} de ${qs.length}`;
    $("vProva").innerHTML = `<div class="sm-card">
      ${q.tipo ? `<p class="sm-instrucao">› ${esc(INSTRUCOES[q.tipo])}</p>` : ""}
      <div class="sm-questao-topo"><strong>Question ${numero(q)}</strong><span class="sm-nivel">${esc(q.nivel)} · ${q.pontos} pts</span></div>
      ${enunciado(q, "co")}
      <div class="sm-player" id="player">
        <button class="sm-btn pequeno" id="btnOuvir" type="button" ${ouvido ? "disabled" : ""}>${ouvido ? "Áudio já ouvido" : "▶ Ouvir o documento"}</button>
        <div class="barra"><span id="playerBarra" style="${ouvido ? "width:100%" : ""}"></span></div>
        <small>${ouvido ? "Cada documento é ouvido uma única vez." : "Atenção: uma única escuta."}</small>
      </div>
      ${q.alternativasFaladas ? "" : `<p class="sm-pergunta">${esc(q.pergunta)}</p>`}
      <div class="sm-alts ${q.alternativasFaladas ? "faladas" : ""}">${q.alternativas.map((a, i) => `<button type="button" class="sm-alt ${resp[q.n] === i ? "marcada" : ""}" data-alt="${i}"><span class="letra">${LETRAS[i]}</span>${a && !q.alternativasFaladas ? `<span>${esc(a)}</span>` : ""}</button>`).join("")}</div>
      <div class="sm-nav">
        <button class="sm-btn secundario" id="btnAnt" type="button" ${S.idx === 0 ? "disabled" : ""}>← Anterior</button>
        <span class="sm-muted" id="contagemCO">${Object.keys(resp).length} de ${qs.length} respondidas</span>
        ${S.idx < qs.length - 1 ? `<button class="sm-btn" id="btnProx" type="button">Próxima →</button>` : ""}
      </div>
      <div class="sm-grade" id="gradeLista"></div>
      <p class="sm-muted sm-grade-legenda">Verde = respondida · <span class="ouvida-ico">🔊</span> = áudio já ouvido</p>
      <div style="text-align:right;margin-top:14px;"><button class="sm-btn secundario" id="btnFim" type="button">Terminar a compreensão oral</button></div>
    </div>`;
    ligarAlternativas("co", q);
    atualizarGrade("co");
    $("btnOuvir").addEventListener("click", () => tocarUmaVez(q));
    const ir = i => {
      if (i < 0 || i >= qs.length || i === S.idx) return;
      pararAudioCO();
      S.idx = i;
      S.t.provas.co.questaoAtual = i;
      salvar({ questaoAtual: i });
      renderCO();
    };
    $("btnAnt").addEventListener("click", () => ir(S.idx - 1));
    const prox = $("btnProx");
    if (prox) prox.addEventListener("click", () => ir(S.idx + 1));
    $("gradeLista").addEventListener("click", ev => { const b = ev.target.closest("[data-ir]"); if (b) ir(Number(b.dataset.ir)); });
    $("btnFim").addEventListener("click", () => {
      pararAudioCO();
      const faltam = qs.length - Object.keys(S.t.provas.co.respostas || {}).length;
      confirmarFim(faltam ? `Ainda há ${faltam} questão(ões) sem resposta.` : "Todas as questões foram respondidas.");
    });
  }

  let audioCO = null;
  function pararAudioCO() { if (audioCO) { audioCO.pause(); audioCO = null; } }
  function tocarUmaVez(q) {
    const btn = $("btnOuvir");
    btn.disabled = true;
    btn.textContent = "Tocando…";
    const e = S.t.provas.co;
    e.ouvidos = [...(e.ouvidos || []), q.n];
    salvar({ ouvido: q.n, questaoAtual: S.idx });
    atualizarGrade("co");
    audioCO = new Audio(q.audio);
    audioCO.addEventListener("timeupdate", () => {
      const b = $("playerBarra");
      if (b && audioCO && audioCO.duration) b.style.width = `${(audioCO.currentTime / audioCO.duration) * 100}%`;
    });
    audioCO.addEventListener("ended", () => { const b = $("btnOuvir"); if (b) b.textContent = "Áudio já ouvido"; });
    audioCO.play().catch(() => { btn.textContent = "Erro ao tocar o áudio"; });
  }

  function ligarAlternativas(prova, q) {
    document.querySelectorAll("[data-alt]").forEach(b => b.addEventListener("click", () => {
      const i = Number(b.dataset.alt);
      const e = S.t.provas[prova];
      e.respostas = { ...(e.respostas || {}), [q.n]: i };
      document.querySelectorAll("[data-alt]").forEach(x => x.classList.toggle("marcada", x === b));
      salvar({ respostas: { [q.n]: i }, questaoAtual: S.idx });
      atualizarGrade(prova);
    }));
  }

  // ---------------- SL / CE (navegação livre) ----------------
  function renderLista(prova) {
    const qs = S.def.provas[prova].questoes;
    const q = qs[S.idx];
    const lacuna = prova === "sl" || q.tipo === "lacuna";
    const resp = S.t.provas[prova].respostas || {};
    $("barraSub").textContent = `Questão ${S.idx + 1} de ${qs.length}`;
    $("vProva").innerHTML = `<div class="sm-card">
      <p class="sm-instrucao">› ${esc(lacuna ? INSTRUCOES.sl : INSTRUCOES[prova])}</p>
      <div class="sm-questao-topo"><strong>Question ${numero(q)}</strong><span class="sm-nivel">${esc(q.nivel)} · ${q.pontos} pts</span></div>
      ${lacuna ? `<p class="sm-lacuna-ini">${esc(q.inicio)}</p>` : `${enunciado(q, prova)}<p class="sm-pergunta">${esc(q.pergunta)}</p>`}
      <div class="sm-alts">${q.alternativas.map((a, i) => `<button type="button" class="sm-alt ${resp[q.n] === i ? "marcada" : ""}" data-alt="${i}"><span class="letra">${LETRAS[i]}</span><span>${esc(a)}</span></button>`).join("")}</div>
      ${lacuna ? `<p class="sm-lacuna-fim">${esc(q.fim)}</p>` : ""}
      <div class="sm-nav">
        <button class="sm-btn secundario" id="btnAnt" type="button" ${S.idx === 0 ? "disabled" : ""}>← Anterior</button>
        ${S.idx < qs.length - 1 ? `<button class="sm-btn" id="btnProx" type="button">Próxima →</button>` : ""}
      </div>
      <div class="sm-grade" id="gradeLista"></div>
      <div style="text-align:right;margin-top:14px;"><button class="sm-btn secundario" id="btnFim" type="button">Terminar: ${esc(NOMES[prova])}</button></div>
    </div>`;
    ligarAlternativas(prova, q);
    atualizarGrade(prova);
    const ir = i => { S.idx = i; salvar({ questaoAtual: i }); renderLista(prova); };
    $("btnAnt").addEventListener("click", () => ir(S.idx - 1));
    const prox = $("btnProx");
    if (prox) prox.addEventListener("click", () => ir(S.idx + 1));
    $("btnFim").addEventListener("click", () => {
      const faltam = qs.length - Object.keys(S.t.provas[prova].respostas || {}).length;
      confirmarFim(faltam ? `Ainda há ${faltam} questão(ões) sem resposta.` : "Todas as questões foram respondidas.");
    });
    $("gradeLista").addEventListener("click", ev => { const b = ev.target.closest("[data-ir]"); if (b) ir(Number(b.dataset.ir)); });
  }

  function atualizarGrade(prova) {
    const g = $("gradeLista");
    if (!g) return;
    const resp = S.t.provas[prova].respostas || {};
    const ouvidos = prova === "co" ? (S.t.provas.co.ouvidos || []) : [];
    g.innerHTML = S.def.provas[prova].questoes.map((q, i) => `<button type="button" data-ir="${i}" class="${resp[q.n] != null ? "respondida" : ""} ${i === S.idx ? "atual" : ""} ${ouvidos.includes(q.n) ? "ouvida" : ""}" title="${ouvidos.includes(q.n) ? "Áudio já ouvido" : "Áudio ainda não ouvido"}">${numero(q)}</button>`).join("");
    const c = $("contagemCO");
    if (prova === "co" && c) c.textContent = `${Object.keys(resp).length} de ${S.def.provas.co.questoes.length} respondidas`;
  }

  // ---------------- EE ----------------
  // As três tâches ficam na tela ao mesmo tempo (como no app "Modèles TCF"): um painel fixo
  // no topo mostra o tempo restante, a etapa aconselhada e o andamento de cada tâche.
  // Tempo aconselhado no TCF (60 min): T1 10 · T2 15 · T3 25 · relecture 10. Em outros
  // formatos, reparte o tempo pelo tamanho máximo de cada tâche e reserva ~15% para reler.
  function etapasEE() {
    const p = S.def.provas.ee, tarefas = p.tarefas, total = Math.round(p.tempoSeg / 60);
    if (total === 60 && tarefas.length === 3) return [...tarefas.map((t, i) => ({ id: t.id, t: t.titulo, min: [10, 15, 25][i] })), { t: "Relecture", min: 10 }];
    const reler = tarefas.length > 1 ? Math.max(2, Math.round(total * 0.15)) : 0;
    const soma = tarefas.reduce((a, t) => a + (t.max || 1), 0);
    const et = tarefas.map(t => ({ id: t.id, t: t.titulo, min: Math.max(1, Math.round((total - reler) * (t.max || 1) / soma)) }));
    return reler ? [...et, { t: "Relecture", min: reler }] : et;
  }

  function renderEE() {
    const tarefas = S.def.provas.ee.tarefas;
    const resp = S.t.provas.ee.respostas || {};
    const etapas = etapasEE();
    const minDe = id => (etapas.find(e => e.id === id) || {}).min;
    $("barraSub").textContent = `${tarefas.length} tâche${tarefas.length > 1 ? "s" : ""} simultâneas`;
    $("vProva").innerHTML = `
      <div class="ee-painel" id="eePainel">
        <div class="ee-relogio"><span class="tempo" id="eeTempo">--:--</span><span id="eeFase">Épreuve en cours</span></div>
        <div class="ee-etapas">${etapas.map(e => `<span style="flex:${e.min}"><i></i>${esc(e.t)} · ${e.min} min</span>`).join("")}<b id="eeCursor"></b></div>
        <div class="ee-resumo">${tarefas.map(t => `<button type="button" class="ee-chip" data-ir-tarefa="${t.id}"><b>${esc(t.titulo.replace(/^Tâche\s*/i, "T"))}</b><span id="eeChip-${t.id}">0 mots</span></button>`).join("")}</div>
        <span class="ee-salvo" id="salvoEE">Rascunho salvo</span>
        <button class="sm-btn" id="btnFim" type="button">Terminar e enviar</button>
      </div>
      ${tarefas.map((t, i) => `
      <section class="sm-card ee-tache" data-tarefa="${t.id}">
        <div class="ee-cab"><span class="ee-selo">${i + 1}</span><div>
          <h2>${esc(t.titulo)}</h2>
          <small>${t.min} mots minimum · ${t.max} mots maximum${minDe(t.id) ? ` · temps conseillé : ${minDe(t.id)} min` : ""}</small>
        </div></div>
        <div class="sm-consigne">${esc(t.consigne)}</div>
        ${t.documentos ? `<div class="sm-docs">${t.documentos.map(d => `<div><strong>${esc(d.titulo)}</strong>${esc(d.texto)}</div>`).join("")}</div>` : ""}
        <textarea class="sm-textarea" data-texto="${t.id}" spellcheck="false" autocorrect="off" autocapitalize="sentences" placeholder="Rédigez votre texte ici…">${esc(resp[t.id] || "")}</textarea>
        <div class="ee-medidor"><i data-medidor="${t.id}"></i><b class="min" style="left:${Math.round(100 * t.min / (t.max * 1.25))}%"></b><b class="max" style="left:80%"></b></div>
        <div class="sm-contador"><span data-contador="${t.id}"></span></div>
      </section>`).join("")}`;

    const contar = t => {
      const ta = document.querySelector(`[data-texto="${t.id}"]`);
      const n = contarPalavras(ta.value);
      const estado = n === 0 ? "" : n < t.min ? "baixo" : n > t.max ? "alto" : "ok";
      document.querySelector(`[data-contador="${t.id}"]`).innerHTML = `<span class="${estado === "ok" ? "dentro" : estado ? "fora" : ""}">${n} mots</span> · attendu : ${t.min} à ${t.max}`;
      document.querySelector(`[data-medidor="${t.id}"]`).style.width = `${Math.min(100, 100 * n / (t.max * 1.25))}%`;
      const chip = $(`eeChip-${t.id}`);
      chip.textContent = `${n} mots`;
      chip.parentElement.dataset.estado = estado;
    };
    tarefas.forEach(t => {
      contar(t);
      const ta = document.querySelector(`[data-texto="${t.id}"]`);
      ta.addEventListener("input", () => {
        contar(t);
        S.t.provas.ee.respostas = { ...(S.t.provas.ee.respostas || {}), [t.id]: ta.value };
        S.eeSujas = { ...(S.eeSujas || {}), [t.id]: true };
        $("salvoEE").textContent = "Salvando…";
        clearTimeout(S.salvarEE);
        S.salvarEE = setTimeout(() => salvarTextoEE(), 1500);
      });
      // Colar texto de fora não vale na prova (mesma regra do app de modelos).
      ta.addEventListener("paste", ev => ev.preventDefault());
      ta.addEventListener("drop", ev => ev.preventDefault());
    });
    document.querySelectorAll("[data-ir-tarefa]").forEach(b => b.addEventListener("click", () => {
      const sec = document.querySelector(`[data-tarefa="${b.dataset.irTarefa}"]`);
      sec.scrollIntoView({ behavior: "smooth", block: "start" });
      sec.classList.add("destaque");
      setTimeout(() => sec.classList.remove("destaque"), 2500);
      sec.querySelector("textarea").focus({ preventScroll: true });
    }));
    $("btnFim").addEventListener("click", () => {
      const r = S.t.provas.ee.respostas || {};
      const aviso = tarefas.map(x => { const n = contarPalavras(r[x.id]); return n < x.min ? `${x.titulo}: ${n} mots (mínimo ${x.min})` : null; }).filter(Boolean);
      confirmarFim(aviso.length ? `Atenção — ${aviso.join("; ")}.` : "Os textos estão dentro do tamanho pedido.");
    });
    iniciarPainelEE(etapas);
  }

  // Relógio do painel da EE: acompanha o prazo da épreuve (S.prazo) e move o cursor pelas etapas.
  function iniciarPainelEE(etapas) {
    clearInterval(S.painelEE);
    // O painel fica logo abaixo da navbar fixa do site (a altura muda entre desktop e celular).
    const posicionar = () => {
      const p = $("eePainel"), nav = document.getElementById("app-navbar");
      if (!p) { window.removeEventListener("resize", posicionar); return; }
      const topo = nav ? Math.round(nav.getBoundingClientRect().height) : 0;
      p.style.top = (topo + 8) + "px";
      document.querySelectorAll(".ee-tache").forEach(sec => { sec.style.scrollMarginTop = (topo + p.offsetHeight + 20) + "px"; });
    };
    posicionar();
    window.addEventListener("resize", posicionar);
    const totalSeg = S.def.provas.ee.tempoSeg;
    const tick = () => {
      const tempo = $("eeTempo");
      if (!tempo) { clearInterval(S.painelEE); return; }
      if (!S.prazo) return;
      const resta = Math.max(0, Math.round((S.prazo - Date.now()) / 1000));
      const decorrido = totalSeg - resta;
      tempo.textContent = mmss(resta);
      tempo.classList.toggle("fim", resta <= 300);
      let acc = 0, etapa = etapas[etapas.length - 1].t;
      for (const e of etapas) { acc += e.min * 60; if (decorrido < acc) { etapa = e.t; break; } }
      $("eeFase").textContent = resta > 0 ? `Étape conseillée : ${etapa}` : "Temps écoulé";
      $("eeCursor").style.left = `${Math.min(100, Math.max(0, 100 * decorrido / totalSeg))}%`;
    };
    tick();
    S.painelEE = setInterval(tick, 1000);
  }

  async function salvarTextoEE(imediato) {
    clearTimeout(S.salvarEE);
    S.salvarEE = null;
    if (S.t.provaAtual !== "ee") return;
    const respostas = {};
    document.querySelectorAll("[data-texto]").forEach(ta => {
      if (imediato || (S.eeSujas || {})[ta.dataset.texto]) respostas[ta.dataset.texto] = ta.value;
    });
    if (!Object.keys(respostas).length) return;
    S.eeSujas = {};
    await salvar({ respostas });
    const s = $("salvoEE");
    if (s) s.textContent = `Salvo às ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
  }

  // ---------------- EO ----------------
  let fluxoMic = null;
  async function pedirMicrofone() {
    if (fluxoMic && fluxoMic.active) return fluxoMic;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("Este navegador não permite gravar áudio. Use Chrome, Edge ou Safari atualizados.");
    try {
      fluxoMic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      return fluxoMic;
    } catch (err) {
      throw new Error("Permita o uso do microfone para fazer a expressão oral.");
    }
  }

  async function testarMicrofone() {
    const box = $("testeMic");
    try {
      const f = await pedirMicrofone();
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const an = ctx.createAnalyser();
      ctx.createMediaStreamSource(f).connect(an);
      const buf = new Uint8Array(an.fftSize);
      let pico = 0;
      const fim = Date.now() + 4000;
      box.textContent = "Fale algo em francês por 4 segundos…";
      const loop = () => {
        an.getByteTimeDomainData(buf);
        pico = Math.max(pico, ...buf.map(v => Math.abs(v - 128)));
        if (Date.now() < fim) requestAnimationFrame(loop);
        else { ctx.close(); box.textContent = pico > 12 ? "Microfone funcionando ✓" : "Não captamos sua voz — confira o microfone escolhido no navegador."; }
      };
      loop();
    } catch (err) { box.textContent = err.message; }
  }

  const Reconhecimento = window.SpeechRecognition || window.webkitSpeechRecognition;

  function tarefaEOAtual() {
    const feitas = S.t.provas.eo.respostas || {};
    return S.def.provas.eo.tarefas.findIndex(t => !feitas[t.id]);
  }

  function professorNaChamada() {
    return S.t.conexao?.status === "ativa";
  }

  function renderEO() {
    const i = tarefaEOAtual();
    if (i < 0) { finalizarProva(false); return; }
    const t = S.def.provas.eo.tarefas[i];
    if (!S.eo || S.eo.tarefa !== t.id) S.eo = { tarefa: t.id, fase: "intro", fim: null, gravando: false, transcricao: "", pergunta: 0 };
    $("barraSub").textContent = `${t.titulo.split(" — ")[0]} de 3`;
    const fase = S.eo.fase;
    const comProf = professorNaChamada();
    $("vProva").innerHTML = `<div class="sm-card">
      <div class="sm-questao-topo"><strong>${esc(t.titulo)}</strong><span class="sm-nivel">${Math.round(t.duracaoSeg / 6) / 10} min${t.preparacaoSeg ? ` · preparação ${t.preparacaoSeg / 60} min` : ""}</span></div>
      <div class="sm-consigne">${esc(t.consigne)}</div>
      ${comProf ? `<div class="sm-aviso">Seu professor é o examinador desta tarefa: ele fala com você pela chamada de voz (painel no canto da tela). Sua fala continua sendo gravada.</div>` : ""}
      <div class="sm-oral-palco">
        <div class="sm-oral-fase" id="eoFase">${{ intro: "Pronto para começar", prep: "Preparação", fala: "Gravando", envio: "Enviando" }[fase]}</div>
        <div class="sm-oral-relogio" id="eoRelogio">${mmss(fase === "prep" ? t.preparacaoSeg : t.duracaoSeg)}</div>
        <div id="eoExaminador"></div>
        <div id="eoAcoes"></div>
        <div class="sm-transcricao" id="eoTranscricao" ${fase === "fala" ? "" : "hidden"}>${esc(S.eo.transcricao) || '<span class="sm-muted">A transcrição da sua fala aparece aqui…</span>'}</div>
        ${!Reconhecimento ? `<p class="sm-muted" style="margin-top:8px;">Seu navegador não transcreve a fala automaticamente: o áudio é gravado e enviado mesmo assim${S.t.modoCorrecao === "ia" ? ", mas a IA precisa da transcrição — prefira Chrome ou Edge" : ""}.</p>` : ""}
      </div>
    </div>`;
    const acoes = $("eoAcoes");
    if (fase === "intro") {
      acoes.innerHTML = `<button class="sm-btn" id="eoComecar" type="button">${t.preparacaoSeg ? "Começar a preparação" : "Começar a falar"}</button>`;
      $("eoComecar").addEventListener("click", () => t.preparacaoSeg ? iniciarPreparacao(t) : iniciarFala(t));
    } else if (fase === "prep") {
      acoes.innerHTML = `<p class="sm-muted">Anote as perguntas que vai fazer.</p><button class="sm-btn secundario" id="eoPular" type="button" style="margin-top:8px;">Já estou pronto</button>`;
      $("eoPular").addEventListener("click", () => iniciarFala(t));
    } else if (fase === "fala") {
      acoes.innerHTML = `<span class="sm-rec">Gravando</span><br><button class="sm-btn secundario" id="eoTerminar" type="button" style="margin-top:12px;">Terminar esta tarefa</button>`;
      $("eoTerminar").addEventListener("click", () => pararGravacao(false));
      renderExaminador(t);
    }
  }

  function renderExaminador(t) {
    const box = $("eoExaminador");
    if (!box || !t.perguntasExaminador?.length) return;
    const p = t.perguntasExaminador[S.eo.pergunta] || t.perguntasExaminador[0];
    const temMais = S.eo.pergunta < t.perguntasExaminador.length - 1;
    box.innerHTML = `<div class="sm-examinador"><img src="img/icones/teacher.svg" alt=""><div><small class="sm-muted">Examinateur</small><br>${esc(p)}
      <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;"><button class="sm-btn secundario pequeno" type="button" id="eoRepetir">🔊 Ouvir</button>${temMais ? `<button class="sm-btn secundario pequeno" type="button" id="eoProxPerg">Próxima pergunta</button>` : ""}</div></div></div>`;
    $("eoRepetir").addEventListener("click", ev => window.falarFrances(p, ev.currentTarget));
    const prox = $("eoProxPerg");
    if (prox) prox.addEventListener("click", () => { S.eo.pergunta++; renderExaminador(t); falarPergunta(t); salvar({ perguntaEO: S.eo.pergunta }); });
  }

  function falarPergunta(t) {
    if (professorNaChamada()) return; // o professor faz as perguntas ao vivo
    const p = t.perguntasExaminador?.[S.eo.pergunta];
    if (p && window.falarFrances) window.falarFrances(p);
  }

  function contagem(seg, aoTick, aoFim) {
    clearInterval(S.eo.timer);
    S.eo.fim = Date.now() + seg * 1000;
    const tick = () => {
      const r = (S.eo.fim - Date.now()) / 1000;
      aoTick(r);
      if (r <= 0) { clearInterval(S.eo.timer); aoFim(); }
    };
    tick();
    S.eo.timer = setInterval(tick, 250);
  }

  function iniciarPreparacao(t) {
    S.eo.fase = "prep";
    salvar({ etapaEO: `${t.id} · preparação` });
    renderEO();
    contagem(t.preparacaoSeg, r => { const el = $("eoRelogio"); if (el) el.textContent = mmss(r); }, () => iniciarFala(t));
  }

  async function iniciarFala(t) {
    clearInterval(S.eo.timer);
    let fluxo;
    try { fluxo = await pedirMicrofone(); }
    catch (err) { return modal("Microfone", `<p>${esc(err.message)}</p>`, [{ texto: "Fechar" }]); }
    S.eo.fase = "fala";
    S.eo.gravando = true;
    S.eo.transcricao = "";
    S.eo.pergunta = 0;
    S.eo.pedacos = [];
    const tipo = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find(x => window.MediaRecorder && MediaRecorder.isTypeSupported?.(x)) || "";
    S.eo.tipo = (tipo || "audio/webm").split(";")[0];
    S.eo.rec = new MediaRecorder(fluxo, tipo ? { mimeType: tipo } : undefined);
    S.eo.rec.ondataavailable = ev => { if (ev.data.size) S.eo.pedacos.push(ev.data); };
    S.eo.rec.start(1000);
    iniciarTranscricao();
    salvar({ etapaEO: `${t.id} · falando`, perguntaEO: 0 });
    renderEO();
    falarPergunta(t);
    // Tarefa 1 (entretien): próxima pergunta do examinador gravado a cada ~30 s
    // (o roteiro do professor em admin-simulados.js mostra os mesmos tempos).
    if (t.id === "t1" && !professorNaChamada()) {
      S.eo.autoPerg = setInterval(() => {
        if (S.eo.pergunta < t.perguntasExaminador.length - 1) { S.eo.pergunta++; renderExaminador(t); falarPergunta(t); salvar({ perguntaEO: S.eo.pergunta }); }
      }, 30000);
    }
    contagem(t.duracaoSeg, r => { const el = $("eoRelogio"); if (el) el.textContent = mmss(r); }, () => pararGravacao(false));
  }

  function iniciarTranscricao() {
    if (!Reconhecimento) return;
    const rec = new Reconhecimento();
    rec.lang = "fr-FR";
    rec.continuous = true;
    rec.interimResults = true;
    let finais = "";
    rec.onresult = ev => {
      let parcial = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) finais += r[0].transcript.trim() + " ";
        else parcial += r[0].transcript;
      }
      S.eo.transcricao = (finais + parcial).trim();
      const box = $("eoTranscricao");
      if (box) box.textContent = S.eo.transcricao;
    };
    // O Chrome encerra o reconhecimento após silêncios: reinicia enquanto grava.
    rec.onend = () => { if (S.eo?.gravando && S.eo.reconhecedor === rec) { try { rec.start(); } catch (e) {} } };
    rec.onerror = () => {};
    S.eo.reconhecedor = rec;
    try { rec.start(); } catch (e) {}
  }

  async function pararGravacao(silencioso) {
    if (!S.eo?.gravando) return;
    const t = S.def.provas.eo.tarefas.find(x => x.id === S.eo.tarefa);
    S.eo.gravando = false;
    clearInterval(S.eo.timer);
    clearInterval(S.eo.autoPerg);
    const rec = S.eo.reconhecedor;
    S.eo.reconhecedor = null;
    if (rec) { try { rec.stop(); } catch (e) {} }
    const blob = await new Promise(resolve => {
      const r = S.eo.rec;
      if (!r || r.state === "inactive") return resolve(new Blob(S.eo.pedacos, { type: S.eo.tipo }));
      r.onstop = () => resolve(new Blob(S.eo.pedacos, { type: S.eo.tipo }));
      r.stop();
    });
    S.eo.fase = "envio";
    if (!silencioso) renderEO();
    const fd = new FormData();
    if (blob.size) fd.append("audio", new File([blob], `${t.id}.${S.eo.tipo === "audio/mp4" ? "m4a" : S.eo.tipo === "audio/ogg" ? "ogg" : "webm"}`, { type: S.eo.tipo }));
    fd.append("transcricao", S.eo.transcricao || "");
    for (let tentativa = 0; tentativa < 3; tentativa++) {
      try {
        await api(`/api/simulados/tentativas/${S.t._id}/eo/${t.id}`, { method: "POST", body: fd });
        S.t.provas.eo.respostas = { ...(S.t.provas.eo.respostas || {}), [t.id]: { transcricao: S.eo.transcricao } };
        break;
      } catch (err) {
        if (tentativa === 2) {
          modal("Falha ao enviar a gravação", `<p>${esc(err.message)}</p>`, [{ texto: "Tentar de novo", fn: () => { S.eo.gravando = true; pararGravacao(false); } }]);
          return;
        }
        await new Promise(r => setTimeout(r, 1500));
      }
    }
    S.eo = null;
    if (silencioso) return;
    if (tarefaEOAtual() < 0) finalizarProva(false);
    else renderEO();
  }

  // =====================================================================
  // RESULTADO no formato TCF
  // =====================================================================
  function renderResultado() {
    clearInterval(S.relogio);
    mostrar("vResultado");
    const t = S.t;
    const def = S.def;
    const r = p => t.provas[p].resultado;
    const comNclc = def.formato === "TCF Canada" || ordem().some(p => r(p)?.nclc);
    const linha = p => {
      const x = r(p);
      if (!x) return `<tr><td>${NOMES[p]}</td><td colspan="${comNclc ? 3 : 2}" class="sm-muted">${t.status === "corrigindo_ia" ? "A IA está corrigindo…" : "Aguardando correção"}</td></tr>`;
      const score = ehCompreensao(p) ? `${x.pontos} <small class="sm-muted">/ ${x.escala || 699}</small>` : `${x.notaProva ?? x.nota} <small class="sm-muted">/ ${x.notaMaximaProva || 20}</small>`;
      return `<tr><td>${NOMES[p]}</td><td class="score">${score}</td><td><span class="niv">${esc(x.nivel)}</span></td>${comNclc ? `<td><strong>${esc(x.nclc || "–")}</strong></td>` : ""}</tr>`;
    };
    let status = "";
    if (t.status === "corrigindo_ia") status = `<div class="sm-card" style="text-align:center;"><div class="sm-spinner"></div><p>A Inteligência Artificial está corrigindo suas expressões escrita e oral. Isso leva de 1 a 3 minutos — pode ficar nesta página.</p></div>`;
    else if (t.status === "aguardando_correcao") {
      status = t.modoCorrecao === "ia" && t.ia?.erro
        ? `<div class="sm-card"><div class="sm-aviso">${esc(t.ia.erro)}</div><div style="display:flex;gap:8px;flex-wrap:wrap;">${t.iaDisponivel ? `<button class="sm-btn" id="btnRefazerIA" type="button">Tentar a correção por IA de novo</button>` : ""}<button class="sm-btn chamar" id="btnChamar2" type="button">Pedir correção a um professor</button></div></div>`
        : `<div class="sm-card"><p>Suas compreensões já estão corrigidas abaixo. <strong>A expressão escrita e a expressão oral estão com o professor</strong>; você recebe o resultado completo nesta página assim que ele publicar.</p></div>`;
    }
    const menor = ordem().map(p => r(p)?.nclc).filter(Boolean);
    const compreensoes = ordem().filter(ehCompreensao);
    const global = !MODO_EXERCICIO && !comNclc && compreensoes.every(p => r(p)) ? Math.round(compreensoes.reduce((s2, p) => s2 + r(p).pontos, 0) / compreensoes.length) : null;
    $("vResultado").innerHTML = `
      <div class="sm-hero"><h1>${MODO_EXERCICIO ? "Resultado do exercício" : "Resultado do simulado"}</h1><p>${esc(def.titulo)} · ${new Date(t.criadoEm).toLocaleDateString("pt-BR")} · ${{ ia: "correção por Inteligência Artificial", professor: "correção por professor", automatica: "correção automática" }[t.modoCorrecao]}</p></div>
      ${status}
      <div class="sm-card">
        <h2>Attestation de résultats (simulação)</h2>
        <div class="sm-tabela-scroll"><table class="sm-boletim">
          <thead><tr><th>Épreuve</th><th>Score</th><th>Niveau CECR</th>${comNclc ? "<th>NCLC</th>" : ""}</tr></thead>
          <tbody>${ordem().map(linha).join("")}${global != null ? `<tr class="global"><td><strong>Score global</strong></td><td class="score">${global} <small class="sm-muted">/ 699</small></td><td><span class="niv">${esc(nivelDoScore(global))}</span></td></tr>` : ""}</tbody>
        </table></div>
        <p class="sm-muted" style="margin-top:12px;">${MODO_EXERCICIO ? esc(def.explicacaoEscala || "Notas convertidas para a escala da prova do seu curso.") : comNclc
          ? `Compreensões: 0 a 699 pontos (itens ponderados pela dificuldade: A1 = 3 pts … C2 = 33 pts). Expressões: 0 a 20. Os níveis NCLC seguem a tabela de equivalência do TCF Canada usada pela imigração canadense.${menor.length === 4 ? ` Seu menor NCLC nesta simulação: <strong>${esc(menor.sort((a, b) => parseInt(a) - parseInt(b))[0])}</strong>.` : ""}`
          : "Cada épreuve é convertida para a escala do TCF (0 a 699), com itens ponderados pela dificuldade (A1 = 3 pts … C2 = 33 pts). Níveis: A1 100–199 · A2 200–299 · B1 300–399 · B2 400–499 · C1 500–599 · C2 600–699."}</p>
      </div>
      ${compreensoes.length && compreensoes.every(p => r(p)) ? corrige(compreensoes) : ""}
      ${compreensoes.map(p => blocoCompreensao(p)).join("")}
      ${ordem().filter(p => p === "ee" || p === "eo").map(p => blocoExpressao(p)).join("")}
      <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center;">
        <a class="sm-btn secundario" href="${urlVoltar()}">${MODO_EXERCICIO ? "Voltar aos exercícios" : "Voltar aos simulados"}</a>
        ${MODO_EXERCICIO ? `<a class="sm-btn secundario" href="producao.html?curso=${encodeURIComponent(def.curso)}">Ambiente de Produção</a>` : `<a class="sm-btn secundario" href="plataforma-questoes.html">Plataforma de Questões</a>`}
      </div>`;
    const b1 = $("btnRefazerIA");
    if (b1) b1.addEventListener("click", async () => { b1.disabled = true; try { await api(`/api/simulados/tentativas/${t._id}/corrigir-ia`, { method: "POST" }); S.t.status = "corrigindo_ia"; renderResultado(); } catch (err) { b1.disabled = false; modal("Erro", `<p>${esc(err.message)}</p>`, [{ texto: "Fechar" }]); } });
    const b2 = $("btnChamar2");
    if (b2) b2.addEventListener("click", abrirChamado);
    document.querySelectorAll("[data-audio-eo]").forEach(el => carregarAudioEO(el));
  }

  function nivelDoScore(v) {
    return v >= 600 ? "C2" : v >= 500 ? "C1" : v >= 400 ? "B2" : v >= 300 ? "B1" : v >= 200 ? "A2" : v >= 100 ? "A1" : "< A1";
  }

  // Folha de respostas corrigida, como a "Feuille de réponses / Corrigé" do livret.
  function corrige(provas) {
    const cel = (d, k) => {
      const marcada = d.resposta === k, certa = d.correta === k;
      return `<span class="${certa ? "certa" : ""} ${marcada && !certa ? "errada" : ""}">${marcada ? "✕" : certa ? "•" : ""}</span>`;
    };
    // Uma coluna por parte, como no livret (CO 1–15 · SL 16–25 · CE 26–40).
    const colunas = provas.map(p => S.def.provas[p].questoes.map(q => ({
      ...(S.t.provas[p].resultado.detalhes.find(d => d.n === q.n) || { resposta: null, correta: q.correta }), rotulo: numero(q)
    })));
    return `<div class="sm-card">
      <h2>Feuille de réponses — corrigé</h2>
      <p class="sm-muted">✕ = sua resposta · verde = resposta certa · vermelho = marcação errada.</p>
      <div class="sm-corrige">${colunas.map(col => `<div><div class="cab"><span></span>${LETRAS.map(l => `<b>${l}</b>`).join("")}</div>${col.map(d => `<div class="lin"><em>${d.rotulo}</em>${[0, 1, 2, 3].map(k => cel(d, k)).join("")}</div>`).join("")}</div>`).join("")}</div>
    </div>`;
  }

  function blocoCompreensao(p) {
    const x = S.t.provas[p].resultado;
    if (!x) return "";
    const qs = S.def.provas[p].questoes;
    const niveis = ["A1", "A2", "B1", "B2", "C1", "C2"];
    return `<div class="sm-card sm-revisao">
      <h2>${NOMES[p]} — ${x.acertos}/${x.total} acertos</h2>
      <div class="sm-nivel-barras">${niveis.map(n => `<div><strong>${x.porNivel[n]?.acertos ?? 0}/${x.porNivel[n]?.total ?? 0}</strong>${n}</div>`).join("")}</div>
      ${qs.map(q => {
        const d = x.detalhes.find(y => y.n === q.n) || {};
        return `<details><summary>${d.certo ? "✅" : d.resposta == null ? "⚪" : "❌"} Questão ${numero(q)} · ${q.nivel} — ${esc(p === "sl" || q.tipo === "lacuna" ? `${q.inicio.replace(/…$/, "")} ___ ${q.fim.replace(/^…\s*/, "")}` : q.pergunta)}</summary><div class="corpo">
          ${p === "co" ? `${enunciado(q, "co")}<audio controls preload="none" src="${esc(q.audio)}" style="width:100%;margin-bottom:8px;"></audio>${q.transcricao ? `<div class="sm-documento">${esc(q.transcricao)}</div>` : ""}` : enunciado(q, p)}
          <div class="sm-alts">${q.alternativas.map((a, i) => `<button type="button" disabled class="sm-alt ${i === q.correta ? "certa" : i === d.resposta ? "errada" : ""}"><span class="letra">${LETRAS[i]}</span><span>${esc(a)}</span></button>`).join("")}</div>
          ${q.explicacao ? `<p style="margin-top:8px;"><strong>Explicação:</strong> ${esc(q.explicacao)}</p>` : ""}
        </div></details>`;
      }).join("")}
    </div>`;
  }

  function tabelaCriterios(p, tarefa) {
    const crit = S.t.criterios[p];
    return `<table class="sm-criterios"><tbody>${crit.map(c => `<tr><td>${esc(c.nome)}</td><td>${tarefa.criterios?.[c.id] ?? "–"} / 5</td></tr>`).join("")}<tr><th>Nota da tarefa</th><th>${tarefa.nota} / 20</th></tr></tbody></table>`;
  }

  function blocoExpressao(p) {
    const x = S.t.provas[p].resultado;
    const tarefas = S.def.provas[p].tarefas;
    const resp = S.t.provas[p].respostas || {};
    return `<div class="sm-card">
      <h2>${NOMES[p]}${x ? ` — ${x.notaProva ?? x.nota}/${x.notaMaximaProva || 20} · ${esc(x.nivel)}${x.nclc ? ` · NCLC ${esc(x.nclc)}` : ""}` : ""}</h2>
      ${x ? `<p class="sm-muted">Corrigido por ${esc(x.corretorNome || (x.porIA ? "IA" : "professor"))}.</p>` : ""}
      ${tarefas.map(tf => {
        const rt = x?.tarefas?.[tf.id];
        const conteudo = p === "ee"
          ? `<div class="sm-comentario">${esc(resp[tf.id] || "(sem resposta)")}</div><p class="sm-muted" style="margin-top:4px;">${contarPalavras(resp[tf.id])} palavras (pedido: ${tf.min}–${tf.max})</p>`
          : `${S.t.provas.eo.audios?.[tf.id] ? `<div data-audio-eo="${tf.id}"><span class="sm-muted">Carregando gravação…</span></div>` : `<p class="sm-muted">Sem gravação.</p>`}${resp[tf.id]?.transcricao ? `<p class="sm-muted" style="margin-top:6px;">Transcrição automática:</p><div class="sm-comentario">${esc(resp[tf.id].transcricao)}</div>` : ""}`;
        return `<h3>${esc(tf.titulo)}</h3>${conteudo}${rt ? `${tabelaCriterios(p, rt)}${rt.comentario ? `<div class="sm-comentario">${esc(rt.comentario)}</div>` : ""}` : ""}`;
      }).join("")}
      ${x?.comentario ? `<h3>Comentário geral</h3><div class="sm-comentario">${esc(x.comentario)}</div>` : ""}
    </div>`;
  }

  async function carregarAudioEO(el) {
    try {
      const res = await fetch(`/api/simulados/tentativas/${S.t._id}/eo/${el.dataset.audioEo}/audio`, { headers: { Authorization: "Bearer " + localStorage.getItem("token") } });
      if (!res.ok) throw new Error();
      const url = URL.createObjectURL(await res.blob());
      el.innerHTML = `<audio controls src="${url}" style="width:100%;"></audio>`;
    } catch (e) { el.innerHTML = `<p class="sm-muted">Gravação indisponível.</p>`; }
  }

  // =====================================================================
  // TEMPO REAL: professor, chat, chamada
  // =====================================================================
  function ligarTempoReal() {
    if (S.stream) S.stream.fechar();
    $("dock").hidden = false;
    renderMensagens();
    S.chamada = S.chamada || new Chamada(S.t._id, "aluno", {
      onEstado: renderChamada,
      onRemoto: fluxo => { $("audioRemoto").srcObject = fluxo; },
      onConvite: () => { abrirDock(); tocarAviso(); }
    });
    S.stream = stream(`/api/simulados/tentativas/${S.t._id}/stream`, aoEvento);
  }

  function aoEvento(nome, d) {
    if (nome === "mensagem") {
      S.t.mensagens.push(d.mensagem);
      renderMensagens();
      if (d.mensagem.autor !== "aluno") novaNaoLida();
    } else if (nome === "conexao") {
      if (d.conexao) S.t.conexao = d.conexao;
      if (d.modoCorrecao) S.t.modoCorrecao = d.modoCorrecao;
      (d.mensagens || []).forEach(m => S.t.mensagens.push(m));
      atualizarConexao();
      renderMensagens();
      if (d.conexao?.status === "ativa") { abrirDock(); tocarAviso(); }
      if (S.t.provaAtual === "eo" && S.eo?.fase !== "fala" && S.t.status === "em_andamento") renderEO();
    } else if (nome === "sinal") {
      S.chamada && S.chamada.receber(d);
    } else if (nome === "controle") {
      (d.mensagens || []).forEach(m => S.t.mensagens.push(m));
      renderMensagens();
      novaNaoLida();
      recarregarSemPerder();
    } else if (nome === "status") {
      if (d.status !== S.t.status || (d.provaAtual !== undefined && d.provaAtual !== S.t.provaAtual)) recarregarSemPerder();
    } else if (nome === "corrigido") {
      if (S.t.status !== "em_andamento") recarregar();
    }
  }

  // Recarrega o estado sem destruir o que o aluno está digitando/gravando.
  async function recarregarSemPerder() {
    const antes = S.t.provaAtual;
    const novo = await api(`/api/simulados/tentativas/${S.t._id}`);
    if (novo.provaAtual !== antes || novo.status !== S.t.status) {
      if (antes === "eo" && S.eo?.gravando) await pararGravacao(true);
      aplicarEstado(novo);
      renderizar();
    } else {
      const p = novo.provaAtual;
      if (p) S.prazo = Date.now() + (novo.provas[p].restanteSeg || 0) * 1000;
      S.t.conexao = novo.conexao;
      atualizarConexao();
    }
  }

  function atualizarConexao() {
    const c = S.t?.conexao || {};
    const pill = $("pillConexao");
    const btn = $("btnChamar");
    pill.hidden = !(c.status === "solicitada" || c.status === "ativa");
    pill.className = "sm-pill " + (c.status === "ativa" ? "ativa" : "espera");
    $("pillConexaoTexto").textContent = c.status === "ativa" ? `${c.professorNome || "Professor"} conectado` : "Aguardando professor…";
    btn.hidden = c.status === "ativa";
    btn.textContent = c.status === "solicitada" ? "Cancelar chamado" : "Chamar professor";
    $("dockTitulo").textContent = c.status === "ativa" ? `${c.professorNome || "Professor"} · ao vivo` : c.status === "solicitada" ? "Aguardando um professor…" : "Professor";
  }

  function abrirChamado() {
    modal("Chamar um professor", `<p>Um professor da equipe será avisado agora e poderá entrar no seu simulado: ele vê seu progresso em tempo real, conversa com você pelo chat, pode ser seu examinador na expressão oral e corrigir sua prova. O relógio da prova <strong>não para</strong>.</p><textarea id="motivoChamado" maxlength="300" placeholder="Opcional: diga por que está chamando (dúvida, problema técnico, quero correção do professor…)"></textarea>`, [
      { texto: "Cancelar", classe: "secundario" },
      { texto: "Chamar agora", classe: "chamar", fn: async () => {
        try {
          const motivo = $("motivoChamado").value;
          aplicarEstado(await api(`/api/simulados/tentativas/${S.t._id}/chamar-professor`, { method: "POST", body: { motivo } }));
          renderMensagens();
          abrirDock();
          if (S.t.status !== "em_andamento") renderResultado();
        } catch (err) { alertaDock(err.message); }
      } }
    ]);
  }

  $("btnChamar").addEventListener("click", async () => {
    if (S.t?.conexao?.status === "solicitada") {
      try { aplicarEstado(await api(`/api/simulados/tentativas/${S.t._id}/cancelar-chamado`, { method: "POST" })); } catch (e) {}
      return;
    }
    abrirChamado();
  });

  function renderMensagens() {
    const box = $("dockMsgs");
    const msgs = S.t?.mensagens || [];
    box.innerHTML = msgs.length ? msgs.map(m => m.autor === "sistema"
      ? `<div class="sm-msg sistema">${esc(m.texto)}</div>`
      : `<div class="sm-msg ${m.autor === "aluno" ? "minha" : ""}"><small>${m.autor === "aluno" ? "Você" : esc(m.autorNome || "Professor")}</small>${esc(m.texto)}</div>`).join("")
      : `<div class="sm-msg sistema">Toque em “Chamar professor” para falar com a equipe a qualquer momento.</div>`;
    box.scrollTop = box.scrollHeight;
  }

  function alertaDock(texto) {
    S.t.mensagens.push({ autor: "sistema", texto });
    renderMensagens();
  }

  $("dockForm").addEventListener("submit", async ev => {
    ev.preventDefault();
    const input = $("dockInput");
    const texto = input.value.trim();
    if (!texto || !S.t) return;
    input.value = "";
    try { await api(`/api/simulados/tentativas/${S.t._id}/mensagens`, { method: "POST", body: { texto } }); }
    catch (err) { alertaDock(err.message); }
  });

  function abrirDock() {
    $("dock").classList.remove("recolhido");
    document.body.classList.add("dock-aberto");
    $("dockSeta").textContent = "▾";
    S.naoLidas = 0;
    $("dockBadge").hidden = true;
  }
  $("dockTopo").addEventListener("click", () => {
    const d = $("dock");
    if (d.classList.contains("recolhido")) abrirDock();
    else { d.classList.add("recolhido"); document.body.classList.remove("dock-aberto"); $("dockSeta").textContent = "▴"; }
  });
  function novaNaoLida() {
    if (!$("dock").classList.contains("recolhido")) return;
    S.naoLidas++;
    $("dockBadge").textContent = S.naoLidas;
    $("dockBadge").hidden = false;
  }

  function tocarAviso() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.value = 880; g.gain.value = 0.05;
      o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.25);
      setTimeout(() => ctx.close(), 400);
    } catch (e) {}
  }

  function renderChamada(estado, detalhe) {
    const box = $("dockChamada");
    box.hidden = estado === "livre" && !detalhe;
    if (estado === "convite") {
      box.innerHTML = `<span>📞 O professor quer iniciar a <strong>chamada de voz</strong>.</span><button class="sm-btn pequeno" type="button" id="chAceitar">Atender</button><button class="sm-btn secundario pequeno" type="button" id="chRecusar">Recusar</button>`;
      $("chAceitar").addEventListener("click", () => S.chamada.aceitar());
      $("chRecusar").addEventListener("click", () => S.chamada.recusar());
    } else if (estado === "conectando" || estado === "conectada" || estado === "instavel") {
      box.innerHTML = `<span>${estado === "conectada" ? "🟢 Em chamada com o professor" : estado === "instavel" ? "🟠 Conexão instável…" : "Conectando o áudio…"}</span><button class="sm-btn secundario pequeno" type="button" id="chMudo">Mudo</button><button class="sm-btn perigo pequeno" type="button" id="chDesligar">Desligar</button>`;
      let mudo = false;
      $("chMudo").addEventListener("click", ev => { mudo = !mudo; S.chamada.mudo(mudo); ev.target.textContent = mudo ? "Reativar som" : "Mudo"; });
      $("chDesligar").addEventListener("click", () => S.chamada.encerrar(true));
    } else if (detalhe) {
      box.innerHTML = `<span class="sm-muted">${esc(detalhe)}</span>`;
    } else {
      box.innerHTML = "";
    }
  }

  // =====================================================================
  // BOOT (depois do gate liberar a página)
  // =====================================================================
  function iniciar() {
    if (!MODO_EXERCICIO && window.CursoContexto?.curso && window.CursoContexto.curso !== "TCF") {
      return erroTela("A Simulação Completa de Prova está disponível para o curso TCF.");
    }
    const id = new URLSearchParams(location.search).get("t");
    if (id && /^[a-f0-9]{24}$/i.test(id)) abrirTentativa(id);
    else if (MODO_EXERCICIO) window.ExerciciosOrais?.galeria();
    else carregarInicio();
  }
  window.addEventListener("popstate", () => {
    if (!new URLSearchParams(location.search).get("t") && S.t === null) { if (MODO_EXERCICIO) window.ExerciciosOrais?.galeria(); else carregarInicio(); }
  });
  const esperarGate = setInterval(() => {
    if (document.body.style.visibility === "visible") { clearInterval(esperarGate); iniciar(); }
  }, 100);

  window.SimuladoRunner = { abrirTentativa, mostrar };

  // Evita perder a expressão escrita ao fechar a aba no meio da digitação.
  window.addEventListener("beforeunload", ev => {
    if (S.t?.status === "em_andamento" && (S.salvarEE || S.eo?.gravando)) { salvarTextoEE(true); ev.preventDefault(); }
  });
  document.addEventListener("keydown", ev => { if (ev.key === "Escape" && !$("modal").hidden) fecharModal(); });
})();
