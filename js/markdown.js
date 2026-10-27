/**
 * 受支持的 Markdown 子集渲染器（无第三方依赖）。
 * 支持：段落、#/##/### 标题、> 引用、- 无序列表、1. 有序列表、
 * GFM 管道表格、**粗体**、*斜体*、`行内代码`、--- 分隔线。
 * 所有原始 HTML 均被转义，仅输出白名单标签。
 */
import { escapeHtml, joinParagraphLines, stripMarkdown } from './utils.js';

const CODE_PLACEHOLDER = '\u0001C';

/** 行内格式渲染。 */
export function renderInline(text) {
  const codeTokens = [];
  let html = escapeHtml(text);
  html = html.replace(/`([^`]+)`/g, (match, code) => {
    codeTokens.push(code);
    return `${CODE_PLACEHOLDER}${codeTokens.length - 1}\u0001`;
  });
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, '$1<em>$2</em>');
  html = html.replace(/\u0001C(\d+)\u0001/g, (match, index) => `<code>${codeTokens[Number(index)]}</code>`);
  return html;
}

function isBlank(line) {
  return !line || !line.trim();
}

function isHr(line) {
  return /^\s{0,3}(-{3,}|\*{3,}|_{3,})\s*$/.test(line);
}

function headingMatch(line) {
  const match = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
  if (!match) return null;
  return { level: match[1].length, text: match[2] };
}

function isListItem(line) {
  return /^\s{0,3}([-*+]|\d+\.)\s+/.test(line);
}

function isBlockquote(line) {
  return /^\s{0,3}>\s?/.test(line);
}

function fenceMatch(line) {
  return /^\s{0,3}```\s*([A-Za-z0-9_+#.-]*)\s*$/.exec(line);
}

function imageMatch(line) {
  return /^\s*!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)\s*$/.exec(line);
}

function safeImageSrc(src) {
  const value = String(src || '').trim();
  if (!/^[A-Za-z0-9_./-]+$/.test(value) || value.includes('..')) return '';
  return value;
}

function isTableSeparator(line) {
  return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(line);
}

function splitTableRow(line) {
  let row = String(line || '').trim();
  if (row.startsWith('|')) row = row.slice(1);
  if (row.endsWith('|')) row = row.slice(0, -1);
  return row.split('|').map((cell) => cell.trim());
}

function tableAlignments(separatorLine) {
  return splitTableRow(separatorLine).map((cell) => {
    const value = cell.trim();
    if (/^:-+:$/.test(value)) return 'center';
    if (/-+:$/.test(value)) return 'right';
    if (/^:-+/.test(value)) return 'left';
    return '';
  });
}

function headingPlainText(text) {
  return stripMarkdown(text || '').replace(/\s+/g, ' ').trim();
}

function renderTable(headerLine, separatorLine, bodyLines) {
  const alignments = tableAlignments(separatorLine);
  const headers = splitTableRow(headerLine);
  const alignAttr = (index) => {
    const align = alignments[index];
    return align ? ` style="text-align:${align}"` : '';
  };
  let html = '<div class="table-wrap"><table>';
  html += '<thead><tr>';
  headers.forEach((cell, index) => {
    html += `<th${alignAttr(index)}>${renderInline(cell)}</th>`;
  });
  html += '</tr></thead>';
  if (bodyLines.length) {
    html += '<tbody>';
    bodyLines.forEach((line) => {
      const cells = splitTableRow(line);
      html += '<tr>';
      const columnCount = Math.max(headers.length, cells.length);
      for (let index = 0; index < columnCount; index += 1) {
        html += `<td${alignAttr(index)}>${renderInline(cells[index] || '')}</td>`;
      }
      html += '</tr>';
    });
    html += '</tbody>';
  }
  html += '</table></div>';
  return html;
}

/**
 * 渲染 Markdown。
 * @returns {{html: string, toc: Array<{level:number,text:string,anchor:string}>}}
 */
