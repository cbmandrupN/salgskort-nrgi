"""HTTP Basic team access with bounded, process-local failure throttling."""
from __future__ import annotations

import base64
import binascii
import secrets
import threading
import time
from collections import OrderedDict, deque

from fastapi import HTTPException, Request

from app.core.config import get_settings

BASIC_HEADERS = {"WWW-Authenticate": 'Basic realm="Salgskort shared", charset="UTF-8"'}


class LoginFailureLimiter:
    def __init__(self, limit: int = 10, window: int = 300, max_clients: int = 4096):
        self.limit = limit
        self.window = window
        self.max_clients = max_clients
        self.failures: OrderedDict[str, deque[float]] = OrderedDict()
        self.lock = threading.Lock()

    def limited(self, client: str) -> bool:
        now = time.monotonic()
        with self.lock:
            for key in list(self.failures):
                entries = self.failures[key]
                while entries and entries[0] <= now - self.window:
                    entries.popleft()
                if not entries:
                    del self.failures[key]
            entries = self.failures.get(client)
            if entries is None:
                return len(self.failures) >= self.max_clients
            return len(entries) >= self.limit

    def record_failure(self, client: str) -> None:
        with self.lock:
            if client not in self.failures:
                if len(self.failures) >= self.max_clients:
                    return
                self.failures[client] = deque(maxlen=self.limit)
            self.failures[client].append(time.monotonic())


login_limiter = LoginFailureLimiter()


async def require_shared_access(request: Request) -> None:
    code = get_settings().shared_access_code
    if len(code.strip()) < 24:
        raise HTTPException(503, "Shared access is not configured")
    client = request.client.host if request.client else "unknown"
    if login_limiter.limited(client):
        raise HTTPException(429, "Too many authentication failures", headers={"Retry-After": "300"})
    username, password = "", ""
    scheme, _, encoded = request.headers.get("authorization", "").partition(" ")
    try:
        if scheme.lower() == "basic":
            decoded = base64.b64decode(encoded, validate=True).decode("utf-8")
            username, password = decoded.split(":", 1)
    except (ValueError, UnicodeError, binascii.Error):
        username, password = "", ""
    username_ok = secrets.compare_digest(username.encode("utf-8"), b"nrgi")
    password_ok = secrets.compare_digest(password.encode("utf-8"), code.encode("utf-8"))
    if not (username_ok and password_ok):
        login_limiter.record_failure(client)
        raise HTTPException(401, "Invalid shared access credentials", headers=BASIC_HEADERS)
