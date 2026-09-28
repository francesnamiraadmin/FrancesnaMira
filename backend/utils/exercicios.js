// =====================================================================
// EXERCÍCIOS INTERATIVOS — registro, versão pública (sem gabarito) e correção.
// Cada exercício é um arquivo em backend/data/exercicios/<slug>.js que exporta
// { slug, titulo, nivel, descricao, modo, secoes: [...] }. O gabarito
// (resposta/respostas/explicacao) nunca sai do servidor: o navegador recebe a
// versão pública e manda as respostas para POST /api/exercicios/:slug/corrigir.
//
// Seções: "video" (youtube), "aula" (html), "leitura" (parágrafos + glossário,
// com áudio), "regulamento" (regras para confirmar), "exercicio" (itens).
// Itens de exercício:
//   escolha  → opcoes[], resposta (texto da opção certa)
//   multipla → opcoes[], respostas (textos certos; tudo ou nada)
//   lacuna   → antes/depois, respostas[] aceitas (digitado)
//   escrita  → enunciado, respostas[] aceitas (frase digitada)
//   ditado   → audio (texto falado), respostas[] aceitas
//   associar → pares [{ a, b }] (cada par vale 1 ponto)
//   livre    → produção aberta, lida pelo professor (não entra na nota)
// Todo item pode ter: enunciado, audio (texto a ser lido com Coqui),
// imagem, dica, explicacao, pontos.
// =====================================================================
const fs = require("fs");
const path = require("path");

const PASTA = path.join(__dirname, "../data/exercicios");
let cache = null;

function carregar() {
  if (cache) return cache;
  cache = new Map();
  fs.readdirSync(PASTA).filter(f => f.endsWith(".js") || f.endsWith(".json")).forEach(f => {
    const def = require(path.join(PASTA, f));
    // id estável por item: <secao>-<n>
    def.secoes.forEach(sec => (sec.itens || []).forEach((item, i) => { item.id = item.id || `${sec.id}-${i + 1}`; }));
    cache.set(def.slug, def);
  });
  return cache;
}

function listar() {
  return [...carregar().values()]
    .sort((a, b) => (a.ordem || 99) - (b.ordem || 99))
    .map(d => ({
      slug: d.slug, titulo: d.titulo, nivel: d.nivel, descricao: d.descricao, modo: d.modo || "treino",
      origem: d.origem || null,
      partes: d.secoes.map(s => s.titulo),
      questoes: d.secoes.reduce((n, s) => n + (s.itens ? s.itens.length : 0), 0)
    }));
}

function obter(slug) { return carregar().get(slug) || null; }

