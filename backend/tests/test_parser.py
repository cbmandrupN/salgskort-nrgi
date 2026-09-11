from io import BytesIO
from openpyxl import Workbook
from app.services.excel_parser import parse_workbook

def test_parser_maps_headers_and_surfaces_bad_row():
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Salgskort"
    sheet.append(["Sagsnummer", "Kunde", "Adresse", "Rådgiver", "Status"])
    sheet.append(["A-1", "Test", "Tingodden 3, 6960 Hvide Sande", "Mette", "I gang"])
    sheet.append(["A-2", "Broken", "Uden postnummer", "Lars", "Ny"])
    stream = BytesIO()
    workbook.save(stream)
    result = parse_workbook(stream.getvalue(), "Salgskort")
    assert len(result.cases) == 2
    assert result.cases[0].postal_code == "6960"
    assert result.cases[1].geocode_status.value == "fejlet"
    assert any(issue.row_number == 3 for issue in result.issues)
