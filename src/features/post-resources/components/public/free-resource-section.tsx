import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Gift, Loader2, X, Smartphone } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import QRCode from "qrcode";
import { useMobile } from "@/hooks/use-mobile";
import {
  useFreeResourceStatus,
  useAcquireFreeResource,
} from "@/features/post-resources/queries";
import type { PublicResourceView } from "@/features/post-resources/api/post-resources.public.api";

/* ────────────────────────────────
   免费获取区域
   ──────────────────────────────── */

/**
 * 免费获取区域 —— 显示在未解锁资源卡片中。
 *
 * 显示条件（由后端 getFreeResourceStatusFn 控制）：
 *   - 全局总开关 ON
 *   - 文章级开关 ON
 *   两者都开启时才显示，任一关闭则整个区域不渲染。
 *
 * 行为：
 *   - 未登录：点击弹登录提示框
 *   - 已登录 + 有剩余次数：扣减配额，生成中转 token
 *     - PC 端：弹窗显示二维码（扫码后由手机浏览器访问中转路由下载）
 *     - 手机端：直接显示下载链接按钮
 *   - 已登录 + 次数耗尽：按钮禁用 + 提示
 *   - 一次性查看：token 存在组件 state 中，刷新页面后丢失，再次查看需消耗次数
 */
export function FreeResourceSection({
  postId,
  resource,
  displayTitle,
}: {
  postId: number;
  resource: PublicResourceView;
  displayTitle: string;
}) {
  const { data: status, isLoading } = useFreeResourceStatus(postId);
  const acquire = useAcquireFreeResource(postId);
  const isMobile = useMobile();
  const [acquiredUrl, setAcquiredUrl] = useState<string | null>(null);
  const [showQrDialog, setShowQrDialog] = useState(false);
  const [showLoginDialog, setShowLoginDialog] = useState(false);

  // 全局/文章开关关闭时不渲染
  if (!isLoading && !status?.enabled) return null;
  if (isLoading) return null;

  const loggedIn = status?.loggedIn ?? false;
  const remaining = status?.remaining ?? 0;
  const limit = status?.limit ?? 0;
  const quotaExhausted = loggedIn && limit > 0 && remaining <= 0;

  // 点击「免费获取」按钮
  const handleAcquire = async () => {
    // 未登录：弹登录提示
    if (!loggedIn) {
      setShowLoginDialog(true);
      return;
    }

    // 次数耗尽
    if (quotaExhausted) {
      toast.error("今日免费获取次数已耗尽，明日再试");
      return;
    }

    // 已获取过（当前会话内）：直接展示已获取的链接
    if (acquiredUrl) {
      if (isMobile) {
        // 手机端直接打开
        window.open(acquiredUrl, "_blank", "noopener,noreferrer");
      } else {
        setShowQrDialog(true);
      }
      return;
    }

    // 调用 API 获取中转链接
    try {
      const result = await acquire.mutateAsync({
        resourceId: resource.id,
        linkIdx: 0,
        postId,
      });
      const fullUrl = `${window.location.origin}${result.downloadUrl}`;
      setAcquiredUrl(fullUrl);

      if (isMobile) {
        // 手机端直接打开下载链接
        window.open(fullUrl, "_blank", "noopener,noreferrer");
        toast.success("已获取下载链接");
      } else {
        // PC 端弹二维码
        setShowQrDialog(true);
        toast.success("已生成下载二维码");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "获取失败，请稍后重试");
    }
  };

  return (
    <>
      <div className="rounded-lg border border-violet-200 bg-violet-50/50 p-2.5 space-y-2">
        <div className="flex items-center gap-1.5 text-xs text-violet-700">
          <Gift size={12} />
          <span className="font-medium">免费获取</span>
          {loggedIn && limit > 0 && (
            <span className="text-violet-400 ml-auto">
              今日剩余 {remaining}/{limit}
            </span>
          )}
        </div>

        <button
          type="button"
          disabled={quotaExhausted || acquire.isPending}
          onClick={handleAcquire}
          className={`w-full flex items-center justify-center gap-1.5 text-sm font-medium py-2 rounded-lg transition-colors ${
            quotaExhausted
              ? "bg-slate-200 text-slate-400 cursor-not-allowed"
              : "bg-violet-500 hover:bg-violet-600 text-white"
          }`}
        >
          {acquire.isPending ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Gift size={14} />
          )}
          <span>
            {quotaExhausted
              ? "次数已耗尽"
              : acquiredUrl
                ? isMobile
                  ? "点击下载"
                  : "查看二维码"
                : "免费获取链接"}
          </span>
        </button>

        {!loggedIn && (
          <p className="text-[10px] text-violet-400 text-center">
            登录后每日可免费获取
            {limit > 0 ? ` ${limit} ` : " "}
           次
          </p>
        )}
      </div>

      {/* PC 端二维码弹窗 */}
      {showQrDialog && acquiredUrl && (
        <QrCodeDialog
          url={acquiredUrl}
          displayTitle={displayTitle}
          onClose={() => setShowQrDialog(false)}
        />
      )}

      {/* 未登录提示弹窗 */}
      {showLoginDialog && (
        <LoginPromptDialog onClose={() => setShowLoginDialog(false)} />
      )}
    </>
  );
}

