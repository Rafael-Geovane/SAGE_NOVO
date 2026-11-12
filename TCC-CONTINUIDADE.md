# SAGE — continuidade do TCC

Este arquivo é o handoff do projeto para a próxima IA ou pessoa que continuar o
desenvolvimento. Ele reúne o que já existe, o que ainda falta e a ordem sugerida
para transformar o protótipo em uma apresentação reproduzível com o site e o
colete físico.

Última revisão: 10/11/2026
Pasta ativa: `site novo`  
Aplicação: React + Vite  
Backend: Supabase Auth, PostgREST, RLS, Realtime e uma Edge Function Deno
chamada `ingest`

> Não continuar o trabalho na pasta legada `sage_react--main`. A aplicação ativa
> deste TCC é esta pasta `site novo`.

## 1. Estado atual

Ativação NVIDIA concluída em 10/11/2026: chave e modelo publicados nos secrets
do Supabase a partir do `.env`. Teste real do provedor com dados exclusivamente
sintéticos retornou HTTP 200 e análise JSON válida. As referências abaixo à
chave ausente descrevem a primeira publicação; a pendência de configuração foi
resolvida. Repetir a geração no site com a conta autorizada para conferir o
fluxo hospedado completo.

Configuração consolidada: existe um único `.env` na raiz com as variáveis
públicas Supabase/Vite e privadas NVIDIA. As configurações anteriores foram
preservadas; os arquivos de ambiente duplicados foram removidos. Consulte
`docs/vercel-env.md`. O backend de IA continua no Supabase e requer publicar os
secrets a partir desse mesmo arquivo.

IA NVIDIA adicionada: o Premium integra `nvidia/nemotron-3.5-bolt-e4b` pela
função `weekly-analysis`, já publicada. `.env` foi criado
com `NVIDIA_API_KEY` vazio. Falta preencher e publicar essa chave para testar a
inferência real. Não há mais necessidade de implementar a integração do zero.
O resumo demonstrativo por regras continua como botão separado. Consulte
`docs/nvidia-analysis.md`. As notas anteriores de “API não conectada” descrevem
o estado anterior à integração; o provedor agora está implementado e depende
apenas da configuração e validação real.

Atualização de relatórios e planos: o menu lateral leva a `/relatorios` e
`/planos`. Essencial consulta relatórios; Plus exporta CSV/imprime; Premium
libera análise semanal demonstrativa por regras. O usuário escolheu modo TCC,
sem cobrança real e sem API de IA. Dez cenários estão disponíveis em
`/teste_colete`, que continua fora do menu. Duas migrations foram publicadas:
`202611100002_reports_plans` e `202611100003_more_scenarios`. Consulte
`docs/reports-plans-demo.md` para os detalhes e critérios de integração futura.

Atualização adicional: `/teste_colete` oferece controles manuais de leituras,
possível queda e bateria baixa para coletes simulados autorizados. Temperatura
fixa em 36,5 °C e variações pequenas nas demais métricas. Avisos do navegador
podem ser ativados em Minha conta e dependem de uma aba aberta. Detalhes e
verificações em `docs/test-controls-notifications.md`; migration publicada:
`202611100001_test_controls.sql`. O teste de navegador dos controles e da
permissão passou com fixtures. A entrega de um aviso real pelo sistema
operacional depende da permissão e configuração do navegador utilizado.

Atualização de 10/11/2026: o botão do header “Minha conta” abre a rota protegida
`/minha-conta`, com nome, e-mail, perfil de acesso e data de criação da conta.
A página lista os coletes autorizados com consulta e edição dos dados do idoso
usando as permissões e a RPC existentes. O acompanhamento continua disponível
na navegação. TypeScript, build e 12 testes direcionados passaram. O teste de
navegador com fixtures validou abertura pelo header, edição persistida pela API
simulada e layout móvel sem overflow. Evidência: `docs/screenshots/account-mobile.png`.
Essa validação não comprova envio do ESP32 físico.

### Já implementado

- Site público com início, Smart Vest, loja, carrinho, suporte e página “Como
  funciona”.
