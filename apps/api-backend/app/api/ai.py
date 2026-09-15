"""
AI API endpoints.

All endpoints are authenticated (mobile user JWT). The Sarvam API key never
leaves the backend — the mobile app calls these endpoints instead of any AI
provider directly. Each call is logged to ai_usage.

Endpoints:
    POST /api/ai/moi/extract        — extract a Moi entry from text
    POST /api/ai/finance/extract    — extract a finance transaction from text
    POST /api/ai/understand         — intent/entities from a free-text request
    POST /api/ai/summary            — natural-language summary of figures
    POST /api/ai/growth             — growth/downfall analysis
    POST /api/ai/suggestions        — money suggestions
"""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.db.database import get_db
from app.db.models.user import User
from app.schemas.ai import (
    ContextRequest,
    ExtractionResponse,
    GrowthResponse,
    SuggestionsResponse,
    SummaryResponse,
    TextRequest,
    UnderstandResponse,
)
from app.services.ai import get_ai_service

router = APIRouter()


@router.post("/moi/extract", response_model=ExtractionResponse)
async def extract_moi(
    request: TextRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_ai_service().extract_moi_entry(
        request.text, db=db, user_id=user.id
    )


@router.post("/finance/extract", response_model=ExtractionResponse)
async def extract_finance(
    request: TextRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_ai_service().extract_finance_txn(
        request.text, db=db, user_id=user.id
    )


@router.post("/understand", response_model=UnderstandResponse)
async def understand(
    request: TextRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_ai_service().understand_text(
        request.text, db=db, user_id=user.id
    )


@router.post("/summary", response_model=SummaryResponse)
async def summary(
    request: ContextRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_ai_service().summarize(
        request.context, domain=request.domain, db=db, user_id=user.id
    )


@router.post("/growth", response_model=GrowthResponse)
async def growth(
    request: ContextRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_ai_service().analyze_growth(
        request.context, domain=request.domain, db=db, user_id=user.id
    )


@router.post("/suggestions", response_model=SuggestionsResponse)
async def suggestions(
    request: ContextRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_ai_service().suggest(
        request.context, domain=request.domain, db=db, user_id=user.id
    )