/* ────────────────────────────────
   二维码弹窗（PC 端）
   ──────────────────────────────── */
function QrCodeDialog({
  url,
  displayTitle,
  onClose,
}: {
  url: string;
  displayTitle: string;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(
      canvasRef.current,
      url,
      {
        width: 240,
        margin: 2,
        color: { dark: "#1e1b4b", light: "#ffffff" },
      },
      (err) => {
        if (err) setError(true);
      },
    );
  }, [url]);

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-background/90 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-xs bg-background border border-border/30 shadow-xl rounded-xl overflow-hidden">
        {/* Header */}
        <div className="px-5 pt-5 pb-3 flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs font-mono uppercase tracking-widest text-violet-500">
              [免费获取]
            </p>
            <h2 className="text-lg font-serif font-medium text-foreground">
              扫码下载
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 -mr-2 text-muted-foreground/50 hover:text-foreground transition-colors"
          >
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>

        {/* QR Code */}
        <div className="px-5 pb-5 space-y-3">
          <div className="flex flex-col items-center gap-3">
            <div className="p-3 bg-white rounded-lg border border-border/30">
              {error ? (
                <div className="w-[240px] h-[240px] flex items-center justify-center text-sm text-muted-foreground">
                  二维码生成失败
                </div>
              ) : (
                <canvas ref={canvasRef} />
              )}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Smartphone size={12} />
              <span>使用手机扫描二维码下载</span>
            </div>
          </div>

          {/* 提示 */}
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
            <p className="text-[11px] text-amber-700 leading-relaxed">
              <span className="font-medium">注意：</span>
              此二维码有效期 30 分钟，请尽快扫码下载。刷新页面后需重新消耗一次免费次数。
            </p>
          </div>

          {/* 资源标题 */}
          <div className="text-center">
            <p className="text-xs text-muted-foreground truncate">{displayTitle}</p>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ────────────────────────────────
   未登录提示弹窗
   ──────────────────────────────── */
function LoginPromptDialog({ onClose }: { onClose: () => void }) {
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-background/90 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-sm bg-background border border-border/30 shadow-xl rounded-xl overflow-hidden">
        <div className="px-6 pt-6 pb-3 flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs font-mono uppercase tracking-widest text-violet-500">
              [需要登录]
            </p>
            <h2 className="text-xl font-serif font-medium text-foreground">
              登录后免费获取
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 -mr-2 text-muted-foreground/50 hover:text-foreground transition-colors"
          >
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>

        <div className="px-6 pb-6 space-y-4">
          <p className="text-sm text-muted-foreground/80 leading-relaxed">
            免费获取功能需要登录后使用，登录后每日可免费获取下载链接。
          </p>

          <div className="grid grid-cols-2 gap-3">
            <Link
              to="/login"
              onClick={onClose}
              className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-mono uppercase tracking-widest bg-violet-500 hover:bg-violet-600 text-white transition-all"
            >
              登录
            </Link>
            <Link
              to="/register"
              onClick={onClose}
              className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-mono uppercase tracking-widest bg-slate-600 hover:bg-slate-700 text-white transition-all"
            >
              注册
            </Link>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
