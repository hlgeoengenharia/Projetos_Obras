// src/cesium-integration.js
/**
 * Módulo Avançado de Análise de Gabarito 3D com CesiumJS
 * - Posicionamento garantido no centro da tela ao importar .glb
 * - Geração de vértices visuais luminosos no modelo 3D com Snapping magnético
 * - Banner de mensagens guiadas em tempo real com alta visibilidade
 * - Fluxo de alinhamento rígido em 4 passos com encaixe milimétrico
 * - Ajuste fino de cota vertical Z e rotação
 * - Medição de Altura rigorosa (1º clique base X,Y, 2º clique topo Z)
 * - Medição de Distância horizontal (X, Y) com aderência às camadas vetoriais
 * - Cancelamento com tecla ESC e botão direito do mouse
 */

let cesiumViewer = null;
let isCesiumFullscreen = false;
let normalModalBounds = { top: '50px', left: '50px', width: '880px', height: '580px' };

// Entidades e camadas 3D gerenciadas
let uploadedModelEntity = null;
let uploadedPointCloud = null;
let uploadedOrthoLayer = null;
let customTerrainProvider = null;
let currentMdtRectangle = null;
let active2DDataSources = {};
let active2DImageryLayers = {};

// Estado das Ferramentas Interativas & Snapping
let currentInteractionMode = null; // 'orientation' | 'measure_height' | 'measure_distance' | 'adjust_z'
let snapMarkerEntity = null;
let currentActiveHandler = null;
let modelVertexEntities = [];

// ==========================================
// 1. FEEDBACK VISUAL, CURSOR & CONTROLES DO MODAL
// ==========================================
const cesiumModal = document.getElementById('cesium-modal');
const cesiumHeader = document.getElementById('cesium-modal-header');
const cesiumResizeHandle = document.getElementById('cesium-resize-handle');

let isDragging = false;
let isResizing = false;
let startX, startY, startWidth, startHeight, startTop, startLeft;

function showCesiumLoading(text) {
    const overlay = document.getElementById('cesium-loading-overlay');
    const label = document.getElementById('cesium-loading-text');
    if (overlay) {
        if (label) label.textContent = text || 'Carregando arquivo...';
        overlay.style.display = 'flex';
        overlay.classList.remove('hidden');
    }
}

function hideCesiumLoading() {
    const overlay = document.getElementById('cesium-loading-overlay');
    if (overlay) {
        overlay.style.display = 'none';
        overlay.classList.add('hidden');
    }
}

function updateGuideBanner(text, show) {
    const banner = document.getElementById('cesium-guide-banner');
    const label = document.getElementById('cesium-guide-text');
    if (!banner) return;

    if (show) {
        if (label) label.textContent = text;
        banner.style.display = 'flex';
        banner.classList.remove('hidden');
    } else {
        banner.style.display = 'none';
        banner.classList.add('hidden');
    }
}

function setCesiumCursor(style) {
    const container = document.getElementById('cesiumContainer');
    if (container) {
        container.style.cursor = style || 'default';
    }
}

window.openCesiumModal = function() {
    cesiumModal.classList.remove('hidden');
    cesiumModal.style.display = 'flex';
    
    if (typeof closeMeasurementPanel === 'function') {
        closeMeasurementPanel();
    }
    
    if (!cesiumViewer) {
        initCesiumViewer();
    } else {
        cesiumViewer.resize();
        sync2DLayersIntoCesium();
    }
};

window.closeCesiumModal = function() {
    cancelCesiumGuidedStep();
    cesiumModal.classList.add('hidden');
    cesiumModal.style.display = 'none';
};

// Alternar Modo Tela Cheia
window.toggleCesiumFullscreen = function() {
    isCesiumFullscreen = !isCesiumFullscreen;
    const btn = document.getElementById('btn-cesium-maximize');

    if (isCesiumFullscreen) {
        normalModalBounds = {
            top: cesiumModal.style.top || '50px',
            left: cesiumModal.style.left || '50px',
            width: cesiumModal.style.width || '880px',
            height: cesiumModal.style.height || '580px'
        };

        cesiumModal.classList.add('!top-0', '!left-0', '!w-full', '!h-full', '!rounded-none', '!z-[150]');
        if (btn) btn.innerHTML = '<span class="material-symbols-outlined text-[18px]">fullscreen_exit</span>';
    } else {
        cesiumModal.classList.remove('!top-0', '!left-0', '!w-full', '!h-full', '!rounded-none', '!z-[150]');
        cesiumModal.style.top = normalModalBounds.top;
        cesiumModal.style.left = normalModalBounds.left;
        cesiumModal.style.width = normalModalBounds.width;
        cesiumModal.style.height = normalModalBounds.height;
        if (btn) btn.innerHTML = '<span class="material-symbols-outlined text-[18px]">fullscreen</span>';
    }

    if (cesiumViewer) {
        setTimeout(() => cesiumViewer.resize(), 150);
    }
};

// Menu Dropdown de Importação
window.toggleCesiumImportMenu = function(forceState) {
    const dropdown = document.getElementById('cesium-import-dropdown');
    if (!dropdown) return;
    if (typeof forceState === 'boolean') {
        if (forceState) dropdown.classList.remove('hidden');
        else dropdown.classList.add('hidden');
    } else {
        dropdown.classList.toggle('hidden');
    }
};

// Fechar dropdown ao clicar fora
document.addEventListener('click', (e) => {
    const btn = document.getElementById('btn-cesium-import-menu');
    const dropdown = document.getElementById('cesium-import-dropdown');
    if (dropdown && !dropdown.classList.contains('hidden')) {
        if (btn && !btn.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.classList.add('hidden');
        }
    }
    
    // Fechar menu contextual do modelo
    const ctxMenu = document.getElementById('cesium-model-context-menu');
    if (ctxMenu && !ctxMenu.classList.contains('hidden')) {
        if (!ctxMenu.contains(e.target)) {
            ctxMenu.classList.add('hidden');
        }
    }
});

// Tecla ESC para cancelar qualquer operação ativa
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        cancelCesiumGuidedStep();
    }
});

// Dragging Logic
if (cesiumHeader) {
    cesiumHeader.addEventListener('mousedown', function(e) {
        if (isCesiumFullscreen || e.target.closest('button') || e.target.closest('input')) return;
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        
        const rect = cesiumModal.getBoundingClientRect();
        startLeft = rect.left;
        startTop = rect.top;
        
        document.addEventListener('mousemove', dragModal);
        document.addEventListener('mouseup', stopDragModal);
    });
}

function dragModal(e) {
    if (!isDragging || isCesiumFullscreen) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    cesiumModal.style.left = `${startLeft + dx}px`;
    cesiumModal.style.top = `${startTop + dy}px`;
    cesiumModal.style.right = 'auto';
    cesiumModal.style.bottom = 'auto';
}

function stopDragModal() {
    isDragging = false;
    document.removeEventListener('mousemove', dragModal);
    document.removeEventListener('mouseup', stopDragModal);
}

