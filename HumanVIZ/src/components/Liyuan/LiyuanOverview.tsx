import React, { useState, useCallback } from "react";
import { dashStore } from "../../stores/dashStore";
import InfinityRiver from "./InfinityRiver";
import { EDU_CARDS, OVERVIEW_INSIGHTS } from "../../utils/liyuanData";
import "./Liyuan.scss";

const LiyuanOverview: React.FC = () => {
  const { setOverviewModalOpened } = dashStore();
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [closing, setClosing] = useState(false);
  const [swipeDir, setSwipeDir] = useState<"right" | "left">("right");
  const [animKey, setAnimKey] = useState(0);

  const total = EDU_CARDS.length;
  const activeCard = activeIdx !== null ? EDU_CARDS[activeIdx] : null;

  const open = useCallback((idx: number) => {
    setActiveIdx((prev) => {
      if (prev !== null) setSwipeDir(idx > prev ? "right" : "left");
      return idx;
    });
    setAnimKey((k) => k + 1);
    setClosing(false);
  }, []);

  const goNext = useCallback(() => {
    if (activeIdx === null) return;
    const next = (activeIdx + 1) % total;
    setSwipeDir("right");
    setActiveIdx(next);
    setAnimKey((k) => k + 1);
  }, [activeIdx, total]);

  const goPrev = useCallback(() => {
    if (activeIdx === null) return;
    const prev = (activeIdx - 1 + total) % total;
    setSwipeDir("left");
    setActiveIdx(prev);
    setAnimKey((k) => k + 1);
  }, [activeIdx, total]);

  const close = useCallback(() => {
    setClosing(true);
    setTimeout(() => {
      setClosing(false);
      setActiveIdx(null);
    }, 280);
  }, []);

  const handleImageClick = useCallback((e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < rect.width / 2) goPrev();
    else goNext();
  }, [goPrev, goNext]);

  return (
    <div className="ly-screen">
      {/* ═══════ Topbar ═══════ */}
      <header className="ly-topbar">
        <div className="ly-topbar-left">
          <h1 className="ly-topbar-title">
            <span className="ly-brand-icon">🎭</span> 梨 园 万 象
          </h1>
          <span className="ly-topbar-desc">
            一四七三梨园本，四大行当列作星。六代汇编照今古，演尽人间悲与欢。
          </span>
        </div>

        <div className="ly-topbar-actions">
          <button className="ly-top-btn" onClick={() => open(0)}>
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
          <span className="ly-main-title">梨园万象：六代编辑出版中的行当格局</span>
          <span className="ly-main-desc">
            — 从民国汇编到现代创作，按编辑出版年代追踪生旦净丑四大行当的结构特征 —
          </span>
        </div>

        {/* ∞ 戏韵长河：1473 剧本粒子流动 + 双图表嵌入 */}
        <InfinityRiver />

        {/* 底部趋势总结（横跨全宽） */}
        <div className="ly-main-insight">
          <span className="ly-insight-label">💡 关键洞察</span>
          <span className="ly-insight-text">
            {OVERVIEW_INSIGHTS[0]?.text ||
              "从民国汇编本到新中国整理本，角色规模从12→18人，场景从7→11场——不同编辑出版时代的剧本在规模、题材偏好和结构特征上呈现出系统性差异。"}
          </span>
        </div>
      </main>

      {/* ═══════ Footer ═══════ */}
      <footer className="ly-footer">
        <div className="ly-footer-bar">
          <div className="ly-footer-left">
            <span>📜 1,473 京剧剧本</span>
            <span className="ly-footer-divider">|</span>
            <span>🎭 7,896 角色人次</span>
            <span className="ly-footer-divider">|</span>
            <span>👤 3,581 独立角色</span>
            <span className="ly-footer-divider">|</span>
            <span>🎪 生旦净丑 四大行当</span>
            <span className="ly-footer-divider">|</span>
            <span>📚 6 个编辑出版年代</span>
          </div>
          <div className="ly-footer-right">
            <span className="ly-footer-quote">唱不尽兴亡梦幻，弹不尽悲伤感慨。</span>
          </div>
        </div>
      </footer>

      {/* ═══════ 移动端悬浮底栏 ═══════ */}
      <div className="ly-floating-bar">
        <button className="ly-float-btn" onClick={() => open(0)}>
          🎓 京剧科普
        </button>
        <button
          className="ly-float-btn ly-float-btn--primary"
          onClick={() => setOverviewModalOpened(true)}
        >
          About HumanVIZ
        </button>
      </div>

      {/* ═══════ 京剧科普弹窗 — 沉浸式全屏图片阅览 ═══════ */}
      {activeCard && (
        <div
          className={`ly-edu-overlay${closing ? " ly-edu-overlay--closing" : ""}`}
          onClick={close}
        >
          <div
            className={`ly-edu-modal${closing ? " ly-modal--closing" : ""}`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 浮动关闭按钮 */}
            <button className="ly-edu-close" onClick={close} aria-label="关闭">✕</button>

            {/* 图片区：左半点击上一页 / 右半点击下一页 */}
            <div className="ly-edu-image-area" onClick={handleImageClick}>
              <img
                key={animKey}
                src={activeCard.image}
                alt={activeCard.title}
                className={`ly-edu-image ly-edu-swipe--${swipeDir}`}
              />

              {/* 左右翻页热区提示（hover 显示） */}
              <div className="ly-edu-nav-zone ly-edu-nav--prev" />
              <div className="ly-edu-nav-zone ly-edu-nav--next" />
              <span className="ly-edu-arrow ly-edu-arrow--prev">◂</span>
              <span className="ly-edu-arrow ly-edu-arrow--next">▸</span>
            </div>

            {/* 底部：标题 | ◂ ▸ | 页码指示器 */}
            <div className="ly-edu-footer">
              <div className="ly-edu-footer-info">
                <span className="ly-edu-footer-icon">{activeCard.icon}</span>
                <span className="ly-edu-footer-title">{activeCard.title}</span>
                <span className="ly-edu-footer-sub">{activeCard.subtitle}</span>
              </div>
              <div className="ly-edu-footer-nav">
                <button className="ly-edu-nav-btn" onClick={goPrev} aria-label="上一页">◂</button>
                <button className="ly-edu-nav-btn" onClick={goNext} aria-label="下一页">▸</button>
              </div>
              <div className="ly-edu-dots">
                {EDU_CARDS.map((_, i) => (
                  <button
                    key={i}
                    className={`ly-edu-dot${i === activeIdx ? " active" : ""}`}
                    onClick={() => open(i)}
                    aria-label={EDU_CARDS[i].title}
                  />
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
