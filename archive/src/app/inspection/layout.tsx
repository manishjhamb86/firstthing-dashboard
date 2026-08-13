import AppShell from "@/components/shell/AppShell";

export default function InspectionLayout({ children }: { children: React.ReactNode }) {
  return <AppShell allowedRoles={["inspection"]}>{children}</AppShell>;
}
