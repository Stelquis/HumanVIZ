/**
 * CharacterSearch.tsx
 * Search input with autocomplete dropdown for Peking Opera characters.
 * Uses @mantine/core Autocomplete component for typing-friendly filtering.
 *
 * Supports two modes:
 *   - Default: single character selector
 *   - Combined: main character + comparison characters in one unified area
 */

import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { Autocomplete } from "@mantine/core";
import type { CharacterIndex, SearchResult } from "./CharacterPerformanceLoader";
import { searchCharacters, getCategoryColor, getCategoryLabel } from "./CharacterPerformanceLoader";

/* ── Props ── */

interface Props {
  /** The character performance index (all 3,581 characters) */
  index: CharacterIndex | null;
  /** Currently selected character name */
  selectedName: string | null;
  /** Callback when user selects a character */
  onSelect: (name: string) => void;
  /** Placeholder text for the input */
  placeholder?: string;

  /* ── Combined mode (merges main + comparison into one area) ── */
  /** Enable combined mode with comparison character management */
  combined?: boolean;
  /** Comparison character names (only used in combined mode) */
  comparisonCharacters?: string[];
  /** Callback to add a comparison character (combined mode) */
  onAddComparison?: (name: string) => void;
  /** Callback to remove a comparison character (combined mode) */
  onRemoveComparison?: (name: string) => void;
  /** Callback to clear the main character selection (combined mode) */
  onClear?: () => void;
  /** Max comparison characters allowed (combined mode, default 3) */
  maxComparisons?: number;
}

/* ── Autocomplete input styles (shared) ── */

const AUTOCOMPLETE_STYLES = {
  input: {
    fontFamily: "Noto Sans SC, sans-serif",
    fontSize: 14,
    height: 40,
    borderColor: "rgba(94,107,118,0.25)",
    color: "#3a2c21",
    backgroundColor: "#fdfaf5",
    "&:focus": {
      borderColor: "rgba(184,155,109,0.6)",
      boxShadow: "0 0 0 2px rgba(184,155,109,0.12)",
    },
  },
  dropdown: {
    borderColor: "rgba(94,107,118,0.15)",
    backgroundColor: "#fdfaf5",
  },
} as const;

/* ── Internal: Autocomplete sub-component ── */

const CharAutocomplete: React.FC<{
  index: CharacterIndex | null;
  placeholder: string;
  onSelect: (name: string) => void;
  inputHeight?: number;
  inputFontSize?: number;
}> = ({ index, placeholder, onSelect, inputHeight = 40, inputFontSize = 14 }) => {
  const [query, setQuery] = useState("");

  const results = useMemo<SearchResult[]>(() => {
    if (!index) return [];
    return searchCharacters(query || "", index, index.searchOrder.length);
  }, [query, index]);

  const autocompleteData = useMemo(() => {
    const expert = results
      .filter(r => r.confidence === "expert")
      .map(r => ({ value: r.displayName, label: r.displayName }));
    const regular = results
      .filter(r => r.confidence !== "expert")
      .map(r => ({ value: r.displayName, label: r.displayName }));

    const data: Array<
      { value: string; label: string }
      | { group: string; items: Array<{ value: string; label: string }> }
    > = [];

    if (expert.length > 0) {
      data.push({ group: "⭐ 领域知识参考角色", items: expert });
    }
    data.push(...regular);
    return data;
  }, [results]);

  const handleChange = useCallback((value: string) => {
    setQuery(value);
  }, []);

  const handleOptionSubmit = useCallback((value: string) => {
    const match = results.find(
      r => r.displayName === value || r.name === value,
    );
    if (match) {
      onSelect(match.name);
      setQuery("");
    }
  }, [results, onSelect]);

  const renderOption = useCallback(
    (item: any) => {
      const optionValue = item.option?.value || item.option?.label || "";
      const result = results.find(
        r => r.displayName === optionValue || r.name === optionValue,
      );
      if (!result) return <div>{item.option.value}</div>;

      const catColor = getCategoryColor(result.category);
      const catLabel = getCategoryLabel(result.category);
      const isExpert = result.confidence === "expert";

      return (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "4px 2px",
            gap: 8,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <span
              style={{
                width: 8, height: 8, borderRadius: "50%",
                background: catColor, flexShrink: 0,
              }}
            />
            <span style={{ fontWeight: 600, fontSize: 14, color: "#3a2c21" }}>
              {result.displayName}
              {isExpert && (
                <span style={{ fontSize: 11, marginLeft: 4, color: "#b89b6d" }}>★</span>
              )}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <span
              style={{
                fontSize: 10, padding: "1px 6px", borderRadius: 3,
                background: catColor + "20", color: catColor, fontWeight: 600,
              }}
            >
              {catLabel}
            </span>
            <span style={{ fontSize: 10, color: "#8a939b" }}>
              {result.scriptCount} 部
            </span>
          </div>
        </div>
      );
    },
    [results],
  );

  return (
    <Autocomplete
      value={query}
      onChange={handleChange}
      onOptionSubmit={handleOptionSubmit}
      placeholder={placeholder}
      data={autocompleteData}
      renderOption={renderOption}
      limit={9999}
      comboboxProps={{
        shadow: "md",
        dropdownPadding: 6,
        width: 220,
      }}
      styles={{
        input: {
          ...AUTOCOMPLETE_STYLES.input,
          height: inputHeight,
          fontSize: inputFontSize,
        },
        dropdown: AUTOCOMPLETE_STYLES.dropdown,
      }}
    />
  );
};

/* ── Main Component ── */

