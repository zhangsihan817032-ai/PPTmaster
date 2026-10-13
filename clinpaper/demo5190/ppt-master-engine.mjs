import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const DEFAULT_SKILL_ROOT = "/Users/dingxiangyuan/Downloads/ppt-master/skills/ppt-master";
const DEFAULT_PYTHON = "/Users/dingxiangyuan/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3";

const ROLE_LAYOUTS = {
  report_core: {
    cover: "cover", agenda: "agenda", closing: "closing", timeline: "process_timeline",
    evidence: "appendix", comparison: "two_content", cards: "three_block", content: "title_content",
  },
  presentation_core: {
    cover: "title_slide", agenda: "three_card", closing: "hero_statement", timeline: "process_timeline",
    evidence: "two_content", comparison: "comparison", cards: "three_card", content: "title_content",
  },
  presentation_core_43: {
    cover: "title_slide", agenda: "three_card", closing: "hero_statement", timeline: "process_timeline",
    evidence: "two_content", comparison: "comparison", cards: "three_card", content: "title_content",
  },
  editorial_bleed: {
    cover: "hero_full", agenda: "full_statement", closing: "closing_full", timeline: "full_statement",
    evidence: "split_bleed", comparison: "split_bleed_reverse", cards: "triptych", content: "hero_side_scrim",
  },
  "中国电信": {
    cover: "cover", agenda: "toc", closing: "ending", timeline: "content",
    evidence: "content", comparison: "content", cards: "content", content: "content",
  },
  "中汽研": {
    cover: "cover", agenda: "toc", closing: "ending", timeline: "content",
    evidence: "content", comparison: "content", cards: "content", content: "content",
  },
};

const ROLE_LAYOUT_CANDIDATES = {
  report_core: {
    cover: ["cover"], agenda: ["agenda", "three_block"], closing: ["closing", "section_divider"],
    timeline: ["process_timeline", "agenda", "title_content"],
    evidence: ["appendix", "two_content", "matrix_2x2", "title_content"],
    comparison: ["two_content", "matrix_2x2", "table_summary", "title_content"],
    data: ["kpi_row", "chart_insight", "table_summary", "three_block", "title_content"],
    cards: ["three_block", "kpi_row", "two_content", "title_content"],
    summary: ["three_block", "closing", "section_divider", "title_content"],
    content: ["title_content", "two_content", "three_block", "table_summary"],
  },
  presentation_core: {
    cover: ["title_slide"], agenda: ["three_card", "section_header", "title_content"], closing: ["hero_statement", "section_header"],
    timeline: ["process_timeline", "three_card", "title_content"],
    evidence: ["two_content", "editorial_split", "table_summary", "title_content"],
    comparison: ["comparison", "two_content", "table_summary", "title_content"],
    data: ["kpi_dashboard", "data_story", "chart_insight", "table_summary", "title_content"],
    cards: ["three_card", "kpi_dashboard", "two_content", "title_content"],
    summary: ["hero_statement", "three_card", "section_header", "title_content"],
    content: ["title_content", "two_content", "editorial_split", "three_card"],
  },
  presentation_core_43: {
    cover: ["title_slide"], agenda: ["three_card", "section_header", "title_content"], closing: ["hero_statement", "section_header"],
    timeline: ["process_timeline", "stacked_split", "title_content"],
    evidence: ["two_content", "stacked_split", "table_summary", "title_content"],
    comparison: ["comparison", "two_content", "stacked_split", "title_content"],
    data: ["kpi_grid", "chart_insight", "table_summary", "title_content"],
    cards: ["three_card", "kpi_grid", "two_content", "title_content"],
    summary: ["hero_statement", "three_card", "section_header", "title_content"],
    content: ["title_content", "two_content", "stacked_split", "three_card"],
  },
  editorial_bleed: {
    cover: ["hero_full"], agenda: ["full_statement", "triptych"], closing: ["closing_full"],
    timeline: ["full_statement", "triptych", "hero_side_scrim"],
    evidence: ["split_bleed", "split_bleed_reverse", "full_statement"],
    comparison: ["split_bleed_reverse", "split_bleed", "triptych"],
    data: ["full_statement", "triptych", "split_bleed"],
    cards: ["triptych", "split_bleed", "full_statement"],
    summary: ["full_statement", "closing_full", "triptych"],
    content: ["hero_side_scrim", "split_bleed", "full_statement"],
  },
};

const GENERIC_LAYOUT_KEYS = new Set(["title_content", "content"]);
const MEDIA_LAYOUT_PATTERN = /(picture|image|screenshot|hero_full|hero_side|split_bleed|triptych|image_grid|quote_over_image)/;

const LAYOUT_SKINS = {
  report_core: {
    "#1E293B": "#4A35A6", "#334155": "#41386B", "#475569": "#4E4967",
    "#64748B": "#7753FF", "#94A3B8": "#8D84AA", "#CBD5E1": "#D8D2F5",
    "#E2E8F0": "#EAE7F8", "#F8FAFC": "#F7F5FF",
  },
  presentation_core: {
    "#1E293B": "#302B54", "#334155": "#40395F", "#475569": "#554F6D",
    "#64748B": "#6654CF", "#94A3B8": "#9188B3", "#CBD5E1": "#D8D3ED",
    "#E2E8F0": "#ECE9F6", "#F8FAFC": "#FAF9FD",
  },
  presentation_core_43: {
    "#1E293B": "#302B54", "#334155": "#40395F", "#475569": "#554F6D",
    "#64748B": "#6654CF", "#94A3B8": "#9188B3", "#CBD5E1": "#D8D3ED",
    "#E2E8F0": "#ECE9F6", "#F8FAFC": "#FAF9FD",
  },
};

const CONTENT_TOKEN_PATTERNS = [
  /^ITEM_\d+$/, /^STEP_\d+$/, /^CARD_\d+$/, /^BLOCK_\d+$/, /^KPI_\d+$/, /^QUADRANT_\d+$/,
  /^TOC_ITEM_\d+_TITLE$/, /^CAPTION_\d+$/,
  /^(BODY_TEXT|CONTENT_AREA|LEFT_CONTENT|RIGHT_CONTENT|TOP_CONTENT|BOTTOM_CONTENT)$/,
  /^(SUBTITLE|CHAPTER_DESC|CHAPTER_SUBTITLE|ENDING_SUBTITLE|KEY_MESSAGE|SUPPORT_TEXT|QUOTE_TEXT|CONTACT_LINE)$/,
  /^(CAPTION|ANNOTATION|LEFT_CAPTION|RIGHT_CAPTION)$/,
];

const SINGLE_BLOCK_TOKEN = /^(ITEM|STEP|CARD|BLOCK|KPI|QUADRANT)_\d+$|^TOC_ITEM_\d+_TITLE$|^CAPTION_\d+$/;
const TITLE_TOKENS = ["TITLE", "PAGE_TITLE", "CHAPTER_TITLE", "CLOSING_MESSAGE", "THANK_YOU", "SECTION_NAME"];

function isContentToken(token) {
  return CONTENT_TOKEN_PATTERNS.some((pattern) => pattern.test(token));
}

function ensureDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true });
}

function xmlEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function displayUnits(value) {
  return [...String(value || "")].reduce((total, character) => total + (/^[\x00-\xff]$/.test(character) ? 0.56 : 1), 0);
}

function truncateToUnits(value, maxUnits) {
  let result = "";
  let units = 0;
  for (const character of String(value || "")) {
    const next = /^[\x00-\xff]$/.test(character) ? 0.56 : 1;
    if (units + next > maxUnits) break;
    result += character;
    units += next;
  }
  return result;
}

function wrapTextDetailed(value, maxUnits, maxLines) {
  const inputLines = String(value || "").replace(/\r/g, "").split("\n");
  const lines = [];
  let overflow = false;
  for (let inputIndex = 0; inputIndex < inputLines.length; inputIndex += 1) {
    const inputLine = inputLines[inputIndex];
    const paragraph = inputLine.trim();
    if (!paragraph) continue;
    let remaining = paragraph;
    while (displayUnits(remaining) > maxUnits) {
      let candidate = truncateToUnits(remaining, maxUnits);
      const softBreak = Math.max(candidate.lastIndexOf("。"), candidate.lastIndexOf("；"), candidate.lastIndexOf("，"), candidate.lastIndexOf(" "));
      if (softBreak >= Math.floor(candidate.length * 0.55)) candidate = candidate.slice(0, softBreak + 1).trim();
      lines.push(candidate);
      remaining = remaining.slice(candidate.length).trim();
      if (lines.length >= maxLines) {
        overflow = Boolean(remaining);
        break;
      }
    }
    if (lines.length >= maxLines) {
      if (remaining || inputIndex < inputLines.length - 1) overflow = true;
      break;
    }
    if (remaining) lines.push(remaining);
    if (lines.length >= maxLines && inputIndex < inputLines.length - 1) {
      overflow = true;
      break;
    }
  }
  if (!lines.length) return { lines: [""], overflow: false };
  if (lines.length > maxLines) lines.length = maxLines;
  const consumed = lines.join("").replace(/\s/g, "");
  const original = inputLines.join("").replace(/\s/g, "");
  if (consumed.length < original.length) overflow = true;
  return { lines, overflow };
}

function placeholderText(svg, token, value) {
  const escapedToken = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const expression = new RegExp(`(<text\\b[^>]*>)\\s*\\{\\{${escapedToken}\\}\\}\\s*(<\\/text>)`, "g");
  return svg.replace(expression, (match, opening, closing, offset) => {
    let resolvedOpening = opening;
    let fontSize = Number(opening.match(/font-size="([\d.]+)"/)?.[1] || 18);
    if (token === "CHAPTER_NUM" && fontSize > 36) {
      fontSize = 36;
      resolvedOpening = resolvedOpening.replace(/font-size="[\d.]+"/, `font-size="${fontSize}"`);
    }
    const x = opening.match(/\bx="([\d.-]+)"/)?.[1] || "0";
    const y = opening.match(/\by="([\d.-]+)"/)?.[1] || "0";
    const before = svg.slice(0, offset);
    const groupStart = before.lastIndexOf("<g");
    const groupOpening = groupStart >= 0 ? before.slice(groupStart, before.indexOf(">", groupStart) + 1) : "";
    const bounds = groupOpening.match(/data-pptx-bounds="([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+)"/);
    const width = Number(bounds?.[3] || 900);
    const height = Number(bounds?.[4] || Math.max(fontSize * 1.5, 40));
    const boundsTop = Number(bounds?.[2]);
    const baseline = Number(y);
    const fitAtCurrentSize = () => {
      const lineHeight = Math.max(fontSize * 1.28, fontSize + 5);
      const maxUnits = Math.max(4, Math.floor((width / fontSize) * 0.92));
      const availableAfterBaseline = Number.isFinite(boundsTop) && Number.isFinite(baseline)
        ? Math.max(fontSize, boundsTop + height - baseline - fontSize * 0.3)
        : height;
      const maxLines = Math.max(1, Number.isFinite(boundsTop) && Number.isFinite(baseline)
        ? Math.floor(availableAfterBaseline / lineHeight) + 1
        : Math.floor(height / lineHeight));
      return { ...wrapTextDetailed(value, maxUnits, maxLines), lineHeight };
    };
    let fitted = fitAtCurrentSize();
    while (fitted.overflow && TITLE_TOKENS.includes(token) && fontSize > 18) {
      fontSize = Math.max(18, fontSize - 2);
      resolvedOpening = resolvedOpening.replace(/font-size="[\d.]+"/, `font-size="${fontSize}"`);
      fitted = fitAtCurrentSize();
    }
    const { lines, overflow, lineHeight } = fitted;
    if (overflow) throw new Error(`内容覆盖门禁：模板槽位 ${token} 发生文本截断`);
    if (lines.length === 1) return `${resolvedOpening}${xmlEscape(lines[0])}${closing}`;
    const textOpening = resolvedOpening
      .replace(/\sdata-paragraph-line-height="[^"]*"/g, "")
      .replace(/>$/, ` data-paragraph-line-height="${lineHeight.toFixed(1)}">`);
    const tspans = lines.map((line, index) => `<tspan x="${x}"${index === 0 ? "" : ` dy="${lineHeight.toFixed(1)}"`}>${xmlEscape(line)}</tspan>`).join("");
    return `${textOpening}${tspans}${closing}`;
  });
}

