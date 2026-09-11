import openpyxl

path = r"c:\Users\Windows 11\Documents\Projetos\Projeto_V01\Projetos_Obras\dados_orcamento\SINAPI_Referência_2026_07.xlsx"
wb = openpyxl.load_workbook(path, read_only=True, data_only=True)

for sname in ['ICD', 'ISD', 'CCD', 'CSD', 'Analítico']:
    ws = wb[sname]
    print(f"\n====================================")
    print(f"ABA {sname}")
    print(f"====================================")
    r_idx = 0
    for r in ws.iter_rows(values_only=True):
        r_idx += 1
        if 8 <= r_idx <= 13:
            row_clean = [str(x) if x is not None else "" for x in r[:25]]
            print(f"Row {r_idx}: {row_clean}")
