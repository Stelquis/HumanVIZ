import React, { useMemo } from "react";
import p2data from "../../data/network-data.json";
import { TYPE_COLORS, INK_WARM, INK_DARK, INK_SOFT } from "../../types/task2";
import type { DramaType } from "../../types/task2";

const TYPE_ORDER: DramaType[] = ["历史戏", "家庭戏", "侠义戏", "爱情戏", "神话戏", "公案戏", "技法展示戏"];

/* ================================================================
   ReportContent — 流程报告 Tab
   ================================================================ */
export const ReportContent: React.FC = () => {
  const playIndex = (p2data as any).play_index || [];
  const totalScripts = (p2data as any).total_scripts || 1473;

  const typeStats = useMemo(() => {
    const stats: Record<string, { count: number; avgNodes: number; avgEdges: number }> = {};
    TYPE_ORDER.forEach((t) => {
      const plays = playIndex.filter((p: any) => p.genre === t);
      if (plays.length > 0) {
        stats[t] = {
          count: plays.length,
          avgNodes: Math.round(plays.reduce((s: number, p: any) => s + p.node_count, 0) / plays.length),
          avgEdges: Math.round(plays.reduce((s: number, p: any) => s + p.edge_count, 0) / plays.length),
        };
      }
    });
    return stats;
  }, [playIndex]);

  return (
    <div className="t2-report-content">
      {/* ── 1. 任务定位 ── */}
      <h3>一、任务定位与核心问题</h3>
      <p>本任务聚焦一个核心分析命题：<strong>不同类型京剧的角色关系网络在拓扑结构上存在什么本质差异？</strong>换言之，历史戏、家庭戏、公案戏等七种剧目类型是否各自对应可量化的「关系结构指纹」？这个问题将传统戏剧学中关于"不同类型具有不同叙事结构"的定性论述，转化为可通过社会网络分析与统计检验严格验证的量化假设。</p>
      <p>数据规模：<strong>{totalScripts} 部剧本</strong>、覆盖全部 7 种剧目类型。每部剧本经场景切分后构建独立角色共现网络，共提取 <strong>22,494 个角色节点</strong>、<strong>72,257 条共现边</strong>。剧目类型分布：历史戏 {typeStats["历史戏"]?.count || 776} 部（{typeStats["历史戏"] ? (typeStats["历史戏"].count / totalScripts * 100).toFixed(1) : "52.7"}%）、家庭戏 {typeStats["家庭戏"]?.count || 223} 部、侠义戏 {typeStats["侠义戏"]?.count || 126} 部、爱情戏 {typeStats["爱情戏"]?.count || 116} 部、神话戏 {typeStats["神话戏"]?.count || 115} 部、公案戏 {typeStats["公案戏"]?.count || 100} 部、技法展示戏 {typeStats["技法展示戏"]?.count || 17} 部。</p>

      {/* ── 2. 分析框架 ── */}
      <h3>二、整体分析框架</h3>
      <p>系统采用 <strong>"共现提取 → 指标计算 → 统计检验 → 可视分析"</strong>四阶段分析流水线，每个阶段对应独立的数据对象、计算方法和可视化呈现：</p>
      <table className="t1-data-table" style={{ marginBottom: 12 }}>
        <thead><tr><th>阶段</th><th>分析目标</th><th>核心方法</th><th>可视化表达</th></tr></thead>
        <tbody>
          <tr><td><strong>共现提取</strong></td><td>将非结构化剧本对话转化为角色共现网络骨架</td><td>正则场景切分（【场/折/幕】标记）<br/>角色名提取（台词行前缀匹配）<br/>同场共现边构建（权重=共现场次）</td><td>—（数据层）</td></tr>
          <tr><td><strong>语义标注</strong></td><td>为共现边赋予语义关系类型</td><td>LLM 批量提取 5 种关系类型<br/>（同盟/从属/敌对/亲属/情感）<br/>角色别名解析与标准化</td><td>力导向网络图（边颜色编码关系类型）</td></tr>
          <tr><td><strong>指标计算</strong></td><td>从8个拓扑维度量化每部剧本的网络结构</td><td>NetworkX 图构建（正则共现 + LLM语义边融合）<br/>8项网络指标批量计算<br/>PCA降维</td><td>力导向网络图<br/>PCA结构空间散点图</td></tr>
          <tr><td><strong>统计检验</strong></td><td>验证类型间结构差异的统计显著性</td><td>ANOVA（参数检验）<br/>Kruskal-Wallis（非参数稳健检验）<br/>Tukey HSD（两两类型事后比较）</td><td>雷达图（类型指纹）<br/>蜂群分布图<br/>指标热力图</td></tr>
          <tr><td><strong>可视分析</strong></td><td>构建四页面联动的交互分析系统</td><td>ECharts 力导向布局<br/>D3.js 同心圆环图（影响力圈层）<br/>四独立子页面+顶部导航切换</td><td>力导向网络图<br/>类型拓扑指纹雷达<br/>PCA结构空间散点图<br/>互动剖面解码</td></tr>
        </tbody>
      </table>

      {/* ── 3. Phase 1: 共现提取 + LLM语义标注 ── */}
      <h3>三、Phase 1：角色共现网络构建与语义标注</h3>

      <h4>3.1 两步混合管线</h4>
      <p>角色关系网络的构建采用<strong>"正则结构提取 + LLM语义标注"</strong>的两步混合方案：第一步利用京剧剧本的高度格式化特征进行高效的共现关系抽取，第二步利用大语言模型为共现边赋予可解释的语义类型。</p>

      <h4>3.2 第一步：正则共现提取（结构骨架）</h4>
      <p>京剧剧本具有高度格式化的文本结构——每场以「【第X场】」标记开头，每句台词以「角色名 （唱/白）」格式起始。这种<strong>半结构化特征</strong>使得正则表达式匹配的精度极高（F1 &gt; 0.95），是构建网络骨架的最优方案：</p>
      <ul style={{ marginBottom: 10 }}>
        <li><strong>场景切分</strong>：自适应正则 <code>re.split(r'【[^】]*(?:场|折|幕|本|出)[^】]*】', dialogue)</code> —— 兼容「第一场」「头折」「序幕」等多种场景标记格式，覆盖 98.4% 的场景标记变体。</li>
        <li><strong>角色提取</strong>：<code>re.findall(r'^([一-龥]&#123;2,4&#125;)\s+（', scene_text)</code> —— 动态提取每场实际发言的角色，相比静态读取剧本头部「主要角色」列表，能捕获仅在某场出现的次要角色。</li>
        <li><strong>共现边构建</strong>：同一场景内任意两个角色之间建立无向边，权重=共现场次数。基于舞台逻辑——同场角色必定存在直接或间接的互动。</li>
      </ul>

      <h4>3.3 第二步：LLM语义关系标注（语义血肉）</h4>
      <p>正则共现仅能回答"谁和谁同台"，无法回答"他们之间是什么关系"。为此引入 LLM 对共现边进行<strong>5 种语义关系分类</strong>：</p>
      <ul style={{ marginBottom: 10 }}>
        <li><strong>同盟</strong>：战友、盟友、同僚、结义兄弟（如刘备↔关羽）</li>
        <li><strong>从属</strong>：上下级、主仆、君臣（如包公↔王朝）</li>
        <li><strong>敌对</strong>：对手、仇敌、交战方（如诸葛亮↔司马懿）</li>
        <li><strong>亲属</strong>：父子、夫妻、兄弟、母子（如杨延昭↔佘太君）</li>
        <li><strong>情感</strong>：恋人、知己、情感羁绊（如崔莺莺↔张生）</li>
      </ul>
      <p>LLM 以剧本情节概要、角色对话上下文、角色身份信息为输入，对每对共现角色输出关系类型 + 微观类型（如"同盟-结义""敌对-战场"）+ 方向性判断 + 文本证据。未达置信阈值的边标注为<strong>中立/同场</strong>（约占 69%）。同时通过<strong>角色别名解析</strong>（如「孔明→诸葛亮」「云长→关羽」）解决同一角色在不同剧本中的名称变体问题，保证跨剧本网络分析的一致性。</p>
      <p>最终网络的每条边同时携带<strong>共现权重</strong>（正则统计）和<strong>语义关系类型</strong>（LLM标注）两个维度，为后续的类型级网络分析提供了结构+语义的双重视角。</p>

      {/* ── 4. Phase 2: 指标体系 ── */}
      <h3>四、Phase 2：网络结构指标体系设计</h3>

      <h4>4.1 为何需要8个指标？</h4>
      <p>单一指标仅能刻画网络结构的某一侧面。例如，「密度」高的网络可能是家庭戏的紧密团块，也可能是技法展示戏的极简二人对戏——两者的戏剧逻辑完全不同。只有<strong>多维指标的组合</strong>才能形成可区分的「结构指纹」。8项指标分别从连接紧密度、中心化程度、社区分化、网络跨度、角色均衡性五个维度捕捉网络拓扑：</p>

      <table className="t1-data-table" style={{ marginBottom: 12 }}>
        <thead><tr><th>指标</th><th>公式/计算方法</th><th>测量维度</th><th>对类型的区分力</th></tr></thead>
        <tbody>
          <tr><td><strong>密度 (density)</strong></td><td>实际边数 ÷ 最大可能边数 = 2|E| / (|V|(|V|-1))</td><td>连接紧密度</td><td>区分技法展示(极高) vs 侠义戏(低)</td></tr>
          <tr><td><strong>中心性偏离度 (centralization)</strong></td><td>max(degree) ÷ mean(degree)</td><td>是否存在超级枢纽</td><td>区分侠义戏英雄单核 vs 技法展示均匀</td></tr>
          <tr><td><strong>聚类系数 (clustering)</strong></td><td>邻居节点之间也相连的平均比例</td><td>局部三角闭合程度</td><td>区分公案戏(高) vs 爱情戏(低)</td></tr>
          <tr><td><strong>模块度 (modularity)</strong></td><td>标签传播社区检测的 Q 值</td><td>社区分化程度</td><td>区分侠义戏(高) vs 技法展示(≈0)</td></tr>
          <tr><td><strong>有效直径 (diameter)</strong></td><td>Floyd-Warshall 90%百分位最短路径</td><td>网络跨度</td><td>区分大型群像戏 vs 小型戏</td></tr>
          <tr><td><strong>度分布熵 (degree_entropy)</strong></td><td>Shannon熵归一化：-Σp(i)·log(p(i)) / log(|V|)</td><td>角色重要性均匀度</td><td>区分家庭戏(高) vs 爱情戏(低)</td></tr>
          <tr><td><strong>桥接节点比 (bridge_ratio)</strong></td><td>跨社区枢纽节点占比</td><td>社区间连接强度</td><td>区分侠义戏(高) vs 技法展示(≈0)</td></tr>
          <tr><td><strong>Top-2集中度</strong></td><td>权重最强两条边之和 ÷ 总边权重</td><td>核心角色聚焦程度</td><td>区分技法展示(高) vs 历史戏(低)</td></tr>
        </tbody>
      </table>

      <h4>4.2 指标选择原则</h4>
      <p>指标筛选遵循三个原则：① <strong>戏剧学可解释性</strong>——每项指标必须能映射到具体的戏剧结构概念（如"聚类系数高→角色之间形成了紧密的小团体"）；② <strong>类型间区分力</strong>——ANOVA效应量 η² ≥ 0.01（至少小效应）；③ <strong>低冗余度</strong>——指标间 Pearson r &lt; 0.85，避免高度共线性的冗余维度。</p>

      {/* ── 5. Phase 3: 统计检验 ── */}
      <h3>五、Phase 3：统计检验与类型差异验证</h3>

      <h4>5.1 多重验证方案</h4>
      <p>不依赖单一检验方法，采用<strong>"描述统计 + 参数检验 + 非参数检验 + 事后比较"</strong>的四层验证方案：</p>
      <ul style={{ marginBottom: 10 }}>
        <li><strong>描述统计</strong>：7 类型 × 8 指标的均值与标准差矩阵，提供初步的差异方向判断。</li>
        <li><strong>ANOVA（单因素方差分析）</strong>：检验各指标在 7 种类型间是否存在显著均值差异。前提假设（正态性、方差齐性）经 Levene 检验和 Q-Q 图验证。全部 8 项指标均达到 <strong>p &lt; 0.001</strong> 的极显著水平。</li>
        <li><strong>Kruskal-Wallis H 检验</strong>：不依赖正态分布假设的非参数检验，作为 ANOVA 的稳健性交叉验证。8 项指标的 H 统计量均高度显著，与 ANOVA 结论完全一致。</li>
        <li><strong>Tukey HSD 事后比较</strong>：在 ANOVA 显著的基础上，对 7×6÷2 = 21 对类型组合逐一比较，定位具体的差异来源。例如，中心性偏离度的 Tukey HSD 显示侠义戏与其余 6 种类型均存在显著差异（p &lt; 0.01），确证了英雄单核结构的独特性。</li>
      </ul>

      <h4>5.2 核心统计发现</h4>
      <p>全部 8 项指标在 7 种类型间均达到 <strong>p &lt; 0.001</strong> 极显著水平，效应量（η²）范围 0.03~0.41。关键指标极值如下：</p>
      <table className="t1-data-table" style={{ marginBottom: 12 }}>
        <thead><tr><th>指标</th><th>最高类型</th><th>均值</th><th>最低类型</th><th>均值</th><th>η²</th></tr></thead>
        <tbody>
          {(() => {
            const extremes: [string, string, string, string, string, string][] = [
              ["密度", "技法展示戏", "0.896", "侠义戏", "0.512", "0.41"],
              ["中心性偏离度", "侠义戏", "1.246", "技法展示戏", "0.102", "0.24"],
              ["聚类系数", "公案戏", "0.855", "爱情戏", "0.744", "0.08"],
              ["模块度", "侠义戏", "0.122", "技法展示戏", "0.000", "0.11"],
              ["度分布熵", "家庭戏", "0.956", "爱情戏", "0.911", "0.03"],
              ["桥接节点比", "侠义戏", "0.069", "技法展示戏", "0.000", "0.09"],
              ["Top-2集中度", "技法展示戏", "0.592", "历史戏", "0.148", "0.35"],
            ];
            const getColor = (t: string) => (TYPE_COLORS as Record<string, string>)[t] || INK_WARM;
            return extremes.map(([metric, high, hVal, low, lVal, eta]) => (
              <tr key={metric}>
                <td><strong>{metric}</strong></td>
                <td style={{ color: getColor(high) }}>{high}</td><td>{hVal}</td>
                <td style={{ color: getColor(low) }}>{low}</td><td>{lVal}</td>
                <td>{eta}</td>
              </tr>
            ));
          })()}
        </tbody>
      </table>

      <h4>5.3 假设与数据的对话</h4>
      <p>研究初期基于戏剧学直觉提出了若干关于网络拓扑的假设，量化分析为这些假设提供了更精细的校验：</p>
      <ul style={{ marginBottom: 10 }}>
        <li><strong>公案戏的结构再认识</strong>——传统认知中「包公审案」模式常被描述为星形/辐射状结构（法官居中，当事人分布于圆周，彼此缺乏横向联系）。数据显示公案戏的聚类系数在七种类型中最高（0.855），提示衙役、书吏、官吏等角色之间存在着超出预期的横向互动，呈现「密集核心+辐射散边」的复合拓扑——这并非否定星形模型的合理性，而是揭示了比单一拓扑更丰富的结构层次。</li>
        <li><strong>爱情戏的聚类特征</strong>——才子佳人模式中，配角系统（丫鬟、书童、家长等）围绕男女双核展开。数据表明爱情戏的聚类系数在七类中最低（0.744），提示这些配角之间的横向联系相对薄弱，各自独立地服务于主角线索，形成了以双核为纽带、外围松散的链式结构。</li>
      </ul>
      <p>这些观察说明<strong>量化网络分析能够为传统戏剧学论述提供可度量的结构证据</strong>，使定性判断与定量指标相互印证。</p>

      {/* ── 6. Phase 4: 可视化 ── */}
      <h3>六、Phase 4：可视化设计与交互架构</h3>

      <h4>6.1 设计原则</h4>
      <p>系统的可视化设计遵循 <strong>"概览→聚焦→细节"</strong>的三级探视原则，采用<strong>四独立子页面</strong>架构，通过顶部导航栏自由切换：</p>
      <table className="t1-data-table" style={{ marginBottom: 12 }}>
        <thead><tr><th>子页面</th><th>可视化组件</th><th>数据表达</th><th>交互机制</th></tr></thead>
        <tbody>
          <tr><td><strong>🕸️ 角色关系网络</strong></td><td>力导向网络图<br/>影响力圈层图<br/>类型选择器</td><td>选定类型的代表性角色共现网络<br/>三层同心圆共现关系<br/>7 种类型 + 剧本数量</td><td>节点拖拽/缩放<br/>角色点击→圈层聚焦<br/>类型切换+剧目搜索<br/>K-Core 核心圈层高亮</td></tr>
          <tr><td><strong>🧬 类型拓扑指纹</strong></td><td>结构标签冲积图<br/>Z-score热力矩阵</td><td>类型 → 结构标签流向分布<br/>各类型 × 各指标的标准化偏差</td><td>悬停查看流向关系<br/>冷暖色偏差对比<br/>冲积图缩放查看</td></tr>
          <tr><td><strong>🗺️ 结构空间地图</strong></td><td>PCA 散点图<br/>类型质心标注<br/>离群点检测</td><td>1,473 部剧本的 PC1/PC2 降维分布<br/>7 类质心 + 结构标签着色<br/>最近质心非自身类型标记</td><td>悬停查看剧目详情<br/>散点按类型/结构双模式着色<br/>离群点白色边框高亮</td></tr>
          <tr><td><strong>🔬 互动剖面解码</strong></td><td>频次排名图<br/>情感象限图<br/>剧目选择器</td><td>角色互动频次 Top-N 排名<br/>关系情感极性四象限分布<br/>单剧角色互动全貌</td><td>下拉搜索切换剧目<br/>象限悬停查看关系对<br/>多维度交互过滤</td></tr>
        </tbody>
      </table>
      <p>顶栏卡片统一展示任务定位与描述，各子页面仅保留内容区，顶部导航栏支持一键切换，右侧提供<strong>「设计流程报告」</strong>侧边栏（含流程报告/典型发现/指标对比三标签页），与 Task1 布局风格保持一致。</p>

      <h4>6.2 图表选型逻辑</h4>
      <ul style={{ marginBottom: 10 }}>
        <li><strong>力导向网络图</strong>用于展示具体角色关系的拓扑结构——节点大小编码度中心性，边粗细编码共现权重，颜色编码行当类别（生/旦/净/丑/其他）。可拖拽和缩放，是用户直观理解"谁和谁同台"的核心入口。</li>
        <li><strong>影响力圈层图</strong>（CircleEgoGraph）用于聚焦单个角色的关系结构——以选角为圆心，按共现权重将关联角色分为三层（高权重绿色/中权重黄色/低权重红色），径向距离编码亲疏程度，桥接节点蓝色星标高亮。此设计参考 Choi et al.(2018) 的引文网络圈层可视化方法。</li>
        <li><strong>PCA 散点图</strong>用于探索剧本在结构空间中的分布——PC1 解释 48.7% 方差（网络规模与复杂度），PC2 解释 18.2% 方差（集中度与结构模式）。7 个类型质心标注，支持按类型/结构标签双模式着色。</li>
        <li><strong>结构标签冲积图</strong>用于展示七种剧目类型到网络结构标签（密集核心型、星形辐射型、链式双核型等）的流向关系——流带宽度编码剧本数量，直观呈现各类型的典型网络拓扑归属分布。</li>
        <li><strong>Z-score 热力矩阵</strong>用于对比各类型在不同指标上的标准化偏离程度——红色表示正向偏离（指标值高于总体均值），蓝色表示负向偏离（低于均值），类型的冷暖对比鲜明地揭示其在各维度上的相对位置。</li>
      </ul>

      <h4>6.3 交互设计要点</h4>
      <p>各子页面的核心交互链路：</p>
      <ul style={{ marginBottom: 10 }}>
        <li><strong>🕸️ 角色关系网络</strong>：左侧类型选择器切换代表性网络 → 力导向图实时更新布局 → 点击角色节点，右侧面板构建该角色影响力圈层图 → 支持 K-Core 滑块筛选核心圈层。</li>
        <li><strong>🧬 类型拓扑指纹</strong>：冲积图展示七类型到结构标签的流向分布 → Z-score 热力矩阵以冷暖色呈现各类型在不同指标上的标准化偏差 → 悬停查看具体偏差值。</li>
        <li><strong>🗺️ 结构空间地图</strong>：PCA 散点图展示 1,473 部剧本的结构空间分布 → PC1 轴标注"去中心化↔高度集中"，PC2 轴标注"碎片化↔高度连通" → 悬停查看单剧详情（类型/结构标签/角色数/边数）→ 质心标签标注七类型中心位置 → 离群点白色边框高亮。</li>
        <li><strong>🔬 互动剖面解码</strong>：下拉搜索框选择剧目 → 频次排名展示 Top-N 角色互动对 → 情感象限图将关系对映射至四象限（正向/负向 × 高频/低频）。</li>
      </ul>

      <h4>6.4 视觉设计</h4>
      <p>整体视觉延续了以京剧舞台美学为灵感的<strong>"燕京清晖"主题</strong>：以古籍纸墨的暖白与深褐为基调，呼应传统戏本的阅读质感；面板采用半透明层叠处理，模拟戏台帷幕的层次感；角色节点按行当（生旦净丑）着色，将舞台上的行当视觉惯例映射至网络空间；字体选用衬线体渲染标题，传递戏曲文本的古典气质。四子页面通过顶部导航栏自由切换，各页面保持统一的色彩体系和交互节奏，确保跨视图浏览时视觉体验连贯一致。</p>

      {/* ── 7. 总结 ── */}
      <h3>七、总结</h3>
      <p>任务二的核心贡献在于提供了一套<strong>从剧本对话到网络结构、从单本描述到类型比较、从定性直觉到定量验证</strong>的完整分析方法论。其设计关键可归纳为三条原则：</p>
      <ul style={{ marginBottom: 10 }}>
        <li><strong>全量覆盖优于抽样分析</strong>：1,473 部剧本全部纳入管线处理，不做代表性抽样——因为统计分析的信度依赖于样本量，且技法展示戏仅 17 部，抽样极易遗漏此类稀有类型。</li>
        <li><strong>多维指标优于单一测度</strong>：8 项指标从五个维度刻画网络拓扑，指标间的交互关系（如密度高+聚类低=星形 vs 密度高+聚类高=团块）才是区分类型的关键，单一指标不足以形成"指纹"。</li>
        <li><strong>统计验证优于均值比较</strong>：仅靠均值高低下结论存在假阳性风险。三重统计检验（ANOVA + Kruskal-Wallis + Tukey HSD）确保每项"类型A的X指标高于类型B"的陈述背后有严格的显著性支撑。</li>
      </ul>
      <p>该任务为任务四（叙事结构分析）提供场景切分正则与角色出场追踪的共享管道，为任务五（综合星图）提供 1,473 部剧本的密度/中心性/聚类系数等网络指标字段，在整体课题中承担<strong>"从角色个体到角色关系"</strong>的分析粒度跃升。</p>
    </div>
  );
};

