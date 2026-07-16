# `scripts/`

Scripts manuales de carga de datos para el proyecto Next.js.
No forman parte del runtime de Vercel.

## `publicar.py`

### Qué hace
Lee los Excel operativos y genera los JSON que consume la app en `data/`:

1. `TABLA DE COMISIONES ARL.xlsx` -> `data/datos_arl.json`
2. `Informe comisiones seguros.xlsx` -> `data/datos_seguros.json`

Cada JSON incluye:

```json
"_meta": {
  "last_import": "2026-04-21T14:30:00"
}
```

Ese campo se usa para el badge `CORTE` en los módulos que corresponden.

### Cómo correrlo

Desde la raíz del proyecto:

```bash
python scripts/publicar.py
```

### Excel fuente por defecto

El script busca estos archivos dentro de `scripts/`:

- `scripts/TABLA DE COMISIONES ARL.xlsx`
- `scripts/Informe comisiones seguros.xlsx`

### Variables de entorno opcionales

Si quieres usar otras rutas:

```bash
EXCEL_ARL_PATH="C:\\ruta\\otro\\TABLA DE COMISIONES ARL.xlsx"
EXCEL_SEGUROS_PATH="C:\\ruta\\otro\\Informe comisiones seguros.xlsx"
python scripts/publicar.py
```

### Qué genera

- [data/datos_arl.json](../data/datos_arl.json)
- [data/datos_seguros.json](../data/datos_seguros.json)

### Hojas usadas

#### ARL
- Excel: `TABLA DE COMISIONES ARL.xlsx`
- Hoja principal: `TABLA DE COMISIONES`
- Hoja de retornos: `Retorno`
- Hoja auxiliar para NIT: `Base de Datos`

#### Seguros
- Excel: `Informe comisiones seguros.xlsx`
- Hoja: `INFORME DE VENTAS`

### Notas

- El script no genera HTML.
- El script no hace `git add`, `commit` ni `push`.
- El script no procesa cartera desde Excel.
- Si un Excel falta o falla, el script intenta procesar el otro y termina con exit code `1`.

---

## `importar_recaudos.py`

### Qué hace
ETL de facturación hacia Supabase. Lee las hojas `CMYM`, `SYSO` y `SANUM` de `FACTURACION_CMYM.xlsx`, valida la integridad completa del archivo antes de tocar Supabase, normaliza los valores admitidos y hace upsert en la tabla `recaudos` solo si no hay errores críticos.

### Cómo correrlo

Desde la raíz del proyecto:

```bash
python scripts/importar_recaudos.py --dry-run
```

Para ejecutar la carga real:

```bash
python scripts/importar_recaudos.py --execute
```

Para auditoría estricta:

```bash
python scripts/importar_recaudos.py --dry-run --strict
```

### Variables de entorno requeridas

En tu `.env` o entorno:

