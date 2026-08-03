import type { Metadata } from "next";
import Landing from "./landing";
import { chatGPTSignInPath, getChatGPTUser } from "./chatgpt-auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "个人订阅管理",
  description: "把每一份订阅，安排得井然有序。",
};

export default async function Home() {
  const user = await getChatGPTUser();
  return <Landing signInPath={user ? "/dashboard" : chatGPTSignInPath("/dashboard")} />;
}
