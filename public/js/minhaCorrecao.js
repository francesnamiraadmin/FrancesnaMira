// Minha correção (minha-correcao.html?producao=<id>): o resultado de uma produção — nota, critérios
// da grade da prova, o texto (ou a gravação) com as marcações do professor, feedback global,
// extras da correção pela IA e a conversa com o professor.
(function () {
  const raiz = document.getElementById("minhaCorrecao");
  const id = new URLSearchParams(location.search).get("producao");
  const H = json => Object.assign({ Authorization: "Bearer " + localStorage.getItem("token") }, json ? { "Content-Type": "application/json" } : {});
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = d => d ? new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
  const TAREFA = { T1: "Oral · Tarefa 1", T2: "Oral · Tarefa 2", T3: "Oral · Tarefa 3", ET1: "Escrita · Tarefa 1", ET2: "Escrita · Tarefa 2", ET3: "Escrita · Tarefa 3" };
  const voltar = '<p class="mc-voltar"><a href="meu-espaco.html#producoes">← Meu Espaço</a> · <a href="producao.html">Ambiente de Produção</a></p>';
  const lista = (tit, l) => l && l.length ? `<h3 style="margin-top:14px;">${tit}</h3><ul class="mc-lista">${l.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : "";

  function render(p) {
    const t = p.temaId || {}, av = p.avaliacao || {}, est = p.estadoCorrecao || {};
    const devolvida = ["corrigido", "devolvido"].includes(p.status);
    const pct = devolvida && av.notaMaxima ? Math.round(av.notaTotal / av.notaMaxima * 100) : null;
    const cor = pct == null ? "#64748b" : pct >= 70 ? "#16a34a" : pct >= 50 ? "#f59e0b" : "#dc2626";
    let html = voltar + `<section class="me-heroi" style="padding:24px 28px;"><div class="me-heroi-linha"><div class="me-ola"><small>${esc([t.courseType, t.nivel, TAREFA[p.origem?.tache]].filter(Boolean).join(" · "))} · protocolo ${esc(p.protocolo)}</small>
      <h1 style="font-size:1.9rem;">${esc(t.titulo || "Minha produção")}</h1><div class="me-chips"><span class="me-chip">${p.modalidade === "oral" ? "🎙️ Produção oral" : "✍️ Produção escrita"}</span>
      <span class="me-chip">📅 enviada em ${fmt(p.dataEnvio)}</span><span class="me-chip">● ${esc(est.rotulo || p.status)}</span></div></div></div></section>`;
    if (!devolvida) {
      html += `<div class="me-card c12" style="margin-top:18px;"><h3>${p.modoCorrecao === "ia" ? "A IA está corrigindo a sua produção…" : "Sua produção está com o professor"}</h3>
        <p>${p.modoCorrecao === "ia" ? "Isso costuma levar menos de um minuto. Esta página se atualiza sozinha." : `Prazo estimado: <b>${fmt(p.prazoEstimado)}</b>. Você será avisado quando a correção chegar.`}</p></div>`;
      if (p.textoDigitado) html += `<div class="me-card c12" style="margin-top:14px;"><h3>Seu texto</h3><div class="mc-texto" lang="fr">${esc(p.textoDigitado)}</div></div>`;
    } else {
      html += `<div class="me-grade" style="margin-top:18px;">
        <div class="me-card c4"><h3>Nota</h3><div class="mc-nota"><div class="me-anel" style="--p:${pct || 0};--c:${cor}"><i>${av.notaTotal ?? "—"}<small>/${av.notaMaxima || 20}</small></i></div>
          <div><b>${esc(av.nivelEstimado || "")}</b>${av.nclc ? `<br>NCLC ${esc(av.nclc)}` : ""}<br><small>Corrigida ${av.corretor === "ia" ? "pela IA" : "por " + esc(av.corretorNome || "professor")} em ${fmt(p.dataCorrecao)}</small></div></div></div>
        <div class="me-card c8"><h3>Avaliação por critério <small>${esc(av.exame ? "grade " + av.exame : "")}</small></h3><div class="me-barras">${(av.criterios || []).map((c, i) => `<div class="me-barra-l" style="--c:${["#2563eb", "#db2777", "#f59e0b", "#16a34a", "#7c3aed", "#0d9488", "#4f46e5"][i % 7]}"><span>${esc(c.nome)}</span>
          <div class="me-barra"><span style="width:${c.max ? Math.round((c.nota || 0) / c.max * 100) : 0}%"></span></div><b>${c.nota ?? "—"}${c.max ? "/" + c.max : ""}</b></div>${c.comentario ? `<p style="font-size:.8rem;margin:-4px 0 4px;opacity:.85;">${esc(c.comentario)}</p>` : ""}`).join("")}</div></div>
        <div class="me-card c12"><h3>Feedback do professor</h3>${av.comentarioGeral ? `<p style="line-height:1.6;">${esc(av.comentarioGeral)}</p>` : ""}
          <div class="me-duplas" style="margin-top:6px;"><div>${lista("Pontos fortes", av.pontosFortes)}</div><div>${lista("A melhorar", av.aMelhorar)}</div></div>
          ${lista("Recomendações de estudo", av.recomendacoes)}
          ${av.feedbackFinal ? `<div class="mc-final" style="margin-top:12px;"><b>Mensagem do professor</b><br>${esc(av.feedbackFinal)}</div>` : ""}</div>
      </div>
      <div id="mcAnotada" style="margin-top:14px;" hidden></div>
      <div class="me-card c12" id="mcTexto" style="margin-top:14px;"><h3>${p.modalidade === "oral" ? "Transcrição da sua fala" : "Seu texto"}</h3><div class="mc-texto" lang="fr">${esc(p.textoDigitado || p.transcricao || "(arquivo anexado)")}</div></div>
      ${(av.correcoes || []).length ? `<div class="me-card c12" id="mcCorrecoes" style="margin-top:14px;"><h3>Correções</h3>${av.correcoes.map(c => `<p style="margin:6px 0;"><span style="color:#dc2626;text-decoration:line-through;">${esc(c.trecho)}</span> → <b style="color:#16a34a;">${esc(c.correcao)}</b>${c.explicacao ? ` <small>· ${esc(c.explicacao)}</small>` : ""}</p>`).join("")}</div>` : ""}
      ${av.extras && av.extras.version_amelioree ? `<div class="me-card c12" style="margin-top:14px;"><h3>Versão melhorada <small>sugestão da correção</small></h3><div class="mc-texto" lang="fr">${esc(av.extras.version_amelioree)}</div>${av.extras.conseil ? `<div class="mc-final" style="margin-top:10px;"><b>Conselho</b><br>${esc(av.extras.conseil)}</div>` : ""}</div>` : ""}`;
    }
    html += `<div class="me-card c12 mc-msgs" style="margin-top:14px;"><h3>Conversa com o professor</h3>
      ${(p.mensagens || []).map(m => `<div class="mc-msg ${m.autor === "professor" ? "prof" : ""}"><b>${m.autor === "professor" ? "Professor" : "Você"}</b> · ${fmt(m.data)}<br>${esc(m.texto)}</div>`).join("") || '<p class="me-vazio" style="padding:8px;">Nenhuma mensagem ainda.</p>'}
      <textarea id="mcNovaMsg" placeholder="Escreva uma dúvida para o professor…" maxlength="5000"></textarea><button class="me-btn cheio" style="--c:#1c2b3a" id="mcEnviar" type="button">Enviar mensagem</button></div>`;
    raiz.innerHTML = html;
    if (devolvida && window.Correcao) Correcao.Aluno.montar(document.getElementById("mcAnotada"), p).then(tem => {
      if (!tem) return;
      ["mcTexto", "mcCorrecoes"].forEach(i => { const el = document.getElementById(i); if (el) el.hidden = true; });
    });
    document.getElementById("mcEnviar").addEventListener("click", async () => {
      const ta = document.getElementById("mcNovaMsg");
      if (!ta.value.trim()) return;
      const r = await fetch(`/api/producoes/${p._id}/mensagens`, { method: "POST", headers: H(true), body: JSON.stringify({ texto: ta.value }) });
      if (r.ok) carregar();
    });
    if (!devolvida && p.modoCorrecao === "ia") setTimeout(carregar, 5000);
  }

  async function carregar() {
    if (!id || !/^[a-f0-9]{24}$/i.test(id)) { raiz.innerHTML = voltar + '<div class="me-vazio">Produção não informada.</div>'; return; }
    const r = await fetch("/api/producoes/" + id, { headers: H() });
    if (!r.ok) { raiz.innerHTML = voltar + '<div class="me-vazio">Não foi possível abrir esta correção.</div>'; return; }
    render(await r.json());
  }
  carregar();
})();
