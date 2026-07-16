# Estructura del Proyecto

Documento unico de referencia para la estructura funcional de `next-dashboard-cmym`.
Actualizado para el estado actual del repo Next.js.

## Resumen

El proyecto es el portal interno de CM&M montado sobre Next.js App Router.
Combina:

- JSON locales en `data/` para `Control ARL` y `Control Seguros`
- Supabase para auth, usuarios, recaudos, directorio y parte del flujo operativo
- dashboards React en `components/modules/`
- API Routes internas en `app/api/`

## Raiz

- `app/`: paginas, layouts y API Routes
- `components/`: shell, dashboards, chat, tema y UI reutilizable
- `data/`: JSON publicados para la app
- `lib/`: auth, acceso a datos, supabase y logica de negocio por modulo
- `public/`: assets publicos y PWA
- `scripts/`: carga y publicacion manual de datos
- `README.md`: vision general y puesta en marcha
- `PRONT.txt`: contexto operativo para asistentes y revisiones tecnicas
- `COMO_CORRER_LOCAL_Y_NOTAS.txt`: notas manuales locales

## app/

### Shell principal

- `app/layout.tsx`: layout global, metadata y estilos base
- `app/page.tsx`: entrada principal, redirige a `/login`
- `app/globals.css`: estilos globales del portal
- `app/manifest.ts`: manifest PWA
- `app/login/page.tsx`: acceso publico

### Zona protegida

`app/(protected)/` contiene la navegacion autenticada:

- `resumen/page.tsx`
- `arl/page.tsx`
- `seguros/page.tsx`
- `cartera/page.tsx`
- `analisis-cartera/page.tsx`
- `directorio/page.tsx`
- `usuarios/page.tsx`
- `layout.tsx`
- `error.tsx`

### API Routes

Rutas internas activas en `app/api/`:

- `auth/login`
- `auth/logout`
- `auth/me`
- `auth/verify`
- `arl/datos`
- `seguros/datos`
- `resumen/kpis`
- `resumen/alertas`
- `recaudos`
- `recaudos/proyeccion`
- `analisis-cartera/ingresos`
- `analisis-cartera/aportes-clientes`
- `analisis-cartera/comparativo`
- `planillas`
- `planillas/companias`
- `contactos`
- `contactos/[id]`
- `contactos-empresa`
- `contactos-empresa/[id]`
- `links-pago`
- `links-pago/[id]`
- `usuarios`
- `usuarios/[usuario]`
- `usuarios/[usuario]/reset-password`
- `usuarios/[usuario]/permanent`
- `chat`

## components/

### Layout y shell

- `components/layout/app-shell.tsx`: sidebar, navegacion y logout
- `components/layout/module-header.tsx`: encabezado comun por modulo
- `components/layout/module-shell.tsx`: contenedor comun de modulo
- `components/layout/topbar.tsx`: barra superior auxiliar

### Dashboards

`components/modules/` contiene los modulos principales:

- `resumen-dashboard.tsx`
- `arl-dashboard.tsx`
- `seguros-dashboard.tsx`
- `cartera-dashboard.tsx`
- `analisis-cartera-dashboard.tsx`
- `directorio-dashboard.tsx`
- `directorio-empresas-dashboard.tsx`
- `usuarios-dashboard.tsx`

### UI compartida

- `components/ui/dashboard-primitives.tsx`
- `components/ui/mobile-cards.tsx`
- `components/ui/responsive-table.tsx`
- `components/ui/toast.tsx`
- `components/ui/index.ts`

Filtros operativos estandarizados en:

- `components/ui/filters/YearFilter.tsx`
- `components/ui/filters/MonthFilter.tsx`
- `components/ui/filters/CompanyFilter.tsx`
- `components/ui/filters/shared.ts`

### Otras zonas

- `components/auth/`: login
- `components/chat/assistant-shell.tsx`: asistente contextual
- `components/theme/`: badge de corte y piezas visuales compartidas
- `components/pwa/sw-register.tsx`: registro del service worker

## lib/

### Infraestructura

- `lib/auth.ts`: JWT, cookies, sesion y roles
- `lib/env.ts`: variables de entorno
- `lib/data-files.ts`: lectura de `data/*.json`
- `lib/supabase/server.ts`
- `lib/supabase/client.ts`

### Logica por modulo

`lib/modules/` concentra agregaciones y formateos:

- `arl.ts`
- `seguros.ts`
- `cartera.ts`
- `format.ts`
- `charts.ts`

## data/

Archivos locales consumidos por la app:

- `data/datos_arl.json`
- `data/datos_seguros.json`
- `data/proyeccion_cartera.json`

Notas:

- `datos_arl.json` y `datos_seguros.json` se generan con `scripts/publicar.py`
- ambos incluyen `_meta.last_import` para el badge `CORTE`

## scripts/

Scripts manuales relevantes:

- `scripts/publicar.py`: genera `data/datos_arl.json` y `data/datos_seguros.json` desde Excel
- `scripts/importar_recaudos.py`: carga recaudos a Supabase
- `scripts/README.md`: detalle operativo de carga de datos

Fuentes esperadas por defecto:

- `scripts/TABLA DE COMISIONES ARL.xlsx`
- `scripts/Informe comisiones seguros.xlsx`
- `scripts/FACTURACION_CMYM.xlsx`

## Arquitectura funcional

- Frontend: Next.js 14 + React 18 + TypeScript
- Estilos: Tailwind CSS + `app/globals.css`
- Graficas: Chart.js + `react-chartjs-2`
- Auth: JWT en cookie con proteccion en `middleware.ts`
- Datos:
  - ARL y Seguros desde JSON en `data/`
  - Resumen, Cartera, Directorio, Usuarios y analitica sobre recaudos desde Supabase

## Rutas protegidas principales

Middleware y layout protegido cubren:

- `/resumen`
- `/arl`
- `/seguros`
- `/cartera`
- `/analisis-cartera`
- `/directorio`
- `/usuarios`

`/usuarios` mantiene restriccion adicional por rol.

## Nota de mantenimiento

Esta referencia describe la estructura funcional.
No considerar `.next`, `node_modules` o `tsconfig.tsbuildinfo` como parte de la arquitectura del producto.
