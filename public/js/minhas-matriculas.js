(function () {
  const tk = localStorage.getItem("token");
  if (!tk) {
    window.location.href = "login.html?redirect=minhas-matriculas.html";
    return;
  }
  function authHeaders(json) {
    const h = { Authorization: "Bearer " + tk };
    if (json) h["Content-Type"] = "application/json";
    return h;
  }
  function fmtMoeda(v) { return (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
  function fmtDataHora(d) { return new Date(d).toLocaleString("pt-BR", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); }
  const STATUS_LABEL = {
    pendente_pagamento: "Aguardando pagamento", confirmada: "Confirmada",
    cancelada: "Cancelada", concluida: "Concluída"
  };

  async function carregar() {
    const lista = document.getElementById("listaMatriculas");
    lista.innerHTML = '<p class="help">Carregando…</p>';
    try {
      const res = await fetch("/api/matricula/minhas", { headers: authHeaders() });
      const matriculas = await res.json();
      if (!matriculas.length) {
        lista.innerHTML = '<div class="empty-state"><div class="icon">🎯</div>Você ainda não tem nenhuma matrícula.<br><br><a href="matricula.html" class="btn-primary" style="display:inline-block;text-decoration:none;">Fazer minha primeira matrícula</a></div>';
        return;
      }
      lista.innerHTML = "";
      for (const m of matriculas) lista.appendChild(await renderMatricula(m));
    } catch (e) {
      lista.innerHTML = '<p class="field-error" style="display:block;">Não foi possível carregar suas matrículas.</p>';
    }
  }

  async function renderMatricula(m) {
    const card = document.createElement("div");
    card.className = "list-item";

    let titulo, sub;
    if (m.tipo === "turma") {
      titulo = m.turmaId ? m.turmaId.nome + " — " + m.turmaId.nivel : "Turma";
      sub = m.turmaId ? (m.turmaId.dias || []).join(", ") + " às " + m.turmaId.horario : "";
    } else {
      titulo = m.pacote?.nome || "Aula particular";
      sub = "Professor: " + (m.professorId?.nome || "—");
    }

    let horariosHtml = "";
    if (m.tipo === "particular" && m.horarios?.length) {
      horariosHtml = '<div style="margin-top:10px;">' + m.horarios
        .slice().sort((a, b) => new Date(a.dataHoraInicio) - new Date(b.dataHoraInicio))
        .map(h => {
          const podeRemarcar = m.status === "confirmada";
          return '<div class="resumo-linha"><span class="label">' + fmtDataHora(h.dataHoraInicio) + '</span>' +
            (podeRemarcar ? '<button type="button" class="btn-outline btn-small" data-remarcar="' + m._id + '" data-horario="' + h._id + '">Remarcar</button>' : "") +
            "</div>";
        }).join("") + "</div>";
    }

    let materialHtml = "";
    if (m.tipo === "turma" && m.turmaId && (m.turmaId.materialUrl || m.turmaId.zoomLink) && m.status === "confirmada") {
      materialHtml = '<div class="list-item-actions">' +
        (m.turmaId.zoomLink ? '<a href="' + m.turmaId.zoomLink + '" target="_blank" class="btn-outline btn-small" style="text-decoration:none;">Link do Zoom</a>' : "") +
        (m.turmaId.materialUrl ? '<a href="' + m.turmaId.materialUrl + '" target="_blank" class="btn-outline btn-small" style="text-decoration:none;">Material de apoio</a>' : "") +
        "</div>";
    }

    card.innerHTML =
      '<div class="list-item-head">' +
        '<div><div class="list-item-title">' + titulo + '</div><div class="list-item-sub">' + sub + '</div></div>' +
        '<span class="badge badge-' + m.status + '">' + (STATUS_LABEL[m.status] || m.status) + '</span>' +
      '</div>' +
      '<div class="resumo-linha"><span class="label">Valor</span><span class="valor">' +
        (m.precoFinal === 0 && m.tipo === "turma" ? "Incluído no seu plano" : fmtMoeda(m.precoFinal)) +
      '</span></div>' +
      horariosHtml + materialHtml +
      '<div class="list-item-actions" id="acoes-' + m._id + '"></div>';

    const acoes = card.querySelector("#acoes-" + m._id);
    if (m.status === "pendente_pagamento") {
      const btnPagar = document.createElement("a");
      btnPagar.href = "matricula.html"; btnPagar.className = "btn-primary btn-small"; btnPagar.style.textDecoration = "none";
      btnPagar.textContent = "Concluir pagamento";
      acoes.appendChild(btnPagar);
    }
    if (m.status === "pendente_pagamento" || m.status === "confirmada") {
      const btnCancelar = document.createElement("button");
      btnCancelar.type = "button"; btnCancelar.className = "btn-danger btn-small";
      btnCancelar.textContent = "Cancelar";
      btnCancelar.addEventListener("click", () => cancelarMatricula(m._id));
      acoes.appendChild(btnCancelar);
    }

    card.querySelectorAll("[data-remarcar]").forEach(btn => {
      btn.addEventListener("click", () => abrirRemarcar(m, btn.dataset.horario));
    });

    return card;
  }

  async function cancelarMatricula(id) {
    if (!confirm("Tem certeza que deseja cancelar esta matrícula?")) return;
    try {
      const res = await fetch("/api/matricula/" + id + "/cancelar", { method: "POST", headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) { alert(data.msg || "Não foi possível cancelar."); return; }
      carregar();
    } catch (e) {
      alert("Erro de conexão.");
    }
  }

  async function abrirRemarcar(matricula, horarioAntigoId) {
    const modal = document.getElementById("modalRemarcar");
    const container = document.getElementById("remarcarHorarios");
    container.innerHTML = '<p class="help">Carregando horários disponíveis…</p>';
    modal.classList.add("show");
    try {
      const res = await fetch("/api/disponibilidade?professorId=" + matricula.professorId._id, { headers: authHeaders() });
      const slots = await res.json();
      if (!slots.length) {
        container.innerHTML = '<div class="empty-state">Nenhum horário disponível no momento.</div>';
        return;
      }
      container.innerHTML = "";
      const grid = document.createElement("div");
      grid.className = "slot-grid";
      slots.forEach(s => {
        const btn = document.createElement("button");
        btn.type = "button"; btn.className = "slot-btn";
        btn.textContent = fmtDataHora(s.dataHoraInicio);
        btn.addEventListener("click", async () => {
          btn.disabled = true;
          try {
            const r = await fetch("/api/matricula/" + matricula._id + "/remarcar", {
              method: "POST", headers: authHeaders(true),
              body: JSON.stringify({ horarioAntigoId, horarioNovoId: s._id })
            });
            const data = await r.json();
            if (!r.ok) { alert(data.msg || "Não foi possível remarcar."); btn.disabled = false; return; }
            modal.classList.remove("show");
            carregar();
          } catch (e) {
            alert("Erro de conexão.");
            btn.disabled = false;
          }
        });
        grid.appendChild(btn);
      });
      container.appendChild(grid);
    } catch (e) {
      container.innerHTML = '<p class="field-error" style="display:block;">Erro ao carregar horários.</p>';
    }
  }

  document.getElementById("btnFecharRemarcar").addEventListener("click", () => {
    document.getElementById("modalRemarcar").classList.remove("show");
  });

  carregar();
})();
