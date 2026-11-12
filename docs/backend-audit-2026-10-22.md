# Backend SAGE: auditoria iniciada em 22/10, concluida em 26/10/2026

## Destino e baseline

Somente `site novo`. O anexo menciona Express/tRPC/Drizzle, mas essa nao e a
stack executavel desta aplicacao. O README, SETUP e codigo confirmam React/Vite,
Supabase Auth/PostgREST/RPC/RLS/Realtime e Edge Function Deno `ingest`. Os arquivos
do legado e do outro workspace foram preservados; nao ha backend paralelo.

Antes de implementar: 119 testes passaram em 11 arquivos, com PGlite serial;
build passou, com o aviso preexistente de bundle JavaScript maior que 500 kB.
Nao existe script ESLint: as verificacoes disponiveis sao TypeScript e Prettier.

## Cobertura do pedido

| Requisito                                          | Implementacao e evidencia                                                                                |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Um endpoint simples para ESP32                     | `supabase/functions/ingest`, sem duplicidade tRPC/Express                                                |
| Contrato v1 estrito, parcial, null e unidades      | `src/domain/telemetry.ts`, `tests/telemetry.test.ts`                                                     |
| Autenticacao individual e rotacao/revogacao        | Hash no schema privado, RPCs restritas, `tests/backend-integrity.test.ts`                                |
| Sem chave administrativa no firmware/cliente       | Rejeicao de prefixos/JWT no handler, env publico separado, scanner de segredos                           |
| Limites e erros seguros                            | Corpo UTF-8 limitado, deadlines/cancelamento, quota transacional, logs restritos; `tests/ingest.test.ts` |
| Persistencia confirmada e retries                  | RPC atomica, chave unica dispositivo/mensagem, comparacao de conteudo e 409; testes SQL                  |
| Atualizacao da leitura mais recente                | Ordem por `recorded_at DESC,id DESC`, recepcao separada, late arrivals preservados                       |
| Admin, cuidador vinculado, nao vinculado e anonimo | RLS por consentimento/atribuicao; testes SQL em PostgreSQL embarcado                                     |
| Cadastro e vinculos auditaveis                     | `admin_audit_events`, RPC de revogacao com lock dispositivo antes do vinculo                             |
| Eventos separados e historico                      | `alerts`, origem da leitura, `alert_status_history`, triagem autorizada                                  |
| Eventos tecnicos sem diagnostico                   | Monitor de comunicacao opt-in, regra versionada/auditada, deduplicacao e recuperacao                     |
| Ultima leitura, historico e indicadores reais      | `src/features/devices/api.ts`, RPC `admin_dashboard`, paginas de 25 por periodo/atribuicao               |
| Estados de conexao                                 | `src/domain/connectivity.ts`, janelas tecnicas configuraveis; ausencia nunca vira zero                   |
| Realtime e reconexao                               | Canal filtrado, RLS, verificacao de pessoa/atribuicao, cache limitado, revalidacao/fallback              |
| Suporte existente                                  | Conversas/mensagens RLS, paginacao e chaves idempotentes mantidas                                        |
| Privacidade e retencao                             | Sem camera/microfone, sem expurgo automatico; estrategia em `docs/telemetry.md`                          |
| Documentacao e ambiente                            | SETUP, contrato/curl/ESP32, dashboard-api, monitor, `.env.example` sem credenciais                       |

## Correcoes desta revisao

- Tokens administrativos, JWTs e caracteres fora de base64url/hex sao recusados
  antes do banco. Seis casos novos retornavam 200 com repositorio de teste antes
  da correcao; os 50 testes do handler passaram depois.
- Credenciais invalidas deixam de entrar na secao com locks da ingestao; a
  implementacao transacional privada continua revalidando a credencial e o
  estado sob lock. Nenhum papel da API executa diretamente a funcao privada.
- Revogacao de vinculo passa por RPC administrativa, com horario do banco,
  idempotencia, auditoria e ordem de locks consistente com a troca de pessoa.
- Triagem humana e recuperacao tecnica tambem obtem o lock do dispositivo
  antes do alerta; a triagem revalida autorizacao apos obter os locks.
- Monitor tecnico exige configuracao explicita; nao cria eventos de saude,
  nao grava leituras e nao depende de limiares medicos.
- O cliente preserva insercoes Realtime durante uma consulta HTTP, limita o
  buffer a 25 leituras e nao aumenta contagens por reenvios fora da pagina.
  A ordenacao distingue microssegundos antes de usar o ID como desempate.
- Trocas de escopo cancelam consultas e removem caches sensiveis, incluindo
  paginas ja visitadas, e reiniciam a paginacao na nova atribuicao.
