import AppShell from "@/components/shell/AppShell";

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  return <AppShell allowedRoles={["customer"]}>{children}</AppShell>;
}
