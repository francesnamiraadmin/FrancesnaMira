// =====================================================================
// DEVER DE CASA (dever.html?id=<dever>) — a aba que o aluno abre para fazer um dever: todos os
// elementos cobrados, um embaixo do outro, cada um respondido aqui mesmo pelo widget certo
// (js/deverWorkspace.js): conjunto de questões, redação/gravação, aula gravada, dever completo.
// À esquerda, o roteiro com o andamento de cada atividade; no alto, prazo e progresso.
// =====================================================================
(function () {
  const raiz = document.getElementById("dever");
  const id = new URLSearchParams(location.search).get("id");
  const H = () => ({ Authorization: "Bearer " + localStorage.getItem("token") });
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const TIPO = {
    questoes_plataforma: ["❓", "Questões", "#2563eb"], exercicio_lista: ["❓", "Questões", "#2563eb"], simulado: ["🏆", "Simulado", "#f59e0b"],
    producao_textual: ["✍️", "Produção escrita", "#db2777"], producao_oral: ["🎙️", "Produção oral", "#7c3aed"], producao_ambiente: ["🗂️", "Ambiente de Produção", "#b45309"],
    assistir_aula: ["▶️", "Aula gravada", "#16a34a"], assistir_modulo: ["🎬", "Módulo de aulas", "#0d9488"], exercicio_interativo: ["🧩", "Dever completo", "#4f46e5"]
  };
  const tipoDe = a => TIPO[a.tipo] || ["📄", "Atividade", "#64748b"];
  const feita = a => a.entrega?.status === "enviado";
  let dever = null;

  function estadoTexto(a) {
    if (a.bloqueada) return ["🔒 Bloqueada", "bloq"];
    if (feita(a)) return [a.entrega.entregueComAtraso ? "✓ Feita com atraso" : "✓ Feita", "ok"];
    return [a.entrega?.atrasada ? "Pendente · em atraso" : "Pendente", a.entrega?.atrasada ? "atraso" : "pend"];
  }
  function prazoTexto(d) {
    if (d.status === "concluido") return "Concluído";
    const dias = Math.ceil((new Date(d.dataLimite) - Date.now()) / 864e5);
    return dias > 1 ? `faltam ${dias} dias` : dias === 1 ? "último dia amanhã" : dias === 0 ? "termina hoje" : `atrasado há ${-dias} dia(s)`;
  }

  function cabecalho(d) {
    const total = d.atividades.length, feitas = d.atividades.filter(feita).length, pct = total ? Math.round(feitas / total * 100) : 0;
    return `<section class="dv-heroi">
      <div class="dv-heroi-txt">
        <small>${d.curso ? esc(d.curso) + " · " : ""}Dever de casa${d.numeroSemana ? " · semana " + d.numeroSemana : ""}</small>
        <h1>${esc(d.titulo)}</h1>
        <div class="dv-chips"><span>📅 até ${new Date(d.dataLimite).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}</span>
          <span class="dv-prazo ${d.status}">⏳ ${prazoTexto(d)}</span>${d.prioridade === "alta" ? '<span class="dv-alta">⚡ prioridade alta</span>' : ""}</div>
        ${d.descricao ? `<p class="dv-msg">💬 ${esc(d.descricao)}</p>` : ""}
      </div>
      <div class="dv-anel" style="--p:${pct}"><i><b id="dvPct">${pct}%</b><small id="dvFeitas">${feitas} de ${total}</small></i></div>
    </section>`;
  }
  function roteiro(d) {
    return d.atividades.map((a, i) => { const [ic, , cor] = tipoDe(a), [txt, cls] = estadoTexto(a);
      return `<a href="#atv-${i}" class="dv-passo ${cls}" style="--c:${cor}" data-passo="${i}"><span class="dv-num">${feita(a) ? "✓" : i + 1}</span><span><b>${esc(a.titulo)}</b><small>${ic} ${esc(txt)}</small></span></a>`; }).join("");
  }
  function cartao(a, i) {
    const [ic, nome, cor] = tipoDe(a), [txt, cls] = estadoTexto(a);
    return `<article class="dv-card ${cls}" id="atv-${i}" style="--c:${cor}">
      <header><span class="dv-ic">${ic}</span><div><small>${i + 1}. ${esc(nome)}${a.obrigatoria ? "" : " · opcional"}</small><h2>${esc(a.titulo)}</h2></div><span class="dv-estado ${cls}" data-estado="${i}">${esc(txt)}</span></header>
      <div class="dv-corpo" data-corpo="${i}"></div></article>`;
  }
  function rodape(d) {
    if (d.status === "concluido") return '<div class="dv-fim ok">🎉 Você concluiu este dever. As respostas ficaram nas suas estatísticas do Meu Espaço.</div>';
    return `<div class="dv-fim"><button class="dv-btn" type="button" id="dvConcluir" ${d.podeConcluir ? "" : "disabled"}>${d.podeConcluir ? "Concluir o dever" : "Faça as atividades obrigatórias para concluir"}</button><span id="dvMsg"></span></div>`;
  }

  function desenhar(d) {
    raiz.innerHTML = cabecalho(d) + `<div class="dv-layout"><nav class="dv-roteiro" aria-label="Atividades do dever"><h3>Roteiro</h3>${roteiro(d)}<a class="dv-voltar" href="meus-deveres.html">← Meus deveres</a></nav>
      <div class="dv-lista">${d.atividades.map(cartao).join("")}<div id="dvRodape">${rodape(d)}</div></div></div>`;
    d.atividades.forEach((a, i) => montarAtividade(a, i));
  }
  function montarAtividade(a, i) {
    const corpo = raiz.querySelector(`[data-corpo="${i}"]`);
    if (!corpo) return;
    corpo.innerHTML = "";
    const box = document.createElement("div");
    box.className = "atividade-aluno";
    corpo.appendChild(box);
    DeverWorkspace.renderAtividade(box, a, i, { deverId: dever._id, onAtualizado: atualizar });
  }

  // Atualiza o andamento sem desmontar o que o aluno está fazendo: só redesenha as atividades
  // que mudaram de estado — inclusive as que acabaram de ser liberadas (ex.: concluir o Règlement
  // libera as outras na hora, sem recarregar). `opcoes.manterAberto` = índice da atividade que
  // continua aberta (o exercício embutido mostra a correção logo depois de entregar); `true` =
  // nenhuma é redesenhada só por ter sido feita (atualização vinda de outra aba).
  async function atualizar(novo, opcoes) {
    if (!novo || !novo.atividades) {
      const r = await fetch(`/api/deveres/minhas-semanas/${id}`, { headers: H() });
      if (!r.ok) return;
      novo = await r.json();
    }
    const antes = dever;
    dever = novo;
    const total = novo.atividades.length, feitas = novo.atividades.filter(feita).length, pct = total ? Math.round(feitas / total * 100) : 0;
    const anel = raiz.querySelector(".dv-anel");
    if (anel) { anel.style.setProperty("--p", pct); raiz.querySelector("#dvPct").textContent = pct + "%"; raiz.querySelector("#dvFeitas").textContent = `${feitas} de ${total}`; }
    const rot = raiz.querySelector(".dv-roteiro");
    if (rot) rot.innerHTML = `<h3>Roteiro</h3>${roteiro(novo)}<a class="dv-voltar" href="meus-deveres.html">← Meus deveres</a>`;
    novo.atividades.forEach((a, i) => {
      const [txt, cls] = estadoTexto(a);
      const pill = raiz.querySelector(`[data-estado="${i}"]`);
      if (pill) { pill.textContent = txt; pill.className = "dv-estado " + cls; pill.closest(".dv-card").className = "dv-card " + cls; }
      const ant = antes && antes.atividades[i];
      const liberada = ant && ant.bloqueada !== a.bloqueada;
      const feitaAgora = ant && feita(ant) !== feita(a);
      const manter = opcoes && opcoes.manterAberto;
      const aberta = manter === true || manter === i;
      if (liberada || (feitaAgora && !aberta)) montarAtividade(a, i);
    });
    const rp = raiz.querySelector("#dvRodape");
    if (rp) rp.innerHTML = rodape(novo);
  }

  raiz.addEventListener("click", async e => {
    const b = e.target.closest("#dvConcluir");
    if (b && !b.disabled) {
      b.disabled = true;
      const r = await fetch(`/api/deveres/minhas-semanas/${id}/concluir`, { method: "POST", headers: H() });
      const d = await r.json();
      if (!r.ok) { raiz.querySelector("#dvMsg").textContent = d.msg || "Não foi possível concluir."; b.disabled = false; return; }
      // concluído: vai para o Meu Espaço (deveres), onde aparece « Adiantar Dever » se houver próxima semana
      location.href = "meu-espaco.html?concluido=" + encodeURIComponent(id) + "#deveres";
      return;
    }
    const p = e.target.closest("[data-passo]");
    if (p) { e.preventDefault(); document.getElementById("atv-" + p.dataset.passo).scrollIntoView({ behavior: "smooth", block: "start" }); }
  });

  async function carregar() {
    if (!id || !/^[a-f0-9]{24}$/i.test(id)) { raiz.innerHTML = '<div class="dv-vazio">Dever não informado. <a href="meus-deveres.html">Ver meus deveres</a></div>'; return; }
    const r = await fetch(`/api/deveres/minhas-semanas/${id}`, { headers: H() });
    if (!r.ok) { raiz.innerHTML = '<div class="dv-vazio">Não foi possível abrir este dever. <a href="meus-deveres.html">Ver meus deveres</a></div>'; return; }
    dever = await r.json();
    document.title = dever.titulo + " - Dever de casa - Francês na Mira";
    desenhar(dever);
  }

  // ao vivo: correção de produção, aula assistida em outra aba, dever editado pela equipe
  if (window.DeverRealtime) DeverRealtime.escutar({
    "dever-atualizado": d => { if (d.alunoId === DeverRealtime.meuUserId()) atualizar(null, { manterAberto: true }); },
    "aula-progresso-atualizado": d => { if (d.userId === DeverRealtime.meuUserId()) atualizar(null, { manterAberto: true }); },
    "producao-atualizada": d => { if (d.alunoId === DeverRealtime.meuUserId()) atualizar(); }
  });
  carregar();
})();
