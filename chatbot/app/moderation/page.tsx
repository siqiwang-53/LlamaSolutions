"use client";

import Link from "next/link";
import { type ChangeEvent, type FormEvent, useState } from "react";

const POWERSHELL_EXAMPLE = `$headers = @{ Authorization = "Bearer $env:MODERATION_API_KEY" }
$body = @{ input = "Hello, can you help me study?" } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/moderation -Headers $headers -ContentType "application/json" -Body $body`;

export default function ModerationPage() {
  const [input, setInput] = useState("");
  const [categories, setCategories] = useState("");
  const [useModel, setUseModel] = useState(true);
  const [result, setResult] = useState("");
  const [pending, setPending] = useState(false);

  function onInputChange(event: ChangeEvent<HTMLTextAreaElement>) {
    setInput(event.target.value);
  }

  function onCategoriesChange(event: ChangeEvent<HTMLInputElement>) {
    setCategories(event.target.value);
  }

  function onUseModelChange(event: ChangeEvent<HTMLInputElement>) {
    setUseModel(event.target.checked);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setResult("");
    const categoryList = categories
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);

    try {
      const response = await fetch("/api/moderation", {
        body: JSON.stringify({
          input,
          useModel,
          ...(categoryList.length > 0 ? { categories: categoryList } : {}),
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload: unknown = await response.json();
      setResult(JSON.stringify(payload, null, 2));
    } catch (error) {
      setResult(
        error instanceof Error
          ? error.message
          : "The moderation request failed."
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 px-4 py-10">
      <div className="flex flex-col gap-2">
        <Link className="text-muted-foreground text-sm underline" href="/">
          Back to chat
        </Link>
        <h1 className="font-semibold text-2xl">Moderation check</h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          This uses the chatbot&apos;s own rules and, when you leave the model
          on, the same title model as the chat (AI Gateway or local LM Studio).
          A signed-in browser session is enough here. For PowerShell, set
          MODERATION_API_KEY in .env.local and send it as a bearer token. Chat
          messages are checked before they reach the model. Self-harm gets a
          supportive reply instead of a cold block.
        </p>
      </div>

      <form className="flex flex-col gap-3" onSubmit={onSubmit}>
        <label
          className="flex flex-col gap-1 text-sm"
          htmlFor="moderation-input"
        >
          Text to check
          <textarea
            className="min-h-28 rounded-xl border border-border/50 bg-card px-3 py-2 text-sm"
            id="moderation-input"
            onChange={onInputChange}
            placeholder="Type a sentence"
            required
            value={input}
          />
        </label>
        <label
          className="flex flex-col gap-1 text-sm"
          htmlFor="moderation-categories"
        >
          Categories (optional, comma-separated)
          <input
            className="rounded-xl border border-border/50 bg-card px-3 py-2 text-sm"
            id="moderation-categories"
            onChange={onCategoriesChange}
            placeholder="violence/weapons, self-harm"
            value={categories}
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            checked={useModel}
            onChange={onUseModelChange}
            type="checkbox"
          />
          Also ask the language model (falls back to rules if it is down)
        </label>
        <button
          className="w-fit rounded-xl bg-primary px-4 py-2 text-primary-foreground text-sm disabled:opacity-60"
          disabled={pending}
          type="submit"
        >
          {pending ? "Checking..." : "Check text"}
        </button>
      </form>

      {result ? (
        <pre className="overflow-x-auto rounded-xl border border-border/50 bg-muted p-3 text-xs leading-relaxed">
          {result}
        </pre>
      ) : null}

      <details className="text-sm">
        <summary className="cursor-pointer">PowerShell example</summary>
        <pre className="mt-2 overflow-x-auto rounded-xl border border-border/50 bg-muted p-3 text-xs leading-relaxed">
          {POWERSHELL_EXAMPLE}
        </pre>
      </details>
    </main>
  );
}
