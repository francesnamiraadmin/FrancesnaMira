const backendURL = "/api/auth";

// Cadastro
const registerForm = document.getElementById("registerForm");
registerForm?.addEventListener("submit", async e => {
  e.preventDefault();
  const nome = document.getElementById("nome").value.trim();
  const email = document.getElementById("email").value.trim();
  const senha = document.getElementById("senha").value;
  const confirmarSenha = document.getElementById("confirmarSenha").value;
  const msg = document.getElementById("msg");

  if (senha !== confirmarSenha) {
    msg.style.color = "var(--danger-text)";
    msg.textContent = "As senhas não coincidem.";
    return;
  }

  msg.style.color = "var(--text)";
  msg.textContent = "Enviando...";

  try {
    const res = await fetch(`${backendURL}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome, email, senha })
    });
    const data = await res.json();

    if (res.ok) {
      msg.style.color = "var(--accent)";
      msg.textContent = data.msg;

      const resendBtn = document.getElementById("resendBtn");
      if (resendBtn) {
        resendBtn.dataset.email = email;
        resendBtn.style.display = "block";
      }
    } else {
      msg.style.color = "var(--danger-text)";
      msg.textContent = data.msg;
    }
  } catch (err) {
    msg.style.color = "var(--danger-text)";
    msg.textContent = "Erro ao conectar ao servidor.";
  }
});

// Reenviar e-mail de confirmação
async function reenviarConfirmacao(email, msgEl, btnEl) {
  if (!email) {
    msgEl.style.color = "var(--danger-text)";
    msgEl.textContent = "Informe o e-mail cadastrado.";
    return;
  }

  if (btnEl) btnEl.disabled = true;
  msgEl.style.color = "var(--text)";
  msgEl.textContent = "Reenviando...";

  try {
    const res = await fetch(`${backendURL}/reenviar-confirmacao`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });
    const data = await res.json();

    msgEl.style.color = res.ok ? "var(--accent)" : "var(--danger-text)";
    msgEl.textContent = data.msg;
  } catch (err) {
    msgEl.style.color = "var(--danger-text)";
    msgEl.textContent = "Erro ao conectar ao servidor.";
  } finally {
    if (btnEl) btnEl.disabled = false;
  }
}

const resendBtn = document.getElementById("resendBtn");
resendBtn?.addEventListener("click", () => {
  reenviarConfirmacao(resendBtn.dataset.email, document.getElementById("msg"), resendBtn);
});

const toggleResendBox = document.getElementById("toggleResendBox");
toggleResendBox?.addEventListener("click", () => {
  const box = document.getElementById("resendBox");
  box.style.display = box.style.display === "block" ? "none" : "block";
});

const resendBoxBtn = document.getElementById("resendBoxBtn");
resendBoxBtn?.addEventListener("click", () => {
  const email = document.getElementById("resendEmail").value.trim();
  reenviarConfirmacao(email, document.getElementById("resendMsg"), resendBoxBtn);
});

// Login
const loginForm = document.getElementById("loginForm");
loginForm?.addEventListener("submit", async e => {
  e.preventDefault();
  const email = document.getElementById("emailLogin").value.trim();
  const senha = document.getElementById("senhaLogin").value;
  const manterConectado = document.getElementById("manterConectado")?.checked || false;
  const msg = document.getElementById("msgLogin");

  msg.style.color = "var(--text)";
  msg.textContent = "Entrando...";

  try {
    const res = await fetch(`${backendURL}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, senha, manterConectado })
    });
    const data = await res.json();

    if (res.ok && data.token) {
      if (window.AuthStorage) window.AuthStorage.setToken(data.token);
      else localStorage.setItem("token", data.token);
      localStorage.setItem("nome", data.nome);
      msg.style.color = "var(--accent)";
      msg.textContent = `Bem-vindo, ${data.nome}! Redirecionando...`;
      const redirect = new URLSearchParams(window.location.search).get("redirect");
      setTimeout(() => window.location.href = redirect || "index.html", 1000);
    } else {
      msg.style.color = "var(--danger-text)";
      msg.textContent = data.msg || "Erro ao entrar.";
    }
  } catch (err) {
    msg.style.color = "var(--danger-text)";
    msg.textContent = "Erro ao conectar ao servidor.";
  }
});

// Esqueci minha senha (login.html)
document.getElementById("toggleEsqueciBox")?.addEventListener("click", () => {
  const box = document.getElementById("esqueciBox");
  box.style.display = box.style.display === "block" ? "none" : "block";
});
document.getElementById("esqueciBtn")?.addEventListener("click", async () => {
  const email = document.getElementById("esqueciEmail").value.trim();
  const msg = document.getElementById("esqueciMsg");
  const btn = document.getElementById("esqueciBtn");
  if (!email) {
    msg.style.color = "var(--danger-text)";
    msg.textContent = "Informe seu e-mail.";
    return;
  }
  btn.disabled = true;
  msg.style.color = "var(--text)";
  msg.textContent = "Enviando...";
  try {
    const res = await fetch(`${backendURL}/esqueci-senha`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });
    const data = await res.json();
    msg.style.color = "var(--accent)";
    msg.textContent = data.msg;
  } catch (err) {
    msg.style.color = "var(--danger-text)";
    msg.textContent = "Erro ao conectar ao servidor.";
  } finally {
    btn.disabled = false;
  }
});

