# SAGE backend: auditoria incremental

## Objetivo e escopo

Atender ao anexo de implementacao do backend exclusivamente em `site novo`.
O usuario pediu implementacao, testes e documentacao nesta pasta, sem interromper
o trabalho em um plano. Preservar a SPA e o backend Supabase ja implantado.
Nao criar servidor Express/tRPC ou banco paralelo, nao alterar o legado.

## Arquitetura existente

ESP32 -> Edge Function Deno `ingest` -> validacao Zod -> RPC transacional
`ingest_telemetry` -> PostgreSQL com RLS -> PostgREST/RPC e Realtime -> React.
Autenticacao humana pelo Supabase Auth; credenciais de dispositivos individuais
em hash SHA-256 no schema privado. Migrations 16/10 e 19/10 ja aplicadas.

## Decisoes

1. Auditar antes de editar: baseline completo e build, revisao independente de
   SQL/RLS e consumo dos dados. Conservar arquivos SQL ja publicados.
2. Corrigir lacunas demonstraveis com teste de regressao vermelho/verde.
   Mudanca SQL exige migration nova. Nao inventar eventos ou sensores.
3. Token de dispositivo: 32 a 256 caracteres ASCII alfanumericos, `_` e `-`;
   proibir prefixos administrativos Supabase e JWTs. Sem token no log/resposta.
4. Preservar leituras parciais, timestamps, idempotencia, quotas, isolamento por
   atribucao e consentimento. Nao preencher ausencias com zero.
5. Registrar cobertura, evidencias e limitacoes; nenhuma afirmacao de hardware,
   SMTP ou Realtime hospedado completo baseada em testes simulados.

## Verificacao

Testes Vitest/PGlite seriais para evitar competicao de inicializacao do WASM,
TypeScript/build, Prettier e scanner de segredos. Testes de frontend existentes
devem manter filtros e limpeza do cache. Qualquer implantacao incremental deve
ser verificada por metadata e respostas negativas, sem inserir leituras falsas.

## Fora do escopo

Diagnosticos, limiares medicos, novas midias, firmware inexistente, expurgo
automatico sem politica aprovada, mudanca de hospedagem ou exclusao de dados.
