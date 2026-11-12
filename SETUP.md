# Instalar e validar o backend SAGE

A aplicação executável é esta pasta (`site novo`): React/Vite, Supabase Auth/PostgREST/Realtime e uma única Edge Function Deno chamada `ingest`. O legado preservado na pasta vizinha contém arquivos recuperados com nomes trocados e referências a tRPC/Drizzle/MySQL sem implementações executáveis. Não iniciar um segundo backend para substituí-los.

## 1. Banco e autenticação

Em um projeto Supabase novo, execute **todo** `supabase/setup.sql` no SQL Editor. Esse arquivo reúne as migrations em uma transação, sem apagar dados. Para atualizá-lo após modificar migrations: `npm run db:bundle`.

Para um banco SAGE já instalado, aplique somente as migrations pendentes, em ordem:

1. `202610160001_identity_devices.sql`
2. `202610160002_alerts_support.sql`
3. `202610160003_telemetry.sql`
4. `202610160004_person_history_scope.sql`
5. `202610190001_existing_auth_profiles.sql`
6. `202610190002_backend_integrity.sql`
7. `202610220001_ingest_hardening.sql`
8. `202610220002_technical_monitor.sql`

No projeto `Sage` já implantado, confira o histórico antes de atualizar. As seis
primeiras migrations foram conciliadas em 22/10; não as reaplique. A atualização
adiciona a RPC de revogação usada pelo admin e o monitor técnico opt-in. Aplique
as migrations pendentes antes de publicar a SPA atualizada e publique novamente
a função `ingest` para incluir a validação endurecida de tokens.

Não aplique o arquivo único por cima de uma instalação existente. As migrations são versionadas para execução única; as novas não sobrescrevem as anteriores nem apagam leituras. A atualização conserva registros históricos e os restringe ao administrador quando não é possível atribuí-los com segurança ao vínculo atual. Vínculos anteriores à atribuição atual são revogados e precisam de nova concessão explícita.

Configure Authentication com provedor e-mail/senha, confirmação e recuperação. Site URL local: `http://127.0.0.1:5173`; Redirect URLs: `/auth` e `/auth?mode=update` nessa origem. Na hospedagem, substitua pelas URLs HTTPS reais e configure SMTP conforme o ambiente. Crie uma conta, confirme o e-mail e promova somente o UUID verificado em um ambiente administrativo:

```sql
update public.profiles set role='admin' where id='UUID_DA_CONTA_CONFIRMADA';
```

Novas contas e contas antigas sem perfil recebem papel de cuidador. Metadados de cadastro não concedem administração.

## 2. Frontend

```powershell
npm ci
Copy-Item .env.example .env
# Preencha a URL e a chave publica do seu projeto em .env.
npm run dev
```

Use `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`; variáveis `NEXT_PUBLIC_*` não são lidas pelo Vite. Nunca use secret/service_role no frontend. A cópia do exemplo deve ser feita somente quando `.env` ainda não existe, para preservar a configuração local.

As janelas técnicas padrão são 15 segundos para dados recentes e 90 segundos para ausência prolongada de comunicação. `VITE_STALE_AFTER_SECONDS` e `VITE_OFFLINE_AFTER_SECONDS` podem ajustá-las. Não são limites médicos nem garantia de entrega. Colete desabilitado fica offline; colete sem leituras mostra ausência de dados.

`npm run build` gera `dist`. Publique em hospedagem estática com fallback de rotas para `index.html`. A implantação do banco e da função é separada da hospedagem da SPA.

## 3. Edge Function

Com Supabase CLI disponível e um projeto escolhido:

```powershell
supabase link --project-ref SEU_PROJECT_REF
supabase db push
supabase functions deploy ingest
```

Se você instalou o SQL manualmente, concilie o histórico do CLI antes de executar `db push`; não reaplique migrations já executadas. Para desenvolvimento descartável com Docker: `supabase start`, migrations locais e `supabase functions serve ingest`. `supabase db reset` apaga apenas a instância local selecionada e não é necessário para atualizar um banco com dados.

