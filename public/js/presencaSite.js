// Presença do aluno no site (só a equipe vê, em Gestão de Alunos → Acompanhamento ao vivo):
// a cada 30 s, e quando muda de página/aba, manda em que área do site ele está e o que está fazendo.
// Carregado por theme-toggle.js em todas as páginas. Uma página pode detalhar a atividade em
// window.FNM_ATIVIDADE (texto ou função que devolve texto).
(function () {
  if (window.__fnmPresenca) return;
  window.__fnmPresenca = true;
  const token = () => { try { return localStorage.getItem('token'); } catch (e) { return null; } };
  if (!token()) return;

  const pagina = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  const AREAS = [
    [/^(plataforma|resolver-conjunto|meus-conjuntos|personalizar-conjunto|praticar|questoes-interativas|estatisticas-questoes|caderno-revisao|flashcards|exercicio|mapeador)/, 'Plataforma de Questões'],
    [/^simulado-tcf/, 'Simulação Completa'],
    [/^(producao|correcoes)/, 'Ambiente de Produção'],
    [/^(aulas|academia|aula-)/, 'Aulas Especializadas'],
    [/^meus-deveres/, 'Dever de Casa'],
    [/^(minha-conta|minhas-matriculas|minhas-inscricoes|configuracoes)/, 'Minha conta'],
    [/^(matricula|pagina-compras|pagamento)/, 'Matrícula e compras'],
    [/^(index|cursos|tcf|tef|delf|dalf|a1|a2|b1|b2|blog|depoimentos)?(\.html)?$/, 'Página inicial e cursos']
  ];
  const area = (AREAS.find(([re]) => re.test(pagina)) || [null, 'Site'])[1];

  // Primeiro texto visível de um seletor, sem quebras.
  const texto = sel => {
    const el = Array.from(document.querySelectorAll(sel)).find(e => e.offsetParent !== null && e.textContent.trim());
    return el ? el.textContent.replace(/\s+/g, ' ').trim().slice(0, 140) : '';
  };
  function atividade() {
    try {
      const a = typeof window.FNM_ATIVIDADE === 'function' ? window.FNM_ATIVIDADE() : window.FNM_ATIVIDADE;
      if (a) return String(a);
    } catch (e) {}
    // Ambiente de Produção: a tela ativa do app e o título dela
    const tela = document.querySelector('#fnm-raiz .tela.ativa, #fnm-raiz section.ativa');
    if (tela) {
      const t = texto('#fnm-raiz .tela.ativa .modele-titulo, #fnm-raiz .tela.ativa h1, #fnm-raiz .tela.ativa h2');
      const fazendo = document.querySelector('#tm-fazer-bt.ativo') ? 'Fazendo o tema · ' : document.querySelector('#tela-epreuve.ativa') ? 'Prova escrita de 60 min · ' : '';
      if (t) return fazendo + t;
    }
    const partes = [];
    const h1 = texto('main h1, .container h1, h1');
    if (h1) partes.push(h1);
    const sub = texto('.questao-enunciado, .enunciado, .aula-titulo, .player-titulo, .exercicio-titulo, h2');
    if (sub && sub !== h1) partes.push(sub);
    return partes.join(' · ') || document.title || pagina;
  }

  let ultimo = '', tUltimo = 0;
  function enviar(forcar) {
    const dados = { area, pagina: document.title || pagina, atividade: atividade(), url: pagina + location.search + location.hash, oculta: document.hidden };
    const chave = JSON.stringify(dados);
    // sem mudança, um sinal a cada 30 s basta
    if (!forcar && chave === ultimo && Date.now() - tUltimo < 29000) return;
    ultimo = chave; tUltimo = Date.now();
    fetch('/api/presenca', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() }, body: chave }).catch(() => {});
  }

  setTimeout(() => enviar(true), 1500);              // depois de a página montar o conteúdo
  setInterval(() => enviar(false), 30000);
  setInterval(() => { if (!document.hidden) enviar(false); }, 8000);   // mudanças de tela dentro da página
  document.addEventListener('visibilitychange', () => enviar(true));
  window.addEventListener('hashchange', () => setTimeout(() => enviar(true), 600));
})();