// Mensagem de confirmação de e-mail (login.html?confirmado=1|erro)
const msgLoginEl = document.getElementById("msgLogin");
if (msgLoginEl) {
  const params = new URLSearchParams(window.location.search);
  if (params.get("confirmado") === "1") {
    msgLoginEl.style.color = "var(--accent)";
    msgLoginEl.textContent = "E-mail confirmado! Agora você já pode entrar.";
  } else if (params.get("confirmado") === "erro") {
    msgLoginEl.style.color = "var(--danger-text)";
    msgLoginEl.textContent = "Link de confirmação inválido ou expirado.";
  }
}

// Atualiza a navbar de acordo com o estado de login e o plano ativo
async function updateNav() {
  const loginLink = document.querySelector("nav a.login");
  const token = localStorage.getItem("token");
  if (!token) return;

  let nome = localStorage.getItem("nome");
  let plano = null;

  try {
    const res = await fetch(`${backendURL}/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      nome = data.nome;
      plano = data.plano;
      localStorage.setItem("nome", nome);
      localStorage.setItem("plano", JSON.stringify(plano || { ativo: false }));
    } else if (res.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("nome");
      localStorage.removeItem("plano");
      return;
    }
  } catch (err) {
    const cached = localStorage.getItem("plano");
    if (cached) plano = JSON.parse(cached);
  }

  if (loginLink && nome) {
    loginLink.textContent = `Olá, ${nome.split(" ")[0]}`;
    loginLink.href = "#";
    loginLink.onclick = e => e.preventDefault();

    let wrapper = loginLink.closest(".login-wrapper");
    if (!wrapper) {
      wrapper = document.createElement("div");
      wrapper.className = "login-wrapper";
      wrapper.style.position = "relative";
      wrapper.style.flex = "0 0 auto";
      loginLink.parentNode.insertBefore(wrapper, loginLink);
      wrapper.appendChild(loginLink);

      const dropdown = document.createElement("div");
      dropdown.className = "dropdown";
      dropdown.innerHTML = `
        <a href="minha-conta.html">Minha conta</a>
        <a href="minhas-inscricoes.html">Minhas inscrições</a>
        <a href="#" id="navSairBtn">Sair</a>
      `;
      wrapper.appendChild(dropdown);

      let timeout;
      wrapper.addEventListener("mouseenter", () => { clearTimeout(timeout); dropdown.classList.add("show"); });
      wrapper.addEventListener("mouseleave", () => { timeout = setTimeout(() => dropdown.classList.remove("show"), 150); });

      dropdown.querySelector("#navSairBtn").addEventListener("click", e => {
        e.preventDefault();
        if (confirm("Deseja sair da sua conta?")) {
          localStorage.removeItem("token");
          localStorage.removeItem("nome");
          localStorage.removeItem("plano");
          window.location.href = "index.html";
        }
      });
    }
  }

  const cadastroLink = document.querySelector('.nav-item a[href="cadastro.html"]');
  if (cadastroLink) {
    const ESTILOS_PLANO = {
      Essentiel: { background: "rgba(205,127,50,0.35)", border: "#cd7f32", color: "#ffffff" },
      "Avancé": { background: "rgba(210,210,210,0.35)", border: "#c0c0c0", color: "#08203e" },
      Excellence: { background: "rgba(255,215,0,0.35)", border: "#ffd700", color: "#08203e" },
      nenhum: { background: "var(--glass-bg)", border: "var(--glass-border-strong)", color: "var(--text)" }
    };

    const ativo = plano && plano.ativo && ESTILOS_PLANO[plano.tier];
    const estilo = ativo ? ESTILOS_PLANO[plano.tier] : ESTILOS_PLANO.nenhum;

    cadastroLink.textContent = ativo ? `Plano: ${plano.tier}` : "Nenhum plano";
    cadastroLink.href = "minha-conta.html";
    cadastroLink.style.background = estilo.background;
    cadastroLink.style.border = `1.5px solid ${estilo.border}`;
    cadastroLink.style.color = estilo.color;
    cadastroLink.style.padding = "8px 20px";
    cadastroLink.style.borderRadius = "30px";
    cadastroLink.style.fontWeight = "700";
    cadastroLink.style.display = "inline-block";

    // Dropdown com os recursos do plano ao passar o mouse
    const navItem = cadastroLink.closest(".nav-item");
    if (navItem && !navItem.querySelector(".dropdown")) {
      navItem.style.position = "relative";

      const dropdown = document.createElement("div");
      dropdown.className = "dropdown";
      dropdown.innerHTML = `
        <a href="plataforma-questoes.html">Plataforma de Questões</a>
        <a href="aulas-especializadas.html">Aulas Especializadas</a>
        <a href="correcoes-texto.html">Ambiente de Produção Oral e Textual</a>
      `;
      navItem.appendChild(dropdown);

      let timeout;
      navItem.addEventListener("mouseenter", () => {
        clearTimeout(timeout);
        dropdown.classList.add("show");
      });
      navItem.addEventListener("mouseleave", () => {
        timeout = setTimeout(() => dropdown.classList.remove("show"), 150);
      });
    }
  }
}

updateNav();
