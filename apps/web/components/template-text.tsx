/** A template's text, its placeholders reading as what they are rather than as words. */
export function TemplateText({ body }: { body: string }) {
  const parts = body.split(/(\{(?:first_name|name|app)\})/g);
  return (
    <>
      {parts.map((part, i) =>
        /^\{(first_name|name|app)\}$/.test(part) ? (
          <span
            key={i}
            className="rounded-[3px] bg-surface-active px-0.5 font-mono text-[0.9em] text-secondary"
          >
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}
