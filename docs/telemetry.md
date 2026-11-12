# ESP32 → ingest → Supabase

Contrato de integração proposto v1. Não foi encontrado firmware no workspace; os campos opcionais não confirmam sensores disponíveis. Antes de conectar hardware, alinhe nomes, unidades, relógio e eventos com a equipe do firmware.

## Credencial individual

1. Cadastre o dispositivo no admin com um código único `SGE-###` e habilite-o.
2. Gere um token aleatório de pelo menos 32 bytes em um gerenciador seguro e codifique em base64url sem padding (ou hexadecimal), com 32 a 256 caracteres ASCII entre `A-Z`, `a-z`, `0-9`, `_` e `-`. Grave o token somente no dispositivo e no meio de provisionamento seguro. Não use um token compartilhado por toda a frota. Prefixos `sb_`/`sbp_`, JWTs, espaços e outros símbolos são recusados: chaves administrativas/públicas do Supabase não são credenciais de colete.
3. Calcule SHA-256 do token fora do banco e use a função administrativa de provisionamento abaixo. Não cole o token em texto claro no SQL Editor, no repositório ou em logs.

```sql
select public.rotate_device_credential(
  (select id from public.devices where code='SGE-001'),
  'HASH_SHA256_HEXADECIMAL_DE_64_CARACTERES',
  'UUID_DO_ADMINISTRADOR',
  'Provisionamento inicial'
);
```

O placeholder deve ser substituído por um hash real. A operação é exclusiva do SQL Editor/backend com papel de serviço; o ator informado precisa ser um administrador existente. Para rotação, repita com hash de token novo e reprovisione o equipamento; a versão é incrementada e a credencial antiga deixa de funcionar. Para revogar, use `revoke_device_credential(device_uuid, admin_uuid, motivo)`. O histórico administrativo registra ator/horário/versão, sem copiar hash ou token. Desabilitar um colete também bloqueia ingestão. Não há endpoint público para gerar ou recuperar tokens.

## Payload

```json
{
  "schema_version": 1,
  "message_id": "b7c77d14-7f70-4de5-a355-bc62733d2077",
  "device_code": "SGE-001",
  "recorded_at": "2026-10-19T17:24:00Z",
  "metrics": {
    "heart_rate_bpm": null,
    "spo2_percent": null,
    "temperature_c": null,
    "battery_percent": null,
    "accelerometer": null,
    "gyroscope": null
  },
  "event": null
}
```

- `message_id`: UUID novo por leitura; mantenha o mesmo identificador em reenvios. UUID não pode ser reutilizado para outra leitura.
- `recorded_at`: ISO 8601 com timezone; prefira UTC `Z`. Persistência usa timestamptz; `received_at` é atribuído pelo servidor. Configure NTP no dispositivo. A data fixa do exemplo deve ser atualizada no teste.
- `metrics`: objeto obrigatório; `{}` é válido. Campos opcionais podem estar ausentes ou null. Null não se transforma em zero. Campos desconhecidos são rejeitados.
- `heart_rate_bpm`: número finito não negativo em bpm. `spo2_percent` e `battery_percent`: número entre 0 e 100. `temperature_c`: número finito em °C. São verificações de tipo/unidade, sem limiares de alerta clínico.
- `accelerometer`: null ou `{"x":0.1,"y":0.2,"z":9.8,"unit":"m/s2"}`. Eixos em m/s²; não enviar valores brutos do sensor sem conversão documentada.
- `gyroscope`: null ou objeto com eixos finitos `x`, `y`, `z` e `unit:"rad/s"`. Campo reservado do contrato; não comprova sensor ou firmware implementado. Se a medição não existir, omita ou envie null. Unidades e conversão precisam ser confirmadas com a equipe do firmware.
- `event`: null, `device_test` ou `fall_detected`. Possível queda é um evento reportado pelo firmware; a API não confirma queda nem diagnóstico. Texto operacional solicita verificação de contexto.

## Limites técnicos e respostas

Uma leitura por requisição, corpo máximo 16 KiB, futuro até 60 s e atraso até 7 dias. A leitura do corpo e a chamada do banco têm prazos independentes de 5 s, com cancelamento. Leituras anteriores à atribuição atual são recusadas para evitar mistura de históricos. Conteúdo precisa ser JSON válido em UTF-8; campos desconhecidos, tipos/unidades incorretos e versões não suportadas são rejeitados.

