# Research: Prompt-First Visual-Generation UX — ChatGPT, Claude Artifacts, and Adjacents

Date: 2026-07-06. Method: web research (WebSearch + WebFetch across 15+ sources: OpenAI
docs/blog, Anthropic help center, NN/g, community teardowns, Midjourney/Canva/Ideogram
docs). Written for the White Orchid Content Studio team; findings filtered for
relevance to a chat-rail + live-canvas + contextual-inspector architecture for
non-technical preschool staff. See docs/ux-architecture.md, docs/design-critique.md,
docs/interaction-audit.md for our current state and known gaps.

Throughout: **OBSERVED** = documented firsthand/official behavior. **INFERENCE** =
my reasoning about why it works or how it'd map to us. Conflicting or unverifiable
claims are flagged as such — no invented UI details.

---

## 1. How ChatGPT does it

### The generation loop
OBSERVED: Image generation is a normal chat turn — no separate mode or panel. The
user's prompt appears as a message, the image renders **inline in the chat stream**
like any other message content (not in a side panel). ChatGPT (GPT-4o "native" image
generation, launched March 2025) generates images autoregressively (token-by-token,
like text) rather than via a separate diffusion call to DALL·E, which is why it can
stream partial output the same way it streams text. [OpenAI: Introducing 4o Image
Generation](https://openai.com/index/introducing-4o-image-generation/); [Wikipedia:
GPT Image](https://en.wikipedia.org/wiki/GPT_Image); [VentureBeat launch
coverage](https://venturebeat.com/ai/insane-openai-introduces-gpt-4o-native-image-generation-and-its-already-wowing-users).

### Loading / progressive reveal — the most distinctive pattern
OBSERVED: The image does not appear as a spinner-then-snap. It reveals **top-to-bottom**,
sharp region growing downward while the rest is still blurred/incomplete, "with the
boundary between the completed and blurry image slowly moving down until the entire
image is revealed." Commentators explicitly compare it to a 1990s dial-up image
loading over a slow connection. [How-To Geek: "ChatGPT's New Image Generation Feels
Like Dial-Up All Over
Again"](https://www.howtogeek.com/chatgpts-new-image-generation-feels-like-dial-up-all-over-again/).

Notably, the author's verdict was **not** "this feels slow" — he called the wait
"quite magical," a deliberate counterpoint to instant-gratification UI, and said
"there's something to be said for having to wait for something good." INFERENCE: the
reveal converts otherwise-dead wait time into a legible, low-anxiety progress signal —
you can see the thing being made, which reframes latency as craft rather than lag.

OBSERVED (API-level confirmation of the mechanism): OpenAI's Images API exposes this
directly as a `partial_images` parameter (0–3) for streaming responses — "you can
stream partial images as the API generates them, providing a more interactive
experience," each partial image delivered as its own streaming event. [OpenAI API
docs: Image
Streaming](https://developers.openai.com/api/reference/resources/images/generation-streaming-events).
This confirms progressive reveal is a first-class, intentional product primitive, not
an accidental side effect.

### Refinement loop — conversational, memory-carrying
OBSERVED: Users continue in plain language — "make the sky more orange," "add a
person on the left," "scale down the UI by about 20%" — and GPT-4o **modifies the
existing image** rather than regenerating from scratch; it "remembers the context, so
every version gets closer to what you want without starting over." [ai2image
guide](https://www.ai2image.com/blog/tutorials/chatgpt-image-generator-guide);
firsthand account: [Xinran Ma, "How I created UI with ChatGPT's new image generator
(4o)"](https://medium.com/design-bootcamp/how-i-created-ui-with-chatgpts-new-image-generator-4o-d52389a5833e).
The prior image and all prior turns stay in the same thread — there's no separate
"session per image" concept; edits are just more messages.

OBSERVED friction (firsthand, same source): precision degrades as complexity rises —
when the user asked for three UI options in one image, ChatGPT "started to struggle
with precision" and text became distorted; generation "sometimes stops halfway";
speed was called "a bit slow." INFERENCE: conversational refinement is trusted for
holistic/stylistic changes but degrades for dense, multi-region, or text-heavy asks —
exactly our poster-with-copy use case, which is a caution flag, not an endorsement.

### Selection editing — "Select tool" (inpainting-by-conversation)
OBSERVED: Introduced as a distinct capability layered on top of pure chat. Workflow:
click the image → **Select tool** → highlight/mask a region (freehand) → type the
change in the same composer ("add a watch to the wrist," "remove this object") →
ChatGPT edits **only that region**, leaving the rest untouched. [datastudios.org
guide](https://www.datastudios.org/post/how-to-use-chatgpt-for-image-creation-generating-and-editing-images-in-late-2025);
[OpenAI community
thread](https://community.openai.com/t/dalle3-inpainting-editing-your-images-with-dall-e/705477).
This was explicitly framed as solving the earlier problem: "if you wanted to fix a
small error, you had to regenerate the whole image" — the fix for the "one bad detail
nukes everything" failure mode.

Precise pixel-level UI chrome of the Select tool (button placement, mask-brush
styling) was **not independently verifiable** from the sources fetched — only the
interaction sequence (click → select → type change → scoped result) is confirmed
across multiple sources.

### Multi-image handling
OBSERVED: Multiple generated images/variants appear in the chat, and the user can
refer back to a specific one across turns ("change the cloth in the second image to
blue"), continuing multi-round editing against a specific prior result. [ai2image
guide](https://www.ai2image.com/blog/tutorials/chatgpt-image-generator-guide). Exact
grid/carousel layout for side-by-side variants was not independently confirmed in the
sources reviewed — treat the *existence* of cross-referencing multiple images as
observed, the *display layout* as unverified.

### Vocabulary taught
OBSERVED/INFERENCE: ChatGPT teaches almost no formal vocabulary — it deliberately
keeps the interaction at the level of plain descriptive language ("make the sky more
orange"), which is exactly why it's approachable to non-designers. The one piece of
structure it does teach is the **generate → refine → select-to-target** ladder: start
broad, describe a change, and if a change is localized, select before describing. NN/g
frames this as part of a general "4 stages" arc (below) that every AI image tool
implicitly teaches users to internalize, whether the tool names it or not. [NN/g: The
4 Stages of AI Image
Generation](https://www.nngroup.com/articles/ai-imagegen-stages/).

### Relevant adjacent research: NN/g's 4-stage experience map
OBSERVED (NN/g, contextual inquiry with 9 expert users): all serious use of AI image
tools passes through **Define → Explore → Refine → Export**.
- **Define**: users hit a blank-page problem; they overcome it via chatbot-assisted
  prompt-writing, past-project reference, or inspiration galleries.
- **Explore**: users generate **20–80 images** per task via prompt repetition or
  variation, often finding a better direction mid-exploration than they started with.
  NN/g recommends: batch-generation shortcuts, side-by-side comparison of iterations,
  and making pivoting easy.
- **Refine**: NN/g calls this **the single biggest pain point** — "lack of user
  control" over targeted changes, unpredictable AI behavior. Recommendation: masking
  tools, region-specific editing, more deterministic refinement, hybrid
  AI+traditional-editing controls.
- **Export**: users leave the tool for finishing touches (Photoshop, upscaling, text
  overlays) — a sign the tool didn't fully close the loop.
[NN/g: The 4 Stages of AI Image
Generation](https://www.nngroup.com/articles/ai-imagegen-stages/); methodology in
[NN/g: Contextual Inquiry of AI Image-Generation
Tools](https://www.nngroup.com/articles/contextual-inquiry-ai-imagegen/).

INFERENCE: this is directly diagnostic for us. Our product is built almost entirely
to shortcut the "Explore" (20-80 images) stage — brand-safe, single, on-brand result
by design — which is a real differentiator for a non-designer, low-tolerance-for-choice
audience. But NN/g's finding that **Refine is where users lose trust** validates that
our inspector/patch-pipeline investment (docs/ux-architecture.md §4) is aimed at the
correct, evidence-backed pain point, not a nice-to-have.

---

## 2. How Claude Artifacts does it

### The two-panel model
OBSERVED: Claude splits the interface into "a dedicated window to the right of the
main chat" — chat stays on the left, the artifact renders in a persistent panel on
the right. Both are visible simultaneously; the artifact is not a modal or an inline
chat bubble. [Claude Help Center: What are artifacts and how do I use
them?](https://support.claude.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them)

### Creation trigger
OBSERVED: Claude auto-creates an artifact when content is "significant and
self-contained, typically over 15 lines" and is "something you're likely to want to
edit, iterate on, or reuse outside the conversation" — documents, code, HTML, SVG,
React components. This is a **heuristic gate**, not a mode the user picks; the model
decides an output has crossed the threshold from "answer" to "artifact." Same source
as above.

### Versioning UX
OBSERVED: A **version selector** sits at the bottom-left of the artifact panel; each
significant edit (by Claude or the user) creates a new version, and the selector lets
you step back through prior versions to compare or revert. [Claude Help
Center](https://support.claude.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them);
corroborated by [Guideflow: How to view version history of an artifact in
Claude.ai](https://www.guideflow.com/tutorial/how-to-view-version-history-of-an-artifact-in-claudeai).
I could not independently verify the exact visual form (a literal "v1/v2" chip vs. a
dropdown/carousel) from primary sources — multiple secondary sources agree on
*location* (bottom-left of the panel) and *behavior* (step through versions,
revert), but not on precise chip styling. Treat "chip" as a reasonable but
unconfirmed visual guess; "bottom-left version stepper that lets you go back" is the
confirmed part.

Separately, for the newer Claude Code / Cowork "published artifacts" (web pages,
distinct from in-chat Artifacts): OBSERVED — "every publish is a new version at the
same link," with full version history and a Share control to choose which version
viewers see; the open page **updates in place** and collaborators "see the update the
moment it's published" — i.e., update-in-place is the default viewer experience, but
the history is fully retained and addressable. [Claude Code Docs:
Artifacts](https://code.claude.com/docs/en/artifacts).

### Update semantics: update-in-place vs. new version
OBSERVED: These are not actually in tension — every edit **is** a new version
(so nothing is silently lost), but the panel's default view **updates in place** to
show the latest version (so the user isn't forced to manually navigate versions just
to see current state). The version selector is the escape hatch for going backward.
Same sources as above.

### In-place / targeted editing (the closest analog to ChatGPT's Select tool)
OBSERVED: For text-heavy artifacts (Markdown documents), users can **highlight the
exact text they want changed**, click **"Edit with Claude,"** and type the request —
Claude edits only the highlighted span, "so you don't have to describe which section
you mean in the chat." [Claude Help
Center](https://support.claude.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them).
For code artifacts, switching to the Code view and highlighting a block offers
**"improve"** (opens a small inline text box for the change request, scoped to that
selection) or **"explain"** (sends the block to chat for a walkthrough). [Tom's
Guide: "Claude Artifacts get a big update — now you can highlight and edit code with
text"](https://www.tomsguide.com/ai/claude-artifacts-get-a-big-update-now-you-can-highlight-and-edit-code-with-text);
[Hyperdev: "Claude.AI's quiet revolution in artifact
editing"](https://hyperdev.matsuoka.com/p/claudeais-quiet-revolution-in-artifact).

INFERENCE: this is functionally identical in spirit to ChatGPT's image Select tool —
**select a region of the output, describe the change, get a scoped edit** — just
applied to text/code instead of pixels. Both products converged independently on
"select-then-describe" as the answer to NN/g's "Refine stage lacks control" problem.
One technical note worth carrying: a Medium deep-dive on Claude's implementation
argues the speed of these scoped edits comes from a "replace this span" diff
mechanism rather than regenerating the whole artifact — i.e., scoped edits are also
an engineering speed win, not just a UX one. [Medium: "Replace Is All You Need... the
technique behind Claude's lightning-fast artifact
changes"](https://medium.com/@rquintino/replace-is-all-you-need-the-surprisingly-simple-technique-behind-claudes-new-lightning-fast-b5ae18c3c113)
— flagged as a single secondary source, not confirmed by Anthropic directly.

### Code/preview toggle
OBSERVED: The artifact panel has a persistent way to flip between the rendered
preview and the underlying code/source, plus copy-to-clipboard and download, in the
"lower right corner" of the panel. [Claude Help
Center](https://support.claude.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them).

### How chat references the artifact
OBSERVED: Chat and artifact share conversational memory but are decoupled from raw
edits — "your edits won't change Claude's memory of the original content." When
multiple artifacts exist in one conversation, the user must specify which one they
mean for an update (no implicit "the current one" assumption once there's ambiguity).
Users can also edit a **prior chat message** to fork the conversation, which produces
a different version of the conversation with its own separate set of artifacts — a
branch, not an overwrite. Same source.

---

## 3. Patterns worth stealing for us

Ranked by leverage against our specific gaps (perceived speed, iteration loops,
first-run teaching, selection/refinement UX, mobile), each mapped onto our actual
surfaces (chat rail / canvas / inspector / strip / sessions).

### 1. Progressive top-down reveal instead of spinner-then-snap
**Why it fits:** design-critique.md #6 already flags perceived speed as a likely gap
("spinner then a finished block... canvas jumps to its new state in one snap").
ChatGPT's dial-up reveal is the single most concrete, provably-effective answer to
exactly this — and importantly, users *liked* the wait once they could watch it
happen (How-To Geek). For preschool staff who may not know if the tool is "stuck,"
a visibly-progressing render is more reassuring than a fast-but-opaque one.
**Mapping:** During "Composing your design…" (interaction-audit.md M5), render the
canvas progressively as regions resolve — photo placeholder resolves first (or
top-down like ChatGPT), then text layers settle in, rather than one snap-to-final.
This also directly satisfies design-critique.md's ask for staged loading ("writing
the copy… finding a photo… composing…") by making the stages *visually* legible on
the canvas itself, not just a caption under a spinner.

### 2. Select-then-describe for targeted edits (ChatGPT's Select tool / Claude's "Edit with Claude")
**Why it fits:** NN/g's research says "Refine" is the universal pain point because
users lack a way to say "just this part" without re-describing the whole scene in
words they may not have (our own vocabulary-free constraint, ux-architecture.md §3).
Both best-in-class products converged on the same fix independently — that's a
strong signal.
**Mapping:** We already have this in spirit — click-to-edit selects an element and
opens the contextual inspector — but it's element-scoped (logo, headline, photo),
not free-region-scoped. INFERENCE: for the photo specifically (the highest-value
target, per ChatGPT's "add a watch to the wrist" use case), consider letting a
selected photo accept a chat instruction that's understood as **scoped to that
photo** without re-describing the whole post ("make the background greener" while
the photo is selected → patch targets only the image, not the caption). This is
mostly an intent-parsing/context win, layered on the inspector selection we already
have — low net-new surface.

### 3. Conversational memory that "gets closer each time" without restarting
**Why it fits:** Our chat is already one continuous conversation per session
(ux-architecture.md §2.1, §2.7) — this is the same principle ChatGPT uses ("every
version gets closer... without starting over"). Worth stating explicitly as a design
invariant to protect: never force a "start over" moment inside a session; every
refinement should read as delta from where you are, matching Claude's "your edits
won't change Claude's memory of the original" model (edits are additive, not resets).
**Mapping:** Already largely true architecturally (single patch pipeline,
docs/ux-architecture.md §4) — this is a "protect, don't build" recommendation.

### 4. Version stepper for the session, à la Artifacts' version selector
**Why it fits:** Sessions already auto-save continuously (ux-architecture.md §2.7).
Right now undo/redo is the only way back, which is linear and forgets named
"good" checkpoints. Artifacts' version selector gives users confidence to
experiment (NN/g's Explore-stage recommendation: "make it easy to pivot") because
going backward is never scary.
**Mapping:** Add a lightweight version stepper near the canvas (not the top bar —
design-critique.md #1 wants the top bar quieter) — small dots or a "back to a
previous version" affordance distinct from step-by-step undo, so a user can jump to
"the one from 2 minutes ago before I said 'make it warmer'" without replaying every
intermediate undo step. Effort note: this is additive to the undo system already
planned (ux-architecture.md §2.7), not a replacement.

### 5. Exploration is pre-solved for us — say so, visibly
**Why it fits:** NN/g found users generate 20–80 images per task elsewhere (Explore
stage) and Canva's Magic Design deliberately returns 8–12 layout variants precisely
because "options later in the set are often stronger than the first result." Our
product's whole premise is skipping that grind via brand-lock + a single strong
result. That's not a gap to fix — it's a differentiator to teach.
**Mapping:** In first-run teaching (design-critique.md #2, the rotating empty-state
suggestions), consider one suggestion/hint that names this directly, e.g. framing
around "we start you at a good first draft, not 50 options" — turns an
absence-of-choice into a stated benefit rather than something a ChatGPT/Canva-trained
user might silently wonder about ("wait, don't I get options?").

### 6. Scoped, deterministic edits build trust faster than "just describe it again"
**Why it fits:** NN/g explicitly names "lack of user control" and "unpredictable AI
behavior" as the Refine-stage trust killer. Our honesty check (verifying claims
against the render) is already a stronger trust mechanism than either ChatGPT or
Claude ships — but it's a *post-hoc* check. The select-then-describe pattern is a
*pre-hoc* one (constrain the blast radius before generating).
**Mapping:** Frame the inspector's "same patch pipeline" architecture explicitly as a
trust feature in onboarding copy, not just an engineering decision: "editing here
only touches what's selected" is a promise ChatGPT/Claude users have learned to want
and don't always get.

### 7. Canva's brand-kit-conditioned multi-layout generation (adjacent, not primary)
**Why it fits:** Canva's Magic Design generates layouts already conditioned on the
user's locked brand kit (logo, hex colors, fonts) — the same on-brand-by-default
principle we already hold as a design law. [Canva Help: Use Magic Design to generate
design
templates](https://www.canva.com/help/use-magic-design/); [sawankr.com Magic Studio
guide](https://sawankr.com/courses/canva/canva-ai-features-2026-magic-studio-guide).
**Mapping:** Validates (does not require new work on) our "everything on-brand
automatically" premise — cite as external validation that brand-locked generation is
a mainstream-legible mental model for a Canva-literate audience (many preschool staff
likely have used Canva), which lowers first-run teaching burden for us.

---

## 4. Anti-patterns to avoid

1. **Free-floating multi-image grids with no default pick.** ChatGPT/Midjourney-style
   "here are 4, pick one" workflows reintroduce the exact decision fatigue our
   architecture is built to remove for a non-designer, time-poor audience. Do not
   add "generate variations" as a default behavior — if offered at all, it should be
   an explicit escape hatch ("try another layout" chip, already planned per
   ux-architecture.md §2.1), never the default response shape.

2. **Midjourney's manual-mask "Vary Region" with tuning guidance ("select 20–50% of
   the image for best results").** This is a power-user precision tool that assumes
   users already understand how much context a diffusion model needs — the opposite
   of vocabulary-free design. Wrong control surface for our audience; if we ever add
   free-region selection, it must be invisible-tuning (the system infers sensible
   scope), never a user-facing "select more area for better results" instruction.

3. **ChatGPT's precision collapse under dense/text-heavy multi-region asks** (the
   firsthand report of "three options in one image" causing garbled text). Our
   product is text-and-brand-heavy by nature (headlines, captions, dates, buttons) —
   this is a direct warning that a single monolithic "regenerate the whole poster"
   response to a complex request is exactly where trust breaks. Reinforces: prefer
   our existing patch-based, per-element architecture over any temptation to add a
   "just regenerate the whole thing" quick action as a primary path.

4. **Claude's "which artifact do you mean?" disambiguation cost.** Fine for a
   power-user coding tool, actively bad for our "one session = one post" model — never
   let ambiguity about *which design* the chat is editing become the user's problem.
   Our one-session-one-post rule already prevents this class of bug entirely; treat
   it as a hard non-goal to keep, not just an accident of scope.

5. **"Magical wait" framing risks reading as slow, not charming, without the novelty.**
   How-To Geek's positive read of the dial-up reveal depended partly on novelty and
   audience (tech enthusiasts). Preschool staff under time pressure (posting before
   pickup, etc.) may read the same top-down reveal as simply slow if it's not paired
   with the staged-progress language design-critique.md #6 already calls for
   ("writing the copy… finding a photo… composing…"). Do not ship progressive reveal
   as a pure visual effect without the accompanying staged-copy — the two reinforce
   each other; the visual alone risks the opposite read for our audience.

6. **Ideogram's structured JSON / bounding-box prompting.** A powerful precision tool
   for power users, but a direct violation of "vocabulary-free" and "no design words
   needed" (interaction-audit.md, already praised as exemplary for our + Add
   gallery). Do not let any future "advanced mode" for power staff bleed this kind of
   syntax into the primary chat composer.

---

## 5. Top 5 recommendations

1. **Progressive canvas reveal during generation, staged and top-down-ish, paired
   with staged status copy.** Directly answers design-critique.md #6 (perceived
   speed) and interaction-audit.md M5 (single static loading line) with a pattern
   proven to convert wait time into perceived craft (ChatGPT/How-To Geek). Expected
   impact: reduces abandonment risk on the 10–30s generation step; makes "thinking
   then doing" visible rather than asserted. Effort: **M** — needs render pipeline to
   expose incremental layer-resolve events, plus copy/timing work already
   contemplated in D2.

2. **A lightweight session version-stepper distinct from linear undo, near the
   canvas.** Answers Artifacts' proven pattern for fearless iteration and NN/g's
   Explore-stage ask ("make it easy to pivot"). Expected impact: increases
   willingness to try bold chat requests ("make it warmer") since backing out of a
   bad direction is one click, not N undos. Effort: **S–M** — sessions already
   auto-save continuously (ux-architecture.md §2.7); this is mostly a UI + checkpoint
   -selection layer on existing state.

3. **Scope photo/element edits to the current selection when chat is used while an
   element is selected** (our version of Select-tool / Edit-with-Claude). Answers
   NN/g's single biggest named pain point (Refine-stage control) using our existing
   inspector-selection mechanism rather than a new masking UI. Expected impact:
   fewer "it changed something I didn't ask about" moments, which is the exact
   trust-breaking failure NN/g documents. Effort: **M** — primarily intent-parsing
   (bias the AI's patch target toward the current selection when one exists), no new
   surface.

4. **Name our "no-explore-grind" premise explicitly in first-run teaching.** Turns an
   architectural choice (single strong on-brand result, no 20-option grid) into a
   stated benefit instead of a silent gap versus Canva/ChatGPT-trained expectations.
   Expected impact: preempts "wait, is this all I get?" confusion for
   Canva-literate staff; cheap, high-leverage copy work riding on the rotating
   empty-state suggestions already planned (design-critique.md #2). Effort: **S**.

5. **Protect "one continuous conversation, edits are additive" as a named invariant**
   in any future spec work — explicitly modeled on ChatGPT's "gets closer each
   time, never restarts" and Claude's "edits don't erase original memory." Not new
   build; a documentation/guardrail recommendation so future feature work (e.g. the
   version stepper in #2) doesn't accidentally introduce a fork/branch model like
   Claude's "edit a prior message forks the conversation," which would break our
   one-session-one-post simplicity. Expected impact: prevents future regressions:
   avoids reintroducing decision complexity our architecture deliberately removed.
   Effort: **S** (a documentation addition to ux-architecture.md's non-goals, §6).

---

## Sources

- [OpenAI: Introducing 4o Image Generation](https://openai.com/index/introducing-4o-image-generation/)
- [OpenAI API docs: Image generation streaming events (partial_images)](https://developers.openai.com/api/reference/resources/images/generation-streaming-events)
- [OpenAI API docs: Image generation guide](https://developers.openai.com/api/docs/guides/image-generation)
- [VentureBeat: OpenAI introduces GPT-4o native image generation](https://venturebeat.com/ai/insane-openai-introduces-gpt-4o-native-image-generation-and-its-already-wowing-users)
- [Wikipedia: GPT Image](https://en.wikipedia.org/wiki/GPT_Image)
- [How-To Geek: ChatGPT's New Image Generation Feels Like Dial-Up All Over Again](https://www.howtogeek.com/chatgpts-new-image-generation-feels-like-dial-up-all-over-again/)
- [datastudios.org: How to Use ChatGPT for Image Creation (2025)](https://www.datastudios.org/post/how-to-use-chatgpt-for-image-creation-generating-and-editing-images-in-late-2025)
- [ai2image: ChatGPT Image Generator Complete Guide (2026)](https://www.ai2image.com/blog/tutorials/chatgpt-image-generator-guide)
- [OpenAI Community: DALL·E 3 inpainting with ChatGPT](https://community.openai.com/t/dalle3-inpainting-editing-your-images-with-dall-e/705477)
- [Xinran Ma, Medium: How I created UI with ChatGPT's new image generator (4o)](https://medium.com/design-bootcamp/how-i-created-ui-with-chatgpts-new-image-generator-4o-d52389a5833e)
- [NN/g: The 4 Stages of AI Image Generation: An Experience Map](https://www.nngroup.com/articles/ai-imagegen-stages/)
- [NN/g: Contextual Inquiry of AI Image-Generation Tools](https://www.nngroup.com/articles/contextual-inquiry-ai-imagegen/)
- [Claude Help Center: What are artifacts and how do I use them?](https://support.claude.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them)
- [Claude Code Docs: Artifacts](https://code.claude.com/docs/en/artifacts)
- [Guideflow: How to view version history of an artifact in Claude.ai](https://www.guideflow.com/tutorial/how-to-view-version-history-of-an-artifact-in-claudeai)
- [Tom's Guide: Claude Artifacts get a big update — highlight and edit code with text](https://www.tomsguide.com/ai/claude-artifacts-get-a-big-update-now-you-can-highlight-and-edit-code-with-text)
- [Hyperdev: Claude.AI's quiet revolution in artifact editing](https://hyperdev.matsuoka.com/p/claudeais-quiet-revolution-in-artifact)
- [Medium (Rui Quintino): Replace Is All You Need — the technique behind Claude's fast artifact changes](https://medium.com/@rquintino/replace-is-all-you-need-the-surprisingly-simple-technique-behind-claudes-new-lightning-fast-b5ae18c3c113)
- [Midjourney Docs: Editor](https://docs.midjourney.com/hc/en-us/articles/32764383466893-Editor)
- [Midjourney Docs: Vary Region](https://docs.midjourney.com/hc/en-us/articles/32794723105549-Vary-Region)
- [Canva Help: Use Magic Design to generate design templates](https://www.canva.com/help/use-magic-design/)
- [sawankr.com: Canva AI Features 2026 — Magic Studio Guide](https://sawankr.com/courses/canva/canva-ai-features-2026-magic-studio-guide)
- [Ideogram Docs: Prompt Box](https://docs.ideogram.ai/using-ideogram/ui-overview/ui-components/prompt-box)
- [Ideogram Docs: Aspect Ratio and Dimensions](https://docs.ideogram.ai/using-ideogram/generation-settings/aspect-ratio-and-dimensions)

Companion internal docs consulted: docs/ux-architecture.md, docs/design-critique.md,
docs/interaction-audit.md (white-orchid-generator repo).
