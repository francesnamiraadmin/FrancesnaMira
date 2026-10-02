// Regras da correção anotada: categorias (configuráveis), permissões, validação das anotações,
// estado da correção e histórico de versões. Usado por routes/correcaoAnotada.js e routes/producoes.js.
const { ConfigCorrecao, HistoricoCorrecao, AnotacaoCorrecao } = require("../models/correcaoAnotada");

// ---------------- categorias ----------------
// Cada cor tem um significado pedagógico; a equipe (admin) pode renomear, recolorir,
// desativar ou criar categorias. As anotações guardam uma cópia do nome e da cor.
const CATEGORIAS_PADRAO = [
  { id: "gramatica", nome: "Erro gramatical", cor: "#dc2626", descricao: "Conjugação, concordância, preposição, estrutura da frase.", modalidades: ["textual", "oral"] },
  { id: "atencao", nome: "Atenção", cor: "#d97706", descricao: "Algo a rever: uso inadequado, ambiguidade, registro.", modalidades: ["textual", "oral"] },
  { id: "sugestao", nome: "Sugestão de melhoria", cor: "#2563eb", descricao: "Está correto, mas pode ficar mais rico ou mais natural.", modalidades: ["textual", "oral"] },
  { id: "positivo", nome: "Ponto positivo", cor: "#16a34a", descricao: "Uso muito bom: vale repetir.", modalidades: ["textual", "oral"] },
  { id: "vocabulario", nome: "Vocabulário / expressão", cor: "#7c3aed", descricao: "Palavra imprecisa, falso cognato, expressão idiomática.", modalidades: ["textual", "oral"] },
  { id: "ortografia", nome: "Ortografia e acentos", cor: "#db2777", descricao: "Grafia, acentos, pontuação.", modalidades: ["textual"] },
  { id: "coerencia", nome: "Coerência e organização", cor: "#0d9488", descricao: "Plano, conectores, progressão das ideias.", modalidades: ["textual", "oral"] },
  { id: "pronuncia", nome: "Pronúncia", cor: "#0891b2", descricao: "Sons, ligações (liaisons), entonação.", modalidades: ["oral"] },
  { id: "fluencia", nome: "Fluência", cor: "#64748b", descricao: "Hesitações, ritmo, autocorreções.", modalidades: ["oral"] }
].map((c, i) => ({ ...c, ativa: true, ordem: i }));

const COR_VALIDA = /^#[0-9a-f]{6}$/i;
const ID_VALIDO = /^[a-z0-9_-]{2,40}$/;
let cacheCategorias = null, cacheEm = 0;

async function categorias() {
  if (cacheCategorias && Date.now() - cacheEm < 30000) return cacheCategorias;
  const doc = await ConfigCorrecao.findById("categorias").lean();
  cacheCategorias = doc && doc.categorias && doc.categorias.length ? doc.categorias : CATEGORIAS_PADRAO;
  cacheEm = Date.now();
  return cacheCategorias;
}

function validarCategorias(lista) {
  if (!Array.isArray(lista) || !lista.length || lista.length > 20) throw { status: 400, msg: "Envie de 1 a 20 categorias." };
  const ids = new Set();
  const limpas = lista.map((c, i) => {
    const id = String(c?.id || "").trim().toLowerCase();
    const nome = String(c?.nome || "").trim().slice(0, 60);
    const cor = String(c?.cor || "").trim();
    if (!ID_VALIDO.test(id)) throw { status: 400, msg: `Identificador inválido na categoria ${i + 1}.` };
    if (ids.has(id)) throw { status: 400, msg: `Categoria repetida: ${id}.` };
    if (!nome) throw { status: 400, msg: `Dê um nome à categoria ${i + 1}.` };
    if (!COR_VALIDA.test(cor)) throw { status: 400, msg: `Cor inválida na categoria « ${nome} » (use #RRGGBB).` };
    ids.add(id);
    const mods = (Array.isArray(c.modalidades) ? c.modalidades : ["textual", "oral"]).filter(m => m === "textual" || m === "oral");
    return { id, nome, cor: cor.toLowerCase(), descricao: String(c.descricao || "").slice(0, 200), modalidades: mods.length ? mods : ["textual", "oral"], ativa: c.ativa !== false, ordem: i };
  });
  if (!limpas.some(c => c.ativa)) throw { status: 400, msg: "Deixe pelo menos uma categoria ativa." };
  return limpas;
}

