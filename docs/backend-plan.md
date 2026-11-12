# Backend SAGE — execução de 19/10/2026

Objetivo: completar o fluxo ESP32 → Edge Function `ingest` → PostgreSQL/Supabase → dashboards existentes, preservando autenticação, dados e stack.

## Contexto auditado

A aplicação ativa é `site novo`, conforme o README raiz e o mapa de recuperação. React/Vite usa Supabase Auth, PostgREST, RPC e Realtime; a ingestão roda em Deno. Os arquivos recuperados do legado não constituem um servidor tRPC/Drizzle executável. Não criar um segundo backend.

Baseline nesta sessão: `npm test` passou com 46 testes; `npm run format:check` encontrou 15 arquivos com diferenças preexistentes. Build inicial passou com aviso de chunk acima de 500 kB.

## Etapas e verificação

- [x] Ingestão: testar mídia JSON, limite de leitura, timeout/cancelamento do banco, respostas restritas, identificação de requisição e logs sem segredos; endurecer validação/configuração.
- [x] Banco: migration incremental para escopo por atribuição do colete, revogação dos vínculos anteriores, ciclo de credenciais e auditoria administrativa; histórico de triagem e origem de eventos; conflitos idempotentes e indicadores administrativos autorizados.
- [x] Dashboards: preservar interface, consumir RPC administrativo; consultas limitadas por período/atribuição; distinguir ausência, recebimento recente, desatualização e offline; Realtime restrito e refetch periódico/reconexão, sem carregar histórico completo.
- [x] Testar permissões de admin, cuidador vinculado, não vinculado e anônimo com PostgreSQL embarcado; testar paginação, timestamp e regressões do frontend. Mocks somente em testes.
- [x] Gerar novamente `supabase/setup.sql` para instalação nova, mantendo migrations como atualização de bancos existentes. Atualizar setup, contrato, variáveis e relatório de verificação.
- [x] Rodar testes completos, TypeScript/build, verificação de formatação, Deno quando disponível e navegador. Registrar limitações de hardware/serviços remotos e falhas preexistentes separadamente.

## Restrições

Nenhuma medição confirma sensor disponível. Nenhum limite clínico, câmera, microfone ou diagnóstico. Token individual do ESP32 é armazenado apenas como hash no banco; chave privilegiada fica no servidor. Sem instalação remota ou hardware alegados a partir de mocks. Retenção automática permanece desabilitada até existir política definida.
