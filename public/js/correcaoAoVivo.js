// SISTEMA DE CORREÇÃO — aba « Ao vivo »: os alunos que chamaram um professor na página do tema do
// Ambiente de Produção. O professor/administrador aceita aqui, vê a redação (ou a transcrição da
// produção oral) sendo feita em tempo real, com o roteiro do tema, conversa por chat e por voz.
// É a mesma sala do Espace professeur → « Ao vivo »: aceitar num lugar vale para o outro.
(function () {
  const token = localStorage.getItem('token');
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const NOMES_TAREFA = { ET1: 'Tarefa 1 escrita', ET2: 'Tarefa 2 escrita', ET3: 'Tarefa 3 escrita', T1: 'Tarefa 1 oral', T2: 'Tarefa 2 oral', T3: 'Tarefa 3 oral' };
  const contarPalavras = t => (String(t || '').trim().match(/\S+/g) || []).length;

  async function rpc(fn, ...args) {
    const res = await fetch('/api/modeles/rpc/' + fn, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ args }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.msg || 'Erro ' + res.status);
    return d.r;
  }

  const salas = {};
  let aberta = null;        // { id, stream, chamada }
  let streamEquipe = null;

  function contador() {
    const n = Object.values(salas).filter(s => s.status === 'aguardando').length;
    const el = document.getElementById('contAoVivo');
    if (el) { el.textContent = Object.keys(salas).length; el.classList.toggle('chamando', n > 0); }
  }

  function desenharLista() {
    contador();
    const box = document.getElementById('aoVivoLista');
    if (!box) return;
    const l = Object.values(salas).sort((a, b) => new Date(a.inicio) - new Date(b.inicio));
    box.innerHTML = l.length ? l.map(s => `
      <div class="fila-item av-sala-item ${s.status}" data-sala="${s.id}">
        <div>
          <h4>${esc(s.nome || 'Aluno')}</h4>
          <div class="meta">${esc(s.titulo || '')}</div>
          <div style="margin-top:8px; display:flex; gap:6px; flex-wrap:wrap;">
            <span class="tag tarefa">${esc(NOMES_TAREFA[s.tache] || s.tache)}</span>
            ${s.curso ? `<span class="tag exame">${esc(s.curso)}</span>` : ''}
            ${s.status === 'aguardando' ? '<span class="tag urgente">● Aguardando um professor</span>' : `<span class="tag minha">Com ${esc(s.professorNome || 'professor')}</span>`}
          </div>
        </div>
        <button class="btn pequeno" data-entrar="${s.id}">${s.status === 'aguardando' ? 'Aceitar e acompanhar' : 'Abrir a sala'}</button>
      </div>`).join('') : '<div class="vazio-box">Nenhum aluno pedindo correção ao vivo no momento. Quando alguém chamar, o pedido aparece aqui na hora (com aviso sonoro).</div>';
  }

  function bip() {
    try { const C = window.AudioContext || window.webkitAudioContext, c = new C(), o = c.createOscillator(), g = c.createGain(); o.frequency.value = 880; o.connect(g); g.connect(c.destination); g.gain.value = .12; o.start(); o.stop(c.currentTime + .4); } catch (e) {}
  }

  function htmlRoteiro(r) {
    const m = r.modelo || {}, partes = [];
    partes.push(`<div class="ro-bloco"><b>${esc(r.nomeTache)} · ${esc(r.eixo)}</b><p lang="fr">${esc(r.consigne)}</p>${r.d1 ? `<details><summary>Documentos 1 e 2</summary><p lang="fr">${esc(r.d1)}</p><p lang="fr">${esc(r.d2)}</p></details>` : ''}</div>`);
    if (r.tache === 'T2' && m.ech) partes.push(`<details class="ro-bloco" open><summary>Perguntas modelo do candidato</summary><ol lang="fr">${m.ech.map(x => `<li>${esc(x.q)}<small>${esc(x.r)}</small></li>`).join('')}</ol></details>`);
    else if (m.etapes) partes.push(`<details class="ro-bloco" open><summary>Resposta modelo, passo a passo</summary><ol lang="fr">${m.etapes.map(x => `<li>${esc(x)}</li>`).join('')}</ol></details>`);
    else if (m.p) partes.push(`<details class="ro-bloco"><summary>Produção modelo</summary><div lang="fr">${String(m.p).split(/\n+/).map(x => `<p>${esc(x)}</p>`).join('')}</div></details>`);
    if (r.trame && r.trame.etapes) partes.push(`<details class="ro-bloco"><summary>Estrutura (trame)</summary><ol lang="fr">${r.trame.etapes.map(e => `<li><b>${esc(e.rotulo)}</b> ${esc(e.texte)}</li>`).join('')}</ol></details>`);
    if (r.argumentos && r.argumentos.pour.length) partes.push(`<details class="ro-bloco"><summary>Argumentos do eixo</summary><b>A favor</b><ul lang="fr">${r.argumentos.pour.map(x => `<li>${esc(x)}</li>`).join('')}</ul><b>Contra</b><ul lang="fr">${r.argumentos.contre.map(x => `<li>${esc(x)}</li>`).join('')}</ul></details>`);
    return partes.join('');
  }

  function fecharSala() {
    if (!aberta) return;
    try { aberta.stream && aberta.stream.fechar(); } catch (e) {}
    try { aberta.chamada && aberta.chamada.encerrar(false); } catch (e) {}
    aberta = null;
  }

  async function entrar(id) {
    const box = document.getElementById('aoVivoSala');
    box.innerHTML = '<p style="opacity:.6;">Entrando na sala…</p>';
    let s;
    try { s = await rpc('entrarSala', id); } catch (e) { box.innerHTML = `<div class="vazio-box">${esc(e.message)}</div>`; delete salas[id]; desenharLista(); return; }
    fecharSala();
    salas[s.id] = s; desenharLista();
    const oral = s.tache.indexOf('ET') !== 0;
    box.innerHTML = `
      <div class="card av-sala-prof">
        <div class="av-sala-topo">
          <div><span class="tag urgente">Sala ao vivo</span><h2 style="margin:6px 0 2px;">${esc(s.nome || '')} · ${esc(NOMES_TAREFA[s.tache] || s.tache)}</h2><small lang="fr">${esc(s.titulo || '')}</small></div>
          <div class="av-sala-bts">
            <button class="btn pequeno" id="avLigar">📞 Ligar para o aluno</button>
            <button class="btn secundario pequeno" id="avDesligar" style="display:none;">Desligar</button>
            <button class="btn secundario pequeno" id="avFim">Encerrar a sessão</button>
          </div>
        </div>
        <div class="msg-inline" id="avChamadaSt" style="display:none;"></div>
        <div class="av-sala-grade">
          <div>
            <h3>${oral ? 'O que o aluno diz (transcrição ao vivo)' : 'O que o aluno escreve (ao vivo)'}</h3>
            <p class="mav-dica">🖍 Selecione um trecho e escolha a cor: o aluno vê o grifo na hora.</p>
            <div class="texto-enviado-box av-ao-vivo mav-texto" id="avTexto" lang="fr"></div>
            <div class="mav-paleta" id="avPaleta" hidden></div>
            <div style="font-size:.8rem; color:var(--cinza-400); margin:6px 0 8px;" id="avContagem"></div>
            <div id="avMarcas"></div>
            <h3>Conversa</h3>
            <div class="av-msgs" id="avMsgs"></div>
            <div class="av-msg-linha"><input id="avMsg" placeholder="Escrever ao aluno…"><button class="btn secundario pequeno" id="avMsgBt">Enviar</button></div>
            <p style="font-size:.8rem; color:var(--cinza-400); margin-top:10px;">Quando o aluno enviar a produção, ela entra na « Fila de correção » para ser corrigida com a grade da prova.</p>
          </div>
          <div class="av-roteiro"><h3>Roteiro do tema</h3><div id="avRoteiro"><p style="opacity:.6;">Carregando…</p></div></div>
        </div>
      </div>`;
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // ---- correção por cores ao vivo ----
    let textoAtual = '', marcas = s.marcas || [], pendente = false, selecao = null;
    const modalidade = oral ? 'oral' : 'textual';
    const desenharTexto = () => {
      const el = document.getElementById('avTexto'); if (!el) return;
      const r = MarcasAoVivo.html(textoAtual, marcas, { numeros: true });
      el.innerHTML = textoAtual ? r.html : '<span style="opacity:.6;">(nada ainda)</span>';
      document.getElementById('avMarcas').innerHTML = marcas.length ? '<h3 style="margin:10px 0 6px;">Marcas ao vivo <span class="tag">' + marcas.length + '</span></h3>' + MarcasAoVivo.lista(r, { remover: 'Tirar a marca' }) : '';
    };
    const ocupado = () => !document.getElementById('avPaleta')?.hidden;
    const mostrarTexto = t => {
      textoAtual = String(t || '');
      document.getElementById('avContagem').textContent = contarPalavras(t) + ' palavras';
      if (ocupado()) { pendente = true; return; }   // não apaga a seleção do professor enquanto ele marca
      desenharTexto();
    };
    mostrarTexto(oral ? s.transcricao : s.texto);
    const fecharPaleta = () => {
      const p = document.getElementById('avPaleta'); if (p) { p.hidden = true; p.innerHTML = ''; }
      selecao = null;
      if (pendente) { pendente = false; desenharTexto(); }
    };
    const abrirPaleta = async () => {
      const el = document.getElementById('avTexto'), sel = window.getSelection();
      if (!el || !sel || sel.isCollapsed || !sel.rangeCount) return;
      const rg = sel.getRangeAt(0);
      if (!el.contains(rg.startContainer) || !el.contains(rg.endContainer)) return;
      let ini = MarcasAoVivo.deslocamento(el, rg.startContainer, rg.startOffset), fim = MarcasAoVivo.deslocamento(el, rg.endContainer, rg.endOffset);
      while (ini < fim && /\s/.test(textoAtual[ini])) ini++;
      while (fim > ini && /\s/.test(textoAtual[fim - 1])) fim--;
      if (fim <= ini) return;
      const trecho = textoAtual.slice(ini, fim);
      selecao = { trecho, ocorrencia: MarcasAoVivo.ocorrenciaEm(textoAtual, trecho, ini) };
      const cats = (window.Correcao && Correcao.categorias) ? (await Correcao.categorias.carregar(), Correcao.categorias.ativas(modalidade)) : [];
      const lista = cats.length ? cats : [{ id: 'gramatica', nome: 'Erro', cor: '#dc2626' }, { id: 'sugestao', nome: 'Sugestão', cor: '#2563eb' }, { id: 'positivo', nome: 'Ponto positivo', cor: '#16a34a' }];
      const p = document.getElementById('avPaleta');
      p.innerHTML = '<div class="mav-paleta-topo"><b>Grifar</b> <q lang="fr">' + esc(trecho.length > 80 ? trecho.slice(0, 80) + '…' : trecho) + '</q><button type="button" class="mav-fechar" data-mav-fechar aria-label="Fechar">✕</button></div>' +
        '<div class="mav-cores">' + lista.map(c => '<button type="button" class="mav-cor" data-mav-cat="' + esc(c.id) + '" data-cor="' + esc(c.cor) + '" data-nome="' + esc(c.nome) + '" style="--mav:' + esc(c.cor) + '"><i></i>' + esc(c.nome) + '</button>').join('') + '</div>' +
        '<input type="text" class="mav-coment" id="avComent" maxlength="600" placeholder="Comentário para o aluno (opcional), depois escolha a cor">';
      p.hidden = false;
      // a paleta aparece logo abaixo da seleção
      const caixa = rg.getBoundingClientRect(), base = p.offsetParent ? p.offsetParent.getBoundingClientRect() : { top: 0, left: 0 };
      p.style.top = (caixa.bottom - base.top + 8) + 'px';
      p.style.left = Math.max(0, Math.min(caixa.left - base.left, (p.offsetParent ? p.offsetParent.clientWidth : 600) - 340)) + 'px';
    };
    document.getElementById('avTexto').addEventListener('mouseup', () => setTimeout(abrirPaleta, 0));
    document.getElementById('avTexto').addEventListener('keyup', e => { if (e.shiftKey) abrirPaleta(); });
    document.getElementById('avPaleta').addEventListener('click', async e => {
      if (e.target.closest('[data-mav-fechar]')) return fecharPaleta();
      const b = e.target.closest('[data-mav-cat]'); if (!b || !selecao) return;
      b.disabled = true;
      const marca = { ...selecao, categoria: b.dataset.mavCat, cor: b.dataset.cor, nome: b.dataset.nome, comentario: document.getElementById('avComent').value.trim() };
      try { marcas = await rpc('marcarSala', s.id, marca); } catch (err) { await Dialogo.aviso(err.message); }
      window.getSelection().removeAllRanges();
      pendente = true; fecharPaleta();
    });
    document.getElementById('avPaleta').addEventListener('keydown', e => { if (e.key === 'Escape') fecharPaleta(); });
    document.getElementById('avMarcas').addEventListener('click', async e => {
      const b = e.target.closest('[data-mav-del]'); if (!b) return;
      b.disabled = true;
      try { marcas = await rpc('desmarcarSala', s.id, b.dataset.mavDel); desenharTexto(); } catch (err) { b.disabled = false; await Dialogo.aviso(err.message); }
    });
    const addMsg = (de, texto) => {
      const l = document.getElementById('avMsgs'); if (!l) return;
      l.insertAdjacentHTML('beforeend', `<div class="av-m ${de}"><b>${de === 'aluno' ? esc(s.nome || 'Aluno') : 'Você'}</b><span>${esc(texto)}</span></div>`);
      l.scrollTop = l.scrollHeight;
    };
    (s.mensagens || []).forEach(m => addMsg(m.de, m.texto));
    rpc('roteiroSujet', s.tache, s.sujetId).then(r => { document.getElementById('avRoteiro').innerHTML = htmlRoteiro(r); }).catch(() => { document.getElementById('avRoteiro').innerHTML = '<p>Roteiro indisponível.</p>'; });

    let chamada = null;
    if (window.SimuladoAoVivo && SimuladoAoVivo.Chamada) {
      chamada = new SimuladoAoVivo.Chamada(s.id, 'professor', {
        onEstado: (e2, d) => {
          const st = document.getElementById('avChamadaSt'); if (!st) return;
          const txt = { chamando: 'Chamando… o aluno precisa atender.', conectando: 'Conectando…', conectada: '🔊 Em ligação com o aluno', instavel: 'Conexão instável…', falhou: d || 'A chamada falhou.', erro: d || 'Erro na chamada.' }[e2] || '';
          st.style.display = txt ? 'block' : 'none'; st.textContent = txt;
          document.getElementById('avDesligar').style.display = ['chamando', 'conectando', 'conectada', 'instavel'].includes(e2) ? '' : 'none';
        },
        onRemoto: stream => { const au = document.getElementById('avAudio') || document.body.appendChild(Object.assign(document.createElement('audio'), { id: 'avAudio', autoplay: true })); au.srcObject = stream; }
      });
      chamada._enviar = dados => fetch('/api/modeles/salas/' + s.id + '/sinal', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ dados }) }).catch(() => {});
    }
    const stream = SimuladoAoVivo.stream('/api/modeles/salas/' + s.id + '/stream', (ev, d) => {
      if (!document.getElementById('avTexto')) return;
      if (ev === 'conteudo') mostrarTexto(oral ? d.transcricao : d.texto);
      else if (ev === 'marcas') { marcas = d.marcas || []; if (ocupado()) pendente = true; else desenharTexto(); }
      else if (ev === 'msg' && d.de === 'aluno') { addMsg('aluno', d.texto); bip(); }
      else if (ev === 'sinal' && chamada) chamada.receber(d);
      else if (ev === 'estado' && d.status === 'encerrada') {
        const st = document.getElementById('avChamadaSt'); st.style.display = 'block'; st.textContent = 'O aluno encerrou a sessão.';
        if (chamada) chamada.encerrar(false);
      }
    });
    aberta = { id: s.id, stream, chamada };
    document.getElementById('avLigar').addEventListener('click', () => { if (chamada) chamada.ligar(); });
    document.getElementById('avDesligar').addEventListener('click', () => { if (chamada) chamada.encerrar(true); });
    const enviarMsg = () => {
      const i = document.getElementById('avMsg'); if (!i.value.trim()) return;
      const t = i.value; i.value = '';
      addMsg('professor', t);
      rpc('mensagemSala', s.id, t).catch(async e => (await Dialogo.aviso(e.message)));
    };
    document.getElementById('avMsgBt').addEventListener('click', enviarMsg);
    document.getElementById('avMsg').addEventListener('keydown', e => { if (e.key === 'Enter') enviarMsg(); });
    document.getElementById('avFim').addEventListener('click', async () => {
      if (!(await Dialogo.confirmar('Encerrar a sessão ao vivo com este aluno?'))) return;
      rpc('encerrarSala', s.id).catch(() => {});
      fecharSala(); delete salas[s.id]; desenharLista();
      document.getElementById('aoVivoSala').innerHTML = '';
    });
  }

  async function carregar() {
    try {
      const l = await rpc('listarSalasAoVivo');
      Object.keys(salas).forEach(k => delete salas[k]);
      (l || []).forEach(s => { salas[s.id] = s; });
    } catch (e) { /* sem acesso: a aba fica vazia */ }
    desenharLista();
  }

  function iniciar() {
    if (!document.getElementById('viewAoVivo') || !window.SimuladoAoVivo) return;
    carregar();
    document.getElementById('aoVivoLista').addEventListener('click', e => {
      const b = e.target.closest('[data-entrar]');
      if (b) entrar(b.dataset.entrar);
    });
    // Pedidos novos chegam na hora, em qualquer aba do Sistema de Correção.
    streamEquipe = SimuladoAoVivo.stream('/api/modeles/equipe/stream', (ev, d) => {
      if (ev !== 'sala') return;
      if (d.acao === 'nova') { salas[d.id] = d; bip(); avisoNovo(d); }
      else if (d.acao === 'fim') delete salas[d.id];
      else if (d.acao === 'atendimento' && salas[d.id]) { salas[d.id].status = 'atendimento'; salas[d.id].professorNome = d.professorNome; }
      if (d.acao !== 'conteudo') desenharLista();
    });
  }

  function avisoNovo(d) {
    const a = document.createElement('div');
    a.className = 'av-toast';
    a.innerHTML = `<b>Um aluno pediu correção ao vivo</b><span>${esc(d.nome || '')} · ${esc(NOMES_TAREFA[d.tache] || d.tache || '')}</span><button class="btn pequeno" type="button">Aceitar</button>`;
    document.body.appendChild(a);
    a.querySelector('button').addEventListener('click', () => { a.remove(); if (window.mostrarView) window.mostrarView('aovivo'); entrar(d.id); });
    setTimeout(() => a.remove(), 15000);
  }

  window.CorrecaoAoVivo = { carregar, entrar };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
