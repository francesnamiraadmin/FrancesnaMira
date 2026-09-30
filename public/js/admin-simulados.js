// =====================================================================
// SIMULADOS AO VIVO (admin-simulados.html) — professor/administrador.
// Painel com chamados em tempo real + sessão de uma tentativa: espelho ao vivo
// do que o aluno está fazendo, chat, chamada de voz (examinador da EO), controle
// de tempo e correção das expressões no formato TCF (0–20 → CECR/NCLC).
// =====================================================================
(function () {
  const { api, stream, Chamada, esc, contarPalavras, mmss, nivelExpressao, nclcExpressao, enunciado, numero } = window.SimuladoAoVivo;
  const $ = id => document.getElementById(id);
  const NOMES = { co: "Compréhension orale", sl: "Structure de la langue", ce: "Compréhension écrite", ee: "Expression écrite", eo: "Expression orale" };
  const SIGLAS = { co: "CO", sl: "SL", ce: "CE", ee: "EE", eo: "EO" };
  const ordem = () => (S.def && S.def.ordem) || ["co", "ce", "ee", "eo"];
  const ehCompreensao = p => p === "co" || p === "sl" || p === "ce";
  const temExpressoes = () => ordem().some(p => p === "ee" || p === "eo");
  const STATUS = { em_andamento: "Em andamento", aguardando_correcao: "Aguardando correção", corrigindo_ia: "IA corrigindo", corrigido: "Corrigido" };

  const S = { painel: { ativos: [], aguardando: [], corrigidos: [] }, streamPainel: null, t: null, def: null, streamT: null, chamada: null, etapaEO: "", perguntaEO: null, relogio: null, prazo: null, tituloOriginal: document.title };

  function modal(titulo, corpoHtml, acoes) {
    $("modalTitulo").textContent = titulo;
    $("modalCorpo").innerHTML = corpoHtml;
    const box = $("modalAcoes");
    box.innerHTML = "";
    acoes.forEach(a => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "sm-btn " + (a.classe || ""); b.textContent = a.texto;
      b.addEventListener("click", async () => { if (a.fn && (await a.fn()) === false) return; $("modal").hidden = true; });
      box.appendChild(b);
    });
    $("modal").hidden = false;
  }
  const aviso = msg => modal("Atenção", `<p>${esc(msg)}</p>`, [{ texto: "Ok" }]);
  const tempoRel = d => {
    const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
    if (s < 60) return "agora";
    if (s < 3600) return `há ${Math.floor(s / 60)} min`;
    if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
    return new Date(d).toLocaleDateString("pt-BR");
  };

  // =====================================================================
  // PAINEL
  // =====================================================================
  async function carregarPainel() {
    try {
      const d = await api("/api/simulados/equipe/painel");
      S.painel = d;
      $("avisoIA").innerHTML = d.iaDisponivel ? "" : `<div class="sm-aviso">A correção por IA ainda não está configurada no servidor (variável <code>ANTHROPIC_API_KEY</code> no Railway). Enquanto isso, os simulados com correção por IA ficam na coluna “Aguardando correção” para um professor.</div>`;
      renderPainel();
    } catch (err) { aviso(err.message); }
  }

  function itemT(t) {
    const chamando = t.conexao?.status === "solicitada";
    const conectado = t.conexao?.status === "ativa";
    const etapa = t.status === "em_andamento" && t.provaAtual ? `${SIGLAS[t.provaAtual]}${t.provasStatus?.[t.provaAtual] === "pendente" ? " (não iniciada)" : ` · questão ${(t.questaoAtual || 0) + 1}`}` : STATUS[t.status];
    return `<div class="sm-t ${chamando ? "chamando" : ""}" data-abrir="${t._id}">
      <strong>${esc(t.aluno?.nome || "Aluno")}</strong>
      <small>${esc(t.aluno?.email || "")}</small>
      <div class="sm-chips" style="margin-top:6px;">
        ${chamando ? `<span class="sm-chip alerta">🔔 Chamando ${tempoRel(t.conexao.solicitadaEm)}</span>` : ""}
        ${conectado ? `<span class="sm-chip ok">Conectado: ${esc(t.conexao.professorNome || "")}</span>` : ""}
        <span class="sm-chip">${etapa}</span>
        <span class="sm-chip">${esc(t.titulo || "")}</span>
        <span class="sm-chip">${{ ia: "Correção IA", professor: "Correção professor", automatica: "Correção automática" }[t.modoCorrecao]}</span>
        ${t.temSugestaoIA ? `<span class="sm-chip ok">Sugestão IA pronta</span>` : ""}
        ${t.erroIA ? `<span class="sm-chip perigo">IA falhou</span>` : ""}
      </div>
      <small>Atividade ${tempoRel(t.ultimaAtividade || t.criadoEm)}</small>
    </div>`;
  }

  function renderPainel() {
    const ordenar = l => [...l].sort((a, b) => (b.conexao?.status === "solicitada") - (a.conexao?.status === "solicitada") || new Date(b.ultimaAtividade) - new Date(a.ultimaAtividade));
    const vazio = t => `<p class="sm-muted">${t}</p>`;
    $("listaAtivos").innerHTML = S.painel.ativos.length ? ordenar(S.painel.ativos).map(itemT).join("") : vazio("Nenhum aluno fazendo simulado agora.");
    $("listaAguardando").innerHTML = S.painel.aguardando.length ? S.painel.aguardando.map(itemT).join("") : vazio("Nada aguardando correção.");
    $("listaCorrigidos").innerHTML = S.painel.corrigidos.length ? S.painel.corrigidos.map(itemT).join("") : vazio("Nenhum simulado corrigido ainda.");
    const chamados = [...S.painel.ativos, ...S.painel.aguardando].filter(t => t.conexao?.status === "solicitada").length;
    document.title = chamados ? `(${chamados}) Chamado${chamados > 1 ? "s" : ""} · ${S.tituloOriginal}` : S.tituloOriginal;
  }

  function upsertPainel(t) {
    for (const k of ["ativos", "aguardando", "corrigidos"]) S.painel[k] = S.painel[k].filter(x => x._id !== t._id);
    const destino = t.status === "em_andamento" ? "ativos" : t.status === "corrigido" ? "corrigidos" : "aguardando";
    S.painel[destino].unshift(t);
    renderPainel();
  }

  function ligarStreamPainel() {
    S.streamPainel = stream("/api/simulados/equipe/stream", (nome, d) => {
      if (nome !== "tentativa") return;
      const antes = [...S.painel.ativos, ...S.painel.aguardando].find(x => x._id === d.tentativa._id);
      upsertPainel(d.tentativa);
      const chamandoAgora = d.tentativa.conexao?.status === "solicitada" && antes?.conexao?.status !== "solicitada";
      if (chamandoAgora || d.tipo === "nova" && d.tentativa.conexao?.status === "solicitada") notificarChamado(d.tentativa);
      if (d.tipo === "mensagem" && S.t?._id !== d.tentativa._id && d.tentativa.conexao?.status === "ativa" && d.tentativa.conexao.professorNome === window.__eu?.nome) {
        bip();
      }
    }, ok => {
      $("pillStream").className = "sm-pill " + (ok ? "ativa" : "espera");
      $("pillStreamTexto").textContent = ok ? "Ao vivo" : "Reconectando…";
    });
  }

  function bip() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.18].forEach(t0 => {
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.frequency.value = 988; g.gain.value = 0.06; o.connect(g); g.connect(ctx.destination);
        o.start(ctx.currentTime + t0); o.stop(ctx.currentTime + t0 + 0.12);
      });
      setTimeout(() => ctx.close(), 600);
    } catch (e) {}
  }

  function notificarChamado(t) {
    bip();
    const texto = `${t.aluno?.nome || "Um aluno"} está chamando um professor no simulado.`;
    if ("Notification" in window && Notification.permission === "granted" && document.hidden) {
      try { new Notification("Chamado no simulado", { body: texto, icon: "img/logo-mira.png" }); } catch (e) {}
    }
  }

  document.addEventListener("click", ev => {
    const el = ev.target.closest("[data-abrir]");
    if (el) abrirSessao(el.dataset.abrir);
  });

  // =====================================================================
  // SESSÃO
  // =====================================================================
  async function abrirSessao(id) {
    try {
      const t = await api(`/api/simulados/tentativas/${id}`);
      S.t = t; S.def = t.definicao; S.etapaEO = ""; S.perguntaEO = null; S.aluno = t.aluno;
    } catch (err) { return aviso(err.message); }
    $("vPainel").hidden = true;
    $("vSessao").hidden = false;
    const url = new URL(location.href); url.searchParams.set("t", id); history.replaceState(null, "", url);
    if (S.streamT) S.streamT.fechar();
    if (S.chamada) S.chamada.encerrar(false);
    S.chamada = new Chamada(id, "professor", { onEstado: renderChamada, onRemoto: f => { $("audioRemoto").srcObject = f; } });
    S.streamT = stream(`/api/simulados/tentativas/${id}/stream`, aoEventoSessao);
    $("sessaoPrincipal").innerHTML = `<div id="sCabecalho"></div><div id="sAoVivo"></div><div id="sCorrecao"></div>`;
    renderCabecalho();
    renderAoVivo();
    renderCorrecao();
    renderMensagens();
    renderChamada("livre");
    iniciarRelogio();
    window.scrollTo({ top: 0 });
  }

  function voltarPainel() {
    if (S.streamT) S.streamT.fechar();
    if (S.chamada) S.chamada.encerrar(true);
    S.t = null; S.streamT = null; S.chamada = null;
    clearInterval(S.relogio);
    $("vSessao").hidden = true;
    $("vPainel").hidden = false;
    const url = new URL(location.href); url.searchParams.delete("t"); history.replaceState(null, "", url);
    carregarPainel();
  }
  $("btnVoltar").addEventListener("click", voltarPainel);

  async function recarregarSessao({ correcao = false } = {}) {
    const t = await api(`/api/simulados/tentativas/${S.t._id}`);
    S.t = t; S.def = t.definicao;
    renderCabecalho();
    renderAoVivo();
    if (correcao) renderCorrecao();
    else atualizarBlocoCompreensoes();
    renderMensagens();
    iniciarRelogio();
  }

  function iniciarRelogio() {
    clearInterval(S.relogio);
    const p = S.t.provaAtual;
    const e = p && S.t.provas[p];
    S.prazo = e && e.status === "em_andamento" && e.restanteSeg != null ? Date.now() + e.restanteSeg * 1000 : null;
    const tick = () => { const el = $("sRelogio"); if (el) el.textContent = S.prazo ? mmss((S.prazo - Date.now()) / 1000) : "--:--"; };
    tick();
    S.relogio = setInterval(tick, 1000);
  }

  // ---------------- cabeçalho + controles ----------------
  function renderCabecalho() {
    const t = S.t;
    const c = t.conexao || {};
    const ativa = c.status === "ativa";
    const souEu = ativa && String(c.professorId) === String(t.eu);
    $("sCabecalho").innerHTML = `<div class="sm-card">
      <div style="display:flex;gap:14px;flex-wrap:wrap;align-items:flex-start;">
        <div style="flex:1;min-width:220px;">
          <h2 style="margin-bottom:4px;">${esc(S.aluno?.nome || "Aluno")}</h2>
          <p class="sm-muted" id="sAlunoInfo"></p>
          <div class="sm-chips" style="margin-top:8px;">
            <span class="sm-chip">${STATUS[t.status]}</span>
            ${c.status === "solicitada" ? `<span class="sm-chip alerta">🔔 Pediu professor ${tempoRel(c.solicitadaEm)}${c.motivo ? ` — “${esc(c.motivo)}”` : ""}</span>` : ""}
            ${ativa ? `<span class="sm-chip ok">Conectado: ${esc(c.professorNome)}</span>` : ""}
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;align-items:flex-end;">
          ${ativa ? `<button class="sm-btn secundario pequeno" id="bDesconectar" type="button">Encerrar conexão</button>` : `<button class="sm-btn chamar" id="bConectar" type="button">${c.status === "solicitada" ? "Atender chamado" : "Conectar-se ao aluno"}</button>`}
          ${!temExpressoes() ? `<span class="sm-chip">Correção automática</span>` : `<label class="sm-muted" style="font-size:0.8rem;">Correção:
            <select class="sm-campo" id="bModo" ${t.publicadoEm ? "disabled" : ""}>
              <option value="professor" ${t.modoCorrecao === "professor" ? "selected" : ""}>Professor</option>
              <option value="ia" ${t.modoCorrecao === "ia" ? "selected" : ""}>Inteligência Artificial</option>
            </select>
          </label>`}
        </div>
      </div>
      ${ativa && !souEu ? `<p class="sm-aviso">Outro professor (${esc(c.professorNome)}) está conectado. Você pode acompanhar, mas combine antes de ligar para o aluno.</p>` : ""}
    </div>`;
    const bC = $("bConectar");
    if (bC) bC.addEventListener("click", async () => {
      bC.disabled = true;
      try { S.t = await api(`/api/simulados/tentativas/${t._id}/conectar`, { method: "POST" }); renderCabecalho(); renderMensagens(); }
      catch (err) { aviso(err.message); bC.disabled = false; }
    });
    const bD = $("bDesconectar");
    if (bD) bD.addEventListener("click", async () => {
      if (S.chamada) S.chamada.encerrar(true);
      try { S.t = await api(`/api/simulados/tentativas/${t._id}/desconectar`, { method: "POST" }); renderCabecalho(); renderMensagens(); }
      catch (err) { aviso(err.message); }
    });
    const bM = $("bModo");
    if (bM) bM.addEventListener("change", async ev => {
      try { S.t = await api(`/api/simulados/tentativas/${t._id}/modo`, { method: "POST", body: { modoCorrecao: ev.target.value } }); renderCabecalho(); }
      catch (err) { aviso(err.message); }
    });
    $("sAlunoInfo").textContent = `${S.aluno?.email || ""} · simulado iniciado em ${new Date(t.criadoEm).toLocaleString("pt-BR")}`;
    if (S.chamada && S.chamada.estado === "livre") renderChamada("livre");
  }

  // ---------------- espelho ao vivo ----------------
  function renderAoVivo() {
    const t = S.t;
    const p = t.provaAtual;
    const box = $("sAoVivo");
    const etapas = ordem().map(x => `<span class="${x === p && t.status === "em_andamento" ? "atual" : t.provas[x].status === "finalizada" ? "feita" : ""}">${SIGLAS[x]}</span>`).join("");
    let corpo = "";
    if (t.status !== "em_andamento") corpo = `<p class="sm-muted">O aluno terminou o simulado. Veja as respostas e corrija abaixo.</p>`;
    else if (t.provas[p].status === "pendente") corpo = `<p class="sm-muted">Aguardando o aluno começar a <strong>${NOMES[p]}</strong>.</p>${p === "eo" ? roteiroEO() : ""}`;
    else if (ehCompreensao(p)) corpo = espelhoCompreensao(p, true);
    else if (p === "ee") corpo = espelhoEE();
    else corpo = roteiroEO();
    box.innerHTML = `<div class="sm-card">
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px;">
        <h2 style="margin:0;flex:1;">Ao vivo${t.status === "em_andamento" && p ? ` — ${NOMES[p]}` : ""}</h2>
        <div class="sm-etapas">${etapas}</div>
        ${t.status === "em_andamento" ? `<span class="sm-relogio" id="sRelogio">--:--</span>` : ""}
      </div>
      ${t.status === "em_andamento" && t.provas[p].status === "em_andamento" ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
        <button class="sm-btn secundario pequeno" type="button" data-extra="5">+5 min</button>
        <button class="sm-btn secundario pequeno" type="button" data-extra="10">+10 min</button>
        <button class="sm-btn perigo pequeno" type="button" id="bEncerrarProva">Encerrar esta épreuve</button>
      </div>` : ""}
      ${corpo}
      ${t.status === "em_andamento" && p !== "eo" && ordem().includes("eo") ? `<details style="margin-top:14px;"><summary class="sm-muted" style="cursor:pointer;">Roteiro do examinador da Expression orale (para se preparar)</summary>${roteiroEO()}</details>` : ""}
    </div>`;
    box.querySelectorAll("[data-extra]").forEach(b => b.addEventListener("click", () => controle({ acao: "tempoExtra", minutos: Number(b.dataset.extra) })));
    const bE = $("bEncerrarProva");
    if (bE) bE.addEventListener("click", () => modal("Encerrar a épreuve?", `<p>A ${esc(NOMES[p])} do aluno será encerrada agora e ele passa para a próxima.</p>`, [{ texto: "Cancelar", classe: "secundario" }, { texto: "Encerrar", classe: "perigo", fn: () => controle({ acao: "encerrarProva" }) }]));
    const t0 = $("sRelogio");
    if (t0 && S.prazo) t0.textContent = mmss((S.prazo - Date.now()) / 1000);
  }

  async function controle(body) {
    try { S.t = await api(`/api/simulados/tentativas/${S.t._id}/controle`, { method: "POST", body }); S.def = S.t.definicao; renderAoVivo(); iniciarRelogio(); }
    catch (err) { aviso(err.message); }
  }

  function espelhoCompreensao(p, aoVivo) {
    const e = S.t.provas[p];
    const resp = e.respostas || {};
    const qs = S.def.provas[p].questoes;
    let pontos = 0, acertos = 0;
    const celulas = qs.map((q, i) => {
      const r = resp[q.n];
      const cls = r == null ? "" : r === q.correta ? "certa" : "errada";
      if (r === q.correta) { pontos += q.pontos; acertos++; }
      const ouvido = p === "co" && (e.ouvidos || []).includes(q.n) ? "🔊" : "";
      return `<span class="${cls} ${aoVivo && i === e.questaoAtual ? "atual" : ""}" title="${esc(q.nivel)} · ${q.pontos} pts${q.tipo === "lacuna" ? " · lacune" : ""}">${numero(q)}${ouvido}</span>`;
    }).join("");
    const atual = qs[e.questaoAtual || 0];
    return `<p class="sm-muted" style="margin-bottom:8px;">${Object.keys(resp).length}/${qs.length} respondidas · ${acertos} acertos · <strong>${pontos}/699 pts</strong> até agora (verde = certa, vermelho = errada)</p>
      <div class="sm-espelho">${celulas}</div>
      ${aoVivo && atual ? `<details style="margin-top:12px;"><summary class="sm-muted" style="cursor:pointer;">Questão atual do aluno (${numero(atual)}) — ver gabarito</summary>
        <div style="margin-top:8px;font-size:0.88rem;">${enunciado(atual, p)}${p === "co" && atual.transcricao ? `<div class="sm-documento">${esc(atual.transcricao)}</div>` : ""}
        <p><strong>${esc(atual.pergunta)}</strong></p><p>Resposta certa: <strong>${esc(atual.alternativas[atual.correta])}</strong></p></div></details>` : ""}`;
  }

  function espelhoEE() {
    const resp = S.t.provas.ee.respostas || {};
    return S.def.provas.ee.tarefas.map(tf => {
      const n = contarPalavras(resp[tf.id]);
      return `<h3>${esc(tf.titulo)} <small class="sm-muted">— ${n} palavras (pedido ${tf.min}–${tf.max})</small></h3><div class="sm-ao-vivo-texto">${esc(resp[tf.id] || "") || '<span class="sm-muted">Ainda não escreveu.</span>'}</div>`;
    }).join("");
  }

  // Mesmo ritmo do examinador automático de simuladoTcf.js: na tarefa 1 a próxima
  // pergunta entra a cada 30 s; nas tarefas 2 e 3 há uma única fala de abertura.
  const INTERVALO_T1_SEG = 30;
  const mmssCurto = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  function roteiroTarefa(tf, tarefaAtual, perguntaAtual) {
    const perguntas = tf.perguntasExaminador || [];
    const quando = i => tf.id === "t1" ? `aos ${mmssCurto(i * INTERVALO_T1_SEG)}` : "ao começar";
    const itens = perguntas.map((q, i) => {
      const atual = tarefaAtual === tf.id && perguntaAtual === i;
      return `<li style="margin:8px 0;${atual ? "font-weight:700;" : ""}">
        <span class="sm-chip" style="margin-right:6px;">${quando(i)}</span>${esc(q)}
        <button class="sm-btn secundario pequeno" type="button" data-ouvir="${esc(q)}" title="Ouvir (só você ouve)" style="margin-left:6px;padding:3px 10px;">🔊</button>
        ${atual ? '<span class="sm-chip alerta" style="margin-left:4px;">o aluno está aqui</span>' : ""}
      </li>`;
    }).join("");
    const depois = {
      t1: "O candidato também pode passar sozinho à próxima pergunta. Se sobrar tempo depois da última, aprofunde o que ele disse (por quê? desde quando? como?).",
      t2: `Depois de ${Math.round(tf.preparacaoSeg / 60)} min de preparação, esta é a única fala gravada: a partir daí o candidato conduz, fazendo as perguntas. Responda com as informações da ficha abaixo.`,
      t3: "Na gravação, o examinador só lê a afirmação e o candidato argumenta sozinho até o fim do tempo. Ao vivo, use as relances da ficha se ele parar."
    }[tf.id] || "";
    return `<ol style="padding-left:20px;font-size:0.9rem;">${itens}</ol><p class="sm-muted" style="font-size:0.82rem;">${depois}</p>`;
  }

  function roteiroEO() {
    const feitas = S.t.provas.eo.respostas || {};
    const tarefaAtual = /^(t\d)/.exec(S.etapaEO || "")?.[1] || null;
    return `${S.etapaEO ? `<p><strong>Agora:</strong> ${esc(S.etapaEO)}</p>` : ""}
      <p class="sm-muted" style="margin:6px 0 10px;">Abaixo está exatamente o que o candidato ouviria do examinador gravado, sem chamada. Use como modelo quando for o examinador ao vivo: conecte-se e toque em <strong>Ligar para o aluno</strong> no painel da conversa. O 🔊 toca o áudio só para você. A fala do aluno continua sendo gravada e transcrita.</p>
      ${S.def.provas.eo.tarefas.map(tf => `<div style="border-top:1px solid var(--glass-border);padding-top:10px;margin-top:10px;">
        <h3 style="margin-top:0;">${esc(tf.titulo)} <small class="sm-muted">— ${mmssCurto(tf.duracaoSeg)} de fala${tf.preparacaoSeg ? ` + ${mmssCurto(tf.preparacaoSeg)} de preparação` : ""}</small> ${feitas[tf.id] ? '<span class="sm-chip ok">gravada</span>' : ""}</h3>
        <div class="sm-consigne" style="font-size:0.86rem;"><strong>Consigne do candidato:</strong> ${esc(tf.consigne)}</div>
        <p style="font-weight:600;font-size:0.88rem;margin-top:8px;">Roteiro do examinador</p>
        ${roteiroTarefa(tf, tarefaAtual, S.perguntaEO)}
        ${tf.fichaExaminador ? `<div class="sm-ficha"><strong>Ficha do examinador:</strong> ${esc(tf.fichaExaminador)}</div>` : ""}
        ${feitas[tf.id] ? blocoGravacao(tf.id) : ""}
      </div>`).join("")}`;
  }

  function blocoGravacao(id) {
    const r = S.t.provas.eo.respostas?.[id];
    return `${S.t.provas.eo.audios?.[id] ? `<div data-audio-eo="${id}"><button class="sm-btn secundario pequeno" type="button" data-carregar-audio="${id}">▶ Carregar gravação</button></div>` : `<p class="sm-muted">Sem arquivo de áudio.</p>`}
      <div class="sm-comentario" style="margin-top:6px;">${esc(r?.transcricao || "") || '<span class="sm-muted">Sem transcrição automática.</span>'}</div>`;
  }

  document.addEventListener("click", ev => {
    const b = ev.target.closest("[data-ouvir]");
    if (b && window.falarFrances) window.falarFrances(b.dataset.ouvir, b);
  });

  document.addEventListener("click", async ev => {
    const b = ev.target.closest("[data-carregar-audio]");
    if (!b) return;
    const id = b.dataset.carregarAudio;
    b.disabled = true;
    try {
      const res = await fetch(`/api/simulados/tentativas/${S.t._id}/eo/${id}/audio`, { headers: { Authorization: "Bearer " + localStorage.getItem("token") } });
      if (!res.ok) throw new Error();
      const url = URL.createObjectURL(await res.blob());
      b.parentElement.innerHTML = `<audio controls autoplay src="${url}" style="width:100%;"></audio>`;
    } catch (e) { b.textContent = "Gravação indisponível"; }
  });

  // ---------------- correção no formato TCF ----------------
  function atualizarBlocoCompreensoes() {
    const el = $("sCompreensoes");
    if (el) el.innerHTML = htmlCompreensoes();
  }
  function htmlCompreensoes() {
    return ordem().filter(ehCompreensao).map(p => {
      const r = S.t.provas[p].resultado;
      return `<div class="sm-hist-item" style="margin-bottom:8px;"><div class="info"><strong>${NOMES[p]}</strong><br><small>${r ? `${r.acertos}/${r.total} acertos` : S.t.provas[p].status === "finalizada" ? "" : "ainda não finalizada"}</small></div>
        ${r ? `<span class="sm-chip ok">${r.pontos}/699 · ${esc(r.nivel)}${r.nclc ? ` · NCLC ${esc(r.nclc)}` : ""}</span>` : ""}</div>
        ${r && S.t.status !== "em_andamento" ? `<details style="margin-bottom:10px;"><summary class="sm-muted" style="cursor:pointer;">Ver respostas</summary>${espelhoCompreensao(p, false)}</details>` : ""}`;
    }).join("");
  }

  function renderCorrecao() {
    const t = S.t;
    const crit = t.criterios;
    const sug = t.sugestaoIA;
    if (!temExpressoes()) {
      // Simulado só de compreensões (TCF Tout Public): nada a lançar, tudo é corrigido na hora.
      $("sCorrecao").innerHTML = `<div class="sm-card"><h2>Resultado (correção automática)</h2>
        <div id="sCompreensoes">${htmlCompreensoes()}</div>
        <p class="sm-muted">Este simulado não tem expressões: cada épreuve é corrigida automaticamente e convertida para a escala TCF (0–699) assim que o aluno a termina.</p></div>`;
      return;
    }
    const blocoProva = p => {
      const r = t.provas[p].resultado;
      const tarefas = S.def.provas[p].tarefas;
      const resp = t.provas[p].respostas || {};
      return `<div class="sm-card" data-prova-nota="${p}">
        <h2>${NOMES[p]}</h2>
        ${tarefas.map(tf => {
          const rt = r?.tarefas?.[tf.id] || {};
          const resposta = p === "ee"
            ? `<details><summary class="sm-muted" style="cursor:pointer;">Texto do aluno — ${contarPalavras(resp[tf.id])} palavras (pedido ${tf.min}–${tf.max})</summary><div class="sm-ao-vivo-texto" style="margin-top:6px;">${esc(resp[tf.id] || "(sem resposta)")}</div></details>`
            : `<details><summary class="sm-muted" style="cursor:pointer;">Gravação e transcrição</summary>${resp[tf.id] ? blocoGravacao(tf.id) : '<p class="sm-muted">Ainda não gravada.</p>'}</details>`;
          return `<div data-tarefa="${tf.id}" style="border-top:1px solid var(--glass-border);padding-top:10px;margin-top:10px;">
            <h3 style="margin-top:0;">${esc(tf.titulo)} <span class="sm-chip" data-nota-tarefa>–/20</span></h3>
            ${resposta}
            <div class="sm-grade-nota">${crit[p].map(c => `<label>${esc(c.nome)}<select data-crit="${c.id}">${Array.from({ length: 11 }, (_, i) => i / 2).map(v => `<option value="${v}" ${Number(rt.criterios?.[c.id] ?? 0) === v ? "selected" : ""}>${String(v).replace(".", ",")}</option>`).join("")}</select></label>`).join("")}</div>
            <textarea class="sm-campo" data-coment placeholder="Comentário para o aluno (pontos fortes, a melhorar, correções)…">${esc(rt.comentario || "")}</textarea>
          </div>`;
        }).join("")}
        <div style="border-top:1px solid var(--glass-border);padding-top:10px;margin-top:12px;">
          <div class="sm-resumo-nota">Média das tarefas: <strong data-media>–</strong>
            <label class="sm-muted">Nota final (0–20): <input class="sm-campo" type="number" min="0" max="20" step="1" data-final style="width:80px;" value="${r && r.nota !== r.media ? r.nota : ""}" placeholder="auto"></label>
            <span class="sm-chip ok" data-resultado>–</span>
          </div>
          <textarea class="sm-campo" data-coment-geral placeholder="Comentário geral da ${NOMES[p]}…" style="margin-top:8px;">${esc(r?.comentario || "")}</textarea>
          ${r ? `<p class="sm-muted" style="margin-top:6px;font-size:0.78rem;">Última avaliação: ${esc(r.corretorNome || (r.porIA ? "IA" : ""))} · ${new Date(r.corrigidoEm).toLocaleString("pt-BR")}</p>` : ""}
        </div>
      </div>`;
    };
    $("sCorrecao").innerHTML = `
      <div class="sm-card">
        <h2>${S.def.categoria === "exercicio" ? `Correção do exercício — ${esc(S.def.curso)} ${esc(S.def.nivel || "")}` : "Correção no formato TCF"}</h2>
        <div id="sCompreensoes">${htmlCompreensoes()}</div>
        <p class="sm-muted">Cada tarefa das expressões recebe 4 critérios de 0 a 5 (total 20). A nota final da épreuve é a média das 3 tarefas (0–20), convertida em nível CECR e NCLC como no TCF Canada — você pode ajustar a nota final.</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">
          ${sug ? `<button class="sm-btn secundario" type="button" id="bUsarIA">Preencher com a sugestão da IA</button>` : ""}
          ${t.iaDisponivel && t.status !== "em_andamento" ? `<button class="sm-btn secundario" type="button" id="bGerarIA">${sug ? "Gerar nova sugestão da IA" : "Gerar sugestão da IA"}</button>` : ""}
          ${t.ia?.erro ? `<span class="sm-chip perigo">${esc(t.ia.erro)}</span>` : ""}
          ${t.publicadoEm ? `<span class="sm-chip ok">Publicado em ${new Date(t.publicadoEm).toLocaleString("pt-BR")}</span>` : ""}
        </div>
      </div>
      ${ordem().filter(p => p === "ee" || p === "eo").map(blocoProva).join("")}
      <div class="sm-card" style="display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end;">
        <span class="sm-muted" id="sSalvoMsg" style="flex:1;align-self:center;"></span>
        <button class="sm-btn secundario" type="button" id="bSalvarNotas">Salvar rascunho</button>
        <button class="sm-btn" type="button" id="bPublicar" ${t.status === "em_andamento" ? "disabled title='Disponível quando o aluno terminar'" : ""}>${t.publicadoEm ? "Republicar correção" : "Publicar correção para o aluno"}</button>
      </div>`;
    document.querySelectorAll("[data-prova-nota]").forEach(card => {
      card.addEventListener("input", () => recalcular(card));
      card.addEventListener("change", () => recalcular(card));
      recalcular(card);
    });
    const bU = $("bUsarIA");
    if (bU) bU.addEventListener("click", () => preencher(S.t.sugestaoIA));
    const bG = $("bGerarIA");
    if (bG) bG.addEventListener("click", async () => {
      bG.disabled = true; bG.textContent = "IA corrigindo… (1–3 min)";
      try { await api(`/api/simulados/tentativas/${t._id}/corrigir-ia`, { method: "POST" }); }
      catch (err) { aviso(err.message); bG.disabled = false; }
    });
    $("bSalvarNotas").addEventListener("click", () => salvarNotas(false));
    $("bPublicar").addEventListener("click", () => modal("Publicar a correção?", "<p>O aluno verá imediatamente o boletim completo (CO, CE, EE e EO) com seus comentários.</p>", [
      { texto: "Cancelar", classe: "secundario" }, { texto: "Publicar", fn: () => salvarNotas(true) }
    ]));
  }

  // Exercícios do Ambiente de Produção mostram a nota convertida para a escala da prova do curso
  // (o servidor faz a mesma conversão ao salvar — ver backend/utils/simulados.js).
  function rotuloNota(final) {
    const d = S.def || {};
    if (d.categoria !== "exercicio" || d.curso === "TCF") return `${final}/20 · ${nivelExpressao(final)} · NCLC ${nclcExpressao(final)}`;
    if (d.curso === "DELF" || d.curso === "DALF") {
      const n = Math.round((final / 20) * 25 * 2) / 2;
      return `${final}/20 → ${String(n).replace(".", ",")}/25 · ${n >= 12.5 ? "seção aprovada" : "abaixo de 12,5"}`;
    }
    if (d.curso === "TEF") return `${final}/20 → TEF ${Math.round((final / 20) * 450)}/450`;
    return `${final}/20 · ${nivelExpressao(final)}`;
  }

  function lerProva(card) {
    const p = card.dataset.provaNota;
    const tarefas = {};
    card.querySelectorAll("[data-tarefa]").forEach(el => {
      const criterios = {};
      el.querySelectorAll("[data-crit]").forEach(s => { criterios[s.dataset.crit] = Number(s.value); });
      tarefas[el.dataset.tarefa] = { criterios, comentario: el.querySelector("[data-coment]").value };
    });
    const final = card.querySelector("[data-final]").value;
    return { p, dados: { tarefas, nota: final === "" ? null : Number(final), comentario: card.querySelector("[data-coment-geral]").value } };
  }

  function recalcular(card) {
    const notas = [];
    card.querySelectorAll("[data-tarefa]").forEach(el => {
      const soma = [...el.querySelectorAll("[data-crit]")].reduce((s, x) => s + Number(x.value), 0);
      notas.push(soma);
      el.querySelector("[data-nota-tarefa]").textContent = `${String(soma).replace(".", ",")}/20`;
    });
    const media = Math.round(notas.reduce((s, n) => s + n, 0) / notas.length);
    const finalEl = card.querySelector("[data-final]");
    const final = finalEl.value === "" ? media : Math.max(0, Math.min(20, Math.round(Number(finalEl.value))));
    card.querySelector("[data-media]").textContent = `${media}/20`;
    card.querySelector("[data-resultado]").textContent = rotuloNota(final);
  }

  function preencher(sug) {
    if (!sug) return;
    document.querySelectorAll("[data-prova-nota]").forEach(card => {
      const r = sug[card.dataset.provaNota];
      if (!r) return;
      card.querySelectorAll("[data-tarefa]").forEach(el => {
        const rt = r.tarefas?.[el.dataset.tarefa];
        if (!rt) return;
        el.querySelectorAll("[data-crit]").forEach(s => { s.value = String(rt.criterios?.[s.dataset.crit] ?? 0); });
        el.querySelector("[data-coment]").value = rt.comentario || "";
      });
      card.querySelector("[data-final]").value = "";
      card.querySelector("[data-coment-geral]").value = r.comentario || "";
      recalcular(card);
    });
    $("sSalvoMsg").textContent = "Sugestão da IA aplicada — revise e publique.";
  }

  async function salvarNotas(publicar) {
    const body = { publicar };
    document.querySelectorAll("[data-prova-nota]").forEach(card => { const { p, dados } = lerProva(card); body[p] = dados; });
    try {
      S.t = await api(`/api/simulados/tentativas/${S.t._id}/notas`, { method: "POST", body });
      S.def = S.t.definicao;
      $("sSalvoMsg").textContent = publicar ? "Correção publicada ✓ — o aluno já pode ver." : `Rascunho salvo às ${new Date().toLocaleTimeString("pt-BR")}.`;
      if (publicar) { renderCabecalho(); renderCorrecao(); $("sSalvoMsg").textContent = "Correção publicada ✓ — o aluno já pode ver."; }
    } catch (err) { aviso(err.message); }
  }

  // ---------------- eventos da tentativa ----------------
  function aoEventoSessao(nome, d) {
    if (!S.t) return;
    if (nome === "progresso") {
      const e = S.t.provas[d.prova];
      if (!e) return;
      if (d.respostas) e.respostas = d.respostas;
      if (d.ouvidos) e.ouvidos = d.ouvidos;
      if (d.questaoAtual != null) e.questaoAtual = d.questaoAtual;
      if (d.etapaEO) { S.etapaEO = d.etapaEO; S.perguntaEO = d.perguntaEO ?? (/falando/.test(d.etapaEO) ? 0 : null); }
      else if (d.perguntaEO != null) S.perguntaEO = d.perguntaEO;
      renderAoVivo();
    } else if (nome === "mensagem") {
      S.t.mensagens.push(d.mensagem);
      renderMensagens();
      if (d.mensagem.autor === "aluno") bip();
    } else if (nome === "conexao") {
      if (d.conexao) S.t.conexao = d.conexao;
      if (d.modoCorrecao) S.t.modoCorrecao = d.modoCorrecao;
      (d.mensagens || []).forEach(m => S.t.mensagens.push(m));
      renderCabecalho();
      renderMensagens();
    } else if (nome === "sinal") {
      S.chamada && S.chamada.receber(d);
    } else if (nome === "status" || nome === "controle" || nome === "eo-audio") {
      recarregarSessao();
    } else if (nome === "corrigido") {
      recarregarSessao().then(() => {
        const bG = $("bGerarIA");
        if (bG) { bG.disabled = false; }
        // Sugestão nova da IA: habilita o botão sem apagar o que o professor já digitou.
        if (S.t.sugestaoIA && !$("bUsarIA")) renderCorrecaoPreservando();
      });
    }
  }

  function renderCorrecaoPreservando() {
    const antes = {};
    document.querySelectorAll("[data-prova-nota]").forEach(card => { const { p, dados } = lerProva(card); antes[p] = dados; });
    renderCorrecao();
    document.querySelectorAll("[data-prova-nota]").forEach(card => {
      const r = antes[card.dataset.provaNota];
      if (!r) return;
      card.querySelectorAll("[data-tarefa]").forEach(el => {
        const rt = r.tarefas[el.dataset.tarefa];
        el.querySelectorAll("[data-crit]").forEach(s => { s.value = String(rt.criterios[s.dataset.crit]); });
        el.querySelector("[data-coment]").value = rt.comentario;
      });
      card.querySelector("[data-final]").value = r.nota == null ? "" : r.nota;
      card.querySelector("[data-coment-geral]").value = r.comentario;
      recalcular(card);
    });
    $("sSalvoMsg").textContent = "Sugestão da IA pronta — use “Preencher com a sugestão da IA”.";
  }

  // ---------------- chat + chamada ----------------
  function renderMensagens() {
    const box = $("dockMsgs");
    const msgs = S.t?.mensagens || [];
    box.innerHTML = msgs.length ? msgs.map(m => m.autor === "sistema"
      ? `<div class="sm-msg sistema">${esc(m.texto)}</div>`
      : `<div class="sm-msg ${m.autor === "professor" ? "minha" : ""}"><small>${m.autor === "aluno" ? "Aluno" : esc(m.autorNome || "Professor")}</small>${esc(m.texto)}</div>`).join("")
      : `<div class="sm-msg sistema">Nenhuma mensagem ainda.</div>`;
    box.scrollTop = box.scrollHeight;
  }

  $("dockForm").addEventListener("submit", async ev => {
    ev.preventDefault();
    const input = $("dockInput");
    const texto = input.value.trim();
    if (!texto || !S.t) return;
    input.value = "";
    try { await api(`/api/simulados/tentativas/${S.t._id}/mensagens`, { method: "POST", body: { texto } }); }
    catch (err) { aviso(err.message); }
  });

  function renderChamada(estado, detalhe) {
    const box = $("dockChamada");
    if (!box) return;
    if (estado === "chamando") {
      box.innerHTML = `<span>📞 Chamando o aluno…</span><button class="sm-btn perigo pequeno" type="button" id="chCancelar">Cancelar</button>`;
      $("chCancelar").addEventListener("click", () => S.chamada.encerrar(true));
    } else if (estado === "conectando" || estado === "conectada" || estado === "instavel") {
      box.innerHTML = `<span>${estado === "conectada" ? "🟢 Em chamada" : estado === "instavel" ? "🟠 Instável…" : "Conectando o áudio…"}</span><button class="sm-btn secundario pequeno" type="button" id="chMudo">Mudo</button><button class="sm-btn perigo pequeno" type="button" id="chDesligar">Desligar</button>`;
      let mudo = false;
      $("chMudo").addEventListener("click", ev => { mudo = !mudo; S.chamada.mudo(mudo); ev.target.textContent = mudo ? "Reativar som" : "Mudo"; });
      $("chDesligar").addEventListener("click", () => S.chamada.encerrar(true));
    } else {
      const conectado = S.t?.conexao?.status === "ativa";
      box.innerHTML = `${detalhe ? `<span class="sm-muted" style="width:100%;">${esc(detalhe)}</span>` : ""}<button class="sm-btn pequeno" type="button" id="chLigar" ${conectado ? "" : "disabled title='Conecte-se ao aluno primeiro'"}>📞 Ligar para o aluno (voz)</button>`;
      $("chLigar").addEventListener("click", () => S.chamada.ligar());
    }
  }

  // =====================================================================
  // BOOT
  // =====================================================================
  const esperarGate = setInterval(async () => {
    if (document.body.style.visibility !== "visible" || !window.__eu) return;
    clearInterval(esperarGate);
    if ("Notification" in window && Notification.permission === "default") {
      document.addEventListener("click", () => Notification.requestPermission().catch(() => {}), { once: true });
    }
    await carregarPainel();
    ligarStreamPainel();
    const id = new URLSearchParams(location.search).get("t");
    if (id && /^[a-f0-9]{24}$/i.test(id)) abrirSessao(id);
    setInterval(() => { if (!$("vPainel").hidden) renderPainel(); }, 30000); // atualiza os "há X min"
  }, 100);

})();
