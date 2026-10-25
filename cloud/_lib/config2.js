// 第2のSupabase(直列つなぎ)の接続情報。サーバー側コード専用。
// 第1(config.js)が90%を超えたら、新しいデータは自動でこちらに書かれます。読みは 第1→第2→データ置き場 の順。
// URLは入力済み。キーは安全のためファイルに書かず、EdgeOneの環境変数 SUPABASE2_KEY(sb_secret_…)に入れてください。
// (環境変数 SUPABASE2_URL / SUPABASE2_KEY があればそちらが優先。キーが空のあいだは第2は無効=今まで通り)
export const SUPABASE2_URL = "";
export const SUPABASE2_KEY = "";

// 第3のSupabase(第2も満杯に近づいたら、新しいデータはこちらへ)。環境変数 SUPABASE3_URL / SUPABASE3_KEY があればそちらが優先。
export const SUPABASE3_URL = "";
export const SUPABASE3_KEY = "";

// 第4・第5のSupabase(第3も満杯に近づいたら順に使う)。環境変数 SUPABASE4_URL / SUPABASE4_KEY などが優先。
export const SUPABASE4_URL = "";
export const SUPABASE4_KEY = "";
export const SUPABASE5_URL = "";
export const SUPABASE5_KEY = "";
