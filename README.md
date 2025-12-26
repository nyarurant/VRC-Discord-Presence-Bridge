# VRChat Discord Rich Presence Bridge

[VRChat Discord Status](https://document.necco.xyz/20251111_214934) Rich Presenceに自動同期するNode.jsツール。

## 🎮 機能一覧

- **ワールド情報**: ワールド名・サムネイルをリアルタイム表示
- **インスタンス詳細**: プライバシー(public/friend+/invite)・region・人数/定員
- **Join button**: フレンドがワールドに直接参加可能(条件あり)
- **全状態対応**: オフライン/移動中/プライベート/APIエラー
- **5秒間隔更新**: 軽量ポーリングで安定動作

## 📋 インストール

```bash
npm install axios axios-cookiejar-support tough-cookie discord.js-selfbot-v13
```

## 🔐 認証設定 (必須)

### 1. VRChat認証クッキー取得

```bash
node login.js
```

**実行手順**:
```
maill(=ユーザー名): your@email.com
password: ********
maill OTP: 123456
```

→ `./vrchat_auth_cookie.json` が自動生成されます。

### 2. Discordトークン設定

`config.json` を作成:

```json
{
  "token": "YOUR_DISCORD_USER_TOKEN_HERE"
}
```

**⚠️ Discord User Token取得方法**:
1. Discordブラウザ版で F12 → network → science → authorization のMTから始まる文字列をコピー

## 🚀 起動

```bash
node index.js
```

**正常起動ログ**:
```
Discord selfbot logged in as YourName
✅VRChat api client initialized
✅ VRChat you are id: usr_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

## 📱 表示例

### ワールド参加中
```
Details: World: The Black Cat
State: public | US | 24/40
Large Image: [ワールドサムネ]
Button: [Join World → vrchat.com/home/launch?...]
```

### オフライン時
```
Details: VRChat: offline
State: developer by necco.xyz
Large Image: [カスタム画像]
```


## ⚙️ カスタマイズ

```javascript
// index.js 上部で変更可能
const POLL_INTERVAL = 5000;           // 更新間隔(ms)
const OFFLINE_THUMB_URL = 'https://なんかの画像URL.png';  // オフライン画像
```

## 🔍 インスタンス種別

| タイプ | 識別子 | 表示例 |
|--------|--------|--------|
| public | `~public(...)` | `public \| US \| 12/40` |
| friend+ | `~hidden(...)` | `friends+ \| EU \| 5/40` |
| friend | `~friends(...)` | `friends \| JP \| 8/40` |
| invite+ | `~canRequestInvite` | `invite+ \| US \| 3/8` |
| invite | `~private(...)` | `invite \| JP \| 2\2` |

## 🛠️ トラブルシューティング

| 問題 | 解決方法 |
|------|----------|
| `node login.js 実行して...` | `node login.js` 再実行 |
| `VRChat API Error 401` | VRChatクッキー期限切れ → `login.js` 再実行 |
| Discordステータス更新なし | `config.json` のトークン確認、Discord起動確認 |
| `GET /instances failed` | 自動で `/worlds` API にフォールバック |
| 人数更新されない | 同一インスタンス内は人数変化のみ検知 |

## 📊 更新条件

```
[場所変更] または [人数変化] → Discordステータス更新
          ↓
ワールド情報取得 → Rich Presence反映 (最大5秒遅延)
```

## ⚠️ 注意事項

- **Discordセルフボット**: ToS違反の可能性あり、自己責任で使用
- **VRChatクッキー**: 定期的に `login.js` 再実行が必要
- **レート制限**: `POLL_INTERVAL` を長くして回避
- **プライバシー**: `location: private` はワールド非表示

## 📄 ファイル構成

```
├── index.js          # メインアプリケーション
├── login.js          # VRChat認証ツール
├── config.json       # Discordトークン
├── vrchat_auth_cookie.json  # VRChat認証クッキー (自動生成)
└── package.json
```

## 🔗 関連リンク
- [api.necco.xyz](https://document.necco.xyz/)

## 📄 ライセンス

MIT License

```
developed by necco.xyz
```

***

**最終更新**: 2025/12/26
**最終テスト環境**: Node.js 20.19.6
