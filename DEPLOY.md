# 🚀 Manual de Deploy e Sincronização - Projetos Obras

Este guia contém o passo a passo completo e atualizado para publicar alterações com segurança na **Vercel** (via GitHub) e sincronizar permissões e tabelas no **Supabase**.

> **Como o projeto é publicado:** 
> O frontend é estático (HTML, CSS e JavaScript puros; ver `vercel.json`). A Vercel monitora a branch `main` do repositório no GitHub. Assim que você executa `git push origin main`, a Vercel detecta a atualização e coloca a nova versão no ar automaticamente em poucos segundos.
> O banco de dados (Supabase) é compartilhado entre o ambiente local e a produção. Mudanças estruturais de banco e correções de permissões (arquivos `.sql`) são aplicadas diretamente no painel do Supabase.

---

## 1. Verificação Pré-vôo (Local Obrigatório)

Sempre teste as alterações localmente antes de enviar para produção:

1. **Inicie o servidor de testes local:**
   * Dê dois cliques em `start-server.bat` (ou execute `python dev_server.py 8080` no terminal).
   * O sistema abrirá em `http://localhost:8080`.
2. **Execute a bateria de testes automatizados (Auditoria QA):**
   * No terminal do projeto, execute:
     ```bash
     node test_sistema_qa.js
     ```
   * **Critério de segurança:** O comando DEVE terminar com `TODAS AS VERIFICAÇÕES PASSARAM COM SUCESSO! CÓDIGO SEGURO PARA COMMIT.` (208+ testes aprovados, 0 falhas).
   * *Nota:* O git possui um hook de `pre-commit` configurado que impede commits caso qualquer verificação quebre.

---

## 2. Passo a Passo do Deploy (Git -> Vercel)

Abra o terminal (PowerShell ou Prompt de Comando) na pasta raiz do projeto (`Projetos_Obras`).

### Passo 2.1: Verifique os arquivos alterados
```bash
git status
```
> Certifique-se de que está na branch `main` e de que nenhum arquivo indesejado (como senhas, pastas temporárias ou rascunhos pessoais) esteja sendo incluído.

### Passo 2.2: Adicione os arquivos ao commit
```bash
git add .
```

### Passo 2.3: Registre o commit com uma mensagem descritiva
```bash
git commit -m "feat: correcao de permissoes de abas e sincronizacao de entes"
```
*(Substitua a mensagem entre aspas pelo resumo das alterações que você realizou)*

### Passo 2.4: Envie para o GitHub (Disparo automático do Deploy na Vercel)
```bash
git push origin main
```

---

## 3. Banco de Dados (Supabase) — Execução de Scripts SQL

Como o Supabase não roda scripts SQL automaticamente via git, arquivos `.sql` novos ou de correção devem ser executados no painel web:

1. Acesse o painel do seu projeto no [Supabase](https://supabase.com/dashboard).
2. No menu lateral esquerdo, clique no ícone **SQL Editor** (ícone `>_`).
3. Clique em **"+ New query"**.
4. Abra o arquivo `.sql` correspondente no seu computador, copie todo o seu conteúdo, cole no editor do Supabase e clique no botão verde **"Run"** (ou aperte `Ctrl + Enter`).

### Principais Scripts e quando executá-los:

| Arquivo SQL | Para que serve | Quando rodar |
|---|---|---|
| `supabase_permissoes_sincronizacao_geral.sql` | **Sincronização definitiva de abas e entes:** remove a aba obsoleta `tab_4ar8n42x7`, insere as abas `CORRELATOS` e `Relatórios` para o Klebson/MPF e entes externos, e ajusta as políticas RLS para evitar erro 42501. | **Execute sempre que houver divergência de abas ou ao cadastrar novos entes.** |
| `supabase_relatorios_templates.sql` | Cria a tabela de modelos de relatórios A4 | Na configuração inicial de relatórios |
| `supabase_relatorios_templates_seguranca.sql` | Restringe acesso anônimo aos modelos | Após criar modelos de relatórios |
| `supabase_relatorios_ajustes.sql` | Salva ajustes manuais de mini-mapa por usuário | Na configuração de mini-mapa |
| `supabase_relatorios_emissoes.sql` | Registro oficial de emissões (protocolo e SHA-256) | Para validação pública em `verificar.html` |

---

## 4. Gestão e Resolução de Permissões de Usuários e Abas

Se um usuário relatar que não consegue ver abas de formulários:

1. **Entenda a regra de precedência:**
   * Usuários **Administradores do Município/Ente** (como o Klebson no MPF de Cabedelo) têm visão plena padrão de todas as abas criadas para a sua própria entidade, a menos que tenham sido bloqueados explicitamente.
   * **Entes externos compartilhados** (ex: Prefeitura acessando camada do MPF) só enxergam as abas que foram explicitamente marcadas com `Ver` na tela de Gestão de Usuários.
2. **Para atualizar permissões em lote:**
   * Execute o script `supabase_permissoes_sincronizacao_geral.sql` no SQL Editor do Supabase.
3. **Pela interface administrativa (`home.html` ou `settings.html`):**
   * Vá em **Gerenciar Usuários**.
   * Localize o usuário, ative a edição da camada e marque/desmarque as abas desejadas.
   * Clique em **Salvar Usuário**. O sistema agora realiza uma limpeza automática de abas fantasmas e grava as permissões instantaneamente no Supabase.

---

## 5. Acompanhando a Publicação na Vercel

1. Acesse o dashboard na [Vercel](https://vercel.com/) e clique no projeto **Projetos_Obras**.
2. Na aba **"Deployments"**, você verá o novo deploy gerado pelo `git push origin main`.
3. Quando o status mudar para **Ready** (círculo verde), o site estará 100% atualizado.
4. **Dica contra cache:** Ao testar no navegador (computador ou celular), abra em uma **Aba Anônima** (`Ctrl + Shift + N`) ou faça recarregamento forçado com `Ctrl + F5` para garantir que o navegador não use arquivos antigos em cache.

---

## 6. Procedimento de Emergência (Rollback / Voltar Atrás)

Se você publicou algo e precisar reverter imediatamente:

* **Pelo Painel da Vercel (Mais Rápido):**
  1. Vá na aba **Deployments** do projeto.
  2. Localize a versão anterior que estava funcionando.
  3. Clique nos três pontinhos (`...`) à direita e escolha **"Promote to Production"** (ou "Instant Rollback").
  4. A versão estável volta ao ar em menos de 5 segundos.
* **Pelo Git:**
  ```bash
  git revert HEAD
  git push origin main
  ```
  *(Desfaz o último commit criando um novo commit seguro de reversão).*

---
*Manual atualizado em 23/09/2026 com instruções de deploy na Vercel, auditoria QA e sincronização interinstitucional de permissões no Supabase.*
