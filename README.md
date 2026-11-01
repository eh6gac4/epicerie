# épicerie

GoogleログインとTelegram Mini App認証の両方で利用する買い物リスト。通常のブラウザからはGoogle、Telegramからは従来のユーザーIDで利用できる。

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
| TELEGRAM_BOT_TOKEN | 既存のTelegram Mini App認証用ボットトークン（継続して設定） |
| SESSION_SECRET | `openssl rand -hex 32` などで生成する32文字以上の秘密値 |
| GEMINI_API_KEY | 既存の画像・カテゴリ分類用キー |

シークレットをブラウザ用の `VITE_` 変数に設定しない。
Google OAuthの公開ステータスがテスト中の場合は、利用者をテストユーザーに追加する。
`TELEGRAM_BOT_TOKEN` は引き続き使用する。`ALLOW_UNAUTH` による認証回避は使用しない。共有リンクは通常のWeb URLを使用する。
Googleの埋め込みブラウザ制限があるため、通常のブラウザからログインする。

## Telegram認証の継続

既存の `TELEGRAM_BOT_TOKEN` を保持する。Telegram単独の利用にはGoogleの設定や新しいテーブルを必要としない。
Telegram起動時は署名付きの起動データをサーバーで確認し、従来と同じユーザーIDのHttpOnly Cookieを発行する。
起動データは24時間以内のものを受け付ける。発行済みのセッションは30日間有効。
以前のローカルストレージのセッションも初回起動時にCookieへ交換する。
旧クライアント用の `/api/auth/session` と認証ヘッダー・添付用クエリも引き続き受け付ける。
ログアウト後、Telegram内でアプリを開き直すと再認証する。
Googleと併用する際は `SESSION_SECRET` を設定する。未設定時はTelegram Cookieの署名にボットトークンを使用する。
署名用の値を変更すると既存Cookieは無効になり、再ログインが必要になる。

## デプロイ

アプリのデプロイ前に新しいテーブルを適用する。既存テーブルは変更しない。

```sh
npx wrangler d1 execute grocery-list-db --remote --file=migrate_google_auth.sql
```

設定後にアプリをデプロイする。Googleでの実ログイン・ログアウト、リスト操作、添付表示を確認する。
新規Googleアカウントでは空のリスト一覧になる。既存の共有コードからの参加も可能。

## 既存データの引き継ぎ

Telegramからは従来どおり既存データを使える。Googleからも同じデータを使う場合のみ以下を行う。
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

- https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
