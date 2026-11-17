"""Ganancias: /ganancias?periodo=. Los números salen de las vistas; aquí solo se suman por rango de días."""

from datetime import date, timedelta
from typing import Literal

from fastapi import APIRouter, Depends

from api import db
from api.auth import Usuario, usuario_actual
from api.db import leer, rpc

router = APIRouter(prefix="/api")

# Textos iguales a los del modo demo (mock.js). `dias` = 30 hace que la pantalla trate el periodo como mes.
PERIODOS = {
    "semana": {"etiqueta": "esta semana", "previo": "la semana pasada", "dias": 7, "barras": "Por día"},
    "semana_pasada": {"etiqueta": "la semana pasada", "previo": "la semana anterior", "dias": 7, "barras": "Por día"},
    "semana_antepasada": {"etiqueta": "la semana antepasada", "previo": "la semana anterior", "dias": 7, "barras": "Por día"},
    "mes": {"etiqueta": "este mes", "previo": "el mes pasado", "dias": 30, "barras": "Por semana"},
}
DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]
GRUPO_GASTO = {"alquiler": "Alquiler", "servicios": "Servicios", "sueldos": "Sueldos", "otros": "Otros"}


def rangos(periodo: str, hoy: date):
    """(inicio, fin) del periodo y del anterior, ambos incluidos. El periodo en curso termina hoy:
    gastos_por_dia ya tiene filas para los días futuros del mes."""
    lunes = hoy - timedelta(days=hoy.weekday())
    if periodo == "mes":
        ini = hoy.replace(day=1)
        fin_ant = ini - timedelta(days=1)
        return (ini, hoy), (fin_ant.replace(day=1), fin_ant)
    atras = {"semana": 0, "semana_pasada": 1, "semana_antepasada": 2}[periodo]
    ini = lunes - timedelta(weeks=atras)
    fin = hoy if atras == 0 else ini + timedelta(days=6)
    return (ini, fin), (ini - timedelta(weeks=1), ini - timedelta(days=1))


# Supabase devuelve como máximo 1000 filas por consulta. Las vistas por día pueden pasarse
# (gastos × días, platos × días); si una respuesta llega al tope, el rango se parte en dos.
TOPE_FILAS = 1000


def filas(u: Usuario, vista: str, columnas: str, ini: date, fin: date):
    datos = leer(u, vista, columnas).gte("dia", ini.isoformat()).lte("dia", fin.isoformat()).execute().data
    if len(datos) >= TOPE_FILAS and ini < fin:
        medio = ini + (fin - ini) // 2
        return filas(u, vista, columnas, ini, medio) + filas(u, vista, columnas, medio + timedelta(days=1), fin)
    return datos


def num(x) -> float:
    return float(x or 0)


def costos(u: Usuario, ini: date, fin: date, costo_insumos: float):
    """Renglones de lo que se resta: insumos vendidos, mermas y uso propio, y cada gasto del rango."""
    mermas = sum(num(f["costo"]) for f in filas(u, "perdidas_por_dia", "costo", ini, fin))
    gastos: dict = {}
    for f in filas(u, "gastos_por_dia", "gasto_id,categoria,descripcion,monto", ini, fin):
        grupo = GRUPO_GASTO.get(f["categoria"], "Otros")
        g = gastos.setdefault(f["gasto_id"], {"id": f"g{f['gasto_id']}", "grupo": grupo, "nombre": f["descripcion"] or grupo, "monto": 0.0})
        g["monto"] += num(f["monto"])
    renglones = [
        {"id": "insumos", "grupo": "Insumos", "nombre": "Insumos de lo vendido", "monto": costo_insumos},
        {"id": "mermas", "grupo": "Insumos", "nombre": "Mermas y uso propio", "monto": mermas},
        *(gastos[k] for k in sorted(gastos)),
    ]
    return [{**r, "monto": round(r["monto"], 2)} for r in renglones]


def totales(u: Usuario, ini: date, fin: date):
    dias = filas(u, "ganancia_por_dia", "dia,ventas,costo,ganancia", ini, fin)
    ventas = sum(num(d["ventas"]) for d in dias)
    costo = sum(num(d["costo"]) for d in dias)
    lista = costos(u, ini, fin, costo)
    return {"dias": dias, "ventas": ventas, "costo": costo, "costos": lista, "neta": ventas - sum(c["monto"] for c in lista)}


