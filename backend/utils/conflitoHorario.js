// Aula particular e aula em turma dividem a mesma grade semanal: um horário (dia + hora)
// só pode ter uma das duas modalidades. Estas funções são usadas na criação/reativação de
// horários (equipe) e na escolha/compra de horários (aluno).
const HorarioSlot = require("../models/horarioSlot");
const Matricula = require("../models/matricula");

const NOMES_DIA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const NOMES_MODALIDADE = { particular: "aula particular", turma: "aula em turma" };

// Horário ativo da OUTRA modalidade no mesmo dia e hora (ou null).
function slotConcorrente({ diaSemana, horaInicio, modalidade }, excetoId) {
  const filtro = { diaSemana: Number(diaSemana), horaInicio, ativo: true, modalidade: { $ne: modalidade } };
  if (excetoId) filtro._id = { $ne: excetoId };
  return HorarioSlot.findOne(filtro).lean();
}
function mensagemConflito(outro) {
  return `Já existe ${NOMES_MODALIDADE[outro.modalidade] || "outra aula"} na ${NOMES_DIA[outro.diaSemana]} às ${outro.horaInicio}. ` +
    "Um horário só pode ter aula particular ou aula em turma: desative ou remova a outra primeiro.";
}

// Horários (dia|hora) já tomados por alunos de cada modalidade, para esconder o mesmo horário
// da outra modalidade (protege as grades antigas que já tinham as duas no mesmo horário).
async function horariosTomados(session) {
  const ocupados = await Matricula.aggregate([
    { $match: { status: "confirmada" } },
    { $unwind: "$slotsEscolhidos" },
    { $group: { _id: "$slotsEscolhidos.slotId" } }
  ]).session(session || null);
  if (!ocupados.length) return new Map();
  const slots = await HorarioSlot.find({ _id: { $in: ocupados.map(o => o._id) } }).select("diaSemana horaInicio modalidade").session(session || null).lean();
  const mapa = new Map();
  for (const s of slots) {
    const k = s.diaSemana + "|" + s.horaInicio;
    if (!mapa.has(k)) mapa.set(k, new Set());
    mapa.get(k).add(s.modalidade);
  }
  return mapa;
}
// true quando outro aluno já tem a OUTRA modalidade nesse dia e hora.
const tomadoPelaOutra = (mapa, slot) => {
  const m = mapa.get(slot.diaSemana + "|" + slot.horaInicio);
  return !!m && [...m].some(x => x !== slot.modalidade);
};

module.exports = { slotConcorrente, mensagemConflito, horariosTomados, tomadoPelaOutra, NOMES_DIA };
