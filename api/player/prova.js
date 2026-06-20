// api/player/prova.js — POST /api/player/prova — salva nota da prova final, aprova/reprova e gera certificado
const db = require('../../lib/db');
const { exigirAuth } = require('../../lib/auth');
const { aplicarCors, metodoPermitido, validarEnv } = require('../../lib/http');
const { gerarCertificadoPDF } = require('../../lib/certificado');

async function minhaMatricula(matriculaId, funcionarioId) {
  const { rows } = await db.query(
    `SELECT id FROM matriculas WHERE id = $1 AND funcionario_id = $2`,
    [matriculaId, funcionarioId]
  );
  return rows[0] || null;
}

module.exports = async (req, res) => {
  if (aplicarCors(req, res)) return;
  if (!validarEnv(res)) return;
  if (!metodoPermitido(req, res, 'POST')) return;

  const user = exigirAuth(req, res, 'funcionario');
  if (!user) return;

  const { matricula_id, nota } = req.body || {};
  if (!matricula_id || nota === undefined) {
    return res.status(400).json({ erro: 'matricula_id e nota são obrigatórios.' });
  }

  const notaNum = Math.min(100, Math.max(0, parseInt(nota) || 0));

  try {
    const mat = await minhaMatricula(matricula_id, user.id);
    if (!mat) return res.status(403).json({ erro: 'Matrícula não encontrada.' });

    const { rows: tRows } = await db.query(
      `SELECT t.nota_minima_prova, t.carga_horaria_min, m.segundos_assistidos_total
         FROM matriculas m
         JOIN treinamentos t ON t.id = m.treinamento_id
        WHERE m.id = $1`,
      [matricula_id]
    );
    const { nota_minima_prova, carga_horaria_min, segundos_assistidos_total } = tRows[0];
    const cargaExigidaSegs = carga_horaria_min * 60;

    if (segundos_assistidos_total < cargaExigidaSegs * 0.95) {
      return res.status(422).json({ erro: 'Carga horária não completada. Assista todos os módulos antes de realizar a prova.' });
    }

    const aprovado = notaNum >= nota_minima_prova;
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

    res.json({ aprovado, nota: notaNum, nota_minima: nota_minima_prova, certificado });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao registrar prova.' });
  }
};
