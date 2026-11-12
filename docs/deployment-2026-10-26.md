# Implantacao incremental - 26/10/2026

Aplicacao: `site novo`. Projeto Supabase: `Sage`
(`negrojohnpjfwwuokldx`). Continuacao da implantacao de 22/10, autorizada pelo
responsavel. Nenhuma alteracao no projeto antigo ou exclusao de dados.

## Publicado

- `202610220001_ingest_hardening.sql`: autenticacao sem locks antes da secao
  transacional privada, revalidacao sob lock, RPC administrativa de revogacao
  e ordem dispositivo -> vinculo/alerta tambem na triagem humana.
- `202610220002_technical_monitor.sql`: configuracao opt-in auditada/versionada,
  avaliador restrito ao servico, eventos tecnicos deduplicados por atribuicao
  e recuperacao com historico. Sem regras ou agendamentos automaticos.
- Edge Function `ingest`, versao 2, estado `ACTIVE`: token individual estrito,
  rejeicao de JWTs/chaves de projeto, mantendo o contrato v1 e a persistencia
  transacional existentes.

As duas migrations e seus registros de versao foram confirmados em uma
transacao. As contagens de dispositivos, perfis, leituras, alertas e vinculos
foram preservadas. Os seis arquivos SQL antigos correspondem aos checksums do
historico remoto. `setup.sql` foi atualizado como bundle para instalacoes novas;
nao o execute novamente neste banco.

## Evidencia remota

- Oito migrations registradas.
- Todas as tabelas publicas da aplicacao com RLS habilitada.
- Execucao direta da implementacao privada negada ao papel de servico.
- Ingestao publica e avaliador acessiveis ao papel de servico; avaliador negado
  ao navegador. Configuracao de regras exige administrador autenticado.
- Avaliacao manual sem regras retornou `checked=0`, `emitted=0`, `recovered=0`.
- Token ausente/invalido ou prefixo administrativo: HTTP 401.
- Payload invalido: HTTP 400.
- RPCs de configuracao, avaliacao e revogacao recusaram anonimos com HTTP 401.
- Nenhuma leitura ficticia foi gravada e nenhum dispositivo foi provisionado.

## Limites

O frontend continua sendo servido localmente; nao foi contratado nem alterado
hosting publico. Autenticacao pelo navegador, transporte Realtime com usuarios
reais, SMTP, concorrencia PostgreSQL entre conexoes e ESP32 exigem validacao
ponta a ponta. Os testes de navegador privados usam fixtures locais isoladas.
Logout tem limpeza local garantida pelos testes, nao revogacao remota global.

Historico completo da auditoria, comandos e resultados locais:
[backend-audit-2026-10-22.md](backend-audit-2026-10-22.md).
Configurar monitoramento: [technical-monitor.md](technical-monitor.md).