function tokenMapForSlide(slide, page, index, total) {
  const contentLines = String(page?.body || slide.content || "").split("\n").map((line) => line.trim()).filter(Boolean);
  const items = Array.isArray(page?.items) && page.items.length ? page.items : contentLines.map((body, itemIndex) => ({ label: `${itemIndex + 1}`, body }));
  const columns = Array.isArray(page?.columns) ? page.columns : [];
  const timeline = Array.isArray(page?.timeline) && page.timeline.length ? page.timeline : items;
  const references = Array.isArray(page?.references) ? page.references : [];
  const combinedReferences = references.map((item) => `${item.title}${item.pmid ? `（PMID: ${item.pmid}）` : ""}`).join("\n");
  const contentPmids = [...new Set(String(slide.content || "").match(/PMID\s*[:：]?\s*(\d{5,9})/gi)?.map((item) => item.match(/\d{5,9}/)?.[0]).filter(Boolean) || [])];
  const sourceLine = references.length || contentPmids.length
    ? `文献：${references.length ? references.map((item) => item.pmid ? `PMID ${item.pmid}` : item.title).filter(Boolean).join("、") : contentPmids.map((pmid) => `PMID ${pmid}`).join("、")}`
    : "来源：已确认病例资料";
  const left = columns[0] || { heading: "病例事实", body: contentLines.slice(0, Math.ceil(contentLines.length / 2)).join("\n") };
  const right = columns[1] || { heading: "分析与边界", body: contentLines.slice(Math.ceil(contentLines.length / 2)).join("\n") };
  const itemText = (item) => [item?.label, item?.value || item?.body].filter(Boolean).join("\n");
  const currentDate = new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const map = {
    TITLE: page?.displayTitle || page?.headline || slide.title,
    PAGE_TITLE: page?.displayTitle || page?.headline || slide.title,
    CHAPTER_TITLE: page?.displayTitle || page?.headline || slide.title,
    CLOSING_MESSAGE: page?.displayTitle || page?.headline || slide.title,
    THANK_YOU: page?.displayTitle || slide.title,
    THANK_YOU_EN: "THANK YOU",
    SECTION_NAME: page?.displayTitle || slide.title,
    SUBTITLE: page?.subtitle || page?.lead || contentLines[0] || "ClinPaper 病例汇报",
    CHAPTER_DESC: page?.lead || page?.subtitle || contentLines[0] || "",
    CHAPTER_NUM: String(index + 1).padStart(2, "0"),
    DATE: currentDate,
    PAGE_NUM: String(index + 1).padStart(2, "0"),
    FOOTER_NOTE: `ClinPaper 病例汇报 · ${index + 1}/${total}`,
    CONTACT_LINE: "感谢聆听 · 欢迎讨论",
    CONTENT_AREA: combinedReferences || page?.body || slide.content || "",
    BODY_TEXT: page?.body || slide.content || "",
    KEY_MESSAGE: page?.lead || page?.keyMessage || contentLines[0] || "",
    CAPTION: page?.lead || slide.extra || "",
    ANNOTATION: page?.lead || slide.extra || "",
    SOURCE: sourceLine,
    LEFT_TITLE: left.heading || "病例事实",
    LEFT_CONTENT: left.body || "",
    RIGHT_TITLE: right.heading || "分析与边界",
    RIGHT_CONTENT: right.body || combinedReferences || "",
    Y_AXIS: page?.axisY || "证据强度",
    X_AXIS: page?.axisX || "临床相关性",
    AUTHOR: "",
    AUTHOR_EN: "",
    ATTRIBUTION: "",
    BRAND_LINE: "ClinPaper 病例汇报",
    CONTACT_INFO: "",
    CTA_TEXT: "",
  };
  for (let itemIndex = 1; itemIndex <= 5; itemIndex += 1) {
    map[`ITEM_${itemIndex}`] = itemText(items[itemIndex - 1]) || "";
  }
  for (let itemIndex = 1; itemIndex <= 4; itemIndex += 1) {
    map[`STEP_${itemIndex}`] = itemText(timeline[itemIndex - 1]) || "";
    map[`KPI_${itemIndex}`] = itemText(items[itemIndex - 1]) || "";
    map[`QUADRANT_${itemIndex}`] = itemText(items[itemIndex - 1]) || "";
  }
  for (let itemIndex = 1; itemIndex <= 3; itemIndex += 1) {
    map[`BLOCK_${itemIndex}`] = itemText(items[itemIndex - 1]) || "";
    map[`CARD_${itemIndex}`] = itemText(items[itemIndex - 1]) || "";
  }
  if (page?.tokenValues) {
    for (const token of Object.keys(map)) {
      if (isContentToken(token)) map[token] = "";
    }
    Object.assign(map, page.tokenValues);
  }
  return map;
}

function applySkin(svg, sourceId) {
  const skin = LAYOUT_SKINS[sourceId];
  if (!skin) return svg;
  return Object.entries(skin).reduce((result, [from, to]) => result.replaceAll(from, to), svg);
}

function applyRootFontDefault(svg) {
  return svg.replace(/<svg\b([^>]*)>/, (match, attributes) => {
    const normalized = attributes.replace(/\sfont-family="[^"]*"/g, "");
    return `<svg${normalized} font-family="Microsoft YaHei, PingFang SC, Arial, sans-serif">`;
  });
}

const CUSTOM_CARRIER_TYPES = new Set([
  "narrative", "comparison", "timeline", "data", "kpi", "chart", "table", "algorithm", "evidence", "statement", "image",
]);

const CARRIER_PALETTES = {
  report_core: { background: "#FFFFFF", ink: "#302B54", muted: "#6F6888", accent: "#7753FF", soft: "#F2EFFF", line: "#DCD6F3", warn: "#D45555" },
  presentation_core: { background: "#FFFFFF", ink: "#302B54", muted: "#6F6888", accent: "#6654CF", soft: "#F0EEFA", line: "#D8D3ED", warn: "#D45555" },
  presentation_core_43: { background: "#FFFFFF", ink: "#302B54", muted: "#6F6888", accent: "#6654CF", soft: "#F0EEFA", line: "#D8D3ED", warn: "#D45555" },
  editorial_bleed: { background: "#171524", ink: "#FFFFFF", muted: "#C4BED7", accent: "#A896FF", soft: "#29253C", line: "#4B4563", warn: "#FF8F8F" },
};

function carrierTypeForSlide(slide) {
  if (slide.type !== "内容页") return "none";
  const requested = String(slide.visual_spec?.type || "narrative");
  if (requested === "image" && !slideHasMedia(slide)) return "narrative";
  return requested === "none" ? "narrative" : requested;
}

function svgViewBox(svg) {
  const values = svg.match(/\bviewBox="([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)"/i)?.slice(1).map(Number);
  if (values?.length === 4 && values.every(Number.isFinite)) return { x: values[0], y: values[1], width: values[2], height: values[3] };
  const width = Number(svg.match(/\bwidth="([\d.]+)"/i)?.[1] || 1280);
  const height = Number(svg.match(/\bheight="([\d.]+)"/i)?.[1] || 720);
  return { x: 0, y: 0, width, height };
}

function carrierFrame(svg) {
  const view = svgViewBox(svg);
  return {
    view,
    x: view.x + view.width * 0.0375,
    y: view.y + view.height * 0.235,
    width: view.width * 0.925,
    height: view.height * 0.655,
    scale: view.width / 1280,
  };
}

function carrierPalette(template) {
  return CARRIER_PALETTES[template.sourceId] || CARRIER_PALETTES.report_core;
}

function insertBeforeSvgEnd(svg, content) {
  return svg.replace(/<\/svg>\s*$/i, `${content}</svg>`);
}

function compactSvgNumber(value) {
  return Number(value.toFixed(1)).toString();
}

function carrierLines(value, width, fontSize) {
  return wrapTextDetailed(value, Math.max(4, Math.floor((width / fontSize) * 0.92)), 999).lines;
}

function carrierText(lines, x, y, options = {}) {
  const fontSize = options.fontSize || 18;
  const lineHeight = options.lineHeight || fontSize * 1.42;
  const fill = options.fill || "#302B54";
  const weight = options.weight || 400;
  const anchor = options.anchor ? ` text-anchor="${options.anchor}"` : "";
  const tspans = lines.map((line, index) => `<tspan x="${x.toFixed(1)}"${index ? ` dy="${lineHeight.toFixed(1)}"` : ""}>${xmlEscape(line)}</tspan>`).join("");
  return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${fontSize.toFixed(1)}" font-weight="${weight}" fill="${fill}"${anchor}>${tspans}</text>`;
}

function fitCarrierBlocks(blocks, width, height, options = {}) {
  const maximum = options.maximum || 22;
  const minimum = options.minimum || 11;
  const gap = options.gap || 12;
  for (let fontSize = maximum; fontSize >= minimum; fontSize -= 1) {
    const lineHeight = fontSize * (options.lineHeightRatio || 1.42);
    const wrapped = blocks.map((block) => carrierLines(block.text, width, fontSize));
    const required = wrapped.reduce((total, lines) => total + lines.length * lineHeight, 0) + Math.max(0, wrapped.length - 1) * gap;
    if (required <= height) return { fontSize, lineHeight, wrapped, required };
  }
  throw new Error("内容覆盖门禁：视觉载体的安全区容量不足");
}

