import { Modal } from "@mantine/core";
import "./FeedbackModal.scss";

interface FeedbackModalProps {
  opened: boolean;
  onClose: () => void;
}

function FeedbackModal({ opened, onClose }: FeedbackModalProps) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      transitionProps={{
        transition: "pop",
        duration: 280,
        timingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
      }}
      centered
      size="lg"
      title={<span className="feedback-modal-title-bar">界面优化建议</span>}
      styles={{
        content: { padding: "0 28px 28px", maxWidth: 720, minWidth: 480 },
        header: { paddingBottom: 12 },
        body: { paddingTop: 0 },
      }}
    >
      <div className="feedback-content">

        {/* 可视化层 */}
        <section className="feedback-section">
          <h3 className="feedback-section-heading">可视化层</h3>

          <div className="feedback-item">
            <span className="feedback-item-num">1</span>
            <div className="feedback-item-body">
              <strong>雷达图颜色过多，难以区分角色</strong>
              <p>
                9条折线使用了9种颜色，视觉上高度拥挤，用户难以追踪单个角色的轮廓，尤其是颜色相近的几条线（红、橙、棕）几乎无法区分。建议默认只展示3–4条高亮线，其余淡化至低透明度；悬停或点击角色名时高亮对应线条，其余进一步淡出。可增加"对比模式"按钮选择最多2–3个角色做精确比较。
              </p>
            </div>
          </div>

          <div className="feedback-item">
            <span className="feedback-item-num">2</span>
            <div className="feedback-item-body">
              <strong>雷达图轴标签被折线遮挡，坐标轴刻度不清</strong>
              <p>
                雷达图四个顶点的"唱/念/做/打"标签以及数值刻度环被多条折线叠压，无法直接读取数值。建议将轴标签外移至网格线边界外15px处，增加刻度标注（如0、25、50、75、100），或用数值tooltip替代刻度文字，悬停时显示精确数值。
              </p>
            </div>
          </div>
        </section>

        {/* 信息架构 */}
        <section className="feedback-section">
          <h3 className="feedback-section-heading">信息架构</h3>

          <div className="feedback-item">
            <span className="feedback-item-num">3</span>
            <div className="feedback-item-body">
              <strong>四大模块导航栏与内容缺乏视觉关联</strong>
              <p>
                顶部"角色特征建模 / 行当推断模型 / 特征-行当关系 / 历史演化分析"四个标签导航，与下方的实际内容区域没有明显的连接或高亮状态，用户不清楚当前展示的是哪一模块的内容。建议激活态标签加下划线或背景高亮；点击标签时整个主内容区切换，而非始终全部展示，减少认知负荷。
              </p>
            </div>
          </div>

          <div className="feedback-item">
            <span className="feedback-item-num">4</span>
            <div className="feedback-item-body">
              <strong>三栏等宽布局导致右侧内容密度失衡</strong>
              <p>
                左侧柱状图+环形图、中间雷达图+说明、右侧规则推断知识库，三栏宽度相近，但右侧内容密度远高于左侧，造成视觉重量严重不对称。建议采用4:5:3的宽度比例（左:中:右），让中间雷达图有更充足的展示空间；或将右侧"推断方法概述"移至页面底部作为附注区域。
              </p>
            </div>
          </div>
        </section>

        {/* 数据呈现 */}
        <section className="feedback-section">
          <h3 className="feedback-section-heading">数据呈现</h3>

          <div className="feedback-item">
            <span className="feedback-item-num">5</span>
            <div className="feedback-item-body">
              <strong>柱状图数值标注遮挡条形末端</strong>
              <p>
                部分类别（如"新编剧目与改编"的463、"京剧传统剧目·生行"的448）数字标注位于条形内部末端，与条形末尾颜色对比度低，难以辨认。建议将数值标注统一移至条形右侧外部，颜色使用正文色，保持所有标注位置一致性。
              </p>
            </div>
          </div>

          <div className="feedback-item">
            <span className="feedback-item-num">6</span>
            <div className="feedback-item-body">
              <strong>行当体系环形图的分类文字过密，外层环无法阅读</strong>
              <p>
                环形图外层文字（如"武生""花旦""青衣"等细分行当）因扇区极小而文字互相重叠，实际无法阅读。建议外层细分行当改用交互式tooltip，鼠标悬停扇区时弹出名称+数量；或将环形图改为可展开的树状结构，点击内环类别后展开外环细节。
              </p>
            </div>
          </div>
        </section>

        {/* 交互与可用性 */}
        <section className="feedback-section">
          <h3 className="feedback-section-heading">交互与可用性</h3>

          <div className="feedback-item">
            <span className="feedback-item-num">7</span>
            <div className="feedback-item-body">
              <strong>右侧"规则推断知识库"缺乏可操作性</strong>
              <p>
                8条规则以静态表格展示，用户无法进行筛选、搜索或输入新条件进行实时推断，置信度数值的依据也未说明。建议增加条件输入面板（如性别/年龄/武艺等属性选择器），实时输出匹配的行当及置信度；置信度加信息图标，悬停展示计算依据（如"基于N个训练样本"）。
              </p>
            </div>
          </div>

          <div className="feedback-item">
            <span className="feedback-item-num">8</span>
            <div className="feedback-item-body">
              <strong>顶部统计数字缺乏上下文与交互</strong>
              <p>
                "39剧本集、1334 PDF剧本、4行当大类、8+细分行当"作为孤立数字出现，无法直接从这里跳转到对应数据集或详细分布。建议将数字改为可点击的跳转链接或展开面板，加入简短的趋势指示或数据最后更新时间，提升数字的可信度与可用性。
              </p>
            </div>
          </div>

          <div className="feedback-item">
            <span className="feedback-item-num">9</span>
            <div className="feedback-item-body">
              <strong>"使用说明"与"典型发现"和主内容争夺注意力</strong>
              <p>
                说明文字与核心图表并列放置，占据了与雷达图相当的视觉空间，对于已熟悉工具的用户是冗余的。建议将"使用说明"折叠为可展开的"?"图标或侧边抽屉；"典型发现"改为悬浮在图表上的高亮标注气泡，直接指向图中对应的角色线条。
              </p>
            </div>
          </div>
        </section>

      </div>
    </Modal>
  );
}

export default FeedbackModal;
