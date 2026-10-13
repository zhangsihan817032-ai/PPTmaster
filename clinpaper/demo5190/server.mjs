import "dotenv/config";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { load as loadHtml } from "cheerio";
import { buildPptMasterDeck, removePptMasterBuild } from "./ppt-master-engine.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 5190);
const pptSkillRoot = process.env.PPT_MASTER_SKILL_ROOT || "/Users/dingxiangyuan/Downloads/ppt-master/skills/ppt-master";
const require = createRequire(import.meta.url);
const mammoth = require("mammoth");
const multer = require("multer");
const pdfParse = require("pdf-parse");

const pptTemplateDefinitions = {
  "layout:report_core": { name: "Report Core", label: "研究报告型", description: "适合病例讨论、证据分析与可会后阅读的页面体系，强调层级、页码与持续页眉。", recommended: true, mode: "report", primary: "7753FF", accent: "A88DFB", background: "FFFFFF", surface: "F5F6F9", text: "333333", coverBackground: "1E293B", coverText: "FFFFFF" },
  "layout:presentation_core": { name: "Presentation Core", label: "临床简洁型", description: "通用的标题、对比、流程、图片与数据页结构，适合科室内汇报。", mode: "minimal", primary: "5B6CFA", accent: "9DA8FF", background: "FFFFFF", surface: "F8FAFC", text: "1E293B", coverBackground: "FFFFFF", coverText: "1E293B" },
  "layout:presentation_core_43": { name: "Presentation Core 4:3", label: "教室投影型", description: "为 4:3 投影、教室和会议室设计的紧凑页面系统。", recommended: true, mode: "minimal", primary: "5B6CFA", accent: "9DA8FF", background: "FFFFFF", surface: "F8FAFC", text: "1E293B", coverBackground: "FFFFFF", coverText: "1E293B" },
  "layout:editorial_bleed": { name: "Editorial Bleed", label: "影像叙事型", description: "大图出血和文字遮罩的叙事布局，适合医学影像资料充足的病例。", mode: "editorial", primary: "0F172A", accent: "7753FF", background: "0F172A", surface: "1E293B", text: "FFFFFF", coverBackground: "0F172A", coverText: "FFFFFF" },
  "deck:中国电信": { name: "中国电信", label: "品牌 Deck", description: "来自 Skill 的完整红灰品牌 Deck，包含封面、目录、章节、内容与收尾页。", mode: "brand", primary: "C00000", accent: "D9D9D9", background: "FFFFFF", surface: "F5F5F5", text: "333333", coverBackground: "FFFFFF", coverText: "333333" },
  "deck:中汽研": { name: "中汽研", label: "品牌 Deck", description: "来自 Skill 的完整深蓝工程品牌 Deck，包含封面、目录、章节、内容与收尾页。", mode: "brand", primary: "004098", accent: "5A8FD8", background: "FFFFFF", surface: "F8FAFC", text: "333333", coverBackground: "003B82", coverText: "FFFFFF" },
};

function readPptTemplateCatalog() {
  const catalogs = [
    { kind: "layout", index: path.join(pptSkillRoot, "templates/layouts/layouts_index.json") },
    { kind: "deck", index: path.join(pptSkillRoot, "templates/decks/decks_index.json") },
  ];
  return catalogs.flatMap(({ kind, index }) => {
    if (!fs.existsSync(index)) return [];
    const entries = JSON.parse(fs.readFileSync(index, "utf8"));
    return Object.entries(entries).flatMap(([sourceId, item]) => {
      const definition = pptTemplateDefinitions[`${kind}:${sourceId}`];
      const templateDir = path.join(path.dirname(index), sourceId, "templates");
      if (!definition || !fs.existsSync(templateDir)) return [];
      const previewFile = fs.readdirSync(templateDir).sort().find((name) => /^01_.*\.svg$/i.test(name));
      if (!previewFile) return [];
      const indexedPageTypes = Array.isArray(item.page_types) ? item.page_types : [];
      const derivedPageTypes = fs.readdirSync(templateDir).filter((name) => /^\d+_.*\.svg$/i.test(name)).sort().map((name) => name.replace(/^\d+_/, "").replace(/\.svg$/i, ""));
      return [{
        id: `${kind}:${sourceId}`,
        kind,
        sourceId,
        source: "ppt-master",
        name: definition.name,
        label: definition.label,
        description: definition.description || item.summary || "",
        canvasFormat: item.canvas_format,
        pageCount: item.page_count,
        pageTypes: indexedPageTypes.length ? indexedPageTypes : derivedPageTypes,
        recommended: Boolean(definition.recommended),
        previewUrl: `/api/ppt/templates/preview?kind=${encodeURIComponent(kind)}&id=${encodeURIComponent(sourceId)}`,
        theme: { mode: definition.mode, primary: `#${definition.primary}`, accent: `#${definition.accent}`, background: `#${definition.background}`, surface: `#${definition.surface}`, text: `#${definition.text}`, coverBackground: `#${definition.coverBackground}`, coverText: `#${definition.coverText}` },
        previewFile: path.join(templateDir, previewFile),
        templateDir,
        imagesDir: path.join(path.dirname(templateDir), "images"),
      }];
    });
  });
}

function publicPptTemplate(item) {
  const { previewFile, templateDir, imagesDir, ...publicItem } = item;
  return publicItem;
}

const materialUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024, files: 10 },
});

const json = (res, status, payload) => {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
};

const readBody = (req) => new Promise((resolve, reject) => {
  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
    if (body.length > 8_000_000) reject(new Error("请求内容过大"));
  });
  req.on("end", () => resolve(body));
  req.on("error", reject);
});

const object = (properties, required = Object.keys(properties)) => ({
  type: "object",
  additionalProperties: false,
  properties,
  required,
});

const timelineTypes = ["起病病程", "初诊经过", "入院评估", "辅助检查", "诊断确立", "治疗启动", "疗效评估", "治疗调整", "出院管理", "随访转诊"];
const visualTypes = ["none", "narrative", "cards", "comparison", "timeline", "data", "kpi", "chart", "table", "algorithm", "evidence", "statement", "image"];
const visualTones = ["neutral", "highlight", "warn"];
const visualHierarchies = ["title-body", "title-lead-detail", "left-right", "sequence", "metric-insight"];
const visualDensities = ["breathing", "balanced", "dense"];
const visualSpecSchema = object({
  type: { type: "string", enum: visualTypes },
  title: { type: "string" },
  hierarchy: { type: "string", enum: visualHierarchies },
  density: { type: "string", enum: visualDensities },
  items: { type: "array", items: object({
    id: { type: "string" },
    label: { type: "string" },
    value: { type: "string" },
    detail: { type: "string" },
    tone: { type: "string", enum: visualTones },
    source_refs: { type: "array", items: { type: "string" } },
  }) },
  columns: { type: "array", items: { type: "string" } },
  rows: { type: "array", items: object({
    label: { type: "string" },
    values: { type: "array", items: { type: "string" } },
    tone: { type: "string", enum: visualTones },
    source_refs: { type: "array", items: { type: "string" } },
  }) },
});

const schemas = {
  parse_case: object({
    projectTitle: { type: "string" },
    sections: { type: "array", items: object({
      title: { type: "string" },
      content: { type: "string" },
      missing: { type: "array", items: { type: "string" } },
      suggested: { type: "array", items: { type: "string" } },
    }) },
  }),
  timeline: object({
    events: { type: "array", items: object({
      date: { type: "string" },
      type: { type: "string", enum: timelineTypes },
      description: { type: "string" },
      source: { type: "string" },
      required: { type: "string" },
    }) },
  }),
  storylines: object({
    storylines: { type: "array", items: object({
      title: { type: "string" },
      recommended: { type: "boolean" },
      reason: { type: "string" },
      core: { type: "string" },
      boundary: { type: "string" },
    }) },
  }),
  outline: object({
    title: { type: "string" },
    sections: { type: "array", items: object({
      title: { type: "string" },
      keyPoints: { type: "string" },
      evidenceNeed: { type: "string" },
    }) },
  }),
  evidence: object({
    topics: { type: "array", items: object({
      question: { type: "string" },
      summary: { type: "string" },
      queries: { type: "array", items: { type: "string" } },
      citations: { type: "array", items: object({
        title: { type: "string" },
        journal: { type: "string" },
        year: { type: "string" },
        pmid: { type: "string" },
      }) },
    }) },
  }),
  literature_analysis: object({
    summary: { type: "string" },
    assessments: { type: "array", items: object({
      pmid: { type: "string" },
      applicability: { type: "string" },
    }) },
  }),
  literature_search_plan: object({
    queries: { type: "array", items: { type: "string" } },
    intentSummary: { type: "string" },
  }),
  literature_specific_plan: object({
    mode: { type: "string", enum: ["specific", "topic"] },
    priority: { type: "string", enum: ["P0", "P1", ""] },
    identifierType: { type: "string", enum: ["pmid", "doi", "source", "none"] },
    pmid: { type: "string" },
    doi: { type: "string" },
    sourceRecordId: { type: "string" },
    title: { type: "string" },
    journal: { type: "string" },
    author: { type: "string" },
    year: { type: "string" },
    volume: { type: "string" },
    issue: { type: "string" },
    pages: { type: "string" },
    titleTerms: { type: "array", items: { type: "string" } },
    intentSummary: { type: "string" },
  }),
  literature_batch_analysis: object({
    summary: { type: "string" },
    titles: { type: "array", items: object({
      pmid: { type: "string" },
      titleZh: { type: "string" },
    }) },
    directions: { type: "array", items: object({
      id: { type: "string" },
      title: { type: "string" },
      analysis: { type: "string" },
      pmids: { type: "array", items: { type: "string" } },
    }) },
  }),
  literature_single_interpretation: object({
    articleType: { type: "string", enum: ["original", "systematic_review", "guideline", "case_report", "other"] },
    summary: { type: "string" },
    sections: { type: "array", items: object({
      id: { type: "string", enum: ["basic", "background", "methods", "results", "author_conclusion", "limitations", "applicability", "reading_points"] },
      title: { type: "string" },
      content: { type: "string" },
      sourceScope: { type: "string", enum: ["metadata", "abstract", "not_available"] },
      evidenceText: { type: "string" },
    }) },
    missing: { type: "array", items: { type: "string" } },
    boundary: { type: "string" },
  }),
  review_requirements: object({
    field_or_department: { type: "string" },
    writing_type: { type: "string" },
    core_question: { type: "string" },
    research_points: object({
      population_or_disease: { type: "string" },
      theme_or_intervention_exposure: { type: "string" },
      outcomes_or_focus: { type: "string" },
    }),
    topic_risk: object({ notice: { type: "string" } }),
  }),
  review_directions: object({
    exploration_directions: { type: "array", items: object({
      id: { type: "string" }, direction: { type: "string" }, direction_question: { type: "string" }, why_explore: { type: "string" },
      recall_focus: { type: "array", items: { type: "string" } }, to_verify: { type: "array", items: { type: "string" } }, terms: { type: "string" }, en_query: { type: "string" }, cn_query: { type: "string" },
    }) },
  }),
  review_literature_analysis: object({
    analysis_markdown: { type: "string" },
    categories: { type: "array", items: object({ direction_id: { type: "string" }, category_name: { type: "string" }, category_description: { type: "string" }, literature_ids: { type: "array", items: { type: "string" } } }) },
  }),
  review_topics: object({
    candidates: { type: "array", items: object({ title: { type: "string" }, zh_title: { type: "string" }, core_question: { type: "string" }, why: { type: "string" }, difference: { type: "string" }, support: { type: "string" }, journal_fit: { type: "string" }, risk: object({ title: { type: "string" }, description: { type: "string" } }), recommended: { type: "boolean" } }) },
  }),
  review_approaches: object({
    recommendations: { type: "array", items: object({ name: { type: "string" }, scene: { type: "array", items: { type: "string" } }, pros: { type: "array", items: { type: "string" } }, cons: { type: "array", items: { type: "string" } }, outline_impact: { type: "array", items: { type: "string" } }, recall_focus: { type: "array", items: { type: "string" } }, recommended: { type: "boolean" } }) },
  }),
  review_outline: object({
    chapters: { type: "array", items: object({ id: { type: "string" }, title: { type: "string" }, focus: { type: "string" }, lit_need: { type: "string" }, words: { type: "integer" } }) },
  }),
  review_recall_plan: object({
    chapters: { type: "array", items: object({ chapter_id: { type: "string" }, queries: { type: "array", items: { type: "string" } } }) },
  }),
  review_section: object({
    chapter_id: { type: "string" }, title: { type: "string" }, markdown: { type: "string" }, evidence_ids: { type: "array", items: { type: "string" } }, boundary: { type: "string" },
  }),
  review_fulltext: object({
    markdown: { type: "string" }, checks: { type: "array", items: object({ level: { type: "string" }, message: { type: "string" } }) }, boundary: { type: "string" },
  }),
  slides: object({
    slides: { type: "array", items: object({
      task_id: { type: "string" },
      page_no: { type: "integer" },
      type: { type: "string", enum: ["封面", "目录", "内容页", "封底"] },
      title: { type: "string" },
      content: { type: "string" },
      speakerNotes: { type: "string" },
      extra: { type: "string" },
      visual_spec: visualSpecSchema,
    }) },
  }),
  slide_visual: object({
    visual_spec: visualSpecSchema,
  }),
  ppt_design: object({
    pages: { type: "array", items: object({
      slideIndex: { type: "integer" },
      layoutKey: { type: "string" },
      placements: { type: "array", items: object({
        blockId: { type: "string" },
        slot: { type: "string", enum: ["subtitle", "lead", "body", "item", "timeline", "left", "right", "reference"] },
      }) },
    }) },
  }),
};

const safeExcerpt = (value, length = 140) => String(value || "").replace(/\s+/g, " ").trim().slice(0, length);
const normalizeEvidenceText = (value) => String(value || "").replace(/\s+/g, " ").trim();

function fallbackSingleInterpretation(context = {}) {
  const item = context.item || {};
  const abstract = String(item.abstract || "").replace(/\s+/g, " ").trim();
  const sentences = abstract.match(/[^.!?。！？]+[.!?。！？]?/g)?.map((sentence) => sentence.trim()).filter(Boolean) || [];
  const pick = (pattern, fallbackIndex = -1) => sentences.find((sentence) => pattern.test(sentence)) || (fallbackIndex >= 0 ? sentences[fallbackIndex] || "" : "");
  const background = pick(/background|objective|aim|purpose|背景|目的/i, 0);
  const methods = pick(/methods?|random|trial|cohort|participant|patient|included|enrolled|方法|纳入|研究对象/i, 1);
  const results = pick(/results?|significant|confidence interval|\bp\s*[<=>]|%|结果|差异/i, Math.min(2, Math.max(0, sentences.length - 2)));
  const conclusion = pick(/conclusions?|suggest|indicat|结论|提示/i, Math.max(0, sentences.length - 1));
  const limitations = pick(/limitations?|bias|局限|偏倚/i);
  const metadata = [item.title, item.journal, item.year, (item.authors || []).join("、"), item.pmid ? `PMID: ${item.pmid}` : "", item.doi ? `DOI: ${item.doi}` : ""].filter(Boolean).join("；");
  const section = (id, title, content, sourceScope, evidenceText = "") => ({ id, title, content: content || "未从当前可用内容获得。", sourceScope: content ? sourceScope : "not_available", evidenceText: content ? evidenceText : "" });
  return {
    articleType: "other",
    summary: "已基于当前文献题录和摘要生成结构化解读。演示回退仅整理可见内容，不扩展摘要未提供的方法或结果。",
    sections: [
      section("basic", "文献基本信息", metadata, "metadata", String(item.title || "")),
      section("background", "研究背景与研究问题", background, "abstract", background),
      section("methods", "研究方法", methods, "abstract", methods),
      section("results", "主要结果", results, "abstract", results),
      section("author_conclusion", "作者结论", conclusion, "abstract", conclusion),
      section("limitations", "研究局限", limitations, "abstract", limitations),
      section("applicability", "对重点问题的适用性", context.focus ? `当前只能基于摘要判断该文献与“${safeExcerpt(context.focus, 100)}”的表面关联，适用性仍需核对全文研究对象、场景和结局。` : "当前只能基于摘要进行初步理解，适用性需继续核对全文研究对象、场景和结局。", "not_available"),
      section("reading_points", "阅读要点与待核对问题", "建议进一步核对全文中的纳入排除标准、结局定义、统计方法、完整结果和作者报告的局限。", "not_available"),
    ],
    missing: [!limitations ? "摘要未提供明确的研究局限" : "", "当前未核对全文"].filter(Boolean),
    boundary: "当前解读仅基于题录和摘要，不代表已完成全文方法学评价，也不构成个体诊疗建议。",
  };
}