| Variável da função           | Padrão | Valores aceitos               |
| ---------------------------- | ------ | ----------------------------- |
| `MAX_BODY_BYTES`             | 16384  | inteiro 1–65536 bytes         |
| `MAX_FUTURE_SECONDS`         | 60     | número finito 0–3600 segundos |
| `MAX_AGE_DAYS`               | 7      | número finito 0–30 dias       |
| `DEVICE_MESSAGES_PER_MINUTE` | 120    | inteiro 1–600                 |
| `BODY_READ_TIMEOUT_MS`       | 5000   | inteiro 1–30000 ms            |
| `STORE_TIMEOUT_MS`           | 5000   | inteiro 1–30000 ms            |

Configuração explícita inválida impede a inicialização da função. Os limites são técnicos, não clínicos. Restrinja inundação distribuída e tentativas não autenticadas também no gateway da implantação; a janela por dispositivo só se aplica depois de autenticar sua credencial e não é um limitador global/IP.

Até 120 mensagens novas/minuto/dispositivo, configurável por `DEVICE_MESSAGES_PER_MINUTE`. Janela transacional de um minuto por dispositivo. Duplicatas aceitas não geram outra linha, não avançam o último recebimento e não recriam alertas. O lock no dispositivo serializa escritas concorrentes; a restrição unique reforça idempotência. Testes locais verificam ordenação e duplicação; carga com múltiplas conexões depende de ambiente externo.

Reutilizar o mesmo `message_id` com timestamp/métricas/evento diferentes retorna 409 e não altera dados ou cota. Datas equivalentes com offsets diferentes representam a mesma leitura. Duplicatas antigas passam pela autenticação/estado atual, mas não alteram a nova atribuição. Para datas de leitura iguais, a última linha aceita desempata por `id`, coerente com a ordenação do histórico.

| HTTP | Resultado                                                                                         |
| ---- | ------------------------------------------------------------------------------------------------- |
| 200  | `{"accepted":true,"duplicate":false,"received_at":"..."}` ou `{"accepted":true,"duplicate":true}` |
| 400  | `invalid_payload` ou `reading_predates_assignment`                                                |
| 401  | `unauthorized`, inclusive código desconhecido/credencial incompatível                             |
| 403  | `device_disabled`                                                                                 |
| 405  | método diferente de POST                                                                          |
| 408  | `request_timeout`, leitura do corpo interrompida ou fora do prazo                                 |
| 409  | `idempotency_conflict`, identificador reutilizado com conteúdo diferente                          |
| 413  | `payload_too_large`                                                                               |
| 415  | `json_required`                                                                                   |
| 429  | `rate_limited`, com Retry-After de 60 s                                                           |
| 503  | `temporarily_unavailable`                                                                         |

Respostas não retornam tokens, pessoas ou dados clínicos. A ingestão não usa CORS para navegadores: é um endpoint de dispositivos, e clientes web não devem escrever telemetria.

Sucesso significa que a função recebeu a confirmação de persistência. Em timeout/queda de rede, a transação pode ter sido confirmada antes da interrupção da resposta; repita **o mesmo** `message_id`. A deduplicação reconcilia esse resultado sem duplicar amostras ou eventos. Erros internos retornam apenas `temporarily_unavailable`; resultados do banco são validados e restritos antes de responder.

Toda resposta inclui `X-Request-ID`. Logs JSON contêm somente `request_id`, `status`, `outcome`, `duration_ms`; não contêm cabeçalhos, token/hash, corpo integral, pessoa ou métricas. No ambiente de observabilidade, agrupe por status/outcome para acompanhar autenticação, validação, aceitação, duplicatas e falhas/timeouts de persistência. Falhas de conectividade do colete são calculadas pela última recepção, e falhas de transporte Realtime aparecem separadamente na interface. Retenção e acesso aos próprios logs também exigem política do ambiente.

A migration `202610220001_ingest_hardening.sql` faz uma pré-verificação de credencial sem locks antes da implementação transacional privada. A transação verifica novamente estado e credencial sob lock para cobrir rotação/revogação concorrentes. Credenciais inválidas não entram nessa seção serializada. A função privada não é executável pelos papéis da API.

