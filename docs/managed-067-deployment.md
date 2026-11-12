# SGE-067 e entrada por código — 30/10/2026

## Entrega

O header da conta usa **Informar código do colete**, reutilizando ConnectDevice.
Não há identificador fixo nesse atalho. O código aceita espaços ao redor do hífen.
Um colete previamente autorizado é selecionado por código; um vínculo novo de
cuidador continua exigindo ativação. O diálogo segue para o cadastro do idoso
quando a conta tem permissão administrativa ou gestão delegada daquele colete.

SGE-067 foi criado no projeto Supabase Sage com origem simulated e gestão
delegada à conta de cuidador indicada na imagem. Não houve promoção de papel ou
concessão sobre SGE-001. A permissão é privada e vinculada à atribuição atual.
O RPC de cadastro revalida a autorização sob lock e preserva o consentimento.
Uma reatribuição externa invalida a concessão anterior.

## Dados aleatórios

O servidor gera amostras através da ingestão existente. O navegador envia somente
IDs de dispositivo, atribuição e requisição, sem métricas ou segredo do dispositivo.
Origem simulated é estampada pelo servidor e preservada em leituras e alertas.
O gerador não fabrica eventos de queda. A tela exibe a origem antes dos valores
e no histórico, sem apresentá-los como medição do idoso.

O ciclo inicia para um dispositivo simulado selecionado com permissão de gestão.
Executa uma operação por vez, aguarda três segundos entre amostras e para ao
pausar, ocultar a página, trocar de colete, sair ou perder autorização. Não foi
criado serviço ou agendamento permanente. O cadastro pessoal depende do usuário:
nenhum nome, endereço, alergia ou consentimento fictício foi inserido em produção.

## Publicação e evidências

- Dez migrações anteriores conferidas por checksum.
- Migração 202610300001_managed_simulated_vest publicada; onze versões no banco.
- SGE-067 criado com credencial individual e primeira amostra recebida.
- Perfis e pessoas existentes preservados; nenhum alerta sintético criado.
- Consulta sob o papel authenticated da conta autorizada retornou somente
  SGE-067, can_edit=true e presença de amostra. Nenhuma sessão foi criada.
- REST anônimo recusou consulta de dispositivos com HTTP 401 / 42501.
- 244 testes passaram em 23 arquivos; build passou.
- Navegador com fixtures isoladas validou código, cadastro e edição de cuidador,
  mudança de atribuição, timer real de três segundos, pausa e layout mobile.
- Corrigida colisão de keys entre perfil e alertas que duplicava a seção após
  mudar a atribuição. O navegador agora exige uma única seção de dados do idoso
  e nenhuma advertência de key duplicada.

O navegador privado usa fixtures e não comprova transporte Realtime hospedado.
A consulta de autorização e a primeira amostra foram verificadas no banco real.
Abra/atualize o acompanhamento para iniciar a geração no ciclo normal da tela.
