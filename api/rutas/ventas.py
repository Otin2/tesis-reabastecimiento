"""Inicio y Registrar venta: /resumen, /platos, /ventas."""

from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from api.auth import Usuario, usuario_actual
from api.db import leer, rpc

router = APIRouter(prefix="/api")

COLUMNAS_INSUMO = (
    "id,nombre,unidad,stock,punto_reorden,presentacion_compra,costo_unitario,"
    "en_recetas,vida_util_dias,nivel,dias_restantes"
)


@router.get("/resumen")
def resumen(u: Usuario = Depends(usuario_actual)):
    hoy = leer(u, "resumen_hoy", "platos,total").limit(1).execute().data
    insumos = leer(u, "insumos_resumen", COLUMNAS_INSUMO).eq("activo", True).execute().data
    # insumos_por_agotarse no trae dias_restantes; insumos_resumen sí (nivel solo existe si está bajo).
    por_agotarse = sorted((i for i in insumos if i["nivel"]), key=lambda i: i["nivel"] != "Crítico")
    por_vencer = (
        leer(u, "insumos_por_vencer", "insumo_id,nombre,unidad,stock,dias_restantes,estado")
        .order("dias_restantes")
        .execute()
        .data
    )
    fila = hoy[0] if hoy else {"platos": 0, "total": 0}
    return {"platos": fila["platos"], "total": fila["total"], "por_agotarse": por_agotarse, "por_vencer": por_vencer}


@router.get("/platos")
def platos(u: Usuario = Depends(usuario_actual)):
    return leer(u, "platos", "id,nombre,categoria,precio").eq("activo", True).order("nombre").execute().data


class Item(BaseModel):
    plato_id: int
    cantidad: int = Field(gt=0)


class NuevaVenta(BaseModel):
    items: list[Item] = Field(min_length=1)
    metodo_pago: Literal["efectivo", "yape_plin", "tarjeta"] = "efectivo"
    tipo: Literal["mesa", "llevar"] = "mesa"
    mesa: str | None = None


@router.post("/ventas")
def registrar_venta(venta: NuevaVenta, u: Usuario = Depends(usuario_actual)):
    # Los precios y el total los pone la base desde la tabla platos.
    return rpc(
        "registrar_venta",
        {
            "p_restaurante": u.restaurante_id,
            "p_usuario": u.user_id,
            "p_items": [i.model_dump() for i in venta.items],
            "p_metodo": venta.metodo_pago,
            "p_tipo": venta.tipo,
            "p_mesa": venta.mesa if venta.tipo == "mesa" else None,
        },
    )


@router.get("/ventas/hoy")
def ventas_hoy(u: Usuario = Depends(usuario_actual)):
    return (
        leer(u, "ventas_hoy", "id,fecha,tipo,mesa,metodo_pago,items,total,estado")
        .order("fecha", desc=True)
        .execute()
        .data
    )


class Anulacion(BaseModel):
    motivo: str | None = None


@router.post("/ventas/{venta_id}/anular")
def anular_venta(venta_id: int, datos: Anulacion | None = None, u: Usuario = Depends(usuario_actual)):
    return rpc(
        "anular_venta",
        {"p_restaurante": u.restaurante_id, "p_venta": venta_id, "p_motivo": datos.motivo if datos else None},
    )
