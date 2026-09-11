"""Generate the public, nationwide lookup; never accepts customer/workbook input."""
import json
from pathlib import Path
from urllib.request import urlopen

URL = "https://api.dataforsyningen.dk/postnumre"
TARGET = Path(__file__).resolve().parents[1] / "frontend/src/data/postcodes.json"


def main():
    with urlopen(URL, timeout=60) as response:
        records = json.load(response)
    result = {}
    for row in records:
        center = row.get("visueltcenter")
        if center is None:
            continue
        lon, lat = center
        if not (-180 <= lon <= 180 and -90 <= lat <= 90):
            raise ValueError(f"Invalid public postcode center: {row['nr']}")
        result[row["nr"]] = {"name": row["navn"], "latitude": lat, "longitude": lon}
    if len(result) < 500:
        raise ValueError("Incomplete postcode response; refusing to replace lookup")
    TARGET.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Generated {len(result)} public postcode centers from {URL}")


if __name__ == "__main__":
    main()