const LAYOUT_PROFILE_HINTS = [
  { pattern: /^(cover|title_slide|hero_full)$/, roles: ["cover"], purpose: "封面与开场标题" },
  { pattern: /^(agenda|toc|three_card|full_statement)$/, roles: ["agenda", "summary"], purpose: "目录、汇报结构或要点总览" },
  { pattern: /^(closing|ending|hero_statement|closing_full)$/, roles: ["closing", "summary"], purpose: "结论、小结或收尾" },
  { pattern: /(process_timeline|step_flow)/, roles: ["timeline"], purpose: "时间线、诊疗过程或阶段流程" },
  { pattern: /(comparison|matrix_2x2|two_content|split_bleed_reverse)/, roles: ["comparison", "evidence"], purpose: "双栏比较、鉴别诊断或证据对照" },
  { pattern: /(kpi|data_story|chart_insight|table_summary)/, roles: ["data", "outcome"], purpose: "检查数值、疗效指标或结构化数据结论" },
  { pattern: /(appendix|editorial_split|split_bleed)/, roles: ["evidence", "content"], purpose: "医学依据、文献讨论或重点分析" },
  { pattern: /(three_block|three_card|triptych|numbered_list|two_card_stack)/, roles: ["cards", "summary"], purpose: "并列要点、病例概况或总结" },
  { pattern: /(picture|image|screenshot|hero_side|image_grid|quote_over_image)/, roles: ["image"], purpose: "图片、影像或截图展示", mediaRequired: true },
  { pattern: /.*/, roles: ["content"], purpose: "通用标题与正文" },
];

