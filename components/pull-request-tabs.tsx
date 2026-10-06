"use client";

import Link from "next/link";
import type { PullRequestSummary } from "@/lib/domain";

type PullRequestTab = "conversation" | "checks" | "files";

type Props = {
  pr: PullRequestSummary;
  base: string;
  activeTab: PullRequestTab;
  checksCount: number;
};

export function PullRequestTabs({ pr, base, activeTab, checksCount }: Props) {
  const conversationHref = `${base}/pull/${pr.id}`;
  const tabs: { id: PullRequestTab; label: string; href: string }[] = [
    { id: "conversation", label: "Conversation", href: conversationHref },
    { id: "checks", label: `Checks ${checksCount}`, href: `${conversationHref}/checks` },
    { id: "files", label: "Files changed", href: `${conversationHref}/files` },
  ];

  return (
    <>
      <div className="pr-heading">
        <h1>{pr.title} <span className="muted">#{pr.id}</span></h1>
        <div className="muted"><span className={`state-badge ${pr.status === "open" ? "open" : ""}`}>{pr.isDraft ? "Draft" : pr.status}</span> {pr.author} wants to merge <strong>{pr.sourceBranch}</strong> into <strong>{pr.targetBranch}</strong></div>
      </div>
      <nav className="subtabs" aria-label="Pull request sections">
        {tabs.map((tab) => (
          <Link
            key={tab.id}
            className={`subtab ${activeTab === tab.id ? "active" : ""}`}
            href={tab.href}
            aria-current={activeTab === tab.id ? "page" : undefined}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