- Login, cadastro, recuperação de senha e rotas protegidas pelo Supabase Auth.
- Painel do cuidador com coletes autorizados, indicadores, histórico,
  conectividade e atualização por Realtime com fallback periódico.
- Botão **Adicionar colete** que aceita o código informado pelo usuário no
  formato `SGE-000`; não existe mais atalho obrigatório para `SGE-001` no
  acompanhamento.
- Fluxo após o código para cadastrar a pessoa idosa: nome, endereço, alergias,
  condições relatadas, contato e consentimento.
- Edição do cadastro conforme a permissão do administrador ou gerente do perfil.
- Notificações internas de possível queda, com ações de verificar, confirmar ou
  descartar e registro da avaliação humana.
- Supabase com RLS, histórico, vínculos por atribuição, auditoria e credencial
  individual de colete armazenada como hash.
- Edge Function `ingest` para o ESP32 enviar telemetria usando
  `X-Device-Token`.
- Idempotência por `message_id`, validação de tipo/unidade, limite de requisições,
  retry seguro e respostas HTTP documentadas.
- Colete `SGE-067` provisionado como colete gerenciado com origem simulada para
  testar o cadastro e o acompanhamento sem depender do hardware.
- Geração de leituras simuladas no banco para `SGE-067`; a origem aparece como
  simulada no painel para não confundir a banca.
- Página `/teste-colete` com simulador visual separado. O simulador local não
  grava no banco e não deve ser apresentado como leitura do ESP32.
- Documentação de telemetria em `docs/telemetry.md`, instalação em `SETUP.md` e
  verificação em `docs/verification.md`.

### O que já foi testado

- Testes unitários e de integração locais.
- Build de produção.
- Fluxos de navegador com fixtures isoladas para autenticação, cadastro,
  dashboard, Realtime, notificações e colete gerenciado.
- Checagem de TypeScript, formatação e scanner de chaves no cliente.
- Consultas remotas confirmaram a existência do projeto Supabase, do colete
  `SGE-067`, do vínculo autorizado e de uma leitura simulada.

### O que ainda não pode ser afirmado

- O ESP32 físico ainda não foi testado enviando uma requisição real para a Edge
  Function.
- Não há firmware, pinagem, lista definitiva de sensores ou projeto Arduino,
  PlatformIO ou MicroPython nesta pasta.
- SIM7600/SIM800-H, Bluetooth, fila offline, rotação de token e reconexão ainda
  precisam ser validados com o hardware real.
- Realtime hospedado, SMTP de produção e deploy público do frontend não são
  comprovados pelos testes com fixtures.
- O site não envia push, SMS, WhatsApp ou e-mail. A notificação atual aparece
  dentro do site enquanto ele está aberto e conectado.
- A detecção de queda depende de um evento enviado pelo firmware. O sistema não
  diagnostica uma queda nem substitui avaliação humana ou atendimento de
  emergência.

## 2. Ordem prioritária para terminar

### Prioridade 0 — bloquear riscos antes da apresentação

- [ ] Confirmar o projeto Supabase correto e manter `site novo` apontando para
      ele em `.env`.
- [ ] Confirmar que `.env` não será apresentado, commitado ou enviado para
      outra IA. Nunca colocar `service_role`, `sb_secret` ou JWT de serviço no
      frontend, no README ou nos slides.
- [ ] Criar uma conta de apresentação e testar login, recuperação e acesso ao
      dashboard com antecedência.
- [ ] Confirmar o papel da conta que será usada na banca: cuidador para mostrar o
      fluxo de cuidado ou administrador para mostrar também administração.
- [ ] Testar `SGE-067` no site real: informar o código, cadastrar uma pessoa de
      teste sem dados reais, acompanhar leituras simuladas e editar o cadastro.
- [ ] Decidir qual dado demonstrativo será usado. Não usar nome, endereço,
      alergia, doença ou telefone reais sem autorização documentada.
- [ ] Deixar um plano B: internet disponível, navegador já aberto e o fluxo
      `/teste-colete` pronto caso o hardware ou a rede 4G falhe.

### Prioridade 1 — integração física

- [ ] Obter o firmware existente ou criar o firmware do ESP32.
- [ ] Confirmar sensores reais e suas unidades: acelerômetro, giroscópio,
      frequência cardíaca, SpO2, temperatura e bateria.
