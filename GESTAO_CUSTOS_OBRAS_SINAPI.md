# Módulo de Engenharia de Custos e Orçamento de Obras Públicas (SINAPI / CAIXA)
**Sistema GeoGestor • Prefeitura Municipal de Cabedelo / SEMOB**

---

## 1. Visão Geral do Módulo
O módulo de **Custos de Obras (GeoOrçamento)** foi idealizado para transformar o GeoGestor em uma ferramenta completa de engenharia pública, unindo o **georreferenciamento de intervenções urbanas (camada Obras)** às **tabelas referenciais de custos oficiais da Caixa Econômica Federal (SINAPI)** e aos critérios de orçamentação do **Tribunal de Contas da União (TCU - Acórdão 2.622/2013)**.

---

## 2. Onde Estamos: Arquitetura Atual e Implementações Existentes

### 2.1. Configurações Globais (`home.html`)
- **Aba:** `Tabelas Oficiais de Custos de Obras (SINAPI / CAIXA)`
- **Interface e Cobertura Nacional:**
  - Card da **Base Referencial Nacional**: Exibe `SINAPI 07/2026 - Oficial Caixa (27 UFs)`, com contadores de 10.544 composições, 4.876 insumos, cobertura de todos os 27 estados e encargos horista (102%) e mensalista (60%).
  - Card de **Upload da Planilha Nacional**: O upload aceita a planilha única mensal baixada do portal da Caixa (`SINAPI_Referência_AAAA_MM.xlsx`) contendo todas as 27 UFs, sem obrigar a selecionar estado individual no envio.
  - **Distribuição Multi-Estado Inteligente:** Cada obra no mapa possui seu **Estado de Referência (UF)**. Quando um engenheiro orça uma obra em São Paulo, o sistema carrega a tabela oficial de SP; quando orça na Paraíba, carrega a tabela de PB, com atualização dinâmica e automática de custos.

### 2.2. Base de Dados Oficial Local (`data/sinapi/`)
Foi construído um processador Python de alto desempenho (`processar_sinapi.py`) que processou a planilha oficial de Julho/2026 da Caixa para a Paraíba, gerando:
1. `data/sinapi/catalogo_pb_2026_07.json` (4,69 MB - 15.420 itens catalogados com código, descrição, unidade e preços com/sem desoneração).
2. `data/sinapi/analitico_2026_07.json` (10,88 MB - Árvore analítica com a relação de insumos de cada composição).
3. `data/sinapi/metadados_pb_2026_07.json` (Resumo com encargos sociais e totais).
4. `data/sinapi/bases_disponiveis.json` (Catálogo mestre das bases cadastradas).

### 2.3. Camada Obras e Modal de Orçamento (`index.html` + `src/orcamento.js` + `src/formRenderer.js`)
- Em `index.html`, ao clicar em uma feição da camada de Obras, o painel lateral renderiza o card nativo de **Orçamento da Obra** com o botão *"Abrir / Editar Planilha Orçamentária"*.
- Ao clicar, abre o modal modal `#orcamento-modal` com 4 abas estruturadas:
  1. **Planilha Orçamentária:** Tabela no padrão SICO com macroetapas (ex: 1.0 Serviços Preliminares, 2.0 Estruturas e Fundações), itens, quantidades, valores unitários com/sem BDI e subtotais.
  2. **Parâmetros & BDI (TCU):** Calculadora analítica com fórmula oficial do TCU (Acórdão 2.622/2013) com taxas de AC, Seguro, Risco, Despesas Financeiras, Lucro e Tributos (PIS, COFINS, ISS Cabedelo, CPRB).
  3. **Cronograma Físico-Financeiro:** Matriz dinâmica de desembolso mensal e percentual por etapa ao longo de 3, 6 ou 12 meses.
  4. **Curva ABC:** Classificação automatizada dos serviços por impacto financeiro (Faixa A: 80%, Faixa B: 15%, Faixa C: 5%).

---

## 3. Diagnóstico: Por Que a Busca Falha e Onde Está a Falta de Conexão?

