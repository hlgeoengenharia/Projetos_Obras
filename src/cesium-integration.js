// src/cesium-integration.js

let cesiumViewer = null;

// ==========================================
// 1. MODAL UI CONTROLS (Drag & Resize)
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
    
    // Fechar painel de medição 2D se estiver aberto
    if (typeof closeMeasurementPanel === 'function') {
        closeMeasurementPanel();
    }
    
    // Inicializar Cesium apenas na primeira vez
    if (!cesiumViewer) {
        initCesiumViewer();
    }
};

window.closeCesiumModal = function() {
    cesiumModal.classList.add('hidden');
    cesiumModal.style.display = 'none';
};

// Dragging Logic
cesiumHeader.addEventListener('mousedown', function(e) {
    if (e.target.closest('button')) return;
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    
    const rect = cesiumModal.getBoundingClientRect();
    startLeft = rect.left;
    startTop = rect.top;
    
    document.addEventListener('mousemove', dragModal);
    document.addEventListener('mouseup', stopDragModal);
});

function dragModal(e) {
    if (!isDragging) return;
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
cesiumResizeHandle.addEventListener('mousedown', function(e) {
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

function resizeModal(e) {
    if (!isResizing) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    
    const newWidth = Math.max(400, startWidth + dx);
    const newHeight = Math.max(300, startHeight + dy);
    
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
// 2. CESIUM VIEWER INITIALIZATION
// ==========================================
function initCesiumViewer() {
    try {
        // Remover estado vazio
        document.getElementById('cesium-empty-state').style.display = 'none';
        
        cesiumViewer = new Cesium.Viewer('cesiumContainer', {
            baseLayerPicker: false,
            baseLayer: false, // <-- Desativa a imagem padrão do Ion (evita erro 401)
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

        // Configurar o Mapa Base (Satélite ArcGIS) e Terreno Base
        cesiumViewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
        cesiumViewer.imageryLayers.removeAll();
        Cesium.ArcGisMapServerImageryProvider.fromUrl('https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer', {
            enablePickFeatures: false
        }).then(function(provider) {
            cesiumViewer.imageryLayers.addImageryProvider(provider);
        }).catch(function(error) {
            console.error("Erro ao carregar Satélite ArcGIS:", error);
        });

        // Posicionar a câmera inicialmente sobre o Brasil ou a área do mapa principal
        const currentMapCenter = typeof map !== 'undefined' ? map.getCenter() : {lat: -7.115, lng: -34.863};
        cesiumViewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(currentMapCenter.lng, currentMapCenter.lat, 2000.0),
            orientation: {
                heading: Cesium.Math.toRadians(0.0),
                pitch: Cesium.Math.toRadians(-45.0),
                roll: 0.0
            }
        });

        console.log("CesiumJS inicializado com sucesso.");
    } catch (e) {
        console.error("Erro ao inicializar o Cesium: ", e);
    }
}

// Recentralizar Câmera
window.recenterCesium = function() {
    if (!cesiumViewer) return;
    
    // Tentar voar para o modelo 3D carregado se houver
    if (uploadedModelEntity) {
        cesiumViewer.flyTo(uploadedModelEntity);
        return;
    }
    
    // Tentar voar para qualquer retângulo de MDT que foi carregado
    const entities = cesiumViewer.entities.values;
    const mdtRect = entities.find(e => e.rectangle);
    if (mdtRect) {
        cesiumViewer.flyTo(mdtRect);
        return;
    }
    
    // Voltar para o centro padrão caso não haja arquivos
    const currentMapCenter = typeof map !== 'undefined' ? map.getCenter() : {lat: -7.115, lng: -34.863};
    cesiumViewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(currentMapCenter.lng, currentMapCenter.lat, 2000.0),
        orientation: {
            heading: Cesium.Math.toRadians(0.0),
            pitch: Cesium.Math.toRadians(-45.0),
            roll: 0.0
        }
    });
};

// ==========================================
// 3. UPLOAD E PROCESSAMENTO DE DADOS
// ==========================================
let uploadedModelEntity = null;

// Upload de GLB/glTF
document.getElementById('upload-glb').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file || !cesiumViewer) return;

    const url = URL.createObjectURL(file);
    
    // Remover modelo anterior se existir
    if (uploadedModelEntity) {
        cesiumViewer.entities.remove(uploadedModelEntity);
    }

    // Como não sabemos a coordenada exata de antemão, vamos colocar no centro da câmera atual
    const cameraPos = cesiumViewer.camera.positionCartographic;
    const position = Cesium.Cartesian3.fromRadians(cameraPos.longitude, cameraPos.latitude, cameraPos.height / 2);
    
    const heading = Cesium.Math.toRadians(135);
    const pitch = 0;
    const roll = 0;
    const hpr = new Cesium.HeadingPitchRoll(heading, pitch, roll);
    const orientation = Cesium.Transforms.headingPitchRollQuaternion(position, hpr);

    uploadedModelEntity = cesiumViewer.entities.add({
        position: position,
        orientation: orientation,
        model: {
            uri: url,
            minimumPixelSize: 128,
            maximumScale: 20000,
            colorBlendMode: Cesium.ColorBlendMode.HIGHLIGHT,
            color: Cesium.Color.WHITE,
            heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND
        }
    });

    window.uploadedModelEntity = uploadedModelEntity;
    window.modelBasePosition = position;
    
    document.getElementById('cesium-model-tools').classList.remove('hidden');
    document.getElementById('cesium-model-tools').classList.add('flex');
    
    cesiumViewer.trackedEntity = uploadedModelEntity;
    document.getElementById('cesium-empty-state').style.display = 'none';
});

