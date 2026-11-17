"""Insumos, ajustes de stock y compras: /insumos, /compras."""

from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field, model_validator

from api.auth import Usuario, usuario_actual
from api.db import leer, rpc
from api.rutas.ventas import COLUMNAS_INSUMO

router = APIRouter(prefix="/api")


@router.get("/insumos")
def insumos(u: Usuario = Depends(usuario_actual)):
    return leer(u, "insumos_resumen", COLUMNAS_INSUMO).eq("activo", True).order("nombre").execute().data


class NuevoInsumo(BaseModel):
    nombre: str = Field(min_length=1)
    unidad: Literal["g", "ml", "unid"]
    en_recetas: bool = True
    costo_unitario: float = Field(ge=0)
    presentacion_compra: float = Field(gt=0)
    stock: float | None = Field(default=None, ge=0)
    punto_reorden: float | None = Field(default=None, ge=0)
    vida_util_dias: float | None = Field(default=None, ge=0)


def _datos(i: NuevoInsumo) -> dict:
    return i.model_dump(exclude_none=True)


@router.post("/insumos")
def crear_insumo(insumo: NuevoInsumo, u: Usuario = Depends(usuario_actual)):
    return rpc("crear_insumo", {"p_restaurante": u.restaurante_id, "p_usuario": u.user_id, "p_datos": _datos(insumo)})


class ImportarInsumos(BaseModel):
    insumos: list[NuevoInsumo] = Field(min_length=1)


@router.post("/insumos/importar")
def importar_insumos(cuerpo: ImportarInsumos, u: Usuario = Depends(usuario_actual)):
    return rpc(
        "importar_insumos",
        {"p_restaurante": u.restaurante_id, "p_usuario": u.user_id, "p_lista": [_datos(i) for i in cuerpo.insumos]},
    )


class Ajuste(BaseModel):
    tipo: Literal["ajuste", "merma", "consumo_propio"]
    cantidad: float = Field(ge=0)  # ajuste: stock contado (puede ser 0); los demás: lo que sale
    motivo: str | None = None

    @model_validator(mode="after")
    def _salida_positiva(self):
        if self.tipo != "ajuste" and self.cantidad <= 0:
            raise ValueError("La cantidad debe ser mayor que 0")
        return self


@router.post("/insumos/{insumo_id}/ajuste")
def ajustar_stock(insumo_id: int, ajuste: Ajuste, u: Usuario = Depends(usuario_actual)):
    # El id sale de la URL; un insumo_id en el cuerpo se ignora.
    return rpc(
        "ajustar_stock",
        {
            "p_restaurante": u.restaurante_id,
            "p_usuario": u.user_id,
            "p_insumo": insumo_id,
            "p_tipo": ajuste.tipo,
            "p_cantidad": ajuste.cantidad,
            "p_motivo": ajuste.motivo,
        },
    )


class LineaCompra(BaseModel):
    insumo_id: int
    cantidad: float = Field(gt=0)
    costo_total: float = Field(ge=0)


class NuevaCompra(BaseModel):
    lineas: list[LineaCompra] = Field(min_length=1)


@router.post("/compras")
def registrar_compra(compra: NuevaCompra, u: Usuario = Depends(usuario_actual)):
    return rpc(
        "registrar_compra",
        {"p_restaurante": u.restaurante_id, "p_usuario": u.user_id, "p_lineas": [l.model_dump() for l in compra.lineas]},
    )
