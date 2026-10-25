// Supabase接続情報(サーバー側コード専用。ブラウザには配信されません)。
// EdgeOneの環境変数 SUPABASE_URL / SUPABASE_SECRET_KEY があればそちらを優先します。
// ※このZIPをGitHubなどの公開場所に置かないでください。
export const SUPABASE_URL = "";
export const SUPABASE_SECRET_KEY = "";
// cron(Supabase pg_cron)から定期APIを呼ぶときの合言葉。
export const CRON_SECRET = "";
