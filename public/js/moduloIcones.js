// =====================================================================
// Conjunto FIXO de ícones que um módulo de Aulas Especializadas pode usar.
// Antes, `Modulo.icone` era um campo de texto livre onde o professor digitava
// qualquer emoji (admin-aulas.html tinha um <input placeholder="📘">) — virou
// um seletor com essas opções fixas pra ficar visualmente consistente com o
// resto do site (SVG em vez de emoji). O valor gravado no banco agora é a
// CHAVE (ex.: "grammar"), não mais o caractere emoji.
// Compartilhado entre admin-aulas.js (monta o seletor) e
// aulas-especializadas.js (renderiza o ícone escolhido pro aluno) — os dois
// precisam enxergar exatamente o mesmo conjunto, por isso este arquivo é
// carregado nas duas páginas em vez de duplicar o objeto.
// `book` é o padrão/fallback — usado tanto quando nenhum ícone foi escolhido
// quanto quando o valor salvo é de um formato antigo (emoji cru de antes
// desta mudança) que não bate com nenhuma chave conhecida.
const MODULO_ICONES = {
  book: 'img/icones/book.svg',
  video: 'img/icones/video.svg',
  grammar: 'img/icones/grammar.svg',
  conversation: 'img/icones/chat.svg',
  listening: 'img/icones/headphones.svg',
  writing: 'img/icones/writing-hand.svg',
  culture: 'img/icones/culture.svg',
  exam: 'img/icones/exercise-list.svg'
};
const MODULO_ICONES_NOMES = {
  book: 'Livro', video: 'Vídeo', grammar: 'Gramática', conversation: 'Conversação',
  listening: 'Compreensão oral', writing: 'Produção escrita', culture: 'Cultura', exam: 'Exercícios'
};
const MODULO_ICONE_PADRAO = 'book';
function caminhoIconeModulo(chave) {
  return MODULO_ICONES[chave] || MODULO_ICONES[MODULO_ICONE_PADRAO];
}
