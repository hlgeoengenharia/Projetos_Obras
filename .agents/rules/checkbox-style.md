# Regra Global de Estilo de Checkbox (GeoGestor)

Sempre que criar, estilizar ou modificar qualquer `checkbox` (`<input type="checkbox">`) em qualquer tela, modal, tabela ou formulário do projeto:

1. **Aparência e Feedback Visual Evidente**:
   - **Desmarcado (`unchecked`)**: Caixa com borda nítida (`border: 2px solid #94a3b8` ou `border-slate-400`), cantos suavemente arredondados (`rounded-md` / `border-radius: 4px`), fundo claro/escuro limpo (`bg-white` / `dark:bg-slate-800`).
   - **Marcado (`checked`)**: Fundo preenchido em **Verde Esmeralda Vibrante** (`#10b981` / `bg-emerald-500` / `border-emerald-600`), com um **"✓" (V / checkmark)** branco nítido, centralizado e espesso (`border-width: 2.5px`), acompanhado de um sutil brilho neon (`box-shadow: 0 0 8px rgba(16, 185, 129, 0.45)`).
   - **Tamanho padrão**: `w-4.5 h-4.5` (mínimo `18px x 18px`) com `cursor: pointer`.

2. **Proibição Estrita**:
   - NUNCA usar checkboxes nativos acinzentados ou sem indicação visual clara de ativação.
   - NUNCA deixar o usuário na dúvida se um item está marcado ou desmarcado.
