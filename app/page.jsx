/* THE FRONT DOOR (client ruling 2026-09-14).

   `/` is the template gallery — the user app. Staff land on brand-approved
   structures, not on a blank prompt.

   The previous landing (the AI brief box that composes a design and hands it to
   the admin studio) is NOT deleted: it moved to `/create`, and `/generate`
   still opens the studio directly. Reverting is a two-file move. */

import PostFlow from '@/components/post/PostFlow';

export const metadata = {
  title: 'Make a post — The White Orchid',
  description: 'Write your words; the design is already decided.',
};

export default function HomePage() {
  return <PostFlow />;
}
