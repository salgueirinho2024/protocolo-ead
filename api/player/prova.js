// api/player/prova.js
//   GET  /api/player/prova?matricula_id=...  — devolve as perguntas da prova
//                                                final do treinamento (sem
//                                                gabarito) e se já houve
//                                                tentativa anterior
//   POST /api/player/prova                   — recebe as respostas, calcula
//                                                a nota no servidor (nunca
//                                                confia em nota vinda do
//                                                cliente), aprova/reprova e
//                                                gera certificado
const db = require('../../lib/db');
const { exigirAuth } = require('../../lib/auth');
const { aplicarCors, metodoPermitido, validarEnv } = require('../../lib/http');
const { gerarCertificadoPDF } = require('../../lib/certificado');

async function minhaMatricula(matriculaId, funcionarioId) {
  const { rows } = await db.query(
    `SELECT m.id, m.treinamento_id, m.status, m.nota_prova_final, m.segundos_assistidos_total,
            t.nota_minima_prova, t.carga_horaria_min
       FROM matriculas m
       JOIN treinamentos t ON t.id = m.treinamento_id
      WHERE m.id = $1 AND m.funcionario_id = $2`,
    [matriculaId, funcionarioId]
  );
  return rows[0] || null;
}

// BUG CORRIGIDO #5: a liberação da prova comparava segundos_assistidos_total
// (soma bruta de tempo assistido) com carga_horaria_min * 60 — mas
// carga_horaria_min é um número digitado manualmente pelo admin no cadastro
// do treinamento (padrão 60min), sem nenhuma relação com a duração real dos
// vídeos dos módulos. Resultado: o aluno assistia 100% de todos os módulos
// (cada um marcado concluido=true), mas a prova continuava bloqueada porque
// o total assistido nunca batia com aquele número solto da carga horária.
// Agora a liberação é feita checando se TODOS os módulos do treinamento
// estão com concluido=true em matricula_modulo_progresso, que é o dado que
// realmente reflete o progresso do aluno.
async function todosModulosConcluidos(treinamentoId, matriculaId) {
  const { rows } = await db.query(
    `SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE mp.concluido) AS concluidos
       FROM treinamento_modulos mod
       LEFT JOIN matricula_modulo_progresso mp
              ON mp.modulo_id = mod.id AND mp.matricula_id = $2
      WHERE mod.treinamento_id = $1`,
    [treinamentoId, matriculaId]
  );
  const { total, concluidos } = rows[0] || { total: 0, concluidos: 0 };
  return Number(total) > 0 && Number(total) === Number(concluidos);
}

async function handleGet(req, res, user) {
  const matriculaId = (req.query.matricula_id || '').toString().trim();
  if (!matriculaId) {
    return res.status(400).json({ erro: 'matricula_id é obrigatório.' });
  }

  const mat = await minhaMatricula(matriculaId, user.id);
  if (!mat) return res.status(403).json({ erro: 'Matrícula não encontrada.' });

  if (!(await todosModulosConcluidos(mat.treinamento_id, mat.id))) {
    return res.status(422).json({ erro: 'Assista todos os módulos até o fim antes de realizar a prova.' });
  }

  const { rows: perguntas } = await db.query(
    `SELECT id, pergunta, opcoes, ordem
       FROM treinamento_perguntas
      WHERE treinamento_id = $1
      ORDER BY ordem ASC`,
    [mat.treinamento_id]
  );

  if (!perguntas.length) {
    return res.status(404).json({ erro: 'Este treinamento ainda não possui prova final cadastrada. Contate o administrador.' });
  }

  // BUG CORRIGIDO #1: opcoes vem como JSONB do banco — garantir que é array JS
  // (Neon/pg devolve JSONB já parseado, mas dependendo da versão do driver
  // pode chegar como string. Normalizamos aqui para o frontend não quebrar.)
  const perguntasNormalizadas = perguntas.map(p => ({
    ...p,
    opcoes: Array.isArray(p.opcoes) ? p.opcoes : JSON.parse(p.opcoes),
  }));

  res.json({
    perguntas: perguntasNormalizadas,
    nota_minima: mat.nota_minima_prova,
    tentativa_anterior: mat.nota_prova_final,
  });
}

