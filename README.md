# 符文战场在线模拟器

双人联机 TCG 手动模拟器（Next.js + WebSocket）。

## 开发

```bash
npm install
npm run dev
```

- Web: http://localhost:3000
- Realtime: ws://localhost:8787

## 卡牌库

卡牌数据来自 [playloltcg.com 官方图鉴](https://playloltcg.com/card.html)，通过 API 导入：

```bash
npm run import:cards
```

脚本会：

1. 从 `https://lol-api.playloltcg.com/xcx/card/searchCardCraftWeb` 分页拉取全部卡牌
2. 写入 `data/gamepacks/riftbound/cards.json`（元数据 + CDN 卡图外链）
3. 写入 `data/gamepacks/riftbound/import-meta.json`（导入时间与统计）

卡图使用官方 CDN（`cdn.playloltcg.com`），不下载到本地。仅供个人模拟器使用。

牌组编辑页从完整卡牌库中搜索、筛选后选牌。若 API 有更新，重新运行上述命令即可。

## 牌组

- 列表与编辑：`/decks`
- 数据存储：`data/decks/{uuid}.json`

## 构建

```bash
npm run build
npm run typecheck
```
