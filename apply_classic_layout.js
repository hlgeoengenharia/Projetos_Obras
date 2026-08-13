const fs = require('fs');
let content = fs.readFileSync('src/customFields.js', 'utf8');

// I will just use robust strings since I know the code.

content = content.replace(
    /<div class="flex items-center justify-between gap-4 bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-70\/60 shadow-sm w-full mb-2">[\s\S]*?<\/div>\s*<\/div>/g,
    `<div class="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700 w-full shadow-sm mb-2">
        <div class="flex items-center gap-3 overflow-hidden flex-1 min-w-[150px]">
            \${leftIconActive}
            <div class="flex flex-col overflow-hidden w-full">
                <div class="font-semibold text-base truncate" title="\${title}">\${title || 'Sem título'}</div>
                <div class="text-sm text-slate-500 mt-1 truncate">Arq: \${name}</div>
            </div>
        </div>
        <div class="flex flex-col gap-1 min-w-[150px] text-slate-500 border-l border-slate-200 dark:border-slate-700 pl-4">
            <div class="flex items-center gap-1 truncate"><span class="material-symbols-outlined text-[16px]">person</span> \${author}</div>
            <div class="flex items-center gap-1 truncate"><span class="material-symbols-outlined text-[16px]">calendar_today</span> \${dateStr}</div>
        </div>
        <div class="flex items-center gap-2">
            <a href="\${url}" target="_blank" class="text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-3 py-1.5 rounded border border-blue-200 dark:border-blue-800 hover:bg-blue-100 transition-colors font-medium flex items-center justify-center gap-1 whitespace-nowrap">
                <span class="material-symbols-outlined text-[16px]">visibility</span> Abrir
            </a>
        </div>
    </div>`
);

fs.writeFileSync('src/customFields.js', content, 'utf8');
console.log('Fixed renderCustomFields');
