# 🚀 Manual de Deploy - Projetos Obras

Este guia contém o passo a passo padrão para subir suas atualizações com segurança utilizando o GitHub, que se comunica automaticamente com a Vercel.

> **Como o projeto é publicado:** é um site estático (HTML + JavaScript, sem etapa de build; ver `vercel.json`). A Vercel publica **o que estiver na branch `main` do GitHub**. Enquanto algo não estiver na `main` **e enviado** (`git push`), o site publicado não muda.
> O banco de dados (Supabase) é o mesmo para o computador local e para o site publicado. Por isso, mudanças de banco (SQL) precisam ser feitas à parte (passo 3).

## 1. Verificação Pré-vôo (Local)
Sempre teste as alterações no seu servidor local antes de subir.
*   Dê dois cliques em `start-server.bat` (ou rode `python dev_server.py 8080` no terminal). Ele abre `http://localhost:8080`.
*   Dica: Use o Inspetor do Navegador (F12) para testar o layout em modo celular.
*   Rode a bateria de testes: `node test_sistema_qa.js`. Tudo deve terminar em "TODAS AS VERIFICAÇÕES PASSARAM". (O `git commit` também roda isso sozinho e **cancela o commit se algum teste falhar**.)

## 2. Preparando o Envio (Git)
Abra o terminal na pasta raiz do projeto (`Projetos_Obras`).

### 2.1 Confira o que vai subir
```bash
git status          # veja se há arquivos que não deveriam subir (rascunhos, senhas, backups)
git branch          # veja em qual branch você está
```
Nunca suba arquivos `.env` (já são ignorados pelo `.gitignore`).

### 2.2 Commit (na branch em que você trabalhou)
```bash
# Passo 1: Capturar todas as alterações
git add .

# Passo 2: Carimbar a versão com uma mensagem do que foi feito
# Altere o texto entre aspas para descrever sua atualização
git commit -m "feat: descrição das melhorias realizadas"
```

### 2.3 Levar para a `main` e enviar
Se você trabalhou direto na `main`, pule para o Passo 5. Se trabalhou em outra branch (ex.: `relatorios-fase1`):
```bash
# Passo 3: Guardar um ponto de retorno (para desfazer se algo der errado)
git branch backup-antes-do-deploy main

# Passo 4: Trazer o trabalho da branch para a main
git checkout main
git merge relatorios-fase1     # troque pelo nome da sua branch

# Passo 5: Enviar para o GitHub (a Vercel publica a partir daqui)
git push origin main
```
> Se o `git push` falhar por "conflito", há arquivos no GitHub que você não tem localmente. Use `git pull origin main` antes de tentar o push novamente.

## 3. Banco de dados (Supabase) — quando houver arquivos `.sql` novos
Os arquivos `supabase_*.sql` da raiz **não rodam sozinhos**: abra o **SQL Editor** do Supabase, cole o conteúdo e execute. Rode **antes** de publicar (ou logo depois), senão a função nova aparece no site sem o banco que ela precisa.

Módulo de Relatórios A4 (rodar nesta ordem; todos podem ser repetidos sem problema):

| Arquivo | Para que serve |
|---|---|
| `supabase_relatorios_templates.sql` | Tabela dos modelos de relatório |
| `supabase_relatorios_templates_seguranca.sql` | Fecha o acesso anônimo aos modelos |
| `supabase_relatorios_ajustes.sql` | Guarda os ajustes que cada usuário faz no mapa do relatório |
| `supabase_relatorios_emissoes.sql` | Registro de emissões (protocolo + SHA-256) e a função da página pública `verificar.html` |

Depois de rodar, teste no site publicado: gerar um relatório, salvar os ajustes do mapa e abrir `verificar.html?p=PROTOCOLO`.

## 4. Finalização (Vercel)
Após o `git push`, o GitHub avisa a Vercel, que publica o site automaticamente (não há build, então costuma levar poucos segundos).
1.  Acesse seu painel na [Vercel](https://vercel.com/) e clique no projeto **Projetos_Obras**.
2.  Acompanhe o status na aba **"Deployments"**.
3.  Quando a bolinha ficar verde (**Ready**), o site está atualizado e no ar!
4.  Abra o site em uma aba anônima (Ctrl+Shift+N) e confira a mudança que você fez.

## 5. Se algo der errado (voltar atrás)
*   **Rápido, pelo painel:** na Vercel, aba **Deployments**, escolha o último deploy que funcionava e use **Promote to Production** (ou "Instant Rollback").
*   **Pelo git:** `git revert <código-do-commit>` e depois `git push origin main`. Evite `git push --force`.
*   Mudanças de SQL **não voltam** com o git nem com a Vercel; só rode SQL que você revisou.

## 6. Dicas de Ouro do Camisa 10
*   **Cache:** Se o site abrir a versão antiga no celular ou no computador, use uma aba anônima (Ctrl+Shift+N) ou limpe o cache do navegador.
*   **Mensagens de Commit:** Tente ser específico (ex: "ajuste no formulário de configurações" em vez de "ajuste"). Isso ajuda muito a organizar o histórico do seu projeto.
*   **Site diferente do local:** quase sempre é porque a mudança ainda não está na `main` enviada ao GitHub, ou porque falta rodar um `.sql` no Supabase.

---
*Manual criado por seu assistente Antigravity - 2026. Atualizado em 21/09/2026 (servidor local, fluxo por branch, SQL do Supabase e volta atrás).*
