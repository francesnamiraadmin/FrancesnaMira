// =====================================================================
// QUESTÕES INTERATIVAS — vocabulário nível DELF (100 termos, 10 categorias:
// argumentação/opinião, ambiente/ecologia, educação/saber, mundo do
// trabalho, sociedade/solidariedade, cultura/mídia, saúde/bem-estar,
// tecnologia/inovação, expressões DELF, conectores DELF). Reaproveita
// window.QI_C / window.QI_DSL (carregar depois de questoesInterativasDados.js).
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

var ICONES_DELF = {

/* --- ARGUMENTATION ET OPINION --- */
'soutenir une thèse': S(T(16, 34, 48, 34, C.mr) + L(32, 10, 32, 34, 2.4) + PESSOA(32, 46, C.az, C.ti, false)),
'un point de vue': S('<circle cx="26" cy="26" r="13" fill="' + C.am + '" stroke="' + C.ti + '" stroke-width="2.4"/>' + L(35, 35, 50, 50, 4, C.ti) + CI(26, 26, 3, C.ti, 0)),
'un contre-argument': S(P('M12 32h16', 'none', C.az, 4) + P('M36 32h16', 'none', C.vm, 4) + P('M24 22l-8 10 8 10M40 22l8 10-8 10', 'none', C.ti, 2.4)),
'la nuance': S(EL(32, 32, 22, 16, C.br, 2) + R(14, 24, 9, 16, C.ti, 0) + R(23, 24, 9, 16, C.tis, 0) + R(32, 24, 9, 16, C.cz, 0) + R(41, 24, 9, 16, '#E4E8ED', 0)),
'la controverse': S(CI(20, 32, 14, C.az) + CI(44, 32, 14, C.vm) + L(30, 20, 30, 44, 2, C.ti) + L(34, 20, 34, 44, 2, C.ti)),
'convaincre': S(PESSOA(18, 40, C.am, C.ti, false) + BALAO(C.vd, P('M20 14l3 3 6-6', 'none', C.br, 2))),
'persuader': S(PESSOA(18, 40, C.rx, C.mr, true) + P('M32 20h20', 'none', C.vm, 2.6) + P('M46 14l6 6-6 6', 'none', C.vm, 2.6)),
'réfuter': S(BALAO(C.cz) + P('M20 24l16 12M36 24l-16 12', 'none', C.vm, 2.4)),
"l'argument": S(T(16, 34, 48, 34, C.am) + CI(32, 20, 4, C.vm, 1.6) + L(32, 24, 32, 34, 1.6, C.ti)),
'la preuve': S('<circle cx="26" cy="26" r="14" fill="' + C.br + '" stroke="' + C.ti + '" stroke-width="2.4"/>' + L(36, 36, 50, 50, 4, C.ti) + P('M20 26l4 4 8-8', 'none', C.vd, 2.6)),

/* --- ENVIRONNEMENT ET ÉCOLOGIE --- */
'la surpêche': S(P('M8 32c8-11 24-14 34-6 3 2 5 5 6 8-1 3-3 6-6 8-10 8-26 5-34-6Z', C.az, C.ti, 2) + L(46, 20, 54, 12, 2, C.mr) + CI(20, 29, 2.6, C.br, 1.5) + P('M40 32c4 4 10 4 14 0', 'none', C.vm, 2.2)),
"l'agriculture intensive": S(P('M8 50V26c0-6 4-10 8-10s8 4 8 10v24Z', C.vm, C.ti, 1.8) + P('M22 50V30c0-5 4-9 8-9s8 4 8 9v20Z', C.vm, C.ti, 1.8) + P('M36 50V22c0-6 4-10 8-10s8 4 8 10v28Z', C.vm, C.ti, 1.8) + L(2, 54, 62, 54, 2.4, C.mr)),
'le gaspillage': S(P('M14 22h36l-4 26H18Z', C.vm, C.ti, 2) + P('M22 22c0-8 4-14 10-14s10 6 10 14', 'none', C.ti, 2) + P('M46 12l8 8M54 12l-8 8', 'none', C.vm, 2.4)),
'la surpopulation': S(PESSOA(12, 44, C.az, C.ti, false) + PESSOA(24, 44, C.am, C.mr, true) + PESSOA(36, 44, C.vd, C.ti, false) + PESSOA(48, 44, C.rx, C.mr, true) + PESSOA(18, 30, C.lx, C.ti, false) + PESSOA(42, 30, C.mr, C.mr, true)),
'la ressource naturelle': S(CI(32, 32, 20, C.vd, 0) + CI(24, 26, 5, C.az) + CI(40, 30, 4, C.mr) + CI(30, 40, 4, C.am)),
'la catastrophe naturelle': S(P('M14 40c-7 0-11-5-11-10s5-9 11-9c1-7 8-11 16-11 9 0 16 5 17 12 6 1 11 5 11 10s-5 8-11 8Z', C.tis, C.ti, 2) + P('M22 42l4 8-8 2 10 8', 'none', C.vm, 2.2)),
"l'espèce en voie de disparition": S(P('M14 46V28c0-10 8-18 18-18h6l10-6-2 8 6 4-6 4v26h-8V32H24v14Z', C.mr, C.ti, 2) + L(10, 12, 54, 52, 2.2, C.vm, '3 3')),
'la protection de l\'environnement': S(P('M32 6l20 6v18c0 12-9 20-20 24-11-4-20-12-20-24V12Z', C.vd, C.ti, 2) + CI(28, 26, 6, C.vd) + R(26, 32, 4, 10, C.mr, 1)),
'le dérèglement climatique': S(CI(32, 32, 16, C.vm, 0) + P('M20 20l24 24M44 20 20 44', 'none', C.br, 1.8) + L(32, 8, 32, 14, 2.4, C.vm) + L(32, 50, 32, 56, 2.4, C.vm)),
"la pénurie d'eau": S(P('M32 8c10 14 16 22 16 30a16 16 0 0 1-32 0c0-8 6-16 16-30Z', 'none', C.az, 2.4) + P('M20 20l24 24M44 20 20 44', 'none', C.vm, 2)),

/* --- ÉDUCATION ET SAVOIR --- */
'la connaissance': S(P('M8 16c8-4 16-4 24 0v34c-8-4-16-4-24 0Z', C.az, C.ti, 2) + P('M56 16c-8-4-16-4-24 0v34c8-4 16-4 24 0Z', C.amf, C.ti, 2) + CI(32, 8, 4, C.am, 1.6)),
'le savoir-faire': S(R(18, 24, 28, 22, C.cz, 2) + P('M14 24a4 4 0 0 1 8 0v-4a4 4 0 0 1 8 0v4a4 4 0 0 1 8 0v-2a4 4 0 0 1 8 0v6c0 10-8 16-16 16s-16-6-16-16Z', C.am, C.ti, 1.6)),
"l'esprit critique": S(CI(32, 26, 12, C.lx) + L(32, 38, 32, 48, 2, C.mr) + '<circle cx="32" cy="26" r="18" fill="none" stroke="' + C.ti + '" stroke-width="1.6" stroke-dasharray="3 3"/>'),
'la transmission du savoir': S(PESSOA(16, 40, C.tis, C.cz, false) + PESSOA(48, 40, C.am, C.ti, false) + P('M26 28h12', 'none', C.am, 2, '3 2') + P('M36 24l4 4-4 4', 'none', C.am, 2)),
"l'analphabétisme": S(P('M8 16c8-4 16-4 24 0v34c-8-4-16-4-24 0Z', C.cz, C.ti, 2) + P('M56 16c-8-4-16-4-24 0v34c8-4 16-4 24 0Z', C.cz, C.ti, 2) + P('M22 20l20 20M42 20 22 40', 'none', C.vm, 2.6)),
'la scolarisation': S(R(10, 26, 44, 28, C.am) + P('M6 26l26-10 26 10Z', C.vm, C.ti, 2) + PES(32, 42, 0.9, C.br)),
"l'égalité des chances": S(PESSOA(18, 44, C.az, C.ti, false) + PESSOA(46, 44, C.am, C.mr, true) + L(18, 20, 18, 26, 2.4, C.vd) + L(46, 20, 46, 26, 2.4, C.vd) + L(10, 20, 26, 20, 2.4, C.vd) + L(38, 20, 54, 20, 2.4, C.vd)),
'le mérite': S(P('M32 8l6 14 15 2-11 10 3 15-13-8-13 8 3-15-11-10 15-2Z', C.am, C.ti, 2)),
"l'échec": S(CI(32, 32, 22, C.vm) + P('M22 22l20 20M42 22l-20 20', 'none', C.br, 4)),
'la réussite': S(CI(32, 32, 22, C.vd) + P('M20 32l8 8 16-16', 'none', C.br, 4)),

/* --- MONDE DU TRAVAIL --- */
'le télétravail': S(R(10, 14,44, 26, C.ti, 3) + R(14, 18, 36, 18, C.azc, 1) + T(30, 44, 34, 40, C.vd) + L(20, 54, 44, 54, 2, C.mr)),
'l\'équilibre vie pro-perso': S(T(16, 34, 48, 34, C.mr) + L(32, 10, 32, 34, 2.4) + R(20, 24, 8, 8, C.az, 1.4) + T(48, 20, 56, 14, C.vm)),
'le harcèlement au travail': S(PESSOA(24, 40, C.cz, C.ti, false) + PESSOA(44, 30, C.vm, C.ti, false) + P('M36 30h4M36 26h4M36 34h4', 'none', C.vm, 2)),
'la précarité': S(R(18, 30, 28, 20, C.cz, 2) + L(20, 30, 46, 46, 2, C.vm, '3 3') + CI(28, 24, 6, C.cz, 1.6)),
'la grève': S(PESSOA(20, 40, C.vm, C.ti, false, R(6, 12, 4, 20, C.ti, 1) + R(2, 8, 12, 6, C.am, 1)) + PESSOA(36, 42, C.az, C.mr, true) + PESSOA(50, 40, C.vd, C.ti, false)),
'le syndicat': S(PESSOA(16, 42, C.az, C.ti, false) + PESSOA(32, 40, C.am, C.mr, true) + PESSOA(48, 42, C.vd, C.ti, false) + '<circle cx="32" cy="38" r="26" fill="none" stroke="' + C.ti + '" stroke-width="1.4" stroke-dasharray="3 3"/>'),
'la reconversion professionnelle': S(P('M46 18a18 18 0 1 0 4 20', 'none', C.vd, 3) + P('M52 12v10h-10', 'none', C.vd, 3) + R(14, 24, 12, 16, C.br, 1.6)),
'le monde du travail': S(R(20, 30, 24, 20, C.br, 2) + T(18, 30, 46, 16, C.az) + CI(32, 40, 4, C.am, 1.4) + PESSOA(10, 44, C.az, C.ti, false) + PESSOA(54, 44, C.vd, C.ti, false)),
'la productivité': S(P('M8 46h48', 'none', C.ti, 2) + P('M14 40l12-10 8 6 16-18', 'none', C.vd, 3) + CI(50, 18, 4, C.vd, 1.4) + L(14, 46, 14, 40, 2, C.cz)),
"l'épanouissement professionnel": S(CI(32, 24, 12, C.am) + L(32, 36, 32, 48, 2, C.mr) + P('M22 24l4 4M46 24l-4 4M32 12v-4', 'none', C.vm, 2) + P('M22 52c4-3 16-3 20 0', 'none', C.br, 2)),

/* --- SOCIÉTÉ ET SOLIDARITÉ --- */
'le bénévolat': S(PESSOA(32, 34, C.vd, C.ti, false) + P('M22 46h20', 'none', C.vm, 2, '2 2') + P('M40 12c2-4 8-4 8 0 0 4-8 8-8 8s-8-4-8-8c0-4 6-4 8 0Z', C.vm, C.ti, 1.4)),
'la fraternité': S(PESSOA(20, 40, C.az, C.ti, false) + PESSOA(44, 40, C.am, C.mr, true) + P('M30 30h4M30 34h4', 'none', C.vm, 2)),
"l'entraide": S(PESSOA(18, 42, C.az, C.ti, false) + PESSOA(46, 42, C.vd, C.mr, true) + P('M28 34l8 0', 'none', C.ti, 2.6)),
'le don': S(R(20, 30, 24, 18, C.vm, 2) + R(16, 24, 32, 8, C.am, 2) + L(32, 24, 32, 48, 1.6, C.ti) + P('M24 24c-4 0-8-3-8-8s6-4 8 0M40 24c4 0 8-3 8-8s-6-4-8 0', 'none', C.ti, 1.8)),
'la générosité': S(P('M32 46C16 34 10 24 16 16c5-6 13-4 16 2 3-6 11-8 16-2 6 8 0 18-16 30Z', C.vm, C.ti, 2)),
'la fracture sociale': S(R(8, 20, 20, 30, C.cz, 1.4) + R(36, 8, 20, 42, C.am, 1.4) + P('M28 10v44', 'none', C.vm, 2.4, '4 4')),
'la cohésion sociale': S(PESSOA(14, 40, C.az, C.ti, false) + PESSOA(28, 38, C.am, C.mr, true) + PESSOA(42, 40, C.vd, C.ti, false) + PESSOA(54, 38, C.rx, C.mr, true) + P('M8 48h52', 'none', C.ti, 1.6, '2 2')),
'le vivre-ensemble': S(CI(20, 30, 9, C.az) + CI(36, 30, 9, C.am) + CI(28, 42, 9, C.vd)),
'la marginalisation': S(PESSOA(48, 24, C.cz, C.cz, false) + '<circle cx="48" cy="30" r="14" fill="none" stroke="' + C.ti + '" stroke-width="1.4" stroke-dasharray="2 2"/>' + PESSOA(16, 44, C.az, C.ti, false) + PESSOA(30, 44, C.am, C.mr, true)),
"l'insertion sociale": S(CI(32, 32, 20, C.br, 2) + PESSOA(32, 36, C.vd, C.ti, false) + P('M12 32h8M44 32h8', 'none', C.vd, 2.4)),

/* --- CULTURE ET MÉDIAS --- */
'la mondialisation': S(CI(32, 32, 20, C.az) + '<ellipse cx="32" cy="32" rx="20" ry="7" fill="none" stroke="' + C.br + '" stroke-width="1.6"/>' + L(32, 12, 32, 52, 1.6, C.br) + '<ellipse cx="32" cy="32" rx="8" ry="20" fill="none" stroke="' + C.br + '" stroke-width="1.6"/>'),
'le patrimoine culturel': S(P('M6 24 32 10l26 14Z', C.azc, C.ti, 2) + R(13, 27, 6, 19, C.br) + R(29, 27, 6, 19, C.br) + R(45, 27, 6, 19, C.br) + R(6, 46, 52, 7, C.am, 1.5)),
'la diversité culturelle': S(CI(16, 32, 12, C.az) + CI(32, 32, 12, C.am) + CI(48, 32, 12, C.vd)),
"l'identité culturelle": S(CI(32, 26, 12, C.am) + P('M14 54c2-14 8-20 18-20s16 6 18 20', 'none', C.mr, 2.4) + '<circle cx="32" cy="26" r="18" fill="none" stroke="' + C.ti + '" stroke-width="1.4" stroke-dasharray="3 3"/>'),
"l'influence des médias": S(R(8, 16, 48, 32, C.ti, 3) + CI(32, 32, 12, C.vm) + PESSOA(32, 56, C.am, C.ti, false)),
'la culture populaire': S(CI(20, 46, 6, C.ti, 0) + CI(44, 42, 6, C.ti, 0) + L(26, 46, 26, 14, 2.4) + L(50, 42, 50, 10, 2.4) + L(26, 14, 50, 10, 2.4) + '<circle cx="32" cy="32" r="26" fill="none" stroke="' + C.am + '" stroke-width="1.4" stroke-dasharray="2 3"/>'),
'le stéréotype': S(R(10, 16,44, 32, C.cz, 2) + PES(22, 32, 0.9, C.ti) + PES(32, 32, 0.9, C.ti) + PES(42, 32, 0.9, C.ti)),
"l'appropriation culturelle": S(CI(32, 28, 14, C.am) + P('M20 46c-2-2-2-4 0-6M44 46c2-2 2-4 0-6', 'none', C.vm, 2.4)),
"la critique d'art": S(EL(26, 30, 20, 15, C.br) + CI(16, 25, 3.5, C.vm) + CI(26, 19, 3.5, C.am) + CI(36, 25, 3.5, C.az) + P('M46 42l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z', C.am, C.ti, 1.4)),
"l'industrie culturelle": S(R(10, 26, 44, 26, C.ti, 2) + P('M14 26V16h8v10M26 26V12h8v14M42 26V20h8v6', 'none', C.am, 2)),

/* --- SANTÉ ET BIEN-ÊTRE (DELF) --- */
"l'espérance de vie": S(P('M32 12c-4 6-4 14 0 20-4 6-4 14 0 20-4 6-4 14 0 20', 'none', C.vm, 2.6) + CI(32, 12, 3, C.am, 1.4) + '<circle cx="32" cy="32" r="24" fill="none" stroke="' + C.ti + '" stroke-width="1.4" stroke-dasharray="3 3"/>'),
'la prévention': S('<circle cx="32" cy="32" r="20" fill="' + C.vd + '" stroke="' + C.ti + '" stroke-width="2.4"/>' + P('M22 32l7 8 13-14', 'none', C.br, 3.6)),
"l'addiction": S(CI(32, 32, 20, C.lx, 0) + P('M24 24a8 8 0 0 1 16 0c0 6-8 8-8 16', 'none', C.br, 2.6) + CI(32, 46, 1.6, C.br, 0)),
'le sommeil': S(EL(32, 44, 22, 10, C.azc) + CI(32, 30, 12, C.lx) + P('M14 20h6M12 26h6', 'none', C.am, 2)),
"l'obésité": S(CI(32, 30, 18, C.am) + P('M14 46q18 8 36 0', 'none', C.ti, 1.6)),
'le sport-santé': S(CI(20, 12, 6, C.am) + P('M20 18v14l-8 12M20 32l8 10', 'none', C.ti, 3) + P('M12 44l-4 12M28 42l6 12', 'none', C.ti, 3) + CI(48, 32, 12, C.vd, 0) + P('M42 32l4 4 8-8', 'none', C.br, 2)),
'la qualité de vie': S(P('M32 46C16 34 10 24 16 16c5-6 13-4 16 2 3-6 11-8 16-2 6 8 0 18-16 30Z', C.vm, C.ti, 1.8) + CI(32, 26, 3, C.br, 0)),
'le rythme de vie': S(P('M8 32h8l4-14 8 28 4-14 6 0', 'none', C.vm, 2.6) + P('M40 32h16', 'none', C.cz, 2.6)),
'la surcharge mentale': S(CI(32, 30, 16, C.azc) + P('M32 14v-6M46 22l4-4M18 22l-4-4', 'none', C.vm, 2.2) + R(24, 26, 16, 12, C.br, 1)),
'le droit à la santé': S(CI(32, 26, 14, C.az) + P('M25 26l5 6 10-10', 'none', C.br, 3) + L(20, 50, 44, 50, 2, C.ti)),

/* --- TECHNOLOGIE ET INNOVATION --- */
'la réalité virtuelle': S(R(14, 24, 36, 18, C.ti, 6) + CI(24, 33, 6, C.azc) + CI(40, 33, 6, C.azc) + L(20, 14, 20, 24, 2, C.cz) + L(44, 14, 44, 24, 2, C.cz)),
'les objets connectés': S(CI(16, 32, 8, C.am) + CI(48, 16, 6, C.az) + CI(48, 48, 6, C.vd) + P('M22 30l20-12M22 34l20 12', 'none', C.ti, 1.6, '2 2')),
'la donnée personnelle': S(R(14, 12, 36, 24, C.ti, 2) + '<ellipse cx="32" cy="44" rx="18" ry="8" fill="' + C.az + '" stroke="' + C.ti + '" stroke-width="2"/>' + P('M14 44v-8a18 8 0 0 0 36 0v8', 'none', C.az, 2)),
'la cybersécurité': S(P('M32 6l20 6v18c0 12-9 20-20 24-11-4-20-12-20-24V12Z', C.az, C.ti, 2) + R(26, 26, 12, 10, C.ti, 1.4) + P('M28 26v-4a4 4 0 0 1 8 0v4', 'none', C.ti, 1.6)),
"l'innovation": S(CI(32, 22, 10, C.am) + R(28, 32, 8, 12, C.cz, 1.6) + L(32, 8, 32, 12, 2, C.am) + L(16, 22, 20, 22, 2, C.am) + L(44, 22, 48, 22, 2, C.am) + P('M44 10l4 4', 'none', C.am, 2)),
'la disruption': S(R(10, 40, 44, 8, C.cz, 1) + P('M10 40l14-14 8 8 22-22', 'none', C.vm, 3)),
'le progrès technique': S(P('M8 46h12v-8h12v-10h12V16h12v-8', 'none', C.vd, 4) + R(46, 4, 8, 8, C.am, 1)),
"l'automatisation": S(R(20, 18, 24, 24, C.cz, 3) + CI(32, 10, 4, C.am, 1.6) + L(32, 14, 32, 18, 2) + CI(27, 28, 2, C.az, 0) + CI(37, 28, 2, C.az, 0) + P('M44 30a18 18 0 1 1 0-8', 'none', C.vd, 2, '3 2')),
'la fracture numérique': S(R(6, 20, 22, 26, C.br, 2) + R(36, 12, 22, 34, C.br, 2) + L(30, 10, 30, 54, 2.4, C.vm, '4 4')),
"l'intelligence collective": S(CI(16, 20, 6, C.am) + CI(48, 20, 6, C.az) + CI(16, 44, 6, C.vd) + CI(48, 44, 6, C.rx) + CI(32, 32, 8, C.ti) + L(16, 20, 32, 32, 1.6, C.ti) + L(48, 20, 32, 32, 1.6, C.ti) + L(16, 44, 32, 32, 1.6, C.ti) + L(48, 44, 32, 32, 1.6, C.ti)),

/* --- EXPRESSIONS DELF --- */
"il n'en demeure pas moins que": S(CI(32, 32, 20, C.br, 2) + L(20, 32, 44, 32, 3, C.ti) + CI(20, 32, 3, C.vm, 0) + CI(44, 32, 3, C.vd, 0)),
'il convient de souligner': S(L(10, 20, 54, 20, 2.4, C.ti) + L(10, 30, 40, 30, 2.4, C.ti) + L(10, 44, 44, 44, 4, C.am)),
'cela étant dit': S(BALAO(C.cz) + P('M20 24h20', 'none', C.ti, 1.6, '2 2')),
'à cet égard': S(CI(32, 32, 4, C.vm, 0) + '<circle cx="32" cy="32" r="18" fill="none" stroke="' + C.am + '" stroke-width="2" stroke-dasharray="4 3"/>'),
"en d'autres termes": S(P('M4 10h26a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H14l-6 6v-6H4Z', C.az, C.ti, 1.6) + P('M40 30h20a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H50l-6 6v-6h-4Z', C.am, C.ti, 1.6) + P('M22 30l8 6-8 6', 'none', C.ti, 2)),
'autrement dit': S(P('M12 24h30', 'none', C.az, 3) + P('M34 16l8 8-8 8', 'none', C.az, 3) + BALAO(C.am)),
'il va sans dire que': S(CI(32, 32, 20, C.vd, 0) + P('M22 32l7 8 13-14', 'none', C.br, 3.6) + L(32, 8, 32, 4, 2, C.ti)),
'on peut se demander si': S(BALAO(C.am, CI(32, 24, 3, C.ti, 0))),
'il serait souhaitable de': S(CI(32, 20, 8, C.am) + P('M18 42c0-8 6-16 14-16s14 8 14 16', 'none', C.vd, 2.4) + L(32, 28, 32, 34, 2, C.ti)),
'tout porte à croire que': S(P('M8 46 20 30l10 8 24-26', 'none', C.vd, 3.2) + CI(20, 30, 2.4, C.vd, 0) + CI(30, 38, 2.4, C.vd, 0)),

/* --- CONNECTEURS DELF --- */
'de sorte que': S(P('M10 32h20', 'none', C.ti, 2.6) + P('M38 32h16', 'none', C.vd, 3.4) + P('M48 26l6 6-6 6', 'none', C.vd, 3.4)),
'si bien que': S(P('M10 20l16 24', 'none', C.ti, 2.4) + P('M32 44h20', 'none', C.vd, 3.4) + P('M46 38l6 6-6 6', 'none', C.vd, 3.4)),
'dans la mesure où': S(R(10, 20, 22, 24, C.br, 2) + P('M18 22v20', 'none', C.ti, 1.4) + P('M24 26v16', 'none', C.ti, 1.4) + P('M40 32h16', 'none', C.vm, 3)),
'étant donné que': S(CI(20, 32, 12, C.am, 2) + P('M17 32l2 2 4-4', 'none', C.ti, 1.8) + P('M36 32h20', 'none', C.vd, 3)),
'à moins que': S(CI(32, 32, 20, C.br, 2) + L(22, 22, 42, 42, 2.6, C.vm) + CI(24, 24, 2, C.vm, 0)),
'pourvu que': S(CI(20, 24, 9, C.am, 2) + P('M17 24l2 2 4-4', 'none', C.ti, 1.6) + P('M32 32h20', 'none', C.ti, 1.6, '3 3')),
"quoi qu'il en soit": S('<circle cx="32" cy="32" r="20" fill="none" stroke="' + C.ti + '" stroke-width="3" stroke-dasharray="6 4"/>' + CI(32, 32, 5, C.am, 1.6)),
'en tout état de cause': S(CI(32, 32, 22, C.br, 2) + L(14, 32, 50, 32, 2.4, C.ti) + CI(14, 32, 3, C.vd, 0) + CI(50, 32, 3, C.vd, 0)),
"d'une part... d'autre part": S(CI(16, 32, 12, C.az, 2) + CI(48, 32, 12, C.am, 2) + L(28, 32, 36, 32, 2, C.ti, '2 2')),
'non seulement... mais aussi': S(L(10, 44, 10, 20, 4, C.az) + L(26, 44, 26, 12, 4, C.am) + L(42, 44, 42, 28, 4, C.vd) + P('M50 20l4-4 4 4', 'none', C.ti, 2))

};

