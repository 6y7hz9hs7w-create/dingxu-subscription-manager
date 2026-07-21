import type { Metadata } from "next";
import SubscriptionApp from "./subscription-app";

export const metadata: Metadata = {
  title: "订阅管理",
  description: "把每一笔订阅，都续在值得的地方。",
};

export default function Home() {
  return <SubscriptionApp />;
}
