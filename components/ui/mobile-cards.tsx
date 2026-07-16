import type { ReactNode } from "react";

type MobileCardsColumn = {
  key: string;
  label: string;
  align?: "left" | "right" | "center";
  highlight?: boolean;
};

type MobileCardsProps = {
  columns: MobileCardsColumn[];
  data: Array<Record<string, any>>;
  renderValue?: (row: Record<string, any>, column: MobileCardsColumn) => ReactNode;
  emptyMessage?: string;
  className?: string;
  onRowClick?: (row: Record<string, any>) => void;
  getRowClassName?: (row: Record<string, any>) => string | undefined;
  stickyHeader?: boolean;
};

function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function getAlignClass(align: MobileCardsColumn["align"]) {
  if (align === "right") return "text-right";
  if (align === "center") return "text-center";
  return "text-left";
}

function renderCellValue(
  row: Record<string, any>,
  column: MobileCardsColumn,
  renderValue?: (row: Record<string, any>, column: MobileCardsColumn) => ReactNode
) {
  const value = renderValue ? renderValue(row, column) : row[column.key];
  return value ?? "-";
}

export function MobileCards({
  columns,
  data,
  renderValue,
  emptyMessage = "No hay datos disponibles.",
  className,
  onRowClick,
  getRowClassName,
  stickyHeader = false
}: MobileCardsProps) {
  if (!data.length) {
    return (
      <div
        className={cn(
          "rounded-2xl border border-dashed px-5 py-10 text-center text-sm text-[color:var(--module-muted)]",
          className
        )}
        style={{
          borderColor: "var(--module-border)",
          background: "var(--module-surface-2)"
        }}
      >
        <span className="font-mono text-[0.72rem] uppercase tracking-[0.08em]">{emptyMessage}</span>
      </div>
    );
  }

  const highlightColumn = columns.find((column) => column.highlight);
  const detailColumns = columns.filter((column) => column.key !== highlightColumn?.key);

  return (
    <div className={className}>
      <div className="grid gap-3 min-[900px]:hidden">
        {data.map((row, rowIndex) => (
          <article
            key={row.id ?? row.key ?? rowIndex}
            className={cn(
              "rounded-2xl border p-4 shadow-[0_10px_24px_rgba(15,23,42,0.06)]",
              onRowClick && "cursor-pointer transition-colors",
              getRowClassName?.(row)
            )}
            style={{
              borderColor: "color-mix(in srgb, var(--module-border) 92%, transparent)",
              background: "var(--module-surface)"
            }}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            onKeyDown={
              onRowClick
                ? (event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onRowClick(row);
                    }
                  }
                : undefined
            }
            role={onRowClick ? "button" : undefined}
            tabIndex={onRowClick ? 0 : undefined}
          >
            {highlightColumn ? (
              <header className="border-b pb-3" style={{ borderColor: "color-mix(in srgb, var(--module-border) 75%, transparent)" }}>
                <p className="font-mono text-[0.62rem] uppercase tracking-[0.08em] text-[color:var(--module-muted)]">
                  {highlightColumn.label}
                </p>
                <div className="mt-2 text-[1rem] font-semibold leading-tight text-[color:var(--module-text)]">
                  {renderCellValue(row, highlightColumn, renderValue)}
                </div>
              </header>
            ) : null}

            <div className={cn("grid gap-2.5", highlightColumn ? "pt-3" : "")}>
              {(highlightColumn ? detailColumns : columns).map((column) => (
                <div
                  key={column.key}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3"
                >
                  <p className="font-mono text-[0.62rem] uppercase tracking-[0.08em] text-[color:var(--module-muted)]">
                    {column.label}
                  </p>
                  <div
                    className={cn(
                      "min-w-0 text-[0.92rem] font-medium text-[color:var(--module-text)]",
                      getAlignClass(column.align)
                    )}
                  >
                    {renderCellValue(row, column, renderValue)}
                  </div>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>

      <div className="hidden max-[899px]:hidden min-[900px]:block">
        <div className="module-table-wrap">
          <table className="module-table min-w-full">
            <thead>
              <tr>
                {columns.map((column) => (
                  <th
                    key={column.key}
                    className={cn(stickyHeader && "sticky top-0 z-10", getAlignClass(column.align))}
                    style={stickyHeader ? { background: "var(--module-surface-2)" } : undefined}
                    scope="col"
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row, rowIndex) => (
                <tr
                  key={row.id ?? row.key ?? rowIndex}
                  className={cn(onRowClick && "cursor-pointer", getRowClassName?.(row))}
                  style={
                    rowIndex % 2 === 0
                      ? undefined
                      : { background: "color-mix(in srgb, var(--module-surface-2) 55%, var(--module-surface))" }
                  }
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={getAlignClass(column.align)}
                    >
                      {renderCellValue(row, column, renderValue)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export type { MobileCardsColumn, MobileCardsProps };
