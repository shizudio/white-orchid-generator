/* The USER APP entry (docs/template-system-spec.md §8).

   No gallery in v1 — one template makes a gallery meaningless, so the route
   opens directly on template one's fill surface. When a second template lands,
   the gallery goes HERE (purpose text + slot statement per §6.3 rule 3), not
   inside the composer.                                                        */

import PostComposer from '@/components/post/PostComposer';

export const metadata = {
  title: 'Make a post — The White Orchid',
  description: 'Write your words; the design is already decided.',
};

export default function PostPage() {
  return <PostComposer />;
}
