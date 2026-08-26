/* The USER APP entry (docs/template-system-spec.md §8).

   `/post` opens on the template gallery. The gallery owns discovery and future
   formats; the composer only opens after the user has chosen a published
   template. A validated `?template=` query may deep-link back into the canvas. */

import PostFlow from '@/components/post/PostFlow';

export const metadata = {
  title: 'Make a post — The White Orchid',
  description: 'Write your words; the design is already decided.',
};

export default function PostPage() {
  return <PostFlow />;
}
