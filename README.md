# SAGE Smart Vest

Firmware demonstrativo ESP32: [instruções, LEDs e contato do colete](firmware/sage_demo/README.md).
Identificação `001` / `SGE-004`. Preencha o Wi-Fi no `.env`, execute
`npm run esp:prepare` e grave `firmware/sage_demo/sage_demo.ino` pela Arduino IDE.

Visualizador conceitual 3D: execute `npm run dev` e abra
`http://localhost:3000/modelo`. Instruções, controles, referências e limites em
[Modelo 3D](docs/modelo-3d.md). A porta 3000 é fixa; se estiver ocupada, o Vite
informa o erro em vez de escolher outra porta.

Configuração: use o único `.env` da raiz. Guia para importar na Vercel e
publicar os secrets de IA: [ambiente e Vercel](docs/vercel-env.md).

Backend publicado no projeto Supabase `Sage` em 22/10/2026 e atualizado em
26/10/2026. Estado, verificacoes remotas e pendencias:
[registro de implantacao](docs/deployment-2026-10-26.md).
O banco existente ja foi atualizado: nao execute `setup.sql` novamente nele.

Auditoria incremental do pedido de backend: [cobertura e testes de 22/10](docs/backend-audit-2026-10-22.md).
Regras técnicas de comunicação são opt-in: [configuração do monitor](docs/technical-monitor.md).

Aplicação React recuperada do MVP. Site público, referências de cor, carrinho de intenção, Supabase Auth, painéis por perfil, gestão de vínculos, suporte interno e contrato de telemetria ESP32.

## Executar localmente

Guia completo de instalação e atualização do backend: [SETUP.md](SETUP.md). Contratos de consulta e autorização dos dashboards: [docs/dashboard-api.md](docs/dashboard-api.md).

Requer Node.js 22.12+ ou 24 LTS e npm. Neste ambiente foi possível compilar com Node 22.11; prefira uma versão LTS atualizada no ambiente de desenvolvimento.

```powershell
cd "site novo"
npm ci
Copy-Item .env.example .env
npm run dev
```

Acesse `http://localhost:3000`. Sem Supabase configurado, o site e a loja funcionam; entrada e rotas privadas explicam a configuração pendente. As rotas reais não usam dados de demonstração. O [teste local SGE-001](docs/vest-simulator.md) fica separado em `/teste-colete`, com dados explicitamente simulados, sem gravação no banco. Para produção: `npm run build`; publicar `dist` em hospedagem com fallback de rotas para `index.html`.

`VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` devem apontar para seu projeto Supabase. A chave é a pública (publishable ou anon), nunca service_role. `VITE_STALE_AFTER_SECONDS=15` define recebimento recente; `VITE_ACTIVE_WINDOW_HOURS=24` define janela de atividade observada. Reinicie Vite após mudar essas variáveis.

## Rotas do site

Para abrir localmente, acrescente a rota a `http://localhost:3000`.

| Rota             | Página                                                         | Acesso        |
| ---------------- | -------------------------------------------------------------- | ------------- |
| `/`              | Início                                                         | Público       |
| `/loja`          | SAGE Smart Vest                                                | Público       |
| `/modelo`        | Visualizador 3D conceitual                                     | Público       |
| `/como-funciona` | Como funciona                                                  | Público       |
| `/carrinho`      | Carrinho de intenção                                           | Público       |
| `/auth`          | Login, cadastro e recuperação de acesso                        | Público       |
| `/planos`        | Planos demonstrativos                                          | Público       |
| `/teste-colete`  | Simulador local do SGE-001, sem gravação no banco              | Público       |
| `/dashboard`     | Acompanhamento dos coletes                                     | Login         |
| `/minha-conta`   | Dados da conta e edição autorizada dos dados do idoso          | Login         |
| `/teste_colete`  | Controle dos dados simulados dos coletes autorizados           | Login         |
| `/relatorios`    | Relatórios semanais; análise por IA exclusiva do plano Premium | Login         |
| `/suporte`       | Suporte interno                                                | Login         |
| `/admin`         | Administração                                                  | Administrador |

`/teste-colete` e `/teste_colete` são páginas diferentes. Endereços não
cadastrados exibem a página 404. As páginas privadas também verificam as
permissões do usuário para acessar cada colete.

### Publicar na Vercel

Use a raiz deste repositório como Root Directory, preset **Vite**, comando
`npm run build` e Output Directory `dist`. Configure as variáveis públicas
`VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` antes do build, conforme
o [guia de ambiente](docs/vercel-env.md). As credenciais do ESP32 e a chave
NVIDIA não devem entrar no frontend.

O arquivo `vercel.json` mantém o fallback da SPA para `index.html`, permitindo
abrir diretamente ou atualizar rotas como `/dashboard` e `/modelo`. A porta
3000 se aplica somente ao desenvolvimento local. Antes de publicar, execute:

