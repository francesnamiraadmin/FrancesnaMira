(function () {
  const tk = localStorage.getItem("token");
  if (!tk) {
    window.location.href = "login.html?redirect=matricula-turmas.html";
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
    return d ? new Date(d).toLocaleDateString("pt-BR") : "—";
  }
  function mesesEntre(inicio, fim) {
    const ms = new Date(fim) - new Date(inicio);
    if (!(ms > 0)) return 1;
    return Math.max(1, Math.round(ms / (1000 * 60 * 60 * 24 * 30.44)));
  }

  const urlParams = new URLSearchParams(window.location.search);
  const tierPreSelecionado = ["Essentiel", "Avancé", "Excellence"].includes(urlParams.get("plano")) ? urlParams.get("plano") : null;

  const TIERS = ["Essentiel", "Avancé", "Excellence"];
  const BENEFICIOS_TIER = {
    Essentiel: { turma: true, plataforma: false, producao: false, gravadas: false },
    "Avancé": { turma: true, plataforma: true, producao: true, gravadas: false },
    Excellence: { turma: true, plataforma: true, producao: true, gravadas: true }
  };
  const NOMES_BENEFICIO = [
    { key: "turma", label: "Aula em turma" },
    { key: "plataforma", label: "Plataforma de questões" },
    { key: "producao", label: "Ambiente de produção" },
    { key: "gravadas", label: "Aulas Especializadas gravadas" }
  ];

  function precoPorTier(base, tier) {
    if (tier === "Essentiel") return base;
    const avance = base + 90;
    if (tier === "Avancé") return avance;
    return avance + 100; // Excellence
  }

  const STEP_LABELS = { dados: "Seus dados", turmas: "Turma e plano", resumo: "Resumo", pagamento: "Pagamento" };
  const steps = ["dados", "turmas", "resumo", "pagamento"];
  let currentIndex = 0;

  const state = {
    turmas: [],
    turmaEscolhida: null,
    tierEscolhido: tierPreSelecionado,
    cupom: null
  };

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

  function showFieldError(fieldId, show) {
    const el = document.getElementById(fieldId);
    if (el) el.classList.toggle("invalid", !!show);
  }

  function showStep(index) {
    currentIndex = index;
    const key = steps[index];
    document.querySelectorAll(".step").forEach(s => (s.style.display = "none"));
    document.querySelector('.step[data-step="' + key + '"]').style.display = "block";
    document.getElementById("btnBack").style.visibility = index === 0 ? "hidden" : "visible";
    document.getElementById("btnNext").style.display = key === "pagamento" ? "none" : "inline-block";
    document.getElementById("btnNext").innerHTML = 'Continuar <span class="arrow">→</span>';
    document.getElementById("btnNext").disabled = false;
    renderMira();
    hideTopError();
    hideTopOk();
    window.scrollTo({ top: 0, behavior: "smooth" });

    if (key === "dados") prefillDados();
    if (key === "turmas") entrarEmTurmas();
    if (key === "resumo") renderResumo();
    if (key === "pagamento") renderPagamentoResumo();
  }

  function showSuccess(msg) {
    document.querySelectorAll(".step").forEach(s => (s.style.display = "none"));
    document.querySelector('.step[data-step="success"]').style.display = "block";
    document.getElementById("actions").style.display = "none";
    document.getElementById("miraTrack").style.display = "none";
    if (msg) document.getElementById("successMsg").textContent = msg;
    window.scrollTo({ top: 0, behavior: "smooth" });
    setTimeout(() => { window.location.href = "minha-conta.html"; }, 1800);
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

  function dadosPessoaisAtuais() {
    return {
      nome: document.getElementById("nome").value.trim(),
      email: document.getElementById("email").value.trim(),
      telefone: document.getElementById("telefone").value.trim()
    };
  }

  // ---------- STEP: TURMA + PLANO ----------
  async function entrarEmTurmas() {
    document.getElementById("btnNext").disabled = true;
    const lista = document.getElementById("turmaLista");
    lista.innerHTML = '<p class="help">Carregando turmas…</p>';
    try {
      const res = await fetch("/api/turmas", { headers: authHeaders() });
      const turmas = res.ok ? await res.json() : [];
      state.turmas = turmas;
      renderTurmaLista();
    } catch (e) {
      lista.innerHTML = '<p class="field-error" style="display:block;">Não foi possível carregar as turmas.</p>';
    }
    renderTierGrid();
    renderResumoFlutuante();
    atualizarBotaoContinuarTurmas();
  }

  function renderTurmaLista() {
    const lista = document.getElementById("turmaLista");
    if (!state.turmas.length) {
      lista.innerHTML = '<div class="empty-state"><div class="icon">🎯</div>Nenhuma turma com vagas abertas no momento. Volte em breve ou fale com a gente para saber sobre as próximas turmas.</div>';
      return;
    }
    lista.innerHTML = state.turmas.map(t => {
      const meses = mesesEntre(t.dataInicio, t.dataFim);
      const mensal = state.tierEscolhido ? precoPorTier(t.preco, state.tierEscolhido) : t.preco;
      const total = mensal * meses;
      const selecionada = state.turmaEscolhida?._id === t._id;
      return (
        '<label class="turma-card' + (selecionada ? " selecionada" : "") + (t.lotada ? " lotada" : "") + '" data-turma-id="' + t._id + '">' +
          '<input type="radio" name="turma" value="' + t._id + '" style="display:none;" ' + (t.lotada ? "disabled" : "") + (selecionada ? "checked" : "") + '>' +
          '<div class="turma-head"><span class="turma-nome">' + t.nome + " — " + t.nivel + '</span>' +
          (t.tipoProva ? '<span class="turma-prova">' + t.tipoProva + '</span>' : "") + '</div>' +
          '<div class="turma-info-grid">' +
            '<div class="turma-info-item"><span class="rotulo">Valor por mês</span><span class="val">' + fmtMoeda(mensal) + '</span></div>' +
            '<div class="turma-info-item"><span class="rotulo">Valor total (' + meses + (meses === 1 ? " mês" : " meses") + ')</span><span class="val">' + fmtMoeda(total) + '</span></div>' +
            '<div class="turma-info-item"><span class="rotulo">Dias e horário</span><span class="val">' + (t.dias || []).join(", ") + " às " + t.horario + '</span></div>' +
            '<div class="turma-info-item"><span class="rotulo">Início</span><span class="val">' + fmtData(t.dataInicio) + '</span></div>' +
            '<div class="turma-info-item"><span class="rotulo">Término</span><span class="val">' + fmtData(t.dataFim) + '</span></div>' +
          '</div>' +
          '<span class="vagas-tag' + (t.vagasRestantes <= 2 && !t.lotada ? " pouca" : "") + '">' + (t.lotada ? "Turma lotada" : t.vagasRestantes + " vaga(s) disponível(is)") + '</span>' +
        '</label>'
      );
    }).join("");

    lista.querySelectorAll(".turma-card").forEach(card => {
      const input = card.querySelector("input");
      input.addEventListener("change", () => {
        if (input.disabled) return;
        state.turmaEscolhida = state.turmas.find(t => t._id === card.dataset.turmaId) || null;
        hideTopError();
        renderTurmaLista();
        renderTierGrid();
        renderResumoFlutuante();
        atualizarBotaoContinuarTurmas();
      });
    });
  }

  function renderTierGrid() {
    const wrap = document.getElementById("tierGrid");
    const base = state.turmaEscolhida ? state.turmaEscolhida.preco : null;
    wrap.innerHTML = TIERS.map(tier => {
      const preco = base !== null ? precoPorTier(base, tier) : null;
      const beneficios = BENEFICIOS_TIER[tier];
      const selecionado = state.tierEscolhido === tier;
      return (
        '<label class="tier-card' + (selecionado ? " selecionado" : "") + '" data-tier="' + tier + '">' +
          '<input type="radio" name="tierEscolhido" value="' + tier + '" style="display:none;" ' + (selecionado ? "checked" : "") + '>' +
          "<h3>" + tier + "</h3>" +
          '<p class="tier-preco">' + (preco !== null ? fmtMoeda(preco) + "<span>/mês</span>" : "Escolha uma turma") + "</p>" +
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
    if (!state.turmaEscolhida) { showTopError("Escolha uma turma antes de selecionar o plano."); return; }
    state.tierEscolhido = card.dataset.tier;
    hideTopError();
    renderTierGrid();
    renderTurmaLista();
    renderResumoFlutuante();
    atualizarBotaoContinuarTurmas();
  });

  function valorMensalAtual() {
    if (!state.turmaEscolhida || !state.tierEscolhido) return null;
    return precoPorTier(state.turmaEscolhida.preco, state.tierEscolhido);
  }
  function valorTotalAtual() {
    const mensal = valorMensalAtual();
    if (mensal === null || !state.turmaEscolhida) return null;
    return mensal * mesesEntre(state.turmaEscolhida.dataInicio, state.turmaEscolhida.dataFim);
  }

  function linha(label, valor) {
    return '<div class="resumo-linha"><span class="label">' + label + '</span><span class="valor">' + valor + "</span></div>";
  }

  function renderResumoFlutuante() {
    const el = document.getElementById("resumoFlutuante");
    const t = state.turmaEscolhida;
    const mensal = valorMensalAtual();
    el.innerHTML =
      "<h3>Seu resumo</h3>" +
      linha("Turma", t ? t.nome + " — " + t.nivel : "Nenhuma ainda") +
      (t ? linha("Dias e horário", (t.dias || []).join(", ") + " às " + t.horario) : "") +
      (state.tierEscolhido ? linha("Plano", state.tierEscolhido) : "") +
      '<div class="resumo-total"><span class="label">Mensal</span><span class="valor">' + (mensal !== null ? fmtMoeda(mensal) : "—") + "</span></div>";
  }

  function atualizarBotaoContinuarTurmas() {
    document.getElementById("btnNext").disabled = !(state.turmaEscolhida && state.tierEscolhido);
  }

  // ---------- STEP: RESUMO ----------
  function renderResumo() {
    const el = document.getElementById("resumoConteudo");
    const t = state.turmaEscolhida;
    const meses = t ? mesesEntre(t.dataInicio, t.dataFim) : 0;
    let html = "";
    html += linha("Turma", t ? t.nome + " — " + t.nivel : "—");
    if (t?.tipoProva) html += linha("Tipo de prova", t.tipoProva);
    html += linha("Plano", state.tierEscolhido);
    html += linha("Dias e horário", t ? (t.dias || []).join(", ") + " às " + t.horario : "—");
    html += linha("Data de início", t ? fmtData(t.dataInicio) : "—");
    html += linha("Data de término", t ? fmtData(t.dataFim) : "—");
    html += linha("Valor mensal", fmtMoeda(valorMensalAtual()));
    html += linha("Valor total (" + meses + (meses === 1 ? " mês" : " meses") + ")", fmtMoeda(valorTotalAtual()));
    const d = dadosPessoaisAtuais();
    html += linha("Nome", d.nome || "—");
    html += linha("E-mail", d.email || "—");
    html += linha("Telefone", d.telefone || "—");
    el.innerHTML = html;
    document.getElementById("resumoTotalValor").textContent = fmtMoeda(valorMensalAtual());
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

  function corpoPagamentoBase(email, cpf) {
    return {
      curso: state.turmaEscolhida?.nivel, plano: state.tierEscolhido, valor: valorMensalAtual(),
      email, cpf, turmaId: state.turmaEscolhida?._id
    };
  }

  function renderPagamentoResumo() {
    const el = document.getElementById("pagamentoResumo");
    const t = state.turmaEscolhida;
    let html = linha("Turma", t ? t.nome + " — " + t.nivel : "—");
    html += linha("Plano", state.tierEscolhido);
    html += '<div class="resumo-total"><span class="label">Valor mensal</span><span class="valor">' + fmtMoeda(valorMensalAtual()) + "</span></div>";
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
      corpo.tipo = "credito";

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
    }
    if (key === "turmas") {
      ok = !!state.turmaEscolhida && !!state.tierEscolhido;
      showFieldError("f-turma", !state.turmaEscolhida);
      showFieldError("f-tier", !!state.turmaEscolhida && !state.tierEscolhido);
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

  showStep(0);
})();
