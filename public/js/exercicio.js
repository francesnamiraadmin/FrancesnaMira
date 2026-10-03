// ===================== EXERCÍCIO INTERATIVO (exercicio.html) =====================
// Carrega /api/exercicios/:slug (sem gabarito), desenha as abas e manda as
// respostas para POST /api/exercicios/:slug/corrigir. Na URL:
//   ?slug=<exercício>[&dever=<id>&atividade=<índice>][&embed=1]
// Com dever/atividade, o botão final entrega a atividade do dever de casa.
// Com embed=1 a página roda dentro da aba do dever (dever.html): sem navbar e rodapé, avisa a
// página de fora da altura (para o iframe crescer) e da entrega.
// Modo "treino": cada aba de exercício tem "Corrigir esta parte". Modo "prova":
// só a correção final, cronômetro por parte e limite de reproduções do áudio.
// Todo áudio em francês sai de falarFrances() (js/audioFrances.js), que toca
// o MP3 gerado com Coqui TTS.
(function () {
  const params = new URLSearchParams(location.search);
  const slug = params.get('slug');
  const deverId = params.get('dever');
  const atividadeIndex = params.has('atividade') ? Number(params.get('atividade')) : null;
  const token = localStorage.getItem('token');
  const CHAVE_RASCUNHO = 'exercicio:' + slug + ':' + (deverId || 'livre');
  const embutido = params.get('embed') === '1' && window.parent !== window;
  const avisarFora = msg => { if (embutido) try { window.parent.postMessage(Object.assign({ fnmExercicio: true, slug, deverId, atividade: atividadeIndex }, msg), location.origin); } catch (e) { /* ok */ } };
  if (embutido) {
    document.documentElement.classList.add('ex-embutido');
    const medir = () => avisarFora({ altura: Math.ceil(document.documentElement.scrollHeight) });
    window.addEventListener('load', medir);
    try { new ResizeObserver(medir).observe(document.body); } catch (e) { setInterval(medir, 1000); }
  }

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = id => document.getElementById(id);
  const ROTULOS = { video: 'Vídeo', aula: 'Aula', leitura: 'Leitura', regulamento: 'Regulamento', exercicio: 'Exercício' };
  const ICONES = { video: '▶', aula: '📘', leitura: '📖', regulamento: '📜', exercicio: '✏️' };

  let def = null;
  let atual = 0;
  const respostas = {};
  const confirmacoes = new Set();
  const feitas = new Set();          // seções concluídas (visto na aba)
  const feedback = {};               // itemId -> resultado da correção
  const reproducoes = {};            // secaoId -> nº de vezes que o áudio tocou
  const cronometros = {};            // secaoId -> segundos restantes
  let tickCronometro = null;

  // ---------- rascunho (conveniência deste navegador) ----------
  function salvarRascunho() {
    try { localStorage.setItem(CHAVE_RASCUNHO, JSON.stringify({ respostas, confirmacoes: [...confirmacoes] })); } catch (e) {}
  }
  function lerRascunho() {
    try {
      const r = JSON.parse(localStorage.getItem(CHAVE_RASCUNHO) || 'null');
      if (r) { Object.assign(respostas, r.respostas || {}); (r.confirmacoes || []).forEach(i => confirmacoes.add(i)); }
    } catch (e) {}
  }

  // ---------- áudio ----------
  function botaoFalar(texto, rotulo) {
    return `<button type="button" class="ex-falar" data-falar="${esc(texto)}" title="${esc(rotulo || 'Ouvir')}" aria-label="${esc(rotulo || 'Ouvir')}">🔊</button>`;
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-falar]');
    if (b && window.falarFrances) window.falarFrances(b.dataset.falar, b);
  });

  // ---------- cabeçalho e abas ----------
  function totalItens() { return def.secoes.reduce((n, s) => n + (s.itens ? s.itens.length : 0), 0); }
  function respondidos() {
    return def.secoes.reduce((n, s) => n + (s.itens || []).filter(i => temResposta(i)).length, 0);
  }
  function temResposta(item) {
    const v = respostas[item.id];
    if (item.tipo === 'associar') return v && Object.values(v).filter(Boolean).length === item.esquerda.length;
    if (item.tipo === 'multipla') return Array.isArray(v) && v.length > 0;
    return v != null && String(v).trim() !== '';
  }

  function renderCabecalho() {
    const tot = totalItens();
    const pct = tot ? Math.round((respondidos() / tot) * 100) : 0;
    $('exCabecalho').innerHTML = `
      <div class="nivel">${esc(def.nivel || 'FR')}</div>
      <div class="info">
        <h1>${esc(def.titulo)}${def.modo === 'prova' ? '<span class="ex-selo-prova">Prova</span>' : ''}</h1>
        <p>${esc(def.descricao || '')}</p>
        ${tot ? `<div class="ex-barra" title="${pct}% respondido"><span style="width:${pct}%"></span></div>` : ''}
      </div>`;
    document.title = def.titulo + ' - Francês na Mira';
  }

  function renderAbas() {
    $('exAbas').innerHTML = def.secoes.map((s, i) => `
      <button class="ex-aba${i === atual ? ' ativa' : ''}" data-aba="${i}">
        ${feitas.has(s.id) ? '<span class="ok">✓</span>' : `<span>${ICONES[s.tipo] || '•'}</span>`}${esc(s.titulo || ROTULOS[s.tipo])}
      </button>`).join('');
  }
  $('exAbas').addEventListener('click', e => {
    const b = e.target.closest('[data-aba]');
    if (b) irPara(Number(b.dataset.aba));
  });

  function irPara(i) {
    if (i < 0 || i >= def.secoes.length) return;
    const saindo = def.secoes[atual];
    if (saindo && (saindo.tipo === 'video' || saindo.tipo === 'aula' || saindo.tipo === 'leitura')) feitas.add(saindo.id);
    pararLeitura();
    atual = i;
    renderAbas();
    renderSecao();
    window.scrollTo({ top: $('exAbas').offsetTop - 70, behavior: 'smooth' });
  }

  // ---------- seções ----------
  function renderSecao() {
    const s = def.secoes[atual];
    const alvo = $('exConteudo');
    const cabec = `<h2>${esc(s.titulo || ROTULOS[s.tipo])}</h2>${s.instrucao ? `<p class="ex-instrucao">${s.instrucao}</p>` : ''}`;
    if (s.tipo === 'video') {
      alvo.innerHTML = cabec + [].concat(s.youtube).map(v => `${v.titulo ? `<h3 style="margin:14px 0 8px; font-size:1rem;">${esc(v.titulo)}</h3>` : ''}<div class="ex-video"><iframe src="https://www.youtube-nocookie.com/embed/${esc(v.id || v)}" title="${esc(v.titulo || s.titulo)}" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`).join('');
    } else if (s.tipo === 'aula') {
      alvo.innerHTML = cabec + `<div class="ex-aula">${s.html}</div>`;
      alvo.querySelectorAll('.ex-aula [data-fr]').forEach(el => {
        el.classList.add('ex-falar-texto');
        el.insertAdjacentHTML('beforeend', ' ' + botaoFalar(el.dataset.fr || el.textContent.trim()));
      });
    } else if (s.tipo === 'leitura') {
      renderLeitura(alvo, s, cabec);
    } else if (s.tipo === 'regulamento') {
      renderRegulamento(alvo, s, cabec);
    } else {
      renderExercicio(alvo, s, cabec);
    }
    $('exRodape').hidden = false;
    $('btnAnterior').disabled = atual === 0;
    $('btnProxima').textContent = atual === def.secoes.length - 1 ? 'Concluir' : 'Próxima →';
    $('exProgressoTexto').textContent = `Parte ${atual + 1} de ${def.secoes.length}`;
  }

  // leitura com glossário e leitura em voz alta (parágrafo a parágrafo)
  let leitura = null;
  function renderLeitura(alvo, s, cabec) {
    const gl = s.glossario || {};
    const chave = w => w.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z'-]/g, '');
    const marcar = p => p.split(/(\s+)/).map(pedaco => {
      if (/^\s+$/.test(pedaco)) return pedaco;
      const k = chave(pedaco);
      return gl[k] ? `<span class="ex-palavra glossario" tabindex="0" data-trad="${esc(gl[k])}">${esc(pedaco)}</span>` : esc(pedaco);
    }).join('');
    alvo.innerHTML = cabec + `
      <div class="ex-leitor">
        <button class="ex-btn" id="btnLer">▶ Ouvir o texto</button>
        <button class="ex-btn secundario" id="btnPararLer">■ Parar</button>
        <label>Velocidade <select id="velLeitura" class="ex-input" style="width:auto; padding:4px 8px;">
          <option value="0.75">0.75x</option><option value="0.9">0.9x</option><option value="1" selected>1x</option><option value="1.15">1.15x</option>
        </select></label>
        ${Object.keys(gl).length ? '<small style="color:var(--text-muted)">Passe o mouse nas palavras sublinhadas para ver a tradução.</small>' : ''}
      </div>
      <div class="ex-leitura">${s.paragrafos.map((p, i) => `<p data-par="${i}">${marcar(p)}</p>`).join('')}</div>`;
    $('btnLer').addEventListener('click', () => lerDe(0, s));
    $('btnPararLer').addEventListener('click', pararLeitura);
  }
  function pararLeitura() {
    if (leitura?.audio) { leitura.audio.pause(); }
    leitura = null;
    document.querySelectorAll('.ex-leitura p.lendo').forEach(p => p.classList.remove('lendo'));
  }
  async function lerDe(i, s) {
    pararLeitura();
    const sessao = leitura = { audio: null };
    for (let k = i; k < s.paragrafos.length; k++) {
      if (leitura !== sessao) return;
      document.querySelectorAll('.ex-leitura p').forEach(p => p.classList.toggle('lendo', Number(p.dataset.par) === k));
      const url = await urlAudio(s.paragrafos[k]);
      if (!url || leitura !== sessao) { pararLeitura(); return; }
      await new Promise(resolve => {
        const a = new Audio(url);
        a.playbackRate = Number($('velLeitura')?.value || 1);
        sessao.audio = a;
        a.onended = a.onerror = resolve;
        a.play().catch(resolve);
      });
    }
    if (leitura === sessao) pararLeitura();
  }
  // Mesmo endereço que js/audioFrances.js calcula: /audio/tts/<sha256(texto)>.mp3
  async function urlAudio(texto) {
    try {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
      const hex = [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
      return 'audio/tts/' + hex + '.mp3';
    } catch (e) { return null; }
  }

  function renderRegulamento(alvo, s, cabec) {
    alvo.innerHTML = cabec + s.regras.map((r, i) => `
      <label class="ex-regra${confirmacoes.has(i) ? ' lida' : ''}">
        <input type="checkbox" data-regra="${i}" ${confirmacoes.has(i) ? 'checked' : ''}>
        <span class="num">${i + 1}.</span><p>${esc(r)}</p>
      </label>`).join('') + `<p class="ex-msg" id="msgRegras"></p>`;
    const atualizar = () => {
      $('msgRegras').textContent = `${confirmacoes.size} de ${s.regras.length} regras confirmadas.`;
      if (confirmacoes.size === s.regras.length) feitas.add(s.id); else feitas.delete(s.id);
      renderAbas();
    };
    alvo.querySelectorAll('[data-regra]').forEach(cb => cb.addEventListener('change', () => {
      const i = Number(cb.dataset.regra);
      if (cb.checked) confirmacoes.add(i); else confirmacoes.delete(i);
      cb.closest('.ex-regra').classList.toggle('lida', cb.checked);
      salvarRascunho(); atualizar();
    }));
    atualizar();
  }

  // ---------- exercício ----------
  function renderExercicio(alvo, s, cabec) {
    const prova = def.modo === 'prova';
    let topo = '';
    if (s.tempoMin) {
      if (cronometros[s.id] == null) cronometros[s.id] = s.tempoMin * 60;
      topo += `<span class="ex-cronometro" id="cron">${fmtTempo(cronometros[s.id])}</span>`;
    }
    if (s.audioArquivo) {
      const max = s.maxReproducoes || 0;
      topo += `<div class="ex-audio-secao">
        <audio id="audioSecao" controls controlsList="nodownload" preload="none" src="${esc(s.audioArquivo)}"></audio>
        <small id="audioInfo">${max ? `Você pode ouvir ${max} vez${max > 1 ? 'es' : ''}.` : ''}</small>
      </div>`;
    }
    if (s.imagem) topo += `<img class="ex-imagem" src="${esc(s.imagem)}" alt="${esc(s.imagemAlt || '')}">`;
    if (s.texto) topo += `<div class="ex-aula">${s.texto}</div>`;

    alvo.innerHTML = cabec + topo +
      s.itens.map((item, i) => itemHtml(item, i)).join('') +
      `<div class="ex-acoes-secao">
        ${!prova ? `<button class="ex-btn" id="btnCorrigirSecao">Corrigir esta parte</button>` : ''}
        <span class="ex-placar" id="placarSecao"></span>
      </div>`;

    ligarItens(alvo, s);
    s.itens.forEach(item => mostrarFeedback(item));
    ligarAudioSecao(s);
    iniciarCronometro(s);
    $('btnCorrigirSecao')?.addEventListener('click', () => corrigirSecao(s));
  }

  function itemHtml(item, i) {
    const v = respostas[item.id];
    const audio = item.audio ? botaoFalar(item.audio, 'Ouvir') + ' ' : '';
    let corpo = '';
    const enun = item.enunciado ? `<div class="ex-enunciado">${audio}${item.enunciado}</div>` : '';
    const img = item.imagem ? `<img class="ex-imagem" src="${esc(item.imagem)}" alt="" style="max-width:${item.imagemLargura || 320}px">` : '';
    const svg = item.svg ? `<div style="width:110px; margin:4px 0 10px;">${item.svg}</div>` : '';
    switch (item.tipo) {
      case 'escolha':
        if (item.antes != null || item.depois != null) {
          corpo = `${enun}<div class="ex-frase">${item.enunciado ? '' : audio}${esc(item.antes || '')}<span class="ex-lacuna${v ? '' : ' vazia'}" data-lacuna="${item.id}">${v ? esc(v) : '______'}</span>${esc(item.depois || '')}</div>
            <div class="ex-opcoes">${item.opcoes.map(o => `<button type="button" class="ex-opcao${v === o ? ' marcada' : ''}" data-item="${item.id}" data-valor="${esc(o)}">${esc(o)}</button>`).join('')}</div>`;
        } else {
          corpo = `${enun || audio}${img}${svg}<div class="ex-opcoes lista">${item.opcoes.map(o => `<button type="button" class="ex-opcao${v === o ? ' marcada' : ''}" data-item="${item.id}" data-valor="${esc(o)}">${esc(o)}</button>`).join('')}</div>`;
        }
        break;
      case 'multipla':
        corpo = `${enun}<div class="ex-opcoes lista">${item.opcoes.map(o => `<button type="button" class="ex-opcao${Array.isArray(v) && v.includes(o) ? ' marcada' : ''}" data-item="${item.id}" data-valor="${esc(o)}" data-multi="1">${esc(o)}</button>`).join('')}</div><div class="ex-dica">Marque todas as corretas.</div>`;
        break;
      case 'lacuna':
        corpo = `${enun}<div class="ex-frase">${item.enunciado ? '' : audio}${esc(item.antes || '')}<input class="ex-lacuna" data-item="${item.id}" value="${esc(v || '')}" autocomplete="off" spellcheck="false" size="${Math.max(6, (item.tamanho || 8))}">${esc(item.depois || '')}</div>`;
        break;
      case 'escrita':
        corpo = `${enun}${img}${svg}<input class="ex-input" data-item="${item.id}" value="${esc(v || '')}" placeholder="${esc(item.placeholder || 'Escreva aqui…')}" autocomplete="off" spellcheck="false">`;
        break;
      case 'ditado':
        corpo = `<div class="ex-enunciado">${botaoFalar(item.audio, 'Ouvir')} ${item.enunciado || 'Ouça e escreva o que você ouviu.'}</div>
          <input class="ex-input" data-item="${item.id}" value="${esc(v || '')}" placeholder="${esc(item.placeholder || 'Escreva o que ouviu…')}" autocomplete="off" spellcheck="false">`;
        break;
      case 'associar':
        corpo = `${enun}<table class="ex-associar">${item.esquerda.map((a, k) => `<tr>
            <td>${item.audioEsquerda ? botaoFalar(a) + ' ' : ''}${item.svgs ? `<span style="display:inline-block;width:54px;vertical-align:middle">${item.svgs[k]}</span>` : esc(a)}</td>
            <td><select class="ex-input" data-item="${item.id}" data-par="${k}"><option value="">Escolha…</option>${item.direita.map(b => `<option value="${esc(b)}" ${v && v[k] === b ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select></td>
          </tr>`).join('')}</table>`;
        break;
      case 'livre':
        corpo = `${enun}${img}<textarea class="ex-input" data-item="${item.id}" placeholder="${esc(item.placeholder || 'Escreva sua resposta…')}">${esc(v || '')}</textarea>
          <div class="ex-contador" data-contador="${item.id}"></div>`;
        break;
    }
    const dica = item.dica ? `<div class="ex-dica">💡 ${esc(item.dica)}</div>` : '';
    return `<div class="ex-item" data-item-box="${item.id}">
      <div class="ex-item-topo"><span class="ex-item-num">${i + 1}</span>
        <div class="ex-item-corpo">${corpo}${dica}<div data-fb="${item.id}"></div></div>
      </div></div>`;
  }

  function ligarItens(alvo, s) {
    alvo.querySelectorAll('.ex-opcao').forEach(b => b.addEventListener('click', () => {
      const id = b.dataset.item, valor = b.dataset.valor;
      if (b.dataset.multi) {
        const arr = Array.isArray(respostas[id]) ? respostas[id] : [];
        respostas[id] = arr.includes(valor) ? arr.filter(x => x !== valor) : [...arr, valor];
        b.classList.toggle('marcada');
      } else {
        respostas[id] = valor;
        b.parentElement.querySelectorAll('.ex-opcao').forEach(x => x.classList.toggle('marcada', x === b));
        const lac = alvo.querySelector(`[data-lacuna="${id}"]`);
        if (lac) { lac.textContent = valor; lac.classList.remove('vazia'); }
      }
      limparFeedback(id); aoResponder();
    }));
    alvo.querySelectorAll('input[data-item], textarea[data-item]').forEach(inp => inp.addEventListener('input', () => {
      respostas[inp.dataset.item] = inp.value;
      limparFeedback(inp.dataset.item); atualizarContador(inp.dataset.item); aoResponder();
    }));
    alvo.querySelectorAll('select[data-item]').forEach(sel => sel.addEventListener('change', () => {
      const id = sel.dataset.item;
      respostas[id] = { ...(respostas[id] || {}), [sel.dataset.par]: sel.value };
      limparFeedback(id); aoResponder();
    }));
    s.itens.filter(i => i.tipo === 'livre').forEach(i => atualizarContador(i.id));
  }

  function atualizarContador(id) {
    const el = document.querySelector(`[data-contador="${id}"]`);
    if (!el) return;
    const item = def.secoes.flatMap(s => s.itens || []).find(i => i.id === id);
    const n = String(respostas[id] || '').trim().split(/\s+/).filter(Boolean).length;
    const fora = (item.minPalavras && n < item.minPalavras) || (item.maxPalavras && n > item.maxPalavras);
    el.textContent = `${n} palavra${n === 1 ? '' : 's'}` + (item.minPalavras ? ` · pedido: ${item.minPalavras}${item.maxPalavras ? '–' + item.maxPalavras : '+'}` : '');
    el.classList.toggle('fora', !!fora && n > 0);
  }

  let tRascunho = null;
  function aoResponder() {
    clearTimeout(tRascunho); tRascunho = setTimeout(salvarRascunho, 400);
    renderCabecalho();
  }

  function limparFeedback(id) {
    delete feedback[id];
    const box = document.querySelector(`[data-item-box="${id}"]`);
    if (box) { box.classList.remove('certo', 'errado'); box.querySelector(`[data-fb="${id}"]`).innerHTML = ''; }
  }

  function mostrarFeedback(item) {
    const r = feedback[item.id];
    const box = document.querySelector(`[data-item-box="${item.id}"]`);
    if (!r || !box) return;
    const fb = box.querySelector(`[data-fb="${item.id}"]`);
    if (r.livre) {
      fb.innerHTML = `<div class="ex-feedback livre">Resposta aberta: vai para o professor corrigir.${r.explicacao ? `<span class="exp">${esc(r.explicacao)}</span>` : ''}</div>`;
      return;
    }
    box.classList.toggle('certo', r.certo);
    box.classList.toggle('errado', !r.certo);
    let txt = r.certo ? '✓ Correto!' : `✗ Resposta correta: <strong>${esc(r.correta)}</strong>`;
    if (r.certo && r.avisoAcento) txt = '✓ Correto — mas atenção aos acentos: <strong>' + esc(r.correta) + '</strong>';
    if (item.tipo === 'associar' && !r.certo) txt = `✗ ${r.pontos} de ${r.total} pares certos. Correto: ${esc(r.correta)}`;
    const ouvir = r.audio ? ` ${botaoFalar(r.audio, 'Ouvir a frase correta')}` : '';
    fb.innerHTML = `<div class="ex-feedback ${r.certo ? 'certo' : 'errado'}">${txt}${ouvir}${r.explicacao ? `<span class="exp">${esc(r.explicacao)}</span>` : ''}</div>`;
  }

  async function corrigirSecao(s) {
    const btn = $('btnCorrigirSecao');
    const faltam = s.itens.filter(i => i.tipo !== 'livre' && !temResposta(i)).length;
    if (faltam && !btn.dataset.confirmado) {
      $('placarSecao').textContent = `Faltam ${faltam} resposta(s). Clique de novo para corrigir mesmo assim.`;
      btn.dataset.confirmado = '1';
      return;
    }
    btn.disabled = true;
    try {
      const res = await fetch(`/api/exercicios/${encodeURIComponent(slug)}/corrigir`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ respostas, secao: s.id })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.msg || 'Erro ao corrigir.');
      Object.assign(feedback, data.resultado.itens);
      s.itens.forEach(mostrarFeedback);
      const r = data.resultado.porSecao[s.id];
      $('placarSecao').textContent = r.total ? `${r.pontos} de ${r.total} (${Math.round(r.pontos / r.total * 100)}%)` : '';
      if (r.total && r.pontos === r.total) feitas.add(s.id);
      renderAbas();
    } catch (e) {
      $('placarSecao').textContent = e.message;
    } finally { btn.disabled = false; delete btn.dataset.confirmado; }
  }

  // áudio da parte (prova): limita o número de reproduções
  function ligarAudioSecao(s) {
    const a = $('audioSecao');
    if (!a) return;
    const max = s.maxReproducoes || 0;
    const info = () => { if (max) $('audioInfo').textContent = `Reproduções: ${reproducoes[s.id] || 0} de ${max}.`; };
    info();
    a.addEventListener('play', () => {
      if (max && (reproducoes[s.id] || 0) >= max) { a.pause(); a.currentTime = 0; $('audioInfo').textContent = 'Você já ouviu o número máximo de vezes.'; return; }
      if (a.currentTime < 0.5) { reproducoes[s.id] = (reproducoes[s.id] || 0) + 1; info(); }
    });
  }

  function fmtTempo(seg) { seg = Math.max(0, seg); return String(Math.floor(seg / 60)).padStart(2, '0') + ':' + String(seg % 60).padStart(2, '0'); }
  function iniciarCronometro(s) {
    clearInterval(tickCronometro);
    if (!s.tempoMin) return;
    tickCronometro = setInterval(() => {
      cronometros[s.id]--;
      const el = $('cron');
      if (!el) return clearInterval(tickCronometro);
      el.textContent = fmtTempo(cronometros[s.id]);
      if (cronometros[s.id] <= 0) { el.classList.add('esgotado'); el.textContent = 'Tempo esgotado'; clearInterval(tickCronometro); }
    }, 1000);
  }

  // ---------- entrega final ----------
  async function concluir() {
    const secReg = def.secoes.find(s => s.tipo === 'regulamento');
    if (secReg && confirmacoes.size < secReg.regras.length) {
      irPara(def.secoes.indexOf(secReg));
      $('msgRegras').className = 'ex-msg erro';
      $('msgRegras').textContent = 'Confirme todas as regras antes de concluir.';
      return;
    }
    const faltam = totalItens() - respondidos();
    abrirModal('Concluir exercício', `
      <p>${faltam ? `Ainda há <strong>${faltam}</strong> questão(ões) sem resposta. ` : 'Todas as questões foram respondidas. '}
      ${deverId ? 'Ao confirmar, sua nota é registrada no dever de casa.' : 'Ao confirmar, você vê a correção completa.'}</p>
      <div class="ex-modal-acoes"><button class="ex-btn" id="btnConfirmarEntrega">${deverId ? 'Entregar' : 'Ver correção'}</button></div>
      <p class="ex-msg" id="msgEntrega"></p>`, false);
    $('btnConfirmarEntrega').addEventListener('click', entregar);
  }

  async function entregar() {
    const btn = $('btnConfirmarEntrega');
    btn.disabled = true;
    try {
      const corpo = { respostas, confirmacoes: [...confirmacoes] };
      if (deverId && atividadeIndex != null) { corpo.deverId = deverId; corpo.atividadeIndex = atividadeIndex; }
      const res = await fetch(`/api/exercicios/${encodeURIComponent(slug)}/corrigir`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(corpo)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.msg || 'Erro ao enviar.');
      Object.assign(feedback, data.resultado.itens);
      def.secoes.forEach(s => { if (s.itens) feitas.add(s.id); });
      renderAbas(); renderSecao();
      mostrarResultado(data);
      if (data.registrado) avisarFora({ entregue: true, percentual: data.resultado.percentual });
    } catch (e) {
      $('msgEntrega').className = 'ex-msg erro'; $('msgEntrega').textContent = e.message; btn.disabled = false;
    }
  }

  function mostrarResultado(data) {
    const r = data.resultado;
    const secoes = Object.values(r.porSecao).filter(s => s.total);
    abrirModal('Resultado', `
      ${r.total ? `<div class="ex-nota-grande">${r.percentual}%</div><div>${r.pontos} de ${r.total} pontos nas partes corrigidas automaticamente.</div>` : '<p>Exercício concluído.</p>'}
      ${secoes.length ? `<ul class="ex-modal-lista">${secoes.map(s => `<li><span>${esc(s.titulo)}</span><strong>${s.pontos}/${s.total}</strong></li>`).join('')}</ul>` : ''}
      ${r.livres.length ? '<p>As respostas abertas foram enviadas para o professor corrigir.</p>' : ''}
      ${data.registrado ? '<p class="ex-msg ok">✓ Entregue no seu dever de casa.</p>' : ''}
      <p style="font-size:0.85rem; color:var(--text-muted); margin-top:8px;">Feche esta janela para rever cada questão com a correção e a explicação.</p>`, !!data.registrado);
  }

  function abrirModal(titulo, html, mostrarVoltar) {
    $('exModalTitulo').textContent = titulo;
    $('exModalCorpo').innerHTML = html;
    $('btnVoltarDever').hidden = !mostrarVoltar || embutido;
    $('exModal').hidden = false;
    avisarFora({ modal: true });
  }
  $('btnFecharModal').addEventListener('click', () => { $('exModal').hidden = true; });
  $('exModal').addEventListener('click', e => { if (e.target.id === 'exModal') $('exModal').hidden = true; });

  $('btnAnterior').addEventListener('click', () => irPara(atual - 1));
  $('btnProxima').addEventListener('click', () => {
    if (atual === def.secoes.length - 1) { feitas.add(def.secoes[atual].id); renderAbas(); concluir(); }
    else irPara(atual + 1);
  });

  // ---------- início ----------
  async function iniciar() {
    if (!slug) { $('exConteudo').innerHTML = '<p>Exercício não informado.</p>'; return; }
    try {
      const res = await fetch('/api/exercicios/' + encodeURIComponent(slug), { headers: { Authorization: 'Bearer ' + token } });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).msg || 'Exercício não encontrado.');
      def = await res.json();
    } catch (e) {
      $('exCabecalho').innerHTML = `<p>${esc(e.message)}</p>`;
      $('exConteudo').innerHTML = '';
      return;
    }
    lerRascunho();
    if (deverId) $('btnVoltarDever').href = 'meus-deveres.html';
    renderCabecalho();
    renderAbas();
    renderSecao();
  }
  document.addEventListener('appshell:ready', iniciar, { once: true });
})();
