"""core platform tables

Adds all backend platform tables beyond `users`:
  - otp_requests, device_sessions
  - revenuecat_customers, subscriptions, subscription_events
  - admin_users, audit_logs, ai_usage
  - Moi cloud mirrors: moi_events, moi_entries
  - Finance cloud mirrors: finance_credits, finance_loans, finance_business_txns

Moi and Finance tables are created in the same migration but remain
independent (no cross-domain foreign keys).

Revision ID: 002
Revises: 001
Create Date: 2026-09-14
"""

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

from alembic import op

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_UUID_PK = dict(primary_key=True, server_default=sa.text("gen_random_uuid()"))


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    ]


def upgrade() -> None:
    # ----- otp_requests -----
    op.create_table(
        "otp_requests",
        sa.Column("id", UUID(as_uuid=True), **_UUID_PK),
        sa.Column("phone", sa.String(10), nullable=False),
        sa.Column("purpose", sa.String(20), nullable=False, server_default="login"),
        sa.Column("channel", sa.String(20), nullable=False, server_default="sms"),
        sa.Column("delivered", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("verified", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("ip_address", sa.String(64), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("ix_otp_requests_phone", "otp_requests", ["phone"])
    op.create_index("ix_otp_requests_created_at", "otp_requests", ["created_at"])

    # ----- device_sessions -----
    op.create_table(
        "device_sessions",
        sa.Column("id", UUID(as_uuid=True), **_UUID_PK),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("device_id", sa.String(128), nullable=False),
        sa.Column("platform", sa.String(20), nullable=False, server_default="android"),
        sa.Column("app_version", sa.String(20), nullable=True),
        sa.Column("token_jti", sa.String(64), nullable=True),
        sa.Column("revoked", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("ip_address", sa.String(64), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "last_seen_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("ix_device_sessions_user_id", "device_sessions", ["user_id"])
    op.create_index("ix_device_sessions_token_jti", "device_sessions", ["token_jti"])

    # ----- revenuecat_customers -----
    op.create_table(
        "revenuecat_customers",
        sa.Column("id", UUID(as_uuid=True), **_UUID_PK),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("app_user_id", sa.String(128), nullable=False, unique=True),
        sa.Column("original_app_user_id", sa.String(128), nullable=True),
        *_timestamps(),
    )
    op.create_index(
        "ix_revenuecat_customers_user_id", "revenuecat_customers", ["user_id"]
    )
    op.create_index(
        "ix_revenuecat_customers_app_user_id",
        "revenuecat_customers",
        ["app_user_id"],
    )

    # ----- subscriptions -----
    op.create_table(
        "subscriptions",
        sa.Column("id", UUID(as_uuid=True), **_UUID_PK),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("plan_id", sa.String(30), nullable=False, server_default="free"),
        sa.Column("entitlement", sa.String(50), nullable=False, server_default=""),
        sa.Column("status", sa.String(30), nullable=False, server_default="none"),
        sa.Column("is_premium", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("store", sa.String(30), nullable=True),
        sa.Column("product_id", sa.String(128), nullable=True),
        sa.Column("will_renew", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("current_period_start", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_event_at", sa.DateTime(timezone=True), nullable=True),
        *_timestamps(),
    )
    op.create_index("ix_subscriptions_user_id", "subscriptions", ["user_id"])
    op.create_index("ix_subscriptions_is_premium", "subscriptions", ["is_premium"])
    op.create_index("ix_subscriptions_expires_at", "subscriptions", ["expires_at"])

    # ----- subscription_events -----
    op.create_table(
        "subscription_events",
        sa.Column("id", UUID(as_uuid=True), **_UUID_PK),
        sa.Column("event_id", sa.String(128), nullable=False, unique=True),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("app_user_id", sa.String(128), nullable=True),
        sa.Column("event_type", sa.String(50), nullable=False),
        sa.Column("product_id", sa.String(128), nullable=True),
        sa.Column("entitlement", sa.String(50), nullable=True),
        sa.Column("store", sa.String(30), nullable=True),
        sa.Column("environment", sa.String(20), nullable=True),
        sa.Column("event_timestamp", sa.DateTime(timezone=True), nullable=True),
        sa.Column("raw_payload", JSONB, nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index(
        "ix_subscription_events_event_id", "subscription_events", ["event_id"]
    )
    op.create_index(
        "ix_subscription_events_user_id", "subscription_events", ["user_id"]
    )
    op.create_index(
        "ix_subscription_events_created_at", "subscription_events", ["created_at"]
    )

    # ----- admin_users -----
    op.create_table(
        "admin_users",
        sa.Column("id", UUID(as_uuid=True), **_UUID_PK),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("name", sa.String(100), nullable=False, server_default="Admin"),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("role", sa.String(20), nullable=False, server_default="admin"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_admin_users_email", "admin_users", ["email"])

    # ----- audit_logs -----
    op.create_table(
        "audit_logs",
        sa.Column("id", UUID(as_uuid=True), **_UUID_PK),
        sa.Column("actor_type", sa.String(20), nullable=False),
        sa.Column("actor_id", sa.String(64), nullable=True),
        sa.Column("action", sa.String(80), nullable=False),
        sa.Column("target_type", sa.String(40), nullable=True),
        sa.Column("target_id", sa.String(64), nullable=True),
        sa.Column("ip_address", sa.String(64), nullable=True),
        sa.Column("detail", JSONB, nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("ix_audit_logs_action", "audit_logs", ["action"])
    op.create_index("ix_audit_logs_created_at", "audit_logs", ["created_at"])

    # ----- ai_usage -----
    op.create_table(
        "ai_usage",
        sa.Column("id", UUID(as_uuid=True), **_UUID_PK),
        sa.Column("user_id", UUID(as_uuid=True), nullable=True),
        sa.Column("provider", sa.String(30), nullable=False),
        sa.Column("task", sa.String(50), nullable=False),
        sa.Column("domain", sa.String(20), nullable=True),
        sa.Column("tokens_in", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("tokens_out", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("latency_ms", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("success", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("ix_ai_usage_user_id", "ai_usage", ["user_id"])
    op.create_index("ix_ai_usage_task", "ai_usage", ["task"])
    op.create_index("ix_ai_usage_created_at", "ai_usage", ["created_at"])

    # ----- Moi cloud mirrors -----
    op.create_table(
        "moi_events",
        sa.Column("id", UUID(as_uuid=True), **_UUID_PK),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("client_id", sa.String(64), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("event_type", sa.String(50), nullable=True),
        sa.Column("event_date", sa.String(40), nullable=True),
        sa.Column("village_name", sa.String(200), nullable=True),
        *_timestamps(),
        sa.UniqueConstraint("user_id", "client_id", name="uq_moi_events_user_client"),
    )
    op.create_index("ix_moi_events_user_id", "moi_events", ["user_id"])

    op.create_table(
        "moi_entries",
        sa.Column("id", UUID(as_uuid=True), **_UUID_PK),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("client_id", sa.String(64), nullable=False),
        sa.Column("event_client_id", sa.String(64), nullable=True),
        sa.Column("direction", sa.String(3), nullable=False),
        sa.Column("person_name", sa.String(200), nullable=True),
        sa.Column("village_name", sa.String(200), nullable=True),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("gift_note", sa.Text(), nullable=True),
        sa.Column("entry_date", sa.String(40), nullable=True),
        *_timestamps(),
        sa.UniqueConstraint("user_id", "client_id", name="uq_moi_entries_user_client"),
    )
    op.create_index("ix_moi_entries_user_id", "moi_entries", ["user_id"])

    # ----- Finance cloud mirrors -----
    op.create_table(
        "finance_credits",
        sa.Column("id", UUID(as_uuid=True), **_UUID_PK),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("client_id", sa.String(64), nullable=False),
        sa.Column("direction", sa.String(3), nullable=False),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("interest_rate", sa.Numeric(6, 2), nullable=False, server_default="0"),
        sa.Column("person", sa.String(200), nullable=True),
        sa.Column("village", sa.String(200), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="UPCOMING"),
        sa.Column("txn_date", sa.String(40), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        *_timestamps(),
        sa.UniqueConstraint("user_id", "client_id", name="uq_fin_credits_user_client"),
    )
    op.create_index("ix_finance_credits_user_id", "finance_credits", ["user_id"])

    op.create_table(
        "finance_loans",
        sa.Column("id", UUID(as_uuid=True), **_UUID_PK),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("client_id", sa.String(64), nullable=False),
        sa.Column("loan_type", sa.String(20), nullable=False, server_default="PERSONAL"),
        sa.Column("loan_amount", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("provider", sa.String(200), nullable=True),
        sa.Column("interest_rate", sa.Numeric(6, 2), nullable=False, server_default="0"),
        sa.Column("monthly_emi", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("total_emis", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("paid_emis", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("status", sa.String(20), nullable=False, server_default="ACTIVE"),
        sa.Column("start_date", sa.String(40), nullable=True),
        *_timestamps(),
        sa.UniqueConstraint("user_id", "client_id", name="uq_fin_loans_user_client"),
    )
    op.create_index("ix_finance_loans_user_id", "finance_loans", ["user_id"])

    op.create_table(
        "finance_business_txns",
        sa.Column("id", UUID(as_uuid=True), **_UUID_PK),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("client_id", sa.String(64), nullable=False),
        sa.Column("kind", sa.String(10), nullable=False, server_default="SALE"),
        sa.Column("party_name", sa.String(200), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("amount_settled", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("txn_date", sa.String(40), nullable=True),
        *_timestamps(),
        sa.UniqueConstraint("user_id", "client_id", name="uq_fin_biztxn_user_client"),
    )
    op.create_index(
        "ix_finance_business_txns_user_id", "finance_business_txns", ["user_id"]
    )


def downgrade() -> None:
    for table in (
        "finance_business_txns",
        "finance_loans",
        "finance_credits",
        "moi_entries",
        "moi_events",
        "ai_usage",
        "audit_logs",
        "admin_users",
        "subscription_events",
        "subscriptions",
        "revenuecat_customers",
        "device_sessions",
        "otp_requests",
    ):
        op.drop_table(table)