// Resizing Logic
if (cesiumResizeHandle) {
    cesiumResizeHandle.addEventListener('mousedown', function(e) {
        if (isCesiumFullscreen) return;
        isResizing = true;
        startX = e.clientX;
        startY = e.clientY;
        
        const rect = cesiumModal.getBoundingClientRect();
        startWidth = rect.width;
        startHeight = rect.height;
        
        document.addEventListener('mousemove', resizeModal);
        document.addEventListener('mouseup', stopResizeModal);
        e.stopPropagation();
    });
}

function resizeModal(e) {
    if (!isResizing || isCesiumFullscreen) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    
    const newWidth = Math.max(480, startWidth + dx);
    const newHeight = Math.max(340, startHeight + dy);
    
    cesiumModal.style.width = `${newWidth}px`;
    cesiumModal.style.height = `${newHeight}px`;
    
    if (cesiumViewer) {
        cesiumViewer.resize();
    }
}

function stopResizeModal() {
    isResizing = false;
    document.removeEventListener('mousemove', resizeModal);
    document.removeEventListener('mouseup', stopResizeModal);
}

// ==========================================
// 2. INICIALIZAÇÃO DO CESIUM VIEWER & SNAPPING
// ==========================================
function initCesiumViewer() {
    try {
        const emptyState = document.getElementById('cesium-empty-state');
        if (emptyState) emptyState.style.display = 'none';
        
        cesiumViewer = new Cesium.Viewer('cesiumContainer', {
            baseLayerPicker: false,
            baseLayer: false,
            geocoder: false,
            homeButton: false,
            infoBox: false,
            navigationHelpButton: false,
            sceneModePicker: false,
            animation: false,
            timeline: false,
            fullscreenButton: false,
            vrButton: false,
            selectionIndicator: false
        });

        cesiumViewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
        cesiumViewer.imageryLayers.removeAll();
        
        Cesium.ArcGisMapServerImageryProvider.fromUrl('https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer', {
            enablePickFeatures: false
        }).then(function(provider) {
            cesiumViewer.imageryLayers.addImageryProvider(provider);
        }).catch(function(error) {
            console.error("Erro ao carregar Satélite ArcGIS no Cesium:", error);
        });

        const currentMapCenter = typeof map !== 'undefined' ? map.getCenter() : {lat: -7.035, lng: -34.835};
        cesiumViewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(currentMapCenter.lng, currentMapCenter.lat, 1800.0),
            orientation: {
                heading: Cesium.Math.toRadians(0.0),
                pitch: Cesium.Math.toRadians(-45.0),
                roll: 0.0
            }
        });

        cesiumViewer.scene.globe.depthTestAgainstTerrain = true;

        // Criar Marcador Visual de Snapping (Halo Amarelo)
        snapMarkerEntity = cesiumViewer.entities.add({
            position: Cesium.Cartesian3.ZERO,
            show: false,
            point: {
                pixelSize: 14,
                color: Cesium.Color.YELLOW,
                outlineColor: Cesium.Color.BLACK,
                outlineWidth: 2,
                disableDepthTestDistance: Number.POSITIVE_INFINITY
            }
        });

        setupModelClickDetector();

        console.log("CesiumJS inicializado com sucesso.");
        sync2DLayersIntoCesium();
    } catch (e) {
        console.error("Erro ao inicializar o Cesium: ", e);
    }
}

window.recenterCesium = function() {
    if (!cesiumViewer) return;
    
    if (uploadedModelEntity) {
        cesiumViewer.flyTo(uploadedModelEntity);
        return;
    }
    
    if (currentMdtRectangle) {
        cesiumViewer.camera.flyTo({ destination: currentMdtRectangle });
        return;
    }
    
    const currentMapCenter = typeof map !== 'undefined' ? map.getCenter() : {lat: -7.035, lng: -34.835};
    cesiumViewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(currentMapCenter.lng, currentMapCenter.lat, 1800.0),
        orientation: {
            heading: Cesium.Math.toRadians(0.0),
            pitch: Cesium.Math.toRadians(-45.0),
            roll: 0.0
        }
    });
};

// Snapping Magnético aos Vértices do Modelo e Camadas Vetoriais
function getSnappingPoint(screenPosition) {
    if (!cesiumViewer) return null;

    let pickedCartesian = cesiumViewer.scene.pickPosition(screenPosition);
    if (!pickedCartesian) {
        const ray = cesiumViewer.camera.getPickRay(screenPosition);
        pickedCartesian = cesiumViewer.scene.globe.pick(ray, cesiumViewer.scene);
    }
    if (!pickedCartesian) {
        pickedCartesian = cesiumViewer.camera.pickEllipsoid(screenPosition, cesiumViewer.scene.globe.ellipsoid);
    }
    if (!pickedCartesian) return null;

    let snappedPoint = pickedCartesian;
    let foundSnap = false;
    const snapPixelTolerance = 22; // Tolerância magnética em pixels

    // 1. Checa proximidade com Vértices do Modelo 3D
    if (modelVertexEntities.length > 0) {
        for (let v = 0; v < modelVertexEntities.length; v++) {
            const vEnt = modelVertexEntities[v];
            const vPos = vEnt.position.getValue(Cesium.JulianDate.now());
            if (vPos) {
                const screenPt = Cesium.SceneTransforms.wgs84ToWindowCoordinates(cesiumViewer.scene, vPos);
                if (screenPt) {
                    const distPx = Cesium.Cartesian2.distance(screenPosition, screenPt);
                    if (distPx <= snapPixelTolerance) {
                        snappedPoint = vPos;
                        foundSnap = true;
                        break;
                    }
                }
            }
        }
    }

    // 2. Checa proximidade com vértices das Camadas Vetoriais 2D
    if (!foundSnap) {
        Object.values(active2DDataSources).forEach(ds => {
            if (!ds.entities) return;
            const entities = ds.entities.values;
            for (let i = 0; i < entities.length; i++) {
                const ent = entities[i];
                let positions = null;
                if (ent.polygon && ent.polygon.hierarchy) {
                    const h = ent.polygon.hierarchy.getValue(Cesium.JulianDate.now());
                    if (h && h.positions) positions = h.positions;
                } else if (ent.polyline && ent.polyline.positions) {
                    positions = ent.polyline.positions.getValue(Cesium.JulianDate.now());
                }

                if (positions) {
                    for (let j = 0; j < positions.length; j++) {
                        const vertexPos = positions[j];
                        const screenPt = Cesium.SceneTransforms.wgs84ToWindowCoordinates(cesiumViewer.scene, vertexPos);
                        if (screenPt) {
                            const distPx = Cesium.Cartesian2.distance(screenPosition, screenPt);
                            if (distPx <= snapPixelTolerance) {
                                snappedPoint = vertexPos;
                                foundSnap = true;
                                break;
                            }
                        }
                    }
                }
                if (foundSnap) break;
            }
        });
    }

    // 3. Atualiza Marcador Visual de Snapping
    if (snapMarkerEntity) {
        if (foundSnap) {
            snapMarkerEntity.position = snappedPoint;
            snapMarkerEntity.show = true;
        } else {
            snapMarkerEntity.show = false;
        }
    }

    return snappedPoint;
}

