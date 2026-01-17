"""
Database configuration with Supabase (shared) and SQLite (local fallback) support.

Provides:
- SQLAlchemy engine and session management for the agent/flow system
- Legacy RunDatabase class for backward compatibility with evaluation runs
- Automatic detection: uses Supabase if DATABASE_URL is set, otherwise SQLite
"""

import os
import sqlite3
from pathlib import Path
from typing import Dict, List, Any, Optional
from datetime import datetime
import json

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, Session
from dotenv import load_dotenv

from src.models import Base

load_dotenv()

# Database config - prefer Supabase if available, fallback to SQLite
SQLITE_PATH = "data/runs.db"
SUPABASE_URL = os.getenv("DATABASE_URL")

# Determine which database to use
if SUPABASE_URL:
    # Remove pgbouncer parameter - not supported by psycopg2
    DATABASE_URL = SUPABASE_URL.split("?")[0]
    USE_SUPABASE = True
    print(f"[DB] Using Supabase: {DATABASE_URL.split('@')[1] if '@' in DATABASE_URL else 'configured'}")
else:
    DATABASE_URL = f"sqlite:///{SQLITE_PATH}"
    USE_SUPABASE = False
    print(f"[DB] Using SQLite: {SQLITE_PATH}")

# SQLAlchemy engine configuration
if USE_SUPABASE:
    # Postgres/Supabase config
    engine = create_engine(
        DATABASE_URL,
        echo=False,
        pool_size=10,
        max_overflow=20,
        pool_pre_ping=True,
        pool_recycle=300,  # Recycle connections every 5 min for pgbouncer compatibility
    )
