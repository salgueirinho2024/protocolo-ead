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

async function handleGet(req, res, user) {
  const matriculaId = (req.query.matricula_id || '').toString();
  if (!matriculaId) {
    return res.status(400).json({ erro: 'matricula_id é obrigatório.' });
  }

  const mat = await minhaMatricula(matriculaId, user.id);
  if (!mat) return res.status(403).json({ erro: 'Matrícula não encontrada.' });

  const cargaExigidaSegs = mat.carga_horaria_min * 60;
  if (mat.segundos_assistidos_total < cargaExigidaSegs * 0.95) {
    return res.status(422).json({ erro: 'Carga horária não completada. Assista todos os módulos antes de realizar a prova.' });
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

  res.json({
    perguntas,
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

  const cargaExigidaSegs = mat.carga_horaria_min * 60;
  if (mat.segundos_assistidos_total < cargaExigidaSegs * 0.95) {
    return res.status(422).json({ erro: 'Carga horária não completada. Assista todos os módulos antes de realizar a prova.' });
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

  // Nota é sempre calculada no servidor a partir do gabarito — nunca
  // confiamos em uma nota enviada pelo cliente.
  const acertos = perguntas.reduce(
    (total, p, i) => total + (Number(respostas[i]) === p.resposta_correta ? 1 : 0),
    0
  );
  const notaNum = Math.round((acertos / perguntas.length) * 100);
  const aprovado = notaNum >= mat.nota_minima_prova;
  const novoStatus = aprovado ? 'concluido' : 'reprovado';

  await db.query(
    `UPDATE matriculas
        SET nota_prova_final = $2, status = $3, concluido_em = CASE WHEN $3 = 'concluido' THEN now() ELSE NULL END
      WHERE id = $1`,
    [matricula_id, notaNum, novoStatus]
  );

  let certificado = null;
  if (aprovado) {
    // Atenção (deploy Vercel): geração de PDF com Chromium pode levar alguns
    // segundos. Garanta maxDuration suficiente no vercel.json para esta rota
    // (plano Hobby tem limite de 10s por padrão; Pro permite até 60s+).
    certificado = await gerarCertificadoPDF(matricula_id, user.id);
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
    res.status(500).json({ erro: 'Erro ao processar a prova.' });
  }
};