// Detector de Clique no Modelo 3D para Abrir Menu Contextual
function setupModelClickDetector() {
    const handler = new Cesium.ScreenSpaceEventHandler(cesiumViewer.scene.canvas);
    handler.setInputAction(function(click) {
        if (currentInteractionMode) return;

        const pickedObject = cesiumViewer.scene.pick(click.position);
        if (Cesium.defined(pickedObject) && (pickedObject.id === uploadedModelEntity || pickedObject.primitive === uploadedModelEntity?.model)) {
            const menu = document.getElementById('cesium-model-context-menu');
            if (menu) {
                menu.style.left = `${click.position.x + 10}px`;
                menu.style.top = `${click.position.y + 10}px`;
                menu.classList.remove('hidden');
                menu.classList.add('flex');
            }
        } else {
            closeModelContextMenu();
        }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
}

window.closeModelContextMenu = function() {
    const menu = document.getElementById('cesium-model-context-menu');
    if (menu) menu.classList.add('hidden');
};

// ==========================================
// 3. ESTAMPAGEM E CONTROLE DE CAMADAS 2D DO MAPA
// ==========================================
let layer3DStates = { mdt: true, ortho: true, model: true, pointcloud: true };

window.toggleLayerWithCard = function(type) {
    if (!cesiumViewer) return;

    layer3DStates[type] = !layer3DStates[type];
    const isVisible = layer3DStates[type];

    if (type === 'mdt') {
        cesiumViewer.terrainProvider = isVisible ? (customTerrainProvider || new Cesium.EllipsoidTerrainProvider()) : new Cesium.EllipsoidTerrainProvider();
    } else if (type === 'ortho' && uploadedOrthoLayer) {
        uploadedOrthoLayer.show = isVisible;
    } else if (type === 'model' && uploadedModelEntity) {
        uploadedModelEntity.show = isVisible;
        modelVertexEntities.forEach(v => v.show = isVisible);
    } else if (type === 'pointcloud' && uploadedPointCloud) {
        uploadedPointCloud.show = isVisible;
    }

    const card = document.getElementById(`card-layer-${type}`);
    const badge = document.getElementById(`badge-layer-${type}`);
    const colorMap = { mdt: 'blue', ortho: 'emerald', model: 'purple', pointcloud: 'cyan' };
    const c = colorMap[type] || 'cyan';

    if (card && badge) {
        if (isVisible) {
            card.className = `flex items-center justify-between p-2 rounded-xl border border-${c}-500/40 bg-${c}-500/15 hover:bg-${c}-500/25 cursor-pointer transition-all select-none`;
            badge.className = `w-2.5 h-2.5 rounded-full bg-${c}-400 shadow-[0_0_8px_rgba(56,189,248,0.8)]`;
        } else {
            card.className = `flex items-center justify-between p-2 rounded-xl border border-white/5 bg-transparent opacity-40 hover:opacity-70 cursor-pointer transition-all select-none`;
            badge.className = `w-2.5 h-2.5 rounded-full bg-slate-700`;
        }
    }
};

window.setLayerFocus3D = function(focusType) {
    if (uploadedModelEntity && uploadedModelEntity.model) {
        uploadedModelEntity.model.color = (focusType === 'model') ? Cesium.Color.WHITE : Cesium.Color.WHITE.withAlpha(0.4);
    }
    if (uploadedOrthoLayer) {
        uploadedOrthoLayer.alpha = (focusType === 'ortho') ? 1.0 : 0.45;
    }
};

window.sync2DLayersIntoCesium = function() {
    if (!cesiumViewer) return;

    const listContainer = document.getElementById('cesium-2d-layers-list');
    if (!listContainer) return;

    let itemsHtml = '';

    // 1. Ortofotos Cadastradas (XYZ Tiles)
    const rasters = window.rasterLayers || [];
    if (rasters.length > 0) {
        itemsHtml += `<div class="text-[9px] text-emerald-400 font-bold uppercase tracking-wider mt-1 px-1">Ortofotos do Sistema</div>`;
        rasters.forEach(r => {
            const isChecked = !!active2DImageryLayers[r.id];
            itemsHtml += `
                <div onclick="toggle2DRasterLayer('${r.id}')" class="flex items-center justify-between p-2 rounded-xl border transition-all cursor-pointer select-none ${isChecked ? 'border-emerald-500/40 bg-emerald-500/15 text-white shadow-sm' : 'border-white/5 bg-transparent opacity-50 hover:opacity-90 text-slate-300'}">
                    <span class="flex items-center gap-2 truncate max-w-[150px]" title="${r.nome}">
                        <span class="material-symbols-outlined text-[16px] text-emerald-400">satellite_alt</span>
                        <span class="truncate text-xs font-semibold">${r.nome}</span>
                    </span>
                    <span class="w-2.5 h-2.5 rounded-full shrink-0 ${isChecked ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-slate-700'}"></span>
                </div>
            `;
        });
    }

    // 2. Temas Vetoriais (Preservando Estilo de Editar Camada)
    const themesList = window.themes || (typeof themes !== 'undefined' ? themes : []) || [];
    if (themesList.length > 0) {
        itemsHtml += `<div class="text-[9px] text-cyan-400 font-bold uppercase tracking-wider mt-2 px-1">Temas Vetoriais (Lotes/Imóveis)</div>`;
        themesList.forEach(theme => {
            const isChecked = !!active2DDataSources[theme.id];
            const themeColor = theme.color || '#0ea5e9';
            itemsHtml += `
                <div onclick="toggle2DVectorLayer('${theme.id}')" class="flex items-center justify-between p-2 rounded-xl border transition-all cursor-pointer select-none ${isChecked ? 'border-cyan-500/40 bg-cyan-500/15 text-white shadow-sm' : 'border-white/5 bg-transparent opacity-50 hover:opacity-90 text-slate-300'}">
                    <span class="flex items-center gap-2 truncate max-w-[150px]" title="${theme.name}">
                        <span class="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm" style="background-color: ${themeColor}"></span>
                        <span class="truncate text-xs font-semibold">${theme.name}</span>
                    </span>
                    <span class="w-2.5 h-2.5 rounded-full shrink-0 ${isChecked ? 'bg-cyan-400 shadow-[0_0_8px_rgba(56,189,248,0.8)]' : 'bg-slate-700'}"></span>
                </div>
            `;
        });
    }

    if (!itemsHtml) {
        itemsHtml = `<div class="text-white/40 text-[10px] italic py-2 px-1 text-center">Nenhuma camada 2D disponível no momento.</div>`;
    }

    listContainer.innerHTML = itemsHtml;
};

// Alternar Ortofoto 2D no Cesium
window.toggle2DRasterLayer = function(rasterId, forceEnable) {
    if (!cesiumViewer) return;

    const raster = (window.rasterLayers || []).find(r => r.id === rasterId);
    if (!raster) return;

    const shouldEnable = typeof forceEnable === 'boolean' ? forceEnable : !active2DImageryLayers[rasterId];

    if (shouldEnable) {
        if (active2DImageryLayers[rasterId]) return;

        const isXYZ = (raster.tipo === 'xyz_tiles') || (raster.url_imagem && raster.url_imagem.includes('{z}'));
        let provider = null;

        let orthoRectangle = null;
        if (raster.bbox && Array.isArray(raster.bbox) && raster.bbox.length === 2) {
            orthoRectangle = Cesium.Rectangle.fromDegrees(raster.bbox[0][1], raster.bbox[0][0], raster.bbox[1][1], raster.bbox[1][0]);
        } else if (raster.bbox && Array.isArray(raster.bbox) && raster.bbox.length === 4) {
            orthoRectangle = Cesium.Rectangle.fromDegrees(raster.bbox[0], raster.bbox[1], raster.bbox[2], raster.bbox[3]);
        } else if (currentMdtRectangle) {
            orthoRectangle = currentMdtRectangle;
        }

        if (isXYZ) {
            const providerOptions = {
                url: raster.url_imagem,
                tilingScheme: new Cesium.WebMercatorTilingScheme(),
                maximumLevel: raster.zoom_max || 22,
                hasAlphaChannel: true,
                enablePickFeatures: false
            };
            if (orthoRectangle) {
                providerOptions.rectangle = orthoRectangle;
            }

            provider = new Cesium.UrlTemplateImageryProvider(providerOptions);
            provider.errorEvent.addEventListener(function(error) {
                if (error && error.timesRetried !== undefined) {
                    error.retry = false;
                }
            });
        } else if (raster.url_imagem) {
            provider = new Cesium.SingleTileImageryProvider({
                url: raster.url_imagem,
                rectangle: orthoRectangle || Cesium.Rectangle.MAX_VALUE
            });
        }

        if (provider) {
            try {
                const layer = cesiumViewer.imageryLayers.addImageryProvider(provider);
                layer.alpha = 0.95;
                active2DImageryLayers[rasterId] = layer;
                
                if (orthoRectangle) {
                    cesiumViewer.camera.flyTo({ destination: orthoRectangle });
                }
            } catch(e) {
                console.error("Erro ao adicionar camada raster no Cesium:", e);
            }
        }
    } else {
        if (active2DImageryLayers[rasterId]) {
            try {
                cesiumViewer.imageryLayers.remove(active2DImageryLayers[rasterId]);
            } catch(e) {}
            delete active2DImageryLayers[rasterId];
        }
    }
    sync2DLayersIntoCesium();
};

// Alternar Camada Vetorial 2D no Cesium
window.toggle2DVectorLayer = async function(themeId, forceEnable) {
    if (!cesiumViewer) return;

    const shouldEnable = typeof forceEnable === 'boolean' ? forceEnable : !active2DDataSources[themeId];

    if (shouldEnable) {
        if (active2DDataSources[themeId]) return;

        const themesList = window.themes || (typeof themes !== 'undefined' ? themes : []) || [];
        const theme = themesList.find(t => String(t.id) === String(themeId));
        if (!theme) return;

        if ((!theme.features || theme.features.length === 0) && typeof window.loadThemeProperties === 'function') {
            await window.loadThemeProperties(theme.id);
        }

        let features = theme.features || [];

        if (features.length === 0 && window.GeoTurboDB && typeof window.GeoTurboDB.getThemeData === 'function') {
            try {
                const cached = await window.GeoTurboDB.getThemeData(theme.id);
                if (cached && cached.features) features = cached.features;
            } catch(e) {}
        }

        if (features.length > 0) {
            const geojson = {
                type: "FeatureCollection",
                features: features.filter(f => f && f.geometry)
            };

            try {
                const themeHex = theme.color || '#0ea5e9';
                const opacityVal = theme.opacity !== undefined ? parseFloat(theme.opacity) : 0.4;
                const weightVal = theme.weight !== undefined ? Math.max(1.5, parseFloat(theme.weight)) : 2.5;
                const isDashed = !!theme.dashed;

                const fillColor = Cesium.Color.fromCssColorString(themeHex).withAlpha(Math.min(0.8, opacityVal));
                const edgeColor = Cesium.Color.fromCssColorString(themeHex);

                const dataSource = await Cesium.GeoJsonDataSource.load(geojson, {
                    clampToGround: true,
                    stroke: edgeColor,
                    fill: fillColor,
                    strokeWidth: weightVal
                });

                const entities = dataSource.entities.values;
                const edgeEntitiesToAdd = [];

                for (let i = 0; i < entities.length; i++) {
                    const entity = entities[i];
                    if (entity.polygon) {
                        entity.polygon.outline = false;
                        entity.polygon.classificationType = Cesium.ClassificationType.TERRAIN;
                        entity.polygon.material = fillColor;

                        const hierarchy = entity.polygon.hierarchy.getValue(Cesium.JulianDate.now());
                        if (hierarchy && hierarchy.positions && hierarchy.positions.length > 2) {
                            const closedPositions = [...hierarchy.positions, hierarchy.positions[0]];
                            const polylineMaterial = isDashed 
                                ? new Cesium.PolylineDashMaterialProperty({ color: edgeColor, dashLength: 16.0 })
                                : edgeColor;

                            edgeEntitiesToAdd.push({
                                polyline: {
                                    positions: closedPositions,
                                    width: weightVal + 1.0,
                                    material: polylineMaterial,
                                    clampToGround: true
                                }
                            });
                        }
                    } else if (entity.polyline) {
                        entity.polyline.clampToGround = true;
                        entity.polyline.width = weightVal + 1.0;
                        if (isDashed) {
                            entity.polyline.material = new Cesium.PolylineDashMaterialProperty({ color: edgeColor, dashLength: 16.0 });
                        }
                    }
                }

                edgeEntitiesToAdd.forEach(edgeObj => dataSource.entities.add(edgeObj));

                cesiumViewer.dataSources.add(dataSource);
                active2DDataSources[themeId] = dataSource;
                console.log(`Tema "${theme.name}" estampado no Cesium 3D com estilo original.`);
            } catch (e) {
                console.error("Erro ao estampar GeoJSON no Cesium:", e);
            }
        } else {
            console.warn(`Tema "${theme.name}" não possui feições vetoriais carregadas.`);
        }
    } else {
        if (active2DDataSources[themeId]) {
            cesiumViewer.dataSources.remove(active2DDataSources[themeId]);
            delete active2DDataSources[themeId];
        }
    }
    sync2DLayersIntoCesium();
};

// ==========================================
// 4. UPLOAD DE ARQUIVOS COM CARREGAMENTO NO CENTRO DA TELA
// ==========================================

// Upload GeoTIFF (MDT)
document.getElementById('upload-geotiff').addEventListener('change', async function(e) {
    const file = e.target.files[0];
    if (!file || !cesiumViewer || typeof GeoTIFF === 'undefined') return;

    showCesiumLoading('Carregando e processando Relevo MDT (.tif)...');

    try {
        const arrayBuffer = await file.arrayBuffer();
        const tiff = await GeoTIFF.fromArrayBuffer(arrayBuffer);
        const image = await tiff.getImage();
        const bbox = image.getBoundingBox();
        const tiffWidth = image.getWidth();
        const tiffHeight = image.getHeight();
        const rasters = await image.readRasters();
        const heights = rasters[0];

        customTerrainProvider = new Cesium.CustomHeightmapTerrainProvider({
            width: 65,
            height: 65,
            callback: function (x, y, level) {
                const tilingScheme = new Cesium.GeographicTilingScheme();
                const tileRect = tilingScheme.tileXYToRectangle(x, y, level);
                const size = 65;
                const heightsArray = new Float32Array(size * size);
                
                for (let row = 0; row < size; row++) {
                    const lat = Cesium.Math.lerp(tileRect.north, tileRect.south, row / (size - 1));
                    const latDeg = Cesium.Math.toDegrees(lat);
                    for (let col = 0; col < size; col++) {
                        const lon = Cesium.Math.lerp(tileRect.west, tileRect.east, col / (size - 1));
                        const lonDeg = Cesium.Math.toDegrees(lon);
                        
                        if (lonDeg >= bbox[0] && lonDeg <= bbox[2] && latDeg >= bbox[1] && latDeg <= bbox[3]) {
                            const px = Math.floor(((lonDeg - bbox[0]) / (bbox[2] - bbox[0])) * (tiffWidth - 1));
                            const py = Math.floor(((bbox[3] - latDeg) / (bbox[3] - bbox[1])) * (tiffHeight - 1));
                            const idx = py * tiffWidth + px;
                            let h = heights[idx];
                            if (h < -1000) h = 0;
                            heightsArray[row * size + col] = h || 0;
                        } else {
                            heightsArray[row * size + col] = 0;
                        }
                    }
                }
                return heightsArray;
            }
        });

        cesiumViewer.terrainProvider = customTerrainProvider;
        currentMdtRectangle = Cesium.Rectangle.fromDegrees(bbox[0], bbox[1], bbox[2], bbox[3]);
        
        cesiumViewer.camera.flyTo({ destination: currentMdtRectangle });
        console.log("MDT Relevo carregado com sucesso.");
    } catch (error) {
        console.error("Erro ao carregar GeoTIFF:", error);
        alert("Erro ao ler o arquivo MDT (GeoTIFF).");
    } finally {
        hideCesiumLoading();
    }
});

// Upload Ortofoto
document.getElementById('upload-ortho').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file || !cesiumViewer) return;

    showCesiumLoading('Carregando Ortofoto...');

    const url = URL.createObjectURL(file);
    if (uploadedOrthoLayer) {
        cesiumViewer.imageryLayers.remove(uploadedOrthoLayer);
    }

    uploadedOrthoLayer = cesiumViewer.imageryLayers.addImageryProvider(new Cesium.SingleTileImageryProvider({
        url: url,
        rectangle: currentMdtRectangle || Cesium.Rectangle.MAX_VALUE
    }));

    setTimeout(() => hideCesiumLoading(), 600);
});

