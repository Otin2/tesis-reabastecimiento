"""Valida el token de Supabase y obtiene el restaurante del usuario.

`restaurante_id` sale SIEMPRE de aquí (tabla perfiles), nunca del body ni del LLM.
"""

from dataclasses import dataclass

import httpx
from fastapi import Header, HTTPException

from api import db


@dataclass(frozen=True)
class Usuario:
    user_id: str
    restaurante_id: str
    rol: str


def validar_token(token: str) -> str | None:
    """Devuelve el id del usuario si Supabase Auth acepta el token; si no, None.

    Se consulta /auth/v1/user por HTTP en lugar de usar `cliente().auth`, para no
    tocar la sesión del cliente compartido de la service role.
    """
    try:
        r = httpx.get(
            f"{db.env('SUPABASE_URL')}/auth/v1/user",
            headers={"apikey": db.env("SUPABASE_SERVICE_ROLE_KEY"), "Authorization": f"Bearer {token}"},
            timeout=10,
        )
    except httpx.HTTPError:
        raise HTTPException(503, "No se pudo verificar la sesión. Intenta de nuevo.")
    if r.status_code != 200:
        return None
    return r.json().get("id")


def buscar_perfil(user_id: str) -> dict | None:
    filas = (
        db.cliente().table("perfiles").select("restaurante_id,rol").eq("user_id", user_id).limit(1).execute().data
    )
    return filas[0] if filas else None


def usuario_actual(authorization: str | None = Header(default=None)) -> Usuario:
    """Dependencia de FastAPI para todas las rutas salvo /api/health."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Falta el token de sesión")
    user_id = validar_token(authorization[7:].strip())
    if not user_id:
        raise HTTPException(401, "Sesión inválida o vencida")
    perfil = buscar_perfil(user_id)
    if not perfil:
        raise HTTPException(403, "Tu cuenta no tiene un restaurante asignado")
    return Usuario(user_id=user_id, restaurante_id=perfil["restaurante_id"], rol=perfil["rol"])
