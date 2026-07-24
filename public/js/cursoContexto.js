// ===================== CONTEXTO DE CURSO — módulos segregados por courseType =====================
// Resolve qual curso (TCF/DELF/DALF/TEF/A1/A2/B1/B2) a página atual deve usar, a partir da URL
// (?curso=) ou do que ficou salvo nesta aba (sessionStorage) na última vez que o aluno passou
// pelo hub daquele módulo (ver js/cursoHub.js). Sem isso, uma conta com 2+ cursos liberados no
// mesmo módulo faz as chamadas de API caírem no 400 "Informe o curso" de
// backend/middleware/acessoCurso.js#exigirAcessoCurso — este helper existe pra nunca deixar
// isso acontecer: se não der pra resolver sozinho, manda o aluno de volta pro hub escolher.
//
// Cada página que usa este helper define, ANTES de <script src="js/cursoContexto.js">:
//   window.CURSO_CONTEXTO_MODULO = "plataforma" | "producao" | "aulas";
//   window.CURSO_CONTEXTO_HUB = "plataforma-hub.html" | "producao-hub.html" | "aulas-hub.html";
// e chama `await window.CursoContexto.garantir()` dentro do próprio gate de entitlement da
// página (depois de confirmar que o aluno tem acesso ao módulo, antes de liberar o body).
(function () {
  const TIPOS_CURSO = ["TCF", "DELF", "DALF", "TEF", "A1", "A2", "B1", "B2"];
  // Mesma cascata de backend/middleware/acessoCurso.js e public/js/appShell.js — duplicada
  // client-side seguindo o mesmo padrão que o código já aceita (o hub roda antes de qualquer
  // chamada de API, então não dá pra confiar só no backend aqui).
  const CASCATA_POR_TIER = {
    producao: ["Essentiel", "Avancé", "Excellence"],
    aulas: ["Avancé", "Excellence"],
    plataforma: ["Excellence"]
  };
  const CHAVE_LEGADO_POR_MODULO = { plataforma: "plataforma", aulas: "aulasEspecializadas", producao: "producao" };

  const modulo = window.CURSO_CONTEXTO_MODULO;
  const hubHref = window.CURSO_CONTEXTO_HUB;
  const chaveSessao = "cursoAtual:" + modulo;

  function cursosComAcesso(dadosConta) {
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

  function resolverDaUrlOuSessao() {
    const daUrl = new URLSearchParams(window.location.search).get("curso");
    if (daUrl && TIPOS_CURSO.includes(daUrl)) {
      sessionStorage.setItem(chaveSessao, daUrl);
      return daUrl;
    }
    const daSessao = sessionStorage.getItem(chaveSessao);
    if (daSessao && TIPOS_CURSO.includes(daSessao)) return daSessao;
    return null;
  }

  window.CursoContexto = {
    curso: resolverDaUrlOuSessao(),
    modulo,
    TIPOS_CURSO,

    // Chamar dentro do gate da página, depois que a entitlement do módulo já foi confirmada.
    // Devolve o courseType resolvido, ou `null` (e já redireciona pro hub) quando é ambíguo.
    async garantir() {
      if (window.CursoContexto.curso) return window.CursoContexto.curso;
      const token = localStorage.getItem("token");
      if (!token) return null;
      try {
        const res = await fetch("/api/auth/me", { headers: { Authorization: "Bearer " + token } });
        if (!res.ok) { window.location.href = hubHref; return null; }
        const dadosConta = await res.json();
        const cursos = cursosComAcesso(dadosConta);
        if (cursos.length === 1) {
          window.CursoContexto.curso = cursos[0];
          sessionStorage.setItem(chaveSessao, cursos[0]);
          return cursos[0];
        }
        window.location.href = hubHref;
        return null;
      } catch (err) {
        window.location.href = hubHref;
        return null;
      }
    },

    // Anexa courseType a uma URL de fetch (escolhe ? ou & automaticamente).
    urlComCurso(url) {
      if (!window.CursoContexto.curso) return url;
      const sep = url.includes("?") ? "&" : "?";
      return url + sep + "courseType=" + encodeURIComponent(window.CursoContexto.curso);
    }
  };
})();
