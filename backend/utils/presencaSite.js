// Presença dos alunos no site inteiro (só a equipe vê): em que área estão — Plataforma de Questões,
// Ambiente de Produção, Aulas Especializadas, Dever de Casa… — e o que estão fazendo. Cada página
// manda um sinal a cada 30 s (public/js/presencaSite.js); o Ambiente de Produção também manda a tela
// do app. Fica em memória: um aluno é « online » até 90 s depois do último sinal, e a última
// atividade conhecida é guardada por 24 h para mostrar « visto por último ».
const User = require("../models/user");

const ONLINE_MS = 90 * 1000;
const GUARDAR_MS = 24 * 3600 * 1000;
const presenca = new Map();          // userId → { area, pagina, atividade, url, t, desde, oculta }
const ultimoGravado = new Map();     // userId → quando gravou ultimoAcessoEm (no máximo a cada 5 min)

const limpar = s => String(s || "").replace(/\s+/g, " ").trim();

function registrar(userId, dados) {
  const agora = Date.now();
  const id = String(userId);
  const ant = presenca.get(id);
  const continua = ant && agora - ant.t < ONLINE_MS;
  // O sinal da página lê o que está na tela e tem prioridade; o do app do Ambiente de Produção (que
  // é espaçado e pode estar atrasado) só vale se a página não mandou nada no último minuto e meio.
  if (dados.doApp && continua && ant.tPagina && agora - ant.tPagina < ONLINE_MS) { ant.t = agora; return; }
  const novo = {
    area: limpar(dados.area).slice(0, 60) || "Site",
    pagina: limpar(dados.pagina).slice(0, 120),
    atividade: limpar(dados.atividade).slice(0, 200),
    url: limpar(dados.url).slice(0, 200),
    oculta: !!dados.oculta,
    t: agora,
    desde: continua ? ant.desde : agora,
    // começo da atividade atual (para « há 12 min nesta atividade »)
    desdeAtividade: continua && ant.area === limpar(dados.area) && ant.atividade === limpar(dados.atividade) ? ant.desdeAtividade : agora
  };
  if (!dados.doApp) novo.tPagina = agora;
  presenca.set(id, novo);
  if (!ultimoGravado.get(id) || agora - ultimoGravado.get(id) > 5 * 60 * 1000) {
    ultimoGravado.set(id, agora);
    User.updateOne({ _id: id }, { $set: { ultimoAcessoEm: new Date() } }).catch(() => {});
  }
}

function obter(userId) {
  const p = presenca.get(String(userId));
  if (!p) return null;
  const agora = Date.now();
  if (agora - p.t > GUARDAR_MS) { presenca.delete(String(userId)); return null; }
  return {
    online: agora - p.t <= ONLINE_MS,
    area: p.area, pagina: p.pagina, atividade: p.atividade, url: p.url, oculta: p.oculta,
    ultimoSinal: new Date(p.t), onlineDesde: new Date(p.desde), atividadeDesde: new Date(p.desdeAtividade)
  };
}

module.exports = { registrar, obter, ONLINE_MS };
