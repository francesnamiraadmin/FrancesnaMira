(function () {
  const tk = localStorage.getItem("token");
  if (!tk) { window.location.href = "login.html?redirect=admin-agenda.html"; return; }
  function authHeaders(json) {
    const h = { Authorization: "Bearer " + tk };
    if (json) h["Content-Type"] = "application/json";
    return h;
  }
  const DIAS_NOME = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
  const STATUS_LABEL = { disponivel: "Disponível", reservado: "Reservado", bloqueado: "Bloqueado", concluido: "Concluído" };

  let meuId = null;
  let meuRole = null;
  let professorAtual = null;
  let weekStart = domingoDaSemana(new Date());
  let slotSelecionado = null;
  let modoModalSlot = "novo"; // 'novo' | 'mover'
  let diaSelecionadoAdd = null;

  function domingoDaSemana(d) {
    const r = new Date(d);
    r.setDate(r.getDate() - r.getDay());
    r.setHours(0, 0, 0, 0);
    return r;
  }
  function fmtDataCurta(d) { return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }); }
  function fmtHora(d) { return new Date(d).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); }
  function toISODate(d) { return d.toISOString().slice(0, 10); }

  async function init() {
    const meRes = await fetch("/api/auth/me", { headers: authHeaders() });
    const me = await meRes.json();
    meuRole = me.role;
    if (meuRole !== "professor" && meuRole !== "admin") { window.location.href = "minha-conta.html"; return; }

    const meResFull = await fetch("/api/admin-matricula/professores", { headers: authHeaders() }).catch(() => null);
    let profs = [];
    if (meuRole === "admin" && meResFull && meResFull.ok) profs = await meResFull.json();

    const sel = document.getElementById("professorSelect");
    if (meuRole === "admin" && profs.length) {
      sel.innerHTML = profs.map(p => '<option value="' + p._id + '">' + p.nome + "</option>").join("");
      sel.style.display = "inline-block";
      sel.addEventListener("change", () => { professorAtual = sel.value; renderCalendario(); });
      professorAtual = sel.value;
    } else {
      sel.style.display = "none";
      // professor comum: usa o próprio id (buscado via /me não retorna _id; usamos o token decodificado)
      professorAtual = payloadId();
    }

    renderCalendario();

    const sse = new EventSource("/api/disponibilidade/stream");
    sse.addEventListener("disponibilidade-atualizada", () => renderCalendario());
    window.addEventListener("beforeunload", () => sse.close());
  }

  function payloadId() {
    try {
      const payload = JSON.parse(atob(tk.split(".")[1]));
      return payload.id;
    } catch (e) { return null; }
  }

  document.getElementById("btnSemanaAnterior").addEventListener("click", () => { weekStart.setDate(weekStart.getDate() - 7); renderCalendario(); });
  document.getElementById("btnSemanaSeguinte").addEventListener("click", () => { weekStart.setDate(weekStart.getDate() + 7); renderCalendario(); });
  document.getElementById("btnHoje").addEventListener("click", () => { weekStart = domingoDaSemana(new Date()); renderCalendario(); });

  async function renderCalendario() {
    if (!professorAtual) return;
    const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 7);
    document.getElementById("calTitulo").textContent = fmtDataCurta(weekStart) + " – " + fmtDataCurta(new Date(weekEnd - 86400000));

    const grid = document.getElementById("calGrid");
    grid.innerHTML = '<p class="help">Carregando…</p>';
    try {
      const res = await fetch("/api/disponibilidade?professorId=" + professorAtual + "&todos=1&de=" + weekStart.toISOString() + "&ate=" + weekEnd.toISOString(), { headers: authHeaders() });
      const slots = await res.json();
      const porDia = [[], [], [], [], [], [], []];
      slots.forEach(s => {
        const idx = new Date(s.dataHoraInicio).getDay();
        porDia[idx].push(s);
      });

      grid.innerHTML = "";
      for (let i = 0; i < 7; i++) {
        const dia = new Date(weekStart); dia.setDate(dia.getDate() + i);
        const col = document.createElement("div");
        col.className = "cal-day-col";
        const heading = document.createElement("div");
        heading.className = "cal-day-name";
        heading.textContent = DIAS_NOME[i] + " " + fmtDataCurta(dia);
        col.appendChild(heading);

        porDia[i].sort((a, b) => new Date(a.dataHoraInicio) - new Date(b.dataHoraInicio)).forEach(s => {
          const chip = document.createElement("div");
          chip.className = "cal-slot " + s.status;
          chip.textContent = fmtHora(s.dataHoraInicio) + (s.status !== "disponivel" ? " · " + STATUS_LABEL[s.status] : "");
          chip.addEventListener("click", () => abrirAcoesSlot(s));
          col.appendChild(chip);
        });

        const btnAdd = document.createElement("button");
        btnAdd.type = "button"; btnAdd.className = "cal-add-btn"; btnAdd.textContent = "+ horário";
        btnAdd.addEventListener("click", () => abrirNovoSlot(dia));
        col.appendChild(btnAdd);

        grid.appendChild(col);
      }
    } catch (e) {
      grid.innerHTML = '<p class="field-error" style="display:block;">Erro ao carregar a agenda.</p>';
    }
  }

  // ---------- MODAL: NOVO / MOVER ----------
  function abrirNovoSlot(dia) {
    modoModalSlot = "novo";
    slotSelecionado = null;
    document.getElementById("modalSlotTitulo").textContent = "Novo horário";
    document.getElementById("slotData").value = toISODate(dia);
    document.getElementById("slotHora").value = "";
    document.getElementById("slotDuracao").value = 60;
    document.getElementById("slotErro").style.display = "none";
    document.getElementById("modalSlot").classList.add("show");
  }

  function abrirMoverSlot(slot) {
    modoModalSlot = "mover";
    slotSelecionado = slot;
    document.getElementById("modalSlotTitulo").textContent = "Alterar data/hora";
    const d = new Date(slot.dataHoraInicio);
    document.getElementById("slotData").value = toISODate(d);
    document.getElementById("slotHora").value = fmtHora(d);
    document.getElementById("slotDuracao").value = slot.duracaoMinutos;
    document.getElementById("slotErro").style.display = "none";
    document.getElementById("modalAcoesSlot").classList.remove("show");
    document.getElementById("modalSlot").classList.add("show");
  }

  document.getElementById("btnFecharSlot").addEventListener("click", () => document.getElementById("modalSlot").classList.remove("show"));
  document.getElementById("btnSalvarSlot").addEventListener("click", async () => {
    const erroEl = document.getElementById("slotErro");
    const data = document.getElementById("slotData").value;
    const hora = document.getElementById("slotHora").value.trim();
    const duracao = Number(document.getElementById("slotDuracao").value) || 60;
    if (!data || !/^\d{1,2}:\d{2}$/.test(hora)) { erroEl.textContent = "Informe data e hora válidas (HH:MM)."; erroEl.style.display = "block"; return; }
    const dataHoraInicio = new Date(data + "T" + hora.padStart(5, "0") + ":00");

    try {
      let res;
      if (modoModalSlot === "novo") {
        res = await fetch("/api/disponibilidade", {
          method: "POST", headers: authHeaders(true),
          body: JSON.stringify({ professorId: professorAtual, dataHoraInicio, duracaoMinutos: duracao })
        });
      } else {
        res = await fetch("/api/disponibilidade/" + slotSelecionado._id + "/mover", {
          method: "POST", headers: authHeaders(true), body: JSON.stringify({ dataHoraInicio })
        });
      }
      const dataResp = await res.json();
      if (!res.ok) { erroEl.textContent = dataResp.msg || "Erro ao salvar."; erroEl.style.display = "block"; return; }
      document.getElementById("modalSlot").classList.remove("show");
      renderCalendario();
    } catch (e) {
      erroEl.textContent = "Erro de conexão."; erroEl.style.display = "block";
    }
  });

  // ---------- MODAL: AÇÕES DO SLOT ----------
  function abrirAcoesSlot(slot) {
    slotSelecionado = slot;
    document.getElementById("acoesSlotInfo").textContent =
      fmtHora(slot.dataHoraInicio) + " · " + slot.duracaoMinutos + " min · " + STATUS_LABEL[slot.status] +
      (slot.status === "reservado" ? " (não pode ser movido/excluído até ser liberado)" : "");
    document.getElementById("btnBloquearSlot").style.display = slot.status === "disponivel" ? "block" : "none";
    document.getElementById("btnLiberarSlot").style.display = slot.status === "bloqueado" || slot.status === "reservado" ? "block" : "none";
    document.getElementById("btnMoverSlot").style.display = slot.status === "reservado" ? "none" : "block";
    document.getElementById("btnExcluirSlot").style.display = slot.status === "reservado" ? "none" : "block";
    document.getElementById("modalAcoesSlot").classList.add("show");
  }
  document.getElementById("btnFecharAcoesSlot").addEventListener("click", () => document.getElementById("modalAcoesSlot").classList.remove("show"));
  document.getElementById("btnMoverSlot").addEventListener("click", () => abrirMoverSlot(slotSelecionado));
  document.getElementById("btnDuplicarSlot").addEventListener("click", async () => {
    const novaData = new Date(slotSelecionado.dataHoraInicio); novaData.setDate(novaData.getDate() + 7);
    await fetch("/api/disponibilidade/" + slotSelecionado._id + "/duplicar", {
      method: "POST", headers: authHeaders(true), body: JSON.stringify({ dataHoraInicio: novaData })
    });
    document.getElementById("modalAcoesSlot").classList.remove("show");
    renderCalendario();
  });
  document.getElementById("btnBloquearSlot").addEventListener("click", async () => {
    await fetch("/api/disponibilidade/" + slotSelecionado._id + "/bloquear", { method: "POST", headers: authHeaders() });
    document.getElementById("modalAcoesSlot").classList.remove("show");
    renderCalendario();
  });
  document.getElementById("btnLiberarSlot").addEventListener("click", async () => {
    if (slotSelecionado.status === "reservado" && !confirm("Este horário está reservado por um aluno. Liberá-lo cancela a reserva. Continuar?")) return;
    await fetch("/api/disponibilidade/" + slotSelecionado._id + "/liberar", { method: "POST", headers: authHeaders() });
    document.getElementById("modalAcoesSlot").classList.remove("show");
    renderCalendario();
  });
  document.getElementById("btnExcluirSlot").addEventListener("click", async () => {
    if (!confirm("Excluir este horário?")) return;
    const res = await fetch("/api/disponibilidade/" + slotSelecionado._id, { method: "DELETE", headers: authHeaders() });
    const data = await res.json();
    if (!res.ok) { alert(data.msg || "Não foi possível excluir."); return; }
    document.getElementById("modalAcoesSlot").classList.remove("show");
    renderCalendario();
  });

  // ---------- MODAL: RECORRÊNCIA ----------
  document.getElementById("btnRecorrente").addEventListener("click", () => {
    document.getElementById("recErro").style.display = "none";
    document.getElementById("modalRecorrente").classList.add("show");
  });
  document.getElementById("btnFecharRecorrente").addEventListener("click", () => document.getElementById("modalRecorrente").classList.remove("show"));
  document.getElementById("btnSalvarRecorrente").addEventListener("click", async () => {
    const erroEl = document.getElementById("recErro");
    const body = {
      professorId: professorAtual,
      diaSemana: document.getElementById("recDiaSemana").value,
      hora: document.getElementById("recHora").value.trim(),
      duracaoMinutos: Number(document.getElementById("recDuracao").value) || 60,
      semanas: Number(document.getElementById("recSemanas").value) || 1,
      dataInicial: weekStart
    };
    if (!/^\d{1,2}:\d{2}$/.test(body.hora)) { erroEl.textContent = "Informe uma hora válida (HH:MM)."; erroEl.style.display = "block"; return; }
    try {
      const res = await fetch("/api/disponibilidade/recorrente", { method: "POST", headers: authHeaders(true), body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { erroEl.textContent = data.msg || "Erro ao criar horários."; erroEl.style.display = "block"; return; }
      document.getElementById("modalRecorrente").classList.remove("show");
      renderCalendario();
    } catch (e) {
      erroEl.textContent = "Erro de conexão."; erroEl.style.display = "block";
    }
  });

  init();
})();
