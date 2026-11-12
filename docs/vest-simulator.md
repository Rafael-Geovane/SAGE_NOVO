# Teste local do colete SGE-001

Abra `http://127.0.0.1:5173/teste-colete` com `npm run dev` iniciado na pasta
`site novo`. O link **Testar SGE-001** tambem aparece na navegacao da area da
conta. A pagina de teste pode ser aberta sem login, cadastro, ativacao ou ESP32.

## Controles

- **Iniciar teste / Pausar teste:** alterna geracao automatica a cada 3 segundos.
- **Gerar leitura:** acrescenta uma amostra manual, sem iniciar o temporizador.
- **Simular desconexao / Reconectar:** interrompe novas amostras e testa retorno.
- **Evento de teste / Queda simulada:** eventos sinteticos identificados.
- **Bateria em 5%:** cenario de interface, sem configurar limiar ou alerta real.
- **Leituras parciais no teste:** proximas amostras omitem sinais vitais com null.
- **Reiniciar teste:** limpa o estado sintetico e volta a uma amostra pausada.

O seletor de metrica troca o sinal no grafico. O estado conserva no maximo 30
leituras e 20 eventos; a tabela mostra as 10 amostras mais recentes. Ao sair,
o temporizador e cancelado; recarregar reinicia o teste.

## Separacao dos dados reais

Os dados sao explicitamente simulados e ficam apenas na memoria da pagina.
Nao sao enviados ao Supabase, salvos no armazenamento do navegador ou usados
como historico de pessoas. Nao e necessario provisionar um token de dispositivo.
As faixas aleatorias servem apenas como fixtures visuais, nao limites medicos,
medicoes reais ou afirmacao dos sensores presentes no prototipo.

O cadastro real continua na administracao. As leituras reais seguem o endpoint
autenticado `ingest`; a tabela de coletes nao permite que o navegador escreva
telemetria confiavel. Pareamento/ativacao e as migrations existentes nao foram
alterados por este simulador.

## Codigo e verificacao

- Motor: `src/features/simulator/engine.ts`.
- Tela: `src/pages/VestTest.tsx` e `src/styles/simulator.css`.
- Unidade: `node node_modules/vitest/vitest.mjs run tests/vest-simulator.test.ts`.
- Navegador: `node tests/browser-vest-simulator.mjs` com o servidor em 5173.

O teste de navegador usa um contexto isolado, verifica controles, intervalo,
pausa, imagens, layout em 360/390/768/1440 pixels e ausencia de gravacoes de
telemetria. Os screenshots e resultados ficam em `docs/`.

Validacao de 29/10/2026: nove testes do motor e 201 testes totais passaram.
Os seis grupos de cenarios do navegador passaram, incluindo ausencia de
gravacoes no Supabase e de persistencia de leituras no navegador. A revisao
independente nao encontrou bloqueios; isso nao equivale a testar um ESP32 real.
Build, formatacao e verificacao de segredos do cliente tambem passaram.
