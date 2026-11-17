"""Acceso a Supabase con la service role. SOLO backend.

La service role salta el RLS: las vistas devuelven filas de TODOS los restaurantes.
Por eso toda lectura pasa por `leer()`, que siempre filtra por el restaurante del token.
"""

import os
from functools import lru_cache

from postgrest.exceptions import APIError
from supabase import Client, create_client


class ConfigError(RuntimeError):
    """Falta una variable de entorno."""


class ErrorNegocio(Exception):
    """La base rechazó la operación (p. ej. 'La venta ya está anulada')."""


def env(nombre: str) -> str:
    valor = os.environ.get(nombre)
    if not valor:
        raise ConfigError(f"Falta la variable de entorno {nombre}")
    return valor


@lru_cache
def cliente() -> Client:
    # Se crea al primer uso, así /api/health y los tests funcionan sin claves.
    return create_client(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"))


def leer(usuario, tabla: str, columnas: str = "*"):
    """Consulta una tabla o vista ya filtrada por el restaurante del usuario."""
    return cliente().table(tabla).select(columnas).eq("restaurante_id", usuario.restaurante_id)


def rpc(funcion: str, params: dict):
    """Llama a una función SQL. Los `raise exception` de la base llegan como ErrorNegocio."""
    try:
        return cliente().rpc(funcion, params).execute().data
    except APIError as e:
        # P0001 = raise exception en plpgsql: el mensaje está pensado para el usuario.
        if e.code == "P0001":
            raise ErrorNegocio(e.message) from e
        raise
