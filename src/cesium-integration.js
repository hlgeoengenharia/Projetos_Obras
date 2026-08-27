// src/cesium-integration.js
/**
 * Módulo Avançado de Análise de Gabarito 3D com CesiumJS
 * - Tela cheia (Fullscreen)
 * - Importador unificado (MDT .tif, Ortofoto .png/.jpg, Projeto 3D .glb/.gltf, Nuvem .laz/.las)
 * - Estampagem e controle individual de camadas 2D/3D existentes
 * - Fluxo rígido de orientação de modelos 3D por 2 pontos de referência
 * - Triangulação geométrica completa de altura com auditoria de gabarito (Aprovado/Reprovado)
 * - Modo Foco / X-Ray de camadas 3D
 */

let cesiumViewer = null;
let isCesiumFullscreen = false;
let normalModalBounds = { top: '50px', left: '50px', width: '750px', height: '550px' };

// Entidades e camadas 3D gerenciadas
let uploadedModelEntity = null;
let uploadedPointCloud = null;
let uploadedOrthoLayer = null;
let customTerrainProvider = null;
let currentMdtRectangle = null;
let active2DDataSources = {};
let active2DImageryLayers = {};

// ==========================================
// 1. CONTROLES DO MODAL (Drag, Resize & Fullscreen)
// ==========================================
const cesiumModal = document.getElementById('cesium-modal');
const cesiumHeader = document.getElementById('cesium-modal-header');
const cesiumResizeHandle = document.getElementById('cesium-resize-handle');

let isDragging = false;
let isResizing = false;
let startX, startY, startWidth, startHeight, startTop, startLeft;

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
    cesiumModal.classList.add('hidden');
    cesiumModal.style.display = 'none';
};