export function renderMarkdown(source) {
  const text = String(source || '').replace(/\r\n?/g, '\n').replace(/\t/g, '  ');
  const lines = text.split('\n');
  const toc = [];
  let headingIndex = 0;
  const output = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (isBlank(line)) {
      index += 1;
      continue;
    }

    if (isHr(line)) {
      output.push('<hr>');
      index += 1;
      continue;
    }

    const fence = fenceMatch(line);
    if (fence) {
      const language = fence[1] || '';
      const codeLines = [];
      index += 1;
      while (index < lines.length && !fenceMatch(lines[index])) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1; // 跳过结束围栏
      output.push(
        `<pre class="md-code"${language ? ` data-lang="${escapeHtml(language)}"` : ''}><code>${escapeHtml(
          codeLines.join('\n')
        )}</code></pre>`
      );
      continue;
    }

    const image = imageMatch(line);
    if (image) {
      const src = safeImageSrc(image[2]);
      if (src) {
        const large = /(^|\s)large(\s|$)/i.test(image[3] || '');
        output.push(
          `<figure class="md-figure${large ? ' md-figure--large' : ''}"${
            large ? '' : ' role="group"'
          }><img src="${escapeHtml(src)}" alt="${escapeHtml(image[1] || '')}" loading="lazy" decoding="async"></figure>`
        );
      } else {
        output.push(`<p>${escapeHtml(line.trim())}</p>`);
      }
      index += 1;
      continue;
    }

    const heading = headingMatch(line);
    if (heading) {
      headingIndex += 1;
      const level = Math.min(Math.max(heading.level, 2), 4);
      const anchor = `sec-${headingIndex}`;
      const plain = headingPlainText(heading.text);
      toc.push({ level, text: plain, anchor });
      output.push(`<h${level} id="${anchor}">${renderInline(heading.text)}</h${level}>`);
      index += 1;
      continue;
    }

    if (isBlockquote(line)) {
      const quoteLines = [];
      while (index < lines.length && isBlockquote(lines[index])) {
        quoteLines.push(lines[index].replace(/^\s{0,3}>\s?/, ''));
        index += 1;
      }
      const paragraphs = [];
      let current = [];
      quoteLines.forEach((quoteLine) => {
        if (isBlank(quoteLine)) {
          if (current.length) {
            paragraphs.push(joinParagraphLines(current));
            current = [];
          }
        } else {
          current.push(quoteLine);
        }
      });
      if (current.length) paragraphs.push(joinParagraphLines(current));
      const inner = paragraphs.map((p) => `<p>${renderInline(p)}</p>`).join('');
      output.push(`<blockquote>${inner}</blockquote>`);
      continue;
    }

    if (isListItem(line)) {
      const ordered = /^\s{0,3}\d+\.\s+/.test(line);
      const items = [];
      while (index < lines.length && isListItem(lines[index])) {
        const itemIsOrdered = /^\s{0,3}\d+\.\s+/.test(lines[index]);
        if (itemIsOrdered !== ordered) break;
        const itemText = lines[index].replace(/^\s{0,3}([-*+]|\d+\.)\s+/, '');
        items.push(itemText);
        index += 1;
      }
      const tag = ordered ? 'ol' : 'ul';
      const itemHtml = items.map((item) => `<li>${renderInline(item)}</li>`).join('');
      output.push(`<${tag}>${itemHtml}</${tag}>`);
      continue;
    }

    const nextLine = lines[index + 1];
    if (line.includes('|') && nextLine !== undefined && isTableSeparator(nextLine)) {
      const headerLine = line;
      const separatorLine = nextLine;
      index += 2;
      const bodyLines = [];
      while (index < lines.length && !isBlank(lines[index]) && lines[index].includes('|')) {
        bodyLines.push(lines[index]);
        index += 1;
      }
      output.push(renderTable(headerLine, separatorLine, bodyLines));
      continue;
    }

    // 普通段落：收集到空行或下一个块级元素开始。
    const paragraphLines = [];
    while (index < lines.length && !isBlank(lines[index])) {
      const candidate = lines[index];
      if (paragraphLines.length > 0) {
        if (
          isHr(candidate) ||
          headingMatch(candidate) ||
          isBlockquote(candidate) ||
          isListItem(candidate) ||
          fenceMatch(candidate) ||
          imageMatch(candidate)
        ) {
          break;
        }
      }
      paragraphLines.push(candidate);
      index += 1;
    }
    if (paragraphLines.length) {
      output.push(`<p>${renderInline(joinParagraphLines(paragraphLines))}</p>`);
    } else {
      index += 1;
    }
  }

  return { html: output.join('\n'), toc };
}
