# Auditoria e validação do backend SAGE — 19/10/2026

Atualizacao de 22/10/2026: o backend foi implantado no Supabase do site novo.
Veja [implantacao e verificacoes remotas](deployment-2026-10-22.md). As limitacoes
abaixo descrevem a entrega local anterior; nao substituem esse registro.

## Stack e diagnóstico inicial

O README raiz identifica `site novo` como aplicação ativa: React/Vite, Supabase Auth, PostgREST/RPC, RLS e Realtime. O único endpoint de dispositivos é a Edge Function Deno `ingest`. Não foi criado outro backend ou banco.

Os caminhos `server/routers.ts`, `server/db.ts` e a implementação de `appRouter` citados no pedido não existem como backend executável no workspace. O legado está achatado e tem arquivos com nomes trocados: `index.ts` contém o manifesto antigo, `package.json` contém SQL, `owner-notifications.md` contém schema Drizzle e `supabase_schema.sql` contém servidor Express referenciando implementações ausentes. Seus arquivos com nomes de testes tampouco são testes executáveis confiáveis. O legado foi preservado.

Baseline antes de implementar: **46 testes passaram**, build passou com aviso de bundle acima de 500 kB, e `format:check` apontou **15 arquivos com diferenças preexistentes**. Não há script ESLint; as verificações estáticas disponíveis são TypeScript e Prettier. Diferenças de formatação foram corrigidas sem mudança intencional de comportamento nesses arquivos.

## Alterações verificadas

- Migration incremental `202610190002_backend_integrity.sql`, mantendo as anteriores. Escopo por atribuição, revogação de vínculos na troca da pessoa e isolamento A → B → A. Preserva dados existentes e restringe atribuições antigas ao admin quando necessário.
- Ingestão atômica, credencial individual revogável/rotacionável, validação no SQL, limite transacional, retry idempotente, conflito de conteúdo 409, desempate determinístico e rollback de leitura/cota/última leitura quando a transação falha.
- Auditoria administrativa e histórico imutável de tratamento dos eventos, com ator/horário e proveniência. Sem credenciais, nomes, contatos ou métricas na auditoria administrativa.
- Privilégios testados também com defaults permissivos semelhantes aos do Supabase. Navegador, inclusive admin, não escreve telemetria, credenciais ou auditoria. Anônimo não lê tabelas nem executa RPCs da aplicação.
- Corpo UTF-8 limitado, configuração validada, mídia JSON exata, prazos/cancelamento de corpo e RPC, respostas restritas, X-Request-ID e logs mínimos estruturados.
- Histórico por intervalo/atribuição em páginas de 25, última leitura limitada e indicadores em RPC de admin. Conectividade distingue ausência, recebimento recente, desatualização e offline.
- Realtime com filtro de dispositivo e validação de pessoa/atribuição, cache limitado e fallback. Reconexão compartilha uma revalidação em andamento, sem perder reconciliação.
- Renovação de login não restaura sessão antiga após consulta lenta; mudança de papel limpa cache privado; recuperação de senha permanece ativa. Enquanto um perfil válido da mesma identidade é revalidado, a tela permanece montada e preserva rascunhos; erro, expiração ou troca de identidade continuam ocultando dados privados.

## Evidências locais

| Comando/verificação                                | Resultado                                                                                                                                            |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test -- --maxWorkers=1 --no-file-parallelism` | **119 testes passaram em 11 arquivos**                                                                                                               |
| SQL/setup                                          | Instalação e atualização com dados, RLS por perfil/anônimo, credenciais, idempotência/conflito, ordenação/paginação por tempo, publicação e rollback |
| HTTP/domínio                                       | 75 testes de ingestão/contrato: payload parcial/null, unidade, versão, timestamp, timeout, falha de armazenamento e respostas seguras                |
| TypeScript/build                                   | Integrados em `npm run build`; aviso de chunk acima de 500 kB já existia no baseline                                                                 |
| Deno                                               | `npx --yes deno@2.5.4 check --config supabase/functions/ingest/deno.json supabase/functions/ingest/index.ts` passou; lock de dependências gerado     |
| Cliente                                            | `node scripts/check-client-secrets.mjs` examina src/dist sem expor credenciais na saída                                                              |
| Formatação                                         | Prettier cobre código, testes, documentação e configuração                                                                                           |

Tentativas concorrentes com várias instâncias PGlite/Chrome causaram timeout de inicialização; a execução final serial passou sem aumentar prazos. Vite na porta 5173 conservou uma transformação transitória inválida durante edição e foi reiniciado antes de repetir o teste público. Esses resultados intermediários não foram tratados como sucesso.

## Navegador

O navegador integrado estava indisponível; os scripts usam Chrome headless local.

Resultado final da regressão: **8 de 9 cenários aprovados**; somente a falha preexistente de Voltar nativo retornou erro. Os scripts público, autenticado e Realtime simulado passaram integralmente.

- `tests/browser.mjs`: site público, carrinho, acesso, recuperação, rotas protegidas, 404, mobile, teclado e redução de movimento.
- `tests/browser-auth.mjs`: cuidador/admin, acesso restrito, ausência/desatualização, suporte com retry, rascunho, formulários, modais e revogação.
- `tests/browser-regression.mjs`: expiração, refresh concorrente com perfil, mudança de papel, recuperação, atribuição, suporte paginado e edição durante envio passaram. **Falha preexistente separada:** Voltar nativo do navegador no suporte pode descartar um rascunho sem confirmação; a proteção atual cobre cliques e saída do documento. A falha foi reproduzida antes de mudanças nesse guard. Tentativas locais de ampliar a proteção não ficaram estáveis em Voltar/Avançar e foram revertidas, preservando o comportamento anterior. O script completo mantém essa regressão visível e retorna código 1 por esse cenário; não é considerado aprovação integral.
- `tests/browser-realtime.mjs`: hook real com WebSocket/HTTP **simulados**; filtros, rejeição de outros dispositivos/pessoas/atribuições, deduplicação, polling após desconexão e remoção após revogação.

Evidências em `docs/browser*-results.json`. RLS foi executada em PGlite com identidade Auth exclusiva de testes. Publicação e permissões foram conferidas localmente. Isso não comprova entrega pelo Realtime hospedado nem integração Auth/SMTP/PostgREST real. Fixtures são isoladas dos arquivos de produção e o bundle é examinado.

## Dependências externas e próximos passos

Há URL/chave pública em `.env.local`, ignorado pelo Git. Não foram aplicadas migrations remotas, implantadas funções ou gravadas leituras no Supabase hospedado durante esta implementação. Instalação/atualização e provisionamento: `SETUP.md`; contrato/curl: `docs/telemetry.md`; dashboards: `docs/dashboard-api.md`.

Pendente no ambiente escolhido: aplicar migrations; implantar ingest; verificar Auth/SMTP; provisionar token individual; testar HTTP real e retry; validar Realtime entre JWTs com/sem vínculo; testar ESP32, relógio, unidades, fila offline, backoff, rotação e reconexão. Não há firmware/hardware no workspace. Não houve teste de carga com conexões independentes nem medição de latência/capacidade/custo.

Não há sensores, limites clínicos, certificações ou desempenho presumidos. Giroscópio é campo opcional reservado. Não foram habilitados eventos fictícios, regras clínicas ou expurgo automático. Antes de uso real, definir retenção/arquivo/logs, revisar privacidade e restringir abuso distribuído no gateway. O protótipo não garante monitoramento contínuo nem substitui cuidado profissional.
