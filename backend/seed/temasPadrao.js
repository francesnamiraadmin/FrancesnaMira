// Gera backend/data/modeles/temas-padrao.json: os 20 temas liberados por padrão a cada aluno no
// Ambiente de Produção, por perfil (TCF e cada nível do DELF), até o administrador escolher outros
// no Sistema de Correção.
// Critério: os 20 temas são divididos entre as tarefas do perfil; em cada tarefa entram primeiro os
// que mais caem na prova (frequência, recência, eixo prioritário) e os eixos se revezam, para o aluno
// treinar todos os grandes eixos do exame.
// Uso: node backend/seed/temasPadrao.js
const fs = require("fs");
const path = require("path");
const M = require("../utils/modelesTCF");

const TOTAL = 20;

function escolher(P) {
  const ts = P.TACHES;
  // cotas: 20 divididos pelas tarefas (as de produção mais longa recebem o resto)
  const base = Math.floor(TOTAL / ts.length), resto = TOTAL - base * ts.length;
  const prioridade = ["T3", "ET3", "T2", "ET2", "T1", "ET1"];
  const extra = ts.slice().sort((a, b) => prioridade.indexOf(a) - prioridade.indexOf(b)).slice(0, resto);
  const out = [];
  for (const t of ts) {
    const cota = base + (extra.includes(t) ? 1 : 0);
    const pool = P.modelosManuais(t).concat(P.sujetsDaTache(t))
      .filter((s, i, l) => l.findIndex(x => x.id === s.id) === i)
      .map(s => ({ s, w: M.pesoTema(t, s, {}) }))
      .sort((a, b) => b.w - a.w || String(a.s.id).localeCompare(String(b.s.id)));
    // revezamento de eixos: o melhor de cada eixo primeiro, depois o segundo melhor…
    const porEixo = {};
    for (const x of pool) (porEixo[x.s.e] = porEixo[x.s.e] || []).push(x);
    const eixos = Object.keys(porEixo).sort((a, b) => porEixo[b][0].w - porEixo[a][0].w);
    const escolhidos = [];
    for (let rodada = 0; escolhidos.length < cota && rodada < 50; rodada++) {
      for (const e of eixos) {
        if (escolhidos.length >= cota) break;
        if (porEixo[e][rodada]) escolhidos.push(porEixo[e][rodada].s);
      }
    }
    escolhidos.forEach(s => out.push({ tache: t, id: s.id, e: s.e, t: String(s.titre || s.t || "").slice(0, 120) }));
  }
  return out;
}

const resultado = {};
for (const id of Object.keys(M.PERFIS)) resultado[id] = escolher(M.PERFIS[id]);
const destino = path.join(__dirname, "..", "data", "modeles", "temas-padrao.json");
fs.writeFileSync(destino, JSON.stringify(resultado, null, 1));
for (const [k, l] of Object.entries(resultado)) {
  const cont = {};
  l.forEach(x => { cont[x.tache] = (cont[x.tache] || 0) + 1; });
  console.log(k.padEnd(8), l.length, "temas ·", Object.entries(cont).map(([t, n]) => t + ":" + n).join(" "), "·", new Set(l.map(x => x.e)).size, "eixos");
}