function renderBlockStack(blocks, frame, palette, options = {}) {
  if (!blocks.length) return "";
  const scale = frame.scale || 1;
  const fit = fitCarrierBlocks(blocks, frame.width, frame.height, options);
  let y = frame.y + fit.fontSize;
  const gap = options.gap || 12;
  return blocks.map((block, index) => {
    const lines = fit.wrapped[index];
    const bulletX = frame.x + (options.bulletIndent || 0);
    const textX = bulletX + (options.showBullets === false ? 0 : 22 * scale);
    const bullet = options.showBullets === false ? "" : `<circle cx="${(bulletX + 6 * scale).toFixed(1)}" cy="${(y - fit.fontSize * 0.34).toFixed(1)}" r="${(4 * scale).toFixed(1)}" fill="${palette.accent}"/>`;
    const text = carrierText(lines, textX, y, { fontSize: fit.fontSize, lineHeight: fit.lineHeight, fill: palette.ink, weight: index === 0 && options.emphasizeFirst ? 600 : 400 });
    y += lines.length * fit.lineHeight + gap;
    return `${bullet}${text}`;
  }).join("");
}

function renderNarrativeCarrier(blocks, frame, palette) {
  if (!blocks.length) return "";
  const lead = blocks[0];
  const detail = blocks.slice(1);
  const leadHeight = Math.min(frame.height * 0.34, Math.max(84 * frame.scale, frame.height / Math.max(2, blocks.length)));
  const leadFrame = { x: frame.x + 30 * frame.scale, y: frame.y + 10 * frame.scale, width: frame.width - 54 * frame.scale, height: leadHeight - 20 * frame.scale };
  const detailFrame = { x: frame.x + 30 * frame.scale, y: frame.y + leadHeight + 8 * frame.scale, width: frame.width - 54 * frame.scale, height: frame.height - leadHeight - 16 * frame.scale };
  const leadFit = fitCarrierBlocks([lead], leadFrame.width, leadFrame.height, { maximum: 27 * frame.scale, minimum: 13 * frame.scale, lineHeightRatio: 1.32 });
  const leadText = carrierText(leadFit.wrapped[0], leadFrame.x, leadFrame.y + leadFit.fontSize, { fontSize: leadFit.fontSize, lineHeight: leadFit.lineHeight, fill: palette.ink, weight: 600 });
  const detailText = renderBlockStack(detail, detailFrame, palette, { maximum: 20 * frame.scale, minimum: 11 * frame.scale, gap: 13 * frame.scale });
  return `<g data-clinpaper-carrier="narrative"><line data-clinpaper-lead-line="true" x1="${frame.x.toFixed(1)}" y1="${frame.y.toFixed(1)}" x2="${frame.x.toFixed(1)}" y2="${(frame.y + leadHeight).toFixed(1)}" stroke="${palette.accent}" stroke-width="${(7 * frame.scale).toFixed(1)}" stroke-linecap="round"/>${leadText}${detail.length ? `<line x1="${(frame.x + 30 * frame.scale).toFixed(1)}" y1="${(frame.y + leadHeight).toFixed(1)}" x2="${(frame.x + frame.width).toFixed(1)}" y2="${(frame.y + leadHeight).toFixed(1)}" stroke="${palette.line}" stroke-width="1.5"/>${detailText}` : ""}</g>`;
}

function renderTimelineCarrier(blocks, frame, palette) {
  if (!blocks.length) return "";
  if (blocks.length > 4) {
    const axisX = frame.x + 22 * frame.scale;
    const rowHeight = frame.height / blocks.length;
    const content = blocks.map((block, index) => {
      const cy = frame.y + rowHeight * (index + 0.5);
      const lines = carrierLines(block.text, frame.width - 82 * frame.scale, Math.max(11 * frame.scale, Math.min(17 * frame.scale, rowHeight / 3)));
      const fontSize = Math.max(11 * frame.scale, Math.min(17 * frame.scale, (rowHeight - 8 * frame.scale) / Math.max(1.5, lines.length * 1.35)));
      const fitted = carrierLines(block.text, frame.width - 82 * frame.scale, fontSize);
      return `<circle cx="${axisX.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(8 * frame.scale).toFixed(1)}" fill="${palette.background}" stroke="${palette.accent}" stroke-width="${(4 * frame.scale).toFixed(1)}"/>${carrierText(fitted, axisX + 34 * frame.scale, cy - ((fitted.length - 1) * fontSize * 1.34) / 2 + fontSize * 0.36, { fontSize, lineHeight: fontSize * 1.34, fill: palette.ink })}`;
    }).join("");
    return `<g data-clinpaper-carrier="timeline"><line data-clinpaper-axis="true" x1="${axisX.toFixed(1)}" y1="${(frame.y + rowHeight / 2).toFixed(1)}" x2="${axisX.toFixed(1)}" y2="${(frame.y + frame.height - rowHeight / 2).toFixed(1)}" stroke="${palette.line}" stroke-width="${(4 * frame.scale).toFixed(1)}"/>${content}</g>`;
  }
  const axisY = frame.y + frame.height * 0.28;
  const cellWidth = frame.width / blocks.length;
  const content = blocks.map((block, index) => {
    const cx = frame.x + cellWidth * (index + 0.5);
    const textWidth = cellWidth - 28 * frame.scale;
    const textHeight = frame.height * 0.58;
    const fit = fitCarrierBlocks([block], textWidth, textHeight, { maximum: 17 * frame.scale, minimum: 10 * frame.scale, lineHeightRatio: 1.34 });
    return `<circle cx="${cx.toFixed(1)}" cy="${axisY.toFixed(1)}" r="${(11 * frame.scale).toFixed(1)}" fill="${palette.accent}"/><text x="${cx.toFixed(1)}" y="${(axisY - 28 * frame.scale).toFixed(1)}" text-anchor="middle" font-size="${(15 * frame.scale).toFixed(1)}" font-weight="600" fill="${palette.accent}">${String(index + 1).padStart(2, "0")}</text>${carrierText(fit.wrapped[0], cx, axisY + 42 * frame.scale, { fontSize: fit.fontSize, lineHeight: fit.lineHeight, fill: palette.ink, anchor: "middle" })}`;
  }).join("");
  return `<g data-clinpaper-carrier="timeline"><line data-clinpaper-axis="true" x1="${(frame.x + cellWidth / 2).toFixed(1)}" y1="${axisY.toFixed(1)}" x2="${(frame.x + frame.width - cellWidth / 2).toFixed(1)}" y2="${axisY.toFixed(1)}" stroke="${palette.line}" stroke-width="${(5 * frame.scale).toFixed(1)}"/>${content}</g>`;
}

function renderComparisonCarrier(blocks, frame, palette, visualSpec = {}) {
  const middle = Math.ceil(blocks.length / 2);
  const groups = [blocks.slice(0, middle), blocks.slice(middle)];
  const gap = 64 * frame.scale;
  const columnWidth = (frame.width - gap) / 2;
  const headings = Array.isArray(visualSpec.columns) && visualSpec.columns.length >= 2 ? visualSpec.columns.slice(0, 2) : ["对照维度 A", "对照维度 B"];
  const bodyTop = frame.y + 54 * frame.scale;
  const bodyHeight = frame.height - 54 * frame.scale;
  const columns = groups.map((group, index) => {
    const x = frame.x + index * (columnWidth + gap);
    const heading = carrierText([headings[index]], x, frame.y + 24 * frame.scale, { fontSize: 18 * frame.scale, fill: palette.accent, weight: 600 });
    const body = renderBlockStack(group, { x, y: bodyTop, width: columnWidth, height: bodyHeight }, palette, { maximum: 18 * frame.scale, minimum: 10 * frame.scale, gap: 12 * frame.scale });
    return `${heading}${body}`;
  }).join("");
  return `<g data-clinpaper-carrier="comparison"><line data-clinpaper-divider="true" x1="${(frame.x + frame.width / 2).toFixed(1)}" y1="${frame.y.toFixed(1)}" x2="${(frame.x + frame.width / 2).toFixed(1)}" y2="${(frame.y + frame.height).toFixed(1)}" stroke="${palette.line}" stroke-width="2"/>${columns}</g>`;
}

function renderTableCarrier(blocks, frame, palette, visualSpec = {}) {
  if (!blocks.length) return "";
  const rowHeight = frame.height / (blocks.length + 1);
  const labelWidth = frame.width * 0.18;
  const headers = Array.isArray(visualSpec.columns) && visualSpec.columns.length === 2 ? visualSpec.columns : ["条目", "规划原文"];
  const header = `<rect x="${frame.x.toFixed(1)}" y="${frame.y.toFixed(1)}" width="${frame.width.toFixed(1)}" height="${rowHeight.toFixed(1)}" fill="${palette.soft}"/><line x1="${(frame.x + labelWidth).toFixed(1)}" y1="${frame.y.toFixed(1)}" x2="${(frame.x + labelWidth).toFixed(1)}" y2="${(frame.y + frame.height).toFixed(1)}" stroke="${palette.line}" stroke-width="1.5"/>${carrierText([headers[0]], frame.x + 14 * frame.scale, frame.y + rowHeight * 0.64, { fontSize: Math.min(17 * frame.scale, rowHeight * 0.38), fill: palette.ink, weight: 600 })}${carrierText([headers[1]], frame.x + labelWidth + 14 * frame.scale, frame.y + rowHeight * 0.64, { fontSize: Math.min(17 * frame.scale, rowHeight * 0.38), fill: palette.ink, weight: 600 })}`;
  const rows = blocks.map((block, index) => {
    const y = frame.y + rowHeight * (index + 1);
    const fontSize = Math.max(9 * frame.scale, Math.min(16 * frame.scale, rowHeight * 0.3));
    const lines = carrierLines(block.text, frame.width - labelWidth - 28 * frame.scale, fontSize);
    const fittedFont = Math.max(8 * frame.scale, Math.min(fontSize, (rowHeight - 10 * frame.scale) / Math.max(1.3, lines.length * 1.25)));
    const fitted = carrierLines(block.text, frame.width - labelWidth - 28 * frame.scale, fittedFont);
    const baseline = y + (rowHeight - (fitted.length - 1) * fittedFont * 1.25) / 2 + fittedFont * 0.32;
    return `<g data-clinpaper-table-row="${index + 1}"><rect x="${frame.x.toFixed(1)}" y="${y.toFixed(1)}" width="${frame.width.toFixed(1)}" height="${rowHeight.toFixed(1)}" fill="${index % 2 ? palette.soft : palette.background}" fill-opacity="${index % 2 ? "0.52" : "1"}"/><line x1="${frame.x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${(frame.x + frame.width).toFixed(1)}" y2="${y.toFixed(1)}" stroke="${palette.line}" stroke-width="1"/>${carrierText([String(index + 1).padStart(2, "0")], frame.x + 14 * frame.scale, y + rowHeight * 0.62, { fontSize: Math.min(15 * frame.scale, rowHeight * 0.34), fill: palette.accent, weight: 600 })}${carrierText(fitted, frame.x + labelWidth + 14 * frame.scale, baseline, { fontSize: fittedFont, lineHeight: fittedFont * 1.25, fill: palette.ink })}</g>`;
  }).join("");
  return `<g data-clinpaper-carrier="table" data-clinpaper-semantic-table="v1"><rect x="${frame.x.toFixed(1)}" y="${frame.y.toFixed(1)}" width="${frame.width.toFixed(1)}" height="${frame.height.toFixed(1)}" fill="none" stroke="${palette.line}" stroke-width="1.5"/>${header}${rows}</g>`;
}