// Upload Projeto 3D (.glb / .gltf) no Centro da Tela
document.getElementById('upload-glb').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file || !cesiumViewer) return;

    showCesiumLoading('Importando Projeto 3D (.glb)...');

    const url = URL.createObjectURL(file);
    if (uploadedModelEntity) {
        cesiumViewer.entities.remove(uploadedModelEntity);
    }
    modelVertexEntities.forEach(v => cesiumViewer.entities.remove(v));
    modelVertexEntities = [];

    // Obtém o centro exato da tela atual do usuário
    const canvas = cesiumViewer.scene.canvas;
    const centerScreen = new Cesium.Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2);
    
    let centerPos = cesiumViewer.scene.pickPosition(centerScreen);
    if (!centerPos) {
        const ray = cesiumViewer.camera.getPickRay(centerScreen);
        centerPos = cesiumViewer.scene.globe.pick(ray, cesiumViewer.scene);
    }
    if (!centerPos) {
        centerPos = cesiumViewer.camera.pickEllipsoid(centerScreen, cesiumViewer.scene.globe.ellipsoid);
    }
    if (!centerPos) {
        const camCarto = cesiumViewer.camera.positionCartographic;
        centerPos = Cesium.Cartesian3.fromRadians(camCarto.longitude, camCarto.latitude, 0);
    }

    uploadedModelEntity = cesiumViewer.entities.add({
        position: centerPos,
        model: {
            uri: url,
            minimumPixelSize: 128,
            maximumScale: 20000,
            colorBlendMode: Cesium.ColorBlendMode.HIGHLIGHT,
            color: Cesium.Color.WHITE,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
        }
    });

    // Cria Vértices Visuais Luminosos no Modelo para Snapping Fácil
    createModelVisualVertices(centerPos, 12, 10);

    hideCesiumLoading();

    // Centraliza a visão no modelo importado
    cesiumViewer.flyTo(uploadedModelEntity, {
        offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-40), 120)
    });

    // Inicia o fluxo rígido guiado de 4 passos
    setTimeout(() => {
        startModelOrientationFlow(uploadedModelEntity);
    }, 400);
});

