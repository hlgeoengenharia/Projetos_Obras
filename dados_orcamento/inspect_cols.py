import openpyxl
import os

path = r"c:\Users\Windows 11\Documents\Projetos\Projeto_V01\Projetos_Obras\dados_orcamento\SINAPI_Referência_2026_07.xlsx"
wb = openpyxl.load_workbook(path, read_only=True, data_only=True)

for sname in ['CCD', 'ICD', 'Analítico']:
    ws = wb[sname]
    print(f"\n=== COLUNAS DA ABA {sname} ===")
    rows = []
    for r in ws.iter_rows(values_only=True):
        if any(r):
            rows.append(r)
            if len(rows) >= 8:
                break
    for i, r in enumerate(rows):
        print(f"Row {i+1}: {r[:20]}")
