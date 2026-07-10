import "./QinchuangOpcPage.css";

const stats = [
  { value: "近3万㎡", label: "改造后园区规模" },
  { value: "约3公里", label: "距新街口距离" },
  { value: "2026.01.15", label: "秦创OPC社区揭牌" },
];

const services = [
  "工商财税",
  "法务咨询",
  "投融资",
  "科技创新",
  "项目申报",
  "共享会议",
  "多功能报告",
  "商务洽谈",
];

const directions = [
  {
    title: "空间赋能",
    text: "平层、错层、挑高等多种纵向空间，为不同人员结构和发展阶段的团队提供选择。",
  },
  {
    title: "数字支撑",
    text: "围绕超级个体、AI、品牌传播和国际交流，构建更适合生活美学创业者的能力底座。",
  },
  {
    title: "生态共建",
    text: "以在地文化为根、以全球视野为翼，把创意转化为可落地、可商业化的美好生活方案。",
  },
];

export default function QinchuangOpcPage() {
  return (
    <main className="opc-site" aria-labelledby="opc-title">
      <nav className="opc-nav" aria-label="秦创OPC页面导航">
        <span className="opc-brand">秦创OPC × 中山坊</span>
        <div className="opc-nav-links" aria-hidden="true">
          <span>项目简介</span>
          <span>园区服务</span>
          <span>OPC产业方向</span>
        </div>
      </nav>

      <section className="opc-hero">
        <img src="/qinchuang-opc/entrance.jpeg" alt="" className="opc-hero-image" />
        <div className="opc-hero-shade" />
        <div className="opc-hero-content">
          <p className="opc-kicker">中山坊科技文创园 · 城墙下的工作家</p>
          <h1 id="opc-title">相聚OPC社区，携手逐梦前行</h1>
          <p>
            坐落于中山门内，紧邻地铁2号线明故宫站，东门接壤中山门城墙公园，在历史文脉、花园办公与AI原生能力之间，打开生活美学创业的新场景。
          </p>
        </div>
      </section>

      <section className="opc-stats" aria-label="园区数据">
        {stats.map((item) => (
          <div className="opc-stat" key={item.label}>
            <strong>{item.value}</strong>
            <span>{item.label}</span>
          </div>
        ))}
      </section>

      <section className="opc-section opc-intro">
        <div className="opc-section-copy">
          <p className="opc-section-label">项目简介</p>
          <h2>主城交通与花园办公兼得</h2>
          <p>
            中山坊园区位于中山门内，西距新街口约3公里，东与沪宁高速连接线无缝对接，畅享主城交通便捷。园区改建于原南京轻工业机械厂，原占地约1万平方米，改造后规模近3万平方米。
          </p>
          <p>
            园区东门接壤中山门城墙公园，花园办公环境得天独厚，为团队提供兼具城市效率与自然松弛感的办公体验。
          </p>
        </div>
        <div className="opc-image-stack">
          <img src="/qinchuang-opc/garden-gate.jpeg" alt="中山坊园区花园入口" />
          <img src="/qinchuang-opc/forest-path.jpeg" alt="中山门城墙公园步道" />
        </div>
      </section>

      <section className="opc-section opc-space">
        <img src="/qinchuang-opc/courtyard.jpeg" alt="中山坊园区中庭" />
        <div className="opc-section-copy">
          <p className="opc-section-label">空间设计</p>
          <h2>灵动空间，适配不同阶段的团队</h2>
          <p>
            园区利用自身团队的设计能力优势，充分呈现灵动空间。平层、错层、挑高等不同风格的纵向空间设计，增加了对层高有不同需求客户的选择性。
          </p>
          <p>
            不同人员结构、不同发展阶段的用户，都能在这里找到更合适的办公尺度和生长节奏。
          </p>
        </div>
      </section>

      <section className="opc-services">
        <div className="opc-services-heading">
          <p className="opc-section-label">园区服务</p>
          <h2>从入驻到发展的全生命周期支持</h2>
        </div>
        <p className="opc-services-text">
          园区运营团队提供全线运营与服务模式，推出“锞管家”4U服务体系，为园区内企业提供工商、财税、法务、投融资、科技创新、项目申报等咨询。
        </p>
        <div className="opc-service-list">
          {services.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      </section>

      <section className="opc-section opc-opc">
        <div className="opc-section-copy">
          <p className="opc-section-label">OPC产业方向</p>
          <h2>生活美学OPC社区正式启动</h2>
          <p>
            自2026年1月15日秦创OPC社区在中山坊科技文创园正式揭牌以来，园区围绕“空间赋能、数字支撑、资金扶持、生态共建”四大维度，推出一揽子专属支持计划。
          </p>
          <p>
            作为秦淮区首个“生活美学OPC社区”，中山坊依托南京深厚的历史文化底蕴与园区成熟的文创产业基础，创新性地提出“超级个体+AI+品牌传播+国际交流”的创业模式。
          </p>
        </div>
        <div className="opc-direction-list">
          {directions.map((item, index) => (
            <article key={item.title}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="opc-gallery" aria-label="公共空间">
        <div className="opc-gallery-copy">
          <p className="opc-section-label">公共配套</p>
          <h2>会议、报告、洽谈与生活配套一体</h2>
          <p>
            园区除自营省级众创空间为企业孵化服务外，也充分重视办公配套，设有企业服务中心、共享会议室、多功能报告厅、商务洽谈区、堂食空间、羽毛球馆、精品民宿、网红咖啡等公共空间。
          </p>
        </div>
        <img src="/qinchuang-opc/street.jpeg" alt="中山坊园区街区空间" />
        <img src="/qinchuang-opc/auditorium.jpeg" alt="多功能报告厅" />
        <img src="/qinchuang-opc/meeting.jpeg" alt="共享会议室" />
      </section>

      <section className="opc-closing">
        <p>
          目前，一批聚焦生活美学赛道的OPC创业者已陆续入驻园区，涵盖非遗创新、数字设计、健康养生、社群运营等多个方向。
        </p>
        <strong>让美学融入日常，让传统焕发新生，在中山坊，遇见生活的美好。</strong>
      </section>
    </main>
  );
}