Regras técnicas opcionais de ausência de comunicação, com versão, autor e histórico de recuperação, estão documentadas em [technical-monitor.md](technical-monitor.md). Nenhuma regra ou tarefa periódica é habilitada automaticamente.

## Testar via HTTP

Salve um payload atualizado em `payload.json`, sem segredos. As variáveis do exemplo são valores do seu ambiente, não credenciais incluídas no projeto. No PowerShell, use `curl.exe`:

```powershell
curl.exe --request POST "$env:SAGE_INGEST_URL" `
  --header "Content-Type: application/json" `
  --header "X-Device-Token: $env:DEVICE_TOKEN" `
  --data-binary "@payload.json"
```

URL local: `http://127.0.0.1:54321/functions/v1/ingest`. URL hospedada: `https://SEU_PROJECT_REF.supabase.co/functions/v1/ingest`. Evite `--verbose` e mecanismos que registrem cabeçalhos. Após um 200, reenvie o mesmo corpo para conferir `duplicate:true`. Remova o cabeçalho para conferir 401; use bateria como string para conferir 400. Não registre as variáveis de credencial no histórico ou logs.

## Realtime e histórico

O frontend consulta somente os dispositivos permitidos por RLS e assina Realtime filtrado pelo dispositivo selecionado. A autorização e o cache seguem `assignment_id` além de pessoa/dispositivo. Cada nova leitura atualiza a primeira página em memória, até 25 linhas; não recarrega todo o histórico. Ao reconectar, há revalidação e consulta limitada, inclusive se uma revalidação periódica já estiver em andamento. Sem Realtime, a página atual tem fallback a cada 15 s. A conexão ao vivo tem feedback independente do horário do último recebimento.

Leitura mais recente usa `recorded_at`; conectividade usa `received_at`. Um reenvio antigo válido pode atualizar o recebimento, mas não substituir a leitura mais recente. Reenvios duplicados não indicam que o equipamento voltou a produzir dados. Depois de 15 s sem recebimento, o painel informa desatualização; depois de 90 s, ausência prolongada de comunicação/offline. Colete desabilitado também fica offline; ausência de dados não é zero nem normalidade. As janelas são configuráveis, sem garantia de monitoramento contínuo.

Revogação impede novas consultas via RLS imediatamente; tela revalida autorização no máximo a cada 15 s e ao reconectar. Não há como apagar informações já vistas ou copiadas legitimamente por um usuário antes da revogação.

## Escala, custo e retenção

Envio nominal de 2 s produz 30 leituras/minuto, 43.200/dia por dispositivo. Por exemplo, 100 dispositivos representam 4.320.000 leituras/dia antes de agregação. Não há afirmação de capacidade de plano: meça escrita, índices, Realtime, rede e consultas no ambiente escolhido.

Índice `(device_id, recorded_at desc, id desc)` e páginas de 25 limitam consultas. Contagem exata de históricos muito grandes pode ficar cara; planeje contagem estimada/cursor e agregações por minuto/hora conforme o volume. O índice unique dispositivo/mensagem aumenta custo de escrita, mas é necessário para idempotência.

Não há expurgo automático habilitado. Antes de definir retenção, obtenha uma política aprovada para dados pessoais, necessidade acadêmica e possibilidade de arquivamento. Para escala maior, planeje particionamento temporal, agregados com quantidade de amostras e cobertura, arquivo seguro e exclusão administrativa auditada. Não preencher lacunas com zeros ou interpolação silenciosa.

A política de retenção futura deve fornecer parâmetros separados para dias de dados brutos, granularidade dos agregados e prazo do arquivo, com autor/data/versão e acesso restrito. Implemente o agendamento somente após definição desses parâmetros; não há exclusão silenciosa ativada por esta entrega. Agregados devem preservar contagem de valores não nulos por métrica e cobertura temporal; retenção de auditoria e identificadores exige avaliação própria. Avaliar privacidade, base de tratamento e controles operacionais antes de uso com dados reais.

## Próximos passos do firmware

Confirmar sensores/unidades; sincronizar relógio; gerar UUID persistente por leitura; configurar HTTPS e token individual; enviar a cada 2 s nominalmente; manter fila limitada de reenvio; aplicar backoff com jitter em 429/503 e falhas de rede; respeitar Retry-After; não repetir indefinidamente 400/401/403 sem corrigir configuração. Testar desconexão, fila antiga, rotação de credencial e revogação de vínculo antes de uso real.
