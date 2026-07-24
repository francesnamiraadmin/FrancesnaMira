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
    {
      // href aponta pro hub de seleção de curso (public/plataforma-hub.html) — a página real
      // (plataforma-questoes.html) só resolve qual courseType usar depois disso, ver
      // js/cursoContexto.js. O submenu continua indo direto pras páginas reais: elas resolvem
      // o curso pelo sessionStorage deixado pelo hub na última visita.
      chave: "plataforma", nome: "Plataforma de Questões", href: "plataforma-hub.html", curso: "Plataforma de Questões",
      // Submenu expansível (ver montarNavLinkComSubmenu) — outros produtos podem ganhar
      // o mesmo tratamento no futuro só preenchendo este campo.
      submenu: [
        { nome: "Praticar", href: "praticar.html", icone: "img/icones/praticar.svg" },
        { nome: "Respondidos / Em Andamento", href: "meus-conjuntos.html", icone: "img/icones/andamento.svg" },
        { nome: "Simulados", href: "simulados.html", icone: "img/icones/simulados.svg" },
        { nome: "Personalize", href: "personalizar-conjunto.html", icone: "img/icones/personalizar.svg" },
        { nome: "Caderno de Revisão", href: "caderno-revisao.html", icone: "img/icones/caderno.svg" },
        { nome: "Estatísticas", href: "estatisticas-questoes.html", icone: "img/icones/estatisticas.svg" }
      ]
    },
    { chave: "producao", nome: "Ambiente de Produção", href: "producao-hub.html", curso: "Ambiente de Produção Oral e Textual" },
    { chave: "aulasEspecializadas", nome: "Aulas Especializadas", href: "aulas-hub.html", curso: "Aulas Especializadas Online" }
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
      // Fontes depreciadas (plano/produtosAvulsos únicos, sobrescritos a cada compra) —
      // mantidas só pra não quebrar quem ainda não migrou.
      const avulso = d?.produtosAvulsos?.[chave] || {};
      const tier = d?.plano?.ativo ? d.plano.tier : null;
      const viaCascataAntiga = !!(tier && CASCATA_POR_TIER[chave] && CASCATA_POR_TIER[chave].includes(tier));
      const viaAvulso = !!avulso.ativo;
      // Grandfather do Pack Prestige avulso antigo (cross-curso) — congelado, ver
      // backend/seed/migrarPlanosUsuarios.js.
      const legado = d?.legado?.produtosAvulsos?.[chave] || {};
      const viaLegado = !!legado.ativo;
      // Modelo novo — um plano por curso (planos[]); agregado aqui (não sabe QUAL curso),
      // já que este painel ainda não tem seletor de curso.
      const viaPlanoPorCurso = (d?.planos || []).some(p =>
        (p.ativo && CASCATA_POR_TIER[chave] && CASCATA_POR_TIER[chave].includes(p.tier)) || p.packPrestige?.ativo
      );
      const ativo = viaCascataAntiga || viaAvulso || viaLegado || viaPlanoPorCurso;
      const viaCascata = viaCascataAntiga || viaPlanoPorCurso;
      const viaAvulsoTotal = viaAvulso || viaLegado;
      return { ativo, viaCascata, viaAvulso: viaAvulsoTotal, dataVencimentoAvulso: avulso.dataVencimento || legado.dataVencimento || null };
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

  function sair() {
    if (!confirm("Deseja sair da sua conta?")) return;
    // Revoga o refresh token (cookie httpOnly) no servidor além de limpar o
    // access token local — sem isso, quem marcou "Manter-me conectado" seria
    // relogado silenciosamente na próxima vez que uma página chamasse /refresh.
    fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
    localStorage.removeItem("token");
    localStorage.removeItem("nome");
    localStorage.removeItem("plano");
    window.location.href = "index.html";
  }

  // Link de topo de um produto — cadeado simples se bloqueado, link com submenu
  // expansível se `produto.submenu` existir e o aluno tiver acesso, senão link simples.
  function montarLinkProduto(p) {
    const liberado = window.AppShell.temAcesso(p.chave);
    if (!liberado) {
      return `<a class="app-nav-link app-nav-locked" href="matricula.html?curso=${encodeURIComponent(p.curso)}&plano=Pack%20Prestige" title="Bloqueado — clique para assinar"><img src="img/icones/lock.svg" alt="" style="width:0.85em; height:0.85em; vertical-align:-0.1em; margin-right:4px;">${p.nome}</a>`;
    }
    if (!p.submenu) return `<a class="app-nav-link" href="${p.href}">${p.nome}</a>`;
    return montarNavLinkComSubmenu(p);
  }

  // Componente reutilizável: link de topo + submenu que expande suavemente no hover
  // (CSS puro, ver .app-nav-submenu em app-shell.css). Em touch (sem hover), tocar no
  // link principal simplesmente navega pro hub do produto, que já expõe os mesmos
  // destinos como cards clicáveis — não há beco sem saída em mobile. Pensado pra
  // qualquer produto futuro poder ganhar submenu só preenchendo `produto.submenu`.
  function montarNavLinkComSubmenu(p) {
    const paginaAtual = location.pathname.split("/").pop() || "index.html";
    const paginasDoModulo = [p.href, "plataforma-questoes.html", ...p.submenu.map(s => s.href), "resolver-conjunto.html"];
    const ativoNoModulo = paginasDoModulo.includes(paginaAtual);
    const itens = p.submenu.map(s =>
      `<a class="app-nav-submenu-item ${s.href === paginaAtual ? "active" : ""}" href="${s.href}"><img class="icone" src="${s.icone}" alt=""> ${s.nome}</a>`
    ).join("");
    return `
      <div class="app-nav-item app-nav-submenu-wrap">
        <a class="app-nav-link ${ativoNoModulo ? "app-nav-link-ativo" : ""}" href="${p.href}">${p.nome}</a>
        <div class="app-nav-submenu">${itens}</div>
      </div>`;
  }

  function montarNavbar(dadosConta) {
    const root = document.getElementById("app-navbar");
    if (!root) return;

    const primeiroNome = (dadosConta.nome || "").split(" ")[0] || "Aluno";
    const foto = dadosConta.perfil?.foto || AVATAR_PADRAO;
    const plano = dadosConta.plano || { ativo: false };

    const linksProdutos = PRODUTOS_NAV.map(montarLinkProduto).join("");

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
        <a class="app-nav-logo" href="index.html">Francês na Mira <img src="img/logo-mira.png" alt="" class="logo-mira-icone"></a>
        <div class="app-nav-links">${linksProdutos}</div>
        <div class="app-nav-right">
          <div class="app-nav-item">
            <button class="app-nav-pill" id="planoDropdownBtn" style="background:${estiloTier.background}; border-color:${estiloTier.border}; color:${estiloTier.color};">${tierLabel} <img src="img/icones/chevron-down.svg" alt="" style="width:0.7em; height:0.7em; vertical-align:0.05em;"></button>
            <div class="app-dropdown" id="planoDropdown">${planoDropdown}</div>
          </div>
          <div class="app-nav-item">
            <button class="app-nav-user" id="userDropdownBtn">
              <img src="${foto}" alt="">
              <span>Olá, ${primeiroNome}</span> <img src="img/icones/chevron-down.svg" alt="" style="width:0.7em; height:0.7em; vertical-align:0.05em;">
            </button>
            <div class="app-dropdown" id="userDropdown">
              <a href="minha-conta.html">Meu Perfil</a>
              <a href="meus-deveres.html">Dever de Casa</a>
              <a href="mapeador-estudos.html">Mapeador de Estudos</a>
              <button type="button" class="app-dropdown-item" id="alterarFotoBtn">Alterar Foto</button>
              <a href="configuracoes.html">Configurações</a>
              <a href="depoimentos.html">Depoimentos</a>
              <hr>
              <button type="button" class="app-dropdown-item app-dropdown-danger" id="sairBtn">Sair</button>
            </div>
          </div>
        </div>
      </div>`;

    ligarDropdown("planoDropdownBtn", "planoDropdown");
    ligarDropdown("userDropdownBtn", "userDropdown");
    document.getElementById("alterarFotoBtn").addEventListener("click", e => { e.stopPropagation(); fecharTodosDropdowns(); montarModalFoto(); });
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

      // Restaura tema/idioma salvos na conta — cobre o caso de logar num
      // navegador/computador novo, onde ainda não há nada em localStorage.
      const prefs = dadosConta.preferencias || {};
      if (prefs.tema && window.ThemeToggle && window.ThemeToggle.tema !== prefs.tema) {
        window.ThemeToggle.setTema(prefs.tema, { sincronizar: false });
      }
      if (prefs.idioma && window.I18n && window.I18n.idioma !== prefs.idioma) {
        window.I18n.setLocale(prefs.idioma, { sincronizar: false });
      }

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
