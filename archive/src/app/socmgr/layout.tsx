import AppShell from "@/components/shell/AppShell";

export default function SocmgrLayout({ children }: { children: React.ReactNode }) {
  return <AppShell allowedRoles={["socmgr"]}>{children}</AppShell>;
}
