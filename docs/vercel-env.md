# Arquivo único de ambiente e Vercel

O arquivo de configuração local agora é somente `.env`, na raiz de `site novo`.
As variáveis existentes foram preservadas. `.env.local` e
`supabase/functions/.env` foram consolidados e removidos.

## Variáveis

- `VITE_SUPABASE_URL`: URL pública do projeto Supabase.
- `VITE_SUPABASE_PUBLISHABLE_KEY`: chave pública/publishable.
- `VITE_STALE_AFTER_SECONDS`, `VITE_OFFLINE_AFTER_SECONDS`,
  `VITE_ACTIVE_WINDOW_HOURS`: opções de acompanhamento.
- `NVIDIA_API_KEY`: chave privada da NVIDIA, exclusiva de backend.
- `NVIDIA_MODEL`: modelo configurado na função de análise.

O `.env.example` é apenas um modelo vazio para referência; não é um segundo
arquivo carregado pela aplicação. O `.env` está ignorado pelo Git.

## Vercel

Crie o projeto usando `site novo` como pasta raiz e o preset Vite. O comando de
build é `npm run build` e a pasta de saída é `dist`.

Em Settings → Environment Variables, importe o conteúdo do `.env`. As variáveis
`VITE_*` são públicas e entram no bundle. Não use esse prefixo para chaves
NVIDIA, service_role ou outras credenciais privadas. Faça novo deployment depois
de alterar variáveis usadas no build.

O backend continua no Supabase: importar a chave NVIDIA na Vercel não a envia
automaticamente à Edge Function. Para publicar o mesmo `.env` no Supabase:

```powershell
npx supabase secrets set --project-ref negrojohnpjfwwuokldx --env-file .env
```

Preencha `NVIDIA_API_KEY` antes de executar. O comando também cadastra as
variáveis públicas no ambiente da função, mas não as utiliza para autenticação
do backend. Não adicione variáveis reservadas `SUPABASE_*` ao arquivo; elas são
fornecidas pelo ambiente hospedado. Para testar a função localmente:

```powershell
npx supabase functions serve weekly-analysis --env-file .env
```

Configure ainda a URL final e os redirects do Auth no painel Supabase e o
fallback de rotas da SPA na hospedagem para que `/dashboard`, `/relatorios` e
`/minha-conta` abram ao atualizar a página. Isso é separado das variáveis.
