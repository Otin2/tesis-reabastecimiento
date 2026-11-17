"""Pruebas de /api/ganancias con un caso calculado a mano (hoy = miércoles 18-nov-2026).

También define la base falsa ampliada (gte, lte, in_, insert) que usan test_gastos y test_lista.
"""

from datetime import date

import pytest

from api import auth, db
from api.rutas.ganancias import rangos
from tests.test_api import R1, R2, TOKENS, BaseFalsa, Consulta, api, h  # noqa: F401  (api es fixture)

HOY = date(2026, 11, 18)


class Consulta2(Consulta):
    def __init__(self, filas, base=None, tabla=None):
        super().__init__(filas)
        self.base, self.tabla = base, tabla

    def gte(self, col, valor):
        self.filas = [f for f in self.filas if f.get(col) >= valor]
        return self

    def lte(self, col, valor):
        self.filas = [f for f in self.filas if f.get(col) <= valor]
        return self

    def in_(self, col, valores):
        self.filas = [f for f in self.filas if f.get(col) in valores]
        return self

    def insert(self, fila):
        self.base.insertadas.append((self.tabla, fila))
        self.filas = [fila]
        return self


class BaseFalsa2(BaseFalsa):
    def __init__(self, tablas, rpc_error=None):
        super().__init__(tablas, rpc_error)
        self.insertadas = []

    def table(self, nombre):
        return Consulta2(self.tablas.get(nombre, []), self, nombre)


def usar(monkeypatch, tablas, hoy=HOY):
    falsa = BaseFalsa2(tablas)
    monkeypatch.setattr(db, "cliente", lambda: falsa)
    monkeypatch.setattr(db, "hoy_lima", lambda: hoy)
    monkeypatch.setattr(auth, "validar_token", lambda t: TOKENS.get(t))
    return falsa


PERFILES = [
    {"user_id": "u1", "restaurante_id": R1, "rol": "admin"},
    {"user_id": "u2", "restaurante_id": R2, "rol": "admin"},
]


def gdia(gasto_id, dia, monto, categoria="alquiler", descripcion="Alquiler del local", r=R1):
    return {"restaurante_id": r, "dia": dia, "gasto_id": gasto_id, "categoria": categoria, "descripcion": descripcion, "monto": monto}


TABLAS = {
    "perfiles": PERFILES,
    "margen_por_plato": [
        {"plato_id": 1, "restaurante_id": R1, "nombre": "Lomo saltado", "precio": 22, "activo": True, "costo": 9.29, "ganancia": 12.71, "margen_pct": 57.8},
        {"plato_id": 2, "restaurante_id": R1, "nombre": "Chicha", "precio": 10, "activo": True, "costo": 1.6, "ganancia": 8.4, "margen_pct": 84.0},
        {"plato_id": 3, "restaurante_id": R1, "nombre": "Inactivo sin ventas", "precio": 5, "activo": False, "costo": 1, "ganancia": 4, "margen_pct": 80.0},
        {"plato_id": 4, "restaurante_id": R1, "nombre": "Cortesía", "precio": 0, "activo": True, "costo": 1, "ganancia": -1, "margen_pct": None},
        {"plato_id": 99, "restaurante_id": R2, "nombre": "Ajeno", "precio": 50, "activo": True, "costo": 10, "ganancia": 40, "margen_pct": 80.0},
    ],
    "ventas_por_plato_dia": [
        {"restaurante_id": R1, "plato_id": 1, "dia": "2026-11-15", "cantidad": 10, "ventas": 220},  # domingo anterior
        {"restaurante_id": R1, "plato_id": 1, "dia": "2026-11-16", "cantidad": 2, "ventas": 44},
        {"restaurante_id": R1, "plato_id": 1, "dia": "2026-11-18", "cantidad": 3, "ventas": 66},
        {"restaurante_id": R1, "plato_id": 2, "dia": "2026-11-17", "cantidad": 4, "ventas": 40},
        {"restaurante_id": R2, "plato_id": 1, "dia": "2026-11-17", "cantidad": 50, "ventas": 1100},
    ],
    "ganancia_por_dia": [
        {"restaurante_id": R1, "dia": "2026-11-08", "ventas": 999, "costo": 499, "ganancia": 500},
        {"restaurante_id": R1, "dia": "2026-11-09", "ventas": 100, "costo": 40, "ganancia": 60},
        {"restaurante_id": R1, "dia": "2026-11-15", "ventas": 220, "costo": 92.9, "ganancia": 127.1},
        {"restaurante_id": R1, "dia": "2026-11-16", "ventas": 44, "costo": 18.58, "ganancia": 25.42},
        {"restaurante_id": R1, "dia": "2026-11-17", "ventas": 40, "costo": 6.4, "ganancia": 33.6},
        {"restaurante_id": R1, "dia": "2026-11-18", "ventas": 66, "costo": 27.87, "ganancia": 38.13},
        {"restaurante_id": R2, "dia": "2026-11-17", "ventas": 1000, "costo": 100, "ganancia": 900},
    ],
    "perdidas_por_dia": [
        {"restaurante_id": R1, "dia": "2026-11-12", "tipo": "merma", "costo": 3.0},
        {"restaurante_id": R1, "dia": "2026-11-17", "tipo": "merma", "costo": 5.5},
        {"restaurante_id": R1, "dia": "2026-11-18", "tipo": "consumo_propio", "costo": 2.0},
        {"restaurante_id": R2, "dia": "2026-11-17", "tipo": "merma", "costo": 100},
    ],
    "gastos_por_dia": [
        # Alquiler de 1200 en noviembre (30 días): 40 por día, también en los días que aún no llegan.
        *(gdia(7, f"2026-11-{d:02d}", 40) for d in range(1, 31)),
        gdia(8, "2026-11-17", 50, "otros", "Gas extra"),
        gdia(9, "2026-11-20", 30, "servicios", None),  # futuro: no cuenta
        gdia(70, "2026-11-17", 500, r=R2),
    ],
    "insumos": [
        {"id": 2, "restaurante_id": R1, "nombre": "Papa", "unidad": "g", "costo_unitario": 0.0032},
        {"id": 5, "restaurante_id": R1, "nombre": "Carne", "unidad": "g", "costo_unitario": 0.035},
        {"id": 11, "restaurante_id": R1, "nombre": "Maíz morado", "unidad": "g", "costo_unitario": 0.008},
        {"id": 50, "restaurante_id": R2, "nombre": "Ajeno", "unidad": "g", "costo_unitario": 1},
    ],
    "recetas": [
        {"plato_id": 1, "insumo_id": 5, "cantidad": 200},
        {"plato_id": 1, "insumo_id": 2, "cantidad": 250},
        {"plato_id": 2, "insumo_id": 11, "cantidad": 150},
        {"plato_id": 99, "insumo_id": 50, "cantidad": 1},
        {"plato_id": 1, "insumo_id": 50, "cantidad": 1},  # insumo de otro restaurante: no debe aparecer
    ],
}


