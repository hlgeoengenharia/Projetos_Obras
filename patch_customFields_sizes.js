const fs = require('fs');

let content = fs.readFileSync('src/customFields.js', 'utf8');

// Title size
content = content.replaceAll('font-semibold text-sm text-slate', 'font-semibold text-base text-slate');

// Metadata size
content = content.replaceAll('text-[11px] text-slate-500', 'text-sm text-slate-500');
content = content.replaceAll('text-[11px] text-red-400', 'text-sm text-red-400');

// Card padding (from p-3 to p-4)
content = content.replaceAll('bg-slate-800 p-3 rounded-xl', 'bg-slate-800 p-4 rounded-xl');
content = content.replaceAll('bg-slate-900/50 p-3 rounded-xl', 'bg-slate-900/50 p-4 rounded-xl');

// Document icon size (w-10 h-10 to w-12 h-12, icon from 20px to 24px)
content = content.replaceAll('w-10 h-10 rounded-lg bg-blue-50', 'w-12 h-12 rounded-xl bg-blue-50');
content = content.replaceAll('w-10 h-10 rounded-lg bg-red-50', 'w-12 h-12 rounded-xl bg-red-50');
content = content.replaceAll('text-[20px]">description</span>', 'text-[24px]">description</span>');
content = content.replaceAll('text-[20px]">delete</span>', 'text-[24px]">delete</span>');

// Photo thumbnail size (w-12 h-12 to w-14 h-14)
content = content.replaceAll('w-12 h-12 rounded-lg bg-slate-100', 'w-14 h-14 rounded-xl bg-slate-100');
content = content.replaceAll('relative w-12 h-12 rounded-lg bg-red-50', 'relative w-14 h-14 rounded-xl bg-red-50');

// Action buttons size (text-[18px] to text-[20px])
content = content.replaceAll('text-[18px]">edit</span>', 'text-[20px]">edit</span>');
content = content.replaceAll('text-[18px]">open_in_new</span>', 'text-[20px]">open_in_new</span>');
content = content.replaceAll('text-[18px]">delete</span>', 'text-[20px]">delete</span>');
content = content.replaceAll('text-[16px]">undo</span>', 'text-[18px]">undo</span>');
content = content.replaceAll('p-1.5 rounded-lg text-slate-400', 'p-2 rounded-lg text-slate-400');

fs.writeFileSync('src/customFields.js', content, 'utf8');
console.log('customFields.js sizes increased!');
