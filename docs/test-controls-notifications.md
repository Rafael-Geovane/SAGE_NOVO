# Controles e avisos do navegador — 10/11/2026

## Demonstração

1. Entre na conta autorizada e abra `/teste_colete` diretamente. A rota exige login e não aparece no menu.
2. Digite `SGE-067` e clique em **Carregar colete**.
3. Abra `/dashboard` em outra aba e pause os dados automáticos para observar somente os cliques.
4. Na página de controle, envie uma leitura estável, uma possível queda ou bateria em 15%.
5. Confira o histórico e o sino no dashboard. O fallback periódico pode levar até 15 segundos quando Realtime está indisponível.

A simulação usa temperatura fixa de 36,5 °C, batimentos entre 70 e 76 bpm,
SpO₂ entre 97 e 99% e bateria em 85%. Esses números são cenários de demonstração,
não classificações clínicas. Bateria em 15% altera a leitura; não cria um alerta
de bateria automaticamente. O cenário de queda cria um evento explicitamente
simulado e mantém a avaliação humana existente.

## Notificações

Em `/minha-conta`, clique em **Ativar avisos do navegador** e aceite a permissão.
Para desativar, use o mesmo controle. Caso tenha negado a permissão, ajuste-a nas
configurações do site no navegador. HTTPS ou localhost são necessários.

Os avisos usam um service worker para exibição e direcionam ao dashboard ao clicar.
O SAGE consulta as possíveis quedas autorizadas enquanto uma aba está aberta;
não existe servidor Web Push para acordar o navegador com o site fechado.
O bloqueio de notificações do sistema operacional também pode impedir o aviso.
O texto do aviso evita nome, endereço e informações de saúde da pessoa.

## Banco e validação

A migration `202611100001_test_controls.sql` foi aplicada ao projeto Sage.
Ela preserva a assinatura anterior da RPC e adiciona a assinatura com cenário.
A função exige autorização, origem simulada, atribuição atual, consentimento
quando existe pessoa vinculada e credencial ativa. Não altera dispositivos físicos.
Retries mantêm o identificador e não duplicam o alerta.

22 testes direcionados de SQL, API e simulador passaram. Build e TypeScript passaram.
O teste de navegador usa fixtures, sem escrever pessoas ou eventos no projeto remoto.
