// =====================================================================
// QUESTÕES INTERATIVAS — vocabulário nível B1 (100 termos, 10 categorias:
// sentimentos, personalidade, viagem, mídia/comunicação, meio ambiente,
// trabalho/profissões, tecnologia, sociedade, verbos B1, opinião básica).
// Reaproveita window.QI_C / window.QI_DSL (ver questoesInterativasDados.js
// e questoesInterativasDadosA2.js, que devem ser carregados antes deste).
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
/** rosto expressivo (sentimentos) */
function ROSTO(cor, boca, extra) {
  return CI(32, 32, 20, cor) + CI(24, 26, 2.4, C.ti, 0) + CI(40, 26, 2.4, C.ti, 0) + boca + (extra || '');
}
/** balão de fala, pra opinião/comunicação */
function BALAO(cor, conteudo) {
  return P('M8 12h48a6 6 0 0 1 6 6v20a6 6 0 0 1-6 6H30l-12 12v-12H14a6 6 0 0 1-6-6V18a6 6 0 0 1 6-6Z', cor, C.ti, 2) +
    (conteudo || '');
}

var ICONES_B1 = {

/* --- SENTIMENTS --- */
'content': S(ROSTO(C.am, P('M22 38c4 5 16 5 20 0', 'none', C.ti, 2.4))),
'triste': S(ROSTO(C.azc, P('M22 40c4-5 16-5 20 0', 'none', C.ti, 2.4)) + P('M20 30v6M44 30v6', 'none', C.az, 2)),
'en colère': S(ROSTO(C.vm, P('M23 40c4-3 14-3 18 0', 'none', C.ti, 2.4)) + P('M18 20l10 6M46 20l-10 6', 'none', C.ti, 2.4)),
'surpris': S(ROSTO(C.am, '<ellipse cx="32" cy="40" rx="5" ry="7" fill="' + C.br + '" stroke="' + C.ti + '" stroke-width="2"/>') + P('M18 18l4 6M46 18l-4 6', 'none', C.ti, 2)),
'inquiet': S(ROSTO(C.azc, P('M24 40c3-2 13-2 16 2', 'none', C.ti, 2.2)) + P('M20 22l8 4M44 22l-8 4', 'none', C.ti, 2)),
'fatigué': S(ROSTO(C.cz, P('M22 26h6M36 26h6', 'none', C.ti, 2.6) + P('M23 40c4 3 14 3 18 0', 'none', C.ti, 2)) + P('M12 46q4-4 8 0M44 46q4-4 8 0', 'none', C.az, 1.8)),
'détendu': S(ROSTO(C.vd, P('M24 25c2 2 4 2 6 0M34 25c2 2 4 2 6 0', 'none', C.ti, 2) + P('M24 38c4 3 12 3 16 0', 'none', C.ti, 2))),
'jaloux': S(ROSTO(C.lx, P('M24 40c4-2 12-2 16 0', 'none', C.ti, 2)) + P('M44 24l8-4-4 8Z', C.am, C.ti, 1.6)),
'fier': S(ROSTO(C.am, P('M24 38c4 4 12 4 16 0', 'none', C.ti, 2.4)) + P('M32 12l3 6 6 1-4 4 1 6-6-3-6 3 1-6-4-4 6-1Z', C.amf, C.ti, 1.4)),
'gêné': S(ROSTO(C.rx, P('M25 40c3-1 11-1 14 0', 'none', C.ti, 2)) + CI(20, 34, 3, C.vm, 0) + CI(44, 34, 3, C.vm, 0)),

/* --- PERSONNALITÉ --- */
'généreux': S(P('M32 46C16 34 10 24 16 16c5-6 13-4 16 2 3-6 11-8 16-2 6 8 0 18-16 30Z', C.vm, C.ti, 2)),
'timide': S(PESSOA(32, 40, C.azc, C.ti, false) + EL(32, 46, 10, 3, C.cz, 0) + P('M20 34h-6a4 4 0 0 0-4 4v6h6', 'none', C.ti, 1.6)),
'courageux': S(P('M32 8l20 8v16c0 14-9 24-20 28-11-4-20-14-20-28V16Z', C.az, C.ti, 2) + P('M24 32l6 6 12-12', 'none', C.br, 3)),
'curieux': S('<circle cx="26" cy="26" r="14" fill="none" stroke="' + C.ti + '" stroke-width="3"/>' + CI(26, 26, 14, C.azc, 0) + L(36, 36, 50, 50, 4, C.ti) + CI(26, 22, 1.6, C.ti, 0) + P('M22 30q4 4 8 0', 'none', C.ti, 1.6)),
'patient': S('<circle cx="32" cy="32" r="20" fill="' + C.am + '" stroke="' + C.ti + '" stroke-width="2.4"/>' + L(32, 32, 32, 20, 2.2) + L(32, 32, 40, 34, 2.2) + CI(32, 32, 1.8, C.ti, 0)),
'têtu': S(EL(32, 40, 20, 12, C.cz) + CI(20, 26, 9, C.cz) + P('M28 44c8 2 20-2 26-10', 'none', C.ti, 3) + CI(17, 25, 1.4, C.ti, 0)),
'sociable': S(PESSOA(20, 40, C.az, C.ti, false) + PESSOA(34, 40, C.vd, C.mr, true) + PESSOA(48, 40, C.am, C.ti, false)),
'calme': S(P('M8 40c5-3 8-3 13 0s8 3 13 0 8-3 13 0 8 3 13 0', 'none', C.az, 3) + P('M8 30c5-3 8-3 13 0s8 3 13 0 8-3 13 0 8 3 13 0', 'none', C.azc, 2.4)),
'ambitieux': S(T(10, 50, 54, 12, C.vd) + P('M32 12v10', 'none', C.ti, 2) + P('M32 8l6 4-6 4Z', C.vm, C.ti, 1.6) + L(2, 56, 62, 56, 2.5, C.cz)),
'honnête': S(CI(32, 26, 16, C.am) + P('M24 26l6 6 12-12', 'none', C.br, 3.4) + P('M20 46c4-4 20-4 24 0', 'none', C.ti, 2, '3 3')),

/* --- VOYAGE --- */
'la valise': S(R(12, 24, 40, 30, C.az, 4) + R(24, 14, 16, 10, C.az, 2) + L(20, 24, 20, 54, 2) + L(44, 24, 44, 54, 2)),
'le passeport': S(R(16, 8, 32, 48, C.vm, 3) + CI(32, 24, 8, C.am, 1.6) + P('M22 44h20M22 50h20', 'none', C.am, 1.8)),
'la carte': S(P('M8 14l16-6 16 6 16-6v42l-16 6-16-6-16 6Z', C.amf, C.ti, 2) + L(24, 8, 24, 50, 1.4, C.ti, '3 3') + L(40, 8, 40, 50, 1.4, C.ti, '3 3') + CI(32, 30, 3, C.vm, 0)),
"l'hôtel": S(R(10, 20, 44, 34, C.br, 2) + P('M8 20l24-14 24 14Z', C.az, C.ti, 2) + W(16, 26, 8, 8) + W(28, 26, 8, 8) + W(40, 26, 8, 8) + D(27, 42, 10, 12, C.mr)),
'la plage': S(EL(24, 46, 22, 8, C.am) + '<circle cx="46" cy="16" r="8" fill="' + C.am + '" stroke="' + C.ti + '" stroke-width="2"/>' + P('M4 46c8-4 14-4 20-6', 'none', C.az, 3) + T(10, 40, 26, 22, C.vd)),
'la montagne': S(P('M4 50 22 18l10 14 8-10 20 28Z', C.tis, C.ti, 2) + P('M22 18l6 10-6 4-6-4Z', C.br, C.ti, 1.4)),
"le billet d'avion": S(R(8, 20, 48, 24, C.br, 3) + L(30, 20, 30, 44, 1.4, C.cz, '3 3') + P('M38 26l14 6-14 6Z', C.az, C.ti, 1.6) + CI(18, 32, 2, C.vm, 0)),
'la réservation': S(R(10, 10, 44, 44, C.br, 3) + L(10, 20, 54, 20, 2) + CI(20, 15, 2, C.vm, 0) + CI(44, 15, 2, C.vm, 0) + P('M22 34l6 6 14-14', 'none', C.vd, 3)),
'le voyage': S(P('M32 6l5 20 22 8v5l-22-3-2 12 7 5v4l-10-3-10 3v-4l7-5-2-12-22 3v-5l22-8Z', C.az, C.ti, 2)),
'la carte postale': S(R(8, 14, 48, 34, C.br, 2) + CI(38, 24, 6, C.am) + T(46, 27, 56, 20, C.vm) + L(8, 40, 30, 40, 1.4, C.cz) + L(8, 46, 24, 46, 1.4, C.cz)),

/* --- MÉDIAS ET COMMUNICATION --- */
'la télévision': S(R(8, 12, 48, 30, C.ti, 3) + R(13, 17, 38, 20, C.az, 1) + R(26, 42, 12, 4, C.cz) + L(32, 46, 32, 50, 2)),
'la radio': S(R(10, 22, 44, 26, C.am, 3) + CI(20, 35, 6, C.ti) + R(34, 30, 14, 8, C.br, 1) + L(46, 22, 50, 8, 2.4, C.ti) + CI(50, 8, 2, C.vm, 0)),
'le journal': S(R(10, 8, 44, 48, C.br, 1) + L(16, 18, 48, 18, 2, C.ti) + R(16, 24, 18, 14, C.cz, 1) + L(38, 24, 48, 24, 1.4) + L(38, 30, 48, 30, 1.4) + L(16, 42, 48, 42, 1.4) + L(16, 48, 40, 48, 1.4)),
"l'ordinateur portable": S(R(10, 14, 44, 26, C.ti, 3) + R(14, 18, 36, 18, C.azc, 1) + P('M6 40h52l-4 6H10Z', C.cz, C.ti, 1.6)),
"l'email": S(R(8, 16, 48, 32, C.br, 3) + P('M8 16l24 18 24-18', 'none', C.ti, 2)),
'les réseaux sociaux': S(CI(18, 20, 8, C.az) + CI(46, 20, 8, C.vd) + CI(32, 46, 8, C.am) + L(24, 24, 40, 24, 2, C.ti) + L(22, 27, 30, 40, 2, C.ti) + L(42, 27, 34, 40, 2, C.ti)),
'la publicité': S(R(8, 14, 48, 30, C.am, 3) + P('M14 22l10 6-10 6Z', C.ti, C.ti, 1.4) + L(30, 24, 50, 24, 1.6, C.ti) + L(30, 32, 50, 32, 1.6, C.ti) + L(10, 50, 54, 50, 2.4, C.cz)),
"l'interview": S(CI(18, 26, 9, C.am) + CI(46, 26, 9, C.azc) + P('M27 30h10', 'none', C.ti, 2) + R(14, 40, 8, 14, C.ti, 1) + R(42, 40, 8, 14, C.ti, 1)),
"l'article": S(R(12, 8, 40, 48, C.br, 2) + L(18, 18, 46, 18, 2) + L(18, 26, 46, 26, 1.4, C.cz) + L(18, 32, 46, 32, 1.4, C.cz) + L(18, 38, 36, 38, 1.4, C.cz) + L(18, 44, 40, 44, 1.4, C.cz)),
'le message': S(BALAO(C.az)),

/* --- ENVIRONNEMENT --- */
"l'arbre": S(CI(30, 22, 16, C.vd) + CI(42, 30, 10, C.vd) + R(27, 38, 6, 18, C.mr, 1.5)),
'la forêt': S(CI(14, 26, 11, C.vd) + R(11, 34, 4, 18, C.mr, 1) + CI(32, 18, 13, C.vd) + R(29, 28, 5, 24, C.mr, 1) + CI(50, 26, 11, C.vd) + R(47, 34, 4, 18, C.mr, 1)),
'la rivière': S(R(4, 6, 56, 52, C.vd, 0) + P('M4 20c10-4 14 4 24 0s14 4 24 0 8-4 12 0v40H4Z', C.az, C.ti, 2)),
'la mer': S(P('M4 40c5-3 8-3 13 0s8 3 13 0 8-3 13 0 8 3 13 0 5-3 5-3', 'none', C.az, 3) + P('M4 48c5-3 8-3 13 0s8 3 13 0 8-3 13 0 8 3 13 0 5-3 5-3', 'none', C.azc, 3) + CI(48, 14, 8, C.am)),
"l'énergie solaire": S(CI(32, 32, 10, C.am) + L(32, 8, 32, 14, 3, C.am) + L(32, 50, 32, 56, 3, C.am) + L(8, 32, 14, 32, 3, C.am) + L(50, 32, 56, 32, 3, C.am) + L(16, 16, 20, 20, 3, C.am) + L(48, 16, 44, 20, 3, C.am)),
'le recyclage': S('<circle cx="32" cy="32" r="22" fill="none" stroke="' + C.vd + '" stroke-width="4"/>' + P('M46 18l4-4M46 18l-1-5M46 18l5 1', 'none', C.vd, 2.6) + P('M18 46l-4 4M18 46l1 5M18 46l-5-1', 'none', C.vd, 2.6) + CI(32, 32, 6, C.vd)),
'la planète': S(CI(32, 32, 20, C.az) + '<ellipse cx="32" cy="32" rx="20" ry="7" fill="none" stroke="' + C.vd + '" stroke-width="2"/>' + CI(24, 22, 6, C.vd, 0) + CI(42, 40, 5, C.vd, 0)),
'la nature': S(CI(20, 26, 10, C.vd) + R(18, 34, 4, 16, C.mr, 1) + CI(44, 22, 10, C.vd) + R(42, 30, 4, 20, C.mr, 1) + P('M2 50h60', 'none', C.vd, 2)),
"l'écologie": S(CI(32, 32, 20, C.vd, 0) + P('M32 44V20M32 20c-8 0-12 6-12 10 6 0 12-4 12-10ZM32 28c8 0 12-4 12-8-6 0-12 3-12 8Z', C.br, C.ti, 1.6)),
'la biodiversité': S(CI(16, 20, 7, C.vd) + CI(48, 20, 7, C.am) + CI(16, 46, 7, C.az) + CI(48, 46, 7, C.rx) + CI(32, 33, 9, C.vm)),

/* --- TRAVAIL ET MÉTIERS --- */
'le médecin': S(PESSOA(32, 36, C.br, C.ti, false, R(28, 24, 8, 8, C.vm, 1) + L(30, 26, 34, 26, 1.4, C.br) + L(32, 24, 32, 28, 1.4, C.br))),
'le professeur': S(PESSOA(26, 40, C.tis, C.mr, false) + R(38, 20, 20, 16, C.br, 2) + L(42, 26, 54, 26, 1.4, C.ti) + L(42, 31, 50, 31, 1.4, C.ti)),
"l'avocat": S(PESSOA(32, 38, C.ti, C.ti, false, L(26, 20, 22, 30, 1.6, C.br) + L(38, 20, 42, 30, 1.6, C.br)) + R(24, 50, 16, 4, C.mr, 1)),
"l'ingénieur": S(PESSOA(28, 40, C.am, C.ti, false) + '<circle cx="46" cy="24" r="8" fill="none" stroke="' + C.ti + '" stroke-width="2"/>' + P('M46 16v-4M46 36v-4M38 24h-4M58 24h-4', 'none', C.ti, 2)),
'le cuisinier': S(PESSOA(32, 40, C.br, C.ti, false, EL(32, 14, 10, 6, C.br, 1.6) + R(26, 6, 12, 10, C.br, 1))),
'le policier': S(PESSOA(32, 38, C.az, C.ti, false, R(26, 16, 12, 6, C.ti, 1) + CI(32, 30, 2, C.am, 1.4))),
"l'infirmier": S(PESSOA(32, 38, C.br, C.mr, true, CI(40, 24, 6, C.br, 1.6) + L(40, 21, 40, 27, 1.6, C.vm) + L(37, 24, 43, 24, 1.6, C.vm))),
'le vendeur': S(PESSOA(24, 38, C.vd, C.ti, false) + R(38, 30, 18, 16, C.br, 2) + L(38, 38, 56, 38, 1.4, C.cz)),
"l'employé": S(PESSOA(32, 38, C.azc, C.ti, false, R(27, 18, 10, 8, C.br, 1))),
'le patron': S(PESSOA(32, 38, C.ti, C.ti, false, R(24, 12, 16, 6, C.am, 1.6))),

/* --- TECHNOLOGIE --- */
'le smartphone': S(R(20, 6, 24, 52, C.ti, 6) + R(23, 12, 18, 36, C.azc, 1) + CI(32, 52, 2.4, C.br, 0)),
"l'application": S(R(10, 10, 20, 20, C.vm, 4) + R(34, 10, 20, 20, C.am, 4) + R(10, 34, 20, 20, C.az, 4) + R(34, 34, 20, 20, C.vd, 4)),
'le mot de passe': S(R(18, 28, 28, 24, C.am, 3) + P('M24 28v-8a8 8 0 0 1 16 0v8', 'none', C.ti, 3) + CI(32, 40, 3, C.ti, 0)),
'le wifi': S(P('M10 30a32 32 0 0 1 44 0', 'none', C.az, 3) + P('M18 40a20 20 0 0 1 28 0', 'none', C.az, 3) + P('M26 48a8 8 0 0 1 12 0', 'none', C.az, 3) + CI(32, 54, 2.4, C.az, 0)),
'la caméra': S(R(10, 22, 44, 28, C.ti, 4) + P('M18 22l4-8h20l4 8Z', C.ti, C.ti, 2) + '<circle cx="32" cy="36" r="10" fill="' + C.azc + '" stroke="' + C.br + '" stroke-width="2"/>'),
'le clavier': S(R(6, 20, 52, 26, C.cz, 3) + W(11, 25, 5, 5) + W(19, 25, 5, 5) + W(27, 25, 5, 5) + W(35, 25, 5, 5) + W(43, 25, 5, 5) + W(51, 25, 3, 5) + R(11, 34, 42, 6, C.br, 1)),
"l'écran": S(R(8, 10, 48, 32, C.ti, 3) + R(12, 14, 40, 24, C.azc, 1) + R(24, 46, 16, 4, C.cz) + L(32, 42, 32, 46, 2)),
'le logiciel': S(P('M20 20l-10 12 10 12M44 20l10 12-10 12M36 14l-8 36', 'none', C.az, 3)),
'la batterie': S(R(12, 22, 40, 20, C.ti, 3) + R(52, 28, 4, 8, C.ti, 1) + R(16, 26, 18, 12, C.vd, 0)),
'le réseau': S(CI(32, 14, 6, C.az) + CI(14, 46, 6, C.az) + CI(50, 46, 6, C.az) + L(32, 20, 14, 40, 2) + L(32, 20, 50, 40, 2) + L(14, 46, 50, 46, 2)),

/* --- SOCIÉTÉ --- */
'la loi': S(P('M6 24 32 10l26 14Z', C.azc, C.ti, 2) + R(13, 27, 6, 19, C.br) + R(45, 27, 6, 19, C.br) + R(6, 46, 52, 7, C.am, 1.5) + L(32, 6, 32, 10, 2)),
'le vote': S(R(16, 30, 32, 24, C.az, 2) + P('M22 30V20l10-8 10 8v10', 'none', C.ti, 2.6) + L(32, 12, 32, 30, 1.6, C.vm)),
'le gouvernement': S(P('M6 24 32 10l26 14Z', C.am, C.ti, 2) + R(13, 27, 6, 19, C.br) + R(29, 27, 6, 19, C.br) + R(45, 27, 6, 19, C.br) + R(6, 46, 52, 7, C.azc, 1.5)),
'le citoyen': S(PESSOA(32, 36, C.az, C.ti, false) + '<circle cx="32" cy="36" r="24" fill="none" stroke="' + C.ti + '" stroke-width="1.6" stroke-dasharray="4 3"/>'),
"l'égalité": S(P('M14 20h36M14 20l-6 12h12ZM50 20l-6 12h12Z', 'none', C.ti, 2.4) + L(32, 8, 32, 44, 2.4) + L(20, 44, 44, 44, 2.4)),
'la liberté': S(P('M32 6c-4 6-4 14 0 20-4 6-4 14 0 20', 'none', C.am, 3) + L(32, 6, 32, 56, 2.6, C.ti)),
'la communauté': S(PESSOA(16, 42, C.vd, C.ti, false) + PESSOA(32, 40, C.am, C.mr, true) + PESSOA(48, 42, C.az, C.ti, false) + '<circle cx="32" cy="38" r="26" fill="none" stroke="' + C.ti + '" stroke-width="1.4" stroke-dasharray="3 3"/>'),
'la tradition': S(EL(32, 46, 20, 8, C.mr) + R(20, 20, 24, 26, C.am, 2) + T(18, 20, 46, 8, C.vm)),
'la culture': S(P('M6 24 32 10l26 14Z', C.lx, C.ti, 2) + R(13, 27, 6, 19, C.br) + R(45, 27, 6, 19, C.br) + R(6, 46, 52, 7, C.am, 1.5) + CI(32, 17, 3, C.am, 1.5)),
'la religion': S(L(32, 6, 32, 40, 3, C.ti) + L(18, 18, 46, 18, 3, C.ti) + EL(32, 48, 12, 8, C.am)),

/* --- VERBES ET EXPRESSIONS B1 --- */
'décider': S(CI(32, 20, 8, C.am) + P('M32 28v10M20 44l12-6 12 6', 'none', C.ti, 3) + CI(20, 46, 2.4, C.vd, 0) + CI(44, 46, 2.4, C.vm, 0)),
'espérer': S(CI(32, 34, 20, C.azc, 0) + P('M22 34l7 8 13-16', 'none', C.vd, 4) + L(32, 8, 32, 14, 2.4, C.am)),
'réussir': S(CI(32, 32, 22, C.vd) + P('M20 32l8 8 16-16', 'none', C.br, 4)),
'échouer': S(CI(32, 32, 22, C.vm) + P('M22 22l20 20M42 22l-20 20', 'none', C.br, 4)),
"s'inquiéter": S(ROSTO(C.azc, P('M25 40c3-2 11-2 14 2', 'none', C.ti, 2)) + P('M46 14v10M46 28v2', 'none', C.vm, 3)),
'se détendre': S(EL(32, 44, 22, 10, C.azc) + PESSOA(32, 30, C.am, C.ti, false)),
'partager': S(CI(20, 32, 12, C.am) + CI(44, 32, 12, C.az) + P('M28 26l8 12-8 12', 'none', C.ti, 2.4)),
'discuter': S(BALAO(C.az) + '<circle cx="44" cy="40" r="14" fill="' + C.am + '" stroke="' + C.ti + '" stroke-width="2"/>'),
'expliquer': S(CI(20, 30, 12, C.am) + L(34, 30, 54, 30, 2.4, C.ti) + P('M48 24l6 6-6 6', 'none', C.ti, 2.4)),
'comparer': S(EL(18, 32, 12, 18, C.az, 2) + EL(46, 32, 12, 18, C.am, 2) + P('M18 14v-6M46 14v-6M18 8h28', 'none', C.ti, 2)),

/* --- OPINION (BASE) --- */
'à mon avis': S(BALAO(C.am, CI(32, 24, 3, C.ti, 0))),
'je pense que': S(BALAO(C.azc) + CI(46, 16, 3, C.br, 1.4) + CI(52, 10, 2, C.br, 1.4)),
'je trouve que': S(BALAO(C.rx, P('M24 22l4 4 8-8', 'none', C.ti, 2.2))),
"je suis d'accord": S(CI(32, 26, 18, C.vd) + P('M22 26l7 8 13-14', 'none', C.br, 3.6)),
"je ne suis pas d'accord": S(CI(32, 26, 18, C.vm) + P('M24 18l16 16M40 18l-16 16', 'none', C.br, 3.6)),
'c\'est vrai que': S(BALAO(C.vd, P('M24 22l4 4 8-8', 'none', C.br, 2.2))),
"c'est important": S(CI(32, 24, 3, C.br, 0) + R(29, 30, 6, 14, C.vm, 1.6) + '<circle cx="32" cy="24" r="22" fill="none" stroke="' + C.vm + '" stroke-width="3"/>'),
"c'est intéressant": S('<circle cx="26" cy="26" r="13" fill="' + C.am + '" stroke="' + C.ti + '" stroke-width="2.4"/>' + L(35, 35, 50, 50, 4, C.ti) + CI(26, 26, 2, C.ti, 0)),
'ça dépend': S(P('M14 40c0-14 8-22 18-22s18 8 18 22', 'none', C.ti, 3) + CI(14, 40, 3, C.az, 0) + CI(50, 40, 3, C.vm, 0) + CI(32, 18, 3, C.am, 0)),
'peut-être': S(CI(32, 24, 3, C.br, 0) + R(29, 30, 6, 14, C.am, 1.6) + '<circle cx="32" cy="24" r="22" fill="none" stroke="' + C.am + '" stroke-width="3" stroke-dasharray="5 4"/>')

};

