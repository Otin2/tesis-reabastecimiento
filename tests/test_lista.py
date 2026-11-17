"""Pruebas de /api/lista-compras y sus eventos con la base falsa (no tocan Supabase)."""

import pytest

from tests.test_api import R1, R2, api, h  # noqa: F401  (api es fixture)
from tests.test_ganancias import HOY, PERFILES, usar


def linea(insumo_id, nombre, nivel, costo, r=R1):
    return {
        "insumo_id": insumo_id, "restaurante_id": r, "nombre": nombre, "unidad": "g", "nivel": nivel, "stock": 500,
        "dias_restantes": 1.5, "cantidad": 2000, "presentacion_compra": 1000, "costo_unitario": 0.01, "costo_estimado": costo,
    }


TABLAS = {
    "perfiles": PERFILES,
    "lista_compras_sugerida": [
        linea(1, "Arroz", "Bajo", 20.0),
        linea(2, "Pollo", "Crítico", 96.0),
        linea(3, "Ají", "Crítico", 8.5),
        linea(9, "Ajeno", "Crítico", 1000.0, r=R2),
    ],
}


@pytest.fixture
def base(monkeypatch):
    return usar(monkeypatch, TABLAS)


def test_sin_token_401(api, base):
    assert api.get("/api/lista-compras").status_code == 401
    assert api.post("/api/lista-compras/eventos", json={"tipo": "pdf"}).status_code == 401
    assert base.insertadas == []


def test_lista_del_restaurante_critico_primero(api, base):
    r = api.get("/api/lista-compras", headers=h("token-u1"))
    assert r.status_code == 200
    d = r.json()
    assert d["fecha"] == HOY.isoformat()
    assert [l["nombre"] for l in d["lineas"]] == ["Ají", "Pollo", "Arroz"]
    assert d["costo_total"] == 124.5
    assert set(d["lineas"][0]) == {
        "insumo_id", "nombre", "unidad", "nivel", "stock", "dias_restantes", "cantidad",
        "presentacion_compra", "costo_unitario", "costo_estimado",
    }
    otro = api.get("/api/lista-compras", headers=h("token-u2")).json()
    assert [l["insumo_id"] for l in otro["lineas"]] == [9]


def test_lista_vacia(api, monkeypatch):
    usar(monkeypatch, {**TABLAS, "lista_compras_sugerida": []})
    assert api.get("/api/lista-compras", headers=h("token-u1")).json() == {"fecha": HOY.isoformat(), "costo_total": 0, "lineas": []}


def test_evento_guarda_restaurante_y_usuario_del_token(api, base):
    cuerpo = {"tipo": "ajustada", "insumo_id": 2, "sugerida": 2000, "cantidad": 3000, "restaurante_id": R2, "user_id": "u2"}
    r = api.post("/api/lista-compras/eventos", json=cuerpo, headers=h("token-u1"))
    assert r.status_code == 200
    assert r.json() == {"ok": True}
    assert base.insertadas == [
        (
            "lista_compras_eventos",
            {
                "restaurante_id": R1,
                "user_id": "u1",
                "tipo": "ajustada",
                "detalle": {"insumo_id": 2, "sugerida": 2000, "cantidad": 3000},
            },
        )
    ]


def test_evento_sin_detalle(api, base):
    assert api.post("/api/lista-compras/eventos", json={"tipo": "pdf"}, headers=h("token-u2")).status_code == 200
    assert base.insertadas == [("lista_compras_eventos", {"restaurante_id": R2, "user_id": "u2", "tipo": "pdf", "detalle": {}})]


@pytest.mark.parametrize("cuerpo", [{}, {"tipo": "borrada"}, {"insumo_id": 2}])
def test_evento_valida_tipo(api, base, cuerpo):
    assert api.post("/api/lista-compras/eventos", json=cuerpo, headers=h("token-u1")).status_code == 422
    assert base.insertadas == []
