# Design System – "Aurora Stock"

This app uses a custom visual identity called **Aurora Stock**:

- **Primary color:** teal/emerald blend (`#0f766e`, `#14b8a6`)
- **Accent color:** soft purple/indigo for highlights (`#4f46e5`, `#8b5cf6`)
- **Background:** layered dark-slate gradient with soft, blurred shapes
- **Cards:** glassy surfaces with subtle borders and inner shadows
- **Corners:** large rounding (`rounded-2xl`) on cards and main containers
- **Icons:** Lucide icons with thin stroke, never oversized
- **Typography:** system font (Inter / SF), medium and semibold for key labels

## Layout Concepts

- Top bar floats over a gradient background.
- Main content sits inside a max-width container with generous padding.
- Cards have:
  - `rounded-2xl`
  - `border border-white/10`
  - `bg-slate-900/60 backdrop-blur-lg`
  - `shadow-[0_18px_45px_rgba(15,23,42,0.65)]`

Example card class:

```tsx
<div className="rounded-2xl border border-white/10 bg-slate-900/60
                backdrop-blur-lg shadow-[0_18px_45px_rgba(15,23,42,0.65)]
                p-6">
  ...
</div>
```

## Stats Cards

- Use gradients for icon backgrounds: `bg-gradient-to-br from-teal-400 to-emerald-500`
- Numbers are large (text-3xl or text-4xl, font-semibold)
- Sublabels are muted (`text-slate-400 text-xs uppercase tracking-wide`).

## Inventory / Dashboard

- Search bars use subtle borders and glow on focus:

```tsx
<Input
  className="bg-slate-900/60 border border-slate-700/70 rounded-xl
             focus-visible:ring-2 focus-visible:ring-teal-500/70
             focus-visible:border-teal-400/60"
/>
```

- Buttons:
  - Primary: `bg-gradient-to-r from-teal-500 to-emerald-400 text-slate-950`
  - Destructive: `bg-rose-600 hover:bg-rose-700`
  - Ghost/secondary: transparent with `hover:bg-slate-800/60`

## Barcode Scanner View

- Use a dark, immersive full-screen-ish dialog on mobile.
- Video element:
  - `className="w-full max-w-md aspect-[3/4] rounded-2xl overflow-hidden bg-black"`
  - Inside, `object-fit: cover` for the video tag.

Add a center guide box:

```html
<div className="absolute inset-0 flex items-center justify-center pointer-events-none">
  <div className="h-40 w-40 border-2 border-teal-400/80 rounded-xl shadow-[0_0_25px_rgba(20,184,166,0.75)]" />
</div>
```

Apply this style systematically to Dashboard, Inventory, Alerts, Temperature, Reports, and Admin pages.