// Upload de GeoTIFF (MDT)
document.getElementById('upload-geotiff').addEventListener('change', async function(e) {
    const file = e.target.files[0];
    if (!file || !cesiumViewer || typeof GeoTIFF === 'undefined') {
        console.error("GeoTIFF.js não está carregado ou arquivo inválido.");
        return;
    }

    try {
        const arrayBuffer = await file.arrayBuffer();
        const tiff = await GeoTIFF.fromArrayBuffer(arrayBuffer);
        const image = await tiff.getImage();
        const bbox = image.getBoundingBox(); // [minX, minY, maxX, maxY]
        
        const tiffWidth = image.getWidth();
        const tiffHeight = image.getHeight();
        const rasters = await image.readRasters();
        const heights = rasters[0]; // Extrai a banda de elevação

        const customTerrainProvider = new Cesium.CustomHeightmapTerrainProvider({
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
                        
                        // Verifica se as coordenadas estão dentro do Bounding Box do MDT
                        // bbox: [minX(west), minY(south), maxX(east), maxY(north)]
                        if (lonDeg >= bbox[0] && lonDeg <= bbox[2] && latDeg >= bbox[1] && latDeg <= bbox[3]) {
                            const px = Math.floor(((lonDeg - bbox[0]) / (bbox[2] - bbox[0])) * (tiffWidth - 1));
                            const py = Math.floor(((bbox[3] - latDeg) / (bbox[3] - bbox[1])) * (tiffHeight - 1));
                            const idx = py * tiffWidth + px;
                            
                            let h = heights[idx];
                            if (h < -1000) h = 0; // Tratar valores NoData
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
        window.customTerrainProvider = customTerrainProvider;
        const rect = Cesium.Rectangle.fromDegrees(bbox[0], bbox[1], bbox[2], bbox[3]);
        window.currentMdtRectangle = rect; // Guarda a posição exata para a Ortofoto
        
        // Adicionar um contorno vermelho (Polyline) para mostrar a área do MDT
        cesiumViewer.entities.add({
            polyline: {
                positions: Cesium.Cartesian3.fromDegreesArray([
                    bbox[0], bbox[1], // SW
                    bbox[2], bbox[1], // SE
                    bbox[2], bbox[3], // NE
                    bbox[0], bbox[3], // NW
                    bbox[0], bbox[1]  // SW (fechar loop)
                ]),
                width: 3,
                material: Cesium.Color.RED,
                clampToGround: true
            }
        });
        // Remove the default cesium logo
        cesiumViewer.scene.globe.enableLighting = true; // Ajuda a ver o relevo com sombras
        
        cesiumViewer.camera.flyTo({
            destination: rect
        });
        
        document.getElementById('cesium-empty-state').style.display = 'none';
        console.log("MDT 3D carregado nativamente. Bounding Box:", bbox);
    } catch (error) {
        console.error("Erro ao processar GeoTIFF:", error);
        alert("Erro ao ler o arquivo GeoTIFF.");
    }
});

// Upload de Ortofoto
document.getElementById('upload-ortho').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file || !cesiumViewer) return;

    const url = URL.createObjectURL(file);
    
    // Adicionar a imagem como uma camada base perfeitamente alinhada ao MDT
    window.uploadedOrthoLayer = cesiumViewer.imageryLayers.addImageryProvider(new Cesium.SingleTileImageryProvider({
        url: url,
        rectangle: window.currentMdtRectangle || cesiumViewer.camera.computeViewRectangle() || Cesium.Rectangle.MAX_VALUE
    }));
    
    document.getElementById('cesium-empty-state').style.display = 'none';
    alert("Ortofoto projetada com sucesso na extensão atual da câmera.");
});

