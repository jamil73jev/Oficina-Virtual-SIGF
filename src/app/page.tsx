import { redirect } from "next/navigation";
import { defaultLocale } from "@/core/i18n/config";

export default function RootPage() {
  redirect(`/${defaultLocale}`);
}
