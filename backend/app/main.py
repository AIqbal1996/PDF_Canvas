from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .config import settings
from .api.documents import router as documents_router
from .api.conversion import router as conversion_router
from .api.ocr import router as ocr_router
from .api.templates import router as templates_router
from .api.forms import router as forms_router
from .api.signatures import router as signatures_router
from .api.security import router as security_router
from .api.utilities import router as utilities_router
from .api.ai import router as ai_router
from .api.system import router as system_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ensure local directory structure exists
    settings.ensure_directories()
    yield


app = FastAPI(
    title="PDF Canvas API",
    description="Local-First Enterprise PDF Platform API",
    version="0.1.0",
    lifespan=lifespan,
)

# Enable CORS for local web client
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Accept-Ranges", "Content-Range", "Content-Length", "ETag"],
)

app.include_router(documents_router)
app.include_router(conversion_router)
app.include_router(ocr_router)
app.include_router(templates_router)
app.include_router(forms_router)
app.include_router(signatures_router)
app.include_router(security_router)
app.include_router(utilities_router)
app.include_router(ai_router)
app.include_router(system_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "mode": "local"}
