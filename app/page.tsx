import type { Metadata } from "next";
import SubscriptionApp from "./subscription-app";
import { chatGPTSignInPath, chatGPTSignOutPath } from "./chatgpt-auth";
import { getCurrentUser, isEmailAuthConfigured } from "./email-auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "个人订阅管理",
  description: "把每一份订阅，安排得井然有序。",
};

export default async function Home() {
  const user = await getCurrentUser();
  const signOutPath = user?.authProvider === "email"
    ? "/api/auth/email/logout"
    : chatGPTSignOutPath("/");
  return <SubscriptionApp
    emailAuthEnabled={isEmailAuthConfigured()}
    user={user}
    signInPath={chatGPTSignInPath("/")}
    signOutPath={signOutPath}
  />;
}
