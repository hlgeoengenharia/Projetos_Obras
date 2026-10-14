/**
 * eventsBuilder.js - Construtor Visual de Regras de Monitoramento de Eventos e Prazos
 * Integrado à 5ª aba do Editor de Formulários de Camadas (settings.html).
 */

(function(global) {
  'use strict';

  let currentEditingTriggerId = null;
  let cachedProfilesList = [];

  /**
   * Obtém as abas ativas do formulário com máxima resiliência (global, window, escopo local ou forms).
   */
  function getActiveTabs() {
    if (Array.isArray(global.builderTabs) && global.builderTabs.length > 0) {
      return global.builderTabs;
    }
    if (typeof builderTabs !== 'undefined' && Array.isArray(builderTabs) && builderTabs.length > 0) {
      return builderTabs;
    }
    if (global.currentFormId && Array.isArray(global.forms)) {
      const f = global.forms.find(x => x.id === global.currentFormId);
      if (f && Array.isArray(f.tabs) && f.tabs.length > 0) {
        return f.tabs;
      }
    }
    return [];
  }

  /**
   * Extrai todos os campos do tipo data/datetime das abas ativas do construtor.
   */
  function getDateFieldsFromBuilder() {
    const tabs = getActiveTabs();
    const dateFields = [];
    tabs.forEach(tab => {
      (tab.fields || []).forEach(f => {
        const type = (f.type || '').toLowerCase();
        const label = f.label || f.name || f.id;
        if (type === 'date' || type === 'datetime' || type === 'datetime-local' || type === 'current_date' || /data|prazo|vencimento|registro|vistoria|emissao|alvara|inicio/i.test(label)) {
          dateFields.push({
            id: f.name || f.id,
            rawId: f.id,
            name: f.name || f.id,
            label: label,
            type: f.type || 'date',
            tabTitle: tab.title || 'Aba'
          });
        }
      });
    });

    // Se nenhum campo foi estritamente classificado como data, oferece todos os campos para não travar a escolha
    if (dateFields.length === 0) {
      return getAllFieldsFromBuilder();
    }
    return dateFields;
  }

  /**
   * Utilitário para parsear opções de campos select (array, string JSON ou vírgula).
   */
  function parseFieldOptions(optionsRaw) {
    if (!optionsRaw) return [];
    if (Array.isArray(optionsRaw)) return optionsRaw.map(s => String(s).trim()).filter(Boolean);
    if (typeof optionsRaw === 'string') {
      const trimmed = optionsRaw.trim();
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) return parsed.map(s => String(s).trim()).filter(Boolean);
        } catch (e) {}
      }
      return trimmed.split(',').map(s => s.trim()).filter(Boolean);
    }
    return [];
  }

  /**
   * Extrai todos os campos das abas ativas do construtor (para filtros e tags).
   */
  function getAllFieldsFromBuilder() {
    const tabs = getActiveTabs();
    const all = [];
    tabs.forEach(tab => {
      (tab.fields || []).forEach(f => {
        all.push({
          id: f.name || f.id,
          rawId: f.id,
          name: f.name || f.id,
          label: f.label || f.name || f.id,
          type: f.type || 'text',
          tabTitle: tab.title || 'Aba',
          options: parseFieldOptions(f.options)
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
          .select('id, nome, email, papel, unidade, setor')
          .order('nome');
        if (!error && Array.isArray(data)) {
          cachedProfilesList = data;
          return cachedProfilesList;
        }
        if (error) {
          console.warn('[EventsBuilder] Erro na query completa de profiles, tentando fallback:', error);
          const { data: dataFb } = await client
            .from('profiles')
            .select('id, nome, email');
          if (Array.isArray(dataFb)) {
            cachedProfilesList = dataFb;
            return cachedProfilesList;
          }
        }
      }
    } catch (e) {
      console.warn('Não foi possível carregar perfis via Supabase, usando fallback local:', e);
    }
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

    let html = `
      <div class="mb-4 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 flex items-center gap-2 text-xs text-amber-800 dark:text-amber-200 shadow-2xs">
        <span class="material-symbols-outlined text-[18px] text-amber-600 shrink-0">check_circle</span>
        <span><b>Lembrete:</b> Após adicionar ou alterar gatilhos, clique no botão verde <b>"Salvar Formulário"</b> (no canto superior) para gravar as regras no banco de dados e ativá-las no mapa.</span>
      </div>
    `;
    triggers.forEach((trig) => {
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

      let respChip = '';
      if (trig.responsavel_tipo === 'usuario') {
        respChip = `
          <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
            <span class="material-symbols-outlined text-[13px]">person</span>
            ${escapeHtml(trig.responsavel_nome || 'Usuário')}
          </span>
        `;
      } else if (trig.responsavel_tipo === 'setor') {
        respChip = `
          <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
            <span class="material-symbols-outlined text-[13px]">domain</span>
            Setor: ${escapeHtml(trig.responsavel_nome || 'Setor')}
          </span>
        `;
      } else if (trig.responsavel_tipo === 'criador') {
        respChip = `
          <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
            <span class="material-symbols-outlined text-[13px]">edit_note</span>
            Criador do Registro
          </span>
        `;
      } else {
        respChip = `
          <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20">
            <span class="material-symbols-outlined text-[13px]">group</span>
            Todos os Operadores
          </span>
        `;
      }

      let filtroChip = '';
      if (trig.campo_filtro && trig.filtro_valor) {
        filtroChip = `
          <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">
            <span class="material-symbols-outlined text-[13px]">filter_alt</span>
            Filtro: ${escapeHtml(trig.campo_filtro)} ${escapeHtml(trig.filtro_operador || '=')} "${escapeHtml(trig.filtro_valor)}"
          </span>
        `;
      }

      html += `
        <div class="p-4 sm:p-5 rounded-2xl border ${isAtivo ? 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/70' : 'border-dashed border-slate-300 dark:border-slate-800/80 bg-slate-50/60 dark:bg-slate-900/30 opacity-75'} shadow-xs hover:shadow-md transition-all group">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-3">
            <div class="flex items-center gap-2.5 flex-wrap min-w-0">
              <span class="w-2.5 h-2.5 rounded-full ${isAtivo ? 'bg-amber-500 animate-pulse' : 'bg-slate-400'} shrink-0"></span>
              <h4 class="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
                ${escapeHtml(trig.nome)}
              </h4>
              <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold ${sev.badge}">
                <span class="w-1.5 h-1.5 rounded-full ${sev.dot} mr-1.5"></span>
                ${sev.label}
              </span>
              <span class="inline-flex items-center px-2 py-0.5 rounded-md text-[10.5px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                ${typeLabel}
              </span>
            </div>

            <!-- Ações -->
            <div class="flex items-center gap-1 self-end sm:self-auto shrink-0">
              <button type="button" onclick="EventsBuilder.toggleTriggerStatus('${trig.id}')" class="px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${isAtivo ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20' : 'bg-slate-200 dark:bg-slate-800 text-slate-500 hover:bg-slate-300'}" title="${isAtivo ? 'Gatilho Ativo' : 'Gatilho Desativado'}">
                <span class="material-symbols-outlined text-[15px]">${isAtivo ? 'toggle_on' : 'toggle_off'}</span>
                <span>${isAtivo ? 'Ativo' : 'Pausado'}</span>
              </button>
              <button type="button" onclick="EventsBuilder.openTriggerModal('${trig.id}')" class="p-1.5 rounded-lg text-slate-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40 dark:hover:text-amber-400 transition-colors cursor-pointer" title="Editar Regra">
                <span class="material-symbols-outlined text-[18px]">edit</span>
              </button>
              <button type="button" onclick="EventsBuilder.deleteTriggerConfig('${trig.id}')" class="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 dark:hover:text-rose-400 transition-colors cursor-pointer" title="Excluir Regra">
                <span class="material-symbols-outlined text-[18px]">delete</span>
              </button>
            </div>
          </div>

          <!-- Resumo da Regra -->
          <div class="text-xs text-slate-600 dark:text-slate-300 mb-2.5 flex items-center gap-1.5 flex-wrap">
            <span class="material-symbols-outlined text-[16px] text-amber-500">schedule</span>
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

    // Fecha o tutorial caso esteja aberto anteriormente
    const tutorial = document.getElementById('modal-trigger-tutorial');
    if (tutorial) tutorial.classList.add('hidden');

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
    onFilterFieldChanged(trigger ? trigger.filtro_valor : '');

    // Responsável
    const respTipo = trigger ? (trigger.responsavel_tipo || 'todos') : 'todos';
    document.getElementById('trig-resp-tipo').value = respTipo;
    document.getElementById('trig-resp-id').value = trigger ? (trigger.responsavel_id || '') : '';
    const setorInput = document.getElementById('trig-resp-setor-val');
    if (setorInput) {
      setorInput.value = (trigger && trigger.responsavel_tipo === 'setor') ? (trigger.responsavel_nome || trigger.responsavel_id || '') : '';
    }

    // Severidade
    const sevInput = document.getElementById('trig-severidade');
    if (sevInput) sevInput.value = trigger ? (trigger.severidade || 'atencao') : 'atencao';

    // Mensagens Personalizadas por Situação (Em Dia, Atenção, Crítico)
    const padraoEmDia = '@Nome está em conformidade com o cronograma regular.';
    const padraoAtencao = 'Atenção: @Nome entrará em período de vencimento em x dias.';
    const padraoCritico = '@Nome atingiu o prazo limite em x dias e requer manutenção/vistoria urgente.';

    const elEmDia = document.getElementById('trig-msg-em-dia');
    const elAtencao = document.getElementById('trig-msg-atencao');
    const elCritico = document.getElementById('trig-msg-critico');
    const elMsgLegacy = document.getElementById('trig-msg');

    if (elEmDia) elEmDia.value = (trigger && trigger.mensagem_em_dia) ? trigger.mensagem_em_dia : padraoEmDia;
    if (elAtencao) elAtencao.value = (trigger && trigger.mensagem_atencao) ? trigger.mensagem_atencao : padraoAtencao;
    if (elCritico) elCritico.value = (trigger && (trigger.mensagem_critico || trigger.mensagem)) ? (trigger.mensagem_critico || trigger.mensagem) : padraoCritico;
    if (elMsgLegacy) elMsgLegacy.value = elCritico ? elCritico.value : padraoCritico;

    // Cálculo personalizado de datas (Tempo Decorrido)
    const elCalcOrigem = document.getElementById('trig-calc-origem');
    const elCalcDestino = document.getElementById('trig-calc-destino');
    if (elCalcOrigem) elCalcOrigem.value = trigger ? (trigger.calc_data_origem || 'hoje') : 'hoje';
    if (elCalcDestino) elCalcDestino.value = trigger ? (trigger.calc_data_destino || trigger.campo_data || '') : (document.getElementById('trig-field-date')?.value || '');
    updateDateCalcPreview();

    // Atualiza visibilidade dos blocos condicionais
    onTriggerTypeChanged();
    onRespTipoChanged();

    modal.classList.remove('hidden');
  }

  /**
   * Atualiza a prévia textual do cálculo de diferença entre datas.
   */
  function updateDateCalcPreview() {
    const sel1 = document.getElementById('trig-calc-origem');
    const sel2 = document.getElementById('trig-calc-destino');
    const previewEl = document.getElementById('trig-calc-preview-text');
    if (!sel1 || !sel2 || !previewEl) return;

    const t1 = sel1.options[sel1.selectedIndex]?.text || 'Data Atual (Hoje)';
    const t2 = sel2.options[sel2.selectedIndex]?.text || 'Data Cadastrada';
    previewEl.innerHTML = `💡 Cálculo: <b>${escapeHtml(t1)}</b> menos <b>${escapeHtml(t2)}</b> = dias decorridos reais.`;
  }

  /**
   * Alterna a exibição do guia explicativo Passo a Passo no topo do modal.
   */
  function toggleTutorialGuide() {
    const tutorial = document.getElementById('modal-trigger-tutorial');
    if (!tutorial) return;
    tutorial.classList.toggle('hidden');
    if (!tutorial.classList.contains('hidden')) {
      tutorial.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
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

    // Select Campo
    const dateSelect = document.getElementById('trig-field-date');
    if (dateSelect) {
      if (dateFields.length === 0) {
        dateSelect.innerHTML = '<option value="">Nenhum campo disponível no formulário (adicione na aba Campos)</option>';
      } else {
        dateSelect.innerHTML = dateFields.map(f => `
          <option value="${escapeHtml(f.id)}">[${escapeHtml(f.tabTitle)}] ${escapeHtml(f.label)}</option>
        `).join('');
      }
    }

    // Selects de Cálculo Personalizado entre Datas
    const calcOrigemSelect = document.getElementById('trig-calc-origem');
    const calcDestinoSelect = document.getElementById('trig-calc-destino');
    if (calcOrigemSelect) {
      calcOrigemSelect.innerHTML = '<option value="hoje">Data Atual (Hoje)</option>' + dateFields.map(f => `
        <option value="${escapeHtml(f.id)}">[${escapeHtml(f.tabTitle)}] ${escapeHtml(f.label)}</option>
      `).join('');
    }
    if (calcDestinoSelect) {
      calcDestinoSelect.innerHTML = dateFields.map(f => `
        <option value="${escapeHtml(f.id)}">[${escapeHtml(f.tabTitle)}] ${escapeHtml(f.label)}</option>
      `).join('') + '<option value="hoje">Data Atual (Hoje)</option>';
    }

    // Select Campo Filtro
    const filterSelect = document.getElementById('trig-filter-field');
    if (filterSelect) {
      filterSelect.innerHTML = '<option value="">(Sem filtro adicional - avaliar todas as feições)</option>' + allFields.map(f => `
        <option value="${escapeHtml(f.id)}">[${escapeHtml(f.tabTitle)}] ${escapeHtml(f.label)}</option>
      `).join('');
    }

    // Select Responsável Usuário
    const respSelect = document.getElementById('trig-resp-id');
    if (respSelect) {
      let optHtml = '<option value="">Selecione o usuário responsável...</option>';
      if (cachedProfilesList && cachedProfilesList.length > 0) {
        const currentUserUnit = (global.currentUserProfile && (global.currentUserProfile.unidade || global.currentUserProfile.setor)) || null;

        // Se o usuário logado tiver uma unidade identificada, destaca a equipe da sua unidade no topo
        if (currentUserUnit) {
          const mesmaUnidade = cachedProfilesList.filter(u => u.unidade && u.unidade.toLowerCase() === currentUserUnit.toLowerCase());
          const outros = cachedProfilesList.filter(u => !u.unidade || u.unidade.toLowerCase() !== currentUserUnit.toLowerCase());

          if (mesmaUnidade.length > 0) {
            optHtml += `<optgroup label="Minha Unidade / Equipe (${escapeHtml(currentUserUnit)})">`;
            mesmaUnidade.forEach(u => {
              const name = u.nome || u.email || 'Usuário';
              const info = u.setor ? ` [${u.setor}]` : '';
              optHtml += `<option value="${escapeHtml(u.id)}">${escapeHtml(name)}${escapeHtml(info)}</option>`;
            });
            optHtml += '</optgroup>';
          }

          if (outros.length > 0) {
            optHtml += '<optgroup label="Demais Usuários e Técnicos">';
            outros.forEach(u => {
              const name = u.nome || u.email || 'Usuário';
              const det = [u.setor, u.unidade].filter(Boolean).join(' - ');
              const info = det ? ` [${det}]` : '';
              optHtml += `<option value="${escapeHtml(u.id)}">${escapeHtml(name)}${escapeHtml(info)}</option>`;
            });
            optHtml += '</optgroup>';
          }
        } else {
          optHtml += '<optgroup label="Usuários do Sistema">';
          cachedProfilesList.forEach(u => {
            const name = u.nome || u.email || 'Usuário';
            const det = [u.setor, u.unidade].filter(Boolean).join(' - ');
            const info = det ? ` [${det}]` : '';
            optHtml += `<option value="${escapeHtml(u.id)}">${escapeHtml(name)}${escapeHtml(info)}</option>`;
          });
          optHtml += '</optgroup>';
        }
      }
      respSelect.innerHTML = optHtml;
    }

    // Limpa container legado se existir
    const tagsContainer = document.getElementById('trig-msg-tags');
    if (tagsContainer) {
      tagsContainer.innerHTML = '';
    }
  }

  // Estado do dropdown de menção com @
  let activeMentionState = {
    targetId: null,
    query: '',
    selectedIndex: 0,
    mentionStartPos: -1
  };

  /**
   * Abre o dropdown de menção com @ ao clicar no botão "Inserir Campo".
   */
  function openMentionMenu(targetId) {
    const textarea = document.getElementById(targetId);
    if (!textarea) return;
    textarea.focus();
    const pos = textarea.selectionStart !== undefined ? textarea.selectionStart : textarea.value.length;
    activeMentionState.targetId = targetId;
    activeMentionState.query = '';
    activeMentionState.selectedIndex = 0;
    activeMentionState.mentionStartPos = pos;
    renderMentionDropdown(targetId, '');
  }

  /**
   * Fecha o dropdown flutuante de menções.
   */
  function hideMentionMenu() {
    const dropdown = document.getElementById('trig-mention-dropdown');
    if (dropdown) dropdown.classList.add('hidden');
    activeMentionState.targetId = null;
    activeMentionState.mentionStartPos = -1;
  }

  /**
   * Detecta digitação no textarea para filtrar os campos cadastrais a partir de @.
   */
  function handleMentionInput(event, targetId) {
    const textarea = document.getElementById(targetId);
    if (!textarea) return;

    const cursor = textarea.selectionStart;
    const textBefore = textarea.value.slice(0, cursor);
    const atMatch = textBefore.match(/@([\w\u00C0-\u017F\s]*)$/);

    if (atMatch) {
      activeMentionState.targetId = targetId;
      activeMentionState.query = atMatch[1].trim();
      activeMentionState.selectedIndex = 0;
      activeMentionState.mentionStartPos = cursor - atMatch[0].length;
      renderMentionDropdown(targetId, activeMentionState.query);
      return;
    }

    hideMentionMenu();
  }

  /**
   * Controla navegação por setas (cima/baixo), Enter, Tab e Escape no dropdown de menção @.
   */
  function handleMentionKeyDown(event, targetId) {
    const dropdown = document.getElementById('trig-mention-dropdown');
    if (!dropdown || dropdown.classList.contains('hidden')) return;

    const items = dropdown.querySelectorAll('.trig-mention-item');
    if (items.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      activeMentionState.selectedIndex = (activeMentionState.selectedIndex + 1) % items.length;
      updateMentionDropdownHighlight(items);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      activeMentionState.selectedIndex = (activeMentionState.selectedIndex - 1 + items.length) % items.length;
      updateMentionDropdownHighlight(items);
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault();
      const activeItem = items[activeMentionState.selectedIndex];
      if (activeItem) {
        const fieldTag = activeItem.getAttribute('data-field-tag');
        insertMentionField(fieldTag, targetId);
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      hideMentionMenu();
    }
  }

  /**
   * Atualiza destaque visual do item selecionado no dropdown de menção.
   */
  function updateMentionDropdownHighlight(items) {
    items.forEach((item, idx) => {
      if (idx === activeMentionState.selectedIndex) {
        item.classList.add('bg-amber-100', 'dark:bg-amber-900/50', 'text-amber-900', 'dark:text-amber-200');
        item.scrollIntoView({ block: 'nearest' });
      } else {
        item.classList.remove('bg-amber-100', 'dark:bg-amber-900/50', 'text-amber-900', 'dark:text-amber-200');
      }
    });
  }

  /**
   * Renderiza a lista de campos disponíveis no dropdown de menções.
   */
  function renderMentionDropdown(targetId, query) {
    let dropdown = document.getElementById('trig-mention-dropdown');
    if (!dropdown) {
      dropdown = document.createElement('div');
      dropdown.id = 'trig-mention-dropdown';
      dropdown.className = 'fixed z-[400] w-72 sm:w-80 max-h-64 overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl p-1.5 custom-scrollbar text-xs hidden';
      document.body.appendChild(dropdown);

      // Fecha ao clicar fora
      document.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target) && !e.target.closest('#modal-event-trigger textarea') && !e.target.closest('button[onclick*="openMentionMenu"]')) {
          hideMentionMenu();
        }
      });
    }

    const textarea = document.getElementById(targetId);
    if (!textarea) return;

    // Posiciona o dropdown imediatamente abaixo do textarea
    const rect = textarea.getBoundingClientRect();
    const topPos = Math.min(window.innerHeight - 260, rect.bottom + 4);
    dropdown.style.left = `${Math.max(16, rect.left)}px`;
    dropdown.style.top = `${topPos}px`;

    // Campos nativos do monitoramento
    const standardFields = [
      { tag: '@Nome', label: 'Nome / Título da Feição', tab: 'Geral', icon: 'badge', type: 'título' },
      { tag: '@data_limite', label: 'Data Limite / Próximo Vencimento', tab: 'Tempo', icon: 'event', type: 'data' },
      { tag: '@data_base', label: 'Data Base / Registrada', tab: 'Tempo', icon: 'calendar_today', type: 'data' },
      { tag: '@dias_prazo', label: 'Prazo do Evento (Faltam X dias ou Atrasado há X dias)', tab: 'Tempo', icon: 'hourglass_top', type: 'prazo' },
      { tag: '@dias_decorridos', label: 'Dias Decorridos (Hoje - Data Registrada / Comparação)', tab: 'Tempo', icon: 'history', type: 'decorrido' },
      { tag: '@dias_restantes', label: 'Número de Dias do Prazo (Legado)', tab: 'Tempo', icon: 'schedule', type: 'número' },
      { tag: '@nome_camada', label: 'Nome da Camada', tab: 'Geral', icon: 'layers', type: 'camada' }
    ];

    // Campos cadastrais do formulário atual
    const formFields = getAllFieldsFromBuilder().map(f => ({
      tag: `@${f.name || f.id || f.label}`,
      label: f.label || f.name || f.id,
      tab: f.tabTitle || 'Cadastral',
      icon: (f.type === 'date' || f.type === 'datetime') ? 'calendar_today' : (f.type === 'number' ? 'tag' : 'edit_note'),
      type: f.type || 'texto'
    }));

    const allFields = [...standardFields, ...formFields];

    // Filtra pela busca
    const q = (query || '').toLowerCase().trim();
    const filtered = allFields.filter(f => {
      if (!q) return true;
      return f.label.toLowerCase().includes(q) || f.tag.toLowerCase().includes(q) || f.tab.toLowerCase().includes(q);
    });

    if (filtered.length === 0) {
      dropdown.innerHTML = `
        <div class="p-3 text-center text-slate-400 dark:text-slate-500 text-xs">
          Nenhum campo encontrado para "@${escapeHtml(query)}"
        </div>
      `;
      dropdown.classList.remove('hidden');
      return;
    }

    activeMentionState.selectedIndex = 0;

    let html = `
      <div class="px-2.5 py-1.5 border-b border-slate-100 dark:border-slate-800 text-[10.5px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider flex items-center justify-between">
        <span class="flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">alternate_email</span> Campos Cadastrais</span>
        <span class="text-[9.5px] text-slate-400 font-normal">Use ↑↓ e Enter</span>
      </div>
      <div class="space-y-0.5 mt-1">
    `;

    filtered.forEach((f, idx) => {
      const isSelected = idx === 0;
      html += `
        <div class="trig-mention-item flex items-center justify-between px-2.5 py-1.5 rounded-xl cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ${isSelected ? 'bg-amber-100 dark:bg-amber-900/50 text-amber-900 dark:text-amber-200' : 'text-slate-800 dark:text-slate-200'}"
             data-field-tag="${escapeHtml(f.tag)}"
             onclick="EventsBuilder.insertMentionField('${escapeHtml(f.tag)}', '${targetId}')">
          <div class="flex items-center gap-2 truncate pr-2">
            <span class="material-symbols-outlined text-[16px] text-amber-600 dark:text-amber-400 shrink-0">${f.icon}</span>
            <div class="truncate">
              <div class="font-bold text-xs truncate">${escapeHtml(f.tag)}</div>
              <div class="text-[10px] text-slate-500 dark:text-slate-400 truncate">${escapeHtml(f.label)}</div>
            </div>
          </div>
          <span class="text-[9.5px] px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium shrink-0">${escapeHtml(f.tab)}</span>
        </div>
      `;
    });

    html += `</div>`;
    dropdown.innerHTML = html;
    dropdown.classList.remove('hidden');
  }

  /**
   * Insere o campo no textarea selecionado substituindo a menção @.
   */
  function insertMentionField(fieldTag, targetId) {
    const textarea = document.getElementById(targetId);
    if (!textarea) return;

    const cursor = textarea.selectionStart !== undefined ? textarea.selectionStart : textarea.value.length;
    const text = textarea.value;

    let startPos = activeMentionState.mentionStartPos;
    if (startPos < 0) {
      const textBefore = text.slice(0, cursor);
      const match = textBefore.match(/@([\w\u00C0-\u017F\s]*)$/);
      startPos = match ? (cursor - match[0].length) : cursor;
    }

    const before = text.slice(0, startPos);
    const after = text.slice(cursor);

    const insertion = fieldTag + ' ';
    textarea.value = before + insertion + after;

    hideMentionMenu();
    textarea.focus();
    const newCursor = startPos + insertion.length;
    textarea.selectionStart = textarea.selectionEnd = newCursor;
  }

  /**
   * Método legado mantido para compatibilidade.
   */
  function insertMsgTag(tag) {
    const target = activeMentionState.targetId ? document.getElementById(activeMentionState.targetId) : (document.getElementById('trig-msg-critico') || document.getElementById('trig-msg'));
    if (!target) return;
    const start = target.selectionStart || target.value.length;
    const end = target.selectionEnd || target.value.length;
    const text = target.value;
    target.value = text.substring(0, start) + tag + text.substring(end);
    target.focus();
    target.selectionStart = target.selectionEnd = start + tag.length;
  }

  /**
   * Disparado quando altera o Tipo de Gatilho.
   */
  function onTriggerTypeChanged() {
    const tipo = document.getElementById('trig-type').value;
    const intervalBox = document.getElementById('trig-box-intervalo');
    const intervalLabel = document.getElementById('trig-intervalo-label');

    if (tipo === 'periodicidade') {
      if (intervalBox) intervalBox.classList.remove('hidden');
      if (intervalLabel) intervalLabel.innerText = 'Ciclo de Periodicidade (a cada)';
    } else if (tipo === 'validade') {
      if (intervalBox) intervalBox.classList.add('hidden');
    } else if (tipo === 'calculado') {
      if (intervalBox) intervalBox.classList.remove('hidden');
      if (intervalLabel) intervalLabel.innerText = 'Ciclo de Periodicidade (a cada)';
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
   * Disparado quando altera o campo de filtro condicional.
   * Se o campo selecionado possuir opções cadastradas (dropdown/select),
   * substitui o input de texto por um <select> com as opções reais para evitar erros de digitação.
   */
  function onFilterFieldChanged(presetValue) {
    const filterFieldSelect = document.getElementById('trig-filter-field');
    const container = document.getElementById('trig-filter-val-container');
    if (!filterFieldSelect || !container) return;

    const selectedFieldId = filterFieldSelect.value;
    const allFields = getAllFieldsFromBuilder();
    const fieldObj = allFields.find(f => f.id === selectedFieldId || f.name === selectedFieldId || f.rawId === selectedFieldId);

    const valToSet = presetValue !== undefined ? presetValue : (document.getElementById('trig-filter-val')?.value || '');

    if (!selectedFieldId) {
      container.innerHTML = `
        <input type="text" id="trig-filter-val" disabled placeholder="(Sem filtro ativo)" class="w-full px-3 py-2 bg-slate-100 dark:bg-slate-800/40 text-slate-400 border border-slate-200 dark:border-slate-700 rounded-lg text-xs cursor-not-allowed">
      `;
      return;
    }

    const options = (fieldObj && Array.isArray(fieldObj.options)) ? fieldObj.options : [];
    if (options.length > 0) {
      // Campo de opções pré-definidas (Select): exibe <select> com as opções cadastradas
      let optionsHtml = '<option value="">Selecione uma opção...</option>';
      options.forEach(opt => {
        const isSelected = String(opt).trim().toLowerCase() === String(valToSet).trim().toLowerCase();
        optionsHtml += `<option value="${escapeHtml(opt)}" ${isSelected ? 'selected' : ''}>${escapeHtml(opt)}</option>`;
      });

      container.innerHTML = `
        <select id="trig-filter-val" class="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-none">
          ${optionsHtml}
        </select>
      `;
    } else {
      // Campo de texto livre ou número
      container.innerHTML = `
        <input type="text" id="trig-filter-val" value="${escapeHtml(valToSet)}" placeholder="Ex: Digite o valor..." class="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-none">
      `;
    }
  }

  /**
   * Salva as configurações do gatilho no formulário ativo.
   */
  function saveTriggerConfig() {
    const name = document.getElementById('trig-name').value.trim();
    if (!name) {
      alert('Por favor, informe o nome do Evento.');
      return;
    }

    const campoData = document.getElementById('trig-field-date').value;
    if (!campoData) {
      alert('Por favor, selecione o Campo de data do formulário que servirá de gatilho.');
      return;
    }

    const dateSelect = document.getElementById('trig-field-date');
    const campoDataLabel = dateSelect.options[dateSelect.selectedIndex] ? dateSelect.options[dateSelect.selectedIndex].text : campoData;

    const tipo = document.getElementById('trig-type').value;
    const intervaloValor = parseInt(document.getElementById('trig-intervalo-val').value, 10) || 6;
    const intervaloUnidade = document.getElementById('trig-intervalo-unit').value || 'meses';
    const avisoPrevioDias = parseInt(document.getElementById('trig-aviso-dias').value, 10) || 15;

    const campoFiltro = document.getElementById('trig-filter-field').value || null;
    const filterSelect = document.getElementById('trig-filter-field');
    const campoFiltroLabel = (filterSelect && filterSelect.options[filterSelect.selectedIndex]) ? filterSelect.options[filterSelect.selectedIndex].text : campoFiltro;
    const filtroOperador = document.getElementById('trig-filter-op').value || '=';
    const filterValEl = document.getElementById('trig-filter-val');
    const filtroValor = (filterValEl && filterValEl.value) ? filterValEl.value.trim() : null;

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

    const sevInput = document.getElementById('trig-severidade');
    const severidade = (sevInput && sevInput.value) || 'atencao';

    // 3 Mensagens Padronizadas / Personalizadas por Situação
    const padraoEmDia = '@Nome está em conformidade com o cronograma regular.';
    const padraoAtencao = 'Atenção: @Nome entrará em período de vencimento em x dias.';
    const padraoCritico = '@Nome atingiu o prazo limite em x dias e requer manutenção/vistoria urgente.';

    const elEmDia = document.getElementById('trig-msg-em-dia');
    const elAtencao = document.getElementById('trig-msg-atencao');
    const elCritico = document.getElementById('trig-msg-critico');

    const msgEmDia = (elEmDia && elEmDia.value.trim()) || padraoEmDia;
    const msgAtencao = (elAtencao && elAtencao.value.trim()) || padraoAtencao;
    const msgCritico = (elCritico && elCritico.value.trim()) || padraoCritico;

    const calcDataOrigem = document.getElementById('trig-calc-origem') ? document.getElementById('trig-calc-origem').value : 'hoje';
    const calcDataDestino = document.getElementById('trig-calc-destino') ? document.getElementById('trig-calc-destino').value : campoData;

    // Sincroniza campo legado se presente
    const elMsgLegacy = document.getElementById('trig-msg');
    if (elMsgLegacy) elMsgLegacy.value = msgCritico;

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
      calc_data_origem: calcDataOrigem,
      calc_data_destino: calcDataDestino,
      campo_filtro: campoFiltro,
      campo_filtro_label: campoFiltroLabel,
      filtro_operador: filtroOperador,
      filtro_valor: filtroValor,
      responsavel_tipo: respTipo,
      responsavel_id: respId,
      responsavel_nome: respNome,
      severidade: severidade,
      mensagem_em_dia: msgEmDia,
      mensagem_atencao: msgAtencao,
      mensagem_critico: msgCritico,
      mensagem: msgCritico,
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

    // Auto-sincroniza com formulário em memória e localStorage se disponível
    try {
      if (global.currentFormId && Array.isArray(global.forms)) {
        const formObj = global.forms.find(f => f.id === global.currentFormId);
        if (formObj) {
          formObj.eventTriggers = global._currentFormEventTriggers;
          if (typeof global.saveFormsToStorage === 'function') {
            global.saveFormsToStorage();
          }
        }
      }
    } catch (eAuto) {
      console.warn('Auto-save trigger to forms storage:', eAuto);
    }

    closeTriggerModal();
    renderEventTriggersBuilder();

    // Notifica toast discreto
    if (typeof global.showStorageToast === 'function') {
      global.showStorageToast(`Gatilho "${name}" salvo! Lembre-se de clicar em "Salvar Formulário" para persistir.`);
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
   * Cria o elemento do modal no DOM se não existir, com disposição em relação vertical (uma informação por linha).
   */
  function createTriggerModalElement() {
    const modal = document.createElement('div');
    modal.id = 'modal-event-trigger';
    modal.className = 'fixed inset-0 bg-black/60 z-[350] flex items-center justify-center backdrop-blur-sm p-3 sm:p-4 hidden';
    modal.innerHTML = `
      <div class="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[94vh] animate-in fade-in zoom-in-95 duration-200">
        
        <!-- Header -->
        <div class="px-5 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/40 shrink-0">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-2xl bg-amber-500/15 text-amber-500 flex items-center justify-center shrink-0 border border-amber-500/20">
              <span class="material-symbols-outlined text-[22px]">notifications_active</span>
            </div>
            <div>
              <h3 class="text-sm sm:text-base font-bold text-slate-900 dark:text-white" id="modal-trigger-title">Novo Gatilho de Monitoramento</h3>
              <p class="text-xs text-slate-500 dark:text-slate-400">Defina regras automáticas de tempo e alertas territoriais</p>
            </div>
          </div>
          
          <!-- Botão Passo a Passo ao lado do botão Fechar (X) -->
          <div class="flex items-center gap-2">
            <button type="button" onclick="EventsBuilder.toggleTutorialGuide()" class="flex items-center gap-1.5 px-3 py-1.5 text-amber-700 dark:text-amber-300 bg-amber-100/90 dark:bg-amber-950/60 hover:bg-amber-200 dark:hover:bg-amber-900/60 rounded-xl text-xs font-bold border border-amber-300/80 dark:border-amber-700/60 transition-all cursor-pointer shadow-2xs" title="Como criar um gatilho de monitoramento (Passo a Passo)">
              <span class="material-symbols-outlined text-[17px] text-amber-600 dark:text-amber-400">lightbulb</span>
              <span class="hidden sm:inline">Passo a Passo</span>
            </button>
            <button type="button" onclick="EventsBuilder.closeTriggerModal()" class="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer" title="Fechar Janela">
              <span class="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
        </div>

        <!-- Guia / Passo a Passo Retrátil -->
        <div id="modal-trigger-tutorial" class="hidden border-b border-amber-200 dark:border-amber-800/60 bg-gradient-to-br from-amber-50/90 via-orange-50/40 to-amber-50/70 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 p-4 sm:p-5 shrink-0 overflow-y-auto max-h-[380px] custom-scrollbar">
          
          <!-- Topo do Guia -->
          <div class="flex items-center justify-between mb-3 border-b border-amber-200/60 dark:border-amber-800/40 pb-2.5">
            <div class="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-bold text-xs uppercase tracking-wider">
              <span class="material-symbols-outlined text-[19px]">menu_book</span>
              <span>Tutorial Completo: Como Configurar o Monitoramento Territorial</span>
            </div>
            <button type="button" onclick="EventsBuilder.toggleTutorialGuide()" class="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-200 hover:underline cursor-pointer">
              <span>Fechar Guia</span>
              <span class="material-symbols-outlined text-[15px]">expand_less</span>
            </button>
          </div>

          <!-- BLOCO 1: Entenda os 3 Tipos de Monitoramento Temporal -->
          <div class="mb-4">
            <h5 class="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide flex items-center gap-1.5 mb-2.5">
              <span class="material-symbols-outlined text-[16px] text-amber-600">tune</span>
              <span>1. Para que serve cada "Tipo de Monitoramento"?</span>
            </h5>
            
            <div class="grid grid-cols-1 md:grid-cols-3 gap-2.5">
              
              <!-- Tipo 1: Periodicidade -->
              <div class="p-3 rounded-2xl bg-white/80 dark:bg-slate-800/80 border border-amber-200/70 dark:border-slate-700 shadow-2xs flex flex-col justify-between">
                <div>
                  <div class="flex items-center gap-1.5 text-xs font-bold text-sky-700 dark:text-sky-300 mb-1">
                    <span class="material-symbols-outlined text-[16px]">autorenew</span>
                    <span>Periodicidade / Recorrência</span>
                  </div>
                  <p class="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed mb-2">
                    Para manutenções contínuas e vistorias que devem se <b>repetir ciclicamente</b> (a cada X meses ou dias).
                  </p>
                  <div class="text-[10.5px] bg-sky-50 dark:bg-sky-950/40 p-2 rounded-xl text-sky-900 dark:text-sky-200 border border-sky-100 dark:border-sky-900/50 space-y-1">
                    <div><b>Cálculo:</b> Data do Último Registro + Ciclo</div>
                    <div><b>Exemplos:</b> Manutenção de asfalto a cada 6 meses, vistoria de pontes a cada 1 ano, limpeza de bueiros a cada 90 dias.</div>
                  </div>
                </div>
              </div>

              <!-- Tipo 2: Vencimento Direto -->
              <div class="p-3 rounded-2xl bg-white/80 dark:bg-slate-800/80 border border-amber-200/70 dark:border-slate-700 shadow-2xs flex flex-col justify-between">
                <div>
                  <div class="flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-300 mb-1">
                    <span class="material-symbols-outlined text-[16px]">event_available</span>
                    <span>Vencimento Direto</span>
                  </div>
                  <p class="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed mb-2">
                    Quando o formulário <b>já possui a data final exata</b> em que o documento, alvará ou licença expira.
                  </p>
                  <div class="text-[10.5px] bg-emerald-50 dark:bg-emerald-950/40 p-2 rounded-xl text-emerald-900 dark:text-emerald-200 border border-emerald-100 dark:border-emerald-900/50 space-y-1">
                    <div><b>Cálculo:</b> Compara a data de hoje diretamente com o campo de validade. Não soma prazos.</div>
                    <div><b>Exemplos:</b> Validade do Alvará (ex: 31/12/2026), Licença Ambiental, Permissão de Uso de Quiosque.</div>
                  </div>
                </div>
              </div>

              <!-- Tipo 3: Validade Calculada -->
              <div class="p-3 rounded-2xl bg-white/80 dark:bg-slate-800/80 border border-amber-200/70 dark:border-slate-700 shadow-2xs flex flex-col justify-between">
                <div>
                  <div class="flex items-center gap-1.5 text-xs font-bold text-purple-700 dark:text-purple-300 mb-1">
                    <span class="material-symbols-outlined text-[16px]">calculate</span>
                    <span>Validade Calculada</span>
                  </div>
                  <p class="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed mb-2">
                    Para prazos legais ou processuais contados a partir de um <b>ato inicial</b> (notificação, lavratura ou emissão).
                  </p>
                  <div class="text-[10.5px] bg-purple-50 dark:bg-purple-950/40 p-2 rounded-xl text-purple-900 dark:text-purple-200 border border-purple-100 dark:border-purple-900/50 space-y-1">
                    <div><b>Cálculo:</b> Data de Emissão + Prazo Legal</div>
                    <div><b>Exemplos:</b> Notificação de Obra com 15 dias para embargo, Auto de Infração com 30 dias para defesa.</div>
                  </div>
                </div>
              </div>

            </div>
          </div>

          <!-- BLOCO 2: Exemplo Prático Passo a Passo (Vias de Asfalto com mais de 6 meses) -->
          <div class="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xs">
            <h5 class="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wide flex items-center gap-1.5 mb-2.5">
              <span class="material-symbols-outlined text-[17px] text-amber-500 dark:text-amber-400">lightbulb</span>
              <span>2. Exemplo Prático: Monitorar Vias com Classificação "Asfalto" e +6 Meses sem Manutenção</span>
            </h5>
            
            <div class="space-y-2 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80">
                  <span class="font-bold text-slate-900 dark:text-white">1. Evento:</span>
                  <div class="text-[11.5px] text-slate-600 dark:text-slate-300">Informe um nome descritivo: <i>"Manutenção Semestral de Vias Asfálticas"</i>.</div>
                </div>
                <div class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80">
                  <span class="font-bold text-slate-900 dark:text-white">2. Campo:</span>
                  <div class="text-[11.5px] text-slate-600 dark:text-slate-300">Selecione o campo: <i>"[Infraestrutura] Data da última manutenção"</i>.</div>
                </div>
                <div class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80">
                  <span class="font-bold text-slate-900 dark:text-white">3. Tipo de Monitoramento:</span>
                  <div class="text-[11.5px] text-slate-600 dark:text-slate-300">Escolha <b>Periodicidade / Recorrência (a cada X meses/dias)</b>.</div>
                </div>
                <div class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80">
                  <span class="font-bold text-slate-900 dark:text-white">4. Ciclo & Aviso Prévio:</span>
                  <div class="text-[11.5px] text-slate-600 dark:text-slate-300">Ciclo: <b>6 Meses</b> | Aviso Prévio: <b>15 Dias</b> (para alertar em amarelo antes de vencer).</div>
                </div>
              </div>

              <!-- 5. Condição Adicional de Filtro: Fundo e tipografia perfeitamente legíveis -->
              <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 text-[11.5px]">
                <strong class="text-slate-900 dark:text-white flex items-center gap-1.5 mb-1.5 text-xs">
                  <span class="material-symbols-outlined text-[16px] text-amber-500 dark:text-amber-400">filter_alt</span>
                  <span>5. Condição Adicional de Filtro (Sem erro de digitação):</span>
                </strong>
                <p class="text-slate-600 dark:text-slate-300">
                  Selecione o campo <b class="text-slate-900 dark:text-white">"[Infraestrutura] Classificação da via"</b>, operador <b class="text-slate-900 dark:text-white">"Igual a (=)"</b> e no campo de valor selecione <b class="text-amber-600 dark:text-amber-400">"Asfalto" diretamente na lista de opções</b> gerada automaticamente pelo sistema!
                </p>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-[11px]">
                <div class="flex items-center gap-1.5 p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/60">
                  <span class="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
                  <span><b>🟢 Em Dia:</b> Menos de 5 meses e meio</span>
                </div>
                <div class="flex items-center gap-1.5 p-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/60">
                  <span class="w-2 h-2 rounded-full bg-amber-500 shrink-0"></span>
                  <span><b>🟡 Atenção:</b> Faltando ≤ 15 dias</span>
                </div>
                <div class="flex items-center gap-1.5 p-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-300 border border-rose-200/80 dark:border-rose-800/60">
                  <span class="w-2 h-2 rounded-full bg-rose-500 shrink-0"></span>
                  <span><b>🔴 Crítico:</b> Passou de 6 meses (+180 dias)</span>
                </div>
              </div>
            </div>
          </div>

          <!-- BLOCO 3: Explicação Completa de Mensagens Personalizadas por Situação -->
          <div class="mt-3 p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xs">
            <h5 class="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wide flex items-center gap-1.5 mb-2.5">
              <span class="material-symbols-outlined text-[17px] text-amber-500 dark:text-amber-400">campaign</span>
              <span>3. Como Funcionam as 3 Mensagens do Alerta e a Busca com @?</span>
            </h5>
            
            <p class="text-[11.5px] text-slate-600 dark:text-slate-300 mb-3 leading-relaxed">
              O sistema pré-preenche automaticamente <b>3 comunicados oficiais</b> para cada estágio de monitoramento da via ou feição. Você pode manter o texto padrão ou personalizar digitando <code class="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/50 text-amber-900 dark:text-amber-200 font-mono text-[11px] font-bold">@</code> para selecionar qualquer campo cadastral:
            </p>

            <div class="space-y-2 mb-3">
              <!-- Em Dia -->
              <div class="p-2.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/60">
                <div class="flex items-center justify-between text-xs font-bold text-emerald-800 dark:text-emerald-300 mb-1">
                  <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> 🟢 Em Dia (Status Regular)</span>
                  <span class="text-[10px] font-normal text-emerald-700 dark:text-emerald-400">Dentro do cronograma</span>
                </div>
                <div class="text-[11px] text-slate-700 dark:text-slate-300 font-mono bg-white/70 dark:bg-slate-900/60 p-1.5 rounded-lg border border-emerald-100 dark:border-emerald-900/40">
                  "@Nome está em conformidade com o cronograma regular."
                </div>
              </div>

              <!-- Atenção -->
              <div class="p-2.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/60">
                <div class="flex items-center justify-between text-xs font-bold text-amber-800 dark:text-amber-300 mb-1">
                  <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-amber-500"></span> 🟡 Atenção (Aviso Prévio)</span>
                  <span class="text-[10px] font-normal text-amber-700 dark:text-amber-400">Faltando ≤ dias configurados</span>
                </div>
                <div class="text-[11px] text-slate-700 dark:text-slate-300 font-mono bg-white/70 dark:bg-slate-900/60 p-1.5 rounded-lg border border-amber-100 dark:border-amber-900/40">
                  "Atenção: @Nome entrará em período de vencimento em x dias."
                </div>
              </div>

              <!-- Crítico -->
              <div class="p-2.5 rounded-xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200/80 dark:border-rose-800/60">
                <div class="flex items-center justify-between text-xs font-bold text-rose-800 dark:text-rose-300 mb-1">
                  <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-rose-500"></span> 🔴 Crítico (Atrasado / Vencido)</span>
                  <span class="text-[10px] font-normal text-rose-700 dark:text-rose-400">Prazo ultrapassado</span>
                </div>
                <div class="text-[11px] text-slate-700 dark:text-slate-300 font-mono bg-white/70 dark:bg-slate-900/60 p-1.5 rounded-lg border border-rose-100 dark:border-rose-900/40">
                  "@Nome atingiu o prazo limite em x dias e requer manutenção/vistoria urgente."
                </div>
              </div>
            </div>

            <!-- Destaque Didático: Diferença entre @dias_prazo e @dias_decorridos -->
            <div class="p-3.5 rounded-2xl bg-amber-50/80 dark:bg-amber-950/40 border border-amber-300/80 dark:border-amber-800/80 mb-3 space-y-2.5">
              <div class="font-bold text-xs text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                <span class="material-symbols-outlined text-[17px] text-amber-600 dark:text-amber-400">help</span>
                <span>Qual a diferença exata entre @dias_prazo e @dias_decorridos?</span>
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                <div class="p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-amber-200/80 dark:border-slate-700 space-y-1">
                  <div class="font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1">
                    <span class="font-mono bg-amber-100 dark:bg-amber-900/60 px-1.5 py-0.5 rounded text-[10.5px]">@dias_prazo</span>
                    <span>Prazo do Evento</span>
                  </div>
                  <p class="text-slate-600 dark:text-slate-300 leading-relaxed">
                    Mostra os <b>dias que faltam para o evento vencer</b> (ou dias de atraso se a data programada já expirou).
                  </p>
                  <div class="text-[10px] text-slate-500 dark:text-slate-400 font-mono bg-slate-50 dark:bg-slate-900 p-1 rounded">
                    Ex: "Evento vence em <b>2</b> dias" ou "Venceu há <b>89</b> dias".
                  </div>
                </div>

                <div class="p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-amber-200/80 dark:border-slate-700 space-y-1">
                  <div class="font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1">
                    <span class="font-mono bg-emerald-100 dark:bg-emerald-900/60 px-1.5 py-0.5 rounded text-[10.5px]">@dias_decorridos</span>
                    <span>Tempo Real Passado</span>
                  </div>
                  <p class="text-slate-600 dark:text-slate-300 leading-relaxed">
                    Mostra os <b>dias reais corridos desde a data cadastrada</b> (ex: Data Atual menos Data da Última Vistoria).
                  </p>
                  <div class="text-[10px] text-slate-500 dark:text-slate-400 font-mono bg-slate-50 dark:bg-slate-900 p-1 rounded">
                    Ex: "Última vistoria realizada há <b>181</b> dias".
                  </div>
                </div>
              </div>
            </div>

            <!-- Dicas de Autocomplete e Cálculo de Tempo -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-600 dark:text-slate-300 mb-3">
              <div class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 space-y-1">
                <div class="font-bold text-slate-900 dark:text-white flex items-center gap-1">
                  <span class="material-symbols-outlined text-[15px] text-amber-500">alternate_email</span>
                  <span>Busca Rápida com @:</span>
                </div>
                <p>Digite <code class="px-1 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-amber-700 dark:text-amber-300 font-mono text-[10.5px]">@</code> em qualquer mensagem para autocompletar qualquer campo do formulário (ex: <i>@Nome, @data_limite, @dias_prazo, @dias_decorridos</i>).</p>
              </div>

              <div class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 space-y-1">
                <div class="font-bold text-slate-900 dark:text-white flex items-center gap-1">
                  <span class="material-symbols-outlined text-[15px] text-sky-500">schedule</span>
                  <span>Cálculo Automático de Tempo:</span>
                </div>
                <p>O termo <code class="px-1 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-amber-700 dark:text-amber-300 font-mono text-[10.5px]">x dias</code> é calculado dinamicamente pelo sistema (ex: <i>"em 5 dias"</i>, <i>"há 3 meses (89 dias)"</i> ou <i>"hoje"</i>).</p>
              </div>
            </div>

            <div class="mt-3 flex justify-end">
              <button type="button" onclick="EventsBuilder.toggleTutorialGuide()" class="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer">
                Entendi, voltar ao formulário
              </button>
            </div>
          </div>

        </div>

        <!-- Body Scrollável: Cada informação em uma linha vertical independente (Relação de 1 a 8) -->
        <div class="p-5 sm:p-6 overflow-y-auto space-y-4 flex-1 custom-scrollbar">

          <!-- 1ª Linha: Evento -->
          <div>
            <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Evento *</label>
            <input type="text" id="trig-name" class="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-none" placeholder="Ex: Manutenção Preventiva Semestral, Vencimento de Alvará, Renovação de Licença...">
          </div>

          <!-- 2ª Linha: Campo -->
          <div>
            <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Campo *</label>
            <select id="trig-field-date" class="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-none">
              <!-- Populado dinamicamente -->
            </select>
          </div>

          <!-- 3ª Linha: Tipo de Monitoramento -->
          <div>
            <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Tipo de Monitoramento</label>
            <select id="trig-type" onchange="EventsBuilder.onTriggerTypeChanged()" class="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-none">
              <option value="periodicidade">Periodicidade / Recorrência (a cada X meses/dias)</option>
              <option value="validade">Data de Validade / Vencimento Direto</option>
              <option value="calculado">Validade Calculada (Data Base + Prazo)</option>
            </select>
          </div>

          <!-- 4ª Linha: Ciclo de Periodicidade (a cada) -->
          <div id="trig-box-intervalo">
            <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1" id="trig-intervalo-label">Ciclo de Periodicidade (a cada)</label>
            <div class="flex gap-2">
              <input type="number" id="trig-intervalo-val" min="1" value="6" class="w-28 px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-none">
              <select id="trig-intervalo-unit" class="flex-1 px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-none">
                <option value="meses">Meses</option>
                <option value="dias">Dias</option>
                <option value="anos">Anos</option>
              </select>
            </div>
          </div>

          <!-- 5ª Linha: Aviso Prévio (Antecedência em dias) -->
          <div>
            <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Aviso Prévio (Antecedência em dias)</label>
            <input type="number" id="trig-aviso-dias" min="0" value="15" class="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-none" placeholder="Ex: 15 dias antes">
          </div>

          <!-- 6ª Linha: Cálculo de Diferença entre Datas (Tempo Decorrido) -->
          <div>
            <div class="flex items-center justify-between mb-1">
              <label class="block text-xs font-bold text-slate-700 dark:text-slate-300">
                Cálculo de Diferença entre Datas (Tempo Decorrido)
              </label>
              <span class="text-[10.5px] text-amber-600 dark:text-amber-400 font-semibold font-mono">Gera @dias_decorridos</span>
            </div>
            <div class="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 rounded-2xl space-y-2.5">
              <p class="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                Configure os dois campos de data para o sistema calcular os dias reais corridos entre eles (ex: dias passados desde a última vistoria até a data atual):
              </p>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label class="block text-[10.5px] font-semibold text-slate-600 dark:text-slate-300 mb-1">Data de Referência (De):</label>
                  <select id="trig-calc-origem" onchange="EventsBuilder.updateDateCalcPreview()" class="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-none">
                    <option value="hoje">Data Atual (Hoje)</option>
                  </select>
                </div>
                <div>
                  <label class="block text-[10.5px] font-semibold text-slate-600 dark:text-slate-300 mb-1">Menos (-) Data Cadastrada:</label>
                  <select id="trig-calc-destino" onchange="EventsBuilder.updateDateCalcPreview()" class="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-none">
                    <!-- Populado dinamicamente -->
                  </select>
                </div>
              </div>
              <div id="trig-calc-preview-box" class="p-2.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/60 text-[11px] text-amber-900 dark:text-amber-200 flex items-center justify-between">
                <span id="trig-calc-preview-text">💡 Cálculo: Data Atual (Hoje) menos Data selecionada</span>
                <span class="font-mono font-bold text-[10.5px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200">@dias_decorridos</span>
              </div>
            </div>
          </div>

          <!-- 6ª Linha: Condição Adicional de Filtro (Opcional) -->
          <div>
            <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Condição Adicional de Filtro (Opcional)</label>
            <div class="p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 rounded-xl space-y-2">
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <select id="trig-filter-field" onchange="EventsBuilder.onFilterFieldChanged()" class="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-none">
                  <!-- Populado dinamicamente -->
                </select>
                <select id="trig-filter-op" class="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-none">
                  <option value="=">Igual a (=)</option>
                  <option value="!=">Diferente de (!=)</option>
                  <option value="contem">Contém</option>
                  <option value="nao_contem">Não Contém</option>
                </select>
                <div id="trig-filter-val-container">
                  <input type="text" id="trig-filter-val" placeholder="Ex: Asfalto" class="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-none">
                </div>
              </div>
            </div>
          </div>

          <!-- 7ª Linha: Atribuir Responsável -->
          <div>
            <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Atribuir Responsável</label>
            <div class="space-y-2">
              <select id="trig-resp-tipo" onchange="EventsBuilder.onRespTipoChanged()" class="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-none">
                <option value="todos">Todos os Operadores / Geral</option>
                <option value="usuario">Usuário Específico da Equipe</option>
                <option value="setor">Setor / Órgão Responsável</option>
                <option value="criador">Criador do Registro (Técnico que cadastrou a feição)</option>
              </select>

              <div id="trig-box-resp-select" class="hidden">
                <select id="trig-resp-id" class="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white">
                  <!-- Populado dinamicamente com usuários agrupados por unidade -->
                </select>
              </div>

              <div id="trig-box-resp-setor" class="hidden">
                <input type="text" id="trig-resp-setor-val" placeholder="Nome do Setor (ex: Fiscalização, Obras, Tributário, Meio Ambiente)" class="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white">
              </div>
            </div>
          </div>

          <!-- 8ª Linha: Nível de Severidade (Visual explicativo com as 3 faixas de cálculo dinâmico) -->
          <div>
            <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Nível de Severidade</label>
            <div class="p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl space-y-2">
              <p class="text-[11px] text-slate-500 dark:text-slate-400 font-medium">O sistema calcula automaticamente o status de cada feição conforme a contagem regressiva de dias:</p>
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div class="flex items-center gap-2 p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300">
                  <span class="w-3 h-3 rounded-full bg-emerald-500 shrink-0"></span>
                  <div>
                    <div class="font-bold text-xs">🟢 Em Dia</div>
                    <div class="text-[10px] opacity-80">Prazo regular / cronograma OK</div>
                  </div>
                </div>
                <div class="flex items-center gap-2 p-2 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300">
                  <span class="w-3 h-3 rounded-full bg-amber-500 shrink-0"></span>
                  <div>
                    <div class="font-bold text-xs">🟡 Atenção</div>
                    <div class="text-[10px] opacity-80">Faltam ≤ dias do Aviso Prévio</div>
                  </div>
                </div>
                <div class="flex items-center gap-2 p-2 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300">
                  <span class="w-3 h-3 rounded-full bg-rose-500 shrink-0"></span>
                  <div>
                    <div class="font-bold text-xs">🔴 Crítico</div>
                    <div class="text-[10px] opacity-80">Prazo vencido / atrasado</div>
                  </div>
                </div>
              </div>
              <input type="hidden" id="trig-severidade" value="atencao">
            </div>
          </div>

          <!-- Mensagens Personalizadas do Alerta por Situação -->
          <div class="space-y-3 pt-1">
            <div class="flex justify-between items-baseline mb-0.5">
              <label class="block text-xs font-bold text-slate-800 dark:text-slate-200">
                Mensagens do Alerta por Situação
              </label>
              <span class="text-[11px] text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1">
                <span class="material-symbols-outlined text-[13px]">alternate_email</span>
                <span>Digite @ para buscar campos</span>
              </span>
            </div>
            <p class="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              O sistema pré-configura as 3 mensagens abaixo. Você pode ajustar os textos livremente ou clicar em <b>@ Inserir Campo</b> para autocompletar qualquer dado cadastral da feição:
            </p>

            <!-- 1. Em Dia (Status Regular) -->
            <div class="p-3 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/60 space-y-2 transition-all shadow-2xs">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span class="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0"></span>
                  <div>
                    <span class="font-bold text-xs text-emerald-800 dark:text-emerald-300">🟢 Em Dia (Status Regular)</span>
                    <span class="hidden sm:inline text-[10.5px] text-emerald-600/80 dark:text-emerald-400/80 ml-1.5">• Dentro do cronograma</span>
                  </div>
                </div>
                <button type="button" onclick="EventsBuilder.openMentionMenu('trig-msg-em-dia')" class="flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded-lg bg-emerald-100/90 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 hover:bg-emerald-200 dark:hover:bg-emerald-800 transition-colors cursor-pointer border border-emerald-300/60 dark:border-emerald-700/60 shadow-2xs" title="Inserir campo cadastral usando @">
                  <span class="material-symbols-outlined text-[13px]">alternate_email</span>
                  <span>Inserir Campo</span>
                </button>
              </div>
              <textarea id="trig-msg-em-dia" rows="2" oninput="EventsBuilder.handleMentionInput(event, 'trig-msg-em-dia')" onkeydown="EventsBuilder.handleMentionKeyDown(event, 'trig-msg-em-dia')" class="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:outline-none placeholder-slate-400" placeholder="@Nome está em conformidade com o cronograma regular."></textarea>
            </div>

            <!-- 2. Atenção (Aviso Prévio) -->
            <div class="p-3 rounded-2xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/60 space-y-2 transition-all shadow-2xs">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span class="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0"></span>
                  <div>
                    <span class="font-bold text-xs text-amber-800 dark:text-amber-300">🟡 Atenção (Aviso Prévio)</span>
                    <span class="hidden sm:inline text-[10.5px] text-amber-600/80 dark:text-amber-400/80 ml-1.5">• Faltando ≤ dias do aviso</span>
                  </div>
                </div>
                <button type="button" onclick="EventsBuilder.openMentionMenu('trig-msg-atencao')" class="flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded-lg bg-amber-100/90 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200 hover:bg-amber-200 dark:hover:bg-amber-800 transition-colors cursor-pointer border border-amber-300/60 dark:border-amber-700/60 shadow-2xs" title="Inserir campo cadastral usando @">
                  <span class="material-symbols-outlined text-[13px]">alternate_email</span>
                  <span>Inserir Campo</span>
                </button>
              </div>
              <textarea id="trig-msg-atencao" rows="2" oninput="EventsBuilder.handleMentionInput(event, 'trig-msg-atencao')" onkeydown="EventsBuilder.handleMentionKeyDown(event, 'trig-msg-atencao')" class="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-none placeholder-slate-400" placeholder="Atenção: @Nome entrará em período de vencimento em x dias."></textarea>
            </div>

            <!-- 3. Crítico (Atrasado / Vencido) -->
            <div class="p-3 rounded-2xl bg-rose-50/60 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800/60 space-y-2 transition-all shadow-2xs">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span class="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0"></span>
                  <div>
                    <span class="font-bold text-xs text-rose-800 dark:text-rose-300">🔴 Crítico (Atrasado / Vencido)</span>
                    <span class="hidden sm:inline text-[10.5px] text-rose-600/80 dark:text-rose-400/80 ml-1.5">• Prazo limite ultrapassado</span>
                  </div>
                </div>
                <button type="button" onclick="EventsBuilder.openMentionMenu('trig-msg-critico')" class="flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded-lg bg-rose-100/90 dark:bg-rose-900/60 text-rose-800 dark:text-rose-200 hover:bg-rose-200 dark:hover:bg-rose-800 transition-colors cursor-pointer border border-rose-300/60 dark:border-rose-700/60 shadow-2xs" title="Inserir campo cadastral usando @">
                  <span class="material-symbols-outlined text-[13px]">alternate_email</span>
                  <span>Inserir Campo</span>
                </button>
              </div>
              <textarea id="trig-msg-critico" rows="2" oninput="EventsBuilder.handleMentionInput(event, 'trig-msg-critico')" onkeydown="EventsBuilder.handleMentionKeyDown(event, 'trig-msg-critico')" class="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-800 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-rose-500 focus:outline-none placeholder-slate-400" placeholder="@Nome atingiu o prazo limite em x dias e requer manutenção/vistoria urgente."></textarea>
            </div>

            <!-- Legenda Explicativa Inferior -->
            <div class="p-2.5 rounded-xl bg-slate-100/80 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-[11px] text-slate-600 dark:text-slate-300 flex items-center gap-2">
              <span class="material-symbols-outlined text-[16px] text-amber-500 shrink-0">auto_awesome</span>
              <span>Use <b>@dias_prazo</b> para os dias do prazo de vencimento (faltando ou atrasado) e <b>@dias_decorridos</b> para os dias reais passados desde a data cadastrada.</span>
            </div>

            <input type="hidden" id="trig-msg" value="">
          </div>

        </div>

        <!-- Footer -->
        <div class="px-5 sm:px-6 py-4 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-3 bg-slate-50 dark:bg-slate-950/40 shrink-0">
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
    onRespTipoChanged,
    toggleTutorialGuide,
    onFilterFieldChanged,
    updateDateCalcPreview,
    openMentionMenu,
    hideMentionMenu,
    handleMentionInput,
    handleMentionKeyDown,
    insertMentionField
  };

  global.EventsBuilder = EventsBuilder;

})(typeof window !== 'undefined' ? window : this);
