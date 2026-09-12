/**
 * Common-namespace zh strings exercised by the client component specs.
 *
 * The published `@deepseek-ai/dsh-client-locale` package ships only `lib/` and
 * declares `./src/*` in its export map, so the monorepo test import
 * (`@deepseek-ai/dsh-client-locale/src/locales/zh.ts`) resolves to nothing
 * outside the Harness checkout. This module carries the same dictionary,
 * copied from that source, under both the upstream `zh` name and the
 * `commonZh` alias this repository's specs use.
 */
/** zh base dictionary for the common namespace: cross-feature standard words. */
export const zh = {
  'ok': '确定',
  'cancel': '取消',
  'close': '关闭',
  'copy': '复制',
  'copied': '复制成功',
  'copy.failed': '复制失败',
  'copy.value': '复制值',
  'copy.json': '复制 JSON',
  'copy.path': '复制属性路径',
  'copy.prettyJson': '复制格式化 JSON',
  'copy.compactJson': '复制紧凑 JSON',
  'copy.optionsHint': '{action}；右键点击可选择复制方式',
  'retry': '重试',
  'loading': '加载中…',
  'load.failed': '加载失败',
  'submit': '提交',
  'submitting': '正在提交…',
  'next': '下一步',
  'previous': '上一步',
  'skip': '跳过',
  'delete': '删除',
  'edit': '编辑',
  'save': '保存',
  'search': '搜索',
  'more': '更多',
  'collapse': '收起',
  'expand': '展开',
  'back': '返回',
  'brand.localBuild': 'DSH 本地构建',
  'unknown': '未知',
  'none': '无',
  'truncated': '已截断',
  'json.collapseNode': '收起 JSON 节点',
  'json.expandNode': '展开 JSON 节点',
  'json.label': 'JSON',
  'markdown.footnotes': '脚注',
  'markdown.truncatedCharacters': '… 已截断，共 {total} 字符',
  'number.thousand': '{value}K',
  'number.million': '{value}M',
} satisfies Record<string, string>

/** The common vocabulary key union (zh is the key-set source of truth). */
export type CommonKey = keyof typeof zh

/** Alias kept for the plugin-local specs. */
export const commonZh = zh
