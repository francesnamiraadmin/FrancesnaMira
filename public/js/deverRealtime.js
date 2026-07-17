// Atualização em tempo real do Dever de Casa/Aulas/Produções — reaproveita o
// canal SSE já existente no projeto (backend/utils/sse.js, o mesmo usado por
// disponibilidade.js/pagamentoMatricula.js), em vez de introduzir WebSockets.
// É um broadcast global sem autenticação (mesmo padrão de admin-agenda.js),
// então o filtro "isso é comigo?" é sempre feito no cliente, por quem escuta.
const DeverRealtime = (() => {
  function meuUserId() {
    try {
      const token = localStorage.getItem('token');
      return JSON.parse(atob(token.split('.')[1])).id;
    } catch (err) { return null; }
  }

  // mapaEventos: { "dever-atualizado": fn(dados), "aula-progresso-atualizado": fn(dados), "producao-atualizada": fn(dados) }
  // Retorna a instância do EventSource (chame .close() se precisar encerrar).
  function escutar(mapaEventos) {
    const sse = new EventSource('/api/disponibilidade/stream');
    Object.entries(mapaEventos).forEach(([evento, cb]) => {
      sse.addEventListener(evento, e => { try { cb(JSON.parse(e.data)); } catch (err) { /* ignora payload malformado */ } });
    });
    window.addEventListener('beforeunload', () => sse.close());
    return sse;
  }

  return { meuUserId, escutar };
})();
