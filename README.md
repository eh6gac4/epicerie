# épicerie

Telegram Mini App認証と、Telegramから発行するID・パスワードに対応した買い物リスト。Museなどのブラウザ操作エージェントはWebログイン画面でID・パスワードを入力する。

## 本番設定

Cloudflare Pagesの本番環境に以下を設定する。

| 変数 | 値 |
| --- | --- |
| APP_ORIGIN | `https://grocery-list-9m8.pages.dev` |
| TELEGRAM_BOT_TOKEN | 登録済みTelegram Mini Appのボットトークン |
| SESSION_SECRET | `openssl rand -hex 32` で生成する32文字以上の秘密値 |
| AGENT_PASSWORD_PEPPER | 上記とは別に生成する32文字以上のパスワード保護シークレット |
| SHARED_DATA_MODE | `true` で登録済み利用者の買い物データを共通化 |
| GEMINI_API_KEY | 画像・カテゴリ分類用キー |

シークレットをブラウザ用の `VITE_` 変数に設定しない。
Google認証の設定は不要。以前のGoogle用シークレットも使用しない。

## Telegram認証の継続

既存の `TELEGRAM_BOT_TOKEN` を保持する。Telegram内ではボットの署名付き起動データで本人を確認する。
Telegram起動時は署名付きの起動データをサーバーで確認し、従来と同じユーザーIDのHttpOnly Cookieを発行する。
起動データは24時間以内のものを受け付ける。発行済みのセッションは30日間有効。
以前のローカルストレージのセッションも初回起動時にCookieへ交換する。
旧クライアント用の `/api/auth/session` と認証ヘッダー・添付用クエリも引き続き受け付ける。
ログアウト後、Telegram内でアプリを開き直すと再認証する。
ブラウザ用セッションには `SESSION_SECRET` を設定する。未設定時はTelegram Cookieの署名にボットトークンを使用する。
署名用の値を変更すると既存Cookieは無効になり、再ログインが必要になる。

## デプロイ

mainへのマージ後、GitHub Actionsがビルド、追加テーブルの移行、Cloudflare Pagesへの公開を順に実行する。移行に失敗した場合は公開を停止する。
既存の `CLOUDFLARE_API_TOKEN` と `CLOUDFLARE_ACCOUNT_ID` を使用する。APIトークンにはPages編集権限と対象D1データベースの編集権限が必要。
手動で公開する場合は、アプリのデプロイ前に以下を実行する。既存テーブルは変更しない。

```sh
npx wrangler d1 execute grocery-list-db --remote --file=migrate_agent_accounts.sql
npx wrangler d1 execute grocery-list-db --remote --file=migrate_shared_workspace.sql
```

設定後にアプリをデプロイする。TelegramとID・パスワードでのログイン・ログアウト、リスト操作、添付表示を確認する。
共有モードでは登録済みTelegram利用者と発行したアカウントが共通リストを利用する。

## Muse用のID・パスワード

1. 登録済みのTelegramからアプリを開く。
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
Telegram内での通常利用は従来どおり継続できる。

## 共通データと既存データの引き継ぎ

`SHARED_DATA_MODE=true` の場合、登録済みTelegram利用者と発行したアカウントが同じリスト・商品・お気に入り・アーカイブ状態・Muse用アカウントを使う。
TelegramのユーザーIDは本人識別用に保持し、データの所属先には予約ID `0` を使う。
新しい操作履歴では `details.actor` に本人のプロバイダー・ID・名前を記録する。Muse操作は従来どおり `details.agent` で識別する。

初回移行は以下の順で行う。SQLの `<共有対象のTelegramユーザーID>` は管理者が確認した値に置き換える。

1. `migrate_shared_workspace.sql` を適用して設定テーブルを作成する。共有対象が未登録ならコピーも完了マーカーの作成も行わない。
2. 共有対象の既存Telegram利用者だけを登録する。

```sql
INSERT OR IGNORE INTO shared_telegram_users (tg_user_id)
VALUES (<共有対象のTelegramユーザーID>);
```

3. `migrate_shared_workspace.sql` を再適用する。登録者が所有するリストの共有参加情報とお気に入りをコピーし、既存のMuse用アカウントを共有管理へ移す。
4. 共有リストとお気に入りの件数を確認してから `SHARED_DATA_MODE=true` を設定し、アプリを公開する。

元のリスト所有者、個人用の参加情報・お気に入りは残す。対象外のテストデータはコピーしない。
一方の利用者に表示中のリストは共有側でも表示中とし、全員がアーカイブしていたものは共有側でもアーカイブする。
同名のお気に入りは作成日時が早いものを優先し、共有側には1件だけコピーする。
完了マーカーがある場合は再コピーしないため、共有側で削除したお気に入りやアーカイブ状態を再実行で復活させることはない。
共有側でのリスト削除は、そのリスト本体・商品も削除する通常の操作になる。

共有モードでは、未登録のTelegram利用者を自動で参加させない。追加する場合は `shared_telegram_users` への明示的な登録が必要。
移行完了後に登録者を追加しても、その人の旧データは自動コピーしない。追加のデータ移行は別途行う。
共通化後の新規データは共有用IDに属するため、共有モードを解除しても個人のデータへ自動で分配されない。
既存のGoogle用テーブルを含め、使用しなくなったテーブルの削除は行わない。

## ローカル開発

`.dev.vars.example` を `.dev.vars` にコピーして設定する。

```sh
npm ci
npm run db:init:local
npm run build
npm run dev
```

ブラウザでは `http://localhost:5173` を開く。
ログインセッションはHttpOnly Cookieに最大30日間保存する。

## 仕様の参照


- https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app

## 検証

`npm test` で検証する。SQLを実行するAPI統合テストはNode.js 22.13以上の組み込みSQLiteを使用する。

- https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
