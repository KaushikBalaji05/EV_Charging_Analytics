export const th = "px-3 py-2 text-left text-sm font-medium text-muted whitespace-nowrap";
export const thRight = `${th} text-right`;
export const td = "px-3 py-2 text-sm align-top";
export const tdRight = `${td} text-right whitespace-nowrap`;

/** Scrolls horizontally on narrow screens instead of breaking the page layout. */
export function TableShell({ caption, minWidth = "48rem", children }: { caption: string; minWidth?: string; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full" style={{ minWidth }}>
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  );
}
