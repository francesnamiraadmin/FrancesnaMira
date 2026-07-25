// =====================================================================
// QUESTÕES INTERATIVAS — vocabulário nível B2 (100 termos, 10 categorias:
// meio ambiente/clima, sociedade/desigualdades, mídia/desinformação,
// economia/consumo, saúde/bem-estar, educação, política/cidadania,
// ciência/inovação, conectores lógicos, verbos/expressões B2). Reaproveita
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

var ICONES_B2 = {

/* --- ENVIRONNEMENT ET CLIMAT --- */
'le réchauffement climatique': S(CI(32, 36, 16, C.vm) + L(32, 12, 32, 20, 3, C.vm) + L(14, 24, 20, 28, 3, C.vm) + L(50, 24, 44, 28, 3, C.vm) + P('M22 44c4-3 16-3 20 0', 'none', C.br, 2.4)),
'les émissions de CO₂': S(R(14, 40, 14, 16, C.cz) + P('M20 40c0-10-6-14-4-22M26 40c0-14 8-18 4-28', 'none', C.tis, 2.6) + P('M24 4h6a2 2 0 0 1 0 6h-6v-6', 'none', C.ti, 1.6)),
'la fonte des glaciers': S(P('M10 42 24 14l14 28Z', C.azc, C.ti, 2) + P('M28 42 42 20l14 22Z', C.azc, C.ti, 2) + P('M4 48c8-2 8 4 16 2s8 4 16 2 8 4 16 2 8 4 12 2', 'none', C.az, 2.6)),
'la sécheresse': S(P('M14 48c8-14 8-14 0-28M50 48c-8-14-8-14 0-28', 'none', C.mr, 2.2) + P('M22 48c0-10 4-10 4-20M42 48c0-10-4-10-4-20', 'none', C.mr, 2.2) + CI(32, 14, 8, C.am)),
"l'inondation": S(R(4, 30, 56, 24, C.az, 0) + T(14, 30, 34, 10, C.mr) + T(34, 30, 54, 14, C.mr) + P('M4 42c5-3 8-3 13 0s8 3 13 0 8-3 13 0 8 3 13 0', 'none', C.azc, 2.2)),
'la déforestation': S(CI(16, 24, 9, C.vd) + R(13, 32, 4, 16, C.mr, 1) + P('M34 48 46 20l4 8 4-8 8 28Z', C.mr, C.ti, 1.6) + L(6, 52, 58, 52, 2.4, C.mr)),
'les énergies renouvelables': S(P('M10 44l14-30 8 16 6-10 16 24Z', 'none', C.vd, 3) + CI(48, 14, 6, C.am)),
"l'empreinte carbone": S(P('M14 46c-2-10 4-14 4-22-6 0-10 6-10 12-4-8 0-16 8-18 2-4 8-4 10 0 6-14 20-14 26-2 6-2 6 8 0 12 4 4 4 12-2 14-2-8-6-6-10-2-2-6-8-8-14-6-2 2-6 8-12 12Z', C.mr, C.ti, 1.6)),
'le développement durable': S('<circle cx="32" cy="32" r="20" fill="none" stroke="' + C.vd + '" stroke-width="4"/>' + P('M46 18l4-4M46 18l-1-5M46 18l5 1', 'none', C.vd, 2.4) + CI(24, 28, 6, C.vd) + R(22, 34, 4, 12, C.mr, 1)),
'la transition écologique': S(P('M8 32h20', 'none', C.cz, 5) + P('M28 32h20', 'none', C.vd, 5) + P('M42 24l8 8-8 8', 'none', C.vd, 3) + CI(14, 32, 5, C.tis, 0)),

/* --- SOCIÉTÉ ET INÉGALITÉS --- */
'la pauvreté': S(PESSOA(32, 40, C.cz, C.cz, false) + P('M18 54h28', 'none', C.ti, 1.6, '3 3')),
'la richesse': S(CI(20, 40, 9, C.am) + CI(32, 34, 9, C.am) + CI(44, 40, 9, C.am) + L(20, 40, 20, 40, 0) + P('M17 37h6M29 31h6M41 37h6', 'none', C.amf, 2)),
"l'inégalité": S(EL(16, 46, 10, 4, C.cz, 0) + EL(48, 20, 10, 4, C.cz, 0) + PESSOA(16, 38, C.cz, C.ti, false) + PESSOA(48, 12, C.am, C.ti, false) + L(4, 50, 60, 50, 2, C.ti)),
'le chômage': S(R(18, 30, 28, 20, C.cz, 2) + R(28, 22, 8, 8, C.cz, 2) + P('M22 40l20-8M22 32l20 8', 'none', C.vm, 2.4)),
'la classe sociale': S(R(6, 40, 16, 12, C.cz, 1.4) + R(24, 28, 16, 24, C.am, 1.4) + R(42, 14, 16, 38, C.vm, 1.4)),
"l'immigration": S(P('M32 6l5 20 22 8v5l-22-3-2 12 7 5v4l-10-3-10 3v-4l7-5-2-12-22 3v-5l22-8Z', C.az, C.ti, 2) + L(6, 54, 26, 54, 2.4, C.cz)),
'la discrimination': S(CI(20, 30, 10, C.am) + CI(44, 30, 10, C.cz) + P('M4 48c4-6 12-6 16 0M44 48c4-6 12-6 16 0', 'none', C.ti, 2) + L(30, 20, 34, 40, 2.4, C.vm)),
"l'intégration": S(CI(20, 32, 9, C.az) + CI(44, 32, 9, C.am) + P('M28 32a4 4 0 0 0 8 0 4 4 0 0 0-8 0Z', C.vd, C.ti, 1.4)),
'la solidarité': S(P('M14 30c-4-6 2-12 8-8 2-6 10-6 10 2 0-8 8-8 10-2 6-4 12 2 8 8-4 6-14 14-18 18-4-4-14-12-18-18Z', C.vm, C.ti, 1.8) + PESSOA(14, 46, C.az, C.ti, false) + PESSOA(50, 46, C.vd, C.ti, false)),
"l'exclusion": S('<circle cx="24" cy="24" r="10" fill="none" stroke="' + C.ti + '" stroke-width="2"/>' + PESSOA(24, 40, C.cz, C.cz, false) + P('M44 44a12 12 0 1 0 0.01 0Z', 'none', C.vm, 2.6) + L(38, 38, 50, 50, 2.6, C.vm)),

/* --- MÉDIAS ET DÉSINFORMATION --- */
'la fake news': S(R(10, 10, 44, 44, C.br, 2) + L(16, 20, 48, 20, 2) + L(16, 28, 40, 28, 1.6, C.cz) + L(16, 36, 44, 36, 1.6, C.cz) + CI(46, 44, 9, C.vm) + P('M42 40l8 8M50 40l-8 8', 'none', C.br, 2.4)),
'la censure': S(L(14, 14, 50, 50, 5, C.ti) + R(16, 24, 32, 16, C.br, 2) + L(20, 32, 44, 32, 3, C.ti)),
'la liberté de la presse': S(R(10, 8, 40, 30, C.br, 2) + L(16, 16, 44, 16, 1.6) + L(16, 22, 34, 22, 1.6, C.cz) + P('M32 6c-4 6-4 14 0 20-4 6-4 14 0 20', 'none', C.am, 2.6) + L(50, 44, 50, 6, 2.2, C.ti)),
'le journaliste': S(PESSOA(28, 38, C.tis, C.ti, false, R(38, 22, 12, 10, C.br, 1.4))),
'la rumeur': S(BALAO(C.cz) + P('M40 8l3 5 6 1-4 4 1 6-6-3-6 3 1-6-4-4 6-1Z', C.am, C.ti, 1)),
'la manipulation': S(PESSOA(20, 40, C.cz, C.ti, false) + L(20, 22, 20, 10, 1.6, C.ti, '2 2') + CI(20, 8, 3, C.am, 1.4) + P('M12 10h16', 'none', C.ti, 1.4)),
'la source': S(CI(32, 20, 8, C.az) + P('M32 28v14', 'none', C.az, 2.6) + P('M20 42c0-8 6-8 12-8s12 0 12 8', 'none', C.az, 2.4)),
'la vérification des faits': S(CI(26, 26, 16, C.br, 2) + L(37, 37, 52, 52, 4, C.ti) + P('M18 26l6 6 10-10', 'none', C.vd, 3)),
"l'opinion publique": S(PESSOA(14, 42, C.az, C.ti, false) + PESSOA(28, 40, C.am, C.mr, true) + PESSOA(42, 42, C.vd, C.ti, false) + PESSOA(54, 40, C.rx, C.mr, true) + P('M4 50h56', 'none', C.cz, 1.6, '3 3')),
'la propagande': S(P('M8 30h30l14-10v24l-14-10H8Z', C.am, C.ti, 2) + P('M20 30v14a4 4 0 0 0 8 0V30', 'none', C.ti, 2)),

/* --- ÉCONOMIE ET CONSOMMATION --- */
'le budget': S(R(8, 16, 48, 34, C.vd, 3) + L(8, 26, 56, 26, 1.6) + CI(20, 40, 5, C.am, 1.6) + L(32, 34, 48, 34, 1.4, C.br) + L(32, 42, 44, 42, 1.4, C.br)),
"l'inflation": S(P('M8 46h48', 'none', C.ti, 2.4) + P('M14 46V32M26 46V22M38 46V26M50 46V12', 'none', C.vm, 4) + P('M46 8l6 4-6 4', 'none', C.vm, 2)),
'la dette': S(CI(32, 24, 14, C.am) + P('M26 20a6 6 0 0 1 12 0c0 6-12 4-12 10a6 6 0 0 0 12 0', 'none', C.ti, 2.2) + L(20, 50, 44, 50, 2, C.ti, '3 3')),
"l'investissement": S(P('M8 46h48', 'none', C.ti, 2) + P('M10 40l12-10 8 6 16-18', 'none', C.vd, 3) + P('M40 18h8v8', 'none', C.vd, 3)),
'la surconsommation': S(P('M14 22h36l-4 26H18Z', C.vm, C.ti, 2) + P('M22 22c0-8 4-14 10-14s10 6 10 14', 'none', C.ti, 2) + CI(24, 46, 3, C.ti, 0) + CI(40, 46, 3, C.ti, 0) + '<circle cx="50" cy="14" r="9" fill="' + C.am + '" stroke="' + C.ti + '" stroke-width="1.6"/>' + P('M46 14h8M50 10v8', 'none', C.ti, 1.8)),
'le marketing': S(P('M8 26h30l14-10v32l-14-10H8Z', C.az, C.ti, 2) + P('M20 26v10a4 4 0 0 0 8 0V26', 'none', C.ti, 2)),
'la marque': S(P('M14 8h20l24 24-24 24-24-24Z', C.amf, C.ti, 2) + CI(24, 18, 3, C.br, 1.4)),
'le salaire': S(R(12, 24, 40, 26, C.vd, 2) + CI(32, 37, 8, C.am) + L(12, 24, 52, 24, 1.6) + CI(18, 30, 1.4, C.br, 0) + CI(46, 30, 1.4, C.br, 0)),
'les impôts': S(P('M6 24 32 10l26 14Z', C.azc, C.ti, 2) + R(13, 27, 6, 19, C.br) + R(45, 27, 6, 19, C.br) + R(6, 46, 52, 7, C.am, 1.5) + CI(32, 36, 6, C.vm) + L(29, 33, 35, 39, 1.4, C.br) + L(35, 33, 29, 39, 1.4, C.br)),
'la crise économique': S(P('M8 20l14 14 8-8 20 20', 'none', C.vm, 3.4) + P('M42 46h8v-8', 'none', C.vm, 3.4)),

/* --- SANTÉ ET BIEN-ÊTRE --- */
'le stress': S(CI(32, 32, 20, C.vm, 0) + CI(24, 27, 2.4, C.ti, 0) + CI(40, 27, 2.4, C.ti, 0) + P('M23 42c4-3 14-3 18 0', 'none', C.ti, 2.2) + L(14, 12, 20, 18, 2.4, C.vm) + L(50, 12, 44, 18, 2.4, C.vm)),
"l'insomnie": S(EL(30, 44, 20, 8, C.azc) + CI(30, 30, 12, C.lx) + P('M14 20h6M12 26h6', 'none', C.am, 2)),
'la dépression': S(CI(32, 32, 20, C.cz, 0) + P('M22 42c4 3 14 3 18-2', 'none', C.ti, 2.2) + CI(24, 26, 2, C.ti, 0) + CI(40, 26, 2, C.ti, 0) + L(20, 8, 44, 8, 2, C.tis)),
"l'anxiété": S(CI(32, 30, 16, C.am, 0) + CI(25, 26, 2, C.ti, 0) + CI(39, 26, 2, C.ti, 0) + P('M24 38q8 6 16 0', 'none', C.ti, 2) + P('M46 14v8M46 26v2', 'none', C.vm, 2.6)),
"l'équilibre": S(T(16, 34, 48, 34, C.mr) + L(32, 10, 32, 34, 2.4) + L(16, 34, 6, 44, 1.6) + L(16, 34, 26, 44, 1.6) + L(48, 34, 38, 44, 1.6) + L(48, 34, 58, 44, 1.6) + CI(11, 44, 5, C.az, 1.4) + CI(21, 44, 5, C.az, 1.4) + CI(43, 44, 5, C.az, 1.4) + CI(53, 44, 5, C.az, 1.4)),
'la thérapie': S(CI(20, 30, 10, C.az) + CI(44, 30, 10, C.am) + BALAO(C.br)),
'le bien-être': S(CI(32, 24, 12, C.am) + P('M20 44c4-3 8-3 12 0s8 3 12 0', 'none', C.vd, 2.6) + P('M32 8v4', 'none', C.am, 2)),
'la méditation': S(PES(32, 40, 1.6, C.lx) + '<circle cx="32" cy="20" r="10" fill="none" stroke="' + C.am + '" stroke-width="1.6" stroke-dasharray="3 3"/>'),
'la nutrition': S(EL(24, 34, 16, 20, C.vd) + P('M24 14c0-4 3-6 3-6', 'none', C.mr, 2) + CI(46, 36, 10, C.vm) + L(46, 30, 46, 20, 2, C.vd)),
"l'épuisement": S(CI(32, 30, 16, C.cz) + CI(25, 24, 2, C.ti, 0) + CI(39, 24, 2, C.ti, 0) + P('M24 40c4 2 12 2 16 0', 'none', C.ti, 2) + P('M6 46q4-4 8 0M50 46q4-4 8 0', 'none', C.az, 1.8)),

/* --- ÉDUCATION --- */
"l'apprentissage": S(P('M8 16c8-4 16-4 24 0v34c-8-4-16-4-24 0Z', C.az, C.ti, 2) + P('M56 16c-8-4-16-4-24 0v34c8-4 16-4 24 0Z', C.amf, C.ti, 2) + CI(48, 12, 5, C.am, 1.6)),
'la formation': S(CI(20, 24, 9, C.am) + P('M8 48c0-8 5-14 12-14s12 6 12 14', 'none', C.ti, 2.2) + P('M40 20l6 6-6 6M46 26h-14', 'none', C.vd, 2.4)),
'le diplôme': S(R(10, 12, 44, 32, C.br, 2) + CI(32, 22, 8, C.am, 1.6) + P('M24 22l6 6 10-10', 'none', C.vd, 2.4) + L(24, 50, 40, 50, 2, C.vm)),
'la compétence': S('<circle cx="32" cy="32" r="20" fill="none" stroke="' + C.vd + '" stroke-width="3"/>' + P('M22 32l7 8 13-14', 'none', C.vd, 3.4)),
"l'échec scolaire": S(P('M8 16c8-4 16-4 24 0v34c-8-4-16-4-24 0Z', C.cz, C.ti, 2) + P('M56 16c-8-4-16-4-24 0v34c8-4 16-4 24 0Z', C.cz, C.ti, 2) + L(20, 24, 30, 34, 2.6, C.vm) + L(30, 24, 20, 34, 2.6, C.vm)),
'la motivation': S(P('M32 8l5 20 22 8v5l-22-3-2 12 7 5v4l-10-3-10 3v-4l7-5-2-12-22 3v-5l22-8Z', C.am, C.ti, 2) + L(32, 4, 32, 8, 2, C.vm)),
"l'enseignement à distance": S(R(8, 14, 44, 26, C.ti, 3) + R(12, 18, 36, 18, C.azc, 1) + PES(30, 24, 0.9, C.br) + P('M2 40h56', 'none', C.cz, 3)),
'le décrochage scolaire': S(P('M8 16c8-4 16-4 24 0v34c-8-4-16-4-24 0Z', C.cz, C.ti, 2) + P('M56 16c-8-4-16-4-24 0v34c8-4 16-4 24 0Z', C.cz, C.ti, 2) + P('M46 30l10 10M56 30l-10 10', 'none', C.vm, 3)),
'la mémorisation': S(CI(32, 30, 16, C.lx, 0) + P('M24 30a8 8 0 0 1 16 0', 'none', C.br, 2.6) + CI(32, 30, 4, C.am, 1.6) + L(32, 46, 32, 52, 2, C.mr)),
'la créativité': S(CI(32, 26, 12, C.am) + L(32, 38, 32, 48, 2, C.mr) + P('M22 26l4 4M46 26l-4 4M32 14v-4', 'none', C.vm, 2)),

/* --- POLITIQUE ET CITOYENNETÉ --- */
'la démocratie': S(P('M6 24 32 10l26 14Z', C.az, C.ti, 2) + R(13, 27, 6, 19, C.br) + R(45, 27, 6, 19, C.br) + R(6, 46, 52, 7, C.am, 1.5) + PES(32, 34, 0.9, C.ti)),
"l'élection": S(R(16, 30, 32, 24, C.az, 2) + P('M22 30V20l10-8 10 8v10', 'none', C.ti, 2.6) + P('M26 38l4 4 8-8', 'none', C.vd, 2.4)),
'le débat public': S(BALAO(C.az) + '<circle cx="44" cy="40" r="14" fill="' + C.am + '" stroke="' + C.ti + '" stroke-width="2"/>' + P('M38 34l4 4 4-4M38 44l4-4 4 4', 'none', C.ti, 1.6)),
'la manifestation': S(PESSOA(16, 42, C.vm, C.ti, false, R(6, 14, 4, 20, C.ti, 1) + R(2, 10, 12, 6, C.am, 1)) + PESSOA(32, 40, C.az, C.mr, true) + PESSOA(48, 42, C.vd, C.ti, false)),
'le droit de vote': S(R(16, 30, 32, 24, C.az, 2) + P('M22 30V20l10-8 10 8v10', 'none', C.ti, 2.6) + CI(32, 12, 6, C.am, 1.6) + P('M29 12l2 2 4-4', 'none', C.ti, 1.4)),
'la constitution': S(R(14, 6, 36, 52, C.br, 2) + L(20, 16, 44, 16, 1.6, C.ti) + L(20, 24, 44, 24, 1.4, C.cz) + L(20, 30, 44, 30, 1.4, C.cz) + CI(32, 44, 5, C.am, 1.4)),
'la corruption': S(R(14, 22, 36, 24, C.cz, 2) + CI(32, 14, 7, C.am) + P('M24 34l6 6 12-12', 'none', C.vm, 2.6, '2 2')),
'la réforme': S(P('M46 18a18 18 0 1 0 4 20', 'none', C.vd, 3) + P('M52 12v10h-10', 'none', C.vd, 3)),
"l'engagement citoyen": S(PESSOA(24, 40, C.az, C.ti, false) + CI(46, 26, 10, C.vm) + P('M46 20v12M40 26h12', 'none', C.br, 2.4)),
'la justice sociale': S(P('M6 24 32 10l26 14Z', C.azc, C.ti, 2) + R(13, 27, 6, 19, C.br) + R(45, 27, 6, 19, C.br) + R(6, 46, 52, 7, C.am, 1.5) + PESSOA(32, 34, C.vd, C.ti, false)),

/* --- SCIENCE ET INNOVATION --- */
'la recherche': S('<circle cx="26" cy="26" r="14" fill="' + C.azc + '" stroke="' + C.ti + '" stroke-width="2.6"/>' + L(36, 36, 50, 50, 4, C.ti) + CI(26, 26, 2, C.ti, 0)),
"l'invention": S(CI(32, 22, 10, C.am) + R(28, 32, 8, 12, C.cz, 1.6) + L(32, 8, 32, 12, 2, C.am) + L(16, 22, 20, 22, 2, C.am) + L(44, 22, 48, 22, 2, C.am)),
"l'intelligence artificielle": S(R(16, 16, 32, 28, C.lx, 3) + CI(26, 28, 2.4, C.br, 0) + CI(38, 28, 2.4, C.br, 0) + L(32, 8, 32, 16, 2, C.ti) + CI(32, 6, 2.4, C.am, 1.4) + L(10, 24, 16, 24, 2, C.ti) + L(48, 24, 54, 24, 2, C.ti)),
'le robot': S(R(20, 18, 24, 24, C.cz, 3) + CI(32, 10, 4, C.am, 1.6) + L(32, 14, 32, 18, 2) + CI(27, 28, 2, C.az, 0) + CI(37, 28, 2, C.az, 0) + R(14, 24, 6, 12, C.cz, 2) + R(44, 24, 6, 12, C.cz, 2) + R(24, 42, 16, 12, C.cz, 2)),
"l'expérience": S('<circle cx="24" cy="40" r="12" fill="' + C.vd + '" stroke="' + C.ti + '" stroke-width="2"/>' + P('M20 12v14l-8 14', 'none', C.ti, 2.4) + P('M28 12v14l8 14', 'none', C.ti, 2.4) + L(18, 12, 30, 12, 2.4)),
'la découverte': S('<circle cx="26" cy="26" r="14" fill="' + C.am + '" stroke="' + C.ti + '" stroke-width="2.6"/>' + L(36, 36, 50, 50, 4, C.ti) + CI(26, 26, 4, C.vm, 1.4)),
'le laboratoire': S(P('M24 10v14l-12 22a4 4 0 0 0 4 6h32a4 4 0 0 0 4-6L40 24V10', 'none', C.ti, 2.4) + L(20, 10, 44, 10, 2.4) + P('M22 34h20', 'none', C.vd, 2.2)),
'la technologie': S(R(14, 14, 36, 24, C.ti, 3) + R(18, 18, 28, 16, C.azc, 1) + R(26, 42, 12, 4, C.cz) + L(32, 38, 32, 42, 2) + CI(32, 26, 4, C.am, 0)),
"l'espace": S(CI(32, 32, 12, C.tis) + '<ellipse cx="32" cy="32" rx="22" ry="6" fill="none" stroke="' + C.am + '" stroke-width="2"/>' + CI(12, 14, 2, C.br, 0) + CI(52, 50, 2, C.br, 0) + CI(50, 16, 1.4, C.br, 0)),
'le progrès': S(P('M6 46h12v-8h12v-10h12V16h12v-8', 'none', C.vd, 4) + P('M50 8l-6 0 0 6', 'none', C.vd, 4)),

/* --- CONNECTEURS LOGIQUES (B2) --- */
'cependant': S(P('M12 32h16', 'none', C.az, 4) + P('M36 32h16', 'none', C.vm, 4) + P('M24 22l-8 10 8 10M40 22l8 10-8 10', 'none', C.ti, 2.4)),
'néanmoins': S(P('M10 20h20v10H10ZM34 34h20v10H34Z', 'none', C.ti, 2.4) + P('M20 30v4M44 34v-4', 'none', C.ti, 2.4) + P('M30 25l4-4M34 39l4 4', 'none', C.vm, 2.4)),
'en revanche': S(P('M14 22l18 10-18 10', 'none', C.az, 3.4) + P('M50 22 32 32l18 10', 'none', C.vm, 3.4)),
'par conséquent': S(P('M8 32h34', 'none', C.vd, 4) + P('M36 22l14 10-14 10', 'none', C.vd, 3.4)),
'ainsi': S(P('M8 46 24 20l10 8 12-20', 'none', C.vd, 3.4) + P('M38 8h10v10', 'none', C.vd, 3.4)),
'de plus': S(L(32, 16, 32, 48, 4, C.am) + L(16, 32, 48, 32, 4, C.am)),
'or': S(CI(22, 32, 14, C.az, 2) + CI(42, 32, 14, C.am, 2) + P('M32 22v20', 'none', C.ti, 2.2, '3 3')),
'bien que': S(P('M12 32h14', 'none', C.ti, 3) + CI(32, 32, 8, C.am) + P('M38 32h14', 'none', C.ti, 3) + P('M28 28l8 8M36 28l-8 8', 'none', C.vm, 2)),
'afin de': S(P('M8 46l40-32', 'none', C.ti, 2.4, '3 3') + '<circle cx="50" cy="14" r="10" fill="none" stroke="' + C.vm + '" stroke-width="2.6"/>' + CI(50, 14, 3, C.vm, 0)),
'malgré': S('<circle cx="32" cy="32" r="20" fill="none" stroke="' + C.cz + '" stroke-width="4"/>' + P('M20 20l24 24M44 20 20 44', 'none', C.vm, 3)),

/* --- VERBES ET EXPRESSIONS B2 --- */
'affirmer': S(CI(20, 30, 12, C.am) + L(20, 30, 20, 30, 0) + P('M40 20h16M40 30h16M40 40h10', 'none', C.ti, 2.6) + CI(20, 30, 2, C.ti, 0)),
'contredire': S(BALAO(C.az) + P('M44 40l8 8M52 40l-8 8', 'none', C.vm, 2.6)),
'souligner': S(L(10, 20, 54, 20, 2.4, C.ti) + L(10, 30, 40, 30, 2.4, C.ti) + L(10, 44, 44, 44, 4, C.am)),
'remettre en question': S(CI(32, 26, 16, C.am, 0) + P('M26 20a6 6 0 0 1 12 0c0 6-6 6-6 12', 'none', C.ti, 3) + CI(32, 40, 1.6, C.ti, 0)),
"s'adapter": S(P('M10 32a22 22 0 0 1 44 0', 'none', C.vd, 3, '2 4') + P('M46 20l6-2-2 6', 'none', C.vd, 2.4) + CI(20, 40, 6, C.az) + CI(44, 40, 6, C.am)),
'provoquer': S(P('M20 8 14 30h8l-4 26 22-30h-9l7-18Z', C.am, C.ti, 1.8)),
'favoriser': S(CI(32, 32, 18, C.vd, 0) + P('M22 32l7 8 13-14', 'none', C.br, 3.6) + L(32, 12, 32, 6, 2, C.am)),
'limiter': S('<circle cx="32" cy="32" r="20" fill="' + C.br + '" stroke="' + C.vm + '" stroke-width="4"/>' + L(20, 32, 44, 32, 4, C.vm)),
'renforcer': S(P('M32 8l16 6v14c0 12-7 20-16 24-9-4-16-12-16-24V14Z', C.vd, C.ti, 2) + P('M24 30l6 6 10-10', 'none', C.br, 2.6)),
'menacer': S(P('M32 8 6 50h52Z', C.am, C.ti, 2) + L(32, 22, 32, 36, 3, C.ti) + CI(32, 42, 2, C.ti, 0))

};

