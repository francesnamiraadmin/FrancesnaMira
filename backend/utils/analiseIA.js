// Análise da IA para o professor: quando o aluno pede a correção de um professor, a IA corrige a
// produção em segundo plano e o resultado fica em Producao.analiseIA (campo com select: false),
// como base de análise para a equipe no Sistema de Correção. O aluno nunca recebe esse campo e nada
// é gravado no histórico de correções nem no caderno de erros dele.
const Producao = require("../models/producao");
const Tema = require("../models/tema");
const { iaConfigurada } = require("./claude");
const { corrigirProducaoComIA } = require("./correcaoProducaoIA");

const emAndamento = new Map();

async function gerarAnaliseIA(producaoId) {
  const id = String(producaoId);
  if (emAndamento.has(id)) return emAndamento.get(id);
  const tarefa = (async () => {
    if (!iaConfigurada()) {
      await Producao.updateOne({ _id: id }, { $set: { analiseIA: { status: "indisponivel", em: new Date() } } });
      return null;
    }
    const p = await Producao.findById(id);
    if (!p || p.modoCorrecao === "ia") return null;
    const tema = await Tema.findById(p.temaId);
    if (!tema) return null;
    const texto = p.modalidade === "oral" ? (p.transcricao || "") : (p.textoDigitado || "");
    const temAudio = p.modalidade === "oral" && p.arquivoOriginal?.caminho;
    if (!texto.trim() && !(p.origem?.tipo === "modeles" && temAudio)) {
      // arquivo enviado (PDF/DOCX) sem texto digitado: não há o que a IA ler
      await Producao.updateOne({ _id: id }, { $set: { analiseIA: { status: "sem_texto", em: new Date() } } });
      return null;
    }
    await Producao.updateOne({ _id: id }, { $set: { analiseIA: { status: "gerando", em: new Date() } } });
    try {
      const avaliacao = p.origem?.tipo === "modeles"
        ? await require("./correcaoModelesIA").corrigirProducaoModeles(p, tema, { registrar: false })
        : await corrigirProducaoComIA(tema, texto);
      const analise = { status: "pronta", em: new Date(), modelo: avaliacao.modelo, avaliacao };
      await Producao.updateOne({ _id: id }, { $set: { analiseIA: analise } });
      return analise;
    } catch (err) {
      const analise = { status: "erro", em: new Date(), erro: String(err.message || err).slice(0, 300) };
      await Producao.updateOne({ _id: id }, { $set: { analiseIA: analise } });
      return analise;
    }
  })().finally(() => emAndamento.delete(id));
  emAndamento.set(id, tarefa);
  return tarefa;
}

module.exports = { gerarAnaliseIA };
