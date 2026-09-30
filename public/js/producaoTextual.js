// PRODUÇÃO TEXTUAL — galeria de temas, espaço de escrita com a coletânea, envio (IA ou
// professor), minhas redações e resultado pela grade oficial da prova.
(async function () {
  const { conta, curso } = await window.ProducaoGate.pronto;
  const token = localStorage.getItem("token");
  const H = { Authorization: "Bearer " + token };
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const $ = id => document.getElementById(id);
  const NOMES = { TCF: "TCF", DELF: "DELF", DALF: "DALF", TEF: "TEF", A1: "Francês A1", A2: "Francês A2", B1: "Francês B1", B2: "Francês B2" };
  const GENERO = { trecho_livro: "Trecho de livro", noticia: "Reportagem", artigo_cientifico: "Artigo científico", artigo: "Artigo", entrevista: "Entrevista", documento_oficial: "Documento", estatistica: "Dados", tabela: "Tabela" };
  const contarPalavras = t => (String(t || "").match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || []).length;
  const fmtData = d => d ? new Date(d).toLocaleDateString("pt-BR") : "—";

  let temas = [], producoes = [], creditos = conta.creditosCorrecao || 0;
  let temaAtual = null, grade = null, iaDisponivel = false, filtroNivel = "", filtroStatus = "";
  let relogioInicio = 0, relogioTimer = null, pollTimer = null;

  $("linkHub").href = "producao.html?curso=" + encodeURIComponent(curso);
  $("eyebrowTemas").textContent = "Produção textual · " + NOMES[curso];

  // ===================== NAVEGAÇÃO =====================
  function mostrar(view) {
    document.querySelectorAll("[data-view]").forEach(s => { s.hidden = s.dataset.view !== view; });
    if (view !== "tema") pararRelogio();
    if (view !== "resultado") clearTimeout(pollTimer);
    window.scrollTo(0, 0);
  }
  function ir(view, extra = {}, empilhar = true) {
    const url = new URL(location.href);
    ["tema", "producao", "aba"].forEach(k => url.searchParams.delete(k));
    url.searchParams.set("curso", curso);
    if (view === "tema") url.searchParams.set("tema", extra.id);
    if (view === "resultado") url.searchParams.set("producao", extra.id);
    if (view === "minhas") url.searchParams.set("aba", "minhas");
    if (empilhar) history.pushState({}, "", url);
    rotear();
  }
  function rotear() {
    const p = new URLSearchParams(location.search);
    if (p.get("tema")) return abrirTema(p.get("tema"));
    if (p.get("producao")) return abrirResultado(p.get("producao"));
    if (p.get("aba") === "minhas") { mostrar("minhas"); return renderMinhas(); }
    mostrar("temas"); renderGaleria();
  }
  window.addEventListener("popstate", rotear);
  document.addEventListener("click", e => {
    const alvo = e.target.closest("[data-ir]");
    if (!alvo) return;
    e.preventDefault();
    ir(alvo.dataset.ir);
  });

  // ===================== DADOS =====================
  async function carregar() {
    const [t, p, cfg, g] = await Promise.all([
      fetch("/api/temas?modalidade=textual&courseType=" + encodeURIComponent(curso), { headers: H }).then(r => r.ok ? r.json() : []),
      fetch("/api/producoes/minhas?courseType=" + encodeURIComponent(curso), { headers: H }).then(r => r.ok ? r.json() : []),
      fetch("/api/producoes/config", { headers: H }).then(r => r.ok ? r.json() : {}),
      fetch("/api/producoes/grade/" + encodeURIComponent(curso), { headers: H }).then(r => r.ok ? r.json() : null)
    ]);
    temas = t; producoes = p.filter(x => x.modalidade !== "oral"); iaDisponivel = !!cfg.iaDisponivel; grade = g;
  }
  function ultimaDoTema(id) {
    return producoes.filter(p => String(p.temaId?._id || p.temaId) === String(id)).sort((a, b) => new Date(b.dataEnvio) - new Date(a.dataEnvio))[0];
  }
  function statusTema(id) {
    const p = ultimaDoTema(id);
    if (!p) return '<span class="pr-status novo">Novo</span>';
    if (["corrigido", "devolvido"].includes(p.status)) return `<span class="pr-status feito">Corrigida · ${p.avaliacao?.notaTotal ?? "—"}/${p.avaliacao?.notaMaxima || grade?.notaMaxima || 20}</span>`;
    return `<span class="pr-status andamento">${p.modoCorrecao === "ia" ? "Corrigindo (IA)" : "Com o professor"}</span>`;
  }

  // ===================== GALERIA =====================
  function renderStats() {
    const corrigidas = producoes.filter(p => ["corrigido", "devolvido"].includes(p.status));
    const media = corrigidas.length ? corrigidas.reduce((t, p) => t + (p.avaliacao?.notaTotal || 0) / (p.avaliacao?.notaMaxima || 20), 0) / corrigidas.length : null;
    $("statsTemas").innerHTML = `
      <div class="pr-stat creditos"><strong>${creditos}</strong><span>créditos</span></div>
      <div class="pr-stat"><strong>${temas.length}</strong><span>temas</span></div>
      <div class="pr-stat"><strong>${producoes.length}</strong><span>enviadas</span></div>
      <div class="pr-stat"><strong>${media === null ? "—" : Math.round(media * (grade?.notaMaxima || 20) * 10) / 10 + "/" + (grade?.notaMaxima || 20)}</strong><span>média</span></div>`;
  }
  function renderGaleria() {
    renderStats();
    const niveis = [...new Set(temas.map(t => t.nivel))].sort();
    $("filtros").innerHTML = [["", "Todos os níveis"], ...niveis.map(n => [n, n])].map(([v, r]) => `<button class="pr-chip ${filtroNivel === v ? "active" : ""}" data-nivel="${v}">${r}</button>`).join("") +
      `<span style="width:10px"></span>` +
      [["", "Todos"], ["novo", "Ainda não fiz"], ["feito", "Corrigidos"]].map(([v, r]) => `<button class="pr-chip ${filtroStatus === v ? "active" : ""}" data-status="${v}">${r}</button>`).join("");
    const lista = temas.filter(t => (!filtroNivel || t.nivel === filtroNivel) && (!filtroStatus ||
      (filtroStatus === "novo" ? !ultimaDoTema(t._id) : ["corrigido", "devolvido"].includes(ultimaDoTema(t._id)?.status))));
    if (!temas.length) { $("gradeTemas").innerHTML = '<div class="pr-vazio">Os temas deste curso estão sendo preparados. Volte em breve!</div>'; return; }
    if (!lista.length) { $("gradeTemas").innerHTML = '<div class="pr-vazio">Nenhum tema com esses filtros.</div>'; return; }
    $("gradeTemas").innerHTML = lista.map(t => {
      const [a, b] = t.imagens || [];
      return `<button class="pr-tema" data-tema="${t._id}">
        <div class="capa">
          ${a ? `<img class="a" src="${esc(a.src)}" alt="${esc(a.legenda)}" loading="lazy">` : ""}
          ${b ? `<img class="b" src="${esc(b.src)}" alt="${esc(b.legenda)}" loading="lazy">` : ""}
          <div class="chips"><span class="chip nivel">${esc(t.nivel)}</span><span class="chip">${esc(t.tempoSugerido)} min</span></div>
          <span class="tipo-sobre">${esc(t.tipoProducao)}</span>
        </div>
        <div class="corpo">
          <h3>${esc(t.titulo)}</h3>
          <p class="desc">${esc(t.descricao)}</p>
          <div class="meta"><span>${t.limitePalavrasMin}–${t.limitePalavrasMax} palavras</span>${statusTema(t._id)}</div>
        </div>
      </button>`;
    }).join("");
  }
  $("filtros").addEventListener("click", e => {
    const n = e.target.closest("[data-nivel]"), s = e.target.closest("[data-status]");
    if (n) filtroNivel = n.dataset.nivel;
    if (s) filtroStatus = s.dataset.status;
    if (n || s) renderGaleria();
  });
  $("gradeTemas").addEventListener("click", e => {
    const c = e.target.closest("[data-tema]");
    if (c) ir("tema", { id: c.dataset.tema });
  });

  // ===================== ESPAÇO DE ESCRITA =====================
  async function abrirTema(id) {
    mostrar("tema");
    const res = await fetch("/api/temas/" + encodeURIComponent(id), { headers: H });
    if (!res.ok) { ir("temas"); return; }
    temaAtual = await res.json();
    const t = temaAtual;
    $("chipsTema").innerHTML = `<span class="pr-chip active">${esc(t.nivel)}</span><span class="pr-chip">${esc(t.tipoProducao)}</span><span class="pr-chip">${t.tempoSugerido} min</span><span class="pr-chip">${t.limitePalavrasMin}–${t.limitePalavrasMax} palavras</span>`;
    $("tituloTema").textContent = t.titulo;
    $("descTema").textContent = t.descricao;
    $("consigneTema").textContent = t.instrucoes;
    $("imgsTema").innerHTML = (t.imagens || []).map((im, i) => `<figure data-img="${i}"><img src="${esc(im.src)}" alt="${esc(im.legenda)}"><figcaption>${esc(im.legenda)}</figcaption></figure>`).join("");
    // coletânea: 3 documentos + imagens
    const abas = (t.coletanea || []).map((d, i) => `<button class="pr-col-aba ${i === 0 ? "active" : ""}" data-doc="${i}">Documento ${i + 1}<small>${esc(GENERO[d.tipo] || d.tipo)}</small></button>`);
    if ((t.imagens || []).length) abas.push(`<button class="pr-col-aba" data-doc="img">Imagens<small>${t.imagens.length} fotos</small></button>`);
    $("colAbas").innerHTML = abas.join("");
    mostrarDoc(0);
    // texto: rascunho salvo, ou a última redação deste tema para reescrever
    const chave = "rascunho:" + t._id;
    let rascunho = "";
    try { rascunho = localStorage.getItem(chave) || ""; } catch (e) { /* armazenamento indisponível */ }
    $("editor").value = rascunho;
    $("infoRascunho").textContent = rascunho ? "Rascunho recuperado" : "";
    atualizarContador();
    // correção
    const podeIA = iaDisponivel;
    document.querySelectorAll(".pr-modo").forEach(m => {
      const ia = m.dataset.modo === "ia";
      m.classList.toggle("off", ia && !podeIA);
      m.querySelector("input").disabled = ia && !podeIA;
    });
    selecionarModo(podeIA ? "ia" : "professor");
    $("gradeLista").innerHTML = grade ? grade.criterios.map(c => `<li><strong>${esc(c.nome)}</strong> (até ${c.max} pts) — ${esc(c.descricao)}</li>`).join("") +
      `<li>Nota final sobre ${grade.notaMaxima}${grade.exame !== curso ? ` (modelo ${grade.exame})` : ""}.</li>` : "";
    $("msgEnvio").hidden = true;
    atualizarCusto(); // habilita/desabilita o envio conforme os créditos
    iniciarRelogio();
  }
  function mostrarDoc(i) {
    const t = temaAtual;
    document.querySelectorAll("#colAbas .pr-col-aba").forEach(b => b.classList.toggle("active", String(b.dataset.doc) === String(i)));
    if (i === "img") {
      $("colDoc").innerHTML = t.imagens.map((im, k) => `<figure><img src="${esc(im.src)}" alt="${esc(im.legenda)}" data-img="${k}">
        <figcaption>${esc(im.legenda)}<small>Foto: ${esc(im.credito?.autor || "")} · ${esc(im.credito?.licenca || "")} · <a href="${esc(im.credito?.fonte || "#")}" target="_blank" rel="noopener">Wikimedia Commons</a></small></figcaption></figure>`).join("");
      return;
    }
    const d = t.coletanea[i];
    $("colDoc").innerHTML = `<span class="genero">${esc(GENERO[d.tipo] || d.tipo)}</span><h3>${esc(d.titulo)}</h3>
      <div class="texto ${d.tipo === "trecho_livro" ? "livro" : ""}">${esc(d.conteudo).replace(/\n/g, "<br>")}</div>
      ${d.fonte ? `<p class="fonte">${esc(d.fonte)}</p>` : ""}`;
    $("colDoc").scrollTop = 0;
  }
  $("colAbas").addEventListener("click", e => {
    const b = e.target.closest("[data-doc]");
    if (b) mostrarDoc(b.dataset.doc === "img" ? "img" : Number(b.dataset.doc));
  });
  $("toggleColetanea").addEventListener("click", () => {
    const esconde = !$("mesa").classList.contains("sem-coletanea");
    $("mesa").classList.toggle("sem-coletanea", esconde);
    $("toggleColetanea").textContent = esconde ? "Mostrar coletânea" : "Esconder coletânea";
  });
  $("fabColetanea").addEventListener("click", () => { $("coletanea").classList.add("aberta"); $("fecharColetaneaMobile").style.display = "inline-flex"; });
  $("fecharColetaneaMobile").addEventListener("click", () => $("coletanea").classList.remove("aberta"));

  // lightbox com crédito
  document.addEventListener("click", e => {
    const f = e.target.closest("[data-img]");
    if (!f || !temaAtual) return;
    const im = temaAtual.imagens[Number(f.dataset.img)];
    const lb = $("lightbox");
    lb.querySelector("img").src = im.src;
    lb.querySelector("p").innerHTML = `${esc(im.legenda)} — Foto: ${esc(im.credito?.autor || "")} (${esc(im.credito?.licenca || "")}), <a href="${esc(im.credito?.fonte || "#")}" target="_blank" rel="noopener">Wikimedia Commons</a>`;
    lb.classList.add("show");
  });
  $("lightbox").addEventListener("click", e => { if (e.target.tagName !== "A") $("lightbox").classList.remove("show"); });

  function atualizarContador() {
    const t = temaAtual;
    const n = contarPalavras($("editor").value);
    const el = $("contador");
    el.textContent = `${n} palavra${n === 1 ? "" : "s"} · pedido: ${t.limitePalavrasMin}–${t.limitePalavrasMax}`;
    el.classList.toggle("ok", n >= t.limitePalavrasMin && n <= t.limitePalavrasMax);
    el.classList.toggle("fora", n > t.limitePalavrasMax);
    $("medidor").style.width = Math.min(100, (n / t.limitePalavrasMax) * 100) + "%";
  }
  let salvarTimer = null;
  $("editor").addEventListener("input", () => {
    atualizarContador();
    clearTimeout(salvarTimer);
    salvarTimer = setTimeout(() => {
      try { localStorage.setItem("rascunho:" + temaAtual._id, $("editor").value); $("infoRascunho").textContent = "Rascunho salvo neste navegador"; } catch (e) { /* sem armazenamento */ }
    }, 600);
  });
  function iniciarRelogio() {
    pararRelogio();
    relogioInicio = Date.now();
    relogioTimer = setInterval(() => {
      const s = Math.floor((Date.now() - relogioInicio) / 1000);
      const alvo = (temaAtual?.tempoSugerido || 0) * 60;
      $("relogio").textContent = `⏱ ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` + (alvo ? ` / ${temaAtual.tempoSugerido}:00` : "");
      $("relogio").classList.toggle("active", alvo && s > alvo);
    }, 1000);
  }
  function pararRelogio() { clearInterval(relogioTimer); }

  function selecionarModo(modo) {
    document.querySelectorAll(".pr-modo").forEach(m => {
      const sel = m.dataset.modo === modo;
      m.classList.toggle("sel", sel);
      m.querySelector("input").checked = sel;
    });
    $("obs").hidden = modo !== "professor";
  }
  $("modos").addEventListener("click", e => {
    const m = e.target.closest(".pr-modo");
    if (m && !m.classList.contains("off")) selecionarModo(m.dataset.modo);
  });
  function atualizarCusto() {
    const custo = temaAtual.creditosNecessarios || 1;
    $("custo").innerHTML = creditos >= custo
      ? `Usa ${custo} crédito${custo > 1 ? "s" : ""} · você tem <strong>${creditos}</strong>`
      : `<span style="color:var(--danger-text); font-weight:700;">Você não tem créditos suficientes (${creditos}).</span> Fale com seu professor para receber mais.`;
    $("enviarBtn").disabled = creditos < custo;
  }

  $("enviarBtn").addEventListener("click", async () => {
    const t = temaAtual;
    const texto = $("editor").value.trim();
    const n = contarPalavras(texto);
    const msg = $("msgEnvio");
    const erro = m => { msg.hidden = false; msg.className = "pr-msg erro"; msg.textContent = m; };
    if (n < t.limitePalavrasMin) return erro(`Seu texto tem ${n} palavras; o mínimo pedido é ${t.limitePalavrasMin}.`);
    if (n > t.limitePalavrasMax) return erro(`Seu texto tem ${n} palavras; o máximo é ${t.limitePalavrasMax}. Corte um pouco antes de enviar.`);
    const modo = document.querySelector('input[name="modo"]:checked')?.value || "professor";
    if (!confirm(`Enviar sua redação para correção ${modo === "ia" ? "pela IA" : "por um professor"}? Isso usa ${t.creditosNecessarios || 1} crédito.`)) return;
    $("enviarBtn").disabled = true;
    const form = new FormData();
    form.append("temaId", t._id);
    form.append("textoDigitado", texto);
    form.append("modoCorrecao", modo);
    if (modo === "professor" && $("obs").value.trim()) form.append("observacoesAluno", $("obs").value.trim());
    try {
      const res = await fetch("/api/producoes", { method: "POST", headers: H, body: form });
      const data = await res.json();
      if (!res.ok) { erro(data.msg || "Não foi possível enviar."); $("enviarBtn").disabled = false; return; }
      try { localStorage.removeItem("rascunho:" + t._id); } catch (e) { /* ok */ }
      creditos -= t.creditosNecessarios || 1;
      producoes.unshift({ ...data.producao, temaId: { _id: t._id, titulo: t.titulo, nivel: t.nivel, courseType: t.courseType } });
      ir("resultado", { id: data.producao._id });
    } catch (e) { erro("Erro de conexão. Seu texto continua salvo aqui."); $("enviarBtn").disabled = false; }
  });

  // ===================== MINHAS REDAÇÕES =====================
  function renderMinhas() {
    const el = $("listaMinhas");
    if (!producoes.length) { el.innerHTML = '<div class="pr-vazio">Você ainda não enviou nenhuma redação neste curso. <br><br><button class="pr-btn" data-ir="temas">Escolher um tema</button></div>'; return; }
    el.innerHTML = producoes.map(p => {
      const t = temas.find(x => x._id === String(p.temaId?._id || p.temaId)) || p.temaId || {};
      const img = t.imagens?.[0]?.src;
      const corrigida = ["corrigido", "devolvido"].includes(p.status);
      return `<button class="pr-prod" data-prod="${p._id}">
        ${img ? `<img src="${esc(img)}" alt="">` : "<span></span>"}
        <div><strong>${esc(t.titulo || "Tema")}</strong><small>${fmtData(p.dataEnvio)} · ${p.contagemPalavras || "—"} palavras · ${p.modoCorrecao === "ia" ? "correção por IA" : "correção por professor"}</small></div>
        ${corrigida ? `<span class="pr-nota">${p.avaliacao?.notaTotal ?? "—"}/${p.avaliacao?.notaMaxima || 20}</span>` : `<span class="pr-status andamento">${p.modoCorrecao === "ia" && p.status === "em_correcao" ? "Corrigindo…" : "Com o professor"}</span>`}
      </button>`;
    }).join("");
  }
  $("listaMinhas").addEventListener("click", e => {
    const b = e.target.closest("[data-prod]");
    if (b) ir("resultado", { id: b.dataset.prod });
  });

  // ===================== RESULTADO =====================
  async function abrirResultado(id) {
    mostrar("resultado");
    clearTimeout(pollTimer);
    const res = await fetch("/api/producoes/" + encodeURIComponent(id), { headers: H });
    if (!res.ok) { $("resultado").innerHTML = '<div class="pr-vazio">Redação não encontrada.</div>'; return; }
    const p = await res.json();
    const idx = producoes.findIndex(x => x._id === p._id);
    if (idx >= 0) producoes[idx] = p; else producoes.unshift(p);
    renderResultado(p);
    if (!["corrigido", "devolvido"].includes(p.status) && p.modoCorrecao === "ia") pollTimer = setTimeout(() => abrirResultado(id), 4000);
  }
  function renderResultado(p) {
    const t = p.temaId || {};
    const av = p.avaliacao || {};
    const corrigida = ["corrigido", "devolvido"].includes(p.status);
    const topo = `<div class="pr-hero" style="padding:24px 28px;"><div class="eyebrow">${esc(t.courseType || curso)} · ${esc(t.nivel || "")} · protocolo ${esc(p.protocolo)}</div><h1 style="font-size:1.9rem;">${esc(t.titulo)}</h1><p>Enviada em ${new Date(p.dataEnvio).toLocaleString("pt-BR")} · ${p.contagemPalavras || "—"} palavras</p></div>`;
    const texto = `<div class="pr-caixa" style="margin-top:18px;"><h2 style="font-size:1.25rem; margin-bottom:10px;">Sua redação</h2><div class="pr-texto-aluno">${esc(p.textoDigitado || "(arquivo anexado)")}</div></div>`;
    const msgs = `<div class="pr-caixa pr-msgs" style="margin-top:18px;"><h2 style="font-size:1.25rem; margin-bottom:10px;">Conversa com o professor</h2>
      ${(p.mensagens || []).map(m => `<div class="m ${m.autor === "professor" ? "prof" : ""}"><strong>${m.autor === "professor" ? "Professor" : "Você"}</strong> · ${fmtData(m.data)}<br>${esc(m.texto)}</div>`).join("") || '<p style="font-size:.85rem; opacity:.75;">Nenhuma mensagem ainda.</p>'}
      <textarea class="pr-obs" id="novaMsg" placeholder="Escreva uma dúvida para o professor…" style="margin-top:10px;"></textarea>
      <button class="pr-btn peq" id="enviarMsg" data-prod="${p._id}" type="button">Enviar mensagem</button></div>`;
    if (!corrigida) {
      $("resultado").innerHTML = topo + `<div class="pr-caixa pr-esperando">${p.modoCorrecao === "ia"
        ? '<div class="spin"></div><h2>A IA está corrigindo a sua redação…</h2><p>Isso costuma levar menos de um minuto. Esta página se atualiza sozinha.</p>'
        : `<h2>Sua redação está com o professor</h2><p>Prazo estimado: <strong>${fmtData(p.prazoEstimado)}</strong>. Você será avisado quando a correção chegar.</p>`}</div>` + texto + msgs;
      return;
    }
    const pct = av.notaMaxima ? Math.round((av.notaTotal / av.notaMaxima) * 100) : 0;
    $("resultado").innerHTML = topo + `<div class="pr-resultado">
      <div class="pr-caixa pr-placar">
        <div class="pr-anel" style="--p:${pct}"><div><span><strong>${av.notaTotal ?? "—"}</strong><br><small>de ${av.notaMaxima || 20}</small></span></div></div>
        <div class="pr-nivel">${esc(av.nivelEstimado || "")}</div>
        ${av.nclc ? `<div style="margin-top:4px; font-weight:700;">NCLC ${esc(av.nclc)}</div>` : ""}
        <p style="margin-top:10px; font-size:.8rem; opacity:.75;">Corrigida ${av.corretor === "ia" ? "pela IA" : "por " + esc(av.corretorNome || "professor")} em ${fmtData(p.dataCorrecao)} · grade ${esc(av.exame || grade?.exame || "")}</p>
        <button class="pr-btn sec peq" style="margin-top:12px;" data-reescrever="${esc(t._id)}" type="button">Reescrever este tema</button>
      </div>
      <div class="pr-caixa">
        <h2 style="font-size:1.3rem; margin-bottom:14px;">Avaliação por critério</h2>
        ${(av.criterios || []).map(c => `<div class="pr-crit"><div class="topo"><span>${esc(c.nome)}</span><span>${c.nota}${c.max ? " / " + c.max : ""}</span></div><div class="barra"><span style="width:${c.max ? (c.nota / c.max) * 100 : c.nota * 20}%"></span></div>${c.comentario ? `<p>${esc(c.comentario)}</p>` : ""}</div>`).join("")}
        ${av.comentarioGeral ? `<h3 style="margin:16px 0 6px;">Comentário geral</h3><p style="line-height:1.6;">${esc(av.comentarioGeral)}</p>` : ""}
        ${(av.pontosFortes?.length || av.aMelhorar?.length) ? `<div class="pr-duas-col" style="margin-top:14px;"><div><h3 style="font-size:1rem;">Pontos fortes</h3><ul>${(av.pontosFortes || []).map(x => `<li>${esc(x)}</li>`).join("")}</ul></div><div><h3 style="font-size:1rem;">A melhorar</h3><ul>${(av.aMelhorar || []).map(x => `<li>${esc(x)}</li>`).join("")}</ul></div></div>` : ""}
      </div>
    </div>
    ${av.correcoes?.length ? `<div class="pr-caixa" style="margin-top:18px;"><h2 style="font-size:1.25rem; margin-bottom:10px;">Correções linha a linha</h2>${av.correcoes.map(c => `<div class="pr-correcao"><span class="errado">${esc(c.trecho)}</span><span class="certo">${esc(c.correcao)}</span>${c.explicacao ? `<span class="porque">${esc(c.explicacao)}</span>` : ""}</div>`).join("")}</div>` : ""}` + texto + msgs;
  }
  $("resultado").addEventListener("click", async e => {
    const r = e.target.closest("[data-reescrever]");
    if (r) {
      const antiga = producoes.find(p => String(p.temaId?._id || p.temaId) === r.dataset.reescrever);
      try { if (antiga?.textoDigitado) localStorage.setItem("rascunho:" + r.dataset.reescrever, antiga.textoDigitado); } catch (err) { /* ok */ }
      ir("tema", { id: r.dataset.reescrever });
      return;
    }
    const b = e.target.closest("#enviarMsg");
    if (b) {
      const texto = $("novaMsg").value.trim();
      if (!texto) return;
      b.disabled = true;
      const res = await fetch(`/api/producoes/${b.dataset.prod}/mensagens`, { method: "POST", headers: { ...H, "Content-Type": "application/json" }, body: JSON.stringify({ texto }) });
      if (res.ok) abrirResultado(b.dataset.prod); else b.disabled = false;
    }
  });

  await carregar();
  rotear();
})();