var VOCAB_B1 = [
  {c:'b1-sentimentos', f:'content', p:'contente'},
  {c:'b1-sentimentos', f:'triste', p:'triste'},
  {c:'b1-sentimentos', f:'en colère', p:'com raiva'},
  {c:'b1-sentimentos', f:'surpris', p:'surpreso'},
  {c:'b1-sentimentos', f:'inquiet', p:'preocupado'},
  {c:'b1-sentimentos', f:'fatigué', p:'cansado'},
  {c:'b1-sentimentos', f:'détendu', p:'relaxado'},
  {c:'b1-sentimentos', f:'jaloux', p:'com ciúmes'},
  {c:'b1-sentimentos', f:'fier', p:'orgulhoso'},
  {c:'b1-sentimentos', f:'gêné', p:'sem graça, encabulado'},

  {c:'b1-personalidade', f:'généreux', p:'generoso'},
  {c:'b1-personalidade', f:'timide', p:'tímido'},
  {c:'b1-personalidade', f:'courageux', p:'corajoso'},
  {c:'b1-personalidade', f:'curieux', p:'curioso'},
  {c:'b1-personalidade', f:'patient', p:'paciente'},
  {c:'b1-personalidade', f:'têtu', p:'teimoso'},
  {c:'b1-personalidade', f:'sociable', p:'sociável'},
  {c:'b1-personalidade', f:'calme', p:'calmo'},
  {c:'b1-personalidade', f:'ambitieux', p:'ambicioso'},
  {c:'b1-personalidade', f:'honnête', p:'honesto'},

  {c:'b1-viagem', f:'la valise', p:'a mala'},
  {c:'b1-viagem', f:'le passeport', p:'o passaporte'},
  {c:'b1-viagem', f:'la carte', p:'o mapa'},
  {c:'b1-viagem', f:"l'hôtel", p:'o hotel'},
  {c:'b1-viagem', f:'la plage', p:'a praia'},
  {c:'b1-viagem', f:'la montagne', p:'a montanha'},
  {c:'b1-viagem', f:"le billet d'avion", p:'a passagem de avião'},
  {c:'b1-viagem', f:'la réservation', p:'a reserva'},
  {c:'b1-viagem', f:'le voyage', p:'a viagem'},
  {c:'b1-viagem', f:'la carte postale', p:'o cartão-postal'},

  {c:'b1-midia', f:'la télévision', p:'a televisão'},
  {c:'b1-midia', f:'la radio', p:'o rádio'},
  {c:'b1-midia', f:'le journal', p:'o jornal'},
  {c:'b1-midia', f:"l'ordinateur portable", p:'o notebook'},
  {c:'b1-midia', f:"l'email", p:'o e-mail'},
  {c:'b1-midia', f:'les réseaux sociaux', p:'as redes sociais'},
  {c:'b1-midia', f:'la publicité', p:'a publicidade'},
  {c:'b1-midia', f:"l'interview", p:'a entrevista'},
  {c:'b1-midia', f:"l'article", p:'o artigo'},
  {c:'b1-midia', f:'le message', p:'a mensagem'},

  {c:'b1-ambiente', f:"l'arbre", p:'a árvore'},
  {c:'b1-ambiente', f:'la forêt', p:'a floresta'},
  {c:'b1-ambiente', f:'la rivière', p:'o rio'},
  {c:'b1-ambiente', f:'la mer', p:'o mar'},
  {c:'b1-ambiente', f:"l'énergie solaire", p:'a energia solar'},
  {c:'b1-ambiente', f:'le recyclage', p:'a reciclagem'},
  {c:'b1-ambiente', f:'la planète', p:'o planeta'},
  {c:'b1-ambiente', f:'la nature', p:'a natureza'},
  {c:'b1-ambiente', f:"l'écologie", p:'a ecologia'},
  {c:'b1-ambiente', f:'la biodiversité', p:'a biodiversidade'},

  {c:'b1-trabalho', f:'le médecin', p:'o médico'},
  {c:'b1-trabalho', f:'le professeur', p:'o professor'},
  {c:'b1-trabalho', f:"l'avocat", p:'o advogado'},
  {c:'b1-trabalho', f:"l'ingénieur", p:'o engenheiro'},
  {c:'b1-trabalho', f:'le cuisinier', p:'o cozinheiro'},
  {c:'b1-trabalho', f:'le policier', p:'o policial'},
  {c:'b1-trabalho', f:"l'infirmier", p:'o enfermeiro'},
  {c:'b1-trabalho', f:'le vendeur', p:'o vendedor'},
  {c:'b1-trabalho', f:"l'employé", p:'o funcionário'},
  {c:'b1-trabalho', f:'le patron', p:'o chefe'},

  {c:'b1-tecnologia', f:'le smartphone', p:'o celular'},
  {c:'b1-tecnologia', f:"l'application", p:'o aplicativo'},
  {c:'b1-tecnologia', f:'le mot de passe', p:'a senha'},
  {c:'b1-tecnologia', f:'le wifi', p:'o wi-fi'},
  {c:'b1-tecnologia', f:'la caméra', p:'a câmera'},
  {c:'b1-tecnologia', f:'le clavier', p:'o teclado'},
  {c:'b1-tecnologia', f:"l'écran", p:'a tela'},
  {c:'b1-tecnologia', f:'le logiciel', p:'o software'},
  {c:'b1-tecnologia', f:'la batterie', p:'a bateria'},
  {c:'b1-tecnologia', f:'le réseau', p:'a rede'},

  {c:'b1-sociedade', f:'la loi', p:'a lei'},
  {c:'b1-sociedade', f:'le vote', p:'o voto'},
  {c:'b1-sociedade', f:'le gouvernement', p:'o governo'},
  {c:'b1-sociedade', f:'le citoyen', p:'o cidadão'},
  {c:'b1-sociedade', f:"l'égalité", p:'a igualdade'},
  {c:'b1-sociedade', f:'la liberté', p:'a liberdade'},
  {c:'b1-sociedade', f:'la communauté', p:'a comunidade'},
  {c:'b1-sociedade', f:'la tradition', p:'a tradição'},
  {c:'b1-sociedade', f:'la culture', p:'a cultura'},
  {c:'b1-sociedade', f:'la religion', p:'a religião'},

  {c:'b1-verbos', f:'décider', p:'decidir'},
  {c:'b1-verbos', f:'espérer', p:'esperar (desejar)'},
  {c:'b1-verbos', f:'réussir', p:'conseguir, ter sucesso'},
  {c:'b1-verbos', f:'échouer', p:'fracassar'},
  {c:'b1-verbos', f:"s'inquiéter", p:'preocupar-se'},
  {c:'b1-verbos', f:'se détendre', p:'relaxar'},
  {c:'b1-verbos', f:'partager', p:'compartilhar'},
  {c:'b1-verbos', f:'discuter', p:'discutir, conversar'},
  {c:'b1-verbos', f:'expliquer', p:'explicar'},
  {c:'b1-verbos', f:'comparer', p:'comparar'},

  {c:'b1-opiniao', f:'à mon avis', p:'na minha opinião'},
  {c:'b1-opiniao', f:'je pense que', p:'eu acho que'},
  {c:'b1-opiniao', f:'je trouve que', p:'eu acho que (avaliação)'},
  {c:'b1-opiniao', f:"je suis d'accord", p:'eu concordo'},
  {c:'b1-opiniao', f:"je ne suis pas d'accord", p:'eu não concordo'},
  {c:'b1-opiniao', f:"c'est vrai que", p:'é verdade que'},
  {c:'b1-opiniao', f:"c'est important", p:'é importante'},
  {c:'b1-opiniao', f:"c'est intéressant", p:'é interessante'},
  {c:'b1-opiniao', f:'ça dépend', p:'depende'},
  {c:'b1-opiniao', f:'peut-être', p:'talvez'}
];

var proxId = window.QI_VOCAB.length;
VOCAB_B1.forEach(function (v, i) { v.id = 'v' + (proxId + i); v.icone = ICONES_B1[v.f]; v.n = 'B1'; });

window.QI_VOCAB = window.QI_VOCAB.concat(VOCAB_B1);
for (var k in ICONES_B1) window.QI_ICONES[k] = ICONES_B1[k];
})();