// ==========================================
// 4. FERRAMENTAS DE MEDIÇÃO E ANOTAÇÃO (Core)
// ==========================================
let measurementHandler = null;
let measurePoints = [];
let triangleEntities = [];

window.activate3DMeasurement = function() {
    if (!cesiumViewer) return;
    
    // Resetar estado
    if (measurementHandler) {
        measurementHandler.destroy();
    }
    triangleEntities.forEach(e => cesiumViewer.entities.remove(e));
    triangleEntities = [];
    measurePoints = [];
    
    const btnMeasure = document.getElementById('btn-measure-3d');
    btnMeasure.classList.replace('bg-slate-700', 'bg-cyan-600');
    btnMeasure.innerHTML = '<span class="material-symbols-outlined text-[16px]">touch_app</span> Clique o Ponto A (Base)';
    
    document.getElementById('measurement-status-container').classList.add('hidden');

    measurementHandler = new Cesium.ScreenSpaceEventHandler(cesiumViewer.scene.canvas);
    
    measurementHandler.setInputAction(function(click) {
        // Capturar o ponto 3D real onde houve o clique (seja modelo, terreno ou tileset)
        const cartesian = cesiumViewer.scene.pickPosition(click.position);
        if (!cartesian) return;

        measurePoints.push(cartesian);
        
        // Desenhar uma esfera no ponto clicado
        const point = cesiumViewer.entities.add({
            position: cartesian,
            point: {
                pixelSize: 10,
                color: measurePoints.length === 1 ? Cesium.Color.YELLOW : Cesium.Color.RED,
                outlineColor: Cesium.Color.WHITE,
                outlineWidth: 2,
                disableDepthTestDistance: Number.POSITIVE_INFINITY
            }
        });
        triangleEntities.push(point);

        if (measurePoints.length === 1) {
            btnMeasure.innerHTML = '<span class="material-symbols-outlined text-[16px]">touch_app</span> Clique o Ponto B (Topo)';
        } 
        else if (measurePoints.length === 2) {
            // Fim da medição: Calcular triângulo
            measurementHandler.destroy();
            measurementHandler = null;
            btnMeasure.classList.replace('bg-cyan-600', 'bg-slate-700');
            btnMeasure.innerHTML = '<span class="material-symbols-outlined text-[16px]">straighten</span> Medir';
            
            drawTriangleAndCalculate(measurePoints[0], measurePoints[1]);
        }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
};

function drawTriangleAndCalculate(pointA, pointB) {
    // Transformar para coordenadas cartográficas (Long, Lat, Altura)
    const cartoA = Cesium.Cartographic.fromCartesian(pointA);
    const cartoB = Cesium.Cartographic.fromCartesian(pointB);
    
    // Ponto C: mesma lat/long do B, mas com a altura do A (faz o ângulo reto de 90 graus)
    const cartoC = new Cesium.Cartographic(cartoB.longitude, cartoB.latitude, cartoA.height);
    const pointC = Cesium.Cartesian3.fromRadians(cartoC.longitude, cartoC.latitude, cartoC.height);
    
    // Calcular altura vertical (Cateto Oposto)
    const alturaVertical = Math.abs(cartoB.height - cartoA.height);
    const distHorizontal = Cesium.Cartesian3.distance(pointA, pointC);
    
    // Desenhar a linha Hipotenusa (A-B)
    const hypLine = cesiumViewer.entities.add({
        polyline: {
            positions: [pointA, pointB],
            width: 3,
            material: new Cesium.PolylineDashMaterialProperty({ color: Cesium.Color.CYAN })
        }
    });
    
    // Desenhar a linha Vertical (B-C)
    const vertLine = cesiumViewer.entities.add({
        polyline: {
            positions: [pointB, pointC],
            width: 4,
            material: Cesium.Color.RED
        }
    });
    
    // Desenhar a linha Base (A-C)
    const baseLine = cesiumViewer.entities.add({
        polyline: {
            positions: [pointA, pointC],
            width: 2,
            material: Cesium.Color.YELLOW
        }
    });
    
    // Adicionar Rótulo da Altura na linha Vertical
    const midVertPoint = Cesium.Cartesian3.midpoint(pointB, pointC, new Cesium.Cartesian3());
    const heightLabel = cesiumViewer.entities.add({
        position: midVertPoint,
        label: {
            text: `Altura: ${alturaVertical.toFixed(2)}m`,
            font: '14px sans-serif',
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(10, -10),
            disableDepthTestDistance: Number.POSITIVE_INFINITY
        }
    });
    
    triangleEntities.push(hypLine, vertLine, baseLine, heightLabel);
    
    // Validar Gabarito
    const gabaritoInput = document.getElementById('gabarito-limit').value;
    const maxGabarito = parseFloat(gabaritoInput) || 0;
    
    const isAprovado = alturaVertical <= maxGabarito;
    
    const badge = document.getElementById('val-status-badge');
    document.getElementById('val-measured-height').innerText = `${alturaVertical.toFixed(2)}m`;
    document.getElementById('val-allowed-height').innerText = `${maxGabarito.toFixed(2)}m`;
    
    if (isAprovado) {
        badge.innerText = 'APROVADO';
        badge.className = 'px-3 py-1 text-xs font-black uppercase rounded bg-green-500/20 text-green-400 border border-green-500/50';
    } else {
        badge.innerText = 'REPROVADO';
        badge.className = 'px-3 py-1 text-xs font-black uppercase rounded bg-red-500/20 text-red-400 border border-red-500/50';
    }
    
    document.getElementById('measurement-status-container').classList.remove('hidden');
    document.getElementById('measurement-status-container').classList.add('flex');
}

let annotationHandler = null;
window.activate3DAnnotation = function() {
    if (!cesiumViewer) return;
    
    const text = prompt("Digite a anotação que deseja inserir no mapa 3D:");
    if (!text) return;

    if (annotationHandler) {
        annotationHandler.destroy();
    }
    
    alert("Clique no ponto do modelo onde deseja fixar o texto.");

    annotationHandler = new Cesium.ScreenSpaceEventHandler(cesiumViewer.scene.canvas);
    annotationHandler.setInputAction(function(click) {
        const cartesian = cesiumViewer.scene.pickPosition(click.position);
        if (cartesian) {
            cesiumViewer.entities.add({
                position: cartesian,
                label: {
                    text: text,
                    font: 'bold 16px sans-serif',
                    fillColor: Cesium.Color.YELLOW,
                    outlineColor: Cesium.Color.BLACK,
                    outlineWidth: 3,
                    style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                    verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                    disableDepthTestDistance: Number.POSITIVE_INFINITY
                }
            });
        }
        annotationHandler.destroy();
        annotationHandler = null;
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
};

// ==========================================
// 5. EXPORTAÇÃO (PDF)
// ==========================================
window.exportCesiumPDF = function() {
    if (!cesiumViewer || typeof jspdf === 'undefined') {
        alert("Erro: jsPDF não carregado ou visualizador 3D inativo.");
        return;
    }

    try {
        // Forçar renderização para capturar o frame
        cesiumViewer.render();
        const canvas = cesiumViewer.scene.canvas;
        const imgData = canvas.toDataURL("image/jpeg", 0.9);

        // Extrair dados da interface
        const alturaMedida = document.getElementById('val-measured-height').innerText;
        const alturaPermitida = document.getElementById('val-allowed-height').innerText;
        const badge = document.getElementById('val-status-badge');
        const status = badge.innerText;
        const isAprovado = status === 'APROVADO';

        // Configurar PDF (Paisagem, A4)
        const { jsPDF } = jspdf;
        const pdf = new jsPDF({
            orientation: 'landscape',
            unit: 'mm',
            format: 'a4'
        });

        // Adicionar Cabeçalho
        pdf.setFontSize(22);
        pdf.setTextColor(20, 30, 50);
        pdf.text("Laudo de Análise de Gabarito 3D", 14, 20);
        
        pdf.setFontSize(10);
        pdf.setTextColor(100, 100, 100);
        const dataAtual = new Date().toLocaleString('pt-BR');
        pdf.text(`Data da Análise: ${dataAtual}`, 14, 28);

        // Adicionar Imagem da Cena 3D
        // A4 paisagem tem ~297 x 210 mm. Ajustar imagem para manter proporção
        const imgWidth = 269; 
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        pdf.addImage(imgData, 'JPEG', 14, 35, imgWidth, imgHeight);

        // Adicionar Caixa de Resultado
        const boxY = 35 + imgHeight + 10;
        pdf.setFillColor(240, 245, 250);
        pdf.rect(14, boxY, 269, 30, 'F');
        
        pdf.setFontSize(12);
        pdf.setTextColor(50, 50, 50);
        pdf.text(`Altura Medida (Cateto Oposto): ${alturaMedida}`, 20, boxY + 10);
        pdf.text(`Altura Máxima Permitida (Gabarito): ${alturaPermitida}`, 20, boxY + 20);

        // Stamp Aprovado/Reprovado
        pdf.setFontSize(16);
        pdf.setFont("helvetica", "bold");
        if (isAprovado) {
            pdf.setTextColor(0, 150, 0);
        } else {
            pdf.setTextColor(200, 0, 0);
        }
        pdf.text(`STATUS: ${status}`, 200, boxY + 18);

        // Salvar
        pdf.save(`Laudo_Gabarito3D_${Date.now()}.pdf`);

    } catch (err) {
        console.error("Erro ao gerar PDF:", err);
        alert("Ocorreu um erro ao gerar o PDF. Veja o console para detalhes.");
    }
};

// ==========================================
// 6. FERRAMENTAS AVANÇADAS: CAMINHO E ÁREA
// ==========================================
let cesiumMeasurementHandler = null;
let cesiumActivePoints = [];
let cesiumActiveEntity = null;
let cesiumMeasurementMode = null; // 'path' or 'area'

window.activatePathMeasurement = function() {
    startCesiumMeasurement('path');
};

window.activateAreaMeasurement = function() {
    startCesiumMeasurement('area');
};

function startCesiumMeasurement(mode) {
    if (!cesiumViewer) return;
    
    // Clear previous
    if (cesiumMeasurementHandler) {
        cesiumMeasurementHandler.destroy();
        cesiumMeasurementHandler = null;
    }
    if (cesiumActiveEntity) {
        cesiumViewer.entities.remove(cesiumActiveEntity);
        cesiumActiveEntity = null;
    }
    cesiumActivePoints = [];
    cesiumMeasurementMode = mode;
    
    document.getElementById('val-measured-height').innerText = "Desenhando...";
    document.getElementById('measurement-status-container').classList.remove('hidden');
    document.getElementById('measurement-status-container').classList.add('flex');
    
    cesiumMeasurementHandler = new Cesium.ScreenSpaceEventHandler(cesiumViewer.scene.canvas);
    
    // Left Click: Add point
    cesiumMeasurementHandler.setInputAction(function(click) {
        const cartesian = cesiumViewer.scene.pickPosition(click.position);
        if (cartesian) {
            cesiumActivePoints.push(cartesian);
            
            if (cesiumActivePoints.length === 1) {
                // First point, create entity
                if (mode === 'path') {
                    cesiumActiveEntity = cesiumViewer.entities.add({
                        polyline: {
                            positions: new Cesium.CallbackProperty(() => cesiumActivePoints, false),
                            width: 3,
                            material: Cesium.Color.CYAN,
                            clampToGround: true
                        }
                    });
                } else if (mode === 'area') {
                    cesiumActiveEntity = cesiumViewer.entities.add({
                        polygon: {
                            hierarchy: new Cesium.CallbackProperty(() => new Cesium.PolygonHierarchy(cesiumActivePoints), false),
                            material: Cesium.Color.CYAN.withAlpha(0.5),
                            outline: true,
                            outlineColor: Cesium.Color.CYAN,
                            perPositionHeight: true
                        }
                    });
                }
            }
        }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    
    // Right Click: Finish
    cesiumMeasurementHandler.setInputAction(function(click) {
        if (cesiumActivePoints.length > 1) {
            finishCesiumMeasurement();
        }
    }, Cesium.ScreenSpaceEventType.RIGHT_CLICK);
}

function finishCesiumMeasurement() {
    if (cesiumMeasurementHandler) {
        cesiumMeasurementHandler.destroy();
        cesiumMeasurementHandler = null;
    }
    
    if (cesiumMeasurementMode === 'path' && cesiumActivePoints.length > 1) {
        let totalDistance = 0;
        for (let i = 0; i < cesiumActivePoints.length - 1; i++) {
            totalDistance += Cesium.Cartesian3.distance(cesiumActivePoints[i], cesiumActivePoints[i+1]);
        }
        document.getElementById('val-measured-height').innerText = totalDistance.toFixed(2) + " m";
    } else if (cesiumMeasurementMode === 'area' && cesiumActivePoints.length > 2) {
        try {
            // Converter Cartesian3 para array [lng, lat] para o Turf.js
            let coords = cesiumActivePoints.map(p => {
                let carto = Cesium.Cartographic.fromCartesian(p);
                return [Cesium.Math.toDegrees(carto.longitude), Cesium.Math.toDegrees(carto.latitude)];
            });
            // Fechar o polígono
            coords.push(coords[0]);
            let polygon = turf.polygon([coords]);
            let area = turf.area(polygon);
            document.getElementById('val-measured-height').innerText = area.toFixed(2) + " m²";
        } catch(e) {
            console.error("Erro ao calcular área", e);
            document.getElementById('val-measured-height').innerText = "Erro";
        }
    }
    cesiumMeasurementMode = null;
}

// ==========================================
// 7. GERENCIAMENTO DE CAMADAS E MODELO 3D
// ==========================================
window.toggleLayer = function(layerId, isVisible) {
    if (!cesiumViewer) return;
    
    if (layerId === 'mdt') {
        if (isVisible) {
            cesiumViewer.terrainProvider = window.customTerrainProvider || new Cesium.EllipsoidTerrainProvider();
        } else {
            cesiumViewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
        }
    } else if (layerId === 'ortho') {
        if (window.uploadedOrthoLayer) {
            window.uploadedOrthoLayer.show = isVisible;
        }
    } else if (layerId === 'model') {
        if (window.uploadedModelEntity) {
            window.uploadedModelEntity.show = isVisible;
        }
    }
};

let isModelDragging = false;
let modelDragHandler = null;

window.toggleModelDragMode = function() {
    isModelDragging = !isModelDragging;
    const btn = document.getElementById('btn-drag-model');
    const icon = document.getElementById('icon-drag-model');
    const text = document.getElementById('text-drag-model');
    
    if (isModelDragging) {
        btn.classList.replace('bg-slate-700', 'bg-cyan-600');
        icon.innerText = 'touch_app';
        text.innerText = 'Modo Mover (Ativado)';
        enableModelDrag();
    } else {
        btn.classList.replace('bg-cyan-600', 'bg-slate-700');
        icon.innerText = 'pan_tool';
        text.innerText = 'Ativar Mover (Drag)';
        disableModelDrag();
    }
};

function enableModelDrag() {
    if (!cesiumViewer || !window.uploadedModelEntity) return;
    
    cesiumViewer.scene.screenSpaceCameraController.enableTranslate = false;
    cesiumViewer.scene.screenSpaceCameraController.enableTilt = false;
    
    modelDragHandler = new Cesium.ScreenSpaceEventHandler(cesiumViewer.scene.canvas);
    let dragging = false;
    
    modelDragHandler.setInputAction(function(click) {
        const pickedObject = cesiumViewer.scene.pick(click.position);
        if (Cesium.defined(pickedObject) && pickedObject.id === window.uploadedModelEntity) {
            dragging = true;
            cesiumViewer.scene.screenSpaceCameraController.enableInputs = false;
            cesiumViewer.trackedEntity = undefined; 
            cesiumViewer.scene.canvas.style.cursor = 'move';
        }
    }, Cesium.ScreenSpaceEventType.LEFT_DOWN);
    
    modelDragHandler.setInputAction(function(movement) {
        if (dragging) {
            const ray = cesiumViewer.camera.getPickRay(movement.endPosition);
            const cartesian = cesiumViewer.scene.globe.pick(ray, cesiumViewer.scene);
            
            if (cartesian) {
                // Ao arrastar, assumimos que a base do modelo está tocando o solo (height = 0)
                let carto = Cesium.Cartographic.fromCartesian(cartesian);
                carto.height = 0;
                window.modelBasePosition = Cesium.Cartographic.toCartesian(carto);
                updateModelTransform();
            }
        } else {
            // Hover effect: show crosshair when over the model
            const picked = cesiumViewer.scene.pick(movement.endPosition);
            if (Cesium.defined(picked) && picked.id === window.uploadedModelEntity) {
                cesiumViewer.scene.canvas.style.cursor = 'grab';
            } else {
                cesiumViewer.scene.canvas.style.cursor = 'default';
            }
        }
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
    
    modelDragHandler.setInputAction(function(click) {
        dragging = false;
        cesiumViewer.scene.screenSpaceCameraController.enableInputs = true;
        cesiumViewer.scene.canvas.style.cursor = 'default';
    }, Cesium.ScreenSpaceEventType.LEFT_UP);
}

function disableModelDrag() {
    if (modelDragHandler) {
        modelDragHandler.destroy();
        modelDragHandler = null;
    }
    if (cesiumViewer) {
        cesiumViewer.scene.screenSpaceCameraController.enableInputs = true;
        cesiumViewer.scene.screenSpaceCameraController.enableTranslate = true;
        cesiumViewer.scene.screenSpaceCameraController.enableTilt = true;
    }
}

window.updateModelTransform = function() {
    if (!window.uploadedModelEntity || !window.modelBasePosition) return;
    
    const rotDeg = parseFloat(document.getElementById('model-rot-slider').value) || 0;
    const zOffset = parseFloat(document.getElementById('model-z-slider').value) || 0;
    
    document.getElementById('model-rot-val').innerText = rotDeg + "°";
    document.getElementById('model-z-val').innerText = zOffset + " m";
    
    let carto = Cesium.Cartographic.fromCartesian(window.modelBasePosition);
    carto.height += zOffset;
    let finalPos = Cesium.Cartographic.toCartesian(carto);
    
    const heading = Cesium.Math.toRadians(rotDeg);
    const pitch = 0;
    const roll = 0;
    const hpr = new Cesium.HeadingPitchRoll(heading, pitch, roll);
    const orientation = Cesium.Transforms.headingPitchRollQuaternion(finalPos, hpr);
    
    window.uploadedModelEntity.position = finalPos;
    window.uploadedModelEntity.orientation = orientation;
};

// ==========================================
// 8. SINCRONIZAÇÃO DE CAMADAS 2D (Leaflet -> Cesium)
// ==========================================
window.cesium2DLayers = {};

window.load2DLayersIntoCesium = async function() {
    if (!cesiumViewer || typeof window.themes === 'undefined' || window.themes.length === 0) {
        alert("Nenhuma camada 2D encontrada para sincronizar.");
        return;
    }
    
    const container = document.getElementById('cesium-2d-layers-list');
    if (container) {
        container.innerHTML = '<div class="text-cyan-400 text-[10px] animate-pulse">Sincronizando...</div>';
    }
    
    // Remove as antigas
    for (const id in window.cesium2DLayers) {
        cesiumViewer.dataSources.remove(window.cesium2DLayers[id]);
    }
    window.cesium2DLayers = {};
    
    let html = '';
    
    for (const theme of window.themes) {
        if (!theme.features || theme.features.length === 0) continue;
        
        try {
            // Cria um GeoJSON falso para englobar as features
            const geojson = {
                type: "FeatureCollection",
                features: theme.features
            };
            
            const dataSource = await Cesium.GeoJsonDataSource.load(geojson, {
                stroke: Cesium.Color.fromCssColorString(theme.color || '#ff0000'),
                fill: Cesium.Color.fromCssColorString(theme.color || '#ff0000').withAlpha(0.3),
                strokeWidth: 3,
                clampToGround: true // Garante que vetores sejam projetados sobre o relevo!
            });
            
            cesiumViewer.dataSources.add(dataSource);
            window.cesium2DLayers[theme.id] = dataSource;
            
            // Add checkbox
            html += `
            <label class="flex items-center gap-2 cursor-pointer hover:text-cyan-400 transition-colors">
                <input type="checkbox" class="rounded bg-slate-800 border-slate-600 text-cyan-500" checked onchange="toggle2DLayer('${theme.id}', this.checked)">
                <span class="material-symbols-outlined text-[14px]">layers</span> <span class="truncate w-32" title="${theme.name || 'Camada'}">${theme.name || 'Camada'}</span>
            </label>
            `;
            
        } catch (e) {
            console.error("Erro ao carregar tema no Cesium:", theme.name, e);
        }
    }
    
    if (container) {
        if (html === '') {
            container.innerHTML = '<div class="text-white/40 text-[10px] italic">Nenhuma camada geométrica encontrada.</div>';
        } else {
            container.innerHTML = html;
        }
    }
};

window.toggle2DLayer = function(id, isVisible) {
    if (window.cesium2DLayers[id]) {
        window.cesium2DLayers[id].show = isVisible;
    }
};

