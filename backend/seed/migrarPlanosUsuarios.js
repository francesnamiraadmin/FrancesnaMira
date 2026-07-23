// =====================================================================
// MIGRAÇÃO ÚNICA — copia `User.plano` (objeto único, sobrescrito a cada
// compra) para `User.planos[]` (um plano por curso, vários simultâneos) e
// congela `User.produtosAvulsos` (Pack Prestige avulso antigo, cross-curso)
// em `User.legado.produtosAvulsos`, que passa a ser a única fonte lida pelo
// middleware de acesso para clientes antigos — ver backend/middleware/acessoCurso.js.
//
// Não apaga nem sobrescreve `plano`/`produtosAvulsos` — eles ficam no banco
// como histórico inerte. Idempotente: rodar de novo não duplica nada nem
// altera o que já foi migrado.
//
// Uso:
//   node backend/seed/migrarPlanosUsuarios.js --dry-run   (só loga, não grava)
//   node backend/seed/migrarPlanosUsuarios.js             (grava de verdade)
// =====================================================================
require("dotenv").config({ path: __dirname + "/../.env" });
const mongoose = require("mongoose");
const User = require("../models/user");
const { TIPOS_CURSO } = require("../utils/tiposCurso");

const DRY_RUN = process.argv.includes("--dry-run");

function produtosAvulsosIguais(a, b) {
  const norm = x => JSON.stringify({
    plataforma: { ativo: !!x?.plataforma?.ativo, dataVencimento: x?.plataforma?.dataVencimento || null },
    producao: { ativo: !!x?.producao?.ativo, dataVencimento: x?.producao?.dataVencimento || null },
    aulasEspecializadas: { ativo: !!x?.aulasEspecializadas?.ativo, dataVencimento: x?.aulasEspecializadas?.dataVencimento || null }
  });
  return norm(a) === norm(b);
}

function temProdutoAvulsoAtivo(produtosAvulsos) {
  return !!(produtosAvulsos?.plataforma?.ativo || produtosAvulsos?.producao?.ativo || produtosAvulsos?.aulasEspecializadas?.ativo);
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log(DRY_RUN ? "=== DRY RUN — nenhuma escrita será feita ===" : "=== EXECUÇÃO REAL — gravando no banco ===");

  const usuarios = await User.find({
    $or: [
      { "plano.ativo": true },
      { "produtosAvulsos.plataforma.ativo": true },
      { "produtosAvulsos.producao.ativo": true },
      { "produtosAvulsos.aulasEspecializadas.ativo": true }
    ]
  });

  let migradosPlano = 0, jaTinhamPlano = 0, naoMigraveis = 0, legadoCopiado = 0, legadoJaIgual = 0;

  for (const user of usuarios) {
    let mudou = false;

    if (user.plano?.ativo) {
      const curso = user.plano.curso;
      if (TIPOS_CURSO.includes(curso)) {
        const jaExiste = user.planos.some(p => p.courseType === curso);
        if (jaExiste) {
          jaTinhamPlano++;
        } else {
          console.log(`[planos] ${user.email}: +${curso} (tier=${user.plano.tier || "—"})`);
          if (!DRY_RUN) {
            user.planos.push({
              courseType: curso,
              tier: user.plano.tier || null,
              ativo: user.plano.ativo,
              metodoPagamento: user.plano.metodoPagamento,
              cartaoFinal: user.plano.cartaoFinal,
              autoRenovacao: user.plano.autoRenovacao,
              dataInicio: user.plano.dataInicio,
              dataVencimento: user.plano.dataVencimento
            });
          }
          migradosPlano++;
          mudou = true;
        }
      } else {
        console.log(`[não migrável] ${user.email}: plano.curso="${curso}" não bate com nenhum dos 8 códigos — mantido só em User.plano`);
        naoMigraveis++;
      }
    }

    if (temProdutoAvulsoAtivo(user.produtosAvulsos)) {
      if (produtosAvulsosIguais(user.legado?.produtosAvulsos, user.produtosAvulsos)) {
        legadoJaIgual++;
      } else {
        console.log(`[legado] ${user.email}: copiando produtosAvulsos para legado.produtosAvulsos`);
        if (!DRY_RUN) user.legado.produtosAvulsos = user.produtosAvulsos;
        legadoCopiado++;
        mudou = true;
      }
    }

    if (mudou && !DRY_RUN) await user.save();
  }

  console.log("\n--- Resumo ---");
  console.log(`Usuários avaliados: ${usuarios.length}`);
  console.log(`Planos migrados para planos[]: ${migradosPlano}`);
  console.log(`Já tinham a entrada em planos[] (nada feito): ${jaTinhamPlano}`);
  console.log(`plano.curso fora do enum (não migrável automaticamente): ${naoMigraveis}`);
  console.log(`legado.produtosAvulsos copiado/atualizado: ${legadoCopiado}`);
  console.log(`legado.produtosAvulsos já estava igual (nada feito): ${legadoJaIgual}`);

  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch(err => { console.error(err); process.exit(1); });
}
