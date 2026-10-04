const path = require("path");
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const cookieParser = require("cookie-parser");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const {
  cabecalhosSeguranca, sanitizarEntrada, parserQuerySeguro, bloquearTraversal,
  limitarTaxa, origensCors, tratadorErros
} = require("./middleware/seguranca");
const {
  iniciarMonitor, barrarIpsBloqueados, observarRespostas, detectarVarredura
} = require("./utils/monitorSeguranca");

// Sem segredo JWT qualquer token seria forjável — não sobe o servidor.
if (!process.env.JWT_SECRET) {
  console.error("JWT_SECRET não definido. Configure-o em backend/.env antes de iniciar.");
  process.exit(1);
}
if (process.env.JWT_SECRET.length < 32) {
  console.warn("Aviso: JWT_SECRET curto (< 32 caracteres). Use um segredo longo e aleatório.");
}

const app = express();
app.disable("x-powered-by");
// Atrás do proxy da hospedagem (Railway), req.ip precisa vir do X-Forwarded-For
// para o rate limiting funcionar por cliente e não pelo IP do proxy.
const trustProxy = process.env.TRUST_PROXY ?? (process.env.NODE_ENV === "production" ? "1" : "");
if (trustProxy) app.set("trust proxy", /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy);
app.set("query parser", parserQuerySeguro);

// Middlewares
// IP bloqueado pelo monitor de segurança é barrado antes de qualquer processamento.
app.use(barrarIpsBloqueados);
app.use(cabecalhosSeguranca);
app.use(observarRespostas);
app.use(detectarVarredura);
app.use(cors({ origin: origensCors(), credentials: true }));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: false, limit: "100kb" }));
app.use(cookieParser());
app.use("/api", bloquearTraversal);
app.use("/api", sanitizarEntrada);
// Sinal de presença (Gestão de Alunos → Acompanhamento): leve e frequente, com limite próprio para
// não consumir a cota geral da API (alunos atrás do mesmo IP de uma escola ou empresa).
app.use("/api/presenca", limitarTaxa({ nome: "presenca", janelaMs: 60 * 1000, max: 60 }), require("./routes/presenca"));
// Teto geral por IP para toda a API (as rotas sensíveis têm limites próprios, mais baixos).
// LIMITE_API_MIN muda o teto (padrão 300 pedidos por minuto); os testes automáticos usam um valor alto.
app.use("/api", limitarTaxa({ nome: "api", janelaMs: 60 * 1000, max: Number(process.env.LIMITE_API_MIN) || 300 }));

// Arquivos estáticos do site (index.html, login.html, cadastro.html, etc.)
app.use(express.static(path.join(__dirname, "../public")));

// Rotas
app.use("/api/auth", require("./routes/auth"));
// tradução do site para o francês (Configurações › Idioma): limitada por IP, com cache na base
app.use("/api/traducao", limitarTaxa({ nome: "traducao", janelaMs: 60 * 1000, max: 120 }), require("./routes/traducao"));
app.use("/api/pagamentos", require("./routes/pagamentos"));
app.use("/api/temas", require("./routes/temas"));
// Correção anotada (marcações, comentários, histórico, concluir/reabrir) antes das rotas gerais de produções.
const correcaoAnotada = require("./routes/correcaoAnotada");
app.use("/api/producoes", correcaoAnotada.producoes);
app.use("/api/correcao", correcaoAnotada.config);
app.use("/api/producoes", require("./routes/producoes"));
app.use("/api/admin", require("./routes/admin"));
app.use("/api/creditos", require("./routes/creditos"));
app.use("/api/equipe", require("./routes/equipe"));
app.use("/api/turmas", require("./routes/turmas"));
app.use("/api/disponibilidade", require("./routes/disponibilidade"));
app.use("/api/matricula", require("./routes/matricula"));
app.use("/api/cupons", require("./routes/cupons"));
app.use("/api/pagamento-matricula", require("./routes/pagamentoMatricula"));
app.use("/api/admin-matricula", require("./routes/matriculaAdmin"));
app.use("/api/aulas", require("./routes/aulas"));
app.use("/api/admin-aulas", require("./routes/adminAulas"));
// Registro de Aulas (Sistema de Aulas) antes da rota genérica /:modalidade/:periodo dos horários.
app.use("/api/horarios/admin/registro", require("./routes/registroAulas"));
app.use("/api/horarios", require("./routes/horarios"));
app.use("/api/reclamacoes", require("./routes/reclamacoes"));
app.use("/api/depoimentos", require("./routes/depoimentos"));
app.use("/api/deveres", require("./routes/deveres"));
app.use("/api/questoes", require("./routes/questoes"));
app.use("/api/meu-espaco", require("./routes/meuEspaco"));
app.use("/api/erros-questoes", require("./routes/errosQuestoes"));
app.use("/api/estudos", require("./routes/estudos"));
app.use("/api/flashcards", require("./routes/flashcards"));
app.use("/api/seguranca", require("./routes/seguranca"));
app.use("/api/financeiro", require("./routes/financeiro"));
app.use("/api/exercicios", require("./routes/exercicios"));
app.use("/api/simulados", require("./routes/simulados"));
app.use("/api/modeles", require("./routes/modeles"));

app.use("/api", (req, res) => {
  res.setHeader("X-Rota-Inexistente", "1"); // sinaliza ao monitor (sondagem de rotas)
  res.status(404).json({ msg: "Rota não encontrada." });
});
app.use(tratadorErros);

// Conexão MongoDB
// strictQuery: campos que não existem no schema são ignorados nos filtros.
mongoose.set("strictQuery", true);
iniciarMonitor();
mongoose.connect(process.env.MONGO_URI)
.then(() => {
  console.log("MongoDB conectado");
  // Temas do Ambiente de Produção versionados no repositório (backend/data/temas).
  require("./utils/sincronizarTemas").sincronizarTemas()
    .then(r => r.total && console.log(`Temas sincronizados: ${r.total} (${r.criados} novos, ${r.atualizados} atualizados)`))
    .catch(err => console.error("Erro ao sincronizar temas:", err.message));
})
.catch(err => console.log("Erro ao conectar ao MongoDB:", err.message));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Servidor rodando em http://localhost:${PORT}`));

// Falhas não tratadas viram registro (e alerta, se virarem pico) em vez de sumir.
process.on("unhandledRejection", err => {
  console.error("Promise rejeitada sem tratamento:", err);
  require("./utils/monitorSeguranca").registrar("erro_servidor", null, { erro: String(err?.message || err).slice(0, 300) });
});