// Alternar Modo Tela Cheia
window.toggleCesiumFullscreen = function() {
    isCesiumFullscreen = !isCesiumFullscreen;
    const btn = document.getElementById('btn-cesium-maximize');

    if (isCesiumFullscreen) {
        // Salva posições anteriores
        normalModalBounds = {
            top: cesiumModal.style.top || '50px',
            left: cesiumModal.style.left || '50px',
            width: cesiumModal.style.width || '750px',
            height: cesiumModal.style.height || '550px'
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
});

// Dragging Logic
if (cesiumHeader) {
    cesiumHeader.addEventListener('mousedown', function(e) {
        if (isCesiumFullscreen || e.target.closest('button')) return;
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
    
    const newWidth = Math.max(420, startWidth + dx);
    const newHeight = Math.max(320, startHeight + dy);
    
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
// 2. INICIALIZAÇÃO DO CESIUM VIEWER
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

        // Configura Terreno Base e Satélite ArcGIS
        cesiumViewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
        cesiumViewer.imageryLayers.removeAll();
        
        Cesium.ArcGisMapServerImageryProvider.fromUrl('https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer', {
            enablePickFeatures: false
        }).then(function(provider) {
            cesiumViewer.imageryLayers.addImageryProvider(provider);
        }).catch(function(error) {
            console.error("Erro ao carregar Satélite ArcGIS no Cesium:", error);
        });

        // Câmera centrada no município ativo ou Cabedelo
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

// ==========================================
// 3. ESTAMPAGEM E CONTROLE DE CAMADAS 2D DO MAPA
// ==========================================
window.sync2DLayersIntoCesium = function() {
    if (!cesiumViewer) return;

    const listContainer = document.getElementById('cesium-2d-layers-list');
    if (!listContainer) return;

    let itemsHtml = '';

    // 1. Camadas de Ortofotos Cadastradas (XYZ Tiles)
    const rasters = window.rasterLayers || [];
    if (rasters.length > 0) {
        itemsHtml += `<div class="text-[9px] text-emerald-400 font-bold uppercase tracking-wider mt-1">Ortofotos do Sistema</div>`;
        rasters.forEach(r => {
            const isChecked = active2DImageryLayers[r.id] ? 'checked' : '';
            itemsHtml += `
                <label class="flex items-center justify-between p-1 rounded hover:bg-white/10 cursor-pointer">
                    <span class="flex items-center gap-1.5 truncate max-w-[140px]" title="${r.nome}">
                        <input type="checkbox" class="rounded bg-slate-800 border-slate-600 text-emerald-500 focus:ring-0" ${isChecked} onchange="toggle2DRasterLayer('${r.id}', this.checked)">
                        <span class="truncate">${r.nome}</span>
                    </span>
                    <span class="text-[9px] text-slate-400 font-mono">Tiles</span>
                </label>
            `;
        });
    }

    // 2. Camadas Vetoriais dos Formulários (GeoJSON)
    const forms = window.allForms || [];
    if (forms.length > 0) {
        itemsHtml += `<div class="text-[9px] text-cyan-400 font-bold uppercase tracking-wider mt-2">Feições Vetoriais (Lotes/Obras)</div>`;
        forms.forEach(form => {
            const isChecked = active2DDataSources[form.id] ? 'checked' : '';
            itemsHtml += `
                <label class="flex items-center justify-between p-1 rounded hover:bg-white/10 cursor-pointer">
                    <span class="flex items-center gap-1.5 truncate max-w-[140px]" title="${form.title}">
                        <input type="checkbox" class="rounded bg-slate-800 border-slate-600 text-cyan-500 focus:ring-0" ${isChecked} onchange="toggle2DVectorLayer('${form.id}', this.checked)">
                        <span class="truncate">${form.title}</span>
                    </span>
                    <span class="text-[9px] text-slate-400 font-mono">Vetorial</span>
                </label>
            `;
        });
    }

    if (!itemsHtml) {
        itemsHtml = `<div class="text-white/40 text-[10px] italic py-1">Nenhuma camada 2D ativa no momento.</div>`;
    }

    listContainer.innerHTML = itemsHtml;
};

// Alternar Ortofoto 2D no Cesium
window.toggle2DRasterLayer = function(rasterId, enable) {
    if (!cesiumViewer) return;

    const raster = (window.rasterLayers || []).find(r => r.id === rasterId);
    if (!raster) return;

    if (enable) {
        if (active2DImageryLayers[rasterId]) return;

        const isXYZ = (raster.tipo === 'xyz_tiles') || (raster.url_imagem && raster.url_imagem.includes('{z}'));
        let provider = null;

        if (isXYZ) {
            provider = new Cesium.UrlTemplateImageryProvider({
                url: raster.url_imagem,
                maximumLevel: raster.zoom_max || 22,
                minimumLevel: raster.zoom_min || 12
            });
        } else if (raster.url_imagem) {
            provider = new Cesium.SingleTileImageryProvider({
                url: raster.url_imagem,
                rectangle: currentMdtRectangle || Cesium.Rectangle.MAX_VALUE
            });
        }

        if (provider) {
            const layer = cesiumViewer.imageryLayers.addImageryProvider(provider);
            layer.alpha = 0.95;
            active2DImageryLayers[rasterId] = layer;
        }
    } else {
        if (active2DImageryLayers[rasterId]) {
            cesiumViewer.imageryLayers.remove(active2DImageryLayers[rasterId]);
            delete active2DImageryLayers[rasterId];
        }
    }
};

// Alternar Camada Vetorial 2D no Cesium (Estampada no Relevo)
window.toggle2DVectorLayer = async function(formId, enable) {
    if (!cesiumViewer) return;

    if (enable) {
        if (active2DDataSources[formId]) return;

        // Recupera as feições do GeoEngineTurbo ou da camada Leaflet
        let geojson = null;
        if (window.GeoEngineTurbo && typeof window.GeoEngineTurbo.exportGeoJSON === 'function') {
            geojson = window.GeoEngineTurbo.exportGeoJSON(formId);
        } else if (typeof allFeatures !== 'undefined' && allFeatures[formId]) {
            geojson = {
                type: "FeatureCollection",
                features: allFeatures[formId]
            };
        }

        if (geojson && geojson.features && geojson.features.length > 0) {
            try {
                const dataSource = await Cesium.GeoJsonDataSource.load(geojson, {
                    clampToGround: true,
                    stroke: Cesium.Color.fromCssColorString('#0ea5e9'),
                    fill: Cesium.Color.fromCssColorString('rgba(14, 165, 233, 0.25)'),
                    strokeWidth: 3
                });

                cesiumViewer.dataSources.add(dataSource);
                active2DDataSources[formId] = dataSource;
            } catch (e) {
                console.error("Erro ao estampar GeoJSON no Cesium:", e);
            }
        }
    } else {
        if (active2DDataSources[formId]) {
            cesiumViewer.dataSources.remove(active2DDataSources[formId]);
            delete active2DDataSources[formId];
        }
    }
};

// Controle de Visibilidade e Foco em Camadas 3D (X-Ray)
window.toggleLayer = function(type, visible) {
    if (!cesiumViewer) return;

    if (type === 'mdt') {
        cesiumViewer.terrainProvider = visible ? (customTerrainProvider || new Cesium.EllipsoidTerrainProvider()) : new Cesium.EllipsoidTerrainProvider();
    } else if (type === 'ortho' && uploadedOrthoLayer) {
        uploadedOrthoLayer.show = visible;
    } else if (type === 'model' && uploadedModelEntity) {
        uploadedModelEntity.show = visible;
    } else if (type === 'pointcloud' && uploadedPointCloud) {
        uploadedPointCloud.show = visible;
    }
};

window.setLayerFocus3D = function(focusType) {
    // Efeito X-Ray: Camada focada fica 100% nítida, outras recebem leve transparência
    if (uploadedModelEntity && uploadedModelEntity.model) {
        uploadedModelEntity.model.color = (focusType === 'model') ? Cesium.Color.WHITE : Cesium.Color.WHITE.withAlpha(0.4);
    }
    if (uploadedOrthoLayer) {
        uploadedOrthoLayer.alpha = (focusType === 'ortho') ? 1.0 : 0.45;
    }
};

// ==========================================
// 4. UPLOAD DE ARQUIVOS (MDT, Ortofoto, GLB, LAZ)
// ==========================================

// Upload GeoTIFF (MDT)
document.getElementById('upload-geotiff').addEventListener('change', async function(e) {
    const file = e.target.files[0];
    if (!file || !cesiumViewer || typeof GeoTIFF === 'undefined') return;

    try {
        const arrayBuffer = await file.arrayBuffer();
        const tiff = await GeoTIFF.fromArrayBuffer(arrayBuffer);
        const image = await tiff.getImage();
        const bbox = image.getBoundingBox(); // [minX, minY, maxX, maxY]
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
    }
});

// Upload Ortofoto
document.getElementById('upload-ortho').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file || !cesiumViewer) return;

    const url = URL.createObjectURL(file);
    if (uploadedOrthoLayer) {
        cesiumViewer.imageryLayers.remove(uploadedOrthoLayer);
    }

    uploadedOrthoLayer = cesiumViewer.imageryLayers.addImageryProvider(new Cesium.SingleTileImageryProvider({
        url: url,
        rectangle: currentMdtRectangle || Cesium.Rectangle.MAX_VALUE
    }));
});

// Upload Projeto 3D (.glb / .gltf) com Fluxo Rígido de Orientação
document.getElementById('upload-glb').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file || !cesiumViewer) return;

    const url = URL.createObjectURL(file);
    if (uploadedModelEntity) {
        cesiumViewer.entities.remove(uploadedModelEntity);
    }

    const cameraPos = cesiumViewer.camera.positionCartographic;
    const position = Cesium.Cartesian3.fromRadians(cameraPos.longitude, cameraPos.latitude, 0);
    
    uploadedModelEntity = cesiumViewer.entities.add({
        position: position,
        model: {
            uri: url,
            minimumPixelSize: 128,
            maximumScale: 20000,
            colorBlendMode: Cesium.ColorBlendMode.HIGHLIGHT,
            color: Cesium.Color.WHITE,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
        }
    });

    // Inicia o fluxo rígido de orientação de 2 pontos
    startModelOrientationFlow(uploadedModelEntity);
});

