# Cadastro de cuidado e notificações no site

Solicitação: melhorar o acompanhamento de possíveis quedas e pedir os dados do
idoso depois do código do colete. Canal escolhido pelo usuário: site.

Manter React/Vite e Supabase existentes na pasta site novo. O administrador
adiciona o código e segue para nome, endereço, alergias, condições informadas,
contato e registro de consentimento. Cuidadores mantêm ativação autorizada e
consulta dos dados vinculados. Não ampliar permissões de cadastro pelo código.

Notificações persistem como alertas no Supabase e aparecem no sino enquanto o
site está aberto, com atualização ao vivo e consulta periódica. O fluxo de
possível queda permite verificar, confirmar ocorrência ou descartar. Não há
classificação física nova sem firmware nem diagnóstico. Duplicatas de transporte
continuam deduplicadas por message_id; eventos distintos permanecem no histórico.

Alternativas: notificações externas exigiriam outro canal e infraestrutura;
notificações apenas na tabela não dão visibilidade global. Usar central interna,
sem dados de saúde nas prévias e sem promessa de entrega com navegador fechado.

Dados pessoais ficam em people, protegidos pelas permissões atuais. Escrita via
RPC administrativa transacional com verificação da atribuição esperada; consultas
e caches incluem usuário, dispositivo, pessoa e atribuição. Nenhum dado clínico
em logs, URLs ou armazenamento local. Campos desconhecidos não viram negativos.

Contratos: complete_device_profile(p_device_id uuid,
p_expected_assignment_id uuid,p_data jsonb) retorna device_id/person_id/assignment_id.
p_data: display_name,address,allergy_status(unknown/none/reported),allergies,
health_conditions,contact_name,contact_phone,consent_confirmed,consent_note.
review_fall_alert(target uuid,p_outcome text) aceita confirmed/dismissed.
alerts.fall_outcome é nulo até avaliação humana. Não inventar desfecho legado.

Verificar autorização, reatribuição concorrente, consentimento, validação,
deduplicação da central e estados de erro. Testar formulário e central em
desktop/mobile com fixtures isoladas. Simulador permanece explicitamente separado.
