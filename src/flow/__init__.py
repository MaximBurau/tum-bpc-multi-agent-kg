# src/flow/__init__.py
"""
Flow system for orchestrating multi-agent pipelines.

Provides YAML-defined flows that compile to LangGraph for execution.
"""

from .compiler import compile_flow
from .runner import run_flow

__all__ = ["compile_flow", "run_flow"]

