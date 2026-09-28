// ===================== HtmlSeguro — proteção global contra XSS =====================
// O front monta muita interface concatenando dados da API em innerHTML (nome do
// aluno, textos de produção, mensagens...). Se um desses dados trouxer HTML
// malicioso (ex.: <img src=x onerror=...>), ele executaria no navegador de quem
// visualiza — inclusive professores/admins — e poderia roubar o token de sessão.
//
// Este script precisa ser o PRIMEIRO carregado em cada página. Ele intercepta
// innerHTML, outerHTML e insertAdjacentHTML e, antes de o navegador aplicar o
// HTML, remove tudo que executa código: <script>, atributos de evento (on*),
// URLs javascript:/vbscript:/data: (exceto imagens), <object>/<embed>/<base>,
// srcdoc etc. A marcação legítima (layout, classes, estilos, SVG) passa intacta.
// O parse acontece num <template>, que é inerte: nada executa durante a limpeza.
(function () {
  if (window.HtmlSeguro) return;

  const TAGS_PROIBIDAS = new Set([
    "SCRIPT", "OBJECT", "EMBED", "APPLET", "BASE", "META", "LINK", "FRAME", "FRAMESET", "NOSCRIPT", "PORTAL"
  ]);
  const ATRIBUTOS_URL = new Set(["href", "src", "action", "formaction", "xlink:href", "background", "poster", "data", "lowsrc", "ping", "cite"]);
  const PROTOCOLOS_PERMITIDOS = new Set(["http", "https", "mailto", "tel", "blob"]);
  const DATA_IMAGEM = /^data:image\/(?:png|jpe?g|gif|webp);base64,/i;
  const EXECUTAVEL = /(?:java|vb)script:/i;

  // Remove espaços/controles que navegadores ignoram dentro de URLs ("java\tscript:").
  const semControles = v => String(v).replace(/[\u0000- \u007f-\u009f]/g, "");

  function urlSegura(valor, nomeAttr, tag) {
    const limpo = semControles(valor);
    if (DATA_IMAGEM.test(limpo)) return tag === "IMG" || tag === "image" || nomeAttr === "poster";
    const esquema = /^([a-z][a-z0-9+.-]*):/i.exec(limpo);
    return !esquema || PROTOCOLOS_PERMITIDOS.has(esquema[1].toLowerCase()); // sem esquema = URL relativa
  }

  // Quando algo malicioso é removido, avisa o servidor (monitor de segurança): isso
  // significa que há conteúdo de ataque salvo em algum lugar do banco. No máximo 3
  // relatos por página, sem repetir o mesmo motivo.
  const relatados = new Set();
  function relatar(motivo, amostra) {
    if (relatados.has(motivo) || relatados.size >= 3) return;
    relatados.add(motivo);
    try {
      const corpo = JSON.stringify({ pagina: location.pathname, motivo, amostra: String(amostra).slice(0, 300) });
      const blob = new Blob([corpo], { type: "application/json" });
      if (!(navigator.sendBeacon && navigator.sendBeacon("/api/seguranca/relato-navegador", blob))) {
        fetch("/api/seguranca/relato-navegador", { method: "POST", headers: { "Content-Type": "application/json" }, body: corpo, keepalive: true }).catch(() => {});
      }
    } catch (e) { /* relato é best-effort */ }
  }
  const descOuterParaAmostra = Object.getOwnPropertyDescriptor(Element.prototype, "outerHTML");
  const amostraDe = el => { try { return descOuterParaAmostra.get.call(el); } catch (e) { return el.tagName; } };

  function limparNo(raiz) {
    const walker = document.createTreeWalker(raiz, NodeFilter.SHOW_ELEMENT);
    const remover = [];
    let el = walker.nextNode();
    while (el) {
      const tag = el.tagName.toUpperCase();
      if (TAGS_PROIBIDAS.has(tag)) {
        relatar("tag <" + tag.toLowerCase() + ">", amostraDe(el));
        remover.push(el);
      } else {
        for (const attr of Array.from(el.attributes)) {
          const nome = attr.name.toLowerCase();
          if (nome.startsWith("on") || nome === "srcdoc") {
            relatar("atributo " + nome, amostraDe(el));
            el.removeAttribute(attr.name);
          } else if (ATRIBUTOS_URL.has(nome) && !urlSegura(attr.value, nome, el.tagName)) {
            if (EXECUTAVEL.test(semControles(attr.value))) relatar("url javascript:", amostraDe(el));
            el.removeAttribute(attr.name);
          } else if (EXECUTAVEL.test(semControles(attr.value)) || (nome === "style" && /expression\s*\(|behavior\s*:/i.test(attr.value))) {
            // Cobre também <animate values="javascript:..."> e afins em SVG.
            relatar("valor executável em " + nome, amostraDe(el));
            el.removeAttribute(attr.name);
          }
        }
        // <iframe> só com src http(s) (vídeos do YouTube/Vimeo cadastrados pela equipe).
        if (tag === "IFRAME" && !/^https:\/\//i.test(el.getAttribute("src") || "")) remover.push(el);
      }
      el = walker.nextNode();
    }
    remover.forEach(n => n.remove());
    // Conteúdo de <template> aninhado não é percorrido pelo walker — limpa também.
    raiz.querySelectorAll && raiz.querySelectorAll("template").forEach(t => limparNo(t.content));
  }

  const descInner = Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML")
    || Object.getOwnPropertyDescriptor(HTMLElement.prototype, "innerHTML");
  const descOuter = Object.getOwnPropertyDescriptor(Element.prototype, "outerHTML")
    || Object.getOwnPropertyDescriptor(HTMLElement.prototype, "outerHTML");
  const insertAdjacentOriginal = Element.prototype.insertAdjacentHTML;
  if (!descInner || !descInner.set) return;

  const SVG_NS = "http://www.w3.org/2000/svg";

  // Faz o parse num <template> (inerte), limpa a árvore e devolve os PRÓPRIOS nós
  // limpos. Inserir esses nós direto — em vez de serializar e deixar o navegador
  // re-parsear a string — é o que impede "mutation XSS" (marcação que muda de
  // significado ao ser parseada duas vezes, ex.: <math><mtext><table><mglyph><style>).
  function fragmentoSeguro(html, contexto) {
    const tpl = document.createElement("template");
    const emSvg = contexto && contexto.namespaceURI === SVG_NS && contexto.localName !== "foreignObject";
    descInner.set.call(tpl, emSvg ? "<svg>" + html + "</svg>" : html);
    limparNo(tpl.content);
    if (!emSvg) return tpl.content;
    const frag = document.createDocumentFragment();
    const raizSvg = tpl.content.firstElementChild;
    while (raizSvg && raizSvg.firstChild) frag.appendChild(raizSvg.firstChild);
    return frag;
  }

  const ehTextoPuro = v => String(v ?? "").indexOf("<") === -1;

  // Versão em string (para quem precisa do HTML limpo como texto). Para inserir no
  // DOM, basta usar innerHTML normalmente: o setter abaixo já usa os nós limpos.
  function sanitizar(html) {
    if (html === null || html === undefined) return "";
    if (ehTextoPuro(html)) return String(html);
    const div = document.createElement("div");
    div.appendChild(fragmentoSeguro(String(html), null));
    return descInner.get.call(div);
  }

  // Escape para quem quiser montar HTML com dados de forma explícita.
  function escapar(valor) {
    return String(valor ?? "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  const alvoInner = Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML") ? Element.prototype : HTMLElement.prototype;
  Object.defineProperty(alvoInner, "innerHTML", {
    configurable: true,
    enumerable: descInner.enumerable,
    get: descInner.get,
    set(valor) {
      // <style>/<script>/<textarea> interpretam o conteúdo como texto, não como marcação;
      // e string sem "<" não tem como conter tag — ambos seguem pelo caminho nativo.
      if (this instanceof HTMLStyleElement || this instanceof HTMLScriptElement ||
          this instanceof HTMLTextAreaElement || ehTextoPuro(valor)) {
        return descInner.set.call(this, valor);
      }
      const frag = fragmentoSeguro(String(valor), this);
      descInner.set.call(this, "");
      (this instanceof HTMLTemplateElement ? this.content : this).appendChild(frag);
    }
  });

  if (descOuter && descOuter.set) {
    const alvoOuter = Object.getOwnPropertyDescriptor(Element.prototype, "outerHTML") ? Element.prototype : HTMLElement.prototype;
    Object.defineProperty(alvoOuter, "outerHTML", {
      configurable: true,
      enumerable: descOuter.enumerable,
      get: descOuter.get,
      set(valor) {
        if (!this.parentNode || ehTextoPuro(valor)) return descOuter.set.call(this, valor);
        this.replaceWith(fragmentoSeguro(String(valor), this.parentNode));
      }
    });
  }

  if (insertAdjacentOriginal) {
    Element.prototype.insertAdjacentHTML = function (posicao, html) {
      const pos = String(posicao).toLowerCase();
      if (ehTextoPuro(html) || !["beforebegin", "afterbegin", "beforeend", "afterend"].includes(pos)) {
        return insertAdjacentOriginal.call(this, posicao, ehTextoPuro(html) ? html : sanitizar(html));
      }
      const fora = pos === "beforebegin" || pos === "afterend";
      const frag = fragmentoSeguro(String(html), fora ? this.parentNode : this);
      if (pos === "beforebegin") this.before(frag);
      else if (pos === "afterbegin") this.prepend(frag);
      else if (pos === "beforeend") this.append(frag);
      else this.after(frag);
    };
  }

  // Range.createContextualFragment também transforma string em DOM executável.
  if (Range.prototype.createContextualFragment) {
    Range.prototype.createContextualFragment = function (html) {
      const no = this.startContainer;
      return fragmentoSeguro(String(html ?? ""), no && no.nodeType === 1 ? no : no && no.parentNode);
    };
  }

  window.HtmlSeguro = { sanitizar, escapar };
})();
