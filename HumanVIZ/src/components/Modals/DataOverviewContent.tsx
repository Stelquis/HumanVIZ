import "./DataOverviewContent.scss";

interface DataOverviewContentProps {
  showProjectSidebar?: boolean;
}

function DataOverviewContent({ showProjectSidebar = true }: DataOverviewContentProps) {
  return (
    <div className="about-modal-layout">
      {showProjectSidebar && (
        <div className="about-two-col">
          {/* 左列：介绍 + 比赛背景 */}
          <aside className="about-intro">
            <div className="about-intro-header">
              <span className="about-intro-icon">🏆</span>
              <h2>ChinaVIS 2026</h2>
              <p className="about-intro-sub">可视分析挑战赛</p>
            </div>

            <p className="about-intro-desc">
              🌐 比赛官网：
              <a href="https://chinavis.org/2026" target="_blank" rel="noreferrer">
                ChinaVIS 2026 挑战赛征稿通知
              </a>
            </p>

            <div className="about-intro-section">
              <h4>📜 赛道 I：数据可视化与人文创意赛</h4>
              <h5>比赛背景</h5>
              <p>
                京剧作为中国传统戏曲艺术的重要代表，融合了文学、表演、音乐、美术与历史文化等多重元素，承载着丰富的人物塑造、叙事结构与文化表达。大量京剧剧本不仅记录了经典舞台艺术的演化过程，也反映了不同时代背景下的社会观念、价值体系与审美特征。
              </p>
              <p>
                本赛题基于京剧剧本数据集，鼓励参赛者结合自然语言处理、复杂网络分析、时序分析与可视化等方法，从人物关系、主题表达、叙事结构以及版本演化等多个角度，对京剧剧本展开系统分析与可视化探索。
              </p>
            </div>
          </aside>

          {/* 右列：任务列表 + 数据来源 */}
          <aside className="about-intro">
            <div className="about-intro-section">
              <h5>任务一：「戏韵万象」京剧数据可视分析挑战赛</h5>
              <div className="about-competition-table">
                <table>
                  <thead>
                    <tr>
                      <th>任务</th>
                      <th>主题</th>
                      <th>核心问题</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Task 1</td>
                      <td>角色-行当分类与时代变迁分析</td>
                      <td>基于角色特征推断行当归属，分析不同时期角色-行当对应关系的变化规律</td>
                    </tr>
                    <tr>
                      <td>Task 2</td>
                      <td>角色关系网络与剧目类型分析</td>
                      <td>识别主要角色互动关系，分析不同剧目类型的网络结构特征</td>
                    </tr>
                    <tr>
                      <td>Task 3</td>
                      <td>剧本主题提取与跨剧本比较</td>
                      <td>提取核心主题，分析不同剧本的主题构成及组合方式</td>
                    </tr>
                    <tr>
                      <td>Task 4</td>
                      <td>叙事结构分析与模式总结</td>
                      <td>识别剧情发展关键阶段，刻画剧情起伏与节奏变化</td>
                    </tr>
                    <tr>
                      <td>Task 5</td>
                      <td>多维综合分析与交互系统构建</td>
                      <td>综合角色关系、主题结构与叙事结构，构建可交互可视分析系统</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="about-intro-section">
              <h4>📊 数据来源</h4>
              <p>本赛事数据集为京剧剧本数据集，包含：</p>
              <div className="about-competition-table">
                <table>
                  <thead>
                    <tr>
                      <th>类别</th>
                      <th>数量</th>
                      <th>说明</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>综合剧目集</td>
                      <td>13 个文件夹，1195 PDF</td>
                      <td>《戏考》《国剧大成》《京剧汇编》《京剧丛刊》等</td>
                    </tr>
                    <tr>
                      <td>京剧名家剧本选</td>
                      <td>13 个文件夹，145 PDF</td>
                      <td>周信良、马连良、梅兰芳、程砚秋、荀慧生等</td>
                    </tr>
                    <tr>
                      <td>现代剧作家剧本选</td>
                      <td>5 个文件夹，14 PDF</td>
                      <td>田汉、老舍、翁偶虹等</td>
                    </tr>
                    <tr>
                      <td>昆曲剧本选</td>
                      <td>4 个文件夹，71 PDF</td>
                      <td>俞振飞、侯玉山等昆曲名家</td>
                    </tr>
                    <tr>
                      <td>其他剧本</td>
                      <td>3 个文件夹，51 PDF</td>
                      <td>录音唱片本、名家藏本、院团改编本</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="about-intro-note">
                <strong>总计：</strong>38 个压缩包，38 个文件夹，1473 个 PDF 剧本
              </p>
              <p className="about-intro-note">
                详细数据说明请查看：<code>Data.md</code>
              </p>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

export default DataOverviewContent;
