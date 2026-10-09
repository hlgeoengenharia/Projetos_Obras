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
    markAsAcknowledged: markAlertDismissed
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = EventsEngine;
  }
  global.EventsEngine = EventsEngine;

})(typeof window !== 'undefined' ? window : global);
