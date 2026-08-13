const fs = require('fs');

let mainJs = fs.readFileSync('src/main.js', 'utf8');
const oldSwitchStr = `function switchDynamicTab(tabId) {
    document.querySelectorAll('.accordion-content').forEach(el => {
        el.classList.remove('block');
        el.classList.add('hidden');
    });
    const target = document.getElementById('acc-content-' + tabId);
    if (target) {
        target.classList.remove('hidden');
        target.classList.add('block');
    }
}`;
mainJs = mainJs.replace(oldSwitchStr, '');
mainJs = mainJs.replace('window.switchDynamicTab = switchDynamicTab;', '');
fs.writeFileSync('src/main.js', mainJs);
console.log('src/main.js patched (removed switchDynamicTab)');

// 2. Add Proj4 to index.html and settings.html
function addProj4(filePath) {
    let html = fs.readFileSync(filePath, 'utf8');
    if (!html.includes('proj4.js')) {
        html = html.replace(
            '</head>',
            '    <script src="https://cdnjs.cloudflare.com/ajax/libs/proj4js/2.9.0/proj4.js"></script>\n</head>'
        );
        fs.writeFileSync(filePath, html);
        console.log(`${filePath} patched (added proj4)`);
    }
}
addProj4('index.html');
if (fs.existsSync('settings.html')) addProj4('settings.html');

// 3. Patch customFields.js
let cfJs = fs.readFileSync('src/customFields.js', 'utf8');

// Inject formatDMS and formatUTM
const dmsUtmFunctions = `
function formatDMS(lat, lng) {
    const toDMS = (deg, isLat) => {
        const absolute = Math.abs(deg);
        const degrees = Math.floor(absolute);
        const minutesNotTruncated = (absolute - degrees) * 60;
        const minutes = Math.floor(minutesNotTruncated);
        const seconds = Math.floor((minutesNotTruncated - minutes) * 60);
        const dir = isLat ? (deg >= 0 ? 'N' : 'S') : (deg >= 0 ? 'E' : 'W');
        return \`\${degrees}° \${minutes}' \${seconds}" \${dir}\`;
    };
    return \`\${toDMS(lat, true)}, \${toDMS(lng, false)}\`;
}

function formatUTM(lat, lng) {
    if (typeof proj4 === 'undefined') return "Proj4 não carregado";
    const zone = Math.floor((lng + 180) / 6) + 1;
    const isNorth = lat >= 0;
    const projStr = \`+proj=utm +zone=\${zone} \${isNorth ? '+north' : '+south'} +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs\`;
    try {
        const coords = proj4('EPSG:4326', projStr, [lng, lat]);
        return \`Zona \${zone}\${isNorth ? 'N' : 'S'}, X: \${coords[0].toFixed(2)} E, Y: \${coords[1].toFixed(2)} N\`;
    } catch(e) {
        return "Erro ao calcular UTM";
    }
}
`;

if (!cfJs.includes('function formatDMS')) {
    cfJs = cfJs + '\n' + dmsUtmFunctions;
}

// Replace generation logic for geolocation
const oldGeolocationHtml = /\} else if \(f\.type === 'geolocation'\) \{[\s\S]*?\} else if \(f\.type === 'cpfcnpj'\) \{/;
const newGeolocationHtml = `} else if (f.type === 'geolocation') {
        let decStr = "N/A", dmsStr = "N/A", utmStr = "N/A";
        if (typeof activeFeatureLayer !== 'undefined' && activeFeatureLayer) {
            let latlng = null;
            if (typeof activeFeatureLayer.getLatLng === 'function') latlng = activeFeatureLayer.getLatLng();
            else if (typeof activeFeatureLayer.getBounds === 'function') latlng = activeFeatureLayer.getBounds().getCenter();
            
            if (latlng) {
                decStr = \`\${latlng.lat.toFixed(6)}, \${latlng.lng.toFixed(6)}\`;
                if(typeof formatDMS === 'function') {
                    dmsStr = formatDMS(latlng.lat, latlng.lng);
                    utmStr = formatUTM(latlng.lat, latlng.lng);
                }
            }
        }
        
        html += \`
            <div class="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-4">
                <div class="flex items-center justify-between mb-1">
                   <h4 class="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1"><span class="material-symbols-outlined text-[16px]">location_on</span> Dados de Localização</h4>
                   <button type="button" onclick="updateGeolocation('\${f.id}')" class="p-1.5 bg-blue-50 text-blue-600 rounded hover:bg-blue-100 transition-colors tooltip" title="Atualizar Coordenadas"><span class="material-symbols-outlined text-[16px]">refresh</span></button>
                </div>
                
                <div class="space-y-1">
                    <span class="text-[10px] uppercase text-slate-400 font-bold block">Geográfica (Decimal)</span>
                    <div id="geo-dec-\${f.id}" class="text-sm font-mono text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 px-3 py-2 rounded border border-slate-200 dark:border-slate-700 select-all">\${decStr}</div>
                </div>
                <div class="space-y-1">
                    <span class="text-[10px] uppercase text-slate-400 font-bold block">Geográfica (GMS)</span>
                    <div id="geo-dms-\${f.id}" class="text-sm font-mono text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 px-3 py-2 rounded border border-slate-200 dark:border-slate-700 select-all">\${dmsStr}</div>
                </div>
                <div class="space-y-1">
                    <span class="text-[10px] uppercase text-slate-400 font-bold block">UTM (SIRGAS 2000)</span>
                    <div id="geo-utm-\${f.id}" class="text-sm font-mono text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 px-3 py-2 rounded border border-slate-200 dark:border-slate-700 select-all">\${utmStr}</div>
                </div>
                
                <input type="hidden" data-key="\${f.id}" id="geo-input-\${f.id}" class="feature-data-input" value='\${value || ''}'>
            </div>
        \`;
    } else if (f.type === 'cpfcnpj') {`;

cfJs = cfJs.replace(oldGeolocationHtml, newGeolocationHtml);

// Replace updateGeolocation function
const oldUpdateGeo = /function updateGeolocation\(fieldId\) \{[\s\S]*?^\}/m;
// Let's use a regex that safely matches the whole function
const oldUpdateGeoSafe = /function updateGeolocation\(fieldId\) \{[\s\S]*?\n\}/;
const newUpdateGeo = `function updateGeolocation(fieldId) {
    if (typeof activeFeatureLayer !== 'undefined' && activeFeatureLayer) {
        let latlng = null;
        if (typeof activeFeatureLayer.getLatLng === 'function') latlng = activeFeatureLayer.getLatLng();
        else if (typeof activeFeatureLayer.getBounds === 'function') latlng = activeFeatureLayer.getBounds().getCenter();
        
        if (latlng) {
            const dec = document.getElementById(\`geo-dec-\${fieldId}\`);
            const dms = document.getElementById(\`geo-dms-\${fieldId}\`);
            const utm = document.getElementById(\`geo-utm-\${fieldId}\`);
            
            if (dec) dec.innerText = \`\${latlng.lat.toFixed(6)}, \${latlng.lng.toFixed(6)}\`;
            if (dms && typeof formatDMS === 'function') dms.innerText = formatDMS(latlng.lat, latlng.lng);
            if (utm && typeof formatUTM === 'function') utm.innerText = formatUTM(latlng.lat, latlng.lng);
        }
    }
}`;
cfJs = cfJs.replace(oldUpdateGeoSafe, newUpdateGeo);

fs.writeFileSync('src/customFields.js', cfJs);
console.log('src/customFields.js patched');
