from sqlalchemy import Table, Column, Integer, String, DateTime, Boolean, ForeignKey, Text, TIMESTAMP, UniqueConstraint, MetaData
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

metadata = MetaData()

users = Table(
    "users", metadata,
    Column("username", Text, primary_key=True),
    Column("full_name", Text, nullable=False),
    Column("email", Text, nullable=False, unique=True),
    Column("department", Text),
    Column("created_at", TIMESTAMP(timezone=True), server_default=func.now()),
    Column("last_active", TIMESTAMP(timezone=True))
)

channels = Table(
    "channels", metadata,
    Column("id", UUID(as_uuid=True), primary_key=True),
    Column("name", Text, nullable=False),
    Column("creator", Text, ForeignKey("users.username"), nullable=False),
    Column("is_private", Boolean, nullable=False, default=True),
    Column("created_at", TIMESTAMP(timezone=True), server_default=func.now()),
    Column("image_url", Text),
    UniqueConstraint("name", "creator", name="uq_channel_name_creator")
)

channel_members = Table(
    "channel_members", metadata,
    Column("channel_id", UUID(as_uuid=True), ForeignKey("channels.id", ondelete="CASCADE"), primary_key=True),
    Column("username", Text, ForeignKey("users.username", ondelete="CASCADE"), primary_key=True),
    Column("joined_at", TIMESTAMP(timezone=True), server_default=func.now())
)

messages = Table(
    "messages", metadata,
    Column("id", UUID(as_uuid=True), primary_key=True),
    Column("channel_id", UUID(as_uuid=True), ForeignKey("channels.id", ondelete="CASCADE")),
    Column("sender", Text, ForeignKey("users.username"), nullable=False),
    Column("content", Text),
    Column("file_url", Text),
    Column("file_name", Text),
    Column("file_size", Integer),
    Column("file_type", Text),
    Column("timestamp", TIMESTAMP(timezone=True), server_default=func.now()),
    Column("is_edited", Boolean, default=False),
    Column("edited_at", TIMESTAMP(timezone=True))
)

direct_messages = Table(
    "direct_messages", metadata,
    Column("id", UUID(as_uuid=True), primary_key=True),
    Column("sender", Text, ForeignKey("users.username"), nullable=False),
    Column("recipient", Text, ForeignKey("users.username"), nullable=False),
    Column("content", Text, nullable=False),
    Column("file_url", Text),
    Column("file_name", Text),
    Column("file_size", Integer),
    Column("file_type", Text),
    Column("timestamp", TIMESTAMP(timezone=True), server_default=func.now()),
    Column("is_read", Boolean, default=False)
)