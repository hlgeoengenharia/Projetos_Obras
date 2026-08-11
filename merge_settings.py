def merge_settings():
    with open('public/dashboard/settings.html', 'r', encoding='utf-8') as f:
        old_lines = f.readlines()

    with open('settings.html', 'r', encoding='utf-8') as f:
        new_lines = f.readlines()

    # Extract builder html: lines 305 to 411 (index 304 to 411)
    builder_html = "".join(old_lines[304:411])

    # Extract preview html: lines 412 to 431 (index 411 to 431)
    preview_html = "".join(old_lines[411:431])

    # Extract JS: lines 437 to 1935 (index 436 to 1935)
    js_code = "".join(old_lines[436:1935])

    # Now let's process new_lines
    final_lines = []
    i = 0
    while i < len(new_lines):
        line = new_lines[i]
        
        # Add supabase scripts in head
        if '</head>' in line:
            final_lines.append('  <!-- Supabase -->\n')
            final_lines.append('  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>\n')
            final_lines.append('  <script src="supabase-config.js"></script>\n')
            final_lines.append('</head>\n')
            i += 1
            continue

        # Modify the Novo Cadastro button to add onclick
        if 'Novo Cadastro' in line and '<button' in new_lines[i-1]:
            # Replace the previous line's <button ...> with onclick
            final_lines[-1] = final_lines[-1].replace('<button class="', '<button onclick="openFormBuilder()" class="')
            final_lines.append(line)
            i += 1
            continue
            
        # Replace the hardcoded table with <div id="forms-list">
        if '<div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm">' in line:
            final_lines.append('    <div id="forms-list" class="flex flex-col gap-4"></div>\n')
            final_lines.append(builder_html + '\n')
            final_lines.append(preview_html + '\n')
            
            # Skip until the end of the table div
            while i < len(new_lines) and '    </div>' not in new_lines[i] or '  </div>' not in new_lines[i+1]:
                i += 1
                if i >= len(new_lines) - 2: break
            
            # fast forward past the closing divs of the table
            while i < len(new_lines) and '  </div>' in new_lines[i] or '</div>' in new_lines[i]:
                i += 1
            continue

        # Skip the old switchTab script
        if '<script>' in line and 'function switchTab(tabId, btn)' in new_lines[i+1]:
            while i < len(new_lines) and '</script>' not in new_lines[i]:
                i += 1
            i += 1
            continue

        # Inject the new JS before </body>
        if '</body>' in line:
            final_lines.append(js_code + '\n')
            final_lines.append('</body>\n')
            i += 1
            continue

        final_lines.append(line)
        i += 1

    with open('settings.html', 'w', encoding='utf-8') as f:
        f.writelines(final_lines)

merge_settings()
print("Merged!")
