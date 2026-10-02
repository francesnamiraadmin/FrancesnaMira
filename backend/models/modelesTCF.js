const mongoose = require("mongoose");
const { Schema } = mongoose;

// Coleções do Ambiente de Produção no modelo do app "Modèles TCF" (Apps Script). No script,
// cada uma era uma aba da planilha (Modèles IA, Épreuves, Sessions, Devoirs, Carnets de
// révision, Thèmes du mois, Blog, Avis, Compétences, Notes orales, Vocabulaire, Configuration).
// O conteúdo pedagógico fixo (eixos, trames, sujets, modelos escritos à mão) fica em
// backend/data/modeles/*.json — aqui só o que muda com o uso.

const TACHES = ["T1", "T2", "T3", "ET1", "ET2", "ET3"];
// Alvo de um devoir/sessão/aviso/partilha: "TOUS" ou a lista de alunos.
const Alvo = { todos: { type: Boolean, default: true }, alunos: [{ type: Schema.Types.ObjectId, ref: "User" }] };

// Modelo redigido pela IA para um sujet (um só para todos os alunos, como na aba "Modèles IA").
const ModeleIA = mongoose.model("ModeleIA", new Schema({
  sujetId: { type: String, required: true, unique: true },
  tache: { type: String, enum: TACHES, required: true },
  sujet: { type: String },
  modelo: { type: Schema.Types.Mixed, required: true },
  pedidoPor: { type: Schema.Types.ObjectId, ref: "User" },
  criadoEm: { type: Date, default: Date.now }
}));

// Épreuve écrite de 60 min (ET1+ET2+ET3 simultâneas). Treino livre: o tempo pausa com a página
// fechada (consumido/ultimoSinal). Sessão do professor: o tempo corre como no exame.
const EpreuveTCF = mongoose.model("EpreuveTCF", new Schema({
  alunoId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  courseType: { type: String },
  sessaoId: { type: Schema.Types.ObjectId, ref: "SessaoTCF", default: null },
  inicio: { type: Date, required: true },
  fim: { type: Date, required: true },
  duracaoMin: { type: Number, default: 60 },
  sujets: { ET1: String, ET2: String, ET3: String },
  textes: { ET1: { type: String, default: "" }, ET2: { type: String, default: "" }, ET3: { type: String, default: "" } },
  status: { type: String, enum: ["em_curso", "enviada", "enviada_auto", "vazia", "so_ia"], default: "em_curso", index: true },
  consumido: { type: Number, default: 0 },
  ultimoSinal: { type: Date },
  enviadaEm: { type: Date },
  // Destino escolhido ao começar: "ia" (correção automática) ou "professor" (Sistema de Correção).
  correcao: { type: String, enum: ["ia", "professor"], default: "ia" },
  producoes: [{ type: Schema.Types.ObjectId, ref: "Producao" }]
}));

// Épreuve preparada pelo professor: sujets escolhidos (escrito e/ou oral) para alunos escolhidos.
const SessaoTCF = mongoose.model("SessaoTCF", new Schema({
  nome: { type: String, required: true },
  ET1: String, ET2: String, ET3: String,
  T1: String, T2: String, T3: String,
  alvo: Alvo,
  ativa: { type: Boolean, default: true },
  criadoPor: { type: Schema.Types.ObjectId, ref: "User" },
  criadoPorNome: String,
  criadoEm: { type: Date, default: Date.now }
}));

const DevoirTCF = mongoose.model("DevoirTCF", new Schema({
  titre: String,
  tache: { type: String, enum: TACHES },
  modelo: String,
  tipo: { type: String, enum: ["dictee", "etude", "oral", "ecrit"] },
  mensagem: String,
  eixo: String,
  alvo: Alvo,
  ativo: { type: Boolean, default: true },
  feitos: [{ alunoId: { type: Schema.Types.ObjectId, ref: "User" }, score: Number, total: Number, data: Date }],
  // "site": criado pelo Dever de Casa do site (atividade "producao_ambiente"), não é espelhado de volta.
  origem: { type: String, enum: ["app", "site"], default: "app" },
  criadoPor: { type: Schema.Types.ObjectId, ref: "User" },
  criadoPorNome: String,
  criadoEm: { type: Date, default: Date.now }
}));

