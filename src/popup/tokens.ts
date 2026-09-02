/**
 * Apple-inspired design tokens and semantic style combinations for DSAHub.
 */

export const THEME = {
  // Surface styles
  card: "rounded-2xl border border-white/[0.08] bg-[#161618] p-3.5 shadow-sm backdrop-blur-md transition-all",
  cardSubtle: "rounded-xl border border-white/[0.06] bg-[#1c1c1f]/60 p-2.5",
  cardInteractive: "rounded-2xl border border-white/[0.08] bg-[#161618] p-3.5 hover:border-white/[0.15] hover:bg-[#1a1a1d] transition-all",

  // Text hierarchy
  heading: "text-[11px] font-semibold tracking-wider text-zinc-400 uppercase",
  textPrimary: "text-zinc-100 font-medium",
  textSecondary: "text-zinc-400 text-xs",
  textTertiary: "text-zinc-500 text-[11px]",

  // Buttons
  primaryButton: "flex w-full items-center justify-center gap-2 rounded-xl bg-white px-3.5 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-200 active:scale-[0.98] disabled:opacity-50 cursor-pointer shadow-sm",
  secondaryButton: "flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.1] bg-[#1c1c1f] px-3.5 py-2.5 text-sm font-medium text-zinc-200 transition hover:bg-white/[0.08] hover:text-white active:scale-[0.98] disabled:opacity-50 cursor-pointer",
  ghostButton: "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-200 active:scale-[0.98] cursor-pointer",

  // Inputs
  input: "w-full rounded-xl border border-white/[0.1] bg-[#18181b] px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-white/30 focus:outline-none focus:ring-1 focus:ring-white/20",
  select: "w-full rounded-xl border border-white/[0.1] bg-[#18181b] px-3 py-2 text-sm text-zinc-100 focus:border-white/30 focus:outline-none focus:ring-1 focus:ring-white/20 cursor-pointer",
};