@pytest.fixture
def base(monkeypatch):
    return usar(monkeypatch, TABLAS)


def test_sin_token_401(api, base):
    assert api.get("/api/ganancias").status_code == 401


def test_periodo_invalido_422(api, base):
    assert api.get("/api/ganancias?periodo=anio", headers=h("token-u1")).status_code == 422


def test_semana_calculada_a_mano(api, base):
    r = api.get("/api/ganancias?periodo=semana", headers=h("token-u1"))
    assert r.status_code == 200
    assert base.llamadas[0] == ("generar_gastos_mes", {"p_restaurante": R1, "p_mes": "2026-11-18"})
    res = r.json()["resumen"]
    # Lunes 16 a hoy (miércoles 18). El domingo 15 y lo de R2 no entran.
    assert (res["etiqueta"], res["previo"], res["dias"], res["barras_titulo"]) == ("esta semana", "la semana pasada", 7, "Por día")
    assert (res["ventas"], res["costo"], res["ganancia"]) == (150.0, 52.85, 97.15)
    assert res["margen_pct"] == 64.8  # 97.15 / 150
    assert res["costos"] == [
        {"id": "insumos", "grupo": "Insumos", "nombre": "Insumos de lo vendido", "monto": 52.85},
        {"id": "mermas", "grupo": "Insumos", "nombre": "Mermas y uso propio", "monto": 7.5},
        {"id": "g7", "grupo": "Alquiler", "nombre": "Alquiler del local", "monto": 120.0},  # 3 días × 40
        {"id": "g8", "grupo": "Otros", "nombre": "Gas extra", "monto": 50.0},
    ]
    assert res["barras"] == [
        {"etiqueta": "Lun", "ganancia": 25.42},
        {"etiqueta": "Mar", "ganancia": 33.6},
        {"etiqueta": "Mié", "ganancia": 38.13},
        *({"etiqueta": d, "ganancia": 0.0} for d in ["Jue", "Vie", "Sáb", "Dom"]),
    ]
    # Semana anterior completa (9 al 15): 320 − 132.9 de insumos − 3 de mermas − 7 × 40 de alquiler.
    assert res["anterior"] == {"ventas": 320.0, "neta": -95.9}


