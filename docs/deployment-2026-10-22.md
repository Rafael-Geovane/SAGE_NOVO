# Implantacao Supabase - 22/10/2026

Atualizacao posterior: [implantacao incremental de 26/10](deployment-2026-10-26.md).
Este registro preserva o estado da primeira publicacao.

## Destino

- Aplicacao: `site novo`, sem alteracoes no legado.
- Projeto Supabase: `Sage` (`negrojohnpjfwwuokldx`).
- URL: `https://negrojohnpjfwwuokldx.supabase.co`.
- Funcao: `https://negrojohnpjfwwuokldx.supabase.co/functions/v1/ingest`.
- Frontend local: `http://127.0.0.1:5173`.

## Operacoes realizadas

O login administrativo foi confirmado e o CLI vinculado ao projeto correto.
O banco ja continha as quatro migrations de 16/10; elas nao foram reaplicadas.
As migrations `202610190001_existing_auth_profiles.sql` e
`202610190002_backend_integrity.sql` foram aplicadas em uma transacao pela API
de gerenciamento. As contagens existentes de coletes, leituras, alertas e
vinculos foram preservadas. As seis versoes locais foram registradas em
`supabase_migrations.schema_migrations`, incluindo a conciliacao da instalacao
manual anterior. Nao executar `setup.sql` novamente neste projeto.

A Edge Function `ingest` foi publicada usando o bundle da pasta `site novo`,
com `verify_jwt=false`: a autenticacao do equipamento continua obrigatoria pelo
cabecalho `X-Device-Token` e pela funcao SQL. As variaveis privilegiadas da funcao
sao fornecidas pelo ambiente Supabase, nao pelo frontend.

Auth foi configurado para `http://127.0.0.1:5173`, permitindo as rotas `/auth` e
`/auth?mode=update` tanto nessa origem quanto em `http://localhost:5173`.
O provedor e-mail e as demais opcoes de cadastro existentes foram preservados.
A conta explicitamente indicada pelo responsavel foi promovida a administrador
apos confirmar seu e-mail no Auth. Nenhuma senha foi criada ou alterada.

O arquivo `.env.local` manteve a URL e a chave publica existentes; apenas sua
marca UTF-8 BOM foi removida para compatibilidade com o CLI. Nenhum segredo de
administracao foi colocado no cliente. Os caches locais do CLI sao ignorados
pelo Git.

## Verificacao remota

Validacao local final: 119 testes passaram em 11 arquivos, em execucao serial.
A verificacao de segredos do cliente examinou 35 arquivos, sem ocorrencias.
O servidor Vite respondeu HTTP 200 em `/`, `/auth` e `/admin`; isso confirma
que a SPA e servida, nao equivale a testar uma sessao autenticada no navegador.

- Funcao `ingest` em estado `ACTIVE`, versao 1.
- Seis migrations registradas; RPCs de ingestao, administracao e credenciais presentes.
- RLS habilitada nas dez tabelas publicas da aplicacao.
- Publicacao Realtime inclui dispositivos, telemetria, alertas, vinculos e historico dos alertas.
- Ingestao SQL permitida somente a `service_role`, nao a `anon` ou `authenticated`.
- Navegador sem acesso ao schema privado de credenciais.
- POST sem token: HTTP 401; com token invalido e payload valido: HTTP 401.
- POST com payload invalido: HTTP 400; midia nao JSON: HTTP 415.
- Consulta anonima de dispositivos recusada com HTTP 401.
- Nenhuma leitura ficticia foi gravada e nenhum colete foi provisionado.

## Limites e proximos passos

Estes testes verificam implantacao, estrutura e rejeicao de acessos invalidos.
Nao comprovam login pelo navegador, entrega Realtime ponta a ponta, envio de
e-mails ou recebimento de um ESP32 real. Nao foram coletadas senhas de usuarios
nem criadas contas ou credenciais de hardware para teste remoto.

Entre novamente no site com a conta administrativa. Cadastre a pessoa com
consentimento, o colete e os vinculos. Provisione uma credencial individual
conforme `../SETUP.md` e `telemetry.md`; nunca use service_role no firmware.
Depois valide leituras reais, reenvios e reconexao do equipamento.

Antes de hospedagem publica, configure Site URL e Redirect URLs para o dominio
HTTPS final. Revise confirmacao de e-mail/SMTP, retencao, privacidade e limites
de abuso. Rotacione as chaves privilegiadas compartilhadas na conversa.
