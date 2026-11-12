# Análise semanal com IA NVIDIA

Atualização de ativação (10/11/2026): `NVIDIA_API_KEY` e `NVIDIA_MODEL` foram
publicados nos secrets do Supabase a partir do `.env` local. Uma inferência real
com agregados exclusivamente sintéticos retornou HTTP 200 e JSON válido, usando
o mesmo handler de produção. Esse teste isolou o provedor; o fluxo completo
hospedado ainda deve ser repetido com a conta autorizada no site.

Integração adicionada em 10/11/2026. Modelo padrão:
`nvidia/nemotron-3.5-bolt-e4b`, disponível como Free Endpoint para protótipos
na [página oficial da NVIDIA](https://build.nvidia.com/nvidia/nemotron-3.5-bolt-e4b).
Isso não representa garantia de gratuidade ilimitada: disponibilidade, termos e
limites são definidos pela NVIDIA e pela conta utilizada.

## Configurar a chave

Foi criado `.env`, ignorado pelo Git, com:

```dotenv
NVIDIA_API_KEY=
NVIDIA_MODEL=nvidia/nemotron-3.5-bolt-e4b
```

Gere uma chave em build.nvidia.com e preencha `NVIDIA_API_KEY` nesse arquivo.
Nunca use `VITE_NVIDIA_API_KEY`. O frontend não pode receber a chave.

Para publicar os secrets no projeto Sage, execute na pasta `site novo`:

```powershell
npx supabase secrets set --project-ref negrojohnpjfwwuokldx --env-file .env
```

Preencha a chave antes de executar. A função `weekly-analysis` já foi publicada.
Editar apenas o arquivo local não altera os secrets da função hospedada.
Para desenvolvimento local:

```powershell
npx supabase functions serve weekly-analysis --env-file .env
```

## Usar no site

1. Selecione Premium em `/planos` (modo demonstrativo, sem cobrança).
2. Em `/relatorios`, escolha o colete e a semana com amostras.
3. Marque a autorização para enviar agregados à NVIDIA.
4. Clique em **Gerar relatório com IA NVIDIA**.

O relatório contém resumo, observações, sugestões para aprimorar o
acompanhamento e pontos que precisam de verificação humana. Pode ser incluído
na impressão/PDF do relatório pelo botão existente.

Uma chamada real ainda depende da chave da conta NVIDIA. Sem a chave, a função
retorna `nvidia_not_configured`; nenhum texto por regras é apresentado como se
tivesse sido gerado pela IA. O botão de análise demonstrativa permanece separado.

## Dados e autorização

- JWT validado com Supabase Auth; plano Premium e autorização sobre o colete
  conferidos por RPC. O vínculo é revalidado depois da geração.
- A função obtém o relatório do banco; não aceita estatísticas enviadas pelo
  navegador como fonte confiável.
- Envia somente agregados: período, contagem de amostras, origens, métricas,
  distribuição diária e contagem de eventos. Não envia nome, endereço, telefone,
  código/UUID do colete, alergias ou histórico de doenças.
- Limite de três tentativas por minuto por conta, reservado no banco antes de
  chamar a NVIDIA. A cota do provedor pode impor limites adicionais.
- Prompt orienta a separar simulação de medição física e não diagnosticar,
  prescrever ou afirmar que a pessoa está bem. A página sempre esclarece a
  impossibilidade de confirmar estado de saúde somente com o colete.
- Resposta precisa ser JSON válido e completo, com tamanho limitado. Falhas,
  respostas truncadas, 429 e mudança de autorização são tratados sem divulgar
  respostas privadas do provedor ou credenciais.
- Não há geração automática agendada, treinamento de modelo ou envio de
  relatórios por e-mail. A análise é solicitada pelo usuário.

## Publicação e testes

Migration `202611100004_ai_quota.sql` e função `weekly-analysis` publicadas no
projeto Sage. A chave estava ausente na primeira publicação; foi configurada
posteriormente, conforme a atualização de ativação no início deste documento.
Testes HTTP usam respostas injetadas do provedor; não comprovam inferência real.
Testes cobrem autenticação, consentimento, Premium, quota, minimização de dados,
falta de chave, ausência de amostras, erros do provedor e revogação durante a
análise. Deno check validou a função.

Contrato do provedor:
[NVIDIA NIM LLM API](https://docs.api.nvidia.com/nim/reference/llm-apis),
`POST https://integrate.api.nvidia.com/v1/chat/completions`.
