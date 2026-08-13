const fs = require('fs');
let content = fs.readFileSync('src/main.js', 'utf8');
const search = `        if (tab.fields && tab.fields.length > 0) {
         html += \`</div></div>\`;
      });`;
const replace = `         if (tab.fields && tab.fields.length > 0) {
            html += '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">';
            tab.fields.forEach(f => {
               const value = properties[f.id] || '';
               html += \`
                  <div class="col-span-1 \${f.type === 'textarea' || f.type === 'geolocation' || f.type === 'photo' ? 'md:col-span-2' : ''}">
                    <label class="block text.xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">\${f.label}</label>
               \`;
               if (typeof generateFeatureInputHtml === 'function') {
                   html += generateFeatureInputHtml(f, value, isFeatureEditMode);
               }
               html += \`</div>\;
`
            });
            html += '</div>';
         }
         html += \`</div></div>\;
`
      });`;
content = content.replace(search, replace);
fs.writeFileSync('src/main.js', content);
