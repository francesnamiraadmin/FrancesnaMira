// « Criar Dever » (Gestão de Alunos): o catálogo de tudo o que pode entrar num dever, por curso,
// e a preparação das atividades montadas no construtor antes de gravar (dever avulso para alunos
// ou semana de um Plano-Base).
//
// Tipos que o construtor usa:
//  - questoes_plataforma: um conjunto pronto (conjuntoId) ou questões sorteadas (sorteio → um
//    Conjunto criado na hora, fixo para todos os alunos do dever);
//  - producao_textual / producao_oral: um sujet do Ambiente de Produção (tache + sujetId), que
//    vira um Tema (garantirTemaSujet) para o aluno escrever/gravar na própria aba do dever;
//  - assistir_aula / assistir_modulo: aula gravada ou módulo inteiro;
//  - exercicio_interativo: um dever completo (backend/data/exercicios).
// Os outros tipos antigos (texto, link…) passam como estão.
const mongoose = require("mongoose");
const Conjunto = require("../models/conjunto");
const Modulo = require("../models/modulo");
const Aula = require("../models/aula");
const Tema = require("../models/tema");
const M = require("./modelesTCF");
const ex = require("./exercicios");
const { TIPOS_CURSO, GRUPOS_CURSO } = require("./tiposCurso");
const { TIPOS_ATIVIDADE } = require("../models/atividadeSchema");
const { sortearQuestoes, derivarDificuldade } = require("./gerarConjunto");

const MATERIAS = { conjugaison: "Conjugação", vocabulaire: "Vocabulário", grammaire: "Gramática", co: "Compreensão oral", ce: "Compreensão escrita", expressions: "Expressões", historia: "Histórias", visual: "Visual" };
const NIVEIS = ["A1", "A2", "B1", "B2", "C1", "C2"];
const oid = v => mongoose.Types.ObjectId.isValid(String(v || "")) ? new mongoose.Types.ObjectId(String(v)) : null;
const erro = msg => Object.assign(new Error(msg), { status: 400, msg });
const limpar = (v, n) => String(v == null ? "" : v).trim().slice(0, n);

// Perfil do catálogo do Ambiente de Produção: DELF por nível; os outros cursos usam o do TCF.
function perfilDe(curso, nivel) {
  if (curso === "DELF") return M.PERFIS["DELF-" + nivel] ? "DELF-" + nivel : "DELF-B1";
  return "TCF";
}

async function catalogo(curso, nivel) {
  if (!TIPOS_CURSO.includes(curso)) throw erro("Curso inválido.");
  const perfil = perfilDe(curso, nivel), P = M.PERFIS[perfil];
  const [conjuntos, modulos] = await Promise.all([
    Conjunto.find({ ativo: true, tipo: "oficial", courseType: curso }).select("nome descricao quantidadeQuestoes filtros dificuldade").sort({ nome: 1 }).lean(),
    Modulo.find({ $or: [{ ativo: { $ne: false } }] }).select("titulo courseType curso ordem").sort({ ordem: 1, titulo: 1 }).lean()
  ]);
  const aulas = await Aula.find({ ativo: { $ne: false }, moduloId: { $in: modulos.map(m => m._id) } }).select("titulo moduloId ordem duracaoSegundos").sort({ ordem: 1 }).lean();
  const doCurso = modulos.filter(m => m.courseType === curso || m.curso === curso);
  const sujets = [];
  for (const t of P.TACHES) {
    const vistos = new Set();
    for (const s of P.modelosManuais(t).concat(P.sujetsDaTache(t))) {
      if (vistos.has(s.id)) continue; vistos.add(s.id);
      sujets.push({ tache: t, id: s.id, e: s.e, eixo: (M.EIXOS.eixos[s.e] || {}).nome || s.e, t: String(s.titre || s.t || "").slice(0, 220), f: s.f || 1 });
    }
  }
  return {
    curso, perfil, provas: GRUPOS_CURSO.provas.includes(curso),
    niveis: GRUPOS_CURSO.provas.includes(curso) ? NIVEIS : [curso], materias: MATERIAS,
    conjuntos,
    modulos: (doCurso.length ? doCurso : modulos).map(m => ({ _id: m._id, titulo: m.titulo, curso: m.courseType || m.curso || "", aulas: aulas.filter(a => String(a.moduloId) === String(m._id)).map(a => ({ _id: a._id, titulo: a.titulo, duracaoSegundos: a.duracaoSegundos || 0 })) })),
    todosOsModulos: !doCurso.length,
    taches: P.TACHES.map(t => ({ id: t, nome: P.NOMES_TACHE[t], escrita: M.ehEscrita(t) })),
    sujets,
    exercicios: ex.listar()
  };
}

