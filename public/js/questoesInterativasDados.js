// =====================================================================
// QUESTÕES INTERATIVAS — dados do jogo "La ville, les commerces et les loisirs"
// (127 termos de vocabulário, em 10 categorias, cada um com um ícone SVG
// próprio). Arquivo autocontido — só monta strings SVG e o array VOCAB,
// sem nenhuma dependência do resto do site. Consumido por
// js/questoesInterativas.js (o motor do jogo).
// =====================================================================

/* =========================================================
   PALETA + ATALHOS DE DESENHO SVG
   Cada ícone é montado com estas funções para manter
   traço, cor e peso consistentes nos 127 desenhos.
   ========================================================= */
var QI_C = {
  az:'#8FBEE8', azc:'#BFD9F2', am:'#F2D785', amf:'#E8C55A',
  ti:'#1F2B45', tis:'#4A5670', vd:'#5C9E72', vm:'#C4634C',
  br:'#FFFFFF', cz:'#C9D2DE', mr:'#A8895F', rx:'#E8A0B4',
  lx:'#7E6BA8'
};
(function () {
var C = QI_C;

/** envelopa o conteúdo num <svg> */
function S(inner){
  return '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">' + inner + '</svg>';
}
/** retângulo */
function R(x,y,w,h,fill,rx){
  return '<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'"'+
    (rx?' rx="'+rx+'"':'')+' fill="'+(fill||C.br)+'" stroke="'+C.ti+'" stroke-width="2"/>';
}
/** janelinha (retângulo pequeno claro) */
function W(x,y,w,h){
  return '<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="1.2" fill="'+C.br+
    '" stroke="'+C.ti+'" stroke-width="1.4"/>';
}
/** porta */
function D(x,y,w,h,fill){
  return '<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="1" fill="'+(fill||C.mr)+
    '" stroke="'+C.ti+'" stroke-width="1.6"/>';
}
/** círculo */
function CI(cx,cy,r,fill,sw){
  var s = (sw===undefined)?2:sw;
  return '<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="'+(fill||C.br)+'"'+
    (s?' stroke="'+C.ti+'" stroke-width="'+s+'"':'')+'/>';
}
/** elipse */
function EL(cx,cy,rx,ry,fill,sw){
  var s = (sw===undefined)?2:sw;
  return '<ellipse cx="'+cx+'" cy="'+cy+'" rx="'+rx+'" ry="'+ry+'" fill="'+(fill||C.br)+'"'+
    (s?' stroke="'+C.ti+'" stroke-width="'+s+'"':'')+'/>';
}
/** telhado/triângulo: (xe,y) base-esquerda, (xd,y) base-direita, ápice no meio em ytopo */
function T(xe,y,xd,ytopo,fill){
  var cx = (xe + xd) / 2;
  return '<path d="M'+xe+' '+y+' L'+cx+' '+ytopo+' L'+xd+' '+y+' Z" fill="'+(fill||C.vm)+
    '" stroke="'+C.ti+'" stroke-width="2" stroke-linejoin="round"/>';
}
/** linha */
function L(x1,y1,x2,y2,w,col,dash){
  return '<line x1="'+x1+'" y1="'+y1+'" x2="'+x2+'" y2="'+y2+'" stroke="'+(col||C.ti)+
    '" stroke-width="'+(w||2)+'" stroke-linecap="round"'+
    (dash?' stroke-dasharray="'+dash+'"':'')+'/>';
}
/** path genérico */
function P(d,fill,stroke,w){
  return '<path d="'+d+'" fill="'+(fill||'none')+'" stroke="'+(stroke||C.ti)+
    '" stroke-width="'+(w||2)+'" stroke-linecap="round" stroke-linejoin="round"/>';
}
/** boneco (pessoa simples) */
function PES(x,y,esc,cor){
  var e = esc||1, c = cor||C.ti;
  return '<g transform="translate('+x+','+y+') scale('+e+')">'+
    '<circle cx="0" cy="0" r="4" fill="'+(cor||C.am)+'" stroke="'+c+'" stroke-width="2"/>'+
    '<path d="M0 5v9M-5 19l5-5 5 5M-5 9h10" fill="none" stroke="'+c+
    '" stroke-width="2" stroke-linecap="round"/></g>';
}

/* ===== ÍCONES: LES LIEUX (20) ===== */
var ICONES_A = {

'le centre-ville': S(
  R(6,30,9,26,C.cz)+R(17,20,10,36,C.az)+R(29,12,12,44,C.am)+R(43,24,9,32,C.azc)+R(53,34,6,22,C.cz)+
  W(8,34,4,4)+W(8,42,4,4)+W(19,25,4,4)+W(19,34,4,4)+W(19,43,4,4)+
  W(32,17,5,5)+W(32,27,5,5)+W(32,37,5,5)+W(45,29,4,4)+W(45,38,4,4)+
  L(2,56,62,56,2.5)),

'la banlieue': S(
  R(6,34,14,20,C.br)+T(3,34,23,24,C.vm)+W(9,39,4,5)+D(15,45,5,9,C.mr)+
  R(24,36,14,18,C.br)+T(21,36,41,27,C.vm)+W(27,41,4,4)+D(33,47,4,7,C.mr)+
  R(42,34,15,20,C.br)+T(39,34,60,24,C.vm)+W(45,39,4,5)+D(51,45,5,9,C.mr)+
  L(2,55,62,55,2)+P('M4 24c4-3 8-3 12 0','none',C.vd,2)),

'le quartier': S(
  R(6,6,20,20,C.am,2)+R(38,6,20,20,C.az,2)+
  R(6,38,20,20,C.vd,2)+R(38,38,20,20,C.amf,2)+
  R(26,2,12,60,C.cz,0)+R(2,26,60,12,C.cz,0)+
  L(32,4,32,60,2,C.br,'5 5')+L(4,32,60,32,2,C.br,'5 5')),

'la place': S(
  R(6,14,52,36,C.azc,4)+CI(32,32,11,C.az)+
  P('M32 24v16M24 32h16','none',C.br,2.5)+
  CI(13,21,3,C.vd,0)+CI(51,21,3,C.vd,0)+CI(13,43,3,C.vd,0)+CI(51,43,3,C.vd,0)),

'la rue': S(
  R(4,20,56,32,C.cz)+
  L(4,26,60,26,2)+L(4,46,60,46,2)+
  P('M10 36h8M24 36h8M38 36h8M52 36h6','none',C.br,3)+
  R(8,8,10,12,C.am)+R(24,6,10,14,C.az)+R(42,9,12,11,C.vd)),

"l'avenue": S(
  R(2,18,60,36,C.cz)+L(2,24,62,24,1.8)+L(2,48,62,48,1.8)+
  L(32,18,32,54,2.5)+
  P('M8 34h7M20 34h7M38 34h7M50 34h7','none',C.br,3)+
  CI(10,12,4,C.vd,0)+CI(22,12,4,C.vd,0)+CI(42,12,4,C.vd,0)+CI(54,12,4,C.vd,0)),

'le boulevard': S(
  R(2,14,60,40,C.cz)+
  R(28,14,8,40,C.vd)+CI(32,22,4,C.vd,0)+CI(32,34,4,C.vd,0)+CI(32,46,4,C.vd,0)+
  L(2,20,62,20,1.6)+L(2,48,62,48,1.6)+
  P('M8 30h6M18 30h6M42 30h6M52 30h6','none',C.br,2.6)),

'le carrefour': S(
  R(2,24,60,16,C.cz)+R(24,2,16,60,C.cz)+
  L(2,24,24,24,1.8)+L(40,24,62,24,1.8)+L(2,40,24,40,1.8)+L(40,40,62,40,1.8)+
  L(24,2,24,24,1.8)+L(40,2,40,24,1.8)+L(24,40,24,62,1.8)+L(40,40,40,62,1.8)+
  P('M6 32h8M50 32h8M32 6v8M32 50v8','none',C.br,3)),

'le rond-point': S(
  '<circle cx="32" cy="32" r="22" fill="none" stroke="'+C.cz+'" stroke-width="9"/>'+
  '<circle cx="32" cy="32" r="22" fill="none" stroke="'+C.ti+'" stroke-width="1.5"/>'+
  '<circle cx="32" cy="32" r="13" fill="none" stroke="'+C.ti+'" stroke-width="1.5"/>'+
  CI(32,32,8,C.vd)+
  P('M32 4v6M32 54v6M4 32h6M54 32h6','none',C.ti,3)+
  P('M46 18l4-4M46 18l-1-5M46 18l5 1','none',C.am,2.5)),

'le trottoir': S(
  R(4,34,56,22,C.cz)+L(4,42,60,42,1.5)+
  L(18,34,18,56,1.5)+L(32,34,32,56,1.5)+L(46,34,46,56,1.5)+
  CI(26,14,5,C.am)+
  P('M26 19v10M21 33l5-4 5 4M22 23h8','none',C.ti,2)),

'le passage piéton': S(
  '<rect x="4" y="18" width="56" height="34" fill="'+C.cz+'" opacity=".45"/>'+
  R(8,20,9,30,C.br)+R(21,20,9,30,C.br)+R(34,20,9,30,C.br)+R(47,20,9,30,C.br)+
  CI(32,10,4.5,C.am)),

'la piste cyclable': S(
  R(4,16,56,34,C.vd)+
  L(32,16,32,50,2,C.br,'6 5')+
  '<circle cx="20" cy="38" r="6" fill="none" stroke="'+C.br+'" stroke-width="2.5"/>'+
  '<circle cx="44" cy="38" r="6" fill="none" stroke="'+C.br+'" stroke-width="2.5"/>'+
  P('M20 38l7-11h6l5 11M27 27l4 11','none',C.br,2.2)),

'le parc': S(
  T(19,31,45,9,C.vd)+T(15,43,49,21,C.vd)+
  R(29,42,6,12,C.mr)+
  L(8,56,56,56,3.5,C.vd)+CI(14,44,5,C.vd)+CI(52,46,4,C.vd)),

'le jardin public': S(
  R(2,44,60,12,C.vd)+
  CI(13,24,9,C.vd)+R(11,32,4,12,C.mr)+
  CI(51,22,8,C.vd)+R(49,29,4,15,C.mr)+
  R(24,36,18,5,C.mr,1.5)+
  R(24,29,18,5,C.mr,1.5)+
  L(26,41,26,50,2.5)+L(40,41,40,50,2.5)+
  L(26,34,26,29,2.5)+L(40,34,40,29,2.5)),

'le stade': S(
  '<ellipse cx="32" cy="32" rx="26" ry="17" fill="'+C.vd+'" stroke="'+C.ti+'" stroke-width="2"/>'+
  '<ellipse cx="32" cy="32" rx="18" ry="11" fill="none" stroke="'+C.br+'" stroke-width="1.8"/>'+
  L(32,21,32,43,1.8,C.br)+
  '<circle cx="32" cy="32" r="4" fill="none" stroke="'+C.br+'" stroke-width="1.8"/>'+
  P('M6 32v5c0 9 12 15 26 15s26-6 26-15v-5',C.azc,C.ti,2)),

'la gare': S(
  R(8,20,48,26,C.azc,3)+W(14,26,10,9)+W(27,26,10,9)+W(40,26,10,9)+
  P('M6 20 32 8 58 20',C.am,C.ti,2)+
  CI(18,49,4,C.ti,0)+CI(46,49,4,C.ti,0)+L(4,55,60,55,2.5)),

'la gare routière': S(
  P('M4 22h56v-6H4Z',C.am,C.ti,2)+
  R(8,26,20,16,C.az,3)+R(36,26,20,16,C.vd,3)+
  W(11,29,6,6)+W(19,29,6,6)+W(39,29,6,6)+W(47,29,6,6)+
  CI(13,46,3.5,C.ti,0)+CI(23,46,3.5,C.ti,0)+CI(41,46,3.5,C.ti,0)+CI(51,46,3.5,C.ti,0)+
  L(2,53,62,53,2.5)),

'la station de métro': S(
  CI(32,22,15,C.am)+
  P('M24 30V15l8 9 8-9v15','none',C.ti,3.4)+
  R(29,37,6,17,C.cz,1)+
  L(20,54,44,54,3)+
  P('M10 44h8M46 44h8','none',C.az,3)),

"l'aéroport": S(
  P('M32 6l5 20 22 8v5l-22-3-2 12 7 5v4l-10-3-10 3v-4l7-5-2-12-22 3v-5l22-8Z',C.az,C.ti,2)+
  L(6,58,58,58,2.5)+
  P('M14 52h12M38 52h12','none',C.am,2.5)),

'le port': S(
  R(6,10,4,32,C.cz)+P('M8 12h30M38 12v9','none',C.ti,2.5)+
  R(30,24,10,7,C.am,1)+
  R(14,34,12,8,C.vm,1)+R(28,34,12,8,C.az,1)+R(42,34,12,8,C.vd,1)+
  R(20,26,12,8,C.amf,1)+R(34,26,12,8,C.azc,1)+
  L(2,46,62,46,3)+
  P('M2 54c5-3 9-3 14 0s9 3 14 0 9-3 14 0 9 3 14 0','none',C.az,2.5))

};

/* ===== ÍCONES: LES COMMERCES (23) ===== */
var ICONES_B = {

'la boulangerie': S(
  EL(32,36,21,12,C.am)+
  P('M19 30c2 3 2 9 0 12M26 28c2 4 2 13 0 17M38 28c-2 4-2 13 0 17M45 30c-2 3-2 9 0 12','none',C.ti,1.8)+
  P('M6 20l4-8h44l4 8Z',C.vm,C.ti,2)),

'la pâtisserie': S(
  R(20,28,24,7,C.rx,2)+
  R(15,35,34,8,C.br,2)+
  R(10,43,44,10,C.rx,2)+
  CI(32,21,5,C.vm)+L(32,26,32,28,2.4)+
  CI(22,25,2.6,C.am)+CI(42,25,2.6,C.am)+
  L(8,53,56,53,2.5)),

'la boucherie': S(
  P('M20 40c-5-4-5-14 2-19 6-4 15-4 20 2 5 5 4 14-2 18-6 4-14 3-20-1Z',C.vm,C.ti,2)+
  CI(34,30,5,C.br)+
  P('M22 44l-6 10M42 43l6 11','none',C.ti,2.5)+
  P('M12 10l12 12','none',C.ti,3.4)),

'la poissonnerie': S(
  P('M8 32c8-11 24-14 34-6 3 2 5 5 6 8-1 3-3 6-6 8-10 8-26 5-34-6Z',C.az,C.ti,2)+
  P('M48 26l8-6v24l-8-6','none',C.ti,2)+
  CI(20,29,2.6,C.br,1.5)+
  P('M28 26c3 4 3 8 0 12M36 27c3 3 3 7 0 10','none',C.ti,1.6)+
  L(6,50,58,50,2.5,C.azc)),

'la charcuterie': S(
  P('M16 22c10-4 22-4 32 0 3 1 3 4 0 5-10 4-22 4-32 0-3-1-3-4 0-5Z',C.rx,C.ti,2)+
  P('M16 34c10-4 22-4 32 0 3 1 3 4 0 5-10 4-22 4-32 0-3-1-3-4 0-5Z',C.rx,C.ti,2)+
  P('M16 46c10-4 22-4 32 0 3 1 3 4 0 5-10 4-22 4-32 0-3-1-3-4 0-5Z',C.rx,C.ti,2)+
  L(32,6,32,20,3)+P('M26 10h12','none',C.ti,2.5)),

'la pharmacie': S(
  R(10,12,44,42,C.br,5)+
  R(27,20,10,28,C.vd,2)+R(18,29,28,10,C.vd,2)),

'la librairie': S(
  P('M8 16c8-4 16-4 24 0v34c-8-4-16-4-24 0Z',C.az,C.ti,2)+
  P('M56 16c-8-4-16-4-24 0v34c8-4 16-4 24 0Z',C.amf,C.ti,2)+
  L(32,16,32,50,2)+
  P('M14 24c5-2 9-2 13 0M14 31c5-2 9-2 13 0M37 24c5-2 9-2 13 0M37 31c5-2 9-2 13 0','none',C.ti,1.3)),

'la papeterie': S(
  R(12,10,30,40,C.br,2)+
  P('M18 20h18M18 28h18M18 36h12','none',C.az,2.2)+
  P('M44 16l8 6-20 26-9 3 2-9Z',C.am,C.ti,2)+
  P('M44 16l8 6','none',C.ti,2)),

'le fleuriste': S(
  CI(32,14,6,C.rx)+CI(42,22,6,C.rx)+CI(38,33,6,C.rx)+CI(26,33,6,C.rx)+CI(22,22,6,C.rx)+
  CI(32,24,5.5,C.am)+
  P('M32 30v14','none',C.vd,3)+
  EL(24,36,6,3.4,C.vd)+EL(40,39,6,3.4,C.vd)+
  P('M20 44h24l-4 12H24Z',C.mr,C.ti,2)),

'le supermarché': S(
  P('M6 14h7l7 26h27l6-18H17','none',C.ti,2.5)+
  P('M18 24h32l-4 14H21Z',C.am,C.am,0)+
  P('M18 24h32l-4 14H21Z','none',C.ti,1.6)+
  CI(24,50,4.5,C.az)+CI(44,50,4.5,C.az)),

"l'hypermarché": S(
  P('M4 26h56l-4-12H8Z',C.am,C.ti,2)+
  R(8,26,48,28,C.br,2)+
  R(14,32,12,10,C.azc,1.5)+R(30,32,10,10,C.azc,1.5)+R(44,32,8,10,C.azc,1.5)+
  R(14,46,38,6,C.cz,1)+
  P('M20 14v12M32 14v12M44 14v12','none',C.ti,1.6)),

"l'épicerie": S(
  R(10,26,44,28,C.br,3)+
  P('M8 26l4-10h40l4 10Z',C.vd,C.ti,2)+
  R(16,32,10,8,C.vm,1.5)+R(28,32,8,8,C.am,1.5)+R(38,32,10,8,C.azc,1.5)+
  R(16,44,32,6,C.cz,1)+
  L(6,54,58,54,2.5)),

'le marché': S(
  P('M8 22h48l-4 8H12Z',C.vm,C.ti,2)+
  P('M14 22l3-8h30l3 8',C.br,C.ti,2)+
  R(14,32,36,20,C.azc,2)+
  CI(23,41,4,C.vm)+CI(33,43,4,C.vd)+CI(42,41,4,C.am)),

'le centre commercial': S(
  R(6,20,52,34,C.br,3)+
  P('M4 20l6-10h44l6 10Z',C.az,C.ti,2)+
  R(12,28,12,12,C.azc,1.5)+R(28,28,10,12,C.am,1.5)+R(42,28,10,12,C.vd,1.5)+
  R(24,44,16,10,C.cz,1.5)+L(32,44,32,54,1.5)+
  P('M16 14h32','none',C.br,2)),

'la boutique': S(
  R(14,26,36,28,C.br,2)+
  P('M12 26l3-9h34l3 9Z',C.rx,C.ti,2)+
  R(20,34,10,12,C.azc,1.5)+
  D(36,36,10,18,C.mr)+
  L(10,54,54,54,2.5)+
  CI(25,30,1.6,C.ti,0)),

'le magasin': S(
  R(10,24,44,30,C.br,2)+
  P('M8 24l4-10h40l4 10Z',C.am,C.ti,2)+
  R(16,32,14,12,C.azc,1.5)+R(34,32,14,12,C.azc,1.5)+
  D(26,46,12,8,C.mr)+
  L(6,54,58,54,2.5)),

'la bijouterie': S(
  P('M20 14h24l10 12-22 26L10 26Z',C.azc,C.ti,2)+
  P('M10 26h44M20 14l-4 12 16 26M44 14l4 12-16 26','none',C.ti,1.6)+
  CI(32,10,3,C.am)),

'le magasin de vêtements': S(
  P('M22 14h20l12 8-6 8-4-3v27H20V27l-4 3-6-8Z',C.az,C.ti,2)+
  P('M26 14a6 6 0 0 0 12 0','none',C.ti,2)+
  P('M24 40h16','none',C.ti,1.6)),

'le magasin de chaussures': S(
  P('M8 40h20l10 6h14a4 4 0 0 1 4 4v4H8Z',C.vm,C.ti,2)+
  P('M8 40V26a4 4 0 0 1 8 0v14','none',C.ti,2)+
  P('M28 46l4-4M34 48l4-4','none',C.ti,1.6)+
  L(6,54,58,54,2.5)),

'le salon de coiffure': S(
  '<circle cx="17" cy="46" r="7" fill="none" stroke="'+C.ti+'" stroke-width="2.5"/>'+
  '<circle cx="43" cy="46" r="7" fill="none" stroke="'+C.ti+'" stroke-width="2.5"/>'+
  P('M22 41 46 12M42 41 18 12','none',C.az,4)+
  P('M22 41 46 12M42 41 18 12','none',C.ti,1.6)),

'le pressing': S(
  R(14,14,36,10,C.az,2)+
  P('M18 24c0 6-6 8-6 16v14h40V40c0-8-6-10-6-16Z',C.br,C.ti,2)+
  CI(32,42,7,C.azc)+
  P('M28 42a4 4 0 0 1 8 0','none',C.ti,1.6)+
  P('M22 18h20','none',C.ti,1.6)),

'la banque': S(
  P('M6 24 32 10l26 14Z',C.am,C.ti,2)+
  R(12,26,5,20,C.br)+R(23,26,5,20,C.br)+R(35,26,5,20,C.br)+R(46,26,5,20,C.br)+
  R(6,47,52,6,C.azc,1.5)),

'la poste': S(
  R(6,18,52,32,C.am,4)+
  P('M6 21l26 19 26-19','none',C.ti,2.2)+
  P('M6 48l18-14M58 48L40 34','none',C.ti,1.6))

};

/* ===== ÍCONES: LES BÂTIMENTS PUBLICS (15) + LES TRANSPORTS (14) ===== */
var ICONES_C = {

/* --- BÂTIMENTS --- */
'la mairie': S(
  R(10,26,44,26,C.br)+
  T(8,26,56,12,C.azc)+
  D(28,36,8,16,C.mr)+W(16,34,7,8)+W(41,34,7,8)+
  P('M32 12V4M32 4h10v6H32','none',C.ti,1.8)+
  R(33,4,9,6,C.vm,1)),

"l'hôtel de ville": S(
  R(8,24,48,30,C.br)+
  T(6,24,58,8,C.az)+
  R(26,10,12,14,C.am,2)+CI(32,17,4,C.br,1.5)+
  P('M32 15v2.5l2 1','none',C.ti,1.4)+
  D(28,38,8,16,C.mr)+W(14,32,8,8)+W(42,32,8,8)+
  L(4,54,60,54,2.5)),

"l'école": S(
  R(10,26,44,28,C.am)+
  T(8,26,56,13,C.vm)+
  D(27,38,10,16,C.mr)+W(15,33,8,8)+W(41,33,8,8)+
  CI(32,19,4,C.br,1.5)+P('M32 17v2.5l1.5 1','none',C.ti,1.3)),

'le collège': S(
  R(8,22,48,32,C.azc)+
  W(14,28,8,8)+W(26,28,8,8)+W(38,28,8,8)+W(14,40,8,8)+W(38,40,8,8)+
  D(27,40,10,14,C.mr)+
  P('M6 22l26-10 26 10Z',C.vd,C.ti,2)+
  R(24,6,4,8,C.vm,1)),

'le lycée': S(
  R(6,24,52,30,C.br)+
  P('M4 24 32 10l28 14Z',C.az,C.ti,2)+
  W(12,30,9,9)+W(26,30,9,9)+W(40,30,9,9)+
  D(26,42,12,12,C.mr)+
  P('M32 10V4','none',C.ti,2)+R(32,3,9,6,C.am,1)),

"l'université": S(
  P('M32 8 60 20 32 32 4 20Z',C.am,C.ti,2)+
  P('M14 25v11c0 4 8 8 18 8s18-4 18-8V25',C.azc,C.ti,2.2)+
  P('M56 22v12','none',C.ti,2)+CI(56,36,2.6,C.am,1.5)+
  L(8,54,56,54,2.5,C.azc)),

"l'hôpital": S(
  R(12,14,40,40,C.br,4)+
  R(27,20,10,24,C.vm,1.5)+R(20,27,24,10,C.vm,1.5)+
  R(26,46,12,8,C.azc,1.5)),

'la clinique': S(
  R(10,20,44,34,C.br,4)+
  R(28,26,8,18,C.vd,1.5)+R(23,32,18,7,C.vd,1.5)+
  P('M6 20l26-10 26 10Z',C.azc,C.ti,2)+
  L(8,54,56,54,2.5)),

'le commissariat': S(
  P('M32 6l20 6v18c0 12-9 20-20 24-11-4-20-12-20-24V12Z',C.az,C.ti,2)+
  P('M32 18l3 7h7l-6 5 2 8-6-4-6 4 2-8-6-5h7Z',C.am,C.ti,1.6)),

'la caserne des pompiers': S(
  R(6,26,52,26,C.vm,2)+
  P('M4 26l6-10h44l6 10Z',C.ti,C.ti,2)+
  R(12,32,16,14,C.azc,1.5)+R(36,32,16,14,C.azc,1.5)+
  P('M32 4c4 6 8 8 8 13a8 8 0 0 1-16 0c0-5 4-7 8-13Z',C.am,C.ti,2)),

'le tribunal': S(
  P('M6 24 32 10l26 14Z',C.azc,C.ti,2)+
  R(13,27,6,19,C.br)+R(29,27,6,19,C.br)+R(45,27,6,19,C.br)+
  R(6,46,52,7,C.am,1.5)+
  P('M32 4v6','none',C.ti,2)+P('M22 10h20M26 10l-4 8h8ZM38 10l4 8h-8Z','none',C.ti,1.8)),

'la bibliothèque': S(
  R(8,14,10,38,C.vm,1.5)+R(20,20,9,32,C.am,1.5)+
  R(31,16,9,36,C.az,1.5)+R(42,23,9,29,C.vd,1.5)+
  L(6,53,56,53,2.5)),

'le musée': S(
  P('M6 24 32 10l26 14Z',C.azc,C.ti,2)+
  R(13,27,6,19,C.br)+R(29,27,6,19,C.br)+R(45,27,6,19,C.br)+
  R(6,46,52,7,C.am,1.5)+
  CI(32,17,3,C.am,1.5)),

'le théâtre': S(
  P('M12 16h20v18a10 10 0 0 1-20 0Z',C.am,C.ti,2)+
  CI(18,26,2.2,C.ti,0)+CI(26,26,2.2,C.ti,0)+
  P('M17 34c3 3 7 3 10 0','none',C.ti,2)+
  P('M32 24h20v18a10 10 0 0 1-20 0Z',C.az,C.ti,2)+
  CI(38,34,2.2,C.ti,0)+CI(46,34,2.2,C.ti,0)+
  P('M37 44c3-3 7-3 10 0','none',C.ti,2)),

'le cinéma': S(
  R(8,22,40,26,C.ti,3)+
  CI(18,30,4,C.am,0)+CI(30,30,4,C.br,0)+CI(42,30,4,C.am,0)+
  CI(18,41,4,C.br,0)+CI(30,41,4,C.am,0)+CI(42,41,4,C.br,0)+
  P('M48 30l10-6v22l-10-6Z',C.az,C.ti,2)),

/* --- TRANSPORTS --- */
'la voiture': S(
  P('M6 40v-7l6-2 5-9h30l5 9 6 2v7Z',C.vm,C.ti,2)+
  P('M19 24h11v8H15Zm15 0h10l5 8H34Z',C.azc,C.ti,1.6)+
  CI(19,43,6,C.ti,0)+CI(45,43,6,C.ti,0)+
  CI(19,43,2.4,C.cz,0)+CI(45,43,2.4,C.cz,0)),

'le bus': S(
  R(7,16,50,30,C.am,6)+
  R(12,22,15,11,C.azc,1.5)+R(31,22,15,11,C.azc,1.5)+
  CI(19,49,5,C.ti,0)+CI(45,49,5,C.ti,0)+
  CI(19,49,2,C.br,0)+CI(45,49,2,C.br,0)+
  R(12,38,6,4,C.br,1)),

'le métro': S(
  R(12,10,40,38,C.az,7)+
  R(18,17,28,14,C.br,2)+L(32,17,32,31,1.5)+
  CI(21,39,3,C.am,1.5)+CI(43,39,3,C.am,1.5)+
  L(17,48,12,56,2.5)+L(47,48,52,56,2.5)),

'le tramway': S(
  R(10,14,44,34,C.vd,5)+
  R(15,20,15,12,C.br,1.5)+R(34,20,15,12,C.br,1.5)+
  CI(20,51,3.5,C.ti,0)+CI(44,51,3.5,C.ti,0)+
  P('M32 14V6M26 6h12','none',C.ti,2)+
  L(4,57,60,57,2.5)),

'le train': S(
  P('M10 14h44v22a4 4 0 0 1-4 4H14a4 4 0 0 1-4-4Z',C.az,C.ti,2)+
  R(16,20,12,10,C.br,1.5)+R(36,20,12,10,C.br,1.5)+
  CI(20,45,4,C.ti,0)+CI(32,45,4,C.ti,0)+CI(44,45,4,C.ti,0)+
  L(6,52,58,52,2.5)+
  P('M14 8h36','none',C.ti,2.5)),

'le taxi': S(
  P('M6 40v-7l6-2 5-9h30l5 9 6 2v7Z',C.am,C.ti,2)+
  P('M19 24h11v8H15Zm15 0h10l5 8H34Z',C.azc,C.ti,1.6)+
  CI(19,43,6,C.ti,0)+CI(45,43,6,C.ti,0)+
  R(26,12,12,7,C.ti,1.5)+
  P('M28 14h8','none',C.am,2)),

'le vélo': S(
  '<circle cx="16" cy="42" r="11" fill="none" stroke="'+C.ti+'" stroke-width="2.5"/>'+
  '<circle cx="48" cy="42" r="11" fill="none" stroke="'+C.ti+'" stroke-width="2.5"/>'+
  P('M16 42 27 24h11l10 18M27 24l6 18','none',C.az,2.8)+
  P('M24 22h7M44 24l4-6h4','none',C.ti,2.2)+
  CI(33,42,3,C.am,1.5)),

'le vélo en libre-service': S(
  '<circle cx="18" cy="44" r="9" fill="none" stroke="'+C.ti+'" stroke-width="2.4"/>'+
  '<circle cx="46" cy="44" r="9" fill="none" stroke="'+C.ti+'" stroke-width="2.4"/>'+
  P('M18 44 28 30h9l9 14M28 30l5 14','none',C.vd,2.6)+
  R(24,8,16,14,C.am,2)+
  P('M28 14h8M28 18h5','none',C.ti,1.8)+
  L(32,22,32,28,2)),

'la moto': S(
  '<circle cx="14" cy="44" r="10" fill="none" stroke="'+C.ti+'" stroke-width="2.6"/>'+
  '<circle cx="50" cy="44" r="10" fill="none" stroke="'+C.ti+'" stroke-width="2.6"/>'+
  P('M14 44l8-12h16l12 12',C.vm,C.ti,2.4)+
  R(20,24,14,8,C.am,2)+
  P('M22 24l-6-6h10','none',C.ti,2.6)+
  P('M40 30l6-8h6','none',C.ti,2.6)),

'le scooter': S(
  '<circle cx="15" cy="46" r="9" fill="none" stroke="'+C.ti+'" stroke-width="2.5"/>'+
  '<circle cx="49" cy="46" r="9" fill="none" stroke="'+C.ti+'" stroke-width="2.5"/>'+
  P('M15 46h14l4-14h10l6 14',C.azc,C.ti,2.4)+
  R(28,22,12,10,C.am,2)+
  P('M44 32l4-14h6','none',C.ti,2.6)),

'le covoiturage': S(
  P('M6 44v-7l6-2 5-9h30l5 9 6 2v7Z',C.az,C.ti,2)+
  P('M19 28h11v8H15Zm15 0h10l5 8H34Z',C.azc,C.ti,1.6)+
  CI(19,47,5,C.ti,0)+CI(45,47,5,C.ti,0)+
  CI(23,14,5,C.am)+CI(41,14,5,C.vd)+
  P('M17 24a6 6 0 0 1 12 0M35 24a6 6 0 0 1 12 0','none',C.ti,2)),

"l'avion": S(
  P('M32 6l5 20 22 8v5l-22-3-2 12 7 5v4l-10-3-10 3v-4l7-5-2-12-22 3v-5l22-8Z',C.az,C.ti,2)),

'le bateau': S(
  P('M8 42h48l-7 12H15Z',C.vm,C.ti,2)+
  P('M32 40V10l16 30Z',C.br,C.ti,2)+
  P('M28 40V16L14 40Z',C.azc,C.ti,2)+
  P('M4 58c5-3 9-3 14 0s9 3 14 0 9-3 14 0 9 3 14 0','none',C.az,2.5)),

'le ferry': S(
  P('M6 40h52l-6 12H12Z',C.br,C.ti,2)+
  R(14,26,36,14,C.azc,2)+
  W(19,30,7,7)+W(29,30,7,7)+W(39,30,7,7)+
  R(28,14,10,12,C.br,1.5)+
  P('M32 14V8','none',C.ti,2)+
  P('M4 58c5-3 9-3 14 0s9 3 14 0 9-3 14 0 9 3 14 0','none',C.az,2.5))

};

/* ===== ÍCONES: CIRCULATION (14) + DÉPLACEMENTS (13) + INFRASTRUCTURES (9)
        + LOISIRS (9) + PROBLÈMES (10) ===== */
var ICONES_D = {

/* --- LA CIRCULATION --- */
'la circulation': S(
  R(2,14,60,36,C.cz,0)+
  L(2,32,62,32,2,C.br,'6 5')+
  R(8,17,20,11,C.vm,2)+R(36,17,20,11,C.am,2)+
  R(8,36,20,11,C.az,2)+R(36,36,20,11,C.vd,2)+
  L(2,14,62,14,2)+L(2,50,62,50,2)),

'les embouteillages': S(
  R(6,8,22,12,C.vm,3)+R(36,8,22,12,C.az,3)+
  R(6,26,22,12,C.am,3)+R(36,26,22,12,C.vd,3)+
  R(21,44,22,12,C.cz,3)+
  L(32,4,32,60,1.4,C.ti,'4 4')),

'un bouchon': S(
  R(10,6,44,10,C.vm,2)+R(10,20,44,10,C.am,2)+
  R(10,34,44,10,C.az,2)+R(10,48,44,10,C.vd,2)+
  P('M4 10h4M4 24h4M4 38h4M4 52h4','none',C.ti,2)+
  P('M56 10h4M56 24h4M56 38h4M56 52h4','none',C.ti,2)),

'la pollution': S(
  R(14,28,12,26,C.cz)+R(30,34,11,20,C.cz)+R(45,30,10,24,C.cz)+
  CI(20,18,7,C.tis,0)+CI(30,13,8,C.tis,0)+CI(42,18,6,C.tis,0)+
  R(17,36,5,5,C.am,0)+R(47,38,5,5,C.am,0)),

'le feu rouge': S(
  R(20,6,24,42,C.ti,6)+
  CI(32,17,6,C.vm,0)+CI(32,30,6,'#5A5F6B',0)+CI(32,43,6,'#5A5F6B',0)+
  R(29,48,6,10,C.cz)),

'le feu vert': S(
  R(20,6,24,42,C.ti,6)+
  CI(32,17,6,'#5A5F6B',0)+CI(32,30,6,'#5A5F6B',0)+CI(32,43,6,C.vd,0)+
  R(29,48,6,10,C.cz)),

'le feu orange': S(
  R(20,6,24,42,C.ti,6)+
  CI(32,17,6,'#5A5F6B',0)+CI(32,30,6,C.am,0)+CI(32,43,6,'#5A5F6B',0)+
  R(29,48,6,10,C.cz)),

'le panneau de signalisation': S(
  P('M32 6 54 28 32 50 10 28Z',C.am,C.ti,2.4)+
  P('M32 18v14M32 36v2','none',C.ti,3.4)+
  R(30,50,4,10,C.cz)),

'la limitation de vitesse': S(
  CI(32,32,24,C.br,0)+
  '<circle cx="32" cy="32" r="24" fill="none" stroke="'+C.vm+'" stroke-width="7"/>'+
  '<circle cx="32" cy="32" r="24" fill="none" stroke="'+C.ti+'" stroke-width="1.4"/>'+
  P('M30 22h-9v9h5a5 5 0 1 1-5 5','none',C.ti,3.6)+
  '<rect x="36" y="21" width="12" height="21" rx="6" fill="none" stroke="'+C.ti+'" stroke-width="3.6"/>'),

'le stationnement': S(
  R(10,8,44,48,C.az,7)+
  P('M25 46V18h10a8 8 0 0 1 0 16h-10','none',C.br,5.5)+
  P('M4 32h6M54 32h6','none',C.ti,2.5)),

'le parking': S(
  R(6,14,52,34,C.ti,3)+
  R(10,18,44,26,C.azc,0)+
  P('M22 40V22h8a6 6 0 0 1 0 12h-8','none',C.ti,4)+
  L(12,48,52,48,2.5)+
  P('M16 48v8M48 48v8','none',C.cz,3)),

'une place de parking': S(
  R(8,10,48,44,C.cz,0)+
  P('M8 10v44M56 10v44M8 32h48','none',C.br,3)+
  P('M12 40v-6l4-1 3-5h16l3 5 4 1v6Z',C.vm,C.ti,2)+
  CI(19,42,3.4,C.ti,0)+CI(37,42,3.4,C.ti,0)),

'les transports en commun': S(
  R(4,20,26,24,C.am,4)+W(8,25,7,7)+W(18,25,7,7)+
  CI(11,47,3.4,C.ti,0)+CI(24,47,3.4,C.ti,0)+
  R(34,14,26,30,C.az,4)+W(38,19,7,7)+W(48,19,7,7)+
  CI(41,47,3.4,C.ti,0)+CI(54,47,3.4,C.ti,0)+
  L(2,54,62,54,2.5)),

'la mobilité urbaine': S(
  CI(32,32,20,C.azc)+
  '<circle cx="14" cy="46" r="6" fill="none" stroke="'+C.ti+'" stroke-width="2.2"/>'+
  '<circle cx="34" cy="46" r="6" fill="none" stroke="'+C.ti+'" stroke-width="2.2"/>'+
  P('M14 46l7-10h6l7 10M21 36l4 10','none',C.vd,2.2)+
  R(40,16,16,14,C.am,2)+W(43,19,4,4)+W(49,19,4,4)+
  CI(44,32,2.6,C.ti,0)+CI(52,32,2.6,C.ti,0)),

/* --- LES DÉPLACEMENTS --- */
'marcher': S(
  CI(32,10,6,C.am)+
  P('M32 16v14l-8 12M32 30l8 10','none',C.ti,3)+
  P('M24 42l-4 12M40 40l6 12','none',C.ti,3)+
  P('M32 20l-8 4M32 20l9 5','none',C.ti,2.6)),

'se promener': S(
  CI(24,12,6,C.am)+
  P('M24 18v14l-6 12M24 32l6 10','none',C.ti,3)+
  P('M18 44l-3 10M30 42l4 12','none',C.ti,3)+
  P('M24 22l8 6','none',C.ti,2.6)+
  CI(48,40,5,C.mr)+P('M48 45v6M44 51h8','none',C.ti,2.4)+
  P('M32 28h10','none',C.ti,2)),

'prendre le métro': S(
  R(24,6,32,32,C.az,6)+
  R(29,12,22,10,C.br,1.5)+
  CI(32,30,2.6,C.am,1.4)+CI(48,30,2.6,C.am,1.4)+
  CI(12,26,5,C.am)+
  P('M12 31v10l-4 10M12 41l5 10','none',C.ti,2.6)+
  P('M12 34l10 2','none',C.ti,2.4)+
  L(20,56,60,56,2.5)),

'prendre le bus': S(
  R(26,10,32,28,C.am,5)+
  W(30,15,10,8)+W(44,15,10,8)+
  CI(34,42,4,C.ti,0)+CI(50,42,4,C.ti,0)+
  CI(12,24,5,C.vd)+
  P('M12 29v10l-4 10M12 39l5 10','none',C.ti,2.6)+
  P('M12 32l10 2','none',C.ti,2.4)),

'conduire': S(
  '<circle cx="32" cy="34" r="20" fill="none" stroke="'+C.ti+'" stroke-width="3"/>'+
  CI(32,34,6,C.az)+
  P('M32 14v14M14 42l13-5M50 42l-13-5','none',C.ti,3)+
  CI(20,12,4,C.am,1.6)+CI(44,12,4,C.am,1.6)),

'faire du vélo': S(
  '<circle cx="16" cy="46" r="8" fill="none" stroke="'+C.ti+'" stroke-width="2.4"/>'+
  '<circle cx="48" cy="46" r="8" fill="none" stroke="'+C.ti+'" stroke-width="2.4"/>'+
  P('M16 46l10-12h8l14 12M26 34l6 12','none',C.az,2.4)+
  CI(38,12,5,C.am)+
  P('M38 17l-4 10M34 27l8 6','none',C.ti,2.6)+
  P('M38 20l8 6','none',C.ti,2.4)),

'traverser la rue': S(
  R(4,16,56,32,C.cz,0)+
  R(8,18,8,28,C.br,1.4)+R(22,18,8,28,C.br,1.4)+R(36,18,8,28,C.br,1.4)+R(50,18,8,28,C.br,1.4)+
  CI(32,10,5,C.am)+
  P('M32 15v10M28 33l4-8 5 8','none',C.ti,2.8)),

'tourner à droite': S(
  P('M18 54V30a10 10 0 0 1 10-10h16','none',C.az,7)+
  P('M38 12l10 8-10 8','none',C.ti,3.4)+
  P('M18 54V30a10 10 0 0 1 10-10h16','none',C.ti,1.6)),

'tourner à gauche': S(
  P('M46 54V30a10 10 0 0 0-10-10H20','none',C.am,7)+
  P('M26 12l-10 8 10 8','none',C.ti,3.4)+
  P('M46 54V30a10 10 0 0 0-10-10H20','none',C.ti,1.6)),

'aller tout droit': S(
  P('M32 56V16','none',C.vd,8)+
  P('M18 26 32 10l14 16','none',C.ti,3.6)+
  P('M32 56V16','none',C.ti,1.6)),

'prendre un taxi': S(
  P('M8 42v-7l6-2 5-9h26l5 9 6 2v7Z',C.am,C.ti,2)+
  P('M20 26h10v8H16Zm14 0h9l5 8H34Z',C.azc,C.ti,1.6)+
  CI(20,45,5,C.ti,0)+CI(44,45,5,C.ti,0)+
  R(26,14,12,7,C.ti,1.5)+
  P('M52 18l6-6M56 12h-6M56 12v6','none',C.vm,2.6)),

'monter dans le bus': S(
  R(28,10,30,34,C.am,5)+W(32,16,9,8)+W(45,16,9,8)+
  CI(36,48,4,C.ti,0)+CI(50,48,4,C.ti,0)+
  CI(12,22,5,C.vd)+
  P('M12 27v10l-3 9M12 37l5 9','none',C.ti,2.6)+
  P('M14 30l10 0','none',C.vd,3)+
  P('M20 26l6 4-6 4','none',C.vd,2.6)),

'descendre du bus': S(
  R(6,10,30,34,C.am,5)+W(10,16,9,8)+W(23,16,9,8)+
  CI(14,48,4,C.ti,0)+CI(28,48,4,C.ti,0)+
  CI(52,22,5,C.vm)+
  P('M52 27v10l-3 9M52 37l4 9','none',C.ti,2.6)+
  P('M50 30l-10 0','none',C.vm,3)+
  P('M44 26l-6 4 6 4','none',C.vm,2.6)),

/* --- INFRASTRUCTURES --- */
'les immeubles': S(
  R(6,20,16,36,C.azc)+R(24,12,16,44,C.am)+R(42,26,16,30,C.az)+
  W(9,25,4,5)+W(15,25,4,5)+W(9,34,4,5)+W(15,34,4,5)+W(9,43,4,5)+W(15,43,4,5)+
  W(27,17,4,5)+W(33,17,4,5)+W(27,26,4,5)+W(33,26,4,5)+W(27,35,4,5)+W(33,35,4,5)+
  W(45,31,4,5)+W(51,31,4,5)+W(45,40,4,5)+W(51,40,4,5)+
  L(2,56,62,56,2.5)),

'les gratte-ciel': S(
  R(10,14,14,42,C.az)+R(26,4,14,52,C.azc)+R(42,22,12,34,C.am)+
  P('M13 20h8M13 28h8M13 36h8M13 44h8','none',C.ti,1.4)+
  P('M29 10h8M29 18h8M29 26h8M29 34h8M29 42h8','none',C.ti,1.4)+
  P('M45 28h6M45 36h6M45 44h6','none',C.ti,1.4)+
  L(33,4,33,0,2)+L(4,56,60,56,2.5)),

'les logements': S(
  R(8,30,20,24,C.br)+T(6,30,30,18,C.vm)+W(12,35,5,5)+D(19,42,6,12,C.mr)+
  R(34,26,22,28,C.br)+T(32,26,58,14,C.az)+W(39,32,5,5)+W(48,32,5,5)+D(43,42,6,12,C.mr)+
  L(4,54,60,54,2.5)),

'les espaces verts': S(
  R(2,42,60,14,C.vd,0)+
  CI(14,26,9,C.vd)+R(12,34,4,10,C.mr)+
  CI(34,20,8,C.vd)+R(32,27,4,16,C.mr)+
  CI(52,28,8,C.vd)+R(50,35,4,9,C.mr)+
  P('M6 50h12M26 50h12M46 50h12','none',C.br,2)),

'les espaces publics': S(
  R(4,38,56,18,C.cz,0)+
  R(14,42,14,5,C.mr,1.5)+R(14,35,14,5,C.mr,1.5)+
  L(16,47,16,54,2.4)+L(26,47,26,54,2.4)+
  CI(44,24,8,C.vd)+R(42,31,4,9,C.mr)+
  PES(38,44,0.75)+PES(52,44,0.75)),

"l'éclairage public": S(
  P('M32 56V22','none',C.cz,5)+
  P('M32 22c0-8 8-10 12-10','none',C.ti,3)+
  P('M38 12h14l4 10H34Z',C.am,C.ti,2)+
  P('M36 24l-4 8M46 24l4 8M42 24v10','none',C.am,2.4)+
  L(20,58,44,58,3)),

'les transports publics': S(
  R(6,16,24,26,C.am,4)+W(10,21,6,6)+W(20,21,6,6)+
  CI(13,45,3.4,C.ti,0)+CI(24,45,3.4,C.ti,0)+
  R(36,10,22,32,C.az,4)+W(40,15,6,6)+W(50,15,6,6)+
  CI(42,45,3.4,C.ti,0)+CI(53,45,3.4,C.ti,0)+
  L(2,52,62,52,2.5)+
  P('M4 58h56','none',C.cz,3)),

'les réseaux routiers': S(
  R(2,24,60,16,C.cz,0)+R(24,2,16,60,C.cz,0)+
  L(2,32,24,32,2,C.br,'5 4')+L(40,32,62,32,2,C.br,'5 4')+
  L(32,2,32,24,2,C.br,'5 4')+L(32,40,32,62,2,C.br,'5 4')+
  L(2,24,24,24,1.6)+L(40,24,62,24,1.6)+L(2,40,24,40,1.6)+L(40,40,62,40,1.6)+
  L(24,2,24,24,1.6)+L(40,2,40,24,1.6)+L(24,40,24,62,1.6)+L(40,40,40,62,1.6)),

'les infrastructures': S(
  P('M4 44h56','none',C.ti,3)+
  P('M10 44V26l10-8 10 8v18','none',C.az,2.6)+
  P('M10 26h20M14 44V30M26 44V30','none',C.az,2.2)+
  R(38,20,18,24,C.am,2)+W(42,25,4,5)+W(49,25,4,5)+W(42,34,4,5)+W(49,34,4,5)+
  L(4,52,60,52,2.5,C.cz)),

/* --- LES LOISIRS --- */
'le jardin': S(
  R(2,44,60,12,C.mr,0)+
  CI(16,28,8,C.vd)+R(14,35,4,10,C.mr)+
  P('M34 44V30','none',C.vd,2.6)+CI(34,26,5,C.rx)+
  P('M46 44V32','none',C.vd,2.6)+CI(46,28,5,C.am)+
  P('M6 50h50','none',C.vd,2)),

'le terrain de sport': S(
  R(6,12,52,40,C.vd,2)+
  L(32,12,32,52,2,C.br)+
  '<circle cx="32" cy="32" r="8" fill="none" stroke="'+C.br+'" stroke-width="2"/>'+
  R(6,22,8,20,C.vd,0)+R(50,22,8,20,C.vd,0)+
  P('M6 22h8v20H6M58 22h-8v20h8','none',C.br,2)),

'la piscine': S(
  R(6,22,52,30,C.azc,5)+
  P('M8 32c5-3 8-3 13 0s8 3 13 0 8-3 13 0 6 2 9 0M8 41c5-3 8-3 13 0s8 3 13 0 8-3 13 0 6 2 9 0','none',C.az,2.5)+
  P('M44 22V10h8','none',C.ti,2.5)+
  CI(20,14,4,C.am)),

'la salle de sport': S(
  R(4,26,8,12,C.az,2)+R(52,26,8,12,C.az,2)+
  R(12,21,9,22,C.ti,2.5)+R(43,21,9,22,C.ti,2.5)+
  R(21,29,22,6,C.cz,2)),

'le café': S(
  P('M12 24h34v16a11 11 0 0 1-11 11H23a11 11 0 0 1-11-11Z',C.br,C.ti,2)+
  P('M46 28h6a6 6 0 0 1 0 12h-6','none',C.ti,2)+
  P('M12 30h34v10a11 11 0 0 1-11 11H23a11 11 0 0 1-11-11Z',C.mr,C.mr,0)+
  P('M21 16c0-3 3-3 3-6M31 16c0-3 3-3 3-6','none',C.tis,2)+
  L(8,56,52,56,2.5)),

'le restaurant': S(
  P('M17 8v20a5 5 0 0 0 10 0V8M22 8v48','none',C.ti,2.5)+
  P('M17 8v13M22 8v13M27 8v13','none',C.ti,2)+
  P('M43 8c5 0 8 6 8 14s-3 8-5 8v26','none',C.ti,2.5)),

'le bar': S(
  P('M12 12h40L32 36Z',C.am,C.ti,2.4)+
  L(12,12,52,12,3)+
  L(32,36,32,52,3)+
  L(20,54,44,54,3.2)+
  CI(44,16,4,C.vd,1.8)+L(44,16,48,8,2)),

'la terrasse': S(
  P('M4 26h56L32 10Z',C.vm,C.ti,2)+
  L(32,26,32,44,2.6)+
  R(20,44,24,4,C.mr,1.5)+
  L(23,48,23,56,2.4)+L(41,48,41,56,2.4)+
  CI(12,40,4,C.am,1.6)+CI(52,40,4,C.am,1.6)+
  L(2,58,62,58,2.5,C.cz)),

'le centre culturel': S(
  R(6,22,52,32,C.br,3)+
  P('M4 22l6-10h44l6 10Z',C.lx,C.ti,2)+
  P('M20 30v16M20 30l10 4-10 4','none',C.ti,2.4)+
  CI(42,42,4,C.am,1.8)+P('M46 42V28l6-2v14','none',C.ti,2.2)+CI(52,40,4,C.am,1.8)+
  L(4,54,60,54,2.5)),

/* --- LES PROBLÈMES URBAINS --- */
'le bruit': S(
  P('M10 26h9l12-11v34l-12-11h-9Z',C.am,C.ti,2)+
  P('M38 22c4 5 4 15 0 20M45 16c7 8 7 24 0 32','none',C.vm,2.8)),

'la pollution sonore': S(
  P('M8 26h8l11-10v32l-11-10H8Z',C.am,C.ti,2)+
  P('M34 20c5 6 5 18 0 24M42 14c8 9 8 27 0 36','none',C.vm,2.8)+
  P('M50 30l10-10M50 30l10 10','none',C.vm,2.8)),

"la pollution de l'air": S(
  R(12,30,12,24,C.cz)+R(28,36,11,18,C.cz)+R(43,32,10,22,C.cz)+
  CI(18,20,7,C.tis,0)+CI(30,15,8,C.tis,0)+CI(42,20,6,C.tis,0)+
  R(15,38,5,5,C.am,0)+R(45,40,5,5,C.am,0)+
  P('M6 10c4-3 8-3 12 0M46 8c4-3 8-3 12 0','none',C.tis,2)),

'les déchets': S(
  P('M16 22h32l-3 32H19Z',C.vd,C.ti,2)+
  R(12,16,40,7,C.ti,2.5)+
  R(26,9,12,6,C.tis,2)+
  P('M26 30v16M32 30v16M38 30v16','none',C.br,2)),

'les ordures': S(
  P('M14 26h36l-4 28H18Z',C.cz,C.ti,2)+
  R(10,20,44,6,C.ti,2)+
  CI(24,36,4,C.vm,1.5)+CI(38,34,4,C.am,1.5)+CI(31,45,4,C.vd,1.5)+
  P('M20 12l6 8M44 12l-6 8','none',C.ti,2)+
  CI(32,10,3,C.am,1.5)),

'le manque de logements': S(
  R(10,28,20,26,C.br)+T(8,28,32,16,C.vm)+W(14,34,5,5)+D(21,42,6,12,C.mr)+
  R(36,28,20,26,C.cz,0)+
  P('M34 28 46 16l12 12','none',C.ti,2,'5 4')+
  P('M38 34h16M38 42h16','none',C.ti,1.6,'4 4')+
  P('M40 20l16 16M56 20L40 36','none',C.vm,3)),

'le coût de la vie': S(
  CI(32,32,20,C.am)+
  P('M32 18v28M26 24h9a5 5 0 0 1 0 10h-6a5 5 0 0 0 0 10h9','none',C.ti,3)+
  P('M50 14l8-8M58 6h-7M58 6v7','none',C.vm,3)),

"l'insécurité": S(
  P('M32 6l20 6v18c0 12-9 20-20 24-11-4-20-12-20-24V12Z',C.cz,C.ti,2)+
  P('M32 22v10M32 38v2','none',C.vm,4)+
  P('M44 44l10 10M54 44l-10 10','none',C.vm,3)),

'le vandalisme': S(
  R(6,14,52,34,C.cz,2)+
  P('M14 40c6-14 12-6 16-16s10 6 18-6','none',C.vm,4)+
  P('M18 24l8 8M28 22l6 6','none',C.az,3.4)+
  CI(48,42,5,C.am,1.8)+L(48,47,48,54,2.4)),

'la criminalité': S(
  P('M32 6l20 6v18c0 12-9 20-20 24-11-4-20-12-20-24V12Z',C.ti,C.ti,2)+
  P('M24 26v-4a8 8 0 0 1 16 0v4','none',C.am,3)+
  R(22,26,20,16,C.am,2)+
  CI(32,33,2.6,C.ti,0)+L(32,35,32,38,2.4))

};

/* junta os blocos de ícones e liga cada termo ao seu desenho */
var ICONES = {};
[ICONES_A, ICONES_B, ICONES_C, ICONES_D].forEach(function(o){
  for (var k in o) ICONES[k] = o[k];
});

/* ===== VOCABULÁRIO: 127 termos ===== */
var VOCAB = [
  {c:'lieux',f:'le centre-ville',p:'centro da cidade'},
  {c:'lieux',f:'la banlieue',p:'subúrbio'},
  {c:'lieux',f:'le quartier',p:'bairro'},
  {c:'lieux',f:'la place',p:'praça'},
  {c:'lieux',f:'la rue',p:'rua'},
  {c:'lieux',f:'l\'avenue',p:'avenida'},
  {c:'lieux',f:'le boulevard',p:'boulevard'},
  {c:'lieux',f:'le carrefour',p:'cruzamento'},
  {c:'lieux',f:'le rond-point',p:'rotatória'},
  {c:'lieux',f:'le trottoir',p:'calçada'},
  {c:'lieux',f:'le passage piéton',p:'faixa de pedestres'},
  {c:'lieux',f:'la piste cyclable',p:'ciclovia'},
  {c:'lieux',f:'le parc',p:'parque'},
  {c:'lieux',f:'le jardin public',p:'jardim público'},
  {c:'lieux',f:'le stade',p:'estádio'},
  {c:'lieux',f:'la gare',p:'estação de trem'},
  {c:'lieux',f:'la gare routière',p:'rodoviária'},
  {c:'lieux',f:'la station de métro',p:'estação de metrô'},
  {c:'lieux',f:'l\'aéroport',p:'aeroporto'},
  {c:'lieux',f:'le port',p:'porto'},
  {c:'commerces',f:'la boulangerie',p:'padaria'},
  {c:'commerces',f:'la pâtisserie',p:'confeitaria'},
  {c:'commerces',f:'la boucherie',p:'açougue'},
  {c:'commerces',f:'la poissonnerie',p:'peixaria'},
  {c:'commerces',f:'la charcuterie',p:'loja de embutidos'},
  {c:'commerces',f:'la pharmacie',p:'farmácia'},
  {c:'commerces',f:'la librairie',p:'livraria'},
  {c:'commerces',f:'la papeterie',p:'papelaria'},
  {c:'commerces',f:'le fleuriste',p:'florista'},
  {c:'commerces',f:'le supermarché',p:'supermercado'},
  {c:'commerces',f:'l\'hypermarché',p:'hipermercado'},
  {c:'commerces',f:'l\'épicerie',p:'mercadinho'},
  {c:'commerces',f:'le marché',p:'feira'},
  {c:'commerces',f:'le centre commercial',p:'shopping center'},
  {c:'commerces',f:'la boutique',p:'butique (loja pequena)'},
  {c:'commerces',f:'le magasin',p:'loja (geral)'},
  {c:'commerces',f:'la bijouterie',p:'joalheria'},
  {c:'commerces',f:'le magasin de vêtements',p:'loja de roupas'},
  {c:'commerces',f:'le magasin de chaussures',p:'loja de calçados'},
  {c:'commerces',f:'le salon de coiffure',p:'salão de beleza'},
  {c:'commerces',f:'le pressing',p:'lavanderia'},
  {c:'commerces',f:'la banque',p:'banco'},
  {c:'commerces',f:'la poste',p:'correios'},
  {c:'batiments',f:'la mairie',p:'prefeitura (cidade pequena)'},
  {c:'batiments',f:'l\'hôtel de ville',p:'prefeitura (cidade grande)'},
  {c:'batiments',f:'l\'école',p:'escola'},
  {c:'batiments',f:'le collège',p:'ensino fundamental II'},
  {c:'batiments',f:'le lycée',p:'ensino médio'},
  {c:'batiments',f:'l\'université',p:'universidade'},
  {c:'batiments',f:'l\'hôpital',p:'hospital'},
  {c:'batiments',f:'la clinique',p:'clínica'},
  {c:'batiments',f:'le commissariat',p:'delegacia'},
  {c:'batiments',f:'la caserne des pompiers',p:'quartel dos bombeiros'},
  {c:'batiments',f:'le tribunal',p:'tribunal'},
  {c:'batiments',f:'la bibliothèque',p:'biblioteca'},
  {c:'batiments',f:'le musée',p:'museu'},
  {c:'batiments',f:'le théâtre',p:'teatro'},
  {c:'batiments',f:'le cinéma',p:'cinema'},
  {c:'transports',f:'la voiture',p:'carro'},
  {c:'transports',f:'le bus',p:'ônibus'},
  {c:'transports',f:'le métro',p:'metrô'},
  {c:'transports',f:'le tramway',p:'bonde'},
  {c:'transports',f:'le train',p:'trem'},
  {c:'transports',f:'le taxi',p:'táxi'},
  {c:'transports',f:'le vélo',p:'bicicleta'},
  {c:'transports',f:'le vélo en libre-service',p:'bicicleta compartilhada'},
  {c:'transports',f:'la moto',p:'motocicleta'},
  {c:'transports',f:'le scooter',p:'scooter'},
  {c:'transports',f:'le covoiturage',p:'carona compartilhada'},
  {c:'transports',f:'l\'avion',p:'avião'},
  {c:'transports',f:'le bateau',p:'barco'},
  {c:'transports',f:'le ferry',p:'balsa'},
  {c:'circulation',f:'la circulation',p:'trânsito'},
  {c:'circulation',f:'les embouteillages',p:'congestionamentos'},
  {c:'circulation',f:'un bouchon',p:'engarrafamento'},
  {c:'circulation',f:'la pollution',p:'poluição'},
  {c:'circulation',f:'le feu rouge',p:'sinal vermelho'},
  {c:'circulation',f:'le feu vert',p:'sinal verde'},
  {c:'circulation',f:'le feu orange',p:'sinal amarelo'},
  {c:'circulation',f:'le panneau de signalisation',p:'placa de trânsito'},
  {c:'circulation',f:'la limitation de vitesse',p:'limite de velocidade'},
  {c:'circulation',f:'le stationnement',p:'estacionar (o ato)'},
  {c:'circulation',f:'le parking',p:'estacionamento (o local)'},
  {c:'circulation',f:'une place de parking',p:'vaga de estacionamento'},
  {c:'circulation',f:'les transports en commun',p:'transporte público'},
  {c:'circulation',f:'la mobilité urbaine',p:'mobilidade urbana'},
  {c:'deplacements',f:'marcher',p:'caminhar'},
  {c:'deplacements',f:'se promener',p:'passear'},
  {c:'deplacements',f:'prendre le métro',p:'pegar o metrô'},
  {c:'deplacements',f:'prendre le bus',p:'pegar o ônibus'},
  {c:'deplacements',f:'conduire',p:'dirigir'},
  {c:'deplacements',f:'faire du vélo',p:'andar de bicicleta'},
  {c:'deplacements',f:'traverser la rue',p:'atravessar a rua'},
  {c:'deplacements',f:'tourner à droite',p:'virar à direita'},
  {c:'deplacements',f:'tourner à gauche',p:'virar à esquerda'},
  {c:'deplacements',f:'aller tout droit',p:'seguir em frente'},
  {c:'deplacements',f:'prendre un taxi',p:'pegar um táxi'},
  {c:'deplacements',f:'monter dans le bus',p:'entrar no ônibus'},
  {c:'deplacements',f:'descendre du bus',p:'descer do ônibus'},
  {c:'infrastructures',f:'les immeubles',p:'prédios'},
  {c:'infrastructures',f:'les gratte-ciel',p:'arranha-céus'},
  {c:'infrastructures',f:'les logements',p:'moradias'},
  {c:'infrastructures',f:'les espaces verts',p:'áreas verdes'},
  {c:'infrastructures',f:'les espaces publics',p:'espaços públicos'},
  {c:'infrastructures',f:'l\'éclairage public',p:'iluminação pública'},
  {c:'infrastructures',f:'les transports publics',p:'transportes públicos'},
  {c:'infrastructures',f:'les réseaux routiers',p:'malha viária'},
  {c:'infrastructures',f:'les infrastructures',p:'infraestruturas'},
  {c:'loisirs',f:'le jardin',p:'jardim'},
  {c:'loisirs',f:'le terrain de sport',p:'quadra esportiva'},
  {c:'loisirs',f:'la piscine',p:'piscina'},
  {c:'loisirs',f:'la salle de sport',p:'academia'},
  {c:'loisirs',f:'le café',p:'café'},
  {c:'loisirs',f:'le restaurant',p:'restaurante'},
  {c:'loisirs',f:'le bar',p:'bar'},
  {c:'loisirs',f:'la terrasse',p:'varanda/terraço'},
  {c:'loisirs',f:'le centre culturel',p:'centro cultural'},
  {c:'problemes',f:'le bruit',p:'barulho'},
  {c:'problemes',f:'la pollution sonore',p:'poluição sonora'},
  {c:'problemes',f:'la pollution de l\'air',p:'poluição do ar'},
  {c:'problemes',f:'les déchets',p:'lixo'},
  {c:'problemes',f:'les ordures',p:'resíduos'},
  {c:'problemes',f:'le manque de logements',p:'falta de moradias'},
  {c:'problemes',f:'le coût de la vie',p:'custo de vida'},
  {c:'problemes',f:'l\'insécurité',p:'insegurança'},
  {c:'problemes',f:'le vandalisme',p:'vandalismo'},
  {c:'problemes',f:'la criminalité',p:'criminalidade'}
];

VOCAB.forEach(function(v, i){ v.id = 'v' + i; v.icone = ICONES[v.f]; v.n = 'A1'; });

window.QI_VOCAB = VOCAB;
window.QI_ICONES = ICONES;

// DSL de desenho exposta pra ser reaproveitada pelos arquivos de vocabulário dos
// outros níveis (js/questoesInterativasDadosA2.js, ...B1.js, ...B2.js, ...TCF.js,
// ...DELF.js) — cada um carregado depois deste, concatenando em window.QI_VOCAB e
// mesclando em window.QI_ICONES (ver final de cada um desses arquivos).
window.QI_DSL = { S:S, R:R, W:W, D:D, CI:CI, EL:EL, T:T, L:L, P:P, PES:PES };
})();
