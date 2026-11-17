"""Pruebas de insumos, ajustes y compras con la base falsa de test_api."""

import pytest
from postgrest.exceptions import APIError

from api import auth, db
from tests.test_api import R1, R2, TABLAS, TOKENS, BaseFalsa, api, h  # noqa: F401 (api es un fixture)

INSUMOS = [
    {"id": 1, "restaurante_id": R1, "nombre": "Papa", "unidad": "g", "activo": True, "nivel": "Bajo"},
    {"id": 2, "restaurante_id": R1, "nombre": "Arroz", "unidad": "g", "activo": True, "nivel": None},
    {"id": 3, "restaurante_id": R1, "nombre": "Retirado", "unidad": "g", "activo": False, "nivel": None},
    {"id": 4, "restaurante_id": R2, "nombre": "Ajeno", "unidad": "g", "activo": True, "nivel": None},
]


def _poner_base(monkeypatch, **kw):
    falsa = BaseFalsa({**TABLAS, "insumos_resumen": INSUMOS}, **kw)
    monkeypatch.setattr(db, "cliente", lambda: falsa)
    monkeypatch.setattr(auth, "validar_token", lambda t: TOKENS.get(t))
    return falsa


@pytest.fixture
def base(monkeypatch):
    return _poner_base(monkeypatch)


NUEVO = {"nombre": "Cebolla", "unidad": "g", "en_recetas": True, "costo_unitario": 0.004, "presentacion_compra": 1000}

RUTAS = [
    ("get", "/api/insumos", None),
    ("post", "/api/insumos", NUEVO),
    ("post", "/api/insumos/importar", {"insumos": [NUEVO]}),
    ("post", "/api/insumos/1/ajuste", {"tipo": "merma", "cantidad": 5}),
    ("post", "/api/compras", {"lineas": [{"insumo_id": 1, "cantidad": 1, "costo_total": 1}]}),
]


@pytest.mark.parametrize("metodo,ruta,cuerpo", RUTAS)
def test_sin_token_401(api, base, metodo, ruta, cuerpo):
    assert api.request(metodo, ruta, json=cuerpo).status_code == 401
    assert base.llamadas == []


def test_listar_solo_activos_del_restaurante(api, base):
    r = api.get("/api/insumos", headers=h("token-u1"))
    assert r.status_code == 200
    assert [i["nombre"] for i in r.json()] == ["Arroz", "Papa"]
    assert [i["id"] for i in api.get("/api/insumos", headers=h("token-u2")).json()] == [4]


def test_crear_insumo_usa_restaurante_y_usuario_del_token(api, base):
    r = api.post("/api/insumos", json={**NUEVO, "restaurante_id": R2, "stock": 500}, headers=h("token-u1"))
    assert r.status_code == 200
    funcion, p = base.llamadas[-1]
    assert funcion == "crear_insumo" and p["p_restaurante"] == R1 and p["p_usuario"] == "u1"
    assert p["p_datos"]["nombre"] == "Cebolla" and p["p_datos"]["stock"] == 500
    assert "restaurante_id" not in p["p_datos"]


@pytest.mark.parametrize(
    "cambio",
    [
        {"unidad": "kg"},
        {"nombre": ""},
        {"costo_unitario": -1},
        {"presentacion_compra": 0},
        {"stock": -5},
        {"en_recetas": "quizas"},
    ],
)
def test_crear_insumo_valida_cuerpo(api, base, cambio):
    assert api.post("/api/insumos", json={**NUEVO, **cambio}, headers=h("token-u1")).status_code == 422
    assert base.llamadas == []


def test_importar_manda_lista_del_token(api, base):
    cuerpo = {"insumos": [NUEVO, {**NUEVO, "nombre": "Ajo", "unidad": "unid"}], "restaurante_id": R2}
    assert api.post("/api/insumos/importar", json=cuerpo, headers=h("token-u2")).status_code == 200
    funcion, p = base.llamadas[-1]
    assert funcion == "importar_insumos" and p["p_restaurante"] == R2 and p["p_usuario"] == "u2"
    assert [d["nombre"] for d in p["p_lista"]] == ["Cebolla", "Ajo"]


@pytest.mark.parametrize("cuerpo", [{"insumos": []}, {"insumos": [{**NUEVO, "unidad": "lt"}]}, {}])
def test_importar_valida_cuerpo(api, base, cuerpo):
    assert api.post("/api/insumos/importar", json=cuerpo, headers=h("token-u1")).status_code == 422
    assert base.llamadas == []


def test_ajuste_toma_el_id_de_la_url(api, base):
    cuerpo = {"insumo_id": 999, "tipo": "merma", "cantidad": 250, "motivo": "se malogró", "restaurante_id": R2}
    assert api.post("/api/insumos/7/ajuste", json=cuerpo, headers=h("token-u1")).status_code == 200
    assert base.llamadas[-1] == (
        "ajustar_stock",
        {"p_restaurante": R1, "p_usuario": "u1", "p_insumo": 7, "p_tipo": "merma", "p_cantidad": 250, "p_motivo": "se malogró"},
    )


def test_ajuste_a_cero_es_valido(api, base):
    assert api.post("/api/insumos/7/ajuste", json={"tipo": "ajuste", "cantidad": 0}, headers=h("token-u1")).status_code == 200


@pytest.mark.parametrize(
    "cuerpo",
    [
        {"tipo": "robo", "cantidad": 1},
        {"tipo": "merma", "cantidad": 0},
        {"tipo": "consumo_propio", "cantidad": 0},
        {"tipo": "ajuste", "cantidad": -1},
        {"tipo": "ajuste"},
    ],
)
def test_ajuste_valida_cuerpo(api, base, cuerpo):
    assert api.post("/api/insumos/7/ajuste", json=cuerpo, headers=h("token-u1")).status_code == 422
    assert base.llamadas == []


def test_registrar_compra(api, base):
    cuerpo = {"lineas": [{"insumo_id": 1, "cantidad": 5000, "costo_total": 12.5}], "restaurante_id": R2}
    assert api.post("/api/compras", json=cuerpo, headers=h("token-u1")).status_code == 200
    assert base.llamadas[-1] == (
        "registrar_compra",
        {"p_restaurante": R1, "p_usuario": "u1", "p_lineas": [{"insumo_id": 1, "cantidad": 5000, "costo_total": 12.5}]},
    )


@pytest.mark.parametrize(
    "cuerpo",
    [
        {"lineas": []},
        {"lineas": [{"insumo_id": 1, "cantidad": 0, "costo_total": 5}]},
        {"lineas": [{"insumo_id": 1, "cantidad": 1, "costo_total": -5}]},
        {"lineas": [{"cantidad": 1, "costo_total": 5}]},
    ],
)
def test_compra_valida_cuerpo(api, base, cuerpo):
    assert api.post("/api/compras", json=cuerpo, headers=h("token-u1")).status_code == 422
    assert base.llamadas == []


def test_error_de_la_base_es_400(api, monkeypatch):
    error = APIError({"code": "P0001", "message": "No hay stock de este insumo para descontar"})
    _poner_base(monkeypatch, rpc_error=error)
    r = api.post("/api/insumos/1/ajuste", json={"tipo": "merma", "cantidad": 5}, headers=h("token-u1"))
    assert r.status_code == 400
    assert r.json() == {"detail": "No hay stock de este insumo para descontar"}
