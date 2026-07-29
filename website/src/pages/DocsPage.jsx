import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  CreditCard,
  DatabaseZap,
  Download,
  FileText,
  KeyRound,
  Layers3,
  MonitorCog,
  Plug,
  Puzzle,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Workflow,
  X,
} from 'lucide-react';
import Nav from '../components/Nav';
import Footer from '../components/Footer';

const docGroups = [
  {
    title: '快速开始',
    items: [
      { id: 'intro', title: '9Xbot 与包子简介' },
      { id: 'download-install', title: '下载与安装' },
      { id: 'first-task', title: '开启第一个任务' },
      { id: 'task-chat', title: '创建任务与对话' },
    ],
  },
  {
    title: '核心工作流',
    items: [
      { id: 'context-workspace', title: '理解上下文与工作区' },
      { id: 'task-planning', title: '拆解和推进复杂任务' },
      { id: 'execution-results', title: '执行、检查与查看结果' },
      { id: 'files-artifacts', title: '文件与产物' },
    ],
  },
  {
    title: '能力扩展',
    items: [
      { id: 'skills-market', title: '技能与市场' },
      { id: 'experts-teams', title: '专家与团队任务' },
      { id: 'models', title: '模型配置' },
      { id: 'account-billing', title: '账号、余额与用量' },
    ],
  },
  {
    title: '管理与安全',
    items: [
      { id: 'task-history', title: '任务管理与归档' },
      { id: 'settings-permissions', title: '设置、权限与数据安全' },
      { id: 'admin', title: '管理后台与服务打通' },
      { id: 'faq', title: '常见问题' },
    ],
  },
];

