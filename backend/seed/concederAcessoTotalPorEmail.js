// =====================================================================
// Concede acesso Excellence (todos os módulos: plataforma, aulas, produção)
// em TODOS os 8 cursos (TIPOS_CURSO) para uma conta específica, identificada
// por e-mail. Não mexe em `plano`/`produtosAvulsos` (campos depreciados) nem
// em contas de outros usuários — só grava/atualiza `planos[]` do e-mail alvo.
//
// Idempotente: rodar de novo não duplica entradas, só garante tier=Excellence
// e ativo=true em cada uma das 8.
//
// Uso:
//   node backend/seed/concederAcessoTotalPorEmail.js <email> --dry-run   (só loga)
//   node backend/seed/concederAcessoTotalPorEmail.js <email>             (grava)
// =====================================================================
require("dotenv").config({ path: __dirname + "/../.env" });
const mongoose = require("mongoose");
const User = require("../models/user");
const { TIPOS_CURSO } = require("../utils/tiposCurso");

const DRY_RUN = process.argv.includes("--dry-run");
const email = process.argv[2];

async function main() {
  if (!email || email.startsWith("--")) {
    console.error("Uso: node backend/seed/concederAcessoTotalPorEmail.js <email> [--dry-run]");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log(DRY_RUN ? "=== DRY RUN — nenhuma escrita será feita ===" : "=== EXECUÇÃO REAL — gravando no banco ===");

  const user = await User.findOne({ email });
  if (!user) {
    console.error(`Usuário não encontrado: ${email}`);
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log(`Usuário encontrado: ${user.nome} <${user.email}> (id=${user._id})`);

  let alterados = 0, jaOk = 0;

  for (const courseType of TIPOS_CURSO) {
    let plano = user.planos.find(p => p.courseType === courseType);
    if (plano && plano.tier === "Excellence" && plano.ativo) {
      jaOk++;
      continue;
    }

    console.log(`[planos] ${courseType}: ${plano ? "atualizando para" : "criando"} tier=Excellence, ativo=true`);
    if (!DRY_RUN) {
      if (plano) {
        plano.tier = "Excellence";
        plano.ativo = true;
      } else {
        user.planos.push({ courseType, tier: "Excellence", ativo: true });
      }
    }
    alterados++;
  }

  if (!DRY_RUN && alterados > 0) await user.save();

  console.log("\n--- Resumo ---");
  console.log(`Cursos atualizados/criados: ${alterados}`);
  console.log(`Cursos que já estavam Excellence/ativo: ${jaOk}`);

  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch(err => { console.error(err); process.exit(1); });
}
