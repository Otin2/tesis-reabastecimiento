# ESTADO DEL PROYECTO — traspaso completo

> Documento para quien continúe el trabajo (otra persona o otra cuenta de Claude Code).
> Léelo junto con [PLAN.md](PLAN.md): el plan dice **qué se quería construir**; este archivo dice **qué se hizo, qué cambió y qué falta**.
> Última actualización: 9 de noviembre de 2026.

---

## 1. Resumen en 30 segundos

- **Tesis:** "Diseño e implementación de un agente conversacional para la recomendación de reabastecimiento en pequeñas empresas comerciales". Caso real: el restaurante pequeño de la hermana del autor, en Lima.
- **Hecho:** el **frontend (React + Vite) está completo**, corre en **modo demo** con datos de ejemplo y no necesita backend. También hay un **borrador del esquema SQL** (Supabase) que **nunca se ejecutó**.
- **Falta:** **todo el backend** (Supabase real, FastAPI, motor de pronóstico, agente con Gemini), conectar el frontend, desplegar y hacer el piloto de 4 semanas.
- **Siguiente paso recomendado:** crear el proyecto de Supabase, ejecutar y probar `supabase/migrations/0001_esquema_inicial.sql`, y después la API.

---

## 2. Cómo continuar con otra cuenta de Claude Code

1. Clona el repo y abre la carpeta `tesis/` en Claude Code.
2. Pega este mensaje de arranque:

   > Lee `PLAN.md` y `ESTADO.md` completos antes de tocar nada. El frontend ya está hecho (modo demo). Vamos a construir el backend. Empieza por crear/validar el esquema de Supabase en `supabase/migrations/0001_esquema_inicial.sql` (está sin probar) y sigue el orden de la sección 8 de `ESTADO.md`. Respeta las reglas de la sección 3. Los commits NO deben llevar `Co-Authored-By`.

3. Nada de claves en el repositorio (ver sección 11). Cada persona usa sus propias claves en un `.env` local.

---

## 3. Reglas y decisiones que NO se deben romper

| Regla | Por qué |
|---|---|
| **La IA nunca calcula.** Todas las cifras salen de SQL o del motor en Python. El LLM solo elige qué función ejecutar y redacta el resultado. | Principio central de la tesis y evita cifras inventadas. |
| **El LLM nunca escribe directo en la base de datos.** Propone una acción, el usuario la **confirma con un botón** y recién entonces el backend la ejecuta. | Seguridad y confianza. Es una ampliación del plan original (el plan solo tenía funciones de lectura). |
| **Todo se guarda en unidad base** (`g`, `ml`, `unid`). Costos en S/ por unidad base. kg y L solo se ven en pantalla. | Evita errores de conversión. |
| **Solo el backend escribe** en la base de datos (service role). El usuario autenticado solo **lee** su restaurante (RLS). `restaurante_id` sale siempre del token validado, nunca del body ni del LLM. | Multiempresa segura. |
| **Sin entrada por voz.** El agente recibe solo texto. | El plan lo descartó y el autor lo confirmó. |
| **Sin WhatsApp bot, sin apps nativas, sin RAG, sin fine-tuning.** (Compartir un PDF por WhatsApp desde el celular sí está permitido.) | Fuera de alcance. |
| **El stock no se edita a mano:** sale de un libro de movimientos (`movimientos_inventario`) mantenido por triggers. | Auditoría y base limpia para el pronóstico. |
| **Los commits van a nombre del autor, sin `Co-Authored-By` ni mención de Claude.** | Pedido explícito del autor. |
| **Frontend en JavaScript (no TypeScript)**, textos de la interfaz en español. | Decisión tomada al empezar. |

### Decisiones de producto tomadas durante el desarrollo

