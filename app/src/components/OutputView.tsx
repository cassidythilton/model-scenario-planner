import { useState, type ReactElement } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

function tryPrettyJson(raw: string): string | null {
  const t = raw.trim();
  if (!(t.startsWith('{') || t.startsWith('['))) return null;
  try {
    return JSON.stringify(JSON.parse(t), null, 2);
  } catch {
    return null;
  }
}

function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  const pretty = lang === 'json' || !lang ? tryPrettyJson(code) : null;
  const body = pretty ?? code.replace(/\n$/, '');
  const label = lang || (pretty ? 'json' : 'text');
  const copy = () => {
    try {
      navigator.clipboard?.writeText(body);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch { /* ignore */ }
  };
  return (
    <div className="md-code">
      <div className="md-code-head">
        <span className="md-code-lang">{label}</span>
        <button className="md-code-copy" onClick={copy}>{copied ? 'copied' : 'copy'}</button>
      </div>
      <pre><code>{body}</code></pre>
    </div>
  );
}

// Turn run-on enumerations ("1) a 2) b") and inline bullets into real lines so
// markdown can render them as lists. Used for static scenario text (input/gold).
function humanizeText(raw: string): string {
  let t = raw.trim();
  if (/\n/.test(t)) return t; // already multi-line — leave as authored
  t = t.replace(/(^|\s)(\d{1,2})\)\s+/g, (_m, _pre, n) => `\n${n}. `);
  t = t.replace(/\s+[•·]\s+/g, '\n- ');
  return t.replace(/^\n+/, '').trim();
}

/** Renders LLM output (or scenario text) as formatted markdown — fenced code,
 *  JSON pretty-print, lists, tables, emphasis — instead of raw text. Set
 *  `humanize` for static scenario fields to break run-on enumerations. */
export function OutputView({ text, humanize = false }: { text: string; humanize?: boolean }) {
  // Whole-response bare JSON (no fences) → render as a pretty code block.
  const wholeJson = tryPrettyJson(text);
  if (wholeJson) return <div className="md-body"><CodeBlock code={text} lang="json" /></div>;

  const body = humanize ? humanizeText(text) : text;
  return (
    <div className="md-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre({ children }) {
            const el = children as ReactElement<{ className?: string; children?: unknown }>;
            const className = el?.props?.className || '';
            const match = /language-(\w+)/.exec(className);
            const raw = String(el?.props?.children ?? '');
            return <CodeBlock code={raw} lang={match?.[1]} />;
          },
          code({ children }) {
            return <code className="md-inline">{children}</code>;
          },
          a({ children, href }) {
            return <a href={href} target="_blank" rel="noreferrer">{children}</a>;
          },
        }}
      >
        {body}
      </ReactMarkdown>
    </div>
  );
}