var VOCAB_DELF = [
  {c:'delf-argumentacao', f:'soutenir une thèse', p:'defender uma tese'},
  {c:'delf-argumentacao', f:'un point de vue', p:'um ponto de vista'},
  {c:'delf-argumentacao', f:'un contre-argument', p:'um contra-argumento'},
  {c:'delf-argumentacao', f:'la nuance', p:'a nuance'},
  {c:'delf-argumentacao', f:'la controverse', p:'a controvérsia'},
  {c:'delf-argumentacao', f:'convaincre', p:'convencer'},
  {c:'delf-argumentacao', f:'persuader', p:'persuadir'},
  {c:'delf-argumentacao', f:'réfuter', p:'refutar'},
  {c:'delf-argumentacao', f:"l'argument", p:'o argumento'},
  {c:'delf-argumentacao', f:'la preuve', p:'a prova, evidência'},

  {c:'delf-ambiente', f:'la surpêche', p:'a pesca predatória'},
  {c:'delf-ambiente', f:"l'agriculture intensive", p:'a agricultura intensiva'},
  {c:'delf-ambiente', f:'le gaspillage', p:'o desperdício'},
  {c:'delf-ambiente', f:'la surpopulation', p:'a superpopulação'},
  {c:'delf-ambiente', f:'la ressource naturelle', p:'o recurso natural'},
  {c:'delf-ambiente', f:'la catastrophe naturelle', p:'a catástrofe natural'},
  {c:'delf-ambiente', f:"l'espèce en voie de disparition", p:'a espécie em extinção'},
  {c:'delf-ambiente', f:"la protection de l'environnement", p:'a proteção ambiental'},
  {c:'delf-ambiente', f:'le dérèglement climatique', p:'o desregramento climático'},
  {c:'delf-ambiente', f:"la pénurie d'eau", p:'a escassez de água'},

  {c:'delf-educacao', f:'la connaissance', p:'o conhecimento'},
  {c:'delf-educacao', f:'le savoir-faire', p:'o know-how, a expertise'},
  {c:'delf-educacao', f:"l'esprit critique", p:'o espírito crítico'},
  {c:'delf-educacao', f:'la transmission du savoir', p:'a transmissão do saber'},
  {c:'delf-educacao', f:"l'analphabétisme", p:'o analfabetismo'},
  {c:'delf-educacao', f:'la scolarisation', p:'a escolarização'},
  {c:'delf-educacao', f:"l'égalité des chances", p:'a igualdade de oportunidades'},
  {c:'delf-educacao', f:'le mérite', p:'o mérito'},
  {c:'delf-educacao', f:"l'échec", p:'o fracasso'},
  {c:'delf-educacao', f:'la réussite', p:'o sucesso'},

  {c:'delf-trabalho', f:'le télétravail', p:'o teletrabalho'},
  {c:'delf-trabalho', f:"l'équilibre vie pro-perso", p:'o equilíbrio vida pessoal-profissional'},
  {c:'delf-trabalho', f:'le harcèlement au travail', p:'o assédio no trabalho'},
  {c:'delf-trabalho', f:'la précarité', p:'a precariedade'},
  {c:'delf-trabalho', f:'la grève', p:'a greve'},
  {c:'delf-trabalho', f:'le syndicat', p:'o sindicato'},
  {c:'delf-trabalho', f:'la reconversion professionnelle', p:'a reconversão profissional'},
  {c:'delf-trabalho', f:'le monde du travail', p:'o mundo do trabalho'},
  {c:'delf-trabalho', f:'la productivité', p:'a produtividade'},
  {c:'delf-trabalho', f:"l'épanouissement professionnel", p:'a realização profissional'},

  {c:'delf-sociedade', f:'le bénévolat', p:'o voluntariado'},
  {c:'delf-sociedade', f:'la fraternité', p:'a fraternidade'},
  {c:'delf-sociedade', f:"l'entraide", p:'a ajuda mútua'},
  {c:'delf-sociedade', f:'le don', p:'a doação'},
  {c:'delf-sociedade', f:'la générosité', p:'a generosidade'},
  {c:'delf-sociedade', f:'la fracture sociale', p:'a fratura social'},
  {c:'delf-sociedade', f:'la cohésion sociale', p:'a coesão social'},
  {c:'delf-sociedade', f:'le vivre-ensemble', p:'a convivência social'},
  {c:'delf-sociedade', f:'la marginalisation', p:'a marginalização'},
  {c:'delf-sociedade', f:"l'insertion sociale", p:'a inserção social'},

  {c:'delf-cultura', f:'la mondialisation', p:'a globalização'},
  {c:'delf-cultura', f:'le patrimoine culturel', p:'o patrimônio cultural'},
  {c:'delf-cultura', f:'la diversité culturelle', p:'a diversidade cultural'},
  {c:'delf-cultura', f:"l'identité culturelle", p:'a identidade cultural'},
  {c:'delf-cultura', f:"l'influence des médias", p:'a influência da mídia'},
  {c:'delf-cultura', f:'la culture populaire', p:'a cultura popular'},
  {c:'delf-cultura', f:'le stéréotype', p:'o estereótipo'},
  {c:'delf-cultura', f:"l'appropriation culturelle", p:'a apropriação cultural'},
  {c:'delf-cultura', f:"la critique d'art", p:'a crítica de arte'},
  {c:'delf-cultura', f:"l'industrie culturelle", p:'a indústria cultural'},

  {c:'delf-saude', f:"l'espérance de vie", p:'a expectativa de vida'},
  {c:'delf-saude', f:'la prévention', p:'a prevenção'},
  {c:'delf-saude', f:"l'addiction", p:'o vício, a dependência'},
  {c:'delf-saude', f:'le sommeil', p:'o sono'},
  {c:'delf-saude', f:"l'obésité", p:'a obesidade'},
  {c:'delf-saude', f:'le sport-santé', p:'o esporte como saúde'},
  {c:'delf-saude', f:'la qualité de vie', p:'a qualidade de vida'},
  {c:'delf-saude', f:'le rythme de vie', p:'o ritmo de vida'},
  {c:'delf-saude', f:'la surcharge mentale', p:'a sobrecarga mental'},
  {c:'delf-saude', f:'le droit à la santé', p:'o direito à saúde'},

  {c:'delf-tecnologia', f:'la réalité virtuelle', p:'a realidade virtual'},
  {c:'delf-tecnologia', f:'les objets connectés', p:'os objetos conectados'},
  {c:'delf-tecnologia', f:'la donnée personnelle', p:'o dado pessoal'},
  {c:'delf-tecnologia', f:'la cybersécurité', p:'a cibersegurança'},
  {c:'delf-tecnologia', f:"l'innovation", p:'a inovação'},
  {c:'delf-tecnologia', f:'la disruption', p:'a disrupção'},
  {c:'delf-tecnologia', f:'le progrès technique', p:'o progresso técnico'},
  {c:'delf-tecnologia', f:"l'automatisation", p:'a automação'},
  {c:'delf-tecnologia', f:'la fracture numérique', p:'a exclusão digital'},
  {c:'delf-tecnologia', f:"l'intelligence collective", p:'a inteligência coletiva'},

  {c:'delf-expressoes', f:"il n'en demeure pas moins que", p:'ainda assim é fato que'},
  {c:'delf-expressoes', f:'il convient de souligner', p:'convém destacar'},
  {c:'delf-expressoes', f:'cela étant dit', p:'dito isso'},
  {c:'delf-expressoes', f:'à cet égard', p:'a esse respeito'},
  {c:'delf-expressoes', f:"en d'autres termes", p:'em outras palavras'},
  {c:'delf-expressoes', f:'autrement dit', p:'ou seja, em outras palavras'},
  {c:'delf-expressoes', f:'il va sans dire que', p:'nem é preciso dizer que'},
  {c:'delf-expressoes', f:'on peut se demander si', p:'pode-se perguntar se'},
  {c:'delf-expressoes', f:'il serait souhaitable de', p:'seria desejável'},
  {c:'delf-expressoes', f:'tout porte à croire que', p:'tudo leva a crer que'},

  {c:'delf-conectores', f:'de sorte que', p:'de modo que'},
  {c:'delf-conectores', f:'si bien que', p:'de tal forma que'},
  {c:'delf-conectores', f:'dans la mesure où', p:'na medida em que'},
  {c:'delf-conectores', f:'étant donné que', p:'dado que'},
  {c:'delf-conectores', f:'à moins que', p:'a menos que'},
  {c:'delf-conectores', f:'pourvu que', p:'contanto que'},
  {c:'delf-conectores', f:"quoi qu'il en soit", p:'seja como for'},
  {c:'delf-conectores', f:'en tout état de cause', p:'de qualquer forma'},
  {c:'delf-conectores', f:"d'une part... d'autre part", p:'por um lado... por outro lado'},
  {c:'delf-conectores', f:'non seulement... mais aussi', p:'não só... mas também'}
];

var proxId = window.QI_VOCAB.length;
VOCAB_DELF.forEach(function (v, i) { v.id = 'v' + (proxId + i); v.icone = ICONES_DELF[v.f]; v.n = 'DELF'; });

window.QI_VOCAB = window.QI_VOCAB.concat(VOCAB_DELF);
for (var k in ICONES_DELF) window.QI_ICONES[k] = ICONES_DELF[k];
})();