const docs = [
  {
    id: 'intro',
    icon: Bot,
    title: '9Xbot 与包子简介',
    eyebrow: '产品定位',
    summary:
      '9Xbot 是面向办公、创作和研发场景的 AI 办公工作台。说出要求，包子会理解任务、开始执行，并交付可检查的完整成果。它连接桌面端、市场、模型服务和本地工作空间，是你的 AI 办公搭档。',
    points: [
      '桌面端优先：包子运行在本地桌面工作空间里，可以围绕当前文件、项目、窗口和用户指令推进任务。',
      '人来把关：包子会解释计划、展示过程、交付结果，关键操作仍由用户确认，适合把重复、复杂、跨软件的工作交给它推进。',
    ],
    details: [
      '你可以把包子理解成一个“能动手的办公搭档”。普通聊天助手主要回答问题，而桌面级智能体需要进一步理解环境、选择工具、创建文件、调用技能并检查结果。9Xbot 的网页文档不会把规划能力写成已完成能力；当前已经运行的桌面端能力、正在接入的网页服务和后续模型中转站会分开说明。',
    ],
  },
  {
    id: 'download-install',
    icon: Download,
    title: '下载与安装',
    eyebrow: '准备工作',
    summary:
      '普通用户只需要从 9Xbot 官网下载桌面端安装包，完成安装后打开包子即可开始使用。技术运行环境由应用内部处理。',
    steps: [
      '进入官网顶部或底部的“下载”区域。',
      '选择适合当前电脑系统的安装包。当前页面优先提供 Windows 入口。',
      '安装完成后打开 9Xbot，确认主界面能看到包子对话区、任务区和模型/技能相关设置入口。',
      '首次使用建议先从一个文件整理、会议纪要、周报生成或项目检查任务开始，便于快速感受包子的执行方式。',
    ],
    notes: [
      '面向团队分发时，建议统一使用官网或团队指定下载地址，避免成员拿到旧版本。',
      '如果系统提示安全确认，确认来源为 9Xbot 官方发布后再继续安装。后续正式发布会继续完善签名和版本校验流程。',
    ],
  },
  {
    id: 'first-task',
    icon: Sparkles,
    title: '开启第一个任务',
    eyebrow: '从一句话开始',
    summary:
      '第一个任务最好选择目标明确、文件边界清楚、结果可以检查的工作。包子会先理解需求，再拆解步骤，最后把结果交给你确认。',
    example:
      '请读取当前工作目录下的会议记录.docx，整理出会议摘要、待办清单和责任人，生成一份 Word 纪要。完成后告诉我文件保存位置。',
    steps: [
      '把需要处理的文件放在当前工作区，或者在对话里明确告诉包子文件位置。',
      '用自然语言说明目标、格式、交付物和检查标准。',
      '阅读包子给出的任务理解和计划，必要时补充限制条件。',
      '等待包子执行，期间可以让它解释正在做什么，也可以随时调整方向。',
      '检查最终文件、摘要或修改结果，不满意时继续提出修改意见。',
    ],
  },
  {
    id: 'task-chat',
    icon: FileText,
    title: '创建任务与对话',
    eyebrow: '对话不是闲聊',
    summary:
      '在 9Xbot 里，对话是任务入口。你提出的每一次需求，都可以变成一个带上下文、步骤、产物和历史记录的可追踪任务。',
    points: [
      '说清目标：例如“生成一份日报”比“帮我看看”更容易得到可交付结果。',
      '补充材料：把文件名、文件夹、截图、已有草稿或参考格式告诉包子。',
      '指定输出：说明要 Word、PPT、表格、代码补丁、图片提示词，还是一段可直接发送的文案。',
      '保留判断权：涉及删除、覆盖、提交、付款、外部发送等动作时，用户应进行确认。',
    ],
    details: [
      '如果任务很大，不需要一次说完全部细节。可以先说目标，让包子给出计划，再逐步补充背景。对于团队内部资料，建议明确哪些文件可以读取，哪些内容不能外发。',
    ],
  },
  {
    id: 'context-workspace',
    icon: MonitorCog,
    title: '理解上下文与工作区',
    eyebrow: '工作流第一步',
    summary:
      '包子的第一步不是直接执行，而是理解你当前要解决的问题、可用材料、已安装技能、模型配置和桌面环境。',
    points: [
      '会话上下文：当前对话里的目标、限制、修改意见和历史结论。',
      '文件上下文：你指定的文档、表格、PDF、项目目录、图片素材和导出位置。',
      '技能上下文：已经安装或可调用的办公、开发、设计、自动化技能。',
      '模型上下文：当前可用的聊天模型、视觉模型、图片模型和中转站模型列表。',
      '权限上下文：涉及文件写入、外部连接、账号、付费或敏感操作时，需要遵循用户授权。',
    ],
    details: [
      '上下文理解决定任务质量。比如同样是“帮我整理项目”，如果包子知道这是网页、桌面端还是模型中转站，就能选择完全不同的检查路径。后续桌面端与网站账号打通后，用户的模型余额、技能权限和市场购买状态会逐步进入这一层。',
    ],
  },
  {
    id: 'task-planning',
    icon: Workflow,
    title: '拆解和推进复杂任务',
    eyebrow: '工作流第二步',
    summary:
      '复杂任务通常不是一步完成。包子会把目标拆成可执行的小步骤，并在执行过程中根据结果继续调整。',
    points: [
      '办公任务：先读取材料，再提炼结构，最后生成 Word、PPT、表格或邮件正文。',
      '代码任务：先读项目结构和报错，再定位文件，修改后执行构建或测试检查。',
      '设计任务：先明确目标和风格，再生成提示词、素材方案、分镜或图片模型任务。',
      '自动化任务：先确认输入输出，再把重复步骤封装成可复用流程。',
    ],
    details: [
      '拆解任务的价值在于“可回头看”。当结果不符合预期时，你可以指出某一步理解错了，而不是从头重说。对于多人协作，任务拆解也能帮助团队判断哪些工作适合包子自动推进，哪些需要人工决策。',
    ],
  },
  {
    id: 'execution-results',
    icon: ClipboardCheck,
    title: '执行、检查与查看结果',
    eyebrow: '工作流第三步',
    summary:
      '包子执行后应交付可检查结果：文件位置、修改摘要、运行结果、失败原因或下一步建议，而不是只说“完成了”。',
    points: [
      '文件类结果：说明新文件保存在哪里、改了哪些部分、是否覆盖原文件。',
      '代码类结果：说明修改文件、验证命令结果、仍存在的风险。',
      '设计类结果：说明生成素材、可替换版本、适用场景和后续调整方向。',
      '失败类结果：说明失败卡在哪里、缺少什么输入、是否需要用户授权或补充资料。',
    ],
    details: [
      '建议把“请检查结果是否符合要求”写进任务目标里。包子可以在交付前进行基础自检，例如文件是否生成、页面是否空白、构建是否通过、截图是否完整。',
    ],
  },
  {
    id: 'files-artifacts',
    icon: DatabaseZap,
    title: '文件与产物',
    eyebrow: '交付物管理',
    summary:
      '9Xbot 的核心价值之一是把对话变成真实产物。产物包括文档、表格、图片、代码修改、报告、截图和可复用流程。',
    points: [
      '原始文件与生成文件应区分保存，重要文件建议保留备份。',
      '生成文件要有清晰命名，便于团队成员在项目目录里直接找到。',
      '需要发给客户或同事的内容，应先由用户检查，再通过正式渠道发送。',
      '后续任务可以引用前一次产物继续修改，形成连续工作流。',
    ],
  },
  {
    id: 'skills-market',
    icon: Puzzle,
    title: '技能与市场',
    eyebrow: '扩展能力',
    summary:
      '网页市场用于承载专家、技能、团队和连接器。桌面端可以读取这些能力，用户登录后逐步实现统一购买、安装和使用。',
    points: [
      '技能：把一类重复工作封装成稳定流程，例如周报生成、PDF 整理、PPT 初稿。',
      '专家：把特定领域的提示、工具和流程组合成更专门的任务角色。',
      '团队：多个专家围绕一个复杂目标分工推进。',
      '连接器：把外部系统、文件源或业务入口接入任务流程。',
    ],
    notes: [
      '当前市场入口已经放在网站中，后续会继续完善发布、购买、权限、版本和桌面端同步。',
    ],
  },
  {
    id: 'experts-teams',
    icon: Plug,
    title: '专家与团队任务',
    eyebrow: '多人协作思路',
    summary:
      '当一个任务跨越文案、数据、设计、研发或运营时，可以通过专家和团队任务把工作拆给不同能力单元。',
    points: [
      '专家适合处理单一领域深度任务，例如法务初审、销售话术、产品文案或代码审查。',
      '团队任务适合跨领域协作，例如“从客户需求到产品方案、报价材料和演示网页”。',
      '用户仍是最终负责人，包子负责协调信息、推进步骤和整理交付物。',
    ],
    details: [
      '这一能力会与市场、账号和权限系统逐步打通。对普通用户来说，不需要理解底层编排，只需要选择适合的专家或团队模板，然后描述目标。',
    ],
  },
  {
    id: 'models',
    icon: Layers3,
    title: '模型配置',
    eyebrow: '模型与中转站',
    summary:
      '9Xbot 会通过模型入口提供模型广场、控制台、接口和用量管理。桌面端用户登录后可直接使用已配置模型，不必自己接入 API。',
    points: [
      '模型广场：展示可用聊天模型、视觉模型、图片模型和不同供应商能力。',
      '控制台：面向需要 API 的用户提供密钥、调用记录、用量和余额管理。',
      '桌面端同步：登录同一账号后，桌面端读取用户可用模型和额度。',
      '上游接入：管理员可接入官方模型或合作方中转站，后续会加入中国移动提供的算力服务与上游中转能力。',
    ],
    notes: [
      '9Xbot 的模型与算力服务将围绕与中国移动的战略合作推进。中国移动提供算力服务和上游能力支持，9Xbot 负责面向用户的统一模型接入、智能调度、服务封装、计费和桌面端同步。移动上游地址、密钥和商务信息待后续正式提供后再接入。',
    ],
  },
  {
    id: 'account-billing',
    icon: CreditCard,
    title: '账号、余额与用量',
    eyebrow: '逐步开放',
    summary:
      '统一账号会连接官网、市场、模型中转站和桌面端。用户登录后可以查看余额、用量、购买记录和可用服务。',
    points: [
      '桌面端用户：登录后自动读取可用模型、技能权限和账户余额。',
      'API 用户：可以在网页控制台创建密钥、查看接口调用和充值消费。',
      '管理员：可以查看用户、订单、模型供应商、额度和异常调用。',
      '团队场景：后续可扩展成员、角色、账单归属和权限策略。',
    ],
    notes: [
      '付费、订单和发票等能力需要与正式支付渠道、合规流程和后台管理系统一起上线。当前文档按产品方案说明，不表示所有能力已经生产可用。',
    ],
  },
  {
    id: 'task-history',
    icon: BookOpen,
    title: '任务管理与归档',
    eyebrow: '可追踪工作',
    summary:
      '任务历史让你能回看包子做过什么、生成了什么、哪里失败过，以及后续应该从哪里继续。',
    points: [
      '常用任务可以保留，临时任务可以归档或删除。',
      '重要产物应保存在明确目录，并在任务记录里留下路径。',
      '涉及客户资料、合同、财务或内部数据的任务，建议按团队规范管理访问权限。',
      '删除历史对话不会自动代表删除所有本地文件，文件清理需要单独确认。',
    ],
  },
  {
    id: 'settings-permissions',
    icon: ShieldCheck,
    title: '设置、权限与数据安全',
    eyebrow: '边界清晰',
    summary:
      '9Xbot 的产品方向是让用户掌控模型、技能、文件和外部连接。涉及敏感操作时，应清楚知道包子能访问什么、会写入什么。',
    points: [
      '文件权限：只处理用户指定或当前工作区允许访问的文件。',
      '模型权限：不同模型供应商可能有不同数据策略，团队应统一选择。',
      '外部连接：接入 IM、网盘、企业系统或 API 前，需要明确授权范围。',
      '管理员权限：模型上游、计费、用户管理和监控应由后台角色控制。',
    ],
    details: [
      '普通用户不需要接触底层运行环境；管理者需要关注账号、密钥、费用、日志和供应商配置。产品正式商用前，还需要补齐隐私政策、服务协议、数据保留策略和安全审计流程。',
    ],
  },
  {
    id: 'admin',
    icon: Settings2,
    title: '管理后台与服务打通',
    eyebrow: '网页后台关系',
    summary:
      '官网本身负责展示、下载、文档、市场和模型入口；管理后台主要服务用户、计费、模型上游、监控和运营配置。',
    points: [
      '用户管理：账号、登录状态、角色、团队归属和服务权限。',
      '计费系统：充值、消费、订单、余额、套餐和异常扣费处理。',
      '模型接入：配置上游供应商、模型列表、倍率、可见范围和故障切换。',
      '监控审计：调用量、错误率、成本、接口延迟、异常用户和管理员操作记录。',
      '桌面端同步：桌面端登录后读取同一账号下的模型、余额、技能和市场购买状态。',
    ],
    notes: [
      '所以管理后台与当前官网不是同一个页面功能，但它们会共享账号体系和服务入口。官网面向用户，后台面向运营和管理员。',
    ],
  },
  {
    id: 'faq',
    icon: KeyRound,
    title: '常见问题',
    eyebrow: 'FAQ',
    summary:
      '这里整理 9Xbot 使用和上线过程中最容易混淆的问题，方便后续继续扩写成完整帮助中心。',
    faqs: [
      ['9Xbot 和包子是什么关系？', '9Xbot 是产品和平台名称，包子是当前桌面智能体的中文助手名称。'],
      ['网页和桌面端是什么关系？', '网页提供下载、文档、市场和模型服务入口；桌面端负责本地任务执行和日常使用。'],
      ['模型入口是不是独立产品？', '不是。模型中转站归入 9Xbot 统一账号体系，既服务桌面端，也服务需要 API 的外部用户。'],
      ['中国移动中转站现在接好了吗？', '还没有。上游链接和商务信息后续提供后再接入，文档中只描述预期接入方向。'],
      ['普通用户需要自己配置 API 吗？', '目标是不需要。用户登录和充值后，桌面端应能直接使用已开通模型。高级用户仍可在网页控制台使用 API 接入。'],
    ],
  },
];