// Carnet de révision do Ambiente de Produção: sujets salvos, palavras (léxico das correções) e
// erros (correções da IA / do professor). Aparece também no Caderno de Revisão da Plataforma.
const CarnetProducao = mongoose.model("CarnetProducao", new Schema({
  alunoId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  tipo: { type: String, enum: ["sujet", "mot", "erreur"], required: true },
  tache: String,
  refId: String,
  titre: String,
  detalhe: String,
  eixo: String,
  courseType: String,
  origem: { type: String },
  producaoId: { type: Schema.Types.ObjectId, ref: "Producao" },
  revisado: { type: Boolean, default: false },
  data: { type: Date, default: Date.now }
}));

const TemaMesTCF = mongoose.model("TemaMesTCF", new Schema({
  mes: { type: String, index: true },
  tache: { type: String, enum: TACHES },
  sujetId: String,
  titre: String,
  eixo: String,
  por: String,
  criadoEm: { type: Date, default: Date.now }
}));

// "À la une": artigos escolhidos pelo professor para a página inicial.
const PostBlogTCF = mongoose.model("PostBlogTCF", new Schema({
  ordem: { type: Number, default: 1 },
  titre: { type: String, required: true },
  texto: String,
  imagem: String,
  tache: String,
  sujetId: String,
  visivel: { type: Boolean, default: true },
  criadoEm: { type: Date, default: Date.now }
}));

// Avis que aparece no meio da tela do aluno até ele tocar em "J'ai compris".
const AvisoTCF = mongoose.model("AvisoTCF", new Schema({
  titre: String,
  message: String,
  alvo: Alvo,
  ativo: { type: Boolean, default: true },
  lidos: [{ type: Schema.Types.ObjectId, ref: "User" }],
  de: String,
  criadoEm: { type: Date, default: Date.now }
}));

// Recado individual do professor (aparece em "Mon espace" como tarefa a marcar feita).
const MensagemTCF = mongoose.model("MensagemTCF", new Schema({
  alunoId: { type: Schema.Types.ObjectId, ref: "User", index: true },
  texto: String,
  de: String,
  feito: { type: Boolean, default: false },
  atualizadoEm: Date,
  criadoEm: { type: Date, default: Date.now }
}));

// Nota por competência (6 critérios de 0 a 10 → /20), como a aba "Compétences".
const CompetenciaTCF = mongoose.model("CompetenciaTCF", new Schema({
  alunoId: { type: Schema.Types.ObjectId, ref: "User", index: true },
  epreuve: { type: String, enum: ["PE", "PO"] },
  tache: String,
  sujet: String,
  producaoId: { type: Schema.Types.ObjectId, ref: "Producao" },
  notas: [Number],
  total: Number,
  comentario: String,
  professor: String,
  criadoEm: { type: Date, default: Date.now }
}));

// Correção de treino pela IA (nota /20, trame, léxico, versão melhorada), com limite diário.
const CorrecaoIATCF = mongoose.model("CorrecaoIATCF", new Schema({
  alunoId: { type: Schema.Types.ObjectId, ref: "User", index: true },
  tache: String,
  sujetId: String,
  sujet: String,
  modalidade: { type: String, enum: ["textual", "oral"], default: "textual" },
  mots: Number,
  note: Number,
  nclc: String,
  texte: String,
  correcao: Schema.Types.Mixed,
  producaoId: { type: Schema.Types.ObjectId, ref: "Producao" },
  criadoEm: { type: Date, default: Date.now }
}));

// Liberação individual de um modelo (leitura e/ou dictée) — aba "Partages".
const PartilhaTCF = mongoose.model("PartilhaTCF", new Schema({
  sujetId: String,
  tipo: { type: String, enum: ["modele", "dictee"] },
  titre: String,
  alvo: Alvo,
  por: String,
  criadoEm: { type: Date, default: Date.now }
}));

