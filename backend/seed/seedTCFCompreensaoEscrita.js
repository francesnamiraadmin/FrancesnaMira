// =====================================================================
// SEED — conjuntos oficiais de Compréhension Écrite (TCF Canada), a partir
// de "TCF_Canada_CE_ProvaN_Correcao_Comentada.pdf" (transcrição em
// backend/seed/dadosTCFProvas/provaN.json — uma prova por arquivo; hoje as
// Provas 1 a 8, 10, 12, 13 e 16 a 25). Cada questão tem o texto de
// apoio (materia "ce", tipo "multipla" — mesmo padrão de
// public/js/questoes2.js), 4 alternativas, a explicação da correção
// comentada e o nível (A1 a C2) da faixa da correção — o nível fica na
// questão (filtros, sorteio, estatísticas), não aparece para o aluno.
// Conjunto NN = Prova N (ex.: « TCF Compréhension Écrite 10 » = Prova 10).
//
// Nomes com prefixo "TCF Compréhension Écrite NN" (sem o padrão "Conjunto
// NN – ") de propósito, pra não colidir com a migração genérica de
// backend/seed/renumerarConjuntosOficiais.js, que casa por regex em
// qualquer conjunto chamado "Conjunto <número> – ...".
//
// Execute manualmente com:
//   node backend/seed/seedTCFCompreensaoEscrita.js
// Idempotente — Questao faz upsert por `codigo`; Conjunto pula nomes que já
// existem como oficial.
// =====================================================================
require("dotenv").config({ path: __dirname + "/../.env" });
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const User = require("../models/user");
const Questao = require("../models/questao");
const Conjunto = require("../models/conjunto");

const PASTA_DADOS = path.join(__dirname, "dadosTCFProvas");
// todas as provas com arquivo provaN.json, em ordem
const PROVAS = fs.readdirSync(PASTA_DADOS).map(f => /^prova(\d+)\.json$/.exec(f)).filter(Boolean).map(m => Number(m[1])).sort((a, b) => a - b);

function carregarProva(n) {
  const arquivo = path.join(PASTA_DADOS, `prova${n}.json`);
  return JSON.parse(fs.readFileSync(arquivo, "utf8"));
}

function niveisPresentes(questoesProva) {
  return Array.from(new Set(questoesProva.map((q) => q.nivel)));
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI);

  const admin = await User.findOne({ role: { $in: ["admin", "professor"] } }).sort({ criadoEm: 1 });
  if (!admin) throw new Error("Nenhum usuário admin/professor encontrado para ser o criadoPor dos conjuntos.");

  let questoesCriadas = 0, questoesAtualizadas = 0, conjuntosCriados = 0, conjuntosPulados = 0;

  for (const n of PROVAS) {
    const numeroFormatado = String(n).padStart(2, "0");
    const nomeConjunto = `TCF Compréhension Écrite ${numeroFormatado}`;

    const jaExiste = await Conjunto.findOne({ nome: nomeConjunto, tipo: "oficial" });
    if (jaExiste) {
      console.log(`[pulado] ${nomeConjunto} já existe.`);
      conjuntosPulados++;
      continue;
    }

    const questoesProva = carregarProva(n);
    const questaoIds = [];

    for (const q of questoesProva) {
      const codigo = `tcf_ce_prova${n}_q${String(q.n).padStart(2, "0")}`;
      const doc = {
        codigo,
        origem: "seedTCFCompreensaoEscrita.js",
        pool: "praticar",
        nivel: q.nivel,
        materia: "ce",
        tipo: "multipla",
        enunciado: q.pergunta,
        texto: q.texto,
        opcoes: q.alternativas,
        indiceCorreta: q.correta,
        explicacao: q.explicacao,
        ativo: true,
        courseType: "TCF"
      };
      const jaTinhaQuestao = await Questao.exists({ codigo });
      const questaoDoc = await Questao.findOneAndUpdate(
        { codigo },
        { $set: doc },
        { upsert: true, returnDocument: "after" }
      );
      questaoIds.push(questaoDoc._id);
      if (jaTinhaQuestao) questoesAtualizadas++;
      else questoesCriadas++;
    }

    await Conjunto.create({
      nome: nomeConjunto,
      descricao: `TCF Canada — Compréhension Écrite, Prova ${n} (${questoesProva.length} questões, transcrição integral da correção comentada).`,
      tipo: "oficial",
      pool: "praticar",
      criadoPor: admin._id,
      courseType: "TCF",
      filtros: { niveis: niveisPresentes(questoesProva), materias: ["ce"] },
      dificuldade: "dificil",
      questoes: questaoIds.map((id, i) => ({ questaoId: id, ordem: i })),
      quantidadeQuestoes: questaoIds.length,
      tempoLimiteSegundos: null
    });
    console.log(`[criado] ${nomeConjunto}: ${questaoIds.length} questões`);
    conjuntosCriados++;
  }

  console.log(
    `\nConcluído: ${conjuntosCriados} conjunto(s) criado(s), ${conjuntosPulados} já existiam.` +
    ` Questões: ${questoesCriadas} criada(s), ${questoesAtualizadas} atualizada(s).`
  );
  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
