# 家計簿

自分用のシンプルな家計簿PWAアプリ。

## 特徴

- PWA（Progressive Web App）
- iPhoneのSafariでホーム画面に追加してネイティブアプリのように使える
- データはブラウザ内（IndexedDB）に保存、外部サーバー不要
- モノクロデザイン

## 使い方

1. `https://ユーザー名.github.io/kakeibo/` にiPhoneのSafariでアクセス
2. 共有ボタン → 「ホーム画面に追加」
3. ホーム画面のアイコンから起動

## 開発

このリポジトリをローカルにクローンして、`index.html` をブラウザで開くだけで動作確認できます。
Service Workerを試すにはHTTPS環境が必要なので、GitHub Pagesにデプロイして確認します。

## 使用技術

- HTML / CSS / JavaScript（素のまま、ビルドツールなし）
- IndexedDB（データ保存）
- Service Worker（オフライン対応）