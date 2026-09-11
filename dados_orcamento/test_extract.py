import openpyxl
import re

def extrair_codigo_hyperlink(val):
    if val is None:
        return None
    val_str = str(val).strip()
    m = re.findall(r'\d+', val_str)
    if m:
        # return the last match of digits or match of 4-7 digits
        for cand in reversed(m):
            if len(cand) >= 4:
                return int(cand)
        return int(m[-1])
    return None

path = r"c:\Users\Windows 11\Documents\Projetos\Projeto_V01\Projetos_Obras\dados_orcamento\SINAPI_Referência_2026_07.xlsx"
wb = openpyxl.load_workbook(path, read_only=True, data_only=False)
ws = wb['CCD']
for i, r in enumerate(list(ws.iter_rows(values_only=True))[10:15]):
    raw = r[1]
    extracted = extrair_codigo_hyperlink(raw)
    print(f"Row {i+11}: raw={repr(raw)[:60]}... -> extracted={extracted}")
