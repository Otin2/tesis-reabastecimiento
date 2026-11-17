# Tesis: agente conversacional de reabastecimiento

Diseño e implementación de un agente conversacional para la recomendación de reabastecimiento en pequeñas empresas comerciales. Caso real: un restaurante pequeño en Lima.

## Empieza aquí

- **[ESTADO.md](ESTADO.md)**: qué está hecho, qué falta, decisiones y el contrato de la API. Léelo primero si vas a continuar el trabajo.
- **[PLAN.md](PLAN.md)**: el plan original (stack, base de datos, motor, agente, criterios de terminado).

## Estructura

- `frontend/`: React + Vite, app móvil. **Terminado** y funcionando en modo demo.
- `api/`: FastAPI. Hechas todas las rutas del contrato salvo el chat (101 pruebas con base falsa); **falta probarla contra Supabase con un token real**. El motor de pronóstico y el agente con Gemini están por hacer.
- `supabase/`: migraciones, seed de la cuenta demo y pruebas SQL de PostgreSQL. Esquema **aplicado y probado** en Supabase (migraciones `0001`–`0007`).

## Probar el frontend

```bash
cd frontend
npm install
npm run dev
```

Abre http://localhost:5173. Sin claves entra en modo demo: sirve cualquier correo y contraseña (por ejemplo `demo@demo.com` y `1234`).

## Probar la API

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
cp .env.example .env        # completar SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY
.venv/bin/uvicorn api.index:app --reload --port 8000   # docs en http://localhost:8000/api/docs
.venv/bin/python -m pytest -q tests
```

## Seguridad

Este repositorio es público. **Nunca subas claves** (`.env`, Supabase service role, Gemini). Ver la sección 11 de [ESTADO.md](ESTADO.md).