function numericFact(value) {
  return String(value || "").match(/(?:\d+(?:\.\d+)?\s*(?:%|mg|g|kg|μg|ug|mL|L|mmHg|mmol\/L|ng\/L|U\/L|mg\/dL|cm|mm|h|min|次\/日|次\/d)?)/i)?.[0] || "";
}

function renderDataCarrier(blocks, frame, palette, type) {
  if (!blocks.length) return "";
  const columnWidth = frame.width / blocks.length;
  const metricHeight = Math.min(frame.height * 0.38, 154 * frame.scale);
  const content = blocks.map((block, index) => {
    const x = frame.x + columnWidth * index;
    const cx = x + columnWidth / 2;
    const metric = numericFact(block.text) || String(index + 1).padStart(2, "0");
    const textWidth = columnWidth - 30 * frame.scale;
    const fit = fitCarrierBlocks([block], textWidth, frame.height - metricHeight - 16 * frame.scale, { maximum: 15 * frame.scale, minimum: 8 * frame.scale, lineHeightRatio: 1.3 });
    const graph = type === "chart"
      ? `<line data-clinpaper-chart-axis="true" x1="${(x + 18 * frame.scale).toFixed(1)}" y1="${(frame.y + metricHeight - 18 * frame.scale).toFixed(1)}" x2="${(x + columnWidth - 18 * frame.scale).toFixed(1)}" y2="${(frame.y + metricHeight - 18 * frame.scale).toFixed(1)}" stroke="${palette.line}" stroke-width="2"/><rect data-clinpaper-metric-shape="bar" x="${(x + columnWidth * 0.32).toFixed(1)}" y="${(frame.y + metricHeight * (0.42 + (index % 3) * 0.08)).toFixed(1)}" width="${(columnWidth * 0.36).toFixed(1)}" height="${(metricHeight * (0.58 - (index % 3) * 0.08) - 18 * frame.scale).toFixed(1)}" rx="${(7 * frame.scale).toFixed(1)}" fill="${palette.accent}" fill-opacity="0.22"/>`
      : `<circle data-clinpaper-metric-shape="halo" cx="${cx.toFixed(1)}" cy="${(frame.y + metricHeight * 0.48).toFixed(1)}" r="${(54 * frame.scale).toFixed(1)}" fill="${palette.soft}"/>`;
    return `${graph}${carrierText([metric], cx, frame.y + metricHeight * 0.57, { fontSize: Math.max(20 * frame.scale, Math.min(38 * frame.scale, columnWidth / Math.max(4, displayUnits(metric)) * 0.9)), fill: palette.accent, weight: 700, anchor: "middle" })}${carrierText(fit.wrapped[0], cx, frame.y + metricHeight + fit.fontSize, { fontSize: fit.fontSize, lineHeight: fit.lineHeight, fill: palette.ink, anchor: "middle" })}`;
  }).join("");
  return `<g data-clinpaper-carrier="${type}">${content}</g>`;
}

function renderEvidenceCarrier(blocks, frame, palette) {
  const references = blocks.filter((block) => /PMID|文献|指南|共识|研究/i.test(block.text));
  const facts = blocks.filter((block) => !references.includes(block));
  const factBlocks = facts.length ? facts : blocks.slice(0, Math.ceil(blocks.length / 2));
  const referenceBlocks = references.length ? references : blocks.filter((block) => !factBlocks.includes(block));
  const leftWidth = frame.width * 0.43;
  const gap = 46 * frame.scale;
  const rightX = frame.x + leftWidth + gap;
  const rightWidth = frame.width - leftWidth - gap;
  const headingSize = 17 * frame.scale;
  const left = `${carrierText(["病例事实"], frame.x, frame.y + headingSize, { fontSize: headingSize, fill: palette.accent, weight: 600 })}${renderBlockStack(factBlocks, { x: frame.x, y: frame.y + 44 * frame.scale, width: leftWidth, height: frame.height - 44 * frame.scale }, palette, { maximum: 17 * frame.scale, minimum: 9 * frame.scale, gap: 10 * frame.scale })}`;
  const right = `${carrierText(["外部医学依据"], rightX, frame.y + headingSize, { fontSize: headingSize, fill: palette.accent, weight: 600 })}${renderBlockStack(referenceBlocks, { x: rightX, y: frame.y + 44 * frame.scale, width: rightWidth, height: frame.height - 44 * frame.scale }, palette, { maximum: 16 * frame.scale, minimum: 8 * frame.scale, gap: 10 * frame.scale })}`;
  return `<g data-clinpaper-carrier="evidence"><rect x="${frame.x.toFixed(1)}" y="${frame.y.toFixed(1)}" width="${leftWidth.toFixed(1)}" height="${frame.height.toFixed(1)}" fill="${palette.soft}" fill-opacity="0.62"/><line data-clinpaper-evidence-boundary="true" x1="${(frame.x + leftWidth + gap / 2).toFixed(1)}" y1="${frame.y.toFixed(1)}" x2="${(frame.x + leftWidth + gap / 2).toFixed(1)}" y2="${(frame.y + frame.height).toFixed(1)}" stroke="${palette.line}" stroke-width="2"/>${left}${right}</g>`;
}

function renderAlgorithmCarrier(blocks, frame, palette) {
  if (!blocks.length) return "";
  const rowHeight = frame.height / blocks.length;
  const nodeX = frame.x + 28 * frame.scale;
  const nodeWidth = frame.width - 86 * frame.scale;
  const content = blocks.map((block, index) => {
    const y = frame.y + rowHeight * index + 5 * frame.scale;
    const nodeHeight = rowHeight - 18 * frame.scale;
    const fontSize = Math.max(9 * frame.scale, Math.min(17 * frame.scale, nodeHeight * 0.25));
    const lines = carrierLines(block.text, nodeWidth - 42 * frame.scale, fontSize);
    const fittedFont = Math.max(8 * frame.scale, Math.min(fontSize, (nodeHeight - 14 * frame.scale) / Math.max(1.25, lines.length * 1.28)));
    const fitted = carrierLines(block.text, nodeWidth - 42 * frame.scale, fittedFont);
    const baseline = y + (nodeHeight - (fitted.length - 1) * fittedFont * 1.28) / 2 + fittedFont * 0.34;
    const connectorY = y + nodeHeight;
    const connector = index === blocks.length - 1 ? "" : `<line data-clinpaper-connector="true" x1="${(frame.x + frame.width / 2).toFixed(1)}" y1="${connectorY.toFixed(1)}" x2="${(frame.x + frame.width / 2).toFixed(1)}" y2="${(y + rowHeight - 2 * frame.scale).toFixed(1)}" stroke="${palette.accent}" stroke-width="${(3 * frame.scale).toFixed(1)}"/><polygon data-clinpaper-arrow="true" points="${(frame.x + frame.width / 2 - 6 * frame.scale).toFixed(1)},${(y + rowHeight - 9 * frame.scale).toFixed(1)} ${(frame.x + frame.width / 2 + 6 * frame.scale).toFixed(1)},${(y + rowHeight - 9 * frame.scale).toFixed(1)} ${(frame.x + frame.width / 2).toFixed(1)},${(y + rowHeight - 1 * frame.scale).toFixed(1)}" fill="${palette.accent}"/>`;
    return `<rect x="${nodeX.toFixed(1)}" y="${y.toFixed(1)}" width="${nodeWidth.toFixed(1)}" height="${nodeHeight.toFixed(1)}" rx="${(14 * frame.scale).toFixed(1)}" fill="${index % 2 ? palette.background : palette.soft}" stroke="${palette.line}" stroke-width="1.5"/><circle cx="${(nodeX + 22 * frame.scale).toFixed(1)}" cy="${(y + nodeHeight / 2).toFixed(1)}" r="${(12 * frame.scale).toFixed(1)}" fill="${palette.accent}"/><text x="${(nodeX + 22 * frame.scale).toFixed(1)}" y="${(y + nodeHeight / 2 + 5 * frame.scale).toFixed(1)}" text-anchor="middle" font-size="${(12 * frame.scale).toFixed(1)}" font-weight="700" fill="#FFFFFF">${index + 1}</text>${carrierText(fitted, nodeX + 46 * frame.scale, baseline, { fontSize: fittedFont, lineHeight: fittedFont * 1.28, fill: palette.ink })}${connector}`;
  }).join("");
  return `<g data-clinpaper-carrier="algorithm">${content}</g>`;
}

function renderStatementCarrier(blocks, frame, palette) {
  const statementFrame = { x: frame.x + frame.width * 0.09, y: frame.y + frame.height * 0.12, width: frame.width * 0.82, height: frame.height * 0.76 };
  const fit = fitCarrierBlocks(blocks, statementFrame.width, statementFrame.height, { maximum: 30 * frame.scale, minimum: 12 * frame.scale, gap: 18 * frame.scale, lineHeightRatio: 1.34 });
  let y = statementFrame.y + fit.fontSize;
  const text = blocks.map((block, index) => {
    const lines = fit.wrapped[index];
    const result = carrierText(lines, statementFrame.x + statementFrame.width / 2, y, { fontSize: fit.fontSize, lineHeight: fit.lineHeight, fill: index === 0 ? palette.accent : palette.ink, weight: index === 0 ? 700 : 400, anchor: "middle" });
    y += lines.length * fit.lineHeight + 18 * frame.scale;
    return result;
  }).join("");
  return `<g data-clinpaper-carrier="statement"><line x1="${(statementFrame.x + statementFrame.width * 0.22).toFixed(1)}" y1="${frame.y.toFixed(1)}" x2="${(statementFrame.x + statementFrame.width * 0.78).toFixed(1)}" y2="${frame.y.toFixed(1)}" stroke="${palette.accent}" stroke-width="${(5 * frame.scale).toFixed(1)}"/>${text}</g>`;
}

function slideImageAsset(slide) {
  const images = Array.isArray(slide?.images) ? slide.images : [];
  const item = images.find((image) => /^data:image\/(?:png|jpe?g);base64,/i.test(String(image?.dataUrl || image?.url || "")));
  if (item) return { ...item, url: item.dataUrl || item.url };
  const fallback = slide?.imageUrl || slide?.image;
  return /^data:image\/(?:png|jpe?g);base64,/i.test(String(fallback || "")) ? { url: fallback, caption: "" } : null;
}

