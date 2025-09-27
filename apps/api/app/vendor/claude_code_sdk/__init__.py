"""
Lightweight fallback stubs for claude_code_sdk.

These stubs allow the API to start even when the real SDK is not available.
They implement minimal interfaces used in the codebase.
"""

from __future__ import annotations
from typing import Any, AsyncGenerator, Optional


class ClaudeCodeOptions:
  def __init__(self, **kwargs: Any) -> None:
    for k, v in kwargs.items():
      setattr(self, k, v)


class ClaudeSDKClient:
  def __init__(self, options: Optional[ClaudeCodeOptions] = None) -> None:
    self.options = options

  async def __aenter__(self) -> "ClaudeSDKClient":
    return self

  async def __aexit__(self, exc_type, exc, tb) -> None:
    return None

  async def query(self, prompt: str) -> None:
    # No-op: real SDK would send the prompt
    return None

  async def receive_messages(self) -> AsyncGenerator[Any, None]:
    # Yield nothing so callers can gracefully detect lack of SDK output
    if False:
      yield None


async def query(prompt: str, options: ClaudeCodeOptions) -> AsyncGenerator[Any, None]:
  # Async generator that yields nothing
  if False:
    yield None
