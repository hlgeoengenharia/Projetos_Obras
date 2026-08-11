import re

with open('../dashboard/code.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Extract script content
script_match = re.search(r'<script>(.*?)</script>', content, re.DOTALL)
js_content = script_match.group(1) if script_match else ''

# Extract CSS content
style_match = re.search(r'<style>(.*?)</style>', content, re.DOTALL)
css_content = style_match.group(1) if style_match else ''

# Remove script and style from html
html_content = re.sub(r'<script>.*?</script>', '', content, flags=re.DOTALL)
html_content = re.sub(r'<style>.*?</style>', '', html_content, flags=re.DOTALL)

# Add module script link to html
html_content = html_content.replace('</body>', '<script type="module" src="/src/main.js"></script>\n</body>')

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(html_content)

with open('src/main.js', 'w', encoding='utf-8') as f:
    f.write(js_content)

with open('src/style.css', 'a', encoding='utf-8') as f:
    f.write('\n' + css_content)
