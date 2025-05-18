
import { getPost, type Post } from '../../utils/posts';
import type { Route } from '../blog.$slug[.md]/+types/route';

export async function loader({ params }: Route.LoaderArgs): Promise<Response> {
  const { slug } = params;
  if (!slug) {
    throw new Response('Not Found', { status: 404 });
  }

  const post = await getPost(slug);
  if (!post) {
    throw new Response('Not Found', { status: 404 });
  }

  return new Response(post.content, {
    headers: {
        'Content-Type': 'text/markdown'
    }
  });
}