const flatNavItems = docGroups.flatMap((group) => group.items);

function scrollToHash() {
  const targetId = window.location.hash.replace('#', '');
  if (!targetId) return;
  window.requestAnimationFrame(() => {
    document.getElementById(targetId)?.scrollIntoView({ block: 'start' });
  });
}

function SectionBody({ doc }) {
  const Icon = doc.icon;

  return (
    <section className="doc-section" id={doc.id}>
      <div className="doc-section-title">
        <Icon size={22} />
        <div>
          <span>{doc.eyebrow}</span>
          <h2>{doc.title}</h2>
        </div>
      </div>
      <p className="doc-summary">{doc.summary}</p>

      {doc.example && (
        <div className="doc-example">
          <span>示例任务</span>
          <p>{doc.example}</p>
        </div>
      )}

      {doc.steps && (
        <ol className="doc-steps">
          {doc.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      )}

      {doc.points && (
        <div className="doc-point-grid">
          {doc.points.map((point) => (
            <div className="doc-point" key={point}>
              <CheckCircle2 size={17} />
              <p>{point}</p>
            </div>
          ))}
        </div>
      )}

      {doc.details?.map((detail) => (
        <p className="doc-detail" key={detail}>
          {detail}
        </p>
      ))}

      {doc.notes && (
        <div className="doc-note">
          {doc.notes.map((note) => (
            <p key={note}>{note}</p>
          ))}
        </div>
      )}

      {doc.faqs && (
        <div className="doc-faq-list">
          {doc.faqs.map(([question, answer]) => (
            <article key={question}>
              <h3>{question}</h3>
              <p>{answer}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export default function DocsPage() {
  const [query, setQuery] = useState('');

  useEffect(() => {
    scrollToHash();
    window.addEventListener('hashchange', scrollToHash);
    return () => window.removeEventListener('hashchange', scrollToHash);
  }, []);

  const filteredDocs = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return docs;
    return docs.filter((doc) => {
      const haystack = [
        doc.title,
        doc.eyebrow,
        doc.summary,
        ...(doc.points || []),
        ...(doc.steps || []),
        ...(doc.details || []),
        ...(doc.notes || []),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [query]);

  const visibleIds = new Set(filteredDocs.map((doc) => doc.id));

  return (
    <>
      <Nav />
      <main className="docs-page">
        <section className="docs-hero">
          <div className="docs-hero-copy">
            <span className="docs-kicker">9Xbot 使用手册</span>
            <h1>9Xbot 产品使用手册</h1>
            <p>
              面向第一次使用 9Xbot 的普通用户，也面向准备把桌面端、市场和模型服务接进团队流程的运营与管理员。
            </p>
            <div className="docs-meta-row" aria-label="文档范围">
              <span>桌面端智能体</span>
              <span>市场与技能</span>
              <span>模型服务</span>
              <span>账号与管理</span>
            </div>
          </div>
        </section>

        <div className="docs-shell">
          <aside className="docs-sidebar" aria-label="文档目录">
            <div className="docs-search">
              <Search size={17} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索文档"
                aria-label="搜索文档"
              />
              {query && (
                <button type="button" onClick={() => setQuery('')} aria-label="清空搜索">
                  <X size={15} />
                </button>
              )}
            </div>

            {docGroups.map((group) => (
              <div className="docs-nav-group" key={group.title}>
                <h2>{group.title}</h2>
                {group.items
                  .filter((item) => visibleIds.has(item.id))
                  .map((item) => (
                    <a key={item.id} href={`#${item.id}`}>
                      {item.title}
                    </a>
                  ))}
              </div>
            ))}
          </aside>

          <article className="docs-content">
            {filteredDocs.length > 0 ? (
              filteredDocs.map((doc) => <SectionBody doc={doc} key={doc.id} />)
            ) : (
              <section className="doc-section">
                <div className="doc-section-title">
                  <Search size={22} />
                  <div>
                    <span>没有匹配</span>
                    <h2>换一个关键词试试</h2>
                  </div>
                </div>
                <p className="doc-summary">可以搜索“模型”“市场”“第一个任务”“权限”“计费”等关键词。</p>
              </section>
            )}
          </article>

          <aside className="docs-toc" aria-label="当前页目录">
            <h2>本页目录</h2>
            {flatNavItems.map((item) => (
              <a key={item.id} href={`#${item.id}`}>
                {item.title}
              </a>
            ))}
          </aside>
        </div>
      </main>
      <Footer />
    </>
  );
}
