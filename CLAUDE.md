# Project Rules

## デプロイ時の確認事項 (Deployment Rules)
デプロイ作業（`npm run deploy` 等）を行う際は、必ず前回デプロイ以降のコミット履歴を確認すること。
DBスキーマ変更（テーブル追加等）が含まれている場合は、アプリのデプロイだけでなく、必ず本番データベースに対して以下のコマンド等を用いてマイグレーションを実行すること。

```bash
# 例: D1へのスキーマ適用
npx wrangler d1 execute grocery-list-db --remote --file=schema.sql
```

## 大きいファイルの部分読み

`src/views/ListView.vue`（約 2000 行）は全文読みしない。内訳:

| 行 | 内容 |
|---|---|
| 1–430 | `<template>` |
| 431–1004 | `<script setup>` — state / computed / CRUD 関数（`loadList` `loadItems` `quickAdd` `toggleItem` `incrementQty` 添付ファイル系 `onAttachmentSelected` ほか） |
| 1006–1974 | `<style scoped>`（大半がここ。ロジック変更時は読む必要なし） |

`src/views/HomeView.vue`（約 670 行）も同様に該当セクションだけ `offset`/`limit` で読む。