`verify_jwt=false` é intencional: o dispositivo autentica pelo cabeçalho `X-Device-Token`. A chave privilegiada existe apenas no servidor da função; `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` são fornecidas pelo ambiente Supabase hospedado. As demais variáveis, seus padrões e limites estão em `.env.example` e `docs/telemetry.md`.

## 4. Dispositivo, consentimento e credencial

No painel administrativo, cadastre uma pessoa com consentimento registrado, cadastre `SGE-001` e conceda acesso a um cuidador. Trocar a pessoa do colete gera nova atribuição, limpa a última leitura e revoga os vínculos anteriores. Para a nova atribuição, conceda novamente acesso ao cuidador correto. Retirar consentimento bloqueia as consultas do cuidador.

Gere um token individual de pelo menos 32 bytes aleatórios, dentro do limite de 256 caracteres, em um meio seguro de provisionamento. Armazene o token apenas no firmware/meio de provisionamento. Calcule SHA-256 fora do banco e envie **somente o hash** à função abaixo, via SQL Editor ou backend confiável com papel de serviço. Ela não é executável pela SPA, nem mesmo pelo usuário administrador autenticado.

```sql
select public.rotate_device_credential(
  (select id from public.devices where code='SGE-001'),
  'HASH_SHA256_HEXADECIMAL_DE_64_CARACTERES',
  'UUID_DO_ADMINISTRADOR',
  'Provisionamento inicial'
);
```

O placeholder do hash deve ser substituído por um hash real. Para rotação, use um token novo e repita a operação com o novo hash; reprovisione o dispositivo. A versão anterior deixa de funcionar. Para revogar a credencial:

```sql
select public.revoke_device_credential(
  (select id from public.devices where code='SGE-001'),
  'UUID_DO_ADMINISTRADOR',
  'Revogacao administrativa'
);
```

As operações registram ator, horário e versão, sem copiar hash/token para a auditoria. Nunca coloque segredos ou informações pessoais no motivo. Desabilitar o colete também bloqueia ingestão, sem excluir seu histórico.

## 5. API, dashboards e firmware

Regras de ausência de comunicação são opcionais e não estão habilitadas por
padrão. Configuração, avaliação limitada e agendamento opt-in:
[docs/technical-monitor.md](docs/technical-monitor.md). O frontend usa a RPC
`revoke_caregiver_link(target)` para revogar acesso; UPDATE direto de vínculos
não é mais permitido. A mudança permanece auditada e não exclui histórico.

Veja `docs/telemetry.md` para o contrato v1, curl, unidades reservadas, respostas HTTP, backoff e fila de reenvio. Veja `docs/dashboard-api.md` para consultas autorizadas, paginação, indicadores, auditoria e comportamento Realtime. A aplicação não fabrica leituras; o hardware e seus sensores ainda precisam ser confirmados.

## 6. Testar

```powershell
npm test -- --maxWorkers=1 --no-file-parallelism
npm run typecheck
npm run build
npm run format:check
```

Há testes SQL com PGlite, HTTP com armazenamento injetado e testes de navegador com fixtures locais explícitas. Para os scripts `browser-auth.mjs`, `browser-regression.mjs` e `browser-realtime.mjs`, use um servidor separado na porta 5174 com `VITE_SUPABASE_URL=http://127.0.0.1:54399` e `VITE_SUPABASE_PUBLISHABLE_KEY=public-test-fixture-only`, somente no ambiente desse processo. Não salve esses valores no `.env` normal. O script público `browser.mjs` usa a porta 5173. Os scripts usam Chrome instalado no caminho do Windows documentado no código.

Os testes locais não comprovam funcionamento do Auth/SMTP, transporte Realtime, implantação Edge ou ESP32 reais. O relatório `docs/verification.md` separa as verificações executadas das dependências externas pendentes.
