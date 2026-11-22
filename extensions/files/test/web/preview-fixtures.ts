export const fixtures = {
  research:
    '1. **`advertising-playbooks`** — evidence contract.\n\n- **First slice:** import provided export, no network.',
  structure:
    '# Heading\n\n> A *quote* with ~~strike~~ and **bold**.\n\n3. Third\n   - Nested\n\n- [x] Complete\n- [ ] Pending\n\n---\n\n| Left | Right |\n| :--- | ---: |\n| One | Two |\n\nFirst line  \nSecond line\n\n```ts\nconst answer = 42\n```\n\n```\nplain literal <tag>\n\nsecond line\n```\n\n| Plain |\n| --- |\n| Cell |\n\n- Loose single paragraph.\n\n- First paragraph.\n\n  Second paragraph.',
  inert:
    'Before <strong data-html-canary>inline words</strong> after.\n\n<script>raw-script-canary()</script>\n\n<img src="https://fixture.invalid/raw.png">\n\n<iframe src="https://fixture.invalid/frame"></iframe>\n\n<div>raw-block-canary</div>\n\n[File](#files/docs/example.md) [Unsafe](javascript:bad) [Reference][ref] https://fixture.invalid/url\n\n![Asset][img] ![](https://fixture.invalid/empty.png)\n\n![Standalone](https://fixture.invalid/standalone.png)\n\n`inline-contribution-canary`\n\n```mermaid\ncode-contribution-canary\n```\n\n[ref]: https://fixture.invalid/ref\n[img]: https://fixture.invalid/img.png',
  footnotes: 'A note[^one] and a citation[^two].\n\n[^one]: First note.\n[^two]: Second **note**.',
}
