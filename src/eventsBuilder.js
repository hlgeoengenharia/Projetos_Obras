/**
 * eventsBuilder.js - Construtor Visual de Regras de Monitoramento de Eventos e Prazos
 * Integrado à 5ª aba do Editor de Formulários de Camadas (settings.html).
 */

(function(global) {
  'use strict';

  let currentEditingTriggerId = null;
  let cachedProfilesList = [];

  /**
   * Extrai todos os campos do tipo data/datetime das abas ativas do construtor.
   */
  function getDateFieldsFromBuilder() {
    const tabs = global.builderTabs || [];
    const dateFields = [];
    tabs.forEach(tab => {
      (tab.fields || []).forEach(f => {
        const type = (f.type || '').toLowerCase();
        const label = f.label || f.name || f.id;
        if (type === 'date' || type === 'datetime' || type === 'datetime-local' || /data|prazo|vencimento/i.test(label)) {
          dateFields.push({
            id: f.name || f.id,
            rawId: f.id,
            name: f.name || f.id,
            label: label,
            tabTitle: tab.title || 'Aba'
          });
        }
      });
    });
    return dateFields;
  }

  /**
   * Extrai todos os campos das abas ativas do construtor (para filtros e tags).
   */
  function getAllFieldsFromBuilder() {
    const tabs = global.builderTabs || [];
    const all = [];
    tabs.forEach(tab => {
      (tab.fields || []).forEach(f => {
        all.push({
          id: f.name || f.id,
          rawId: f.id,
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
   * Carrega perfis do município para seleção de responsável.
   */
  async function loadProfilesForTriggers() {
    if (cachedProfilesList.length > 0) return cachedProfilesList;
    try {
      const client = global.supabaseClient;
      if (client) {
        const { data, error } = await client
          .from('profiles')
          .select('id, full_name, email, role, setor, departamento')
          .order('full_name');
        if (!error && Array.isArray(data)) {
          cachedProfilesList = data;
          return cachedProfilesList;
        }
      }
    } catch (e) {
      console.warn('Não foi possível carregar perfis via Supabase, usando fallback local:', e);
    }
    // Fallback gracioso
    return cachedProfilesList;
  }

  /**
   * Renderiza a lista de gatilhos configurados no container do módulo.
   */
  function renderEventTriggersBuilder() {
    const container = document.getElementById('events-triggers-list');
    if (!container) return;

    if (!Array.isArray(global._currentFormEventTriggers)) {
      global._currentFormEventTriggers = [];
    }
    const triggers = global._currentFormEventTriggers;

    if (triggers.length === 0) {
      container.innerHTML = `
        <div class="flex flex-col items-center justify-center py-12 px-4 text-center border-2 border-dashed border-slate-300 dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-slate-900/30">
          <div class="w-16 h-16 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center mb-4 border border-amber-500/20 shadow-inner">
            <span class="material-symbols-outlined text-[32px]">event_repeat</span>
          </div>
          <h4 class="text-base sm:text-lg font-bold text-slate-800 dark:text-slate-200 mb-1">Nenhum evento ou alerta configurado</h4>
          <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-md mb-6 leading-relaxed">
            Adicione gatilhos temporais para acompanhar prazos de manutenção, alvarás que vão expirar e certidões emitidas nesta camada cadastral.
          </p>
          <button type="button" onclick="EventsBuilder.openTriggerModal()" class="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-700 active:scale-[0.98] text-white rounded-xl font-bold text-xs sm:text-sm shadow-md transition-all cursor-pointer">
            <span class="material-symbols-outlined text-[19px]">add_alert</span>
            <span>Adicionar Primeiro Gatilho</span>
          </button>
        </div>
      `;
      return;
    }

    const sevStyles = {
      critico: {
        badge: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30',
        dot: 'bg-rose-500',
        label: 'Crítico / Urgente'
      },
      atencao: {
        badge: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30',
        dot: 'bg-amber-500',
        label: 'Atenção / Preventivo'
      },
      info: {
        badge: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30',
        dot: 'bg-emerald-500',
        label: 'Informativo'
      }
    };

    const typeLabels = {
      periodicidade: 'Recorrência / Periodicidade',
      validade: 'Vencimento Direto',
      calculado: 'Validade Calculada'
    };

    let html = '';
    triggers.forEach((trig, idx) => {
      const sev = sevStyles[trig.severidade] || sevStyles.atencao;
      const typeLabel = typeLabels[trig.tipo] || 'Temporal';
      const isAtivo = trig.ativo !== false;

      let resumoRegra = '';
      if (trig.tipo === 'periodicidade') {
        resumoRegra = `Campo <b>${escapeHtml(trig.campo_data_label || trig.campo_data)}</b> + a cada <b>${trig.intervalo_valor} ${trig.intervalo_unidade || 'meses'}</b> (Aviso prévio: <b>${trig.aviso_previo_dias || 15} dias</b>)`;
      } else if (trig.tipo === 'validade') {
        resumoRegra = `Vencimento por <b>${escapeHtml(trig.campo_data_label || trig.campo_data)}</b> com aviso de <b>${trig.aviso_previo_dias || 15} dias</b> antes`;
      } else if (trig.tipo === 'calculado') {
        resumoRegra = `Data de <b>${escapeHtml(trig.campo_data_label || trig.campo_data)}</b> + Prazo de <b>${trig.intervalo_valor} ${trig.intervalo_unidade || 'dias'}</b>`;
      }

      let filtroChip = '';
      if (trig.campo_filtro && trig.filtro_valor) {
        filtroChip = `
          <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            <span class="material-symbols-outlined text-[13px] text-slate-400">filter_alt</span>
            ${escapeHtml(trig.campo_filtro)} ${trig.filtro_operador || '='} "${escapeHtml(trig.filtro_valor)}"
          </span>
        `;
      }

      let respChip = '';
      if (trig.responsavel_tipo === 'usuario') {
        respChip = `
          <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[11px] font-semibold bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
            <span class="material-symbols-outlined text-[13px]">person</span>
            ${escapeHtml(trig.responsavel_nome || 'Usuário')}
          </span>
        `;
      } else if (trig.responsavel_tipo === 'setor') {
        respChip = `
          <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[11px] font-semibold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
            <span class="material-symbols-outlined text-[13px]">domain</span>
            Setor: ${escapeHtml(trig.responsavel_nome || 'Setor')}
          </span>
        `;
      } else if (trig.responsavel_tipo === 'criador') {
        respChip = `
          <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[11px] font-semibold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
            <span class="material-symbols-outlined text-[13px]">badge</span>
            Criador do Registro
          </span>
        `;
      } else {
        respChip = `
          <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
            <span class="material-symbols-outlined text-[13px]">group</span>
            Geral (Todos os Operadores)
          </span>
        `;
      }

      html += `
        <div class="relative bg-white dark:bg-slate-900 border ${isAtivo ? 'border-slate-200 dark:border-slate-800' : 'border-slate-200/50 dark:border-slate-800/40 opacity-60'} rounded-2xl p-4 sm:p-5 shadow-sm hover:shadow-md transition-all group">
          <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-3">
            <div class="flex items-center gap-2.5 min-w-0">
              <span class="w-3 h-3 rounded-full ${sev.dot} shadow-sm shrink-0"></span>
              <h4 class="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
                ${escapeHtml(trig.nome || `Gatilho #${idx + 1}`)}
              </h4>
              <span class="px-2 py-0.5 rounded-md text-[10px] font-extrabold tracking-wide uppercase ${sev.badge} shrink-0">
                ${sev.label}
              </span>
              <span class="hidden md:inline-block px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 shrink-0">
                ${typeLabel}
              </span>
            </div>

            <div class="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
              <!-- Switch Ativo/Inativo -->
              <button type="button" onclick="EventsBuilder.toggleTriggerStatus('${trig.id}')" class="px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${isAtivo ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20' : 'bg-slate-200 dark:bg-slate-800 text-slate-500 hover:bg-slate-300'}" title="${isAtivo ? 'Gatilho Ativo' : 'Gatilho Desativado'}">
                <span class="material-symbols-outlined text-[16px]">${isAtivo ? 'toggle_on' : 'toggle_off'}</span>
                <span>${isAtivo ? 'Ativo' : 'Pausado'}</span>
              </button>

              <!-- Botão Editar -->
              <button type="button" onclick="EventsBuilder.openTriggerModal('${trig.id}')" class="p-1.5 rounded-lg text-slate-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40 dark:hover:text-amber-400 transition-colors cursor-pointer" title="Editar Regra">
                <span class="material-symbols-outlined text-[18px]">edit</span>
              </button>

              <!-- Botão Excluir -->
              <button type="button" onclick="EventsBuilder.deleteTriggerConfig('${trig.id}')" class="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 dark:hover:text-rose-400 transition-colors cursor-pointer" title="Excluir Regra">
                <span class="material-symbols-outlined text-[18px]">delete</span>
              </button>
            </div>
          </div>

          <!-- Resumo da Regra -->
          <div class="text-xs text-slate-600 dark:text-slate-300 mb-3 leading-relaxed flex items-center gap-2">
            <span class="material-symbols-outlined text-[16px] text-amber-500 shrink-0">schedule</span>
            <span>${resumoRegra}</span>
          </div>

          <!-- Badges de Destinatário e Filtro -->
          <div class="flex flex-wrap items-center gap-2 mb-3">
            ${respChip}
            ${filtroChip}
          </div>

          <!-- Template da Mensagem -->
          <div class="bg-slate-50 dark:bg-slate-950/50 border border-slate-200/80 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-600 dark:text-slate-300 italic flex items-start gap-2">
            <span class="material-symbols-outlined text-[16px] text-slate-400 not-italic shrink-0 mt-0.5">chat_bubble_outline</span>
            <span class="truncate-2-lines">${escapeHtml(trig.mensagem || 'Notificação padrão do sistema.')}</span>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
  }

  /**
   * Abre o modal para criar ou editar um gatilho.
   */
  async function openTriggerModal(triggerId) {
    currentEditingTriggerId = triggerId || null;
    let modal = document.getElementById('modal-event-trigger');
    if (!modal) {
      modal = createTriggerModalElement();
      document.body.appendChild(modal);
    }

    // Carrega usuários para o select
    await loadProfilesForTriggers();

    // Popula selects de campos de data e campos gerais
    populateModalFieldsSelects();

    // Se edição, preenche valores existentes
    const isEdit = Boolean(triggerId);
    let trigger = null;
    if (isEdit && Array.isArray(global._currentFormEventTriggers)) {
      trigger = global._currentFormEventTriggers.find(t => t.id === triggerId);
    }

    document.getElementById('modal-trigger-title').innerText = isEdit ? 'Editar Gatilho de Monitoramento' : 'Novo Gatilho de Monitoramento';
    document.getElementById('trig-name').value = trigger ? trigger.nome : '';
    document.getElementById('trig-type').value = trigger ? trigger.tipo : 'periodicidade';
    document.getElementById('trig-field-date').value = trigger ? trigger.campo_data : '';
    document.getElementById('trig-intervalo-val').value = trigger ? (trigger.intervalo_valor || 6) : 6;
    document.getElementById('trig-intervalo-unit').value = trigger ? (trigger.intervalo_unidade || 'meses') : 'meses';
    document.getElementById('trig-aviso-dias').value = trigger ? (trigger.aviso_previo_dias !== undefined ? trigger.aviso_previo_dias : 15) : 15;
    
    // Filtro condicional
    document.getElementById('trig-filter-field').value = trigger ? (trigger.campo_filtro || '') : '';
    document.getElementById('trig-filter-op').value = trigger ? (trigger.filtro_operador || '=') : '=';
    document.getElementById('trig-filter-val').value = trigger ? (trigger.filtro_valor || '') : '';

    // Responsável
    const respTipo = trigger ? (trigger.responsavel_tipo || 'todos') : 'todos';
    document.getElementById('trig-resp-tipo').value = respTipo;
    document.getElementById('trig-resp-id').value = trigger ? (trigger.responsavel_id || '') : '';

    // Severidade
    document.getElementById('trig-severidade').value = trigger ? (trigger.severidade || 'atencao') : 'atencao';

    // Mensagem
    document.getElementById('trig-msg').value = trigger ? (trigger.mensagem || '') : 'A feição {nome} atingiu o prazo estabelecido em {data_limite}.';

    // Atualiza visibilidade dos blocos condicionais
    onTriggerTypeChanged();
    onRespTipoChanged();

    modal.classList.remove('hidden');
  }

  /**
   * Fecha o modal do gatilho.
   */
  function closeTriggerModal() {
    const modal = document.getElementById('modal-event-trigger');
    if (modal) modal.classList.add('hidden');
    currentEditingTriggerId = null;
  }

  /**
   * Atualiza as opções dos selects com os campos atuais de builderTabs e usuários.
   */
  function populateModalFieldsSelects() {
    const dateFields = getDateFieldsFromBuilder();
    const allFields = getAllFieldsFromBuilder();

    // Select Campo de Data Base
    const dateSelect = document.getElementById('trig-field-date');
    if (dateSelect) {
      if (dateFields.length === 0) {
        dateSelect.innerHTML = '<option value="">Nenhum campo de data no formulário (adicione na aba Campos)</option>';
      } else {
        dateSelect.innerHTML = dateFields.map(f => `
          <option value="${escapeHtml(f.id)}">[${escapeHtml(f.tabTitle)}] ${escapeHtml(f.label)}</option>
        `).join('');
      }
    }

    // Select Campo Filtro
    const filterSelect = document.getElementById('trig-filter-field');
    if (filterSelect) {
      filterSelect.innerHTML = '<option value="">(Sem filtro adicional - avaliar todas as feições)</option>' + allFields.map(f => `
        <option value="${escapeHtml(f.id)}">[${escapeHtml(f.tabTitle)}] ${escapeHtml(f.label)}</option>
      `).join('');
    }

    // Select Responsável Usuário/Setor
    const respSelect = document.getElementById('trig-resp-id');
    if (respSelect) {
      let optHtml = '<option value="">Selecione...</option>';
      if (cachedProfilesList && cachedProfilesList.length > 0) {
        optHtml += '<optgroup label="Usuários do Sistema">';
        cachedProfilesList.forEach(u => {
          const name = u.full_name || u.email || 'Usuário';
          const info = u.setor ? ` (${u.setor})` : '';
          optHtml += `<option value="${escapeHtml(u.id)}">${escapeHtml(name)}${escapeHtml(info)}</option>`;
        });
        optHtml += '</optgroup>';
      }
      respSelect.innerHTML = optHtml;
    }

    // Chips de Tags dinâmicas para mensagem
    const tagsContainer = document.getElementById('trig-msg-tags');
    if (tagsContainer) {
      const standardTags = [
        { tag: '{dias_restantes}', label: 'Dias Restantes' },
        { tag: '{data_limite}', label: 'Data Limite' },
        { tag: '{data_base}', label: 'Data Base' },
        { tag: '{nome_camada}', label: 'Nome da Camada' }
      ];
      const customTags = allFields.slice(0, 8).map(f => ({
        tag: `{${f.id}}`,
        label: f.label
      }));

      const allTags = [...standardTags, ...customTags];
      tagsContainer.innerHTML = allTags.map(t => `
        <button type="button" onclick="EventsBuilder.insertMsgTag('${t.tag}')" class="px-2 py-0.5 rounded-md text-[10.5px] font-medium bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-amber-100 hover:text-amber-800 dark:hover:bg-amber-950/60 dark:hover:text-amber-300 transition-colors cursor-pointer">
          ${escapeHtml(t.label)}
        </button>
      `).join('');
    }
  }

  /**
   * Insere uma variável na mensagem personalizada.
   */
  function insertMsgTag(tag) {
    const textarea = document.getElementById('trig-msg');
    if (!textarea) return;
    const start = textarea.selectionStart || textarea.value.length;
    const end = textarea.selectionEnd || textarea.value.length;
    const text = textarea.value;
    textarea.value = text.substring(0, start) + tag + text.substring(end);
    textarea.focus();
    textarea.selectionStart = textarea.selectionEnd = start + tag.length;
  }

  /**
   * Disparado quando altera o Tipo de Gatilho.
   */
  function onTriggerTypeChanged() {
    const tipo = document.getElementById('trig-type').value;
    const intervalBox = document.getElementById('trig-box-intervalo');
    const intervalLabel = document.getElementById('trig-intervalo-label');
    const dateFieldLabel = document.getElementById('trig-date-label');

    if (tipo === 'periodicidade') {
      if (intervalBox) intervalBox.classList.remove('hidden');
      if (intervalLabel) intervalLabel.innerText = 'Ciclo de Periodicidade (a cada):';
      if (dateFieldLabel) dateFieldLabel.innerText = 'Campo com a Data do Último Registro / Manutenção:';
    } else if (tipo === 'validade') {
      if (intervalBox) intervalBox.classList.add('hidden');
      if (dateFieldLabel) dateFieldLabel.innerText = 'Campo com a Data de Validade / Vencimento:';
    } else if (tipo === 'calculado') {
      if (intervalBox) intervalBox.classList.remove('hidden');
      if (intervalLabel) intervalLabel.innerText = 'Prazo Limite Adicionado:';
      if (dateFieldLabel) dateFieldLabel.innerText = 'Campo com a Data de Emissão / Início:';
    }
  }

  /**
   * Disparado quando altera o Tipo de Responsável.
   */
  function onRespTipoChanged() {
    const tipo = document.getElementById('trig-resp-tipo').value;
    const selectBox = document.getElementById('trig-box-resp-select');
    const setorBox = document.getElementById('trig-box-resp-setor');

    if (selectBox) selectBox.classList.toggle('hidden', tipo !== 'usuario');
    if (setorBox) setorBox.classList.toggle('hidden', tipo !== 'setor');
  }

  /**
   * Salva as configurações do gatilho no formulário ativo.
   */
  function saveTriggerConfig() {
    const name = document.getElementById('trig-name').value.trim();
    if (!name) {
      alert('Por favor, informe um nome ou título para o evento / gatilho.');
      return;
    }

    const campoData = document.getElementById('trig-field-date').value;
    if (!campoData) {
      alert('Por favor, selecione o campo de data do formulário que servirá de gatilho.');
      return;
    }

    const dateSelect = document.getElementById('trig-field-date');
    const campoDataLabel = dateSelect.options[dateSelect.selectedIndex] ? dateSelect.options[dateSelect.selectedIndex].text : campoData;

    const tipo = document.getElementById('trig-type').value;
    const intervaloValor = parseInt(document.getElementById('trig-intervalo-val').value, 10) || 6;
    const intervaloUnidade = document.getElementById('trig-intervalo-unit').value || 'meses';
    const avisoPrevioDias = parseInt(document.getElementById('trig-aviso-dias').value, 10) || 15;

    const campoFiltro = document.getElementById('trig-filter-field').value || null;
    const filtroOperador = document.getElementById('trig-filter-op').value || '=';
    const filtroValor = document.getElementById('trig-filter-val').value.trim() || null;

    const respTipo = document.getElementById('trig-resp-tipo').value;
    let respId = null;
    let respNome = 'Todos os Operadores';

    if (respTipo === 'usuario') {
      const respSelect = document.getElementById('trig-resp-id');
      respId = respSelect.value || null;
      respNome = respSelect.options[respSelect.selectedIndex] ? respSelect.options[respSelect.selectedIndex].text : 'Usuário';
    } else if (respTipo === 'setor') {
      respNome = document.getElementById('trig-resp-setor-val').value.trim() || 'Setor';
      respId = respNome;
    } else if (respTipo === 'criador') {
      respNome = 'Criador da Feição';
      respId = 'criador';
    }

    const severidade = document.getElementById('trig-severidade').value || 'atencao';
    const mensagem = document.getElementById('trig-msg').value.trim() || 'A feição {nome} atingiu o prazo em {data_limite}.';

    if (!Array.isArray(global._currentFormEventTriggers)) {
      global._currentFormEventTriggers = [];
    }

    const newTrigger = {
      id: currentEditingTriggerId || ('trig_' + Math.random().toString(36).substr(2, 9)),
      nome: name,
      tipo: tipo,
      campo_data: campoData,
      campo_data_label: campoDataLabel,
      intervalo_valor: intervaloValor,
      intervalo_unidade: intervaloUnidade,
      aviso_previo_dias: avisoPrevioDias,
      campo_filtro: campoFiltro,
      filtro_operador: filtroOperador,
      filtro_valor: filtroValor,
      responsavel_tipo: respTipo,
      responsavel_id: respId,
      responsavel_nome: respNome,
      severidade: severidade,
      mensagem: mensagem,
      ativo: true,
      updated_at: new Date().toISOString()
    };

    if (currentEditingTriggerId) {
      const idx = global._currentFormEventTriggers.findIndex(t => t.id === currentEditingTriggerId);
      if (idx >= 0) {
        newTrigger.ativo = global._currentFormEventTriggers[idx].ativo !== false;
        global._currentFormEventTriggers[idx] = newTrigger;
      } else {
        global._currentFormEventTriggers.push(newTrigger);
      }
    } else {
      global._currentFormEventTriggers.push(newTrigger);
    }

    closeTriggerModal();
    renderEventTriggersBuilder();

    // Notifica toast discreto
    if (typeof global.showStorageToast === 'function') {
      global.showStorageToast(`Gatilho "${name}" salvo com sucesso!`);
    }
  }

  /**
   * Exclui um gatilho.
   */
  function deleteTriggerConfig(triggerId) {
    if (!confirm('Deseja realmente remover este gatilho de monitoramento?')) return;
    if (Array.isArray(global._currentFormEventTriggers)) {
      global._currentFormEventTriggers = global._currentFormEventTriggers.filter(t => t.id !== triggerId);
      renderEventTriggersBuilder();
    }
  }

  /**
   * Alterna status Ativo/Pausado.
   */
  function toggleTriggerStatus(triggerId) {
    if (Array.isArray(global._currentFormEventTriggers)) {
      const t = global._currentFormEventTriggers.find(item => item.id === triggerId);
      if (t) {
        t.ativo = (t.ativo === false);
        renderEventTriggersBuilder();
      }
    }
  }

  /**
   * Cria o elemento do modal no DOM se não existir.
   */
  function createTriggerModalElement() {
    const modal = document.createElement('div');
    modal.id = 'modal-event-trigger';
    modal.className = 'fixed inset-0 bg-black/60 z-[350] flex items-center justify-center backdrop-blur-sm p-4 hidden';
    modal.innerHTML = `
      <div class="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200">
        <!-- Header -->
        <div class="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/40">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-2xl bg-amber-500/15 text-amber-500 flex items-center justify-center shrink-0 border border-amber-500/20">
              <span class="material-symbols-outlined text-[22px]">notifications_active</span>
            </div>
            <div>
              <h3 class="text-base font-bold text-slate-900 dark:text-white" id="modal-trigger-title">Configurar Gatilho de Monitoramento</h3>
              <p class="text-xs text-slate-500 dark:text-slate-400">Defina regras automáticas de tempo para esta camada</p>
            </div>
          </div>
          <button type="button" onclick="EventsBuilder.closeTriggerModal()" class="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer">
            <span class="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <!-- Body Scrollável -->
        <div class="p-6 overflow-y-auto space-y-5 flex-1 custom-scrollbar">
          <!-- Nome do Gatilho -->
          <div>
            <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Nome do Evento / Gatilho *</label>
            <input type="text" id="trig-name" class="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-none" placeholder="Ex: Manutenção Semestral de Logradouro, Vencimento de Alvará...">
          </div>

          <!-- Tipo de Gatilho Temporal -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Tipo de Monitoramento Temporal</label>
              <select id="trig-type" onchange="EventsBuilder.onTriggerTypeChanged()" class="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-none">
                <option value="periodicidade">Periodicidade / Recorrência (a cada X meses/dias)</option>
                <option value="validade">Data de Validade / Vencimento Direto</option>
                <option value="calculado">Validade Calculada (Emissão + Prazo)</option>
              </select>
            </div>

            <div>
              <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5" id="trig-date-label">Campo de Data de Referência *</label>
              <select id="trig-field-date" class="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-none">
                <!-- Populado dinamicamente -->
              </select>
            </div>
          </div>

          <!-- Intervalo e Aviso Prévio -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div id="trig-box-intervalo">
              <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5" id="trig-intervalo-label">Ciclo de Periodicidade:</label>
              <div class="flex gap-2">
                <input type="number" id="trig-intervalo-val" min="1" value="6" class="w-24 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-none">
                <select id="trig-intervalo-unit" class="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-none">
                  <option value="meses">Meses</option>
                  <option value="dias">Dias</option>
                  <option value="anos">Anos</option>
                </select>
              </div>
            </div>

            <div>
              <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Aviso Prévio (Antecedência em dias):</label>
              <input type="number" id="trig-aviso-dias" min="0" value="15" class="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-none" placeholder="Ex: 15 dias antes">
            </div>
          </div>

          <!-- Filtro Condicional Opcional -->
          <div class="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 rounded-2xl space-y-2.5">
            <div class="flex items-center gap-2">
              <span class="material-symbols-outlined text-[18px] text-slate-400">filter_alt</span>
              <span class="text-xs font-bold text-slate-700 dark:text-slate-300">Condição Adicional de Filtro (Opcional)</span>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <select id="trig-filter-field" class="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-none">
                <!-- Populado dinamicamente -->
              </select>
              <select id="trig-filter-op" class="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-none">
                <option value="!=">Diferente de (!=)</option>
                <option value="=">Igual a (=)</option>
                <option value="contem">Contém</option>
                <option value="nao_contem">Não Contém</option>
              </select>
              <input type="text" id="trig-filter-val" placeholder="Ex: Concluído" class="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-none">
            </div>
          </div>

          <!-- Responsável e Severidade -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Atribuir Responsável</label>
              <select id="trig-resp-tipo" onchange="EventsBuilder.onRespTipoChanged()" class="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-none">
                <option value="todos">Todos os Operadores / Geral</option>
                <option value="usuario">Usuário Específico</option>
                <option value="setor">Setor / Órgão</option>
                <option value="criador">Criador do Registro</option>
              </select>

              <div id="trig-box-resp-select" class="hidden mt-2">
                <select id="trig-resp-id" class="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white">
                  <!-- Populado dinamicamente -->
                </select>
              </div>

              <div id="trig-box-resp-setor" class="hidden mt-2">
                <input type="text" id="trig-resp-setor-val" placeholder="Nome do Setor (ex: Fiscalização, Obras)" class="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white">
              </div>
            </div>

            <div>
              <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Nível de Severidade</label>
              <select id="trig-severidade" class="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-none">
                <option value="atencao">🟡 Atenção (Vencendo nos próximos dias / Manutenção Pendente)</option>
                <option value="critico">🔴 Crítico (Urgente / Vencido)</option>
                <option value="info">🟢 Informativo (Preventivo / Notificação Regular)</option>
              </select>
            </div>
          </div>

          <!-- Mensagem Personalizada -->
          <div>
            <div class="flex justify-between items-center mb-1.5">
              <label class="block text-xs font-bold text-slate-700 dark:text-slate-300">Mensagem do Alerta</label>
              <span class="text-[11px] text-slate-400">Clique nas tags para inserir</span>
            </div>
            <div id="trig-msg-tags" class="flex flex-wrap gap-1.5 mb-2">
              <!-- Tags dinâmicas -->
            </div>
            <textarea id="trig-msg" rows="3" class="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-none" placeholder="Ex: O logradouro {logradouro} atingiu {dias} sem manutenção preventiva."></textarea>
          </div>
        </div>

        <!-- Footer -->
        <div class="px-6 py-4 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-3 bg-slate-50 dark:bg-slate-950/40">
          <button type="button" onclick="EventsBuilder.closeTriggerModal()" class="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer">
            Cancelar
          </button>
          <button type="button" onclick="EventsBuilder.saveTriggerConfig()" class="flex items-center gap-2 px-5 py-2 bg-amber-600 hover:bg-amber-700 active:scale-[0.98] text-white rounded-xl text-xs sm:text-sm font-bold shadow-md transition-all cursor-pointer">
            <span class="material-symbols-outlined text-[18px]">check</span>
            <span>Salvar Gatilho</span>
          </button>
        </div>
      </div>
    `;
    return modal;
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

  // Exportação pública
  const EventsBuilder = {
    renderEventTriggersBuilder,
    openTriggerModal,
    closeTriggerModal,
    saveTriggerConfig,
    deleteTriggerConfig,
    toggleTriggerStatus,
    insertMsgTag,
    onTriggerTypeChanged,
    onRespTipoChanged
  };

  global.EventsBuilder = EventsBuilder;

})(typeof window !== 'undefined' ? window : this);
