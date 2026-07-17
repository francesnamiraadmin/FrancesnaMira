const express = require("express");
const router = express.Router();
const MateriaEstudo = require("../models/materiaEstudo");
const ConteudoEstudo = require("../models/conteudoEstudo");
const SessaoEstudo = require("../models/sessaoEstudo");
const { exigirAuth } = require("../middleware/auth");
const { transmitir } = require("../utils/sse");

router.use(exigirAuth);

// ===================== HELPERS =====================

function diaISO(data) { return new Date(data).toISOString().slice(0, 10); }

// Soma a duração das pausas (fechadas, ou a aberta contada até `ateData`), em ms.
function somaPausasMs(pausas, ateData) {
  return pausas.reduce((acc, p) => {
    const fim = p.fim || ateData;
    return acc + Math.max(0, new Date(fim).getTime() - new Date(p.inicio).getTime());
  }, 0);
}

// Sequência de dias consecutivos terminando hoje (ou ontem, se ainda não estudou hoje).
function calcularSequenciaDiaria(dias) {
  const hoje = diaISO(Date.now());
  const ontem = diaISO(Date.now() - 86400000);
  if (!dias.includes(hoje) && !dias.includes(ontem)) return 0;
  const diasSet = new Set(dias);
  let cursor = dias.includes(hoje) ? new Date() : new Date(Date.now() - 86400000);
  let seq = 0;
  while (diasSet.has(diaISO(cursor.getTime()))) {
    seq++;
    cursor = new Date(cursor.getTime() - 86400000);
  }
  return seq;
}

// Maior sequência histórica de dias consecutivos (não precisa terminar hoje).
function recordeSequenciaDiaria(dias) {
  const ordenados = [...new Set(dias)].sort();
  let maior = 0, atual = 0, anterior = null;
  for (const dia of ordenados) {
    atual = anterior && (new Date(dia) - new Date(anterior)) === 86400000 ? atual + 1 : 1;
    maior = Math.max(maior, atual);
    anterior = dia;
  }
  return maior;
}

function semanaISO(data) {
  const d = new Date(data);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const inicioAno = new Date(d.getFullYear(), 0, 4);
  const numero = 1 + Math.round(((d - inicioAno) / 86400000 - 3 + ((inicioAno.getDay() + 6) % 7)) / 7);
  return `${d.getFullYear()}-S${String(numero).padStart(2, "0")}`;
}

// ===================== MATÉRIAS =====================

