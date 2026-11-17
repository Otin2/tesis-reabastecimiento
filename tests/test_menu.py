"""Pruebas del menú y las recetas con la base falsa de test_api."""

import pytest
from postgrest.exceptions import APIError

from api import auth, db
from tests.test_api import R1, R2, TABLAS, TOKENS, BaseFalsa, Consulta, api, h  # noqa: F401


class ConsultaIn(Consulta):
    def in_(self, col, valores):
        self.filas = [f for f in self.filas if f.get(col) in valores]
        return self


class BaseConIn(BaseFalsa):
    def table(self, nombre):
        return ConsultaIn(self.tablas.get(nombre, []))


def _plato(id, rest, nombre, activo=True, precio=20.0, margen=50.0):
    return {"plato_id": id, "restaurante_id": rest, "nombre": nombre, "categoria": "Carta", "precio": precio,
            "activo": activo, "costo": 10.0, "ganancia": 10.0, "margen_pct": margen}


MARGEN = [
    _plato(1, R1, "Lomo"),
    _plato(2, R1, "Ají", activo=False, precio=0, margen=None),
    _plato(3, R2, "Ajeno"),
]
RECETAS = [  # sin restaurante_id, igual que la tabla real
    {"plato_id": 1, "insumo_id": 10, "cantidad": 200},
    {"plato_id": 1, "insumo_id": 11, "cantidad": 3},
    {"plato_id": 3, "insumo_id": 99, "cantidad": 1},
]


def _poner_base(monkeypatch, **kw):
    falsa = BaseConIn({**TABLAS, "margen_por_plato": MARGEN, "recetas": RECETAS}, **kw)
    monkeypatch.setattr(db, "cliente", lambda: falsa)
    monkeypatch.setattr(auth, "validar_token", lambda t: TOKENS.get(t))
    return falsa


@pytest.fixture
def base(monkeypatch):
    return _poner_base(monkeypatch)


PLATO = {"nombre": "Tallarín", "categoria": "Menú", "precio": 12.5, "activo": True,
         "receta": [{"insumo_id": 10, "cantidad": 150}]}


@pytest.mark.parametrize("metodo,ruta", [("get", "/api/menu"), ("post", "/api/menu"), ("put", "/api/menu/1")])
def test_sin_token_401(api, base, metodo, ruta):
    assert api.request(metodo, ruta, json=PLATO).status_code == 401
    assert base.llamadas == []


def test_menu_incluye_inactivos_y_solo_recetas_propias(api, base):
    r = api.get("/api/menu", headers=h("token-u1")).json()
    assert [p["id"] for p in r] == [2, 1]  # por nombre; incluye el inactivo
    lomo = next(p for p in r if p["id"] == 1)
    assert lomo["receta"] == [{"insumo_id": 10, "cantidad": 200}, {"insumo_id": 11, "cantidad": 3}]
    assert set(lomo) == {"id", "nombre", "categoria", "precio", "activo", "costo", "ganancia", "margen_pct", "receta"}
    inactivo = next(p for p in r if p["id"] == 2)
    assert inactivo["receta"] == [] and inactivo["margen_pct"] == 0 and inactivo["activo"] is False
    assert all(i["insumo_id"] != 99 for p in r for i in p["receta"])  # receta del otro restaurante


def test_menu_del_otro_restaurante(api, base):
    r = api.get("/api/menu", headers=h("token-u2")).json()
    assert [p["id"] for p in r] == [3]
    assert r[0]["receta"] == [{"insumo_id": 99, "cantidad": 1}]


def test_menu_vacio(api, monkeypatch):
    falsa = BaseConIn({**TABLAS, "margen_por_plato": [], "recetas": RECETAS})
    monkeypatch.setattr(db, "cliente", lambda: falsa)
    monkeypatch.setattr(auth, "validar_token", lambda t: TOKENS.get(t))
    assert api.get("/api/menu", headers=h("token-u1")).json() == []


def test_crear_plato_usa_restaurante_del_token(api, base):
    r = api.post("/api/menu", json={**PLATO, "id": 1, "restaurante_id": R2}, headers=h("token-u1"))
    assert r.status_code == 200
    assert base.llamadas[-1] == (
        "guardar_plato",
        {"p_restaurante": R1, "p_plato": None, "p_nombre": "Tallarín", "p_categoria": "Menú", "p_precio": 12.5,
         "p_activo": True, "p_receta": [{"insumo_id": 10, "cantidad": 150}]},
    )


def test_editar_plato_toma_el_id_de_la_url(api, base):
    r = api.put("/api/menu/7", json={**PLATO, "id": 1, "restaurante_id": R2}, headers=h("token-u2"))
    assert r.status_code == 200
    funcion, p = base.llamadas[-1]
    assert funcion == "guardar_plato" and p["p_restaurante"] == R2 and p["p_plato"] == 7


def test_sin_receta_no_la_toca(api, base):
    cuerpo = {k: v for k, v in PLATO.items() if k != "receta"}
    assert api.put("/api/menu/1", json=cuerpo, headers=h("token-u1")).status_code == 200
    assert base.llamadas[-1][1]["p_receta"] is None


@pytest.mark.parametrize(
    "cambio",
    [
        {"categoria": "Postres"},
        {"nombre": ""},
        {"precio": -1},
        {"receta": [{"insumo_id": 10, "cantidad": 0}]},
        {"receta": [{"cantidad": 5}]},
    ],
)
def test_plato_valida_cuerpo(api, base, cambio):
    assert api.post("/api/menu", json={**PLATO, **cambio}, headers=h("token-u1")).status_code == 422
    assert api.put("/api/menu/1", json={**PLATO, **cambio}, headers=h("token-u1")).status_code == 422
    assert base.llamadas == []


def test_error_de_la_base_es_400(api, monkeypatch):
    error = APIError({"code": "P0001", "message": "El plato no existe"})
    _poner_base(monkeypatch, rpc_error=error)
    r = api.put("/api/menu/55", json=PLATO, headers=h("token-u1"))
    assert r.status_code == 400 and r.json() == {"detail": "El plato no existe"}
