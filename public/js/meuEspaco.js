// =====================================================================
// MEU ESPAÇO — o painel do aluno (GET /api/meu-espaco): herói com sequência de dias,
// indicadores, mapa de atividade, Plataforma de Questões, caderno de erros (todas as
// questões erradas), Caderno de Revisão (questões salvas + caderno das produções), produções e
// correções, tarefas do professor, simulados, aulas, favoritos, deveres e estudo.
// Gráficos em SVG (sem bibliotecas).
// =====================================================================
(function () {
  const raiz = document.getElementById("meuEspaco");
  if (!raiz) return;
  const H = () => ({ Authorization: "Bearer " + localStorage.getItem("token") });
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtData = d => d ? new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) : "";
  const fmtTempo = s => { s = Math.round(s || 0); const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60); return h ? `${h} h ${String(m).padStart(2, "0")}` : `${m} min`; };
  const COR = { azul: "#2563eb", roxo: "#7c3aed", rosa: "#db2777", laranja: "#f59e0b", verde: "#16a34a", teal: "#0d9488", vermelho: "#dc2626", anil: "#4f46e5" };
  const PALETA = [COR.azul, COR.rosa, COR.laranja, COR.verde, COR.roxo, COR.teal, COR.anil, COR.vermelho];
  const ESTADO_COR = { nao_corrigida: "#64748b", em_correcao: COR.azul, devolvida: COR.verde, ia: COR.teal, reenviada: COR.roxo };
  const TAREFA = { T1: "Oral · Tarefa 1", T2: "Oral · Tarefa 2", T3: "Oral · Tarefa 3", ET1: "Escrita · Tarefa 1", ET2: "Escrita · Tarefa 2", ET3: "Escrita · Tarefa 3" };

  // ---------------- gráficos ----------------
  function linha(pontos, cor, opts = {}) {
    if (!pontos.length) return '<div class="me-vazio">Ainda sem dados para o gráfico.</div>';
    const W = 640, A = 210, mx = 34, my = 18, max = opts.max || 100;
    const x = i => mx + (pontos.length === 1 ? (W - 2 * mx) / 2 : i * (W - 2 * mx) / (pontos.length - 1));
    const y = v => my + (1 - Math.max(0, Math.min(max, v)) / max) * (A - 2 * my);
    const pts = pontos.map((p, i) => [x(i), y(p.valor)]);
    let d = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 1; i < pts.length; i++) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], cx = (x0 + x1) / 2; d += ` C${cx},${y0} ${cx},${y1} ${x1},${y1}`; }
    const id = "g" + Math.random().toString(36).slice(2, 8);
    const grade = [0, 25, 50, 75, 100].map(v => v * max / 100).map(v => `<line x1="${mx}" x2="${W - mx}" y1="${y(v)}" y2="${y(v)}" stroke="currentColor" stroke-opacity=".08"/><text class="eixo" x="${mx - 6}" y="${y(v) + 3}" text-anchor="end">${Math.round(v)}${opts.sufixo || ""}</text>`).join("");
    return `<div class="me-grafico"><svg viewBox="0 0 ${W} ${A}" role="img" aria-label="${esc(opts.rotulo || "Evolução")}">
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${cor}" stop-opacity=".35"/><stop offset="1" stop-color="${cor}" stop-opacity="0"/></linearGradient></defs>
      ${grade}<path d="${d} L${pts[pts.length - 1][0]},${A - my} L${pts[0][0]},${A - my} Z" fill="url(#${id})"/>
      <path d="${d}" fill="none" stroke="${cor}" stroke-width="3.2" stroke-linecap="round"/>
      ${pts.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="4.5" fill="#fff" stroke="${cor}" stroke-width="2.5"><title>${esc(fmtData(pontos[i].data))} · ${pontos[i].valor}${opts.sufixo || ""}${pontos[i].rotulo ? " · " + esc(pontos[i].rotulo) : ""}</title></circle>`).join("")}
    </svg></div>`;
  }
  function donut(fatias, centro, sub) {
    const total = fatias.reduce((s, f) => s + f.valor, 0);
    if (!total) return '<div class="me-vazio">Ainda sem dados.</div>';
    const R = 54, C = 2 * Math.PI * R;
    let acc = 0;
    const arcos = fatias.filter(f => f.valor > 0).map(f => {
      const frac = f.valor / total, s = `<circle r="${R}" cx="70" cy="70" fill="none" stroke="${f.cor}" stroke-width="22" stroke-dasharray="${frac * C} ${C}" stroke-dashoffset="${-acc * C}" transform="rotate(-90 70 70)"><title>${esc(f.nome)}: ${Math.round(frac * 100)}%</title></circle>`;
      acc += frac; return s;
    }).join("");
    return `<div class="me-donut-wrap"><svg viewBox="0 0 140 140" width="150" height="150" role="img" aria-label="Distribuição">${arcos}
      <text x="70" y="68" text-anchor="middle" style="font:800 20px Poppins,sans-serif;fill:currentColor">${esc(centro)}</text><text x="70" y="86" text-anchor="middle" style="font:600 9px Poppins,sans-serif;fill:currentColor;opacity:.6">${esc(sub || "")}</text></svg>
      <div class="me-legenda" style="flex-direction:column;">${fatias.filter(f => f.valor > 0).map(f => `<span style="--c:${f.cor}"><i></i>${esc(f.nome)} · <b>${f.texto || Math.round(f.valor / total * 100) + "%"}</b></span>`).join("")}</div></div>`;
  }
  function barras(itens) {
    if (!itens.length) return '<div class="me-vazio">Ainda sem dados.</div>';
    return `<div class="me-barras">${itens.map((it, i) => `<div class="me-barra-l" style="--c:${it.cor || PALETA[i % PALETA.length]}"><span>${esc(it.nome)}</span>
      <div class="me-barra"><span style="width:0" data-w="${Math.max(2, it.pct)}"></span></div><b>${it.texto ?? it.pct + "%"}</b></div>`).join("")}</div>`;
  }
  function heatmap(atividade) {
    const mapa = Object.fromEntries((atividade || []).map(a => [a.dia, a.n]));
    const hoje = new Date(); hoje.setHours(12, 0, 0, 0);
    const inicio = new Date(hoje.getTime() - 52 * 7 * 864e5); inicio.setDate(inicio.getDate() - inicio.getDay());
    const cores = ["rgba(124,58,237,.10)", "#c4b5fd", "#a78bfa", "#7c3aed", "#4c1d95"];
    const nivel = n => !n ? 0 : n < 2 ? 1 : n < 4 ? 2 : n < 7 ? 3 : 4;
    let cel = "", meses = "", mesAnt = -1, semana = 0;
    for (let d = new Date(inicio); d <= hoje; d.setDate(d.getDate() + 1)) {
      const k = d.toISOString().slice(0, 10), dow = d.getDay();
      if (dow === 0 && d > inicio) semana++;
      if (d.getMonth() !== mesAnt && dow === 0) { mesAnt = d.getMonth(); meses += `<text class="eixo" x="${30 + semana * 14}" y="10">${d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")}</text>`; }
      cel += `<rect x="${30 + semana * 14}" y="${16 + dow * 14}" width="11" height="11" rx="3" fill="${cores[nivel(mapa[k])]}"><title>${new Date(k + "T12:00").toLocaleDateString("pt-BR")}: ${mapa[k] || 0} atividade(s)</title></rect>`;
    }
    const dias = ["", "seg", "", "qua", "", "sex", ""].map((t, i) => t ? `<text class="eixo" x="0" y="${26 + i * 14}">${t}</text>` : "").join("");
    return `<div class="me-heat me-grafico"><svg viewBox="0 0 ${40 + (semana + 1) * 14} 116" style="min-width:720px">${meses}${dias}${cel}</svg></div>
      <div class="me-heat-leg">menos ${cores.map(c => `<i style="background:${c}"></i>`).join("")} mais</div>`;
  }
  const anel = (pct, cor) => `<div class="me-anel" style="--p:${pct || 0};--c:${cor}"><i>${pct == null ? "—" : pct + "%"}</i></div>`;

  // ---------------- seções ----------------
  function heroi(d) {
    const a = d.aluno, primeiro = String(a.nome || "").split(" ")[0] || "aluno";
    const foto = a.foto ? `<img class="me-avatar" src="${esc(a.foto)}" alt="">` : `<div class="me-avatar">${esc(primeiro[0] || "?").toUpperCase()}</div>`;
    const diasProva = a.dataProva ? Math.ceil((new Date(a.dataProva) - Date.now()) / 864e5) : null;
    return `<section class="me-heroi me-surgir"><div class="me-heroi-linha">${foto}
      <div class="me-ola"><small>Meu espaço</small><h1>Bonjour, ${esc(primeiro)} !</h1>
        <div class="me-chips">${a.cursos.map(c => `<span class="me-chip">🎓 ${esc(c)}</span>`).join("")}
          ${a.provaAlvo ? `<span class="me-chip">🎯 ${esc(a.provaAlvo)}</span>` : ""}
          ${diasProva != null && diasProva >= 0 ? `<span class="me-chip">⏳ faltam ${diasProva} dia(s) para a prova</span>` : ""}
          <span class="me-chip">✨ ${a.creditos} crédito(s) de correção</span>
          ${a.desde && !isNaN(new Date(a.desde)) ? `<span class="me-chip">📅 aluno desde ${new Date(a.desde).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</span>` : ""}</div></div>
      <div class="me-fogo"><span class="chama">🔥</span><b>${d.sequencia.atual}</b><span>dia(s) seguidos<br>recorde: ${d.sequencia.recorde} · ${d.diasAtivos} dias ativos</span></div>
    </div></section>`;
  }
  function kpis(d) {
    const q = d.questoes || {}, p = d.producoes || {}, a = d.aulas || {}, e = d.estudo || {}, ap = d.aulasParticulares || {};
    const ultSim = (d.simulados || []).find(s => Object.values(s.provas).some(x => x.valor != null));
    const k = (cor, rot, val, sub, visual) => `<div class="me-kpi me-surgir" style="--c:${cor}">${visual}<div><div class="rot">${rot}</div><div class="val">${val}</div><div class="sub">${sub}</div></div></div>`;
    return `<div class="me-kpis">
      ${k(COR.azul, "Questões", q.total || 0, `${q.certas || 0} certas · ${q.tentativas || 0} conjunto(s)`, anel(q.aproveitamento, COR.azul))}
      ${k(COR.rosa, "Produções", p.total || 0, `${p.corrigidas || 0} corrigida(s) · média`, anel(p.mediaPct, COR.rosa))}
      ${k(COR.laranja, "Simulados", (d.simulados || []).length, ultSim ? "último: " + esc(ultSim.titulo) : "nenhum ainda", '<div class="me-ico">🏆</div>')}
      ${k(COR.verde, "Aulas assistidas", (a.assistidas || 0) + (ap.realizadas || 0), `${a.assistidas || 0} gravada(s) · ${ap.realizadas || 0} particular(es)`, '<div class="me-ico">🎬</div>')}
      ${k(COR.roxo, "Tempo de estudo", fmtTempo((e.totalSeg || 0) + (a.tempoSeg || 0)), `${e.sessoes || 0} sessão(ões) + vídeos`, '<div class="me-ico">⏱️</div>')}
      ${k(COR.teal, "Caderno de erros", (q.cadernoErros || []).filter(x => !x.resolvida).length, `pendentes · ${(q.cadernoErros || []).filter(x => x.resolvida).length} já resolvida(s)`, '<div class="me-ico">📕</div>')}
    </div>`;
  }
  function visaoGeral(d) {
    const q = d.questoes || { porMateria: [] };
    const fortes = q.porMateria.filter(m => m.total >= 3).slice().sort((a, b) => b.pct - a.pct);
    const passos = [];
    const pend = (q.cadernoErros || []).filter(x => !x.resolvida).length;
    if (pend) passos.push(`Revise as <b>${pend}</b> questão(ões) do seu <a class="me-link" href="#erros">caderno de erros</a>.`);
    if (fortes.length > 1) passos.push(`Treine <b>${esc(fortes[fortes.length - 1].nome)}</b>: é o conteúdo com menos acertos (${fortes[fortes.length - 1].pct}%).`);
    const devPend = (d.deveres?.recentes || []).filter(x => !x.concluido);
    if (devPend.length) passos.push(`Você tem <b>${devPend.length}</b> dever(es) de casa em aberto. <a class="me-link" href="meus-deveres.html">Abrir</a>`);
    const andamento = (d.aulas?.historico || []).find(x => !x.concluida);
    if (andamento) passos.push(`Continue a aula <b>${esc(andamento.titulo)}</b>. <a class="me-link" href="aulas-especializadas.html?aula=${esc(andamento.id)}">Retomar</a>`);
    if (!(d.simulados || []).length) passos.push('Faça um <a class="me-link" href="simulado-tcf.html">simulado completo</a> para medir seu nível.');
    if (!passos.length) passos.push("Tudo em dia! Que tal um conjunto novo no <a class=\"me-link\" href=\"praticar.html\">Praticar</a>?");
    return `<section class="me-secao" id="geral" style="--c:${COR.roxo}"><div class="me-secao-cab"><div><h2><span class="bolinha"></span>Visão geral</h2><p>Sua constância e os próximos passos.</p></div></div>
      <div class="me-grade">
        <div class="me-card c12"><h3>Mapa de atividade <small>${d.diasAtivos} dia(s) com estudo no último ano</small></h3>${heatmap(d.atividade)}</div>
        <div class="me-card c6" style="--c:${COR.verde}"><h3>Pontos fortes e a melhorar</h3>
          ${fortes.length >= 2 ? `<div class="me-duplas"><div class="me-destaque" style="--c:${COR.verde}"><small>Seu forte</small><b>${esc(fortes[0].nome)}</b><span>${fortes[0].pct}% de acertos</span></div>
            <div class="me-destaque" style="--c:${COR.vermelho}"><small>A melhorar</small><b>${esc(fortes[fortes.length - 1].nome)}</b><span>${fortes[fortes.length - 1].pct}% de acertos</span></div></div>` : '<div class="me-vazio">Responda mais questões para descobrir seus pontos fortes.</div>'}
        </div>
        <div class="me-card c6" style="--c:${COR.laranja}"><h3>Próximos passos</h3><ul class="me-passos">${passos.map(p => `<li>${p}</li>`).join("")}</ul></div>
      </div></section>`;
  }
  function secQuestoes(d) {
    const q = d.questoes;
    if (!q || !q.total) return `<section class="me-secao" id="questoes"><div class="me-secao-cab"><div><h2 style="--c:${COR.azul}"><span class="bolinha"></span>Plataforma de Questões</h2></div></div>
      <div class="me-card c12"><div class="me-vazio">Você ainda não respondeu questões. <a href="praticar.html">Começar a praticar</a></div></div></section>`;
    return `<section class="me-secao" id="questoes" style="--c:${COR.azul}"><div class="me-secao-cab"><div><h2><span class="bolinha"></span>Plataforma de Questões</h2>
      <p>${q.total} questões respondidas · ${q.aproveitamento}% de acertos${q.pontosPossiveis ? ` · nota ponderada pelo nível: ${Math.round(q.pontos / q.pontosPossiveis * 100)}%` : ""}</p></div><a class="me-btn cheio" style="--c:${COR.azul}" href="praticar.html">Praticar agora</a></div>
      <div class="me-grade">
        <div class="me-card c8"><h3>Evolução dos acertos <small>últimos ${q.evolucao.length} conjuntos</small></h3>${linha(q.evolucao, COR.azul, { sufixo: "%", rotulo: "Acertos por conjunto" })}</div>
        <div class="me-card c4"><h3>Acertos e erros</h3>${donut([{ nome: "Certas", valor: q.certas, cor: COR.verde, texto: q.certas }, { nome: "Erradas", valor: q.total - q.certas, cor: COR.vermelho, texto: q.total - q.certas }], q.aproveitamento + "%", "de acertos")}</div>
        <div class="me-card c6"><h3>Acertos por conteúdo</h3>${barras(q.porMateria.map(m => ({ nome: m.nome, pct: m.pct, texto: `${m.certas}/${m.total}` })))}</div>
        <div class="me-card c6"><h3>Conjuntos recentes</h3><div class="me-lista">${q.recentes.map(t => `<a class="me-item" style="--c:${t.pct >= 70 ? COR.verde : t.pct >= 50 ? COR.laranja : COR.vermelho}" href="resolver-conjunto.html?tentativaId=${esc(t.id)}">
          <span class="marca">📝</span><span class="txt"><b>${esc(t.nome)}</b><small>${fmtData(t.data)} · ${t.certas}/${t.total}</small></span><span class="me-pill">${t.pct}%</span></a>`).join("")}</div></div>
      </div></section>`;
  }
  let errosEstado = { filtro: "pendentes", materia: "" };
  function secErros(d) {
    const l = d.questoes?.cadernoErros || [];
    const materias = [...new Set(l.map(x => x.materia))];
    return `<section class="me-secao" id="erros" style="--c:${COR.vermelho}"><div class="me-secao-cab"><div><h2><span class="bolinha"></span>Caderno de erros</h2>
      <p>Todas as questões que você já errou. Quando você acertar numa próxima vez, ela vai para « resolvidas ».</p></div><a class="me-btn" href="#revisao">Caderno de Revisão</a></div>
      <div class="me-card c12">${l.length ? `<div class="me-filtros" style="--c:${COR.vermelho}">
          <button type="button" data-ef="pendentes">Pendentes <b>${l.filter(x => !x.resolvida).length}</b></button>
          <button type="button" data-ef="resolvidas">Resolvidas <b>${l.filter(x => x.resolvida).length}</b></button>
          <button type="button" data-ef="todas">Todas <b>${l.length}</b></button>
          <select data-em aria-label="Conteúdo"><option value="">Todos os conteúdos</option>${materias.map(m => `<option>${esc(m)}</option>`).join("")}</select></div>
        <div class="me-erros" data-erros></div>` : '<div class="me-vazio">Nenhum erro registrado ainda. 🎉</div>'}</div></section>`;
  }
  function desenharErros(d) {
    const alvo = raiz.querySelector("[data-erros]"); if (!alvo) return;
    raiz.querySelectorAll("[data-ef]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.ef === errosEstado.filtro)));
    const l = (d.questoes.cadernoErros || []).filter(x => (errosEstado.filtro === "todas" || (errosEstado.filtro === "resolvidas" ? x.resolvida : !x.resolvida)) && (!errosEstado.materia || x.materia === errosEstado.materia));
    alvo.innerHTML = l.slice(0, 60).map((x, i) => `<div class="me-erro" style="--c:${x.resolvida ? COR.verde : PALETA[i % PALETA.length]}">
      <div class="topo"><span>${esc(x.materia)} · ${esc(x.conjunto)}</span><span class="me-pill" style="--c:${x.resolvida ? COR.verde : COR.vermelho}">${x.resolvida ? "resolvida" : "errou " + x.vezesErrada + "×"}</span></div>
      <p>${esc(x.enunciado)}</p>
      ${x.respostaAluno ? `<p>Sua resposta: <span class="sua">${esc(x.respostaAluno)}</span></p>` : ""}
      <p>Resposta certa: <span class="certa">${esc(x.respostaCorreta)}</span></p>
      <details data-explicar="${esc(x.questaoId)}"><summary>Ver explicação, pegadinhas e dicas</summary><div class="explica">${esc(x.explicacao)}</div><div data-ia></div></details>
    </div>`).join("") + (l.length > 60 ? `<p class="me-vazio">Mostrando 60 de ${l.length}. Use os filtros para ver as outras.</p>` : "") || '<div class="me-vazio">Nada neste filtro.</div>';
  }
  function secProducoes(d) {
    const p = d.producoes;
    if (!p || !p.total) return `<section class="me-secao" id="producoes" style="--c:${COR.rosa}"><div class="me-secao-cab"><div><h2><span class="bolinha"></span>Redações e produções</h2></div></div>
      <div class="me-card c12"><div class="me-vazio">Nenhuma produção enviada ainda. <a href="producao-hub.html">Ir ao Ambiente de Produção</a></div></div></section>`;
    return `<section class="me-secao" id="producoes" style="--c:${COR.rosa}"><div class="me-secao-cab"><div><h2><span class="bolinha"></span>Redações e produções</h2>
      <p>${p.escritas} escrita(s) · ${p.orais} oral(is) · ${p.corrigidas} corrigida(s)${p.mediaPct != null ? ` · média ${p.mediaPct}%` : ""}</p></div><a class="me-btn cheio" style="--c:${COR.rosa}" href="producao-hub.html">Nova produção</a></div>
      <div class="me-grade">
        <div class="me-card c8"><h3>Evolução das notas <small>% da nota máxima</small></h3>${linha(p.evolucao, COR.rosa, { sufixo: "%", rotulo: "Notas das produções" })}</div>
        <div class="me-card c4"><h3>Escrita × oral</h3>${donut([{ nome: "Escritas", valor: p.escritas, cor: COR.rosa, texto: p.escritas }, { nome: "Orais", valor: p.orais, cor: COR.anil, texto: p.orais }], p.total, "produções")}</div>
        <div class="me-card c6"><h3>Média por critério <small>nas correções devolvidas</small></h3>${barras(p.criterios.slice(0, 8).map(c => ({ nome: c.nome, pct: c.pct })))}</div>
        <div class="me-card c6"><h3>Suas produções e correções</h3><div class="me-lista" style="max-height:420px;overflow:auto;">${p.lista.slice(0, 40).map(x => `<a class="me-item" style="--c:${ESTADO_COR[x.estado.estado] || COR.azul}" href="minha-correcao.html?producao=${esc(x.id)}">
          <span class="marca">${x.modalidade === "oral" ? "🎙️" : "✍️"}</span><span class="txt"><b>${esc(x.titulo)}</b><small>${fmtData(x.data)}${x.tache ? " · " + esc(TAREFA[x.tache] || x.tache) : ""} · ${esc(x.estado.rotulo)}${x.anotacoes ? " · " + x.anotacoes + " comentário(s)" : ""}</small></span>
          ${x.nota != null ? `<span class="me-pill">${x.nota}/${x.notaMaxima}</span>` : `<span class="me-pill">${esc(x.estado.rotulo)}</span>`}</a>`).join("")}</div></div>
        ${p.treinoIA.length ? `<div class="me-card c12"><h3>Treinos corrigidos pela IA <small>Ambiente de Produção</small></h3><div class="me-lista" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));">${p.treinoIA.slice(0, 12).map(x => `<div class="me-item" style="--c:${COR.teal}">
          <span class="marca">🤖</span><span class="txt"><b>${esc(String(x.sujet || "").slice(0, 70))}</b><small>${fmtData(x.data)} · ${esc(TAREFA[x.tache] || x.tache || "")}</small></span><span class="me-pill">${x.nota}/${x.escala}</span></div>`).join("")}</div></div>` : ""}
      </div></section>`;
  }
  function secSimulados(d) {
    const s = d.simulados || [];
    const sigla = { co: "CO", ce: "CE", ee: "EE", eo: "EO" };
    return `<section class="me-secao" id="simulados" style="--c:${COR.laranja}"><div class="me-secao-cab"><div><h2><span class="bolinha"></span>Simulados</h2><p>${s.length} simulado(s) feito(s).</p></div><a class="me-btn cheio" style="--c:${COR.laranja}" href="simulado-tcf.html">Fazer um simulado</a></div>
      <div class="me-card c12">${s.length ? `<div class="me-sims">${s.slice(0, 12).map(x => `<a class="me-sim" style="--c:${COR.laranja}" href="simulado-tcf.html?curso=${encodeURIComponent(x.curso)}&t=${esc(x.id)}">
        <h4>${esc(x.titulo)}</h4><small>${fmtData(x.data)} · ${x.status === "corrigido" ? "corrigido" : x.status === "em_andamento" ? "em andamento" : "aguardando correção"}</small>
        <div class="me-sim-provas">${["co", "ce", "ee", "eo"].filter(p => x.provas[p]).map(p => `<div><b>${x.provas[p].valor != null ? x.provas[p].valor : "…"}</b><span>${sigla[p]}${x.provas[p].valor != null ? " /" + x.provas[p].escala : ""}</span></div>`).join("")}</div></a>`).join("")}</div>`
        : '<div class="me-vazio">Nenhum simulado ainda. <a href="simulado-tcf.html">Fazer o primeiro</a></div>'}</div></section>`;
  }
  function secAulas(d) {
    const a = d.aulas || { historico: [], favoritas: [] }, ap = d.aulasParticulares || { historico: [], proximas: [] };
    const presBase = (ap.realizadas || 0) + (ap.faltas || 0) + (ap.justificadas || 0);
    const pres = presBase ? Math.round(ap.realizadas / presBase * 100) : null;
    const ESTA = { realizada: ["✅", COR.verde, "Realizada"], falta: ["❌", COR.vermelho, "Falta"], falta_justificada: ["📎", COR.roxo, "Falta justificada"], cancelada_professor: ["↩️", COR.teal, "Cancelada"], remarcada: ["🔁", COR.azul, "Remarcada"], prevista: ["🗓️", "#64748b", "Prevista"] };
    return `<section class="me-secao" id="aulas" style="--c:${COR.verde}"><div class="me-secao-cab"><div><h2><span class="bolinha"></span>Aulas</h2><p>${a.assistidas || 0} aula(s) gravada(s) concluída(s) · ${ap.realizadas || 0} aula(s) particular(es) realizada(s)</p></div><a class="me-btn cheio" style="--c:${COR.verde}" href="aulas-hub.html">Ver aulas</a></div>
      <div class="me-grade">
        <div class="me-card c6"><h3>Aulas gravadas que você assistiu</h3>${a.historico.length ? `<div class="me-lista" style="max-height:380px;overflow:auto;">${a.historico.map(x => `<a class="me-item" style="--c:${x.concluida ? COR.verde : COR.laranja}" href="aulas-especializadas.html?aula=${esc(x.id)}">
          <span class="marca">${x.concluida ? "✅" : "▶️"}</span><span class="txt"><b>${esc(x.titulo)}</b><small>${esc(x.modulo)} · ${fmtData(x.data)}</small></span><span class="me-pill">${x.concluida ? "concluída" : "continuar"}</span></a>`).join("")}</div>` : '<div class="me-vazio">Nenhuma aula assistida ainda. <a href="aulas-hub.html">Começar</a></div>'}</div>
        <div class="me-card c6"><h3>Aulas particulares <small>${pres != null ? "presença " + pres + "%" : ""}</small></h3>
          ${presBase || ap.proximas.length ? `${pres != null ? `<div style="display:flex;gap:14px;align-items:center;margin-bottom:10px;">${anel(pres, COR.verde)}<span style="font-size:.84rem;">${ap.realizadas} realizada(s) · ${ap.faltas} falta(s) · ${ap.justificadas} justificada(s)</span></div>` : ""}
          <div class="me-lista">${ap.proximas.map(x => `<div class="me-item" style="--c:${COR.azul}"><span class="marca">🗓️</span><span class="txt"><b>Próxima aula</b><small>${new Date(x.data).toLocaleString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</small></span></div>`).join("")}
          ${ap.historico.slice(0, 8).map(x => { const e = ESTA[x.estado] || ESTA.prevista; return `<div class="me-item" style="--c:${e[1]}"><span class="marca">${e[0]}</span><span class="txt"><b>${e[2]}</b><small>${new Date(x.data).toLocaleDateString("pt-BR")}${x.conteudo ? " · " + esc(x.conteudo.slice(0, 60)) : ""}</small></span></div>`; }).join("")}</div>`
          : '<div class="me-vazio">Sem aulas particulares registradas. <a href="matricula.html">Conhecer as aulas</a></div>'}</div>
      </div></section>`;
  }
  function secFavoritos(d) {
    const f = d.aulas?.favoritas || [];
    const grad = [[COR.rosa, COR.laranja], [COR.anil, COR.rosa], [COR.teal, COR.azul], [COR.roxo, COR.azul], [COR.laranja, COR.vermelho]];
    return `<section class="me-secao" id="favoritos" style="--c:${COR.rosa}"><div class="me-secao-cab"><div><h2><span class="bolinha"></span>Favoritos</h2><p>As aulas que você marcou com ⭐.</p></div></div>
      <div class="me-card c12">${f.length ? `<div class="me-favs">${f.map((x, i) => `<a class="me-fav" style="--c1:${grad[i % grad.length][0]};--c2:${grad[i % grad.length][1]}" href="aulas-especializadas.html?aula=${esc(x.id)}"><span class="estrela">⭐</span><small>${esc(x.modulo)}</small><b>${esc(x.titulo)}</b></a>`).join("")}</div>`
        : '<div class="me-vazio">Você ainda não favoritou aulas. Marque ⭐ nas aulas que quiser rever.</div>'}</div></section>`;
  }
  function secRotina(d) {
    const dv = d.deveres || { recentes: [] }, e = d.estudo || { porMateria: [] };
    return `<section class="me-secao" id="rotina" style="--c:${COR.teal}"><div class="me-secao-cab"><div><h2><span class="bolinha"></span>Rotina de estudos</h2><p>Deveres de casa e tempo de estudo por matéria.</p></div></div>
      <div class="me-grade">
        <div class="me-card c6"><h3>Dever de casa <small>${dv.concluidos || 0}/${dv.total || 0} semana(s) concluída(s)</small></h3>${dv.recentes.length ? barras(dv.recentes.map(x => ({ nome: x.titulo, pct: x.total ? Math.round(x.feitas / x.total * 100) : (x.concluido ? 100 : 0), texto: x.concluido ? "✓" : `${x.feitas}/${x.total}`, cor: x.concluido ? COR.verde : COR.teal }))) + '<p style="margin-top:12px;"><a class="me-link" href="meus-deveres.html">Abrir meus deveres →</a></p>' : '<div class="me-vazio">Nenhum dever de casa atribuído.</div>'}</div>
        <div class="me-card c6"><h3>Tempo de estudo por matéria <small>${fmtTempo(e.totalSeg)}</small></h3>${e.porMateria.length ? donut(e.porMateria.slice(0, 7).map((m, i) => ({ nome: `${m.icone} ${m.nome}`, valor: m.seg, cor: m.cor || PALETA[i], texto: fmtTempo(m.seg) })), fmtTempo(e.totalSeg), "estudados") : '<div class="me-vazio">Use o cronômetro de estudos para acompanhar seu tempo.</div>'}</div>
      </div></section>`;
  }

  // Caderno de Revisão: questões salvas na Plataforma + o caderno das produções (erros, palavras, sujets).
  const linkApp = (curso, hash) => `producao.html${curso ? "?curso=" + encodeURIComponent(curso) : ""}#${hash}`;
  function secRevisao(d) {
    const rv = d.revisao || [], carnet = d.ambiente?.carnet || [];
    const erros = carnet.filter(x => x.tipo === "erreur").reverse(), mots = carnet.filter(x => x.tipo === "mot"), sujets = carnet.filter(x => x.tipo === "sujet");
    const questoes = rv.length ? `<div class="me-erros">${rv.map((x, i) => `<div class="me-erro" style="--c:${PALETA[i % PALETA.length]}" data-item-caderno="${esc(x.questaoId)}">
        <div class="topo"><span>${esc(x.materia)}${x.curso ? " · " + esc(x.curso) : ""} · salva em ${fmtData(x.adicionadoEm)}</span><button class="me-btn" type="button" data-rm-caderno="${esc(x.questaoId)}">Remover</button></div>
        <p>${esc(x.enunciado)}</p>${x.afirmacao ? `<p>Afirmação: « ${esc(x.afirmacao)} »</p>` : ""}
        <p>Resposta certa: <span class="certa">${esc(x.respostaCorreta)}</span></p>
        <details data-explicar="${esc(x.questaoId)}"><summary>Ver explicação, pegadinhas e dicas</summary>${x.texto ? `<div class="explica">${esc(x.texto)}</div>` : ""}<div class="explica">${esc(x.explicacao)}</div><div data-ia></div></details>
      </div>`).join("")}</div>` : '<div class="me-vazio">Nenhuma questão salva ainda. Depois de responder um conjunto, use « Adicionar ao Caderno de Revisão » na tela de resultado.</div>';
    const prod = `${erros.length ? `<div class="me-lista">${erros.map(x => { const [a, b] = String(x.titre).split(" → ");
        return `<div class="me-item" style="--c:${COR.vermelho}" data-item-carnet="${esc(x.id)}"><span class="marca">✏️</span><span class="txt"><b><s style="color:${COR.vermelho}">${esc(a)}</s> → <span style="color:${COR.verde}">${esc(b || "")}</span></b>${x.detalhe ? `<small>${esc(x.detalhe)}</small>` : ""}</span><button class="me-btn" type="button" data-rm-carnet="${esc(x.id)}">✓ Aprendido</button></div>`; }).join("")}</div>`
        : '<div class="me-vazio">Nenhum erro de produção por enquanto. Os erros apontados nas correções aparecem aqui automaticamente.</div>'}
      ${mots.length ? `<h3 style="margin-top:16px;">Palavras para lembrar</h3><div class="me-chips-mots">${mots.map(x => `<span class="me-mot" data-item-carnet="${esc(x.id)}"><b>${esc(x.titre)}</b>${x.detalhe ? `<small>${esc(x.detalhe)}</small>` : ""}<button type="button" data-rm-carnet="${esc(x.id)}" aria-label="Retirar ${esc(x.titre)}">✕</button></span>`).join("")}</div>` : ""}`;
    const sj = sujets.length ? `<div class="me-lista">${sujets.map(x => { const oral = !/^ET/.test(x.tache), base = `sujet=${x.tache}:${encodeURIComponent(x.id)}`;
        return `<div class="me-item" style="--c:${oral ? COR.anil : COR.rosa}" data-item-carnet="${esc(x.id)}"><span class="marca">${oral ? "🎙️" : "✍️"}</span><span class="txt"><b>${esc(x.titre)}</b><small>${esc(TAREFA[x.tache] || x.tache)}${x.curso ? " · " + esc(x.curso) : ""}</small></span>
          <span class="me-acoes"><a class="me-btn" href="${linkApp(x.curso, base + ":etude")}">Estudar</a><a class="me-btn" href="${linkApp(x.curso, base + ":dictee")}">Ditado</a><a class="me-btn cheio" style="--c:${oral ? COR.anil : COR.rosa}" href="${linkApp(x.curso, base + (oral ? ":oral" : ":ecrit"))}">${oral ? "Oral" : "Escrever"}</a><button class="me-btn" type="button" data-rm-carnet="${esc(x.id)}" aria-label="Retirar">✕</button></span></div>`; }).join("")}</div>`
      : '<div class="me-vazio">Nenhum sujet salvo. No Ambiente de Produção, abra um modelo e toque em « Enregistrer dans mon cahier ».</div>';
    return `<section class="me-secao" id="revisao" style="--c:${COR.roxo}"><div class="me-secao-cab"><div><h2><span class="bolinha"></span>Caderno de Revisão</h2>
      <p>${rv.length} questão(ões) salva(s) · ${erros.length} erro(s) das produções · ${sujets.length} sujet(s) para revisar</p></div></div>
      <div class="me-grade">
        <div class="me-card c12"><h3>Questões salvas <small>Plataforma de Questões</small></h3>${questoes}</div>
        <div class="me-card c6"><h3>Erros das suas produções <small>correções da IA e dos professores</small></h3>${prod}</div>
        <div class="me-card c6"><h3>Sujets para revisar <small>Ambiente de Produção</small></h3>${sj}</div>
      </div></section>`;
  }

  // Tarefas do professor (antes « Mon espace » do Ambiente de Produção): devoirs, mensagens e provas.
  function secTarefas(d) {
    const devs = d.ambiente?.devoirs || [], msgs = d.ambiente?.mensagens || [];
    const pend = devs.filter(x => !x.feito), feitos = devs.filter(x => x.feito);
    const item = x => `<a class="me-item" style="--c:${x.feito ? COR.verde : COR.anil}" href="${x.link ? esc(x.link) : "producao.html#devoir=" + encodeURIComponent(x.id)}">
      <span class="marca">${x.feito ? "✅" : x.tipo === "oral" ? "🎙️" : "✍️"}</span><span class="txt"><b>${esc(x.titre)}</b><small>${esc(x.tipoNome || "")}${x.tache ? " · " + esc(TAREFA[x.tache] || x.tache) : ""} · ${fmtData(x.data)}${x.mensagem ? " · " + esc(x.mensagem) : ""}</small></span>
      <span class="me-pill">${x.feito ? (x.score !== "" && x.score != null ? `${x.score}${x.total ? "/" + x.total : ""}` : "feito") : "fazer →"}</span></a>`;
    return `<section class="me-secao" id="tarefas" style="--c:${COR.anil}"><div class="me-secao-cab"><div><h2><span class="bolinha"></span>Tarefas do professor</h2>
      <p>${pend.length} tarefa(s) a fazer · ${msgs.filter(m => !m.feito).length} mensagem(ns) a ler</p></div><a class="me-btn cheio" style="--c:${COR.anil}" href="producao.html#epreuve">Minhas provas</a></div>
      <div class="me-grade">
        <div class="me-card c6"><h3>A fazer <small>${pend.length}</small></h3>${pend.length ? `<div class="me-lista">${pend.map(item).join("")}</div>` : '<div class="me-vazio">Nenhuma tarefa pendente. 🎉</div>'}
          ${feitos.length ? `<details style="margin-top:12px;"><summary>✓ Tarefas concluídas (${feitos.length})</summary><div class="me-lista" style="margin-top:8px;">${feitos.map(item).join("")}</div></details>` : ""}</div>
        <div class="me-card c6"><h3>Mensagens do professor</h3>${msgs.length ? `<div class="me-lista">${msgs.map(m => `<div class="me-item" style="--c:${m.feito ? COR.verde : COR.laranja}">
          <span class="marca">${m.feito ? "✅" : "💬"}</span><span class="txt" style="white-space:normal;"><small>${esc(m.de || "Professor")} · ${fmtData(m.data)}</small><span style="display:block;font-size:.86rem;line-height:1.5;">${esc(m.texto)}</span></span>
          <button class="me-btn" type="button" data-msg="${esc(m.id)}" data-feito="${m.feito ? "0" : "1"}">${m.feito ? "Reabrir" : "✓ Feito"}</button></div>`).join("")}</div>` : '<div class="me-vazio">Nenhuma mensagem.</div>'}</div>
      </div></section>`;
  }
  const rpc = (nome, args) => fetch("/api/modeles/rpc/" + nome, { method: "POST", headers: Object.assign(H(), { "Content-Type": "application/json" }), body: JSON.stringify({ args }) });

  // ---------------- montagem ----------------
  function montar(d) {
    const nav = [["geral", "Visão geral", COR.roxo], ["questoes", "Questões", COR.azul], ["erros", "Caderno de erros", COR.vermelho], ["revisao", "Caderno de Revisão", COR.roxo], ["producoes", "Produções", COR.rosa], ["tarefas", "Tarefas do professor", COR.anil],
      ["simulados", "Simulados", COR.laranja], ["aulas", "Aulas", COR.verde], ["favoritos", "Favoritos", COR.rosa], ["rotina", "Rotina", COR.teal]];
    raiz.innerHTML = heroi(d) + kpis(d) +
      `<nav class="me-nav" aria-label="Seções do Meu espaço">${nav.map(([id, n, c]) => `<a href="#${id}" style="--c:${c}" data-sec="${id}">${n}</a>`).join("")}</nav>` +
      visaoGeral(d) + secQuestoes(d) + secErros(d) + secRevisao(d) + secProducoes(d) + secTarefas(d) + secSimulados(d) + secAulas(d) + secFavoritos(d) + secRotina(d);
    desenharErros(d);
    // barras animadas
    requestAnimationFrame(() => raiz.querySelectorAll("[data-w]").forEach(b => { b.style.width = b.dataset.w + "%"; }));
    // filtros do caderno de erros
    raiz.addEventListener("click", ev => {
      const f = ev.target.closest("[data-ef]");
      if (f) { errosEstado.filtro = f.dataset.ef; desenharErros(d); }
      // Caderno de Revisão: tirar uma questão salva / um item do caderno das produções
      const rq = ev.target.closest("[data-rm-caderno]");
      if (rq) {
        rq.disabled = true;
        fetch("/api/questoes/caderno/" + rq.dataset.rmCaderno, { method: "DELETE", headers: H() })
          .then(r => { if (r.ok) rq.closest("[data-item-caderno]").remove(); else rq.disabled = false; }).catch(() => { rq.disabled = false; });
      }
      const rc = ev.target.closest("[data-rm-carnet]");
      if (rc) {
        rc.disabled = true;
        rpc("removerDoCarnet", [rc.dataset.rmCarnet])
          .then(r => { if (r.ok) rc.closest("[data-item-carnet]").remove(); else rc.disabled = false; }).catch(() => { rc.disabled = false; });
      }
      // mensagens do professor: marcar como feita / reabrir
      const bm = ev.target.closest("[data-msg]");
      if (bm) {
        bm.disabled = true;
        const feito = bm.dataset.feito === "1";
        rpc("marcarMensagem", [bm.dataset.msg, feito]).then(r => {
          bm.disabled = false;
          if (!r.ok) return;
          const m = (d.ambiente.mensagens || []).find(x => x.id === bm.dataset.msg);
          if (m) m.feito = feito;
          const it = bm.closest(".me-item");
          it.style.setProperty("--c", feito ? COR.verde : COR.laranja);
          it.querySelector(".marca").textContent = feito ? "✅" : "💬";
          bm.dataset.feito = feito ? "0" : "1";
          bm.textContent = feito ? "Reabrir" : "✓ Feito";
        }).catch(() => { bm.disabled = false; });
      }
    });
    raiz.addEventListener("change", ev => { if (ev.target.matches("[data-em]")) { errosEstado.materia = ev.target.value; desenharErros(d); } });
    // explicação detalhada (pegadinhas e dicas) ao abrir um erro
    raiz.addEventListener("toggle", ev => {
      const det = ev.target.closest && ev.target.closest("[data-explicar]");
      if (!det || !det.open) return;
      const alvo = det.querySelector("[data-ia]");
      if (alvo.dataset.ok) return;
      alvo.dataset.ok = "1";
      alvo.innerHTML = '<p class="me-vazio" style="padding:8px;">Preparando pegadinhas e dicas…</p>';
      fetch(`/api/questoes/${det.dataset.explicar}/explicacao-detalhada`, { headers: H() }).then(r => r.json().then(x => ({ ok: r.ok, x }))).then(({ ok, x }) => {
        if (!ok) { alvo.innerHTML = `<p class="me-vazio" style="padding:8px;">${esc(x.msg || "Indisponível agora.")}</p>`; delete alvo.dataset.ok; return; }
        alvo.innerHTML = `<div class="explica"><b>Por que é a certa:</b> ${esc(x.porque)}</div>` +
          (x.pegadinhas.length ? `<div class="explica"><b>Pegadinhas:</b><ul style="margin:4px 0 0;padding-left:18px;">${x.pegadinhas.map(p => `<li>${p.texto ? "« " + esc(p.texto) + " » " : ""}${esc(p.motivo)}</li>`).join("")}</ul></div>` : "") +
          (x.dicas.length ? `<div class="explica"><b>Dicas:</b><ul style="margin:4px 0 0;padding-left:18px;">${x.dicas.map(t => `<li>${esc(t)}</li>`).join("")}</ul></div>` : "");
      }).catch(() => { alvo.innerHTML = ""; delete alvo.dataset.ok; });
    }, true);
    // seção ativa na navegação
    const links = [...raiz.querySelectorAll(".me-nav a")];
    const obs = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) links.forEach(l => l.classList.toggle("ativo", l.dataset.sec === e.target.id));
    }), { rootMargin: "-40% 0px -55% 0px" });
    raiz.querySelectorAll(".me-secao").forEach(s => obs.observe(s));
    if (location.hash) { const alvo = document.getElementById(location.hash.slice(1)); if (alvo) setTimeout(() => alvo.scrollIntoView({ behavior: "smooth" }), 200); }
  }

  raiz.innerHTML = '<div class="me-carregando"><div style="text-align:center;"><i style="display:inline-block"></i><p>Montando o seu espaço…</p></div></div>';
  fetch("/api/meu-espaco", { headers: H() })
    .then(r => r.ok ? r.json() : Promise.reject(r))
    .then(montar)
    .catch(() => { raiz.innerHTML = '<div class="me-vazio" style="padding:60px;">Não foi possível carregar o seu espaço. Atualize a página.</div>'; });
})();
