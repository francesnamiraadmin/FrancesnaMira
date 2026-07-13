(function () {
  const tk = localStorage.getItem("token");
  if (!tk) { window.location.href = "login.html?redirect=admin-matriculas.html"; return; }
  function authHeaders(json) {
    const h = { Authorization: "Bearer " + tk };
    if (json) h["Content-Type"] = "application/json";
    return h;
  }
  function fmtMoeda(v) { return (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
  function fmtData(d) { return d ? new Date(d).toLocaleDateString("pt-BR") : "—"; }

  fetch("/api/auth/me", { headers: authHeaders() }).then(r => r.json()).then(d => {
    if (d.role !== "admin") window.location.href = "minha-conta.html";
  });

  // ---------- TABS ----------
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach(c => (c.style.display = "none"));
      btn.classList.add("active");
      document.querySelector('[data-tab-content="' + btn.dataset.tab + '"]').style.display = "block";
      carregarTab(btn.dataset.tab);
    });
  });

  function carregarTab(tab) {
    if (tab === "dashboard") carregarDashboard();
    if (tab === "turmas") carregarTurmas();
    if (tab === "professores") carregarProfessores();
    if (tab === "cupons") carregarCupons();
    if (tab === "pagamentos") carregarPagamentos();
  }

  // ---------- DASHBOARD ----------
  async function carregarDashboard() {
    const grid = document.getElementById("kpiGrid");
    grid.innerHTML = '<p class="help">Carregando…</p>';
    try {
      const res = await fetch("/api/admin-matricula/kpis", { headers: authHeaders() });
      const k = await res.json();
      grid.innerHTML =
        kpiCard("Alunos matriculados", k.totalAlunosMatriculados) +
        kpiCard("Receita confirmada", fmtMoeda(k.receitaTotal), "bordeaux") +
        kpiCard("Turmas ativas", k.turmasAtivas) +
        kpiCard("Pagamentos pendentes", k.pagamentosPendentes, "gold") +
        kpiCard("Matrículas em turma", k.porTipo?.turma || 0) +
        kpiCard("Matrículas particulares", k.porTipo?.particular || 0);

      const meses = Object.keys(k.receitaPorMes || {}).sort();
      const max = Math.max(1, ...meses.map(m => k.receitaPorMes[m]));
      const graf = document.getElementById("receitaGrafico");
      if (!meses.length) {
        graf.innerHTML = '<p class="help">Ainda não há receita confirmada.</p>';
      } else {
        graf.innerHTML = '<div style="display:flex;align-items:flex-end;gap:14px;height:140px;">' +
          meses.map(m => {
            const alt = Math.max(6, Math.round((k.receitaPorMes[m] / max) * 120));
            return '<div style="display:flex;flex-direction:column;align-items:center;gap:6px;flex:1;">' +
              '<div style="font-size:11px;color:var(--muted);">' + fmtMoeda(k.receitaPorMes[m]) + '</div>' +
              '<div style="width:100%;background:var(--bordeaux);border-radius:6px 6px 0 0;height:' + alt + 'px;"></div>' +
              '<div style="font-size:11px;color:var(--muted);">' + m + '</div></div>';
          }).join("") + '</div>';
      }
    } catch (e) {
      grid.innerHTML = '<p class="field-error" style="display:block;">Erro ao carregar dashboard.</p>';
    }
  }
  function kpiCard(label, value, color) {
    return '<div class="kpi-card"><div class="kpi-label">' + label + '</div><div class="kpi-value' + (color ? " " + color : "") + '">' + value + '</div></div>';
  }

  // ---------- TURMAS ----------
  let professoresCache = [];
  async function carregarProfessoresCache() {
    if (professoresCache.length) return professoresCache;
    const res = await fetch("/api/admin-matricula/professores", { headers: authHeaders() });
    professoresCache = await res.json();
    return professoresCache;
  }

  async function carregarTurmas() {
    const tbody = document.getElementById("turmasTbody");
    tbody.innerHTML = '<tr><td colspan="8">Carregando…</td></tr>';
    try {
      const res = await fetch("/api/turmas?todos=1", { headers: authHeaders() });
      const turmas = await res.json();
      if (!turmas.length) { tbody.innerHTML = '<tr><td colspan="8">Nenhuma turma cadastrada.</td></tr>'; return; }
      tbody.innerHTML = "";
      turmas.forEach(t => {
        const tr = document.createElement("tr");
        tr.innerHTML =
          "<td>" + t.nome + "</td><td>" + t.nivel + "</td><td>" + (t.dias || []).join(", ") + " " + t.horario + "</td>" +
          "<td>" + (t.professorId?.nome || "—") + "</td>" +
          "<td>" + t.vagasRestantes + "/" + t.maxAlunos + "</td><td>" + fmtMoeda(t.preco) + "</td>" +
          '<td><span class="badge ' + (t.ativa ? "badge-confirmada" : "badge-cancelada") + '">' + (t.ativa ? "Ativa" : "Inativa") + "</span></td>" +
          '<td style="white-space:nowrap;"></td>';
        const td = tr.lastElementChild;
        const btnEdit = document.createElement("button");
        btnEdit.className = "btn-outline btn-small"; btnEdit.textContent = "Editar"; btnEdit.style.marginRight = "6px";
        btnEdit.addEventListener("click", () => abrirModalTurma(t));
        const btnMatriculados = document.createElement("button");
        btnMatriculados.className = "btn-outline btn-small"; btnMatriculados.textContent = "Alunos"; btnMatriculados.style.marginRight = "6px";
        btnMatriculados.addEventListener("click", () => verMatriculados(t));
        const btnToggle = document.createElement("button");
        btnToggle.className = "btn-danger btn-small"; btnToggle.textContent = t.ativa ? "Desativar" : "Reativar";
        btnToggle.addEventListener("click", () => toggleTurma(t));
        td.append(btnEdit, btnMatriculados, btnToggle);
        tbody.appendChild(tr);
      });
    } catch (e) {
      tbody.innerHTML = '<tr><td colspan="8">Erro ao carregar turmas.</td></tr>';
    }
  }

  async function abrirModalTurma(t) {
    document.getElementById("modalTurmaTitulo").textContent = t ? "Editar turma" : "Nova turma";
    document.getElementById("turmaId").value = t?._id || "";
    document.getElementById("turmaNome").value = t?.nome || "";
    document.getElementById("turmaNivel").value = t?.nivel || "A1";
    document.getElementById("turmaDias").value = (t?.dias || []).join(", ");
    document.getElementById("turmaHorario").value = t?.horario || "";
    document.getElementById("turmaDataInicio").value = t?.dataInicio ? new Date(t.dataInicio).toISOString().slice(0, 10) : "";
    document.getElementById("turmaMaxAlunos").value = t?.maxAlunos || 8;
    document.getElementById("turmaPreco").value = t?.preco || "";
    document.getElementById("turmaDescricao").value = t?.descricao || "";
    document.getElementById("turmaZoom").value = t?.zoomLink || "";
    document.getElementById("turmaMaterial").value = t?.materialUrl || "";
    document.getElementById("turmaErro").style.display = "none";
    document.getElementById("turmaProfessor").innerHTML = '<option value="">Carregando…</option>';
    document.getElementById("modalTurma").classList.add("show");

    const profs = await carregarProfessoresCache();
    document.getElementById("turmaProfessor").innerHTML = profs.map(p => '<option value="' + p._id + '">' + p.nome + "</option>").join("");
    document.getElementById("turmaProfessor").value = t?.professorId?._id || t?.professorId || profs[0]?._id || "";
  }
  document.getElementById("btnNovaTurma").addEventListener("click", () => abrirModalTurma(null));
  document.getElementById("btnFecharTurma").addEventListener("click", () => document.getElementById("modalTurma").classList.remove("show"));

  document.getElementById("btnSalvarTurma").addEventListener("click", async () => {
    const id = document.getElementById("turmaId").value;
    const body = {
      nome: document.getElementById("turmaNome").value.trim(),
      nivel: document.getElementById("turmaNivel").value,
      professorId: document.getElementById("turmaProfessor").value,
      dias: document.getElementById("turmaDias").value.split(",").map(s => s.trim()).filter(Boolean),
      horario: document.getElementById("turmaHorario").value.trim(),
      dataInicio: document.getElementById("turmaDataInicio").value,
      maxAlunos: Number(document.getElementById("turmaMaxAlunos").value) || 8,
      preco: Number(document.getElementById("turmaPreco").value) || 0,
      descricao: document.getElementById("turmaDescricao").value.trim(),
      zoomLink: document.getElementById("turmaZoom").value.trim(),
      materialUrl: document.getElementById("turmaMaterial").value.trim()
    };
    const erroEl = document.getElementById("turmaErro");
    if (!body.nome || !body.horario || !body.dias.length || !body.preco || !body.dataInicio) {
      erroEl.textContent = "Preencha nome, dias, horário, data de início e preço."; erroEl.style.display = "block"; return;
    }
    try {
      const res = await fetch(id ? "/api/turmas/" + id : "/api/turmas", {
        method: id ? "PUT" : "POST", headers: authHeaders(true), body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) { erroEl.textContent = data.msg || "Erro ao salvar."; erroEl.style.display = "block"; return; }
      document.getElementById("modalTurma").classList.remove("show");
      carregarTurmas();
    } catch (e) {
      erroEl.textContent = "Erro de conexão."; erroEl.style.display = "block";
    }
  });

  async function toggleTurma(t) {
    if (!confirm((t.ativa ? "Desativar" : "Reativar") + " a turma \"" + t.nome + "\"?")) return;
    if (t.ativa) {
      await fetch("/api/turmas/" + t._id, { method: "DELETE", headers: authHeaders() });
    } else {
      await fetch("/api/turmas/" + t._id, { method: "PUT", headers: authHeaders(true), body: JSON.stringify({ ativa: true }) });
    }
    carregarTurmas();
  }

  async function verMatriculados(t) {
    const modal = document.getElementById("modalMatriculados");
    const lista = document.getElementById("matriculadosLista");
    lista.innerHTML = '<p class="help">Carregando…</p>';
    modal.classList.add("show");
    try {
      const res = await fetch("/api/turmas/" + t._id + "/matriculados", { headers: authHeaders() });
      const matriculas = await res.json();
      if (!matriculas.length) { lista.innerHTML = '<div class="empty-state">Nenhum aluno matriculado ainda.</div>'; return; }
      lista.innerHTML = matriculas.map(m =>
        '<div class="resumo-linha"><span class="label">' + (m.alunoId?.nome || "—") + " — " + (m.alunoId?.email || "") + '</span>' +
        '<span class="badge badge-' + m.status + '">' + m.status + "</span></div>"
      ).join("");
    } catch (e) {
      lista.innerHTML = '<p class="field-error" style="display:block;">Erro ao carregar.</p>';
    }
  }
  document.getElementById("btnFecharMatriculados").addEventListener("click", () => document.getElementById("modalMatriculados").classList.remove("show"));

  // ---------- PROFESSORES ----------
  async function carregarProfessores() {
    const tbody = document.getElementById("professoresTbody");
    tbody.innerHTML = '<tr><td colspan="6">Carregando…</td></tr>';
    professoresCache = [];
    try {
      const profs = await carregarProfessoresCache();
      if (!profs.length) { tbody.innerHTML = '<tr><td colspan="6">Nenhum professor cadastrado.</td></tr>'; return; }
      tbody.innerHTML = "";
      profs.forEach(p => {
        const tr = document.createElement("tr");
        tr.innerHTML =
          "<td>" + p.nome + "</td><td>" + p.email + "</td><td>" + (p.perfilProfessor?.idiomas || []).join(", ") + "</td>" +
          '<td><span style="display:inline-block;width:16px;height:16px;border-radius:50%;background:' + (p.perfilProfessor?.corAgenda || "#4F6B4A") + ';vertical-align:-3px;margin-right:6px;"></span>' + (p.perfilProfessor?.corAgenda || "#4F6B4A") + "</td>" +
          "<td>" + (p.perfilProfessor?.ativoParaAulas !== false ? "Sim" : "Não") + "</td><td></td>";
        const btnEdit = document.createElement("button");
        btnEdit.className = "btn-outline btn-small"; btnEdit.textContent = "Editar";
        btnEdit.addEventListener("click", () => abrirModalProfessor(p));
        tr.lastElementChild.appendChild(btnEdit);
        tbody.appendChild(tr);
      });
    } catch (e) {
      tbody.innerHTML = '<tr><td colspan="6">Erro ao carregar professores.</td></tr>';
    }
  }

  function abrirModalProfessor(p) {
    document.getElementById("profId").value = p._id;
    document.getElementById("profBio").value = p.perfilProfessor?.bio || "";
    document.getElementById("profIdiomas").value = (p.perfilProfessor?.idiomas || []).join(", ");
    document.getElementById("profCor").value = p.perfilProfessor?.corAgenda || "#4F6B4A";
    document.getElementById("profAtivo").checked = p.perfilProfessor?.ativoParaAulas !== false;
    document.getElementById("modalProfessor").classList.add("show");
  }
  document.getElementById("btnFecharProf").addEventListener("click", () => document.getElementById("modalProfessor").classList.remove("show"));
  document.getElementById("btnSalvarProf").addEventListener("click", async () => {
    const id = document.getElementById("profId").value;
    const body = {
      bio: document.getElementById("profBio").value.trim(),
      idiomas: document.getElementById("profIdiomas").value.split(",").map(s => s.trim()).filter(Boolean),
      corAgenda: document.getElementById("profCor").value.trim() || "#4F6B4A",
      ativoParaAulas: document.getElementById("profAtivo").checked
    };
    await fetch("/api/admin-matricula/professores/" + id + "/perfil", { method: "PUT", headers: authHeaders(true), body: JSON.stringify(body) });
    document.getElementById("modalProfessor").classList.remove("show");
    professoresCache = [];
    carregarProfessores();
  });

  // ---------- CUPONS ----------
  async function carregarCupons() {
    const tbody = document.getElementById("cuponsTbody");
    tbody.innerHTML = '<tr><td colspan="7">Carregando…</td></tr>';
    try {
      const res = await fetch("/api/cupons", { headers: authHeaders() });
      const cupons = await res.json();
      if (!cupons.length) { tbody.innerHTML = '<tr><td colspan="7">Nenhum cupom cadastrado.</td></tr>'; return; }
      tbody.innerHTML = "";
      cupons.forEach(c => {
        const tr = document.createElement("tr");
        const valorFmt = c.tipo === "percentual" ? c.valor + "%" : fmtMoeda(c.valor);
        tr.innerHTML =
          "<td>" + c.codigo + "</td><td>" + (c.tipo === "percentual" ? "Percentual" : "Valor fixo") + "</td><td>" + valorFmt + "</td>" +
          "<td>" + fmtData(c.validoAte) + "</td><td>" + c.usosAtuais + (c.usoMaximo ? "/" + c.usoMaximo : "") + "</td>" +
          '<td><span class="badge ' + (c.ativo ? "badge-confirmada" : "badge-cancelada") + '">' + (c.ativo ? "Ativo" : "Inativo") + "</span></td><td></td>";
        if (c.ativo) {
          const btnDesativar = document.createElement("button");
          btnDesativar.className = "btn-danger btn-small"; btnDesativar.textContent = "Desativar";
          btnDesativar.addEventListener("click", async () => {
            if (!confirm("Desativar o cupom " + c.codigo + "?")) return;
            await fetch("/api/cupons/" + c._id, { method: "DELETE", headers: authHeaders() });
            carregarCupons();
          });
          tr.lastElementChild.appendChild(btnDesativar);
        }
        tbody.appendChild(tr);
      });
    } catch (e) {
      tbody.innerHTML = '<tr><td colspan="7">Erro ao carregar cupons.</td></tr>';
    }
  }

  document.getElementById("btnNovoCupom").addEventListener("click", () => {
    document.getElementById("cupomCodigo").value = "";
    document.getElementById("cupomTipo").value = "percentual";
    document.getElementById("cupomValor").value = "";
    document.getElementById("cupomValidoAte").value = "";
    document.getElementById("cupomUsoMaximo").value = "";
    document.getElementById("cupomErro").style.display = "none";
    document.getElementById("modalCupom").classList.add("show");
  });
  document.getElementById("btnFecharCupom").addEventListener("click", () => document.getElementById("modalCupom").classList.remove("show"));
  document.getElementById("btnSalvarCupom").addEventListener("click", async () => {
    const erroEl = document.getElementById("cupomErro");
    const body = {
      codigo: document.getElementById("cupomCodigo").value.trim(),
      tipo: document.getElementById("cupomTipo").value,
      valor: Number(document.getElementById("cupomValor").value),
      validoAte: document.getElementById("cupomValidoAte").value || null,
      usoMaximo: document.getElementById("cupomUsoMaximo").value ? Number(document.getElementById("cupomUsoMaximo").value) : null
    };
    if (!body.codigo || !body.valor) { erroEl.textContent = "Preencha código e valor."; erroEl.style.display = "block"; return; }
    try {
      const res = await fetch("/api/cupons", { method: "POST", headers: authHeaders(true), body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { erroEl.textContent = data.msg || "Erro ao criar cupom."; erroEl.style.display = "block"; return; }
      document.getElementById("modalCupom").classList.remove("show");
      carregarCupons();
    } catch (e) {
      erroEl.textContent = "Erro de conexão."; erroEl.style.display = "block";
    }
  });

  // ---------- PAGAMENTOS ----------
  async function carregarPagamentos() {
    const tbody = document.getElementById("pagamentosTbody");
    tbody.innerHTML = '<tr><td colspan="5">Carregando…</td></tr>';
    try {
      const res = await fetch("/api/admin-matricula/pagamentos", { headers: authHeaders() });
      const pagamentos = await res.json();
      if (!pagamentos.length) { tbody.innerHTML = '<tr><td colspan="5">Nenhum pagamento registrado.</td></tr>'; return; }
      tbody.innerHTML = pagamentos.map(p =>
        "<tr><td>" + new Date(p.criadoEm).toLocaleString("pt-BR") + "</td><td>" + (p.alunoId?.nome || "—") + "</td>" +
        "<td>" + p.metodoPagamento + "</td><td>" + fmtMoeda(p.valor) + '</td><td><span class="badge badge-' + p.status + '">' + p.status + "</span></td></tr>"
      ).join("");
    } catch (e) {
      tbody.innerHTML = '<tr><td colspan="5">Erro ao carregar pagamentos.</td></tr>';
    }
  }

  carregarDashboard();
})();