function inferPptIntent(slide = {}, slideIndex = 0, slideCount = 1) {
  const text = `${slide.title || ""}\n${slide.extra || ""}\n${slide.content || ""}`;
  if (slide.type === "封面" || slideIndex === 0) return "cover";
  if (slide.type === "目录" || /目录|提纲|汇报结构|内容概览/.test(text)) return "agenda";
  if (slide.type === "封底" || /感谢|欢迎讨论|Q&A|答疑/.test(text)) return "closing";
  const visualIntent = {
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
  if (visualIntent) return visualIntent;
  if (/时间线|诊疗经过|病程|治疗经过|随访历程|阶段流程/.test(text)) return "timeline";
  if (/医学依据|文献|指南|证据|PMID|讨论/.test(text)) return "evidence";
  if (/对比|比较|鉴别| versus |\bvs\.?\b|基线.*(?:治疗后|随访)|治疗前.*治疗后/.test(text)) return "comparison";
  if (/检查|检验|量表|评分|指标|疗效|安全性|结局|转归|PET|CT|MRI|影像/.test(text)
    && /\d|%|mg|mmHg|mmol|ng\/L|U\/L|评分|阳性|阴性/.test(text)) return "data";
  if (/病例概况|患者概况|核心问题|诊断要点|治疗方案|要点|总结|小结/.test(text)
    || slideIndex === slideCount - 1) return "summary";
  return "content";
}

function contentLines(slide = {}) {
  return String(slide.content || "").replace(/\r/g, "").split("\n").map((text) => text.trim()).filter(Boolean);
}

function defaultVisualType(slide, slideIndex, slideCount) {
  const role = inferPptIntent({ ...slide, visual_spec: { type: "none" } }, slideIndex, slideCount);
  return {
    cover: "none", agenda: "cards", closing: "none", timeline: "timeline", evidence: "evidence",
    comparison: "comparison", data: "data", cards: "cards", summary: "statement", image: "image", content: "narrative",
  }[role] || "narrative";
}

function visualLabel(text, index) {
  const candidate = String(text || "").split(/[:：。；;]/)[0].replace(/^\d+[.、．]\s*/, "").trim();
  return safeExcerpt(candidate || `要点 ${index + 1}`, 18);
}

function validContentRefs(refs, lines) {
  return [...new Set((Array.isArray(refs) ? refs : []).map(String).filter((ref) => {
    const match = ref.match(/^content:(\d+)$/);
    return match && Number(match[1]) >= 1 && Number(match[1]) <= lines.length;
  }))];
}

function normalizeSlideVisual(slide = {}, slideIndex = 0, slideCount = 1) {
  const lines = contentLines(slide);
  const raw = slide.visual_spec || {};
  let requestedType = visualTypes.includes(raw.type) ? raw.type : defaultVisualType(slide, slideIndex, slideCount);
  if (requestedType === "cards" && !["目录"].includes(slide.type) && (lines.length < 2 || lines.length > 4)) requestedType = "narrative";
  const type = lines.length || ["none", "image"].includes(requestedType) ? requestedType : "none";
  const usedRefs = new Set();
  const items = type === "none" ? [] : (Array.isArray(raw.items) ? raw.items : []).slice(0, 10).map((item, itemIndex) => {
    let refs = validContentRefs(item.source_refs, lines).filter((ref) => !usedRefs.has(ref));
    if (!refs.length) {
      const nextRef = lines.map((_, lineIndex) => `content:${lineIndex + 1}`).find((ref) => !usedRefs.has(ref));
      if (nextRef) refs = [nextRef];
    }
    refs.forEach((ref) => usedRefs.add(ref));
    const resolved = refs.map((ref) => lines[Number(ref.split(":")[1]) - 1]).filter(Boolean);
    return {
      id: `v${slideIndex}-i${itemIndex}`,
      label: safeExcerpt(item.label || visualLabel(resolved[0], itemIndex), 32),
      value: resolved[0] || "",
      detail: resolved.slice(1).join("\n"),
      tone: visualTones.includes(item.tone) ? item.tone : "neutral",
      source_refs: refs,
    };
  }).filter((item) => item.source_refs.length);
  if (type !== "none") {
    lines.forEach((line, lineIndex) => {
      const ref = `content:${lineIndex + 1}`;
      if (usedRefs.has(ref)) return;
      items.push({
        id: `v${slideIndex}-i${items.length}`,
        label: visualLabel(line, lineIndex),
        value: line,
        detail: "",
        tone: "neutral",
        source_refs: [ref],
      });
    });
  }
  const columns = (Array.isArray(raw.columns) ? raw.columns : []).map((item) => safeExcerpt(item, 24)).filter(Boolean).slice(0, 8);
  const rows = (Array.isArray(raw.rows) ? raw.rows : []).slice(0, 12).map((row, rowIndex) => {
    const sourceRefs = validContentRefs(row.source_refs, lines);
    return {
      label: safeExcerpt(row.label || `数据行 ${rowIndex + 1}`, 32),
      values: sourceRefs.map((ref) => lines[Number(ref.split(":")[1]) - 1]).filter(Boolean).slice(0, Math.max(1, columns.length)),
      tone: visualTones.includes(row.tone) ? row.tone : "neutral",
      source_refs: sourceRefs,
    };
  }).filter((row) => row.source_refs.length);
  return {
    ...slide,
    task_id: `P${String(slideIndex + 1).padStart(2, "0")}`,
    page_no: slideIndex + 1,
    visual_spec: {
      type,
      title: String(raw.title || slide.title || "").trim(),
      hierarchy: visualHierarchies.includes(raw.hierarchy) ? raw.hierarchy : type === "comparison" ? "left-right" : ["timeline", "algorithm"].includes(type) ? "sequence" : ["data", "kpi", "chart", "table"].includes(type) ? "metric-insight" : type === "statement" ? "title-lead-detail" : "title-body",
      density: visualDensities.includes(raw.density) ? raw.density : lines.length >= 5 ? "dense" : lines.length <= 2 ? "breathing" : "balanced",
      items,
      columns,
      rows,
    },
  };
}

function balanceDeckVisuals(slides = []) {
  const normalized = slides.map((slide, index) => normalizeSlideVisual(slide, index, slides.length));
  const contentIndexes = normalized.map((slide, index) => slide.type === "内容页" ? index : -1).filter((index) => index >= 0);
  let cardStreak = 0;
  contentIndexes.forEach((index) => {
    const slide = normalized[index];
    if (slide.visual_spec.type !== "cards") { cardStreak = 0; return; }
    cardStreak += 1;
    if (cardStreak > 2) {
      slide.visual_spec.type = "narrative";
      slide.visual_spec.hierarchy = "title-lead-detail";
      cardStreak = 0;
    }
  });
  if (contentIndexes.length >= 5) {
    const maximumCards = Math.max(1, Math.floor(contentIndexes.length * 0.4));
    const cardIndexes = contentIndexes.filter((index) => normalized[index].visual_spec.type === "cards");
    cardIndexes.slice(maximumCards).forEach((index) => {
      normalized[index].visual_spec.type = "narrative";
      normalized[index].visual_spec.hierarchy = "title-lead-detail";
    });
  }
  return normalized;
}

function templateLayoutProfiles(template) {
  const files = fs.readdirSync(template.templateDir).filter((name) => name.endsWith(".svg"));
  const hasBundledMedia = template.imagesDir && fs.existsSync(template.imagesDir)
    && fs.readdirSync(template.imagesDir).some((name) => !name.startsWith("."))
    || files.some((name) => /<image\b[^>]*href="data:image\//i.test(fs.readFileSync(path.join(template.templateDir, name), "utf8")));
  return template.pageTypes.map((key) => {
    const hint = LAYOUT_PROFILE_HINTS.find((item) => item.pattern.test(key)) || LAYOUT_PROFILE_HINTS.at(-1);
    const file = files.find((name) => name.replace(/^\d+_/, "").replace(/\.svg$/i, "") === key);
    const svg = file ? fs.readFileSync(path.join(template.templateDir, file), "utf8") : "";
    const tokens = [...new Set([...svg.matchAll(/\{\{([A-Z0-9_]+)\}\}/g)].map((match) => match[1]))];
    const textSlots = tokens.filter((token) => !/^(TITLE|PAGE_TITLE|CHAPTER_TITLE|CLOSING_MESSAGE|THANK_YOU|SECTION_NAME)$/.test(token));
    return {
      key,
      roles: hint.roles,
      purpose: hint.purpose,
      textSlotCount: textSlots.length,
      mediaRequired: Boolean(hint.mediaRequired && !hasBundledMedia),
      supportedSlots: [...new Set(textSlots.map((token) => {
        if (/^STEP_/.test(token)) return "timeline";
        if (/^(ITEM|CARD|BLOCK|KPI|QUADRANT)_|^TOC_ITEM_/.test(token)) return "item";
        if (/^(LEFT_CONTENT|TOP_CONTENT)$/.test(token)) return "left";
        if (/^(RIGHT_CONTENT|BOTTOM_CONTENT)$/.test(token)) return "right";
        if (/^(SUBTITLE|CHAPTER_DESC|CHAPTER_SUBTITLE|ENDING_SUBTITLE|CONTACT_LINE)$/.test(token)) return "subtitle";
        if (/^(KEY_MESSAGE|SUPPORT_TEXT|QUOTE_TEXT|CAPTION|ANNOTATION)/.test(token)) return "lead";
        return "body";
      }))],
    };
  });
}

function pptDesignSources(slides = []) {
  return slides.map((slide, slideIndex) => {
    const normalizedSlide = normalizeSlideVisual(slide, slideIndex, slides.length);
    const visualItems = normalizedSlide.visual_spec.items.map((item) => ({
      ...item,
      blockIds: item.source_refs.map((ref) => `s${slideIndex}-b${Number(ref.split(":")[1]) - 1}`),
    }));
    const visualByBlock = new Map(visualItems.flatMap((item) => item.blockIds.map((blockId) => [blockId, item])));
    const blocks = String(normalizedSlide.content || "").replace(/\r/g, "").split("\n")
      .map((text) => text.trim())
      .filter(Boolean)
      .map((text, blockIndex) => {
        const id = `s${slideIndex}-b${blockIndex}`;
        const visual = visualByBlock.get(id);
        return { id, text, visualItemId: visual?.id || "", visualLabel: visual?.label || "", tone: visual?.tone || "neutral" };
      });
    const joined = blocks.map((block) => block.text).join("\n");
    return {
      slideIndex,
      taskId: normalizedSlide.task_id,
      pageNo: normalizedSlide.page_no,
      type: normalizedSlide.type || "内容页",
      intent: inferPptIntent(normalizedSlide, slideIndex, slides.length),
      title: String(normalizedSlide.title || `第 ${slideIndex + 1} 页`),
      extra: String(normalizedSlide.extra || ""),
      visualSpec: { ...normalizedSlide.visual_spec, items: visualItems },
      features: {
        blockCount: blocks.length,
        hasNumbers: /\d/.test(joined),
        hasReferences: /PMID|文献|指南|证据/.test(joined),
        hasMedia: Boolean(normalizedSlide.imageUrl || normalizedSlide.image || (Array.isArray(normalizedSlide.images) && normalizedSlide.images.length)),
      },
      blocks,
    };
  });
}

const modelSettings = () => {
  const useSharedReviewModel = Boolean(process.env.MODEL_API_KEY);
  return {
    apiKey: process.env.MODEL_API_KEY || process.env.OPENAI_API_KEY || "",
    baseUrl: (process.env.MODEL_BASE_URL || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, ""),
    model: process.env.MODEL_NAME || process.env.OPENAI_MODEL || "gpt-5.4",
    timeoutMs: Number(process.env.MODEL_TIMEOUT_MS || 120000),
    maxTokens: Number(process.env.MODEL_MAX_TOKENS || 5000),
    apiStyle: useSharedReviewModel ? "chat_completions" : "responses",
    demoMode: process.env.CLINPAPER_DEMO_MODE === "1",
  };
};

const pubmedSettings = () => {
  const timeoutMs = Number(process.env.PUBMED_TIMEOUT_MS || 30000);
  const configuredMax = Number(process.env.PUBMED_MAX_RESULTS || 30);
  return {
    baseUrl: (process.env.PUBMED_BASE_URL || "https://eutils.ncbi.nlm.nih.gov/entrez/eutils").replace(/\/+$/, ""),
    apiKey: process.env.NCBI_API_KEY || "",
    email: process.env.NCBI_EMAIL || "",
    tool: process.env.NCBI_TOOL || "clinpaper-case-ppt-demo",
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 30000,
    maxResults: Number.isFinite(configuredMax) && configuredMax > 0 ? Math.min(configuredMax, 100) : 30,
  };
};

const crossrefSettings = () => ({
  baseUrl: (process.env.CROSSREF_BASE_URL || "https://api.crossref.org").replace(/\/+$/, ""),
  timeoutMs: Math.max(5000, Number(process.env.CROSSREF_TIMEOUT_MS || 20000)),
  email: process.env.CROSSREF_EMAIL || process.env.NCBI_EMAIL || "",
});

const CMA_DEMO_RECORDS = [
  {
    recordKey: "cma:10.3760/cma.j.cn112137-20241230-02964",
    sourceRecordId: "10.3760/cma.j.cn112137-20241230-02964",
    title: "遗传性聋外科治疗专家共识",
    journal: "中华医学杂志",
    year: "2025",
    volume: "105",
    issue: "10",
    pages: "",
    authors: ["国家耳鼻咽喉疾病临床医学研究中心", "中华医学会医学遗传学分会", "中国耳聋基因筛查与诊断临床多中心研究协作组"],
    publicationTypes: ["Consensus"],
    language: "chi",
    doi: "10.3760/cma.j.cn112137-20241230-02964",
    pmid: "",
    abstract: "",
    source: "中华医学期刊网",
    sourceUrl: "https://cs.medjournals.cn/cn/zhyxzz/toc/65361",
    verified: true,
    demoVerified: true,
  },
  {
    recordKey: "cma:10.3760/cma.j.cn112137-20251221-03372",
    sourceRecordId: "10.3760/cma.j.cn112137-20251221-03372",
    title: "技术创新与政策实施并行 推动医药融合发展",
    journal: "中华医学杂志",
    year: "2026",
    volume: "106",
    issue: "1",
    pages: "",
    authors: ["曹雪涛"],
    publicationTypes: ["Editorial"],
    language: "chi",
    doi: "10.3760/cma.j.cn112137-20251221-03372",
    pmid: "",
    abstract: "",
    source: "中华医学期刊网",
    sourceUrl: "https://cs.medjournals.cn/cn/zhyxzz/toc/71240",
    verified: true,
    demoVerified: true,
  },
  {
    recordKey: "cma:10.3760/cma.j.cn112137-20250725-01849",
    sourceRecordId: "10.3760/cma.j.cn112137-20250725-01849",
    title: "人工智能在前交叉韧带损伤诊治中应用的研究进展",
    journal: "中华医学杂志",
    year: "2026",
    volume: "106",
    issue: "1",
    pages: "",
    authors: ["雷蕾", "陈德生", "勾禹", "王同富", "朱佳旺", "郭新静"],
    publicationTypes: ["Review"],
    language: "chi",
    doi: "10.3760/cma.j.cn112137-20250725-01849",
    pmid: "",
    abstract: "",
    source: "中华医学期刊网",
    sourceUrl: "https://cs.medjournals.cn/cn/zhyxzz/toc/71240",
    verified: true,
    demoVerified: true,
  },
];

let lastPubmedRequestAt = 0;

function pubmedRequestUrl(endpoint, params = {}) {
  const settings = pubmedSettings();
  const search = new URLSearchParams({ ...params, tool: settings.tool });
  if (settings.email) search.set("email", settings.email);
  if (settings.apiKey) search.set("api_key", settings.apiKey);
  return `${settings.baseUrl}/${endpoint}?${search.toString()}`;
}

async function waitForPubmedSlot() {
  const settings = pubmedSettings();
  const minimumInterval = settings.apiKey ? 120 : 350;
  const wait = Math.max(0, minimumInterval - (Date.now() - lastPubmedRequestAt));
  if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
  lastPubmedRequestAt = Date.now();
}

async function requestPubmed(endpoint, params, responseType = "json") {
  const settings = pubmedSettings();
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await waitForPubmedSlot();
    try {
      const response = await fetch(pubmedRequestUrl(endpoint, params), {
        headers: {
          Accept: responseType === "json" ? "application/json" : "application/xml",
          "User-Agent": "ClinPaper-Case-PPT-Demo/1.0",
        },
        signal: AbortSignal.timeout(settings.timeoutMs),
      });
      if (!response.ok) {
        const error = new Error(`PubMed 接口返回 ${response.status}`);
        error.retryable = response.status === 429 || response.status >= 500;
        throw error;
      }
      return responseType === "json" ? response.json() : response.text();
    } catch (error) {
      lastError = error;
      if (error.name === "TimeoutError" || error.name === "AbortError") lastError = new Error("PubMed 请求超时，请稍后重试");
      if (attempt === 0 && (error.retryable || error.name === "TimeoutError" || error.name === "AbortError")) continue;
      break;
    }
  }
  throw lastError || new Error("PubMed 请求失败");
}

function parsePubmedArticleXml(xml) {
  const $ = loadHtml(xml, { xmlMode: true });
  const records = new Map();
  $("PubmedArticle").each((_, element) => {
    const article = $(element);
    const pmid = article.find("MedlineCitation > PMID").first().text().trim();
    if (!pmid) return;
    const abstract = article.find("Abstract AbstractText").toArray().map((node) => {
      const text = $(node).text().replace(/\s+/g, " ").trim();
      const label = $(node).attr("Label") || $(node).attr("NlmCategory");
      return text ? (label ? `${label}: ${text}` : text) : "";
    }).filter(Boolean).join("\n\n");
    const authors = article.find("AuthorList > Author").toArray().map((node) => {
      const author = $(node);
      const collective = author.find("CollectiveName").first().text().trim();
      if (collective) return collective;
      return [author.find("LastName").first().text().trim(), author.find("Initials").first().text().trim()].filter(Boolean).join(" ");
    }).filter(Boolean);
    const publicationTypes = article.find("PublicationTypeList PublicationType").toArray().map((node) => $(node).text().trim()).filter(Boolean);
    const publicationDate = article.find("Journal PubDate").first().text().replace(/\s+/g, " ").trim();
    const language = article.find("MedlineCitation Article Language").first().text().trim();
    const pmc = article.find('ArticleIdList ArticleId[IdType="pmc"]').first().text().trim();
    records.set(pmid, {
      recordKey: `pmid:${pmid}`,
      sourceRecordId: pmid,
      pmid,
      title: article.find("ArticleTitle").first().text().replace(/\s+/g, " ").trim(),
      journal: article.find("Journal Title").first().text().replace(/\s+/g, " ").trim(),
      year: article.find("Journal PubDate Year").first().text().trim() || publicationDate.match(/\b\d{4}\b/)?.[0] || "",
      publicationDate,
      volume: article.find("Journal JournalIssue Volume").first().text().trim(),
      issue: article.find("Journal JournalIssue Issue").first().text().trim(),
      pages: article.find("MedlinePgn").first().text().trim(),
      abstract,
      authors,
      publicationTypes,
      language,
      pmc,
      openAccess: Boolean(pmc),
      doi: article.find('ArticleIdList ArticleId[IdType="doi"]').first().text().trim(),
      source: "PubMed",
      sourceUrl: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
      verified: true,
    });
  });
  return records;
}

async function fetchPubmedRecords(ids) {
  if (!ids.length) return [];
  const summary = await requestPubmed("esummary.fcgi", { db: "pubmed", id: ids.join(","), retmode: "json" });
  const xmlRecords = parsePubmedArticleXml(await requestPubmed("efetch.fcgi", { db: "pubmed", id: ids.join(","), retmode: "xml" }, "xml"));
  const summaryItems = summary?.result || {};
  return ids.map((pmid) => {
    const record = xmlRecords.get(pmid) || { recordKey: `pmid:${pmid}`, sourceRecordId: pmid, pmid, source: "PubMed", sourceUrl: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`, verified: true };
    const summaryItem = summaryItems[pmid] || {};
    const articleIds = Array.isArray(summaryItem.articleids) ? summaryItem.articleids : [];
    return {
      ...record,
      title: record.title || summaryItem.title || "",
      journal: record.journal || summaryItem.fulljournalname || summaryItem.source || "",
      year: record.year || String(summaryItem.pubdate || summaryItem.sortpubdate || "").match(/\b\d{4}\b/)?.[0] || "",
      authors: record.authors?.length ? record.authors : (summaryItem.authors || []).map((author) => author.name).filter(Boolean),
      publicationTypes: record.publicationTypes?.length ? record.publicationTypes : (summaryItem.pubtype || []),
      language: record.language || "",
      pmc: record.pmc || articleIds.find((item) => item.idtype === "pmc")?.value || "",
      openAccess: Boolean(record.pmc || articleIds.find((item) => item.idtype === "pmc")?.value),
      doi: record.doi || articleIds.find((item) => item.idtype === "doi")?.value || "",
      abstract: record.abstract || "",
      retrievedAt: new Date().toISOString(),
      selected: true,
    };
  });
}

async function searchPubmedRecords({ queries = [], maxResults } = {}) {
  const settings = pubmedSettings();
  const normalizedQueries = [...new Set(queries.map((query) => String(query || "").trim()).filter(Boolean))].slice(0, 6);
  if (!normalizedQueries.length) throw new Error("缺少可用的 PubMed 检索式");
  const requestedLimit = Number(maxResults);
  const limit = Number.isFinite(requestedLimit) && requestedLimit > 0 ? Math.max(1, Math.min(requestedLimit, settings.maxResults)) : settings.maxResults;
  const ids = [];
  const idQueries = new Map();
  let matchedCount = 0;
  for (const query of normalizedQueries) {
    const payload = await requestPubmed("esearch.fcgi", { db: "pubmed", term: query, retmode: "json", retmax: String(Math.max(5, Math.ceil(limit / normalizedQueries.length))), sort: "relevance" });
    const result = payload?.esearchresult || {};
    matchedCount += Number(result.count || 0);
    for (const pmid of result.idlist || []) {
      if (!idQueries.has(pmid)) idQueries.set(pmid, query);
      if (!ids.includes(pmid)) ids.push(pmid);
    }
  }
  const items = (await fetchPubmedRecords(ids.slice(0, limit))).map((item) => ({ ...item, query: idQueries.get(item.pmid) || normalizedQueries[0] }));
  return { items, total: items.length, matchedCount, queries: normalizedQueries, source: "PubMed", searchedAt: new Date().toISOString() };
}

const normalizeDoi = (value) => String(value || "")
  .trim()
  .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")
  .replace(/^doi\s*:\s*/i, "")
  .replace(/[\s\]}>),.;，。；：]+$/g, "")
  .toLowerCase();

const normalizeLookupText = (value) => String(value || "")
  .normalize("NFKC")
  .toLowerCase()
  .replace(/[《》“”‘’"'()（）\[\]【】.,，。:：;；!?！？\s]+/g, "")
  .trim();

function fallbackSpecificPlan(topic) {
  const raw = String(topic || "").trim();
  const doi = normalizeDoi(raw.match(/(?:https?:\/\/(?:dx\.)?doi\.org\/|doi\s*[:：]?\s*)?(10\.\d{4,9}\/[A-Za-z0-9._;()/:+-]+)/i)?.[1] || "");
  const pmid = raw.match(/(?:PMID\s*[:：]?\s*)(\d{5,9})/i)?.[1] || (/^\d{5,9}$/.test(raw) ? raw : "");
  const rawWithoutIdentifiers = raw
    .replace(/(?:https?:\/\/(?:dx\.)?doi\.org\/|doi\s*[:：]?\s*)?10\.\d{4,9}\/[A-Za-z0-9._;()/:+-]+/ig, " ")
    .replace(/PMID\s*[:：]?\s*\d{5,9}/ig, " ");
  const quoted = [...raw.matchAll(/《([^》]+)》/g)].map((match) => match[1].trim()).filter(Boolean);
  let journal = "";
  let title = "";
  if (quoted.length >= 2) [journal, title] = quoted;
  else if (quoted.length === 1) {
    if (/杂志|学报|期刊|journal/i.test(quoted[0])) journal = quoted[0];
    else title = quoted[0];
  }
  title ||= raw.match(/(?:题名|标题|文献)\s*[:：]\s*([^，,；;]+)/)?.[1]?.trim() || "";
  journal ||= raw.match(/(?:期刊|刊名)\s*[:：]\s*([^，,；;]+)/)?.[1]?.trim() || "";
  const year = rawWithoutIdentifiers.match(/(?:19|20)\d{2}/)?.[0] || "";
  const volume = raw.match(/第?\s*(\d+)\s*卷/)?.[1] || "";
  const issue = raw.match(/第?\s*(\d+)\s*期/)?.[1] || "";
  const pages = raw.match(/(?:页码|页)\s*[:：]?\s*([A-Za-z]?\d+(?:\s*[-–—]\s*[A-Za-z]?\d+)?)/)?.[1]?.replace(/\s/g, "") || "";
  const author = raw.match(/(?:作者|第一作者)\s*[:：]\s*([^，,；;\s]+)/)?.[1]?.trim()
    || raw.match(/([\u4e00-\u9fff]{2,4})(?=发表(?:的|之)?文献|撰写(?:的|之)?文献)/)?.[1]?.trim()
    || "";
  const sourceRecordId = raw.match(/(?:来源记录|数据库文献标识)\s*[:：]\s*([^，,；;\s]+)/)?.[1]?.trim() || "";
  const titleTerms = [...new Set((raw.match(/题目?(?:中)?(?:包含|含有)\s*[“\"《]?([^”\"》]+)[”\"》]?/)?.[1] || "").split(/[、,，和与\s]+/).map((item) => item.trim()).filter(Boolean))];
  const hasSpecificCue = Boolean(doi || pmid || title || journal || author || volume || issue || pages || sourceRecordId || /某篇|这篇|找回|特定文献|参考文献|发表在/.test(raw));
  const priority = doi || pmid || title ? "P0" : hasSpecificCue ? "P1" : "";
  return {
    mode: hasSpecificCue ? "specific" : "topic",
    priority,
    identifierType: pmid ? "pmid" : doi ? "doi" : sourceRecordId ? "source" : "none",
    pmid, doi, sourceRecordId, title, journal, author, year, volume, issue, pages, titleTerms,
    intentSummary: hasSpecificCue ? `已识别为${priority}特定文献查找，将使用用户提供的题录线索定位候选文献。` : "已识别为主题查找。",
  };
}

async function requestCrossref(pathname, params = {}) {
  const settings = crossrefSettings();
  const search = new URLSearchParams(params);
  if (settings.email) search.set("mailto", settings.email);
  const suffix = search.size ? `?${search.toString()}` : "";
  const response = await fetch(`${settings.baseUrl}${pathname}${suffix}`, {
    headers: { Accept: "application/json", "User-Agent": "ClinPaper-Demo/1.0" },
    signal: AbortSignal.timeout(settings.timeoutMs),
  });
  if (!response.ok) throw new Error(`Crossref 接口返回 ${response.status}`);
  return response.json();
}

function crossrefRecord(item = {}) {
  const doi = normalizeDoi(item.DOI || "");
  const title = Array.isArray(item.title) ? item.title[0] : item.title;
  const journal = Array.isArray(item["container-title"]) ? item["container-title"][0] : item["container-title"];
  const dateParts = item.published?.["date-parts"]?.[0] || item.issued?.["date-parts"]?.[0] || [];
  const authors = (item.author || []).map((author) => [author.family, author.given].filter(Boolean).join(" ")).filter(Boolean);
  const recordKey = doi ? `doi:${doi}` : `crossref:${item.URL || normalizeLookupText(`${title}-${journal}-${dateParts[0] || ""}`)}`;
  return {
    recordKey,
    sourceRecordId: doi || String(item.URL || ""),
    pmid: "",
    doi,
    title: String(title || "").replace(/<[^>]+>/g, "").trim(),
    journal: String(journal || "").trim(),
    year: String(dateParts[0] || ""),
    volume: String(item.volume || ""),
    issue: String(item.issue || ""),
    pages: String(item.page || item["article-number"] || ""),
    authors,
    publicationTypes: [String(item.type || "Journal Article")],
    language: String(item.language || ""),
    abstract: String(item.abstract || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
    openAccess: false,
    source: "Crossref",
    sourceUrl: String(item.URL || (doi ? `https://doi.org/${doi}` : "")),
    verified: true,
    selected: false,
  };
}

async function searchCrossrefSpecific(plan, limit = 20) {
  if (plan.doi) {
    try {
      const payload = await requestCrossref(`/works/${encodeURIComponent(plan.doi)}`);
      return payload?.message ? [crossrefRecord(payload.message)] : [];
    } catch (error) {
      if (/404/.test(error.message)) return [];
      throw error;
    }
  }
  const params = { rows: String(Math.max(1, Math.min(limit, 20))) };
  const bibliographic = [plan.title, ...(plan.titleTerms || []), plan.journal, plan.author, plan.year, plan.volume, plan.issue, plan.pages].filter(Boolean).join(" ");
  if (!bibliographic) return [];
  params["query.bibliographic"] = bibliographic;
  if (plan.title) params["query.title"] = plan.title;
  if (plan.journal) params["query.container-title"] = plan.journal;
  if (plan.author) params["query.author"] = plan.author;
  if (plan.year) params.filter = `from-pub-date:${plan.year}-01-01,until-pub-date:${plan.year}-12-31`;
  const payload = await requestCrossref("/works", params);
  return (payload?.message?.items || []).map(crossrefRecord).filter((item) => item.title);
}

function cmaDemoMatches(plan) {
  const titleNeedle = normalizeLookupText(plan.title);
  const journalNeedle = normalizeLookupText(plan.journal);
  const authorNeedle = normalizeLookupText(plan.author);
  const termNeedles = (plan.titleTerms || []).map(normalizeLookupText).filter(Boolean);
  return CMA_DEMO_RECORDS.filter((item) => {
    if (plan.doi && normalizeDoi(item.doi) !== plan.doi) return false;
    if (plan.sourceRecordId && normalizeLookupText(item.sourceRecordId) !== normalizeLookupText(plan.sourceRecordId)) return false;
    if (titleNeedle && !normalizeLookupText(item.title).includes(titleNeedle) && !titleNeedle.includes(normalizeLookupText(item.title))) return false;
    if (journalNeedle && !normalizeLookupText(item.journal).includes(journalNeedle) && !journalNeedle.includes(normalizeLookupText(item.journal))) return false;
    if (authorNeedle && !item.authors.some((author) => normalizeLookupText(author).includes(authorNeedle))) return false;
    if (plan.year && item.year !== plan.year) return false;
    if (plan.volume && item.volume !== plan.volume) return false;
    if (plan.issue && String(Number(item.issue)) !== String(Number(plan.issue))) return false;
    if (plan.pages && normalizeLookupText(item.pages) !== normalizeLookupText(plan.pages)) return false;
    if (termNeedles.length && !termNeedles.every((term) => normalizeLookupText(item.title).includes(term))) return false;
    return Boolean(plan.doi || plan.sourceRecordId || titleNeedle || journalNeedle || authorNeedle || plan.year || plan.volume || plan.issue || termNeedles.length);
  }).map((item) => ({ ...item, selected: false }));
}

function pubmedSpecificQuery(plan) {
  if (plan.pmid) return { ids: [plan.pmid], query: "" };
  const parts = [];
  if (plan.doi) parts.push(`"${plan.doi}"[AID]`);
  if (plan.title) parts.push(`"${String(plan.title).replaceAll('"', "")}"[Title]`);
  for (const term of plan.titleTerms || []) parts.push(`"${String(term).replaceAll('"', "")}"[Title]`);
  if (plan.journal) parts.push(`"${String(plan.journal).replaceAll('"', "")}"[Journal]`);
  if (plan.author) parts.push(`"${String(plan.author).replaceAll('"', "")}"[Author]`);
  if (plan.year) parts.push(`${plan.year}[PDAT]`);
  if (plan.volume) parts.push(`${plan.volume}[Volume]`);
  if (plan.issue) parts.push(`${plan.issue}[Issue]`);
  if (plan.pages) parts.push(`"${String(plan.pages).replaceAll('"', "")}"[Pagination]`);
  return { ids: [], query: parts.join(" AND ") };
}

function recordIdentity(item) {
  if (item.doi) return `doi:${normalizeDoi(item.doi)}`;
  if (item.pmid) return `pmid:${item.pmid}`;
  if (item.source && item.sourceRecordId) return `${normalizeLookupText(item.source)}:${normalizeLookupText(item.sourceRecordId)}`;
  return `title:${normalizeLookupText(item.title)}:${normalizeLookupText(item.journal)}:${item.year || ""}`;
}

function scoreSpecificRecord(item, plan) {
  let score = 0;
  const reasons = [];
  if (plan.pmid && item.pmid === plan.pmid) { score += 120; reasons.push("PMID 精确匹配"); }
  if (plan.doi && normalizeDoi(item.doi) === plan.doi) { score += 120; reasons.push("DOI 精确匹配"); }
  if (plan.sourceRecordId && normalizeLookupText(item.sourceRecordId) === normalizeLookupText(plan.sourceRecordId)) { score += 120; reasons.push("来源记录标识精确匹配"); }
  const title = normalizeLookupText(item.title);
  const wantedTitle = normalizeLookupText(plan.title);
  if (wantedTitle && title === wantedTitle) { score += 70; reasons.push("完整题名匹配"); }
  else if (wantedTitle && (title.includes(wantedTitle) || wantedTitle.includes(title))) { score += 35; reasons.push("题名高度相似"); }
  const terms = (plan.titleTerms || []).map(normalizeLookupText).filter(Boolean);
  const hitTerms = terms.filter((term) => title.includes(term));
  if (hitTerms.length) { score += hitTerms.length * 8; reasons.push(`题名词语匹配 ${hitTerms.length} 项`); }
  if (plan.journal && normalizeLookupText(item.journal) === normalizeLookupText(plan.journal)) { score += 18; reasons.push("期刊匹配"); }
  if (plan.author && (item.authors || []).some((author) => normalizeLookupText(author).includes(normalizeLookupText(plan.author)))) { score += 12; reasons.push("作者匹配"); }
  if (plan.year && item.year === plan.year) { score += 8; reasons.push("年份匹配"); }
  if (plan.volume && String(Number(item.volume)) === String(Number(plan.volume))) { score += 5; reasons.push("卷匹配"); }
  if (plan.issue && String(Number(item.issue)) === String(Number(plan.issue))) { score += 5; reasons.push("期匹配"); }
  if (plan.pages && normalizeLookupText(item.pages) === normalizeLookupText(plan.pages)) { score += 6; reasons.push("页码匹配"); }
  return { score, reasons };
}

async function searchSpecificLiterature(plan, rawQuery, maxResults = 20) {
  const records = [];
  const providerErrors = [];
  records.push(...cmaDemoMatches(plan));
  const pubmedLookup = pubmedSpecificQuery(plan);
  try {
    if (pubmedLookup.ids.length) records.push(...(await fetchPubmedRecords(pubmedLookup.ids)).filter((item) => item.title));
    else if (pubmedLookup.query) records.push(...(await searchPubmedRecords({ queries: [pubmedLookup.query], maxResults })).items);
  } catch (error) {
    providerErrors.push(`PubMed：${safeExcerpt(error.message, 100)}`);
  }
  try {
    records.push(...await searchCrossrefSpecific(plan, maxResults));
  } catch (error) {
    providerErrors.push(`Crossref：${safeExcerpt(error.message, 100)}`);
  }
  const deduped = new Map();
  for (const record of records) {
    const identity = recordIdentity(record);
    const current = deduped.get(identity);
    if (!current) {
      deduped.set(identity, { ...record, recordKey: identity, sources: [record.source].filter(Boolean) });
      continue;
    }
    deduped.set(identity, {
      ...record,
      ...current,
      recordKey: identity,
      pmid: current.pmid || record.pmid || "",
      doi: current.doi || record.doi || "",
      abstract: current.abstract || record.abstract || "",
      pages: current.pages || record.pages || "",
      authors: current.authors?.length ? current.authors : record.authors,
      publicationTypes: [...new Set([...(current.publicationTypes || []), ...(record.publicationTypes || [])])],
      openAccess: Boolean(current.openAccess || record.openAccess),
      sources: [...new Set([...(current.sources || [current.source]), record.source].filter(Boolean))],
    });
  }
  const requiresTextMatch = Boolean(plan.title || (plan.titleTerms || []).length || plan.journal || plan.author);
  const scored = [...deduped.values()].map((item) => {
    const match = scoreSpecificRecord(item, plan);
    return { ...item, matchScore: match.score, matchReasons: match.reasons, selected: false, recordKey: item.recordKey || recordIdentity(item) };
  }).filter((item) => {
    if (!(item.matchScore > 0 || plan.pmid || plan.doi)) return false;
    if (!requiresTextMatch) return true;
    return item.matchReasons.some((reason) => /题名|期刊|作者/.test(reason));
  }).sort((a, b) => b.matchScore - a.matchScore).slice(0, Math.max(1, Math.min(Number(maxResults) || 20, 30)));
  const exactIdentifier = Boolean(plan.pmid || plan.doi || plan.sourceRecordId) && scored[0]?.matchScore >= 120;
  const exactTitle = Boolean(plan.title) && scored[0]?.matchReasons.includes("完整题名匹配") && (!plan.journal || scored[0]?.matchReasons.includes("期刊匹配"));
  const unique = plan.priority === "P0" && scored.length === 1 && (exactIdentifier || exactTitle);
  const resultStatus = unique ? "unique" : scored.length ? "candidates" : "not_found";
  return {
    items: scored,
    total: scored.length,
    matchedCount: scored.length,
    source: [...new Set(scored.map((item) => item.source).filter(Boolean))].join(" + ") || "文献事实源",
    searchedAt: new Date().toISOString(),
    resultStatus,
    confirmedRecordKey: "",
    providerErrors,
    rawQuery,
    plan,
  };
}

let modelHealthCache = { expiresAt: 0, reachable: false };

async function getModelHealth() {
  const settings = modelSettings();
  const configured = Boolean(settings.apiKey) && !settings.demoMode;
  if (!configured) return { configured: false, reachable: false, model: settings.model };
  if (modelHealthCache.expiresAt > Date.now()) return { configured: true, reachable: modelHealthCache.reachable, model: settings.model };
  try {
    const response = await fetch(`${settings.baseUrl}/models`, {
      headers: { Authorization: `Bearer ${settings.apiKey}` },
      signal: AbortSignal.timeout(3000),
    });
    modelHealthCache = { expiresAt: Date.now() + 30_000, reachable: response.ok };
  } catch {
    modelHealthCache = { expiresAt: Date.now() + 30_000, reachable: false };
  }
  return { configured: true, reachable: modelHealthCache.reachable, model: settings.model };
}

function decodeUploadFileName(fileName) {
  const value = String(fileName || "");
  const isLatin1Bytes = [...value].every((character) => character.codePointAt(0) <= 0xff);
  if (!isLatin1Bytes) return value;
  const decoded = Buffer.from(value, "latin1").toString("utf8");
  return decoded.includes("\ufffd") ? value : decoded;
}

async function extractImageTextWithModel(file) {
  const settings = modelSettings();
  if (!settings.apiKey || settings.demoMode) throw new Error("模型未配置，暂时无法识别图片文字");
  if (file.size > 10 * 1024 * 1024) throw new Error("图片超过 10MB，暂时无法进行文字识别");
  const response = await fetch(`${settings.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${settings.apiKey}` },
    body: JSON.stringify({
      model: settings.model,
      temperature: 0,
      max_tokens: Math.min(settings.maxTokens, 5000),
      messages: [
        { role: "system", content: "你是医疗资料文字识别助手。逐字提取图片中可见的中文、英文、数字、日期、单位和表格内容；保持原始事实，不推断、不补写。只输出识别到的文本。" },
        {
          role: "user",
          content: [
            { type: "text", text: `请识别病例资料图片“${decodeUploadFileName(file.originalname)}”中的全部可读文字。` },
            { type: "image_url", image_url: { url: `data:${file.mimetype || "image/png"};base64,${file.buffer.toString("base64")}` } },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(settings.timeoutMs),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || `图片识别接口返回 ${response.status}`);
  const content = payload.choices?.[0]?.message?.content;
  return String(Array.isArray(content) ? content.map((item) => item?.text || "").join("\n") : content || "").trim().slice(0, 30_000);
}

async function extractMaterial(file) {
  const name = decodeUploadFileName(file.originalname);
  const extension = path.extname(name).toLowerCase();
  let text = "";
  let extraction = "local";
  if ([".txt", ".md", ".csv"].includes(extension)) {
    text = file.buffer.toString("utf8");
  } else if (extension === ".docx") {
    const result = await mammoth.extractRawText({ buffer: file.buffer });
    text = String(result.value || "");
  } else if (extension === ".pdf") {
    const result = await pdfParse(file.buffer);
    text = String(result.text || "");
    if (!text.trim()) throw new Error("PDF 中没有可提取文本，如为扫描件请转为图片后上传");
  } else if ([".png", ".jpg", ".jpeg", ".webp"].includes(extension)) {
    text = await extractImageTextWithModel(file);
    extraction = "model-vision";
  } else if (extension === ".doc") {
    throw new Error("旧版 Word 暂不支持解析，请另存为 .docx 后上传");
  } else {
    throw new Error("当前文件类型暂不支持内容提取");
  }
  text = text.replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, 30_000);
  if (!text) throw new Error("文件中没有提取到可读文字");
  return { name, type: extension.slice(1), size: file.size, text, characters: text.length, extraction };
}

function handleMaterialUpload(req, res) {
  return new Promise((resolve, reject) => {
    materialUpload.array("files", 10)(req, res, (error) => {
      if (!error) return resolve();
      if (error.code === "LIMIT_FILE_SIZE") return reject(new Error("单个病例资料不能超过 30MB"));
      if (error.code === "LIMIT_FILE_COUNT") return reject(new Error("一次最多上传 10 个病例资料文件"));
      return reject(error);
    });
  });
}

function fallback(action, context = {}) {
  const source = safeExcerpt(context.sourceText || context.caseText || "");
  const commonSections = [
    ["患者基本情况", "当前资料未包含可识别身份信息，年龄、性别及重要既往史待用户核对。", ["年龄与性别"], ["职业、用药史、过敏史"]],
    ["主诉", source ? `用户提供的病例摘要：${source}` : "主诉信息待补充。", source ? [] : ["主诉及持续时间"], []],
    ["现病史与病程", "已按用户资料整理现病史，具体症状演变及时间点需结合原始病历核对。", ["关键症状的起止时间"], ["诱因、伴随症状及就诊经过"]],
    ["体格检查", "当前资料中的生命体征和阳性体征待核对。", [], ["关键阴性体征"]],
    ["辅助检查", "检查结果只保留用户资料中出现的项目；未提供的数值不由 AI 补写。", ["关键检查日期与原始数值"], ["影像学结论与原图"]],
    ["诊断分析与鉴别诊断", "诊断结论及推理过程需由用户结合当前病例事实确认。", ["诊断依据"], ["鉴别诊断及排除依据"]],
    ["治疗经过与调整依据", "治疗方案、剂量、疗程和调整原因待从病例资料中核对。", ["药物名称、剂量与疗程"], ["治疗调整原因"]],
    ["治疗结果、随访及转归", "疗效、出院状态和随访结果待补充。", ["出院及随访结局"], ["复查时间与结果"]],
  ];

  if (action === "parse_case") return {
    projectTitle: "病例汇报 PPT",
    sections: commonSections.map(([title, content, missing, suggested]) => ({ title, content, missing, suggested })),
  };
  if (action === "timeline") return { events: [
    { date: "待核对", type: "起病病程", description: "出现主要症状，具体时间及演变需核对。", source: source || "用户尚未提供可引用的病例原文。", required: "补充起病时间" },
    { date: "待核对", type: "入院评估", description: "完成入院评估并识别核心临床问题。", source: "仅根据当前病例资料整理。", required: "补充入院日期和关键阳性结果" },
    { date: "待核对", type: "诊断确立", description: "结合症状、检查和鉴别诊断形成诊断。", source: "诊断依据需用户确认。", required: "补充确诊依据" },
    { date: "待核对", type: "治疗启动", description: "启动治疗并根据病情变化调整。", source: "治疗事实不得由外部文献替代。", required: "补充治疗方案、剂量和疗程" },
    { date: "待核对", type: "随访转诊", description: "记录疗效、转归和随访计划。", source: "随访结果待补充。", required: "补充转归和随访结果" },
  ] };
  if (action === "storylines") return { storylines: [
    { title: "从诊断线索到治疗决策：围绕核心临床问题复盘", recommended: true, reason: "能够把病例事实、关键检查、诊断推理和治疗选择串联起来，适合科室病例讨论。", core: "先呈现问题，再说明诊断证据与鉴别路径，最后讨论治疗决策、疗效和未解决问题。", boundary: "不根据缺失资料推断病因、疗效或长期预后；所有患者事实以当前病例资料为准。" },
    { title: "以关键转折点为主线的诊疗时间线复盘", recommended: false, reason: "适合突出病情变化和多次决策节点。", core: "围绕起病、恶化、确诊、治疗调整和随访五个节点组织内容。", boundary: "每个转折点需有明确时间和病例原文依据。" },
  ] };
  if (action === "outline") return {
    title: context.storylineTitle || "病例汇报：从诊断线索到治疗决策",
    sections: [
      { title: "病例概况", keyPoints: "基本情况、主诉、现病史和本次汇报要回答的核心问题。", evidenceNeed: "无" },
      { title: "诊疗经过", keyPoints: "按时间顺序呈现症状演变、评估、诊断和治疗节点。", evidenceNeed: "无" },
      { title: "关键检查", keyPoints: "突出直接影响诊断或治疗决策的实验室、影像和其他检查。", evidenceNeed: "检查适应证与诊断价值相关指南" },
      { title: "诊断分析", keyPoints: "说明诊断依据、鉴别诊断和排除路径。", evidenceNeed: "诊断标准、鉴别诊断指南或共识" },
      { title: "治疗决策与结局", keyPoints: "说明治疗选择、调整依据、疗效、转归和随访。", evidenceNeed: "治疗适应证、风险评估及随访建议" },
      { title: "讨论与反思", keyPoints: "结合医学依据讨论病例价值、决策边界和临床启示。", evidenceNeed: "同类病例或高质量综述" },
    ],
  };
  if (action === "evidence") return { topics: [
    { question: "诊断标准与鉴别诊断依据", summary: "将检索当前疾病相关的诊断标准、指南和鉴别诊断文献；检索结果仅用于一般医学依据。", queries: ["diagnosis guideline differential diagnosis"], citations: [] },
    { question: "治疗适应证、风险评估与方案选择", summary: "将检索治疗适应证、风险评估和方案选择证据；外部证据不能补写当前患者治疗事实。", queries: ["treatment indication risk assessment guideline"], citations: [] },
    { question: "同类病例与临床启示", summary: "将检索相关病例报告或病例系列，用于比较共同点和差异点。", queries: ["case report case series clinical lesson"], citations: [] },
  ] };
  if (action === "review_requirements") {
    const text = String(context.user_raw_text_json || context.rawText || "").trim();
    const medical = /癌|瘤|炎|结核|感染|诊断|治疗|疾病|患者|临床|医学|药物|手术|预后|卒中|高血压|糖尿病/.test(text);
    if (!medical) return { field_or_department: "", writing_type: "", core_question: "", research_points: { population_or_disease: "", theme_or_intervention_exposure: "", outcomes_or_focus: "" }, topic_risk: { notice: "当前输入暂未识别为医学主题，请补充疾病、人群或临床问题。" } };
    return { field_or_department: text.slice(0, 80) || "脊柱结核", writing_type: "叙述性综述", core_question: text.includes("？") ? text.split("？")[0] + "？" : `围绕${text.slice(0, 30)}梳理现有研究证据与临床适用边界？`, research_points: { population_or_disease: text.slice(0, 80) || "脊柱结核", theme_or_intervention_exposure: "诊断与鉴别诊断", outcomes_or_focus: "诊断表现、临床适用场景与证据边界" }, topic_risk: { notice: "医学事实和具体研究内容需以用户资料及后续文献核对为准。" } };
  }
  if (action === "review_directions") {
    const req = context.requirements || {};
    const subject = req.field_or_department || req.subject || "研究主题";
    return { exploration_directions: [
      { id: "direction-1", direction: `${subject}的诊断与识别`, direction_question: `如何在${subject}场景下提高早期识别准确性？`, why_explore: "直接回应核心问题，便于比较不同识别方法及适用边界。", recall_focus: ["早期识别线索", "诊断表现", "临床适用场景"], to_verify: ["研究对象与场景", "结局定义", "证据局限"], terms: `${subject}, diagnosis, early recognition`, en_query: `${subject} diagnosis early recognition clinical study`, cn_query: `${subject} 早期诊断 临床研究` },
      { id: "direction-2", direction: `${subject}的检测/干预方法比较`, direction_question: `不同方法在${subject}中的效果和局限有何差异？`, why_explore: "支持按方法和结局组织综述证据。", recall_focus: ["方法比较", "敏感度或效果", "样本与人群差异"], to_verify: ["比较对象", "测量结局", "偏倚与外部验证"], terms: `${subject}, method comparison, outcomes`, en_query: `${subject} method comparison outcomes clinical evidence`, cn_query: `${subject} 方法比较 临床证据` },
    ] };
  }
  if (action === "review_literature_analysis") {
    const dirs = context.selected_directions || [];
    const items = context.literature || context.items || [];
    return { analysis_markdown: `本报告仅基于当前筛选的 ${items.length} 篇文献批次，需逐篇核对研究对象、场景、结局和全文证据边界。`, categories: dirs.map((d) => ({ direction_id: d.id || "", category_name: d.direction || d.title || "研究方向", category_description: "当前批次文献聚类结果，不能替代全文核对。", literature_ids: items.slice(0, 8).map((item) => String(item.literatureId || item.id || item.pmid || "")).filter(Boolean) })) };
  }
  if (action === "review_topics") {
    const req = context.requirements || {};
    const subject = req.field_or_department || req.subject || "医学主题";
    return { candidates: [
      { title: `${subject}的诊断与临床识别路径`, zh_title: `${subject}的诊断与临床识别路径`, core_question: `现有证据如何支持${subject}的识别与方法选择？`, why: "覆盖核心问题并可按临床路径组织证据。", difference: "将不同方法放入同一临床决策场景比较。", support: "当前筛选文献批次", journal_fit: "临床医学与专科期刊", risk: { title: "证据边界", description: "当前批次不足以支持普遍性结论，需核对全文。" }, recommended: true },
      { title: `${subject}检测方法的表现与适用边界`, zh_title: `${subject}检测方法的表现与适用边界`, core_question: `不同检测方法在何种人群和场景下更适用？`, why: "便于按方法、样本和结局比较。", difference: "聚焦方法差异与适用性而非单一技术介绍。", support: "当前筛选文献批次", journal_fit: "诊断与方法学期刊", risk: { title: "范围风险", description: "需避免超出当前文献批次和用户确认范围。" }, recommended: false },
    ] };
  }
  if (action === "review_approaches") return { recommendations: [
    { name: "临床问题导向", scene: ["适合需要回答明确临床问题的综述"], pros: ["结构清晰", "便于连接证据与临床场景"], cons: ["需要严格控制范围"], outline_impact: ["按临床决策顺序组织章节"], recall_focus: ["诊断路径", "方法比较"], recommended: true },
    { name: "方法比较导向", scene: ["适合比较多种检测或干预方法"], pros: ["横向比较直观", "便于呈现差异"], cons: ["可能弱化临床流程"], outline_impact: ["按方法和结局分章"], recall_focus: ["比较研究", "准确性或效果"], recommended: false },
  ] };
  if (action === "review_outline") {
    const topic = context.topic?.zh_title || context.topic?.title || "医学综述主题";
    return { chapters: [
      { id: "chapter-1", title: "引言与问题范围", focus: `说明${topic}的背景、核心问题与讨论边界`, lit_need: "指南或共识\n疾病负担与临床问题研究", words: 800 },
      { id: "chapter-2", title: "研究方向与方法证据", focus: "按研究方向梳理主要方法、研究对象和结局", lit_need: "诊断或方法学研究\n系统综述与比较研究", words: 1200 },
      { id: "chapter-3", title: "临床适用场景与证据边界", focus: "比较不同场景下的适用性、不确定性和局限", lit_need: "外部验证研究\n局限与偏倚评价", words: 1000 },
      { id: "chapter-4", title: "总结与研究展望", focus: "总结当前证据并提出待验证问题", lit_need: "前瞻性或多中心研究\n研究空白与展望", words: 600 },
    ] };
  }
  if (action === "review_recall_plan") return { chapters: (context.chapters || []).map((chapter) => ({ chapter_id: chapter.id, queries: [String(chapter.lit_need || chapter.title || "医学综述").split("\n")[0]].filter(Boolean) })) };
  if (action === "review_section") {
    const chapter = context.chapter || {}; const ev = (context.evidence || []).slice(0, 4);
    return { chapter_id: chapter.id || "", title: chapter.title || "章节", markdown: `## ${chapter.title || "章节"}\n\n${chapter.focus || "基于当前确认的大纲组织本节内容。"}\n\n当前可引用文献：${ev.map((item) => `[literatureId:${item.literatureId || item.id || item.pmid}]`).join("、") || "暂无"}。`, evidence_ids: ev.map((item) => String(item.literatureId || item.id || item.pmid || "")).filter(Boolean), boundary: "本节仅基于已筛选文献，具体数值和结论需核对全文。" };
  }
  if (action === "review_fulltext") return { markdown: (context.sections || []).map((section) => section.markdown || `## ${section.title || "章节"}`).join("\n\n"), checks: [{ level: "info", message: "已检查章节标题、引用 ID 与证据边界。" }], boundary: "内容由 AI 辅助生成，请结合客观事实及相关依据综合判断。" };
  if (action === "literature_analysis") return {
    summary: "已召回真实 PubMed 文献。当前未完成模型综合分析，请逐篇核对研究对象、临床场景、结局和证据边界。",
    assessments: [],
  };
  if (action === "literature_search_plan") {
    const topic = String(context.topic || "").trim();
    const mappings = [
      [/缺血性卒中|脑梗|脑卒中/, "ischemic stroke"],
      [/抗血小板/, "antiplatelet therapy"],
      [/带状疱疹/, "herpes zoster"],
      [/病例报告|相似病例/, "case report"],
      [/诊断/, "diagnosis"],
      [/治疗/, "treatment"],
    ].filter(([pattern]) => pattern.test(topic)).map(([, value]) => value);
    const query = mappings.length ? mappings.join(" AND ") : topic;
    return {
      queries: query ? [query] : [],
      intentSummary: "已按用户输入保留疾病、干预或临床目的；演示回退不会扩展未提供的医学条件。",
    };
  }
  if (action === "literature_specific_plan") return fallbackSpecificPlan(context.topic);
  if (action === "literature_batch_analysis") {
    const items = Array.isArray(context.items) ? context.items : [];
    const reviewPmids = items.filter((item) => (item.publicationTypes || []).some((type) => /review|meta-analysis/i.test(type))).map((item) => String(item.pmid));
    const otherPmids = items.map((item) => String(item.pmid)).filter((pmid) => !reviewPmids.includes(pmid));
    const directions = [
      reviewPmids.length ? { id: "reviews", title: "综述与证据汇总", analysis: "该方向汇集当前批次中的综述或证据汇总文章，适合先了解研究范围，再核对具体研究对象和结局。", pmids: reviewPmids } : null,
      otherPmids.length ? { id: "primary", title: "原始研究与临床证据", analysis: "该方向汇集当前批次中的其他研究，需逐篇核对研究设计、人群、干预或暴露和结局。", pmids: otherPmids } : null,
    ].filter(Boolean);
    return {
      summary: "已基于当前 PubMed 召回批次整理研究方向。演示回退不生成医学结论，文献进入正文前仍需核对原文和证据边界。",
      titles: [],
      directions,
    };
  }
  if (action === "literature_single_interpretation") return fallbackSingleInterpretation(context);
  if (action === "slides") {
    const slides = [
    { type: "封面", title: context.title || "病例汇报", content: "从诊断线索到治疗决策", speakerNotes: "简要说明汇报目的。", extra: "保持标题简洁" },
    { type: "目录", title: "目录", content: "病例概况\n诊疗经过\n诊断分析\n治疗决策与结局\n讨论与反思", speakerNotes: "用 20 秒介绍汇报结构。", extra: "" },
    { type: "内容页", title: "病例概况", content: "呈现已确认的基本情况、主诉和核心临床问题。", speakerNotes: "避免展示可识别身份信息。", extra: "突出核心问题" },
    { type: "内容页", title: "诊疗时间线", content: "按时间顺序呈现关键症状、检查、诊断与治疗节点。", speakerNotes: "每个节点说明病例原文依据。", extra: "使用时间线布局" },
    { type: "内容页", title: "关键检查与诊断推理", content: "聚焦影响诊断方向的检查结果和鉴别诊断路径。", speakerNotes: "数值和时间必须与原始资料一致。", extra: "图文并列" },
    { type: "内容页", title: "治疗决策与结局", content: "说明治疗选择、调整依据、疗效、转归和随访。", speakerNotes: "未提供的事实明确标记为待补充。", extra: "" },
    { type: "内容页", title: "讨论与反思", content: "结合已核对文献讨论诊疗依据、病例价值和证据边界。", speakerNotes: "病例事实与外部证据分开讲述。", extra: "" },
    { type: "封底", title: "感谢聆听，欢迎讨论", content: "", speakerNotes: "邀请参会者围绕核心问题讨论。", extra: "" },
    ];
    return { slides: balanceDeckVisuals(slides) };
  }
  if (action === "slide_visual") {
    const slide = context.slide || {};
    return { visual_spec: normalizeSlideVisual(slide, Number(context.slideIndex || 0), Number(context.slideCount || 1)).visual_spec };
  }
  if (action === "ppt_design") return {
    pages: (context.slides || []).map((slide, slideIndex) => {
      const allowed = context.allowedLayouts || [];
      const pick = (...keys) => keys.find((key) => allowed.includes(key)) || allowed[0] || "";
      const intent = slide.intent || "content";
      const layoutKey = intent === "cover" ? pick("cover", "title_slide", "hero_full")
        : intent === "agenda" ? pick("agenda", "toc", "three_card", "full_statement")
          : intent === "closing" ? pick("closing", "ending", "hero_statement", "closing_full")
            : intent === "timeline" ? pick("process_timeline", "step_flow", "title_content", "content")
              : intent === "evidence" ? pick("appendix", "two_content", "editorial_split", "split_bleed", "content")
                : intent === "comparison" ? pick("comparison", "matrix_2x2", "two_content", "split_bleed_reverse")
                  : intent === "data" ? pick("data_story", "chart_insight", "table_summary", "kpi_dashboard", "kpi_row")
                    : intent === "cards" ? pick("three_card", "three_block", "triptych", "numbered_list", "two_card_stack")
                      : intent === "image" ? pick("image_grid", "hero_side", "picture", "screenshot", "title_content")
                    : intent === "summary" ? pick("three_card", "three_block", "hero_statement", "title_content", "content")
                      : pick("title_content", "two_content", "three_block", "editorial_split", "content");
      const defaultSlot = intent === "cover" ? "subtitle"
        : intent === "agenda" || intent === "data" || intent === "cards" || intent === "summary" ? "item"
          : intent === "timeline" ? "timeline"
            : intent === "evidence" ? "reference"
              : intent === "comparison" ? "left"
                : "body";
      return {
        slideIndex,
        layoutKey,
        placements: (slide.blocks || []).map((block, index) => ({
          blockId: block.id,
          slot: defaultSlot === "reference" && index === 0 ? "lead"
            : intent === "comparison" ? (index % 2 ? "right" : "left")
              : defaultSlot,
        })),
      };
    }),
  };
  return {};
}

function extractOutputText(response) {
  if (typeof response.output_text === "string") return response.output_text;
  return (response.output || [])
    .flatMap((item) => item.content || [])
    .filter((part) => part.type === "output_text")
    .map((part) => part.text)
    .join("");
}

function parseModelJson(value) {
  const text = String(value || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try { return JSON.parse(text); } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
    throw new Error("模型未返回可解析的 JSON");
  }
}

const reviewPromptTasks = {
  review_section_draft: {
    kind: "section",
    variables: ["current_section_json", "confirmed_outline_json", "confirmed_approach_json", "confirmed_topic_json", "writing_requirements_json", "chapter_evidence_json", "citation_guidance_json"],
  },
  review_merge_manuscript: {
    kind: "merge",
    variables: ["topic_json", "writing_approach_json", "writing_requirements_json", "confirmed_outline_json", "section_drafts_json", "literature_library_json"],
  },
  review_preflight: {
    kind: "preflight",
    variables: ["merged_manuscript_json", "writing_requirements_json", "used_references_json"],
  },
};

function validateAndRenderReviewPrompt(action, promptTemplate, inputs) {
  const task = reviewPromptTasks[action];
  if (!task) throw new Error("不支持的综述正文任务");
  const template = String(promptTemplate || "");
  if (!template.trim()) throw new Error("提示词不能为空");
  const found = [...template.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)].map((match) => match[1]);
  const unknown = [...new Set(found.filter((name) => !task.variables.includes(name)))];
  const missing = task.variables.filter((name) => !found.includes(name));
  const missingInputs = task.variables.filter((name) => !Object.hasOwn(inputs || {}, name));
  if (unknown.length) throw new Error(`提示词包含未知变量：${unknown.join("、")}`);
  if (missing.length) throw new Error(`提示词缺少变量：${missing.join("、")}`);
  if (missingInputs.length) throw new Error(`请求缺少输入：${missingInputs.join("、")}`);
  return task.variables.reduce((rendered, name) => {
    const value = JSON.stringify(inputs[name], null, 2);
    return rendered.replace(new RegExp(`\\{\\{\\s*${name}\\s*\\}\\}`, "g"), value === undefined ? "null" : value);
  }, template);
}

function stripMarkdownFence(value) {
  return String(value || "").trim().replace(/^```(?:markdown|md)?\s*/i, "").replace(/\s*```$/, "").trim();
}

function citationTokens(value) {
  return String(value || "").match(/\[(?:\d+(?:\s*[-,，]\s*\d+)*)\]/g) || [];
}

function validateMergedCitations(merged, inputs) {
  const source = (Array.isArray(inputs.section_drafts_json) ? inputs.section_drafts_json : [])
    .map((item) => String(item?.draft_text || item?.markdown || ""))
    .join("\n");
  const before = citationTokens(source);
  const after = citationTokens(merged);
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    throw new Error("整合结果改变了引用编号、组合或顺序，已阻止保存，请重试全文整合");
  }
  const allowed = new Set((Array.isArray(inputs.literature_library_json) ? inputs.literature_library_json : []).map((item) => Number(item?.referenceNumber)).filter(Number.isFinite));
  const numbers = after.flatMap((token) => token.match(/\d+/g) || []).map(Number);
  const invalid = [...new Set(numbers.filter((number) => !allowed.has(number)))];
  if (invalid.length) throw new Error(`整合结果包含不存在的引用编号：${invalid.join("、")}`);
}

function normalizePreflightResult(data) {
  const allowedStatus = ["通过", "有建议处理问题", "有必须处理问题"];
  const allowedPriorities = ["必须处理", "建议优化"];
  const allowedTypes = ["结构与逻辑", "证据支撑", "引用问题", "相似性风险", "写作要求不匹配", "语言表达", "格式问题"];
  const tasks = (Array.isArray(data?.preflight_tasks) ? data.preflight_tasks : []).slice(0, 40).map((item) => ({
    priority: String(item?.priority || ""),
    type: String(item?.type || ""),
    location: String(item?.location || "").trim(),
    problem: String(item?.problem || "").trim(),
    suggestion: String(item?.suggestion || "").trim(),
  })).filter((item) => allowedPriorities.includes(item.priority) && allowedTypes.includes(item.type) && item.location && item.problem && item.suggestion);
  const derivedStatus = tasks.some((item) => item.priority === "必须处理") ? "有必须处理问题" : tasks.length ? "有建议处理问题" : "通过";
  return { status: allowedStatus.includes(data?.status) ? data.status : derivedStatus, preflight_tasks: tasks };
}

async function callReviewPromptTask(action, promptTemplate, inputs) {
  const settings = modelSettings();
  if (!settings.apiKey || settings.demoMode) throw new Error("真实正文任务需要可用的模型 API，当前未启用演示回退");
  const health = await getModelHealth();
  if (!health.reachable) throw new Error("模型端点当前不可达，请确认网关已启动且模型配置可访问");
  const renderedPrompt = validateAndRenderReviewPrompt(action, promptTemplate, inputs || {});
  const requestBody = settings.apiStyle === "chat_completions" ? {
    model: settings.model,
    temperature: 0.1,
    max_tokens: settings.maxTokens,
    messages: [
      { role: "system", content: renderedPrompt },
      { role: "user", content: "请严格按照上述任务、输入和输出要求执行。" },
    ],
  } : {
    model: settings.model,
    store: false,
    instructions: renderedPrompt,
    input: "请严格按照上述任务、输入和输出要求执行。",
  };
  const endpoint = settings.apiStyle === "chat_completions" ? "chat/completions" : "responses";
  const response = await fetch(`${settings.baseUrl}/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${settings.apiKey}` },
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(settings.timeoutMs),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || "模型请求失败");
  const rawOutput = settings.apiStyle === "chat_completions" ? payload.choices?.[0]?.message?.content : extractOutputText(payload);
  if (action === "review_section_draft") {
    let draftText = stripMarkdownFence(rawOutput);
    if (/^\s*\{/.test(draftText)) {
      try { draftText = String(parseModelJson(draftText).draft_text || "").trim(); } catch { /* keep raw markdown */ }
    }
    if (!draftText) throw new Error("模型未返回章节正文");
    return { data: { draft_text: draftText }, mode: "model" };
  }
  const data = parseModelJson(rawOutput);
  if (action === "review_merge_manuscript") {
    const merged = String(data?.merged_manuscript || "").trim();
    if (!merged) throw new Error("模型未返回 merged_manuscript");
    validateMergedCitations(merged, inputs || {});
    return { data: { merged_manuscript: merged }, mode: "model" };
  }
  return { data: normalizePreflightResult(data), mode: "model" };
}

async function callModel(action, context) {
  const settings = modelSettings();
  if (!settings.apiKey || settings.demoMode) return { data: fallback(action, context), mode: "demo" };
  const health = await getModelHealth();
  if (!health.reachable) throw new Error("模型端点当前不可达，请确认网关已启动且 OPENAI_BASE_URL 可访问");
  const schema = schemas[action];
  if (!schema) throw new Error("不支持的模型任务");
  const isIndependentLiterature = ["literature_search_plan", "literature_specific_plan", "literature_batch_analysis", "literature_single_interpretation"].includes(action);
  const isReview = action.startsWith("review_");
  const instructions = [
    isReview ? "你是 ClinPaper 医学综述助手。只输出符合 JSON Schema 的数据。" : (isIndependentLiterature ? "你是 ClinPaper 医学文献检索助手。只输出符合 JSON Schema 的数据。" : "你是 ClinPaper 病例汇报 PPT 助手。只输出符合 JSON Schema 的数据。"),
    isReview ? "用户输入用于定义综述任务，不能替代医学证据；不补写患者事实、研究数据或文献题录。" : (isIndependentLiterature ? "用户输入用于定义检索任务，不能替代医学证据；不得生成、猜测或修改题名、期刊、年份、DOI、PMID、摘要和研究数据。" : "病例事实只能来自本次输入，不得补写患者事实、数值、日期、诊断、治疗、疗效或随访。"),
    isReview ? "医学事实、研究结果和文献结论必须以输入资料或当前检索批次为依据；不确定内容明确写待核对。" : (isIndependentLiterature ? "模型只负责理解检索意图、拆解用户线索或分析已返回批次；题录事实必须来自文献数据源。" : "外部医学证据不得替代病例事实；不确定内容写明待核对。不要输出可识别患者身份的信息。"),
    isReview || isIndependentLiterature ? "语言简洁、专业，面向中文医学科研用户。" : "语言简洁、专业，适合中文科室病例汇报。",
    action === "timeline" ? `时间线 type 只能从以下值中选择：${timelineTypes.join("、")}。source 必须是当前病例输入中能支持该事件的简短原文摘录，不得只写章节名。required 仅写该事件仍缺失的具体信息；无缺失时返回空字符串，不得返回“是”或“否”。` : "",
    action === "storylines" ? "必须首先满足 requirements.notes 中的显式汇报重点。storylines 第一项必须是与显式要求匹配度最高的方案，且整个数组只能有一项 recommended=true，其余必须为 false。" : "",
    ["outline", "evidence", "slides"].includes(action) ? "caseSections 和 timeline 是已确认病例事实源。其中已给出的日期、检查数值、药物剂量、治疗和随访结果必须原样传递，不得删除、改写或降级为“待核对”。只有输入中真正未提供的信息才可标记待补充。" : "",
    action === "slides" ? "页数、内容深度和页面结构必须遵循 requirements 中的场景、听众、时长、比例和补充说明；每页讲者备注需与该页内容一致。同时为每页生成 task_id、page_no 和 visual_spec：页面角色由 type 表示，视觉载体从 none/narrative/cards/comparison/timeline/data/kpi/chart/table/algorithm/evidence/statement/image 中选择，两个维度不得混用。visual_spec.items 用 label 概括信息分组，value/detail 只能复用 content 中的原文行；source_refs 必须使用 content:1、content:2 这类 1-based 行号引用，所有非空 content 行都必须被引用且不得补写新事实。tone 只表示视觉语气，不改变内容结论。" : "",
    action === "slide_visual" ? "只重新分析 context.slide 当前页面的视觉载体，不返回也不改写标题、内容、讲者备注或病例事实。visual_spec.type 从 none/narrative/cards/comparison/timeline/data/kpi/chart/table/algorithm/evidence/statement/image 中选择。items 的 value/detail 只能复用 content 原文行，source_refs 必须使用 content:n 且覆盖所有非空行；tone 只能表达中性、强调或风险提示，不得改变医学含义。" : "",
    ["slides", "slide_visual"].includes(action) ? "只有当前页明确存在已上传图片或影像时才能选择 image；否则使用其他视觉类型。选择 table 时必须返回 columns 和 rows，rows.source_refs 同样只能指向 content:n；非表格页 columns 和 rows 返回空数组。" : "",
    ["slides", "slide_visual"].includes(action) ? "narrative 是普通内容页的默认载体，用于分层叙述；cards 只能用于 2–4 个真正并列、同权重的要点，不得仅因 content 有多行就选卡片。timeline 用于时序事件，algorithm 用于诊断或治疗决策路径，comparison 用于明确对照，kpi/data/chart 只能在原文存在可锁定数值时使用，evidence 用于区分病例事实与外部文献。" : "",
    action === "ppt_design" ? "你是 ppt-master 页面策略师。为每一张已确认幻灯片从 allowedLayouts 中选择真实 layoutKey，不得新造布局名。layoutProfiles 给出了各 Layout 的用途、适配页面意图、文本槽位和媒体要求；slides.visualSpec 是上一阶段模型已生成的视觉结构，intent 和 features 是补充信号。必须优先按 visualSpec.type 选择专用 Layout：cards 使用并列槽位，comparison 使用 left/right，timeline 使用 timeline，data/table 使用数据或表格结构，evidence 使用 lead/reference。visualSpec.items.blockIds 定义了内容块的分组与语义，placements 应尊重这些分组。features.hasMedia=false 时不得选择 mediaRequired=true 的 Layout。5 页及以上的 Deck 中，同一 Layout 不得连续超过 2 页，通用 title_content/content 布局原则上不得超过内容页的 50%；封面、目录、时间线、对比、数据、医学依据和总结页如存在适配 Layout 应分别使用专用结构，但不得为了多样性选择无法承载当前内容的版式。pages 必须与 slides 数量一致，slideIndex 从 0 连续递增。slides.blocks 是用户在“规划 PPT 页面”已确认的原文块；你只能通过 placements 把每个 blockId 映射到 subtitle、lead、body、item、timeline、left、right 或 reference 槽位，不得返回、改写、精简或遗漏原文。每个 blockId 必须且只能出现一次。容量不足由生成引擎自动换版或续页，不得通过删减内容解决。" : "",
    action === "evidence" ? "只生成 2 至 4 个真正需要外部文献的医学证据主题，范围限于诊断标准、鉴别诊断、治疗决策、预后随访或相似病例；不得把患者性别、年龄、病史、检查数值、手术细节等病例资料缺失项当作文献需求。为每个主题生成 1 至 2 条简短、可直接提交 PubMed 的英文检索式，写入 queries；每条检索式必须保留当前病例的核心疾病或临床问题，并可使用 [Title/Abstract]。citations 必须返回空数组，不得生成或猜测题名、期刊、年份或 PMID。" : "",
    action === "literature_analysis" ? "只能分析 context.items 中当前 PubMed 批次的题名、摘要和元数据。summary 说明当前证据能支持的范围、不能支持的范围和适用边界；不得把一般文献结论写成当前患者事实。assessments 中的 PMID 只能原样使用输入中存在的 PMID，每篇最多一句适用性说明；摘要缺失时必须明确无法判断，不得补写。" : "",
    action === "literature_search_plan" ? "把自然语言主题拆成 1 至 3 条简短、可直接提交 PubMed 的英文检索式。保留用户明确提供的疾病、人群、干预或暴露、比较对象、结局和临床目的；不要自行添加限制。intentSummary 只概括检索重点，不输出医学结论。" : "",
    action === "literature_specific_plan" ? "判断输入是寻找记忆中的某一篇文献（specific），还是围绕主题寻找一批文献（topic）。只有存在 DOI、PMID、来源记录标识、完整或部分题名、明确期刊、作者、年份、卷期页码、参考文献字符串，或用户明确说某篇/这篇/找回时才判为 specific。specific 中：有 DOI、PMID、来源标识、完整题名或期刊+完整题名时 priority=P0；只有部分题名、期刊、作者、年份、卷期页码等不完整组合时 priority=P1。只抽取用户明确提供的字段；不要翻译、补全、纠错或猜测题名、期刊、作者、年份、DOI、PMID。无法识别的字符串保留为空。titleTerms 只保存用户明确说题名包含的词。intentSummary 只描述已识别线索和查找方式。" : "",
    action === "literature_batch_analysis" ? "只能使用 context.items 中的题名、摘要和元数据。summary 概括当前批次覆盖的研究范围、主要差异和证据边界；directions 输出 1 至 4 个研究方向，每个方向的 pmids 只能来自输入且不得重复造号；titles 仅翻译原题名，不改变含义。不得把当前批次泛化为整个医学领域的最终结论。" : "",
    action === "literature_single_interpretation" ? "你是医学文献解读助手。只能使用 context.item 中的题录和摘要，结合 purpose、focus、detail 组织单篇结构化解读。sections 必须覆盖 basic、background、methods、results、author_conclusion、limitations、applicability、reading_points 且每类最多一项。文献没有提供的内容写“未从当前可用内容获得”，sourceScope=not_available，evidenceText 为空。sourceScope=abstract 时 evidenceText 必须是摘要中连续的原文片段；sourceScope=metadata 时必须是题名中连续的文本。作者结论与你的归纳必须分开；不得补写研究设计、样本量、数值、效应值、置信区间、P 值、结论或局限；不得将单篇文献泛化为领域共识或个体诊疗建议。" : "",
    action === "review_requirements" ? "先判断是否为医学主题；非医学主题所有字段必须为空并在 topic_risk.notice 说明原因。医学主题 writing_type 固定为叙述性综述，不得从用户输入外推医学事实或具体研究内容。" : "",
    action === "review_directions" ? "输出 2 至 6 个研究方向。recall_focus、to_verify 使用项目列表；en_query 与 cn_query 必须是自然语言语义召回句，不使用布尔检索语法，不预设证据结论。" : "",
    action === "review_literature_analysis" ? "只分析当前筛选文献批次；literature_ids 只能使用输入文献的 literatureId，不判断选题新颖性、投稿风险或证据充分性。" : "",
    action === "review_topics" ? "只基于已确认写作需求、选定方向和用户选择文献生成叙述性综述题目；recommended 最多一个 true，不在标题中添加综述或 review 体裁标签。" : "",
    action === "review_approaches" ? "除 name 外所有字段必须是项目列表；只基于确认题目和写作需求，不使用文献分析报告。" : "",
    action === "review_outline" ? "chapters 最多 10 章；focus 与 lit_need 用换行分项表达；words 必须是 50 的正整数倍，总字数遵循用户篇幅要求。" : "",
    action === "review_section" ? "只使用输入章节和 evidence 中的文献。引用必须使用 [literatureId:xxx]，不得伪造文献 ID、研究数据或患者事实。" : "",
    action === "review_fulltext" ? "只整合输入 sections，不新增医学事实；检查引用 ID、证据边界和章节覆盖。" : "",
    action === "slides" ? "医学依据只能使用 evidence 中 selected=true 的真实 PubMed 文献；只要存在已选文献，页面规划必须包含“医学依据与讨论”内容，并以“题名（PMID: 数字）”保留至少 1 篇已选文献，不得生成新的题录或引用。" : "",
  ].join("\n");
  const requestBody = settings.apiStyle === "chat_completions" ? {
    model: settings.model,
    temperature: 0.1,
    max_tokens: settings.maxTokens,
    messages: [
      { role: "system", content: instructions },
      { role: "user", content: JSON.stringify({ task: action, context, output_schema: schema }) },
    ],
  } : {
    model: settings.model,
    store: false,
    instructions,
    input: JSON.stringify({ task: action, context }),
    text: { format: { type: "json_schema", name: `clinpaper_${action}`, strict: true, schema } },
  };
  const endpoint = settings.apiStyle === "chat_completions" ? "chat/completions" : "responses";
  const response = await fetch(`${settings.baseUrl}/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${settings.apiKey}` },
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(settings.timeoutMs),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || "模型请求失败");
  const rawOutput = settings.apiStyle === "chat_completions" ? payload.choices?.[0]?.message?.content : extractOutputText(payload);
  let data = parseModelJson(rawOutput);
  if (action === "storylines" && Array.isArray(data.storylines) && data.storylines.length) {
    const recommendedIndex = Math.max(0, data.storylines.findIndex((item) => item.recommended));
    data.storylines = data.storylines.map((item, index) => ({ ...item, recommended: index === recommendedIndex }));
  }
  if (action === "evidence" && Array.isArray(data.topics)) {
    data.topics = data.topics.slice(0, 4).map((topic) => ({
      ...topic,
      queries: Array.isArray(topic.queries) ? topic.queries.map((query) => String(query || "").trim()).filter(Boolean).slice(0, 2) : [],
      citations: [],
    }));
  }
  if (action === "literature_analysis") {
    const allowedPmids = new Set((context.items || []).map((item) => String(item.pmid || "")).filter(Boolean));
    data.assessments = Array.isArray(data.assessments)
      ? data.assessments.filter((item) => allowedPmids.has(String(item.pmid || ""))).map((item) => ({ pmid: String(item.pmid), applicability: String(item.applicability || "").trim() }))
      : [];
  }
  if (action === "literature_search_plan") {
    data.queries = Array.isArray(data.queries) ? [...new Set(data.queries.map((query) => String(query || "").trim()).filter(Boolean))].slice(0, 3) : [];
    data.intentSummary = String(data.intentSummary || "").trim();
  }
  if (action === "literature_specific_plan") {
    const fallbackPlan = fallbackSpecificPlan(context.topic);
    const clean = (value, length = 240) => String(value || "").trim().slice(0, length);
    const explicitText = (value, fallbackValue, length) => {
      const cleaned = clean(value, length);
      return cleaned && normalizeLookupText(context.topic).includes(normalizeLookupText(cleaned)) ? cleaned : fallbackValue;
    };
    data = {
      mode: ["specific", "topic"].includes(data.mode) ? data.mode : fallbackPlan.mode,
      priority: ["P0", "P1", ""].includes(data.priority) ? data.priority : fallbackPlan.priority,
      identifierType: ["pmid", "doi", "source", "none"].includes(data.identifierType) ? data.identifierType : fallbackPlan.identifierType,
      pmid: fallbackPlan.pmid,
      doi: fallbackPlan.doi,
      sourceRecordId: fallbackPlan.sourceRecordId,
      title: explicitText(data.title, fallbackPlan.title, 500),
      journal: explicitText(data.journal, fallbackPlan.journal, 240),
      author: explicitText(data.author, fallbackPlan.author, 120),
      year: fallbackPlan.year,
      volume: fallbackPlan.volume,
      issue: fallbackPlan.issue,
      pages: fallbackPlan.pages,
      titleTerms: Array.isArray(data.titleTerms) ? [...new Set(data.titleTerms.map((item) => clean(item, 80)).filter((item) => normalizeLookupText(context.topic).includes(normalizeLookupText(item))))].slice(0, 8) : fallbackPlan.titleTerms,
      intentSummary: clean(data.intentSummary, 300),
    };
    if (data.mode === "specific" && !data.priority) data.priority = data.pmid || data.doi || data.sourceRecordId || data.title ? "P0" : "P1";
    if (data.mode === "topic") data.priority = "";
  }
  if (action === "literature_batch_analysis") {
    const allowedPmids = new Set((context.items || []).map((item) => String(item.pmid || "")).filter(Boolean));
    data.titles = Array.isArray(data.titles)
      ? data.titles.filter((item) => allowedPmids.has(String(item.pmid || ""))).map((item) => ({ pmid: String(item.pmid), titleZh: String(item.titleZh || "").trim() }))
      : [];
    data.directions = Array.isArray(data.directions)
      ? data.directions.slice(0, 4).map((item, index) => ({
        id: String(item.id || `direction-${index + 1}`).replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 48),
        title: String(item.title || `研究方向 ${index + 1}`).trim(),
        analysis: String(item.analysis || "").trim(),
        pmids: [...new Set((item.pmids || []).map(String).filter((pmid) => allowedPmids.has(pmid)))],
      })).filter((item) => item.pmids.length)
      : [];
    data.summary = String(data.summary || "").trim();
  }
  if (action === "literature_single_interpretation") {
    const item = context.item || {};
    const titleText = String(item.title || "");
    const abstractText = String(item.abstract || "");
    const normalizedTitleText = normalizeEvidenceText(titleText);
    const normalizedAbstractText = normalizeEvidenceText(abstractText);
    const sectionTitles = {
      basic: "文献基本信息",
      background: "研究背景与研究问题",
      methods: "研究方法",
      results: "主要结果",
      author_conclusion: "作者结论",
      limitations: "研究局限",
      applicability: "对重点问题的适用性",
      reading_points: "阅读要点与待核对问题",
    };
    const order = Object.keys(sectionTitles);
    const received = new Map((Array.isArray(data.sections) ? data.sections : []).filter((section) => order.includes(section.id)).map((section) => [section.id, section]));
    const metadata = [item.title, item.journal, item.year, (item.authors || []).join("、"), item.pmid ? `PMID: ${item.pmid}` : "", item.doi ? `DOI: ${item.doi}` : ""].filter(Boolean).join("；");
    data.sections = order.map((id) => {
      if (id === "basic") return { id, title: sectionTitles[id], content: metadata || "未从当前可用内容获得。", sourceScope: "metadata", evidenceText: titleText };
      const source = received.get(id) || {};
      const scope = ["metadata", "abstract", "not_available"].includes(source.sourceScope) ? source.sourceScope : "not_available";
      const evidenceText = String(source.evidenceText || "").trim();
      const evidenceValid = scope === "abstract"
        ? Boolean(evidenceText && normalizedAbstractText.includes(normalizeEvidenceText(evidenceText)))
        : scope === "metadata"
          ? Boolean(evidenceText && normalizedTitleText.includes(normalizeEvidenceText(evidenceText)))
          : !evidenceText;
      const interpretive = ["applicability", "reading_points"].includes(id);
      if (!evidenceValid || (!interpretive && scope === "not_available")) return { id, title: sectionTitles[id], content: "未从当前可用内容获得。", sourceScope: "not_available", evidenceText: "" };
      return {
        id,
        title: sectionTitles[id],
        content: String(source.content || "未从当前可用内容获得。").trim().slice(0, 6000),
        sourceScope: scope,
        evidenceText,
      };
    });
    data.articleType = ["original", "systematic_review", "guideline", "case_report", "other"].includes(data.articleType) ? data.articleType : "other";
    data.summary = String(data.summary || "").trim().slice(0, 1200);
    data.missing = Array.isArray(data.missing) ? data.missing.map((value) => String(value || "").trim()).filter(Boolean).slice(0, 12) : [];
    data.boundary = String(data.boundary || "当前解读只代表对该篇文献可用内容的整理，不代表领域共识或个体诊疗建议。").trim().slice(0, 1200);
  }
  if (action === "review_requirements") {
    const text = String(context.user_raw_text_json || context.rawText || "");
    const medical = /癌|瘤|炎|结核|感染|诊断|治疗|疾病|患者|临床|医学|药物|手术|预后/.test(text);
    if (!medical) data = { field_or_department: "", writing_type: "", core_question: "", research_points: { population_or_disease: "", theme_or_intervention_exposure: "", outcomes_or_focus: "" }, topic_risk: { notice: String(data.topic_risk?.notice || "当前输入暂未识别为医学主题，请补充疾病、人群或临床问题。") } };
    else data.writing_type = "叙述性综述";
  }
  if (action === "review_directions") {
    data.exploration_directions = (Array.isArray(data.exploration_directions) ? data.exploration_directions : []).slice(0, 6).map((item, index) => ({ id: String(item.id || `direction-${index + 1}`).replace(/[^a-zA-Z0-9_-]/g, "-"), direction: String(item.direction || "").trim(), direction_question: String(item.direction_question || "").trim(), why_explore: String(item.why_explore || "").trim(), recall_focus: Array.isArray(item.recall_focus) ? item.recall_focus.map(String).filter(Boolean).slice(0, 6) : [], to_verify: Array.isArray(item.to_verify) ? item.to_verify.map(String).filter(Boolean).slice(0, 6) : [], terms: String(item.terms || "").trim(), en_query: String(item.en_query || "").replace(/\b(AND|OR|NOT)\b/gi, " ").replace(/[()]/g, " ").replace(/\s+/g, " ").trim(), cn_query: String(item.cn_query || "").replace(/[()]/g, " ").replace(/\s+/g, " ").trim() })).filter((item) => item.direction);
  }
  if (action === "review_literature_analysis") {
    const allowed = new Set((context.literature || context.items || []).map((item) => String(item.literatureId || item.id || item.pmid || "")).filter(Boolean));
    data.analysis_markdown = String(data.analysis_markdown || "").trim();
    data.categories = (Array.isArray(data.categories) ? data.categories : []).slice(0, 12).map((item) => ({ direction_id: String(item.direction_id || ""), category_name: String(item.category_name || "").trim(), category_description: String(item.category_description || "").trim(), literature_ids: [...new Set((item.literature_ids || []).map(String).filter((id) => allowed.has(id)))].slice(0, 20) })).filter((item) => item.category_name);
  }
  if (action === "review_topics") {
    data.candidates = (Array.isArray(data.candidates) ? data.candidates : []).slice(0, 6).map((item) => ({ ...item, title: String(item.title || "").replace(/综述|review/gi, "").trim(), zh_title: String(item.zh_title || item.title || "").replace(/综述|review/gi, "").trim(), core_question: String(item.core_question || "").trim(), why: String(item.why || "").trim(), difference: String(item.difference || "").trim(), support: String(item.support || "").trim(), journal_fit: String(item.journal_fit || "").trim(), risk: { title: String(item.risk?.title || "证据边界"), description: String(item.risk?.description || "当前批次需进一步核对。") }, recommended: Boolean(item.recommended) }));
    const first = data.candidates.findIndex((item) => item.recommended); data.candidates = data.candidates.map((item, index) => ({ ...item, recommended: first >= 0 ? index === first : index === 0 }));
  }
  if (action === "review_approaches") { data.recommendations = (Array.isArray(data.recommendations) ? data.recommendations : []).slice(0, 6).map((item) => ({ name: String(item.name || "").trim(), scene: Array.isArray(item.scene) ? item.scene.map(String).filter(Boolean) : [], pros: Array.isArray(item.pros) ? item.pros.map(String).filter(Boolean) : [], cons: Array.isArray(item.cons) ? item.cons.map(String).filter(Boolean) : [], outline_impact: Array.isArray(item.outline_impact) ? item.outline_impact.map(String).filter(Boolean) : [], recall_focus: Array.isArray(item.recall_focus) ? item.recall_focus.map(String).filter(Boolean) : [], recommended: Boolean(item.recommended) })).filter((item) => item.name); const first = data.recommendations.findIndex((item) => item.recommended); data.recommendations = data.recommendations.map((item, index) => ({ ...item, recommended: first >= 0 ? index === first : index === 0 })); }
  if (action === "review_outline") data.chapters = (Array.isArray(data.chapters) ? data.chapters : []).slice(0, 10).map((chapter, index) => ({ id: String(chapter.id || `chapter-${index + 1}`), title: String(chapter.title || `第${index + 1}章`), focus: String(chapter.focus || "").trim(), lit_need: String(chapter.lit_need || "").split(/\r?\n/).map((v) => v.trim()).filter(Boolean).join("\n"), words: Math.max(50, Math.round((Number(chapter.words) || 500) / 50) * 50) }));
  if (action === "review_recall_plan") data.chapters = (Array.isArray(data.chapters) ? data.chapters : []).map((chapter) => ({ chapter_id: String(chapter.chapter_id || ""), queries: Array.isArray(chapter.queries) ? chapter.queries.map(String).filter(Boolean).slice(0, 3) : [] }));
  if (action === "review_section") { data.chapter_id = String(data.chapter_id || ""); data.evidence_ids = Array.isArray(data.evidence_ids) ? [...new Set(data.evidence_ids.map(String))] : []; data.markdown = String(data.markdown || "").trim(); }
  if (action === "review_fulltext") { data.markdown = String(data.markdown || "").trim(); data.checks = Array.isArray(data.checks) ? data.checks.slice(0, 12).map((item) => ({ level: String(item.level || "info"), message: String(item.message || "").trim() })).filter((item) => item.message) : []; }
  if (action === "slides" && Array.isArray(data.slides)) {
    const evidenceEntries = (context.evidence || []).flatMap((topic) => (topic.citations || []).filter((item) => item.selected !== false).map((citation) => ({ topic: topic.question, ...citation })));
    const allowedPmids = new Set(evidenceEntries.map((item) => String(item.pmid || "")).filter(Boolean));
    const cleanUnknownPmids = (value) => String(value || "").replace(/PMID\s*[:：]?\s*(\d{5,9})/gi, (match, pmid) => allowedPmids.has(String(pmid)) ? match : "");
    data.slides = data.slides.map((slide) => ({
      ...slide,
      title: cleanUnknownPmids(slide.title),
      content: cleanUnknownPmids(slide.content),
      speakerNotes: cleanUnknownPmids(slide.speakerNotes),
      extra: cleanUnknownPmids(slide.extra),
    }));
    if (evidenceEntries.length && !evidenceEntries.some((citation) => JSON.stringify(data.slides).includes(String(citation.pmid)))) {
      const references = evidenceEntries.slice(0, 4);
      data.slides.splice(Math.max(1, data.slides.length - 1), 0, {
        type: "内容页",
        title: "医学依据与讨论",
        content: references.map((item) => `${item.topic}\n${item.title}（PMID: ${item.pmid}）`).join("\n"),
        speakerNotes: references.map((item) => item.applicability || `核对 PMID ${item.pmid} 的研究对象、临床场景、结局和证据边界。`).join("\n"),
        extra: "病例事实与外部文献证据分区呈现",
      });
    }
    data.slides = balanceDeckVisuals(data.slides);
  }
  if (action === "slide_visual") {
    const slideIndex = Number(context.slideIndex || 0);
    const slideCount = Number(context.slideCount || 1);
    data.visual_spec = normalizeSlideVisual({ ...(context.slide || {}), visual_spec: data.visual_spec || {} }, slideIndex, slideCount).visual_spec;
  }
  if (action === "ppt_design" && Array.isArray(data.pages)) {
    const allowedLayouts = new Set(context.allowedLayouts || []);
    const slides = context.slides || [];
    const fallbackPages = fallback("ppt_design", context).pages;
    data.pages = slides.map((slide, slideIndex) => {
      const candidate = data.pages.find((item) => Number(item.slideIndex) === slideIndex) || data.pages[slideIndex] || {};
      const fallbackPage = fallbackPages[slideIndex];
      const validBlocks = new Set((slide.blocks || []).map((block) => block.id));
      const usedBlocks = new Set();
      const placements = [];
      for (const placement of Array.isArray(candidate.placements) ? candidate.placements : []) {
        const blockId = String(placement.blockId || "");
        if (!validBlocks.has(blockId) || usedBlocks.has(blockId)) continue;
        usedBlocks.add(blockId);
        placements.push({ blockId, slot: placement.slot || "body" });
      }
      for (const placement of fallbackPage.placements) {
        if (usedBlocks.has(placement.blockId)) continue;
        usedBlocks.add(placement.blockId);
        placements.push(placement);
      }
      return {
        slideIndex,
        layoutKey: allowedLayouts.has(candidate.layoutKey) ? candidate.layoutKey : fallbackPage.layoutKey,
        placements,
      };
    });
  }
  return { data, mode: "model" };
}

function friendlyModelError(error) {
  const message = String(error?.message || "模型请求失败");
  if (/api key|authentication|unauthorized|incorrect.*key|\b401\b/i.test(message)) return "模型认证失败，请检查服务端模型配置";
  if (/model.*not found|unknown model|does not exist/i.test(message)) return "当前模型不可用，请检查 OPENAI_MODEL";
  return safeExcerpt(message, 180) || "模型请求失败";
}

async function createPptx(state) {
  const PptxGenJS = require("pptxgenjs");
  const pptx = new PptxGenJS();
  const isFourThree = state.ratio === "4:3 横向窄屏";
  pptx.layout = isFourThree ? "LAYOUT_4x3" : "LAYOUT_WIDE";
  const titleWidth = isFourThree ? 8.6 : 11.8;
  const bodyWidth = isFourThree ? 8.2 : 11.2;
  pptx.author = "ClinPaper";
  pptx.subject = "病例汇报 PPT";
  pptx.title = state.projectTitle || "病例汇报 PPT";
  pptx.company = "ClinPaper";
  pptx.lang = "zh-CN";
  pptx.theme = {
    headFontFace: "PingFang SC",
    bodyFontFace: "PingFang SC",
    lang: "zh-CN",
  };
  const catalog = readPptTemplateCatalog();
  const template = catalog.find((item) => item.id === state.templateId && (isFourThree ? item.canvasFormat === "ppt43" : item.canvasFormat === "ppt169"))
    || catalog.find((item) => item.id === (isFourThree ? "layout:presentation_core_43" : "layout:report_core"));
  const skin = pptTemplateDefinitions[template?.id] || pptTemplateDefinitions[isFourThree ? "layout:presentation_core_43" : "layout:report_core"];
  const pageWidth = isFourThree ? 10 : 13.333;
  const slides = Array.isArray(state.slides) ? state.slides : [];
  slides.forEach((item, index) => {
    const slide = pptx.addSlide();
    const isDivider = index === 0 || item.type === "封底";
    const background = isDivider ? skin.coverBackground : skin.background;
    const textColor = isDivider ? skin.coverText : skin.text;
    slide.background = { color: background };
    if (skin.mode === "report" && !isDivider) {
      slide.addShape(pptx.ShapeType.line, { x: 0.5, y: 0.67, w: pageWidth - 1, h: 0, line: { color: skin.primary, width: 1.2 } });
      slide.addShape(pptx.ShapeType.line, { x: 0.5, y: 6.92, w: pageWidth - 1, h: 0, line: { color: "CBD5E1", width: 0.7 } });
    } else if (skin.mode === "editorial") {
      slide.addShape(pptx.ShapeType.rect, { x: pageWidth * 0.68, y: 0, w: pageWidth * 0.32, h: 7.5, fill: { color: skin.surface, transparency: 12 }, line: { color: skin.surface, transparency: 100 } });
      slide.addShape(pptx.ShapeType.rect, { x: 0.55, y: 0.58, w: 0.55, h: 0.08, fill: { color: skin.accent }, line: { color: skin.accent } });
    } else if (skin.mode === "brand" && !isDivider) {
      slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: pageWidth, h: 0.12, fill: { color: skin.primary }, line: { color: skin.primary } });
      slide.addShape(pptx.ShapeType.rect, { x: 0.65, y: 1.42, w: pageWidth - 1.3, h: 4.95, fill: { color: skin.surface }, line: { color: "E0E0E0", width: 0.7 } });
    } else if (skin.mode === "minimal") {
      slide.addShape(pptx.ShapeType.line, { x: 0.65, y: 1.25, w: pageWidth - 1.3, h: 0, line: { color: skin.accent, width: 1 } });
    }
    if (!isDivider && skin.mode !== "editorial") {
      slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.1, h: 7.5, fill: { color: skin.primary }, line: { color: skin.primary } });
    }
    slide.addText(item.title || `第 ${index + 1} 页`, { x: 0.7, y: isDivider ? 1.2 : 0.55, w: titleWidth, h: isDivider ? 1.1 : 0.55, fontFace: "PingFang SC", fontSize: isDivider ? 30 : 24, bold: isDivider, color: textColor, margin: 0, valign: "mid" });
    if (item.content) {
      const bullets = String(item.content).split("\n").filter(Boolean).map((text) => ({ text, options: { bullet: { indent: 14 }, hanging: 4, breakLine: true } }));
      slide.addText(bullets, { x: 0.9, y: isDivider ? 2.7 : 1.55, w: bodyWidth, h: isDivider ? 3.2 : 4.6, fontFace: "PingFang SC", fontSize: isDivider ? 18 : 17, color: textColor, breakLine: false, valign: "top", margin: 0.08, paraSpaceAfterPt: 12 });
    }
    slide.addText(`${String(index + 1).padStart(2, "0")}  ·  ClinPaper 病例汇报  ·  ${template?.name || "Report Core"}`, { x: 0.7, y: 7.05, w: titleWidth, h: 0.22, fontFace: "PingFang SC", fontSize: 8, color: isDivider && skin.coverText === "FFFFFF" ? "D1D5DB" : "999999", margin: 0, align: "right" });
    if (item.speakerNotes) slide.addNotes(String(item.speakerNotes));
  });
  return pptx.write({ outputType: "nodebuffer" });
}

