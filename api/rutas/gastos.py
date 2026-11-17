"""Gastos: /gastos. Ids de texto: 'f12' = gasto fijo (plantilla), 'g45' = gasto de solo esta vez."""

from typing import Literal

from fastapi import APIRouter, Depends, Path
from pydantic import BaseModel, Field

from api import db
from api.auth import Usuario, usuario_actual
from api.db import leer, rpc

router = APIRouter(prefix="/api")

# La base hace substr(id, 2)::bigint: un id mal formado daría un error de cast (500), no un 400.
IdGasto = Path(pattern=r"^[fg][0-9]{1,18}$")


@router.get("/gastos")
def gastos(u: Usuario = Depends(usuario_actual)):
    # Idempotente: crea los gastos fijos de este mes si todavía no existen.
    rpc("generar_gastos_mes", {"p_restaurante": u.restaurante_id, "p_mes": db.hoy_lima().isoformat()})
    return leer(u, "gastos_lista", "id,nombre,categoria,monto,fijo").order("nombre").execute().data


class NuevoGasto(BaseModel):
    nombre: str = Field(min_length=1)
    categoria: Literal["alquiler", "servicios", "sueldos", "otros"]
    monto: float = Field(ge=0)
    fijo: bool = True


@router.post("/gastos")
def crear_gasto(g: NuevoGasto, u: Usuario = Depends(usuario_actual)):
    return rpc(
        "crear_gasto",
        {
            "p_restaurante": u.restaurante_id,
            "p_usuario": u.user_id,
            "p_nombre": g.nombre,
            "p_categoria": g.categoria,
            "p_monto": g.monto,
            "p_fijo": g.fijo,
        },
    )


class CambioGasto(BaseModel):
    # El frontend manda el gasto completo; solo se cambia el monto.
    monto: float = Field(ge=0)


@router.put("/gastos/{gasto_id}")
def actualizar_gasto(datos: CambioGasto, gasto_id: str = IdGasto, u: Usuario = Depends(usuario_actual)):
    return rpc("actualizar_gasto", {"p_restaurante": u.restaurante_id, "p_id": gasto_id, "p_monto": datos.monto})


@router.delete("/gastos/{gasto_id}")
def quitar_gasto(gasto_id: str = IdGasto, u: Usuario = Depends(usuario_actual)):
    return rpc("quitar_gasto", {"p_restaurante": u.restaurante_id, "p_id": gasto_id})
