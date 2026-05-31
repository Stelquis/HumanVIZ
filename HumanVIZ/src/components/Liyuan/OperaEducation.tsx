import React, { useState } from "react";
import { EDU_CARDS } from "../../utils/liyuanData";

const OperaEducation: React.FC = () => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleCard = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="operedu-wrapper">
      <div className="operedu-header">
        <span className="operedu-title-icon">🎓</span>
        <span className="operedu-title">梨园科普角</span>
        <span className="operedu-subtitle">— 京剧基础知识入门 —</span>
      </div>
      <div className="operedu-cards">
        {EDU_CARDS.map((card) => {
          const isExpanded = expandedId === card.id;
          return (
            <div
              key={card.id}
              className={`operedu-card ${isExpanded ? "operedu-card--expanded" : ""}`}
            >
              <button
                className="operedu-card-trigger"
                onClick={() => toggleCard(card.id)}
                aria-expanded={isExpanded}
              >
                <span className="operedu-card-icon">{card.icon}</span>
                <span className="operedu-card-title">{card.title}</span>
                <span className="operedu-card-subtitle">{card.subtitle}</span>
                <span className={`operedu-card-arrow ${isExpanded ? "opened" : ""}`}>▾</span>
              </button>

              {isExpanded && (
                <div className="operedu-card-body">
                  {card.content.map((section, si) => (
                    <div key={si} className="operedu-section">
                      <h4 className="operedu-section-heading">{section.heading}</h4>
                      <p className="operedu-section-text">{section.body}</p>
                      {section.items && section.items.length > 0 && (
                        <div className="operedu-items">
                          {section.items.map((item, ii) => (
                            <div key={ii} className="operedu-item">
                              <span className="operedu-item-label">{item.label}</span>
                              <span className="operedu-item-desc">{item.desc}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default OperaEducation;
