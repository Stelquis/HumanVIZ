/* ============================================================
   Shared role detail data — used by RoleTreeModal and
   Task1Layout inline RoleDetailPanel
   ============================================================ */

export interface RoleDetail {
  name: string;
  category: string;
  desc: string;
  traits: string[];
  color: string;
}

export type CategoryKey = "生" | "旦" | "净" | "丑";

export interface CategoryMeta {
  color: string;
  bg: string;
  desc: string;
}

export const ROLE_DETAILS: RoleDetail[] = [
  { name: "老生", category: "生", desc: "中老年男性角色，以唱工为主，嗓音苍劲浑厚。代表角色：诸葛亮、杨继业。", traits: ["忠义", "稳重", "儒雅"], color: "#d4bea6" },
  { name: "小生", category: "生", desc: "青年男性角色，唱腔真假声结合。代表角色：周瑜、许仙。", traits: ["文雅", "清秀", "儒生气"], color: "#dcc8b1" },
  { name: "武生", category: "生", desc: "武艺高强的男性角色，重做工与武打。代表角色：赵云、武松。", traits: ["英勇", "刚毅", "武艺高强"], color: "#cdb59c" },
  { name: "末·外·生", category: "生", desc: "传统生行扩展类别，包括末、外等，多为年长配角。代表角色：黄忠、王允。", traits: ["宽厚", "持重", "沉稳"], color: "#e0d2be" },
  { name: "青衣·正旦", category: "旦", desc: "端庄正派的女性角色，重唱工。代表角色：王宝钏、秦香莲。", traits: ["贞烈", "端庄", "贤淑"], color: "#c09894" },
  { name: "老旦", category: "旦", desc: "老年女性角色，唱腔苍劲。代表角色：佘太君、窦娥。", traits: ["慈祥", "稳重", "沧桑"], color: "#c9a49f" },
  { name: "花旦·花衫", category: "旦", desc: "活泼娇俏的少女或青年女性。代表角色：红娘、春草。", traits: ["活泼", "娇俏", "直率"], color: "#d3b8b3" },
  { name: "武旦", category: "旦", desc: "精通武艺的女性角色。代表角色：穆桂英、梁红玉。", traits: ["英武", "飒爽", "矫健"], color: "#b88b86" },
  { name: "净", category: "净", desc: "性格刚烈或豪放的男性角色，面部勾画脸谱。代表角色：包公、曹操。", traits: ["豪放", "刚毅", "粗犷"], color: "#9ea6ad" },
  { name: "文丑", category: "丑", desc: "滑稽机敏的男性角色，鼻梁涂白。代表角色：蒋干、崇公道。", traits: ["滑稽", "机敏", "诙谐"], color: "#a7b8b3" },
  { name: "武丑", category: "丑", desc: "精通武艺的滑稽角色，身手灵活。代表角色：时迁、刘利华。", traits: ["敏捷", "灵活", "滑稽"], color: "#8ca39e" },
];

export const CATEGORY_META: Record<string, CategoryMeta> = {
  "生": { color: "#b8926a", bg: "rgba(184,146,106,0.08)", desc: "男性角色，含老生、小生、武生等细分" },
  "旦": { color: "#96544d", bg: "rgba(150,84,77,0.08)", desc: "女性角色，含青衣、老旦、花旦等细分" },
  "净": { color: "#5e6b76", bg: "rgba(94,107,118,0.08)", desc: "性格刚烈或豪放的男性，面部勾画脸谱" },
  "丑": { color: "#7f968d", bg: "rgba(127,150,141,0.08)", desc: "滑稽机敏角色，鼻梁涂白，分文丑武丑" },
};
