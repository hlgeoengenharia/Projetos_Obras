import xlrd

path = r"c:\Users\Windows 11\Documents\Projetos\Projeto_V01\Projetos_Obras\dados_orcamento\BASE MODELO ORÇAMENTO.xls"
wb = xlrd.open_workbook(path, formatting_info=False)
sh = wb.sheet_by_name("ORÇ_ANEXO SEMOB_DES")

print("=== ITENS DA PLANILHA ORÇAMENTÁRIA (ORÇ_ANEXO SEMOB_DES) ===")
for r in range(11, min(sh.nrows, 30)):
    row = sh.row_values(r)
    # print non empty
    print(f"L{r+1}: {row[:9]}")
