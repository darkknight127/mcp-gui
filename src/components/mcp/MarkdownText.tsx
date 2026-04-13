"use client";

import ReactMarkdown from "react-markdown";

interface Props {
  text: string;
  className?: string;
}

export function MarkdownText({ text, className = "md-desc" }: Props) {
  if (!text.trim()) return null;
  return (
    <div className={className}>
      <ReactMarkdown>{text}</ReactMarkdown>
    </div>
  );
}
