"""
Claude Code SDK session management
"""
from sqlalchemy import String, DateTime, ForeignKey, Text, Integer, Numeric
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime
from app.db.base import Base
from typing import Optional


class Session(Base):
    """Claude Code SDK session tracking"""
    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)  # Our internal session ID
    project_id: Mapped[str] = mapped_column(String(64), ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    
    # Claude Code Session Management
    claude_session_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True, index=True)  # Actual Claude Code session ID
    
    # Session Info
    status: Mapped[str] = mapped_column(String(32), default="active")  # active, completed, failed
    model: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    cli_type: Mapped[str] = mapped_column(String(32), default="claude", nullable=False)  # claude, cursor
    
    # Transcript Management
    transcript_path: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    transcript_format: Mapped[str] = mapped_column(String(32), default="json")
    
    # Summary
    instruction: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    # Performance Metrics
    total_messages: Mapped[int] = mapped_column(Integer, default=0)
    total_tools_used: Mapped[int] = mapped_column(Integer, default=0)
    total_tokens: Mapped[int] = mapped_column(Integer, default=0)
    total_cost_usd: Mapped[Optional[float]] = mapped_column(Numeric(10, 6), nullable=True)
    duration_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    
    # Timestamps
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    
    # Relationships
    project = relationship("Project", back_populates="sessions")
    messages = relationship("Message", back_populates="session")
    tools_usage = relationship("ToolUsage", back_populates="session", cascade="all, delete-orphan")
    user_requests = relationship("UserRequest", back_populates="session")
