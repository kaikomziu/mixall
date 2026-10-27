// サイト作成（/lending/）の画面の文字列の置き換え。画面の機能は overlay/js/plus-lending.js にある。
export const labels = ['サイト画面: Coin改行', 'サイト画面: 見出し', 'サイト画面: タイトル'];

export function apply({ kind, rel, text, patch }) {
  if (kind !== 'page' || rel !== 'lending/index.html') return text;
  // Coin 実行結果の改行が「\n」の文字のまま出ていた
  text = patch(text, 'サイト画面: Coin改行', ".join('\\\\n')); }", ".join('\\n')); }");
  // 見出しを「サイト作成」にそろえる
  text = patch(text, 'サイト画面: 見出し', '<h2>貸し出しサーバー</h2>', '<h2>サイト作成</h2>');
  text = patch(text, 'サイト画面: タイトル', '<title>貸し出しサーバー - ', '<title>サイト作成 - ');
  return text;
}
