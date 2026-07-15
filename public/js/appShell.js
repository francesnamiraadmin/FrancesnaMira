// ===================== APP SHELL — NAVBAR DA ÁREA LOGADA =====================
// Módulo único reaproveitado por todas as páginas autenticadas (Minha Conta,
// Minhas Inscrições, Plataforma de Questões, Ambiente de Produção, Aulas
// Especializadas). Faz a guarda de autenticação, busca /api/auth/me uma vez,
// renderiza a navbar em #app-navbar e avisa a página via evento "appshell:ready".
(function () {
  const AVATAR_PADRAO = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" fill="#3b96ff"/><circle cx="48" cy="38" r="18" fill="#ffffff"/><ellipse cx="48" cy="88" rx="30" ry="24" fill="#ffffff"/></svg>`
  );

  const ESTILOS_PLANO = {
    Essentiel: { background: "rgba(205,127,50,0.35)", border: "#cd7f32", color: "#ffffff" },
    "Avancé": { background: "rgba(210,210,210,0.35)", border: "#c0c0c0", color: "#08203e" },
    Excellence: { background: "rgba(255,215,0,0.35)", border: "#ffd700", color: "#08203e" }
  };
  const PROXIMO_TIER = { Essentiel: "Avancé", "Avancé": "Excellence" };

  // Mesma cascata usada pelas guardas de página (correcoes-texto.html, aulas-especializadas.html,
  // plataforma-questoes.html): um plano de curso ativo já libera esses recursos por tier,
  // independentemente de uma compra avulsa do Pack Prestige — os dois caminhos são independentes.
  const CASCATA_POR_TIER = {
    producao: ["Essentiel", "Avancé", "Excellence"],
    aulasEspecializadas: ["Avancé", "Excellence"],
    plataforma: ["Excellence"]
  };

  const PRODUTOS_NAV = [
    { chave: "plataforma", nome: "Plataforma de Questões", href: "plataforma-questoes.html", curso: "Plataforma de Questões" },
    { chave: "producao", nome: "Ambiente de Produção", href: "correcoes-texto.html", curso: "Ambiente de Produção Oral e Textual" },
    { chave: "aulasEspecializadas", nome: "Aulas Especializadas", href: "aulas-especializadas.html", curso: "Aulas Especializadas Online" }
  ];

  const token = localStorage.getItem("token");
  if (!token) {
    const atual = location.pathname.split("/").pop() || "minha-conta.html";
    window.location.href = "login.html?redirect=" + encodeURIComponent(atual);
    return;
  }

  window.AppShell = {
    dadosConta: null,
    detalhesAcesso(chave) {
      const d = window.AppShell.dadosConta;
      const avulso = d?.produtosAvulsos?.[chave] || {};
      const tier = d?.plano?.ativo ? d.plano.tier : null;
      const viaCascata = !!(tier && CASCATA_POR_TIER[chave] && CASCATA_POR_TIER[chave].includes(tier));
      const viaAvulso = !!avulso.ativo;
      return { ativo: viaCascata || viaAvulso, viaCascata, viaAvulso, dataVencimentoAvulso: avulso.dataVencimento || null };
    },
    temAcesso(chave) {
      return window.AppShell.detalhesAcesso(chave).ativo;
    },
    abrirModalFoto() { montarModalFoto(); }
  };

  function fecharTodosDropdowns() {
    document.querySelectorAll(".app-dropdown.show").forEach(d => d.classList.remove("show"));
  }

  function ligarDropdown(botaoId, dropdownId) {
    const btn = document.getElementById(botaoId);
    const dd = document.getElementById(dropdownId);
    if (!btn || !dd) return;
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const jaAberto = dd.classList.contains("show");
      fecharTodosDropdowns();
      if (!jaAberto) dd.classList.add("show");
    });
  }
  document.addEventListener("click", fecharTodosDropdowns);

  function montarModalFoto() {
    const foto = window.AppShell.dadosConta.perfil?.foto || AVATAR_PADRAO;
    const overlay = document.createElement("div");
    overlay.className = "app-modal-overlay";
    overlay.innerHTML = `
      <div class="app-modal">
        <h3>Alterar foto de perfil</h3>
        <img class="app-modal-avatar-preview" id="appFotoPreview" src="${foto}" alt="">
        <input type="file" id="appFotoInput" accept="image/*" style="display:none;">
        <p style="text-align:center; font-size:0.85rem; color:var(--text-muted);">Clique na foto para escolher uma nova imagem.</p>
        <div class="app-modal-msg" id="appFotoMsg"></div>
        <div class="app-modal-actions">
          <button class="dash-btn secundario" id="appFotoCancelar" type="button">Cancelar</button>
          <button class="dash-btn" id="appFotoSalvar" type="button">Salvar</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("show"));

    let novaFoto;
    const preview = overlay.querySelector("#appFotoPreview");
    const input = overlay.querySelector("#appFotoInput");
    preview.addEventListener("click", () => input.click());
    input.addEventListener("change", e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        const img = new Image();
        img.onload = () => {
          const size = 300;
          const canvas = document.createElement("canvas");
          canvas.width = size; canvas.height = size;
          const ctx = canvas.getContext("2d");
          const scale = Math.max(size / img.width, size / img.height);
          const w = img.width * scale, h = img.height * scale;
          ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
          novaFoto = canvas.toDataURL("image/jpeg", 0.85);
          preview.src = novaFoto;
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    });

    function fechar() { overlay.classList.remove("show"); setTimeout(() => overlay.remove(), 200); }
    overlay.querySelector("#appFotoCancelar").addEventListener("click", fechar);
    overlay.addEventListener("click", e => { if (e.target === overlay) fechar(); });

    overlay.querySelector("#appFotoSalvar").addEventListener("click", async () => {
      const msg = overlay.querySelector("#appFotoMsg");
      if (!novaFoto) { fechar(); return; }
      msg.style.color = "var(--text)";
      msg.textContent = "Salvando...";
      try {
        const res = await fetch("/api/auth/perfil", {
          method: "PUT",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
          body: JSON.stringify({ foto: novaFoto })
        });
        const data = await res.json();
        if (res.ok) {
          window.AppShell.dadosConta.perfil = data.perfil;
          document.querySelectorAll(".app-nav-user img, .dash-avatar").forEach(img => img.src = novaFoto);
          fechar();
        } else {
          msg.style.color = "var(--danger-text)";
          msg.textContent = data.msg || "Erro ao salvar a foto.";
        }
      } catch (err) {
        msg.style.color = "var(--danger-text)";
        msg.textContent = "Erro ao conectar ao servidor.";
      }
    });
  }

  function montarModalSenha() {
    const overlay = document.createElement("div");
    overlay.className = "app-modal-overlay";
    overlay.innerHTML = `
      <div class="app-modal">
        <h3>Alterar senha</h3>
        <label for="appSenhaAtual">Senha atual</label>
        <input type="password" id="appSenhaAtual">
        <label for="appSenhaNova">Nova senha</label>
        <input type="password" id="appSenhaNova">
        <div class="app-modal-msg" id="appSenhaMsg"></div>
        <div class="app-modal-actions">
          <button class="dash-btn secundario" id="appSenhaCancelar" type="button">Cancelar</button>
          <button class="dash-btn" id="appSenhaSalvar" type="button">Salvar</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("show"));

    function fechar() { overlay.classList.remove("show"); setTimeout(() => overlay.remove(), 200); }
    overlay.querySelector("#appSenhaCancelar").addEventListener("click", fechar);
    overlay.addEventListener("click", e => { if (e.target === overlay) fechar(); });

    overlay.querySelector("#appSenhaSalvar").addEventListener("click", async () => {
      const msg = overlay.querySelector("#appSenhaMsg");
      const senhaAtual = overlay.querySelector("#appSenhaAtual").value;
      const novaSenha = overlay.querySelector("#appSenhaNova").value;
      msg.style.color = "var(--text)";
      msg.textContent = "Salvando...";
      try {
        const res = await fetch("/api/auth/senha", {
          method: "PUT",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
          body: JSON.stringify({ senhaAtual, novaSenha })
        });
        const data = await res.json();
        msg.style.color = res.ok ? "var(--success-text)" : "var(--danger-text)";
        msg.textContent = data.msg;
        if (res.ok) setTimeout(fechar, 1200);
      } catch (err) {
        msg.style.color = "var(--danger-text)";
        msg.textContent = "Erro ao conectar ao servidor.";
      }
    });
  }

  function sair() {
    if (!confirm("Deseja sair da sua conta?")) return;
    localStorage.removeItem("token");
    localStorage.removeItem("nome");
    localStorage.removeItem("plano");
    window.location.href = "index.html";
  }

  function montarNavbar(dadosConta) {
    const root = document.getElementById("app-navbar");
    if (!root) return;

    const primeiroNome = (dadosConta.nome || "").split(" ")[0] || "Aluno";
    const foto = dadosConta.perfil?.foto || AVATAR_PADRAO;
    const plano = dadosConta.plano || { ativo: false };

    const linksProdutos = PRODUTOS_NAV.map(p => {
      const liberado = window.AppShell.temAcesso(p.chave);
      if (liberado) return `<a class="app-nav-link" href="${p.href}">${p.nome}</a>`;
      return `<a class="app-nav-link app-nav-locked" href="matricula.html?curso=${encodeURIComponent(p.curso)}&plano=Pack%20Prestige" title="Bloqueado — clique para assinar">🔒 ${p.nome}</a>`;
    }).join("");

    let planoDropdown = `<a href="minha-conta.html">Minha Conta</a><a href="minhas-inscricoes.html">Minhas Inscrições</a>`;
    if (plano.ativo && plano.tier && PROXIMO_TIER[plano.tier]) {
      planoDropdown += `<hr><a href="matricula.html?curso=${encodeURIComponent(plano.curso || "")}&plano=${encodeURIComponent(PROXIMO_TIER[plano.tier])}">Faça um upgrade</a>`;
    } else if (!plano.ativo) {
      planoDropdown += `<hr><a href="cursos.html">Ver planos disponíveis</a>`;
    }

    const tierLabel = plano.ativo && plano.tier ? "Plano " + plano.tier : "Nenhum plano";
    const estiloTier = (plano.ativo && ESTILOS_PLANO[plano.tier]) || { background: "var(--glass-bg)", border: "var(--glass-border-strong)", color: "var(--text)" };

    root.innerHTML = `
      <div class="app-nav-inner">
        <a class="app-nav-logo" href="minha-conta.html">Francês na Mira <img src="img/logo-mira.png" alt="" class="logo-mira-icone"></a>
        <div class="app-nav-links">${linksProdutos}</div>
        <div class="app-nav-right">
          <div class="app-nav-item">
            <button class="app-nav-pill" id="planoDropdownBtn" style="background:${estiloTier.background}; border-color:${estiloTier.border}; color:${estiloTier.color};">${tierLabel} ▾</button>
            <div class="app-dropdown" id="planoDropdown">${planoDropdown}</div>
          </div>
          <div class="app-nav-item">
            <button class="app-nav-user" id="userDropdownBtn">
              <img src="${foto}" alt="">
              <span>Olá, ${primeiroNome}</span> ▾
            </button>
            <div class="app-dropdown" id="userDropdown">
              <a href="minha-conta.html">Meu Perfil</a>
              <a href="minha-conta.html">Editar Perfil</a>
              <button type="button" class="app-dropdown-item" id="alterarFotoBtn">Alterar Foto</button>
              <a href="minha-conta.html">Configurações</a>
              <button type="button" class="app-dropdown-item" id="alterarSenhaBtn">Alterar Senha</button>
              <hr>
              <button type="button" class="app-dropdown-item app-dropdown-danger" id="sairBtn">Sair</button>
            </div>
          </div>
        </div>
      </div>`;

    ligarDropdown("planoDropdownBtn", "planoDropdown");
    ligarDropdown("userDropdownBtn", "userDropdown");
    document.getElementById("alterarFotoBtn").addEventListener("click", e => { e.stopPropagation(); fecharTodosDropdowns(); montarModalFoto(); });
    document.getElementById("alterarSenhaBtn").addEventListener("click", e => { e.stopPropagation(); fecharTodosDropdowns(); montarModalSenha(); });
    document.getElementById("sairBtn").addEventListener("click", e => { e.stopPropagation(); sair(); });
  }

  async function iniciar() {
    try {
      const res = await fetch("/api/auth/me", { headers: { Authorization: "Bearer " + token } });
      if (!res.ok) {
        localStorage.removeItem("token");
        window.location.href = "login.html";
        return;
      }
      const dadosConta = await res.json();
      window.AppShell.dadosConta = dadosConta;
      montarNavbar(dadosConta);
      document.dispatchEvent(new CustomEvent("appshell:ready", { detail: dadosConta }));
    } catch (err) {
      const root = document.getElementById("app-navbar");
      if (root) root.innerHTML = '<div class="app-nav-inner"><span style="color:var(--danger-text);">Não foi possível carregar sua conta.</span></div>';
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", iniciar);
  } else {
    iniciar();
  }
})();
