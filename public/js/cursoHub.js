// ===================== HUB DE SELEÇÃO DE CURSO — motor dos cards =====================
// Usado pelas 3 páginas de hub (plataforma-hub.html, producao-hub.html, aulas-hub.html).
// Cada página chama window.CursoHub.iniciar(config) com:
//   modulo: "plataforma" | "producao" | "aulas"
//   proximaPagina: href da página já existente que trata aquele módulo
//   progresso(cursosDesbloqueados): opcional, Promise<Map<courseType, {rotulo, percentual}>>
// A grade só é montada depois do evento "appshell:ready" (js/appShell.js), reaproveitando os
// dados de /api/auth/me que a navbar já buscou — sem chamada de rede própria.
(function () {
  const TIPOS_CURSO = ["TCF", "DELF", "DALF", "TEF", "A1", "A2", "B1", "B2"];
  const GRUPOS = [
    { titulo: "Exames específicos", cursos: ["TCF", "DELF", "DALF", "TEF"] },
    { titulo: "Francês geral", cursos: ["A1", "A2", "B1", "B2"] }
  ];
  const NOMES = {
    TCF: "TCF", DELF: "DELF", DALF: "DALF", TEF: "TEF",
    A1: "Francês A1", A2: "Francês A2", B1: "Francês B1", B2: "Francês B2"
  };
  const CORES = {
    TCF: "#3b82f6", DELF: "#10b981", DALF: "#a855f7", TEF: "#06b6d4",
    A1: "#f59e0b", A2: "#f97316", B1: "#ef4444", B2: "#ec4899"
  };
  const DESCRICOES = {
    TCF: "Teste de Conhecimento de Francês, reconhecido por universidades e para imigração.",
    DELF: "Diplôme d'Études en Langue Française — certificação oficial até o nível B2.",
    DALF: "Diplôme Approfondi de Langue Française — certificação avançada C1/C2.",
    TEF: "Test d'Évaluation de Français, aceito por universidades e processos de imigração.",
    A1: "Iniciante — primeiros passos no francês.",
    A2: "Básico — situações simples do dia a dia.",
    B1: "Intermediário — autonomia para se comunicar.",
    B2: "Intermediário avançado — fluência ampliada."
  };
  // Mesma cascata de backend/middleware/acessoCurso.js e public/js/cursoContexto.js.
  const CASCATA_POR_TIER = {
    producao: ["Essentiel", "Avancé", "Excellence"],
    aulas: ["Avancé", "Excellence"],
    plataforma: ["Excellence"]
  };
  const CHAVE_LEGADO_POR_MODULO = { plataforma: "plataforma", aulas: "aulasEspecializadas", producao: "producao" };

  function cursosComAcesso(dadosConta, modulo) {
    if (dadosConta?.plano?.ativo && dadosConta.plano.curso === "Acesso Total") return [...TIPOS_CURSO];
    const cascata = CASCATA_POR_TIER[modulo] || [];
    const resultado = new Set();
    (dadosConta?.planos || []).forEach(p => {
      const viaCascata = !!(p.ativo && cascata.includes(p.tier));
      const viaPackPrestige = !!p.packPrestige?.ativo;
      if (viaCascata || viaPackPrestige) resultado.add(p.courseType);
    });
    if (dadosConta?.legado?.produtosAvulsos?.[CHAVE_LEGADO_POR_MODULO[modulo]]?.ativo) {
      TIPOS_CURSO.forEach(c => resultado.add(c));
    }
    return [...resultado];
  }

  function renderCardDesbloqueado(curso, proximaPagina) {
    return `
      <a class="curso-card desbloqueado" style="--curso-cor:${CORES[curso]};" href="${proximaPagina}?curso=${encodeURIComponent(curso)}">
        <div class="curso-card-topo">
          <div class="curso-badge">${curso}</div>
          <div class="curso-card-info">
            <h2>${NOMES[curso]}</h2>
            <span class="curso-status disponivel"><img src="img/icones/check.svg" alt="">Disponível</span>
          </div>
        </div>
        <p class="curso-card-desc">${DESCRICOES[curso]}</p>
        <div class="curso-progresso" data-progresso-curso="${curso}">
          <div class="rotulo"><span>Progresso</span><span class="valor">—</span></div>
          <div class="barra"><div class="preenchimento" style="width:0%;"></div></div>
        </div>
      </a>`;
  }

  function renderCardBloqueado(curso) {
    return `
      <div class="curso-card bloqueado" style="--curso-cor:${CORES[curso]};">
        <div class="curso-card-topo">
          <div class="curso-badge">${curso}</div>
          <div class="curso-card-info">
            <h2>${NOMES[curso]}</h2>
            <span class="curso-status bloqueado-status"><img src="img/icones/lock.svg" alt="">Bloqueado</span>
          </div>
        </div>
        <p class="curso-card-desc">${DESCRICOES[curso]}</p>
        <div class="curso-cadeado-wrap">
          <img src="img/icones/lock.svg" alt="">
          <span>Você ainda não tem este curso.</span>
        </div>
        <a class="curso-btn-adquira" href="matricula.html?curso=${encodeURIComponent(curso)}&plano=Pack%20Prestige">Adquira já</a>
      </div>`;
  }

  function render(dadosConta, config) {
    const grid = document.getElementById("hubCursosGrid");
    if (!grid) return;
    const cursosDesbloqueados = cursosComAcesso(dadosConta, config.modulo);

    grid.innerHTML = GRUPOS.map(grupo => `
      <div class="hub-cursos-grupo">
        <h3 class="hub-cursos-grupo-titulo">${grupo.titulo}</h3>
        <div class="hub-cursos-grid">
          ${grupo.cursos.map(c =>
            cursosDesbloqueados.includes(c) ? renderCardDesbloqueado(c, config.proximaPagina) : renderCardBloqueado(c)
          ).join("")}
        </div>
      </div>`).join("");

    if (typeof config.progresso === "function" && cursosDesbloqueados.length) {
      config.progresso(cursosDesbloqueados).then(mapa => {
        mapa.forEach((info, curso) => {
          const wrap = grid.querySelector(`[data-progresso-curso="${curso}"]`);
          if (!wrap) return;
          wrap.querySelector(".valor").textContent = info.rotulo;
          wrap.querySelector(".preenchimento").style.width = Math.max(0, Math.min(100, info.percentual || 0)) + "%";
        });
      }).catch(() => { /* progresso é só um bônus visual — falha silenciosa não impede o hub */ });
    }
  }

  window.CursoHub = {
    iniciar(config) {
      document.addEventListener("appshell:ready", e => render(e.detail, config));
    }
  };
})();
