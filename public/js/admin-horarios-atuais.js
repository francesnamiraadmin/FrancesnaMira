// Sistema de Aulas → « Horários Atuais »: grade da semana com o nome de quem tem aula em cada
// horário (matrículas confirmadas), « Turma - CURSO » nas aulas em turma, e nomes colocados ou
// retirados à mão. Atualiza sozinha a cada 15 segundos enquanto a aba está aberta.
(function () {
  const token = localStorage.getItem("token");
  const H = json => Object.assign({ Authorization: "Bearer " + token }, json ? { "Content-Type": "application/json" } : {});
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
  const ORDEM = [1, 2, 3, 4, 5, 6, 0];
  const PERIODOS = {
    noturno: ["18:00", "19:00", "20:00", "21:00", "22:00", "23:00", "00:00"],
    vespertino: ["12:00", "13:00", "14:00", "15:00", "16:00", "17:00"],
    diurno: ["06:00", "07:00", "08:00", "09:00", "10:00", "11:00"]
  };
  let dados = null, periodo = "todos", soOcupados = false, relogio = null, carregando = false;

  const secao = document.querySelector('.secao[data-secao="atuais"]');
  if (!secao) return;
  const $ = id => document.getElementById(id);

  function horasVisiveis() {
    const usadas = new Set((dados?.celulas || []).filter(c => c.itens.length).map(c => c.horaInicio));
    let horas = periodo === "todos" ? [...PERIODOS.diurno, ...PERIODOS.vespertino, ...PERIODOS.noturno] : PERIODOS[periodo];
    // horários fora das faixas padrão (ex.: 05:00) também aparecem se tiverem alguém
    if (periodo === "todos") usadas.forEach(h => { if (!horas.includes(h)) horas = [...horas, h]; });
    horas = [...new Set(horas)].sort((a, b) => (a === "00:00" ? "24:00" : a).localeCompare(b === "00:00" ? "24:00" : b));
    return soOcupados ? horas.filter(h => usadas.has(h)) : horas;
  }

  function itemHtml(it) {
    const titulo = it.tipo === "turma" ? (it.alunos?.length ? it.alunos.join(", ") : it.detalhe || "") : it.tipo === "manual" ? "Colocado à mão" : "Matrícula confirmada" + (it.curso ? " · " + it.curso : "");
    return `<span class="ha-item ${it.tipo}" title="${esc(titulo)}"><span class="ha-txt">${esc(it.texto)}${it.tipo === "turma" && it.alunos?.length ? ` <small>· ${it.alunos.length}</small>` : ""}</span>` +
      `<button type="button" class="ha-x" title="Retirar da grade" data-retirar="${esc(it.chave)}" data-ajuste="${esc(it.ajusteId || "")}" data-tipo="${esc(it.tipo)}" data-nome="${esc(it.texto)}">×</button></span>`;
  }

  function render() {
    if (!dados) return;
    const mapa = {};
    dados.celulas.forEach(c => { mapa[c.diaSemana + "|" + c.horaInicio] = c.itens; });
    const horas = horasVisiveis();
    const total = dados.celulas.reduce((t, c) => t + c.itens.length, 0);
    $("haResumo").textContent = total + (total === 1 ? " aula na semana" : " aulas na semana") + " · atualizado às " + new Date(dados.atualizadoEm).toLocaleTimeString("pt-BR");
    if (!horas.length) { $("haGrade").innerHTML = '<tbody><tr><td class="ha-vazio">Nenhum horário ocupado neste período.</td></tr></tbody>'; }
    else $("haGrade").innerHTML = "<thead><tr><th>Horário</th>" + ORDEM.map(d => `<th>${DIAS[d]}</th>`).join("") + "</tr></thead><tbody>" +
      horas.map(h => "<tr><td class=\"ha-hora\">" + h + "</td>" + ORDEM.map(d => {
        const itens = mapa[d + "|" + h] || [];
        return `<td class="ha-cel${itens.length ? " ocupada" : ""}" data-dia="${d}" data-hora="${h}">${itens.map(itemHtml).join("")}` +
          `<button type="button" class="ha-add" title="Colocar um nome neste horário" data-add="${d}|${h}">+</button></td>`;
      }).join("") + "</tr>").join("") + "</tbody>";
    const r = dados.retirados || [];
    $("haRetirados").innerHTML = r.length ? `<h3>Retirados da grade (${r.length})</h3><p class="campo-hint">Vêm de matrículas ou turmas e foram tirados à mão. A matrícula continua valendo.</p>` +
      r.map(x => `<div class="ha-ret"><span><b>${esc(x.texto)}</b> · ${DIAS[x.diaSemana]} ${esc(x.horaInicio)}</span><button type="button" class="btn secundario pequeno" data-restaurar="${esc(x.ajusteId)}">Devolver à grade</button></div>`).join("") : "";
  }

  async function carregar() {
    if (carregando) return;
    carregando = true;
    try {
      const res = await fetch("/api/horarios/admin/atuais", { headers: H() });
      if (res.ok) { dados = await res.json(); render(); }
      else $("haResumo").textContent = "Não foi possível carregar os horários.";
    } catch (e) { $("haResumo").textContent = "Sem conexão: tentando de novo…"; }
    carregando = false;
  }

  function vigiar() {
    clearInterval(relogio);
    carregar();
    relogio = setInterval(() => { if (!secao.hidden && !document.hidden) carregar(); }, 15000);
  }

  // Janela para colocar um nome (no visual do painel, sem a caixa do navegador)
  function abrirAdicionar(dia, hora) {
    $("haModalTitulo").textContent = `Colocar um nome · ${DIAS[dia]} às ${hora}`;
    $("haNome").value = "";
    $("haModalidade").value = "particular";
    $("haModal").dataset.dia = dia;
    $("haModal").dataset.hora = hora;
    $("haErro").textContent = "";
    $("haModal").classList.add("show");
    setTimeout(() => $("haNome").focus(), 50);
  }
  function fecharModal() { $("haModal").classList.remove("show"); }
  async function salvarNome() {
    const nome = $("haNome").value.trim();
    if (!nome) { $("haNome").focus(); return; }
    const corpo = { diaSemana: Number($("haModal").dataset.dia), horaInicio: $("haModal").dataset.hora, nome, modalidade: $("haModalidade").value };
    $("haSalvar").disabled = true;
    try {
      const res = await fetch("/api/horarios/admin/atuais/manual", { method: "POST", headers: H(true), body: JSON.stringify(corpo) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).msg || "Erro");
      fecharModal();
      await carregar();
    } catch (e) { $("haErro").textContent = e.message; }
    $("haSalvar").disabled = false;
  }

  secao.addEventListener("click", async e => {
    const add = e.target.closest("[data-add]");
    if (add) { const [d, h] = add.dataset.add.split("|"); abrirAdicionar(Number(d), h); return; }
    const x = e.target.closest("[data-retirar]");
    if (x) {
      const manual = x.dataset.tipo === "manual";
      const req = manual
        ? fetch("/api/horarios/admin/atuais/ajuste/" + x.dataset.ajuste, { method: "DELETE", headers: H() })
        : fetch("/api/horarios/admin/atuais/retirar", { method: "POST", headers: H(true), body: JSON.stringify({ chave: x.dataset.retirar }) });   // a chave já traz dia e hora
      await req.catch(() => {});
      await carregar();
      return;
    }
    const r = e.target.closest("[data-restaurar]");
    if (r) { await fetch("/api/horarios/admin/atuais/ajuste/" + r.dataset.restaurar, { method: "DELETE", headers: H() }).catch(() => {}); await carregar(); return; }
    const p = e.target.closest("[data-ha-periodo]");
    if (p) {
      periodo = p.dataset.haPeriodo;
      secao.querySelectorAll("[data-ha-periodo]").forEach(b => b.classList.toggle("active", b === p));
      render();
    }
  });
  $("haSoOcupados").addEventListener("change", e => { soOcupados = e.target.checked; render(); });
  $("haAtualizar").addEventListener("click", carregar);
  $("haCancelar").addEventListener("click", fecharModal);
  $("haSalvar").addEventListener("click", salvarNome);
  $("haNome").addEventListener("keydown", e => { if (e.key === "Enter") salvarNome(); if (e.key === "Escape") fecharModal(); });
  $("haModal").addEventListener("click", e => { if (e.target.id === "haModal") fecharModal(); });

  // a aba é aberta pelo menu do Sistema de Aulas (admin-sistema-aulas.js)
  new MutationObserver(() => { if (!secao.hidden) vigiar(); else clearInterval(relogio); }).observe(secao, { attributes: true, attributeFilter: ["hidden"] });
  if (!secao.hidden) vigiar();
  window.HorariosAtuais = { carregar };
})();
