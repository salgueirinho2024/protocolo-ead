// lib/periodoTreinamento.js
//
// Antes, cada TREINAMENTO tinha uma data_inicio/data_fim fixa, cadastrada
// pelo super admin na hora de criar o treinamento. Isso impedia deixar um
// treinamento pronto e disponibilizá-lo para várias empresas diferentes,
// já que a "vigência" era a mesma para todo mundo.
//
// Agora o período (início/fim) é calculado individualmente para CADA
// FUNCIONÁRIO, a partir de:
//   - quando ELE começou de fato o treinamento (matriculas.iniciado_em);
//   - a carga horária do treinamento (carga_horaria_min), dividida em
//     blocos de 8 horas por dia (jornada padrão).
//
// Exemplo: treinamento de 16h, funcionário iniciou numa segunda-feira =>
// carga_horaria_min / 480 = 2 dias => data_inicio = segunda, data_fim = terça.
const MINUTOS_POR_DIA = 8 * 60; // 480 minutos = 1 dia de treinamento

/**
 * Calcula o período (data_inicio/data_fim) de um treinamento para um
 * funcionário específico.
 *
 * @param {Date|string|null} iniciadoEm - matriculas.iniciado_em (quando o
 *        funcionário deu o primeiro play em algum módulo)
 * @param {number} cargaHorariaMin - treinamentos.carga_horaria_min
 * @returns {{data_inicio: Date|null, data_fim: Date|null, dias_estimados: number|null}}
 */
function calcularPeriodoTreinamento(iniciadoEm, cargaHorariaMin) {
  if (!iniciadoEm || !cargaHorariaMin) {
    return { data_inicio: null, data_fim: null, dias_estimados: null };
  }
  const dias = Math.max(1, Math.ceil(cargaHorariaMin / MINUTOS_POR_DIA));
  const dataInicio = new Date(iniciadoEm);
  const dataFim = new Date(dataInicio);
  dataFim.setDate(dataFim.getDate() + (dias - 1));
  return { data_inicio: dataInicio, data_fim: dataFim, dias_estimados: dias };
}

/** Mesma coisa, mas já devolve as datas formatadas em pt-BR (ou null). */
function calcularPeriodoTreinamentoFormatado(iniciadoEm, cargaHorariaMin) {
  const { data_inicio, data_fim, dias_estimados } = calcularPeriodoTreinamento(iniciadoEm, cargaHorariaMin);
  return {
    data_inicio: data_inicio ? data_inicio.toLocaleDateString('pt-BR') : null,
    data_fim: data_fim ? data_fim.toLocaleDateString('pt-BR') : null,
    dias_estimados,
  };
}

module.exports = { calcularPeriodoTreinamento, calcularPeriodoTreinamentoFormatado, MINUTOS_POR_DIA };
