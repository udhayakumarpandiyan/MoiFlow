from fastapi import FastAPI

from app.api.nlu import router as nlu_router
from app.api.auth import router as auth_router
from app.api.ocr import router as ocr_router


app = FastAPI(
    title="MoiFlow AI",
    version="1.0.0",
)


app.include_router(
    nlu_router,
    prefix="/api/nlu",
)

app.include_router(
    auth_router,
    prefix="/api/auth",
)

app.include_router(
    ocr_router,
    prefix="/api/ocr",
)


@app.get("/")
def home():
    return {
        "message": "MoiFlow AI is running"
    }