const fs = require('fs');
let content = fs.readFileSync('src/main.js', 'utf8');

// 1. Add currentHighlightData & clearHighlight & update highlightFeature
const highlightOriginal = `function highlightFeature(fid) {
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

  // 2. Destaque no Menu Lateral`;

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

  // 2. Destaque no Menu Lateral`;

content = content.replace(highlightOriginal, highlightReplacement);

// 2. Add switchDynamicTab before renderFeatureInfo
const infoOriginal = `function renderFeatureInfo() {
  const container = document.getElementById('feature-info-content');`;

const infoReplacement = `function switchDynamicTab(tabId) {
    document.querySelectorAll('.accordion-content').forEach(el => {
        el.classList.remove('block');
        el.classList.add('hidden');
    });
    const target = document.getElementById('acc-content-' + tabId);
    if (target) {
        target.classList.remove('hidden');
        target.classList.add('block');
    }
}

function renderFeatureInfo() {
  const container = document.getElementById('feature-info-content');`;

content = content.replace(infoOriginal, infoReplacement);

// 3. Fix the dynamicFormSchema block
const blockRegex = /if \(dynamicFormSchema && dynamicFormSchema\.length > 0\) \{[\s\S]*?\/\/ OLD LOGIC FALLBACK/;
const blockReplacement = `if (dynamicFormSchema && dynamicFormSchema.length > 0) {
      if (typeof window.renderDynamicForm === 'function') {
          window.renderDynamicForm(dynamicFormSchema, properties, isFeatureEditMode, 'feature-info-content');
          return;
      }
  }
  // OLD LOGIC FALLBACK`;

content = content.replace(blockRegex, blockReplacement);

// 4. closeFeatureInfoModal update
const closeOriginal = `function closeFeatureInfoModal(keepLayer = false) {
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
content = content.replace(closeOriginal, closeReplacement);

// 5. Add exports
if (!content.includes('window.switchDynamicTab')) {
    content = content.replace('window.printReport = printReport;', 'window.printReport = printReport;\\nwindow.switchDynamicTab = switchDynamicTab;\\nwindow.clearHighlight = clearHighlight;');
}

fs.writeFileSync('src/main.js', content, 'utf8');
console.log('applyFix applied successfully');
