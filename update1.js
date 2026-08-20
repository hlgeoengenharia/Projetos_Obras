const fs = require('fs');
let content = fs.readFileSync('src/main.js', 'utf8');

// 1. highlightFeature replacement
const highlightTarget = `function highlightFeature(fid) {
  if (!geojsonLayer) return;
  
  // 1. Destaque no Mapa
  let targetLayer = null;
  geojsonLayer.eachLayer(layer => {
    if (layer.feature && layer.feature.properties._tempId === fid) {
      targetLayer = layer;
    }
  });
  
  if (targetLayer) {
    if (targetLayer.setStyle) {
      targetLayer.setStyle({ color: '#f59e0b', weight: 6, fillOpacity: 0.8 });
      setTimeout(() => {
        if (geojsonLayer && map.hasLayer(targetLayer)) {
          geojsonLayer.resetStyle(targetLayer);
        }
      }, 2000);
    } else if (targetLayer.getLatLng) {
      const highlight = L.circleMarker(targetLayer.getLatLng(), {
        radius: 15, color: '#f59e0b', fillColor: '#f59e0b', fillOpacity: 0.8, weight: 2
      }).addTo(map);
      
      let opacity = 0.8;
      let radius = 15;
      const interval = setInterval(() => {
        opacity -= 0.05;
        radius += 1.5;
        if (opacity <= 0) {
          clearInterval(interval);
          map.removeLayer(highlight);
        } else {
          highlight.setStyle({ fillOpacity: opacity, opacity: opacity });
          highlight.setRadius(radius);
        }
      }, 50);
    }
  }

  // 2. Destaque no Menu Lateral;`;

const highlightReplacement = `let currentHighlightData = null;

function clearHighlight() {
  if (!currentHighlightData) return;
  if (currentHighlightData.type === 'style' && typeof geojsonLayer !== 'undefined' && geojsonLayer && map.hasLayer(currentHighlightData.layer)) {
    geojsonLayer.resetStyle(currentHighlightData.layer);
  } else if (currentHighlightData.type === 'marker' && map.hasLayer(currentHighlightData.layer)) {
    map.removeLayer(currentHighlightData.layer);
  }
  currentHighlightData = null;
}

function highlightFeature(fid) {
  if (typeof geojsonLayer === 'undefined' || !geojsonLayer) return;
  
  clearHighlight();
  
  // 1. Destaque no Mapa
  let targetLayer = null;
  geojsonLayer.eachLayer(layer => {
    if (layer.feature && layer.feature.properties._tempId === fid) {
      targetLayer = layer;
    }
  });
  
  if (targetLayer) {
    // Zoom/Center to feature
    if (targetLayer.getBounds) {
      map.flyToBounds(targetLayer.getBounds(), { maxZoom: 18, duration: 0.5 });
    } else if (targetLayer.getLatLng) {
      map.flyTo(targetLayer.getLatLng(), Math.max(map.getZoom(), 18), { duration: 0.5 });
    }

    if (targetLayer.setStyle) {
      targetLayer.setStyle({ color: '#f59e0b', weight: 6, fillOpacity: 0.8 });
      currentHighlightData = { type: 'style', layer: targetLayer };
    } else if (targetLayer.getLatLng) {
      const highlight = L.circleMarker(targetLayer.getLatLng(), {
        radius: 12, color: '#f59e0b', fillColor: '#f59e0b', fillOpacity: 0.8, weight: 3
      }).addTo(map);
      currentHighlightData = { type: 'marker', layer: highlight };
    }
  }

  // 2. Destaque no Menu Lateral;`;

content = content.replace(highlightTarget, highlightReplacement);

// 2. closeFeatureInfoModal replacement
const closeTarget = `function closeFeatureInfoModal(keepLayer = false) {
  document.getElementById('feature-info-modal').classList.add('hidden');
  if (!keepLayer) {
    activeFeatureLayer = null;
  }
}`;
const closeReplacement = `function closeFeatureInfoModal(keepLayer = false) {
  document.getElementById('feature-info-modal').classList.add('hidden');
  if (!keepLayer) {
    activeFeatureLayer = null;
    if (typeof clearHighlight === 'function') clearHighlight();
  }
}`;
content = content.replace(closeTarget, closeReplacement);

// 3. export windows functions
if (!content.includes('window.switchDynamicTab')) {
    content += "\\nwindow.switchDynamicTab = switchDynamicTab;\\nwindow.clearHighlight = clearHighlight;\\n";
}

fs.writeFileSync('src/main.js', content, 'utf8');
console.log('Update 1 applied');
