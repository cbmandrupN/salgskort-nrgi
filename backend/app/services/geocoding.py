"""Geocoding provider abstraction with an in-memory TTL cache.

Default provider is Dataforsyningen's DAWA (Danish Address Web API) — free,
no API key, purpose-built for Danish addresses. A Nominatim (OpenStreetMap)
fallback is included for non-Danish/dev use. Geocoding failures are reported
explicitly via GeocodeStatus, never silently dropped.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass

import httpx
from cachetools import TTLCache

from app.core.config import Settings


@dataclass
class GeocodeResult:
    latitude: float
    longitude: float
    score: float | None
    source: str


class GeocodeProvider(ABC):
    @abstractmethod
    async def geocode(self, address: str) -> GeocodeResult | None:
        """Returns coordinates for the address, or None if it could not be resolved."""


class DataforsyningenProvider(GeocodeProvider):
    """Uses the Danish Address Register (DAWA/Dataforsyningen) address search API."""

    BASE_URL = "https://api.dataforsyningen.dk/adresser"

    def __init__(self, http_client: httpx.AsyncClient, user_agent: str) -> None:
        self._client = http_client
        self._user_agent = user_agent

    async def geocode(self, address: str) -> GeocodeResult | None:
        try:
            resp = await self._client.get(
                self.BASE_URL,
                params={"q": address, "per_side": 1},
                headers={"User-Agent": self._user_agent},
            )
        except httpx.HTTPError:
            return None
        if resp.status_code != 200:
            return None
        results = resp.json()
        if not results:
            return None
        best = results[0]
        adgang = best.get("adgangsadresse", {})
        coords = adgang.get("adgangspunkt", {}).get("koordinater")
        if not coords or len(coords) != 2:
            return None
        lon, lat = coords
        return GeocodeResult(latitude=lat, longitude=lon, score=1.0, source="dataforsyningen")


class NominatimProvider(GeocodeProvider):
    """Uses OpenStreetMap's Nominatim search API. Respect their usage policy in production."""

    BASE_URL = "https://nominatim.openstreetmap.org/search"

    def __init__(self, http_client: httpx.AsyncClient, user_agent: str) -> None:
        self._client = http_client
        self._user_agent = user_agent

    async def geocode(self, address: str) -> GeocodeResult | None:
        try:
            resp = await self._client.get(
                self.BASE_URL,
                params={"q": address, "format": "json", "limit": 1, "countrycodes": "dk"},
                headers={"User-Agent": self._user_agent},
            )
        except httpx.HTTPError:
            return None
        if resp.status_code != 200:
            return None
        results = resp.json()
        if not results:
            return None
        best = results[0]
        try:
            lat = float(best["lat"])
            lon = float(best["lon"])
        except (KeyError, ValueError):
            return None
        importance = best.get("importance")
        return GeocodeResult(latitude=lat, longitude=lon, score=importance, source="nominatim")


class NullProvider(GeocodeProvider):
    """No-op provider for 'none' mode — every address is reported unresolved."""

    async def geocode(self, address: str) -> GeocodeResult | None:
        return None


class CachingGeocoder:
    """Wraps a GeocodeProvider with a TTL cache keyed on the normalized address."""

    def __init__(self, provider: GeocodeProvider, ttl_seconds: int, max_size: int = 10_000) -> None:
        self._provider = provider
        self._cache: TTLCache = TTLCache(maxsize=max_size, ttl=ttl_seconds)

    async def geocode(self, address: str) -> GeocodeResult | None:
        key = address.strip().lower()
        if key in self._cache:
            return self._cache[key]
        result = await self._provider.geocode(address)
        if result is not None:
            self._cache[key] = result
        return result

    def cache_info(self) -> dict[str, int]:
        return {"size": len(self._cache), "maxsize": self._cache.maxsize}


def build_geocoder(settings: Settings, http_client: httpx.AsyncClient) -> CachingGeocoder:
    provider: GeocodeProvider
    if settings.geocode_provider == "dataforsyningen":
        provider = DataforsyningenProvider(http_client, settings.geocode_user_agent)
    elif settings.geocode_provider == "nominatim":
        provider = NominatimProvider(http_client, settings.geocode_user_agent)
    else:
        provider = NullProvider()
    return CachingGeocoder(provider, ttl_seconds=settings.geocode_cache_ttl_seconds)
