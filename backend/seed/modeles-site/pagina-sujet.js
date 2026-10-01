//@@ renderizarModelo
// Página do sujet, na ordem de estudo: título → « Faire ce sujet » (cronômetro, correção, escrita
// ou gravação, professor ao vivo) → Sujet (enunciado, documentos, dossiê de leitura com imagem)
// → Pistes pour compléter (dicas + trame, ao clicar) → Réponse modèle (ao clicar, legenda ao lado).
function renderizarModelo(tache, m, origem) {
  origem = origem || { tipo: 'liste' };
  if (origem.tipo === 'atelier') origem.tipo = 'modeles-page';
  var pagPart = origem.tipo === 'dictee-page' || origem.tipo === 'modeles-page';
  var noAtelier = pagPart && !!m.atelier;
  var itens = noAtelier ? (B.atelier || []) : listaNav(tache);
  var pos = -1;
  itens.forEach(function (x, i) { if (x.id === m.id) pos = i; });
  estado.origem = origem;
  var info = TACHES[tache], e = eixo(m.e), oral = tache.indexOf('ET') !== 0;
  var sorteio = origem.tipo === 'sorteio';

  var partes = [PARTE_ACCUEIL()];
  if (origem.tipo === 'dictee-page') partes.push({ rotulo: 'Dictée', fn: abrirDicteePage });
  else if (origem.tipo === 'modeles-page') partes.push({ rotulo: 'Modèles de production écrite', fn: abrirModelesEcrits });
  else if (origem.tipo === 'carnet') partes.push({ rotulo: 'Mon espace', fn: abrirCarnet });
  else if (origem.tipo === 'devoir') partes.push({ rotulo: 'Mon espace', fn: abrirTarefas });
  else if (origem.tipo === 'eixo' || (sorteio && origem.de === 'eixo')) partes.push({ rotulo: e.icone + ' ' + e.nome, fn: function () { abrirEixo(m.e); } });
  else partes.push({ rotulo: nomeTache(tache), fn: function () { abrirLista(tache, true); } });
  partes.push({ rotulo: m.titre });

  // Peças do script, montadas e redistribuídas nos blocos da nova ordem.
  var corpo = tache === 'T2' ? corpoDialogo(m) : (tache === 'T3' || tache === 'T1') ? corpoT3(m, tache) : corpoEscrito(m, tache);
  var tmp = document.createElement('div');
  tmp.innerHTML = corpo;
  var tirar = function (sel) { var el = tmp.querySelector(sel); if (el) el.remove(); return el ? el.outerHTML : ''; };
  var htmlCrono = tirar('.crono-bloco'), htmlContexto = tirar('.contexto'), htmlGravador = tirar('.gravador-livre');
  var htmlDocsModelo = '';
  Array.prototype.slice.call(tmp.querySelectorAll('.bloco')).forEach(function (b) {
    if (b.querySelector('.docs') && !b.classList.contains('modelo-conteudo')) { htmlDocsModelo = b.querySelector('.docs').outerHTML; b.remove(); }
  });
  Array.prototype.slice.call(tmp.children).forEach(function (p) { if (p.tagName === 'P' && /tombé/.test(p.textContent)) p.remove(); });
  var htmlModelo = tmp.innerHTML;
  var lat = document.createElement('div');
  lat.innerHTML = lateral(m, tache);
  var blocosLat = lat.querySelectorAll('.lateral > .bloco');
  var htmlLegenda = blocosLat[0] ? blocosLat[0].outerHTML : '', htmlVocab = '', htmlTrame = '';
  for (var bi = 1; bi < blocosLat.length; bi++) { if (blocosLat[bi].querySelector('.trame-lista')) htmlTrame = blocosLat[bi].outerHTML; else htmlVocab += blocosLat[bi].outerHTML; }

  var html = trilha(partes);
  if (sorteio) {
    html += '<div class="faixa-sorteio"><span>Sujet tiré au sort' + (origem.eixo ? ' · ' + esc(eixo(origem.eixo).nome) : '') +
      (origem.reiniciou ? ' · tous les sujets avaient déjà été tirés, on recommence' : '') + '</span>' +
      '<button class="botao-sorteio" type="button" data-nav="sortear">Un autre sujet</button></div>';
  }
  html += '<div class="modele-grade modele-raiz tm-pagina" id="modele-raiz"><div class="coluna-principal">';
  html += '<header class="tm-cab"><div class="etiquetas"><span class="etiqueta">' + nomeTache(tache) + ' · ' + info.sous + '</span>' +
    '<span class="etiqueta eixo" style="--cor:' + e.cor + '">' + e.icone + ' ' + esc(e.nome) + '</span>' +
    (m.reg ? '<span class="etiqueta">' + (m.reg === 'tu' ? 'Registre familier (tu)' : 'Registre formel (vous)') + '</span>' : '') +
    (m.f > 1 ? '<span class="etiqueta">tombé ' + m.f + ' fois</span>' : '') + '</div>' +
    '<h1 class="modele-titulo">' + esc(m.titre) + '</h1>' +
    '<div class="tm-acoes"><button class="tm-fazer-bt" type="button" id="tm-fazer-bt"><span class="tm-play">▶</span><span><b>Faire ce sujet</b><small>Lance le chronomètre et ouvre ' + (oral ? 'l\'enregistrement' : 'la feuille de réponse') + '</small></span></button>' +
    '<button class="botao-cahier' + (CARNET_IDS[m.id] ? ' marcado' : '') + '" type="button" id="bt-carnet">' +
    (CARNET_IDS[m.id] ? 'Enregistré dans mon cahier <small>toucher pour retirer</small>' : 'Enregistrer dans mon cahier <small>pour le réviser plus tard (dictée, oral, écrit)</small>') + '</button>' +
    (B.professor ? '<button class="ferramenta" type="button" id="bt-devoir">Proposer en devoir</button><button class="ferramenta" type="button" id="bt-partilhar">Partager ce modèle</button>' : '') + '</div>' +
    (B.professor ? '<div id="painel-partilha" hidden></div>' : '') + '</header>';
  if (origem && origem.tipo === 'devoir') {
    var dv = origem.devoir;
    html += '<div class="faixa-devoir"><div><b>Devoir : ' + esc(dv.tipoNome) + '</b>' + (dv.mensagem ? '<span>« ' + esc(dv.mensagem) + ' »</span>' : '') + '</div>' +
      (dv.feito ? '<em>✓ Fait' + (dv.score !== '' ? ' · ' + dv.score + '/' + dv.total : '') + '</em>' : dv.tipo === 'dictee' ? '<em>Terminez la dictée : le devoir sera validé automatiquement.</em>' : '<button class="ferramenta destaque" type="button" id="bt-devoir-feito">✓ J\'ai terminé</button>') + '</div>';
  }

  // Faire ce sujet (aparece ao clicar no botão do topo)
  html += '<section class="tm-bloco tm-fazer" id="tm-fazer" hidden><div class="tm-bloco-cab"><span class="tm-num">✎</span><div><h2>Faire ce sujet</h2><p>Choisissez qui corrigera votre production, puis ' + (oral ? 'enregistrez-vous' : 'écrivez') + '. Vous pouvez ouvrir les pistes et le modèle en même temps.</p></div></div>' +
    htmlCrono + htmlEscolhaFazer(oral) + '<div id="tm-aovivo" hidden></div>' +
    (oral ? htmlGravador : '<div class="tm-escrita">' + editorHtml(tache) + '<div class="tm-escrita-acoes"><button class="botao-principal" type="button" id="tm-enviar">Faire corriger</button><span class="aviso" id="tm-enviar-st"></span></div><div class="ia-resultado" id="tm-ia-res"></div></div>') +
    '</section>';

  // 1. Sujet
  html += '<section class="tm-bloco tm-sujet"><div class="tm-bloco-cab"><span class="tm-num">1</span><div><h2>' + (tache === 'T3' || tache === 'T1' ? 'Sujet' : 'Consigne') + '</h2><p>Lisez le sujet et les documents pour bien comprendre le thème avant de commencer.</p></div></div>' +
    (m.c ? '<div class="bloco consigne"><p>' + esc(m.c) + '</p></div>' : '') +
    (m.d1 ? '<div class="docs"><div class="doc"><h4>Document 1</h4><p>' + destacar(m.d1, m.k) + '</p></div><div class="doc"><h4>Document 2</h4><p>' + destacar(m.d2, m.k) + '</p></div></div>' : htmlDocsModelo) +
    '<div class="tm-dossier" id="tm-dossier"><p class="aviso">Chargement des lectures sur le thème…</p></div></section>';
  if (sorteio) html += '<div class="bloco revelar"><p>Préparez-vous avec la consigne et le chronomètre, puis découvrez le modèle.</p><button class="botao-principal" type="button" data-nav="revelar">Voir le modèle</button></div>';

  // 2. Pistes (dicas) + trame, ao clicar
  var pistas = '';
  if (m.guia && m.pistes && (m.pistes.pour.length || m.pistes.docs.length)) pistas += '<div class="bloco guia-pistes">' +
    (m.pistes.docs.length ? '<p><b>Dans les documents :</b> ' + m.pistes.docs.map(function (d) { return '« ' + esc(d) + ' »'; }).join(' · ') + '</p>' : '') +
    (m.pistes.pour.length ? '<p><b>Arguments possibles pour :</b> ' + m.pistes.pour.map(esc).join(' · ') + '</p>' : '') +
    (m.pistes.contre.length ? '<p><b>Arguments possibles contre :</b> ' + m.pistes.contre.map(esc).join(' · ') + '</p>' : '') + '</div>';
  else if (e.argumentsPour) pistas += '<div class="bloco guia-pistes"><p><b>Arguments possibles pour :</b> ' + e.argumentsPour.map(esc).join(' · ') + '</p>' +
    '<p><b>Arguments possibles contre :</b> ' + (e.argumentsContre || []).map(esc).join(' · ') + '</p></div>';
  html += '<details class="tm-bloco tm-dicas" id="tm-dicas"><summary class="tm-bloco-cab"><span class="tm-num">2</span><div><h2>Pistes pour compléter</h2><p>Idées, contexte, vocabulaire clé et la trame de la tâche.</p></div><span class="tm-seta" aria-hidden="true"></span></summary>' +
    '<div class="tm-dicas-corpo">' + pistas + htmlContexto + htmlVocab + htmlTrame + '</div></details>';

  // 3. Réponse modèle (+ légende ao lado), ao clicar
  html += '<details class="tm-bloco tm-modele" id="tm-modele"' + (sorteio ? ' data-sorteio="1"' : '') + '><summary class="tm-bloco-cab"><span class="tm-num">3</span><div><h2>Réponse modèle</h2><p>' +
    (oral ? 'Le modèle avec l\'audio, à écouter, masquer et répéter.' : 'La production modèle commentée, à lire, écouter et réécrire.') + '</p></div><span class="tm-seta" aria-hidden="true"></span></summary>';
  if (m.guia) html += '<div class="guia-faixa"><b>Modèle-guide</b><span>Construit avec la trame et les formules Français na Mira pour ce sujet : complétez les parties entre [crochets] avec vos idées.' +
    (B.professor ? ' La version entièrement rédigée apparaîtra ici dès qu\'elle sera générée (Espace professeur → Modèles de tous les sujets).' : '') + '</span>' +
    (B.professor ? '<button class="ferramenta destaque" type="button" id="bt-redigir-ia">Rédiger la version complète</button>' : '') + '</div>';
  else if (m.gerado) html += '<p class="aviso selo-gerado">Modèle rédigé par l\'IA selon la méthode Français na Mira</p>';
  html += '<div class="tm-modele-grade"><div class="tm-modele-corpo">' + htmlModelo + '</div><aside class="lateral tm-legenda">' + htmlLegenda + '</aside></div></details>';

  html += navegacaoRodape(pos, itens.length);
  html += '</div>' + painelDictee() + (/^ET/.test(tache) ? painelReescrita(info, tache, m) : '') + '</div>';

  var tela = $('tela-modele');
  tela.innerHTML = html;
  ligarTrilha(tela, partes);
  var raiz = $('modele-raiz');
  ligarDicas(raiz);
  if (!B.professor) protegerConteudo(raiz);
  $('bt-carnet').addEventListener('click', function () {
    var bt = this; bt.disabled = true;
    google.script.run.withSuccessHandler(function (marcado) {
      bt.disabled = false;
      if (marcado) CARNET_IDS[m.id] = { tache: tache, id: m.id, titre: m.titre, e: m.e }; else delete CARNET_IDS[m.id];
      bt.classList.toggle('marcado', marcado);
      bt.innerHTML = marcado ? 'Enregistré dans mon cahier <small>toucher pour retirer</small>' : 'Enregistrer dans mon cahier <small>pour le réviser plus tard (dictée, oral, écrit)</small>';
      avisar({ titulo: marcado ? 'Enregistré dans votre cahier' : 'Retiré du cahier', texto: m.titre, icone: '', som: false, duracao: 6, acao: marcado ? { rotulo: 'Ouvrir mon cahier', fn: abrirCarnet } : null });
    }).withFailureHandler(function () { bt.disabled = false; }).alternarCarnet(EMAIL, { tache: tache, id: m.id, titre: m.titre, e: m.e });
  });
  if ($('bt-redigir-ia')) $('bt-redigir-ia').addEventListener('click', function () {
    var bt = this; bt.disabled = true; bt.textContent = 'Rédaction… (30 à 60 s)';
    google.script.run.withSuccessHandler(function (m2) { renderizarModelo(tache, m2, origem); })
      .withFailureHandler(function (er) { bt.disabled = false; bt.textContent = 'Rédiger la version complète'; avisar({ titulo: 'Impossible de rédiger', texto: er.message || er, icone: '', som: false, duracao: 12 }); })
      .gerarModeloIA(EMAIL, tache, m.id);
  });
  if ($('bt-devoir')) $('bt-devoir').addEventListener('click', function () { PREFILL_DEVOIR = { tache: tache, id: m.id }; abrirProf('devoirs'); });
  if ($('bt-partilhar')) $('bt-partilhar').addEventListener('click', function () {
    var p = $('painel-partilha'); p.hidden = !p.hidden;
    if (!p.hidden) painelPartilha(p, { id: m.id, tipo: tache.indexOf('ET') === 0 ? 'ambos' : 'dictee', titre: m.titre });
  });
  estado.devoirAtual = origem && origem.tipo === 'devoir' && !origem.devoir.feito ? origem.devoir : null;
  if ($('bt-devoir-feito')) $('bt-devoir-feito').addEventListener('click', function () {
    var bt = this; bt.disabled = true;
    google.script.run.withSuccessHandler(function () { bt.outerHTML = '<em>✓ Fait</em>'; origem.devoir.feito = true; avisar({ titulo: 'Devoir terminé', texto: 'Bravo !', icone: '', som: false, duracao: 5 }); })
      .concluirDevoir(EMAIL, origem.devoir.id, '', '');
  });
  raiz.querySelectorAll('.legenda-item').forEach(function (b) {
    b.addEventListener('click', function () {
      var ativo = b.getAttribute('aria-pressed') === 'true';
      b.setAttribute('aria-pressed', String(!ativo));
      raiz.classList.toggle('off-' + b.dataset.cat, ativo);
    });
  });
  var voltar = partes[partes.length - 2].fn;
  tela.querySelectorAll('[data-nav]').forEach(function (b) {
    b.addEventListener('click', function () {
      var acao = b.dataset.nav;
      if (acao === 'voltar') voltar();
      else if (acao === 'accueil') irAccueil();
      else if (acao === 'topo') window.scrollTo({ top: 0, behavior: 'smooth' });
      else if (acao === 'sortear' && noAtelier) { var outro = itens[Math.floor(Math.random() * itens.length)]; renderizarModelo(outro.tache, outro, { tipo: 'atelier', foco: origem.foco }); }
      else if (acao === 'sortear') sortear(tache, origem.eixo || (origem.tipo === 'eixo' ? origem.eixo : estado.filtroEixo), origem.de || origem.tipo, origem.busca);
      else if (acao === 'revelar') { $('tm-modele').open = true; b.closest('.revelar').hidden = true; }
      else if (acao === 'ant' || acao === 'prox') {
        var alvoNav = itens[pos + (acao === 'prox' ? 1 : -1)];
        if (alvoNav && noAtelier) renderizarModelo(alvoNav.tache, alvoNav, { tipo: 'atelier', foco: origem.foco });
        else if (alvoNav) abrirModelo(tache, alvoNav.id, origem.tipo === 'sorteio' ? { tipo: 'liste' } : origem);
      }
    });
  });

  if (tache === 'T2') ligarDialogo(m);
  else if (tache === 'T3' || tache === 'T1') ligarT3(m, tache);
  else ligarEscrito(m, tache);
  if (oral) ligarGravadorLivre(raiz, tache, m);
  ligarFazer(raiz, tache, m, oral);
  carregarDossier($('tm-dossier'), tache, m);
  // Ditado e reescrita leem o modelo: abrir um deles abre também a Réponse modèle.
  raiz.querySelectorAll('[data-abrir-dictee], [data-abrir-reescrita]').forEach(function (b) { b.addEventListener('click', function () { $('tm-modele').open = true; }, true); });
  mostrar('tela-modele');
  // Devoir / carnet: vai direto para a atividade pedida.
  var foco = origem && (origem.foco || (origem.tipo === 'devoir' && origem.devoir.tipo));
  if (foco === 'dictee') { $('tm-modele').open = true; var bd = raiz.querySelector('[data-abrir-dictee]'); if (bd) bd.click(); }
  else if (foco === 'oral' || foco === 'ecrit') $('tm-fazer-bt').click();
  else if (foco === 'etude' || (origem && origem.tipo === 'modeles-page')) $('tm-modele').open = true;
}
