"""Pruebas de la API con una base falsa (no tocan Supabase).

Verifican: token (401), perfil (403), que cada lectura filtre por el restaurante del
token y que las escrituras envíen ese restaurante a la función SQL.
"""

import pytest
from fastapi.testclient import TestClient
from postgrest.exceptions import APIError

from api import auth, db
from api.index import app

R1 = "11111111-1111-1111-1111-111111111111"
R2 = "22222222-2222-2222-2222-222222222222"


class Consulta:
    def __init__(self, filas):
        self.filas = list(filas)
        self.columnas = None

    def select(self, columnas):
        # Los filtros se pueden aplicar sobre columnas no seleccionadas; se recorta al final.
        self.columnas = None if columnas == "*" else columnas.split(",")
        return self

    def eq(self, col, valor):
        self.filas = [f for f in self.filas if f.get(col) == valor]
        return self

    def order(self, col, desc=False):
        self.filas.sort(key=lambda f: f[col], reverse=desc)
        return self

    def limit(self, n):
        self.filas = self.filas[:n]
        return self

    def execute(self):
        filas = self.filas if not self.columnas else [{c: f.get(c) for c in self.columnas} for f in self.filas]
        return type("Resp", (), {"data": filas})()


class BaseFalsa:
    def __init__(self, tablas, rpc_error=None):
        self.tablas = tablas
        self.llamadas = []
        self.rpc_error = rpc_error

    def table(self, nombre):
        return Consulta(self.tablas.get(nombre, []))

    def rpc(self, funcion, params):
        self.llamadas.append((funcion, params))
        if self.rpc_error:
            raise self.rpc_error
        # Una función que devuelve jsonb llega como dict en `.data`.
        data = {"ok": True, "id": 99, "total": 21.0} if funcion == "registrar_venta" else {"ok": True}
        return type("Rpc", (), {"execute": lambda self: type("Resp", (), {"data": data})()})()


TABLAS = {
    "perfiles": [
        {"user_id": "u1", "restaurante_id": R1, "rol": "admin"},
        {"user_id": "u2", "restaurante_id": R2, "rol": "admin"},
    ],
    "platos": [
        {"id": 1, "restaurante_id": R1, "nombre": "Lomo saltado", "categoria": "Carta", "precio": 22.0, "activo": True},
        {"id": 2, "restaurante_id": R1, "nombre": "Ají de gallina", "categoria": "Menú", "precio": 15.0, "activo": False},
        {"id": 3, "restaurante_id": R2, "nombre": "Plato de otro", "categoria": "Carta", "precio": 30.0, "activo": True},
    ],
    "resumen_hoy": [
        {"restaurante_id": R1, "platos": 5, "total": 98.5},
        {"restaurante_id": R2, "platos": 40, "total": 900.0},
    ],
    "insumos_resumen": [
        {"id": 1, "restaurante_id": R1, "nombre": "Papa", "nivel": "Bajo", "activo": True, "dias_restantes": 2.5},
        {"id": 2, "restaurante_id": R1, "nombre": "Carne", "nivel": "Crítico", "activo": True, "dias_restantes": 0.8},
        {"id": 3, "restaurante_id": R1, "nombre": "Arroz", "nivel": None, "activo": True, "dias_restantes": 10},
        {"id": 4, "restaurante_id": R1, "nombre": "Inactivo", "nivel": "Crítico", "activo": False, "dias_restantes": 0},
        {"id": 5, "restaurante_id": R2, "nombre": "Ajeno", "nivel": "Crítico", "activo": True, "dias_restantes": 0},
    ],
    "insumos_por_vencer": [
        {"insumo_id": 7, "restaurante_id": R1, "nombre": "Tomate", "dias_restantes": 1, "estado": "Vence mañana"},
        {"insumo_id": 8, "restaurante_id": R2, "nombre": "Ajeno", "dias_restantes": 0, "estado": "Vence hoy"},
    ],
    "ventas_hoy": [
        {"id": 10, "restaurante_id": R1, "fecha": "2026-11-15T12:00:00Z", "total": 22},
        {"id": 11, "restaurante_id": R1, "fecha": "2026-11-15T13:00:00Z", "total": 15},
        {"id": 12, "restaurante_id": R2, "fecha": "2026-11-15T14:00:00Z", "total": 30},
    ],
}

TOKENS = {"token-u1": "u1", "token-u2": "u2", "token-sin-perfil": "u3"}