const pptBuilds = new Map();

function rememberPptBuild(build) {
  pptBuilds.set(build.id, build);
  const timer = setTimeout(() => {
    const current = pptBuilds.get(build.id);
    if (current) removePptMasterBuild(current);
    pptBuilds.delete(build.id);
  }, 60 * 60 * 1000);
  timer.unref?.();
}

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const requestHost = String(req.headers.host || "");
    if (req.method === "GET" && requestHost.startsWith("127.0.0.1:") && !url.pathname.startsWith("/api/")) {
      res.writeHead(307, { Location: `http://localhost:${port}${url.pathname}${url.search}` });
      return res.end();
    }
    if (req.method === "GET" && url.pathname === "/api/health") {
      const health = await getModelHealth();
      return json(res, 200, { ok: true, modelConfigured: health.configured, modelReachable: health.reachable, model: health.model });
    }
    if (req.method === "GET" && url.pathname === "/api/ppt/templates") {
      const canvasFormat = url.searchParams.get("ratio") === "four-three" ? "ppt43" : "ppt169";
      const items = readPptTemplateCatalog().filter((item) => item.canvasFormat === canvasFormat).map(publicPptTemplate);
      return json(res, 200, { ok: true, source: "ppt-master", items });
    }
    if (req.method === "GET" && url.pathname === "/api/ppt/templates/preview") {
      const kind = url.searchParams.get("kind") || "";
      const id = url.searchParams.get("id") || "";
      const template = readPptTemplateCatalog().find((item) => item.kind === kind && item.sourceId === id);
      if (!template) return json(res, 404, { error: "模板预览不存在" });
      res.writeHead(200, { "Content-Type": "image/svg+xml", "Cache-Control": "no-store" });
      return fs.createReadStream(template.previewFile).pipe(res);
    }
    if (req.method === "POST" && url.pathname === "/api/ppt/build") {
      const body = JSON.parse(await readBody(req) || "{}");
      const isFourThree = String(body.ratio || "").startsWith("4:3");
      const canvasFormat = isFourThree ? "ppt43" : "ppt169";
      const template = readPptTemplateCatalog().find((item) => item.id === body.templateId && item.canvasFormat === canvasFormat);
      if (!template) return json(res, 400, { error: "请选择与当前 PPT 比例匹配的模板" });
      const references = (body.evidence || []).flatMap((topic) => (topic.citations || []).filter((item) => item.selected !== false).map((item) => ({ title: item.title, pmid: String(item.pmid || ""), topic: topic.question })));
      const inputSlides = Array.isArray(body.slides) ? body.slides : [];
      const plannedSlides = balanceDeckVisuals(inputSlides);
      const designContext = {
        templateName: template.name,
        allowedLayouts: template.pageTypes,
        layoutProfiles: templateLayoutProfiles(template),
        slides: pptDesignSources(plannedSlides),
        timeline: Array.isArray(body.timeline) ? body.timeline : [],
        references,
        requirements: body.requirements || {},
        rule: "病例事实与外部文献证据必须分开呈现",
      };
      let designResult;
      let modelWarning = "";
      try {
        designResult = await callModel("ppt_design", designContext);
      } catch (error) {
        designResult = { data: fallback("ppt_design", designContext), mode: "demo" };
        modelWarning = `模板页面策略模型调用未完成，已使用规则回退：${friendlyModelError(error)}`;
      }
      const build = await buildPptMasterDeck({
        projectTitle: body.projectTitle,
        slides: plannedSlides,
        designPages: designResult.data.pages || [],
        template,
        skillRoot: pptSkillRoot,
        python: process.env.PPT_MASTER_PYTHON || "/Users/dingxiangyuan/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3",
      });
      rememberPptBuild(build);
      return json(res, 200, {
        ok: true,
        buildId: build.id,
        engine: build.engine,
        structure: build.structure,
        template: publicPptTemplate(template),
        modelMode: designResult.mode,
        warning: modelWarning,
        quality: build.quality,
        package: build.package,
        checks: build.checks,
        coverage: build.coverage,
        pages: build.pageFiles.map((page, index) => ({
          index,
          layoutKey: page.layoutKey,
          carrierType: page.carrierType,
          title: page.title,
          sourceSlideIndex: page.sourceSlideIndex,
          continuation: page.continuation,
          previewUrl: `/api/ppt/build/${build.id}/preview/${index}.svg`,
        })),
        downloadUrl: `/api/ppt/build/${build.id}/download`,
      });
    }
    const previewMatch = url.pathname.match(/^\/api\/ppt\/build\/([^/]+)\/preview\/(\d+)\.svg$/);
    if (req.method === "GET" && previewMatch) {
      const build = pptBuilds.get(previewMatch[1]);
      const page = build?.pageFiles?.[Number(previewMatch[2])];
      const previewPath = page && path.join(build.previewDir, page.file);
      if (!previewPath || !fs.existsSync(previewPath)) return json(res, 404, { error: "PPT 预览已失效，请重新生成" });
      res.writeHead(200, { "Content-Type": "image/svg+xml", "Cache-Control": "no-store" });
      return fs.createReadStream(previewPath).pipe(res);
    }
    const downloadMatch = url.pathname.match(/^\/api\/ppt\/build\/([^/]+)\/download$/);
    if (req.method === "GET" && downloadMatch) {
      const build = pptBuilds.get(downloadMatch[1]);
      if (!build?.outputPath || !fs.existsSync(build.outputPath)) return json(res, 404, { error: "PPT 文件已失效，请重新生成" });
      const filename = encodeURIComponent(path.basename(build.outputPath));
      const stat = fs.statSync(build.outputPath);
      res.writeHead(200, {
        "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
        "Content-Length": stat.size,
      });
      return fs.createReadStream(build.outputPath).pipe(res);
    }
    if (req.method === "POST" && url.pathname === "/api/ai") {
      const body = JSON.parse(await readBody(req) || "{}");
      if (reviewPromptTasks[body.action]) {
        try {
          return json(res, 200, await callReviewPromptTask(body.action, body.promptTemplate, body.inputs || {}));
        } catch (error) {
          return json(res, 502, { error: friendlyModelError(error), action: body.action });
        }
      }
      try {
        return json(res, 200, await callModel(body.action, body.context || {}));
      } catch (error) {
        return json(res, 200, { data: fallback(body.action, body.context || {}), mode: "demo", warning: `模型调用未完成，已使用演示回退：${friendlyModelError(error)}` });
      }
    }
    if (req.method === "POST" && url.pathname === "/api/literature/search") {
      const body = JSON.parse(await readBody(req) || "{}");
      const queries = [...(Array.isArray(body.queries) ? body.queries : []), body.query]
        .map((query) => String(query || "").trim())
        .filter(Boolean);
      const result = await searchPubmedRecords({ queries, maxResults: body.maxResults });
      return json(res, 200, { ok: true, ...result });
    }
    if (req.method === "POST" && url.pathname === "/api/literature/specific-search") {
      const body = JSON.parse(await readBody(req) || "{}");
      const rawQuery = String(body.query || "").trim();
      if (!rawQuery) return json(res, 400, { error: "请输入特定文献线索" });
      const plan = body.plan && typeof body.plan === "object" ? body.plan : fallbackSpecificPlan(rawQuery);
      const result = await searchSpecificLiterature(plan, rawQuery, body.maxResults);
      return json(res, 200, { ok: true, ...result });
    }
    if (req.method === "POST" && url.pathname === "/api/case/materials") {
      await handleMaterialUpload(req, res);
      const files = Array.isArray(req.files) ? req.files : [];
      if (!files.length) return json(res, 400, { error: "请选择需要解析的病例资料" });
      const materials = [];
      const warnings = [];
      for (const file of files) {
        const name = decodeUploadFileName(file.originalname);
        try {
          materials.push(await extractMaterial(file));
        } catch (error) {
          warnings.push(`${name}：${error.message || "内容解析失败"}`);
          materials.push({ name, type: path.extname(name).slice(1).toLowerCase() || "file", size: file.size, text: "", characters: 0, notice: error.message || "内容解析失败" });
        }
      }
      const combinedText = materials
        .filter((item) => item.text)
        .map((item) => `【文件：${item.name}】\n${item.text}`)
        .join("\n\n")
        .slice(0, 120_000);
      return json(res, 200, { ok: true, materials, combinedText, warnings });
    }
    if (req.method === "POST" && url.pathname === "/api/pptx") {
      const body = JSON.parse(await readBody(req) || "{}");
      const buffer = await createPptx(body);
      const filename = encodeURIComponent(`${body.projectTitle || "病例汇报"}.pptx`);
      res.writeHead(200, {
        "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
        "Content-Length": buffer.length,
      });
      return res.end(buffer);
    }

    let filePath = path.join(__dirname, url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname));
    if (!filePath.startsWith(__dirname)) return json(res, 403, { error: "Forbidden" });
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) filePath = path.join(__dirname, "index.html");
    res.writeHead(200, {
      "Content-Type": mime[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": [".html", ".js", ".css"].includes(path.extname(filePath)) ? "no-store" : "public, max-age=3600",
    });
    fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    json(res, 500, { error: error.message || "服务异常" });
  }
});

server.listen(port, "127.0.0.1", () => {
  const settings = modelSettings();
  console.log(`ClinPaper Demo: http://localhost:${port}`);
  console.log(settings.apiKey && !settings.demoMode ? `模型模式：${settings.model}（${settings.apiStyle === "chat_completions" ? "复用综述配置" : "Responses API"}）` : "模型模式：演示回退");
});
