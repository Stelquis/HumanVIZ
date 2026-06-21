/* ============================================================
   periodData.ts — Static period metadata, historical descriptions,
   and representative plays for the Task1 evolution chart.

   Used by PeriodButtons and PeriodPopover components.
   ============================================================ */

export interface PeriodPlay {
  title: string;
  roleCount: number;
}

export interface PeriodInfo {
  /** Short label matching the ECharts x-axis era name, e.g. "民国汇编" */
  shortLabel: string;
  /** Year range string, e.g. "1915–1949" */
  yearRange: string;
  /** Number of scripts in this compilation period */
  scriptCount: number;
  /** Title line shown in popover header, e.g. "汇编整理与早期学术化萌芽" */
  subtitle: string;
  /** Full historical context description */
  description: string;
  /** 3–5 representative plays from this period's source data */
  representativePlays: PeriodPlay[];
}

/* ── Period 1: 民国汇编 (1915-1949) ── */
const PERIOD_1: PeriodInfo = {
  shortLabel: `民国汇编`,
  yearRange: `1915–1949`,
  scriptCount: 678,
  subtitle: `汇编整理与早期学术化萌芽`,
  description:
    `这一阶段的京剧处于从「舞台艺术」向「文本与学术对象」转变的初期。` +
    `民国时期城市戏曲市场繁荣，北京、上海等地形成高度商业化演出体系，印刷出版业发展使戏曲文本开始被系统记录。` +
    `知识分子将京剧纳入「国粹整理」范畴，出现早期剧目汇编、唱词整理与曲谱记录，但整体以「民间整理 + 零散出版」为主，缺乏统一标准。` +
    `社会动荡（军阀混战与抗战）导致资料保存不稳定，但也促使文化机构与学者有意识地抢救性记录戏曲资料。`,
  representativePlays: [
    { title: `空城计`, roleCount: 5 },
    { title: `四郎探母`, roleCount: 11 },
    { title: `捉放曹`, roleCount: 6 },
    { title: `连环套`, roleCount: 31 },
    { title: `打鼓骂曹`, roleCount: 2 },
  ],
};

/* ── Period 2: 新中国整理 (1950-1999) ── */
const PERIOD_2: PeriodInfo = {
  shortLabel: `新中国整理`,
  yearRange: `1950–1999`,
  scriptCount: 514,
  subtitle: `国家主导的系统整理与标准化`,
  description:
    `这一时期是京剧资料体系「制度化建构」的关键阶段。` +
    `在国家文化政策推动下，大量传统剧目被重新整理、审定与规范化，形成系统性的剧本库、曲谱集与艺术档案。` +
    `例如「传统剧目整理工程」「戏曲志编纂」等，使京剧从分散文本进入国家文化档案体系。` +
    `艺术层面强调「整理传统 + 改革旧戏」，对剧本结构、唱腔谱式进行统一规范，减少版本混乱，同时推动教学体系标准化（如戏曲学校体系建立）。` +
    `经历政治与文化多次调整（如「文化大革命」对戏曲的冲击与后期恢复），呈现出「断裂—重建—再系统化」的特征。`,
  representativePlays: [
    { title: `赵氏孤儿`, roleCount: 29 },
    { title: `杨门女将`, roleCount: 12 },
    { title: `将相和`, roleCount: 7 },
    { title: `野猪林`, roleCount: 9 },
    { title: `白蛇传`, roleCount: 7 },
  ],
};

/* ── Period 3: 名家演出 (1920-1990) ── */
const PERIOD_3: PeriodInfo = {
  shortLabel: `名家演出`,
  yearRange: `1920–1990`,
  scriptCount: 145,
  subtitle: `流派形成与舞台范式固化`,
  description:
    `这一维度以「舞台表演传统」为核心，是京剧艺术最具生命力的传承链条。` +
    `民国时期京剧进入流派黄金期，以梅兰芳、程砚秋、尚小云、荀慧生等「四大名旦」为代表，形成高度成熟的表演体系。` +
    `生、旦、净、丑各行当的表演风格逐渐定型。` +
    `进入新中国后，名家表演通过录制、教学与剧团制度进一步固化，形成「标准化表演范式」。` +
    `许多经典剧目有多个「名家版本」，成为后世复原与教学的核心依据。` +
    `这一阶段跨越多个时代，核心在于通过舞台实践将京剧从「活的艺术」转化为「可复制的流派体系」。`,
  representativePlays: [
    { title: `四进士`, roleCount: 38 },
    { title: `群英会·借东风`, roleCount: 30 },
    { title: `十老安刘`, roleCount: 44 },
    { title: `玉堂春`, roleCount: 19 },
    { title: `胭脂宝褶`, roleCount: 38 },
  ],
};