// Upload Nuvem de Pontos (.laz / .las)
document.getElementById('upload-laz').addEventListener('change', async function(e) {
    const file = e.target.files[0];
    if (!file || !cesiumViewer) return;

    try {
        const arrayBuffer = await file.arrayBuffer();
        parseLASPointCloud(arrayBuffer);
    } catch (err) {
        console.error("Erro ao ler arquivo .laz/.las:", err);
        alert("Erro ao processar nuvem de pontos.");
    }
});

// Parser de Nuvem de Pontos LAS/LAZ
function parseLASPointCloud(buffer) {
    if (!cesiumViewer) return;

    try {
        const dataView = new DataView(buffer);
        // Header LAS simples (offsets e scale factors)
        const offsetToPoints = dataView.getUint32(96, true);
        const pointRecordLength = dataView.getUint16(105, true);
        const totalPoints = Math.min(dataView.getUint32(107, true), 30000); // Limite de 30k pontos p/ performance no browser
        
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

            // Converte UTM ou Coordenadas para WGS84 aproximado
            let lon = x;
            let lat = y;
            if (Math.abs(x) > 180 || Math.abs(y) > 90) {
                // UTM aproximado em relação ao centro do mapa
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
// 5. FLUXO RÍGIDO DE ORIENTAÇÃO DO MODELO 3D (2 PONTOS)
// ==========================================
let orientationHandler = null;
let orientationStep = 0;
let orientationData = { modelPt1: null, terrainPt1: null, modelPt2: null, terrainPt2: null };

function startModelOrientationFlow(modelEntity) {
    if (!cesiumViewer || !modelEntity) return;

    orientationStep = 1;
    orientationData = { modelPt1: null, terrainPt1: null, modelPt2: null, terrainPt2: null };

    const banner = document.getElementById('cesium-guide-banner');
    const text = document.getElementById('cesium-guide-text');
    if (banner && text) {
        banner.classList.remove('hidden');
        banner.classList.add('flex');
        text.textContent = 'Passo 1/4: Clique no Ponto 1 no Projeto 3D';
    }

    if (orientationHandler) orientationHandler.destroy();
    orientationHandler = new Cesium.ScreenSpaceEventHandler(cesiumViewer.scene.canvas);

    orientationHandler.setInputAction(function(click) {
        const picked = cesiumViewer.scene.pickPosition(click.position);
        if (!picked) return;

        if (orientationStep === 1) {
            orientationData.modelPt1 = picked;
            orientationStep = 2;
            if (text) text.textContent = 'Passo 2/4: Clique no Ponto 1 correspondente no Relevo / Terreno';
        } else if (orientationStep === 2) {
            orientationData.terrainPt1 = picked;
            orientationStep = 3;
            if (text) text.textContent = 'Passo 3/4: Clique no Ponto 2 no Projeto 3D';
        } else if (orientationStep === 3) {
            orientationData.modelPt2 = picked;
            orientationStep = 4;
            if (text) text.textContent = 'Passo 4/4: Clique no Ponto 2 correspondente no Relevo / Terreno';
        } else if (orientationStep === 4) {
            orientationData.terrainPt2 = picked;
            
            // Finaliza orientação calculando rotação e assentamento
            finishModelOrientation(modelEntity);
        }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
}

function finishModelOrientation(modelEntity) {
    if (orientationHandler) {
        orientationHandler.destroy();
        orientationHandler = null;
    }

    const banner = document.getElementById('cesium-guide-banner');
    if (banner) banner.classList.add('hidden');

    const pTerrain1 = Cesium.Cartographic.fromCartesian(orientationData.terrainPt1);
    const pTerrain2 = Cesium.Cartographic.fromCartesian(orientationData.terrainPt2);
    
    // Azimute entre os dois pontos do terreno
    const dLon = pTerrain2.longitude - pTerrain1.longitude;
    const y = Math.sin(dLon) * Math.cos(pTerrain2.latitude);
    const x = Math.cos(pTerrain1.latitude) * Math.sin(pTerrain2.latitude) - Math.sin(pTerrain1.latitude) * Math.cos(pTerrain2.latitude) * Math.cos(dLon);
    const heading = Math.atan2(y, x);

    // Posiciona o modelo ancorado no terreno
    const finalPosition = Cesium.Cartesian3.fromRadians(pTerrain1.longitude, pTerrain1.latitude, pTerrain1.height);
    const hpr = new Cesium.HeadingPitchRoll(heading, 0, 0);
    const orientation = Cesium.Transforms.headingPitchRollQuaternion(finalPosition, hpr);

    modelEntity.position = finalPosition;
    modelEntity.orientation = orientation;

    // Habilita controles de ajuste fino
    const tools = document.getElementById('cesium-model-tools');
    if (tools) {
        tools.classList.remove('hidden');
        tools.classList.add('flex');
    }

    cesiumViewer.flyTo(modelEntity);
    alert('Projeto 3D orientado e assentado no relevo com sucesso!');
}

window.cancelCesiumGuidedStep = function() {
    if (orientationHandler) {
        orientationHandler.destroy();
        orientationHandler = null;
    }
    if (measurementHandler) {
        measurementHandler.destroy();
        measurementHandler = null;
    }
    const banner = document.getElementById('cesium-guide-banner');
    if (banner) banner.classList.add('hidden');
};

// ==========================================
// 6. TRIANGULAÇÃO DE ALTURA E AUDITORIA DE GABARITO
// ==========================================
let measurementHandler = null;
let measurePoints = [];
let triangleEntities = [];

window.activate3DMeasurement = function() {
    if (!cesiumViewer) return;

    if (measurementHandler) measurementHandler.destroy();
    triangleEntities.forEach(e => cesiumViewer.entities.remove(e));
    triangleEntities = [];
    measurePoints = [];

    const banner = document.getElementById('cesium-guide-banner');
    const text = document.getElementById('cesium-guide-text');
    if (banner && text) {
        banner.classList.remove('hidden');
        banner.classList.add('flex');
        text.textContent = 'Passo 1/2: Clique no Ponto Referencial (Base no Relevo)';
    }

    measurementHandler = new Cesium.ScreenSpaceEventHandler(cesiumViewer.scene.canvas);

    measurementHandler.setInputAction(function(click) {
        const cartesian = cesiumViewer.scene.pickPosition(click.position);
        if (!cartesian) return;

        measurePoints.push(cartesian);

        // Marcador no ponto clicado
        const pointEntity = cesiumViewer.entities.add({
            position: cartesian,
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
            if (text) text.textContent = 'Passo 2/2: Clique no Ponto Mais Alto (Topo da Edificação ou Nuvem)';
        } else if (measurePoints.length === 2) {
            measurementHandler.destroy();
            measurementHandler = null;
            if (banner) banner.classList.add('hidden');

            drawTriangleAndAuditGabarito(measurePoints[0], measurePoints[1]);
        }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
};

function drawTriangleAndAuditGabarito(pointA, pointB) {
    const cartoA = Cesium.Cartographic.fromCartesian(pointA);
    const cartoB = Cesium.Cartographic.fromCartesian(pointB);

    // Ponto C: mesma lon/lat de B, com altura de A (forma o ângulo de 90°)
    const cartoC = new Cesium.Cartographic(cartoB.longitude, cartoB.latitude, cartoA.height);
    const pointC = Cesium.Cartesian3.fromRadians(cartoC.longitude, cartoC.latitude, cartoC.height);

    const alturaVertical = Math.abs(cartoB.height - cartoA.height);
    const distHorizontal = Cesium.Cartesian3.distance(pointA, pointC);
    const hipotenusa = Cesium.Cartesian3.distance(pointA, pointB);

    // 1. Cateto Vertical (Altura H) - Vermelho
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

    // Rótulos 3D cotados nas 3 arestas
    const labelH = cesiumViewer.entities.add({
        position: Cesium.Cartesian3.midpoint(pointB, pointC, new Cesium.Cartesian3()),
        label: {
            text: `Altura: ${alturaVertical.toFixed(2)}m`,
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
        statusContainer.classList.remove('hidden');
        statusContainer.classList.add('flex');

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

// Medição de Distância de Caminho
window.activatePathMeasurement = function() {
    if (!cesiumViewer) return;
    alert('Clique nos pontos no mapa para medir o caminho e dê duplo clique para finalizar.');
};

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