- [ ] Confirmar se o módulo celular é SIM7600 ou SIM800-H. Eles não devem ser
      tratados como equivalentes sem validar modem, comandos AT, suporte HTTPS, SIM,
      APN e alimentação.
- [ ] Gerar um token exclusivo para o colete e armazenar apenas o hash no
      Supabase. O token em texto claro deve existir somente no provisionamento e no
      dispositivo.
- [ ] Fazer o ESP32 enviar uma leitura real com o contrato de
      `docs/telemetry.md`.
- [ ] Confirmar no painel que a origem aparece como **Dispositivo físico** e que
      o horário de recebimento muda.
- [ ] Testar perda de Wi-Fi, fila local, reenvio do mesmo `message_id`, resposta
      429/503, rotação do token e revogação.
- [ ] Enviar um evento `fall_detected` apenas em ambiente de teste e confirmar
      que o sino exibe o aviso sem declarar diagnóstico automático.

### Prioridade 2 — apresentação do produto

- [ ] Revisar textos para a banca: explicar “possível queda”, “consentimento”,
      “origem simulada” e “dados técnicos”, sem prometer função médica certificada.
- [ ] Preparar uma conta de administrador para mostrar coletes, pessoas,
      vínculos, permissões e auditoria.
- [ ] Preparar uma conta de cuidador para mostrar que ela só vê os coletes
      autorizados.
- [ ] Mostrar a página `/como-funciona` antes do login para explicar o produto.
- [ ] Mostrar o dashboard com `SGE-067` e explicar que é um colete gerenciado
      para demonstração; não chamá-lo de colete físico se a leitura vier do
      simulador.
- [ ] Mostrar o colete físico enviando uma leitura real somente depois de
      comprovar o recebimento no banco.
- [ ] Tirar screenshots ou gravar um vídeo curto do fluxo já validado para
      recuperar a apresentação se houver falha de internet.

### Prioridade 3 — acabamento pós-TCC

- [ ] Publicar o frontend em uma hospedagem HTTPS com fallback para
      `index.html`.
- [ ] Configurar Site URL, Redirect URLs, confirmação de e-mail, recuperação e
      SMTP de produção no Supabase.
- [ ] Definir retenção, arquivo e exclusão de telemetria conforme a política do
      projeto. Nenhum expurgo automático está habilitado.
- [ ] Definir limites de ausência de comunicação, janelas operacionais e quem
      recebe cada alerta.
- [ ] Implementar push, e-mail ou SMS somente se houver um provedor, consentimento,
      orçamento e política de segurança aprovados.
- [ ] Corrigir a regressão conhecida de voltar no navegador quando existe um
      rascunho no suporte; a proteção atual cobre cliques e saída da página, mas o
      cenário de voltar nativo ainda está pendente.
- [ ] Fazer teste de carga e medir latência, custo, volume de Realtime e limite
      de armazenamento antes de alegar escala.
- [ ] Fazer revisão de privacidade, LGPD, controle de acesso, logs e dados
      sensíveis antes de usar pessoas reais.

## 3. Roteiro recomendado para a banca

### Antes de começar

1. Abrir o site e confirmar que a URL é a implantação do `site novo`.
2. Abrir o dashboard em uma aba já autenticada com a conta de apresentação.
3. Deixar o colete físico ligado, com bateria suficiente e o ESP32 conectado ao
   Wi-Fi.
4. Confirmar no painel administrativo que o colete está habilitado e vinculado
   à conta da apresentação.
5. Abrir o console do firmware ou um indicador no dispositivo para saber se a
   mensagem foi enviada.

### Sequência de 7 a 10 minutos

1. **Problema e proposta:** abrir `/como-funciona` e explicar que o SAGE conecta
   colete, telemetria e rede de cuidado com consentimento.
2. **Acesso seguro:** entrar com o cuidador e mostrar que o usuário não vê
   coletes sem vínculo autorizado.
3. **Adicionar colete:** clicar em **Adicionar colete**, informar o código do
   colete usado na demonstração e explicar que o código não é fixo no site.
