import xlrd
import os

path = r"c:\Users\Windows 11\Documents\Projetos\Projeto_V01\Projetos_Obras\dados_orcamento\BASE MODELO ORÇAMENTO.xls"
wb = xlrd.open_workbook(path, formatting_info=False)

def show_headers_and_sample(sheet_name, max_r=20):
    sh = wb.sheet_by_name(sheet_name)
    print(f"\n==========================================")
    print(f"ABA: {sheet_name} (Total Linhas: {sh.nrows}, Colunas: {sh.ncols})")
    print(f"==========================================")
    for r in range(min(max_r, sh.nrows)):
        row = sh.row_values(r)
        # show if row has text
        txts = [f"Col{c}[{sh.cell_type(r, c)}]: {repr(row[c])}" for c in range(sh.ncols) if str(row[c]).strip() != ""]
        if txts:
            print(f"Linha {r+1}:")
            for t in txts[:8]:
                print(f"   {t}")

show_headers_and_sample("ORÇ_ANEXO SEMOB_DES", 25)
show_headers_and_sample("SINAPI JUNHO-2026_DES", 15)
show_headers_and_sample("BDI_DES_EDIFICAÇÃO", 18)
show_headers_and_sample("Cronograma", 25)