var VOCAB_B2 = [
  {c:'b2-ambiente', f:'le réchauffement climatique', p:'o aquecimento global'},
  {c:'b2-ambiente', f:'les émissions de CO₂', p:'as emissões de CO₂'},
  {c:'b2-ambiente', f:'la fonte des glaciers', p:'o derretimento das geleiras'},
  {c:'b2-ambiente', f:'la sécheresse', p:'a seca'},
  {c:'b2-ambiente', f:"l'inondation", p:'a enchente'},
  {c:'b2-ambiente', f:'la déforestation', p:'o desmatamento'},
  {c:'b2-ambiente', f:'les énergies renouvelables', p:'as energias renováveis'},
  {c:'b2-ambiente', f:"l'empreinte carbone", p:'a pegada de carbono'},
  {c:'b2-ambiente', f:'le développement durable', p:'o desenvolvimento sustentável'},
  {c:'b2-ambiente', f:'la transition écologique', p:'a transição ecológica'},

  {c:'b2-sociedade', f:'la pauvreté', p:'a pobreza'},
  {c:'b2-sociedade', f:'la richesse', p:'a riqueza'},
  {c:'b2-sociedade', f:"l'inégalité", p:'a desigualdade'},
  {c:'b2-sociedade', f:'le chômage', p:'o desemprego'},
  {c:'b2-sociedade', f:'la classe sociale', p:'a classe social'},
  {c:'b2-sociedade', f:"l'immigration", p:'a imigração'},
  {c:'b2-sociedade', f:'la discrimination', p:'a discriminação'},
  {c:'b2-sociedade', f:"l'intégration", p:'a integração'},
  {c:'b2-sociedade', f:'la solidarité', p:'a solidariedade'},
  {c:'b2-sociedade', f:"l'exclusion", p:'a exclusão'},

  {c:'b2-midia', f:'la fake news', p:'a notícia falsa'},
  {c:'b2-midia', f:'la censure', p:'a censura'},
  {c:'b2-midia', f:'la liberté de la presse', p:'a liberdade de imprensa'},
  {c:'b2-midia', f:'le journaliste', p:'o jornalista'},
  {c:'b2-midia', f:'la rumeur', p:'o boato'},
  {c:'b2-midia', f:'la manipulation', p:'a manipulação'},
  {c:'b2-midia', f:'la source', p:'a fonte (de informação)'},
  {c:'b2-midia', f:'la vérification des faits', p:'a checagem de fatos'},
  {c:'b2-midia', f:"l'opinion publique", p:'a opinião pública'},
  {c:'b2-midia', f:'la propagande', p:'a propaganda (ideológica)'},

  {c:'b2-economia', f:'le budget', p:'o orçamento'},
  {c:'b2-economia', f:"l'inflation", p:'a inflação'},
  {c:'b2-economia', f:'la dette', p:'a dívida'},
  {c:'b2-economia', f:"l'investissement", p:'o investimento'},
  {c:'b2-economia', f:'la surconsommation', p:'o consumo excessivo'},
  {c:'b2-economia', f:'le marketing', p:'o marketing'},
  {c:'b2-economia', f:'la marque', p:'a marca'},
  {c:'b2-economia', f:'le salaire', p:'o salário'},
  {c:'b2-economia', f:'les impôts', p:'os impostos'},
  {c:'b2-economia', f:'la crise économique', p:'a crise econômica'},

  {c:'b2-saude', f:'le stress', p:'o estresse'},
  {c:'b2-saude', f:"l'insomnie", p:'a insônia'},
  {c:'b2-saude', f:'la dépression', p:'a depressão'},
  {c:'b2-saude', f:"l'anxiété", p:'a ansiedade'},
  {c:'b2-saude', f:"l'équilibre", p:'o equilíbrio'},
  {c:'b2-saude', f:'la thérapie', p:'a terapia'},
  {c:'b2-saude', f:'le bien-être', p:'o bem-estar'},
  {c:'b2-saude', f:'la méditation', p:'a meditação'},
  {c:'b2-saude', f:'la nutrition', p:'a nutrição'},
  {c:'b2-saude', f:"l'épuisement", p:'a exaustão'},

  {c:'b2-educacao', f:"l'apprentissage", p:'a aprendizagem'},
  {c:'b2-educacao', f:'la formation', p:'a formação'},
  {c:'b2-educacao', f:'le diplôme', p:'o diploma'},
  {c:'b2-educacao', f:'la compétence', p:'a competência'},
  {c:'b2-educacao', f:"l'échec scolaire", p:'o fracasso escolar'},
  {c:'b2-educacao', f:'la motivation', p:'a motivação'},
  {c:'b2-educacao', f:"l'enseignement à distance", p:'o ensino a distância'},
  {c:'b2-educacao', f:'le décrochage scolaire', p:'a evasão escolar'},
  {c:'b2-educacao', f:'la mémorisation', p:'a memorização'},
  {c:'b2-educacao', f:'la créativité', p:'a criatividade'},

  {c:'b2-politica', f:'la démocratie', p:'a democracia'},
  {c:'b2-politica', f:"l'élection", p:'a eleição'},
  {c:'b2-politica', f:'le débat public', p:'o debate público'},
  {c:'b2-politica', f:'la manifestation', p:'a manifestação'},
  {c:'b2-politica', f:'le droit de vote', p:'o direito de voto'},
  {c:'b2-politica', f:'la constitution', p:'a constituição'},
  {c:'b2-politica', f:'la corruption', p:'a corrupção'},
  {c:'b2-politica', f:'la réforme', p:'a reforma'},
  {c:'b2-politica', f:"l'engagement citoyen", p:'o engajamento cidadão'},
  {c:'b2-politica', f:'la justice sociale', p:'a justiça social'},

  {c:'b2-ciencia', f:'la recherche', p:'a pesquisa'},
  {c:'b2-ciencia', f:"l'invention", p:'a invenção'},
  {c:'b2-ciencia', f:"l'intelligence artificielle", p:'a inteligência artificial'},
  {c:'b2-ciencia', f:'le robot', p:'o robô'},
  {c:'b2-ciencia', f:"l'expérience", p:'o experimento'},
  {c:'b2-ciencia', f:'la découverte', p:'a descoberta'},
  {c:'b2-ciencia', f:'le laboratoire', p:'o laboratório'},
  {c:'b2-ciencia', f:'la technologie', p:'a tecnologia'},
  {c:'b2-ciencia', f:"l'espace", p:'o espaço (sideral)'},
  {c:'b2-ciencia', f:'le progrès', p:'o progresso'},

  {c:'b2-conectores', f:'cependant', p:'contudo, entretanto'},
  {c:'b2-conectores', f:'néanmoins', p:'não obstante'},
  {c:'b2-conectores', f:'en revanche', p:'em contrapartida'},
  {c:'b2-conectores', f:'par conséquent', p:'consequentemente'},
  {c:'b2-conectores', f:'ainsi', p:'assim, dessa forma'},
  {c:'b2-conectores', f:'de plus', p:'além disso'},
  {c:'b2-conectores', f:'or', p:'ora (oposição)'},
  {c:'b2-conectores', f:'bien que', p:'embora'},
  {c:'b2-conectores', f:'afin de', p:'a fim de'},
  {c:'b2-conectores', f:'malgré', p:'apesar de'},

  {c:'b2-verbos', f:'affirmer', p:'afirmar'},
  {c:'b2-verbos', f:'contredire', p:'contradizer'},
  {c:'b2-verbos', f:'souligner', p:'destacar, sublinhar'},
  {c:'b2-verbos', f:'remettre en question', p:'questionar'},
  {c:'b2-verbos', f:"s'adapter", p:'adaptar-se'},
  {c:'b2-verbos', f:'provoquer', p:'provocar'},
  {c:'b2-verbos', f:'favoriser', p:'favorecer'},
  {c:'b2-verbos', f:'limiter', p:'limitar'},
  {c:'b2-verbos', f:'renforcer', p:'reforçar'},
  {c:'b2-verbos', f:'menacer', p:'ameaçar'}
];

var proxId = window.QI_VOCAB.length;
VOCAB_B2.forEach(function (v, i) { v.id = 'v' + (proxId + i); v.icone = ICONES_B2[v.f]; v.n = 'B2'; });

window.QI_VOCAB = window.QI_VOCAB.concat(VOCAB_B2);
for (var k in ICONES_B2) window.QI_ICONES[k] = ICONES_B2[k];
})();