async function salvarCategorias(lista, userId) {
  const limpas = validarCategorias(lista);
  await ConfigCorrecao.findByIdAndUpdate("categorias", { categorias: limpas, atualizadoEm: new Date(), atualizadoPor: userId }, { upsert: true });
  cacheCategorias = null;
  return limpas;
}

// ---------------- permissões ----------------
const ehStaff = req => req.userRole === "professor" || req.userRole === "admin";
const idDe = v => String((v && v._id) || v || "");
const STATUS_DEVOLVIDA = ["corrigido", "devolvido"];
const STATUS_EDITAVEL = ["em_correcao", "aguardando_revisao"];

// Professor vê: a fila (para escolher), as produções dele e as corrigidas pela IA (sem professor).
// Admin vê tudo. Aluno vê só as próprias.
function podeVer(producao, req) {
  if (!producao) return false;
  if (req.userRole === "admin") return true;
  if (req.userRole === "professor") {
    if (producao.status === "em_fila") return true;
    const prof = idDe(producao.professorId);
    return !prof || prof === String(req.userId);
  }
  return idDe(producao.alunoId) === String(req.userId);
}
// Só quem assumiu a correção (ou admin) edita, e só enquanto ela está aberta.
function podeEditar(producao, req) {
  if (!producao || !STATUS_EDITAVEL.includes(producao.status) || producao.modoCorrecao === "ia") return false;
  return req.userRole === "admin" || (req.userRole === "professor" && idDe(producao.professorId) === String(req.userId));
}
// O aluno só vê as anotações quando a correção foi devolvida.
function alunoVeCorrecao(producao, req) {
  return idDe(producao.alunoId) === String(req.userId) && STATUS_DEVOLVIDA.includes(producao.status);
}

// ---------------- estado da correção ----------------
const ESTADOS = {
  nao_corrigida: "Não corrigida", em_correcao: "Em correção", salva: "Correção salva",
  concluida: "Correção concluída", devolvida: "Devolvida ao aluno", reenviada: "Reenviada pelo aluno", ia: "Corrigida pela IA"
};
// paraAluno: os passos internos do professor (salva, concluída) aparecem como « Em correção ».
function estadoCorrecao(p, { reenviada, paraAluno } = {}) {
  let estado;
  if (STATUS_DEVOLVIDA.includes(p.status)) estado = p.avaliacao && p.avaliacao.corretor === "ia" ? "ia" : "devolvida";
  else if (p.status === "aguardando_revisao") estado = "concluida";
  else if (p.status === "em_correcao") estado = p.modoCorrecao === "ia" ? "em_correcao" : (p.correcao && p.correcao.salvaEm ? "salva" : "em_correcao");
  else estado = "nao_corrigida";
  if (reenviada && (estado === "devolvida" || estado === "ia")) estado = "reenviada";
  if (paraAluno && (estado === "salva" || estado === "concluida")) estado = "em_correcao";
  return { estado, rotulo: ESTADOS[estado] };
}

// ---------------- histórico ----------------
async function registrarHistorico(producao, { autorId, autorNome }, acao, resumo, dados, { novaVersao } = {}) {
  producao.correcao = producao.correcao || {};
  if (novaVersao || !producao.correcao.versao) producao.correcao.versao = (producao.correcao.versao || 0) + 1;
  await HistoricoCorrecao.create({ producaoId: producao._id, versao: producao.correcao.versao, autorId, autorNome: autorNome || "", acao, resumo: String(resumo || "").slice(0, 500), dados });
}

// ---------------- anotações ----------------
const limpar = (v, max) => String(v == null ? "" : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max);
const numero = v => (v === null || v === undefined || v === "" || isNaN(Number(v)) ? undefined : Math.max(0, Number(v)));

// Texto anotável da produção para cada alvo.
function textoDoAlvo(producao, alvo) {
  if (alvo === "texto") return producao.textoDigitado || "";
  if (alvo === "transcricao") return producao.transcricao || "";
  return null;
}

