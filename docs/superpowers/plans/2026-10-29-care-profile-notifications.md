# Care profile and site notifications implementation plan

Goal: adicionar cadastro após o código e acompanhamento de possíveis quedas.
Architecture: React/Vite existente, RLS e RPCs Supabase transacionais; central
interna com consulta periódica e realtime. Sem dependências novas.
Spec: ../specs/2026-10-29-care-profile-notifications-design.md

## Constraints and review focus

Somente site novo. Não alterar migrações anteriores. Proteger dados de saúde,
rejeitar atribuição concorrente, manter ativação do cuidador, preservar eventos
distintos e comunicar falhas de atualização. Sem dados sintéticos em produção.

- [x] Backend: nova migração de people, complete_device_profile, desfecho de
      queda e review_fall_alert; testes PGlite de validação, autorização e histórico.
- [x] Perfil: schema/API em features/people/profile.ts; formulário compartilhado
      de cadastro/edição, segunda etapa em ConnectDevice, consulta no dashboard.
      Testes de dados desconhecidos, consentimento e escopo de cache.
- [x] Central: features/notifications, sino no PublicLayout, alertas com ações
      humanas, deduplicação por ID, atualização ao vivo e fallback 15 s. Testes.
- [x] Integração: bundle SQL, documentação e design context; testes unitários/SQL,
      build, format e scanner; fluxo browser com Supabase fictício isolado.
- [x] Publicação: verificar projeto vinculado e migrações antes de qualquer
      alteração; sem apagar dados ou criar pessoas fictícias.

Não criar commits no repositório ancestral do usuário.
