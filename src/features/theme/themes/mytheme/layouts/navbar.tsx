import { Link, useRouteContext } from "@tanstack/react-router";
import { ChevronDown, Crown, Home, Menu, Search, UserIcon } from "lucide-react";
import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { ThemeToggle } from "@/components/common/theme-toggle";
import { Skeleton } from "@/components/ui/skeleton";
import type { NavOption, UserInfo } from "@/features/theme/contract/layouts";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { LanguageSwitcher } from "./language-switcher";
import { SearchModal } from "./search-modal";

interface NavbarProps {
  navOptions: Array<NavOption>;
  onMenuClick: () => void;
  isLoading?: boolean;
  user?: UserInfo;
  bannerHeightVh: number;
}

const NAVBAR_HEIGHT_REM = 4.5;
const MAIN_OVERLAP_REM = 3.5;

/** 下拉面板里的菜单项统一样式 */
const DROPDOWN_ITEM_CLASS =
  "flex items-center w-full px-4 py-2.5 text-sm font-medium rounded-lg transition-colors text-zinc-700 dark:text-zinc-200 hover:bg-[oklch(0.33_0.035_var(--fuwari-hue))] hover:text-[var(--fuwari-primary)] active:scale-[0.98]";

/** 单个导航菜单项（含二级下拉 / 外链），供正常平铺与「更多」下拉共用 */
function NavItem({ option }: { option: NavOption }) {
  const children = option.children?.length ? option.children : null;
  if (children) {
    return (
      <div className="relative group">
        <Link
          to={option.to ?? "/"}
          search={option.search}
          className="fuwari-expand-animation rounded-lg h-11 font-bold px-5 active:scale-95 flex items-center gap-1 fuwari-text-75 hover:text-(--fuwari-primary)"
          activeProps={{
            className: "!text-[var(--fuwari-primary)]",
          }}
        >
          {option.label}
          <ChevronDown
            size={14}
            strokeWidth={2}
            className="transition-transform group-hover:rotate-180"
          />
        </Link>
        <div className="absolute left-0 top-full pt-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
          <div className="p-2 flex flex-col gap-1 shadow-xl ring-1 ring-black/5 dark:ring-white/10 min-w-[160px] rounded-2xl overflow-hidden bg-white dark:bg-zinc-800 transition-colors">
            {children.map((child) =>
              child.external && child.href ? (
                <a
                  key={child.id}
                  href={child.href}
                  target="_blank"
                  rel="noreferrer"
                  className={DROPDOWN_ITEM_CLASS}
                >
                  {child.label}
                </a>
              ) : (
                <Link
                  key={child.id}
                  to={child.to ?? "/"}
                  search={child.search}
                  className={DROPDOWN_ITEM_CLASS}
                  activeProps={{
                    className:
                      "!bg-[var(--fuwari-btn-regular-bg)] !text-[var(--fuwari-primary)]",
                  }}
                >
                  {child.label}
                </Link>
              ),
            )}
          </div>
        </div>
      </div>
    );
  }
  return option.external && option.href ? (
    <a
      href={option.href}
      target="_blank"
      rel="noreferrer"
      className="fuwari-expand-animation rounded-lg h-11 font-bold px-5 active:scale-95 flex items-center fuwari-text-75 hover:text-(--fuwari-primary)"
    >
      {option.label}
    </a>
  ) : (
    <Link
      to={option.to ?? "/"}
      search={option.search}
      className="fuwari-expand-animation rounded-lg h-11 font-bold px-5 active:scale-95 flex items-center fuwari-text-75 hover:text-(--fuwari-primary)"
      activeProps={{
        className: "!text-[var(--fuwari-primary)]",
      }}
    >
      {option.label}
    </Link>
  );
}

