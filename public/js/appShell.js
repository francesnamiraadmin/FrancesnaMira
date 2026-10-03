// ===================== APP SHELL — NAVBAR DA ÁREA LOGADA =====================
// Módulo único reaproveitado por todas as páginas autenticadas (Minha Conta,
// Minhas Inscrições, Plataforma de Questões, Ambiente de Produção, Aulas
// Especializadas). Faz a guarda de autenticação, busca /api/auth/me uma vez,
// renderiza a navbar em #app-navbar e avisa a página via evento "appshell:ready".
(function () {
  // Foto padrão: a inicial do nome num círculo colorido (a cor vem do nome, sempre a mesma para a
  // mesma pessoa). Gerada como PNG — o htmlSeguro.js só deixa passar imagens data: em PNG/JPG/GIF/WebP.
  const CORES_AVATAR = ["#2563eb", "#db2777", "#7c3aed", "#0d9488", "#ea580c", "#16a34a", "#4f46e5", "#be185d", "#0891b2", "#b45309"];
  const cacheAvatar = {};
  function avatarInicial(nome) {
    const n = String(nome || "").trim();
    const letra = (n.charAt(0) || "?").toUpperCase();
    if (cacheAvatar[n]) return cacheAvatar[n];
    let h = 0; for (const ch of n) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    try {
      const c = document.createElement("canvas"); c.width = c.height = 192;
      const g = c.getContext("2d");
      const cor = CORES_AVATAR[h % CORES_AVATAR.length];
      const grad = g.createLinearGradient(0, 0, 192, 192);
      grad.addColorStop(0, cor); grad.addColorStop(1, CORES_AVATAR[(h + 3) % CORES_AVATAR.length]);
      g.fillStyle = grad; g.beginPath(); g.arc(96, 96, 96, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#fff"; g.font = "700 96px Poppins, 'Segoe UI', Arial, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(letra, 96, 102);
      return (cacheAvatar[n] = c.toDataURL("image/png"));
    } catch (e) { return ""; }
  }
  const AVATAR_PADRAO = () => avatarInicial(window.AppShell && window.AppShell.dadosConta && window.AppShell.dadosConta.nome);
  // uma foto que não carrega (arquivo apagado, link quebrado) também volta para a inicial
  function fotoComReserva(img, nome) {
    if (!img || img.dataset.reserva) return;
    img.dataset.reserva = "1";
    img.addEventListener("error", () => { const r = avatarInicial(nome); if (r && img.src !== r) img.src = r; });
  }

  const ESTILOS_PLANO = {
    Essentiel: { background: "rgba(200,160,0,0.35)", border: "#c8a000", color: "#3a2e00" },
    "Avancé": { background: "rgba(203,213,225,0.35)", border: "#cbd5e1", color: "#1e293b" },
    Excellence: { background: "rgba(186,230,253,0.35)", border: "#7dd3fc", color: "#0c4a6e" }
  };
  const PROXIMO_TIER = { Essentiel: "Avancé", "Avancé": "Excellence" };

  // Mesma cascata usada pelas guardas de página (correcoes-texto.html, aulas-especializadas.html,
  // plataforma-questoes.html): um plano de curso ativo já libera esses recursos por tier,
  // independentemente de uma compra avulsa do Pack Prestige — os dois caminhos são independentes.
  const CASCATA_POR_TIER = {
    producao: ["Avancé", "Excellence"],
    aulasEspecializadas: ["Avancé", "Excellence"],
    plataforma: ["Excellence"]
  };

  // Ordem da navbar: Aulas Especializadas → Plataforma de Questões → Ambiente de Produção → Meu Espaço.
  const PRODUTOS_NAV = [
    { chave: "aulasEspecializadas", nome: "Aulas Especializadas", href: "aulas-hub.html", curso: "Aulas Especializadas Online" },
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
        { nome: "Respondidos", href: "meus-conjuntos.html", icone: "img/icones/andamento.svg" },
        { nome: "Questões Interativas", href: "questoes-interativas.html", icone: "img/icones/puzzle.svg" },
        { nome: "Personalize", href: "personalizar-conjunto.html", icone: "img/icones/personalizar.svg" },
        { nome: "Simulação Completa", href: "simulado-tcf.html", icone: "img/icones/simulados.svg" }
      ],
      paginas: ["plataforma-questoes.html", "resolver-conjunto.html"]
    },
    {
      // Itens abrem direto a parte do app do Ambiente de Produção (producao.html#<destino>,
      // ver abrirDestino em backend/seed/modeles-site/extensoes.js); o curso vem do hub.
      chave: "producao", nome: "Ambiente de Produção", href: "producao-hub.html", curso: "Ambiente de Produção Oral e Textual",
      submenu: [
        { nome: "Produção escrita", href: "producao.html#ecrit", icone: "img/icones/writing-hand.svg" },
        { nome: "Produção oral", href: "producao.html#oral", icone: "img/icones/mic.svg" },
        { nome: "Ditado", href: "producao.html#dictee", icone: "img/icones/keyboard.svg" },
        { nome: "Modelos escritos", href: "producao.html#modeles", icone: "img/icones/document.svg" },
        { nome: "Vocabulário", href: "producao.html#vocab", icone: "img/icones/book.svg" },
        { nome: "O que o professor espera", href: "producao.html#attentes", icone: "img/icones/cap.svg" }
      ],
      paginas: ["producao.html", "producao-oral-exercicios.html", "minha-correcao.html"]
    },
    {
      // Painel pessoal do aluno (sempre liberado): deveres, inscrições, matrículas e o resumo de cada módulo.
      chave: "meuEspaco", nome: "Meu Espaço", href: "meu-espaco.html", livre: true,
      submenu: [
        { nome: "Visão geral", href: "meu-espaco.html", icone: "img/icones/profile.svg" },
        { nome: "Estatísticas", href: "meu-espaco.html#questoes", icone: "img/icones/estatisticas.svg" },
        { nome: "Caderno de erros", href: "meu-espaco.html#erros", icone: "img/icones/caderno.svg" },
        { nome: "Caderno de Revisão", href: "meu-espaco.html#revisao", icone: "img/icones/caderno.svg" },
        { nome: "Produções e correções", href: "meu-espaco.html#producoes", icone: "img/icones/writing-hand.svg" },
        { nome: "Dever de casa", href: "meus-deveres.html", icone: "img/icones/check.svg" },
        { nome: "Minhas inscrições", href: "minhas-inscricoes.html", icone: "img/icones/document.svg" },
        { nome: "Minhas matrículas", href: "minhas-matriculas.html", icone: "img/icones/calendar.svg" }
      ],
      paginas: ["meu-espaco.html", "caderno-revisao.html", "meus-deveres.html", "dever.html", "minhas-inscricoes.html", "minhas-matriculas.html"]
    }
  ];

  const token = localStorage.getItem("token");
  if (!token) {
    const atual = location.pathname.split("/").pop() || "minha-conta.html";
    window.location.href = "login.html?redirect=" + encodeURIComponent(atual);
    return;
  }

  window.AppShell = {
    dadosConta: null,
    avatarInicial,
    fotoComReserva,
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
    const foto = window.AppShell.dadosConta.perfil?.foto || AVATAR_PADRAO();
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
    const liberado = p.livre || window.AppShell.temAcesso(p.chave);
    if (!liberado) {
      return `<a class="app-nav-link app-nav-locked" data-nav="${p.chave}" href="matricula.html?curso=${encodeURIComponent(p.curso)}&plano=Pack%20Prestige" title="Bloqueado — clique para assinar"><img src="img/icones/lock.svg" alt="" style="width:0.85em; height:0.85em; vertical-align:-0.1em; margin-right:4px;">${p.nome}</a>`;
    }
    if (!p.submenu) return `<a class="app-nav-link" data-nav="${p.chave}" href="${p.href}">${p.nome}</a>`;
    return montarNavLinkComSubmenu(p);
  }

  // Componente reutilizável: link de topo + submenu que expande suavemente no hover
  // (CSS puro, ver .app-nav-submenu em app-shell.css). Em touch (sem hover), tocar no
  // link principal simplesmente navega pro hub do produto, que já expõe os mesmos
  // destinos como cards clicáveis — não há beco sem saída em mobile. Pensado pra
  // qualquer produto futuro poder ganhar submenu só preenchendo `produto.submenu`.
  function montarNavLinkComSubmenu(p) {
    const paginaAtual = location.pathname.split("/").pop() || "index.html";
    const semHash = h => h.split("#")[0];
    const paginasDoModulo = [p.href, ...(p.paginas || []), ...p.submenu.map(s => semHash(s.href))];
    const ativoNoModulo = paginasDoModulo.includes(paginaAtual);
    // Item ativo: mesma página e, nos itens com #destino, o mesmo destino.
    const ativo = s => semHash(s.href) === paginaAtual && (!s.href.includes("#") || s.href.split("#")[1] === location.hash.slice(1));
    const itens = p.submenu.map(s =>
      `<a class="app-nav-submenu-item ${ativo(s) ? "active" : ""}" href="${s.href}"><img class="icone" src="${s.icone}" alt=""> ${s.nome}</a>`
    ).join("");
    return `
      <div class="app-nav-item app-nav-submenu-wrap" data-nav="${p.chave}">
        <a class="app-nav-link ${ativoNoModulo ? "app-nav-link-ativo" : ""}" href="${p.href}">${p.nome}</a>
        <div class="app-nav-submenu">${itens}</div>
      </div>`;
  }

  function montarNavbar(dadosConta) {
    const root = document.getElementById("app-navbar");
    if (!root) return;

    const primeiroNome = (dadosConta.nome || "").split(" ")[0] || "Aluno";
    const foto = dadosConta.perfil?.foto || AVATAR_PADRAO();
    // Planos ativos: o modelo novo (um plano por curso, planos[]) e o campo antigo (plano), para
    // quem ainda não migrou. O seletor mostra o melhor deles; o menu lista todos com a validade.
    const agora = Date.now();
    const ORDEM_TIER = { Excellence: 3, "Avancé": 2, Essentiel: 1 };
    const vigente = d => !d || new Date(d).getTime() > agora;
    const ativos = (dadosConta.planos || []).map(p => {
      const venc = p.dataVencimento || p.expiraEm;
      const pack = !!(p.packPrestige && p.packPrestige.ativo && vigente(p.packPrestige.dataVencimento));
      const tierAtivo = !!(p.ativo && p.tier && vigente(venc));
      if (!tierAtivo && !pack) return null;
      return { curso: p.courseType, tier: tierAtivo ? p.tier : null, pack, vencimento: tierAtivo ? venc : p.packPrestige.dataVencimento };
    }).filter(Boolean);
    const antigo = dadosConta.plano;
    if (antigo && antigo.ativo && antigo.tier && vigente(antigo.dataVencimento) && !ativos.some(a => a.curso === antigo.curso && a.tier === antigo.tier)) {
      ativos.push({ curso: antigo.curso || "", tier: antigo.tier, pack: false, vencimento: antigo.dataVencimento });
    }
    ativos.sort((a, b) => (ORDEM_TIER[b.tier] || 0) - (ORDEM_TIER[a.tier] || 0) || new Date(b.vencimento || 0) - new Date(a.vencimento || 0));
    const plano = ativos[0] ? { ativo: true, tier: ativos[0].tier, curso: ativos[0].curso, pack: ativos[0].pack } : { ativo: false };

    const linksProdutos = PRODUTOS_NAV.map(montarLinkProduto).join("");

    const fmtVenc = d => d ? new Date(d).toLocaleDateString("pt-BR") : "";
    let planoDropdown = ativos.length
      ? ativos.map(a => `<a href="meu-espaco.html#assinatura" class="app-plano-item"><b>${a.curso ? a.curso + " · " : ""}${a.tier || "Pack Prestige"}${a.tier && a.pack ? " + Pack Prestige" : ""}</b>${a.vencimento ? `<small>até ${fmtVenc(a.vencimento)}</small>` : ""}</a>`).join("") + "<hr>"
      : "";
    planoDropdown += `<a href="meu-espaco.html#assinatura">Minha assinatura</a><a href="minha-conta.html">Minha Conta</a><a href="minhas-inscricoes.html">Minhas Inscrições</a>`;
    if (plano.ativo && plano.tier && PROXIMO_TIER[plano.tier]) {
      planoDropdown += `<hr><a href="matricula.html?curso=${encodeURIComponent(plano.curso || "")}&plano=${encodeURIComponent(PROXIMO_TIER[plano.tier])}">Faça um upgrade</a>`;
    } else if (!plano.ativo) {
      planoDropdown += `<hr><a href="cursos.html">Ver planos disponíveis</a>`;
    }

    const tierLabel = plano.ativo
      ? (plano.tier ? "Plano " + plano.tier : "Pack Prestige") + (plano.curso ? " · " + plano.curso : "") + (ativos.length > 1 ? ` +${ativos.length - 1}` : "")
      : "Nenhum plano";
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
              <img src="${foto}" alt="" class="app-nav-foto">
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
    fotoComReserva(root.querySelector(".app-nav-foto"), dadosConta.nome);

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
