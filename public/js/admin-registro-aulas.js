// Sistema de Aulas → « Registro de Aulas »: todas as aulas particulares da grade (e as avulsas),
// dia a dia ou por aluno, com estado, observações, justificativa, atestado e reposição.
(function () {
  const token = localStorage.getItem("token");
  const H = json => Object.assign({ Authorization: "Bearer " + token }, json ? { "Content-Type": "application/json" } : {});
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const secao = document.querySelector('.secao[data-secao="registro"]');
  if (!secao) return;
  const $ = id => document.getElementById(id);

  const ESTADO = {
    prevista: { nome: "Prevista", cor: "var(--ra-prevista)" },
    registrar: { nome: "A registrar", cor: "var(--ra-registrar)" },
    realizada: { nome: "Realizada", cor: "var(--ra-realizada)" },
    falta: { nome: "Falta", cor: "var(--ra-falta)" },
    falta_justificada: { nome: "Falta justificada", cor: "var(--ra-justificada)" },
    cancelada_professor: { nome: "Cancelada pelo professor", cor: "var(--ra-cancelada)" },
    remarcada: { nome: "Remarcada", cor: "var(--ra-remarcada)" }
  };
  const chaveEstado = a => (a.aRegistrar ? "registrar" : a.estado);
  const pill = k => `<span class="ra-estado" style="--c:${ESTADO[k].cor}">${ESTADO[k].nome}</span>`;
  const DIA_MS = 864e5;
  const iso = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const fmtDia = s => new Date(s + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" });

  let dados = null, atalho = "semana", visao = "dias", filtroEstado = "", selecionadas = new Set(), carregando = false, deNovo = false;

  // ---------- período ----------
  function definirPeriodo(tipo, base) {
    const d = base ? new Date(base + "T12:00:00") : new Date();
    let de, ate;
    if (tipo === "mes") { de = new Date(d.getFullYear(), d.getMonth(), 1); ate = new Date(d.getFullYear(), d.getMonth() + 1, 0); }
    else if (tipo === "30") { ate = new Date(d); de = new Date(d.getTime() - 29 * DIA_MS); }
    else { const seg = (d.getDay() + 6) % 7; de = new Date(d.getTime() - seg * DIA_MS); ate = new Date(de.getTime() + 6 * DIA_MS); }
    $("raDe").value = iso(de); $("raAte").value = iso(ate);
  }
  function deslocar(sentido) {
    const de = new Date($("raDe").value + "T12:00:00"), ate = new Date($("raAte").value + "T12:00:00");
    if (atalho === "mes") { definirPeriodo("mes", iso(new Date(de.getFullYear(), de.getMonth() + sentido, 15))); return; }
    const dias = Math.round((ate - de) / DIA_MS) + 1;
    $("raDe").value = iso(new Date(de.getTime() + sentido * dias * DIA_MS));
    $("raAte").value = iso(new Date(ate.getTime() + sentido * dias * DIA_MS));
  }

  // ---------- dados ----------
  async function carregar() {
    if (carregando) { deNovo = true; return; }   // pedido durante uma carga: recarrega ao terminar
    carregando = true;
    try {
      const r = await fetch(`/api/horarios/admin/registro?de=${$("raDe").value}&ate=${$("raAte").value}`, { headers: H() });
      dados = r.ok ? await r.json() : null;
      if (!dados) { $("raConteudo").innerHTML = '<p class="ha-vazio">Não foi possível carregar o registro.</p>'; return; }
      const atual = $("raAluno").value;
      $("raAluno").innerHTML = '<option value="">Todos os alunos</option>' + dados.alunos.map(a => `<option value="${esc(a.chave)}" ${a.chave === atual ? "selected" : ""}>${esc(a.nome)}</option>`).join("");
      if ($("raEstado").options.length <= 1) $("raEstado").innerHTML = '<option value="">Todos os estados</option>' + Object.keys(ESTADO).map(k => `<option value="${k}">${ESTADO[k].nome}</option>`).join("");
      selecionadas.clear();
      desenhar();
    } finally { carregando = false; if (deNovo) { deNovo = false; carregar(); } }
  }
  function visiveis() {
    const aluno = $("raAluno").value, est = $("raEstado").value || filtroEstado, termo = $("raBusca").value.toLowerCase().trim();
    return dados.itens.filter(a => (!aluno || a.chave === aluno || (a.alunoId && dados.itens.some(b => b.chave === aluno && b.alunoId === a.alunoId))) &&
      (!est || chaveEstado(a) === est || (est === "cancelada_professor" && a.estado === "remarcada")) &&
      (!termo || [a.nome, a.curso, a.observacao, a.conteudo, a.justificativa].some(x => String(x || "").toLowerCase().includes(termo))));
  }

  // ---------- desenho ----------
  function desenhar() {
    const r = dados.resumo;
    const base = r.realizadas + r.faltas + r.justificadas;
    const presenca = base ? Math.round(r.realizadas / base * 100) : null;
    const kpi = (k, rot, n) => `<div class="ra-kpi ${filtroEstado === k ? "ativo" : ""}" style="--c:${ESTADO[k] ? ESTADO[k].cor : "var(--cinza-800)"}" data-kpi="${k}" title="Filtrar"><b>${n}</b><span>${rot}</span></div>`;
    $("raKpis").innerHTML = `<div class="ra-kpi anel"><div class="ra-anel" style="--p:${presenca || 0}"><i>${presenca == null ? "—" : presenca + "%"}</i></div><div><span>Presença no período</span><small style="font-size:.74rem;color:var(--cinza-400);">realizadas ÷ (realizadas + faltas)</small></div></div>` +
      kpi("", "Aulas no período", r.total) + kpi("realizada", "Realizadas", r.realizadas) + kpi("falta", "Faltas", r.faltas) +
      kpi("falta_justificada", "Justificadas", r.justificadas) + kpi("cancelada_professor", "Canceladas / remarcadas", r.canceladas) + kpi("registrar", "A registrar", r.aRegistrar);
    $("raAlerta").innerHTML = r.aRegistrar ? `<div class="ra-alerta"><span>⚠️ <b>${r.aRegistrar}</b> aula(s) já passaram e ainda não foram registradas.</span><button type="button" class="btn pequeno" data-kpi="registrar">Ver só as pendentes</button></div>` : "";
    $("raLegenda").innerHTML = Object.keys(ESTADO).map(k => `<span><i style="--c:${ESTADO[k].cor}"></i>${ESTADO[k].nome}</span>`).join("");
    const l = visiveis();
    if (!l.length) { $("raConteudo").innerHTML = '<p class="ha-vazio">Nenhuma aula neste período com estes filtros.</p>'; desenharLote(); return; }
    $("raConteudo").innerHTML = visao === "alunos" ? htmlAlunos(l) : htmlDias(l);
    desenharLote();
  }
  function htmlAula(a) {
    const k = chaveEstado(a), id = a.chave + "|" + a.data;
    return `<div class="ra-aula ${selecionadas.has(id) ? "sel" : ""}" style="--c:${ESTADO[k].cor}" data-aula="${esc(id)}">
      <div class="ra-hora"><input type="checkbox" data-sel aria-label="Selecionar" ${selecionadas.has(id) ? "checked" : ""}> ${esc(a.hora)}</div>
      <div class="ra-quem"><b>${esc(a.nome)}</b><small>${esc([a.curso, a.origem === "avulsa" ? (a.reposicaoDe ? "reposição" : "aula avulsa") : "grade semanal", a.professor ? "prof. " + a.professor : ""].filter(Boolean).join(" · "))}</small></div>
      ${a.conteudo || a.observacao || a.justificativa || a.atestado ? `<div class="ra-nota">${a.conteudo ? "📘 " + esc(a.conteudo.slice(0, 110)) + "<br>" : ""}${a.observacao ? "📝 " + esc(a.observacao.slice(0, 110)) + "<br>" : ""}${a.justificativa ? "💬 " + esc(a.justificativa.slice(0, 110)) + "<br>" : ""}${a.atestado ? '<span class="ra-clip">📎 atestado: ' + esc(a.atestado.nome) + "</span>" : ""}</div>` : ""}
      <div class="ra-aula-rodape">${pill(k)}<div class="ra-rapidos">
        <button type="button" class="ok" data-rapido="realizada" title="Aconteceu">✓ Realizada</button>
        <button type="button" class="no" data-rapido="falta" title="O aluno faltou">✗ Falta</button>
        <button type="button" data-atestado title="Anexar atestado">📎</button>
        <button type="button" data-detalhes title="Detalhes, justificativa e histórico">⋯</button></div></div></div>`;
  }
  function htmlDias(l) {
    const porDia = {};
    l.forEach(a => (porDia[a.dia] = porDia[a.dia] || []).push(a));
    return Object.keys(porDia).sort().map(d => `<div class="ra-dia"><div class="ra-dia-cab ${d === dados.hoje ? "hoje" : ""}"><h3>${esc(fmtDia(d))}</h3><small>${porDia[d].length} aula(s)</small></div>
      <div class="ra-aulas">${porDia[d].map(htmlAula).join("")}</div></div>`).join("");
  }
  function htmlAlunos(l) {
    const por = {};
    l.forEach(a => (por[a.nome] = por[a.nome] || []).push(a));
    return `<div style="overflow-x:auto;"><table class="ra-tabela"><thead><tr><th>Aluno</th><th>Aulas</th><th>Presença</th><th class="ra-esconder">Realizadas</th><th class="ra-esconder">Faltas</th><th class="ra-esconder">Justificadas</th><th>Trilha do período</th></tr></thead><tbody>` +
      Object.keys(por).sort().map(nome => {
        const x = por[nome], c = k => x.filter(a => a.estado === k).length;
        const base = c("realizada") + c("falta") + c("falta_justificada"), pres = base ? Math.round(c("realizada") / base * 100) : null;
        return `<tr><td><b>${esc(nome)}</b><br><small style="color:var(--cinza-400);">${esc(x[0].curso || "")}</small></td><td>${x.length}</td>
          <td><div class="ra-barra"><span style="width:${pres || 0}%"></span></div><small>${pres == null ? "—" : pres + "%"}</small></td>
          <td class="ra-esconder">${c("realizada")}</td><td class="ra-esconder">${c("falta")}</td><td class="ra-esconder">${c("falta_justificada")}</td>
          <td><div class="ra-trilha">${x.map(a => `<i style="--c:${ESTADO[chaveEstado(a)].cor}" title="${esc(fmtDia(a.dia) + " " + a.hora + " · " + ESTADO[chaveEstado(a)].nome)}"></i>`).join("")}</div></td></tr>`;
      }).join("") + "</tbody></table></div>";
  }
  function desenharLote() {
    const n = selecionadas.size, el = $("raLote");
    el.hidden = !n;
    if (!n) return;
    el.innerHTML = `<span>${n} aula(s) selecionada(s):</span>` + ["realizada", "falta", "falta_justificada", "cancelada_professor", "remarcada", "prevista"]
      .map(k => `<button type="button" data-lote="${k}">${ESTADO[k].nome}</button>`).join("") + '<button type="button" data-lote-limpar>Limpar seleção</button>';
  }

  // ---------- ações ----------
  const porId = id => { const [chave, data] = [id.slice(0, id.lastIndexOf("|")), id.slice(id.lastIndexOf("|") + 1)]; return dados.itens.find(a => a.chave === chave && String(a.data) === data); };
  async function salvar(a, corpo) {
    const r = await fetch("/api/horarios/admin/registro", { method: "PUT", headers: H(true), body: JSON.stringify({ chave: a.chave, data: a.data, ...corpo }) });
    const d = await r.json();
    if (!r.ok) { alert(d.msg || "Erro ao salvar."); return null; }
    await carregar();
    return d.aula;
  }
  function escolherArquivo(a, justificativa) {
    const inp = document.createElement("input");
    inp.type = "file"; inp.accept = ".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/*";
    inp.addEventListener("change", async () => {
      const f = inp.files[0]; if (!f) return;
      const fd = new FormData();
      fd.append("chave", a.chave); fd.append("data", a.data); fd.append("arquivo", f);
      if (justificativa !== undefined) fd.append("justificativa", justificativa);
      const r = await fetch("/api/horarios/admin/registro/atestado", { method: "POST", headers: H(), body: fd });
      const d = await r.json();
      if (!r.ok) { alert(d.msg || "Erro ao enviar o atestado."); return; }
      await carregar();
      if ($("raModal")) { fecharModal(); abrirDetalhes(d.aula); }
    });
    inp.click();
  }
  async function baixarAtestado(a) {
    const r = await fetch("/api/horarios/admin/registro/atestado/" + a.id, { headers: H() });
    if (!r.ok) { alert("Atestado não encontrado."); return; }
    const url = URL.createObjectURL(await r.blob());
    const el = document.createElement("a"); el.href = url; el.download = a.atestado.nome || "atestado"; document.body.appendChild(el); el.click(); el.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function fecharModal() { const m = $("raModal"); if (m) m.remove(); }
  function abrirDetalhes(a) {
    fecharModal();
    const m = document.createElement("div");
    m.className = "modal-overlay show ra"; m.id = "raModal";
    const estados = ["prevista", "realizada", "falta", "falta_justificada", "cancelada_professor", "remarcada"];
    m.innerHTML = `<div class="modal-box" role="dialog" aria-label="Detalhes da aula" style="max-width:620px;">
      <h3 style="margin-bottom:2px;">${esc(a.nome)}</h3>
      <p class="campo-hint" style="margin-bottom:12px;">${esc(fmtDia(a.dia))} · ${esc(a.hora)}${a.curso ? " · " + esc(a.curso) : ""} · ${a.origem === "avulsa" ? (a.reposicaoDe ? "reposição" : "aula avulsa") : "grade semanal"}</p>
      <div class="campo"><label>Situação da aula</label><div class="ra-estados">${estados.map(k => `<label><input type="radio" name="raEst" value="${k}" ${a.estado === k ? "checked" : ""}>${pill(k)}</label>`).join("")}</div></div>
      <div class="campo"><label for="raProf">Professor(a)</label><input type="text" id="raProf" maxlength="120" value="${esc(a.professor)}"></div>
      <div class="campo"><label for="raConteudoTxt">Conteúdo da aula</label><textarea id="raConteudoTxt" rows="2" maxlength="2000" placeholder="O que foi trabalhado (ex.: passé composé, tâche 3 do TCF)">${esc(a.conteudo)}</textarea></div>
      <div class="campo"><label for="raObs">Observações</label><textarea id="raObs" rows="2" maxlength="2000">${esc(a.observacao)}</textarea></div>
      <div class="campo"><label for="raJust">Justificativa da falta</label><textarea id="raJust" rows="2" maxlength="2000" placeholder="Motivo informado pelo aluno">${esc(a.justificativa)}</textarea></div>
      <div class="campo"><label>Atestado</label><div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
        ${a.atestado ? `<span>📎 ${esc(a.atestado.nome)}</span><button type="button" class="btn secundario pequeno" data-m="baixar">Baixar</button>` : '<span class="campo-hint">Nenhum atestado anexado.</span>'}
        <button type="button" class="btn secundario pequeno" data-m="atestado">${a.atestado ? "Trocar arquivo" : "Anexar atestado (PDF ou imagem)"}</button></div></div>
      ${a.historico.length ? `<div class="campo"><label>Histórico</label><div class="ra-hist">${a.historico.slice().reverse().map(h => `<div><b>${esc(h.nota || "")}</b> · ${esc(h.porNome || "")} · ${new Date(h.em).toLocaleString("pt-BR")}</div>`).join("")}</div></div>` : ""}
      <div class="modal-acoes" style="display:flex; gap:8px; justify-content:space-between; flex-wrap:wrap; margin-top:14px;">
        <span>${["falta", "falta_justificada", "cancelada_professor", "remarcada"].includes(a.estado) ? '<button type="button" class="btn secundario pequeno" data-m="repor">Agendar reposição</button>' : ""}
          ${a.origem === "avulsa" ? '<button type="button" class="btn perigo pequeno" data-m="apagar">Apagar aula avulsa</button>' : ""}</span>
        <span><button type="button" class="btn secundario" data-m="fechar">Cancelar</button> <button type="button" class="btn" data-m="salvar">Salvar</button></span>
      </div></div>`;
    document.body.appendChild(m);
    m.addEventListener("click", async e => {
      const b = e.target.closest("[data-m]");
      if (e.target === m || (b && b.dataset.m === "fechar")) { fecharModal(); return; }
      if (!b) return;
      if (b.dataset.m === "baixar") baixarAtestado(a);
      if (b.dataset.m === "atestado") escolherArquivo(a, $("raJust").value);
      if (b.dataset.m === "repor") { fecharModal(); abrirAvulsa(a); }
      if (b.dataset.m === "apagar") {
        if (!confirm("Apagar esta aula avulsa?")) return;
        await fetch("/api/horarios/admin/registro/avulsa/" + a.id, { method: "DELETE", headers: H() });
        fecharModal(); carregar();
      }
      if (b.dataset.m === "salvar") {
        const est = m.querySelector('input[name="raEst"]:checked');
        const ok = await salvar(a, { estado: est ? est.value : a.estado, professor: $("raProf").value, conteudo: $("raConteudoTxt").value, observacao: $("raObs").value, justificativa: $("raJust").value });
        if (ok) fecharModal();
      }
    });
    m.addEventListener("keydown", e => { if (e.key === "Escape") fecharModal(); });
  }
  // Aula avulsa / reposição (de um aluno da grade ou de um nome livre)
  function abrirAvulsa(base) {
    fecharModal();
    const m = document.createElement("div");
    m.className = "modal-overlay show ra"; m.id = "raModal";
    const amanha = iso(new Date(Date.now() + DIA_MS));
    m.innerHTML = `<div class="modal-box" role="dialog" aria-label="Aula avulsa" style="max-width:520px;">
      <h3>${base ? "Reposição da aula de " + esc(base.nome) : "Aula avulsa / reposição"}</h3>
      ${base ? `<p class="campo-hint">Repõe a aula de ${esc(fmtDia(base.dia))} às ${esc(base.hora)}.</p>` : ""}
      <div class="campo"><label for="raAvAluno">Aluno</label><select id="raAvAluno"><option value="">— outro nome —</option>${dados.alunos.map(x => `<option value="${esc(x.chave)}" ${base && base.chave === x.chave ? "selected" : ""}>${esc(x.nome)}</option>`).join("")}</select></div>
      <div class="campo" id="raAvNomeCampo" ${base ? "hidden" : ""}><label for="raAvNome">Nome</label><input type="text" id="raAvNome" maxlength="120"></div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;"><div class="campo"><label for="raAvDia">Data</label><input type="date" id="raAvDia" value="${amanha}"></div>
        <div class="campo"><label for="raAvHora">Horário</label><input type="time" id="raAvHora" value="${base ? esc(base.hora) : "19:00"}" step="1800"></div></div>
      <div class="campo"><label for="raAvObs">Observação</label><textarea id="raAvObs" rows="2"></textarea></div>
      <p class="field-error" id="raAvErro" style="display:none;"></p>
      <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:10px;"><button type="button" class="btn secundario" data-av="fechar">Cancelar</button><button type="button" class="btn" data-av="salvar">Criar aula</button></div></div>`;
    document.body.appendChild(m);
    $("raAvAluno").addEventListener("change", () => { $("raAvNomeCampo").hidden = !!$("raAvAluno").value; });
    m.addEventListener("click", async e => {
      const b = e.target.closest("[data-av]");
      if (e.target === m || (b && b.dataset.av === "fechar")) { fecharModal(); return; }
      if (!b) return;
      const r = await fetch("/api/horarios/admin/registro/avulsa", { method: "POST", headers: H(true), body: JSON.stringify({
        dia: $("raAvDia").value, hora: $("raAvHora").value, chave: $("raAvAluno").value || undefined, nome: $("raAvNome") ? $("raAvNome").value : "",
        observacao: $("raAvObs").value, reposicaoDe: base ? base.data : undefined }) });
      const d = await r.json();
      if (!r.ok) { const er = $("raAvErro"); er.textContent = d.msg || "Erro ao criar."; er.style.display = "block"; return; }
      fecharModal(); carregar();
    });
  }

  // ---------- eventos ----------
  $("raAtalhos").addEventListener("click", e => {
    const b = e.target.closest("[data-ra-periodo]"); if (!b) return;
    atalho = b.dataset.raPeriodo;
    $("raAtalhos").querySelectorAll(".periodo-tab").forEach(x => x.classList.toggle("active", x === b));
    definirPeriodo(atalho); carregar();
  });
  $("raAntes").addEventListener("click", () => { deslocar(-1); carregar(); });
  $("raDepois").addEventListener("click", () => { deslocar(1); carregar(); });
  ["raDe", "raAte"].forEach(id => $(id).addEventListener("change", () => { $("raAtalhos").querySelectorAll(".periodo-tab").forEach(x => x.classList.remove("active")); carregar(); }));
  ["raAluno", "raEstado"].forEach(id => $(id).addEventListener("change", () => { filtroEstado = ""; if (dados) desenhar(); }));
  $("raBusca").addEventListener("input", () => { if (dados) desenhar(); });
  $("raVisao").addEventListener("click", e => {
    const b = e.target.closest("[data-ra-visao]"); if (!b) return;
    visao = b.dataset.raVisao;
    $("raVisao").querySelectorAll(".periodo-tab").forEach(x => x.classList.toggle("active", x === b));
    if (dados) desenhar();
  });
  $("raNovaAvulsa").addEventListener("click", () => { if (dados) abrirAvulsa(null); });
  secao.addEventListener("click", async e => {
    const k = e.target.closest("[data-kpi]");
    if (k) { filtroEstado = filtroEstado === k.dataset.kpi ? "" : k.dataset.kpi; $("raEstado").value = ""; desenhar(); return; }
    const lote = e.target.closest("[data-lote]");
    if (lote) {
      const itens = [...selecionadas].map(porId).filter(Boolean).map(a => ({ chave: a.chave, data: a.data }));
      const r = await fetch("/api/horarios/admin/registro/lote", { method: "POST", headers: H(true), body: JSON.stringify({ itens, estado: lote.dataset.lote }) });
      if (!r.ok) { const d = await r.json(); alert(d.msg || "Erro."); return; }
      carregar(); return;
    }
    if (e.target.closest("[data-lote-limpar]")) { selecionadas.clear(); desenhar(); return; }
    const card = e.target.closest("[data-aula]"); if (!card) return;
    const a = porId(card.dataset.aula); if (!a) return;
    if (e.target.matches("[data-sel]")) { if (e.target.checked) selecionadas.add(card.dataset.aula); else selecionadas.delete(card.dataset.aula); card.classList.toggle("sel", e.target.checked); desenharLote(); return; }
    const rap = e.target.closest("[data-rapido]");
    if (rap) { salvar(a, { estado: rap.dataset.rapido }); return; }
    if (e.target.closest("[data-atestado]")) { escolherArquivo(a); return; }
    if (e.target.closest("[data-detalhes]")) abrirDetalhes(a);
  });

  // carrega quando a aba é aberta
  definirPeriodo("semana");
  new MutationObserver(() => { if (!secao.hidden && !dados) carregar(); }).observe(secao, { attributes: true, attributeFilter: ["hidden"] });
  if (!secao.hidden) carregar();
})();
