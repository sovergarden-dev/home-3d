<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Project rules
- All map/scene state lives in the single zustand store `src/state/appStore.ts`; UI controls only read/write it so a future 3D engine can subscribe without touching UI.
- `SceneViewport` is a client-only placeholder (`#scene-root`); no 3D/WebGL code in this repo yet.
- UI strings come from `src/i18n/{vi,en}.ts` via `useT()`; never hardcode copy in components.
