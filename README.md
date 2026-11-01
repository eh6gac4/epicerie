# épicerie

Googleログイン、Telegram Mini App認証、エージェント用ID・パスワードに対応した買い物リスト。通常のブラウザからはGoogle、Telegramからは従来のユーザーIDで利用できる。Museなどのブラウザ操作エージェントはログイン画面でID・パスワードを入力する。

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
| AGENT_PASSWORD_PEPPER | `openssl rand -hex 32` で別途生成するエージェント用パスワード保護シークレット |
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

mainへのマージ後、GitHub Actionsがビルド、追加テーブルの移行、Cloudflare Pagesへの公開を順に実行する。移行に失敗した場合は公開を停止する。
既存の `CLOUDFLARE_API_TOKEN` と `CLOUDFLARE_ACCOUNT_ID` を使用する。APIトークンにはPages編集権限と対象D1データベースの編集権限が必要。
手動で公開する場合は、アプリのデプロイ前に以下を実行する。既存テーブルは変更しない。

```sh
npx wrangler d1 execute grocery-list-db --remote --file=migrate_google_auth.sql
npx wrangler d1 execute grocery-list-db --remote --file=migrate_agent_accounts.sql
```

設定後にアプリをデプロイする。Googleでの実ログイン・ログアウト、リスト操作、添付表示を確認する。
新規Googleアカウントでは空のリスト一覧になる。既存の共有コードからの参加も可能。

## Muse用のID・パスワード

1. GoogleまたはTelegramで本人としてログインする。
2. 画面上部の「エージェント設定」を開く。
3. 名前（例 `Muse`）、ログインID（例 `muse-shopping`）、対象リスト、権限、有効期限を指定する。
4. 発行時に表示されるIDと自動生成パスワードをMuseのログイン情報として保存する。
5. MuseでアプリのURLを開き、ログイン画面のID・パスワード欄からログインする。

ログインIDは英数字・ピリオド・ハイフン・アンダースコアの3〜64文字。大文字・小文字は区別せず、アプリ全体で一意。
パスワードは暗号学的乱数から生成する192ビットの値で、発行時だけ表示する。平文パスワードは保存しない。
忘れた場合はアカウントを失効させ、新しいログインIDで再発行する。

対象リストは1〜20件、有効期限は1〜90日（初期値30日）。ログインCookieは最大30日で、アカウントの期限も超えない。
アカウントを失効すると既存のログインCookieも次のリクエストから使用できなくなる。
リストから発行者が退出した場合、そのリストへのアクセスも停止する。

| 権限 | 操作 |
| --- | --- |
| 閲覧のみ | 指定リスト・商品・添付の閲覧 |
| 閲覧・商品の追加と更新 | 上記に加え、商品の追加・名前・数量・メモ・カテゴリ・購入済み状態の更新 |

どちらの権限でも、商品・リスト削除、リスト参加・共有コード取得、メンバー操作、個人のお気に入り、アカウント管理、ファイル追加、AI一括処理は許可しない。
画面もこれらの制限に合わせて表示する。操作履歴の `details.agent` にアカウントIDと名前を記録する。

パスワードは個別ソルトとPBKDF2-HMAC-SHA256（100,000回）、別シークレットのHMACによるpepperで保護する。
`AGENT_PASSWORD_PEPPER` はDBに保存しない。この値を変更すると既存パスワードではログインできなくなるため、アカウントの失効・再発行が必要。
`SESSION_SECRET` または既存の `TELEGRAM_BOT_TOKEN` も、セッション署名用に32文字以上の値を必要とする。

ログイン試行は15分間で同一IP・ログインIDの組合せごとに10回、同一IP全体で50回までに制限する。
失敗理由はIDの不存在・パスワード誤り・期限切れ・失効を区別せず返す。
GoogleおよびTelegramの通常ログインは従来どおり利用できる。

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

## 検証

`npm test` で検証する。SQLを実行するAPI統合テストはNode.js 22.13以上の組み込みSQLiteを使用する。

- https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
