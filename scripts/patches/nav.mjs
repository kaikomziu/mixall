// scripts/patches/nav.mjs
// 下部メニュー（public/js/mixall-nav.js）のグループを外から読めるようにする。
// ヘッダーの「メニュー」（overlay/js/plus-tidy.js）が、同じ項目・同じ並び順で一覧を出すのに使う。
export const labels = ['メニュー: グループを公開'];

export function apply({ kind, rel, text, patch }) {
  if (kind !== 'script' || rel !== 'js/mixall-nav.js') return text;
  return patch(text, 'メニュー: グループを公開',
    'window.MixAllNav = { list: () => orderedGroups().map(([key, group]) => ({ key, label: group.label })), rerender: renderNavigation };',
    'window.MixAllNav = { list: () => orderedGroups().map(([key, group]) => ({ key, label: group.label })), groups: () => orderedGroups().map(([key, group]) => ({ key, label: group.label, icon: makeIcon(group.icon), items: group.items, makeIcon })), isActive: itemIsActive, rerender: renderNavigation };');
}