- **Se eliminó la pantalla "Pedido sugerido"** del plan. Razón: la app no "manda a comprar". Se reemplazó por una **lista de compras** que se puede editar, tachar, descargar en PDF y compartir.
- **"Ganancia real" = tres números:** ventas, ganancia bruta (ventas − insumos) y ganancia neta (− servicios, sueldos, alquiler, etc.). Los gastos mensuales se **reparten por día** (en una semana cuenta 7/30 de cada uno).
- **Costo real de insumos** = lo que sale por receta + mermas + uso propio, valorizados.
- **Vida útil de insumos: versión simple.** Se calcula con la fecha de la **última compra** + `vida_util_dias`. No hay control por lotes.
- **Insumos de "uso general"** (servilletas, bolsas): no entran en recetas, no llevan stock ni alertas, solo aparecen en la lista de compras cuando se agregan. **Su regla de reposición (por venta o cada cierto tiempo) se dejó para después.**
- **La lista de compras es de insumos del catálogo**, no texto libre. Si no existe, se crea en el mismo flujo.
- **El agente se justifica** por lo que una pantalla no hace: registrar por texto, dar contexto al motor ("el sábado hay un cumpleaños"), explicar el porqué de una recomendación, preguntas libres y simulaciones.

---

## 4. Cómo correr el frontend (modo demo)

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
```

- Sin variables de entorno, la app entra en **modo demo**: el login acepta cualquier correo y contraseña (ej. `demo@demo.com` / `1234`) y todos los datos viven en memoria (`src/lib/mock.js`). Al recargar la página vuelven al inicio.
- Para conectar a Supabase: copia `frontend/.env.example` a `frontend/.env` y completa `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`. Con esas variables el login usa Supabase Auth y las llamadas van a `/api/*` (Vite las redirige a `http://localhost:8000`, ver `vite.config.js`).
- Para probar en el celular (mismo wifi): usar la URL "Network" que imprime Vite.
- Compilar: `npm run build`.
- El modo oscuro sigue el tema del sistema o se elige en Más → Ajustes.

---

## 5. Qué está hecho

### 5.1 Frontend (React + Vite, mobile-first, 390 px)

Navegación inferior: **Inicio · Vender · Asistente · Ganancias · Más**.

| Pantalla | Ruta | Qué hace |
|---|---|---|
| Login | (sin sesión) | Supabase Auth; en demo acepta cualquier dato. |
| Inicio | `/` | Platos y total de hoy (enlaza a ventas), insumos por agotarse con "alcanza X días", insumos por vencer, botón "Registrar venta", botón "Generar lista de compras". |
| Registrar venta | `/vender` | Buscador, filtros por categoría, grilla con − / +, **método de pago** (efectivo, Yape/Plin, tarjeta), **mesa o para llevar**, total y guardar. Tras guardar hay **Deshacer** durante 8 s. |
| Asistente | `/asistente` | Chat con chips de sugerencia. **Tarjetas de confirmación** (Confirmar / Cancelar) cuando el agente propone registrar una venta, compra, merma, uso propio o nota. |
| Ganancias | `/ganancias` | Selector de periodo (esta semana, pasada, antepasada, mes). Número grande de ganancia neta con **casillas por renglón y por grupo** que suman o restan en vivo ("¿Qué restas?"), barra de colores, comparación con el periodo anterior, barras por día/semana, lista por plato (ordenable por margen, más o menos vendidos) con el costo de cada insumo. |
| Lista de compras | `/lista` | Cantidades sugeridas editables (− / +), tachar lo comprado, **buscador de insumos** para agregar productos, crear insumo nuevo en el mismo flujo, **PDF** (jsPDF, carga diferida) y **Compartir** (menú del celular o WhatsApp Web). Guarda estado por día en `localStorage`. |
| Ya compré | `/lista/comprar` | Registra cantidad real y precio pagado; sube el stock y actualiza el costo (último precio). Saca lo comprado de la lista. |
| Más | `/mas` | Enlaces a las pantallas de gestión. |
| Ventas de hoy | `/ventas` | Lista de ventas, **anular** (devuelve insumos), **cierre de caja** por método de pago. |
| Menú y recetas | `/menu`, `/menu/:id` | Crear y editar platos, receta insumo por insumo con costo y margen en vivo, activar/desactivar platos del día. |
| Insumos y stock | `/insumos` | Lista con nivel y días de stock; **contar stock**, **merma**, **uso propio**; crear insumo; **importar CSV** (con plantilla descargable). |
| Gastos | `/gastos` | Gastos fijos (cada mes) y puntuales por categoría (alquiler, servicios, sueldos, otros); editar montos. Alimentan la ganancia neta. |
| Ajustes | `/ajustes` | Nombre del restaurante, tema (sistema/claro/oscuro), alertas en Inicio, borrar datos locales, cerrar sesión. |

Otros detalles: instalable como app (manifest + íconos, **sin modo sin conexión**), tokens de diseño del Figma en `src/styles/tokens.css`, fuente Inter (se registró como excepción del detector de diseño porque el plan la exige).

### 5.2 Esquema SQL (borrador, SIN EJECUTAR)

`supabase/migrations/0001_esquema_inicial.sql`. **Ningún motor de Postgres lo ha ejecutado todavía**, puede tener errores de sintaxis. Contenido:

- **Tablas:** `restaurantes`, `perfiles` (rol admin/empleado), `proveedores`, `insumos` (con `en_recetas` y `vida_util_dias`), `platos`, `recetas`, `ventas` (método de pago, tipo, estado activa/anulada), `venta_detalle`, `compras` (con `vence_el`), `movimientos_inventario` (libro de movimientos), `gastos_fijos`, `gastos`, `notas_negocio`, `acciones_pendientes`, `log_chat`, `lista_compras_eventos`.
- **Triggers:** todo movimiento actualiza el stock; una venta descuenta los insumos de su receta; una compra suma stock, actualiza `costo_unitario` y calcula `vence_el`; anular una venta crea movimientos inversos.
- **Función:** `generar_gastos_mes(restaurante, mes)` crea los gastos del mes desde las plantillas, sin duplicar.
- **Vistas** (con `security_invoker`): `margen_por_plato`, `insumos_por_agotarse`, `consumo_diario_insumo` (entrada del motor), `ventas_por_plato_dia`, `ganancia_por_dia`, `gastos_por_dia` (reparto por día), `perdidas_por_dia`, `insumos_por_vencer`, `resumen_hoy`.
- **RLS:** activado en todo; los usuarios solo pueden `select` lo de su restaurante. Sin políticas de escritura (solo escribe el backend).
- **Prueba de referencia obligatoria:** lomo saltado → costo **S/ 9.29**, ganancia **S/ 12.71**, margen **57.8 %** (carne 200 g a S/ 35/kg, papa 250 g a 3.20/kg, arroz 150 g a 4.50/kg, tomate 80 g a 4.00/kg, aceite 30 ml a 9.00/L, cebolla 80 g a 2.80/kg).

### 5.3 Verificación hecha

- `npm run build` pasa sin errores.
- La lógica de `mock.js` se probó con scripts (venta descuenta stock, anular lo devuelve, compra sube stock, CSV se importa, frases del agente se interpretan, reportes por periodo).
- Se revisó en el navegador a 375 px: Inicio, Ganancias, Asistente y el editor de platos (en modo oscuro).

---

## 6. Qué NO está verificado

- El **SQL** (nunca ejecutado).
- **Descargar PDF y Compartir** en un celular real (el menú nativo de compartir depende del dispositivo).
- Visualmente: Gastos, Insumos, Ventas de hoy, Lista de compras, Ya compré y Menú (la lista) no se vieron en pantalla; solo se probó su lógica.
- **Modo claro:** se revisó poco; la mayor parte de la revisión visual fue en modo oscuro.
- Que el login real de Supabase funcione (nunca se probó, solo el modo demo).

---

## 7. Contrato de la API que el frontend ya espera

Todas las rutas (salvo `/api/health`) llevan `Authorization: Bearer <token de Supabase>`. El backend debe responder **JSON** con estas formas (están implementadas con datos de ejemplo en `frontend/src/lib/mock.js`; úsalo como referencia de campos). Cantidades **siempre en unidad base**.

| Método y ruta | Cuerpo / parámetros | Devuelve |
|---|---|---|
| `GET /api/health` | — | `{ok: true}` |
| `GET /api/resumen` | — | `{platos, total, por_agotarse:[insumo+nivel+dias_restantes], por_vencer:[{insumo_id,nombre,unidad,stock,dias_restantes,estado}]}` |
| `GET /api/platos` | — | `[{id,nombre,categoria,precio}]` solo activos |
| `POST /api/ventas` | `{items:[{plato_id,cantidad}], metodo_pago:'efectivo'\|'yape_plin'\|'tarjeta', tipo:'mesa'\|'llevar', mesa}` | `{ok,id,total}` |
| `GET /api/ventas/hoy` | — | `[{id,fecha,tipo,mesa,metodo_pago,items:[{plato_id,nombre,cantidad,precio_unitario}],total,estado}]` |
| `POST /api/ventas/{id}/anular` | `{motivo}` | `{ok}` |
| `GET /api/menu` | — | `[{id,nombre,categoria,precio,activo,costo,ganancia,margen_pct,receta:[{insumo_id,cantidad}]}]` |
| `POST /api/menu` · `PUT /api/menu/{id}` | `{id?,nombre,categoria,precio,activo,receta:[{insumo_id,cantidad}]}` | `{ok,id}` |
| `GET /api/insumos` | — | `[{id,nombre,unidad,stock,punto_reorden,presentacion_compra,costo_unitario,en_recetas,vida_util_dias,nivel,dias_restantes}]` |
| `POST /api/insumos` | `{nombre,unidad,en_recetas,costo_unitario,presentacion_compra,stock?,punto_reorden?,vida_util_dias?}` | el insumo creado |
| `POST /api/insumos/importar` | `{insumos:[...igual que arriba]}` | `{creados,omitidos}` |
| `POST /api/insumos/{id}/ajuste` | `{insumo_id,tipo:'ajuste'\|'merma'\|'consumo_propio',cantidad,motivo?}` (`ajuste`: cantidad = stock contado; los otros: lo que sale) | `{ok,stock}` |
| `POST /api/compras` | `{lineas:[{insumo_id,cantidad,costo_total}]}` | `{ok}` |
| `GET /api/lista-compras` | — | `{fecha,costo_total,lineas:[{insumo_id,nombre,unidad,nivel,stock,dias_restantes,cantidad,presentacion_compra,costo_unitario,costo_estimado}]}` |
| `POST /api/lista-compras/eventos` | `{tipo,...detalle}` con tipo `generada\|pdf\|compartida\|marcada\|ajustada\|extra_agregada\|insumo_creado\|comprada` | `{ok}` (evidencia del piloto) |
| `GET /api/ganancias?periodo=` | `semana\|semana_pasada\|semana_antepasada\|mes` | `{platos:[{id,nombre,precio,costo,ganancia,margen_pct,vendidos,ventas_total,ganancia_total,receta:[{insumo_id,insumo,cantidad,unidad,precio_unitario,costo}]}], resumen:{etiqueta,previo,dias,barras_titulo,ventas,costo,ganancia,margen_pct,costos:[{id,grupo,nombre,monto}],barras:[{etiqueta,ganancia}],anterior:{ventas,neta}}}` |
| `GET/POST /api/gastos` · `PUT/DELETE /api/gastos/{id}` | `{nombre,categoria:'alquiler'\|'servicios'\|'sueldos'\|'otros',monto,fijo}` | `[{id,nombre,categoria,monto,fijo}]` / `{ok}` |
| `POST /api/chat` | `{texto}` | `{respuesta,funcion_usada,accion?:{id,tipo,resumen}}` |
| `POST /api/chat/acciones/{id}/confirmar` | — | `{ok,mensaje}` (aquí recién se escribe en la base) |
| `POST /api/chat/acciones/{id}/cancelar` | — | `{ok}` |

Notas:
- `costos[].grupo` ∈ `Insumos | Servicios | Sueldos | Alquiler | Otros`. El renglón "Insumos de lo vendido" y "Mermas y uso propio" salen de SQL; los demás, de `gastos_por_dia` sumada en el rango.
- Si el backend cambia un nombre de campo, hay que ajustar el frontend (los componentes leen esos nombres tal cual).
- Todo cliente debe filtrar por el `restaurante_id` del token, nunca por uno recibido.

---

## 8. Qué falta, en orden

### 8.1 Base de datos (Supabase)
- [ ] Crear el proyecto de Supabase.
- [ ] Ejecutar `0001_esquema_inicial.sql` y **corregir los errores que aparezcan**.
- [ ] Crear `seed.sql` con el restaurante de ejemplo del PLAN (6 platos, 11+ insumos, recetas, stock inicial con varios insumos bajo el punto de reorden). Fácil de reemplazar con las recetas reales.
- [ ] **Segundo restaurante** en el seed para probar que un usuario nunca ve datos de otro.
- [ ] Tests SQL: margen del lomo (9.29 / 12.71 / 57.8 %), una venta descuenta bien, anular devuelve el stock, una compra actualiza stock y costo, vencimiento.
- [ ] Crear usuario en Supabase Auth con su fila en `perfiles`.

### 8.2 API (FastAPI) — `api/`
Estructura del PLAN: `index.py`, `db.py`, `auth.py` (valida JWT y obtiene `restaurante_id`), `agente/`, `motor/`.
- [ ] Todas las rutas de la sección 7.
- [ ] Orden sugerido: `health` → `auth` → `platos`/`ventas`/`resumen` → insumos y compras → menú → gastos → ganancias → lista de compras → chat.
- [ ] Vercel: verificar en la documentación vigente cómo desplegar FastAPI junto a la SPA de Vite en un mismo proyecto (ajustar `vercel.json`). Si el chat supera los 10 s del plan Hobby, mover el backend a Render.

### 8.3 Motor de reabastecimiento (Python) — `api/motor/`
- **Fase 1 (ya reflejada en la lista de compras del demo):** cantidad = `punto_reorden × 2 − stock`, redondeada hacia arriba a `presentacion_compra`.
- **Fase 2:** consumo diario por insumo (vista `consumo_diario_insumo`) → pronóstico con suavizado exponencial (`statsmodels`, Holt-Winters con estacionalidad semanal si hay datos) frente a **promedio móvil de 4 semanas** → MAPE sobre las últimas 4 semanas → punto de reorden `ROP = d̄·L + SS` con `SS = z·σ_d·√L` (z = 1.65) → cantidad sugerida `max(0, demanda(horizonte = días hasta próxima compra + L) + SS − stock)` → costo estimado.
- "Alcanza X días" en el frontend hoy es simplemente `stock ÷ uso diario promedio`; el motor debe reemplazarlo.
- Determinista, con **tests con casos calculados a mano**.
- [ ] `scripts/generar_ventas_sinteticas.py`: 6 meses de ventas con más ventas en fines de semana, ruido y leve tendencia.

### 8.4 Agente conversacional (Gemini) — `api/agente/`
- SDK `google-genai`, modelo por `GEMINI_MODEL` (por defecto `gemini-2.5-flash`).
- **Flujo de 2 pasos:** (1) llamar a Gemini con `tools`, `automatic_function_calling` desactivado y modo `ANY` para que elija **exactamente una función**; si es `fuera_de_tema`, devolver el texto fijo "Solo puedo ayudarte con el inventario y las ventas del restaurante." sin usar el LLM; (2) el backend ejecuta la función con el `restaurante_id` del token; (3) segunda llamada sin tools para **redactar** con el JSON del resultado. Si algo falla, mensaje amable y nunca una cifra inventada.
- **Funciones de lectura:** `consultar_stock`, `insumos_por_agotarse`, `ventas_por_plato`, `margen_por_plato`, `pedido_sugerido`, `comparar_periodos`, `explicar_compra`, `simular_precio`, `fuera_de_tema`.
- **Funciones de escritura (siempre con confirmación):** registrar venta, compra, merma/uso propio y nota de negocio; agregar un producto a la lista. Guardan primero en `acciones_pendientes` y solo se ejecutan en `/confirmar`.
- `notas_negocio` (eventos, feriados, "no llega el pollo") se inyectan como contexto al motor y al agente.
- Cada interacción a `log_chat`.
- En el demo, `frontend/src/lib/mock.js` (`proponer()` y `chat()`) interpreta frases con reglas simples; sirve de especificación del comportamiento esperado, no de implementación.
- [ ] `scripts/evaluar_agente.py` con banco de **50 consultas** (40 del restaurante, 10 fuera de tema; incluir frases de registro). Mide % de función correcta, % de cifras correctas contra SQL, % de fuera de tema rechazadas y tiempo promedio. Exporta CSV.

### 8.5 Integración y despliegue
- [ ] Conectar el frontend: variables `VITE_SUPABASE_*`, probar login real y ajustar nombres de campos.
- [ ] Probar en un celular real: PDF, compartir, instalar como app, modo claro.
- [ ] Desplegar en Vercel (plan Hobby).
- [ ] `.env.example` en la raíz para el backend.

### 8.6 Piloto (4 semanas) y tesis
- [ ] **Línea base antes de empezar:** cómo decide hoy la dueña qué comprar, cuántas veces a la semana se le acaba algo, cuánto se malogra, cuánto tarda en armar la compra.
- [ ] Cargar las recetas y costos reales (importar CSV de insumos, armar platos en Menú y recetas).
- [ ] **Activar la facturación de Gemini** antes del piloto (en el plan gratis Google puede usar los datos para mejorar sus productos).
- [ ] Medir: error del pronóstico frente al baseline, banco de 50 consultas, **tasa de aceptación de recomendaciones** (la lista guarda sugerido vs. ajustado; "Ya compré" registra lo realmente comprado) y cuestionario **TAM** al final (puede ser aparte, p. ej. Google Forms).
- [ ] Consultar con el asesor: si basta un estudio de caso con una usuaria, objetivos específicos exigidos, y consentimiento por escrito para usar los datos.
- [ ] Exportar a CSV la evidencia (`log_chat`, `lista_compras_eventos`).

### 8.7 Opcional / más adelante
- Regla de reposición de insumos de uso general (descuento por plato vendido, o cada N días).
- Modo sin conexión (cola de ventas) y roles con restricciones por pantalla (mozo sin ver ganancias).
- Panel de evidencia para el autor, reportes comparativos más amplios.
- Costos históricos: hoy la ganancia usa el costo **actual** de los insumos, no el del día de la venta.
- Vida útil exacta por lotes si la dueña lo pide.

---

## 9. Mapa del frontend

```
frontend/
├── index.html                  # tema guardado antes de pintar, manifest, íconos
├── vite.config.js              # proxy /api -> localhost:8000
├── public/                     # íconos y manifest de la app instalable
└── src/
    ├── main.jsx · App.jsx      # rutas; Router > Ajustes > Auth
    ├── components/ui.jsx       # Tarjeta, Pill, BotonPrimario, Burbuja, iconos, barra inferior
    ├── components/FormInsumo.jsx   # crear insumo (lo usan Lista e Insumos)
    ├── lib/api.js              # TODAS las llamadas al backend (o al mock en demo) + formatos
    ├── lib/mock.js             # datos y lógica del modo demo (referencia del contrato)
    ├── lib/auth.jsx · supabase.js  # login (demo si no hay variables)
    ├── lib/ajustes.jsx         # tema y preferencias (localStorage)
    ├── lib/lista.js            # texto y PDF de la lista, compartir
    ├── lib/csv.js              # importar insumos desde CSV
    ├── pages/                  # una por pantalla (ver sección 5.1)
    └── styles/tokens.css · app.css   # colores del Figma, claro/oscuro
```

Convenciones: cada pantalla pide datos solo a través de `api.js`; la unidad base se convierte a kg/L solo al mostrar (`fmtCantidad`, `vistaUnidad`); el estado de la lista de compras vive en `localStorage` por día.

---

## 10. Límites conocidos

- El agente del demo es por reglas, no es Gemini.
- Las cifras de ejemplo (ventas, gastos, mermas) están inventadas salvo el lomo saltado, que coincide con el PLAN.
- Si el precio de un insumo sube, los reportes pasados cambian (costo actual, no histórico).
- La vida útil es aproximada: asume que el stock actual viene de la última compra.
- Los datos del modo demo se pierden al recargar.
- Una sola usuaria y 4 semanas dan poca estacionalidad: la tesis es un **estudio de caso**; los datos sintéticos validan el método y los reales muestran que es viable.

---

## 11. Seguridad (el repositorio es público)

- **Nunca subir** `.env`, claves de Supabase (`SERVICE_ROLE`), claves de Gemini ni tokens. `.env` ya está en `.gitignore`; usa `.env.example` sin valores.
- `SUPABASE_SERVICE_ROLE_KEY` y `GEMINI_API_KEY` son **solo del backend**. En el frontend solo va la `anon key`.
- Si una clave se sube por error, **revócala y genera otra** (borrar el commit no basta: el historial es público).
- No subir datos reales de la dueña (ventas, costos, nombres) al repo; cargarlos solo en la base de datos real.
- Cada persona que colabore crea su propio proyecto de Supabase y su propia clave de Gemini para desarrollar.

---

## 12. Trabajar en equipo

- Rama principal: `main`. Para no pisarse, cada uno trabaja en una rama y abre un Pull Request.
- Commits a nombre de cada autor, sin `Co-Authored-By` de Claude.
- Antes de subir: `npm run build` en `frontend/` debe pasar.
- Reparto natural: **uno hace base de datos + API + motor**, otro hace **agente + evaluación**. El contrato de la sección 7 permite avanzar en paralelo sin depender del otro.