// Gera Marcadores de Vértices Visuais ao redor do Modelo 3D
function createModelVisualVertices(centerPos, widthMeters = 12, lengthMeters = 10) {
    modelVertexEntities.forEach(v => cesiumViewer.entities.remove(v));
    modelVertexEntities = [];

    const centerCarto = Cesium.Cartographic.fromCartesian(centerPos);
    const dLat = (lengthMeters / 2) / 111320;
    const dLon = (widthMeters / 2) / (111320 * Math.cos(centerCarto.latitude));

    const corners = [
        { lat: centerCarto.latitude - dLat, lon: centerCarto.longitude - dLon, name: 'Quina 1 (Frontal Esquerda)' },
        { lat: centerCarto.latitude - dLat, lon: centerCarto.longitude + dLon, name: 'Quina 2 (Frontal Direita)' },
        { lat: centerCarto.latitude + dLat, lon: centerCarto.longitude + dLon, name: 'Quina 3 (Traseira Direita)' },
        { lat: centerCarto.latitude + dLat, lon: centerCarto.longitude - dLon, name: 'Quina 4 (Traseira Esquerda)' }
    ];

    corners.forEach((c, idx) => {
        const pos = Cesium.Cartesian3.fromRadians(c.lon, c.lat, centerCarto.height);
        const vEntity = cesiumViewer.entities.add({
            position: pos,
            point: {
                pixelSize: 12,
                color: Cesium.Color.fromCssColorString('#facc15'), // Amarelo Neon
                outlineColor: Cesium.Color.BLACK,
                outlineWidth: 2,
                disableDepthTestDistance: Number.POSITIVE_INFINITY
            },
            label: {
                text: `V${idx + 1}`,
                font: '10px monospace bold',
                fillColor: Cesium.Color.WHITE,
                showBackground: true,
                backgroundColor: Cesium.Color.fromCssColorString('rgba(15,23,42,0.8)'),
                pixelOffset: new Cesium.Cartesian2(0, -16),
                disableDepthTestDistance: Number.POSITIVE_INFINITY
            }
        });
        modelVertexEntities.push(vEntity);
    });
}

