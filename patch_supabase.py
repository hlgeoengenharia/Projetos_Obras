import re

with open('src/main.js', 'r', encoding='utf-8') as f:
    js = f.read()

# 1. Inject import at the top
js = "import { supabase } from './supabase.js';\n\n" + js

# 2. Replace loadThemesFromStorage
load_old = r"function loadThemesFromStorage\(\) \{.*?localStorage\.getItem\('constructive_themes'\).*?\}"
load_new = """async function loadThemesFromStorage() {
  const { data: dbTemas, error: errTemas } = await supabase.from('temas').select('*');
  const { data: dbFeicoes, error: errFeicoes } = await supabase.from('feicoes').select('*');
  
  themes = [];
  if (dbTemas) {
      for (let t of dbTemas) {
          let mappedTheme = {
              id: t.id,
              name: t.nome,
              color: t.cor,
              icon: t.icone,
              geometryType: t.tipo_geometria,
              cadastroType: t.tipo_cadastro,
              features: []
          };
          
          if (dbFeicoes) {
              const fcs = dbFeicoes.filter(f => f.theme_id === t.id);
              for (let fc of fcs) {
                  mappedTheme.features.push({
                      type: "Feature",
                      properties: { ...fc.propriedades, id_banco: fc.id },
                      geometry: fc.geometria
                  });
              }
          }
          themes.push(mappedTheme);
      }
  }
}"""
js = re.sub(load_old, load_new, js, flags=re.DOTALL)

# 3. Replace saveThemesToStorage (just make it a no-op as syncMapDataToThemes handles it)
save_old = r"function saveThemesToStorage\(\) \{.*?localStorage\.setItem.*?\}"
save_new = """function saveThemesToStorage() {
  // Substituido por operações diretas no Supabase nas outras funções
}"""
js = re.sub(save_old, save_new, js, flags=re.DOTALL)

# 4. Replace saveNewTheme
saveNewTheme_old = r"function saveNewTheme\(\) \{.*?themes\.push\(newTheme\);.*?saveThemesToStorage\(\);.*?closeNewThemeModal\(\);.*?\}"
saveNewTheme_new = """async function saveNewTheme() {
  const name = document.getElementById('theme-name').value;
  const color = document.getElementById('theme-color').value;
  const icon = document.getElementById('theme-icon').value;
  const geom = document.getElementById('theme-geometry').value;
  const cadastro = document.getElementById('theme-cadastro-type') ? document.getElementById('theme-cadastro-type').value : 'padrao';
  
  if(!name) { alert('Digite o nome'); return; }
  
  const { data, error } = await supabase.from('temas').insert({
      nome: name,
      cor: color,
      icone: icon,
      tipo_geometria: geom,
      tipo_cadastro: cadastro
  }).select();
  
  if (data && data.length > 0) {
      const t = data[0];
      themes.push({
          id: t.id,
          name: t.nome,
          color: t.cor,
          icon: t.icone,
          geometryType: t.tipo_geometria,
          cadastroType: t.tipo_cadastro,
          features: []
      });
  } else {
      console.error(error);
  }
  
  renderThemes();
  closeNewThemeModal();
}"""
js = re.sub(saveNewTheme_old, saveNewTheme_new, js, flags=re.DOTALL)

# 5. Replace syncMapDataToThemes
sync_old = r"function syncMapDataToThemes\(\) \{.*?saveThemesToStorage\(\);.*?\}"
sync_new = """async function syncMapDataToThemes() {
  const allFeatures = geojsonLayer.toGeoJSON().features;
  
  themes.forEach(t => t.features = []);
  
  for (const f of allFeatures) {
      const tId = f.properties.themeId;
      const theme = themes.find(t => t.id === tId);
      if (theme) {
          theme.features.push(f);
      }
      
      const dbPayload = {
          theme_id: tId,
          propriedades: f.properties,
          geometria: f.geometry
      };
      
      if (f.properties.id_banco) {
          dbPayload.id = f.properties.id_banco;
      }
      
      const { data, error } = await supabase.from('feicoes').upsert(dbPayload).select();
      if (data && data.length > 0) {
          f.properties.id_banco = data[0].id;
      }
  }
  renderFeatureTable();
}"""
js = re.sub(sync_old, sync_new, js, flags=re.DOTALL)

# 6. Replace deleteActiveFeature to delete from Supabase
deleteFeature_old = r"function deleteActiveFeature\(\) \{.*?map\.removeLayer\(activeFeatureLayer\);.*?syncMapDataToThemes\(\);.*?\}"
deleteFeature_new = """async function deleteActiveFeature() {
  if (confirm('Excluir esta feição?')) {
    const idBanco = activeFeatureLayer.feature.properties.id_banco;
    if (idBanco) {
        await supabase.from('feicoes').delete().eq('id', idBanco);
    }
    map.removeLayer(activeFeatureLayer);
    closeFeatureInfoModal();
    syncMapDataToThemes();
  }
}"""
js = re.sub(deleteFeature_old, deleteFeature_new, js, flags=re.DOTALL)

with open('src/main.js', 'w', encoding='utf-8') as f:
    f.write(js)
