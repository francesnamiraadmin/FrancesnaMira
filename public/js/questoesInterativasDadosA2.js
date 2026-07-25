// =====================================================================
// QUESTÕES INTERATIVAS — vocabulário nível A2 (~113 termos, 11 categorias:
// família, corpo, vestimentas, comida, casa, meteorologia, cores, animais,
// lazer, adjetivos, verbos do cotidiano). Reaproveita a paleta e a DSL de
// desenho SVG expostas por questoesInterativasDados.js (window.QI_C /
// window.QI_DSL) — carregar este arquivo DEPOIS daquele. Concatena em
// window.QI_VOCAB e mescla em window.QI_ICONES.
// =====================================================================
(function () {
var C = window.QI_C;
var S = window.QI_DSL.S, R = window.QI_DSL.R, W = window.QI_DSL.W, D = window.QI_DSL.D,
    CI = window.QI_DSL.CI, EL = window.QI_DSL.EL, T = window.QI_DSL.T, L = window.QI_DSL.L,
    P = window.QI_DSL.P, PES = window.QI_DSL.PES;

/** pessoa simples de frente: cabeça + cabelo + corpo, pra família/profissões/etc. */
function PESSOA(cx, cy, corRoupa, corCabelo, longo, extra) {
  var cabelo = longo
    ? P('M' + (cx - 7) + ' ' + (cy - 16) + 'c-2 8 0 13 0 13h3v-9l4-3 4 3v9h3s2-5 0-13Z', corCabelo, C.ti, 1.4)
    : P('M' + (cx - 7) + ' ' + (cy - 18) + 'a7 7 0 0 1 14 0Z', corCabelo, C.ti, 1.4);
  return cabelo + CI(cx, cy - 16, 7, C.am) +
    P('M' + (cx - 10) + ' ' + (cy + 18) + 'c-1-13 4-20 10-20s11 7 10 20Z', corRoupa, C.ti, 2) +
    (extra || '');
}
/** gota de tinta, pra ícones de cor */
function GOTA(cor) {
  return P('M32 8c10 14 16 22 16 30a16 16 0 0 1-32 0c0-8 6-16 16-30Z', cor, C.ti, 2) +
    EL(26, 34, 3.5, 5, C.br, 0);
}

var ICONES_A2 = {

/* --- FAMILLE --- */
'le père': S(PESSOA(32, 34, C.az, C.ti, false, P('M27 40h10', 'none', C.br, 1.6) + L(26, 18, 38, 18, 2, C.tis))),
'la mère': S(PESSOA(32, 34, C.rx, C.mr, true)),
'le frère': S(PESSOA(28, 38, C.vd, C.ti, false, EL(28, 16, 8, 3, C.az, 1))),
'la sœur': S(PESSOA(36, 38, C.am, C.mr, true, CI(29, 20, 1.6, C.vm, 0) + CI(43, 20, 1.6, C.vm, 0))),
'les grands-parents': S(PESSOA(20, 40, C.cz, C.cz, false) + PESSOA(44, 40, C.lx, C.cz, true) +
  L(10, 58, 10, 50, 2) + L(54, 58, 54, 50, 2)),
'le grand-père': S(PESSOA(30, 36, C.tis, C.cz, false, '<circle cx="27" cy="18" r="3" fill="none" stroke="' + C.ti + '" stroke-width="1.4"/><circle cx="33" cy="18" r="3" fill="none" stroke="' + C.ti + '" stroke-width="1.4"/>' + L(46, 40, 50, 56, 2.4, C.mr))),
'la grand-mère': S(PESSOA(32, 34, C.lx, C.cz, false, EL(32, 12, 9, 5, C.cz, 1.4) + L(20, 44, 16, 30, 2, C.rx))),
'le fils': S(PESSOA(30, 42, C.azc, C.ti, false, R(24, 46, 12, 8, C.az, 2))),
'la fille': S(PESSOA(34, 42, C.rx, C.mr, false, CI(27, 24, 1.6, C.ti, 0) + CI(41, 24, 1.6, C.ti, 0))),
"l'oncle": S(PESSOA(32, 34, C.vd, C.mr, false, P('M27 40h10', 'none', C.ti, 2) + R(22, 8, 20, 8, C.mr, 2))),
'la tante': S(PESSOA(32, 34, C.amf, C.vm, true, CI(32, 44, 2.4, C.am, 1.4))),
'le cousin': S(PESSOA(30, 40, C.az, C.ti, false, R(38, 32, 10, 14, C.vm, 2))),

/* --- LE CORPS --- */
'la tête': S(CI(32, 34, 20, C.am) + CI(24, 30, 2.4, C.ti, 0) + CI(40, 30, 2.4, C.ti, 0) + P('M25 42c4 4 10 4 14 0', 'none', C.ti, 2)),
'les yeux': S(CI(32, 34, 20, C.am, 1.4) + EL(24, 32, 6, 4, C.br) + EL(40, 32, 6, 4, C.br) + CI(24, 32, 2.4, C.ti, 0) + CI(40, 32, 2.4, C.ti, 0)),
'le nez': S(CI(32, 34, 20, C.am, 1.4) + P('M32 24v14c0 3 4 3 5 0', 'none', C.ti, 2.4) + CI(24, 30, 2, C.ti, 0) + CI(40, 30, 2, C.ti, 0)),
'la bouche': S(CI(32, 34, 20, C.am, 1.4) + P('M20 40c6 8 18 8 24 0', C.vm, C.ti, 2) + CI(24, 30, 2, C.ti, 0) + CI(40, 30, 2, C.ti, 0)),
'les mains': S(P('M14 30c-4 0-6 4-6 8s4 6 8 4l2-2v10h28V32c0-6-4-10-10-10H24c-6 0-8 4-10 8Z', C.am, C.ti, 2) +
  P('M50 30c4 0 6 4 6 8s-4 6-8 4l-2-2', 'none', C.ti, 2)),
'les pieds': S(P('M14 46c-4 2-6 6-2 8h16c2-8 0-24 0-24H16Z', C.am, C.ti, 2) + P('M34 46c-4 2-6 6-2 8h16c2-8 0-24 0-24H36Z', C.am, C.ti, 2)),
'le ventre': S(P('M20 20c-4 10-4 22 2 30 6 8 20 8 24 0 6-10 6-20 2-30', C.am, C.ti, 2) + CI(32, 36, 5, C.amf)),
'le dos': S(P('M22 14c-6 6-8 16-6 30l4 14h24l4-14c2-14 0-24-6-30-6-4-14-4-20 0Z', C.am, C.ti, 2) + L(32, 20, 32, 50, 1.6, C.mr, '4 4')),
'les cheveux': S(P('M14 32c0-14 8-22 18-22s18 8 18 22c0 4-2 6-2 6l-4-8-6 6-6-6-6 6-4-8s-8-2-8 4Z', C.mr, C.ti, 2) + CI(32, 40, 12, C.am, 0)),
'les oreilles': S(CI(32, 34, 18, C.am, 1.4) + EL(13, 34, 4, 6, C.am) + EL(51, 34, 4, 6, C.am) + CI(24, 30, 2, C.ti, 0) + CI(40, 30, 2, C.ti, 0)),

/* --- LES VÊTEMENTS --- */
'le pantalon': S(P('M18 8h28v10l-4 38h-8l-2-26-2 26h-8l-4-38Z', C.az, C.ti, 2)),
'la chemise': S(P('M20 12l-10 8 6 8 4-2v30h24V26l4 2 6-8-10-8-6 4h-8Z', C.br, C.ti, 2) + L(32, 16, 32, 52, 1.4, C.cz)),
'la robe': S(P('M22 10h20l4 10-6 4 8 30H16l8-30-6-4Z', C.rx, C.ti, 2) + CI(32, 12, 3, C.br, 1.4)),
'les chaussures': S(P('M6 44c0-6 4-10 10-10l4-6h10v10l6 2c4 1 6 3 6 6v2H6Z', C.mr, C.ti, 2) + P('M36 44c0-6 4-10 10-10l4-6h10v10l4 2v6c2 0 2 2 0 2H36Z', C.mr, C.ti, 2)),
'le manteau': S(P('M18 10l14 6 14-6 6 12-8 4v30H20V26l-8-4Z', C.tis, C.ti, 2) + L(32, 16, 32, 52, 1.4, C.cz) + CI(28, 26, 1.4, C.am, 0) + CI(28, 34, 1.4, C.am, 0)),
'le chapeau': S(EL(32, 44, 26, 6, C.ti) + P('M14 44c0-14 8-26 18-26s18 12 18 26Z', C.vm, C.ti, 2)),
'les chaussettes': S(P('M20 8h12v26l8 10c3 3 2 8-3 8H22a8 8 0 0 1-8-8V8Z', C.amf, C.ti, 2) + P('M46 8h12v26l8 10c3 3 2 8-3 8H48a8 8 0 0 1-8-8V8Z', C.amf, C.ti, 2)),
"l'écharpe": S(P('M8 22c8-6 40-6 48 0-8 4-16 2-20-2v30h-8V24l-4 4v22h-8V22Z', C.vm, C.ti, 2)),
'les gants': S(P('M16 30V16a4 4 0 0 1 8 0v8m0-10a4 4 0 0 1 8 0v10m0-8a4 4 0 0 1 8 0v8m0-4a4 4 0 0 1 8 0v14c0 8-6 14-14 14h-4a12 12 0 0 1-12-12V30Z', C.az, C.ti, 2)),
'le pull': S(P('M18 14l14-4 14 4 8 10-8 6v26H18V30l-8-6Z', C.am, C.ti, 2) + L(20, 22, 44, 22, 1.4, C.mr) + L(20, 30, 44, 30, 1.4, C.mr)),

/* --- LA NOURRITURE --- */
'le pain': S(EL(32, 36, 24, 12, C.amf) + P('M16 30c4-4 8-4 10 0M28 28c4-5 8-5 10 0M42 30c3-4 6-4 8 0', 'none', C.mr, 1.8)),
'le fromage': S(P('M8 20l48-6 4 10-40 26-12-4Z', C.am, C.ti, 2) + CI(30, 26, 2.4, C.mr, 0) + CI(40, 32, 2, C.mr, 0) + CI(22, 34, 2, C.mr, 0)),
'le lait': S(P('M22 8h20l2 8-4 4v34a4 4 0 0 1-4 4H28a4 4 0 0 1-4-4V20l-4-4Z', C.br, C.ti, 2) + R(21, 26, 22, 10, C.az, 0)),
'les fruits': S(CI(20, 38, 12, C.vm) + P('M20 26v-4M18 22c2-2 5-2 6 0', 'none', C.vd, 2) +
  P('M38 22c8 0 14 6 14 14s-6 12-14 12-14-4-14-12 6-14 14-14Z', C.am, C.ti, 2)),
'les légumes': S(P('M22 44V26c0-6 4-10 8-10s8 4 8 10v18Z', C.vm, C.ti, 2) + L(30, 16, 30, 10, 2, C.vd) +
  P('M40 44c-6-8-6-16 0-22 8 2 12 8 12 16s-4 6-12 6Z', C.vd, C.ti, 2)),
'la viande': S(P('M12 30c0-10 10-18 22-18s22 8 22 18-10 18-22 18S12 40 12 30Z', C.vm, C.ti, 2) + CI(24, 26, 5, C.br, 1.4) + CI(40, 34, 3, C.br, 1.4)),
'le poisson': S(P('M8 32c8-11 24-14 34-6 3 2 5 5 6 8-1 3-3 6-6 8-10 8-26 5-34-6Z', C.az, C.ti, 2) + P('M48 26l8-6v24l-8-6', 'none', C.ti, 2) + CI(20, 29, 2.6, C.br, 1.5)),
"l'eau": S(P('M32 8c10 14 16 22 16 30a16 16 0 0 1-32 0c0-8 6-16 16-30Z', C.az, C.ti, 2) + EL(26, 34, 3.5, 5, C.br, 0)),
'le thé': S(P('M12 26h34v10c0 8-8 14-17 14s-17-6-17-14Z', C.br, C.ti, 2) + P('M46 28h6a6 6 0 0 1 0 12h-6', 'none', C.ti, 2) + L(20, 20, 20, 26, 1.6, C.vd) + L(20, 12, 20, 20, 1.6, C.vd, '3 3')),
'le sucre': S(R(14, 24, 14, 14, C.br, 2) + R(30, 20, 14, 14, C.br, 2) + R(24, 34, 14, 14, C.br, 2) + L(0, 0, 0, 0)),
'le sel': S(P('M22 26h20l-4 26H26Z', C.cz, C.ti, 2) + R(24, 12, 16, 14, C.az, 2) + CI(32, 20, 1.2, C.br, 0) + CI(28, 24, 1.2, C.br, 0) + CI(36, 24, 1.2, C.br, 0)),

/* --- LA MAISON --- */
'la table': S(R(10, 26, 44, 6, C.mr, 1.5) + R(12, 32, 4, 20, C.mr, 1) + R(48, 32, 4, 20, C.mr, 1)),
'la chaise': S(R(18, 10, 28, 6, C.mr, 1.5) + R(20, 30, 24, 6, C.mr, 1.5) + R(20, 16, 4, 30, C.mr, 1) + R(40, 16, 4, 30, C.mr, 1) + R(20, 36, 4, 18, C.mr, 1) + R(40, 36, 4, 18, C.mr, 1)),
'le lit': S(R(8, 30, 48, 20, C.az, 2) + R(8, 22, 12, 12, C.br, 2) + R(8, 44, 48, 6, C.tis, 1)),
'la fenêtre': S(R(10, 10, 44, 44, C.azc, 3) + L(32, 10, 32, 54, 2) + L(10, 32, 54, 32, 2)),
'la porte': S(R(14, 8, 36, 48, C.mr, 3) + CI(42, 32, 2.4, C.am, 0)),
'le miroir': S(EL(32, 30, 18, 22, C.azc) + R(28, 50, 8, 8, C.cz, 1)),
"l'armoire": S(R(10, 8, 44, 48, C.mr, 2) + L(32, 8, 32, 56, 1.6) + CI(28, 32, 1.6, C.am, 0) + CI(36, 32, 1.6, C.am, 0)),
'la cuisine': S(R(10, 38, 44, 10, C.cz, 1.5) + CI(20, 34, 6, C.ti, 2) + CI(36, 34, 6, C.ti, 2) + CI(20, 34, 2, C.vm, 0) + CI(36, 34, 2, C.vm, 0)),
'la salle de bains': S(P('M8 34h48v6a12 12 0 0 1-12 12H20A12 12 0 0 1 8 40Z', C.azc, C.ti, 2) + P('M14 34V22a4 4 0 0 1 8 0', 'none', C.ti, 2)),
'le balcon': S(R(10, 40, 44, 6, C.mr, 1.5) + L(14, 40, 14, 20, 2) + L(50, 40, 50, 20, 2) + L(14, 20, 50, 20, 2) + L(14, 30, 50, 30, 1.4)),

/* --- LA MÉTÉO --- */
'le soleil': S(CI(32, 32, 13, C.am) + P('M32 6v6M32 52v6M6 32h6M52 32h6M14 14l4 4M46 14l-4 4M14 50l4-4M46 50l-4-4', 'none', C.am, 3)),
'la pluie': S(P('M14 26c0-8 6-14 14-14 6 0 11 4 13 9 7 0 12 5 12 11 0 7-6 12-13 12H20c-7 0-14-5-14-11 0-4 3-7 8-7Z', C.cz, C.ti, 2) + L(20, 46, 16, 56, 2.4, C.az) + L(32, 46, 28, 56, 2.4, C.az) + L(44, 46, 40, 56, 2.4, C.az)),
'le vent': S(P('M8 22h34a6 6 0 1 0-5-9', 'none', C.az, 3) + P('M8 34h44a7 7 0 1 1-6 10', 'none', C.az, 3) + P('M8 46h28a5 5 0 1 1-4 8', 'none', C.az, 3)),
'la neige': S(P('M32 8v48M12 18l40 28M52 18l-40 28', 'none', C.az, 3) + CI(32, 32, 3, C.br, 0)),
'le nuage': S(P('M14 40c-7 0-11-5-11-11s5-10 11-10c1-8 8-13 16-13 9 0 16 6 17 14 6 1 11 6 11 11 0 5-5 9-11 9Z', C.cz, C.ti, 2)),
'le froid': S(L(20, 10, 20, 54, 3, C.az) + P('M8 20h24M8 44h24', 'none', C.az, 3) + CI(32, 32, 3, C.br, 1.4) + P('M46 14c4 4 4 32 0 36', 'none', C.az, 2.6)),
'la chaleur': S(R(29, 20, 6, 30, C.cz, 1.6) + CI(32, 52, 8, C.vm) + L(32, 10, 32, 16, 2.4, C.vm) + L(20, 18, 24, 22, 2.4, C.vm) + L(44, 18, 40, 22, 2.4, C.vm)),
"l'orage": S(P('M14 32c-7 0-11-5-11-10s5-9 11-9c1-7 8-11 16-11 9 0 16 5 17 12 6 1 11 5 11 10s-5 8-11 8Z', C.tis, C.ti, 2) + P('M34 34l-8 12h6l-4 10 12-14h-6Z', C.am, C.ti, 1.6)),
"l'arc-en-ciel": S(P('M6 50a26 26 0 0 1 52 0', 'none', C.vm, 4) + P('M12 50a20 20 0 0 1 40 0', 'none', C.am, 4) + P('M18 50a14 14 0 0 1 28 0', 'none', C.vd, 4) + P('M24 50a8 8 0 0 1 16 0', 'none', C.az, 4)),
'le brouillard': S(L(8, 20, 56, 20, 3, C.cz) + L(8, 32, 56, 32, 3, C.cz) + L(8, 44, 56, 44, 3, C.cz) + CI(48, 14, 6, C.am, 0)),

/* --- LES COULEURS --- */
'rouge': S(GOTA(C.vm)),
'bleu': S(GOTA(C.az)),
'vert': S(GOTA(C.vd)),
'jaune': S(GOTA(C.am)),
'noir': S(GOTA(C.ti)),
'blanc': S(P('M32 8c10 14 16 22 16 30a16 16 0 0 1-32 0c0-8 6-16 16-30Z', C.br, C.ti, 2.4)),
'orange': S(GOTA('#E08A3C')),
'violet': S(GOTA(C.lx)),
'rose': S(GOTA(C.rx)),
'marron': S(GOTA(C.mr)),

/* --- LES ANIMAUX --- */
'le chien': S(EL(32, 36, 18, 14, C.mr) + CI(18, 22, 9, C.mr) + EL(11, 16, 4, 8, C.mr) + EL(25, 16, 4, 8, C.mr) + CI(15, 22, 1.6, C.ti, 0) + CI(21, 22, 1.6, C.ti, 0) + CI(18, 27, 1.8, C.ti, 0)),
'le chat': S(EL(32, 38, 16, 12, C.amf) + CI(20, 22, 8, C.amf) + P('M13 16l4 8M27 16l-4 8', C.amf, C.ti, 2) + CI(17, 22, 1.4, C.ti, 0) + CI(23, 22, 1.4, C.ti, 0) + P('M17 26c2 2 4 2 6 0', 'none', C.ti, 1.6)),
"l'oiseau": S(EL(32, 34, 16, 12, C.az) + CI(46, 26, 8, C.az) + P('M54 26l8-3-2 6Z', C.am, C.ti, 1.6) + CI(48, 24, 1.4, C.ti, 0) + P('M16 34c-6 0-10-3-10-3s4-4 10-4', 'none', C.tis, 2)),
'le cheval': S(P('M14 46V28c0-10 8-18 18-18h6l10-6-2 8 6 4-6 4v26h-8V32H24v14Z', C.mr, C.ti, 2) + CI(30, 12, 1.6, C.ti, 0)),
'la vache': S(EL(32, 36, 20, 14, C.br) + CI(16, 24, 8, C.br) + EL(6, 20, 3, 6, C.ti) + EL(26, 20, 3, 6, C.ti) + P('M20 32c4 0 6 4 4 8-4-2-6-4-4-8Z', C.ti, C.ti, 1) + P('M12 32c-4 0-6 4-4 8 4-2 6-4 4-8Z', C.ti, C.ti, 1) + CI(12, 24, 1.6, C.ti, 0) + CI(20, 24, 1.6, C.ti, 0)),
'le poisson rouge': S(P('M8 32c8-11 24-14 34-6 3 2 5 5 6 8-1 3-3 6-6 8-10 8-26 5-34-6Z', C.vm, C.ti, 2) + P('M48 26l8-6v24l-8-6', 'none', C.ti, 2) + CI(20, 29, 2.6, C.br, 1.5)),
'le lapin': S(EL(32, 42, 14, 10, C.br) + CI(32, 28, 10, C.br) + EL(24, 10, 4, 14, C.br) + EL(38, 10, 4, 14, C.br) + CI(28, 27, 1.4, C.ti, 0) + CI(36, 27, 1.4, C.ti, 0) + CI(32, 32, 1.6, C.rx, 0)),
'la souris': S(EL(34, 38, 14, 10, C.cz) + CI(20, 30, 9, C.cz) + CI(12, 22, 4, C.cz, 1.4) + CI(24, 22, 4, C.cz, 1.4) + CI(17, 29, 1.3, C.ti, 0) + P('M48 40c6 2 10 6 8 10-4-2-8-6-8-10Z', 'none', C.ti, 1.6)),
'le cochon': S(EL(32, 38, 18, 13, C.rx) + CI(32, 22, 3, C.rx, 1.4) + EL(24, 14, 3, 5, C.rx) + EL(40, 14, 3, 5, C.rx) + EL(32, 22, 5, 3.4, C.mr, 1.4) + CI(30, 22, 0.9, C.ti, 0) + CI(34, 22, 0.9, C.ti, 0)),
'le mouton': S(P('M14 40c-2-8 4-14 8-14-2-6 4-12 10-12s12 6 10 12c4 0 10 6 8 14-3 8-33 8-36 0Z', C.br, C.ti, 2) + CI(32, 30, 6, C.tis) + EL(24, 30, 2, 4, C.tis) + EL(40, 30, 2, 4, C.tis)),

/* --- LES LOISIRS (A2) --- */
'la musique': S(CI(20, 46, 6, C.ti, 0) + CI(44, 42, 6, C.ti, 0) + L(26, 46, 26, 14, 2.4) + L(50, 42, 50, 10, 2.4) + L(26, 14, 50, 10, 2.4)),
'la danse': S(CI(32, 12, 6, C.am) + P('M32 18v14l-12 10M32 32l14 8', 'none', C.rx, 3) + P('M20 42l-6 10M46 40l6 12', 'none', C.rx, 3)),
'la lecture': S(P('M8 16c8-4 16-4 24 0v34c-8-4-16-4-24 0Z', C.az, C.ti, 2) + P('M56 16c-8-4-16-4-24 0v34c8-4 16-4 24 0Z', C.amf, C.ti, 2)),
'le dessin': S(P('M14 50l4-14 24-24 10 10-24 24Z', C.am, C.ti, 2) + L(18, 36, 28, 46, 2.2, C.ti) + CI(48, 16, 5, C.rx, 1.6)),
'la peinture': S(EL(30, 30, 22, 16, C.br) + CI(18, 24, 4, C.vm) + CI(30, 18, 4, C.am) + CI(42, 24, 4, C.az) + CI(24, 36, 4, C.vd) + P('M52 40l6 14-14-6Z', C.mr, C.ti, 1.6)),
'le jeu vidéo': S(R(8, 22, 48, 24, C.ti, 8) + CI(20, 34, 3, C.br, 0) + CI(14, 34, 1.6, C.tis, 0) + CI(26, 34, 1.6, C.tis, 0) + CI(46, 30, 3, C.vm, 0) + CI(52, 36, 3, C.az, 0)),
'le football': S(CI(32, 32, 20, C.br) + P('M32 16l7 5-3 9h-8l-3-9Z', C.ti, C.ti, 1.4) + P('M18 26l-4 10M46 26l4 10M24 48l8-6 8 6', 'none', C.ti, 1.4)),
'la natation': S(P('M8 40c5-3 8-3 13 0s8 3 13 0 8-3 13 0 8 3 13 0', 'none', C.az, 3) + CI(20, 22, 6, C.am) + P('M20 28v8l14 4', 'none', C.ti, 2.4)),
'le camping': S(T(10, 50, 54, 14, C.vd) + P('M32 14v36', 'none', C.ti, 1.6) + CI(46, 42, 5, C.am) + L(2, 56, 62, 56, 2.5, C.cz)),
'la pêche': S(L(44, 8, 20, 44, 2, C.mr) + L(20, 44, 26, 44, 1.6, C.ti) + P('M8 46c6-8 18-8 24 0-6 6-18 6-24 0Z', C.az, C.ti, 2) + CI(12, 46, 1.4, C.ti, 0)),

/* --- ADJECTIFS COURANTS --- */
'grand': S(R(24, 6, 16, 46, C.az, 3) + R(12, 40, 10, 12, C.azc, 3) + L(2, 54, 62, 54, 2.5, C.cz)),
'petit': S(R(40, 40, 8, 14, C.am, 3) + R(48, 46, 6, 8, C.amf, 3) + L(2, 56, 62, 56, 2.5, C.cz)),
'beau': S(P('M32 8l6 14 15 2-11 10 3 15-13-8-13 8 3-15-11-10 15-2Z', C.am, C.ti, 2)),
'joli': S(CI(24, 24, 9, C.rx) + CI(38, 20, 6, C.rx) + CI(40, 34, 5, C.rx) + CI(30, 34, 4, C.am) + L(30, 34, 30, 50, 2.4, C.vd)),
'nouveau': S(P('M14 8h20l16 16v20a4 4 0 0 1-4 4H18a4 4 0 0 1-4-4Z', C.br, C.ti, 2) + P('M34 8v16h16', 'none', C.ti, 2) + CI(48, 44, 9, C.vm) + P('M44 44h8M48 40v8', 'none', C.br, 2)),
'vieux': S('<circle cx="32" cy="32" r="20" fill="none" stroke="' + C.ti + '" stroke-width="3"/>' + L(32, 32, 32, 20, 2.4) + L(32, 32, 42, 36, 2.4) + CI(32, 32, 2, C.ti, 0) + P('M14 50c2-2 4-2 6 0M44 50c2-2 4-2 6 0', 'none', C.cz, 2)),
'facile': S(CI(32, 32, 22, C.vd) + P('M20 32l8 8 16-16', 'none', C.br, 4)),
'difficile': S(CI(32, 32, 22, C.vm) + P('M22 22l20 20M42 22l-20 20', 'none', C.br, 4)),
'rapide': S(P('M6 20h30M6 32h40M6 44h26', 'none', C.az, 4) + P('M52 14l10 18-10 18', 'none', C.am, 3)),
'lent': S(EL(30, 40, 20, 10, C.vd) + CI(46, 34, 9, C.vd) + CI(20, 50, 4, C.ti, 0) + CI(38, 50, 4, C.ti, 0) + CI(48, 32, 1.4, C.ti, 0)),

/* --- VERBES DU QUOTIDIEN --- */
'se lever': S(CI(32, 14, 6, C.am) + P('M32 20v14M32 34l-8 10M32 34l8 10M24 26l-6 4M40 26l6 4', 'none', C.ti, 2.6)),
'se laver': S(P('M14 34c8-4 28-4 36 0v10c0 8-8 12-18 12s-18-4-18-12Z', C.azc, C.ti, 2) + P('M20 30c-2-6 2-10 2-14M32 28c-2-6 2-10 2-14', 'none', C.az, 2.2)),
'se coucher': S(R(8, 36, 40, 14, C.az, 2) + CI(20, 30, 6, C.am) + P('M40 30h16M44 24h16M48 18h12', 'none', C.cz, 2)),
'déjeuner': S(CI(32, 38, 18, C.br, 2) + CI(32, 38, 12, C.am) + L(16, 20, 16, 32, 2, C.ti) + L(48, 20, 48, 30, 2, C.ti) + P('M48 30c2 2 2 4 0 6', 'none', C.ti, 2)),
'dîner': S(CI(32, 30, 16, C.br, 2) + CI(32, 30, 10, C.tis) + L(32, 46, 32, 56, 2.4, C.mr) + CI(20, 12, 2, C.am, 1.4) + CI(44, 12, 2, C.am, 1.4)),
'travailler': S(R(14, 26, 36, 24, C.mr, 3) + R(26, 18, 12, 10, C.mr, 3) + CI(32, 38, 3, C.am, 1.6)),
'étudier': S(P('M8 16c8-4 16-4 24 0v34c-8-4-16-4-24 0Z', C.az, C.ti, 2) + P('M56 16c-8-4-16-4-24 0v34c8-4 16-4 24 0Z', C.amf, C.ti, 2) + CI(48, 12, 5, C.vm, 1.6)),
'jouer': S(R(8, 22, 48, 24, C.ti, 8) + CI(20, 34, 3, C.br, 0) + CI(14, 34, 1.6, C.tis, 0) + CI(26, 34, 1.6, C.tis, 0) + CI(46, 30, 3, C.vd, 0)),
'dormir': S(P('M18 36c0-10 8-18 18-18a14 14 0 0 0 14 18 18 18 0 1 1-32 0Z', C.lx, C.ti, 2) + P('M44 14h8M48 10v8', 'none', C.az, 2) + P('M8 26h6M4 32h6', 'none', C.az, 2)),
'acheter': S(P('M14 22h36l-4 26H18Z', C.vm, C.ti, 2) + P('M22 22c0-8 4-14 10-14s10 6 10 14', 'none', C.ti, 2) + CI(24, 54, 3, C.ti, 0) + CI(40, 54, 3, C.ti, 0))

};

var VOCAB_A2 = [
  {c:'a2-familia', f:'le père', p:'o pai'},
  {c:'a2-familia', f:'la mère', p:'a mãe'},
  {c:'a2-familia', f:'le frère', p:'o irmão'},
  {c:'a2-familia', f:'la sœur', p:'a irmã'},
  {c:'a2-familia', f:'les grands-parents', p:'os avós'},
  {c:'a2-familia', f:'le grand-père', p:'o avô'},
  {c:'a2-familia', f:'la grand-mère', p:'a avó'},
  {c:'a2-familia', f:'le fils', p:'o filho'},
  {c:'a2-familia', f:'la fille', p:'a filha'},
  {c:'a2-familia', f:"l'oncle", p:'o tio'},
  {c:'a2-familia', f:'la tante', p:'a tia'},
  {c:'a2-familia', f:'le cousin', p:'o primo'},

  {c:'a2-corpo', f:'la tête', p:'a cabeça'},
  {c:'a2-corpo', f:'les yeux', p:'os olhos'},
  {c:'a2-corpo', f:'le nez', p:'o nariz'},
  {c:'a2-corpo', f:'la bouche', p:'a boca'},
  {c:'a2-corpo', f:'les mains', p:'as mãos'},
  {c:'a2-corpo', f:'les pieds', p:'os pés'},
  {c:'a2-corpo', f:'le ventre', p:'a barriga'},
  {c:'a2-corpo', f:'le dos', p:'as costas'},
  {c:'a2-corpo', f:'les cheveux', p:'o cabelo'},
  {c:'a2-corpo', f:'les oreilles', p:'as orelhas'},

  {c:'a2-vestimentas', f:'le pantalon', p:'a calça'},
  {c:'a2-vestimentas', f:'la chemise', p:'a camisa'},
  {c:'a2-vestimentas', f:'la robe', p:'o vestido'},
  {c:'a2-vestimentas', f:'les chaussures', p:'os sapatos'},
  {c:'a2-vestimentas', f:'le manteau', p:'o casaco'},
  {c:'a2-vestimentas', f:'le chapeau', p:'o chapéu'},
  {c:'a2-vestimentas', f:'les chaussettes', p:'as meias'},
  {c:'a2-vestimentas', f:"l'écharpe", p:'o cachecol'},
  {c:'a2-vestimentas', f:'les gants', p:'as luvas'},
  {c:'a2-vestimentas', f:'le pull', p:'o suéter'},

  {c:'a2-comida', f:'le pain', p:'o pão'},
  {c:'a2-comida', f:'le fromage', p:'o queijo'},
  {c:'a2-comida', f:'le lait', p:'o leite'},
  {c:'a2-comida', f:'les fruits', p:'as frutas'},
  {c:'a2-comida', f:'les légumes', p:'os legumes'},
  {c:'a2-comida', f:'la viande', p:'a carne'},
  {c:'a2-comida', f:'le poisson', p:'o peixe'},
  {c:'a2-comida', f:"l'eau", p:'a água'},
  {c:'a2-comida', f:'le thé', p:'o chá'},
  {c:'a2-comida', f:'le sucre', p:'o açúcar'},
  {c:'a2-comida', f:'le sel', p:'o sal'},

  {c:'a2-casa', f:'la table', p:'a mesa'},
  {c:'a2-casa', f:'la chaise', p:'a cadeira'},
  {c:'a2-casa', f:'le lit', p:'a cama'},
  {c:'a2-casa', f:'la fenêtre', p:'a janela'},
  {c:'a2-casa', f:'la porte', p:'a porta'},
  {c:'a2-casa', f:'le miroir', p:'o espelho'},
  {c:'a2-casa', f:"l'armoire", p:'o armário'},
  {c:'a2-casa', f:'la cuisine', p:'a cozinha (cômodo)'},
  {c:'a2-casa', f:'la salle de bains', p:'o banheiro'},
  {c:'a2-casa', f:'le balcon', p:'a varanda'},

  {c:'a2-meteo', f:'le soleil', p:'o sol'},
  {c:'a2-meteo', f:'la pluie', p:'a chuva'},
  {c:'a2-meteo', f:'le vent', p:'o vento'},
  {c:'a2-meteo', f:'la neige', p:'a neve'},
  {c:'a2-meteo', f:'le nuage', p:'a nuvem'},
  {c:'a2-meteo', f:'le froid', p:'o frio'},
  {c:'a2-meteo', f:'la chaleur', p:'o calor'},
  {c:'a2-meteo', f:"l'orage", p:'a tempestade'},
  {c:'a2-meteo', f:"l'arc-en-ciel", p:'o arco-íris'},
  {c:'a2-meteo', f:'le brouillard', p:'a neblina'},

  {c:'a2-cores', f:'rouge', p:'vermelho'},
  {c:'a2-cores', f:'bleu', p:'azul'},
  {c:'a2-cores', f:'vert', p:'verde'},
  {c:'a2-cores', f:'jaune', p:'amarelo'},
  {c:'a2-cores', f:'noir', p:'preto'},
  {c:'a2-cores', f:'blanc', p:'branco'},
  {c:'a2-cores', f:'orange', p:'laranja'},
  {c:'a2-cores', f:'violet', p:'roxo'},
  {c:'a2-cores', f:'rose', p:'rosa'},
  {c:'a2-cores', f:'marron', p:'marrom'},

  {c:'a2-animais', f:'le chien', p:'o cachorro'},
  {c:'a2-animais', f:'le chat', p:'o gato'},
  {c:'a2-animais', f:"l'oiseau", p:'o pássaro'},
  {c:'a2-animais', f:'le cheval', p:'o cavalo'},
  {c:'a2-animais', f:'la vache', p:'a vaca'},
  {c:'a2-animais', f:'le poisson rouge', p:'o peixinho dourado'},
  {c:'a2-animais', f:'le lapin', p:'o coelho'},
  {c:'a2-animais', f:'la souris', p:'o rato'},
  {c:'a2-animais', f:'le cochon', p:'o porco'},
  {c:'a2-animais', f:'le mouton', p:'a ovelha'},

  {c:'a2-lazer', f:'la musique', p:'a música'},
  {c:'a2-lazer', f:'la danse', p:'a dança'},
  {c:'a2-lazer', f:'la lecture', p:'a leitura'},
  {c:'a2-lazer', f:'le dessin', p:'o desenho'},
  {c:'a2-lazer', f:'la peinture', p:'a pintura'},
  {c:'a2-lazer', f:'le jeu vidéo', p:'o videogame'},
  {c:'a2-lazer', f:'le football', p:'o futebol'},
  {c:'a2-lazer', f:'la natation', p:'a natação'},
  {c:'a2-lazer', f:'le camping', p:'o acampamento'},
  {c:'a2-lazer', f:'la pêche', p:'a pesca'},

  {c:'a2-adjetivos', f:'grand', p:'grande'},
  {c:'a2-adjetivos', f:'petit', p:'pequeno'},
  {c:'a2-adjetivos', f:'beau', p:'bonito'},
  {c:'a2-adjetivos', f:'joli', p:'bonito, gracioso'},
  {c:'a2-adjetivos', f:'nouveau', p:'novo'},
  {c:'a2-adjetivos', f:'vieux', p:'velho'},
  {c:'a2-adjetivos', f:'facile', p:'fácil'},
  {c:'a2-adjetivos', f:'difficile', p:'difícil'},
  {c:'a2-adjetivos', f:'rapide', p:'rápido'},
  {c:'a2-adjetivos', f:'lent', p:'lento'},

  {c:'a2-verbos', f:'se lever', p:'levantar-se'},
  {c:'a2-verbos', f:'se laver', p:'lavar-se'},
  {c:'a2-verbos', f:'se coucher', p:'deitar-se'},
  {c:'a2-verbos', f:'déjeuner', p:'almoçar'},
  {c:'a2-verbos', f:'dîner', p:'jantar'},
  {c:'a2-verbos', f:'travailler', p:'trabalhar'},
  {c:'a2-verbos', f:'étudier', p:'estudar'},
  {c:'a2-verbos', f:'jouer', p:'brincar, jogar'},
  {c:'a2-verbos', f:'dormir', p:'dormir'},
  {c:'a2-verbos', f:'acheter', p:'comprar'}
];

var proxId = window.QI_VOCAB.length;
VOCAB_A2.forEach(function (v, i) { v.id = 'v' + (proxId + i); v.icone = ICONES_A2[v.f]; v.n = 'A2'; });

window.QI_VOCAB = window.QI_VOCAB.concat(VOCAB_A2);
for (var k in ICONES_A2) window.QI_ICONES[k] = ICONES_A2[k];
})();
