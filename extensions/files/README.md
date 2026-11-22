Browse and edit existing project text files, with autosave, a Markdown Preview and a plain Source editor.

Files sits after Memory in the top navigation, with the editor in the center and a file tree on the right. On a narrow screen, Browse files switches between the tree and the editor. It always uses the server host's `projectRoot`, never the selected conversation's checkout. Tabs and the current relative path identify the open file; the mobile file-tree toggle sits in the Files toolbar.

Open files in tabs. Markdown has Preview first, then Source: edit the formatted text directly or its raw source. The plain Source editor has no syntax highlighting. Opening a document or switching views never writes a file. After typing pauses for 700 ms, the shared draft is saved automatically; there is no Save button. Ctrl/⌘S flushes a pending edit. Writes continue across file and surface switches; errors or conflicts stop autosaving until an explicit retry or reload. Reload and closing a modified tab ask before discarding its draft. Pending autosave pauses while that decision is open and resumes on cancellation; an in-flight write cannot be discarded. There is no file creation, deletion, rename or agent tool.

Preview uses Tiptap's Markdown editor. An actual rich-text edit may normalize Markdown body formatting; BOM and frontmatter are preserved separately. Documents that cannot be safely rich-edited have a read-only Preview with a notice; Source remains their editor. This fallback uses the runtime's pinned CommonMark/GFM parser and a Files-only renderer. Raw HTML is shown as literal text, never parsed as HTML. Links and image placeholders are inert; chat renderers are not used. Math and MDX are not executed. The rich-edit parser, schema and round-trip checks remain in place. Images are inert placeholders, links do not navigate while editing, and file content is never executed. Rich edits are checked against the Markdown that would be written. An unrepresentable operation (for example a literal newline inside inline code) is refused before application with a visible Source hint, never saved with changed meaning. Plain clipboard lines become paragraphs; clipboard HTML is never parsed.

## Links from chat

Use an explicit Markdown link such as `[Plan](#files/docs/plan%20v2.md)` to open a project file in Files without a new browser tab. Encode each slash-separated path component with `encodeURIComponent` (including literal `%`, `#` and `?` characters). Paths decode once and remain relative to the current server host's project, not the message author's branch checkout. A branch-only file may therefore be missing here.

Following a link activates an existing tab without replacing its draft, or opens a new tab; it preserves Preview/Source and shows the editor on mobile. It never saves merely by opening. Missing or denied files use the usual Files error; malformed percent encoding is shown as an invalid link. External links and conversation links are unchanged. Plain inline paths are not auto-linked. This syntax is handled by chat rendering, not an address-bar/deep-link router.

## Local installation

The versioned source in `.ultimate/user-extensions/files/` is not loaded directly. Ultimate discovers a copy at `~/.ultimate/extensions/files` unless disabled in settings. Project extensions with the same name override it. Keep the installed copy independent of agent worktrees. Tiptap and the inert Preview use the Solid-capable runtime's pinned packages through a local `node_modules` symlink; there is no extension-specific install or lockfile.

From the Ultimate checkout that runs the host, stage and check a full copy before activation:

```sh
export ULTIMATE_CLONE="$PWD"
user_root="$HOME/.ultimate"
mkdir -p "$user_root/extensions"
stage=$(mktemp -d "$user_root/files-stage.XXXXXX")
cp -R .ultimate/user-extensions/files "$stage/files"
ln -s "$ULTIMATE_CLONE/node_modules" "$stage/files/node_modules"
node scripts/check-extension.ts "$stage/files"
node_modules/.bin/vitest run --config "$stage/files/test/vitest.config.mts"
```

Only after both checks pass, let any draft saves finish, then activate the copy and keep the old version for rollback:

```sh
if [ -d "$user_root/extensions/files" ]; then
  mv "$user_root/extensions/files" "$stage/previous"
fi
mv "$stage/files" "$user_root/extensions/files"
```

The new directory has `web.solid.tsx` only; do not copy it over the old React files or reinstall Streamdown. Reload the UI to use the new facet. To roll back, move the new directory out of `extensions/` and restore `$stage/previous` under its original name. If the runtime moves, update the dependency symlink and `ULTIMATE_CLONE`. The tests use only fixtures, including the read-only Preview's original Streamdown structure and text snapshots.

## User-only actions

All three actions are exported in `userActions`, so agent action calls are refused:

- `list({ path: string })` returns `{ root, path, entries, truncated }`. Use `''` for the root. Entries have `name`, relative `path`, `kind` (`directory`, `file`, or `blocked`) and an optional `reason`.
- `read({ path: string })` returns `{ path, secretText, version, bytes }`.
- `save({ path: string, secretText: string, version: string })` returns `{ status: 'saved', version, bytes }` or `{ status: 'conflict' }`. `version` is the SHA256 content hash from a read or successful save. A conflict never forces an overwrite; reload and review the newer file first.

Only relative slash-separated paths are accepted, without empty, dot or parent components, backslashes, colons or control characters. The server resolves and validates against its own root on each call. Symlinks (including linked directories), hardlinked files and non-regular files are blocked. `.git` and `node_modules` are hidden and unavailable by direct path. Known credential paths are blocked, including `.env` variants (except `.env.example` and `.env.sample`), `.ssh`, `.aws`, `.gnupg`, `.kube`, `.docker`, credential stores, `auth.json`, `secrets.json` and common private-key names/extensions.

## Bounds and saving

Reads and saves accept at most 512 KiB of round-tripping UTF-8, with no NUL or binary control characters (tab, newline and carriage return are allowed). Listings scan at most 1000 directory entries, including hidden entries; `truncated` clearly marks an incomplete listing. Entries in that bounded window are sorted for display.

Own saves are serialized per canonical path across facet reloads. A save writes and syncs a temporary file beside the original, preserves its permission mode, then rechecks the existing file's content hash, identity and mode before an atomic rename. A path missing at that final read is not recreated. The shared atomic-write helper is deliberately not used: it follows links and creates missing directories.

This is **not atomic compare-and-swap against arbitrary external writers**: another writer can change or delete the file between the final check and rename. Concurrent hostile directory replacement can also race path validation; Files is not a filesystem sandbox. Avoid simultaneous external edits or directory moves while saving. Replacement changes the inode; other metadata such as ownership, ACLs and extended attributes is not preserved.

## Privacy

Unsaved drafts stay in memory across surface switches and in this browser tab's session storage across reloads. They do not sync to other tabs or devices and are removed when the tab's browser session ends. If storage is unavailable or full, a warning explains that reload recovery is unavailable; the in-memory draft remains editable. Closing the page with unsaved edits also requests the browser's confirmation. An in-flight or failed save keeps a recovery draft even when the text has been reverted to its old baseline; after reload it is marked unconfirmed until a successful save acknowledgement or discard. Restored drafts do not save merely because Files opened; editing or Resume autosave restarts them.

File bodies travel only under `secretText` in action arguments/results, which the call trace redacts. No bodies go through execution/services, notices, errors or durable documents. Paths, sizes and hashes can appear in the trace. The editor necessarily receives the text in the browser; credential-name blocking is not a secret scanner and cannot identify secrets stored in ordinary source files. User-only actions are a UI boundary, not a sandbox against an agent with filesystem tools. Source and editable Preview update the same tab-local draft and use the same bounded save action.
