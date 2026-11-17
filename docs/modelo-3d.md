# Modelo 3D do SAGE Smart Vest

Implementado em 16/11/2026 no repositório existente, sem alterações no banco ou
nas integrações Supabase.

## Executar

```powershell
Set-Location "C:\Users\Aluno_Tarde\Desktop\sage - site\site novo"
npm ci
npm run dev
```

Abra `http://localhost:3000/modelo`. A aba **Modelo 3D** está no header, no
footer e no menu interno. A rota é pública. Atualizar a página ou acessar a URL
diretamente funciona com o fallback SPA do Vite. `server.port = 3000` e
`strictPort = true` fazem o processo falhar explicitamente quando a porta está
ocupada; não há troca silenciosa de porta.

A configuração é exclusiva de desenvolvimento. O build continua gerando
`dist`; `vercel.json` declara o fallback da SPA para as rotas da hospedagem.
Não foi realizada publicação de hosting nem alteração remota do Supabase.

## Solução e dependências

Não havia arquivo GLB/GLTF/OBJ no repositório. As referências fornecidas são
imagens, não malhas 3D ou desenhos com medidas verificadas. Foi construída uma
representação conceitual diretamente com geometria Three.js: tecido curvo,
recortes, costuras, zíper, bolso, caixa e tampa, placas, bateria e fios. Não há
arquivo GLB validado nem promessa de precisão dimensional ou fabricação.

Three.js (`three`) é a única nova dependência de execução; `@types/three` é
exclusiva do desenvolvimento. OrbitControls e RoundedBoxGeometry vêm do próprio
pacote. Não foram adicionados React Three Fiber, Drei, biblioteca de física,
fontes externas ou ativos remotos. O motor 3D é carregado sob demanda apenas ao
abrir o visualizador. Textura do tecido e geometria são produzidas localmente.

As três referências PNG do usuário foram preservadas na pasta Downloads;
cópias JPEG otimizadas (1600 × 900) ficam em `public/model/`, totalizando cerca
de 654 KB. Servem como referência e alternativa claramente identificada como
2D; não são apresentadas como modelo 3D.

## Interação

- Arrastar: girar; rolagem/pinça: zoom; botão direito/dois dedos: reposicionar.
- No canvas com foco, setas giram, `+`/`−` ajustam o zoom, `Home` centraliza e
  `Shift` + setas reposiciona. Os mesmos comandos principais têm botões com
  rótulos acessíveis e foco visível.
- As vistas externa e explodida são botões com estado `aria-pressed`.
- Selecionar um componente pela lista revela sua descrição e, para a
  eletrônica interna, abre a vista explodida. Também é possível selecionar
  diretamente a geometria com clique/toque.
- Em falha do motor/WebGL, aparece uma mensagem útil e uma referência 2D. É
  possível tentar novamente ou escolher manualmente a alternativa em imagens.
- A cena renderiza em resposta a interações e redimensionamento, sem animação
  automática contínua. Recursos gráficos e listeners são liberados ao sair.

## Limites da representação

ESP32 é o controlador do protótipo. MAX30102 é PPG previsto; MAX30205 é
temperatura prevista; BMI160 representa movimento por acelerômetro e
giroscópio. LiPo de 3,7 V e módulo de carga/proteção são referências de
alimentação. Rotas e cores dos fios não definem pinagem.

Posição/contato dos sensores, caixa, fixação, conforto, montagem e integração
precisam de validação física. Não há escala final, dimensões de fabricação,
autonomia, precisão, certificação ou alegação clínica. Não foram incluídos GPS,
câmera, microfone, tela, celular/4G, buzzer ou outros módulos não confirmados.

## Verificação

Suíte completa: **259 testes aprovados em 26 arquivos**. TypeScript passou,
assim como os testes públicos de navegador existentes e o novo fluxo 3D.
Os testes direcionados da geometria foram repetidos após o acabamento visual.
O scanner do cliente não encontrou credenciais. A tentativa de iniciar uma
segunda instância na porta 3000 falhou com a mensagem explícita de porta ocupada.

```powershell
npm test -- --maxWorkers=1 --no-file-parallelism
npm run typecheck
npm run build
node tests/browser-model.mjs
node tests/browser.mjs
```

O script novo usa Chrome local, testa renderização WebGL real, teclado,
seleção, vistas, acesso direto/reload, larguras de 360–1440px e fallback com
WebGL indisponível. Capturas e resultados ficam em `docs/screenshots/model-*`
e `docs/browser-model-results.json`. O script público existente foi atualizado
para a porta 3000; fixtures autenticadas continuam usando a porta 5174.

O teste de geometria executa sem GPU e confere que todos os componentes têm
geometria 3D finita e são separados na vista explodida. Ele não valida a
montagem ou as medidas do hardware.

## Arquivos da implementação

- Nova página: `src/pages/Model.tsx`.
- Metadados, geometria, motor e interface: `src/features/product-model/`.
- Estilos: `src/styles/product-model.css`.
- Rotas: `src/App.tsx`.
- Navegação: `src/components/layout/PublicLayout.tsx` e
  `src/components/layout/WorkspaceSidebar.tsx`.
- Desenvolvimento e dependências: `vite.config.ts`, `package.json` e
  `package-lock.json`.
- Fallback de produção: `vercel.json`.
- Ícone para evitar o 404 do navegador: `index.html` e `public/favicon.svg`.
- Referências otimizadas: `public/model/sage-exterior.jpg`,
  `sage-exploded.jpg` e `sage-internal.jpg`.
- Testes: `tests/product-model.test.ts`, `tests/browser-model.mjs`;
  `tests/browser.mjs` e `tests/browser-vest-simulator.mjs` foram atualizados
  para a porta 3000.
- Documentação: `README.md`, `DESIGN.md` e este arquivo.
- Evidências geradas: `docs/browser-model-results.json`,
  `docs/browser-results.json`, três capturas `docs/screenshots/model-*` e
  capturas públicas existentes atualizadas para refletir a nova navegação.