@pytest.fixture
def base(monkeypatch):
    falsa = BaseFalsa(TABLAS)
    monkeypatch.setattr(db, "cliente", lambda: falsa)
    monkeypatch.setattr(auth, "validar_token", lambda t: TOKENS.get(t))
    return falsa


@pytest.fixture
def api():
    return TestClient(app)


def h(token):
    return {"Authorization": f"Bearer {token}"}


def test_health_sin_token_ni_claves(api):
    assert api.get("/api/health").json() == {"ok": True}


@pytest.mark.parametrize("headers", [{}, {"Authorization": "token-u1"}, h("token-falso")])
def test_sin_token_valido_401(api, base, headers):
    assert api.get("/api/platos", headers=headers).status_code == 401


def test_sin_perfil_403(api, base):
    assert api.get("/api/platos", headers=h("token-sin-perfil")).status_code == 403


def test_platos_solo_activos_y_del_restaurante(api, base):
    r = api.get("/api/platos", headers=h("token-u1"))
    assert r.status_code == 200
    assert r.json() == [{"id": 1, "nombre": "Lomo saltado", "categoria": "Carta", "precio": 22.0}]
    assert [p["id"] for p in api.get("/api/platos", headers=h("token-u2")).json()] == [3]


def test_resumen(api, base):
    r = api.get("/api/resumen", headers=h("token-u1")).json()
    assert (r["platos"], r["total"]) == (5, 98.5)
    assert [i["nombre"] for i in r["por_agotarse"]] == ["Carne", "Papa"]  # Crítico primero, sin inactivos ni ajenos
    assert [i["nombre"] for i in r["por_vencer"]] == ["Tomate"]


def test_resumen_sin_ventas(api, monkeypatch):
    falsa = BaseFalsa({**TABLAS, "resumen_hoy": []})
    monkeypatch.setattr(db, "cliente", lambda: falsa)
    monkeypatch.setattr(auth, "validar_token", lambda t: TOKENS.get(t))
    r = api.get("/api/resumen", headers=h("token-u1")).json()
    assert (r["platos"], r["total"]) == (0, 0)


def test_ventas_hoy_del_restaurante_mas_recientes_primero(api, base):
    r = api.get("/api/ventas/hoy", headers=h("token-u1")).json()
    assert [v["id"] for v in r] == [11, 10]


def test_registrar_venta_usa_restaurante_del_token(api, base):
    cuerpo = {"items": [{"plato_id": 1, "cantidad": 2}], "metodo_pago": "yape_plin", "tipo": "llevar", "mesa": "4",
              "restaurante_id": R2}  # un restaurante en el body se ignora
    r = api.post("/api/ventas", json=cuerpo, headers=h("token-u1"))
    assert r.status_code == 200
    funcion, params = base.llamadas[-1]
    assert funcion == "registrar_venta"
    assert params["p_restaurante"] == R1 and params["p_usuario"] == "u1"
    assert params["p_items"] == [{"plato_id": 1, "cantidad": 2}]
    assert params["p_mesa"] is None  # para llevar no lleva mesa


@pytest.mark.parametrize(
    "cuerpo",
    [
        {"items": []},
        {"items": [{"plato_id": 1, "cantidad": 0}]},
        {"items": [{"plato_id": 1, "cantidad": 1}], "metodo_pago": "bitcoin"},
        {"items": [{"plato_id": 1, "cantidad": 1}], "tipo": "delivery"},
    ],
)
def test_registrar_venta_valida_cuerpo(api, base, cuerpo):
    assert api.post("/api/ventas", json=cuerpo, headers=h("token-u1")).status_code == 422
    assert base.llamadas == []


def test_anular_venta(api, base):
    r = api.post("/api/ventas/10/anular", json={"motivo": "error"}, headers=h("token-u1"))
    assert r.status_code == 200
    assert base.llamadas[-1] == ("anular_venta", {"p_restaurante": R1, "p_venta": 10, "p_motivo": "error"})


def test_error_de_la_base_es_400_con_mensaje(api, monkeypatch):
    error = APIError({"code": "P0001", "message": "La venta ya está anulada"})
    falsa = BaseFalsa(TABLAS, rpc_error=error)
    monkeypatch.setattr(db, "cliente", lambda: falsa)
    monkeypatch.setattr(auth, "validar_token", lambda t: TOKENS.get(t))
    r = api.post("/api/ventas/10/anular", json={}, headers=h("token-u1"))
    assert r.status_code == 400
    assert r.json() == {"detail": "La venta ya está anulada"}
