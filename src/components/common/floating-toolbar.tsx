import {
  ArrowUp,
  Check,
  Code,
  Copy,
  ExternalLink,
  Image as ImageIcon,
  Mail,
  MessageCircle,
  MessageSquare,
  Moon,
  Sun,
  Users,
  X,
  icons,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ComponentType } from "react";
import { useTheme } from "@/components/common/theme-provider";
import type {
  MythemeFloatingToolbarButton,
  MythemeFloatingToolbarConfig,
} from "@/features/config/site-config.schema";
import { cn } from "@/lib/utils";

type ButtonType = MythemeFloatingToolbarButton["type"];

type IconComponent = ComponentType<{
  size?: number | string;
  strokeWidth?: number | string;
}>;

const DEFAULT_ICON: Record<ButtonType, typeof Mail> = {
  qq: MessageCircle,
  qqmail: Mail,
  qqgroup: Users,
  wechat: MessageSquare,
  link: ExternalLink,
  image: ImageIcon,
  html: Code,
};

function ButtonIcon({
  button,
}: {
  button: MythemeFloatingToolbarButton;
}) {
  // 优先使用从图标库选择的图标（iconName）
  if (button.iconName) {
    const Icon = (icons as Record<string, IconComponent>)[button.iconName];
    if (Icon) {
      return <Icon size={22} strokeWidth={1.75} />;
    }
  }
  // 其次使用上传的自定义图片图标
  if (button.icon && button.icon.trim()) {
    return (
      <img
        src={button.icon}
        alt={button.name}
        className="h-6 w-6 rounded object-cover"
        onError={(e) => {
          e.currentTarget.style.display = "none";
        }}
      />
    );
  }
  // 最后回退到类型默认图标
  const Icon = DEFAULT_ICON[button.type] ?? ExternalLink;
  return <Icon size={22} strokeWidth={1.75} />;
}

function getPopoverContent(button: MythemeFloatingToolbarButton) {
  const v = (button.value ?? "").trim();
  const img = (button.image ?? "").trim();
  // 图片：优先取 image 字段；兼容旧的 wechat/image 类型（图片曾存于 value）
  const image =
    img || (button.type === "wechat" || button.type === "image" ? v : "");

  switch (button.type) {
    case "qq":
      return {
        title: v ? `QQ：${v}` : "",
        desc: v ? "点击按钮发起临时会话" : "",
        copy: v,
        image,
      };
    case "qqmail":
      return {
        title: v ? `${v}@qq.com` : "",
        desc: v ? "点击按钮通过邮件客户端发送" : "",
        copy: v ? `${v}@qq.com` : "",
        image,
      };
    case "qqgroup":
      return {
        title: v ? "QQ群" : "",
        desc: v ? "点击按钮打开加群链接" : "",
        copy: v,
        image,
      };
    case "link":
      return {
        title: v,
        desc: v ? "点击按钮在新标签页打开" : "",
        copy: v,
        image,
      };
    case "wechat":
    case "image":
      return { title: v || button.name || "", desc: "", copy: "", image };
    case "html":
      return { title: "", desc: "", copy: "", image: "", html: v };
    default:
      return { title: v, desc: "", copy: v, image };
  }
}

function handleButtonClick(
  button: MythemeFloatingToolbarButton,
  openLightbox: (src: string) => void,
) {
  const v = (button.value ?? "").trim();
  const img = (button.image ?? "").trim() || v;
  switch (button.type) {
    case "qq":
      if (v)
        window.open(
          `https://wpa.qq.com/msgrd?v=3&uin=${encodeURIComponent(v)}&site=qq&menu=yes`,
          "_blank",
        );
      break;
    case "qqmail":
      if (v) window.location.href = `mailto:${v}@qq.com`;
      break;
    case "qqgroup":
    case "link":
      if (v) window.open(v, "_blank");
      break;
    case "wechat":
    case "image":
      if (img) openLightbox(img);
      break;
    default:
      break;
  }
}

