import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Gift, Loader2, X, Smartphone, QrCode as QrCodeIcon, Key, Copy, Check } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import QRCode from "qrcode";
import { useMobile } from "@/hooks/use-mobile";
import {
  useFreeResourceStatus,
  useAcquireFreeResource,
  useGenerateFreeToken,
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
 *
 * 行为：
 *   - 未登录：点击弹登录提示框
 *   - 已登录 + 有剩余次数：扣减1次配额（按资源算），弹出下载弹窗
 *   - 弹窗内列出所有网盘链接，每条有二维码按钮
 *   - 点某条的二维码按钮才为那一条生成 token（按需生成，不扣配额）
 *   - PC 端：二维码弹窗内展示
 *   - 手机端：直接显示下载链接按钮
 *   - 已登录 + 次数耗尽：按钮禁用 + 提示
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
  const [showDownloadDialog, setShowDownloadDialog] = useState(false);
  const [showLoginDialog, setShowLoginDialog] = useState(false);
  const [acquiredData, setAcquiredData] = useState<{
    resourceId: string;
    extractCode: string | null;
    links: Array<{ idx: number; type: string; password: string | null }>;
  } | null>(null);

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

    // 已获取过（当前会话内）：直接展示弹窗
    if (acquiredData) {
      setShowDownloadDialog(true);
      return;
    }

    // 调用 API 获取资源信息（扣1次配额，返回链接元信息）
    try {
      const result = await acquire.mutateAsync({
        resourceId: resource.id,
        postId,
      });
      setAcquiredData(result);
      setShowDownloadDialog(true);
      toast.success("已获取资源，点击二维码按钮下载");
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
              : acquiredData
                ? "查看下载链接"
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

      {/* 下载弹窗 */}
      {showDownloadDialog && acquiredData && (
        <DownloadDialog
          data={acquiredData}
          postId={postId}
          displayTitle={displayTitle}
          isMobile={isMobile}
          onClose={() => setShowDownloadDialog(false)}
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
   下载弹窗
   ──────────────────────────────── */

/** 网盘图标颜色映射 */
function getPanStyle(type: string): { bg: string; label: string } {
  const t = type.toLowerCase();
  if (t.includes("百度")) return { bg: "#06a7e1", label: "百" };
  if (t.includes("阿里")) return { bg: "#1677ff", label: "阿" };
  if (t.includes("夸克")) return { bg: "#7c3aed", label: "夸" };
  if (t.includes("蓝奏")) return { bg: "#00b894", label: "蓝" };
  if (t.includes("迅雷")) return { bg: "#1a73e8", label: "迅" };
  if (t.includes("123")) return { bg: "#e63946", label: "1" };
  return { bg: "#64748b", label: type.slice(0, 1) || "盘" };
}

function DownloadDialog({
  data,
  postId,
  displayTitle,
  isMobile,
  onClose,
}: {
  data: {
    resourceId: string;
    extractCode: string | null;
    links: Array<{ idx: number; type: string; password: string | null }>;
  };
  postId: number;
  displayTitle: string;
  isMobile: boolean;
  onClose: () => void;
}) {
  // 当前展开二维码的链接 idx，同时只展开一个
  const [activeQrIdx, setActiveQrIdx] = useState<number | null>(null);

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-background/90 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md bg-background border border-border/30 shadow-xl rounded-xl overflow-hidden max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="px-5 pt-5 pb-3 flex items-start justify-between border-b border-border/20">
          <div className="space-y-1 min-w-0">
            <p className="text-xs font-mono uppercase tracking-widest text-violet-500">
              [免费获取]
            </p>
            <h2 className="text-base font-medium text-foreground truncate">
              {displayTitle}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 -mr-2 text-muted-foreground/50 hover:text-foreground transition-colors flex-shrink-0"
          >
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>

        {/* Body - 可滚动 */}
        <div className="overflow-y-auto px-5 py-4 space-y-3">
          {/* 下载列表 */}
          {data.links.map((link) => (
            <DownloadLinkItem
              key={link.idx}
              link={link}
              resourceId={data.resourceId}
              postId={postId}
              isMobile={isMobile}
              isActive={activeQrIdx === link.idx}
              onToggle={() =>
                setActiveQrIdx((cur) =>
                  cur === link.idx ? null : link.idx,
                )
              }
            />
          ))}

          {/* 解压密码 */}
          {data.extractCode && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
              <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 mb-2">
                <Key size={12} />
                <span>解压密码</span>
              </div>
              <div className="font-mono text-sm font-semibold tracking-wider text-foreground bg-background rounded border border-dashed border-amber-300 px-3 py-1.5">
                {data.extractCode}
              </div>
            </div>
          )}

          {/* 底部提示 */}
          <div className="rounded-lg bg-muted/40 px-3 py-2.5 flex items-start gap-2">
            <span className="text-xs text-muted-foreground mt-0.5">💡</span>
            <span className="text-xs text-muted-foreground">
              点击二维码按钮扫码下载，提取码点击即复制。二维码有效期 30 分钟。
            </span>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ────────────────────────────────
   单条下载链接项
   ──────────────────────────────── */

function DownloadLinkItem({
  link,
  resourceId,
  postId,
  isMobile,
  isActive,
  onToggle,
}: {
  link: { idx: number; type: string; password: string | null };
  resourceId: string;
  postId: number;
  isMobile: boolean;
  isActive: boolean;
  onToggle: () => void;
}) {
  const generateToken = useGenerateFreeToken();
  const [tokenUrl, setTokenUrl] = useState<string | null>(null);
  const [tokenTime, setTokenTime] = useState(0); // token 获取时间戳
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const panStyle = getPanStyle(link.type);

  // token 有效期 29 分钟（后端 30 分钟，留 1 分钟余量）
  const TOKEN_TTL = 29 * 60 * 1000;

  // 生成二维码
  const handleGenerateQr = useCallback(async () => {
    // 已有未过期 token：切换显示（由父组件控制互斥）
    if (tokenUrl && Date.now() - tokenTime < TOKEN_TTL) {
      onToggle();
      return;
    }

    // token 已过期，清除旧缓存重新请求
    if (tokenUrl) {
      setTokenUrl(null);
    }

    try {
      const result = await generateToken.mutateAsync({
        resourceId,
        linkIdx: link.idx,
        postId,
      });
      const fullUrl = `${window.location.origin}${result.downloadUrl}`;
      setTokenUrl(fullUrl);
      setTokenTime(Date.now());

      if (isMobile) {
        // 手机端直接打开
        window.open(fullUrl, "_blank", "noopener,noreferrer");
        toast.success("已获取下载链接");
      } else {
        onToggle();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "获取失败");
    }
  }, [tokenUrl, tokenTime, generateToken, resourceId, link.idx, postId, isMobile, onToggle]);

  // 渲染二维码到 canvas
  useEffect(() => {
    if (!isActive || !tokenUrl || !canvasRef.current) return;
    QRCode.toCanvas(
      canvasRef.current,
      tokenUrl,
      {
        width: 200,
        margin: 2,
        color: { dark: "#1e1b4b", light: "#ffffff" },
      },
      (err) => {
        if (err) toast.error("二维码生成失败");
      },
    );
  }, [isActive, tokenUrl]);

  // 复制提取码
  const handleCopyPassword = () => {
    if (!link.password) return;
    navigator.clipboard.writeText(link.password).then(() => {
      setCopied(true);
      toast.success(`已复制提取码：${link.password}`);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="rounded-lg border border-border/40 bg-muted/30 p-3 transition-all hover:border-border/80">
      {/* 主行：网盘图标 + 名称 + 二维码按钮 */}
      <div className="flex items-center gap-2.5">
        <span
          className="w-8 h-8 rounded-md flex items-center justify-center text-xs font-semibold text-white flex-shrink-0"
          style={{ backgroundColor: panStyle.bg }}
        >
          {panStyle.label}
        </span>
        <span className="flex-1 text-sm font-medium text-foreground truncate">
          {link.type}
        </span>
        <button
          type="button"
          onClick={handleGenerateQr}
          disabled={generateToken.isPending}
          className={`w-9 h-9 rounded-md flex items-center justify-center border transition-all flex-shrink-0 ${
            isActive
              ? "bg-violet-500 text-white border-violet-500"
              : "bg-background text-muted-foreground border-border hover:bg-violet-500 hover:text-white hover:border-violet-500"
          }`}
          aria-label="二维码"
        >
          {generateToken.isPending ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <QrCodeIcon size={16} />
          )}
        </button>
      </div>

      {/* 提取码 */}
      {link.password && (
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopyPassword}
            className="text-xs px-2.5 py-1 rounded border border-border bg-background text-muted-foreground hover:bg-foreground hover:text-background transition-all flex items-center gap-1"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            提取码: {link.password}
          </button>
        </div>
      )}

      {/* 二维码展示区（展开时） */}
      {isActive && tokenUrl && !isMobile && (
        <div className="mt-3 pt-3 border-t border-dashed border-border/40 flex flex-col items-center">
          <div className="p-2 bg-white rounded-lg border border-border/30">
            <canvas ref={canvasRef} />
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-2">
            <Smartphone size={12} />
            <span>使用浏览器扫码下载</span>
          </div>
          <p className="text-[10px] text-amber-600 mt-1 text-center max-w-[200px]">
            请勿使用百度网盘等App扫码，需用浏览器扫码后跳转下载
          </p>
        </div>
      )}

      {/* 手机端下载链接 */}
      {tokenUrl && isMobile && (
        <div className="mt-2">
          <a
            href={tokenUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full text-center text-sm font-medium py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white transition-colors"
          >
            点击下载
          </a>
        </div>
      )}
    </div>
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
