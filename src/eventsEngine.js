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

    // Formato ISO YYYY-MM-DD ou YYYY-MM-DD HH:MM (trata em horário local para não recuar 1 dia no fuso brasileiro)
    const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
    if (isoMatch) {
      const ano = parseInt(isoMatch[1], 10);
      const mes = parseInt(isoMatch[2], 10) - 1;
      const dia = parseInt(isoMatch[3], 10);
      const h = isoMatch[4] ? parseInt(isoMatch[4], 10) : 0;
      const m = isoMatch[5] ? parseInt(isoMatch[5], 10) : 0;
      const sec = isoMatch[6] ? parseInt(isoMatch[6], 10) : 0;
      const d = new Date(ano, mes, dia, h, m, sec);
      return isNaN(d.getTime()) ? null : d;
    }

    const fallbackDate = new Date(s);
    return isNaN(fallbackDate.getTime()) ? null : fallbackDate;
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
   * Normaliza uma chave de propriedade ou rótulo de campo para comparação resiliente:
   * Remove tags de abas prefixadas (ex: "[Infraestrutura]"), acentuação e caracteres não alfanuméricos.
   */
  function normalizeKey(str) {
    if (!str) return '';
    return String(str)
      .replace(/^\[[^\]]+\]\s*/, '') // Remove prefixos como [Infraestrutura]
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove acentos (Ú -> U, Ç -> C, Ã -> A)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, ''); // Remove espaços, underscores, pontuação
  }

  /**
   * Extrai o valor de uma propriedade da feição de forma resiliente:
   * 1. Acesso direto por chave exata (p[fieldKey] ou p[fieldLabel])
   * 2. Cruzamento com schema do formulário (busca por label, name e id)
   * 3. Acesso case-insensitive
   * 4. Acesso normalizado (ignora acentos, espaços vs underscores, maiúsculas/minúsculas)
   */
  function getPropValue(feature, fieldKey, fieldLabel, form) {
    if (!feature || !feature.properties || (!fieldKey && !fieldLabel)) return null;
    const p = feature.properties;

    // 1. Acesso direto
    if (fieldKey && p[fieldKey] !== undefined && p[fieldKey] !== null) return p[fieldKey];
    if (fieldLabel && p[fieldLabel] !== undefined && p[fieldLabel] !== null) return p[fieldLabel];

    // 2. Coleta lista de chaves candidatas com variações fonéticas e sem preposições
    const candidates = new Set();
    const addCandidateVariants = (text) => {
      if (!text) return;
      candidates.add(String(text));
      const nK = normalizeKey(text);
      if (nK) {
        candidates.add(nK);
        // Variação sem preposições comuns (da, de, do, dos, das)
        const noPrep = nK.replace(/^(data)(da|de|do|dos|das)/, '$1').replace(/(da|de|do|dos|das)/g, '');
        if (noPrep) candidates.add(noPrep);
        // Variação tratando sanitização de 'ç'/'ção' como 's'/'so' vs 'c'/'cao'
        const cVariant = nK.replace(/enso\b/, 'encao').replace(/senso\b/, 'sencao');
        if (cVariant) {
          candidates.add(cVariant);
          candidates.add(cVariant.replace(/^(data)(da|de|do|dos|das)/, '$1').replace(/(da|de|do|dos|das)/g, ''));
        }
      }
    };

    if (fieldKey) addCandidateVariants(fieldKey);
    if (fieldLabel) addCandidateVariants(fieldLabel);

    // Se temos o form, busca os aliases definidos no formulário (label, name, id)
    if (form) {
      const tabs = form.tabs || form.schema || [];
      tabs.forEach(tab => {
        (tab.fields || []).forEach(f => {
          const matchId = fieldKey && (f.id === fieldKey || f.name === fieldKey);
          const matchLabel = fieldLabel && (f.label === fieldLabel || normalizeKey(f.label) === normalizeKey(fieldLabel));
          const matchNormKey = fieldKey && (normalizeKey(f.id) === normalizeKey(fieldKey) || normalizeKey(f.name) === normalizeKey(fieldKey));

          if (matchId || matchLabel || matchNormKey) {
            if (f.id) addCandidateVariants(f.id);
            if (f.name) addCandidateVariants(f.name);
            if (f.label) addCandidateVariants(f.label);
          }
        });
      });
    }

    // 3. Varre as propriedades existentes na feição
    const pKeys = Object.keys(p);

    // 3a. Match case-insensitive direto
    for (const k of pKeys) {
      const kLower = k.toLowerCase();
      for (const cand of candidates) {
        if (cand && cand.toLowerCase() === kLower) {
          if (p[k] !== undefined && p[k] !== null) return p[k];
        }
      }
    }

    // 3b. Match normalizado (sem acentos, sem underline, sem espaços)
    for (const k of pKeys) {
      const kNorm = normalizeKey(k);
      if (!kNorm) continue;
      for (const cand of candidates) {
        const candNorm = normalizeKey(cand);
        if (candNorm && kNorm === candNorm) {
          if (p[k] !== undefined && p[k] !== null) return p[k];
        }
      }
    }

    // 3c. Match por contenção se tamanho significativo (>= 6 caracteres)
    for (const k of pKeys) {
      const kNorm = normalizeKey(k);
      if (kNorm.length < 6) continue;
      for (const cand of candidates) {
        const candNorm = normalizeKey(cand);
        if (candNorm && candNorm.length >= 6 && (kNorm.includes(candNorm) || candNorm.includes(kNorm))) {
          if (p[k] !== undefined && p[k] !== null) return p[k];
        }
      }
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
   * Interpolação de variáveis da mensagem: @Nome, @Campos, cálculo dinâmico de tempo (dias/meses), etc.
   */
  function interpolateMessage(template, feature, trigger, ctx) {
    if (!template) return '';
    let msg = template;
    const props = (feature && feature.properties) || {};

    // 1. Cálculo inteligente de tempo (dias / meses)
    const diff = typeof ctx.daysDiff === 'number' ? ctx.daysDiff : 0;
    const absDiff = Math.abs(diff);

    let tempoTexto = '';
    if (diff < 0) {
      if (absDiff >= 60) {
        const meses = Math.floor(absDiff / 30);
        tempoTexto = meses > 1 ? `${meses} meses (${absDiff} dias)` : `${absDiff} dias`;
      } else {
        tempoTexto = `${absDiff} dias`;
      }
    } else if (diff === 0) {
      tempoTexto = 'hoje';
    } else {
      if (absDiff >= 60) {
        const meses = Math.floor(absDiff / 30);
        tempoTexto = meses > 1 ? `${meses} meses (${absDiff} dias)` : `${absDiff} dias`;
      } else {
        tempoTexto = `${absDiff} dias`;
      }
    }

    // 2. Substituição inteligente de expressões de tempo: "em x dias", "há x dias", "x dias", etc.
    msg = msg.replace(/\bem\s+[xX]\s+dias?\b/gi, diff === 0 ? 'hoje' : `em ${tempoTexto}`);
    msg = msg.replace(/\bhá\s+[xX]\s+dias?\b/gi, `há ${tempoTexto}`);
    msg = msg.replace(/\b[xX]\s+dias?\/meses\b/gi, tempoTexto);
    msg = msg.replace(/\b[xX]\s+meses\b/gi, tempoTexto);
    msg = msg.replace(/\b[xX]\s+dias?\b/gi, tempoTexto);
    msg = msg.replace(/@tempo\b/gi, tempoTexto);

    // 3. Substitui variáveis de contexto com @ e formato legado {tag}
    // @dias_prazo: número puro de dias do prazo de vencimento (faltando ou atrasado)
    msg = msg.replace(/\{dias_prazo\}|@dias_prazo|@Dias Prazo/gi, String(absDiff));
    // @dias_decorridos: número real de dias corridos entre as duas datas comparadas (ex: Hoje - Data da Última Manutenção)
    msg = msg.replace(/\{dias_decorridos\}|@dias_decorridos|@Dias Decorridos/gi, String(ctx.diasDecorridos !== undefined ? ctx.diasDecorridos : absDiff));
    // @dias_restantes e @dias mantidos para compatibilidade retroativa
    msg = msg.replace(/\{dias_restantes\}|@dias_restantes|@Dias Restantes|\{dias\}|@dias|@Dias/gi, String(absDiff));
    msg = msg.replace(/\{data_limite\}|@data_limite|@Data Limite/gi, ctx.targetDateStr || '');
    msg = msg.replace(/\{data_base\}|@data_base|@Data Base/gi, ctx.baseDateStr || '');
    msg = msg.replace(/\{nome_camada\}|@nome_camada|@Nome da Camada/gi, ctx.themeName || 'Camada');

    // 4. Substitui @Nome com fallback resiliente para título da feição
    const featTitle = ctx.featureTitle || getPropValue(feature, 'Nome') || getPropValue(feature, 'nome') || getPropValue(feature, 'logradouro') || '';
    if (featTitle) {
      msg = msg.replace(/@Nome\b|@nome\b|\{Nome\}|\{nome\}/g, String(featTitle));
    }

    // Auxiliar para formatar datas ISO (YYYY-MM-DD...) em DD/MM/YYYY
    const formatValue = (v) => {
      if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) {
        const parts = v.split('T')[0].split('-');
        if (parts.length === 3) {
          return `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
      }
      return String(v);
    };

    // 5. Substitui propriedades diretas da feição por @Campo ou {campo}
    Object.keys(props).forEach(k => {
      const v = props[k];
      if (v !== undefined && v !== null && (typeof v === 'string' || typeof v === 'number')) {
        const fVal = formatValue(v);
        const regexCurly = new RegExp(`\\{${k}\\}`, 'gi');
        const regexAt = new RegExp(`@${k}\\b`, 'gi');
        msg = msg.replace(regexCurly, fVal);
        msg = msg.replace(regexAt, fVal);
      }
    });

    // 6. Resolução resiliente de menções @campo restantes via getPropValue e cruzamento com formulário
    msg = msg.replace(/@([a-zA-Z0-9_\u00C0-\u017F]+)/g, (fullMatch, tag) => {
      const lower = tag.toLowerCase();
      if (['nome', 'dias', 'dias_restantes', 'dias_prazo', 'dias_decorridos', 'data_limite', 'data_base', 'nome_camada', 'tempo'].includes(lower)) {
        return fullMatch;
      }

      // Se a tag corresponder ao campo de data base do gatilho (ex: data_da__ltima_manutens_o)
      if (trigger && (trigger.campo_data === tag || normalizeKey(trigger.campo_data) === normalizeKey(tag))) {
        return ctx.baseDateStr || fullMatch;
      }

      const activeForm = ctx.form || (typeof window !== 'undefined' && window.forms && window.forms.find(f => f.id === (trigger && trigger.formId)));
      const propVal = getPropValue(feature, tag, tag, activeForm);
      if (propVal !== null && propVal !== undefined && propVal !== '') {
        return formatValue(propVal);
      }

      return fullMatch;
    });

    // 7. Resolução resiliente de {campo} restantes via getPropValue
    msg = msg.replace(/\{([a-zA-Z0-9_\u00C0-\u017F]+)\}/g, (fullMatch, tag) => {
      const lower = tag.toLowerCase();
      if (['nome', 'dias', 'dias_restantes', 'data_limite', 'data_base', 'nome_camada', 'tempo'].includes(lower)) {
        return fullMatch;
      }
      if (trigger && (trigger.campo_data === tag || normalizeKey(trigger.campo_data) === normalizeKey(tag))) {
        return ctx.baseDateStr || '';
      }
      const activeForm = ctx.form || (typeof window !== 'undefined' && window.forms && window.forms.find(f => f.id === (trigger && trigger.formId)));
      const propVal = getPropValue(feature, tag, tag, activeForm);
      if (propVal !== null && propVal !== undefined && propVal !== '') {
        return formatValue(propVal);
      }
      return '';
    });

    // Limpa chaves não substituídas
    msg = msg.replace(/\{[a-zA-Z0-9_]+\}/g, '');
    return msg.trim();
  }

  /**
   * Testa condição de filtro (se configurada no gatilho).
   */
  function testFilterCondition(trigger, feature, form) {
    if (!trigger.campo_filtro || trigger.filtro_valor === undefined || trigger.filtro_valor === null || trigger.filtro_valor === '') {
      return true; // Sem filtro adicional
    }
    const val = getPropValue(feature, trigger.campo_filtro, trigger.campo_filtro_label, form);
    const op = trigger.filtro_operador || '=';
    const target = String(trigger.filtro_valor).trim().toLowerCase();
    const current = String(val !== null && val !== undefined ? val : '').trim().toLowerCase();

    if (op === '=' || op === '==') return current === target || normalizeKey(current) === normalizeKey(target);
    if (op === '!=' || op === '<>') return current !== target && normalizeKey(current) !== normalizeKey(target);
    if (op === 'contem') return current.includes(target) || normalizeKey(current).includes(normalizeKey(target));
    if (op === 'nao_contem') return !current.includes(target) && !normalizeKey(current).includes(normalizeKey(target));
    if (op === '>') return parseFloat(current) > parseFloat(target);
    if (op === '<') return parseFloat(current) < parseFloat(target);
    if (op === '>=') return parseFloat(current) >= parseFloat(target);
    if (op === '<=') return parseFloat(current) <= parseFloat(target);
    return true;
  }

  /**
   * Calcula com máxima precisão o centróide das feições (Ponto, Linha e/ou Polígono).
   * Retorna [lat, lng] no padrão Leaflet.
   */
  function computeGeometryCentroid(geometry) {
    if (!geometry || !geometry.type || !geometry.coordinates) return null;
    const type = geometry.type;
    const coords = geometry.coordinates;

    if (type === 'Point' && Array.isArray(coords) && coords.length >= 2) {
      return [coords[1], coords[0]];
    }

    if (type === 'MultiPoint' && Array.isArray(coords) && coords.length > 0) {
      let lat = 0, lng = 0, count = 0;
      coords.forEach(p => {
        if (Array.isArray(p) && p.length >= 2) {
          lng += p[0];
          lat += p[1];
          count++;
        }
      });
      return count > 0 ? [lat / count, lng / count] : null;
    }

    function getLineCentroid(lineCoords) {
      if (!Array.isArray(lineCoords) || lineCoords.length < 2) {
        if (Array.isArray(lineCoords) && lineCoords[0]) return [lineCoords[0][1], lineCoords[0][0]];
        return null;
      }
      let totalLen = 0, sumLat = 0, sumLng = 0;
      for (let i = 0; i < lineCoords.length - 1; i++) {
        const p1 = lineCoords[i], p2 = lineCoords[i + 1];
        if (Array.isArray(p1) && Array.isArray(p2) && p1.length >= 2 && p2.length >= 2) {
          const dLng = p2[0] - p1[0], dLat = p2[1] - p1[1];
          const len = Math.hypot(dLng, dLat);
          if (len > 0) {
            totalLen += len;
            sumLat += ((p1[1] + p2[1]) / 2) * len;
            sumLng += ((p1[0] + p2[0]) / 2) * len;
          }
        }
      }
      if (totalLen > 0) return [sumLat / totalLen, sumLng / totalLen];
      const mid = lineCoords[Math.floor(lineCoords.length / 2)] || lineCoords[0];
      return mid ? [mid[1], mid[0]] : null;
    }

    if (type === 'LineString') {
      return getLineCentroid(coords);
    }

    if (type === 'MultiLineString' && Array.isArray(coords)) {
      let totalLen = 0, sumLat = 0, sumLng = 0;
      coords.forEach(line => {
        if (Array.isArray(line)) {
          for (let i = 0; i < line.length - 1; i++) {
            const p1 = line[i], p2 = line[i + 1];
            if (Array.isArray(p1) && Array.isArray(p2) && p1.length >= 2 && p2.length >= 2) {
              const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
              if (len > 0) {
                totalLen += len;
                sumLat += ((p1[1] + p2[1]) / 2) * len;
                sumLng += ((p1[0] + p2[0]) / 2) * len;
              }
            }
          }
        }
      });
      if (totalLen > 0) return [sumLat / totalLen, sumLng / totalLen];
      const firstLine = coords[0];
      return firstLine && firstLine[0] ? [firstLine[0][1], firstLine[0][0]] : null;
    }

    function getPolygonCentroid(polyCoords) {
      const ring = Array.isArray(polyCoords) ? polyCoords[0] : null;
      if (!Array.isArray(ring) || ring.length < 3) return null;
      let area = 0, cx = 0, cy = 0;
      for (let i = 0; i < ring.length - 1; i++) {
        const p1 = ring[i], p2 = ring[i + 1];
        if (Array.isArray(p1) && Array.isArray(p2) && p1.length >= 2 && p2.length >= 2) {
          const cross = (p1[0] * p2[1]) - (p2[0] * p1[1]);
          area += cross;
          cx += (p1[0] + p2[0]) * cross;
          cy += (p1[1] + p2[1]) * cross;
        }
      }
      area = area / 2;
      if (Math.abs(area) > 1e-12) {
        return [cy / (6 * area), cx / (6 * area)];
      }
      let sLat = 0, sLng = 0;
      ring.forEach(p => { if (Array.isArray(p)) { sLng += p[0]; sLat += p[1]; } });
      return [sLat / ring.length, sLng / ring.length];
    }

    if (type === 'Polygon') {
      return getPolygonCentroid(coords);
    }

    if (type === 'MultiPolygon' && Array.isArray(coords)) {
      let totalArea = 0, sumLat = 0, sumLng = 0;
      coords.forEach(poly => {
        const ring = Array.isArray(poly) ? poly[0] : null;
        if (!Array.isArray(ring) || ring.length < 3) return;
        let area = 0, cx = 0, cy = 0;
        for (let i = 0; i < ring.length - 1; i++) {
          const p1 = ring[i], p2 = ring[i + 1];
          if (Array.isArray(p1) && Array.isArray(p2) && p1.length >= 2 && p2.length >= 2) {
            const cross = (p1[0] * p2[1]) - (p2[0] * p1[1]);
            area += cross;
            cx += (p1[0] + p2[0]) * cross;
            cy += (p1[1] + p2[1]) * cross;
          }
        }
        area = Math.abs(area / 2);
        if (area > 1e-12) {
          totalArea += area;
          sumLat += (cy / (6 * (area > 0 ? area : 1))) * area;
          sumLng += (cx / (6 * (area > 0 ? area : 1))) * area;
        }
      });
      if (totalArea > 0) return [sumLat / totalArea, sumLng / totalArea];
      return getPolygonCentroid(coords[0]);
    }

    // Fallback genérico pelo Leaflet se disponível
    if (typeof L !== 'undefined' && typeof L.geoJSON === 'function') {
      try {
        const l = L.geoJSON(geometry);
        const b = l.getBounds();
        if (b && b.isValid && b.isValid()) {
          const c = b.getCenter();
          return [c.lat, c.lng];
        }
      } catch(e) {}
    }

    return null;
  }

  /**
   * Avalia um gatilho individual contra uma feição.
   * Retorna null se não houver alerta ativo, ou um objeto de Alerta estruturado.
   */
  function evaluateTrigger(trigger, feature, theme, todayDate, form) {
    if (!trigger || !feature) return null;
    if (trigger.ativo === false) return null;

    const featureId = (feature.properties && (feature.properties._tempId || feature.properties.id_banco || feature.properties.id)) || feature.id || `feat_${Math.random().toString(36).substr(2, 9)}`;

    const today = todayDate ? new Date(todayDate) : new Date();
    today.setHours(0, 0, 0, 0);

    // 1. Testa filtro condicional
    if (!testFilterCondition(trigger, feature, form)) {
      return null;
    }

    // 2. Extrai data base
    const rawBaseDate = getPropValue(feature, trigger.campo_data, trigger.campo_data_label, form);
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
        const propPrazo = getPropValue(feature, campoPrazoName, trigger.campo_prazo_label, form);
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

    // Cálculo preciso de dias decorridos entre duas datas (ou Hoje vs Data Base por padrão)
    let diasDecorridos = Math.round(Math.abs(today.getTime() - baseDate.getTime()) / (1000 * 60 * 60 * 24));
    if (trigger.calc_data_origem || trigger.calc_data_destino) {
      const origRef = trigger.calc_data_origem || 'hoje';
      const destRef = trigger.calc_data_destino || trigger.campo_data;

      const getDateRef = (ref) => {
        if (!ref || ref === 'hoje' || ref === 'today' || ref === 'data_atual') return today;
        const val = getPropValue(feature, ref, ref, form);
        return val ? parseDateSafe(val) : null;
      };

      const d1 = getDateRef(origRef);
      const d2 = getDateRef(destRef);
      if (d1 && d2) {
        diasDecorridos = Math.round(Math.abs(d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24));
      }
    }

    const ctx = {
      daysDiff,
      diasDecorridos,
      targetDateStr: dateFmt(targetDate),
      baseDateStr: dateFmt(baseDate),
      themeName: (theme && theme.name) || 'Camada',
      isOverdue,
      form: form
    };

    let titleFeature = (theme && theme.disp1 && getPropValue(feature, theme.disp1)) ||
                       getPropValue(feature, 'nome') ||
                       getPropValue(feature, 'Nome') ||
                       getPropValue(feature, 'logradouro') ||
                       getPropValue(feature, 'descricao') ||
                       `Feição #${featId.toString().slice(-6)}`;

    ctx.featureTitle = titleFeature;

    // Seleciona o template de mensagem configurado para a severidade atual
    const defaultEmDia = '@Nome está em conformidade com o cronograma regular.';
    const defaultAtencao = 'Atenção: @Nome entrará em período de vencimento em x dias.';
    const defaultCritico = '@Nome atingiu o prazo limite em x dias e requer manutenção/vistoria urgente.';

    // Identifica se a mensagem gravada é o antigo padrão genérico do sistema pré-existente
    // Ex: "A feição {nome} atingiu o prazo estabelecido em {data_limite}."
    const isLegacyDefaultTemplate = (str) => {
      if (!str) return true;
      const s = String(str).trim().toLowerCase();
      return (s.includes('atingiu o prazo') && (s.includes('{data_limite}') || s.includes('@data_limite') || s.includes('estabelecido em'))) ||
             (s.startsWith('a feição') && s.includes('atingiu o prazo'));
    };

    let templateMsg = '';
    if (severity === 'critico') {
      templateMsg = trigger.mensagem_critico || (!isLegacyDefaultTemplate(trigger.mensagem) ? trigger.mensagem : defaultCritico) || defaultCritico;
    } else if (severity === 'atencao') {
      templateMsg = trigger.mensagem_atencao || (!isLegacyDefaultTemplate(trigger.mensagem) && trigger.severidade === 'atencao' ? trigger.mensagem : defaultAtencao) || defaultAtencao;
    } else {
      templateMsg = trigger.mensagem_em_dia || (!isLegacyDefaultTemplate(trigger.mensagem) && trigger.severidade === 'info' ? trigger.mensagem : defaultEmDia) || defaultEmDia;
    }

    let message = interpolateMessage(templateMsg, feature, trigger, ctx);

    // Coordenadas exatas do centróide geométrico para o ponto pulsante e zoom
    let coords = null;
    if (feature.geometry) {
      coords = computeGeometryCentroid(feature.geometry);
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
      statusLabel: isOverdue 
        ? `Evento venceu há ${Math.abs(daysDiff)} ${Math.abs(daysDiff) === 1 ? 'dia' : 'dias'}`
        : (daysDiff === 0 ? 'Evento vence hoje' : `Evento vence em ${daysDiff} ${daysDiff === 1 ? 'dia' : 'dias'}`),
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

  function unmarkAlertDismissed(alertId, userId) {
    try {
      const uId = resolveActiveUserId(userId);
      const keyUser = `${STORAGE_DISMISSED_KEY}_${uId}`;
      const keyDefault = `${STORAGE_DISMISSED_KEY}_default`;
      const map = getDismissedMap(uId);
      delete map[alertId];
      localStorage.setItem(keyUser, JSON.stringify(map));
      localStorage.setItem(keyDefault, JSON.stringify(map));
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

  function unsnoozeAlert(alertId, userId) {
    try {
      const uId = resolveActiveUserId(userId);
      const keyUser = `${STORAGE_SNOOZED_KEY}_${uId}`;
      const map = getSnoozedMap(uId);
      delete map[alertId];
      localStorage.setItem(keyUser, JSON.stringify(map));
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
      const features = (theme && theme.features && theme.features.length) ? theme.features : ((theme && theme.geojson && Array.isArray(theme.geojson.features)) ? theme.geojson.features : []);
      if (!Array.isArray(features) || features.length === 0) return;

      // Localiza o formulário associado à camada
      let form = null;
      if (theme.formId) {
        form = formsList.find(f => String(f.id) === String(theme.formId));
      }
      if (!form && theme.form_id) {
        form = formsList.find(f => String(f.id) === String(theme.form_id));
      }
      if (!form && theme.cadastroType) {
        form = formsList.find(f => String(f.id) === String(theme.cadastroType));
      }
      if (!form && theme.cadastro_type) {
        form = formsList.find(f => String(f.id) === String(theme.cadastro_type));
      }
      if (!form && theme.name) {
        // Tenta achar pelo nome ou título com normalização
        const normTheme = normalizeKey(theme.name);
        form = formsList.find(f => {
          const fn = normalizeKey(f.name || f.title);
          return fn && normTheme && (fn === normTheme || fn.includes(normTheme) || normTheme.includes(fn));
        });
      }

      const triggers = (form && (form.eventTriggers || form.event_triggers)) ||
                       theme.eventTriggers ||
                       (theme.metadata && theme.metadata.eventTriggers) || [];
      if (!Array.isArray(triggers) || triggers.length === 0) return;

      // Avalia cada gatilho contra cada feição da camada
      triggers.forEach(trigger => {
        if (trigger.ativo === false) return;

        features.forEach(feature => {
          const alert = evaluateTrigger(trigger, feature, theme, today, form);
          if (alert) {
            // Verifica permissão do usuário
            if (!isAlertForUser(alert, currentUserProfile)) return;

            // Verifica se o usuário já deu ciente
            const isDismissed = isAlertDismissed(alert.id, userId);
            alert.isDismissed = Boolean(isDismissed);
            if (!options.includeDismissed && isDismissed) return;

            // Marca se o alerta está em adiamento no mapa (snoozed)
            const isSnoozed = isAlertSnoozed(alert.id, userId);
            alert.isSnoozed = isSnoozed;

            // Só descarta se options.includeSnoozed for explicitamente false
            if (options.includeSnoozed === false && isSnoozed) return;

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
  let _isEventsVisibleOnMap = false;
  let _haloLayerGroup = null;
  let _hasInjectedStyles = false;

  /**
   * Injeta os estilos de animação CSS de pulso (Radar Glow / Halo luminoso) no documento.
   */
  function injectRadarGlowStyles() {
    if (_hasInjectedStyles || typeof document === 'undefined' || typeof document.createElement !== 'function') return;
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
      @keyframes alert-radar-glow-info {
        0% { transform: scale(0.9); opacity: 0.85; box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
        70% { transform: scale(1.4); opacity: 0.15; box-shadow: 0 0 0 14px rgba(16, 185, 129, 0); }
        100% { transform: scale(1.6); opacity: 0; box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
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
      .alert-halo-info {
        width: 30px;
        height: 30px;
        border-radius: 50%;
        background: rgba(16, 185, 129, 0.45);
        border: 2px solid #10b981;
        animation: alert-radar-glow-info 2.5s infinite ease-out;
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

      /* Animações de pulso diretamente na geometria vetorial da feição */
      @keyframes alert-vector-pulse-critico {
        0% {
          stroke-opacity: 0.95;
          stroke-width: 6px;
          fill-opacity: 0.2;
          filter: drop-shadow(0 0 3px rgba(239, 68, 68, 0.85));
        }
        50% {
          stroke-opacity: 0.45;
          stroke-width: 10px;
          fill-opacity: 0.45;
          filter: drop-shadow(0 0 12px rgba(239, 68, 68, 1));
        }
        100% {
          stroke-opacity: 0.95;
          stroke-width: 6px;
          fill-opacity: 0.2;
          filter: drop-shadow(0 0 3px rgba(239, 68, 68, 0.85));
        }
      }
      @keyframes alert-vector-pulse-atencao {
        0% {
          stroke-opacity: 0.95;
          stroke-width: 5px;
          fill-opacity: 0.18;
          filter: drop-shadow(0 0 3px rgba(245, 158, 11, 0.85));
        }
        50% {
          stroke-opacity: 0.45;
          stroke-width: 9px;
          fill-opacity: 0.4;
          filter: drop-shadow(0 0 10px rgba(245, 158, 11, 1));
        }
        100% {
          stroke-opacity: 0.95;
          stroke-width: 5px;
          fill-opacity: 0.18;
          filter: drop-shadow(0 0 3px rgba(245, 158, 11, 0.85));
        }
      }
      @keyframes alert-vector-pulse-info {
        0% {
          stroke-opacity: 0.95;
          stroke-width: 5px;
          fill-opacity: 0.15;
          filter: drop-shadow(0 0 3px rgba(16, 185, 129, 0.85));
        }
        50% {
          stroke-opacity: 0.45;
          stroke-width: 8px;
          fill-opacity: 0.35;
          filter: drop-shadow(0 0 9px rgba(16, 185, 129, 1));
        }
        100% {
          stroke-opacity: 0.95;
          stroke-width: 5px;
          fill-opacity: 0.15;
          filter: drop-shadow(0 0 3px rgba(16, 185, 129, 0.85));
        }
      }
      .alert-feature-pulse-critico {
        stroke: #ef4444 !important;
        animation: alert-vector-pulse-critico 1.8s infinite ease-in-out !important;
        pointer-events: auto !important;
        cursor: pointer !important;
      }
      .alert-feature-pulse-atencao {
        stroke: #f59e0b !important;
        animation: alert-vector-pulse-atencao 2.2s infinite ease-in-out !important;
        pointer-events: auto !important;
        cursor: pointer !important;
      }
      .alert-feature-pulse-info {
        stroke: #10b981 !important;
        animation: alert-vector-pulse-info 2.5s infinite ease-in-out !important;
        pointer-events: auto !important;
        cursor: pointer !important;
      }

      /* Estilização dos Balões (Tooltips) de Alerta no Mapa */
      .alert-leaflet-tooltip {
        background: rgba(255, 255, 255, 0.98) !important;
        border: 1px solid rgba(226, 232, 240, 0.95) !important;
        border-radius: 14px !important;
        box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.1) !important;
        padding: 8px 12px !important;
        font-family: inherit !important;
        backdrop-filter: blur(8px) !important;
        white-space: normal !important;
        text-align: justify !important;
        text-justify: inter-word !important;
      }
      .alert-leaflet-tooltip::before {
        border-top-color: rgba(255, 255, 255, 0.98) !important;
      }
      .dark .alert-leaflet-tooltip {
        background: rgba(15, 23, 42, 0.96) !important;
        border-color: rgba(51, 65, 85, 0.85) !important;
        color: #f8fafc !important;
      }
      .dark .alert-leaflet-tooltip::before {
        border-top-color: rgba(15, 23, 42, 0.96) !important;
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
      includeDismissed: true, // Mantém alertas cientes no cache para a aba "Ciente"
      includeSnoozed: true // Central do Sino sempre mantém todos os eventos ativos, mesmo que adiados no mapa
    });

    updateAlertBadges();
    renderAlertsDrawer();
    updateMapHaloGlow();
    checkEntryBanner();

    return _activeAlertsCache;
  }

  /**
   * Atualiza os contadores no badge do sininho (topbar), na aba Ciente e no botão de filtro rápido do mapa.
   */
  function updateAlertBadges() {
    if (typeof document === 'undefined') return;

    const pendingAlerts = _activeAlertsCache.filter(a => !a.isDismissed);
    const cienteAlerts = _activeAlertsCache.filter(a => a.isDismissed);

    const total = pendingAlerts.length;
    const badge = document.getElementById('alerts-count-badge');
    const subtitle = document.getElementById('alerts-drawer-subtitle');
    const filterBtn = document.getElementById('btn-filter-alerts');
    const filterCount = document.getElementById('btn-filter-alerts-count');
    const cienteBadge = document.getElementById('alerts-tab-ciente-badge');

    if (badge) {
      if (total > 0) {
        badge.innerText = total > 99 ? '99+' : String(total);
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    }

    if (cienteBadge) {
      if (cienteAlerts.length > 0) {
        cienteBadge.innerText = String(cienteAlerts.length);
        cienteBadge.classList.remove('hidden');
      } else {
        cienteBadge.classList.add('hidden');
      }
    }

    if (subtitle) {
      const criticos = pendingAlerts.filter(a => a.severity === 'critico').length;
      if (total === 0) {
        subtitle.innerText = cienteAlerts.length > 0 ? `${cienteAlerts.length} evento(s) na aba Ciente` : 'Nenhum alerta pendente';
      } else {
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

  let _isDrawerDraggableInitialized = false;

  /**
   * Torna o card "Eventos & Prazos" arrastável na tela através do cabeçalho.
   */
  function initDraggableAlertsDrawer() {
    if (typeof document === 'undefined') return;
    const drawer = document.getElementById('alerts-drawer');
    const header = document.getElementById('alerts-drawer-header');
    if (!drawer || !header) return;
    if (_isDrawerDraggableInitialized) return;
    _isDrawerDraggableInitialized = true;

    if (typeof window !== 'undefined' && typeof window.makeElementDraggable === 'function') {
      window.makeElementDraggable(drawer, header);
      return;
    }

    // Fallback nativo caso makeElementDraggable ainda não tenha sido registrado
    if (typeof L !== 'undefined' && L.DomEvent) {
      L.DomEvent.disableClickPropagation(drawer);
      L.DomEvent.disableScrollPropagation(drawer);
    }

    header.style.cursor = 'grab';
    header.style.userSelect = 'none';

    let isDragging = false;
    let shiftX = 0;
    let shiftY = 0;

    const onPointerDown = (e) => {
      if (e.target.closest('button') || e.target.closest('input') || e.target.closest('select') || e.target.closest('a')) return;

      isDragging = true;
      header.style.cursor = 'grabbing';
      try { header.setPointerCapture(e.pointerId); } catch(err) {}

      const rect = drawer.getBoundingClientRect();
      shiftX = e.clientX - rect.left;
      shiftY = e.clientY - rect.top;

      drawer.style.transition = 'none';
      drawer.style.position = 'fixed';
      drawer.style.transform = 'none';
      drawer.style.margin = '0';
      drawer.style.right = 'auto';
      drawer.style.bottom = 'auto';
      drawer.style.left = rect.left + 'px';
      drawer.style.top = rect.top + 'px';

      document.body.style.userSelect = 'none';
      e.preventDefault();
      e.stopPropagation();
    };

    const onPointerMove = (e) => {
      if (!isDragging) return;
      e.preventDefault();
      e.stopPropagation();

      let newX = e.clientX - shiftX;
      let newY = e.clientY - shiftY;

      const maxX = window.innerWidth - drawer.offsetWidth - 10;
      const maxY = window.innerHeight - drawer.offsetHeight - 10;
      newX = Math.max(10, Math.min(newX, maxX));
      newY = Math.max(10, Math.min(newY, maxY));

      drawer.style.left = newX + 'px';
      drawer.style.top = newY + 'px';
    };

    const onPointerUp = (e) => {
      if (isDragging) {
        isDragging = false;
        header.style.cursor = 'grab';
        try { header.releasePointerCapture(e.pointerId); } catch(err) {}
        drawer.style.transition = '';
        document.body.style.userSelect = '';
      }
    };

    header.addEventListener('pointerdown', onPointerDown);
    header.addEventListener('pointermove', onPointerMove);
    header.addEventListener('pointerup', onPointerUp);
    header.addEventListener('pointercancel', onPointerUp);
  }

  /**
   * Abre/fecha o Drawer (dropdown) de Alertas do Topbar.
   */
  function toggleAlertsDrawer(e, forceOpen = null) {
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
    const drawer = document.getElementById('alerts-drawer');
    if (!drawer) return;

    initDraggableAlertsDrawer();

    const isHidden = drawer.classList.contains('hidden');
    const shouldOpen = (forceOpen !== null) ? Boolean(forceOpen) : isHidden;

    if (shouldOpen) {
      _isEventsVisibleOnMap = true;
      drawer.classList.remove('hidden');
      refreshAlerts();
      renderAlertsDrawer();
      updateMapHaloGlow();
    } else {
      _isEventsVisibleOnMap = false;
      drawer.classList.add('hidden');
      clearMapHaloGlow();
    }
  }

  /**
   * Fecha o card "Eventos & Prazos" e remove os eventos correspondentes do mapa.
   */
  function closeAlertsDrawer(e) {
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
    _isEventsVisibleOnMap = false;
    _isAlertFilterModeActive = false;
    const filterBtn = (typeof document !== 'undefined') ? document.getElementById('btn-filter-alerts') : null;
    if (filterBtn) {
      filterBtn.classList.remove('ring-2', 'ring-amber-500', 'bg-amber-500/20');
    }
    const drawer = (typeof document !== 'undefined') ? document.getElementById('alerts-drawer') : null;
    if (drawer) {
      drawer.classList.add('hidden');
    }
    clearMapHaloGlow();
  }

  /**
   * Limpa os eventos do mapa e fecha o card quando o usuário seleciona outra camada no menu lateral.
   */
  function clearEventsOnLayerSwitch() {
    _isEventsVisibleOnMap = false;
    _isAlertFilterModeActive = false;
    const filterBtn = (typeof document !== 'undefined') ? document.getElementById('btn-filter-alerts') : null;
    if (filterBtn) {
      filterBtn.classList.remove('ring-2', 'ring-amber-500', 'bg-amber-500/20');
    }
    const drawer = (typeof document !== 'undefined') ? document.getElementById('alerts-drawer') : null;
    if (drawer) {
      drawer.classList.add('hidden');
    }
    clearMapHaloGlow();
  }

  /**
   * Filtra os alertas exibidos no Drawer por aba de severidade ou aba Ciente.
   */
  function filterAlertsTab(tab) {
    _currentFilterTab = tab || 'all';

    const tabs = ['all', 'critico', 'atencao', 'info', 'ciente'];
    tabs.forEach(t => {
      const btn = document.getElementById(`alerts-tab-${t}`);
      if (!btn) return;
      if (t === _currentFilterTab) {
        if (t === 'ciente') {
          btn.className = 'px-2.5 py-1 rounded-lg bg-blue-600 text-white font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1';
        } else {
          btn.className = 'px-2.5 py-1 rounded-lg bg-amber-500 text-white font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1';
        }
      } else {
        if (t === 'all') {
          btn.className = 'px-2.5 py-1 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer';
        } else if (t === 'critico') {
          btn.className = 'px-2.5 py-1 rounded-lg text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer flex items-center gap-1';
        } else if (t === 'atencao') {
          btn.className = 'px-2.5 py-1 rounded-lg text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-colors cursor-pointer flex items-center gap-1';
        } else if (t === 'info') {
          btn.className = 'px-2.5 py-1 rounded-lg text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors cursor-pointer flex items-center gap-1';
        } else if (t === 'ciente') {
          btn.className = 'px-2.5 py-1 rounded-lg text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors cursor-pointer flex items-center gap-1';
        }
      }
    });

    renderAlertsDrawer();
  }

  /**
   * Renderiza a lista de cards de alertas dentro do Drawer.
   */
  function renderAlertsDrawer() {
    if (typeof document === 'undefined') return;
    const container = document.getElementById('alerts-list-container');
    if (!container) return;

    let items = [];
    if (_currentFilterTab === 'ciente') {
      items = _activeAlertsCache.filter(a => a.isDismissed);
    } else {
      const pendingAlerts = _activeAlertsCache.filter(a => !a.isDismissed);
      if (_currentFilterTab === 'all') {
        items = pendingAlerts;
      } else {
        items = pendingAlerts.filter(a => a.severity === _currentFilterTab);
      }
    }

    if (items.length === 0) {
      if (_currentFilterTab === 'ciente') {
        container.innerHTML = `
          <div class="py-10 text-center flex flex-col items-center justify-center text-slate-400">
            <div class="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-500 flex items-center justify-center mb-2.5 border border-blue-500/20">
              <span class="material-symbols-outlined text-[26px]">done_all</span>
            </div>
            <p class="font-bold text-xs text-slate-700 dark:text-slate-300">Nenhum evento na aba Ciente</p>
            <span class="text-[11px] text-slate-400 max-w-[260px] mt-0.5 leading-snug">
              Eventos que você der ciente ficam arquivados aqui para você consultar e, se desejar, trazer de volta para os alertas ativos.
            </span>
          </div>
        `;
      } else {
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
      }
      return;
    }

    let html = '';
    items.forEach(alert => {
      const isCrit = alert.severity === 'critico';
      const isAten = alert.severity === 'atencao';
      const isSnoozed = Boolean(alert.isSnoozed);
      const isDismissed = Boolean(alert.isDismissed);

      const borderClass = isDismissed ? 'border-blue-200 dark:border-blue-900/50 bg-blue-50/20 dark:bg-blue-950/20' :
                          (isCrit ? 'border-rose-300 dark:border-rose-900/60 bg-rose-50/30 dark:bg-rose-950/20' : 
                          (isAten ? 'border-amber-300 dark:border-amber-900/60 bg-amber-50/30 dark:bg-amber-950/20' : 
                                    'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'));

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
              ${isDismissed ? `
                <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9.5px] font-bold bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/30" title="Evento registrado como ciente">
                  <span class="material-symbols-outlined text-[12px]">done_all</span>
                  <span>Ciente</span>
                </span>
              ` : ''}
              ${(!isDismissed && isSnoozed) ? `
                <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9.5px] font-bold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30" title="Alerta mantido no sino, porém com destaque oculto no mapa temporariamente">
                  <span class="material-symbols-outlined text-[12px]">visibility_off</span>
                  <span>Oculto no mapa</span>
                </span>
              ` : ''}
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
            <p class="text-[11px] text-slate-600 dark:text-slate-300 mt-1 leading-snug text-justify" style="text-align: justify; text-justify: inter-word;">
              ${escapeHtml(alert.message)}
            </p>
          </div>

          <div class="pt-2 border-t border-slate-200/50 dark:border-slate-800/60 flex items-center justify-between gap-1">
            <button type="button" onclick="EventsEngine.locateAlertFeature('${escapeAttr(alert.id)}')" class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 active:scale-95 text-white font-bold text-[11px] shadow-xs transition-all cursor-pointer">
              <span class="material-symbols-outlined text-[14px]">my_location</span>
              <span>Localizar</span>
            </button>

            <div class="flex items-center gap-1">
              ${isDismissed ? `
                <button type="button" onclick="EventsEngine.unacknowledgeAlert('${escapeAttr(alert.id)}')" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-amber-500 hover:text-white dark:hover:bg-amber-500 text-slate-700 dark:text-slate-200 font-bold text-[11px] shadow-xs transition-all cursor-pointer" title="Trazer este evento de volta para a lista de alertas ativos">
                  <span class="material-symbols-outlined text-[15px]">undo</span>
                  <span>Trazer de volta</span>
                </button>
              ` : `
                <button type="button" onclick="EventsEngine.acknowledgeAlert('${escapeAttr(alert.id)}')" class="p-1.5 rounded-lg text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors tooltip cursor-pointer" title="Dar Ciente (Mover para a aba Ciente)">
                  <span class="material-symbols-outlined text-[16px]">done_all</span>
                </button>
                ${isSnoozed ? `
                  <button type="button" onclick="EventsEngine.unsnoozeAlertUi('${escapeAttr(alert.id)}')" class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 text-[11px] font-bold transition-colors cursor-pointer" title="Reativar exibição do destaque no mapa">
                    <span class="material-symbols-outlined text-[15px]">visibility</span>
                    <span>Reativar no mapa</span>
                  </button>
                ` : `
                  <button type="button" onclick="EventsEngine.snoozeAlertUi('${escapeAttr(alert.id)}', 7)" class="p-1.5 rounded-lg text-slate-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-colors tooltip cursor-pointer" title="Adiar por 7 dias (oculta apenas o destaque visual no mapa)">
                    <span class="material-symbols-outlined text-[16px]">snooze</span>
                  </button>
                `}
              `}
            </div>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
  }

  /**
   * Localiza a feição no mapa e mantém o card Eventos & Prazos aberto com ponto pulsante no centróide.
   */
  function locateAlertFeature(alertId) {
    const alert = _activeAlertsCache.find(a => a.id === alertId);
    if (!alert) return;

    // Mantém a visualização dos eventos expressamente ativa no mapa
    _isEventsVisibleOnMap = true;
    const drawer = (typeof document !== 'undefined') ? document.getElementById('alerts-drawer') : null;
    if (drawer) {
      drawer.classList.remove('hidden');
    }

    // Fecha o menu lateral de camadas caso esteja aberto e obstruindo
    if (typeof window.closeSideDrawer === 'function') {
      window.closeSideDrawer();
    }

    // Calcula o centróide exato se necessário
    const centroidCoords = alert.coords || (alert.feature && alert.feature.geometry ? computeGeometryCentroid(alert.feature.geometry) : null);

    // Voa suavemente para os limites ou para o centróide da feição
    if (window.map) {
      if (alert.feature && alert.feature.geometry && typeof L !== 'undefined' && typeof L.geoJSON === 'function') {
        try {
          const tempLayer = L.geoJSON(alert.feature);
          const bounds = tempLayer.getBounds();
          if (bounds && bounds.isValid && bounds.isValid()) {
            window.map.flyToBounds(bounds, { maxZoom: 18, duration: 1.2, padding: [60, 60] });
          } else if (centroidCoords) {
            window.map.flyTo(centroidCoords, 18, { duration: 1.2 });
          }
        } catch(e) {
          if (centroidCoords) window.map.flyTo(centroidCoords, 18, { duration: 1.2 });
        }
      } else if (centroidCoords) {
        window.map.flyTo(centroidCoords, 18, { duration: 1.2 });
      }
    }

    // Garante que os pontos pulsantes continuem ativos no mapa
    updateMapHaloGlow();
  }

  /**
   * Marca alerta como ciente pelo usuário atual (move para a aba Ciente).
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
   * Remove a marcação de ciente e traz o evento de volta para a lista de alertas ativos.
   */
  function unacknowledgeAlert(alertId) {
    const userProfile = window.currentUserProfile || null;
    unmarkAlertDismissed(alertId, userProfile ? userProfile.id : null);

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

  function unacknowledgeAlertUi(alertId) {
    unacknowledgeAlert(alertId);
  }

  /**
   * Adia o destaque visual do alerta no mapa por X dias (mantém na Central do Sino).
   */
  function snoozeAlertUi(alertId, days = 7) {
    const userProfile = window.currentUserProfile || null;
    snoozeAlert(alertId, days, userProfile ? userProfile.id : null);
    refreshAlerts();
  }

  /**
   * Reativa a exibição do destaque visual do alerta no mapa.
   */
  function unsnoozeAlertUi(alertId) {
    const userProfile = window.currentUserProfile || null;
    unsnoozeAlert(alertId, userProfile ? userProfile.id : null);
    refreshAlerts();
  }

  /**
   * Limpa e fecha todos os eventos destacados no mapa.
   */
  function clearMapHaloGlow() {
    if (_haloLayerGroup) {
      _haloLayerGroup.clearLayers();
    }
    if (typeof window !== 'undefined' && window.map && typeof window.map.closeTooltip === 'function') {
      try { window.map.closeTooltip(); } catch(e) {}
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
    // REGRA ABSOLUTA DE CONTROLE DE VISIBILIDADE:
    // Os eventos SÓ aparecem no mapa se o card "Eventos & Prazos" estiver expressamente aberto pelo usuário!
    // Se o drawer estiver com a classe 'hidden' OU se _isEventsVisibleOnMap for falso:
    // NENHUM evento deve ser renderizado no mapa em hipótese alguma (mantém o mapa 100% limpo).
    const drawer = (typeof document !== 'undefined') ? document.getElementById('alerts-drawer') : null;
    const isDrawerOpen = drawer ? !drawer.classList.contains('hidden') : false;

    if (!_isEventsVisibleOnMap || !isDrawerOpen) {
      _isEventsVisibleOnMap = false;
      clearMapHaloGlow();
      return;
    }

    _haloLayerGroup.clearLayers();

    // Se houver uma camada ativa selecionada no menu lateral (activeSelectionThemeId),
    // apenas os eventos pertencentes à camada ativa são desenhados no mapa para não poluir
    // com feições de outras camadas quando o usuário estiver em uma camada específica (ex: Obras).
    const activeThemeId = (typeof window !== 'undefined' && window.activeSelectionThemeId)
      ? String(window.activeSelectionThemeId).trim().toLowerCase()
      : null;

    _activeAlertsCache.forEach(alert => {
      // Quando marcado como ciente ou adiado pelo usuário, oculta os efeitos visuais no mapa (continua no sino)
      if (alert.isDismissed) return;
      if (alert.isSnoozed) return;
      if (!alert.coords && (!alert.feature || !alert.feature.geometry)) return;

      // Se uma camada estiver selecionada no menu lateral, exibe apenas os alertas dessa camada
      if (activeThemeId && alert.themeId) {
        if (String(alert.themeId).trim().toLowerCase() !== activeThemeId) {
          return;
        }
      }

      const isCrit = alert.severity === 'critico';
      const isAten = alert.severity === 'atencao';
      const haloClass = isCrit ? 'alert-halo-critico' : (isAten ? 'alert-halo-atencao' : 'alert-halo-info');
      const pulseClass = isCrit ? 'alert-feature-pulse-critico' : (isAten ? 'alert-feature-pulse-atencao' : 'alert-feature-pulse-info');
      const strokeColor = isCrit ? '#ef4444' : (isAten ? '#f59e0b' : '#10b981');
      const dotColor = strokeColor;
      const isDark = typeof document !== 'undefined' && document.documentElement && document.documentElement.classList.contains('dark');
      const titleColor = isDark ? '#f8fafc' : '#0f172a';
      const msgColor = isDark ? '#cbd5e1' : '#475569';
      const borderDivColor = isDark ? 'rgba(51, 65, 85, 0.7)' : 'rgba(226, 232, 240, 0.9)';

      const tooltipHtml = `
        <div style="font-family: inherit; min-width: 190px; max-width: 290px; padding: 2px;">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 3px;">
            <span style="font-weight: 800; font-size: 10.5px; text-transform: uppercase; color: ${dotColor}; letter-spacing: 0.5px;">${escapeHtml(alert.statusLabel)}</span>
            <span style="font-size: 10px; font-weight: 700; opacity: 0.7; font-family: monospace;">${escapeHtml(alert.targetDateFormatted)}</span>
          </div>
          <div style="font-weight: 700; font-size: 12px; color: ${titleColor}; margin-bottom: 4px; line-height: 1.25;">
            ${escapeHtml(alert.featureTitle)}
          </div>
          ${alert.message ? `
            <div style="font-size: 11px; color: ${msgColor}; line-height: 1.35; padding-top: 4px; border-top: 1px solid ${borderDivColor}; text-align: justify; text-justify: inter-word;">
              ${escapeHtml(alert.message)}
            </div>
          ` : ''}
        </div>
      `;

      // 1. Renderiza o contorno / traçado da própria feição pulsando com a cor do sistema
      if (alert.feature && alert.feature.geometry && typeof L.geoJSON === 'function') {
        try {
          const geomType = String(alert.feature.geometry.type || '').toLowerCase();
          const isPolygon = geomType.includes('polygon');
          const isLine = geomType.includes('line');

          // Desenha a geometria para linhas e polígonos
          if (isLine || isPolygon) {
            const vectorLayer = L.geoJSON(alert.feature, {
              style: function() {
                return {
                  color: strokeColor,
                  weight: isPolygon ? 5 : 7,
                  opacity: 0.95,
                  fillColor: strokeColor,
                  fillOpacity: isPolygon ? 0.25 : 0,
                  className: pulseClass,
                  lineCap: 'round',
                  lineJoin: 'round',
                  interactive: true
                };
              }
            });

            vectorLayer.on('click', () => {
              EventsEngine.locateAlertFeature(alert.id);
            });

            vectorLayer.bindTooltip(tooltipHtml, {
              direction: 'top',
              offset: [0, -10],
              className: 'alert-leaflet-tooltip'
            });

            _haloLayerGroup.addLayer(vectorLayer);
          }
        } catch(errGeo) {
          console.warn('[EventsEngine] Falha ao renderizar vetor pulsante da feição:', errGeo);
        }
      }

      // 2. Renderiza também o ponto / radar pulsante central no CENTRÓIDE exato da feição (Ponto, Linha e/ou Polígono)
      const centroidCoords = alert.coords || (alert.feature && alert.feature.geometry ? computeGeometryCentroid(alert.feature.geometry) : null);
      if (centroidCoords) {
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

        const marker = L.marker(centroidCoords, { icon: icon, zIndexOffset: 850 });
        marker.bindTooltip(tooltipHtml, {
          direction: 'top',
          offset: [0, -14],
          className: 'alert-leaflet-tooltip'
        });
        _haloLayerGroup.addLayer(marker);
      }
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
      // Coleta os IDs de feições com alertas pendentes
      const alertFids = new Set(_activeAlertsCache.filter(a => !a.isDismissed).map(a => String(a.featureId)));
      styleTag.innerHTML = `
        .theme-feature:not(.alert-halo-marker-container) { opacity: 0.15 !important; transition: opacity 0.3s; }
      `;
    } else {
      styleTag.innerHTML = '';
    }
  }

  /**
   * Toast / Banner Inteligente de Entrada: Exibe resumo ao abrir o sistema se houver alertas críticos.
   * Fechar este card não afeta o drawer de eventos.
   */
  function checkEntryBanner() {
    if (typeof document === 'undefined' || typeof document.createElement !== 'function') return;
    const criticos = _activeAlertsCache.filter(a => !a.isDismissed && a.severity === 'critico');
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
    banner.addEventListener('click', (e) => e.stopPropagation());

    banner.innerHTML = `
      <div class="flex items-start gap-3">
        <div class="w-9 h-9 rounded-xl bg-rose-500/15 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0 border border-rose-500/20">
          <span class="material-symbols-outlined text-[20px]">warning</span>
        </div>
        <div class="flex-1 min-w-0">
          <h5 class="text-xs font-bold text-slate-900 dark:text-white leading-tight">Atenção Operacional</h5>
          <p class="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5 leading-snug text-justify" style="text-align: justify; text-justify: inter-word;">
            Existem <b>${criticos.length} evento(s) crítico(s) vencido(s)</b> aguardando manutenção ou renovação.
          </p>
        </div>
        <button type="button" onclick="event.stopPropagation(); document.getElementById('entry-alerts-toast')?.remove();" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer transition-colors" title="Fechar apenas este aviso">
          <span class="material-symbols-outlined text-[16px]">close</span>
        </button>
      </div>
      <div class="flex items-center justify-end gap-2 pt-1 border-t border-slate-100 dark:border-slate-800 text-[11px]">
        <button type="button" onclick="event.stopPropagation(); localStorage.setItem('${dismissedKey}', '1'); document.getElementById('entry-alerts-toast')?.remove();" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 px-2 py-1 cursor-pointer transition-colors">
          Não lembrar hoje
        </button>
        <button type="button" onclick="event.stopPropagation(); document.getElementById('entry-alerts-toast')?.remove(); EventsEngine.toggleAlertsDrawer(event, true);" class="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold shadow-xs cursor-pointer transition-colors">
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

  // NOTA: O card 'Eventos & Prazos' e os eventos no mapa permanecem visíveis durante
  // navegação/pan/zoom e cliques no mapa. Só fecham expressamente no 'x' do card ou ao trocar de camada.

  let _lastCheckedThemeFeaturesCount = -1;

  /**
   * Checagem automática periódica e imediata: atualiza o badge do sininho
   * assim que a página é acessada e conforme feições forem carregadas no mapa.
   */
  function runAutoAlertsCheck() {
    if (typeof window === 'undefined' || typeof document === 'undefined' || typeof document.createElement !== 'function') return;
    const themesList = window.themes || [];
    let currentTotalFeatures = 0;
    for (let i = 0; i < themesList.length; i++) {
      if (themesList[i].features && Array.isArray(themesList[i].features)) {
        currentTotalFeatures += themesList[i].features.length;
      }
    }

    if (currentTotalFeatures !== _lastCheckedThemeFeaturesCount || _activeAlertsCache.length === 0) {
      _lastCheckedThemeFeaturesCount = currentTotalFeatures;
      refreshAlerts();
    }
  }

  if (typeof window !== 'undefined' && typeof document !== 'undefined' && typeof document.createElement === 'function') {
    // Escalonamento inteligente para exibir o total no sino logo no primeiro instante
    [150, 600, 1500, 3000, 5500].forEach(delay => {
      const timer = setTimeout(runAutoAlertsCheck, delay);
      if (timer && typeof timer.unref === 'function') timer.unref();
    });

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', runAutoAlertsCheck);
    }
    if (typeof window.addEventListener === 'function') {
      window.addEventListener('load', runAutoAlertsCheck);
    }

    // Monitor suave durante os primeiros 20 segundos após carga
    let _pollTicks = 0;
    const _initialPolling = setInterval(() => {
      _pollTicks++;
      runAutoAlertsCheck();
      if (_pollTicks >= 10) {
        clearInterval(_initialPolling);
      }
    }, 2000);
    if (_initialPolling && typeof _initialPolling.unref === 'function') {
      _initialPolling.unref();
    }
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
    unmarkAlertDismissed,
    snoozeAlert,
    unsnoozeAlert,
    isAlertDismissed,
    isAlertSnoozed,
    clearDismissedAlerts,
    computeActiveAlerts,
    evaluateAlerts: computeActiveAlerts,
    markAsAcknowledged: markAlertDismissed,
    refreshAlerts,
    applyMapAlertHighlights: updateMapHaloGlow,
    initDraggableAlertsDrawer,
    toggleAlertsDrawer,
    closeAlertsDrawer,
    clearEventsOnLayerSwitch,
    computeGeometryCentroid,
    clearMapHaloGlow,
    filterAlertsTab,
    renderAlertsDrawer,
    locateAlertFeature,
    acknowledgeAlert,
    unacknowledgeAlert,
    unacknowledgeAlertUi,
    snoozeAlertUi,
    unsnoozeAlertUi,
    updateMapHaloGlow,
    toggleAlertFilterMode,
    checkEntryBanner
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = EventsEngine;
  }
  global.EventsEngine = EventsEngine;

})(typeof window !== 'undefined' ? window : global);
