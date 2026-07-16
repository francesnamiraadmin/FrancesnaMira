// ===================== AuthGate — login/cadastro sem sair da matrícula =====================
// window.AuthGate.ensure() devolve uma Promise que resolve com {token, nome, role}
// assim que existir uma sessão válida: imediatamente se já houver uma (ou se um
// refresh token conseguir renová-la), ou depois que o usuário entrar/criar conta
// num modal exibido por cima da própria página — nunca com redirecionamento.
(function () {
  let overlayEl = null;
  let resolverPendente = null;

  function montarMarkup() {
    const overlay = document.createElement("div");
    overlay.className = "ag-overlay";
    overlay.id = "agOverlay";
    overlay.innerHTML = `
      <div class="ag-card">
        <a class="ag-back" href="index.html">‹ Voltar para o site</a>
        <p class="ag-eyebrow">Falta pouco</p>
        <h2 class="ag-title">Entre ou crie sua conta para continuar</h2>

        <div class="ag-tabs">
          <button type="button" class="ag-tab active" data-tab="entrar">Entrar</button>
          <button type="button" class="ag-tab" data-tab="criar">Criar conta</button>
        </div>

        <div class="ag-panel" data-panel="entrar">
          <form id="agLoginForm" novalidate>
            <div class="ag-field"><label for="agEmailLogin">Email</label><input type="email" id="agEmailLogin" autocomplete="email" required></div>
            <div class="ag-field"><label for="agSenhaLogin">Senha</label><input type="password" id="agSenhaLogin" autocomplete="current-password" required></div>
            <label class="ag-checkbox"><input type="checkbox" id="agManterConectado"><span>Manter-me conectado</span></label>
            <button type="submit" class="ag-btn">Entrar</button>
            <p class="ag-msg" id="agMsgLogin"></p>
            <button type="button" class="ag-link-btn" id="agEsqueciBtn">Esqueci minha senha</button>
          </form>

          <form id="agEsqueciForm" novalidate style="display:none;">
            <p class="ag-esqueci-texto">Informe seu e-mail cadastrado e enviaremos um link para redefinir sua senha.</p>
            <div class="ag-field"><label for="agEmailEsqueci">Email</label><input type="email" id="agEmailEsqueci" autocomplete="email" required></div>
            <button type="submit" class="ag-btn">Enviar link</button>
            <p class="ag-msg" id="agMsgEsqueci"></p>
            <button type="button" class="ag-link-btn" id="agVoltarLoginBtn">‹ Voltar para o login</button>
          </form>
        </div>

        <div class="ag-panel" data-panel="criar" style="display:none;">
          <form id="agCadastroForm" novalidate>
            <div class="ag-field"><label for="agNome">Nome completo</label><input type="text" id="agNome" autocomplete="name" required></div>
            <div class="ag-field"><label for="agEmailCadastro">Email</label><input type="email" id="agEmailCadastro" autocomplete="email" required></div>
            <div class="ag-row">
              <div class="ag-field"><label for="agSenhaCadastro">Senha</label><input type="password" id="agSenhaCadastro" autocomplete="new-password" required></div>
              <div class="ag-field"><label for="agConfirmarSenha">Confirmar senha</label><input type="password" id="agConfirmarSenha" autocomplete="new-password" required></div>
            </div>
            <div class="ag-field"><label for="agTelefone">Telefone/WhatsApp</label><input type="tel" id="agTelefone" autocomplete="tel" required></div>
            <button type="submit" class="ag-btn">Criar conta</button>
            <p class="ag-msg" id="agMsgCadastro"></p>
          </form>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("show"));
    return overlay;
  }

  function ligarTabs(overlay) {
    overlay.querySelectorAll(".ag-tab").forEach(btn => {
      btn.addEventListener("click", () => {
        overlay.querySelectorAll(".ag-tab").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        const chave = btn.dataset.tab;
        overlay.querySelectorAll(".ag-panel").forEach(p => {
          p.style.display = p.dataset.panel === chave ? "block" : "none";
        });
      });
    });
  }

  function ligarEsqueciSenha(overlay) {
    const loginForm = overlay.querySelector("#agLoginForm");
    const esqueciForm = overlay.querySelector("#agEsqueciForm");
    overlay.querySelector("#agEsqueciBtn").addEventListener("click", () => {
      loginForm.style.display = "none";
      esqueciForm.style.display = "block";
      overlay.querySelector("#agEmailEsqueci").value = overlay.querySelector("#agEmailLogin").value.trim();
    });
    overlay.querySelector("#agVoltarLoginBtn").addEventListener("click", () => {
      esqueciForm.style.display = "none";
      loginForm.style.display = "block";
    });
    esqueciForm.addEventListener("submit", async e => {
      e.preventDefault();
      const msg = overlay.querySelector("#agMsgEsqueci");
      const email = overlay.querySelector("#agEmailEsqueci").value.trim();
      msg.className = "ag-msg"; msg.textContent = "Enviando...";
      try {
        const res = await fetch("/api/auth/esqueci-senha", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email })
        });
        const data = await res.json();
        msg.className = "ag-msg ok";
        msg.textContent = data.msg || "Se houver uma conta com esse e-mail, enviamos um link de redefinição.";
      } catch (err) {
        msg.className = "ag-msg erro";
        msg.textContent = "Erro ao conectar ao servidor.";
      }
    });
  }

  function ligarLogin(overlay, resolver) {
    overlay.querySelector("#agLoginForm").addEventListener("submit", async e => {
      e.preventDefault();
      const msg = overlay.querySelector("#agMsgLogin");
      const email = overlay.querySelector("#agEmailLogin").value.trim();
      const senha = overlay.querySelector("#agSenhaLogin").value;
      const manterConectado = overlay.querySelector("#agManterConectado").checked;
      msg.className = "ag-msg"; msg.textContent = "Entrando...";
      try {
        const res = await fetch("/api/auth/login", {
          method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
          body: JSON.stringify({ email, senha, manterConectado })
        });
        const data = await res.json();
        if (res.ok && data.token) {
          window.AuthStorage.setToken(data.token);
          localStorage.setItem("nome", data.nome);
          if (data.preferencias?.tema && window.ThemeToggle) window.ThemeToggle.setTema(data.preferencias.tema, { sincronizar: false });
          if (data.preferencias?.idioma && window.I18n) window.I18n.setLocale(data.preferencias.idioma, { sincronizar: false });
          msg.className = "ag-msg ok"; msg.textContent = "Login realizado!";
          fecharEResolver(resolver, data);
        } else {
          msg.className = "ag-msg erro"; msg.textContent = data.msg || "Erro ao entrar.";
        }
      } catch (err) {
        msg.className = "ag-msg erro"; msg.textContent = "Erro ao conectar ao servidor.";
      }
    });
  }

  function ligarCadastro(overlay, resolver) {
    overlay.querySelector("#agCadastroForm").addEventListener("submit", async e => {
      e.preventDefault();
      const msg = overlay.querySelector("#agMsgCadastro");
      const nome = overlay.querySelector("#agNome").value.trim();
      const email = overlay.querySelector("#agEmailCadastro").value.trim();
      const senha = overlay.querySelector("#agSenhaCadastro").value;
      const confirmarSenha = overlay.querySelector("#agConfirmarSenha").value;
      const telefone = overlay.querySelector("#agTelefone").value.trim();

      if (senha !== confirmarSenha) {
        msg.className = "ag-msg erro"; msg.textContent = "As senhas não coincidem.";
        return;
      }
      msg.className = "ag-msg"; msg.textContent = "Criando conta...";
      try {
        const res = await fetch("/api/auth/register", {
          method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
          // Telefone e WhatsApp são a mesma caixa no formulário — manda o mesmo
          // valor para os dois campos que o backend já esperava separados. Nome
          // completo vai só no campo "nome" — o backend usa como está quando
          // não recebe "sobrenome".
          body: JSON.stringify({ nome, email, senha, confirmarSenha, telefone, whatsapp: telefone })
        });
        const data = await res.json();
        if (res.ok && data.token) {
          window.AuthStorage.setToken(data.token);
          localStorage.setItem("nome", data.nome);
          msg.className = "ag-msg ok"; msg.textContent = "Conta criada! Entrando...";
          // Pré-preenche o telefone do passo "dados" da matrícula, se existir,
          // pra não pedir a mesma informação de novo.
          const campoTelefone = document.getElementById("telefone");
          if (campoTelefone && !campoTelefone.value) campoTelefone.value = telefone;
          const campoNome = document.getElementById("nome");
          if (campoNome && !campoNome.value) campoNome.value = data.nome;
          const campoEmail = document.getElementById("email");
          if (campoEmail && !campoEmail.value) campoEmail.value = email;
          fecharEResolver(resolver, data);
        } else {
          msg.className = "ag-msg erro"; msg.textContent = data.msg || "Erro ao criar conta.";
        }
      } catch (err) {
        msg.className = "ag-msg erro"; msg.textContent = "Erro ao conectar ao servidor.";
      }
    });
  }

  function fecharEResolver(resolver, data) {
    setTimeout(() => {
      if (overlayEl) {
        overlayEl.classList.remove("show");
        setTimeout(() => { overlayEl?.remove(); overlayEl = null; }, 250);
      }
      resolver(data);
    }, 500);
  }

  function abrirModal() {
    return new Promise(resolve => {
      resolverPendente = resolve;
      overlayEl = montarMarkup();
      ligarTabs(overlayEl);
      ligarEsqueciSenha(overlayEl);
      ligarLogin(overlayEl, resolve);
      ligarCadastro(overlayEl, resolve);
    });
  }

  // Garante uma sessão válida antes de prosseguir: reaproveita o token atual,
  // tenta renovar via refresh token e, só na falta de ambos, mostra o modal.
  async function ensure() {
    const token = await window.AuthStorage.obterTokenValido();
    if (token) {
      try {
        const res = await fetch("/api/auth/me", { headers: { Authorization: "Bearer " + token } });
        if (res.ok) {
          const dados = await res.json();
          return { token, nome: dados.nome, role: dados.role };
        }
      } catch (err) { /* cai para o modal abaixo */ }
      window.AuthStorage.clearToken();
    }
    return abrirModal();
  }

  window.AuthGate = { ensure };
})();