const CharacterSearch: React.FC<Props> = ({
  index,
  selectedName,
  onSelect,
  placeholder = "搜索角色名称...",
  combined = false,
  comparisonCharacters = [],
  onAddComparison,
  onRemoveComparison,
  onClear,
  maxComparisons = 3,
}) => {
  const [feedback, setFeedback] = useState<{ text: string; ts: number } | null>(null);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedDisplayName =
    selectedName
      ? index?.characters[selectedName]?.displayName || selectedName
      : null;
  const selectedCharData =
    selectedName ? index?.characters[selectedName] : null;

  const [resetKey, setResetKey] = useState(0);

  const showFeedback = useCallback((text: string) => {
    setFeedback({ text, ts: Date.now() });
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    feedbackTimer.current = setTimeout(() => setFeedback(null), 2000);
  }, []);

  const handleAddWithFeedback = useCallback((name: string) => {
    if (name === selectedName) {
      showFeedback('已是当前角色');
      setResetKey(k => k + 1);
      return;
    }
    if (comparisonCharacters.includes(name)) {
      showFeedback('已添加过该角色');
      setResetKey(k => k + 1);
      return;
    }
    if (comparisonCharacters.length >= maxComparisons) {
      showFeedback('对比角色已满');
      setResetKey(k => k + 1);
      return;
    }
    onAddComparison?.(name);
  }, [selectedName, comparisonCharacters, maxComparisons, onAddComparison, showFeedback]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => { if (feedbackTimer.current) clearTimeout(feedbackTimer.current); };
  }, []);

  /* ── Combined mode: unified main + comparison area ── */
  if (combined) {
    const catColor = selectedCharData
      ? getCategoryColor(selectedCharData.category)
      : "#8a939b";
    const catLabel = selectedCharData
      ? getCategoryLabel(selectedCharData.category)
      : "";
    const canAddMore = comparisonCharacters.length < maxComparisons;
    const remainingSlots = maxComparisons - comparisonCharacters.length;

    return (
      <div className="t1-char-search t1-char-search--combined">
        {/* ── Single card — content toggles, container stays the same ── */}
        <div className="t1-char-search-card">
          {!selectedName ? (
            <>
              <span className="t1-char-search-prompt-icon">🔍</span>
              <div className="t1-char-search-prompt-input">
                <CharAutocomplete
                  index={index}
                  placeholder={placeholder}
                  onSelect={onSelect}
                  inputHeight={34}
                  inputFontSize={14}
                />
              </div>
            </>
          ) : (
            <>
              {/* Main character segment */}
              <div className="t1-char-search-main" style={{ borderLeftColor: catColor }}>
                <span className="t1-char-search-main-dot" style={{ background: catColor }} />
                <span className="t1-char-search-main-name">{selectedDisplayName}</span>
                {catLabel && (
                  <span className="t1-char-search-main-cat" style={{
                    color: catColor, background: catColor + "15", borderColor: catColor + "35",
                  }}>{catLabel}</span>
                )}
                <span className={`t1-char-search-main-conf ${selectedCharData?.confidence === "expert" ? "t1-char-search-main-conf--expert" : "t1-char-search-main-conf--inferred"}`}>
                  {selectedCharData?.confidence === "expert" ? "★ 领域知识" : `${selectedCharData?.scriptCount ?? 0} 部`}
                </span>
                <button className="t1-char-search-main-clear" onClick={onClear} title="清除选择" aria-label="清除角色选择">
                  <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                    <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                  </svg>
                </button>
              </div>

              {/* Divider */}
              <span className="t1-char-search-divider" />

              {/* Comparison segment — inline with main */}
              <div className="t1-char-search-compare">
                <span className="t1-char-search-compare-label" title="对比角色">◐</span>

                {comparisonCharacters.map(name => {
                  const c = index?.characters[name];
                  const cc = c ? getCategoryColor(c.category) : "#8a939b";
                  return (
                    <span key={name} className="t1-comparison-chip" style={{ "--chip-color": cc } as React.CSSProperties}>
                      <span className="t1-comparison-chip-dot" style={{ background: cc }} />
                      <span className="t1-comparison-chip-name">{c?.displayName || name}</span>
                      <button className="t1-comparison-chip-remove" onClick={() => onRemoveComparison?.(name)} aria-label={`移除 ${c?.displayName || name}`}>
                        <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                          <path d="M2 2l6 6M8 2L2 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                      </button>
                    </span>
                  );
                })}

                {canAddMore && (
                  <div className="t1-char-search-compare-add">
                    <CharAutocomplete
                      key={`compare-add-${comparisonCharacters.length}-${resetKey}`}
                      index={index}
                      placeholder={comparisonCharacters.length === 0 ? "添加对比" : `+${remainingSlots}`}
                      onSelect={handleAddWithFeedback}
                      inputHeight={30}
                      inputFontSize={12}
                    />
                  </div>
                )}

                {comparisonCharacters.length === 0 && !canAddMore && (
                  <span className="t1-char-search-compare-empty">已达上限</span>
                )}
              </div>
            </>
          )}
        </div>

        {/* ── Feedback toast ── */}
        {feedback && (
          <div className="t1-char-search-feedback" key={feedback.ts}>
            {feedback.text}
          </div>
        )}
      </div>
    );
  }

  /* ── Default mode: simple single-character selector ── */
  return (
    <div className="t1-char-search">
      <CharAutocomplete
        index={index}
        placeholder={placeholder}
        onSelect={onSelect}
      />
      {selectedName && (
        <div className="t1-char-search-selected">
          <span className="t1-char-search-selected-label">当前角色：</span>
          <span className="t1-char-search-selected-name">
            {index?.characters[selectedName]?.displayName || selectedName}
          </span>
        </div>
      )}
    </div>
  );
};

export default CharacterSearch;
