import {
  DEFAULT_REVIEW_PROMPTS,
  REVIEW_PROMPT_DEFINITIONS,
  loadReviewPromptTemplates,
  saveReviewPromptTemplates,
  validateReviewPromptTemplate,
} from "./review-prompts.js";

const app = document.getElementById("app");
const toastRegion = document.getElementById("toast-region");

const STEPS = [
  ["核对病例资料", "核对已整理的病例信息，补充缺失或有误内容"],
  ["梳理诊疗经过", "按时间顺序核对关键诊疗事件，确认资料依据"],
  ["补充汇报要求", "补充汇报场景、时长与呈现要求"],
  ["明确汇报主线", "选择本次汇报要回答的核心问题与讲述主线"],
  ["确认大纲", "围绕汇报主线确认章节安排、重点与资料需求"],
  ["补充医学依据", "为诊疗决策与病例讨论补充指南和文献依据"],
  ["规划 PPT 页面", "逐页确认要讲述的病例内容、图表与讲者备注"],
  ["选择 PPT 模板", "从 ppt-master 模板库中选择页面结构与视觉风格"],
  ["生成并导出 PPT", "确认生成结果无误，下载病例汇报 PPT"],
];

const TIMELINE_TYPES = ["起病病程", "初诊经过", "入院评估", "辅助检查", "诊断确立", "治疗启动", "疗效评估", "治疗调整", "出院管理", "随访转诊"];
const PAGE_TYPES = ["封面", "目录", "内容页", "封底"];
const VISUAL_TYPE_LABELS = {
  none: "无结构化视觉",
  narrative: "叙述 / 分层正文",
  cards: "卡片 / 并列要点",
  comparison: "对比 / 双栏",
  timeline: "时间线 / 流程",
  data: "关键数据",
  kpi: "KPI / 指标",
  chart: "数据图表",
  table: "表格",
  algorithm: "诊疗路径",
  evidence: "医学依据",
  statement: "核心结论",
  image: "图片 / 影像",
};
const VISUAL_TONE_LABELS = { neutral: "中性", highlight: "强调", warn: "风险提示" };
const VISUAL_HIERARCHY_LABELS = { "title-body": "标题—正文", "title-lead-detail": "核心句—详情", "left-right": "左右对照", sequence: "时序 / 路径", "metric-insight": "指标—解读" };
const VISUAL_DENSITY_LABELS = { breathing: "留白", balanced: "均衡", dense: "高密度" };
const SPECIFIC_LOOKUP_OPTIONS = {
  pmid: { label: "PMID", placeholder: "输入 PMID，例如：39998642", help: "使用 PubMed 唯一标识精确查找", example: "39998642" },
  doi: { label: "DOI", placeholder: "输入 DOI，例如：10.xxxx/xxxxx", help: "使用 DOI 精确查找", example: "10.3760/cma.j.cn112137-20241230-02964" },
  journal: { label: "期刊", placeholder: "输入期刊名称", help: "返回该期刊下可查询到的文献", example: "中华医学杂志" },
  title: { label: "标题", placeholder: "输入完整或部分文献标题", help: "按标题匹配目标文献或候选", example: "遗传性聋外科治疗专家共识" },
  author: { label: "作者", placeholder: "输入作者姓名", help: "返回该作者可查询到的文献", example: "曹雪涛" },
};

const initialLiteratureState = () => ({
  queryDraft: "",
  query: "",
  phase: "idle",
  phaseText: "",
  records: [],
  matchedCount: 0,
  planQueries: [],
  intentSummary: "",
  analysis: { summary: "", directions: [] },
  filters: { time: "", customStart: "", customEnd: "", types: [], jcr: [], ifRanges: [], languages: [], fulltext: [], direction: "" },
  sort: "relevance",
  panel: "analysis",
  detailRecordKey: "",
  advancedOpen: false,
  searchedAt: "",
  source: "PubMed",
  error: "",
  searchMode: "topic",
  priority: "",
  specificPlan: null,
  resultStatus: "",
  confirmedRecordKey: "",
  providerErrors: [],
  lookupDimension: "",
});

let reviewOutlinePointSequence = 0;

function createReviewOutlinePoint(chapterId, text = "") {
  reviewOutlinePointSequence += 1;
  return {
    id: `${chapterId || "outline"}-point-${Date.now()}-${reviewOutlinePointSequence}`,
    text,
  };
}

function reviewOutlinePoints(chapter) {
  if (!Array.isArray(chapter.keyPoints)) {
    chapter.keyPoints = String(chapter.keyPoints || "")
      .split("\n")
      .map((text) => text.trim())
      .filter(Boolean)
      .map((text, index) => ({ id: `${chapter.id}-point-${index + 1}`, text }));
  } else {
    chapter.keyPoints = chapter.keyPoints.map((point, index) => typeof point === "string"
      ? { id: `${chapter.id}-point-${index + 1}`, text: point }
      : { id: point.id || `${chapter.id}-point-${index + 1}`, text: String(point.text || "") });
  }
  return chapter.keyPoints;
}

function reviewOutlinePointTexts(chapter) {
  return reviewOutlinePoints(chapter).map((point) => point.text.trim()).filter(Boolean);
}

const initialReviewState = () => ({
  stage: "direction",
  rawInput: "",
  requirementsStatus: "idle",
  topicLiteraturePhase: "idle",
  literatureSelection: [],
  literaturePool: [],
  literatureAnalysis: null,
  topicsGeneration: "idle",
  writingRequirements: { length: "中篇", journal: "", audience: "", extra: "" },
  approaches: [],
  selectedApproachId: "",
  recallPlan: null,
  sectionDrafts: [],
  activeChapterId: "",
  fullText: null,
  fullTextStatus: "idle",
  taskInputOverrides: {},
  taskInputDrawerOpen: false,
  taskInputChapterId: "",
  taskInputDraft: {},
  taskInputErrors: {},
  promptDrawerOpen: false,
  promptTab: "section",
  sectionRuns: {},
  writingPipelineStatus: "idle",
  mergeStatus: "idle",
  mergeError: "",
  mergedManuscript: "",
  mergedStale: false,
  preflightStatus: "idle",
  preflightError: "",
  preflightResult: null,
  preflightStale: false,
  ignoredPreflightTasks: [],
  preflightPanelOpen: false,
  sectionEditorChapterId: "",
  sectionEditorDraft: "",
  exportStatus: { word: "idle", evidence: "idle", queries: "idle" },
  nonMedical: false,
  editingRequirements: false,
  editBackup: null,
  customDirectionOpen: false,
  customDirectionDraft: { title: "", description: "", searchFocus: "" },
  customDirectionErrors: {},
  directionGeneration: 0,
  regeneratingDirections: false,
  requirements: {
    subject: "脊柱结核",
    topic: "诊断与鉴别诊断",
    focus: ["早期诊断", "分子诊断"],
    question: "如何提高脊柱结核的早期诊断与鉴别诊断准确性？",
    extra: "重点比较不同诊断方法的适用场景与局限性",
  },
  directions: [
    {
      id: "molecular",
      title: "脊柱结核的分子诊断",
      description: "重点了解 GeneXpert MTB/RIF 等分子检测技术的诊断表现与耐药检测能力。",
      reason: "补充分子检测视角，与当前关注的早期诊断和分子诊断直接相关。",
      decisionTags: ["诊断表现", "耐药检测", "临床适用性"],
      decisionPoints: [{ label: "诊断表现", detail: "不同分子检测方法的敏感度与特异度" }, { label: "耐药识别", detail: "分子检测对耐药风险的识别能力" }, { label: "临床适用", detail: "不同样本、患者人群和临床场景的适用边界" }],
      searchFocus: "分子检测方法、诊断准确性、耐药检测与不同临床场景的适用性。",
      pending: "不同检测方法的敏感度、特异度及其适用人群仍需通过选题文献确认。",
      pendingQuestions: ["不同分子检测方法的敏感度和特异度是否稳定？", "不同样本和患者人群的检测表现是否存在差异？", "分子检测能否提升早期识别效率？"],
      keywords: "spinal tuberculosis, molecular diagnosis, GeneXpert MTB/RIF",
      selected: true,
    },
    {
      id: "early",
      title: "脊柱结核的早期诊断",
      description: "重点了解影像学早期征象、血清标志物及分子检测指标。",
      reason: "聚焦如何更早识别脊柱结核，回应当前核心问题中的早期诊断目标。",
      decisionTags: ["早期识别", "诊断指标", "联合诊断"],
      decisionPoints: [{ label: "早期识别", detail: "能够提示脊柱结核的早期征象与指标" }, { label: "指标表现", detail: "不同影像、实验室与分子指标的诊断表现" }, { label: "联合诊断", detail: "多类指标联合应用的临床诊断路径" }],
      searchFocus: "早期影像学表现、实验室指标、联合诊断路径与诊断延迟。",
      pending: "哪些指标能够稳定提升早期识别能力，需要结合当前文献批次判断。",
      pendingQuestions: ["哪些早期影像或实验室指标具有稳定的识别能力？", "联合检测是否优于单一诊断方法？", "不同指标分别适用于哪些病程阶段和患者人群？"],
      keywords: "spinal tuberculosis, early diagnosis, imaging, biomarkers",
      selected: true,
    },
    {
      id: "differential",
      title: "脊柱结核的鉴别诊断",
      description: "重点了解与脊柱肿瘤、化脓性脊柱炎等疾病的鉴别要点。",
      reason: "聚焦误诊风险与疾病区分，补充当前诊断研究的临床判断路径。",
      decisionTags: ["疾病区分", "误诊风险", "鉴别指标"],
      decisionPoints: [{ label: "疾病区分", detail: "脊柱结核与相似疾病的关键差异" }, { label: "误诊风险", detail: "常见误诊疾病与容易遗漏的诊断环节" }, { label: "鉴别指标", detail: "不同鉴别指标的适用场景与判断边界" }],
      searchFocus: "脊柱肿瘤、化脓性脊柱炎、布鲁菌性脊柱炎与影像学鉴别。",
      pending: "不同鉴别指标的直接比较证据与适用边界仍需进一步核对。",
      pendingQuestions: ["哪些指标能够区分脊柱结核与脊柱肿瘤？", "不同感染性脊柱疾病的鉴别要点是否一致？", "各类鉴别指标适用于哪些临床场景？"],
      keywords: "spinal tuberculosis, differential diagnosis, spinal infection",
      selected: false,
    },
  ],
  drawerDirectionId: "",
  activeTopicId: "early-combined",
  selectedTopicId: "early-combined",
  writingApproach: "临床问题导向：从早期识别、方法比较到联合应用",
  deletedOutline: null,
  deletedOutlinePoint: null,
  evidencePhase: "ready",
  evidenceChapterFilter: "all",
  evidenceStatusFilter: "all",
  evidenceAdvancedOpen: false,
  evidenceFilters: { types: [], yearMode: "all", yearStart: "", yearEnd: "", jcr: [], impact: [] },
  selectedEvidenceIds: [],
  evidenceAssignmentDraft: null,
  evidenceDraftChapterId: "",
  evidenceDraft: "",
  outlineChapters: [
    {
      id: "outline-background",
      title: "引言：脊柱结核早期诊断的临床挑战",
      purpose: "说明为什么需要联合影像学与分子检测来改善早期识别。",
      keyPoints: "脊柱结核的疾病负担与诊断延迟\n早期临床表现与常规诊断的局限\n本综述的核心问题与讨论边界",
      wordCount: 700,
      evidenceNeed: "疾病负担和诊断延迟的流行病学资料\n临床诊断指南或共识\n早期诊断困难的临床研究",
    },
    {
      id: "outline-imaging",
      title: "影像学检查的早期识别价值",
      purpose: "梳理 MRI 和 CT 在不同病程阶段能够发现什么，以及各自容易遗漏的情况。",
      keyPoints: "MRI 的早期征象与软组织改变\nCT 对骨质破坏和钙化的补充价值\n两种检查的互补场景与判断边界",
      wordCount: 1100,
      evidenceNeed: "MRI 与 CT 诊断准确性研究\n早期或非典型病例影像队列\n影像学评估指南与方法学综述",
    },
    {
      id: "outline-molecular",
      title: "分子检测的诊断表现与适用边界",
      purpose: "比较 GeneXpert MTB/RIF 等分子检测在不同样本和临床场景中的诊断价值。",
      keyPoints: "常用分子检测方法及其诊断表现\n组织、脓液等样本类型对结果的影响\n低菌量患者与耐药识别的应用局限",
      wordCount: 1100,
      evidenceNeed: "分子检测诊断试验与系统综述\n不同样本类型的比较研究\n低菌量和耐药人群的分层结果",
    },
    {
      id: "outline-combined",
      title: "影像学与分子检测的联合应用",
      purpose: "回答两类方法如何互补，并界定当前证据可以支持的联合诊断结论。",
      keyPoints: "联合应用的典型临床路径\n联合策略与单一检查的现有比较\n不同临床场景下的检查顺序与适用边界",
      wordCount: 1300,
      evidenceNeed: "联合诊断策略的直接比较研究\n诊断路径或临床算法研究\n不同病程阶段的分层研究",
    },
    {
      id: "outline-outlook",
      title: "局限、研究空白与临床展望",
      purpose: "归纳当前证据的不确定性，说明未来研究与临床应用需要解决的问题。",
      keyPoints: "现有研究在样本、阈值和研究设计上的局限\n联合诊断路径的验证空白\n对临床实践和后续研究的启示",
      wordCount: 800,
      evidenceNeed: "多中心、前瞻性诊断研究\n方法学质量评价和偏倚风险资料\n临床路径外部验证研究",
    },
  ],
  writingEvidence: [
    {
      id: "ev-01",
      chapterId: "outline-background",
      title: "Diagnostic delay and clinical burden in spinal tuberculosis: a multicenter retrospective study",
      journal: "Spine Journal",
      year: "2023",
      studyType: "多中心回顾性研究",
      filterType: "队列研究",
      jcr: "Q1",
      impactFactor: 5.5,
      use: "说明诊断延迟的常见环节及其临床影响，用于引言中的问题背景。",
      basis: "题名和摘要涉及脊柱结核诊断延迟、就诊路径和临床结局。",
      limitation: "摘要未提供各中心完整纳入标准，具体人群仍需查看全文确认。",
      status: "priority",
      chapterUsages: [
        { chapterId: "outline-background", status: "priority", use: "说明诊断延迟的常见环节及临床影响，用于引言中的问题背景。" },
        { chapterId: "outline-outlook", status: "keep", use: "补充诊断延迟对后续研究和临床路径改进的启示。" },
      ],
    },
    {
      id: "ev-02",
      chapterId: "outline-background",
      title: "Current concepts in the diagnosis of spinal tuberculosis",
      journal: "Global Spine Journal",
      year: "2022",
      studyType: "综述",
      filterType: "综述",
      jcr: "Q1",
      impactFactor: 4.8,
      use: "概括当前诊断方法及主要局限，作为疾病背景和术语说明。",
      basis: "摘要覆盖临床表现、影像检查和病原学检测。",
      limitation: "适合作为背景文献，不能替代具体诊断方法的原始研究。",
      status: "keep",
    },
    {
      id: "ev-03",
      chapterId: "outline-imaging",
      title: "MRI findings in early spinal tuberculosis: diagnostic features and pitfalls",
      journal: "European Spine Journal",
      year: "2024",
      studyType: "影像队列研究",
      filterType: "队列研究",
      jcr: "Q1",
      impactFactor: 5.9,
      use: "支持 MRI 早期征象、软组织改变及容易遗漏的非典型表现。",
      basis: "题名和摘要直接讨论早期脊柱结核 MRI 表现与误判情况。",
      limitation: "诊断表现的具体数值和影像判定标准需核对全文。",
      status: "priority",
    },
    {
      id: "ev-04",
      chapterId: "outline-imaging",
      title: "Computed tomography patterns of vertebral destruction in spinal infection",
      journal: "Skeletal Radiology",
      year: "2021",
      studyType: "病例对照研究",
      filterType: "病例对照研究",
      jcr: "Q2",
      impactFactor: 4.0,
      use: "补充 CT 对骨质破坏和钙化的观察价值。",
      basis: "摘要包含脊柱结核亚组，并比较不同脊柱感染的 CT 表现。",
      limitation: "研究对象不限于脊柱结核，引用时需要限定适用范围。",
      status: "pending",
    },
    {
      id: "ev-05",
      chapterId: "outline-imaging",
      title: "Imaging evaluation of spinal tuberculosis in children",
      journal: "Pediatric Radiology",
      year: "2020",
      studyType: "影像综述",
      filterType: "综述",
      jcr: "Q2",
      impactFactor: 3.7,
      use: "讨论儿童脊柱结核的影像特点。",
      basis: "主题与影像诊断相关。",
      limitation: "当前题目聚焦成人患者，研究人群与写作范围不一致。",
      status: "omit",
    },
    {
      id: "ev-06",
      chapterId: "outline-molecular",
      title: "Xpert MTB/RIF for the diagnosis of spinal tuberculosis using tissue and abscess samples",
      journal: "Clinical Microbiology and Infection",
      year: "2023",
      studyType: "诊断试验",
      filterType: "诊断试验",
      jcr: "Q1",
      impactFactor: 14.2,
      use: "比较组织与脓液样本中的分子检测表现，并讨论样本选择。",
      basis: "摘要直接报告脊柱结核、Xpert 检测及两类样本。",
      limitation: "敏感度、特异度及参照标准需查看全文后才能写入正文。",
      status: "priority",
    },
    {
      id: "ev-07",
      chapterId: "outline-molecular",
      title: "Molecular assays for extrapulmonary tuberculosis: a systematic review",
      journal: "The Lancet Infectious Diseases",
      year: "2022",
      studyType: "系统评价",
      filterType: "系统评价/Meta分析",
      jcr: "Q1",
      impactFactor: 56.3,
      use: "补充分子检测在肺外结核中的总体证据与方法学背景。",
      basis: "摘要包含骨关节结核相关亚组信息。",
      limitation: "不是脊柱结核专门研究，只适合支持背景性观点。",
      status: "keep",
      chapterUsages: [
        { chapterId: "outline-molecular", status: "priority", use: "概括肺外结核分子检测的总体证据，为方法比较提供核心依据。" },
        { chapterId: "outline-combined", status: "keep", use: "作为联合诊断策略中分子检测部分的背景补充。" },
      ],
    },
    {
      id: "ev-08",
      chapterId: "outline-combined",
      title: "Combined imaging and molecular testing for suspected spinal tuberculosis",
      journal: "BMC Musculoskeletal Disorders",
      year: "2024",
      studyType: "回顾性诊断研究",
      filterType: "诊断试验",
      jcr: "Q2",
      impactFactor: 3.2,
      use: "支持影像学与分子检测联合应用的临床流程和互补关系。",
      basis: "题名和摘要同时涉及影像、分子检测及疑似脊柱结核患者。",
      limitation: "摘要不足以确认联合策略是否优于单一检查，需查看全文。",
      status: "pending",
    },
    {
      id: "ev-09",
      chapterId: "outline-combined",
      title: "A diagnostic pathway for early recognition of spinal tuberculosis",
      journal: "Journal of Orthopaedic Research",
      year: "2021",
      studyType: "临床路径研究",
      filterType: "队列研究",
      jcr: "暂无",
      impactFactor: null,
      use: "用于梳理不同检查的使用顺序和联合诊断路径。",
      basis: "摘要描述了基于影像与病原学检查的诊断流程。",
      limitation: "路径尚缺少外部验证，不能写成普遍适用的推荐方案。",
      status: "pending",
    },
    {
      id: "ev-10",
      chapterId: "outline-outlook",
      title: "Methodological quality of diagnostic accuracy studies in spinal tuberculosis",
      journal: "Journal of Clinical Epidemiology",
      year: "2023",
      studyType: "方法学评价",
      filterType: "方法学研究",
      jcr: "Q1",
      impactFactor: 7.4,
      use: "总结现有诊断研究在样本选择、参照标准和偏倚控制方面的不足。",
      basis: "摘要围绕脊柱结核诊断研究的方法学质量展开。",
      limitation: "具体偏倚判断基于原研究全文，引用前需核对评价方法。",
      status: "pending",
    },
  ],
  topics: [
    {
      id: "early-combined",
      title: "脊柱结核早期诊断中影像学与分子检测的联合应用进展",
      coreQuestion: "影像学与分子检测如何互补，并提高脊柱结核的早期识别与鉴别诊断准确性？",
      analysis: {
        scope: [
          "本题聚焦疑似或确诊脊柱结核的成人患者。",
          "主要讨论 MRI、CT 与 GeneXpert MTB/RIF 等分子检测的诊断表现、联合应用方式和临床适用场景。",
          "治疗方案、术式比较、长期预后和复发管理不在本题范围内。",
        ],
        difference: [
          "当前发现的相关综述主要分别讨论脊柱结核影像表现或分子检测技术。",
          "相近综述多按单一诊断方法归纳，较少从临床诊断流程比较两类方法的互补关系。",
          "当前题目进一步聚焦早期诊断，以及影像学与分子检测的组合方式和适用边界。",
        ],
        coverage: [
          "当前文献主要覆盖早期影像征象、MRI 与 CT 表现、GeneXpert 检测、组织与脓液样本检测和联合诊断流程。",
          "研究以诊断准确性研究、回顾性队列和方法学综述为主，年份覆盖 2015—2025 年。",
          "现有内容已经涉及两类诊断方法的基本表现、常用样本类型、典型临床场景和主要局限。",
        ],
        gaps: [
          "影像学与分子检测直接组合后的诊断增益，以及不同病程阶段的分层结果仍较少。",
          "当前缺少前瞻性、多中心诊断研究和统一阈值下的外部验证。",
          "联合策略与单一检查之间的直接比较仍不充分。",
          "后续需要继续查找联合诊断路径、不同样本类型和早期病例亚组研究。",
        ],
      },
      scope: {
        subject: "疑似或确诊脊柱结核的成人患者",
        focus: "MRI、CT 与 GeneXpert MTB/RIF 等分子检测的诊断表现、联合应用方式和临床适用场景",
        excluded: "治疗方案、术式比较、长期预后和复发管理",
      },
      difference: {
        similar: "已发现相关综述主要分别讨论脊柱结核影像表现或分子检测技术",
        focus: "相近综述多按单一诊断方法归纳，较少从临床诊断流程比较两类方法的互补关系",
        change: "当前题目聚焦早期诊断场景，重点讨论影像学与分子检测如何组合使用及各自适用边界",
      },
      coverage: {
        themes: "早期影像征象、MRI 与 CT 表现、GeneXpert 检测、组织与脓液样本检测、联合诊断流程",
        studies: "以诊断准确性研究、回顾性队列和方法学综述为主，覆盖 2015—2025 年",
        covered: "两类诊断方法的基本表现、常用样本类型、典型临床场景和主要局限",
      },
      gaps: {
        limited: "影像学与分子检测直接组合后的增益，以及不同病程阶段的分层结果",
        missingTypes: "前瞻性、多中心诊断研究和统一阈值下的外部验证",
        missingComparison: "联合策略与单一检查之间的直接比较",
        next: "继续查找联合诊断路径、不同样本类型和早期病例亚组研究",
      },
      risks: [
        { type: "证据不足", level: "高", detail: "联合策略与单一检查的直接比较较少，现有结果还不足以支持“联合应用一定更优”的明确结论。" },
        { type: "信息限制", level: "低", detail: "当前聚类结果主要用于判断主题覆盖，尚不能替代对全文研究方法和偏倚风险的逐篇核对。" },
      ],
    },
    {
      id: "molecular-value",
      title: "分子检测技术在脊柱结核早期诊断中的临床价值",
      coreQuestion: "不同分子检测技术能否缩短确诊时间，并在哪些样本和患者人群中更有诊断价值？",
      analysis: {
        scope: [
          "本题聚焦临床疑似脊柱结核并接受分子检测的患者。",
          "主要讨论 GeneXpert、PCR 等分子检测的诊断准确性、检测时效、样本差异和耐药识别能力。",
          "影像学诊断体系、手术治疗和抗结核用药方案不在本题范围内。",
        ],
        difference: [
          "当前发现的相近综述主要讨论结核病分子诊断或骨关节结核诊断。",
          "已有综述通常覆盖多种结核类型，或侧重技术原理和总体诊断表现。",
          "当前题目限定脊柱结核及早期诊断场景，并增加不同样本和临床路径的比较。",
        ],
        coverage: [
          "当前文献主要覆盖 GeneXpert、PCR、耐药检测、组织样本、脓液样本和检测时效。",
          "研究以诊断试验、回顾性研究和系统综述为主，年份主要集中在 2016—2025 年。",
          "现有内容已经涉及常见分子检测方法、诊断表现、样本选择和耐药检测用途。",
        ],
        gaps: [
          "早期或菌量较低患者中的独立结果，以及不同样本的同人群比较仍较少。",
          "当前缺少前瞻性诊断队列和真实世界成本效益研究。",
          "不同分子检测平台之间的头对头比较仍不充分。",
          "后续需要继续查找低菌量病例、样本类型比较和检测时效相关研究。",
        ],
      },
      scope: {
        subject: "临床疑似脊柱结核并接受分子检测的患者",
        focus: "GeneXpert、PCR 等分子检测的诊断准确性、检测时效、样本差异和耐药识别能力",
        excluded: "影像学诊断体系、手术治疗和抗结核用药方案",
      },
      difference: {
        similar: "已发现结核病分子诊断和骨关节结核诊断相关综述",
        focus: "相近综述通常覆盖多种结核类型，或侧重技术原理和总体诊断表现",
        change: "当前题目限定脊柱结核及早期诊断场景，增加不同样本与临床路径的比较",
      },
      coverage: {
        themes: "GeneXpert、PCR、耐药检测、组织样本、脓液样本和检测时效",
        studies: "以诊断试验、回顾性研究和系统综述为主，年份主要集中在 2016—2025 年",
        covered: "常见分子检测方法、敏感度与特异度报告、样本选择和耐药检测用途",
      },
      gaps: {
        limited: "早期或菌量较低患者中的独立结果，以及不同样本的同人群比较",
        missingTypes: "前瞻性诊断队列和真实世界成本效益研究",
        missingComparison: "不同分子检测平台之间的头对头比较",
        next: "继续查找低菌量病例、样本类型比较和检测时效相关研究",
      },
      risks: [
        { type: "重复风险", level: "高", detail: "已有综述已经讨论结核病分子诊断；若不限定脊柱结核、早期诊断和样本场景，题目可能与现有内容高度重合。" },
        { type: "证据不足", level: "中", detail: "低菌量患者和不同样本类型的直接比较较少，难以完整回答“哪些人群更有诊断价值”。" },
      ],
    },
    {
      id: "differential-imaging",
      title: "脊柱结核与常见感染性脊柱疾病的影像学鉴别进展",
      coreQuestion: "哪些 MRI 与 CT 征象有助于区分脊柱结核、化脓性脊柱炎和布鲁菌性脊柱炎？",
      analysis: {
        scope: [
          "本题聚焦疑似感染性脊柱疾病的成人患者。",
          "主要讨论 MRI、CT 的鉴别征象及其在脊柱结核、化脓性脊柱炎和布鲁菌性脊柱炎中的诊断价值。",
          "脊柱肿瘤鉴别、分子检测、病原学治疗和预后不在本题范围内。",
        ],
        difference: [
          "当前发现的相近综述主要讨论脊柱感染影像诊断或脊柱结核影像表现。",
          "已有综述多归纳各疾病的典型表现，直接比较具体鉴别征象的内容较分散。",
          "当前题目以临床鉴别任务组织内容，集中比较三类感染的关键影像差异。",
        ],
        coverage: [
          "当前文献主要覆盖椎体与椎间盘改变、脓肿形态、骨质破坏、软组织受累和增强表现。",
          "研究以回顾性影像队列、病例对照研究和影像综述为主，年份覆盖 2012—2025 年。",
          "现有内容已经涉及常见影像征象、典型鉴别线索和 MRI、CT 的互补用途。",
        ],
        gaps: [
          "非典型病例和早期病变中的鉴别表现仍较少。",
          "当前缺少多中心前瞻性影像研究和标准化阅片验证。",
          "三类疾病在同一研究人群中的直接比较仍不充分。",
          "后续需要继续查找三组直接比较、非典型病例和影像模型外部验证研究。",
        ],
      },
      scope: {
        subject: "疑似感染性脊柱疾病的成人患者",
        focus: "MRI、CT 的鉴别征象及其在三类常见感染性疾病中的诊断价值",
        excluded: "脊柱肿瘤鉴别、分子检测、病原学治疗和预后",
      },
      difference: {
        similar: "已发现脊柱感染影像诊断及脊柱结核影像表现相关综述",
        focus: "相近综述多归纳各疾病的典型表现，直接比较具体鉴别征象的内容较分散",
        change: "当前题目以临床鉴别任务组织内容，集中比较三类感染的关键影像差异",
      },
      coverage: {
        themes: "椎体与椎间盘改变、脓肿形态、骨质破坏、软组织受累和增强表现",
        studies: "以回顾性影像队列、病例对照研究和影像综述为主，覆盖 2012—2025 年",
        covered: "常见影像征象、典型鉴别线索和 MRI、CT 的互补用途",
      },
      gaps: {
        limited: "非典型病例和早期病变中的鉴别表现",
        missingTypes: "多中心前瞻性影像研究和标准化阅片验证",
        missingComparison: "三类疾病在同一研究人群中的直接比较",
        next: "继续查找三组直接比较、非典型病例和影像模型外部验证研究",
      },
      risks: [
        { type: "选题边界", level: "高", detail: "同时覆盖三类疾病以及 MRI、CT 两种检查，比较维度较多，需要进一步限定重点征象或临床场景。" },
        { type: "信息限制", level: "中", detail: "现有研究对影像征象的命名和判定标准并不完全一致，聚类结果可能无法直接形成统一比较框架。" },
      ],
    },
  ],
});

const initialState = () => ({
  screen: "portal",
  homeTab: 0,
  portalText: "",
  currentStep: 0,
  maxUnlocked: 0,
  projectTitle: "病例汇报 PPT",
  sourceText: "",
  fileNames: [],
  caseSections: [],
  timeline: [],
  requirements: {
    scene: "科室病例汇报",
    audience: "科室临床医生",
    duration: "10–15 分钟",
    ratio: "16:9 横向宽屏",
    notes: "",
  },
  storylines: [],
  selectedStoryline: 0,
  storylineNote: "",
  outlineTitle: "",
  outline: [],
  evidence: [],
  slides: [],
  selectedSlide: 0,
  pptTemplates: [],
  templateRatio: "",
  selectedTemplateId: "",
  pptBuild: null,
  pptGeneratedAt: "",
  editCase: false,
  editTimeline: false,
  editOutline: false,
  needsReparse: false,
  drawer: null,
  loading: "",
  modelConfigured: false,
  modelReachable: false,
  generationMode: "demo",
  generationVerified: false,
  literatureTab: "topic",
  literatureUiVersion: 3,
  literatureDrafts: { topic: "", specific: "" },
  literatureSpecificDimension: "pmid",
  literatureSpecificDrafts: { pmid: "", doi: "", journal: "", title: "", author: "" },
  literature: initialLiteratureState(),
  literatureHistory: [],
  literatureReports: [],
  interpretationDraft: null,
  activeLiteratureReportId: "",
  activeReportSectionId: "",
  reportEvidenceOpen: true,
  confirmReportOpen: false,
  exportReportOpen: false,
  review: initialReviewState(),
  caseReportEvidence: initialCaseReportEvidenceState(),
  checks: [
    { level: "required", type: "事实一致性", text: "确认页面中的日期、检查数值、药物剂量、治疗和随访与病例原文一致。", detail: "检查页面是否保留了已确认数值，且没有把未提供信息写成既有事实。", ignored: false },
    { level: "suggested", type: "医学依据", text: "确认讨论页只使用用户选中的 PubMed 文献，并完成来源核对。", detail: "题录来自真实 PubMed 检索；进入汇报前仍需核对研究对象、临床场景、结局和证据边界。", ignored: false },
    { level: "suggested", type: "图表问题", text: "为关键检查页面补充已脱敏的原始图像和图注。", detail: "图片不得包含姓名、住院号、检查号等身份信息。", ignored: false },
  ],
});

let state = initialState();
let pendingFiles = [];
let reviewDraggedOutlineId = "";
let reviewDraggedOutlinePoint = null;
let reviewPromptTemplates = loadReviewPromptTemplates();
let reviewPromptEditorDraft = reviewPromptTemplates.section;
let reviewPromptEditorErrors = [];

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const nl = (value) => escapeHtml(value).replaceAll("\n", "<br>");

const formatFileSize = (bytes) => bytes >= 1024 * 1024
  ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  : `${Math.max(1, Math.round(bytes / 1024))} KB`;

const readFileDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ""));
  reader.onerror = () => reject(new Error(`${file.name} 读取失败`));
  reader.readAsDataURL(file);
});

function slideContentLines(slide = {}) {
  return String(slide.content || "").replace(/\r/g, "").split("\n").map((item) => item.trim()).filter(Boolean);
}

function inferredVisualType(slide = {}) {
  if (["封面", "封底"].includes(slide.type)) return "none";
  const text = `${slide.title || ""}\n${slide.extra || ""}\n${slide.content || ""}`;
  if (/时间线|诊疗经过|病程|流程/.test(text)) return "timeline";
  if (/医学依据|文献|指南|证据|PMID/.test(text)) return "evidence";
  if (/对比|比较|鉴别|(?:^|\s)vs\.?(?:\s|$)/i.test(text)) return "comparison";
  if (/检查|指标|疗效|结局|转归/.test(text) && /\d|%|mg|mmHg|mmol|ng\/L|U\/L/.test(text)) return "data";
  if (/总结|小结|结论|启示/.test(text)) return "statement";
  return "narrative";
}

function normalizePlanningSlide(slide = {}, slideIndex = 0, slideCount = 1) {
  const lines = slideContentLines(slide);
  const raw = slide.visual_spec || {};
  const requestedType = Object.hasOwn(VISUAL_TYPE_LABELS, raw.type) ? raw.type : inferredVisualType(slide);
  const resolvedType = requestedType === "cards" && slide.type !== "目录" && (lines.length < 2 || lines.length > 4) ? "narrative" : requestedType;
  const type = lines.length || ["none", "image"].includes(resolvedType) ? resolvedType : "none";
  const used = new Set();
  const items = type === "none" ? [] : (Array.isArray(raw.items) ? raw.items : []).map((item, itemIndex) => {
    let refs = [...new Set((item.source_refs || []).map(String).filter((ref) => {
      const match = ref.match(/^content:(\d+)$/);
      return match && Number(match[1]) >= 1 && Number(match[1]) <= lines.length;
    }))].filter((ref) => !used.has(ref));
    if (!refs.length) {
      const nextRef = lines.map((_, lineIndex) => `content:${lineIndex + 1}`).find((ref) => !used.has(ref));
      if (nextRef) refs = [nextRef];
    }
    refs.forEach((ref) => used.add(ref));
    const resolved = refs.map((ref) => lines[Number(ref.split(":")[1]) - 1]).filter(Boolean);
    return {
      id: `v${slideIndex}-i${itemIndex}`,
      label: String(item.label || resolved[0]?.split(/[:：。；;]/)[0] || `要点 ${itemIndex + 1}`).slice(0, 32),
      value: resolved[0] || "",
      detail: resolved.slice(1).join("\n"),
      tone: Object.hasOwn(VISUAL_TONE_LABELS, item.tone) ? item.tone : "neutral",
      source_refs: refs,
    };
  }).filter((item) => item.source_refs.length);
  if (type !== "none") lines.forEach((line, lineIndex) => {
    const ref = `content:${lineIndex + 1}`;
    if (used.has(ref)) return;
    items.push({ id: `v${slideIndex}-i${items.length}`, label: line.split(/[:：。；;]/)[0].slice(0, 32) || `要点 ${lineIndex + 1}`, value: line, detail: "", tone: "neutral", source_refs: [ref] });
  });
  return {
    ...slide,
    task_id: `P${String(slideIndex + 1).padStart(2, "0")}`,
    page_no: slideIndex + 1,
    visual_spec: {
      type,
      title: String(raw.title || slide.title || ""),
      hierarchy: raw.hierarchy || (type === "comparison" ? "left-right" : ["timeline", "algorithm"].includes(type) ? "sequence" : ["data", "kpi", "chart", "table"].includes(type) ? "metric-insight" : type === "statement" ? "title-lead-detail" : "title-body"),
      density: raw.density || (lines.length >= 5 ? "dense" : lines.length <= 2 ? "breathing" : "balanced"),
      items,
      columns: Array.isArray(raw.columns) ? raw.columns : [],
      rows: Array.isArray(raw.rows) ? raw.rows : [],
    },
  };
}

function normalizePlanningSlides() {
  state.slides = state.slides.map((slide, index) => normalizePlanningSlide(slide, index, state.slides.length));
}

function notify(message) {
  toastRegion.innerHTML = `<div class="toast">${escapeHtml(message)}</div>`;
  window.setTimeout(() => { toastRegion.innerHTML = ""; }, 1800);
}

function notifyOutlineDeleted(chapter) {
  toastRegion.innerHTML = `<div class="toast toast-action"><span>已删除“${escapeHtml(chapter.title || "未命名章节")}”</span><button data-action="review-undo-delete-outline">撤销</button></div>`;
  window.setTimeout(() => { toastRegion.innerHTML = ""; }, 4000);
}

function notifyOutlinePointDeleted(point) {
  toastRegion.innerHTML = `<div class="toast toast-action"><span>已删除内容要点“${escapeHtml(point.text || "空白要点")}”</span><button data-action="review-undo-outline-point">撤销</button></div>`;
  window.setTimeout(() => { toastRegion.innerHTML = ""; }, 4000);
}

function invalidatePptBuild() {
  state.pptBuild = null;
  state.pptGeneratedAt = "";
}

const REVIEW_STATE_DB_NAME = "clinpaper-demo5190-review-writing";
const REVIEW_STATE_STORE = "tasks";
const REVIEW_STATE_RECORD_ID = "active-review-task-v1";
let reviewStateDbPromise = null;
let reviewStateHydrated = false;

function openReviewStateDb() {
  if (!reviewStateDbPromise) {
    reviewStateDbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(REVIEW_STATE_DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(REVIEW_STATE_STORE)) request.result.createObjectStore(REVIEW_STATE_STORE, { keyPath: "id" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("无法打开综述任务存储"));
    });
  }
  return reviewStateDbPromise;
}

async function saveReviewStateToIndexedDb() {
  if (!reviewStateHydrated) return;
  const record = {
    id: REVIEW_STATE_RECORD_ID,
    screen: state.screen,
    review: structuredClone(state.review),
    updatedAt: new Date().toISOString(),
  };
  try {
    const db = await openReviewStateDb();
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(REVIEW_STATE_STORE, "readwrite");
      transaction.objectStore(REVIEW_STATE_STORE).put(record);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error("综述任务保存失败"));
      transaction.onabort = () => reject(transaction.error || new Error("综述任务保存已中止"));
    });
  } catch (error) {
    console.warn("ClinPaper 综述任务暂未持久化到 IndexedDB。", error);
  }
}

async function readReviewStateFromIndexedDb() {
  try {
    const db = await openReviewStateDb();
    return await new Promise((resolve, reject) => {
      const request = db.transaction(REVIEW_STATE_STORE, "readonly").objectStore(REVIEW_STATE_STORE).get(REVIEW_STATE_RECORD_ID);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error("综述任务读取失败"));
    });
  } catch (error) {
    console.warn("ClinPaper 综述任务恢复失败，将继续使用当前缓存。", error);
    return null;
  }
}

function applyPersistedReviewState(savedReview = {}) {
  const baseline = state.review;
  state.review = {
    ...baseline,
    ...savedReview,
    requirements: { ...baseline.requirements, ...(savedReview.requirements || {}) },
    writingRequirements: { ...baseline.writingRequirements, ...(savedReview.writingRequirements || {}) },
    evidenceFilters: { ...baseline.evidenceFilters, ...(savedReview.evidenceFilters || {}) },
    exportStatus: { ...baseline.exportStatus, ...(savedReview.exportStatus || {}) },
    sectionRuns: Object.fromEntries(Object.entries(savedReview.sectionRuns || {}).map(([chapterId, run]) => [chapterId, {
      ...run,
      status: run?.status === "running" ? "failed" : (run?.status || "idle"),
      error: run?.status === "running" ? "页面刷新导致生成中断，请重试本章。" : String(run?.error || ""),
    }])),
    writingPipelineStatus: ["running", "merging"].includes(savedReview.writingPipelineStatus) ? "paused" : (savedReview.writingPipelineStatus || "idle"),
    mergeStatus: ["running", "loading"].includes(savedReview.mergeStatus) ? "failed" : (savedReview.mergeStatus || "idle"),
    mergeError: ["running", "loading"].includes(savedReview.mergeStatus) ? "页面刷新导致全文整合中断，请重试。" : String(savedReview.mergeError || ""),
    preflightStatus: savedReview.preflightStatus === "running" ? "failed" : (savedReview.preflightStatus || "idle"),
    preflightError: savedReview.preflightStatus === "running" ? "页面刷新导致全文检查中断，请重新检查。" : String(savedReview.preflightError || ""),
    taskInputDrawerOpen: false,
    taskInputDraft: {},
    taskInputErrors: {},
    promptDrawerOpen: false,
    sectionEditorChapterId: "",
    sectionEditorDraft: "",
  };
}

async function hydrateReviewStateFromIndexedDb() {
  const saved = await readReviewStateFromIndexedDb();
  if (saved?.review) applyPersistedReviewState(saved.review);
  reviewStateHydrated = true;
  applyRouteFromLocation();
  render();
}

function saveState() {
  void saveReviewStateToIndexedDb();
  // The review workflow uses IndexedDB because generated manuscripts can be
  // larger than localStorage's quota. Avoid repeatedly writing the same large
  // task into the legacy all-in-one cache while this workspace is active.
  if (state.screen === "review-workspace") return true;
  const snapshot = {
    ...state,
    fileNames: [],
    loading: "",
    drawer: null,
    // PPT build results contain data-URL previews and can exceed localStorage.
    // They are reproducible, so preserve planning state and rebuild on demand.
    pptBuild: null,
    pptTemplates: [],
    slides: state.slides.map((slide) => ({ ...slide, images: [] })),
  };
  try {
    localStorage.setItem("clinpaper-demo5190", JSON.stringify(snapshot));
    return true;
  } catch (error) {
    // Older Demo versions may already have filled the quota with preview
    // assets. Replace that cache with a compact snapshot that still preserves
    // the complete review writing/check workflow.
    if (error?.name === "QuotaExceededError" || /quota/i.test(String(error?.message || ""))) {
      const compactSnapshot = {
        screen: state.screen,
        homeTab: state.homeTab,
        portalText: state.portalText,
        currentStep: state.currentStep,
        maxUnlocked: state.maxUnlocked,
        projectTitle: state.projectTitle,
        sourceText: state.sourceText,
        fileNames: [],
        caseSections: state.caseSections,
        timeline: state.timeline,
        requirements: state.requirements,
        storylines: state.storylines,
        selectedStoryline: state.selectedStoryline,
        storylineNote: state.storylineNote,
        outlineTitle: state.outlineTitle,
        outline: state.outline,
        evidence: state.evidence,
        slides: state.slides.map((slide) => ({ ...slide, images: [] })),
        selectedSlide: state.selectedSlide,
        selectedTemplateId: state.selectedTemplateId,
        pptBuild: null,
        pptGeneratedAt: "",
        review: state.review,
        caseReportEvidence: state.caseReportEvidence,
        checks: state.checks,
      };
      try {
        localStorage.setItem("clinpaper-demo5190", JSON.stringify(compactSnapshot));
        console.warn("已清理可重建的预览缓存，并保留当前任务状态。");
        return true;
      } catch (compactError) {
        console.warn("ClinPaper 状态暂未持久化：浏览器存储空间不足。当前页面仍可继续操作。", compactError);
        return false;
      }
    }
    throw error;
  }
}

const RESTORABLE_SCREENS = new Set([
  "portal",
  "review-workspace",
  "case-report-evidence",
  "literature-home",
  "literature-results",
  "literature-interpretation-setup",
  "literature-report",
  "ppt-home",
  "workspace",
]);

function routeFromLocation() {
  const params = new URLSearchParams(window.location.search);
  const legacyFix = params.get("fix");
  if (legacyFix === "case-report-start-3") {
    return { screen: "case-report-evidence", homeTab: 1 };
  }

  const view = params.get("view");
  if (view === "review") return { screen: "review-workspace", reviewStage: reviewStageFrom(params.get("stage")) };
  if (view === "case-report-evidence") return { screen: "case-report-evidence", homeTab: 1 };
  if (view === "literature") return { screen: params.get("page") === "results" ? "literature-results" : "literature-home" };
  if (view === "ppt") return { screen: "ppt-home" };
  if (view === "case-ppt") return { screen: "workspace" };
  if (view === "home") return { screen: "portal" };
  return null;
}

function applyRouteFromLocation() {
  const route = routeFromLocation();
  if (!route) return;
  state.screen = route.screen;
  if (Number.isInteger(route.homeTab)) state.homeTab = route.homeTab;
  if (route.reviewStage) state.review.stage = route.reviewStage;
}

function syncLocationFromState() {
  const url = new URL(window.location.href);
  url.search = "";
  if (state.screen === "review-workspace") {
    url.searchParams.set("view", "review");
    url.searchParams.set("stage", reviewStageFrom(state.review.stage));
  } else if (state.screen === "case-report-evidence") {
    url.searchParams.set("view", "case-report-evidence");
  } else if (state.screen === "literature-home" || state.screen === "literature-results") {
    url.searchParams.set("view", "literature");
    if (state.screen === "literature-results") url.searchParams.set("page", "results");
  } else if (state.screen === "ppt-home") {
    url.searchParams.set("view", "ppt");
  } else if (state.screen === "workspace") {
    url.searchParams.set("view", "case-ppt");
    url.searchParams.set("step", String(state.currentStep));
  }
  const next = `${url.pathname}${url.search}${url.hash}`;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (next !== current) window.history.replaceState({ clinpaper: true }, "", next);
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem("clinpaper-demo5190") || "null");
    if (saved && Array.isArray(saved.caseSections)) {
      const initialReview = initialReviewState();
      state = { ...initialState(), ...saved };
      state.review = {
        ...initialReview,
        ...(saved.review || {}),
        requirements: { ...initialReview.requirements, ...(saved.review?.requirements || {}) },
        directions: Array.isArray(saved.review?.directions) && saved.review.directions.length
          ? saved.review.directions
          : initialReview.directions,
        editingRequirements: false,
        editBackup: null,
        customDirectionOpen: false,
        customDirectionDraft: { title: "", description: "", searchFocus: "" },
        customDirectionErrors: {},
        directionGeneration: Number(saved.review?.directionGeneration || 0),
        regeneratingDirections: false,
        drawerDirectionId: "",
        stage: reviewStageFrom(saved.review?.stage),
        topics: Array.isArray(saved.review?.topics) && saved.review.topics.length
          ? saved.review.topics.map((topic) => {
            const fallback = initialReview.topics.find((item) => item.id === topic.id);
            const savedRisks = Array.isArray(topic.risks) && topic.risks.length ? topic.risks : (fallback?.risks || []);
            const risks = savedRisks.map((risk) => ({ ...(fallback?.risks || []).find((item) => item.type === risk.type), ...risk }));
            return { ...fallback, ...topic, risks };
          })
          : initialReview.topics,
        activeTopicId: saved.review?.activeTopicId || initialReview.activeTopicId,
        selectedTopicId: saved.review?.selectedTopicId || initialReview.selectedTopicId,
        writingApproach: saved.review?.writingApproach || initialReview.writingApproach,
        deletedOutline: null,
        deletedOutlinePoint: null,
        outlineChapters: Array.isArray(saved.review?.outlineChapters) && saved.review.outlineChapters.length
          ? saved.review.outlineChapters
          : initialReview.outlineChapters,
        writingEvidence: (Array.isArray(saved.review?.writingEvidence) && saved.review.writingEvidence.length
          ? saved.review.writingEvidence.map((item) => ({ ...initialReview.writingEvidence.find((fallback) => fallback.id === item.id), ...item }))
          : initialReview.writingEvidence).map(normalizeReviewEvidenceItem),
        evidencePhase: saved.review?.evidencePhase === "searching" ? "ready" : (saved.review?.evidencePhase || "ready"),
        evidenceChapterFilter: saved.review?.evidenceChapterFilter || "all",
        evidenceStatusFilter: saved.review?.evidenceStatusFilter || "all",
        evidenceAdvancedOpen: false,
        evidenceFilters: { ...initialReview.evidenceFilters, ...(saved.review?.evidenceFilters || {}) },
        selectedEvidenceIds: [],
        evidenceAssignmentDraft: null,
        evidenceDraftChapterId: "",
        evidenceDraft: "",
        rawInput: saved.review?.rawInput || "",
        requirementsStatus: saved.review?.requirementsStatus || "idle",
        topicLiteraturePhase: saved.review?.topicLiteraturePhase || "idle",
        literatureSelection: Array.isArray(saved.review?.literatureSelection) ? saved.review.literatureSelection : [],
        literaturePool: Array.isArray(saved.review?.literaturePool) ? saved.review.literaturePool : [],
        literatureAnalysis: saved.review?.literatureAnalysis || null,
        writingRequirements: { ...initialReview.writingRequirements, ...(saved.review?.writingRequirements || {}) },
        approaches: Array.isArray(saved.review?.approaches) ? saved.review.approaches : [],
        selectedApproachId: saved.review?.selectedApproachId || "",
        recallPlan: saved.review?.recallPlan || null,
        sectionDrafts: Array.isArray(saved.review?.sectionDrafts) ? saved.review.sectionDrafts : [],
        activeChapterId: saved.review?.activeChapterId || "",
        fullText: saved.review?.fullText || null,
        fullTextStatus: saved.review?.fullTextStatus === "loading" ? "failed" : (saved.review?.fullTextStatus || "idle"),
        taskInputOverrides: saved.review?.taskInputOverrides && typeof saved.review.taskInputOverrides === "object" ? saved.review.taskInputOverrides : {},
        taskInputDrawerOpen: false,
        taskInputChapterId: saved.review?.taskInputChapterId || saved.review?.activeChapterId || initialReview.outlineChapters[0]?.id || "",
        taskInputDraft: {},
        taskInputErrors: {},
        promptDrawerOpen: false,
        promptTab: ["section", "merge", "preflight"].includes(saved.review?.promptTab) ? saved.review.promptTab : "section",
        sectionRuns: Object.fromEntries(Object.entries(saved.review?.sectionRuns || {}).map(([chapterId, run]) => [chapterId, {
          ...run,
          status: run?.status === "running" ? "failed" : (run?.status || "idle"),
          error: run?.status === "running" ? "页面刷新导致生成中断，请重试本章。" : String(run?.error || ""),
        }])),
        writingPipelineStatus: ["running", "merging"].includes(saved.review?.writingPipelineStatus) ? "paused" : (saved.review?.writingPipelineStatus || "idle"),
        mergeStatus: ["running", "loading"].includes(saved.review?.mergeStatus) ? "failed" : (saved.review?.mergeStatus || (saved.review?.fullText?.markdown ? "ready" : "idle")),
        mergeError: ["running", "loading"].includes(saved.review?.mergeStatus) ? "页面刷新导致全文整合中断，请重试。" : String(saved.review?.mergeError || ""),
        mergedManuscript: String(saved.review?.mergedManuscript || saved.review?.fullText?.markdown || ""),
        mergedStale: Boolean(saved.review?.mergedStale),
        preflightStatus: saved.review?.preflightStatus === "running" ? "failed" : (saved.review?.preflightStatus || "idle"),
        preflightError: saved.review?.preflightStatus === "running" ? "页面刷新导致全文检查中断，请重新检查。" : String(saved.review?.preflightError || ""),
        preflightResult: saved.review?.preflightResult || null,
        preflightStale: Boolean(saved.review?.preflightStale),
        ignoredPreflightTasks: Array.isArray(saved.review?.ignoredPreflightTasks) ? saved.review.ignoredPreflightTasks : [],
        preflightPanelOpen: Boolean(saved.review?.preflightPanelOpen),
        sectionEditorChapterId: "",
        sectionEditorDraft: "",
        exportStatus: { ...initialReview.exportStatus, ...(saved.review?.exportStatus || {}) },
        nonMedical: Boolean(saved.review?.nonMedical),
      };
      state.fileNames = [];
      state.pptTemplates = [];
      state.templateRatio = "";
      state.screen = RESTORABLE_SCREENS.has(saved.screen) ? saved.screen : "portal";
      state.literatureTab = ["topic", "specific"].includes(saved.literatureTab) ? saved.literatureTab : "topic";
      state.literatureDrafts = { topic: "", specific: "", ...(saved.literatureDrafts || {}) };
      if (saved.literatureUiVersion !== 3) {
        state.literatureDrafts.specific = "";
        state.literatureHistory = (saved.literatureHistory || []).map((entry) => entry.session?.searchMode === "specific" ? { ...entry, session: { ...entry.session, confirmedRecordKey: "", detailRecordKey: "", panel: "analysis", records: (entry.session.records || []).map((item) => ({ ...item, selected: false })) } } : entry);
      }
      state.literatureUiVersion = 3;
      state.literatureSpecificDimension = SPECIFIC_LOOKUP_OPTIONS[saved.literatureSpecificDimension] ? saved.literatureSpecificDimension : "pmid";
      state.literatureSpecificDrafts = { pmid: "", doi: "", journal: "", title: "", author: "", ...(saved.literatureSpecificDrafts || {}) };
      state.literature = { ...initialLiteratureState(), ...(saved.literature || {}), filters: { ...initialLiteratureState().filters, ...(saved.literature?.filters || {}) }, analysis: { ...initialLiteratureState().analysis, ...(saved.literature?.analysis || {}) } };
      state.literatureHistory = Array.isArray(state.literatureHistory) ? state.literatureHistory.slice(0, 8) : [];
      state.literatureReports = Array.isArray(saved.literatureReports) ? saved.literatureReports : [];
      state.literatureReports.forEach((report) => {
        if (report?.status === "generating") {
          report.status = "error";
          report.error = "页面刷新导致本次生成中断，请重试。已选择的文献与解读设置仍已保留。";
          report.updatedAt = new Date().toISOString();
        }
      });
      state.interpretationDraft = null;
      state.activeLiteratureReportId = "";
      state.activeReportSectionId = "";
      state.reportEvidenceOpen = true;
      state.confirmReportOpen = false;
      state.exportReportOpen = false;
      normalizePlanningSlides();
    }
  } catch { /* ignore damaged demo cache */ }
}

async function api(path, options = {}) {
  const isFormData = options.body instanceof FormData;
  const response = await fetch(path, {
    ...options,
    headers: { ...(isFormData ? {} : { "Content-Type": "application/json" }), ...(options.headers || {}) },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "请求失败");
  }
  return response;
}

async function loadPptTemplates(force = false) {
  const ratio = state.requirements.ratio.startsWith("4:3") ? "four-three" : "wide";
  if (!force && state.pptTemplates.length && state.templateRatio === ratio) return;
  state.loading = "正在读取 ppt-master 模板库";
  render();
  try {
    const response = await api(`/api/ppt/templates?ratio=${ratio}`);
    const result = await response.json();
    state.pptTemplates = result.items || [];
    state.templateRatio = ratio;
    if (!state.pptTemplates.some((item) => item.id === state.selectedTemplateId)) {
      state.selectedTemplateId = state.pptTemplates.find((item) => item.recommended)?.id || state.pptTemplates[0]?.id || "";
      invalidatePptBuild();
    }
    if (!state.pptTemplates.length) throw new Error("当前 PPT 比例暂无可用模板");
  } finally {
    state.loading = "";
  }
}

async function buildFullPpt() {
  state.loading = "正在使用 ppt-master 选择真实 Layout 并生成 SVG";
  render();
  try {
    const response = await api("/api/ppt/build", {
      method: "POST",
      body: JSON.stringify({
        projectTitle: state.projectTitle,
        ratio: state.requirements.ratio,
        requirements: state.requirements,
        slides: state.slides,
        timeline: state.timeline,
        evidence: state.evidence,
        templateId: state.selectedTemplateId,
      }),
    });
    const result = await response.json();
    state.pptBuild = result;
    state.pptGeneratedAt = new Date().toISOString();
    state.selectedSlide = 0;
    if (result.warning) notify(result.warning);
    return result;
  } finally {
    state.loading = "";
  }
}

function selectedTemplate() {
  return state.pptTemplates.find((item) => item.id === state.selectedTemplateId) || state.pptTemplates[0];
}

function templateStyle(template = selectedTemplate()) {
  const theme = template?.theme || {};
  return `--ppt-primary:${theme.primary || "#7753ff"};--ppt-accent:${theme.accent || "#a88dfb"};--ppt-background:${theme.background || "#fff"};--ppt-surface:${theme.surface || "#f3f0fc"};--ppt-text:${theme.text || "#333"};--ppt-cover-background:${theme.coverBackground || "#f3f0fc"};--ppt-cover-text:${theme.coverText || "#333"}`;
}

async function extractPendingMaterials() {
  if (!pendingFiles.length) return { combinedText: "", materials: [], warnings: [] };
  state.loading = "正在解析病例文件";
  render();
  try {
    const formData = new FormData();
    pendingFiles.forEach((file) => formData.append("files", file, file.name));
    const response = await api("/api/case/materials", { method: "POST", body: formData });
    const result = await response.json();
    if (result.warnings?.length) notify(result.warnings.join("；"));
    return result;
  } finally {
    state.loading = "";
  }
}

async function parseCurrentCase(sourceText) {
  const extracted = await extractPendingMaterials();
  const sourceParts = [extracted.combinedText, sourceText.trim() ? `【用户补充文字】\n${sourceText.trim()}` : ""].filter(Boolean);
  if (!sourceParts.length) throw new Error("未从上传文件中提取到可读内容，请检查文件格式或补充文字");
  return runAI("parse_case", {
    sourceText: sourceParts.join("\n\n"),
    files: extracted.materials.map(({ name, type, characters, extraction, notice }) => ({ name, type, characters, extraction, notice })),
  }, "正在使用模型整理病例资料");
}

async function runAI(action, context, loadingText) {
  state.loading = loadingText;
  render();
  try {
    const response = await api("/api/ai", { method: "POST", body: JSON.stringify({ action, context }) });
    const result = await response.json();
    state.generationMode = result.mode;
    state.generationVerified = result.mode === "model";
    if (result.warning) notify(result.warning);
    return result.data;
  } finally {
    state.loading = "";
  }
}

async function runReviewAI(action, context, loadingText = "正在生成综述步骤") {
  try { return await runAI(action, context, loadingText); } catch (error) {
    notify(`模型暂不可用，已使用演示回退：${error.message || ""}`);
    if (action === "review_requirements") return { field_or_department: context.user_raw_text_json || "脊柱结核", writing_type: "叙述性综述", core_question: `围绕${String(context.user_raw_text_json || "脊柱结核").slice(0, 30)}梳理现有证据？`, research_points: { population_or_disease: context.user_raw_text_json || "脊柱结核", theme_or_intervention_exposure: "诊断与鉴别诊断", outcomes_or_focus: "诊断表现、临床适用场景" }, topic_risk: { notice: "医学事实需结合资料和文献核对。" } };
    if (action === "review_directions") return { exploration_directions: [{ id: "direction-1", direction: "诊断与临床识别", direction_question: "如何提高早期识别准确性？", why_explore: "回应核心问题", recall_focus: ["早期识别", "诊断表现"], to_verify: ["研究对象", "结局"], terms: "diagnosis", en_query: "diagnosis early recognition clinical", cn_query: "早期诊断 临床研究" }, { id: "direction-2", direction: "方法比较与适用边界", direction_question: "不同方法有何差异？", why_explore: "支持方法比较", recall_focus: ["方法比较", "适用场景"], to_verify: ["比较对象", "证据边界"], terms: "method comparison", en_query: "method comparison clinical evidence", cn_query: "方法比较 临床证据" }] };
    if (action === "review_approaches") return { recommendations: [{ name: "临床问题导向", scene: ["明确临床问题"], pros: ["结构清晰"], cons: ["需要控制范围"], outline_impact: ["按临床路径分章"], recall_focus: ["诊断路径"], recommended: true }] };
    if (action === "review_topics") return { candidates: [{ title: "医学主题的诊断与临床识别路径", zh_title: "医学主题的诊断与临床识别路径", core_question: "现有证据如何支持识别与方法选择？", why: "覆盖核心问题", difference: "按临床场景比较方法", support: "当前筛选文献批次", journal_fit: "临床医学期刊", risk: { title: "证据边界", description: "需核对全文" }, recommended: true }] };
    if (action === "review_outline") return { chapters: [{ id: "chapter-1", title: "引言与问题范围", focus: "说明背景与核心问题", lit_need: "指南或共识", words: 800 }, { id: "chapter-2", title: "主要研究证据", focus: "梳理方法与结局", lit_need: "临床研究", words: 1200 }, { id: "chapter-3", title: "适用场景与局限", focus: "比较适用边界", lit_need: "外部验证研究", words: 1000 }, { id: "chapter-4", title: "总结与展望", focus: "总结证据与空白", lit_need: "前瞻性研究", words: 600 }] };
    if (action === "review_section") return { chapter_id: context.chapter?.id || "", title: context.chapter?.title || "章节", markdown: `## ${context.chapter?.title || "章节"}\n\n${context.chapter?.focus || "基于当前证据整理本节。"}`, evidence_ids: [], boundary: "当前内容需核对全文。" };
    if (action === "review_fulltext") return { markdown: (context.sections || []).map((s) => s.markdown).join("\n\n"), checks: [{ level: "info", message: "已完成基础检查。" }], boundary: "内容由 AI 辅助生成，请结合客观事实及相关依据综合判断。" };
    return {};
  }
}

const REVIEW_TASK_INPUT_FIELDS = [
  ["current_section_json", "章节大纲"],
  ["confirmed_outline_json", "完整确认版大纲"],
  ["confirmed_approach_json", "已确认写作思路"],
  ["confirmed_topic_json", "确认题目"],
  ["writing_requirements_json", "写作要求"],
  ["chapter_evidence_json", "本章文献"],
  ["citation_guidance_json", "本章引用建议"],
];

function reviewNumberedLiterature() {
  return normalizeReviewEvidenceRecords()
    .filter((item) => item.includedInWriting && item.chapterUsages.some((usage) => ["priority", "keep"].includes(usage.status)))
    .map((item, index) => ({
      referenceNumber: index + 1,
      literatureId: String(item.literatureId || item.id || ""),
      title: String(item.title || ""),
      journal: String(item.journal || ""),
      year: String(item.year || ""),
      authors: Array.isArray(item.authors) ? item.authors : [],
      pmid: String(item.pmid || ""),
      doi: String(item.doi || ""),
      abstract: String(item.abstract || ""),
      limitation: String(item.limitation || ""),
      chapterUsages: item.chapterUsages.filter((usage) => ["priority", "keep"].includes(usage.status)).map((usage) => ({ ...usage })),
    }));
}

function reviewSystemTaskInputs(chapterId) {
  const chapter = state.review.outlineChapters.find((item) => item.id === chapterId) || state.review.outlineChapters[0] || {};
  const topic = state.review.topics?.find((item) => item.id === state.review.selectedTopicId) || {};
  const approach = state.review.approaches?.find((item) => item.id === state.review.selectedApproachId);
  const literature = reviewNumberedLiterature();
  const chapterLiterature = literature.filter((item) => item.chapterUsages.some((usage) => usage.chapterId === chapter.id));
  const inputs = {
    current_section_json: {
      id: chapter.id || "",
      title: chapter.title || "",
      purpose: chapter.purpose || chapter.focus || "",
      keyPoints: reviewOutlinePointTexts(chapter),
      targetWordCount: Number(chapter.wordCount || chapter.words || 0),
      evidenceNeed: chapter.evidenceNeed || chapter.lit_need || "",
    },
    confirmed_outline_json: state.review.outlineChapters.map((item, index) => ({
      order: index + 1,
      id: item.id,
      title: item.title,
      purpose: item.purpose || item.focus || "",
      keyPoints: reviewOutlinePointTexts(item),
      targetWordCount: Number(item.wordCount || item.words || 0),
    })),
    confirmed_approach_json: approach ? {
      id: approach.id,
      name: approach.name,
      scene: approach.scene || [],
      outlineImpact: approach.outline_impact || [],
      recallFocus: approach.recall_focus || [],
    } : { name: state.review.writingApproach || "" },
    confirmed_topic_json: {
      id: topic.id || state.review.selectedTopicId || "",
      title: topic.title || state.review.requirements?.subject || "",
      coreQuestion: topic.coreQuestion || state.review.requirements?.question || "",
    },
    writing_requirements_json: {
      reviewType: state.review.requirements?.writing_type || "叙述性综述",
      language: "中文",
      length: state.review.writingRequirements?.length || "",
      targetJournal: state.review.writingRequirements?.journal || "",
      audience: state.review.writingRequirements?.audience || "",
      extra: state.review.writingRequirements?.extra || state.review.requirements?.extra || "",
    },
    chapter_evidence_json: chapterLiterature.map(({ chapterUsages, ...item }) => ({
      ...item,
      chapterUsage: chapterUsages.find((usage) => usage.chapterId === chapter.id),
    })),
    citation_guidance_json: chapterLiterature.map((item) => {
      const usage = item.chapterUsages.find((entry) => entry.chapterId === chapter.id);
      return {
        referenceNumber: item.referenceNumber,
        literatureId: item.literatureId,
        priority: usage?.status || "keep",
        intendedUse: usage?.use || "",
        rule: `仅在文献内容直接支持表述时使用 [${item.referenceNumber}]，不得扩大证据边界。`,
      };
    }),
  };
  return Object.fromEntries(Object.entries(inputs).map(([key, value]) => [key, JSON.stringify(value, null, 2)]));
}

function reviewEffectiveTaskInputStrings(chapterId) {
  const system = reviewSystemTaskInputs(chapterId);
  const overrides = state.review.taskInputOverrides?.[chapterId] || {};
  return Object.fromEntries(REVIEW_TASK_INPUT_FIELDS.map(([key]) => [key, Object.hasOwn(overrides, key) ? String(overrides[key]) : system[key]]));
}

function reviewTaskInputValidation(chapterId, values = reviewEffectiveTaskInputStrings(chapterId)) {
  const errors = {};
  const parsed = {};
  REVIEW_TASK_INPUT_FIELDS.forEach(([key]) => {
    try { parsed[key] = JSON.parse(String(values[key] || "")); }
    catch (error) { errors[key] = `JSON 格式错误：${error.message}`; }
  });
  return { valid: Object.keys(errors).length === 0, errors, parsed };
}

function openReviewTaskInputDrawer(chapterId = "") {
  const resolved = chapterId || state.review.taskInputChapterId || state.review.outlineChapters[0]?.id || "";
  state.review.taskInputChapterId = resolved;
  state.review.taskInputDraft = reviewEffectiveTaskInputStrings(resolved);
  state.review.taskInputErrors = {};
  state.review.taskInputDrawerOpen = true;
}

function openReviewPromptDrawer(kind = "section") {
  const resolved = REVIEW_PROMPT_DEFINITIONS[kind] ? kind : "section";
  state.review.promptDrawerOpen = true;
  state.review.promptTab = resolved;
  reviewPromptEditorDraft = reviewPromptTemplates[resolved];
  reviewPromptEditorErrors = [];
}

async function runReviewPromptTask(kind, inputs) {
  const definition = REVIEW_PROMPT_DEFINITIONS[kind];
  if (!definition) throw new Error("未知的综述正文任务");
  const validation = validateReviewPromptTemplate(kind, reviewPromptTemplates[kind]);
  if (!validation.valid) throw new Error(validation.errors.join("；"));
  const response = await api("/api/ai", {
    method: "POST",
    body: JSON.stringify({ action: definition.action, promptTemplate: reviewPromptTemplates[kind], inputs }),
  });
  const result = await response.json();
  state.generationMode = result.mode;
  state.generationVerified = result.mode === "model";
  return result.data;
}

function invalidateReviewDownstream() {
  if (state.review.mergedManuscript) state.review.mergedStale = true;
  if (state.review.preflightResult) state.review.preflightStale = true;
}

async function generateReviewSection(chapterId, { throwOnError = false } = {}) {
  const chapter = state.review.outlineChapters.find((item) => item.id === chapterId);
  if (!chapter) throw new Error("未找到需要生成的章节");
  const inputValidation = reviewTaskInputValidation(chapterId);
  if (!inputValidation.valid) {
    const message = `${chapter.title}存在无效任务输入：${Object.values(inputValidation.errors).join("；")}`;
    state.review.sectionRuns[chapterId] = { status: "failed", error: message };
    render();
    if (throwOnError) throw new Error(message);
    return false;
  }
  const hadDraft = state.review.sectionDrafts.some((item) => item.chapter_id === chapterId);
  state.review.sectionRuns[chapterId] = { status: "running", error: "", startedAt: new Date().toISOString() };
  state.review.activeChapterId = chapterId;
  render();
  try {
    const result = await runReviewPromptTask("section", inputValidation.parsed);
    const draft = {
      chapter_id: chapter.id,
      title: chapter.title,
      markdown: String(result?.draft_text || "").trim(),
      updatedAt: new Date().toISOString(),
    };
    if (!draft.markdown) throw new Error("模型未返回章节正文");
    state.review.sectionDrafts = [...state.review.sectionDrafts.filter((item) => item.chapter_id !== chapter.id), draft];
    state.review.sectionRuns[chapterId] = { status: "ready", error: "", updatedAt: draft.updatedAt };
    if (hadDraft || state.review.mergedManuscript) invalidateReviewDownstream();
    saveState();
    render();
    return true;
  } catch (error) {
    state.review.sectionRuns[chapterId] = { status: "failed", error: error.message || "生成失败" };
    state.review.writingPipelineStatus = "failed";
    saveState();
    render();
    if (throwOnError) throw error;
    notify(error.message || "章节生成失败");
    return false;
  }
}

function reviewMergeInputs() {
  const chapterInputs = reviewTaskInputValidation(state.review.outlineChapters[0]?.id || "").parsed;
  const drafts = state.review.outlineChapters.map((chapter) => {
    const draft = state.review.sectionDrafts.find((item) => item.chapter_id === chapter.id);
    return { chapterId: chapter.id, title: chapter.title, draft_text: draft?.markdown || "" };
  });
  return {
    topic_json: chapterInputs.confirmed_topic_json,
    writing_approach_json: chapterInputs.confirmed_approach_json,
    writing_requirements_json: chapterInputs.writing_requirements_json,
    confirmed_outline_json: chapterInputs.confirmed_outline_json,
    section_drafts_json: drafts,
    literature_library_json: reviewNumberedLiterature().map(({ chapterUsages, ...item }) => item),
  };
}

async function integrateReviewManuscript({ automatic = false } = {}) {
  const missing = state.review.outlineChapters.filter((chapter) => !state.review.sectionDrafts.find((item) => item.chapter_id === chapter.id)?.markdown);
  if (missing.length) throw new Error(`仍有 ${missing.length} 个章节未生成，暂不能整合全文`);
  state.review.mergeStatus = "running";
  state.review.mergeError = "";
  state.review.writingPipelineStatus = "merging";
  render();
  try {
    const result = await runReviewPromptTask("merge", reviewMergeInputs());
    state.review.mergedManuscript = String(result?.merged_manuscript || "").trim();
    if (!state.review.mergedManuscript) throw new Error("模型未返回整合后的全文");
    state.review.fullText = { markdown: state.review.mergedManuscript, checks: [], boundary: "内容由 AI 辅助生成，请结合客观事实及相关依据综合判断。" };
    state.review.fullTextStatus = "ready";
    state.review.mergeStatus = "ready";
    state.review.mergedStale = false;
    state.review.preflightStatus = "idle";
    state.review.preflightResult = null;
    state.review.preflightError = "";
    state.review.preflightStale = false;
    state.review.ignoredPreflightTasks = [];
    state.review.preflightPanelOpen = false;
    state.review.writingPipelineStatus = "ready";
    saveState();
    render();
    if (!automatic) notify("全文已按当前章节重新整合");
    return true;
  } catch (error) {
    state.review.mergeStatus = "failed";
    state.review.mergeError = error.message || "全文整合失败";
    state.review.writingPipelineStatus = "failed";
    saveState();
    render();
    if (!automatic) notify(state.review.mergeError);
    return false;
  }
}

async function runReviewWritingPipeline() {
  const invalid = state.review.outlineChapters.map((chapter) => ({ chapter, validation: reviewTaskInputValidation(chapter.id) })).find((entry) => !entry.validation.valid);
  if (invalid) {
    openReviewTaskInputDrawer(invalid.chapter.id);
    state.review.taskInputErrors = invalid.validation.errors;
    render();
    notify(`请先修正“${invalid.chapter.title}”的 JSON 输入`);
    return;
  }
  state.review.stage = "writing";
  state.review.writingPipelineStatus = "running";
  render();
  for (const chapter of state.review.outlineChapters) {
    const draft = state.review.sectionDrafts.find((item) => item.chapter_id === chapter.id);
    const run = state.review.sectionRuns[chapter.id];
    if (run?.status === "ready" && draft?.markdown) continue;
    try { await generateReviewSection(chapter.id, { throwOnError: true }); }
    catch { return; }
  }
  await integrateReviewManuscript({ automatic: true });
}

async function runReviewPreflight() {
  if (!state.review.mergedManuscript || state.review.mergeStatus !== "ready") throw new Error("请先完成全文整合");
  state.review.preflightStatus = "running";
  state.review.preflightError = "";
  state.review.preflightPanelOpen = true;
  render();
  try {
    const firstInputs = reviewTaskInputValidation(state.review.outlineChapters[0]?.id || "").parsed;
    const result = await runReviewPromptTask("preflight", {
      merged_manuscript_json: { markdown: state.review.mergedManuscript },
      writing_requirements_json: firstInputs.writing_requirements_json,
      used_references_json: reviewNumberedLiterature().map(({ chapterUsages, ...item }) => item),
    });
    state.review.preflightResult = result;
    state.review.preflightStatus = "ready";
    state.review.preflightStale = false;
    state.review.ignoredPreflightTasks = [];
    saveState();
    render();
  } catch (error) {
    state.review.preflightStatus = "failed";
    state.review.preflightError = error.message || "全文检查失败";
    saveState();
    render();
  }
}

function normalizeReviewDirection(item, index = 0) {
  return {
    id: String(item.id || `direction-${index + 1}`), title: String(item.direction || item.title || `研究方向 ${index + 1}`), description: String(item.why_explore || item.description || ""), reason: String(item.why_explore || ""),
    decisionTags: (item.recall_focus || []).slice(0, 3), decisionPoints: (item.recall_focus || []).slice(0, 4).map((x) => ({ label: x, detail: x })), searchFocus: (item.recall_focus || []).join("、"), pending: (item.to_verify || []).join("；"), pendingQuestions: item.to_verify || [], keywords: String(item.terms || ""), en_query: String(item.en_query || ""), cn_query: String(item.cn_query || ""), selected: Boolean(item.selected), source: "model",
  };
}

function reviewLiteratureRecord(item, directionId = "") {
  const literatureId = String(item.literatureId || item.recordKey || (item.pmid ? `pmid:${item.pmid}` : `record:${Date.now()}-${Math.random().toString(16).slice(2)}`));
  return { ...item, literatureId, id: literatureId, directionId, status: item.status || "pending", title: String(item.title || "未命名文献"), journal: String(item.journal || ""), year: String(item.year || ""), abstract: String(item.abstract || "") };
}

async function searchReviewDirection(direction) {
  const queries = [direction.en_query, direction.cn_query].filter(Boolean);
  const response = await api("/api/literature/search", { method: "POST", body: JSON.stringify({ queries, query: queries.length ? "" : direction.searchFocus || direction.title, maxResults: 8 }) });
  const result = await response.json();
  return (result.items || []).map((item) => reviewLiteratureRecord(item, direction.id));
}

function reviewStageFrom(stage) {
  return ["direction", "topic-literature", "topic-analysis", "topic", "writing-requirements", "approach", "outline", "evidence-loading", "evidence", "writing", "export"].includes(stage) ? stage : "direction";
}

async function searchEvidenceTopic(topic, topicIndex) {
  topic.citations = [];
  topic.searchError = "";
  state.loading = `正在检索 PubMed（${topicIndex + 1}/${state.evidence.length}）`;
  render();
  try {
    const response = await api("/api/literature/search", {
      method: "POST",
      body: JSON.stringify({ queries: topic.queries || [], query: topic.queries?.length ? "" : topic.question, maxResults: 6 }),
    });
    const result = await response.json();
    topic.citations = (result.items || []).map((item) => ({ ...item, selected: item.selected !== false }));
    topic.searchMeta = { source: result.source, searchedAt: result.searchedAt, matchedCount: result.matchedCount };
    if (!topic.citations.length) {
      topic.summary = "当前检索式未召回 PubMed 文献。可以调整大纲中的文献需求后重新生成，或点击重新检索。";
      return;
    }
    const analysis = await runAI("literature_analysis", {
      question: topic.question,
      items: topic.citations.map(({ pmid, title, journal, year, abstract, publicationTypes }) => ({ pmid, title, journal, year, abstract, publicationTypes })),
      caseBoundary: "只分析当前 PubMed 批次，不得把文献结论写成当前患者事实",
    }, `正在分析当前文献批次（${topicIndex + 1}/${state.evidence.length}）`);
    if (analysis.summary) topic.summary = analysis.summary;
    const assessments = new Map((analysis.assessments || []).map((item) => [String(item.pmid), item.applicability]));
    topic.citations = topic.citations.map((item) => ({ ...item, applicability: assessments.get(String(item.pmid)) || "" }));
  } catch (error) {
    topic.searchError = error.message || "PubMed 检索失败";
    topic.summary = `PubMed 检索未完成：${topic.searchError}`;
  } finally {
    state.loading = "";
  }
}

async function searchAllEvidenceTopics() {
  for (let index = 0; index < state.evidence.length; index += 1) {
    await searchEvidenceTopic(state.evidence[index], index);
  }
  const total = state.evidence.reduce((sum, topic) => sum + (topic.citations?.length || 0), 0);
  if (!total) notify("当前检索批次暂无可用 PubMed 文献");
}

function literatureType(item) {
  const types = (item.publicationTypes || []).join(" ");
  if (/case reports?/i.test(types)) return "病例报告";
  if (/guideline|consensus/i.test(types)) return "指南/共识";
  if (/clinical trial|randomized controlled trial/i.test(types)) return "临床试验";
  if (/review|meta-analysis|systematic review/i.test(types)) return "综述";
  return "原始研究";
}

function literatureRecordKey(item = {}) {
  if (item.recordKey) return String(item.recordKey);
  if (item.pmid) return `pmid:${item.pmid}`;
  if (item.doi) return `doi:${String(item.doi).toLowerCase()}`;
  return `source:${item.source || "record"}:${item.sourceRecordId || `${item.title}-${item.journal}-${item.year}`}`;
}

function literatureIdentifier(item = {}) {
  if (item.pmid) return `PMID: ${item.pmid}`;
  if (item.doi) return `DOI: ${item.doi}`;
  if (item.sourceRecordId) return `${item.source || "来源"} ID: ${item.sourceRecordId}`;
  return "无公开唯一标识";
}

function literatureLanguage(item) {
  const value = String(item.language || "").toLowerCase();
  if (["chi", "zho", "zh", "chinese"].includes(value)) return "中文";
  return "英文";
}

function filteredLiteratureRecords() {
  const literature = state.literature;
  const filters = literature.filters;
  const nowYear = new Date().getFullYear();
  const direction = literature.searchMode === "topic" ? (literature.analysis.directions || []).find((item) => item.id === filters.direction) : null;
  const directionPmids = direction ? new Set(direction.pmids.map(String)) : null;
  const filtered = literature.records.filter((item) => {
    const year = Number(item.year || 0);
    if (filters.time && filters.time !== "custom" && (!year || year < nowYear - Number(filters.time) || year > nowYear)) return false;
    if (filters.time === "custom") {
      const start = Number(filters.customStart || 0);
      const end = Number(filters.customEnd || 9999);
      if (!year || year < start || year > end) return false;
    }
    if (filters.types.length && !filters.types.includes(literatureType(item))) return false;
    if (filters.languages.length && !filters.languages.includes(literatureLanguage(item))) return false;
    if (filters.fulltext.length && !filters.fulltext.includes(item.openAccess ? "开放获取" : "非开放获取")) return false;
    if (filters.jcr.length && !filters.jcr.includes(item.jcr || "")) return false;
    if (filters.ifRanges.length && !filters.ifRanges.some((range) => {
      const value = Number(item.impactFactor);
      if (!Number.isFinite(value)) return false;
      if (range === "<3") return value < 3;
      if (range === "3-10") return value >= 3 && value < 10;
      if (range === "10-30") return value >= 10 && value < 30;
      return value >= 30;
    })) return false;
    if (directionPmids && !directionPmids.has(String(item.pmid))) return false;
    return true;
  });
  if (literature.sort === "latest") return [...filtered].sort((a, b) => Number(b.year || 0) - Number(a.year || 0));
  return filtered;
}

function countLiterature(predicate) {
  return state.literature.records.filter(predicate).length;
}

async function callLiteratureModel(action, context) {
  const response = await api("/api/ai", { method: "POST", body: JSON.stringify({ action, context }) });
  const result = await response.json();
  state.generationMode = result.mode;
  state.generationVerified = result.mode === "model";
  if (result.warning) notify(result.warning);
  return result.data || {};
}

function currentLiteratureHomeDraft() {
  return state.literatureDrafts[state.literatureTab] || "";
}

function singleDimensionPlan(parsedPlan, rawQuery) {
  const query = String(rawQuery || "").trim();
  if (query.match(/10\.\d{4,9}\/[A-Za-z0-9._;()/:+-]+/i)) return specificPlanForDimension("doi", query);
  if (/^(?:PMID\s*[:：]?\s*)?\d{5,9}$/i.test(query)) return specificPlanForDimension("pmid", query);
  let dimension = parsedPlan.journal ? "journal" : parsedPlan.title ? "title" : parsedPlan.author ? "author" : "";
  if (!dimension && /杂志|学报|期刊|journal/i.test(query)) dimension = "journal";
  if (!dimension && /^[\u4e00-\u9fff]{2,4}$/.test(query)) dimension = "author";
  if (!dimension) dimension = "title";
  return specificPlanForDimension(dimension, query);
}

function specificPlanForDimension(dimension, rawQuery) {
  const query = String(rawQuery || "").trim();
  const base = { mode: "specific", priority: "P1", identifierType: "none", pmid: "", doi: "", sourceRecordId: "", title: "", journal: "", author: "", year: "", volume: "", issue: "", pages: "", titleTerms: [] };
  if (dimension === "pmid") {
    const pmid = query.match(/\d{5,9}/)?.[0] || "";
    if (!pmid) throw new Error("请输入 5–9 位 PMID");
    return { ...base, priority: "P0", identifierType: "pmid", pmid, intentSummary: `按 PMID ${pmid} 精确查找文献。` };
  }
  if (dimension === "doi") {
    const doi = query.match(/10\.\d{4,9}\/[A-Za-z0-9._;()/:+-]+/i)?.[0]?.replace(/[.,，。;；]+$/, "").toLowerCase() || "";
    if (!doi) throw new Error("请输入有效 DOI，例如 10.xxxx/xxxxx");
    return { ...base, priority: "P0", identifierType: "doi", doi, intentSummary: `按 DOI ${doi} 精确查找文献。` };
  }
  if (!query) throw new Error(`请输入${SPECIFIC_LOOKUP_OPTIONS[dimension]?.label || "查找内容"}`);
  if (dimension === "journal") return { ...base, journal: query, intentSummary: `按期刊名称“${query}”查找文献。` };
  if (dimension === "title") return { ...base, priority: "P0", title: query.replace(/^[《“"]|[》”"]$/g, ""), intentSummary: `按文献标题“${query}”查找文献。` };
  if (dimension === "author") return { ...base, author: query, intentSummary: `按作者“${query}”查找文献。` };
  throw new Error("请选择查找维度");
}

function snapshotLiteratureSession() {
  const literature = state.literature;
  return JSON.parse(JSON.stringify({
    query: literature.query,
    queryDraft: literature.query,
    phase: "ready",
    phaseText: "",
    records: literature.records,
    matchedCount: literature.matchedCount,
    planQueries: literature.planQueries,
    intentSummary: literature.intentSummary,
    analysis: literature.analysis,
    searchedAt: literature.searchedAt,
    source: literature.source,
    searchMode: literature.searchMode,
    priority: literature.priority,
    specificPlan: literature.specificPlan,
    resultStatus: literature.resultStatus,
    confirmedRecordKey: literature.confirmedRecordKey,
    providerErrors: literature.providerErrors,
    lookupDimension: literature.lookupDimension,
  }));
}

function commitLiteratureHistory() {
  const literature = state.literature;
  const entry = { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, query: literature.query, createdAt: literature.searchedAt || new Date().toISOString(), session: snapshotLiteratureSession() };
  state.literatureHistory = [entry, ...state.literatureHistory.filter((item) => !(item.query === entry.query && (item.session?.searchMode || "topic") === literature.searchMode && (item.session?.lookupDimension || "") === literature.lookupDimension))].slice(0, 12);
}

function literatureHistoryDimension(session = {}) {
  if (SPECIFIC_LOOKUP_OPTIONS[session.lookupDimension]) return session.lookupDimension;
  const plan = session.specificPlan || {};
  return plan.pmid ? "pmid" : plan.doi ? "doi" : plan.journal && !plan.title && !plan.author ? "journal" : plan.title ? "title" : plan.author ? "author" : "";
}

async function runLiteratureSearch(rawQuery = state.screen === "literature-home" ? currentLiteratureHomeDraft() : state.literature.queryDraft, requestedMode = state.screen === "literature-home" ? state.literatureTab : state.literature.searchMode) {
  const query = String(rawQuery || "").trim();
  if (!query) return;
  const searchMode = requestedMode === "specific" ? "specific" : "topic";
  state.screen = "literature-results";
  let lookupDimension = searchMode === "specific" ? state.literature.lookupDimension : "";
  state.literature = { ...initialLiteratureState(), query, queryDraft: query, searchMode, lookupDimension, phase: "planning", phaseText: searchMode === "specific" ? `正在准备${SPECIFIC_LOOKUP_OPTIONS[lookupDimension]?.label || "特定文献"}查找` : "识别研究问题并规划主题检索", panel: "analysis" };
  render();
  try {
    if (searchMode === "specific") {
      const parsedPlan = await callLiteratureModel("literature_specific_plan", { topic: query });
      const specificPlan = singleDimensionPlan(parsedPlan, query);
      lookupDimension = specificPlan.pmid ? "pmid" : specificPlan.doi ? "doi" : specificPlan.journal ? "journal" : specificPlan.author ? "author" : "title";
      state.literature.lookupDimension = lookupDimension;
      state.literature.priority = specificPlan.priority || "P1";
      state.literature.specificPlan = specificPlan;
      state.literature.intentSummary = specificPlan.intentSummary || "已识别特定文献线索";
      state.literature.phase = "searching";
      state.literature.phaseText = "正在多个文献事实源中核对题录线索";
      render();
      const response = await api("/api/literature/specific-search", {
        method: "POST",
        body: JSON.stringify({ query, plan: specificPlan, maxResults: 12 }),
      });
      const result = await response.json();
      state.literature.records = (result.records || result.items || []).map((item, index) => ({
        ...item,
        recordKey: literatureRecordKey(item),
        selected: false,
        relevanceRank: index,
      }));
      state.literature.matchedCount = Number(result.matchedCount ?? state.literature.records.length);
      state.literature.searchedAt = result.searchedAt || new Date().toISOString();
      state.literature.source = result.source || "多来源查找";
      state.literature.resultStatus = result.resultStatus || (state.literature.records.length ? "candidates" : "not_found");
      state.literature.confirmedRecordKey = "";
      state.literature.providerErrors = result.providerErrors || [];
      state.literature.phase = "ready";
      state.literature.phaseText = "";
      commitLiteratureHistory();
      render();
      return;
    }
    const plan = await callLiteratureModel("literature_search_plan", { topic: query });
    state.literature.planQueries = plan.queries?.length ? plan.queries : [query];
    state.literature.intentSummary = plan.intentSummary || "";
    state.literature.phase = "searching";
    state.literature.phaseText = "正在从 PubMed 召回相关文献";
    render();
    const response = await api("/api/literature/search", {
      method: "POST",
      body: JSON.stringify({ queries: state.literature.planQueries, maxResults: 30 }),
    });
    const result = await response.json();
    state.literature.records = (result.items || []).map((item, index) => ({ ...item, selected: true, relevanceRank: index }));
    state.literature.matchedCount = Number(result.matchedCount || result.total || 0);
    state.literature.searchedAt = result.searchedAt || new Date().toISOString();
    state.literature.source = result.source || "PubMed";
    if (!state.literature.records.length) {
      state.literature.phase = "ready";
      state.literature.analysis = { summary: "当前检索式未召回 PubMed 文献，请调整检索主题后重试。", directions: [] };
      commitLiteratureHistory();
      render();
      return;
    }
    state.literature.phase = "analyzing";
    state.literature.phaseText = "分析文献重点并分类，输出文献分析结果";
    render();
    const analysis = await callLiteratureModel("literature_batch_analysis", {
      topic: query,
      items: state.literature.records.map(({ pmid, title, journal, year, abstract, publicationTypes, language, openAccess }) => ({ pmid, title, journal, year, abstract: String(abstract || "").slice(0, 4000), publicationTypes, language, openAccess })),
    });
    const translations = new Map((analysis.titles || []).map((item) => [String(item.pmid), item.titleZh]));
    state.literature.records = state.literature.records.map((item) => ({ ...item, titleZh: translations.get(String(item.pmid)) || "" }));
    state.literature.analysis = { summary: analysis.summary || "", directions: analysis.directions || [] };
    state.literature.phase = "ready";
    state.literature.phaseText = "";
    commitLiteratureHistory();
    render();
  } catch (error) {
    state.literature.phase = "error";
    state.literature.phaseText = "";
    state.literature.error = error.message || "文献检索未完成";
    render();
  }
}

function downloadLiteratureCsv() {
  const selected = state.literature.records.filter((item) => item.selected !== false);
  if (!selected.length) return;
  const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const rows = [
    ["中文题名", "原始题名", "作者", "期刊", "发表年份", "卷", "期", "页码", "文献类型", "PMID", "DOI", "数据来源", "来源记录ID", "来源链接"],
    ...selected.map((item) => [item.titleZh, item.title, (item.authors || []).join("; "), item.journal, item.year, item.volume, item.issue, item.pages, (item.publicationTypes || []).join("; "), item.pmid, item.doi, (item.sources || [item.source]).filter(Boolean).join(" + "), item.sourceRecordId, item.sourceUrl]),
  ];
  const blob = new Blob([`\ufeff${rows.map((row) => row.map(quote).join(",")).join("\r\n")}`], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `ClinPaper_文献_${state.literature.query.slice(0, 30) || "检索结果"}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function resetCaseDownstream() {
  const defaults = initialState();
  state.timeline = [];
  state.requirements = defaults.requirements;
  state.storylines = [];
  state.selectedStoryline = 0;
  state.storylineNote = "";
  state.outlineTitle = "";
  state.outline = [];
  state.evidence = [];
  state.slides = [];
  state.selectedSlide = 0;
  state.pptTemplates = [];
  state.templateRatio = "";
  state.selectedTemplateId = "";
  invalidatePptBuild();
  state.editCase = false;
  state.editTimeline = false;
  state.editOutline = false;
  state.needsReparse = false;
  state.drawer = null;
  state.checks = defaults.checks;
}

function topbar(home = false) {
  const modeLabel = state.generationVerified ? "模型已生成" : state.modelConfigured && state.modelReachable ? "模型已接入" : state.modelConfigured ? "模型不可用" : "演示模式";
  return `<header class="topbar">
    ${home ? `<button class="brand-button" data-action="go-portal" aria-label="返回 ClinPaper 首页"><img class="brand-logo" src="/assets/clinpaper-logo.png" width="152" height="32" alt="ClinPaper"></button>` : `
      <button class="back-btn" data-action="back-home" aria-label="返回首页">‹</button>
      <div class="project-title">
        <strong title="${escapeHtml(state.projectTitle)}">${escapeHtml(state.projectTitle)}</strong>
        <button class="text-action" data-action="rename" aria-label="修改任务名称">✎</button>
        <span class="task-tag">PPT</span>
      </div>
      <span class="mode-tag">${modeLabel}</span>
    `}
    <div class="topbar-spacer"></div>
    <div class="avatar" aria-label="当前用户">CP</div>
  </header>`;
}

const HOME_TABS = ["医学综述", "病例报告", "临床研究"];
const HOME_PLACEHOLDERS = ["请描述研究的背景与目的", "请输入或上传病例资料", "请描述当前临床研究方向"];

const CASE_REPORT_STEPS = [
  ["核对病例资料", "确认病例事实和资料完整度"],
  ["查看相关文献", "了解相似病例和相关研究"],
  ["明确价值与写作思路", "确认病例报告的讨论切入点"],
  ["梳理诊疗经过", "核对关键诊疗事件和时间线"],
  ["补充写作要求", "确认语言、篇幅和引用样式"],
  ["确认大纲", "确认章节结构和写作重点"],
  ["准备正文文献", "核对文献适用性并确认正文用途"],
  ["撰写并检查全文", "生成正文并完成引用与风险检查"],
  ["导出投稿材料", "导出病例报告正文和投稿材料"],
];

function initialCaseReportEvidenceState() {
  return {
    activeChapterId: "intro",
    statusFilter: "all",
    detailId: "",
    saved: false,
    chapters: [
      { id: "intro", title: "引言｜疾病背景与病例价值", purpose: "说明疾病背景、临床挑战和本病例的报告价值。", scope: "外部文献用于支持一般医学观点，不用于补写当前患者事实。" },
      { id: "discussion", title: "讨论｜诊断、治疗与病例比较", purpose: "支持诊断依据、治疗选择和与既往病例的比较。", scope: "引用时需要区分当前病例事实与既往研究结论。" },
    ],
    records: [
      { id: "case-ev-01", chapterId: "intro", title: "Clinical features and diagnostic challenges in rare spinal infection", journal: "BMC Infectious Diseases", year: "2023", type: "综述", fit: "match", use: "支持引言中对疾病背景和常见诊断困难的概括。", basis: "摘要围绕疾病表现、诊断延迟和临床识别难点展开。", limitation: "适合作为背景文献，不能替代当前病例的检查和诊断事实。", source: "摘要", status: "confirmed" },
      { id: "case-ev-02", chapterId: "intro", title: "Delayed diagnosis in uncommon musculoskeletal infections: a clinical review", journal: "Clinical Medicine", year: "2022", type: "综述", fit: "partial", use: "可补充诊断延迟的共性问题，引用时需限定疾病范围。", basis: "文章讨论了少见感染性疾病的就诊和诊断延迟。", limitation: "研究对象并非当前病例对应的单一疾病，不能直接推导病例结论。", source: "摘要", status: "pending" },
      { id: "case-ev-03", chapterId: "discussion", title: "Diagnostic approach to suspected spinal infection: consensus recommendations", journal: "European Spine Journal", year: "2024", type: "指南/专家共识", fit: "match", use: "支持讨论中诊断路径和鉴别诊断依据的概括。", basis: "文献明确讨论了影像、实验室和病原学检查的诊断路径。", limitation: "只能支持一般诊断原则，不能证明当前患者一定符合该路径。", source: "全文", status: "confirmed" },
      { id: "case-ev-04", chapterId: "discussion", title: "Treatment considerations and outcomes in rare spinal infection cases", journal: "Journal of Orthopaedic Case Reports", year: "2021", type: "病例系列", fit: "partial", use: "用于比较既往病例的治疗选择和结局表达。", basis: "研究报告了相似病例的治疗策略、调整原因和随访结局。", limitation: "病例数量有限，不能将其结局直接套用到当前患者。", source: "摘要", status: "pending" },
      { id: "case-ev-05", chapterId: "discussion", title: "A pediatric case series of spinal infection with atypical imaging findings", journal: "Pediatric Radiology", year: "2020", type: "病例系列", fit: "mismatch", use: "不建议用于当前病例正文。", basis: "研究主题涉及相似疾病和影像表现。", limitation: "研究人群为儿童，与当前病例报告的写作范围不一致。", source: "摘要", status: "excluded" },
      { id: "case-ev-06", chapterId: "discussion", title: "Comparing atypical cases with published case reports: reporting considerations", journal: "Case Reports in Medicine", year: "2022", type: "病例报告", fit: "match", use: "支持讨论中与既往病例比较时对相似点、差异点和局限性的表达。", basis: "文章提供了相似病例比较和病例报告讨论的相关内容。", limitation: "引用时仍需逐篇核对病例对象、场景和结局。", source: "全文", status: "suggested" },
    ],
  };
}

function renderPortalHome() {
  const canStart = state.portalText.trim();
  const reportCards = [...state.literatureReports].sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt))).map((report) => ({
    type: "文献解读",
    tone: "teal",
    date: `${report.status === "exported" ? "导出" : "编辑"}于 ${String(report.updatedAt || report.createdAt || "").slice(0, 10).replaceAll("-", "–")}`,
    title: report.title,
    status: ({ generating: "生成中", pending: "正文待确认", confirmed: "已确认 · 可导出", exported: "已导出", error: "生成失败" })[report.status] || "草稿",
    action: "open-literature-report",
    reportId: report.id,
    suffix: "›",
  }));
  const generatedPpt = state.slides.length && state.maxUnlocked >= 8 ? [{
    type: "病例汇报 PPT",
    tone: "ppt",
    date: state.pptGeneratedAt ? `生成于 ${state.pptGeneratedAt.slice(0, 10).replaceAll("-", "–")}` : "最近生成",
    title: state.projectTitle || state.outlineTitle || "病例汇报 PPT",
    status: state.pptBuild ? "PPT 已生成" : "内容已保留 · 需重新生成",
    action: "open-ppt-task",
    suffix: "›",
  }] : [];
  const reviewCard = state.review?.rawInput ? [{ type: "综述", tone: "orange", date: "最近编辑", title: state.review.topics?.find((t) => t.id === state.review.selectedTopicId)?.title || state.review.requirements?.subject || "医学综述", status: state.review.stage === "export" ? "已完成 · 可导出" : `进行中 · ${state.review.stage}`, action: "open-review-task", suffix: "›" }] : [];
  const papers = [
    ...reportCards,
    ...generatedPpt,
    ...reviewCard,
    { type: "综述", tone: "orange", date: "创建于 2025–12–09", title: "每天尼古丁摄入超过50克，五年内患小细胞肺癌的概率分析研究", status: "写作大纲 · 生成中" },
    { type: "病例报告", tone: "purple", date: "编辑于 2025–12–09", title: "妊娠期糖尿病患者产后大出血治疗处理", status: "写作思路" },
    { type: "临床研究", tone: "blue", date: "2025–12–09", title: "吸烟与肺癌死亡的全面分析", status: "生成正文" },
  ];
  app.innerHTML = `<div class="app-shell portal-shell">
    ${topbar(true)}
    <main class="portal-main">
      <section class="portal-hero">
        <img src="/assets/clinpaper-logo.png" width="204" height="44" alt="ClinPaper">
        <p>像聊天一样写论文 · 丁香园</p>
      </section>
      <section class="portal-compose">
        <div class="portal-tabs" role="tablist" aria-label="写作类型">
          ${HOME_TABS.map((tab, index) => `<button role="tab" aria-selected="${state.homeTab === index}" class="${state.homeTab === index ? "active" : ""}" data-action="switch-home-tab" data-index="${index}">${tab}</button>`).join("")}
        </div>
        <div class="portal-editor">
          <textarea id="portal-source" maxlength="12000" placeholder="${HOME_PLACEHOLDERS[state.homeTab]}">${escapeHtml(state.portalText)}</textarea>
          <div class="portal-editor-actions">
            <div class="privacy-note"><span class="privacy-shield">♢</span>资料仅用于本次论文写作，数据将严格保护</div>
            <button class="btn btn-primary portal-start" data-action="portal-start" ${canStart ? "" : "disabled"}>◇ 开始写作</button>
          </div>
        </div>
        <div class="portal-entries">
          <button class="portal-entry" data-action="literature-entry"><img src="/assets/literature-icon.svg" width="24" height="24" alt=""><span><strong>查文献</strong><small>精准检索医学文献，智能总结研究方向</small></span><b>›</b></button>
          <button class="portal-entry" data-action="open-ppt"><img src="/assets/ppt-icon.png" width="24" height="24" alt=""><span><strong>PPT</strong><small>智能总结病例，快速生成汇报 PPT</small></span><b>›</b></button>
        </div>
      </section>
      <section class="paper-section">
        <div class="paper-heading"><h2>我的写作</h2><button data-action="all-writings">全部写作 ›</button></div>
        <div class="paper-grid">${papers.map((paper, index) => `<button class="paper-card" data-action="${paper.action || "paper-card"}" data-index="${index}" ${paper.reportId ? `data-report-id="${escapeHtml(paper.reportId)}"` : ""} aria-label="打开 ${escapeHtml(paper.title)}"><div class="paper-meta"><span class="paper-type ${paper.tone}">${escapeHtml(paper.type)}</span><span>${escapeHtml(paper.date)}</span></div><strong>${escapeHtml(paper.title)}</strong><div class="paper-status"><span>${escapeHtml(paper.status)}</span><span>${paper.suffix || "…"}</span></div></button>`).join("")}</div>
      </section>
    </main>
  </div>`;
}

function reviewMarkdownInline(value) {
  return escapeHtml(value)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(\[(?:\d+(?:\s*[-,，]\s*\d+)*)\])/g, '<span class="review-citation">$1</span>');
}

function renderReviewMarkdown(value) {
  const lines = String(value || "").replace(/\r/g, "").split("\n");
  const html = [];
  for (let index = 0; index < lines.length;) {
    const line = lines[index].trim();
    if (!line) { index += 1; continue; }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const level = Math.min(3, heading[1].length);
      html.push(`<h${level}>${reviewMarkdownInline(heading[2])}</h${level}>`);
      index += 1;
      continue;
    }
    if (/^\|.*\|$/.test(line) && /^\|?\s*:?-+/.test((lines[index + 1] || "").trim())) {
      const rows = [];
      let cursor = index;
      while (cursor < lines.length && /^\|.*\|$/.test(lines[cursor].trim())) {
        rows.push(lines[cursor].trim().slice(1, -1).split("|").map((cell) => cell.trim()));
        cursor += 1;
      }
      const header = rows[0] || [];
      const body = rows.slice(2);
      html.push(`<div class="review-markdown-table-wrap"><table><thead><tr>${header.map((cell) => `<th>${reviewMarkdownInline(cell)}</th>`).join("")}</tr></thead><tbody>${body.map((row) => `<tr>${header.map((_, cellIndex) => `<td>${reviewMarkdownInline(row[cellIndex] || "")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
      index = cursor;
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^[-*]\s+/, ""));
        index += 1;
      }
      html.push(`<ul>${items.map((item) => `<li>${reviewMarkdownInline(item)}</li>`).join("")}</ul>`);
      continue;
    }
    const paragraph = [line];
    index += 1;
    while (index < lines.length && lines[index].trim() && !/^(#{1,3})\s+/.test(lines[index].trim()) && !/^\|.*\|$/.test(lines[index].trim()) && !/^[-*]\s+/.test(lines[index].trim())) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    html.push(`<p>${reviewMarkdownInline(paragraph.join(" "))}</p>`);
  }
  return html.join("");
}

function reviewTocItems(markdown = "") {
  const headings = String(markdown).split(/\r?\n/).map((line) => line.match(/^(#{1,3})\s+(.+)$/)).filter(Boolean);
  return headings.map((match, index) => ({ level: match[1].length, label: match[2].replace(/\*\*/g, ""), id: `review-heading-${index}` }));
}

function renderReviewPromptDrawer() {
  if (!state.review.promptDrawerOpen) return "";
  const kind = state.review.promptTab;
  const definition = REVIEW_PROMPT_DEFINITIONS[kind];
  const validation = validateReviewPromptTemplate(kind, reviewPromptEditorDraft);
  const errors = reviewPromptEditorErrors.length ? reviewPromptEditorErrors : validation.errors;
  return `<div class="review-drawer-overlay" data-action="review-close-prompt-drawer"></div><aside class="review-config-drawer review-prompt-drawer">
    <header><div><small>Demo 全局配置</small><h2>任务设置</h2></div><button data-action="review-close-prompt-drawer" aria-label="关闭">×</button></header>
    <nav>${Object.entries(REVIEW_PROMPT_DEFINITIONS).map(([key, item]) => `<button class="${kind === key ? "active" : ""}" data-action="review-prompt-tab" data-prompt-kind="${key}">${item.label}</button>`).join("")}</nav>
    <section class="review-prompt-meta"><strong>可用变量</strong><div>${definition.variables.map((variable) => `<code>{{${variable}}}</code>`).join("")}</div><p>保存后仅影响下一次执行或重新执行，不自动改写已有结果。</p></section>
    <label class="review-config-editor ${errors.length ? "invalid" : ""}"><span>完整提示词</span><textarea data-review-prompt-editor spellcheck="false">${escapeHtml(reviewPromptEditorDraft)}</textarea></label>
    ${errors.length ? `<div class="review-config-errors">${errors.map((error) => `<p>${escapeHtml(error)}</p>`).join("")}</div>` : `<div class="review-config-valid">✓ 必需变量完整，可以保存</div>`}
    <footer><button data-action="review-restore-prompt">恢复默认提示词</button><span>${reviewPromptEditorDraft === reviewPromptTemplates[kind] ? "当前已保存" : "有未保存修改"}</span><button class="primary" data-action="review-save-prompt" ${validation.valid ? "" : "disabled"}>保存提示词</button></footer>
  </aside>`;
}

function renderReviewTaskInputDrawer() {
  if (!state.review.taskInputDrawerOpen) return "";
  const chapterId = state.review.taskInputChapterId || state.review.outlineChapters[0]?.id || "";
  const draft = state.review.taskInputDraft || reviewEffectiveTaskInputStrings(chapterId);
  const validation = reviewTaskInputValidation(chapterId, draft);
  const errors = { ...validation.errors, ...(state.review.taskInputErrors || {}) };
  return `<div class="review-drawer-overlay" data-action="review-close-task-input"></div><aside class="review-config-drawer review-task-input-drawer">
    <header><div><small>本次综述任务</small><h2>查看任务输入</h2></div><button data-action="review-close-task-input" aria-label="关闭">×</button></header>
    <label class="review-input-chapter"><span>当前章节</span><select data-action="review-task-input-chapter">${state.review.outlineChapters.map((chapter, index) => `<option value="${escapeHtml(chapter.id)}" ${chapter.id === chapterId ? "selected" : ""}>${index + 1}. ${escapeHtml(chapter.title)}</option>`).join("")}</select></label>
    <div class="review-task-input-list">${REVIEW_TASK_INPUT_FIELDS.map(([key, label]) => `<section class="${errors[key] ? "invalid" : ""}"><header><div><strong>${label}</strong><code>${key}</code></div><div><button data-action="review-format-task-input" data-input-key="${key}">格式化</button><button data-action="review-restore-task-input" data-input-key="${key}">恢复系统值</button></div></header><textarea data-review-task-input="${key}" spellcheck="false">${escapeHtml(draft[key] || "")}</textarea>${errors[key] ? `<p>${escapeHtml(errors[key])}</p>` : `<p class="valid">✓ JSON 格式有效</p>`}</section>`).join("")}</div>
    <footer><span>${validation.valid ? "全部输入可用于章节生成" : `有 ${Object.keys(errors).length} 项需要修正`}</span><button class="primary" data-action="review-save-task-input" ${validation.valid ? "" : "disabled"}>保存本章输入</button></footer>
  </aside>`;
}

function renderReviewSectionEditorDrawer() {
  const chapter = state.review.outlineChapters.find((item) => item.id === state.review.sectionEditorChapterId);
  if (!chapter) return "";
  return `<div class="review-drawer-overlay" data-action="review-close-section-editor"></div><aside class="review-config-drawer review-section-editor-drawer"><header><div><small>章节正文</small><h2>${escapeHtml(chapter.title)}</h2></div><button data-action="review-close-section-editor">×</button></header><label class="review-config-editor"><span>Markdown 正文</span><textarea data-review-section-editor spellcheck="false">${escapeHtml(state.review.sectionEditorDraft || "")}</textarea></label><footer><span>保存后全文整合和检查结果将标记为已过期</span><button class="primary" data-action="review-save-section-editor">保存修改</button></footer></aside>`;
}

function renderReviewGlobalDrawers() {
  return `${renderReviewTaskInputDrawer()}${renderReviewPromptDrawer()}${renderReviewSectionEditorDrawer()}`;
}

function reviewTopbar() {
  const modeLabel = state.generationVerified ? "AI 已生成" : state.modelConfigured && state.modelReachable ? "AI 已接入" : state.modelConfigured ? "AI 暂不可用" : "演示模式";
  const showSettings = ["evidence", "evidence-loading", "writing", "export"].includes(state.review.stage);
  return `<header class="review-topbar">
    <button class="review-back" data-action="go-portal" aria-label="返回首页">‹</button>
    <strong>${escapeHtml(state.review.topics?.find((item) => item.id === state.review.selectedTopicId)?.title || "脊柱结核诊断研究进展")}</strong>
    <span class="review-task-tag">论文概览&nbsp;&nbsp; 综述⌄</span>
    <div class="review-topbar-spacer"></div>
    ${showSettings ? `<button class="review-topbar-setting" data-action="review-open-prompt-drawer">任务设置</button>` : ""}
    <span class="mode-tag review-model-status">${modeLabel}</span>
    <span class="review-avatar"><img src="/assets/figma-review-avatar.png" alt=""></span>
  </header>`;
}

function reviewSidebar(activeIndex = 0) {
  const items = ["明确需求与方向", "筛选选题文献", "确认选题", "设计写作方案", "文献与证据", "正文编辑", "检查与导出"];
  const stages = { 0: "direction", 1: "topic-literature", 2: "topic", 3: "approach", 4: "evidence", 5: "writing", 6: "export" };
  return `<aside class="review-sidebar"><ol>${items.map((label, index) => `<li class="${index === activeIndex ? "active" : index < activeIndex ? "done" : ""}">
    <span class="review-step-track"><i></i></span>
    <button ${stages[index] ? `data-action="review-jump-stage" data-stage="${stages[index]}"` : "disabled"}>${label}${index > 2 ? "<b>⌄</b>" : ""}</button>
  </li>`).join("")}</ol></aside>`;
}

function reviewRiskTone(type) {
  return { "选题边界": "boundary", "证据不足": "evidence", "重复风险": "duplicate", "信息限制": "limitation" }[type] || "limitation";
}

function sortedReviewRisks(risks) {
  const rank = { "高": 0, "中": 1, "低": 2 };
  return [...(Array.isArray(risks) ? risks : [])].sort((a, b) => (rank[a.level] ?? 3) - (rank[b.level] ?? 3));
}

function renderReviewTopicCard(topic) {
  const selected = topic.id === state.review.selectedTopicId;
  const active = topic.id === state.review.activeTopicId;
  const risks = sortedReviewRisks(topic.risks);
  return `<article class="review-topic-card ${selected ? "selected" : ""} ${active ? "active" : ""}">
    <label class="review-topic-radio">
      <input type="radio" name="review-topic-choice" data-review-topic-choice="${escapeHtml(topic.id)}" ${selected ? "checked" : ""}>
      <span></span><strong>${escapeHtml(topic.title)}</strong>
    </label>
    <div class="review-topic-question"><span>核心问题</span><p>${escapeHtml(topic.coreQuestion)}</p></div>
    <div class="review-topic-risks"><span>风险提示</span><div>${risks.map((risk) => `<i class="${reviewRiskTone(risk.type)}"><b class="level-${risk.level === "高" ? "high" : risk.level === "中" ? "medium" : "low"}">${escapeHtml(risk.level || "待定")}</b>${escapeHtml(risk.type)}</i>`).join("") || "<em>暂未识别到明确风险</em>"}</div></div>
    <button class="review-topic-analysis-action" data-action="review-show-topic-analysis" data-topic-id="${escapeHtml(topic.id)}">${active ? "正在查看" : "查看分析"}<span>›</span></button>
  </article>`;
}

function renderReviewAnalysisPoints(points) {
  const visiblePoints = (Array.isArray(points) ? points : []).filter(Boolean);
  if (!visiblePoints.length) return `<p class="review-analysis-empty">当前信息不足，暂不能判断。</p>`;
  if (visiblePoints.length === 1) return `<p class="review-analysis-single">${escapeHtml(visiblePoints[0])}</p>`;
  return `<ul class="review-analysis-points">${visiblePoints.map((point) => `<li>${escapeHtml(point)}</li>`).join("")}</ul>`;
}

function renderReviewAnalysisNarrative(content) {
  const parts = (Array.isArray(content) ? content : [content]).filter(Boolean);
  if (!parts.length) return `<p class="review-analysis-empty">当前信息不足，暂不能判断。</p>`;
  const narrative = parts.map((part) => /[。！？]$/.test(part) ? part : `${part}。`).join("");
  return `<p class="review-analysis-narrative">${escapeHtml(narrative)}</p>`;
}

function renderReviewTopicAnalysis(topic) {
  if (!topic) return `<aside class="review-topic-analysis empty"><p>选择一个候选题目查看分析。</p></aside>`;
  const risks = sortedReviewRisks(topic.risks);
  return `<aside class="review-topic-analysis">
    <header><span>题目分析</span><h2>${escapeHtml(topic.title)}</h2><p>基于本轮选题文献的聚类分析结果</p></header>
    <div class="review-topic-analysis-body">
      <section class="review-analysis-core"><h3>核心问题</h3><p>${escapeHtml(topic.coreQuestion)}</p></section>
      <section class="review-analysis-risks"><h3>需要注意的风险</h3><div>${risks.map((risk) => `<article><div><b class="level-${risk.level === "高" ? "high" : risk.level === "中" ? "medium" : "low"}">${escapeHtml(risk.level || "待定")}</b><span class="${reviewRiskTone(risk.type)}">${escapeHtml(risk.type)}</span></div><p>${escapeHtml(risk.detail)}</p></article>`).join("") || "<p>当前分析暂未识别到明确风险，仍需结合后续文献核对。</p>"}</div></section>
      <section><h3>研究问题与范围</h3>${renderReviewAnalysisPoints(topic.analysis?.scope || [topic.scope?.subject, topic.scope?.focus, topic.scope?.excluded])}</section>
      <section><h3>与已有综述的差异</h3>${renderReviewAnalysisNarrative(topic.analysis?.difference || [topic.difference?.similar, topic.difference?.focus, topic.difference?.change])}</section>
      <section><h3>当前文献覆盖</h3>${renderReviewAnalysisPoints(topic.analysis?.coverage || [topic.coverage?.themes, topic.coverage?.studies, topic.coverage?.covered])}</section>
      <section><h3>当前文献缺口</h3>${renderReviewAnalysisPoints(topic.analysis?.gaps || [topic.gaps?.limited, topic.gaps?.missingTypes, topic.gaps?.missingComparison, topic.gaps?.next])}</section>
    </div>
  </aside>`;
}

function renderReviewTopicWorkspace() {
  const topics = state.review.topics || [];
  const activeTopic = topics.find((item) => item.id === state.review.activeTopicId) || topics[0];
  const selectedTopic = topics.find((item) => item.id === state.review.selectedTopicId);
  return `<div class="app-shell review-shell">${reviewTopbar()}<div class="review-workspace review-topic-workspace">
    ${reviewSidebar(2)}
    <main class="review-topic-main">
      <header class="review-page-head"><span class="review-page-step">确认选题</span><h1>选择这篇综述要回答的题目</h1><p>先比较每个题目的核心问题，需要进一步判断时再查看右侧分析。</p></header>
      <section class="review-topic-list-head"><div><h2>候选题目</h2><p>单选，当前选择将用于后续写作方案和文献补充。</p></div><span>共 ${topics.length} 个</span></section>
      <div class="review-topic-list">${topics.map(renderReviewTopicCard).join("")}</div>
      <footer class="review-topic-footer"><div><span>当前选择</span><strong>${escapeHtml(selectedTopic?.title || "尚未选择题目")}</strong></div><button class="review-save" data-action="review-confirm-topic" ${selectedTopic ? "" : "disabled"}>确认题目，设计写作方案&nbsp; →</button></footer>
    </main>
    ${renderReviewTopicAnalysis(activeTopic)}
  </div></div>`;
}

function reviewOutlineEvidenceCount(chapter) {
  const generated = String(chapter.evidenceNeed || "").split("\n").map((item) => item.trim()).filter(Boolean);
  const supplemental = Array.isArray(chapter.evidenceExtra) ? chapter.evidenceExtra.filter(Boolean) : [];
  return generated.length + supplemental.length;
}

function regeneratedReviewOutlineEvidence(chapter) {
  const points = reviewOutlinePointTexts(chapter).slice(0, 4);
  const suffixes = ["相关的指南、共识或高质量综述", "相关的临床研究或直接比较研究", "相关的系统综述或方法学研究", "相关的外部验证或临床应用研究"];
  if (points.length) return points.map((point, index) => `${point}${suffixes[index]}`).join("\n");
  const purpose = String(chapter.purpose || chapter.title || "本章主题").trim();
  return `${purpose}相关的临床研究\n能够说明本章证据边界的系统综述`;
}

function markReviewOutlineEvidenceStale(chapter, sourceElement) {
  chapter.evidenceStatus = "stale";
  const evidencePanel = sourceElement?.closest(".review-outline-chapter")?.querySelector(".review-outline-evidence");
  const evidenceSummary = evidencePanel?.querySelector("summary");
  if (evidenceSummary && !evidenceSummary.querySelector("[data-outline-evidence-status]")) {
    evidenceSummary.insertAdjacentHTML("beforeend", `<i data-outline-evidence-status="${escapeHtml(chapter.id)}">待更新</i>`);
  }
  const evidenceBody = evidencePanel?.querySelector(".review-outline-evidence-body");
  if (evidenceBody && !evidenceBody.querySelector(".review-outline-evidence-update")) {
    evidenceBody.insertAdjacentHTML("afterbegin", `<div class="review-outline-evidence-update"><span>章节内容已修改，需要重新生成证据需求。</span><button data-action="review-refresh-outline-evidence" data-chapter-id="${escapeHtml(chapter.id)}">更新需求</button></div>`);
  }
}

function renderReviewOutlinePoints(chapter) {
  const points = reviewOutlinePoints(chapter);
  return `<div class="review-outline-points">
    <div class="review-outline-points-head"><span>主要内容</span><small>${points.length} 项</small></div>
    <ol class="review-outline-point-list">
      ${points.map((point, index) => `<li class="review-outline-point ${point.text.trim() ? "" : "empty"}" data-outline-point-row data-chapter-id="${escapeHtml(chapter.id)}" data-point-id="${escapeHtml(point.id)}">
        <button class="review-outline-point-drag" draggable="true" data-outline-point-drag="${escapeHtml(point.id)}" data-chapter-id="${escapeHtml(chapter.id)}" title="拖动调整要点顺序" aria-label="拖动调整第 ${index + 1} 条要点顺序">⋮⋮</button>
        <span>${index + 1}</span>
        <textarea data-review-outline-point="${escapeHtml(point.id)}" data-chapter-id="${escapeHtml(chapter.id)}" rows="1" maxlength="160" placeholder="输入这一部分准备讨论的内容" aria-label="第 ${index + 1} 条内容要点">${escapeHtml(point.text)}</textarea>
        <div class="review-outline-point-actions">
          <button data-action="review-move-outline-point" data-direction="up" data-chapter-id="${escapeHtml(chapter.id)}" data-point-id="${escapeHtml(point.id)}" ${index === 0 ? "disabled" : ""} title="上移要点" aria-label="上移第 ${index + 1} 条要点">↑</button>
          <button data-action="review-move-outline-point" data-direction="down" data-chapter-id="${escapeHtml(chapter.id)}" data-point-id="${escapeHtml(point.id)}" ${index === points.length - 1 ? "disabled" : ""} title="下移要点" aria-label="下移第 ${index + 1} 条要点">↓</button>
          <button class="danger" data-action="review-delete-outline-point" data-chapter-id="${escapeHtml(chapter.id)}" data-point-id="${escapeHtml(point.id)}" ${points.length <= 1 ? "disabled" : ""} title="删除要点" aria-label="删除第 ${index + 1} 条要点">×</button>
        </div>
      </li>`).join("")}
    </ol>
    <button class="review-outline-point-add" data-action="review-add-outline-point" data-chapter-id="${escapeHtml(chapter.id)}" ${points.length >= 6 ? "disabled" : ""}>＋ 添加内容要点</button>
  </div>`;
}

function renderReviewOutlineEvidence(chapter) {
  const generated = String(chapter.evidenceNeed || "").split("\n").map((item) => item.trim()).filter(Boolean);
  const supplemental = Array.isArray(chapter.evidenceExtra) ? chapter.evidenceExtra.filter(Boolean) : [];
  const isDrafting = state.review.evidenceDraftChapterId === chapter.id;
  const stale = chapter.evidenceStatus === "stale";
  const items = [
    ...generated.map((text, index) => ({ text, index, source: "generated" })),
    ...supplemental.map((text, index) => ({ text, index, source: "supplemental" })),
  ];
  return `<details class="review-outline-evidence" ${isDrafting ? "open" : ""}>
    <summary>后续证据需求 <small data-outline-evidence-count="${escapeHtml(chapter.id)}">${items.length} 项</small>${stale ? `<i data-outline-evidence-status="${escapeHtml(chapter.id)}">待更新</i>` : ""}</summary>
    <div class="review-outline-evidence-body">
      ${stale ? `<div class="review-outline-evidence-update"><span>章节内容已修改，需要重新生成证据需求。</span><button data-action="review-refresh-outline-evidence" data-chapter-id="${escapeHtml(chapter.id)}">更新需求</button></div>` : ""}
      <ul>${items.map((item) => `<li><span>${escapeHtml(item.text)}${item.source === "supplemental" ? "<em>用户补充</em>" : ""}</span><button data-action="review-remove-outline-evidence" data-chapter-id="${escapeHtml(chapter.id)}" data-evidence-source="${item.source}" data-evidence-index="${item.index}" title="移除该证据需求" aria-label="移除证据需求">×</button></li>`).join("") || `<li class="empty">暂无证据需求</li>`}</ul>
      ${isDrafting ? `<div class="review-outline-evidence-form"><input data-review-evidence-draft value="${escapeHtml(state.review.evidenceDraft)}" maxlength="100" placeholder="例如：优先查找近 5 年的多中心研究" aria-label="补充证据要求"><button data-action="review-cancel-outline-evidence">取消</button><button class="primary" data-action="review-save-outline-evidence" data-chapter-id="${escapeHtml(chapter.id)}" ${state.review.evidenceDraft.trim() ? "" : "disabled"}>添加</button></div>` : `<button class="review-outline-evidence-add" data-action="review-add-outline-evidence" data-chapter-id="${escapeHtml(chapter.id)}">＋ 补充证据要求</button>`}
    </div>
  </details>`;
}

function renderReviewOutlineChapter(chapter, index, count) {
  return `<article class="review-outline-chapter" data-outline-chapter-id="${escapeHtml(chapter.id)}">
    <header>
      <button class="review-outline-drag" draggable="true" data-outline-drag="${escapeHtml(chapter.id)}" title="拖动调整章节顺序" aria-label="拖动调整第 ${index + 1} 章顺序">⋮⋮</button>
      <span class="review-outline-number">${String(index + 1).padStart(2, "0")}</span>
      <input class="review-outline-title-input" data-review-outline-field="title" data-chapter-id="${escapeHtml(chapter.id)}" value="${escapeHtml(chapter.title)}" maxlength="80" aria-label="第 ${index + 1} 章标题">
      <div class="review-outline-chapter-actions">
        <button data-action="review-move-outline" data-direction="up" data-chapter-id="${escapeHtml(chapter.id)}" ${index === 0 ? "disabled" : ""} title="上移章节" aria-label="上移第 ${index + 1} 章">↑</button>
        <button data-action="review-move-outline" data-direction="down" data-chapter-id="${escapeHtml(chapter.id)}" ${index === count - 1 ? "disabled" : ""} title="下移章节" aria-label="下移第 ${index + 1} 章">↓</button>
        <button class="danger" data-action="review-delete-outline" data-chapter-id="${escapeHtml(chapter.id)}" title="删除章节" aria-label="删除第 ${index + 1} 章">×</button>
      </div>
    </header>
    <div class="review-outline-chapter-body">
      <label class="review-outline-purpose"><span>本章回答</span><textarea data-review-outline-field="purpose" data-chapter-id="${escapeHtml(chapter.id)}" rows="2" maxlength="180">${escapeHtml(chapter.purpose)}</textarea></label>
      ${renderReviewOutlinePoints(chapter)}
      <label class="review-outline-length"><span>预计篇幅</span><div><input type="number" min="200" max="5000" step="100" data-review-outline-field="wordCount" data-chapter-id="${escapeHtml(chapter.id)}" value="${Number(chapter.wordCount) || 800}" aria-label="第 ${index + 1} 章预计字数"><em>字</em></div></label>
      ${renderReviewOutlineEvidence(chapter)}
    </div>
  </article>`;
}

function renderReviewOutlineContext(topic) {
  const requirements = state.review.requirements;
  return `<aside class="review-outline-context">
    <header><span>当前写作设定</span><button data-action="review-jump-stage" data-stage="topic">回看选题&nbsp; ›</button></header>
    <section><span>已确认题目</span><h2>${escapeHtml(topic?.title || "尚未确认题目")}</h2></section>
    <section><span>核心问题</span><p>${escapeHtml(topic?.coreQuestion || "暂无")}</p></section>
    <section><span>写作思路</span><p>${escapeHtml(state.review.writingApproach)}</p></section>
    <section><span>写作要求</span><dl><dt>重点关注</dt><dd>${escapeHtml(requirements.focus.join("、"))}</dd><dt>补充要求</dt><dd>${escapeHtml(requirements.extra || "暂无")}</dd></dl></section>
  </aside>`;
}

function renderReviewOutlineWorkspace() {
  const chapters = state.review.outlineChapters || [];
  const topic = state.review.topics.find((item) => item.id === state.review.selectedTopicId);
  const wordCount = chapters.reduce((total, chapter) => total + (Number(chapter.wordCount) || 0), 0);
  const hasEmptyPoint = chapters.some((chapter) => !reviewOutlinePoints(chapter).length || reviewOutlinePoints(chapter).some((point) => !point.text.trim()));
  return `<div class="app-shell review-shell">${reviewTopbar()}<div class="review-workspace review-outline-workspace">
    ${reviewSidebar(3)}
    <main class="review-outline-main">
      <header class="review-page-head"><span class="review-page-step">设计写作方案 · 确认大纲</span><h1>确认文章准备怎么讲</h1><p>检查章节是否完整、顺序是否合理，并调整每章的论述重点。</p></header>
      <section class="review-outline-storyline">
        <header><div><span>文章主线</span><strong>${escapeHtml(state.review.writingApproach)}</strong></div><span data-outline-total-short>${chapters.length} 章 · 约 ${wordCount.toLocaleString("zh-CN")} 字</span></header>
        <ol>${chapters.map((chapter, index) => `<li><span>${index + 1}</span><b data-outline-summary-id="${escapeHtml(chapter.id)}">${escapeHtml(chapter.title || "未命名章节")}</b></li>`).join("")}</ol>
      </section>
      <section class="review-outline-list-section">
        <header><div><h2>章节安排</h2><p>章节修改会作为后续查找证据和生成正文的依据。</p></div><button class="review-outline-add" data-action="review-add-outline">＋ 增加章节</button></header>
        <div class="review-outline-list">${chapters.map((chapter, index) => renderReviewOutlineChapter(chapter, index, chapters.length)).join("")}</div>
      </section>
      <footer class="review-outline-footer"><div><span>${hasEmptyPoint ? "请完善空白内容要点" : "当前大纲"}</span><strong data-outline-total-long>${chapters.length} 个章节 · 约 ${wordCount.toLocaleString("zh-CN")} 字</strong></div><button class="review-save" data-action="review-confirm-outline" ${chapters.length && !hasEmptyPoint ? "" : "disabled"}>确认大纲，查找正文文献&nbsp; →</button></footer>
    </main>
    ${renderReviewOutlineContext(topic)}
  </div></div>`;
}

const REVIEW_EVIDENCE_STATUS = {
  priority: { label: "优先引用", short: "优先" },
  keep: { label: "可引用", short: "可引用" },
  omit: { label: "不纳入写作", short: "不纳入" },
  pending: { label: "待处理", short: "待处理" },
};

const REVIEW_EVIDENCE_TYPES = ["指南/专家共识", "系统评价/Meta分析", "随机对照试验", "队列研究", "病例对照研究", "诊断试验", "综述", "方法学研究"];
const REVIEW_EVIDENCE_JCR = ["Q1", "Q2", "Q3", "Q4", "暂无"];
const REVIEW_EVIDENCE_IMPACT = [
  { value: "ge10", label: "≥10" },
  { value: "5to10", label: "5–10" },
  { value: "3to5", label: "3–5" },
  { value: "lt3", label: "＜3" },
  { value: "unknown", label: "暂无影响因子" },
];

function normalizeReviewEvidenceItem(item) {
  const normalized = item || {};
  if (!Array.isArray(normalized.chapterUsages)) {
    const legacyStatus = ["priority", "keep", "pending"].includes(normalized.status) ? normalized.status : "keep";
    normalized.chapterUsages = normalized.chapterId ? [{
      chapterId: normalized.chapterId,
      status: legacyStatus,
      use: normalized.use || "用于支持本章论述。",
    }] : [];
  }
  const usageByChapter = new Map();
  normalized.chapterUsages
    .filter((usage) => usage?.chapterId)
    .forEach((usage) => {
      const chapterId = String(usage.chapterId);
      usageByChapter.set(chapterId, {
        chapterId,
        status: ["priority", "keep", "pending"].includes(usage.status) ? usage.status : "keep",
        use: String(usage.use || normalized.use || "用于支持本章论述。"),
      });
    });
  normalized.chapterUsages = [...usageByChapter.values()];
  if (normalized.includedInWriting === undefined) normalized.includedInWriting = normalized.status !== "omit";
  return normalized;
}

function normalizeReviewEvidenceRecords() {
  state.review.writingEvidence = (state.review.writingEvidence || []).map(normalizeReviewEvidenceItem);
  return state.review.writingEvidence;
}

function reviewEvidenceUsage(item, chapterId) {
  return normalizeReviewEvidenceItem(item).chapterUsages.find((usage) => usage.chapterId === chapterId);
}

function reviewEvidenceStatusInContext(item, chapterId = state.review.evidenceChapterFilter || "all") {
  if (!normalizeReviewEvidenceItem(item).includedInWriting) return "omit";
  if (chapterId !== "all") return reviewEvidenceUsage(item, chapterId)?.status || "pending";
  if (item.chapterUsages.some((usage) => usage.status === "pending")) return "pending";
  if (item.chapterUsages.some((usage) => usage.status === "priority")) return "priority";
  if (item.chapterUsages.length) return "keep";
  return "pending";
}

function reviewEvidenceChapterName(chapterId) {
  const index = state.review.outlineChapters.findIndex((chapter) => chapter.id === chapterId);
  const chapter = state.review.outlineChapters[index];
  return chapter ? `第 ${index + 1} 章 ${chapter.title}` : "已删除章节";
}

function reviewEvidenceMatchesAdvanced(item) {
  const filters = state.review.evidenceFilters || {};
  if (filters.types?.length && !filters.types.includes(item.filterType || item.studyType)) return false;
  const year = Number(item.year);
  if (filters.yearMode && filters.yearMode !== "all") {
    if (filters.yearMode === "custom") {
      const start = Number(filters.yearStart);
      const end = Number(filters.yearEnd);
      if ((start && year < start) || (end && year > end)) return false;
    } else {
      const years = Number(filters.yearMode);
      if (years && year < new Date().getFullYear() - years + 1) return false;
    }
  }
  if (filters.jcr?.length && !filters.jcr.includes(item.jcr || "暂无")) return false;
  if (filters.impact?.length) {
    const impact = Number(item.impactFactor);
    const unknown = item.impactFactor === null || item.impactFactor === undefined || item.impactFactor === "";
    const matches = filters.impact.some((range) =>
      (range === "unknown" && unknown)
      || (range === "ge10" && !unknown && impact >= 10)
      || (range === "5to10" && !unknown && impact >= 5 && impact < 10)
      || (range === "3to5" && !unknown && impact >= 3 && impact < 5)
      || (range === "lt3" && !unknown && impact < 3));
    if (!matches) return false;
  }
  return true;
}

function reviewEvidenceContextRecords() {
  const chapter = state.review.evidenceChapterFilter || "all";
  return normalizeReviewEvidenceRecords().filter((item) =>
    (chapter === "all" || Boolean(reviewEvidenceUsage(item, chapter))) && reviewEvidenceMatchesAdvanced(item));
}

function reviewEvidenceRecords() {
  const status = state.review.evidenceStatusFilter || "all";
  const chapter = state.review.evidenceChapterFilter || "all";
  return reviewEvidenceContextRecords().filter((item) => status === "all" || reviewEvidenceStatusInContext(item, chapter) === status);
}

function reviewEvidenceActiveFilterCount() {
  const filters = state.review.evidenceFilters || {};
  return Number(Boolean(filters.types?.length))
    + Number(filters.yearMode && filters.yearMode !== "all" && (filters.yearMode !== "custom" || filters.yearStart || filters.yearEnd))
    + Number(Boolean(filters.jcr?.length))
    + Number(Boolean(filters.impact?.length));
}

function renderReviewEvidenceFilterChips() {
  const filters = state.review.evidenceFilters || {};
  const chips = [];
  if (filters.types?.length) chips.push(["types", `论文类型：${filters.types.join("、")}`]);
  if (filters.yearMode && filters.yearMode !== "all" && (filters.yearMode !== "custom" || filters.yearStart || filters.yearEnd)) {
    const yearLabel = filters.yearMode === "custom"
      ? `发表年份：${filters.yearStart || "不限"}–${filters.yearEnd || "不限"}`
      : `发表年份：近${filters.yearMode}年`;
    chips.push(["year", yearLabel]);
  }
  if (filters.jcr?.length) chips.push(["jcr", `JCR：${filters.jcr.join("、")}`]);
  if (filters.impact?.length) {
    const labels = REVIEW_EVIDENCE_IMPACT.filter((item) => filters.impact.includes(item.value)).map((item) => item.label);
    chips.push(["impact", `影响因子：${labels.join("、")}`]);
  }
  if (!chips.length) return "";
  return `<div class="review-evidence-filter-chips">${chips.map(([key, label]) => `<button data-action="review-evidence-clear-filter" data-filter="${key}">${escapeHtml(label)}<span>×</span></button>`).join("")}<button class="clear-all" data-action="review-evidence-clear-all">清除全部</button></div>`;
}

function renderReviewEvidenceAdvancedFilters() {
  if (!state.review.evidenceAdvancedOpen) return "";
  const filters = state.review.evidenceFilters || {};
  const checkbox = (kind, value, label, checked) => `<label><input type="checkbox" data-action="review-evidence-filter-option" data-filter="${kind}" value="${escapeHtml(value)}" ${checked ? "checked" : ""}><span></span>${escapeHtml(label)}</label>`;
  return `<section class="review-evidence-advanced" aria-label="更多筛选">
    <header><div><h3>更多筛选</h3><p>论文类型和年份优先用于缩小证据范围；JCR 与影响因子仅用于筛选期刊。</p></div><button data-action="review-evidence-toggle-advanced" aria-label="关闭更多筛选">×</button></header>
    <div class="review-evidence-filter-grid">
      <fieldset><legend>论文类型</legend><div>${REVIEW_EVIDENCE_TYPES.map((value) => checkbox("types", value, value, filters.types?.includes(value))).join("")}</div></fieldset>
      <fieldset><legend>发表年份</legend><div class="review-evidence-year-options">${[["all", "不限"], ["3", "近3年"], ["5", "近5年"], ["10", "近10年"], ["custom", "自定义"]].map(([value, label]) => `<button class="${filters.yearMode === value ? "active" : ""}" data-action="review-evidence-year" data-year="${value}">${label}</button>`).join("")}</div>${filters.yearMode === "custom" ? `<div class="review-evidence-year-range"><input type="number" min="1900" max="2099" aria-label="起始年份" placeholder="起始年份" data-action="review-evidence-year-bound" data-bound="yearStart" value="${escapeHtml(filters.yearStart || "")}"><span>至</span><input type="number" min="1900" max="2099" aria-label="结束年份" placeholder="结束年份" data-action="review-evidence-year-bound" data-bound="yearEnd" value="${escapeHtml(filters.yearEnd || "")}"></div>` : ""}</fieldset>
      <fieldset><legend>JCR 分区</legend><div>${REVIEW_EVIDENCE_JCR.map((value) => checkbox("jcr", value, value === "暂无" ? "暂无分区信息" : value, filters.jcr?.includes(value))).join("")}</div></fieldset>
      <fieldset><legend>影响因子</legend><div>${REVIEW_EVIDENCE_IMPACT.map((item) => checkbox("impact", item.value, item.label, filters.impact?.includes(item.value))).join("")}</div></fieldset>
    </div>
  </section>`;
}

function reviewEvidenceCounts(records = normalizeReviewEvidenceRecords(), chapterId = state.review.evidenceChapterFilter || "all") {
  return records.reduce((counts, item) => {
    const status = reviewEvidenceStatusInContext(item, chapterId);
    counts[status] = (counts[status] || 0) + 1;
    return counts;
  }, { priority: 0, keep: 0, omit: 0, pending: 0 });
}

function reviewEvidenceTableSummary(item) {
  if (!item.includedInWriting) return { className: "omit", label: "不纳入写作" };
  if (!item.chapterUsages.length) return { className: "pending", label: "尚未分配" };
  const pending = item.chapterUsages.filter((usage) => usage.status === "pending").length;
  if (pending) return { className: "pending", label: `${pending} 处待处理` };
  return { className: "done", label: "已完成" };
}

function renderReviewEvidenceChapterCells(item) {
  if (!item.chapterUsages.length) return `<span class="review-evidence-table-muted">尚未分配章节</span>`;
  const visible = item.chapterUsages.slice(0, 2);
  return `<div class="review-evidence-table-chapters">${visible.map((usage) => {
    const index = state.review.outlineChapters.findIndex((chapter) => chapter.id === usage.chapterId);
    const chapterLabel = index >= 0 ? `第 ${index + 1} 章` : "已删除章节";
    return `<span class="${escapeHtml(usage.status)}" title="${escapeHtml(reviewEvidenceChapterName(usage.chapterId))}"><b>${chapterLabel}</b>${escapeHtml(REVIEW_EVIDENCE_STATUS[usage.status]?.label || "待处理")}</span>`;
  }).join("")}${item.chapterUsages.length > 2 ? `<em>+${item.chapterUsages.length - 2}</em>` : ""}</div>`;
}

function renderReviewEvidenceTableRow(item) {
  normalizeReviewEvidenceItem(item);
  const currentChapterId = state.review.evidenceChapterFilter || "all";
  const currentUsage = currentChapterId === "all" ? null : reviewEvidenceUsage(item, currentChapterId);
  const selected = state.review.selectedEvidenceIds.includes(item.id);
  const summary = reviewEvidenceTableSummary(item);
  const hasImpactFactor = item.impactFactor !== null && item.impactFactor !== undefined && item.impactFactor !== "";
  const titleZh = item.titleZh || item.zhTitle || "";
  const documentCell = `<div class="review-evidence-table-paper">
    <strong>${escapeHtml(titleZh || item.title)}</strong>
    ${titleZh && titleZh !== item.title ? `<p>${escapeHtml(item.title)}</p>` : ""}
    <div class="review-evidence-paper-tags">
      <span class="journal" title="${escapeHtml(item.journal || "期刊信息缺失")}">${escapeHtml(item.journal || "期刊信息缺失")}</span>
      ${hasImpactFactor ? `<span class="impact">IF ${escapeHtml(item.impactFactor)}</span>` : ""}
      ${item.jcr && item.jcr !== "暂无" ? `<span class="jcr">${escapeHtml(item.jcr)}</span>` : ""}
      ${item.year ? `<span>${escapeHtml(item.year)}</span>` : ""}
    </div>
    <div class="review-evidence-paper-submeta"><span>${escapeHtml(item.studyType || "文献类型待确认")}</span>${item.pmid ? `<span>· PMID: ${escapeHtml(item.pmid)}</span>` : ""}${item.sourceUrl ? `<a href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noopener">查看来源 ↗</a>` : ""}</div>
  </div>`;
  const actions = currentChapterId === "all"
    ? `<button data-action="review-evidence-edit-chapters" data-evidence-id="${escapeHtml(item.id)}">调整章节</button><button class="${!item.includedInWriting ? "restore" : ""}" data-action="review-evidence-toggle-inclusion" data-evidence-id="${escapeHtml(item.id)}">${item.includedInWriting ? "不纳入" : "恢复纳入"}</button>`
    : `<button data-action="review-evidence-edit-chapters" data-evidence-id="${escapeHtml(item.id)}">编辑用途</button>${item.includedInWriting ? `<button data-action="review-evidence-remove-chapter" data-evidence-id="${escapeHtml(item.id)}">从本章移除</button>` : `<button class="restore" data-action="review-evidence-toggle-inclusion" data-evidence-id="${escapeHtml(item.id)}">恢复纳入</button>`}`;
  const relationCell = currentChapterId === "all"
    ? renderReviewEvidenceChapterCells(item)
    : `<div class="review-evidence-table-use"><span>${escapeHtml(currentUsage?.use || "尚未设置本章用途")}</span></div>`;
  const statusCell = currentChapterId === "all"
    ? `<span class="review-evidence-table-summary ${summary.className}">${summary.label}</span>`
    : item.includedInWriting
      ? `<select class="review-evidence-table-priority ${escapeHtml(currentUsage?.status || "pending")}" data-action="review-evidence-row-status" data-evidence-id="${escapeHtml(item.id)}" aria-label="本章引用优先级"><option value="priority" ${currentUsage?.status === "priority" ? "selected" : ""}>优先引用</option><option value="keep" ${currentUsage?.status === "keep" ? "selected" : ""}>可引用</option><option value="pending" ${currentUsage?.status === "pending" ? "selected" : ""}>待处理</option></select>`
      : `<span class="review-evidence-table-summary omit">不纳入写作</span>`;
  return `<article class="review-evidence-table-row ${selected ? "selected" : ""}">
    <div class="review-evidence-row-main ${currentChapterId === "all" ? "mode-all" : "mode-chapter"}">
      <label class="review-evidence-check"><input type="checkbox" data-action="review-evidence-select" data-evidence-id="${escapeHtml(item.id)}" ${selected ? "checked" : ""}><span></span></label>
      ${documentCell}<div>${relationCell}</div><div>${statusCell}</div><div class="review-evidence-table-actions">${actions}</div>
    </div>
    <details class="review-evidence-table-detail"><summary>查看判断依据与限制</summary><div><dl><dt>匹配依据</dt><dd>${escapeHtml(item.basis)}</dd><dt>使用限制</dt><dd>${escapeHtml(item.limitation)}</dd></dl>${currentChapterId === "all" && item.chapterUsages.length ? `<section><span>分章写作用途</span>${item.chapterUsages.map((usage) => `<p><b>${escapeHtml(reviewEvidenceChapterName(usage.chapterId))}</b>${escapeHtml(usage.use)}</p>`).join("")}</section>` : ""}</div></details>
  </article>`;
}

function renderReviewEvidenceTable(records, currentChapterId) {
  const chapterMode = currentChapterId !== "all";
  return `<section class="review-evidence-table ${chapterMode ? "mode-chapter" : "mode-all"}">
    <header class="review-evidence-table-head"><span></span><span>文献</span><span>${chapterMode ? "本章写作用途" : "使用章节"}</span><span>${chapterMode ? "本章优先级" : "处理情况"}</span><span>操作</span></header>
    <div class="review-evidence-table-body">${records.map(renderReviewEvidenceTableRow).join("") || `<div class="review-evidence-empty"><h3>当前筛选下没有文献</h3><p>切换章节或引用状态查看其他候选文献。</p></div>`}</div>
  </section>`;
}

function renderReviewEvidenceAssignmentDrawer() {
  const draft = state.review.evidenceAssignmentDraft;
  if (!draft) return "";
  const item = normalizeReviewEvidenceRecords().find((entry) => entry.id === draft.evidenceId);
  if (!item) return "";
  const usageByChapter = new Map((draft.chapterUsages || []).map((usage) => [usage.chapterId, usage]));
  return `<div class="review-drawer-overlay" data-action="review-evidence-close-assignment"></div><aside class="review-direction-drawer review-evidence-assignment-drawer" aria-label="设置使用章节">
    <header><div><span>文献使用设置</span><h2>设置使用章节</h2></div><button data-action="review-evidence-close-assignment" aria-label="关闭">×</button></header>
    <div class="review-drawer-body">
      <section class="review-evidence-assignment-paper"><span>当前文献</span><strong>${escapeHtml(item.title)}</strong><p>同一篇文献可用于多个章节，并分别设置引用优先级和写作用途。</p></section>
      <div class="review-evidence-assignment-list">${state.review.outlineChapters.map((chapter, index) => {
        const usage = usageByChapter.get(chapter.id);
        return `<section class="review-evidence-assignment-row ${usage ? "active" : ""}">
          <label class="review-evidence-assignment-check"><input type="checkbox" data-action="review-evidence-assignment-toggle" data-chapter-id="${escapeHtml(chapter.id)}" ${usage ? "checked" : ""}><span></span><b>第 ${index + 1} 章</b><em>${escapeHtml(chapter.title)}</em></label>
          ${usage ? `<div class="review-evidence-assignment-fields"><label><span>引用优先级</span><select data-action="review-evidence-assignment-status" data-chapter-id="${escapeHtml(chapter.id)}"><option value="priority" ${usage.status === "priority" ? "selected" : ""}>优先引用</option><option value="keep" ${usage.status === "keep" ? "selected" : ""}>可引用</option><option value="pending" ${usage.status === "pending" ? "selected" : ""}>待处理</option></select></label><label><span>写作用途</span><textarea rows="2" maxlength="160" data-action="review-evidence-assignment-use" data-chapter-id="${escapeHtml(chapter.id)}" placeholder="说明这篇文献在本章用来支持什么">${escapeHtml(usage.use)}</textarea></label></div>` : ""}
        </section>`;
      }).join("")}</div>
      <button class="review-evidence-exclude-full" data-action="review-evidence-draft-toggle-inclusion">${draft.includedInWriting ? "不纳入本文写作" : "恢复纳入本文写作"}</button>
      <p class="review-drawer-note">设为“不纳入本文写作”会从全文写作池中移除，但保留章节设置，后续可恢复。</p>
    </div>
    <footer><button data-action="review-evidence-close-assignment">取消</button><button class="review-save" data-action="review-evidence-save-assignment">保存设置</button></footer>
  </aside>`;
}

function renderReviewEvidenceContext(topic) {
  const records = normalizeReviewEvidenceRecords();
  const summaryCounts = {
    priority: records.filter((item) => item.includedInWriting && item.chapterUsages.some((usage) => usage.status === "priority")).length,
    keepOnly: records.filter((item) => item.includedInWriting && item.chapterUsages.length && !item.chapterUsages.some((usage) => usage.status === "priority") && item.chapterUsages.some((usage) => usage.status === "keep")).length,
    omit: records.filter((item) => !item.includedInWriting).length,
    pending: records.filter((item) => item.includedInWriting && (!item.chapterUsages.length || item.chapterUsages.some((usage) => usage.status === "pending"))).length,
  };
  const used = records.filter((item) => item.includedInWriting && item.chapterUsages.some((usage) => ["priority", "keep"].includes(usage.status))).length;
  return `<aside class="review-evidence-context">
    <header><span>当前选题信息</span><button data-action="review-jump-stage" data-stage="outline">查看大纲&nbsp; ›</button></header>
    <section><span>已确认题目</span><h2>${escapeHtml(topic?.title || "尚未确认题目")}</h2></section>
    <section><span>核心问题</span><p>${escapeHtml(topic?.coreQuestion || "暂无")}</p></section>
    <section class="review-evidence-summary"><span>文献处理进度</span><strong>${records.length - summaryCounts.pending}/${records.length}</strong><div><i style="--progress:${records.length ? Math.round((records.length - summaryCounts.pending) / records.length * 100) : 0}%"></i></div><dl><dt>含优先引用章节</dt><dd>${summaryCounts.priority} 篇</dd><dt>仅作可引用</dt><dd>${summaryCounts.keepOnly} 篇</dd><dt>不纳入写作</dt><dd>${summaryCounts.omit} 篇</dd><dt>仍有待处理关系</dt><dd>${summaryCounts.pending} 篇</dd></dl><p>已有 ${used} 篇文献进入正文写作池。</p></section>
    <section><span>证据使用边界</span><p>当前判断基于题名和摘要。写入具体研究方法、样本量和诊断表现前，仍需核对全文。</p></section>
  </aside>`;
}

function renderReviewEvidenceLoading(topic) {
  return `<div class="app-shell review-shell">${reviewTopbar()}<div class="review-workspace review-evidence-workspace">
    ${reviewSidebar(4)}
    <main class="review-evidence-main review-evidence-loading">
      <div class="review-evidence-loader"><span class="review-evidence-spinner"></span><h1>正在按大纲查找正文文献</h1><p>系统正在生成各章节的证据需求并整理候选文献，无需另外设置查找范围。</p><ol>${state.review.outlineChapters.map((chapter, index) => `<li class="${index < 2 ? "done" : index === 2 ? "active" : ""}"><span>${index < 2 ? "✓" : index === 2 ? "…" : index + 1}</span>${escapeHtml(chapter.title)}</li>`).join("")}</ol></div>
    </main>
    ${renderReviewEvidenceContext(topic)}
  </div></div>`;
}

function renderReviewEvidenceWorkspace() {
  const records = reviewEvidenceRecords();
  const allRecords = normalizeReviewEvidenceRecords();
  const pendingRelations = allRecords.reduce((total, item) => total + (item.includedInWriting ? item.chapterUsages.filter((usage) => usage.status === "pending").length : 0), 0);
  const contextRecords = reviewEvidenceContextRecords();
  const currentChapterId = state.review.evidenceChapterFilter || "all";
  const contextCounts = reviewEvidenceCounts(contextRecords, currentChapterId);
  const advancedCount = reviewEvidenceActiveFilterCount();
  const selectedIds = state.review.selectedEvidenceIds || [];
  const visibleIds = records.map((item) => item.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
  const topic = state.review.topics.find((item) => item.id === state.review.selectedTopicId);
  if (state.review.evidencePhase === "searching") return renderReviewEvidenceLoading(topic);
  const statusTabs = [
    ["all", "全部", contextRecords.length],
    ["pending", "待处理", contextCounts.pending],
    ["priority", "优先引用", contextCounts.priority],
    ["keep", "可引用", contextCounts.keep],
    ["omit", "不纳入", contextCounts.omit],
  ];
  return `<div class="app-shell review-shell">${reviewTopbar()}<div class="review-workspace review-evidence-workspace">
    ${reviewSidebar(4)}
    <main class="review-evidence-main">
      <header class="review-page-head review-page-head-with-tools"><div><span class="review-page-step">文献与证据</span><h1>选择后续写作要使用的文献</h1><p>系统已按大纲整理候选文献。同一篇文献可用于多个章节，并分别设置优先级和写作用途。</p></div><div><button data-action="review-open-task-input">查看任务输入</button><button data-action="review-open-prompt-drawer">任务设置</button></div></header>
      <section class="review-evidence-toolbar">
        <div class="review-evidence-primary-row"><label><span>使用章节</span><select data-action="review-evidence-chapter"><option value="all">全部章节</option>${state.review.outlineChapters.map((chapter, index) => `<option value="${escapeHtml(chapter.id)}" ${state.review.evidenceChapterFilter === chapter.id ? "selected" : ""}>${index + 1}. ${escapeHtml(chapter.title)}</option>`).join("")}</select></label></div>
        <div class="review-evidence-status-row"><span>引用状态</span><div class="review-evidence-tabs">${statusTabs.map(([value, label, count]) => `<button class="${state.review.evidenceStatusFilter === value ? "active" : ""}" data-action="review-evidence-status" data-status="${value}">${label}<span>${count}</span></button>`).join("")}</div><button class="review-evidence-more ${state.review.evidenceAdvancedOpen ? "active" : ""}" data-action="review-evidence-toggle-advanced">筛选${advancedCount ? `<b>${advancedCount}</b>` : ""}<i>⌄</i></button></div>
        ${renderReviewEvidenceFilterChips()}
      </section>
      ${renderReviewEvidenceAdvancedFilters()}
      <section class="review-evidence-batch ${selectedIds.length ? "active" : ""}">
        <label><input type="checkbox" data-action="review-evidence-select-all" ${allVisibleSelected ? "checked" : ""}><span></span>${selectedIds.length ? `已选择 ${selectedIds.length} 篇` : `选择当前 ${records.length} 篇`}</label>
        <div>${currentChapterId === "all" ? `<span class="review-evidence-batch-hint">切换到具体章节后可批量设置本章优先级</span><button data-action="review-evidence-batch" data-status="omit">不纳入本文</button>` : `<button data-action="review-evidence-batch" data-status="priority">本章优先引用</button><button data-action="review-evidence-batch" data-status="keep">本章可引用</button><button data-action="review-evidence-batch" data-status="remove">从本章移除</button>`}</div>
      </section>
      ${renderReviewEvidenceTable(records, currentChapterId)}
      <footer class="review-evidence-footer"><div><span>正文写作文献池</span><strong>${allRecords.filter((item) => item.includedInWriting && item.chapterUsages.length).length} 篇已分配章节 · ${pendingRelations} 处章节关系待处理</strong></div><button class="review-save" data-action="review-evidence-continue" ${pendingRelations ? "disabled" : ""}>用这些文献开始写作&nbsp; →</button></footer>
    </main>
    ${renderReviewEvidenceContext(topic)}
  </div>${renderReviewEvidenceAssignmentDrawer()}${renderReviewGlobalDrawers()}</div>`;
}

function renderReviewTopicLiteratureWorkspace() {
  const dirs = state.review.directions.filter((d) => d.selected);
  const pool = state.review.literaturePool || [];
  const selected = new Set(state.review.literatureSelection || []);
  if (state.review.topicLiteraturePhase === "searching") return `<div class="app-shell review-shell">${reviewTopbar()}<div class="review-workspace">${reviewSidebar(1)}<main class="review-main review-evidence-loading"><div class="review-evidence-loader"><span class="review-evidence-spinner"></span><h1>正在查找选题文献</h1><p>系统依据已选方向的中英文语义召回句检索 PubMed。</p></div></main></div></div>`;
  return `<div class="app-shell review-shell">${reviewTopbar()}<div class="review-workspace review-topic-literature-workspace">${reviewSidebar(1)}<main class="review-main"><header class="review-page-head"><span class="review-page-step">筛选选题文献</span><h1>从选定方向中筛选用于选题的文献</h1><p>以下文献来自当前方向的 PubMed 召回批次。只将你勾选的文献交给后续分析和题目生成。</p></header><section class="review-direction-pills">${dirs.map((d) => `<span>${escapeHtml(d.title)}</span>`).join("")}</section><div class="review-literature-table">${pool.map((item) => `<label class="review-literature-row"><input type="checkbox" data-action="review-topic-literature-toggle" data-literature-id="${escapeHtml(item.literatureId)}" ${selected.has(item.literatureId) ? "checked" : ""}><div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.journal)} · ${escapeHtml(item.year)} · ${escapeHtml(item.pmid ? `PMID: ${item.pmid}` : item.literatureId)}</p><small>${escapeHtml(item.abstract || "当前未提供摘要，进入正文前需核对全文。")}</small></div><span>${escapeHtml(item.directionId || "")}</span></label>`).join("") || `<div class="review-empty-state">暂未召回文献，请返回方向页重新生成。</div>`}</div><footer class="review-footer"><strong>已选择 ${selected.size} 篇文献</strong><button class="review-save" data-action="review-confirm-topic-literature" ${selected.size ? "" : "disabled"}>分析文献并生成候选题目&nbsp; →</button></footer></main></div></div>`;
}

function renderReviewAnalysisWorkspace() {
  const report = state.review.literatureAnalysis;
  return `<div class="app-shell review-shell">${reviewTopbar()}<div class="review-workspace">${reviewSidebar(1)}<main class="review-main"><header class="review-page-head"><span class="review-page-step">文献分析</span><h1>查看本轮选题文献分析</h1><p>分析仅代表当前筛选批次，不判断选题新颖性或投稿风险。</p></header><article class="review-analysis-report"><div class="review-analysis-markdown">${nl(report?.analysis_markdown || "正在整理当前文献批次…")}</div>${(report?.categories || []).map((cat) => `<section><h3>${escapeHtml(cat.category_name)}</h3><p>${escapeHtml(cat.category_description)}</p><div class="review-analysis-ids">${(cat.literature_ids || []).map((id) => `<code>[literatureId:${escapeHtml(id)}]</code>`).join(" ")}</div></section>`).join("")}</article><footer class="review-footer"><span>下一步将基于已选文献生成候选题目</span><button class="review-save" data-action="review-generate-topics">生成候选题目&nbsp; →</button></footer></main></div></div>`;
}

function renderReviewApproachWorkspace() {
  const options = state.review.approaches || [];
  return `<div class="app-shell review-shell">${reviewTopbar()}<div class="review-workspace">${reviewSidebar(3)}<main class="review-main"><header class="review-page-head"><span class="review-page-step">设计写作方案</span><h1>选择适合这篇综述的写作思路</h1><p>选择后将据此生成可编辑的大纲。除名称外，其他内容均为项目列表。</p></header><div class="review-approach-grid">${options.map((item, index) => `<article class="review-approach-card ${state.review.selectedApproachId === item.id ? "selected" : ""}"><label><input type="radio" name="review-approach" data-action="review-select-approach" data-approach-id="${escapeHtml(item.id)}" ${state.review.selectedApproachId === item.id ? "checked" : ""}><strong>${escapeHtml(item.name)}</strong></label>${[["适用场景", item.scene], ["优点", item.pros], ["局限", item.cons], ["对大纲的影响", item.outline_impact], ["后续查找重点", item.recall_focus]].map(([label, list]) => `<section><span>${label}</span><ul>${(list || []).map((v) => `<li>${escapeHtml(v)}</li>`).join("")}</ul></section>`).join("")}</article>`).join("")}</div><footer class="review-footer"><span>已选择：${escapeHtml(options.find((x) => x.id === state.review.selectedApproachId)?.name || "尚未选择")}</span><button class="review-save" data-action="review-confirm-approach" ${state.review.selectedApproachId ? "" : "disabled"}>补充写作要求&nbsp; →</button></footer></main></div></div>`;
}

function renderReviewWritingRequirementsWorkspace() {
  const req = state.review.writingRequirements || {};
  return `<div class="app-shell review-shell">${reviewTopbar()}<div class="review-workspace">${reviewSidebar(3)}<main class="review-main"><header class="review-page-head"><span class="review-page-step">补充写作要求</span><h1>补充文章的写作参数</h1><p>综述类型已固定为“叙述性综述”，这里仅补充篇幅、目标期刊和读者等要求。</p></header><section class="review-editor-card"><div class="review-form-grid"><label>篇幅<select data-review-writing-field="length"><option ${req.length === "短篇" ? "selected" : ""}>短篇</option><option ${req.length === "中篇" ? "selected" : ""}>中篇</option><option ${req.length === "长篇" ? "selected" : ""}>长篇</option></select></label><label>目标期刊（选填）<input data-review-writing-field="journal" value="${escapeHtml(req.journal || "")}" placeholder="例如：中华医学杂志"></label><label>目标读者（选填）<input data-review-writing-field="audience" value="${escapeHtml(req.audience || "")}" placeholder="例如：临床医生"></label></div><label class="review-extra-field">其他要求（选填）<textarea data-review-writing-field="extra">${escapeHtml(req.extra || "")}</textarea></label></section><footer class="review-footer"><span>写作类型：叙述性综述</span><button class="review-save" data-action="review-confirm-writing-requirements">生成写作大纲&nbsp; →</button></footer></main></div></div>`;
}

function renderReviewWritingWorkspace() {
  const chapters = state.review.outlineChapters || [];
  const mergedReady = Boolean(state.review.mergedManuscript) && state.review.mergeStatus === "ready";
  const tocSource = mergedReady
    ? state.review.mergedManuscript
    : chapters.map((chapter) => `## ${chapter.title}`).join("\n");
  const toc = reviewTocItems(tocSource);
  const tasks = state.review.preflightResult?.preflight_tasks || [];
  const ignored = new Set(state.review.ignoredPreflightTasks || []);
  const mustCount = tasks.filter((task, index) => task.priority === "必须处理" && !ignored.has(index)).length;
  const suggestionCount = tasks.filter((task, index) => task.priority === "建议优化" && !ignored.has(index)).length;
  const preflightPanel = state.review.preflightPanelOpen ? `<aside class="review-preflight-panel"><header><div><span>检查引用与投稿风险</span>${state.review.preflightStatus === "ready" ? `<strong>${escapeHtml(state.review.preflightResult?.status || "检查完成")}</strong>` : ""}</div><button data-action="review-close-preflight" aria-label="关闭">×</button></header>
    ${state.review.preflightStatus === "running" ? `<div class="review-preflight-loading"><span class="review-evidence-spinner"></span><strong>正在检查全文</strong><p>正在核对结构、证据、引用和写作要求。</p></div>` : state.review.preflightStatus === "failed" ? `<div class="review-preflight-error"><strong>检查失败</strong><p>${escapeHtml(state.review.preflightError)}</p><button data-action="review-run-preflight">重新检查</button></div>` : `<section class="review-preflight-summary ${mustCount ? "danger" : "ok"}"><strong>${mustCount ? `投稿前还需处理 ${mustCount + suggestionCount} 个问题` : suggestionCount ? `有 ${suggestionCount} 项建议优化` : "当前检查已通过"}</strong><span>必须处理 ${mustCount} · 建议优化 ${suggestionCount}</span>${state.review.preflightStale ? `<em>正文已变化，当前结果已过期</em>` : ""}</section><div class="review-preflight-tasks">${tasks.map((task, index) => `<article class="review-preflight-card ${ignored.has(index) ? "ignored" : ""}"><span class="${task.priority === "必须处理" ? "required" : "suggested"}">${escapeHtml(task.priority)}</span><h3>${escapeHtml(task.type)}</h3><h4>${escapeHtml(task.location)}</h4><p>${escapeHtml(task.problem)}</p><details><summary>查看问题详情</summary><div><strong>修改建议</strong><p>${escapeHtml(task.suggestion)}</p></div></details><button data-action="review-toggle-preflight-ignore" data-index="${index}">${ignored.has(index) ? "恢复问题" : "忽略"}</button></article>`).join("") || `<div class="review-preflight-empty">未发现需要处理的实质问题。</div>`}</div>`}
    <footer><button data-action="review-run-preflight" ${state.review.preflightStatus === "running" ? "disabled" : ""}><img src="/assets/figma-review-refresh.svg" alt="">重新检查</button></footer></aside>` : "";
  const generatedCount = chapters.filter((chapter) => state.review.sectionDrafts.find((item) => item.chapter_id === chapter.id)?.markdown).length;
  const body = mergedReady ? `<article class="review-manuscript-document">${state.review.mergedStale ? `<div class="review-stale-banner"><span>章节正文已更新，当前整合稿和检查结果已过期。</span><button data-action="review-integrate-fulltext">重新整合全文</button></div>` : ""}${renderReviewMarkdown(state.review.mergedManuscript)}</article>` : `<article class="review-manuscript-document review-generation-document"><h1>${escapeHtml(state.review.topics?.find((item) => item.id === state.review.selectedTopicId)?.title || "综述正文")}</h1>${chapters.map((chapter) => {
    const draft = state.review.sectionDrafts.find((item) => item.chapter_id === chapter.id);
    const run = state.review.sectionRuns[chapter.id] || { status: draft?.markdown ? "ready" : "idle" };
    const statusLabel = { idle: "待生成", running: "正在结合本章大纲与文献证据撰写正文…", failed: "生成失败", ready: "已生成" }[run.status] || "待生成";
    return `<section class="review-generation-section"><header><h2>${escapeHtml(chapter.title)}</h2>${draft?.markdown ? `<button data-action="review-open-section-editor" data-chapter-id="${escapeHtml(chapter.id)}">编辑本章</button>` : ""}</header>${draft?.markdown ? `<div class="review-generated-copy">${renderReviewMarkdown(draft.markdown)}</div>` : ""}<div class="review-generation-row ${run.status}"><span></span><p>${escapeHtml(statusLabel)}</p>${run.status === "failed" ? `<button data-action="review-generate-section" data-chapter-id="${escapeHtml(chapter.id)}">重新生成</button>` : ""}${run.status === "ready" ? `<button data-action="review-generate-section" data-chapter-id="${escapeHtml(chapter.id)}">重新生成</button>` : ""}</div>${run.error ? `<p class="review-generation-error">${escapeHtml(run.error)}</p>` : ""}</section>`;
  }).join("")}${state.review.mergeStatus === "running" ? `<div class="review-merge-progress"><span class="review-evidence-spinner"></span><p>正在整合全文，优化章节过渡与上下文衔接</p></div>` : ""}${state.review.mergeStatus === "failed" ? `<div class="review-merge-failed"><p>${escapeHtml(state.review.mergeError)}</p><button data-action="review-integrate-fulltext">重试全文整合</button></div>` : ""}</article>`;
  return `<div class="app-shell review-shell review-writing-stage">${reviewTopbar()}<div class="review-manuscript-shell">${reviewSidebar(5)}<main class="review-manuscript-stage"><header class="review-manuscript-head"><div><span>撰写与检查全文</span><h1>逐章撰写正文，检查全文是否完整、连贯，前后表述是否一致</h1></div><div><button data-action="review-open-task-input">查看任务输入</button><button data-action="review-open-prompt-drawer">任务设置</button></div></header><div class="review-manuscript-content"><div class="review-manuscript-canvas">${body}</div><aside class="review-manuscript-toc"><h3>目录</h3>${toc.map((item, index) => `<button class="${index === 0 ? "active" : ""}" style="--toc-level:${item.level}">${escapeHtml(item.label)}</button>`).join("") || `<span>正文生成后显示目录</span>`}</aside>${preflightPanel}</div><footer class="review-manuscript-footer"><span>自动保存于 ${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</span><div><button data-action="review-open-prompt-drawer">任务设置</button>${mergedReady ? `<button data-action="review-run-preflight" ${state.review.mergedStale ? "disabled" : ""}>${state.review.preflightStatus === "ready" ? "重新检查" : "全文检查"}</button>${state.review.preflightStatus === "ready" && !state.review.preflightStale ? `<button class="primary" data-action="review-open-export">导出投稿材料&nbsp; →</button>` : ""}` : `<span>${generatedCount}/${chapters.length} 章已生成</span>${["idle", "paused", "failed"].includes(state.review.writingPipelineStatus) ? `<button class="primary" data-action="review-continue-pipeline">${state.review.writingPipelineStatus === "idle" ? "开始逐章生成" : "继续生成"}</button>` : ""}`}</div></footer></main></div>${renderReviewGlobalDrawers()}</div>`;
}

function renderReviewExportWorkspace() {
  return `<div class="app-shell review-shell">${reviewTopbar()}<div class="review-workspace">${reviewSidebar(6)}<main class="review-main"><header class="review-page-head review-page-head-with-tools"><div><span class="review-page-step">导出投稿材料</span><h1>导出当前已确认的论文与证据材料</h1><p>导出前请确认全文检查结果已处理，且引用编号与文献题录一致。</p></div><button data-action="review-open-prompt-drawer">任务设置</button></header><article class="review-fulltext-card"><div class="review-fulltext-content">${renderReviewMarkdown(state.review.mergedManuscript || "全文尚未整合")}</div><p class="ai-disclaimer">内容由 AI 辅助生成，请结合客观事实及相关依据综合判断。</p></article><div class="review-export-cards"><button data-action="review-export-word"><strong>Word 论文正文</strong><span>导出当前整合后的章节正文</span></button><button data-action="review-export-evidence"><strong>Excel 文献证据整理</strong><span>导出文献、核心结论和写作用途</span></button><button data-action="review-export-queries"><strong>文献检索方向</strong><span>导出每章检索式</span></button></div></main></div>${renderReviewGlobalDrawers()}</div>`;
}

const CASE_REPORT_EVIDENCE_STATUS = {
  suggested: { label: "AI 建议使用", className: "suggested" },
  pending: { label: "待人工核对", className: "pending" },
  confirmed: { label: "已确认用于正文", className: "confirmed" },
  excluded: { label: "不使用", className: "excluded" },
};

const CASE_REPORT_EVIDENCE_FIT = {
  match: { label: "符合", className: "match" },
  partial: { label: "部分符合", className: "partial" },
  mismatch: { label: "不适用", className: "mismatch" },
};

function caseReportEvidenceCurrentChapter() {
  const model = state.caseReportEvidence || initialCaseReportEvidenceState();
  return model.chapters.find((chapter) => chapter.id === model.activeChapterId) || model.chapters[0];
}

function caseReportEvidenceRecords() {
  const model = state.caseReportEvidence || initialCaseReportEvidenceState();
  const chapter = caseReportEvidenceCurrentChapter();
  return model.records.filter((record) => record.chapterId === chapter?.id && (model.statusFilter === "all" || record.status === model.statusFilter));
}

function caseReportEvidenceStepSidebar() {
  return `<aside class="case-report-step-sidebar"><div class="case-report-step-title"><span>智能病例报告</span><small>当前任务</small></div><ol>${CASE_REPORT_STEPS.map((item, index) => `<li class="${index === 6 ? "active" : index < 6 ? "done" : ""}"><span class="case-report-step-dot">${index < 6 ? "✓" : index + 1}</span><div><strong>${item[0]}</strong><small>${item[1]}</small></div></li>`).join("")}</ol></aside>`;
}

function caseReportEvidenceTopbar() {
  return `<header class="case-report-topbar"><button class="review-back" data-action="go-portal" aria-label="返回首页">‹</button><div><strong>智能病例报告</strong><span>病例报告</span></div><div class="case-report-topbar-spacer"></div><span class="case-report-save-state">${state.caseReportEvidence?.saved ? "已保存" : "演示模式"}</span><span class="review-avatar">CP</span></header>`;
}

function renderCaseReportEvidenceContext() {
  const model = state.caseReportEvidence || initialCaseReportEvidenceState();
  const chapter = caseReportEvidenceCurrentChapter();
  const all = model.records;
  const current = all.filter((record) => record.chapterId === chapter?.id);
  const confirmed = current.filter((record) => record.status === "confirmed").length;
  const pending = current.filter((record) => record.status === "pending").length;
  return `<aside class="case-report-evidence-context"><header><span>当前写作上下文</span><button data-action="case-report-evidence-outline">查看大纲&nbsp;›</button></header><section><span>来自已确认大纲</span><h2>${escapeHtml(chapter?.title || "正文文献")}</h2><p>${escapeHtml(chapter?.purpose || "")}</p></section><section><span>证据使用边界</span><p>${escapeHtml(chapter?.scope || "外部文献不能替代病例事实。")}</p></section><section class="case-report-evidence-progress"><span>本节准备进度</span><strong>${confirmed}/${current.length || 0}</strong><div><i style="--progress:${current.length ? Math.round((confirmed / current.length) * 100) : 0}%"></i></div><dl><dt>已确认用于正文</dt><dd>${confirmed} 篇</dd><dt>待人工核对</dt><dd>${pending} 篇</dd></dl></section><p class="case-report-evidence-note">病例症状、检查、治疗和随访只能来自病例资料；本页文献仅用于一般医学观点和病例比较。</p></aside>`;
}

function renderCaseReportEvidenceDetail() {
  const model = state.caseReportEvidence || initialCaseReportEvidenceState();
  const item = model.records.find((record) => record.id === model.detailId);
  if (!item) return "";
  const fit = CASE_REPORT_EVIDENCE_FIT[item.fit] || CASE_REPORT_EVIDENCE_FIT.partial;
  const status = CASE_REPORT_EVIDENCE_STATUS[item.status] || CASE_REPORT_EVIDENCE_STATUS.pending;
  return `<div class="case-report-detail-overlay" data-action="case-report-evidence-close-detail"></div><aside class="case-report-evidence-detail" aria-label="文献详情"><header><div><span>文献详情</span><h2>${escapeHtml(item.title)}</h2></div><button data-action="case-report-evidence-close-detail" aria-label="关闭">×</button></header><div class="case-report-detail-body"><section class="case-report-detail-meta"><span>${escapeHtml(item.journal)} · ${escapeHtml(item.year)} · ${escapeHtml(item.type)}</span><b class="case-report-fit ${fit.className}">${fit.label}</b></section><section><h3>支持内容</h3><p>${escapeHtml(item.use)}</p></section><section><h3>判断依据</h3><p>${escapeHtml(item.basis)}</p><small>依据范围：${escapeHtml(item.source)}。进入正文前仍需核对原文。</small></section><section class="case-report-detail-warning"><h3>使用提醒</h3><p>${escapeHtml(item.limitation)}</p></section><section class="case-report-boundary"><strong>病例事实边界</strong><p>该文献不能补写当前患者的症状、检查结果、治疗经过或随访结果。</p></section></div><footer><a href="#" data-action="case-report-evidence-source">查看文献来源 ↗</a><div><button data-action="case-report-evidence-set-status" data-status="excluded">不使用</button><button data-action="case-report-evidence-set-status" data-status="pending">待人工核对</button><button class="primary" data-action="case-report-evidence-set-status" data-status="confirmed">确认用于正文</button></div></footer></aside>`;
}

function renderCaseReportEvidenceTable() {
  const records = caseReportEvidenceRecords();
  return `<section class="case-report-evidence-table"><header><span>文献</span><span>适用性</span><span>支持内容</span><span>使用决策</span><span>操作</span></header><div>${records.map((item) => {
    const fit = CASE_REPORT_EVIDENCE_FIT[item.fit] || CASE_REPORT_EVIDENCE_FIT.partial;
    const status = CASE_REPORT_EVIDENCE_STATUS[item.status] || CASE_REPORT_EVIDENCE_STATUS.pending;
    return `<article class="case-report-evidence-row"><div class="case-report-paper-cell"><button data-action="case-report-evidence-detail" data-evidence-id="${escapeHtml(item.id)}"><strong>${escapeHtml(item.title)}</strong></button><p>${escapeHtml(item.journal)} · ${escapeHtml(item.year)} · ${escapeHtml(item.type)}</p></div><div><span class="case-report-fit ${fit.className}">${fit.label}</span></div><div class="case-report-support-cell"><p>${escapeHtml(item.use)}</p></div><div><span class="case-report-status ${status.className}">${status.label}</span></div><div class="case-report-row-action"><button data-action="case-report-evidence-detail" data-evidence-id="${escapeHtml(item.id)}">查看详情</button></div></article>`;
  }).join("") || `<div class="case-report-evidence-empty"><strong>当前筛选下暂无文献</strong><span>可以切换章节或使用决策查看其他候选文献。</span></div>`}</div></section>`;
}

function renderCaseReportEvidenceWorkspace() {
  const model = state.caseReportEvidence || initialCaseReportEvidenceState();
  const chapter = caseReportEvidenceCurrentChapter();
  const currentRecords = model.records.filter((record) => record.chapterId === chapter?.id);
  const visibleRecords = caseReportEvidenceRecords();
  const counts = Object.keys(CASE_REPORT_EVIDENCE_STATUS).reduce((result, key) => { result[key] = currentRecords.filter((record) => record.status === key).length; return result; }, {});
  app.innerHTML = `<div class="app-shell case-report-shell">${caseReportEvidenceTopbar()}<div class="case-report-workspace">${caseReportEvidenceStepSidebar()}<main class="case-report-evidence-main"><header class="case-report-evidence-head"><span>第 7/9 步 · 准备正文文献</span><h1>准备正文文献</h1><p>大纲已明确正文重点。本页只核对文献适用性、支持内容和使用决策，不重新生成证据需求。</p></header><section class="case-report-evidence-toolbar"><label><span>当前写作重点</span><select data-action="case-report-evidence-chapter">${model.chapters.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === model.activeChapterId ? "selected" : ""}>${escapeHtml(item.title)}</option>`).join("")}</select></label><div><span>使用决策</span><nav>${[["all", "全部", currentRecords.length], ["suggested", "AI 建议使用", counts.suggested], ["pending", "待人工核对", counts.pending], ["confirmed", "已确认用于正文", counts.confirmed], ["excluded", "不使用", counts.excluded]].map(([value, label, count]) => `<button class="${model.statusFilter === value ? "active" : ""}" data-action="case-report-evidence-status" data-status="${value}">${label}<b>${count}</b></button>`).join("")}</nav></div></section><div class="case-report-evidence-summary"><span>当前章节文献：${currentRecords.length} 篇</span><span>已确认用于正文：${counts.confirmed} 篇</span><span>待人工核对：${counts.pending} 篇</span><em>${visibleRecords.length ? "点击文献查看判断依据和使用提醒" : ""}</em></div>${renderCaseReportEvidenceTable()}<footer class="case-report-evidence-footer"><div><span>正文拟用文献</span><strong>${model.records.filter((record) => record.status === "confirmed").length} 篇已确认 · ${model.records.filter((record) => record.status === "pending").length} 篇待核对</strong></div><button class="case-report-primary" data-action="case-report-evidence-confirm">确认文献，撰写报告初稿&nbsp;→</button></footer></main>${renderCaseReportEvidenceContext()}</div>${renderCaseReportEvidenceDetail()}</div>`;
}

function reorderReviewOutline(sourceId, targetId) {
  const chapters = state.review.outlineChapters;
  const sourceIndex = chapters.findIndex((chapter) => chapter.id === sourceId);
  const targetIndex = chapters.findIndex((chapter) => chapter.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return false;
  const [chapter] = chapters.splice(sourceIndex, 1);
  chapters.splice(targetIndex, 0, chapter);
  return true;
}

function renderReviewRequirementSummary() {
  const req = state.review.requirements;
  return `<section class="review-requirement-card">
    <div class="review-section-heading"><h2>当前写作需求</h2><button class="review-edit-action" data-action="review-edit-requirements">⌕&nbsp; 修改</button></div>
    <div class="review-summary-grid">
      <div><span>研究对象/疾病</span><strong>${escapeHtml(req.subject)}</strong></div>
      <div><span>主题/方向</span><strong>${escapeHtml(req.topic)}</strong></div>
      <div><span>重点关注</span><strong>${escapeHtml(req.focus.join("、"))}</strong></div>
    </div>
    <div class="review-summary-row"><span>核心问题</span><strong>${escapeHtml(req.question)}</strong></div>
    <div class="review-summary-row"><span>补充写作要求</span><strong>${escapeHtml(req.extra || "暂无补充要求")}</strong></div>
  </section>`;
}

function reviewDirectionSearchItems(direction) {
  return String(direction.searchFocus || "")
    .split(/[、，,；;]/)
    .map((item) => item.trim().replace(/[。；;]$/, ""))
    .filter(Boolean)
    .slice(0, 4);
}

function reviewDirectionDecisionTags(direction) {
  if (Array.isArray(direction.decisionTags) && direction.decisionTags.length) {
    return direction.decisionTags.slice(0, 3);
  }
  return reviewDirectionSearchItems(direction).slice(0, 3);
}

function reviewDirectionDecisionPoints(direction) {
  if (Array.isArray(direction.decisionPoints) && direction.decisionPoints.length) {
    return direction.decisionPoints.slice(0, 4);
  }
  const searchItems = reviewDirectionSearchItems(direction);
  return reviewDirectionDecisionTags(direction).map((item, index) => ({ label: item, detail: searchItems[index] || direction.description }));
}

function reviewDirectionPendingQuestions(direction) {
  if (Array.isArray(direction.pendingQuestions) && direction.pendingQuestions.length) {
    return direction.pendingQuestions.slice(0, 4);
  }
  return reviewDirectionSearchItems(direction).slice(0, 3).map((item) => `关于“${item}”的证据结论和适用边界是什么？`);
}

function renderReviewDirectionCard(direction, selectionFull) {
  const selectionDisabled = !direction.selected && selectionFull;
  const selectionAction = direction.selected ? "review-remove-direction" : "review-add-direction";
  const selectionLabel = direction.selected ? "取消选择" : (selectionDisabled ? "已选满 2 个" : "选择方向");
  const decisionTags = reviewDirectionDecisionTags(direction);
  return `<article class="review-direction-card ${direction.selected ? "selected" : ""}">
    <div class="review-direction-card-head">
      <button class="review-direction-select" data-action="${selectionAction}" data-direction-id="${escapeHtml(direction.id)}" ${selectionDisabled ? "disabled" : ""} aria-label="${selectionLabel}：${escapeHtml(direction.title)}"><span></span></button>
      <h3>${escapeHtml(direction.title)}</h3>
      ${direction.custom ? `<i>自定义</i>` : ""}
    </div>
    <p class="review-direction-summary">${escapeHtml(direction.description)}</p>
    <div class="review-direction-match"><span>重点判断</span><div>${decisionTags.map((item) => `<i>${escapeHtml(item)}</i>`).join("")}</div></div>
    <div class="review-card-actions"><button class="review-detail-action" data-action="review-direction-detail" data-direction-id="${escapeHtml(direction.id)}">查看详情&nbsp; ›</button>${direction.selected ? `<span class="review-selected-status">✓ 已选择</span>` : ""}</div>
  </article>`;
}

function renderReviewRequirementsEditor() {
  const req = state.review.requirements;
  const defaultTopicOptions = ["诊断与鉴别诊断", "治疗策略", "预后与复发"];
  const defaultFocusOptions = ["早期诊断", "分子诊断", "影像学鉴别"];
  const topicOptions = defaultTopicOptions.includes(req.topic) ? defaultTopicOptions : [...defaultTopicOptions.slice(0, 2), req.topic];
  const customFocus = req.focus.find((item) => !defaultFocusOptions.includes(item));
  const focusOptions = customFocus ? [...defaultFocusOptions.slice(0, 2), customFocus] : defaultFocusOptions;
  return `<main class="review-main review-edit-main">
    <header class="review-page-head"><h1>明确需求与方向</h1><p>确认核心问题和研究要点，选择后续要重点了解和比较的研究方向。</p></header>
    <section class="review-editor-card">
      <h2>修改写作需求</h2>
      <div class="review-editor-section"><h3>已识别信息</h3><p>请检查并修改系统整理的信息</p>
        <div class="review-form-grid">
          <label>研究对象/疾病<input data-review-field="subject" value="${escapeHtml(req.subject)}"></label>
          <label>核心问题<input data-review-field="question" value="${escapeHtml(req.question)}"></label>
        </div>
      </div>
      <div class="review-editor-section"><h3>需要你选择</h3><p>这些内容将影响候选研究方向</p>
        <fieldset><legend>主题/方向（单选）</legend><div class="review-choice-grid">${topicOptions.map((option) => `<label class="review-choice ${req.topic === option ? "selected" : ""}"><input type="radio" name="review-topic" data-review-topic value="${option}" ${req.topic === option ? "checked" : ""}><i></i>${option}</label>`).join("")}<button data-action="review-custom-topic">＋ 自定义</button></div></fieldset>
        <fieldset><legend>重点关注（可多选）</legend><div class="review-choice-grid">${focusOptions.map((option) => `<label class="review-choice ${req.focus.includes(option) ? "selected" : ""}"><input type="checkbox" data-review-focus value="${option}" ${req.focus.includes(option) ? "checked" : ""}><i></i>${option}</label>`).join("")}<button data-action="review-custom-focus">＋ 自定义</button></div></fieldset>
      </div>
      <div class="review-editor-section review-extra-section"><h3>补充写作要求 <small>（选填）</small></h3><p>可填写希望重点讨论、限制或排除的内容</p><textarea data-review-field="extra">${escapeHtml(req.extra)}</textarea></div>
      <div class="review-editor-actions"><span>ⓘ&nbsp; 修改后将根据最新需求重新生成候选研究方向。</span><button class="review-cancel" data-action="review-cancel-edit">取消</button><button class="review-save" data-action="review-save-requirements">保存并更新研究方向</button></div>
    </section>
  </main>`;
}

function renderReviewCustomDirectionDrawer() {
  if (!state.review.customDirectionOpen) return "";
  const draft = state.review.customDirectionDraft;
  const errors = state.review.customDirectionErrors;
  const req = state.review.requirements;
  return `<div class="review-drawer-overlay" data-action="review-close-custom-direction"></div><aside class="review-direction-drawer review-custom-direction-drawer">
    <header><div><span>新增候选方向</span><h2>自定义研究方向</h2></div><button data-action="review-close-custom-direction" aria-label="关闭">×</button></header>
    <div class="review-drawer-body">
      <p class="review-custom-intro">补充你希望进一步查找和比较的研究方向。添加后仍需在下一步通过文献判断是否适合作为选题。</p>
      <section class="review-custom-context"><h3>基于当前写作需求</h3><dl><dt>研究对象/疾病</dt><dd>${escapeHtml(req.subject)}</dd><dt>主题/方向</dt><dd>${escapeHtml(req.topic)}</dd><dt>重点关注</dt><dd>${escapeHtml(req.focus.join("、"))}</dd></dl></section>
      <div class="review-custom-form">
        <label class="${errors.title ? "error" : ""}"><span>研究方向名称 <b>*</b><small>${draft.title.length}/60</small></span><input data-review-custom-field="title" maxlength="60" value="${escapeHtml(draft.title)}" placeholder="例如：脊柱结核的影像学诊断">${errors.title ? `<em>${escapeHtml(errors.title)}</em>` : ""}</label>
        <label class="${errors.description ? "error" : ""}"><span>方向说明 <b>*</b><small>${draft.description.length}/120</small></span><textarea data-review-custom-field="description" maxlength="120" placeholder="说明这个方向具体准备了解和研究什么">${escapeHtml(draft.description)}</textarea>${errors.description ? `<em>${escapeHtml(errors.description)}</em>` : ""}</label>
        <label><span>查找重点 <i>选填</i><small>${draft.searchFocus.length}/120</small></span><textarea data-review-custom-field="searchFocus" maxlength="120" placeholder="例如：重点查找哪些诊断方法、研究对象或临床场景">${escapeHtml(draft.searchFocus)}</textarea></label>
      </div>
      <p class="review-drawer-note">系统会结合当前需求补充推荐理由、待验证内容和检索关键词；这些内容不代表研究价值或证据充分性判断。</p>
    </div>
    <footer><button data-action="review-close-custom-direction">取消</button><button class="review-save" data-action="review-add-custom-direction">添加研究方向</button></footer>
  </aside>`;
}

function renderReviewDirectionDrawer() {
  if (state.review.customDirectionOpen) return renderReviewCustomDirectionDrawer();
  const direction = state.review.directions.find((item) => item.id === state.review.drawerDirectionId);
  if (!direction) return "";
  const searchItems = reviewDirectionSearchItems(direction);
  const decisionPoints = reviewDirectionDecisionPoints(direction);
  const pendingQuestions = reviewDirectionPendingQuestions(direction);
  return `<div class="review-drawer-overlay" data-action="review-close-direction"></div><aside class="review-direction-drawer">
    <header><div><span>研究方向详情</span><h2>${escapeHtml(direction.title)}</h2></div><button data-action="review-close-direction" aria-label="关闭">×</button></header>
    <div class="review-drawer-body review-direction-detail-body">
      <p class="review-direction-intro">${escapeHtml(direction.description)}</p>
      <section><h3>这个方向重点判断</h3><dl class="review-decision-points">${decisionPoints.map((item) => `<div><dt>${escapeHtml(item.label)}</dt><dd>${escapeHtml(item.detail)}</dd></div>`).join("")}</dl></section>
      <section><h3>下一步主要查找</h3><ul class="review-search-points">${searchItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section>
      <details class="review-detail-fold"><summary>待文献验证 <small>${pendingQuestions.length} 个问题</small></summary><ul class="review-pending-questions">${pendingQuestions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></details>
      <details class="review-detail-fold"><summary>完整检索关键词</summary><div class="review-keywords">${direction.keywords.split(",").map((item) => `<span>${escapeHtml(item.trim())}</span>`).join("")}</div></details>
      <p class="review-drawer-note">这些内容将用于下一步查找和分析选题文献。</p>
    </div>
    <footer><button data-action="review-close-direction">关闭</button><button class="${direction.selected ? "review-cancel" : "review-save"}" data-action="${direction.selected ? "review-remove-from-detail" : "review-select-from-detail"}" data-direction-id="${escapeHtml(direction.id)}">${direction.selected ? "移出已选" : "选择这个方向"}</button></footer>
  </aside>`;
}

function regeneratedReviewDirections(generation) {
  const groups = [
    [
      ["imaging", "脊柱结核的影像学诊断", "重点了解 MRI、CT 等影像表现及不同病程阶段的识别线索。", "补充影像学判断视角，与当前关注的早期诊断和鉴别诊断相关。", "MRI、CT、早期影像征象与影像学鉴别。", "不同影像征象的适用阶段和鉴别能力仍需通过文献确认。", "spinal tuberculosis, imaging diagnosis, MRI, CT"],
      ["combined", "脊柱结核的联合诊断策略", "重点了解影像学、实验室和分子检测联合使用的诊断路径。", "回应提高诊断准确性的核心问题，并覆盖当前多个重点关注。", "联合诊断模型、检测组合、诊断流程与临床应用。", "不同组合是否优于单一方法及其适用场景仍需验证。", "spinal tuberculosis, combined diagnosis, diagnostic pathway"],
      ["special-populations", "特殊人群脊柱结核的诊断", "重点了解儿童、老年人及免疫功能受损人群中的诊断特点。", "补充不同人群的临床表现差异，帮助明确诊断方法的适用边界。", "儿童、老年人、免疫功能受损人群与非典型表现。", "各人群的直接诊断证据和可比较性仍需进一步核对。", "spinal tuberculosis, special populations, diagnosis"],
    ],
    [
      ["misdiagnosis", "脊柱结核的误诊原因与识别线索", "重点了解常见误诊疾病、误诊环节和能够提示脊柱结核的关键线索。", "直接关联鉴别诊断准确性，便于梳理临床判断中容易遗漏的问题。", "误诊疾病、诊断延迟、非典型表现和关键识别线索。", "误诊模式能否跨场景归纳，需要结合当前文献批次判断。", "spinal tuberculosis, misdiagnosis, diagnostic delay"],
      ["pathology", "脊柱结核的病理学诊断", "重点了解组织病理、取材方式及其与其他诊断方法的配合。", "补充确诊环节的证据来源，与当前诊断和鉴别诊断主题相关。", "组织病理、取材方式、诊断标准与联合检测。", "不同取材方式的诊断表现和临床适用性仍需确认。", "spinal tuberculosis, histopathology, biopsy, diagnosis"],
      ["diagnostic-pathway", "脊柱结核的临床诊断路径", "重点了解从症状、影像到实验室与病理检查的分层诊断流程。", "将当前关注的多种诊断方法组织为连续临床决策路径。", "诊断流程、检查顺序、转诊节点与确诊标准。", "现有文献是否支持统一路径，以及不同地区的适用性仍待验证。", "spinal tuberculosis, diagnostic algorithm, clinical pathway"],
    ],
  ];
  return groups[generation % groups.length].map(([key, title, description, reason, searchFocus, pending, keywords]) => ({
    id: `generated-${generation}-${key}`,
    title,
    description,
    reason,
    searchFocus,
    pending,
    keywords,
    selected: false,
  }));
}

function renderReviewWorkspace() {
  if (state.review.nonMedical) {
    app.innerHTML = `<div class="app-shell review-shell">${reviewTopbar()}<div class="review-workspace">${reviewSidebar(0)}<main class="review-main"><header class="review-page-head"><h1>暂时无法开始医学综述</h1><p>当前输入未识别为医学主题。请返回首页，补充疾病、人群或临床研究问题。</p></header><section class="review-editor-card"><p class="review-analysis-empty">系统不会从非医学输入外推医学事实或研究内容。</p><button class="review-save" data-action="go-portal">返回首页</button></section></main></div></div>`; return;
  }
  if (state.review.stage === "topic-literature") { app.innerHTML = renderReviewTopicLiteratureWorkspace(); return; }
  if (state.review.stage === "topic-analysis") { app.innerHTML = renderReviewAnalysisWorkspace(); return; }
  if (state.review.stage === "approach") { app.innerHTML = renderReviewApproachWorkspace(); return; }
  if (state.review.stage === "writing-requirements") { app.innerHTML = renderReviewWritingRequirementsWorkspace(); return; }
  if (state.review.stage === "writing") { app.innerHTML = renderReviewWritingWorkspace(); return; }
  if (state.review.stage === "export") { app.innerHTML = renderReviewExportWorkspace(); return; }
  if (state.review.stage === "evidence-loading") { state.review.evidencePhase = "searching"; app.innerHTML = renderReviewEvidenceWorkspace(); return; }
  if (state.review.stage === "evidence") {
    app.innerHTML = renderReviewEvidenceWorkspace();
    return;
  }
  if (state.review.stage === "outline") {
    app.innerHTML = renderReviewOutlineWorkspace();
    return;
  }
  if (state.review.stage === "topic") {
    app.innerHTML = renderReviewTopicWorkspace();
    return;
  }
  const selected = state.review.directions.filter((item) => item.selected);
  const candidates = state.review.directions.filter((item) => !item.selected);
  const selectionFull = selected.length >= 2;
  const orderedDirections = [...selected, ...candidates];
  const body = state.review.editingRequirements ? renderReviewRequirementsEditor() : `<main class="review-main">
    <header class="review-page-head"><h1>明确需求与方向</h1><p>确认核心问题和研究要点，选择后续要重点了解和比较的研究方向。</p></header>
    ${renderReviewRequirementSummary()}
    <section class="review-directions">
      <div class="review-directions-head"><div><h2>候选研究方向 <span>共 ${orderedDirections.length} 个</span></h2><p>建议选择 1～2 个，每个方向将分别查找文献。重新生成只更新未选择的系统候选。</p></div><div class="review-direction-tools"><button class="review-regenerate" data-action="review-regenerate-directions" ${state.review.regeneratingDirections ? "disabled" : ""}>${state.review.regeneratingDirections ? "生成中…" : "↻ 重新生成"}</button><button data-action="review-custom-direction">＋ 自定义研究方向</button></div></div>
      <div class="review-direction-grid">${orderedDirections.length ? orderedDirections.map((direction) => renderReviewDirectionCard(direction, selectionFull)).join("") : `<div class="review-candidate-empty"><p>暂无候选研究方向</p><button data-action="review-regenerate-directions">重新生成候选方向</button></div>`}</div>
    </section>
    <footer class="review-footer"><strong>已选择 ${selected.length} 个方向</strong><button class="review-save" data-action="review-confirm-directions" ${selected.length ? "" : "disabled"}>确认，查找选题文献&nbsp; →</button></footer>
  </main>`;
  app.innerHTML = `<div class="app-shell review-shell">${reviewTopbar()}<div class="review-workspace">${reviewSidebar(0)}${body}</div>${renderReviewDirectionDrawer()}</div>`;
}

function literatureSearchBox(value, compact = false) {
  const enabled = String(value || "").trim();
  const mode = compact ? state.literature.searchMode : state.literatureTab;
  const dimension = compact ? state.literature.lookupDimension : "";
  const placeholder = mode === "specific" ? (compact && dimension ? SPECIFIC_LOOKUP_OPTIONS[dimension].placeholder : "输入 PMID、DOI、期刊名称、文献标题或作者姓名") : "输入疾病、干预、人群、结局或研究问题";
  return `<div class="literature-search ${compact ? "compact" : ""}">
    ${compact ? `<img class="literature-search-icon" src="/assets/literature-search.svg" width="20" height="20" alt="">` : ""}
    <input id="${compact ? "literature-result-query" : "literature-query"}" value="${escapeHtml(value)}" maxlength="500" placeholder="${escapeHtml(placeholder)}" aria-label="文献查找需求">
    ${enabled ? `<button class="literature-clear" data-action="clear-literature-query" aria-label="清除检索主题"><img src="/assets/literature-clear.svg" width="20" height="20" alt=""></button>` : ""}
    <button class="literature-send" data-action="submit-literature" ${enabled ? "" : "disabled"} aria-label="开始检索"><img src="/assets/literature-send.svg" width="18" height="18" alt=""></button>
  </div>`;
}

function renderLiteratureHome() {
  const mode = state.literatureTab;
  const draft = currentLiteratureHomeDraft();
  const history = state.literatureHistory.map((item, index) => ({ item, index })).filter(({ item }) => (item.session?.searchMode || "topic") === mode && (mode === "topic" || SPECIFIC_LOOKUP_OPTIONS[item.session?.lookupDimension])).map(({ item, index }) => `<div class="literature-history-row">
    <button class="literature-history-open" data-action="open-literature-history" data-index="${index}"><span class="history-clock">◷</span><span class="literature-history-badge">${mode === "specific" ? escapeHtml(SPECIFIC_LOOKUP_OPTIONS[literatureHistoryDimension(item.session)]?.label || "文献") : "主题"}</span><span>${escapeHtml(item.query)}</span></button>
    <button class="literature-history-delete" data-action="delete-literature-history" data-index="${index}" aria-label="删除这条搜索记录">×</button>
  </div>`).join("");
  const topicExamples = `<button data-action="use-literature-example" data-query="急性缺血性脑卒中机械取栓">疾病 + 治疗</button><button data-action="use-literature-example" data-query="老年高血压患者的长期预后因素">人群 + 结局</button><button data-action="use-literature-example" data-query="人工智能辅助肺结节诊断">诊断方法</button>`;
  app.innerHTML = `<div class="app-shell literature-home-shell">${topbar(true)}
    <main class="literature-home-main">
      <section class="literature-home-title">
        <div class="literature-title-copy"><div class="literature-title-line"><img src="/assets/literature-icon.svg" width="32" height="32" alt=""><h1>查文献</h1></div><p>选择查找方式，获得与当前任务对应的结果</p></div>
        <button class="icon-btn" data-action="go-portal" aria-label="关闭查文献">×</button>
      </section>
      <div class="literature-scene-tabs" role="tablist" aria-label="文献查找方式"><button role="tab" aria-selected="${mode === "topic"}" class="${mode === "topic" ? "active" : ""}" data-action="switch-literature-tab" data-mode="topic"><strong>按主题查找</strong><span>围绕研究问题找一批文献</span></button><button role="tab" aria-selected="${mode === "specific"}" class="${mode === "specific" ? "active" : ""}" data-action="switch-literature-tab" data-mode="specific"><strong>找特定文献</strong><span>通过标识符或题录定位一篇文献</span></button></div>
      <div class="literature-scene-copy"><strong>${mode === "specific" ? "输入你已知的文献信息" : "查找与研究问题相关的一批文献"}</strong><span>${mode === "specific" ? "可输入 PMID、DOI、期刊名称、完整或部分标题、作者姓名；系统只选择其中一个维度查询" : "输入疾病、干预、人群、结局或研究方向，系统将规划检索并分析当前文献批次"}</span></div>
      ${literatureSearchBox(draft)}
      ${mode === "topic" ? `<div class="literature-search-examples"><span>示例</span>${topicExamples}</div>` : ""}
      ${history ? `<section class="literature-history"><div class="literature-history-head"><span>${mode === "specific" ? "特定文献查找记录" : "主题查找记录"}</span><button data-action="clear-literature-history" aria-label="清空搜索记录">⌫</button></div>${history}</section>` : ""}
    </main>
  </div>`;
}

function renderLiteratureLoading() {
  return `<section class="literature-loading"><div class="literature-pulse" aria-hidden="true"><span></span><span></span></div><p>${escapeHtml(state.literature.phaseText || "正在处理检索任务")}</p></section>`;
}

function filterChoice(field, value, label, count, checked, disabled = false) {
  return `<label class="literature-filter-choice ${disabled ? "disabled" : ""}"><input type="checkbox" data-literature-filter="${field}" value="${escapeHtml(value)}" ${checked ? "checked" : ""} ${disabled ? "disabled" : ""}><span>${escapeHtml(label)}</span><b>${count}</b></label>`;
}

function renderLiteratureFilters() {
  const filters = state.literature.filters;
  const records = state.literature.records;
  const nowYear = new Date().getFullYear();
  const typeOptions = ["综述", "原始研究", "临床试验", "病例报告", "指南/共识", "其他"];
  const typeChoices = typeOptions.map((type) => filterChoice("types", type, type, countLiterature((item) => literatureType(item) === type), filters.types.includes(type))).join("");
  const yearChoice = (value, label) => `<label class="literature-filter-choice"><input type="radio" name="literature-time" data-literature-time value="${value}" ${filters.time === value ? "checked" : ""}><span>${label}</span><b>${value === "custom" ? "" : countLiterature((item) => Number(item.year || 0) >= nowYear - Number(value))}</b></label>`;
  const jcrChoices = ["Q1", "Q2", "Q3", "Q4"].map((value) => filterChoice("jcr", value, value, countLiterature((item) => item.jcr === value), filters.jcr.includes(value), !records.some((item) => item.jcr))).join("");
  const ifChoices = [["<3", "< 3"], ["3-10", "3–10"], ["10-30", "10–30"], [">=30", "≥ 30"]].map(([value, label]) => filterChoice("ifRanges", value, label, 0, filters.ifRanges.includes(value), !records.some((item) => Number.isFinite(Number(item.impactFactor))))).join("");
  return `<aside class="literature-filters">
    <section><h3>发表时间</h3>${yearChoice("1", "近 1 年")}${yearChoice("3", "近 3 年")}${yearChoice("5", "近 5 年")}${yearChoice("10", "近 10 年")}${yearChoice("custom", "自定义")}${filters.time === "custom" ? `<div class="literature-year-range"><input data-literature-custom="customStart" inputmode="numeric" placeholder="开始年份" value="${escapeHtml(filters.customStart)}"><span>—</span><input data-literature-custom="customEnd" inputmode="numeric" placeholder="结束年份" value="${escapeHtml(filters.customEnd)}"></div>` : ""}</section>
    <section><h3>文献类型</h3>${typeChoices}</section>
    <section><h3>JCR 分区</h3>${jcrChoices}<p class="filter-data-note">PubMed 未提供 JCR 时不补造</p></section>
    <section><h3>影响因子 IF</h3>${ifChoices}<p class="filter-data-note">PubMed 未提供 IF 时不补造</p></section>
    <section><button class="literature-advanced-toggle" data-action="toggle-literature-advanced"><strong>高级筛选</strong><span>${state.literature.advancedOpen ? "⌃" : "⌄"}</span></button>${state.literature.advancedOpen ? `<h3>文献语言</h3>${["英文", "中文"].map((value) => filterChoice("languages", value, value, countLiterature((item) => literatureLanguage(item) === value), filters.languages.includes(value))).join("")}<h3>全文状态</h3>${["开放获取", "非开放获取"].map((value) => filterChoice("fulltext", value, value, countLiterature((item) => (item.openAccess ? "开放获取" : "非开放获取") === value), filters.fulltext.includes(value))).join("")}` : ""}</section>
    <button class="literature-reset" data-action="reset-literature-filters">重置筛选</button>
  </aside>`;
}

function renderLiteratureCard(item) {
  const titleZh = item.titleZh || item.title;
  const recordKey = literatureRecordKey(item);
  const reasons = (item.matchReasons || []).map((reason) => `<span>${escapeHtml(reason)}</span>`).join("");
  const authors = item.authors || [];
  const authorSummary = authors.length > 3 ? `${authors.slice(0, 3).join("、")} 等` : authors.join("、");
  const citation = [item.journal || "期刊信息缺失", item.year, item.volume ? `${item.volume}卷` : "", item.issue ? `${item.issue}期` : "", item.pages ? `${item.pages}页` : ""].filter(Boolean).join("，");
  const sourceLabel = (item.sources || [item.source]).filter(Boolean).join(" + ") || "文献来源";
  const specificMeta = `<p class="literature-card-authors">${escapeHtml(authorSummary || "作者信息缺失")}</p><p class="literature-card-citation">${escapeHtml(citation)}</p><div class="literature-submeta"><span>${escapeHtml(literatureIdentifier(item))}</span></div>`;
  const topicMeta = `<div class="literature-meta"><span>${escapeHtml(item.journal || "期刊信息缺失")}</span>${item.impactFactor ? `<i>IF:${escapeHtml(item.impactFactor)}</i>` : ""}${item.jcr ? `<i>${escapeHtml(item.jcr)}</i>` : ""}${item.year ? `<i>${escapeHtml(item.year)}</i>` : ""}</div><div class="literature-submeta"><span>${escapeHtml(literatureType(item))}</span><span>· ${escapeHtml(literatureIdentifier(item))}</span>${item.volume ? `<span>· ${escapeHtml(item.volume)}卷${item.issue ? ` ${escapeHtml(item.issue)}期` : ""}${item.pages ? ` ${escapeHtml(item.pages)}页` : ""}</span>` : ""}</div>${reasons ? `<div class="literature-match-reasons">${reasons}</div>` : ""}`;
  return `<article class="literature-card ${state.literature.searchMode === "specific" ? "specific-card" : ""} ${item.selected !== false ? "selected" : ""}">
    <label class="literature-card-check"><input type="checkbox" data-literature-select="${escapeHtml(recordKey)}" ${item.selected !== false ? "checked" : ""}><span class="sr-only">选择当前文献</span></label>
    <button class="literature-card-main" data-action="open-literature-detail" data-record-key="${escapeHtml(recordKey)}">
      <h3>${escapeHtml(titleZh)}</h3>${item.titleZh ? `<p class="literature-original-title">${escapeHtml(item.title)}</p>` : ""}
      ${state.literature.searchMode === "specific" ? specificMeta : topicMeta}
    </button>
    <a class="literature-source" href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noopener">${state.literature.searchMode === "specific" ? `${escapeHtml(sourceLabel)} · 查看原文 ↗` : "查看来源 ↗"}</a>
  </article>`;
}

function renderLiteratureDetailPanel() {
  const item = state.literature.records.find((record) => literatureRecordKey(record) === state.literature.detailRecordKey);
  if (!item) return "";
  const authors = (item.authors || []).join("、") || "作者信息缺失";
  const citation = [item.year, item.volume ? `${item.volume}卷` : "", item.issue ? `${item.issue}期` : "", item.pages ? `${item.pages}页` : ""].filter(Boolean).join(" · ");
  const sourceRecordId = String(item.sourceRecordId || "");
  const repeatsPublicIdentifier = [item.pmid, item.doi].filter(Boolean).some((value) => String(value).toLowerCase() === sourceRecordId.toLowerCase());
  const sourceName = (item.sources || [item.source]).filter(Boolean).join(" + ") || "来源未标注";
  return `<aside class="literature-panel"><div class="literature-panel-head"><h2>文献详情</h2><button class="icon-btn" data-action="show-literature-analysis" aria-label="关闭文献详情">×</button></div>
    <div class="literature-panel-body"><section class="literature-detail-title"><h3>${escapeHtml(item.titleZh || item.title)}</h3>${item.titleZh ? `<p>${escapeHtml(item.title)}</p>` : ""}<div class="literature-meta"><span>${escapeHtml(item.journal || "期刊信息缺失")}</span>${item.year ? `<i>${escapeHtml(item.year)}</i>` : ""}</div><p class="literature-authors">${escapeHtml(authors)}</p>${citation ? `<p class="literature-citation-line">${escapeHtml(citation)}</p>` : ""}<div class="literature-submeta"><span>${escapeHtml(literatureType(item))}</span>${item.pmid ? `<span>· PMID: ${escapeHtml(item.pmid)}</span>` : ""}${item.doi ? `<span>· DOI: ${escapeHtml(item.doi)}</span>` : ""}</div><p class="literature-source-id">数据来源：${escapeHtml(sourceName)}${sourceRecordId && !repeatsPublicIdentifier ? ` · 来源ID：${escapeHtml(sourceRecordId)}` : ""}</p><div class="literature-detail-actions"><button class="btn btn-secondary btn-small" data-action="start-literature-interpretation" data-record-key="${escapeHtml(literatureRecordKey(item))}" ${item.abstract ? "" : "disabled"}>解读文献</button><a class="literature-source" href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noopener">查看原文 ↗</a></div></section>
    <section class="literature-detail-section"><h3>摘要</h3><p>${escapeHtml(item.abstract || "当前数据源未提供摘要；这是正常的元数据缺失状态，请前往来源页核对原文。")}</p></section>
    <section class="literature-boundary"><strong>证据边界</strong><p>该文献属于当前检索批次。进入正文前仍需核对研究对象、临床场景、结局与原文内容。</p></section></div>
  </aside>`;
}

function renderLiteratureAnalysisPanel() {
  const literature = state.literature;
  const directions = (literature.analysis.directions || []).map((direction, index) => `<section class="literature-direction"><h3>${index + 1}. ${escapeHtml(direction.title)}</h3><p>${escapeHtml(direction.analysis)}</p><button data-action="filter-literature-direction" data-direction-id="${escapeHtml(direction.id)}">查看相关文献 · ${direction.pmids.length}<span>›</span></button></section>`).join("");
  return `<aside class="literature-panel analysis-panel"><div class="literature-panel-head"><h2>✦ 文献分析报告</h2></div><div class="literature-panel-body">${literature.phase === "analyzing" ? renderLiteratureLoading() : `<p class="literature-analysis-summary">${escapeHtml(literature.analysis.summary || "当前批次尚未生成分析报告。")}</p>${directions}`}</div></aside>`;
}

function renderLiteratureResults() {
  const literature = state.literature;
  const visible = filteredLiteratureRecords();
  const selectedVisible = visible.filter((item) => item.selected !== false).length;
  const allVisibleSelected = visible.length > 0 && selectedVisible === visible.length;
  const selectedTotal = literature.records.filter((item) => item.selected !== false).length;
  const direction = literature.searchMode === "topic" ? literature.analysis.directions.find((item) => item.id === literature.filters.direction) : null;
  const panel = literature.panel === "detail" ? renderLiteratureDetailPanel() : literature.searchMode === "specific" ? "" : renderLiteratureAnalysisPanel();
  const top = `<header class="literature-results-top"><button class="icon-btn" data-action="back-literature-home"><img src="/assets/literature-back.svg" width="24" height="24" alt="返回"></button><span class="literature-result-mode">${literature.searchMode === "specific" ? "特定文献" : "主题"}</span>${literatureSearchBox(literature.queryDraft, true)}<div class="avatar">CP</div></header>`;
  if (["planning", "searching"].includes(literature.phase) && !literature.records.length) {
    app.innerHTML = `<div class="app-shell">${top}${renderLiteratureLoading()}</div>`;
    return;
  }
  if (literature.phase === "error") {
    app.innerHTML = `<div class="app-shell">${top}<section class="literature-empty"><h2>检索未完成</h2><p>${escapeHtml(literature.error)}</p><button class="btn btn-primary" data-action="submit-literature">重新检索</button></section></div>`;
    return;
  }
  const dimensionLabel = SPECIFIC_LOOKUP_OPTIONS[literature.lookupDimension]?.label || "文献信息";
  const statusCopy = literature.resultStatus === "unique" ? "找到 1 篇精确匹配结果" : literature.resultStatus === "candidates" ? `找到 ${literature.records.length} 篇候选，请勾选需要的文献` : "当前事实源未找到匹配文献";
  const statusBanner = literature.searchMode === "specific" ? `<div class="literature-result-banner ${escapeHtml(literature.resultStatus || "not_found")}"><span>按${escapeHtml(dimensionLabel)}检索：${escapeHtml(literature.query)}</span><strong>${escapeHtml(statusCopy)}</strong>${literature.providerErrors.length ? `<span>部分数据源未完成，结果仅代表已返回的数据源</span>` : ""}</div>` : "";
  const list = visible.map(renderLiteratureCard).join("") || `<section class="literature-empty compact"><h2>${literature.searchMode === "specific" ? "未找到匹配文献" : "暂无符合条件的文献"}</h2><p>${literature.searchMode === "specific" ? `请修改${escapeHtml(SPECIFIC_LOOKUP_OPTIONS[literature.lookupDimension]?.label || "查找内容")}后重试，或返回选择其他维度。` : "可以调整筛选条件或重新检索。"}</p></section>`;
  const toolbar = literature.searchMode === "specific" ? "" : `<div class="literature-list-toolbar"><label><input type="checkbox" data-literature-select-all ${allVisibleSelected ? "checked" : ""} ${visible.length ? "" : "disabled"}> 全选</label>${direction ? `<button class="literature-direction-tag" data-action="clear-literature-direction">${escapeHtml(direction.title)} ×</button>` : ""}<select data-literature-sort aria-label="排序方式"><option value="relevance" ${literature.sort === "relevance" ? "selected" : ""}>相关性</option><option value="latest" ${literature.sort === "latest" ? "selected" : ""}>最新发表</option></select></div>`;
  const footerCopy = `已选：${selectedTotal} 篇`;
  const canExport = Boolean(selectedTotal);
  const selectedItem = selectedTotal === 1 ? literature.records.find((item) => item.selected !== false) : null;
  const interpret = selectedItem ? `<button class="btn btn-secondary" data-action="start-literature-interpretation" data-record-key="${escapeHtml(literatureRecordKey(selectedItem))}" ${selectedItem.abstract ? "" : "disabled"}>解读文献</button>` : "";
  const footer = `<footer class="literature-footer ${panel ? "" : "full-width"}"><span>${footerCopy}</span><div class="literature-footer-actions">${interpret}<button class="btn btn-primary" data-action="export-literature" ${canExport ? "" : "disabled"}>导出文献 →</button></div></footer>`;
  app.innerHTML = `<div class="app-shell literature-results-shell">${top}<main class="literature-results-main ${panel ? "" : "without-panel"}"><div class="literature-results-center ${literature.searchMode === "specific" ? "specific-results" : ""}">${literature.searchMode === "specific" ? "" : renderLiteratureFilters()}<section class="literature-list-column">
    ${statusBanner}${toolbar}<div class="literature-list">${list}</div></section>${footer}</div>${panel}</main></div>`;
}

const REPORT_STATUS_LABELS = { generating: "生成中", pending: "正文待确认", confirmed: "已确认", exported: "已导出", error: "生成失败" };
const REPORT_SOURCE_LABELS = { metadata: "题录", abstract: "摘要", not_available: "系统整理 / 待核对" };

function activeLiteratureReport() {
  return state.literatureReports.find((report) => report.id === state.activeLiteratureReportId);
}

function beginLiteratureInterpretation(recordKey) {
  const item = state.literature.records.find((record) => literatureRecordKey(record) === recordKey);
  if (!item) throw new Error("未找到需要解读的文献");
  if (!String(item.abstract || "").trim()) throw new Error("当前只获得文献题录，至少需要摘要才能生成解读");
  state.interpretationDraft = {
    item: JSON.parse(JSON.stringify(item)),
    title: `${item.titleZh || item.title}解读`.slice(0, 180),
    purpose: "个人阅读",
    focus: "",
    detail: "标准",
    language: "中文",
    sourceSearch: { mode: state.literature.searchMode, query: state.literature.query, searchedAt: state.literature.searchedAt },
  };
  state.screen = "literature-interpretation-setup";
  render();
}

function reportPaperMeta(item = {}) {
  return [
    (item.authors || []).join("、"),
    item.journal,
    item.year,
    item.volume ? `${item.volume}卷` : "",
    item.issue ? `${item.issue}期` : "",
    item.pages ? `${item.pages}页` : "",
    item.pmid ? `PMID: ${item.pmid}` : "",
    item.doi ? `DOI: ${item.doi}` : "",
  ].filter(Boolean).join(" · ");
}

function reportTopbar({ title, status, backAction = "go-portal", editable = false, paperUrl = "" }) {
  return `<header class="topbar report-shared-topbar">
    <button class="back-btn" data-action="${escapeHtml(backAction)}" aria-label="返回">‹</button>
    <div class="project-title report-project-title">
      ${editable ? `<input class="report-project-title-input" data-report-title value="${escapeHtml(title)}" maxlength="180" aria-label="报告标题">` : `<strong title="${escapeHtml(title)}">${escapeHtml(title)}</strong>`}
      <span class="task-tag">文献解读</span>
    </div>
    <span class="mode-tag">${escapeHtml(status)}</span>
    <div class="topbar-spacer"></div>
    ${paperUrl ? `<a class="text-action" href="${escapeHtml(paperUrl)}" target="_blank" rel="noopener">查看原文 ↗</a>` : ""}
    <div class="avatar" aria-label="当前用户">CP</div>
  </header>`;
}

function reportStepsSidebar(currentStep, detail = "") {
  const steps = ["设置解读要求", "编辑并核对正文", "确认与导出"];
  return `<aside class="steps-sidebar report-steps-sidebar">
    <div class="steps-heading"><img src="/assets/ai-icon.png" width="20" height="20" alt="">文献解读流程</div>
    <ol class="step-list">${steps.map((label, index) => {
      const cls = index === currentStep ? "current" : index < currentStep ? "done" : "locked";
      return `<li class="step-item ${cls}"><span class="step-line"><span class="step-dot"></span></span><span class="step-label">${escapeHtml(label)}</span></li>`;
    }).join("")}</ol>
    ${detail ? `<div class="report-sidebar-note"><span>当前分析范围</span><strong>摘要级解读</strong><p>${escapeHtml(detail)}</p></div>` : ""}
  </aside>`;
}

function renderInterpretationSetup() {
  const draft = state.interpretationDraft;
  if (!draft?.item) {
    state.screen = "literature-results";
    renderLiteratureResults();
    return;
  }
  const item = draft.item;
  app.innerHTML = `<div class="app-shell report-shell">
    ${reportTopbar({ title: "单篇文献解读", status: "解读设置", backAction: "back-from-interpretation" })}
    <div class="workspace">${reportStepsSidebar(0, "使用当前文献题录与摘要，不读取其他检索结果。")}
      <section class="workarea">
        <div class="page-head"><div class="page-head-inner"><p class="eyebrow">步骤 1 / 3</p><h2>设置解读要求</h2></div></div>
        <main class="content report-content"><div class="content-inner report-content-stack">
          <section class="report-source-card">
            <div class="report-card-heading"><span class="report-section-icon">文</span><div><span>待解读文献</span><strong>${escapeHtml(item.titleZh || item.title)}</strong></div><span class="task-tag">摘要级</span></div>
            ${item.titleZh ? `<p class="paper-original-title">${escapeHtml(item.title)}</p>` : ""}
            <p class="report-source-meta">${escapeHtml(reportPaperMeta(item))}</p>
            <div class="report-source-actions"><span>数据来源：${escapeHtml(item.source || "文献事实源")}</span><a class="text-action" href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noopener">查看原文 ↗</a></div>
          </section>
          <section class="notice suggested report-scope-notice"><div class="notice-row"><span class="notice-label">当前分析依据</span><span>已获得题录和摘要，未获得可解析全文。生成结果会明确标记缺失项，不代表已完成全文方法学评价。</span></div></section>
          <section class="report-form-card">
            <div class="report-block-title"><h3>报告设置</h3><span>带 * 为必填项</span></div>
            <div class="field-grid report-setting-grid">
              <label class="field-label" for="interpretation-title">解读标题 *</label><input id="interpretation-title" class="field-control" data-interpretation-field="title" maxlength="180" value="${escapeHtml(draft.title)}">
              <label class="field-label" for="interpretation-purpose">使用目的 *</label><select id="interpretation-purpose" class="field-control" data-interpretation-field="purpose">${["个人阅读", "科室汇报", "课题组讨论", "论文准备"].map((value) => `<option ${draft.purpose === value ? "selected" : ""}>${value}</option>`).join("")}</select>
              <label class="field-label" for="interpretation-detail">解读详略 *</label><select id="interpretation-detail" class="field-control" data-interpretation-field="detail">${["简要", "标准", "详细"].map((value) => `<option ${draft.detail === value ? "selected" : ""}>${value}</option>`).join("")}</select>
              <label class="field-label" for="interpretation-language">输出语言 *</label><select id="interpretation-language" class="field-control" data-interpretation-field="language"><option selected>中文</option></select>
              <label class="field-label" for="interpretation-focus">重点问题</label><div><textarea id="interpretation-focus" class="edit-textarea" data-interpretation-field="focus" maxlength="1000" placeholder="例如：重点关注研究人群、主要结局与临床适用性">${escapeHtml(draft.focus)}</textarea><p class="field-help">用于限定模型的阅读重点，不作为文献事实或医学证据来源。</p></div>
            </div>
          </section>
          <section class="report-output-card"><div><strong>预计生成内容</strong><span>8 个结构化章节</span></div><p>基本信息、研究问题、研究方法、主要结果、作者结论、研究局限、适用性、阅读要点</p></section>
        </div></main>
        ${footerButtons([button("返回", "back-from-interpretation", "weak"), button("开始解读 →", "create-literature-interpretation", "primary", draft.title.trim() ? "" : "disabled")])}
      </section>
    </div>
  </div>`;
}

async function generateLiteratureInterpretation(report) {
  report.status = "generating";
  report.error = "";
  report.updatedAt = new Date().toISOString();
  state.activeLiteratureReportId = report.id;
  state.screen = "literature-report";
  render();
  try {
    const item = report.paper;
    const result = await callLiteratureModel("literature_single_interpretation", {
      item: {
        recordKey: literatureRecordKey(item), title: item.title, titleZh: item.titleZh || "", authors: item.authors || [], journal: item.journal || "", year: item.year || "", volume: item.volume || "", issue: item.issue || "", pages: item.pages || "", publicationTypes: item.publicationTypes || [], pmid: item.pmid || "", doi: item.doi || "", source: item.source || "", sourceRecordId: item.sourceRecordId || "", abstract: item.abstract,
      },
      purpose: report.settings.purpose,
      focus: report.settings.focus,
      detail: report.settings.detail,
      language: report.settings.language,
      analysisScope: "只能使用当前文献题录和摘要；未提供的内容保留缺失状态。",
    });
    report.result = result;
    report.status = "pending";
    report.mode = state.generationMode;
    report.updatedAt = new Date().toISOString();
    state.activeReportSectionId = result.sections?.[0]?.id || "basic";
  } catch (error) {
    report.status = "error";
    report.error = error.message || "解读生成失败";
    report.updatedAt = new Date().toISOString();
  }
  render();
}

async function createLiteratureInterpretation() {
  const draft = state.interpretationDraft;
  if (!draft?.item?.abstract) throw new Error("当前文献没有可用摘要");
  if (!draft.title.trim()) throw new Error("请填写解读标题");
  const now = new Date().toISOString();
  const report = {
    id: globalThis.crypto?.randomUUID?.() || `literature-report-${Date.now()}`,
    type: "single",
    title: draft.title.trim(),
    paper: JSON.parse(JSON.stringify(draft.item)),
    settings: { purpose: draft.purpose, focus: draft.focus.trim(), detail: draft.detail, language: draft.language },
    sourceSearch: draft.sourceSearch,
    analysisLevel: "abstract",
    status: "generating",
    result: null,
    createdAt: now,
    updatedAt: now,
    confirmedAt: "",
    exports: [],
    error: "",
  };
  state.literatureReports.unshift(report);
  state.interpretationDraft = null;
  await generateLiteratureInterpretation(report);
}

function reportDialog(report) {
  if (state.confirmReportOpen) return `<div class="report-modal-overlay"><section class="report-modal"><h2>确认当前正文</h2><p>确认后即可导出报告。若后续再次编辑，正文会自动回到待确认状态。</p><div class="report-modal-summary"><span>报告</span><strong>${escapeHtml(report.title)}</strong><span>分析范围</span><strong>题录与摘要</strong></div>${report.result?.missing?.length ? `<div class="notice suggested compact"><div class="notice-row"><span class="notice-label">仍需核对</span><span>${escapeHtml(report.result.missing.join("；"))}</span></div></div>` : ""}<div class="report-modal-actions"><button class="btn btn-weak" data-action="close-report-confirm">返回核对</button><button class="btn btn-primary" data-action="confirm-report-body">确认正文</button></div></section></div>`;
  if (state.exportReportOpen) return `<div class="report-modal-overlay"><section class="report-modal"><h2>导出单篇文献解读</h2><label><span>文件名</span><input id="report-export-name" maxlength="180" value="${escapeHtml(report.title)}"></label><label><span>文件格式</span><select id="report-export-format"><option value="doc">Word (.doc)</option><option value="md">Markdown (.md)</option></select></label><div class="report-export-includes"><strong>将包含</strong><span>解读正文</span><span>文献题录</span><span>摘要级依据说明</span><span>参考文献</span></div><div class="report-modal-actions"><button class="btn btn-weak" data-action="close-report-export">取消</button><button class="btn btn-primary" data-action="download-literature-report">导出文件</button></div></section></div>`;
  return "";
}

function renderLiteratureReport() {
  const report = activeLiteratureReport();
  if (!report) {
    state.screen = "portal";
    renderPortalHome();
    return;
  }
  const statusLabel = REPORT_STATUS_LABELS[report.status] || "草稿";
  if (report.status === "generating") {
    app.innerHTML = `<div class="app-shell report-shell">${reportTopbar({ title: report.title, status: statusLabel })}<div class="workspace">${reportStepsSidebar(1, "模型仅处理当前文献题录与摘要。")}
      <section class="workarea"><div class="page-head"><div class="page-head-inner"><p class="eyebrow">步骤 2 / 3</p><h2>生成解读正文</h2></div></div><main class="content"><div class="content-inner"><section class="report-loading-card"><div class="literature-pulse"><span></span><span></span></div><h3>正在生成结构化解读</h3><p>${escapeHtml(report.paper.titleZh || report.paper.title)}</p><div class="report-loading-steps"><span class="done">核对文献与可用内容</span><span>提取研究方法与主要结果</span><span>整理结论、局限和适用范围</span><span>生成八个结构化章节</span></div><small>任务已保存，可以返回“我的写作”稍后查看</small></section></div></main></section></div></div>`;
    return;
  }
  if (report.status === "error") {
    app.innerHTML = `<div class="app-shell report-shell">${reportTopbar({ title: report.title, status: statusLabel })}<div class="workspace">${reportStepsSidebar(1, "已保留文献快照和解读设置。")}
      <section class="workarea"><div class="page-head"><div class="page-head-inner"><p class="eyebrow">步骤 2 / 3</p><h2>生成解读正文</h2></div></div><main class="content"><div class="content-inner"><section class="report-error-card"><span class="report-error-icon">!</span><h3>解读未完成</h3><p>${escapeHtml(report.error)}</p><button class="btn btn-primary" data-action="retry-literature-report">重新生成</button></section></div></main></section></div></div>`;
    return;
  }
  const sections = report.result?.sections || [];
  if (!state.activeReportSectionId || !sections.some((section) => section.id === state.activeReportSectionId)) state.activeReportSectionId = sections[0]?.id || "";
  const activeSection = sections.find((section) => section.id === state.activeReportSectionId) || sections[0];
  const confirmed = ["confirmed", "exported"].includes(report.status);
  const backedCount = sections.filter((section) => ["metadata", "abstract"].includes(section.sourceScope)).length;
  const reviewCount = sections.length - backedCount;
  const currentStep = confirmed ? 2 : 1;
  const evidenceDrawer = state.reportEvidenceOpen ? `<div class="drawer-overlay" data-action="toggle-report-evidence"></div><aside class="drawer report-evidence-drawer" aria-label="文献依据"><div class="drawer-head"><div><span>文献依据</span><h3>${escapeHtml(activeSection?.title || "当前章节")}</h3></div><button class="icon-btn" data-action="toggle-report-evidence" aria-label="关闭文献依据">×</button></div><section class="report-drawer-scope"><span class="task-tag">${escapeHtml(REPORT_SOURCE_LABELS[activeSection?.sourceScope] || "待核对")}</span><p>${activeSection?.evidenceText ? escapeHtml(activeSection.evidenceText) : "当前章节没有可直接定位的题名或摘要原文。请结合全文继续核对。"}</p></section><section class="section-block"><h3>当前可用摘要</h3><p class="section-content report-abstract-text">${escapeHtml(report.paper.abstract)}</p></section><section class="report-boundary-card"><strong>证据边界</strong><p>${escapeHtml(report.result?.boundary || "")}</p></section><a class="btn btn-secondary btn-small report-drawer-link" href="${escapeHtml(report.paper.sourceUrl)}" target="_blank" rel="noopener">查看文献原文 ↗</a></aside>` : "";
  const primaryFooter = confirmed ? button("导出文件 →", "open-report-export", "primary") : button("确认当前正文 →", "open-report-confirm", "primary");
  app.innerHTML = `<div class="app-shell report-shell">
    ${reportTopbar({ title: report.title, status: `${statusLabel}${report.mode === "demo" ? " · 演示回退" : ""}`, editable: true, paperUrl: report.paper.sourceUrl })}
    <div class="workspace">${reportStepsSidebar(currentStep, `${sections.length} 个章节 · ${backedCount} 个有原文依据 · ${reviewCount} 个待核对`)}
      <section class="workarea">
        <div class="page-head"><div class="page-head-inner"><p class="eyebrow">步骤 ${currentStep + 1} / 3</p><h2>${confirmed ? "确认与导出" : "编辑并核对正文"}</h2></div></div>
        <main class="content report-content"><div class="content-inner report-content-stack">
          <section class="report-source-card report-result-source"><div class="report-card-heading"><span class="report-section-icon">文</span><div><span>解读文献</span><strong>${escapeHtml(report.paper.titleZh || report.paper.title)}</strong></div><span class="task-tag">摘要级</span></div><p class="report-source-meta">${escapeHtml(reportPaperMeta(report.paper))}</p>${report.result?.summary ? `<div class="report-result-summary"><span>解读摘要</span><p>${escapeHtml(report.result.summary)}</p></div>` : ""}</section>
          <section class="report-overview-grid"><div><strong>${sections.length}</strong><span>报告章节</span></div><div><strong>${backedCount}</strong><span>有原文依据</span></div><div><strong>${reviewCount}</strong><span>待继续核对</span></div><div><strong>${report.result?.missing?.length || 0}</strong><span>缺失项</span></div></section>
          ${report.result?.missing?.length ? `<section class="notice suggested report-missing-notice"><div class="notice-row"><span class="notice-label">全文待核对项</span><span>${escapeHtml(report.result.missing.join("；"))}</span></div></section>` : ""}
          <div class="report-section-list">${sections.map((section, index) => {
            const evidenceLabel = REPORT_SOURCE_LABELS[section.sourceScope] || "待核对";
            const excerpt = section.evidenceText ? String(section.evidenceText).replace(/\s+/g, " ").slice(0, 180) : "未获得可直接定位的题名或摘要原文。";
            return `<section class="report-edit-card" id="report-section-${escapeHtml(section.id)}"><div class="report-edit-card-head"><div><span class="report-section-number">${String(index + 1).padStart(2, "0")}</span><h3>${escapeHtml(section.title)}</h3></div><div><span class="report-source-badge ${section.sourceScope === "not_available" ? "muted" : ""}">${escapeHtml(evidenceLabel)}</span><button class="text-action" data-action="select-report-section" data-section-id="${escapeHtml(section.id)}">查看依据 ›</button></div></div><textarea class="edit-textarea report-body-input" data-report-section-index="${index}" rows="${Math.max(4, Math.min(10, String(section.content || "").split("\n").length + Math.ceil(String(section.content || "").length / 90)))}">${escapeHtml(section.content)}</textarea><div class="report-inline-evidence"><span>依据</span><p>${escapeHtml(excerpt)}${section.evidenceText && section.evidenceText.length > 180 ? "…" : ""}</p><small data-report-count="${index}">${String(section.content || "").length} 字</small></div></section>`;
          }).join("")}</div>
          <section class="report-boundary-card"><strong>本报告的证据边界</strong><p>${escapeHtml(report.result?.boundary || "")}</p></section>
        </div></main>
        ${footerButtons([button("查看当前章节依据", "toggle-report-evidence", "secondary"), primaryFooter])}
      </section>
    </div>${evidenceDrawer}${reportDialog(report)}
  </div>`;
}

function reportMarkdown(report) {
  const sections = (report.result?.sections || []).map((section) => `## ${section.title}\n\n${section.content}\n\n> 依据范围：${REPORT_SOURCE_LABELS[section.sourceScope] || "待核对"}${section.evidenceText ? `\n> ${section.evidenceText.replace(/\n/g, " ")}` : ""}`).join("\n\n");
  return `# ${report.title}\n\n**文献：** ${report.paper.titleZh || report.paper.title}\n\n**题录：** ${reportPaperMeta(report.paper)}\n\n**分析依据：** 题录和摘要，未核对全文。\n\n${sections}\n\n## 证据边界\n\n${report.result?.boundary || ""}\n\n## 参考文献\n\n1. ${reportPaperMeta(report.paper)} ${report.paper.title || ""}\n`;
}

function downloadBlob(content, mime, filename) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadLiteratureReport() {
  const report = activeLiteratureReport();
  if (!report || !["confirmed", "exported"].includes(report.status)) throw new Error("请先确认正文");
  const name = (document.getElementById("report-export-name")?.value || report.title).trim().replace(/[\\/:*?"<>|]/g, "-") || "单篇文献解读";
  const format = document.getElementById("report-export-format")?.value || "doc";
  const markdown = reportMarkdown(report);
  if (format === "md") downloadBlob(`\ufeff${markdown}`, "text/markdown;charset=utf-8", `${name}.md`);
  else {
    const body = (report.result?.sections || []).map((section) => `<h2>${escapeHtml(section.title)}</h2><p>${nl(section.content)}</p><p style="color:#777;font-size:12px">依据范围：${escapeHtml(REPORT_SOURCE_LABELS[section.sourceScope] || "待核对")}</p>`).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(report.title)}</title></head><body style="font-family:Arial,'Microsoft YaHei',sans-serif;line-height:1.7;max-width:760px;margin:40px auto"><h1>${escapeHtml(report.title)}</h1><p><strong>文献：</strong>${escapeHtml(report.paper.titleZh || report.paper.title)}</p><p><strong>题录：</strong>${escapeHtml(reportPaperMeta(report.paper))}</p><p><strong>分析依据：</strong>题录和摘要，未核对全文。</p>${body}<h2>证据边界</h2><p>${escapeHtml(report.result?.boundary || "")}</p><h2>参考文献</h2><p>1. ${escapeHtml(reportPaperMeta(report.paper))} ${escapeHtml(report.paper.title || "")}</p></body></html>`;
    downloadBlob(`\ufeff${html}`, "application/msword;charset=utf-8", `${name}.doc`);
  }
  const now = new Date().toISOString();
  report.status = "exported";
  report.updatedAt = now;
  report.exports.push({ format, exportedAt: now, title: name });
  state.exportReportOpen = false;
  notify("解读文件已开始下载");
  render();
}

function renderPptHome() {
  const enabled = state.sourceText.trim() || state.fileNames.length;
  app.innerHTML = `<div class="app-shell">
    ${topbar(true)}
    <main class="home-main">
      <section class="home-title">
        <img class="home-title-icon" src="/assets/ppt-icon.png" width="32" height="32" alt="">
        <div>
          <h1>PPT</h1>
          <p>智能总结病例，快速生成汇报 PPT</p>
        </div>
      </section>
      <section class="home-card">
        <div class="upload-zone">
          <input id="home-files" type="file" accept=".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx" multiple>
          <label for="home-files">
            <span class="upload-title"><img src="/assets/upload-icon.png" width="26" height="26" alt="">上传病例资料</span>
            <span class="upload-help">支持图片、PDF、Word，单个文件不超过 30M</span>
          </label>
        </div>
        ${state.fileNames.length ? `<div class="file-tags">${state.fileNames.map((name, index) => `<span class="file-tag">${escapeHtml(name)}<button data-action="remove-home-file" data-index="${index}" aria-label="移除 ${escapeHtml(name)}">×</button></span>`).join("")}</div>` : ""}
        <textarea class="home-textarea" id="source-text" maxlength="12000" placeholder="如有补充信息（如病史摘要、检查结果、诊疗经过），可在此输入">${escapeHtml(state.sourceText)}</textarea>
        <div class="home-actions">
          <div class="privacy-note"><span class="privacy-dot">✓</span>资料仅用于本次病例汇报，请先完成患者身份信息脱敏</div>
          <button class="btn btn-primary" data-action="start" ${enabled ? "" : "disabled"}>⌁ 开始生成</button>
        </div>
      </section>
    </main>
  </div>`;
}

function stepSidebar() {
  return `<aside class="steps-sidebar">
    <div class="steps-heading"><img src="/assets/ai-icon.png" width="20" height="20" alt="">智能任务规划</div>
    <ol class="step-list">${STEPS.map(([name], index) => {
      const cls = index === state.currentStep ? "current" : index < state.currentStep || index <= state.maxUnlocked ? "done" : "locked";
      return `<li class="step-item ${cls}"><span class="step-line"><span class="step-dot"></span></span><button class="step-label" data-action="jump-step" data-index="${index}" ${index <= state.maxUnlocked ? "" : "disabled"}>${escapeHtml(name)}</button></li>`;
    }).join("")}</ol>
  </aside>`;
}

function pageHeader() {
  const [eyebrow, title] = STEPS[state.currentStep];
  return `<div class="page-head"><div class="page-head-inner"><p class="eyebrow">${escapeHtml(eyebrow)}</p><h2>${escapeHtml(title)}</h2></div></div>`;
}

function footerButtons(buttons) {
  return `<footer class="page-footer"><div class="footer-inner">${buttons.join("")}</div></footer>`;
}

const button = (label, action, kind = "primary", attrs = "") => `<button class="btn btn-${kind}" data-action="${action}" ${attrs}>${label}</button>`;

function renderCaseStep() {
  const blocks = state.caseSections.map((section, index) => `<section class="section-block">
    <h3>${escapeHtml(section.title)}</h3>
    ${state.editCase ? `<textarea class="edit-textarea" data-field="case-content" data-index="${index}">${escapeHtml(section.content)}</textarea>` : `<p class="section-content">${escapeHtml(section.content)}</p>`}
    ${section.missing?.length ? `<div class="notice required"><div class="notice-row"><span class="notice-label">必须补充</span><span>${escapeHtml(section.missing.join("、"))}</span></div></div>` : ""}
    ${section.suggested?.length ? `<div class="notice suggested"><div class="notice-row"><span class="notice-label">建议补充</span><span>${escapeHtml(section.suggested.join("、"))}</span></div></div>` : ""}
  </section>`).join("");
  const buttons = [
    `<input class="sr-only" id="case-more-files" type="file" accept=".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx" multiple>`,
    button("⇧ 补充病例资料", "supplement", "secondary"),
    state.editCase ? button("保存修改", "save-case") : button("修改病例", "edit-case", "secondary"),
    button("重新解析", "reparse", "secondary", state.needsReparse ? "" : "disabled"),
    button("确认，梳理诊疗经过 →", "next", "primary", state.needsReparse ? "disabled" : ""),
  ];
  return `${pageHeader()}<main class="content"><div class="content-inner">
    ${state.fileNames.length ? `<section class="section-block"><h3>已上传资料</h3><div class="file-tags">${state.fileNames.map((name) => `<span class="file-tag">${escapeHtml(name)}</span>`).join("")}</div></section>` : ""}
    ${blocks || `<div class="empty">请返回首页提交病例资料。</div>`}
    ${state.needsReparse ? `<div class="notice required"><div class="notice-row"><span class="notice-label">需要重新解析</span><span>病例资料已修改或新增，请先点击“重新解析”，完成后再进入诊疗时间线。</span></div></div>` : ""}
  </div></main>${footerButtons(buttons)}`;
}

function renderTimelineStep() {
  let content;
  if (state.editTimeline) {
    content = `<div class="timeline">${state.timeline.map((event, index) => `<section class="timeline-item timeline-edit-card">
      <div class="timeline-meta"><strong>${escapeHtml(event.type)}</strong><span>${escapeHtml(event.date)}</span></div><div class="timeline-track"></div>
      <div class="field-grid">
        <label class="field-label" for="event-date-${index}">时间</label><input id="event-date-${index}" class="field-control" data-field="timeline-date" data-index="${index}" value="${escapeHtml(event.date)}"><button class="text-action" data-action="delete-event" data-index="${index}">删除</button>
        <label class="field-label" for="event-type-${index}">类型</label><select id="event-type-${index}" class="field-control" data-field="timeline-type" data-index="${index}">${TIMELINE_TYPES.map((type) => `<option ${type === event.type ? "selected" : ""}>${type}</option>`).join("")}</select><span></span>
        <label class="field-label" for="event-desc-${index}">事件描述</label><textarea id="event-desc-${index}" class="edit-textarea" data-field="timeline-description" data-index="${index}">${escapeHtml(event.description)}</textarea><span></span>
        <label class="field-label" for="event-source-${index}">病例原文</label><textarea id="event-source-${index}" class="edit-textarea" data-field="timeline-source" data-index="${index}">${escapeHtml(event.source)}</textarea><span></span>
        ${event.required ? `<span></span><div class="notice required"><div class="notice-row"><span class="notice-label">必须补充</span><span>${escapeHtml(event.required)}</span></div></div><span></span>` : ""}
      </div>
    </section>`).join("")}</div>`;
  } else {
    content = `<div class="timeline">${state.timeline.map((event) => `<section class="timeline-item">
      <div class="timeline-meta"><strong>${escapeHtml(event.type)}</strong><span>${escapeHtml(event.date)}</span></div><div class="timeline-track"></div>
      <div class="timeline-card"><h3>${escapeHtml(event.description)}</h3><p class="timeline-source">${escapeHtml(event.source)}</p>${event.required ? `<div class="notice required"><div class="notice-row"><span class="notice-label">必须补充</span><span>${escapeHtml(event.required)}</span></div></div>` : ""}</div>
    </section>`).join("")}</div>`;
  }
  return `${pageHeader()}<main class="content"><div class="content-inner">${content}</div></main>${footerButtons([
    state.editTimeline ? button("保存", "save-timeline") : button("修改诊疗经过", "edit-timeline", "secondary"),
    button("确认，补充汇报要求 →", "next", "primary", state.editTimeline ? "disabled" : ""),
  ])}`;
}

function selectField(label, field, values, current) {
  return `<label class="field-label" for="req-${field}">${label}</label><select id="req-${field}" class="field-control" data-field="requirement-${field}">${values.map((value) => `<option ${value === current ? "selected" : ""}>${value}</option>`).join("")}</select>`;
}

function renderRequirementsStep() {
  const r = state.requirements;
  return `${pageHeader()}<main class="content"><div class="content-inner"><div class="field-grid">
    ${selectField("汇报场景", "scene", ["科室病例汇报", "教学查房", "MDT 讨论", "学术会议分享", "疑难病例复盘", "不良事件复盘"], r.scene)}
    ${selectField("汇报对象", "audience", ["科室临床医生", "住院医师/研究生", "多学科团队", "学术会议参会者", "其他"], r.audience)}
    ${selectField("汇报时长", "duration", ["5–10 分钟", "10–15 分钟", "15–20 分钟", "20–30 分钟", "不限"], r.duration)}
    ${selectField("PPT 比例", "ratio", ["16:9 横向宽屏", "4:3 横向窄屏"], r.ratio)}
    <label class="field-label" for="req-notes">补充说明</label><input id="req-notes" class="field-control" data-field="requirement-notes" value="${escapeHtml(r.notes)}" placeholder="选填，可补充汇报重点和要求">
  </div></div></main>${footerButtons([button("确认，明确汇报主线 →", "next")])}`;
}

function renderStorylineStep() {
  const cards = state.storylines.map((item, index) => `<article class="storyline-card ${index === state.selectedStoryline ? "selected" : ""}">
    <div class="storyline-card-top"><input type="radio" name="storyline" data-field="storyline-select" data-index="${index}" ${index === state.selectedStoryline ? "checked" : ""}><span class="pill">${item.recommended ? "推荐" : "可选"}</span><h3>${escapeHtml(item.title)}</h3></div>
    <dl><dt>推荐理由</dt><dd>${escapeHtml(item.reason)}</dd><dt>核心讨论</dt><dd>${escapeHtml(item.core)}</dd><dt>汇报边界</dt><dd>${escapeHtml(item.boundary)}</dd></dl>
    <input class="field-control" data-field="storyline-note" value="${index === state.selectedStoryline ? escapeHtml(state.storylineNote) : ""}" ${index === state.selectedStoryline ? "" : "disabled"} placeholder="选填，如需要重点汇报和讨论的内容">
  </article>`).join("");
  return `${pageHeader()}<main class="content"><div class="content-inner"><div class="storyline-list">${cards}</div></div></main>${footerButtons([button("确认，生成大纲 →", "next")])}`;
}

function renderOutlineStep() {
  const title = state.editOutline ? `<input class="field-control" data-field="outline-title" value="${escapeHtml(state.outlineTitle)}">` : `<h3 class="outline-title">${escapeHtml(state.outlineTitle)}</h3>`;
  const items = state.outline.map((item, index) => `<section class="outline-item"><h3>${escapeHtml(item.title)}</h3>
    <span class="outline-label">汇报要点</span>${state.editOutline ? `<textarea class="edit-textarea" data-field="outline-points" data-index="${index}">${escapeHtml(item.keyPoints)}</textarea>` : `<p class="outline-text">${escapeHtml(item.keyPoints)}</p>`}
    <span class="outline-label">文献需求</span>${state.editOutline ? `<textarea class="edit-textarea" data-field="outline-evidence" data-index="${index}">${escapeHtml(item.evidenceNeed)}</textarea>` : `<p class="outline-text">${escapeHtml(item.evidenceNeed)}</p>`}
  </section>`).join("");
  return `${pageHeader()}<main class="content"><div class="content-inner">${title}${items}</div></main>${footerButtons([
    state.editOutline ? button("保存修改", "save-outline") : button("修改大纲", "edit-outline", "secondary"),
    button("确认，补充医学依据 →", "next", "primary", state.editOutline ? "disabled" : ""),
  ])}`;
}

function renderEvidenceStep() {
  const storyline = state.storylines[state.selectedStoryline];
  const topics = state.evidence.map((topic, index) => {
    const citations = topic.citations || [];
    const selectedCount = citations.filter((item) => item.selected !== false).length;
    return `<section class="evidence-topic"><div class="evidence-topic-head"><h3>${escapeHtml(topic.question)}</h3><button class="btn btn-weak btn-small" data-action="retry-literature" data-index="${index}">重新检索</button></div><p>${escapeHtml(topic.summary)}</p>
      <div class="query-list"><span>PubMed 检索式</span>${(topic.queries || []).map((query) => `<code>${escapeHtml(query)}</code>`).join("") || `<code>${escapeHtml(topic.question)}</code>`}</div>
      ${topic.searchError ? `<div class="literature-error">${escapeHtml(topic.searchError)}</div>` : ""}
      <button class="citation-link" data-action="open-literature" data-index="${index}">查看本主题文献 · ${citations.length}（已选 ${selectedCount}）</button></section>`;
  }).join("");
  const total = state.evidence.reduce((sum, topic) => sum + (topic.citations?.length || 0), 0);
  const selectedTotal = state.evidence.reduce((sum, topic) => sum + (topic.citations || []).filter((item) => item.selected !== false).length, 0);
  return `${pageHeader()}<main class="content"><div class="content-inner">
    <div class="summary-card"><span>汇报主线</span><strong>${escapeHtml(storyline?.title || state.outlineTitle)}</strong><span>汇报要求</span><strong>${escapeHtml(state.requirements.scene)} · ${escapeHtml(state.requirements.duration)}</strong></div>
    ${topics}<button class="evidence-entry" data-action="open-all-literature"><span>▣ 查看全部文献 · ${total}（已选 ${selectedTotal}）</span><span>›</span></button>
  </div></main>${footerButtons([button("确认，规划 PPT 页面 →", "next")])}`;
}

function renderPlannerStep() {
  normalizePlanningSlides();
  const slide = state.slides[state.selectedSlide] || { type: "内容页", title: "", content: "", speakerNotes: "", extra: "" };
  const visualSpec = slide.visual_spec || { type: "none", items: [], columns: [], rows: [] };
  const slideImages = Array.isArray(slide.images) ? slide.images : [];
  const imageItems = slideImages.map((image) => `<article class="slide-image-item">
    <div class="slide-image-preview"><img src="${escapeHtml(image.dataUrl)}" alt="${escapeHtml(image.name || "病例图片")}"></div>
    <div class="slide-image-meta"><strong>${escapeHtml(image.name || "病例图片")}</strong><small>${escapeHtml(formatFileSize(Number(image.size || 0)))}</small><label>图片说明<input class="field-control" data-field="slide-image-caption" data-image-id="${escapeHtml(image.id)}" value="${escapeHtml(image.caption || "")}" placeholder="选填，只填写当前病例资料可支持的说明"></label><span>请确认图片不含姓名、住院号、检查号等身份信息</span></div>
    <button class="slide-image-remove" data-action="remove-slide-image" data-image-id="${escapeHtml(image.id)}" aria-label="删除 ${escapeHtml(image.name || "图片")}" title="删除图片">×</button>
  </article>`).join("");
  const visualTypeOptions = Object.entries(VISUAL_TYPE_LABELS).map(([value, label]) => `<option value="${value}" ${visualSpec.type === value ? "selected" : ""}>${escapeHtml(label)}</option>`).join("");
  const visualItems = (visualSpec.items || []).map((item, itemIndex) => `<article class="visual-item tone-${escapeHtml(item.tone)}">
    <div class="visual-item-head"><input class="visual-label-input" data-field="slide-visual-label" data-visual-index="${itemIndex}" value="${escapeHtml(item.label)}" aria-label="视觉条目标签"><select class="visual-tone-select" data-field="slide-visual-tone" data-visual-index="${itemIndex}" aria-label="视觉语气">${Object.entries(VISUAL_TONE_LABELS).map(([value, label]) => `<option value="${value}" ${item.tone === value ? "selected" : ""}>${label}</option>`).join("")}</select></div>
    <p>${escapeHtml(item.value)}</p>${item.detail ? `<small>${nl(item.detail)}</small>` : ""}<code>${escapeHtml((item.source_refs || []).join(" "))}</code>
  </article>`).join("");
  const visualTable = visualSpec.columns?.length && visualSpec.rows?.length ? `<div class="visual-table-wrap"><table class="visual-table"><thead><tr><th></th>${visualSpec.columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr></thead><tbody>${visualSpec.rows.map((row) => `<tr><th>${escapeHtml(row.label)}</th>${visualSpec.columns.map((_, columnIndex) => `<td>${escapeHtml(row.values?.[columnIndex] || "")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>` : "";
  const list = state.slides.map((item, index) => `<div class="slide-nav-row ${index === state.selectedSlide ? "active" : ""}">
    <button class="slide-nav-item" data-action="select-slide" data-index="${index}"><span class="slide-nav-index">${escapeHtml(item.task_id || String(index + 1).padStart(2, "0"))}</span><span class="slide-nav-title">${escapeHtml(item.title || "新建页面")}</span><small>${escapeHtml(VISUAL_TYPE_LABELS[item.visual_spec?.type] || "待分析")}</small></button>
    <button class="slide-nav-delete" data-delete-slide="${index}" aria-label="删除第 ${index + 1} 页" title="删除页面">×</button>
  </div>`).join("");
  return `${pageHeader()}<main class="content wide"><div class="content-inner"><div class="planner">
    <aside class="slide-list"><div class="slide-list-header"><strong>页面规划</strong><span>共 ${state.slides.length} 页</span></div><div class="slide-nav">${list}</div><button class="btn btn-secondary btn-small" data-action="add-slide">＋ 新建页面</button></aside>
    <section class="slide-editor"><h3>页面内容</h3><div class="field-grid">
      ${selectField("类型", "slide-type", PAGE_TYPES, slide.type).replaceAll("data-field=\"requirement-slide-type\"", "data-field=\"slide-type\"")}
      <label class="field-label" for="slide-title">标题</label><input id="slide-title" class="field-control" data-field="slide-title" value="${escapeHtml(slide.title)}" placeholder="请输入标题">
      <label class="field-label" for="slide-content">内容</label><textarea id="slide-content" class="edit-textarea" data-field="slide-content" placeholder="请输入页面内容">${escapeHtml(slide.content)}</textarea>
      <label class="field-label" for="slide-visual-type">视觉表达</label><div><div class="visual-control-row"><select id="slide-visual-type" class="field-control" data-field="slide-visual-type">${visualTypeOptions}</select><button class="btn btn-weak btn-small" data-action="regenerate-slide-visual">重新分析本页</button></div><p class="field-help">视觉结构由模型生成；页面内容仍是唯一事实原文，每个条目通过 content:n 引用原文行。</p></div>
      <span class="field-label">内容结构</span><div class="visual-spec-panel"><div class="visual-spec-summary"><span>${escapeHtml(slide.task_id)} · 第 ${slide.page_no} 页</span><strong>${escapeHtml(VISUAL_TYPE_LABELS[visualSpec.type] || visualSpec.type)}</strong><small>${escapeHtml(VISUAL_HIERARCHY_LABELS[visualSpec.hierarchy] || visualSpec.hierarchy || "")}</small><small>${escapeHtml(VISUAL_DENSITY_LABELS[visualSpec.density] || visualSpec.density || "")}</small><small>${visualSpec.items?.length || 0} 个内容分组${visualSpec.columns?.length ? ` · ${visualSpec.columns.length} 列` : ""}</small></div>${visualTable}${visualItems || `<div class="visual-empty">当前页不使用结构化视觉组件。</div>`}</div>
      <span class="field-label">图片</span><div class="slide-images"><input class="sr-only" id="slide-image-input" type="file" accept=".jpg,.jpeg,.png,image/jpeg,image/png"><div class="upload-inline"><button class="btn btn-weak btn-small" data-action="slide-image">⇧ 上传图片</button><span>当前页支持 1 张 JPG、PNG，单张不超过 30MB；刷新后需重新上传</span></div>${imageItems ? `<div class="slide-image-grid">${imageItems}</div>` : `<div class="slide-image-empty">当前页尚未上传图片。</div>`}</div>
      <label class="field-label" for="slide-notes">讲者备注</label><input id="slide-notes" class="field-control" data-field="slide-notes" value="${escapeHtml(slide.speakerNotes)}" placeholder="选填，如需要强调什么、解释什么">
      <label class="field-label" for="slide-extra">其他要求</label><input id="slide-extra" class="field-control" data-field="slide-extra" value="${escapeHtml(slide.extra)}" placeholder="选填，如页面布局">
    </div></section>
  </div></div></main>${footerButtons([button("页面检查", "open-checks", "secondary"), button("确认，选择 PPT 模板 →", "next")])}`;
}

function renderTemplateStep() {
  const template = selectedTemplate();
  const slide = state.slides[state.selectedSlide] || state.slides[0];
  const cards = state.pptTemplates.map((item) => `<button class="template-card ${item.id === state.selectedTemplateId ? "selected" : ""}" data-action="select-template" data-template-id="${escapeHtml(item.id)}" style="${templateStyle(item)}">
    <div class="template-image"><img src="${escapeHtml(item.previewUrl)}" alt="${escapeHtml(item.name)} 模板封面预览"></div>
    <div class="template-card-body"><span class="template-kind">${escapeHtml(item.label)}${item.recommended ? " · 推荐" : ""}</span><strong>${escapeHtml(item.name)}</strong><small>${item.pageCount} 种页面布局 · ${item.kind === "deck" ? "完整 Deck" : "Layout 系统"}</small></div>
    <span class="template-check">✓</span>
  </button>`).join("");
  return `${pageHeader()}<main class="content wide"><div class="content-inner">
    <div class="template-intro"><div><h3>选择本次汇报的模板</h3><p>已按 ${escapeHtml(state.requirements.ratio)} 筛选，模板名称、布局和封面预览来自 ppt-master Skill。</p></div><button class="btn btn-weak btn-small" data-action="reload-templates">刷新模板</button></div>
    ${state.pptTemplates.length ? `<div class="template-grid">${cards}</div>` : `<div class="empty">未读取到当前比例的模板。<button class="btn btn-secondary btn-small" data-action="reload-templates">重新读取</button></div>`}
    ${template && slide ? `<section class="template-live" style="${templateStyle(template)}"><div class="template-live-meta"><span>当前选择</span><strong>${escapeHtml(template.name)}</strong><p>${escapeHtml(template.description)}</p><small>来源：ppt-master / ${escapeHtml(template.kind)} / ${escapeHtml(template.sourceId)}</small></div><div class="preview-main"><article class="slide-canvas theme-${escapeHtml(template.theme?.mode || "report")} ${state.requirements.ratio.startsWith("4:3") ? "ratio-4-3" : ""}"><h2>${escapeHtml(slide.title)}</h2><p>${nl(slide.content)}</p><footer>01 · ${escapeHtml(template.name)}</footer></article></div></section>` : ""}
    <div class="template-boundary">品牌 Deck 保留原模板的品牌特征，仅建议在获得相应品牌使用授权时选择。</div>
  </div></main>${footerButtons([button("确认，生成并导出 PPT →", "next", "primary", state.selectedTemplateId ? "" : "disabled")])}`;
}

function renderExportStep() {
  const template = selectedTemplate();
  const builtPages = state.pptBuild?.pages || [];
  const activeBuiltPage = builtPages[state.selectedSlide];
  const slide = state.slides[activeBuiltPage?.sourceSlideIndex ?? state.selectedSlide] || state.slides[0];
  const previewItems = builtPages.length ? builtPages : state.slides.map((item, index) => ({ index, title: item.title, sourceSlideIndex: index }));
  const thumbs = previewItems.map((item, index) => {
    const built = builtPages[index];
    return `<button class="preview-thumb ${index === state.selectedSlide ? "active" : ""}" data-action="select-slide" data-index="${index}"><span>${String(index + 1).padStart(2, "0")}</span>${built ? `<img class="thumb-canvas master-thumb" src="${escapeHtml(built.previewUrl)}" alt="第 ${index + 1} 页预览">` : `<div class="thumb-canvas theme-${escapeHtml(template?.theme?.mode || "report")}">${escapeHtml(item.title)}</div>`}</button>`;
  }).join("");
  const builtSlide = activeBuiltPage;
  const qualityLabel = state.pptBuild ? `${state.pptBuild.structure === "structured" ? "结构化 Master / Layout" : "扁平 SVG"} · ${state.pptBuild.quality?.status || "passed"}` : "尚未生成";
  const packageInfo = state.pptBuild?.package || {};
  const packageLabel = state.pptBuild
    ? `${packageInfo.slides || builtPages.length} Slides · ${packageInfo.masters || 0} Masters · ${packageInfo.layouts || 0} Layouts · ${packageInfo.notes || 0} Notes`
    : "等待生成";
  const coverage = state.pptBuild?.coverage;
  const diversity = coverage?.layoutDiversity;
  const carrierDiversity = coverage?.carrierDiversity;
  const coverageLabel = coverage
    ? `规划内容 ${coverage.coveredBlocks}/${coverage.sourceBlocks} · 事实锁 ${coverage.matchedFactLocks}/${coverage.factLocks} · 视觉结构 ${coverage.visualReferencedBlocks || 0} 块/${coverage.visualSpecs || 0} 页 · 载体 ${carrierDiversity?.uniqueCarriers || 0} 种 · 卡片占比 ${Math.round((carrierDiversity?.cardRatio || 0) * 100)}% · Layout ${diversity?.uniqueLayouts || 1} 种 · 主导占比 ${Math.round((diversity?.dominantRatio || 0) * 100)}% · 自动重规划 ${coverage.layoutReplans || 0} · 自动换版 ${coverage.layoutSwitches} · 自动续页 ${coverage.continuationSlides}`
    : "等待内容覆盖检查";
  return `${pageHeader()}<main class="content"><div class="content-inner" style="${templateStyle(template)}">
    <div class="export-card"><div class="file-icon">▧</div><div class="export-card-text"><strong>病例汇报 PPT</strong><span>${escapeHtml(template?.name || "Report Core")} · ppt-master SVG → DrawingML · ${escapeHtml(qualityLabel)}</span></div><div class="export-actions">${button("重新生成", "rebuild-ppt", "secondary")}${button("下载", "download-ppt", "primary", state.pptBuild ? "" : "disabled")}</div></div>
    <section class="engine-receipt"><span>ppt-master 生成回执</span><strong>${escapeHtml(state.pptBuild?.engine || "等待生成")}</strong><span>${escapeHtml(qualityLabel)}</span><span>${escapeHtml(packageLabel)}</span><span>${escapeHtml(coverageLabel)}</span></section>
    <section class="preview-shell"><h3>最终 SVG 预览（与 PPTX 同源）</h3><div class="preview-grid"><div class="preview-thumbs">${thumbs}</div><div class="preview-main">${builtSlide ? `<img class="ppt-master-preview ${state.requirements.ratio.startsWith("4:3") ? "ratio-4-3" : ""}" src="${escapeHtml(builtSlide.previewUrl)}" alt="${escapeHtml(builtSlide.title || slide?.title || "PPT 页面预览")}">` : slide ? `<article class="slide-canvas theme-${escapeHtml(template?.theme?.mode || "report")} ${state.requirements.ratio.startsWith("4:3") ? "ratio-4-3" : ""}"><h2>${escapeHtml(slide.title)}</h2><p>${nl(slide.content)}</p></article>` : ""}</div></div></section>
    <div class="ai-disclaimer">内容由 AI 辅助生成，请结合客观事实及相关依据综合判断</div>
  </div></main>`;
}

function renderDrawer() {
  if (!state.drawer) return "";
  if (state.drawer.type === "checks") {
    const active = state.checks.filter((item) => !item.ignored);
    const required = active.filter((item) => item.level === "required").length;
    return `<div class="drawer-overlay" data-action="close-drawer"></div><aside class="drawer" aria-label="页面检查"><div class="drawer-head"><h3>页面检查</h3><button class="icon-btn" data-action="close-drawer">×</button></div>
      <div class="check-summary"><strong>还需处理 ${active.length} 个问题</strong><span>必须处理 ${required} · 建议优化 ${active.length - required}</span></div>
      ${state.checks.map((item, index) => item.ignored ? "" : `<section class="check-item"><span class="check-type ${item.level === "suggested" ? "suggested" : ""}">${item.level === "required" ? "必须处理" : "建议优化"}</span><h4>${escapeHtml(item.type)}</h4><p>${escapeHtml(item.text)}</p><div class="notice"><div class="notice-row"><span class="notice-label">问题描述</span><span>${escapeHtml(item.detail)}</span></div></div><div class="check-actions"><button class="btn btn-weak btn-small" data-action="ignore-check" data-index="${index}">忽略问题</button></div></section>`).join("")}
      <button class="btn btn-primary" data-action="recheck" style="width:100%">重新检查</button>
    </aside>`;
  }
  const topic = state.evidence[state.drawer.topicIndex] || state.evidence[0];
  const citations = topic?.citations || [];
  if (state.drawer.type === "literature" || state.drawer.type === "all-literature") {
    const entries = state.drawer.type === "all-literature"
      ? state.evidence.flatMap((evidenceTopic, topicIndex) => (evidenceTopic.citations || []).map((item, citationIndex) => ({ item, topicIndex, citationIndex, topicName: evidenceTopic.question })))
      : citations.map((item, citationIndex) => ({ item, topicIndex: state.drawer.topicIndex, citationIndex, topicName: topic?.question || "" }));
    return `<div class="drawer-overlay" data-action="close-drawer"></div><aside class="drawer"><div class="drawer-head"><h3>${state.drawer.type === "all-literature" ? "全部文献" : "相关文献"}</h3><button class="icon-btn" data-action="close-drawer">×</button></div><div class="drawer-list">${entries.map(({ item, topicIndex, citationIndex, topicName }) => `<section class="literature-item"><label class="literature-select"><input type="checkbox" data-action="toggle-citation" data-topic-index="${topicIndex}" data-index="${citationIndex}" ${item.selected !== false ? "checked" : ""}><span>用于 PPT</span></label>${state.drawer.type === "all-literature" ? `<span class="literature-topic">${escapeHtml(topicName)}</span>` : ""}<button class="literature-open" data-action="open-citation" data-topic-index="${topicIndex}" data-index="${citationIndex}"><h4>${escapeHtml(item.title)}</h4><p>${escapeHtml(item.journal)} · ${escapeHtml(item.year)} · PMID: ${escapeHtml(item.pmid)}</p></button><a class="source-link" href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noopener">查看 PubMed 来源 ↗</a></section>`).join("") || `<div class="empty">当前主题暂无文献。</div>`}</div></aside>`;
  }
  const citation = citations[state.drawer.citationIndex] || citations[0];
  return `<div class="drawer-overlay" data-action="close-drawer"></div><aside class="drawer"><div class="drawer-head"><h3>文献详情</h3><button class="icon-btn" data-action="close-drawer">×</button></div>${citation ? `<section class="literature-item"><label class="literature-select"><input type="checkbox" data-action="toggle-citation" data-topic-index="${state.drawer.topicIndex}" data-index="${state.drawer.citationIndex}" ${citation.selected !== false ? "checked" : ""}><span>用于 PPT</span></label><h4>${escapeHtml(citation.title)}</h4><p>${escapeHtml(citation.journal)} · ${escapeHtml(citation.year)} · PMID: ${escapeHtml(citation.pmid)}</p><p>${escapeHtml((citation.authors || []).join("、"))}</p><a class="source-link" href="${escapeHtml(citation.sourceUrl)}" target="_blank" rel="noopener">查看 PubMed 来源 ↗</a></section><section class="section-block"><h3>摘要</h3><p class="section-content">${escapeHtml(citation.abstract || "PubMed 当前未提供摘要。")}</p></section>${citation.applicability ? `<section class="section-block"><h3>适用性分析</h3><p class="section-content">${escapeHtml(citation.applicability)}</p></section>` : ""}<section class="section-block"><h3>证据边界</h3><p class="section-content">该文献仅用于说明一般医学依据。进入病例汇报前需核对研究对象、临床场景、结局和原文内容，不得替代病例事实。</p></section>` : `<div class="empty">暂无文献详情。</div>`}</aside>`;
}

function renderWorkspace() {
  const renderers = [renderCaseStep, renderTimelineStep, renderRequirementsStep, renderStorylineStep, renderOutlineStep, renderEvidenceStep, renderPlannerStep, renderTemplateStep, renderExportStep];
  app.innerHTML = `<div class="app-shell">${topbar(false)}<div class="workspace">${stepSidebar()}<section class="workarea">${renderers[state.currentStep]()}</section></div>${renderDrawer()}${state.loading ? `<div class="loading-overlay"><div class="loading-card"><div class="spinner"></div><p>${escapeHtml(state.loading)}</p><span>AI 仅根据当前病例资料整理，不补写病例事实</span></div></div>` : ""}</div>`;
}

function render() {
  syncLocationFromState();
  if (state.screen === "portal") renderPortalHome();
  else if (state.screen === "review-workspace") renderReviewWorkspace();
  else if (state.screen === "case-report-evidence") renderCaseReportEvidenceWorkspace();
  else if (state.screen === "literature-home") renderLiteratureHome();
  else if (state.screen === "literature-results") renderLiteratureResults();
  else if (state.screen === "literature-interpretation-setup") renderInterpretationSetup();
  else if (state.screen === "literature-report") renderLiteratureReport();
  else if (state.screen === "ppt-home") renderPptHome();
  else renderWorkspace();
  document.querySelectorAll("[data-delete-slide]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const index = Number(button.dataset.deleteSlide);
      if (state.slides.length <= 1) return notify("至少保留一页");
      state.slides.splice(index, 1);
      normalizePlanningSlides();
      state.selectedSlide = Math.min(state.selectedSlide, state.slides.length - 1);
      invalidatePptBuild();
      render();
    });
  });
  saveState();
}

async function openGeneratedPptTask() {
  state.screen = "workspace";
  state.drawer = null;

  const previewUrl = state.pptBuild?.pages?.[0]?.previewUrl;
  if (previewUrl) {
    const valid = await fetch(previewUrl, { cache: "no-store" })
      .then((response) => response.ok)
      .catch(() => false);
    if (valid) {
      state.currentStep = 8;
      state.maxUnlocked = Math.max(state.maxUnlocked, 8);
      state.selectedSlide = Math.min(
        state.selectedSlide,
        Math.max(0, state.pptBuild.pages.length - 1),
      );
      render();
      return;
    }
  }

  invalidatePptBuild();
  state.currentStep = 7;
  state.maxUnlocked = Math.max(state.maxUnlocked, 7);
  await loadPptTemplates();
  render();
  notify("PPT 生成文件已失效，请重新生成");
}

async function startWorkflow() {
  if (!state.sourceText.trim() && !state.fileNames.length) return;
  const result = await parseCurrentCase(state.sourceText);
  resetCaseDownstream();
  state.projectTitle = result.projectTitle || "病例汇报 PPT";
  state.caseSections = result.sections || [];
  state.screen = "workspace";
  state.currentStep = 0;
  state.maxUnlocked = 0;
  render();
}

async function goNext() {
  const step = state.currentStep;
  if (step === 0 && !state.timeline.length) {
    const previousMaxUnlocked = state.maxUnlocked;
    state.maxUnlocked = Math.max(state.maxUnlocked, 1);
    state.currentStep = 1;
    render();
    try {
      const result = await runAI("timeline", { caseText: state.caseSections.map((s) => `${s.title}: ${s.content}`).join("\n") }, "正在生成诊疗时间线，通常需要 30–60 秒");
      state.timeline = result.events || [];
      render();
      return;
    } catch (error) {
      state.currentStep = 0;
      state.maxUnlocked = previousMaxUnlocked;
      throw error;
    }
  } else if (step === 2 && !state.storylines.length) {
    const result = await runAI("storylines", { caseSections: state.caseSections, timeline: state.timeline, requirements: state.requirements }, "正在生成汇报主线");
    state.storylines = result.storylines || [];
    state.selectedStoryline = Math.max(0, state.storylines.findIndex((item) => item.recommended));
  } else if (step === 3 && !state.outline.length) {
    const selected = state.storylines[state.selectedStoryline];
    const result = await runAI("outline", { storylineTitle: selected?.title, storyline: selected, requirements: state.requirements, caseSections: state.caseSections, timeline: state.timeline }, "正在生成病例汇报大纲");
    state.outlineTitle = result.title || selected?.title || "病例汇报";
    state.outline = result.sections || [];
  } else if (step === 4 && !state.evidence.length) {
    const result = await runAI("evidence", { outline: state.outline, caseSections: state.caseSections, timeline: state.timeline, requirements: state.requirements, caseBoundary: "病例事实只来自当前输入，文献不得替代病例事实" }, "正在整理医学依据需求");
    state.evidence = result.topics || [];
    await searchAllEvidenceTopics();
  } else if (step === 5 && !state.slides.length) {
    const selectedEvidence = state.evidence.map((topic) => ({
      question: topic.question,
      summary: topic.summary,
      citations: (topic.citations || []).filter((item) => item.selected !== false).map(({ pmid, doi, title, journal, year, abstract, publicationTypes, sourceUrl, applicability }) => ({ pmid, doi, title, journal, year, abstract: String(abstract || "").slice(0, 2400), publicationTypes, sourceUrl, applicability, selected: true })),
    }));
    const result = await runAI("slides", { title: state.outlineTitle, outline: state.outline, evidence: selectedEvidence, requirements: state.requirements, storyline: state.storylines[state.selectedStoryline], caseSections: state.caseSections, timeline: state.timeline }, "正在规划 PPT 页面");
    state.slides = result.slides || [];
    normalizePlanningSlides();
    state.selectedSlide = 0;
  }
  if (step === 6) await loadPptTemplates();
  if (step === 7) await buildFullPpt();
  state.maxUnlocked = Math.max(state.maxUnlocked, Math.min(8, step + 1));
  state.currentStep = Math.min(8, step + 1);
  render();
}

function updateField(target) {
  const field = target.dataset.field;
  const index = Number(target.dataset.index);
  const value = target.value;
  if (field === "case-content") { state.caseSections[index].content = value; return; }
  if (field?.startsWith("timeline-")) { state.timeline[index][field.replace("timeline-", "")] = value; return; }
  if (field?.startsWith("requirement-")) {
    const requirement = field.replace("requirement-", "");
    state.requirements[requirement] = value;
    if (requirement === "ratio") {
      state.pptTemplates = [];
      state.templateRatio = "";
      state.selectedTemplateId = "";
      invalidatePptBuild();
    }
    return;
  }
  if (field === "storyline-select") { state.selectedStoryline = index; state.storylineNote = ""; render(); return; }
  if (field === "storyline-note") { state.storylineNote = value; return; }
  if (field === "outline-title") { state.outlineTitle = value; return; }
  if (field === "outline-points") { state.outline[index].keyPoints = value; return; }
  if (field === "outline-evidence") { state.outline[index].evidenceNeed = value; return; }
  const slide = state.slides[state.selectedSlide];
  if (!slide) return;
  if (field === "slide-visual-label") {
    const visualIndex = Number(target.dataset.visualIndex);
    if (slide.visual_spec?.items?.[visualIndex]) slide.visual_spec.items[visualIndex].label = value.slice(0, 32);
    invalidatePptBuild();
    return;
  }
  if (field === "slide-visual-tone") {
    const visualIndex = Number(target.dataset.visualIndex);
    if (slide.visual_spec?.items?.[visualIndex]) slide.visual_spec.items[visualIndex].tone = value;
    invalidatePptBuild();
    return;
  }
  if (field === "slide-image-caption") {
    const image = (slide.images || []).find((item) => item.id === target.dataset.imageId);
    if (image) image.caption = value.slice(0, 160);
    invalidatePptBuild();
    return;
  }
  if (field === "slide-type") slide.type = value;
  if (field === "slide-title") slide.title = value;
  if (field === "slide-content") {
    slide.content = value;
    state.slides[state.selectedSlide] = normalizePlanningSlide(slide, state.selectedSlide, state.slides.length);
  }
  if (field === "slide-visual-type") {
    const lineCount = slideContentLines(slide).length;
    slide.visual_spec = {
      ...(slide.visual_spec || {}),
      type: value,
      hierarchy: value === "comparison" ? "left-right" : ["timeline", "algorithm"].includes(value) ? "sequence" : ["data", "kpi", "chart", "table"].includes(value) ? "metric-insight" : value === "statement" ? "title-lead-detail" : value === "image" ? "left-right" : "title-body",
      density: lineCount >= 5 ? "dense" : lineCount <= 2 ? "breathing" : "balanced",
    };
    state.slides[state.selectedSlide] = normalizePlanningSlide(slide, state.selectedSlide, state.slides.length);
  }
  if (field === "slide-notes") slide.speakerNotes = value;
  if (field === "slide-extra") slide.extra = value;
  if (field?.startsWith("slide-")) invalidatePptBuild();
}

document.addEventListener("input", (event) => {
  if (event.target.dataset.reviewTaskInput) {
    state.review.taskInputDraft[event.target.dataset.reviewTaskInput] = event.target.value;
    state.review.taskInputErrors = reviewTaskInputValidation(state.review.taskInputChapterId, state.review.taskInputDraft).errors;
    saveState();
    return;
  }
  if (event.target.dataset.reviewPromptEditor !== undefined) {
    reviewPromptEditorDraft = event.target.value;
    reviewPromptEditorErrors = [];
    return;
  }
  if (event.target.dataset.reviewSectionEditor !== undefined) {
    state.review.sectionEditorDraft = event.target.value;
    return;
  }
  if (event.target.dataset.action === "review-evidence-assignment-use") {
    const usage = state.review.evidenceAssignmentDraft?.chapterUsages?.find((item) => item.chapterId === event.target.dataset.chapterId);
    if (usage) usage.use = event.target.value;
    return;
  }
  if (event.target.dataset.reviewSectionDraft !== undefined) { const chapter = state.review.outlineChapters.find((c) => c.id === state.review.activeChapterId); if (chapter) { const existing = state.review.sectionDrafts.find((s) => s.chapter_id === chapter.id) || { chapter_id: chapter.id, title: chapter.title }; state.review.sectionDrafts = [...state.review.sectionDrafts.filter((s) => s.chapter_id !== chapter.id), { ...existing, markdown: event.target.value }]; saveState(); } return; }
  if (event.target.dataset.reviewEvidenceDraft !== undefined) {
    state.review.evidenceDraft = event.target.value;
    const addButton = event.target.closest(".review-outline-evidence-form")?.querySelector('[data-action="review-save-outline-evidence"]');
    if (addButton) addButton.disabled = !event.target.value.trim();
    saveState();
    return;
  }
  if (event.target.dataset.reviewOutlinePoint !== undefined) {
    const chapter = state.review.outlineChapters.find((item) => item.id === event.target.dataset.chapterId);
    const point = chapter && reviewOutlinePoints(chapter).find((item) => item.id === event.target.dataset.reviewOutlinePoint);
    if (!chapter || !point) return;
    point.text = event.target.value;
    event.target.closest(".review-outline-point")?.classList.toggle("empty", !event.target.value.trim());
    markReviewOutlineEvidenceStale(chapter, event.target);
    const hasEmptyPoint = state.review.outlineChapters.some((item) => !reviewOutlinePoints(item).length || reviewOutlinePoints(item).some((entry) => !entry.text.trim()));
    const footerLabel = document.querySelector(".review-outline-footer > div > span");
    const confirmButton = document.querySelector('[data-action="review-confirm-outline"]');
    if (footerLabel) footerLabel.textContent = hasEmptyPoint ? "请完善空白内容要点" : "当前大纲";
    if (confirmButton) confirmButton.disabled = hasEmptyPoint;
    saveState();
    return;
  }
  if (event.target.dataset.reviewOutlineField) {
    const chapter = state.review.outlineChapters.find((item) => item.id === event.target.dataset.chapterId);
    if (!chapter) return;
    const field = event.target.dataset.reviewOutlineField;
    chapter[field] = field === "wordCount" ? Number(event.target.value) : event.target.value;
    if (field === "title") {
      const summary = document.querySelector(`[data-outline-summary-id="${chapter.id}"]`);
      if (summary) summary.textContent = event.target.value.trim() || "未命名章节";
    }
    if (["purpose", "keyPoints"].includes(field)) {
      markReviewOutlineEvidenceStale(chapter, event.target);
    }
    if (field === "wordCount") {
      const total = state.review.outlineChapters.reduce((sum, item) => sum + (Number(item.wordCount) || 0), 0).toLocaleString("zh-CN");
      const short = document.querySelector("[data-outline-total-short]");
      const long = document.querySelector("[data-outline-total-long]");
      if (short) short.textContent = `${state.review.outlineChapters.length} 章 · 约 ${total} 字`;
      if (long) long.textContent = `${state.review.outlineChapters.length} 个章节 · 约 ${total} 字`;
    }
    saveState();
    return;
  }
  if (event.target.dataset.reviewCustomField) {
    const field = event.target.dataset.reviewCustomField;
    state.review.customDirectionDraft[field] = event.target.value;
    delete state.review.customDirectionErrors[field];
    const counter = event.target.closest("label")?.querySelector("small");
    if (counter) counter.textContent = `${event.target.value.length}/${event.target.maxLength}`;
    event.target.closest("label")?.classList.remove("error");
    event.target.closest("label")?.querySelector("em")?.remove();
    saveState();
    return;
  }
  if (event.target.dataset.reviewField) {
    state.review.requirements[event.target.dataset.reviewField] = event.target.value;
    saveState();
    return;
  }
  if (event.target.dataset.interpretationField) {
    const field = event.target.dataset.interpretationField;
    if (state.interpretationDraft && ["title", "purpose", "focus", "detail", "language"].includes(field)) {
      state.interpretationDraft[field] = event.target.value;
      const start = document.querySelector('[data-action="create-literature-interpretation"]');
      if (start) start.disabled = !String(state.interpretationDraft.title || "").trim();
      saveState();
    }
    return;
  }
  if (event.target.dataset.reportTitle !== undefined) {
    const report = activeLiteratureReport();
    if (report) {
      report.title = event.target.value.slice(0, 180);
      report.updatedAt = new Date().toISOString();
      saveState();
    }
    return;
  }
  if (event.target.dataset.reportSectionIndex !== undefined) {
    const report = activeLiteratureReport();
    const sectionIndex = Number(event.target.dataset.reportSectionIndex);
    const section = report?.result?.sections?.[sectionIndex];
    if (report && section) {
      section.content = event.target.value;
      const count = document.querySelector(`[data-report-count="${sectionIndex}"]`);
      if (count) count.textContent = `${event.target.value.length} 字`;
      if (["confirmed", "exported"].includes(report.status)) {
        report.status = "pending";
        report.confirmedAt = "";
        state.exportReportOpen = false;
        const modeTag = document.querySelector(".report-shared-topbar .mode-tag");
        if (modeTag) modeTag.textContent = `${REPORT_STATUS_LABELS.pending}${report.mode === "demo" ? " · 演示回退" : ""}`;
        const stepItems = document.querySelectorAll(".report-steps-sidebar .step-item");
        stepItems.forEach((item, index) => { item.className = `step-item ${index === 1 ? "current" : index < 1 ? "done" : "locked"}`; });
        const eyebrow = document.querySelector(".page-head .eyebrow");
        const pageTitle = document.querySelector(".page-head h2");
        if (eyebrow) eyebrow.textContent = "步骤 2 / 3";
        if (pageTitle) pageTitle.textContent = "编辑并核对正文";
        const primaryButton = document.querySelector('[data-action="open-report-export"]');
        if (primaryButton) {
          primaryButton.dataset.action = "open-report-confirm";
          primaryButton.textContent = "确认当前正文 →";
          primaryButton.disabled = false;
        }
      }
      report.updatedAt = new Date().toISOString();
      saveState();
    }
    return;
  }
  if (["literature-query", "literature-result-query"].includes(event.target.id)) {
    if (event.target.id === "literature-query") state.literatureDrafts[state.literatureTab] = event.target.value;
    else state.literature.queryDraft = event.target.value;
    const submit = document.querySelector('[data-action="submit-literature"]');
    if (submit) submit.disabled = !state.literature.queryDraft.trim();
    return;
  }
  if (event.target.dataset.literatureCustom) {
    state.literature.filters[event.target.dataset.literatureCustom] = event.target.value.replace(/\D/g, "").slice(0, 4);
    return;
  }
  if (event.target.id === "portal-source") {
    state.portalText = event.target.value;
    const start = document.querySelector('[data-action="portal-start"]');
    if (start) start.disabled = !state.portalText.trim();
    return;
  }
  if (event.target.id === "source-text") {
    state.sourceText = event.target.value;
    const start = document.querySelector('[data-action="start"]');
    if (start) start.disabled = !state.sourceText.trim() && !state.fileNames.length;
    return;
  }
  if (event.target.dataset.field) {
    updateField(event.target);
    if (event.target.dataset.field === "slide-title") {
      const currentTitle = document.querySelector(`.slide-nav-row:nth-child(${state.selectedSlide + 1}) .slide-nav-title`);
      if (currentTitle) currentTitle.textContent = event.target.value || "新建页面";
    }
  }
});

document.addEventListener("change", async (event) => {
  if (event.target.dataset.action === "review-task-input-chapter") {
    openReviewTaskInputDrawer(event.target.value);
    render();
    return;
  }
  if (event.target.dataset.reviewTaskInput || event.target.dataset.reviewPromptEditor !== undefined) {
    render();
    return;
  }
  if (event.target.dataset.action === "case-report-evidence-chapter") {
    state.caseReportEvidence.activeChapterId = event.target.value || "intro";
    state.caseReportEvidence.statusFilter = "all";
    state.caseReportEvidence.detailId = "";
    render();
    return;
  }
  if (event.target.dataset.action === "review-evidence-assignment-toggle") {
    const draft = state.review.evidenceAssignmentDraft;
    const chapterId = event.target.dataset.chapterId;
    if (!draft || !chapterId) return;
    if (event.target.checked) {
      const chapter = state.review.outlineChapters.find((item) => item.id === chapterId);
      draft.chapterUsages = [...draft.chapterUsages, { chapterId, status: "keep", use: `用于支持“${chapter?.title || "本章"}”的相关论述。` }];
      draft.includedInWriting = true;
    } else draft.chapterUsages = draft.chapterUsages.filter((item) => item.chapterId !== chapterId);
    render();
    return;
  }
  if (event.target.dataset.action === "review-evidence-assignment-status") {
    const usage = state.review.evidenceAssignmentDraft?.chapterUsages?.find((item) => item.chapterId === event.target.dataset.chapterId);
    if (usage && ["priority", "keep", "pending"].includes(event.target.value)) usage.status = event.target.value;
    return;
  }
  if (event.target.dataset.action === "review-evidence-row-status") {
    const item = normalizeReviewEvidenceRecords().find((entry) => entry.id === event.target.dataset.evidenceId);
    const chapterId = state.review.evidenceChapterFilter;
    const usage = item && chapterId !== "all" ? reviewEvidenceUsage(item, chapterId) : null;
    if (item && usage && ["priority", "keep", "pending"].includes(event.target.value)) {
      item.includedInWriting = true;
      usage.status = event.target.value;
      state.review.selectedEvidenceIds = state.review.selectedEvidenceIds.filter((id) => id !== item.id);
      render();
      notify(`已设为本章${REVIEW_EVIDENCE_STATUS[usage.status].label}`);
    }
    return;
  }
  if (event.target.dataset.action === "review-topic-literature-toggle") {
    const id = event.target.dataset.literatureId; const selected = new Set(state.review.literatureSelection || []); event.target.checked ? selected.add(id) : selected.delete(id); state.review.literatureSelection = [...selected]; render(); return;
  }
  if (event.target.dataset.reviewWritingField) { state.review.writingRequirements[event.target.dataset.reviewWritingField] = event.target.value; saveState(); return; }
  if (event.target.dataset.reviewSectionDraft !== undefined) { const chapter = state.review.outlineChapters.find((c) => c.id === state.review.activeChapterId); if (chapter) { const existing = state.review.sectionDrafts.find((s) => s.chapter_id === chapter.id) || { chapter_id: chapter.id, title: chapter.title }; state.review.sectionDrafts = [...state.review.sectionDrafts.filter((s) => s.chapter_id !== chapter.id), { ...existing, markdown: event.target.value }]; saveState(); } return; }
  if (event.target.dataset.action === "review-evidence-chapter") {
    state.review.evidenceChapterFilter = event.target.value || "all";
    state.review.selectedEvidenceIds = [];
    render();
    return;
  }
  if (event.target.dataset.action === "review-evidence-filter-option") {
    const filter = event.target.dataset.filter;
    const values = state.review.evidenceFilters[filter] || [];
    state.review.evidenceFilters[filter] = event.target.checked
      ? [...new Set([...values, event.target.value])]
      : values.filter((value) => value !== event.target.value);
    state.review.selectedEvidenceIds = [];
    render();
    return;
  }
  if (event.target.dataset.action === "review-evidence-year-bound") {
    const bound = event.target.dataset.bound;
    if (["yearStart", "yearEnd"].includes(bound)) state.review.evidenceFilters[bound] = event.target.value.replace(/\D/g, "").slice(0, 4);
    state.review.selectedEvidenceIds = [];
    render();
    return;
  }
  if (event.target.dataset.action === "review-evidence-select") {
    const id = event.target.dataset.evidenceId;
    state.review.selectedEvidenceIds = event.target.checked
      ? [...new Set([...state.review.selectedEvidenceIds, id])]
      : state.review.selectedEvidenceIds.filter((item) => item !== id);
    render();
    return;
  }
  if (event.target.dataset.action === "review-evidence-select-all") {
    const visibleIds = reviewEvidenceRecords().map((item) => item.id);
    const selected = new Set(state.review.selectedEvidenceIds);
    visibleIds.forEach((id) => event.target.checked ? selected.add(id) : selected.delete(id));
    state.review.selectedEvidenceIds = [...selected];
    render();
    return;
  }
  if (event.target.dataset.reviewTopic !== undefined) {
    state.review.requirements.topic = event.target.value;
    render();
    return;
  }
  if (event.target.dataset.reviewFocus !== undefined) {
    const focus = state.review.requirements.focus;
    state.review.requirements.focus = event.target.checked
      ? [...new Set([...focus, event.target.value])]
      : focus.filter((item) => item !== event.target.value);
    render();
    return;
  }
  if (event.target.dataset.reviewTopicChoice) {
    state.review.selectedTopicId = event.target.dataset.reviewTopicChoice;
    state.review.activeTopicId = event.target.dataset.reviewTopicChoice;
    render();
    return;
  }
  if (event.target.dataset.reviewDirection) {
    const direction = state.review.directions.find((item) => item.id === event.target.dataset.reviewDirection);
    if (!direction) return;
    const selectedCount = state.review.directions.filter((item) => item.selected).length;
    if (event.target.checked && selectedCount >= 2) {
      event.target.checked = false;
      notify("最多选择 2 个研究方向");
      return;
    }
    direction.selected = event.target.checked;
    render();
    return;
  }
  if (event.target.dataset.interpretationField) {
    const field = event.target.dataset.interpretationField;
    if (state.interpretationDraft && ["purpose", "detail", "language"].includes(field)) {
      state.interpretationDraft[field] = event.target.value;
      saveState();
    }
    return;
  }
  if (event.target.dataset.literatureCustom) {
    state.literature.filters[event.target.dataset.literatureCustom] = event.target.value.replace(/\D/g, "").slice(0, 4);
    render();
    return;
  }
  if (event.target.dataset.literatureTime !== undefined) {
    state.literature.filters.time = event.target.value;
    render();
    return;
  }
  if (event.target.dataset.literatureFilter) {
    const field = event.target.dataset.literatureFilter;
    const values = state.literature.filters[field];
    state.literature.filters[field] = event.target.checked ? [...new Set([...values, event.target.value])] : values.filter((value) => value !== event.target.value);
    render();
    return;
  }
  if (event.target.dataset.literatureSelect) {
    const item = state.literature.records.find((record) => literatureRecordKey(record) === event.target.dataset.literatureSelect);
    if (item) item.selected = event.target.checked;
    if (state.literature.searchMode === "specific") commitLiteratureHistory();
    render();
    return;
  }
  if (event.target.dataset.literatureSelectAll !== undefined) {
    const visibleKeys = new Set(filteredLiteratureRecords().map(literatureRecordKey));
    state.literature.records.forEach((item) => { if (visibleKeys.has(literatureRecordKey(item))) item.selected = event.target.checked; });
    render();
    return;
  }
  if (event.target.dataset.literatureSort !== undefined) {
    state.literature.sort = event.target.value;
    render();
    return;
  }
  if (event.target.id === "home-files" || event.target.id === "case-more-files") {
    const files = [...event.target.files];
    const invalid = files.find((file) => file.size > 30 * 1024 * 1024);
    if (invalid) return notify(`${invalid.name} 超过 30M`);
    pendingFiles.push(...files);
    state.fileNames = pendingFiles.map((file) => file.name);
    if (event.target.id === "case-more-files") state.needsReparse = true;
    render();
    return;
  }
  if (event.target.id === "slide-image-input") {
    const slide = state.slides[state.selectedSlide];
    if (!slide) return notify("当前页面不存在");
    const files = [...event.target.files];
    const invalidType = files.find((file) => !["image/jpeg", "image/png"].includes(file.type));
    if (invalidType) return notify(`${invalidType.name} 不是 JPG 或 PNG 图片`);
    const invalidSize = files.find((file) => file.size > 30 * 1024 * 1024);
    if (invalidSize) return notify(`${invalidSize.name} 超过 30MB`);
    if (!files.length) return;
    state.loading = "正在读取当前页图片";
    render();
    try {
      const images = await Promise.all(files.map(async (file) => ({
        id: globalThis.crypto?.randomUUID?.() || `slide-image-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        name: file.name,
        mime: file.type,
        size: file.size,
        dataUrl: await readFileDataUrl(file),
        caption: "",
      })));
      slide.images = images.slice(0, 1);
      slide.visual_spec = { ...(slide.visual_spec || {}), type: "image", hierarchy: "left-right", density: "balanced" };
      state.slides[state.selectedSlide] = normalizePlanningSlide(slide, state.selectedSlide, state.slides.length);
      invalidatePptBuild();
      notify("图片已上传，并切换为图片 / 影像版式");
    } catch (error) {
      notify(error.message || "图片读取失败");
    } finally {
      state.loading = "";
      render();
    }
    return;
  }
  if (event.target.dataset.field) { updateField(event.target); render(); }
});

document.addEventListener("keydown", async (event) => {
  if (event.key === "Enter" && event.target.dataset.reviewOutlinePoint !== undefined) {
    event.preventDefault();
    const chapter = state.review.outlineChapters.find((item) => item.id === event.target.dataset.chapterId);
    if (!chapter) return;
    const points = reviewOutlinePoints(chapter);
    if (points.length >= 6) {
      notify("每章最多保留 6 条主要内容，可考虑拆分章节");
      return;
    }
    const currentIndex = points.findIndex((point) => point.id === event.target.dataset.reviewOutlinePoint);
    const point = createReviewOutlinePoint(chapter.id);
    points.splice(currentIndex + 1, 0, point);
    chapter.evidenceStatus = "stale";
    render();
    document.querySelector(`[data-review-outline-point="${point.id}"]`)?.focus();
    return;
  }
  const literatureInputValue = event.target.id === "literature-query" ? currentLiteratureHomeDraft() : state.literature.queryDraft;
  if (event.key === "Enter" && ["literature-query", "literature-result-query"].includes(event.target.id) && literatureInputValue.trim()) {
    event.preventDefault();
    await runLiteratureSearch(literatureInputValue, event.target.id === "literature-query" ? state.literatureTab : state.literature.searchMode);
  }
});

document.addEventListener("dragstart", (event) => {
  const pointHandle = event.target.closest("[data-outline-point-drag]");
  if (pointHandle) {
    reviewDraggedOutlinePoint = {
      chapterId: pointHandle.dataset.chapterId || "",
      pointId: pointHandle.dataset.outlinePointDrag || "",
    };
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", reviewDraggedOutlinePoint.pointId);
    pointHandle.closest(".review-outline-point")?.classList.add("dragging");
    return;
  }
  const handle = event.target.closest("[data-outline-drag]");
  if (!handle) return;
  reviewDraggedOutlineId = handle.dataset.outlineDrag || "";
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", reviewDraggedOutlineId);
  handle.closest(".review-outline-chapter")?.classList.add("dragging");
});

document.addEventListener("dragover", (event) => {
  if (reviewDraggedOutlinePoint) {
    const point = event.target.closest("[data-outline-point-row]");
    if (!point || point.dataset.chapterId !== reviewDraggedOutlinePoint.chapterId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    document.querySelectorAll(".review-outline-point.drag-over").forEach((item) => item.classList.remove("drag-over"));
    if (point.dataset.pointId !== reviewDraggedOutlinePoint.pointId) point.classList.add("drag-over");
    return;
  }
  const chapter = event.target.closest(".review-outline-chapter");
  if (!chapter || !reviewDraggedOutlineId) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  document.querySelectorAll(".review-outline-chapter.drag-over").forEach((item) => item.classList.remove("drag-over"));
  if (chapter.dataset.outlineChapterId !== reviewDraggedOutlineId) chapter.classList.add("drag-over");
});

document.addEventListener("drop", (event) => {
  if (reviewDraggedOutlinePoint) {
    const row = event.target.closest("[data-outline-point-row]");
    const chapter = state.review.outlineChapters.find((item) => item.id === reviewDraggedOutlinePoint.chapterId);
    if (!row || !chapter || row.dataset.chapterId !== chapter.id) return;
    event.preventDefault();
    const points = reviewOutlinePoints(chapter);
    const sourceIndex = points.findIndex((point) => point.id === reviewDraggedOutlinePoint.pointId);
    const targetIndex = points.findIndex((point) => point.id === row.dataset.pointId);
    if (sourceIndex >= 0 && targetIndex >= 0 && sourceIndex !== targetIndex) {
      const [point] = points.splice(sourceIndex, 1);
      points.splice(targetIndex, 0, point);
      chapter.evidenceStatus = "stale";
    }
    reviewDraggedOutlinePoint = null;
    render();
    return;
  }
  const chapter = event.target.closest(".review-outline-chapter");
  if (!chapter || !reviewDraggedOutlineId) return;
  event.preventDefault();
  const changed = reorderReviewOutline(reviewDraggedOutlineId, chapter.dataset.outlineChapterId || "");
  reviewDraggedOutlineId = "";
  if (changed) render();
});

document.addEventListener("dragend", () => {
  reviewDraggedOutlineId = "";
  reviewDraggedOutlinePoint = null;
  document.querySelectorAll(".review-outline-chapter.dragging, .review-outline-chapter.drag-over, .review-outline-point.dragging, .review-outline-point.drag-over").forEach((item) => item.classList.remove("dragging", "drag-over"));
});

document.addEventListener("click", async (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;
  const index = Number(target.dataset.index);
  try {
    if (action === "review-open-prompt-drawer") { openReviewPromptDrawer(state.review.promptTab || "section"); render(); }
    if (action === "review-close-prompt-drawer") { state.review.promptDrawerOpen = false; reviewPromptEditorErrors = []; render(); }
    if (action === "review-prompt-tab") { openReviewPromptDrawer(target.dataset.promptKind); render(); }
    if (action === "review-restore-prompt") { reviewPromptEditorDraft = DEFAULT_REVIEW_PROMPTS[state.review.promptTab]; reviewPromptEditorErrors = []; render(); }
    if (action === "review-save-prompt") {
      const validation = validateReviewPromptTemplate(state.review.promptTab, reviewPromptEditorDraft);
      reviewPromptEditorErrors = validation.errors;
      if (!validation.valid) render();
      else {
        reviewPromptTemplates = { ...reviewPromptTemplates, [state.review.promptTab]: reviewPromptEditorDraft };
        saveReviewPromptTemplates(reviewPromptTemplates);
        render();
        notify("提示词已保存，将在下次执行时生效");
      }
    }
    if (action === "review-open-task-input") { openReviewTaskInputDrawer(target.dataset.chapterId); render(); }
    if (action === "review-close-task-input") { state.review.taskInputDrawerOpen = false; state.review.taskInputErrors = {}; render(); }
    if (action === "review-format-task-input") {
      const key = target.dataset.inputKey;
      try {
        state.review.taskInputDraft[key] = JSON.stringify(JSON.parse(state.review.taskInputDraft[key]), null, 2);
        delete state.review.taskInputErrors[key];
      } catch (error) { state.review.taskInputErrors[key] = `JSON 格式错误：${error.message}`; }
      render();
    }
    if (action === "review-restore-task-input") {
      const key = target.dataset.inputKey;
      delete state.review.taskInputOverrides?.[state.review.taskInputChapterId]?.[key];
      state.review.taskInputDraft[key] = reviewSystemTaskInputs(state.review.taskInputChapterId)[key];
      delete state.review.taskInputErrors[key];
      render();
    }
    if (action === "review-save-task-input") {
      const chapterId = state.review.taskInputChapterId;
      const validation = reviewTaskInputValidation(chapterId, state.review.taskInputDraft);
      state.review.taskInputErrors = validation.errors;
      if (!validation.valid) render();
      else {
        state.review.taskInputOverrides[chapterId] = { ...state.review.taskInputDraft };
        saveState();
        render();
        notify("本章任务输入已保存");
      }
    }
    if (action === "review-open-section-editor") {
      const chapterId = target.dataset.chapterId;
      const draft = state.review.sectionDrafts.find((item) => item.chapter_id === chapterId);
      state.review.sectionEditorChapterId = chapterId;
      state.review.sectionEditorDraft = draft?.markdown || "";
      render();
    }
    if (action === "review-close-section-editor") { state.review.sectionEditorChapterId = ""; state.review.sectionEditorDraft = ""; render(); }
    if (action === "review-save-section-editor") {
      const chapterId = state.review.sectionEditorChapterId;
      const chapter = state.review.outlineChapters.find((item) => item.id === chapterId);
      const existing = state.review.sectionDrafts.find((item) => item.chapter_id === chapterId);
      if (chapter && existing && state.review.sectionEditorDraft.trim()) {
        state.review.sectionDrafts = state.review.sectionDrafts.map((item) => item.chapter_id === chapterId ? { ...item, markdown: state.review.sectionEditorDraft.trim(), updatedAt: new Date().toISOString() } : item);
        state.review.sectionRuns[chapterId] = { status: "ready", error: "", updatedAt: new Date().toISOString() };
        invalidateReviewDownstream();
        state.review.sectionEditorChapterId = "";
        state.review.sectionEditorDraft = "";
        saveState();
        render();
        notify("本章修改已保存，全文整合结果已标记为过期");
      }
    }
    if (action === "review-close-preflight") { state.review.preflightPanelOpen = false; render(); }
    if (action === "review-toggle-preflight-ignore") {
      const ignored = new Set(state.review.ignoredPreflightTasks || []);
      ignored.has(index) ? ignored.delete(index) : ignored.add(index);
      state.review.ignoredPreflightTasks = [...ignored];
      render();
    }
    if (action === "review-run-preflight") await runReviewPreflight();
    if (action === "review-continue-pipeline") await runReviewWritingPipeline();
    if (action === "review-open-export") { state.review.stage = "export"; render(); }
    if (action === "go-portal") { state.screen = "portal"; render(); }
    if (action === "open-ppt") { state.screen = "ppt-home"; render(); }
    if (action === "open-review-task") { state.screen = "review-workspace"; render(); }
    if (action === "open-ppt-task") await openGeneratedPptTask();
    if (action === "switch-home-tab") { state.homeTab = index; render(); }
    if (action === "portal-start") {
      if (state.homeTab === 0) {
        state.screen = "review-workspace";
        state.review = { ...initialReviewState(), rawInput: state.portalText.trim(), requirements: { ...initialReviewState().requirements, subject: state.portalText.trim() || "脊柱结核" }, requirementsStatus: "loading" };
        render();
        const requirements = await runReviewAI("review_requirements", { user_raw_text_json: state.review.rawInput }, "正在识别综述写作需求");
        if (!requirements.field_or_department && !requirements.core_question) {
          state.review.nonMedical = true; state.review.requirementsStatus = "blocked"; render(); notify(requirements.topic_risk?.notice || "当前输入暂未识别为医学主题"); return;
        }
        state.review.requirementsStatus = "ready";
        state.review.requirements = { ...state.review.requirements, subject: requirements.research_points?.population_or_disease || requirements.field_or_department || state.review.requirements.subject, topic: requirements.research_points?.theme_or_intervention_exposure || state.review.requirements.topic, question: requirements.core_question || state.review.requirements.question, focus: String(requirements.research_points?.outcomes_or_focus || "").split(/[、，,；;]/).map((x) => x.trim()).filter(Boolean).slice(0, 3), extra: requirements.topic_risk?.notice || "", writing_type: "叙述性综述" };
        const directionData = await runReviewAI("review_directions", { requirements }, "正在生成研究方向");
        state.review.directions = (directionData.exploration_directions || []).map(normalizeReviewDirection);
        state.review.directions.slice(0, 2).forEach((d) => { d.selected = true; });
        render();
      } else if (state.homeTab === 1) {
        state.screen = "case-report-evidence";
        state.caseReportEvidence = initialCaseReportEvidenceState();
        render();
      } else notify("当前 Demo 暂未实现临床研究流程，请选择其他入口");
    }
    if (action === "case-report-evidence-chapter") {
      state.caseReportEvidence.activeChapterId = target.value || "intro";
      state.caseReportEvidence.statusFilter = "all";
      state.caseReportEvidence.detailId = "";
      render();
    }
    if (action === "case-report-evidence-status") {
      state.caseReportEvidence.statusFilter = target.dataset.status || "all";
      state.caseReportEvidence.detailId = "";
      render();
    }
    if (action === "case-report-evidence-detail") {
      state.caseReportEvidence.detailId = target.dataset.evidenceId || "";
      render();
    }
    if (action === "case-report-evidence-close-detail") {
      state.caseReportEvidence.detailId = "";
      render();
    }
    if (action === "case-report-evidence-source") {
      event.preventDefault();
      notify("演示文献来源仅用于展示交互，进入正式流程后将打开已核对的来源页");
    }
    if (action === "case-report-evidence-set-status") {
      const detailId = state.caseReportEvidence.detailId;
      const record = state.caseReportEvidence.records.find((entry) => entry.id === detailId);
      if (record) {
        record.status = target.dataset.status || "pending";
        state.caseReportEvidence.saved = true;
        state.caseReportEvidence.detailId = "";
        render();
        notify(record.status === "confirmed" ? "已确认用于正文" : record.status === "excluded" ? "已标记为不使用" : "已标记为待人工核对");
      }
    }
    if (action === "case-report-evidence-confirm") {
      state.caseReportEvidence.saved = true;
      notify("正文文献已保存，下一步将基于已确认文献撰写报告初稿");
    }
    if (action === "case-report-evidence-outline") {
      notify("当前 Demo 展示第 7 步；大纲中的章节和写作重点已作为本页只读上下文带入");
    }
    if (action === "review-edit-requirements") {
      state.review.editBackup = structuredClone(state.review.requirements);
      state.review.editingRequirements = true;
      render();
    }
    if (action === "review-jump-stage") {
      state.review.stage = reviewStageFrom(target.dataset.stage);
      state.review.drawerDirectionId = "";
      state.review.customDirectionOpen = false;
      render();
    }
    if (action === "review-show-topic-analysis") {
      state.review.activeTopicId = target.dataset.topicId || state.review.activeTopicId;
      render();
    }
    if (action === "review-confirm-topic") {
      state.review.stage = "approach";
      const data = await runReviewAI("review_approaches", { topic: state.review.topics?.find((t) => t.id === state.review.selectedTopicId), requirements: state.review.requirements }, "正在生成写作思路");
      state.review.approaches = (data.recommendations || []).map((item, index) => ({ ...item, id: `approach-${index + 1}` }));
      state.review.selectedApproachId = state.review.approaches.find((x) => x.recommended)?.id || state.review.approaches[0]?.id || "";
      render();
      notify("题目已确认，请选择写作思路");
    }
    if (action === "review-confirm-topic-literature") {
      state.review.stage = "topic-analysis"; render();
      const literature = state.review.literaturePool.filter((item) => state.review.literatureSelection.includes(item.literatureId));
      state.review.literatureAnalysis = await runReviewAI("review_literature_analysis", { requirements: state.review.requirements, selected_directions: state.review.directions.filter((d) => d.selected).map((d) => ({ id: d.id, direction: d.title })), literature }, "正在分析选题文献");
      render();
    }
    if (action === "review-generate-topics") {
      const data = await runReviewAI("review_topics", { requirements: state.review.requirements, selected_directions: state.review.directions.filter((d) => d.selected), literature: state.review.literaturePool.filter((item) => state.review.literatureSelection.includes(item.literatureId)), literature_analysis: state.review.literatureAnalysis }, "正在生成候选题目");
      state.review.topics = (data.candidates || []).map((item, index) => ({ id: `topic-${index + 1}`, title: item.zh_title || item.title, coreQuestion: item.core_question, analysis: { scope: [item.support], difference: [item.difference], coverage: [item.why], gaps: [item.risk?.description] }, risks: [{ type: item.risk?.title || "证据边界", level: "中", detail: item.risk?.description || "需核对当前文献批次" }] }));
      state.review.selectedTopicId = state.review.topics.find((x) => x.recommended)?.id || state.review.topics[0]?.id || ""; state.review.activeTopicId = state.review.selectedTopicId; state.review.stage = "topic"; render();
    }
    if (action === "review-select-approach") { state.review.selectedApproachId = target.dataset.approachId || ""; render(); }
    if (action === "review-confirm-approach") { state.review.stage = "writing-requirements"; render(); }
    if (action === "review-confirm-writing-requirements") {
      const data = await runReviewAI("review_outline", { topic: state.review.topics?.find((t) => t.id === state.review.selectedTopicId), requirements: state.review.requirements, writing_requirements: state.review.writingRequirements, approach: state.review.approaches.find((a) => a.id === state.review.selectedApproachId) }, "正在生成写作大纲");
      state.review.outlineChapters = (data.chapters || []).map((c, i) => ({ id: c.id || `chapter-${i + 1}`, title: c.title, purpose: c.focus, focus: c.focus, keyPoints: String(c.focus || "").split("\n").filter(Boolean), wordCount: Number(c.words) || 500, evidenceNeed: c.lit_need, evidenceStatus: "ready" })); state.review.stage = "outline"; render();
    }
    if (action === "review-select-chapter") { state.review.activeChapterId = target.dataset.chapterId || ""; render(); }
    if (action === "review-generate-section") {
      await generateReviewSection(target.dataset.chapterId);
    }
    if (action === "review-save-section") { const chapter = state.review.outlineChapters.find((c) => c.id === target.dataset.chapterId); const textarea = document.querySelector("[data-review-section-draft]"); if (chapter && textarea) { const existing = state.review.sectionDrafts.find((s) => s.chapter_id === chapter.id) || { chapter_id: chapter.id, title: chapter.title, evidence_ids: [], boundary: "" }; state.review.sectionDrafts = [...state.review.sectionDrafts.filter((s) => s.chapter_id !== chapter.id), { ...existing, markdown: textarea.value }]; render(); notify("本章正文已保存"); } }
    if (action === "review-integrate-fulltext") await integrateReviewManuscript();
    if (action === "review-export-word" || action === "review-export-evidence" || action === "review-export-queries") {
      const kind = action.replace("review-export-", ""); let text = ""; let name = "review";
      if (kind === "word") { text = `<html><meta charset="utf-8"><body>${escapeHtml(state.review.fullText?.markdown || "").replaceAll("\n", "<br>")}</body></html>`; name = "综述论文正文.doc"; }
      if (kind === "evidence") {
        const rows = normalizeReviewEvidenceRecords().flatMap((item) => {
          const base = [item.literatureId || item.id, item.title, item.journal, item.year, item.includedInWriting ? "纳入写作" : "不纳入本文"];
          if (!item.chapterUsages.length) return [[...base, "", "", ""]];
          return item.chapterUsages.map((usage) => [...base, reviewEvidenceChapterName(usage.chapterId), REVIEW_EVIDENCE_STATUS[usage.status]?.label || "待处理", usage.use]);
        });
        const quote = (value) => `"${String(value || "").replaceAll('"', '""')}"`;
        text = [["literatureId", "title", "journal", "year", "全文纳入状态", "使用章节", "本章优先级", "写作用途"], ...rows].map((row) => row.map(quote).join(",")).join("\n");
        name = "文献证据整理.csv";
      }
      if (kind === "queries") { text = (state.review.outlineChapters || []).map((c) => `${c.title}\t${c.evidenceNeed || c.lit_need || ""}`).join("\n"); name = "文献检索方向.tsv"; }
      const blob = new Blob([text], { type: "text/plain;charset=utf-8" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click(); URL.revokeObjectURL(a.href); notify(`已导出${name}`);
    }
    if (action === "review-add-outline") {
      const id = `outline-${Date.now()}`;
      state.review.outlineChapters.push({ id, title: "新增章节", purpose: "", keyPoints: [createReviewOutlinePoint(id)], wordCount: 800, evidenceNeed: "", evidenceExtra: [], evidenceStatus: "stale" });
      render();
      document.querySelector(`.review-outline-title-input[data-chapter-id="${id}"]`)?.select();
      notify("已在大纲末尾增加章节");
    }
    if (action === "review-add-outline-point") {
      const chapter = state.review.outlineChapters.find((item) => item.id === target.dataset.chapterId);
      if (!chapter) return;
      const points = reviewOutlinePoints(chapter);
      if (points.length >= 6) notify("每章最多保留 6 条主要内容，可考虑拆分章节");
      else {
        const point = createReviewOutlinePoint(chapter.id);
        points.push(point);
        chapter.evidenceStatus = "stale";
        render();
        document.querySelector(`[data-review-outline-point="${point.id}"]`)?.focus();
      }
    }
    if (action === "review-move-outline-point") {
      const chapter = state.review.outlineChapters.find((item) => item.id === target.dataset.chapterId);
      const points = chapter ? reviewOutlinePoints(chapter) : [];
      const sourceIndex = points.findIndex((point) => point.id === target.dataset.pointId);
      const offset = target.dataset.direction === "up" ? -1 : 1;
      const targetIndex = sourceIndex + offset;
      if (sourceIndex >= 0 && targetIndex >= 0 && targetIndex < points.length) {
        [points[sourceIndex], points[targetIndex]] = [points[targetIndex], points[sourceIndex]];
        chapter.evidenceStatus = "stale";
        render();
      }
    }
    if (action === "review-delete-outline-point") {
      const chapter = state.review.outlineChapters.find((item) => item.id === target.dataset.chapterId);
      const points = chapter ? reviewOutlinePoints(chapter) : [];
      const pointIndex = points.findIndex((point) => point.id === target.dataset.pointId);
      if (points.length <= 1) notify("每章至少保留 1 条主要内容");
      else if (pointIndex >= 0) {
        const [point] = points.splice(pointIndex, 1);
        state.review.deletedOutlinePoint = { chapterId: chapter.id, point: structuredClone(point), index: pointIndex };
        chapter.evidenceStatus = "stale";
        render();
        notifyOutlinePointDeleted(point);
      }
    }
    if (action === "review-undo-outline-point") {
      const deleted = state.review.deletedOutlinePoint;
      const chapter = state.review.outlineChapters.find((item) => item.id === deleted?.chapterId);
      if (deleted?.point && chapter) {
        const points = reviewOutlinePoints(chapter);
        points.splice(Math.min(deleted.index, points.length), 0, deleted.point);
        chapter.evidenceStatus = "stale";
        state.review.deletedOutlinePoint = null;
        render();
        notify("已恢复内容要点");
      }
    }
    if (action === "review-add-outline-evidence") {
      state.review.evidenceDraftChapterId = target.dataset.chapterId || "";
      state.review.evidenceDraft = "";
      render();
      document.querySelector("[data-review-evidence-draft]")?.focus();
    }
    if (action === "review-cancel-outline-evidence") {
      state.review.evidenceDraftChapterId = "";
      state.review.evidenceDraft = "";
      render();
    }
    if (action === "review-save-outline-evidence") {
      const chapter = state.review.outlineChapters.find((item) => item.id === target.dataset.chapterId);
      const value = state.review.evidenceDraft.trim();
      if (chapter && value) {
        chapter.evidenceExtra = [...(Array.isArray(chapter.evidenceExtra) ? chapter.evidenceExtra : []), value];
        state.review.evidenceDraftChapterId = "";
        state.review.evidenceDraft = "";
        render();
        notify("已补充本章证据要求");
      }
    }
    if (action === "review-remove-outline-evidence") {
      const chapter = state.review.outlineChapters.find((item) => item.id === target.dataset.chapterId);
      const evidenceIndex = Number(target.dataset.evidenceIndex);
      if (chapter && target.dataset.evidenceSource === "supplemental") {
        chapter.evidenceExtra = (chapter.evidenceExtra || []).filter((_, index) => index !== evidenceIndex);
        render();
      } else if (chapter) {
        const generated = String(chapter.evidenceNeed || "").split("\n").map((item) => item.trim()).filter(Boolean);
        chapter.evidenceNeed = generated.filter((_, index) => index !== evidenceIndex).join("\n");
        render();
      }
    }
    if (action === "review-refresh-outline-evidence") {
      const chapter = state.review.outlineChapters.find((item) => item.id === target.dataset.chapterId);
      if (chapter) {
        chapter.evidenceNeed = regeneratedReviewOutlineEvidence(chapter);
        chapter.evidenceStatus = "ready";
        render();
        notify("已根据本章内容更新证据需求");
      }
    }
    if (action === "review-delete-outline") {
      const chapters = state.review.outlineChapters;
      const chapter = chapters.find((item) => item.id === target.dataset.chapterId);
      if (chapters.length <= 1) notify("大纲至少需要保留一个章节");
      else if (chapter) {
        state.review.deletedOutline = { chapter: structuredClone(chapter), index: chapters.indexOf(chapter) };
        state.review.outlineChapters = chapters.filter((item) => item.id !== chapter.id);
        render();
        notifyOutlineDeleted(chapter);
      }
    }
    if (action === "review-undo-delete-outline") {
      const deleted = state.review.deletedOutline;
      if (deleted?.chapter) {
        state.review.outlineChapters.splice(Math.min(deleted.index, state.review.outlineChapters.length), 0, deleted.chapter);
        state.review.deletedOutline = null;
        render();
        notify("已恢复章节");
      }
    }
    if (action === "review-move-outline") {
      const chapters = state.review.outlineChapters;
      const sourceIndex = chapters.findIndex((item) => item.id === target.dataset.chapterId);
      const offset = target.dataset.direction === "up" ? -1 : 1;
      const targetIndex = sourceIndex + offset;
      if (sourceIndex >= 0 && targetIndex >= 0 && targetIndex < chapters.length) {
        [chapters[sourceIndex], chapters[targetIndex]] = [chapters[targetIndex], chapters[sourceIndex]];
        render();
      }
    }
    if (action === "review-confirm-outline") {
      state.review.outlineChapters.forEach((chapter) => {
        if (chapter.evidenceStatus === "stale") {
          chapter.evidenceNeed = regeneratedReviewOutlineEvidence(chapter);
          chapter.evidenceStatus = "ready";
        }
      });
      state.review.stage = "evidence-loading";
      state.review.evidencePhase = "searching";
      state.review.evidenceChapterFilter = "all";
      state.review.evidenceStatusFilter = "all";
      state.review.evidenceAdvancedOpen = false;
      state.review.evidenceFilters = { types: [], yearMode: "all", yearStart: "", yearEnd: "", jcr: [], impact: [] };
      state.review.selectedEvidenceIds = [];
      render();
      try {
        const plan = await runReviewAI("review_recall_plan", { topic: state.review.topics?.find((t) => t.id === state.review.selectedTopicId), chapters: state.review.outlineChapters.map((c) => ({ id: c.id, title: c.title, lit_need: c.evidenceNeed })) }, "正在生成各章节文献检索范围");
        state.review.recallPlan = plan;
        const batches = await Promise.all((plan.chapters || []).map(async (entry) => { const chapter = state.review.outlineChapters.find((c) => c.id === entry.chapter_id); const response = await api("/api/literature/search", { method: "POST", body: JSON.stringify({ queries: entry.queries || [], query: entry.queries?.length ? "" : chapter?.title || "医学综述", maxResults: 6 }) }); const result = await response.json(); return (result.items || []).map((item) => ({ ...reviewLiteratureRecord(item, entry.chapter_id), chapterId: entry.chapter_id, use: "用于支持本章论述，进入正文前需核对全文。", basis: "来自当前章节检索批次。", limitation: "摘要或题名不足时不能补写具体研究数据。", status: "pending", filterType: literatureType(item), studyType: literatureType(item), jcr: "暂无", impactFactor: null })); }));
        const merged = new Map();
        batches.flat().forEach((record) => {
          const key = record.literatureId || record.id;
          const existing = merged.get(key);
          if (existing) existing.chapterUsages.push({ chapterId: record.chapterId, status: "pending", use: record.use });
          else merged.set(key, normalizeReviewEvidenceItem({ ...record, includedInWriting: true, chapterUsages: [{ chapterId: record.chapterId, status: "pending", use: record.use }] }));
        });
        state.review.writingEvidence = [...merged.values()];
      } catch (error) { state.review.writingEvidence = initialReviewState().writingEvidence.map((item) => normalizeReviewEvidenceItem({ ...item, literatureId: item.id, id: item.id })); notify(`实时检索不可用，已载入演示正文文献：${error.message || "请重试"}`); }
      state.review.stage = "evidence"; state.review.evidencePhase = "ready"; render(); notify(`已按 ${state.review.outlineChapters.length} 个章节整理正文候选文献`);
    }
    if (action === "review-evidence-status") {
      state.review.evidenceStatusFilter = target.dataset.status || "all";
      state.review.selectedEvidenceIds = [];
      render();
    }
    if (action === "review-evidence-toggle-advanced") {
      state.review.evidenceAdvancedOpen = !state.review.evidenceAdvancedOpen;
      render();
    }
    if (action === "review-evidence-year") {
      state.review.evidenceFilters.yearMode = target.dataset.year || "all";
      if (state.review.evidenceFilters.yearMode !== "custom") {
        state.review.evidenceFilters.yearStart = "";
        state.review.evidenceFilters.yearEnd = "";
      }
      state.review.selectedEvidenceIds = [];
      render();
    }
    if (action === "review-evidence-clear-filter") {
      const filter = target.dataset.filter;
      if (filter === "year") Object.assign(state.review.evidenceFilters, { yearMode: "all", yearStart: "", yearEnd: "" });
      else if (["types", "jcr", "impact"].includes(filter)) state.review.evidenceFilters[filter] = [];
      state.review.selectedEvidenceIds = [];
      render();
    }
    if (action === "review-evidence-clear-all") {
      state.review.evidenceFilters = { types: [], yearMode: "all", yearStart: "", yearEnd: "", jcr: [], impact: [] };
      state.review.selectedEvidenceIds = [];
      render();
    }
    if (action === "review-evidence-set") {
      const item = normalizeReviewEvidenceRecords().find((entry) => entry.id === target.dataset.evidenceId);
      const chapterId = state.review.evidenceChapterFilter;
      const usage = item && chapterId !== "all" ? reviewEvidenceUsage(item, chapterId) : null;
      if (item && usage && ["priority", "keep"].includes(target.dataset.status)) {
        item.includedInWriting = true;
        usage.status = target.dataset.status;
        state.review.selectedEvidenceIds = state.review.selectedEvidenceIds.filter((id) => id !== item.id);
        render();
      }
    }
    if (action === "review-evidence-edit-chapters") {
      const item = normalizeReviewEvidenceRecords().find((entry) => entry.id === target.dataset.evidenceId);
      if (item) {
        state.review.evidenceAssignmentDraft = {
          evidenceId: item.id,
          includedInWriting: item.includedInWriting,
          chapterUsages: structuredClone(item.chapterUsages),
        };
        render();
      }
    }
    if (action === "review-evidence-close-assignment") {
      state.review.evidenceAssignmentDraft = null;
      render();
    }
    if (action === "review-evidence-draft-toggle-inclusion") {
      if (state.review.evidenceAssignmentDraft) {
        state.review.evidenceAssignmentDraft.includedInWriting = !state.review.evidenceAssignmentDraft.includedInWriting;
        render();
      }
    }
    if (action === "review-evidence-save-assignment") {
      const draft = state.review.evidenceAssignmentDraft;
      const item = draft && normalizeReviewEvidenceRecords().find((entry) => entry.id === draft.evidenceId);
      if (item) {
        if (draft.includedInWriting && !draft.chapterUsages.length) {
          notify("请至少选择一个使用章节，或设为不纳入本文写作");
          return;
        }
        item.includedInWriting = draft.includedInWriting;
        item.chapterUsages = structuredClone(draft.chapterUsages);
        state.review.evidenceAssignmentDraft = null;
        state.review.selectedEvidenceIds = state.review.selectedEvidenceIds.filter((id) => id !== item.id);
        render();
        notify("已保存各章节的引用优先级和写作用途");
      }
    }
    if (action === "review-evidence-remove-chapter") {
      const item = normalizeReviewEvidenceRecords().find((entry) => entry.id === target.dataset.evidenceId);
      const chapterId = state.review.evidenceChapterFilter;
      if (item && chapterId !== "all") {
        item.chapterUsages = item.chapterUsages.filter((usage) => usage.chapterId !== chapterId);
        render();
        notify("已从当前章节移除，其他章节的设置不受影响");
      }
    }
    if (action === "review-evidence-toggle-inclusion") {
      const item = normalizeReviewEvidenceRecords().find((entry) => entry.id === target.dataset.evidenceId);
      if (item) {
        item.includedInWriting = !item.includedInWriting;
        render();
        notify(item.includedInWriting ? "已恢复纳入本文写作" : "已从全文写作池中移除");
      }
    }
    if (action === "review-evidence-batch") {
      const status = target.dataset.status;
      const selected = new Set(state.review.selectedEvidenceIds);
      if (!selected.size) notify("请先选择需要处理的文献");
      else if (status === "omit") {
        normalizeReviewEvidenceRecords().forEach((item) => { if (selected.has(item.id)) item.includedInWriting = false; });
        const count = selected.size;
        state.review.selectedEvidenceIds = [];
        render();
        notify(`已将 ${count} 篇文献设为不纳入本文写作`);
      } else if (["priority", "keep", "remove"].includes(status) && state.review.evidenceChapterFilter !== "all") {
        normalizeReviewEvidenceRecords().forEach((item) => {
          if (!selected.has(item.id)) return;
          if (status === "remove") item.chapterUsages = item.chapterUsages.filter((usage) => usage.chapterId !== state.review.evidenceChapterFilter);
          else {
            const usage = reviewEvidenceUsage(item, state.review.evidenceChapterFilter);
            if (usage) { usage.status = status; item.includedInWriting = true; }
          }
        });
        const count = selected.size;
        state.review.selectedEvidenceIds = [];
        render();
        notify(status === "remove" ? `已从当前章节移除 ${count} 篇文献` : `已将 ${count} 篇文献设为本章${REVIEW_EVIDENCE_STATUS[status].label}`);
      }
    }
    if (action === "review-evidence-continue") {
      state.review.activeChapterId = state.review.outlineChapters[0]?.id || "";
      await runReviewWritingPipeline();
    }
    if (action === "review-cancel-edit") {
      if (state.review.editBackup) state.review.requirements = state.review.editBackup;
      state.review.editBackup = null;
      state.review.editingRequirements = false;
      render();
    }
    if (action === "review-save-requirements") {
      state.review.editBackup = null;
      state.review.editingRequirements = false;
      state.review.directionGeneration += 1;
      const selectedDirections = state.review.directions.filter((item) => item.selected);
      const unselectedCustomDirections = state.review.directions.filter((item) => !item.selected && item.custom);
      const protectedTitles = new Set([...selectedDirections, ...unselectedCustomDirections].map((item) => item.title));
      const generated = regeneratedReviewDirections(state.review.directionGeneration - 1).filter((item) => !protectedTitles.has(item.title));
      state.review.directions = [...selectedDirections, ...unselectedCustomDirections, ...generated];
      render();
      notify("已更新候选方向，已选方向保持不变，请复核");
    }
    if (action === "review-custom-topic") {
      const value = window.prompt("输入自定义主题/方向", state.review.requirements.topic || "");
      if (value?.trim()) { state.review.requirements.topic = value.trim().slice(0, 40); render(); }
    }
    if (action === "review-custom-focus") {
      const value = window.prompt("输入自定义重点关注");
      if (value?.trim()) { state.review.requirements.focus = [...new Set([...state.review.requirements.focus, value.trim().slice(0, 30)])].slice(-3); render(); }
    }
    if (action === "review-custom-direction") {
      state.review.drawerDirectionId = "";
      state.review.customDirectionDraft = { title: "", description: "", searchFocus: "" };
      state.review.customDirectionErrors = {};
      state.review.customDirectionOpen = true;
      render();
    }
    if (action === "review-close-custom-direction") {
      state.review.customDirectionOpen = false;
      state.review.customDirectionDraft = { title: "", description: "", searchFocus: "" };
      state.review.customDirectionErrors = {};
      render();
    }
    if (action === "review-add-custom-direction") {
      const draft = state.review.customDirectionDraft;
      const title = draft.title.trim();
      const description = draft.description.trim();
      const errors = {};
      if (!title) errors.title = "请填写研究方向名称";
      else if (state.review.directions.some((item) => item.title.trim() === title)) errors.title = "该研究方向已存在";
      if (!description) errors.description = "请说明这个方向准备了解和研究什么";
      if (Object.keys(errors).length) {
        state.review.customDirectionErrors = errors;
        render();
      } else {
        const id = `custom-${Date.now()}`;
        const selectedCount = state.review.directions.filter((item) => item.selected).length;
        const autoSelected = selectedCount < 2;
        state.review.directions.push({
          id,
          title,
          description,
          reason: `这是你主动补充的方向，与当前“${state.review.requirements.topic}”需求相关。`,
          searchFocus: draft.searchFocus.trim() || `围绕“${title}”查找研究对象、方法和临床应用场景。`,
          pending: "该方向的文献数量、直接支撑程度和选题边界需要在下一步确认。",
          keywords: `${state.review.requirements.subject}, ${title}`,
          selected: autoSelected,
          custom: true,
        });
        state.review.customDirectionOpen = false;
        state.review.customDirectionDraft = { title: "", description: "", searchFocus: "" };
        state.review.customDirectionErrors = {};
        render();
        notify(autoSelected ? "已添加并选择自定义研究方向" : "已添加方向；当前已选 2 个，请调整后再选择");
      }
    }
    if (action === "review-add-direction") {
      const direction = state.review.directions.find((item) => item.id === target.dataset.directionId);
      const selectedCount = state.review.directions.filter((item) => item.selected).length;
      if (!direction) return;
      if (selectedCount >= 2) notify("最多选择 2 个研究方向，请先移出一个已选方向");
      else { direction.selected = true; render(); }
    }
    if (action === "review-remove-direction" || action === "review-remove-from-detail") {
      const direction = state.review.directions.find((item) => item.id === target.dataset.directionId);
      if (direction) direction.selected = false;
      state.review.drawerDirectionId = "";
      render();
    }
    if (action === "review-regenerate-directions") {
      state.review.regeneratingDirections = true;
      render();
      await new Promise((resolve) => window.setTimeout(resolve, 500));
      state.review.directionGeneration += 1;
      const selectedDirections = state.review.directions.filter((item) => item.selected);
      const unselectedCustomDirections = state.review.directions.filter((item) => !item.selected && item.custom);
      const protectedTitles = new Set([...selectedDirections, ...unselectedCustomDirections].map((item) => item.title));
      const generated = regeneratedReviewDirections(state.review.directionGeneration - 1).filter((item) => !protectedTitles.has(item.title));
      state.review.directions = [...selectedDirections, ...unselectedCustomDirections, ...generated];
      state.review.regeneratingDirections = false;
      render();
      notify(`已更新 ${generated.length} 个候选方向，已选方向保持不变`);
    }
    if (action === "review-direction-detail") { state.review.drawerDirectionId = target.dataset.directionId || ""; render(); }
    if (action === "review-close-direction") { state.review.drawerDirectionId = ""; render(); }
    if (action === "review-select-from-detail") {
      const direction = state.review.directions.find((item) => item.id === target.dataset.directionId);
      const selectedCount = state.review.directions.filter((item) => item.selected).length;
      if (direction && (direction.selected || selectedCount < 2)) direction.selected = true;
      else notify("最多选择 2 个研究方向");
      state.review.drawerDirectionId = "";
      render();
    }
    if (action === "review-confirm-directions") {
      state.review.stage = "topic-literature"; state.review.topicLiteraturePhase = "searching"; state.review.literaturePool = []; state.review.literatureSelection = []; render();
      try {
        const dirs = state.review.directions.filter((d) => d.selected);
        const batches = await Promise.all(dirs.map(searchReviewDirection));
        state.review.literaturePool = batches.flat().filter((item, index, arr) => arr.findIndex((x) => x.literatureId === item.literatureId) === index);
        if (!state.review.literaturePool.length) state.review.literaturePool = initialReviewState().writingEvidence.slice(0, 8).map((item) => reviewLiteratureRecord({ ...item, recordKey: item.id }, item.chapterId));
        state.review.topicLiteraturePhase = "ready"; render(); notify(`已召回 ${state.review.literaturePool.length} 篇选题文献`);
      } catch (error) { state.review.literaturePool = initialReviewState().writingEvidence.slice(0, 8).map((item) => reviewLiteratureRecord({ ...item, pmid: item.pmid || "", recordKey: item.id }, item.chapterId)); state.review.topicLiteraturePhase = "ready"; render(); notify(`实时检索不可用，已载入演示文献批次：${error.message || "请重试"}`); }
    }
    if (action === "literature-entry") { state.screen = "literature-home"; render(); }
    if (["all-papers", "paper-card", "all-writings"].includes(action)) notify("该模块尚未在当前 Demo 中实现");
    if (action === "start-literature-interpretation") beginLiteratureInterpretation(target.dataset.recordKey || "");
    if (action === "back-from-interpretation") { state.screen = "literature-results"; render(); }
    if (action === "create-literature-interpretation") await createLiteratureInterpretation();
    if (action === "open-literature-report") {
      state.activeLiteratureReportId = target.dataset.reportId || "";
      state.activeReportSectionId = "basic";
      state.reportEvidenceOpen = true;
      state.confirmReportOpen = false;
      state.exportReportOpen = false;
      state.screen = "literature-report";
      render();
    }
    if (action === "select-report-section") {
      state.activeReportSectionId = target.dataset.sectionId || "";
      state.reportEvidenceOpen = true;
      render();
      document.getElementById(`report-section-${state.activeReportSectionId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    if (action === "toggle-report-evidence") { state.reportEvidenceOpen = !state.reportEvidenceOpen; render(); }
    if (action === "open-report-confirm") { state.confirmReportOpen = true; state.exportReportOpen = false; render(); }
    if (action === "close-report-confirm") { state.confirmReportOpen = false; render(); }
    if (action === "confirm-report-body") {
      const report = activeLiteratureReport();
      if (!report || report.status !== "pending") throw new Error("当前正文状态不能确认");
      const now = new Date().toISOString();
      report.status = "confirmed";
      report.confirmedAt = now;
      report.updatedAt = now;
      state.confirmReportOpen = false;
      render();
      notify("正文已确认，可以导出");
    }
    if (action === "open-report-export") { state.exportReportOpen = true; state.confirmReportOpen = false; render(); }
    if (action === "close-report-export") { state.exportReportOpen = false; render(); }
    if (action === "download-literature-report") downloadLiteratureReport();
    if (action === "retry-literature-report") {
      const report = activeLiteratureReport();
      if (!report) throw new Error("未找到解读任务");
      await generateLiteratureInterpretation(report);
    }
    if (action === "back-literature-home") { state.screen = "literature-home"; state.literatureTab = state.literature.searchMode; state.literatureDrafts[state.literatureTab] = state.literature.query; render(); }
    if (action === "switch-literature-tab") { state.literatureTab = target.dataset.mode === "specific" ? "specific" : "topic"; render(); }
    if (action === "submit-literature") await runLiteratureSearch(state.screen === "literature-home" ? currentLiteratureHomeDraft() : state.literature.queryDraft, state.screen === "literature-home" ? state.literatureTab : state.literature.searchMode);
    if (action === "use-literature-example") { state.literatureDrafts[state.literatureTab] = target.dataset.query || ""; render(); document.getElementById("literature-query")?.focus(); }
    if (action === "clear-literature-query") { if (state.screen === "literature-home") state.literatureDrafts[state.literatureTab] = ""; else state.literature.queryDraft = ""; render(); }
    if (action === "toggle-literature-advanced") { state.literature.advancedOpen = !state.literature.advancedOpen; render(); }
    if (action === "reset-literature-filters") { state.literature.filters = { ...initialLiteratureState().filters }; render(); }
    if (action === "open-literature-detail") { state.literature.detailRecordKey = target.dataset.recordKey || ""; state.literature.panel = "detail"; render(); }
    if (action === "show-literature-analysis") { state.literature.panel = "analysis"; state.literature.detailRecordKey = ""; render(); }
    if (action === "filter-literature-direction") { state.literature.filters.direction = target.dataset.directionId || ""; render(); }
    if (action === "clear-literature-direction") { state.literature.filters.direction = ""; render(); }
    if (action === "export-literature") { downloadLiteratureCsv(); notify("已导出当前选择的文献"); }
    if (action === "open-literature-history") {
      const entry = state.literatureHistory[index];
      if (entry?.session) {
        state.literature = { ...initialLiteratureState(), ...JSON.parse(JSON.stringify(entry.session)), filters: { ...initialLiteratureState().filters } };
        state.literatureTab = state.literature.searchMode;
        if (state.literature.searchMode === "specific") {
          state.literature.lookupDimension = state.literature.lookupDimension || literatureHistoryDimension(entry.session) || "pmid";
          state.literatureSpecificDimension = state.literature.lookupDimension;
        }
        state.literature.confirmedRecordKey = "";
        state.literature.panel = "analysis";
        state.literature.detailRecordKey = "";
        state.screen = "literature-results";
        render();
      }
    }
    if (action === "delete-literature-history") { state.literatureHistory.splice(index, 1); render(); notify("搜索记录已删除"); }
    if (action === "clear-literature-history" && window.confirm(`确认清空当前“${state.literatureTab === "specific" ? "找特定文献" : "按主题查找"}”记录？`)) { state.literatureHistory = state.literatureHistory.filter((item) => (item.session?.searchMode || "topic") !== state.literatureTab); render(); notify("当前场景的搜索记录已清空"); }
    if (action === "start") await startWorkflow();
    if (action === "back-home") { state.screen = "ppt-home"; render(); }
    if (action === "jump-step" && index <= state.maxUnlocked) {
      state.currentStep = index;
      if (index < 8) state.selectedSlide = Math.min(state.selectedSlide, Math.max(0, state.slides.length - 1));
      state.drawer = null;
      render();
    }
    if (action === "next") await goNext();
    if (action === "remove-home-file") { pendingFiles.splice(index, 1); state.fileNames = pendingFiles.map((file) => file.name); render(); }
    if (action === "rename") {
      const name = window.prompt("修改任务名称", state.projectTitle);
      if (name?.trim()) { state.projectTitle = name.trim().slice(0, 80); render(); }
    }
    if (action === "supplement") document.getElementById("case-more-files")?.click();
    if (action === "edit-case") { state.editCase = true; render(); }
    if (action === "save-case") { state.editCase = false; state.needsReparse = true; notify("病例修改已保存，请重新解析"); render(); }
    if (action === "reparse") {
      const editedCaseText = state.caseSections.map((s) => `${s.title}: ${s.content}`).join("\n");
      const result = await parseCurrentCase(editedCaseText);
      resetCaseDownstream();
      state.projectTitle = result.projectTitle || state.projectTitle;
      state.caseSections = result.sections || state.caseSections;
      state.currentStep = 0;
      state.maxUnlocked = 0;
      notify("重新解析完成"); render();
    }
    if (action === "edit-timeline") { state.editTimeline = true; render(); }
    if (action === "save-timeline") { state.editTimeline = false; notify("诊疗时间线已保存"); render(); }
    if (action === "delete-event") { state.timeline.splice(index, 1); render(); }
    if (action === "edit-outline") { state.editOutline = true; render(); }
    if (action === "save-outline") { state.editOutline = false; state.evidence = []; state.slides = []; invalidatePptBuild(); notify("大纲已保存"); render(); }
    if (action === "open-literature") { state.drawer = { type: "literature", topicIndex: index }; render(); }
    if (action === "open-all-literature") { state.drawer = { type: "all-literature" }; render(); }
    if (action === "open-citation") { state.drawer = { type: "citation", topicIndex: Number(target.dataset.topicIndex ?? state.drawer?.topicIndex ?? 0), citationIndex: index }; render(); }
    if (action === "toggle-citation") {
      const topicIndex = Number(target.dataset.topicIndex);
      const citation = state.evidence[topicIndex]?.citations?.[index];
      if (citation) citation.selected = target.checked;
      render();
    }
    if (action === "retry-literature") { await searchEvidenceTopic(state.evidence[index], index); notify(state.evidence[index].searchError ? "PubMed 检索未完成" : "PubMed 检索已更新"); render(); }
    if (action === "close-drawer") { state.drawer = null; render(); }
    if (action === "select-slide") { state.selectedSlide = index; render(); }
    if (action === "select-template") { state.selectedTemplateId = target.dataset.templateId || ""; invalidatePptBuild(); render(); }
    if (action === "reload-templates") { await loadPptTemplates(true); render(); }
    if (action === "add-slide") { state.slides.splice(state.selectedSlide + 1, 0, { type: "内容页", title: "新建页面", content: "", speakerNotes: "", extra: "", visual_spec: { type: "narrative", title: "新建页面", hierarchy: "title-body", density: "balanced", items: [], columns: [], rows: [] } }); state.selectedSlide += 1; normalizePlanningSlides(); invalidatePptBuild(); render(); }
    if (action === "regenerate-slide-visual") {
      const slide = state.slides[state.selectedSlide];
      if (!slide) throw new Error("当前页面不存在");
      const modelSlide = { ...slide, images: (slide.images || []).map(({ id, name, mime, size, caption }) => ({ id, name, mime, size, caption })) };
      const result = await runAI("slide_visual", { slide: modelSlide, slideIndex: state.selectedSlide, slideCount: state.slides.length, requirements: state.requirements }, "正在使用模型分析本页视觉结构");
      state.slides[state.selectedSlide] = normalizePlanningSlide({ ...slide, visual_spec: result.visual_spec || slide.visual_spec }, state.selectedSlide, state.slides.length);
      invalidatePptBuild();
      notify("本页视觉结构已更新");
      render();
    }
    if (action === "slide-image") document.getElementById("slide-image-input")?.click();
    if (action === "remove-slide-image") {
      const slide = state.slides[state.selectedSlide];
      if (!slide) throw new Error("当前页面不存在");
      const imageId = target.dataset.imageId || "";
      slide.images = (slide.images || []).filter((image) => image.id !== imageId);
      if (!slide.images.length && slide.visual_spec?.type === "image") {
        slide.visual_spec = { ...(slide.visual_spec || {}), type: inferredVisualType({ ...slide, visual_spec: undefined }) };
      }
      state.slides[state.selectedSlide] = normalizePlanningSlide(slide, state.selectedSlide, state.slides.length);
      invalidatePptBuild();
      notify("图片已从当前页移除");
      render();
    }
    if (action === "open-checks") { state.drawer = { type: "checks" }; render(); }
    if (action === "ignore-check") { state.checks[index].ignored = true; render(); }
    if (action === "recheck") { notify("页面检查已更新"); render(); }
    if (action === "rebuild-ppt") { await buildFullPpt(); notify("ppt-master 已重新生成"); render(); }
    if (action === "download-ppt") {
      if (!state.pptBuild?.downloadUrl) throw new Error("请先使用 ppt-master 生成 PPT");
      const link = document.createElement("a");
      link.href = state.pptBuild.downloadUrl; link.download = `${state.projectTitle || "病例汇报"}.pptx`; link.click();
      notify("PPT 已开始下载");
    }
  } catch (error) {
    state.loading = ""; notify(error.message || "操作失败"); render();
  }
});

loadState();
applyRouteFromLocation();
fetch("/api/health").then((response) => response.json()).then((health) => { state.modelConfigured = health.modelConfigured; state.modelReachable = health.modelReachable; render(); }).catch(() => render());
render();
void hydrateReviewStateFromIndexedDb();
if (state.screen === "workspace" && state.currentStep >= 7 && !state.pptTemplates.length) loadPptTemplates().then(render).catch((error) => { notify(error.message || "模板读取失败"); render(); });

window.addEventListener("popstate", () => {
  applyRouteFromLocation();
  render();
});