def barras(periodo: str, ini: date, dias: list):
    por_dia = {date.fromisoformat(str(d["dia"])[:10]): num(d["ganancia"]) for d in dias}
    if periodo == "mes":
        # S1 = días 1-7, S2 = 8-14, S3 = 15-21, S4 = 22 al fin de mes.
        tramos = [0.0] * 4
        for dia, g in por_dia.items():
            tramos[min((dia.day - 1) // 7, 3)] += g
        return [{"etiqueta": f"S{i + 1}", "ganancia": round(g, 2)} for i, g in enumerate(tramos)]
    return [
        {"etiqueta": DIAS[i], "ganancia": round(por_dia.get(ini + timedelta(days=i), 0.0), 2)} for i in range(7)
    ]


def platos(u: Usuario, ini: date, fin: date):
    margen = leer(u, "margen_por_plato", "plato_id,nombre,precio,activo,costo,ganancia,margen_pct").execute().data
    vendidos: dict = {}
    for f in filas(u, "ventas_por_plato_dia", "plato_id,cantidad,ventas", ini, fin):
        v = vendidos.setdefault(f["plato_id"], [0.0, 0.0])
        v[0] += num(f["cantidad"])
        v[1] += num(f["ventas"])
    margen = [p for p in margen if p["activo"] or p["plato_id"] in vendidos]

    recetas: dict = {}
    if margen:
        insumos = {i["id"]: i for i in leer(u, "insumos", "id,nombre,unidad,costo_unitario").execute().data}
        # recetas no tiene restaurante_id: se leen solo las de los platos de este restaurante.
        lineas = (
            db.cliente()
            .table("recetas")
            .select("plato_id,insumo_id,cantidad")
            .in_("plato_id", [p["plato_id"] for p in margen])
            .execute()
            .data
        )
        for r in lineas:
            i = insumos.get(r["insumo_id"])
            if not i:
                continue
            recetas.setdefault(r["plato_id"], []).append(
                {
                    "insumo_id": i["id"],
                    "insumo": i["nombre"],
                    "cantidad": r["cantidad"],
                    "unidad": i["unidad"],
                    "precio_unitario": i["costo_unitario"],
                    "costo": round(num(r["cantidad"]) * num(i["costo_unitario"]), 2),
                }
            )

    salida = []
    for p in margen:
        cantidad, ventas = vendidos.get(p["plato_id"], (0.0, 0.0))
        costo = num(p["costo"])
        salida.append(
            {
                "id": p["plato_id"],
                "nombre": p["nombre"],
                "precio": num(p["precio"]),
                "costo": round(costo, 2),
                "ganancia": round(num(p["ganancia"]), 2),
                "margen_pct": num(p["margen_pct"]),  # null cuando el precio es 0
                "vendidos": int(cantidad),
                "ventas_total": round(ventas, 2),
                # Mismo cálculo que ganancia_por_dia: lo cobrado menos el costo actual de la receta.
                "ganancia_total": round(ventas - cantidad * costo, 2),
                "receta": recetas.get(p["plato_id"], []),
            }
        )
    return sorted(salida, key=lambda p: p["margen_pct"], reverse=True)


@router.get("/ganancias")
def ganancias(
    periodo: Literal["semana", "semana_pasada", "semana_antepasada", "mes"] = "semana",
    u: Usuario = Depends(usuario_actual),
):
    hoy = db.hoy_lima()
    # Idempotente: crea los gastos fijos de este mes si todavía no existen.
    rpc("generar_gastos_mes", {"p_restaurante": u.restaurante_id, "p_mes": hoy.isoformat()})
    (ini, fin), (ini_ant, fin_ant) = rangos(periodo, hoy)
    p = PERIODOS[periodo]
    act = totales(u, ini, fin)
    ant = totales(u, ini_ant, fin_ant)
    ganancia = act["ventas"] - act["costo"]
    return {
        "platos": platos(u, ini, fin),
        "resumen": {
            "etiqueta": p["etiqueta"],
            "previo": p["previo"],
            "dias": p["dias"],
            "barras_titulo": p["barras"],
            "ventas": round(act["ventas"], 2),
            "costo": round(act["costo"], 2),
            "ganancia": round(ganancia, 2),
            "margen_pct": round(ganancia / act["ventas"] * 100, 1) if act["ventas"] > 0 else 0,
            "costos": act["costos"],
            "barras": barras(periodo, ini, act["dias"]),
            "anterior": {"ventas": round(ant["ventas"], 2), "neta": round(ant["neta"], 2)},
        },
    }
