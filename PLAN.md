# PLAN.md — Agente conversacional de reabastecimiento (tesis)

> Documento para Claude Code. Explica **qué se construye, con qué y en qué orden**.
> Léelo completo antes de escribir código. Si algo no está claro o se contradice, **pregunta antes de inventar**.

---

## 0. Contexto

- **Tesis:** "Diseño e implementación de un agente conversacional para la recomendación de reabastecimiento en pequeñas empresas comerciales".
- **Caso real:** el restaurante pequeño de la hermana del autor, en Lima. **Se venden platos y se reponen insumos.** Cada venta de un plato consume insumos según su receta.
- **Alcance de la tesis:** la **recomendación de reabastecimiento** (qué insumos comprar y cuánto). Registrar ventas y consultar stock son módulos de apoyo. El margen por plato es una **funcionalidad complementaria**: se construye, pero no es un objetivo de la tesis.
- **Usuaria final:** la dueña del restaurante. Usa la app desde el celular durante un **piloto de 4 semanas**. Al final se aplica un cuestionario TAM.
- **Diseño de referencia (Figma):** https://www.figma.com/design/QjQDpGeCJpQDE2upuo4kz8
  - Página "Prototipo ▶": 4 pantallas móviles de 390×844 (Inicio, Registrar venta, Asistente, Pedido de insumos).

### Principio de diseño más importante
**La IA nunca calcula.** Todas las cifras (stock, costos, márgenes, pedidos) salen de **SQL o del motor en Python**. El LLM solo:
1. elige qué función ejecutar, y
2. redacta en español el resultado que devuelve esa función.

---

## 1. Stack (decidido, no cambiar sin preguntar)

| Capa | Tecnología | Notas |
|---|---|---|
| Frontend | **React + Vite** (JavaScript o TypeScript) | Mobile-first, igual al Figma |
| Backend | **Python + FastAPI** | Motor de pronóstico + agente + API REST |
| Base de datos | **Supabase (PostgreSQL)** + Supabase Auth | Triggers y vistas para los cálculos |
| LLM | **Gemini** vía SDK `google-genai` | Modelo por variable de entorno (`GEMINI_MODEL`, por defecto `gemini-2.5-flash`) |
| Hosting | **Vercel** (frontend + backend Python en el mismo proyecto) | Plan Hobby. Si el chat supera el límite de tiempo, el backend se mueve a Render |

**Descartado (no implementar):** RAG o búsqueda vectorial, Obsidian, Copilot Studio, Grok Bot/Muse, WhatsApp, apps nativas o publicación en tiendas, entrada por voz, entrenamiento o fine-tuning de modelos.

---

## 2. Estructura del repositorio

```
/
├── PLAN.md
├── README.md
├── vercel.json               # rutas: /api/* → FastAPI, resto → SPA de Vite
├── frontend/                 # React + Vite
│   └── src/
│       ├── pages/            # Login, Inicio, RegistrarVenta, Asistente, Pedido
│       ├── components/       # BottomNav, Tarjeta, Pill, BotonPrimario, Burbuja...
│       ├── lib/api.js        # fetch al backend (envía el token de Supabase)
│       ├── lib/supabase.js   # solo para el login (anon key)
│       └── styles/tokens.css # colores y tipografía del Figma
├── api/
│   ├── index.py              # app FastAPI (punto de entrada para Vercel)
│   ├── db.py                 # cliente Supabase (service role, SOLO backend)
│   ├── auth.py               # valida el JWT y obtiene restaurante_id
│   ├── agente/
│   │   ├── instrucciones.py  # system_instruction fija
│   │   ├── funciones.py      # funciones que el LLM puede elegir
│   │   └── enrutador.py      # flujo de 2 pasos (ver sección 6)
│   └── motor/
│       ├── consumo.py        # consumo diario por insumo (ventas × receta)
│       ├── pronostico.py     # suavizado exponencial + baseline promedio móvil
│       └── pedido.py         # punto de reorden y cantidad sugerida
├── supabase/
│   ├── migrations/           # SQL versionado (tablas, triggers, vistas, RLS)
│   └── seed.sql              # datos de ejemplo del restaurante
├── scripts/
│   ├── generar_ventas_sinteticas.py   # 6 meses de ventas para probar el motor
│   └── evaluar_agente.py              # corre el banco de consultas y mide aciertos
├── tests/
└── requirements.txt          # fastapi, supabase, google-genai, pandas, statsmodels, pytest
```

> Verifica en la documentación actual de Vercel cómo desplegar FastAPI junto a una SPA de Vite en un mismo proyecto, y ajusta `vercel.json` o la estructura según lo que indique.

