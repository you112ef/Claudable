from sqlalchemy import String, DateTime, ForeignKey, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime
from app.db.base import Base
from typing import Optional, List, Dict, Any


class Commit(Base):
    __tablename__ = "commits"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    project_id: Mapped[str] = mapped_column(String(64), ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    session_id: Mapped[Optional[str]] = mapped_column(String(64), ForeignKey("sessions.id", ondelete="SET NULL"), nullable=True)
    
    # Git Info
    commit_sha: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    parent_sha: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    
    # Author Info
    author_type: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)  # ai, user, system
    author_name: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    author_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    
    # Changes
    files_changed: Mapped[Optional[List[str]]] = mapped_column(JSON, nullable=True)  # Array of file paths
    stats: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)  # {"additions": N, "deletions": N, "total": N}
    diff: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    # Timestamps
    committed_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    
    # Relationships
    project = relationship("Project", back_populates="commits")
