"use client";

/** Lightweight JSON syntax highlighting (no external highlighter). */
export function JsonHighlighted({ source }: { source: string }) {
  const tokens = tokenizeJson(source);
  return (
    <code className="json-highlight">
      {tokens.map((t, i) => (
        <span key={i} className={`jh-${t.k}`}>
          {t.v}
        </span>
      ))}
    </code>
  );
}

type Tok = { k: string; v: string };

function tokenizeJson(s: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  const push = (k: string, v: string) => {
    if (v) out.push({ k, v });
  };

  while (i < s.length) {
    const c = s[i];
    if (c === " " || c === "\n" || c === "\r" || c === "\t") {
      let j = i;
      while (j < s.length && /[\s\n\r\t]/.test(s[j])) j++;
      push("ws", s.slice(i, j));
      i = j;
      continue;
    }
    if ("{}[],:".includes(c)) {
      push("punct", c);
      i++;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      let esc = false;
      while (j < s.length) {
        if (esc) {
          esc = false;
          j++;
          continue;
        }
        if (s[j] === "\\") {
          esc = true;
          j++;
          continue;
        }
        if (s[j] === '"') {
          j++;
          break;
        }
        j++;
      }
      push("str", s.slice(i, j));
      i = j;
      continue;
    }
    if (/[-\d]/.test(c)) {
      let j = i;
      while (j < s.length && /[-+eE.\d]/.test(s[j])) j++;
      push("num", s.slice(i, j));
      i = j;
      continue;
    }
    if (s.slice(i, i + 4) === "true") {
      push("bool", "true");
      i += 4;
      continue;
    }
    if (s.slice(i, i + 5) === "false") {
      push("bool", "false");
      i += 5;
      continue;
    }
    if (s.slice(i, i + 4) === "null") {
      push("null", "null");
      i += 4;
      continue;
    }
    push("plain", c);
    i++;
  }
  return out;
}
