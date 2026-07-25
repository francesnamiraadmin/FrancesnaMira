// =====================================================================
// QUESTÕES INTERATIVAS — vocabulário nível TCF (100 termos, 10 categorias:
// vida administrativa, vida profissional, educação/formação, cotidiano
// avançado, atualidades/mídia, ambiente urbano, consumo, saúde/bem-estar,
// expressões TCF, conectores TCF). Reaproveita window.QI_C / window.QI_DSL
// (carregar depois de questoesInterativasDados.js).
// =====================================================================
(function () {
var C = window.QI_C;
var S = window.QI_DSL.S, R = window.QI_DSL.R, W = window.QI_DSL.W, D = window.QI_DSL.D,
    CI = window.QI_DSL.CI, EL = window.QI_DSL.EL, T = window.QI_DSL.T, L = window.QI_DSL.L,
    P = window.QI_DSL.P, PES = window.QI_DSL.PES;

function PESSOA(cx, cy, corRoupa, corCabelo, longo, extra) {
  var cabelo = longo
    ? P('M' + (cx - 7) + ' ' + (cy - 16) + 'c-2 8 0 13 0 13h3v-9l4-3 4 3v9h3s2-5 0-13Z', corCabelo, C.ti, 1.4)
    : P('M' + (cx - 7) + ' ' + (cy - 18) + 'a7 7 0 0 1 14 0Z', corCabelo, C.ti, 1.4);
  return cabelo + CI(cx, cy - 16, 7, C.am) +
    P('M' + (cx - 10) + ' ' + (cy + 18) + 'c-1-13 4-20 10-20s11 7 10 20Z', corRoupa, C.ti, 2) +
    (extra || '');
}
function BALAO(cor, conteudo) {
  return P('M8 12h48a6 6 0 0 1 6 6v20a6 6 0 0 1-6 6H30l-12 12v-12H14a6 6 0 0 1-6-6V18a6 6 0 0 1 6-6Z', cor, C.ti, 2) +
    (conteudo || '');
}
/** documento genérico com linhas de texto */
function DOC(cor, linhas) {
  return R(14, 6, 36, 52, C.br, 2) + L(20, 16, 44, 16, 1.6, cor || C.ti) +
    (linhas !== false ? L(20, 24, 44, 24, 1.4, C.cz) + L(20, 30, 44, 30, 1.4, C.cz) + L(20, 36, 36, 36, 1.4, C.cz) : '');
}

var ICONES_TCF = {

/* --- VIE ADMINISTRATIVE --- */
"la carte d'identité": S(R(8, 18, 48, 30, C.az, 3) + CI(20, 33, 7, C.am) + L(32, 26, 48, 26, 1.6, C.br) + L(32, 32, 48, 32, 1.6, C.br) + L(32, 38, 44, 38, 1.6, C.br)),
'le formulaire': S(DOC(C.am) + CI(20, 44, 1.6, C.vm, 0) + L(24, 44, 40, 44, 1.4, C.cz) + CI(20, 50, 1.6, C.vm, 0) + L(24, 50, 36, 50, 1.4, C.cz)),
'la démarche administrative': S(CI(16, 32, 6, C.az) + P('M22 32h8', 'none', C.ti, 2) + CI(32, 32, 6, C.am) + P('M38 32h8', 'none', C.ti, 2) + CI(48, 32, 6, C.vd)),
'le guichet': S(R(8, 30, 48, 20, C.cz, 2) + R(8, 14, 48, 16, C.br, 2) + R(28, 18, 8, 8, C.ti, 0) + L(4, 50, 60, 50, 2.4, C.mr)),
'la préfecture': S(R(10, 26, 44, 26, C.br) + T(8, 26, 56, 12, C.azc) + D(28, 36, 8, 16, C.mr) + W(16, 32, 7, 8) + W(41, 32, 7, 8) + L(32, 12, 32, 4, 1.8, C.ti) + R(29, 2, 6, 4, C.vm, 0)),
'le certificat': S(R(10, 10, 44, 38, C.br, 2) + L(16, 18, 48, 18, 1.6) + L(16, 26, 40, 26, 1.4, C.cz) + L(16, 32, 44, 32, 1.4, C.cz) + CI(32, 50, 8, C.am, 1.6) + P('M27 50l3 4 6-7', 'none', C.vd, 2)),
'la signature': S(R(10, 6, 44, 44, C.br, 2) + P('M14 40c4 4 8-8 12-4s4 8 8 4 4-8 8-4 6 6 10 2', 'none', C.az, 2.4)),
'le justificatif de domicile': S(R(10, 6, 44, 48, C.br, 2) + T(8, 24, 30, 12, C.vm) + R(12, 24, 16, 12, C.azc, 1) + L(34, 20, 48, 20, 1.4, C.cz) + L(34, 26, 48, 26, 1.4, C.cz) + L(34, 32, 44, 32, 1.4, C.cz)),
'la demande': S(BALAO(C.am, CI(32, 24, 3, C.ti, 0)) + P('M20 28h20', 'none', C.ti, 1.4, '2 2')),
'le rendez-vous': S(R(10, 12, 44, 40, C.br, 2) + L(10, 22, 54, 22, 1.6) + L(20, 6, 20, 16, 2, C.vm) + L(44, 6, 44, 16, 2, C.vm) + CI(32, 34, 6, C.am, 1.6)),

/* --- VIE PROFESSIONNELLE --- */
'le CV': S(DOC(C.az) + CI(20, 44, 4, C.am, 1.4) + L(26, 42, 40, 42, 1.4, C.cz) + L(26, 46, 36, 46, 1.4, C.cz)),
'la lettre de motivation': S(R(8, 16, 48, 34, C.br, 2) + L(8, 16, 32, 34, 1.6) + L(56, 16, 32, 34, 1.6) + L(14, 44, 50, 44, 1.4, C.cz)),
"l'entretien d'embauche": S(PESSOA(18, 42, C.tis, C.ti, false) + PESSOA(46, 42, C.az, C.mr, true) + P('M22 14h20a4 4 0 0 1 4 4v6a4 4 0 0 1-4 4H30l-4 4v-4h-4a4 4 0 0 1-4-4v-6a4 4 0 0 1 4-4Z', C.am, C.ti, 1.6)),
'le contrat de travail': S(R(10, 6, 44, 48, C.br, 2) + L(16, 16, 48, 16, 1.6) + L(16, 24, 48, 24, 1.4, C.cz) + L(16, 30, 40, 30, 1.4, C.cz) + P('M16 44c4 3 8-6 12-2s4 6 8 2', 'none', C.az, 2)),
'le stage': S(PESSOA(24, 40, C.am, C.ti, false) + R(38, 24, 18, 22, C.br, 2) + L(42, 30, 52, 30, 1.4, C.cz) + L(42, 36, 52, 36, 1.4, C.cz)),
'la candidature': S(DOC(C.vd) + P('M42 44l4 4 8-8', 'none', C.vd, 2.4)),
'le poste': S(R(20, 30, 24, 20, C.br, 2) + T(18, 30, 46, 16, C.az) + CI(32, 40, 4, C.am, 1.4)),
'les horaires de travail': S('<circle cx="32" cy="32" r="22" fill="' + C.am + '" stroke="' + C.ti + '" stroke-width="2.4"/>' + L(32, 32, 32, 18, 2.4) + L(32, 32, 42, 36, 2.4) + R(24, 4, 16, 6, C.ti, 1)),
'la promotion': S(P('M8 46h12v-8h12v-10h12V16h12v-8', 'none', C.vd, 4) + P('M50 8l-6 0 0 6', 'none', C.vd, 4) + CI(50, 8, 3, C.am, 1.4)),
'la démission': S(PESSOA(32, 34, C.tis, C.ti, false) + P('M46 46l10 10M56 46l-10 10', 'none', C.vm, 2.6)),

/* --- ÉDUCATION ET FORMATION --- */
"l'inscription": S(DOC(C.az) + CI(44, 44, 8, C.vd) + P('M40 44l3 3 6-6', 'none', C.br, 2)),
'le dossier scolaire': S(R(10, 14, 40, 36, C.amf, 2) + R(14, 8, 32, 10, C.am, 2) + L(16, 26, 44, 26, 1.4, C.br) + L(16, 32, 38, 32, 1.4, C.br)),
"la bourse d'études": S(P('M14 26h36l-4 26H18Z', C.vm, C.ti, 2) + P('M22 26c0-8 4-14 10-14s10 6 10 14', 'none', C.ti, 2) + CI(32, 38, 6, C.am, 1.4) + L(32, 34, 32, 42, 1.4, C.ti)),
'le cursus': S(CI(12, 32, 6, C.az) + CI(30, 32, 6, C.am) + CI(48, 32, 6, C.vd) + L(18, 32, 24, 32, 2, C.ti) + L(36, 32, 42, 32, 2, C.ti) + P('M46 26l4 4-4 4', 'none', C.ti, 2)),
'la moyenne': S(L(10, 46, 10, 20, 3, C.az) + L(26, 46, 26, 10, 3, C.am) + L(42, 46, 42, 28, 3, C.vd) + L(4, 24, 54, 24, 2, C.vm, '3 3')),
"l'examen": S(DOC(C.vm) + CI(20, 44, 2, C.ti, 0) + L(24, 44, 40, 44, 1.4, C.cz) + CI(20, 50, 2, C.ti, 0) + L(24, 50, 32, 50, 1.4, C.cz)),
'le redoublement': S(P('M46 18a18 18 0 1 0 4 20', 'none', C.vm, 3) + P('M52 12v10h-10', 'none', C.vm, 3) + CI(20, 32, 8, C.cz, 1.6)),
'le tuteur': S(PESSOA(20, 40, C.tis, C.cz, false) + PESSOA(44, 42, C.am, C.ti, false, '', ) + P('M28 34h8', 'none', C.ti, 1.6, '2 2')),
"l'orientation": S(CI(32, 32, 22, C.br, 2) + P('M32 18l6 12-6 4-6-4Z', C.vm, C.ti, 1.6) + P('M32 46l-6-12 6-4 6 4Z', C.cz, C.ti, 1.6)),
'le concours': S(T(16, 34, 48, 34, C.mr) + CI(32, 18, 8, C.am, 1.6) + P('M27 18l3 4 6-6', 'none', C.ti, 1.6) + CI(11, 44, 5, C.az, 1.4) + CI(53, 44, 5, C.az, 1.4)),

/* --- VIE QUOTIDIENNE AVANCÉE --- */
'le rendez-vous médical': S(R(10, 12, 44, 40, C.br, 2) + L(10, 22, 54, 22, 1.6) + CI(32, 34, 8, C.vm) + L(30, 30, 30, 38, 1.6, C.br) + L(27, 34, 33, 34, 1.6, C.br)),
"la file d'attente": S(PESSOA(12, 44, C.az, C.ti, false) + PESSOA(26, 44, C.am, C.mr, true) + PESSOA(40, 44, C.vd, C.ti, false) + PESSOA(54, 44, C.rx, C.mr, true)),
'la réclamation': S(BALAO(C.vm) + P('M30 20v10M30 34v2', 'none', C.br, 2.6)),
'le remboursement': S(CI(32, 32, 18, C.vd, 0) + P('M26 24v16M38 24v16', 'none', C.br, 2.6) + P('M40 40l6-6-6-6', 'none', C.br, 2.6)),
'la facture': S(R(14, 6, 36, 48, C.br, 2) + L(20, 16, 44, 16, 1.6) + L(20, 24, 44, 24, 1.4, C.cz) + L(20, 30, 32, 30, 1.4, C.cz) + CI(40, 44, 8, C.am, 1.6) + P('M35 44l3 3 6-6', 'none', C.vd, 1.8)),
"l'abonnement": S(CI(32, 32, 20, C.az, 0) + P('M24 32a8 8 0 0 1 16 0M24 32a8 8 0 0 0 16 0', 'none', C.br, 2.6) + P('M40 24l4-2v4', 'none', C.br, 2)),
'la panne': S(R(20, 20, 24, 24, C.cz, 3) + P('M32 26l-4 8h5l-3 6 8-9h-5Z', C.am, C.ti, 1.2) + P('M14 14l6 6M50 14l-6 6', 'none', C.vm, 2.4)),
'la réparation': S(P('M42 14a10 10 0 0 0-14 12L14 40l6 6 14-14a10 10 0 0 0 12-14l-6 6-6-2-2-6Z', C.cz, C.ti, 2)),
'le déménagement': S(R(10, 30, 30, 20, C.mr, 2) + T(8, 30, 42, 18, C.vm) + R(42, 34, 14, 16, C.am, 2) + L(2, 50, 62, 50, 2.4, C.cz)),
'le voisinage': S(R(6, 30, 20, 20, C.br, 2) + T(4, 30, 28, 18, C.vm) + R(34, 26, 20, 24, C.azc, 2) + T(32, 26, 56, 12, C.am) + L(2, 50, 62, 50, 2.4, C.cz)),

/* --- ACTUALITÉS ET MÉDIAS --- */
'le journal télévisé': S(R(8, 12, 48, 30, C.ti, 3) + R(13, 17, 38, 20, C.az, 1) + PES(32, 30, 0.7, C.br) + R(26, 42, 12, 4, C.cz)),
"la chaîne d'information": S(R(8, 16, 48, 32, C.ti, 3) + CI(32, 32, 12, C.vm) + P('M32 26v6l4 4', 'none', C.br, 2)),
'le sondage': S(R(10, 40, 10, 14, C.az) + R(24, 30, 10, 24, C.am) + R(38, 20, 10, 34, C.vd) + L(2, 54, 62, 54, 2.4, C.cz)),
'la statistique': S(P('M8 46 20 30l10 8 18-24', 'none', C.vd, 3.2) + CI(20, 30, 2.4, C.vd, 0) + CI(30, 38, 2.4, C.vd, 0) + CI(48, 14, 2.4, C.vd, 0)),
"l'événement": S(CI(32, 32, 6, C.am) + L(32, 8, 32, 14, 2.4, C.am) + L(32, 50, 32, 56, 2.4, C.am) + L(8, 32, 14, 32, 2.4, C.am) + L(50, 32, 56, 32, 2.4, C.am) + L(16, 16, 20, 20, 2.4, C.am) + L(48, 16, 44, 20, 2.4, C.am) + L(16, 48, 20, 44, 2.4, C.am) + L(48, 48, 44, 44, 2.4, C.am)),
'la tendance': S(P('M8 46 22 28l10 8 24-26', 'none', C.vm, 3.2) + P('M50 8h8v8', 'none', C.vm, 3.2)),
'le débat': S(BALAO(C.az) + '<circle cx="44" cy="40" r="14" fill="' + C.am + '" stroke="' + C.ti + '" stroke-width="2"/>'),
'la polémique': S(CI(32, 30, 18, C.vm, 0) + L(32, 18, 32, 34, 3.4, C.br) + CI(32, 40, 2, C.br, 0)),
'le communiqué': S(BALAO(C.am) + L(16, 22, 40, 22, 1.4, C.ti) + L(16, 28, 40, 28, 1.4, C.ti)),
'la conférence de presse': S(R(10, 30, 44, 20, C.br, 2) + PES(32, 34, 0.8, C.ti) + L(14, 20, 14, 30, 1.6, C.ti) + L(24, 14, 24, 30, 1.6, C.ti) + L(34, 18, 34, 30, 1.6, C.ti) + L(44, 12, 44, 30, 1.6, C.ti)),

/* --- ENVIRONNEMENT URBAIN --- */
"l'urbanisme": S(R(6, 24, 14, 32, C.azc) + R(22, 14, 12, 42, C.am) + R(36, 30, 12, 26, C.az) + R(50, 20, 10, 36, C.vd) + L(2, 56, 62, 56, 2.4, C.cz)),
'le plan de circulation': S(R(6, 6, 52, 52, C.br, 2) + L(6, 32, 58, 32, 1.6, C.cz) + L(32, 6, 32, 58, 1.6, C.cz) + P('M16 32l10-10M48 32l-10 10', 'none', C.vm, 2.4)),
'la rénovation urbaine': S(R(10, 24, 20, 26, C.cz, 2) + R(34, 18, 20, 32, C.am, 2) + P('M42 14l-6 6-6-6', 'none', C.vd, 2.2) + L(2, 50, 62, 50, 2.4, C.cz)),
'les travaux publics': S(R(10, 32, 44, 8, C.am) + P('M10 32h44M10 40h44', 'none', C.ti, 1.4) + P('M20 32V20l6-6h4l6 6v12', 'none', C.cz, 2) + T(20, 18, 30, 8, C.vm)),
'la nuisance': S(P('M10 26h9l12-11v34l-12-11h-9Z', C.am, C.ti, 2) + P('M38 22c4 5 4 15 0 20', 'none', C.vm, 2.6) + L(48, 20, 56, 12, 2.4, C.vm) + L(48, 44, 56, 52, 2.4, C.vm)),
"l'aménagement": S(R(8, 14, 48, 36, C.cz, 2) + L(8, 26, 56, 26, 1.4) + R(14, 30, 12, 14, C.vd, 1) + R(30, 30, 10, 14, C.am, 1) + P('M46 20l4-4 4 4', 'none', C.ti, 1.6)),
'la sécurité routière': S(P('M32 6l20 6v18c0 12-9 20-20 24-11-4-20-12-20-24V12Z', C.am, C.ti, 2) + CI(32, 28, 3, C.ti, 0) + R(29, 32, 6, 8, C.ti, 0)),
"l'accessibilité": S(CI(24, 16, 6, C.am) + P('M24 22l-4 12h8l-2 14 10-18h-8l2-8Z', 'none', C.ti, 1.6) + '<circle cx="40" cy="46" r="10" fill="none" stroke="' + C.az + '" stroke-width="3"/>'),
'le mobilier urbain': S(R(10, 30, 20, 6, C.mr, 1.5) + R(14, 36, 3, 16, C.mr, 1) + R(23, 36, 3, 16, C.mr, 1) + R(38, 16, 6, 36, C.ti, 1) + CI(41, 12, 4, C.am, 1.4)),
'la vidéosurveillance': S(R(14, 24, 24, 16, C.ti, 2) + CI(38, 32, 5, C.azc) + T(8, 24, 20, 16, C.mr) + L(38, 40, 38, 50, 1.6, C.mr) + P('M46 26l6-4M46 38l6 4', 'none', C.ti, 1.6)),

/* --- CONSOMMATION --- */
"le contrat d'abonnement": S(R(10, 6, 44, 48, C.br, 2) + L(16, 16, 48, 16, 1.6) + L(16, 24, 48, 24, 1.4, C.cz) + P('M16 44c4 3 8-6 12-2s4 6 8 2', 'none', C.az, 2) + CI(46, 44, 6, C.am, 1.4)),
'la garantie': S(P('M32 6l20 6v18c0 12-9 20-20 24-11-4-20-12-20-24V12Z', C.vd, C.ti, 2) + P('M24 30l6 6 12-12', 'none', C.br, 3.4)),
'le service après-vente': S(CI(24, 32, 12, C.am, 1.6) + P('M24 24v-4M24 44v-4M16 32h-4M44 32h-4', 'none', C.am, 2) + '<circle cx="44" cy="44" r="10" fill="' + C.az + '" stroke="' + C.ti + '" stroke-width="2"/>'),
'la réduction': S(CI(32, 32, 20, C.vm, 0) + L(22, 42, 42, 22, 2.6, C.br) + CI(24, 24, 3, C.br, 0) + CI(40, 40, 3, C.br, 0)),
'la livraison': S(R(8, 26, 30, 20, C.am, 2) + P('M38 32h12l6 8v6H38Z', C.azc, C.ti, 2) + CI(18, 48, 4, C.ti, 0) + CI(46, 48, 4, C.ti, 0)),
'le colis': S(P('M12 22 32 12l20 10-20 10Z', C.amf, C.ti, 2) + P('M12 22v22l20 10V32ZM52 22v22l-20 10V32', C.am, C.ti, 2)),
'la commande en ligne': S(R(10, 10, 44, 30, C.ti, 3) + R(14, 14, 36, 22, C.azc, 1) + P('M22 46l4-8h12l4 8Z', C.cz, C.ti, 1.6) + CI(28, 30, 2, C.br, 0) + CI(36, 30, 2, C.br, 0)),
'le service client': S(BALAO(C.az) + CI(46, 40, 10, C.am) + P('M42 40h8M46 36v8', 'none', C.br, 2)),
'le prix': S(P('M12 32 30 14h18v18L30 50Z', C.am, C.ti, 2) + CI(40, 24, 3.4, C.br, 1.4)),
"l'échange": S(P('M12 24h30', 'none', C.az, 3) + P('M34 16l8 8-8 8', 'none', C.az, 3) + P('M52 40H22', 'none', C.vm, 3) + P('M30 32l-8 8 8 8', 'none', C.vm, 3)),

/* --- SANTÉ ET BIEN-ÊTRE (TCF) --- */
'la sécurité sociale': S(CI(32, 26, 14, C.az) + P('M25 26l5 6 10-10', 'none', C.br, 3) + L(20, 50, 44, 50, 2, C.ti)),
'la mutuelle': S(P('M32 46C16 34 10 24 16 16c5-6 13-4 16 2 3-6 11-8 16-2 6 8 0 18-16 30Z', C.vm, C.ti, 2) + P('M27 30l3 4 6-8', 'none', C.br, 2)),
"l'ordonnance": S(DOC(C.vm) + P('M20 42h20', 'none', C.vm, 1.6) + P('M20 46h14', 'none', C.vm, 1.6)),
'la pharmacie de garde': S(R(10, 12, 44, 42, C.br, 5) + R(27, 20,10, 28, C.vd, 2) + R(18, 29, 28, 10, C.vd, 2) + CI(48, 12, 8, C.am) + L(48, 8, 48, 16, 1.6, C.ti) + L(44, 12, 52, 12, 1.6, C.ti)),
'la vaccination': S(P('M12 40 30 22l4 4 4-4 6 6-4 4 4 4-18 18-4-4-8 8-4-4 8-8Z', C.azc, C.ti, 1.8) + L(38, 14, 46, 22, 2.2, C.vm)),
"l'urgence": S(CI(32, 32, 20, C.vm) + L(32, 20, 32, 44, 4, C.br) + L(20, 32, 44, 32, 4, C.br)),
'le bilan de santé': S(R(10, 12, 44, 40, C.br, 2) + P('M14 34l8 6 8-14 6 10 8-16 8 8', 'none', C.vm, 2)),
'la consultation': S(PESSOA(20, 40, C.br, C.ti, false, R(28, 24, 6, 6, C.vm, 1)) + PESSOA(46, 42, C.az, C.mr, true)),
"l'assurance maladie": S(P('M32 6l20 6v18c0 12-9 20-20 24-11-4-20-12-20-24V12Z', C.az, C.ti, 2) + CI(32, 28, 3, C.vm, 0) + R(29, 32, 6, 8, C.vm, 0)),
'le certificat médical': S(R(10, 10, 44, 38, C.br, 2) + L(16, 18, 48, 18, 1.6) + CI(32, 32, 3, C.vm, 0) + R(29, 36, 6, 8, C.vm, 0) + CI(32, 52, 6, C.vd, 1.4)),

/* --- EXPRESSIONS UTILES (TCF) --- */
'il est nécessaire de': S(CI(32, 24, 3, C.br, 0) + R(29, 30, 6, 14, C.vm, 1.6) + '<circle cx="32" cy="24" r="22" fill="none" stroke="' + C.vm + '" stroke-width="3"/>'),
'dans le cadre de': S(R(8, 8, 48, 48, C.br, 3) + R(16, 16, 32, 32, C.azc, 2)),
'en ce qui me concerne': S(PESSOA(20, 44, C.am, C.ti, false) + P('M34 12h22a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H44l-6 6v-6h-4a4 4 0 0 1-4-4V16a4 4 0 0 1 4-4Z', C.az, C.ti, 1.6)),
"il s'avère que": S('<circle cx="26" cy="26" r="14" fill="' + C.am + '" stroke="' + C.ti + '" stroke-width="2.4"/>' + L(36, 36, 50, 50, 4, C.ti) + P('M20 26l4 4 8-8', 'none', C.vd, 2.4)),
'force est de constater': S('<circle cx="32" cy="32" r="20" fill="none" stroke="' + C.ti + '" stroke-width="3"/>' + CI(24, 28, 2.4, C.ti, 0) + CI(40, 28, 2.4, C.ti, 0) + P('M24 40h16', 'none', C.ti, 2.4)),
'dans un premier temps': S(CI(20, 32, 12, C.am, 2) + L(20, 32, 20, 24, 2, C.ti) + L(20, 32, 26, 32, 2, C.ti) + P('M36 32h16', 'none', C.cz, 3, '4 3')),
'dans un second temps': S(P('M8 32h16', 'none', C.cz, 3, '4 3') + CI(44, 32, 12, C.am, 2) + L(44, 32, 44, 24, 2, C.ti) + L(44, 32, 50, 32, 2, C.ti)),
'pour conclure': S(P('M8 46h48', 'none', C.ti, 2) + P('M14 40l12-10 8 6 16-18', 'none', C.vd, 3) + CI(50, 18, 4, C.vd, 1.4)),
'tout compte fait': S(R(14, 20, 36, 28, C.br, 2) + L(20, 28, 44, 28, 1.6) + L(20, 34, 38, 34, 1.6) + CI(46, 44, 8, C.am, 1.6) + P('M42 44l3 3 6-6', 'none', C.vd, 2)),
'en définitive': S(CI(32, 32, 20, C.vd, 0) + P('M22 32l7 8 13-14', 'none', C.br, 3.6)),

/* --- CONNECTEURS TCF --- */
'par ailleurs': S(L(14, 32, 50, 32, 3, C.am) + CI(14, 32, 4, C.ti, 0) + CI(50, 32, 4, C.ti, 0) + P('M32 20v-6M32 50v-6', 'none', C.am, 3)),
'en somme': S(L(14, 20, 14, 44, 3, C.az) + L(28, 20, 28, 44, 3, C.az) + P('M40 32h14', 'none', C.vd, 3.4) + P('M50 26l4 6-4 6', 'none', C.vd, 3.4)),
'de ce fait': S(P('M10 20l14 12-14 12', 'none', C.ti, 2.6) + P('M30 32h24', 'none', C.vd, 3.4) + P('M48 26l6 6-6 6', 'none', C.vd, 3.4)),
'tant que': S('<circle cx="32" cy="32" r="20" fill="none" stroke="' + C.am + '" stroke-width="3" stroke-dasharray="6 4"/>' + L(32, 32, 32, 20, 2.4) + L(32, 32, 40, 34, 2.4)),
'dès lors que': S(CI(18, 32, 3, C.ti, 0) + P('M22 32h10', 'none', C.ti, 2, '2 2') + CI(36, 32, 12, C.am, 2) + P('M50 32h6', 'none', C.vd, 3)),
'sous prétexte de': S(BALAO(C.cz) + P('M20 24l16 12M36 24l-16 12', 'none', C.vm, 2)),
'au fur et à mesure': S(P('M8 46 18 40 28 44 38 32 48 36 58 20', 'none', C.vd, 3) + CI(18, 40, 2, C.vd, 0) + CI(38, 32, 2, C.vd, 0)),
'en dépit de': S('<circle cx="32" cy="32" r="20" fill="none" stroke="' + C.cz + '" stroke-width="4"/>' + P('M20 20l24 24M44 20 20 44', 'none', C.vm, 3)),
'à condition que': S(CI(20, 24, 9, C.am, 2) + P('M17 24l2 2 4-4', 'none', C.ti, 1.6) + P('M32 32h20', 'none', C.ti, 1.6, '3 3')),
'quant à': S(CI(22, 32, 3, C.ti, 0) + P('M26 32h10', 'none', C.ti, 2) + CI(40, 32, 12, C.am, 2) + P('M40 26v6l5 3', 'none', C.ti, 1.8))

};

var VOCAB_TCF = [
  {c:'tcf-administrativo', f:"la carte d'identité", p:'a carteira de identidade'},
  {c:'tcf-administrativo', f:'le formulaire', p:'o formulário'},
  {c:'tcf-administrativo', f:'la démarche administrative', p:'o trâmite administrativo'},
  {c:'tcf-administrativo', f:'le guichet', p:'o guichê'},
  {c:'tcf-administrativo', f:'la préfecture', p:'a prefeitura (departamental)'},
  {c:'tcf-administrativo', f:'le certificat', p:'o certificado'},
  {c:'tcf-administrativo', f:'la signature', p:'a assinatura'},
  {c:'tcf-administrativo', f:'le justificatif de domicile', p:'o comprovante de residência'},
  {c:'tcf-administrativo', f:'la demande', p:'o pedido, requerimento'},
  {c:'tcf-administrativo', f:'le rendez-vous', p:'o compromisso, hora marcada'},

  {c:'tcf-profissional', f:'le CV', p:'o currículo'},
  {c:'tcf-profissional', f:'la lettre de motivation', p:'a carta de apresentação'},
  {c:'tcf-profissional', f:"l'entretien d'embauche", p:'a entrevista de emprego'},
  {c:'tcf-profissional', f:'le contrat de travail', p:'o contrato de trabalho'},
  {c:'tcf-profissional', f:'le stage', p:'o estágio'},
  {c:'tcf-profissional', f:'la candidature', p:'a candidatura'},
  {c:'tcf-profissional', f:'le poste', p:'o cargo'},
  {c:'tcf-profissional', f:'les horaires de travail', p:'o horário de trabalho'},
  {c:'tcf-profissional', f:'la promotion', p:'a promoção (de cargo)'},
  {c:'tcf-profissional', f:'la démission', p:'a demissão (pedido de)'},

  {c:'tcf-educacao', f:"l'inscription", p:'a inscrição, matrícula'},
  {c:'tcf-educacao', f:'le dossier scolaire', p:'o histórico escolar'},
  {c:'tcf-educacao', f:"la bourse d'études", p:'a bolsa de estudos'},
  {c:'tcf-educacao', f:'le cursus', p:'o percurso acadêmico'},
  {c:'tcf-educacao', f:'la moyenne', p:'a média (nota)'},
  {c:'tcf-educacao', f:"l'examen", p:'a prova, exame'},
  {c:'tcf-educacao', f:'le redoublement', p:'a repetência'},
  {c:'tcf-educacao', f:'le tuteur', p:'o tutor, orientador'},
  {c:'tcf-educacao', f:"l'orientation", p:'a orientação (vocacional)'},
  {c:'tcf-educacao', f:'le concours', p:'o concurso público'},

  {c:'tcf-cotidiano', f:'le rendez-vous médical', p:'a consulta médica marcada'},
  {c:'tcf-cotidiano', f:"la file d'attente", p:'a fila de espera'},
  {c:'tcf-cotidiano', f:'la réclamation', p:'a reclamação'},
  {c:'tcf-cotidiano', f:'le remboursement', p:'o reembolso'},
  {c:'tcf-cotidiano', f:'la facture', p:'a fatura'},
  {c:'tcf-cotidiano', f:"l'abonnement", p:'a assinatura (de serviço)'},
  {c:'tcf-cotidiano', f:'la panne', p:'a avaria, pane'},
  {c:'tcf-cotidiano', f:'la réparation', p:'o conserto'},
  {c:'tcf-cotidiano', f:'le déménagement', p:'a mudança de casa'},
  {c:'tcf-cotidiano', f:'le voisinage', p:'a vizinhança'},

  {c:'tcf-atualidades', f:'le journal télévisé', p:'o telejornal'},
  {c:'tcf-atualidades', f:"la chaîne d'information", p:'o canal de notícias'},
  {c:'tcf-atualidades', f:'le sondage', p:'a pesquisa de opinião'},
  {c:'tcf-atualidades', f:'la statistique', p:'a estatística'},
  {c:'tcf-atualidades', f:"l'événement", p:'o evento'},
  {c:'tcf-atualidades', f:'la tendance', p:'a tendência'},
  {c:'tcf-atualidades', f:'le débat', p:'o debate'},
  {c:'tcf-atualidades', f:'la polémique', p:'a polêmica'},
  {c:'tcf-atualidades', f:'le communiqué', p:'o comunicado'},
  {c:'tcf-atualidades', f:'la conférence de presse', p:'a coletiva de imprensa'},

  {c:'tcf-urbano', f:"l'urbanisme", p:'o urbanismo'},
  {c:'tcf-urbano', f:'le plan de circulation', p:'o plano de tráfego'},
  {c:'tcf-urbano', f:'la rénovation urbaine', p:'a reforma urbana'},
  {c:'tcf-urbano', f:'les travaux publics', p:'as obras públicas'},
  {c:'tcf-urbano', f:'la nuisance', p:'o incômodo, transtorno'},
  {c:'tcf-urbano', f:"l'aménagement", p:'a urbanização, ordenamento'},
  {c:'tcf-urbano', f:'la sécurité routière', p:'a segurança viária'},
  {c:'tcf-urbano', f:"l'accessibilité", p:'a acessibilidade'},
  {c:'tcf-urbano', f:'le mobilier urbain', p:'o mobiliário urbano'},
  {c:'tcf-urbano', f:'la vidéosurveillance', p:'a videovigilância'},

  {c:'tcf-consumo', f:"le contrat d'abonnement", p:'o contrato de assinatura'},
  {c:'tcf-consumo', f:'la garantie', p:'a garantia'},
  {c:'tcf-consumo', f:'le service après-vente', p:'a assistência pós-venda'},
  {c:'tcf-consumo', f:'la réduction', p:'o desconto'},
  {c:'tcf-consumo', f:'la livraison', p:'a entrega'},
  {c:'tcf-consumo', f:'le colis', p:'o pacote, encomenda'},
  {c:'tcf-consumo', f:'la commande en ligne', p:'o pedido online'},
  {c:'tcf-consumo', f:'le service client', p:'o atendimento ao cliente'},
  {c:'tcf-consumo', f:'le prix', p:'o preço'},
  {c:'tcf-consumo', f:"l'échange", p:'a troca'},

  {c:'tcf-saude', f:'la sécurité sociale', p:'a previdência social'},
  {c:'tcf-saude', f:'la mutuelle', p:'o plano de saúde complementar'},
  {c:'tcf-saude', f:"l'ordonnance", p:'a receita médica'},
  {c:'tcf-saude', f:'la pharmacie de garde', p:'a farmácia de plantão'},
  {c:'tcf-saude', f:'la vaccination', p:'a vacinação'},
  {c:'tcf-saude', f:"l'urgence", p:'a emergência'},
  {c:'tcf-saude', f:'le bilan de santé', p:'o check-up'},
  {c:'tcf-saude', f:'la consultation', p:'a consulta'},
  {c:'tcf-saude', f:"l'assurance maladie", p:'o seguro-saúde'},
  {c:'tcf-saude', f:'le certificat médical', p:'o atestado médico'},

  {c:'tcf-expressoes', f:'il est nécessaire de', p:'é necessário'},
  {c:'tcf-expressoes', f:'dans le cadre de', p:'no âmbito de'},
  {c:'tcf-expressoes', f:'en ce qui me concerne', p:'no que me diz respeito'},
  {c:'tcf-expressoes', f:"il s'avère que", p:'verifica-se que'},
  {c:'tcf-expressoes', f:'force est de constater', p:'é forçoso constatar'},
  {c:'tcf-expressoes', f:'dans un premier temps', p:'num primeiro momento'},
  {c:'tcf-expressoes', f:'dans un second temps', p:'num segundo momento'},
  {c:'tcf-expressoes', f:'pour conclure', p:'para concluir'},
  {c:'tcf-expressoes', f:'tout compte fait', p:'no final das contas'},
  {c:'tcf-expressoes', f:'en définitive', p:'em definitivo, enfim'},

  {c:'tcf-conectores', f:'par ailleurs', p:'ademais, além disso'},
  {c:'tcf-conectores', f:'en somme', p:'em suma'},
  {c:'tcf-conectores', f:'de ce fait', p:'por isso, dessa forma'},
  {c:'tcf-conectores', f:'tant que', p:'enquanto, contanto que'},
  {c:'tcf-conectores', f:'dès lors que', p:'a partir do momento em que'},
  {c:'tcf-conectores', f:'sous prétexte de', p:'sob o pretexto de'},
  {c:'tcf-conectores', f:'au fur et à mesure', p:'à medida que'},
  {c:'tcf-conectores', f:'en dépit de', p:'apesar de'},
  {c:'tcf-conectores', f:'à condition que', p:'contanto que'},
  {c:'tcf-conectores', f:'quant à', p:'quanto a'}
];

var proxId = window.QI_VOCAB.length;
VOCAB_TCF.forEach(function (v, i) { v.id = 'v' + (proxId + i); v.icone = ICONES_TCF[v.f]; v.n = 'TCF'; });

window.QI_VOCAB = window.QI_VOCAB.concat(VOCAB_TCF);
for (var k in ICONES_TCF) window.QI_ICONES[k] = ICONES_TCF[k];
})();
