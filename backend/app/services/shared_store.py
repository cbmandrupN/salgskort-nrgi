"""Transactional single-snapshot SQLite store, independent of the demo/Graph pipeline."""
from __future__ import annotations

import logging
import sqlite3
from contextlib import contextmanager
from datetime import UTC, datetime

from fastapi import HTTPException
from pydantic import ValidationError

from app.schemas.shared import SharedData, SharedSnapshot, SharedWrite

logger = logging.getLogger(__name__)
MAX_JSON_BYTES = 10 * 1024 * 1024


@contextmanager
def database(path: str):
    if not path or path == ":memory:" or path.startswith("file:"):
        raise HTTPException(503, "Shared storage is not configured")
    connection = None
    try:
        connection = sqlite3.connect(path, timeout=5)
        connection.execute("PRAGMA secure_delete=ON")
        connection.execute("BEGIN IMMEDIATE")
        connection.execute(
            "CREATE TABLE IF NOT EXISTS shared_snapshot ("
            "singleton INTEGER PRIMARY KEY CHECK (singleton = 1), "
            "revision INTEGER NOT NULL, file_name TEXT NOT NULL, "
            "uploaded_at TEXT NOT NULL, data TEXT NOT NULL)"
        )
        yield connection
        connection.commit()
    except (sqlite3.Error, OSError, ValidationError, ValueError, OverflowError) as exc:
        # Exception messages/tracebacks may contain paths or submitted values.
        logger.warning("Shared storage unavailable (%s)", type(exc).__name__)
        raise HTTPException(503, "Shared storage is unavailable") from None
    finally:
        if connection is not None:
            connection.close()  # Rolls back any uncommitted changes, including failed writes.


def read_snapshot(path: str) -> SharedSnapshot:
    with database(path) as connection:
        row = connection.execute(
            "SELECT revision, file_name, uploaded_at, data FROM shared_snapshot WHERE singleton = 1"
        ).fetchone()
        if row is None:
            return SharedSnapshot()
        return SharedSnapshot(
            revision=row[0], file_name=row[1], uploaded_at=row[2],
            data=SharedData.model_validate_json(row[3]),
        )


def replace_snapshot(path: str, payload: SharedWrite) -> SharedSnapshot:
    with database(path) as connection:
        row = connection.execute(
            "SELECT revision FROM shared_snapshot WHERE singleton = 1"
        ).fetchone()
        revision = row[0] if row else 0
        if payload.expected_revision != revision:
            raise HTTPException(409, "The shared snapshot changed; reload before replacing it")
        uploaded_at = datetime.now(UTC)
        data = payload.data.model_copy(update={
            "meta": payload.data.meta.model_copy(update={"fetched_at": uploaded_at}),
        })
        serialized = data.model_dump_json(exclude_none=True)
        if len(serialized.encode("utf-8")) > MAX_JSON_BYTES:
            raise HTTPException(413, "Shared snapshot exceeds 10 MiB")
        result = SharedSnapshot(
            revision=revision + 1, file_name=payload.file_name,
            uploaded_at=uploaded_at, data=data,
        )
        connection.execute(
            "INSERT INTO shared_snapshot (singleton, revision, file_name, uploaded_at, data) "
            "VALUES (1, ?, ?, ?, ?) ON CONFLICT(singleton) DO UPDATE SET "
            "revision=excluded.revision, file_name=excluded.file_name, "
            "uploaded_at=excluded.uploaded_at, data=excluded.data",
            (result.revision, result.file_name, result.uploaded_at.isoformat(), serialized),
        )
        return result
