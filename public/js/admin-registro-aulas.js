// Sistema de Aulas → « Registro de Aulas »: calendário do mês com o número de aulas de cada dia;
// clicando no dia abrem todas as aulas dele (estado, observações, justificativa, atestado e reposição).
// Também a visão « Por aluno ». O filtro de pessoa junta os horários da mesma conta do site
// (matrícula e nomes vinculados nos Horários Atuais).
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

  let dados = null, visao = "dias", filtroEstado = "", selecionadas = new Set(), carregando = false, deNovo = false;
  let mes = new Date(new Date().getFullYear(), new Date().getMonth(), 1), diaAberto = iso(new Date());

  // ---------- período: um mês ----------
  function definirMes(d) {
    mes = new Date(d.getFullYear(), d.getMonth(), 1);
    $("raDe").value = iso(mes);
    $("raAte").value = iso(new Date(mes.getFullYear(), mes.getMonth() + 1, 0));
    const t = mes.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    $("raMes").textContent = t.charAt(0).toUpperCase() + t.slice(1);
    if (diaAberto && diaAberto.slice(0, 7) !== $("raDe").value.slice(0, 7)) diaAberto = null;
  }
  function deslocar(sentido) { definirMes(new Date(mes.getFullYear(), mes.getMonth() + sentido, 1)); }

  // ---------- dados ----------
  async function carregar() {
    if (carregando) { deNovo = true; return; }   // pedido durante uma carga: recarrega ao terminar
    carregando = true;
    try {
      const r = await fetch(`/api/horarios/admin/registro?de=${$("raDe").value}&ate=${$("raAte").value}`, { headers: H() });
      dados = r.ok ? await r.json() : null;
      if (!dados) { $("raConteudo").innerHTML = '<p class="ha-vazio">Não foi possível carregar o registro.</p>'; return; }
      const atual = $("raAluno").value;
      $("raAluno").innerHTML = '<option value="">Todas as pessoas</option>' + dados.alunos.map(a => `<option value="${esc(a.pessoa)}" ${a.pessoa === atual ? "selected" : ""}>${esc(a.nome)}${a.horarios && a.horarios.length ? " · " + esc(a.horarios.join(", ")) : ""}${a.alunoId ? " 🔗" : ""}</option>`).join("");
      if ($("raEstado").options.length <= 1) $("raEstado").innerHTML = '<option value="">Todos os estados</option>' + Object.keys(ESTADO).map(k => `<option value="${k}">${ESTADO[k].nome}</option>`).join("");
      selecionadas.clear();
      desenhar();
    } finally { carregando = false; if (deNovo) { deNovo = false; carregar(); } }
  }
  function visiveis() {
    const aluno = $("raAluno").value, est = $("raEstado").value || filtroEstado, termo = $("raBusca").value.toLowerCase().trim();
    return dados.itens.filter(a => (!aluno || a.pessoa === aluno) &&
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
    if (visao === "dias") { $("raConteudo").innerHTML = htmlCalendario(l); desenharLote(); return; }
    if (!l.length) { $("raConteudo").innerHTML = '<p class="ha-vazio">Nenhuma aula neste mês com estes filtros.</p>'; desenharLote(); return; }
    $("raConteudo").innerHTML = htmlAlunos(l);
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
  // Calendário do mês (semana começando na segunda): cada dia com o número de aulas e uma barra
  // com a proporção de cada estado. Ao lado (ou abaixo, no celular), as aulas do dia escolhido.
  function htmlCalendario(l) {
    const porDia = {};
    l.forEach(a => (porDia[a.dia] = porDia[a.dia] || []).push(a));
    const ini = new Date(mes), fimMes = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate();
    const vazios = (ini.getDay() + 6) % 7;
    const cab = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"].map(d => `<div class="ra-cal-sem">${d}</div>`).join("");
    let cel = "";
    for (let i = 0; i < vazios; i++) cel += '<div class="ra-cal-dia fora" aria-hidden="true"></div>';
    for (let n = 1; n <= fimMes; n++) {
      const dia = iso(new Date(mes.getFullYear(), mes.getMonth(), n)), aulas = porDia[dia] || [];
      const cont = {};
      aulas.forEach(a => { const k = chaveEstado(a); cont[k] = (cont[k] || 0) + 1; });
      const barra = aulas.length ? `<span class="ra-cal-barra">${Object.keys(ESTADO).filter(k => cont[k]).map(k => `<i style="--c:${ESTADO[k].cor};flex:${cont[k]}" title="${cont[k]} ${ESTADO[k].nome.toLowerCase()}"></i>`).join("")}</span>` : "";
      const rotulo = aulas.length ? `${fmtDia(dia)}: ${aulas.length} aula(s)` : `${fmtDia(dia)}: sem aulas`;
      cel += `<button type="button" class="ra-cal-dia${dia === dados.hoje ? " hoje" : ""}${dia === diaAberto ? " aberto" : ""}${aulas.length ? " tem" : ""}" data-cal-dia="${dia}" aria-label="${esc(rotulo)}" aria-pressed="${dia === diaAberto}">
        <span class="ra-cal-num">${n}</span>${aulas.length ? `<b class="ra-cal-qtd">${aulas.length}</b><small>${aulas.length === 1 ? "aula" : "aulas"}</small>` : ""}
        ${cont.registrar ? `<i class="ra-cal-pend" title="${cont.registrar} a registrar">${cont.registrar}</i>` : ""}${barra}</button>`;
    }
    const doDia = diaAberto ? (porDia[diaAberto] || []) : [];
    const painel = diaAberto ? `<div class="ra-cal-painel" id="raDiaAberto"><div class="ra-dia-cab ${diaAberto === dados.hoje ? "hoje" : ""}"><h3>${esc(fmtDia(diaAberto))}</h3><small>${doDia.length} aula(s)</small>
        <button type="button" class="ra-fechar-dia" data-fechar-dia aria-label="Fechar o dia">×</button></div>
        ${doDia.length ? `<div class="ra-aulas">${doDia.map(htmlAula).join("")}</div>` : '<p class="ha-vazio">Nenhuma aula neste dia com estes filtros.</p>'}</div>`
      : '<div class="ra-cal-painel vazio"><p class="ha-vazio">Clique num dia do calendário para ver todas as aulas dele.</p></div>';
    return `<div class="ra-cal-layout"><div class="ra-cal"><div class="ra-cal-grade">${cab}${cel}</div></div>${painel}</div>`;
  }
  function htmlAlunos(l) {
    const por = {};
    l.forEach(a => (por[a.pessoa] = por[a.pessoa] || []).push(a));
    const nomeDe = k => (dados.alunos.find(x => x.pessoa === k) || {}).nome || por[k][0].nome;
    return `<div style="overflow-x:auto;"><table class="ra-tabela"><thead><tr><th>Aluno</th><th>Aulas</th><th>Presença</th><th class="ra-esconder">Realizadas</th><th class="ra-esconder">Faltas</th><th class="ra-esconder">Justificadas</th><th>Trilha do período</th></tr></thead><tbody>` +
      Object.keys(por).sort((p, q) => nomeDe(p).localeCompare(nomeDe(q))).map(k0 => {
        const x = por[k0], nome = nomeDe(k0), c = k => x.filter(a => a.estado === k).length;
        const hs = (dados.alunos.find(y => y.pessoa === k0) || {}).horarios || [];
        const base = c("realizada") + c("falta") + c("falta_justificada"), pres = base ? Math.round(c("realizada") / base * 100) : null;
        return `<tr><td><b>${esc(nome)}</b>${x[0].alunoId ? ' <span title="Vinculado a uma conta do site">🔗</span>' : ""}<br><small style="color:var(--cinza-400);">${esc([x[0].curso, hs.join(", ")].filter(Boolean).join(" · "))}</small></td><td>${x.length}</td>
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
    if (!r.ok) { (await Dialogo.aviso(d.msg || "Erro ao salvar.")); return null; }
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
      if (!r.ok) { (await Dialogo.aviso(d.msg || "Erro ao enviar o atestado.")); return; }
      await carregar();
      if ($("raModal")) { fecharModal(); abrirDetalhes(d.aula); }
    });
    inp.click();
  }
  async function baixarAtestado(a) {
    const r = await fetch("/api/horarios/admin/registro/atestado/" + a.id, { headers: H() });
    if (!r.ok) { (await Dialogo.aviso("Atestado não encontrado.")); return; }
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
        if (!(await Dialogo.confirmar("Apagar esta aula avulsa?"))) return;
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
  $("raAntes").addEventListener("click", () => { deslocar(-1); carregar(); });
  $("raDepois").addEventListener("click", () => { deslocar(1); carregar(); });
  $("raHoje").addEventListener("click", () => { diaAberto = iso(new Date()); definirMes(new Date()); carregar(); });
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
    const dc = e.target.closest("[data-cal-dia]");
    if (dc) {
      diaAberto = diaAberto === dc.dataset.calDia ? null : dc.dataset.calDia;
      selecionadas.clear(); desenhar();
      const p = $("raDiaAberto");
      if (p && window.matchMedia("(max-width: 900px)").matches) p.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (e.target.closest("[data-fechar-dia]")) { diaAberto = null; selecionadas.clear(); desenhar(); return; }
    const k = e.target.closest("[data-kpi]");
    if (k) { filtroEstado = filtroEstado === k.dataset.kpi ? "" : k.dataset.kpi; $("raEstado").value = ""; desenhar(); return; }
    const lote = e.target.closest("[data-lote]");
    if (lote) {
      const itens = [...selecionadas].map(porId).filter(Boolean).map(a => ({ chave: a.chave, data: a.data }));
      const r = await fetch("/api/horarios/admin/registro/lote", { method: "POST", headers: H(true), body: JSON.stringify({ itens, estado: lote.dataset.lote }) });
      if (!r.ok) { const d = await r.json(); (await Dialogo.aviso(d.msg || "Erro.")); return; }
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
  definirMes(new Date());
  new MutationObserver(() => { if (!secao.hidden && !dados) carregar(); }).observe(secao, { attributes: true, attributeFilter: ["hidden"] });
  if (!secao.hidden) carregar();
})();
