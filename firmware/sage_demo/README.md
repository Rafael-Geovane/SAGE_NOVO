# ESP32 demonstrativo — ID 001 / SGE-004

Este firmware usa **Arduino IDE**, Arduino-ESP32 e **ArduinoJson 7**. É uma
demonstração com dados fictícios. Não lê MAX30102, MAX30205 ou BMI160 nem detecta
quedas reais. A integração dos sensores físicos é um trabalho separado.

## Funcionamento

| Estado                                                           | Vermelho (25) | Verde (26)            | Dados no dashboard          |
| ---------------------------------------------------------------- | ------------- | --------------------- | --------------------------- |
| ESP ligado, contato aberto                                       | Aceso         | Apagado               | Não envia novas leituras    |
| Contato fechado, sem Wi-Fi/horário/TLS ou sem aceite do servidor | Aceso         | Apagado               | Não confirma envio          |
| Colete conectado e Supabase confirma uma leitura                 | Apagado       | Aceso                 | Atualiza o histórico        |
| Contato aberto novamente                                         | Aceso         | Apagado imediatamente | Para os novos envios        |
| Falha de rede/servidor ou confirmação antiga                     | Aceso         | Apagado               | Mantém o histórico anterior |

O sinal de presença é enviado a cada aproximadamente 3 segundos, mesmo com o
ESP fora do colete, sem métricas de saúde. O servidor exige contato fechado e
presença recente (até 12 segundos) para persistir leituras do SGE-004. O painel
atualiza esse estado com consultas a cada 2 segundos. Ao desligar o ESP, a
ausência é inferida pelo prazo de presença; o servidor não recebe um aviso
instantâneo de corte de energia.

O LED verde exige HTTP 200 e `accepted:true` da ingestão. Ter Wi-Fi ou receber
apenas confirmação do heartbeat não acende o verde. A confirmação vence após
10 segundos sem novo aceite. A rede roda em uma tarefa separada, mantendo a
leitura do contato e os LEDs responsivos durante requisições HTTPS.

Uma requisição que já estava em trânsito ao retirar o contato ainda pode ter
sido aceita antes de o servidor receber a desconexão. O firmware não inicia
novas leituras com contato aberto; o prazo no servidor limita a presença antiga.

## Ligações confirmadas

- GPIO **25** → resistor **330 Ω** → ânodo do LED vermelho; cátodo → GND.
- GPIO **26** → resistor **330 Ω** → ânodo do LED verde; cátodo → GND.
- GPIO **27** → contato do conector do colete; o outro contato → GND do ESP.
- O jumper de retorno fica no colete: ao encaixar, fecha o circuito 27–GND.
  Ao retirar, o circuito abre. O código usa `INPUT_PULLUP`.

O contato representa encaixe elétrico, não comprova que uma pessoa está vestindo
o colete. Não conecte 5 V ou a bateria LiPo diretamente ao GPIO. Estes pinos são
para um ESP32 clássico compatível; confira a identificação da placa antes de
ligar. Os LEDs são externos e ativos em nível alto.

## Identificação e dados

“ID 001” é a etiqueta local exibida na Serial. O identificador do protocolo é
`device_code: "SGE-004"`, equivalente ao “sge_identifier: SGE 004” solicitado.
O banco usa UUID internamente. Não envie chaves extras `ID`, `sge_identifier`
ou `sensor_de_coracao` no JSON: o contrato de ingestão valida os nomes abaixo.

```json
{
  "schema_version": 1,
  "device_code": "SGE-004",
  "message_id": "UUID-V4-NOVO-POR-LEITURA",
  "recorded_at": "HORARIO-UTC-ATUAL",
  "metrics": {
    "heart_rate_bpm": 72,
    "spo2_percent": 98,
    "temperature_c": 36.5,
    "battery_percent": 85,
    "accelerometer": { "x": 0.02, "y": 0.01, "z": 9.8, "unit": "m/s2" },
    "gyroscope": null
  },
  "event": null
}
```

