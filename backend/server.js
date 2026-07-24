const path = require("path");
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const cookieParser = require("cookie-parser");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const app = express();

// Middlewares
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());

// Arquivos estáticos do site (index.html, login.html, cadastro.html, etc.)
app.use(express.static(path.join(__dirname, "../public")));

// Rotas
app.use("/api/auth", require("./routes/auth"));
app.use("/api/pagamentos", require("./routes/pagamentos"));
app.use("/api/temas", require("./routes/temas"));
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
app.use("/api/horarios", require("./routes/horarios"));
app.use("/api/reclamacoes", require("./routes/reclamacoes"));
app.use("/api/depoimentos", require("./routes/depoimentos"));
app.use("/api/deveres", require("./routes/deveres"));
app.use("/api/questoes", require("./routes/questoes"));
app.use("/api/erros-questoes", require("./routes/errosQuestoes"));
app.use("/api/estudos", require("./routes/estudos"));

// Conexão MongoDB
mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("MongoDB conectado"))
.catch(err => console.log("Erro ao conectar ao MongoDB:", err.message));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Servidor rodando em http://localhost:${PORT}`));