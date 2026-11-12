# Contratos dos dashboards SAGE

Usam a API PostgREST/RPC existente do Supabase, com JWT de Supabase Auth. Não há API tRPC paralela. Tipos e chamadas da SPA: `src/features/devices/api.ts`. Datas persistidas são `timestamptz`; JSON utiliza ISO 8601 com offset UTC. A interface apresenta datas em pt-BR com indicação de fuso.

## Autorização e escopo

O papel é consultado em `profiles` pelo servidor. Admin lê dados administrativos; cuidador lê somente colete com consentimento e vínculo vigente para a **atribuição atual** (`assignment_id`). Usuário sem vínculo não recebe pessoas, leituras ou eventos desse colete. Anônimo não tem privilégios de consulta. A API não retorna credenciais de dispositivo.

Cada troca de pessoa cria nova atribuição, revoga vínculos antigos e limpa a última leitura. Mesmo em A → B → A, leituras da primeira atribuição não voltam a ficar disponíveis ao cuidador. Admin conserva acesso ao histórico para gestão. A SPA filtra sua visualização pela atribuição selecionada também para admin.

A partir de `202610220001_ingest_hardening.sql`, revogar um vínculo usa a RPC
`revoke_caregiver_link(target)`, validada como admin no servidor. A RPC obtém o
lock do dispositivo antes do vínculo, na mesma ordem da troca de pessoa, usa
horário do banco e é idempotente. UPDATE direto de vínculos pelo navegador é
recusado. INSERT administrativo continua sujeito a RLS e consentimento; uma
nova concessão gera um vínculo novo, sem restaurar uma atribuição antiga.

## Consultas limitadas

| Operação                | Contrato                                                                                                                                                                                                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Listar coletes          | `listDevices(page, signal)`; `devices` com pessoa autorizada, ordenação por código, 25 por página. `last_received_at` é a última comunicação aceita; não confundir com atividade do usuário em `profiles.last_seen_at`.                                                                    |
| Última leitura          | Campos `latest_recorded_at` e `latest_metrics` do colete, ou `latestReading(device, signal)`: no máximo 1 linha ordenada por `recorded_at DESC, id DESC`. Sem dados retorna `null`.                                                                                                        |
| Histórico               | `listReadings(deviceId, page, signal, personId, {from,to}, assignmentId)`; 25 por página, intervalo inclusivo ISO 8601 com timezone, ordem `recorded_at DESC, id DESC`. A função rejeita intervalo/página inválidos antes da chamada. A seleção da SPA informa pessoa e atribuição atuais. |
| Eventos                 | `listAlerts(deviceId, status, page, signal, personId, assignmentId)`; 25 por página. Eventos do firmware mantêm `source_telemetry_id`, tipo e severidade informativa; não constituem confirmação clínica.                                                                                  |
| Tratar evento           | RPC `triage_alert(target, new_status)`; estados `new`, `acknowledged`, `resolved`. Valida acesso à atribuição; repetir o estado atual é no-op. Mudanças reais mantêm ator/horário e estado anterior em `alert_status_history`.                                                             |
| Histórico de tratamento | `listAlertHistory(alertId, page, signal)`; 25 transições por página. RLS equivale ao acesso ao evento. Importações anteriores são snapshots `legacy`, sem inventar atores/transições.                                                                                                      |
| Indicadores admin       | RPC `admin_dashboard(p_active_hours=24, p_stale_seconds=15)`, permitida somente para admin. Retorna contagens e `generated_at` em um snapshot transacional.                                                                                                                                |
| Gestão                  | Operações existentes em `devices`, `people`, `caregiver_device_links` continuam sujeitas a RLS e permissões por coluna. Criar, alterar, desabilitar, vincular e revogar geram `admin_audit_events`.                                                                                        |
| Auditoria admin         | `GET /rest/v1/admin_audit_events?select=*&order=occurred_at.desc,id.desc&limit=25&offset=0`, com JWT de admin. Tabela somente de leitura para navegador. Não contém nomes, contatos, métricas ou credenciais.                                                                              |
| Suporte                 | Contratos existentes em `src/features/support/api.ts`; conversas próprias ou administrativas, mensagens paginadas e chaves idempotentes.                                                                                                                                                   |

O banco aplica RLS mesmo quando parâmetros de filtro são omitidos ou alterados. Os filtros da SPA limitam o escopo apresentado; não concedem acesso. Informações sensíveis de seleção e filtros permanecem em memória, conforme `UX-CONTRACT.md`.

