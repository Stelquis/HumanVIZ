import React, { useState } from "react";
import { dashStore } from "../../stores/dashStore";
import InfinityRiver from "./InfinityRiver";
import { EDU_CARDS } from "../../utils/liyuanData";
import "../../styles/liyuan.scss";

const LiyuanOverview: React.FC = () => {
  const { setOverviewModalOpened } = dashStore();
  const [eduModalTab, setEduModalTab] = useState<string | null>(null);
  const eduModalOpen = eduModalTab !== null;
  const eduCard = EDU_CARDS.find((c) => c.id === eduModalTab);

  return (
    <div className="ly-screen">
      {/* ═══════ Topbar ═══════ */}
      <header className="ly-topbar">
        <div className="ly-topbar-left">
          <h1 className="ly-topbar-title">
            <span className="ly-brand-icon">🎭</span> 梨 园 万 象
          </h1>
          <span className="ly-topbar-desc">
            一四七三梨园本，四大行当列作星。戏台方寸照今古，演尽人间悲与欢。
          </span>
        </div>

        <div className="ly-topbar-actions">
          <button className="ly-top-btn" onClick={() => setEduModalTab("roles")}>
            🎓 京剧科普
          </button>
          <button
            className="ly-top-btn ly-top-btn--primary"
            onClick={() => setOverviewModalOpened(true)}
          >
            About HumanVIZ
          </button>
        </div>
      </header>

      {/* ═══════ 主面板：三栏布局 ═══════ */}
      <main className="ly-main-panel">
        <div className="ly-main-header">
          <span className="ly-main-icon">📊</span>
          <span className="ly-main-title">京剧三百年：行当格局的时代演变</span>
          <span className="ly-main-desc">
            — 从乾隆朝到现代，生旦净丑四大行当的比例消长折射了京剧美学的深层变迁 —
          </span>
        </div>

        {/* ── ∞ 戏韵长河：1473 剧本粒子流动 + 双图表嵌入 ── */}
        <InfinityRiver />

        {/* ── 底部趋势总结（横跨全宽） ── */}
        <div className="ly-main-insight">
          <span className="ly-insight-label">💡 关键趋势</span>
          <span className="ly-insight-text">
            生行由清中期的绝对主导（48%）降至现代的 34%；旦行从清末民初崛起，至民国中后期超越生行（36% vs 35%）；
            净丑二行稳中有升，现代各行当趋于均衡——京剧从「行当中心」向「角色中心」演化。
          </span>
        </div>
      </main>

      {/* ═══════ Footer ═══════ */}
      <footer className="ly-footer">
        <div className="ly-footer-bar">
          <div className="ly-footer-left">
            <span>📜 1,473 京剧剧本</span>
            <span className="ly-footer-divider">|</span>
            <span>🎭 6,785 登场角色</span>
            <span className="ly-footer-divider">|</span>
            <span>🎪 生旦净丑 四大行当</span>
            <span className="ly-footer-divider">|</span>
            <span>⏳ 清乾隆至今 跨越三百年</span>
          </div>
          <div className="ly-footer-right">
            <span className="ly-footer-quote">唱不尽兴亡梦幻，弹不尽悲伤感慨。</span>
          </div>
        </div>
      </footer>

      {/* ═══════ 京剧科普弹窗 ═══════ */}
      {eduModalOpen && eduCard && (
        <div className="ly-edu-overlay" onClick={() => setEduModalTab(null)}>
          <div className="ly-edu-modal" onClick={(e) => e.stopPropagation()}>
            {/* 左侧：四个 tab 按钮 */}
            <nav className="ly-edu-nav">
              <div className="ly-edu-nav-title">🎓 京剧知识入门</div>
              {EDU_CARDS.map((c) => (
                <button
                  key={c.id}
                  className={`ly-edu-nav-btn ${eduModalTab === c.id ? "active" : ""}`}
                  onClick={() => setEduModalTab(c.id)}
                >
                  <span className="ly-edu-nav-icon">{c.icon}</span>
                  <span>{c.title}</span>
                </button>
              ))}
            </nav>

            {/* 右侧：内容区 */}
            <div className="ly-edu-content">
              <div className="ly-edu-content-header">
                <span className="ly-edu-content-icon">{eduCard.icon}</span>
                <h2>{eduCard.title}</h2>
                <span className="ly-edu-content-sub">{eduCard.subtitle}</span>
                <button className="ly-edu-content-close" onClick={() => setEduModalTab(null)}>✕</button>
              </div>
              <div className="ly-edu-content-body">
                {eduCard.content.map((section, si) => (
                  <div key={si} className="ly-edu-section">
                    <h4>{section.heading}</h4>
                    <p>{section.body}</p>
                    {section.items && (
                      <div className="ly-edu-items">
                        {section.items.map((item, ii) => (
                          <div key={ii} className="ly-edu-item">
                            <span className="ly-edu-item-label">{item.label}</span>
                            <span className="ly-edu-item-desc">{item.desc}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LiyuanOverview;