### ❌ Falha 1: Dropdown cortado por `overflow-hidden` (Problema Visual/CSS)
- No arquivo `src/orcamento.js` (linha 498), cada bloco de macroetapa é envelopado por:
  ```html
  <div class="bg-white dark:bg-slate-900 rounded-2xl border ... overflow-hidden ...">
  ```
- No rodapé da etapa, o campo de busca de serviços abre um dropdown flutuante:
  ```html
  <div id="autocomplete-results-${etp.id}" class="hidden absolute left-0 top-full mt-1 w-full max-h-60 ...">
  ```
- **Consequência:** Como o container pai possui `overflow-hidden`, qualquer elemento posicionado com `top-full` (que transborda a borda inferior da caixa) é **completamente cortado e fica invisível**. O JavaScript preenche os 15 resultados encontrados, remove a classe `hidden`, mas o navegador oculta os resultados fora dos limites da caixa da macroetapa!

### ❌ Falha 2: Desconexão entre Configurações Globais e o `index.html`
- Em `home.html`, o usuário escolhe a base ativa (salva em `localStorage.getItem('sinapi_active_base')`).
- No entanto, em `src/orcamento.js`, a função `carregarCatalogoSinapi()` está com a chave fixa (`baseKey = 'PB_2026_07'`) e carrega diretamente `data/sinapi/catalogo_pb_2026_07.json`, ignorando a base definida em Configurações Globais.
- Além disso, o upload no navegador (`carregarNovaPlanilhaSinapi`) apenas lê a contagem de linhas e salva metadados no `localStorage`, **sem extrair nem salvar os milhares de itens e composições no banco local (IndexedDB ou Supabase)**.

### ❌ Falha 3: Tamanho do JSON (4,69 MB) em Requisição Direta sem Indexação Local
- Carregar 15.420 itens de um arquivo JSON estático de 4,7 MB na memória do navegador a cada abertura do modal pode gerar latência e bloqueios na UI móvel.
- Falta integrar esses itens ao **IndexedDB** local (`GeoTurboDB` ou `SinapiDB`) ou ao Supabase para consultas ultra-rápidas por índice com paginação.

---

## 4. Plano de Ação para Retomada do Projeto

### Fase 1: Correção Imediata da Busca e Experiência do Usuário (UI/UX)
1. **Remover o corte de overflow:** Ajustar o container da macroetapa em `src/orcamento.js` para `overflow-visible` na área de inserção de itens, ou ancorar o dropdown de resultados em uma camada com `z-index` flutuante sobreposta.
2. **Conectar a Base Ativa:** Fazer `src/orcamento.js` respeitar `localStorage.getItem('sinapi_active_base')` e exibir dinamicamente o nome da base ativa no cabeçalho do orçamento.
3. **Indicador Visual de Carregamento e Cache em Memória:** Garantir que o catálogo seja baixado uma única vez e mantido indexado em memória/IndexedDB, com feedback claro ("Digitando...", "15 itens encontrados", "Carregando catálogo...").

### Fase 2: Visualização Analítica e Composição Detalhada
1. **Modal de Detalhamento da Composição:** Permitir clicar em uma composição adicionada na planilha (ex: `104658`) e abrir um modal exibindo todos os seus insumos filhos (mão de obra, materiais, equipamentos e coeficientes) extraídos de `data/sinapi/analitico_2026_07.json`.
2. **Cálculo Automático de Preço Próprio (CPU):** Permitir criar composições personalizadas baseadas em insumos existentes do SINAPI.

### Fase 3: Conexão Plena do Upload de Planilhas da Caixa
1. **Importador Completo no Frontend / Backend:** Ao fazer upload de nova planilha da Caixa (.xlsx) em `home.html`, processar e salvar os dados no **IndexedDB** ou enviar ao backend (`processar_sinapi.py` ou Supabase), disponibilizando a nova base para qualquer obra imediatamente.
2. **Sincronização com o Cadastro da Obra:** Gravar o valor total calculado, BDI e data-base diretamente nos atributos da feição geográfica da camada Obras (`Valor Total da Obra (R$)`, `BDI (%)`, etc.), com persistência no Supabase.

