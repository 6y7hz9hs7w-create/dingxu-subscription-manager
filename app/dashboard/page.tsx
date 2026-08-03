import SubscriptionApp from "../subscription-app";
import { chatGPTSignInPath, chatGPTSignOutPath, requireChatGPTUser } from "../chatgpt-auth";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const user = await requireChatGPTUser("/dashboard");
  return (
    <SubscriptionApp
      user={user}
      signInPath={chatGPTSignInPath("/dashboard")}
      signOutPath={chatGPTSignOutPath("/")}
    />
  );
}