// Devolve qtdConteudos/tempoTotalSegundos junto com cada matéria (agregação em
// JS puro sobre .find().lean(), mesmo padrão de /estatisticas) — evita N+1
// fetch no card de cada matéria em mapeador-timer.html.
router.get("/materias", async (req, res) => {
  try {
    const [materias, conteudos, sessoes] = await Promise.all([
      MateriaEstudo.find({ userId: req.userId }).sort({ criadoEm: 1 }).lean(),
      ConteudoEstudo.find({ userId: req.userId }).select("materiaId").lean(),
      SessaoEstudo.find({ userId: req.userId, status: "finalizada" }).select("materiaId duracaoSegundos").lean()
    ]);

    const qtdConteudosPorMateria = new Map();
    conteudos.forEach(c => {
      const chave = String(c.materiaId);
      qtdConteudosPorMateria.set(chave, (qtdConteudosPorMateria.get(chave) || 0) + 1);
    });
    const tempoPorMateria = new Map();
    sessoes.forEach(s => {
      const chave = String(s.materiaId);
      tempoPorMateria.set(chave, (tempoPorMateria.get(chave) || 0) + (s.duracaoSegundos || 0));
    });

    res.json(materias.map(m => ({
      ...m,
      qtdConteudos: qtdConteudosPorMateria.get(String(m._id)) || 0,
      tempoTotalSegundos: tempoPorMateria.get(String(m._id)) || 0
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.post("/materias", async (req, res) => {
  try {
    const { nome, cor, icone, descricao } = req.body;
    if (!nome?.trim()) return res.status(400).json({ msg: "Informe o nome da matéria." });
    if (!cor?.trim()) return res.status(400).json({ msg: "Escolha uma cor." });
    const materia = await MateriaEstudo.create({
      userId: req.userId, nome: nome.trim(), cor: cor.trim(),
      icone: icone?.trim() || undefined, descricao: descricao?.trim() || undefined
    });
    res.json(materia);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.put("/materias/:id", async (req, res) => {
  try {
    const materia = await MateriaEstudo.findOne({ _id: req.params.id, userId: req.userId });
    if (!materia) return res.status(404).json({ msg: "Matéria não encontrada." });
    const { nome, cor, icone, descricao } = req.body;
    if (nome !== undefined) materia.nome = nome.trim();
    if (cor !== undefined) materia.cor = cor.trim();
    if (icone !== undefined) materia.icone = icone.trim() || undefined;
    if (descricao !== undefined) materia.descricao = descricao.trim() || undefined;
    await materia.save();
    res.json(materia);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.delete("/materias/:id", async (req, res) => {
  try {
    const materia = await MateriaEstudo.findOne({ _id: req.params.id, userId: req.userId });
    if (!materia) return res.status(404).json({ msg: "Matéria não encontrada." });
    const temConteudos = await ConteudoEstudo.countDocuments({ materiaId: materia._id });
    if (temConteudos) return res.status(400).json({ msg: "Remova os conteúdos desta matéria antes de apagá-la." });
    await MateriaEstudo.deleteOne({ _id: materia._id });
    res.json({ msg: "Matéria removida." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// ===================== CONTEÚDOS =====================

// Mesmo princípio de agregação de /materias: tempoTotalSegundos/numeroSessoes
// por conteúdo, prontos pro subcard em mapeador-timer.html.
router.get("/conteudos", async (req, res) => {
  try {
    const filtro = { userId: req.userId };
    if (req.query.materiaId) filtro.materiaId = req.query.materiaId;
    const [conteudos, sessoes] = await Promise.all([
      ConteudoEstudo.find(filtro).sort({ criadoEm: 1 }).lean(),
      SessaoEstudo.find({ userId: req.userId, status: "finalizada" }).select("conteudoId duracaoSegundos").lean()
    ]);

    const tempoPorConteudo = new Map();
    const qtdPorConteudo = new Map();
    sessoes.forEach(s => {
      const chave = String(s.conteudoId);
      tempoPorConteudo.set(chave, (tempoPorConteudo.get(chave) || 0) + (s.duracaoSegundos || 0));
      qtdPorConteudo.set(chave, (qtdPorConteudo.get(chave) || 0) + 1);
    });

    res.json(conteudos.map(c => ({
      ...c,
      tempoTotalSegundos: tempoPorConteudo.get(String(c._id)) || 0,
      numeroSessoes: qtdPorConteudo.get(String(c._id)) || 0
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.post("/conteudos", async (req, res) => {
  try {
    const { materiaId, nome, cor, descricao } = req.body;
    if (!nome?.trim()) return res.status(400).json({ msg: "Informe o nome do conteúdo." });
    if (!cor?.trim()) return res.status(400).json({ msg: "Escolha uma cor." });
    const materia = await MateriaEstudo.findOne({ _id: materiaId, userId: req.userId });
    if (!materia) return res.status(400).json({ msg: "Matéria inválida." });
    const conteudo = await ConteudoEstudo.create({
      userId: req.userId, materiaId, nome: nome.trim(), cor: cor.trim(), descricao: descricao?.trim() || undefined
    });
    res.json(conteudo);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.put("/conteudos/:id", async (req, res) => {
  try {
    const conteudo = await ConteudoEstudo.findOne({ _id: req.params.id, userId: req.userId });
    if (!conteudo) return res.status(404).json({ msg: "Conteúdo não encontrado." });
    const { nome, cor, descricao } = req.body;
    if (nome !== undefined) conteudo.nome = nome.trim();
    if (cor !== undefined) conteudo.cor = cor.trim();
    if (descricao !== undefined) conteudo.descricao = descricao.trim() || undefined;
    await conteudo.save();
    res.json(conteudo);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.delete("/conteudos/:id", async (req, res) => {
  try {
    const conteudo = await ConteudoEstudo.findOne({ _id: req.params.id, userId: req.userId });
    if (!conteudo) return res.status(404).json({ msg: "Conteúdo não encontrado." });
    const temSessoes = await SessaoEstudo.countDocuments({ conteudoId: conteudo._id });
    if (temSessoes) return res.status(400).json({ msg: "Este conteúdo já tem sessões de estudo registradas e não pode ser apagado." });
    await ConteudoEstudo.deleteOne({ _id: conteudo._id });
    res.json({ msg: "Conteúdo removido." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// ===================== TIMER (SESSÕES EM ANDAMENTO) =====================
// Rotas de path fixo (ativa/iniciar) registradas ANTES de "/sessoes/:id" — senão o
// Express trataria "ativa"/"iniciar" como valor do parâmetro :id.

router.get("/sessoes/ativa", async (req, res) => {
  try {
    const sessao = await SessaoEstudo.findOne({ userId: req.userId, status: "em_andamento" });
    res.json(sessao);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.post("/sessoes/iniciar", async (req, res) => {
  try {
    const ativa = await SessaoEstudo.findOne({ userId: req.userId, status: "em_andamento" });
    if (ativa) return res.status(409).json({ msg: "Já existe uma sessão em andamento.", sessaoAtiva: ativa });

    const { materiaId, conteudoId } = req.body;
    const [materia, conteudo] = await Promise.all([
      MateriaEstudo.findOne({ _id: materiaId, userId: req.userId }),
      ConteudoEstudo.findOne({ _id: conteudoId, userId: req.userId })
    ]);
    if (!materia) return res.status(400).json({ msg: "Matéria inválida." });
    if (!conteudo || String(conteudo.materiaId) !== String(materiaId)) return res.status(400).json({ msg: "Conteúdo inválido." });

    const sessao = await SessaoEstudo.create({
      userId: req.userId, materiaId, conteudoId, status: "em_andamento", iniciadoEm: new Date()
    });
    res.json(sessao);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.post("/sessoes/:id/pausar", async (req, res) => {
  try {
    const sessao = await SessaoEstudo.findOne({ _id: req.params.id, userId: req.userId, status: "em_andamento" });
    if (!sessao) return res.status(404).json({ msg: "Sessão não encontrada." });
    if (!sessao.pausas.some(p => !p.fim)) {
      sessao.pausas.push({ inicio: new Date(), fim: null });
      await sessao.save();
    }
    res.json(sessao);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.post("/sessoes/:id/continuar", async (req, res) => {
  try {
    const sessao = await SessaoEstudo.findOne({ _id: req.params.id, userId: req.userId, status: "em_andamento" });
    if (!sessao) return res.status(404).json({ msg: "Sessão não encontrada." });
    const pausaAberta = sessao.pausas.find(p => !p.fim);
    if (pausaAberta) {
      pausaAberta.fim = new Date();
      await sessao.save();
    }
    res.json(sessao);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.post("/sessoes/:id/finalizar", async (req, res) => {
  try {
    const sessao = await SessaoEstudo.findOne({ _id: req.params.id, userId: req.userId, status: "em_andamento" });
    if (!sessao) return res.status(404).json({ msg: "Sessão não encontrada." });

    const agora = new Date();
    const pausaAberta = sessao.pausas.find(p => !p.fim);
    if (pausaAberta) pausaAberta.fim = agora;

    const brutoMs = agora.getTime() - sessao.iniciadoEm.getTime();
    const pausasMs = somaPausasMs(sessao.pausas, agora);
    const duracaoSegundos = Math.max(0, Math.round((brutoMs - pausasMs) / 1000));

    const { observacoes, dispositivo } = req.body;
    sessao.status = "finalizada";
    sessao.finalizadoEm = agora;
    sessao.duracaoSegundos = duracaoSegundos;
    if (observacoes !== undefined) sessao.observacoes = observacoes?.trim() || undefined;
    if (dispositivo !== undefined) sessao.dispositivo = dispositivo?.trim() || undefined;
    await sessao.save();

    transmitir("sessao-estudo-finalizada", { alunoId: String(req.userId), sessaoId: String(sessao._id) });
    res.json(sessao);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.post("/sessoes/:id/cancelar", async (req, res) => {
  try {
    const sessao = await SessaoEstudo.findOne({ _id: req.params.id, userId: req.userId, status: "em_andamento" });
    if (!sessao) return res.status(404).json({ msg: "Sessão não encontrada." });
    await SessaoEstudo.deleteOne({ _id: sessao._id });
    res.json({ msg: "Sessão cancelada." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// ===================== HISTÓRICO (SESSÕES FINALIZADAS) =====================

router.get("/sessoes", async (req, res) => {
  try {
    const filtro = { userId: req.userId, status: "finalizada" };
    if (req.query.materiaId) filtro.materiaId = req.query.materiaId;
    if (req.query.conteudoId) filtro.conteudoId = req.query.conteudoId;
    if (req.query.de || req.query.ate) {
      filtro.iniciadoEm = {};
      if (req.query.de) filtro.iniciadoEm.$gte = new Date(req.query.de);
      if (req.query.ate) filtro.iniciadoEm.$lte = new Date(req.query.ate + "T23:59:59.999Z");
    }
    const sessoes = await SessaoEstudo.find(filtro).sort({ iniciadoEm: -1 });

    const materiaIds = [...new Set(sessoes.map(s => String(s.materiaId)))];
    const conteudoIds = [...new Set(sessoes.map(s => String(s.conteudoId)))];
    const [materias, conteudos] = await Promise.all([
      MateriaEstudo.find({ _id: { $in: materiaIds } }),
      ConteudoEstudo.find({ _id: { $in: conteudoIds } })
    ]);
    const materiaPorId = new Map(materias.map(m => [String(m._id), m]));
    const conteudoPorId = new Map(conteudos.map(c => [String(c._id), c]));

    res.json(sessoes.map(s => {
      const materia = materiaPorId.get(String(s.materiaId));
      const conteudo = conteudoPorId.get(String(s.conteudoId));
      return {
        _id: s._id, iniciadoEm: s.iniciadoEm, finalizadoEm: s.finalizadoEm, duracaoSegundos: s.duracaoSegundos,
        observacoes: s.observacoes, dispositivo: s.dispositivo,
        materia: materia ? { _id: materia._id, nome: materia.nome, cor: materia.cor } : { _id: s.materiaId, nome: "Matéria removida", cor: "#94a3b8" },
        conteudo: conteudo ? { _id: conteudo._id, nome: conteudo.nome, cor: conteudo.cor } : { _id: s.conteudoId, nome: "Conteúdo removido", cor: "#94a3b8" }
      };
    }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.get("/sessoes/:id", async (req, res) => {
  try {
    const sessao = await SessaoEstudo.findOne({ _id: req.params.id, userId: req.userId, status: "finalizada" });
    if (!sessao) return res.status(404).json({ msg: "Sessão não encontrada." });
    const [materia, conteudo] = await Promise.all([
      MateriaEstudo.findById(sessao.materiaId),
      ConteudoEstudo.findById(sessao.conteudoId)
    ]);
    res.json({ ...sessao.toObject(), materia, conteudo });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.put("/sessoes/:id", async (req, res) => {
  try {
    const sessao = await SessaoEstudo.findOne({ _id: req.params.id, userId: req.userId, status: "finalizada" });
    if (!sessao) return res.status(404).json({ msg: "Sessão não encontrada." });

    const { materiaId, conteudoId, observacoes, dispositivo, iniciadoEm, finalizadoEm } = req.body;
    if (materiaId !== undefined) {
      const materia = await MateriaEstudo.findOne({ _id: materiaId, userId: req.userId });
      if (!materia) return res.status(400).json({ msg: "Matéria inválida." });
      sessao.materiaId = materiaId;
    }
    if (conteudoId !== undefined) {
      const conteudo = await ConteudoEstudo.findOne({ _id: conteudoId, userId: req.userId });
      if (!conteudo) return res.status(400).json({ msg: "Conteúdo inválido." });
      sessao.conteudoId = conteudoId;
    }
    if (observacoes !== undefined) sessao.observacoes = observacoes?.trim() || undefined;
    if (dispositivo !== undefined) sessao.dispositivo = dispositivo?.trim() || undefined;

    if (iniciadoEm !== undefined || finalizadoEm !== undefined) {
      const novoInicio = iniciadoEm !== undefined ? new Date(iniciadoEm) : sessao.iniciadoEm;
      const novoFim = finalizadoEm !== undefined ? new Date(finalizadoEm) : sessao.finalizadoEm;
      if (isNaN(novoInicio) || isNaN(novoFim) || novoFim <= novoInicio) {
        return res.status(400).json({ msg: "Intervalo de tempo inválido." });
      }
      sessao.iniciadoEm = novoInicio;
      sessao.finalizadoEm = novoFim;
      const brutoMs = novoFim.getTime() - novoInicio.getTime();
      const pausasMs = somaPausasMs(sessao.pausas, novoFim);
      sessao.duracaoSegundos = Math.max(0, Math.round((brutoMs - pausasMs) / 1000));
    }

    await sessao.save();
    res.json(sessao);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

router.delete("/sessoes/:id", async (req, res) => {
  try {
    const sessao = await SessaoEstudo.findOne({ _id: req.params.id, userId: req.userId, status: "finalizada" });
    if (!sessao) return res.status(404).json({ msg: "Sessão não encontrada." });
    await SessaoEstudo.deleteOne({ _id: sessao._id });
    res.json({ msg: "Sessão removida." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

// ===================== ESTATÍSTICAS / DASHBOARD =====================

router.get("/estatisticas", async (req, res) => {
  try {
    const [sessoes, materias, conteudos] = await Promise.all([
      SessaoEstudo.find({ userId: req.userId, status: "finalizada" }).lean(),
      MateriaEstudo.find({ userId: req.userId }).lean(),
      ConteudoEstudo.find({ userId: req.userId }).lean()
    ]);

    const materiaPorId = new Map(materias.map(m => [String(m._id), m]));
    const conteudoPorId = new Map(conteudos.map(c => [String(c._id), c]));

    const duracoes = sessoes.map(s => s.duracaoSegundos || 0);
    const tempoTotalSegundos = duracoes.reduce((a, b) => a + b, 0);

    const hojeISO = diaISO(Date.now());
    const inicioSemana = new Date(); inicioSemana.setHours(0, 0, 0, 0); inicioSemana.setDate(inicioSemana.getDate() - inicioSemana.getDay());
    const inicioMes = new Date(); inicioMes.setHours(0, 0, 0, 0); inicioMes.setDate(1);

    const tempoHojeSegundos = sessoes.filter(s => diaISO(s.iniciadoEm) === hojeISO).reduce((a, s) => a + (s.duracaoSegundos || 0), 0);
    const tempoSemanaSegundos = sessoes.filter(s => new Date(s.iniciadoEm) >= inicioSemana).reduce((a, s) => a + (s.duracaoSegundos || 0), 0);
    const tempoMesSegundos = sessoes.filter(s => new Date(s.iniciadoEm) >= inicioMes).reduce((a, s) => a + (s.duracaoSegundos || 0), 0);

    const diasComEstudo = [...new Set(sessoes.map(s => diaISO(s.iniciadoEm)))];

    const kpis = {
      tempoTotalSegundos, tempoHojeSegundos, tempoSemanaSegundos, tempoMesSegundos,
      maiorSessaoSegundos: duracoes.length ? Math.max(...duracoes) : 0,
      menorSessaoSegundos: duracoes.length ? Math.min(...duracoes) : 0,
      tempoMedioSegundos: duracoes.length ? Math.round(tempoTotalSegundos / duracoes.length) : 0,
      numeroSessoes: sessoes.length,
      numeroMaterias: materias.length,
      numeroConteudos: conteudos.length,
      sequenciaDiasAtual: calcularSequenciaDiaria(diasComEstudo),
      recordeSequenciaDias: recordeSequenciaDiaria(diasComEstudo)
    };

    const porMateriaMap = new Map();
    sessoes.forEach(s => {
      const chave = String(s.materiaId);
      porMateriaMap.set(chave, (porMateriaMap.get(chave) || 0) + (s.duracaoSegundos || 0));
    });
    const porMateria = [...porMateriaMap.entries()]
      .map(([id, totalSegundos]) => {
        const m = materiaPorId.get(id);
        return { materiaId: id, nome: m ? m.nome : "Matéria removida", cor: m ? m.cor : "#94a3b8", totalSegundos };
      })
      .sort((a, b) => b.totalSegundos - a.totalSegundos);

    const porConteudoMap = new Map();
    sessoes.forEach(s => {
      const chave = String(s.conteudoId);
      porConteudoMap.set(chave, (porConteudoMap.get(chave) || 0) + (s.duracaoSegundos || 0));
    });
    const porConteudo = [...porConteudoMap.entries()]
      .map(([id, totalSegundos]) => {
        const c = conteudoPorId.get(id);
        return { conteudoId: id, materiaId: c ? String(c.materiaId) : null, nome: c ? c.nome : "Conteúdo removido", cor: c ? c.cor : "#94a3b8", totalSegundos };
      })
      .sort((a, b) => b.totalSegundos - a.totalSegundos);

    const porDiaMap = new Map();
    sessoes.forEach(s => {
      const dia = diaISO(s.iniciadoEm);
      porDiaMap.set(dia, (porDiaMap.get(dia) || 0) + (s.duracaoSegundos || 0));
    });
    const porDia = [...porDiaMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([data, totalSegundos]) => ({ data, totalSegundos }));

    const porSemanaMap = new Map();
    sessoes.forEach(s => {
      const semana = semanaISO(s.iniciadoEm);
      porSemanaMap.set(semana, (porSemanaMap.get(semana) || 0) + (s.duracaoSegundos || 0));
    });
    const porSemana = [...porSemanaMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([semana, totalSegundos]) => ({ semana, totalSegundos }));

    const porMesMap = new Map();
    sessoes.forEach(s => {
      const mes = diaISO(s.iniciadoEm).slice(0, 7);
      porMesMap.set(mes, (porMesMap.get(mes) || 0) + (s.duracaoSegundos || 0));
    });
    const porMes = [...porMesMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([mes, totalSegundos]) => ({ mes, totalSegundos }));

    const porHoraDoDia = Array.from({ length: 24 }, (_, hora) => ({ hora, totalSegundos: 0 }));
    sessoes.forEach(s => {
      const hora = new Date(s.iniciadoEm).getHours();
      porHoraDoDia[hora].totalSegundos += (s.duracaoSegundos || 0);
    });

    const NOMES_DIA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
    const porDiaDaSemana = Array.from({ length: 7 }, (_, diaSemana) => ({ diaSemana, nome: NOMES_DIA[diaSemana], totalSegundos: 0, quantidade: 0 }));
    sessoes.forEach(s => {
      const diaSemana = new Date(s.iniciadoEm).getDay();
      porDiaDaSemana[diaSemana].totalSegundos += (s.duracaoSegundos || 0);
      porDiaDaSemana[diaSemana].quantidade += 1;
    });
    porDiaDaSemana.forEach(d => { d.mediaSegundos = d.quantidade ? Math.round(d.totalSegundos / d.quantidade) : 0; });

    let acumulado = 0;
    const evolucaoAcumulada = porDia.map(d => { acumulado += d.totalSegundos; return { data: d.data, totalSegundosAcumulado: acumulado }; });

    res.json({ kpis, porMateria, porConteudo, porDia, porSemana, porMes, porHoraDoDia, porDiaDaSemana, evolucaoAcumulada });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erro no servidor." });
  }
});

module.exports = router;
