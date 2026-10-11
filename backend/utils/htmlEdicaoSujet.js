// Limpeza do HTML que um administrador edita na página do tema (Ambiente de Produção).
// O conteúdo é mostrado aos alunos, então só passam as tags e atributos que o próprio app
// gera nesses blocos: nada de script, eventos (on*), iframes ou links javascript:.
const sanitizeHtml = require("sanitize-html");

const VALOR_CSS = [/^[#a-z0-9(),.\s%-]+$/i];
const OPCOES = {
  allowedTags: [
    "div", "p", "span", "b", "strong", "i", "em", "u", "s", "small", "mark", "ins", "del", "sub", "sup", "br", "hr",
    "h1", "h2", "h3", "h4", "h5", "ul", "ol", "li", "a", "article", "section", "aside", "header", "blockquote",
    "details", "summary", "button", "label", "table", "thead", "tbody", "tr", "th", "td",
    "svg", "path", "circle", "rect", "g", "line", "polyline", "polygon"
  ],
  allowedAttributes: {
    "*": ["class", "id", "title", "lang", "role", "hidden", "style", "aria-*", "data-*"],
    a: ["href", "target", "rel"],
    button: ["type"],
    td: ["colspan", "rowspan"], th: ["colspan", "rowspan"],
    svg: ["viewbox", "viewBox", "width", "height", "fill", "stroke", "xmlns"],
    path: ["d", "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin"],
    circle: ["cx", "cy", "r", "fill", "stroke", "stroke-width"],
    rect: ["x", "y", "width", "height", "rx", "fill", "stroke"],
    line: ["x1", "y1", "x2", "y2", "stroke", "stroke-width"],
    polyline: ["points", "fill", "stroke"], polygon: ["points", "fill", "stroke"], g: ["fill", "stroke"]
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowedStyles: {
    "*": {
      "--cor": VALOR_CSS, "--fundo": VALOR_CSS, "--c": VALOR_CSS,
      margin: VALOR_CSS, "margin-top": VALOR_CSS, "margin-bottom": VALOR_CSS,
      "justify-content": VALOR_CSS, "align-items": VALOR_CSS, "text-align": VALOR_CSS, width: VALOR_CSS
    }
  },
  transformTags: { a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noopener" }) },
  parser: { lowerCaseAttributeNames: false }
};

const limparHtmlEdicao = html => sanitizeHtml(String(html || ""), OPCOES);

module.exports = { limparHtmlEdicao };
