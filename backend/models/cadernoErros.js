const mongoose = require("mongoose");
const { TIPOS_CURSO } = require("../utils/tiposCurso");

// Coleção de REFERÊNCIAS a questões — nunca duplica o conteúdo da questão. Populável já
// na Fase 1 pelo botão "Adicionar ao Caderno de Revisão" durante a resolução (antes de o
// aluno saber se acertou, já que o gabarito fica oculto até o envio — por isso `motivo`
// nasce sempre "revisao_manual" nesta fase; "erro" fica reservado para a auto-adição da
// Fase 2, no momento em que uma Tentativa é finalizada). Rotas/tela de gestão completas
// (filtros, remover, gerar conjunto a partir do caderno) só chegam na Fase 2.
const CadernoErrosSchema = new mongoose.Schema({
  alunoId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  questaoId: { type: mongoose.Schema.Types.ObjectId, ref: "Questao", required: true },
  // Copiado de Questao.courseType na criação — permite filtrar o Caderno por curso
  // sem join. `null` em entradas antigas (ver migração).
  courseType: { type: String, enum: TIPOS_CURSO, default: null },
  origem: {
    tentativaId: { type: mongoose.Schema.Types.ObjectId, ref: "Tentativa" },
    conjuntoId: { type: mongoose.Schema.Types.ObjectId, ref: "Conjunto" }
  },
  motivo: { type: String, enum: ["erro", "revisao_manual"], default: "revisao_manual" },
  resolvidaNoCaderno: { type: Boolean, default: false }, // usado só a partir da Fase 2
  adicionadoEm: { type: Date, default: Date.now }
});

CadernoErrosSchema.index({ alunoId: 1, questaoId: 1 }, { unique: true });
CadernoErrosSchema.index({ alunoId: 1, adicionadoEm: -1 });
CadernoErrosSchema.index({ alunoId: 1, courseType: 1 });

module.exports = mongoose.model("CadernoErros", CadernoErrosSchema);
