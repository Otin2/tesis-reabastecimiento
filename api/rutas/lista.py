"""Lista de compras: /lista-compras y sus eventos (evidencia del piloto)."""

from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict

from api import db
from api.auth import Usuario, usuario_actual
from api.db import insertar, leer

router = APIRouter(prefix="/api")

COLUMNAS_LINEA = (
    "insumo_id,nombre,unidad,nivel,stock,dias_restantes,cantidad,presentacion_compra,costo_unitario,costo_estimado"
)


@router.get("/lista-compras")
def lista_compras(u: Usuario = Depends(usuario_actual)):
    # La cantidad y el costo los calcula la vista lista_compras_sugerida.
    lineas = leer(u, "lista_compras_sugerida", COLUMNAS_LINEA).order("nombre").execute().data
    lineas.sort(key=lambda l: l["nivel"] != "Crítico")  # Crítico primero (sort estable: luego por nombre)
    return {
        "fecha": db.hoy_lima().isoformat(),
        "costo_total": round(sum(float(l["costo_estimado"] or 0) for l in lineas), 2),
        "lineas": lineas,
    }


class Evento(BaseModel):
    # {tipo, ...detalle}: lo demás del cuerpo se guarda tal cual en `detalle`.
    model_config = ConfigDict(extra="allow")
    tipo: Literal["generada", "pdf", "compartida", "marcada", "ajustada", "extra_agregada", "insumo_creado", "comprada"]


@router.post("/lista-compras/eventos")
def registrar_evento(e: Evento, u: Usuario = Depends(usuario_actual)):
    detalle = {k: v for k, v in (e.model_extra or {}).items() if k not in ("restaurante_id", "user_id")}
    insertar(u, "lista_compras_eventos", {"user_id": u.user_id, "tipo": e.tipo, "detalle": detalle})
    return {"ok": True}
