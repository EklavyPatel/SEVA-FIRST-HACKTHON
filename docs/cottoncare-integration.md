# Current research extension

The current edition adds SQLite persistence for separately consented research
photos, authenticated researcher annotations/export, and persistent display
settings. Ordinary Gemini checks remain transient. See `research.md` and the root
README for current behavior. The notes below describe the earlier visual refresh;
its original no-persistence and session-only-theme descriptions are historical.

---

# Crop Studio visual refresh

The current frontend builds on the earlier CottonCare integration below. It adds
a forest-green/lime interface, a custom decorative cotton-leaf SVG, responsive
navigation, scroll-aware active links, a session-only light/dark toggle, and reduced
motion support. The right review panel retains the existing result schema and
qualitative uncertainty; it never implies measured numerical confidence.

The illustration is labelled as decorative. Animation indicates an active request,
not measured model progress. No new dependency or live service is required for the
visual refresh. Backend source is unchanged. Build and existing UI/backend checks
pass. Desktop browser checks covered the sample-to-result flow and appearance
switching; mobile viewport verification remains pending.

---

# CottonCare prototype integration

The frontend adapts the supplied `CottonCare-Editable-Source.zip` to the existing
KapasMitra React application. It follows the archive's integration guide: keep the
original API and port the visual layout rather than running the prototype's demo
inference code.

- Dark green navigation, pale leaf colors, asymmetric card corners, left upload
  controls, and a larger right review panel follow the prototype.
- `src/workspace.css` contains the dashboard styling; `src/App.jsx` keeps the
  existing upload, camera, validation, cancellation, consent, and API flow.
- `public/cottoncare/cotton.svg` is copied from the supplied prototype.
- Existing Gujarati/English language support and live/demo separation remain.
- Text export and browser print/PDF are explicit local user actions. Exported
  reports keep demo disclaimers, uncertainty, and expert-review requirements.
- The qualitative uncertainty display has no numerical confidence claim.
- The prototype's browser-only privacy and no-connected-model statements are
  replaced with the actual KapasMitra live Gemini and no-permanent-storage wording.
- No prototype inference script, scenario selector, server, environment file,
  dependency manifest, or database code replaces the existing application.

Checks: `npm run build`, `npm run test:ui`, and `npm test`.
Browser layout checks require a local environment that permits localhost listeners
and launching Chrome. Run `npm run dev`, then `npm run test:e2e` there.