async function handlePost(req, res, user) {
  const { matricula_id, respostas } = req.body || {};
  if (!matricula_id || !Array.isArray(respostas)) {
    return res.status(400).json({ erro: 'matricula_id e respostas (array) são obrigatórios.' });
  }

  const mat = await minhaMatricula(matricula_id, user.id);
  if (!mat) return res.status(403).json({ erro: 'Matrícula não encontrada.' });

  // BUG CORRIGIDO #2: Bloquear envio se já foi concluído (aprovado).
  // Sem esse bloqueio, aluno aprovado poderia reenviar a prova via POST
  // direto e sobrescrever o certificado desnecessariamente.
  if (mat.status === 'concluido') {
    return res.status(409).json({
      erro: 'Este treinamento já foi concluído. Não é possível refazer a prova.',
      aprovado: true,
      nota: mat.nota_prova_final,
    });
  }

  if (!(await todosModulosConcluidos(mat.treinamento_id, mat.id))) {
    return res.status(422).json({ erro: 'Assista todos os módulos até o fim antes de realizar a prova.' });
  }

  const { rows: perguntas } = await db.query(
    `SELECT id, resposta_correta
       FROM treinamento_perguntas
      WHERE treinamento_id = $1
      ORDER BY ordem ASC`,
    [mat.treinamento_id]
  );

  if (!perguntas.length) {
    return res.status(404).json({ erro: 'Este treinamento ainda não possui prova final cadastrada. Contate o administrador.' });
  }
  if (respostas.length !== perguntas.length) {
    return res.status(400).json({ erro: `Esperado ${perguntas.length} respostas, recebido ${respostas.length}.` });
  }

  // BUG CORRIGIDO #3: Comparação de tipo — respostas[i] vem do JSON como number,
  // mas pode chegar como string dependendo do body parser. p.resposta_correta
  // vem do banco como SMALLINT (number). Forçar Number() em ambos os lados
  // garante que a comparação funciona em qualquer caso.
  // Antes: Number(respostas[i]) === p.resposta_correta
  //   → p.resposta_correta era comparado sem conversão explícita,
  //     e se o banco devolver string (ex: driver antigo), sempre daria 0 acertos.
  const acertos = perguntas.reduce(
    (total, p, i) => total + (Number(respostas[i]) === Number(p.resposta_correta) ? 1 : 0),
    0
  );
  const notaNum = Math.round((acertos / perguntas.length) * 100);
  const aprovado = notaNum >= mat.nota_minima_prova;
  const novoStatus = aprovado ? 'concluido' : 'reprovado';

  // BUG CORRIGIDO #4: Usar RETURNING para obter o concluido_em real que o banco
  // gravou. Antes, o UPDATE não retornava nada, e gerarCertificadoPDF fazia
  // um SELECT separado que podia pegar concluido_em = NULL em situação de
  // race condition (principalmente em Vercel Functions com múltiplas instâncias).
  // Agora passamos o timestamp do RETURNING diretamente para o gerador.
  const { rows: updRows } = await db.query(
    `UPDATE matriculas
        SET nota_prova_final = $2,
            status = $3::progresso_status,
            concluido_em = CASE WHEN $3::progresso_status = 'concluido' THEN now() ELSE NULL END
      WHERE id = $1
      RETURNING concluido_em`,
    [matricula_id, notaNum, novoStatus]
  );

  let certificado = null;
  if (aprovado) {
    // Atenção (deploy Vercel): geração de PDF com Chromium pode levar alguns
    // segundos. Garanta maxDuration suficiente no vercel.json para esta rota
    // (plano Hobby tem limite de 10s por padrão; Pro permite até 60s+).
    certificado = await gerarCertificadoPDF(matricula_id, user.id, updRows[0]?.concluido_em);
  }

  res.json({ aprovado, nota: notaNum, acertos, total: perguntas.length, nota_minima: mat.nota_minima_prova, certificado });
}

module.exports = async (req, res) => {
  if (aplicarCors(req, res)) return;
  if (!validarEnv(res)) return;
  if (!metodoPermitido(req, res, 'GET', 'POST')) return;

  const user = exigirAuth(req, res, 'funcionario');
  if (!user) return;

  try {
    if (req.method === 'GET') return await handleGet(req, res, user);
    return await handlePost(req, res, user);
  } catch (err) {
    console.error(err);
    // DEBUG_ERRORS=1 nas env vars da Vercel: devolve a causa real do erro na
    // resposta, só pra diagnosticar. Tirar essa variável depois de resolver
    // (não deixar ligada em produção — pode vazar detalhe interno).
    const detalhe = process.env.DEBUG_ERRORS ? `: ${err.message}` : '';
    res.status(500).json({ erro: `Erro ao processar a prova${detalhe}.` });
  }
};
