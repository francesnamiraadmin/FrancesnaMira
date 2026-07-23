// Peça central da Gestão de Alunos: junta as três fontes de "plano" que hoje
// vivem espalhadas (User.plano, User.produtosAvulsos e Matricula/Turma) num
// único array, para não duplicar a lógica de "está ativo?" entre a listagem
// (abas Ativos/Expirados) e o perfil completo do aluno (seção "Planos ativos").

const NOMES_AVULSOS = {
  plataforma: "Plataforma de Questões",
  producao: "Ambiente de Produção",
  aulasEspecializadas: "Aulas Especializadas"
};

function diasRestantes(dataVencimento) {
  if (!dataVencimento) return null;
  return Math.ceil((new Date(dataVencimento).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

// `matriculasTurma` = Matriculas do aluno já filtradas por status "confirmada",
// tipo "turma" e com turmaId populado (ver routes/equipe.js).
function obterPlanosDoAluno(user, matriculasTurma = []) {
  const planos = [];
  const agora = new Date();

  if (user.plano?.ativo && user.plano?.dataVencimento) {
    planos.push({
      nome: `${user.plano.curso || "Curso"} ${user.plano.tier || ""}`.trim(),
      tipo: "plano_curso",
      curso: user.plano.curso || null,
      dataInicio: user.plano.dataInicio || null,
      dataVencimento: user.plano.dataVencimento,
      tempoRestanteDias: diasRestantes(user.plano.dataVencimento),
      ativo: new Date(user.plano.dataVencimento) > agora
    });
  }

  Object.entries(user.produtosAvulsos || {}).forEach(([chave, dados]) => {
    if (!dados?.ativo || !dados?.dataVencimento) return;
    planos.push({
      nome: NOMES_AVULSOS[chave] || chave,
      tipo: "avulso",
      curso: null,
      dataInicio: null,
      dataVencimento: dados.dataVencimento,
      tempoRestanteDias: diasRestantes(dados.dataVencimento),
      ativo: new Date(dados.dataVencimento) > agora
    });
  });

  // Um plano por curso (modelo novo) — assinatura por tier e/ou Pack Prestige, os dois
  // podem estar ativos ao mesmo tempo pro mesmo curso.
  (user.planos || []).forEach(p => {
    if (p.ativo && p.dataVencimento) {
      planos.push({
        nome: `${p.courseType} ${p.tier || ""}`.trim(),
        tipo: "plano_curso",
        curso: p.courseType,
        dataInicio: p.dataInicio || null,
        dataVencimento: p.dataVencimento,
        tempoRestanteDias: diasRestantes(p.dataVencimento),
        ativo: new Date(p.dataVencimento) > agora
      });
    }
    if (p.packPrestige?.ativo && p.packPrestige?.dataVencimento) {
      planos.push({
        nome: `Pack Prestige ${p.courseType}`,
        tipo: "pack_prestige",
        curso: p.courseType,
        dataInicio: null,
        dataVencimento: p.packPrestige.dataVencimento,
        tempoRestanteDias: diasRestantes(p.packPrestige.dataVencimento),
        ativo: new Date(p.packPrestige.dataVencimento) > agora
      });
    }
  });

  // Grandfather do Pack Prestige avulso antigo (cross-curso) — mostrado sem curso
  // específico, igual ao avulso genérico acima, só que numa fonte congelada à parte.
  Object.entries(user.legado?.produtosAvulsos || {}).forEach(([chave, dados]) => {
    if (!dados?.ativo || !dados?.dataVencimento) return;
    planos.push({
      nome: `${NOMES_AVULSOS[chave] || chave} (legado)`,
      tipo: "avulso",
      curso: null,
      dataInicio: null,
      dataVencimento: dados.dataVencimento,
      tempoRestanteDias: diasRestantes(dados.dataVencimento),
      ativo: new Date(dados.dataVencimento) > agora
    });
  });

  matriculasTurma.forEach(m => {
    const turma = m.turmaId;
    if (!turma) return;
    planos.push({
      nome: `Turma ${turma.nome}`,
      tipo: "turma",
      curso: turma.tipoProva || turma.nivel || null,
      dataInicio: turma.dataInicio || null,
      dataVencimento: turma.dataFim || null,
      tempoRestanteDias: diasRestantes(turma.dataFim),
      ativo: turma.dataFim ? new Date(turma.dataFim) > agora : true
    });
  });

  return planos;
}

function alunoEstaAtivo(user, matriculasTurma = []) {
  return obterPlanosDoAluno(user, matriculasTurma).some(p => p.ativo);
}

module.exports = { obterPlanosDoAluno, alunoEstaAtivo, NOMES_AVULSOS };
