"""


Provides:
- SQLAlchemy engine and session management for the new agent/flow system
- Legacy RunDatabase class for backward compatibility with evaluation runs
"""

import sqlite3
from pathlib import Path
from typing import Dict, List, Any, Optional
from datetime import datetime
import json

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session

from src.models import Base

# Database config
DATABASE_PATH = "data/runs.db"
DATABASE_URL = f"sqlite:///{DATABASE_PATH}"

# SQLAlchemy engine and session factory
engine = create_engine(DATABASE_URL, echo=False, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def init_db():
    """Initialize all database tables. Call this on startup."""
    Path(DATABASE_PATH).parent.mkdir(parents=True, exist_ok=True)
    Base.metadata.create_all(engine)


def get_session() -> Session:
    """Get a new database session. Caller is responsible for closing it."""
    return SessionLocal()


class RunDatabase:
    """Manages SQLite database for evaluation run records."""
    
    def __init__(self, db_path: str = "data/runs.db"):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()
    
    def _init_db(self):
        """Initialize database schema if it doesn't exist."""
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
        """
        Insert a new run record.
        
        Returns the ID of the inserted run.
        """
        timestamp = datetime.utcnow().isoformat()
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
                    task_type,
                    prompt,
                    system_prompt,
                    model,
                    metrics_json,
                    timestamp,
                    duration_seconds,
                    num_examples,
                    metadata_json,
                    tags_json,
                    outputs_json,
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
        """
        Retrieve run records with optional filtering.
        
        Returns list of run dictionaries sorted by timestamp (newest first).
        """
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
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute("SELECT * FROM runs WHERE id = ?", (run_id,))
            row = cursor.fetchone()
        
        if not row:
            return None
        
        run = dict(row)
        run["metrics"] = json.loads(run["metrics"])
        if run["metadata"]:
            run["metadata"] = json.loads(run["metadata"])
        if run.get("tags"):
            run["tags"] = json.loads(run["tags"])
        if run.get("outputs"):
            run["outputs"] = json.loads(run["outputs"])
        
        return run
    
    def delete_run(self, run_id: int) -> bool:
        """Delete a run by ID. Returns True if deleted, False if not found."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute("DELETE FROM runs WHERE id = ?", (run_id,))
            conn.commit()
            return cursor.rowcount > 0
    
    def update_tags(self, run_id: int, tags: List[str]) -> bool:
        """Update tags for a run. Returns True if updated, False if not found."""
        tags_json = json.dumps(tags)
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute(
                "UPDATE runs SET tags = ? WHERE id = ?",
                (tags_json, run_id)
            )
            conn.commit()
            return cursor.rowcount > 0
    
    def get_stats(self) -> Dict[str, Any]:
        """Get aggregate statistics across all runs."""
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

