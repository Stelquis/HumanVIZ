import React from "react";
import selectedScriptsRaw from "../../data/selected-scripts.json";
import comparisonTableRaw from "../../data/comparison-table.json";
import type { ScriptCard } from "../../types/task4Types";

const SELECTED_SCRIPTS: ScriptCard[] = selectedScriptsRaw as ScriptCard[];
const COMPARISON_TABLE: string[][] = comparisonTableRaw as string[][];

/* ================================================================
   Selection Report Content
   ================================================================ */

const SelectionReportContent: React.FC = () => (
  <>
    <section className="t4-report-section">
      <h3>筛选概述</h3>
      <p>本报告从 HumanVIZ 项目收录的 <strong>1,473 部京剧剧本</strong> 中，沿多个维度筛选出 <strong>5 部具有代表性的剧本</strong>作为深度分析范本。选择力求覆盖不同的叙事结构类型、行当构成、角色规模、来源合集与文化意义。此外，<strong>全部 1,473 部剧本</strong>均已支持场景级叙事丝带分析与结构指纹提取。</p>
    </section>
    <section className="t4-report-section">
      <h3>筛选维度</h3>
      <table className="t4-report-dim-table">
        <thead><tr><th>维度</th><th>说明</th></tr></thead>
        <tbody>
          <tr><td>来源合集多样性</td><td>覆盖主流合集与罕见藏本，反映数据来源的整体分布</td></tr>
          <tr><td>叙事结构类型</td><td>涵盖八大叙事结构类型：悬念突转式、情感波浪式、史诗铺陈式、双线交织式、三叠反复式、回环照应式、多幕群像式、线性渐进式</td></tr>
          <tr><td>行当构成</td><td>覆盖老生戏、旦角戏、净角戏、丑角戏、武戏及群戏</td></tr>
          <tr><td>角色规模</td><td>从 3 人私密戏到 30 人大群戏，覆盖角色复杂度的全谱系</td></tr>
          <tr><td>文化地位</td><td>兼具家喻户晓的经典与学术价值较高的冷门剧目</td></tr>
        </tbody>
      </table>
    </section>
    {SELECTED_SCRIPTS.map((s, i) => (
      <section key={s.id} className="t4-report-section t4-script-card">
        <div className="t4-script-card-header">
          <span className="t4-script-index">剧本 {i + 1}</span>
          <h4>《{s.name}》{s.alias && <span className="t4-script-alias">一名：{s.alias}</span>}</h4>
        </div>
        <table className="t4-script-meta">
          <tbody>
            <tr><td>数据库 ID</td><td>{s.id}</td></tr>
            <tr><td>来源合集</td><td>{s.collection}（{s.collectionScale}）</td></tr>
            <tr><td>时代背景</td><td>{s.era}</td></tr>
            <tr><td>角色数</td><td>{s.charCount} 人</td></tr>
            <tr><td>行当分布</td><td>{s.roles}</td></tr>
            <tr><td>剧本长度</td><td>{s.wordCount}</td></tr>
            <tr><td>叙事结构</td><td><span className="t4-tag">{s.structureType}</span></td></tr>
            <tr><td>主导行当</td><td><span className="t4-tag t4-tag-role">{s.dominantRole}</span></td></tr>
            <tr><td>叙事弧线</td><td>{s.narrativeArc}</td></tr>
          </tbody>
        </table>
        <div className="t4-script-summary"><strong>内容概要：</strong>{s.summary}</div>
        <div className="t4-script-reasons">
          <strong>选择理由：</strong>
          <ol>{s.reasons.map((r, j) => <li key={j}>{r}</li>)}</ol>
        </div>
      </section>
    ))}
    <section className="t4-report-section">
      <h3>五部剧本对比总览</h3>
      <div className="t4-comparison-wrap">
        <table className="t4-comparison-table">
          <thead>
            <tr><th>维度</th><th>《空城计》</th><th>《贵妃醉酒》</th><th>《赵氏孤儿》</th><th>《连环套》</th><th>《打面缸》</th></tr>
          </thead>
          <tbody>
            {COMPARISON_TABLE.map((row, ri) => (
              <tr key={ri}>{row.map((cell, ci) => <td key={ci}>{cell}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
    <section className="t4-report-section">
      <h3>数据集覆盖验证</h3>
      <ul className="t4-coverage-list">
        <li><strong>来源合集覆盖</strong>：5 部来自 4 个不同合集，涵盖最大合集（《戏考》448 部）、第二大合集（《京剧汇编》360 部）、名家藏本（马连良 9 部）、罕见藏本（传统戏曲剧目资料汇编 2 部）</li>
        <li><strong>角色数覆盖</strong>：3 / 5 / 7 / 23 / 30，覆盖了数据集角色数分布的 P5 / P25 / P50 / P95 / P99</li>
        <li><strong>行当覆盖</strong>：老生、花旦、净、丑、小生、武生、武丑、杂 —— 覆盖了数据集全部 8 个主要行当大类</li>
        <li><strong>叙事类型覆盖</strong>：历史军事、宫廷心理、政治悲剧、武侠英雄、民间喜剧 —— 覆盖了京剧叙事的 5 种主要类型</li>
        <li><strong>长度覆盖</strong>：2,329 到 23,696 字，跨两个数量级</li>
      </ul>
    </section>
  </>
);

export default SelectionReportContent;