---

## 3. Base de datos (Supabase)

### 3.1 Regla de unidades (crítica)
Todo se guarda en **unidad base**: `g`, `ml` o `unid`. Los costos son **S/ por unidad base** (por ejemplo, carne a S/ 35/kg → `0.035` por g). Las conversiones a kg o L se hacen solo al **mostrar** los datos.

### 3.2 Tablas
Todas las tablas de negocio tienen `restaurante_id` (el sistema es **multiempresa**).

- `restaurantes` (id, nombre, created_at)
- `perfiles` (user_id → auth.users, restaurante_id, nombre, rol)
- `insumos` (id, restaurante_id, nombre, unidad `g|ml|unid`, costo_unitario numeric, stock numeric, punto_reorden numeric, lead_time_dias int default 1, presentacion_compra numeric, por ejemplo un saco de 50 kg = 50000)
- `platos` (id, restaurante_id, nombre, categoria `Menú|Carta|Bebidas`, precio numeric, activo bool)
- `recetas` (plato_id, insumo_id, cantidad numeric) → cuánto lleva **un** plato. PK (plato_id, insumo_id)
- `ventas` (id, restaurante_id, fecha timestamptz default now(), mesa text null, total numeric)
- `venta_detalle` (id, venta_id, plato_id, cantidad int, precio_unitario numeric)
- `compras` (id, restaurante_id, insumo_id, cantidad numeric, costo_total numeric, fecha)
- `notas_negocio` (id, restaurante_id, texto) → contexto opcional para el agente, por ejemplo "el proveedor de pollo entrega martes y viernes"

### 3.3 Triggers (la base de datos hace los cálculos)
1. **Al insertar en `venta_detalle`:** descontar de `insumos.stock` el valor `recetas.cantidad × venta_detalle.cantidad` para cada insumo del plato.
2. **Al insertar en `compras`:** sumar la cantidad al stock y actualizar `costo_unitario = costo_total / cantidad` (último precio pagado).

### 3.4 Vistas
- `margen_por_plato`: precio, costo (Σ cantidad × costo_unitario), ganancia y margen_pct por plato.
- `insumos_por_agotarse`: insumos con `stock <= punto_reorden`, con su nivel (`Crítico` si stock ≤ 50% del reorden, si no `Bajo`).
- `consumo_diario_insumo`: por insumo y día, Σ (venta_detalle.cantidad × receta.cantidad). Es la entrada del motor.
- `resumen_hoy`: platos vendidos hoy y total en S/.

### 3.5 Seguridad
- **RLS activado** en todas las tablas. Cada política filtra por el `restaurante_id` del perfil de `auth.uid()`.
- El backend usa la **service role key**, pero **siempre** filtra por el `restaurante_id` obtenido del token validado del usuario. Nunca usa un `restaurante_id` que venga del LLM ni del cuerpo de la petición.

### 3.6 Datos de ejemplo (`seed.sql`)
Un restaurante con estos datos (coinciden con el Figma):
- **Platos:** Menú del día S/ 12, Lomo saltado S/ 22, Arroz con pollo S/ 16, Ají de gallina S/ 16, Ceviche S/ 25, Chicha morada (jarra) S/ 10.
- **Insumos (entre otros):** pollo, carne de res, papa amarilla, arroz, cebolla roja, tomate, ají amarillo, aceite, pescado, limón, maíz morado.
- **Recetas realistas.** Referencia obligatoria para los tests, el **lomo saltado**: carne 200 g (S/ 35/kg), papa 250 g (S/ 3.20/kg), arroz 150 g (S/ 4.50/kg), tomate 80 g (S/ 4.00/kg), aceite 30 ml (S/ 9.00/L), cebolla 80 g (S/ 2.80/kg) → **costo S/ 9.29, ganancia S/ 12.71, margen 57.8 %**.
- Stock inicial con algunos insumos bajo el punto de reorden (pollo, papa amarilla, ají amarillo, cebolla roja), para que se vean alertas.

> Las recetas reales las dará la dueña más adelante. Deja el seed fácil de reemplazar.

---

## 4. API (FastAPI)

Todas las rutas (salvo `/api/health`) requieren `Authorization: Bearer <token de Supabase>`.

