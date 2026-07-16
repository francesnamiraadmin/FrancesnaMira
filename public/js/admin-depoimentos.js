(function () {
  const tk = localStorage.getItem("token");
  if (!tk) { window.location.href = "login.html?redirect=admin-depoimentos.html"; return; }
  function authHeaders(json) {
    const h = { Authorization: "Bearer " + tk };
    if (json) h["Content-Type"] = "application/json";
    return h;
  }
  function fmtData(d) { return d ? new Date(d).toLocaleDateString("pt-BR") : "—"; }
  function estrelas(n) { return "★".repeat(n) + "☆".repeat(5 - n); }
  function escapeHtml(s) {
    return (s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  fetch("/api/auth/me", { headers: authHeaders() }).then(r => r.json()).then(d => {
    if (d.role !== "admin") window.location.href = "minha-conta.html";
  });

  let statusAtual = "pendente";
  let depoimentoSelecionado = null;

  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      statusAtual = btn.dataset.status;
      carregarDepoimentos();
    });
  });

  async function carregarDepoimentos() {
    const tbody = document.getElementById("depoimentosTbody");
    tbody.innerHTML = '<tr><td colspan="8">Carregando…</td></tr>';
    try {
      const res = await fetch("/api/depoimentos/admin/todos?status=" + statusAtual, { headers: authHeaders() });
      const depoimentos = await res.json();
      if (!Array.isArray(depoimentos) || depoimentos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8">Nenhum depoimento nesta categoria.</td></tr>';
        return;
      }
      tbody.innerHTML = depoimentos.map(d => {
        const foto = d.consentimento?.aceito ? (d.foto || d.alunoId?.perfil?.foto) : null;
        const fotoHtml = foto ? `<img class="dep-foto" src="${foto}" alt="">` : '<span class="dep-sem-foto">👤</span>';
        const plano = d.alunoId?.plano?.ativo ? d.alunoId.plano.tier : "—";
        return `<tr data-id="${d._id}">
          <td>${fotoHtml}</td>
          <td>${escapeHtml(d.alunoId?.nome || "—")}</td>
          <td>${escapeHtml(plano)}</td>
          <td><strong>${escapeHtml(d.titulo)}</strong><br><span class="dep-texto-truncado">${escapeHtml(d.texto)}</span></td>
          <td class="dep-estrelas">${estrelas(d.nota)}</td>
          <td>${fmtData(d.criadoEm)}</td>
          <td>${d.consentimento?.aceito ? "✓ Sim" : "✗ Não"}</td>
          <td><button type="button" class="btn-outline btn-small" data-ver="${d._id}">Ver</button></td>
        </tr>`;
      }).join("");

      tbody.querySelectorAll("[data-ver]").forEach(btn => {
        btn.addEventListener("click", () => {
          const dep = depoimentos.find(x => x._id === btn.dataset.ver);
          abrirModal(dep);
        });
      });
    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="8">Erro ao carregar depoimentos.</td></tr>';
    }
  }

  function abrirModal(dep) {
    depoimentoSelecionado = dep;
    document.getElementById("modalTitulo").textContent = dep.titulo;
    document.getElementById("modalNome").textContent = dep.alunoId?.nome || "—";
    document.getElementById("modalPlano").textContent = dep.alunoId?.plano?.ativo ? "Plano " + dep.alunoId.plano.tier : "Sem plano ativo";
    document.getElementById("modalEstrelas").textContent = estrelas(dep.nota);
    document.getElementById("modalTexto").textContent = dep.texto;
    document.getElementById("modalTempo").textContent = dep.tempoUso || "—";
    document.getElementById("modalConsentimento").textContent = dep.consentimento?.aceito ? "Concedido" : "Não concedido";
    document.getElementById("btnModalDestacar").textContent = dep.destaque ? "Remover destaque" : "Destacar";
    document.getElementById("modalDetalhe").classList.add("show");
  }
  function fecharModal() { document.getElementById("modalDetalhe").classList.remove("show"); }
  document.getElementById("btnFecharModal").addEventListener("click", fecharModal);

  async function moderar(acao, corpo) {
    if (!depoimentoSelecionado) return;
    try {
      await fetch("/api/depoimentos/admin/" + depoimentoSelecionado._id + "/" + acao, {
        method: "PUT", headers: authHeaders(true), body: JSON.stringify(corpo || {})
      });
      fecharModal();
      carregarDepoimentos();
    } catch (err) { /* silencioso */ }
  }
  document.getElementById("btnModalAprovar").addEventListener("click", () => moderar("aprovar"));
  document.getElementById("btnModalRejeitar").addEventListener("click", () => moderar("rejeitar"));
  document.getElementById("btnModalDestacar").addEventListener("click", () => moderar("destacar", { destaque: !depoimentoSelecionado.destaque }));

  carregarDepoimentos();
})();
