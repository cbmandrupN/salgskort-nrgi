from app.services.address import normalize_address
import pytest

def test_normalizes_danish_address():
    result = normalize_address("  Tingodden   3, 6960   Hvide Sande ")
    assert result.normalized == "Tingodden 3, 6960 Hvide Sande"
    assert result.postal_code == "6960"

def test_rejects_missing_postal_code():
    with pytest.raises(ValueError):
        normalize_address("Tingodden 3, Hvide Sande")
