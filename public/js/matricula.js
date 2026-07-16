(function () {
  // Preenchido depois que window.AuthGate.ensure() resolver (login existente,
  // sessão renovada via refresh token, ou login/cadastro feitos ali mesmo no
  // modal, sem sair da página) — ver a chamada a showStep(0) no fim do arquivo.
  let tk = null;

  function authHeaders(json) {
    const h = { Authorization: "Bearer " + tk };
    if (json) h["Content-Type"] = "application/json";
    return h;
  }
  function fmtMoeda(v) {
    return (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  // ---------- MODO PLANO (vindo dos cards de preço) ----------
  const urlParams = new URLSearchParams(window.location.search);
  const modoPlano = urlParams.has("plano");
  const planoInfo = modoPlano ? {
    curso: urlParams.get("curso") || "",
    plano: urlParams.get("plano") || "",
    valor: Number(urlParams.get("valor")) || 0
  } : null;
  let turmaDisponivelParaPlano = true;

  // Cursos com agenda própria (grade de horários + preço progressivo).
  const CURSOS_COM_HORARIO = ["TCF", "TEF", "DELF", "DALF", "A1", "A2", "B1", "B2"];
  const usaHorarios = !modoPlano || CURSOS_COM_HORARIO.includes(planoInfo.curso);

  // Produtos do Pack Prestige (plano único + upgrades) — mesma config do
  // backend/utils/precoPackPrestige.js, aqui só para o preview ao vivo.
  const PACK_PRESTIGE_PRODUTOS = {
    "Plataforma de Questões": { chave: "plataforma", preco: 65 },
    "Ambiente de Produção Oral e Textual": { chave: "producao", preco: 65 },
    "Aulas Especializadas Online": { chave: "aulasEspecializadas", preco: 110 }
  };
  // R$55 (não R$30) para Plataforma/Produção como upgrade — faz o total fechar igual não
  // importa qual dos 3 produtos é escolhido como principal (ver backend/utils/precoPackPrestige.js).
  const PRECO_UPGRADE = { plataforma: 55, producao: 55, aulasEspecializadas: 100 };
  const NOMES_PRODUTO_PACK = {
    plataforma: "Plataforma de Questões",
    producao: "Ambiente de Produção Oral e Textual",
    aulasEspecializadas: "Aulas Especializadas Online"
  };
  function precoPackPrestige(produtoPrincipal, upgrades) {
    const principal = PACK_PRESTIGE_PRODUTOS[produtoPrincipal];
    if (!principal) return 0;
    let total = principal.preco;
    (upgrades || []).forEach(k => { if (k !== principal.chave && PRECO_UPGRADE[k] !== undefined) total += PRECO_UPGRADE[k]; });
    return total;
  }
  const usaPackPrestige = modoPlano && !!PACK_PRESTIGE_PRODUTOS[planoInfo.curso] && planoInfo.plano === "Pack Prestige";

  // ---------- PREÇO (mesma fórmula do backend/utils/precoMatricula.js — o valor real
  // cobrado é sempre recalculado no servidor, isso aqui é só o preview ao vivo) ----------
  const VALOR_BASE_AULA = 400;
  const DESCONTO_POR_QTD = { 1: 0, 2: 0.05, 3: 0.10, 4: 0.15 };
  function precoEssentiel(n) {
    const d = DESCONTO_POR_QTD[n];
    if (d === undefined) return 0;
    return Math.ceil(n * VALOR_BASE_AULA - d * VALOR_BASE_AULA);
  }
  function precoPorTier(n, tier) {
    const essentiel = precoEssentiel(n);
    if (tier === "Essentiel") return essentiel;
    const avance = essentiel + 90;
    if (tier === "Avancé") return avance;
    return avance + 100; // Excellence
  }

  const TIERS = ["Essentiel", "Avancé", "Excellence"];
  const BENEFICIOS_TIER = {
    Essentiel: { particular: true, plataforma: false, producao: false, gravadas: false },
    "Avancé": { particular: true, plataforma: true, producao: true, gravadas: false },
    Excellence: { particular: true, plataforma: true, producao: true, gravadas: true }
  };
  const NOMES_BENEFICIO = [
    { key: "particular", label: "Aula particular" },
    { key: "plataforma", label: "Plataforma de questões" },
    { key: "producao", label: "Ambiente de produção" },
    { key: "gravadas", label: "Aulas Especializadas gravadas" }
  ];

  const DIAS_LABEL = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const ORDEM_DIAS = [1, 2, 3, 4, 5, 6, 0]; // exibição Seg..Dom

  const STEP_LABELS = {
    dados: "Seus dados", turma: "Turma", upgrade: "Upgrade",
    horarios: "Horários e plano", resumo: "Resumo", pagamento: "Pagamento"
  };

  // ---------- ESTADO ----------
  const state = {
    tipo: null,
    turma: null, // só usado pelo fluxo antigo (turma avulsa fora do Pack Prestige)
    periodo: null,
    slotsSelecionados: [], // [{_id, diaSemana, horaInicio}]
    tierEscolhido: modoPlano && CURSOS_COM_HORARIO.includes(planoInfo?.curso) ? planoInfo.plano : null,
    upgrades: [], // chaves do Pack Prestige (plataforma/producao/aulasEspecializadas) marcadas como adicional
    cupom: null,
    matricula: null
  };
  let ultimosSlotsCarregados = [];

  let steps = ["dados"];
  let currentIndex = 0;

  function stepsPadrao() {
    return ["dados", "horarios", "resumo", "pagamento"];
  }

  if (usaHorarios) {
    state.tipo = "particular";
    steps = stepsPadrao();
    document.getElementById("campoCupom").style.display = "none";
    if (modoPlano) {
      document.querySelector(".eyebrow").textContent = "Assinatura";
      document.querySelector("header.top .sub").textContent =
        "Escolha a modalidade, os horários e o plano ideal para " + planoInfo.curso + ".";
    }
  } else if (usaPackPrestige) {
    // Plataforma de Questões, Ambiente de Produção Oral e Textual e Aulas Especializadas
    // Online — plano único (Pack Prestige) com upgrades opcionais para os outros dois produtos.
    state.tipo = "turma";
    steps = ["dados", "upgrade", "resumo", "pagamento"];
    document.querySelector(".eyebrow").textContent = "Assinatura";
    document.querySelector("h1.brand").innerHTML = "Pack Prestige" + '<span class="dot"></span>';
    document.querySelector("header.top .sub").textContent =
      "Finalize sua assinatura de " + planoInfo.curso + " e adicione outros produtos ao seu pack, se quiser.";
    document.getElementById("campoCupom").style.display = "none";
    document.getElementById("camposParticular").style.display = "none";
  } else {
    // Fluxo antigo (sem alteração, hoje sem nenhum card apontando para cá).
    state.tipo = "turma";
    steps = planoInfo.plano === "Essentiel" ? ["dados", "resumo", "pagamento"] : ["dados", "turma", "resumo", "pagamento"];
    document.querySelector(".eyebrow").textContent = "Assinatura";
    document.querySelector("h1.brand").innerHTML = "Plano " + planoInfo.plano + '<span class="dot"></span>';
    document.querySelector("header.top .sub").textContent =
      "Falta pouco para ativar seu plano " + planoInfo.plano + (planoInfo.curso ? " em " + planoInfo.curso : "") + ". Confirme seus dados e escolha a forma de pagamento.";
    document.getElementById("campoCupom").style.display = "none";
    document.getElementById("camposParticular").style.display = "none";
  }

  function cursoAtual() {
    return (modoPlano && planoInfo.curso) || "Aula particular/turma";
  }

  // ---------- MIRA TRACK ----------
  function renderMira() {
    const track = document.getElementById("miraTrack");
    track.innerHTML = "";
    steps.forEach((key, i) => {
      const n = i + 1;
      const wrap = document.createElement("div");
      wrap.className = "mira-step" + (n < currentIndex + 1 ? " done" : "") + (n === currentIndex + 1 ? " active" : "");
      wrap.innerHTML = '<div class="line"></div><div class="target"><div class="bull"></div></div><div class="mira-label">' + STEP_LABELS[key] + "</div>";
      track.appendChild(wrap);
    });
  }

  function hideTopError() { document.getElementById("topError").style.display = "none"; }
  function showTopError(msg) {
    const el = document.getElementById("topError");
    el.textContent = msg;
    el.style.display = "block";
  }
  function hideTopOk() { document.getElementById("topOk").style.display = "none"; }

  function showStep(index) {
    currentIndex = index;
    const key = steps[index];
    document.querySelectorAll(".step").forEach(s => (s.style.display = "none"));
    document.querySelector('.step[data-step="' + key + '"]').style.display = "block";
    document.getElementById("btnBack").style.visibility = index === 0 ? "hidden" : "visible";
    document.getElementById("btnNext").style.display = key === "pagamento" ? "none" : "inline-block";
    document.getElementById("btnNext").innerHTML = 'Continuar <span class="arrow">→</span>';
    document.getElementById("btnNext").disabled = false;
    document.querySelector(".wrap").classList.toggle("wide", key === "horarios");
    renderMira();
    hideTopError();
    hideTopOk();
    window.scrollTo({ top: 0, behavior: "smooth" });

    if (key === "dados") prefillDados();
    if (key === "turma") carregarTurmas();
    if (key === "horarios") entrarEmHorarios();
    if (key === "upgrade") renderUpgradeGrid();
    if (key === "resumo") renderResumo();
    if (key === "pagamento") renderPagamentoResumo();
  }

  function showSuccess(msg) {
    document.querySelectorAll(".step").forEach(s => (s.style.display = "none"));
    document.querySelector('.step[data-step="success"]').style.display = "block";
    document.getElementById("actions").style.display = "none";
    document.getElementById("miraTrack").style.display = "none";
    if (!msg && modoPlano) msg = "Seu plano " + planoInfo.plano + " foi ativado. Em instantes você recebe um e-mail de confirmação. À bientôt!";
    if (!msg && usaHorarios && !modoPlano) msg = "Sua matrícula foi confirmada. Em instantes você recebe um e-mail de confirmação. À bientôt!";
    if (msg) document.getElementById("successMsg").textContent = msg;
    const link = document.getElementById("successLink");
    link.href = "minha-conta.html";
    link.textContent = "Ver minha conta";
    window.scrollTo({ top: 0, behavior: "smooth" });
    setTimeout(() => { window.location.href = "minha-conta.html"; }, 1800);
  }

  function showFieldError(fieldId, show) {
    const el = document.getElementById(fieldId);
    if (el) el.classList.toggle("invalid", !!show);
  }

  // ---------- STEP: DADOS ----------
  async function prefillDados() {
    if (document.getElementById("nome").value) return;
    try {
      const res = await fetch("/api/auth/me", { headers: authHeaders() });
      if (res.ok) {
        const d = await res.json();
        document.getElementById("nome").value = d.nome || "";
        document.getElementById("email").value = d.email || "";
      }
    } catch (e) { /* silencioso */ }
  }

  document.getElementById("objetivo").addEventListener("change", e => {
    const isProva = e.target.value === "Preparação para exame de proficiência";
    document.getElementById("f-prova").style.display = isProva ? "block" : "none";
    document.getElementById("f-dataExame").style.display = isProva ? "block" : "none";
  });

  // ---------- STEP: UPGRADE (Pack Prestige) ----------
  function outrosProdutosPack() {
    const principal = PACK_PRESTIGE_PRODUTOS[planoInfo.curso];
    return Object.keys(PACK_PRESTIGE_PRODUTOS)
      .filter(nome => nome !== planoInfo.curso)
      .map(nome => ({ nome, chave: PACK_PRESTIGE_PRODUTOS[nome].chave }))
      .filter(p => p.chave !== principal.chave);
  }

  function renderUpgradeGrid() {
    const grid = document.getElementById("upgradeGrid");
    const outros = outrosProdutosPack();
    grid.innerHTML = outros.map(p =>
      '<label class="option" for="upg-' + p.chave + '">' +
        '<input type="checkbox" id="upg-' + p.chave + '" data-upgrade="' + p.chave + '">' +
        '<span class="opt-text"><span class="opt-title">' + p.nome + '</span><br>' +
        '<span class="opt-sub">+' + fmtMoeda(PRECO_UPGRADE[p.chave]) + '/mês</span></span>' +
      '</label>'
    ).join("") +
      '<label class="option" for="upg-nenhum">' +
        '<input type="checkbox" id="upg-nenhum" data-upgrade="nenhum">' +
        '<span class="opt-text"><span class="opt-title">Não quero adicionais</span></span>' +
      '</label>';
    atualizarSelecaoUpgrade();
    atualizarTotalUpgrade();
  }

  function atualizarSelecaoUpgrade() {
    document.querySelectorAll('#upgradeGrid input[data-upgrade]').forEach(input => {
      const marcado = input.dataset.upgrade === "nenhum" ? state.upgrades.length === 0 : state.upgrades.includes(input.dataset.upgrade);
      input.checked = marcado;
      input.closest(".option").classList.toggle("selected", marcado);
    });
  }

  function atualizarTotalUpgrade() {
    document.getElementById("upgradeTotalValor").textContent = fmtMoeda(precoPackPrestige(planoInfo.curso, state.upgrades));
  }

  document.getElementById("upgradeGrid").addEventListener("change", e => {
    const input = e.target.closest("input[data-upgrade]");
    if (!input) return;
    const chave = input.dataset.upgrade;
    if (chave === "nenhum") {
      state.upgrades = [];
    } else if (input.checked) {
      state.upgrades = state.upgrades.includes(chave) ? state.upgrades : state.upgrades.concat(chave);
    } else {
      state.upgrades = state.upgrades.filter(k => k !== chave);
    }
    atualizarSelecaoUpgrade();
    atualizarTotalUpgrade();
  });

  // ---------- STEP: TURMA (fluxo antigo — turma avulsa fora do Pack Prestige) ----------
  async function carregarTurmas() {
    const grid = document.getElementById("turmaGrid");
    grid.innerHTML = '<p class="help">Carregando turmas…</p>';
    try {
      const res = await fetch("/api/turmas", { headers: authHeaders() });
      let turmas = await res.json();
      if (modoPlano) turmas = turmas.filter(t => t.nivel === planoInfo.curso);

      if (!turmas.length) {
        turmaDisponivelParaPlano = false;
        grid.innerHTML = modoPlano
          ? '<div class="empty-state"><div class="icon">🎯</div>Ainda não há turma aberta para ' + planoInfo.curso + '. Sua assinatura será ativada normalmente e nossa equipe entra em contato para agendar suas aulas ao vivo.</div>'
          : '<div class="empty-state"><div class="icon">🎯</div>Nenhuma turma disponível no momento.</div>';
        return;
      }
      turmaDisponivelParaPlano = true;
      grid.innerHTML = "";
      turmas.forEach(t => {
        const id = "turma-" + t._id;
        const card = document.createElement("label");
        card.className = "option pacote" + (t.lotada ? " lotada" : "");
        card.setAttribute("for", id);
        card.innerHTML =
          '<input type="radio" name="turma" id="' + id + '" value="' + t._id + '" style="display:none;" ' + (t.lotada ? "disabled" : "") + '>' +
          '<span class="opt-text" style="width:100%;">' +
            '<span class="pacote-head"><span class="pacote-name">' + t.nome + " — " + t.nivel + '</span><span class="pacote-price">' + fmtMoeda(t.preco) + '</span></span>' +
            '<span class="pacote-sub">' + (t.dias || []).join(", ") + " às " + t.horario + (t.professorId?.nome ? " · Prof. " + t.professorId.nome : "") + '</span>' +
            '<span class="vagas-tag' + (t.vagasRestantes <= 2 && !t.lotada ? " pouca" : "") + '">' + (t.lotada ? "Turma lotada" : t.vagasRestantes + " vaga(s) disponível(is)") + '</span>' +
            (t.lotada ? '<br><button type="button" class="btn-outline btn-small" data-lista-espera="' + t._id + '" style="margin-top:8px;">Entrar na lista de espera</button>' : "") +
          '</span>';
        grid.appendChild(card);
        const input = card.querySelector("input");
        input.addEventListener("change", () => {
          grid.querySelectorAll(".option").forEach(o => o.classList.remove("selected"));
          card.classList.add("selected");
          state.turma = t;
        });
        const btnEspera = card.querySelector("[data-lista-espera]");
        if (btnEspera) {
          btnEspera.addEventListener("click", async ev => {
            ev.preventDefault();
            const nome = document.getElementById("nome").value.trim() || prompt("Seu nome:");
            const email = document.getElementById("email").value.trim() || prompt("Seu e-mail:");
            if (!nome || !email) return;
            btnEspera.disabled = true;
            btnEspera.textContent = "Enviando…";
            try {
              const r = await fetch("/api/turmas/" + t._id + "/lista-espera", {
                method: "POST", headers: authHeaders(true),
                body: JSON.stringify({ nome, email, telefone: document.getElementById("telefone").value.trim() })
              });
              const d = await r.json();
              btnEspera.textContent = r.ok ? "Você entrou na lista ✓" : (d.msg || "Erro");
            } catch (e) {
              btnEspera.textContent = "Erro ao enviar";
            }
          });
        }
      });
    } catch (e) {
      grid.innerHTML = '<p class="field-error" style="display:block;">Não foi possível carregar as turmas.</p>';
    }
  }

  // ---------- STEP: HORÁRIOS + PLANO (fluxo novo) ----------
  const HORAS_POR_PERIODO = {
    diurno: ["06:00", "07:00", "08:00", "09:00", "10:00", "11:00"],
    vespertino: ["12:00", "13:00", "14:00", "15:00", "16:00", "17:00"],
    noturno: ["18:00", "19:00", "20:00", "21:00", "22:00", "23:00", "00:00"]
  };

  function entrarEmHorarios() {
    document.getElementById("btnNext").disabled = true;
    if (!state.periodo) state.periodo = "diurno";
    document.querySelectorAll(".periodo-tab").forEach(b => b.classList.toggle("active", b.dataset.periodo === state.periodo));
    renderTierGrid();
    renderResumoFlutuante();
    carregarGrade();
  }

  document.getElementById("periodoTabs").addEventListener("click", e => {
    const btn = e.target.closest(".periodo-tab");
    if (!btn) return;
    state.periodo = btn.dataset.periodo;
    document.querySelectorAll(".periodo-tab").forEach(b => b.classList.toggle("active", b === btn));
    carregarGrade();
  });

  async function carregarGrade() {
    const tabela = document.getElementById("tabelaHorarios");
    tabela.innerHTML = '<tr><td>Carregando horários…</td></tr>';
    try {
      const res = await fetch("/api/horarios/" + state.tipo + "/" + state.periodo, { headers: authHeaders() });
      ultimosSlotsCarregados = res.ok ? await res.json() : [];
      renderTabela();
    } catch (e) {
      tabela.innerHTML = '<tr><td class="field-error" style="display:table-cell;">Não foi possível carregar os horários.</td></tr>';
    }
  }

  function renderTabela() {
    const tabela = document.getElementById("tabelaHorarios");
    const porHora = {};
    ultimosSlotsCarregados.forEach(s => {
      (porHora[s.horaInicio] = porHora[s.horaInicio] || {})[s.diaSemana] = s;
    });
    const horas = HORAS_POR_PERIODO[state.periodo || "diurno"];

    let html = '<thead><tr><th>Horário</th>' + ORDEM_DIAS.map(d => '<th>' + DIAS_LABEL[d] + '</th>').join("") + '</tr></thead><tbody>';
    horas.forEach(hora => {
      html += '<tr><td class="hora-label">' + hora + '</td>';
      ORDEM_DIAS.forEach(dia => {
        const slot = (porHora[hora] || {})[dia];
        if (!slot) { html += '<td class="horario-cel vazio"></td>'; return; }
        const selecionado = state.slotsSelecionados.some(s => s._id === slot._id);
        const classe = selecionado ? "selecionado" : (slot.disponivel ? "disponivel" : "indisponivel");
        html += '<td class="horario-cel ' + classe + '" data-slot-id="' + slot._id + '" data-dia="' + dia + '" data-hora="' + hora + '"></td>';
      });
      html += "</tr>";
    });
    html += "</tbody>";
    tabela.innerHTML = html;
  }

  document.getElementById("tabelaHorarios").addEventListener("click", e => {
    const td = e.target.closest(".horario-cel");
    if (!td || td.classList.contains("vazio")) return;
    const slotId = td.dataset.slotId;
    const jaSelecionado = state.slotsSelecionados.find(s => s._id === slotId);

    if (jaSelecionado) {
      state.slotsSelecionados = state.slotsSelecionados.filter(s => s._id !== slotId);
      hideTopError();
    } else {
      if (td.classList.contains("indisponivel")) return;
      if (state.slotsSelecionados.length >= 4) {
        showTopError("Você pode selecionar no máximo quatro horários semanais.");
        return;
      }
      state.slotsSelecionados.push({ _id: slotId, diaSemana: Number(td.dataset.dia), horaInicio: td.dataset.hora });
      hideTopError();
    }
    renderTabela();
    renderTierGrid();
    renderResumoFlutuante();
    atualizarBotaoContinuarHorarios();
  });

  function renderTierGrid() {
    const wrap = document.getElementById("tierGrid");
    const n = state.slotsSelecionados.length;
    wrap.innerHTML = TIERS.map(tier => {
      const preco = n > 0 ? precoPorTier(n, tier) : null;
      const beneficios = BENEFICIOS_TIER[tier];
      const selecionado = state.tierEscolhido === tier;
      return (
        '<label class="tier-card' + (selecionado ? " selecionado" : "") + '" data-tier="' + tier + '">' +
          '<input type="radio" name="tierEscolhido" value="' + tier + '" style="display:none;" ' + (selecionado ? "checked" : "") + '>' +
          "<h3>" + tier + "</h3>" +
          '<p class="tier-preco">' + (preco !== null ? fmtMoeda(preco) + "<span>/mês</span>" : "Escolha os horários") + "</p>" +
          "<ul>" + NOMES_BENEFICIO.map(b =>
            '<li class="' + (beneficios[b.key] ? "feature-yes" : "feature-no") + '"><span class="feature-icon">' + (beneficios[b.key] ? "✓" : "✗") + "</span>" + b.label + "</li>"
          ).join("") + "</ul>" +
        "</label>"
      );
    }).join("");
  }

  document.getElementById("tierGrid").addEventListener("click", e => {
    const card = e.target.closest(".tier-card");
    if (!card) return;
    if (!state.slotsSelecionados.length) { showTopError("Escolha ao menos um horário antes de selecionar o plano."); return; }
    state.tierEscolhido = card.dataset.tier;
    hideTopError();
    renderTierGrid();
    renderResumoFlutuante();
    atualizarBotaoContinuarHorarios();
  });

  function renderResumoFlutuante() {
    const el = document.getElementById("resumoFlutuante");
    const n = state.slotsSelecionados.length;
    const preco = (n && state.tierEscolhido) ? precoPorTier(n, state.tierEscolhido) : null;
    const horariosTexto = state.slotsSelecionados.slice()
      .sort((a, b) => ORDEM_DIAS.indexOf(a.diaSemana) - ORDEM_DIAS.indexOf(b.diaSemana) || a.horaInicio.localeCompare(b.horaInicio))
      .map(s => DIAS_LABEL[s.diaSemana] + " " + s.horaInicio).join(", ");
    el.innerHTML =
      "<h3>Seu resumo</h3>" +
      linha("Modalidade", state.tipo === "turma" ? "Turma" : "Particular") +
      linha("Horários", n ? (n + " (" + horariosTexto + ")") : "Nenhum ainda") +
      (state.tierEscolhido ? linha("Plano", state.tierEscolhido) : "") +
      linha("Benefícios liberados", state.tierEscolhido ? NOMES_BENEFICIO.filter(b => BENEFICIOS_TIER[state.tierEscolhido][b.key]).map(b => b.label).join(", ") : "—") +
      '<div class="resumo-total"><span class="label">Mensal</span><span class="valor">' + (preco !== null ? fmtMoeda(preco) : "—") + "</span></div>";
  }

  function atualizarBotaoContinuarHorarios() {
    document.getElementById("btnNext").disabled = !(state.slotsSelecionados.length >= 1 && state.slotsSelecionados.length <= 4 && !!state.tierEscolhido);
  }

  // ---------- STEP: RESUMO ----------
  function precoOriginalAtual() {
    if (usaHorarios) return precoPorTier(state.slotsSelecionados.length, state.tierEscolhido);
    if (usaPackPrestige) return precoPackPrestige(planoInfo.curso, state.upgrades);
    return state.tipo === "turma" && state.turma ? state.turma.preco : planoInfo.valor;
  }

  function renderResumo() {
    const el = document.getElementById("resumoConteudo");
    let html = "";
    if (usaHorarios) {
      html += linha("Curso", cursoAtual());
      html += linha("Modalidade", state.tipo === "turma" ? "Aula em turma" : "Aula particular");
      html += linha("Plano", state.tierEscolhido);
      const nomesHorarios = state.slotsSelecionados.slice()
        .sort((a, b) => ORDEM_DIAS.indexOf(a.diaSemana) - ORDEM_DIAS.indexOf(b.diaSemana) || a.horaInicio.localeCompare(b.horaInicio))
        .map(s => DIAS_LABEL[s.diaSemana] + " às " + s.horaInicio).join("<br>");
      html += linha("Horários escolhidos", nomesHorarios || "—");
      html += linha("Valor mensal", fmtMoeda(precoOriginalAtual()));
    } else if (usaPackPrestige) {
      const principal = PACK_PRESTIGE_PRODUTOS[planoInfo.curso];
      const d = dadosPessoaisAtuais();
      html += linha("Produto principal", planoInfo.curso);
      html += linha("Pack escolhido", "Pack Prestige");
      html += linha(planoInfo.curso, fmtMoeda(principal.preco));
      if (state.upgrades.length) {
        state.upgrades.forEach(chave => {
          html += linha(NOMES_PRODUTO_PACK[chave] + " (adicional)", "+" + fmtMoeda(PRECO_UPGRADE[chave]));
        });
      } else {
        html += linha("Adicionais", "Nenhum");
      }
      html += linha("Valor mensal", fmtMoeda(precoOriginalAtual()));
      html += linha("Nome", d.nome || "—");
      html += linha("E-mail", d.email || "—");
      html += linha("Telefone", d.telefone || "—");
    } else if (modoPlano) {
      html += linha("Plano", planoInfo.plano + (planoInfo.curso ? " — " + planoInfo.curso : ""));
      if (state.turma) {
        html += linha("Turma", state.turma.nome);
        html += linha("Dias e horário", (state.turma.dias || []).join(", ") + " às " + state.turma.horario);
      } else if (!turmaDisponivelParaPlano) {
        html += linha("Aulas ao vivo", "Turma a definir — combinaremos por e-mail");
      }
      html += linha("Valor mensal", fmtMoeda(planoInfo.valor));
    }
    el.innerHTML = html;
    atualizarTotal();
  }

  function linha(label, valor) {
    return '<div class="resumo-linha"><span class="label">' + label + '</span><span class="valor">' + valor + "</span></div>";
  }

  function atualizarTotal() {
    const original = precoOriginalAtual();
    const final = state.cupom ? state.cupom.precoFinal : original;
    let extra = "";
    if (state.cupom) extra = '<div class="resumo-linha resumo-desconto"><span class="label">Desconto (' + state.cupom.codigo + ")</span><span class=\"valor\">-" + fmtMoeda(state.cupom.desconto) + "</span></div>";
    document.getElementById("resumoConteudo").insertAdjacentHTML("beforeend", extra);
    document.getElementById("resumoTotalValor").textContent = fmtMoeda(final);
  }

  document.getElementById("btnAplicarCupom").addEventListener("click", async () => {
    const codigo = document.getElementById("cupomInput").value.trim();
    const msg = document.getElementById("cupomMsg");
    if (!codigo) return;
    msg.className = "cupom-msg"; msg.textContent = "Validando…";
    try {
      const res = await fetch("/api/matricula/validar-cupom", {
        method: "POST", headers: authHeaders(true),
        body: JSON.stringify({ codigo, precoOriginal: precoOriginalAtual() })
      });
      const data = await res.json();
      if (res.ok && data.valido) {
        state.cupom = { codigo: codigo.toUpperCase(), desconto: data.desconto, precoFinal: data.precoFinal };
        msg.className = "cupom-msg ok"; msg.textContent = "Cupom aplicado! Você economizou " + fmtMoeda(data.desconto) + ".";
        renderResumo();
      } else {
        state.cupom = null;
        msg.className = "cupom-msg erro"; msg.textContent = data.msg || "Cupom inválido.";
        renderResumo();
      }
    } catch (e) {
      msg.className = "cupom-msg erro"; msg.textContent = "Erro ao validar cupom.";
    }
  });

  function dadosPessoaisAtuais() {
    return {
      nome: document.getElementById("nome").value.trim(),
      email: document.getElementById("email").value.trim(),
      telefone: document.getElementById("telefone").value.trim(),
      objetivo: document.getElementById("objetivo").value,
      nivelAtual: document.getElementById("nivelAtual").value,
      nivelDesejado: document.getElementById("nivelPretendido").value,
      prova: document.getElementById("prova").value,
      dataExame: document.getElementById("dataExame").value,
      mensagem: document.getElementById("mensagem").value.trim()
    };
  }

  // ---------- STEP: PAGAMENTO ----------
  let mp = null;
  (async () => {
    try {
      const cfg = await fetch("/api/pagamentos/config").then(r => r.json());
      if (cfg.publicKey && !cfg.publicKey.includes("COLOQUE_AQUI") && window.MercadoPago) {
        mp = new MercadoPago(cfg.publicKey, { locale: "pt-BR" });
      }
    } catch (e) { /* silencioso */ }
  })();

  document.querySelectorAll('input[name=metodoPagamento]').forEach(r => {
    r.addEventListener("change", () => {
      document.querySelectorAll("#metodoPagamentoGrid .option").forEach(o => o.classList.remove("selected"));
      r.closest(".option").classList.add("selected");
      renderPainelPagamento(r.value);
    });
  });

  function renderPainelPagamento(metodo) {
    const painel = document.getElementById("painelPagamento");
    if (metodo === "pix") {
      painel.innerHTML =
        '<div class="field"><label>CPF do titular <span class="req">*</span></label><input type="text" id="pixCpf" placeholder="000.000.000-00"></div>' +
        '<button type="button" class="btn-primary" id="btnGerarPix">Gerar Pix</button>' +
        '<div class="pix-box" id="pixBox"><img id="pixQrImg" alt="QR Code Pix"><p>Aponte a câmera do seu banco para o QR Code, ou copie o código abaixo:</p>' +
        '<div class="pix-copy-row"><input type="text" id="pixCode" readonly><button type="button" class="btn-copy" id="btnCopyPix">Copiar</button></div>' +
        '<div class="pix-status" id="pixStatus"></div></div>';
      document.getElementById("btnGerarPix").addEventListener("click", gerarPix);
    } else if (metodo === "cartao") {
      painel.innerHTML =
        '<div class="field"><label>Número do cartão <span class="req">*</span></label><input type="text" id="cartaoNumero" placeholder="0000 0000 0000 0000"></div>' +
        '<div class="field"><label>Nome impresso no cartão <span class="req">*</span></label><input type="text" id="cartaoNome"></div>' +
        '<div class="field" style="display:flex;gap:12px;"><div style="flex:1;"><label>Validade (MM/AA) <span class="req">*</span></label><input type="text" id="cartaoValidade" placeholder="MM/AA"></div><div style="flex:1;"><label>CVV <span class="req">*</span></label><input type="text" id="cartaoCvv" placeholder="000"></div></div>' +
        '<div class="field"><label>CPF do titular <span class="req">*</span></label><input type="text" id="cartaoCpf"></div>' +
        '<div class="field"><label>Parcelas</label><select id="cartaoParcelas"><option value="1">1x sem juros</option><option value="2">2x</option><option value="3">3x</option></select></div>' +
        '<button type="button" class="btn-primary" id="btnPagarCartao">Pagar agora</button>' +
        '<p class="help" id="cartaoStatus"></p>';
      document.getElementById("btnPagarCartao").addEventListener("click", pagarCartao);
    } else if (metodo === "boleto") {
      painel.innerHTML =
        '<div class="field"><label>CPF do titular <span class="req">*</span></label><input type="text" id="boletoCpf"></div>' +
        '<p class="help" style="margin:-4px 0 12px;">O Mercado Pago exige o endereço do titular para emitir o boleto.</p>' +
        '<div class="field"><label>CEP <span class="req">*</span></label><input type="text" id="boletoCep" placeholder="00000-000"></div>' +
        '<div class="field"><label>Rua <span class="req">*</span></label><input type="text" id="boletoRua"></div>' +
        '<div class="field" style="display:flex;gap:12px;"><div style="flex:1;"><label>Número <span class="req">*</span></label><input type="text" id="boletoNumero"></div><div style="flex:2;"><label>Bairro <span class="req">*</span></label><input type="text" id="boletoBairro"></div></div>' +
        '<div class="field" style="display:flex;gap:12px;"><div style="flex:2;"><label>Cidade <span class="req">*</span></label><input type="text" id="boletoCidade"></div><div style="flex:1;"><label>UF <span class="req">*</span></label><input type="text" id="boletoEstado" maxlength="2" placeholder="SP"></div></div>' +
        '<button type="button" class="btn-primary" id="btnGerarBoleto">Gerar boleto</button>' +
        '<p class="help" id="boletoStatus"></p>';
      document.getElementById("btnGerarBoleto").addEventListener("click", gerarBoleto);
    }
  }

  // Monta o corpo comum enviado para /api/pagamentos/{pix,cartao,boleto} — usaHorarios manda
  // tipoMatricula+slotsEscolhidos, usaPackPrestige manda upgrades (preço sempre recalculado
  // no servidor); o fluxo antigo manda curso/plano/valor fixos, exatamente como antes.
  function corpoPagamentoBase(email, cpf) {
    if (usaHorarios) {
      return {
        curso: cursoAtual(), plano: state.tierEscolhido, valor: precoOriginalAtual(),
        email, cpf,
        tipoMatricula: state.tipo,
        slotsEscolhidos: state.slotsSelecionados.map(s => ({ slotId: s._id, diaSemana: s.diaSemana, horaInicio: s.horaInicio })),
        dadosPessoais: dadosPessoaisAtuais()
      };
    }
    if (usaPackPrestige) {
      return {
        curso: planoInfo.curso, plano: "Pack Prestige", valor: precoOriginalAtual(),
        email, cpf,
        upgrades: state.upgrades,
        dadosPessoais: dadosPessoaisAtuais()
      };
    }
    return { curso: planoInfo.curso, plano: planoInfo.plano, valor: planoInfo.valor, email, cpf, turmaId: state.turma?._id };
  }

  // ---------- STEP: PAGAMENTO — resumo do que está sendo comprado ----------
  function renderPagamentoResumo() {
    const el = document.getElementById("pagamentoResumo");
    if (!usaPackPrestige) { el.innerHTML = ""; return; }
    let html = linha("Produto adquirido", planoInfo.curso);
    if (state.upgrades.length) {
      state.upgrades.forEach(chave => {
        html += linha(NOMES_PRODUTO_PACK[chave] + " (adicional)", "+" + fmtMoeda(PRECO_UPGRADE[chave]));
      });
    } else {
      html += linha("Adicionais", "Nenhum");
    }
    html += '<div class="resumo-total"><span class="label">Valor final</span><span class="valor">' + fmtMoeda(precoOriginalAtual()) + "</span></div>";
    el.innerHTML = html;
  }

  async function gerarPix() {
    const btn = document.getElementById("btnGerarPix");
    const cpf = document.getElementById("pixCpf").value.replace(/\D/g, "");
    if (cpf.length !== 11) { showTopError("Digite um CPF válido."); return; }
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Gerando…';
    try {
      const email = document.getElementById("email").value.trim();
      const res = await fetch("/api/pagamentos/pix", {
        method: "POST", headers: authHeaders(true), body: JSON.stringify(corpoPagamentoBase(email, cpf))
      });
      const data = await res.json();
      if (!res.ok || !data.qrCodeBase64) throw new Error(data.msg || "Não foi possível gerar o Pix.");
      document.getElementById("pixQrImg").src = "data:image/png;base64," + data.qrCodeBase64;
      document.getElementById("pixCode").value = data.copiaECola || "";
      document.getElementById("pixBox").classList.add("show");
      document.getElementById("pixStatus").innerHTML = '<span class="spinner"></span>Aguardando confirmação do pagamento…';
      iniciarPollingPagamento(data.pedidoId);
    } catch (e) {
      showTopError(e.message);
    } finally {
      btn.disabled = false; btn.textContent = "Gerar Pix";
    }
  }

  document.addEventListener("click", e => {
    if (e.target && e.target.id === "btnCopyPix") {
      const input = document.getElementById("pixCode");
      input.select();
      navigator.clipboard?.writeText(input.value).then(() => {
        e.target.textContent = "Copiado ✓"; e.target.classList.add("copied");
        setTimeout(() => { e.target.textContent = "Copiar"; e.target.classList.remove("copied"); }, 1800);
      });
    }
  });

  function iniciarPollingPagamento(pedidoId) {
    const status = document.getElementById("pixStatus");
    const intervalo = setInterval(async () => {
      try {
        const res = await fetch("/api/pagamentos/status/" + pedidoId, { headers: authHeaders() });
        const data = await res.json();
        if (data.status === "aprovado") {
          clearInterval(intervalo);
          if (status) status.innerHTML = "Pagamento aprovado!";
          showSuccess();
        } else if (data.status === "rejeitado") {
          clearInterval(intervalo);
          if (status) status.innerHTML = '<span style="color:var(--error)">Pagamento não aprovado. Tente outro método.</span>';
        }
      } catch (e) { /* tenta de novo no próximo ciclo */ }
    }, 4000);
  }

  async function pagarCartao() {
    const btn = document.getElementById("btnPagarCartao");
    const status = document.getElementById("cartaoStatus");
    if (!mp) { status.textContent = "Pagamento por cartão ainda não está configurado."; return; }
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Processando…';
    status.textContent = "";
    try {
      const numero = document.getElementById("cartaoNumero").value.replace(/\s/g, "");
      const nome = document.getElementById("cartaoNome").value;
      const [mm, aa] = document.getElementById("cartaoValidade").value.split("/");
      const cvv = document.getElementById("cartaoCvv").value;
      const cpf = document.getElementById("cartaoCpf").value.replace(/\D/g, "");
      const parcelas = document.getElementById("cartaoParcelas").value;

      const bin = numero.slice(0, 6);
      const methods = await mp.getPaymentMethods({ bin });
      const paymentMethodId = methods.results && methods.results[0] ? methods.results[0].id : null;
      if (!paymentMethodId) throw new Error("Bandeira do cartão não reconhecida.");

      const tokenResp = await mp.createCardToken({
        cardNumber: numero, cardholderName: nome,
        cardExpirationMonth: mm, cardExpirationYear: "20" + (aa || ""),
        securityCode: cvv, identificationType: "CPF", identificationNumber: cpf
      });

      const email = document.getElementById("email").value.trim();
      const corpo = corpoPagamentoBase(email, cpf);
      corpo.token = tokenResp.id;
      corpo.paymentMethodId = paymentMethodId;
      corpo.installments = parcelas;
      corpo.tipo = "credito"; // débito/crédito do cartão — não confundir com tipoMatricula

      const res = await fetch("/api/pagamentos/cartao", { method: "POST", headers: authHeaders(true), body: JSON.stringify(corpo) });
      const data = await res.json();
      if (res.ok && data.status === "approved") {
        showSuccess();
      } else {
        status.style.color = "var(--error)";
        status.textContent = data.msg || ("Pagamento não aprovado (" + (data.statusDetail || data.status) + ").");
      }
    } catch (e) {
      status.style.color = "var(--error)";
      status.textContent = "Erro: " + e.message;
    } finally {
      btn.disabled = false; btn.textContent = "Pagar agora";
    }
  }

  async function gerarBoleto() {
    const btn = document.getElementById("btnGerarBoleto");
    const status = document.getElementById("boletoStatus");
    const cpf = document.getElementById("boletoCpf").value.replace(/\D/g, "");
    const cep = document.getElementById("boletoCep").value.trim();
    const rua = document.getElementById("boletoRua").value.trim();
    const numeroEndereco = document.getElementById("boletoNumero").value.trim();
    const bairro = document.getElementById("boletoBairro").value.trim();
    const cidade = document.getElementById("boletoCidade").value.trim();
    const estado = document.getElementById("boletoEstado").value.trim().toUpperCase();
    if (cpf.length !== 11) { showTopError("Digite um CPF válido."); return; }
    if (!cep || !rua || !numeroEndereco || !bairro || !cidade || !estado) {
      showTopError("Preencha o endereço completo — o Mercado Pago exige esses dados para emitir o boleto.");
      return;
    }
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Gerando…';
    try {
      const email = document.getElementById("email").value.trim();
      const nome = document.getElementById("nome").value.trim();
      const corpo = corpoPagamentoBase(email, cpf);
      corpo.nome = nome;
      corpo.cep = cep; corpo.rua = rua; corpo.numero = numeroEndereco; corpo.bairro = bairro; corpo.cidade = cidade; corpo.estado = estado;

      const res = await fetch("/api/pagamentos/boleto", { method: "POST", headers: authHeaders(true), body: JSON.stringify(corpo) });
      const data = await res.json();
      if (!res.ok || !data.boletoUrl) throw new Error(data.msg || "Não foi possível gerar o boleto.");
      status.innerHTML = 'Boleto gerado! <a href="' + data.boletoUrl + '" target="_blank">Clique aqui para visualizar e pagar</a>. Sua matrícula será confirmada automaticamente assim que o pagamento compensar.';
      iniciarPollingPagamento(data.pedidoId);
    } catch (e) {
      showTopError(e.message);
    } finally {
      btn.disabled = false; btn.textContent = "Gerar boleto";
    }
  }

  // ---------- VALIDAÇÃO POR ETAPA ----------
  function validateStep(key) {
    let ok = true;
    if (key === "dados") {
      const nome = document.getElementById("nome").value.trim();
      const email = document.getElementById("email").value.trim();
      const tel = document.getElementById("telefone").value.trim();
      const okNome = nome.length > 3 && nome.indexOf(" ") > -1;
      const okEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      const okTel = tel.length >= 8;
      showFieldError("f-nome", !okNome);
      showFieldError("f-email", !okEmail);
      showFieldError("f-telefone", !okTel);
      ok = okNome && okEmail && okTel;

      if (state.tipo === "particular") {
        const objetivo = document.getElementById("objetivo").value;
        const nivelAtual = document.getElementById("nivelAtual").value;
        const nivelPretendido = document.getElementById("nivelPretendido").value;
        showFieldError("f-objetivo", !objetivo);
        showFieldError("f-nivelAtual", !nivelAtual);
        showFieldError("f-nivelPretendido", !nivelPretendido);
        ok = ok && !!objetivo && !!nivelAtual && !!nivelPretendido;

        if (objetivo === "Preparação para exame de proficiência") {
          const prova = document.getElementById("prova").value;
          showFieldError("f-prova", !prova);
          ok = ok && !!prova;
        }
      }
    }
    if (key === "turma") {
      ok = modoPlano ? (!!state.turma || !turmaDisponivelParaPlano) : !!state.turma;
      showFieldError("f-turma", !ok);
    }
    if (key === "horarios") {
      ok = state.slotsSelecionados.length >= 1 && state.slotsSelecionados.length <= 4 && !!state.tierEscolhido;
      showFieldError("f-grade-horarios", !state.slotsSelecionados.length);
      showFieldError("f-tier", state.slotsSelecionados.length > 0 && !state.tierEscolhido);
    }
    return ok;
  }

  // ---------- NAVEGAÇÃO ----------
  document.getElementById("btnNext").addEventListener("click", () => {
    const key = steps[currentIndex];
    if (!validateStep(key)) return;
    if (currentIndex < steps.length - 1) showStep(currentIndex + 1);
  });

  document.getElementById("btnBack").addEventListener("click", () => {
    if (currentIndex > 0) showStep(currentIndex - 1);
  });

  (async () => {
    const dados = await window.AuthGate.ensure();
    tk = dados.token;
    showStep(0);
  })();
})();
