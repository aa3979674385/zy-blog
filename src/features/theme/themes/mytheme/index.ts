import "./styles/index.css";
import type { ThemeComponents } from "@/features/theme/contract/components";
import { Toaster } from "./components/toaster";
import { config } from "./config";
import { AuthLayout } from "./layouts/auth-layout";
import { PublicLayout } from "./layouts/public-layout";
import { UserLayout } from "./layouts/user-layout";
import { ForgotPasswordPage } from "./pages/auth/forgot-password";
import { LoginPage } from "./pages/auth/login";
import { RegisterPage } from "./pages/auth/register";
import { ResetPasswordPage } from "./pages/auth/reset-password";
import { VerifyEmailPage } from "./pages/auth/verify-email";
import { FriendLinksPage, FriendLinksPageSkeleton } from "./pages/friend-links";
import { HomePage, HomePageSkeleton } from "./pages/home";
import { PostsPage, PostsPageSkeleton } from "./pages/posts";
import { SearchPage } from "./pages/search";
import { SubmitFriendLinkPage } from "./pages/submit-friend-link";
import { ProfilePage } from "./pages/user/profile";
import { getMythemeThemeStyle } from "./theme-style";

// 注意：PostPage / PostPageSkeleton 刻意【不】从这里导出。
// 文章页是唯一使用 @tiptap/static-renderer + katex + shiki 的重型页面，
// 若被本桶静态 import，首页/列表页等所有引用 theme 的公共代码都会被拖进
// 这棵依赖树（线上实测入口 chunk 1.97MB → 首屏 JS 加载 10+ 秒、导航不可用）。
// 文章页路由已拆为 $slug.lazy.tsx，直接用 "@theme/pages/post" 别名按需引入。

/**
 * Theme: mytheme — implements the full ThemeComponents contract.
 * TypeScript will error at compile time if any required component is missing.
 */
export default {
  config,
  getDocumentStyle: getMythemeThemeStyle,
  HomePage,
  HomePageSkeleton,
  PostsPage,
  PostsPageSkeleton,
  PublicLayout,
  AuthLayout,
  UserLayout,
  FriendLinksPage,
  FriendLinksPageSkeleton,
  SearchPage,
  SubmitFriendLinkPage,
  LoginPage,
  RegisterPage,
  ForgotPasswordPage,
  ResetPasswordPage,
  VerifyEmailPage,
  ProfilePage,
  Toaster,
} satisfies ThemeComponents;
