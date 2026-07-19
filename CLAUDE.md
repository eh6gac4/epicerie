# Project Rules

## デプロイ時の確認事項 (Deployment Rules)
デプロイ作業（`npm run deploy` 等）を行う際は、必ず前回デプロイ以降のコミット履歴を確認すること。
DBスキーマ変更（テーブル追加等）が含まれている場合は、アプリのデプロイだけでなく、必ず本番データベースに対して以下のコマンド等を用いてマイグレーションを実行すること。

```bash
# 例: D1へのスキーマ適用
npx wrangler d1 execute grocery-list-db --remote --file=schema.sql
```
