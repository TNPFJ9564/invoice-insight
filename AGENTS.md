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

- Inventory backend lives in src/lib/inventory.server.ts (Sheets/Drive via connector gateway, OCR via AI gateway, LINE push) wrapped by server fns in src/lib/inventory.functions.ts; Supabase tables have RLS with no policies and are accessed only via supabaseAdmin in server fns — why: no end-user auth yet, keeps data off the public API.
- Every LINE Flex carousel bubble, including its summary, declares the same size — LINE rejects mixed sizes.
- Header, favicon, and PWA icons derive from the same app logo asset — keeps branding consistent across app entry points.
