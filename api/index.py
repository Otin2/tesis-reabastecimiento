"""App FastAPI. Local: `uvicorn api.index:app --reload --port 8000` desde la raíz del repo."""

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from api.db import ConfigError, ErrorNegocio
from api.rutas import ganancias, gastos, insumos, lista, menu, ventas

load_dotenv()

app = FastAPI(title="API Reabastecimiento", docs_url="/api/docs", openapi_url="/api/openapi.json")


@app.exception_handler(ErrorNegocio)
def error_negocio(_: Request, e: ErrorNegocio):
    return JSONResponse({"detail": str(e)}, status_code=400)


@app.exception_handler(ConfigError)
def error_config(_: Request, e: ConfigError):
    return JSONResponse({"detail": str(e)}, status_code=500)


@app.get("/api/health")
def health():
    return {"ok": True}


for modulo in (ventas, insumos, menu, gastos, ganancias, lista):
    app.include_router(modulo.router)