Contagem exata permite a paginação existente, mas pode custar caro em históricos grandes. O índice `(device_id, assignment_id, recorded_at DESC, id DESC)` limita a busca. Em grande volume, evoluir para cursor composto `(recorded_at,id)` e agregados conforme medição; não baixar o histórico inteiro. Novos envios podem deslocar páginas por offset; a atualização explícita reconcilia o intervalo.

## Indicadores e conectividade

`admin_dashboard` retorna `active_users`, `caregivers`, `devices`, `recent_devices`, `recent_alerts`, `enabled_devices`, `disabled_devices`, `recent_readings`, `open_alerts` e `generated_at`. Usuário ativo significa atividade observada na janela; dispositivo habilitado significa `enabled=true`. `recent_devices` exige dispositivo habilitado e comunicação na janela. `recent_readings` conta leituras pela recepção do servidor na janela de atividade. Contagens não são amostras de demonstração nem confirmação de acompanhamento contínuo.

Conectividade usa a recepção do servidor: sem timestamp válido → sem leituras; até 15 s → recebimento recente; acima de 15 até 90 s → desatualizado; acima de 90 s ou dispositivo desabilitado → sem comunicação recente/offline. Janelas são configuráveis em `VITE_STALE_AFTER_SECONDS` e `VITE_OFFLINE_AFTER_SECONDS`; a segunda precisa exceder a primeira. Não inferir estado da pessoa a partir da conexão ou de ausência de eventos. Dados ausentes permanecem `null`/ausentes; não preencher com zero.

Esses estados são alertas técnicos apresentados no painel. Não são eventos de saúde e não geram leituras ou quedas fictícias. Limiares de bateria/regras médicas automáticas não estão habilitados. Se futuras regras forem aprovadas, armazenar versão, autor, horário e parâmetros em migration própria.

## Realtime e indisponibilidade

A publicação `supabase_realtime` contém tabelas de origem com RLS. O canal selecionado filtra dispositivo; callbacks validam também pessoa e atribuição e ignoram eventos após cleanup/revogação. A primeira página é mesclada em memória, ordenada e limitada a 25 linhas; não há recarga do histórico inteiro por mensagem. Duplicação de transporte não duplica linhas visíveis.

Reconexão revalida acesso e consulta a página atual. Sem Realtime, histórico e eventos têm fallback por consulta limitada a cada 15 s; acesso ao dispositivo também é revalidado nesse intervalo. Mudança de atribuição, ausência de permissão ou erro de revalidação remove o escopo exibido. Revogação impede novas consultas/entregas pelo banco; informações legitimamente vistas antes não podem ser apagadas da memória do usuário.

Os testes WebSocket locais exercitam o hook real contra transporte simulado, filtros e rejeição de eventos de outras atribuições. Os testes SQL exercitam políticas usadas nas tabelas publicadas. A entrega Realtime hospedada com múltiplos usuários/JWTs continua sendo uma validação externa obrigatória.

Atualização de 26/10: consultas HTTP em andamento preservam até 25 inserções
concorrentes do canal. A ordenação conserva a precisão de microssegundos do
PostgreSQL. Replays de IDs fora da página não aumentam contagens; nesses casos
ou se o buffer transbordar, `ReadingPage.countExact=false` informa que o total
em memória é provisório. A próxima consulta limitada reconcilia o total.
Mudança ou remoção de dispositivo/pessoa/atribuição cancela consultas antigas,
limpa os caches privados de outros escopos e reinicia a página zero, inclusive
quando a mudança chega pela lista e não pelo canal.

O armazenamento de autenticação pertence a `src/lib/auth-storage.ts`. Logout
faz limpeza local mesmo com o Auth indisponível e bloqueia gravações atrasadas
da sessão. Uma nova entrada explícita ou callback de recuperação/PKCE reabre o
armazenamento. Essa limpeza não equivale a revogar remotamente tokens já
emitidos ou sessões de outros dispositivos.

O cliente observa INSERT/UPDATE e compara o registro novo com o escopo atual. Com RLS, o registro antigo de UPDATE pode conter somente a chave primária; o código não depende dele. O Supabase também documenta que DELETE não recebe a mesma verificação RLS. A SPA não possui permissões de exclusão nas tabelas publicadas e não há expurgo automático. Antes de habilitar exclusão/arquivo, revise a publicação e o transporte para evitar divulgar identificadores de exclusões a assinantes indevidos; não assuma proteção equivalente para DELETE. Referência: [Postgres Changes e limitações de RLS](https://supabase.com/docs/guides/realtime/postgres-changes).
