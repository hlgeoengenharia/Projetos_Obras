# Projeto CONSTRUCTIVE - Sistema de Gestão de Obras

## 📋 Visão Geral do Projeto

**Nome:** CONSTRUCTIVE
**Tipo:** Aplicação Web de Gestão de Construção/Obras
**Tecnologia:** HTML + Tailwind CSS + Google Maps JavaScript API

## 📁 Estrutura de Arquivos

```
Projetos_Obras/
├── dashboard/
│   ├── code.html          # Principal (página única)
│   ├── config.js         # Configurações e dados
│   └── .env.local       # Variáveis de ambiente
├── icone_3d/
│   └── icone3d.png     # Ícone do marcador
├── project_technical_system/
│   └── DESIGN.md       # Sistema de design
└── start-server.bat    # Script iniciar servidor
```

## 🗺️ Estado Atual do Desenvolvimento

### ✅ Funcionalidades Implementadas

1. **Mapa Interativo**
   - Google Maps JavaScript API
   - Localização padrão: Cabedelo, PB (-7.0182, -34.8336)
   - Tipos de mapa: Mapa, Satélite, Híbrido
   - Marcador com ícone customizado (icone3d.png)

2. **Menu Lateral**
   - Abre/fecha ao clicar no botão hamburger
   - Fecha ao clicar fora
   - Card "Projetos/Obras" expansível (abre/fecha lista)

3. **Controles do Mapa**
   - Zoom +/-
   - Geolocalização (minha localização)
   - Alternância de tipos de mapa

4. **Interface Responsiva**
   - Adaptável para mobile e desktop
   - Menu superior com links: Início, Projetos, Obras

5. **Navegação**
   - Header com menu hamburger
   - Links: Início, Projetos, Obras
   - Sidebar com lista de obras

### 🔧API Keys e Configurações

**Google Maps API Key:**
```
AIzaSyCjmV_PqXvAiSw5Db-CD0v_SMnY6tkHGXw
```

**Proteção Recomendada (Google Cloud Console):**
- Restringir por HTTP referrer: `localhost:8080/*`
- Limitar quota diária: 1.000/dia
- API liberada: Maps JavaScript API

### 📍 Como Executar

```bash
# Via start-server.bat (Windows)
start-server.bat

# Ou manualmente
cd Projetos_Obras
python -m http.server 8080
```

Acesse: `http://localhost:8080/dashboard/code.html`

### 🎨 Design System

Cores definidas em `project_technical_system/DESIGN.md`:
- Primary: #051125 (Navy)
- Secondary: #47607e (Slate)
- Background: #f9faf5

### ⚠️ Pontos de Atenção

1. **Google Maps API Key**
   - Exposta no código (config.js)
   - Restringir no Google Cloud Console para segurança

2. **Avisos doConsole (não críticos)**
   - "loaded directly without loading=async" - alerta de performance
   - "google.maps.Marker is deprecated" - funcionando até 2025+

### 📝 Dados de Obras (config.js)

```javascript
const OBRAS = [
  { id: 1, nome: 'Obra A', lat: -7.0182, lng: -34.8336 },
  { id: 2, nome: 'Obra B', lat: -7.0250, lng: -34.8400 },
  { id: 3, nome: 'Obra C', lat: -7.0100, lng: -34.8250 },
  { id: 4, nome: 'Obra D', lat: -7.0300, lng: -34.8350 },
  { id: 5, nome: 'Obra E', lat: -7.0150, lng: -34.8380 }
];
```

## 📌 Próximos Passos Sugeridos

1. [ ] Implementar lista real de obras no mapa
2. [ ] Adicionar clique nos marcadores para detalhes
3. [ ] Integrar com backend para dados reais
4. [ ] Adicionar página de listagem de obras
5. [ ] Implementar sistema de autenticação
6. [ ] Adicionar dashboard com métricas

## 📞Suporte

Para continuar o desenvolvimento com outro agente de IA:
- Execute `start-server.bat` e abra `http://localhost:8080/dashboard/code.html`
- O arquivo principal é `dashboard/code.html`
- Configurações estão em `dashboard/config.js`