function renderImageCarrier(slide, blocks, frame, palette) {
  const asset = slideImageAsset(slide);
  if (!asset) return renderNarrativeCarrier(blocks, frame, palette).replace('data-clinpaper-carrier="narrative"', 'data-clinpaper-carrier="image" data-clinpaper-image-fallback="narrative"');
  const hasText = blocks.length > 0;
  const gap = 38 * frame.scale;
  const imageWidth = hasText ? frame.width * 0.61 : frame.width;
  const textWidth = Math.max(0, frame.width - imageWidth - (hasText ? gap : 0));
  const caption = String(asset.caption || "").trim();
  const captionHeight = caption ? 34 * frame.scale : 0;
  const imageHeight = frame.height - captionHeight;
  const image = `<rect x="${frame.x.toFixed(1)}" y="${frame.y.toFixed(1)}" width="${imageWidth.toFixed(1)}" height="${imageHeight.toFixed(1)}" rx="${(12 * frame.scale).toFixed(1)}" fill="${palette.soft}" stroke="${palette.line}" stroke-width="1.5"/><image data-clinpaper-image="true" x="${(frame.x + 8 * frame.scale).toFixed(1)}" y="${(frame.y + 8 * frame.scale).toFixed(1)}" width="${(imageWidth - 16 * frame.scale).toFixed(1)}" height="${(imageHeight - 16 * frame.scale).toFixed(1)}" preserveAspectRatio="xMidYMid meet" href="${xmlEscape(asset.url)}"/>`;
  const captionText = caption ? carrierText(carrierLines(caption, imageWidth, 13 * frame.scale), frame.x, frame.y + frame.height - 8 * frame.scale, { fontSize: 13 * frame.scale, lineHeight: 16 * frame.scale, fill: palette.muted }) : "";
  const text = hasText ? renderBlockStack(blocks, { x: frame.x + imageWidth + gap, y: frame.y, width: textWidth, height: frame.height, scale: frame.scale }, palette, { maximum: 18 * frame.scale, minimum: 9 * frame.scale, gap: 12 * frame.scale }) : "";
  return `<g data-clinpaper-carrier="image">${image}${captionText}${text}</g>`;
}

function renderCarrier(template, svg, slide, page) {
  const type = carrierTypeForSlide(slide);
  if (type === "none") return svg;
  if (!CUSTOM_CARRIER_TYPES.has(type)) return svg.replace(/<svg\b/, `<svg data-clinpaper-carrier="${xmlEscape(type)}"`);
  const blocks = Array.isArray(page?.renderBlocks) ? page.renderBlocks.filter((block) => block.text) : [];
  const frame = carrierFrame(svg);
  const palette = carrierPalette(template);
  const mask = `<rect data-clinpaper-content-mask="true" x="${(frame.x - 4 * frame.scale).toFixed(1)}" y="${(frame.y - 10 * frame.scale).toFixed(1)}" width="${(frame.width + 8 * frame.scale).toFixed(1)}" height="${(frame.height + 20 * frame.scale).toFixed(1)}" fill="${palette.background}"/>`;
  const carrier = type === "narrative" ? renderNarrativeCarrier(blocks, frame, palette)
    : type === "timeline" ? renderTimelineCarrier(blocks, frame, palette)
      : type === "comparison" ? renderComparisonCarrier(blocks, frame, palette, slide.visual_spec)
        : type === "table" ? renderTableCarrier(blocks, frame, palette, slide.visual_spec)
          : ["data", "kpi", "chart"].includes(type) ? renderDataCarrier(blocks, frame, palette, type)
            : type === "evidence" ? renderEvidenceCarrier(blocks, frame, palette)
              : type === "algorithm" ? renderAlgorithmCarrier(blocks, frame, palette)
                : type === "image" ? renderImageCarrier(slide, blocks, frame, palette)
                  : renderStatementCarrier(blocks, frame, palette);
  const wrapperBounds = [frame.x - 4 * frame.scale, frame.y - 10 * frame.scale, frame.width + 8 * frame.scale, frame.height + 20 * frame.scale].map(compactSvgNumber).join(" ");
  const wrapper = `<g id="clinpaper-carrier-${type}" data-pptx-bounds="${wrapperBounds}" data-clinpaper-carrier="${type}">${mask}${carrier}</g>`;
  return insertBeforeSvgEnd(svg, wrapper);
}

function inferRole(slide, slideIndex = 0, slideCount = 1) {
  if (slide.type === "封面") return "cover";
  if (slide.type === "目录") return "agenda";
  if (slide.type === "封底") return "closing";
  const visualRole = {
    narrative: "content",
    cards: "cards",
    comparison: "comparison",
    timeline: "timeline",
    data: "data",
    kpi: "data",
    chart: "data",
    table: "data",
    algorithm: "timeline",
    evidence: "evidence",
    statement: "summary",
    image: "image",
  }[slide.visual_spec?.type];
  if (visualRole) return visualRole;
  const text = `${slide.title || ""}\n${slide.extra || ""}\n${slide.content || ""}`;
  if (slideIndex === 0) return "cover";
  if (/目录|提纲|汇报结构|内容概览/.test(text)) return "agenda";
  if (/感谢|欢迎讨论|Q&A|答疑/.test(text)) return "closing";
  if (/时间线|诊疗经过|病程|治疗经过|随访历程|阶段流程/.test(text)) return "timeline";
  if (/医学依据|文献|指南|证据|PMID|讨论|参考/.test(text)) return "evidence";
  if (/对比|比较|鉴别| versus |\bvs\.?\b|基线.*(?:治疗后|随访)|治疗前.*治疗后/.test(text)) return "comparison";
  if (/检查|检验|量表|评分|指标|疗效|安全性|结局|转归|PET|CT|MRI|影像/.test(text)
    && /\d|%|mg|mmHg|mmol|ng\/L|U\/L|评分|阳性|阴性/.test(text)) return "data";
  if (/要点|总结|小结|概况|核心问题|治疗方案/.test(text) || slideIndex === slideCount - 1) return "summary";
  if (/病例概述|患者概况|诊断要点/.test(text)) return "cards";
  return "content";
}

function templateFiles(template) {
  const files = fs.readdirSync(template.templateDir).filter((name) => name.endsWith(".svg")).sort();
  return files.map((name) => ({
    name,
    key: name.replace(/^\d+_/, "").replace(/\.svg$/i, ""),
    path: path.join(template.templateDir, name),
  }));
}

function templateHasBundledMedia(template, files) {
  if (template.imagesDir && fs.existsSync(template.imagesDir)
    && fs.readdirSync(template.imagesDir).some((name) => !name.startsWith("."))) return true;
  return files.some((file) => /<image\b[^>]*href="data:image\//i.test(fs.readFileSync(file.path, "utf8")));
}

function chooseLayout(template, files, slide, page) {
  const role = page?.intent || inferRole(slide);
  const requested = String(page?.layoutKey || "").trim();
  const requestedFile = files.find((item) => item.key === requested);
  if (requestedFile) return requestedFile;
  const preferred = ROLE_LAYOUTS[template.sourceId]?.[role] || ROLE_LAYOUTS[template.sourceId]?.content;
  return files.find((item) => item.key === preferred)
    || files.find((item) => item.key.includes(role))
    || files[0];
}

function sourceBlocksForSlide(slide, slideIndex) {
  return String(slide.content || "").replace(/\r/g, "").split("\n")
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text, blockIndex) => ({ id: `s${slideIndex}-b${blockIndex}`, text }));
}

function normalizeCoverage(value) {
  return String(value || "").replace(/\s+/g, "").trim();
}

function decodeXmlText(value) {
  return String(value || "")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function visibleSvgText(svg) {
  return [...String(svg || "").matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/gi)]
    .map((match) => decodeXmlText(match[1].replace(/<\/tspan>/gi, "\n").replace(/<[^>]+>/g, "")))
    .join("\n");
}

function extractFactLocks(value) {
  const text = String(value || "");
  const patterns = [
    /\bPMID\s*[:：]?\s*\d{5,9}\b/gi,
    /\b\d{4}[-/.]\d{1,2}(?:[-/.]\d{1,2})?\b/g,
    /\d{4}年\d{1,2}月(?:\d{1,2}日)?/g,
    /\b\d+(?:\.\d+)?\s*(?:%|mg|g|kg|μg|ug|mL|L|mmHg|mmol\/L|ng\/L|U\/L|mg\/dL|cm|mm|h|min|次\/日|次\/d)\b/gi,
  ];
  return [...new Set(patterns.flatMap((pattern) => [...text.matchAll(pattern)].map((match) => match[0])))];
}

function tokenCategory(token) {
  if (/^STEP_/.test(token)) return "timeline";
  if (/^(ITEM|CARD|BLOCK|KPI|QUADRANT)_/.test(token) || /^TOC_ITEM_/.test(token)) return "item";
  if (/^(LEFT_CONTENT|TOP_CONTENT)$/.test(token)) return "left";
  if (/^(RIGHT_CONTENT|BOTTOM_CONTENT)$/.test(token)) return "right";
  if (/^(SUBTITLE|CHAPTER_DESC|CHAPTER_SUBTITLE|ENDING_SUBTITLE|CONTACT_LINE)$/.test(token)) return "subtitle";
  if (/^(KEY_MESSAGE|SUPPORT_TEXT|QUOTE_TEXT|CAPTION|ANNOTATION|LEFT_CAPTION|RIGHT_CAPTION|CAPTION_\d+)$/.test(token)) return "lead";
  return "body";
}

function tokenSpec(svg, token, order) {
  const escapedToken = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const expression = new RegExp(`(<text\\b[^>]*>)\\s*\\{\\{${escapedToken}\\}\\}\\s*(<\\/text>)`);
  const match = expression.exec(svg);
  if (!match) return null;
  const opening = match[1];
  const fontSize = Number(opening.match(/font-size="([\d.]+)"/)?.[1] || 18);
  const baseline = Number(opening.match(/\by="([\d.-]+)"/)?.[1]);
  const before = svg.slice(0, match.index);
  const groupStart = before.lastIndexOf("<g");
  const groupOpening = groupStart >= 0 ? before.slice(groupStart, before.indexOf(">", groupStart) + 1) : "";
  const bounds = groupOpening.match(/data-pptx-bounds="([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+)"/);
  const width = Number(bounds?.[3] || 900);
  const height = Number(bounds?.[4] || Math.max(fontSize * 1.5, 40));
  const lineHeight = Math.max(fontSize * 1.28, fontSize + 5);
  const boundsTop = Number(bounds?.[2]);
  const availableAfterBaseline = Number.isFinite(boundsTop) && Number.isFinite(baseline)
    ? Math.max(fontSize, boundsTop + height - baseline - fontSize * 0.3)
    : height;
  return {
    token,
    order,
    category: tokenCategory(token),
    singleBlock: SINGLE_BLOCK_TOKEN.test(token),
    maxUnits: Math.max(4, Math.floor((width / fontSize) * 0.92)),
    maxLines: Math.max(1, Number.isFinite(boundsTop) && Number.isFinite(baseline)
      ? Math.floor(availableAfterBaseline / lineHeight) + 1
      : Math.floor(height / lineHeight)),
  };
}

