from fastapi import FastAPI

from app.api.nlu import router as nlu_router
from app.api.auth import router as auth_router


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


@app.get("/")
def home():
    return {
        "message": "MoiFlow AI is running"
    }