/* ── Period 4: 昆曲传承 (1950-2000) ── */
const PERIOD_4: PeriodInfo = {
  shortLabel: `昆曲传承`,
  yearRange: `1950–2000`,
  scriptCount: 71,
  subtitle: `昆曲剧目文本化保存`,
  description:
    `昆曲剧目文本化保存项目以记录口传心授的经典折子戏为主，由侯玉山、俞振飞等昆曲大师传承。` +
    `生行（巾生、官生）在《牡丹亭》《长生殿》等才子佳人戏中占据叙事焦点，武戏和花脸戏在昆曲剧本中占比相对较低。` +
    `昆曲作为「百戏之母」，其剧本保留了更古典的戏曲结构与行当配置，为研究京剧行当体系的渊源提供了重要参照。` +
    `这些藏本虽总量不大（71部），但在行当分布的纯度上反映了昆曲「重文戏、轻武戏」的传统审美取向。`,
  representativePlays: [
    { title: `单刀会·训子`, roleCount: 6 },
    { title: `清忠谱·五人义`, roleCount: 14 },
    { title: `列国传·棋盘会`, roleCount: 11 },
    { title: `风云会·访普`, roleCount: 7 },
    { title: `兴唐传·御果园`, roleCount: 9 },
  ],
};

/* ── Period 5: 录音藏本 (1930-2000) ── */
const PERIOD_5: PeriodInfo = {
  shortLabel: `录音藏本`,
  yearRange: `1930–2000`,
  scriptCount: 51,
  subtitle: `技术介入下的京剧保存`,
  description:
    `这一阶段是京剧从「口传心授」向「媒介保存」的关键转折。` +
    `随着唱片工业、磁带录音、电视与录像技术的发展，大量经典唱段、整本戏被系统录制。` +
    `国家广播系统、戏曲院团与音像出版社共同构建了庞大的音像档案体系。` +
    `在文化意义上，这使京剧突破了空间与时间限制：观众不再依赖现场演出即可接触名家表演版本。` +
    `尤其在改革开放后，文化市场恢复活力，大量传统与整理剧目被重新录制、发行，形成「可传播的标准版本库」。`,
  representativePlays: [
    { title: `海瑞上疏`, roleCount: 28 },
    { title: `花木兰`, roleCount: 18 },
    { title: `桃花扇`, roleCount: 13 },
    { title: `官渡之战`, roleCount: 11 },
    { title: `长坂坡`, roleCount: 11 },
  ],
};

/* ── Period 6: 现代创作 (1950-1980) ── */
const PERIOD_6: PeriodInfo = {
  shortLabel: `现代创作`,
  yearRange: `1950–1980`,
  scriptCount: 14,
  subtitle: `传统戏曲的现实化与新编探索`,
  description:
    `这一阶段强调在传统京剧框架内进行「现代叙事与主题创新」。` +
    `在国家文艺政策推动下，出现大量「新编历史剧」「现代京剧」与革命题材作品，如《红灯记》《智取威虎山》等。` +
    `这些作品在音乐结构、表演节奏与舞台调度上都进行了较大改造。` +
    `同时，一部分传统剧目被重新改编，以适应新的社会意识形态与审美需求，使京剧从古典叙事扩展到现实表达。` +
    `这是京剧与现代国家叙事深度绑定的阶段，也是其艺术形态最剧烈变化的时期之一。`,
  representativePlays: [
    { title: `响马传`, roleCount: 28 },
    { title: `谢瑶环`, roleCount: 17 },
    { title: `青霞丹雪`, roleCount: 18 },
    { title: `锁麟囊`, roleCount: 17 },
    { title: `西厢记`, roleCount: 5 },
  ],
};

/* ── Exports ── */

/** All 6 periods in chart x-axis order */
export const PERIOD_INFO_LIST: PeriodInfo[] = [
  PERIOD_1,
  PERIOD_2,
  PERIOD_3,
  PERIOD_4,
  PERIOD_5,
  PERIOD_6,
];

/** O(1) lookup by shortLabel */
export const PERIOD_MAP: Record<string, PeriodInfo> = {};
PERIOD_INFO_LIST.forEach((p) => {
  PERIOD_MAP[p.shortLabel] = p;
});