function contentTokenSpecs(svg) {
  const tokens = [...new Set([...svg.matchAll(/\{\{([A-Z0-9_]+)\}\}/g)].map((match) => match[1]))];
  return tokens.filter(isContentToken).map((token, order) => tokenSpec(svg, token, order)).filter(Boolean);
}

function preferredCategories(slot) {
  const preferences = {
    subtitle: ["subtitle", "lead", "body", "item"],
    lead: ["lead", "subtitle", "body", "item"],
    body: ["body", "left", "right", "item", "timeline", "lead", "subtitle"],
    item: ["item", "body", "left", "right", "timeline", "lead"],
    timeline: ["timeline", "item", "body", "left", "right", "lead"],
    left: ["left", "body", "item", "lead", "right"],
    right: ["right", "body", "item", "lead", "left"],
    reference: ["right", "body", "item", "left", "lead"],
  };
  return preferences[slot] || preferences.body;
}

function textFits(value, spec) {
  return !wrapTextDetailed(value, spec.maxUnits, spec.maxLines).overflow;
}

function stateText(state, addition = "") {
  return [...state.entries.map((entry) => entry.text), addition].filter(Boolean).join("\n");
}

function fittingPrefix(value, state) {
  const text = String(value || "").trim();
  if (!text) return { prefix: "", rest: "" };
  let low = 1;
  let high = text.length;
  let best = 0;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (textFits(stateText(state, text.slice(0, middle)), state)) {
      best = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  if (!best) return { prefix: "", rest: text };
  if (best < text.length) {
    const candidate = text.slice(0, best);
    const boundary = Math.max(candidate.lastIndexOf("。"), candidate.lastIndexOf("；"), candidate.lastIndexOf("，"), candidate.lastIndexOf(" "));
    if (boundary >= Math.floor(best * 0.55)) best = boundary + 1;
  }
  return { prefix: text.slice(0, best).trim(), rest: text.slice(best).trim() };
}

function packBlocks(svg, blocks, placementMap) {
  const states = contentTokenSpecs(svg).map((spec) => ({ ...spec, entries: [] }));
  const consumed = new Map();
  const remainingBlocks = [];
  let consumedCharacters = 0;
  const addFragment = (state, blockId, text) => {
    state.entries.push({ blockId, text });
    if (!consumed.has(blockId)) consumed.set(blockId, []);
    consumed.get(blockId).push(text);
    consumedCharacters += normalizeCoverage(text).length;
  };
  for (const block of blocks) {
    let remaining = block.text;
    const preferences = preferredCategories(placementMap.get(block.id) || "body");
    while (remaining) {
      const candidates = states
        .filter((state) => !state.singleBlock || state.entries.length === 0)
        .sort((left, right) => {
          const leftScore = preferences.indexOf(left.category);
          const rightScore = preferences.indexOf(right.category);
          return (leftScore < 0 ? 99 : leftScore) - (rightScore < 0 ? 99 : rightScore) || left.order - right.order;
        });
      const fullTarget = candidates.find((state) => textFits(stateText(state, remaining), state));
      if (fullTarget) {
        addFragment(fullTarget, block.id, remaining);
        remaining = "";
        continue;
      }
      const fitsFreshSlot = states.some((state) => textFits(remaining, { ...state, entries: [] }));
      const pageHasContent = states.some((state) => state.entries.length > 0);
      if (fitsFreshSlot && pageHasContent) {
        remainingBlocks.push({ ...block, text: remaining });
        break;
      }
      let best = null;
      for (const state of candidates) {
        const part = fittingPrefix(remaining, state);
        if (!part.prefix) continue;
        if (!best || normalizeCoverage(part.prefix).length > normalizeCoverage(best.part.prefix).length) best = { state, part };
      }
      if (!best) {
        remainingBlocks.push({ ...block, text: remaining });
        break;
      }
      addFragment(best.state, block.id, best.part.prefix);
      remaining = best.part.rest;
    }
  }
  return {
    tokenValues: Object.fromEntries(states.map((state) => [state.token, state.entries.map((entry) => entry.text).join("\n")])),
    consumed,
    consumedCharacters,
    remainingBlocks,
    capacity: states.reduce((total, state) => total + state.maxUnits * state.maxLines, 0),
  };
}

function themedSvg(template, file) {
  return applyRootFontDefault(applySkin(fs.readFileSync(file.path, "utf8"), template.sourceId));
}

function layoutCapacity(template, file) {
  return contentTokenSpecs(themedSvg(template, file)).reduce((total, spec) => total + spec.maxUnits * spec.maxLines, 0);
}

function layoutFitsTitle(template, file, title) {
  const svg = themedSvg(template, file);
  const specs = TITLE_TOKENS.map((token, index) => tokenSpec(svg, token, index)).filter(Boolean);
  return specs.length > 0 && specs.every((spec) => textFits(title, spec));
}

function slideHasMedia(slide) {
  return Boolean(slide?.imageUrl || slide?.image || (Array.isArray(slide?.images) && slide.images.length));
}

function roleLayoutCandidates(template, files, role, slide) {
  const configured = ROLE_LAYOUT_CANDIDATES[template.sourceId]?.[role]
    || ROLE_LAYOUT_CANDIDATES[template.sourceId]?.content
    || [ROLE_LAYOUTS[template.sourceId]?.[role], ROLE_LAYOUTS[template.sourceId]?.content].filter(Boolean);
  const ordered = configured.map((key) => files.find((file) => file.key === key)).filter(Boolean);
  const remaining = files.filter((file) => !ordered.some((item) => item.key === file.key));
  const hasBundledMedia = templateHasBundledMedia(template, files);
  return [...ordered, ...remaining].filter((file) => {
    if (!slideHasMedia(slide) && !hasBundledMedia && MEDIA_LAYOUT_PATTERN.test(file.key)) return false;
    if (sourceBlocksForSlide(slide, 0).length && !contentTokenSpecs(themedSvg(template, file)).length) return false;
    return true;
  });
}

function placementsForRole(placements, role) {
  const current = Array.isArray(placements) ? placements : [];
  if (!current.length || current.some((placement) => placement.slot && placement.slot !== "body")) return current;
  return current.map((placement, index) => ({
    ...placement,
    slot: role === "timeline" ? "timeline"
      : role === "evidence" ? (index === 0 ? "lead" : "reference")
        : role === "comparison" ? (index % 2 ? "right" : "left")
          : ["agenda", "data", "cards", "summary"].includes(role) ? "item"
            : placement.slot || "body",
  }));
}

function selectDiversifiedLayout(template, candidates, slide, title, counts, previousKey, forceAlternative = false) {
  return [...candidates].sort((left, right) => {
    const score = (file) => {
      const specs = contentTokenSpecs(themedSvg(template, file));
      const genericPenalty = GENERIC_LAYOUT_KEYS.has(file.key) ? (forceAlternative ? 45 : 6) : 0;
      const repeatedPenalty = file.key === previousKey ? (forceAlternative ? 60 : 12) : 0;
      const usePenalty = (counts.get(file.key) || 0) * 8;
      const titlePenalty = title && !layoutFitsTitle(template, file, title) ? 35 : 0;
      const blockCount = sourceBlocksForSlide(slide, 0).length;
      const slotPenalty = Math.max(0, blockCount - specs.length) * 2;
      return genericPenalty + repeatedPenalty + usePenalty + titlePenalty + slotPenalty;
    };
    return score(left) - score(right);
  })[0];
}

function diversifyDesignPages(template, files, slides, designPages, force = false) {
  const counts = new Map();
  let previousKey = "";
  let repeated = 0;
  let replans = 0;
  const pages = slides.map((slide, slideIndex) => {
    const original = designPages.find((item) => Number(item.slideIndex) === slideIndex) || designPages[slideIndex] || {};
    const role = inferRole(slide, slideIndex, slides.length);
    const candidates = roleLayoutCandidates(template, files, role, slide);
    const requested = chooseLayout(template, files, slide, { ...original, intent: role });
    const requestedIsCompatible = candidates.some((candidate) => candidate.key === requested?.key);
    const diversityApplicable = template.kind === "layout";
    const genericDominance = diversityApplicable && slides.length >= 5 && GENERIC_LAYOUT_KEYS.has(requested?.key)
      && ((counts.get(requested.key) || 0) + 1) / Math.max(1, slideIndex + 1) > 0.55;
    const sameLayoutTooLong = diversityApplicable && requested?.key === previousKey && repeated >= 2;
    const specializedRoleNeedsStructure = diversityApplicable && !["content", "cover"].includes(role) && GENERIC_LAYOUT_KEYS.has(requested?.key);
    const forceAlternative = (diversityApplicable && force) || sameLayoutTooLong || genericDominance || specializedRoleNeedsStructure || !requestedIsCompatible;
    const selected = forceAlternative
      ? selectDiversifiedLayout(template, candidates, slide, String(slide.title || ""), counts, previousKey, true)
      : requested;
    const layout = selected || requested || candidates[0] || files[0];
    if (layout?.key !== requested?.key) replans += 1;
    if (layout?.key === previousKey) repeated += 1;
    else repeated = 1;
    previousKey = layout?.key || "";
    counts.set(previousKey, (counts.get(previousKey) || 0) + 1);
    return {
      ...original,
      slideIndex,
      intent: role,
      layoutKey: layout?.key || original.layoutKey || "",
      placements: placementsForRole(original.placements, role),
    };
  });
  return { pages, replans };
}

function selectTitleLayout(template, files, slide, selected, role = inferRole(slide)) {
  const title = String(slide.title || "").trim();
  if (!title || layoutFitsTitle(template, selected, title)) return { layout: selected, switched: false };
  const fittingLayout = roleLayoutCandidates(template, files, role, slide)
    .find((file) => layoutFitsTitle(template, file, title));
  return fittingLayout
    ? { layout: fittingLayout, switched: fittingLayout.key !== selected.key }
    : { layout: selected, switched: false };
}

function selectCapacityLayout(template, files, slide, page, selected) {
  const blocks = sourceBlocksForSlide(slide, Number(page.slideIndex || 0));
  if (slide.type !== "内容页" || !blocks.length) return { layout: selected, switched: false };
  const specialized = new Set((page.placements || []).map((placement) => placement.slot));
  if (["timeline", "item", "left", "right", "reference"].some((slot) => specialized.has(slot))) return { layout: selected, switched: false };
  const requestedCapacity = layoutCapacity(template, selected);
  const requiredUnits = blocks.reduce((total, block) => total + displayUnits(block.text), 0);
  if (requiredUnits <= requestedCapacity) return { layout: selected, switched: false };
  const role = page.intent || inferRole(slide);
  const fallbackLayout = roleLayoutCandidates(template, files, role, slide)
    .filter((file) => file.key !== selected.key)
    .sort((left, right) => layoutCapacity(template, right) - layoutCapacity(template, left))[0];
  return fallbackLayout && layoutCapacity(template, fallbackLayout) > requestedCapacity
    ? { layout: fallbackLayout, switched: true }
    : { layout: selected, switched: false };
}

function selectContinuationLayout(template, files, slide, page, currentLayout, pending, placementMap, continuation) {
  const role = page.intent || inferRole(slide);
  const continuationTitle = `${slide.title || "续页"}（续${continuation > 1 ? continuation : ""}）`;
  const ranked = roleLayoutCandidates(template, files, role, slide).map((file, roleIndex) => {
    const packed = packBlocks(themedSvg(template, file), pending, placementMap);
    const remainingUnits = packed.remainingBlocks.reduce((total, block) => total + displayUnits(block.text), 0);
    const score = packed.consumedCharacters * 10
      - remainingUnits * 12
      - packed.remainingBlocks.length * 80
      + (file.key !== currentLayout.key ? 180 : 0)
      + (!GENERIC_LAYOUT_KEYS.has(file.key) ? 90 : 0)
      + (layoutFitsTitle(template, file, continuationTitle) ? 60 : -120)
      - roleIndex * 4;
    return { file, packed, score };
  }).filter((candidate) => candidate.packed.consumedCharacters > 0)
    .sort((left, right) => right.score - left.score);
  return ranked[0]?.file || currentLayout;
}

function paginateSlide(template, files, slide, page, sourceSlideIndex) {
  const requested = chooseLayout(template, files, slide, page);
  if (!requested) throw new Error(`模板 ${template.name} 中没有可用页面`);
  const titleSelection = selectTitleLayout(template, files, slide, requested, page.intent || inferRole(slide, sourceSlideIndex));
  const selection = selectCapacityLayout(template, files, slide, page, titleSelection.layout);
  let layout = selection.layout;
  let pending = sourceBlocksForSlide(slide, sourceSlideIndex);
  const placementMap = new Map((page.placements || []).map((placement) => [placement.blockId, placement.slot]));
  const pages = [];
  const consumed = new Map();
  let continuation = 0;
  let layoutSwitched = titleSelection.switched || selection.switched;
  do {
    const packed = packBlocks(themedSvg(template, layout), pending, placementMap);
    if (pending.length && packed.consumedCharacters === 0) {
      const fallbackKey = ROLE_LAYOUTS[template.sourceId]?.content;
      const fallbackLayout = files.find((file) => file.key === fallbackKey && file.key !== layout.key);
      if (fallbackLayout) {
        layout = fallbackLayout;
        continue;
      }
      throw new Error(`内容覆盖门禁：模板 ${template.name} 的 ${layout.key} 没有可承载规划内容的文本槽位`);
    }
    for (const [blockId, fragments] of packed.consumed) {
      if (!consumed.has(blockId)) consumed.set(blockId, []);
      consumed.get(blockId).push(...fragments);
    }
    pages.push({
      slide: { ...slide },
      layout,
      sourceSlideIndex,
      continuation,
      page: {
        ...page,
        displayTitle: continuation ? `${slide.title || `第 ${sourceSlideIndex + 1} 页`}（续${continuation > 1 ? continuation : ""}）` : slide.title,
        tokenValues: packed.tokenValues,
        renderBlocks: [...packed.consumed.entries()].map(([id, fragments]) => ({ id, text: fragments.join("") })),
      },
    });
    pending = packed.remainingBlocks;
    continuation += 1;
    if (pending.length) {
      const continuationLayout = selectContinuationLayout(template, files, slide, page, layout, pending, placementMap, continuation);
      if (continuationLayout && continuationLayout.key !== layout.key) {
        layout = continuationLayout;
        layoutSwitched = true;
      }
    }
    if (continuation > 50) throw new Error("内容覆盖门禁：自动续页超过安全上限");
  } while (pending.length);
  return { pages, consumed, sourceBlocks: sourceBlocksForSlide(slide, sourceSlideIndex), layoutSwitched };
}

function expandDeckPages(template, files, slides, designPages) {
  const expandedPages = [];
  const sourceBlocks = [];
  const renderedBlocks = new Map();
  let layoutSwitches = 0;
  slides.forEach((slide, sourceSlideIndex) => {
    const page = designPages.find((item) => Number(item.slideIndex) === sourceSlideIndex) || designPages[sourceSlideIndex] || {};
    const pagination = paginateSlide(template, files, slide, page, sourceSlideIndex);
    expandedPages.push(...pagination.pages);
    if (pagination.layoutSwitched) layoutSwitches += 1;
    for (const block of pagination.sourceBlocks) sourceBlocks.push(block);
    for (const [blockId, fragments] of pagination.consumed) renderedBlocks.set(blockId, fragments);
  });
  return { expandedPages, sourceBlocks, renderedBlocks, layoutSwitches };
}

function layoutDiversitySummary(template, files, slides, expandedPages, layoutReplans, autoReplanned) {
  const sourcePages = expandedPages.filter((page) => !page.continuation);
  const keys = sourcePages.map((page) => page.layout.key);
  const counts = keys.reduce((result, key) => ({ ...result, [key]: (result[key] || 0) + 1 }), {});
  const [dominantLayout = "", dominantCount = 0] = Object.entries(counts).sort((left, right) => right[1] - left[1])[0] || [];
  let maxConsecutive = 0;
  let streak = 0;
  let previous = "";
  keys.forEach((key) => {
    streak = key === previous ? streak + 1 : 1;
    previous = key;
    maxConsecutive = Math.max(maxConsecutive, streak);
  });
  const intentCount = new Set(slides.map((slide, index) => inferRole(slide, index, slides.length))).size;
  const eligibleLayoutCount = files.filter((file) => !MEDIA_LAYOUT_PATTERN.test(file.key)
    && contentTokenSpecs(themedSvg(template, file)).length).length;
  const hasBundledMedia = templateHasBundledMedia(template, files);
  const mediaConstrained = template.sourceId === "editorial_bleed" && !slides.some(slideHasMedia) && !hasBundledMedia;
  const gateEnabled = template.kind === "layout" && slides.length >= 5 && eligibleLayoutCount >= 3 && !mediaConstrained;
  const expectedUniqueLayouts = gateEnabled ? Math.min(4, Math.max(2, intentCount), eligibleLayoutCount) : 1;
  const dominantRatio = keys.length ? dominantCount / keys.length : 0;
  const passed = !gateEnabled || (new Set(keys).size >= expectedUniqueLayouts && dominantRatio <= 0.6 && maxConsecutive <= 2);
  return {
    status: passed ? "passed" : "failed",
    gateEnabled,
    mediaConstrained,
    sourcePages: keys.length,
    uniqueLayouts: new Set(keys).size,
    expectedUniqueLayouts,
    dominantLayout,
    dominantCount,
    dominantRatio: Number(dominantRatio.toFixed(3)),
    maxConsecutive,
    layoutCounts: counts,
    layoutReplans,
    autoReplanned,
  };
}

function renderSvg(template, file, slide, page, index, total) {
  let svg = applyRootFontDefault(applySkin(fs.readFileSync(file.path, "utf8"), template.sourceId));
  const tokenMap = tokenMapForSlide(slide, page, index, total);
  const tokens = [...new Set([...svg.matchAll(/\{\{([A-Z0-9_]+)\}\}/g)].map((match) => match[1]))];
  if (CUSTOM_CARRIER_TYPES.has(carrierTypeForSlide(slide))) {
    tokens.filter(isContentToken).forEach((token) => { tokenMap[token] = ""; });
  }
  for (const token of tokens) svg = placeholderText(svg, token, tokenMap[token] ?? "");
  return renderCarrier(template, svg.replaceAll(/\{\{[A-Z0-9_]+\}\}/g, ""), slide, page);
}

function validateCarrierSvg(svg, expectedType, blockCount) {
  const actualType = svg.match(/data-clinpaper-carrier="([^"]+)"/)?.[1] || "";
  if (expectedType === "none" && !actualType) return { status: "passed", expectedType, actualType: "none", reason: "" };
  if (actualType !== expectedType) return { status: "failed", expectedType, actualType, reason: "视觉规格与实际载体不一致" };
  const semanticChecks = {
    narrative: /data-clinpaper-lead-line="true"/.test(svg),
    comparison: /data-clinpaper-divider="true"/.test(svg),
    timeline: /data-clinpaper-axis="true"/.test(svg) && /<circle\b/.test(svg),
    table: /data-clinpaper-semantic-table="v1"/.test(svg) && /data-clinpaper-table-row=/.test(svg),
    data: /data-clinpaper-metric-shape=/.test(svg),
    kpi: /data-clinpaper-metric-shape=/.test(svg),
    chart: /data-clinpaper-chart-axis="true"/.test(svg) && /data-clinpaper-metric-shape=/.test(svg),
    evidence: /data-clinpaper-evidence-boundary="true"/.test(svg),
    algorithm: /<rect\b/.test(svg) && /<circle\b/.test(svg) && (blockCount <= 1 || /data-clinpaper-connector="true"/.test(svg)),
    statement: /data-clinpaper-carrier="statement"/.test(svg) && /<line\b/.test(svg),
    cards: /<rect\b/.test(svg),
    image: /data-clinpaper-image="true"/.test(svg) && /<image\b/.test(svg),
  };
  const passed = semanticChecks[expectedType] ?? true;
  return { status: passed ? "passed" : "failed", expectedType, actualType, reason: passed ? "" : "载体缺少类型所需的原生 SVG 结构" };
}