export function FloatingToolbar({
  config,
}: {
  config: MythemeFloatingToolbarConfig;
}) {
  const { userTheme, setTheme } = useTheme();
  const [scrolled, setScrolled] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 悬停卡片延迟关闭：鼠标从按钮移到卡片之间有空隙，留 250ms 缓冲，
  // 避免卡片瞬间关闭导致「复制」按钮来不及点。
  const handleHoverEnter = (id: string) => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    setHovered(id);
  };
  const handleHoverLeave = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setHovered(null), 250);
  };

  // 滚动出现模式：向下滚动一段距离后才显示
  useEffect(() => {
    if (config.fixedMode !== "scroll") return;
    const onScroll = () => setScrolled(window.scrollY > window.innerHeight * 0.35);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [config.fixedMode]);

  if (!config.enabled) return null;

  const buttons = [...config.buttons]
    .filter((b) => b.enabled)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const visible =
    config.fixedMode === "fixed" ? true : scrolled;

  const toggleTheme = () =>
    setTheme(userTheme === "dark" ? "light" : "dark");

  const scrollToTop = () =>
    window.scrollTo({ top: 0, behavior: "smooth" });

  const copy = (text: string) => {
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => {},
    );
  };

  return (
    <>
      <div
        className={cn(
          "fixed right-5 bottom-24 z-40 flex flex-col items-end gap-3 transition-all duration-300",
          !config.showOnMobile && "max-sm:hidden",
          visible
            ? "opacity-100 translate-x-0 pointer-events-auto"
            : "opacity-0 translate-x-6 pointer-events-none",
        )}
      >
        {/* 自定义按钮 */}
        {buttons.map((b) => {
          const content = getPopoverContent(b);
          return (
            <div
              key={b.id}
              className="relative"
              onMouseEnter={() => handleHoverEnter(b.id)}
              onMouseLeave={handleHoverLeave}
            >
              {/* 悬停弹出的卡片（位于按钮左侧） */}
              {hovered === b.id && (
                <div
                  className="absolute right-full top-1/2 mr-3 -translate-y-1/2 z-50 w-60 rounded-2xl border border-black/10 bg-white p-3 text-left shadow-xl dark:border-white/10 dark:bg-zinc-800"
                  onMouseEnter={() => handleHoverEnter(b.id)}
                  onMouseLeave={handleHoverLeave}
                >
                  <div className="space-y-2">
                    {content.image ? (
                      <img
                        src={content.image}
                        alt={content.title || "图片"}
                        className="max-h-52 w-full rounded-lg object-contain"
                      />
                    ) : null}
                    {"html" in content && content.html ? (
                      <div
                        className="text-sm text-foreground [&_a]:text-(--fuwari-primary)"
                        dangerouslySetInnerHTML={{ __html: content.html }}
                      />
                    ) : null}
                    {content.title ? (
                      <div className="space-y-1.5">
                        <p className="break-all text-sm font-medium text-foreground">
                          {content.title}
                        </p>
                        {content.desc ? (
                          <p className="text-xs text-muted-foreground">
                            {content.desc}
                          </p>
                        ) : null}
                        {"copy" in content && content.copy ? (
                          <button
                            type="button"
                            onClick={() => copy(content.copy as string)}
                            className="mt-1 flex items-center gap-1.5 text-xs text-(--fuwari-primary) hover:underline"
                          >
                            {copied ? (
                              <Check size={13} />
                            ) : (
                              <Copy size={13} />
                            )}
                            {copied ? "已复制" : "复制"}
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={() => handleButtonClick(b, setLightbox)}
                title={b.name}
                aria-label={b.name}
                className="flex h-12 w-12 items-center justify-center rounded-2xl fuwari-card-base text-(--fuwari-text-90) shadow-md transition-colors hover:bg-(--fuwari-btn-plain-bg-hover) hover:text-(--fuwari-primary)"
              >
                <ButtonIcon button={b} />
              </button>
            </div>
          );
        })}

        {/* 黑白模式切换 */}
        {config.showThemeToggle && (
          <button
            type="button"
            onClick={toggleTheme}
            title={userTheme === "dark" ? "切换到亮色" : "切换到暗色"}
            aria-label="切换明暗主题"
            className="flex h-12 w-12 items-center justify-center rounded-2xl fuwari-card-base text-(--fuwari-text-90) shadow-md transition-colors hover:bg-(--fuwari-btn-plain-bg-hover) hover:text-(--fuwari-primary)"
          >
            {userTheme === "dark" ? (
              <Sun size={22} strokeWidth={1.75} />
            ) : (
              <Moon size={22} strokeWidth={1.75} />
            )}
          </button>
        )}

        {/* 回到顶部 */}
        {config.showBackToTop && (
          <button
            type="button"
            onClick={scrollToTop}
            title="回到顶部"
            aria-label="回到顶部"
            className="flex h-12 w-12 items-center justify-center rounded-2xl fuwari-card-base text-(--fuwari-primary) shadow-md transition-colors hover:bg-(--fuwari-btn-plain-bg-hover)"
          >
            <ArrowUp size={22} strokeWidth={2} />
          </button>
        )}
      </div>

      {/* 图片灯箱 */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-6"
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            className="absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
            onClick={() => setLightbox(null)}
            aria-label="关闭"
          >
            <X size={20} />
          </button>
          <img
            src={lightbox}
            alt=""
            className="max-h-[85vh] max-w-[85vw] rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