- Logout remove a sessao local e impede escritas atrasadas de reativarem o
  armazenamento. Nova entrada explicita e callbacks de recuperacao/PKCE
  liberam esse bloqueio. Isso nao afirma revogacao remota de tokens emitidos
  nem encerramento de sessoes em outros dispositivos.

As duas novas migrations sao incrementais. As seis migrations ja publicadas
nao foram editadas. `setup.sql` e somente o bundle gerado para instalacao nova;
nao deve ser reaplicado em banco existente.

## Significado dos estados

`last_received_at` continua sendo a recepcao de uma leitura nova aceita, nao um
heartbeat. Repetir uma leitura antiga nao fabrica atualizacao dos dados nem
reinicia a janela de frescor. O monitor documenta ausencia de novas leituras,
nao prova de defeito de hardware ou do estado da pessoa.

## Validacao final

Rodada final de 26/10/2026. Fixtures permanecem somente nos testes, nunca na
aplicacao de producao.

| Comando/verificacao                                                                                              | Resultado                                                                                       |
| ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `node node_modules/vitest/vitest.mjs run --maxWorkers=1 --no-file-parallelism`                                   | 181 testes passaram, 15 arquivos                                                                |
| `npm run build`                                                                                                  | TypeScript e Vite passaram; aviso preexistente de chunk maior que 500 kB                        |
| `npm run format:check`                                                                                           | Prettier aprovado                                                                               |
| `npm run check:client`                                                                                           | 36 arquivos examinados; nenhum segredo/fixture detectado no cliente                             |
| `npx --offline deno@2.5.4 check --config supabase/functions/ingest/deno.json supabase/functions/ingest/index.ts` | Aprovado                                                                                        |
| `node tests/browser.mjs`                                                                                         | Site publico, mobile/desktop, carrinho e navegacao passaram                                     |
| `node tests/browser-auth.mjs`                                                                                    | Fluxos autenticados com fixtures, restricoes e revogacao passaram                               |
| `node tests/browser-realtime.mjs`                                                                                | Hook real com transporte simulado, filtros, fallback e revogacao passaram                       |
| `node tests/browser-regression.mjs`                                                                              | 8 de 9 cenarios passaram; permanece falha preexistente no Voltar nativo com rascunho do suporte |
| HTTP local `/`, `/auth`, `/admin`                                                                                | HTTP 200; servidor em `http://127.0.0.1:5173`                                                   |

A falha do Voltar no suporte ja constava no relatorio de 19/10 e nao foi
ocultada nem tratada como sucesso. Login/refresh/expiracao, troca de papel,
recuperacao, atribuicao e envio concorrente passaram na regressao. A inspeccao
visual mobile usou screenshot de fixture identificada, sem dados reais.

Durante a retomada, a regressao SQL de CHECK com NULL, a importacao do cliente
sem DOM no ambiente Node e as anotacoes de tipos nos novos testes foram
corrigidas. A verificacao final acima foi repetida apos essas correcoes;
nao foram simplesmente aumentados os timeouts de testes que falharam.

Em 26/10, as duas migrations novas e a funcao `ingest` atualizada foram
publicadas com autorizacao explicita do responsavel no projeto `Sage`.
Verificacao remota: oito versoes registradas; nenhuma tabela publica sem RLS;
funcao transacional privada inacessivel ao papel de servico; avaliador permitido
somente ao papel de servico, nao ao navegador. Nenhuma regra configurada e
avaliacao vazia com `checked=0`, `emitted=0`, `recovered=0`.

A funcao publicada retornou 401 para token ausente/invalido ou prefixo de
chave de projeto, e 400 para payload invalido. As RPCs de configuracao,
avaliacao e revogacao recusaram chamadas anonimas com HTTP 401. Nenhuma leitura
de teste foi inserida. As seis migrations antigas correspondem aos checksums
registrados na implantacao anterior.

## Limites que exigem ambiente real

Nao ha firmware/ESP32 no workspace. Nao foram medidos capacidade, latencia,
custo ou disponibilidade. PGlite nao comprova concorrencia entre conexoes
independentes: carga, ultima vaga de quota simultanea e revogacao concorrente
devem ser exercitadas em uma instancia PostgreSQL de homologacao.

Transporte Realtime com varios JWTs, SMTP/recuperacao e recebimento fisico do
colete precisam de verificacao ponta a ponta. Falhas de autenticacao/publicacao
nao devem ser declaradas resolvidas apenas por mocks locais. A politica de
retencao, arquivo, privacidade e controle de abuso distribuido requer definicao
antes de uso com dados sensiveis. Sem exclusao silenciosa ou promessa clinica.
