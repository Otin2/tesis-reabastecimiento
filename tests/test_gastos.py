"""Pruebas de /api/gastos con la base falsa (no tocan Supabase)."""

import pytest
from postgrest.exceptions import APIError

from api import auth, db
from tests.test_api import R1, R2, TOKENS, api, h  # noqa: F401  (api es fixture)
from tests.test_ganancias import HOY, PERFILES, BaseFalsa2, usar

TABLAS = {
    "perfiles": PERFILES,
    "gastos_lista": [
        {"restaurante_id": R1, "id": "f1", "nombre": "Luz", "categoria": "servicios", "monto": 180, "fijo": True},
        {"restaurante_id": R1, "id": "g5", "nombre": "Gas extra", "categoria": "otros", "monto": 40, "fijo": False},
        {"restaurante_id": R2, "id": "f9", "nombre": "Ajeno", "categoria": "alquiler", "monto": 900, "fijo": True},
    ],
}


@pytest.fixture
def base(monkeypatch):
    return usar(monkeypatch, TABLAS)


@pytest.mark.parametrize(
    "metodo,ruta",
    [("get", "/api/gastos"), ("post", "/api/gastos"), ("put", "/api/gastos/f1"), ("delete", "/api/gastos/f1")],
)
def test_sin_token_401(api, base, metodo, ruta):
    assert api.request(metodo, ruta, json={}).status_code == 401
    assert base.llamadas == []


def test_lista_del_restaurante_y_genera_fijos_del_mes(api, base):
    r = api.get("/api/gastos", headers=h("token-u1"))
    assert r.status_code == 200
    assert r.json() == [
        {"id": "g5", "nombre": "Gas extra", "categoria": "otros", "monto": 40, "fijo": False},
        {"id": "f1", "nombre": "Luz", "categoria": "servicios", "monto": 180, "fijo": True},
    ]
    assert base.llamadas == [("generar_gastos_mes", {"p_restaurante": R1, "p_mes": HOY.isoformat()})]
    assert [g["id"] for g in api.get("/api/gastos", headers=h("token-u2")).json()] == ["f9"]


def test_crear_usa_restaurante_y_usuario_del_token(api, base):
    cuerpo = {"nombre": "Internet", "categoria": "servicios", "monto": 80, "fijo": True, "restaurante_id": R2}
    r = api.post("/api/gastos", json=cuerpo, headers=h("token-u1"))
    assert r.status_code == 200
    assert base.llamadas[-1] == (
        "crear_gasto",
        {"p_restaurante": R1, "p_usuario": "u1", "p_nombre": "Internet", "p_categoria": "servicios", "p_monto": 80.0, "p_fijo": True},
    )


@pytest.mark.parametrize(
    "cuerpo",
    [
        {"nombre": "", "categoria": "servicios", "monto": 10},
        {"nombre": "Luz", "categoria": "comida", "monto": 10},
        {"nombre": "Luz", "categoria": "servicios", "monto": -1},
        {"nombre": "Luz", "categoria": "servicios"},
    ],
)
def test_crear_valida_cuerpo(api, base, cuerpo):
    assert api.post("/api/gastos", json=cuerpo, headers=h("token-u1")).status_code == 422
    assert base.llamadas == []


def test_actualizar_solo_cambia_el_monto(api, base):
    # El frontend manda el gasto completo.
    cuerpo = {"id": "f1", "nombre": "Otro", "categoria": "otros", "monto": 200, "fijo": False}
    r = api.put("/api/gastos/f1", json=cuerpo, headers=h("token-u1"))
    assert r.status_code == 200
    assert base.llamadas[-1] == ("actualizar_gasto", {"p_restaurante": R1, "p_id": "f1", "p_monto": 200.0})


def test_quitar(api, base):
    r = api.delete("/api/gastos/g5", headers=h("token-u2"))
    assert r.status_code == 200
    assert base.llamadas[-1] == ("quitar_gasto", {"p_restaurante": R2, "p_id": "g5"})


@pytest.mark.parametrize("gid", ["12", "x12", "fabc", "f", "f1.5"])
def test_id_invalido_422_sin_llamar_a_la_base(api, base, gid):
    assert api.put(f"/api/gastos/{gid}", json={"monto": 1}, headers=h("token-u1")).status_code == 422
    assert api.delete(f"/api/gastos/{gid}", headers=h("token-u1")).status_code == 422
    assert base.llamadas == []


def test_actualizar_valida_monto(api, base):
    assert api.put("/api/gastos/f1", json={"monto": -5}, headers=h("token-u1")).status_code == 422
    assert api.put("/api/gastos/f1", json={}, headers=h("token-u1")).status_code == 422
    assert base.llamadas == []


def test_gasto_inexistente_es_400(api, monkeypatch):
    falsa = BaseFalsa2(TABLAS, rpc_error=APIError({"code": "P0001", "message": "El gasto no existe"}))
    monkeypatch.setattr(db, "cliente", lambda: falsa)
    monkeypatch.setattr(auth, "validar_token", lambda t: TOKENS.get(t))
    r = api.delete("/api/gastos/f99", headers=h("token-u1"))
    assert r.status_code == 400
    assert r.json() == {"detail": "El gasto no existe"}
