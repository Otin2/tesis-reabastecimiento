# Tesis: agente conversacional de reabastecimiento

Diseño e implementación de un agente conversacional para la recomendación de reabastecimiento en pequeñas empresas comerciales. Caso real: un restaurante pequeño en Lima.

## Empieza aquí

- **[ESTADO.md](ESTADO.md)**: qué está hecho, qué falta, decisiones y el contrato de la API. Léelo primero si vas a continuar el trabajo.
- **[PLAN.md](PLAN.md)**: el plan original (stack, base de datos, motor, agente, criterios de terminado).

## Estructura

- `frontend/`: React + Vite, app móvil. **Terminado** y funcionando en modo demo.
- `api/`: FastAPI (motor de pronóstico y agente con Gemini). **Por hacer.**
- `supabase/`: migraciones y seed de PostgreSQL. Hay un borrador del esquema **sin probar**.

## Probar el frontend

```bash
cd frontend
npm install
npm run dev
```

Abre http://localhost:5173. Sin claves entra en modo demo: sirve cualquier correo y contraseña (por ejemplo `demo@demo.com` y `1234`).

## Seguridad

Este repositorio es público. **Nunca subas claves** (`.env`, Supabase service role, Gemini). Ver la sección 11 de [ESTADO.md](ESTADO.md).
