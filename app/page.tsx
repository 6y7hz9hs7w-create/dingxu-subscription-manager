import type { Metadata } from "next";
import SubscriptionApp from "./subscription-app";
import Landing from "./landing";
import { chatGPTSignInPath, chatGPTSignOutPath, getChatGPTUser } from "./chatgpt-auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "个人订阅管理",
  description: "把每一份订阅，安排得井然有序。",
};

export default async function Home() {
  const user = await getChatGPTUser();
  if (!user) return <Landing signInPath={chatGPTSignInPath("/")} />;
  return <SubscriptionApp user={user} signInPath={chatGPTSignInPath("/")} signOutPath={chatGPTSignOutPath("/")} />;
}