function carrierDiversitySummary(expandedPages, pageFiles) {
  const allContentPages = expandedPages.map((entry, index) => ({ entry, file: pageFiles[index] }))
    .filter(({ entry }) => entry.slide.type === "内容页");
  const sourceContentPages = allContentPages.filter(({ entry }) => !entry.continuation);
  const carriers = sourceContentPages.map(({ file }) => file.carrierType);
  const planned = sourceContentPages.map(({ entry }) => carrierTypeForSlide(entry.slide));
  const counts = carriers.reduce((result, type) => ({ ...result, [type]: (result[type] || 0) + 1 }), {});
  const [dominantCarrier = "", dominantCount = 0] = Object.entries(counts).sort((left, right) => right[1] - left[1])[0] || [];
  let maxConsecutive = 0;
  let cardStreak = 0;
  let maxCardStreak = 0;
  let streak = 0;
  let previous = "";
  carriers.forEach((type) => {
    streak = type === previous ? streak + 1 : 1;
    previous = type;
    maxConsecutive = Math.max(maxConsecutive, streak);
    cardStreak = type === "cards" ? cardStreak + 1 : 0;
    maxCardStreak = Math.max(maxCardStreak, cardStreak);
  });
  const cardCount = counts.cards || 0;
  const cardRatio = carriers.length ? cardCount / carriers.length : 0;
  const semanticFailures = allContentPages.filter(({ file }) => file.carrierCheck?.status !== "passed")
    .map(({ file }) => ({ page: file.file, ...file.carrierCheck }));
  const plannedUnique = new Set(planned).size;
  const actualUnique = new Set(carriers).size;
  const gateEnabled = carriers.length >= 1;
  const cardGatePassed = carriers.length < 5 || (cardRatio <= 0.4 && maxCardStreak <= 2);
  const passed = !gateEnabled || (!semanticFailures.length && actualUnique === plannedUnique && cardGatePassed);
  return {
    status: passed ? "passed" : "failed",
    gateEnabled,
    sourceContentPages: carriers.length,
    outputContentPages: allContentPages.length,
    plannedUniqueCarriers: plannedUnique,
    uniqueCarriers: actualUnique,
    carrierCounts: counts,
    dominantCarrier,
    dominantRatio: Number((carriers.length ? dominantCount / carriers.length : 0).toFixed(3)),
    maxConsecutive,
    maxCardStreak,
    cardRatio: Number(cardRatio.toFixed(3)),
    semanticFailures,
  };
}

