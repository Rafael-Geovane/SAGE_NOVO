# Relatórios e planos demonstrativos — 10/11/2026

Atualização: a análise por regras descrita abaixo continua disponível, e uma
integração real NVIDIA foi acrescentada em botão separado. Consulte
`nvidia-analysis.md`. A função já está publicada; falta a chave NVIDIA para
validar uma inferência real. As instruções de integração futura abaixo são
históricas e foram atendidas para esse provedor.

## Como apresentar

1. Entre na conta autorizada. O menu lateral reúne acompanhamento, relatórios,
   planos, conta e suporte. Administração aparece apenas para administradores.
2. Abra `/teste_colete` diretamente. A página permanece fora do menu. Carregue
   `SGE-067` e envie um dos dez cenários: leitura estável, possível queda,
   bateria baixa, repouso, movimento, pulso elevado, SpO₂ reduzida, sensor sem
   leitura, evento de teste ou recuperação.
3. Em `/relatorios`, escolha o colete e o primeiro dia de uma janela de sete
   dias, em UTC. O relatório inclui contagem diária, médias, mínimos, máximos,
   quantidade de valores válidos e eventos. Dados físicos e simulados são
   agrupados separadamente. O vínculo/atribuição atual delimita os dados.
4. Em `/planos`, experimente Essencial, Cuidado Plus ou SAGE Premium. O plano é
   salvo por conta no Supabase e permanece após atualizar a página.
5. Plus libera CSV e impressão. No diálogo de impressão do navegador, escolha
   salvar em PDF. Premium também libera a análise semanal demonstrativa.
6. Trocar para Essencial bloqueia exportações e a análise Premium no servidor.

## Demonstração da IA e cobrança

Conforme a escolha do usuário, os planos são demonstração para TCC e não há
provedor de IA disponível. O resumo Premium é produzido pela RPC
`demo_weekly_analysis` com regras determinísticas sobre os dados reais da
consulta: total de registros, dias com amostras, origem simulada, eventos de
queda reportada e ausência de dados. A interface identifica isso explicitamente.
Não há chamada de IA externa, diagnóstico, faturamento, cartão ou webhook de
pagamento. Os preços exibidos (R$ 0/39/79) são valores ilustrativos para o TCC.

A análise é solicitada pelo usuário para a janela semanal selecionada; não há
agendamento em segundo plano ou envio automático por e-mail.

Para ligar uma IA real futuramente, adicionar função de backend autenticada que
confira plano e vínculo, agregue a semana e envie somente os dados necessários
ao provedor escolhido. A chave deve existir exclusivamente no servidor. O
contrato de relatórios existente fornece os agregados para essa integração.
A seleção livre de planos por `select_demo_plan` é exclusiva do modo TCC;
cobrança real requer substituir essa ativação por um webhook autenticado.

## Segurança e banco

Migrations aplicadas no projeto Sage:

- `202611100002_reports_plans.sql`: assinatura demonstrativa por conta,
  relatório semanal, exportação e análise Premium.
- `202611100003_more_scenarios.sql`: cenários adicionais e identificação de
  retries por dispositivo/mensagem/cenário.

Não foram criados dados pessoais, cobradas assinaturas nem habilitados
agendamentos durante a publicação. As funções de simulação continuam exigindo
origem simulada, autorização, credencial, atribuição atual e consentimento
quando existe pessoa. O cadastro e a telemetria física permanecem separados.

As amostras ausentes são ignoradas nos cálculos numéricos, e cada métrica informa
a contagem utilizada. Sem amostras, não são inventadas médias. A janela aceita
até 366 dias no passado e cobre sete dias; o dia inicial é inclusivo e o final
exclusivo. CSV protege células interpretáveis como fórmulas. Impressão depende
do navegador.

## Verificações

- TypeScript e build aprovados.
- Suíte completa: 249 testes aprovados em 24 arquivos, sem testes ignorados.
- Testes SQL de autorização, cenários, replay, planos e agregações aprovados.
- Testes de CSV aprovados.
- Teste de navegador com fixtures aprovado: cenário adicional, navegação
  lateral, plano Premium persistido pela API simulada, resumo e download CSV.
- Screenshots: `docs/screenshots/plans-mobile.png`,
  `reports-mobile.png`, `reports-desktop.png`.
- Consulta de leitura remota autorizada para SGE-067: quatro grupos de métricas
  e dois grupos diários na semana consultada. Não foi gerado novo evento remoto.
