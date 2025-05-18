// Cloudflare Workersではファイルシステムにアクセスできないため、
// 開発時はimport.meta.env.DEVで判定し、
// 本番環境では常にGitHubから取得する

export interface Post {
  slug: string;
  title: string;
  date: string;
  tags?: string[];
  content: string;
}

// 開発環境かどうかを判定
const isDev = typeof import.meta.env.DEV !== 'undefined' ? import.meta.env.DEV : false;

export async function getPost(slug: string): Promise<Post | null> {
  if (!isDev) {
    return getPostByGithub(slug);
  } else {
    return getPostByLocal(slug);
  }
}

// 開発環境用のモックデータ
const MOCK_POSTS: Record<string, Post> = {
  'hello-world': {
    slug: 'hello-world',
    title: 'Hello World',
    date: '2025-05-18',
    tags: ['introduction', 'getting-started'],
    content: '# Hello World\n\nThis is a sample blog post content.\n\n## Subheading\n\nMore content here...',
  },
  'second-post': {
    slug: 'second-post',
    title: 'Second Post',
    date: '2025-05-19',
    tags: ['development', 'tutorial'],
    content: '# Second Post\n\nThis is another sample blog post.\n\n## Another Section\n\nWith some more content...',
  },
};

async function getPostByLocal(slug: string): Promise<Post | null> {
  // 開発環境ではモックデータを使用
  return MOCK_POSTS[slug] || null;
}

async function getPostByGithub(slug: string): Promise<Post | null> {
  try {
    const rawURL = `https://raw.githubusercontent.com/r38k/playground-blog/main/contents/posts/${slug}.md`;
    const response = await fetch(rawURL, { 
      headers: { 'Accept': 'text/markdown' } 
    });
    
    if (!response.ok) return null;
    
    const content = await response.text();
    
    // 簡易的なfrontmatterパース
    const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!match) return null;
    
    const frontmatter = match[1].trim();
    const markdownContent = match[2].trim();
    
    // 簡易的にfrontmatterをパース
    const metadata: Record<string, any> = {};
    frontmatter.split('\n').forEach(line => {
      const [key, ...value] = line.split(':');
      if (key && value) {
        metadata[key.trim()] = value.join(':').trim().replace(/^['"](.*)['"]$/, '$1');
      }
    });
    
    return {
      slug,
      title: metadata.title || 'No Title',
      date: metadata.date || new Date().toISOString().split('T')[0],
      tags: metadata.tags ? metadata.tags.split(',').map((t: string) => t.trim()) : [],
      content: markdownContent,
    };
  } catch (error) {
    console.error(`Error fetching post ${slug} from GitHub:`, error);
    return null;
  }
}