4. **Cadastro da pessoa:** preencher dados demonstrativos do idoso e registrar
   o consentimento. Mostrar que campos desconhecidos não são inventados.
5. **Telemetria física:** fazer o ESP32 enviar uma leitura. Mostrar no painel a
   leitura, o horário de recebimento, a origem física e o estado de conexão.
6. **Queda:** gerar o evento de teste no firmware. Mostrar a notificação de
   possível queda e fazer a avaliação humana pelo sino.
7. **Permissões:** opcionalmente abrir a conta admin e mostrar coletes, vínculos,
   pessoas e auditoria.
8. **Resiliência:** explicar que o Wi-Fi é o canal primário, o SIM7600/SIM800-H
   é contingência e o Bluetooth serve para configuração local/gateway, não para
   substituir a autenticação da nuvem.
9. **Plano B:** se o hardware não responder, abrir `/teste-colete` e declarar
   explicitamente que é uma simulação local para demonstrar a interface, não uma
   leitura física.

### Frases seguras para a apresentação

- “O painel mostra uma possível queda reportada pelo dispositivo; a confirmação
  é humana.”
- “A origem simulada é identificada para não misturar demonstração com dado
  físico.”
- “O cuidador só consulta coletes autorizados por vínculo e consentimento.”
- “O token do colete é individual e o backend guarda somente o hash.”
- “O Wi-Fi é o canal primário; o modem celular é uma contingência que ainda
  precisa ser validada no hardware final.”
- “O protótipo não é diagnóstico médico nem substitui atendimento profissional.”

## 4. Integração do ESP32

O contrato completo está em [`docs/telemetry.md`](docs/telemetry.md). O firmware
deve:

1. sincronizar o relógio por NTP quando houver rede;
2. gerar um `message_id` UUID por leitura e reutilizá-lo em reenvios;
3. enviar HTTPS para:
   `https://SEU_PROJECT_REF.supabase.co/functions/v1/ingest`;
4. enviar `Content-Type: application/json` e `X-Device-Token`;
5. enviar `device_code`, `recorded_at`, `metrics` e, quando necessário, `event`;
6. manter uma fila limitada local para falhas de rede;
7. respeitar backoff e `Retry-After` em 429/503;
8. parar e sinalizar erro de configuração em 400/401/403;
9. nunca registrar token, payload clínico completo ou dados pessoais em logs;
10. usar TLS validado, não desabilitar a verificação de certificado.

Payload mínimo de teste:

```json
{
  "schema_version": 1,
  "message_id": "UUID-NOVO-E-PERSISTENTE-NO-RETRY",
  "device_code": "SGE-067",
  "recorded_at": "2026-11-06T12:00:00Z",
  "metrics": {
    "heart_rate_bpm": 72,
    "spo2_percent": 98,
    "temperature_c": 36.5,
    "battery_percent": 87,
    "accelerometer": { "x": 0.1, "y": 0.2, "z": 9.8, "unit": "m/s2" },
    "gyroscope": null
  },
  "event": null
}
```

O payload acima é um exemplo técnico, não uma leitura real. Atualizar o horário,
UUID e valores no firmware. Não enviar zero para sensor ausente; usar `null` ou
omitir o campo conforme o contrato.

### Queda

O firmware deve enviar `event: "fall_detected"` apenas depois de sua própria
regra local de detecção. O site recebe o evento, exibe como possível queda,
notifica o cuidador e registra a decisão humana. Ainda falta definir com a equipe
do hardware:

- sensores usados para inferir queda;
- limiar, janela temporal e período de imobilidade;
- botão de cancelamento no colete;
- debounce e prevenção de eventos duplicados;
- comportamento sem internet;
- como a pessoa cuidadora será contatada fora do site.

Não inventar esses parâmetros na apresentação como se fossem validados
clinicamente.

## 5. Banco, publicação e ambiente

### Variáveis do frontend

O arquivo `.env.example` lista apenas nomes e padrões seguros:

```text
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_STALE_AFTER_SECONDS=15
VITE_OFFLINE_AFTER_SECONDS=90
VITE_ACTIVE_WINDOW_HOURS=24
```

