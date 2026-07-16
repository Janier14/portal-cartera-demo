import type { ReactNode } from "react";

type ResponsiveTableColumn = {
  key: string;
  label: string;
  align?: "left" | "right" | "center";
  className?: string;
  minWidth?: number;
};

type ResponsiveTableProps = {
  columns: ResponsiveTableColumn[];
  data: Array<Record<string, any>>;
  renderCell?: (row: Record<string, any>, column: ResponsiveTableColumn) => ReactNode;
  renderHeader?: (column: ResponsiveTableColumn) => ReactNode;
  emptyMessage?: string;
  stickyFirstColumn?: boolean;
  className?: string;
  stickyHeader?: boolean;
};

function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function getAlignClass(align: ResponsiveTableColumn["align"]) {
  if (align === "right") return "text-right";
  if (align === "center") return "text-center";
  return "text-left";
}

export function ResponsiveTable({
  columns,
  data,
  renderCell,
  renderHeader,
  emptyMessage = "No hay datos disponibles.",
  stickyFirstColumn = true,
  className,
  stickyHeader = false
}: ResponsiveTableProps) {
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

  return (
    <div
      className={cn(
        "responsive-table-shell rounded-2xl border",
        "bg-[color:var(--module-surface)]",
        className
      )}
      style={{ borderColor: "var(--module-border)" }}
    >
      <div className="responsive-table-wrap">
        <table className="responsive-table border-separate border-spacing-0 text-[0.8rem] text-[color:var(--module-text)]">
          <thead>
            <tr className="bg-[color:var(--module-surface-2)]">
              {columns.map((column, index) => (
                <th
                  key={column.key}
                  className={cn(
                    "border-b px-4 py-3 font-mono text-[0.64rem] font-bold uppercase tracking-[0.08em]",
                    stickyHeader && "sticky top-0",
                    stickyHeader && stickyFirstColumn && index === 0 ? "z-20" : stickyHeader && "z-10",
                    getAlignClass(column.align),
                    stickyFirstColumn && index === 0 && "responsive-table-sticky-cell responsive-table-sticky-head",
                    column.className
                  )}
                  style={{
                    borderColor: "color-mix(in srgb, var(--module-border) 90%, transparent)",
                    color: "var(--module-muted)",
                    minWidth: column.minWidth
                  }}
                  scope="col"
                >
                  {renderHeader ? renderHeader(column) : column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, rowIndex) => (
              <tr
                key={row.id ?? row.key ?? rowIndex}
                className="transition-colors"
                style={{
                  background: rowIndex % 2 === 0 ? "var(--module-surface)" : "color-mix(in srgb, var(--module-surface-2) 55%, var(--module-surface))"
                }}
              >
                {columns.map((column, columnIndex) => {
                  const value = renderCell ? renderCell(row, column) : row[column.key];

                  return (
                    <td
                      key={column.key}
                      className={cn(
                        "border-b px-4 py-3.5 align-middle text-[0.82rem]",
                        getAlignClass(column.align),
                        stickyFirstColumn && columnIndex === 0 && "responsive-table-sticky-cell responsive-table-sticky-body",
                        column.className
                      )}
                      style={{
                        borderColor: "color-mix(in srgb, var(--module-border) 72%, transparent)",
                        color: "var(--module-text)",
                        minWidth: column.minWidth
                      }}
                    >
                      {value ?? "-"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export type { ResponsiveTableColumn, ResponsiveTableProps };