// Cartas de vocabulário acrescentadas pelo professor + progresso de cada aluno.
const CartaVocabTCF = mongoose.model("CartaVocabTCF", new Schema({
  deck: String, mot: String, traduction: String, exemple: String, astuce: String,
  ativo: { type: Boolean, default: true },
  criadoEm: { type: Date, default: Date.now }
}));
const ProgressoVocabTCF = mongoose.model("ProgressoVocabTCF", new Schema({
  alunoId: { type: Schema.Types.ObjectId, ref: "User", unique: true },
  dados: { type: Schema.Types.Mixed, default: {} },
  atualizadoEm: Date
}));

// Configuração geral (um único documento): temas ocultos no quadro P.O./P.E., limite diário
// de correções pela IA, geração de modelos pelos alunos, melhores resultados etc.
const ConfigModelesTCF = mongoose.model("ConfigModelesTCF", new Schema({
  chave: { type: String, default: "geral", unique: true },
  ocultos: { type: Schema.Types.Mixed, default: {} },
  iaDia: { type: Number, default: 10 },
  geracaoAlunos: { type: Boolean, default: true },
  // Sujets retirados do "À la une" por um administrador (o destaque passa ao próximo da tâche).
  ocultosUne: { type: Schema.Types.Mixed, default: {} },
  // Frases que o app tocou sem áudio Coqui (chave "A|frase" / "B|frase"), para a próxima geração.
  audiosFaltantes: { type: Schema.Types.Mixed, default: {} },
  geracaoLote: { ativa: { type: Boolean, default: false }, iniciadaEm: Date, feitos: Number, erros: Number, falhas: { type: Schema.Types.Mixed, default: {} } }
}, { minimize: false }));

// Recordes pessoais de dictée/réécriture (só o aluno vê).
const RecordeTCF = mongoose.model("RecordeTCF", new Schema({
  alunoId: { type: Schema.Types.ObjectId, ref: "User", unique: true },
  dados: { type: Schema.Types.Mixed, default: {} }
}, { minimize: false }));

// Dossiê de leitura de um sujet: dois textos de referência (Wikipédia em francês, licença livre,
// com link e crédito) — montado na primeira abertura e guardado. Versão 2: um texto do eixo e dois do
// próprio tema (imprensa, artigo científico, livro), mais manchetes recentes.
const DossierSujetTCF = mongoose.model("DossierSujetTCF", new Schema({
  sujetId: { type: String, required: true, unique: true },
  tache: String,
  // tipo: eixo | noticia | cientifico | livro | enciclopedia
  textos: [{ tipo: String, rotulo: String, titulo: String, texto: String, autor: String, data: String, url: String, fonte: String, licenca: String, _id: false }],
  imprensa: [{ titulo: String, fonte: String, data: String, url: String, _id: false }],
  requete: String,
  versao: { type: Number, default: 1 },
  origem: String,
  criadoEm: { type: Date, default: Date.now }
}));

// Sala ao vivo: o aluno faz um sujet e chama um professor, que acompanha o texto (ou a fala
// transcrita) em tempo real, com o roteiro do tema, e pode falar com ele por voz.
const SalaAoVivoTCF = mongoose.model("SalaAoVivoTCF", new Schema({
  alunoId: { type: Schema.Types.ObjectId, ref: "User", index: true },
  courseType: String,
  tache: String,
  sujetId: String,
  titulo: String,
  status: { type: String, enum: ["aguardando", "atendimento", "encerrada"], default: "aguardando", index: true },
  // "expirou": ninguém aceitou em 3 minutos; "aluno" / "professor": quem encerrou
  motivoFim: String,
  professorId: { type: Schema.Types.ObjectId, ref: "User" },
  professorNome: String,
  texto: { type: String, default: "" },
  transcricao: { type: String, default: "" },
  mensagens: [{ de: String, texto: String, data: { type: Date, default: Date.now }, _id: false }],
  inicio: { type: Date, default: Date.now },
  atualizadoEm: { type: Date, default: Date.now }
}));

module.exports = {
  DossierSujetTCF, SalaAoVivoTCF,
  TACHES, ModeleIA, EpreuveTCF, SessaoTCF, DevoirTCF, CarnetProducao, TemaMesTCF, PostBlogTCF, AvisoTCF,
  MensagemTCF, CompetenciaTCF, CorrecaoIATCF, PartilhaTCF, CartaVocabTCF, ProgressoVocabTCF, ConfigModelesTCF, RecordeTCF
};