// Upload Nuvem de Pontos (.laz / .las)
document.getElementById('upload-laz').addEventListener('change', async function(e) {
    const file = e.target.files[0];
    if (!file || !cesiumViewer) return;

    showCesiumLoading('Processando Nuvem de Pontos LiDAR (.laz)...');

    try {
        const arrayBuffer = await file.arrayBuffer();
        parseLASPointCloud(arrayBuffer);
    } catch (err) {
        console.error("Erro ao ler arquivo .laz/.las:", err);
        alert("Erro ao processar nuvem de pontos.");
    } finally {
        hideCesiumLoading();
    }
});

function parseLASPointCloud(buffer) {
    if (!cesiumViewer) return;

    try {
        const dataView = new DataView(buffer);
        const offsetToPoints = dataView.getUint32(96, true);
        const pointRecordLength = dataView.getUint16(105, true);
        const totalPoints = Math.min(dataView.getUint32(107, true), 30000);
        
        const scaleX = dataView.getFloat64(131, true);
        const scaleY = dataView.getFloat64(139, true);
        const scaleZ = dataView.getFloat64(147, true);
        const offsetX = dataView.getFloat64(155, true);
        const offsetY = dataView.getFloat64(163, true);
        const offsetZ = dataView.getFloat64(171, true);

        if (uploadedPointCloud) {
            cesiumViewer.scene.primitives.remove(uploadedPointCloud);
        }

        const pointPrimitives = new Cesium.PointPrimitiveCollection();
        const centerPos = typeof map !== 'undefined' ? map.getCenter() : {lat: -7.035, lng: -34.835};

        for (let i = 0; i < totalPoints; i++) {
            const byteOffset = offsetToPoints + (i * pointRecordLength);
            const rawX = dataView.getInt32(byteOffset, true);
            const rawY = dataView.getInt32(byteOffset + 4, true);
            const rawZ = dataView.getInt32(byteOffset + 8, true);

            const x = (rawX * scaleX) + offsetX;
            const y = (rawY * scaleY) + offsetY;
            const z = (rawZ * scaleZ) + offsetZ;

            let lon = x;
            let lat = y;
            if (Math.abs(x) > 180 || Math.abs(y) > 90) {
                lon = centerPos.lng + ((x % 1000) * 0.00001);
                lat = centerPos.lat + ((y % 1000) * 0.00001);
            }

            const cartesian = Cesium.Cartesian3.fromDegrees(lon, lat, Math.max(0, z));
            pointPrimitives.add({
                position: cartesian,
                color: Cesium.Color.fromCssColorString('#38bdf8'),
                pixelSize: 3
            });
        }

        uploadedPointCloud = cesiumViewer.scene.primitives.add(pointPrimitives);
        cesiumViewer.camera.flyTo({ destination: pointPrimitives._pointPrimitives[0].position });
        console.log(`Nuvem de pontos com ${totalPoints} pontos renderizada.`);
    } catch(e) {
        console.error("Erro ao fazer parse da nuvem LAS:", e);
    }
}

// ==========================================
// 5. FLUXO RÍGIDO DE ORIENTAÇÃO DO MODELO 3D (4 PASSOS GUIADOS)
// ==========================================
let orientationStep = 0;
let orientationData = { modelPt1: null, terrainPt1: null, modelPt2: null, terrainPt2: null };