| Método y ruta | Pantalla | Qué hace |
|---|---|---|
| `GET /api/health` | — | Prueba de vida |
| `GET /api/platos` | Registrar venta | Lista los platos activos con precio y categoría |
| `POST /api/ventas` | Registrar venta | Body `{mesa?, items:[{plato_id, cantidad}]}`. Inserta la venta y su detalle; los triggers descuentan el stock |
| `GET /api/resumen` | Inicio | Platos y total de hoy, insumos por agotarse |
| `GET /api/pedido` | Pedido | Pedido sugerido calculado por el motor (ver sección 5) |
| `POST /api/pedido/aceptar` | Pedido | Marca las líneas aceptadas o editadas (se guarda para medir la tasa de aceptación) |
| `GET /api/margenes` | (extra) | Lee la vista `margen_por_plato` |
| `POST /api/chat` | Asistente | Body `{texto}` → `{respuesta, funcion_usada, datos}` |

Para la tesis: **registrar en una tabla `log_chat`** cada pregunta, la función elegida, el resultado y la respuesta, con fecha. Sirve como evidencia del piloto.

---

## 5. Motor de reabastecimiento (Python)

**Fase 1 (para empezar):** `pedido = insumos_por_agotarse` y cantidad sugerida = `punto_reorden × 2 − stock`, redondeada hacia arriba a `presentacion_compra`.

**Fase 2 (sprints 3–4):**
1. **Consumo diario** por insumo, desde la vista `consumo_diario_insumo`.
2. **Pronóstico:** suavizado exponencial (`statsmodels`). Si hay datos suficientes, Holt-Winters con estacionalidad semanal. **Baseline:** promedio móvil de 4 semanas.
3. **Evaluación:** MAPE sobre las últimas 4 semanas (holdout), motor contra baseline. Se corre con los datos sintéticos (6 meses).
4. **Punto de reorden:** `ROP = d̄ × L + SS`, con `SS = z × σ_d × √L` (z = 1.65 ≈ 95 %) y L = `lead_time_dias`.
5. **Cantidad sugerida:** `max(0, demanda_pronosticada(horizonte = días hasta la próxima compra + L) + SS − stock)`, redondeada hacia arriba a `presentacion_compra`.
6. **Costo estimado:** Σ cantidad × costo_unitario.

Todo es determinista: los mismos datos dan siempre el mismo resultado. **Tests obligatorios** con casos calculados a mano.

`scripts/generar_ventas_sinteticas.py`: genera 6 meses de ventas con más ventas en fines de semana, ruido y alguna tendencia leve. Se usa para probar el motor antes de tener datos reales.

---

## 6. Agente conversacional (Gemini)

### 6.1 Reglas
- Solo atiende temas del restaurante: ventas, platos, insumos, stock, costos, márgenes y compras.
- **No calcula:** recibe solo resultados finales ya calculados.
- `restaurante_id` lo inyecta el backend desde el token. **Nunca** lo decide el LLM.
- Responde en español, en 1 o 2 frases, con las cifras tal cual vienen y en unidades legibles (kg, L).

### 6.2 Funciones disponibles para el LLM
- `consultar_stock(insumo: str)` → stock actual, punto de reorden y unidad (con búsqueda aproximada del nombre).
- `insumos_por_agotarse()` → lista de la vista.
- `ventas_por_plato(periodo: "hoy"|"ayer"|"semana"|"mes")` → cantidades y montos por plato.
- `margen_por_plato(plato: str | None)` → de la vista.
- `pedido_sugerido()` → resultado del motor.
- `fuera_de_tema()` → no ejecuta nada.

### 6.3 Flujo de 2 pasos (enrutador)
1. **Paso 1:** se llama a Gemini con `tools=FUNCIONES`, `automatic_function_calling` desactivado y `function_calling_config.mode = "ANY"`. El modelo **debe** elegir exactamente una función.
2. Si eligió `fuera_de_tema` → se devuelve el **texto fijo** "Solo puedo ayudarte con el inventario y las ventas del restaurante." (sin usar el LLM).
3. Si no, el backend ejecuta la función (SQL o motor) con el `restaurante_id` del usuario.
4. **Paso 2:** se llama a Gemini, sin tools, con la pregunta y el JSON del resultado, para que redacte la respuesta.
5. Si cualquier paso falla → mensaje de error amable. Nunca se muestra una cifra inventada.

`instrucciones.py` contiene la `system_instruction` fija. Se puede agregar el texto de `notas_negocio` como contexto.

### 6.4 Evaluación (`scripts/evaluar_agente.py`)
Banco de **50 consultas** en JSON: 40 sobre el restaurante y 10 fuera de tema. Para cada una se guarda la función esperada y el valor esperado (obtenido con SQL directo). Mide:
- % de función correcta elegida
- % de respuestas con cifras correctas (comparadas contra SQL)
- % de preguntas fuera de tema rechazadas
- tiempo promedio de respuesta

Exporta los resultados a CSV para la tesis.