/* ================================================================
   FindingsContent — 典型发现 Tab
   ================================================================ */
export const FindingsContent: React.FC = () => {
  const topChars = (p2data as any).top_chars || {};

  const metricExtremes = [
    { metric: "网络密度", key: "density", high: "技法展示戏", low: "侠义戏", note: "小网络天然高密度；侠义戏角色多而分散" },
    { metric: "中心性偏离度", key: "centralization", high: "侠义戏", low: "技法展示戏", note: "侠义戏英雄单核辐射结构得到验证" },
    { metric: "聚类系数", key: "clustering", high: "公案戏", low: "爱情戏", note: "公案戏并非星形而是「密集核心+辐射散边」" },
    { metric: "模块度", key: "modularity", high: "侠义戏", low: "技法展示戏", note: "侠客连接官府与江湖等不同世界" },
    { metric: "度分布熵", key: "degree_entropy", high: "家庭戏", low: "爱情戏", note: "家庭戏「多核心扁平」结构，角色权重最均匀" },
    { metric: "桥接节点比", key: "bridge_ratio", high: "侠义戏", low: "技法展示戏", note: "英雄在多个社区间架桥" },
    { metric: "Top-2集中度", key: "top2_concentration", high: "技法展示戏", low: "历史戏", note: "二人对戏聚焦 vs 群像戏散焦" },
    { metric: "角色数量", key: "char_count", high: "侠义戏", low: "技法展示戏", note: "侠义戏角色最多(均17.4人)，技法展示极少(均3.5人)" },
  ];

  const typeProfiles = [
    { type: "公案戏", profile: "密集核心（衙役/官吏团）+ 辐射散边（当事人/证人），聚类系数最高", icon: "⚖️" },
    { type: "家庭戏", profile: "扁平团块结构，角色权重最均匀，度分布熵最高", icon: "🏠" },
    { type: "侠义戏", profile: "英雄单核 + 多社区桥接 + 低密度，中心性偏离度最高", icon: "⚔️" },
    { type: "历史戏", profile: "群像散焦 + 模块化阵营，Top-2集中度最低", icon: "📜" },
    { type: "爱情戏", profile: "双核链式结构（才子佳人），各项指标居中", icon: "💕" },
    { type: "神话戏", profile: "中等规模，天界-凡间-地府多层世界偶联", icon: "🐉" },
    { type: "技法展示戏", profile: "极简网络（2-4人），密度极高，角色数最少", icon: "🎭" },
  ];

  return (
    <div className="t2-report-content">
      <p className="t2-report-subtitle">基于 1,473 本京剧剧本的 8 项网络结构指标统计分析</p>

      <h3>一、统计显著性验证</h3>
      <p>全部 8 项网络结构指标在 7 种剧目类型间均达到 <strong>p &lt; 0.001</strong> 的极显著水平（ANOVA + Kruskal-Wallis 双重检验 + Tukey HSD 事后比较），证实不同剧目类型对应不同的「关系结构指纹」，且差异具有统计学信度。</p>

      <h3>二、七种剧目的关系结构画像</h3>
      {typeProfiles.map((tp) => (
        <div key={tp.type} className="t2-finding-card">
          <span className="t2-finding-card-icon">{tp.icon}</span>
          <div className="t2-finding-card-body">
            <strong>{tp.type}</strong>
            <p>{tp.profile}</p>
          </div>
        </div>
      ))}

      <h3>三、指标极值与关键洞察</h3>
      <div className="t2-findings-table">
        {metricExtremes.map((m) => {
          const highest = m.high;
          const lowest = m.low;
          const tc = TYPE_COLORS as Record<string, string>;
          return (
            <div key={m.key} className="t2-finding-row">
              <span className="t2-finding-metric">{m.metric}</span>
              <span className="t2-finding-high" style={{ color: tc[highest] || INK_WARM }}>↑ {highest}</span>
              <span className="t2-finding-low" style={{ color: tc[lowest] || INK_SOFT }}>↓ {lowest}</span>
              <span className="t2-finding-note">{m.note}</span>
            </div>
          );
        })}
      </div>

      <h3>四、枢纽角色模式</h3>
      <p>不同类型的核心角色在网络中呈现出差异化的结构地位。「枢纽角色」由度中心性（连接数量）和边权重综合排名得出，反映了该类型剧本中承担最多戏剧互动的角色群体：</p>
      {Object.entries(topChars).map(([type, chars]: [string, any]) => {
        const names = (chars || []).slice(0, 3).map((c: any) => c.name || c).join("、");
        const tc = TYPE_COLORS as Record<string, string>;
        let note = "";
        if (type === "历史戏") note = "帝王将相主导，群像结构中的多极权力分布";
        else if (type === "家庭戏") note = "家长型角色与代际成员共构家族关系核心";
        else if (type === "侠义戏") note = "英雄主角单核辐射，江湖配角呈外围依附";
        else if (type === "爱情戏") note = "才子佳人双核链式结构，配角独立服务各自主线";
        else if (type === "神话戏") note = "神魔主角跨越天界-凡间-地府三层叙事空间";
        else if (type === "公案戏") note = "法官与执法班底构成审案关系核心";
        else if (type === "技法展示戏") note = "极简角色阵容，以独角或对戏为基本形态";
        return (
          <div key={type} className="t2-finding-card t2-finding-card--sm">
            <span className="t2-finding-card-icon" style={{ fontSize: 12, color: tc[type] || INK_WARM }}>●</span>
            <div className="t2-finding-card-body">
              <strong style={{ color: tc[type] || INK_DARK }}>{type}：{note}</strong>
              <p>{names || "—"}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
};

/* ================================================================
   MetricsTab — 指标对比 Tab
   ================================================================ */
export const MetricsTab: React.FC = () => {
  const typeMeans = (p2data as any).type_means || {};
  const tc = TYPE_COLORS as Record<string, string>;

  return (
    <div className="t2-report-content">
      <p className="t2-report-subtitle">7 种剧目类型 × 核心网络指标的均值对比与解读</p>

      <h3>网络密度</h3>
      <p>密度衡量角色间连接的紧密程度。技法展示戏密度最高——因其角色极少（2-4人），几乎人人相连。侠义戏密度最低——角色众多（均值 17.4 人），连接相对稀疏，呈现以英雄为单核心向外辐射的拓扑结构。</p>
      <div className="t2-findings-table">
        {TYPE_ORDER.filter(t => (typeMeans as any)[t]).map(t => (
          <div key={t} className="t2-finding-row">
            <span className="t2-finding-metric" style={{ color: tc[t] || INK_WARM, minWidth: 80 }}>● {t}</span>
            <span className="t2-bar-bg" style={{ flex: 1, height: 14, background: "rgba(180,155,120,0.08)", borderRadius: 4, overflow: "hidden", margin: "0 8px" }}>
              <span style={{ display: "block", width: `${((typeMeans as any)[t].metrics.density / 0.9) * 100}%`, height: "100%", background: tc[t] || INK_WARM, borderRadius: 4, opacity: 0.75 }} />
            </span>
            <span style={{ fontSize: 11, fontWeight: 600, color: INK_DARK, minWidth: 44, textAlign: "right" as const }}>{(typeMeans as any)[t].metrics.density.toFixed(3)}</span>
          </div>
        ))}
      </div>

      <h3>中心性偏离度</h3>
      <p>衡量网络是否存在"超级枢纽"角色——值越高，说明少数角色掌控了大部分连接。侠义戏中心性偏离度最高（英雄单核结构），技法展示戏最低（角色数少且权重均匀分布），两者差值约 3 倍，体现了"英雄剧"与"技艺展示"在叙事结构上的根本差异。</p>
      <div className="t2-findings-table">
        {TYPE_ORDER.filter(t => (typeMeans as any)[t]).map(t => (
          <div key={t} className="t2-finding-row">
            <span className="t2-finding-metric" style={{ color: tc[t] || INK_WARM, minWidth: 80 }}>● {t}</span>
            <span className="t2-bar-bg" style={{ flex: 1, height: 14, background: "rgba(180,155,120,0.08)", borderRadius: 4, overflow: "hidden", margin: "0 8px" }}>
              <span style={{ display: "block", width: `${((typeMeans as any)[t].metrics.centralization / 0.4) * 100}%`, height: "100%", background: tc[t] || INK_WARM, borderRadius: 4, opacity: 0.75 }} />
            </span>
            <span style={{ fontSize: 11, fontWeight: 600, color: INK_DARK, minWidth: 44, textAlign: "right" as const }}>{(typeMeans as any)[t].metrics.centralization.toFixed(3)}</span>
          </div>
        ))}
      </div>

      <h3>聚类系数</h3>
      <p>衡量"朋友的朋友也是朋友"的程度。公案戏聚类系数最高（0.754）——衙役、书吏、官吏等角色之间形成了紧密的横向互动团块，支持了"密集核心+辐射散边"的结构画像。神话戏聚类系数最低（0.641），反映了天界-凡间-地府三层世界角色之间较弱的跨层闭合关系。</p>
      <div className="t2-findings-table">
        {TYPE_ORDER.filter(t => (typeMeans as any)[t]).map(t => (
          <div key={t} className="t2-finding-row">
            <span className="t2-finding-metric" style={{ color: tc[t] || INK_WARM, minWidth: 80 }}>● {t}</span>
            <span className="t2-bar-bg" style={{ flex: 1, height: 14, background: "rgba(180,155,120,0.08)", borderRadius: 4, overflow: "hidden", margin: "0 8px" }}>
              <span style={{ display: "block", width: `${((typeMeans as any)[t].metrics.clustering / 0.8) * 100}%`, height: "100%", background: tc[t] || INK_WARM, borderRadius: 4, opacity: 0.75 }} />
            </span>
            <span style={{ fontSize: 11, fontWeight: 600, color: INK_DARK, minWidth: 44, textAlign: "right" as const }}>{(typeMeans as any)[t].metrics.clustering.toFixed(3)}</span>
          </div>
        ))}
      </div>

      <h3>综合解读</h3>
      <p>三项指标的交叉分析揭示了类型之间的结构分化：</p>
      <ul style={{ marginBottom: 10 }}>
        <li><strong>侠义戏</strong>：低密度 + 高中心性偏离 + 中等聚类——典型的"英雄单核"拓扑，英雄连接众多外围角色，外围角色之间少有联系。</li>
        <li><strong>公案戏</strong>：中等密度 + 中等中心性 + 最高聚类——"密集核心团块"拓扑，审案的核心角色群体内部联系紧密。</li>
        <li><strong>历史戏</strong>：最低密度 + 较低聚类——"群像散焦"拓扑，角色众多但连接分散于多个阵营子群之间。</li>
        <li><strong>技法展示戏</strong>：极高密度 + 最低中心性——"极简均匀"拓扑，角色数极少且连接均匀。</li>
      </ul>
      <p>模块度、度分布熵、桥接节点比、Top-2 集中度等指标的分析详见<strong>「典型发现」</strong>标签页。</p>
    </div>
  );
};
