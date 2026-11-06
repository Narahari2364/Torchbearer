import { redirect } from "next/navigation";

// The app opens on the company's workflow vault (sign-in first, via the proxy).
export default function Home() {
  redirect("/vault");
}