// Valida e completa as atividades do construtor. `ctx` = { curso, nivel, userId }.
async function prepararAtividades(lista, ctx) {
  if (!Array.isArray(lista) || !lista.length) throw erro("Adicione pelo menos uma atividade ao dever.");
  if (lista.length > 60) throw erro("Um dever pode ter no máximo 60 atividades.");
  const curso = TIPOS_CURSO.includes(ctx.curso) ? ctx.curso : "TCF";
  const perfil = perfilDe(curso, ctx.nivel);
  const out = [];
  for (const [i, a] of lista.entries()) {
    const tipo = String(a?.tipo || "");
    if (!TIPOS_ATIVIDADE.includes(tipo)) throw erro(`Atividade ${i + 1}: tipo inválido.`);
    const c = a.conteudo || {};
    const base = {
      tipo, titulo: limpar(a.titulo, 200), descricao: limpar(a.descricao, 2000) || undefined,
      obrigatoria: a.obrigatoria !== false, dependeDe: Number.isInteger(a.dependeDe) && a.dependeDe >= 0 && a.dependeDe < i ? a.dependeDe : null, conteudo: {}
    };
    if (tipo === "questoes_plataforma" || tipo === "exercicio_lista" || tipo === "simulado") {
      let conj = null;
      if (c.conjuntoId) conj = await Conjunto.findOne({ _id: oid(c.conjuntoId), ativo: true }).select("nome quantidadeQuestoes").lean();
      if (!conj && c.sorteio) {
        // questões sorteadas: um conjunto novo, fixo para todos os alunos deste dever
        const niveis = (c.sorteio.niveis || []).filter(n => NIVEIS.includes(n));
        const materias = (c.sorteio.materias || []).filter(m => MATERIAS[m]);
        const quantidade = Math.min(60, Math.max(5, Number(c.sorteio.quantidade) || 10));
        if (!niveis.length) throw erro(`Atividade ${i + 1}: escolha os níveis das questões.`);
        const prova = GRUPOS_CURSO.provas.includes(curso);
        let questoes;
        try { questoes = await sortearQuestoes({ niveis, materias: prova ? undefined : (materias.length ? materias : Object.keys(MATERIAS)), quantidade, cursoProva: prova ? curso : null }); }
        catch (e) { if (e.status === 422) throw erro(`Atividade ${i + 1}: ${e.message}`); throw e; }
        const criado = await Conjunto.create({
          nome: base.titulo || `Dever · ${quantidade} questões ${niveis.join("+")}`, descricao: "Questões sorteadas para um dever de casa.",
          tipo: "personalizado", pool: "praticar", courseType: curso, criadoPor: ctx.userId,
          filtros: { niveis, materias }, dificuldade: derivarDificuldade(niveis), questoes, quantidadeQuestoes: questoes.length
        });
        conj = { _id: criado._id, nome: criado.nome, quantidadeQuestoes: criado.quantidadeQuestoes };
        base.conteudo.sorteio = { niveis, materias, quantidade };
      }
      if (!conj) throw erro(`Atividade ${i + 1}: escolha um conjunto de questões ou o sorteio.`);
      base.conteudo.conjuntoId = conj._id;
      if (!base.titulo) base.titulo = `${conj.nome} (${conj.quantidadeQuestoes} questões)`;
    } else if (tipo === "producao_textual" || tipo === "producao_oral") {
      if (c.tache && c.sujetId) {
        const tache = String(c.tache), sujetId = String(c.sujetId);
        const sujet = M.acharTema(tache, sujetId);
        if (!sujet) throw erro(`Atividade ${i + 1}: tema do Ambiente de Produção não encontrado.`);
        const tema = await require("./correcaoModelesIA").garantirTemaSujet(curso, tache, sujetId);
        Object.assign(base, { tipo: M.ehEscrita(tache) ? "producao_textual" : "producao_oral" });
        base.conteudo = { temaId: tema._id, tache, sujetId, perfil: c.perfil || perfil };
        if (!base.titulo) base.titulo = `${M.nomeTacheDe(tache, sujet)} · ${tema.titulo}`.slice(0, 200);
      } else if (c.temaId) {
        const tema = await Tema.findById(oid(c.temaId)).select("titulo modalidade").lean();
        if (!tema) throw erro(`Atividade ${i + 1}: tema não encontrado.`);
        base.conteudo = { temaId: tema._id };
        base.tipo = tema.modalidade === "oral" ? "producao_oral" : "producao_textual";
        if (!base.titulo) base.titulo = tema.titulo;
      } else throw erro(`Atividade ${i + 1}: escolha o tema da produção.`);
    } else if (tipo === "assistir_aula") {
      const aula = await Aula.findById(oid(c.aulaId)).select("titulo moduloId").lean();
      if (!aula) throw erro(`Atividade ${i + 1}: escolha a aula.`);
      base.conteudo = { aulaId: aula._id, moduloId: aula.moduloId };
      if (!base.titulo) base.titulo = "Assistir: " + aula.titulo;
    } else if (tipo === "assistir_modulo") {
      const mod = await Modulo.findById(oid(c.moduloId)).select("titulo").lean();
      if (!mod) throw erro(`Atividade ${i + 1}: escolha o módulo.`);
      base.conteudo = { moduloId: mod._id };
      if (!base.titulo) base.titulo = "Assistir o módulo: " + mod.titulo;
    } else if (tipo === "exercicio_interativo") {
      const def = ex.obter(String(c.exercicioSlug || ""));
      if (!def) throw erro(`Atividade ${i + 1}: escolha o dever completo.`);
      base.conteudo = { exercicioSlug: def.slug };
      if (!base.titulo) base.titulo = def.titulo;
      if (!base.descricao && def.descricao) base.descricao = String(def.descricao).slice(0, 2000);
    } else {
      // tipos livres (texto, leitura, link, upload…): o conteúdo simples passa como está
      base.conteudo = { url: limpar(c.url, 600) || undefined, texto: limpar(c.texto, 20000) || undefined };
    }
    if (!base.titulo) base.titulo = "Atividade " + (i + 1);
    out.push(base);
  }
  return out;
}

module.exports = { catalogo, prepararAtividades, perfilDe, MATERIAS };