// Valida e normaliza uma anotação vinda do navegador: a posição é conferida no servidor contra o
// texto real (se não bater, o trecho é reencontrado pela citação e pelo contexto).
function normalizarAnotacao(corpo, producao, cats, { parcial } = {}) {
  const r = {};
  const cat = corpo.categoria !== undefined ? cats.find(c => c.id === corpo.categoria && c.ativa !== false) : null;
  if (!parcial || corpo.categoria !== undefined) {
    if (!cat) throw { status: 400, msg: "Categoria inválida." };
    r.categoria = cat.id; r.categoriaNome = cat.nome; r.cor = cat.cor;
  }
  if (!parcial || corpo.comentario !== undefined) r.comentario = limpar(corpo.comentario, 4000);
  if (!parcial || corpo.sugestao !== undefined) r.sugestao = limpar(corpo.sugestao, 1000);
  if (parcial) {
    if (corpo.tempo !== undefined) r.tempo = numero(corpo.tempo);
    return r;
  }
  const alvo = corpo.alvo;
  if (!["texto", "transcricao", "audio"].includes(alvo)) throw { status: 400, msg: "Alvo da anotação inválido." };
  if (alvo === "texto" && producao.modalidade === "oral") throw { status: 400, msg: "Esta produção é oral." };
  if (alvo !== "texto" && producao.modalidade !== "oral") throw { status: 400, msg: "Esta produção é escrita." };
  r.alvo = alvo;
  r.tempo = numero(corpo.tempo);
  r.tempoFim = numero(corpo.tempoFim);
  if (r.tempoFim !== undefined && r.tempo !== undefined && r.tempoFim < r.tempo) r.tempoFim = undefined;
  if (alvo === "audio") {
    if (r.tempo === undefined) throw { status: 400, msg: "Informe o momento do áudio." };
    if (producao.duracaoSegundos && r.tempo > producao.duracaoSegundos + 5) throw { status: 400, msg: "Momento fora da duração do áudio." };
    r.trecho = ""; return r;
  }
  const texto = textoDoAlvo(producao, alvo);
  if (!texto) throw { status: 400, msg: "Não há texto para anotar nesta produção." };
  let ini = Number(corpo.inicio), fim = Number(corpo.fim);
  const trecho = String(corpo.trecho || "");
  if (!Number.isInteger(ini) || !Number.isInteger(fim) || ini < 0 || fim > texto.length || fim <= ini || texto.slice(ini, fim) !== trecho) {
    // posição não confere: procura a citação (com o contexto, se veio) no texto
    const pos = localizarCitacao(texto, trecho, String(corpo.prefixo || ""), String(corpo.sufixo || ""));
    if (pos < 0) throw { status: 400, msg: "O trecho selecionado não foi encontrado no texto." };
    ini = pos; fim = pos + trecho.length;
  }
  if (fim - ini > 2000) throw { status: 400, msg: "Trecho longo demais: selecione no máximo 2000 caracteres." };
  r.inicio = ini; r.fim = fim; r.trecho = texto.slice(ini, fim);
  r.prefixo = texto.slice(Math.max(0, ini - 32), ini);
  r.sufixo = texto.slice(fim, fim + 32);
  return r;
}
function localizarCitacao(texto, trecho, prefixo, sufixo) {
  if (!trecho) return -1;
  let melhor = -1, nota = -1, i = texto.indexOf(trecho);
  while (i >= 0) {
    let n = 0;
    if (prefixo && texto.slice(Math.max(0, i - prefixo.length), i) === prefixo) n += 2;
    if (sufixo && texto.slice(i + trecho.length, i + trecho.length + sufixo.length) === sufixo) n += 2;
    if (n > nota) { nota = n; melhor = i; }
    i = texto.indexOf(trecho, i + 1);
  }
  return melhor;
}

const publicaAnotacao = a => ({
  _id: a._id, alvo: a.alvo, inicio: a.inicio, fim: a.fim, trecho: a.trecho, prefixo: a.prefixo, sufixo: a.sufixo, tempo: a.tempo, tempoFim: a.tempoFim,
  categoria: a.categoria, categoriaNome: a.categoriaNome, cor: a.cor, comentario: a.comentario, sugestao: a.sugestao,
  autorId: a.autorId, autorNome: a.autorNome, criadoEm: a.criadoEm, atualizadoEm: a.atualizadoEm, removido: !!a.removido
});

const contarAnotacoes = producaoId => AnotacaoCorrecao.countDocuments({ producaoId, removido: false });

module.exports = {
  CATEGORIAS_PADRAO, categorias, salvarCategorias, validarCategorias,
  ehStaff, podeVer, podeEditar, alunoVeCorrecao, STATUS_DEVOLVIDA, STATUS_EDITAVEL,
  ESTADOS, estadoCorrecao, registrarHistorico, normalizarAnotacao, localizarCitacao, textoDoAlvo, publicaAnotacao, contarAnotacoes, limpar
};
