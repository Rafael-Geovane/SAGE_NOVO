# SGE-067 no acompanhamento

Pedido: trocar o atalho fixo SGE-001 por entrada do código e criar SGE-067 para
testar cadastro/edição com leituras aleatórias. Usar a mesma tela e o mesmo
cadastro dos demais coletes. A origem das leituras permanece explicitamente
simulada no banco e junto aos valores, para não confundir medições de uma pessoa.

A conta ALINE identificada na imagem terá permissão somente sobre SGE-067.
Não promover seu papel e não conceder acesso por um código público desconhecido.
Uma concessão privada por atribuição permite cadastrar e editar a pessoa;
reatribuição fora desse fluxo invalida a concessão. Consentimento continua
obrigatório; não criar dados de idoso ou consentimentos fictícios.

O header reutiliza ConnectDevice, com entrada do código. Cuidadores podem
selecionar coletes já autorizados por código; novos vínculos continuam exigindo
ativação. O cadastro de perfil abre para administradores e gestores autorizados.

Um RPC autenticado gera leituras somente para dispositivo marcado simulated,
sob autorização e lock de atribuição. A tela chama esse RPC a cada três segundos
enquanto visível; pausar/sair/ocultar encerra o ciclo. Sem worker permanente,
segredo no navegador, valor de sensores clínico presumido ou alarme automático.
Deduplicação por message_id e origem simulada preservada no histórico.

Verificar com PGlite: autorização, código alheio, edição, consentimento, mudança
de atribuição, origem, reenvio, dispositivo físico e ausência de credencial.
Navegador: input do header, cadastro e edição com cuidador autorizado, ciclo de
3 segundos e pausa. Publicar migração incremental e provisionar somente SGE-067.
