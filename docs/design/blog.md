# ブログ機能 設計ドキュメント

作成日: 2025-05-15  
更新日: 2025-05-18

---

## 目的

個人サイトに Markdown ベースのブログ機能を追加する。  
記事は GitHub リポジトリの `contents/posts` ディレクトリで管理し、**CI ビルド時** に HTML へ変換して Cloudflare Workers バンドルに同梱する。  
OGP 画像生成、キャッシュ戦略、RSS フィードなどの拡張機能は「TODO」を参照。

## 採用技術 & 前提

- React 18 + React Router v7  
- Vite (Cloudflare Workers target)  
- Tailwind CSS + @tailwindcss/typography  
- remark / rehype で Markdown → 安全な HTML へ変換  
- Cloudflare Workers 1 MiB gzip 制限を考慮  

## 要件

1. ソースは `.md` のみ  
2. ルーティング  
   - `/blog` : 記事一覧  
   - `/blog/:slug` : 個別記事  
   - `/blog/:slug.md` : Markdown 生ファイル配信  
3. 独自 Tailwind スタイルを適用できること  
4. バンドルサイズを 1 MiB 未満に抑制  
5. GitHub の Markdown を CI で取得し静的 HTML へ変換、ランタイムで Markdown パースは行わない

## ディレクトリ構成

```text
contents/
  posts/                 # GitHub 上の Markdown 記事
    hello-world.md

app/
  routes/
    blog/
      index.tsx         # 記事一覧
      $slug/
        index.tsx       # 個別記事
      $slug.md/
        index.tsx       # markdownファイルを直接表示

  components/
    Article.tsx         # HTML 描画
    ...                 # 各種コンポーネント

generated/             # CI で生成されるファイル（git ignore）
  posts/
    hello-world.html

vite.config.ts
docs/design/blog.md
```

## ビルド時データフロー

```mermaid
flowchart TD
  A[posts/*.md on GitHub] -->|CI fetch| B[/workspace/posts/*.md]
  B -->|remark→HTML| C[generated/posts/*.html.ts]
  C --> D[postsVirtualModule]
  D --> E[virtual:posts-list]
  E --> F[React Router v7 build]
  F --> G[Cloudflare Worker]
  F --> H[/blog/:slug.md request]
  H --> I[Fetch GitHub Raw]
```

### 解説

1. GitHub Actions が `actions/checkout` で Markdown を取得。  
2. `scripts/build-posts.ts` で remark + rehype-sanitize + rehype-stringify → HTML 文字列。  
3. HTML 文字列と front-matter を下記フォーマットで書き出し:  

```ts
// generated/posts/hello-world.html.ts
import type { Post } from '../types';
export const post: Post = {
  slug: 'hello-world',
  title: 'Hello World',
  date: '2025-05-15',
  tags: ['intro'],
  html: `...sanitized html...`,
};
export default post;
```

4. Vite プラグイン `postsVirtualModule` が `import.meta.glob` で `*.html.ts` を読み、  
   - front-matterのみ配列 `virtual:posts-list` としてエクスポート  
   - slug ↔ import pathのマップを内部保持  
5. ランタイムで `/blog/:slug` がマッチすると、`lazy()` + dynamic import で該当ファイルを遅延ロード。  

## `/blog/:slug.md` エンドポイント

GitHub Raw URL をフェッチし、そのまま `text/markdown` で返す。  

```ts
// app/routes/blog/raw.ts
export async function onRequest(context: any) {
  const slug = context.params.slug as string;
  const rawURL = `https://raw.githubusercontent.com/<owner>/<repo>/main/posts/${slug}.md`;
  const res = await fetch(rawURL, { headers: { Accept: 'text/plain' } });
  return new Response(res.body, {
    status: res.status,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 's-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
```

## ルーティング実装例

```tsx
// app/routes/blog/$slug.tsx
import { useParams } from 'react-router-dom';
import { Suspense, lazy } from 'react';

export default function BlogArticleRoute() {
  const { slug } = useParams() as { slug: string };
  const Article = lazy(() =>
    import(
      /* @vite-ignore */ `../../../generated/posts/${slug}.html.ts`
    ).then(mod => ({
      default: () => <ArticleComponent post={mod.post} />,
    })),
  );
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <Article />
    </Suspense>
  );
}
```

```tsx
// app/components/Article.tsx
export function ArticleComponent({ post }: { post: Post }) {
  return (
    <article
      className="prose prose-blog mx-auto my-16"
      dangerouslySetInnerHTML={{ __html: post.html }}
    />
  );
}
```

## スタイリング戦略

- `@tailwindcss/typography` の `prose` をベースに、`prose-blog` プラグインで見出しやコードブロックの独自デザインを上書き。  
- 記事個別カスタムは front-matter に `style: hero` などを追加し、`ArticleComponent` 内でクラス付与を切替。

## postsVirtualModule 責務

1. `/generated/posts/*.html.ts` を `import.meta.glob` で遅延 import (eager: false)。  
2. front-matter だけ抽出し `virtual:posts-list` としてエクスポート。  
3. slug→モジュールパス辞書を出力 (内部用)。  

## GitHub Actions ワークフロー概要

```yaml
name: Build & Deploy
on:
  push:
    branches: [main]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run build:posts    # remark 変換 & generated/ 生成
      - run: npm run build         # Vite build
      - run: npx wrangler publish
```

## パフォーマンス・セキュリティ

- 各 HTML はビルド時に `rehype-sanitize` 済み → XSS 耐性  
- Cloudflare Edge Cache TTL: `max-age=0, s-maxage=31536000, stale-while-revalidate`  
- 総バンドル想定サイズ:  
  - アプリ JS ~350 KB (gzip)  
  - 記事 100 本 × 3 KB = 300 KB  
  - 余裕約 350 KB  

## TODO（拡張機能）

- [ ] **OGP 画像自動生成** (Satori)  
- [ ] **全文検索** (Lunr.js 事前インデックス)  
- [ ] **RSS フィード生成** (CI で rss.xml 生成)  
- [ ] **記事数 >500 の場合 KV / R2 へオフロード**

---

ご意見・修正点があれば PR または Issue でフィードバックしてください。