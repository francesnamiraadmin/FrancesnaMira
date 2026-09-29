// ===================== SimuladoAoVivo — tempo real do Simulado Completo =====================
// Compartilhado pela tela do aluno (simulado-tcf.html) e pelo painel da equipe
// (admin-simulados.html):
//   • stream(url, onEvento)  — Server-Sent Events via fetch (manda o token no header, ao
//     contrário do EventSource), com reconexão automática.
//   • Chamada                — chamada de voz WebRTC aluno ↔ professor (Expression orale),
//     com sinalização pelo próprio canal da tentativa.
//   • api(url, opts)         — fetch com token e JSON.
(function () {
  const token = () => localStorage.getItem("token");

  async function api(url, opts = {}) {
    const headers = { Authorization: "Bearer " + token(), ...(opts.headers || {}) };
    let body = opts.body;
    if (body && !(body instanceof FormData) && typeof body !== "string") {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(body);
    }
    const res = await fetch(url, { ...opts, headers, body });
    const dados = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(dados.msg || "Erro de conexão."), { status: res.status, dados });
    return dados;
  }

  // Retorna { fechar() }. onEvento(nome, dados); onEstado(true/false) indica conexão.
  function stream(url, onEvento, onEstado) {
    let ativo = true;
    let controle = null;
    async function conectar() {
      while (ativo) {
        try {
          controle = new AbortController();
          const res = await fetch(url, { headers: { Authorization: "Bearer " + token() }, signal: controle.signal });
          if (!res.ok || !res.body) throw new Error("stream " + res.status);
          onEstado && onEstado(true);
          const leitor = res.body.getReader();
          const dec = new TextDecoder();
          let buffer = "";
          for (;;) {
            const { value, done } = await leitor.read();
            if (done) break;
            buffer += dec.decode(value, { stream: true });
            let fim;
            while ((fim = buffer.indexOf("\n\n")) >= 0) {
              const bloco = buffer.slice(0, fim);
              buffer = buffer.slice(fim + 2);
              let evento = "message", dados = "";
              for (const linha of bloco.split("\n")) {
                if (linha.startsWith("event:")) evento = linha.slice(6).trim();
                else if (linha.startsWith("data:")) dados += linha.slice(5).trim();
              }
              if (!dados) continue;
              try { onEvento(evento, JSON.parse(dados)); } catch (e) { console.error(e); }
            }
          }
        } catch (err) {
          if (!ativo) return;
        }
        onEstado && onEstado(false);
        if (ativo) await new Promise(r => setTimeout(r, 3000));
      }
    }
    conectar();
    return { fechar() { ativo = false; controle && controle.abort(); } };
  }

  // ---------------- Chamada de voz (WebRTC) ----------------
  // papel: "aluno" | "professor". O professor liga; o aluno aceita.
  // callbacks: onEstado(estado, detalhe), onRemoto(MediaStream), onConvite() (aluno).
  class Chamada {
    constructor(tentativaId, papel, callbacks = {}) {
      this.id = tentativaId;
      this.papel = papel;
      this.cb = callbacks;
      this.pc = null;
      this.local = null;
      this.pendentes = [];
      this.ofertaRecebida = null;
      this.estado = "livre";
    }
    _estado(e, d) { this.estado = e; this.cb.onEstado && this.cb.onEstado(e, d); }
    _enviar(dados) { return api(`/api/simulados/tentativas/${this.id}/sinal`, { method: "POST", body: { dados } }).catch(() => {}); }

    async _preparar() {
      this.local = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      this.pc = new RTCPeerConnection({ iceServers: [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }] });
      this.local.getTracks().forEach(t => this.pc.addTrack(t, this.local));
      this.pc.onicecandidate = e => { if (e.candidate) this._enviar({ tipo: "ice", candidato: e.candidate.toJSON() }); };
      this.pc.ontrack = e => this.cb.onRemoto && this.cb.onRemoto(e.streams[0]);
      this.pc.onconnectionstatechange = () => {
        const s = this.pc && this.pc.connectionState;
        if (s === "connected") this._estado("conectada");
        else if (s === "failed") this._estado("falhou", "Não foi possível conectar o áudio (rede bloqueando a chamada). Use o chat ou um link de vídeo.");
        else if (s === "disconnected") this._estado("instavel");
      };
    }

    async ligar() {
      if (this.pc) this.encerrar(false);
      this._estado("chamando");
      try {
        await this._preparar();
        const oferta = await this.pc.createOffer();
        await this.pc.setLocalDescription(oferta);
        await this._enviar({ tipo: "oferta", sdp: this.pc.localDescription.sdp });
      } catch (err) {
        this._estado("erro", err.name === "NotAllowedError" ? "Permita o uso do microfone para falar com o candidato." : err.message);
        this.encerrar(false);
      }
    }

    async aceitar() {
      if (!this.ofertaRecebida) return;
      try {
        await this._preparar();
        await this.pc.setRemoteDescription({ type: "offer", sdp: this.ofertaRecebida });
        this.ofertaRecebida = null;
        const resposta = await this.pc.createAnswer();
        await this.pc.setLocalDescription(resposta);
        await this._enviar({ tipo: "resposta", sdp: this.pc.localDescription.sdp });
        for (const c of this.pendentes.splice(0)) await this.pc.addIceCandidate(c).catch(() => {});
        this._estado("conectando");
      } catch (err) {
        this._estado("erro", err.name === "NotAllowedError" ? "Permita o uso do microfone para falar com o professor." : err.message);
        this.encerrar(true);
      }
    }

    recusar() { this.ofertaRecebida = null; this._enviar({ tipo: "encerrar" }); this._estado("livre"); }

    // Chamado com cada evento "sinal" do stream.
    async receber({ de, dados }) {
      if (de === this.papel || !dados) return;
      if (dados.tipo === "oferta" && this.papel === "aluno") {
        if (this.pc) this.encerrar(false);
        this.ofertaRecebida = dados.sdp;
        this.pendentes = [];
        this._estado("convite");
        this.cb.onConvite && this.cb.onConvite();
      } else if (dados.tipo === "resposta" && this.pc) {
        await this.pc.setRemoteDescription({ type: "answer", sdp: dados.sdp });
        for (const c of this.pendentes.splice(0)) await this.pc.addIceCandidate(c).catch(() => {});
        this._estado("conectando");
      } else if (dados.tipo === "ice") {
        if (this.pc && this.pc.remoteDescription) await this.pc.addIceCandidate(dados.candidato).catch(() => {});
        else this.pendentes.push(dados.candidato);
      } else if (dados.tipo === "encerrar") {
        this.encerrar(false);
      }
    }

    encerrar(avisar = true) {
      if (avisar) this._enviar({ tipo: "encerrar" });
      if (this.pc) { try { this.pc.close(); } catch (e) {} }
      if (this.local) this.local.getTracks().forEach(t => t.stop());
      this.pc = null; this.local = null; this.ofertaRecebida = null; this.pendentes = [];
      this._estado("livre");
    }

    mudo(sim) { if (this.local) this.local.getAudioTracks().forEach(t => { t.enabled = !sim; }); }
  }

  // ---------------- Escalas TCF (mesmas do backend/utils/simulados.js) ----------------
  function nivelExpressao(n) {
    if (n >= 16) return "C2"; if (n >= 14) return "C1"; if (n >= 10) return "B2";
    if (n >= 6) return "B1"; if (n >= 4) return "A2"; if (n >= 1) return "A1"; return "< A1";
  }
  function nclcExpressao(n) {
    const t = [[16, "10+"], [14, "9"], [12, "8"], [10, "7"], [7, "6"], [6, "5"], [4, "4"]];
    return (t.find(([m]) => n >= m) || [0, "< 4"])[1];
  }

  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const contarPalavras = t => (String(t || "").match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || []).length;
  const mmss = s => { s = Math.max(0, Math.round(s)); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };

  window.SimuladoAoVivo = { api, stream, Chamada, nivelExpressao, nclcExpressao, esc, contarPalavras, mmss };
})();