else:
    # SQLite config
    Path(SQLITE_PATH).parent.mkdir(parents=True, exist_ok=True)
    engine = create_engine(
        DATABASE_URL,
        echo=False,
        connect_args={"check_same_thread": False},
        pool_size=30,
        max_overflow=15,
        pool_pre_ping=True,
        pool_recycle=3600,
    )

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def init_db():
    """Initialize all database tables. Call this on startup."""
    if not USE_SUPABASE:
        Path(SQLITE_PATH).parent.mkdir(parents=True, exist_ok=True)
    Base.metadata.create_all(engine)

    # For Supabase, also ensure the legacy 'runs' table exists
    if USE_SUPABASE:
        with engine.connect() as conn:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS runs (
                    id SERIAL PRIMARY KEY,
                    task_type VARCHAR NOT NULL,
                    prompt TEXT,
                    system_prompt TEXT,
                    model VARCHAR,
                    metrics JSONB NOT NULL,
                    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    duration_seconds FLOAT,
                    num_examples INTEGER,
                    metadata JSONB,
                    tags JSONB,
                    outputs JSONB
                )
            """))
            conn.commit()


def get_session() -> Session:
    """Get a new database session. Caller is responsible for closing it."""
    return SessionLocal()


def get_db_info() -> Dict[str, Any]:
    """Get information about the current database connection."""
    return {
        "type": "supabase" if USE_SUPABASE else "sqlite",
        "url": DATABASE_URL.split('@')[1] if USE_SUPABASE and '@' in DATABASE_URL else SQLITE_PATH,
    }


class RunDatabase:
    """
    Manages database for evaluation run records.
    Supports both SQLite (local) and Supabase (shared).
    """

    def __init__(self, db_path: str = "data/runs.db"):
        self.use_supabase = USE_SUPABASE
        if not self.use_supabase:
            self.db_path = Path(db_path)
            self.db_path.parent.mkdir(parents=True, exist_ok=True)
            self._init_sqlite()

    def _init_sqlite(self):
        """Initialize SQLite database schema if it doesn't exist."""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS runs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    task_type TEXT NOT NULL,
                    prompt TEXT,
                    system_prompt TEXT,
                    model TEXT,
                    metrics TEXT NOT NULL,
                    timestamp TEXT NOT NULL,
                    duration_seconds REAL,
                    num_examples INTEGER,
                    metadata TEXT,
                    tags TEXT,
                    outputs TEXT
                )
            """)
            conn.commit()

    def insert_run(
        self,
        task_type: str,
        metrics: Dict[str, Any],
        prompt: Optional[str] = None,
        system_prompt: Optional[str] = None,
        model: Optional[str] = None,
        duration_seconds: Optional[float] = None,
        num_examples: Optional[int] = None,
        metadata: Optional[Dict[str, Any]] = None,
        tags: Optional[List[str]] = None,
        outputs: Optional[Dict[str, Any]] = None,
    ) -> int:
        """Insert a new run record. Returns the ID of the inserted run."""
        timestamp = datetime.utcnow().isoformat()

        if self.use_supabase:
            return self._insert_run_supabase(
                task_type, metrics, prompt, system_prompt, model,
                duration_seconds, num_examples, metadata, tags, outputs, timestamp
            )
        else:
            return self._insert_run_sqlite(
                task_type, metrics, prompt, system_prompt, model,
                duration_seconds, num_examples, metadata, tags, outputs, timestamp
            )

    def _insert_run_supabase(
        self, task_type, metrics, prompt, system_prompt, model,
        duration_seconds, num_examples, metadata, tags, outputs, timestamp
    ) -> int:
        with engine.connect() as conn:
            result = conn.execute(
                text("""
                    INSERT INTO runs (
                        task_type, prompt, system_prompt, model, metrics,
                        timestamp, duration_seconds, num_examples, metadata, tags, outputs
                    )
                    VALUES (
                        :task_type, :prompt, :system_prompt, :model, :metrics,
                        :timestamp, :duration_seconds, :num_examples, :metadata, :tags, :outputs
                    )
                    RETURNING id
                """),
                {
                    "task_type": task_type,
                    "prompt": prompt,
                    "system_prompt": system_prompt,
                    "model": model,
                    "metrics": json.dumps(metrics),
                    "timestamp": timestamp,
                    "duration_seconds": duration_seconds,
                    "num_examples": num_examples,
                    "metadata": json.dumps(metadata) if metadata else None,
                    "tags": json.dumps(tags) if tags else None,
                    "outputs": json.dumps(outputs) if outputs else None,
                }
            )
            conn.commit()
            row = result.fetchone()
            return row[0]

    def _insert_run_sqlite(
        self, task_type, metrics, prompt, system_prompt, model,
        duration_seconds, num_examples, metadata, tags, outputs, timestamp
    ) -> int:
        metrics_json = json.dumps(metrics)
        metadata_json = json.dumps(metadata) if metadata else None
        tags_json = json.dumps(tags) if tags else None
        outputs_json = json.dumps(outputs) if outputs else None

        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute(
                """
                INSERT INTO runs (
                    task_type, prompt, system_prompt, model, metrics,
                    timestamp, duration_seconds, num_examples, metadata, tags, outputs
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    task_type, prompt, system_prompt, model, metrics_json,
                    timestamp, duration_seconds, num_examples, metadata_json, tags_json, outputs_json,
                ),
            )
            conn.commit()
            return cursor.lastrowid

    def get_runs(
        self,
        task_type: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> List[Dict[str, Any]]:
        """Retrieve run records with optional filtering."""
        if self.use_supabase:
            return self._get_runs_supabase(task_type, limit, offset)
        else:
            return self._get_runs_sqlite(task_type, limit, offset)

    def _get_runs_supabase(self, task_type, limit, offset) -> List[Dict[str, Any]]:
        with engine.connect() as conn:
            if task_type:
                result = conn.execute(
                    text("""
                        SELECT * FROM runs
                        WHERE task_type = :task_type
                        ORDER BY timestamp DESC
                        LIMIT :limit OFFSET :offset
                    """),
                    {"task_type": task_type, "limit": limit, "offset": offset}
                )
            else:
                result = conn.execute(
                    text("""
                        SELECT * FROM runs
                        ORDER BY timestamp DESC
                        LIMIT :limit OFFSET :offset
                    """),
                    {"limit": limit, "offset": offset}
                )

            rows = result.fetchall()
            columns = result.keys()

        runs = []
        for row in rows:
            run = dict(zip(columns, row))
            # Parse JSON fields
            if isinstance(run.get("metrics"), str):
                run["metrics"] = json.loads(run["metrics"])
            if run.get("metadata") and isinstance(run["metadata"], str):
                run["metadata"] = json.loads(run["metadata"])
            if run.get("tags") and isinstance(run["tags"], str):
                run["tags"] = json.loads(run["tags"])
            if run.get("outputs") and isinstance(run["outputs"], str):
                run["outputs"] = json.loads(run["outputs"])
            runs.append(run)

        return runs

    def _get_runs_sqlite(self, task_type, limit, offset) -> List[Dict[str, Any]]:
        query = "SELECT * FROM runs"
        params = []

        if task_type:
            query += " WHERE task_type = ?"
            params.append(task_type)

        query += " ORDER BY timestamp DESC LIMIT ? OFFSET ?"
        params.extend([limit, offset])

        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute(query, params)
            rows = cursor.fetchall()

        runs = []
        for row in rows:
            run = dict(row)
            run["metrics"] = json.loads(run["metrics"])
            if run["metadata"]:
                run["metadata"] = json.loads(run["metadata"])
            if run.get("tags"):
                run["tags"] = json.loads(run["tags"])
            if run.get("outputs"):
                run["outputs"] = json.loads(run["outputs"])
            runs.append(run)

        return runs

    def get_run_by_id(self, run_id: int) -> Optional[Dict[str, Any]]:
        """Retrieve a single run by ID."""
        if self.use_supabase:
            with engine.connect() as conn:
                result = conn.execute(
                    text("SELECT * FROM runs WHERE id = :id"),
                    {"id": run_id}
                )
                row = result.fetchone()
                if not row:
                    return None
                columns = result.keys()
                run = dict(zip(columns, row))
        else:
            with sqlite3.connect(self.db_path) as conn:
                conn.row_factory = sqlite3.Row
                cursor = conn.execute("SELECT * FROM runs WHERE id = ?", (run_id,))
                row = cursor.fetchone()

            if not row:
                return None
            run = dict(row)

        # Parse JSON fields
        if isinstance(run.get("metrics"), str):
            run["metrics"] = json.loads(run["metrics"])
        if run.get("metadata") and isinstance(run["metadata"], str):
            run["metadata"] = json.loads(run["metadata"])
        if run.get("tags") and isinstance(run["tags"], str):
            run["tags"] = json.loads(run["tags"])
        if run.get("outputs") and isinstance(run["outputs"], str):
            run["outputs"] = json.loads(run["outputs"])

        return run

    def delete_run(self, run_id: int) -> bool:
        """Delete a run by ID. Returns True if deleted, False if not found."""
        if self.use_supabase:
            with engine.connect() as conn:
                result = conn.execute(
                    text("DELETE FROM runs WHERE id = :id"),
                    {"id": run_id}
                )
                conn.commit()
                return result.rowcount > 0
        else:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.execute("DELETE FROM runs WHERE id = ?", (run_id,))
                conn.commit()
                return cursor.rowcount > 0

    def update_tags(self, run_id: int, tags: List[str]) -> bool:
        """Update tags for a run. Returns True if updated, False if not found."""
        tags_json = json.dumps(tags)
        if self.use_supabase:
            with engine.connect() as conn:
                result = conn.execute(
                    text("UPDATE runs SET tags = :tags WHERE id = :id"),
                    {"tags": tags_json, "id": run_id}
                )
                conn.commit()
                return result.rowcount > 0
        else:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.execute(
                    "UPDATE runs SET tags = ? WHERE id = ?",
                    (tags_json, run_id)
                )
                conn.commit()
                return cursor.rowcount > 0

    def get_stats(self) -> Dict[str, Any]:
        """Get aggregate statistics across all runs."""
        if self.use_supabase:
            with engine.connect() as conn:
                result = conn.execute(text("""
                    SELECT
                        COUNT(*) as total_runs,
                        COUNT(DISTINCT task_type) as task_types,
                        AVG(duration_seconds) as avg_duration
                    FROM runs
                """))
                row = result.fetchone()
        else:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.execute("""
                    SELECT
                        COUNT(*) as total_runs,
                        COUNT(DISTINCT task_type) as task_types,
                        AVG(duration_seconds) as avg_duration
                    FROM runs
                """)
                row = cursor.fetchone()

        return {
            "total_runs": row[0],
            "task_types": row[1],
            "avg_duration_seconds": row[2],
        }


# Singleton instance
run_db = RunDatabase()