A temperatura fica em 36,5 °C, batimentos variam entre 70–76 bpm, SpO₂ entre
97–99% e a bateria fica em 85%. São valores de demonstração, não uma avaliação
do estado de saúde nem leituras reais da bateria. Nenhuma queda é sorteada.

Na Serial a **115200 baud**, envie `F` para uma possível queda **simulada** ou
`T` para `device_test`, com o colete conectado. A queda aparece no sino e exige
avaliação humana. O retorno às leituras estáveis não encerra o alerta.

## Preparar e gravar

1. No `.env` da raiz de `site novo`, preencha somente os campos de Wi-Fi:

   ```dotenv
   ESP_WIFI_SSID="NOME_DA_REDE"
   ESP_WIFI_PASSWORD="SENHA_DA_REDE"
   ```

   `ESP_DEVICE_TOKEN` já foi gerado e cadastrado como hash no Supabase. Não use
   a chave NVIDIA, publishable ou service_role como token do colete.

2. Na raiz do projeto execute `npm run esp:prepare`. O comando cria o arquivo
   privado `firmware/sage_demo/config.h`, com os campos ESP do `.env`, o endereço
   Supabase e uma raiz TLS obtida de uma conexão validada ao servidor. Esse
   arquivo é ignorado pelo Git. As outras chaves do `.env` não são copiadas.
3. Na Arduino IDE, instale o pacote **esp32 by Espressif Systems** e a biblioteca
   **ArduinoJson 7 by Benoit Blanchon**. Selecione sua placa ESP32 e a porta USB.
4. Abra `firmware/sage_demo/sage_demo.ino`, compile e grave. Todas as abas da
   pasta, inclusive `config.h`, devem estar junto do sketch.
5. Abra o monitor Serial em 115200. Ligue o ESP sem o conector: vermelho aceso,
   sinal de presença, nenhuma leitura. Feche o contato: após um envio aceito,
   verde acende. Abra novamente: o verde deve apagar imediatamente.
6. No site, entre com conta autorizada e selecione/adicione `SGE-004`. Complete
   o cadastro autorizado da pessoa, se necessário. A origem deve ser “simulada”.

O sketch usa valores vazios de exemplo se `config.h` ainda não existe,
mas a rede é desativada e a Serial pede configuração. Para um teste real é
necessário preparar o arquivo privado. Se o certificado do servidor mudar,
execute novamente `npm run esp:prepare` e grave de novo; não desative a validação
TLS para contornar erro de certificado.

## Reenvio e falhas

Mantém uma única leitura pendente por até 60 segundos e reutiliza o mesmo corpo,
timestamp e UUID em retries. Não monta histórico fictício enquanto está offline.
Ao retirar o colete, a leitura pendente daquela conexão é descartada. Erro 429
espera 60 segundos; falhas temporárias usam backoff limitado. Erros 400/401/403/409
da ingestão bloqueiam novas leituras até corrigir a configuração e reiniciar.
Tokens, senha de Wi-Fi e conteúdo integral das respostas não são impressos.

## Verificação executada

Endpoint de presença e migration publicados; SGE-004 cadastrado como simulado,
com exigência de ESP e credencial individual. Testes SQL/HTTP validaram presença
isolada, contato, expiração, pacote antigo, autorização e bloqueio de leituras.
TypeScript e Deno check passaram nas partes web/backend.
Suíte completa: 264 testes em 27 arquivos aprovados. O teste de navegador
validou estados de contato/expiração e confirmou que coletes dependentes de ESP
não geram telemetria automática no cliente. A inferência de presença foi
testada com fixtures; não foi forjada presença física no dispositivo remoto.

Não havia Arduino CLI, core ESP32 ou placa USB disponíveis neste ambiente.
Portanto não foi executada compilação para a placa nem teste elétrico/físico.
Compile o sketch na Arduino IDE e faça o roteiro acima antes da apresentação.

Referências oficiais:
[GPIO Arduino-ESP32](https://docs.espressif.com/projects/arduino-esp32/en/latest/api/gpio.html)
e [HTTPS da Espressif](https://github.com/espressif/arduino-esp32/blob/master/libraries/HTTPClient/examples/BasicHttpsClient/BasicHttpsClient.ino).
