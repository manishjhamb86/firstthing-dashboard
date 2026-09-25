/**
 * A printed document's page title, which is also the file name a browser
 * suggests on "Save as PDF" (2026-09-25, user-asked: "PRE-INSTALLATION
 * CONSUMPTION REPORT M3M" rather than "FirsThing"). The report's own name in
 * capitals, then whose it is and, where there is one, the period.
 */
export function reportTitle(name: string, ...parts: Array<string | null | undefined>): string {
  return [name.toUpperCase(), ...parts.filter((p): p is string => !!p && !!p.trim())].join(" ");
}