export function Navbar({
  onMenuClick,
  user,
  navOptions,
  isLoading,
  bannerHeightVh,
}: NavbarProps) {
  const { siteConfig } = useRouteContext({ from: "__root__" });
  const [isHidden, setIsHidden] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  // ===== 分类溢出折叠：放不下的分类自动收进「更多」下拉 =====
  const [navOverflow, setNavOverflow] = useState({
    visibleCount: navOptions.length,
    needsMore: false,
  });
  const [moreOpen, setMoreOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const moreBtnRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    let raf = 0;

    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const items = Array.from(
          nav.querySelectorAll<HTMLElement>("[data-nav-item]"),
        );
        const total = items.length;
        if (total === 0) return;

        // 先全部显示菜单项（「更多」按钮保持 React 状态控制，这里不动它——
        // 否则「不折叠」时 needsMore 值不变、React 不会把 hidden 加回来，按钮会一直显示）
        items.forEach((el) => el.classList.remove("hidden"));
        const moreBtn = moreBtnRef.current;

        // 菜单项全部显示后不溢出 → 不需要「更多」（按钮保持隐藏）
        if (nav.scrollWidth <= nav.clientWidth) {
          setNavOverflow({ visibleCount: total, needsMore: false });
          return;
        }

        // 确实溢出：显示「更多」按钮占位，再从最后一个分类开始逐个隐藏直到放得下
        if (moreBtn) moreBtn.classList.remove("hidden");
        let count = total;
        while (count > 0 && nav.scrollWidth > nav.clientWidth) {
          count--;
          items[count]?.classList.add("hidden");
        }
        setNavOverflow({ visibleCount: count, needsMore: count < total });
      });
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(nav);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [navOptions]);

  // 点击「更多」外部时关闭下拉
  useEffect(() => {
    if (!moreOpen) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (
        moreBtnRef.current &&
        !moreBtnRef.current.contains(e.target as Node)
      ) {
        setMoreOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [moreOpen]);

  useEffect(() => {
    const handleScroll = () => {
      // Calculate threshold based on banner height and layout
      const bannerHeightPx = window.innerHeight * (bannerHeightVh / 100);
      const navbarHeightPx = NAVBAR_HEIGHT_REM * 16;
      const mainOverlapPx = MAIN_OVERLAP_REM * 16;
      const extraPaddingPx = 16;

      const threshold =
        bannerHeightPx - navbarHeightPx - mainOverlapPx - extraPaddingPx;
      const scrollTop = window.scrollY || document.documentElement.scrollTop;

      setIsHidden(scrollTop >= threshold);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    // Initial check
    handleScroll();

    return () => window.removeEventListener("scroll", handleScroll);
  }, [bannerHeightVh]);

  const hiddenItems = navOptions.slice(navOverflow.visibleCount);

  return (
    <div
      id="fuwari-navbar-wrapper"
      className={`z-50 sticky top-0 transition-all duration-300 ease-in-out ${
        isHidden
          ? "-translate-y-16 opacity-0 pointer-events-none"
          : "translate-y-0 opacity-100"
      }`}
    >
      <div
        id="fuwari-navbar"
      >
        <div className="fuwari-card-base overflow-visible! rounded-t-none! mx-auto flex items-center px-4 h-18 max-w-(--fuwari-page-width)">
          <Link
            to="/"
            className="fuwari-expand-animation rounded-lg h-13 px-5 font-bold active:scale-95 flex items-center"
          >
            <Home
              size={28}
              strokeWidth={1.5}
              className="text-(--fuwari-primary) mr-2 shrink-0"
            />
            <span className="text-(--fuwari-primary) text-base">
              {siteConfig.title}
            </span>
          </Link>

          {/* 分类菜单：靠左排列；空间不足时自动折叠多余分类到「更多」下拉 */}
          <nav
            ref={navRef}
            className="hidden md:flex items-center gap-1 ml-8 flex-1 min-w-0"
          >
            {navOptions.map((option) => (
              <div key={option.id} data-nav-item className="shrink-0">
                <NavItem option={option} />
              </div>
            ))}

            {/* 更多按钮：有分类被折叠时才出现 */}
            <div
              ref={moreBtnRef}
              data-more-btn
              className={cn("relative shrink-0", !navOverflow.needsMore && "hidden")}
            >
              <button
                type="button"
                onClick={() => setMoreOpen((o) => !o)}
                aria-expanded={moreOpen}
                aria-label="更多分类"
                className="fuwari-expand-animation rounded-lg h-11 font-bold px-4 active:scale-95 flex items-center gap-1 fuwari-text-75 hover:text-(--fuwari-primary)"
              >
                更多
                <ChevronDown
                  size={14}
                  strokeWidth={2}
                  className={cn(
                    "transition-transform",
                    moreOpen && "rotate-180",
                  )}
                />
              </button>

              {moreOpen && hiddenItems.length > 0 && (
                <div className="absolute right-0 top-full pt-2 z-50">
                  <div className="p-2 flex flex-col gap-1 shadow-xl ring-1 ring-black/5 dark:ring-white/10 min-w-[160px] rounded-2xl overflow-hidden bg-white dark:bg-zinc-800 transition-colors">
                    {hiddenItems.map((option) => {
                      const children = option.children?.length
                        ? option.children
                        : null;
                      return (
                        <Fragment key={option.id}>
                          {children ? (
                            <>
                              <span className="px-4 pt-1.5 pb-0.5 text-xs font-medium fuwari-text-50">
                                {option.label}
                              </span>
                              {children.map((child) =>
                                child.external && child.href ? (
                                  <a
                                    key={child.id}
                                    href={child.href}
                                    target="_blank"
                                    rel="noreferrer"
                                    onClick={() => setMoreOpen(false)}
                                    className={DROPDOWN_ITEM_CLASS}
                                  >
                                    {child.label}
                                  </a>
                                ) : (
                                  <Link
                                    key={child.id}
                                    to={child.to ?? "/"}
                                    search={child.search}
                                    onClick={() => setMoreOpen(false)}
                                    className={DROPDOWN_ITEM_CLASS}
                                  >
                                    {child.label}
                                  </Link>
                                ),
                              )}
                            </>
                          ) : option.external && option.href ? (
                            <a
                              key={option.id}
                              href={option.href}
                              target="_blank"
                              rel="noreferrer"
                              onClick={() => setMoreOpen(false)}
                              className={DROPDOWN_ITEM_CLASS}
                            >
                              {option.label}
                            </a>
                          ) : (
                            <Link
                              key={option.id}
                              to={option.to ?? "/"}
                              search={option.search}
                              onClick={() => setMoreOpen(false)}
                              className={DROPDOWN_ITEM_CLASS}
                            >
                              {option.label}
                            </Link>
                          )}
                        </Fragment>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </nav>

          {/* 右侧图标组：固定间距贴右（nav 已 flex-1 占满剩余空间） */}
          <div className="flex items-center gap-1 ml-4">
            {/* 搜索：统一为小放大镜图标按钮（桌面/移动端一致），点击打开搜索弹窗 */}
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="fuwari-expand-animation rounded-lg h-11 w-11 flex items-center justify-center active:scale-90 fuwari-text-75 hover:text-(--fuwari-primary)"
              aria-label={m.nav_search()}
            >
              <Search size={18} strokeWidth={1.25} />
            </button>
            <ThemeToggle className="fuwari-expand-animation rounded-lg h-11 w-11 flex items-center justify-center active:scale-90 fuwari-text-75 hover:text-(--fuwari-primary) p-0! bg-transparent! [&_svg]:w-4.5! [&_svg]:h-4.5! [&_div]:w-auto! [&_div]:h-auto!" />
            <LanguageSwitcher className="hidden fuwari-expand-animation rounded-lg h-11 w-11 flex items-center justify-center active:scale-90 fuwari-text-75 hover:text-(--fuwari-primary) p-0! bg-transparent! [&_svg]:w-4.5! [&_svg]:h-4.5!" />
            {/* 会员中心入口：皇冠图标，点击进入开通会员 / 会员中心 */}
            <Link
              to="/membership"
              aria-label="会员中心"
              title="会员中心"
              className="fuwari-expand-animation rounded-lg h-11 w-11 flex items-center justify-center active:scale-90 fuwari-text-75 hover:text-(--fuwari-primary)"
            >
              <Crown size={18} strokeWidth={1.25} />
            </Link>
            <div className="hidden md:flex items-center">
              {isLoading ? (
                <Skeleton className="w-9 h-9 rounded-lg" />
              ) : user ? (
                <Link
                  to="/membership"
                  className="fuwari-expand-animation rounded-lg h-11 w-11 flex items-center justify-center active:scale-90"
                >
                  {user.image ? (
                    <img
                      src={user.image}
                      alt={user.name}
                      className="w-8 h-8 rounded-md object-cover"
                      style={{ viewTransitionName: "user-avatar" }}
                    />
                  ) : (
                    <div
                      className="w-full h-full bg-(--fuwari-btn-regular-bg) flex items-center justify-center"
                      style={{ viewTransitionName: "user-avatar" }}
                    >
                      <UserIcon
                        size={18}
                        strokeWidth={1.25}
                        className="fuwari-text-50"
                      />
                    </div>
                  )}
                </Link>
              ) : (
                <Link
                  to="/login"
                  className="fuwari-expand-animation rounded-lg h-11 w-11 flex items-center justify-center active:scale-90 fuwari-text-75 hover:text-(--fuwari-primary)"
                  aria-label={m.nav_login()}
                >
                  <UserIcon size={18} strokeWidth={1.25} />
                </Link>
              )}
            </div>
            <button
              className="fuwari-expand-animation rounded-lg w-11 h-11 flex items-center justify-center active:scale-90 md:hidden fuwari-text-75 hover:text-(--fuwari-primary)"
              onClick={onMenuClick}
              aria-label={m.common_open_menu()}
              type="button"
            >
              <Menu size={18} strokeWidth={1.25} />
            </button>
          </div>
        </div>
      </div>

      {/* 搜索弹窗：点击搜索栏弹出，输入后跳转搜索页 */}
      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