---

## 5. Histórico de Bases SINAPI Disponíveis (Como Funciona)

### 📌 Finalidade do Histórico
O quadro **"Histórico de Bases SINAPI Disponíveis"** em `Configurações Globais` (`home.html`) serve para gerenciar as **edições mensais da Caixa Econômica Federal** cadastradas no sistema:
- **Exemplo de Ciclo:**
  - `SINAPI 07/2026 - Oficial Caixa (Nacional - 27 UFs)` [ATIVA / EM USO]
  - `SINAPI 06/2026 - Oficial Caixa (Nacional - 27 UFs)` [HISTÓRICO]
  - `SINAPI 05/2026 - Oficial Caixa (Nacional - 27 UFs)` [HISTÓRICO]

### ⚙️ Regras do Gerenciador de Versões
1. **Âmbito Nacional:** Cada versão mensal já engloba todos os **27 estados do Brasil**. Não há necessidade de cadastrar uma base para cada estado separadamente.
2. **Definição da Base Ativa:** O botão **"Tornar Ativa"** define qual mês de referência é a vigência padrão adotada pelo município para novos orçamentos.
3. **Respeito aos Contratos Antigos:** Obras licitadas com bases anteriores mantêm a sua referência histórica preservada no cadastro da obra.

---

## 6. Composições Próprias de Preço Unitário (CPU)

### 📌 O que é uma CPU na Engenharia de Custos Pública?
Uma **Composição de Preços Unitários (CPU)** é a memória técnica e analítica que detalha os recursos diretos necessários para executar **1 unidade** de determinado serviço que **não existe de forma idêntica nas tabelas oficiais do SINAPI/SICRO**.

Em conformidade com a **Lei Federal 14.133/2021 (Nova Lei de Licitações)** e a jurisprudência do **Tribunal de Contas da União (TCU - Acórdão 2622/2013-Plenário)**, uma CPU válida para obras públicas deve conter:

1. **Descrição Técnica Completa:** Especificação detalhada do processo executivo e materiais empregados.
2. **Unidade de Medida Padronizada:** `M²`, `M³`, `UN`, `M`, `KG`, `H`, etc.
3. **Desdobramento de Custos Diretos em 4 Categorias:**
   - **Mão de Obra (MO):** Profissionais necessários (ex: Pedreiro, Servente, Eletricista) com índices de consumo em horas (`H`) por unidade de serviço, considerando encargos sociais complementares.
   - **Materiais (MAT):** Insumos físicos consumidos (ex: tijolos, tubos, placas, lâmpadas) acrescidos de índices normativos de perdas.
   - **Equipamentos (EQ):** Máquinas e ferramentas (ex: betoneira, caminhão munck, retroescavadeira) calculadas em horas produtivas (`CHP`) e improdutivas (`CHI`).
   - **Serviços / Composições Auxiliares (COMP):** Serviços pré-fabricados ou intermediários (ex: concreto usinado ou preparado em betoneira).
4. **Fórmula do Custo Direto Unitário:**
   $$\text{Custo Unitário Direto (s/ BDI)} = \sum (\text{Coeficiente} \times \text{Preço Unitário do Insumo})$$
5. **Aplicação do BDI da Obra:**
   $$\text{Preço de Venda Unitário (c/ BDI)} = \text{Custo Unitário Direto} \times (1 + \text{BDI})$$

### 🛠️ Implementação no GeoGestor:
- **Aba "Composições Próprias (CPU)":** Localizada ao lado da aba "Curva ABC", gerencia todo o acervo de CPUs cadastradas na obra e no município.
- **Construtor Inteligente de CPU:**
  - Permite pesquisar diretamente no acervo oficial de **15.420 itens do SINAPI** da Caixa para puxar códigos, descrições e preços oficiais instantaneamente.
  - Permite cadastrar **Insumos de Cotação de Mercado Local** para itens exclusivos do município (com base em pesquisas de preços de mercado).
  - Cálculo instantâneo do subtotal de Mão de Obra, Materiais, Equipamentos e do Preço c/ BDI.
