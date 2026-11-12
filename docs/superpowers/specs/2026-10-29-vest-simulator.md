# Teste local SGE-001

Pedido: valores aleatorios a cada 3 segundos e botoes de teste para acompanhar
o colete. Destino exclusivo: `site novo`. Preservar o pareamento e a ativacao
adicionados desde a ultima auditoria, sem alterar as migrations existentes.

Decisao conservadora: simulacao local identificada, sem escrever no Supabase,
sem cadastrar pessoa ficticia e sem credenciais de dispositivo. A pagina publica
`/teste-colete` permite experimentar independentemente do login/cadastro real.
Links na area de acompanhamento e administracao tornam o teste descobrivel.

O motor isolado gera payloads v1 sinteticos para SGE-001. Atualizacao nominal
3000 ms, com iniciar/pausar, amostra manual, evento de teste/queda simulada,
bateria de teste, desconexao/reconexao, campos parciais e reinicio. Limites de
30 leituras e 20 eventos em memoria. Navegar para fora encerra o temporizador.

A pagina mostra ultima amostra, quatro metricas, grafico de sinal selecionavel,
historico e eventos sempre marcados como simulados. Intervalos numericos sao
fixtures de interface, nao limites clinicos ou afirmacao de sensores reais.
Reutilizar Button, select nativo, icones Lucide, tokens e imagem do prototipo.
Layout operacional sem hero, responsivo, sem dados pessoais.

Verificacao: testes puros do motor e do tempo, build, formatacao, navegacao,
cliques e screenshots desktop/mobile. Verificar que nenhum POST de telemetria
ou gravacao local persistente ocorre durante o teste.