```powershell
npm ci
npm test
npm run build
npm run check:client
```

## Configurar Supabase

### Instalação com um único SQL

1. No projeto Supabase novo, abra **SQL Editor** e execute todo o arquivo [supabase/setup.sql](supabase/setup.sql). Ele reúne tabelas, funções, gatilhos, permissões, RLS, Realtime e perfis de contas existentes em uma transação.
2. Em **Authentication → Providers**, habilite e-mail/senha. Configure a confirmação de e-mail conforme o ambiente.
3. Em **Authentication → URL Configuration**, configure a Site URL (`http://localhost:3000` localmente) e permita `http://localhost:3000/auth` e `http://localhost:3000/auth?mode=update`. Na hospedagem, use as URLs HTTPS reais.
4. Copie `.env.example` para `.env` e preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` com a URL e a chave pública do mesmo projeto. Reinicie `npm run dev`.
5. Crie sua conta em `/auth`, confirme o e-mail quando exigido e entre. Para liberar administração, siga “Primeiro administrador” abaixo.

O SQL é para PostgreSQL/Supabase, não MySQL. A autenticação é gerenciada pelo Supabase Auth; habilitar o provedor, configurar envio de e-mails e conectar o frontend não pode ser substituído por SQL. A telemetria ESP32 também requer a Edge Function `ingest`, descrita abaixo.

Escolha **setup.sql ou migrations** para instalar; não execute ambos no mesmo banco. O arquivo de instalação não apaga nem substitui tabelas existentes e não deve ser reaplicado. Para atualizar um banco existente, consulte a ordem completa no SETUP e aplique somente as versões pendentes em `supabase/migrations`. As atualizações preservam perfis/históricos, acrescentam isolamento por atribuição, auditoria, contratos administrativos e monitor técnico opcional.

Para atualizar o arquivo único após alterar migrations, execute `npm run db:bundle`. Nenhuma senha ou conta administrativa padrão é criada.

Use um projeto novo ou uma instância de desenvolvimento dedicada. As migrations não fazem conversão dos esquemas MySQL do legado. Com Supabase CLI instalado e Docker disponível, execute na pasta desta aplicação:

```powershell
supabase start
supabase db reset
supabase functions serve ingest
```

`db reset` apaga o banco local dessa instância: use somente para desenvolvimento descartável. Para um projeto remoto escolhido por você, revise migrations, vincule o projeto com `supabase link --project-ref SEU_PROJECT_REF` e aplique com `supabase db push`. O estado do projeto já implantado está no registro de implantação acima; não confunda a instalação nova com a atualização incremental.

No Auth, habilite e-mail/senha, configure confirmação de e-mail e recuperação. Configure Site URL para a origem da aplicação e permita `/auth` e `/auth?mode=update` nas Redirect URLs. Em produção utilize a origem HTTPS real. O envio de confirmação/recuperação depende do serviço de e-mail do Supabase e da configuração do projeto.

As migrations criam perfis, pessoas, coletes, vínculos, telemetria, alertas e suporte com RLS. `private.device_credentials` não é exposta pela API. `supabase_realtime` recebe as tabelas necessárias quando a publicação existe. Confira também, no painel do Supabase, se Realtime está habilitado para `telemetry`, `devices`, `alerts` e `caregiver_device_links`.

### Primeiro administrador

1. Crie sua conta pelo formulário e confirme o e-mail.
2. Em ambiente administrativo confiável (SQL Editor), localize o UUID correto em Auth/Users.
3. Execute o SQL abaixo substituindo apenas o UUID. Não existe promoção pelo navegador ou por metadados de cadastro.

```sql
update public.profiles
set role = 'admin'
where id = 'UUID_DA_CONTA_CONFIRMADA';
```

Saia e entre novamente. O mesmo processo administrativo controla futuras promoções. Usuários comuns não conseguem alterar a coluna `role`.

### Vínculos e consentimento

Na tela **Acompanhamento**, o botão **Adicionar colete** aparece ao lado de
**Meus coletes**. Administradores informam o código, como `SGE-001`, e seguem
para **Dados do idoso**: nome, endereço opcional, alergias, condições informadas,
contato e registro de autorização. Alergia desconhecida permanece “Não informado”.
O salvamento vincula a pessoa ao colete; um cadastro existente é preenchido para
edição. Se o formulário for fechado, o colete permanece na lista e o cadastro
pode ser retomado em **Completar cadastro**. Nenhuma leitura é inventada.
Cuidadores informam o código do colete. Se ainda não houver autorização, o
formulário também pede o código de ativação. Um código impresso, sozinho,
continua sem conceder acesso a um colete alheio.

O menu da conta oferece **Informar código do colete**, sem um identificador fixo.
Para validar o cadastro e sua edição, o SGE-067 utiliza a mesma tela de
acompanhamento e tem gestão de perfil concedida especificamente à conta
autorizada. As leituras são geradas no servidor a cada três segundos enquanto
esse colete estiver aberto e a página visível. **Pausar dados aleatórios**
interrompe a geração. A origem simulada fica registrada no banco e junto aos
valores; nenhuma amostra é apresentada como medição do idoso.

No painel administrativo: cadastre a pessoa com nome de exibição, registre consentimento e sua referência, cadastre o colete `SGE-001` vinculando a pessoa e conceda acesso a um cuidador cadastrado. Revogar o vínculo ou retirar consentimento impede novas consultas ao banco imediatamente. A tela revalida autorização no máximo a cada 15 s e remove os dados quando detecta revogação.

Trocar a pessoa do colete limpa a última leitura e preserva o histórico anterior apenas no escopo administrativo. Cuidadores não recebem leituras da pessoa anterior. Reenvios com data anterior ao vínculo atual da pessoa são recusados. Para corrigir um vínculo feito por engano, revise o procedimento administrativamente antes de reutilizar o equipamento.

Nomes de perfis são consultáveis no admin; promoção de papéis continua fora da SPA. Não há exclusão definitiva nem desativação de contas pela interface nesta versão. Pessoas, contatos, coletes e vínculos são administrados nos respectivos formulários.

## Telemetria e segurança do dispositivo

Leia [docs/telemetry.md](docs/telemetry.md) para payload, provisionamento de token, cURL, erros, reenvios e escala. A Edge Function usa a chave privilegiada somente no servidor. Credencial de cada ESP32 é individual; o firmware não recebe chave service_role nem chave de outro dispositivo.

Para implantar a função no projeto escolhido: `supabase functions deploy ingest`. `verify_jwt=false` é intencional: o ESP32 utiliza `X-Device-Token`, validado no handler e na transação SQL. Uma requisição sem credencial válida continua sendo recusada.

## Loja e suporte

As cores descrevem os arquivos visuais existentes, não disponibilidade comercial. As imagens são conceituais, contêm marcas/textos não confirmados e recebem legendas explícitas. Não há preço, gateway, cobrança, reserva de estoque ou coleta de cartão.

O carrinho guarda somente variante e quantidade no navegador. Ao continuar, a pessoa entra na conta e revisa uma mensagem de interesse antes de enviá-la ao suporte interno. Mensagens são persistidas no Supabase, com chaves idempotentes para repetição. Não há integração de envio por e-mail, telefone ou aplicativos externos.

Configuração comercial fica em `src/features/catalog/product.ts`: `price` em reais permanece null e `availabilityLabel` informa o desenvolvimento. Só preencha dados confirmados pela equipe. Alterar essas informações não habilita pagamento ou reserva de estoque.

O SAGE não faz diagnóstico e não substitui profissionais de saúde ou serviços de emergência. Limiares clínicos, sensores definitivos e firmware não estão confirmados. O endereço é informado no cadastro; não há rastreamento GPS.

## Notificações no site

O sino mostra possíveis quedas pendentes dos coletes autorizados, com aviso no
site, atualização por Realtime e consulta a cada 15 segundos. “Estou verificando”
registra acompanhamento. “Confirmar ocorrência” e “Descartar alerta” pedem uma
avaliação humana e preservam o evento e a autoria no histórico. A contagem é de
pendências, não de mensagens não lidas. Não há entrega com o navegador fechado
nem envio externo. O firmware reporta o evento; o site não inventa um classificador
físico de queda. Reenvios do mesmo message_id continuam idempotentes.

Em **Testar SGE-001**, a queda simulada também abre um aviso com ações locais.
Esse teste não grava dados pessoais, leituras ou alertas no Supabase.

## Verificação

```powershell
npm test
npm run typecheck
npm run build
npm run format:check
```

`tests/database.test.ts` executa as migrations e as políticas em PostgreSQL embarcado (PGlite), com uma função Auth de teste que define a identidade. Isso valida SQL e RLS, mas não substitui testes do Auth, PostgREST, Realtime e Edge Runtime do seu Supabase.

`node tests/browser.mjs` verifica o site público com o servidor em 3000. `node tests/browser-auth.mjs` usa outro servidor em 5174 e respostas HTTP simuladas explicitamente isoladas em testes. Para esse segundo servidor, configure somente no processo de teste `VITE_SUPABASE_URL=http://127.0.0.1:54399` e `VITE_SUPABASE_PUBLISHABLE_KEY=public-test-fixture-only`. Os scripts usam Chrome instalado no caminho do Windows indicado no código; ajuste em outros sistemas. Não utilize as variáveis fictícias na instância normal.

Veja [docs/verification.md](docs/verification.md) para resultados, limites e pendências. O mapa de recuperação e o inventário completo estão em `../docs/recovery-map.md` e `../docs/legacy-inventory.json`.