async function runPython(python, script, args, options = {}) {
  try {
    const result = await execFileAsync(python, [script, ...args], {
      cwd: options.cwd,
      timeout: options.timeout || 120_000,
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
    });
    return { stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const detail = [error.stdout, error.stderr, error.message].filter(Boolean).join("\n").trim();
    throw new Error(detail.slice(-4000) || "ppt-master 命令执行失败");
  }
}

export async function buildPptMasterDeck({ projectTitle, slides, designPages = [], template, skillRoot = DEFAULT_SKILL_ROOT, python = DEFAULT_PYTHON }) {
  if (!template?.templateDir || !fs.existsSync(template.templateDir)) throw new Error("所选 ppt-master 模板不可用");
  if (!Array.isArray(slides) || !slides.length) throw new Error("缺少可生成的 PPT 页面");
  if (!fs.existsSync(python)) throw new Error("ppt-master 所需的 Python 运行时不存在");
  const buildId = crypto.randomUUID();
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), `clinpaper-ppt-master-${buildId.slice(0, 8)}-`));
  const svgOutput = path.join(projectPath, "svg_output");
  const notesDir = path.join(projectPath, "notes");
  const validationDir = path.join(projectPath, "validation");
  const exportsDir = path.join(projectPath, "exports");
  [svgOutput, notesDir, validationDir, exportsDir].forEach(ensureDirectory);
  if (template.imagesDir && fs.existsSync(template.imagesDir)) fs.cpSync(template.imagesDir, path.join(projectPath, "images"), { recursive: true });
  const files = templateFiles(template);
  let layoutPlan = diversifyDesignPages(template, files, slides, designPages, false);
  let expansion = expandDeckPages(template, files, slides, layoutPlan.pages);
  let diversity = layoutDiversitySummary(template, files, slides, expansion.expandedPages, layoutPlan.replans, false);
  if (diversity.status !== "passed") {
    layoutPlan = diversifyDesignPages(template, files, slides, designPages, true);
    expansion = expandDeckPages(template, files, slides, layoutPlan.pages);
    diversity = layoutDiversitySummary(template, files, slides, expansion.expandedPages, layoutPlan.replans, true);
  }
  if (diversity.status !== "passed") {
    throw new Error(`版式多样性门禁未通过：当前 ${diversity.uniqueLayouts} 种 Layout，要求至少 ${diversity.expectedUniqueLayouts} 种；主导版式占比 ${Math.round(diversity.dominantRatio * 100)}%`);
  }
  const { expandedPages, sourceBlocks, renderedBlocks, layoutSwitches } = expansion;

  const unallocatedBlocks = sourceBlocks.filter((block) => normalizeCoverage((renderedBlocks.get(block.id) || []).join("")) !== normalizeCoverage(block.text));
  const sourceTitles = slides.map((slide) => String(slide.title || "").trim()).filter(Boolean);
  const factLocks = [...new Set(slides.flatMap((slide) => extractFactLocks(`${slide.title || ""}\n${slide.content || ""}`)))];
  const visualRefs = new Set(slides.flatMap((slide, slideIndex) => (slide.visual_spec?.items || []).flatMap((item) => (item.source_refs || []).map((ref) => {
    const match = String(ref).match(/^content:(\d+)$/);
    return match ? `s${slideIndex}-b${Number(match[1]) - 1}` : "";
  }))).filter(Boolean));
  const expectedVisualBlocks = new Set(slides.flatMap((slide, slideIndex) => slide.visual_spec?.type && slide.visual_spec.type !== "none"
    ? sourceBlocksForSlide(slide, slideIndex).map((block) => block.id)
    : []));
  const missingVisualRefs = [...expectedVisualBlocks].filter((blockId) => !visualRefs.has(blockId));
  if (unallocatedBlocks.length) throw new Error(`容量分配未完成：${unallocatedBlocks.length} 个规划内容块未完整进入 SVG 槽位`);
  if (missingVisualRefs.length) throw new Error(`视觉结构门禁未通过：${missingVisualRefs.length} 个内容块没有 visual_spec 引用`);

  const pageFiles = [];
  expandedPages.forEach(({ slide, page, layout, sourceSlideIndex, continuation }, index) => {
    const outputName = `${String(index + 1).padStart(2, "0")}_${layout.key}.svg`;
    const renderedSvg = renderSvg(template, layout, slide, page, index, expandedPages.length);
    const carrierType = carrierTypeForSlide(slide);
    const carrierCheck = validateCarrierSvg(renderedSvg, carrierType, page.renderBlocks?.length || 0);
    fs.writeFileSync(path.join(svgOutput, outputName), renderedSvg, "utf8");
    fs.writeFileSync(path.join(notesDir, outputName.replace(/\.svg$/i, ".md")), `# ${page.displayTitle || slide.title || `第 ${index + 1} 页`}\n\n${slide.speakerNotes || ""}\n`, "utf8");
    pageFiles.push({ file: outputName, layoutKey: layout.key, carrierType, carrierCheck, title: page.displayTitle || slide.title || `第 ${index + 1} 页`, sourceSlideIndex, continuation });
  });

  const carrierDiversity = carrierDiversitySummary(expandedPages, pageFiles);
  if (carrierDiversity.status !== "passed") {
    const semanticDetail = carrierDiversity.semanticFailures.length ? `，${carrierDiversity.semanticFailures.length} 页载体语义不完整` : "";
    throw new Error(`视觉载体门禁未通过：规划 ${carrierDiversity.plannedUniqueCarriers} 种，实际 ${carrierDiversity.uniqueCarriers} 种，卡片占比 ${Math.round(carrierDiversity.cardRatio * 100)}%${semanticDetail}`);
  }

  const qualityScript = path.join(skillRoot, "scripts/svg_quality_checker.py");
  const compactScript = path.join(skillRoot, "scripts/compact_svg_styles.py");
  const exportScript = path.join(skillRoot, "scripts/svg_to_pptx.py");
  await runPython(python, compactScript, [svgOutput, "--inplace"]);

  const visibleText = visibleSvgText(pageFiles.map((page) => fs.readFileSync(path.join(svgOutput, page.file), "utf8")).join("\n"));
  const normalizedVisibleText = normalizeCoverage(visibleText);
  const missingBlocks = sourceBlocks.filter((block) => (renderedBlocks.get(block.id) || []).some((fragment) => !normalizedVisibleText.includes(normalizeCoverage(fragment))));
  const missingTitles = sourceTitles.filter((title) => !normalizedVisibleText.includes(normalizeCoverage(title)));
  const missingFacts = factLocks.filter((fact) => !normalizedVisibleText.includes(normalizeCoverage(fact)));
  if (missingBlocks.length || missingTitles.length || missingFacts.length) {
    throw new Error(`内容覆盖门禁未通过：${missingBlocks.length} 个内容块不完整，${missingTitles.length} 个标题未保留，${missingFacts.length} 个事实锁未命中`);
  }

  const coverage = {
    status: "passed",
    sourceSlides: slides.length,
    outputSlides: expandedPages.length,
    sourceBlocks: sourceBlocks.length + sourceTitles.length,
    coveredBlocks: sourceBlocks.length + sourceTitles.length,
    coveragePercent: 100,
    factLocks: factLocks.length,
    matchedFactLocks: factLocks.length,
    visualSpecs: slides.filter((slide) => slide.visual_spec).length,
    visualItems: slides.reduce((total, slide) => total + (slide.visual_spec?.items?.length || 0), 0),
    visualReferencedBlocks: visualRefs.size,
    visualCoveragePercent: expectedVisualBlocks.size ? Math.round((visualRefs.size / expectedVisualBlocks.size) * 100) : 100,
    continuationSlides: Math.max(0, expandedPages.length - slides.length),
    layoutSwitches,
    layoutReplans: diversity.layoutReplans,
    layoutDiversity: diversity,
    carrierDiversity,
  };
  fs.writeFileSync(path.join(validationDir, "content_coverage_report.json"), JSON.stringify(coverage, null, 2), "utf8");

  const quality = await runPython(python, qualityScript, [projectPath, "--canonical-authoring", "--stage", "final", "--json", "--quick-generate"]);
  const safeName = String(projectTitle || "病例汇报").replace(/[\\/:*?"<>|]/g, "_").slice(0, 60) || "病例汇报";
  const outputPath = path.join(exportsDir, `${safeName}.pptx`);
  const exported = await runPython(python, exportScript, [projectPath, "--quick-generate", "--with-notes", "--conversion-trace", "-o", outputPath], { timeout: 180_000 });
  const reportPath = path.join(validationDir, `${safeName}.report.json`);
  const report = fs.existsSync(reportPath) ? JSON.parse(fs.readFileSync(reportPath, "utf8")) : {};
  const previewDir = svgOutput;
  return {
    id: buildId,
    projectPath,
    outputPath,
    previewDir,
    pageFiles,
    engine: "ppt-master-svg-to-drawingml",
    structure: /Quick PPTX structure:\s*structured/i.test(exported.stdout) ? "structured" : "flat",
    quality: {
      status: report.status || "passed",
      warnings: Number(report?.quality?.summary?.warnings || 0),
      message: quality.stdout.match(/\[SUMMARY\][\s\S]*?Total files:[\s\S]*?(?=\n\n|$)/)?.[0]?.replace(/\s+/g, " ").slice(0, 280) || "SVG 质量检查通过",
    },
    package: report.package || {},
    checks: { ...(report.checks || {}), content_coverage: "passed", fact_lock: "passed", visual_spec_coverage: "passed", carrier_semantics: "passed", carrier_diversity: "passed" },
    coverage,
  };
}

export function removePptMasterBuild(build) {
  if (build?.projectPath && build.projectPath.startsWith(os.tmpdir())) fs.rmSync(build.projectPath, { recursive: true, force: true });
}
