// =====================================================================
// Troca as janelas do navegador (alert/confirm/prompt) pelas do site (public/js/dialogos.js):
//   confirm(x) → (await Dialogo.confirmar(x))   prompt(x, y) → (await Dialogo.pedir(x, y))
//   alert(x)   → (await Dialogo.aviso(x))        (espera o OK, como o alert fazia)
// e marca como `async` a função que contém a chamada. Lê o código pela árvore sintática (acorn),
// então strings e comentários com « confirm( » não são tocados.
// Avisa o que precisa de revisão: funções que agora são async mas devolvem um valor (quem chama
// pode estar usando o retorno) e chamadas fora de função / em getters (não dá para usar await).
//
// Uso:  node backend/seed/dialogosSite.js public/js/arquivo.js public/pagina.html …
// Também usado no fim de backend/seed/portarAppModeles.js (o app do Ambiente de Produção).
// =====================================================================
const fs = require("fs");
const acorn = require("acorn");
const walk = require("acorn-walk");

const NOVO = { alert: "Dialogo.aviso", confirm: "Dialogo.confirmar", prompt: "Dialogo.pedir" };
const FUNCOES = new Set(["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"]);

function analisar(codigo) {
  const op = { ecmaVersion: "latest", allowReturnOutsideFunction: true, allowHashBang: true, allowAwaitOutsideFunction: true, locations: true };
  try { return acorn.parse(codigo, { ...op, sourceType: "script" }); } catch (e) { return acorn.parse(codigo, { ...op, sourceType: "module" }); }
}

function nomeDaFuncao(fn, pai) {
  if (fn.id) return fn.id.name;
  if (pai && pai.type === "VariableDeclarator" && pai.id.type === "Identifier") return pai.id.name;
  if (pai && (pai.type === "Property" || pai.type === "MethodDefinition") && pai.key) return pai.key.name || pai.key.value;
  if (pai && pai.type === "AssignmentExpression") return codigoDe(pai.left);
  return "(anônima)";
}
let fonteAtual = "";
const codigoDe = n => fonteAtual.slice(n.start, n.end);

function devolveValor(fn) {
  if (fn.type === "ArrowFunctionExpression" && fn.expression) return true;
  let achou = false;
  walk.recursive(fn.body, null, {
    Function() { /* não desce em funções internas */ },
    ReturnStatement(n) { if (n.argument) achou = true; }
  });
  return achou;
}

function transformar(codigo) {
  fonteAtual = codigo;
  // um script que define a própria função confirm/alert/prompt fica de fora
  if (/\bfunction\s+(confirm|alert|prompt)\s*\(|\b(var|let|const)\s+(confirm|alert|prompt)\b/.test(codigo)) return { codigo, n: 0, revisar: ["define confirm/alert/prompt próprio: não convertido"] };
  const ast = analisar(codigo);
  const edicoes = [], asyncFeitas = new Set(), revisar = [];
  let n = 0;
  walk.ancestor(ast, {
    CallExpression(no, _st, ancestrais) {
      const c = no.callee;
      let nome = null;
      if (c.type === "Identifier" && NOVO[c.name]) nome = c.name;
      else if (c.type === "MemberExpression" && !c.computed && c.object.type === "Identifier" && c.object.name === "window" && NOVO[c.property.name]) nome = c.property.name;
      if (!nome) return;
      const pilha = ancestrais.slice(0, -1);
      let i = pilha.length - 1;
      while (i >= 0 && !FUNCOES.has(pilha[i].type)) i--;
      const fn = i >= 0 ? pilha[i] : null, pai = i > 0 ? pilha[i - 1] : null;
      const linha = no.loc.start.line;
      if (!fn) {
        if (nome === "alert") { edicoes.push([c.start, c.end, NOVO.alert]); n++; }
        else revisar.push(`linha ${linha}: ${nome}() fora de função — não convertido`);
        return;
      }
      if (pai && (pai.kind === "get" || pai.kind === "set" || pai.kind === "constructor")) { revisar.push(`linha ${linha}: ${nome}() em get/set/constructor — não convertido`); return; }
      edicoes.push([no.start, no.start, "(await "], [c.start, c.end, NOVO[nome]], [no.end, no.end, ")"]);
      n++;
      if (!fn.async && !asyncFeitas.has(fn)) {
        asyncFeitas.add(fn);
        const metodo = pai && pai.value === fn && (pai.type === "MethodDefinition" || (pai.type === "Property" && (pai.method || pai.kind !== "init")));
        const pos = metodo ? pai.key.start - (pai.computed ? 1 : 0) : fn.start;
        edicoes.push([pos, pos, "async "]);
        if (devolveValor(fn)) revisar.push(`linha ${fn.loc.start.line}: ${nomeDaFuncao(fn, pai)} virou async e devolve valor — conferir quem usa o retorno`);
      }
    }
  });
  edicoes.sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  let out = codigo;
  for (const [ini, fim, txt] of edicoes) out = out.slice(0, ini) + txt + out.slice(fim);
  return { codigo: out, n, revisar };
}

// HTML: converte os <script> sem src
function transformarHtml(html) {
  let n = 0; const revisar = [];
  const out = html.replace(/(<script(?![^>]*\bsrc=)[^>]*>)([\s\S]*?)(<\/script>)/gi, (m, a, corpo, f) => {
    if (!/\b(alert|confirm|prompt)\s*\(/.test(corpo)) return m;
    const r = transformar(corpo); n += r.n; revisar.push(...r.revisar);
    return a + r.codigo + f;
  });
  return { codigo: out, n, revisar };
}

module.exports = { transformar, transformarHtml };

if (require.main === module) {
  const arquivos = process.argv.slice(2);
  let total = 0;
  for (const arq of arquivos) {
    const original = fs.readFileSync(arq, "utf8");
    const crlf = original.includes("\r\n");
    const fonte = crlf ? original.replace(/\r\n/g, "\n") : original;
    let r;
    try { r = arq.endsWith(".html") ? transformarHtml(fonte) : transformar(fonte); }
    catch (e) { console.log(`✗ ${arq}: não deu para ler (${e.message})`); continue; }
    if (r.n) fs.writeFileSync(arq, crlf ? r.codigo.replace(/\n/g, "\r\n") : r.codigo);
    total += r.n;
    console.log(`${r.n ? "✓" : "·"} ${arq}: ${r.n} janela(s) convertida(s)`);
    r.revisar.forEach(x => console.log("    revisar " + x));
  }
  console.log(`total: ${total}`);
}
