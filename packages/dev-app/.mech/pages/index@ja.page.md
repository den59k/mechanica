---
name: Home
meta:
  title: Mechanica — Vue のためのビジュアルブロックエディタ
  description: ビジュアルブロックエディタで Vue サイトを構築。Vite 8、Vue 3.5、Bun。
data:
  head:
    title: Mechanica — Vue のためのビジュアルブロックエディタ
    description: ビジュアルブロックエディタで Vue サイトを構築。Vite 8、Vue 3.5、Bun。
---

::: banner #5807eef5-b60c-457e-b0d4-a07f7facf810
image:
  src: /@mechanica/assets/ChatGPT Image 4 дек. 2025 г., 18_38_04.png
  width: 1024
  height: 1024
  focalX: 0.176
  focalY: 0.684
heading: バナー見出し
caption: 新しいバナーです！
:::

::: landing-hero #hero
eyebrow: Vite 8 · Vue 3.5 · Bun
title: ビジュアルブロックエディタで Vue サイトを構築
primaryLabel: 作り始める
primaryHref: "#get-started"
secondary:
  url: /docs
  title: ドキュメントを読む
  external: false
  openNewTab: true
note: オープンソース · MIT ライセンス
@subtitle
ブロックを本物の Vue コンポーネントとして記述。ブラウザ内のライブエディタでページ上に配置。今日は静的サイトを書き出し、明日はサーバーでレンダリング。
:::

::: logo-strip #logos
label: モダンで高速なツールチェーンの上に構築
items:
  - { name: Vue 3 }
  - { name: Vitest 4 }
  - { name: Vite 8 }
  - { name: Bun }
  - { name: TypeScript }
:::

::: feature-grid #features
anchor: features
eyebrow: Mechanica を選ぶ理由
title: すべてが Vue コンポーネント
items:
  - icon: 🪄
    title: ブラウザ内のライブエディタ
    text: 実際のページ上でドラッグ、ドロップ、ネスト、プロパティ編集を即時プレビュー。
  - icon: 🗂️
    title: スコープ付きデータ
    text: サイト・フォルダ・ページのデータを一度定義し、正しく共有。
  - icon: 🧩
    title: SFC で記述
    text: ブロックは defineBlock を呼ぶ Vue コンポーネント。DSL もロックインもなし。
  - icon: 🧱
    title: スロットとコンテナ
    text: ブロックはネスト可能。カードやセクションの中へレイアウトのように配置。
  - icon: 📦
    title: 静的書き出し
    text: SEO ヘッドテンプレートで全ページを HTML に。SSR は後日。
  - icon: ⚡
    title: Vite 8 + Bun
    text: ソースレベルのコンパイル、文字列操作なし。高速な開発とビルド。
@subtitle
独自のブロック形式はありません。あなたのブロックは本物の SFC — 型付き、テスト可能、そしてあなたのもの。
:::

::: card #f9354ac2-2cf5-45a8-89d5-41c4b93ed40a
title: カードの見出し
::: testimonial #quote
author: Alex Rivera
role: フロントエンドリード、Northwind
avatar: { src: "" }
@quote
CMS テンプレートの絡まりを、ひと晩で Mechanica のブロックに置き換えました。編集者は本物のビジュアルツールを手にし、私たちは普通の Vue コンポーネントを git で管理し続けられます。
:::

::: pricing #pricing
anchor: pricing
eyebrow: 料金
title: 無料で始めて、出荷時に拡張。
subtitle: エディタと静的書き出しはオープンソース。ホスティングレンダリングは近日公開。
plans:
  - name: Open source
    price: $0
    period: 永久
    description: サイトの構築と書き出しに必要なすべて。
    features:
      - { text: ビジュアルブロックエディタ }
      - { text: 静的サイト書き出し }
      - { text: 無制限のページとブロック }
      - { text: MIT ライセンス }
    ctaLabel: 作り始める
    ctaHref: "#get-started"
    featured: false
  - name: Team
    price: $19
    period: / 編集者 / 月
    description: 成長するチームのためのコラボレーションとホスティングレンダリング。
    features:
      - { text: Open source のすべて }
      - { text: ホスティング SSR レンダリング }
      - { text: 共有アセットライブラリ }
      - { text: 権限とレビュー }
    ctaLabel: 無料トライアルを開始
    ctaHref: "#get-started"
    featured: true
  - name: Enterprise
    price: ご相談ください
    period: ""
    description: 大規模組織のためのセキュリティ、SSO、サポート。
    features:
      - { text: Team のすべて }
      - { text: SSO と監査ログ }
      - { text: 優先サポート }
      - { text: オンプレミス対応 }
    ctaLabel: 営業に問い合わせる
    ctaHref: "#"
    featured: false
:::

::: cta-band #cta
anchor: get-started
title: 今日、最初のブロックを出荷しよう
subtitle: リポジトリをクローンし、dev サーバーを起動して、配置を始めましょう。
primaryLabel: 作り始める
primaryHref: "#"
note: bun create mechanica@latest
:::

::: /card

::: fields-demo #bed0813f-f3a8-44a0-806f-dcb59896c7e0
title: チェックボックスとドロップダウン
tone: brand
size: lg
bordered: true
rounded: true
@text
このブロックをエディタで開いてください — Tone と Size のドロップダウンと 2 つのチェックボックスがこのカードのスタイルをライブで変更します。
:::

::: banner #9d80eaae-9a4c-4c85-9571-39cfe96d7494
image: { src: "" }
heading: バナー見出し
caption: ""
:::
