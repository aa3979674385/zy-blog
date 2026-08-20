// 使用 ! 作为 LIKE 转义字符（避免反斜杠与 SQL 单引号转义冲突导致语法错误）
export function escapeLikeString(str: string) {
  return str.replace(/[%_!]/g, "!$&");
}

/**
 * 媒体搜索词归一化：
 * - 若输入是整条图片 URL（含协议或路径分隔符），仅取其最后一段路径作为搜索词，
 *   并去掉查询串(?)/hash(#)。例如
 *   `https://zy1.121512.xyz/images/6a3db3ad-xxxx.png?x=1`
 *   → `6a3db3ad-xxxx.png`，可直接命中存储键 key。
 * - 普通文件名/裸 UUID 不做处理。
 * - 超长字符串截断，避免 SQLite `LIKE pattern too complex`。
 */
export function normalizeMediaSearchTerm(term: string): string {
  let t = term.trim();
  if (!t) return t;

  if (t.includes("://") || t.includes("/")) {
    // 去掉查询串与 hash
    t = t.split("?")[0].split("#")[0];
    const segment = t.split("/").filter(Boolean).pop();
    if (segment) t = segment;
  }

  if (t.length > 255) t = t.slice(0, 255);
  return t;
}