- **Inserção Direta na Planilha:** O botão `+ Composição Própria (CPU)` em cada macroetapa abre uma gaveta rápida para selecionar qualquer CPU já criada com sua quantidade, além de atalho direto para criar novas.
- **Ficha Técnica Analítica (Memória de Cálculo):** Ao clicar no selo `[CPU-XX]` na planilha orçamentária, o sistema exibe a ficha técnica completa para fins de auditoria e prestação de contas aos órgãos de controle (Caixa, TCU, TCE).

---

## 7. Módulo de Cotação de Mercado de Insumos (Lei 14.133/2021 e TCU)

### 📌 Informações Exigidas para Compor uma Cotação de Mercado Válida
Segundo o **Art. 23 da Lei Federal 14.133/2021** e a **IN SEGES/ME nº 65/2021**, quando um insumo não constar em tabelas de referência oficial (SINAPI/SICRO), a pesquisa de preços deve ser instruída com os seguintes elementos probatórios:

1. **Identificação Completa dos Fornecedores (Mínimo de 3 Fontes):**
   - **Razão Social e Nome Fantasia:** Identificação inequívoca da pessoa jurídica.
   - **CNPJ Ativo:** Para consulta de regularidade fiscal e idoneidade.
   - **Endereço Completo e Município/UF:** Para comprovação de atuação territorial e cálculo de frete.
   - **Telefone / WhatsApp e E-mail Comercial:** Canais oficiais de contato.
   - **Nome do Vendedor / Responsável:** Identificação da pessoa física emitente da proposta.

2. **Condições Comerciais e Proposta de Preço:**
   - **Preço Unitário Ofertado (R$):** Valor líquido por unidade cotada.
   - **Condição do Frete (CIF/FOB):** Obrigatoriedade de condição **CIF** (preço posto no local da obra).
   - **Data da Cotação:** Validade temporal (cotações não podem ser anteriores a 6 meses da data-base).
   - **Prazo de Validade da Proposta:** Prazo mínimo durante o qual a empresa garante o preço (geralmente 30 a 60 dias).

3. **Comprovações e Evidências Digitais (Dossiê Anexo):**
   - **Links / Sítios Eletrônicos Visitados (URLs):** Endereço exato do e-commerce, portal de compras ou tabela pública de preços consultada.
   - **Documentos Comprobatórios (Upload):**
     - Arquivo em PDF da proposta comercial timbrada e assinada.
     - Foto do produto / print da tela do e-commerce contendo data, hora e dados da empresa.

4. **Metodologia de Apuração do Preço de Referência:**
   - **Mediana das Cotações (Padrão Recomendado pelo TCU - Acórdão 2622/2013-Plenário):** Elimina distorções causadas por orçamentos extremos ou fora da realidade.
   - **Média Aritmética Simples:** Aplicável quando os preços apresentarem desvio padrão reduzido.
   - **Menor Preço Válido:** Adotado mediante justificativa técnica expressa no processo.

---

## 8. Atualizações Realizadas e Homologadas

### 8.1. Sincronização em Tempo Real do Valor Total com BDI
- **Problema Anterior:** Ao abrir o card de feição da obra no mapa, o campo *"Valor Total Estimado"* exibia `R$ 0,00` mesmo quando a planilha orçamentária já continha itens orçados (ex: `R$ 998,26`), gerando divergência entre o formulário lateral e o modal de orçamento.
- **Solução Implementada:**
  1. Criação da função bidirecional `sincronizarCardOrcamento(orc)` em `src/orcamento.js` e `src/formRenderer.js`.
  2. Ao carregar a feição ou modificar qualquer item/quantidade/BDI na planilha, o valor com BDI é sincronizado instantaneamente no elemento DOM `#card-orcamento-valor-total` com formatação oficial brasileira (`minimumFractionDigits: 2, maximumFractionDigits: 2`).
  3. Atualização automática dos atributos da feição (`Valor Total da Obra (R$)`, `valor_total_obra`, `BDI (%)` e `orcamento_dados`), assegurando persistência no Supabase e no `localStorage`.

