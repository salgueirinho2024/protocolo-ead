module.exports = {
  numero: 1,
  slug: 'introducao-seguranca-trabalho',
  titulo: 'Introdução, Objetivos, Responsabilidades e Segurança no Trabalho',
  subtitulo: 'Por que você está fazendo este curso, o que a lei espera da empresa e o que ela espera de **você**.',
  chips: ['NR-1', 'CLT arts. 157 e 158', 'Treinamento inicial'],
  // Vídeo candidato (ainda NÃO verificado: canal e duração precisam ser conferidos).
  video: { id: 'rgDvziBI0WA', titulo: 'Introdução à Segurança do Trabalho', canal: null, duracao_segundos: null, verificado: false },
  objetivos: [
    'Explicar por que o treinamento de integração é obrigatório e quando ele deve acontecer.',
    'Definir segurança e saúde no trabalho e seu objetivo principal.',
    'Listar as responsabilidades do empregador e as do trabalhador.',
    'Saber o que fazer diante de uma situação de risco grave e iminente.',
  ],
  secoes: [
    {
      titulo: 'Introdução: por que esta integração existe',
      blocos: [
        { tipo: 'p', texto: 'Todo trabalhador que entra numa empresa precisa conhecer, **antes de começar a trabalhar**, os riscos que existem no ambiente e na sua função, como se proteger deles e o que fazer numa emergência. Esse é o sentido do treinamento de integração (também chamado de treinamento inicial ou admissional).' },
        { tipo: 'p', texto: 'A base legal está na **NR-1 (Disposições Gerais e Gerenciamento de Riscos Ocupacionais)**. O item 1.7 determina que o empregador promova a capacitação e o treinamento dos trabalhadores, e que o treinamento inicial ocorra antes de o trabalhador iniciar suas funções, ou no prazo que a NR específica da atividade definir.' },
        { tipo: 'cards', itens: [
          { titulo: 'Inicial', texto: 'Antes de começar a trabalhar. É o caso deste curso.' },
          { titulo: 'Periódico', texto: 'Repetido nos intervalos que cada norma define, para atualizar e reforçar.' },
          { titulo: 'Eventual', texto: 'Quando há mudança de função, de processo ou de risco, ou depois de um acidente.' },
        ] },
        { tipo: 'callout', titulo: 'É tempo de trabalho', texto: 'O tempo gasto em treinamentos previstos nas Normas Regulamentadoras conta como trabalho efetivo e não pode ser descontado do seu salário. O custo do treinamento é do empregador.' },
      ],
    },
    {
      titulo: 'Objetivos do treinamento',
      blocos: [
        { tipo: 'ul', itens: [
          '**Informar** os riscos ocupacionais existentes nos locais de trabalho e na sua atividade.',
          '**Ensinar** os meios de prevenir e controlar esses riscos e as medidas que a empresa já adota.',
          '**Orientar** sobre os procedimentos em situações de emergência e sobre como comunicar problemas.',
          '**Formalizar** que você recebeu essas informações: ao final, é emitido um certificado com nome, conteúdo programático, carga horária, data, local e responsável técnico.',
        ] },
        { tipo: 'p', texto: 'No fim das contas, o objetivo é um só: que você volte para casa **inteiro e saudável**, todos os dias.' },
      ],
    },
    {
      titulo: 'O que é segurança e saúde no trabalho',
      blocos: [
        { tipo: 'p', texto: 'Segurança e saúde no trabalho é o conjunto de medidas e comportamentos adotados para **prevenir acidentes do trabalho e doenças ocupacionais**, protegendo a integridade física e mental de quem trabalha.' },
        { tipo: 'p', texto: 'A Constituição Federal (art. 7º, inciso XXII) garante ao trabalhador a redução dos riscos inerentes ao trabalho, por meio de normas de saúde, higiene e segurança. As Normas Regulamentadoras (NR) detalham como isso deve ser feito na prática.' },
        { tipo: 'h3', texto: 'Qual medida vem primeiro?' },
        { tipo: 'p', texto: 'A NR-1 estabelece uma ordem de prioridade para as medidas de prevenção. O EPI, que você vai estudar em módulo próprio, é importante, mas é o **último** recurso, não o primeiro:' },
        { tipo: 'ol', itens: [
          '**Eliminar** o fator de risco.',
          '**Minimizar e controlar** o risco com medidas de proteção coletiva (por exemplo, proteção de máquinas, ventilação, guarda-corpo).',
          '**Medidas administrativas** e de organização do trabalho (procedimentos, sinalização, treinamentos, revezamentos).',
          '**Proteção individual** (EPI), quando as anteriores não bastam ou enquanto estão sendo implantadas.',
        ] },
      ],
    },
    {
      titulo: 'Responsabilidades da empresa (empregador)',
      blocos: [
        { tipo: 'p', texto: 'Segurança é obrigação da empresa antes de ser obrigação do trabalhador. Pela NR-1 (item 1.4.1) e pela CLT (art. 157), cabe ao empregador, entre outras coisas:' },
        { tipo: 'ul', itens: [
          'Cumprir e fazer cumprir as normas de segurança e saúde no trabalho.',
          'Gerenciar os riscos ocupacionais do ambiente (identificar, avaliar e controlar).',
          '**Informar** os trabalhadores sobre os riscos ocupacionais e as medidas de prevenção.',
          'Elaborar **ordens de serviço** de segurança e saúde, dando ciência aos trabalhadores.',
          'Fornecer, gratuitamente, os **EPI** adequados ao risco, em perfeito estado de conservação.',
          'Promover os treinamentos e os exames médicos exigidos.',
          'Definir procedimentos para casos de acidente e emergência.',
          'Permitir que representantes dos trabalhadores acompanhem a fiscalização.',
        ] },
      ],
    },
    {
      titulo: 'Responsabilidades do trabalhador',
      blocos: [
        { tipo: 'p', texto: 'Pela NR-1 (item 1.4.2) e pela CLT (art. 158), cabe a **você**:' },
        { tipo: 'ul', itens: [
          'Cumprir as normas de segurança e as ordens de serviço da empresa.',
          'Usar corretamente o EPI fornecido e conservá-lo.',
          'Submeter-se aos exames médicos previstos.',
          'Colaborar com a empresa na aplicação das normas de segurança e saúde.',
          'Comunicar ao superior qualquer situação que considere de risco para a sua segurança e a dos colegas.',
        ] },
        { tipo: 'callout', variante: 'atencao', titulo: 'Recusar não é opção', texto: 'A CLT (art. 158, parágrafo único) considera ato faltoso a recusa injustificada a seguir as instruções de segurança da empresa e a usar o EPI fornecido. Isso pode gerar sanções disciplinares, inclusive demissão por justa causa, conforme a gravidade e a reincidência.' },
      ],
    },
    {
      titulo: 'Risco grave e iminente: você pode (e deve) interromper',
      blocos: [
        { tipo: 'p', texto: 'Se você identificar uma situação que represente risco grave e iminente para a vida ou a saúde, ou seja, algo que pode causar um acidente sério a qualquer momento, a NR-1 (item 1.4.3) garante que você **interrompa a atividade** e **informe imediatamente o seu superior hierárquico**. A atividade só pode ser retomada depois que o risco for eliminado ou controlado.' },
        { tipo: 'callout', variante: 'perigo', titulo: 'Na dúvida, pare e avise', texto: 'Interromper uma tarefa por um risco real não é falta de produtividade nem insubordinação: é um direito seu e um dever com a sua equipe.' },
      ],
    },
    {
      titulo: 'Segurança é de todos',
      blocos: [
        { tipo: 'p', texto: 'A empresa organiza, treina e fornece os meios; o trabalhador aplica no dia a dia; a liderança dá o exemplo. Onde existirem, a **CIPA** (Comissão Interna de Prevenção de Acidentes) e o **SESMT** (Serviços Especializados em Engenharia de Segurança e em Medicina do Trabalho) são canais para tirar dúvidas e levar sugestões e relatos de risco.' },
        { tipo: 'ul', itens: [
          'Conheça as rotas de fuga, os extintores e os pontos de encontro do seu setor logo no primeiro dia.',
          'Pergunte antes de executar uma tarefa que você não conhece.',
          'Relate quase-acidentes: eles mostram onde o próximo acidente pode acontecer.',
          'Cuide dos colegas: avise quando vir uma prática insegura.',
        ] },
      ],
    },
  ],
  resumo: [
    'O treinamento inicial é obrigatório e deve ocorrer **antes** de você começar a trabalhar.',
    'Ele é feito dentro da jornada, conta como tempo de trabalho e é pago pelo empregador.',
    'A empresa deve gerenciar os riscos, informar, treinar e fornecer o EPI; você deve cumprir as regras e usar o EPI corretamente.',
    'Em risco grave e iminente, interrompa a atividade e avise o superior imediatamente.',
    'EPI é a última linha de defesa, não a primeira.',
  ],
  base: [
    'NR-1: itens 1.4 (responsabilidades), 1.5 (gerenciamento de riscos) e 1.7 (capacitação e treinamento).',
    'CLT: arts. 157 e 158.',
    'Constituição Federal: art. 7º, inciso XXII.',
  ],
};