// Embaralha de forma determinística (mesma ordem para o mesmo item), para a
// coluna "b" de associar não entregar a resposta pela posição.
function embaralhar(lista, semente) {
  let h = 0; for (const c of String(semente)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const arr = lista.slice();
  for (let i = arr.length - 1; i > 0; i--) { h = (h * 1103515245 + 12345) >>> 0; const j = h % (i + 1); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}

// audioCorrecao: frase completa (com a resposta), liberada só depois da correção.
const CAMPOS_SECRETOS = ["resposta", "respostas", "explicacao", "mostrar", "audioCorrecao"];
function versaoPublica(def) {
  return {
    slug: def.slug, titulo: def.titulo, nivel: def.nivel, descricao: def.descricao, modo: def.modo || "treino",
    secoes: def.secoes.map(sec => {
      const s = { ...sec };
      if (sec.itens) {
        s.itens = sec.itens.map(item => {
          const pub = {};
          for (const [k, v] of Object.entries(item)) if (!CAMPOS_SECRETOS.includes(k)) pub[k] = v;
          if (item.tipo === "associar") {
            pub.pares = undefined;
            pub.esquerda = item.pares.map(p => p.a);
            pub.direita = embaralhar(item.pares.map(p => p.b), item.id);
          }
          return pub;
        });
      }
      return s;
    })
  };
}

// Compara textos ignorando maiúsculas, espaços extras, tipo de apóstrofo e
// pontuação final. Acentos: a resposta sem acento é aceita, mas marcada para
// o aluno revisar (em francês o acento faz parte da grafia).
function normalizar(t) {
  return String(t ?? "").toLowerCase().replace(/[’`´]/g, "'").replace(/\s+/g, " ")
    .replace(/\s*([',-])\s*/g, "$1").trim().replace(/[.!?;:…]+$/g, "").trim();
}
const semAcento = t => t.normalize("NFD").replace(/[̀-ͯ]/g, "");

function conferirTexto(aceitas, dada) {
  aceitas = [].concat(aceitas).map(String);
  const n = normalizar(dada);
  if (!n) return { certo: false };
  if (aceitas.some(a => normalizar(a) === n)) return { certo: true };
  if (aceitas.some(a => semAcento(normalizar(a)) === semAcento(n))) return { certo: true, avisoAcento: true };
  return { certo: false };
}

function corrigirItem(item, dada) {
  const pontos = item.pontos || 1;
  switch (item.tipo) {
    case "escolha": {
      const certo = dada != null && String(dada) === String(item.resposta);
      return { certo, pontos: certo ? pontos : 0, total: pontos, correta: item.resposta };
    }
    case "multipla": {
      const marcadas = Array.isArray(dada) ? dada.map(String).sort() : [];
      const certas = item.respostas.map(String).sort();
      const certo = marcadas.length === certas.length && marcadas.every((m, i) => m === certas[i]);
      return { certo, pontos: certo ? pontos : 0, total: pontos, correta: item.respostas.join(" · ") };
    }
    case "lacuna": case "escrita": case "ditado": {
      const r = conferirTexto(item.respostas, dada);
      return { ...r, pontos: r.certo ? pontos : 0, total: pontos, correta: item.mostrar || [].concat(item.respostas)[0] };
    }
    case "associar": {
      const dadas = dada && typeof dada === "object" ? dada : {};
      const porPar = item.pares.map((p, i) => String(dadas[i] ?? "") === p.b);
      const acertos = porPar.filter(Boolean).length;
      return { certo: acertos === item.pares.length, porPar, pontos: acertos, total: item.pares.length, correta: item.pares.map(p => `${p.a} → ${p.b}`).join(" · ") };
    }
    case "livre":
      return { livre: true, pontos: 0, total: 0, texto: String(dada ?? "").slice(0, 8000) };
    default:
      return { certo: false, pontos: 0, total: 0 };
  }
}

// respostas: { itemId: valor }. secaoId (opcional) limita a correção a uma
// seção — usado no botão "Corrigir" de cada aba no modo treino.
function corrigir(def, respostas, secaoId) {
  const itens = {}, porSecao = {};
  let pontos = 0, total = 0;
  const livres = [];
  def.secoes.forEach(sec => {
    if (!sec.itens || (secaoId && sec.id !== secaoId)) return;
    const acc = porSecao[sec.id] = { titulo: sec.titulo, pontos: 0, total: 0 };
    sec.itens.forEach(item => {
      const r = corrigirItem(item, respostas?.[item.id]);
      r.explicacao = item.explicacao || null;
      r.audio = item.audioCorrecao || null;
      itens[item.id] = r;
      acc.pontos += r.pontos; acc.total += r.total;
      pontos += r.pontos; total += r.total;
      if (r.livre) livres.push({ secao: sec.titulo, enunciado: item.enunciado || "", texto: r.texto });
    });
  });
  return { pontos, total, percentual: total ? Math.round((pontos / total) * 100) : null, porSecao, itens, livres };
}

// Texto guardado na entrega do dever (é o que o professor lê).
function resumoEntrega(def, resultado, extra) {
  const linhas = [`Exercício: ${def.titulo}`];
  if (resultado.total) linhas.push(`Nota automática: ${resultado.pontos}/${resultado.total} (${resultado.percentual}%)`);
  Object.values(resultado.porSecao).filter(s => s.total).forEach(s => linhas.push(`• ${s.titulo}: ${s.pontos}/${s.total}`));
  if (extra) linhas.push(extra);
  resultado.livres.filter(l => l.texto.trim()).forEach(l => linhas.push(`\n— ${l.secao}${l.enunciado ? ` (${l.enunciado.replace(/<[^>]+>/g, "").slice(0, 120)})` : ""}:\n${l.texto.trim()}`));
  return linhas.join("\n");
}

module.exports = { listar, obter, versaoPublica, corrigir, resumoEntrega, normalizar };