---

## 7. Frontend (React)

### 7.1 Tokens de diseño (del Figma)
```css
--primary: #118B6B;      --primary-light: #E1F4ED;
--bg: #F6F7F9;           --surface: #FFFFFF;
--text: #191D26;         --muted: #6B7380;    --border: #E3E6EB;
--danger: #CC2929;       --danger-light: #FEE8E8;
--warning: #B86605;      --warning-light: #FFF2D6;
font-family: Inter, system-ui, sans-serif;
radios: tarjetas 16px, botones 12–14px, pills 999px
```
Mobile-first, ancho de referencia 390 px. Barra de navegación inferior fija: Inicio · Vender · Asistente · Pedido.

### 7.2 Pantallas
0. **Login:** email y contraseña con Supabase Auth.
1. **Inicio:** tarjetas "Platos vendidos hoy" e "Insumos por agotarse", botón grande "Registrar venta", lista de alertas con pill Crítico/Bajo, atajo al Asistente.
2. **Registrar venta:** buscador, filtros por categoría, grilla de platos en 2 columnas con − cantidad +, barra inferior con total y "Guardar venta". Debe ser **muy rápida de usar**.
3. **Asistente:** chat con burbujas, chips de sugerencia ("¿Qué plato sale más?", "¿Cuánto pollo queda?"), caja de texto con botón enviar e indicador de "escribiendo…".
4. **Pedido sugerido:** resumen (n.º de insumos, kg y costo estimado), tarjeta por insumo (stock · reorden · uso semanal · "Comprar X kg"), botones Editar/Aceptar y "Aceptar todo el pedido".

Opcional: hacerla PWA (manifest e ícono) para que se pueda "instalar" en la pantalla de inicio.

---

## 8. Variables de entorno

| Variable | Dónde | Nota |
|---|---|---|
| `SUPABASE_URL` | frontend y backend | |
| `SUPABASE_ANON_KEY` | frontend | Solo para el login |
| `SUPABASE_SERVICE_ROLE_KEY` | **solo backend** | Nunca en el frontend ni en git |
| `GEMINI_API_KEY` | **solo backend** | Nunca en el frontend ni en git |
| `GEMINI_MODEL` | backend | Por defecto `gemini-2.5-flash` |

Incluir `.env.example` y agregar `.env` a `.gitignore`.

> Para el desarrollo se usa la API key gratuita de Google AI Studio. **Antes del piloto** se activa la facturación de Gemini (en el plan gratis Google puede usar los datos para mejorar sus productos).

---

## 9. Orden de trabajo

### Hoy (hito 1): "¿Cuánto pollo queda?" respondido con datos reales
1. Migraciones de Supabase: tablas, triggers, vistas y RLS, más `seed.sql`.
2. Tests SQL: el lomo saltado da costo 9.29 y margen 57.8 %; una venta descuenta bien los insumos.
3. FastAPI: `/api/health`, `/api/chat` con el enrutador de 2 pasos y las funciones `consultar_stock`, `insumos_por_agotarse`, `margen_por_plato` y `fuera_de_tema`. Probarlo desde `/docs`.
4. Si da el tiempo: la pantalla Asistente en React conectada a `/api/chat`.

### Sprints 1–2: registro de ventas
Login, Inicio, Registrar venta, `/api/ventas`, `/api/resumen` y `/api/platos`. Primer deploy en Vercel.

### Sprints 3–4: motor
Generador de ventas sintéticas, consumo diario, suavizado exponencial frente a promedio móvil (MAPE), punto de reorden, `/api/pedido` y la pantalla de Pedido.

### Sprints 5–6: agente completo y evaluación
Todas las funciones, `ventas_por_plato`, `pedido_sugerido`, `log_chat`, banco de 50 consultas con `evaluar_agente.py` y ajustes de redacción.

### Piloto (4 semanas)
Cargar las recetas y los costos reales del restaurante, activar la facturación de Gemini y desplegar. La dueña la usa a diario. Se registra la tasa de recomendaciones aceptadas.

---

## 10. Criterios de "terminado"
- [ ] Ningún número mostrado al usuario lo genera el LLM; todos vienen de SQL o del motor.
- [ ] Las preguntas fuera de tema reciben siempre la respuesta fija.
- [ ] Un usuario nunca ve datos de otro restaurante (probado con 2 restaurantes en el seed).
- [ ] Las claves secretas no están en el frontend ni en git.
- [ ] Hay tests para triggers, vistas y motor.
- [ ] La app se usa cómodamente en un celular de 390 px.
- [ ] El chat responde en menos de 10 s (límite de Vercel Hobby).
