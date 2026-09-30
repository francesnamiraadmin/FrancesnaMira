// Gate das páginas do Ambiente de Produção (producao.html, producao-textual.html,
// producao-oral-exercicios.html): confirma o acesso ao módulo "producao" e resolve o curso
// (js/cursoContexto.js). Expõe window.ProducaoGate.pronto → Promise<{ conta, curso }>.
(function () {
  const CASCATA = ["Essentiel", "Avancé", "Excellence"];
  function temAcesso(d) {
    if (d.plano?.ativo && d.plano.curso === "Acesso Total") return true;
    if (d.legado?.produtosAvulsos?.producao?.ativo || d.produtosAvulsos?.producao?.ativo) return true;
    return (d.planos || []).some(p => (p.ativo && CASCATA.includes(p.tier)) || p.packPrestige?.ativo);
  }
  function bloquear() {
    document.body.innerHTML = `
      <div style="min-height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:40px; font-family:'Poppins',sans-serif; background:var(--bg-gradient); color:var(--text);">
        <h1 style="font-family:'Playfair Display',serif; font-size:2.5rem; margin-bottom:16px;">Conteúdo exclusivo</h1>
        <p style="font-size:1.15rem; max-width:520px; margin-bottom:28px;">O Ambiente de Produção Oral e Textual faz parte do Pack Prestige e dos planos que o incluem. Entre na sua conta ou conheça os planos para continuar.</p>
        <div style="display:flex; gap:16px; flex-wrap:wrap; justify-content:center;">
          <a href="login.html" style="padding:14px 28px; background:var(--glass-strong); border:1px solid var(--glass-border-strong); border-radius:30px; color:var(--text); text-decoration:none; font-weight:700;">Entrar</a>
          <a href="cursos.html" style="padding:14px 28px; background:var(--accent); color:var(--accent-text); border-radius:30px; text-decoration:none; font-weight:700;">Ver planos</a>
        </div>
      </div>`;
    document.body.style.visibility = "visible";
  }
  window.ProducaoGate = {
    pronto: (async () => {
      const token = localStorage.getItem("token");
      if (!token) { bloquear(); return new Promise(() => {}); }
      try {
        const res = await fetch("/api/auth/me", { headers: { Authorization: "Bearer " + token } });
        if (!res.ok) { bloquear(); return new Promise(() => {}); }
        const conta = await res.json();
        if (!temAcesso(conta) && conta.role !== "admin" && conta.role !== "professor") { bloquear(); return new Promise(() => {}); }
        const curso = window.CursoContexto ? await window.CursoContexto.garantir() : null;
        if (!curso) return new Promise(() => {});
        document.body.style.visibility = "visible";
        return { conta, curso };
      } catch (err) { bloquear(); return new Promise(() => {}); }
    })()
  };
})();
