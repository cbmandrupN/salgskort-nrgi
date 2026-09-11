"""Normalization for Danish street addresses.

Target canonical form: "Vejnavn husnr[, etage/dør], postnr By"
e.g. "Tingodden 3, 6960 Hvide Sande" or "Rådhuspladsen 1, 2. tv, 8000 Aarhus C".
"""
from __future__ import annotations

import re
from dataclasses import dataclass

_POSTAL_CITY_RE = re.compile(r"(?P<postal>\d{4})\s+(?P<city>.+)$")
_HOUSE_NUMBER_RE = re.compile(
    r"^(?P<street>.+?)\s+(?P<house>\d+[a-zA-Z]?(?:[-–]\d+[a-zA-Z]?)?)\s*(?P<rest>.*)$"
)
_WHITESPACE_RE = re.compile(r"\s+")


@dataclass
class NormalizedAddress:
    normalized: str
    street: str | None
    house_number: str | None
    postal_code: str | None
    city: str | None


class AddressNormalizationError(ValueError):
    """Raised when an address string cannot be parsed into its components."""


def normalize_address(raw: str) -> NormalizedAddress:
    """Parses a free-text Danish address into structured, normalized components.

    Raises AddressNormalizationError if the string doesn't contain at least a
    plausible street/number and a 4-digit postal code — callers must surface
    this as a row issue rather than silently dropping the row.
    """
    if not raw or not raw.strip():
        raise AddressNormalizationError("Adressen er tom")

    text = _WHITESPACE_RE.sub(" ", raw.strip())

    # Split off "postnr by" from the tail (after the last comma, or from a
    # trailing 4-digit-code pattern if there's no comma).
    postal: str | None = None
    city: str | None = None
    head = text

    if "," in text:
        head, tail = text.rsplit(",", 1)
        m = _POSTAL_CITY_RE.search(tail.strip())
        if m:
            postal = m.group("postal")
            city = m.group("city").strip()
        else:
            # tail wasn't a postal/city segment; keep it as part of head (e.g. floor info)
            head = text
    else:
        m = _POSTAL_CITY_RE.search(text)
        if m:
            postal = m.group("postal")
            city = m.group("city").strip()
            head = text[: m.start()].strip().rstrip(",")

    if not postal or not city:
        raise AddressNormalizationError(
            f"Kunne ikke finde postnummer og by i adressen: '{raw}'"
        )

    street: str | None = None
    house: str | None = None
    m2 = _HOUSE_NUMBER_RE.match(head.strip())
    if m2:
        street = m2.group("street").strip()
        house = m2.group("house").strip()
        rest = m2.group("rest").strip()
    else:
        street = head.strip() or None
        rest = ""

    if not street:
        raise AddressNormalizationError(f"Kunne ikke finde vejnavn i adressen: '{raw}'")

    line1 = f"{street} {house}".strip() if house else street
    if rest:
        line1 = f"{line1}, {rest}"

    normalized = f"{line1}, {postal} {city}"

    return NormalizedAddress(
        normalized=normalized,
        street=street,
        house_number=house,
        postal_code=postal,
        city=city,
    )
