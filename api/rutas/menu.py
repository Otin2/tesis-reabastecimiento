"""Menú y recetas: /menu."""

from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from api import db
from api.auth import Usuario, usuario_actual
from api.db import leer, rpc

router = APIRouter(prefix="/api")


@router.get("/menu")
def menu(u: Usuario = Depends(usuario_actual)):
    platos = (
        leer(u, "margen_por_plato", "plato_id,nombre,categoria,precio,activo,costo,ganancia,margen_pct")
        .order("nombre")
        .execute()
        .data
    )
    recetas: dict[int, list] = {}
    if platos:
        # recetas no tiene restaurante_id: se leen solo las de los platos de este restaurante.
        filas = (
            db.cliente()
            .table("recetas")
            .select("plato_id,insumo_id,cantidad")
            .in_("plato_id", [p["plato_id"] for p in platos])
            .execute()
            .data
        )
        for f in filas:
            recetas.setdefault(f["plato_id"], []).append({"insumo_id": f["insumo_id"], "cantidad": f["cantidad"]})
    return [
        {
            "id": p["plato_id"],
            "nombre": p["nombre"],
            "categoria": p["categoria"],
            "precio": p["precio"],
            "activo": p["activo"],
            "costo": p["costo"],
            "ganancia": p["ganancia"],
            "margen_pct": p["margen_pct"] or 0,  # null cuando el precio es 0
            "receta": recetas.get(p["plato_id"], []),
        }
        for p in platos
    ]


class LineaReceta(BaseModel):
    insumo_id: int
    cantidad: float = Field(gt=0)


class Plato(BaseModel):
    nombre: str = Field(min_length=1)
    categoria: Literal["Menú", "Carta", "Bebidas"]
    precio: float = Field(ge=0)
    activo: bool = True
    receta: list[LineaReceta] | None = None  # None = no tocar la receta actual


def _guardar(u: Usuario, plato_id: int | None, p: Plato):
    return rpc(
        "guardar_plato",
        {
            "p_restaurante": u.restaurante_id,
            "p_plato": plato_id,
            "p_nombre": p.nombre,
            "p_categoria": p.categoria,
            "p_precio": p.precio,
            "p_activo": p.activo,
            "p_receta": None if p.receta is None else [r.model_dump() for r in p.receta],
        },
    )


@router.post("/menu")
def crear_plato(plato: Plato, u: Usuario = Depends(usuario_actual)):
    return _guardar(u, None, plato)  # un id en el cuerpo se ignora


@router.put("/menu/{plato_id}")
def actualizar_plato(plato_id: int, plato: Plato, u: Usuario = Depends(usuario_actual)):
    return _guardar(u, plato_id, plato)
