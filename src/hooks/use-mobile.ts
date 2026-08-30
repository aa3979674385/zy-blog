import { useEffect, useState } from "react";

/**
 * 移动端检测 hook：基于窗口宽度判断是否为移动端。
 * 断点与 Tailwind 的 `lg` 断点（1024px）保持一致：
 *   - 窗口宽度 < 1024 → 移动端（isMobile = true）
 *   - 窗口宽度 >= 1024 → 桌面端（isMobile = false）
 *
 * SSR 安全：初始值默认 false（桌面端），在客户端 mount 后修正。
 */
export function useMobile(breakpoint = 1024): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < breakpoint);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [breakpoint]);

  return isMobile;
}
