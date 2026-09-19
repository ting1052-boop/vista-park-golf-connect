import { RemoteAccessClient } from "./remote-access-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function RemoteAccessPage() {
  return <RemoteAccessClient />;
}
