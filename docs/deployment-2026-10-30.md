# Cadastro de cuidado e notificações

Implementado em site novo, com backend publicado no projeto Sage
(`negrojohnpjfwwuokldx`) em 30/10/2026.

## Alterações

- Cadastro após o código para administrador: nome, endereço, alergias com
  situação desconhecida explícita, condições relatadas, contato e autorização.
  RPC transacional confere a atribuição esperada antes de salvar.
- Consulta dos dados no acompanhamento, com edição administrativa. Cache de
  saúde segue usuário, dispositivo, pessoa e atribuição.
- Sino com possíveis quedas pendentes; Realtime e fallback de 15 s. Verificar,
  confirmar ocorrência e descartar com avaliação humana e histórico imutável.
- Teste local de notificação no simulador, sem persistência ou envio real.

## Publicação

Oito migrations remotas anteriores conferidas por checksum contra os arquivos
locais. Publicadas, em uma transação com proteção de versão e contagens:
`202610260001_self_service_pairing` (pendente) e
`202610290001_care_profile_falls`. Dez versões confirmadas após publicação.
As contagens de perfis, pessoas, dispositivos, leituras, alertas, vínculos e
histórico permaneceram iguais. Nenhuma pessoa, colete ou leitura fictícia criada.

Verificação remota: funções de cadastro/revisão existem; anônimos não podem
executá-las; colunas novas de saúde não têm UPDATE direto para authenticated;
RLS continua habilitada em people/devices/alerts. A função ingest não foi alterada.
Não executar novamente setup.sql no banco existente.

## Verificação local

232 testes em 21 arquivos passaram, incluindo 14 de SQL para esta funcionalidade.
Build de produção passou. Fluxo de navegador com fixtures isoladas validou
cadastro, erro e nova tentativa, preenchimento de cadastro existente, ativação de
cuidador e avaliação de queda em 360px. As capturas estão em docs/screenshots.

Formatação aprovada. Auditoria premium strict sem achados. Scanner de cliente:
48 arquivos, zero achados. Simulador: sete cenários de navegador aprovados,
incluindo aviso e avaliação local de queda, timer de 3 segundos e quatro larguras
de tela. Instância normal em 127.0.0.1:5173 usa o projeto Supabase correto.

## Limites

O frontend continua local; não houve publicação de hosting. Testes privados de
navegador usam HTTP/Auth fictícios e não comprovam transporte Realtime ou firmware
real. As notificações requerem o site aberto e conexão; não há push, SMS, WhatsApp
ou e-mail. A sinalização de possível queda vem do firmware, sem novo classificador
físico ou diagnóstico. O teste preexistente de voltar no navegador com rascunho
de suporte não faz parte desta mudança e continua pendente.