```bash
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

### Validaciones previas

Antes de insertar, el script valida:

- Existencia de las hojas `CMYM`, `SYSO` y `SANUM`.
- Presencia de las 10 columnas requeridas por hoja.
- Que el Excel sea legible y no esté corrupto.
- Fechas válidas en `Fecha elaboración` y `Fecha pago`.
- `Débito` numérico y mayor a `0`.
- `Nombre tercero` no vacío.
- Extracción del número de factura desde `Detalle`.
- Estados permitidos: `PAGADO`, `PAGADA`, `PENDIENTE`, `ANULADO`, `ANULADA`.
- Reglas de `Tipo` por empresa:
  - `CMYM`: `ARL`, `SEGUROS`, `SALUD`, `OTROS`, `N/A` o vacío.
  - `VIDA` en `CMYM` se normaliza a `SEGUROS`.
  - `SYSO` y `SANUM`: `OTROS`, `N/A` o vacío. Si llega otro valor, se registra `WARNING` y se normaliza a `OTROS`.

### Qué es crítico y qué es tolerante

Errores críticos, bloquean todo el import:

- Hoja faltante.
- Columna faltante.
- Excel corrupto o ilegible.

Validaciones tolerantes, la fila se inserta con fallback o normalización:

- `Fecha pago` anterior a `Fecha elaboración`: se acepta.
- `PAGADA` sin `Fecha pago`: usa `Fecha elaboración` como fallback y reporta `WARNING`.
- `PAGADA` sin `Valor pagado`: usa `Débito` como fallback y reporta `WARNING`.
- `VIDA` en `CMYM`: se normaliza a `SEGUROS` y reporta `INFO`.
- Tipo inválido: se normaliza a `N/A` en `CMYM` o a `OTROS` en `SYSO`/`SANUM` y reporta `WARNING`.
- Duplicado interno: se usa la primera ocurrencia, se saltan las demás y se reporta `WARNING`.

Validaciones duras, la fila se salta:

- `Débito` no numérico o menor o igual a `0`.
- `Fecha elaboración` inválida o vacía.
- `Nombre tercero` vacío.
- Número de factura no extraíble desde `Detalle`.

### Cómo interpretar el reporte

- `[ERROR]`: problema estructural o hallazgo bloqueante en modo `--strict`.
- `[WARNING]`: se puede continuar; la fila se normaliza o se salta según la regla aplicada.
- `[INFO]`: contexto general, por ejemplo totales por hoja y resumen final.

Cuando encuentra duplicados internos, el script imprime un bloque especial al inicio del proceso con factura, empresa y filas afectadas. Para el import usa la primera ocurrencia y salta las demás.

El resumen final separa:

- Filas leídas.
- Filas que pasarían al insert.
- Filas saltadas.
- Normalizaciones aplicadas.
- Detalle de filas saltadas.

### Modo `--strict`

`--strict` activa un modo auditoría. En ese modo:

- Los `WARNING` cuentan como hallazgos bloqueantes.
- Las filas saltadas también cuentan como hallazgos bloqueantes.
- El script sirve para revisar calidad del Excel antes de una carga real.

Ejemplo recomendado:

```bash
python scripts/importar_recaudos.py --dry-run --strict
```

Ejemplos:

```text
[WARNING] Hoja CMYM, fila 47: PAGADA sin fecha_pago, se usó fecha_elaboracion como fallback
[WARNING] Hoja SANUM, fila 12: tipo "SEGUROS" en SANUM, normalizado a "OTROS"
[INFO] Hoja CMYM, fila 265: tipo 'VIDA' normalizado a 'SEGUROS'
```

---

## Dependencias Python

Si falta algo en tu entorno:

```bash
pip install pandas openpyxl python-dotenv supabase numpy
```

---

## Resumen: cuándo correr cada script

El proyecto tiene **dos flujos de datos independientes**. Aquí el mapa completo:

---

### Flujo 1 — ARL y Seguros (JSON → Vercel)

Úsalo cuando actualizas los Excel de comisiones ARL o seguros.

```
1. Actualizar Excel:
   scripts/TABLA DE COMISIONES ARL.xlsx
   scripts/Informe comisiones seguros.xlsx

2. Correr el script:
   python scripts/publicar.py

3. Subir al repo (para que Vercel lo refleje):
   git add .
   git commit -m "chore: actualizar datos ARL y Seguros"
   git push
```

> Vercel redeploya automáticamente en ~1-2 minutos después del push.
> Los módulos **Control ARL** y **Control Seguros** se actualizan.

---

### Flujo 2 — Cartera / Facturación (Excel → Supabase → app en tiempo real)

Úsalo cuando actualizas el Excel de facturación de las tres empresas.

```
1. Actualizar Excel:
   scripts/FACTURACION_CMYM.xlsx
   (hojas: CMYM, SYSO, SANUM)

2. Opcional - revisar sin subir nada:
   python scripts/importar_recaudos.py --dry-run

3. Opcional - auditoría estricta:
   python scripts/importar_recaudos.py --dry-run --strict

4. Ejecutar la carga real a Supabase:
   python scripts/importar_recaudos.py --execute
```

> No requiere push ni redeploy.
> Los módulos **Resumen General**, **Cartera** y **Análisis Cartera** se actualizan en tiempo real.

---

### Resumen rápido

| ¿Qué cambiaste? | Script a correr | ¿Requiere push? |
|---|---|---|
| Excel ARL o Seguros | `publicar.py` | ✅ Sí, siempre |
| Excel FACTURACION_CMYM | `python .\scripts\importar_recaudos.py --execute` | ❌ No |