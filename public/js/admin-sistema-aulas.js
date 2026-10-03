// Sistema de Aulas: abas (grade / alunos / cupons), indicadores e emissão de cupons.
// A grade semanal continua em admin-horarios.js (que também define authHeaders/escapeHtml).
(function () {
  const fmtMoeda = v => (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const fmtData = d => d ? new Date(d).toLocaleDateString("pt-BR") : "—";
  const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const CURSOS = ["TCF", "DELF", "DALF", "TEF", "A1", "A2", "B1", "B2", "A1-B2"];
  const NOME_CURSO = { "A1-B2": "A1 ao B2" };
  const PLANOS = ["Essentiel", "Avancé", "Excellence", "Pack Prestige"];

  let dadosAulas = { resumo: null, matriculas: [] };
  let cupons = [];
  let cupomEditando = null;

  // ===================== ABAS =====================
  const secoes = document.querySelectorAll(".secao[data-secao]");
  function abrirSecao(nome) {
    document.querySelectorAll("#secaoNav .secao-btn").forEach(b => b.classList.toggle("active", b.dataset.secao === nome));
    secoes.forEach(s => { s.hidden = s.dataset.secao !== nome; });
    history.replaceState(null, "", "#" + nome);
    if (nome === "cupons") carregarCupons();
    if (nome === "alunos") renderAlunos();
  }
  document.getElementById("secaoNav").addEventListener("click", e => {
    const b = e.target.closest(".secao-btn");
    if (b) abrirSecao(b.dataset.secao);
  });

  // ===================== INDICADORES =====================
  function kpi(rot, val, sub, pct) {
    return '<div class="kpi"><div class="rot">' + rot + '</div><div class="val">' + val + "</div>" +
      (sub ? '<div class="sub">' + sub + "</div>" : "") +
      (pct !== undefined ? '<div class="barra"><span style="width:' + Math.min(100, pct) + '%"></span></div>' : "") + "</div>";
  }
  function renderKpis() {
    const r = dadosAulas.resumo;
    const el = document.getElementById("kpisAulas");
    if (!r) { el.innerHTML = ""; return; }
    const ocup = r.vagas ? Math.round((r.ocupadas / r.vagas) * 100) : 0;
    const ativos = cupons.filter(c => c.ativo && !(c.validoAte && new Date(c.validoAte) < new Date())).length;
    el.innerHTML =
      kpi("Alunos com aula", r.alunos, r.matriculas + " matrícula(s) confirmada(s)") +
      kpi("Ocupação da grade", ocup + "%", r.ocupadas + " de " + r.vagas + " vagas", ocup) +
      kpi("Receita mensal das aulas", fmtMoeda(r.receitaMensal), "soma das matrículas ativas") +
      kpi("Cupons ativos", ativos, cupons.length + " emitido(s) no total");
  }

  async function carregarAulas() {
    try {
      const res = await fetch("/api/horarios/admin/matriculas", { headers: authHeaders() });
      if (res.ok) dadosAulas = await res.json();
    } catch (e) { /* indicadores são complementares */ }
    renderKpis();
    renderAlunos();
  }

  // ===================== ALUNOS MATRICULADOS =====================
  function renderAlunos() {
    const tabela = document.getElementById("tabelaAlunos");
    const termo = (document.getElementById("buscaAlunos").value || "").toLowerCase();
    const lista = dadosAulas.matriculas.filter(m =>
      !termo || [m.nome, m.email, m.curso].some(v => (v || "").toLowerCase().includes(termo)));
    if (!lista.length) {
      tabela.innerHTML = '<tr><td class="vazio-aviso">' + (dadosAulas.matriculas.length ? "Nenhum aluno encontrado." : "Nenhuma matrícula confirmada ainda.") + "</td></tr>";
      return;
    }
    tabela.innerHTML = "<thead><tr><th>Aluno</th><th>Curso</th><th>Modalidade</th><th>Horários</th><th>Mensal</th><th>Desde</th><th></th></tr></thead><tbody>" +
      lista.map(m => "<tr>" +
        "<td><strong>" + escapeHtml(m.nome || "—") + "</strong><small>" + escapeHtml(m.email || "") + (m.telefone ? " · " + escapeHtml(m.telefone) : "") + "</small></td>" +
        '<td><span class="pill azul">' + escapeHtml(NOME_CURSO[m.curso] || m.curso || "—") + "</span></td>" +
        "<td>" + (m.tipo === "turma" ? "Turma" : "Particular") + "</td>" +
        "<td>" + m.horarios.map(h => DIAS[h.diaSemana] + " " + escapeHtml(h.horaInicio)).join("<br>") + "</td>" +
        "<td>" + fmtMoeda(m.precoFinal) + (m.cupomCodigo ? "<small>cupom " + escapeHtml(m.cupomCodigo) + "</small>" : "") + "</td>" +
        "<td>" + fmtData(m.criadoEm) + "</td>" +
        '<td><div class="linha-acoes"><button class="btn perigo pequeno" data-cancelar="' + m.matriculaId + '">Cancelar</button></div></td>' +
        "</tr>").join("") + "</tbody>";
  }
  document.getElementById("buscaAlunos").addEventListener("input", renderAlunos);
  document.getElementById("tabelaAlunos").addEventListener("click", async e => {
    const btn = e.target.closest("[data-cancelar]");
    if (!btn || !confirm("Cancelar esta matrícula e liberar os horários?")) return;
    btn.disabled = true;
    await fetch("/api/matricula/" + btn.dataset.cancelar + "/cancelar", { method: "POST", headers: authHeaders() });
    await carregarAulas();
    if (typeof carregarGrade === "function") carregarGrade();
  });

  // ===================== CUPONS =====================
  function statusCupom(c) {
    if (!c.ativo) return '<span class="pill off">Desativado</span>';
    if (c.validoAte && new Date(c.validoAte) < new Date()) return '<span class="pill aviso">Expirado</span>';
    if (c.usoMaximo && c.usosAtuais >= c.usoMaximo) return '<span class="pill aviso">Esgotado</span>';
    return '<span class="pill ok">Ativo</span>';
  }
  const descontoTexto = c => c.tipo === "percentual" ? c.valor + "%" : fmtMoeda(c.valor);
  const restricoes = c => [
    c.cursos && c.cursos.length ? c.cursos.map(x => NOME_CURSO[x] || x).join(", ") : "Todos os cursos",
    c.planos && c.planos.length ? c.planos.join(", ") : "todos os planos"
  ].join(" · ");

  async function carregarCupons() {
    const tabela = document.getElementById("tabelaCupons");
    try {
      const res = await fetch("/api/cupons", { headers: authHeaders() });
      cupons = res.ok ? await res.json() : [];
    } catch (e) { cupons = []; }
    renderKpis();
    if (!cupons.length) { tabela.innerHTML = '<tr><td class="vazio-aviso">Nenhum cupom emitido ainda. Clique em “Emitir cupom”.</td></tr>'; return; }
    tabela.innerHTML = "<thead><tr><th>Código</th><th>Desconto</th><th>Vale para</th><th>Validade</th><th>Usos</th><th>Resultado</th><th>Status</th><th></th></tr></thead><tbody>" +
      cupons.map(c => "<tr>" +
        '<td><span class="codigo-cupom" data-copiar="' + escapeHtml(c.codigo) + '" title="Copiar">' + escapeHtml(c.codigo) + "</span>" + (c.descricao ? "<small>" + escapeHtml(c.descricao) + "</small>" : "") + "</td>" +
        "<td><strong>" + descontoTexto(c) + "</strong></td>" +
        "<td><small style='color:inherit'>" + escapeHtml(restricoes(c)) + "</small></td>" +
        "<td>" + (c.validoAte ? fmtData(c.validoAte) : "Sem prazo") + "</td>" +
        "<td>" + c.usosAtuais + (c.usoMaximo ? " / " + c.usoMaximo : "") + "</td>" +
        "<td>" + (c.estatisticas.pedidos ? fmtMoeda(c.estatisticas.receita) + "<small>" + fmtMoeda(c.estatisticas.descontoTotal) + " em descontos</small>" : "—") + "</td>" +
        "<td>" + statusCupom(c) + "</td>" +
        '<td><div class="linha-acoes"><button class="btn secundario pequeno" data-editar="' + c._id + '">Editar</button>' +
        '<button class="btn ' + (c.ativo ? "perigo" : "") + ' pequeno" data-alternar="' + c._id + '">' + (c.ativo ? "Desativar" : "Reativar") + "</button></div></td>" +
        "</tr>").join("") + "</tbody>";
  }

  document.getElementById("tabelaCupons").addEventListener("click", async e => {
    const copiar = e.target.closest("[data-copiar]");
    if (copiar) {
      try { await navigator.clipboard.writeText(copiar.dataset.copiar); copiar.textContent = "Copiado!"; setTimeout(() => { copiar.textContent = copiar.dataset.copiar; }, 1200); } catch (err) { /* sem permissão de área de transferência */ }
      return;
    }
    const editar = e.target.closest("[data-editar]");
    if (editar) { abrirModalCupom(cupons.find(c => c._id === editar.dataset.editar)); return; }
    const alternar = e.target.closest("[data-alternar]");
    if (alternar) {
      const c = cupons.find(x => x._id === alternar.dataset.alternar);
      if (c.ativo && !confirm("Desativar o cupom " + c.codigo + "? Ele deixa de valer imediatamente.")) return;
      alternar.disabled = true;
      await fetch("/api/cupons/" + c._id, { method: "PUT", headers: authHeaders(true), body: JSON.stringify({ ativo: !c.ativo }) });
      carregarCupons();
    }
  });

  // ---------- modal ----------
  function chips(id, valores, rotulo) {
    document.getElementById(id).innerHTML = valores.map(v =>
      '<label class="tipo-chip"><input type="checkbox" value="' + v + '"> ' + (rotulo[v] || v) + "</label>").join("");
  }
  chips("cupomCursosGrid", CURSOS, NOME_CURSO);
  chips("cupomPlanosGrid", PLANOS, {});

  function gerarCodigo() {
    const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sem 0/O e 1/I para evitar confusão
    const aleat = crypto.getRandomValues(new Uint32Array(6));
    return "FNM" + Array.from(aleat, n => alfabeto[n % alfabeto.length]).join("");
  }
  document.getElementById("gerarCodigoBtn").addEventListener("click", () => {
    document.getElementById("cupomCodigo").value = gerarCodigo();
    atualizarPrevia();
  });

  function atualizarPrevia() {
    const tipo = document.getElementById("cupomTipo").value;
    const valor = Number(document.getElementById("cupomValor").value);
    document.getElementById("cupomValorLabel").textContent = tipo === "percentual" ? "Desconto (%)" : "Desconto (R$)";
    const el = document.getElementById("cupomPrevia");
    if (!(valor > 0)) { el.textContent = "Preencha o desconto para ver a prévia."; return; }
    // Exemplo com o plano Essentiel com 1 aula por semana (R$ 400).
    const base = 400;
    const desc = Math.min(tipo === "percentual" ? base * valor / 100 : valor, base);
    const final = Math.max(1, base - desc);
    el.innerHTML = "Prévia: um plano de <strong>" + fmtMoeda(base) + "</strong> sai por <strong>" + fmtMoeda(final) + "</strong> com este cupom.";
  }
  ["cupomTipo", "cupomValor"].forEach(id => document.getElementById(id).addEventListener("input", atualizarPrevia));

  function abrirModalCupom(c) {
    cupomEditando = c || null;
    document.getElementById("cupomTitulo").textContent = c ? "Editar cupom " + c.codigo : "Emitir cupom";
    document.getElementById("salvarCupomBtn").textContent = c ? "Salvar alterações" : "Emitir cupom";
    document.getElementById("cupomCodigo").value = c ? c.codigo : gerarCodigo();
    document.getElementById("cupomDescricao").value = c ? c.descricao || "" : "";
    document.getElementById("cupomTipo").value = c ? c.tipo : "percentual";
    document.getElementById("cupomValor").value = c ? c.valor : "";
    document.getElementById("cupomValidoAte").value = c && c.validoAte ? new Date(c.validoAte).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }) : "";
    document.getElementById("cupomUsoMaximo").value = c && c.usoMaximo ? c.usoMaximo : "";
    marcarCursos("cupomCursosGrid", c ? c.cursos : []);
    marcarCursos("cupomPlanosGrid", c ? c.planos : []);
    document.getElementById("cupomErro").style.display = "none";
    atualizarPrevia();
    document.getElementById("modalCupom").classList.add("show");
  }
  document.getElementById("novoCupomBtn").addEventListener("click", () => abrirModalCupom(null));
  document.getElementById("fecharCupomBtn").addEventListener("click", () => document.getElementById("modalCupom").classList.remove("show"));

  document.getElementById("salvarCupomBtn").addEventListener("click", async () => {
    const erro = document.getElementById("cupomErro");
    const corpo = {
      codigo: document.getElementById("cupomCodigo").value.trim(),
      descricao: document.getElementById("cupomDescricao").value.trim(),
      tipo: document.getElementById("cupomTipo").value,
      valor: Number(document.getElementById("cupomValor").value),
      validoAte: document.getElementById("cupomValidoAte").value || null,
      usoMaximo: document.getElementById("cupomUsoMaximo").value ? Number(document.getElementById("cupomUsoMaximo").value) : null,
      cursos: lerCursosMarcados("cupomCursosGrid"),
      planos: lerCursosMarcados("cupomPlanosGrid")
    };
    const url = cupomEditando ? "/api/cupons/" + cupomEditando._id : "/api/cupons";
    const res = await fetch(url, { method: cupomEditando ? "PUT" : "POST", headers: authHeaders(true), body: JSON.stringify(corpo) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { erro.textContent = data.msg || "Não foi possível salvar o cupom."; erro.style.display = "block"; return; }
    document.getElementById("modalCupom").classList.remove("show");
    carregarCupons();
  });

  // ===================== INIT =====================
  const inicial = location.hash.replace("#", "");
  carregarAulas();
  carregarCupons();
  if (["alunos", "cupons", "atuais", "registro", "grade"].includes(inicial)) abrirSecao(inicial);
})();
