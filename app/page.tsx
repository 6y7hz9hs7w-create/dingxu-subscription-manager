import type { Metadata } from "next";
import SubscriptionApp from "./subscription-app";
import { chatGPTSignInPath, chatGPTSignOutPath, getChatGPTUser } from "./chatgpt-auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "订阅管理",
  description: "把每一笔订阅，都续在值得的地方。",
};

export default async function Home() {
  const user = await getChatGPTUser();
  return <SubscriptionApp user={user} signInPath={chatGPTSignInPath("/")} signOutPath={chatGPTSignOutPath("/")} />;
}
