from __future__ import annotations
from typing import Any, List, Optional


class Message:  # Generic message container (unused directly)
  def __init__(self, *args, **kwargs):
    for k, v in kwargs.items():
      setattr(self, k, v)


class ContentBlock:
  pass


class TextBlock(ContentBlock):
  def __init__(self, text: str = ""):
    self.text = text


class ThinkingBlock(ContentBlock):
  def __init__(self, thinking: str = ""):
    self.thinking = thinking


class ToolUseBlock(ContentBlock):
  def __init__(self, id: str = "", name: str = "", input: Any = None):
    self.id = id
    self.name = name
    self.input = input or {}


class ToolResultBlock(ContentBlock):
  def __init__(self, tool_use_id: str = "", content: Any = None, is_error: bool = False):
    self.tool_use_id = tool_use_id
    self.content = content
    self.is_error = is_error


class SystemMessage:
  def __init__(self, subtype: Optional[str] = None, session_id: Optional[str] = None):
    self.subtype = subtype
    self.session_id = session_id
    self.content: List[ContentBlock] = []


class AssistantMessage:
  def __init__(self, content: Optional[List[ContentBlock]] = None):
    self.content = content or []


class UserMessage:
  def __init__(self, content: str = ""):
    self.content = content


class ResultMessage:
  def __init__(self, duration_ms: int = 0, duration_api_ms: int = 0, num_turns: int = 0, total_cost_usd: float = 0.0, session_id: Optional[str] = None):
    self.duration_ms = duration_ms
    self.duration_api_ms = duration_api_ms
    self.num_turns = num_turns
    self.total_cost_usd = total_cost_usd
    self.session_id = session_id

