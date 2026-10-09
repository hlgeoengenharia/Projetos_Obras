# Proposta Técnica: Monitoramento de Eventos, Prazos e Alertas Cartográficos Inteligentes

## 1. Visão Geral
Este documento descreve a especificação funcional e arquitetural da funcionalidade de **Monitoramento de Eventos e Prazos**, projetada para transformar o sistema em uma central de inteligência territorial ativa e preditiva.

O sistema permite a configuração de regras e gatilhos de tempo vinculados aos dados das camadas (ex.: manutenção de logradouros, validade de alvarás, habite-se, certidões e licenças), disparando alertas e notificações direcionados a usuários específicos ou setores.

---

## 2. Arquitetura em Duas Pontas

### A. Onde Configura: 5ª Aba no Construtor de Formulários
Ao editar um formulário/camada (`settings.html` / `home.html?view=municipio`), é adicionada a 5ª aba superior:
- **Abas existentes**: `[Campos do Formulário]`, `[Dashboard Estatístico]`, `[Relatório Individual]`, `[Relatório Geral]`
- **Nova Aba**: `🔔 [Monitoramento de Eventos]` (ou `Eventos & Prazos`)

#### Estrutura do Construtor de Regras:
1. **Nome do Evento / Gatilho**: Ex.: *"Manutenção Semestral de Logradouros"*, *"Alvará Próximo do Vencimento"*.
2. **Gatilhos Temporais Suportados**:
   - **Periodicidade após uma data**: `[Campo Data]` + `X dias/meses/anos` alcançado. Ex.: *Última Manutenção + 6 meses <= Hoje*.
   - **Prazo de Validade / Vencimento**: `[Campo Data de Validade]` com alerta prévio de `X dias` antes de expirar.
   - **Cálculo Dinâmico**: `[Data de Emissão]` + `[Prazo]` = limite de validade.
3. **Filtro / Condição Adicional (opcional)**:
   - Ex.: Aplicar apenas se `[Status]` diferente de `"Concluído"` ou `"Renovado"`.
4. **Atribuição do Responsável**:
   - Usuário específico (ex.: *Helton Leite*);
   - Perfil/Grupo de usuários (ex.: *Fiscalização de Obras*, *Secretaria de Infraestrutura*);
   - Dinâmico (*"Usuário responsável pelo último cadastro da feição"*).
5. **Nível de Severidade & Cores**:
   - 🟢 **Informativo / Preventivo** (Aviso com 30 dias de antecedência);
   - 🟡 **Atenção** (Vencendo nos próximos 7 dias ou atingiu prazo de revisão);
   - 🔴 **Crítico** (Vencido / Atrasado).
6. **Mensagem do Alerta**: Modelo com variáveis dinâmicas (ex.: *"O logradouro {nome_logradouro} atingiu 6 meses sem manutenção preventiva."*).

---

### B. Onde Consome: No Mapa e Operação Diária (`home.html`)

1. **Efeito Pulsante Cartográfico (Radar Glow / Halo luminoso)**:
   - Feições com alertas ativos recebem um pulso suave animado em CSS nas cores amarela ou vermelha conforme a gravidade.
   - Botão rápido no mapa: `[ ⚠️ Mostrar Apenas Alertas Ativos ]` para isolar no mapa os elementos pendentes.

2. **Central de Notificações no Topbar (Sininho 🔔)**:
   - Badge com contador numérico pulsante (ex.: `🔔 4`).
   - Painel suspenso com lista de alertas direcionados ao usuário logado.
   - **Ação 🎯 "Localizar no Mapa"**: Dá zoom suave e centraliza a feição, abrindo sua ficha.
   - Ações de ciclo de vida:
     - `[ Dar Ciente ]`: Marca o alerta como visualizado/ciente para este usuário.
     - `[ Lembrar em 7 dias ]`: Snooze temporário.
     - `[ Atualizar Dados ]`: Abre o formulário da feição para registrar a nova manutenção/renovação.

3. **Banner / Toast Inteligente de Entrada**:
   - Ao fazer login ou abrir a base cartográfica, caso haja alertas críticos pendentes, exibe um resumo discreto no canto inferior direito.
   - Opção: `[ Não mostrar este resumo novamente hoje ]`.

---

## 3. Modelo de Dados Sugerido
- **No Schema da Camada / Formulário (`form.event_triggers`)**:
  Array com a definição das regras de gatilho salvas junto ao formulário.
- **Tabela de Descarte / Ciência (`alertas_status`)**:
  Registra o par `(trigger_id, feature_id, user_id, status, updated_at)` para que alertas já reconhecidos ou arquivados não incomodem o operador repetidamente.

---

*Documento gerado em 09/10/2026 para implementação posterior à estabilização da coleta em campo.*
