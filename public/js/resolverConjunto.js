// =====================================================================
// TELA DE RESOLUÇÃO DE CONJUNTO (standalone) — bootstrap fino em cima do
// motor compartilhado em public/js/conjuntoResolverEmbed.js (o mesmo motor
// que o Dever de Casa usa embutido, ver public/js/deverWorkspace.js).
// Dois modos via query string: ?id=<conjuntoId> (sessão de resolução ao vivo,
// cria ou retoma) e ?tentativaId=<id> (modo leitura — gabarito de uma
// tentativa já concluída, usado por "Revisar" e pela tela pós-envio).
// =====================================================================

const params = new URLSearchParams(window.location.search);
const conjuntoIdParam = params.get('id');
const tentativaIdParam = params.get('tentativaId');
const wrap = document.getElementById('resolverWrap');

ConjuntoResolverEmbed.criarResolver(wrap, {
  conjuntoId: conjuntoIdParam,
  tentativaId: tentativaIdParam,
  embed: false
});
