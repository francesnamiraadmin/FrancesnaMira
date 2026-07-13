(function () {
  const tk = localStorage.getItem("token");
  if (!tk) {
    window.location.href = "login.html?redirect=matricula.html";
    return;
  }

  function authHeaders(json) {
    const h = { Authorization: "Bearer " + tk };
    if (json) h["Content-Type"] = "application/json";
    return h;
  }
  function fmtMoeda(v) {
    return (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }
  function fmtData(d) {
    return new Date(d).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
  }
  function fmtHora(d) {
    return new Date(d).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }

  // ---------- MODO PLANO (vindo das páginas de pagamento-*.html) ----------
  const urlParams = new URLSearchParams(window.location.search);
  const modoPlano = urlParams.has("plano");
  const planoInfo = modoPlano ? {
    curso: urlParams.get("curso") || "",
    plano: urlParams.get("plano") || "",
    valor: Number(urlParams.get("valor")) || 0
  } : null;
  let turmaDisponivelParaPlano = true;

  // ---------- DADOS FIXOS ----------
  const PACOTES = [
    { nome: "Aula avulsa — 1h", horas: 1, periodicidade: "avulsa", preco: 100, sub: "Uma aula, sem compromisso mensal" },
    { nome: "Mensalidade 1h/semana (4 aulas)", horas: 4, periodicidade: "semanal", preco: 340, sub: "Ritmo leve e constante" },
    { nome: "Mensalidade 1,5h/semana (4 aulas)", horas: 4, periodicidade: "semanal", preco: 530, sub: "Um pouco mais de imersão por semana" },
    { nome: "Mensalidade 2h/semana (8 aulas)", horas: 8, periodicidade: "semanal", preco: 600, sub: "O pacote mais popular" },
    { nome: "Mensalidade 3h/semana (12 aulas)", horas: 12, periodicidade: "semanal", preco: 935, sub: "Para quem quer acelerar o aprendizado" }
  ];

  const STEP_LABELS = {
    tipo: "Você procura", dados: "Seus dados", turma: "Turma",
    pacote: "Pacote", horarios: "Horários", resumo: "Resumo", pagamento: "Pagamento"
  };

  // ---------- ESTADO ----------
  const state = {
    tipo: null,
    turma: null,
    pacote: null,
    professorId: null,
    horariosSelecionados: [],
    cupom: null,
    matricula: null,
    pagamento: null
  };

  let steps = ["tipo"];
  let currentIndex = 0;
  let sse = null;

  function stepsForTipo(tipo) {
    if (tipo === "turma") return ["tipo", "dados", "turma", "resumo", "pagamento"];
    if (tipo === "particular") return ["tipo", "dados", "pacote", "horarios", "resumo", "pagamento"];
    return ["tipo"];
  }

  if (modoPlano) {
    state.tipo = "turma";
    steps = planoInfo.plano === "Essentiel" ? ["dados", "resumo", "pagamento"] : ["dados", "turma", "resumo", "pagamento"];
    document.querySelector(".eyebrow").textContent = "Assinatura";
    document.querySelector("h1.brand").innerHTML = "Plano " + planoInfo.plano + '<span class="dot"></span>';
    document.querySelector("header.top .sub").textContent =
      "Falta pouco para ativar seu plano " + planoInfo.plano + (planoInfo.curso ? " em " + planoInfo.curso : "") + ". Confirme seus dados e escolha a forma de pagamento.";
    document.getElementById("campoCupom").style.display = "none";
    document.getElementById("camposParticular").style.display = "none";
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
  function showTopOk(msg) {
    const el = document.getElementById("topOk");
    el.textContent = msg;
    el.style.display = "block";
  }

  function showStep(index) {
    currentIndex = index;
    const key = steps[index];
    document.querySelectorAll(".step").forEach(s => (s.style.display = "none"));
    document.querySelector('.step[data-step="' + key + '"]').style.display = "block";
    document.getElementById("btnBack").style.visibility = index === 0 ? "hidden" : "visible";
    document.getElementById("btnNext").style.display = key === "pagamento" ? "none" : "inline-block";
    document.getElementById("btnNext").innerHTML = 'Continuar <span class="arrow">→</span>';
    renderMira();
    hideTopError();
    hideTopOk();
    window.scrollTo({ top: 0, behavior: "smooth" });

    if (key === "dados") prefillDados();
    if (key === "turma") carregarTurmas();
    if (key === "pacote") renderPacotes();
    if (key === "horarios") entrarEmHorarios();
    if (key === "resumo") renderResumo();
    if (key !== "horarios" && sse) { sse.close(); sse = null; }
  }

  function showSuccess(msg) {
    document.querySelectorAll(".step").forEach(s => (s.style.display = "none"));
    document.querySelector('.step[data-step="success"]').style.display = "block";
    document.getElementById("actions").style.display = "none";
    document.getElementById("miraTrack").style.display = "none";
    if (!msg && modoPlano) msg = "Seu plano " + planoInfo.plano + " foi ativado. Em instantes você recebe um e-mail de confirmação. À bientôt!";
    if (msg) document.getElementById("successMsg").textContent = msg;
    if (modoPlano) {
      const link = document.getElementById("successLink");
      link.href = "minha-conta.html";
      link.textContent = "Ver minha conta";
    }
    if (sse) { sse.close(); sse = null; }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showFieldError(fieldId, show) {
    const el = document.getElementById(fieldId);
    if (el) el.classList.toggle("invalid", !!show);
  }

  // ---------- STEP: TIPO ----------
  document.querySelectorAll('input[name=tipo]').forEach(r => {
    r.addEventListener("change", () => {
      document.querySelectorAll("#tipoGrid .option").forEach(o => o.classList.remove("selected"));
      r.closest(".option").classList.add("selected");
      state.tipo = r.value;
      steps = stepsForTipo(state.tipo);
      document.getElementById("camposParticular").style.display = state.tipo === "particular" ? "block" : "none";
      renderMira();
    });
  });

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

  // ---------- STEP: TURMA ----------
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

  // ---------- STEP: PACOTE ----------
  function renderPacotes() {
    const grid = document.getElementById("pacoteGrid");
    grid.innerHTML = "";
    PACOTES.forEach((p, idx) => {
      const id = "pacote-" + idx;
      const card = document.createElement("label");
      card.className = "option pacote";
      card.setAttribute("for", id);
      card.innerHTML =
        '<input type="radio" name="pacote" id="' + id + '" style="display:none;">' +
        '<span class="opt-text" style="width:100%;">' +
          '<span class="pacote-head"><span class="pacote-name">' + p.nome + '</span><span class="pacote-price">' + fmtMoeda(p.preco) + '</span></span>' +
          '<span class="pacote-sub">' + p.sub + '</span>' +
        '</span>';
      grid.appendChild(card);
      if (state.pacote && state.pacote.nome === p.nome) { card.classList.add("selected"); card.querySelector("input").checked = true; }
      card.querySelector("input").addEventListener("change", () => {
        grid.querySelectorAll(".option").forEach(o => o.classList.remove("selected"));
        card.classList.add("selected");
        state.pacote = p;
        state.horariosSelecionados = [];
      });
    });
  }

  // ---------- STEP: HORÁRIOS ----------
  async function entrarEmHorarios() {
    if (!state.pacote) { showStep(steps.indexOf("pacote")); return; }
    document.getElementById("horariosHint").textContent =
      "Escolha " + state.pacote.horas + " horário(s) com o professor. A disponibilidade é atualizada em tempo real.";

    const sel = document.getElementById("professorSelect");
    if (!sel.dataset.loaded) {
      try {
        const res = await fetch("/api/disponibilidade/professores", { headers: authHeaders() });
        const profs = await res.json();
        sel.innerHTML = profs.map(p => '<option value="' + p._id + '">' + p.nome + "</option>").join("");
        sel.dataset.loaded = "1";
        state.professorId = sel.value || null;
      } catch (e) { /* silencioso */ }
    }
    sel.onchange = () => { liberarSelecionados(); state.professorId = sel.value; carregarHorarios(); };

    await carregarHorarios();

    if (!sse) {
      sse = new EventSource("/api/disponibilidade/stream");
      sse.addEventListener("disponibilidade-atualizada", () => carregarHorarios());
    }
  }

  async function liberarSelecionados() {
    const ids = state.horariosSelecionados.map(s => s._id);
    state.horariosSelecionados = [];
    for (const id of ids) {
      fetch("/api/disponibilidade/" + id + "/liberar-hold", { method: "POST", headers: authHeaders() }).catch(() => {});
    }
  }

  async function carregarHorarios() {
    const container = document.getElementById("horariosContainer");
    if (!state.professorId) { container.innerHTML = ""; return; }
    container.innerHTML = '<p class="help">Carregando horários…</p>';
    try {
      const res = await fetch("/api/disponibilidade?professorId=" + state.professorId, { headers: authHeaders() });
      const slots = await res.json();
      const selecionadosIds = state.horariosSelecionados.map(s => s._id);
      const porDia = {};
      slots.forEach(s => {
        const dia = fmtData(s.dataHoraInicio);
        (porDia[dia] = porDia[dia] || []).push(s);
      });
      // garante que horários já selecionados (agora com status reservado por mim) continuem visíveis
      state.horariosSelecionados.forEach(s => {
        const dia = fmtData(s.dataHoraInicio);
        porDia[dia] = porDia[dia] || [];
        if (!porDia[dia].find(x => x._id === s._id)) porDia[dia].push(s);
      });

      if (!Object.keys(porDia).length) {
        container.innerHTML = '<div class="empty-state"><div class="icon">🗓️</div>Este professor não tem horários disponíveis no momento.</div>';
        return;
      }

      container.innerHTML = "";
      Object.keys(porDia).sort((a, b) => new Date(porDia[a][0].dataHoraInicio) - new Date(porDia[b][0].dataHoraInicio)).forEach(dia => {
        const heading = document.createElement("div");
        heading.className = "slot-day-heading";
        heading.textContent = dia;
        container.appendChild(heading);

        const grid = document.createElement("div");
        grid.className = "slot-grid";
        porDia[dia].sort((a, b) => new Date(a.dataHoraInicio) - new Date(b.dataHoraInicio)).forEach(s => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "slot-btn" + (selecionadosIds.includes(s._id) ? " selected" : "");
          btn.textContent = fmtHora(s.dataHoraInicio);
          btn.addEventListener("click", () => toggleHorario(s));
          grid.appendChild(btn);
        });
        container.appendChild(grid);
      });
    } catch (e) {
      container.innerHTML = '<p class="field-error" style="display:block;">Não foi possível carregar os horários.</p>';
    }
  }

  async function toggleHorario(slot) {
    const jaSelecionado = state.horariosSelecionados.find(s => s._id === slot._id);
    if (jaSelecionado) {
      state.horariosSelecionados = state.horariosSelecionados.filter(s => s._id !== slot._id);
      fetch("/api/disponibilidade/" + slot._id + "/liberar-hold", { method: "POST", headers: authHeaders() }).catch(() => {});
      carregarHorarios();
      return;
    }
    if (state.horariosSelecionados.length >= state.pacote.horas) {
      showTopError("Seu pacote inclui " + state.pacote.horas + " horário(s). Desmarque um horário antes de escolher outro.");
      return;
    }
    try {
      const res = await fetch("/api/disponibilidade/reservar-temp", {
        method: "POST", headers: authHeaders(true), body: JSON.stringify({ ids: [slot._id] })
      });
      const data = await res.json();
      if (!res.ok) { showTopError(data.msg || "Não foi possível reservar este horário."); carregarHorarios(); return; }
      hideTopError();
      state.horariosSelecionados.push(slot);
      carregarHorarios();
    } catch (e) {
      showTopError("Erro de conexão ao reservar o horário.");
    }
  }

  // ---------- STEP: RESUMO ----------
  function precoOriginalAtual() {
    if (modoPlano) return planoInfo.valor;
    return state.tipo === "turma" ? (state.turma?.preco || 0) : (state.pacote?.preco || 0);
  }

  function renderResumo() {
    const el = document.getElementById("resumoConteudo");
    let html = "";
    if (modoPlano) {
      html += linha("Plano", planoInfo.plano + (planoInfo.curso ? " — " + planoInfo.curso : ""));
      if (state.turma) {
        html += linha("Turma", state.turma.nome);
        html += linha("Dias e horário", (state.turma.dias || []).join(", ") + " às " + state.turma.horario);
      } else if (!turmaDisponivelParaPlano) {
        html += linha("Aulas ao vivo", "Turma a definir — combinaremos por e-mail");
      }
      html += linha("Valor mensal", fmtMoeda(planoInfo.valor));
    } else if (state.tipo === "turma" && state.turma) {
      html += linha("Turma", state.turma.nome + " — " + state.turma.nivel);
      html += linha("Dias e horário", (state.turma.dias || []).join(", ") + " às " + state.turma.horario);
      html += linha("Valor da turma", fmtMoeda(state.turma.preco));
    } else if (state.tipo === "particular") {
      html += linha("Pacote", state.pacote?.nome || "");
      const nomesHorarios = state.horariosSelecionados
        .slice().sort((a, b) => new Date(a.dataHoraInicio) - new Date(b.dataHoraInicio))
        .map(s => fmtData(s.dataHoraInicio) + " às " + fmtHora(s.dataHoraInicio)).join("<br>");
      html += linha("Horários escolhidos", nomesHorarios || "—");
      html += linha("Valor do pacote", fmtMoeda(state.pacote?.preco));
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

  // ---------- CRIAR MATRÍCULA (ao sair do resumo) ----------
  async function criarMatricula() {
    const dadosPessoais = {
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

    const body = { tipo: state.tipo, dadosPessoais, cupomCodigo: state.cupom ? state.cupom.codigo : undefined };
    if (state.tipo === "turma") {
      body.turmaId = state.turma._id;
    } else {
      body.professorId = state.professorId;
      body.horarioIds = state.horariosSelecionados.map(s => s._id);
      body.pacote = { nome: state.pacote.nome, horas: state.pacote.horas, periodicidade: state.pacote.periodicidade, preco: state.pacote.preco };
    }

    const res = await fetch("/api/matricula/iniciar", { method: "POST", headers: authHeaders(true), body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.msg || "Não foi possível iniciar a matrícula.");
    state.matricula = data.matricula;
    return data.matricula;
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

  async function garantirMatricula() {
    if (state.matricula && state.matricula.status === "pendente_pagamento") return state.matricula;
    return criarMatricula();
  }

  async function gerarPix() {
    const btn = document.getElementById("btnGerarPix");
    const cpf = document.getElementById("pixCpf").value.replace(/\D/g, "");
    if (cpf.length !== 11) { showTopError("Digite um CPF válido."); return; }
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Gerando…';
    try {
      let res, data, pollId;
      if (modoPlano) {
        const email = document.getElementById("email").value.trim();
        res = await fetch("/api/pagamentos/pix", {
          method: "POST", headers: authHeaders(true),
          body: JSON.stringify({ curso: planoInfo.curso, plano: planoInfo.plano, valor: planoInfo.valor, email, cpf, turmaId: state.turma?._id })
        });
        data = await res.json();
        pollId = data.pedidoId;
      } else {
        const matricula = await garantirMatricula();
        res = await fetch("/api/pagamento-matricula/pix", {
          method: "POST", headers: authHeaders(true), body: JSON.stringify({ matriculaId: matricula._id, cpf })
        });
        data = await res.json();
        pollId = data.pagamentoId;
      }
      if (!res.ok || !data.qrCodeBase64) throw new Error(data.msg || "Não foi possível gerar o Pix.");
      document.getElementById("pixQrImg").src = "data:image/png;base64," + data.qrCodeBase64;
      document.getElementById("pixCode").value = data.copiaECola || "";
      document.getElementById("pixBox").classList.add("show");
      document.getElementById("pixStatus").innerHTML = '<span class="spinner"></span>Aguardando confirmação do pagamento…';
      iniciarPollingPagamento(pollId);
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

  function iniciarPollingPagamento(pagamentoId) {
    const status = document.getElementById("pixStatus");
    const statusUrl = modoPlano ? "/api/pagamentos/status/" + pagamentoId : "/api/pagamento-matricula/" + pagamentoId + "/status";
    const intervalo = setInterval(async () => {
      try {
        const res = await fetch(statusUrl, { headers: authHeaders() });
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

      let res;
      if (modoPlano) {
        const email = document.getElementById("email").value.trim();
        res = await fetch("/api/pagamentos/cartao", {
          method: "POST", headers: authHeaders(true),
          body: JSON.stringify({
            token: tokenResp.id, paymentMethodId, installments: parcelas,
            curso: planoInfo.curso, plano: planoInfo.plano, valor: planoInfo.valor,
            email, cpf, tipo: "credito", turmaId: state.turma?._id
          })
        });
      } else {
        const matricula = await garantirMatricula();
        res = await fetch("/api/pagamento-matricula/cartao", {
          method: "POST", headers: authHeaders(true),
          body: JSON.stringify({
            matriculaId: matricula._id, token: tokenResp.id, paymentMethodId,
            installments: parcelas, cpf, tipo: "credito"
          })
        });
      }
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
      let res, data, pollId;
      const endereco = { cep, rua, numero: numeroEndereco, bairro, cidade, estado };
      if (modoPlano) {
        const email = document.getElementById("email").value.trim();
        const nome = document.getElementById("nome").value.trim();
        res = await fetch("/api/pagamentos/boleto", {
          method: "POST", headers: authHeaders(true),
          body: JSON.stringify({ curso: planoInfo.curso, plano: planoInfo.plano, valor: planoInfo.valor, email, cpf, nome, turmaId: state.turma?._id, ...endereco })
        });
        data = await res.json();
        pollId = data.pedidoId;
      } else {
        const matricula = await garantirMatricula();
        res = await fetch("/api/pagamento-matricula/boleto", {
          method: "POST", headers: authHeaders(true), body: JSON.stringify({ matriculaId: matricula._id, cpf, ...endereco })
        });
        data = await res.json();
        pollId = data.pagamentoId;
      }
      if (!res.ok || !data.boletoUrl) throw new Error(data.msg || "Não foi possível gerar o boleto.");
      status.innerHTML = 'Boleto gerado! <a href="' + data.boletoUrl + '" target="_blank">Clique aqui para visualizar e pagar</a>. Sua matrícula será confirmada automaticamente assim que o pagamento compensar.';
      iniciarPollingPagamento(pollId);
    } catch (e) {
      showTopError(e.message);
    } finally {
      btn.disabled = false; btn.textContent = "Gerar boleto";
    }
  }

  // ---------- VALIDAÇÃO POR ETAPA ----------
  function validateStep(key) {
    let ok = true;
    if (key === "tipo") {
      ok = !!state.tipo;
      showFieldError("f-tipo", !ok);
    }
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
    if (key === "pacote") {
      ok = !!state.pacote;
      showFieldError("f-pacote", !ok);
    }
    if (key === "horarios") {
      ok = state.pacote && state.horariosSelecionados.length === state.pacote.horas;
      showFieldError("f-horarios", !ok);
      if (!ok) showTopError("Selecione exatamente " + (state.pacote?.horas || 0) + " horário(s) para continuar.");
    }
    return ok;
  }

  // ---------- NAVEGAÇÃO ----------
  document.getElementById("btnNext").addEventListener("click", async () => {
    const key = steps[currentIndex];
    if (!validateStep(key)) return;

    if (key === "resumo" && !modoPlano) {
      const btn = document.getElementById("btnNext");
      btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Preparando pagamento…';
      try {
        await criarMatricula();
        showStep(currentIndex + 1);
      } catch (e) {
        showTopError(e.message);
      } finally {
        btn.disabled = false; btn.innerHTML = 'Continuar <span class="arrow">→</span>';
      }
      return;
    }

    if (currentIndex < steps.length - 1) showStep(currentIndex + 1);
  });

  document.getElementById("btnBack").addEventListener("click", () => {
    if (currentIndex > 0) showStep(currentIndex - 1);
  });

  window.addEventListener("beforeunload", () => { if (sse) sse.close(); });

  showStep(0);
})();
