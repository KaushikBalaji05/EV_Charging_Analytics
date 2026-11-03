export const th = "px-3.5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted bg-panel-elevated/50 whitespace-nowrap border-b border-rule";
export const thRight = `${th} text-right`;
export const td = "px-3.5 py-3 text-xs align-top border-b border-rule/40 text-ink/90";
export const tdRight = `${td} text-right whitespace-nowrap`;

/** Scrolls horizontally on narrow screens instead of breaking the page layout. */
export function TableShell({
  caption,
  minWidth = "48rem",
  children,
}: {
  caption: string;
  minWidth?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-rule/60 bg-panel shadow-sm">
      <table className="w-full text-left" style={{ minWidth }}>
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  );
}