def test_platos_de_la_semana(api, base):
    platos = api.get("/api/ganancias", headers=h("token-u1")).json()["platos"]
    assert [p["id"] for p in platos] == [2, 1, 4]  # por margen; sin el inactivo sin ventas ni el ajeno
    chicha, lomo, cortesia = platos
    assert lomo == {
        "id": 1, "nombre": "Lomo saltado", "precio": 22.0, "costo": 9.29, "ganancia": 12.71, "margen_pct": 57.8,
        "vendidos": 5, "ventas_total": 110.0, "ganancia_total": 63.55,  # 110 − 5 × 9.29
        "receta": [
            {"insumo_id": 5, "insumo": "Carne", "cantidad": 200, "unidad": "g", "precio_unitario": 0.035, "costo": 7.0},
            {"insumo_id": 2, "insumo": "Papa", "cantidad": 250, "unidad": "g", "precio_unitario": 0.0032, "costo": 0.8},
        ],
    }
    assert (chicha["vendidos"], chicha["ventas_total"], chicha["ganancia_total"]) == (4, 40.0, 33.6)
    assert (cortesia["margen_pct"], cortesia["vendidos"], cortesia["receta"]) == (0.0, 0, [])
    # La suma por plato coincide con el resumen.
    assert round(sum(p["ganancia_total"] for p in platos), 2) == 97.15


def test_mes(api, base):
    res = api.get("/api/ganancias?periodo=mes", headers=h("token-u1")).json()["resumen"]
    assert (res["etiqueta"], res["dias"], res["barras_titulo"]) == ("este mes", 30, "Por semana")
    assert res["ventas"] == 1469.0  # 1 al 18 de noviembre
    assert res["barras"] == [
        {"etiqueta": "S1", "ganancia": 0.0},
        {"etiqueta": "S2", "ganancia": 560.0},
        {"etiqueta": "S3", "ganancia": 224.25},
        {"etiqueta": "S4", "ganancia": 0.0},
    ]
    alquiler = next(c for c in res["costos"] if c["id"] == "g7")
    assert alquiler["monto"] == 720.0  # 18 días × 40, no el mes entero
    assert res["anterior"] == {"ventas": 0.0, "neta": 0.0}  # octubre sin datos


def test_semana_pasada_y_otro_restaurante(api, base):
    res = api.get("/api/ganancias?periodo=semana_pasada", headers=h("token-u1")).json()["resumen"]
    assert (res["etiqueta"], res["previo"]) == ("la semana pasada", "la semana anterior")
    assert res["ventas"] == 320.0
    assert [b["ganancia"] for b in res["barras"]] == [60.0, 0, 0, 0, 0, 0, 127.1]
    assert res["anterior"]["ventas"] == 999.0  # 2 al 8 de noviembre

    otro = api.get("/api/ganancias", headers=h("token-u2")).json()
    assert otro["resumen"]["ventas"] == 1000.0
    assert [p["id"] for p in otro["platos"]] == [99]
    assert [c["id"] for c in otro["resumen"]["costos"]] == ["insumos", "mermas", "g70"]


@pytest.mark.parametrize(
    "periodo,hoy,actual,anterior",
    [
        ("semana", date(2026, 11, 16), ("2026-11-16", "2026-11-16"), ("2026-11-09", "2026-11-15")),  # lunes
        ("semana", date(2026, 11, 22), ("2026-11-16", "2026-11-22"), ("2026-11-09", "2026-11-15")),  # domingo
        ("semana_pasada", HOY, ("2026-11-09", "2026-11-15"), ("2026-11-02", "2026-11-08")),
        ("semana_antepasada", HOY, ("2026-11-02", "2026-11-08"), ("2026-10-26", "2026-11-01")),
        ("mes", date(2026, 1, 5), ("2026-01-01", "2026-01-05"), ("2025-12-01", "2025-12-31")),
        ("mes", date(2026, 3, 31), ("2026-03-01", "2026-03-31"), ("2026-02-01", "2026-02-28")),
    ],
)
def test_rangos(periodo, hoy, actual, anterior):
    (a, b), (c, d) = rangos(periodo, hoy)
    assert (a.isoformat(), b.isoformat()) == actual
    assert (c.isoformat(), d.isoformat()) == anterior


def test_tope_de_filas_no_cambia_los_numeros(api, base, monkeypatch):
    """Si una consulta llega al tope de filas de Supabase, el rango se parte y no se pierde nada."""
    from api.rutas import ganancias

    normal = api.get("/api/ganancias?periodo=semana", headers=h("token-u1")).json()
    monkeypatch.setattr(ganancias, "TOPE_FILAS", 2)
    assert api.get("/api/ganancias?periodo=semana", headers=h("token-u1")).json() == normal
    monkeypatch.setattr(ganancias, "TOPE_FILAS", 1)
    assert api.get("/api/ganancias?periodo=mes", headers=h("token-u1")).json()["resumen"]["ventas"] > 0
