/**
 * narrativeTaxonomyBridge.ts — 叙事分类体系桥接模块
 *
 * 桥接两套分类体系：
 *   A. Python 算法分类（6 型）：短剧型、渐进高潮型、早期高潮型、
 *      跌宕起伏型、平稳铺陈型、情感波浪型
 *   B. 前端叙事模式（8 型）：悬念突转式、情感波浪式、史诗铺陈式、
 *      双线交织式、三叠反复式、回环照应式、多幕群像式、线性渐进式
 *
 * 设计原则：
 *   - 映射基于多特征启发式规则（场景数、冲突范围、峰值位置等）
 *   - 返回 { patternType, confidence } — 调用方可据此决定展示策略
 *   - 当无法确定时返回 "线性渐进式"（最通用的默认类型）
 */

export interface TaxonomyBridgeResult {
  /** 对应的前端叙事模式名称（NARRATIVE_PATTERNS 中的 type 字段） */
  patternType: string;
  /** 映射置信度 0~1，低于 0.5 表示低置信度 */
  confidence: number;
}

/**
 * 附加特征参数，用于提高映射精度
 */
export interface AlgorithmicFeatures {
  sceneCount: number;
  conflictRange: number; // 冲突波动范围 0~1
  peakPosition: number; // 高潮位置 0~1
  conflictTrend: number; // 冲突趋势（正=渐强）
  sentimentVolatility: number; // 情绪波动 0~1
  avgCharsPerScene: number; // 平均每场角色数
  arcShape?: string; // 弧线形态描述（可选）
}

/**
 * 将 Python 算法类型映射为前端叙事模式
 *
 * 映射逻辑（按优先级）：
 *   短剧型（n≤3） → 线性渐进式（最基础的结构）或 悬念突转式（冲突集中）
 *   早期高潮型   → 悬念突转式（开篇即高潮，反转后回落）
 *   渐进高潮型   → 线性渐进式（经典起承转合）
 *   跌宕起伏型   → 双线交织式（多次冲突转折）或 多幕群像式（角色密度高）
 *   情感波浪型   → 情感波浪式（情绪多次起伏）
 *   平稳铺陈型   → 史诗铺陈式（长篇平稳推进）
 */
export function mapAlgorithmicTypeToPattern(
  algorithmicType: string,
  features?: AlgorithmicFeatures
): TaxonomyBridgeResult {
  const f = features || {
    sceneCount: 5,
    conflictRange: 0.3,
    peakPosition: 0.6,
    conflictTrend: 0,
    sentimentVolatility: 0.3,
    avgCharsPerScene: 2.5,
  };

  switch (algorithmicType) {
    case "短剧型":
      // 短剧：冲突集中在一场 → 悬念突转式；否则线性渐进式
      if (f.sceneCount <= 3 && f.conflictRange > 0.35 && f.peakPosition < 0.35) {
        return { patternType: "悬念突转式", confidence: 0.75 };
      }
      if (f.sceneCount <= 2) {
        return { patternType: "单点突转式" in {} ? "悬念突转式" : "悬念突转式", confidence: 0.65 };
      }
      // 3场左右的短剧，三叠结构
      if (f.sceneCount >= 3 && f.sceneCount <= 4 && f.conflictRange > 0.3) {
        return { patternType: "三叠反复式", confidence: 0.6 };
      }
      return { patternType: "线性渐进式", confidence: 0.7 };

    case "早期高潮型":
      // 开篇即高潮 → 悬念突转式（信息差→反转）
      if (f.conflictRange > 0.35) {
        return { patternType: "悬念突转式", confidence: 0.8 };
      }
      return { patternType: "悬念突转式", confidence: 0.65 };

    case "渐进高潮型":
      // 冲突持续爬升 → 线性渐进式（经典起承转合）
      if (f.conflictTrend > 0.01 && f.sceneCount >= 6) {
        return { patternType: "线性渐进式", confidence: 0.8 };
      }
      // 长篇渐进 → 史诗铺陈式
      if (f.sceneCount >= 12 && f.conflictRange < 0.3) {
        return { patternType: "史诗铺陈式", confidence: 0.65 };
      }
      return { patternType: "线性渐进式", confidence: 0.75 };

    case "跌宕起伏型":
      // 多次冲突转折
      if (f.avgCharsPerScene > 3.0 && f.sceneCount >= 8) {
        return { patternType: "多幕群像式", confidence: 0.7 };
      }
      if (f.sentimentVolatility > 0.3) {
        return { patternType: "双线交织式", confidence: 0.7 };
      }
      // 首尾接近 → 回环照应式
      if (f.sceneCount >= 6 && f.conflictRange > 0.3) {
        return { patternType: "回环照应式", confidence: 0.55 };
      }
      return { patternType: "双线交织式", confidence: 0.65 };

    case "情感波浪型":
      // 情绪驱动 → 情感波浪式
      if (f.sentimentVolatility > 0.25) {
        return { patternType: "情感波浪式", confidence: 0.85 };
      }
      return { patternType: "情感波浪式", confidence: 0.7 };

    case "平稳铺陈型":
      // 长篇低冲突 → 史诗铺陈式
      if (f.sceneCount >= 10) {
        return { patternType: "史诗铺陈式", confidence: 0.75 };
      }
      // 也有可能三叠反复
      if (f.sceneCount >= 5 && f.sentimentVolatility < 0.25) {
        return { patternType: "三叠反复式", confidence: 0.5 };
      }
      return { patternType: "线性渐进式", confidence: 0.55 };

    default:
      // 未知类型：根据特征推测
      return guessPatternFromFeatures(f);
  }
}

