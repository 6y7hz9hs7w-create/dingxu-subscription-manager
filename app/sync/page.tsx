import type { Metadata } from "next";
import WebSync from "./web-sync";

export const metadata: Metadata = {
  title: "绑定微信数据",
  description: "安全绑定订序微信小程序，在网页查看同一份订阅数据。",
};

export default function SyncPage() {
  return <WebSync />;
}
