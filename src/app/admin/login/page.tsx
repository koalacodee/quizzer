import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Admin login" };

export default async function LoginPage(props: PageProps<"/admin/login">) {
  const { next } = await props.searchParams;
  return (
    <div className="mx-auto mt-12 max-w-sm">
      <div className="card p-6">
        <h1 className="text-xl font-semibold">Admin login</h1>
        <p className="mt-1 text-sm text-muted">Enter the admin password to manage quizzes.</p>
        <LoginForm next={typeof next === "string" ? next : ""} />
      </div>
    </div>
  );
}
