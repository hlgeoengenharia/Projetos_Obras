import openpyxl

path = r"c:\Users\Windows 11\Documents\Projetos\Projeto_V01\Projetos_Obras\dados_orcamento\SINAPI_Referência_2026_07.xlsx"
wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
ws = wb['CCD']

r_idx = 0
for r in ws.iter_rows(values_only=True):
    r_idx += 1
    if 9 <= r_idx <= 15:
        print(f"Row {r_idx}: {r[:10]}")
