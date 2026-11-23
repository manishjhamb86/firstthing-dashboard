// Plain labels for the stock workflow — importable from client components.
export type Purpose = "full_installation" | "demo_installation" | "replacement" | "spare_on_site";
export const PURPOSE_LABEL: Record<Purpose, string> = {
  full_installation: "Full installation",
  demo_installation: "Demo installation",
  replacement: "Replacement of a faulty unit",
  spare_on_site: "Spare kept on site",
};
