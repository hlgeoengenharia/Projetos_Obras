const fs = require('fs');
let content = fs.readFileSync('src/main.js', 'utf8');

// 1. Fix highlightFeature & add clearHighlight
const regexHighlight = /function highlightFeature\(fid\) \{[\s\S]*?\/\/ 2\. Destaque no Menu Lateral/m;
const replacementHighlight = `let currentHighlightData = null;

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

content = content.replace(regexHighlight, replacementHighlight);

// 2. Add switchDynamicTab before renderFeatureInfo
const regexInfo = /function renderFeatureInfo\(\) \{/m;
const replacementInfo = `function switchDynamicTab(tabId) {
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

function renderFeatureInfo() {`;

if (!content.includes('function switchDynamicTab')) {
    content = content.replace(regexInfo, replacementInfo);
}

// 3. Fix the dynamicFormSchema block
const blockRegex = /if \(dynamicFormSchema && dynamicFormSchema\.length > 0\) \{[\s\S]*?\/\/ OLD LOGIC FALLBACK/m;
const blockReplacement = `if (dynamicFormSchema && dynamicFormSchema.length > 0) {
      if (typeof window.renderDynamicForm === 'function') {
          window.renderDynamicForm(dynamicFormSchema, properties, isFeatureEditMode, 'feature-info-content');
          return;
      }
  }
  // OLD LOGIC FALLBACK`;

content = content.replace(blockRegex, blockReplacement);

// 4. closeFeatureInfoModal update
const closeRegex = /function closeFeatureInfoModal\(keepLayer = false\) \{[\s\S]*?activeFeatureLayer = null;\s*\}/m;
const closeReplacement = `function closeFeatureInfoModal(keepLayer = false) {
  document.getElementById('feature-info-modal').classList.add('hidden');
  if (!keepLayer) {
    activeFeatureLayer = null;
    if (typeof clearHighlight === 'function') clearHighlight();
  }`;
content = content.replace(closeRegex, closeReplacement);

// 5. Add exports
const exportsRegex = /window\.printReport = printReport;[\s\S]*$/;
const exportsReplacement = `window.printReport = printReport;
window.switchDynamicTab = switchDynamicTab;
window.clearHighlight = clearHighlight;
`;
content = content.replace(exportsRegex, exportsReplacement);

fs.writeFileSync('src/main.js', content, 'utf8');
console.log('applyFix2 applied successfully');
