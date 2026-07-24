// =====================================================================
// GATE DE ACESSO — Plataforma de Questões
// Compartilhado por todas as páginas do módulo (hub + praticar/simulados/
// personalizar-conjunto/caderno-revisao/estatisticas-questoes/resolver-conjunto).
// Cada página deve começar com <body style="visibility:hidden;"> e incluir este
// script logo em seguida — libera o body se o aluno tiver acesso (tier
// Excellence via plano de curso OU compra avulsa do Pack Prestige), senão
// substitui o conteúdo por uma tela de bloqueio.
// =====================================================================
(async function protegerPaginaPlataforma() {
  const featureKey = 'plataforma';
  const token = localStorage.getItem('token');

  function bloquear() {
    document.body.innerHTML = `
      <div style="min-height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:40px; font-family:'Poppins',sans-serif; background:var(--bg-gradient); color:var(--text);">
        <h1 style="font-family:'Playfair Display',serif; font-size:2.5rem; margin-bottom:16px;">Conteúdo exclusivo</h1>
        <p style="font-size:1.2rem; max-width:520px; margin-bottom:28px; opacity:0.95;">A plataforma de questões é liberada no plano Excellence. Entre na sua conta ou assine um plano que inclua este recurso para continuar.</p>
        <div style="display:flex; gap:16px; flex-wrap:wrap; justify-content:center;">
          <a href="login.html" style="padding:14px 28px; background:var(--glass-strong); border:1px solid var(--glass-border-strong); border-radius:30px; color:var(--text); text-decoration:none; font-weight:700;">Entrar</a>
          <a href="cursos.html" style="padding:14px 28px; background:var(--accent); color:var(--accent-text); border-radius:30px; text-decoration:none; font-weight:700;">Ver planos</a>
        </div>
      </div>`;
    document.body.style.visibility = 'visible';
  }

  if (!token) return bloquear();

  try {
    const res = await fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + token } });
    if (!res.ok) return bloquear();
    const data = await res.json();
    const tier = data.plano && data.plano.tier;
    const ativo = data.plano && data.plano.ativo;
    // Liberado pelo plano de curso (cascata por tier) OU por uma compra avulsa do Pack
    // Prestige — os dois caminhos são independentes. `planos[]`/`legado` são o modelo
    // novo (por curso); agregados aqui porque esta tela ainda não tem seletor de curso.
    const viaCascataAntiga = !!ativo && tier === 'Excellence';
    const viaAvulsoAntigo = !!data.produtosAvulsos?.plataforma?.ativo;
    const viaLegado = !!data.legado?.produtosAvulsos?.plataforma?.ativo;
    const viaPlanoPorCurso = (data.planos || []).some(p => p.ativo && p.tier === 'Excellence' || p.packPrestige?.ativo);
    if (!(viaCascataAntiga || viaAvulsoAntigo || viaLegado || viaPlanoPorCurso)) return bloquear();

    // Resolve QUAL curso (TCF/DELF/.../B2) esta página deve usar — ver js/cursoContexto.js.
    // Se for ambíguo (aluno com 2+ cursos liberados aqui, sem ter vindo do hub), já redireciona
    // pro plataforma-hub.html em vez de deixar as chamadas de API falharem.
    if (window.CursoContexto && !(await window.CursoContexto.garantir())) return;

    document.body.style.visibility = 'visible';
    // Hook opcional por página (ex.: plataforma-questoes.html usa pra atualizar o título
    // com o curso resolvido) — só chamado depois que o body já está visível.
    if (window.CursoContexto?.curso && typeof window.aoResolverCurso === 'function') {
      window.aoResolverCurso(window.CursoContexto.curso);
    }
  } catch (err) {
    bloquear();
  }
})();
