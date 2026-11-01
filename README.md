# épicerie

Googleログインで利用する買い物リスト。Telegramからの起動は不要。

## Googleログインの設定

1. Google Cloud ConsoleでOAuthクライアント（ウェブアプリケーション）を作成する。
2. 承認済みリダイレクトURIに `https://<公開ドメイン>/api/auth/google/callback` を登録する。
3. ローカル開発用には `http://localhost:5173/api/auth/google/callback` も登録する。
4. Cloudflare Pagesの本番・プレビュー環境それぞれに以下を設定する。プレビューは固定ドメインと別クライアントを推奨する。

| 変数 | 値 |
| --- | --- |
| APP_ORIGIN | 公開URLのオリジン（例 `https://grocery-list.pages.dev`） |
| GOOGLE_CLIENT_ID | GoogleのOAuthクライアントID |
| GOOGLE_CLIENT_SECRET | GoogleのOAuthクライアントシークレット |
| SESSION_SECRET | `openssl rand -hex 32` などで生成する32文字以上の秘密値 |
| GEMINI_API_KEY | 既存の画像・カテゴリ分類用キー |

シークレットをブラウザ用の `VITE_` 変数に設定しない。
Google OAuthの公開ステータスがテスト中の場合は、利用者をテストユーザーに追加する。
`TELEGRAM_BOT_TOKEN`、`ALLOW_UNAUTH`、`VITE_BOT_USERNAME` は使用しない。
Googleの埋め込みブラウザ制限があるため、通常のブラウザからログインする。

## デプロイ

アプリのデプロイ前に新しいテーブルを適用する。既存テーブルは変更しない。

```sh
npx wrangler d1 execute grocery-list-db --remote --file=migrate_google_auth.sql
```

設定後にアプリをデプロイする。Googleでの実ログイン・ログアウト、リスト操作、添付表示を確認する。
新規Googleアカウントでは空のリスト一覧になる。既存の共有コードからの参加も可能。

## 既存データの引き継ぎ

メールアドレスだけでは既存ユーザーと自動連携しない。
各利用者がGoogleで一度ログインした後、管理者が本人を確認して対応付ける。

```sql
SELECT id, google_sub, email FROM app_users;
SELECT DISTINCT tg_user_id FROM list_members;
```

本人のGoogle `google_sub` と旧TelegramユーザーIDを確認し、以下のプレースホルダーを置き換えて実行する。
新規Googleアカウントでリストやお気に入りを作る前に行う。

```sql
UPDATE app_users SET id = <旧TelegramユーザーID> WHERE google_sub = '<本人のGoogle sub>' AND id < 0;
```

再ログイン後、既存の所有権・参加リスト・お気に入り・履歴がそのまま使える。
既存データを別のユーザーに公開することはない。
新規アカウントで既にデータを作成した場合は、管理者が新旧IDのデータを個別に統合してから変更する。

## ローカル開発

`.dev.vars.example` を `.dev.vars` にコピーして設定する。

```sh
npm ci
npm run db:init:local
npm run build
npm run dev
```

ブラウザでは `http://localhost:5173` を開く。
Googleログイン後のセッションはHttpOnly Cookieに30日間保存する。

## 仕様の参照

- https://developers.google.com/identity/protocols/oauth2/web-server
- https://developers.google.com/identity/openid-connect/openid-connect
