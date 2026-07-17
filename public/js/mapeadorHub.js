// =====================================================================
// MAPEADOR DE ESTUDOS — hub. Só popula os indicadores resumidos dos
// cards (busca GET /api/estudos/estatisticas uma vez) — a navegação em
// si é feita pelos próprios <a> dos cards, sem JS.
// =====================================================================

async function carregarIndicadores() {
  try {
    const token = localStorage.getItem('token');
    const res = await fetch('/api/estudos/estatisticas', { headers: { Authorization: 'Bearer ' + token } });
    if (!res.ok) return;
    const { kpis } = await res.json();

    if (kpis.tempoHojeSegundos > 0) {
      const el = document.getElementById('indicadorTimer');
      el.textContent = `${Math.round(kpis.tempoHojeSegundos / 60)} min hoje`;
      el.style.display = 'inline-block';
    }
    if (kpis.numeroSessoes > 0) {
      const el = document.getElementById('indicadorHistorico');
      el.textContent = `${kpis.numeroSessoes} sessõe${kpis.numeroSessoes > 1 ? 's' : ''} registrada${kpis.numeroSessoes > 1 ? 's' : ''}`;
      el.style.display = 'inline-block';
    }
    if (kpis.sequenciaDiasAtual > 0) {
      const el = document.getElementById('indicadorEstatisticas');
      el.textContent = `${kpis.sequenciaDiasAtual} dia${kpis.sequenciaDiasAtual > 1 ? 's' : ''} seguidos`;
      el.style.display = 'inline-block';
    }
  } catch (err) { /* indicadores são só um bônus visual — falha silenciosa não impede o hub */ }
}

carregarIndicadores();
