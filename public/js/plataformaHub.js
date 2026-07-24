// =====================================================================
// PLATAFORMA DE QUESTÕES — hub. Só popula os indicadores resumidos dos
// cards (busca GET /api/questoes/estatisticas uma vez) — a navegação em
// si é feita pelos próprios <a> dos cards, sem JS.
// =====================================================================

async function carregarIndicadores() {
  try {
    const token = localStorage.getItem('token');
    const url = window.CursoContexto ? window.CursoContexto.urlComCurso('/api/questoes/estatisticas') : '/api/questoes/estatisticas';
    const res = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
    if (!res.ok) return;
    const { kpis } = await res.json();

    if (kpis.conjuntosEmAndamento > 0) {
      const el = document.getElementById('indicadorAndamento');
      el.textContent = `${kpis.conjuntosEmAndamento} em andamento`;
      el.style.display = 'inline-block';
    }
    if (kpis.tamanhoCaderno > 0) {
      const el = document.getElementById('indicadorCaderno');
      el.textContent = `${kpis.tamanhoCaderno} questõe${kpis.tamanhoCaderno > 1 ? 's' : ''} salva${kpis.tamanhoCaderno > 1 ? 's' : ''}`;
      el.style.display = 'inline-block';
    }
    if (kpis.mediaPercentualAcertos !== null) {
      const el = document.getElementById('indicadorEstatisticas');
      el.textContent = `${kpis.mediaPercentualAcertos}% de média`;
      el.style.display = 'inline-block';
    }
  } catch (err) { /* indicadores são só um bônus visual — falha silenciosa não impede o hub */ }
}

carregarIndicadores();
