/**
 * eventsEngine.js - Motor de Monitoramento de Eventos, Prazos e Alertas Territoriais
 * Suporta gatilhos de periodicidade (ex: manutenção semestral), vencimento de prazos/alvarás,
 * validade calculada (emissão + prazo), filtros condicionais e atribuição por usuário ou setor.
 */

(function(global) {
  'use strict';

  const STORAGE_DISMISSED_KEY = 'geogestor_alertas_cientes';
  const STORAGE_SNOOZED_KEY = 'geogestor_alertas_adiados';

  /**
   * Utilitário para parsear datas com tolerância a formatos BR e ISO.
   */
  function parseDateSafe(val) {
    if (!val) return null;
    if (val instanceof Date && !isNaN(val.getTime())) return val;
    if (typeof val === 'number') {
      const d = new Date(val);
      return isNaN(d.getTime()) ? null : d;
    }
    const s = String(val).trim();
    if (!s) return null;

    // Formato BR DD/MM/AAAA ou DD/MM/AAAA HH:MM
    const brMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
    if (brMatch) {
      const dia = parseInt(brMatch[1], 10);
      const mes = parseInt(brMatch[2], 10) - 1;
      const ano = parseInt(brMatch[3], 10);
      const h = brMatch[4] ? parseInt(brMatch[4], 10) : 0;
      const m = brMatch[5] ? parseInt(brMatch[5], 10) : 0;
      const sec = brMatch[6] ? parseInt(brMatch[6], 10) : 0;
      const d = new Date(ano, mes, dia, h, m, sec);
      return isNaN(d.getTime()) ? null : d;
    }

    // Formato ISO YYYY-MM-DD
    const isoDate = new Date(s);
    if (!isNaN(isoDate.getTime())) return isoDate;

    return null;
  }

  /**
   * Adiciona intervalo de tempo (dias, meses ou anos) a uma data base.
   */
  function addInterval(baseDate, value, unit) {
    const d = new Date(baseDate.getTime());
    const val = parseInt(value, 10) || 0;
    const u = (unit || 'meses').toLowerCase();

    if (u === 'dias' || u === 'dia' || u === 'days') {
      d.setDate(d.getDate() + val);
    } else if (u === 'anos' || u === 'ano' || u === 'years') {
      d.setFullYear(d.getFullYear() + val);
    } else {
      // Padrão meses
      d.setMonth(d.getMonth() + val);
    }
    return d;
  }

  /**
   * Extrai o valor de uma propriedade da feição de forma resiliente.
   */
  function getPropValue(feature, fieldKey) {
    if (!feature || !feature.properties || !fieldKey) return null;
    const p = feature.properties;
    if (p[fieldKey] !== undefined && p[fieldKey] !== null) return p[fieldKey];
    
    // Tenta encontrar por case-insensitive ou por id de campo dentro de arrays
    const lowerKey = fieldKey.toLowerCase();
    for (const k of Object.keys(p)) {
      if (k.toLowerCase() === lowerKey) return p[k];
    }
    return null;
  }

  /**
   * Extrai todos os campos de data/hora de um formulário.
   */
  function extractDateFieldsFromForm(form) {
    if (!form) return [];
    const tabs = form.tabs || form.schema || [];
    const dateFields = [];
    tabs.forEach(tab => {
      (tab.fields || []).forEach(f => {
        const type = (f.type || '').toLowerCase();
        if (type === 'date' || type === 'datetime' || type === 'datetime-local' || /data/i.test(f.label || '')) {
          dateFields.push({
            id: f.id,
            name: f.name || f.id,
            label: f.label || f.name || f.id,
            type: f.type || 'date',
            tabTitle: tab.title || 'Aba'
          });
        }
      });
    });
    return dateFields;
  }

  /**
   * Extrai todos os campos em geral de um formulário.
   */
  function extractAllFieldsFromForm(form) {
    if (!form) return [];
    const tabs = form.tabs || form.schema || [];
    const all = [];
    tabs.forEach(tab => {
      (tab.fields || []).forEach(f => {
        all.push({
          id: f.id,
          name: f.name || f.id,
          label: f.label || f.name || f.id,
          type: f.type || 'text',
          tabTitle: tab.title || 'Aba'
        });
      });
    });
    return all;
  }

  /**
   * Interpolação de variáveis da mensagem: {nome}, {dias}, etc.
   */
  function interpolateMessage(template, feature, trigger, ctx) {
    if (!template) return '';
    let msg = template;
    const props = (feature && feature.properties) || {};

    // Substitui variáveis conhecidas de contexto
    msg = msg.replace(/\{dias_restantes\}/gi, ctx.daysDiff >= 0 ? `${ctx.daysDiff} dias` : `${Math.abs(ctx.daysDiff)} dias em atraso`);
    msg = msg.replace(/\{dias\}/gi, String(Math.abs(ctx.daysDiff)));
    msg = msg.replace(/\{data_limite\}/gi, ctx.targetDateStr || '');
    msg = msg.replace(/\{data_base\}/gi, ctx.baseDateStr || '');
    msg = msg.replace(/\{nome_camada\}/gi, ctx.themeName || 'Camada');

    // Substitui variáveis pelas propriedades da feição
    Object.keys(props).forEach(k => {
      const v = props[k];
      if (typeof v === 'string' || typeof v === 'number') {
        const regex = new RegExp(`\\{${k}\\}`, 'gi');
        msg = msg.replace(regex, String(v));
      }
    });

    // Se houver tags com rótulo ou chaves que não foram substituídas, limpa chaves vazias ou substitui por texto legível
    msg = msg.replace(/\{[a-zA-Z0-9_]+\}/g, '');
    return msg.trim();
  }

  /**
   * Testa condição de filtro (se configurada no gatilho).
   */
  function testFilterCondition(trigger, feature) {
    if (!trigger.campo_filtro || trigger.filtro_valor === undefined || trigger.filtro_valor === null || trigger.filtro_valor === '') {
      return true; // Sem filtro adicional
    }
    const val = getPropValue(feature, trigger.campo_filtro);
    const op = trigger.filtro_operador || '=';
    const target = String(trigger.filtro_valor).trim().toLowerCase();
    const current = String(val !== null && val !== undefined ? val : '').trim().toLowerCase();

    if (op === '=' || op === '==') return current === target;
    if (op === '!=' || op === '<>') return current !== target;
    if (op === 'contem') return current.includes(target);
    if (op === 'nao_contem') return !current.includes(target);
    if (op === '>') return parseFloat(current) > parseFloat(target);
    if (op === '<') return parseFloat(current) < parseFloat(target);
    if (op === '>=') return parseFloat(current) >= parseFloat(target);
    if (op === '<=') return parseFloat(current) <= parseFloat(target);
    return true;
  }

  /**
   * Avalia um gatilho individual contra uma feição.
   * Retorna null se não houver alerta ativo, ou um objeto de Alerta estruturado.
   */
  function evaluateTrigger(trigger, feature, theme, todayDate) {
    if (!trigger || !feature) return null;
    if (trigger.ativo === false) return null;

    const featureId = (feature.properties && (feature.properties._tempId || feature.properties.id_banco || feature.properties.id)) || feature.id || `feat_${Math.random().toString(36).substr(2, 9)}`;

    const today = todayDate ? new Date(todayDate) : new Date();
    today.setHours(0, 0, 0, 0);

    // 1. Testa filtro condicional
    if (!testFilterCondition(trigger, feature)) {
      return null;
    }

    // 2. Extrai data base
    const rawBaseDate = getPropValue(feature, trigger.campo_data);
    if (!rawBaseDate) return null;
    const baseDate = parseDateSafe(rawBaseDate);
    if (!baseDate) return null;
    baseDate.setHours(0, 0, 0, 0);

    let targetDate = null;
    const tipo = trigger.tipo || 'periodicidade';

    if (tipo === 'periodicidade') {
      // Periodicidade após uma data: baseDate + intervalo (ex: última manutenção + 6 meses)
      const val = parseInt(trigger.intervalo_valor, 10) || 6;
      const unit = trigger.intervalo_unidade || 'meses';
      targetDate = addInterval(baseDate, val, unit);
    } else if (tipo === 'validade') {
      // Validade direta: o campo já é a data de validade/vencimento
      targetDate = new Date(baseDate.getTime());
    } else if (tipo === 'calculado') {
      // Validade calculada: baseDate (emissão) + prazo em campo ou fixo
      let prazoVal = parseInt(trigger.intervalo_valor, 10);
      const campoPrazoName = trigger.campo_prazo || trigger.campo_prazo_valor;
      if (campoPrazoName) {
        const propPrazo = getPropValue(feature, campoPrazoName);
        if (propPrazo !== null && propPrazo !== undefined && propPrazo !== '') {
          prazoVal = parseInt(propPrazo, 10);
        }
      }
      prazoVal = prazoVal || 30;
      targetDate = addInterval(baseDate, prazoVal, trigger.intervalo_unidade || trigger.prazo_unidade || 'dias');
    }

    if (!targetDate || isNaN(targetDate.getTime())) return null;
    targetDate.setHours(0, 0, 0, 0);

    // Diferença em dias entre targetDate e hoje (positivo = faltam dias; negativo = já venceu)
    const diffMs = targetDate.getTime() - today.getTime();
    const daysDiff = Math.round(diffMs / (1000 * 60 * 60 * 24));

    const avisoPrevioDias = parseInt(trigger.aviso_previo_dias, 10) || 0;

    // Condição de disparo: se já passou da data alvo (vencido) OU se está na janela de aviso prévio
    const isOverdue = daysDiff < 0;
    const isTriggered = isOverdue || (daysDiff <= avisoPrevioDias);

    if (!isTriggered) return null;

    // Severidade: se já venceu, eleva automaticamente para crítico se configurado
    let severity = trigger.severidade || 'atencao';
    if (isOverdue) {
      severity = 'critico';
    } else if (daysDiff <= 3 && severity === 'info') {
      severity = 'atencao';
    }

    // Cores e labels de severidade
    const sevMap = {
      critico: { label: 'Crítico / Vencido', color: '#ef4444', ringColor: 'rgba(239, 68, 68, 0.45)', badgeClass: 'bg-red-500 text-white' },
      atencao: { label: 'Atenção / Vencendo', color: '#f59e0b', ringColor: 'rgba(245, 158, 11, 0.45)', badgeClass: 'bg-amber-500 text-white' },
      info: { label: 'Informativo', color: '#10b981', ringColor: 'rgba(16, 185, 129, 0.45)', badgeClass: 'bg-emerald-500 text-white' }
    };

    const sevInfo = sevMap[severity] || sevMap.atencao;

    const featId = (feature.properties && (feature.properties._tempId || feature.properties.id_banco || feature.properties.id)) || feature.id || 'feat_unknown';
    const alertId = `${trigger.id || 'trig'}_${featId}`;

    const dateFmt = (d) => {
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yy = d.getFullYear();
      return `${dd}/${mm}/${yy}`;
    };

    const ctx = {
      daysDiff,
      targetDateStr: dateFmt(targetDate),
      baseDateStr: dateFmt(baseDate),
      themeName: (theme && theme.name) || 'Camada',
      isOverdue
    };

    let titleFeature = (theme && theme.disp1 && getPropValue(feature, theme.disp1)) ||
                       getPropValue(feature, 'nome') ||
                       getPropValue(feature, 'Nome') ||
                       getPropValue(feature, 'logradouro') ||
                       getPropValue(feature, 'descricao') ||
                       `Feição #${featId.toString().slice(-6)}`;

    let message = interpolateMessage(trigger.mensagem || `Evento: {nome_camada} atingiu prazo estabelecido em {data_limite}.`, feature, trigger, ctx);

    // Coordenadas para zoom / mapa
    let coords = null;
    if (feature.geometry) {
      const g = feature.geometry;
      if (g.type === 'Point' && Array.isArray(g.coordinates)) {
        coords = [g.coordinates[1], g.coordinates[0]];
      } else if (g.coordinates && Array.isArray(g.coordinates)) {
        // Pega o primeiro ponto do polígono/linha
        const flatten = function(arr) {
          return Array.isArray(arr[0]) ? flatten(arr[0]) : arr;
        };
        const firstPair = flatten(g.coordinates);
        if (firstPair && firstPair.length >= 2) {
          coords = [firstPair[1], firstPair[0]];
        }
      }
    }

    return {
      id: alertId,
      triggerId: trigger.id,
      triggerName: trigger.nome || 'Evento Monitorado',
      tipo: tipo,
      featureId: featId,
      featureTitle: titleFeature,
      themeId: theme ? theme.id : null,
      themeName: (theme && theme.name) || 'Camada',
      themeColor: (theme && theme.color) || '#0284c7',
      severity: severity,
      severidade: severity,
      severityLabel: sevInfo.label,
      severityColor: sevInfo.color,
      severityRingColor: sevInfo.ringColor,
      severityBadgeClass: sevInfo.badgeClass,
      targetDate: targetDate.toISOString(),
      targetDateFormatted: ctx.targetDateStr,
      baseDateFormatted: ctx.baseDateStr,
      daysDiff: daysDiff,
      isOverdue: isOverdue,
      status: isOverdue ? 'vencido' : 'proximo',
      statusLabel: isOverdue ? `Atrasado há ${Math.abs(daysDiff)} dias` : (daysDiff === 0 ? 'Vence hoje' : `Vence em ${daysDiff} dias`),
      message: message,
      mensagemFormatada: message,
      featureId: featureId,
      responsavelTipo: trigger.responsavel_tipo || 'todos',
      responsavelId: trigger.responsavel_id || null,
      responsavelNome: trigger.responsavel_nome || 'Todos os Operadores',
      coords: coords,
      feature: feature
    };
  }

  /**
   * Avalia se o alerta é destinado ao usuário logado.
   */
  function isAlertForUser(alert, currentUserProfile) {
    if (!alert || !alert.responsavelTipo || alert.responsavelTipo === 'todos') {
      return true;
    }
    if (!currentUserProfile) return true; // Se sem perfil, mostra

    if (alert.responsavelTipo === 'usuario') {
      if (!alert.responsavelId) return true;
      const uid = String(currentUserProfile.id || '').toLowerCase();
      const email = String(currentUserProfile.email || '').toLowerCase();
      const target = String(alert.responsavelId).toLowerCase();
      return uid === target || email === target;
    }

    if (alert.responsavelTipo === 'setor') {
      if (!alert.responsavelId) return true;
      const userSetor = String(currentUserProfile.setor || currentUserProfile.departamento || '').toLowerCase();
      const targetSetor = String(alert.responsavelId).toLowerCase();
      return userSetor === targetSetor;
    }

    if (alert.responsavelTipo === 'criador') {
      const creator = getPropValue(alert.feature, '_created_by') || getPropValue(alert.feature, 'criado_por') || getPropValue(alert.feature, 'usuario_criacao');
      if (!creator) return true;
      const uid = String(currentUserProfile.id || '').toLowerCase();
      const email = String(currentUserProfile.email || '').toLowerCase();
      return String(creator).toLowerCase() === uid || String(creator).toLowerCase() === email;
    }

    return true;
  }

  /**
   * Gerenciamento de descarte / ciência local.
   */
  function resolveActiveUserId(explicitId) {
    if (explicitId) return String(explicitId);
    if (global.currentUserProfile && global.currentUserProfile.id) return String(global.currentUserProfile.id);
    if (global.userProfile && global.userProfile.id) return String(global.userProfile.id);
    return 'default';
  }

  function getDismissedMap(userId) {
    try {
      const uId = resolveActiveUserId(userId);
      const keyUser = `${STORAGE_DISMISSED_KEY}_${uId}`;
      const keyDefault = `${STORAGE_DISMISSED_KEY}_default`;
      const keyBase = STORAGE_DISMISSED_KEY;

      const rawUser = localStorage.getItem(keyUser);
      const rawDef = localStorage.getItem(keyDefault);
      const rawBase = localStorage.getItem(keyBase);

      return Object.assign({},
        rawBase ? JSON.parse(rawBase) : {},
        rawDef ? JSON.parse(rawDef) : {},
        rawUser ? JSON.parse(rawUser) : {}
      );
    } catch (e) {
      return {};
    }
  }

  function getSnoozedMap(userId) {
    try {
      const uId = resolveActiveUserId(userId);
      const keyUser = `${STORAGE_SNOOZED_KEY}_${uId}`;
      const keyDefault = `${STORAGE_SNOOZED_KEY}_default`;
      const keyBase = STORAGE_SNOOZED_KEY;

      const rawUser = localStorage.getItem(keyUser);
      const rawDef = localStorage.getItem(keyDefault);
      const rawBase = localStorage.getItem(keyBase);

      return Object.assign({},
        rawBase ? JSON.parse(rawBase) : {},
        rawDef ? JSON.parse(rawDef) : {},
        rawUser ? JSON.parse(rawUser) : {}
      );
    } catch (e) {
      return {};
    }
  }

  function markAlertDismissed(alertId, userId) {
    try {
      const uId = resolveActiveUserId(userId);
      const key = `${STORAGE_DISMISSED_KEY}_${uId}`;
      const map = getDismissedMap(uId);
      map[alertId] = { dismissedAt: new Date().toISOString() };
      localStorage.setItem(key, JSON.stringify(map));
      localStorage.setItem(STORAGE_DISMISSED_KEY, JSON.stringify(map));
      return true;
    } catch (e) {
      return false;
    }
  }

  function snoozeAlert(alertId, days, userId) {
    try {
      const uId = resolveActiveUserId(userId);
      const key = `${STORAGE_SNOOZED_KEY}_${uId}`;
      const map = getSnoozedMap(uId);
      const snoozeUntil = new Date();
      snoozeUntil.setDate(snoozeUntil.getDate() + (parseInt(days, 10) || 7));
      map[alertId] = { snoozedUntil: snoozeUntil.toISOString() };
      localStorage.setItem(key, JSON.stringify(map));
      localStorage.setItem(STORAGE_SNOOZED_KEY, JSON.stringify(map));
      return true;
    } catch (e) {
      return false;
    }
  }

  function isAlertDismissed(alertId, userId) {
    const map = getDismissedMap(userId);
    return Boolean(map[alertId]);
  }

  function isAlertSnoozed(alertId, userId) {
    const map = getSnoozedMap(userId);
    const item = map[alertId];
    if (!item || !item.snoozedUntil) return false;
    const until = new Date(item.snoozedUntil);
    return !isNaN(until.getTime()) && until.getTime() > Date.now();
  }

  function clearDismissedAlerts(userId) {
    try {
      const k1 = `${STORAGE_DISMISSED_KEY}_${userId || 'default'}`;
      const k2 = `${STORAGE_SNOOZED_KEY}_${userId || 'default'}`;
      localStorage.removeItem(k1);
      localStorage.removeItem(k2);
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Avalia todos os temas e feições em memória e calcula a lista de alertas ativos.
   */
  function computeActiveAlerts(themes, arg2, arg3, options = {}) {
    const activeAlerts = [];
    if (!Array.isArray(themes)) return activeAlerts;

    let currentUserProfile = null;
    let formsList = [];

    if (Array.isArray(arg2)) {
      formsList = arg2;
      currentUserProfile = arg3 && typeof arg3 === 'object' && !Array.isArray(arg3) ? arg3 : null;
    } else {
      currentUserProfile = arg2 && typeof arg2 === 'object' ? arg2 : null;
      formsList = Array.isArray(arg3) ? arg3 : (global.forms || global.allForms || []);
    }

    const userId = currentUserProfile ? currentUserProfile.id : null;
    const today = (options && options.today) || new Date();

    themes.forEach(theme => {
      if (!theme || !theme.features || !theme.features.length) return;

      // Localiza o formulário associado à camada
      let form = null;
      if (theme.formId) {
        form = formsList.find(f => String(f.id) === String(theme.formId));
      }
      if (!form && theme.form_id) {
        form = formsList.find(f => String(f.id) === String(theme.form_id));
      }
      if (!form) {
        // Tenta achar pelo nome ou título
        form = formsList.find(f => f.name && theme.name && f.name.trim().toLowerCase() === theme.name.trim().toLowerCase());
      }

      if (!form) return;

      const triggers = form.eventTriggers || form.event_triggers || [];
      if (!Array.isArray(triggers) || triggers.length === 0) return;

      // Avalia cada gatilho contra cada feição da camada
      triggers.forEach(trigger => {
        if (trigger.ativo === false) return;

        theme.features.forEach(feature => {
          const alert = evaluateTrigger(trigger, feature, theme, today);
          if (alert) {
            // Verifica permissão do usuário
            if (!isAlertForUser(alert, currentUserProfile)) return;

            // Verifica se o usuário já deu ciente ou se está em snooze
            if (!options.includeDismissed && isAlertDismissed(alert.id, userId)) return;
            if (!options.includeSnoozed && isAlertSnoozed(alert.id, userId)) return;

            activeAlerts.push(alert);
          }
        });
      });
    });

    // Ordenação: 1º Críticos, 2º Atenção, 3º Informativos; e dentro da severidade, os mais atrasados/próximos primeiro
    const orderWeight = { critico: 1, atencao: 2, info: 3 };
    activeAlerts.sort((a, b) => {
      const wA = orderWeight[a.severity] || 9;
      const wB = orderWeight[b.severity] || 9;
      if (wA !== wB) return wA - wB;
      return a.daysDiff - b.daysDiff;
    });

    return activeAlerts;
  }

  // =========================================================================
  // CAMADA DE INTERFACE GRÁFICA (UI) E INTEGRAÇÃO CARTOGRÁFICA LEAFLET
  // =========================================================================

  let _activeAlertsCache = [];
  let _currentFilterTab = 'all';
  let _isAlertFilterModeActive = false;
  let _haloLayerGroup = null;
  let _hasInjectedStyles = false;

  /**
   * Injeta os estilos de animação CSS de pulso (Radar Glow / Halo luminoso) no documento.
   */
  function injectRadarGlowStyles() {
    if (_hasInjectedStyles || typeof document === 'undefined') return;
    _hasInjectedStyles = true;

    const style = document.createElement('style');
    style.id = 'events-engine-radar-glow-styles';
    style.textContent = `
      @keyframes alert-radar-glow-critico {
        0% { transform: scale(0.9); opacity: 0.85; box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
        70% { transform: scale(1.4); opacity: 0.15; box-shadow: 0 0 0 16px rgba(239, 68, 68, 0); }
        100% { transform: scale(1.6); opacity: 0; box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
      }
      @keyframes alert-radar-glow-atencao {
        0% { transform: scale(0.9); opacity: 0.85; box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.7); }
        70% { transform: scale(1.4); opacity: 0.15; box-shadow: 0 0 0 14px rgba(245, 158, 11, 0); }
        100% { transform: scale(1.6); opacity: 0; box-shadow: 0 0 0 0 rgba(245, 158, 11, 0); }
      }
      .alert-halo-critico {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: rgba(239, 68, 68, 0.45);
        border: 2px solid #ef4444;
        animation: alert-radar-glow-critico 1.8s infinite ease-out;
        pointer-events: none;
      }
      .alert-halo-atencao {
        width: 30px;
        height: 30px;
        border-radius: 50%;
        background: rgba(245, 158, 11, 0.45);
        border: 2px solid #f59e0b;
        animation: alert-radar-glow-atencao 2.2s infinite ease-out;
        pointer-events: none;
      }
      .alert-halo-center-dot {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 10px;
        height: 10px;
        border-radius: 50%;
        border: 1.5px solid #ffffff;
        box-shadow: 0 1px 3px rgba(0,0,0,0.5);
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Recalcula os alertas ativos e atualiza a interface e mapa.
   */
  function refreshAlerts() {
    if (typeof window === 'undefined') return [];
    injectRadarGlowStyles();

    const themesList = window.themes || [];
    const formsList = window.forms || window.allForms || [];
    const userProfile = window.currentUserProfile || (window.parent && window.parent.homeUserProfile) || null;

    _activeAlertsCache = computeActiveAlerts(themesList, userProfile, formsList, {
      includeDismissed: false,
      includeSnoozed: false
    });

    updateAlertBadges();
    renderAlertsDrawer();
    updateMapHaloGlow();
    checkEntryBanner();

    return _activeAlertsCache;
  }

  /**
   * Atualiza os contadores no badge do sininho (topbar) e no botão de filtro rápido do mapa.
   */
  function updateAlertBadges() {
    if (typeof document === 'undefined') return;

    const total = _activeAlertsCache.length;
    const badge = document.getElementById('alerts-count-badge');
    const subtitle = document.getElementById('alerts-drawer-subtitle');
    const filterBtn = document.getElementById('btn-filter-alerts');
    const filterCount = document.getElementById('btn-filter-alerts-count');

    if (badge) {
      if (total > 0) {
        badge.innerText = total > 99 ? '99+' : String(total);
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    }

    if (subtitle) {
      if (total === 0) {
        subtitle.innerText = 'Nenhum alerta pendente';
      } else {
        const criticos = _activeAlertsCache.filter(a => a.severity === 'critico').length;
        subtitle.innerText = criticos > 0 ? `${total} ativo(s) (${criticos} crítico(s))` : `${total} monitoramento(s) ativo(s)`;
      }
    }

    if (filterBtn && filterCount) {
      filterCount.innerText = String(total);
      if (total > 0) {
        filterBtn.classList.remove('hidden');
      } else if (!_isAlertFilterModeActive) {
        filterBtn.classList.add('hidden');
      }
    }
  }

  /**
   * Abre/fecha o Drawer (dropdown) de Alertas do Topbar.
   */
  function toggleAlertsDrawer(e) {
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
    const drawer = document.getElementById('alerts-drawer');
    if (!drawer) return;

    const isHidden = drawer.classList.contains('hidden');
    if (isHidden) {
      drawer.classList.remove('hidden');
      renderAlertsDrawer();
    } else {
      drawer.classList.add('hidden');
    }
  }

  /**
   * Filtra os alertas exibidos no Drawer por aba de severidade.
   */
  function filterAlertsTab(tab) {
    _currentFilterTab = tab || 'all';

    const tabs = ['all', 'critico', 'atencao', 'info'];
    tabs.forEach(t => {
      const btn = document.getElementById(`alerts-tab-${t}`);
      if (!btn) return;
      if (t === _currentFilterTab) {
        btn.className = 'px-2.5 py-1 rounded-lg bg-amber-500 text-white font-bold transition-all shadow-xs cursor-pointer';
      } else {
        btn.className = 'px-2.5 py-1 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer';
      }
    });

    renderAlertsDrawer();
  }

  /**
   * Renderiza a lista de cards de alertas dentro do Drawer.
   */
  function renderAlertsDrawer() {
    const container = document.getElementById('alerts-list-container');
    if (!container) return;

    let items = _activeAlertsCache;
    if (_currentFilterTab !== 'all') {
      items = items.filter(a => a.severity === _currentFilterTab);
    }

    if (items.length === 0) {
      container.innerHTML = `
        <div class="py-10 text-center flex flex-col items-center justify-center text-slate-400">
          <div class="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center mb-2.5 border border-emerald-500/20">
            <span class="material-symbols-outlined text-[26px]">task_alt</span>
          </div>
          <p class="font-bold text-xs text-slate-700 dark:text-slate-300">Tudo em dia!</p>
          <span class="text-[11px] text-slate-400 max-w-[240px] mt-0.5 leading-snug">
            ${_currentFilterTab === 'all' ? 'Nenhum alerta de prazo ou periodicidade pendente neste momento.' : `Nenhum alerta na categoria selecionada.`}
          </span>
        </div>
      `;
      return;
    }

    let html = '';
    items.forEach(alert => {
      const isCrit = alert.severity === 'critico';
      const isAten = alert.severity === 'atencao';

      const borderClass = isCrit ? 'border-rose-300 dark:border-rose-900/60 bg-rose-50/30 dark:bg-rose-950/20' : 
                          (isAten ? 'border-amber-300 dark:border-amber-900/60 bg-amber-50/30 dark:bg-amber-950/20' : 
                                    'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900');

      const badgeSeverityClass = isCrit ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30' :
                                 (isAten ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30' :
                                           'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30');

      html += `
        <div id="alert-card-${escapeAttr(alert.id)}" class="p-3.5 rounded-2xl border ${borderClass} shadow-xs hover:shadow-md transition-all space-y-2 group">
          <div class="flex items-start justify-between gap-2">
            <div class="flex items-center gap-1.5 flex-wrap min-w-0">
              <span class="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${badgeSeverityClass}">
                ${alert.statusLabel}
              </span>
              <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 truncate max-w-[170px]" title="${escapeAttr(alert.themeName)}">
                <span class="w-2 h-2 rounded-full shrink-0" style="background-color: ${alert.themeColor}"></span>
                <span class="truncate">${escapeHtml(alert.themeName)}</span>
              </span>
            </div>
            <span class="text-[10px] font-mono font-bold text-slate-400 shrink-0">${alert.targetDateFormatted}</span>
          </div>

          <div>
            <h5 class="text-xs font-bold text-slate-900 dark:text-white leading-tight truncate">
              ${escapeHtml(alert.featureTitle)}
            </h5>
            <p class="text-[11px] text-slate-600 dark:text-slate-300 mt-1 leading-snug">
              ${escapeHtml(alert.message)}
            </p>
          </div>

          <div class="pt-2 border-t border-slate-200/50 dark:border-slate-800/60 flex items-center justify-between gap-1">
            <button type="button" onclick="EventsEngine.locateAlertFeature('${escapeAttr(alert.id)}')" class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 active:scale-95 text-white font-bold text-[11px] shadow-xs transition-all cursor-pointer">
              <span class="material-symbols-outlined text-[14px]">my_location</span>
              <span>Localizar</span>
            </button>

            <div class="flex items-center gap-1">
              <button type="button" onclick="EventsEngine.acknowledgeAlert('${escapeAttr(alert.id)}')" class="p-1.5 rounded-lg text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors tooltip cursor-pointer" title="Dar Ciente (Remover Notificação)">
                <span class="material-symbols-outlined text-[16px]">done_all</span>
              </button>
              <button type="button" onclick="EventsEngine.snoozeAlertUi('${escapeAttr(alert.id)}', 7)" class="p-1.5 rounded-lg text-slate-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-colors tooltip cursor-pointer" title="Adiar por 7 dias">
                <span class="material-symbols-outlined text-[16px]">snooze</span>
              </button>
            </div>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
  }

  /**
   * Localiza a feição no mapa e abre seus detalhes.
   */
  function locateAlertFeature(alertId) {
    const alert = _activeAlertsCache.find(a => a.id === alertId);
    if (!alert) return;

    // Fecha o drawer de notificações para desobstruir a visão
    const drawer = document.getElementById('alerts-drawer');
    if (drawer) drawer.classList.add('hidden');

    // Garante que o menu lateral do mapa não bloqueie a visualização
    if (typeof window.closeSideDrawer === 'function') {
      window.closeSideDrawer();
    }

    // Aciona a função global existente jumpToFeature
    if (typeof window.jumpToFeature === 'function') {
      window.jumpToFeature(alert.featureId);
      return;
    }

    // Fallback: zoom direto se o Leaflet estiver acessível
    if (window.map && typeof window.map.flyTo === 'function' && alert.coords) {
      window.map.flyTo(alert.coords, 18, { duration: 1.2 });
    }
  }

  /**
   * Marca alerta como ciente pelo usuário atual.
   */
  function acknowledgeAlert(alertId) {
    const userProfile = window.currentUserProfile || null;
    markAlertDismissed(alertId, userProfile ? userProfile.id : null);

    const card = document.getElementById(`alert-card-${alertId}`);
    if (card) {
      card.style.transition = 'all 0.25s ease-out';
      card.style.opacity = '0';
      card.style.transform = 'scale(0.95)';
      setTimeout(() => {
        refreshAlerts();
      }, 250);
    } else {
      refreshAlerts();
    }
  }

  /**
   * Adia o alerta por X dias.
   */
  function snoozeAlertUi(alertId, days = 7) {
    const userProfile = window.currentUserProfile || null;
    snoozeAlert(alertId, days, userProfile ? userProfile.id : null);

    const card = document.getElementById(`alert-card-${alertId}`);
    if (card) {
      card.style.transition = 'all 0.25s ease-out';
      card.style.opacity = '0';
      card.style.transform = 'scale(0.95)';
      setTimeout(() => {
        refreshAlerts();
      }, 250);
    } else {
      refreshAlerts();
    }
  }

  /**
   * Renderiza os halos luminosos (Radar Glow) sobre as feições no Leaflet.
   */
  function updateMapHaloGlow() {
    if (typeof window === 'undefined' || !window.map || typeof window.map.addLayer !== 'function' || typeof L === 'undefined') return;

    if (!_haloLayerGroup) {
      _haloLayerGroup = L.layerGroup();
    }
    try {
      if (typeof window.map.hasLayer === 'function' && !window.map.hasLayer(_haloLayerGroup)) {
        _haloLayerGroup.addTo(window.map);
      }
    } catch(e) {}
    _haloLayerGroup.clearLayers();

    _activeAlertsCache.forEach(alert => {
      if (!alert.coords) return;
      const isCrit = alert.severity === 'critico';
      const haloClass = isCrit ? 'alert-halo-critico' : 'alert-halo-atencao';
      const dotColor = isCrit ? '#ef4444' : '#f59e0b';

      const icon = L.divIcon({
        className: 'alert-halo-marker-container',
        html: `
          <div style="position: relative; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; cursor: pointer;" onclick="EventsEngine.locateAlertFeature('${escapeAttr(alert.id)}')">
            <div class="${haloClass}"></div>
            <div class="alert-halo-center-dot" style="background: ${dotColor};"></div>
          </div>
        `,
        iconSize: [34, 34],
        iconAnchor: [17, 17]
      });

      const marker = L.marker(alert.coords, { icon: icon, zIndexOffset: 800 });
      marker.bindTooltip(`<b>${escapeHtml(alert.featureTitle)}</b><br><span style="color:${dotColor}">${escapeHtml(alert.statusLabel)}</span>`, {
        direction: 'top',
        offset: [0, -14],
        className: 'alert-leaflet-tooltip'
      });
      _haloLayerGroup.addLayer(marker);
    });
  }

  /**
   * Alterna o modo de visualização "Mostrar Apenas Alertas Ativos" no mapa.
   */
  function toggleAlertFilterMode() {
    _isAlertFilterModeActive = !_isAlertFilterModeActive;
    const filterBtn = document.getElementById('btn-filter-alerts');

    if (filterBtn) {
      if (_isAlertFilterModeActive) {
        filterBtn.classList.add('ring-2', 'ring-amber-500', 'bg-amber-500/20');
      } else {
        filterBtn.classList.remove('ring-2', 'ring-amber-500', 'bg-amber-500/20');
      }
    }

    // Aplica transparência às feições não envolvidas em alertas
    let styleTag = document.getElementById('alert-filter-mode-styles');
    if (!styleTag) {
      styleTag = document.createElement('style');
      styleTag.id = 'alert-filter-mode-styles';
      document.head.appendChild(styleTag);
    }

    if (_isAlertFilterModeActive) {
      // Coleta os IDs de feições com alertas
      const alertFids = new Set(_activeAlertsCache.map(a => String(a.featureId)));
      styleTag.innerHTML = `
        .theme-feature:not(.alert-halo-marker-container) { opacity: 0.15 !important; transition: opacity 0.3s; }
      `;
    } else {
      styleTag.innerHTML = '';
    }
  }

  /**
   * Toast / Banner Inteligente de Entrada: Exibe resumo ao abrir o sistema se houver alertas críticos.
   */
  function checkEntryBanner() {
    if (typeof document === 'undefined') return;
    const criticos = _activeAlertsCache.filter(a => a.severity === 'critico');
    if (criticos.length === 0) return;

    // Verifica se o usuário optou por não ver hoje
    const todayStr = new Date().toISOString().split('T')[0];
    const dismissedKey = `geogestor_banner_entry_dismissed_${todayStr}`;
    if (localStorage.getItem(dismissedKey)) return;

    let banner = document.getElementById('entry-alerts-toast');
    if (banner) return;

    banner = document.createElement('div');
    banner.id = 'entry-alerts-toast';
    banner.className = 'fixed bottom-5 right-5 z-[200] max-w-sm bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-rose-300 dark:border-rose-900/60 rounded-2xl p-4 shadow-2xl flex flex-col gap-2.5 animate-in slide-in-from-bottom duration-300';
    banner.innerHTML = `
      <div class="flex items-start gap-3">
        <div class="w-9 h-9 rounded-xl bg-rose-500/15 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0 border border-rose-500/20">
          <span class="material-symbols-outlined text-[20px]">warning</span>
        </div>
        <div class="flex-1 min-w-0">
          <h5 class="text-xs font-bold text-slate-900 dark:text-white leading-tight">Atenção Operacional</h5>
          <p class="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5 leading-snug">
            Existem <b>${criticos.length} evento(s) crítico(s) vencido(s)</b> aguardando manutenção ou renovação.
          </p>
        </div>
        <button type="button" onclick="document.getElementById('entry-alerts-toast').remove()" class="text-slate-400 hover:text-slate-600 p-1">
          <span class="material-symbols-outlined text-[16px]">close</span>
        </button>
      </div>
      <div class="flex items-center justify-end gap-2 pt-1 border-t border-slate-100 dark:border-slate-800 text-[11px]">
        <button type="button" onclick="localStorage.setItem('${dismissedKey}', '1'); document.getElementById('entry-alerts-toast').remove()" class="text-slate-400 hover:text-slate-600 px-2 py-1">
          Não lembrar hoje
        </button>
        <button type="button" onclick="EventsEngine.toggleAlertsDrawer(); document.getElementById('entry-alerts-toast').remove()" class="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold shadow-xs">
          Ver Alertas
        </button>
      </div>
    `;
    document.body.appendChild(banner);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function escapeAttr(str) {
    if (!str) return '';
    return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  // Listener global: fecha o drawer ao clicar fora
  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('click', function(e) {
      const drawer = document.getElementById('alerts-drawer');
      const btn = document.getElementById('btn-header-alerts');
      if (!drawer || drawer.classList.contains('hidden')) return;
      if (!drawer.contains(e.target) && (!btn || !btn.contains(e.target))) {
        drawer.classList.add('hidden');
      }
    });
  }

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    // Auto inicialização após o carregamento completo do mapa
    window.addEventListener('load', () => {
      setTimeout(refreshAlerts, 1500);
    });
  }

  // Exportação pública
  const EventsEngine = {
    parseDateSafe,
    addInterval,
    getPropValue,
    extractDateFieldsFromForm,
    extractAllFieldsFromForm,
    interpolateMessage,
    testFilterCondition,
    evaluateTrigger,
    isAlertForUser,
    markAlertDismissed,
    snoozeAlert,
    isAlertDismissed,
    isAlertSnoozed,
    clearDismissedAlerts,
    computeActiveAlerts,
    evaluateAlerts: computeActiveAlerts,
    markAsAcknowledged: markAlertDismissed,
    refreshAlerts,
    applyMapAlertHighlights: updateMapHaloGlow,
    toggleAlertsDrawer,
    filterAlertsTab,
    renderAlertsDrawer,
    locateAlertFeature,
    acknowledgeAlert,
    snoozeAlertUi,
    updateMapHaloGlow,
    toggleAlertFilterMode,
    checkEntryBanner
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = EventsEngine;
  }
  global.EventsEngine = EventsEngine;

})(typeof window !== 'undefined' ? window : global);
