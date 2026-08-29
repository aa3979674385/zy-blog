import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useForm } from "react-hook-form";
import { useTurnstile } from "@/components/common/turnstile";
import { m } from "@/paraglide/messages";
import type { SubmitFriendLinkInput } from "../friend-links.schema";
import { createSubmitFriendLinkSchema } from "../friend-links.schema";
import { useFriendLinks } from "./use-friend-links";

export function useFriendLinkSubmitForm(defaultEmail?: string) {
  const { submit, isSubmitting } = useFriendLinks();
  const {
    reset: resetTurnstile,
    ensureVerified,
    turnstileProps,
  } = useTurnstile("friend-link");

  const form = useForm<SubmitFriendLinkInput>({
    resolver: standardSchemaResolver(createSubmitFriendLinkSchema(m)),
    defaultValues: {
      contactEmail: defaultEmail || "",
    },
  });

  const handleSubmit = async (data: SubmitFriendLinkInput) => {
    try {
      await submit({ data });
      form.reset({ contactEmail: defaultEmail || "" });
    } catch {
      // Error toast is handled by mutation onSuccess branch / global onError
      // Keep form state intact on error
    } finally {
      resetTurnstile();
    }
  };

  // 弹窗触发模式：提交前先确保人机验证通过（点击提交才弹验证码），通过后再真正提交
  const guardedSubmit = async (data: SubmitFriendLinkInput) => {
    const ok = await ensureVerified();
    if (!ok) return;
    await handleSubmit(data);
  };

  return {
    register: form.register,
    errors: form.formState.errors,
    handleSubmit: form.handleSubmit(guardedSubmit),
    // 弹窗触发模式下提交按钮不再因"未验证"禁用（验证码由点击触发）
    isSubmitting,
    turnstileProps,
  };
}

export type UseFriendLinkSubmitFormReturn = ReturnType<
  typeof useFriendLinkSubmitForm
>;