### 8.2. Remoção do Selo "SINAPI OFICIAL" e Inclusão da Tag Dinâmica de BDI
- **Problema Anterior:** Existia um badge estático `SINAPI OFICIAL` no card da aba de orçamento da feição e no cabeçalho do modal, inadequado para obras que combinam itens do SINAPI com CPUs próprias e cotações de mercado.
- **Solução Implementada:**
  1. Remoção do selo estático de `src/formRenderer.js` e de `index.html`.
  2. Substituição no card pelo indicativo visual e dinâmico `#card-orcamento-bdi-tag`, exibindo a alíquota exata calculada (ex: `Total com BDI (24,80%)`).

### 8.3. Cronograma Físico-Financeiro com Precisão Decimal Exata (Sem Arredondamento)
- **Problema Anterior:** O cronograma utilizava `step="1"` nos campos de avanço físico e formatava os valores monetários com `{ minimumFractionDigits: 0, maximumFractionDigits: 0 }`, arredondando valores reais como `R$ 99,83` para `R$ 100`, gerando discrepâncias contábeis nas medições mensais.
- **Solução Implementada:**
  1. Entrada fracionária com precisão de centésimos (`step="0.01"`, `min="0"`, `max="100"`), permitindo percentuais como `33,33%`, `12,50%`, etc.
  2. Cálculo contábil exato dos valores monetários mensais por macroetapa:
     $$\text{Valor do Mês} = \text{round}\left(\frac{\text{Total com BDI} \times \text{Percentual}}{100}, 2\right)$$
  3. Exibição de todos os desembolsos mensais, desembolsos acumulados e percentuais totais com duas casas decimais tanto na tela quanto no relatório para impressão em PDF.
  4. Validação e soma de consistência de 100.00% com realce visual em verde esmeralda quando fechado, e alerta em rosa caso haja divergência.

### 8.4. Bateria de Testes Automatizados e Auditoria de Qualidade (QA Gatekeeper)
- Criação da suíte unitária dedicada `tests/orcamentoSinapi.test.js` cobrindo 7 cenários críticos (cálculo de BDI, sincronização do card, precisão decimal no cronograma e exportação PDF).
- Integração de `src/orcamento.js` e do teste unitário ao script master `test_sistema_qa.js`, totalizando **213 testes aprovados com 100% de sucesso**.

### 8.5. Resolução do Erro Supabase HTTP 500 na Consulta de Feições
- **Diagnóstico do Erro:**
  A requisição `GET .../rest/v1/feicoes?select=id,propriedades,geometria&theme_id=eq.d00b...&offset=0&limit=1000` retornava `500 (Internal Server Error)` no PostgREST porque utilizava a opção `{ count: 'estimated' }`. Em tabelas com Row Level Security (RLS) e funções plpgsql (`public.tem_permissao`), o PostgreSQL tenta executar `EXPLAIN (FORMAT JSON)` para estimar contagens, o que falha ou atinge o `statement_timeout` no PostgREST sob RLS.
- **Solução Implementada:**
  1. No [src/main.js](file:///c:/Users/Windows%2011/Documents/Projetos/Projeto_V01/Projetos_Obras/src/main.js), a consulta inicial de feições da camada agora executa `.select('id, propriedades, geometria')` limpa, sem o cabeçalho `Prefer: count=estimated`.
  2. Para camadas com até 1.000 feições (como "Ocupações Orla" com 80 registros), a primeira requisição já retorna 100% dos dados instantaneamente, dispensando requisições extras.
  3. Para camadas extensas (> 1.000 feições, ex: CTM-Municipal), a contagem total para paginação é obtida de forma segura via requisição HEAD (`.select('id', { count: 'exact', head: true })`), que consome zero tráfego de dados e não dispara planejamento instável.
  4. Implementação de retry automático e preservação do cache local (IndexedDB + GeoJSON local), assegurando resiliência total na interface gráfica sem qualquer erro no console.




