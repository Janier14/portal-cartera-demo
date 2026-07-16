# UI Tables

## Cuándo usar `ResponsiveTable`

Úsalo para tablas operativas densas, especialmente cuando tengan `5+` columnas o necesiten conservar lectura tabular en móvil. El componente mantiene tabla HTML y en `<900px` activa scroll horizontal automáticamente con primera columna sticky opcional.

```tsx
import { ResponsiveTable } from "@/components/ui";

const columns = [
  { key: "cliente", label: "Cliente", minWidth: 220 },
  { key: "factura", label: "Factura" },
  { key: "saldo", label: "Saldo", align: "right", minWidth: 140 }
];

<ResponsiveTable
  columns={columns}
  data={rows}
  renderCell={(row, column) =>
    column.key === "saldo" ? formatCurrency(row.saldo) : row[column.key]
  }
/>;
```

## Cuándo usar `MobileCards`

Úsalo para tablas de resumen, típicamente de `4` columnas o menos, donde en móvil conviene priorizar lectura vertical por card. El componente convierte cada fila en card en `<900px` y vuelve a tabla HTML en desktop automáticamente.

```tsx
import { MobileCards } from "@/components/ui";

const columns = [
  { key: "mes", label: "Mes", highlight: true },
  { key: "ingresos", label: "Ingresos", align: "right" },
  { key: "variacion", label: "Variación", align: "right" }
];

<MobileCards
  columns={columns}
  data={rows}
  renderValue={(row, column) =>
    column.key === "ingresos" ? formatCurrency(row.ingresos) : row[column.key]
  }
/>;
```

## Nota

Ambos componentes son responsive y manejan el breakpoint `<900px` automáticamente, sin lógica adicional en el módulo consumidor.