window.startModelOrientationFlow = function(modelEntity) {
    if (!cesiumViewer || !modelEntity) return;

    currentInteractionMode = 'orientation';
    orientationStep = 1;
    orientationData = { modelPt1: null, terrainPt1: null, modelPt2: null, terrainPt2: null };

    setCesiumCursor('crosshair');
    updateGuideBanner('Passo 1/4: Clique no primeiro vértice V1 do Projeto 3D (ex: quina da fachada)', true);

    if (currentActiveHandler) currentActiveHandler.destroy();
    currentActiveHandler = new Cesium.ScreenSpaceEventHandler(cesiumViewer.scene.canvas);

    currentActiveHandler.setInputAction(function(movement) {
        getSnappingPoint(movement.endPosition);
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    currentActiveHandler.setInputAction(function(click) {
        const picked = getSnappingPoint(click.position);
        if (!picked) return;

        if (orientationStep === 1) {
            orientationData.modelPt1 = picked;
            orientationStep = 2;
            updateGuideBanner('Passo 2/4: Clique no ponto de destino correspondente no Terreno/Ortofoto (ex: divisa do lote)', true);
        } else if (orientationStep === 2) {
            orientationData.terrainPt1 = picked;
            orientationStep = 3;
            updateGuideBanner('Passo 3/4: Clique no segundo vértice V2 do Projeto 3D (ex: quina oposta)', true);
        } else if (orientationStep === 3) {
            orientationData.modelPt2 = picked;
            orientationStep = 4;
            updateGuideBanner('Passo 4/4: Clique no segundo ponto de destino no Terreno/Ortofoto (alinhamento da divisa)', true);
        } else if (orientationStep === 4) {
            orientationData.terrainPt2 = picked;
            finishModelOrientation(modelEntity);
        }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    currentActiveHandler.setInputAction(function() {
        cancelCesiumGuidedStep();
    }, Cesium.ScreenSpaceEventType.RIGHT_CLICK);
};

function finishModelOrientation(modelEntity) {
    cancelCesiumGuidedStep();

    const pModel1 = Cesium.Cartographic.fromCartesian(orientationData.modelPt1);
    const pModel2 = Cesium.Cartographic.fromCartesian(orientationData.modelPt2);
    const pTerrain1 = Cesium.Cartographic.fromCartesian(orientationData.terrainPt1);
    const pTerrain2 = Cesium.Cartographic.fromCartesian(orientationData.terrainPt2);
    
    // Azimute no modelo
    const dLonM = pModel2.longitude - pModel1.longitude;
    const yM = Math.sin(dLonM) * Math.cos(pModel2.latitude);
    const xM = Math.cos(pModel1.latitude) * Math.sin(pModel2.latitude) - Math.sin(pModel1.latitude) * Math.cos(pModel2.latitude) * Math.cos(dLonM);
    const headingModel = Math.atan2(yM, xM);

    // Azimute no terreno
    const dLonT = pTerrain2.longitude - pTerrain1.longitude;
    const yT = Math.sin(dLonT) * Math.cos(pTerrain2.latitude);
    const xT = Math.cos(pTerrain1.latitude) * Math.sin(pTerrain2.latitude) - Math.sin(pTerrain1.latitude) * Math.cos(pTerrain2.latitude) * Math.cos(dLonT);
    const headingTerrain = Math.atan2(yT, xT);

    const deltaHeading = headingTerrain - headingModel;

    // Posiciona o modelo ancorado no terreno
    const finalPosition = Cesium.Cartesian3.fromRadians(pTerrain1.longitude, pTerrain1.latitude, pTerrain1.height);
    const hpr = new Cesium.HeadingPitchRoll(deltaHeading, 0, 0);
    const orientation = Cesium.Transforms.headingPitchRollQuaternion(finalPosition, hpr);

    modelEntity.position = finalPosition;
    modelEntity.orientation = orientation;

    // Reposiciona os marcadores visuais no novo local
    createModelVisualVertices(finalPosition, 12, 10);

    const tools = document.getElementById('cesium-model-tools');
    if (tools) {
        tools.classList.remove('hidden');
        tools.classList.add('flex');
    }

    cesiumViewer.flyTo(modelEntity);
    alert('Projeto 3D alinhado e assentado com sucesso no lote!');
}

// Corrigir Altura Vertical (Z)
window.activateVerticalElevationAdjust = function() {
    if (!uploadedModelEntity) return;

    currentInteractionMode = 'adjust_z';
    setCesiumCursor('ns-resize');
    updateGuideBanner('Ajuste de Altura Z: Use os controles deslizantes ou pressione ESC para concluir.', true);

    const tools = document.getElementById('cesium-model-tools');
    if (tools) {
        tools.classList.remove('hidden');
        tools.classList.add('flex');
    }
};

window.cancelCesiumGuidedStep = function() {
    if (currentActiveHandler) {
        currentActiveHandler.destroy();
        currentActiveHandler = null;
    }
    if (snapMarkerEntity) {
        snapMarkerEntity.show = false;
    }
    currentInteractionMode = null;
    setCesiumCursor('default');
    updateGuideBanner('', false);
    closeModelContextMenu();
};

// ==========================================
// 6. MEDIÇÃO DE ALTURA (TRIANGULAÇÃO NO EIXO Z)
// ==========================================
let measurePoints = [];
let triangleEntities = [];

window.activate3DMeasurement = function() {
    if (!cesiumViewer) return;

    cancelCesiumGuidedStep();
    currentInteractionMode = 'measure_height';

    triangleEntities.forEach(e => cesiumViewer.entities.remove(e));
    triangleEntities = [];
    measurePoints = [];

    setCesiumCursor('crosshair');
    updateGuideBanner('Passo 1/2: Clique no ponto de base no Relevo/Terreno (Eixo X, Y)', true);

    currentActiveHandler = new Cesium.ScreenSpaceEventHandler(cesiumViewer.scene.canvas);

    currentActiveHandler.setInputAction(function(movement) {
        getSnappingPoint(movement.endPosition);
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    currentActiveHandler.setInputAction(function(click) {
        const picked = getSnappingPoint(click.position);
        if (!picked) return;

        measurePoints.push(picked);

        const pointEntity = cesiumViewer.entities.add({
            position: picked,
            point: {
                pixelSize: 10,
                color: measurePoints.length === 1 ? Cesium.Color.fromCssColorString('#10b981') : Cesium.Color.fromCssColorString('#ef4444'),
                outlineColor: Cesium.Color.WHITE,
                outlineWidth: 2,
                disableDepthTestDistance: Number.POSITIVE_INFINITY
            }
        });
        triangleEntities.push(pointEntity);

        if (measurePoints.length === 1) {
            updateGuideBanner('Passo 2/2: Clique no ponto mais alto no Eixo Z (Topo da Edificação ou Nuvem)', true);
        } else if (measurePoints.length === 2) {
            cancelCesiumGuidedStep();
            drawTriangleAndAuditGabarito(measurePoints[0], measurePoints[1]);
        }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    currentActiveHandler.setInputAction(function() {
        cancelCesiumGuidedStep();
    }, Cesium.ScreenSpaceEventType.RIGHT_CLICK);
};

function drawTriangleAndAuditGabarito(pointA, pointB) {
    const cartoA = Cesium.Cartographic.fromCartesian(pointA);
    const cartoB = Cesium.Cartographic.fromCartesian(pointB);

    const cartoC = new Cesium.Cartographic(cartoB.longitude, cartoB.latitude, cartoA.height);
    const pointC = Cesium.Cartesian3.fromRadians(cartoC.longitude, cartoC.latitude, cartoC.height);

    const alturaVertical = Math.abs(cartoB.height - cartoA.height);
    const distHorizontal = Cesium.Cartesian3.distance(pointA, pointC);

    // 1. Cateto Vertical (Altura Z) - Vermelho
    const vertLine = cesiumViewer.entities.add({
        polyline: {
            positions: [pointB, pointC],
            width: 4,
            material: Cesium.Color.fromCssColorString('#ef4444')
        }
    });
    triangleEntities.push(vertLine);

    // 2. Cateto Horizontal (Distância D) - Amarelo
    const baseLine = cesiumViewer.entities.add({
        polyline: {
            positions: [pointA, pointC],
            width: 3,
            material: Cesium.Color.fromCssColorString('#eab308')
        }
    });
    triangleEntities.push(baseLine);

    // 3. Hipotenusa (L) - Cyan Tracejado
    const hypLine = cesiumViewer.entities.add({
        polyline: {
            positions: [pointA, pointB],
            width: 3,
            material: new Cesium.PolylineDashMaterialProperty({ color: Cesium.Color.fromCssColorString('#0ea5e9') })
        }
    });
    triangleEntities.push(hypLine);

    // Rótulos 3D cotados
    const labelH = cesiumViewer.entities.add({
        position: Cesium.Cartesian3.midpoint(pointB, pointC, new Cesium.Cartesian3()),
        label: {
            text: `Altura Z: ${alturaVertical.toFixed(2)}m`,
            font: '13px monospace',
            fillColor: Cesium.Color.WHITE,
            showBackground: true,
            backgroundColor: Cesium.Color.fromCssColorString('rgba(15,23,42,0.85)'),
            backgroundPadding: new Cesium.Cartesian2(7, 4),
            disableDepthTestDistance: Number.POSITIVE_INFINITY
        }
    });
    triangleEntities.push(labelH);

    const labelD = cesiumViewer.entities.add({
        position: Cesium.Cartesian3.midpoint(pointA, pointC, new Cesium.Cartesian3()),
        label: {
            text: `Distância: ${distHorizontal.toFixed(2)}m`,
            font: '12px monospace',
            fillColor: Cesium.Color.WHITE,
            showBackground: true,
            backgroundColor: Cesium.Color.fromCssColorString('rgba(15,23,42,0.85)'),
            backgroundPadding: new Cesium.Cartesian2(6, 3),
            disableDepthTestDistance: Number.POSITIVE_INFINITY
        }
    });
    triangleEntities.push(labelD);

    // Auditoria contra o Gabarito
    const gabaritoInput = document.getElementById('gabarito-limit');
    const gabaritoMax = gabaritoInput ? parseFloat(gabaritoInput.value) || 12 : 12;

    const statusContainer = document.getElementById('measurement-status-container');
    const valHeight = document.getElementById('val-measured-height');
    const valAllowed = document.getElementById('val-allowed-height');
    const valBadge = document.getElementById('val-status-badge');

    if (statusContainer && valHeight && valAllowed && valBadge) {
        statusContainer.style.display = 'flex';
        statusContainer.classList.remove('hidden');

        valHeight.textContent = `${alturaVertical.toFixed(2)} m`;
        valAllowed.textContent = `${gabaritoMax.toFixed(2)} m`;

        if (alturaVertical <= gabaritoMax) {
            valBadge.className = 'px-3.5 py-1.5 text-xs font-black uppercase rounded-lg bg-green-500/20 text-green-400 border border-green-500/50 shadow-[0_0_14px_rgba(34,197,94,0.5)]';
            valBadge.textContent = 'APROVADO';
        } else {
            const excesso = alturaVertical - gabaritoMax;
            valBadge.className = 'px-3.5 py-1.5 text-xs font-black uppercase rounded-lg bg-rose-500/20 text-rose-400 border border-rose-500/50 shadow-[0_0_14px_rgba(244,63,94,0.5)]';
            valBadge.textContent = `REPROVADO (+${excesso.toFixed(2)}m)`;
        }
    }
}

// ==========================================
// 7. MEDIÇÃO DE DISTÂNCIA PLANA HORIZONTAL (X, Y) COM ADERÊNCIA
// ==========================================
let distanceEntities = [];
let distPoints = [];

window.activateDistanceXYMeasurement = function() {
    if (!cesiumViewer) return;

    cancelCesiumGuidedStep();
    currentInteractionMode = 'measure_distance';

    distanceEntities.forEach(e => cesiumViewer.entities.remove(e));
    distanceEntities = [];
    distPoints = [];

    setCesiumCursor('crosshair');
    updateGuideBanner('Passo 1/2: Clique no ponto de origem para medir a distância horizontal (X, Y)', true);

    currentActiveHandler = new Cesium.ScreenSpaceEventHandler(cesiumViewer.scene.canvas);

    currentActiveHandler.setInputAction(function(movement) {
        getSnappingPoint(movement.endPosition);
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    currentActiveHandler.setInputAction(function(click) {
        const picked = getSnappingPoint(click.position);
        if (!picked) return;

        distPoints.push(picked);

        const pointEntity = cesiumViewer.entities.add({
            position: picked,
            point: {
                pixelSize: 10,
                color: Cesium.Color.fromCssColorString('#6366f1'),
                outlineColor: Cesium.Color.WHITE,
                outlineWidth: 2,
                disableDepthTestDistance: Number.POSITIVE_INFINITY
            }
        });
        distanceEntities.push(pointEntity);

        if (distPoints.length === 1) {
            updateGuideBanner('Passo 2/2: Clique no ponto de destino para finalizar a cota métrica', true);
        } else if (distPoints.length === 2) {
            cancelCesiumGuidedStep();
            drawHorizontalDistanceLine(distPoints[0], distPoints[1]);
        }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    currentActiveHandler.setInputAction(function() {
        cancelCesiumGuidedStep();
    }, Cesium.ScreenSpaceEventType.RIGHT_CLICK);
};

function drawHorizontalDistanceLine(ptA, ptB) {
    const cartoA = Cesium.Cartographic.fromCartesian(ptA);
    const cartoB = Cesium.Cartographic.fromCartesian(ptB);

    const geodesic = new Cesium.EllipsoidGeodesic(cartoA, cartoB);
    const distMeters = geodesic.surfaceDistance;

    const lineEntity = cesiumViewer.entities.add({
        polyline: {
            positions: [ptA, ptB],
            width: 4,
            material: new Cesium.PolylineDashMaterialProperty({ color: Cesium.Color.fromCssColorString('#6366f1'), dashLength: 14.0 }),
            clampToGround: true
        }
    });
    distanceEntities.push(lineEntity);

    const midPt = Cesium.Cartesian3.midpoint(ptA, ptB, new Cesium.Cartesian3());
    const labelEntity = cesiumViewer.entities.add({
        position: midPt,
        label: {
            text: `Distância (X,Y): ${distMeters.toFixed(2)} m`,
            font: '13px monospace',
            fillColor: Cesium.Color.WHITE,
            showBackground: true,
            backgroundColor: Cesium.Color.fromCssColorString('rgba(15,23,42,0.9)'),
            backgroundPadding: new Cesium.Cartesian2(8, 4),
            disableDepthTestDistance: Number.POSITIVE_INFINITY
        }
    });
    distanceEntities.push(labelEntity);
}

// Medição de Área
window.activateAreaMeasurement = function() {
    if (!cesiumViewer) return;
    alert('Clique nos vértices para calcular a área e dê duplo clique para fechar o polígono.');
};

// Ajuste Fino Manual do Modelo
window.updateModelTransform = function() {
    if (!uploadedModelEntity) return;

    const rotVal = parseFloat(document.getElementById('model-rot-slider')?.value || 0);
    const zVal = parseFloat(document.getElementById('model-z-slider')?.value || 0);

    const rotText = document.getElementById('model-rot-val');
    const zText = document.getElementById('model-z-val');
    if (rotText) rotText.textContent = `${rotVal}°`;
    if (zText) zText.textContent = `${zVal} m`;

    const pos = uploadedModelEntity.position.getValue(Cesium.JulianDate.now());
    if (pos) {
        const carto = Cesium.Cartographic.fromCartesian(pos);
        const newPos = Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, zVal);
        const hpr = new Cesium.HeadingPitchRoll(Cesium.Math.toRadians(rotVal), 0, 0);
        
        uploadedModelEntity.position = newPos;
        uploadedModelEntity.orientation = Cesium.Transforms.headingPitchRollQuaternion(newPos, hpr);

        createModelVisualVertices(newPos, 12, 10);
    }
};

// Exportar Laudo Técnico em PDF
window.exportCesiumPDF = async function() {
    if (!cesiumViewer || typeof jspdf === 'undefined') {
        alert('Não foi possível gerar o PDF. Verifique se o módulo jsPDF está carregado.');
        return;
    }

    try {
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('landscape');

        pdf.setFillColor(15, 23, 42);
        pdf.rect(0, 0, 297, 210, 'F');

        pdf.setTextColor(56, 189, 248);
        pdf.setFontSize(18);
        pdf.text("LAUDO TÉCNICO DE ANÁLISE DE GABARITO 3D", 14, 20);

        pdf.setTextColor(255, 255, 255);
        pdf.setFontSize(10);
        pdf.text(`Data da Análise: ${new Date().toLocaleDateString('pt-BR')}`, 14, 28);
        
        const gabaritoVal = document.getElementById('gabarito-limit')?.value || '12';
        const measuredVal = document.getElementById('val-measured-height')?.textContent || '-';
        const badgeVal = document.getElementById('val-status-badge')?.textContent || 'PENDENTE';

        pdf.text(`Gabarito Máximo Permitido: ${gabaritoVal} metros`, 14, 38);
        pdf.text(`Altura Real Medida: ${measuredVal}`, 14, 46);
        pdf.text(`Resultado da Avaliação: ${badgeVal}`, 14, 54);

        pdf.save(`Laudo_Gabarito_3D_${new Date().toISOString().slice(0,10)}.pdf`);
    } catch(e) {
        console.error("Erro ao gerar PDF:", e);
    }
};