Somente a URL e a chave pública/publishable podem chegar ao navegador. Chave
secreta, `service_role`, senha de banco e token do colete não podem ter prefixo
`VITE_`.

### Comandos locais

```powershell
Set-Location "C:\Users\Aluno_Tarde\Desktop\sage - site\site novo"
npm ci
npm run dev
```

Verificação antes da apresentação:

```powershell
npm test -- --maxWorkers=1 --no-file-parallelism
npm run typecheck
npm run build
npm run format:check
npm run check:client
```

### Supabase

Para banco novo, executar uma única vez `supabase/setup.sql`. Para o projeto já
existente, aplicar somente migrations pendentes em ordem e publicar a função:

```powershell
supabase link --project-ref SEU_PROJECT_REF
supabase db push
supabase functions deploy ingest
```

Conferir o estado remoto antes de aplicar qualquer SQL. Não executar
`setup.sql` por cima de um banco já instalado e não usar `db reset` no projeto
remoto.

Depois da publicação, testar:

- Auth com a conta de apresentação;
- consulta autorizada do colete;
- cadastro/edição da pessoa;
- leitura real via `ingest`;
- evento de teste e avaliação;
- revogação do vínculo;
- duplicação do mesmo `message_id`;
- token inválido e colete desabilitado.

## 6. Arquivos importantes para a próxima IA

| Arquivo                                     | Papel                                                 |
| ------------------------------------------- | ----------------------------------------------------- |
| `src/App.tsx`                               | Rotas e títulos das páginas                           |
| `src/pages/Caregiver.tsx`                   | Dashboard do cuidador                                 |
| `src/pages/Admin.tsx`                       | Administração de coletes, pessoas e vínculos          |
| `src/pages/VestTest.tsx`                    | Simulador visual local                                |
| `src/features/devices/api.ts`               | Consultas autorizadas de coletes e leituras           |
| `src/features/devices/managed.ts`           | Consulta de código e leitura simulada gerenciada      |
| `src/features/devices/useRandomReadings.ts` | Loop de dados simulados a cada 3 segundos             |
| `src/features/people/profile.ts`            | Cadastro e edição da pessoa idosa                     |
| `src/features/notifications/`               | Alertas, sino e avaliação humana                      |
| `supabase/functions/ingest/`                | Entrada HTTP do colete físico                         |
| `supabase/migrations/`                      | Banco, RLS, auditoria, telemetria e colete gerenciado |
| `docs/telemetry.md`                         | Contrato que o firmware precisa seguir                |
| `SETUP.md`                                  | Instalação e publicação                               |
| `docs/verification.md`                      | Evidências e limites dos testes                       |
| `DESIGN.md`                                 | Direção visual e regras de interface                  |

## 7. Critério de “pronto para o TCC”

Considerar a entrega pronta somente quando todos os itens abaixo forem
verdadeiros:

- [ ] O site abre na URL final ou há uma gravação confiável do fluxo.
- [ ] A conta de apresentação entra sem intervenção manual.
- [ ] O código do colete pode ser digitado pelo usuário.
- [ ] O cadastro da pessoa idosa salva e reaparece após atualizar a página.
- [ ] O ESP32 envia pelo menos uma leitura real e ela aparece no dashboard.
- [ ] A origem da leitura física não é confundida com a simulada.
- [ ] O evento de queda de teste gera notificação e avaliação humana.
- [ ] Uma conta sem vínculo não consegue visualizar o colete.
- [ ] O plano B simulado funciona e é explicado como simulação.
- [ ] Nenhuma chave secreta aparece no cliente, no Git, em screenshots ou nos
      slides.
- [ ] A banca recebe uma explicação honesta sobre o que é protótipo, o que foi
      validado e o que ainda depende de validação clínica/industrial.

## 8. Regra para continuar o desenvolvimento

Antes de implementar nova funcionalidade:

1. verificar se ela já existe neste arquivo ou em `docs/`;
2. preservar a separação entre simulador local, colete gerenciado simulado e
   dispositivo físico;
3. não colocar segredos no frontend;
4. adicionar teste para o fluxo alterado;
5. rodar typecheck, build e os testes relevantes;
6. atualizar este arquivo marcando o item concluído e registrando a evidência.
