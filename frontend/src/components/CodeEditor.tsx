import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useLayoutEffect, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { monoFontFamily } from '../design/tokens';

const INDENT = '  ';
const MIN_LINES = 12;
const LINE_HEIGHT = 21;

export const CODE_LANGUAGE_LABELS = {
  PYTHON: 'Python',
  JAVASCRIPT: 'JavaScript',
  JAVA: 'Java',
} as const;

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  language?: string | null;
  label?: string;
  disabled?: boolean;
  minRows?: number;
}

/** A dependency-free code field: line numbers, monospace, Tab indents, Enter keeps indentation. */
export function CodeEditor({
  value,
  onChange,
  language,
  label,
  disabled = false,
  minRows = MIN_LINES,
}: CodeEditorProps) {
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const caretRef = useRef<number | null>(null);
  const lines = value.split('\n');

  useLayoutEffect(() => {
    const caret = caretRef.current;
    if (caret !== null && areaRef.current) {
      areaRef.current.setSelectionRange(caret, caret);
      caretRef.current = null;
    }
  }, [value]);

  const applyEdit = (next: string, caret: number) => {
    caretRef.current = caret;
    onChange(next);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (disabled || (event.key !== 'Tab' && event.key !== 'Enter')) {
      return;
    }
    const area = event.currentTarget;
    const start = area.selectionStart;
    const end = area.selectionEnd;

    if (event.key === 'Tab') {
      event.preventDefault();
      if (!event.shiftKey) {
        applyEdit(value.slice(0, start) + INDENT + value.slice(end), start + INDENT.length);
        return;
      }
      const lineStart = value.lastIndexOf('\n', start - 1) + 1;
      const removable = value.startsWith(INDENT, lineStart) ? INDENT.length : 0;
      if (removable > 0) {
        applyEdit(
          value.slice(0, lineStart) + value.slice(lineStart + removable),
          Math.max(lineStart, start - removable),
        );
      }
      return;
    }

    event.preventDefault();
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const indentation = value.slice(lineStart).match(/^[ \t]*/)?.[0] ?? '';
    const insertion = `\n${indentation}`;
    applyEdit(value.slice(0, start) + insertion + value.slice(end), start + insertion.length);
  };

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
        <Typography variant="caption" color="text.secondary">
          {label ?? 'Code'}
        </Typography>
        {language ? (
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
            · {CODE_LANGUAGE_LABELS[language as keyof typeof CODE_LANGUAGE_LABELS] ?? language}
          </Typography>
        ) : null}
      </Stack>
      <Box
        sx={{
          display: 'flex',
          border: 1,
          borderColor: 'divider',
          borderRadius: 1,
          overflow: 'hidden',
          bgcolor: 'background.paper',
        }}
      >
        <Box
          ref={gutterRef}
          aria-hidden
          sx={{
            py: 1.5,
            px: 1,
            minWidth: 44,
            textAlign: 'right',
            fontFamily: monoFontFamily,
            fontSize: 13,
            lineHeight: `${LINE_HEIGHT}px`,
            color: 'text.disabled',
            bgcolor: 'action.hover',
            userSelect: 'none',
            overflow: 'hidden',
          }}
        >
          {Array.from({ length: Math.max(minRows, lines.length) }, (_, index) => (
            <div key={index}>{index + 1}</div>
          ))}
        </Box>
        <Box
          component="textarea"
          ref={areaRef}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          onScroll={(event) => {
            if (gutterRef.current) {
              gutterRef.current.scrollTop = event.currentTarget.scrollTop;
            }
          }}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          wrap="off"
          aria-label={label ?? 'Code answer'}
          sx={{
            flexGrow: 1,
            minWidth: 0,
            border: 0,
            outline: 'none',
            resize: 'vertical',
            p: 1.5,
            fontFamily: monoFontFamily,
            fontSize: 13,
            lineHeight: `${LINE_HEIGHT}px`,
            tabSize: 2,
            whiteSpace: 'pre',
            overflow: 'auto',
            bgcolor: disabled ? 'action.hover' : 'background.paper',
            color: 'text.primary',
          }}
        />
      </Box>
    </Box>
  );
}

/** Read-only rendering of a submitted answer or a reference solution. */
export function CodeBlock({
  code,
  language,
  label,
  maxHeight = 360,
}: {
  code: string;
  language?: string | null;
  label?: string;
  maxHeight?: number;
}) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 0.5 }}>
        {label ?? 'Code'}
        {language
          ? ` · ${CODE_LANGUAGE_LABELS[language as keyof typeof CODE_LANGUAGE_LABELS] ?? language}`
          : ''}
      </Typography>
      <Box
        component="pre"
        sx={{
          m: 0,
          p: 1.5,
          border: 1,
          borderColor: 'divider',
          borderRadius: 1,
          bgcolor: 'action.hover',
          fontFamily: monoFontFamily,
          fontSize: 13,
          lineHeight: 1.6,
          overflow: 'auto',
          maxHeight,
          whiteSpace: 'pre',
        }}
      >
        {code}
      </Box>
    </Box>
  );
}