/**
 * 仅从结构特征推测叙事模式（当 Python 分类不可用时）
 */
function guessPatternFromFeatures(f: AlgorithmicFeatures): TaxonomyBridgeResult {
  // 短剧
  if (f.sceneCount <= 3) {
    if (f.conflictRange > 0.35) return { patternType: "悬念突转式", confidence: 0.6 };
    return { patternType: "线性渐进式", confidence: 0.7 };
  }

  // 早期高潮
  if (f.peakPosition < 0.25 && f.conflictTrend < -0.005) {
    return { patternType: "悬念突转式", confidence: 0.65 };
  }

  // 情感驱动
  if (f.sentimentVolatility > 0.3 && f.conflictRange < 0.35) {
    return { patternType: "情感波浪式", confidence: 0.7 };
  }

  // 长篇群像
  if (f.sceneCount >= 10 && f.avgCharsPerScene > 3.5) {
    return { patternType: "多幕群像式", confidence: 0.6 };
  }

  // 长篇铺陈
  if (f.sceneCount >= 12 && f.conflictRange < 0.3) {
    return { patternType: "史诗铺陈式", confidence: 0.6 };
  }

  // 波折 → 双线交织
  if (f.conflictRange > 0.35 && f.sentimentVolatility > 0.25) {
    return { patternType: "双线交织式", confidence: 0.55 };
  }

  // 默认：线性渐进式
  return { patternType: "线性渐进式", confidence: 0.5 };
}

/**
 * 前端 8 种叙事模式的元数据（与 Task4Layout 中 NARRATIVE_PATTERNS 对应）
 * 用于在桥接后查找颜色、描述等信息
 */
export const PATTERN_META: Record<string, { color: string; rhythm: string; typicalStructure: string; emotionCurve: string }> = {
  "悬念突转式": { color: "#c44d4d", rhythm: "单峰急冲型", typicalStructure: "危机爆发 → 信息差建立 → 多方博弈 → 悬念揭示 → 危机解除", emotionCurve: "∧ 型（单峰）" },
  "情感波浪式": { color: "#c77d8b", rhythm: "波浪递进型", typicalStructure: "期待建立 → 期待受挫 → 情感内转 → 层层宣泄 → 疲惫归寂", emotionCurve: "层层递进上升型" },
  "史诗铺陈式": { color: "#6b5b4f", rhythm: "双峰跨越型", typicalStructure: "秩序建立 → 秩序崩塌 → 潜伏隐匿 → 力量积蓄 → 秩序重建", emotionCurve: "M 型（双峰）" },
  "双线交织式": { color: "#5e6b76", rhythm: "锯齿递进型", typicalStructure: "A线展开 → B线展开 → 双线交替 → 交叉碰撞 → 汇聚收束", emotionCurve: "锯齿上升型" },
  "三叠反复式": { color: "#c4a56e", rhythm: "阶梯攀升型", typicalStructure: "情境建立 → 第一次重复 → 第二次升级 → 第三次高潮 → 谐谑收场", emotionCurve: "台阶上升型" },
  "回环照应式": { color: "#7f968d", rhythm: "环形回落型", typicalStructure: "起始情境 → 情感展开 → 唱腔变奏 → 高潮抒发 → 回归起始", emotionCurve: "∩ 型（环形）" },
  "多幕群像式": { color: "#8a7a8e", rhythm: "多点分散型", typicalStructure: "群像登场 → 多线展开 → 线索交织 → 集中碰撞 → 分别收束", emotionCurve: "多轨并行型" },
  "线性渐进式": { color: "#b8926a", rhythm: "稳步爬升型", typicalStructure: "情境引入 → 矛盾初现 → 逐步激化 → 高潮对决 → 平稳收束", emotionCurve: "/ 型（缓坡）" },
};
