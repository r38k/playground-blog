
import { getPost, type Post } from '../../utils/posts';
import type { Route } from './+types/route';


export async function loader({ params }: Route.LoaderArgs): Promise<{ post: Post }> {
  const { slug } = params;
  if (!slug) {
    throw new Response('Not Found', { status: 404 });
  }

  const post = await getPost(slug);
  if (!post) {
    throw new Response('Not Found', { status: 404 });
  }

  return { post };
}

export default function BlogPost({ loaderData }: Route.ComponentProps) {
  const { post } = loaderData;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
     {post.content}
    </div>
  );
}
