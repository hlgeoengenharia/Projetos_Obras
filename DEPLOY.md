# Guia de Deploy com a Vercel via Terminal

Se a publicação automática pelo GitHub estiver apresentando falhas, você pode utilizar a interface de linha de comando (CLI) da Vercel para realizar o deploy direto do seu terminal. Isso geralmente evita problemas de configuração e mostra erros de forma mais detalhada.

Siga o passo a passo abaixo:

## Passo 1: Instalar a Vercel CLI
Se você ainda não tem a ferramenta da Vercel instalada, abra o seu terminal (no ambiente de desenvolvimento) e rode o seguinte comando:
```bash
npm install -g vercel
```
*(No Windows, se houver erros de política de execução, certifique-se de estar rodando como Administrador ou use ferramentas como o Git Bash).*

## Passo 2: Fazer o Login na Vercel
Antes de publicar, autentique sua conta da Vercel no terminal:
```bash
vercel login
```
*Um link será aberto no seu navegador. Escolha o seu método de login (ex: GitHub).*

## Passo 3: Iniciar o Deploy
Com o login feito, e estando na **pasta raiz** do projeto, rode apenas:
```bash
vercel
```

A Vercel fará algumas perguntas interativas no terminal:
1. **Set up and deploy “~/.../Projetos_Obras”?** Digite `Y` (Sim) e aperte Enter.
2. **Which scope do you want to deploy to?** Aperte Enter para selecionar a sua conta pessoal.
3. **Link to existing project?** Digite `N` (Não).
4. **What’s your project’s name?** Aperte Enter para manter o nome sugerido ou digite outro.
5. **In which directory is your code located?** Aperte Enter para confirmar que é o diretório atual (`./`).
6. **Want to modify these settings?** A Vercel vai reconhecer que é um projeto **Vite**. Ela vai sugerir `Build Command: vite build` e `Output Directory: dist`. Se os dados estiverem corretos, aperte `N` e depois Enter.

Aguarde o upload e a construção do projeto. Se der tudo certo, ela vai te devolver um link de "Preview".

## Passo 4: Configurar Variáveis de Ambiente
O aplicativo precisa se conectar ao Supabase. Você pode adicionar as chaves de duas formas:

**Opção A: No Painel (Recomendado)**
- Acesse [vercel.com](https://vercel.com) e clique no projeto recém-criado.
- Vá em **Settings > Environment Variables**.
- Adicione as chaves `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.

**Opção B: Pelo Terminal**
Rode no terminal:
```bash
vercel env add VITE_SUPABASE_URL
```
*(Cole a URL e selecione em quais ambientes aplicar - Production, Preview, Development).*
Faça o mesmo para a chave:
```bash
vercel env add VITE_SUPABASE_ANON_KEY
```

## Passo 5: Publicar em Produção
O primeiro comando `vercel` criou uma versão de Preview (testes). Para aplicar suas chaves de ambiente e gerar o link final oficial, rode:
```bash
vercel --prod
```

Pronto! Ao final desse comando, o terminal te dará o link definitivo de produção, já com o sistema rodando.
