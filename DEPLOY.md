# 🚀 Manual de Deploy - Projetos Obras

Este guia contém o passo a passo padrão para subir suas atualizações com segurança utilizando o GitHub, que se comunica automaticamente com a Vercel.

## 1. Verificação Pré-vôo (Local)
Sempre teste as alterações no seu servidor local antes de subir.
*   No terminal do projeto, rode: `npm run dev`
*   Acesse o link gerado (ex: `http://localhost:5173`) no seu navegador.
*   Dica: Use o Inspetor do Navegador (F12) para testar o layout em modo celular.

## 2. Preparando o Envio (Git)
Abra o terminal na pasta raiz do projeto (`Projetos_Obras`) e execute os seguintes comandos em ordem:

```bash
# Passo 1: Capturar todas as alterações
git add .

# Passo 2: Carimbar a versão com uma mensagem do que foi feito
# Altere o texto entre aspas para descrever sua atualização
git commit -m "feat: descrição das melhorias realizadas"

# Passo 3: Enviar para o GitHub
git push origin main
```

## 3. Finalização (Vercel)
Após o `git push`, o GitHub avisa a Vercel, que começa a construir (build) e publicar o seu site automaticamente.
1.  Acesse seu painel na [Vercel](https://vercel.com/) e clique no projeto **Projetos_Obras**.
2.  Acompanhe o status na aba **"Deployments"**.
3.  Quando a bolinha ficar verde (**Ready**), o site está atualizado e no ar!

## 4. Dicas de Ouro do Camisa 10
*   **Cache:** Se o site abrir a versão antiga no celular ou no computador, use uma aba anônima (Ctrl+Shift+N) ou limpe o cache do navegador.
*   **Mensagens de Commit:** Tente ser específico (ex: "ajuste no formulário de configurações" em vez de "ajuste"). Isso ajuda muito a organizar o histórico do seu projeto.
*   **Erros de Conflito:** Se o `git push` falhar por "conflito", significa que há arquivos no GitHub que você não tem localmente. Use `git pull origin main` antes de tentar o push novamente.

---
*Manual criado e atualizado por seu assistente Antigravity - 2026*
