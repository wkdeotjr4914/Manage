import {
  LayoutDashboard,
  Network,
  StickyNote,
  Tags,
  FolderKanban,
  Gavel,
  Mail,
  Upload,
  MessageCircle,
  Plug,
  Building2,
  Users,
  type LucideIcon,
} from "lucide-react";

/** Single source of truth for the app's primary navigation. Both the desktop
 * sidebar (Sidebar.tsx) and the mobile drawer (MobileNav.tsx via TopBar.tsx)
 * render from this list so the two can never drift out of sync. */
export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** exact match required for active state (else a prefix match is used) */
  exact?: boolean;
};

export const NAV: NavItem[] = [
  { href: "/", label: "대시보드", icon: LayoutDashboard, exact: true },
  { href: "/graph", label: "지식 그래프", icon: Network },
  { href: "/notes", label: "노트", icon: StickyNote },
  { href: "/tags", label: "태그 · 토픽", icon: Tags },
  { href: "/projects", label: "프로젝트", icon: FolderKanban },
  { href: "/bids", label: "입찰공고", icon: Gavel },
  { href: "/mails", label: "수집 메일", icon: Mail },
  { href: "/import", label: "가져오기", icon: Upload, exact: true },
  { href: "/import/kakao", label: "카카오톡", icon: MessageCircle },
  { href: "/settings/company", label: "회사 프로필", icon: Building2 },
  { href: "/settings/integrations", label: "연동", icon: Plug },
];

export const ADMIN_NAV: NavItem = {
  href: "/admin/users",
  label: "사용자 관리",
  icon: Users,
};

/** The nav list for a given role — admins get the extra 사용자 관리 entry. */
export function navItemsFor(isAdmin: boolean): NavItem[] {
  return isAdmin ? [...NAV, ADMIN_NAV] : NAV;
}

/** Whether `item` matches the current pathname (exact or prefix). */
export function isNavActive(
  item: Pick<NavItem, "href" | "exact">,
  pathname: string,
): boolean {
  return item.exact ? pathname === item.href : pathname.startsWith(item.href);
}
