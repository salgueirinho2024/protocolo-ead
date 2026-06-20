// api/empresa/contratos/[id]/funcionarios/[fId].js
//   DELETE /api/empresa/contratos/:id/funcionarios/:fId — remove funcionário (só se ainda não iniciou)
const db = require('../../../../../lib/db');
const { exigirAuth } = require('../../../../../lib/auth');
const { aplicarCors, metodoPermitido, validarEnv } = require('../../../../../lib/http');

module.exports = async (req, res) => {
  if (aplicarCors(req, res)) return;
  if (!validarEnv(res)) return;
  if (!metodoPermitido(req, res, 'DELETE')) return;

  const user = exigirAuth(req, res, 'empresa_admin');
  if (!user) return;

  const { fId } = req.query;

  try {
    const { rows } = await db.query(
      `SELECT m.status, c.empresa_id
         FROM funcionarios_contrato fc
         JOIN contratos c ON c.id = fc.contrato_id
         LEFT JOIN matriculas m ON m.funcionario_id = fc.id
        WHERE fc.id = $1`,
      [fId]
    );

    if (!rows[0] || rows[0].empresa_id !== user.empresaId) {
      return res.status(404).json({ erro: 'Funcionário não encontrado.' });
    }
    if (rows[0].status && rows[0].status !== 'nao_iniciado') {
      return res.status(422).json({ erro: 'Não é possível remover quem já iniciou o treinamento.' });
    }

    await db.query(`DELETE FROM funcionarios_contrato WHERE id = $1`, [fId]);
    res.json({ mensagem: 'Removido com sucesso.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao remover funcionário.' });
  }
};
